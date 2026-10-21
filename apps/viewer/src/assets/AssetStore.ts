// The viewer's view of `dist/assets`: `index.json` maps logical keys (`models/part_mvag01upper.glb`) to content-hashed
// paths, and everything else is fetched through it, so a converted file is only ever named by its logical key.
// Hashed files never change, so the browser may cache them for good; `index.json` is the one file that does, which
// is why it is fetched with `cache: 'no-cache'`.

import { decodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WebTile, WorldManifest } from '@flyffweb/formats';
import { fetchRead } from './fetchWithRetry';
import type { FetchRetryOptions } from './fetchWithRetry';

// The body is read inside the retry (`fetchRead`), so a connection that drops mid-file is retried too.
const readJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;
const readBytes = async (response: Response): Promise<Uint8Array> => new Uint8Array(await response.arrayBuffer());

export class AssetStore {
  /** World web name to its manifest. A failed fetch is dropped so that the next call tries again. */
  private readonly manifests = new Map<string, Promise<WorldManifest>>();

  private constructor(
    /** The assets folder as a url prefix, always ending in `/`. */
    readonly base: string,
    private readonly files: Readonly<Record<string, string>>,
    private readonly retry: FetchRetryOptions,
  ) {}

  /** Fetches `<base>index.json`. `retry` is for tests (and tuning): it applies to every later download too. */
  static async load(base = '/assets/', retry: FetchRetryOptions = {}): Promise<AssetStore> {
    const root = base.endsWith('/') ? base : `${base}/`;
    const url = `${root}index.json`;
    const index = await fetchRead(url, readJson<Partial<AssetIndex>>, { ...retry, init: { cache: 'no-cache' } });
    if (index.version !== 1 || typeof index.files !== 'object' || index.files === null) {
      throw new Error(`${url} is not an asset index this viewer reads (version ${String(index.version)}, expected 1)`);
    }
    return new AssetStore(root, index.files, retry);
  }

  /** The url of a converted file, or null when the index does not list the key. */
  url(logicalKey: string): string | null {
    return Object.hasOwn(this.files, logicalKey) ? this.base + this.files[logicalKey]! : null;
  }

  /** Every logical key that starts with `prefix`, in index order. */
  keys(prefix: string): string[] {
    return Object.keys(this.files).filter((key) => key.startsWith(prefix));
  }

  async json<T>(key: string): Promise<T> {
    return fetchRead(this.require(key), readJson<T>, this.retry);
  }

  async bytes(key: string): Promise<Uint8Array> {
    return fetchRead(this.require(key), readBytes, this.retry);
  }

  /** A world's manifest by its web name (`worlds/<webName>/manifest.json`; `manifest.name` is for display only). */
  manifest(world: string): Promise<WorldManifest> {
    let manifest = this.manifests.get(world);
    if (manifest === undefined) {
      manifest = this.json<WorldManifest>(`worlds/${world}/manifest.json`);
      this.manifests.set(world, manifest);
      manifest.catch(() => this.manifests.delete(world));
    }
    return manifest;
  }

  /** Tile (x, y) of a world, or null when the world has no such tile (the viewer draws flat ground there). */
  async tile(world: string, x: number, y: number): Promise<WebTile | null> {
    const { tiles } = await this.manifest(world);
    const key = `${x}_${y}`;
    if (!Object.hasOwn(tiles, key)) return null;
    // The manifest's paths are hashed paths relative to the assets folder, like the index's.
    const url = this.base + tiles[key]!;
    return decodeTileBin(await fetchRead(url, readBytes, this.retry), url);
  }

  private require(key: string): string {
    const url = this.url(key);
    if (url === null) throw new Error(`asset "${key}" is not in the asset index`);
    return url;
  }
}
