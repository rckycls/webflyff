import { createHash } from 'node:crypto';
import { existsSync, promises as fsPromises, readFileSync } from 'node:fs';
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

/** A relative path with `/` separators and no empty, `.` or `..` parts: it cannot leave the folder it is joined to. */
function isRelativePath(p: string): boolean {
  return !p.includes('\\') && !p.split('/').some((s) => s === '' || s === '.' || s === '..');
}

function checkLogicalKey(logicalKey: string): void {
  if (!isRelativePath(logicalKey)) {
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
  /** The usable entries of the index.json found in `outDir` when it was first needed; see `earlierIndex`. */
  private earlier: Map<string, string> | undefined;

  /**
   * `warn` is told about an existing index.json that could not be used (see `pathOf` and `finish`); it defaults to
   * the console.
   */
  constructor(
    private readonly outDir: string,
    private readonly fs: FsPromises = fsPromises,
    private readonly warn: (message: string) => void = (message) => console.warn(message),
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

  /**
   * The hashed path of `logicalKey`: the one written in this run, else the one the index.json of an earlier run in
   * `outDir` names, provided that file still exists (R32: an `--only` run still links what a full run converted).
   * Undefined when neither has it. The earlier index is read once, on the first call that needs it.
   */
  pathOf(logicalKey: string): string | undefined {
    const now = this.written.get(logicalKey);
    if (now !== undefined) return now;
    const before = this.earlierIndex().get(logicalKey);
    return before !== undefined && existsSync(path.join(this.outDir, ...before.split('/'))) ? before : undefined;
  }

  /**
   * Writes `index.json` (an `AssetIndex`), sorted by logical key. It merges into the index an earlier run left in
   * `outDir`, so a partial run (`--only`) does not wipe the rest: the keys written in this run win, earlier entries
   * whose hashed file still exists are kept, and earlier entries whose file is gone are dropped. An index.json that
   * is missing counts as empty; one that cannot be read or parsed counts as empty too, with a warning.
   */
  async finish(): Promise<void> {
    const merged = new Map<string, string>();
    for (const [key, hashed] of this.earlierIndex()) {
      if (this.written.has(key)) continue;
      const exists = await this.fs.access(path.join(this.outDir, ...hashed.split('/'))).then(
        () => true,
        () => false,
      );
      if (exists) merged.set(key, hashed);
    }
    for (const [key, hashed] of this.written) merged.set(key, hashed);
    const files: Record<string, string> = {};
    for (const key of [...merged.keys()].sort()) files[key] = merged.get(key)!;
    const index: AssetIndex = { version: 1, files };
    await writeAtomic(this.fs, path.join(this.outDir, 'index.json'), JSON.stringify(index));
  }

  /**
   * The entries of the index.json in `outDir` whose key and path are plain relative paths, read the first time this
   * is called and kept: `pathOf` and `finish` see the same index, and an unusable file is warned about once. It reads
   * synchronously because `pathOf` is synchronous. It does not check that the files exist.
   */
  private earlierIndex(): Map<string, string> {
    if (this.earlier !== undefined) return this.earlier;
    const kept = new Map<string, string>();
    this.earlier = kept;
    const indexPath = path.join(this.outDir, 'index.json');

    let text: string;
    try {
      text = readFileSync(indexPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const reason = error instanceof Error ? error.message : String(error);
        this.warn(`${indexPath} could not be read, so it is replaced: ${reason}`);
      }
      return kept;
    }

    let files: unknown;
    try {
      const parsed: unknown = JSON.parse(text);
      const isIndex = typeof parsed === 'object' && parsed !== null && (parsed as { version?: unknown }).version === 1;
      files = isIndex ? (parsed as { files?: unknown }).files : undefined;
    } catch {
      files = undefined;
    }
    if (typeof files !== 'object' || files === null || Array.isArray(files)) {
      this.warn(`${indexPath} is not a version 1 asset index, so it is replaced`);
      return kept;
    }

    for (const [key, hashed] of Object.entries(files)) {
      if (typeof hashed === 'string' && isRelativePath(key) && isRelativePath(hashed)) kept.set(key, hashed);
    }
    return kept;
  }
}
