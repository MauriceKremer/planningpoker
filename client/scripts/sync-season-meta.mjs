#!/usr/bin/env node
/**
 * Sync static index.html meta tags with the currently active seasonal theme.
 *
 * Reads client/src/theme/themes.json, resolves the window for today, then
 * updates client/index.html (project root — Vite's entry HTML since M1):
 *   - <meta name="theme-color" content="...">
 *   - og:image and twitter:image ?v= cache-buster
 *   - data-theme attribute on <html> (correct palette on first paint, before
 *     React mounts; the runtime hook keeps ownership afterwards)
 *
 * Intended to run as a prebuild step so the baked HTML matches the season at
 * deploy time. (Crawlers don't execute JS, so the runtime theme switcher can't
 * set these.)
 *
 * This file lives under client/ — NOT at the repo root — because the client
 * Docker image builds with context ./client and runs `npm run build` inside
 * the image; a repo-root scripts/ directory would be outside the build
 * context and the prebuild step would fail.
 *
 * Throws (and fails the build) if any expected tag is missing, so drift
 * between index.html and this script can never pass silently.
 *
 * Usage (from client/):
 *   node scripts/sync-season-meta.mjs
 *   node scripts/sync-season-meta.mjs --theme christmas
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Shared seasonal-window logic — the same code the SPA runs, so JS land has
// exactly one copy of the MM-DD rules (ESM since the Vite migration, loaded
// with a dynamic import).
const { resolveTheme } = await import('../src/theme/themeWindows.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const THEMES_PATH = join(__dirname, '..', 'src', 'theme', 'themes.json');
const INDEX_PATH = join(__dirname, '..', 'index.html');

const themes = JSON.parse(readFileSync(THEMES_PATH, 'utf-8'));

const overrideId = process.argv.includes('--theme')
  ? process.argv[process.argv.indexOf('--theme') + 1]
  : null;

const theme =
  (overrideId ? themes.find((t) => t.id === overrideId) : null) ||
  resolveTheme(themes) ||
  themes[themes.length - 1];

if (overrideId && !themes.some((t) => t.id === overrideId)) {
  console.warn(`Warning: unknown theme '${overrideId}', using ${theme.id}`);
}

/**
 * Replace the first regex match, throwing if the tag is absent so index.html
 * format drift fails the build instead of silently doing nothing.
 */
function syncRegex(html, regex, replacement, label) {
  if (!regex.test(html)) {
    throw new Error(
      `sync-season-meta: could not find ${label} in index.html — has the file format drifted?`
    );
  }
  return html.replace(regex, replacement);
}

let html = readFileSync(INDEX_PATH, 'utf-8');

// theme-color (tolerates both "> and " /> self-closing markup)
html = syncRegex(
  html,
  /<meta name="theme-color" content="[^"]*"(\s*\/)?>/,
  `<meta name="theme-color" content="${theme.themeColor}" />`,
  'the theme-color meta tag'
);

// og:image / twitter:image cache-buster version
html = syncRegex(
  html,
  /https:\/\/planningpoker\.bytecoder\.nl\/images\/og-image\.jpg\?v=[^"]+/,
  `https://planningpoker.bytecoder.nl/images/og-image.jpg?v=${theme.ogImageVersion}`,
  'the og:image URL'
);
html = syncRegex(
  html,
  /https:\/\/planningpoker\.bytecoder\.nl\/images\/twitter-card\.jpg\?v=[^"]+/,
  `https://planningpoker.bytecoder.nl/images/twitter-card.jpg?v=${theme.ogImageVersion}`,
  'the twitter:image URL'
);

// Bake data-theme on <html> so the build-time palette applies on first paint.
if (/<html[^>]*\sdata-theme="/.test(html)) {
  html = html.replace(/(<html[^>]*\sdata-theme=")[^"]*(")/, `$1${theme.id}$2`);
} else if (/<html[^>]*>/.test(html)) {
  html = html.replace(/<html([^>]*?)>/, `<html$1 data-theme="${theme.id}">`);
} else {
  throw new Error('sync-season-meta: could not find the <html> tag in index.html');
}

writeFileSync(INDEX_PATH, html);
console.log(`Synced index.html for season: ${theme.id} (${theme.label})`);
console.log(`  theme-color: ${theme.themeColor}`);
console.log(`  ogImageVersion: ${theme.ogImageVersion}`);
console.log(`  data-theme: ${theme.id}`);