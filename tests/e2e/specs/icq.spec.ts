/**
 * End to end: two real users in two isolated browser contexts against the
 * production build served by the real server and a fresh SQLite database.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  chooseStatus,
  contact,
  login,
  openMessageSession,
  openUser,
  register,
  sendWithCtrlEnter,
  win,
} from './helpers.ts';

test.describe.serial('openICQ, two users', () => {
  const errors: string[] = [];
  let alice: Page;
  let bob: Page;
  let aliceUin = 0;
  let bobUin = 0;

  test.beforeAll(async ({ browser }) => {
    alice = await openUser(browser, 'alice', errors);
    bob = await openUser(browser, 'bob', errors);
  });

  test.afterAll(async () => {
    await alice.context().close();
    await bob.context().close();
  });

  test('registers two users with sequential UINs', async () => {
    aliceUin = await register(alice, 'Alice', { authRequired: true });
    bobUin = await register(bob, 'Bob', { authRequired: false });
    expect(bobUin).toBe(aliceUin + 1);
  });

  test('adds a contact through the authorization flow', async () => {
    await bob.getByRole('button', { name: 'Add/Invite Users' }).click();
    const finder = win(bob, 'Find / Add Users to your list');
    await finder.getByText('Search by ICQ#').click();
    await finder.getByLabel('ICQ#:').fill(String(aliceUin));
    await finder.getByRole('button', { name: 'Next >' }).click();
    await expect(finder.getByRole('table', { name: 'Search results' })).toContainText('Alice');
    await finder.getByRole('button', { name: 'Next >' }).click();
    const request = win(bob, 'Add User to Contact List');
    await expect(request.getByLabel('Request reason')).toBeVisible();
    await request.getByRole('button', { name: 'Next >>' }).click();
    await expect(request.getByText("Request sent for user's authorization")).toBeVisible();
    await request.getByRole('button', { name: 'Done' }).click();
    await expect(contact(bob, 'Alice')).toBeVisible();

    await alice.getByRole('button', { name: 'System Notice' }).click();
    const notice = win(alice, 'Request For Authorization');
    await expect(notice).toContainText('This user has requested your authorization');
    await notice.getByRole('button', { name: 'Authorize' }).click();
    await notice.getByRole('button', { name: 'Add To Contact List' }).click();
    const addBack = win(alice, 'Add User to Contact List');
    await addBack.getByRole('button', { name: 'Next >>' }).click();
    await addBack.getByRole('button', { name: 'Done' }).click();

    await expect(contact(alice, 'Bob')).toBeVisible();
    // Bob now sees Alice in the Online section, so presence flows after authorization.
    await expect(bob.getByRole('group', { name: 'Online' }).getByRole('option', { name: /Alice/ })).toBeVisible();
  });

  test('chats in real time both ways', async () => {
    const bobSession = await openMessageSession(bob, 'Alice');
    await sendWithCtrlEnter(bobSession, 'Hi Alice! See https://example.com');
    await expect(bobSession.getByRole('log').getByText('Hi Alice!')).toBeVisible();

    const aliceSession = await openMessageSession(alice, 'Bob');
    await expect(aliceSession.getByRole('log').getByText('Hi Alice!')).toBeVisible();
    const link = aliceSession.getByRole('link', { name: 'https://example.com' });
    await expect(link).toHaveAttribute('rel', /noopener/);

    await sendWithCtrlEnter(aliceSession, 'Hello Bob,\nnice to see you.');
    await expect(bobSession.getByRole('log').getByText('nice to see you.')).toBeVisible();
  });

  test('shows the auto-response when the recipient is Away', async () => {
    await chooseStatus(alice, 'Away');
    const awayDialog = win(alice, 'Change / Confirm Away Message');
    await awayDialog.getByRole('textbox').fill('Out for lunch, back soon');
    await awayDialog.getByRole('button', { name: 'OK' }).click();
    await expect(alice.getByRole('button', { name: 'Status: Away' })).toBeVisible();

    const bobSession = win(bob, /^Alice .*Message Session/);
    await expect(bobSession).toHaveAccessibleName(/Away/);
    await sendWithCtrlEnter(bobSession, 'Are you there?');
    const auto = win(bob, 'User Alice Is Away');
    await expect(auto).toContainText('Out for lunch, back soon');
    await auto.getByRole('button', { name: 'OK' }).click();
    await chooseStatus(alice, 'Available/Connect');
    await expect(alice.getByRole('button', { name: 'Status: Online' })).toBeVisible();
  });

  test('asks Send Urgent or Send To Contact List for an Occupied recipient', async () => {
    await chooseStatus(bob, 'Occupied (Urgent Msgs)');
    // While the countdown runs, the default button reads "Closing in N Secs" (as in the original).
    await win(bob, 'Change / Confirm Occupied Message').getByRole('button', { name: /^Closing in \d+ Secs$/ }).click();
    await expect(bob.getByRole('button', { name: 'Status: Occupied' })).toBeVisible();

    const aliceSession = win(alice, /^Bob .*Message Session/);
    await expect(aliceSession).toHaveAccessibleName(/Occupied/);
    await sendWithCtrlEnter(aliceSession, 'Urgent: call me');
    await expect(aliceSession.getByText('User is in Occupied mode.')).toBeVisible();
    await aliceSession.getByRole('button', { name: 'Send Urgent' }).click();
    await expect(win(bob, /^Alice .*Message Session/).getByText('Urgent: call me')).toBeVisible();
    const auto = win(alice, 'User Bob is in Occupied mode');
    await auto.getByRole('button', { name: 'OK' }).click();
    await chooseStatus(bob, 'Available/Connect');
  });

  test('stores a message for an offline user and delivers it on reconnect', async () => {
    await win(alice, /^Bob .*Message Session/).getByRole('button', { name: 'Cancel' }).click();
    await chooseStatus(alice, 'Offline/Disconnect');
    await expect(alice.getByRole('button', { name: 'Status: Offline' })).toBeVisible();
    await expect(bob.getByRole('group', { name: 'Offline' }).getByRole('option', { name: /Alice/ })).toBeVisible();

    const bobSession = win(bob, /^Alice .*Message Session/);
    await bobSession.getByRole('textbox', { name: 'Message' }).fill('This one waits for you offline.');
    await bobSession.getByRole('button', { name: 'Send' }).click();
    await expect(bobSession.getByRole('log').getByText('This one waits for you offline.')).toBeVisible();

    await chooseStatus(alice, 'Available/Connect');
    await expect(alice.getByRole('button', { name: 'Status: Online' })).toBeVisible();
    const aliceSession = await openMessageSession(alice, 'Bob');
    await expect(aliceSession.getByText('This one waits for you offline.')).toBeVisible();
    await expect(aliceSession.getByText('Offline Message')).toBeVisible();
  });

  test("shows another user's details including the published email", async () => {
    const bobSession = win(bob, /^Alice .*Message Session/);
    await bobSession.getByRole('button', { name: 'Info' }).click();
    const info = win(bob, /^User Info/);
    await expect(info.getByLabel('Email:')).toHaveValue('alice@example.com');
    await expect(info.getByLabel('ICQ#:')).toHaveValue(String(aliceUin));
    await info.getByRole('button', { name: 'Cancel' }).click();
  });

  test('keeps the message history on the server', async () => {
    await contact(alice, 'Bob').click({ button: 'right' });
    await alice.getByRole('menuitem', { name: 'Message History', exact: true }).click();
    const history = win(alice, /History Of Events/);
    const table = history.getByRole('table');
    await expect(table).toContainText('Hi Alice!');
    await expect(table).toContainText('This one waits for you offline.');
    await history.getByRole('button', { name: 'Close' }).last().click();
  });

  test('signs the first location out when the same ICQ# connects elsewhere', async ({ browser }) => {
    const elsewhere = await openUser(browser, 'alice-elsewhere', errors);
    await login(elsewhere, aliceUin);
    await expect(win(alice, 'ICQ Network Error')).toContainText('Your ICQ# is being used on another computer');
    await expect(alice.getByRole('button', { name: 'Status: Offline' })).toBeVisible();
    await elsewhere.context().close();
  });

  test('raised no page errors', () => {
    expect(errors).toEqual([]);
  });
});
