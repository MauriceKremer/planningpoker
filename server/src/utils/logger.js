/**
 * Simple logger utility for the Planning Poker server
 * Logs are only written in development mode or when DEBUG is enabled
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const isDebugEnabled = process.env.DEBUG === 'true';

const shouldLog = isDevelopment || isDebugEnabled;

const logger = {
  info: (...args) => {
    if (shouldLog) {
      console.log('[INFO]', new Date().toISOString(), ...args);
    }
  },
  
  error: (...args) => {
    // Always log errors
    console.error('[ERROR]', new Date().toISOString(), ...args);
  },
  
  warn: (...args) => {
    console.warn('[WARN]', new Date().toISOString(), ...args);
  },
  
  debug: (...args) => {
    if (isDebugEnabled) {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  }
};

module.exports = logger;
