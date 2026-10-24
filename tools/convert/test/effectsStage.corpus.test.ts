// The effects stage on the real client folder. A corpus test (`npm run test:corpus -- effects`): it needs the client and
// `ktx`. The Piece 4 effects go through the real texture encoder; the sweep over every effect the model index names uses
// a stand-in for `ktx` (the stage's rules are the same, and the whole folder's 1,600 textures would take minutes: the
// full conversion is the `npm run convert` run recorded in docs/conversion-baseline.md). The rules are unit-tested on
// a hand-made client in effectsStage.test.ts.

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OT, decodeScript, loadDefines, modelFileName, readModelIndex, readSfx, sfxTextureName, webName } from '@flyffweb/formats';
import type { SfxFile, WebEffect } from '@flyffweb/formats';
import { clientRoot, describeClient, loadClientPacks } from '../../../packages/formats/test/helpers/client';
import { ClientFs } from '../src/ClientFs';
import { createEffectsStage } from '../src/effects/effectsStage';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import type { StageContext } from '../src/run';
import { convertTexture, textureKey } from '../src/textures/convertTexture';
import type { TextureContext } from '../src/textures/convertTexture';
import { ktxAvailable } from '../src/textures/ktx';
import { makeTempDir } from './helpers/fakeClient';
import { bytesOf } from './helpers/worldRun';
import type { ReportJson } from './helpers/worldRun';

/** The effects of milestone 1 ([effects §4]): the hits, the level up, the spawn and the move mark. */
const M1_SET = [
  'sfx_HitSword01', 'sfx_HitStick01', 'sfx_hitKnuckle01', 'sfx_hitbow01', 'sfx_hityoy01', 'sfx_hitCritical01',
  'sfx_hitMiss01', 'sfx_hitparry01', 'sfx_hitblock01', 'sfx_genlevelup01', 'sfx_genmonspawn01', 'sfx_movemark',
];
/** The three Vagrant skill effects of milestone 2. */
const VAGRANT_SET = ['sfx_sklvagcleanhit01', 'sfx_sklvagbrandish01', 'sfx_sklvagovercutter01'];
/** The textures of those effects that carry alpha ([effects §2.7]): the banners of a critical hit, a miss, a parry and a block. */
const ALPHA_TEXTURES = ['sfx_hitCritical01-1.dds', 'sfx_hitMiss01-1.dds', 'sfx_hitParry01-2.dds', 'sfx_Block01.dds'];

const ktx = await ktxAvailable();

/** How many colour samples the KTX2 data format descriptor of an ETC1S file holds: 1 for RGB, 2 for RGB plus alpha. */
function ktx2Samples(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dfd = view.getUint32(48, true); // dfdByteOffset
  const blockSize = view.getUint16(dfd + 10, true); // descriptorBlockSize
  return (blockSize - 24) / 16;
}

describeClient('the effects stage on the real client', () => {
  const packs = loadClientPacks();
  const defines = loadDefines(packs);
  const dyna = readModelIndex(decodeScript(packs.read('mdlDyna.inc')), defines, 'mdlDyna.inc');
  /** The .sfx stems of the model index, with the case of the index. */
  const named = [...new Set(dyna.filter((e) => e.type === OT.SFX && e.modelType === 4).map((e) => modelFileName(e)))];

  let client: ClientFs;
  let root: string;

  const read = (stem: string): SfxFile => {
    const file = client.find('SFX', `${stem}.sfx`);
    expect(file, stem).not.toBeNull();
    return readSfx(new Uint8Array(readFileSync(file!)), file!);
  };

  beforeAll(async () => {
    root = clientRoot()!;
    client = await ClientFs.open(root);
  });

  describe.skipIf(ktx === null)('the Piece 4 effects, with the real texture encoder', () => {
    let out: string;
    let writer: AssetWriter;
    let report: Report;
    let reportJson: ReportJson;

    beforeAll(async () => {
      out = await makeTempDir('flyffweb-fx-real-');
      writer = new AssetWriter(out);
      report = new Report();
      const ctx: StageContext = {
        client,
        writer,
        report,
        only: [...M1_SET, ...VAGRANT_SET].join(','),
        jobs: 4,
        outDir: out,
      };
      await createEffectsStage().run(ctx);
      await report.write(out);
      reportJson = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson;
    }, 600_000);

    afterAll(async () => {
      await fs.rm(out, { recursive: true, force: true });
    });

    const effect = async (stem: string): Promise<WebEffect> => {
      const key = `effects/${webName(stem)}.json`;
      const hashed = writer.pathOf(key);
      expect(hashed, key).toBeDefined();
      return JSON.parse(await fs.readFile(path.join(out, ...hashed!.split('/')), 'utf8')) as WebEffect;
    };

    it('writes the twelve milestone 1 effects and the three Vagrant effects, with no failure', async () => {
      expect(reportJson.failures).toEqual([]);
      for (const stem of [...M1_SET, ...VAGRANT_SET]) await effect(stem);
      expect(reportJson.kinds.effects).toMatchObject({ ok: 15, failed: 0 });
    });

    it('gives sfx_HitSword01 its four parts', async () => {
      const fx = await effect('sfx_HitSword01');
      expect(fx.parts).toHaveLength(4);
      expect(fx.parts).toHaveLength(read('sfx_HitSword01').parts.length);
    });

    it('names a converted texture for every part of these effects that has one, and expands each texture animation', async () => {
      for (const stem of [...M1_SET, ...VAGRANT_SET]) {
        const source = read(stem);
        const fx = await effect(stem);
        expect(fx.parts, stem).toHaveLength(source.parts.length);
        fx.parts.forEach((part, i) => {
          const from = source.parts[i]!;
          const where = `${stem} part ${i}`;
          expect(part.type, where).toBe(from.type);
          expect(part.keys, where).toEqual(from.keys);
          if (from.type === 3) return; // none in these sets
          if (from.texture === '') {
            expect(part.texture, where).toBeNull();
            return;
          }
          expect(part.texture, where).toBe(textureKey('sfx', from.texFrame > 1 ? sfxTextureName(from.texture, 0) : from.texture));
          expect(writer.pathOf(part.texture!), `${where} ${part.texture}`).toBeDefined();
          if (from.texFrame > 1) {
            expect(part.frames, where).toHaveLength(from.texFrame);
            for (const [frame, key] of part.frames.entries()) {
              expect(key, `${where} frame ${frame}`).toBe(textureKey('sfx', sfxTextureName(from.texture, frame)));
              expect(writer.pathOf(key!), `${where} frame ${frame}`).toBeDefined();
            }
          } else {
            expect(part.frames, where).toEqual([]);
          }
        });
      }
    });

    it('converts every texture of these effects: none of them is missing', () => {
      expect(reportJson.warnings.filter((w) => w.kind === 'effects')).toEqual([]);
      expect(reportJson.kinds.sfxTextures!.failed).toBe(0);
    });

    it('keeps the alpha of the four banner textures that have some', () => {
      for (const name of ALPHA_TEXTURES) {
        const hashed = writer.pathOf(textureKey('sfx', name));
        expect(hashed, name).toBeDefined();
        const bytes = new Uint8Array(readFileSync(path.join(out, ...hashed!.split('/'))));
        expect(ktx2Samples(bytes), name).toBe(2);
      }
    });
  });

  describe('every effect the model index names, with a stand-in for ktx', () => {
    let out: string;
    let writer: AssetWriter;
    let reportJson: ReportJson;
    const converted: string[] = [];
    /** The texture file names (any case) the .sfx files name, over the files the model index names and the client has. */
    const wanted = new Set<string>();
    const sfxFiles: { stem: string; sfx: SfxFile }[] = [];

    beforeAll(async () => {
      out = await makeTempDir('flyffweb-fx-sweep-');
      writer = new AssetWriter(out);
      const report = new Report();
      const stand: typeof convertTexture = async (src, key, ctx: TextureContext) => {
        converted.push(key);
        await ctx.writer.write(key, bytesOf(1), src);
        ctx.report.ok(ctx.reportKind ?? 'textures', src, 1, 1);
      };
      await createEffectsStage({ convert: stand, findKtx: async () => ({ path: 'ktx', version: '4.4.2' }) }).run({
        client,
        writer,
        report,
        jobs: 8,
        outDir: out,
      });
      await report.write(out);
      reportJson = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson;

      const seen = new Set<string>();
      for (const stem of named) {
        const file = client.find('SFX', `${stem}.sfx`);
        if (file === null || seen.has(file)) continue;
        seen.add(file);
        const sfx = readSfx(new Uint8Array(readFileSync(file)), file);
        sfxFiles.push({ stem, sfx });
        for (const part of sfx.parts) {
          if (part.type === 3 || part.texture === '') continue;
          const frames = part.texFrame > 1 ? part.texFrame : 1;
          for (let i = 0; i < frames; i++) wanted.add(part.texFrame > 1 ? sfxTextureName(part.texture, i) : part.texture);
        }
      }
    }, 600_000);

    afterAll(async () => {
      await fs.rm(out, { recursive: true, force: true });
    });

    it('writes one effect for every distinct .sfx file the index names (some entries name a file the client lacks)', () => {
      expect(reportJson.failures).toEqual([]);
      expect(sfxFiles.length).toBeGreaterThan(600);
      expect(sfxFiles.length).toBeLessThan(named.length);
      expect(reportJson.kinds.effects!.ok).toBe(sfxFiles.length);
      for (const { stem } of sfxFiles) expect(writer.pathOf(`effects/${webName(stem)}.json`), stem).toBeDefined();
    });

    it('converts each texture the effects name once, and warns about each one the folder does not have', () => {
      const keys = new Set([...wanted].map((name) => textureKey('sfx', name)));
      const present = new Set([...wanted].filter((name) => client.find('SFX/Texture', name) !== null).map((name) => textureKey('sfx', name)));
      expect(converted).toHaveLength(present.size);
      expect(new Set(converted)).toEqual(present);
      expect(keys.size).toBeGreaterThan(1400);

      const missing = [...wanted].filter((name) => client.find('SFX/Texture', name) === null);
      const warned = reportJson.warnings.filter((w) => w.kind === 'effects' && /not in /.test(w.message));
      expect(warned).toHaveLength(new Set(missing.map(webName)).size);
      // [effects §4]: the missing names are among magician_*_casting.dds, cure1.bmp, test.dds, test2.dds and two sfx_skl* files
      for (const name of missing) {
        expect(['magician_fire_casting.dds', 'magician_wind_casting.dds', 'cure1.bmp', 'test.dds', 'test2.dds', 'sfx_sklblddswsilent12.dds', 'sfx_sklmerweasupport07.dds']).toContain(name.toLowerCase());
      }
    });

    it('counts the mesh parts', () => {
      const meshes = sfxFiles.reduce((n, { sfx }) => n + sfx.parts.filter((p) => p.type === 3).length, 0);
      expect(meshes).toBeGreaterThan(0);
      expect(reportJson.kinds.effectMeshParts!.ok).toBe(meshes);
    });

    it('keeps every animated texture name resolving to the folder (the C++ comment says every one does)', () => {
      const unresolved = [...wanted].filter((name) => client.find('SFX/Texture', name) === null).map((n) => n.toLowerCase());
      // animated frames of the missing names are missing too; any other missing name would be a GetTextureName mistake
      expect(unresolved.every((n) => /^(magician_|cure1|test|sfx_sklblddswsilent|sfx_sklmerweasupport)/.test(n))).toBe(true);
    });
  });
});
