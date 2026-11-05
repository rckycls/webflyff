// The item windows' resdata.inc entries (2026-11-05, docs/superpowers/specs/2026-11-05-ui-fixes-research.md §2-§3): each
// window's size, title (resData.txt.txt's English) and controls, as `ResWindow` lays them. Every one is "WndTile00.tga"
// tiled (APP_RANDOMSCROLL_CONFIRM's "WndTile08.tga" names the same twelve tiles), style WBS_CAPTION | WBS_MOVE, centred
// on opening (`MoveParentCenter`). The texts and edits are "WndEditTile00.tga" tiled; the group boxes "WndEditTile200.tga".

import type { ResControl, ResLayout } from '../hud/resWindow';

const EDIT = 'WndEditTile00.tga';
const GROUP = 'WndEditTile200.tga';
/** ButtOk, ButtCancel, ButtYes, ButtNo, ButOk2: 288 x 20, four states of 72. */
const ok = (id: string, rect: ResControl['rect'], picture = 'ButtOk.tga'): ResControl =>
  ({ kind: 'button', id, rect, picture, label: 'OK', quarter: 72 });
const cancel = (id: string, rect: ResControl['rect']): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 });
const yes = (id: string, rect: ResControl['rect']): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtYes.tga', label: 'Yes', quarter: 72 });
const no = (id: string, rect: ResControl['rect']): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtNo.tga', label: 'No', quarter: 72 });

/** APP_CHANGENAME (resdata.inc:23181-23228), CWndChangeName. */
export const CHANGE_NAME: ResLayout = {
  title: 'Change Name', width: 224, height: 128,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [26, 18, 192, 32], text: 'Please input the new name to change into.' },
    ok('WIDC_OK', [24, 68, 96, 88]),
    cancel('WIDC_CANCEL', [110, 68, 182, 88]),
    { kind: 'edit', id: 'WIDC_EDIT_CHANGENAME', rect: [24, 42, 188, 62], tile: EDIT },
  ],
};

/** APP_SELECT_CHANNEL (resdata.inc:28785-28814), CWndSelectCh: no OK, no Cancel. */
export const SELECT_CHANNEL: ResLayout = {
  title: 'Channel Selection', width: 176, height: 256,
  controls: [
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [8, 32, 154, 214], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 8, 152, 24], group: GROUP, text: 'Please choose a channel' },
  ],
};

/** APP_CHANGESEX (resdata.inc:23031-23096), CWndChangeSex: the face box (the 3D preview over it), the arrows. */
export const CHANGE_SEX: ResLayout = {
  title: 'Change Sex', width: 192, height: 272,
  controls: [
    { kind: 'custom', id: 'WIDC_STATIC1', rect: [18, 38, 168, 168], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [18, 18, 164, 34], group: GROUP, text: 'Change Face' },
    ok('WIDC_OK', [12, 204, 86, 226]),
    cancel('WIDC_CANCEL', [96, 204, 168, 224]),
    { kind: 'button', id: 'WIDC_RIGHT', rect: [96, 174, 140, 198], picture: 'Buttright2.bmp', label: 'Next face', quarter: 41 },
    { kind: 'button', id: 'WIDC_LEFT', rect: [42, 174, 84, 198], picture: 'Buttleft2.bmp', label: 'Previous face', quarter: 41 },
  ],
};

/** APP_CHANGE_ATTRIBUTE (resdata.inc:28701-28784), CWndChangeAttribute: the slot, the help, five elements, OK; no Cancel. */
export const CHANGE_ATTRIBUTE: ResLayout = {
  title: 'Scroll of Attribute Change', width: 304, height: 288,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [132, 24, 164, 56], picture: 'WndChgElemItem.bmp' },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 74, 290, 172], tile: EDIT, scroll: true },
    ...[28, 82, 136, 190, 244].map((left, i): ResControl => ({ kind: 'custom', id: `WIDC_CUSTOM${i + 1}`, rect: [left, 188, left + 24, 212] })),
    ok('WIDC_OK', [114, 228, 186, 248], 'ButOk2.bmp'),
  ],
};

/** APP_ITEM_TRANSY (resdata.inc:27702-27767), CWndItemTransy: the item, "->", its twin. The title is the source's spelling. */
export const ITEM_TRANSY: ResLayout = {
  title: 'Trasy for Item', width: 176, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [30, 46, 62, 78], picture: 'WndElemItemBlank.tga' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [8, 8, 156, 24], group: GROUP, text: 'Change Sex of Item' },
    ok('WIDC_OK', [6, 96, 78, 116]),
    cancel('WIDC_CANCEL', [86, 96, 158, 116]),
    { kind: 'static', id: 'WIDC_STATIC4', rect: [106, 46, 138, 78], picture: 'WndElemItemBlank.tga' },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [72, 52, 98, 70], group: GROUP, text: '->' },
  ],
};

/** APP_SUMMON_PARTY (resdata.inc:27768-27806), CWndSummonParty: the leader's question. */
export const SUMMON_PARTY: ResLayout = {
  title: 'Summon Party', width: 288, height: 224,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 8, 268, 152], tile: EDIT },
    cancel('WIDC_CANCEL', [160, 164, 232, 184]),
    ok('WIDC_OK', [46, 164, 118, 184]),
  ],
};

/** APP_MESSAGEBOX_SUMMONPARTY (resdata.inc:28248-28295), CWndSummonPartyMsg: each member's notice; the scroll's icon at (12, 116). */
export const SUMMON_PARTY_MSG: ResLayout = {
  title: 'Summon P. Members', width: 320, height: 224,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 8, 298, 74], tile: EDIT },
    ok('WIDC_OK', [126, 164, 198, 184]),
    { kind: 'text', id: 'WIDC_TEXT2', rect: [50, 106, 300, 154], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 82, 296, 98], group: GROUP, text: 'How to Use' },
    { kind: 'custom', id: 'ICON', rect: [12, 116, 44, 148] },
  ],
};

/** APP_SUMMON_PARTY_USE (resdata.inc:27663-27701), CWndSummonPartyUse: a member's "teleport?" question. */
export const SUMMON_PARTY_USE: ResLayout = {
  title: 'Summon P. Members', width: 288, height: 144,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 264, 72], tile: EDIT },
    ok('WIDC_OK', [48, 80, 120, 100]),
    cancel('WIDC_CANCEL', [162, 80, 234, 100]),
  ],
};

/** APP_SUMMON_FRIEND (resdata.inc:27846-27902), CWndSummonFriend: a name typed or picked; Cancel 1 px higher, as written. */
export const SUMMON_FRIEND: ResLayout = {
  title: 'Summon', width: 272, height: 144,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [24, 44, 66, 60], text: 'Name :' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [30, 18, 228, 34], text: 'Input the character name to be summoned.' },
    ok('WIDC_OK', [40, 78, 112, 98]),
    cancel('WIDC_CANCEL', [143, 77, 215, 97]),
    { kind: 'combo', id: 'WIDC_COMBOBOX1', rect: [70, 42, 238, 60], tile: EDIT, maxLength: 63 },
  ],
};

/** APP_MESSAGEBOX_SUMMONFRINED (resdata.inc:27807-27845), CWndSummonFriendMsg: the friend's question. */
export const SUMMON_FRIEND_MSG: ResLayout = {
  title: 'Summon', width: 288, height: 144,
  controls: [
    ok('WIDC_OK', [50, 80, 122, 100]),
    cancel('WIDC_CANCEL', [160, 80, 232, 100]),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 8, 268, 74], tile: EDIT },
  ],
};

/** APP_COMMITEM_DIALOG (resdata.inc:23805-23843), CWndCommItemDlg: "use this item?", its words a disabled edit. */
export const COMM_ITEM: ResLayout = {
  title: 'Use Item', width: 320, height: 128,
  controls: [
    { kind: 'edit', id: 'WIDC_EDIT_COMMUSE', rect: [10, 8, 300, 64], tile: EDIT, readOnly: true },
    ok('WIDC_BUTTON_OK', [68, 68, 140, 88]),
    cancel('WIDC_BUTTON_CANCEL', [168, 68, 240, 88]),
  ],
};

/** APP_RESTATE_CONFIRM (resdata.inc:2546-2584), CWndRestateConfirm. */
export const RESTATE_CONFIRM: ResLayout = {
  title: 'Confirm Re-Stat', width: 336, height: 160,
  controls: [
    { kind: 'text', id: 'WIDC_RESTATE_CONFIRM_TEXT', rect: [10, 18, 314, 94], tile: EDIT },
    yes('WIDC_RESTATE_CONFIRM_YES', [74, 100, 146, 120]),
    no('WIDC_RESTATE_CONFIRM_NO', [180, 100, 252, 120]),
  ],
};

/** APP_SMELT_SAFETY_CONFIRM (resdata.inc:1772-1810), CWndSmeltSafetyConfirm. */
export const SMELT_SAFETY_CONFIRM: ResLayout = {
  title: 'Confirm Upgrade', width: 336, height: 160,
  controls: [
    yes('WIDC_SMELT_YES', [74, 100, 146, 120]),
    no('WIDC_SMELT_NO', [182, 100, 254, 120]),
    { kind: 'text', id: 'WIDC_CONFIRM_TEXT', rect: [10, 18, 318, 94], tile: EDIT },
  ],
};

/** APP_RANDOMSCROLL_CONFIRM (resdata.inc:3677-3715), CWndRandomScrollConfirm. */
export const RANDOM_SCROLL_CONFIRM: ResLayout = {
  title: 'Random Option', width: 304, height: 160,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [6, 6, 284, 94], tile: EDIT },
    yes('WIDC_YES', [66, 100, 138, 120]),
    no('WIDC_NO', [162, 100, 234, 120]),
  ],
};

/** APP_FUNNYCOIN_CONFIRM (resdata.inc:1271-1309), CWndFunnyCoinConfirm: its text has a scroll bar. */
export const FUNNY_COIN_CONFIRM: ResLayout = {
  title: 'Confirm', width: 288, height: 128,
  controls: [
    yes('WIDC_YES', [56, 70, 128, 90]),
    no('WIDC_NO', [152, 70, 224, 90]),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 12, 270, 64], tile: EDIT, scroll: true },
  ],
};

/** APP_CONFIRM_ENTER (resdata.inc:4346-4393), CWndConfirmVis: the one modal box, titled "OK"; Enter is OK. */
export const CONFIRM_VIS: ResLayout = {
  title: 'OK', width: 304, height: 192, modal: true,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 18, 286, 124], tile: EDIT, scroll: true },
    ok('WIDC_BUTTON1', [56, 132, 128, 152]),
    cancel('WIDC_BUTTON2', [170, 132, 242, 152]),
  ],
};

/** APP_PIERCING (resdata.inc:23844-23954), CWndPiercing: the item, the Moonstone and the GProtect; the cost. */
export const PIERCING: ResLayout = {
  title: 'Piercing', width: 192, height: 256,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [22, 46, 70, 62], text: 'Item' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [22, 86, 100, 102], text: 'Moonstone' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [22, 130, 102, 146], text: 'Gprotect ->' },
    ok('WIDC_OK', [12, 192, 84, 212]),
    cancel('WIDC_CANCEL', [94, 192, 166, 212]),
    { kind: 'static', id: 'WIDC_STATIC5', rect: [112, 38, 144, 70], picture: 'WndElemItemBlank.tga' },
    { kind: 'static', id: 'WIDC_STATIC6', rect: [112, 80, 144, 112], picture: 'WndElemItemBlank.tga' },
    { kind: 'static', id: 'WIDC_STATIC7', rect: [112, 122, 144, 154], picture: 'WndElemItemBlank.tga' },
    { kind: 'static', id: 'WIDC_STATIC8', rect: [24, 162, 46, 182], picture: 'ButtMoney.tga' },
    { kind: 'static', id: 'WIDC_STATIC9', rect: [58, 164, 144, 180], text: '0' },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [8, 8, 168, 30], group: GROUP, text: 'Pierce Item' },
  ],
};
