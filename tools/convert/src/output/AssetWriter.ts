import { createHash } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import type { AssetIndex } from '@flyffweb/formats';
import { writeAtomic } from './atomicWrite';
import type { FsPromises } from './atomicWrite';

/** Two different client files that convert to the same logical key (such as `Obj_ A.o3d` and `Obj_-A.o3d`). */
export class NameCollisionError extends Error {
  constructor(
    readonly logicalKey: string,
    readonly firstSource: string,
    readonly secondSource: string,
  ) {
    super(`name collision on "${logicalKey}": written from "${firstSource}" and again from "${secondSource}"`);
    this.name = 'NameCollisionError';
  }
}

const HASH_LENGTH = 10;

/** `models/part_x.glb` and bytes become `models/part_x.<first 10 hex of sha256>.glb`. */
function hashedKey(logicalKey: string, bytes: Uint8Array): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LENGTH);
  const slash = logicalKey.lastIndexOf('/');
  const dot = logicalKey.lastIndexOf('.');
  if (dot <= slash + 1) return `${logicalKey}.${hash}`; // no extension (or only a leading dot)
  return `${logicalKey.slice(0, dot)}.${hash}${logicalKey.slice(dot)}`;
}

function checkLogicalKey(logicalKey: string): void {
  const segments = logicalKey.split('/');
  if (logicalKey.includes('\\') || segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(
      `invalid logical key "${logicalKey}": expected a relative path with "/" separators and no empty, "." or ".." parts`,
    );
  }
}

/**
 * Writes converted files under `outDir` with a content hash in their name, and remembers which logical key went to
 * which hashed path so that `finish()` can write `index.json`.
 */
export class AssetWriter {
  /** Logical key to the source it was written from: claimed before the first await, so concurrent writes see it. */
  private readonly sources = new Map<string, string>();
  /** Logical key to hashed path, for writes that completed. */
  private readonly written = new Map<string, string>();

  constructor(
    private readonly outDir: string,
    private readonly fs: FsPromises = fsPromises,
  ) {}

  /**
   * Writes `bytes` for `logicalKey` and returns the hashed path (relative to `outDir`, `/` separators). A second
   * write of the same key from a different `source` throws `NameCollisionError`; the same source may write again.
   * The file goes to `<path>.tmp` first and is renamed into place, so a reader never sees a partial file.
   */
  async write(logicalKey: string, bytes: Uint8Array, source = ''): Promise<string> {
    checkLogicalKey(logicalKey);
    const claimed = this.sources.get(logicalKey);
    if (claimed !== undefined && claimed !== source) {
      throw new NameCollisionError(logicalKey, claimed, source);
    }
    this.sources.set(logicalKey, source);

    const hashed = hashedKey(logicalKey, bytes);
    try {
      await writeAtomic(this.fs, path.join(this.outDir, ...hashed.split('/')), bytes);
    } catch (error) {
      if (claimed === undefined) this.sources.delete(logicalKey);
      throw error;
    }
    this.written.set(logicalKey, hashed);
    return hashed;
  }

  /** The hashed path written for `logicalKey` in this run, or undefined. */
  pathOf(logicalKey: string): string | undefined {
    return this.written.get(logicalKey);
  }

  /** Writes `index.json` (an `AssetIndex`) listing everything written, sorted by logical key. */
  async finish(): Promise<void> {
    const files: Record<string, string> = {};
    for (const key of [...this.written.keys()].sort()) files[key] = this.written.get(key)!;
    const index: AssetIndex = { version: 1, files };
    await writeAtomic(this.fs, path.join(this.outDir, 'index.json'), JSON.stringify(index));
  }
}
