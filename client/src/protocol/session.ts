/**
 * Client-side session state — the shape the reducer (`sessionDelta.ts`) reads
 * from and writes to. M5 domain-first typing.
 *
 * This is intentionally a structural shape (not a frozen contract): several
 * fields are optional because a given event only updates the subset it owns,
 * and the initial `session-joined` load may carry any of them. `votes` is the
 * canonical map the reducer mutates incrementally.
 */
import type { ActiveVoteOutState, User } from './events';

export interface SessionState {
  id: string;
  title?: string;
  moderator?: string | null;
  moderatorId?: string;
  cardSet?: string[];
  round?: number;
   users: Record<string, User>;
   votes: Record<string, string>;
   votedUserIds?: string[];
  isVotingOpen?: boolean;
   votingComplete?: boolean;
   activeVoteOut?: ActiveVoteOutState | null;
   // The initial full-state load can carry other keys (heartbeat bookkeeping,
   // etc.) we don't yet type explicitly. Preserve them through merges.
   [key: string]: unknown;
}
