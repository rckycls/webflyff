// Hash routes: `#/character`, `#/world` and `#/compare`, `#/character` by default. A route can carry parameters after a
// question mark, the world view reading `world=<web name>` (`#/world?world=wdmadrigal`). The router builds a view per
// route from the factories it is given and keeps exactly one alive.

import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { WebGLRenderer } from 'three';
import type { AssetStore } from './assets/AssetStore';
import type { TextureCache } from './assets/loaders';
import type { Overlay } from './overlay/Overlay';

export type RouteName = 'character' | 'world' | 'compare';

export const ROUTE_NAMES: readonly RouteName[] = ['character', 'world', 'compare'];
export const DEFAULT_ROUTE: RouteName = 'character';

export interface Route {
  name: RouteName;
  params: URLSearchParams;
}

/** Reads `location.hash`. A route it does not know is the default one. */
export function parseRoute(hash: string): Route {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryAt = body.indexOf('?');
  const path = queryAt === -1 ? body : body.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : body.slice(queryAt + 1));
  const name = path.startsWith('/') ? path.slice(1) : path;
  return { name: (ROUTE_NAMES as readonly string[]).includes(name) ? (name as RouteName) : DEFAULT_ROUTE, params };
}

/** What the shell hands every view. The renderer and its canvas belong to the shell: views draw with them. */
export interface ViewContext {
  /** Holds the canvas; a view puts any DOM of its own here and takes it out again in `dispose`. */
  container: HTMLElement;
  renderer: WebGLRenderer;
  store: AssetStore;
  loaders: { gltf: GLTFLoader; ktx2: KTX2Loader };
  textures: TextureCache;
  overlay: Overlay;
  route: Route;
}

export interface View {
  /** Resolves when everything the view needs to show is on screen. Never rejects: failures go to the overlay. */
  ready: Promise<void>;
  /** Once per animation frame, `dt` in seconds. The view draws with `ctx.renderer` here. */
  frame(dt: number): void;
  /** Tiles and models the overlay shows. */
  counts?(): { tiles: number; models: number };
  /** Releases everything the view holds: GPU resources, texture references, DOM, listeners. */
  dispose(): void;
}

export type ViewFactory = (ctx: ViewContext) => View;

export class Router {
  private view: View | null = null;

  constructor(
    private readonly base: Omit<ViewContext, 'route'>,
    private readonly factories: Record<RouteName, ViewFactory>,
  ) {}

  /** Shows the route in the address bar now, and follows it from here on. */
  start(): void {
    window.addEventListener('hashchange', () => this.show());
    this.show();
  }

  /** The view on screen, if there is one. */
  current(): View | null {
    return this.view;
  }

  private show(): void {
    const route = parseRoute(window.location.hash);
    this.view?.dispose();
    this.view = null;
    document.body.dataset.route = route.name;
    this.view = this.factories[route.name]({ ...this.base, route });
  }
}
