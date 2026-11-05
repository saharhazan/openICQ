/** Local previews for files picked to send. The CSP allows data: images but not blob: URLs. */
import type { LocalAttachment } from '../state/types';

export const IMAGE_MIME = /^image\/(jpeg|png|gif|webp)$/;

export function isImageFile(file: Pick<File, 'type'>): boolean {
  return IMAGE_MIME.test(file.type);
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unreadable image')));
    reader.onerror = () => reject(reader.error ?? new Error('Unreadable image'));
    reader.readAsDataURL(file);
  });
}

/** The pixel size, or null when the browser cannot decode it (the preview then uses the 320 x 240 box). */
async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Builds the pending bubble's view of a file. A preview that fails to build leaves a plain file card. */
export async function toLocalAttachment(file: File, onError: (error: Error) => void): Promise<LocalAttachment> {
  const base: LocalAttachment = { name: file.name, size: file.size, kind: 'file', previewUrl: null, width: null, height: null };
  if (!isImageFile(file)) return base;
  try {
    const [previewUrl, size] = await Promise.all([readDataUrl(file), imageSize(file)]);
    return { ...base, kind: 'image', previewUrl, width: size?.width ?? null, height: size?.height ?? null };
  } catch (error) {
    onError(new Error(`openICQ could not preview ${file.name}.`, { cause: error }));
    return base;
  }
}

/** Preview boxes of MessageStyle.cpp: at most 360 x 360, at least 112 x 112, 320 x 240 while the size is unknown. */
export const PREVIEW_MAX = 360;
export const PREVIEW_MIN = 112;

/** Fits an image into the preview box, keeping the ratio; tiny images get the minimum box. */
export function fitPreview(width: number | null, height: number | null, max = PREVIEW_MAX): { width: number; height: number } {
  if (!width || !height) return { width: 320, height: 240 };
  const scale = Math.min(1, max / width, max / height);
  const clamp = (value: number) => Math.min(max, Math.max(PREVIEW_MIN, Math.round(value * scale)));
  return { width: clamp(width), height: clamp(height) };
}
