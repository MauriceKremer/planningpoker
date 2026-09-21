/**
 * Pure vote-out domain logic.
 *
 * SOLID — Single Responsibility: all state transitions of an active vote-out
 *   (start, cast, prune-on-removal, expiry) live here once. socketHandler
 *   orchestrates I/O (emits, socket lookups); cleanupPolicy uses the prune +
 *   expiry helpers during the inactivity sweep.
 * DRY    — the threshold/expiry rules exist exactly once, here.
 * KISS   — plain synchronous functions that mutate the session in place, no
 *   I/O, trivially unit-testable.
 *
 * Serializability contract: activeVoteOut holds ONLY JSON-safe values
 * (arrays, strings, numbers). Sets are forbidden — session state is shared
 * over the wire (sanitizeSession / REST GET), and Sets silently serialize
 * to {}. yesVotes/noVotes are arrays of userIds; counts are derived via
 * .length.
 */

// Threshold for participant vote-out removal: at least 25% of all
// participants (rounded up, minimum 1) must vote yes.
const VOTE_OUT_THRESHOLD_PERCENT = 25;

const computeVoteOutRequired = (participantCount, thresholdPercent = VOTE_OUT_THRESHOLD_PERCENT) => {
  if (participantCount <= 0) return 0;
  return Math.max(1, Math.ceil((participantCount * thresholdPercent) / 100));
};

// A vote-out that cannot resolve within this window expires. It must not be
// able to linger forever: a stale vote-out blocks new ones and keeps the
// banner alive for everyone.
const VOTE_OUT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Start a vote-out. Validates BEFORE mutating. Sets session.activeVoteOut.
 *
 * @returns {object} the created vote-out
 * @throws on missing users, self-target, or an unexpired vote-out in progress
 */
const createVoteOut = (session, { initiatorId, targetId, now = new Date(), thresholdPercent = VOTE_OUT_THRESHOLD_PERCENT, timeoutMs = VOTE_OUT_TIMEOUT_MS }) => {
  if (!session.users[initiatorId]) throw new Error('User not found in session');
  if (!session.users[targetId]) throw new Error('Target user not found in session');
  if (initiatorId === targetId) throw new Error('Cannot vote out yourself');
  if (session.activeVoteOut) {
    if (!isVoteOutExpired(session.activeVoteOut, now)) {
      throw new Error('A vote-out is already in progress');
    }
    // A stale vote-out must not block the next one — expire it first.
    session.activeVoteOut = null;
  }

  const allParticipants = Object.keys(session.users);
  const voteOut = {
    targetUserId: targetId,
    initiatedByUserId: initiatorId,
    yesVotes: [], // userIds — JSON-safe arrays, never Sets
    noVotes: [],
    eligibleVoters: allParticipants.filter((id) => id !== targetId),
    requiredYesVotes: computeVoteOutRequired(allParticipants.length, thresholdPercent),
    thresholdPercent,
    startedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    expiresAt: new Date((now instanceof Date ? now.getTime() : new Date(now).getTime()) + timeoutMs).toISOString(),
  };
  session.activeVoteOut = voteOut;
  return voteOut;
};

/** True when the vote-out is past its expiresAt timestamp. */
const isVoteOutExpired = (activeVoteOut, now = new Date()) => {
  if (!activeVoteOut) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return new Date(activeVoteOut.expiresAt || activeVoteOut.startedAt).getTime() <= nowMs;
};

/**
 * Cast (or change) the caller's vote. Validates BEFORE mutating.
 * Returns `{ result, removedUser }` where result is one of:
 *   'pending' | 'removed' | 'target-left' | 'failed' | 'expired'
 */
const castVoteOutVote = (session, { voterId, targetId, vote, now = new Date() }) => {
  if (!session.users[voterId]) throw new Error('User not found in session');
  const activeVoteOut = session.activeVoteOut;
  if (!activeVoteOut) throw new Error('No vote-out is in progress');
  if (activeVoteOut.targetUserId !== targetId) throw new Error('Target user does not match active vote-out');
  if (!activeVoteOut.eligibleVoters.includes(voterId)) throw new Error('You are not eligible to vote');

  // Lazy expiry: an unexpired-at-vote-time check keeps the sweep honest even
  // if no cleanup cycle ran between start and this vote.
  if (isVoteOutExpired(activeVoteOut, now)) {
    session.activeVoteOut = null;
    return { result: 'expired', removedUser: null };
  }

  activeVoteOut.yesVotes = activeVoteOut.yesVotes.filter((id) => id !== voterId);
  activeVoteOut.noVotes = activeVoteOut.noVotes.filter((id) => id !== voterId);
  if (vote === 'yes') activeVoteOut.yesVotes.push(voterId);
  else activeVoteOut.noVotes.push(voterId);

  if (activeVoteOut.yesVotes.length >= activeVoteOut.requiredYesVotes) {
    const removedUser = session.users[targetId] || null;
    session.activeVoteOut = null;
    if (!removedUser) return { result: 'target-left', removedUser: null }; // target already gone
    // Removal is part of the same atomic transition — the vote-out is never
    // cleared while the target is still present.
    delete session.users[targetId];
    delete session.votes[targetId];
    return { result: 'removed', removedUser };
  }

  if (activeVoteOut.noVotes.length > (activeVoteOut.eligibleVoters.length - activeVoteOut.requiredYesVotes)) {
    // Enough no votes to make the threshold mathematically impossible.
    session.activeVoteOut = null;
    return { result: 'failed', removedUser: null };
  }

  return { result: 'pending', removedUser: null };
};

/**
 * Reconcile the active vote-out after a participant left/was removed.
 * Mutates the session; returns an outcome for the caller to broadcast, or
 * null when there was no active vote-out.
 *
 *   { outcome: 'target-left' }        — the removed user was the target
 *   { outcome: 'impossible' }         — threshold can no longer be reached
 *   { outcome: 'unchanged' }          — vote-out continues without them
 *
 * A departed user's yes/no votes no longer count (no ghost votes), and the
 * vote-out can never hang forever: if the remaining eligible voters can no
 * longer mathematically reach `requiredYesVotes`, it is cancelled.
 */
const pruneVoteOutForRemovedUser = (session, removedUserId) => {
  const activeVoteOut = session.activeVoteOut;
  if (!activeVoteOut) return null;
  const targetUserId = activeVoteOut.targetUserId;

  if (removedUserId === targetUserId) {
    session.activeVoteOut = null;
    return { outcome: 'target-left', targetUserId };
  }

  activeVoteOut.eligibleVoters = activeVoteOut.eligibleVoters.filter((id) => id !== removedUserId);
  activeVoteOut.yesVotes = activeVoteOut.yesVotes.filter((id) => id !== removedUserId);
  activeVoteOut.noVotes = activeVoteOut.noVotes.filter((id) => id !== removedUserId);

  const possibleYes = activeVoteOut.eligibleVoters.length - activeVoteOut.yesVotes.length;
  const impossibleByNo = activeVoteOut.noVotes.length > (activeVoteOut.eligibleVoters.length - activeVoteOut.requiredYesVotes);
  if (activeVoteOut.yesVotes.length < activeVoteOut.requiredYesVotes &&
      (activeVoteOut.eligibleVoters.length === 0 ||
       possibleYes < activeVoteOut.requiredYesVotes ||
       impossibleByNo)) {
    session.activeVoteOut = null;
    return { outcome: 'impossible', targetUserId };
  }

  return { outcome: 'unchanged', targetUserId };
};

/**
 * Expire a stale vote-out in place. Returns a `vote-out-ended`-style delta
 * ({ targetUserId, removed, reason }) when it expired, else null.
 */
const expireIfStale = (session, now = new Date()) => {
  if (!session.activeVoteOut) return null;
  if (!isVoteOutExpired(session.activeVoteOut, now)) return null;
  const targetUserId = session.activeVoteOut.targetUserId;
  session.activeVoteOut = null;
  return {
    targetUserId,
    removed: false,
    reason: 'Vote-out expired without enough votes',
  };
};

/**
 * Client-safe view of an active vote-out: JSON-safe by construction, names
 * resolved, tallies as numbers, and WITHOUT individual voter identities
 * (clients only ever display tallies).
 */
const publicVoteOutView = (session) => {
  const vo = session.activeVoteOut;
  if (!vo) return null;
  return {
    targetUserId: vo.targetUserId,
    targetUserName: session.users[vo.targetUserId]?.name || null,
    initiatedByUserId: vo.initiatedByUserId,
    initiatedByName: session.users[vo.initiatedByUserId]?.name || null,
    eligibleVoters: [...vo.eligibleVoters],
    yesVotes: vo.yesVotes.length,
    noVotes: vo.noVotes.length,
    requiredYesVotes: vo.requiredYesVotes,
    thresholdPercent: vo.thresholdPercent,
  };
};

module.exports = {
  computeVoteOutRequired,
  VOTE_OUT_THRESHOLD_PERCENT,
  VOTE_OUT_TIMEOUT_MS,
  createVoteOut,
  isVoteOutExpired,
  castVoteOutVote,
  pruneVoteOutForRemovedUser,
  expireIfStale,
  publicVoteOutView,
};