/**
 * Unit tests for the "vote out participant" feature.
 *
 * Tests the pure helpers and the socket event payloads in isolation.
 * End-to-end socket behavior is covered by the integration test suite.
 */
const { computeVoteOutRequired } = require('../../services/sessionService');
const {
  createVoteOut,
  castVoteOutVote,
  pruneVoteOutForRemovedUser,
  expireIfStale,
  isVoteOutExpired,
  publicVoteOutView,
  VOTE_OUT_THRESHOLD_PERCENT,
  VOTE_OUT_TIMEOUT_MS,
} = require('../../socket/voteOut');
const { voteOutStarted, voteOutCast, voteOutEnded } = require('../../socket/eventPayloads');
const { VOTE_OUT_THRESHOLD_PERCENT: THRESHOLD_FROM_CLEANUP } = require('../../socket/cleanupPolicy');

const makeSession = (userCount = 4, overrides = {}) => {
  const users = {};
  for (let i = 1; i <= userCount; i++) {
    users[`user-${i}`] = {
      id: `user-${i}`,
      name: `User ${i}`,
      isModerator: i === 1,
      isOnline: true,
      lastSeen: '2024-01-01T00:00:00.000Z',
      joinedAt: '2024-01-01T00:00:00.000Z',
    };
  }
  return {
    id: 'ABC12345',
    title: 'Vote Out Test',
    moderator: 'User 1',
    moderatorId: 'user-1',
    users,
    votes: {},
    isVotingOpen: false,
    votingComplete: false,
    round: 1,
    cardSet: ['1', '2', '3'],
    createdAt: '2024-01-01T00:00:00.000Z',
    lastActivity: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
};

const makeVoteOut = (overrides = {}) => ({
  targetUserId: 'user-3',
  initiatedByUserId: 'user-2',
  yesVotes: [], // userIds — JSON-safe arrays, never Sets
  noVotes: [],
  eligibleVoters: ['user-1', 'user-2', 'user-4'],
  requiredYesVotes: 1,
  thresholdPercent: 25,
  startedAt: '2024-01-01T00:00:00.000Z',
  expiresAt: '2024-01-01T00:02:00.000Z',
  ...overrides,
});

describe('computeVoteOutRequired', () => {
  test('25% threshold rounds up', () => {
    expect(computeVoteOutRequired(1, 25)).toBe(1);
    expect(computeVoteOutRequired(2, 25)).toBe(1);
    expect(computeVoteOutRequired(3, 25)).toBe(1);
    expect(computeVoteOutRequired(4, 25)).toBe(1);
    expect(computeVoteOutRequired(5, 25)).toBe(2);
    expect(computeVoteOutRequired(8, 25)).toBe(2);
    expect(computeVoteOutRequired(9, 25)).toBe(3);
  });

  test('zero participants returns 0', () => {
    expect(computeVoteOutRequired(0, 25)).toBe(0);
  });

  test('uses 25% default when threshold omitted', () => {
    expect(computeVoteOutRequired(4)).toBe(1);
    expect(computeVoteOutRequired(8)).toBe(2);
  });
});

describe('voteOut payload builders', () => {
  test('voteOutStarted returns no session key and correct fields', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut() });
    const payload = voteOutStarted(session, 'user-3', 'user-2', 'User 2');

    expect(payload).not.toHaveProperty('session');
    expect(payload.targetUserId).toBe('user-3');
    expect(payload.targetUserName).toBe('User 3');
    expect(payload.initiatedByUserId).toBe('user-2');
    expect(payload.initiatedByName).toBe('User 2');
    expect(payload.eligibleVoters).toEqual(['user-1', 'user-2', 'user-4']);
    expect(payload.yesVotes).toBe(0);
    expect(payload.noVotes).toBe(0);
    expect(payload.requiredYesVotes).toBe(1);
    expect(payload.thresholdPercent).toBe(25);
  });

  test('voteOutCast exposes tallies without session key', () => {
    const session = makeSession(4, {
      activeVoteOut: makeVoteOut({
        yesVotes: ['user-1', 'user-2'],
        noVotes: ['user-4'],
      }),
    });
    const payload = voteOutCast(session);

    expect(payload).not.toHaveProperty('session');
    expect(payload.targetUserId).toBe('user-3');
    expect(payload.yesVotes).toBe(2);
    expect(payload.noVotes).toBe(1);
    expect(payload.requiredYesVotes).toBe(1);
  });

  test('voteOutEnded reports successful removal', () => {
    const session = makeSession(4);
    const payload = voteOutEnded(session, 'user-3', true, 'Removed by participant vote');

    expect(payload).not.toHaveProperty('session');
    expect(payload.targetUserId).toBe('user-3');
    expect(payload.removed).toBe(true);
    expect(payload.reason).toBe('Removed by participant vote');
    expect(payload.userId).toBe('user-3');
    expect(payload.user).toEqual(session.users['user-3']);
  });

  test('voteOutEnded reports failed vote without user object', () => {
    const session = makeSession(4);
    const payload = voteOutEnded(session, 'user-3', false, 'Vote-out failed');

    expect(payload.removed).toBe(false);
    expect(payload.userId).toBeUndefined();
    expect(payload.user).toBeUndefined();
  });
});

describe('VOTE_OUT constants', () => {
  test('threshold is 25%', () => {
    expect(VOTE_OUT_THRESHOLD_PERCENT).toBe(25);
  });

  test('cleanupPolicy re-exports the same constants', () => {
    expect(THRESHOLD_FROM_CLEANUP).toBe(25);
    expect(VOTE_OUT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('createVoteOut', () => {
  test('stores a JSON-safe vote-out (no Sets, arrays of ids)', () => {
    const session = makeSession(3);
    const vo = createVoteOut(session, { initiatorId: 'user-2', targetId: 'user-3' });
    expect(vo.yesVotes).toEqual([]);
    expect(vo.noVotes).toEqual([]);
    expect(vo.eligibleVoters).toEqual(['user-1', 'user-2']);
    expect(vo.requiredYesVotes).toBe(1);
    expect(session.activeVoteOut).toBe(vo);
    // JSON-safe: round-trips without damage.
    const roundTrip = JSON.parse(JSON.stringify(vo));
    expect(roundTrip).toEqual(vo);
  });

  test('rejects self-target, missing users, and an unexpired vote-out', () => {
    const session = makeSession(3);
    createVoteOut(session, { initiatorId: 'user-2', targetId: 'user-3' });
    expect(() => createVoteOut(session, { initiatorId: 'user-1', targetId: 'user-1' })).toThrow('Cannot vote out yourself');
    expect(() => createVoteOut(session, { initiatorId: 'user-1', targetId: 'ghost' })).toThrow('Target user not found');
    expect(() => createVoteOut(session, { initiatorId: 'user-1', targetId: 'user-2' })).toThrow('A vote-out is already in progress');
  });

  test('an expired vote-out does not block a new one', () => {
    const session = makeSession(3);
    const now = new Date('2024-01-01T00:00:00.000Z');
    createVoteOut(session, { initiatorId: 'user-2', targetId: 'user-3', now });
    const later = new Date(now.getTime() + VOTE_OUT_TIMEOUT_MS + 1);
    expect(() => createVoteOut(session, { initiatorId: 'user-1', targetId: 'user-2', now: later })).not.toThrow();
    expect(session.activeVoteOut.targetUserId).toBe('user-2');
  });
});

describe('castVoteOutVote', () => {
  // A timestamp safely inside the fixture's startedAt/expiresAt window.
  const CAST_NOW = new Date('2024-01-01T00:00:30.000Z');

  test('records a vote and stays pending below the threshold', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut({ requiredYesVotes: 2 }) });
    const outcome = castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-3', vote: 'yes', now: CAST_NOW });
    expect(outcome.result).toBe('pending');
    expect(session.activeVoteOut.yesVotes).toEqual(['user-1']);
  });

  test('changing the vote moves the user between tallies', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut({ requiredYesVotes: 2 }) });
    castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-3', vote: 'yes', now: CAST_NOW });
    castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-3', vote: 'no', now: CAST_NOW });
    expect(session.activeVoteOut.yesVotes).toEqual([]);
    expect(session.activeVoteOut.noVotes).toEqual(['user-1']);
  });

  test('reaching the threshold removes the target atomically', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut({ requiredYesVotes: 1 }) });
    const targetBefore = { ...session.users['user-3'] };
    const outcome = castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-3', vote: 'yes', now: CAST_NOW });
    expect(outcome.result).toBe('removed');
    expect(outcome.removedUser).toEqual(targetBefore);
    expect(session.users['user-3']).toBeUndefined();
    expect(session.votes['user-3']).toBeUndefined();
    expect(session.activeVoteOut).toBeNull();
  });

  test('enough no votes fail the vote-out', () => {
    // 4 users → 3 eligible, required 1 → rule: noVotes > eligible - required.
    // 2 no votes stay pending (2 > 2 is false); the 3rd makes it impossible.
    const session = makeSession(4, { activeVoteOut: makeVoteOut({ requiredYesVotes: 1 }) });
    castVoteOutVote(session, { voterId: 'user-2', targetId: 'user-3', vote: 'no', now: CAST_NOW });
    expect(castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-3', vote: 'no', now: CAST_NOW }).result).toBe('pending');
    expect(session.activeVoteOut).not.toBeNull();

    const session2 = makeSession(4, { activeVoteOut: makeVoteOut({ requiredYesVotes: 2 }) });
    castVoteOutVote(session2, { voterId: 'user-2', targetId: 'user-3', vote: 'no', now: CAST_NOW });
    const outcome = castVoteOutVote(session2, { voterId: 'user-1', targetId: 'user-3', vote: 'no', now: CAST_NOW });
    expect(outcome.result).toBe('failed'); // 2 no > 3-2 = 1
    expect(session2.users['user-3']).toBeDefined();
    expect(session2.activeVoteOut).toBeNull();
  });

  test('target already left → target-left, no crash', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut({ requiredYesVotes: 1 }) });
    delete session.users['user-3'];
    const outcome = castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-3', vote: 'yes', now: CAST_NOW });
    expect(outcome.result).toBe('target-left');
  });

  test('rejects ineligible voters and mismatched targets', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut() });
    expect(() => castVoteOutVote(session, { voterId: 'user-3', targetId: 'user-3', vote: 'yes', now: CAST_NOW })).toThrow('not eligible');
    expect(() => castVoteOutVote(session, { voterId: 'user-1', targetId: 'user-2', vote: 'yes', now: CAST_NOW })).toThrow('does not match');
  });

  test('lazily expires when past expiresAt', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut() });
    const outcome = castVoteOutVote(session, {
      voterId: 'user-1', targetId: 'user-3', vote: 'yes',
      now: new Date('2024-01-01T00:02:00.001Z'),
    });
    expect(outcome.result).toBe('expired');
    expect(session.activeVoteOut).toBeNull();
  });
});

describe('pruneVoteOutForRemovedUser', () => {
  test('returns null without an active vote-out', () => {
    const session = makeSession(4);
    expect(pruneVoteOutForRemovedUser(session, 'user-2')).toBeNull();
  });

  test('cancels when the removed user is the target', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut() });
    const outcome = pruneVoteOutForRemovedUser(session, 'user-3');
    expect(outcome).toEqual({ outcome: 'target-left', targetUserId: 'user-3' });
    expect(session.activeVoteOut).toBeNull();
  });

  test('drops departed voters (no ghost votes) and keeps the vote-out viable', () => {
    const session = makeSession(4, {
      activeVoteOut: makeVoteOut({
        requiredYesVotes: 2,
        yesVotes: ['user-1'], // will be dropped: voter left
      }),
    });
    const outcome = pruneVoteOutForRemovedUser(session, 'user-1');
    expect(outcome).toEqual({ outcome: 'unchanged', targetUserId: 'user-3' });
    expect(session.activeVoteOut.eligibleVoters).toEqual(['user-2', 'user-4']);
    expect(session.activeVoteOut.yesVotes).toEqual([]); // ghost vote gone
  });

  test('cancels when the threshold becomes mathematically unreachable', () => {
    const session = makeSession(5, {
      activeVoteOut: makeVoteOut({
        eligibleVoters: ['user-1', 'user-2', 'user-4'],
        requiredYesVotes: 2,
      }),
    });
    // Remove enough eligible voters that only 1 unvoted user remains.
    pruneVoteOutForRemovedUser(session, 'user-4');
    const outcome = pruneVoteOutForRemovedUser(session, 'user-2');
    expect(outcome).toEqual({ outcome: 'impossible', targetUserId: 'user-3' });
    expect(session.activeVoteOut).toBeNull();
  });

  test('no-op for a user who already voted and stays viable', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut({ yesVotes: ['user-2'] }) });
    // user-1 leaves: still 2 eligible, 1 yes already — pending
    const outcome = pruneVoteOutForRemovedUser(session, 'user-1');
    expect(outcome).toEqual({ outcome: 'unchanged', targetUserId: 'user-3' });
    expect(session.activeVoteOut.yesVotes).toEqual(['user-2']);
  });
});

describe('expireIfStale', () => {
  test('clears and reports an expired vote-out', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut() });
    const delta = expireIfStale(session, new Date('2024-01-01T00:02:00.001Z'));
    expect(delta).toEqual({
      targetUserId: 'user-3',
      removed: false,
      reason: 'Vote-out expired without enough votes',
    });
    expect(session.activeVoteOut).toBeNull();
  });

  test('keeps an unexpired vote-out', () => {
    const session = makeSession(4, { activeVoteOut: makeVoteOut() });
    expect(expireIfStale(session, new Date('2024-01-01T00:01:00.000Z'))).toBeNull();
    expect(session.activeVoteOut).not.toBeNull();
  });

  test('is a no-op without an active vote-out', () => {
    const session = makeSession(4);
    expect(expireIfStale(session)).toBeNull();
  });
});

describe('publicVoteOutView', () => {
  test('exposes tallies and names without voter identities, JSON-safe', () => {
    const session = makeSession(4, {
      activeVoteOut: makeVoteOut({ yesVotes: ['user-1'] }),
    });
    const view = publicVoteOutView(session);
    expect(view).toEqual({
      targetUserId: 'user-3',
      targetUserName: 'User 3',
      initiatedByUserId: 'user-2',
      initiatedByName: 'User 2',
      eligibleVoters: ['user-1', 'user-2', 'user-4'],
      yesVotes: 1,
      noVotes: 0,
      requiredYesVotes: 1,
      thresholdPercent: 25,
    });
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  test('returns null without an active vote-out', () => {
    expect(publicVoteOutView(makeSession(4))).toBeNull();
  });
});
