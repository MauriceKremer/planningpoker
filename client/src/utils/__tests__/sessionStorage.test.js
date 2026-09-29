/**
 * Unit tests for the client-side session storage utility.
 *
 * Verifies the backing-store resolution contract that the Privacy Policy and
 * About page rely on: localStorage is preferred, sessionStorage is the fallback
 * when localStorage is blocked, and when neither is available no data is stored
 * (the user simply re-enters their name on reload).
 */
import {
  saveUserSession,
  getUserSession,
  clearAllSessionData,
} from '../sessionStorage';

const VALID_ID = 'ABC12345'; // 8-char uppercase hex, matches SESSION_ID_PATTERN
const userData = { userId: 'u-1', userName: 'Alice', isModerator: true };

// Restore the jsdom-provided storage globals between cases.
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

const makeThrowingStorage = () => ({
  get: () => { throw new Error('storage blocked'); },
  setItem: () => { throw new Error('storage blocked'); },
  getItem: () => { throw new Error('storage blocked'); },
  removeItem: () => { throw new Error('storage blocked'); },
  clear: () => { throw new Error('storage blocked'); },
});

const setStorage = (name, value) =>
  Object.defineProperty(globalThis, name, { value, configurable: true });

beforeEach(() => {
  setStorage('localStorage', originalLocalStorage);
  setStorage('sessionStorage', originalSessionStorage);
  originalLocalStorage.clear();
  originalSessionStorage.clear();
});

afterAll(() => {
  setStorage('localStorage', originalLocalStorage);
  setStorage('sessionStorage', originalSessionStorage);
});

describe('save / get', () => {
  test('round-trips through localStorage by default', () => {
    expect(saveUserSession(VALID_ID, userData)).toBe(true);
    expect(getUserSession(VALID_ID)).toMatchObject({ userId: 'u-1', userName: 'Alice', isModerator: true });
  });

  test('round-trips through sessionStorage when localStorage is blocked', () => {
    setStorage('localStorage', makeThrowingStorage());
    expect(saveUserSession(VALID_ID, userData)).toBe(true);
    expect(originalLocalStorage.getItem('planningpoker_user_sessions')).toBeNull();
    expect(getUserSession(VALID_ID)).toMatchObject({ userId: 'u-1', userName: 'Alice' });
  });

  test('refuses to store when neither storage is available', () => {
    setStorage('localStorage', makeThrowingStorage());
    setStorage('sessionStorage', makeThrowingStorage());
    expect(saveUserSession(VALID_ID, userData)).toBe(false);
    expect(getUserSession(VALID_ID)).toBeNull();
  });

  test('rejects invalid session IDs (prototype-pollution guard)', () => {
    expect(saveUserSession('__proto__', userData)).toBe(false);
    expect(getUserSession('__proto__')).toBeNull();
  });
});

describe('cleanup', () => {
  test('clearAllSessionData clears whichever backends are available', () => {
    saveUserSession(VALID_ID, userData);
    clearAllSessionData();
    expect(getUserSession(VALID_ID)).toBeNull();
    expect(localStorage.getItem('planningpoker_user_sessions')).toBeNull();
  });
});
