/**
 * Contract parity test — the server side of the shared socket protocol.
 *
 * M5.2: the canonical contract lives in `client/src/protocol/events.ts`
 * (zod schemas + derived TS types). The server mirrors the schemas in
 * `src/protocol/eventSchemas.js` and validates every outgoing delta against
 * them. This test makes the mirror a **build-time enforced** mirror: any
 * drift between the client's `eventSchemas` registry and this server's
 * registry fails the server suite, so the two halves can never diverge
 * (that divergence is exactly how the M5.1 event-name drift happened).
 */

const { eventSchemas } = require('../../protocol/eventSchemas');
const fs = require('fs');
const path = require('path');

const clientContractPath = path.join(
   __dirname,
   '..',
   '..',
   '..',
   '..',
   'client',
   'src',
   'protocol',
   'events.ts'
);

/** The `eventSchemas` registry keys as written in the client contract. */
const readClientEventNames = () => {
   const source = fs.readFileSync(clientContractPath, 'utf8');
   const start = source.indexOf('export const eventSchemas = {');
   if (start === -1) throw new Error('client events.ts: eventSchemas registry not found');
   const end = source.indexOf('} as const;', start);
   if (end === -1) throw new Error('client events.ts: eventSchemas registry not terminated');
   const block = source.slice(start, end);
   const names = [...block.matchAll(/'([a-z][a-z-]+)'\s*:/g)].map((m) => m[1]);
   if (names.length === 0) throw new Error('client events.ts: no event names parsed');
   return names;
};

describe('socket contract parity (server ↔ client)', () => {
   test('client eventSchemas registry exists and is non-empty', () => {
      expect(readClientEventNames().length).toBeGreaterThan(0);
   });

   test('server registry mirrors the client contract exactly', () => {
      const serverNames = Object.keys(eventSchemas);
      const clientNames = readClientEventNames();

      const onlyInClient = clientNames.filter((n) => !serverNames.includes(n));
      const onlyInServer = serverNames.filter((n) => !clientNames.includes(n));

      expect(onlyInClient).toEqual([]);
      expect(onlyInServer).toEqual([]);
      expect(serverNames).toEqual(clientNames);
   });

   test('every server schema validates a representative payload shape', () => {
      // Each mirrored schema parses a minimal object carrying exactly its
      // declared fields (the parity contract's shapes stay exercised at
      // runtime, not just name-level).
      const representative = {
         'vote-submitted': { userId: 'U1', votingComplete: false, isVotingOpen: true, votes: null, votedUserIds: [] },
         'vote-accepted': { userId: 'U1', vote: '8', votingComplete: false, isVotingOpen: true },
         'votes-reset': { isVotingOpen: true, votingComplete: false, votes: {} },
         'voting-started': { isVotingOpen: true, votingComplete: false, votes: {} },
         'round-stopped': { isVotingOpen: false, votingComplete: true, votes: { U1: '8' } },
         'card-set-updated': { cardSet: ['1', '2'], isVotingOpen: false, votingComplete: false, votes: {} },
         'vote-out-started': {
            targetUserId: 'U2', initiatedByUserId: 'U1', eligibleVoters: ['U1'], yesVotes: 0, noVotes: 0, requiredYesVotes: 1, thresholdPercent: 25,
         },
         'vote-out-cast': { targetUserId: 'U2', yesVotes: 0, noVotes: 0, requiredYesVotes: 1 },
         'vote-out-ended': { targetUserId: 'U2', removed: false, reason: 'x' },
         'user-joined': { user: { id: 'U1', name: 'A', isModerator: false, isOnline: true } },
         'user-disconnected': { userId: 'U1', user: { id: 'U1', name: 'A', isModerator: false, isOnline: false } },
         'user-countdown': {
            userId: 'U1', user: { id: 'U1', name: 'A', isModerator: false, isOnline: true }, remainingSeconds: 5,
         },
         'user-name-updated': {
            userId: 'U1', oldName: 'A', newName: 'B', user: { id: 'U1', name: 'B', isModerator: false, isOnline: true },
         },
         'moderator-changed': { newModeratorId: 'U2', previousModeratorId: 'U1' },
         'participant-removed': { userId: 'U2' },
         'participant-auto-removed': { userId: 'U2' },
         'session-joined': { session: { id: 'ABCDEF12' } },
         'connection-conflict': { message: 'conflict' },
         'session-closed': { sessionTitle: 'T', moderatorName: 'A' },
         'you-were-removed': { reason: 'r', removedBy: 'M' },
         'session-cleanup': { message: 'inactive' },
         'test-sound-trigger': {},
         'leave-acknowledged': {},
      };

      for (const [event, payload] of Object.entries(representative)) {
         const validator = eventSchemas[event];
         const result = validator.safeParse(payload);
         if (!result.success) {
            const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
            throw new Error(`'${event}' representative payload failed: ${detail}`);
         }
         expect(result.success).toBe(true);
      }
      // Sanity: the representative map covers the whole registry.
      expect(Object.keys(representative).sort()).toEqual(Object.keys(eventSchemas).sort());
   });
});