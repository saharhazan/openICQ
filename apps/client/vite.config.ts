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
  build: {
    target: 'es2023',
    sourcemap: true,
    // React, zod and the protocol schemas make one ~500 kB chunk; the emoji list is a separate asset.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // CSS is stubbed in tests, except where a test reads the metrics (bubble radii).
    css: { include: [/bubble\.css/, /styles\/global\.css/] },
  },
});
