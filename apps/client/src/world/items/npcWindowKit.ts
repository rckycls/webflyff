// What the item NPC windows share (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md): Peach's and
// the Upgrade Specialist's remaining windows, the Repair window and the GM's ResistItem window. Each is a resdata.inc window
// (`ResWindow`) whose slots take bag items: on the desktop by a drop (the bag's drag) and, where Neuz routes it, the bag's
// double-click (`CWndInventory::OnChildNotify`, WndField.cpp:2140-2600); on a phone, which has no drag, by a tap on the bag
// item. The bag holds what a slot holds (`SetExtra`, the web's `reserve`).
//
// The phone: each window is a panel at the left beside the bag, as the jewel windows (style.css `.hud-jewel`), its slots 44
// px, its words 14 px, its buttons words a finger can hit.

import type { WebItemProp, WebUltimate } from '@flyffweb/formats';
import type { UiArt } from '../hud/art';
import { themeUrl } from '../hud/art';
import { parseDialogText } from '../hud/dialogue/dialogText';
import { ResWindow } from '../hud/resWindow';
import type { ResLayout } from '../hud/resWindow';
import type { OwnState } from '../OwnState';

/** What a window sends. */
export type NpcWindowPacket =
  | { type: 'makeItem'; itemIds: number[] }
  | { type: 'transWeapon'; weaponId: number; gem1Id: number; gem2Id: number }
  | { type: 'removeGem'; weaponId: number; gemId: number }
  | { type: 'piercingRemove'; itemId: number }
  | { type: 'removeAttribute'; itemId: number }
  | { type: 'repair'; objectIds: number[] }
  | { type: 'chat'; text: string };

export interface NpcWindowHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** data/ultimate.json: the jewel by level, the jewels' stats and the windows' descriptions. */
  ultimate(): WebUltimate | undefined;
  /** A TID's text ('' when unknown). */
  text(tid: string): string;
  /** g_WndMng.OpenMessageBox: an OK box. */
  alert(text: string): void;
  /** A chat line in the TID's colour (`PutString`); `color` another TID's colour. */
  say(tid: string, color?: string): void;
  /** The bag holds a piece of `objectId` (`SetExtra( +1 )`) or lets it go; the pieces held. */
  reserve(objectId: number, on: boolean): void;
  reserved(objectId: number): number;
  /** The bag's "die flag" (`SetDieFlag`): a stack held in part still drawn and used. */
  dieFlag(on: boolean): void;
  send(packet: NpcWindowPacket): void;
  /** A phone (the bag's taps put items in, the window a panel beside the bag). */
  mobile(): boolean;
  bagOpen(): boolean;
  openBag(): void;
  closeBag(): void;
  /** The bag window's place in the layer, for the windows that stand beside it; null when it is closed. */
  bagRect(): { x: number; y: number; width: number } | null;
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** What the bag's double-click on an item does while a window is open: in, refused (TID_SBEVE_NOTUSEITEM), or its own use. */
export type BagPress = 'taken' | 'refused' | 'pass';

/** The pieces of a bag stack not held by a window. */
export const freeOf = (host: NpcWindowHost, objectId: number): number =>
  (host.own()?.inventory?.get(objectId)?.count ?? 0) - host.reserved(objectId);

export const propOf = (host: NpcWindowHost, objectId: number | null): WebItemProp | undefined => {
  const item = objectId === null ? undefined : host.own()?.inventory?.get(objectId);
  return item && host.props.get(item.itemId);
};

/** An item's icon drawn in `box` at its top left (32 x 32) at `alpha`, or the box emptied of one. */
export function drawSlotIcon(host: NpcWindowHost, box: HTMLElement, prop: WebItemProp | null | undefined, alpha = 1): void {
  box.querySelector('.hud-res-slot')?.remove();
  if (!prop?.icon) return;
  const doc = host.ui.doc;
  const holder = doc.createElement('div');
  holder.className = 'hud-res-slot';
  if (alpha < 1) holder.style.opacity = String(alpha);
  const icon = doc.createElement('img');
  icon.src = host.ui.art.url(prop.icon);
  icon.alt = prop.name;
  icon.draggable = false;
  holder.append(icon);
  box.append(holder);
}

/** A slot takes a bag item dropped on it (the bag's drag, `application/x-flyff-inventory`), with Shift held or not. */
export function takeDrops(box: HTMLElement, take: (objectId: number, shift: boolean) => void): void {
  box.ondragover = (event) => {
    if (event.dataTransfer?.types.includes('application/x-flyff-inventory') === true) event.preventDefault();
  };
  box.ondrop = (event) => {
    const id = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
    if (!Number.isFinite(id)) return;
    event.preventDefault();
    take(id, event.shiftKey);
  };
}

/** A slot's press that takes its item out: a double-click on the desktop (`OnLButtonDblClk`), a tap on a phone. */
export function onSlotPress(host: NpcWindowHost, box: HTMLElement, press: () => void): void {
  box.addEventListener('dblclick', (event) => { event.preventDefault(); if (!host.mobile()) press(); });
  box.addEventListener('click', () => { if (host.mobile()) press(); });
}

/** A description (`SetDescription`, `AddParsingString`): its #b #c codes as spans. */
export function setDescription(window: ResWindow, id: string, doc: Document, text: string | undefined): void {
  const nodes = parseDialogText((text ?? '').replace(/\r\n/g, '\n')).map((run) => {
    const span = doc.createElement('span');
    span.textContent = run.text;
    span.style.color = `#${(run.color & 0xffffff).toString(16).padStart(6, '0')}`;
    if (run.bold) span.style.fontWeight = 'bold';
    return span;
  });
  window.setContent(id, ...nodes);
}

/** A slot's box (the static's or the custom's element that holds its picture). */
export function slotBox(window: ResWindow, id: string): HTMLElement {
  const control = window.control(id);
  return control.hasAttribute('data-control') ? control : control.parentElement!;
}

/** `IsEleRefineryAble` (_Common/Item.cpp:374-385): a suit or a weapon. */
export const isEleRefinable = (prop: WebItemProp): boolean => prop.kind3 === 18 || prop.kind2 === 2 || prop.kind2 === 3;

/**
 * A window of these: made once and kept, opened centred (or beside the bag), refused with its TID while open, closed when
 * the player moves and (most) when the bag closes. On a phone the bag opens with it and closes with it when it opened it.
 */
export abstract class NpcWindow {
  protected window: ResWindow | null = null;
  private openedBag = false;

  constructor(protected readonly host: NpcWindowHost) {}

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  /** The NPC's entry: refused while open (a red line), else the window. */
  open(): boolean {
    if (this.isOpen) {
      this.host.say(this.overlapTid());
      return false;
    }
    const window = this.make();
    this.reset();
    this.opening(window);
    this.draw();
    const bagWasOpen = this.host.bagOpen();
    if ((this.opensBag() || this.host.mobile()) && !bagWasOpen) {
      this.host.openBag();
      this.openedBag = this.host.mobile();
    }
    window.open(this.placement(window));
    return true;
  }

  close(): void {
    this.window?.close();
  }

  /** The player moved (`CWndWorld::Process`, WndWorld.cpp:8052-8496): the window closes. */
  dismiss(): void {
    this.close();
  }

  /** The bag closed (`CWndInventory::OnDestroy`, WndField.cpp:1015-1075): the windows it closes. */
  bagClosed(): void {
    if (this.closesWithBag()) this.close();
  }

  /** The bag's double-click on an item while open. */
  abstract take(objectId: number, shift: boolean): BagPress;

  /** A phone's tap on a bag item: where a drop would put it. */
  tapItem(objectId: number): BagPress {
    return this.take(objectId, false);
  }

  protected abstract layout(): ResLayout;
  protected abstract className(): string;
  protected abstract wire(window: ResWindow): void;
  /** OnDestroy: every held item let go. */
  protected abstract reset(): void;
  protected abstract draw(): void;
  /** OnInitialUpdate's own work (a title, a description). */
  protected opening(_window: ResWindow): void {}
  protected overlapTid(): string { return 'TID_GAME_WND_OVERLAPED'; }
  /** Neuz opens the bag with it (`CreateApplet( APP_INVENTORY )`). */
  protected opensBag(): boolean { return false; }
  protected closesWithBag(): boolean { return true; }
  /** Where it opens: centred (`MoveParentCenter`) unless it stands beside the bag. */
  protected placement(_window: ResWindow): { x: number; y: number } | 'center' { return 'center'; }

  /** Beside the bag (`OnInitialUpdate` of APP_REPAIR and APP_TEST): at its left when the bag is in the right half, else its right. */
  protected besideBag(window: ResWindow): { x: number; y: number } | 'center' {
    const bag = this.host.bagRect(), layer = this.host.ui.layer();
    if (bag === null || layer === null || this.host.mobile()) return 'center';
    const width = window.layout.width;
    const x = bag.x + bag.width / 2 > layer.clientWidth / 2 ? bag.x - width : bag.x + bag.width;
    return { x: Math.max(0, x), y: Math.max(0, bag.y) };
  }

  private make(): ResWindow {
    if (this.window !== null) {
      this.attach(this.window);
      return this.window;
    }
    const window = new ResWindow(this.layout(), this.host.ui.art, this.host.ui.doc);
    window.frame.element.classList.add('hud-jewel', 'hud-npc-item', this.className());
    window.onClose = () => this.closed();
    this.wire(window);
    this.window = window;
    this.attach(window);
    return window;
  }

  private closed(): void {
    this.reset();
    this.closing();
    if (this.openedBag) {
      this.openedBag = false;
      this.host.closeBag();
    }
  }

  /** OnDestroy's own work beyond letting the items go. */
  protected closing(): void {}

  private attach(window: ResWindow): void {
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
  }
}

/** A theme picture as a box's background (a ghost behind an empty slot, `Window02.bmp` under a row). */
export const themePicture = (art: UiArt, file: string): string => themeUrl(art, file);
