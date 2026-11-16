// Where Support / VIP keeps its pictures: web.config.json's `vip.uploadsDir` (C:\flyff-web\vip-uploads on the VPS), outside
// every folder Caddy serves, in `receipts\` and `qr\`. Each file gets a random name (32 hex digits and its type), and only
// a name of that shape is ever read or deleted, so no name from a request or the database can reach another file.

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_MIME } from './images';
import type { ImageType } from './images';

export type VipFileKind = 'receipts' | 'qr';

const NAME = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

export function isVipFileName(name: string): boolean {
  return NAME.test(name);
}

export class VipFiles {
  /** Makes the two folders when they are missing (throws when it cannot). */
  constructor(private readonly dir: string) {
    for (const kind of ['receipts', 'qr'] as const) mkdirSync(path.join(dir, kind), { recursive: true });
  }

  /** Writes a new file and gives its name. */
  async save(kind: VipFileKind, bytes: Uint8Array, type: ImageType): Promise<string> {
    const name = `${randomBytes(16).toString('hex')}.${type}`;
    await writeFile(path.join(this.dir, kind, name), bytes, { flag: 'wx' });
    return name;
  }

  /** The file and its type, or `undefined` when the name is not one of ours or the file is gone. */
  async read(kind: VipFileKind, name: string): Promise<{ bytes: Buffer; mime: string } | undefined> {
    if (!isVipFileName(name)) return undefined;
    try {
      const bytes = await readFile(path.join(this.dir, kind, name));
      return { bytes, mime: IMAGE_MIME[name.slice(name.lastIndexOf('.') + 1) as ImageType] };
    } catch {
      return undefined;
    }
  }

  /** Deletes a file; a missing one is no problem. */
  async remove(kind: VipFileKind, name: string): Promise<void> {
    if (!isVipFileName(name)) return;
    await unlink(path.join(this.dir, kind, name)).catch(() => undefined);
  }
}
