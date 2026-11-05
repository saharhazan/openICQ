/**
 * Draws the openICQ app and tray icons: our own flat flower in the ICQ New
 * green (#21D86A): eight round petals around a white heart. No original ICQ
 * artwork is used. Writes build/icon.png (1024 px, the source of the .icns and
 * .ico files electron-builder makes) and the tray icons, plain and unread
 * (with the red ICQ New badge colour #F83E33), at 16 and 32 px.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const GREEN = [0x21, 0xd8, 0x6a];
const WHITE = [0xff, 0xff, 0xff];
const RED = [0xf8, 0x3e, 0x33];
const SAMPLES = 4;

/** Shapes in unit space (0..1), painted in order; the last one hit wins. */
function flower({ badge }) {
  const shapes = [];
  const petals = 8;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
    shapes.push({ x: 0.5 + Math.cos(angle) * 0.29, y: 0.5 + Math.sin(angle) * 0.29, r: 0.155, color: GREEN });
  }
  shapes.push({ x: 0.5, y: 0.5, r: 0.21, color: GREEN });
  shapes.push({ x: 0.5, y: 0.5, r: 0.1, color: WHITE });
  if (badge) {
    shapes.push({ x: 0.8, y: 0.2, r: 0.2, color: WHITE });
    shapes.push({ x: 0.8, y: 0.2, r: 0.16, color: RED });
  }
  return shapes;
}

/** Supersampled rasterizer: anti-aliased edges, transparent background. */
function render(shapes, size, padding) {
  const data = Buffer.alloc(size * size * 4);
  const inner = size * (1 - 2 * padding);
  const offset = size * padding;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ux = (px + (sx + 0.5) / SAMPLES - offset) / inner;
          const uy = (py + (sy + 0.5) / SAMPLES - offset) / inner;
          let color = null;
          for (const shape of shapes) {
            if ((ux - shape.x) ** 2 + (uy - shape.y) ** 2 <= shape.r ** 2) color = shape.color;
          }
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          hits += 1;
        }
      }
      if (hits === 0) continue;
      const i = (py * size + px) * 4;
      data[i] = Math.round(r / hits);
      data[i + 1] = Math.round(g / hits);
      data[i + 2] = Math.round(b / hits);
      data[i + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
    }
  }
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

const outputs = [
  ['icon.png', flower({ badge: false }), 1024, 0.08],
  ['tray.png', flower({ badge: false }), 16, 0],
  ['tray@2x.png', flower({ badge: false }), 32, 0],
  ['tray-unread.png', flower({ badge: true }), 16, 0],
  ['tray-unread@2x.png', flower({ badge: true }), 32, 0],
];
for (const [name, shapes, size, padding] of outputs) {
  await writeFile(join(root, 'build', name), png(size, render(shapes, size, padding)));
}
process.stdout.write('openICQ icons written to build/\n');
