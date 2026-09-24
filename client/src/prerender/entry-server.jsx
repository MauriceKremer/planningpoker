import { HelmetProvider } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { AppShell } from '../App';

/**
 * Build-time pre-render entry (migration_plan.md M3).
 *
 * Loaded by scripts/prerender.mjs through Vite's `ssrLoadModule`, so JSX and
 * the app's ESM imports (themes.json, CSS-free component tree) resolve exactly
 * as they do in the browser bundle. The result is static HTML for crawlers that
 * do not execute JavaScript (GPTBot, ClaudeBot, PerplexityBot, …); the SPA
 * still owns the page once its bundle runs.
 *
 * @param {string} url Route to render, e.g. '/' or '/about'.
 * @returns {{ html: string, head: { title: string, meta: string, link: string, script: string } }}
 */
export function render(url) {
  const helmetContext = {};
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={url}>
        <AppShell />
      </StaticRouter>
    </HelmetProvider>
  );

  const { helmet } = helmetContext;
  return {
    html,
    head: {
      title: helmet.title.toString(),
      meta: helmet.meta.toString(),
      link: helmet.link.toString(),
      script: helmet.script.toString(),
    },
  };
}
