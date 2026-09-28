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
 *
 * M5.2: every payload a builder produces is validated against the shared
 * socket contract (`src/protocol/eventSchemas.js`) at construction time —
 * fail-fast, so a contract violation surfaces as an `error` event instead of
 * broadcasting a delta that would silently corrupt client state.
 */
const { assertOutgoing } = require('../protocol/eventSchemas');

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

/**
 * Builds the payload for `event` and validates it against the shared socket
 * contract. Throwing on violation is deliberate (fail-fast near the bug); the
 * emitting handler's catch turns it into an `error` event.
 */
const build = (event, make) => (...args) => assertOutgoing(event, make(...args));

module.exports = {
  voteSubmitted: build('vote-submitted', voteSubmitted),
  voteAccepted: build('vote-accepted', voteAccepted),
  votesReset: build('votes-reset', votesReset),
  votingStarted: build('voting-started', votingStarted),
  roundStopped: build('round-stopped', roundStopped),
  cardSetUpdated: build('card-set-updated', cardSetUpdated),
  moderatorChanged: build('moderator-changed', moderatorChanged),
  userNameUpdated: build('user-name-updated', userNameUpdated),
  participantRemoved: build('participant-removed', participantRemoved),
  voteOutStarted: build('vote-out-started', voteOutStarted),
  voteOutCast: build('vote-out-cast', voteOutCast),
  voteOutEnded: build('vote-out-ended', voteOutEnded),
};