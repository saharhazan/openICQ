/**
 * Builds the desktop app into dist/: the main process (with the embedded
 * server), the two preload scripts, the Connection Settings page, the web
 * client and the icons. Run `pnpm --filter @openicq/client build` first
 * (the package scripts do).
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const clientDist = join(root, '..', 'client', 'dist');
if (!(await exists(join(clientDist, 'index.html')))) {
  throw new Error(`The web client is not built (${clientDist}). Run: pnpm --filter @openicq/client build`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'assets'), { recursive: true });

const common = { bundle: true, sourcemap: 'linked', logLevel: 'warning', legalComments: 'none' };

await Promise.all([
  build({
    ...common,
    entryPoints: [join(root, 'src/main/main.ts')],
    outfile: join(dist, 'main.cjs'),
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    // ws loads these optional native speed-ups only when installed.
    external: ['electron', 'bufferutil', 'utf-8-validate'],
  }),
  ...['host', 'connection'].map((name) =>
    build({
      ...common,
      entryPoints: [join(root, `src/preload/${name}.ts`)],
      outfile: join(dist, `preload-${name}.cjs`),
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      external: ['electron'],
    }),
  ),
  build({
    ...common,
    entryPoints: [join(root, 'src/connection/page.ts')],
    outfile: join(dist, 'connection/page.js'),
    platform: 'browser',
    target: 'chrome140',
    format: 'iife',
  }),
]);

// The Connection Settings page uses the client's bundled Source Sans 3 (OFL).
const fonts = join(dirname(createRequire(join(root, '..', 'client', 'package.json')).resolve('@fontsource/source-sans-3/package.json')), 'files');
await Promise.all([
  cp(join(root, 'src/connection/connection.html'), join(dist, 'connection/connection.html')),
  cp(join(root, 'src/connection/connection.css'), join(dist, 'connection/connection.css')),
  ...['400', '600'].map((weight) =>
    cp(join(fonts, `source-sans-3-latin-${weight}-normal.woff2`), join(dist, 'connection', `source-sans-3-latin-${weight}-normal.woff2`)),
  ),
  cp(clientDist, join(dist, 'client'), { recursive: true }),
  cp(join(root, 'build/icon.png'), join(dist, 'assets/icon.png')),
  cp(join(root, 'build/tray.png'), join(dist, 'assets/tray.png')),
  cp(join(root, 'build/tray@2x.png'), join(dist, 'assets/tray@2x.png')),
  cp(join(root, 'build/tray-unread.png'), join(dist, 'assets/tray-unread.png')),
  cp(join(root, 'build/tray-unread@2x.png'), join(dist, 'assets/tray-unread@2x.png')),
]);

process.stdout.write(`openICQ desktop built into ${dist}\n`);
