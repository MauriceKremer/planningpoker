/**
 * Pure delta-payload builders for socket broadcasts.
 *
 * SOLID — Single Responsibility: turn a session (+context) into the
 *   minimal object a client needs to update its local state.
 * DRY    — every event's "what changed" is expressed once, here.
 * KISS   — plain functions, no I/O, no mutation of the input session.
 *
 * Contract: NO builder ever returns a `session` key. Clients merge
 * these deltas into their local session copy (see client
 * `utils/sessionDelta.js`). This avoids re-serializing and fanning out
 * the full session on every vote — the root cause of the "resources
 * hammered when voting starts" regression.
 */

/** Number of keys in an object (null/undefined safe). */
const keyCount = (obj) => (obj ? Object.keys(obj).length : 0);

/**
 * Broadcast to the whole room. Deliberately does NOT include the vote value:
 * individual votes must stay hidden until the round completes (see
 * `sanitizeSession`). Clients learn WHO has voted via `votedUserIds` (ids are
 * public — the UI shows a "✓ Voted" badge); the VALUES are only ever
 * broadcast once `votingComplete` is true. The voter's own value is echoed
 * separately via the targeted `vote-accepted` event (see socketHandler).
 */
const voteSubmitted = (session, userId) => ({
  userId,
  hasVoted: true,
  votingComplete: session.votingComplete,
  isVotingOpen: session.isVotingOpen,
  // Reveal values only once the round is complete; while open, expose only
  // the ids of users who have voted (never what they voted).
  votes: session.votingComplete ? session.votes : null,
  votedUserIds: Object.keys(session.votes),
  voteCount: keyCount(session.votes),
  totalUsers: keyCount(session.users),
});

/**
 * Targeted echo for the voter only. Carries the validated vote value so the
 * voter's UI reflects the server-accepted card (reconciles the optimistic
 * update and survives rejected/stale local state).
 */
const voteAccepted = (session, userId, vote) => ({
  userId,
  vote,
  votingComplete: session.votingComplete,
  isVotingOpen: session.isVotingOpen,
});

const votesReset = (session) => ({
  isVotingOpen: session.isVotingOpen,
  votingComplete: session.votingComplete,
  votes: session.votes,
});

const votingStarted = (session) => ({
  isVotingOpen: session.isVotingOpen,
  votingComplete: session.votingComplete,
  votes: session.votes,
  round: session.round,
  cardSet: session.cardSet,
});

const roundStopped = (session, stoppedBy) => ({
  isVotingOpen: session.isVotingOpen,
  votingComplete: session.votingComplete,
  votes: session.votes,
  round: session.round,
  stoppedBy,
});

const cardSetUpdated = (session, updatedBy) => ({
  cardSet: session.cardSet,
  updatedBy,
  isVotingOpen: session.isVotingOpen,
  votingComplete: session.votingComplete,
  votes: session.votes,
});

const moderatorChanged = (session, newModeratorId, previousModeratorId, wasManualTransfer) => {
  const newMod = session.users[newModeratorId];
  const prevMod = session.users[previousModeratorId];
  return {
    newModeratorId,
    newModeratorName: newMod ? newMod.name : null,
    previousModeratorId,
    previousModeratorName: prevMod ? prevMod.name : null,
    newModerator: newMod,
    previousModerator: prevMod,
    wasManualTransfer,
  };
};

const userNameUpdated = (session, userId, oldName, newName) => {
  const isModeratorNameUpdate = session.moderatorId === userId;
  return {
    userId,
    oldName,
    newName,
    user: session.users[userId],
    isModeratorNameUpdate,
    moderatorName: isModeratorNameUpdate ? newName : undefined,
  };
};

const participantRemoved = (targetUserId, removedUser, removedByName) => ({
  userId: targetUserId,
  user: removedUser,
  removedBy: removedByName,
});

const voteOutStarted = (session, targetUserId, initiatedByUserId, initiatedByName) => {
  const activeVoteOut = session.activeVoteOut;
  if (!activeVoteOut) return {};
  return {
    targetUserId,
    targetUserName: session.users[targetUserId]?.name || null,
    initiatedByUserId,
    initiatedByName,
    eligibleVoters: activeVoteOut.eligibleVoters,
    yesVotes: activeVoteOut.yesVotes.length,
    noVotes: activeVoteOut.noVotes.length,
    requiredYesVotes: activeVoteOut.requiredYesVotes,
    thresholdPercent: activeVoteOut.thresholdPercent,
  };
};

const voteOutCast = (session) => {
  const activeVoteOut = session.activeVoteOut;
  if (!activeVoteOut) return {};
  return {
    targetUserId: activeVoteOut.targetUserId,
    yesVotes: activeVoteOut.yesVotes.length,
    noVotes: activeVoteOut.noVotes.length,
    requiredYesVotes: activeVoteOut.requiredYesVotes,
  };
};

const voteOutEnded = (session, targetUserId, removed, reason, removedUser = null) => ({
  targetUserId,
  removed,
  reason,
  // The stored user is already deleted on successful removal — fall back to
  // the captured object so clients still receive who was removed.
  userId: removed ? targetUserId : undefined,
  user: removed ? (session.users[targetUserId] || removedUser) : undefined,
});

module.exports = {
  voteSubmitted,
  voteAccepted,
  votesReset,
  votingStarted,
  roundStopped,
  cardSetUpdated,
  moderatorChanged,
  userNameUpdated,
  participantRemoved,
  voteOutStarted,
  voteOutCast,
  voteOutEnded,
};