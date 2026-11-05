/**
 * End to end for the desktop app: two real openICQ apps with their own
 * profiles. Alice's app hosts the server ("Host a server on this computer"),
 * Bob's app connects to it ("Connect to a server"). Like ICQ New, each app is
 * one main window that hides to the tray when closed.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { addContactAndOpen, bubble, chatRow, send, signUp } from '../specs/helpers.ts';
import { expectVisible, launch, mainWindow, osWindows } from './native.ts';

const PORT = 5293;
const HEALTH = `http://127.0.0.1:${PORT}/api/health`;

test.describe.serial('openICQ desktop, host and client', () => {
  const errors: string[] = [];
  let alice: ElectronApplication;
  let bob: ElectronApplication;
  let aliceWin: Page;
  let bobWin: Page;

  test.afterAll(async () => {
    await bob?.close();
    await alice?.close();
  });

  test('hosts a server and opens the ICQ New main window (1000 x 600)', async () => {
    alice = await launch('alice', { mode: 'host', port: PORT, shareOnNetwork: false }, errors);
    aliceWin = await mainWindow(alice);
    await expect(aliceWin.getByRole('heading', { name: 'Sign in by password' })).toBeVisible();
    await expectVisible(alice, 'openICQ', true);
    const main = (await osWindows(alice)).find((w) => w.visible);
    expect(main).toMatchObject({ width: 1000, height: 600 });
    expect((await fetch(HEALTH, { signal: AbortSignal.timeout(5_000) })).status).toBe(200);
  });

  test('signs up in both apps; the second app connects to the hosted server', async () => {
    const aliceUin = await signUp(aliceWin, 'Alice', 'Smith', 'alice.smith');
    bob = await launch('bob', { mode: 'connect', serverUrl: `http://127.0.0.1:${PORT}` }, errors);
    bobWin = await mainWindow(bob);
    const bobUin = await signUp(bobWin, 'Bob', 'Jones', 'bob.jones');
    expect(bobUin).toBe(aliceUin + 1);
  });

  test('chats across the two apps', async () => {
    await addContactAndOpen(bobWin, 'alice.smith', 'Alice Smith');
    await send(bobWin, 'Hi Alice, from another app!');
    await chatRow(aliceWin, 'Bob Jones').click();
    await expect(bubble(aliceWin, 'Bob Jones', 'from another app')).toBeVisible();
    await send(aliceWin, 'Hello Bob, on Windows, macOS and Linux!');
    await expect(bubble(bobWin, 'Alice Smith', 'Windows, macOS and Linux')).toBeVisible();
  });

  test('shows the desktop-only "Connection settings" in General', async () => {
    await aliceWin.getByRole('button', { name: 'Settings' }).click();
    await aliceWin.getByRole('button', { name: 'General' }).click();
    await expect(aliceWin.getByText('Connection settings')).toBeVisible();
    await aliceWin.getByRole('button', { name: 'Chats' }).click();
  });

  test('closing the window hides it to the tray; unread reaches the badge; the dock or tray brings it back', async () => {
    await alice.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isVisible())?.close());
    await expectVisible(alice, 'openICQ', false);
    await send(bobWin, 'Are you there?');
    if (process.platform === 'darwin') {
      await expect.poll(() => alice.evaluate(({ app }) => app.getBadgeCount())).toBeGreaterThan(0);
    }
    // The same path a dock click (macOS) or a tray click (Windows, Linux) takes.
    await alice.evaluate(({ app }) => app.emit('activate'));
    await expectVisible(alice, 'openICQ', true);
    await chatRow(aliceWin, 'Bob Jones').click();
    await expect(bubble(aliceWin, 'Bob Jones', 'Are you there?')).toBeVisible();
  });

  test('quitting the hosting app stops its server', async () => {
    await bob.close();
    await alice.close();
    await expect(fetch(HEALTH, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
  });

  test('no page errors in any window', () => {
    expect(errors).toEqual([]);
  });
});
