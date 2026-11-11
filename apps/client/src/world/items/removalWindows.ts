// The Upgrade Specialist's two removals (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md §4.2-4.3),
// as Neuz runs them:
//
//   Window                         Neuz (_Interface/WndField.cpp)                     sends
//   APP_REMOVE_ATTRIBUTE           CWndRemoveAttribute :21826-22020, its confirm      REMVOE_ATTRIBUTE 0xf000d00b at the
//                                  CWndRemoveAttributeConfirm :22031-22098            confirm's YES; the answer 0x0122
//   APP_SMELT_REMOVE_PIERCING_EX   CWndRemovePiercing :22101-22395                    PIERCINGREMOVE 0xf000f809, then closes
//
// Both cost the server's Penya (100,000; 1,000,000), which the server checks: the windows show the cost in their texts only.

import type { WebPiercingAvail } from '@flyffweb/formats';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import { dstTid, isDstRate, rateValue } from './itemTooltip';
import {
  NpcWindow, drawSlotIcon, isEleRefinable, onSlotPress, propOf, setDescription, slotBox, takeDrops,
} from './npcWindowKit';
import type { BagPress, NpcWindowHost } from './npcWindowKit';
import { isPierceAble } from './upgradeNpcWindows';

const EDIT = 'WndEditTile00.tga';
const START: ResControl = { kind: 'button', id: 'WIDC_START', rect: [0, 0, 0, 0], picture: 'ButtStart.bmp', label: 'Start', quarter: 64 };

// ---- Remove Element upgrading --------------------------------------------------------------------------------------

/** APP_REMOVE_ATTRIBUTE (resdata.inc:10496-10532). */
export const REMOVE_ATTRIBUTE: ResLayout = {
  title: 'Remove Element upgrading', width: 272, height: 256,
  controls: [
    { kind: 'static', id: 'WIDC_PIC_SLOT', rect: [114, 24, 146, 56], picture: 'WndChgElemItem.bmp' },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [16, 68, 250, 172], tile: EDIT, scroll: true },
    { ...START, rect: [98, 185, 162, 205] },
  ],
};

/** APP_REMOVE_ATTRIBUTE_CONFIRM (resdata.inc:11732-11768). */
export const REMOVE_ATTRIBUTE_CONFIRM: ResLayout = {
  title: 'Confirm Removal of Element Enhancement', width: 288, height: 128,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 12, 270, 64], tile: EDIT, scroll: true },
    { kind: 'button', id: 'WIDC_YES', rect: [56, 70, 128, 90], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [152, 70, 224, 90], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
  ],
};

/** CWndRemoveAttribute: a suit or weapon with an element upgrade; START asks, YES removes it. */
export class RemoveAttributeWindow extends NpcWindow {
  private item: number | null = null;
  private confirm: ResWindow | null = null;

  protected layout(): ResLayout { return REMOVE_ATTRIBUTE; }
  protected className(): string { return 'hud-remove-attribute'; }

  get state(): { item: number | null; confirmOpen: boolean } {
    return { item: this.item, confirmOpen: this.confirm?.isOpen === true };
  }

  /** OnInitialUpdate (:21873-21889): the description; START disabled. */
  protected opening(window: ResWindow): void {
    setDescription(window, 'WIDC_TEXT1', this.host.ui.doc, this.host.ultimate()?.descriptions.removeAttribute);
  }

  protected closing(): void {
    this.confirm?.close(); // the destructor destroys the confirm (:21839-21851)
  }

  /** The bag's double-click (:2151-2164): a suit or weapon with a free piece to `SetWeapon`; others are used. */
  take(objectId: number): BagPress {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || !isEleRefinable(prop) || this.host.reserved(objectId) > 0) return 'pass';
    this.setWeapon(objectId);
    return 'taken';
  }

  /** `SetWeapon` (:21968-21993), and the drop (:21931-21966): an item with no element upgrade is refused by a box. */
  setWeapon(objectId: number): void {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || !isEleRefinable(prop)) return;
    if ((this.host.own()?.inventory?.get(objectId)?.resistOption ?? 0) <= 0) {
      this.host.alert(this.host.text('TID_GAME_REMOVE_ERROR'));
      return;
    }
    this.letGo();
    this.item = objectId;
    this.host.reserve(objectId, true);
    this.draw();
  }

  /** START (:21995-22007): the confirm, once. */
  start(): void {
    if (this.item === null || this.confirm?.isOpen === true) return;
    if (this.confirm === null) {
      const confirm = new ResWindow(REMOVE_ATTRIBUTE_CONFIRM, this.host.ui.art, this.host.ui.doc);
      confirm.frame.element.classList.add('hud-jewel', 'hud-npc-item', 'hud-remove-attribute-confirm');
      // YES sends, the box staying (:22083-22088); NO closes it (:22089-22093)
      confirm.button('WIDC_YES').onclick = () => {
        if (this.item !== null) this.host.send({ type: 'removeAttribute', itemId: this.item });
      };
      confirm.button('WIDC_NO').onclick = () => confirm.close();
      this.confirm = confirm;
    }
    const confirm = this.confirm;
    const layer = this.host.ui.layer();
    if (layer !== null && confirm.element.parentElement !== layer) layer.append(confirm.element);
    confirm.setText('WIDC_TEXT1', this.host.text('TID_GAME_REMOVE_ATTRIBUTE'));
    confirm.open();
  }

  /** `ReceiveResult` (:22023-22029): TRUE says so in a box; either way the window (and its confirm) closes. */
  onResult(success: boolean): void {
    if (!this.isOpen) return;
    if (success) this.host.alert(this.host.text('TID_GAME_REMOVE_ATTRIBUTE_CONFIRM'));
    this.close();
  }

  protected wire(window: ResWindow): void {
    const box = slotBox(window, 'WIDC_PIC_SLOT');
    box.dataset.slot = '0';
    takeDrops(box, (objectId) => this.setWeapon(objectId));
    onSlotPress(this.host, box, () => { this.letGo(); this.draw(); }); // :21914-21929
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    this.letGo();
  }

  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const box = slotBox(window, 'WIDC_PIC_SLOT');
    drawSlotIcon(this.host, box, propOf(this.host, this.item));
    box.toggleAttribute('data-filled', this.item !== null);
    window.button('WIDC_START').disabled = this.item === null;
  }

  private letGo(): void {
    if (this.item !== null) this.host.reserve(this.item, false);
    this.item = null;
  }
}

// ---- Remove a Pierced Card -----------------------------------------------------------------------------------------

const ROWS = Array.from({ length: 10 }, (_, i) => `WIDC_STATIC_PIERCING${i + 1}`);
/** The rows' hover texts (`resData.txt.txt:5784-5802`). */
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

/** APP_SMELT_REMOVE_PIERCING_EX (resdata.inc:22329-22447). */
export const REMOVE_PIERCING: ResLayout = {
  title: 'Pierced Card Removal', width: 272, height: 480,
  controls: [
    { kind: 'static', id: 'WIDC_PIC_SLOT', rect: [114, 14, 146, 46], picture: 'WndChgElemItem.bmp' },
    ...ROWS.map((id, i): ResControl => ({ kind: 'static', id, rect: [10, 54 + 26 * i, 250, 78 + 26 * i], picture: 'WndSquare3.bmp' })),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 326, 258, 402], tile: EDIT, scroll: true },
    { ...START, rect: [98, 412, 162, 432] },
  ],
};
/** IK3_SUIT: a suit has four sockets, its rows 5-10 tinted (OnDraw :22142-22156). */
const IK3_SUIT = 18;

/** CWndRemovePiercing: a pierced suit, shield or weapon; START removes its last card, and the window closes. */
export class RemovePiercingWindow extends NpcWindow {
  private item: number | null = null;

  constructor(host: NpcWindowHost, private readonly cards: () => ReadonlyMap<number, WebPiercingAvail['params']>) {
    super(host);
  }

  protected layout(): ResLayout { return REMOVE_PIERCING; }
  protected className(): string { return 'hud-remove-piercing'; }

  get state(): { item: number | null } {
    return { item: this.item };
  }

  /** OnInitialUpdate (:22206-22235): the description, the slot's and rows' hover texts. */
  protected opening(window: ResWindow): void {
    setDescription(window, 'WIDC_TEXT1', this.host.ui.doc, this.host.ultimate()?.descriptions.removePiercing);
    slotBox(window, 'WIDC_PIC_SLOT').title = this.host.text('TID_GAME_TOOLTIP_PIERCINGITEM');
    ROWS.forEach((id, i) => {
      slotBox(window, id).title = `This is the ${ORDINALS[i]} applied card. The bottom Card will be removed first!`;
    });
  }

  /** The bag's double-click (:2165-2188): a suit or weapon not held goes to `SetItem`; others are used. */
  take(objectId: number): BagPress {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || !isEleRefinable(prop) || this.host.reserved(objectId) > 0) return 'pass';
    this.setItem(objectId);
    return 'taken';
  }

  /** `SetItem` (:22334-22363) and the drop (:22296-22332): an empty slot takes a pierceable item with a card. */
  setItem(objectId: number): void {
    const prop = propOf(this.host, objectId), item = this.host.own()?.inventory?.get(objectId);
    if (this.item !== null || prop === undefined || item === undefined) return;
    if (!isPierceAble(prop, 0, false) || (item.piercing?.[0] ?? 0) === 0) {
      this.host.say('TID_GAME_REMOVE_PIERCING_ERROR_EX');
      return;
    }
    this.item = objectId;
    this.host.reserve(objectId, true);
    this.draw();
  }

  /** START (:22365-22381): PIERCINGREMOVE, and the window closes at once. */
  start(): void {
    if (this.item === null) return;
    this.host.send({ type: 'piercingRemove', itemId: this.item });
    this.close();
  }

  protected wire(window: ResWindow): void {
    const box = slotBox(window, 'WIDC_PIC_SLOT');
    box.dataset.slot = '0';
    takeDrops(box, (objectId) => { if (this.host.reserved(objectId) === 0) this.setItem(objectId); });
    onSlotPress(this.host, box, () => { this.letGo(); this.draw(); }); // :22261-22279
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    this.letGo();
  }

  /** OnDraw (:22127-22204): the item, a suit's unused rows red, each socket's card's stats in black. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const box = slotBox(window, 'WIDC_PIC_SLOT');
    const prop = propOf(this.host, this.item);
    drawSlotIcon(this.host, box, prop);
    box.toggleAttribute('data-filled', this.item !== null);
    const sockets = this.item === null ? [] : this.host.own()?.inventory?.get(this.item)?.piercing ?? [];
    const suit = prop?.kind3 === IK3_SUIT;
    const max = suit ? 4 : 10;
    ROWS.forEach((id, i) => {
      slotBox(window, id).toggleAttribute('data-unused', prop !== undefined && suit && i >= 4);
      window.setText(id, prop !== undefined && sockets.length <= max && i < sockets.length ? this.cardText(sockets[i]!) : '');
    });
    window.button('WIDC_START').disabled = this.item === null;
  }

  /** A card's stats as Neuz prints them: "name+N  " or "name+N%  " (attack speed /20). */
  private cardText(card: number): string {
    let out = '';
    for (const { dst, adj } of this.cards().get(card) ?? []) {
      const name = this.host.text(dstTid(dst) ?? '');
      if (isDstRate(dst)) {
        const value = rateValue(dst, adj);
        out += `${name}${value >= 0 ? '+' : ''}${value}%  `;
      } else out += `${name}+${adj}  `;
    }
    return out;
  }

  private letGo(): void {
    if (this.item !== null) this.host.reserve(this.item, false);
    this.item = null;
  }
}
