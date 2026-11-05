import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const SERVER = '127.0.0.1:5190';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://${SERVER}` },
      '/ws': { target: `ws://${SERVER}`, ws: true },
    },
  },
  css: {
    // 98.css ships `@media (not(hover))`, which lightningcss rejects; keep the rule instead of failing the build.
    lightningcss: { errorRecovery: true },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
