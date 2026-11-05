import { gridToPaths } from './pixelArt';
import { PixelIcon } from './PixelIcon';

/** The yellow message balloon shown (blinking) in place of a contact's flower while a message is unread. */
const BALLOON = [
  '................',
  '...##########...',
  '..#wwwwwwwwwY#..',
  '.#wYYYYYYYYYYo#.',
  '.#wYLLLLLLLLYo#.',
  '.#wYYYYYYYYYYo#.',
  '.#wYLLLLLLYYYo#.',
  '.#wYYYYYYYYYYo#.',
  '.#wYLLLLLYYYYo#.',
  '.#YYYYYYYYYYoo#.',
  '..#oooYYYooooo#.',
  '...####YYo####..',
  '......#Yo#......',
  '.....#Yo#.......',
  '.....###........',
  '................',
];

/** The balloon's pixel paths (also rasterized for the desktop tray icon). */
export const MESSAGE_ICON_PATHS = gridToPaths(BALLOON, { '#': '#000000', L: '#000000', Y: '#ffff00', o: '#808000', w: '#ffffff' });
/** The blink-off frame: the same balloon as a white outline. */
const OFF = gridToPaths(BALLOON, { '#': '#ffffff', L: '#000000', Y: 'transparent', o: 'transparent', w: 'transparent' });

export function MessageIcon({ size = 16, title, off = false }: { size?: number; title?: string; off?: boolean }) {
  return <PixelIcon paths={off ? OFF : MESSAGE_ICON_PATHS} size={size} title={title} />;
}
