import { defineConfig, devices } from '@playwright/test';

// Playwright configuration.
// Runs the full suite against the REAL production stack (docker-compose.prod.yml:
// nginx + server) started by scripts/e2e-stack.sh — see webServer below.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:4080';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Visual regression gate: zero tolerance (diff = merge-blocker).
      maxDiffPixels: 0,
      animations: 'disabled',
    },
  },
  fullyParallel: true,
  workers: 2,
  // Absorb the rare transport-level flake (Docker Desktop's linuxkit websocket
  // proxy sometimes closes a connection ~1ms after the upgrade; socket.io
  // reconnects fine). Do NOT raise this to paper over functional failures;
  // flaky tests still surface in the report.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bash scripts/e2e-stack.sh up',
    url: `${baseURL}/health`,
    reuseExistingServer: true, // local-first: keep the stack up between runs
    timeout: 300_000,
  },
  projects: [
    // Full functional suite + a11y + visual matrix (desktop).
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Functional flows only — visual/a11y are engine-independent enough to
    // gate on chromium alone; cross-browser functional coverage is the goal.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['**/visual.spec.js', '**/a11y.spec.js'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: ['**/visual.spec.js', '**/a11y.spec.js'],
    },
    // Mobile viewport: visual matrix + public pages only.
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
      testIgnore: ['**/game-flow.spec.js', '**/moderator.spec.js'],
    },
  ],
});