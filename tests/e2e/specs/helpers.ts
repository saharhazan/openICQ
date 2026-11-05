import { expect, type Browser, type Locator, type Page } from '@playwright/test';

export const PASSWORD = 'secret123';

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
  await expect(page.getByRole('heading', { name: 'Sign in by password' })).toBeVisible();
  return page;
}

/** Sign up (name, nickname, password), note the new ICQ number, pass "Introduce yourself", land in Chats. */
export async function signUp(page: Page, first: string, last: string, nickname: string): Promise<number> {
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await page.getByLabel('First name', { exact: true }).fill(first);
  await page.getByLabel('Last name', { exact: true }).fill(last);
  await page.getByLabel('Nickname (optional)').fill(nickname);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Your ICQ number' })).toBeVisible();
  const label = await page.getByLabel(/^ICQ# \d+$/).getAttribute('aria-label');
  const uin = Number(label?.split(' ')[1]);
  expect(Number.isInteger(uin)).toBe(true);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Add a name and avatar' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(chatList(page)).toBeVisible();
  return uin;
}

export async function signIn(page: Page, login: string): Promise<void> {
  await page.getByLabel('Login', { exact: true }).fill(login);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(chatList(page)).toBeVisible();
}

export function chatList(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Chats' });
}

export function chatRow(page: Page, title: string): Locator {
  return chatList(page).getByRole('option', { name: new RegExp(title) });
}

export function history(page: Page, title: string): Locator {
  return page.getByRole('log', { name: `Messages with ${title}` });
}

/** The bubble row of the message with this text. */
export function bubble(page: Page, title: string, text: string): Locator {
  return history(page, title).locator('[data-message-id]', { hasText: text }).last();
}

/** Types into the input and sends with Enter (the ICQ New default). */
export async function send(page: Page, text: string): Promise<void> {
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await box.press('Enter');
}

/** Opens the message menu (right click on the bubble) and picks an item. */
export async function messageAction(page: Page, title: string, text: string, item: string): Promise<void> {
  await bubble(page, title, text).locator('.bubble').click({ button: 'right' });
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** "Write" > "Add contact": finds a user by nickname, adds them and opens the chat. */
export async function addContactAndOpen(page: Page, nickname: string, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Write' }).click();
  await page.getByRole('menuitem', { name: 'Add contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add contact' });
  await dialog.getByLabel('Nickname or ICQ#').fill(nickname);
  await dialog.getByRole('button', { name: 'Find' }).click();
  const row = dialog.getByRole('listitem', { name });
  await row.getByRole('button', { name: 'Add' }).click();
  await expect(row).toContainText('The user has already been added earlier');
  await row.getByRole('button', { name: 'Message' }).click();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
}
