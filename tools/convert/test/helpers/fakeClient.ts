import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPack } from '../../../../packages/formats/test/helpers/packs';
import type { TestFile } from '../../../../packages/formats/test/helpers/packs';

export interface FakeClientSpec {
  /** Files packed into data.res (the other two packs are empty). */
  packed?: TestFile[];
  /** Loose files by path relative to the client root (forward slashes). */
  loose?: Record<string, string | Uint8Array>;
}

/** A fresh temp folder; the caller removes it. */
export function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Lays out a small client folder: the three `.res` packs plus loose files. */
export async function writeFakeClient(root: string, spec: FakeClientSpec = {}): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  const pack = (files: TestFile[]): Uint8Array => buildPack({ key: 0x5a, encrypted: true, files });
  await fs.writeFile(path.join(root, 'data.res'), pack(spec.packed ?? []));
  await fs.writeFile(path.join(root, 'dataSub1.res'), pack([]));
  await fs.writeFile(path.join(root, 'dataSub2.res'), pack([]));
  for (const [rel, content] of Object.entries(spec.loose ?? {})) {
    const file = path.join(root, ...rel.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
}
