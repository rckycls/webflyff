// Starting the 3D side of a page: the renderer, then the services every scene draws with (the asset index, the loaders
// and the texture cache). The viewer and the game client both start this way; what each does next (a router of views,
// a world screen) is theirs. One renderer and canvas serve the whole page.

import { WebGLRenderer } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { AssetStore } from './assets/AssetStore';
import { TextureCache, createLoaders, loadKtx2 } from './assets/loaders';
import { installContextLossHandlers, installShaderErrorHandler } from './overlay/errorHandlers';
import { trackDrawingBuffer } from './overlay/gpuMemory';
import type { Overlay } from './overlay/Overlay';

const CLEAR_COLOR = 0x101418;
const MAX_PIXEL_RATIO = 2;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The page's renderer, its canvas appended to `container`, sized to the window and following it. Whatever goes wrong
 * with it (a shader that does not compile, a lost context) ends up on `overlay`; a browser without WebGL throws.
 */
export function createRenderer(container: HTMLElement, overlay: Overlay): WebGLRenderer {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    throw new Error(`WebGL is not available: ${messageOf(error)}`, { cause: error });
  }
  installShaderErrorHandler(renderer, overlay);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CLEAR_COLOR);
  installContextLossHandlers(renderer.domElement, overlay);
  container.append(renderer.domElement);
  // the canvas's own colour and depth buffers are GPU memory too, and they follow its size
  const countDrawingBuffer = trackDrawingBuffer(renderer.getContext(), overlay);
  countDrawingBuffer();
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    countDrawingBuffer();
  });
  return renderer;
}

/** What every scene draws with. The renderer and the services belong to the page: scenes borrow them. */
export interface SceneServices {
  renderer: WebGLRenderer;
  store: AssetStore;
  loaders: { gltf: GLTFLoader; ktx2: KTX2Loader };
  textures: TextureCache;
  overlay: Overlay;
}

/**
 * Fetches the asset index (`<assetBase>index.json`, `/assets/` by default) and makes the loaders and the texture cache
 * that go with `renderer`. Rejects when the index cannot be had.
 */
export async function loadSceneServices(
  renderer: WebGLRenderer,
  overlay: Overlay,
  assetBase?: string,
): Promise<SceneServices> {
  const store = await AssetStore.load(assetBase);
  const loaders = createLoaders(renderer);
  const textures = new TextureCache(store, (url) => loadKtx2(loaders.ktx2, url), overlay);
  return { renderer, store, loaders, textures, overlay };
}
