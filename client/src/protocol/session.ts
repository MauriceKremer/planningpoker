/**
 * Client-side session state — the shape the reducer (`sessionDelta.ts`) reads
 * from and writes to — domain-first typing.
 *
 * This is intentionally a structural shape (not a frozen contract): several
 * fields are optional because a given event only updates the subset it owns,
 * and the initial `session-joined` load may carry any of them. `votes` is the
 * canonical map the reducer mutates incrementally.
 */
import type { ActiveVoteOutState, Avatar, User } from './events';

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

/**
 * The app's notion of "the current user", distinct from a full socket `User`
 * broadcast: the page holds at most identity + role, optionally joined-at. The
 * index signature lets any `User` broadcast be assigned here as the current
 * user is refreshed (e.g. a moderator swap carries a full `User`).
 */
export interface SessionUser {
   id: string;
   name: string;
   isModerator?: boolean;
   joinedAt?: string;
   avatar?: Avatar;
    [key: string]: unknown;
}

export interface SessionClosedInfo {
   sessionTitle: string;
   moderatorName: string | null;
}

/** A state setter that accepts either a value or an updater function. */
export type Updater<T> = T | ((prev: T) => T);
