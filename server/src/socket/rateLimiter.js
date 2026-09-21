// Rate limiting for socket events
// Uses a sliding-window counter per (socketId, eventName).
// Optimized: prunes expired entries in-place instead of creating new arrays
// on every check, reducing GC pressure under load.
const socketRateLimits = new Map(); // socketId → Map<eventName, number[]>
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_EVENTS = 60; // 60 events per minute per socket

const checkRateLimit = (socketId, eventName) => {
  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(socketId, new Map());
  }

  const socketLimits = socketRateLimits.get(socketId);
  const now = Date.now();

  let timestamps = socketLimits.get(eventName);
  if (!timestamps) {
    timestamps = [];
    socketLimits.set(eventName, timestamps);
  }

  // Prune expired entries in-place (avoids creating a new array)
  let writeIdx = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (now - timestamps[i] < RATE_LIMIT_WINDOW) {
      timestamps[writeIdx++] = timestamps[i];
    }
  }
  timestamps.length = writeIdx;

  if (timestamps.length >= RATE_LIMIT_MAX_EVENTS) {
    return false;
  }

  timestamps.push(now);
  return true;
};

const cleanupRateLimits = (socketId) => {
  socketRateLimits.delete(socketId);
};

const resetAllSocketRateLimits = () => {
  socketRateLimits.clear();
};

module.exports = { checkRateLimit, cleanupRateLimits, resetAllSocketRateLimits };