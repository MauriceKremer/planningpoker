// Session storage utility for managing user session data
// Uses localStorage for persistence and sessionStorage for temporary data

const STORAGE_KEYS = {
  USER_SESSIONS: 'planningpoker_user_sessions'
};

// Session expiry time - matches server session cleanup behavior (24 hours)
const SESSION_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Check if storage is available
 */
const isStorageAvailable = (storageType) => {
  try {
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const test = '__storage_test__';
    storage.setItem(test, test);
    storage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Clean up expired sessions from localStorage
 */
const cleanupExpiredSessions = () => {
  try {
    if (!isStorageAvailable('localStorage')) return;
    
    const sessionsData = localStorage.getItem(STORAGE_KEYS.USER_SESSIONS);
    if (!sessionsData) return;
    
    const sessions = JSON.parse(sessionsData);
    const now = Date.now();
    
    // Filter out expired sessions
    const activeSessions = Object.entries(sessions).reduce((acc, [sessionId, data]) => {
      if (now - data.lastAccess < SESSION_EXPIRY) {
        acc[sessionId] = data;
      }
      return acc;
    }, {});
    
    localStorage.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(activeSessions));
  } catch (error) {
    console.warn('Error cleaning up expired sessions:', error);
  }
};

/**
 * Save user session data to localStorage
 */
export const saveUserSession = (sessionId, userData) => {
  try {
    if (!isStorageAvailable('localStorage')) {
      console.warn('localStorage not available, session will not persist');
      return false;
    }
    
    cleanupExpiredSessions();
    
    const sessionsData = localStorage.getItem(STORAGE_KEYS.USER_SESSIONS);
    const sessions = sessionsData ? JSON.parse(sessionsData) : {};
    
    sessions[sessionId] = {
      userId: userData.userId,
      userName: userData.userName,
      isModerator: userData.isModerator || false,
      joinedAt: userData.joinedAt || new Date().toISOString(),
      lastAccess: Date.now()
    };
    
    localStorage.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.error('Error saving user session:', error);
    return false;
  }
};

/**
 * Get user session data from localStorage
 */
export const getUserSession = (sessionId) => {
  try {
    if (!isStorageAvailable('localStorage')) return null;
    
    cleanupExpiredSessions();
    
    const sessionsData = localStorage.getItem(STORAGE_KEYS.USER_SESSIONS);
    if (!sessionsData) return null;
    
    const sessions = JSON.parse(sessionsData);
    const sessionData = sessions[sessionId];
    
    if (!sessionData) return null;
    
    // Check if session is still valid
    if (Date.now() - sessionData.lastAccess > SESSION_EXPIRY) {
      removeUserSession(sessionId);
      return null;
    }
    
    // Update last access time
    sessionData.lastAccess = Date.now();
    localStorage.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(sessions));
    
    return {
      userId: sessionData.userId,
      userName: sessionData.userName,
      isModerator: sessionData.isModerator,
      joinedAt: sessionData.joinedAt
    };
  } catch (error) {
    console.error('Error getting user session:', error);
    return null;
  }
};

/**
 * Remove user session data from localStorage
 */
export const removeUserSession = (sessionId) => {
  try {
    if (!isStorageAvailable('localStorage')) return;
    
    const sessionsData = localStorage.getItem(STORAGE_KEYS.USER_SESSIONS);
    if (!sessionsData) return;
    
    const sessions = JSON.parse(sessionsData);
    delete sessions[sessionId];
    
    localStorage.setItem(STORAGE_KEYS.USER_SESSIONS, JSON.stringify(sessions));
  } catch (error) {
    console.error('Error removing user session:', error);
  }
};



/**
 * Clear all session data for cleanup
 */
export const clearAllSessionData = () => {
  try {
    if (isStorageAvailable('localStorage')) {
      localStorage.removeItem(STORAGE_KEYS.USER_SESSIONS);
    }
  } catch (error) {
    console.error('Error clearing all session data:', error);
  }
};

/**
 * Get storage availability info for debugging
 */
export const getStorageInfo = () => {
  return {
    localStorage: isStorageAvailable('localStorage'),
    userSessions: localStorage.getItem(STORAGE_KEYS.USER_SESSIONS) ? 
      Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_SESSIONS))).length : 0,
  };
};