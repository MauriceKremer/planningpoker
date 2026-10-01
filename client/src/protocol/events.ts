/**
 * Socket protocol contract — the single source of truth for server→client
 * broadcast payloads.
 *
 * Client and server validate against the same contract definition: the zod
 * schemas here are that shared definition. The client uses them two ways:
 *   1. `z.infer<...>` below produces the TypeScript types the reducer and hooks
 *      are checked against — compile-time parity.
 *   2. `validateEvent` is the runtime guard (defense-in-depth): a malformed or
 *      unexpected payload is rejected before it reaches the reducer, instead of
 *      silently producing a broken session.
 *
 * The server validates its outgoing deltas against these exact schemas — the
 * same schema shapes, imported by both packages.
 *
 * One schema per event, plain objects, no cross-package build step.
 */
import { z } from 'zod';

// ── Primitive building blocks ────────────────────────────────────────────────

/** A single card label in a card set (e.g. "8", "XS", "∞"). */
export const cardSetItem = z.string();

/**
 * Curated avatar palette keys — the only background colors the server accepts
 * for a participant avatar. Every entry is hand-picked to keep white text/emoji
 * inside the circle at ≥ 4.5:1 (the hex map lives in `utils/avatars.ts`).
 * The server mirrors this exact list; parity is build-enforced.
 */
export const AVATAR_COLORS = [
  'rose', 'coral', 'amber', 'moss', 'teal', 'sky', 'indigo', 'violet', 'berry', 'slate',
] as const;

export const avatarColorSchema = z.enum(AVATAR_COLORS);

/**
 * A participant avatar: a curated background color plus an optional emoji
 * glyph. A missing/absent glyph falls back to the user's initials — `type` is
 * therefore derivable and not part of the wire format.
 */
export const avatarSchema = z.object({
  color: avatarColorSchema,
  glyph: z.string().regex(/^[^<>]{1,16}$/u).optional(),
});
export type Avatar = z.infer<typeof avatarSchema>;

/**
 * A participant, as carried in any delta. The server may omit optional
 * bookkeeping fields on the fields it doesn't touch; everything optional so a
 * partial user object (e.g. a moderator swap) still validates.
 */
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  isModerator: z.boolean(),
  isOnline: z.boolean(),
  joinedAt: z.string().optional(),
  lastSeen: z.string().optional(),
  connectedAt: z.string().optional(),
  countdownSeconds: z.number().optional(),
  avatar: avatarSchema.optional(),
});
export type User = z.infer<typeof userSchema>;

/** `{ [userId]: cardValue }` — a map of who has selected which card. */
export const votesMap = z.record(z.string(), z.string());
export type VotesMap = z.infer<typeof votesMap>;

// ── Per-event payload schemas ────────────────────────────────────────────────

/**
 * Open round: "WHO" has voted is public (ids only); card VALUES stay hidden
 * until the round completes (`votes` null while open, the full map when
 * `votingComplete`).
 */
export const voteSubmittedSchema = z.object({
  userId: z.string(),
  hasVoted: z.boolean().optional(),
  votingComplete: z.boolean(),
  isVotingOpen: z.boolean(),
  votes: votesMap.nullable(),
  votedUserIds: z.array(z.string()),
  voteCount: z.number().optional(),
  totalUsers: z.number().optional(),
});

/** Targeted echo to the voter only: the server-confirmed card value. */
export const voteAcceptedSchema = z.object({
  userId: z.string(),
  vote: z.string(),
  votingComplete: z.boolean(),
  isVotingOpen: z.boolean(),
});

export const votesResetSchema = z.object({
  isVotingOpen: z.boolean(),
  votingComplete: z.boolean(),
  votes: votesMap,
});

export const votingStartedSchema = z.object({
  isVotingOpen: z.boolean(),
  votingComplete: z.boolean(),
  votes: votesMap,
  round: z.number().optional(),
  cardSet: z.array(cardSetItem).optional(),
});

export const roundStoppedSchema = z.object({
  isVotingOpen: z.boolean(),
  votingComplete: z.boolean(),
  votes: votesMap,
  round: z.number().optional(),
  stoppedBy: z.string().optional(),
});

export const cardSetUpdatedSchema = z.object({
  cardSet: z.array(cardSetItem),
  isVotingOpen: z.boolean(),
  votingComplete: z.boolean(),
  votes: votesMap,
  updatedBy: z.string().optional(),
});

export const activeVoteOutStateSchema = z.object({
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
export type ActiveVoteOutState = z.infer<typeof activeVoteOutStateSchema>;

export const voteOutCastSchema = z.object({
  targetUserId: z.string(),
  yesVotes: z.number(),
  noVotes: z.number(),
  requiredYesVotes: z.number(),
});

/** Emitted when a vote-out resolves; the reducer only clears local state. */
export const voteOutEndedSchema = z
  .object({
    targetUserId: z.string().optional(),
    removed: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

export const userJoinedSchema = z.object({ user: userSchema });

export const userDisconnectedSchema = z.object({
  userId: z.string(),
  user: userSchema,
});

export const userCountdownSchema = z.object({
  userId: z.string(),
  user: userSchema,
  remainingSeconds: z.number(),
});

export const userNameUpdatedSchema = z.object({
  userId: z.string(),
  oldName: z.string(),
  newName: z.string(),
  user: userSchema,
  isModeratorNameUpdate: z.boolean().optional(),
  moderatorName: z.string().optional(),
});

export const userAvatarUpdatedSchema = z.object({
  userId: z.string(),
  user: userSchema,
});

export const moderatorChangedSchema = z.object({
  newModeratorId: z.string(),
  newModeratorName: z.string().nullable().optional(),
  previousModeratorId: z.string(),
  previousModeratorName: z.string().nullable().optional(),
  newModerator: userSchema.nullable().optional(),
  previousModerator: userSchema.nullable().optional(),
  wasManualTransfer: z.boolean().optional(),
});

export const participantRemovedSchema = z.object({
  userId: z.string(),
  user: userSchema.optional(),
  removedBy: z.string().optional(),
  reason: z.string().optional(),
});

/** Initial full-state load — the only event that still ships the whole
 *  session. Handled by the hook, not the reducer. */
export const sessionJoinedSchema = z.object({
  session: z.unknown(),
});

/** Same session opened from another client; the current one must leave. */
export const connectionConflictSchema = z.object({
  message: z.string().optional(),
});

export const sessionClosedSchema = z.object({
  sessionTitle: z.string(),
  moderatorName: z.string().nullable().optional(),
});

export const youWereRemovedSchema = z.object({
  reason: z.string(),
  removedBy: z.string(),
});

export const sessionCleanupSchema = z.object({
  message: z.string(),
});

/** No payload — a UI-only nudge to play the voting chime. */
export const testSoundTriggerSchema = z.object({}).passthrough();

/** No payload — ack of an optimistic `leave-session`. */
export const leaveAcknowledgedSchema = z.object({}).passthrough();

// ── The registry ─────────────────────────────────────────────────────────────

/**
 * Maps each event name to its payload schema. The reducer's payload type and
 * the runtime validation below both derive from this one registry, so a new
 * event can't sneak in one place without the others matching.
 */
export const eventSchemas = {
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
  'user-avatar-updated': userAvatarUpdatedSchema,
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
} as const;

/** Every event name the client knows how to receive. */
export type EventName = keyof typeof eventSchemas;

/**
 * Payload type for a given event. A *conditional* (distributive) form so that
 * narrowing the event key narrows this type to the exact payload — the
 * compile-time half of the client/server contract.
 */
export type EventPayload<E extends EventName = EventName> =
  E extends EventName ? z.infer<(typeof eventSchemas)[E]> : never;

/**
 * The discriminator TS CAN narrow in a switch: a bundled `{ event, data }`
 * discriminated union. The reducer switches over this (not over two separate
 * args, which the compiler won't narrow correlatedly — a known TS limitation).
 */
export type EventInput = {
  [K in EventName]: { event: K; data: EventPayload<K> };
}[EventName];

/**
 * Validate a raw socket payload against its event's schema.
 *
 * @returns the parsed payload on success (a narrowed, typed value), or `null`
 *   when the payload is malformed/unrecognized. Callers treat `null` as
 *   "ignore this event" — a malformed broadcast must never corrupt local
 *   state, and an unknown event name is simply not dispatched.
 */
export const validateEvent = <E extends EventName>(
  event: E,
  data: unknown,
): EventPayload<E> | null => {
  const validator = eventSchemas[event];
  if (!validator) return null;
  const result = validator.safeParse(data);
  if (!result.success) return null;
  // safeParse already confirmed the value matches `validator` (the schema for
  // this exact event), so the typed cast is a sound post-condition — not a
  // value of unknown shape.
  return result.data as EventPayload<E>;
};