/**
 * End-to-end tests for the moderator disconnect grace period.
 *
 * A moderator's socket dropping (browser refresh, network blip) must NOT
 * immediately hand the role to another participant: if the moderator
 * rejoins within the grace window they keep the role. Only after the grace
 * elapses without a rejoin is the role transferred. Explicit departures
 * (leave-session) still transfer immediately.
 */
const http = require('http');
const socketIo = require('socket.io');
const ioClient = require('socket.io-client');

jest.mock('../utils/logger', () => ({
  info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
}));

const GRACE_MS = 300;

let io, httpServer, serverPort;
let sessionService, socketHandler;

const waitFor = (socket, event, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeout);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });

const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

const connectClient = (sessionId, userId) =>
  new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      reconnection: false,
      auth: { sessionId, userId },
    });
    s.on('connect_error', reject);
    s.on('connect', () => resolve(s));
  });

const joinAndAwait = async (socket, sessionId, userId) => {
  const joined = waitFor(socket, 'session-joined');
  socket.emit('join-session', { sessionId, userId });
  return joined;
};

describe('moderator disconnect grace (end-to-end)', () => {
  beforeAll(async () => {
    sessionService = require('../services/sessionService');
    socketHandler = require('../services/socketHandler');
    for (const [id] of sessionService.getAllSessions()) sessionService.deleteSession(id);

    httpServer = http.createServer((req, res) => res.end('ok'));
    io = socketIo(httpServer, { transports: ['websocket', 'polling'] });
    socketHandler.setupSocketEvents(io, { moderatorDisconnectGraceMs: GRACE_MS });
    await new Promise((r) => httpServer.listen(0, r));
    serverPort = httpServer.address().port;
  }, 30000);

  afterAll(async () => {
    try { if (io) await io.close(); } catch { /* ignore */ }
    try { if (httpServer) await new Promise((r) => httpServer.close(r)); } catch { /* ignore */ }
  }, 15000);

  test('moderator keeps the role when returning within the grace window', async () => {
    const session = sessionService.createSession('Alice', 'Grace Rejoin');
    const sessionId = session.id;
    const modId = session.moderatorId;
    const { user: bobUser } = sessionService.joinSession(sessionId, 'Bob');
    const bobId = bobUser.id;

    let mod = await connectClient(sessionId, modId);
    const bob = await connectClient(sessionId, bobId);
    await joinAndAwait(mod, sessionId, modId);
    await joinAndAwait(bob, sessionId, bobId);

    // Moderator "refreshes": clean disconnect, then reconnect + rejoin.
    const changedP = waitFor(bob, 'moderator-changed', GRACE_MS + 500)
      .then(() => { throw new Error('moderator-changed must not fire on refresh'); })
      .catch((err) => err);
    mod.disconnect();
    await waitMs(GRACE_MS / 2);

    // Immediately after the disconnect the role must still be the moderator's.
    expect(sessionService.getSession(sessionId).moderatorId).toBe(modId);

    mod = await connectClient(sessionId, modId);
    await joinAndAwait(mod, sessionId, modId);

    // Wait out the grace window — no hand-over may occur.
    const outcome = await changedP;
    expect(outcome.message).toMatch(/timeout: moderator-changed/);
    expect(sessionService.getSession(sessionId).moderatorId).toBe(modId);
    expect(sessionService.getSession(sessionId).users[modId].isModerator).toBe(true);
    expect(sessionService.getSession(sessionId).users[modId].isOnline).toBe(true);

    mod.disconnect(true);
    bob.disconnect(true);
  }, 20000);

  test('role transfers after the grace window when the moderator stays away', async () => {
    const session = sessionService.createSession('Alice', 'Grace Expire');
    const sessionId = session.id;
    const modId = session.moderatorId;
    const { user: bobUser } = sessionService.joinSession(sessionId, 'Bob');
    const bobId = bobUser.id;

    const mod = await connectClient(sessionId, modId);
    const bob = await connectClient(sessionId, bobId);
    await joinAndAwait(mod, sessionId, modId);
    await joinAndAwait(bob, sessionId, bobId);

    const changedP = waitFor(bob, 'moderator-changed', GRACE_MS + 500);
    mod.disconnect();

    const changed = await changedP;
    expect(changed.newModeratorId).toBe(bobId);
    expect(changed.previousModeratorId).toBe(modId);
    expect(changed.newModerator.id).toBe(bobId);
    expect(changed.previousModerator.id).toBe(modId);
    expect(changed.wasManualTransfer).toBe(false);

    const stored = sessionService.getSession(sessionId);
    expect(stored.moderatorId).toBe(bobId);
    expect(stored.users[bobId].isModerator).toBe(true);
    expect(stored.users[modId].isModerator).toBe(false);

    bob.disconnect(true);
  }, 20000);

  test('explicit leave-session still transfers the role immediately', async () => {
    const session = sessionService.createSession('Alice', 'Grace Leave');
    const sessionId = session.id;
    const modId = session.moderatorId;
    const { user: bobUser } = sessionService.joinSession(sessionId, 'Bob');
    const bobId = bobUser.id;

    const mod = await connectClient(sessionId, modId);
    const bob = await connectClient(sessionId, bobId);
    await joinAndAwait(mod, sessionId, modId);
    await joinAndAwait(bob, sessionId, bobId);

    const changedP = waitFor(bob, 'moderator-changed', 2000);
    mod.emit('leave-session', { sessionId, userId: modId });
    await changedP;

    const stored = sessionService.getSession(sessionId);
    expect(stored.moderatorId).toBe(bobId);
    expect(stored.users[modId]).toBeUndefined();

    bob.disconnect(true);
  }, 20000);

  test('a rejoin racing the hand-over keeps the role (no double transfer)', async () => {
    const session = sessionService.createSession('Alice', 'Grace Race');
    const sessionId = session.id;
    const modId = session.moderatorId;
    const { user: bobUser } = sessionService.joinSession(sessionId, 'Bob');
    const bobId = bobUser.id;

    const bob = await connectClient(sessionId, bobId);
    let mod = await connectClient(sessionId, modId);
    await joinAndAwait(bob, sessionId, bobId);
    await joinAndAwait(mod, sessionId, modId);

    // Disconnect with a grace JUST long enough to land the rejoin inside it.
    mod.disconnect();
    await waitMs(GRACE_MS / 2);
    mod = await connectClient(sessionId, modId);
    await joinAndAwait(mod, sessionId, modId);

    // Wait past the grace window — moderator-changed must never fire.
    const changedP = waitFor(bob, 'moderator-changed', GRACE_MS + 500)
      .then(() => { throw new Error('unexpected moderator-changed'); })
      .catch((err) => err);
    const outcome = await changedP;
    expect(outcome.message).toMatch(/timeout: moderator-changed/);
    expect(sessionService.getSession(sessionId).moderatorId).toBe(modId);

    mod.disconnect(true);
    bob.disconnect(true);
  }, 20000);
});