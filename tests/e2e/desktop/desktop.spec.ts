/**
 * End to end for the desktop app: two real openICQ apps with their own
 * profiles. Alice's app hosts the server ("Host a server on this computer"),
 * Bob's app connects to it ("Connect to a server"), and every ICQ window is a
 * native window.
 */
import { expect, test, type ElectronApplication } from '@playwright/test';
import { completeRegistration, contact, sendWithCtrlEnter, win } from '../specs/helpers.ts';
import { clickClosing, expectVisible, launch, nativeWindow, osWindows } from './native.ts';

const PORT = 5293;

test.describe.serial('openICQ desktop, host and client', () => {
  const errors: string[] = [];
  let alice: ElectronApplication;
  let bob: ElectronApplication;
  let aliceUin = 0;
  let bobUin = 0;

  test.afterAll(async () => {
    await bob?.close();
    await alice?.close();
  });

  async function registerIn(app: ElectronApplication, nick: string): Promise<number> {
    const login = await nativeWindow(app, 'Connect to The ICQ Network');
    await clickClosing(login, login.getByRole('button', { name: 'Register A New User' }));
    const wizard = await nativeWindow(app, 'ICQ Registration');
    const uin = await completeRegistration(win(wizard, 'ICQ Registration'), nick, { authRequired: false }, (button) =>
      clickClosing(wizard, button),
    );
    const list = await nativeWindow(app, String(uin));
    await expect(list.getByRole('button', { name: 'Status: Online' })).toBeVisible();
    return uin;
  }

  test('hosts a server and opens the login as a native window sized to its content', async () => {
    alice = await launch('alice', { mode: 'host', port: PORT, shareOnNetwork: false }, errors);
    await nativeWindow(alice, 'Connect to The ICQ Network');
    await expectVisible(alice, 'Connect to The ICQ Network', true);
    const windows = await osWindows(alice);
    const login = windows.find((w) => w.title === 'Connect to The ICQ Network');
    // Content-sized: the native window fits the dialog (the original is about 270 x 175).
    expect(login?.width).toBeGreaterThan(200);
    expect(login?.width).toBeLessThan(400);
    // The host page holds the client but is never shown.
    expect(windows.find((w) => w.title === 'openICQ')?.visible).toBe(false);
  });

  test('registers in native windows; the Contact List replaces the login', async () => {
    aliceUin = await registerIn(alice, 'Alice');
    await expectVisible(alice, String(aliceUin), true);
    await expect.poll(async () => (await osWindows(alice)).some((w) => w.title === 'Connect to The ICQ Network')).toBe(false);
  });

  test('a second app connects to the hosted server', async () => {
    bob = await launch('bob', { mode: 'connect', serverUrl: `http://127.0.0.1:${PORT}` }, errors);
    bobUin = await registerIn(bob, 'Bob');
    expect(bobUin).toBe(aliceUin + 1);
  });

  test('adds a contact and chats across the two apps', async () => {
    const bobList = await nativeWindow(bob, String(bobUin));
    await bobList.getByRole('button', { name: 'Add/Invite Users' }).click();
    const finderPage = await nativeWindow(bob, 'Find / Add Users to your list');
    const finder = win(finderPage, 'Find / Add Users to your list');
    await finder.getByText('Search by ICQ#').click();
    await finder.getByLabel('ICQ#:').fill(String(aliceUin));
    await finder.getByRole('button', { name: 'Next >' }).click();
    await expect(finder.getByRole('table', { name: 'Search results' })).toContainText('Alice');
    await clickClosing(finderPage, finder.getByRole('button', { name: 'Next >' }));
    const addPage = await nativeWindow(bob, 'Add User to Contact List');
    const add = win(addPage, 'Add User to Contact List');
    await add.getByRole('button', { name: 'Next >>' }).click();
    await expect(add).toContainText('Alice has been added to your Contact List.');
    await clickClosing(addPage, add.getByRole('button', { name: 'Done' }));
    await expect(bobList.getByRole('group', { name: 'Online' }).getByRole('option', { name: /Alice/ })).toBeVisible();

    await contact(bobList, 'Alice').dblclick();
    const bobSessionPage = await nativeWindow(bob, /^Alice .*Message Session/);
    const bobSession = win(bobSessionPage, /^Alice .*Message Session/);
    await sendWithCtrlEnter(bobSession, 'Hi Alice, from another app!');
    const bobLog = bobSession.getByRole('log', { name: 'Messages with Alice' });
    await expect(bobLog.getByText('Hi Alice, from another app!')).toBeVisible();

    // Bob is not in Alice's list yet: he shows up under Not In List with his message waiting.
    const aliceList = await nativeWindow(alice, String(aliceUin));
    await contact(aliceList, 'Bob').dblclick();
    const alicePage = await nativeWindow(alice, /^Bob .*Message Session/);
    const aliceSession = win(alicePage, /^Bob .*Message Session/);
    await expect(aliceSession.getByRole('log', { name: 'Messages with Bob' }).getByText('Hi Alice, from another app!')).toBeVisible();
    await sendWithCtrlEnter(aliceSession, 'Hello Bob!');
    await expect(bobLog.getByText('Hello Bob!')).toBeVisible();
  });

  test('closing the Contact List hides it to the tray; a tray click opens the waiting event, then the list', async () => {
    const aliceList = await nativeWindow(alice, String(aliceUin));
    await win(aliceList, String(aliceUin)).getByRole('button', { name: 'Close' }).click();
    await expectVisible(alice, String(aliceUin), false);

    // The same command a click on the tray flower sends. Bob added Alice, so a System Notice waits first.
    const trayClick = () =>
      alice.evaluate(({ BrowserWindow }) => {
        const host = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'openICQ' && !w.isVisible());
        host?.webContents.send('openicq:tray-command', 'activate');
      });
    await trayClick();
    const noticePage = await nativeWindow(alice, '"You Were Added"');
    const notice = win(noticePage, '"You Were Added"');
    await expect(notice).toContainText('The user added you to his/her Contact List.');
    await clickClosing(noticePage, notice.getByRole('group', { name: 'Response Action' }).getByRole('button', { name: 'Close' }));
    // Dismissing goes through the server; until it is done the notice is still the next event.
    await expect.poll(async () => (await osWindows(alice)).some((w) => w.title === '"You Were Added"')).toBe(false);

    await trayClick();
    await expectVisible(alice, String(aliceUin), true);
  });

  test('Shut Down quits the app', async () => {
    const bobList = await nativeWindow(bob, String(bobUin));
    await bobList.getByRole('button', { name: 'Main' }).click();
    await bobList.getByRole('menuitem', { name: 'Shut Down' }).click();
    const confirm = await nativeWindow(bob, 'Confirm Shut Down...');
    const exited = new Promise<void>((resolve) => bob.process().once('exit', () => resolve()));
    await clickClosing(confirm, win(confirm, 'Confirm Shut Down...').getByRole('button', { name: 'Yes' }));
    await exited;
  });

  test('no page errors in any window', () => {
    expect(errors).toEqual([]);
  });
});
