import type { Status } from '@openicq/protocol';
import { useMemo } from 'react';
import { ALL_GREEN, ALL_RED, connectingPetals, FLOWER_GRID, flowerPalette, LOGO_PETALS, type PetalColor } from './flower';
import { gridToPaths, overlay, type Palette } from './pixelArt';
import { PixelIcon } from './PixelIcon';

const OVERLAY_PALETTE: Palette = {
  '#': '#000000',
  w: '#ffffff',
  s: '#c0c0c0',
  R: '#ff0000',
  r: '#800000',
  Y: '#ffff00',
  N: '#000080',
};

/** Away: a white note sheet over the flower. */
const AWAY = [
  '................',
  '................',
  '................',
  '................',
  '.......######...',
  '......#wwwwww#..',
  '.....#wwwwwwws#.',
  '....#wwwwwwwws#.',
  '....#wwwwwwwws#.',
  '....#wwwwwwws#..',
  '....#swwwwwss#..',
  '.....#ssssss#...',
  '......######....',
  '................',
  '................',
  '................',
];

/** N/A: the red-framed "N/A" sign. */
const NA = [
  '................',
  '................',
  '................',
  '................',
  '.RRRRRRRRRRRRRR.',
  'RwwwwwwwwwwwwwwR',
  'Rw#ww#www#ww#wwR',
  'Rw##w#www#w#w#wR',
  'Rw#w##ww#ww###wR',
  'Rw#ww#w#www#w#wR',
  'Rw#ww#w#www#w#wR',
  'RwwwwwwwwwwwwwwR',
  '.RRRRRRRRRRRRRR.',
  '................',
  '................',
  '................',
];

/** Occupied: a raised white hand with red "busy" strokes. */
const OCCUPIED = [
  '................',
  '................',
  '................',
  '......#.#.......',
  '.....#w#w#.#....',
  '.....#w#w##w#...',
  '..#..#w#w#w#....',
  '.#w#.#w#w#w##...',
  '.#ww##wwwww#w#..',
  '..#wwwwwwwwww#..',
  'RR.#wwwwwwwww#..',
  '...#swwwwwwws#..',
  'RR..#swwwwws#...',
  '.....#sssss#....',
  '......#####.....',
  '................',
];

/** Do Not Disturb: a red ball with a white cross on the centre. */
const DND = [
  '................',
  '................',
  '................',
  '......####......',
  '....##RRRR##....',
  '...#RRRRRRRR#...',
  '...#RwRRRRwR#...',
  '..#RRRwRRwRRR#..',
  '..#RRRRwwRRRR#..',
  '..#RRRRwwRRRR#..',
  '..#RRRwRRwRRR#..',
  '...#RwRRRRwR#...',
  '...#RRRRRRRR#...',
  '....##RRRR##....',
  '......####......',
  '................',
];

/** Privacy (Invisible): the centre hidden behind a dark mask. */
const INVISIBLE = [
  '................',
  '................',
  '................',
  '................',
  '.....######.....',
  '....########....',
  '...##########...',
  '...#ww####ww#...',
  '...#ww####ww#...',
  '...##########...',
  '....########....',
  '.....######.....',
  '................',
  '................',
  '................',
  '................',
];

/** Free For Chat: the smiling centre. */
const FFC = [
  '................',
  '................',
  '................',
  '.....######.....',
  '....#YYYYYY#....',
  '...#YYYYYYYY#...',
  '...#YYNYYYNY#...',
  '...#YYNYYYNY#...',
  '...#YYYYYYYY#...',
  '...#YNYYYYYN#...',
  '...#YYNNNNNY#...',
  '....#YYYYYY#....',
  '.....######.....',
  '................',
  '................',
  '................',
];

const STATUS_OVERLAY: Partial<Record<Status, readonly string[]>> = {
  away: AWAY,
  na: NA,
  occupied: OCCUPIED,
  dnd: DND,
  ffc: FFC,
  invisible: INVISIBLE,
};

/**
 * `awaiting`: a contact who has not granted authorization yet (grey petals).
 * `outline`: the white outline flower (blink-off frame, System Notice without events).
 */
export type FlowerVariant = Status | 'logo' | 'connecting' | 'awaiting' | 'outline';

function petalsFor(variant: FlowerVariant, frame: number): readonly PetalColor[] {
  if (variant === 'offline') return ALL_RED;
  if (variant === 'logo') return LOGO_PETALS;
  if (variant === 'outline') return ['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear'];
  if (variant === 'connecting') return connectingPetals(frame);
  if (variant === 'awaiting') return ['grey', 'grey', 'grey', 'grey', 'grey', 'grey', 'grey', 'grey'];
  return ALL_GREEN;
}

export interface StatusIconProps {
  status: FlowerVariant;
  /** Animation frame for the connecting flower. */
  frame?: number;
  size?: number;
  title?: string;
}

/** The pixel paths of one flower variant (also rasterized for the desktop tray icon). */
export function statusIconPaths(status: FlowerVariant, frame = 0): ReadonlyArray<{ color: string; d: string }> {
  const base = flowerPalette(petalsFor(status, frame), status === 'outline' ? 'transparent' : '#ffff00');
  const top =
    status === 'logo' || status === 'connecting' || status === 'awaiting' || status === 'outline' ? undefined : STATUS_OVERLAY[status];
  if (!top) return gridToPaths(FLOWER_GRID, base);
  // Overlay keys never collide with petal keys ('a'..'h', 'A'..'H') except the shared outline/white/yellow.
  return gridToPaths(overlay(FLOWER_GRID, top), { ...base, ...OVERLAY_PALETTE });
}

/** The status flower used in the contact list, menus, buttons and the tray. */
export function StatusIcon({ status, frame = 0, size = 16, title }: StatusIconProps) {
  const paths = useMemo(() => statusIconPaths(status, frame), [status, frame]);
  return <PixelIcon paths={paths} size={size} title={title} />;
}
