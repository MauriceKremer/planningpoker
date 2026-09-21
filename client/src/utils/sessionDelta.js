/**
 * Client-side session delta reducer.
 *
 * SOLID — Single Responsibility: merge a server delta into the local
 *   session state. Pure, no React, no socket I/O.
 * DRY    — one function is the single source of truth for how each event
 *   mutates local state; the socket hook just dispatches to it.
 * KISS   — plain switch over event names; immutable shallow updates.
 *
 * The server now broadcasts minimal deltas (see server
 * `socket/eventPayloads.js`) instead of the full session object, so the
 * client reconstructs state locally. `session-joined` (the initial full
 * state load) is handled directly in the hook and is NOT routed here.
 */

const applyEvent = (prev, event, data) => {
  switch (event) {
    case 'vote-submitted': {
      // While voting is open the payload carries WHO has voted (ids only) —
      // never card values. Values are only revealed via the complete map.
      const votedUserIds = data.votingComplete && data.votes
        ? Object.keys(data.votes)
        : (Array.isArray(data.votedUserIds) ? [...data.votedUserIds] : (prev.votedUserIds || []));
      const votes = (data.votingComplete && data.votes)
        ? { ...data.votes }
        : prev.votes; // own vote (optimistic / vote-accepted) is preserved
      return { ...prev, votes, votedUserIds, votingComplete: data.votingComplete, isVotingOpen: data.isVotingOpen };
    }

    // Targeted server echo for the voter only (never broadcast). Confirms the
    // validated card value so the voter's UI reflects the accepted vote.
    case 'vote-accepted':
      return {
        ...prev,
        votes: { ...prev.votes, [data.userId]: data.vote },
        votingComplete: data.votingComplete,
        isVotingOpen: data.isVotingOpen,
      };

    case 'votes-reset':
      return { ...prev, isVotingOpen: data.isVotingOpen, votingComplete: data.votingComplete, votes: { ...data.votes }, votedUserIds: [] };

    case 'voting-started':
      return {
        ...prev,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        votes: { ...data.votes },
        votedUserIds: [],
        round: data.round ?? prev.round,
        cardSet: data.cardSet ?? prev.cardSet,
      };

    case 'round-stopped':
      return {
        ...prev,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        votes: { ...data.votes },
        votedUserIds: data.votes ? Object.keys(data.votes) : (prev.votedUserIds || []),
        round: data.round ?? prev.round,
      };

    case 'card-set-updated':
      return {
        ...prev,
        cardSet: data.cardSet,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        votes: { ...data.votes },
        votedUserIds: [],
      };

    case 'vote-out-started':
      return {
        ...prev,
        activeVoteOut: {
          targetUserId: data.targetUserId,
          targetUserName: data.targetUserName,
          initiatedByUserId: data.initiatedByUserId,
          initiatedByName: data.initiatedByName,
          eligibleVoters: data.eligibleVoters,
          yesVotes: data.yesVotes,
          noVotes: data.noVotes,
          requiredYesVotes: data.requiredYesVotes,
          thresholdPercent: data.thresholdPercent,
        },
      };

    case 'vote-out-cast': {
      if (!prev.activeVoteOut) return prev;
      return {
        ...prev,
        activeVoteOut: {
          ...prev.activeVoteOut,
          yesVotes: data.yesVotes,
          noVotes: data.noVotes,
          requiredYesVotes: data.requiredYesVotes,
        },
      };
    }

    case 'vote-out-ended':
      return { ...prev, activeVoteOut: null };

    case 'user-joined':
    case 'user-status-changed':
      return { ...prev, users: { ...prev.users, [data.user.id]: data.user } };

    case 'user-disconnected':
      return { ...prev, users: { ...prev.users, [data.userId]: data.user } };

    case 'user-countdown':
      return { ...prev, users: { ...prev.users, [data.userId]: { ...data.user, countdownSeconds: data.remainingSeconds } } };

    case 'user-name-updated': {
      const users = { ...prev.users, [data.userId]: data.user };
      const next = { ...prev, users };
      if (data.isModeratorNameUpdate && data.moderatorName) next.moderator = data.moderatorName;
      return next;
    }

    case 'moderator-changed': {
      const users = { ...prev.users };
      if (data.newModerator) users[data.newModeratorId] = data.newModerator;
      if (data.previousModerator) users[data.previousModeratorId] = data.previousModerator;
      return {
        ...prev,
        users,
        moderatorId: data.newModeratorId,
        moderator: data.newModeratorName ?? prev.moderator,
      };
    }

    case 'participant-removed':
    case 'participant-auto-removed': {
      const users = { ...prev.users };
      const votes = { ...prev.votes };
      delete users[data.userId];
      delete votes[data.userId];
      const votedUserIds = (prev.votedUserIds || []).filter(id => id !== data.userId);
      return { ...prev, users, votes, votedUserIds };
    }

    default:
      return prev;
  }
};

export { applyEvent };