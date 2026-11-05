import { describe, expect, it } from 'vitest';
import { plainFileMime, sanitizeFileName } from '../../src/application/file-service.ts';
import { compareChats, type ListedChat } from '../../src/application/session-service.ts';
import { describeDevice } from '../../src/domain/device.ts';
import { describeImage } from '../../src/infrastructure/image-probe.ts';
import { contentDisposition } from '../../src/transport/http/file-routes.ts';
import { SlidingWindowRateLimiter } from '../../src/transport/rate-limiter.ts';

describe('describeDevice', () => {
  it('names the browser and the system', () => {
    expect(
      describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'),
    ).toBe('Chrome on macOS');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0')).toBe(
      'Edge on Windows',
    );
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0')).toBe('Firefox on Linux');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(
      'Safari on iOS',
    );
    expect(describeDevice('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 openICQ/1.0.0 Chrome/140.0 Electron/38.0 Safari/537.36')).toBe(
      'openICQ desktop on macOS',
    );
  });

  it('falls back when the agent says little or nothing', () => {
    expect(describeDevice(undefined)).toBe('Unknown device');
    expect(describeDevice('curl/8.7.1')).toBe('Unknown device');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 15)')).toBe('Android');
  });
});

describe('describeImage', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('recognises safe images by content', () => {
    expect(describeImage(png)).toEqual({ type: 'png', width: 1, height: 1 });
  });

  it('treats unknown, empty and unsafe formats as plain files', () => {
    expect(describeImage(Buffer.from('hello world'))).toBeNull();
    expect(describeImage(new Uint8Array(0))).toBeNull();
    // A BMP header: a real image format, but not one served inline.
    const bmp = Buffer.alloc(54);
    bmp.write('BM', 0, 'ascii');
    bmp.writeUInt32LE(14 + 40, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(2, 18);
    bmp.writeInt32LE(2, 22);
    expect(describeImage(bmp)).toBeNull();
  });
});

describe('file names and types', () => {
  it('strips directories and control characters and caps the length', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\a.txt')).toBe('a.txt');
    expect(sanitizeFileName('bad\u0000name\u0007.txt')).toBe('badname.txt');
    expect(sanitizeFileName('..')).toBe('file');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(255);
  });

  it('strips bidi controls, so a name cannot pretend to end in another extension', () => {
    expect(sanitizeFileName('photo\u202egpj.exe')).toBe('photogpj.exe');
    const bidi = ['\u200e', '\u200f', '\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069'];
    expect(sanitizeFileName(`a${bidi.join('')}b.txt`)).toBe('ab.txt');
    expect(sanitizeFileName('\u202e\u2066')).toBe('file');
    expect(sanitizeFileName('שלום.txt')).toBe('שלום.txt');
  });

  it('keeps plausible declared types for plain files only', () => {
    expect(plainFileMime('application/PDF')).toBe('application/pdf');
    expect(plainFileMime('image/png')).toBe('application/octet-stream');
    expect(plainFileMime('text/html; charset=utf-8')).toBe('application/octet-stream');
    expect(plainFileMime('nonsense')).toBe('application/octet-stream');
  });

  it('writes Content-Disposition with an ASCII fallback', () => {
    expect(contentDisposition('attachment', 'a "b".txt')).toBe(`attachment; filename="a _b_.txt"; filename*=UTF-8''a%20%22b%22.txt`);
  });
});

describe('compareChats', () => {
  const row = (id: number, updatedAt: string, pinOrder: number | null): ListedChat => ({
    chat: { id, updatedAt } as ListedChat['chat'],
    pinOrder,
  });

  it('puts pinned chats first in pin order, then the most recent', () => {
    const rows = [row(1, '2026-01-01', null), row(2, '2026-01-03', null), row(3, '2026-01-02', 2), row(4, '2026-01-01', 1)];
    expect([...rows].sort(compareChats).map((entry) => entry.chat.id)).toEqual([4, 3, 2, 1]);
  });
});

describe('SlidingWindowRateLimiter', () => {
  it('allows the limit per window and reports when to retry', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(2, 1000, () => now);
    expect(limiter.attempt('k').allowed).toBe(true);
    expect(limiter.attempt('k').allowed).toBe(true);
    expect(limiter.attempt('k')).toEqual({ allowed: false, retryAfterMs: 1000 });
    expect(limiter.attempt('other').allowed).toBe(true);
    now = 1000;
    expect(limiter.attempt('k').allowed).toBe(true);
  });
});
