// Hash routes: `#/character`, `#/world` and `#/compare`, `#/character` by default. A route can carry parameters after a
// question mark, the world view reading `world=<web name>` (`#/world?world=wdmadrigal`). The router builds a view per
// route from the factories it is given and keeps exactly one alive.

import type { AssetStore, Overlay, TextureCache } from '@flyffweb/scene';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { WebGLRenderer } from 'three';

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

/** What the router needs from the page, so it can be driven without a browser. */
export interface RouterHost {
  /** `location.hash`. */
  hash(): string;
  /** Calls `listener` on every `hashchange`. */
  onHashChange(listener: () => void): void;
  /** The route now on screen (the page marks it, for the nav bar). */
  routeShown(name: RouteName): void;
}

const browserHost: RouterHost = {
  hash: () => window.location.hash,
  onHashChange: (listener) => window.addEventListener('hashchange', listener),
  routeShown: (name) => {
    document.body.dataset.route = name;
  },
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Router {
  private view: View | null = null;

  constructor(
    private readonly base: Omit<ViewContext, 'route'>,
    private readonly factories: Record<RouteName, ViewFactory>,
    private readonly host: RouterHost = browserHost,
  ) {}

  /** Shows the route in the address bar now, and follows it from here on. */
  start(): void {
    this.host.onHashChange(() => this.show());
    this.show();
  }

  /** The view on screen, if there is one. */
  current(): View | null {
    return this.view;
  }

  /**
   * Swaps the view for the one the hash names. Whatever a view's `dispose` or factory throws goes to the overlay
   * (a phone has no console), and the router stays usable: the old view is dropped either way, so it is never
   * disposed twice, and a factory that failed leaves no view (the shell clears the canvas) until the next route.
   */
  private show(): void {
    const route = parseRoute(this.host.hash());
    const old = this.view;
    this.view = null;
    try {
      old?.dispose();
    } catch (error) {
      this.base.overlay.error(`the previous view did not dispose cleanly: ${messageOf(error)}`);
    }
    this.host.routeShown(route.name);
    try {
      this.view = this.factories[route.name]({ ...this.base, route });
    } catch (error) {
      this.base.overlay.error(`${route.name} view failed to start: ${messageOf(error)}`);
    }
  }
}
