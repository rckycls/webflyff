import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetIndex } from '@flyffweb/formats';
import { AssetWriter, NameCollisionError } from '../src/output/AssetWriter';

let outDir: string;

beforeEach(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flyffweb-writer-'));
});

afterEach(async () => {
  await fs.rm(outDir, { recursive: true, force: true });
});

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

async function filesUnder(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir, { recursive: true });
  return names.map((n) => n.replaceAll('\\', '/')).sort();
}

describe('AssetWriter', () => {
  it('names the file after the first 10 hex digits of its sha256 and returns that path', async () => {
    const writer = new AssetWriter(outDir);
    const hashed = await writer.write('models/part_x.glb', new Uint8Array([1, 2, 3]), 'Part_X.o3d');
    // sha256(010203) = 039058c6f2c0cb49...
    expect(hashed).toBe('models/part_x.039058c6f2.glb');
    expect(writer.pathOf('models/part_x.glb')).toBe(hashed);
    expect(new Uint8Array(await fs.readFile(path.join(outDir, 'models', 'part_x.039058c6f2.glb')))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('puts the hash before the last extension only, and after the stem when there is none', async () => {
    const writer = new AssetWriter(outDir);
    expect(await writer.write('a/b.c.glb', new Uint8Array([1, 2, 3]))).toBe('a/b.c.039058c6f2.glb');
    expect(await writer.write('top.json', new Uint8Array([1, 2, 3]))).toBe('top.039058c6f2.json');
    expect(await writer.write('plain', new Uint8Array([1, 2, 3]))).toBe('plain.039058c6f2');
  });

  it('is atomic: when the rename fails nothing is left at the final path and the temp file is removed', async () => {
    const failing = {
      ...fs,
      rename: async () => {
        throw new Error('disk on fire');
      },
    } as unknown as typeof fs;
    const writer = new AssetWriter(outDir, failing);

    await expect(writer.write('models/part_x.glb', new Uint8Array([1, 2, 3]), 'Part_X.o3d')).rejects.toThrow(
      'disk on fire',
    );

    expect(await exists(path.join(outDir, 'models', 'part_x.039058c6f2.glb'))).toBe(false);
    expect(await filesUnder(outDir)).toEqual(['models']); // no part_x...glb.tmp left behind
    expect(writer.pathOf('models/part_x.glb')).toBeUndefined();
  });

  it('writes through a temp name next to the final file', async () => {
    const renames: [string, string][] = [];
    const spy = {
      ...fs,
      rename: async (from: string, to: string) => {
        renames.push([from, to]);
        await fs.rename(from, to);
      },
    } as unknown as typeof fs;
    await new AssetWriter(outDir, spy).write('models/part_x.glb', new Uint8Array([1, 2, 3]));
    const final = path.join(outDir, 'models', 'part_x.039058c6f2.glb');
    expect(renames).toEqual([[`${final}.tmp`, final]]);
  });

  it('rejects two sources that map to the same logical key, naming both', async () => {
    const writer = new AssetWriter(outDir);
    await writer.write('models/obj_-a.glb', new Uint8Array([1]), 'Obj_ A.o3d');
    const error = await writer.write('models/obj_-a.glb', new Uint8Array([2]), 'Obj_-A.o3d').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NameCollisionError);
    const message = (error as NameCollisionError).message;
    expect(message).toContain('Obj_ A.o3d');
    expect(message).toContain('Obj_-A.o3d');
    expect(message).toContain('models/obj_-a.glb');
    // The first write is untouched.
    expect(writer.pathOf('models/obj_-a.glb')).toMatch(/^models\/obj_-a\.[0-9a-f]{10}\.glb$/);
  });

  it('catches a collision between two writes that are in flight at the same time', async () => {
    const writer = new AssetWriter(outDir);
    const results = await Promise.allSettled([
      writer.write('models/obj_-a.glb', new Uint8Array([1]), 'Obj_ A.o3d'),
      writer.write('models/obj_-a.glb', new Uint8Array([2]), 'Obj_-A.o3d'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(NameCollisionError);
  });

  it('lets the same source write its key again; the newest content wins', async () => {
    const writer = new AssetWriter(outDir);
    await writer.write('models/a.glb', new Uint8Array([1]), 'A.o3d');
    const second = await writer.write('models/a.glb', new Uint8Array([2]), 'A.o3d');
    expect(writer.pathOf('models/a.glb')).toBe(second);
  });

  it('frees the key again when its first write failed', async () => {
    let fail = true;
    const flaky = {
      ...fs,
      rename: async (from: string, to: string) => {
        if (fail) throw new Error('first try fails');
        await fs.rename(from, to);
      },
    } as unknown as typeof fs;
    const writer = new AssetWriter(outDir, flaky);
    await expect(writer.write('models/a.glb', new Uint8Array([1]), 'A.o3d')).rejects.toThrow('first try fails');
    fail = false;
    await expect(writer.write('models/a.glb', new Uint8Array([1]), 'Other.o3d')).resolves.toMatch(/^models\/a\./);
  });

  it.each(['', '/models/a.glb', 'models\\a.glb', 'models/../a.glb', 'models//a.glb', './a.glb', 'models/'])(
    'rejects the logical key %j',
    async (key) => {
      await expect(new AssetWriter(outDir).write(key, new Uint8Array([1]))).rejects.toThrow(/logical key/);
    },
  );

  it('finish() writes index.json with every logical key mapped to its hashed path, sorted by key', async () => {
    const writer = new AssetWriter(outDir);
    await writer.write('textures/b.png', new Uint8Array([2]), 'B.dds');
    await writer.write('models/a.glb', new Uint8Array([1]), 'A.o3d');
    await writer.finish();

    const index = JSON.parse(await fs.readFile(path.join(outDir, 'index.json'), 'utf8')) as AssetIndex;
    expect(index.version).toBe(1);
    expect(Object.keys(index.files)).toEqual(['models/a.glb', 'textures/b.png']);
    expect(index.files['models/a.glb']).toBe(writer.pathOf('models/a.glb'));
    expect(index.files['textures/b.png']).toBe(writer.pathOf('textures/b.png'));
    expect(await exists(path.join(outDir, 'index.json.tmp'))).toBe(false);
  });

  it('finish() with nothing written still creates the output folder and an empty index', async () => {
    const nested = path.join(outDir, 'not', 'yet');
    await new AssetWriter(nested).finish();
    const index = JSON.parse(await fs.readFile(path.join(nested, 'index.json'), 'utf8')) as AssetIndex;
    expect(index).toEqual({ version: 1, files: {} });
  });

  it('pathOf returns undefined for a key that was never written', () => {
    expect(new AssetWriter(outDir).pathOf('models/nope.glb')).toBeUndefined();
  });
});

describe('AssetWriter.finish merges into an existing index.json', () => {
  async function readIndex(): Promise<AssetIndex> {
    return JSON.parse(await fs.readFile(path.join(outDir, 'index.json'), 'utf8')) as AssetIndex;
  }

  /** One converter run: a new writer on the same folder writes `entries` and finishes. */
  async function runOnce(
    entries: Record<string, number[]>,
    warn: (message: string) => void = () => {},
  ): Promise<Record<string, string>> {
    const writer = new AssetWriter(outDir, undefined, warn);
    const hashed: Record<string, string> = {};
    for (const [key, bytes] of Object.entries(entries)) hashed[key] = await writer.write(key, new Uint8Array(bytes), key);
    await writer.finish();
    return hashed;
  }

  it('keeps the keys of an earlier run that this run did not write', async () => {
    const first = await runOnce({ 'models/a.glb': [1], 'textures/b.png': [2] });
    const second = await runOnce({ 'worlds/c.bin': [3] });

    const index = await readIndex();
    expect(index.version).toBe(1);
    expect(index.files).toEqual({
      'models/a.glb': first['models/a.glb'],
      'textures/b.png': first['textures/b.png'],
      'worlds/c.bin': second['worlds/c.bin'],
    });
    expect(Object.keys(index.files)).toEqual(['models/a.glb', 'textures/b.png', 'worlds/c.bin']);
  });

  it('replaces the entry of a key this run wrote again, and keeps the others', async () => {
    const first = await runOnce({ 'models/a.glb': [1], 'textures/b.png': [2] });
    const second = await runOnce({ 'models/a.glb': [9, 9] });

    expect(second['models/a.glb']).not.toBe(first['models/a.glb']);
    expect((await readIndex()).files).toEqual({
      'models/a.glb': second['models/a.glb'],
      'textures/b.png': first['textures/b.png'],
    });
  });

  it('drops an entry whose hashed file was deleted between the runs', async () => {
    const first = await runOnce({ 'models/a.glb': [1], 'textures/b.png': [2] });
    await fs.rm(path.join(outDir, ...first['textures/b.png']!.split('/')));
    const second = await runOnce({ 'worlds/c.bin': [3] });

    expect((await readIndex()).files).toEqual({
      'models/a.glb': first['models/a.glb'],
      'worlds/c.bin': second['worlds/c.bin'],
    });
  });

  it.each([
    ['text that is not JSON', 'this is { not json'],
    ['JSON of the wrong shape', JSON.stringify(['models/a.glb'])],
    ['an index of another version', JSON.stringify({ version: 2, files: { 'models/a.glb': 'models/a.0123456789.glb' } })],
    ['an index whose files are not a map', JSON.stringify({ version: 1, files: 'nope' })],
  ])('treats %s as empty, warns, and writes a fresh index', async (_name, content) => {
    await fs.writeFile(path.join(outDir, 'index.json'), content);
    const warnings: string[] = [];
    const second = await runOnce({ 'worlds/c.bin': [3] }, (m) => warnings.push(m));

    expect((await readIndex()).files).toEqual({ 'worlds/c.bin': second['worlds/c.bin'] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('index.json');
  });

  it('does not warn when there is no index.json yet', async () => {
    const warnings: string[] = [];
    await runOnce({ 'worlds/c.bin': [3] }, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
  });

  it('drops an entry that is not a hashed path inside the output folder', async () => {
    const kept = await runOnce({ 'models/a.glb': [1] });
    const index = await readIndex();
    index.files['evil'] = '../outside.bin';
    index.files['absolute'] = path.join(outDir, 'models', ...kept['models/a.glb']!.split('/').slice(1));
    index.files['number'] = 5 as unknown as string;
    await fs.writeFile(path.join(outDir, 'index.json'), JSON.stringify(index));

    await runOnce({ 'worlds/c.bin': [3] });
    expect(Object.keys((await readIndex()).files)).toEqual(['models/a.glb', 'worlds/c.bin']);
  });

  it('writes the merged index atomically: a failed rename leaves the old index.json as it was', async () => {
    const first = await runOnce({ 'models/a.glb': [1] });
    const before = await fs.readFile(path.join(outDir, 'index.json'), 'utf8');
    const failing = {
      ...fs,
      rename: async () => {
        throw new Error('disk on fire');
      },
    } as unknown as typeof fs;
    const writer = new AssetWriter(outDir, failing);
    await expect(writer.finish()).rejects.toThrow('disk on fire');

    expect(await fs.readFile(path.join(outDir, 'index.json'), 'utf8')).toBe(before);
    expect(JSON.parse(before).files).toEqual({ 'models/a.glb': first['models/a.glb'] });
    expect(await exists(path.join(outDir, 'index.json.tmp'))).toBe(false);
  });
});
