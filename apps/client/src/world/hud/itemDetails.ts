// The item tooltip on screen (2026-11-05), drawn as Neuz's `CToolTip` draws `PutToolTip_Item`'s text
// (Source/_Interface/tooltip.cpp): the theme's nine `WndTooltipTile00-08.tga` tiles 8 px around the text, the text 3 px in
// and wrapped at 200 px, each run in its colour and style. The lines are `itemTooltip`'s. It no longer says the count,
// which Neuz never prints (the count is on the icon).

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { OwnState } from '../OwnState';
import { itemTooltip, ultimateSockets } from '../items/itemTooltip';
import type { TooltipContext, TooltipData, TooltipFlag, TooltipLine, TooltipViewer } from '../items/itemTooltip';
import type { TooltipTax } from '../items/tax';
import { themeKey, themeUrl } from './art';
import type { UiArt } from './art';

/** An empty equipment slot (`NULL_ID`). */
const NO_ITEM = 0xffffffff;

/**
 * 2026-11-15 (item tooltip gaps): what the world knows that the item tooltip reads beyond the own player: the item's
 * cool-down left (`CCooltimeMgr`), the guild list (`g_GuildMng`), the player names (`CPlayerDataCenter`) and the tax
 * where the player stands (`CTax`). The world screen sets it (`setTooltipWorld`); none of it is there without one.
 */
export interface TooltipWorld {
  cooldownLeft?(itemId: number): number;
  guildName?(guildId: number): string | undefined;
  playerName?(playerId: number): string | undefined;
  tax?(): TooltipTax | null;
}

let world: TooltipWorld = {};

/** 2026-11-15: the world the tooltips read (`{}` when the world screen goes). */
export function setTooltipWorld(next: TooltipWorld): void {
  world = next;
}

/**
 * The context the own player gives a tooltip: who judges the requirement colours, what is worn, whether this is; 2026-11-09
 * (pets R2) how many of an item the bag holds (`GetItemNumForClient`) and, when given, the own buffs (`hasBuff`); (pets B1)
 * the clock (`time_null()`), a bag item's vis and their end times, and the own buff pet's (`GetVisPetItem`).
 */
export function ownTooltipContext(
  own: OwnState | undefined, item: InventoryItem, flag: TooltipFlag, shopOpen = false,
  hasBuff?: (buffType: number, id: number) => boolean,
): TooltipContext {
  // 2026-11-15: the world's cool-down, names and tax, for every window's tooltip
  const cooldownLeft = world.cooldownLeft?.(item.itemId) ?? 0;
  const lookups: Partial<TooltipContext> = {
    ...(cooldownLeft > 0 ? { cooldownLeft } : {}),
    ...(world.guildName !== undefined ? { guildName: world.guildName.bind(world) } : {}),
    ...(world.playerName !== undefined ? { playerName: world.playerName.bind(world) } : {}),
    ...(world.tax !== undefined ? { tax: world.tax() } : {}),
  };
  if (own === undefined) return { flag, viewer: null, shopOpen, ...lookups };
  const inBag = flag !== 'shop' && own.inventory?.get(item.objectId)?.itemId === item.itemId;
  const keepEnd = inBag ? own.keepEndOf(item.objectId) : undefined;
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
    ...(keepEnd !== undefined ? { keepEnd } : {}), ...lookups,
  };
}

/**
 * 2026-11-17 (view-equip-options): the context of a View Equipment tooltip (`PutToolTip_Item( ..., APP_QUERYEQUIP )`,
 * WndManager.cpp:6226-6232): the player shown judges the requirement colours, its worn parts count its set pieces and give
 * its set +N, and the item is worn. The world's names are read as for any tooltip; the cool-down is the own player's, not
 * asked here.
 */
export function queryEquipTooltipContext(viewer: TooltipViewer, worn: (part: number) => InventoryItem | undefined): TooltipContext {
  return {
    flag: 'queryEquip', viewer, worn, isWorn: true,
    ...(world.guildName !== undefined ? { guildName: world.guildName.bind(world) } : {}),
    ...(world.playerName !== undefined ? { playerName: world.playerName.bind(world) } : {}),
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
  // 2026-11-15: a comparison tooltip is its own kind of box, so the page's one "Item details" stays one
  details.className = ctx.equipped === true ? 'inventory-compare hud-item-tooltip hud-item-tooltip-sub' : 'inventory-details hud-item-tooltip';
  details.setAttribute('role', 'group');
  details.setAttribute('aria-label', ctx.equipped === true ? 'Equipped item details' : 'Item details');
  const lines: TooltipLine[] = prop === undefined
    ? [[{ text: `Unknown item #${item.itemId}`, color: 0x2e70a9, bold: true }]]
    : itemTooltip(item, prop, data, ctx);
  details.append(tooltipFrame(doc, art), tooltipText(doc, lines));
  const sockets = prop === undefined ? null : ultimateSockets(item, prop);
  if (sockets !== null) details.append(...ultimateMarks(doc, art, data, sockets));
  return details;
}

/**
 * 2026-11-10: an Ultimate item's marks (`CToolTip`, tooltip.cpp:745-780): Icon_Ultimate.dds at the top left (10, 8), and
 * with open sockets a 36 px band at the bottom, a WndChgElemItem.bmp a socket every 38 px, each with its jewel's icon.
 */
function ultimateMarks(doc: Document, art: UiArt, data: TooltipData, sockets: readonly number[]): HTMLElement[] {
  const icon = doc.createElement('img');
  icon.className = 'hud-item-tooltip-ultimate';
  icon.src = art.url(themeKey('Icon_Ultimate.dds'));
  icon.alt = '';
  if (sockets.length === 0) return [icon];
  const row = doc.createElement('div');
  row.className = 'hud-item-tooltip-sockets';
  for (const jewel of sockets) {
    const socket = doc.createElement('div');
    socket.className = 'hud-item-tooltip-socket';
    socket.style.backgroundImage = themeUrl(art, 'WndChgElemItem.bmp');
    const prop = jewel === 0 ? undefined : data.itemProps.get(jewel);
    if (prop?.icon) {
      const img = doc.createElement('img');
      img.src = art.url(prop.icon);
      img.alt = prop.name;
      socket.append(img);
      socket.dataset.jewel = String(jewel);
    }
    row.append(socket);
  }
  return [icon, row];
}

/**
 * 2026-11-15: the comparison tooltips of the worn items `worn` (`PutToolTipParts` with TOOL_TIP_SWITCH_SUB1 and SUB2,
 * WndManager.cpp:6499-6539): each the worn item's tooltip with the same flag as the main one, "[ Equipped ]" on top.
 */
export function createComparison(
  doc: Document, art: UiArt, data: TooltipData, worn: readonly InventoryItem[], context: (item: InventoryItem) => TooltipContext,
): HTMLElement[] {
  return worn.map((item) => createItemDetails(doc, art, data, item, data.itemProps.get(item.itemId), { ...context(item), equipped: true }));
}

/**
 * 2026-11-15: the main tooltip and its comparison tooltips on the desktop (`CToolTip`'s sub 1 and sub 2, tooltip.cpp:
 * 432-499): each right of the one before (`left + width + 16` between the text rects, so the frames touch), each above
 * the slot by its own height (their bottoms level), the main one pulled left when the row would leave the screen (V15's
 * fixed 224 / 470; here the row's own width), and one with no room above put as `positionItemDetails` puts it.
 */
export function positionItemComparison(
  main: HTMLElement, subs: readonly HTMLElement[], anchorElement: HTMLElement, doc: Document,
): void {
  const boxes = [main, ...subs];
  for (const box of boxes) Object.assign(box.style, { left: '0px', top: '0px', right: 'auto', width: 'max-content' });
  const anchor = anchorElement.getBoundingClientRect(), view = doc.defaultView;
  const screenWidth = view?.innerWidth ?? 1280, screenHeight = view?.innerHeight ?? 720;
  const sizes = boxes.map((box) => {
    const rect = box.getBoundingClientRect();
    return { width: rect.width || 230, height: rect.height || 80, originX: rect.left, originY: rect.top };
  });
  const total = sizes.reduce((sum, size) => sum + size.width, 0);
  let x = anchor.left;
  if (x + total + 8 > screenWidth) x = screenWidth - total - 8;
  x = Math.max(8, x);
  boxes.forEach((box, i) => {
    const { width, height, originX, originY } = sizes[i]!;
    let y = anchor.top - height - 10;
    if (y < 8) y = Math.min(anchor.bottom + 10, screenHeight - height - 8);
    box.style.left = x - originX + 'px';
    box.style.top = Math.max(8, y) - originY + 'px';
    x += width;
  });
}

/**
 * 2026-11-15: the phone's comparison (the landscape iPhone's game area is about 800 x 350): `row` holds the main tooltip
 * and the comparison ones side by side along the bag's bottom, the main one first and the last at the bag's right, their
 * bottoms level (the CSS). Here the row is made smaller when it is wider than the room left of its right edge, and each
 * box no taller than the room above its bottom; a taller one scrolls.
 */
export function fitPhoneComparison(row: HTMLElement): void {
  // the row's right and bottom stay put under its scale (`transform-origin: right bottom`) and its width is its layout's,
  // so it is measured as it is: a box's scroll is not lost to a height taken off and put back
  const rect = row.getBoundingClientRect();
  const width = row.scrollWidth || rect.width;
  const scale = width > 0 ? Math.min(1, (rect.right - 8) / width) : 1;
  row.style.transform = scale < 1 ? `scale(${scale})` : '';
  row.style.setProperty('--compare-max-height', `${Math.max(60, Math.floor((rect.bottom - 8) / scale))}px`);
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
