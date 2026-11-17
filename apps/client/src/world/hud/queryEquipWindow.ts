// 2026-11-17 (view-equip-options): the View Equipment window, `CWndQueryEquip` (APP_QUERYEQUIP), which the player menu's
// "View equipment" opens once the world server answers (docs/2026-11-17-view-equip-options.md):
//
//   resdata.inc APP_QUERYEQUIP      Resource/resdata.inc:24102   "WndQueryEquip.tga" (not tiled), 236 x 284, "View";
//                                                                WIDC_CUSTOM1-19 the slots, WIDC_CUSTOM20 54,32-174,206 the model
//   CDPClient::OnQueryEquip         Neuz/DPClient.cpp:15706-15736  each worn part's extras (EQUIP_INFO_ADD); the window made
//                                                                again for the player, if it is in view
//   CWndQueryEquip::OnInitialUpdate _Interface/WndField.cpp:867-919  the parts' rects (the bag's: m_InvenRect), centred
//   CWndQueryEquip::OnDraw          WndField.cpp:591-839           each worn part's icon from `m_aEquipInfo` (2 and up):
//                                                                +6,+6 in a 44 px slot; the jewellery at 0.8, the costume at
//                                                                0.9, from the slot's corner; a two-handed weapon's copy in the
//                                                                left hand at alpha 100; an expired one tinted (255, 100, 100);
//                                                                then the player's model dressed as it is
//   CWndQueryEquip::OnMouseWndSurface WndField.cpp:551-589         the tooltip of the part under the mouse: the item made from
//                                                                `m_aEquipInfo` (id, flag, upgrade) and the extras, as
//                                                                APP_QUERYEQUIP (the player's own set pieces and set +N)
//   CWndQueryEquip::Process         WndField.cpp:524-549           closed when the player is no longer there (__CSC_VER12_1:
//                                                                no distance)
//
// The model is drawn once (as the bag's, renderPortrait), not turned with the mouse. The phone: the same window, its slots
// tapped for the tooltip, which has a close button.

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem, QueryEquipPart, WornPart } from '@flyffweb/protocol';
import type { TooltipData } from '../items/itemTooltip';
import type { TooltipViewer } from '../items/itemTooltip';
import type { UiArt } from './art';
import { WindowFrame } from './frame';
import { createItemDetails, positionItemDetails, queryEquipTooltipContext } from './itemDetails';

/** `IDS_RESDATA_INC_003154`. */
const TITLE = 'View';
const WIDTH = 236;
const HEIGHT = 284;
/** `CItemElem::expired` (`m_byFlag`). */
const ITEM_EXPIRED = 0x01;
/** `HD_TWO`, a two-handed weapon (`dwHanded`). */
const HD_TWO = 2;
const PARTS_LWEAPON = 9;
/** WIDC_CUSTOM20: where the model is drawn. */
export const MODEL_RECT = { left: 54, top: 32, width: 120, height: 174 } as const;

/**
 * The slots (`OnInitialUpdate`, WndField.cpp:874-917): each WIDC_CUSTOM rect and the parts drawn in it, in the order `OnDraw`
 * draws them (the higher part last, on top; its tooltip the one shown).
 */
const SLOTS: ReadonlyArray<{ parts: readonly number[]; x: number; y: number; size: number }> = [
  { parts: [6, 14], x: 178, y: 4, size: 44 }, // CUSTOM1: PARTS_CAP, PARTS_CAP2
  { parts: [2, 15], x: 178, y: 52, size: 44 }, // CUSTOM2: PARTS_UPPER_BODY, PARTS_UPPER2
  { parts: [4, 17], x: 178, y: 100, size: 44 }, // CUSTOM3: PARTS_HAND, PARTS_HAND2
  { parts: [5, 18], x: 178, y: 148, size: 44 }, // CUSTOM4: PARTS_FOOT, PARTS_FOOT2
  { parts: [10], x: 6, y: 4, size: 44 }, // CUSTOM5: PARTS_RWEAPON
  { parts: [9, 11], x: 6, y: 52, size: 44 }, // CUSTOM6: PARTS_LWEAPON, PARTS_SHIELD
  { parts: [25], x: 6, y: 100, size: 44 }, // CUSTOM7: PARTS_BULLET
  { parts: [8], x: 6, y: 148, size: 44 }, // CUSTOM8: PARTS_CLOAK
  { parts: [12], x: 6, y: 196, size: 44 }, // CUSTOM9: PARTS_MASK
  { parts: [13], x: 176, y: 196, size: 44 }, // CUSTOM10: PARTS_RIDE
  { parts: [20], x: 52, y: 4, size: 24 }, // CUSTOM11: PARTS_RING1
  { parts: [22], x: 76, y: 4, size: 24 }, // CUSTOM12: PARTS_EARRING1
  { parts: [19], x: 102, y: 4, size: 24 }, // CUSTOM13: PARTS_NECKLACE1
  { parts: [23], x: 128, y: 4, size: 24 }, // CUSTOM14: PARTS_EARRING2
  { parts: [21], x: 152, y: 4, size: 24 }, // CUSTOM15: PARTS_RING2
  { parts: [26], x: 52, y: 210, size: 31 }, // CUSTOM16: PARTS_HAT
  { parts: [27], x: 82, y: 210, size: 31 }, // CUSTOM17: PARTS_CLOTH
  { parts: [28], x: 114, y: 210, size: 31 }, // CUSTOM18: PARTS_GLOVE
  { parts: [29], x: 144, y: 210, size: 31 }, // CUSTOM19: PARTS_BOOTS
];

/** The icon's place in its slot (`OnDraw`, :622-646): +6,+6 at 1; the jewellery (19-23) at 0.8 and the costume (26-29) at 0.9. */
export function iconPlacement(part: number): { offset: number; scale: number } {
  if (part >= 19 && part <= 23) return { offset: 0, scale: 0.8 };
  if (part >= 26 && part <= 29) return { offset: 0, scale: 0.9 };
  return { offset: 6, scale: 1 };
}

/** The player whose equipment is shown: its look's parts, and who judges the tooltip's colours. */
export interface QueryEquipTarget {
  objectId: number;
  name: string;
  viewer: TooltipViewer;
  worn: readonly WornPart[];
}

/**
 * The item a worn part's tooltip is made of (`OnMouseWndSurface`, :566-583): its id and flag, the upgrade (`nOption &
 * 0xFF`), and the extras of QUERYEQUIP (the element, its upgrade, the awakening, the piercing).
 */
export function queryEquipItem(worn: WornPart, extra: QueryEquipPart | undefined): InventoryItem {
  const abilityOption = (worn.option ?? 0) & 0xff;
  return {
    objectId: worn.part, itemId: worn.itemId, count: 1,
    ...(worn.flag !== 0 ? { flag: worn.flag } : {}),
    ...(abilityOption !== 0 ? { abilityOption } : {}),
    ...(extra !== undefined && extra.resist !== 0 ? { resist: extra.resist } : {}),
    ...(extra !== undefined && extra.resistOption !== 0 ? { resistOption: extra.resistOption } : {}),
    ...(extra !== undefined && extra.randomOption !== 0n ? { randomOption: extra.randomOption } : {}),
    ...(extra !== undefined && extra.piercing.length > 0 ? { piercing: [...extra.piercing] } : {}),
    ...(extra !== undefined && extra.ultimate.length > 0 ? { ultimate: [...extra.ultimate] } : {}),
  };
}

export class QueryEquipWindow {
  readonly frame: WindowFrame;
  private readonly mobile: boolean;
  private readonly preview: HTMLElement;
  private readonly slots: HTMLElement;
  private target: QueryEquipTarget | null = null;
  private extras = new Map<number, QueryEquipPart>();
  /** The worn items by part, as last drawn. */
  private items = new Map<number, InventoryItem>();
  /** What the slots were drawn from, to draw them again only when it changes; null before the first draw. */
  private drawnKey: string | null = null;
  private tooltip: HTMLElement | null = null;
  private tooltipPart: number | null = null;

  constructor(
    private readonly art: UiArt, private readonly data: TooltipData, private readonly doc: Document = document,
  ) {
    this.mobile = doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
    this.frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT, texture: 'WndQueryEquip.tga', mobileScale: 1, fitWhole: true }, doc);
    this.frame.element.classList.add('hud-query-equip');
    this.frame.element.toggleAttribute('data-phone', this.mobile);
    this.frame.overBag = true;
    this.frame.onClose = () => {
      this.hideTip();
      this.target = null;
      this.preview.replaceChildren();
    };
    this.preview = doc.createElement('div');
    this.preview.className = 'hud-query-equip-model';
    Object.assign(this.preview.style, {
      left: `${MODEL_RECT.left}px`, top: `${MODEL_RECT.top}px`, width: `${MODEL_RECT.width}px`, height: `${MODEL_RECT.height}px`,
    });
    this.slots = doc.createElement('div');
    this.slots.className = 'hud-query-equip-slots';
    this.frame.body.append(this.preview, this.slots);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** The object of the player shown, or null while closed. */
  get objectId(): number | null {
    return this.frame.isOpen ? this.target?.objectId ?? null : null;
  }

  /** `OnQueryEquip`: the window made again for `target` with its parts' extras, centred (`MoveParentCenter`). */
  open(target: QueryEquipTarget, extras: readonly QueryEquipPart[]): void {
    // `SAFE_DELETE( m_pWndQueryEquip )`: the one open goes first (its close forgets its player)
    this.close();
    this.target = target;
    this.extras = new Map(extras.map((extra) => [extra.part, extra]));
    this.drawnKey = null;
    this.frame.element.setAttribute('aria-label', `View: ${target.name}`);
    this.frame.open('center');
    this.draw();
  }

  close(): void {
    if (this.frame.isOpen) this.frame.close();
  }

  /** The model's picture (WIDC_CUSTOM20), drawn for the player shown. */
  setPreview(canvas: HTMLCanvasElement): void {
    if (this.target === null) return;
    this.preview.replaceChildren(canvas);
  }

  /** Each frame (`Process`): the player's worn parts as they are now (an EQUIP in view changes them). */
  update(target: QueryEquipTarget): void {
    if (this.target === null || target.objectId !== this.target.objectId) return;
    this.target = target;
    this.draw();
  }

  dispose(): void {
    this.close();
    this.frame.element.remove();
  }

  /** The slots from the player's worn parts (`OnDraw`), when they changed. */
  private draw(): void {
    const target = this.target;
    if (target === null) return;
    const key = target.worn.map((w) => `${w.part}:${w.itemId}:${w.flag}:${w.option ?? 0}`).join(',');
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.hideTip();
    const byPart = new Map(target.worn.filter((w) => w.part >= 2).map((w) => [w.part, w]));
    this.items = new Map([...byPart].map(([part, worn]) => [part, queryEquipItem(worn, this.extras.get(part))]));
    const cells = SLOTS.map((slot) => {
      const cell = this.doc.createElement('button');
      cell.type = 'button';
      cell.className = 'hud-query-equip-slot';
      cell.dataset.silent = '';
      Object.assign(cell.style, { left: `${slot.x}px`, top: `${slot.y}px`, width: `${slot.size}px`, height: `${slot.size}px` });
      const shown = slot.parts.filter((part) => this.items.has(part) && this.data.itemProps.get(this.items.get(part)!.itemId) !== undefined);
      // the part whose tooltip shows: the last drawn (the higher), as each part's PutToolTip_Item follows the one before
      const top = shown.at(-1);
      cell.dataset.parts = slot.parts.join(' ');
      if (top !== undefined) cell.dataset.part = String(top);
      for (const part of shown) {
        const item = this.items.get(part)!;
        const prop = this.data.itemProps.get(item.itemId)!;
        if (prop.icon) cell.append(this.icon(part, item, prop, prop.icon));
      }
      const prop = top === undefined ? undefined : this.data.itemProps.get(this.items.get(top)!.itemId);
      cell.setAttribute('aria-label', prop === undefined ? 'Empty slot' : prop.name);
      cell.disabled = top === undefined;
      if (top !== undefined) {
        if (this.mobile) {
          cell.addEventListener('click', () => (this.tooltipPart === top ? this.hideTip() : this.showTip(top, cell)));
        } else {
          cell.addEventListener('mouseenter', () => this.showTip(top, cell));
          cell.addEventListener('mouseleave', () => { if (this.tooltipPart === top) this.hideTip(); });
        }
      }
      return cell;
    });
    this.slots.replaceChildren(...cells);
  }

  /** A part's icon in its slot, as `OnDraw` places, scales, fades and tints it. */
  private icon(part: number, item: InventoryItem, prop: WebItemProp, key: string): HTMLElement {
    const { offset, scale } = iconPlacement(part);
    const size = 32 * scale;
    const icon = this.doc.createElement('span');
    icon.className = 'hud-query-equip-icon';
    icon.dataset.part = String(part);
    const url = `url(${JSON.stringify(this.art.url(key))})`;
    Object.assign(icon.style, { left: `${offset}px`, top: `${offset}px`, width: `${size}px`, height: `${size}px`, backgroundImage: url });
    // the left hand's copy of a two-handed weapon at alpha 100 (:614-620)
    if (part === PARTS_LWEAPON && prop.handed === HD_TWO) icon.style.opacity = String(100 / 255);
    if (((item.flag ?? 0) & ITEM_EXPIRED) !== 0) {
      // RenderTexture2( ..., D3DCOLOR_XRGB( 255, 100, 100 ) ): the icon times (1, 100/255, 100/255)
      const tint = this.doc.createElement('i');
      tint.className = 'hud-query-equip-expired';
      tint.style.setProperty('-webkit-mask-image', url);
      tint.style.setProperty('mask-image', url);
      icon.append(tint);
    }
    return icon;
  }

  /** The tooltip of the part (`PutToolTip_Item( ..., APP_QUERYEQUIP )`), at its slot; a phone's with a close button. */
  private showTip(part: number, anchor: HTMLElement): void {
    const target = this.target;
    const item = this.items.get(part);
    if (target === null || item === undefined) return;
    this.hideTip();
    const prop = this.data.itemProps.get(item.itemId);
    const context = queryEquipTooltipContext(target.viewer, (p) => this.items.get(p));
    const details = createItemDetails(this.doc, this.art, this.data, item, prop, context);
    details.classList.add('hud-query-equip-tooltip');
    if (this.mobile) {
      const close = this.doc.createElement('button');
      close.type = 'button';
      close.className = 'inventory-details-close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close item details');
      close.addEventListener('click', () => this.hideTip());
      details.append(close);
    }
    this.frame.body.append(details);
    positionItemDetails(details, anchor, this.doc);
    this.tooltip = details;
    this.tooltipPart = part;
  }

  private hideTip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
    this.tooltipPart = null;
  }
}
