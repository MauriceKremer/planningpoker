/**
 * End-to-end integration tests for the "vote out participant" feature.
 *
 * Spins up a real socket.io server in-process and connects real clients.
 * Verifies start-vote-out, vote-out, and vote-out-ended flows with the
 * 25% threshold.
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

describe('vote out participant (end-to-end)', () => {
  beforeAll(async () => {
    sessionService = require('../services/sessionService');
    socketHandler = require('../services/socketHandler');
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

  let sessionId, modId, bobId, carolId, daveId;
  let mod, bob, carol, dave;

  test('creates a session with five participants', async () => {
    const session = await sessionService.createSession('Alice', 'Vote Out E2E');
    sessionId = session.id;
    modId = session.moderatorId;

    const { user: bobUser } = await sessionService.joinSession(sessionId, 'Bob');
    bobId = bobUser.id;

    const { user: carolUser } = await sessionService.joinSession(sessionId, 'Carol');
    carolId = carolUser.id;

    const { user: daveUser } = await sessionService.joinSession(sessionId, 'Dave');
    daveId = daveUser.id;

    const { user: eveUser } = await sessionService.joinSession(sessionId, 'Eve');
    const eveId = eveUser.id;

    mod = await connectClient(sessionId, modId);
    bob = await connectClient(sessionId, bobId);
    carol = await connectClient(sessionId, carolId);
    dave = await connectClient(sessionId, daveId);
    const eve = await connectClient(sessionId, eveId);

    mod.emit('join-session', { sessionId, userId: modId });
    bob.emit('join-session', { sessionId, userId: bobId });
    carol.emit('join-session', { sessionId, userId: carolId });
    dave.emit('join-session', { sessionId, userId: daveId });
    eve.emit('join-session', { sessionId, userId: eveId });

    await waitFor(mod, 'session-joined');
    await waitFor(bob, 'session-joined');
    await waitFor(carol, 'session-joined');
    await waitFor(dave, 'session-joined');
    await waitFor(eve, 'session-joined');

    // Keep eve socket alive but unused after join.
    eve.disconnect();
  }, 20000);

  test('vote-out starts and broadcasts a delta', async () => {
    const startedP = Promise.all([
      waitFor(mod, 'vote-out-started'),
      waitFor(bob, 'vote-out-started'),
      waitFor(carol, 'vote-out-started'),
      waitFor(dave, 'vote-out-started'),
    ]);

    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: carolId });
    const [modData, bobData, carolData, daveData] = await startedP;

    for (const data of [modData, bobData, carolData, daveData]) {
      expect(data).not.toHaveProperty('session');
      expect(data.targetUserId).toBe(carolId);
      expect(data.targetUserName).toBe('Carol');
      expect(data.initiatedByUserId).toBe(bobId);
      expect(data.initiatedByName).toBe('Bob');
      expect(data.requiredYesVotes).toBe(2); // ceil(25% of 5) = 2
      expect(data.thresholdPercent).toBe(25);
      expect(data.yesVotes).toBe(0);
      expect(data.noVotes).toBe(0);
    }
  }, 15000);

  test('casting a yes vote updates tallies', async () => {
    const castP = Promise.all([
      waitFor(mod, 'vote-out-cast'),
      waitFor(bob, 'vote-out-cast'),
      waitFor(carol, 'vote-out-cast'),
      waitFor(dave, 'vote-out-cast'),
    ]);

    mod.emit('vote-out', { sessionId, userId: modId, targetUserId: carolId, vote: 'yes' });
    const [modData] = await castP;

    expect(modData).not.toHaveProperty('session');
    expect(modData.targetUserId).toBe(carolId);
    expect(modData.yesVotes).toBe(1);
    expect(modData.noVotes).toBe(0);
    expect(modData.requiredYesVotes).toBe(2);
  }, 15000);

  test('reaching threshold removes the target and notifies them', async () => {
    const endedP = Promise.all([
      waitFor(mod, 'vote-out-ended'),
      waitFor(bob, 'vote-out-ended'),
      waitFor(carol, 'vote-out-ended'),
      waitFor(dave, 'vote-out-ended'),
    ]);
    const removedP = Promise.all([
      waitFor(mod, 'participant-removed'),
      waitFor(bob, 'participant-removed'),
      waitFor(dave, 'participant-removed'),
    ]);
    const targetRemovedP = waitFor(carol, 'you-were-removed');

    dave.emit('vote-out', { sessionId, userId: daveId, targetUserId: carolId, vote: 'yes' });

    const [endedResults, removedResults, targetRemoved] = await Promise.all([endedP, removedP, targetRemovedP]);

    for (const data of endedResults) {
      expect(data).not.toHaveProperty('session');
      expect(data.targetUserId).toBe(carolId);
      expect(data.removed).toBe(true);
      expect(data.reason).toBe('Removed by participant vote');
    }

    for (const data of removedResults) {
      expect(data).not.toHaveProperty('session');
      expect(data.userId).toBe(carolId);
      expect(data.user.name).toBe('Carol');
    }

    expect(targetRemoved.reason).toBe('Removed by participant vote');
  }, 15000);

  test('target is no longer in the session', async () => {
    const session = sessionService.getSession(sessionId);
    expect(session.users[carolId]).toBeUndefined();
    expect(session.users[daveId]).toBeDefined();
    expect(session.activeVoteOut).toBeNull();
  });
});

describe('vote-out staleness (end-to-end)', () => {
  beforeAll(async () => {
    sessionService = require('../services/sessionService');
    socketHandler = require('../services/socketHandler');
    for (const [id] of sessionService.getAllSessions()) sessionService.deleteSession(id);

    httpServer = http.createServer((req, res) => res.end('ok'));
    io = socketIo(httpServer, { transports: ['websocket', 'polling'] });
    // Short vote-out timeout so expiry can be tested for real.
    socketHandler.setupSocketEvents(io, { voteOutTimeoutMs: 1000 });
    await new Promise((r) => httpServer.listen(0, r));
    serverPort = httpServer.address().port;
  }, 30000);

  afterAll(async () => {
    try { if (io) await io.close(); } catch { /* ignore */ }
    try { if (httpServer) await new Promise((r) => httpServer.close(r)); } catch { /* ignore */ }
  }, 15000);

  const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

  const setup = async (names, title) => {
    const session = sessionService.createSession(names[0], title);
    const modId = session.moderatorId;
    const ids = [modId];
    const sockets = [];
    const mod = await connectClient(session.id, modId);
    const joinedP = waitFor(mod, 'session-joined');
    mod.emit('join-session', { sessionId: session.id, userId: modId });
    await joinedP;
    sockets.push(mod);
    for (let i = 1; i < names.length; i++) {
      const { user } = sessionService.joinSession(session.id, names[i]);
      ids.push(user.id);
    }
    for (const id of ids.slice(1)) {
      const s = await connectClient(session.id, id);
      const joined = waitFor(s, 'session-joined');
      s.emit('join-session', { sessionId: session.id, userId: id });
      await joined;
      sockets.push(s);
    }
    return { sessionId: session.id, ids, sockets };
  };

  const disconnectAll = (sockets) => sockets.forEach((s) => s.disconnect(true));

  test('a departed eligible voter leaves NO ghost vote behind', async () => {
    // 5 users → required yes = 2. Bob votes yes (1/2), then leaves.
    // His yes vote must not linger: without his vote the round is pending.
    const { sessionId, ids, sockets } = await setup(
      ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'], 'Stale Voter');
    const [modId, bobId, carolId, daveId, eveId] = ids;
    const [mod, bob, carol, dave, eve] = sockets;

    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: eveId });
    await Promise.all([waitFor(mod, 'vote-out-started'), waitFor(eve, 'vote-out-started')]);

    bob.emit('vote-out', { sessionId, userId: bobId, targetUserId: eveId, vote: 'yes' });
    await waitFor(mod, 'vote-out-cast');
    expect(sessionService.getSession(sessionId).activeVoteOut.yesVotes).toEqual([bobId]);

    // Bob leaves mid-vote-out — his yes vote must be pruned, not counted.
    // Short negative-waiter: the vote-out stays viable (no ended event).
    const endedP = waitFor(mod, 'vote-out-ended', 250).then(
      () => { throw new Error('unexpected vote-out-ended'); },
      (err) => err
    );
    bob.emit('leave-session', { sessionId, userId: bobId });
    await waitMs(150);
    const outcome = await endedP;
    expect(outcome.message).toMatch(/timeout: vote-out-ended/); // still viable

    const vo = sessionService.getSession(sessionId).activeVoteOut;
    expect(vo).not.toBeNull();
    expect(vo.yesVotes).toEqual([]); // ghost vote gone
    expect(vo.eligibleVoters).not.toContain(bobId);

    // The vote-out is still resolvable by the remaining eligible users.
    mod.emit('vote-out', { sessionId, userId: modId, targetUserId: eveId, vote: 'yes' });
    await waitFor(dave, 'vote-out-cast');
    dave.emit('vote-out', { sessionId, userId: daveId, targetUserId: eveId, vote: 'yes' });
    const ended = await waitFor(dave, 'vote-out-ended');
    expect(ended.removed).toBe(true);
    expect(sessionService.getSession(sessionId).users[eveId]).toBeUndefined();

    disconnectAll([mod, carol, dave, eve]);
  }, 20000);

  test('the target leaving cancels the vote-out', async () => {
    const { sessionId, ids, sockets } = await setup(['Alice', 'Bob', 'Carol'], 'Target Left');
    const [modId, bobId, carolId] = ids;
    const [mod, bob, carol] = sockets;

    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: carolId });
    await Promise.all([waitFor(mod, 'vote-out-started'), waitFor(carol, 'vote-out-started')]);

    const endedP = waitFor(mod, 'vote-out-ended');
    carol.emit('leave-session', { sessionId, userId: carolId });
    const ended = await endedP;

    expect(ended.removed).toBe(false);
    expect(ended.reason).toBe('Vote-out cancelled: target already left');
    expect(sessionService.getSession(sessionId).activeVoteOut).toBeNull();

    disconnectAll([mod, bob, carol]);
  }, 20000);

  test('departures that make the threshold unreachable cancel the vote-out', async () => {
    // 5 users → 4 eligible, required 2. Bob votes yes, then Bob, Carol and
    // the moderator all depart: their votes are pruned (no ghosts) and the
    // last departure leaves only 1 unvoted eligible user → impossible.
    const { sessionId, ids, sockets } = await setup(
      ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'], 'Impossible');
    const [modId, bobId, carolId, , eveId] = ids;
    const [mod, bob, carol, dave] = sockets;

    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: eveId });
    await Promise.all([waitFor(mod, 'vote-out-started'), waitFor(carol, 'vote-out-started')]);

    bob.emit('vote-out', { sessionId, userId: bobId, targetUserId: eveId, vote: 'yes' });
    await waitFor(carol, 'vote-out-cast');

    const endedP = waitFor(dave, 'vote-out-ended', 3000);
    bob.emit('leave-session', { sessionId, userId: bobId });
    await waitMs(120); // still viable (3 eligible, 0 yes)
    expect(sessionService.getSession(sessionId).activeVoteOut).not.toBeNull();

    carol.emit('leave-session', { sessionId, userId: carolId });
    await waitMs(120); // still viable (2 eligible, 0 yes)
    expect(sessionService.getSession(sessionId).activeVoteOut).not.toBeNull();

    // Moderator leaves (transfers to dave first) → 1 eligible left,
    // possible yes (1) < required (2) → mathematically impossible.
    mod.emit('leave-session', { sessionId, userId: modId });
    const ended = await endedP;
    expect(ended.removed).toBe(false);
    expect(ended.reason).toBe('Vote-out cancelled: not enough eligible participants left');
    expect(sessionService.getSession(sessionId).activeVoteOut).toBeNull();
    expect(sessionService.getSession(sessionId).users[eveId]).toBeDefined();

    disconnectAll([mod, bob, carol, dave]);
  }, 20000);

  test('removing the moderator via vote-out transfers the role', async () => {
    const { sessionId, ids, sockets } = await setup(
      ['Alice', 'Bob', 'Carol', 'Dave'], 'Vote Out Moderator');
    const [modId, bobId, carolId, daveId] = ids;
    const [mod, bob, carol, dave] = sockets;

    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: modId });
    await Promise.all([waitFor(mod, 'vote-out-started'), waitFor(carol, 'vote-out-started')]);

    const changedP = waitFor(bob, 'moderator-changed');
    const endedP = waitFor(bob, 'vote-out-ended');
    const targetRemovedP = waitFor(mod, 'you-were-removed');

    bob.emit('vote-out', { sessionId, userId: bobId, targetUserId: modId, vote: 'yes' });

    const [changed, ended] = await Promise.all([changedP, endedP]);
    await targetRemovedP;

    expect(ended.removed).toBe(true);
    expect(changed.newModeratorId).toBe(bobId); // first-joined online user
    expect(changed.previousModeratorId).toBe(modId);
    const stored = sessionService.getSession(sessionId);
    expect(stored.moderatorId).toBe(bobId);
    expect(stored.users[bobId].isModerator).toBe(true);
    expect(stored.users[modId]).toBeUndefined();

    disconnectAll([mod, bob, carol, dave]);
  }, 20000);

  test('an unresolved vote-out expires and unblocks new ones', async () => {
    const { sessionId, ids, sockets } = await setup(
      ['Alice', 'Bob', 'Carol'], 'Expiry');
    const [modId, bobId, carolId] = ids;
    const [mod, bob, carol] = sockets;

    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: carolId });
    await Promise.all([waitFor(mod, 'vote-out-started'), waitFor(carol, 'vote-out-started')]);

    // Nobody votes; wait out the injected 1000ms timeout, then vote lazily.
    await waitMs(1100);
    const endedP = waitFor(carol, 'vote-out-ended');
    mod.emit('vote-out', { sessionId, userId: modId, targetUserId: carolId, vote: 'yes' });
    const ended = await endedP;
    expect(ended.removed).toBe(false);
    expect(ended.reason).toBe('Vote-out expired without enough votes');
    expect(sessionService.getSession(sessionId).activeVoteOut).toBeNull();
    expect(sessionService.getSession(sessionId).users[carolId]).toBeDefined();

    // A new vote-out is allowed again.
    bob.emit('start-vote-out', { sessionId, userId: bobId, targetUserId: carolId });
    await waitFor(mod, 'vote-out-started');
    expect(sessionService.getSession(sessionId).activeVoteOut).not.toBeNull();

    disconnectAll([mod, bob, carol]);
  }, 20000);
});
