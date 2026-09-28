#!/usr/bin/env node
/**
 * M7 PWA: precaching Workbox service worker.
 *
 * Must run AFTER scripts/prerender.mjs — the SW precaches app.html and the
 * pre-rendered pages, which only exist then (a closeBundle-time generation,
 * as vite-plugin-pwa does it, produces a precache without app.html and
 * createHandlerBoundToURL throws during SW evaluation).
 *
 * Shape the strict CSP and scripts/verify-build.mjs depend on: one
 * same-origin, self-contained classic script (inlineWorkboxRuntime, no
 * importScripts); registration lives in the bundle, not an injected
 * <script>; navigateFallback binds the cached noindex shell for /session/*
 * while /, /about and /join stay denylisted so returning visitors keep the
 * M3 pre-rendered HTML from nginx. The ≈2.2 MB of decorative backdrops and
 * og-cards are deliberately not precached.
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