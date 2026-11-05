/**
 * The visibility rule: which status a viewer sees for a target.
 * Pure on purpose, so the most important rule of the system is tested in isolation.
 */
import type { SettableStatus, Status } from '@openicq/protocol';

/** What the viewer's own contact list says about the target. */
export interface ViewerFacts {
  /** True while the viewer's contact entry for the target still awaits authorization. */
  readonly awaitingAuth: boolean;
}

/** The target's live state as it concerns this viewer. */
export interface TargetFacts {
  /** The target's live status, or null when the target is not connected. */
  readonly status: SettableStatus | null;
  /** True when the target has the viewer on its ignore list. */
  readonly ignoresViewer: boolean;
}

export function visibleStatus(viewer: ViewerFacts, target: TargetFacts): Status {
  if (target.status === null || target.status === 'invisible') return 'offline';
  if (target.ignoresViewer || viewer.awaitingAuth) return 'offline';
  return target.status;
}
