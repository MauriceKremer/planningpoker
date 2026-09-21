/**
 * Unit tests for the client-side session delta reducer.
 *
 * `applyEvent(prev, event, data)` merges a server delta into the local
 * session copy. This is the client half of the delta-payload contract:
 * the server now sends minimal deltas (no full `session`), so the client
 * must reconstruct state locally instead of replacing it wholesale.
 */
import { applyEvent } from '../sessionDelta';

const baseSession = () => ({
  id: 'ABC12345',
  title: 'S',
  moderator: 'Alice',
  moderatorId: 'u-1',
  users: {
    'u-1': { id: 'u-1', name: 'Alice', isModerator: true, isOnline: true },
    'u-2': { id: 'u-2', name: 'Bob', isModerator: false, isOnline: true },
    'u-3': { id: 'u-3', name: 'Charlie', isModerator: false, isOnline: false },
  },
  votes: {},
  isVotingOpen: false,
  votingComplete: false,
  round: 1,
  cardSet: ['1', '2', '3'],
});

describe('sessionDelta.applyEvent', () => {
  test('vote-submitted (open) records who voted — never vote values', () => {
    const next = applyEvent(baseSession(), 'vote-submitted', {
      userId: 'u-2', hasVoted: true, votingComplete: false,
      isVotingOpen: true, votes: null, votedUserIds: ['u-2'], voteCount: 1, totalUsers: 3,
    });
    // No vote value may be stored while the round is open.
    expect(next.votes).toEqual({});
    expect(next.votedUserIds).toEqual(['u-2']);
    expect(next.votingComplete).toBe(false);
    expect(next.isVotingOpen).toBe(true);
  });

  test('vote-submitted (open) preserves the voter\'s own optimistic vote', () => {
    const prev = baseSession();
    prev.votes = { 'u-1': '8' }; // own optimistic vote from handleVote
    const next = applyEvent(prev, 'vote-submitted', {
      userId: 'u-2', hasVoted: true, votingComplete: false,
      isVotingOpen: true, votes: null, votedUserIds: ['u-1', 'u-2'], voteCount: 2, totalUsers: 3,
    });
    expect(next.votes).toEqual({ 'u-1': '8' });
    expect(next.votedUserIds).toEqual(['u-1', 'u-2']);
  });

  test('vote-accepted stores the voter\'s confirmed value (targeted event)', () => {
    const next = applyEvent(baseSession(), 'vote-accepted', {
      userId: 'u-1', vote: '8', votingComplete: false, isVotingOpen: true,
    });
    expect(next.votes).toEqual({ 'u-1': '8' });
    expect(next.votingComplete).toBe(false);
  });

  test('vote-submitted replaces votes with revealed map when complete', () => {
    const revealed = { 'u-1': '8', 'u-2': '5', 'u-3': '5' };
    const next = applyEvent(baseSession(), 'vote-submitted', {
      userId: 'u-3', hasVoted: true, votingComplete: true,
      isVotingOpen: false, votes: revealed, voteCount: 3, totalUsers: 3,
    });
    expect(next.votes).toEqual(revealed);
    expect(next.votedUserIds).toEqual(['u-1', 'u-2', 'u-3']);
    expect(next.votingComplete).toBe(true);
    expect(next.isVotingOpen).toBe(false);
  });

  test('votes-reset resets voting state', () => {
    const prev = baseSession(); prev.votes = { 'u-1': '5' }; prev.votingComplete = true; prev.votedUserIds = ['u-1'];
    const next = applyEvent(prev, 'votes-reset', { isVotingOpen: true, votingComplete: false, votes: {} });
    expect(next.votes).toEqual({});
    expect(next.votedUserIds).toEqual([]);
    expect(next.isVotingOpen).toBe(true);
    expect(next.votingComplete).toBe(false);
  });

  test('voting-started opens voting and keeps cardSet when absent', () => {
    const next = applyEvent(baseSession(), 'voting-started', {
      isVotingOpen: true, votingComplete: false, votes: {}, round: 2,
    });
    expect(next.isVotingOpen).toBe(true);
    expect(next.round).toBe(2);
    expect(next.votes).toEqual({});
    expect(next.cardSet).toEqual(['1', '2', '3']); // preserved
  });

  test('voting-started updates cardSet when provided', () => {
    const next = applyEvent(baseSession(), 'voting-started', {
      isVotingOpen: true, votingComplete: false, votes: {}, round: 1, cardSet: ['XS', 'S', 'M'],
    });
    expect(next.cardSet).toEqual(['XS', 'S', 'M']);
  });

  test('round-stopped records the stopped round', () => {
    const next = applyEvent(baseSession(), 'round-stopped', {
      isVotingOpen: false, votingComplete: true, votes: { 'u-1': '3' }, round: 2, stoppedBy: 'Alice',
    });
    expect(next.round).toBe(2);
    expect(next.votingComplete).toBe(true);
    expect(next.votes).toEqual({ 'u-1': '3' });
    expect(next.votedUserIds).toEqual(['u-1']);
  });

  test('card-set-updated swaps the card set and clears votes', () => {
    const next = applyEvent(baseSession(), 'card-set-updated', {
      cardSet: ['A', 'B'], updatedBy: 'Alice', isVotingOpen: false, votingComplete: false, votes: {},
    });
    expect(next.cardSet).toEqual(['A', 'B']);
    expect(next.votes).toEqual({});
  });

  test('user-joined adds the user', () => {
    const next = applyEvent(baseSession(), 'user-joined', { user: { id: 'u-4', name: 'Dave', isOnline: true } });
    expect(next.users['u-4']).toBeDefined();
  });

  test('user-disconnected updates the user object', () => {
    const next = applyEvent(baseSession(), 'user-disconnected', { userId: 'u-2', user: { id: 'u-2', name: 'Bob', isOnline: false } });
    expect(next.users['u-2'].isOnline).toBe(false);
  });

  test('user-countdown attaches countdownSeconds', () => {
    const next = applyEvent(baseSession(), 'user-countdown', { userId: 'u-3', user: { id: 'u-3', name: 'Charlie', isOnline: false }, remainingSeconds: 42 });
    expect(next.users['u-3'].countdownSeconds).toBe(42);
  });

  test('user-name-updated updates the user and moderator name when relevant', () => {
    const prev = baseSession();
    const next = applyEvent(prev, 'user-name-updated', {
      userId: 'u-1', oldName: 'Alice', newName: 'Alicia',
      user: { id: 'u-1', name: 'Alicia', isModerator: true, isOnline: true },
      isModeratorNameUpdate: true, moderatorName: 'Alicia',
    });
    expect(next.users['u-1'].name).toBe('Alicia');
    expect(next.moderator).toBe('Alicia');
  });

  test('user-name-updated does not touch moderator name for non-moderator rename', () => {
    const next = applyEvent(baseSession(), 'user-name-updated', {
      userId: 'u-2', oldName: 'Bob', newName: 'Robert',
      user: { id: 'u-2', name: 'Robert', isModerator: false, isOnline: true },
      isModeratorNameUpdate: false,
    });
    expect(next.users['u-2'].name).toBe('Robert');
    expect(next.moderator).toBe('Alice');
  });

  test('moderator-changed merges both user objects and the moderator id/name', () => {
    const next = applyEvent(baseSession(), 'moderator-changed', {
      newModeratorId: 'u-2', newModeratorName: 'Bob',
      previousModeratorId: 'u-1', previousModeratorName: 'Alice',
      newModerator: { id: 'u-2', name: 'Bob', isModerator: true, isOnline: true },
      previousModerator: { id: 'u-1', name: 'Alice', isModerator: false, isOnline: true },
      wasManualTransfer: true,
    });
    expect(next.moderatorId).toBe('u-2');
    expect(next.moderator).toBe('Bob');
    expect(next.users['u-2'].isModerator).toBe(true);
    expect(next.users['u-1'].isModerator).toBe(false);
  });

  test('moderator-changed tolerates a missing previous moderator', () => {
    const next = applyEvent(baseSession(), 'moderator-changed', {
      newModeratorId: 'u-2', newModeratorName: 'Bob',
      previousModeratorId: 'gone', previousModeratorName: null,
      newModerator: { id: 'u-2', name: 'Bob', isModerator: true, isOnline: true },
      previousModerator: undefined,
      wasManualTransfer: false,
    });
    expect(next.users['gone']).toBeUndefined();
    expect(next.moderatorId).toBe('u-2');
  });

  test('participant-removed removes the user and their vote', () => {
    const prev = baseSession(); prev.votes = { 'u-3': '5' }; prev.votedUserIds = ['u-3', 'u-1'];
    const next = applyEvent(prev, 'participant-removed', { userId: 'u-3', user: { id: 'u-3', name: 'Charlie' }, removedBy: 'Alice' });
    expect(next.users['u-3']).toBeUndefined();
    expect(next.votes['u-3']).toBeUndefined();
    expect(next.votedUserIds).toEqual(['u-1']);
  });

  test('participant-auto-removed removes the user and vote', () => {
    const prev = baseSession(); prev.votes = { 'u-2': '8' };
    const next = applyEvent(prev, 'participant-auto-removed', { userId: 'u-2', user: { id: 'u-2', name: 'Bob' }, reason: 'Removed due to inactivity' });
    expect(next.users['u-2']).toBeUndefined();
    expect(next.votes['u-2']).toBeUndefined();
  });

  test('vote-out-started attaches activeVoteOut state', () => {
    const next = applyEvent(baseSession(), 'vote-out-started', {
      targetUserId: 'u-3',
      targetUserName: 'Charlie',
      initiatedByUserId: 'u-2',
      initiatedByName: 'Bob',
      eligibleVoters: ['u-1', 'u-2'],
      yesVotes: 0,
      noVotes: 0,
      requiredYesVotes: 1,
      thresholdPercent: 25,
    });
    expect(next.activeVoteOut).toEqual({
      targetUserId: 'u-3',
      targetUserName: 'Charlie',
      initiatedByUserId: 'u-2',
      initiatedByName: 'Bob',
      eligibleVoters: ['u-1', 'u-2'],
      yesVotes: 0,
      noVotes: 0,
      requiredYesVotes: 1,
      thresholdPercent: 25,
    });
  });

  test('vote-out-cast updates activeVoteOut tallies', () => {
    const prev = baseSession();
    prev.activeVoteOut = {
      targetUserId: 'u-3', targetUserName: 'Charlie', initiatedByUserId: 'u-2', initiatedByName: 'Bob',
      eligibleVoters: ['u-1', 'u-2'], yesVotes: 0, noVotes: 0, requiredYesVotes: 1, thresholdPercent: 25,
    };
    const next = applyEvent(prev, 'vote-out-cast', {
      targetUserId: 'u-3', yesVotes: 1, noVotes: 0, requiredYesVotes: 1,
    });
    expect(next.activeVoteOut.yesVotes).toBe(1);
    expect(next.activeVoteOut.noVotes).toBe(0);
  });

  test('vote-out-ended clears activeVoteOut', () => {
    const prev = baseSession();
    prev.activeVoteOut = {
      targetUserId: 'u-3', targetUserName: 'Charlie', initiatedByUserId: 'u-2', initiatedByName: 'Bob',
      eligibleVoters: ['u-1', 'u-2'], yesVotes: 1, noVotes: 0, requiredYesVotes: 1, thresholdPercent: 25,
    };
    const next = applyEvent(prev, 'vote-out-ended', {
      targetUserId: 'u-3', removed: true, reason: 'Removed by participant vote',
    });
    expect(next.activeVoteOut).toBeNull();
  });

  test('unknown event returns the session unchanged', () => {
    const prev = baseSession();
    expect(applyEvent(prev, 'nope', {})).toBe(prev);
  });

  test('does not mutate the previous session object', () => {
    const prev = baseSession();
    const snapshot = JSON.stringify(prev);
    applyEvent(prev, 'vote-submitted', { userId: 'u-2', votingComplete: false, isVotingOpen: true, votes: null, votedUserIds: ['u-2'] });
    expect(JSON.stringify(prev)).toBe(snapshot);
  });
});