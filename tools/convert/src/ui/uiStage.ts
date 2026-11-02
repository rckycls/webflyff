// The `ui` stage: the pictures Neuz draws its windows, icons, damage numbers and target marks with, as PNG files with the
// colour key made transparent, and the frame lists of the two glyph sheets:
//
//   ui/<web name>.png      every picture of Client/Icon (skill icons, the target corners, the action button ...), the pieces
//                          of Client/Theme/Default in THEME_FILES, and Client/SFX/DmgEffect.dds, each under the web name of
//                          its file name without the last extension (iconKeyOf)
//   ui/item/<web name>.png every picture of Client/Item, the item icons, under the same rule (itemIconKeyOf), which the data
//                          stage names in `itemProps.icon`
//   data/uiSheets.json     the frames of SFX/DmgEffect.inc and Icon/icon_target.inc (WebUiSheets)
//
// Neuz loads these pictures through D3DX with a colour key: the icons, theme pieces and target corners with 0xffff00ff
// (CWndBase::m_textureMng.AddTexture, 2DRender.cpp:1815; the DDS branch of CTexture::LoadTexture, :1206), a sheet with the key
// its script gives the `texture` statement (CTexturePack::LoadScript, :1590-1608: DmgEffect.inc has 0, which is no key at
// all). D3DX turns every pixel of the key colour, alpha included, into transparent black. `applyColorKey` does the same,
// with the keys read from the sheets' scripts for the files they name and 0xffff00ff for every other picture.
//
// Item icons (`ItemProp::szIcon`) are loaded from Client/Item (CItemBase::SetTexture, DIR_ITEM, Item.cpp:114), not from
// Client/Icon, which is where skills (`MakePath( DIR_ICON, ...)`, WndTaskBar.cpp:396) and the sheets load theirs. 8 file
// names are in both folders (`itm_gengemblad`, `skill_couple01` ...), so the two folders have separate key spaces and
// nothing collides. (A pet egg's icon is `szIcon` with `_00.`, `_01.` or `_02.` in place of the dot, by the pet's level:
// CItemBase::SetTexture builds that name at run time, so the key `itemProps.icon` names for an egg has no file.)
//
// Client/Icon holds 27 `.jpg` files (cloak logos) and no decoder reads JPEG here; one warning names them. No Piece 4
// window draws them.
//
// `--only` filters on the picture's file name (a glob, or a comma-separated list of globs); the stage name `ui` matches every
// picture. The sheets catalog is written when a sheet's picture is let through.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { UI_SHEETS_KEY, decodeImage, decodeScript, readTexturePack, webName } from '@flyffweb/formats';
import type { RgbaImage, TexturePack, WebUiSheet, WebUiSheets } from '@flyffweb/formats';
import { iconKeyOf, itemIconKeyOf } from '../output/keys';
import type { Stage, StageContext } from '../run';
import { encodePng } from '../textures/convertTexture';
import { listed, matchesOnly, plural, runLimited } from '../util';

const STAGE = 'ui';
const KIND = 'ui';

/** The colour key of the icons, theme pieces and target corners: opaque magenta (`0xffff00ff` in every AddTexture call). */
const MAGENTA_KEY = 0xffff00ff;

/** The pictures the converter reads: the formats `decodeImage` knows. */
const PICTURE = /\.(dds|tga|bmp)$/i;
const JPEG = /\.jpe?g$/i;

/**
 * The folders whose pictures are all converted, and the key rule of each: DIR_ICON and DIR_ITEM (path.h:31, :32). Their
 * key spaces are apart (see the top of this file).
 */
const PICTURE_FOLDERS: readonly { dir: string; keyOf: (file: string) => string }[] = [
  { dir: 'Icon', keyOf: iconKeyOf },
  { dir: 'Item', keyOf: itemIconKeyOf },
];
/** DIR_THEME (path.h:14). */
const THEME_DIR = 'Theme/Default';

/** `prefix00suffix` to `prefixNNsuffix`, numbered from `from` to `to` with two digits at least. */
const numbered = (prefix: string, from: number, to: number, suffix: string): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(2, '0')}${suffix}`);

/**
 * The pieces of Client/Theme/Default that the windows of Piece 4 draw (Task 22 and the skill-window task extend it, and
 * say why). Grouped by what draws them; `resdata.inc` is Resource/resdata.inc, the window layouts.
 */
export const THEME_FILES: readonly string[] = [
  // Default.thm wallpaper and APP_LOGIN / APP_SELECT_SERVER / APP_SELECT_CHAR (WndTitle.cpp).
  'Screen.bmp', 'WndSelectChar.tga', 'ButtLogin.bmp', 'ButtBack.tga', 'ButtNext.tga',
  'ButtCreate.tga', 'ButtDelete.tga', 'ButtAccept.tga',
  // CWndNavigator (WndField.cpp:9848): native controls, arrow, marker sheet and indoor fog.
  'ButtNavLeft.tga', 'ButtNavZoomIn.tga', 'ButtNavZoomOut.tga', 'ImgNavArrow.bmp', 'ImgNavObj.bmp', 'NavDunFog.tga',
  'ButtTeleport.bmp',
  'ImgNavPos.tga',
  'WORLD_Flyff.dds',
  // CWorldMap (WorldMap.cpp:92-225), Piece 6 M1: the continents' pictures, the buttons, each continent's monster icons,
  // the player's arrow, and the 9 pieces of the tooltip it opens (tooltip.cpp:70-89).
  'WORLD_Darkon12.dds', 'WORLD_Darkon3.dds', 'WORLD_Ricis.dds', 'WORLD_Saint.dds', 'WORLD_Flaris.dds',
  'WORLD_harmonin.dds', 'WORLD_Estia.dds',
  'TexMapButton.bmp',
  'TexMapMonster_Darkon12.bmp', 'TexMapMonster_Darkon3.bmp', 'TexMapMonster_Ricis.bmp', 'TexMapMonster_Saint.bmp',
  'TexMapMonster_Flaris.bmp', 'TexMapMonster_Harmonin.bmp', 'TexMapMonster_Estia.bmp',
  'ImgMapArrow.bmp',
  ...numbered('WndTooltipTile', 0, 8, '.tga'),
  // V15 inventory: APP_INVENTORY (resdata.inc), CWndInventory::OnInitialUpdate (WndField.cpp).
  'WndInventory3D.tga',
  'WndInventoryGarbage.dds',
  // The frame and title bar of every window: CWndNeuz::AdditionalSkinTexture (WndNeuz.cpp:269-290) paints a window whose
  // resdata.inc entry is tiled (APP_REVIVAL "WndTile07.tga", APP_SKILL3 "WndTile03.tga", APP_CHARACTER3 "Wndtile00.tga" ...)
  // from 12 pieces of 16 x 16, the file name without its last 6 characters, a two-digit number 0 to 11 and ".tga". Whatever
  // the number in the layout's name, the pieces are WndTile00 to WndTile11. The title text is drawn over the top row
  // (CWndBase::PaintFrame, WndBase.cpp:572-577).
  ...numbered('WndTile', 0, 11, '.tga'),
  // The buttons in the title bar (CWndNeuz::OnInitialUpdate, WndNeuz.cpp:57-88): help, minimise, maximise, close.
  'ButtWndHelp.tga',
  'ButtWndMin.tga',
  'ButtWndMax.tga',
  'ButtWndExit.tga',
  // Edit boxes and tab strips inside windows: the nine pieces CWndBase::AdditionalSkinTexture paints an edit control with
  // (WndBase.cpp:2549-2563; "WndEditTile00.tga" of APP_STATE_CONFIRM and APP_SKILL3, "WndEditTile200.tga" of APP_SKILL3)
  // and the tab control's pieces (WndControl.cpp:4288-4293, DEF_CTRL_TAB1 "WndTabTile00.bmp", ResManager.h:10).
  ...numbered('WndEditTile', 0, 8, '.tga'),
  ...numbered('WndEditTile2', 0, 8, '.tga'),
  ...numbered('WndTabTile', 0, 5, '.bmp'),
  ...numbered('WndTabTile', 10, 15, '.bmp'),
  // The status window (APP_STATUS1 "WndStatus2.tga", resdata.inc:3350) and its gauges (stats §5.1: HP, MP, FP with
  // GauEmptyNormal; EXP and rest with GauEmptySmall). The target bar uses GauEmptyNormal as well (combat §6).
  'WndStatus2.tga',
  'GauEmptyNormal.bmp',
  'GauEmptySmall.bmp',
  // The level-difference arrows of the target bar (CWndWorld::RenderSelectObj, WndWorld.cpp:3533-3536).
  'LvUp.bmp',
  'LvUp2.bmp',
  'LvDn.bmp',
  'LvDn2.bmp',
  // The Character window: the background of CWndCharInfo (WndField.cpp:3501) and its + - Apply Reset buttons (stats §3.1, §3.4).
  'WndNewCharacter01.tga',
  'ButtCharPlus.bmp',
  'ButtCharMinus.bmp',
  'ButtCharApply.tga',
  'ButtCharReset.tga',
  // Message boxes and the confirm box of the stat points (APP_MESSAGEBOX_OK, APP_MESSAGEBOX_OK_CANCEL, APP_STATE_CONFIRM).
  'WndMessagebox.tga',
  'ButtOk.tga',
  'ButtCancel.tga',
  'ButtYes.tga',
  'ButtNo.tga',
  // The box that asks before the skill points are spent (APP_QUEITMWARNING, resdata.inc:23229, CWndReSkillWarning): its
  // picture, the static WIDC_WARNING (resdata.inc:23266), not tiled, which CWndBase::AdditionalSkinTexture paints whole
  // (WndBase.cpp:2529-2545).
  'WndQueItmwarning.tga',
  // The revive window (APP_REVIVAL, resdata.inc:10964): its four buttons.
  'ButtLodestar.bmp',
  'ButtLodelight.bmp',
  'ButtReviveStand.bmp',
  'ButtFlyffShop.tga',
  // The task bar (APP_TASKBAR800 to APP_TASKBAR1680W, resdata.inc): the strip for each screen width, and its Start button
  // and the quick-list arrows.
  'WndTaskBar800.bmp',
  'WndTaskBar1024.bmp',
  'WndTaskBar1280.bmp',
  'WndTaskBar1360Wide.bmp',
  'WndTaskBar1400.bmp',
  'WndTaskBar1440Wide.bmp',
  'WndTaskBar1600.bmp',
  'WndTaskBar1680Wide.bmp',
  'ButtStart.bmp',
  'ButtQuickListUp.tga',
  'ButtQuickListDn.tga',
  // The Start menu (CWndTaskMenu::OnInitialUpdate, WndTaskBar.cpp:2646: the window is the picture's size), ruling R22.
  'WndTaskMenu.tga',
  // The skill window (APP_SKILL3, resdata.inc:6665), for milestone 2: the Vagrant backdrop and its buttons.
  'ImgSkillVagrant.tga',
  'ButItemPlus.bmp',
  'ButItemMinus.bmp',
  'ButtReset.bmp',
  'ButtFinish.bmp',
];

/** The two glyph sheets: the script, and the field of WebUiSheets it fills. */
const SHEETS = [
  { field: 'damageDigits', dir: 'SFX', script: 'DmgEffect.inc' }, // CDamageNumMng::LoadTexture, 2DRender.cpp:2004
  { field: 'targetCorners', dir: 'Icon', script: 'icon_target.inc' }, // CWndWorld, WndWorld.cpp:3511
] as const;

/**
 * Makes every pixel of the colour `key` (ARGB, alpha included) transparent black, as D3DX does for its ColorKey argument
 * (D3DXCreateTextureFromFileEx: "a 32-bit ARGB colour, independent of the source image format; alpha is significant"). A
 * source with no alpha counts as alpha 255. Key 0 means no key and returns the picture itself; otherwise a copy.
 */
export function applyColorKey(image: RgbaImage, key: number): RgbaImage {
  if (key === 0) return image;
  const a = (key >>> 24) & 0xff;
  const r = (key >>> 16) & 0xff;
  const g = (key >>> 8) & 0xff;
  const b = key & 0xff;
  const data = new Uint8Array(image.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === r && data[i + 1] === g && data[i + 2] === b && data[i + 3] === a) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, data };
}

/** A picture to convert. */
interface Picture {
  src: string;
  /** The logical key the PNG is written under. */
  key: string;
  colorKey: number;
}

/** A sheet's script, read: its frames, and the client file of its picture. */
interface Sheet {
  field: (typeof SHEETS)[number]['field'];
  /** The script's client path and size in bytes. */
  script: string;
  bytes: number;
  pack: TexturePack;
  /** The client file the script's `texture` statement names. */
  picture: string;
  /** The key the script gives its picture (the `texture` statement's last number). */
  colorKey: number;
}

/**
 * Reads a sheet's script and the size of its picture. The `texture` statement names the picture by a path from the client
 * folder (`sfx\DmgEffect.dds`, `icon\icon_target.dds`), as CTexturePack::LoadScript hands it to LoadTextureFromRes
 * (2DRender.cpp:1600-1605).
 */
async function readSheet(ctx: StageContext, spec: (typeof SHEETS)[number]): Promise<Sheet> {
  const script = ctx.client.find(spec.dir, spec.script);
  if (script === null) throw new Error(`Client/${spec.dir}/${spec.script} not found`);
  const raw = new Uint8Array(await fs.readFile(script));
  const text = decodeScript(raw);

  const { texture, colorKey } = readTexturePack(text, script);
  const where = texture.split(/[\\/]/);
  const picture = ctx.client.find(where.slice(0, -1).join('/'), where[where.length - 1]!);
  if (picture === null) throw new Error(`${script} names the picture "${texture}", which is not in the client folder`);

  // serialize cuts the picture row by row, so it needs the picture's size (m_size, set from the loaded picture)
  const { width, height } = decodeImage(new Uint8Array(await fs.readFile(picture)), picture);
  return { field: spec.field, script, bytes: raw.length, pack: readTexturePack(text, script, { width, height }), picture, colorKey };
}

async function convertPicture({ src, key, colorKey }: Picture, ctx: StageContext): Promise<void> {
  const bytes = new Uint8Array(await fs.readFile(src));
  const png = encodePng(applyColorKey(decodeImage(bytes, src), colorKey), true);
  await ctx.writer.write(key, png, src);
  ctx.report.ok(KIND, src, bytes.length, png.length);
}

export interface UiStageOptions {
  /** For tests: the pieces of Client/Theme/Default to convert. */
  themeFiles?: readonly string[];
}

export function createUiStage(options: UiStageOptions = {}): Stage {
  const themeFiles = options.themeFiles ?? THEME_FILES;

  return {
    name: STAGE,
    async run(ctx: StageContext) {
      const all = matchesOnly(STAGE, ctx.only);
      const wanted = (file: string): boolean => all || matchesOnly(path.basename(file), ctx.only);

      // The sheets' scripts first: they give the colour key of the pictures they name, and their frames the catalog.
      const sheets: Sheet[] = [];
      for (const spec of SHEETS) {
        try {
          sheets.push(await readSheet(ctx, spec));
        } catch (error) {
          ctx.report.fail(KIND, `${spec.dir}/${spec.script}`, error);
        }
      }
      const sheetKeys = new Map(sheets.map((sheet) => [sheet.picture, sheet.colorKey]));

      const pictures = new Map<string, Picture>();
      // CLandscape loads the DDS beside each landscape tile, without a colour key (lod.cpp:1420).
      for (const src of ctx.client.list('World', /\d{2}-\d{2}\.dds$/i, true)) {
        const match = /^(.+?)(\d{2})-(\d{2})\.dds$/i.exec(path.basename(src));
        if (match !== null && wanted(src)) pictures.set(src, { src,
          key: `minimaps/${webName(match[1]!)}/${Number(match[2])}_${Number(match[3])}.png`, colorKey: 0 });
      }
      const add = (src: string, keyOf: (file: string) => string): void => {
        if (wanted(src)) {
          pictures.set(src, { src, key: keyOf(path.basename(src)), colorKey: sheetKeys.get(src) ??
            (/^world_/i.test(path.basename(src)) ? 0xff000000 : /^imgnavpos\./i.test(path.basename(src)) ? 0 : MAGENTA_KEY) });
        }
      };
      for (const { dir, keyOf } of PICTURE_FOLDERS) for (const src of ctx.client.list(dir, PICTURE)) add(src, keyOf);
      for (const name of themeFiles) {
        if (!wanted(name)) continue;
        const src = ctx.client.find(THEME_DIR, name);
        if (src === null) {
          ctx.report.warn(KIND, `${THEME_DIR}/${name}`, `${name} is not in Client/${THEME_DIR}, so it is not converted`);
        } else {
          add(src, iconKeyOf);
        }
      }
      for (const sheet of sheets) add(sheet.picture, iconKeyOf);

      const jpegs = PICTURE_FOLDERS.flatMap(({ dir }) => ctx.client.list(dir, JPEG)).filter(wanted);
      if (jpegs.length > 0) {
        ctx.report.warn(
          KIND,
          PICTURE_FOLDERS[0]!.dir,
          `${plural(jpegs.length, 'JPEG icon')} not converted (no decoder reads JPEG, and no Piece 4 window draws them): ` +
            listed(jpegs.map((file) => path.basename(file))),
        );
      }

      await runLimited([...pictures.values()], ctx.jobs, async (picture) => {
        try {
          await convertPicture(picture, ctx);
        } catch (error) {
          ctx.report.fail(KIND, picture.src, error);
        }
      });

      // The catalog needs both sheets; it is written when a sheet's picture was let through.
      if (sheets.length === SHEETS.length && sheets.some((sheet) => pictures.has(sheet.picture))) {
        try {
          const sheetOf = (field: Sheet['field']): WebUiSheet => {
            const sheet = sheets.find((candidate) => candidate.field === field)!;
            return { image: iconKeyOf(path.basename(sheet.picture)), frames: sheet.pack.frames };
          };
          const catalog: WebUiSheets = { damageDigits: sheetOf('damageDigits'), targetCorners: sheetOf('targetCorners') };
          const json = new TextEncoder().encode(JSON.stringify(catalog));
          await ctx.writer.write(UI_SHEETS_KEY, json, sheets[0]!.script);
          ctx.report.ok(KIND, sheets[0]!.script, sheets.reduce((n, sheet) => n + sheet.bytes, 0), json.length);
        } catch (error) {
          ctx.report.fail(KIND, UI_SHEETS_KEY, error);
        }
      }
    },
  };
}

export const uiStage: Stage = createUiStage();
