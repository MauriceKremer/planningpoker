/**
 * Unit tests for rateLimiter module.
 * Tests the optimized socket event rate limiting.
 */
describe('rateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    jest.resetModules();
    rateLimiter = require('../../socket/rateLimiter');
  });

  afterEach(() => {
    rateLimiter.cleanupRateLimits('test-socket');
  });

  describe('checkRateLimit()', () => {
    test('should allow events within rate limit', () => {
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.checkRateLimit('test-socket', 'test-event')).toBe(true);
      }
    });

    test('should block events that exceed rate limit', () => {
      const RATE_LIMIT_MAX = 60; // Default max
      for (let i = 0; i < RATE_LIMIT_MAX; i++) {
        rateLimiter.checkRateLimit('test-socket', 'test-event');
      }
      // Next event should be blocked
      expect(rateLimiter.checkRateLimit('test-socket', 'test-event')).toBe(false);
    });

    test('should track different events independently', () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkRateLimit('test-socket', 'event-A');
      }
      // event-B should still be allowed even if event-A has many hits
      expect(rateLimiter.checkRateLimit('test-socket', 'event-B')).toBe(true);
    });

    test('should track different sockets independently', () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkRateLimit('socket-A', 'test-event');
      }
      // Different socket should be allowed
      expect(rateLimiter.checkRateLimit('socket-B', 'test-event')).toBe(true);
    });
  });

  describe('cleanupRateLimits()', () => {
    test('should remove all rate limits for a socket', () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkRateLimit('test-socket', 'test-event');
      }
      
      rateLimiter.cleanupRateLimits('test-socket');
      
      // After cleanup, should be allowed again
      expect(rateLimiter.checkRateLimit('test-socket', 'test-event')).toBe(true);
    });

    test('should not affect other sockets', () => {
      rateLimiter.checkRateLimit('socket-A', 'test-event');
      rateLimiter.checkRateLimit('socket-B', 'test-event');
      
      rateLimiter.cleanupRateLimits('socket-A');
      
      // socket-B should still have its rate limit data
      expect(rateLimiter.checkRateLimit('socket-B', 'test-event')).toBe(true);
    });
  });

  describe('resetAllSocketRateLimits()', () => {
    test('should clear all rate limits for all sockets', () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkRateLimit('socket-A', 'test-event');
        rateLimiter.checkRateLimit('socket-B', 'test-event');
      }
      
      rateLimiter.resetAllSocketRateLimits();
      
      // Both sockets should be allowed again
      expect(rateLimiter.checkRateLimit('socket-A', 'test-event')).toBe(true);
      expect(rateLimiter.checkRateLimit('socket-B', 'test-event')).toBe(true);
    });
  });
});