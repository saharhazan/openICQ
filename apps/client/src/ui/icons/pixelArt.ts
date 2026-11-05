/**
 * Pixel-art helpers. Icons are drawn on a 16x16 grid and rendered as one SVG
 * path per colour, so they stay crisp at 1x, 2x and any zoom level.
 */

export type Palette = Record<string, string>;

/** Turns a grid of palette keys ('.' is transparent) into colour -> path data. */
export function gridToPaths(grid: readonly string[], palette: Palette): Array<{ color: string; d: string }> {
  const byColor = new Map<string, string[]>();
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const key = row[x];
      if (key === undefined || key === '.') continue;
      const color = palette[key];
      if (color === undefined || color === 'transparent') continue;
      const parts = byColor.get(color) ?? [];
      parts.push(`M${x} ${y}h1v1h-1z`);
      byColor.set(color, parts);
    }
  });
  return [...byColor.entries()].map(([color, parts]) => ({ color, d: parts.join('') }));
}

/** Paints `top` over `base`: every non '.' cell of the overlay wins. */
export function overlay(base: readonly string[], top: readonly string[]): string[] {
  return base.map((row, y) => {
    const over = top[y] ?? '';
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const cell = over[x];
      out += cell !== undefined && cell !== '.' ? cell : (row[x] ?? '.');
    }
    return out;
  });
}
