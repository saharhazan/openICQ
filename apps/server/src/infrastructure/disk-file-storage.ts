/** Uploaded files on the local disk, each under a random name inside one directory. */
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { FileTooLargeError } from '../domain/errors.ts';
import type { FileStorage, SavedFile } from '../domain/ports.ts';

const STORAGE_NAME = /^[0-9a-f]{32}$/;
/** Uploads are private to the server account. */
export const PRIVATE_DIRECTORY_MODE = 0o700;

/** Counts bytes on the way through and fails once the limit is passed. */
function sizeLimit(maxBytes: number, onSize: (size: number) => void): Transform {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      onSize(size);
      if (size > maxBytes) callback(new FileTooLargeError(maxBytes));
      else callback(null, chunk);
    },
  });
}

export class DiskFileStorage implements FileStorage {
  private readonly directory: string;

  /** Creates the directory (owner only, 0700) when it does not exist; throws when that is impossible. */
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    this.directory = directory;
  }

  async save(source: Readable, maxBytes: number): Promise<SavedFile> {
    const storageName = randomBytes(16).toString('hex');
    const path = this.pathOf(storageName);
    let size = 0;
    try {
      await pipeline(
        source,
        sizeLimit(maxBytes, (seen) => {
          size = seen;
        }),
        createWriteStream(path, { flags: 'wx' }),
      );
    } catch (error) {
      try {
        await rm(path, { force: true });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Upload failed and the partial file ${path} could not be removed`);
      }
      throw error;
    }
    return { storageName, size };
  }

  async size(storageName: string): Promise<number> {
    return (await stat(this.pathOf(storageName))).size;
  }

  open(storageName: string): Readable {
    return createReadStream(this.pathOf(storageName));
  }

  async remove(storageName: string): Promise<void> {
    await rm(this.pathOf(storageName));
  }

  /** Storage names are generated here; anything else is refused, so a path can never leave the directory. */
  pathOf(storageName: string): string {
    if (!STORAGE_NAME.test(storageName)) throw new Error(`Invalid storage name "${storageName}"`);
    return join(this.directory, storageName);
  }
}
