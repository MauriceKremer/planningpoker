#!/usr/bin/env node
/**
 * Build contract test (migration_plan.md M1, extended in M3).
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
 *
 * Exits non-zero with a clear message on the first violation.
 */
import { readFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  // Count executable scripts only: JSON-LD blocks are non-executable and
  // CSP-exempt, the Vite entry is the single external module script.
  const executableScripts = (h.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g) || []);
  check(executableScripts.length === 1, `${f}: exactly one executable <script> tag`);
  check(/<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/.test(h), `${f}: external module script from /assets/`);
  check(!/<script[^>]*>[^<]/.test(h.replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, '')), `${f}: no inline executable scripts`);
  check(/<html[^>]*data-theme="/.test(h), `${f}: data-theme baked on <html>`);
  check(/<meta name="theme-color" content="[^"]+"/.test(h), `${f}: theme-color meta present`);
  check(/<link rel="icon" href="\/favicon\.svg"/.test(h), `${f}: SVG favicon referenced`);
  check(/<link rel="ai-catalog"/.test(h), `${f}: ai-catalog link tag present`);
  check(/type="application\/ld\+json"/.test(h), `${f}: JSON-LD structured data present`);
}

// 3. M3 pre-render contract — per-route content and meta in the raw HTML.
check(/<title>Free Online Planning Poker/.test(html['index.html'] || ''), 'home: route title baked in');
check(/<link rel="canonical" href="https:\/\/planningpoker\.bytecoder\.nl\/"/.test(html['index.html'] || ''), 'home: canonical / baked in');
check(/<meta name="robots" content="index, follow"/.test(html['index.html'] || ''), 'home: robots index,follow baked in');
check(/Free Online Planning Poker for Agile Teams/.test(html['index.html'] || ''), 'home: rendered H1 content present');

const about = html['about/index.html'] || '';
check(/<title>About Planning Poker/.test(about), 'about: route title baked in');
check(/<link rel="canonical" href="https:\/\/planningpoker\.bytecoder\.nl\/about"/.test(about), 'about: canonical /about baked in');
check(/<meta name="robots" content="index, follow"/.test(about), 'about: robots index,follow baked in');
check(about.includes('User Manual') && about.includes('Data Collected'), 'about: full manual + privacy content present');
check(/Is Planning Poker really free\?/.test(about), 'about: FAQ content present');
check(/"@type":"FAQPage"/.test(about), 'about: FAQPage JSON-LD present');

const joinHtml = html['join/index.html'] || '';
check(/<title>Join a Planning Poker Session/.test(joinHtml), 'join: route title baked in');
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
const cssHref = baseHtml.match(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
check(Boolean(cssHref && existsSync(join(build, cssHref.slice(1)))), `referenced css exists: ${cssHref}`);

// 5. Every backdrop referenced by the theme system must be in build/images.
const themes = JSON.parse(readFileSync(join(root, 'src', 'theme', 'themes.json'), 'utf-8'));
for (const theme of themes) {
  const file = (theme.backdrop || '').split('/').pop();
  if (file) check(existsSync(join(build, 'images', file)), `theme backdrop present: ${file}`);
}

// Report.
console.log('');
if (failures.length > 0) {
  console.error(`✗ Build contract violated: ${failures.length} failure(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('✓ Build output contract satisfied');
