// What the world screens of a page share: one renderer and overlay (one WebGL context a page), made by the first world
// screen and kept for the next ones, and the asset index, the loaders and the game data, loaded once a page. Each world
// screen puts the renderer's holder on screen and takes it off again.

import { Overlay, createRenderer, installGlobalErrorHandlers, loadSceneServices } from '@flyffweb/scene';
import type { SceneServices } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import { loadGameData } from './gameData';
import type { GameData } from './gameData';

/** The page's renderer and overlay. */
export interface Page3d {
  /** Holds the canvas and the overlay; each world screen puts it on screen and takes it off again. */
  holder: HTMLElement;
  overlay: Overlay;
  renderer: WebGLRenderer;
}

/** The browser cannot draw the world: WebGL is off or not supported (`createRenderer` threw). */
export class NoWebGLError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'NoWebGLError';
  }
}

let page: Page3d | undefined;
let assets: Promise<{ services: SceneServices; data: GameData }> | undefined;

/**
 * Whether the browser gives a WebGL 2 context, which three.js draws with. Asked of a canvas of its own (its context let
 * go at once) before the renderer is made, so that a browser without it is told so plainly, with no renderer error.
 */
function hasWebGL2(doc: Document): boolean {
  const gl = doc.createElement('canvas').getContext('webgl2');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return gl !== null;
}

/** The page's renderer and overlay; throws a `NoWebGLError` (and keeps nothing, to try again next time) without WebGL. */
export function page3d(doc: Document): Page3d {
  if (page === undefined) {
    if (!hasWebGL2(doc)) throw new NoWebGLError('this browser gives no WebGL 2 context');
    const holder = doc.createElement('div');
    holder.className = 'world-view';
    const overlay = new Overlay(holder);
    let renderer: WebGLRenderer;
    try {
      renderer = createRenderer(holder, overlay);
    } catch (error) {
      throw new NoWebGLError(error);
    }
    // whatever nothing catches still ends up on the overlay, as in the viewer
    installGlobalErrorHandlers(window, overlay);
    page = { holder, overlay, renderer };
  }
  return page;
}

/**
 * The asset index, the loaders and the game data, loaded once a page; a failure is forgotten, so the next entry tries
 * again. Game files older than the game data reject with `loadGameData`'s `GameDataMissingError`.
 */
export function sceneAssets(p: Page3d): Promise<{ services: SceneServices; data: GameData }> {
  if (assets === undefined) {
    const loading = (async () => {
      const services = await loadSceneServices(p.renderer, p.overlay);
      return { services, data: await loadGameData(services.store) };
    })();
    assets = loading;
    loading.catch(() => {
      if (assets === loading) assets = undefined;
    });
  }
  return assets;
}
