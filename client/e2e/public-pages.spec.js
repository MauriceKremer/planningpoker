import { test, expect } from '@playwright/test';

test.describe('Public pages', () => {
  test('home renders the create form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Free Online Planning Poker/i })).toBeVisible();
    await expect(page.locator('#sessionTitle')).toBeVisible();
    await expect(page.locator('#moderatorName')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create New Session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Existing Session' })).toBeVisible();
  });

  test('about page renders the user manual and FAQ content', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'User Manual' })).toBeVisible();
    await expect(page.getByText('Is Planning Poker really free?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Planning Poker' })).toBeVisible(); // nav/home link
  });

  test('join page renders the code form', async ({ page }) => {
    await page.goto('/join');
    await expect(page.getByPlaceholder('Enter session ID')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your name')).toBeVisible();
  });

  test('unknown routes fall back to the SPA shell', async ({ page }) => {
    // try_files fallback serves index.html with 200 for unknown paths; the
    // React router decides what to render. The shell must still be intact.
    await page.goto('/this-route-does-not-exist');
    await expect(page.locator('#root')).toBeAttached();
  });
});

test.describe('Non-JS crawler parity (raw HTML, JavaScriptEnabled: false)', () => {
  // These tests assert exactly what a crawler that does NOT execute JavaScript
  // (GPTBot, ClaudeBot, PerplexityBot, …) can see today. M3 (pre-render) will
  // extend these assertions with full FAQ content.
  test.use({ javaScriptEnabled: false });

  test('raw HTML exposes title, H1, meta description and JSON-LD', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Planning Poker/i);
    await expect(page.locator('#root h1')).toContainText(/Free Online Planning Poker/i);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Planning Poker/i);
    await expect(page.locator('script[type="application/ld+json"]')).toBeAttached();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /https:\/\/planningpoker\.bytecoder\.nl/);
    await expect(page.locator('link[rel="ai-catalog"]')).toBeAttached();
  });

  test('raw HTML ships the discovery files referenced by the contract', async ({ page }) => {
    // The crawler-facing static files are served by nginx from the build
    // output — assert the links resolve to real content, not the SPA fallback.
    const checks = [
      ['/llms.txt', /# Planning Poker/],
      ['/.well-known/ai-catalog.json', /"specVersion":\s*"1\.0"/],
      ['/robots.txt', /Sitemap:/],
    ];
    for (const [path, pattern] of checks) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(await res.text(), path).toMatch(pattern);
    }
  });
});