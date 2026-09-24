#!/usr/bin/env node
/**
 * Build contract test (migration_plan.md M1).
 *
 * Runs automatically after every build (npm postbuild) and fails the build
 * when the output violates the contract that nginx, the CSP and the
 * AI-discovery surfaces depend on:
 *
 *  1. Every static file that must be served exists in build/ — including
 *     dot-files (the old `cp -r /app/build/*` glob silently dropped
 *     .well-known/, which is exactly the class of bug this test exists to
 *     prevent).
 *  2. index.html: CSP-safe output — exactly one external module script,
 *     zero inline scripts, zero %PUBLIC_URL% leftovers.
 *  3. Seasonal meta baked in (sync-season-meta ran): data-theme + cache-busted
 *     og/twitter image URLs.
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

// 2+3. index.html contract.
const html = readFileSync(join(build, 'index.html'), 'utf-8');
check(!html.includes('%PUBLIC_URL%'), 'no %PUBLIC_URL% placeholder in output');
check(!html.includes('REACT_APP_'), 'no legacy REACT_APP_ references');
// Count executable scripts only: the JSON-LD block is non-executable and
// CSP-exempt, the Vite entry is the single external module script.
const executableScripts = (html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g) || []);
check(executableScripts.length === 1, 'exactly one executable <script> tag');
check(/<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/.test(html), 'external module script from /assets/ (CSP script-src self)');
check(!/<script[^>]*>[^<]/.test(html.replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, '')), 'no inline executable scripts (CSP: no unsafe-inline)');
check(/<html[^>]*data-theme="/.test(html), 'data-theme baked on <html>');
check(/<meta name="theme-color" content="[^"]+"/.test(html), 'theme-color meta present');
check(/https:\/\/planningpoker\.bytecoder\.nl\/images\/og-image\.jpg\?v=/.test(html), 'og:image with cache-buster');
check(/<link rel="icon" href="\/favicon\.svg"/.test(html), 'SVG favicon referenced');
check(/<link rel="ai-catalog"/.test(html), 'ai-catalog link tag present');
check(/type="application\/ld\+json"/.test(html), 'JSON-LD structured data present');
check(/<link rel="canonical"/.test(html), 'canonical link present');

// 4. The single referenced bundle must exist on disk with a content hash.
const jsSrc = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
check(Boolean(jsSrc && jsSrc.match(/-[A-Za-z0-9$_-]{8,}\.js$/)), 'bundle filename is content-hashed');
check(Boolean(jsSrc && existsSync(join(build, jsSrc.slice(1)))), `referenced bundle exists: ${jsSrc}`);
const cssHref = html.match(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
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