import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeServices, renderWithServices } from '../../tests/renderWithServices';
import { WindowSurfaceProvider, type NativeSurface } from '../platform/WindowSurface';
import { WindowFrame } from './WindowFrame';

function nativeSurface(active: boolean) {
  const unregister = vi.fn();
  const surface = {
    native: true,
    view: window,
    active,
    fit: vi.fn(),
    ready: vi.fn(),
    registerClose: vi.fn((_handler: () => void) => unregister),
  } satisfies NativeSurface;
  return { surface, unregister };
}

function renderFrame(surface: NativeSurface, kind: 'about' | 'contactList', onClose = vi.fn()) {
  const ctx = makeServices();
  ctx.store.getState().openWindow({ kind });
  renderWithServices(
    <WindowSurfaceProvider value={surface}>
      <WindowFrame windowId={kind} title="Test" onClose={onClose} resizable={kind === 'contactList'}>
        <p style={{ width: 200, height: 100 }}>body</p>
      </WindowFrame>
    </WindowSurfaceProvider>,
    ctx.services,
  );
  return { ...ctx, onClose };
}

const observed: Element[] = [];
class FakeResizeObserver {
  observe(element: Element) {
    observed.push(element);
  }
  disconnect() {}
}

describe('WindowFrame in a native window', () => {
  it('drops the page position, follows the native focus and registers the OS close', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { surface } = nativeSurface(false);
    const { onClose } = renderFrame(surface, 'about');
    const frame = screen.getByRole('dialog', { name: 'Test' });
    expect(frame).toHaveClass('icq-window--native');
    expect(frame.style.left).toBe('');
    expect(frame.querySelector('.title-bar')).toHaveClass('inactive');
    expect(surface.ready).toHaveBeenCalledOnce();
    // Content-sized: the frame is watched so the native window keeps fitting it.
    expect(observed).toContain(frame);

    const handler = surface.registerClose.mock.calls[0]?.[0];
    handler?.();
    expect(onClose).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('lets the OS resize resizable windows: no grip, shown at once', () => {
    const { surface } = nativeSurface(true);
    renderFrame(surface, 'contactList');
    const frame = screen.getByRole('dialog', { name: 'Test' });
    expect(frame.querySelector('.icq-window__grip')).toBeNull();
    expect(frame.querySelector('.title-bar')).not.toHaveClass('inactive');
    expect(surface.ready).toHaveBeenCalledOnce();
    expect(surface.fit).not.toHaveBeenCalled();
  });
});
