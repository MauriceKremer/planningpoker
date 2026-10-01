import { beforeEach, describe, expect, test } from 'vitest';
import { getAvatarPreferences, saveAvatarPreferences } from '../avatarPreferences';

describe('avatarPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('falls back to null when nothing is stored', () => {
    expect(getAvatarPreferences()).toBeNull();
  });

  test('reads back a saved avatar config verbatim', () => {
    saveAvatarPreferences({ color: 'teal', glyph: '🦊' });
    expect(getAvatarPreferences()).toEqual({ color: 'teal', glyph: '🦊' });
  });

  test('reads back a saved color-only config (initials fallback)', () => {
    saveAvatarPreferences({ color: 'sky' });
    expect(getAvatarPreferences()).toEqual({ color: 'sky' });
  });

  test('rejects an off-palette color instead of trusting the stored value', () => {
    localStorage.setItem('planningpoker_avatar', JSON.stringify({ color: 'hotpink', glyph: '🦊' }));
    expect(getAvatarPreferences()).toBeNull();
  });

  test('rejects a glyph carrying markup', () => {
    localStorage.setItem('planningpoker_avatar', JSON.stringify({ color: 'teal', glyph: '<script>' }));
    expect(getAvatarPreferences()).toBeNull();
  });

  test('rejects malformed JSON', () => {
    localStorage.setItem('planningpoker_avatar', 'not json');
    expect(getAvatarPreferences()).toBeNull();
  });
});