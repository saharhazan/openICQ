/**
 * The ICQ flower, drawn from geometry: eight outlined oval petals around a
 * yellow centre, painted back to front like a sprite. Fill cells carry the
 * petal number ('a'..'h', shade 'A'..'H') so each petal can be coloured on
 * its own (the red logo petal, the spinning "connecting" flower).
 */

const SIZE = 16;
const CENTER = 8;
const CARDINAL = { distance: 4.9, length: 2.7, width: 1.8 };
const DIAGONAL = { distance: 4.8, length: 2.6, width: 1.75 };
const CENTER_RADIUS = 1.6;
/** Diagonal petals first, so the cardinal ones overlap them. */
const PAINT_ORDER = [1, 3, 5, 7, 0, 2, 4, 6];
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type Cell = readonly [number, number];
const key = ([x, y]: Cell) => y * SIZE + x;

function petalCells(index: number): Set<number> {
  const shape = index % 2 === 0 ? CARDINAL : DIAGONAL;
  const angle = ((index * 45 - 90) * Math.PI) / 180;
  const px = CENTER + shape.distance * Math.cos(angle);
  const py = CENTER + shape.distance * Math.sin(angle);
  const cells = new Set<number>();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - px;
      const dy = y + 0.5 - py;
      const u = dx * Math.cos(angle) + dy * Math.sin(angle);
      const v = -dx * Math.sin(angle) + dy * Math.cos(angle);
      if ((u / shape.length) ** 2 + (v / shape.width) ** 2 <= 1) cells.add(key([x, y]));
    }
  }
  return cells;
}

function ringOf(cells: Set<number>): number[] {
  const ring: number[] = [];
  for (const k of cells) {
    const x = k % SIZE;
    const y = Math.floor(k / SIZE);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = key([nx, ny]);
      if (!cells.has(n)) ring.push(n);
    }
  }
  return ring;
}

function buildFlowerGrid(): string[] {
  const grid: string[] = new Array<string>(SIZE * SIZE).fill('.');
  for (const index of PAINT_ORDER) {
    const cells = petalCells(index);
    for (const k of ringOf(cells)) grid[k] = '#';
    for (const k of cells) {
      const x = k % SIZE;
      const y = Math.floor(k / SIZE);
      const highlight = !cells.has(key([x - 1, y])) || !cells.has(key([x, y - 1]));
      const shade = !cells.has(key([x + 1, y])) && !cells.has(key([x, y + 1]));
      grid[k] = highlight ? 'w' : shade ? String.fromCharCode(65 + index) : String.fromCharCode(97 + index);
    }
  }
  const center = new Set<number>();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) <= CENTER_RADIUS) center.add(key([x, y]));
    }
  }
  for (const k of ringOf(center)) grid[k] = '#';
  for (const k of center) grid[k] = 'Y';
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) rows.push(grid.slice(y * SIZE, (y + 1) * SIZE).join(''));
  return rows;
}

/** The base flower grid, computed once. */
export const FLOWER_GRID: readonly string[] = buildFlowerGrid();

export type PetalColor = 'green' | 'red' | 'grey' | 'clear';

const PETAL_TONES: Record<PetalColor, { fill: string; shade: string; highlight: string }> = {
  green: { fill: '#00d800', shade: '#008000', highlight: '#ffffff' },
  red: { fill: '#f00000', shade: '#900000', highlight: '#ffffff' },
  grey: { fill: '#c0c0c0', shade: '#808080', highlight: '#ffffff' },
  clear: { fill: 'transparent', shade: 'transparent', highlight: '#ffffff' },
};

/** Palette for the flower with one colour per petal (index 0 is the top petal, clockwise). */
export function flowerPalette(petals: readonly PetalColor[], centerColor = '#ffff00'): Record<string, string> {
  const palette: Record<string, string> = { '#': '#000000', Y: centerColor, w: '#ffffff' };
  for (let i = 0; i < 8; i++) {
    const tone = PETAL_TONES[petals[i] ?? 'green'];
    palette[String.fromCharCode(97 + i)] = tone.fill;
    palette[String.fromCharCode(65 + i)] = tone.shade;
  }
  return palette;
}

export const ALL_GREEN: readonly PetalColor[] = ['green', 'green', 'green', 'green', 'green', 'green', 'green', 'green'];
export const ALL_RED: readonly PetalColor[] = ['red', 'red', 'red', 'red', 'red', 'red', 'red', 'red'];
/** The ICQ logo: green with the lower-left petal red. */
export const LOGO_PETALS: readonly PetalColor[] = ['green', 'green', 'green', 'green', 'green', 'red', 'green', 'green'];

/** Frame `frame` of the spinning "connecting" flower: a red half that walks around. */
export function connectingPetals(frame: number): PetalColor[] {
  return Array.from({ length: 8 }, (_, i) => (((i - frame) % 8) + 8) % 8 < 4 ? 'red' : 'green');
}
