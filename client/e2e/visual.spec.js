import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSessionViaApi, joinSessionViaApi, seedSessionMembership } from './helpers.js';

// Visual regression matrix: every public page across every seasonal theme,
// desktop + mobile. Zero diff tolerance (config).
// The ?theme=<id> URL parameter is the documented runtime override.
const __dirname = dirname(fileURLToPath(import.meta.url));
const themes = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'theme', 'themes.json'), 'utf-8'));

test.describe.configure({ mode: 'serial' });

test.describe('Visual matrix — public pages', () => {
  for (const theme of themes) {
    for (const path of ['/', '/about', '/join']) {
      const name = `${theme.id} ${path === '/' ? 'home' : path}`;
      test(`${name}`, async ({ page }) => {
        await page.goto(`${path}${path === '/' ? '?' : '&'}theme=${theme.id}`);
        await page.waitForLoadState('networkidle');
        // Deterministic content: the home form pre-fills a random title.
        const titleInput = page.locator('#sessionTitle');
        if (await titleInput.count()) await titleInput.fill('Visual Test Session');
        await page.waitForTimeout(150); // let the theme hook settle data-theme + backdrop
        await expect(page).toHaveScreenshot(`page-${path === '/' ? 'home' : path.slice(1)}-${theme.id}.png`);
      });
    }
  }
});

test.describe('Visual matrix — session view', () => {
  for (const theme of themes) {
    test(`${theme.id} session`, async ({ page }) => {
      const { sessionId, userId, moderatorName } = await createSessionViaApi('Visual Host');
      await joinSessionViaApi(sessionId, 'Visual Peer');
      await seedSessionMembership(page, sessionId, userId, moderatorName);
      await page.goto(`/session/${sessionId}?theme=${theme.id}`);
      await expect(page.getByRole('heading', { name: 'Participants' })).toBeVisible();
      await page.waitForTimeout(250); // socket sync settles before capture
      // The session ID is unique per run — mask the ID line and share-link.
      await expect(page).toHaveScreenshot(`page-session-${theme.id}.png`, {
        mask: [page.locator('span.font-mono'), page.locator('code')],
      });
    });
  }
});