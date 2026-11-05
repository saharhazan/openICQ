import { StatusIcon } from './icons/StatusIcon';
import './VerticalBanner.css';

/** The vertical gradient strip with rotated text, as on the ICQ menus and wizards. */
export function VerticalBanner({ text, width = 22, flowerSize = 16 }: { text: string; width?: number; flowerSize?: number }) {
  return (
    <div className="vbanner" style={{ width }} aria-hidden="true">
      <span className="vbanner__text">{text}</span>
      <span className="vbanner__flower">
        <StatusIcon status="logo" size={flowerSize} />
      </span>
    </div>
  );
}
