// The beauty shop's rules (2026-11-15, docs/2026-11-15-beauty-shop-research.md): the prices, the colour bars' sums and
// what OK does, as Neuz's hair and face windows have them. `__Y_HAIR_BUG_FIX` is off in the __MAINSERVER build, so a
// colour channel runs from 0.3 to 1.0 and the edits show it as 0..255.
//
//   Function                              File:lines                          what
//   CWndBeautyShop::OnDraw                _Interface/WndShop.cpp:1430-1474    the colour price (any byte changed)
//   CWndBeautyShop::DrawHairKind          WndShop.cpp:1477-1573               the four styles from m_dwHairMesh, wrapping
//   CWndBeautyShop::SetRGBToEdit          WndShop.cpp:1729-1739               the edit's number from a channel
//   CWndBeautyShop::SetRGBToBar           WndShop.cpp:1741-1791               a typed number: 0..254, then the channel
//   CWndBeautyShop::ReSetBar              WndShop.cpp:1793-1820               the knobs' places
//   CWndBeautyShop::OnMouseWndSurface     WndShop.cpp:1822-1906               a drag on a bar: 0.3 + p * 0.698
//   CWndBeautyShop::OnLButtonDown         WndShop.cpp:1926-1967               a style chosen: HAIR_COST if it differs
//   CWndBeautyShop::OnChildNotify         WndShop.cpp:1969-2183               Reset, the arrows, OK
//   CWndBeautyShopConfirm::OnInitialUpdate WndShop.cpp:2380-2435              the confirm's words
//   CWndFaceShop::DrawFaces               WndShop.cpp:2729-2853               the two rows of faces, wrapping
//   CWndFaceShop::Initialize              WndShop.cpp:2882-2921               where the rows start
//   CWndFaceShop::OnLButtonDown           WndShop.cpp:2937-2968               a face chosen: CHANGE_FACE_COST if it differs
//   CWndFaceShop::OnChildNotify           WndShop.cpp:2970-3091               Reset, the arrows, OK
//   CMover::SetHairColor( FLOAT )         _Common/MoverEquip.cpp:157-191      a channel under 0.3 is 0.3
//   Resource/defineNeuz.h                 :1125-1133                          MAX_*, the three prices

import { withCommas } from '../vendor/vendorRules';

/** `HAIR_COST`, `HAIRCOLOR_COST` and `CHANGE_FACE_COST` (`Resource/defineNeuz.h:1131-1133`). */
export const HAIR_COST = 2_000_000;
export const HAIRCOLOR_COST = 4_000_000;
export const CHANGE_FACE_COST = 1_000_000;
/** `MAX_HAIR` 10, `MAX_DEFAULT_HEAD` 5 (the friendly faces 1-5) and `MAX_HEAD` 11 (the new faces 6-11). */
export const MAX_HAIR = 10;
export const MAX_DEFAULT_HEAD = 5;
export const MAX_HEAD = 11;
/** The first new face (`m_dwNewFace` 6). */
export const FIRST_NEW_FACE = 6;
/** `PARTS_CAP` and `PARTS_HAT` (`Resource/defineNeuz.h`): anything worn there keeps the shops shut. */
export const PARTS_CAP = 6;
export const PARTS_HAT = 26;
/** `II_SYS_SYS_SCR_HAIRCHANGE` and `II_SYS_SYS_SCR_FACEOFFFREE` (`Resource/defineItem.h:4830-4831`): the free coupons. */
export const HAIR_COUPON = 26410;
export const FACE_COUPON = 26411;

const f32 = Math.fround;
/** The lowest channel, and the bars' span (`1.0f - 0.3f`). */
const LOW = f32(0.3);
const SPAN = f32(1 - LOW);
/** The drag's right end (`D3DXVECTOR2( 0.998f, 0.998f )`). */
const DRAG_HIGH = f32(0.998);

/** An RGB colour as three float channels (`m_fColor`, `m_fHairColorR/G/B`). */
export type Channels = readonly [number, number, number];

/** `(BYTE)( c * 255 )`: the byte the price and SET_HAIR use. */
export function channelByte(c: number): number {
  return Math.trunc(f32(f32(c) * 255)) & 0xff;
}

/** The player's hair colour as Neuz holds it (`SetHairColor( DWORD )`): each byte over 255. */
export function channelsOf(color: number): [number, number, number] {
  return [f32(((color >>> 16) & 0xff) / 255), f32(((color >>> 8) & 0xff) / 255), f32((color & 0xff) / 255)];
}

/** `SetRGBToEdit`: `(int)( ( c - 0.3f ) / ( 1.0f - 0.3f ) * 255 + 0.5f )`, cut toward 0. */
export function editNumber(c: number): number {
  return Math.trunc(f32(f32(f32(f32(f32(c) - LOW) / SPAN) * 255) + f32(0.5)));
}

/**
 * `SetRGBToBar`: the typed words read as `atoi` reads them, held to 0..254 (the edit then shows the held number), and
 * the channel `n / 255 * 0.7 + 0.3`. `shown` is what the edit is to show when it changed, else null.
 */
export function typedChannel(text: string): { channel: number; shown: string | null } {
  let n = atoi(text);
  let shown: string | null = null;
  if (n < 0) { n = 0; shown = '0'; } else if (n > 254) { n = 254; shown = '254'; }
  return { channel: f32(f32(f32(n / 255) * SPAN) + LOW), shown };
}

/** C's `atoi`: spaces, a sign, then digits; anything else ends it (none is 0). */
export function atoi(text: string): number {
  const match = /^\s*([+-]?\d+)/.exec(text);
  if (match === null) return 0;
  const n = Number.parseInt(match[1]!, 10);
  return Math.max(-0x80000000, Math.min(0x7fffffff, n));
}

/** A drag at `pos` px into a bar `width` px wide (the right end held, `OnMouseWndSurface`): `D3DXVec2Lerp( 0.3, 0.998, p )`. */
export function dragChannel(pos: number, width: number): number {
  const p = f32(Math.min(pos, width) / width);
  return f32(LOW + f32(p * f32(DRAG_HIGH - LOW)));
}

/** `ReSetBar`: the knob's x for channel `c` on a bar from `left` to `right`, `(LONG)( width * f / 100 + left )`. */
export function knobX(c: number, left: number, right: number): number {
  const percent = f32(f32(f32(f32(c) - LOW) / SPAN) * 100);
  return Math.trunc(f32(f32(f32((right - left) * percent) / 100) + left));
}

/** The style price: HAIR_COST when the chosen style (1-based) is not the player's (0-based), 0 with a coupon. */
export function hairCost(currentMesh: number, chosen: number, coupon: boolean): number {
  return currentMesh !== chosen - 1 && !coupon ? HAIR_COST : 0;
}

/** The colour price: HAIRCOLOR_COST when any channel's byte differs from the player's, 0 with a coupon. */
export function colorCost(current: Channels, chosen: Channels, coupon: boolean): number {
  return !coupon && !sameBytes(current, chosen) ? HAIRCOLOR_COST : 0;
}

/** The face price: CHANGE_FACE_COST when the chosen face (1-based) is not the player's head (0-based), 0 with a coupon. */
export function faceCost(currentHead: number, chosen: number, coupon: boolean): number {
  return currentHead !== chosen - 1 && !coupon ? CHANGE_FACE_COST : 0;
}

export function sameBytes(a: Channels, b: Channels): boolean {
  return a.every((c, i) => channelByte(c) === channelByte(b[i]!));
}

/** The four styles shown from `first` on (`DrawHairKind`): 1..MAX_HAIR, past MAX_HAIR back to 1. */
export function hairRow(first: number): number[] {
  const row: number[] = [];
  let n = first;
  for (let i = 0; i < 4; i++) {
    if (n > MAX_HAIR) n = 1;
    row.push(n);
    n++;
  }
  return row;
}

/** WIDC_HAIRSTYLE_LEFT and _RIGHT: the row's first style one back or on, wrapping 1..MAX_HAIR. */
export function stepHair(first: number, step: -1 | 1): number {
  const n = first + step;
  return n < 1 ? MAX_HAIR : n > MAX_HAIR ? 1 : n;
}

/** The friendly faces from `first` (`DrawFaces( 0 )`): 1..MAX_DEFAULT_HEAD, past it back to 1. */
export function friendlyRow(first: number): number[] {
  const row: number[] = [];
  let n = first;
  for (let i = 0; i < 4; i++) {
    if (n > MAX_DEFAULT_HEAD) n = 1;
    row.push(n);
    n++;
  }
  return row;
}

/** The new faces from `first` (`DrawFaces( 1 )`): FIRST_NEW_FACE..MAX_HEAD, past it back to FIRST_NEW_FACE. */
export function newRow(first: number): number[] {
  const row: number[] = [];
  let n = first;
  for (let i = 0; i < 4; i++) {
    if (n > MAX_HEAD) n = FIRST_NEW_FACE;
    row.push(n);
    n++;
  }
  return row;
}

/** The friendly row's arrows: 1..MAX_DEFAULT_HEAD, wrapping. */
export function stepFriendly(first: number, step: -1 | 1): number {
  const n = first + step;
  return n < 1 ? MAX_DEFAULT_HEAD : n > MAX_DEFAULT_HEAD ? 1 : n;
}

/** The new row's arrows: FIRST_NEW_FACE..MAX_HEAD, wrapping. */
export function stepNew(first: number, step: -1 | 1): number {
  const n = first + step;
  return n < FIRST_NEW_FACE ? MAX_HEAD : n > MAX_HEAD ? FIRST_NEW_FACE : n;
}

/**
 * Where the face rows start (`Initialize`, :2888-2891): a head 0-5 starts the friendly row at it, a head 6-14 the new row;
 * the other row at its first face. (Reset, :2983-2995, has the bound 16 for the new row; a head of 15 never is.)
 */
export function faceRowsFor(head: number): { friendly: number; fresh: number } {
  if (head >= 0 && head < 6) return { friendly: head + 1, fresh: FIRST_NEW_FACE };
  if (head >= 6 && head < 16) return { friendly: 1, fresh: head + 1 };
  return { friendly: 1, fresh: FIRST_NEW_FACE };
}

/** What OK does: close the window, ask about the coupon, or ask about the price. */
export type OkAnswer = { kind: 'close' } | { kind: 'coupon' } | { kind: 'confirm'; cost: number };

/**
 * OK (`WIDC_OK`, `WIDC_BTN_OK`): with a coupon and a change, the coupon's question; with a price, the confirm; else the
 * window closes (no price and no coupon, or nothing changed). There is no gold check: the server's is the only one.
 */
export function okAnswer(cost: number, coupon: boolean, changed: boolean): OkAnswer {
  if (coupon && changed) return { kind: 'coupon' };
  if (cost > 0) return { kind: 'confirm', cost };
  return { kind: 'close' };
}

/**
 * The confirm's words (`"%s %s %s %s %s %s"`): TID_GAME_SHOP_CHOICE, TID_GAME_CHANGE_HAIR (or _FACE), TID_GAME_SHOP_COST,
 * the price with commas (`GetNumberFormatEx`), TID_GAME_SHOP_PENYA, TID_GAME_CHANGE_HAIR_QUESTION (or _FACE_QUESTION).
 */
export function confirmText(text: (tid: string) => string, face: boolean, cost: number): string {
  const what = face ? 'FACE' : 'HAIR';
  return [
    text('TID_GAME_SHOP_CHOICE'), text(`TID_GAME_CHANGE_${what}`), text('TID_GAME_SHOP_COST'), withCommas(cost),
    text('TID_GAME_SHOP_PENYA'), text(`TID_GAME_CHANGE_${what}_QUESTION`),
  ].join(' ');
}

/**
 * The hair colour SET_HAIR leaves on a mover, as `m_dwHairColor` (`CMover::SetHairColor( r / 255.f, ... )`): pure white
 * stays white (its style's default is put in when drawn, `looks.ts`), else each channel under 0.3 is raised to 0.3, and
 * the colour packed opaque (`D3DCOLOR_COLORVALUE`). A byte n is n again (n / 255.f * 255.f); 0.3f is byte 76.
 */
export function setHairColor(r: number, g: number, b: number): number {
  if (r === 255 && g === 255 && b === 255) return 0xffffffff;
  const raise = (n: number): number => (f32(n / 255) < LOW ? channelByte(LOW) : n);
  return (0xff000000 | (raise(r) << 16) | (raise(g) << 8) | raise(b)) >>> 0;
}

/** `CMover::SetHair`: a style 0..MAX_HAIR-1 is taken, any other leaves the old one. */
export function setHairMesh(current: number, hair: number): number {
  return hair >= 0 && hair < MAX_HAIR ? hair : current;
}
