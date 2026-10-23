// The shell: overlay first (so anything that goes wrong shows on screen), then the renderer, the asset index, the
// loaders and the texture cache (@flyffweb/scene's boot helpers), then the router. One renderer and canvas serve every
// route.

import { Overlay, createRenderer, installGlobalErrorHandlers, loadSceneServices } from '@flyffweb/scene';
import type { SceneServices } from '@flyffweb/scene';
import { characterView } from './character/CharacterView';
import { compareView } from './compare/ComparePage';
import { Router } from './router';
import type { RouteName, ViewFactory } from './router';
import { installTestHooks, registerRenderer } from './testHooks';
import { worldView } from './world/WorldView';

/** The views, by route. */
const VIEWS: Record<RouteName, ViewFactory> = {
  character: characterView,
  world: worldView,
  compare: compareView,
};

// The compare page shows the viewer in a frame; a viewer in a frame leaves its nav bar out (index.html), so the
// picture is only the picture.
try {
  if (window.self !== window.top) document.body.dataset.embedded = '1';
} catch {
  // a frame that cannot ask is a frame
  document.body.dataset.embedded = '1';
}

const overlay = new Overlay(document.body);
// Before anything else can fail: whatever nothing catches still ends up on screen.
installGlobalErrorHandlers(window, overlay);
let router: Router | null = null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (container === null) throw new Error('index.html has no #app');
  const renderer = createRenderer(container, overlay);
  registerRenderer(renderer);

  // The frame loop starts before the index arrives, so the overlay is alive while assets load.
  let services: SceneServices | null = null;
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
      overlay.setCounts({ tiles: 0, models: 0, ...view.counts?.(), textures: services?.textures.size() ?? 0 });
    } catch (error) {
      // A view that throws every frame must not fill the overlay with the same line sixty times a second.
      const message = `view: ${messageOf(error)}`;
      if (message !== lastError) overlay.error(message);
      lastError = message;
    }
  });

  services = await loadSceneServices(renderer, overlay);
  router = new Router({ container, ...services }, VIEWS);
  router.start();
}

const booted = boot().catch((error: unknown) => {
  overlay.error(messageOf(error));
  throw error;
});
// The overlay has the error; this only keeps the browser from also reporting an unhandled rejection. `ready()` rejects.
booted.catch(() => {});

installTestHooks(overlay, booted, () => router?.current()?.ready ?? Promise.resolve());
