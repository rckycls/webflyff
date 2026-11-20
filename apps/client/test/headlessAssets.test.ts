// The headless pieces the live tests and the town bots share (src/headless): the disk assets read from a folder the
// caller names, and a new character with its own look.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiskAssets } from '../src/headless/diskAssets';
import { newCharacter } from '../src/headless/lobby';

describe('DiskAssets.open(dir)', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('reads the index of the folder it is given', () => {
    dir = mkdtempSync(join(tmpdir(), 'assets-'));
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ version: 1, files: { 'data/movers.json': 'data/movers.abc.json', 'a/b.glb': 'a/b.1.glb' } }));
    const assets = DiskAssets.open(dir);
    expect(assets.has('data/movers.json')).toBe(true);
    expect(assets.has('data/items.json')).toBe(false);
    expect(assets.url('data/movers.json')).toBe(join(dir, 'data/movers.abc.json'));
    expect(assets.url('data/items.json')).toBeNull();
  });

  it('says index.json is missing when the folder has none', () => {
    dir = mkdtempSync(join(tmpdir(), 'assets-'));
    expect(() => DiskAssets.open(dir)).toThrow(/index\.json/);
  });
});

describe('newCharacter', () => {
  it('keeps the name, the sex and the look it is given', () => {
    const made = newCharacter(0, 'abCd', '1234', { sex: 1, hair: 2, face: 3 });
    expect(made.name).toBe('abCd');
    expect(made.sex).toBe(1);
    expect(made.hairMesh).toBe(2);
    expect(made.headMesh).toBe(3);
    expect(made.slot).toBe(0);
  });
});
