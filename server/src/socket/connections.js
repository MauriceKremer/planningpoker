/**
 * Socket connection tracking and heartbeat lastSeen storage.
 * 
 * Maintains three concerns:
 * 1. Which sockets belong to which sessions (for broadcasting)
 * 2. Which socket belongs to which user (for conflict detection & targeting)
 * 3. Last-heartbeat timestamps per user per session (for liveness detection)
 *
 * All data is in-process memory; no persistence needed across restarts.
 */
const activeConnections = new Map();   // sessionId → Set<socketId>
const socketUserMap = new Map();       // socketId   → { sessionId, userId }
const userSocketMap = new Map();       // "sessionId_userId" → socketId
const lastSeenMap = new Map();          // "sessionId_userId" → timestamp (ms since epoch)

// ── Connection tracking ────────────────────────────────────────────────────

const trackConnection = (socketId, sessionId, userId) => {
  if (!activeConnections.has(sessionId)) {
    activeConnections.set(sessionId, new Set());
  }
  activeConnections.get(sessionId).add(socketId);
  socketUserMap.set(socketId, { sessionId, userId });
  userSocketMap.set(`${sessionId}_${userId}`, socketId);
};

const untrackConnection = (socketId) => {
  const userInfo = socketUserMap.get(socketId);
  if (!userInfo) return null;

  const { sessionId, userId } = userInfo;
  const userKey = `${sessionId}_${userId}`;

  socketUserMap.delete(socketId);

  // Only remove user-socket mapping if this socket is still the active one
  if (userSocketMap.get(userKey) === socketId) {
    userSocketMap.delete(userKey);
  }

  if (activeConnections.has(sessionId)) {
    activeConnections.get(sessionId).delete(socketId);
    if (activeConnections.get(sessionId).size === 0) {
      activeConnections.delete(sessionId);
    }
  }

  // Clean up heartbeat lastSeen for this user
  lastSeenMap.delete(userKey);

  return { sessionId, userId };
};

const untrackSession = (sessionId) => {
  activeConnections.delete(sessionId);
  for (const [socketId, userInfo] of socketUserMap) {
    if (userInfo.sessionId === sessionId) {
      const userKey = `${userInfo.sessionId}_${userInfo.userId}`;
      if (userSocketMap.get(userKey) === socketId) {
        userSocketMap.delete(userKey);
      }
      socketUserMap.delete(socketId);
    }
  }
  // Flush heartbeat data for entire session
  clearLastSeenForSession(sessionId);
};

const getUserInfo = (socketId) => socketUserMap.get(socketId);
const getSocketForUser = (sessionId, userId) => userSocketMap.get(`${sessionId}_${userId}`);
const getSessionConnections = (sessionId) => activeConnections.get(sessionId);
const hasActiveConnections = (sessionId) => activeConnections.has(sessionId) && activeConnections.get(sessionId).size > 0;

// ── Heartbeat lastSeen tracking ────────────────────────────────────────────

/**
 * Record that a user sent a heartbeat.  O(1) in-memory.
 * Called on every "heartbeat" socket event instead of updateSessionAtomic.
 */
const updateLastSeen = (sessionId, userId) => {
  lastSeenMap.set(`${sessionId}_${userId}`, Date.now());
};

/**
 * Get the most recent heartbeat timestamp for a user in a session.
 * Returns a ms-since-epoch number, or null if no heartbeat recorded.
 */
const getLastSeen = (sessionId, userId) => {
  const ts = lastSeenMap.get(`${sessionId}_${userId}`);
  return ts ?? null;
};

/** Remove heartbeat data for an entire session. */
const clearLastSeenForSession = (sessionId) => {
  const prefix = `${sessionId}_`;
  for (const key of lastSeenMap.keys()) {
    if (key.startsWith(prefix)) {
      lastSeenMap.delete(key);
    }
  }
};

/** Remove all heartbeat data (useful for tests & full reset). */
const clearLastSeen = () => {
  lastSeenMap.clear();
};

module.exports = {
  trackConnection, untrackConnection, untrackSession,
  getUserInfo, getSocketForUser, getSessionConnections, hasActiveConnections,
  activeConnections, socketUserMap, userSocketMap,
  // Heartbeat tracking
  updateLastSeen, getLastSeen, clearLastSeenForSession, clearLastSeen,
};