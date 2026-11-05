/** The image viewer overlay (previewer/GalleryFrame): the full picture on a dark backdrop, Escape or a click closes. */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { useServices } from '../../app/AppContext';
import { S } from '../../strings';
import './overlays.css';

export function ImageViewer({ fileId, name, onClose }: { fileId: number; name: string; onClose: () => void }) {
  const { api } = useServices();
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const url = api.fileUrl(fileId);
  return createPortal(
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <div className="image-viewer-bar" onClick={(event) => event.stopPropagation()}>
        <span className="image-viewer-name">{name}</span>
        <a className="icon-button image-viewer-button" href={url} download={name} aria-label={name}>
          <Download size={20} />
        </a>
        <button ref={closeButton} type="button" className="icon-button image-viewer-button" aria-label={S.dialogs.close} onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      <img className="image-viewer-img" src={url} alt={name} onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
}
