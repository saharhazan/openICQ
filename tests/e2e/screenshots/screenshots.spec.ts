/**
 * Not a test: produces the README screenshots from the real app, with real
 * accounts on a fresh server. Web shots come from Chromium, desktop shots
 * from the Electron app (each native window captured on its own, then laid
 * out side by side).
 */
import { expect, test, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { completeRegistration, contact, register, sendWithCtrlEnter, win } from '../specs/helpers.ts';
import { launch, nativeWindow } from '../desktop/native.ts';

const OUT = resolve(import.meta.dirname, '../../../docs/screenshots');
const shot = (name: string) => join(OUT, name);

async function browserUser(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('/');
  await expect(win(page, 'Connect to The ICQ Network')).toBeVisible();
  return page;
}

async function addContact(page: Page, uin: number, nick: string) {
  await page.getByRole('button', { name: 'Add/Invite Users' }).click();
  const finder = win(page, 'Find / Add Users to your list');
  await finder.getByText('Search by ICQ#').click();
  await finder.getByLabel('ICQ#:').fill(String(uin));
  await finder.getByRole('button', { name: 'Next >' }).click();
  await expect(finder.getByRole('table', { name: 'Search results' })).toContainText(nick);
  await finder.getByRole('button', { name: 'Next >' }).click();
  const add = win(page, 'Add User to Contact List');
  await add.getByRole('button', { name: 'Next >>' }).click();
  await add.getByRole('button', { name: 'Done' }).click();
}

test('web client screenshots', async ({ browser }) => {
  const alice = await browserUser(browser);
  await alice.screenshot({ path: shot('web-login.png') });
  const bob = await browserUser(browser);
  const aliceUin = await register(alice, 'Alice', { authRequired: false });
  const bobUin = await register(bob, 'Bob', { authRequired: false });
  await addContact(bob, aliceUin, 'Alice');
  await addContact(alice, bobUin, 'Bob');

  await contact(bob, 'Alice').dblclick();
  const bobSession = win(bob, /^Alice .*Message Session/);
  await sendWithCtrlEnter(bobSession, 'Hey Alice! Remember the uh-oh sound?');
  await contact(alice, 'Bob').dblclick();
  const aliceSession = win(alice, /^Bob .*Message Session/);
  await expect(aliceSession.getByRole('log').getByText('uh-oh')).toBeVisible();
  await sendWithCtrlEnter(aliceSession, 'Of course! It is back, together with the flower.');
  await expect(aliceSession.getByRole('log').getByText('flower')).toBeVisible();
  await alice.screenshot({ path: shot('web-chat.png') });

  await alice.getByRole('button', { name: 'Main' }).click();
  await alice.screenshot({ path: shot('web-menu.png') });
  await alice.keyboard.press('Escape');

  await alice.getByRole('button', { name: /^Status:/ }).click();
  await alice.getByRole('menuitem', { name: 'Away', exact: true }).click();
  const away = win(alice, 'Change / Confirm Away Message');
  await away.getByRole('textbox').fill('Out for lunch, back at 2.');
  await away.getByRole('button', { name: 'OK' }).click();
  await sendWithCtrlEnter(bobSession, 'Lunch?');
  await expect(win(bob, 'User Alice Is Away')).toBeVisible();
  await bob.screenshot({ path: shot('web-away.png') });
});

test('desktop app screenshots', async ({ browser }) => {
  test.skip(process.platform !== 'darwin', 'The desktop shots are taken on macOS.');
  const errors: string[] = [];
  const port = 5298;
  const apps: ElectronApplication[] = [];
  try {
    const alice = await launch('shot-alice', { mode: 'host', port, shareOnNetwork: false }, errors);
    apps.push(alice);
    const bob = await launch('shot-bob', { mode: 'connect', serverUrl: `http://127.0.0.1:${port}` }, errors);
    apps.push(bob);

    const registerIn = async (app: ElectronApplication, nick: string) => {
      const login = await nativeWindow(app, 'Connect to The ICQ Network');
      await login.getByRole('button', { name: 'Register A New User' }).click();
      const wizard = await nativeWindow(app, 'ICQ Registration');
      return completeRegistration(win(wizard, 'ICQ Registration'), nick, { authRequired: false });
    };
    const aliceUin = await registerIn(alice, 'Alice');
    const bobUin = await registerIn(bob, 'Bob');
    const bobList = await nativeWindow(bob, String(bobUin));
    // The finder and the add dialog are their own native windows in the desktop app.
    await bobList.getByRole('button', { name: 'Add/Invite Users' }).click();
    const finderPage = await nativeWindow(bob, 'Find / Add Users to your list');
    const finder = win(finderPage, 'Find / Add Users to your list');
    await finder.getByText('Search by ICQ#').click();
    await finder.getByLabel('ICQ#:').fill(String(aliceUin));
    await finder.getByRole('button', { name: 'Next >' }).click();
    await expect(finder.getByRole('table', { name: 'Search results' })).toContainText('Alice');
    await finder.getByRole('button', { name: 'Next >' }).click();
    const addPage = await nativeWindow(bob, 'Add User to Contact List');
    await win(addPage, 'Add User to Contact List').getByRole('button', { name: 'Next >>' }).click();
    await win(addPage, 'Add User to Contact List').getByRole('button', { name: 'Done' }).click();
    await contact(bobList, 'Alice').dblclick();
    const sessionPage = await nativeWindow(bob, /^Alice .*Message Session/);
    const session = win(sessionPage, /^Alice .*Message Session/);
    await sendWithCtrlEnter(session, 'Hi Alice! This is a real window now.');
    const aliceList = await nativeWindow(alice, String(aliceUin));
    await contact(aliceList, 'Bob').dblclick();
    const alicePage = await nativeWindow(alice, /^Bob .*Message Session/);
    await sendWithCtrlEnter(win(alicePage, /^Bob .*Message Session/), 'On Windows, macOS and Linux!');
    await expect(session.getByRole('log').getByText('On Windows, macOS and Linux!')).toBeVisible();

    // Bring the message window to the front, so its title bar is the active blue one.
    await bob.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle().endsWith('Message Session'))
        ?.focus();
    });
    await expect(session.locator('.title-bar')).not.toHaveClass(/inactive/);
    await bobList.screenshot({ path: shot('desktop-contact-list.png') });
    await sessionPage.screenshot({ path: shot('desktop-message.png') });
    await composeDesktop(browser);
  } finally {
    for (const app of apps.reverse()) await app.close();
  }
});

/** Lays the native window captures out on one canvas, as they sit on a desktop. */
async function composeDesktop(browser: Browser) {
  const image = (name: string) => `data:image/png;base64,${readFileSync(shot(name)).toString('base64')}`;
  const context = await browser.newContext({ viewport: { width: 820, height: 520 }, deviceScaleFactor: 2 });
  const canvas = await context.newPage();
  await canvas.setContent(`<!doctype html><html><body style="margin:0;width:820px;height:520px;position:relative;
    background:linear-gradient(135deg,#1d3557,#457b9d);overflow:hidden">
    <img src="${image('desktop-message.png')}" style="position:absolute;left:36px;top:48px;width:auto;height:420px;box-shadow:0 12px 32px rgba(0,0,0,.45)">
    <img src="${image('desktop-contact-list.png')}" style="position:absolute;right:40px;top:32px;height:456px;box-shadow:0 12px 32px rgba(0,0,0,.45)">
    </body></html>`);
  await canvas.waitForLoadState('load');
  await canvas.screenshot({ path: shot('desktop-macos.png') });
  await context.close();
}
