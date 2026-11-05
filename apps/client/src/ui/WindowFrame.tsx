import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useIcq, useServices } from '../app/AppContext';
import { useWindowSurface, type WindowSurface } from '../platform/WindowSurface';
import { minSizeOf } from '../state/placement';
import { activeWindowId, findWindow } from '../state/windows';
import './WindowFrame.css';

export interface WindowFrameProps {
  windowId: string;
  title: string;
  icon?: ReactNode;
  className?: string;
  /** Lets the user drag the bottom-right corner (only where the original could); the minimum size follows the window kind. */
  resizable?: boolean;
  minimizable?: boolean;
  /** Escape closes the window, like Cancel in a Win32 dialog. */
  closeOnEscape?: boolean;
  onClose: () => void;
  children: ReactNode;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
  mode: 'move' | 'resize';
}

/**
 * Desktop app: a content-sized window reports its natural size, so the native
 * window fits it, and says when it may be shown. Resizable windows fill the
 * native window instead. No-op in the browser.
 */
function useNativeFit(frameRef: RefObject<HTMLDivElement | null>, surface: WindowSurface, resizable: boolean, mounted: boolean) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!surface.native || !frame || !mounted) return;
    if (resizable) {
      surface.ready();
      return;
    }
    const fit = () => {
      const rect = frame.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) surface.fit({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    };
    fit();
    surface.ready();
    // The observer must belong to the native window's own document: the hidden host page never renders.
    const observer = new surface.view.ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef, surface, resizable, mounted]);
}

/** Desktop app: a close from the OS (Alt+F4, Cmd+W) does what the title-bar X does. */
function useNativeClose(surface: WindowSurface, onClose: () => void) {
  const requestClose = useEffectEvent(onClose);
  useEffect(() => {
    if (!surface.native) return;
    return surface.registerClose(() => requestClose());
  }, [surface]);
}

/** A Win98 window: title bar drag, focus and stacking, minimize, close, optional resize grip. */
export function WindowFrame({
  windowId,
  title,
  icon,
  className,
  resizable = false,
  minimizable = true,
  closeOnEscape = false,
  onClose,
  children,
}: WindowFrameProps) {
  const { store, prefs } = useServices();
  const surface = useWindowSurface();
  const win = useIcq((s) => findWindow(s.windows, windowId));
  const pageActive = useIcq((s) => activeWindowId(s.windows) === windowId);
  const active = surface.native ? surface.active : pageActive;
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const { width: minWidth, height: minHeight } = minSizeOf(win?.spec.kind ?? 'error');
  useNativeFit(frameRef, surface, resizable, win !== undefined);
  useNativeClose(surface, onClose);

  const focus = useCallback(() => store.getState().focusWindow(windowId), [store, windowId]);

  const begin = (event: PointerEvent<HTMLElement>, mode: DragState['mode']) => {
    // Native windows are moved and resized by the OS (title-bar drag region, window edges).
    if (event.button !== 0 || !win || surface.native) return;
    const rect = frameRef.current?.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: win.x,
      originY: win.y,
      originW: win.width ?? rect?.width ?? minWidth,
      originH: win.height ?? rect?.height ?? minHeight,
      mode,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    const state = store.getState();
    if (d.mode === 'move') {
      const maxY = Math.max(0, surface.view.innerHeight - 48);
      state.moveWindow(windowId, Math.round(d.originX + dx), Math.round(Math.min(maxY, Math.max(0, d.originY + dy))));
    } else {
      state.resizeWindow(windowId, Math.round(Math.max(minWidth, d.originW + dx)), Math.round(Math.max(minHeight, d.originH + dy)));
    }
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const current = findWindow(store.getState().windows, windowId);
    if (current) {
      prefs.saveWindowRect(current.spec.kind, { x: current.x, y: current.y, width: current.width, height: current.height });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (closeOnEscape && event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  if (!win) return null;
  const style: CSSProperties = {};
  if (!surface.native) {
    style.left = win.x;
    style.top = win.y;
    style.zIndex = win.z;
    if (resizable && win.width !== null) style.width = win.width;
    if (resizable && win.height !== null) style.height = win.height;
  }
  const classes = ['window', 'icq-window'];
  if (className) classes.push(className);
  if (resizable) classes.push('icq-window--resizable');
  if (surface.native) classes.push('icq-window--native');

  return (
    <div
      ref={frameRef}
      className={classes.join(' ')}
      style={style}
      role="dialog"
      aria-label={title}
      hidden={!surface.native && win.minimized}
      onPointerDownCapture={focus}
      onFocusCapture={active ? undefined : focus}
      onKeyDown={onKeyDown}
      data-active={active ? 'true' : 'false'}
    >
      <div
        className={`title-bar${active ? '' : ' inactive'}`}
        onPointerDown={(e) => begin(e, 'move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="title-bar-text">
          {icon ? <span className="icq-window__icon">{icon}</span> : null}
          <span className="icq-window__title">{title}</span>
        </div>
        <div className="title-bar-controls" onPointerDown={(e) => e.stopPropagation()}>
          {minimizable ? (
            <button
              type="button"
              aria-label="Minimize"
              className="minimize"
              onClick={() => store.getState().minimizeWindow(windowId)}
            />
          ) : null}
          <button type="button" aria-label="Close" className="close" onClick={onClose} />
        </div>
      </div>
      <div className="window-body icq-window__body">{children}</div>
      {resizable && !surface.native ? (
        <div
          className="icq-window__grip"
          aria-hidden="true"
          onPointerDown={(e) => begin(e, 'resize')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ) : null}
    </div>
  );
}
