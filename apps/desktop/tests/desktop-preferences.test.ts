import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_PREFERENCES, loadDesktopPreferences, saveDesktopPreferences } from '../src/main/desktop-preferences.ts';

describe('desktop preferences', () => {
  it('starts with the ICQ New defaults and round-trips a saved choice', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'openicq-prefs-')), 'nested', 'desktop-preferences.json');
    expect(await loadDesktopPreferences(file)).toEqual(DEFAULT_DESKTOP_PREFERENCES);
    const chosen = { launchAtLogin: true, launchMinimized: true, animateTaskbar: false };
    await saveDesktopPreferences(file, chosen);
    expect(await loadDesktopPreferences(file)).toEqual(chosen);
  });

  it('reports a damaged or invalid file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openicq-prefs-'));
    await writeFile(join(dir, 'broken.json'), '{');
    await expect(loadDesktopPreferences(join(dir, 'broken.json'))).rejects.toThrow('damaged');
    await writeFile(join(dir, 'invalid.json'), JSON.stringify({ launchAtLogin: 'yes' }));
    await expect(loadDesktopPreferences(join(dir, 'invalid.json'))).rejects.toThrow('not valid');
  });
});
