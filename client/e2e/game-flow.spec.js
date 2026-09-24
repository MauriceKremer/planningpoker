import { test, expect } from '@playwright/test';
import { hostSessionViaUi, joinViaPrompt, createSessionViaApi, joinSessionViaApi, seedSessionMembership } from './helpers.js';

test.describe('Core estimation flow (create → join → vote → reveal)', () => {
  test('host and joiner complete a full voting round', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const joiner = await joinerCtx.newPage();

    // 1. Host creates a session through the real home form.
    const sessionId = await hostSessionViaUi(host, {
      title: 'E2E Voting Round',
      moderatorName: 'Host Alice',
    });

    // 2. Joiner joins through the in-session UsernamePrompt.
    await joinViaPrompt(joiner, sessionId, 'Bob');

    // 3. Both participants are visible to both users (scoped to the list to
    //    avoid strict-mode collisions with other name occurrences).
    await expect(host.getByTestId('user-Bob')).toBeVisible();
    await expect(joiner.getByTestId('user-Host Alice')).toBeVisible();

    // 4. Moderator starts the voting round; both see the card grid.
    await host.getByRole('button', { name: 'Start Voting' }).click();
    await expect(host.getByRole('button', { name: '5', exact: true })).toBeVisible();
    await expect(joiner.getByRole('button', { name: '5', exact: true })).toBeVisible();

    // 5. Both vote (different cards to make the distribution non-trivial).
    await host.getByRole('button', { name: '5', exact: true }).click();
    await joiner.getByRole('button', { name: '8', exact: true }).click();

    // 6. All votes in → results render automatically.
    await expect(host.getByRole('heading', { name: 'Voting Results' })).toBeVisible();
    await expect(joiner.getByRole('heading', { name: 'Voting Results' })).toBeVisible();
    await expect(host.getByText('Vote Distribution')).toBeVisible();

    // 7. Moderator starts a new round; the card grid re-opens for voting
    //    (reset-votes keeps the round open — votes clear, voting stays open).
    await host.getByRole('button', { name: 'New Round' }).click();
    await expect(host.getByRole('button', { name: '5', exact: true })).toBeVisible();
    await expect(joiner.getByRole('button', { name: '5', exact: true })).toBeVisible();
    await expect(joiner.getByRole('heading', { name: 'Select Your Estimate' })).toBeVisible();

    await hostCtx.close();
    await joinerCtx.close();
  });

  test('joiner can vote immediately after moderator starts a round', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const joiner = await joinerCtx.newPage();

    // Both participants join via API + storage seed — the UI prompt flow is
    // covered by the other tests; this one focuses on immediate voting.
    const { sessionId, userId, moderatorName } = await createSessionViaApi('API Host');
    await seedSessionMembership(host, sessionId, userId, moderatorName);
    const joinerData = await joinSessionViaApi(sessionId, 'Fast Joiner');
    await seedSessionMembership(joiner, sessionId, joinerData.user.id, 'Fast Joiner');
    await host.goto(`/session/${sessionId}`);
    await expect(host.getByTestId('user-API Host')).toBeVisible();
    await joiner.goto(`/session/${sessionId}`);
    await expect(joiner.getByTestId('user-Fast Joiner')).toBeVisible();

    await host.getByRole('button', { name: 'Start Voting' }).click();
    await joiner.getByRole('button', { name: '13', exact: true }).click();
    // Host has not voted: results must not be final yet.
    await expect(host.getByText('Waiting for Voting to Start')).toBeHidden();
    await expect(host.getByRole('heading', { name: 'Voting Results' })).toBeHidden();
    await host.getByRole('button', { name: /☕/ }).click();
    await expect(host.getByRole('heading', { name: 'Voting Results' })).toBeVisible();

    await hostCtx.close();
    await joinerCtx.close();
  });
});