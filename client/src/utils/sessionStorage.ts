// Session storage utility for managing user session data.
//
// Backing store resolution (matches the Privacy Policy / About page claim that
// "if localStorage is unavailable, fallback mechanisms use sessionStorage"):
//   1. localStorage  — preferred; persists across page reloads and tabs.
//   2. sessionStorage — fallback; used when localStorage is blocked (e.g. some
//      private/browsing configurations). Persists only for the current tab.
//   3. neither available — nothing is remembered, so on each page load the user
//      is prompted to enter their name / rejoin via the session link. No
//      functionality is lost, only cross-reload continuity.

const STORAGE_KEY = 'planningpoker_user_sessions';
// Throwaway key for availability probes — never a real payload key.
const PROBE_KEY = '__storage_test__';

// Session expiry time - matches server session cleanup behavior (24 hours).
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

// Candidate stores in preference order.
const BACKENDS = ['localStorage', 'sessionStorage'] as const;
type Backend = (typeof BACKENDS)[number];

// Mirror of the server's SESSION_ID_PATTERN (server/src/socket/validation.js).
// Session IDs are always 8-char uppercase hexadecimal codes issued by the
// server, so anything else never belongs in storage — and in particular a
// `__proto__`-shaped key would corrupt the sessions object's prototype chain
// instead of indexing a stored entry (CodeQL js/prototype-polluting-assignment).
const SESSION_ID_PATTERN = /^[A-Z0-9]{8}$/;
const isValidSessionId = (sessionId: string): boolean =>
  typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId);

/** A stored user session entry (one per session the user has joined). */
export interface StoredUserSession {
  userId: string;
  userName: string;
  isModerator: boolean;
  joinedAt: string;
  /** Epoch ms — the staleness clock (mirrors the server's 24h cleanup). */
  lastAccess: number;
}

/** `{ [sessionId]: session }` as serialized in storage. */
type StoredSessions = Record<string, StoredUserSession>;

/** Input for `saveUserSession` (the bookkeeping the client persists). */
export interface UserSessionInput {
  userId: string;
  userName: string;
  isModerator?: boolean;
  joinedAt?: string;
}

/**
 * Parse the raw storage blob into a sessions map. The parse boundary is
 * unknown by nature, so the shape is checked instead of blindly trusted
 * (entries without the required fields are dropped). Only keys passing
 * `isValidSessionId` survive — every later lookup can index directly.
 */
const parseSessions = (raw: string): StoredSessions => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const isStoredSession = (value: unknown): value is StoredUserSession =>
    typeof value === 'object' && value !== null &&
    typeof (value as StoredUserSession).userId === 'string' &&
    typeof (value as StoredUserSession).userName === 'string' &&
    typeof (value as StoredUserSession).lastAccess === 'number';

  const sessions: StoredSessions = {};
  for (const [sessionId, value] of Object.entries(parsed)) {
    if (isValidSessionId(sessionId) && isStoredSession(value)) {
      sessions[sessionId] = {
        ...value,
        isModerator: Boolean(value.isModerator),
        joinedAt: typeof value.joinedAt === 'string' ? value.joinedAt : '',
      };
    }
  }
  return sessions;
};

const loadSessions = (store: Storage): StoredSessions => {
  const raw = store.getItem(STORAGE_KEY);
  return raw ? parseSessions(raw) : {};
};

const storeSessions = (store: Storage, sessions: StoredSessions): void => {
  store.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

/**
 * Check whether a given Web Storage implementation is usable (throws on access
 * or quota, which happens in private mode or when storage is disabled).
 */
const isStorageAvailable = (backend: Backend): boolean => {
  try {
    const store = storeFor(backend);
    store.setItem(PROBE_KEY, PROBE_KEY);
    store.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
};

/** First usable store, or null when both are blocked. */
const resolveBackend = (): Backend | null => {
  for (const backend of BACKENDS) {
    if (isStorageAvailable(backend)) return backend;
  }
  return null;
};

// Bare-global lookup (not `window[...]`): storage shims and test doubles are
// installed on the global object itself.
const storeFor = (backend: Backend): Storage =>
  (backend === 'localStorage' ? localStorage : sessionStorage);

/**
 * Drop entries past the expiry window from the resolved store. No-op when
 * nothing is stored.
 */
const pruneExpired = (store: Storage): void => {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return;
  const now = Date.now();
  const active = Object.fromEntries(
    Object.entries(parseSessions(raw)).filter(([, session]) => now - session.lastAccess < SESSION_EXPIRY),
  );
  storeSessions(store, active);
};

/**
 * Report which backing store is currently in use, or null when neither is
 * available. Useful for debugging / the privacy "no data stored" guarantee.
 */
export const getStorageBackend = (): Backend | null => resolveBackend();

/**
 * Save user session data to the resolved store (localStorage, else sessionStorage).
 * Returns false when the session ID is invalid or no store is available.
 */
export const saveUserSession = (sessionId: string, userData: UserSessionInput): boolean => {
  if (!isValidSessionId(sessionId)) {
    console.warn('Refusing to save session with invalid session ID');
    return false;
  }

  const backend = resolveBackend();
  if (!backend) {
    console.warn('No browser storage available (localStorage/sessionStorage blocked); session will not persist');
    return false;
  }

  try {
    const store = storeFor(backend);
    pruneExpired(store);
    const sessions = loadSessions(store);
    sessions[sessionId] = {
      userId: userData.userId,
      userName: userData.userName,
      isModerator: userData.isModerator ?? false,
      joinedAt: userData.joinedAt ?? new Date().toISOString(),
      lastAccess: Date.now(),
    };
    storeSessions(store, sessions);
    return true;
  } catch (error) {
    console.error('Error saving user session:', error);
    return false;
  }
};

/**
 * Get user session data from the resolved store. Returns null when the session
 * ID is invalid, nothing is stored, or the stored entry has expired.
 */
export const getUserSession = (sessionId: string): StoredUserSession | null => {
  if (!isValidSessionId(sessionId)) return null;

  const backend = resolveBackend();
  if (!backend) return null;

  try {
    const store = storeFor(backend);
    pruneExpired(store);
    const sessions = loadSessions(store);
    const session = sessions[sessionId];
    if (!session) return null;

    session.lastAccess = Date.now();
    storeSessions(store, sessions);
    return session;
  } catch (error) {
    console.error('Error getting user session:', error);
    return null;
  }
};

/**
 * Remove user session data from the resolved store.
 */
export const removeUserSession = (sessionId: string): void => {
  if (!isValidSessionId(sessionId)) return;

  const backend = resolveBackend();
  if (!backend) return;

  try {
    const store = storeFor(backend);
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return;
    const sessions = parseSessions(raw);
    delete sessions[sessionId];
    storeSessions(store, sessions);
  } catch (error) {
    console.warn('Error removing user session:', error);
  }
};

/**
 * Clear all session data for cleanup (both stores, so a fallback never leaks
 * stale data after localStorage is restored).
 */
export const clearAllSessionData = (): void => {
  for (const backend of BACKENDS) {
    try {
      if (isStorageAvailable(backend)) storeFor(backend).removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Error clearing session data:', error);
    }
  }
};

/** Storage availability info for debugging. */
export const getStorageInfo = (): { backend: Backend | null; userSessions: number } => {
  const backend = resolveBackend();
  const raw = backend ? storeFor(backend).getItem(STORAGE_KEY) : null;
  return { backend, userSessions: raw ? Object.keys(parseSessions(raw)).length : 0 };
};