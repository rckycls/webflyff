// `window.__viewer`: what the Playwright tests (and a tester's console) use to drive the viewer. It is a registry:
// `ready()` and `stats()` work from the start, and the views register the rest as they come up (`registerWalkRoute`
// from the world view, `registerLoadedTiles` for the tiles `stats()` reports, `registerRenderer` from the shell for
// the renderer's own counts).

import type { Vec3 } from '@flyffweb/formats';
import type { Overlay, OverlaySnapshot } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';

export type WalkRoute = (points: Vec3[], speed: number) => Promise<void>;

/**
 * What three.js itself holds (`renderer.info`): geometries and textures uploaded and not yet disposed, and shader
 * programs. The overlay's `gpuBytes` is the viewer's own bookkeeping; these catch what that bookkeeping misses.
 */
export interface RendererCounts {
  geometries: number;
  textures: number;
  programs: number;
}

export interface ViewerStats extends OverlaySnapshot {
  loadedTiles: string[];
  /** Null until the shell has a renderer. */
  renderer: RendererCounts | null;
}

export interface ViewerHooks {
  /** Resolves when the viewer has started and the view on screen has everything it needs; rejects if it could not start. */
  ready(): Promise<void>;
  /** The overlay's numbers, the tiles the world view has loaded, and the renderer's own counts. */
  stats(): ViewerStats;
  /** Walks the camera along `points` at `speed` (units per second). Rejects with "no world view" outside the world view. */
  walkRoute(points: Vec3[], speed: number): Promise<void>;
}

declare global {
  var __viewer: ViewerHooks | undefined;
}

let walkRouteImpl: WalkRoute | null = null;
let loadedTilesImpl: (() => string[]) | null = null;
let rendererImpl: Pick<WebGLRenderer, 'info'> | null = null;

/** The world view calls this when it starts (with `fn`) and when it goes away (with null). */
export function registerWalkRoute(fn: WalkRoute | null): void {
  walkRouteImpl = fn;
}

/** The world view calls this with a function listing the tiles it has loaded, and null when it goes away. */
export function registerLoadedTiles(fn: (() => string[]) | null): void {
  loadedTilesImpl = fn;
}

/** The shell calls this with its renderer once it has one. */
export function registerRenderer(renderer: Pick<WebGLRenderer, 'info'> | null): void {
  rendererImpl = renderer;
}

function rendererCounts(): RendererCounts | null {
  if (rendererImpl === null) return null;
  const { memory, programs } = rendererImpl.info;
  return { geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0 };
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
      return { ...overlay.snapshot(), loadedTiles: loadedTilesImpl?.() ?? [], renderer: rendererCounts() };
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
