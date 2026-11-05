/**
 * Uploads and downloads (plan rule 12). Files live under random names; images
 * (JPEG, PNG, GIF, WebP) are recognised by content, never by name or declared type.
 * Storage is bounded: a quota per user, an optional cap for everyone together,
 * and files nothing uses any more are deleted, row and disk.
 */
import type { Readable } from 'node:stream';
import { LIMITS, type Attachment, type FilePurpose } from '@openicq/protocol';
import type { FileRecord } from '../domain/entities.ts';
import { DomainError, FileTooLargeError } from '../domain/errors.ts';
import type { Clock, ErrorLog, FileStorage, ImageProbe, SafeImageType, SavedFile } from '../domain/ports.ts';
import type { FileRepository } from '../domain/repositories.ts';
import type { Uin } from '../domain/vocabulary.ts';
import { MESSAGES } from './support.ts';
import { toAttachment } from './views.ts';

export const IMAGE_MIME: Readonly<Record<SafeImageType, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};
/** Images served inline; everything else is a download. */
export const INLINE_MIME_TYPES: ReadonlySet<string> = new Set(Object.values(IMAGE_MIME));
const FALLBACK_MIME = 'application/octet-stream';
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;
/** Control characters, path separators, and the bidi controls that can make "gpj.exe" read as "exe.jpg". */
// eslint-disable-next-line no-control-regex -- control characters are what this pattern removes
const UNSAFE_NAME_CHARACTERS = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069/\\]/g;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
export const SERVER_STORAGE_FULL = 'The server has no storage space left for uploads. Please try again later.';

export interface UploadInput {
  readonly source: Readable;
  readonly fileName: string;
  readonly declaredMime: string;
  readonly purpose: FilePurpose;
}

export interface Download {
  readonly file: FileRecord;
  readonly size: number;
  open(): Readable;
}

export interface FileServiceDeps {
  readonly files: FileRepository;
  readonly storage: FileStorage;
  readonly probe: ImageProbe;
  readonly clock: Clock;
  readonly log: ErrorLog;
  /** Largest single upload. */
  readonly maxBytes: number;
  /** What one user may keep stored, all their files together. */
  readonly maxUserBytes: number;
  /** What everyone may keep stored together; 0 means no limit. */
  readonly maxTotalBytes: number;
}

/** The most the next upload may store, and which limit sets it. */
interface UploadBudget {
  readonly bytes: number;
  readonly limitedBy: 'file' | 'user' | 'total';
  /** The owner's stored bytes, uploads in progress included. */
  readonly userBytes: number;
}

/** The uploader's file name without directories, control or bidi characters, at most 255 characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).at(-1) ?? '';
  const cleaned = base.replace(UNSAFE_NAME_CHARACTERS, '').trim().slice(0, LIMITS.fileName);
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'file' : cleaned;
}

/** A declared type is kept for plain files only when it looks like one; it never makes a file an image. */
export function plainFileMime(declared: string): string {
  const mime = declared.trim().toLowerCase();
  return MIME_PATTERN.test(mime) && !mime.startsWith('image/') && !mime.startsWith('text/html') ? mime : FALLBACK_MIME;
}

/** "1.5 GB", "120 MB". */
export function formatSize(bytes: number): string {
  const [value, unit] = bytes >= GIB ? [bytes / GIB, 'GB'] : [bytes / MIB, 'MB'];
  return `${Math.round(value * 10) / 10} ${unit}`;
}

export function userQuotaFull(quotaBytes: number, usedBytes: number): string {
  return (
    `This file does not fit in your ${formatSize(quotaBytes)} storage quota (${formatSize(usedBytes)} used). ` +
    'Delete messages with your files for everyone to free space.'
  );
}

export class FileService {
  private readonly deps: FileServiceDeps;
  /** Bytes that uploads in progress may still write, so parallel uploads cannot overrun a limit together. */
  private readonly reservedByUser = new Map<Uin, number>();
  private reservedTotal = 0;

  constructor(deps: FileServiceDeps) {
    this.deps = deps;
  }

  async upload(owner: Uin, input: UploadInput): Promise<Attachment> {
    const budget = this.budgetFor(owner);
    this.reserve(owner, budget.bytes);
    try {
      return await this.store(owner, input, budget);
    } finally {
      this.release(owner, budget.bytes);
    }
  }

  /**
   * Signed-in users only. Allowed: the owner, anyone for an avatar, and the
   * members of a chat with a message carrying the file. Everyone else gets not found.
   */
  async download(viewer: Uin, fileId: number): Promise<Download> {
    const { files, storage } = this.deps;
    const file = files.findById(fileId);
    const allowed =
      file !== null && (file.ownerUin === viewer || file.purpose === 'avatar' || files.isSharedWith(file.id, viewer));
    if (file === null || !allowed) throw new DomainError('not_found', MESSAGES.fileNotFound);
    const size = await storage.size(file.storageName);
    return { file, size, open: () => storage.open(file.storageName) };
  }

  /**
   * After "Delete for all": deletes those of the files that no other message and
   * no avatar uses. The deletion already happened for the user, so failures are logged, not thrown.
   */
  async removeUnreferenced(fileIds: readonly number[]): Promise<void> {
    if (fileIds.length === 0) return;
    let removed: FileRecord[];
    try {
      removed = this.deps.files.deleteUnreferenced(fileIds);
    } catch (error) {
      this.deps.log.error({ err: error, fileIds }, 'failed to delete the files of deleted messages');
      return;
    }
    await this.removeFromDisk(removed);
  }

  /**
   * Deletes up to `limit` files that were never sent and are no avatar (or a
   * replaced one), once they are older than `maxAgeMs`. Returns how many rows went.
   */
  async sweepUnreferenced(maxAgeMs: number, limit: number): Promise<number> {
    const cutoff = new Date(this.deps.clock.now().getTime() - maxAgeMs).toISOString();
    const removed = this.deps.files.deleteUnreferencedBefore(cutoff, limit);
    await this.removeFromDisk(removed);
    return removed.length;
  }

  private async store(owner: Uin, input: UploadInput, budget: UploadBudget): Promise<Attachment> {
    const { storage, probe, files, clock } = this.deps;
    let saved: SavedFile;
    try {
      saved = await storage.save(input.source, budget.bytes);
    } catch (error) {
      if (error instanceof FileTooLargeError) throw this.tooLarge(budget);
      throw error;
    }
    try {
      const image = await probe.probe(storage.pathOf(saved.storageName));
      if (input.purpose === 'avatar' && image === null) {
        throw new DomainError('bad_request', 'An avatar must be a JPEG, PNG, GIF or WebP image.');
      }
      const record = files.create({
        ownerUin: owner,
        purpose: input.purpose,
        storageName: saved.storageName,
        name: sanitizeFileName(input.fileName),
        mime: image === null ? plainFileMime(input.declaredMime) : IMAGE_MIME[image.type],
        size: saved.size,
        kind: image === null ? 'file' : 'image',
        width: image?.width ?? null,
        height: image?.height ?? null,
        createdAt: clock.now().toISOString(),
      });
      return toAttachment(record);
    } catch (error) {
      await this.discard(saved.storageName);
      throw error;
    }
  }

  /** The tightest of the file size limit, the owner's quota and the total cap, counting uploads in progress. */
  private budgetFor(owner: Uin): UploadBudget {
    const { files, maxBytes, maxUserBytes, maxTotalBytes } = this.deps;
    const userBytes = files.bytesOwnedBy(owner) + (this.reservedByUser.get(owner) ?? 0);
    const userLeft = Math.max(0, maxUserBytes - userBytes);
    const totalLeft = maxTotalBytes === 0 ? Infinity : Math.max(0, maxTotalBytes - files.totalBytes() - this.reservedTotal);
    if (maxBytes <= userLeft && maxBytes <= totalLeft) return { bytes: maxBytes, limitedBy: 'file', userBytes };
    if (userLeft <= totalLeft) return { bytes: userLeft, limitedBy: 'user', userBytes };
    return { bytes: totalLeft, limitedBy: 'total', userBytes };
  }

  private tooLarge(budget: UploadBudget): DomainError {
    const { maxBytes, maxUserBytes } = this.deps;
    if (budget.limitedBy === 'user') return new DomainError('too_large', userQuotaFull(maxUserBytes, budget.userBytes));
    if (budget.limitedBy === 'total') return new DomainError('too_large', SERVER_STORAGE_FULL);
    return new DomainError('too_large', `The file is larger than ${Math.floor(maxBytes / MIB)} MB.`);
  }

  private reserve(owner: Uin, bytes: number): void {
    this.reservedByUser.set(owner, (this.reservedByUser.get(owner) ?? 0) + bytes);
    this.reservedTotal += bytes;
  }

  private release(owner: Uin, bytes: number): void {
    const left = (this.reservedByUser.get(owner) ?? 0) - bytes;
    if (left > 0) this.reservedByUser.set(owner, left);
    else this.reservedByUser.delete(owner);
    this.reservedTotal -= bytes;
  }

  /** The rows are gone already; a file that stays on disk is logged with its name. */
  private async removeFromDisk(removed: readonly FileRecord[]): Promise<void> {
    await Promise.all(
      removed.map(async (file) => {
        try {
          await this.deps.storage.remove(file.storageName);
        } catch (error) {
          this.deps.log.error({ err: error, fileId: file.id, storageName: file.storageName }, 'failed to remove an unused file');
        }
      }),
    );
  }

  private async discard(storageName: string): Promise<void> {
    try {
      await this.deps.storage.remove(storageName);
    } catch (error) {
      this.deps.log.error({ err: error, storageName }, 'failed to remove a rejected upload');
    }
  }
}
