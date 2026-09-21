/**
 * Unit tests for the session cleanup decision logic (`applyCleanup`).
 *
 * `applyCleanup` is a PURE function: given a session and a context that
 * exposes in-memory heartbeat/socket state, it mutates the session in
 * place and reports (a) what events to broadcast and (b) whether the
 * session should be deleted.
 *
 * No external store is needed; the in-memory session is mutated directly.
 */
const { applyCleanup } = require('../../socket/cleanupPolicy');

const ISO = '2024-01-01T12:00:00.000Z';
const NOW = new Date(ISO).getTime(); // 1704100800000

const user = (id, overrides = {}) => ({
  id,
  name: id,
  isModerator: false,
  isOnline: true,
  lastSeen: ISO,
  joinedAt: ISO,
  ...overrides,
});

const baseSession = (users) => ({
  id: 'ABC12345',
  title: 'S',
  moderator: 'Alice',
  moderatorId: 'u-mod',
  users,
  votes: {},
  isVotingOpen: false,
  votingComplete: false,
  round: 1,
  cardSet: ['1', '2'],
  createdAt: ISO,
  lastActivity: ISO,
});

const ctx = (overrides = {}) => ({
  sessionId: 'ABC12345',
  now: new Date(NOW),
  getLastSeen: () => null,
  getSocketForUser: () => undefined,
  countdowns: new Map(),
  ...overrides,
});

describe('applyCleanup — decision logic', () => {
  test('does nothing when everyone is active online', () => {
    const session = baseSession({ 'u-1': user('u-1', { isOnline: true }) });
    const result = applyCleanup(session, ctx({
      getLastSeen: () => NOW,                       // fresh heartbeat
      getSocketForUser: () => 'sock-1',             // socket still connected
    }));

    expect(result.events).toEqual([]);
    expect(result.shouldDelete).toBe(false);
    expect(session.users['u-1'].isOnline).toBe(true); // unchanged
  });

  test('reconciles an online user whose stored copy said offline', () => {
    const session = baseSession({ 'u-1': user('u-1', { isOnline: false }) });
    const result = applyCleanup(session, ctx({
      getLastSeen: () => NOW,
      getSocketForUser: () => 'sock-1',
    }));

    expect(session.users['u-1'].isOnline).toBe(true);
  });

  test('starts a countdown for an inactive user and marks them offline', () => {
    const countdowns = new Map();
    // lastSeen 1210s ago → inactive > 1200s, remaining = 1500 - 1210 = 290
    const stale = new Date(NOW - 1210 * 1000).getTime();
    const session = baseSession({ 'u-1': user('u-1', { isOnline: true, lastSeen: new Date(stale).toISOString() }) });
    const result = applyCleanup(session, ctx({
      getLastSeen: () => stale,
      getSocketForUser: () => undefined,            // socket gone
      countdowns,
    }));

    expect(session.users['u-1'].isOnline).toBe(false);
    expect(countdowns.get('u-1')).toBe(290);
    expect(result.events).toContainEqual({
      event: 'user-countdown', data: { userId: 'u-1', user: expect.any(Object), remainingSeconds: 290 },
    });
  });

  test('removes a non-moderator after the 1500s countdown elapses', () => {
    const countdowns = new Map();
    // 1510s ago → remaining = 0
    const stale = new Date(NOW - 1510 * 1000).getTime();
    const session = baseSession({
      'u-mod': user('u-mod', { isModerator: true, isOnline: false, lastSeen: new Date(NOW - 1510*1000).toISOString() }),
      'u-1': user('u-1', { isOnline: false, lastSeen: new Date(stale).toISOString() }),
    });
    const result = applyCleanup(session, ctx({ getLastSeen: () => stale, getSocketForUser: () => undefined, countdowns }));

    expect(session.users['u-1']).toBeUndefined();   // removed
    expect(session.users['u-mod']).toBeDefined();  // moderator never auto-removed
    expect(result.events.some(e => e.event === 'participant-auto-removed')).toBe(true);
    expect(countdowns.has('u-1')).toBe(false);
  });

  test('never auto-removes the moderator even when fully timed out', () => {
    const stale = new Date(NOW - 1520 * 1000).getTime();
    const session = baseSession({ 'u-mod': user('u-mod', { isModerator: true, isOnline: false, lastSeen: new Date(stale).toISOString() }) });
    const result = applyCleanup(session, ctx({ getLastSeen: () => stale, getSocketForUser: () => undefined }));
    expect(session.users['u-mod']).toBeDefined();
    expect(result.events.some(e => e.event === 'participant-auto-removed')).toBe(false);
  });

  test('marks a stale (>24h, no active users) session for deletion', () => {
    const old = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const session = baseSession({ 'u-1': user('u-1', { isOnline: false, lastSeen: old }) });
    session.createdAt = old;
    const result = applyCleanup(session, ctx({ getLastSeen: () => null, getSocketForUser: () => undefined }));
    expect(result.shouldDelete).toBe(true);
    expect(result.events.some(e => e.event === 'session-cleanup')).toBe(true);
  });

  test('does not delete a session younger than 24h even with no active users', () => {
    const session = baseSession({ 'u-1': user('u-1', { isOnline: false, lastSeen: new Date(NOW - 1520*1000).toISOString() }) });
    const result = applyCleanup(session, ctx({ getLastSeen: () => null, getSocketForUser: () => undefined }));
    expect(result.shouldDelete).toBe(false);
  });

  test('clears stale countdowns for users who became active again', () => {
    const countdowns = new Map([['u-1', 99]]);
    const session = baseSession({ 'u-1': user('u-1', { isOnline: true }) });
    applyCleanup(session, ctx({ getLastSeen: () => NOW, getSocketForUser: () => 'sock-1', countdowns }));
    expect(countdowns.has('u-1')).toBe(false);
  });

  describe('vote-out reconciliation during the sweep', () => {
    const activeVoteOut = (overrides = {}) => ({
      targetUserId: 'u-2',
      initiatedByUserId: 'u-mod',
      yesVotes: [],
      noVotes: [],
      eligibleVoters: ['u-mod', 'u-1'],
      requiredYesVotes: 1,
      thresholdPercent: 25,
      startedAt: ISO,
      expiresAt: new Date(NOW + 60 * 1000).toISOString(),
      ...overrides,
    });

    test('expires a stale vote-out even when users are active', () => {
      const session = baseSession({
        'u-mod': user('u-mod', { isModerator: true }),
        'u-1': user('u-1'),
      });
      session.activeVoteOut = activeVoteOut({ expiresAt: new Date(NOW - 1).toISOString() });
      const result = applyCleanup(session, ctx({ getLastSeen: () => NOW, getSocketForUser: () => 'sock-1' }));

      expect(session.activeVoteOut).toBeNull();
      expect(result.events).toContainEqual({
        event: 'vote-out-ended',
        data: { targetUserId: 'u-2', removed: false, reason: 'Vote-out expired without enough votes' },
      });
    });

    test('keeps an unexpired vote-out during the sweep', () => {
      const session = baseSession({
        'u-mod': user('u-mod', { isModerator: true }),
        'u-1': user('u-1'),
      });
      session.activeVoteOut = activeVoteOut();
      applyCleanup(session, ctx({ getLastSeen: () => NOW, getSocketForUser: () => 'sock-1' }));
      expect(session.activeVoteOut).not.toBeNull();
    });

    test('an evicted participant is pruned from the vote-out (no ghost votes)', () => {
      const session = baseSession({
        'u-mod': user('u-mod', { isModerator: true }),
        'u-1': user('u-1', { isOnline: false, lastSeen: new Date(NOW - 1600 * 1000).toISOString() }), // timed out
        'u-2': user('u-2'),
      });
      session.activeVoteOut = activeVoteOut({ eligibleVoters: ['u-mod', 'u-1', 'u-2'], yesVotes: ['u-1'] });
      const result = applyCleanup(session, ctx({ getSocketForUser: () => undefined }));

      expect(session.users['u-1']).toBeUndefined(); // evicted
      expect(session.activeVoteOut).not.toBeNull(); // still viable
      expect(session.activeVoteOut.yesVotes).toEqual([]); // ghost vote pruned
      expect(session.activeVoteOut.eligibleVoters).toEqual(['u-mod', 'u-2']);
      expect(result.events.filter((e) => e.event === 'vote-out-ended')).toEqual([]);
    });

    test('cancels the vote-out when the eviction makes it unreachable', () => {
      const session = baseSession({
        'u-mod': user('u-mod', { isModerator: true }),
        'u-1': user('u-1', { isOnline: false, lastSeen: new Date(NOW - 1600 * 1000).toISOString() }),
        'u-2': user('u-2', { isOnline: false, lastSeen: new Date(NOW - 1600 * 1000).toISOString() }),
      });
      // 3 participants → required 1; evicting u-1 and u-2 leaves 0 eligible.
      session.activeVoteOut = activeVoteOut({ eligibleVoters: ['u-1', 'u-2'] });
      const result = applyCleanup(session, ctx({ getSocketForUser: () => undefined }));

      expect(session.activeVoteOut).toBeNull();
      expect(result.events).toContainEqual({
        event: 'vote-out-ended',
        data: { targetUserId: 'u-2', removed: false, reason: 'Vote-out cancelled: target already left' },
      });
    });
  });
});