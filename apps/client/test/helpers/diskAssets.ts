import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAP_SIZE, decodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WebTile, WorldManifest } from '@flyffweb/formats';
import { sampleHeight } from '@flyffweb/scene';

/** The worktree's converted assets (`npm run convert`), which the world screen's dev server serves too. */
export const ASSETS_DIR = fileURLToPath(new URL('../../../../dist/assets/', import.meta.url));

/** `dist/assets` read from the disk instead of fetched: the same logical keys, through the same `index.json`. */
export class DiskAssets {
  private constructor(private readonly files: Readonly<Record<string, string>>) {}

  /** Reads `index.json`; throws with what to do when the converted files are not there. */
  static open(): DiskAssets {
    const indexPath = `${ASSETS_DIR}index.json`;
    if (!existsSync(indexPath)) throw new Error(`${indexPath} is missing: run \`npm run convert\` first (the test reads the game data from it).`);
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Partial<AssetIndex>;
    if (index.version !== 1 || typeof index.files !== 'object' || index.files === null) throw new Error(`${indexPath} is not an asset index this test reads`);
    return new DiskAssets(index.files);
  }

  has(key: string): boolean {
    return Object.hasOwn(this.files, key);
  }

  /** What `AssetStore.json` gives `loadGameData`. */
  json<T>(key: string): Promise<T> {
    return Promise.resolve(this.readJson<T>(key));
  }

  readJson<T>(key: string): T {
    return JSON.parse(readFileSync(this.path(key), 'utf8')) as T;
  }

  /** A tile by the hashed path the world's manifest names. */
  tile(hashedPath: string): WebTile {
    const path = ASSETS_DIR + hashedPath;
    return decodeTileBin(new Uint8Array(readFileSync(path)), path);
  }

  private path(key: string): string {
    if (!this.has(key)) throw new Error(`asset "${key}" is not in ${ASSETS_DIR}index.json`);
    return ASSETS_DIR + this.files[key]!;
  }
}

/**
 * The ground under a D3D x, z of one converted world (`CLandscape::GetHeight`), which the movers' steps stand on as the
 * screen's `stage.heightAt` does; `null` where the world has no tile, and the mover then stays where it is.
 */
export class Terrain {
  private readonly tiles = new Map<string, WebTile | null>();
  private readonly side: number;

  constructor(private readonly assets: DiskAssets, private readonly manifest: WorldManifest) {
    this.side = MAP_SIZE * manifest.mpu;
  }

  readonly heightAt = (x: number, z: number): number | null => {
    const tx = Math.floor(x / this.side);
    const tz = Math.floor(z / this.side);
    const key = `${tx}_${tz}`;
    let tile = this.tiles.get(key);
    if (tile === undefined) {
      tile = Object.hasOwn(this.manifest.tiles, key) ? this.assets.tile(this.manifest.tiles[key]!) : null;
      this.tiles.set(key, tile);
    }
    return tile === null ? null : sampleHeight(tile, x - tx * this.side, z - tz * this.side, this.manifest.mpu);
  };
}
