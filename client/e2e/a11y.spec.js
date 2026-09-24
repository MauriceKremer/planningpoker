import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSessionViaApi, seedSessionMembership } from './helpers.js';

// WCAG 2.2 AA gate (migration_plan.md M6 = zero violations).
//
// M2 establishes the safety net, so violations that exist in the current UI
// are recorded in e2e/axe-baseline.json: the test asserts "nothing NEW beyond
// the baseline" and fails on regressions. M6 (UX & styling) shrinks the
// baseline to empty — at that point this file must contain no entries and the
// strict "0 violations" gate is active. Deleting baseline entries is part of
// the M6 work.
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

  // Write back the *current* state minus resolved entries so progress is
  // reflected the moment a fix lands (baseline only ever shrinks).
  if (resolved.length > 0 || newViolations.length === 0) {
    baseline[key] = found;
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  }
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
