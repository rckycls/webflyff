// Loading models and textures. Models are glb files without images: each material names its texture's logical key in
// `extras.texture`, which GLTFLoader copies to `material.userData.texture`. `applyTextures` resolves those keys through
// one ref-counted `TextureCache`, so models that share a texture share one download and one GPU copy (global
// constraints). Everything downloaded goes through `fetchWithRetry`.

import type { Material, Mesh, Object3D, Texture, WebGLRenderer } from 'three';
import { RepeatWrapping } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { Overlay } from '../overlay/Overlay';
import { textureGpuBytes } from '../overlay/gpuMemory';
import type { AssetStore } from './AssetStore';
import { fetchWithRetry } from './fetchWithRetry';
import type { FetchRetryOptions } from './fetchWithRetry';
import { checkerTexture } from './placeholder';

/** Where the Basis transcoder (`basis_transcoder.js` and `.wasm`) is served from (`npm run copy-basis` fills it). */
export const BASIS_PATH = '/basis/';

/**
 * The loaders every view shares. `ktx2` is ready to transcode for this renderer's GPU (ASTC, BC, ETC or plain rgba8),
 * which needs the renderer, hence it is made here and not per view.
 */
export function createLoaders(renderer: WebGLRenderer): { gltf: GLTFLoader; ktx2: KTX2Loader } {
  const ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer);
  return { gltf: new GLTFLoader(), ktx2 };
}

/** Downloads a glb (with retries) and parses it; its images, if it had any, would resolve against nothing. */
export async function loadGltf(store: AssetStore, gltf: GLTFLoader, key: string): Promise<GLTF> {
  const bytes = await store.bytes(key);
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  return gltf.parseAsync((whole ? bytes : bytes.slice()).buffer as ArrayBuffer, '');
}

/** Downloads a `.ktx2` (with retries) and transcodes it for this GPU. This is the `load` a `TextureCache` wants. */
export async function loadKtx2(ktx2: KTX2Loader, url: string, retry: FetchRetryOptions = {}): Promise<Texture> {
  const response = await fetchWithRetry(url, retry);
  const buffer = await response.arrayBuffer();
  return new Promise<Texture>((resolve, reject) => {
    ktx2.parse(buffer, (texture) => resolve(texture), reject);
  });
}

interface CacheEntry {
  refs: number;
  /** Never rejects: a failed load resolves to the shared checkerboard. */
  texture: Promise<Texture>;
  /** Set once `texture` has resolved. */
  loaded: Texture | null;
  /** What was added to the overlay's GPU estimate for it. */
  bytes: number;
}

/**
 * Textures by logical key, ref-counted. `acquire` counts one holder, `release` gives one back, and a texture nobody
 * holds is disposed. A key that is null, unknown to the index, or fails to load gives the shared checkerboard
 * (never disposed, never counted) and, for the last two, an error in the overlay.
 */
export class TextureCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly store: AssetStore,
    private readonly load: (url: string) => Promise<Texture>,
    private readonly overlay: Pick<Overlay, 'error' | 'addGpuBytes'>,
  ) {}

  acquire(key: string | null): Promise<Texture> {
    if (key === null) return Promise.resolve(checkerTexture());
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = this.start(key);
      this.entries.set(key, entry);
    }
    entry.refs++;
    return entry.texture;
  }

  release(key: string | null): void {
    if (key === null) return;
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    if (--entry.refs > 0) return;
    this.entries.delete(key);
    // Released while still loading: let go of it as soon as it arrives.
    if (entry.loaded !== null) this.dispose(entry, entry.loaded);
    else void entry.texture.then((texture) => this.dispose(entry, texture));
  }

  /** The number of different textures held (a failed one counts too: it holds the checkerboard for its key). */
  size(): number {
    return this.entries.size;
  }

  private start(key: string): CacheEntry {
    const entry: CacheEntry = {
      refs: 0,
      loaded: null,
      bytes: 0,
      texture: this.loadTexture(key).then((texture) => {
        entry.loaded = texture;
        if (texture !== checkerTexture()) {
          entry.bytes = textureGpuBytes(texture);
          this.overlay.addGpuBytes(entry.bytes);
        }
        return texture;
      }),
    };
    return entry;
  }

  private async loadTexture(key: string): Promise<Texture> {
    const url = this.store.url(key);
    if (url === null) {
      this.overlay.error(`texture ${key}: not in the asset index`);
      return checkerTexture();
    }
    try {
      const texture = await this.load(url);
      // D3D's default addressing is wrap (the client never sets another for these), and KTX2 cannot say so itself.
      texture.wrapS = texture.wrapT = RepeatWrapping;
      return texture;
    } catch (error) {
      this.overlay.error(`texture ${key}: ${error instanceof Error ? error.message : String(error)}`);
      return checkerTexture();
    }
  }

  private dispose(entry: CacheEntry, texture: Texture): void {
    if (texture === checkerTexture()) return;
    this.overlay.addGpuBytes(-entry.bytes);
    texture.dispose();
  }
}

/**
 * Gives every material under `root` the texture its `userData.texture` names, through `cache`. Returns the keys it
 * acquired, one per material (a material shared by several meshes counts once), for the caller to `release` when it
 * drops `root`. A material whose key is null gets the checkerboard; one without a `texture` entry is left alone.
 */
export async function applyTextures(root: Object3D, cache: Pick<TextureCache, 'acquire'>): Promise<string[]> {
  const materials = new Set<Material>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });

  const acquired: string[] = [];
  await Promise.all(
    [...materials].map(async (material) => {
      if (!('texture' in material.userData)) return;
      const named: unknown = material.userData.texture;
      const key = typeof named === 'string' ? named : null;
      if (key !== null) acquired.push(key);
      const withMap = material as Material & { map: Texture | null };
      withMap.map = await cache.acquire(key);
      material.needsUpdate = true;
    }),
  );
  return acquired;
}
