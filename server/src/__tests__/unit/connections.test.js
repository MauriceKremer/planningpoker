/**
 * Unit tests for connections module.
 * Tests socket tracking, user mapping, and lastSeen heartbeat tracking.
 */
describe('connections', () => {
  let connections;

  beforeEach(() => {
    jest.resetModules();
    connections = require('../../socket/connections');
  });

  describe('trackConnection() and untrackConnection()', () => {
    test('should track a socket connection', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      
      expect(connections.getSocketForUser('SESSION1', 'user-1')).toBe('socket-1');
      expect(connections.getUserInfo('socket-1')).toEqual({
        sessionId: 'SESSION1',
        userId: 'user-1'
      });
      expect(connections.getSessionConnections('SESSION1')).toContain('socket-1');
    });

    test('should track multiple sockets in the same session', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.trackConnection('socket-2', 'SESSION1', 'user-2');
      
      const sockets = connections.getSessionConnections('SESSION1');
      expect(sockets.size).toBe(2);
      expect(sockets.has('socket-1')).toBe(true);
      expect(sockets.has('socket-2')).toBe(true);
    });

    test('should untrack a socket connection and return user info', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      
      const userInfo = connections.untrackConnection('socket-1');
      expect(userInfo).toEqual({ sessionId: 'SESSION1', userId: 'user-1' });
      
      expect(connections.getSocketForUser('SESSION1', 'user-1')).toBeUndefined();
      expect(connections.getUserInfo('socket-1')).toBeUndefined();
      expect(connections.getSessionConnections('SESSION1')).toBeUndefined();
    });

    test('should return null when untracking unknown socket', () => {
      expect(connections.untrackConnection('unknown-socket')).toBeNull();
    });

    test('should clean up session when last socket disconnects', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.trackConnection('socket-2', 'SESSION1', 'user-2');
      
      connections.untrackConnection('socket-1');
      expect(connections.getSessionConnections('SESSION1').size).toBe(1);
      
      connections.untrackConnection('socket-2');
      expect(connections.getSessionConnections('SESSION1')).toBeUndefined();
    });

    test('should handle connection conflict (same user, new socket)', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.trackConnection('socket-2', 'SESSION1', 'user-1');
      
      // New socket should replace old socket mapping
      expect(connections.getSocketForUser('SESSION1', 'user-1')).toBe('socket-2');
    });
  });

  describe('untrackSession()', () => {
    test('should remove all sockets for a session', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.trackConnection('socket-2', 'SESSION1', 'user-2');
      
      connections.untrackSession('SESSION1');
      
      expect(connections.getSessionConnections('SESSION1')).toBeUndefined();
      expect(connections.getUserInfo('socket-1')).toBeUndefined();
      expect(connections.getUserInfo('socket-2')).toBeUndefined();
    });
  });

  describe('hasActiveConnections()', () => {
    test('should return true when session has connections', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      expect(connections.hasActiveConnections('SESSION1')).toBe(true);
    });

    test('should return false when session has no connections', () => {
      expect(connections.hasActiveConnections('NONEXISTENT')).toBe(false);
    });

    test('should return false after all sockets disconnect', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.untrackConnection('socket-1');
      expect(connections.hasActiveConnections('SESSION1')).toBe(false);
    });
  });

  describe('lastSeen tracking (heartbeat optimization)', () => {
    test('updateLastSeen should track heartbeat timestamp', () => {
      connections.updateLastSeen('SESSION1', 'user-1');
      
      const lastSeen = connections.getLastSeen('SESSION1', 'user-1');
      expect(lastSeen).toBeDefined();
      expect(typeof lastSeen).toBe('number');
      // Should be within last second
      expect(Date.now() - lastSeen).toBeLessThan(1000);
    });

    test('getLastSeen should return null for unknown user', () => {
      expect(connections.getLastSeen('NONEXISTENT', 'unknown-user')).toBeNull();
    });

    test('updateLastSeen should update with recent timestamp on each call', () => {
      connections.updateLastSeen('SESSION1', 'user-1');
      const first = connections.getLastSeen('SESSION1', 'user-1');
      
      // Small delay
      const start = Date.now();
      while (Date.now() - start < 5) {} // Busy wait for ~5ms
      
      connections.updateLastSeen('SESSION1', 'user-1');
      const second = connections.getLastSeen('SESSION1', 'user-1');
      
      expect(second).toBeGreaterThanOrEqual(first);
    });

    test('clearLastSeen should remove all heartbeat tracking data', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.trackConnection('socket-2', 'SESSION1', 'user-2');
      connections.updateLastSeen('SESSION1', 'user-1');
      connections.updateLastSeen('SESSION1', 'user-2');
      
      connections.clearLastSeen();
      
      expect(connections.getLastSeen('SESSION1', 'user-1')).toBeNull();
      expect(connections.getLastSeen('SESSION1', 'user-2')).toBeNull();
    });

    test('clearLastSeenForSession should remove heartbeat data for specific session', () => {
      connections.updateLastSeen('SESSION1', 'user-1');
      connections.updateLastSeen('SESSION2', 'user-2');
      
      connections.clearLastSeenForSession('SESSION1');
      
      expect(connections.getLastSeen('SESSION1', 'user-1')).toBeNull();
      expect(connections.getLastSeen('SESSION2', 'user-2')).toBeDefined();
    });

    test('untrackConnection should also remove lastSeen for that user', () => {
      connections.trackConnection('socket-1', 'SESSION1', 'user-1');
      connections.updateLastSeen('SESSION1', 'user-1');
      expect(connections.getLastSeen('SESSION1', 'user-1')).toBeDefined();
      
      connections.untrackConnection('socket-1');
      expect(connections.getLastSeen('SESSION1', 'user-1')).toBeNull();
    });

    test('lastSeen data should be independent of socket tracking', () => {
      // Track lastSeen without a socket connection
      connections.updateLastSeen('SESSION1', 'user-1');
      
      expect(connections.getLastSeen('SESSION1', 'user-1')).toBeDefined();
      // Socket should still be undefined (no socket tracked)
      expect(connections.getSocketForUser('SESSION1', 'user-1')).toBeUndefined();
    });
  });
});