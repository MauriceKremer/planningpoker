export type ThemeMode = 'playful' | 'clean' | 'clean-dark';

const THEME_MODE_KEY = 'planningpoker_theme';

const MODES: readonly ThemeMode[] = ['playful', 'clean', 'clean-dark'];

const DEFAULT_MODE: ThemeMode = 'playful';

/**
 * Get the saved theme mode from localStorage. Anything absent or invalid
 * falls back to the playful default (never trusts the raw value).
 */
export const getThemeModePreference = (): ThemeMode => {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  try {
    const stored = window.localStorage.getItem(THEME_MODE_KEY);
    return MODES.includes(stored as ThemeMode) ? (stored as ThemeMode) : DEFAULT_MODE;
  } catch (error) {
    console.warn('Failed to read theme preference:', error);
    return DEFAULT_MODE;
  }
};

/**
 * Persist the theme mode. The playful default is stored as an absent value so
 * first-visit sessions and "back to playful" behave identically.
 */
export const saveThemeModePreference = (mode: ThemeMode): void => {
  try {
    if (mode === DEFAULT_MODE) {
      window.localStorage.removeItem(THEME_MODE_KEY);
    } else {
      window.localStorage.setItem(THEME_MODE_KEY, mode);
    }
  } catch (error) {
    console.warn('Failed to save theme preference:', error);
  }
};