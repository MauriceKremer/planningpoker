import { expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4080';

// The prod nginx rate limiter (10 r/s, burst 20, per IP) is real production
// behavior — tests must tolerate it, not bypass it. Retry on 429 with backoff.
async function apiFetch(path, options, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
    const res = await fetch(`${BASE}/api${path}`, options);
    if (res.status !== 429) {
      if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
      return res.json();
    }
  }
  throw new Error(`POST ${path} still rate-limited (429) after ${tries} attempts`);
}

/**
 * Create a session directly through the API (fast path for setup).
 * Returns { sessionId, userId, moderatorName }.
 */
export async function createSessionViaApi(moderatorName) {
  const data = await apiFetch('/sessions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ moderatorName }),
  });
  return { sessionId: data.sessionId, userId: data.userId, moderatorName };
}

/**
 * Join a session directly through the API. Returns the response (user, …).
 */
export async function joinSessionViaApi(sessionId, userName) {
  return apiFetch(`/sessions/${sessionId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ userName }),
  });
}

/**
 * The session route shows the UsernamePrompt overlay until the browser has
 * stored session credentials. Seed them with the EXACT shape the app writes
 * (saveUserSession): userId, userName, isModerator, joinedAt AND lastAccess —
 * without lastAccess the cleanup routine discards the entry on read.
 */
export async function seedSessionMembership(page, sessionId, userId, userName) {
  await page.addInitScript(
    ([id, uid, uname]) => {
      localStorage.setItem(
        'planningpoker_user_sessions',
        JSON.stringify({
          [id]: { userId: uid, userName: uname, isModerator: false, joinedAt: new Date().toISOString(), lastAccess: Date.now() },
        })
      );
    },
    [sessionId, userId, userName]
  );
}

/**
 * Host a session through the real UI: fill the home form, submit, wait for
 * the session route. Returns the sessionId.
 */
export async function hostSessionViaUi(page, { title, moderatorName }) {
  await page.goto('/');
  await page.locator('#sessionTitle').fill(title);
  await page.locator('#moderatorName').fill(moderatorName);
  await page.getByRole('button', { name: 'Create New Session' }).click();
  await page.waitForURL(/\/session\/[0-9A-F]+/i);
  await expect(page.getByRole('heading', { name: 'Participants' })).toBeVisible();
  return page.url().match(/session\/([0-9A-F]+)/i)[1];
}

/**
 * Join an existing session through the in-session UsernamePrompt overlay.
 */
export async function joinViaPrompt(page, sessionId, userName) {
  await page.goto(`/session/${sessionId}`);
  await page.getByRole('heading', { name: 'Join Session' }).waitFor();
  await page.locator('input.input-field').first().fill(userName);
  await page.getByRole('button', { name: 'Join Session' }).click();
  // The prompt overlay must dissolve (a 'Participants' heading alone can be
  // visible underneath an open overlay — that hides the join race) and the
  // own participant row must exist server-side.
  await expect(page.getByRole('heading', { name: 'Join Session' })).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId(`user-${userName}`)).toBeVisible({ timeout: 15_000 });
  // Socket-level readiness: this text only renders once the client is bound
  // to the session room (join-session acknowledged server-side).
  await expect(page.getByText(/moderator will start the voting round/i)).toBeVisible({ timeout: 15_000 });
}