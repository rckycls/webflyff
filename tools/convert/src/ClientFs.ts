import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ResPacks } from '@flyffweb/formats';
import { UserError } from './util';

/** The three packs the client reads; the converter needs all of them. */
const PACK_FILES = ['data.res', 'dataSub1.res', 'dataSub2.res'];

interface Dir {
  /** Real path on disk. */
  path: string;
  /** Children by lower-cased name, in name order. */
  children: Map<string, Child>;
}

interface Child {
  /** Real name on disk. */
  name: string;
  /** Set for a folder. */
  dir: Dir | undefined;
}

const lower = (s: string): string => s.toLowerCase();

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Lists `dirPath` and every folder below it. Reads names only, never file contents. */
async function scan(dirPath: string): Promise<Dir> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  entries.sort((a, b) => compare(lower(a.name), lower(b.name)) || compare(a.name, b.name));
  const children = new Map<string, Child>();
  for (const entry of entries) {
    // Two names that differ only in case (possible on a case-sensitive disk): the first in name order wins.
    if (children.has(lower(entry.name))) continue;
    const dir = entry.isDirectory() ? await scan(path.join(dirPath, entry.name)) : undefined;
    children.set(lower(entry.name), { name: entry.name, dir });
  }
  return { path: dirPath, children };
}

/**
 * The read-only client folder: its three `.res` packs, and a case-insensitive index of every file and folder under
 * it (the client's own names mix case, such as `World/WdMadrigal`, and the original client never cared). Opening
 * reads the packs and lists the folders; no other file is read.
 */
export class ClientFs {
  private constructor(
    readonly root: string,
    readonly packs: ResPacks,
    private readonly rootDir: Dir,
  ) {}

  static async open(root: string): Promise<ClientFs> {
    const resolved = path.resolve(root);
    const stat = await fs.stat(resolved).catch(() => undefined);
    if (stat === undefined || !stat.isDirectory()) {
      throw new UserError(`client folder not found: ${resolved} (set --client or FLYFF_CLIENT)`);
    }
    const rootDir = await scan(resolved);

    const packFiles = await Promise.all(
      PACK_FILES.map(async (packName) => {
        const found = rootDir.children.get(lower(packName));
        if (found === undefined || found.dir !== undefined) {
          throw new UserError(
            `${resolved} has no ${packName}: is this the FlyFF client folder? (set --client or FLYFF_CLIENT)`,
          );
        }
        const file = path.join(resolved, found.name);
        const buf = await fs.readFile(file);
        return { file, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
      }),
    );
    return new ClientFs(resolved, ResPacks.fromBuffers(packFiles), rootDir);
  }

  /** The folder `relDir` names (any case, `/` or `\` separators, "" for the client folder), or undefined. */
  private dirAt(relDir: string): Dir | undefined {
    let dir: Dir | undefined = this.rootDir;
    for (const segment of relDir.split(/[\\/]+/)) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') return undefined; // never leave the client folder
      dir = dir.children.get(lower(segment))?.dir;
      if (dir === undefined) return undefined;
    }
    return dir;
  }

  /**
   * The real path of the file or folder `name` inside `relDir` (relative to the client folder, case-insensitive),
   * or null when it is not there.
   */
  find(relDir: string, name: string): string | null {
    const dir = this.dirAt(relDir);
    const child = dir?.children.get(lower(name));
    return dir === undefined || child === undefined ? null : path.join(dir.path, child.name);
  }

  /**
   * Real paths of the files under `relDir` whose name matches `ext`, in name order with folders in place (depth
   * first). `ext` is tested against the file name only, so `/\.o3d$/i` means "ends in .o3d". A folder that is not
   * there lists nothing.
   */
  list(relDir: string, ext: RegExp, recursive = false): string[] {
    const start = this.dirAt(relDir);
    if (start === undefined) return [];
    const pattern = new RegExp(ext.source, ext.flags.replace(/[gy]/g, '')); // a g or y flag would make test() stateful
    const found: string[] = [];
    const walk = (dir: Dir): void => {
      for (const child of dir.children.values()) {
        if (child.dir === undefined) {
          if (pattern.test(child.name)) found.push(path.join(dir.path, child.name));
        } else if (recursive) {
          walk(child.dir);
        }
      }
    };
    walk(start);
    return found;
  }
}
