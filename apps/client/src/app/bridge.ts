/** Finds the desktop shell bridge (`window.openicqDesktop`). Plain browsers have none. */
import { BRIDGE_GLOBAL, PLATFORMS, type DesktopBridge } from '@openicq/desktop-bridge';

export function findDesktopBridge(scope: object = globalThis): DesktopBridge | null {
  const candidate: unknown = Reflect.get(scope, BRIDGE_GLOBAL);
  if (typeof candidate !== 'object' || candidate === null) return null;
  const platform: unknown = Reflect.get(candidate, 'platform');
  if (!PLATFORMS.some((p) => p === platform)) return null;
  // Safe: the object is created by our own preload script (apps/desktop/src/preload), checked by its platform tag.
  return candidate as DesktopBridge;
}
