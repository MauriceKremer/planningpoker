/**
 * Route-level tests for the session REST API.
 *
 * Boots a minimal express app (the router + JSON body parsing) on an
 * ephemeral port and drives it with fetch — no socket.io, no datastore.
 *
 * Locks down:
 * - user input is stored VERBATIM (no HTML-entity escaping at the data
 *   layer — React escapes on render; escaping here mangles names like
 *   O'Brien or "Tom & Jerry")
 * - create/join responses carry explicit user ids (clients never match
 *   identity by name)
 * - error status contract: 409 duplicate name, 404 unknown session
 */
const express = require('express');

jest.mock('../utils/logger', () => ({
  info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
}));

describe('session REST routes', () => {
  let server, baseUrl, sessionService;

  beforeAll(async () => {
    sessionService = require('../services/sessionService');
    for (const [id] of sessionService.getAllSessions()) sessionService.deleteSession(id);

    const app = express();
    app.use(express.json());
    app.use('/api/sessions', require('../routes/sessions'));
    await new Promise((r) => { server = app.listen(0, r); });
    baseUrl = `http://localhost:${server.address().port}/api/sessions`;
  }, 20000);

  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
    for (const [id] of sessionService.getAllSessions()) sessionService.deleteSession(id);
  }, 15000);

  describe('POST /create', () => {
    test('stores names and titles verbatim (no HTML-entity escaping)', async () => {
      const res = await fetch(`${baseUrl}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moderatorName: "O'Brien & <Co>", title: "Sprint '25: Q&A" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.userId).toBe(data.session.moderatorId);
      const mod = data.session.users[data.session.moderatorId];
      expect(mod.name).toBe("O'Brien & <Co>");
      expect(data.session.title).toBe("Sprint '25: Q&A");

      // The mangled forms must never appear anywhere in the payload.
      const body = JSON.stringify(data);
      expect(body).not.toContain('&#');
      expect(body).not.toContain('&amp;');
      expect(body).not.toContain('&lt;');
    });

    test('rejects names over 30 characters with 400', async () => {
      const res = await fetch(`${baseUrl}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moderatorName: 'x'.repeat(31) }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:sessionId/join', () => {
    test('returns the created user explicitly (id + object)', async () => {
      const created = sessionService.createSession('Alice', 'Join E2E');
      const res = await fetch(`${baseUrl}/${created.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: "Tom & Jerry <3" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.userId).toBe(data.user.id);
      expect(data.user.name).toBe('Tom & Jerry <3');
      expect(data.session.users[data.user.id]).toBeDefined();
      expect(data.user.name).toBe(data.session.users[data.user.id].name);
    });

    test('duplicate (case-insensitive) name → 409 with message', async () => {
      const created = sessionService.createSession('Alice', 'Dup E2E');
      await sessionService.joinSession(created.id, 'Bob');

      const res = await fetch(`${baseUrl}/${created.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: 'bob' }),
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.message).toBe('Username already taken');
    });

    test('unknown session → 404', async () => {
      const res = await fetch(`${baseUrl}/ZZZZZZ99/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: 'Bob' }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.message).toBe('Session not found');
    });

    test('invalid session id format → 400', async () => {
      const res = await fetch(`${baseUrl}/short/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: 'Bob' }),
      });
      expect(res.status).toBe(400);
    });
  });
});