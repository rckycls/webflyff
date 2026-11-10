// The `ui` stage: the pictures Neuz draws its windows, icons, damage numbers and target marks with, as PNG files with the
// colour key made transparent, and the frame lists of the two glyph sheets:
//
//   ui/<web name>.png      every picture of Client/Icon (skill icons, the target corners, the action button ...), the pieces
//                          of Client/Theme/Default in THEME_FILES, and Client/SFX/DmgEffect.dds, each under the web name of
//                          its file name without the last extension (iconKeyOf)
//   ui/item/<web name>.png every picture of Client/Item, the item icons, under the same rule (itemIconKeyOf), which the data
//                          stage names in `itemProps.icon`
//   ui/char/<web name>.png every picture of Client/Char, the NPCs' dialogue pictures (charPictureKeyOf), which the data
//                          stage names in `npcs.image`
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
import { bareIconKeyOf, charPictureKeyOf, iconKeyOf, itemIconKeyOf } from '../output/keys';
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
 * The folders whose pictures are all converted, and the key rule of each: DIR_ICON and DIR_ITEM (path.h:31, :32), and
 * `char\`, the NPCs' dialogue pictures (WndDialog.cpp:294, magenta key). Their key spaces are apart (see the top of this
 * file).
 */
const PICTURE_FOLDERS: readonly { dir: string; keyOf: (file: string) => string }[] = [
  { dir: 'Icon', keyOf: iconKeyOf },
  { dir: 'Item', keyOf: itemIconKeyOf },
  { dir: 'Char', keyOf: charPictureKeyOf },
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
  // the Sound Option sliders of the Option window (CWndOptionGame::OnInitialUpdate, WndOptionGame.cpp:75-76)
  'WndVolumeBar.tga', 'ButtSpin.tga',
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
  // Piece 7 M2: the wand's and the bow's charge gauge (CMover::RenderGauge, MoverRender.cpp:925-986; Neuz.cpp:1613-1617),
  // and the four first jobs' panels of the skill window (CWndSkillTreeEx::InitItem, WndField.cpp:6803, :6835, :6867, :6875).
  'GauMagChargeBG.TGA',
  'GauMagChargeHead.TGA',
  'GauMagChargeBody.TGA',
  'GauMagChargeBody2.tga',
  'GauMagChargeTail.TGA',
  // Piece 7 M3: an item cast's gauge (CMover::RenderCasting, MoverRender.cpp:1982-2043; Neuz.cpp:1624-1625), and the
  // Scroll of Return's village radios (APP_COMM_SELECTVIL, resdata.inc:24294-24356)
  'GauAccelBG.TGA',
  'GauAccelInner.TGA',
  'ButtRadio.bmp',
  'Back_Me.TGA',
  'Back_As.TGA',
  'Back_Ma.TGA',
  'Back_Acr.tga',
  // the second jobs' panels (2026-11-05, CWndSkillTreeEx::InitItem's strTex[1])
  'Back_Night.TGA', 'Back_Blade.TGA', 'Back_Jst.TGA', 'Back_Rag.TGA', 'Back_Ring.TGA', 'Back_Bill.TGA', 'Back_Psy.TGA', 'Back_Ele.TGA',
  // The dialogue window (APP_DIALOG_EX "WndDialogEx.tga", resdata.inc:13842), its next-page button (WIDC_BUTTON1
  // "wndButtEnter.bmp") and the four papers of its quest lists, keyed with white (WndDialog.cpp:254-257). Its answer
  // buttons are ButtYes, ButtNo, ButtCancel and ButtOk, above.
  'WndDialogEx.tga',
  'wndButtEnter.bmp',
  'QuestUiPaperGreen.tga',
  'QuestUiPaperRed.tga',
  'QuestUiPaperGray.tga',
  'QuestUiPaperYellow.tga',
  // The quest window (APP_QUEST_EX_LIST, resdata.inc:4076): its remove and close buttons, the tree's check box and open
  // and close buttons (CWndTreeCtrl, WndControl.cpp:1130-1131), and the world map's destination mark (WndMapEx.cpp:547-572).
  'ButtRemoveQuest.bmp',
  'ButtClose.tga',
  'ButtCheck.bmp',
  'buttTreeOpen.tga',
  'buttTreeClose.tga',
  'ButtDestination.bmp',
  // Piece 7 M4: the party window's buttons and radios (APP_PARTY, resdata.inc:21393-21602), the quick view's bar fill
  // (WndPartyQuick.cpp:218-219), the world map's member arrow (WorldMap.cpp:92-103) and the HP bars over members
  // (Neuz.cpp:1619-1621)
  'ButtLeave.bmp', 'ButtChange.bmp', 'ButtTransper.bmp',
  'GauFillSmall.bmp',
  'ImgMapArrowParty.bmp',
  'GauPartyHpBG.TGA', 'GauPartyHp.TGA',
  // 2026-11-05, the item windows in Neuz's look (docs/superpowers/specs/2026-11-05-ui-fixes-research.md): a text's scroll
  // bar (CWndScrollBar, WndControl.cpp:1599-1793), the sex change's face arrows (APP_CHANGESEX), the element change's slot
  // and OK (APP_CHANGE_ATTRIBUTE), the item slots (APP_ITEM_TRANSY, APP_PIERCING), the coin by the piercing's cost, and
  // the safe upgrade's bars, gauge, results and buttons (APP_SMELT_SAFETY); ButtStart.bmp is above
  'ButtVScrUp.tga', 'ButtVScrDown.tga', 'ButtVScrBar.bmp', 'ButtVScrPUp.bmp', 'ButtVScrPBar.bmp', 'ButtVScrPDown.bmp',
  'Buttleft2.bmp', 'Buttright2.bmp', 'WndChgElemItem.bmp', 'ButOk2.bmp', 'WndElemItemBlank.tga', 'ButtMoney.tga',
  'Window02.bmp', 'SafetyGauge.bmp', 'SafetySuccess.bmp', 'SafetyFailure.bmp', 'Buttstop.bmp',
  // 2026-11-09, the chat window in Neuz's look (docs/superpowers/specs/2026-11-09-chat-desktop-research.md):
  // APP_COMMUNICATION_CHAT and APP_CHAT_LOG are "WndTile308.tga", tiled, so their frame is WndTile300 to WndTile311
  // (CWndNeuz::AdditionalSkinTexture, WndNeuz.cpp:276-278); the strip under the line (CWndChat::AdditionalSkinTexture,
  // WndCommunication.cpp:419-427, :1294-1312); the tabs, Lock, Filter and the move lock (resdata.inc:21640-21738); the
  // picture over the line's left end while it holds words (CWndMacroChat::OnInitialUpdate, WndCommunication.cpp:137).
  // ButtChatSystem.bmp is converted from Client/Icon, which holds the same file.
  ...numbered('WndTile3', 0, 11, '.tga'),
  'WndChatEdit00_1.tga', 'WndChatEdit01.tga', 'WndChatEdit02.tga',
  'ButtChatChat.BMP', 'ButtChatWhisper.BMP', 'ButtChatShout.BMP', 'ButtChatTroupe.BMP', 'ButtChatGuild.BMP',
  'ButtChatFilter.BMP', 'ButtChatLock.bmp', 'ButtWndLock.tga', 'wndButtMacroChat.bmp',
  // 2026-11-09, the pet windows (WndPetSys.cpp): the raised pet's window (CWndPetStatus::OnInitialUpdate, :810-811), the
  // buff pet's, whose file name has a space before the dot (CWndBuffPetStatus, :2257; key `ui/buffpetstatusbg-.png`), the
  // tamer's miracle button (CWndPetMiracle, :1371) and the buttons the pet windows' layouts name (APP_PET_FOODMILL and
  // APP_PET_TRANS_EGGS "ButCancel2.bmp", APP_PET_MIRACLE "ButMiracle.bmp", resdata.inc:9228, :22714, :9321)
  'PetStatusBg.tga', 'PetLevelBg.tga', 'BuffpetStatusBg .tga', 'ButChance.bmp', 'ButCancel2.bmp', 'ButMiracle.bmp',
  // 2026-11-10, the Messenger (docs/superpowers/specs/2026-11-10-friends-say-research.md §2, §5): APP_MESSENGER_EX's
  // buttons (resdata.inc:2190-2297; their pictures set again in CWndMessengerEx::OnInitialUpdate, WndMessenger.cpp:720-769)
  // and the mail icon (:716), APP_MESSAGE's Send (resdata.inc:23665) and APP_INSTANTMSG's picture (:25074)
  'ButtMsgRight.bmp', 'ButtMessAdd.bmp', 'ButtMessNote.bmp', 'ButtMessengerChannel.bmp', 'ButtMessengerState.bmp',
  'ButtMessengerLevel.bmp', 'ButtMessengerJob.bmp', 'ButtMessengerChar.bmp', 'WndMail.dds', 'ButtSend.bmp', 'WndInstantMsg.tga',
  // 2026-11-10, the player trade (docs/superpowers/specs/2026-11-10-trade-research.md §3, §8): APP_TRADE's picture
  // (resdata.inc:21942, not tiled) and its gold-clear button (:21994), hidden in V15 (WndField.cpp:9031-9038)
  'WndTrade.tga', 'ButtClearGold.tga',
  // 2026-11-10, the personal shop (docs/superpowers/specs/2026-11-10-personal-shop-research.md §1-§3): APP_VENDOR_REVISION's
  // Chat (resdata.inc:3716-3880; Reset is above), the keypads' buttons and number boxes of APP_VENDOREX_SELL and
  // APP_VENDOREX_BUY (:12278, :12977; Plus and Minus are above), the focus arrow (WndRegVend.cpp:91), the mark of a slot
  // under a carried item (WndVendorCtrl.cpp:49) and the title balloon's three pieces (DialogMsg.cpp:40-42)
  'ButtChat.BMP', 'ButItemNum0.BMP', 'ButItemNum1.BMP', 'ButItemNum2.BMP', 'ButItemNum3.BMP', 'ButItemNum4.BMP',
  'ButItemNum5.BMP', 'ButItemNum6.BMP', 'ButItemNum7.BMP', 'ButItemNum8.BMP', 'ButItemNum9.BMP', 'ButItemNum00.BMP',
  'ButItemNum000.BMP', 'ButItemMin.BMP', 'ButItemMax.BMP', 'ButItemMulti.BMP', 'ButItemDivid.BMP', 'ButItemEqua.BMP',
  'Window04.bmp', 'WndVenderArrowEx.tga', 'WndPosMark.tga', 'texDialogBox_left.tga', 'texDialogBox_center.TGA',
  'texDialogBox_right.tga',
  // 2026-11-10, the jewel windows (docs/superpowers/specs/2026-11-10-jewels-research.md §3): APP_SMELT_JEWEL's weapon
  // background (resdata.inc:9054) and its sockets' covers, unopened, set and waiting (CWndSmeltJewel::OnDraw,
  // WndField.cpp:20230-20290); ButtStart, WndChgElemItem and WndEditTile00 are above
  'Window01.bmp', 'WndDisableRed.bmp', 'WndDisableBlue.bmp', 'WndDisableBlack.bmp',
  // 2026-11-10, the guild (docs/superpowers/specs/2026-11-10-guild-research.md §3, appendix A): APP_GUILD_TABINFO's four
  // buttons (resdata.inc:5142-5232), APP_GUILD_TABMEMBER_EX's column heads (:14902-14938, set again in
  // CWndGuildTabMember::OnInitialUpdate, WndGuildTabMember.cpp:471-527), APP_GUILD_TABAPPELLATION's salary buttons
  // (:5694-5730), APP_GUILD_TABGUILDWAR's three (:7455-7473; LANG_ENG's ButtGuildDuel.bmp, WndGuildTabWar.cpp:104-110) and
  // APP_GUILD_NOTICE's three (:3264-3282)
  'ButtName.BMP', 'ButtNotice.BMP', 'ButtSetlogo.BMP', 'ButtDismiss.BMP', 'ButtGuildMemberTabMLevel.bmp',
  'ButtGuildMemberTabJob.bmp', 'ButtGuildMemberTabLevel.bmp', 'ButtGuildMemberTabChar.bmp', 'ButtGuildMemberTabAlias.bmp',
  'ButtPay.BMP', 'ButtGuildWar.BMP', 'ButtGuildDuel.bmp', 'ButtPeace.BMP', 'ButtGiveUp.BMP', 'ButtNoticeNew.BMP',
  'ButtNoticeStart.BMP', 'ButtNoticeEdit.BMP',
  // 2026-11-10, the bank and the post (docs/superpowers/specs/2026-11-10-bank-mail-research.md): APP_COMMON_BANK's picture
  // (resdata.inc:10679) and its NOT USE cover (WndBank.cpp:122); APP_POST_READ's Reply (:25539-25649); the inbox's table and
  // its read mark (CWndPostReceive::OnInitialUpdate, WndField.cpp:15378-15380)
  'WndCommonBank.tga', 'WndCommonBankNotUse.tga', 'ButtReply.tga', 'WndPostTable.tga', 'WndNotUse.tga',
  // 2026-11-10, Summon Angel (docs/superpowers/specs/2026-11-10-summon-angel-research.md): APP_SUMMON_ANGEL's Reset and
  // Start (resdata.inc:4647, :4656; Cancel's ButCancel2 is above) and the angel's EXP gauge over it (CNeuzApp,
  // Neuz.cpp:1642-1643; CMover::RenderAngelStatus, MoverRender.cpp:1907-1979)
  'reset.bmp', 'ButtVoteStart.BMP', 'GauAngelExpBG.tga', 'GauAngelExp.tga',
];

/**
 * 2026-11-10 (guild): the guild logos, `Icon_CloakSLogo01.jpg` .. `27.jpg` of DIR_ICON (`CWndWorld`, `WndWorld.cpp:3667-3677`):
 * 24 x 24 JPEGs. No decoder of the converter reads JPEG, and Neuz draws them opaque (DESTBLEND ZERO, `MoverRender.cpp:1621`),
 * so they are copied as they are, for the browser to draw: `ui/logo/icon_cloakslogoNN.jpg`.
 */
const GUILD_LOGO = /^icon_cloakslogo\d{2}\.jpe?g$/i;
export const guildLogoKeyOf = (file: string): string => `ui/logo/${file.toLowerCase().replace(/\.jpeg$/, '.jpg')}`;

/** 2026-11-05: the cursors of Client/Cursor the browser shows (Neuz.cpp:280-300): the upgrade mode's hammer, CUR_HAMMER. */
export const CURSOR_FILES: readonly string[] = ['anvil.cur'];

/** The two glyph sheets: the script, and the field of WebUiSheets it fills. */
const SHEETS = [
  { field: 'damageDigits', dir: 'SFX', script: 'DmgEffect.inc' }, // CDamageNumMng::LoadTexture, 2DRender.cpp:2004
  { field: 'targetCorners', dir: 'Icon', script: 'icon_target.inc' }, // CWndWorld, WndWorld.cpp:3511
  { field: 'questEmoticons', dir: 'Icon', script: 'icon_QuestEmoticon.inc', optional: true },
  { field: 'dialogEmoticons', dir: 'Theme/Default', script: 'texDialogEmoticon.inc', optional: true },
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

/**
 * 2026-11-10 (owner): the icons the phone's window shortcuts show alone, with no box or border (MobileTools,
 * apps/client/src/world/hud/mobileTools.ts), the Start menu's (CWndMgr::AddAllApplet): APP_STATUS1's (FuncApplet.cpp:179),
 * APP_CHARACTER3's (:204), APP_INVENTORY's (:210), APP_SKILL3's (:214), APP_QUEST_EX_LIST's (:229), APP_MAP's, the generic
 * applet icon (:184), APP_MESSENGER_'s (:260) and APP_PARTY's (:233). Each is also written frameless (`stripIconFrame`)
 * as `ui/bare/<web name>.png`.
 */
export const BARE_ICONS: readonly string[] = [
  'Icon_Status.dds', 'Icon_Character.dds', 'Icon_Inventory.dds', 'Icon_Skill.dds', 'Icon_Quest.dds', 'Icon_Applet.dds',
  'Icon_Messenger.dds', 'Icon_Troupe.dds',
];

/** The size of the Start menu's applet icons (Client/Icon/Icon_*.dds), and the panel their frame draws: (1, 1) to (30, 30). */
const ICON_SIZE = 32;
const PANEL_FIRST = 1;
const PANEL_LAST = 30;

/**
 * An applet icon without its frame. The Start menu's applet icons are drawn on one frame: a white panel from (1, 1) to
 * (30, 30) whose top two rows, left and right columns and bottom row are its rim (the orange and red edge). The rim, and the
 * white of the panel reached from its inside edge without crossing the drawing, become transparent black; the drawing, and
 * any white it encloses, stay. A picture of another size, or with no white just inside the rim, is returned as it is;
 * otherwise a copy.
 */
export function stripIconFrame(image: RgbaImage): RgbaImage {
  if (image.width !== ICON_SIZE || image.height !== ICON_SIZE) return image;
  const { width, data: source } = image;
  const index = (x: number, y: number): number => (y * width + x) * 4;
  const white = (x: number, y: number): boolean => {
    const i = index(x, y);
    return source[i] === 255 && source[i + 1] === 255 && source[i + 2] === 255 && source[i + 3] === 255;
  };
  // inside the rim: x from 2 to 29, y from 3 to 29
  const left = PANEL_FIRST + 1;
  const right = PANEL_LAST - 1;
  const top = PANEL_FIRST + 2;
  const bottom = PANEL_LAST - 1;
  if (!white(left, top)) return image;
  const data = new Uint8Array(source);
  const clear = (x: number, y: number): void => { data.fill(0, index(x, y), index(x, y) + 4); };
  for (let y = PANEL_FIRST; y <= PANEL_LAST; y++) {
    for (let x = PANEL_FIRST; x <= PANEL_LAST; x++) {
      if (x < left || x > right || y < top || y > bottom) clear(x, y);
    }
  }
  // the panel's white, from every white pixel along the inside edge, 4-connected
  const seen = new Uint8Array(width * image.height);
  const stack: Array<[number, number]> = [];
  const visit = (x: number, y: number): void => {
    if (x < left || x > right || y < top || y > bottom || seen[y * width + x] === 1 || !white(x, y)) return;
    seen[y * width + x] = 1;
    stack.push([x, y]);
  };
  for (let x = left; x <= right; x++) { visit(x, top); visit(x, bottom); }
  for (let y = top; y <= bottom; y++) { visit(left, y); visit(right, y); }
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    clear(x, y);
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  return { width, height: image.height, data };
}

/** A picture to convert. */
interface Picture {
  src: string;
  /** The logical key the PNG is written under. */
  key: string;
  colorKey: number;
  /** The key of its frameless copy (`BARE_ICONS`), if it has one. */
  bareKey?: string;
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

async function convertPicture({ src, key, colorKey, bareKey }: Picture, ctx: StageContext): Promise<void> {
  const bytes = new Uint8Array(await fs.readFile(src));
  const image = applyColorKey(decodeImage(bytes, src), colorKey);
  const png = encodePng(image, true);
  await ctx.writer.write(key, png, src);
  ctx.report.ok(KIND, src, bytes.length, png.length);
  if (bareKey !== undefined) await ctx.writer.write(bareKey, encodePng(stripIconFrame(image), true), src);
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
          if ('optional' in spec) {
            if (all || wanted(spec.script)) ctx.report.warn(KIND, `${spec.dir}/${spec.script}`, String(error));
          }
          else ctx.report.fail(KIND, `${spec.dir}/${spec.script}`, error);
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
            (/^world_/i.test(path.basename(src)) ? 0xff000000 : /^imgnavpos\./i.test(path.basename(src)) ? 0
              // the slider knob is loaded with white as its key (WndOptionGame.cpp:76)
              : /^(buttspin|questuipaper\w+)\./i.test(path.basename(src)) ? 0xffffffff : MAGENTA_KEY) });
        }
      };
      for (const { dir, keyOf } of PICTURE_FOLDERS) for (const src of ctx.client.list(dir, PICTURE)) add(src, keyOf);
      // the phone shortcuts' icons, also frameless (2026-11-10)
      const bare = new Set(BARE_ICONS.map((file) => file.toLowerCase()));
      for (const src of ctx.client.list(PICTURE_FOLDERS[0]!.dir, PICTURE)) {
        const picture = pictures.get(src);
        if (picture !== undefined && bare.has(path.basename(src).toLowerCase())) picture.bareKey = bareIconKeyOf(path.basename(src));
      }
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
      // the cursors: their mask is their transparency, so no colour key (ui/anvil.png)
      for (const name of CURSOR_FILES) {
        if (!wanted(name)) continue;
        const src = ctx.client.find('Cursor', name);
        if (src === null) ctx.report.warn(KIND, `Cursor/${name}`, `${name} is not in Client/Cursor, so it is not converted`);
        else if (wanted(src)) pictures.set(src, { src, key: iconKeyOf(path.basename(src)), colorKey: 0 });
      }

      const allJpegs = PICTURE_FOLDERS.flatMap(({ dir }) => ctx.client.list(dir, JPEG)).filter(wanted);
      // 2026-11-10 (guild): the guild logos are copied as they are (`GUILD_LOGO`); the other JPEGs stay unconverted
      const logos = allJpegs.filter((file) => GUILD_LOGO.test(path.basename(file)));
      for (const src of logos) {
        try {
          const bytes = new Uint8Array(await fs.readFile(src));
          await ctx.writer.write(guildLogoKeyOf(path.basename(src)), bytes, src);
          ctx.report.ok(KIND, src, bytes.length, bytes.length);
        } catch (error) {
          ctx.report.fail(KIND, src, error);
        }
      }
      const jpegs = allJpegs.filter((file) => !GUILD_LOGO.test(path.basename(file)));
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
      if (['damageDigits', 'targetCorners'].every((field) => sheets.some((sheet) => sheet.field === field)) && sheets.some((sheet) => pictures.has(sheet.picture))) {
        try {
          const sheetOf = (field: Sheet['field']): WebUiSheet => {
            const sheet = sheets.find((candidate) => candidate.field === field)!;
            return { image: iconKeyOf(path.basename(sheet.picture)), frames: sheet.pack.frames };
          };
          const catalog: WebUiSheets = { damageDigits: sheetOf('damageDigits'), targetCorners: sheetOf('targetCorners') };
          if (sheets.some((sheet) => sheet.field === 'questEmoticons')) catalog.questEmoticons = sheetOf('questEmoticons');
          if (sheets.some((sheet) => sheet.field === 'dialogEmoticons')) catalog.dialogEmoticons = sheetOf('dialogEmoticons');
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
