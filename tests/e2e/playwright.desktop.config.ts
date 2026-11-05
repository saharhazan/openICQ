import { defineConfig } from '@playwright/test';

/** The desktop app (Electron): run `pnpm --filter @openicq/desktop build` first (`pnpm test:desktop` does). */
export default defineConfig({
  testDir: './desktop',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
