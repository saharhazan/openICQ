/** Turns pixel-art paths into a PNG data URL (the native tray icon cannot show SVG). */
export type PixelPaths = ReadonlyArray<{ color: string; d: string }>;

const GRID = 16;

export function rasterize(doc: Document, paths: PixelPaths, size: number): string {
  const canvas = doc.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('openICQ cannot draw its tray icon: no 2D canvas.');
  context.imageSmoothingEnabled = false;
  context.scale(size / GRID, size / GRID);
  for (const path of paths) {
    context.fillStyle = path.color;
    context.fill(new Path2D(path.d));
  }
  return canvas.toDataURL('image/png');
}
