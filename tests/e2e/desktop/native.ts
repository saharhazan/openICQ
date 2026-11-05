/** Helpers for the desktop app: every ICQ window is its own native window (a Playwright page). */
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
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

/** The openICQ main window: the page loaded from the server (the Connection Settings page is a file). */
export async function mainWindow(app: ElectronApplication, timeoutMs = 20_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const page = app.windows().find((p) => !p.isClosed() && p.url().startsWith('http'));
    if (page) return page;
    if (Date.now() > deadline) throw new Error('The openICQ main window did not open');
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
