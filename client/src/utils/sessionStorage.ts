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

const STORAGE_KEYS = {
  USER_SESSIONS: 'planningpoker_user_sessions'
};

// Session expiry time - matches server session cleanup behavior (24 hours).
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

// Mirror of the server's SESSION_ID_PATTERN (server/src/socket/validation.js).
// Session IDs are always 8-char uppercase hexadecimal codes (A-F, 0-9) issued by
// the server, so anything else never belongs in storage — and in particular a
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
 * (entries without the required fields are dropped).
 */
const parseSessions = (raw: string): StoredSessions => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const entries = Object.entries(parsed as Record<string, unknown>);
  return entries.reduce<StoredSessions>((acc, [sessionId, value]) => {
    if (
      isValidSessionId(sessionId) &&
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).userId === 'string' &&
      typeof (value as Record<string, unknown>).userName === 'string' &&
      typeof (value as Record<string, unknown>).lastAccess === 'number'
    ) {
      const session = value as Record<string, unknown>;
      acc[sessionId] = {
        userId: session.userId as string,
        userName: session.userName as string,
        isModerator: Boolean(session.isModerator),
        joinedAt: typeof session.joinedAt === 'string' ? session.joinedAt : '',
        lastAccess: session.lastAccess as number,
      };
    }
    return acc;
  }, {});
};

/**
 * Check whether a given Web Storage implementation is usable (throws on access
 * or quota, which happens in private mode or when storage is disabled).
 */
const isStorageAvailable = (storageType: 'localStorage' | 'sessionStorage'): boolean => {
  try {
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const test = '__storage_test__';
    storage.setItem(test, test);
    storage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolve the backing store for session continuity, preferring localStorage and
 * falling back to sessionStorage. Returns null when neither is usable, in which
 * case callers must skip persistence (the user re-enters their name on reload).
 */
const resolveStore = (): Storage | null => {
  if (isStorageAvailable('localStorage')) return localStorage;
  if (isStorageAvailable('sessionStorage')) return sessionStorage;
  return null;
};

// Report which backing store is currently in use, or null when neither is
// available. Useful for debugging / the privacy "no data stored" guarantee.
export const getStorageBackend = (): 'localStorage' | 'sessionStorage' | null => {
  if (isStorageAvailable('localStorage')) return 'localStorage';
  if (isStorageAvailable('sessionStorage')) return 'sessionStorage';
  return null;
};

/**
 * Clean up expired sessions from the resolved store.
 */
const cleanupExpiredSessions = (): void => {
  const store = resolveStore();
  if (!store) return;

  const sessionsData = store.getItem(STORAGE_KEYS.USER_SESSIONS);
  if (!sessionsData) return;

  try {
    const sessions = parseSessions(sessionsData);
    const now = Date.now();

    // Filter out expired sessions
    const activeSessions = Object.entries(sessions).reduce<StoredSessions>((acc, [sessionId, data]) => {
      if (now - data.lastAccess < SESSION_EXPIRY) {
        acc[sessionId] = data;
      }
      return acc;
    }, {});

    store.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(activeSessions));
  } catch (error) {
    console.warn('Error cleaning up expired sessions:', error);
  }
};

/**
 * Save user session data to the resolved store (localStorage, else sessionStorage).
 * Returns false when the session ID is invalid or no store is available.
 */
export const saveUserSession = (sessionId: string, userData: UserSessionInput): boolean => {
  if (!isValidSessionId(sessionId)) {
    console.warn('Refusing to save session with invalid session ID');
    return false;
  }

  const store = resolveStore();
  if (!store) {
    console.warn('No browser storage available (localStorage/sessionStorage blocked); session will not persist');
    return false;
  }

  try {
    cleanupExpiredSessions();

    const sessionsData = store.getItem(STORAGE_KEYS.USER_SESSIONS);
    const sessions = sessionsData ? parseSessions(sessionsData) : {};

    sessions[sessionId] = {
      userId: userData.userId,
      userName: userData.userName,
      isModerator: userData.isModerator || false,
      joinedAt: userData.joinedAt || new Date().toISOString(),
      lastAccess: Date.now()
    };

    store.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(sessions));
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

  const store = resolveStore();
  if (!store) return null;

  try {
    cleanupExpiredSessions();

    const sessionsData = store.getItem(STORAGE_KEYS.USER_SESSIONS);
    if (!sessionsData) return null;

    const sessions = parseSessions(sessionsData);
    // Own-property lookup: `sessions['__proto__']` would resolve to
    // Object.prototype and the lastAccess write below would pollute it.
    const sessionData = Object.hasOwn(sessions, sessionId) ? sessions[sessionId] : null;

    if (!sessionData) {
      return null;
    }

    // Check if session is still valid
    if (Date.now() - sessionData.lastAccess > SESSION_EXPIRY) {
      removeUserSession(sessionId);
      return null;
    }

    // Update last access time
    sessionData.lastAccess = Date.now();
    store.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(sessions));

    // The returned copy is a read-model for callers (lastAccess is the store's
    // own staleness clock, not part of the consumer-facing shape).
    return {
      userId: sessionData.userId,
      userName: sessionData.userName,
      isModerator: sessionData.isModerator,
      joinedAt: sessionData.joinedAt,
      lastAccess: sessionData.lastAccess
    };
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

  const store = resolveStore();
  if (!store) return;

  try {
    const sessionsData = store.getItem(STORAGE_KEYS.USER_SESSIONS);
    if (!sessionsData) return;

    const sessions = parseSessions(sessionsData);
    delete sessions[sessionId];
    store.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(sessions));
  } catch (error) {
    console.warn('Error removing user session:', error);
  }
};

/**
 * Clear all session data for cleanup (both stores, so a fallback never leaks
 * stale data after localStorage is restored).
 */
export const clearAllSessionData = (): void => {
  try {
    if (isStorageAvailable('localStorage')) localStorage.removeItem(STORAGE_KEYS.USER_SESSIONS);
  } catch (error) {
    console.warn('Error clearing local session data:', error);
  }
  try {
    if (isStorageAvailable('sessionStorage')) sessionStorage.removeItem(STORAGE_KEYS.USER_SESSIONS);
  } catch (error) {
    console.warn('Error clearing session storage data:', error);
  }
};

/**
 * Get storage availability info for debugging.
 */
export const getStorageInfo = (): { backend: 'localStorage' | 'sessionStorage' | null; userSessions: number } => {
  const backend = getStorageBackend();
  const store = backend ? (backend === 'localStorage' ? localStorage : sessionStorage) : null;
  const raw = store ? store.getItem(STORAGE_KEYS.USER_SESSIONS) : null;
  const count = raw ? Object.keys(parseSessions(raw)).length : 0;
  return {
    backend,
    userSessions: count
  };
};