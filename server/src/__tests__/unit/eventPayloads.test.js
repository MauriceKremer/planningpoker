/**
 * Unit tests for socket event delta-payload builders.
 *
 * Verifies the contract that the server broadcasts MINIMAL deltas
 * (never the full `session` object) on mutating socket events.
 * This is the core fix for the "resources hammered when voting starts"
 * regression: every vote used to re-serialize and fan out the entire
 * session to every participant.
 */
const {
  voteSubmitted,
  voteAccepted,
  votesReset,
  votingStarted,
  roundStopped,
  cardSetUpdated,
  moderatorChanged,
  userNameUpdated,
  participantRemoved,
} = require('../../socket/eventPayloads');

const makeSession = () => ({
  id: 'ABC12345',
  title: 'Test Session',
  moderator: 'Alice',
  moderatorId: 'user-1',
  users: {
    'user-1': { id: 'user-1', name: 'Alice', isModerator: true, isOnline: true, lastSeen: '2024-01-01T00:00:00.000Z', joinedAt: '2024-01-01T00:00:00.000Z' },
    'user-2': { id: 'user-2', name: 'Bob', isModerator: false, isOnline: true, lastSeen: '2024-01-01T00:00:00.000Z', joinedAt: '2024-01-01T00:00:00.000Z' },
    'user-3': { id: 'user-3', name: 'Charlie', isModerator: false, isOnline: false, lastSeen: '2024-01-01T00:00:00.000Z', joinedAt: '2024-01-01T00:00:00.000Z' },
  },
  votes: { 'user-1': '5', 'user-2': '8' },
  isVotingOpen: true,
  votingComplete: false,
  round: 3,
  cardSet: ['0', '1', '2', '3', '5', '8', '13', '21'],
  createdAt: '2024-01-01T00:00:00.000Z',
  lastActivity: '2024-01-01T01:00:00.000Z',
});

const FULL_SIZE = JSON.stringify(makeSession()).length;

describe('eventPayloads — delta contract', () => {
  describe('voteSubmitted', () => {
    test('contains vote delta and never the full session', () => {
      const session = makeSession();
      const payload = voteSubmitted(session, 'user-3');

      expect(payload).not.toHaveProperty('session');
      expect(payload.userId).toBe('user-3');
      // Privacy: the room broadcast must never carry the vote VALUE while the
      // round is open — only who has voted.
      expect(payload).not.toHaveProperty('vote');
      expect(payload.hasVoted).toBe(true);
      expect(payload.votingComplete).toBe(false);
      expect(payload.isVotingOpen).toBe(true);
      expect(payload.votes).toBeNull(); // values hidden while open
      expect(payload.votedUserIds).toEqual(['user-1', 'user-2']);
      expect(payload.voteCount).toBe(2);
      expect(payload.totalUsers).toBe(3);
    });

    test('includes revealed votes only when voting complete', () => {
      const session = makeSession();
      session.votingComplete = true;
      session.isVotingOpen = false;
      const payload = voteSubmitted(session, 'user-3');

      expect(payload.votingComplete).toBe(true);
      expect(payload.votes).toEqual(session.votes);
      expect(payload.votedUserIds).toEqual(Object.keys(session.votes));
      expect(payload.isVotingOpen).toBe(false);
    });

    test('payload is far smaller than the full session', () => {
      const session = makeSession();
      const payload = voteSubmitted(session, 'user-3');
      expect(JSON.stringify(payload).length).toBeLessThan(FULL_SIZE * 0.4);
    });
  });

  describe('voteAccepted', () => {
    test('carries the vote value — intended for the voter only', () => {
      const session = makeSession();
      const payload = voteAccepted(session, 'user-3', '13');
      expect(payload).not.toHaveProperty('session');
      expect(payload.userId).toBe('user-3');
      expect(payload.vote).toBe('13');
      expect(payload.votingComplete).toBe(false);
      expect(payload.isVotingOpen).toBe(true);
    });

    test('reports completion state when the vote closes the round', () => {
      const session = makeSession();
      session.votingComplete = true;
      session.isVotingOpen = false;
      const payload = voteAccepted(session, 'user-3', '13');
      expect(payload.votingComplete).toBe(true);
      expect(payload.isVotingOpen).toBe(false);
    });
  });

  describe('votesReset', () => {
    test('sends only the reset fields', () => {
      const session = makeSession();
      const payload = votesReset(session);
      expect(payload).not.toHaveProperty('session');
      expect(payload).toEqual({ isVotingOpen: true, votingComplete: false, votes: session.votes });
    });
  });

  describe('votingStarted', () => {
    test('sends voting-state delta', () => {
      const session = makeSession();
      const payload = votingStarted(session);
      expect(payload).not.toHaveProperty('session');
      expect(payload).toEqual({
        isVotingOpen: true, votingComplete: false, votes: session.votes, round: 3, cardSet: session.cardSet,
      });
    });
  });

  describe('roundStopped', () => {
    test('sends stopped delta with stoppedBy name', () => {
      const session = makeSession();
      const payload = roundStopped(session, 'Alice');
      expect(payload).not.toHaveProperty('session');
      expect(payload).toEqual({
        isVotingOpen: true, votingComplete: false, votes: session.votes, round: 3, stoppedBy: 'Alice',
      });
    });
  });

  describe('cardSetUpdated', () => {
    test('sends card-set delta', () => {
      const session = makeSession();
      const payload = cardSetUpdated(session, 'Alice');
      expect(payload).not.toHaveProperty('session');
      expect(payload).toEqual({
        cardSet: session.cardSet, updatedBy: 'Alice',
        isVotingOpen: true, votingComplete: false, votes: session.votes,
      });
    });
  });

  describe('moderatorChanged', () => {
    test('sends moderator user objects, ids and names — never full session', () => {
      const session = makeSession();
      const payload = moderatorChanged(session, 'user-2', 'user-1', true);
      expect(payload).not.toHaveProperty('session');
      expect(payload.newModeratorId).toBe('user-2');
      expect(payload.newModeratorName).toBe('Bob');
      expect(payload.previousModeratorId).toBe('user-1');
      expect(payload.previousModeratorName).toBe('Alice');
      expect(payload.newModerator).toEqual(session.users['user-2']);
      expect(payload.previousModerator).toEqual(session.users['user-1']);
      expect(payload.wasManualTransfer).toBe(true);
    });

    test('tolerates a missing previous moderator', () => {
      const session = makeSession();
      const payload = moderatorChanged(session, 'user-2', 'gone', false);
      expect(payload.previousModerator).toBeUndefined();
      expect(payload.previousModeratorName).toBeNull();
    });
  });

  describe('userNameUpdated', () => {
    test('sends the updated user object and name flags', () => {
      const session = makeSession();
      const payload = userNameUpdated(session, 'user-2', 'Bob', 'Robert');
      expect(payload).not.toHaveProperty('session');
      expect(payload.userId).toBe('user-2');
      expect(payload.oldName).toBe('Bob');
      expect(payload.newName).toBe('Robert');
      expect(payload.user).toEqual(session.users['user-2']);
      expect(payload.isModeratorNameUpdate).toBe(false);
    });

    test('flags moderator name updates and exposes new moderator name', () => {
      const session = makeSession();
      const payload = userNameUpdated(session, 'user-1', 'Alice', 'Alicia');
      expect(payload.isModeratorNameUpdate).toBe(true);
      expect(payload.moderatorName).toBe('Alicia');
    });
  });

  describe('participantRemoved', () => {
    test('sends removed user id, object and remover name', () => {
      const removed = { id: 'user-3', name: 'Charlie', isModerator: false };
      const payload = participantRemoved('user-3', removed, 'Alice');
      expect(payload).not.toHaveProperty('session');
      expect(payload).toEqual({ userId: 'user-3', user: removed, removedBy: 'Alice' });
    });
  });

  describe('overall size reduction vs full-session broadcast', () => {
    test('every delta is smaller than the full session', () => {
      const session = makeSession();
      const deltas = [
        voteSubmitted(session, 'user-3'),
        voteAccepted(session, 'user-3', '13'),
        votesReset(session),
        votingStarted(session),
        roundStopped(session, 'Alice'),
        cardSetUpdated(session, 'Alice'),
        moderatorChanged(session, 'user-2', 'user-1', true),
        userNameUpdated(session, 'user-2', 'Bob', 'Robert'),
        participantRemoved('user-3', session.users['user-3'], 'Alice'),
      ];
      deltas.forEach((d) => {
        expect(d).not.toHaveProperty('session');
        expect(JSON.stringify(d).length).toBeLessThan(FULL_SIZE);
      });
    });
  });
});