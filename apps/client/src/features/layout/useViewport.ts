import { useEffect, useState } from 'react';

/** The window width, updated on resize. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/** Under this width the left column collapses to avatars (MainPage.cpp). */
export const TWO_FRAME_MIN_WIDTH = 660;

export interface LayoutMode {
  mini: boolean;
  /** The sidebar floats over the chat instead of taking a third column. */
  sidebarOverlay: boolean;
}

/** Three columns need 660 + the sidebar width ("three_frame_min_width" in the spec). */
export function layoutMode(width: number, sidebarWidth = 328): LayoutMode {
  return { mini: width < TWO_FRAME_MIN_WIDTH, sidebarOverlay: width < TWO_FRAME_MIN_WIDTH + sidebarWidth };
}
