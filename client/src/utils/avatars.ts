import { AVATAR_COLORS, type Avatar } from '../protocol/events';

export type AvatarColor = (typeof AVATAR_COLORS)[number];

/**
 * The hex for each curated palette key (see `protocol/events.ts` for the
 * contract list). All values keep white text/emoji at ≥ 4.5:1 — enforced by
 * the WCAG contrast test suite.
 */
export const avatarColorHex: Record<AvatarColor, string> = {
  rose: '#BE123C',
  coral: '#C2410C',
  amber: '#B45309',
  moss: '#15803D',
  teal: '#0F766E',
  sky: '#0369A1',
  indigo: '#4338CA',
  violet: '#6D28D9',
  berry: '#BE185D',
  slate: '#475569',
};

/** Quick-pick emojis offered in the customizer; any other emoji can be typed. */
export const STICKERS = [
  '😀', '😎', '🥳', '🐱', '🐶', '🐼', '🦊', '🐸', '🦄', '🐙', '🦉', '🐝',
  '🌵', '🌻', '🍓', '🍕', '🍩', '⚡', '🔥', '🚀', '⭐', '🌈', '🎯', '🧩',
] as const;

/** First grapheme of the name, uppercased — the classic initials fallback. */
export const initialsFor = (name: string): string => [...name.trim()][0]?.toUpperCase() ?? '';

/** Deterministic name-hash so a given id always maps to the same color. */
const colorHash = (id: string): number => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
};

/** The default avatar for a user who has not customized: stable color from their id. */
export const defaultAvatarFor = (id: string): Avatar => ({
  // Modulo is provably in range; the fallback only satisfies indexed access.
  color: AVATAR_COLORS[colorHash(id) % AVATAR_COLORS.length] ?? 'slate',
});