/**
 * Unit tests for the in-memory session store.
 *
 * Sessions live in a process-local Map — Node's single-threaded event loop
 * makes synchronous mutations atomic, so there is no read cache, no write
 * lock, and no CAS retry. These tests lock down the store contract that
 * socketHandler and the REST routes depend on.
 */

describe('in-memory session store', () => {
  let sessionService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    sessionService = require('../../services/sessionService');
    // Clear any sessions left by previous tests.
    for (const [id] of sessionService.getAllSessions()) sessionService.deleteSession(id);
  });

  describe('createSession', () => {
    test('creates a session with a moderator and an 8-char id', () => {
      const session = sessionService.createSession('Alice', 'Sprint 1');
      expect(session.id).toMatch(/^[A-Z0-9]{8}$/);
      expect(session.title).toBe('Sprint 1');
      expect(session.moderator).toBe('Alice');
      expect(Object.keys(session.users)).toHaveLength(1);
      const mod = Object.values(session.users)[0];
      expect(mod.isModerator).toBe(true);
      expect(mod.isOnline).toBe(true);
      expect(session.votes).toEqual({});
      expect(session.isVotingOpen).toBe(false);
      expect(session.round).toBe(0);
      expect(session.cardSet.length).toBeGreaterThan(0);
      // Stored in-process.
      expect(sessionService.getSession(session.id)).toBe(session);
    });

    test('falls back to a generated title and default card set', () => {
      const session = sessionService.createSession('Bob');
      expect(session.title).toBe("Bob's Planning Session");
      expect(session.cardSet).toEqual(['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89']);
    });

    test('stores a valid custom card set (trimmed)', () => {
      const session = sessionService.createSession('Alice', null, [' 1 ', '2']);
      expect(session.cardSet).toEqual(['1', '2']);
    });
  });

  describe('sanitizeCardSet (audit F3)', () => {
    test('trims and returns card values', () => {
      expect(sessionService.sanitizeCardSet([' 1 ', 'dog', ' ☕ '])).toEqual(['1', 'dog', '☕']);
    });

    test('rejects non-arrays and empty arrays', () => {
      expect(() => sessionService.sanitizeCardSet(null)).toThrow('Invalid card set provided');
      expect(() => sessionService.sanitizeCardSet([])).toThrow('Invalid card set provided');
      expect(() => sessionService.sanitizeCardSet('fib')).toThrow('Invalid card set provided');
    });

    test('rejects oversized sets', () => {
      const tooMany = Array.from({ length: sessionService.MAX_CARD_SET_ITEMS + 1 }, (_, i) => `${i}`);
      expect(() => sessionService.sanitizeCardSet(tooMany)).toThrow(/too large/);
    });

    test('rejects non-string and overlong card values', () => {
      expect(() => sessionService.sanitizeCardSet([42])).toThrow('Card values must be text');
      expect(() => sessionService.sanitizeCardSet([''])).toThrow(/1-16 characters/);
      expect(() => sessionService.sanitizeCardSet(['   '])).toThrow(/1-16 characters/);
      expect(() => sessionService.sanitizeCardSet(['x'.repeat(17)])).toThrow(/1-16 characters/);
    });

    test('accepts exactly MAX_CARD_SET_ITEMS items at the boundary', () => {
      const atLimit = Array.from({ length: sessionService.MAX_CARD_SET_ITEMS }, (_, i) => `${i}`);
      expect(sessionService.sanitizeCardSet(atLimit)).toHaveLength(sessionService.MAX_CARD_SET_ITEMS);
    });
  });

  describe('getSession', () => {
    test('returns the stored session', () => {
      const session = sessionService.createSession('Alice');
      expect(sessionService.getSession(session.id)).toBe(session);
    });

    test('throws "Session not found" for an unknown id', () => {
      expect(() => sessionService.getSession('NOPE0000')).toThrow('Session not found');
    });
  });

  describe('joinSession', () => {
    test('adds a user (offline) and returns { session, user }', () => {
      const session = sessionService.createSession('Alice');
      const { session: updated, user } = sessionService.joinSession(session.id, 'Bob');
      expect(updated).toBe(session);
      expect(user).toBe(updated.users[user.id]);
      expect(user.name).toBe('Bob');
      expect(user.isOnline).toBe(false);
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('rejects duplicate names (case-insensitive)', () => {
      const session = sessionService.createSession('Alice');
      sessionService.joinSession(session.id, 'Bob');
      expect(() => sessionService.joinSession(session.id, 'bob')).toThrow('Username already exists');
    });

    test('throws "Session not found" for an unknown session', () => {
      expect(() => sessionService.joinSession('NOPE0000', 'Bob')).toThrow('Session not found');
    });
  });

  describe('updateSessionAtomic', () => {
    test('mutates the stored session in place and returns it', () => {
      const session = sessionService.createSession('Alice');
      const result = sessionService.updateSessionAtomic(session.id, (s) => {
        s.votes = { u1: '5' };
      });
      expect(result).toBe(session);
      expect(sessionService.getSession(session.id).votes).toEqual({ u1: '5' });
    });

    test('bumps lastActivity by default', () => {
      const session = sessionService.createSession('Alice');
      // Force an old timestamp so the bump is detectable regardless of ms granularity.
      const old = '2020-01-01T00:00:00.000Z';
      session.lastActivity = old;
      sessionService.updateSessionAtomic(session.id, (s) => { s.round = 1; });
      const after = sessionService.getSession(session.id).lastActivity;
      expect(after).not.toBe(old);
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(old).getTime());
    });

    test('skips the lastActivity bump when the mutator returns false', () => {
      const session = sessionService.createSession('Alice');
      const old = '2020-01-01T00:00:00.000Z';
      session.lastActivity = old;
      sessionService.updateSessionAtomic(session.id, (s) => false);
      expect(sessionService.getSession(session.id).lastActivity).toBe(old);
    });

    test('honours updateActivity:false option', () => {
      const session = sessionService.createSession('Alice');
      const old = '2020-01-01T00:00:00.000Z';
      session.lastActivity = old;
      sessionService.updateSessionAtomic(session.id, (s) => { s.round = 1; }, { updateActivity: false });
      expect(sessionService.getSession(session.id).lastActivity).toBe(old);
    });

    test('re-throws mutator errors without persisting (validation before mutation)', () => {
      const session = sessionService.createSession('Alice');
      expect(() =>
        sessionService.updateSessionAtomic(session.id, (s) => { throw new Error('nope'); })
      ).toThrow('nope');
      // session is otherwise untouched
      expect(sessionService.getSession(session.id).round).toBe(0);
    });

    test('throws "Session not found" for an unknown session', () => {
      expect(() => sessionService.updateSessionAtomic('NOPE0000', () => {})).toThrow('Session not found');
    });
  });

  describe('deleteSession', () => {
    test('removes the session', () => {
      const session = sessionService.createSession('Alice');
      sessionService.deleteSession(session.id);
      expect(() => sessionService.getSession(session.id)).toThrow('Session not found');
    });

    test('is idempotent for an unknown id', () => {
      expect(() => sessionService.deleteSession('NOPE0000')).not.toThrow();
    });
  });

  describe('getAllSessions', () => {
    test('returns a snapshot of [id, session] pairs', () => {
      const a = sessionService.createSession('Alice');
      const b = sessionService.createSession('Carol');
      const entries = sessionService.getAllSessions();
      const ids = entries.map(([id]) => id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
      // Mutating the returned array must not affect the store iteration.
      entries.length = 0;
      expect(sessionService.getAllSessions().length).toBe(2);
    });
  });

  describe('sanitizeSession', () => {
    test('reveals all votes once voting is complete', () => {
      const session = sessionService.createSession('Alice');
      session.votes = { u1: '5', u2: '8' };
      session.votingComplete = true;
      const view = sessionService.sanitizeSession(session, 'u1');
      expect(view.votes).toEqual({ u1: '5', u2: '8' });
      expect(view).not.toBe(session);
    });

    test('hides other votes while voting is open', () => {
      const session = sessionService.createSession('Alice');
      const u1 = Object.keys(session.users)[0];
      session.votes = { [u1]: '5', u2: '8' };
      session.votingComplete = false;
      const view = sessionService.sanitizeSession(session, u1);
      expect(view.votes).toEqual({ [u1]: '5' });
    });

    test('returns empty votes for non-participants while voting is open', () => {
      const session = sessionService.createSession('Alice');
      session.votes = { u1: '5' };
      session.votingComplete = false;
      const view = sessionService.sanitizeSession(session);
      expect(view.votes).toEqual({});
    });

    test('exposes votedUserIds (ids only) while voting is open', () => {
      const session = sessionService.createSession('Alice');
      session.votes = { u1: '5', u2: '8' };
      session.votingComplete = false;
      const view = sessionService.sanitizeSession(session, 'u1');
      // ids are public (✓ Voted badge); values other than the requester's own are not.
      expect(view.votedUserIds).toEqual(['u1', 'u2']);
      expect(view.votes).toEqual({ u1: '5' });
      expect(view.votes.u2).toBeUndefined();
    });

    test('exposes votedUserIds when voting is complete', () => {
      const session = sessionService.createSession('Alice');
      session.votes = { u1: '5', u2: '8' };
      session.votingComplete = true;
      const view = sessionService.sanitizeSession(session, 'u1');
      expect(view.votedUserIds).toEqual(['u1', 'u2']);
    });
  });
});