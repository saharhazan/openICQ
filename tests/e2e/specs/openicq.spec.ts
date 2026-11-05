/**
 * End to end: two real users in two isolated browser contexts against the
 * production build served by the real server and a fresh SQLite database.
 */
import { expect, test, type Page } from '@playwright/test';
import { addContactAndOpen, bubble, chatRow, history, messageAction, openUser, send, signIn, signUp } from './helpers.ts';

test.describe.serial('openICQ (ICQ New), two users', () => {
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

  test('signs up two users with sequential ICQ numbers; Favorites is pinned', async () => {
    aliceUin = await signUp(alice, 'Alice', 'Smith', 'alice.smith');
    bobUin = await signUp(bob, 'Bob', 'Jones', 'bob.jones');
    expect(bobUin).toBe(aliceUin + 1);
    await expect(chatRow(alice, 'Favorites')).toBeVisible();
  });

  test('adds a contact by nickname and chats in real time, with unread, delivery and read marks', async () => {
    await addContactAndOpen(bob, 'alice.smith', 'Alice Smith');
    await send(bob, 'Hi Alice! ICQ is back.');
    await expect(bubble(bob, 'Alice Smith', 'ICQ is back')).toBeVisible();

    const row = chatRow(alice, 'Bob Jones');
    await expect(row).toContainText('ICQ is back');
    await expect(row).toContainText('1');
    await row.click();
    await expect(bubble(alice, 'Bob Jones', 'ICQ is back')).toBeVisible();
    // Alice read it: Bob sees her read head under the message instead of a tick.
    await expect(bubble(bob, 'Alice Smith', 'ICQ is back').locator('[data-heads]')).toHaveAttribute('data-heads', String(aliceUin));

    await send(alice, 'Hello Bob, welcome back!');
    await expect(bubble(bob, 'Alice Smith', 'welcome back')).toBeVisible();
  });

  test('shows "is typing" while the other side types', async () => {
    await bob.getByRole('textbox', { name: 'Message' }).pressSequentially('typing a longer answer here', { delay: 120 });
    await expect(alice.getByText('Bob is typing')).toBeVisible();
    await bob.getByRole('textbox', { name: 'Message' }).fill('');
  });

  test('replies, edits, reacts and deletes for all', async () => {
    await messageAction(alice, 'Bob Jones', 'ICQ is back', 'Reply');
    await send(alice, 'Yes, with the green theme');
    const reply = bubble(bob, 'Alice Smith', 'with the green theme');
    await expect(reply).toContainText('Hi Alice! ICQ is back.');

    await messageAction(alice, 'Bob Jones', 'with the green theme', 'Edit');
    const box = alice.getByRole('textbox', { name: 'Message' });
    await box.fill('Yes, with the green and the dark theme');
    await alice.getByRole('button', { name: 'Edit' }).click();
    await expect(bubble(bob, 'Alice Smith', 'green and the dark theme')).toContainText('edited');

    const target = bubble(bob, 'Alice Smith', 'welcome back');
    await target.hover();
    await target.getByRole('button', { name: 'Reactions' }).click();
    await bob.getByRole('menuitem', { name: 'Like' }).click();
    await expect(bubble(alice, 'Bob Jones', 'welcome back').getByRole('button', { name: 'Like 1' })).toBeVisible();

    await bob.getByRole('textbox', { name: 'Message' }).fill('');
    await send(bob, 'Oops, wrong chat');
    await expect(bubble(alice, 'Bob Jones', 'wrong chat')).toBeVisible();
    await messageAction(bob, 'Alice Smith', 'wrong chat', 'Delete for all');
    await bob.getByRole('dialog', { name: 'Delete message' }).getByRole('button', { name: 'Delete' }).click();
    await expect(history(alice, 'Bob Jones')).not.toContainText('wrong chat');
    await expect(history(alice, 'Bob Jones')).toContainText('Message was deleted');
  });

  test('creates a group with a contact; members see the service message and chat', async () => {
    await addContactAndOpen(alice, 'bob.jones', 'Bob Jones');
    await alice.getByRole('button', { name: 'Write' }).click();
    await alice.getByRole('menuitem', { name: 'Create group' }).click();
    const dialog = alice.getByRole('dialog', { name: 'Create group' });
    await dialog.getByLabel('Group name').fill('Weekend trip');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByRole('checkbox', { name: 'Bob Jones' }).check();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(chatRow(bob, 'Weekend trip')).toBeVisible();

    await chatRow(alice, 'Weekend trip').click();
    await send(alice, 'Who is driving on Friday?');
    await chatRow(bob, 'Weekend trip').click();
    await expect(history(bob, 'Weekend trip')).toContainText('Alice Smith');
    await expect(bubble(bob, 'Weekend trip', 'driving on Friday')).toBeVisible();
  });

  test('sends an image that the other member can see', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNk+M/wn4GBgYGJAQoAAD4AAQ1uG9QAAAAASUVORK5CYII=',
      'base64',
    );
    const chooser = bob.waitForEvent('filechooser');
    await bob.getByRole('button', { name: 'Attach' }).click();
    await bob.getByRole('menuitem', { name: 'Photo or Video' }).click();
    await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
    const sendFiles = bob.getByRole('dialog', { name: 'Send files' });
    await sendFiles.getByRole('button', { name: 'Send' }).click();
    await expect(history(alice, 'Weekend trip').locator('img').last()).toBeVisible();
  });

  test('keeps the Dark Green theme after a reload, and signs in again by ICQ number', async () => {
    await alice.getByRole('button', { name: 'Settings' }).click();
    await alice.getByRole('button', { name: 'Appearance' }).click();
    await alice.getByRole('radio', { name: 'Dark Green' }).check();
    await alice.reload();
    await expect(alice.getByRole('radio', { name: 'Dark Green' }).or(alice.getByRole('listbox', { name: 'Chats' })).first()).toBeVisible();
    const theme = await alice.evaluate(() => document.documentElement.dataset['theme'] ?? document.body.dataset['theme'] ?? '');
    expect(theme).toMatch(/dark/i);

    await bob.getByRole('button', { name: 'Settings' }).click();
    await bob.getByRole('button', { name: 'My profile' }).first().click();
    await bob.getByRole('button', { name: 'Sign out' }).click();
    await bob.getByRole('dialog', { name: 'Sign out' }).getByRole('button', { name: 'Sign out' }).click();
    await expect(bob.getByRole('heading', { name: 'Sign in by password' })).toBeVisible();
    await signIn(bob, String(bobUin));
    await expect(chatRow(bob, 'Weekend trip')).toBeVisible();
  });

  test('no page errors', () => {
    expect(errors).toEqual([]);
  });
});
