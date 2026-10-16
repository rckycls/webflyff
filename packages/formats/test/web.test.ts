import { Matrix4, Quaternion } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  argbToRgba,
  decodeTileBin,
  encodeTileBin,
  flipWinding,
  objectLocalMatrix,
  toWebMatrix,
  toWebPosition,
  toWebQuaternion,
  webName,
} from '../src/index';
import type { AssetIndex, Vec3, WebTile, WebTileLayer, WebTileObject, WorldManifest, WorldObjectRecord } from '../src/index';
import { thrown } from './helpers/thrown';

// ---- handedness ---------------------------------------------------------------------------------------------

/** D3DXMatrixRotationY in D3DXMATRIX memory order (_11.._44): row-vector convention, left-handed. */
function d3dRotationY(radians: number): Float32Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  // prettier-ignore
  return Float32Array.from([
     c, 0, -s, 0,
     0, 1,  0, 0,
     s, 0,  c, 0,
     0, 0,  0, 1,
  ]);
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, digits = 6): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i], `element ${i}`).toBeCloseTo(expected[i]!, digits);
  }
}

/** The D3D way: a row vector (x, y, z, 1) times a matrix stored _11.._44. */
function transformRowVector(m: Float32Array, p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    x * m[0]! + y * m[4]! + z * m[8]! + m[12]!,
    x * m[1]! + y * m[5]! + z * m[9]! + m[13]!,
    x * m[2]! + y * m[6]! + z * m[10]! + m[14]!,
  ];
}

/** The three.js / glTF way: a column vector times a column-major matrix. */
function transformColumnVector(m: Float32Array, p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

describe('toWebPosition', () => {
  it('negates z only', () => {
    expect(toWebPosition([1, 2, 3])).toEqual([1, 2, -3]);
    expect(toWebPosition([-4, 0.5, -6])).toEqual([-4, 0.5, 6]);
  });

  it('returns a new array and never yields negative zero', () => {
    const v: Vec3 = [1, 2, 0];
    const out = toWebPosition(v);
    expect(out).not.toBe(v);
    expect(v).toEqual([1, 2, 0]);
    expect(Object.is(out[2], 0)).toBe(true);
    expect(Object.is(toWebPosition([0, 0, -0])[2], 0)).toBe(true);
  });
});

describe('toWebMatrix', () => {
  it('negates the mirror entries', () => {
    const m = Float32Array.from({ length: 16 }, (_, i) => i + 1);
    const w = toWebMatrix(m);
    const mirrored = new Set([2, 6, 8, 9, 11, 14]);
    for (let i = 0; i < 16; i++) {
      expect(w[i], `element ${i}`).toBe(mirrored.has(i) ? -m[i]! : m[i]!);
    }
  });

  it('returns a new Float32Array and leaves the input alone', () => {
    const m = Float32Array.from({ length: 16 }, (_, i) => i + 1);
    const copy = Float32Array.from(m);
    const w = toWebMatrix(m);
    expect(w).toBeInstanceOf(Float32Array);
    expect(w).not.toBe(m);
    expect(m).toEqual(copy);
  });

  it('rejects anything that is not 16 elements', () => {
    expect(() => toWebMatrix(new Float32Array(15))).toThrow(RangeError);
    expect(() => toWebMatrix(new Float32Array(17))).toThrow(/16/);
  });

  it('rotation about Y flips sign', () => {
    const angle = Math.PI / 6;
    expectClose(toWebMatrix(d3dRotationY(angle)), d3dRotationY(-angle));
  });

  it('moves a point the same way the D3D matrix did, after the point is converted too', () => {
    const rec: WorldObjectRecord = {
      objType: 0,
      angle: 37,
      axis: [11, 0, -23],
      position: [120.5, 7.25, 64.75],
      scale: [1.5, 0.75, 2],
      type: 0,
      index: 0,
      motion: 0,
      ai: 0,
      ai2: 0,
      extraBytes: 0,
    };
    const d3d = objectLocalMatrix(rec);
    const web = toWebMatrix(d3d);
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [3.5, -2, 8],
    ];
    for (const p of points) {
      expectClose(transformColumnVector(web, toWebPosition(p)), toWebPosition(transformRowVector(d3d, p)), 4);
    }
  });
});

describe('toWebQuaternion', () => {
  it('gives [-x, -y, z, w]', () => {
    expect(toWebQuaternion([1, 2, 3, 4])).toEqual([-1, -2, 3, 4]);
  });

  it('matrix and quaternion conversions agree', () => {
    const [x, y, z, w] = [0.1, 0.2, 0.3, 0.9];
    const len = Math.hypot(x, y, z, w);
    const q: [number, number, number, number] = [x / len, y / len, z / len, w / len];

    const d3dStyle = new Matrix4().makeRotationFromQuaternion(new Quaternion(...q));
    const webQ = toWebQuaternion(q);
    const fromWebQuaternion = new Matrix4().makeRotationFromQuaternion(new Quaternion(...webQ));

    expectClose(fromWebQuaternion.elements, toWebMatrix(Float32Array.from(d3dStyle.elements)));
  });
});

describe('flipWinding', () => {
  it('swaps the second and third index of every triangle', () => {
    expect(flipWinding(Uint16Array.from([0, 1, 2, 3, 4, 5]))).toEqual(Uint16Array.from([0, 2, 1, 3, 5, 4]));
  });

  it('keeps the array type, works on a copy and handles Uint32Array', () => {
    const src = Uint32Array.from([70000, 70001, 70002]);
    const out = flipWinding(src);
    expect(out).toBeInstanceOf(Uint32Array);
    expect(out).not.toBe(src);
    expect(src).toEqual(Uint32Array.from([70000, 70001, 70002]));
    expect(out).toEqual(Uint32Array.from([70000, 70002, 70001]));
  });

  it('accepts an empty index list and rejects a partial triangle', () => {
    expect(flipWinding(new Uint16Array(0))).toEqual(new Uint16Array(0));
    expect(() => flipWinding(Uint16Array.from([0, 1, 2, 3]))).toThrow(RangeError);
  });

  it('keeps a triangle facing the same way: front stays front, back stays back', () => {
    // Same formula on both sides: the face normal (b-a)x(c-a) points at a camera that sees the face from the front.
    const facesCamera = (pos: Float32Array, idx: Uint16Array, cam: Vec3): boolean => {
      const p = (i: number): Vec3 => [pos[idx[i]! * 3]!, pos[idx[i]! * 3 + 1]!, pos[idx[i]! * 3 + 2]!];
      const [a, b, c] = [p(0), p(1), p(2)];
      const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      return n[0] * (cam[0] - a[0]) + n[1] * (cam[1] - a[1]) + n[2] * (cam[2] - a[2]) > 0;
    };
    const triangles: Vec3[][] = [
      [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[2, -1, 3], [4, 0.5, 1], [-1, 3, 2]],
      [[2, -1, 3], [-1, 3, 2], [4, 0.5, 1]],
    ];
    const cameras: Vec3[] = [[0, 0, -10], [0, 0, 10], [5, 7, -3], [-6, 2, 9]];
    let seenFront = false;
    let seenBack = false;
    for (const tri of triangles) {
      const idx = Uint16Array.from([0, 1, 2]);
      const d3dPos = Float32Array.from(tri.flat());
      const webPos = Float32Array.from(tri.flatMap((v) => toWebPosition(v)));
      for (const cam of cameras) {
        const before = facesCamera(d3dPos, idx, cam);
        const after = facesCamera(webPos, flipWinding(idx), toWebPosition(cam));
        expect(after).toBe(before);
        if (before) seenFront = true;
        else seenBack = true;
      }
    }
    expect(seenFront && seenBack).toBe(true);
  });
});

// ---- naming -------------------------------------------------------------------------------------------------

describe('webName', () => {
  it('lowercases and replaces everything outside [a-z0-9._-] with a dash', () => {
    expect(webName('Obj_ AzriaThicket01')).toBe('obj_-azriathicket01');
    expect(webName('Part_maleHair02')).toBe('part_malehair02');
    expect(webName('mi_tex(1)/a+b.dds')).toBe('mi_tex-1--a-b.dds');
  });
});

// ---- light maps ---------------------------------------------------------------------------------------------

describe('argbToRgba', () => {
  it('turns an ARGB DWORD into [R, G, B, A]', () => {
    expect(argbToRgba(Uint32Array.from([0x80ff0000]))).toEqual(Uint8Array.from([255, 0, 0, 128]));
  });

  it('converts every texel, keeping the order', () => {
    const out = argbToRgba(Uint32Array.from([0x00112233, 0xff445566, 0x01020304]));
    expect(out).toEqual(Uint8Array.from([0x11, 0x22, 0x33, 0x00, 0x44, 0x55, 0x66, 0xff, 0x02, 0x03, 0x04, 0x01]));
  });

  it('gives an empty array for an empty light map', () => {
    expect(argbToRgba(new Uint32Array(0))).toEqual(new Uint8Array(0));
  });
});

// ---- tile binary --------------------------------------------------------------------------------------------

const HEIGHTS = 129 * 129;
const LIGHT_BYTES = 128 * 128 * 4;
const LAYER_BYTES = 2 + 256 + LIGHT_BYTES;
const OBJECT_BYTES = 2 + 64;

/** Byte length of a tile with these counts, written out the way the brief spells it (not via the code under test). */
function expectedLength(waterLen: number, layers: number, objects: number): number {
  return 4 + 2 + 2 + 2 + 66564 + 4 + waterLen + 256 + 1 + layers * (2 + 256 + 65536) + 4 + objects * (2 + 64);
}

function fill(n: number, seed: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7 + (i >> 8)) & 0xff);
}

function makeLayer(k: number): WebTileLayer {
  return { texture: 100 + k, patchEnable: Uint8Array.from({ length: 256 }, (_, i) => (i + k) & 1), light: fill(LIGHT_BYTES, k) };
}

function makeObject(k: number): WebTileObject {
  return { model: 10 + k, matrix: Float32Array.from({ length: 16 }, (_, i) => (k + 1) * 0.5 + i * 0.125) };
}

function makeTile(layers: number, objects: number, waterLen = 512): WebTile {
  return {
    x: 7,
    y: 12,
    heights: Float32Array.from({ length: HEIGHTS }, (_, i) => i * 0.25 - 100),
    water: fill(waterLen, 3),
    landAttr: fill(256, 5),
    layers: Array.from({ length: layers }, (_, k) => makeLayer(k)),
    objects: Array.from({ length: objects }, (_, k) => makeObject(k)),
  };
}

/**
 * Same type and same bytes. vitest's `toEqual` walks typed arrays element by element, which takes seconds for the
 * millions of light-map bytes in a 33-layer tile.
 */
function expectSameBytes(actual: ArrayBufferView, expected: ArrayBufferView, what: string): void {
  expect(actual.constructor, `${what} type`).toBe(expected.constructor);
  const a = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
  const b = Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength);
  expect(a.equals(b), `${what} bytes`).toBe(true);
}

function expectSameTile(actual: WebTile, expected: WebTile): void {
  expect(actual.x).toBe(expected.x);
  expect(actual.y).toBe(expected.y);
  expectSameBytes(actual.heights, expected.heights, 'heights');
  expectSameBytes(actual.water, expected.water, 'water');
  expectSameBytes(actual.landAttr, expected.landAttr, 'landAttr');
  expect(actual.layers).toHaveLength(expected.layers.length);
  expected.layers.forEach((layer, i) => {
    expect(actual.layers[i]!.texture, `layer ${i} texture`).toBe(layer.texture);
    expectSameBytes(actual.layers[i]!.patchEnable, layer.patchEnable, `layer ${i} patchEnable`);
    expectSameBytes(actual.layers[i]!.light, layer.light, `layer ${i} light`);
  });
  expect(actual.objects).toHaveLength(expected.objects.length);
  expected.objects.forEach((object, i) => {
    expect(actual.objects[i]!.model, `object ${i} model`).toBe(object.model);
    expectSameBytes(actual.objects[i]!.matrix, object.matrix, `object ${i} matrix`);
  });
}

describe('tile binary format', () => {
  it('tile round trip', () => {
    const tile = makeTile(2, 3);
    const bytes = encodeTileBin(tile);
    expect(bytes.byteLength).toBe(4 + 2 + 2 + 2 + 66564 + 4 + 512 + 256 + 1 + 2 * (2 + 256 + 65536) + 4 + 3 * (2 + 64));
    expect(bytes.byteLength).toBe(expectedLength(512, 2, 3));
    expect(decodeTileBin(bytes)).toEqual(tile);
  });

  it('lays the fields out little-endian in the documented order', () => {
    const tile = makeTile(1, 1, 8);
    const bytes = encodeTileBin(tile);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('FWT1');
    expect(view.getUint16(4, true)).toBe(1);
    expect(view.getUint16(6, true)).toBe(7);
    expect(view.getUint16(8, true)).toBe(12);
    expect(view.getFloat32(10, true)).toBe(-100);
    expect(view.getFloat32(10 + 4 * (HEIGHTS - 1), true)).toBe((HEIGHTS - 1) * 0.25 - 100);
    const waterAt = 10 + 4 * HEIGHTS;
    expect(view.getUint32(waterAt, true)).toBe(8);
    expect(bytes.subarray(waterAt + 4, waterAt + 12)).toEqual(tile.water);
    const attrAt = waterAt + 4 + 8;
    expect(bytes.subarray(attrAt, attrAt + 256)).toEqual(tile.landAttr);
    const layerCountAt = attrAt + 256;
    expect(bytes[layerCountAt]).toBe(1);
    const layerAt = layerCountAt + 1;
    expect(view.getUint16(layerAt, true)).toBe(100);
    expect(bytes.subarray(layerAt + 2, layerAt + 258)).toEqual(tile.layers[0]!.patchEnable);
    expectSameBytes(bytes.subarray(layerAt + 258, layerAt + 258 + LIGHT_BYTES), tile.layers[0]!.light, 'light');
    const objectCountAt = layerAt + LAYER_BYTES;
    expect(view.getUint32(objectCountAt, true)).toBe(1);
    expect(view.getUint16(objectCountAt + 4, true)).toBe(10);
    for (let i = 0; i < 16; i++) {
      expect(view.getFloat32(objectCountAt + 6 + 4 * i, true)).toBe(tile.objects[0]!.matrix[i]);
    }
    expect(bytes.byteLength).toBe(objectCountAt + 4 + OBJECT_BYTES);
  });

  it('round-trips a tile with no layers, no objects and no water', () => {
    const tile = makeTile(0, 0, 0);
    const bytes = encodeTileBin(tile);
    expect(bytes.byteLength).toBe(expectedLength(0, 0, 0));
    expect(decodeTileBin(bytes)).toEqual(tile);
  });

  it('round-trips the 33 layers that real tiles carry (layerCount is a byte, MAX_LAYER is not a limit)', () => {
    const tile = makeTile(33, 1);
    const bytes = encodeTileBin(tile);
    expect(bytes.byteLength).toBe(expectedLength(512, 33, 1));
    const back = decodeTileBin(bytes);
    expect(back.layers).toHaveLength(33);
    expectSameTile(back, tile);
  });

  it('accepts 255 layers and rejects 256 with a clear error', () => {
    const layer = makeLayer(0);
    const tile = makeTile(0, 0);
    tile.layers = Array.from({ length: 255 }, () => layer);
    expect(encodeTileBin(tile).byteLength).toBe(expectedLength(512, 255, 0));
    tile.layers = Array.from({ length: 256 }, () => layer);
    expect(() => encodeTileBin(tile)).toThrow(RangeError);
    expect(() => encodeTileBin(tile)).toThrow(/256 layers.*255/);
  });

  it('keeps 0xffff (unresolved model) and rejects model ids that do not fit in a u16', () => {
    const tile = makeTile(0, 3);
    tile.objects[1]!.model = 0xffff;
    expect(decodeTileBin(encodeTileBin(tile)).objects.map((o) => o.model)).toEqual([10, 0xffff, 12]);

    for (const bad of [0x10000, -1, 1.5, Number.NaN]) {
      tile.objects[1]!.model = bad;
      expect(() => encodeTileBin(tile), `model ${bad}`).toThrow(RangeError);
    }
    tile.objects[1]!.model = 0x10000;
    expect(() => encodeTileBin(tile)).toThrow(/object 1.*model/);
  });

  it('rejects a layer texture that does not fit in a u16', () => {
    const tile = makeTile(2, 0);
    tile.layers[1]!.texture = 0x10000;
    expect(() => encodeTileBin(tile)).toThrow(/layer 1.*texture/);
    tile.layers[1]!.texture = -1;
    expect(() => encodeTileBin(tile)).toThrow(RangeError);
  });

  it('rejects a tile x or y that does not fit in a u16', () => {
    for (const bad of [-1, 65536, 0.5]) {
      expect(() => encodeTileBin({ ...makeTile(0, 0), x: bad })).toThrow(/tile x/);
      expect(() => encodeTileBin({ ...makeTile(0, 0), y: bad })).toThrow(/tile y/);
    }
    expect(decodeTileBin(encodeTileBin({ ...makeTile(0, 0), x: 65535, y: 0 }))).toMatchObject({ x: 65535, y: 0 });
  });

  it('rejects arrays of the wrong size', () => {
    expect(() => encodeTileBin({ ...makeTile(0, 0), heights: new Float32Array(HEIGHTS - 1) })).toThrow(/heights/);
    expect(() => encodeTileBin({ ...makeTile(0, 0), landAttr: new Uint8Array(255) })).toThrow(/landAttr/);
    const badPatch = makeTile(1, 0);
    badPatch.layers[0]!.patchEnable = new Uint8Array(255);
    expect(() => encodeTileBin(badPatch)).toThrow(/patchEnable/);
    const badLight = makeTile(1, 0);
    badLight.layers[0]!.light = new Uint8Array(LIGHT_BYTES - 4);
    expect(() => encodeTileBin(badLight)).toThrow(/light/);
    const badMatrix = makeTile(0, 1);
    badMatrix.objects[0]!.matrix = new Float32Array(15);
    expect(() => encodeTileBin(badMatrix)).toThrow(/matrix/);
  });

  describe('decodeTileBin', () => {
    let good: Uint8Array;
    beforeAll(() => {
      good = encodeTileBin(makeTile(1, 2));
    });

    it('throws a FormatError naming the reader on a wrong magic', () => {
      const bad = Uint8Array.from(good);
      bad[3] = 0x32; // "FWT2"
      const e = thrown(() => decodeTileBin(bad, 'tiles/0_0.bin'));
      expect(e.offset).toBe(0);
      expect(e.unit).toBe('byte');
      expect(e.reader).toBe('decodeTileBin');
      expect(e.cppRef).toBe('n/a');
      expect(e.file).toBe('tiles/0_0.bin');
      expect(e.message).toMatch(/magic/);
    });

    it('throws a FormatError on a wrong version', () => {
      const bad = Uint8Array.from(good);
      bad[4] = 2;
      const e = thrown(() => decodeTileBin(bad));
      expect(e.offset).toBe(4);
      expect(e.message).toMatch(/version 2/);
    });

    it('throws a FormatError on any truncation', () => {
      const cuts = new Set<number>([good.length - 1, good.length - 2, 66574, 66575, 66578]);
      for (let n = 0; n <= 20; n++) cuts.add(n);
      for (let n = 21; n < good.length; n += 997) cuts.add(n);
      for (const n of cuts) {
        const e = thrown(() => decodeTileBin(good.subarray(0, n)));
        expect(e.reader, `${n} of ${good.length} bytes`).toBe('decodeTileBin');
        expect(e.offset, `${n} of ${good.length} bytes`).toBeLessThanOrEqual(n);
      }
    });

    it('throws a FormatError on bytes left over after the last object', () => {
      const longer = new Uint8Array(good.length + 1);
      longer.set(good);
      const e = thrown(() => decodeTileBin(longer));
      expect(e.offset).toBe(good.length);
      expect(e.message).toMatch(/1 byte left/);
    });

    it('refuses a water length or object count the data cannot hold, without allocating it', () => {
      const waterAt = 10 + 4 * HEIGHTS;
      const hugeWater = Uint8Array.from(good);
      new DataView(hugeWater.buffer).setUint32(waterAt, 0xffffffff, true);
      expect(thrown(() => decodeTileBin(hugeWater)).offset).toBe(waterAt + 4);

      const objectCountAt = good.length - 2 * OBJECT_BYTES - 4;
      const hugeObjects = Uint8Array.from(good);
      new DataView(hugeObjects.buffer).setUint32(objectCountAt, 0xffffffff, true);
      const e = thrown(() => decodeTileBin(hugeObjects));
      expect(e.offset).toBe(objectCountAt + 4);
      expect(e.message).toMatch(/4294967295 objects/);
    });

    it('returns copies, not views into the input', () => {
      const input = Uint8Array.from(good);
      const tile = decodeTileBin(input);
      const snapshot = structuredClone(tile);
      input.fill(0xee, 10);
      expectSameTile(tile, snapshot);
      const layer = tile.layers[0]!;
      for (const array of [tile.heights, tile.water, tile.landAttr, layer.patchEnable, layer.light, tile.objects[0]!.matrix]) {
        expect(array.buffer).not.toBe(input.buffer);
        expect(array.byteOffset).toBe(0);
      }
    });

    it('reads from a view that starts in the middle of a larger buffer', () => {
      const padded = new Uint8Array(good.length + 7);
      padded.set(good, 3);
      expectSameTile(decodeTileBin(padded.subarray(3, 3 + good.length)), decodeTileBin(good));
    });
  });
});

// ---- manifest types -----------------------------------------------------------------------------------------

describe('manifest types', () => {
  it('describe a world and its asset index', () => {
    const assets: AssetIndex = { version: 1, files: { 'models/obj_tree.glb': 'models/obj_tree.0123456789.glb' } };
    const world: WorldManifest = {
      name: 'WdMadrigal',
      size: [16, 16],
      mpu: 4,
      mapSize: 128,
      ambient: 0xff404040,
      bgColor: 0xff87ceeb,
      fog: { start: 70, end: 400, density: 0 },
      camera: { position: [100, 20, -200], angle: 0, angleX: 10 },
      terrainTextures: ['terrain/grass.dds'],
      models: ['models/obj_tree.glb'],
      tiles: { '0_0': 'tiles/0_0.0123456789.bin' },
    };
    // Both files travel as JSON, so they must survive it unchanged; `tsc` checks the shape of the literals above.
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
    expect(JSON.parse(JSON.stringify(assets))).toEqual(assets);
  });
});
