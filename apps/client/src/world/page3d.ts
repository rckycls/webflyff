// What the world screens of a page share: one renderer and overlay (one WebGL context a page), made by the first world
// screen and kept for the next ones, and the asset index, the loaders and the game data, loaded once a page. Each world
// screen puts the renderer's holder on screen and takes it off again. A page that is thrown away lets its WebGL context
// go as it goes (`releaseOnPageHide`).

import {
  Overlay, createRenderer, installGlobalErrorHandlers, loadSceneServices, releaseRenderer,
} from '@flyffweb/scene';
import type { SceneServices } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import { pageAssets, pageGameData } from '../pageAssets';
import type { GameData } from './gameData';

/** The page's renderer and overlay. */
export interface Page3d {
  /** Holds the canvas and the overlay; each world screen puts it on screen and takes it off again. */
  holder: HTMLElement;
  overlay: Overlay;
  renderer: WebGLRenderer;
  /**
   * The page let the renderer and its WebGL context go (`releaseRenderer`, as the page was thrown away): nothing is
   * drawn after, and nothing that fails for it is a fault to say.
   */
  released: boolean;
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

/**
 * Calls `release` once, when the page is thrown away: at a `pagehide` that is not persisted (a page closed, or left for
 * another). A page kept in the back/forward cache (`persisted`) keeps its context, to be shown again as it was.
 */
export function releaseOnPageHide(view: EventTarget, release: () => void): void {
  let done = false;
  view.addEventListener('pagehide', (event) => {
    if ((event as PageTransitionEvent).persisted || done) return;
    done = true;
    release();
  });
}

/**
 * The page's renderer and overlay; throws a `NoWebGLError` (and keeps nothing, to try again next time) without WebGL.
 * Made once a page, which lets the renderer and its WebGL context go as the page is thrown away (`releaseOnPageHide`,
 * `releaseRenderer`), so that the browser need not keep what the context holds until it collects the page.
 */
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
    page = { holder, overlay, renderer, released: false };
    releaseOnPageHide(window, releasePage3d);
  }
  return page;
}

/**
 * Lets the page's renderer and its WebGL context go (`releaseRenderer`), once: what a page that is thrown away does
 * (`releaseOnPageHide`). Nothing without a renderer, or once it has gone.
 */
function releasePage3d(): void {
  if (page === undefined || page.released) return;
  page.released = true;
  releaseRenderer(page.renderer);
}

/**
 * The asset index, the loaders and the game data, loaded once a page; a failure is forgotten, so the next entry tries
 * again. The index and the game data are the page's (`pageAssets`, `pageGameData`), shared with the lobby. Game files older than the game data reject with `loadGameData`'s `GameDataMissingError`.
 */
export function sceneAssets(p: Page3d): Promise<{ services: SceneServices; data: GameData }> {
  if (assets === undefined) {
    const loading = (async () => {
      const store = await pageAssets();
      const [services, data] = await Promise.all([loadSceneServices(p.renderer, p.overlay, undefined, store), pageGameData()]);
      return { services, data };
    })();
    assets = loading;
    loading.catch(() => {
      if (assets === loading) assets = undefined;
    });
  }
  return assets;
}
