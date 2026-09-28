/**
 * Server-side mirror of the socket protocol contract.
 *
 * M5.2 — the plan requires that "client + server valideren tegen dezelfde
 * contractdefinitie". The canonical schema definitions live in
 * `client/src/protocol/events.ts` (zod schemas + derived TS types); the server
 * cannot import that TypeScript file directly (server is CommonJS/Jest, the
 * client file is ESM TS), so this module mirrors the zod schemas verbatim and
 * `src/protocol/__tests__/contractParity.test.js` fails the build on any
 * drift between the two (event names and schema structure).
 *
 * Why zod here (plan rule 8 — new dependency motivation):
 *   - Hand-rolled per-field validators would duplicate the contract a second
 *     time and are exactly how the M5.1 event-name drift happened.
 *   - zod is already the contract language in the client (`^4.6.5`); reusing
 *     the same library (same major) keeps `safeParse` semantics identical on
 *     both sides. Alternative rejected: plain express-validator for socket
 *     deltas — wrong layer, still hand-rolled.
 *
 * Usage: every OUTGOING delta is validated at construction / before emit via
 * `assertOutgoing`. A violation throws (fail-fast near the bug) — the handler
 * try/catch turns it into an `error` event instead of broadcasting a payload
 * that would silently corrupt client state.
 */
const { z } = require('zod');

// ── Primitive building blocks (mirror of client events.ts) ──────────────────

/** A single card label in a card set (e.g. "8", "XS", "∞"). */
const cardSetItem = z.string();

/**
 * A participant, as carried in any delta. Optional bookkeeping fields may be
 * omitted by producers that don't touch them; a partial user object still
 * validates.
 */
const userSchema = z.object({
   id: z.string(),
   name: z.string(),
   isModerator: z.boolean(),
   isOnline: z.boolean(),
   joinedAt: z.string().optional(),
   lastSeen: z.string().optional(),
   connectedAt: z.string().optional(),
   countdownSeconds: z.number().optional(),
});

/** `{ [userId]: cardValue }` — a map of who has selected which card. */
const votesMap = z.record(z.string(), z.string());

// ── Per-event payload schemas (mirror of client events.ts) ──────────────────

const voteSubmittedSchema = z.object({
   userId: z.string(),
   hasVoted: z.boolean().optional(),
   votingComplete: z.boolean(),
   isVotingOpen: z.boolean(),
   votes: votesMap.nullable(),
   votedUserIds: z.array(z.string()),
   voteCount: z.number().optional(),
   totalUsers: z.number().optional(),
});

const voteAcceptedSchema = z.object({
   userId: z.string(),
   vote: z.string(),
   votingComplete: z.boolean(),
   isVotingOpen: z.boolean(),
});

const votesResetSchema = z.object({
   isVotingOpen: z.boolean(),
   votingComplete: z.boolean(),
   votes: votesMap,
});

const votingStartedSchema = z.object({
   isVotingOpen: z.boolean(),
   votingComplete: z.boolean(),
   votes: votesMap,
   round: z.number().optional(),
   cardSet: z.array(cardSetItem).optional(),
});

const roundStoppedSchema = z.object({
   isVotingOpen: z.boolean(),
   votingComplete: z.boolean(),
   votes: votesMap,
   round: z.number().optional(),
   stoppedBy: z.string().optional(),
});

const cardSetUpdatedSchema = z.object({
   cardSet: z.array(cardSetItem),
   isVotingOpen: z.boolean(),
   votingComplete: z.boolean(),
   votes: votesMap,
   updatedBy: z.string().optional(),
});

const activeVoteOutStateSchema = z.object({
   targetUserId: z.string(),
   targetUserName: z.string().nullable().optional(),
   initiatedByUserId: z.string(),
   initiatedByName: z.string().optional(),
   eligibleVoters: z.array(z.string()),
   yesVotes: z.number(),
   noVotes: z.number(),
   requiredYesVotes: z.number(),
   thresholdPercent: z.number(),
});

const voteOutCastSchema = z.object({
   targetUserId: z.string(),
   yesVotes: z.number(),
   noVotes: z.number(),
   requiredYesVotes: z.number(),
});

/** Emitted when a vote-out resolves; the client reducer only clears state. */
const voteOutEndedSchema = z
   .object({
      targetUserId: z.string().optional(),
      removed: z.boolean().optional(),
      reason: z.string().optional(),
   })
   .passthrough();

const userJoinedSchema = z.object({ user: userSchema });

const userDisconnectedSchema = z.object({
   userId: z.string(),
   user: userSchema,
});

const userCountdownSchema = z.object({
   userId: z.string(),
   user: userSchema,
   remainingSeconds: z.number(),
});

const userNameUpdatedSchema = z.object({
   userId: z.string(),
   oldName: z.string(),
   newName: z.string(),
   user: userSchema,
   isModeratorNameUpdate: z.boolean().optional(),
   moderatorName: z.string().optional(),
});

const moderatorChangedSchema = z.object({
   newModeratorId: z.string(),
   newModeratorName: z.string().nullable().optional(),
   previousModeratorId: z.string(),
   previousModeratorName: z.string().nullable().optional(),
   newModerator: userSchema.nullable().optional(),
   previousModerator: userSchema.nullable().optional(),
   wasManualTransfer: z.boolean().optional(),
});

const participantRemovedSchema = z.object({
   userId: z.string(),
   user: userSchema.optional(),
   removedBy: z.string().optional(),
   reason: z.string().optional(),
});

/** Initial full-state load — the only event that still ships the whole session. */
const sessionJoinedSchema = z.object({
   session: z.unknown(),
});

/** Same session opened from another client; the current one must leave. */
const connectionConflictSchema = z.object({
   message: z.string().optional(),
});

const sessionClosedSchema = z.object({
   sessionTitle: z.string(),
   moderatorName: z.string().nullable().optional(),
});

const youWereRemovedSchema = z.object({
   reason: z.string(),
   removedBy: z.string(),
});

const sessionCleanupSchema = z.object({
   message: z.string(),
});

/** No payload — a UI-only nudge to play the voting chime. */
const testSoundTriggerSchema = z.object({}).passthrough();

/** No payload — ack of an optimistic `leave-session`. */
const leaveAcknowledgedSchema = z.object({}).passthrough();

// ── The registry (mirror of client `eventSchemas`) ──────────────────────────

/**
 * Maps each event name to its payload schema. Keys MUST match the client
 * `eventSchemas` registry exactly — enforced by the contractParity test.
 */
const eventSchemas = {
   'vote-submitted': voteSubmittedSchema,
   'vote-accepted': voteAcceptedSchema,
   'votes-reset': votesResetSchema,
   'voting-started': votingStartedSchema,
   'round-stopped': roundStoppedSchema,
   'card-set-updated': cardSetUpdatedSchema,
   'vote-out-started': activeVoteOutStateSchema,
   'vote-out-cast': voteOutCastSchema,
   'vote-out-ended': voteOutEndedSchema,
   'user-joined': userJoinedSchema,
   'user-disconnected': userDisconnectedSchema,
   'user-countdown': userCountdownSchema,
   'user-name-updated': userNameUpdatedSchema,
   'moderator-changed': moderatorChangedSchema,
   'participant-removed': participantRemovedSchema,
   'participant-auto-removed': participantRemovedSchema,
   'session-joined': sessionJoinedSchema,
   'connection-conflict': connectionConflictSchema,
   'session-closed': sessionClosedSchema,
   'you-were-removed': youWereRemovedSchema,
   'session-cleanup': sessionCleanupSchema,
   'test-sound-trigger': testSoundTriggerSchema,
   'leave-acknowledged': leaveAcknowledgedSchema,
};

/**
 * Validate an outgoing delta against its event's schema. Throws (fail-fast)
 * when the payload violates the contract — the emitting handler's catch turns
 * that into an `error` event rather than broadcasting a broken delta.
 *
 * @param {string} event - the event name (must exist in `eventSchemas`)
 * @param {unknown} data - the outgoing payload
 * @returns {unknown} the same payload (returned so call sites can wrap emits
 *   inline as `emit(ev, assertOutgoing(ev, data))`)
 */
const assertOutgoing = (event, data) => {
   const validator = eventSchemas[event];
   if (!validator) throw new Error(`No contract schema for outgoing event '${event}'`);
   const result = validator.safeParse(data);
   if (!result.success) {
      const issues = result.error.issues
         .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
         .join('; ');
      throw new Error(`Outgoing '${event}' payload violates the socket contract: ${issues}`);
   }
   return data;
};

module.exports = {
   eventSchemas,
   assertOutgoing,
   // Exported for tests that want to introspect individual schemas.
   userSchema,
   votesMap,
};