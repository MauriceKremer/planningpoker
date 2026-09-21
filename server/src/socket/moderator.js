const logger = require('../utils/logger');

/**
 * Transfer moderator role from the current moderator to the next eligible user.
 * Pure function — mutates session in place, does NOT emit socket events.
 * The caller is responsible for emitting moderator-changed after the atomic update succeeds.
 *
 * @param {object} session - The session object (mutated in place)
 * @param {string} previousModId - The user ID of the departing moderator
 * @param {object} previousModInfo - { id, name }
 * @returns {object|null} { newModerator, previousModerator } or null if no users remain
 */
const transferModeratorRole = (session, previousModId, previousModInfo) => {
  const remainingUsers = Object.values(session.users).filter(u => u.id !== previousModId);
  if (remainingUsers.length === 0) return null;
  
  const onlineUsers = remainingUsers.filter(u => u.isOnline);
  const candidates = onlineUsers.length > 0 ? onlineUsers : remainingUsers;
  const nextModerator = candidates.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];
  
  session.moderator = nextModerator.name;
  session.moderatorId = nextModerator.id;
  session.users[nextModerator.id].isModerator = true;
  // The previous moderator may already be gone (e.g. removed by a vote-out
  // that deleted them before the hand-over) — only demote if still present.
  if (session.users[previousModId]) {
    session.users[previousModId].isModerator = false;
  }
  
  logger.debug(`Moderator ${previousModInfo.name} departed. Transferred to ${nextModerator.name}`);
  
  return { newModerator: nextModerator, previousModerator: previousModInfo };
};

module.exports = { transferModeratorRole };