/**
 * The shell's own preferences (from the page's General and Notifications
 * settings), saved next to the connection settings so "Launch minimized" works
 * before the page has loaded.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { desktopPreferencesSchema, type DesktopPreferences } from '@openicq/desktop-bridge';

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  launchAtLogin: false,
  launchMinimized: false,
  animateTaskbar: false,
};

/** The saved preferences, the defaults when none are saved yet. A damaged file is an error. */
export async function loadDesktopPreferences(file: string): Promise<DesktopPreferences> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return DEFAULT_DESKTOP_PREFERENCES;
    throw new Error(`openICQ cannot read its preferences (${file}).`, { cause: error });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`The openICQ preferences file is damaged (${file}).`, { cause: error });
  }
  const parsed = desktopPreferencesSchema.safeParse(json);
  if (!parsed.success) throw new Error(`The openICQ preferences file is not valid (${file}).`);
  return parsed.data;
}

export async function saveDesktopPreferences(file: string, preferences: DesktopPreferences): Promise<void> {
  const valid = desktopPreferencesSchema.parse(preferences);
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(valid, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
}
