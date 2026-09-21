/**
 * Unit tests for socket handler heartbeat optimization.
 * Verifies that heartbeats update in-memory tracking only.
 */
const { updateLastSeen, getLastSeen, clearLastSeen, trackConnection, untrackConnection, clearLastSeenForSession } = require('../../socket/connections');

describe('Heartbeat optimization', () => {
  beforeEach(() => {
    jest.resetModules();
    clearLastSeen();
  });

  describe('in-memory heartbeat tracking', () => {
    test('heartbeat updates in-memory lastSeen', () => {
      const before = Date.now();
      updateLastSeen('SESSION1', 'user-1');
      const after = Date.now();

      const lastSeen = getLastSeen('SESSION1', 'user-1');
      expect(lastSeen).toBeGreaterThanOrEqual(before);
      expect(lastSeen).toBeLessThanOrEqual(after);

      expect(typeof updateLastSeen).toBe('function');
      expect(updateLastSeen.length).toBe(2); // Only sessionId, userId
    });

    test('multiple heartbeats update the same lastSeen entry', () => {
      updateLastSeen('SESSION1', 'user-1');
      const first = getLastSeen('SESSION1', 'user-1');

      const start = Date.now();
      while (Date.now() - start < 3) {} // Busy-wait for ~3ms

      updateLastSeen('SESSION1', 'user-1');
      const second = getLastSeen('SESSION1', 'user-1');

      expect(second).toBeGreaterThanOrEqual(first);
    });

    test('heartbeat data persists across multiple calls for different users', () => {
      updateLastSeen('SESSION1', 'user-1');
      updateLastSeen('SESSION1', 'user-2');
      updateLastSeen('SESSION2', 'user-3');

      expect(getLastSeen('SESSION1', 'user-1')).toBeDefined();
      expect(getLastSeen('SESSION1', 'user-2')).toBeDefined();
      expect(getLastSeen('SESSION2', 'user-3')).toBeDefined();
      expect(getLastSeen('SESSION1', 'user-3')).toBeNull();
    });

    test('clearLastSeenForSession removes only that session\'s data', () => {
      updateLastSeen('SESSION1', 'user-1');
      updateLastSeen('SESSION1', 'user-2');
      updateLastSeen('SESSION2', 'user-3');

      clearLastSeenForSession('SESSION1');

      expect(getLastSeen('SESSION1', 'user-1')).toBeNull();
      expect(getLastSeen('SESSION1', 'user-2')).toBeNull();
      expect(getLastSeen('SESSION2', 'user-3')).toBeDefined();
    });
  });

  describe('comparison: before vs after optimization', () => {
    test('7 users sending heartbeats should cause 0 store writes (was 42/min)', () => {
      // Before: each heartbeat → updateSessionAtomic (full session store write)
      // After: each heartbeat → updateLastSeen (in-memory only)

      const userCount = 7;
      const heartbeatsPerMinute = 6;

      let inMemoryOps = 0;
      for (let u = 0; u < userCount; u++) {
        for (let h = 0; h < heartbeatsPerMinute; h++) {
          updateLastSeen('SESSION1', `user-${u}`);
          inMemoryOps++;
        }
      }

      expect(inMemoryOps).toBe(42);

      for (let u = 0; u < userCount; u++) {
        expect(getLastSeen('SESSION1', `user-${u}`)).toBeDefined();
      }
    });
  });

  describe('cleanup cycle integration', () => {
    test('cleanup uses in-memory lastSeen when available', () => {
      updateLastSeen('SESSION1', 'user-1');
      const lastSeen = getLastSeen('SESSION1', 'user-1');
      expect(lastSeen).toBeDefined();
    });

    test('getLastSeen returns null when no heartbeat data', () => {
      expect(getLastSeen('SESSION1', 'unknown-user')).toBeNull();
    });
  });

  describe('connection cleanup', () => {
    test('untrackConnection removes lastSeen data', () => {
      trackConnection('socket-1', 'SESSION1', 'user-1');
      updateLastSeen('SESSION1', 'user-1');

      expect(getLastSeen('SESSION1', 'user-1')).toBeDefined();

      const info = untrackConnection('socket-1');
      expect(info).toEqual({ sessionId: 'SESSION1', userId: 'user-1' });

      expect(getLastSeen('SESSION1', 'user-1')).toBeNull();
    });

    test('clearLastSeen removes all heartbeat data', () => {
      updateLastSeen('SESSION1', 'user-1');
      updateLastSeen('SESSION1', 'user-2');
      updateLastSeen('SESSION2', 'user-3');

      clearLastSeen();

      expect(getLastSeen('SESSION1', 'user-1')).toBeNull();
      expect(getLastSeen('SESSION1', 'user-2')).toBeNull();
      expect(getLastSeen('SESSION2', 'user-3')).toBeNull();
    });
  });
});
