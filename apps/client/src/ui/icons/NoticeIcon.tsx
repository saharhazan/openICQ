import { gridToPaths } from './pixelArt';
import { PixelIcon } from './PixelIcon';

/** A system notice: a yellow note with a red check mark (authorization events). */
const NOTE = [
  '................',
  '.###########....',
  '.#wwwwwwwww#.R..',
  '.#wYYYYYYYY#RR..',
  '.#wYLLLLLYRRo#..',
  '.#wYYYYYYRRYo#..',
  '.#wYLLLYRRYYo#..',
  '.#wRRYYRRYYYo#..',
  '.#wYRRRRLYYYo#..',
  '.#wYYRRYYYYYo#..',
  '.#wYLLLLLLYYo#..',
  '.#wYYYYYYYYYo#..',
  '.#oooooooooo#...',
  '.############...',
  '................',
  '................',
];

const ON = gridToPaths(NOTE, { '#': '#000000', L: '#000000', Y: '#ffff00', o: '#808000', w: '#ffffff', R: '#ff0000' });
const OFF = gridToPaths(NOTE, { '#': '#ffffff', L: '#000000', Y: 'transparent', o: 'transparent', w: 'transparent', R: '#ffffff' });

export function NoticeIcon({ size = 16, off = false }: { size?: number; off?: boolean }) {
  return <PixelIcon paths={off ? OFF : ON} size={size} />;
}
