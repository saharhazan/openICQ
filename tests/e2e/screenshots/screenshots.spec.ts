/**
 * Not a test: produces the README screenshots from the real app, with real
 * accounts on a fresh server, through the same UI a user drives. Web shots
 * come from Chromium; the desktop shot from the Electron app (macOS).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, mainWindow } from '../desktop/native.ts';
import { addContactAndOpen, bubble, chatRow, messageAction, send, signUp } from '../specs/helpers.ts';

const OUT = resolve(import.meta.dirname, '../../../docs/screenshots');
const shot = (name: string) => join(OUT, name);

async function browserUser(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in by password' })).toBeVisible();
  return page;
}

async function react(page: Page, title: string, text: string, reaction: string) {
  const target = bubble(page, title, text);
  await target.hover();
  await target.getByRole('button', { name: 'Reactions' }).click();
  await page.getByRole('menuitem', { name: reaction }).click();
}

test('web client screenshots', async ({ browser }) => {
  const alice = await browserUser(browser);
  await alice.screenshot({ path: shot('web-sign-in.png') });
  const bob = await browserUser(browser);
  const carol = await browserUser(browser);
  await signUp(alice, 'Alice', 'Smith', 'alice.smith');
  await signUp(bob, 'Bob', 'Johnson', 'bob.johnson');
  await signUp(carol, 'Carol', 'White', 'carol.white');

  await addContactAndOpen(bob, 'alice.smith', 'Alice Smith');
  await send(bob, 'Hey Alice! Did you see that ICQ is back?');
  await chatRow(alice, 'Bob Johnson').click();
  await send(alice, 'No way! With the uh-oh sound?');
  await send(bob, 'Yes, and the green theme. Try the reactions');
  await react(alice, 'Bob Johnson', 'Try the reactions', 'Funny');
  await messageAction(alice, 'Bob Johnson', 'Try the reactions', 'Reply');
  await send(alice, 'Love it. Let us bring Carol in');

  await addContactAndOpen(alice, 'bob.johnson', 'Bob Johnson');
  await addContactAndOpen(alice, 'carol.white', 'Carol White');
  await alice.getByRole('button', { name: 'Write' }).click();
  await alice.getByRole('menuitem', { name: 'Create group' }).click();
  const dialog = alice.getByRole('dialog', { name: 'Create group' });
  await dialog.getByLabel('Group name').fill('Weekend trip');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('checkbox', { name: 'Bob Johnson' }).check();
  await dialog.getByRole('checkbox', { name: 'Carol White' }).check();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await chatRow(bob, 'Weekend trip').click();
  await send(bob, 'Who is driving on Friday?');
  await chatRow(carol, 'Weekend trip').click();
  await send(carol, 'I can drive, I have room for three');
  await chatRow(alice, 'Weekend trip').click();
  await react(alice, 'Weekend trip', 'room for three', 'Like');
  await send(alice, 'Great, I will bring snacks');
  await send(bob, 'See you at 8 at the station');

  await chatRow(alice, 'Bob Johnson').click();
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: shot('web-chat.png') });
  await chatRow(alice, 'Weekend trip').click();
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: shot('web-group.png') });
  await alice.getByRole('button', { name: 'Settings' }).click();
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: shot('web-settings.png') });
  await alice.getByRole('button', { name: 'Appearance' }).click();
  await alice.getByRole('radio', { name: 'Dark Green' }).check();
  await alice.getByRole('button', { name: 'Chats' }).click();
  await chatRow(alice, 'Bob Johnson').click();
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: shot('web-dark.png') });
});

test('desktop app screenshot', async ({ browser }) => {
  test.skip(process.platform !== 'darwin', 'The desktop shot is taken on macOS.');
  const errors: string[] = [];
  const port = 5298;
  const host = await launch('shot-host', { mode: 'host', port, shareOnNetwork: false }, errors);
  try {
    const page = await mainWindow(host);
    await signUp(page, 'Dana', 'Levi', 'dana.levi');
    await chatRow(page, 'Favorites').click();
    await send(page, 'Notes to self: the desktop app hides to the tray, like ICQ New');
    await send(page, 'It runs on Windows, macOS and Linux');
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot('desktop-window.png') });
  } finally {
    await host.close();
  }
  // The window capture on a desktop-like background, with a window shadow.
  const image = `data:image/png;base64,${readFileSync(shot('desktop-window.png')).toString('base64')}`;
  const context = await browser.newContext({ viewport: { width: 1160, height: 720 }, deviceScaleFactor: 2 });
  const canvas = await context.newPage();
  await canvas.setContent(`<!doctype html><html><body style="margin:0;width:1160px;height:720px;display:grid;place-items:center;
    background:linear-gradient(135deg,#0b3d2e,#21d86a)"><img src="${image}" style="width:1000px;border-radius:10px;
    box-shadow:0 24px 60px rgba(0,0,0,.45)"></body></html>`);
  await canvas.waitForLoadState('load');
  await canvas.screenshot({ path: shot('desktop-app.png') });
  await context.close();
});
