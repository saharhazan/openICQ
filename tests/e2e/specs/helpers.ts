import { expect, type Browser, type Locator, type Page } from '@playwright/test';

export const PASSWORD = 'secret123';

/** An ICQ window is an ARIA dialog named by its title bar. */
export function win(page: Page, title: string | RegExp): Locator {
  return page.getByRole('dialog', { name: title });
}

/** Collects page errors and unexpected console errors so a test can assert none happened. */
export function trackErrors(page: Page, label: string, sink: string[]): void {
  page.on('pageerror', (error) => sink.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    // The start-up session probe answers 401 when nobody is signed in: expected.
    if (message.type() === 'error' && !message.text().includes('401')) sink.push(`${label} console: ${message.text()}`);
  });
}

export async function openUser(browser: Browser, label: string, sink: string[]): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  trackErrors(page, label, sink);
  await page.goto('/');
  await expect(win(page, 'Connect to The ICQ Network')).toBeVisible();
  return page;
}

/** Fills the "ICQ Registration" wizard (already open) and returns the new UIN. */
export async function completeRegistration(wizard: Locator, nick: string, options: { authRequired: boolean }): Promise<number> {
  await expect(wizard).toBeVisible();
  await wizard.getByRole('button', { name: 'NEW ICQ#' }).click();
  await wizard.getByLabel('First Name:').fill(nick);
  await wizard.getByLabel('Last Name:').fill('Tester');
  await wizard.getByLabel('Nickname:').fill(nick);
  await wizard.getByLabel('Email (i.e. john@isp.com):').fill(`${nick.toLowerCase()}@example.com`);
  await wizard.getByLabel('Password:', { exact: true }).fill(PASSWORD);
  await wizard.getByLabel('Confirm Password:').fill(PASSWORD);
  await wizard.getByRole('button', { name: 'Next' }).click();
  const uinText = await wizard.getByTestId('new-uin').textContent();
  const uin = Number(uinText?.trim());
  expect(Number.isInteger(uin)).toBe(true);
  if (options.authRequired) {
    await wizard.getByText('My authorization is required before users add me to their Contact List').click();
  }
  await wizard.getByRole('button', { name: 'Next' }).click();
  return uin;
}

/** Runs the "ICQ Registration" wizard and returns the new UIN once the Contact List is up. */
export async function register(page: Page, nick: string, options: { authRequired: boolean }): Promise<number> {
  await page.getByRole('button', { name: 'Register A New User' }).click();
  const uin = await completeRegistration(win(page, 'ICQ Registration'), nick, options);
  await expect(win(page, String(uin))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status: Online' })).toBeVisible();
  return uin;
}

export async function login(page: Page, uin: number): Promise<void> {
  const dialog = win(page, 'Connect to The ICQ Network');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'ICQ#' }).fill(String(uin));
  await dialog.getByLabel('Password:').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(win(page, String(uin))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status: Online' })).toBeVisible();
}

/** Picks a status from the status button menu. */
export async function chooseStatus(page: Page, menuItem: string): Promise<void> {
  await page.getByRole('button', { name: /^Status:/ }).click();
  await page.getByRole('menuitem', { name: menuItem, exact: true }).click();
}

export function contact(page: Page, nick: string): Locator {
  return page.getByRole('option', { name: new RegExp(nick) });
}

export async function openMessageSession(page: Page, nick: string): Promise<Locator> {
  await contact(page, nick).dblclick();
  const session = win(page, new RegExp(`^${nick} .*Message Session`));
  await expect(session).toBeVisible();
  return session;
}

export async function sendWithCtrlEnter(session: Locator, text: string): Promise<void> {
  const box = session.getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Control+Enter');
}
