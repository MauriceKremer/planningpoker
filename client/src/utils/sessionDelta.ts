/**
 * Client-side session delta reducer.
 *
 * Single responsibility: merge a server delta into the local session state.
 * Pure — no React, no socket I/O — and the one source of truth for how each
 * event mutates local state; the socket hook just dispatches to it.
 *
 * The server broadcasts minimal deltas (see server `socket/eventPayloads.js`)
 * instead of the full session object, so the client reconstructs state
 * locally. `session-joined` (the initial full-state load) is handled directly
 * in the hook and is NOT routed here.
 *
 * The reducer switches over the discriminated `EventInput` union, so each
 * branch narrows to that event's exact payload — the compile-time contract
 * check across every case.
 */
import { type EventInput, type EventName, type EventPayload } from '../protocol/events';
import type { SessionState } from '../protocol/session';

/** A completed round's vote map, plus the voter ids it implies. */
const revealedVotes = (votes: SessionState['votes'] | undefined) => ({
  votes: { ...(votes ?? {}) },
  votedUserIds: Object.keys(votes ?? {}),
});

/**
 * The fully-typed reducer core.
 */
const applyEventInput = (prev: SessionState, input: EventInput): SessionState => {
  const { event, data } = input;
  switch (event) {
    case 'vote-submitted': {
      // While voting is open the payload carries WHO has voted (ids only) —
      // never card values. Values are revealed only via the complete map.
      const reveal = Boolean(data.votingComplete && data.votes);
      return {
        ...prev,
        votes: reveal ? { ...data.votes! } : prev.votes,
        votedUserIds: reveal
          ? Object.keys(data.votes!)
          : (data.votedUserIds ?? prev.votedUserIds ?? []),
        votingComplete: data.votingComplete,
        isVotingOpen: data.isVotingOpen,
      };
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
      return {
        ...prev,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        ...revealedVotes(data.votes),
      };

    case 'voting-started':
      return {
        ...prev,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        ...revealedVotes(data.votes),
        round: data.round ?? prev.round,
        cardSet: data.cardSet ?? prev.cardSet,
      };

    case 'round-stopped':
      return {
        ...prev,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        ...revealedVotes(data.votes),
        round: data.round ?? prev.round,
      };

    case 'card-set-updated':
      return {
        ...prev,
        cardSet: data.cardSet,
        isVotingOpen: data.isVotingOpen,
        votingComplete: data.votingComplete,
        ...revealedVotes(data.votes),
      };

    case 'vote-out-started':
      return { ...prev, activeVoteOut: { ...data } };

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
      return { ...prev, users: { ...prev.users, [data.user.id]: data.user } };

    case 'user-disconnected':
      return { ...prev, users: { ...prev.users, [data.userId]: data.user } };

    case 'user-countdown':
      return {
        ...prev,
        users: {
          ...prev.users,
          [data.userId]: { ...data.user, countdownSeconds: data.remainingSeconds },
        },
      };

    case 'user-name-updated':
      return {
        ...prev,
        users: { ...prev.users, [data.userId]: data.user },
        moderator: data.isModeratorNameUpdate
          ? data.moderatorName ?? prev.moderator
          : prev.moderator,
      };

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
      const votedUserIds = (prev.votedUserIds ?? []).filter(id => id !== data.userId);
      return { ...prev, users, votes, votedUserIds };
    }

    default:
      // Hook-owned events (session-joined, session-closed, session-cleanup,
      // connection-conflict, you-were-removed, test-sound-trigger,
      // leave-acknowledged) intentionally do not mutate local session state.
      return prev;
  }
};

/**
 * 3-arg façade preserving the historical call signature
 * `applyEvent(prev, event, data)` used by the socket hook and the tests.
 *
 * `event` and `data` are bundled into the discriminated `EventInput` so the
 * core reducer gets its per-event narrowing. The cast is a single, justified
 * boundary (the values come straight from a call site that was checked against
 * `EventPayload<E>`), not a value of unknown shape.
 */
export const applyEvent = <E extends EventName = EventName>(
  prev: SessionState,
  event: E,
  data: EventPayload<E>,
): SessionState => applyEventInput(prev, { event, data } as EventInput);