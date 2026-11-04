// The character list warms the browser's cache with the world the selected character was saved in (2026-11-04 loading
// audit): nothing of the world was fetched until the server's JOIN arrived, a second after Enter at the earliest
// (`WorldSession`'s PRE_JOIN wait), and a first entry then waited on ~600 requests one after another (tile, then model,
// then texture). While the player looks at the list, this fetches what the stage asks for first: the world's manifest,
// the 3 x 3 tiles around the saved place (`WorldStage.open` with radius 1), then those tiles' models, collision files and
// terrain textures, then the models' own textures, a few at a time and at a low priority. The hashed files are cached
// `immutable` (`serveDist.ts`, the hosting guide), so the stage's own requests then come from the disk cache.
//
// The manifest and the tiles go through the page's asset store, which keeps the manifest for the stage. A new selection,
// Back or log-out aborts it; Enter stops it starting more, and what is in flight finishes (the browser makes the
// world's request for the same file wait for it).

import { collisionKey, toWebPosition } from '@flyffweb/formats';
import type { Vec3, WebTile, WorldManifest } from '@flyffweb/formats';
import { tileOf, tilesInRange } from '@flyffweb/scene';

/** What the prefetch reads of the page's asset store. */
export interface PrefetchStore {
  manifest(world: string): Promise<WorldManifest>;
  tile(world: string, x: number, y: number): Promise<WebTile | null>;
  url(key: string): string | null;
}

/** Downloads a file whole (its body read, so that the browser keeps it), abortable. */
export type FetchBytes = (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;

/** `fetch` at a low priority (Chromium's `priority`; other browsers ignore it). */
export const lowPriorityFetch: FetchBytes = async (url, signal) => {
  const response = await fetch(url, { signal, priority: 'low' } as RequestInit);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
};

/** The stage's radius (`WorldScreen`'s RADIUS): the 3 x 3 tiles it shows first. */
const RADIUS = 1;
/** Files in flight at once: few, so that the list's own pictures and the character previews are not held up. */
const LIMIT = 4;
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

/** The texture keys a converted GLB's materials name (`extras.texture`, which `applyTextures` reads), each once. */
export function glbTextureKeys(bytes: ArrayBuffer): string[] {
  if (bytes.byteLength < 20) return [];
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== JSON_CHUNK) return [];
  const length = view.getUint32(12, true);
  if (20 + length > bytes.byteLength) return [];
  try {
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length))) as {
      materials?: Array<{ extras?: { texture?: unknown } }>;
    };
    const keys = (json.materials ?? []).map((m) => m.extras?.texture).filter((k): k is string => typeof k === 'string');
    return [...new Set(keys)];
  } catch {
    return [];
  }
}

export class WorldPrefetch {
  private run: { abort: AbortController; stopped: boolean } | null = null;

  constructor(
    private readonly store: () => Promise<PrefetchStore>,
    /** The world's web name (`GameData.worlds`), or undefined for one not converted. */
    private readonly folderOf: (worldId: number) => Promise<string | undefined>,
    private readonly fetchBytes: FetchBytes = lowPriorityFetch,
    private readonly limit = LIMIT,
  ) {}

  /** Warms the cache for a character saved in `worldId` at `pos` (D3D); the last run is aborted. Never rejects. */
  async start(worldId: number, pos: Vec3): Promise<void> {
    this.abort();
    const run = { abort: new AbortController(), stopped: false };
    this.run = run;
    try {
      await this.prefetch(run, worldId, pos);
    } catch {
      // a prefetch that fails costs nothing: the world loads its files itself
    }
  }

  /** Starts nothing more; what is in flight finishes. */
  stop(): void {
    if (this.run !== null) this.run.stopped = true;
    this.run = null;
  }

  /** Aborts everything in flight too. */
  abort(): void {
    if (this.run === null) return;
    this.run.stopped = true;
    this.run.abort.abort();
    this.run = null;
  }

  private async prefetch(run: { abort: AbortController; stopped: boolean }, worldId: number, pos: Vec3): Promise<void> {
    const folder = await this.folderOf(worldId);
    if (folder === undefined || run.stopped) return;
    const store = await this.store();
    const manifest = await store.manifest(folder);
    if (run.stopped) return;
    const center = tileOf(toWebPosition(pos), manifest.mpu);
    const keys = tilesInRange(center, RADIUS, manifest.size).visible;
    const tiles = await Promise.all(keys.map((key) => {
      const [x, y] = key.split('_').map(Number) as [number, number];
      return store.tile(folder, x, y).catch(() => null);
    }));
    if (run.stopped) return;

    // the queue: each url once, `limit` at a time; a model's textures join it when the model is in
    const seen = new Set<string>();
    const queue: Array<{ url: string; model: boolean }> = [];
    const add = (key: string | undefined, model = false): void => {
      if (key === undefined) return;
      const url = store.url(key);
      if (url === null || seen.has(url)) return;
      seen.add(url);
      queue.push({ url, model });
    };
    for (const tile of tiles) {
      if (tile === null) continue;
      for (const layer of tile.layers) add(manifest.terrainTextures[layer.texture]);
      for (const object of tile.objects) {
        const model = manifest.models[object.model];
        if (model === undefined) continue;
        add(model, true);
        const stem = /^models\/(.+)\.glb$/.exec(model)?.[1];
        if (stem !== undefined) add(collisionKey(stem));
      }
    }
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined && !run.stopped; next = queue.shift()) {
        try {
          const bytes = await this.fetchBytes(next.url, run.abort.signal);
          if (next.model) for (const texture of glbTextureKeys(bytes)) add(texture);
        } catch {
          if (run.abort.signal.aborted) return;
        }
      }
    };
    await Promise.all(Array.from({ length: this.limit }, worker));
  }
}
