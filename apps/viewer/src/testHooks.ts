// `window.__viewer`: what the Playwright tests (and a tester's console) use to drive the viewer. It is a registry:
// `ready()` and `stats()` work from the start, and the views register the rest as they come up (`registerWalkRoute`
// from the world view, `registerLoadedTiles` for the tiles `stats()` reports).

import type { Vec3 } from '@flyffweb/formats';
import type { Overlay, OverlaySnapshot } from './overlay/Overlay';

export type WalkRoute = (points: Vec3[], speed: number) => Promise<void>;

export interface ViewerHooks {
  /** Resolves when the viewer has started and the view on screen has everything it needs; rejects if it could not start. */
  ready(): Promise<void>;
  /** The overlay's numbers, and the tiles the world view has loaded. */
  stats(): OverlaySnapshot & { loadedTiles: string[] };
  /** Walks the camera along `points` at `speed` (units per second). Rejects with "no world view" outside the world view. */
  walkRoute(points: Vec3[], speed: number): Promise<void>;
}

declare global {
  var __viewer: ViewerHooks | undefined;
}

let walkRouteImpl: WalkRoute | null = null;
let loadedTilesImpl: (() => string[]) | null = null;

/** The world view calls this when it starts (with `fn`) and when it goes away (with null). */
export function registerWalkRoute(fn: WalkRoute | null): void {
  walkRouteImpl = fn;
}

/** The world view calls this with a function listing the tiles it has loaded, and null when it goes away. */
export function registerLoadedTiles(fn: (() => string[]) | null): void {
  loadedTilesImpl = fn;
}

/**
 * `booted` is the shell starting (renderer, asset index); `viewReady` asks the view on screen whether it is done
 * loading, each time `ready()` is called.
 */
export function createViewerHooks(
  overlay: Pick<Overlay, 'snapshot'>,
  booted: Promise<void>,
  viewReady: () => Promise<void> = async () => {},
): ViewerHooks {
  return {
    async ready() {
      await booted;
      await viewReady();
    },
    stats() {
      return { ...overlay.snapshot(), loadedTiles: loadedTilesImpl?.() ?? [] };
    },
    async walkRoute(points, speed) {
      if (walkRouteImpl === null) throw new Error('no world view');
      await walkRouteImpl(points, speed);
    },
  };
}

export function installTestHooks(
  overlay: Pick<Overlay, 'snapshot'>,
  booted: Promise<void>,
  viewReady?: () => Promise<void>,
): ViewerHooks {
  const hooks = createViewerHooks(overlay, booted, viewReady);
  globalThis.__viewer = hooks;
  return hooks;
}
