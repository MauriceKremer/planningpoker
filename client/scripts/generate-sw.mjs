#!/usr/bin/env node
/**
 * M7 PWA: generate the precaching Workbox service worker.
 *
 * Runs AFTER scripts/prerender.mjs (npm "build" chain) — deliberately not via
 * vite-plugin-pwa's closeBundle hook, which fires BEFORE the pre-render has
 * written build/app.html, build/about/index.html and build/join/index.html.
 * A SW generated at that point precaches an incomplete web root and its
 * navigation fallback (app.html) is missing entirely → createHandlerBoundToURL
 * throws during SW evaluation → every client fails to register the worker.
 *
 * Shape the strict CSP and scripts/verify-build.mjs depend on:
 *   - one same-origin, self-contained classic script (inlineWorkboxRuntime,
 *     no importScripts, no cross-origin URLs)
 *   - registration lives in the bundle (src/index.tsx), not an injected
 *     HTML <script> — the build contract allows exactly one executable
 *     script tag per document
 *   - navigateFallback binds the cached noindex shell app.html for
 *     /session/* navigations; /, /about and /join are denylisted so
 *     returning visitors keep receiving the M3 pre-rendered HTML
 *   - decorative images (≈2.2 MB of backdrops/og-cards) are NOT precached —
 *     offline poker needs the shell, not the wallpapers
 */
import { generateSW } from 'workbox-build';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'build');

const { warnings } = await generateSW({
  mode: 'production',
  swDest: join(build, 'sw.js'),
  globDirectory: build,
  globPatterns: ['**/*.{js,css,html,svg}', 'manifest.webmanifest', 'icons/*.png'],
  // Vite content-hashes everything under assets/ — no cache-busting param needed.
  dontCacheBustURLsMatching: /^assets\//,
  inlineWorkboxRuntime: true,
  navigateFallback: '/app.html',
  navigateFallbackDenylist: [/^\/$/, /^\/about\/?$/, /^\/join\/?$/],
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  sourcemap: true,
});

for (const w of warnings) console.warn(`  workbox warning: ${w}`);
console.log('  generated build/sw.js (precache + offline navigation fallback)');