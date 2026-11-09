// The item tooltip on screen (2026-11-05), drawn as Neuz's `CToolTip` draws `PutToolTip_Item`'s text
// (Source/_Interface/tooltip.cpp): the theme's nine `WndTooltipTile00-08.tga` tiles 8 px around the text, the text 3 px in
// and wrapped at 200 px, each run in its colour and style. The lines are `itemTooltip`'s. It no longer says the count,
// which Neuz never prints (the count is on the icon).

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { OwnState } from '../OwnState';
import { itemTooltip } from '../items/itemTooltip';
import type { TooltipContext, TooltipData, TooltipFlag, TooltipLine } from '../items/itemTooltip';
import { themeUrl } from './art';
import type { UiArt } from './art';

/** An empty equipment slot (`NULL_ID`). */
const NO_ITEM = 0xffffffff;

/**
 * The context the own player gives a tooltip: who judges the requirement colours, what is worn, whether this is; 2026-11-09
 * (pets R2) how many of an item the bag holds (`GetItemNumForClient`) and, when given, the own buffs (`hasBuff`); (pets B1)
 * the clock (`time_null()`), a bag item's vis and their end times, and the own buff pet's (`GetVisPetItem`).
 */
export function ownTooltipContext(
  own: OwnState | undefined, item: InventoryItem, flag: TooltipFlag, shopOpen = false,
  hasBuff?: (buffType: number, id: number) => boolean,
): TooltipContext {
  if (own === undefined) return { flag, viewer: null, shopOpen };
  const inBag = flag !== 'shop' && own.inventory?.get(item.objectId)?.itemId === item.itemId;
  const visPet = inBag ? own.visPetOf(item.objectId) : undefined;
  const active = own.visPetItem();
  const activeVisPet = active === undefined ? undefined : own.visPetOf(active.objectId);
  const worn = (part: number): InventoryItem | undefined => {
    const id = own.equipmentObjectIds[part];
    return id === undefined || id === NO_ITEM ? undefined : own.inventory?.get(id);
  };
  const countOf = (itemId: number): number => {
    let count = 0;
    for (const other of own.inventory?.values() ?? []) if (other.itemId === itemId) count += other.count;
    return count;
  };
  return {
    flag, viewer: { sex: own.sex, job: own.job, level: own.level }, worn,
    isWorn: own.equipmentObjectIds.includes(item.objectId), shopOpen, countOf, ...(hasBuff !== undefined ? { hasBuff } : {}),
    now: own.clock(), ...(visPet !== undefined ? { visPet } : {}), ...(activeVisPet !== undefined ? { activeVisPet } : {}),
  };
}

/**
 * 2026-11-09 (pets R2): a tooltip of `lines` in `CToolTip`'s frame (the item tooltip's look), for the windows that put
 * their own text up (`g_toolTip.PutToolTip` with a `CEditString`, the pet window's steps).
 */
export function createTooltip(doc: Document, art: UiArt, lines: readonly TooltipLine[]): HTMLElement {
  const details = doc.createElement('div');
  details.className = 'inventory-details hud-item-tooltip';
  details.setAttribute('role', 'tooltip');
  details.append(tooltipFrame(doc, art), tooltipText(doc, lines));
  return details;
}

/** The nine `WndTooltipTile00-08.tga` tiles: 0 top-left, 1 top, 2 top-right, 3 left, 4 centre, 5 right, 6-8 the bottom. */
function tooltipFrame(doc: Document, art: UiArt): HTMLElement {
  const frame = doc.createElement('div');
  frame.className = 'hud-item-tooltip-frame';
  frame.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 9; i++) {
    const tile = doc.createElement('div');
    tile.style.backgroundImage = themeUrl(art, `WndTooltipTile${String(i).padStart(2, '0')}.tga`);
    frame.append(tile);
  }
  return frame;
}

/** The lines, each run in its colour and style. */
function tooltipText(doc: Document, lines: readonly TooltipLine[]): HTMLElement {
  const text = doc.createElement('div');
  text.className = 'hud-item-tooltip-text';
  for (const line of lines) {
    const row = doc.createElement('div');
    row.className = 'hud-item-tooltip-line';
    for (const run of line) {
      const span = doc.createElement('span');
      span.textContent = run.text;
      span.style.color = css(run.color);
      if (run.bold) span.style.fontWeight = 'bold';
      if (run.strike) span.style.textDecoration = 'line-through';
      row.append(span);
    }
    text.append(row);
  }
  return text;
}

/** `#RRGGBB` of a tooltip colour. */
const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** The tooltip of `item` (`prop` its row of propItem.txt, undefined for an item the catalog lacks). */
export function createItemDetails(
  doc: Document, art: UiArt, data: TooltipData, item: InventoryItem, prop: WebItemProp | undefined, ctx: TooltipContext,
): HTMLElement {
  const details = doc.createElement('div');
  details.className = 'inventory-details hud-item-tooltip';
  details.setAttribute('role', 'group');
  details.setAttribute('aria-label', 'Item details');
  const lines: TooltipLine[] = prop === undefined
    ? [[{ text: `Unknown item #${item.itemId}`, color: 0x2e70a9, bold: true }]]
    : itemTooltip(item, prop, data, ctx);
  details.append(tooltipFrame(doc, art), tooltipText(doc, lines));
  return details;
}

/**
 * Where Neuz puts an item tooltip (`CToolTip::PutToolTip`'s position 0, tooltip.cpp:406-490): above the hovered slot,
 * 10 px clear of it, moved in when it would leave the screen (below the slot when there is no room above).
 */
export function positionItemDetails(details: HTMLElement, anchorElement: HTMLElement, doc: Document): void {
  // 2026-11-05 (the owner: a tooltip away from its item, and a thin one wrapping over many lines at the bag's right): it
  // is measured at its own width at the screen's top left first. Measured where the CSS first puts it (past the left
  // edge), it shrank to its narrowest word, and its place and height were worked out from that size.
  Object.assign(details.style, { left: '0px', top: '0px', right: 'auto', width: 'max-content' });
  const anchor = anchorElement.getBoundingClientRect(), rect = details.getBoundingClientRect(), view = doc.defaultView;
  // a fixed box under a moved or scaled window starts at that window's corner, not the screen's: measured here, at 0 0
  const originX = rect.left, originY = rect.top;
  const width = rect.width || 230, height = rect.height || 80;
  const screenWidth = view?.innerWidth ?? 1280, screenHeight = view?.innerHeight ?? 720;
  let x = anchor.left, y = anchor.top - height - 10;
  if (x + width + 8 > screenWidth) x = screenWidth - width - 8;
  if (y < 8) y = Math.min(anchor.bottom + 10, screenHeight - height - 8);
  details.style.left = Math.max(8, x) - originX + 'px';
  details.style.top = Math.max(8, y) - originY + 'px';
}
