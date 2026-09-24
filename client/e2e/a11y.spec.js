import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSessionViaApi, seedSessionMembership } from './helpers.js';

// WCAG 2.2 AA gate: zero new violations.
//
// Violations that exist in the current UI are recorded in e2e/axe-baseline.json:
// the test asserts "nothing NEW beyond the baseline" and fails on regressions.
// Removing a baseline entry (once its fix lands) is the path to the strict
// "0 violations" gate. This spec NEVER writes the baseline: tests must not
// mutate tracked fixtures, and the file is scanned concurrently by the
// chromium and chromium-mobile projects. Fixing a violation means deleting
// its entry here (the resolved entries are printed to guide the cleanup).
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'axe-baseline.json');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const baseline = readFileSync(BASELINE_PATH, 'utf-8') ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) : {};

function keyOf(urlPath) {
  const p = urlPath.split('?')[0].replace(/^\//, '');
  return p === '' ? 'home' : p.startsWith('session') ? 'session' : p;
}

function summarize(violations) {
  return violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
}

async function scanAndCompare(page, urlPath, { skipGoto = false } = {}) {
  if (!skipGoto) await page.goto(urlPath);
  await expect(page.locator('#root')).toBeAttached();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const found = summarize(results.violations);

  const key = keyOf(urlPath);
  const allowed = baseline[key] || [];
  const newViolations = found.filter((v) => !allowed.some((a) => a.id === v.id && a.impact === v.impact));
  const resolved = allowed.filter((a) => !found.some((v) => v.id === a.id && v.impact === a.impact));

  if (newViolations.length > 0) {
    console.error(`\nA11y NEW violations on /${keyOf(urlPath)}:`);
    for (const v of newViolations) console.error(`  - ${v.impact || 'n/a'} ${v.id}`);
  }
  if (resolved.length > 0) {
    console.log(`\nA11y progress on ${key} (remove from axe-baseline.json):`);
    for (const r of resolved) console.log(`  ✓ fixed: ${r.impact || 'n/a'} ${r.id}`);
  }

  expect(
    newViolations,
    `New accessibility violations on ${urlPath} — fix them or (if pre-existing elsewhere) extend the baseline consciously`
  ).toEqual([]);
}

test.describe('Accessibility (axe, WCAG 2.2 AA)', () => {
  test('home page', async ({ page }) => {
    await scanAndCompare(page, '/');
  });

  test('about page', async ({ page }) => {
    await scanAndCompare(page, '/about');
  });

  test('join page', async ({ page }) => {
    await scanAndCompare(page, '/join');
  });

  test('session page (host view)', async ({ page }) => {
    const { sessionId, userId } = await createSessionViaApi('A11y Host');
    await seedSessionMembership(page, sessionId, userId, 'A11y Host');
    await page.goto(`/session/${sessionId}`);
    await expect(page.getByRole('heading', { name: 'Participants' })).toBeVisible();
    await scanAndCompare(page, `/session/${sessionId}`, { skipGoto: true });
  });
});
