/**
 * Content-based image detection with `image-size`. Only the four formats a
 * browser can show safely inline count as images: JPEG, PNG, GIF and WebP.
 */
import { open } from 'node:fs/promises';
import { imageSize } from 'image-size';
import type { ImageInfo, ImageProbe, SafeImageType } from '../domain/ports.ts';

/** image-size needs the start of the file only; this covers large EXIF blocks in JPEGs. */
const HEADER_BYTES = 512 * 1024;
const SAFE_TYPES: Readonly<Record<string, SafeImageType>> = { jpg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp' };
/** EXIF orientations 5 to 8 rotate the picture by 90 degrees, so width and height swap. */
const FIRST_ROTATED_ORIENTATION = 5;

async function readHeader(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Dimensions from the header bytes, or null when they do not describe a safe image. */
export function describeImage(header: Uint8Array): ImageInfo | null {
  if (header.length === 0) return null;
  let measured: ReturnType<typeof imageSize>;
  try {
    measured = imageSize(header);
  } catch {
    // imageSize only parses the bytes in memory (reading the file happens above, and its errors propagate).
    // It throws to say "unknown or corrupt format", which makes the upload a plain file served as an attachment.
    return null;
  }
  const type = measured.type === undefined ? undefined : SAFE_TYPES[measured.type];
  if (type === undefined || !(measured.width > 0) || !(measured.height > 0)) return null;
  const rotated = (measured.orientation ?? 1) >= FIRST_ROTATED_ORIENTATION;
  return rotated
    ? { type, width: measured.height, height: measured.width }
    : { type, width: measured.width, height: measured.height };
}

export class ImageSizeProbe implements ImageProbe {
  async probe(path: string): Promise<ImageInfo | null> {
    return describeImage(await readHeader(path));
  }
}
