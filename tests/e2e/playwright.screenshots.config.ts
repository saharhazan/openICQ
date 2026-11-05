import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Regenerates docs/screenshots from the real app: `pnpm screenshots` (macOS for the desktop shots). */
const PORT = 5197;
const repoRoot = resolve(import.meta.dirname, '../..');
const databaseDir = mkdtempSync(join(tmpdir(), 'openicq-shots-'));

export default defineConfig({
  testDir: './screenshots',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: 'node apps/server/src/main.ts',
    cwd: repoRoot,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: join(databaseDir, 'shots.db'),
      ALLOWED_ORIGINS: `http://127.0.0.1:${PORT}`,
      CLIENT_DIST_DIR: join(repoRoot, 'apps/client/dist'),
      LOG_LEVEL: 'warn',
    },
  },
});
