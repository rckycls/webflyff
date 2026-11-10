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
import { BARE_ICONS, THEME_FILES, applyColorKey, createUiStage, stripIconFrame } from '../src/ui/uiStage';
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
    // the task bar's Start menu (CWndTaskMenu::OnInitialUpdate, WndTaskBar.cpp:2646)
    expect(lower).toContain('wndtaskmenu.tga');
    expect(lower).toContain('wndinventory3d.tga');
    // the world map (WorldMap.cpp:92-225): 8 pictures, the buttons, 7 monster sheets, the arrow, the tooltip's 9 pieces
    expect(lower.filter((file) => /^world_\w+\.dds$/.test(file))).toHaveLength(8);
    expect(lower.filter((file) => /^texmapmonster_\w+\.bmp$/.test(file))).toHaveLength(7);
    expect(lower.filter((file) => /^wndtooltiptile0\d\.tga$/.test(file))).toHaveLength(9);
    expect(lower).toContain('texmapbutton.bmp');
    expect(lower).toContain('imgmaparrow.bmp');
    // the sound sliders of the Option window (WndOptionGame.cpp:75-76)
    expect(lower).toContain('wndvolumebar.tga');
    expect(lower).toContain('buttspin.tga');
  });
});

describe('the dialogue window (APP_DIALOG_EX, WndDialog.cpp)', () => {
  it("lists the charge gauge's five pieces and the four first jobs' skill panels once each (Piece 7 M2)", () => {
    const lower = THEME_FILES.map((file) => file.toLowerCase());
    for (const file of ['gaumagchargebg.tga', 'gaumagchargehead.tga', 'gaumagchargebody.tga', 'gaumagchargebody2.tga',
      'gaumagchargetail.tga', 'back_me.tga', 'back_as.tga', 'back_ma.tga', 'back_acr.tga']) {
      expect(lower.filter((name) => name === file), file).toHaveLength(1);
    }
  });

  it('lists its background, its next-page button and the four quest papers once each', () => {
    const lower = THEME_FILES.map((file) => file.toLowerCase());
    for (const file of ['wnddialogex.tga', 'wndbuttenter.bmp', 'questuipapergreen.tga', 'questuipaperred.tga',
      'questuipapergray.tga', 'questuipaperyellow.tga']) {
      expect(lower.filter((name) => name === file), file).toHaveLength(1);
    }
  });

  it("lists the pet windows' pictures once each, the buff pet's with the space in its name (2026-11-09)", () => {
    const lower = THEME_FILES.map((file) => file.toLowerCase());
    for (const file of ['petstatusbg.tga', 'petlevelbg.tga', 'buffpetstatusbg .tga', 'butchance.bmp', 'butcancel2.bmp',
      'butmiracle.bmp', 'butok2.bmp', 'wndelemitemblank.tga', 'wndchgelemitem.bmp']) {
      expect(lower.filter((name) => name === file), file).toHaveLength(1);
    }
  });

  it("lists the quest window's buttons, the tree's pictures and the map's destination mark once each", () => {
    const lower = THEME_FILES.map((file) => file.toLowerCase());
    for (const file of ['buttremovequest.bmp', 'buttclose.tga', 'buttcheck.bmp', 'butttreeopen.tga', 'butttreeclose.tga',
      'buttdestination.bmp']) {
      expect(lower.filter((name) => name === file), file).toHaveLength(1);
    }
  });

  let root: string;
  let out: string;
  beforeEach(async () => { root = await makeTempDir('flyffweb-ui-dialog-'); out = await makeTempDir('flyffweb-ui-dialog-out-'); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(out, { recursive: true, force: true }); });

  it('keys the quest papers with white (WndDialog.cpp:254-257), and writes Client/Char under ui/char/ with magenta', async () => {
    await writeFakeClient(root, { loose: {
      'Theme/Default/QuestUiPaperGreen.tga': tga32(2, 1, [[255, 255, 255, 255], MAGENTA]),
      'Char/char_Juria.tga': tga32(2, 1, [MAGENTA, [1, 2, 3, 255]]),
    } });
    const writer = new AssetWriter(out);
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report: new Report(), jobs: 1, outDir: out };
    await createUiStage({ themeFiles: ['QuestUiPaperGreen.tga'] }).run(ctx);
    const read = async (key: string): Promise<PNG> => PNG.sync.read(await fs.readFile(path.join(out, ...writer.pathOf(key)!.split('/'))));
    const paper = await read('ui/questuipapergreen.png');
    expect([paper.data[3], paper.data[7]]).toEqual([0, 255]);
    expect(writer.pathOf('ui/char/char_juria.png')).toMatch(/^ui\/char\/char_juria\.[0-9a-f]{10}\.png$/);
    const picture = await read('ui/char/char_juria.png');
    expect([picture.data[3], picture.data[7]]).toEqual([0, 255]);
    expect(writer.pathOf('ui/char_juria.png')).toBeUndefined();
  });

  it('writes the buff pet window\'s "BuffpetStatusBg .tga" under ui/buffpetstatusbg-.png, magenta keyed (2026-11-09)', async () => {
    await writeFakeClient(root, { loose: { 'Theme/Default/BuffpetStatusBg .tga': tga32(2, 1, [MAGENTA, [1, 2, 3, 255]]) } });
    const writer = new AssetWriter(out);
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report: new Report(), jobs: 1, outDir: out };
    await createUiStage({ themeFiles: ['BuffpetStatusBg .tga'] }).run(ctx);
    const picture = PNG.sync.read(await fs.readFile(path.join(out, ...writer.pathOf('ui/buffpetstatusbg-.png')!.split('/'))));
    expect([picture.data[3], picture.data[7]]).toEqual([0, 255]);
  });
});

describe('the pictures of the sound sliders', () => {
  let root: string;
  let out: string;
  beforeEach(async () => { root = await makeTempDir('flyffweb-ui-spin-'); out = await makeTempDir('flyffweb-ui-spin-out-'); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(out, { recursive: true, force: true }); });

  it('keys ButtSpin.tga with white, as CWndOptionGame loads it (0xffffffff), and WndVolumeBar.tga with magenta', async () => {
    await writeFakeClient(root, { loose: {
      'Theme/Default/ButtSpin.tga': tga32(2, 1, [[255, 255, 255, 255], [1, 2, 3, 255]]),
      'Theme/Default/WndVolumeBar.tga': tga32(2, 1, [MAGENTA, [255, 255, 255, 255]]),
    } });
    const writer = new AssetWriter(out);
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report: new Report(), jobs: 1, outDir: out };
    await createUiStage({ themeFiles: ['ButtSpin.tga', 'WndVolumeBar.tga'] }).run(ctx);
    const read = async (key: string): Promise<PNG> => PNG.sync.read(await fs.readFile(path.join(out, ...writer.pathOf(key)!.split('/'))));
    const spin = await read('ui/buttspin.png');
    expect([spin.data[3], spin.data[7]]).toEqual([0, 255]);
    const bar = await read('ui/wndvolumebar.png');
    expect([bar.data[3], bar.data[7]]).toEqual([0, 255]);
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

/**
 * A Start-menu applet icon as Client/Icon has it (Icon_Skill.dds and the others, 32 x 32): magenta outside, the rim (the top
 * two rows, the left and right columns and the bottom row of the panel from (1, 1) to (30, 30)), the white panel, and a
 * drawing: an ink square from (10, 10) to (20, 20) with white inside it.
 */
function framedIcon(): number[][] {
  const pixels: number[][] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (x === 0 || y === 0 || x === 31 || y === 31) pixels.push(MAGENTA);
      else if (y <= 2 || y === 30 || x === 1 || x === 30) pixels.push([255, 165, 140, 255]);
      else if (x >= 10 && x <= 20 && y >= 10 && y <= 20) pixels.push(x === 10 || x === 20 || y === 10 || y === 20 ? [10, 20, 30, 255] : [255, 255, 255, 255]);
      else pixels.push([255, 255, 255, 255]);
    }
  }
  return pixels;
}

const imageOf = (pixels: number[][], width = 32, height = 32): RgbaImage =>
  ({ width, height, data: Uint8Array.from(pixels.flat()) });
const at = (image: RgbaImage, x: number, y: number): number[] => [...image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

describe('stripIconFrame (2026-11-10, the phone shortcuts: the icon alone)', () => {
  it('clears the rim and the white panel around the drawing, and keeps the drawing and the white inside it', () => {
    const bare = stripIconFrame(imageOf(framedIcon()));
    for (const [x, y] of [[1, 1], [15, 1], [15, 2], [1, 15], [30, 15], [15, 30], [30, 30]]) expect(at(bare, x!, y!), `rim ${x},${y}`).toEqual([0, 0, 0, 0]);
    for (const [x, y] of [[2, 3], [5, 5], [29, 29], [9, 15], [21, 15]]) expect(at(bare, x!, y!), `panel ${x},${y}`).toEqual([0, 0, 0, 0]);
    expect(at(bare, 10, 10)).toEqual([10, 20, 30, 255]);
    expect(at(bare, 20, 15)).toEqual([10, 20, 30, 255]);
    expect(at(bare, 15, 15)).toEqual([255, 255, 255, 255]); // enclosed by the drawing: kept
  });

  it('leaves a picture of another size, or with no white panel, alone', () => {
    const small = imageOf([[255, 255, 255, 255]], 1, 1);
    expect(stripIconFrame(small)).toBe(small);
    const noPanel = imageOf(Array.from({ length: 32 * 32 }, () => [1, 2, 3, 255]));
    expect(stripIconFrame(noPanel)).toBe(noPanel);
  });

  it('does not change the picture it is given', () => {
    const image = imageOf(framedIcon());
    const before = [...image.data];
    stripIconFrame(image);
    expect([...image.data]).toEqual(before);
  });

  it("names the phone shortcuts' eight icons, in the Start menu's order (FuncApplet.cpp:179-260)", () => {
    expect(BARE_ICONS.map((file) => file.toLowerCase())).toEqual([
      'icon_status.dds', 'icon_character.dds', 'icon_inventory.dds', 'icon_skill.dds', 'icon_quest.dds', 'icon_applet.dds',
      'icon_messenger.dds', 'icon_troupe.dds',
    ]);
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
    // item icons (ItemProp::szIcon): Client/Item, with a name that is also one in Client/Icon
    'Item/itm_Foo.dds': dds(2, 1, [[7, 8, 9, 255], MAGENTA]),
    'Item/ITM_Bar.TGA': tga32(2, 1, [MAGENTA, [1, 2, 3, 255]]),
    'Item/items.zip': 'not a picture',
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
    // the two item icons, below, and the sheets catalog
    expect(run.report.kinds.ui).toMatchObject({ ok: keys.length + 2 + 1, failed: 0 });
  });

  it('writes the pictures of Client/Item under ui/item/, apart from a Client/Icon file of the same name', async () => {
    const run = await runUi();

    for (const key of ['ui/item/itm_foo.png', 'ui/item/itm_bar.png']) {
      expect(run.writer.pathOf(key), key).toMatch(/^ui\/item\/itm_[a-z]+\.[0-9a-f]{10}\.png$/);
    }
    // Icon/itm_Foo.TGA and Item/itm_Foo.dds are two pictures with two keys, and no collision
    expect(run.report.failures).toEqual([]);
    const icon = await png(run, 'ui/itm_foo.png');
    const item = await png(run, 'ui/item/itm_foo.png');
    expect(pixel(icon, 1, 0)).toEqual([4, 5, 6, 255]);
    expect(pixel(item, 0, 0)).toEqual([7, 8, 9, 255]);
    // an item icon has the colour key too
    expect(pixel(item, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(await png(run, 'ui/item/itm_bar.png'), 0, 0)).toEqual([0, 0, 0, 0]);
    // nothing of Client/Item leaks into the plain space, and the zip is not a picture
    expect(run.writer.pathOf('ui/itm_bar.png')).toBeUndefined();
    expect(run.writer.pathOf('ui/item/items.png')).toBeUndefined();
  });

  it('preserves native landscape minimap DDS art without applying the UI magenta colour key', async () => {
    const run = await runUi({ 'World/WdTest/WdTest03-07.dds': dds(2, 1, [MAGENTA, [4, 5, 6, 255]]) });
    const map = await png(run, 'minimaps/wdtest/3_7.png');
    expect(pixel(map, 0, 0)).toEqual(MAGENTA);
    expect(pixel(map, 1, 0)).toEqual([4, 5, 6, 255]);
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

  it('converts the original quest and dialog sheets with their script frames and transparency keys', async () => {
    const run = await runUi({
      'Icon/icon_QuestEmoticon.inc': 'number 5 texture "Icon/icon_QuestEmoticon.dds" 0xffff00ff serialize 5 32 32 0 0 0 0',
      'Icon/icon_QuestEmoticon.dds': solidDds(160, 32, MAGENTA),
      'Theme/Default/texDialogEmoticon.inc': 'number 1 texture "Theme/Default/texDialogEmoticon.dds" 0xffff00ff serialize 1 32 32 0 0 0 0',
      'Theme/Default/texDialogEmoticon.dds': solidDds(32, 32, [255, 125, 0, 255]),
    }, 'icon_QuestEmoticon,texDialogEmoticon');
    const sheets = JSON.parse(await fs.readFile(path.join(out, run.writer.pathOf('data/uiSheets.json')!), 'utf8')) as WebUiSheets;
    expect(sheets.questEmoticons?.frames[4]).toEqual({ x: 128, y: 0, w: 32, h: 32 });
    expect(sheets.dialogEmoticons?.frames[0]).toEqual({ x: 0, y: 0, w: 32, h: 32 });
    const quest = await png(run, sheets.questEmoticons!.image);
    expect([...quest.data.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    const dialog = await png(run, sheets.dialogEmoticons!.image);
    expect([...dialog.data.slice(0, 4)]).toEqual([255, 125, 0, 255]);
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

  it("writes a bare copy of the phone shortcuts' icons under ui/bare/, and the icon itself as before", async () => {
    const run = await runUi({ 'Icon/icon_skill.dds': dds(32, 32, framedIcon()), 'Icon/Icon_Motion.dds': dds(32, 32, framedIcon()) });
    expect(run.report.failures).toEqual([]);
    const full = await png(run, 'ui/icon_skill.png');
    expect(pixel(full, 5, 5)).toEqual([255, 255, 255, 255]);
    expect(pixel(full, 15, 1)).toEqual([255, 165, 140, 255]);
    const bare = await png(run, 'ui/bare/icon_skill.png');
    expect([bare.width, bare.height]).toEqual([32, 32]);
    expect(pixel(bare, 5, 5)).toEqual([0, 0, 0, 0]);
    expect(pixel(bare, 15, 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(bare, 10, 10)).toEqual([10, 20, 30, 255]);
    // only the icons the shortcuts show
    expect(run.writer.pathOf('ui/icon_motion.png')).toBeDefined();
    expect(run.writer.pathOf('ui/bare/icon_motion.png')).toBeUndefined();
  });

  it('writes the bare copy with --only naming the icon', async () => {
    const run = await runUi({ 'Icon/icon_skill.dds': dds(32, 32, framedIcon()) }, 'icon_skill');
    expect(run.writer.pathOf('ui/icon_skill.png')).toBeDefined();
    expect(run.writer.pathOf('ui/bare/icon_skill.png')).toBeDefined();
    expect(run.writer.pathOf('ui/itm_foo.png')).toBeUndefined();
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
      expect(run.report.kinds.ui).toMatchObject({ ok: 10 });
    });

    it('does nothing for a glob that matches no picture', async () => {
      const run = await runUi({}, 'wdmadrigal');
      expect(run.report.kinds.ui).toBeUndefined();
      expect(run.writer.pathOf('data/uiSheets.json')).toBeUndefined();
    });
  });
});
