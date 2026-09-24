#!/usr/bin/env node
/**
 * Build-time pre-render.
 *
 * Runs after `vite build` (see package.json "build"). Loads the SSR entry
 * through Vite's `ssrLoadModule` — so JSX, `import.meta.env` and JSON imports
 * resolve exactly as in the browser bundle — renders each public route to a
 * string, and injects it into Vite's built index.html between the
 * `<!-- seo:* -->` and `<!-- prerender:* -->` sentinels.
 *
 * Output:
 *   build/index.html        → fully pre-rendered home page
 *   build/about/index.html  → fully pre-rendered about page (+ FAQPage JSON-LD)
 *   build/join/index.html   → fully pre-rendered join page
 *   build/app.html          → the pure-SPA shell (generic noindex meta) served
 *                             by nginx on /session/* and unknown routes
 *
 * Non-JS crawlers (GPTBot, ClaudeBot, PerplexityBot, …) therefore see real
 * content, while the SPA bundle still takes over on mount (React's createRoot
 * replaces the pre-rendered children — never hydrates, so a seasonal theme
 * override via ?theme= cannot cause a hydration mismatch).
 *
 * react-helmet-async's `data-rh` markers are stripped from the injected head
 * so components/SEO.jsx's existing "remove static fallbacks once React mounts"
 * cleanup keeps the live DOM free of duplicates.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'build');

const SEO_START = '<!-- seo:start -->';
const SEO_END = '<!-- seo:end -->';
const PRERENDER_START = '<!-- prerender:start -->';
const PRERENDER_END = '<!-- prerender:end -->';

const ROUTES = [
  { url: '/', out: 'index.html' },
  { url: '/about', out: 'about/index.html' },
  { url: '/join', out: 'join/index.html' },
];

// Generic head for the pure-SPA shell. Session rooms and unknown routes must
// never be indexed (robots.txt already disallows /session/), and their real
// meta is managed at runtime by react-helmet-async.
const SHELL_HEAD =
  '<title>Planning Poker Session</title>' +
  '<meta name="description" content="A live Planning Poker estimation session." />' +
  '<meta name="robots" content="noindex, nofollow" />';

function injectBetween(html, start, end, content) {
  const startIdx = html.indexOf(start);
  const endIdx = html.indexOf(end);
  if (startIdx === -1) throw new Error(`prerender: sentinel not found: ${start}`);
  if (endIdx === -1) throw new Error(`prerender: sentinel not found: ${end}`);
  if (endIdx < startIdx) throw new Error(`prerender: sentinels out of order: ${start} / ${end}`);
  return html.slice(0, startIdx + start.length) + content + html.slice(endIdx);
}

function renderHead(head) {
  // Append a marker to every injected opening tag so components/SEO.jsx can
  // remove exactly these on mount (React 19 + react-helmet-async 3.0 no longer
  // add their own `data-rh` marker, so the old `:not([data-rh])` heuristic can
  // no longer tell the pre-rendered tags apart from React's). The marker goes
  // at the end of the opening tag so tag-prefix checks stay readable.
  const marked = head.replace(
    /<(title|meta|link|script)\b([^>]*?)(\/?)>/g,
    '<$1$2 data-prerender="true"$3>'
  );
  return `\n    ${marked}\n    `;
}

function buildPage(template, { head, body }) {
  let page = injectBetween(template, SEO_START, SEO_END, renderHead(head));
  if (body != null) {
    page = injectBetween(page, PRERENDER_START, PRERENDER_END, `\n${body}\n    `);
  }
  return page;
}

const template = readFileSync(join(build, 'index.html'), 'utf-8');

const vite = await createServer({
  root,
  configFile: join(root, 'vite.config.mjs'),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
  // The pre-render only needs SSR modules; skip the dependency scanner so it
  // never tries to parse files under public/ (e.g. Google's verification HTML).
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { render } = await vite.ssrLoadModule('/src/prerender/entry-server.jsx');

  for (const route of ROUTES) {
    const { head, body } = render(route.url);
    const page = buildPage(template, { head, body });
    const outPath = join(build, route.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, page);
    console.log(`  pre-rendered ${route.url} -> build/${route.out} (${page.length} bytes)`);
  }

  const shell = buildPage(template, { head: SHELL_HEAD });
  writeFileSync(join(build, 'app.html'), shell);
  console.log(`  wrote SPA shell -> build/app.html (${shell.length} bytes)`);
} finally {
  await vite.close();
}
