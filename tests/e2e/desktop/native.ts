/** Helpers for the desktop app: every ICQ window is its own native window (a Playwright page). */
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { trackErrors } from '../specs/helpers.ts';

const APP_DIR = resolve(import.meta.dirname, '../../../apps/desktop');

export type ConnectionConfig =
  | { mode: 'host'; port: number; shareOnNetwork: boolean }
  | { mode: 'connect'; serverUrl: string };

/** Starts openICQ with its own profile, as if on its own computer. */
export async function launch(label: string, config: ConnectionConfig, errors: string[]): Promise<ElectronApplication> {
  const profile = mkdtempSync(join(tmpdir(), `openicq-${label}-`));
  writeFileSync(join(profile, 'connection.json'), JSON.stringify(config));
  const app = await electron.launch({ args: [APP_DIR], env: { ...process.env, OPENICQ_USER_DATA: profile } });
  app.on('window', (page) => trackErrors(page, label, errors));
  return app;
}

async function findWindow(app: ElectronApplication, title: string | RegExp): Promise<Page | null> {
  for (const page of app.windows()) {
    if (page.isClosed()) continue;
    const current = await page.title().catch((error: unknown) => {
      // A window can close between listing and reading its title; it is simply not the one we want.
      if (page.isClosed()) return '';
      throw error;
    });
    if (typeof title === 'string' ? current === title : title.test(current)) return page;
  }
  return null;
}

/** Waits for the native window with this title. */
export async function nativeWindow(app: ElectronApplication, title: string | RegExp, timeoutMs = 15_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const page = await findWindow(app, title);
    if (page) return page;
    if (Date.now() > deadline) throw new Error(`No native window titled ${String(title)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export interface NativeWindowInfo {
  title: string;
  visible: boolean;
  width: number;
  height: number;
}

/** What the OS shows: every BrowserWindow with its title, visibility and content size. */
export function osWindows(app: ElectronApplication): Promise<NativeWindowInfo[]> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => {
      const bounds = w.getContentBounds();
      return { title: w.getTitle(), visible: w.isVisible(), width: bounds.width, height: bounds.height };
    }),
  );
}

export async function expectVisible(app: ElectronApplication, title: string, visible: boolean): Promise<void> {
  try {
    await expect.poll(async () => (await osWindows(app)).find((w) => w.title === title)?.visible ?? false).toBe(visible);
  } catch (error) {
    // Say what the OS actually shows, so a failure on a CI runner can be understood from the log.
    const windows = JSON.stringify(await osWindows(app));
    throw new Error(`Expected "${title}" visible=${visible}; native windows: ${windows}`, { cause: error });
  }
}

/**
 * Clicks a button whose job is to close its own native window (Register, Done, OK...).
 * The window can be gone before Playwright hears back from the click; that is success.
 */
export async function clickClosing(page: Page, locator: Locator): Promise<void> {
  try {
    await locator.click();
  } catch (error) {
    if (!page.isClosed() && !String(error).includes('has been closed')) throw error;
  }
}
