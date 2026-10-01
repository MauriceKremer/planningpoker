import { beforeEach, describe, expect, test } from 'vitest';
import { getThemeModePreference, saveThemeModePreference } from '../themePreference';

describe('themePreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('falls back to playful when nothing is stored', () => {
    expect(getThemeModePreference()).toBe('playful');
  });

  test('reads a stored valid mode', () => {
    localStorage.setItem('planningpoker_theme', 'clean-dark');
    expect(getThemeModePreference()).toBe('clean-dark');
  });

  test('falls back to playful for an invalid stored value', () => {
    localStorage.setItem('planningpoker_theme', 'neon-purple');
    expect(getThemeModePreference()).toBe('playful');
  });

  test('persists clean modes and removes the key for the default', () => {
    saveThemeModePreference('clean');
    expect(localStorage.getItem('planningpoker_theme')).toBe('clean');

    saveThemeModePreference('playful');
    expect(localStorage.getItem('planningpoker_theme')).toBeNull();
  });
});