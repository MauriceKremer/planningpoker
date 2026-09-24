const { getSession, updateSessionAtomic, deleteSession, getAllSessions, sanitizeSession, sanitizeCardSet } = require('../services/sessionService');
const logger = require('../utils/logger');
const { validateSocketInput, VALIDATION_RULES, SESSION_ID_PATTERN, USER_ID_PATTERN } = require('../socket/validation');
const { checkRateLimit, cleanupRateLimits } = require('../socket/rateLimiter');
const { trackConnection, untrackConnection, untrackSession, getUserInfo, getSocketForUser, getSessionConnections, hasActiveConnections, activeConnections, updateLastSeen, getLastSeen } = require('../socket/connections');
const { transferModeratorRole } = require('../socket/moderator');
const payloads = require('../socket/eventPayloads');
const { applyCleanup } = require('../socket/cleanupPolicy');
const { createVoteOut, castVoteOutVote, pruneVoteOutForRemovedUser, expireIfStale, VOTE_OUT_THRESHOLD_PERCENT, VOTE_OUT_TIMEOUT_MS } = require('../socket/voteOut');

const SPECIAL_VOTES = ['☕', '❓'];

/**
 * Own-property user lookup for session.user maps.
 *
 * Deliberately uses `Object.hasOwn` rather than a truthiness check: a
 * `__proto__`-shaped key would otherwise resolve to `Object.prototype`
 * (truthy) and the write that follows would pollute it. Today every event
 * already rejects such keys via the strict UUID validation
 * (`socket/validation.js`); this makes the mutation paths independently
 * safe instead of relying on that (CodeQL js/prototype-polluting-assignment).
 */
const getUser = (session, id) =>
  (Object.hasOwn(session.users, id) ? session.users[id] : null);

// Inactivity countdowns: sessionId → Map<userId, remainingSeconds>
const inactiveCountdowns = new Map();

// How long a disconnected moderator keeps the role before it is handed to
// the next participant. Covers browser refreshes and short network blips:
// a rejoin inside the window cancels the transfer, so the "session
// restoration across refreshes" feature no longer costs the moderator
// their role. Real departures (no rejoin) are transferred after the grace.
const MODERATOR_DISCONNECT_GRACE_MS = 60 * 1000;

// sessionId → { userId, timer } for scheduled moderator hand-overs.
const pendingModeratorTransfers = new Map();

const cancelPendingModeratorTransfer = (sessionId, userId = null) => {
  const pending = pendingModeratorTransfers.get(sessionId);
  if (!pending) return;
  if (userId && pending.userId !== userId) return;
  clearTimeout(pending.timer);
  pendingModeratorTransfers.delete(sessionId);
};

/**
 * Schedule the moderator hand-over for a *departed* moderator (socket gone).
 * The callback re-validates everything under the atomic update — a rejoin,
 * manual transfer, or deleted session/user in the meantime is a no-op.
 */
const schedulePendingModeratorTransfer = (io, sessionId, userId, graceMs) => {
  cancelPendingModeratorTransfer(sessionId);
  const timer = setTimeout(() => {
    pendingModeratorTransfers.delete(sessionId);
    try {
      let transferred = null;
      const session = updateSessionAtomic(sessionId, (session) => {
        if (session.moderatorId !== userId) return false; // role already moved
        if (!session.users[userId]) return false;          // user gone meanwhile
        if (getSocketForUser(sessionId, userId)) return false; // rejoined meanwhile
        transferred = transferModeratorRole(session, userId, { id: userId, name: session.users[userId].name });
        return transferred ? true : false; // nothing to hand over → no-op
      });
      if (transferred) {
        io.to(sessionId).emit('moderator-changed',
          payloads.moderatorChanged(session, transferred.newModerator.id, transferred.previousModerator.id, false));
      }
    } catch (error) { /* session deleted meanwhile */ }
  }, graceMs);
  // Never keep the process alive just for a pending hand-over (matters in tests).
  if (typeof timer.unref === 'function') timer.unref();
  pendingModeratorTransfers.set(sessionId, { userId, timer });
};

const setupSocketEvents = (io, options = {}) => {
  const moderatorDisconnectGraceMs = options.moderatorDisconnectGraceMs ?? MODERATOR_DISCONNECT_GRACE_MS;
  const voteOutTimeoutMs = options.voteOutTimeoutMs ?? VOTE_OUT_TIMEOUT_MS;

  // Socket authentication middleware
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
    } catch (error) {
      next(new Error('Session not found'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug('User connected:', socket.id);

    // === Join session ===
    socket.on('join-session', async (data) => {
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId } = data;
      try {
        // The user is back — cancel any scheduled moderator hand-over from a
        // previous disconnect BEFORE the conflict handling below.
        cancelPendingModeratorTransfer(sessionId, userId);

        // Handle connection conflicts BEFORE session update so the stale disconnect
        // handler can't race our isOnline=true with its isOnline=false
        const existingSocketId = getSocketForUser(sessionId, userId);
        if (existingSocketId && existingSocketId !== socket.id) {
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          if (existingSocket) {
            existingSocket.emit('connection-conflict', { message: 'Your session has been accessed from another location. You have been disconnected.' });
            existingSocket.disconnect(true);
          }
          untrackConnection(existingSocketId);
        }

        // Track BEFORE atomic update so concurrent disconnect handlers see the new socket
        socket.join(sessionId);
        trackConnection(socket.id, sessionId, userId);
        updateLastSeen(sessionId, userId); // Mark heartbeat on join

        const session = updateSessionAtomic(sessionId, (session) => {
          const user = getUser(session, userId);
          if (!user) throw new Error('User not found in session');
          user.lastSeen = new Date().toISOString();
          user.isOnline = true;
        });

        socket.emit('session-joined', { session: sanitizeSession(session, userId) });
        socket.to(sessionId).emit('user-joined', { user: session.users[userId] });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Submit vote ===
    socket.on('submit-vote', async (data) => {
      if (!checkRateLimit(socket.id, 'submit-vote')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });

      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
        vote: VALIDATION_RULES.vote,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId, vote } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      const voteStr = vote.toString().substring(0, 10);
      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          const validCard = (Array.isArray(session.cardSet) && session.cardSet.includes(voteStr)) || SPECIAL_VOTES.includes(voteStr);
          if (!validCard) throw new Error('Invalid vote value');

          session.votes[userId] = voteStr;
          const userCount = Object.keys(session.users).length;
          const voteCount = Object.keys(session.votes).length;
          if (userCount === voteCount && userCount > 0) {
            session.votingComplete = true;
            session.isVotingOpen = false;
          }
        });

        io.to(sessionId).emit('vote-submitted', payloads.voteSubmitted(session, userId));
        // Echo the validated value to the voter only — never to the room.
        socket.emit('vote-accepted', payloads.voteAccepted(session, userId, voteStr));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Reset votes ===
    socket.on('reset-votes', async (data) => {
      if (!checkRateLimit(socket.id, 'reset-votes')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, { sessionId: VALIDATION_RULES.sessionId });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });
      const { sessionId } = data;
      if (socket.sessionId !== sessionId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          session.votes = {};
          session.isVotingOpen = true;
          session.votingComplete = false;
        });
        io.to(sessionId).emit('votes-reset', payloads.votesReset(session));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Start voting ===
    socket.on('start-voting', async (data) => {
      if (!checkRateLimit(socket.id, 'start-voting')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });
      const { sessionId, userId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          if (session.moderatorId !== userId) throw new Error('Only the moderator can start voting');
          session.votes = {};
          session.isVotingOpen = true;
          session.votingComplete = false;
          if (!session.round) session.round = 1;
        });
        io.to(sessionId).emit('voting-started', payloads.votingStarted(session));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Stop round ===
    socket.on('stop-round', async (data) => {
      if (!checkRateLimit(socket.id, 'stop-round')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });
      const { sessionId, userId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          if (session.moderatorId !== userId) throw new Error('Only the moderator can stop voting');
          if (!session.isVotingOpen || session.votingComplete) throw new Error('No active voting round to stop');

          session.isVotingOpen = false;
          session.votingComplete = true;
          const currentRound = session.round || 1;
          session.round = currentRound + 1;
        });

        io.to(sessionId).emit('round-stopped', payloads.roundStopped(session, session.users[userId].name));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Test sound (read-only, no session mutation) ===
    socket.on('test-sound', async (data) => {
      // Audit finding F1: this was the only room-broadcasting event without
      // a rate limit — spam caused audible notifications for everyone.
      if (!checkRateLimit(socket.id, 'test-sound')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });
      const { sessionId, userId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });
      try {
        const session = await getSession(sessionId);
        if (session.moderatorId !== userId) return socket.emit('error', { message: 'Only the moderator can test sound' });
        io.to(sessionId).emit('test-sound-trigger', { triggeredBy: session.users[userId].name });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Update card set ===
    socket.on('update-card-set', async (data) => {
      if (!checkRateLimit(socket.id, 'update-card-set')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId, cardSet } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });
      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          if (session.moderatorId !== userId) throw new Error('Only the moderator can update card set');
          // Audit finding F3: bound the card set (count + per-item length)
          // before storing. sanitizeCardSet validates BEFORE mutation, so a
          // rejection leaves the session untouched (see updateSessionAtomic).
          const sanitized = sanitizeCardSet(cardSet);

          session.cardSet = sanitized;
          session.votes = {};
          session.isVotingOpen = false;
          session.votingComplete = false;
        });
        io.to(sessionId).emit('card-set-updated', payloads.cardSetUpdated(session, session.users[userId].name));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Transfer moderator ===
    socket.on('transfer-moderator', async (data) => {
      if (!checkRateLimit(socket.id, 'transfer-moderator')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        currentModeratorId: VALIDATION_RULES.currentModeratorId,
        targetUserId: VALIDATION_RULES.targetUserId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, currentModeratorId, targetUserId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== currentModeratorId) return socket.emit('error', { message: 'Unauthorized' });

      try {
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

        io.to(sessionId).emit('moderator-changed',
          payloads.moderatorChanged(session, targetUserId, currentModeratorId, true));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Close session ===
    socket.on('close-session', async (data) => {
      if (!checkRateLimit(socket.id, 'close-session')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        moderatorId: VALIDATION_RULES.moderatorId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, moderatorId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== moderatorId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        const session = await getSession(sessionId);
        if (session.moderatorId !== moderatorId) return socket.emit('error', { message: 'Only the moderator can close the session' });

        const closedAt = new Date().toISOString();
        io.to(sessionId).emit('session-closed', { sessionTitle: session.title, moderatorName: session.moderator, closedAt });
        // The acting socket may have reconnected and not yet re-joined the room
        // (join-session can race close-session after a transport blip); the
        // room broadcast above then misses it. Confirm directly to it as well.
        socket.emit('session-closed', { sessionTitle: session.title, moderatorName: session.moderator, closedAt });
        deleteSession(sessionId);

        // Disconnect all sockets in this session
        if (activeConnections.has(sessionId)) {
          activeConnections.get(sessionId).forEach(sId => {
            const s = io.sockets.sockets.get(sId);
            if (s) { try { s.leave(sessionId); s.emit('session-closed', { sessionTitle: session.title, moderatorName: session.moderator }); } catch(e) {} }
          });
        }
        untrackSession(sessionId);
        cancelPendingModeratorTransfer(sessionId);
        inactiveCountdowns.delete(sessionId);
      } catch (error) {
        socket.emit('error', { message: 'Failed to close session' });
      }
    });

    // === Update user name ===
    socket.on('update-user-name', async (data) => {
      if (!checkRateLimit(socket.id, 'update-user-name')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
        newName: VALIDATION_RULES.newName,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId, newName } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });
      try {
        let oldName;
        const session = updateSessionAtomic(sessionId, (session) => {
          const user = getUser(session, userId);
          if (!user) throw new Error('User not found in session');
          if (!newName || newName.trim().length === 0) throw new Error('Name cannot be empty');
          if (newName.trim().length > 30) throw new Error('Name is too long (max 30 characters)');

          const nameExists = Object.values(session.users).some(u => u.id !== userId && u.name.toLowerCase() === newName.trim().toLowerCase());
          if (nameExists) throw new Error('This name is already taken by another participant');

          oldName = user.name;
          user.name = newName.trim();
          if (session.moderatorId === userId) session.moderator = newName.trim();
        });

        io.to(sessionId).emit('user-name-updated',
          payloads.userNameUpdated(session, userId, oldName, newName.trim()));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Remove participant ===
    socket.on('remove-participant', async (data) => {
      if (!checkRateLimit(socket.id, 'remove-participant')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
        targetUserId: VALIDATION_RULES.targetUserId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId, targetUserId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        let removedUser;
        let voteOutPruned = null;
        const session = updateSessionAtomic(sessionId, (session) => {
          if (session.moderatorId !== userId) throw new Error('Only the moderator can remove participants');
          if (targetUserId === session.moderatorId) throw new Error('Cannot remove the moderator');
          if (!session.users[targetUserId]) throw new Error('User not found in session');

          removedUser = session.users[targetUserId];
          delete session.users[targetUserId];
          delete session.votes[targetUserId];
          voteOutPruned = pruneVoteOutForRemovedUser(session, targetUserId);
        });

        io.to(sessionId).emit('participant-removed',
          payloads.participantRemoved(targetUserId, removedUser, session.users[userId].name));

        if (voteOutPruned && voteOutPruned.outcome !== 'unchanged') {
          io.to(sessionId).emit('vote-out-ended',
            payloads.voteOutEnded(session, voteOutPruned.targetUserId, false,
              voteOutPruned.outcome === 'target-left'
                ? 'Vote-out cancelled: target already left'
                : 'Vote-out cancelled: not enough eligible participants left'));
        }

        const targetSocketId = getSocketForUser(sessionId, targetUserId);
        if (targetSocketId) io.to(targetSocketId).emit('you-were-removed', { reason: 'Removed by moderator', removedBy: session.users[userId].name });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Leave session ===
    socket.on('leave-session', async (data) => {
      if (!checkRateLimit(socket.id, 'leave-session')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      let moderatorTransferResult = null;
      let leavingUser = null;
      let voteOutPruned = null;

      try {
        // Explicit departure — no grace window; cancel any pending transfer first.
        cancelPendingModeratorTransfer(sessionId, userId);

        const session = updateSessionAtomic(sessionId, (session) => {
          if (!session.users[userId]) throw new Error('User not found in session');

          leavingUser = session.users[userId];
          if (session.moderatorId === userId) {
            moderatorTransferResult = transferModeratorRole(session, userId, { id: leavingUser.id, name: leavingUser.name });
          }

          delete session.users[userId];
          delete session.votes[userId];
          voteOutPruned = pruneVoteOutForRemovedUser(session, userId);
        }, { updateActivity: true });

        socket.to(sessionId).emit('participant-removed',
          payloads.participantRemoved(userId, leavingUser, leavingUser.name));
        socket.emit('leave-acknowledged', { sessionId });

        if (voteOutPruned && voteOutPruned.outcome !== 'unchanged') {
          socket.to(sessionId).emit('vote-out-ended',
            payloads.voteOutEnded(session, voteOutPruned.targetUserId, false,
              voteOutPruned.outcome === 'target-left'
                ? 'Vote-out cancelled: target already left'
                : 'Vote-out cancelled: not enough eligible participants left'));
        }

        if (moderatorTransferResult) {
          socket.to(sessionId).emit('moderator-changed',
            payloads.moderatorChanged(session, moderatorTransferResult.newModerator.id, moderatorTransferResult.previousModerator.id, false));
        }

        untrackConnection(socket.id);
        socket.leave(sessionId);

        if (Object.keys(session.users).length === 0) {
          try { deleteSession(sessionId); } catch (e) { /* already deleted */ }
          cancelPendingModeratorTransfer(sessionId);
          inactiveCountdowns.delete(sessionId);
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to leave session' });
      }
    });

    // === Vote out participant ===
    socket.on('start-vote-out', async (data) => {
      if (!checkRateLimit(socket.id, 'start-vote-out')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
        targetUserId: VALIDATION_RULES.targetUserId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId, targetUserId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });
      if (userId === targetUserId) return socket.emit('error', { message: 'Cannot vote out yourself' });

      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          // createVoteOut validates before mutating; a stale (expired)
          // vote-out in progress is expired first and does not block.
          createVoteOut(session, {
            initiatorId: userId,
            targetId: targetUserId,
            thresholdPercent: VOTE_OUT_THRESHOLD_PERCENT,
            timeoutMs: voteOutTimeoutMs,
          });
        });

        io.to(sessionId).emit('vote-out-started',
          payloads.voteOutStarted(session, targetUserId, userId, session.users[userId].name));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('vote-out', async (data) => {
      if (!checkRateLimit(socket.id, 'vote-out')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
        targetUserId: VALIDATION_RULES.targetUserId,
        vote: VALIDATION_RULES.voteOutVote,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId, targetUserId, vote } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        let outcome = null;
        const session = updateSessionAtomic(sessionId, (session) => {
          outcome = castVoteOutVote(session, { voterId: userId, targetId: targetUserId, vote });
          // If the vote-out removed the moderator, hand the role over in the
          // same atomic transition (otherwise the session loses its leader).
          if (outcome.result === 'removed' && session.moderatorId === targetUserId) {
            outcome.moderatorTransfer = transferModeratorRole(
              session,
              targetUserId,
              { id: targetUserId, name: outcome.removedUser.name }
            );
          }
        });

        if (outcome.result === 'pending') {
          io.to(sessionId).emit('vote-out-cast', payloads.voteOutCast(session));
          return;
        }

        if (outcome.result === 'removed') {
          io.to(sessionId).emit('vote-out-ended',
            payloads.voteOutEnded(session, targetUserId, true, 'Removed by participant vote', outcome.removedUser));
          io.to(sessionId).emit('participant-removed',
            payloads.participantRemoved(targetUserId, outcome.removedUser, session.users[userId]?.name || 'Participants'));

          const targetSocketId = getSocketForUser(sessionId, targetUserId);
          if (targetSocketId) io.to(targetSocketId).emit('you-were-removed', { reason: 'Removed by participant vote', removedBy: session.users[userId]?.name || 'Participants' });

          if (outcome.moderatorTransfer) {
            io.to(sessionId).emit('moderator-changed',
              payloads.moderatorChanged(session, outcome.moderatorTransfer.newModerator.id, outcome.moderatorTransfer.previousModerator.id, false));
          }

          // If nobody remains, tear the session down like leave-session does.
          if (Object.keys(session.users).length === 0) {
            try { deleteSession(sessionId); } catch (e) { /* already deleted */ }
            cancelPendingModeratorTransfer(sessionId);
            inactiveCountdowns.delete(sessionId);
          }
        } else if (outcome.result === 'target-left') {
          io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, targetUserId, false, 'Vote-out cancelled: target already left'));
        } else if (outcome.result === 'failed') {
          io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, targetUserId, false, 'Vote-out failed: not enough votes'));
        } else if (outcome.result === 'expired') {
          io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, targetUserId, false, 'Vote-out expired without enough votes'));
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('cancel-vote-out', async (data) => {
      if (!checkRateLimit(socket.id, 'cancel-vote-out')) return socket.emit('error', { message: 'Too many requests. Please slow down.' });
      const validation = validateSocketInput(data, {
        sessionId: VALIDATION_RULES.sessionId,
        userId: VALIDATION_RULES.userId,
      });
      if (!validation.isValid) return socket.emit('error', { message: validation.error });

      const { sessionId, userId } = data;
      if (socket.sessionId !== sessionId || socket.userId !== userId) return socket.emit('error', { message: 'Unauthorized' });

      try {
        let cancelledTargetId = null;
        const session = updateSessionAtomic(sessionId, (session) => {
          if (!session.activeVoteOut) throw new Error('No vote-out is in progress');
          if (session.activeVoteOut.initiatedByUserId !== userId) throw new Error('Only the initiator can cancel the vote-out');
          // Capture BEFORE clearing — after the update the state is gone.
          cancelledTargetId = session.activeVoteOut.targetUserId;
          session.activeVoteOut = null;
        });
        io.to(sessionId).emit('vote-out-ended', payloads.voteOutEnded(session, cancelledTargetId, false, 'Vote-out cancelled by initiator'));
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // === Heartbeat (in-memory only) ===
    socket.on('heartbeat', () => {
      const { sessionId, userId } = socket;
      if (!sessionId || !userId) return;
      // Track liveness in memory; cleanupInactiveSessions reads this to detect
      // inactivity. No session mutation or store write per heartbeat.
      updateLastSeen(sessionId, userId);
    });

    // === Disconnect ===
    socket.on('disconnect', async () => {
      logger.debug('User disconnected:', socket.id);
      cleanupRateLimits(socket.id);

      const userInfo = untrackConnection(socket.id);
      if (!userInfo) return;

      const { sessionId, userId } = userInfo;
      let userStillExists = true;
      try {
        const session = updateSessionAtomic(sessionId, (session) => {
          const user = getUser(session, userId);
          if (!user) {
            userStillExists = false;
            return false; // user already removed, skip persist
          }

          user.isOnline = false;
          user.lastSeen = new Date().toISOString();

          // The moderator's role is NOT transferred immediately: brief
          // disconnects (refresh, network blip) get a grace window. If the
          // moderator does not return within it, the scheduled transfer runs.
          if (session.moderatorId === userId) {
            schedulePendingModeratorTransfer(io, sessionId, userId, moderatorDisconnectGraceMs);
          }
        });

        if (userStillExists) {
          socket.to(sessionId).emit('user-disconnected', { userId, user: session.users[userId], wasModeratorTransferred: false });
        }
      } catch (error) { /* session expired */ }
    });
  });
};

// ── Cleanup inactive sessions ───────────────────────────────────────────────
//
// Sweeps the in-memory session store every 60s: reconciles offline state,
// runs inactivity countdowns, and deletes stale (>24h, no active users)
// sessions. Iterating a snapshot of the store means orphaned sessions with
// no live sockets are still cleaned.
//
const cleanupInactiveSessions = async (io) => {
  const sessions = getAllSessions();
  if (sessions.length === 0) return;

  logger.debug(`Running session cleanup (${sessions.length} sessions)...`);

  const toDelete = [];
  for (const [sessionId, session] of sessions) {
    try {
      if (!inactiveCountdowns.has(sessionId)) inactiveCountdowns.set(sessionId, new Map());
      const countdowns = inactiveCountdowns.get(sessionId);

      // Mutates the stored session in place (single source of truth).
      const result = applyCleanup(session, {
        sessionId,
        now: new Date(),
        getLastSeen,
        getSocketForUser,
        countdowns,
      });

      for (const { event, data } of result.events) {
        io.to(sessionId).emit(event, data);
      }

      if (result.shouldDelete) toDelete.push(sessionId);
    } catch (error) {
      // Session vanished mid-iteration — nothing to clean up.
    }
  }

  for (const sessionId of toDelete) {
    try { deleteSession(sessionId); } catch (e) { /* already deleted */ }
    cancelPendingModeratorTransfer(sessionId);
    inactiveCountdowns.delete(sessionId);
  }
};

module.exports = { setupSocketEvents, cleanupInactiveSessions };