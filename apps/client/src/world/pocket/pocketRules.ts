// The extra bag's rules (2026-11-17, docs/2026-11-17-extra-bag-research.md §2-§4): what a drop or a tap asks for, as
// Neuz's handlers decide it, kept apart from the windows so that they can be tested alone.
//
//   CWndBagEx::OnDropIcon          _Interface/WndBagEx.cpp:220-270    an Extra Bag from the bag on bag icon 1 or 2:
//                                                                     TID_GAME_ALREADY_USE, or AVAIL_POCKET
//   CWndBagEx::OnChildNotify       WndBagEx.cpp:348-500               a drop on a pocket's grid, from the bag or a pocket
//   CWndInventory::OnChildNotify   _Interface/WndField.cpp:1918-1977  a pocket's item dropped on the bag
//   CWndTradeGold (APP_BAG_EX)     WndField.cpp:8529-8542             the count's box: at least 1, at most the stack
//   CWndBagEx::OnMouseWndSurface   WndBagEx.cpp:272-345               the bag icons' tooltips

import type { InventoryItem } from '@flyffweb/protocol';
import { BAG_POCKET, encodeAvailPocket, encodeMoveItemPocket } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import { formatDuration } from '../hud/duration';
import type { PocketBook } from './pocketBook';

/** `IK3_QUEST`, `IK3_POCKET` (`Resource/defineItemkind.h:118`, `:184`). */
export const IK3_QUEST = 43;
export const IK3_POCKET = 123;

/** What a drop or a tap asks: nothing, a line, a message box, a packet at once, or the count's box first. */
export type PocketAction =
  | { kind: 'none' }
  | { kind: 'line'; tid: string }
  | { kind: 'box'; tid: string }
  | { kind: 'send'; bytes: Uint8Array }
  | { kind: 'ask'; max: number; send: (count: number) => Uint8Array | null };

/** What a rule is weighed against. */
export interface PocketContext {
  pockets: PocketBook;
  bagItems: ReadonlyMap<number, InventoryItem> | null;
  /** The bag object is worn (`IsEquip`): a drag from the equipment. */
  worn(objectId: number): boolean;
  prop(itemId: number): WebItemProp | undefined;
}

const NONE: PocketAction = { kind: 'none' };

/** The count's box for a stack, or the packet at once for one (count 1). */
function moveOrAsk(item: InventoryItem, now: () => InventoryItem | undefined, send: (count: number) => Uint8Array): PocketAction {
  if (item.count > 1) {
    return {
      kind: 'ask', max: item.count,
      // CWndTradeGold: at least 1, at most the stack as it was asked (m_dwGold); nothing when the item went meanwhile
      send: (n) => (now() === undefined ? null : send(Math.max(1, Math.min(Math.trunc(n), item.count)))),
    };
  }
  return { kind: 'send', bytes: send(1) };
}

/** A bag item dropped on pocket `target`'s grid (`WndBagEx.cpp:362-430`). */
export function bagToPocket(target: number, objectId: number, ctx: PocketContext): PocketAction {
  // pockets 1 and 2 take nothing while not in use (`if(!m_bUse[..]) return FALSE`)
  if (!ctx.pockets.usable(target)) return NONE;
  const item = ctx.bagItems?.get(objectId);
  if (item === undefined) return NONE;
  // dragged from the equipment: not one selected bag item
  if (ctx.worn(objectId)) return { kind: 'line', tid: 'TID_GAME_EQUIPPUT' };
  if (ctx.prop(item.itemId)?.kind3 === IK3_QUEST) return { kind: 'line', tid: 'TID_GAME_ERROR_DONT_MOVE_QUEST_ITEM_TO_BAG_EX' };
  return moveOrAsk(item, () => ctx.bagItems?.get(objectId), (n) => encodeMoveItemPocket(BAG_POCKET, objectId, n, target));
}

/** Pocket `from`'s item dropped on pocket `target`'s grid (`WndBagEx.cpp:432-500`): both in use; its own grid does nothing. */
export function pocketToPocket(from: number, objectId: number, target: number, ctx: PocketContext): PocketAction {
  if (from === target || !ctx.pockets.usable(from) || !ctx.pockets.usable(target)) return NONE;
  const item = ctx.pockets.item(from, objectId);
  if (item === undefined) return NONE;
  return moveOrAsk(item, () => ctx.pockets.item(from, objectId), (n) => encodeMoveItemPocket(from, objectId, n, target));
}

/** Pocket `from`'s item dropped on the bag (`WndField.cpp:1918-1977`): the pocket must be in use. */
export function pocketToBag(from: number, objectId: number, ctx: PocketContext): PocketAction {
  if (!ctx.pockets.usable(from)) return NONE;
  const item = ctx.pockets.item(from, objectId);
  if (item === undefined) return NONE;
  return moveOrAsk(item, () => ctx.pockets.item(from, objectId), (n) => encodeMoveItemPocket(from, objectId, n, BAG_POCKET));
}

/** A bag item dropped on bag icon `pocket` (1 or 2): an Extra Bag opens it, unless it is in use (`WndBagEx.cpp:220-270`). */
export function bagToIcon(pocket: number, objectId: number, ctx: PocketContext): PocketAction {
  if (pocket !== 1 && pocket !== 2) return NONE;
  const item = ctx.bagItems?.get(objectId);
  if (item === undefined || ctx.prop(item.itemId)?.kind3 !== IK3_POCKET) return NONE;
  if (ctx.pockets.usable(pocket)) return { kind: 'box', tid: 'TID_GAME_ALREADY_USE' };
  return { kind: 'send', bytes: encodeAvailPocket(pocket, objectId) };
}

/**
 * The phone's tap on a bag item with pocket `shown` on its panel: into that pocket when it is in use; an Extra Bag on a
 * closed pocket opens it (the drop on its icon); anything else on a closed pocket does nothing.
 */
export function tapBagItem(shown: number, objectId: number, ctx: PocketContext): PocketAction {
  if (ctx.pockets.usable(shown)) return bagToPocket(shown, objectId, ctx);
  return bagToIcon(shown, objectId, ctx);
}

/**
 * A bag icon's tooltip: the time left of a pocket in use (`TID_TOOLTIP_BAG_TIME`, "%d Days %d Hours %d Minutes left", shown
 * short by the owner's 2026-11-14 rule: "29d23h left"), else `TID_TOOLTIP_BAG_INFO`.
 */
export function iconTooltip(pocket: number, pockets: PocketBook, now: number, text: (tid: string, fallback: string) => string): string {
  if (!pockets.usable(pocket)) return text('TID_TOOLTIP_BAG_INFO', 'Place the Extra Bag icon here.');
  const left = pockets.secondsLeft(pocket, now) ?? 0;
  // the TID's last word ("left") after the short time; its three %d are the time, which formatDuration writes
  const words = text('TID_TOOLTIP_BAG_TIME', '%d Days %d Hours %d Minutes left').split('%d').pop()?.trim() ?? '';
  const tail = words.replace(/^\S+\s*/, '');
  // whole minutes, as the V15 line (no seconds)
  const time = left < 60 ? '0m' : formatDuration(Math.floor(left / 60), 'min');
  return `${time} ${tail || 'left'}`;
}
