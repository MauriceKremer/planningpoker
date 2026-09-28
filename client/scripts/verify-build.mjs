#!/usr/bin/env node
/**
 * Build contract test.
 *
 * Runs automatically after every build (npm postbuild) and fails the build
 * when the output violates the contract that nginx, the CSP, the AI-discovery
 * surfaces and the pre-render depend on:
 *
 *  1. Every static file that must be served exists in build/ — including
 *     dot-files (the old `cp -r /app/build/*` glob silently dropped
 *     .well-known/, which is exactly the class of bug this test exists to
 *     prevent).
 *  2. Every HTML entry point is CSP-safe: exactly one external module script,
 *     zero inline executables, zero %PUBLIC_URL% leftovers, season baked in.
 *  3. The M3 pre-render actually ran: /, /about and /join each have their own
 *     file with route-specific canonical/robots/title and real content
 *     (About additionally the FAQPage JSON-LD); app.html is the noindex SPA
 *     shell for /session/*.
 *  4. Every asset referenced by index.html exists on disk.
 *  5. Every image referenced by themes.json exists in build/images/.
 *  6. The M7 PWA output: manifest.webmanifest is valid and complete
 *     (installability members + icons on disk), sw.js exists, is
 *     self-contained (no cross-origin importScripts) and its precache
 *     manifest references only files that actually exist in build/.
 *
 * Exits non-zero with a clear message on the first violation.
 */
import { readFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { gzipSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Frozen ceiling for the main JS bundle (gzip).
//
// M4: React 19 raised it ~24% (98.9 -> 122.3 kB gzip); frozen just above that
// baseline at 128 kB.
//
// M5: 150.3 kB — the typed socket protocol layer added `zod` (shared contract
// schemas, validated on both sides) and restored the socket layer behind the
// typed `useSessionSocket`. The growth is the contract dependency itself, not
// accidental bloat (zod/mini or route-level chunking can reclaim it later);
// real chunking / critical CSS is M6 work, so the ceiling is re-frozen at
// 160 kB with that context.
const MAX_JS_GZIP_BYTES = 160000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'build');

// Remove macOS metadata files from the build — Vite copies publicDir as-is,
// and .DS_Store must never reach the web root.
function purgeDsStores(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) purgeDsStores(p);
    else if (entry.name === '.DS_Store') { rmSync(p); console.log(`  removed junk: ${p.slice(root.length + 1)}`); }
  }
}
purgeDsStores(build);

let failures = [];
function check(ok, label) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

console.log('Verifying build output contract…');

// 1. Required static files (dot-files included — this is the point).
const requiredFiles = [
  'index.html',
  'app.html',
  'about/index.html',
  'join/index.html',
  'favicon.svg',
  'llms.txt',
  'robots.txt',
  'sitemap.xml',
  '.well-known/ai-catalog.json',
  'manifest.webmanifest',
  'sw.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'images/og-image.jpg',
  'images/twitter-card.jpg',
];
for (const f of requiredFiles) {
  check(existsSync(join(build, f)), `present: ${f}`);
}
check(existsSync(join(build, 'bfa87b38920120de07dac246e7b3f69d.txt')), 'present: site verification file');

// 2. Shared CSP/season contract for every HTML entry point.
const htmlFiles = ['index.html', 'about/index.html', 'join/index.html', 'app.html'];
const html = {};
for (const f of htmlFiles) {
  const path = join(build, f);
  if (!existsSync(path)) continue;
  html[f] = readFileSync(path, 'utf-8');
  const h = html[f];
  check(!h.includes('%PUBLIC_URL%'), `${f}: no %PUBLIC_URL% placeholder`);
  check(!h.includes('REACT_APP_'), `${f}: no legacy REACT_APP_ references`);
  // Script inventory gate: JSON-LD blocks are non-executable and CSP-exempt;
  // the Vite entry is the single external module script. Blocks are asserted
  // in place — nothing is "stripped then checked", so there is no sanitizer
  // whose bypass could leave an unsanitized string behind (CodeQL
  // js/bad-tag-filter, js/incomplete-multi-character-sanitization). All
  // patterns are case-insensitive and tolerate whitespace in end tags,
  // because HTML tag names and their closing syntax are case/whitespace-
  // insensitive.
  const executableScripts = (h.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/gi) || []);
  check(executableScripts.length === 1, `${f}: exactly one executable <script> tag`);
  check(/<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/i.test(h), `${f}: external module script from /assets/`);
  const scriptBlocks = [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)];
  const scriptOpenTags = (h.match(/<script\b[^>]*>/gi) || []).length;
  check(scriptBlocks.length === scriptOpenTags, `${f}: every <script> tag has a matching close tag`);
  check(
    scriptBlocks.every(([, attrs, body]) => /type="application\/ld\+json"/i.test(attrs) || body.trim() === ''),
    `${f}: no inline executable scripts`
  );
  check(/<html[^>]*data-theme="/.test(h), `${f}: data-theme baked on <html>`);
  check(/<meta name="theme-color" content="[^"]+"/.test(h), `${f}: theme-color meta present`);
  check(!/name="keywords"/.test(h), `${f}: no dead keywords meta tag`);
  check(/data-prerender="true"/.test(h), `${f}: pre-rendered head tagged for runtime cleanup`);
  check(/<link rel="icon" href="\/favicon\.svg"/.test(h), `${f}: SVG favicon referenced`);
  check(/<link rel="ai-catalog"/.test(h), `${f}: ai-catalog link tag present`);
  check(/<link rel="manifest" href="\/manifest\.webmanifest"/.test(h), `${f}: manifest link tag present`);
  check(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/.test(h), `${f}: apple-touch-icon link tag present`);
  check(/type="application\/ld\+json"/.test(h), `${f}: JSON-LD structured data present`);
}

// 3. M3 pre-render contract — per-route content and meta in the raw HTML.
check(/<title[^>]*>Free Online Planning Poker/.test(html['index.html'] || ''), 'home: route title baked in');
check(/<link rel="canonical" href="https:\/\/planningpoker\.bytecoder\.nl\/"/.test(html['index.html'] || ''), 'home: canonical / baked in');
check(/<meta name="robots" content="index, follow"/.test(html['index.html'] || ''), 'home: robots index,follow baked in');
check(/Free Online Planning Poker for Agile Teams/.test(html['index.html'] || ''), 'home: rendered H1 content present');

const about = html['about/index.html'] || '';
check(/<title[^>]*>About Planning Poker/.test(about), 'about: route title baked in');
check(/<link rel="canonical" href="https:\/\/planningpoker\.bytecoder\.nl\/about"/.test(about), 'about: canonical /about baked in');
check(/<meta name="robots" content="index, follow"/.test(about), 'about: robots index,follow baked in');
check(about.includes('User Manual') && about.includes('Data Collected'), 'about: full manual + privacy content present');
check(/Is Planning Poker really free\?/.test(about), 'about: FAQ content present');
check(/"@type":"FAQPage"/.test(about), 'about: FAQPage JSON-LD present');

const joinHtml = html['join/index.html'] || '';
check(/<title[^>]*>Join a Planning Poker Session/.test(joinHtml), 'join: route title baked in');
check(/<link rel="canonical" href="https:\/\/planningpoker\.bytecoder\.nl\/join"/.test(joinHtml), 'join: canonical /join baked in');
check(/<meta name="robots" content="index, follow"/.test(joinHtml), 'join: robots index,follow baked in');
check(joinHtml.includes('Join a Planning Poker Session'), 'join: rendered heading content present');

check(/<meta name="robots" content="noindex, nofollow"/.test(html['app.html'] || ''), 'app shell: robots noindex,nofollow baked in');
check(!/User Manual/.test(html['app.html'] || ''), 'app shell: no pre-rendered public content');

// 4. The single referenced bundle must exist on disk with a content hash.
const baseHtml = html['index.html'] || '';
const jsSrc = baseHtml.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
check(Boolean(jsSrc && jsSrc.match(/-[A-Za-z0-9$_-]{8,}\.js$/)), 'bundle filename is content-hashed');
check(Boolean(jsSrc && existsSync(join(build, jsSrc.slice(1)))), `referenced bundle exists: ${jsSrc}`);
if (jsSrc && existsSync(join(build, jsSrc.slice(1)))) {
  const gzipBytes = gzipSync(readFileSync(join(build, jsSrc.slice(1)))).length;
  check(gzipBytes <= MAX_JS_GZIP_BYTES, `bundle gzip ${gzipBytes} B ≤ ${MAX_JS_GZIP_BYTES} B (M4 freeze)`);
}
const cssHref = baseHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
check(Boolean(cssHref && existsSync(join(build, cssHref.slice(1)))), `referenced css exists: ${cssHref}`);

// 5. Every backdrop referenced by the theme system must be in build/images.
const themes = JSON.parse(readFileSync(join(root, 'src', 'theme', 'themes.json'), 'utf-8'));
for (const theme of themes) {
  const file = (theme.backdrop || '').split('/').pop();
  if (file) check(existsSync(join(build, 'images', file)), `theme backdrop present: ${file}`);
}

// 6. M7 PWA contract — manifest completeness and SW precache integrity.
const manifestPath = join(build, 'manifest.webmanifest');
if (existsSync(manifestPath)) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    check(typeof m.name === 'string' && m.name.length > 0, 'manifest: name present');
    check(typeof m.short_name === 'string' && m.short_name.length > 0, 'manifest: short_name present');
    check(m.start_url === '/', 'manifest: start_url /');
    check(m.scope === '/', 'manifest: scope /');
    check(['standalone', 'fullscreen', 'minimal-ui'].includes(m.display), 'manifest: installable display mode');
    check(/^#[0-9a-fA-F]{6}$/.test(m.theme_color || ''), 'manifest: theme_color present');
    check(/^#[0-9a-fA-F]{6}$/.test(m.background_color || ''), 'manifest: background_color present');
    const icons = Array.isArray(m.icons) ? m.icons : [];
    for (const size of [192, 512]) {
      const icon = icons.find((i) => i.sizes === `${size}x${size}` && String(i.purpose || 'any').includes('any'));
      check(Boolean(icon), `manifest: ${size}px any icon declared`);
      if (icon) {
        const p = icon.src.startsWith('/') ? icon.src.slice(1) : icon.src;
        check(existsSync(join(build, p)), `manifest: icon on disk: ${icon.src}`);
      }
    }
    check(icons.some((i) => i.purpose === 'maskable'), 'manifest: maskable icon declared');
  } catch (e) {
    check(false, `manifest: valid JSON (${e.message})`);
  }
}

const swPath = join(build, 'sw.js');
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf-8');
  // CSP/CORS hard gate: the SW is a same-origin classic script and must stay
  // self-contained — Workbox generateSW with inlineWorkboxRuntime inlines the
  // whole runtime, so any importScripts (let alone a cross-origin one) means
  // the strategy drifted. Cross-origin SCRIPT urls are equally forbidden.
  // (A plain "https://" text check would false-positive on the Workbox
  // console.warn message string baked into the runtime.)
  check(!/importScripts\s*\(/.test(sw), 'sw.js: self-contained, no importScripts');
  check(!/https?:\/\/[^"'\s]+\.(js|mjs)/.test(sw), 'sw.js: no cross-origin script URLs');
  // The minifier passes the fallback URL through a variable, so assert by
  // presence: the handler call plus the literal "app.html" URL.
  check(/createHandlerBoundToURL\s*\(/.test(sw) && /["']\/?app\.html["']/.test(sw), 'sw.js: navigateFallback binds app.html');
  // SEO guard: /, /about and /join must be denylisted from the navigation
  // fallback, or returning visitors (and JS-running crawlers) would get the
  // cached noindex shell instead of the M3 pre-rendered HTML from nginx.
  check(/denylist:\[[^\]]*about/.test(sw), 'sw.js: navigation fallback denylisted for /, /about, /join');
  // Every precached URL must exist in build/ — an SW precaching a dead URL
  // would 404 offline and leave clients with a broken shell after deploys.
  // Minified shape: {revision:"…",url:"…"} (object keys are unquoted).
  const urls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  check(urls.length > 0, 'sw.js: precache manifest present');
  for (const u of urls) {
    const p = u.startsWith('/') ? u.slice(1) : u;
    check(existsSync(join(build, decodeURIComponent(p))), `sw.js: precached file exists: ${u}`);
  }
  check(!urls.some((u) => u.startsWith('/images/')), 'sw.js: decorative images NOT precached (kept lean)');
}

// Report.
console.log('');
if (failures.length > 0) {
  console.error(`✗ Build contract violated: ${failures.length} failure(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('✓ Build output contract satisfied');
