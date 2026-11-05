import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = 5191;
const repoRoot = resolve(import.meta.dirname, '../..');
const databaseDir = mkdtempSync(join(tmpdir(), 'icq-e2e-'));

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'pnpm --filter @openicq/client build && node apps/server/src/main.ts',
    cwd: repoRoot,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: join(databaseDir, "openicq-e2e.db"),
      ALLOWED_ORIGINS: `http://127.0.0.1:${PORT}`,
      CLIENT_DIST_DIR: join(repoRoot, 'apps/client/dist'),
      LOG_LEVEL: 'warn',
    },
  },
});
