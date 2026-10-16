import path from 'node:path';
import { expect, it } from 'vitest';
import { decodeImage, readDds } from '../../src/index';
import type { RgbaImage } from '../../src/index';
import { describeClient, forEachClientFile } from '../helpers/client';

const DIRS = ['Model/TextureMid', 'World/TextureMid'];

const bump = (counts: Map<string, number>, key: string): void => void counts.set(key, (counts.get(key) ?? 0) + 1);
const histogram = (counts: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** A short list for a failure message: the first `limit` entries, then how many more there are. */
function summarize(items: string[], limit = 12): string {
  const shown = items.slice(0, limit).join('; ');
  return items.length > limit ? `${shown}; ... (${items.length - limit} more)` : shown;
}

const label = (file: string): string => `${path.basename(path.dirname(path.dirname(file)))}/${path.basename(file)}`;

/** What the whole-corpus checks need from every texture of one extension; the images themselves are not kept. */
interface Scan {
  count: number;
  failures: { path: string; error: unknown }[];
  /** Images without a positive size, or whose data is not width * height * 4 bytes. */
  badImages: string[];
  /** Images in which no pixel is anywhere near opaque (all alpha under 8): a few are real, many would be a decoding mistake. */
  invisible: string[];
  largest: string;
  /** Header facts, counted from the bytes, so they hold for files that fail to decode too. */
  facts: Map<string, number>;
}

const scans = new Map<string, Scan>();

function checkImage(scan: Scan, file: string, image: RgbaImage): void {
  if (!(image.width > 0 && image.height > 0 && image.data.length === image.width * image.height * 4)) {
    scan.badImages.push(`${label(file)}: ${image.width}x${image.height}, ${image.data.length} bytes`);
    return;
  }
  let opaque = false;
  for (let i = 3; i < image.data.length && !opaque; i += 4) opaque = image.data[i] >= 8;
  if (!opaque) scan.invisible.push(label(file));
  const [w, h] = scan.largest.split('x').map(Number);
  if (image.width * image.height > w * h) scan.largest = `${image.width}x${image.height}`;
}

/** Decodes every file of `ext` in both texture folders. `facts` names what to count from a file's bytes. */
function scanTextures(ext: 'dds' | 'tga' | 'bmp'): Scan {
  const cached = scans.get(ext);
  if (cached) return cached;
  const scan: Scan = { count: 0, failures: [], badImages: [], invisible: [], largest: '0x0', facts: new Map() };
  for (const dir of DIRS) {
    const result = forEachClientFile(dir, new RegExp(`\\.${ext}$`, 'i'), (bytes, file) => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (ext === 'dds') {
        const caps2 = view.getUint32(112, true);
        if (caps2 & 0x200) bump(scan.facts, 'cube map');
        if (caps2 & 0x200000) bump(scan.facts, 'volume');
        const dds = readDds(bytes, file);
        bump(scan.facts, `format ${dds.format}`);
        bump(scan.facts, `mips ${dds.mipCount}`);
        checkImage(scan, file, dds.image);
      } else {
        if (ext === 'tga') bump(scan.facts, `type ${bytes[2]}, ${bytes[16]}-bit, descriptor 0x${bytes[17].toString(16)}`);
        else bump(scan.facts, `${view.getUint16(28, true)}-bit, compression ${view.getUint32(30, true)}`);
        checkImage(scan, file, decodeImage(bytes, file));
      }
    });
    scan.count += result.count;
    scan.failures.push(...result.failures);
  }
  scans.set(ext, scan);
  return scan;
}

const failureList = (scan: Scan): string[] => scan.failures.map((f) => `${label(f.path)}: ${String(f.error)}`);

describeClient('textures (.dds, .tga, .bmp)', () => {
  it('every .dds under TextureMid decodes to its last byte, with a size and pixels', () => {
    const scan = scanTextures('dds');
    expect(scan.count).toBe(5637);
    expect(summarize(failureList(scan))).toBe('');
    expect(summarize(scan.badImages)).toBe('');
  });

  it('every .tga under TextureMid decodes to its last byte, with a size and pixels', () => {
    const scan = scanTextures('tga');
    expect(scan.count).toBe(21);
    expect(summarize(failureList(scan))).toBe('');
    expect(summarize(scan.badImages)).toBe('');
  });

  it('every .bmp under TextureMid decodes to its last byte, with a size and pixels', () => {
    const scan = scanTextures('bmp');
    expect(scan.count).toBe(16);
    expect(summarize(failureList(scan))).toBe('');
    expect(summarize(scan.badImages)).toBe('');
  });

  it('only one texture comes out fully transparent, and that is what its file stores', () => {
    // Obj_MaSuPrWarp-02.dds is 32x16 DXT1 whose every block has color0 = 0, color1 = 1 and all indices 3, which is
    // transparent black in DXT1's three-colour mode. Any more would point at a decoding mistake.
    expect(scanTextures('dds').invisible).toEqual(['Model/Obj_MaSuPrWarp-02.dds']);
    expect(scanTextures('tga').invisible).toEqual([]);
  });

  it('decodeImage reads a real file of each extension by its name', () => {
    for (const [name, width] of [
      ['ARROW1.dds', 64],
      ['red.tga', 128],
    ] as const) {
      const regex = new RegExp(`^${name.replace('.', '\\.')}$`, 'i');
      const result = forEachClientFile('Model/TextureMid', regex, (bytes, file) => {
        expect(decodeImage(bytes, file).width).toBe(width);
      });
      expect(result.count, name).toBe(1);
      expect(result.failures, name).toEqual([]);
    }
  });

  it('scan summary', () => {
    expect({
      dds: { files: scanTextures('dds').count, largest: scanTextures('dds').largest, facts: histogram(scanTextures('dds').facts) },
      tga: { files: scanTextures('tga').count, largest: scanTextures('tga').largest, facts: histogram(scanTextures('tga').facts) },
      bmp: { files: scanTextures('bmp').count, facts: histogram(scanTextures('bmp').facts) },
    }).toMatchSnapshot();
  });
});
