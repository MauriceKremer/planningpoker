// Cross-session avatar preferences, persisted in localStorage so a returning
// user keeps their avatar in every new or existing session. Mirrors the same
// storage discipline as `themePreference.ts`: never trust the raw value —
// saved data is re-validated against the avatar contract before use.

import { AVATAR_COLORS } from '../protocol/events';
import type { Avatar } from '../protocol/events';

const AVATAR_KEY = 'planningpoker_avatar';

const isStoredAvatar = (value: unknown): value is Avatar => {
  if (!value || typeof value !== 'object') return false;
  const { color, glyph } = value as Record<string, unknown>;
  return (AVATAR_COLORS as readonly string[]).includes(color as string)
    && (glyph === undefined || (typeof glyph === 'string' && /^[^<>]{1,16}$/u.test(glyph)));
};

/**
 * The saved avatar preferences, or `null` when nothing valid is stored
 * (absent, malformed, or storage blocked).
 */
export const getAvatarPreferences = (): Avatar | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AVATAR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredAvatar(parsed) ? parsed : null;
  } catch (error) {
    console.warn('Failed to read avatar preferences:', error);
    return null;
  }
};

/** Persist avatar preferences; silently skips when storage is unavailable. */
export const saveAvatarPreferences = (avatar: Avatar): void => {
  try {
    window.localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
  } catch (error) {
    console.warn('Failed to save avatar preferences:', error);
  }
};