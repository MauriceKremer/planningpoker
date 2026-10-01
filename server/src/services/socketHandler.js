const { getSession, updateSessionAtomic, deleteSession, getAllSessions, sanitizeSession, sanitizeCardSet } = require('../services/sessionService');
const logger = require('../utils/logger');
const { validateSocketInput, VALIDATION_RULES, SESSION_ID_PATTERN, USER_ID_PATTERN } = require('../socket/validation');
const { checkRateLimit, cleanupRateLimits } = require('../socket/rateLimiter');
const { trackConnection, untrackConnection, untrackSession, getSocketForUser, getSessionConnections, updateLastSeen, getLastSeen } = require('../socket/connections');
const { transferModeratorRole } = require('../socket/moderator');
const payloads = require('../socket/eventPayloads');
const { applyCleanup } = require('../socket/cleanupPolicy');
const { createVoteOut, castVoteOutVote, pruneVoteOutForRemovedUser, VOTE_OUT_THRESHOLD_PERCENT, VOTE_OUT_TIMEOUT_MS } = require('../socket/voteOut');
const { assertOutgoing, sanitizeAvatar } = require('../protocol/eventSchemas');

const SPECIAL_VOTES = ['☕', '❓'];
const RATE_LIMITED_MESSAGE = 'Too many requests. Please slow down.';
const CONFLICT_MESSAGE = 'Your session has been accessed from another location. You have been disconnected.';
const MODERATOR_DISCONNECT_GRACE_MS = 60 * 1000;

// Vote-out end reasons, keyed by castVoteOutVote / prune outcome.
const VOTE_OUT_CANCELLED = {
  'target-left': 'Vote-out cancelled: target already left',
  impossible: 'Vote-out cancelled: not enough eligible participants left',
};
const VOTE_OUT_ENDED = {
  ...VOTE_OUT_CANCELLED,
  failed: 'Vote-out failed: not enough votes',
  expired: 'Vote-out expired without enough votes',
};

const voteOutCancelledPayload = (session, targetUserId, outcome) =>
  payloads.voteOutEnded(session, targetUserId, false, VOTE_OUT_CANCELLED[outcome]);

/**
 * Own-property user lookup for session.user maps.
 *
 * Deliberately uses `Object.hasOwn` rather than a truthiness check: a
 * `__proto__`-shaped key would otherwise resolve to `Object.prototype`
 * (truthy) and the write that follows would pollute it. Every event already
 * rejects such keys via strict UUID validation; this keeps the mutation
 * paths independently safe (CodeQL js/prototype-polluting-assignment).
 */
const getUser = (session, id) =>
  (Object.hasOwn(session.users, id) ? session.users[id] : null);

// Inactivity countdowns: sessionId → Map<userId, remainingSeconds>
const inactiveCountdowns = new Map();

// sessionId → { userId, timer } for scheduled moderator hand-overs.
const pendingModeratorTransfers = new Map();

const cancelPendingModeratorTransfer = (sessionId, userId = null) => {
  const pending = pendingModeratorTransfers.get(sessionId);
  if (!pending || (userId && pending.userId !== userId)) return;
  clearTimeout(pending.timer);
  pendingModeratorTransfers.delete(sessionId);
};

/**
 * Hand over the moderator role once a departed moderator's grace window
 * elapses. The callback re-validates everything under the atomic update —
 * a rejoin, manual transfer, or deleted session in the meantime is a no-op.
 */
const schedulePendingModeratorTransfer = (io, sessionId, userId, graceMs) => {
  cancelPendingModeratorTransfer(sessionId);
  let handover = null;
  const timer = setTimeout(() => {
    pendingModeratorTransfers.delete(sessionId);
    try {
      const session = updateSessionAtomic(sessionId, (session) => {
        if (session.moderatorId !== userId) return false;
        if (!session.users[userId] || getSocketForUser(sessionId, userId)) return false;
        handover = transferModeratorRole(session, userId, session.users[userId]);
      });
      if (handover) broadcastModeratorChange(io, session, handover);
    } catch { /* session deleted meanwhile */ }
  }, graceMs);
  timer.unref?.(); // never keep the process alive just for a pending hand-over
  pendingModeratorTransfers.set(sessionId, { userId, timer });
};

const broadcastModeratorChange = (io, session, { newModerator, previousModerator }, wasManualTransfer = false) =>
  io.to(session.id).emit('moderator-changed', payloads.moderatorChanged(session, newModerator.id, previousModerator.id, wasManualTransfer));

/** Delete a session and every piece of in-memory state hung off it. */
const dissolveSession = (sessionId) => {
  try { deleteSession(sessionId); } catch { /* already deleted */ }
  cancelPendingModeratorTransfer(sessionId);
  inactiveCountdowns.delete(sessionId);
};

/**
 * Kill a user's previous socket when the same user reconnects elsewhere.
 * Only an actively connected socket is taken over: after an abrupt transport
 * blip the client's reconnect can beat the disconnect handler, and killing
 * the dead tracked socket (with its connection-conflict emit) would eject
 * the user from their own page just for reconnecting.
 */
const preemptStaleSocket = (io, sessionId, userId, newSocketId) => {
  const existingSocketId = getSocketForUser(sessionId, userId);
  if (!existingSocketId || existingSocketId === newSocketId) return;
  const existingSocket = io.sockets.sockets.get(existingSocketId);
  if (existingSocket?.connected) {
    existingSocket.emit('connection-conflict', assertOutgoing('connection-conflict', { message: CONFLICT_MESSAGE }));
    existingSocket.disconnect(true);
  }
  untrackConnection(existingSocketId);
};

const setupSocketEvents = (io, options = {}) => {
  const moderatorDisconnectGraceMs = options.moderatorDisconnectGraceMs ?? MODERATOR_DISCONNECT_GRACE_MS;
  const voteOutTimeoutMs = options.voteOutTimeoutMs ?? VOTE_OUT_TIMEOUT_MS;

  io.use(async (socket, next) => {
    const { sessionId, userId } = socket.handshake.auth;
    if (!sessionId || !userId) return next(new Error('Authentication required'));
    if (!SESSION_ID_PATTERN.test(sessionId) || !USER_ID_PATTERN.test(userId)) {
      return next(new Error('Invalid credentials'));
    }
    try {
      const session = await getSession(sessionId);
      if (!session.users[userId]) return next(new Error('User not found in session'));
      socket.sessionId = sessionId;
      socket.userId = userId;
      next();
    } catch {
      next(new Error('Session not found'));
    }
  });

  io.on('connection', (socket) => {
    const { sessionId, userId } = socket;

    /**
     * Register an event as: rate-limit → validate → authorize → handle,
     * with every failure funneled into an `error` event. `fallbackError`
     * replaces thrown messages where the raw error would leak internals.
     */
    const on = (event, rules, handler, { fallbackError = null, rateLimited = true } = {}) => {
      socket.on(event, async (data) => {
        if (rateLimited && !checkRateLimit(socket.id, event)) {
          return socket.emit('error', { message: RATE_LIMITED_MESSAGE });
        }
        const validation = validateSocketInput(data, rules);
        if (!validation.isValid) return socket.emit('error', { message: validation.error });
        try {
          await handler(data);
        } catch (error) {
          socket.emit('error', { message: fallbackError ?? error.message });
        }
      });
    };

    /** Socket identity must match the event payload — anything else is a hijack attempt. */
    const assertIdentity = (data, userIdField = 'userId') => {
      if (data.sessionId !== sessionId) throw new Error('Unauthorized');
      if (userIdField && data[userIdField] !== userId) throw new Error('Unauthorized');
    };

    // ── Join ───────────────────────────────────────────────────────────────
    on('join-session', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      const { sessionId, userId } = data;
      // A returning user seeds their saved avatar so the room sees it; an
      // absent field leaves the stored avatar alone. Invalid avatars are
      // rejected before any mutation or room-join happens.
      const savedAvatar = data.avatar ? sanitizeAvatar(data.avatar) : null;
      // Returning user — cancel any scheduled hand-over from a previous
      // disconnect before the conflict handling below.
      cancelPendingModeratorTransfer(sessionId, userId);
      // Handle conflicts BEFORE the session update so a stale disconnect
      // handler can't race our isOnline=true with its isOnline=false.
      preemptStaleSocket(io, sessionId, userId, socket.id);
      // Track BEFORE the atomic update so concurrent disconnect handlers see the new socket.
      socket.join(sessionId);
      trackConnection(socket.id, sessionId, userId);
      updateLastSeen(sessionId, userId);

      const session = updateSessionAtomic(sessionId, (session) => {
        const user = getUser(session, userId);
        if (!user) throw new Error('User not found in session');
        if (savedAvatar) user.avatar = savedAvatar;
        user.lastSeen = new Date().toISOString();
        user.isOnline = true;
      });

      socket.emit('session-joined', assertOutgoing('session-joined', { session: sanitizeSession(session, userId) }));
      socket.to(sessionId).emit('user-joined', assertOutgoing('user-joined', { user: session.users[userId] }));
    }, { rateLimited: false });

    // ── Voting ─────────────────────────────────────────────────────────────
    on('submit-vote', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
      vote: VALIDATION_RULES.vote,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId: votingSessionId, userId: voterId, vote } = data;
      const voteStr = vote.toString().substring(0, 10);
      const session = updateSessionAtomic(votingSessionId, (session) => {
        const isKnownCard = (Array.isArray(session.cardSet) && session.cardSet.includes(voteStr)) || SPECIAL_VOTES.includes(voteStr);
        if (!isKnownCard) throw new Error('Invalid vote value');

        session.votes[voterId] = voteStr;
        const userCount = Object.keys(session.users).length;
        if (userCount > 0 && Object.keys(session.votes).length === userCount) {
          session.votingComplete = true;
          session.isVotingOpen = false;
        }
      });
      io.to(votingSessionId).emit('vote-submitted', payloads.voteSubmitted(session, voterId));
      // Echo the validated value to the voter only — never to the room.
      socket.emit('vote-accepted', payloads.voteAccepted(session, voterId, voteStr));
    });

    on('reset-votes', { sessionId: VALIDATION_RULES.sessionId }, async (data) => {
      // Session-scoped event: any socket bound to the session may reset.
      assertIdentity(data, null);
      const { sessionId } = data;
      const session = updateSessionAtomic(sessionId, (session) => {
        session.votes = {};
        session.isVotingOpen = true;
        session.votingComplete = false;
      });
      io.to(sessionId).emit('votes-reset', payloads.votesReset(session));
    });

    on('start-voting', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId: votingSessionId, userId: moderatorId } = data;
      const session = updateSessionAtomic(votingSessionId, (session) => {
        if (session.moderatorId !== moderatorId) throw new Error('Only the moderator can start voting');
        session.votes = {};
        session.isVotingOpen = true;
        session.votingComplete = false;
        if (!session.round) session.round = 1;
      });
      io.to(votingSessionId).emit('voting-started', payloads.votingStarted(session));
    });

    on('stop-round', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId: roundSessionId, userId: moderatorId } = data;
      const session = updateSessionAtomic(roundSessionId, (session) => {
        if (session.moderatorId !== moderatorId) throw new Error('Only the moderator can stop voting');
        if (!session.isVotingOpen || session.votingComplete) throw new Error('No active voting round to stop');
        session.isVotingOpen = false;
        session.votingComplete = true;
        session.round = (session.round || 1) + 1;
      });
      io.to(roundSessionId).emit('round-stopped', payloads.roundStopped(session, session.users[moderatorId].name));
    });

    // Broadcasts to the whole room, so it is rate-limited like every other
    // room event — spam here means audible notifications for everyone.
    on('test-sound', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId: soundSessionId, userId: moderatorId } = data;
      const session = await getSession(soundSessionId);
      if (session.moderatorId !== moderatorId) throw new Error('Only the moderator can test sound');
      io.to(soundSessionId).emit('test-sound-trigger', assertOutgoing('test-sound-trigger', { triggeredBy: session.users[moderatorId].name }));
    });

    // ── Moderation ─────────────────────────────────────────────────────────
    on('update-card-set', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId: cardsSessionId, userId: moderatorId, cardSet } = data;
      const session = updateSessionAtomic(cardsSessionId, (session) => {
        if (session.moderatorId !== moderatorId) throw new Error('Only the moderator can update card set');
        // sanitizeCardSet validates BEFORE mutating — a rejection leaves the
        // session untouched, and the set stays bounded (it is broadcast to
        // every participant).
        session.cardSet = sanitizeCardSet(cardSet);
        session.votes = {};
        session.isVotingOpen = false;
        session.votingComplete = false;
      });
      io.to(cardsSessionId).emit('card-set-updated', payloads.cardSetUpdated(session, session.users[moderatorId].name));
    });

    on('transfer-moderator', {
      sessionId: VALIDATION_RULES.sessionId,
      currentModeratorId: VALIDATION_RULES.currentModeratorId,
      targetUserId: VALIDATION_RULES.targetUserId,
    }, async (data) => {
      assertIdentity(data, 'currentModeratorId');
      const { sessionId, currentModeratorId, targetUserId } = data;
      const session = updateSessionAtomic(sessionId, (session) => {
        if (session.moderatorId !== currentModeratorId) throw new Error('Only the current moderator can transfer moderator role');
        const targetUser = getUser(session, targetUserId);
        if (!targetUser) throw new Error('Target user not found');
        if (!targetUser.isOnline) throw new Error('Cannot transfer moderator role to offline user');
        if (currentModeratorId === targetUserId) throw new Error('Cannot transfer moderator role to yourself');
        const moderator = getUser(session, currentModeratorId);
        if (!moderator) throw new Error('Moderator not found in session');

        session.moderator = targetUser.name;
        session.moderatorId = targetUserId;
        moderator.isModerator = false;
        targetUser.isModerator = true;
      });
      broadcastModeratorChange(io, session, { newModerator: session.users[targetUserId], previousModerator: session.users[currentModeratorId] }, true);
    });

    on('close-session', {
      sessionId: VALIDATION_RULES.sessionId,
      moderatorId: VALIDATION_RULES.moderatorId,
    }, async (data) => {
      assertIdentity(data, 'moderatorId');
      const { sessionId, moderatorId } = data;
      const session = await getSession(sessionId);
      if (session.moderatorId !== moderatorId) {
        return socket.emit('error', { message: 'Only the moderator can close the session' });
      }

      const closedEvent = assertOutgoing('session-closed', {
        sessionTitle: session.title,
        moderatorName: session.moderator,
        closedAt: new Date().toISOString(),
      });
      io.to(sessionId).emit('session-closed', closedEvent);
      // The acting socket may have reconnected and not yet re-joined the room
      // (join-session can race close-session after a transport blip); the
      // room broadcast above then misses it. Confirm directly to it as well.
      socket.emit('session-closed', closedEvent);
      deleteSession(sessionId);

      for (const socketId of getSessionConnections(sessionId) ?? []) {
        const participant = io.sockets.sockets.get(socketId);
        if (participant) {
          participant.leave(sessionId);
          participant.emit('session-closed', assertOutgoing('session-closed', { sessionTitle: closedEvent.sessionTitle, moderatorName: closedEvent.moderatorName }));
        }
      }
      untrackSession(sessionId);
      dissolveSession(sessionId);
    }, { fallbackError: 'Failed to close session' });

    on('update-user-name', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
      newName: VALIDATION_RULES.newName,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId: renamingUserId, newName } = data;
      const trimmedName = newName.trim();
      let oldName = null;
      const session = updateSessionAtomic(sessionId, (session) => {
        const user = getUser(session, renamingUserId);
        if (!user) throw new Error('User not found in session');
        const isTaken = Object.values(session.users).some(u => u.id !== renamingUserId && u.name.toLowerCase() === trimmedName.toLowerCase());
        if (isTaken) throw new Error('This name is already taken by another participant');

        oldName = user.name;
        user.name = trimmedName;
        if (session.moderatorId === renamingUserId) session.moderator = trimmedName;
      });
      io.to(sessionId).emit('user-name-updated', payloads.userNameUpdated(session, renamingUserId, oldName, trimmedName));
    });

    on('update-user-avatar', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId } = data;
      // sanitizeAvatar validates BEFORE mutating — a rejected avatar leaves
      // the user record untouched and surfaces as an `error` event.
      const avatar = sanitizeAvatar(data.avatar);
      const session = updateSessionAtomic(sessionId, (session) => {
        const user = getUser(session, userId);
        if (!user) throw new Error('User not found in session');
        user.avatar = avatar;
      });
      io.to(sessionId).emit('user-avatar-updated', payloads.userAvatarUpdated(session, userId));
    });

    on('remove-participant', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
      targetUserId: VALIDATION_RULES.targetUserId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId: moderatorId, targetUserId } = data;
      let removedUser = null;
      let pruned = null;
      const session = updateSessionAtomic(sessionId, (session) => {
        if (session.moderatorId !== moderatorId) throw new Error('Only the moderator can remove participants');
        if (targetUserId === session.moderatorId) throw new Error('Cannot remove the moderator');
        if (!session.users[targetUserId]) throw new Error('User not found in session');

        removedUser = session.users[targetUserId];
        delete session.users[targetUserId];
        delete session.votes[targetUserId];
        pruned = pruneVoteOutForRemovedUser(session, targetUserId);
      });

      io.to(sessionId).emit('participant-removed', payloads.participantRemoved(targetUserId, removedUser, session.users[moderatorId].name));
      if (pruned && pruned.outcome !== 'unchanged') {
        io.to(sessionId).emit('vote-out-ended', voteOutCancelledPayload(session, pruned.targetUserId, pruned.outcome));
      }

      const targetSocketId = getSocketForUser(sessionId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('you-were-removed', assertOutgoing('you-were-removed', { reason: 'Removed by moderator', removedBy: session.users[moderatorId].name }));
      }
    });

    on('leave-session', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId: leavingUserId } = data;
      let leavingUser = null;
      let moderatorHandover = null;
      let pruned = null;

      // Explicit departure — no grace window; cancel any pending transfer first.
      cancelPendingModeratorTransfer(sessionId, leavingUserId);

      const session = updateSessionAtomic(sessionId, (session) => {
        leavingUser = session.users[leavingUserId];
        if (!leavingUser) throw new Error('User not found in session');
        if (session.moderatorId === leavingUserId) {
          moderatorHandover = transferModeratorRole(session, leavingUserId, { id: leavingUser.id, name: leavingUser.name });
        }
        delete session.users[leavingUserId];
        delete session.votes[leavingUserId];
        pruned = pruneVoteOutForRemovedUser(session, leavingUserId);
      }, { updateActivity: true });

      socket.to(sessionId).emit('participant-removed', payloads.participantRemoved(leavingUserId, leavingUser, leavingUser.name));
      socket.emit('leave-acknowledged', assertOutgoing('leave-acknowledged', { sessionId }));
      if (pruned && pruned.outcome !== 'unchanged') {
        socket.to(sessionId).emit('vote-out-ended', voteOutCancelledPayload(session, pruned.targetUserId, pruned.outcome));
      }
      if (moderatorHandover) broadcastModeratorChange(io, session, moderatorHandover);

      untrackConnection(socket.id);
      socket.leave(sessionId);
      if (Object.keys(session.users).length === 0) dissolveSession(sessionId);
    }, { fallbackError: 'Failed to leave session' });

    // ── Vote-out ───────────────────────────────────────────────────────────
    on('start-vote-out', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
      targetUserId: VALIDATION_RULES.targetUserId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId: initiatorId, targetUserId } = data;
      if (initiatorId === targetUserId) throw new Error('Cannot vote out yourself');
      // createVoteOut validates before mutating; a stale (expired) vote-out
      // in progress is expired first and does not block.
      const session = updateSessionAtomic(sessionId, (session) => {
        createVoteOut(session, {
          initiatorId,
          targetId: targetUserId,
          thresholdPercent: VOTE_OUT_THRESHOLD_PERCENT,
          timeoutMs: voteOutTimeoutMs,
        });
      });
      io.to(sessionId).emit('vote-out-started', payloads.voteOutStarted(session, targetUserId, initiatorId, session.users[initiatorId].name));
    });

    on('vote-out', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
      targetUserId: VALIDATION_RULES.targetUserId,
      vote: VALIDATION_RULES.voteOutVote,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId: voterId, targetUserId, vote } = data;
      let outcome = null;
      const session = updateSessionAtomic(sessionId, (session) => {
        outcome = castVoteOutVote(session, { voterId, targetId: targetUserId, vote });
        // If the vote-out removed the moderator, hand the role over in the
        // same atomic transition (otherwise the session loses its leader).
        if (outcome.result === 'removed' && session.moderatorId === targetUserId) {
          outcome.moderatorTransfer = transferModeratorRole(session, targetUserId, outcome.removedUser);
        }
      });

      if (outcome.result === 'pending') {
        return io.to(sessionId).emit('vote-out-cast', payloads.voteOutCast(session));
      }
      if (outcome.result !== 'removed') {
        return io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, targetUserId, false, VOTE_OUT_ENDED[outcome.result]));
      }

      const removedBy = session.users[voterId]?.name || 'Participants';
      io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, targetUserId, true, 'Removed by participant vote', outcome.removedUser));
      io.to(sessionId).emit('participant-removed', payloads.participantRemoved(targetUserId, outcome.removedUser, removedBy));
      const targetSocketId = getSocketForUser(sessionId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('you-were-removed', assertOutgoing('you-were-removed', { reason: 'Removed by participant vote', removedBy }));
      }
      if (outcome.moderatorTransfer) broadcastModeratorChange(io, session, outcome.moderatorTransfer);
      // If nobody remains, tear the session down like leave-session does.
      if (Object.keys(session.users).length === 0) dissolveSession(sessionId);
    });

    on('cancel-vote-out', {
      sessionId: VALIDATION_RULES.sessionId,
      userId: VALIDATION_RULES.userId,
    }, async (data) => {
      assertIdentity(data);
      const { sessionId, userId: initiatorId } = data;
      let cancelledTargetId = null;
      const session = updateSessionAtomic(sessionId, (session) => {
        if (!session.activeVoteOut) throw new Error('No vote-out is in progress');
        if (session.activeVoteOut.initiatedByUserId !== initiatorId) throw new Error('Only the initiator can cancel the vote-out');
        // Capture BEFORE clearing — after the update the state is gone.
        cancelledTargetId = session.activeVoteOut.targetUserId;
        session.activeVoteOut = null;
      });
      io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, cancelledTargetId, false, 'Vote-out cancelled by initiator'));
    });

    // ── Liveness ───────────────────────────────────────────────────────────
    socket.on('heartbeat', () => {
      // Liveness stays in memory; cleanupInactiveSessions reads this to
      // detect inactivity. No session mutation or store write per heartbeat.
      if (sessionId && userId) updateLastSeen(sessionId, userId);
    });

    socket.on('disconnect', async () => {
      logger.debug('User disconnected:', socket.id);
      cleanupRateLimits(socket.id);
      const userInfo = untrackConnection(socket.id);
      if (!userInfo) return;

      const { sessionId: leftSessionId, userId: leftUserId } = userInfo;
      let userStillExists = true;
      let wasModerator = false;
      try {
        const session = updateSessionAtomic(leftSessionId, (session) => {
          const user = getUser(session, leftUserId);
          if (!user) { userStillExists = false; return false; }
          user.isOnline = false;
          user.lastSeen = new Date().toISOString();
          wasModerator = session.moderatorId === leftUserId;
        });
        if (!userStillExists) return;
        // The moderator's role is NOT transferred immediately: brief
        // disconnects (refresh, network blip) get a grace window to rejoin.
        if (wasModerator) schedulePendingModeratorTransfer(io, leftSessionId, leftUserId, moderatorDisconnectGraceMs);
        socket.to(leftSessionId).emit('user-disconnected', assertOutgoing('user-disconnected', { userId: leftUserId, user: session.users[leftUserId] }));
      } catch { /* session expired */ }
    });
  });
};

// ── Inactivity sweep ────────────────────────────────────────────────────────
//
// Sweeps the in-memory session store every 60s: reconciles offline state,
// runs inactivity countdowns, and deletes stale (>24h, no active users)
// sessions. Iterating a snapshot of the store means orphaned sessions with
// no live sockets are still cleaned.
//
const cleanupInactiveSessions = (io) => {
  const sessions = getAllSessions();
  if (sessions.length === 0) return;

  logger.debug(`Running session cleanup (${sessions.length} sessions)...`);
  const now = new Date();
  const doomed = [];

  for (const [sessionId, session] of sessions) {
    try {
      let countdowns = inactiveCountdowns.get(sessionId);
      if (!countdowns) {
        countdowns = new Map();
        inactiveCountdowns.set(sessionId, countdowns);
      }
      const { events, shouldDelete } = applyCleanup(session, { sessionId, now, getLastSeen, getSocketForUser, countdowns });
      for (const { event, data } of events) {
        try {
          io.to(sessionId).emit(event, assertOutgoing(event, data));
        } catch (error) {
          // A contract-violating delta is never broadcast; the rest of this
          // session's cleanup events still go out.
          logger.error(`Cleanup broadcast '${event}' rejected:`, error.message);
        }
      }
      if (shouldDelete) doomed.push(sessionId);
    } catch { /* session vanished mid-sweep */ }
  }

  for (const sessionId of doomed) dissolveSession(sessionId);
};

module.exports = { setupSocketEvents, cleanupInactiveSessions };