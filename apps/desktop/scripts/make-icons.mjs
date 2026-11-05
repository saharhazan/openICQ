/**
 * Draws the app and tray icons from the same pixel-art flower the client uses
 * (apps/client/src/ui/icons/flower.ts), so there is one source of truth and no
 * original ICQ artwork. Writes build/icon.png (1024 px, the source for the
 * .icns and .ico files electron-builder makes) and the offline tray flower.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const flowerSource = join(root, '..', 'client', 'src', 'ui', 'icons', 'flower.ts');

// flower.ts is browser TypeScript; bundle it into a temporary ES module Node can import.
const bundled = join(root, 'dist', 'flower.icons.mjs');
await build({ entryPoints: [flowerSource], outfile: bundled, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'warning' });
const { FLOWER_GRID, flowerPalette, LOGO_PETALS, ALL_RED } = await import(pathToFileURL(bundled).href);

function rgba(color) {
  if (color === undefined || color === 'transparent') return [0, 0, 0, 0];
  const hex = color.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
}

/** The 16x16 grid scaled by `scale`, centred on a `size` square. */
function pixels(palette, size, scale) {
  const data = Buffer.alloc(size * size * 4);
  const offset = Math.floor((size - 16 * scale) / 2);
  FLOWER_GRID.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      const key = row[gx];
      if (key === '.') continue;
      const [r, g, b, a] = rgba(palette[key]);
      if (a === 0) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((offset + gy * scale + dy) * size + offset + gx * scale + dx) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
    }
  });
  return data;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function png(size, data) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) data.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const logo = flowerPalette(LOGO_PETALS);
const offline = flowerPalette(ALL_RED);
await writeFile(join(root, 'build', 'icon.png'), png(1024, pixels(logo, 1024, 56)));
await writeFile(join(root, 'build', 'tray.png'), png(16, pixels(offline, 16, 1)));
await writeFile(join(root, 'build', 'tray@2x.png'), png(32, pixels(offline, 32, 2)));
process.stdout.write('openICQ icons written to build/\n');
