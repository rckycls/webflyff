// The shell: overlay first (so anything that goes wrong shows on screen), then the renderer, the asset index, the
// loaders and the texture cache, then the router. One renderer and canvas serve every route.

import { WebGLRenderer } from 'three';
import { AssetStore } from './assets/AssetStore';
import { TextureCache, createLoaders, loadKtx2 } from './assets/loaders';
import { Overlay } from './overlay/Overlay';
import { installContextLossHandlers, installGlobalErrorHandlers } from './overlay/errorHandlers';
import { Router } from './router';
import type { RouteName, ViewFactory } from './router';
import { installTestHooks } from './testHooks';
import { placeholderView } from './views/placeholder';

const CLEAR_COLOR = 0x101418;
const MAX_PIXEL_RATIO = 2;

/** The views, by route. Each later piece replaces its placeholder. */
const VIEWS: Record<RouteName, ViewFactory> = {
  character: placeholderView('character'),
  world: placeholderView('world'),
  compare: placeholderView('compare'),
};

const overlay = new Overlay(document.body);
// Before anything else can fail: whatever nothing catches still ends up on screen.
installGlobalErrorHandlers(window, overlay);
let router: Router | null = null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createRenderer(container: HTMLElement): WebGLRenderer {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    throw new Error(`WebGL is not available: ${messageOf(error)}`, { cause: error });
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CLEAR_COLOR);
  installContextLossHandlers(renderer.domElement, overlay);
  container.append(renderer.domElement);
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));
  return renderer;
}

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (container === null) throw new Error('index.html has no #app');
  const renderer = createRenderer(container);

  // The frame loop starts before the index arrives, so the overlay is alive while assets load.
  let textures: TextureCache | null = null;
  let lastError = '';
  let lastTime = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    overlay.frame(dt);
    const view = router?.current();
    if (view === null || view === undefined) {
      renderer.clear();
      return;
    }
    try {
      view.frame(dt);
      overlay.setCounts({ tiles: 0, models: 0, ...view.counts?.(), textures: textures?.size() ?? 0 });
    } catch (error) {
      // A view that throws every frame must not fill the overlay with the same line sixty times a second.
      const message = `view: ${messageOf(error)}`;
      if (message !== lastError) overlay.error(message);
      lastError = message;
    }
  });

  const store = await AssetStore.load();
  const loaders = createLoaders(renderer);
  textures = new TextureCache(store, (url) => loadKtx2(loaders.ktx2, url), overlay);
  router = new Router({ container, renderer, store, loaders, textures, overlay }, VIEWS);
  router.start();
}

const booted = boot().catch((error: unknown) => {
  overlay.error(messageOf(error));
  throw error;
});
// The overlay has the error; this only keeps the browser from also reporting an unhandled rejection. `ready()` rejects.
booted.catch(() => {});

installTestHooks(overlay, booted, () => router?.current()?.ready ?? Promise.resolve());
