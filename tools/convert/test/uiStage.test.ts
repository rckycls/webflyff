// The UI stage on a small hand-made client: icons, theme pieces and the two glyph sheets as loose files. The real client
// (every Piece 4 piece present, the sheets' frame counts) is a corpus test: uiStage.corpus.test.ts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTexturePack } from '@flyffweb/formats';
import type { RgbaImage, WebUiSheets } from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import { DEFAULT_STAGES } from '../src/run';
import type { StageContext } from '../src/run';
import { THEME_FILES, applyColorKey, createUiStage } from '../src/ui/uiStage';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';
import { MAGENTA, bmp24, dds, solidDds, tga32 } from './helpers/images';
import type { ReportJson, Run } from './helpers/worldRun';

describe('ui stage', () => {
  it('runs after the effects stage, and before the worlds and data stages', () => {
    const names = DEFAULT_STAGES.map((s) => s.name);
    expect(names.indexOf('ui')).toBe(names.indexOf('effects') + 1);
    expect(names.indexOf('ui')).toBeLessThan(names.indexOf('worlds'));
    expect(names.indexOf('data')).toBe(names.length - 1);
  });
});

describe('the theme list', () => {
  it('names each piece once, whatever the case, and keeps the pieces the brief fixes', () => {
    const lower = THEME_FILES.map((file) => file.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    for (const file of ['gauemptynormal.bmp', 'lvup.bmp', 'lvup2.bmp', 'lvdn.bmp', 'lvdn2.bmp', 'wndnewcharacter01.tga']) {
      expect(lower).toContain(file);
    }
    expect(lower.filter((file) => /^wndtile\d\d\.tga$/.test(file))).toHaveLength(12); // the 12 pieces of a window frame
    expect(lower.filter((file) => /^buttchar/.test(file))).toHaveLength(4);
  });
});

describe('applyColorKey', () => {
  const image = (pixels: number[][]): RgbaImage => ({
    width: pixels.length,
    height: 1,
    data: Uint8Array.from(pixels.flat()),
  });

  it('turns every pixel of the key colour into transparent black', () => {
    const keyed = applyColorKey(image([MAGENTA, [10, 20, 30, 255], MAGENTA]), 0xffff00ff);
    expect(Array.from(keyed.data)).toEqual([0, 0, 0, 0, 10, 20, 30, 255, 0, 0, 0, 0]);
  });

  it('compares the alpha as well, as D3DX does: a see-through magenta stays', () => {
    const keyed = applyColorKey(image([[255, 0, 255, 128], [255, 0, 255, 0]]), 0xffff00ff);
    expect(Array.from(keyed.data)).toEqual([255, 0, 255, 128, 255, 0, 255, 0]);
  });

  it('leaves the picture alone for key 0, which D3DX reads as "no colour key"', () => {
    const original = image([MAGENTA]);
    expect(applyColorKey(original, 0)).toBe(original);
  });

  it('does not change the picture it is given', () => {
    const original = image([MAGENTA]);
    applyColorKey(original, 0xffff00ff);
    expect(Array.from(original.data)).toEqual(MAGENTA);
  });
});

describe('the UI stage on a small hand-made client', () => {
  let root: string;
  let out: string;

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-ui-client-');
    out = await makeTempDir('flyffweb-ui-out-');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  const INC_DMG = [
    '// a comment',
    'number 3',
    'texture "sfx\\DmgEffect.dds" 0x00000000',
    'serialize 2 8 8 0 0 0 0',
    'pos 16 8 0 8 n',
  ].join('\r\n');
  const INC_TARGET = [
    'number 2',
    'texture "icon\\icon_target.dds" 0xffff00ff',
    'pos 8 8 0 0 n',
    'pos 8 8 0 0 h',
  ].join('\r\n');

  /** A picture with a magenta pixel first, then a plain one. */
  const withMagenta = (): Uint8Array => dds(16, 16, Array.from({ length: 256 }, (_, i) => (i === 0 ? MAGENTA : [1, 2, 3, 255])));

  const files = (): Record<string, string | Uint8Array> => ({
    'Icon/Skill_VagOneCleanh.dds': withMagenta(),
    'Icon/itm_Foo.TGA': tga32(2, 1, [MAGENTA, [4, 5, 6, 255]]),
    'Icon/Weird Name.bmp': bmp24(2, 2, [[255, 0, 255], [1, 2, 3], [4, 5, 6], [7, 8, 9]]),
    'Icon/icon_target.dds': withMagenta(),
    'Icon/icon_target.inc': INC_TARGET,
    'Icon/Photo01.jpg': 'not decoded',
    'Icon/readme.txt': 'not a picture',
    'SFX/DmgEffect.dds': withMagenta(),
    'SFX/DmgEffect.inc': INC_DMG,
    'SFX/other.dds': solidDds(2, 2, [1, 1, 1, 255]), // another file of SFX: not a UI picture
    'Theme/Default/WndTile00.tga': tga32(1, 1, [[10, 20, 30, 40]]),
    'Theme/Default/GAUEMPTYNORMAL.BMP': bmp24(1, 1, [[255, 0, 255]]),
    'Theme/Default/NotInTheList.tga': tga32(1, 1, [[1, 1, 1, 255]]),
  });

  const THEME = ['WndTile00.tga', 'GauEmptyNormal.bmp', 'ButtNowhere.bmp'];

  async function runUi(extra: Record<string, string | Uint8Array> = {}, only?: string): Promise<Run> {
    await writeFakeClient(root, { loose: { ...files(), ...extra } });
    const writer = new AssetWriter(out);
    const report = new Report();
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report, only, jobs: 2, outDir: out };
    await createUiStage({ themeFiles: THEME }).run(ctx);
    await report.write(out);
    return { writer, report: JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson, out };
  }

  async function png(run: Run, key: string): Promise<PNG> {
    const hashed = run.writer.pathOf(key);
    expect(hashed, key).toBeDefined();
    return PNG.sync.read(await fs.readFile(path.join(run.out, ...hashed!.split('/'))));
  }

  const pixel = (image: PNG, x: number, y: number): number[] => {
    const i = (y * image.width + x) * 4;
    return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!];
  };

  it('writes every icon, the listed theme pieces and DmgEffect as ui/<web name>.png', async () => {
    const run = await runUi();

    const keys = ['ui/skill_vagonecleanh.png', 'ui/itm_foo.png', 'ui/weird-name.png', 'ui/icon_target.png', 'ui/wndtile00.png', 'ui/gauemptynormal.png', 'ui/dmgeffect.png'];
    for (const key of keys) expect(run.writer.pathOf(key), key).toMatch(/^ui\/[a-z0-9_-]+\.[0-9a-f]{10}\.png$/);
    // not in the list, not an icon, not a picture
    expect(run.writer.pathOf('ui/notinthelist.png')).toBeUndefined();
    expect(run.writer.pathOf('ui/other.png')).toBeUndefined();
    expect(run.writer.pathOf('ui/readme.png')).toBeUndefined();
    expect(run.report.kinds.ui).toMatchObject({ ok: keys.length + 1, failed: 0 }); // the pictures and the sheets catalog
  });

  it('makes magenta transparent, in a DDS, a TGA and a BMP', async () => {
    const run = await runUi();

    const dxt = await png(run, 'ui/skill_vagonecleanh.png');
    expect([dxt.width, dxt.height]).toEqual([16, 16]);
    expect(pixel(dxt, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(dxt, 1, 0)).toEqual([1, 2, 3, 255]);

    expect(pixel(await png(run, 'ui/itm_foo.png'), 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(await png(run, 'ui/itm_foo.png'), 1, 0)).toEqual([4, 5, 6, 255]);
    expect(pixel(await png(run, 'ui/weird-name.png'), 0, 0)).toEqual([0, 0, 0, 0]); // the BMP's first (top-left) pixel
    expect(pixel(await png(run, 'ui/weird-name.png'), 1, 0)).toEqual([1, 2, 3, 255]);
    expect(pixel(await png(run, 'ui/gauemptynormal.png'), 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('keeps the alpha a picture has', async () => {
    const run = await runUi();
    expect(pixel(await png(run, 'ui/wndtile00.png'), 0, 0)).toEqual([10, 20, 30, 40]);
  });

  it('applies the colour key a sheet script gives its picture: none for DmgEffect, magenta for icon_target', async () => {
    const run = await runUi();
    expect(pixel(await png(run, 'ui/dmgeffect.png'), 0, 0)).toEqual(MAGENTA); // DmgEffect.inc: 0x00000000
    expect(pixel(await png(run, 'ui/icon_target.png'), 0, 0)).toEqual([0, 0, 0, 0]); // icon_target.inc: 0xffff00ff
  });

  it('writes data/uiSheets.json with the frames of the two scripts and the keys of their pictures', async () => {
    const run = await runUi();

    const hashed = run.writer.pathOf('data/uiSheets.json');
    expect(hashed).toMatch(/^data\/uiSheets\.[0-9a-f]{10}\.json$/);
    const sheets = JSON.parse(await fs.readFile(path.join(out, ...hashed!.split('/')), 'utf8')) as WebUiSheets;

    expect(sheets.damageDigits.image).toBe('ui/dmgeffect.png');
    expect(sheets.damageDigits.frames).toEqual(readTexturePack(INC_DMG, 'DmgEffect.inc', { width: 16, height: 16 }).frames);
    expect(sheets.damageDigits.frames).toEqual([
      { x: 0, y: 0, w: 8, h: 8 },
      { x: 8, y: 0, w: 8, h: 8 },
      { x: 0, y: 8, w: 16, h: 8 },
    ]);
    expect(sheets.targetCorners.image).toBe('ui/icon_target.png');
    expect(sheets.targetCorners.frames).toEqual([
      { x: 0, y: 0, w: 8, h: 8 },
      { x: 0, y: 0, w: 8, h: 8, flip: 'h' },
    ]);
  });

  it('reports a piece of the theme list that the client does not have as a warning, and a .jpg icon once', async () => {
    const run = await runUi();

    expect(run.report.failures).toEqual([]);
    const nowhere = run.report.warnings.filter((w) => w.message.includes('ButtNowhere.bmp'));
    expect(nowhere).toHaveLength(1);
    expect(nowhere[0]!.kind).toBe('ui');
    const jpg = run.report.warnings.filter((w) => /\.jpg/i.test(w.message));
    expect(jpg).toHaveLength(1);
    expect(jpg[0]!.message).toContain('Photo01.jpg');
  });

  it('reports a picture it cannot decode as a failure and writes the others', async () => {
    const run = await runUi({ 'Icon/Broken.dds': 'not a dds file' });

    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]).toMatchObject({ kind: 'ui' });
    expect(run.report.failures[0]!.source).toMatch(/Broken\.dds$/);
    expect(run.writer.pathOf('ui/skill_vagonecleanh.png')).toBeDefined();
    expect(run.writer.pathOf('ui/broken.png')).toBeUndefined();
  });

  it('reports two files that make one key as a failure of the second', async () => {
    const run = await runUi({ 'Icon/Itm_Foo.bmp': bmp24(1, 1, [[1, 2, 3]]) });

    expect(run.report.failures).toHaveLength(1);
    expect(run.report.failures[0]!.message).toMatch(/name collision on "ui\/itm_foo\.png"/);
  });

  describe('--only', () => {
    it('converts the pictures whose name matches the glob, and still writes the sheets when one of them is named', async () => {
      const run = await runUi({}, 'skill_*,dmgeffect');

      expect(run.writer.pathOf('ui/skill_vagonecleanh.png')).toBeDefined();
      expect(run.writer.pathOf('ui/dmgeffect.png')).toBeDefined();
      expect(run.writer.pathOf('ui/itm_foo.png')).toBeUndefined();
      expect(run.writer.pathOf('ui/wndtile00.png')).toBeUndefined();
      expect(run.writer.pathOf('data/uiSheets.json')).toBeDefined();
    });

    it('runs every picture when the glob matches the stage name', async () => {
      const run = await runUi({}, 'ui');
      expect(run.report.kinds.ui).toMatchObject({ ok: 8 });
    });

    it('does nothing for a glob that matches no picture', async () => {
      const run = await runUi({}, 'wdmadrigal');
      expect(run.report.kinds.ui).toBeUndefined();
      expect(run.writer.pathOf('data/uiSheets.json')).toBeUndefined();
    });
  });
});
