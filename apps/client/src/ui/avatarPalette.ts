/**
 * Default avatars: a gradient circle with the first letter, coloured by
 * crc32(uin) % 11 (gui/utils/utils.cpp colorTable3, getColorTableIndex).
 * Pairs from docs/research/icq-new-ui-spec.json `avatar_palette.windows_linux`:
 * gradient top-left, gradient bottom-right, and the contact's name colour.
 */
export const AVATAR_PALETTE: ReadonlyArray<readonly [string, string, string]> = [
  ['#FFEA90', '#FF9E5C', '#FF9B20'],
  ['#FFEAA6', '#FF5C60', '#FF8260'],
  ['#FFBEAE', '#F2334C', '#FE514A'],
  ['#D8EFAB', '#37B05F', '#26B44A'],
  ['#D5C8FD', '#A75AD3', '#A354DB'],
  ['#EBA6F8', '#DC4DA2', '#E14EC8'],
  ['#FFCA94', '#E645C4', '#FF627B'],
  ['#88E3FF', '#8160DE', '#567DF8'],
  ['#B6EEFF', '#1AB1D1', '#0AB6E3'],
  ['#70F290', '#27BCC8', '#00BC95'],
  ['#E4F598', '#5BBD25', '#53CA07'],
];

const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

/** CRC-32 (IEEE) of a string as Latin-1; characters above 0xFF become '?', as in the original. */
export function crc32(text: string): number {
  let crc = 0xffffffff;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const byte = code > 0xff ? 0x3f : code;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function paletteIndex(seed: number | string): number {
  return crc32(String(seed)) % AVATAR_PALETTE.length;
}

export function avatarColors(seed: number | string): { from: string; to: string; name: string } {
  const entry = AVATAR_PALETTE[paletteIndex(seed)] ?? AVATAR_PALETTE[0] ?? ['#888', '#666', '#666'];
  return { from: entry[0], to: entry[1], name: entry[2] };
}

/** The letter drawn on a default avatar: the first letter or digit of the name. */
export function avatarLetter(name: string): string {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toLocaleUpperCase() : '?';
}
