import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { ResPacks } from '../../src/index';

// This file is FlyffWeb/packages/formats/test/helpers/client.ts, so FlyffWeb is four levels up.
const FLYFFWEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const MISSING_MESSAGE = 'Client/ not found — set FLYFF_CLIENT';

/** The FlyFF client folder, or null when it is missing. `FLYFF_CLIENT` overrides the default `<repo>/Client`. Read-only. */
export function clientRoot(): string | null {
  const root = process.env.FLYFF_CLIENT
    ? path.resolve(process.env.FLYFF_CLIENT)
    : path.resolve(FLYFFWEB_ROOT, '../Client');
  return existsSync(root) && statSync(root).isDirectory() ? root : null;
}

/** Like `describe`, but when the client folder is missing it registers one skipped test instead of running `fn`. */
export function describeClient(name: string, fn: () => void): void {
  if (clientRoot() === null) {
    describe(name, () => {
      it.skip(MISSING_MESSAGE, () => {});
    });
    return;
  }
  describe(name, fn);
}

const PACK_FILES = ['data.res', 'dataSub1.res', 'dataSub2.res'];
let clientPacks: ResPacks | undefined;

/**
 * The client's three `.res` packs, indexed as one `ResPacks`. Read from disk on the first call, then cached for
 * the rest of the test file.
 */
export function loadClientPacks(): ResPacks {
  if (clientPacks === undefined) {
    const root = clientRoot();
    if (root === null) throw new Error(MISSING_MESSAGE);
    clientPacks = ResPacks.fromBuffers(
      PACK_FILES.map((file) => {
        const buf = readFileSync(path.join(root, file));
        return { file, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
      }),
    );
  }
  return clientPacks;
}

export interface ClientFileResult {
  /** Files visited (matching `extRegex`), including the ones that failed. */
  count: number;
  failures: { path: string; error: unknown }[];
}

/**
 * Runs `read` on every file in `<client>/<relDir>` whose name matches `extRegex`, in name order.
 * A throwing `read` is recorded in `failures` and the walk continues, so one run reports every bad file.
 */
export function forEachClientFile(
  relDir: string,
  extRegex: RegExp,
  read: (bytes: Uint8Array, path: string) => void,
  opts: { recursive?: boolean } = {},
): ClientFileResult {
  const root = clientRoot();
  if (root === null) {
    throw new Error(MISSING_MESSAGE);
  }
  const result: ClientFileResult = { count: 0, failures: [] };

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (opts.recursive) walk(full);
      } else if (entry.isFile() && extRegex.test(entry.name)) {
        result.count++;
        try {
          const buf = readFileSync(full);
          read(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), full);
        } catch (error) {
          result.failures.push({ path: full, error });
        }
      }
    }
  };

  walk(path.join(root, relDir));
  return result;
}
