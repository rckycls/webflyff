import { expect, it } from 'vitest';
import { readSfx } from '../src/index';
import type { SfxFile, SfxPart } from '../src/index';
import { describeClient, forEachClientFile } from './helpers/client';

// The corpus is the loose `Client/SFX/*.sfx` (the packs hold none). `forEachClientFile` does not descend, so the two
// stray copies in `Client/SFX/Texture/` (sfx_genref01.sfx, sfx_sklragbowrain.sfx; unreachable by name) stay out.

const baseName = (file: string): string => file.replace(/^.*[\\/]/, '');
const bump = (counts: Map<string, number>, key: string | number): void =>
  void counts.set(String(key), (counts.get(String(key)) ?? 0) + 1);
const histogram = (counts: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const allFinite = (values: ArrayLike<number>): boolean => {
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return false;
  return true;
};

interface SfxScan {
  count: number;
  failures: { path: string; error: unknown }[];
  /** Lower-cased file name -> file. */
  files: Map<string, SfxFile>;
  versions: Map<string, number>;
  partTypes: Map<string, number>;
  alphaTypes: Map<string, number>;
  /** "<part type>/<bill type>" -> parts. */
  billTypes: Map<string, number>;
  parts: number;
  maxParts: number;
  maxFrame: number;
  usingFalse: number;
  zeroKeyParts: number;
  keysAbove255: number;
  /** Parts with a texture animation (texFrame above 1), by part type. */
  animated: Map<string, number>;
  repeat: number;
  repeatScal: number;
  /** Particle parts that emit every `create` frames (create above 0). */
  continuous: number;
  /** Particle parts that emit once (create 0), how many of them have a key, and how many start at frame 0. */
  bursts: number;
  burstsWithKeys: number;
  burstsAtFrameZero: number;
  /** Parts whose keys are not in strictly rising frame order. */
  unsortedKeys: string[];
  /** Texture names that are not printable ASCII (the editor label is the one Korean field, and is skipped). */
  nonAsciiTextures: string[];
  /** Parts with a NaN or infinity anywhere. */
  notFinite: string[];
  /** Parts of the wrong shape: a particle block off a particle, none on a particle, or points on a non-custom mesh. */
  wrongShape: string[];
}

let scan: SfxScan | undefined;

function scanSfx(): SfxScan {
  if (scan) return scan;
  const s: SfxScan = {
    count: 0,
    failures: [],
    files: new Map(),
    versions: new Map(),
    partTypes: new Map(),
    alphaTypes: new Map(),
    billTypes: new Map(),
    parts: 0,
    maxParts: 0,
    maxFrame: 0,
    usingFalse: 0,
    zeroKeyParts: 0,
    keysAbove255: 0,
    animated: new Map(),
    repeat: 0,
    repeatScal: 0,
    continuous: 0,
    bursts: 0,
    burstsWithKeys: 0,
    burstsAtFrameZero: 0,
    unsortedKeys: [],
    nonAsciiTextures: [],
    notFinite: [],
    wrongShape: [],
  };
  const result = forEachClientFile('SFX', /\.sfx$/i, (bytes, file) => {
    const sfx = readSfx(bytes, file);
    const name = baseName(file);
    s.files.set(name.toLowerCase(), sfx);
    bump(s.versions, sfx.version);
    s.maxParts = Math.max(s.maxParts, sfx.parts.length);
    sfx.parts.forEach((part: SfxPart, i) => {
      const where = `${name} part ${i}`;
      s.parts++;
      bump(s.partTypes, part.type);
      bump(s.alphaTypes, part.alphaType);
      bump(s.billTypes, `${part.type}/${part.billType}`);
      if (!part.using) s.usingFalse++;
      if (part.keys.length === 0) s.zeroKeyParts++;
      if (part.texFrame > 1) bump(s.animated, part.type);
      if (!/^[\x20-\x7e]*$/.test(part.texture)) s.nonAsciiTextures.push(`${where}: ${JSON.stringify(part.texture)}`);
      let finite = true;
      part.keys.forEach((k, j) => {
        s.maxFrame = Math.max(s.maxFrame, k.frame);
        if (k.alpha > 255) s.keysAbove255++;
        if (j > 0 && k.frame <= part.keys[j - 1].frame) s.unsortedKeys.push(where);
        finite &&= allFinite(k.pos) && allFinite(k.posRotate) && allFinite(k.scale) && allFinite(k.rotate);
      });
      const p = part.particle;
      if (p) {
        if (p.repeat) s.repeat++;
        if (p.repeatScal) s.repeatScal++;
        if (p.create > 0) s.continuous++;
        else {
          s.bursts++;
          if (part.keys.length > 0) s.burstsWithKeys++;
          if (part.keys.length > 0 && part.keys[0].frame === 0) s.burstsAtFrameZero++;
        }
        const vectors = [p.accel, p.scale, p.scaleSpeed, p.rotationLow, p.rotationHigh];
        vectors.push(p.scaleSpeedLow, p.scaleSpeedHigh, p.scaleEnd);
        const scalars = [p.startPosVar, p.startPosVarY, p.yLow, p.yHigh, p.xzLow, p.xzHigh];
        finite &&= vectors.every(allFinite) && allFinite(scalars);
      }
      if (!finite) s.notFinite.push(where);
      if ((part.type === 2) !== (p !== null) || (part.type !== 4 && part.points !== 0)) s.wrongShape.push(where);
    });
  });
  s.count = result.count;
  s.failures = result.failures;
  scan = s;
  return s;
}

const failureText = (failures: { path: string; error: unknown }[]): string =>
  failures
    .slice(0, 5)
    .map((f) => `${f.path}: ${f.error instanceof Error ? f.error.message : String(f.error)}`)
    .join('; ');

describeClient('.sfx effect files in Client/SFX', () => {
  it('every .sfx in Client/SFX reads with no bytes left', () => {
    const s = scanSfx();
    expect(failureText(s.failures)).toBe('');
    expect(s.count).toBe(731);
    expect(s.files.size).toBe(731);
  });

  it('has the versions and the parts the research counted', () => {
    const s = scanSfx();
    expect(histogram(s.versions)).toEqual({ '0.1': 75, '0.2': 421, '0.3': 198, old: 37 });
    expect(s.parts).toBe(4458);
    // 1 BILL, 2 PARTICLE, 3 MESH, 4 CUSTOMMESH
    expect(histogram(s.partTypes)).toEqual({ '1': 1792, '2': 1543, '3': 128, '4': 995 });
    expect(histogram(s.alphaTypes)).toEqual({ '1': 170, '2': 4288 });
    expect(histogram(s.billTypes)).toEqual({
      '1/1': 1118,
      '1/2': 402,
      '1/3': 2,
      '1/4': 270,
      '2/1': 1296,
      '2/2': 57,
      '2/3': 124,
      '2/4': 66,
      '3/1': 120,
      '3/2': 5,
      '3/4': 3,
      '4/1': 9,
      '4/2': 39,
      '4/4': 947,
    });
    expect(s.maxParts).toBe(41);
    expect(s.maxFrame).toBe(1400);
  });

  it('counts the flags and the key quirks the research found', () => {
    const s = scanSfx();
    expect(s.usingFalse).toBe(647);
    expect(histogram(s.animated)).toEqual({ '1': 140, '2': 99, '3': 10, '4': 81 });
    expect(s.repeat).toBe(138);
    expect(s.repeatScal).toBe(96);
    expect(s.continuous).toBe(1479);
    // 64 particles have create 0; the research counted the 62 with a key (the other two are among the 22 with none)
    expect(s.bursts).toBe(64);
    expect(s.burstsWithKeys).toBe(62);
    expect(s.burstsAtFrameZero).toBe(17);
    expect(s.zeroKeyParts).toBe(22);
    expect(s.keysAbove255).toBe(12);
  });

  it('gives every part its own shape, sorted finite keys, and ASCII texture names', () => {
    const s = scanSfx();
    expect(s.parts).toBe(4458);
    expect(s.wrongShape).toEqual([]);
    expect(s.unsortedKeys).toEqual([]);
    expect(s.notFinite).toEqual([]);
    expect(s.nonAsciiTextures).toEqual([]);
  });

  it('reads sfx_GenLevelUp01: 9 parts, the last key at frame 410 (the particle part 7)', () => {
    const sfx = scanSfx().files.get('sfx_genlevelup01.sfx');
    expect(sfx).toBeDefined();
    expect(sfx!.parts).toHaveLength(9);
    const lastFrames = sfx!.parts.map((p) => (p.keys.length > 0 ? p.keys[p.keys.length - 1].frame : -1));
    expect(Math.max(...lastFrames)).toBe(410);
    expect(sfx!.parts[7].type).toBe(2);
    expect(sfx!.parts[7].keys.map((k) => k.frame)).toEqual([20, 410]);
    expect(sfx!.parts.map((p) => p.type)).toEqual([1, 4, 1, 1, 1, 4, 4, 2, 4]);
  });
});
