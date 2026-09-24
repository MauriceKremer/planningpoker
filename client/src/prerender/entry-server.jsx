import { HelmetProvider } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { AppShell } from '../App';

/**
 * Build-time pre-render entry.
 *
 * Loaded by scripts/prerender.mjs through Vite's `ssrLoadModule` and rendered
 * once per public route. Non-JS crawlers (GPTBot, ClaudeBot, PerplexityBot, …)
 * then see real content; the SPA still owns the page once its bundle runs.
 *
 * React 19 hoists `<title>`/`<meta>`/`<link>` rendered anywhere in the tree to
 * the front of the `renderToString` output, and react-helmet-async 3.0 relies
 * on exactly that (under React 19 it no longer fills an SSR `context.helmet`).
 * So the head is split off the front of the stream rather than read from a
 * context object. Non-async `<script>` metadata (the About FAQPage JSON-LD) is
 * deliberately NOT hoisted and stays inline in the body, which is valid JSON-LD
 * placement — React clears that body copy when it mounts.
 *
 * @param {string} url Route to render, e.g. '/' or '/about'.
 * @returns {{ head: string, body: string }}
 */
const LEADING_HEAD_TAG =
  /^(<title[\s\S]*?<\/title>|<meta\b[^>]*\/?>|<link\b[^>]*\/?>|<script\b[^>]*>[\s\S]*?<\/script>)/;

export function render(url) {
  const html = renderToString(
    <HelmetProvider>
      <StaticRouter location={url}>
        <AppShell />
      </StaticRouter>
    </HelmetProvider>
  );

  let rest = html;
  let head = '';
  for (;;) {
    const match = rest.match(LEADING_HEAD_TAG);
    if (!match) break;
    head += match[1];
    rest = rest.slice(match[1].length);
  }

  return { head, body: rest };
}
