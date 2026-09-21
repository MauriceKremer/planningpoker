/**
 * Pure per-session cleanup decision logic.
 *
 * SOLID — Single Responsibility: decide what (if anything) changed during
 *   an inactivity sweep. The caller (`socketHandler.cleanupInactiveSessions`)
 *   owns I/O: broadcasting events and deleting sessions.
 * DRY    — the inactivity thresholds (240s grace, 300s total) live here once.
 * KISS   — no I/O, no globals; trivially unit-testable.
 *
 * The caller feeds in-memory heartbeat/socket lookups via `ctx` so this
 * function never touches the session store directly. It mutates `session` in
 * place and returns:
 *   { events: Array<{event,data}>, shouldDelete: boolean }
 */

const INACTIVITY_GRACE_SECONDS = 1200; // 20 minutes — start countdown after this
const INACTIVITY_TIMEOUT_SECONDS = 1500; // 25 minutes — remove after this total (5 min countdown)

const voteOut = require('./voteOut');

const toSeconds = (ms) => ms / 1000;

/**
 * @param {object} session - mutated in place
 * @param {object} ctx
 * @param {string} ctx.sessionId
 * @param {Date}   ctx.now
 * @param {Function} ctx.getLastSeen - (sessionId, userId) => ms|null
 * @param {Function} ctx.getSocketForUser - (sessionId, userId) => socketId|undefined
 * @param {Map<string,number>} ctx.countdowns - per-session countdown state (cleared & repopulated)
 * @returns {{ events: Array, shouldDelete: boolean }}
 */
const applyCleanup = (session, ctx) => {
  const { sessionId, now, getLastSeen, getSocketForUser, countdowns } = ctx;
  countdowns.clear();

  let hasActiveUsers = false;
  const events = [];

  // Expire a stale vote-out regardless of user activity — it must not
  // linger (it blocks new vote-outs and keeps the banner alive).
  const expiredVoteOut = voteOut.expireIfStale(session, now);
  if (expiredVoteOut) {
    events.push({ event: 'vote-out-ended', data: expiredVoteOut });
  }

  for (const [userId, user] of Object.entries(session.users)) {
    const memLastSeen = getLastSeen(sessionId, userId);
    const hasSocket = getSocketForUser(sessionId, userId) !== undefined;

    // Online + recent heartbeat → fully active. Reconcile a stale offline flag.
    if (hasSocket && memLastSeen) {
      hasActiveUsers = true;
      countdowns.delete(userId);
      if (!user.isOnline) {
        user.isOnline = true;
        user.lastSeen = new Date(memLastSeen).toISOString();
      }
      continue;
    }

    // No live socket / no recent heartbeat → evaluate inactivity against last seen.
    const lastSeenMs = memLastSeen ? memLastSeen : new Date(user.lastSeen || user.joinedAt).getTime();
    const inactiveSeconds = toSeconds(now.getTime() - lastSeenMs);

    if (inactiveSeconds > INACTIVITY_GRACE_SECONDS) {
      const remaining = Math.max(0, INACTIVITY_TIMEOUT_SECONDS - Math.floor(inactiveSeconds));

      if (remaining > 0) {
        countdowns.set(userId, remaining);
        if (user.isOnline) user.isOnline = false;
        events.push({ event: 'user-countdown', data: { userId, user, remainingSeconds: remaining } });
      } else if (session.users[userId] && !user.isModerator) {
        // Time expired — evict non-moderators only.
        const removed = { ...user };
        delete session.users[userId];
        delete session.votes[userId];
        countdowns.delete(userId);
        events.push({ event: 'participant-auto-removed', data: { userId, user: removed, reason: 'Removed due to inactivity' } });

        // Reconcile the vote-out: drop their (ghost) votes, cancel when the
        // target left or the threshold became unreachable.
        const pruned = voteOut.pruneVoteOutForRemovedUser(session, userId);
        if (pruned && pruned.outcome !== 'unchanged') {
          events.push({
            event: 'vote-out-ended',
            data: {
              targetUserId: pruned.targetUserId,
              removed: false,
              reason: pruned.outcome === 'target-left'
                ? 'Vote-out cancelled: target already left'
                : 'Vote-out cancelled: not enough eligible participants left',
            },
          });
        }
      }
    } else {
      // Recently active but not via a live socket (e.g. transient gap).
      hasActiveUsers = true;
      countdowns.delete(userId);
      if (!user.isOnline) user.isOnline = true;
    }
  }

  let shouldDelete = false;
  if (!hasActiveUsers) {
    const sessionAgeHours = toSeconds(now.getTime() - new Date(session.createdAt).getTime()) / 3600;
    if (sessionAgeHours > 24) {
      shouldDelete = true;
      events.push({ event: 'session-cleanup', data: { reason: 'inactive', message: 'Session closed due to inactivity' } });
    }
  }

  return { events, shouldDelete };
};

module.exports = {
  applyCleanup,
  INACTIVITY_GRACE_SECONDS,
  INACTIVITY_TIMEOUT_SECONDS,
  // Re-exported for backwards compatibility (vote-out policy constants live
  // in socket/voteOut.js now).
  VOTE_OUT_THRESHOLD_PERCENT: voteOut.VOTE_OUT_THRESHOLD_PERCENT,
  VOTE_OUT_TIMEOUT_MS: voteOut.VOTE_OUT_TIMEOUT_MS,
};