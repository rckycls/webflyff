// The personal shop's rules (2026-11-10, docs/superpowers/specs/2026-11-10-personal-shop-research.md §2-§6): what Neuz's
// shop windows check before they send, as pure functions.
//
//   CWndVendor::OnChildNotify      _Interface/WndVendor.cpp:242-465     the drop on a slot (:250-300), OK (:308-379)
//   CWndRegVend::OnChildNotify     _Interface/WndRegVend.cpp:272-349    the registration's count, price and gold check
//   CWndVendorCtrl::OnDraw         _Interface/WndVendorCtrl.cpp:79-233  the slots' places, names, prices and colours
//   CWndWorld::OnLButtonDown       _Interface/WndWorld.cpp:7019-7048    the click that opens another's shop

import { MAX_VENDOR_REVISION, MAX_VENDITEM } from '@flyffweb/protocol';

/** The slots the V8+ window shows (`MAX_VENDOR_REVISION`, ProjectCmn.h:41). */
export const VENDOR_SLOTS = MAX_VENDOR_REVISION;
export { MAX_VENDITEM };
/** The cap on the bag's penya and the shop's prices together (WndVendor.cpp:332, WndRegVend.cpp:326). */
export const MAX_TOTAL_GOLD = 2_100_000_000;
/** `INT_MAX`: the price is read as 64 bits and capped (WndRegVend.cpp:290-294). */
export const MAX_PRICE = 0x7fffffff;
/** The shop's name in bytes: 6 to 32 (`__RULE_0615`, WndVendor.cpp:351-353). */
export const MIN_NAME = 6;
export const MAX_NAME = 32;
/** A click opens another's shop within this distance of the camera (`m_fDistCamera < 20`, the zoom limit on by default). */
export const OPEN_CAMERA_RANGE = 20;
/** `IK3_CLOAK`, `IK3_QUEST` (Resource/defineItemkind.h:92, :118); `CItemElem::expired` (`m_byFlag`, Item.h:119). */
const IK3_CLOAK = 24;
const IK3_QUEST = 43;
const ITEM_EXPIRED = 0x01;
/** `MAX_VENDOR_ITEM_TEXT_EXTENT` (WndVendorCtrl.cpp:77): a slot's name is cut to 108 px. */
export const NAME_EXTENT = 108;

/** A registered item of the own shop: its bag object id, the count up for sale (`SetExtra`) and the unit price (`m_nCost`). */
export interface OwnSlot {
  objectId: number;
  count: number;
  cost: number;
}

/**
 * The top left of slot `i`'s icon in the shop window's client area: the control at (5, 60) (WndVendor.cpp:82), column `i % 2`
 * at x 15 or 235, row `i / 2` at `row * 32 + 8 + row * 4` (WndVendorCtrl.cpp:172-180).
 */
export function slotPoint(i: number): { x: number; y: number } {
  const row = Math.trunc(i / 2);
  return { x: 5 + (i % 2 === 0 ? 15 : 235), y: 60 + row * 36 + 8 };
}

/** The price's colour by its size (WndVendorCtrl.cpp:142-152). */
export function priceColor(cost: number): number {
  if (cost >= 1_000_000_000) return 0xff990099;
  if (cost >= 100_000_000) return 0xffcc0303;
  if (cost >= 10_000_000) return 0xffff6600;
  if (cost >= 1_000_000) return 0xff3333ff;
  if (cost >= 100_000) return 0xff009900;
  return 0xff000000;
}

/** `GetNumberFormatEx`: the thousands with commas (the English format; the Korean one is LANG_KOR's). */
export const withCommas = (n: number): string => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * A slot's name (WndVendorCtrl.cpp:82-114): "name +N" for an upgraded item, cut letter by letter once it is wider than
 * 108 px, the part that fits followed by "...".
 */
export function slotName(name: string, abilityOption: number, width: (text: string) => number): string {
  const full = abilityOption > 0 ? `${name} +${abilityOption}` : name;
  if (width(full) <= NAME_EXTENT) return full;
  let fits = '';
  for (const letter of full) {
    if (width(fits + letter) > NAME_EXTENT) break;
    fits += letter;
  }
  return `${fits}...`;
}

/**
 * Whether a bag item may go on the shop (WndVendor.cpp:250-300): not a quest item, not expired, not held already
 * (`IsUsingItem`), not worn. (A guild cloak is refused too; the browser does not keep `m_idGuild`, so the server's own
 * refusal stands for it: DPSrvr.cpp:7155-7156.)
 */
export function canPutUp(item: { objectId: number; count: number; flag?: number }, kind3: number | undefined, held: boolean, worn: boolean): boolean {
  if (kind3 === IK3_QUEST) return false;
  if (((item.flag ?? 0) & ITEM_EXPIRED) !== 0) return false;
  if (held || worn) return false;
  return item.count > 0;
}

/** Whether a guild cloak (the client's check, for a caller that knows the guild). */
export const isGuildCloak = (kind3: number | undefined, guildId: number): boolean => kind3 === IK3_CLOAK && guildId !== 0;

/**
 * The bag's penya plus every registered price times its count, added as Neuz's `int` adds them (it wraps past
 * 2,147,483,647: WndVendor.cpp:321-330, WndRegVend.cpp:308-316).
 */
export function vendorGold(gold: number, slots: readonly (OwnSlot | null)[]): number {
  let total = gold | 0;
  for (const slot of slots) if (slot !== null) total = (total + Math.imul(slot.cost, slot.count)) | 0;
  return total;
}

/** OK's gold check (WndVendor.cpp:332): the total must be over 0 and under 2,100,000,000. */
export const openGoldOk = (gold: number, slots: readonly (OwnSlot | null)[]): boolean => {
  const total = vendorGold(gold, slots);
  return total > 0 && total < MAX_TOTAL_GOLD;
};

/** The registration's gold check (WndRegVend.cpp:308-330): with this price and count added (in 64 bits), over 0, under the cap, and grown. */
export function registerGoldOk(gold: number, slots: readonly (OwnSlot | null)[], cost: number, count: number): boolean {
  const old = vendorGold(gold, slots);
  const sum = old + cost * count;
  return !(sum <= 0 || sum >= MAX_TOTAL_GOLD || old >= sum);
}

/** CP949 bytes of the name, as `GetLength` counts them: one byte a letter for the English client's letters. */
export const nameBytes = (name: string): number => [...name].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);

export type NameCheck = { ok: true; name: string } | { ok: false; box: 'TID_DIAG_0020' | 'TID_DIAG_0011' };

/**
 * OK's name rules (WndVendor.cpp:314-359): trimmed; a banned word inside (`IsInvalidName`, lower case) is "not allowed"
 * (the vendor's letter set, Letter2_ENG.inc, does not exist: every letter passes, ProjectCmn.cpp:845-873); the chat's word
 * filter changes it (`WordChange`); then 6 to 32 bytes.
 */
export function checkShopName(typed: string, invalidNames: readonly string[], wordChange: (text: string) => string): NameCheck {
  let name = typed.trim();
  const lower = name.toLowerCase();
  if (invalidNames.some((word) => word !== '' && lower.includes(word))) return { ok: false, box: 'TID_DIAG_0020' };
  name = wordChange(name);
  const bytes = nameBytes(name);
  if (bytes < MIN_NAME || bytes > MAX_NAME) return { ok: false, box: 'TID_DIAG_0011' };
  return { ok: true, name };
}

/** The balloon's text (DialogMsg.cpp:932-942): the line breaks as spaces. */
export const balloonText = (title: string): string => title.replace(/\n/g, ' ');
