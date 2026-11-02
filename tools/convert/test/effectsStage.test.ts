// The effects stage on a small hand-made client: `.sfx` files under SFX/, their textures under SFX/Texture/ and the
// two script indexes in the packs. The real client (the Piece 4 effects, the counts of the whole folder) is a corpus
// test: effectsStage.corpus.test.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebEffect } from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { createEffectsStage } from '../src/effects/effectsStage';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import { modelsStage } from '../src/models/modelsStage';
import { DEFAULT_STAGES, run } from '../src/run';
import type { StageContext } from '../src/run';
import { MISSING_KTX_MESSAGE, convertTexture, createTexturesStage } from '../src/textures/convertTexture';
import type { TextureContext } from '../src/textures/convertTexture';
import { ktxAvailable } from '../src/textures/ktx';
import { createUiStage } from '../src/ui/uiStage';
import { worldsStage } from '../src/world/convertWorld';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';
import { dds, solidDds } from './helpers/images';
import { sfx02 } from './helpers/sfxFile';
import type { TestSfxPart } from './helpers/sfxFile';
import { bytesOf } from './helpers/worldRun';
import type { ReportJson, Run } from './helpers/worldRun';

const text = (s: string): number[] => Array.from(Buffer.from(s, 'latin1'));
const script = (...lines: string[]): string => lines.join('\r\n') + '\r\n';

const DEFINES = script(
  '#define MODELTYPE_MESH 1',
  '#define MODELTYPE_SFX 4',
  '#define MD_MID 2',
  '#define ATEX_NONE 0',
  '#define XI_HIT_SWORD01 20',
  '#define XI_HIT_STICK01 21',
  '#define XI_HIT_SWORD02 23',
  '#define XI_HIT_GONE01 22',
  '#define XI_GEN_LEVEL_UP01 42',
  '#define XI_FLASH_BILLBOARD 60',
);

/** An OT_SFX entry; `name` is written the way the index does, so the stage adds `sfx_` when it has no underscore. */
const sfxEntry = (name: string, id: string, modelType = 'MODELTYPE_SFX'): string =>
  `  "${name}" ${id} ${modelType} "" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1`;

const MDL_DYNA = script(
  '"sfx" 3',
  '{',
  sfxEntry('HitSword01', 'XI_HIT_SWORD01'),
  sfxEntry('HitStick01', 'XI_HIT_STICK01'),
  sfxEntry('sfx_HitSword01', 'XI_HIT_SWORD02'), // another XI id for the same file: still one effect
  sfxEntry('HitGone01', 'XI_HIT_GONE01'), // names a .sfx the client does not have
  sfxEntry('GenLevelUp01', 'XI_GEN_LEVEL_UP01'),
  sfxEntry('Flash01.tga', 'XI_FLASH_BILLBOARD', '3'), // a billboard: a texture, not a .sfx
  '}',
);
const MDL_OBJ = script('"obj" 0', '{', '}');

/** Every part type, a texture animation of three frames, a part with no texture and one whose texture is not there. */
const HIT_SWORD: TestSfxPart[] = [
  { type: 1, texture: 'flash07.dds', texFrame: 3, texLoop: 12 },
  { type: 1, texture: '', frames: [0] },
  { type: 4, texture: 'Glow.DDS', using: false },
  { type: 2, texture: 'nothere.dds' },
  { type: 3, texture: 'Item_Sword.o3d' },
];
/** Shares Glow.dds (another letter case) and the missing texture with HIT_SWORD. */
const HIT_STICK: TestSfxPart[] = [
  { type: 1, texture: 'glow.dds' },
  { type: 1, texture: 'nothere.dds' },
];
const LEVEL_UP: TestSfxPart[] = [{ type: 4, texture: 'ring01.dds', texFrame: 2, texLoop: 4 }];

const loose = (extra: Record<string, string | Uint8Array> = {}): Record<string, string | Uint8Array> => ({
  'SFX/sfx_HitSword01.sfx': sfx02(HIT_SWORD),
  'SFX/sfx_HitStick01.sfx': sfx02(HIT_STICK),
  'SFX/sfx_genlevelup01.sfx': sfx02(LEVEL_UP),
  'SFX/Texture/flash07.dds': solidDds(4, 4, [255, 0, 0, 255]),
  'SFX/Texture/flash08.dds': solidDds(4, 4, [0, 255, 0, 255]),
  'SFX/Texture/flash09.dds': solidDds(4, 4, [0, 0, 255, 255]),
  'SFX/Texture/glow.dds': dds(2, 1, [[255, 255, 255, 0], [255, 255, 255, 255]]),
  'SFX/Texture/ring01.dds': solidDds(4, 4, [9, 9, 9, 255]),
  'SFX/Texture/ring02.dds': solidDds(4, 4, [8, 8, 8, 255]),
  'SFX/Texture/unused.dds': solidDds(4, 4, [7, 7, 7, 255]),
  ...extra,
});

describe('effects stage', () => {
  it('runs after the textures and models stages, and before the UI, worlds and data stages', () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(['textures', 'models', 'effects', 'ui', 'worlds', 'audio', 'data']);
  });
});

describe('the effects stage on a small hand-made client', () => {
  let root: string;
  let out: string;
  let conversions: { src: string; key: string }[];
  /** A convert that records its call and writes one byte, in place of `ktx`. */
  const fakeConvert = async (src: string, logicalKey: string, ctx: TextureContext): Promise<void> => {
    conversions.push({ src: path.relative(root, src).replaceAll('\\', '/'), key: logicalKey });
    await ctx.writer.write(logicalKey, bytesOf(conversions.length), src);
    ctx.report.ok(ctx.reportKind ?? 'textures', src, 1, 1);
  };

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-fx-client-');
    out = await makeTempDir('flyffweb-fx-out-');
    conversions = [];
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  async function client(
    extra: Record<string, string | Uint8Array> = {},
    packedOverride: Record<string, string> = {},
  ): Promise<void> {
    const packed = { 'defineTest.h': DEFINES, 'mdlObj.inc': MDL_OBJ, 'mdlDyna.inc': MDL_DYNA, ...packedOverride };
    await writeFakeClient(root, {
      packed: Object.entries(packed).map(([name, content]) => ({ name, data: text(content) })),
      loose: loose(extra),
    });
  }

  interface RunOptions {
    only?: string;
    /** Keys the models stage is taken to have written. */
    models?: string[];
    convert?: typeof convertTexture;
    findKtx?: () => Promise<{ path: string; version: string } | null>;
  }

  async function runEffects(opts: RunOptions = {}): Promise<Run & { rawReport: Report }> {
    const writer = new AssetWriter(out);
    const report = new Report();
    for (const key of opts.models ?? ['models/item_sword.glb']) await writer.write(key, bytesOf(1), 'seed');
    const ctx: StageContext = {
      client: await ClientFs.open(root),
      writer,
      report,
      only: opts.only,
      jobs: 2,
      outDir: out,
    };
    await createEffectsStage({
      convert: opts.convert ?? fakeConvert,
      findKtx: opts.findKtx ?? (async () => ({ path: 'ktx', version: '4.4.2' })),
    }).run(ctx);
    await report.write(out);
    return {
      writer,
      report: JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson,
      out,
      rawReport: report,
    };
  }

  async function effect(run: Run, key: string): Promise<WebEffect> {
    const hashed = run.writer.pathOf(key);
    expect(hashed, key).toBeDefined();
    return JSON.parse(await fs.readFile(path.join(run.out, ...hashed!.split('/')), 'utf8')) as WebEffect;
  }

  it('writes one effect file for every .sfx the model index names that the client has', async () => {
    await client();
    const run = await runEffects();

    expect(run.report.failures).toEqual([]);
    for (const key of ['effects/sfx_hitsword01.json', 'effects/sfx_hitstick01.json', 'effects/sfx_genlevelup01.json']) {
      expect(run.writer.pathOf(key), key).toMatch(/^effects\/sfx_[a-z0-9]+\.[0-9a-f]{10}\.json$/);
    }
    // XI_HIT_GONE01 names a file the client lacks, and the billboard is not an effect: nothing for either, and no failure
    expect(run.writer.pathOf('effects/sfx_hitgone01.json')).toBeUndefined();
    expect(run.report.kinds.effects).toMatchObject({ ok: 3, failed: 0 });
  });

  it('replaces each texture name with its key under textures/sfx/ and expands a texture animation to its frame keys', async () => {
    await client();
    const run = await runEffects();
    const fx = await effect(run, 'effects/sfx_hitsword01.json');

    expect(fx.parts).toHaveLength(5);
    const [anim, empty, custom, missing, mesh] = fx.parts;
    // texFrame 3 on flash07.dds: GetTextureName(name, 0..2)
    expect(anim).toMatchObject({
      type: 1,
      texFrame: 3,
      texLoop: 12,
      texture: 'textures/sfx/flash07.dds.ktx2',
      frames: ['textures/sfx/flash07.dds.ktx2', 'textures/sfx/flash08.dds.ktx2', 'textures/sfx/flash09.dds.ktx2'],
    });
    expect(empty).toMatchObject({ type: 1, texture: null, frames: [], model: null });
    // names are lower-cased with the extension kept; the part that is not drawn is still converted
    expect(custom).toMatchObject({ type: 4, using: false, texture: 'textures/sfx/glow.dds.ktx2', frames: [], points: 20 });
    expect(missing).toMatchObject({ type: 2, texture: null, frames: [] });
    expect(mesh).toMatchObject({ type: 3, texture: null, frames: [], model: 'models/item_sword.glb' });
    // the numbers of the keys are the reader's, untouched
    expect(anim!.keys).toHaveLength(2);
    expect(anim!.keys[1]).toMatchObject({ frame: 30, alpha: 255 });
    expect(anim!.particle).toBeNull();
    expect(missing!.particle).not.toBeNull();
    for (const part of fx.parts) expect(Object.keys(part)).toContain('model');
  });

  it('converts each texture that an effect names (and each frame of an animation) once, into the sfx key space', async () => {
    await client();
    const run = await runEffects();

    const keys = conversions.map((c) => c.key).sort();
    expect(keys).toEqual([
      'textures/sfx/flash07.dds.ktx2',
      'textures/sfx/flash08.dds.ktx2',
      'textures/sfx/flash09.dds.ktx2',
      'textures/sfx/glow.dds.ktx2', // named as Glow.DDS and glow.dds: one file, one conversion
      'textures/sfx/ring01.dds.ktx2',
      'textures/sfx/ring02.dds.ktx2', // the second frame of the animation in sfx_genlevelup01
    ]);
    // unused.dds is in the folder and no effect names it
    expect(keys.some((k) => k.includes('unused'))).toBe(false);
    expect(run.report.kinds.sfxTextures).toMatchObject({ ok: 6, failed: 0 });
    // the source is the client file, found whatever the case of the name
    expect(conversions.find((c) => c.key === 'textures/sfx/glow.dds.ktx2')!.src).toBe('SFX/Texture/glow.dds');
  });

  it('reports a texture that is not in the client once, and goes on', async () => {
    await client();
    const run = await runEffects();

    expect(run.report.failures).toEqual([]);
    const missing = run.report.warnings.filter((w) => w.message.includes('nothere.dds'));
    expect(missing).toHaveLength(1); // two effects name it
    expect(missing[0]).toMatchObject({ kind: 'effects' });
    expect(missing[0]!.message).toMatch(/not in .*SFX\/Texture/);
    expect(missing[0]!.message).toContain('2 effects');
    expect(run.report.kinds.effects).toMatchObject({ ok: 3, failed: 0, warn: 1 });
  });

  it('leaves the model of a mesh part null, with a warning, when that model was not converted', async () => {
    await client();
    const run = await runEffects({ models: [] });

    const fx = await effect(run, 'effects/sfx_hitsword01.json');
    expect(fx.parts[4]).toMatchObject({ type: 3, texture: null, model: null });
    const warning = run.report.warnings.find((w) => w.message.includes('item_sword'));
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe('effects');
  });

  it('counts the mesh parts', async () => {
    await client();
    const run = await runEffects();
    expect(run.report.kinds.effectMeshParts).toMatchObject({ ok: 1, warn: 0, failed: 0 });
  });

  it('reports a texture that fails to convert as a failure of its own and gives the part no texture', async () => {
    await client();
    const run = await runEffects({
      convert: async (src, key, ctx) => {
        if (key.includes('flash08')) throw new Error('cannot decode flash08.dds');
        await fakeConvert(src, key, ctx);
      },
    });

    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'sfxTextures', message: 'cannot decode flash08.dds' });
    expect(run.report.failures[0]!.source).toMatch(/flash08\.dds$/);
    const fx = await effect(run, 'effects/sfx_hitsword01.json');
    expect(fx.parts[0]!.frames).toEqual(['textures/sfx/flash07.dds.ktx2', null, 'textures/sfx/flash09.dds.ktx2']);
    expect(fx.parts[0]!.texture).toBe('textures/sfx/flash07.dds.ktx2');
  });

  it('reports an .sfx file it cannot read and still writes the others', async () => {
    await client({ 'SFX/sfx_HitStick01.sfx': 'not an sfx file at all' });
    const run = await runEffects();

    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'effects' });
    expect(run.report.failures[0]!.source).toMatch(/sfx_HitStick01\.sfx$/);
    expect(run.writer.pathOf('effects/sfx_hitsword01.json')).toBeDefined();
    expect(run.writer.pathOf('effects/sfx_hitstick01.json')).toBeUndefined();
  });

  it('records one failure and converts nothing when ktx is missing', async () => {
    await client();
    const run = await runEffects({ findKtx: async () => null });

    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'sfxTextures', message: MISSING_KTX_MESSAGE });
    expect(conversions).toEqual([]);
    expect(run.writer.pathOf('effects/sfx_hitsword01.json')).toBeUndefined();
  });

  it('does nothing and needs no ktx when the model index names no effect', async () => {
    await client({}, { 'mdlDyna.inc': script('"sfx" 3', '{', '}') });
    const run = await runEffects({ findKtx: async () => null });
    expect(run.report.failures).toEqual([]);
    expect(run.report.kinds.effects).toBeUndefined();
  });

  describe('--only', () => {
    it('converts the effects whose file name matches the glob, and only their textures', async () => {
      await client();
      const run = await runEffects({ only: 'sfx_genlevel*' });

      expect(run.writer.pathOf('effects/sfx_genlevelup01.json')).toBeDefined();
      expect(run.writer.pathOf('effects/sfx_hitsword01.json')).toBeUndefined();
      expect(conversions.map((c) => c.key).sort()).toEqual(['textures/sfx/ring01.dds.ktx2', 'textures/sfx/ring02.dds.ktx2']);
    });

    it('takes a comma-separated list of globs', async () => {
      await client();
      const run = await runEffects({ only: 'sfx_hitsword01,sfx_genlevelup01' });
      expect(run.writer.pathOf('effects/sfx_hitsword01.json')).toBeDefined();
      expect(run.writer.pathOf('effects/sfx_genlevelup01.json')).toBeDefined();
      expect(run.writer.pathOf('effects/sfx_hitstick01.json')).toBeUndefined();
    });

    it('runs every effect when the glob matches the stage name, as the data stage does', async () => {
      await client();
      const run = await runEffects({ only: 'effects' });
      expect(run.report.kinds.effects).toMatchObject({ ok: 3 });
    });

    it('does nothing for a glob that matches no effect', async () => {
      await client();
      const run = await runEffects({ only: 'wdmadrigal' });
      expect(run.report.kinds.effects).toBeUndefined();
      expect(conversions).toEqual([]);
    });
  });
});

describe('--only effects,ui on the whole stage list', () => {
  it('runs the effects and UI stages and leaves the others with nothing to do', async () => {
    const root = await makeTempDir('flyffweb-fx-only-client-');
    const out = await makeTempDir('flyffweb-fx-only-out-');
    try {
      await writeFakeClient(root, {
        packed: [
          { name: 'defineTest.h', data: text(DEFINES) },
          { name: 'mdlObj.inc', data: text(MDL_OBJ) },
          { name: 'mdlDyna.inc', data: text(MDL_DYNA) },
        ],
        loose: loose({
          'Icon/Skill_Foo.dds': solidDds(2, 2, [1, 2, 3, 255]),
          // the UI stage needs its two sheets
          'SFX/DmgEffect.dds': solidDds(2, 2, [1, 1, 1, 255]),
          'SFX/DmgEffect.inc': ['number 1', 'texture "sfx\\DmgEffect.dds" 0x00000000', 'pos 1 1 0 0 n'].join('\r\n'),
          'Icon/icon_target.dds': solidDds(2, 2, [1, 1, 1, 255]),
          'Icon/icon_target.inc': ['number 1', 'texture "icon\\icon_target.dds" 0xffff00ff', 'pos 1 1 0 0 n'].join('\r\n'),
          'Model/TextureMid/Part_Foo.dds': solidDds(2, 2, [4, 5, 6, 255]),
          'World/WdTest/readme.txt': 'no .wld here',
        }),
      });
      const lines: string[] = [];
      const code = await run({
        client: root,
        out,
        jobs: 2,
        only: 'effects,ui',
        // the stage list of a normal run, minus the data stage (it needs the game tables); the effects stage converts with a stand-in
        stages: [
          createTexturesStage({ findKtx: async () => null }),
          modelsStage,
          createEffectsStage({ convert: async (src, key, ctx) => void (await ctx.writer.write(key, bytesOf(1), src)), findKtx: async () => ({ path: 'ktx', version: '4.4.2' }) }),
          createUiStage({ themeFiles: [] }),
          worldsStage,
        ],
        log: (line) => lines.push(line),
      });

      expect(code).toBe(0);
      const files = (JSON.parse(await fs.readFile(path.join(out, 'index.json'), 'utf8')) as { files: Record<string, string> }).files;
      const keys = Object.keys(files);
      expect(keys.filter((k) => k.startsWith('effects/'))).toHaveLength(3);
      expect(keys).toContain('ui/skill_foo.png');
      expect(keys.some((k) => k.startsWith('textures/') && !k.startsWith('textures/sfx/'))).toBe(false); // Part_Foo.dds was left alone
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(out, { recursive: true, force: true });
    }
  });
});

const ktx = await ktxAvailable();

describe.skipIf(ktx === null)('the effects stage with the real ktx', () => {
  it('writes the frames of a texture animation as KTX2 files and names them in the effect', async () => {
    const root = await makeTempDir('flyffweb-fx-ktx-client-');
    const out = await makeTempDir('flyffweb-fx-ktx-out-');
    try {
      await writeFakeClient(root, {
        packed: [
          { name: 'defineTest.h', data: text(DEFINES) },
          { name: 'mdlObj.inc', data: text(MDL_OBJ) },
          { name: 'mdlDyna.inc', data: text(MDL_DYNA) },
        ],
        loose: loose(),
      });
      const writer = new AssetWriter(out);
      const report = new Report();
      await createEffectsStage().run({ client: await ClientFs.open(root), writer, report, only: 'sfx_genlevel*', jobs: 2, outDir: out });

      expect(report.failed).toBe(0);
      for (const name of ['ring01', 'ring02']) {
        const hashed = writer.pathOf(`textures/sfx/${name}.dds.ktx2`);
        expect(hashed, name).toMatch(/^textures\/sfx\/ring0[12]\.dds\.[0-9a-f]{10}\.ktx2$/);
        const bytes = new Uint8Array(await fs.readFile(path.join(out, ...hashed!.split('/'))));
        expect(Array.from(bytes.subarray(1, 7))).toEqual([0x4b, 0x54, 0x58, 0x20, 0x32, 0x30]); // "KTX 20"
      }
      expect(report.summary()).toContain('sfxTextures: 2 ok, 0 warn, 0 failed');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(out, { recursive: true, force: true });
    }
  });
});
