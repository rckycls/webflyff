import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { MAX_LAYER, OT, cleanHeight, landFileName, objectLocalMatrix, readDyo, readLnd } from '../../src/index';
import type { LandTile, WorldObjectRecord } from '../../src/index';
import { clientRoot, describeClient, forEachClientFile } from '../helpers/client';

function tileBytes(world: string, file: string): Uint8Array {
  const buf = readFileSync(path.join(clientRoot()!, 'World', world, file));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function readMadrigalTile(x: number, y: number): LandTile {
  const file = landFileName('WdMadrigal', x, y);
  return readLnd(tileBytes('WdMadrigal', file), file);
}

/** A short list for a failure message: the first `limit` entries, then how many more there are. */
function summarize(items: string[], limit = 12): string {
  const shown = items.slice(0, limit).join('; ');
  return items.length > limit ? `${shown}; ... (${items.length - limit} more)` : shown;
}

const worldOf = (file: string): string => path.basename(path.dirname(file));

/** What the whole-corpus checks need from every tile; the tiles themselves are not kept (about 2,300 of them). */
interface Scan {
  count: number;
  failures: { path: string; error: unknown }[];
  versions: Map<number, number>;
  /** Heights that are not finite, or not in [-1000, 1000) once cleanHeight has stripped the flag. */
  heightOffenders: string[];
  minHeight: number;
  maxHeight: number;
  objectCount: number;
  sfxObjectCount: number;
  /** Objects (not SFX objects) whose `index` is not above 0. */
  zeroIndex: string[];
  /** Objects that are not a plain OT_OBJ with its type equal to objType, or SFX objects that are not OT_SFX. */
  unusualObjects: string[];
  /** Tiles whose layers repeat a texture id (the C++ would merge them into one layer). */
  repeatedLayerTexture: string[];
  /** Tiles whose own x, y differ from the ones in their file name. */
  ownCoordinatesDiffer: string[];
  mostLayers: number;
}

let scan: Scan | undefined;

function scanTiles(): Scan {
  if (scan) return scan;
  const s: Scan = {
    count: 0,
    failures: [],
    versions: new Map(),
    heightOffenders: [],
    minHeight: Infinity,
    maxHeight: -Infinity,
    objectCount: 0,
    sfxObjectCount: 0,
    zeroIndex: [],
    unusualObjects: [],
    repeatedLayerTexture: [],
    ownCoordinatesDiffer: [],
    mostLayers: 0,
  };
  const result = forEachClientFile(
    'World',
    /\.lnd$/i,
    (bytes, file) => {
      const tile = readLnd(bytes, file);
      const name = `${worldOf(file)}/${path.basename(file)}`;
      s.versions.set(tile.version, (s.versions.get(tile.version) ?? 0) + 1);

      let offenders = 0;
      for (const h of tile.heights) {
        const clean = cleanHeight(h);
        if (!(clean >= -1000 && clean < 1000)) offenders++; // false for NaN too
        else {
          s.minHeight = Math.min(s.minHeight, clean);
          s.maxHeight = Math.max(s.maxHeight, clean);
        }
      }
      if (offenders > 0) s.heightOffenders.push(`${name}: ${offenders} heights`);

      // %02d-%02d: the two digits either side of the dash (a world name can end in digits, as WdEvent01 does)
      const coordinates = /(\d\d)-(\d\d)\.lnd$/i.exec(file)!;
      if (tile.x !== Number(coordinates[1]) || tile.y !== Number(coordinates[2])) {
        s.ownCoordinatesDiffer.push(`${name} (own ${tile.x},${tile.y})`);
      }
      const textures = tile.layers.map((l) => l.textureId);
      if (new Set(textures).size !== textures.length) s.repeatedLayerTexture.push(name);
      s.mostLayers = Math.max(s.mostLayers, tile.layers.length);

      for (const o of tile.objects) {
        s.objectCount++;
        if (!(o.index > 0)) s.zeroIndex.push(`${name}: objType ${o.objType} index ${o.index}`);
        if (o.objType !== OT.OBJ || o.type !== o.objType || o.extraBytes !== 0) {
          s.unusualObjects.push(`${name}: objType ${o.objType} type ${o.type} extra ${o.extraBytes}`);
        }
      }
      for (const o of tile.sfxObjects) {
        s.sfxObjectCount++;
        if (o.objType !== OT.SFX || o.type !== o.objType || o.extraBytes !== 0) {
          s.unusualObjects.push(`${name}: sfx objType ${o.objType} type ${o.type} extra ${o.extraBytes}`);
        }
      }
    },
    { recursive: true },
  );
  s.count = result.count;
  s.failures = result.failures;
  scan = s;
  return s;
}

const failureText = (failures: Scan['failures']): string =>
  summarize(failures.map((f) => `${f.path}: ${f.error instanceof Error ? f.error.message : String(f.error)}`), 5);

describeClient('terrain tiles, object records and dyo', () => {
  it('reads WdMadrigal00-00.lnd', () => {
    const tile = readMadrigalTile(0, 0);
    expect(tile.heights.length).toBe(16641);
    expect(tile.layers.length).toBeGreaterThan(0);
    expect(tile.layers.length).toBeLessThanOrEqual(MAX_LAYER);
    for (const layer of tile.layers) {
      expect(layer.lightMap.length).toBe(16384);
      expect(layer.patchEnable.length).toBe(256);
    }
    expect(tile.water.length).toBe(512);
    expect(tile.landAttr.length).toBe(256);
    expect([tile.x, tile.y]).toEqual([0, 0]);
  });

  it('landFileName names the 900 tiles of Madrigal (a 30 x 30 world) and nothing else', () => {
    const missing: string[] = [];
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const name = landFileName('WdMadrigal', x, y);
        if (!existsSync(path.join(clientRoot()!, 'World', 'WdMadrigal', name))) missing.push(name);
      }
    }
    expect(missing).toEqual([]);
    const result = forEachClientFile('World/WdMadrigal', /\.lnd$/i, () => {});
    expect(result.count).toBe(900);
  });

  it('every .lnd in every world folder reads to its last byte', () => {
    const s = scanTiles();
    expect(s.count).toBeGreaterThanOrEqual(900);
    expect(failureText(s.failures)).toBe('');
    expect(s.failures).toHaveLength(0);
    // Only versions 2 and 3 are shipped; the version 0 and 1 branches are exercised by lnd.test.ts only.
    expect([...s.versions.keys()].sort()).toEqual([2, 3]);
  });

  it('after cleanHeight every height is finite and in [-1000, 1000)', () => {
    const s = scanTiles();
    expect(summarize(s.heightOffenders)).toBe('');
    expect(s.minHeight).toBeGreaterThanOrEqual(-1000);
    expect(s.maxHeight).toBeLessThan(1000);
  });

  it('every object has index > 0', () => {
    const s = scanTiles();
    expect(s.objectCount).toBeGreaterThan(100000);
    expect(summarize(s.zeroIndex)).toBe('');
  });

  it('tiles hold plain OT_OBJ objects (no mover or control records) and their SFX objects are all OT_SFX', () => {
    const s = scanTiles();
    expect(s.sfxObjectCount).toBeGreaterThan(0);
    expect(summarize(s.unusualObjects)).toBe('');
  });

  it('no tile repeats a texture id among its layers, which NewLayer would merge', () => {
    expect(summarize(scanTiles().repeatedLayerTexture)).toBe('');
  });

  it('some tiles carry more than MAX_LAYER layers, so 20 is not a limit of the format', () => {
    // landscape.h defines MAX_LAYER but nothing in the C++ uses it; seven shipped tiles have 21 to 33 layers.
    expect(scanTiles().mostLayers).toBeGreaterThan(MAX_LAYER);
  });

  it("a tile's own x and y are not reliable: they differ from the file name in WdEvent01 and WdLux only", () => {
    // LoadLandscape reads xLand and yLand into locals and never uses them; the tile's place comes from the name.
    const differing = scanTiles().ownCoordinatesDiffer;
    expect(differing).toHaveLength(36);
    expect(differing.every((d) => d.startsWith('WdEvent01/') || d.startsWith('WdLux/'))).toBe(true);
  });

  it('every .dyo reads to its last byte', () => {
    const records: WorldObjectRecord[] = [];
    const { count, failures } = forEachClientFile(
      'World',
      /\.dyo$/i,
      (bytes, file) => {
        records.push(...readDyo(bytes, file));
      },
      { recursive: true },
    );
    expect(failureText(failures)).toBe('');
    expect(failures).toHaveLength(0);
    expect(count).toBe(35);
    expect(records.length).toBeGreaterThan(0);
    expect(records.filter((r) => !(r.index > 0))).toEqual([]);
  });

  it('WdMadrigal.dyo holds 212 movers and one control', () => {
    const records = readDyo(tileBytes('WdMadrigal', 'WdMadrigal.dyo'), 'WdMadrigal.dyo');
    expect(records).toHaveLength(213);
    expect(records.filter((r) => r.objType === OT.MOVER)).toHaveLength(212);
    expect(records.filter((r) => r.objType === OT.CTRL)).toHaveLength(1);
    // a mover record is 64 + 136 bytes; a control record 64 + 4 + 432
    expect(new Set(records.map((r) => `${r.objType}:${r.extraBytes}`))).toEqual(new Set(['5:136', '2:436']));
  });

  it('WdMadrigal01-04.lnd summary', () => {
    const tile = readMadrigalTile(1, 4);
    const heights = Array.from(tile.heights, cleanHeight);
    expect({
      version: tile.version,
      x: tile.x,
      y: tile.y,
      minHeight: Math.min(...heights),
      maxHeight: Math.max(...heights),
      layerTextureIds: tile.layers.map((l) => l.textureId),
      objectCount: tile.objects.length,
      firstObject: tile.objects[0] ?? null,
    }).toMatchSnapshot();
  });

  it('WdMadrigal12-12.lnd summary (a tile with objects and SFX objects)', () => {
    const tile = readMadrigalTile(12, 12);
    const first = tile.objects[0];
    expect({
      version: tile.version,
      x: tile.x,
      y: tile.y,
      layerTextureIds: tile.layers.map((l) => l.textureId),
      enabledPatchesPerLayer: tile.layers.map((l) => l.patchEnable.reduce((n, v) => n + v, 0)),
      objectCount: tile.objects.length,
      sfxObjectCount: tile.sfxObjects.length,
      firstObject: first,
      firstObjectMatrix: Array.from(objectLocalMatrix(first), (v) => Number(v.toFixed(4))),
      firstSfxObject: tile.sfxObjects[0],
    }).toMatchSnapshot();
  });
});
