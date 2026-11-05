import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useServices } from '../app/AppContext';
import { avatarColors, avatarLetter } from './avatarPalette';
import './ui.css';

export interface AvatarProps {
  /** Uploaded avatar; null draws the letter avatar. */
  fileId: number | null;
  /** Colour seed: the ICQ#, or the chat id for groups. */
  seed: number;
  name: string;
  size: number;
  /** Green dot for online users (status badge of the original). */
  online?: boolean;
  /** A data: URL shown instead (a picked file before upload). */
  previewUrl?: string | null;
  /** The Favorites chat: a bookmark on the primary gradient instead of a letter. */
  favorites?: boolean;
}

/** A round avatar: the uploaded picture, else the gradient letter avatar. Decorative: names are shown beside it. */
export function Avatar({ fileId, seed, name, size, online = false, previewUrl = null, favorites = false }: AvatarProps) {
  const { api } = useServices();
  const [failedId, setFailedId] = useState<number | null>(null);
  const colors = avatarColors(seed);
  const src = favorites ? null : (previewUrl ?? (fileId !== null && failedId !== fileId ? api.fileUrl(fileId) : null));
  const letterScale = size <= 16 ? 0.64 : 0.54;
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {favorites ? (
        <span className="avatar-letter" style={{ backgroundImage: 'linear-gradient(135deg, var(--primary-light), var(--primary))' }}>
          <Bookmark size={Math.round(size * 0.46)} strokeWidth={2.25} />
        </span>
      ) : src ? (
        <img className="avatar-img" src={src} alt="" width={size} height={size} onError={() => setFailedId(fileId)} draggable={false} />
      ) : (
        <span
          className="avatar-letter"
          style={{ backgroundImage: `linear-gradient(135deg, ${colors.from}, ${colors.to})`, fontSize: Math.round(size * letterScale) }}
        >
          {avatarLetter(name)}
        </span>
      )}
      {online && <span className="avatar-online" style={{ width: Math.max(8, size / 4), height: Math.max(8, size / 4) }} />}
    </span>
  );
}
