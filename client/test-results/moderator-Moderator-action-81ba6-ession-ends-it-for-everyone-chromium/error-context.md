# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: moderator.spec.js >> Moderator actions >> closing a session ends it for everyone
- Location: e2e/moderator.spec.js:82:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/has been closed by the moderator/)
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/has been closed by the moderator/) with timeout 10000ms
  - waiting for getByText(/has been closed by the moderator/)

```

```yaml
- banner:
  - link "Planning Poker":
    - /url: /
  - link "Report an issue on GitHub":
    - /url: https://github.com/MauriceKremer/planningpoker/issues
  - link "Join the discussion on GitHub":
    - /url: https://github.com/MauriceKremer/planningpoker/discussions
  - link "About this app":
    - /url: /about
- main:
  - heading "Closer Host's Planning Session" [level=1]
  - text: "Moderator: Closer Host You!"
  - button "Leave Session"
  - text: "ID: F825A1BB Share link:"
  - code: http://localhost:4080/session/F825A1BB
  - button "📋 Copy"
  - heading "Moderator Controls" [level=4]
  - paragraph: "Card Set: 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89"
  - button "👤 Transfer" [disabled]
  - button "🃏 Cards"
  - button "🔔"
  - button "Close session": ❌ Close session
  - heading "Participants" [level=3]
  - text: C Closer Host Moderator W Witness
  - button "🗳️"
  - button "✕"
  - heading "Waiting for Voting to Start" [level=3]
  - button "Start Voting":
    - img
    - text: Start Voting
  - paragraph: Click 'Start Voting' to begin a new voting round.
```

# Test source

```ts
  2   | import { createSessionViaApi, joinSessionViaApi, seedSessionMembership, joinViaPrompt } from './helpers.js';
  3   | 
  4   | test.describe('Moderator actions', () => {
  5   |   test('moderator can remove a participant directly', async ({ browser }) => {
  6   |     const hostCtx = await browser.newContext();
  7   |     const joinerCtx = await browser.newContext();
  8   |     const host = await hostCtx.newPage();
  9   |     const joiner = await joinerCtx.newPage();
  10  | 
  11  |     const { sessionId, userId, moderatorName } = await createSessionViaApi('Mod Host');
  12  |     await seedSessionMembership(host, sessionId, userId, moderatorName);
  13  |     await host.goto(`/session/${sessionId}`);
  14  |     await joinViaPrompt(joiner, sessionId, 'Remove Me');
  15  | 
  16  |     // Moderator removes the joiner via the ✕ button in the participant list
  17  |     // (window.confirm must be accepted).
  18  |     joiner.on('dialog', (dialog) => dialog.dismiss());
  19  |     host.on('dialog', (dialog) => dialog.accept());
  20  |     await host.getByTestId('user-Remove Me').getByTitle('Remove participant', { exact: true }).click();
  21  | 
  22  |     // Both sides reflect the removal: participant gone, joiner bounced.
  23  |     await expect(host.getByText('Remove Me')).toBeHidden({ timeout: 15_000 });
  24  | 
  25  |     await hostCtx.close();
  26  |     await joinerCtx.close();
  27  |   });
  28  | 
  29  |   test('vote-out flow: start, banner shown, cancel', async ({ browser }) => {
  30  |     const hostCtx = await browser.newContext();
  31  |     const joinerCtx = await browser.newContext();
  32  |     const host = await hostCtx.newPage();
  33  |     const joiner = await joinerCtx.newPage();
  34  | 
  35  |     const { sessionId, userId, moderatorName } = await createSessionViaApi('VoteOut Host');
  36  |     await seedSessionMembership(host, sessionId, userId, moderatorName);
  37  |     await host.goto(`/session/${sessionId}`);
  38  |     await joinViaPrompt(joiner, sessionId, 'Target Bob');
  39  | 
  40  |     // Host initiates a vote-out against the joiner.
  41  |     await host.getByTestId('user-Target Bob').getByTitle('Start vote to remove participant', { exact: true }).click();
  42  | 
  43  |     // Banner appears for the target (no Yes/No buttons for the target itself).
  44  |     await expect(joiner.getByTestId('vote-out-banner')).toContainText('Vote to remove Target Bob');
  45  |     await expect(joiner.getByText('Other participants are voting to remove you from this session.')).toBeVisible();
  46  |     // Initiator sees the vote count and can cancel.
  47  |     await expect(host.getByTestId('vote-out-banner')).toContainText('Started by VoteOut Host');
  48  |     await host.getByRole('button', { name: 'Cancel' }).click();
  49  |     await expect(host.getByTestId('vote-out-banner')).toBeHidden();
  50  |     await expect(joiner.getByTestId('vote-out-banner')).toBeHidden();
  51  | 
  52  |     await hostCtx.close();
  53  |     await joinerCtx.close();
  54  |   });
  55  | 
  56  |   test('moderator can transfer the role', async ({ browser }) => {
  57  |     const hostCtx = await browser.newContext();
  58  |     const joinerCtx = await browser.newContext();
  59  |     const host = await hostCtx.newPage();
  60  |     const joiner = await joinerCtx.newPage();
  61  | 
  62  |     const { sessionId, userId, moderatorName } = await createSessionViaApi('Transfer Host');
  63  |     await seedSessionMembership(host, sessionId, userId, moderatorName);
  64  |     await host.goto(`/session/${sessionId}`);
  65  |     await joinViaPrompt(joiner, sessionId, 'New Mod');
  66  | 
  67  |     await host.getByTitle('Transfer moderator role to another participant').click();
  68  |     await host.getByRole('combobox').selectOption({ label: 'New Mod' });
  69  |     // window.confirm guards the transfer — accept it.
  70  |     host.on('dialog', (dialog) => dialog.accept());
  71  |     await host.getByRole('button', { name: 'Transfer', exact: true }).last().click();
  72  | 
  73  |     // The "Moderator" badge moves to the new participant.
  74  |     await expect(host.getByTestId('user-New Mod').getByText('Moderator', { exact: true })).toBeVisible({ timeout: 15_000 });
  75  |     // The former host no longer sees moderator controls.
  76  |     await expect(host.getByTitle('Close session')).toBeHidden();
  77  | 
  78  |     await hostCtx.close();
  79  |     await joinerCtx.close();
  80  |   });
  81  | 
  82  |   test('closing a session ends it for everyone', async ({ browser }) => {
  83  |     const hostCtx = await browser.newContext();
  84  |     const joinerCtx = await browser.newContext();
  85  |     const host = await hostCtx.newPage();
  86  |     const joiner = await joinerCtx.newPage();
  87  | 
  88  |     const { sessionId, userId, moderatorName } = await createSessionViaApi('Closer Host');
  89  |     await seedSessionMembership(host, sessionId, userId, moderatorName);
  90  |     const joinerData = await joinSessionViaApi(sessionId, 'Witness');
  91  |     await seedSessionMembership(joiner, sessionId, joinerData.user.id, 'Witness');
  92  |     await host.goto(`/session/${sessionId}`);
  93  |     await joiner.goto(`/session/${sessionId}`);
  94  |     await expect(host.getByTestId('user-Witness')).toBeVisible();
  95  |     await expect(joiner.getByTestId('user-Closer Host')).toBeVisible();
  96  | 
  97  |     host.on('dialog', (dialog) => dialog.accept());
  98  |     joiner.on('console', (m) => console.log('J-CONSOLE', Date.now() % 100000, m.text().slice(0, 120)));
  99  |     await host.getByLabel('Close session').click();
  100 | 
  101 |     await expect(joiner.getByText(/has been closed by the moderator/)).toBeVisible({ timeout: 15_000 });
> 102 |     await expect(host.getByText(/has been closed by the moderator/)).toBeVisible();
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
  103 | 
  104 |     await hostCtx.close();
  105 |     await joinerCtx.close();
  106 |   });
  107 | 
  108 |   test('join by code via /join', async ({ page }) => {
  109 |     const { sessionId } = await createSessionViaApi('Code Host');
  110 |     await page.goto('/join');
  111 |     await page.getByPlaceholder('Enter session ID').fill(sessionId);
  112 |     await page.getByPlaceholder('Enter your name').fill('ByCode');
  113 |     await page.getByRole('button', { name: 'Join Session' }).click();
  114 |     await page.waitForURL(/\/session\/[0-9A-F]+/i);
  115 |     await expect(page.getByTestId('user-Code Host')).toBeVisible();
  116 |     await expect(page.getByTestId('user-Code Host')).toBeVisible();
  117 |   });
  118 | });
```