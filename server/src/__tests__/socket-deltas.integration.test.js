/**
 * End-to-end delta-payload integration test.
 *
 * Spins up a REAL socket.io server in-process, wires the REAL
 * `setupSocketEvents` (which now uses the delta builders), and connects
 * REAL socket.io clients over a websocket transport. Sessions live in the
 * same in-process store the handlers use, so no external datastore is needed.
 *
 * Verifies the actual on-the-wire payloads for the "voting starts → everyone
 * votes" burst — the path that used to hammer resources by fanning out the
 * full session on every event.
 */
const http = require('http');
const socketIo = require('socket.io');
const ioClient = require('socket.io-client');

jest.mock('../utils/logger', () => ({
  info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
}));

let io, httpServer, serverPort;
let sessionService, socketHandler;

const waitFor = (socket, event, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeout);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });

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

describe('socket delta payloads (end-to-end)', () => {
  beforeAll(async () => {
    sessionService = require('../services/sessionService');
    socketHandler = require('../services/socketHandler');
    // Start from a clean in-memory store.
    for (const [id] of sessionService.getAllSessions()) sessionService.deleteSession(id);

    httpServer = http.createServer((req, res) => res.end('ok'));
    io = socketIo(httpServer, { transports: ['websocket', 'polling'] });
    socketHandler.setupSocketEvents(io);
    await new Promise((r) => httpServer.listen(0, r));
    serverPort = httpServer.address().port;
  }, 30000);

  afterAll(async () => {
    try { if (io) await io.close(); } catch { /* ignore */ }
    try { if (httpServer) await new Promise((r) => httpServer.close(r)); } catch { /* ignore */ }
  }, 15000);

  let sessionId, modId, bobId;
  let mod, bob;

  test('creates a session and joins two clients', async () => {
    const session = await sessionService.createSession('Alice', 'Delta E2E');
    sessionId = session.id;
    modId = session.moderatorId;

    const { user: bobUser } = await sessionService.joinSession(sessionId, 'Bob');
    bobId = bobUser.id;

    mod = await connectClient(sessionId, modId);
    bob = await connectClient(sessionId, bobId);

    mod.emit('join-session', { sessionId, userId: modId });
    bob.emit('join-session', { sessionId, userId: bobId });

    const modJoined = await waitFor(mod, 'session-joined');
    // session-joined is the only event that still ships the full session (initial load).
    expect(modJoined.session).toBeDefined();
    expect(modJoined.session.id).toBe(sessionId);

    await waitFor(bob, 'session-joined');
  }, 20000);

  test('voting-started broadcasts a delta, never the full session', async () => {
    // Bob listens for user-joined from the moderator (already joined) — instead,
    // listen for voting-started on both clients.
    const modP = waitFor(mod, 'voting-started');
    const bobP = waitFor(bob, 'voting-started');

    mod.emit('start-voting', { sessionId, userId: modId });

    const [modData, bobData] = await Promise.all([modP, bobP]);

    for (const data of [modData, bobData]) {
      expect(data).not.toHaveProperty('session');
      expect(data.isVotingOpen).toBe(true);
      expect(data.votingComplete).toBe(false);
      expect(data.votes).toEqual({});
      expect(data.round).toBe(1);
    }
  }, 15000);

  test('vote-submitted (open) hides vote values; (complete) reveals them', async () => {
    // Track any vote-accepted echoes the moderator receives (he is not voting yet).
    const modAcceptedEchoes = [];
    const modAcceptedListener = (d) => modAcceptedEchoes.push(d);
    mod.on('vote-accepted', modAcceptedListener);

    // Bob votes first — round still open, vote values hidden from everyone.
    const bobOpenP = waitFor(bob, 'vote-submitted');
    const modOpenP = waitFor(mod, 'vote-submitted');
    const bobAcceptedP = waitFor(bob, 'vote-accepted');

    bob.emit('submit-vote', { sessionId, userId: bobId, vote: '5' });
    const [bobOpen, modOpen] = await Promise.all([bobOpenP, modOpenP]);
    const accepted = await bobAcceptedP;

    for (const open of [bobOpen, modOpen]) {
      expect(open).not.toHaveProperty('session');
      expect(open.userId).toBe(bobId);
      // Privacy: the room broadcast must never carry the vote value while the
      // round is open — not even in a nested field.
      expect(open).not.toHaveProperty('vote');
      expect(JSON.stringify(open)).not.toContain('"5"');
      expect(open.hasVoted).toBe(true);
      expect(open.votingComplete).toBe(false);
      expect(open.votes).toBeNull(); // values hidden while open
      // ids of who has voted are public (✓ Voted badge)
      expect(open.votedUserIds).toEqual([bobId]);
    }

    // The voter gets their own value echoed via the targeted event.
    expect(accepted.userId).toBe(bobId);
    expect(accepted.vote).toBe('5');
    expect(accepted.votingComplete).toBe(false);

    // The non-voting participant must NOT have received an echo for Bob.
    expect(modAcceptedEchoes.filter(d => d.userId === bobId)).toHaveLength(0);

    // Moderator votes last — completes the round, reveals all values.
    const modVoteP = waitFor(mod, 'vote-submitted');
    mod.emit('submit-vote', { sessionId, userId: modId, vote: '8' });
    const complete = await modVoteP;

    expect(complete).not.toHaveProperty('session');
    expect(complete.votingComplete).toBe(true);
    expect(complete.votes).toEqual({ [bobId]: '5', [modId]: '8' });
    expect(complete.votedUserIds).toEqual([bobId, modId]);

    mod.off('vote-accepted', modAcceptedListener);
  }, 15000);

  test('round-stopped broadcasts a delta with votes and stoppedBy', async () => {
    // Open a fresh round (the previous round auto-completed when all voted),
    // then stop it while still open.
    const bobStartP = waitFor(bob, 'voting-started');
    mod.emit('start-voting', { sessionId, userId: modId });
    await bobStartP;

    const bobP = waitFor(bob, 'round-stopped');
    mod.emit('stop-round', { sessionId, userId: modId });
    const data = await bobP;

    expect(data).not.toHaveProperty('session');
    expect(data.votes).toBeDefined();
    expect(data.stoppedBy).toBe('Alice');
  }, 15000);

  test('votes-reset broadcasts a minimal reset delta', async () => {
    const bobP = waitFor(bob, 'votes-reset');
    mod.emit('reset-votes', { sessionId });
    const data = await bobP;

    expect(data).not.toHaveProperty('session');
    expect(data.isVotingOpen).toBe(true);
    expect(data.votingComplete).toBe(false);
    expect(data.votes).toEqual({});
  }, 15000);

  test('card-set-updated broadcasts a card-set delta', async () => {
    const bobP = waitFor(bob, 'card-set-updated');
    mod.emit('update-card-set', { sessionId, userId: modId, cardSet: ['XS', 'S', 'M'] });
    const data = await bobP;

    expect(data).not.toHaveProperty('session');
    expect(data.cardSet).toEqual(['XS', 'S', 'M']);
    expect(data.updatedBy).toBe('Alice');
  }, 15000);

  test('user-name-updated broadcasts a user delta', async () => {
    const bobP = waitFor(bob, 'user-name-updated');
    bob.emit('update-user-name', { sessionId, userId: bobId, newName: 'Robert' });
    const data = await bobP;

    expect(data).not.toHaveProperty('session');
    expect(data.userId).toBe(bobId);
    expect(data.oldName).toBe('Bob');
    expect(data.newName).toBe('Robert');
    expect(data.user.name).toBe('Robert');
  }, 15000);

  test('moderator-changed broadcasts ids/names/user objects, not full session', async () => {
    const bobP = waitFor(bob, 'moderator-changed');
    mod.emit('transfer-moderator', { sessionId, currentModeratorId: modId, targetUserId: bobId });
    const data = await bobP;

    expect(data).not.toHaveProperty('session');
    expect(data.newModeratorId).toBe(bobId);
    expect(data.previousModeratorId).toBe(modId);
    expect(data.newModeratorName).toBe('Robert');
    expect(data.previousModeratorName).toBe('Alice');
    expect(data.wasManualTransfer).toBe(true);
  }, 15000);
});