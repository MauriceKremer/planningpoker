import { test, expect } from '@playwright/test';

// PWA gate. Runs against the real prod stack (nginx serves sw.js and
// manifest.webmanifest), so these tests also verify the nginx config:
// the no-cache headers for /sw.js and the correct MIME for the manifest.
//
// Lighthouse dropped its PWA category in v10 (installability + offline
// checks removed), so this suite IS the PWA gate: manifest served, service
// worker registered, and the offline precache actually renders the app.

// The exact CSP that must never change (nginx/nginx.conf server block).
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'";

test.describe('PWA infrastructure', () => {
  test('manifest is served with the correct MIME type and headers', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    expect(res.headers()['cache-control']).toContain('no-cache');
    const m = await res.json();
    expect(m.name).toBe('Planning Poker');
    expect(m.display).toBe('standalone');
    expect(m.icons.length).toBeGreaterThanOrEqual(3);
  });

  test('sw.js is served same-origin and never cached', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/javascript/);
    // Without this header a deploy can never reach registered clients.
    expect(res.headers()['cache-control']).toContain('no-cache');
    // The worker script itself still carries the strict CSP (inherited from
    // the server block — the exact-location block uses expires, not add_header).
    expect(res.headers()['content-security-policy']).toBe(CSP);
  });

  test('the strict CSP on the document is unchanged', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-security-policy']).toBe(CSP);
  });

  test('all declared manifest icons resolve', async ({ request }) => {
    const m = await (await request.get('/manifest.webmanifest')).json();
    for (const icon of m.icons) {
      const res = await request.get(icon.src);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toBe('image/png');
    }
    const apple = await request.get('/icons/apple-touch-icon.png');
    expect(apple.status()).toBe(200);
  });
});

test.describe('Service worker', () => {
  test('registers and takes control of the page', async ({ page }) => {
    await page.goto('/session/pwa-registration-check');
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker?.controller),
      undefined,
      { timeout: 15_000 },
    );
    const scope = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    expect(scope).toContain('/sw.js');
  });

  test('offline reload renders the app shell from the precache', async ({ page, context, browserName }) => {
    // WebKit cannot emulate offline together with service workers: the reload
    // fails with "WebKit encountered an internal error" (Playwright/WebKit
    // limitation, not a product bug). Chromium (desktop + mobile) and Firefox
    // prove the offline path.
    test.skip(browserName === 'webkit', 'WebKit cannot emulate offline with service workers');
    // First load: SW installs and precaches shell + assets (install completes
    // before activation, so controller implies a complete precache).
    await page.goto('/session/pwa-offline-check');
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker?.controller),
      undefined,
      { timeout: 15_000 },
    );

    // Cut the network and reload: nginx is unreachable, the Workbox
    // navigation fallback must serve the cached SPA shell and the bundled
    // assets from Cache Storage — React mounts (the static "Loading…"
    // placeholder is replaced), which proves the whole chain offline.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#root')).not.toContainText('Loading Planning Poker…');
    await expect(page.locator('#root > *').first()).toBeVisible();
  });
});