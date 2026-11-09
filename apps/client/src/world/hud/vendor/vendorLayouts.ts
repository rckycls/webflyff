// The personal shop's resdata.inc entries (2026-11-10, docs/superpowers/specs/2026-11-10-personal-shop-research.md §1-§4):
// each window's size, title (resData.txt.txt's English) and controls, as `ResWindow` lays them. All are WBS_CAPTION |
// WBS_MOVE ("WndTile00.tga" or "WndTile02.tga" tiled, which name the same tiles); edits "WndEditTile00.tga", group boxes
// "WndEditTile200.tga".

import type { ResControl, ResLayout } from '../resWindow';

const EDIT = 'WndEditTile00.tga';
const GROUP = 'WndEditTile200.tga';
/** The slot boxes' tops and bottoms, a row each (resdata.inc:3741-3874). */
const SLOT_TOPS = [66, 102, 138, 174, 210, 246, 282, 318, 354, 392];
const SLOT_BOTTOMS = [98, 136, 170, 206, 242, 278, 314, 350, 386, 424];
const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter: number): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });

/**
 * APP_VENDOR_REVISION (resdata.inc:3716-3880), CWndVendor, "Private Shop" 448 x 464: the name, OK, Cancel, Reset, Chat,
 * the 20 slots' boxes (WIDC_EDIT2 to WIDC_EDIT21, disabled edits drawn as backgrounds) and the slot control over them,
 * `CRect( 5, 60, 440, 460 )` (WndVendor.cpp:82), here the custom `SLOTS`.
 */
export const VENDOR: ResLayout = {
  title: 'Private Shop', width: 448, height: 464,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC3', rect: [6, 8, 86, 24], group: GROUP, text: 'Shop Name' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [86, 8, 286, 28], tile: EDIT, maxLength: 47 },
    button('WIDC_OK', [288, 8, 360, 28], 'ButtOk.tga', 'OK', 72),
    button('WIDC_CANCEL', [360, 8, 432, 28], 'ButtCancel.tga', 'Cancel', 72),
    { kind: 'static', id: 'WIDC_STATIC1', rect: [6, 38, 288, 54], group: GROUP, text: 'Sale List' },
    button('WIDC_RESET', [288, 36, 360, 56], 'ButtReset.bmp', 'Reset', 72),
    button('WIDC_CHAT', [360, 36, 432, 56], 'ButtChat.BMP', 'Chat', 72),
    ...Array.from({ length: 20 }, (_, i): ResControl => {
      const row = Math.trunc(i / 2), left = i % 2 === 0 ? 8 : 228;
      // the rows as resdata.inc has them (the first right box is 2 px taller)
      const top = SLOT_TOPS[row]!;
      const bottom = row === 0 && left === 228 ? 100 : SLOT_BOTTOMS[row]!;
      return { kind: 'custom', id: `WIDC_EDIT${i + 2}`, rect: [left, top, left + 200, bottom], tile: EDIT };
    }),
    { kind: 'custom', id: 'SLOTS', rect: [5, 60, 440, 460] },
  ],
};

/** The calculator keys of the keypads (resdata.inc:12278-12470, :12977-13140). */
const DIGIT_KEYS: readonly ResControl[] = [
  button('WIDC_NUM1', [198, 4, 212, 20], 'ButItemNum1.BMP', '1', 14),
  button('WIDC_NUM2', [212, 4, 226, 20], 'ButItemNum2.BMP', '2', 14),
  button('WIDC_NUM3', [226, 4, 240, 20], 'ButItemNum3.BMP', '3', 14),
  button('WIDC_NUM4', [198, 20, 212, 36], 'ButItemNum4.BMP', '4', 14),
  button('WIDC_NUM5', [212, 20, 226, 36], 'ButItemNum5.BMP', '5', 14),
  button('WIDC_NUM6', [226, 20, 240, 36], 'ButItemNum6.BMP', '6', 14),
  button('WIDC_NUM7', [198, 36, 212, 52], 'ButItemNum7.BMP', '7', 14),
  button('WIDC_NUM8', [212, 36, 226, 52], 'ButItemNum8.BMP', '8', 14),
  button('WIDC_NUM9', [226, 36, 240, 52], 'ButItemNum9.BMP', '9', 14),
  button('WIDC_NUM0', [198, 52, 212, 68], 'ButItemNum0.BMP', '0', 14),
  button('WIDC_NUM00', [212, 52, 240, 68], 'ButItemNum00.BMP', '00', 28),
  button('WIDC_NUM000', [198, 68, 240, 84], 'ButItemNum000.BMP', '000', 42),
  button('WIDC_VENMIN', [250, 52, 282, 68], 'ButItemMin.BMP', 'Min', 32),
  button('WIDC_VENMAX', [250, 68, 282, 84], 'ButItemMax.BMP', 'Max', 32),
  button('WIDC_OK', [52, 98, 124, 118], 'ButtOk.tga', 'OK', 72),
  button('WIDC_CANCEL', [168, 98, 240, 118], 'ButtCancel.tga', 'Cancel', 72),
];

/** The key a keypad button types (`OnChildNotify`'s switch). */
export const PAD_KEYS: ReadonlyMap<string, string> = new Map([
  ...Array.from({ length: 10 }, (_, n) => [`WIDC_NUM${n}`, String(n)] as [string, string]),
  ['WIDC_NUM00', '00'], ['WIDC_NUM000', '000'], ['WIDC_VENMIN', 'min'], ['WIDC_VENMAX', 'max'],
  ['WIDC_VENPLUS', '+'], ['WIDC_VENMINUS', '-'], ['WIDC_VENMULTI', '*'], ['WIDC_VENDIVID', '/'], ['WIDC_VENEQUA', '='],
]);

/**
 * APP_VENDOREX_SELL (resdata.inc:12278-), CWndRegVend, "Sell Item Registration" 304 x 160. The number boxes' pictures
 * (WIDC_STATIC5, WIDC_STATIC6, Window04.bmp) come before the numbers here, so the numbers are drawn over them.
 */
export const SELL: ResLayout = {
  title: 'Sell Item Registration', width: 304, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [6, 8, 86, 28], text: 'Quantity' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [6, 32, 86, 52], text: 'Unit Price' },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [84, 6, 188, 26], picture: 'Window04.bmp' },
    { kind: 'static', id: 'WIDC_STATIC6', rect: [84, 30, 188, 50], picture: 'Window04.bmp' },
    ...DIGIT_KEYS,
    button('WIDC_VENPLUS', [250, 4, 264, 20], 'ButItemPlus.bmp', 'Plus', 14),
    button('WIDC_VENMINUS', [268, 4, 282, 20], 'ButItemMinus.bmp', 'Minus', 14),
    button('WIDC_VENMULTI', [250, 20, 264, 36], 'ButItemMulti.BMP', 'Times', 14),
    button('WIDC_VENDIVID', [268, 20, 282, 36], 'ButItemDivid.BMP', 'Divide', 14),
    button('WIDC_VENEQUA', [250, 36, 282, 52], 'ButItemEqua.BMP', 'Equals', 32),
    { kind: 'static', id: 'WIDC_SELLNUM', rect: [86, 8, 188, 28], text: '0' },
    { kind: 'static', id: 'WIDC_SELLPRI', rect: [86, 32, 188, 52], text: '0' },
  ],
};

/** APP_VENDOREX_BUY (resdata.inc:12977-), CWndVendorBuy, "Buy Item" 304 x 160: Quantity, Price, Total Cost. */
export const BUY: ResLayout = {
  title: 'Buy Item', width: 304, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [6, 8, 86, 28], text: 'Quantity' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [6, 32, 86, 52], text: 'Price' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [6, 56, 86, 76], text: 'Total Cost' },
    { kind: 'static', id: 'WIDC_STATIC7', rect: [84, 6, 188, 26], picture: 'Window04.bmp' },
    ...DIGIT_KEYS,
    { kind: 'static', id: 'WIDC_STATIC4', rect: [86, 32, 188, 52], text: '' },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [86, 56, 188, 76], text: '' },
    { kind: 'static', id: 'WIDC_BUYNUM', rect: [86, 8, 188, 28], text: '0' },
  ],
};

/**
 * APP_VENDOREX_CHAT (resdata.inc:12533-), CWndVendorMessage, "Chatting" 448 x 320: the tab control (Dialog and, for the
 * seller, Information; `CRect( 0, 0, 300, 220 )` texts in it, WndVendor.cpp:548-569), the users, the line and Send.
 */
export const CHAT: ResLayout = {
  title: 'Chatting', width: 448, height: 320,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [10, 4, 146, 24], text: 'Message' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [296, 4, 396, 22], text: 'User' },
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [296, 24, 430, 236], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [10, 252, 60, 270], text: 'Input' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [66, 252, 358, 270], tile: EDIT, maxLength: 1019 },
    button('WIDC_BUTTON1', [362, 240, 426, 280], 'ButtSend.bmp', 'Send', 64),
    { kind: 'custom', id: 'WIDC_TABCTRL1', rect: [22, 30, 284, 230] },
  ],
};
