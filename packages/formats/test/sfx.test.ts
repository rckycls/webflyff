import { describe, expect, it } from 'vitest';
import { FormatError, readSfx } from '../src/index';
import type { SfxKey, SfxParticle, Vec3 } from '../src/index';
import { Bytes } from './helpers/bytes';
import { thrown } from './helpers/thrown';

// ---- byte builders: lay out files the way CSfxBase::Load and the parts' Load, Load2, Load3 and OldLoad read them ----

type Version = 'old' | '0.1' | '0.2' | '0.3';

/** A key frame's numbers counting up from `seed`, so a field read from the wrong place is noticed. */
interface KeySpec {
  frame: number;
  seed: number;
}

const triple = (from: number): Vec3 => [from, from + 1, from + 2];

/** The key a `KeySpec` is written as, and the key the reader must give back. */
function expectedKey({ frame, seed }: KeySpec): SfxKey {
  return {
    frame,
    pos: triple(seed),
    posRotate: triple(seed + 3),
    scale: triple(seed + 6),
    rotate: triple(seed + 9),
    alpha: seed + 12,
  };
}

function putVec3(b: Bytes, v: Vec3): Bytes {
  return b.f32(v[0]).f32(v[1]).f32(v[2]);
}

/** An SfxKeyFrame as the loaders read it: WORD nFrame, then vPos, vPosRotate, vScale, vRotate and int nAlpha. */
function putKey(b: Bytes, k: KeySpec): Bytes {
  const e = expectedKey(k);
  b.u16(e.frame);
  putVec3(b, e.pos);
  putVec3(b, e.posRotate);
  putVec3(b, e.scale);
  putVec3(b, e.rotate);
  return b.i32(e.alpha);
}

/** A string as the files store it: int length, then that many bytes, no terminator. */
function putString(b: Bytes, text: string | Uint8Array): Bytes {
  const bytes = typeof text === 'string' ? Uint8Array.from(text, (c) => c.charCodeAt(0)) : text;
  return b.i32(bytes.length).raw(bytes);
}

/** Every particle field distinct. `rotation` and `scaleSpeed2` are read and dropped; the rest comes back. */
const PARTICLE = {
  create: 3,
  createNum: 4,
  appear: 5,
  keep: 6,
  disappear: 7,
  startPosVar: 1.5,
  startPosVarY: 2.5,
  yLow: 3.5,
  yHigh: 4.5,
  xzLow: 5.5,
  xzHigh: 6.5,
  accel: [0.25, 0.5, 0.75] as Vec3,
  scale: [1, 2, 3] as Vec3,
  scaleSpeed: [0.125, 0.25, 0.375] as Vec3,
  rotation: [10, 11, 12] as Vec3,
  rotationLow: [20, 21, 22] as Vec3,
  rotationHigh: [30, 31, 32] as Vec3,
  repeatScal: 1,
  repeat: 1,
  // scalSpeedXLow, XHigh, YLow, YHigh, ZLow, ZHigh
  scalSpeed: [40, 41, 42, 43, 44, 45],
  scaleSpeed2: [50, 51, 52] as Vec3,
  scaleEnd: [60, 61, 62] as Vec3,
};

/** What the reader must give back for `PARTICLE` written in `version`. */
function expectedParticle(version: Version): SfxParticle {
  const modern = version === '0.2' || version === '0.3';
  const zero: Vec3 = [0, 0, 0];
  return {
    create: 3,
    createNum: 4,
    appear: 5,
    keep: 6,
    disappear: 7,
    startPosVar: 1.5,
    startPosVarY: 2.5,
    yLow: 3.5,
    yHigh: 4.5,
    xzLow: 5.5,
    xzHigh: 6.5,
    accel: [0.25, 0.5, 0.75],
    scale: [1, 2, 3],
    scaleSpeed: [0.125, 0.25, 0.375],
    rotationLow: modern ? [20, 21, 22] : zero,
    rotationHigh: modern ? [30, 31, 32] : zero,
    repeatScal: modern,
    repeat: version === '0.3',
    scaleSpeedLow: modern ? [40, 42, 44] : zero,
    scaleSpeedHigh: modern ? [41, 43, 45] : zero,
    scaleEnd: modern ? [60, 61, 62] : zero,
  };
}

/** The particle block of CSfxPartParticle::Load / OldLoad (old, 0.1), Load2 (0.2) or Load3 (0.3). */
function putParticle(b: Bytes, version: Version): Bytes {
  const p = PARTICLE;
  b.u16(p.create).u16(p.createNum).u16(p.appear).u16(p.keep).u16(p.disappear);
  b.f32(p.startPosVar).f32(p.startPosVarY).f32(p.yLow).f32(p.yHigh).f32(p.xzLow).f32(p.xzHigh);
  putVec3(b, p.accel);
  putVec3(b, p.scale);
  putVec3(b, p.scaleSpeed);
  if (version === 'old' || version === '0.1') return b;
  putVec3(b, p.rotation);
  putVec3(b, p.rotationLow);
  putVec3(b, p.rotationHigh);
  b.i32(p.repeatScal);
  if (version === '0.3') b.i32(p.repeat);
  for (const v of p.scalSpeed) b.f32(v);
  putVec3(b, p.scaleSpeed2);
  return putVec3(b, p.scaleEnd);
}

interface PartSpec {
  type: number;
  texture: string | Uint8Array;
  /** The editor label of version 0.2 and up (CP949 bytes), skipped by the reader. */
  label?: Uint8Array | string;
  texFrame?: number;
  texLoop?: number;
  /** The raw BOOL; version 0.2 and up only. */
  using?: number;
  billType?: number;
  alphaType?: number;
  /** In file order. */
  keys?: KeySpec[];
  /** CUSTOMMESH only. */
  points?: number;
}

function putPart(b: Bytes, version: Version, p: PartSpec): Bytes {
  b.i32(p.type);
  if (version === 'old') {
    putString(b, p.texture); // one string: the name and the texture
  } else if (version === '0.1') {
    putString(b, p.texture);
    b.u16(p.texFrame ?? 1).u16(p.texLoop ?? 1);
  } else {
    putString(b, p.label ?? 'layer');
    putString(b, p.texture);
    b.u16(p.texFrame ?? 1).u16(p.texLoop ?? 1).i32(p.using ?? 1);
  }
  b.i32(p.billType ?? 1).i32(p.alphaType ?? 2);
  if (p.type === 2) putParticle(b, version);
  const keys = p.keys ?? [];
  b.i32(keys.length);
  for (const k of keys) putKey(b, k);
  if (p.type === 4) b.i32(p.points ?? 20);
  return b;
}

const MAGIC: Record<Exclude<Version, 'old'>, string> = { '0.1': 'SFX0.1  ', '0.2': 'SFX0.2  ', '0.3': 'SFX0.3  ' };

function sfxBytes(version: Version, parts: PartSpec[]): Uint8Array {
  const b = new Bytes();
  if (version !== 'old') {
    for (const c of MAGIC[version]) b.u8(c.charCodeAt(0));
  }
  b.i32(parts.length);
  for (const p of parts) putPart(b, version, p);
  return b.build();
}

const read = (bytes: Uint8Array) => readSfx(bytes, 'test.sfx');

describe('readSfx', () => {
  it('has the shape the effect player and the converter rely on', () => {
    const keys: KeySpec[] = [{ frame: 0, seed: 100 }];
    const sfx = read(sfxBytes('0.2', [{ type: 1, texture: 'a.tga', keys }]));
    expect(sfx.version).toBe('0.2');
    expect(Object.keys(sfx.parts[0]).sort()).toEqual(
      ['alphaType', 'billType', 'keys', 'particle', 'points', 'texFrame', 'texLoop', 'texture', 'type', 'using'].sort(),
    );
  });

  describe('version 0.1', () => {
    it('reads a bill: one string for the name and the texture, the texture animation, no using flag (TRUE)', () => {
      const keys: KeySpec[] = [
        { frame: 0, seed: 100 },
        { frame: 30, seed: 200 },
      ];
      const sfx = read(
        sfxBytes('0.1', [
          { type: 1, texture: 'sfx_flare01.tga', texFrame: 8, texLoop: 24, billType: 2, alphaType: 1, keys },
        ]),
      );
      expect(sfx.version).toBe('0.1');
      expect(sfx.parts).toEqual([
        {
          type: 1,
          texture: 'sfx_flare01.tga',
          texFrame: 8,
          texLoop: 24,
          using: true,
          billType: 2,
          alphaType: 1,
          keys: keys.map(expectedKey),
          particle: null,
          points: 0,
        },
      ]);
    });

    it('reads a particle: the block of CSfxPartParticle::Load, the rest zero', () => {
      const sfx = read(sfxBytes('0.1', [{ type: 2, texture: 'p.tga', keys: [{ frame: 5, seed: 1 }] }]));
      expect(sfx.parts[0].particle).toEqual(expectedParticle('0.1'));
      expect(sfx.parts[0].keys).toEqual([expectedKey({ frame: 5, seed: 1 })]);
      expect(sfx.parts[0].points).toBe(0);
    });

    it('reads a mesh and a custom mesh, whose point count follows the keys', () => {
      const sfx = read(
        sfxBytes('0.1', [
          { type: 3, texture: 'sword.o3d', billType: 4, keys: [{ frame: 0, seed: 7 }] },
          { type: 4, texture: 'ring.tga', texFrame: 3, texLoop: 9, keys: [{ frame: 2, seed: 9 }], points: 31 },
        ]),
      );
      expect(sfx.parts.map((p) => [p.type, p.texture, p.texFrame, p.texLoop, p.points])).toEqual([
        [3, 'sword.o3d', 1, 1, 0],
        [4, 'ring.tga', 3, 9, 31],
      ]);
      expect(sfx.parts[0].billType).toBe(4);
    });
  });

  describe('version 0.2', () => {
    it('skips the CP949 editor label and reads the using flag', () => {
      // "레이어" in CP949: bytes a high-bit decoder would turn into something else, and 0 bytes inside.
      const label = Uint8Array.from([0xb7, 0xb9, 0xc0, 0xcc, 0xbe, 0xee, 0x00, 0xff]);
      const sfx = read(
        sfxBytes('0.2', [
          { type: 1, label, texture: 'glow.tga', using: 0, keys: [{ frame: 1, seed: 3 }] },
          { type: 1, label: '', texture: 'glow2.tga', using: 7, keys: [] },
        ]),
      );
      expect(sfx.version).toBe('0.2');
      expect(sfx.parts.map((p) => [p.texture, p.using, p.keys.length])).toEqual([
        ['glow.tga', false, 1],
        ['glow2.tga', true, 0],
      ]);
    });

    it('reads a particle: the block of CSfxPartParticle::Load2, without the repeat flag', () => {
      const sfx = read(sfxBytes('0.2', [{ type: 2, texture: 'p.tga', keys: [{ frame: 0, seed: 50 }] }]));
      expect(sfx.parts[0].particle).toEqual(expectedParticle('0.2'));
      expect(sfx.parts[0].particle?.repeat).toBe(false);
      expect(sfx.parts[0].particle?.repeatScal).toBe(true);
    });

    it('reads every part type in one file, in order', () => {
      const sfx = read(
        sfxBytes('0.2', [
          { type: 1, texture: 'b.tga', keys: [{ frame: 0, seed: 1 }] },
          { type: 2, texture: 'p.tga', keys: [{ frame: 0, seed: 2 }] },
          { type: 3, texture: 'm.o3d', keys: [{ frame: 0, seed: 3 }] },
          { type: 4, texture: 'c.tga', keys: [{ frame: 0, seed: 4 }], points: 12 },
        ]),
      );
      expect(sfx.parts.map((p) => [p.type, p.texture, p.points, p.particle !== null])).toEqual([
        [1, 'b.tga', 0, false],
        [2, 'p.tga', 0, true],
        [3, 'm.o3d', 0, false],
        [4, 'c.tga', 12, false],
      ]);
      expect(sfx.parts.map((p) => p.keys[0].pos[0])).toEqual([1, 2, 3, 4]);
    });

    it('compares only the first six characters of the magic', () => {
      const bytes = sfxBytes('0.2', [{ type: 1, texture: 'a.tga', keys: [] }]);
      bytes[6] = 0x41;
      bytes[7] = 0x00;
      expect(read(bytes).version).toBe('0.2');
    });
  });

  describe('version 0.3', () => {
    it('reads a particle with the repeat flag (CSfxPartParticle::Load3)', () => {
      const sfx = read(sfxBytes('0.3', [{ type: 2, texture: 'p.tga', keys: [{ frame: 9, seed: 70 }] }]));
      expect(sfx.version).toBe('0.3');
      expect(sfx.parts[0].particle).toEqual(expectedParticle('0.3'));
      expect(sfx.parts[0].particle?.repeat).toBe(true);
    });

    it('reads the other part types with the version 0.2 layout (they have no Load3)', () => {
      const sfx = read(
        sfxBytes('0.3', [
          { type: 1, label: 'x', texture: 'b.tga', texFrame: 4, texLoop: 16, using: 0, keys: [{ frame: 0, seed: 1 }] },
          { type: 4, texture: 'c.tga', keys: [{ frame: 3, seed: 2 }], points: 8 },
          { type: 2, texture: 'p.tga', keys: [] },
        ]),
      );
      expect(sfx.parts.map((p) => [p.type, p.texFrame, p.texLoop, p.using, p.points])).toEqual([
        [1, 4, 16, false, 0],
        [4, 1, 1, true, 8],
        [2, 1, 1, true, 0],
      ]);
    });
  });

  describe('old files (no magic)', () => {
    it('start with the part count and read every part type with its OldLoad', () => {
      const sfx = read(
        sfxBytes('old', [
          { type: 1, texture: 'old_b.tga', billType: 3, alphaType: 1, keys: [{ frame: 0, seed: 1 }] },
          { type: 2, texture: 'old_p.tga', keys: [{ frame: 4, seed: 2 }] },
          { type: 3, texture: 'old_m.o3d', keys: [{ frame: 0, seed: 3 }] },
          { type: 4, texture: 'old_c.tga', keys: [{ frame: 0, seed: 4 }], points: 16 },
        ]),
      );
      expect(sfx.version).toBe('old');
      const summary = sfx.parts.map((p) => [
        p.type,
        p.texture,
        p.texFrame,
        p.texLoop,
        p.using,
        p.billType,
        p.alphaType,
        p.points,
      ]);
      expect(summary).toEqual([
        [1, 'old_b.tga', 1, 1, true, 3, 1, 0],
        [2, 'old_p.tga', 1, 1, true, 1, 2, 0],
        [3, 'old_m.o3d', 1, 1, true, 1, 2, 0],
        [4, 'old_c.tga', 1, 1, true, 1, 2, 16],
      ]);
      expect(sfx.parts[1].particle).toEqual(expectedParticle('old'));
      expect(sfx.parts[1].keys).toEqual([expectedKey({ frame: 4, seed: 2 })]);
    });

    it('reads a file with no parts', () => {
      const sfx = read(new Bytes().i32(0).build());
      expect(sfx).toEqual({ version: 'old', parts: [] });
    });

    it('treats any other magic as an old file, whose first int is then the part count', () => {
      const bytes = new Bytes().raw(Uint8Array.from('SFX0.4  ', (c) => c.charCodeAt(0))).build();
      const err = thrown(() => read(bytes));
      expect(err.message).toMatch(/part count/);
    });
  });

  describe('keys', () => {
    it('are sorted by frame, and a repeated frame keeps the last one (AddKeyFrame, AdjustKeyFrame)', () => {
      const keys: KeySpec[] = [
        { frame: 30, seed: 100 },
        { frame: 0, seed: 200 },
        { frame: 15, seed: 300 },
        { frame: 30, seed: 400 }, // repeats frame 30: this data wins
        { frame: 7, seed: 500 },
      ];
      for (const version of ['old', '0.1', '0.2', '0.3'] as const) {
        const sfx = read(sfxBytes(version, [{ type: 1, texture: 'a.tga', keys }]));
        expect(sfx.parts[0].keys, version).toEqual([
          expectedKey({ frame: 0, seed: 200 }),
          expectedKey({ frame: 7, seed: 500 }),
          expectedKey({ frame: 15, seed: 300 }),
          expectedKey({ frame: 30, seed: 400 }),
        ]);
      }
    });

    it('sorts a particle part the same way', () => {
      const sfx = read(
        sfxBytes('0.3', [
          {
            type: 2,
            texture: 'p.tga',
            keys: [
              { frame: 9, seed: 1 },
              { frame: 2, seed: 2 },
              { frame: 9, seed: 3 },
            ],
          },
        ]),
      );
      expect(sfx.parts[0].keys.map((k) => [k.frame, k.pos[0]])).toEqual([
        [2, 2],
        [9, 3],
      ]);
    });

    it('keep the frame as an unsigned 16-bit number and the alpha as a signed int', () => {
      const b = new Bytes().raw(Uint8Array.from('SFX0.2  ', (c) => c.charCodeAt(0))).i32(1).i32(1);
      putString(b, 'x');
      putString(b, 'a.tga');
      b.u16(1).u16(1).i32(1).i32(1).i32(2).i32(2);
      b.u16(65535);
      for (let i = 0; i < 12; i++) b.f32(0);
      b.i32(-3);
      b.u16(300);
      for (let i = 0; i < 12; i++) b.f32(0);
      b.i32(300); // some keys in the shipped files are above 255
      const keys = read(b.build()).parts[0].keys;
      expect(keys.map((k) => [k.frame, k.alpha])).toEqual([
        [300, 300],
        [65535, -3],
      ]);
    });
  });

  describe('text', () => {
    it('reads the texture as the bytes up to the first NUL, and an empty name as ""', () => {
      const withNul = Uint8Array.from([0x61, 0x2e, 0x74, 0x67, 0x61, 0x00, 0x7a, 0x7a]);
      const sfx = read(
        sfxBytes('0.2', [
          { type: 1, texture: '', keys: [] },
          { type: 1, texture: withNul, keys: [] },
        ]),
      );
      expect(sfx.parts.map((p) => p.texture)).toEqual(['', 'a.tga']);
    });
  });

  describe('bad files', () => {
    const good = (): Uint8Array =>
      sfxBytes('0.2', [{ type: 1, texture: 'a.tga', keys: [{ frame: 0, seed: 1 }] }]);

    it('reports the file, the reader and the C++ it copies', () => {
      const err = thrown(() => readSfx(good().subarray(0, 20), 'Client/SFX/x.sfx'));
      expect(err).toBeInstanceOf(FormatError);
      expect(err.file).toBe('Client/SFX/x.sfx');
      expect(err.reader).toBe('readSfx');
      expect(err.cppRef).toMatch(/sfxbase\.cpp:1719 CSfxBase::Load/);
    });

    it('fails on an empty file and on a truncated one', () => {
      thrown(() => read(new Uint8Array(0)));
      const bytes = good();
      for (const cut of [1, 4, 30, 54]) thrown(() => read(bytes.subarray(0, bytes.length - cut)));
    });

    it('fails on bytes left after the last part', () => {
      const bytes = good();
      const longer = new Uint8Array(bytes.length + 1);
      longer.set(bytes);
      expect(thrown(() => read(longer)).message).toMatch(/1 byte left/);
    });

    it('fails on a part type the client has no class for', () => {
      for (const type of [0, 5, -1]) {
        const err = thrown(() => read(sfxBytes('0.2', [{ type, texture: 'a.tga', keys: [] }])));
        expect(err.message).toMatch(new RegExp(`part 0: type ${type} is not`));
      }
    });

    it('fails on a bill or alpha type outside the enums', () => {
      for (const billType of [0, 5]) {
        const err = thrown(() => read(sfxBytes('0.2', [{ type: 1, texture: 'a.tga', billType, keys: [] }])));
        expect(err.message).toMatch(new RegExp(`bill type ${billType} is not`));
      }
      for (const alphaType of [0, 3]) {
        const err = thrown(() => read(sfxBytes('0.2', [{ type: 1, texture: 'a.tga', alphaType, keys: [] }])));
        expect(err.message).toMatch(new RegExp(`alpha type ${alphaType} is not`));
      }
    });

    it('fails on a string that does not fit the 255-byte buffer, or has a negative length', () => {
      const long = 'x'.repeat(255);
      const err = thrown(() => read(sfxBytes('0.2', [{ type: 1, texture: long, keys: [] }])));
      expect(err.message).toMatch(/length 255/);
      const ok = read(sfxBytes('0.2', [{ type: 1, texture: 'x'.repeat(254), keys: [] }]));
      expect(ok.parts[0].texture).toHaveLength(254);

      const magic = Uint8Array.from('SFX0.1  ', (c) => c.charCodeAt(0));
      const negative = new Bytes().raw(magic).i32(1).i32(1).i32(-1).zeros(16).build();
      expect(thrown(() => read(negative)).message).toMatch(/length -1/);
    });

    it('fails on a negative or impossible count', () => {
      const head = (v: string): Bytes => new Bytes().raw(Uint8Array.from(v, (c) => c.charCodeAt(0)));
      expect(thrown(() => read(head('SFX0.1  ').i32(-1).build())).message).toMatch(/part count -1/);
      expect(thrown(() => read(head('SFX0.1  ').i32(1000).build())).message).toMatch(/part count 1000/);

      const key = (n: number): Uint8Array => {
        const b = head('SFX0.1  ').i32(1).i32(1);
        putString(b, 'a.tga');
        return b.u16(1).u16(1).i32(1).i32(2).i32(n).build();
      };
      expect(thrown(() => read(key(-1))).message).toMatch(/key count -1/);
      expect(thrown(() => read(key(0x7fffffff))).message).toMatch(/key count 2147483647/);
    });
  });
});
