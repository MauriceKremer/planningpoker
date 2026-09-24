import { test, expect } from '@playwright/test';
import { createSessionViaApi, joinSessionViaApi, seedSessionMembership, joinViaPrompt } from './helpers.js';

test.describe('Moderator actions', () => {
  test('moderator can remove a participant directly', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const joiner = await joinerCtx.newPage();

    const { sessionId, userId, moderatorName } = await createSessionViaApi('Mod Host');
    await seedSessionMembership(host, sessionId, userId, moderatorName);
    await host.goto(`/session/${sessionId}`);
    await joinViaPrompt(joiner, sessionId, 'Remove Me');

    // Moderator removes the joiner via the ✕ button in the participant list
    // (window.confirm must be accepted).
    joiner.on('dialog', (dialog) => dialog.dismiss());
    host.on('dialog', (dialog) => dialog.accept());
    await host.getByTestId('user-Remove Me').getByTitle('Remove participant', { exact: true }).click();

    // Both sides reflect the removal: participant gone, joiner bounced.
    await expect(host.getByText('Remove Me')).toBeHidden({ timeout: 15_000 });

    await hostCtx.close();
    await joinerCtx.close();
  });

  test('vote-out flow: start, banner shown, cancel', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const joiner = await joinerCtx.newPage();

    const { sessionId, userId, moderatorName } = await createSessionViaApi('VoteOut Host');
    await seedSessionMembership(host, sessionId, userId, moderatorName);
    await host.goto(`/session/${sessionId}`);
    await joinViaPrompt(joiner, sessionId, 'Target Bob');

    // Host initiates a vote-out against the joiner.
    await host.getByTestId('user-Target Bob').getByTitle('Start vote to remove participant', { exact: true }).click();

    // Banner appears for the target (no Yes/No buttons for the target itself).
    await expect(joiner.getByTestId('vote-out-banner')).toContainText('Vote to remove Target Bob');
    await expect(joiner.getByText('Other participants are voting to remove you from this session.')).toBeVisible();
    // Initiator sees the vote count and can cancel.
    await expect(host.getByTestId('vote-out-banner')).toContainText('Started by VoteOut Host');
    await host.getByRole('button', { name: 'Cancel' }).click();
    await expect(host.getByTestId('vote-out-banner')).toBeHidden();
    await expect(joiner.getByTestId('vote-out-banner')).toBeHidden();

    await hostCtx.close();
    await joinerCtx.close();
  });

  test('moderator can transfer the role', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const joiner = await joinerCtx.newPage();

    const { sessionId, userId, moderatorName } = await createSessionViaApi('Transfer Host');
    await seedSessionMembership(host, sessionId, userId, moderatorName);
    await host.goto(`/session/${sessionId}`);
    await joinViaPrompt(joiner, sessionId, 'New Mod');

    await host.getByTitle('Transfer moderator role to another participant').click();
    await host.getByRole('combobox').selectOption({ label: 'New Mod' });
    // window.confirm guards the transfer — accept it.
    host.on('dialog', (dialog) => dialog.accept());
    await host.getByRole('button', { name: 'Transfer', exact: true }).last().click();

    // The "Moderator" badge moves to the new participant.
    await expect(host.getByTestId('user-New Mod').getByText('Moderator', { exact: true })).toBeVisible({ timeout: 15_000 });
    // The former host no longer sees moderator controls.
    await expect(host.getByTitle('Close session')).toBeHidden();

    await hostCtx.close();
    await joinerCtx.close();
  });

  test('closing a session ends it for everyone', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const joinerCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const joiner = await joinerCtx.newPage();

    const { sessionId, userId, moderatorName } = await createSessionViaApi('Closer Host');
    await seedSessionMembership(host, sessionId, userId, moderatorName);
    const joinerData = await joinSessionViaApi(sessionId, 'Witness');
    await seedSessionMembership(joiner, sessionId, joinerData.user.id, 'Witness');
    await host.goto(`/session/${sessionId}`);
    await joiner.goto(`/session/${sessionId}`);
    await expect(host.getByTestId('user-Witness')).toBeVisible();
    await expect(joiner.getByTestId('user-Closer Host')).toBeVisible();

    host.on('dialog', (dialog) => dialog.accept());
    await host.getByLabel('Close session').click();

    await expect(joiner.getByText(/has been closed by the moderator/)).toBeVisible({ timeout: 15_000 });
    await expect(host.getByText(/has been closed by the moderator/)).toBeVisible();

    await hostCtx.close();
    await joinerCtx.close();
  });

  test('join by code via /join', async ({ page }) => {
    const { sessionId } = await createSessionViaApi('Code Host');
    await page.goto('/join');
    await page.getByPlaceholder('Enter session ID').fill(sessionId);
    await page.getByPlaceholder('Enter your name').fill('ByCode');
    await page.getByRole('button', { name: 'Join Session' }).click();
    await page.waitForURL(/\/session\/[0-9A-F]+/i);
    await expect(page.getByTestId('user-Code Host')).toBeVisible();
    await expect(page.getByTestId('user-Code Host')).toBeVisible();
  });
});