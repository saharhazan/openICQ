import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileService, SERVER_STORAGE_FULL, userQuotaFull } from '../../src/application/file-service.ts';
import { FileTooLargeError } from '../../src/domain/errors.ts';
import type { ErrorLog, FileStorage, ImageProbe } from '../../src/domain/ports.ts';
import { file, fixedClock, mockFiles, strictMock } from './mocks.ts';

const OWNER = 100000;
const OTHER = 100001;
const STORED = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MIB = 1024 * 1024;

describe('FileService', () => {
  let files: ReturnType<typeof mockFiles>;
  let storage: ReturnType<typeof strictMock<FileStorage>>;
  let probe: ReturnType<typeof strictMock<ImageProbe>>;
  let log: { error: ReturnType<typeof vi.fn> };
  let service: FileService;

  beforeEach(() => {
    files = mockFiles();
    storage = strictMock<FileStorage>('storage', ['save', 'size', 'open', 'remove', 'pathOf']);
    probe = strictMock<ImageProbe>('probe', ['probe']);
    log = { error: vi.fn() };
    service = new FileService({
      files,
      storage,
      probe,
      clock: fixedClock(),
      log: log as ErrorLog,
      maxBytes: MIB,
      maxUserBytes: 10 * MIB,
      maxTotalBytes: 0,
    });
    storage.pathOf.mockReturnValue(`/files/${STORED}`);
    files.bytesOwnedBy.mockReturnValue(0);
  });

  const withLimits = (maxUserBytes: number, maxTotalBytes: number) =>
    new FileService({ files, storage, probe, clock: fixedClock(), log: log as ErrorLog, maxBytes: MIB, maxUserBytes, maxTotalBytes });

  const input = (purpose: 'attachment' | 'avatar' = 'attachment') => ({
    source: Readable.from([Buffer.from('x')]),
    fileName: 'dir/photo.png',
    declaredMime: 'image/png',
    purpose,
  });

  it('records images with the detected type and size', async () => {
    storage.save.mockResolvedValue({ storageName: STORED, size: 120 });
    probe.probe.mockResolvedValue({ type: 'webp', width: 40, height: 30 });
    files.create.mockImplementation((record) => ({ ...record, id: 5 }));
    expect(await service.upload(OWNER, input())).toEqual({
      fileId: 5,
      name: 'photo.png',
      mime: 'image/webp',
      size: 120,
      kind: 'image',
      width: 40,
      height: 30,
    });
  });

  it('maps the storage size limit to too_large', async () => {
    storage.save.mockRejectedValue(new FileTooLargeError(1024 * 1024));
    await expect(service.upload(OWNER, input())).rejects.toMatchObject({ code: 'too_large', message: 'The file is larger than 1 MB.' });
  });

  it("limits an upload to what is left of the owner's quota and says so when it does not fit", async () => {
    files.bytesOwnedBy.mockReturnValue(10 * MIB - 300);
    storage.save.mockRejectedValue(new FileTooLargeError(300));
    await expect(service.upload(OWNER, input())).rejects.toMatchObject({
      code: 'too_large',
      message: userQuotaFull(10 * MIB, 10 * MIB - 300),
    });
    expect(storage.save).toHaveBeenCalledWith(expect.anything(), 300);
    expect(files.bytesOwnedBy).toHaveBeenCalledWith(OWNER);
    expect(userQuotaFull(2 * 1024 * MIB, 1536 * MIB)).toBe(
      'This file does not fit in your 2 GB storage quota (1.5 GB used). Delete messages with your files for everyone to free space.',
    );

    files.bytesOwnedBy.mockReturnValue(11 * MIB);
    await expect(service.upload(OWNER, input())).rejects.toMatchObject({ code: 'too_large' });
    expect(storage.save).toHaveBeenLastCalledWith(expect.anything(), 0);
  });

  it('applies the total cap when one is set, and none when it is 0', async () => {
    files.totalBytes.mockReturnValue(20 * MIB - 100);
    storage.save.mockRejectedValue(new FileTooLargeError(100));
    await expect(withLimits(10 * MIB, 20 * MIB).upload(OWNER, input())).rejects.toMatchObject({
      code: 'too_large',
      message: SERVER_STORAGE_FULL,
    });
    expect(storage.save).toHaveBeenLastCalledWith(expect.anything(), 100);

    storage.save.mockResolvedValue({ storageName: STORED, size: 1 });
    probe.probe.mockResolvedValue(null);
    files.create.mockImplementation((record) => ({ ...record, id: 5 }));
    files.totalBytes.mockClear();
    await service.upload(OWNER, input());
    expect(files.totalBytes).not.toHaveBeenCalled();
    expect(storage.save).toHaveBeenLastCalledWith(expect.anything(), MIB);
  });

  it('counts uploads still in progress, so parallel uploads cannot overrun the quota together', async () => {
    const quota = withLimits(MIB + MIB / 2, 0);
    let finish: (value: { storageName: string; size: number }) => void = () => undefined;
    storage.save.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    storage.save.mockRejectedValueOnce(new FileTooLargeError(MIB / 2));
    probe.probe.mockResolvedValue(null);
    files.create.mockImplementation((record) => ({ ...record, id: 5 }));

    const first = quota.upload(OWNER, input());
    await expect(quota.upload(OWNER, input())).rejects.toMatchObject({ code: 'too_large' });
    expect(storage.save.mock.calls.map(([, max]) => max)).toEqual([MIB, MIB / 2]);
    finish({ storageName: STORED, size: 10 });
    await first;

    // The reservation ends with the upload; another user never shared it.
    storage.save.mockResolvedValue({ storageName: STORED, size: 10 });
    await quota.upload(OWNER, input());
    await quota.upload(OTHER, input());
    expect(storage.save.mock.calls.map(([, max]) => max)).toEqual([MIB, MIB / 2, MIB, MIB]);
  });

  it('removes the stored file when the upload is refused, and logs a failed removal', async () => {
    storage.save.mockResolvedValue({ storageName: STORED, size: 4 });
    probe.probe.mockResolvedValue(null);
    storage.remove.mockResolvedValue(undefined);
    await expect(service.upload(OWNER, input('avatar'))).rejects.toMatchObject({ code: 'bad_request' });
    expect(storage.remove).toHaveBeenCalledWith(STORED);

    storage.remove.mockRejectedValue(new Error('disk gone'));
    await expect(service.upload(OWNER, input('avatar'))).rejects.toMatchObject({ code: 'bad_request' });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ storageName: STORED }), 'failed to remove a rejected upload');
  });

  it('deletes unused files row first, then on disk, and logs what it could not remove', async () => {
    files.deleteUnreferenced.mockReturnValue([file(5, OWNER, { storageName: STORED }), file(6, OWNER)]);
    storage.remove.mockImplementation(async (name) => {
      if (name !== STORED) throw new Error('disk gone');
    });
    await service.removeUnreferenced([5, 6, 7]);
    expect(files.deleteUnreferenced).toHaveBeenCalledWith([5, 6, 7]);
    expect(storage.remove.mock.calls.map(([name]) => name)).toEqual([STORED, file(6, OWNER).storageName]);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ fileId: 6 }), 'failed to remove an unused file');

    files.deleteUnreferenced.mockImplementation(() => {
      throw new Error('database locked');
    });
    await expect(service.removeUnreferenced([8])).resolves.toBeUndefined();
    expect(log.error).toHaveBeenLastCalledWith(expect.objectContaining({ fileIds: [8] }), 'failed to delete the files of deleted messages');
  });

  it('sweeps unused files older than the given age', async () => {
    files.deleteUnreferencedBefore.mockReturnValue([file(5, OWNER, { storageName: STORED })]);
    storage.remove.mockResolvedValue(undefined);
    expect(await service.sweepUnreferenced(60 * 60 * 1000, 500)).toBe(1);
    expect(files.deleteUnreferencedBefore).toHaveBeenCalledWith('2026-11-05T11:00:00.000Z', 500);
    expect(storage.remove).toHaveBeenCalledWith(STORED);
  });

  it('lets the owner, anyone for avatars, and members of a chat with the file download it', async () => {
    storage.size.mockResolvedValue(10);
    files.findById.mockReturnValue(file(5, OWNER));
    files.isSharedWith.mockReturnValue(false);
    expect((await service.download(OWNER, 5)).size).toBe(10);
    await expect(service.download(OTHER, 5)).rejects.toMatchObject({ code: 'not_found' });

    files.isSharedWith.mockReturnValue(true);
    expect((await service.download(OTHER, 5)).file.id).toBe(5);

    files.isSharedWith.mockReturnValue(false);
    files.findById.mockReturnValue(file(6, OWNER, { purpose: 'avatar', kind: 'image', mime: 'image/png' }));
    expect((await service.download(OTHER, 6)).file.id).toBe(6);
  });
});
