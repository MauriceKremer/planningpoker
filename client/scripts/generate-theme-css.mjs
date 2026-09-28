#!/usr/bin/env node
/**
 * Generate the seasonal CSS-variable palette layer from themes.json.
 *
 * themes.json is the single source of truth for design tokens: each theme
 * entry carries a full `palette` object (RGB triplets, one entry per token).
 * This script renders it to src/theme/themes.css as
 *   :root                -> the base (autumn) palette
 *   [data-theme="<id>"]  -> one complete palette per other season
 * Tailwind's theme layer references these variables (--c-*), so every
 * background-, text-, border- and shadow utility ultimately resolves to
 * this file.
 *
 * Regeneration happens on every build (prebuild) so the palette in the
 * bundle can never drift from themes.json. The generated file must not be
 * edited by hand; fix the token in themes.json instead.
 *
 * Usage (from client/): node scripts/generate-theme-css.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const themes = JSON.parse(readFileSync(join(here, '../src/theme/themes.json'), 'utf8'));

const baseTheme = themes.find((t) => t.id === 'autumn');
if (!baseTheme) throw new Error('themes.json must contain an "autumn" theme (the :root base palette)');

const emit = (selector, palette) =>
  `${selector} {\n${Object.entries(palette)
    .map(([name, value]) => `  --c-${name}: ${value};`)
    .join('\n')}\n}`;

const header = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: src/theme/themes.json (palette objects), rendered by
 * scripts/generate-theme-css.mjs on every build. Fix tokens in themes.json.
 *
 * :root holds the base (autumn) palette; every other season carries a full
 * palette of its own. All variables are RGB triplets so Tailwind opacity
 * modifiers and the theme layer keep working:
 *   color: rgb(var(--c-ember-500) / <alpha>);
 */

/* Base palette — Autumn */
`;

const rest = themes
  .filter((t) => t.id !== 'autumn')
  .map((t) => emit(`[data-theme="${t.id}"]`, t.palette))
  .join('\n\n');

const out = `${header}${emit(':root', baseTheme.palette)}\n\n${rest}\n`;
writeFileSync(join(here, '../src/theme/themes.css'), out);
console.log(`theme css: generated ${themes.length} palettes (${Object.keys(baseTheme.palette).length} tokens each)`);