import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

export type FsPromises = typeof fsPromises;

/**
 * Writes `data` to `finalPath` through `<finalPath>.tmp` and a rename, creating the folder first. If anything fails,
 * the temp file is removed and the error is rethrown; `finalPath` is either the complete new file or untouched.
 */
export async function writeAtomic(fs: FsPromises, finalPath: string, data: Uint8Array | string): Promise<void> {
  const tempPath = `${finalPath}.tmp`;
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  try {
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, finalPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}
