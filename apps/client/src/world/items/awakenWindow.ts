// custom (owner 2026-11-19): the Awaken window (docs/superpowers/specs/2026-11-19-awaken-window-design.md). V15 has none:
// the owner asked for "something like the piercing window" with the item, a Scroll of Awakening and a Scroll of Reversion,
// Awaken and Cancel, 50,000 Penya a press. A not-awakened item takes the Scroll of Awakening; an awakened one the Reversion
// as well, and its awakening is replaced. The World server's patch (outer repo, patches/2026-11-19-awaken-window.patch,
// `CDPSrvr::OnAwakenWindow`) checks it all again and takes the scrolls and the Penya; its answer is V15's own updates.
//
// It opens from the Start menu (no NPC). Items go in by a drop from the bag, or a double-click (a phone's tap) on a bag item
// while it is open, as in Piercing; the bag holds them. The window stays open after a press so the item can be rolled
// again; the split panel (owner) shows the item's current awakening. Each press asks Yes/No first (owner), with a
// "Don't ask again" check box, unchecked on every opening.

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { themeUrl } from '../hud/art';
import { textButton } from '../hud/numpad';
import { radioFrame } from '../hud/radio';
import { ResWindow } from '../hud/resWindow';
import type { OwnState } from '../OwnState';
import { AWAKEN, AWAKEN_CONFIRM } from './itemWindowLayouts';
import { awakeningLines, isAwakenable, isAwakened } from './itemTooltip';
import type { TooltipData } from './itemTooltip';
import { slotTooltip } from './npcWindowKit';
import { drawIcon, takeDrops } from './upgradeNpcWindows';

/** The Penya one press costs (the owner's 50,000; the World patch's `nCost`). */
export const AWAKEN_COST = 50000;
/** `II_SYS_SYS_SCR_AWAKE`, the Scroll of Awakening. */
export const AWAKEN_SCROLL = 26461;
/** `II_SYS_SYS_SCR_AWAKECANCEL` and `II_SYS_SYS_SCR_AWAKECANCEL02`, the Scroll of Reversion and its Event one. */
export const REVERSION_SCROLLS: ReadonlySet<number> = new Set([26462, 26563]);
const NULL_ID = 0xffffffff;
/** A press waits for its answer (the item's new awakening) this long at most before Awaken works again. */
const LOCK_MS = 2000;
/** The three slots: the item, the Scroll of Awakening, the Scroll of Reversion. */
const SLOT_IDS = ['WIDC_STATIC5', 'WIDC_STATIC6', 'WIDC_STATIC7'] as const;
const ASK_AWAKEN = 'Awaken this item? It uses 1 Scroll of Awakening and 50,000 Penya.';
const ASK_REPLACE =
  "Replace this item's awakening? It uses 1 Scroll of Reversion, 1 Scroll of Awakening and 50,000 Penya. The current awakening is lost.";
const NO_ITEM = 'Put an item to awaken in the window.';
const NO_SCROLL = 'Put a Scroll of Awakening in the window.';
const NOT_AWAKENED = 'Not awakened';
const DONT_ASK = "Don't ask again";

export interface AwakenHost {
  own(): OwnState | undefined;
  /** A slot's item tooltip (`slotTooltip`, npcWindowKit.ts). */
  tooltip?(item: InventoryItem | null, anchor: HTMLElement | null, within: HTMLElement | null): void;
  props: ReadonlyMap<number, WebItemProp>;
  /** The client texts, for the awakening's words (the tooltip's). */
  texts: TooltipData['texts'];
  /** A V15 line in its TID's colour. */
  say(tid: string): void;
  /** One of the window's own lines (no TID has these words). */
  sayText(text: string): void;
  /** The bag holds a piece of `objectId` (`SetExtra( +1 )`) or lets one go. */
  reserve(objectId: number, on: boolean): void;
  reserved(objectId: number): number;
  openBag(): void;
  sendAwaken(itemId: number, awakeId: number, reversionId: number): void;
  now(): number;
  /** A phone, where a tap on a slot takes its item out (the desktop's right click). */
  mobile?(): boolean;
  bagOpen?(): boolean;
  closeBag?(): void;
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

export class AwakenWindow {
  private window: ResWindow | null = null;
  private confirm: ResWindow | null = null;
  /** The item, the Scroll of Awakening, the Scroll of Reversion (bag object ids). */
  private readonly slots: Array<number | null> = [null, null, null];
  /** A phone's bag this window opened, closed again with it (as Piercing's). */
  private openedBag = false;
  /** "Don't ask again" ticked with a Yes: until the window closes. */
  private dontAsk = false;
  /** The box's check box. */
  private checked = false;
  /** A press sent: Awaken waits until the item's awakening differs from `before`, or `until`. */
  private lock: { before: bigint; until: number } | null = null;
  /** What `draw` last drew from: the bag's revision, the item's awakening and the lock. */
  private drawn = '';
  private awakenButton: HTMLButtonElement | null = null;
  private linesBox: HTMLElement | null = null;
  private checkBox: HTMLButtonElement | null = null;

  constructor(private readonly host: AwakenHost) {}

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  open(): void {
    if (this.isOpen) return;
    const window = this.make();
    this.openedBag = this.host.mobile?.() === true && this.host.bagOpen?.() === false;
    this.host.openBag();
    this.dontAsk = false;
    this.lock = null;
    this.draw();
    window.open();
  }

  close(): void {
    this.window?.close();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** The bag closed: the window goes with it (as Piercing). */
  dismiss(): void {
    this.close();
  }

  /** A bag item double-clicked (a phone's tap) while open: into the slot of its kind. */
  take(objectId: number): void {
    const prop = this.propOf(objectId);
    if (prop === undefined) return;
    if (prop.id === AWAKEN_SCROLL) this.takeAt(1, objectId);
    else if (REVERSION_SCROLLS.has(prop.id)) this.takeAt(2, objectId);
    else this.takeAt(0, objectId);
  }

  /** The rules of slot `slot`: the item an awakening kind and not worn; the scrolls after it, each its own kind. */
  takeAt(slot: 0 | 1 | 2, objectId: number): void {
    const own = this.host.own(), item = own?.inventory?.get(objectId), prop = this.propOf(objectId);
    if (!own || !item || !prop || this.host.reserved(objectId) > 0) return;
    if (slot === 0) {
      if (own.equipmentObjectIds.includes(objectId)) {
        this.host.say('TID_GAME_EQUIPPUT');
        return;
      }
      if (!isAwakenable(prop)) {
        this.host.say('TID_GAME_INVALID_TARGET_ITEM');
        return;
      }
      for (let i = 0; i < 3; i++) this.set(i, null);
      this.set(0, objectId);
    } else {
      if (this.slots[0] === null) return;
      if (!this.fits(slot, prop)) {
        this.host.say('TID_SBEVE_NOTUSEITEM');
        return;
      }
      this.set(slot, objectId);
    }
    this.draw();
  }

  /**
   * Each frame while open: a slot whose bag item went (a used-up stack) or changed is emptied, the lock ends when the item's
   * awakening changed (the answer) or its time ran out, and the window is drawn again when any of that moved.
   */
  update(): void {
    if (!this.isOpen) return;
    const option = this.itemOf(0)?.randomOption ?? 0n;
    if (this.lock !== null && (option !== this.lock.before || this.host.now() >= this.lock.until)) this.lock = null;
    if (this.key() === this.drawn) return;
    for (let slot = 0; slot < 3; slot++) {
      const id = this.slots[slot];
      if (id === null || id === undefined) continue;
      const prop = this.propOf(id);
      if (prop !== undefined && (slot === 0 ? isAwakenable(prop) : this.fits(slot, prop))) continue;
      if (slot === 0) for (let i = 0; i < 3; i++) this.set(i, null);
      else this.set(slot, null);
    }
    this.draw();
  }

  /** Awaken pressed (or Yes in its box, `confirmed`): the pieces checked, then the box or the packet. */
  private press(confirmed = false): void {
    if (this.lock !== null) return;
    const item = this.itemOf(0);
    if (item === undefined) {
      this.host.sayText(NO_ITEM);
      return;
    }
    if (this.slots[1] === null) {
      this.host.sayText(NO_SCROLL);
      return;
    }
    const awakened = isAwakened(item.randomOption);
    if (awakened && this.slots[2] === null) {
      this.host.say('TID_GAME_AWAKE_OR_BLESSEDNESS01');
      return;
    }
    if ((this.host.own()?.gold ?? 0) < AWAKEN_COST) {
      this.host.say('TID_GAME_LACKMONEY');
      return;
    }
    if (!confirmed && !this.dontAsk) {
      this.ask(awakened);
      return;
    }
    this.host.sendAwaken(this.slots[0]!, this.slots[1]!, awakened ? this.slots[2]! : NULL_ID);
    this.lock = { before: item.randomOption ?? 0n, until: this.host.now() + LOCK_MS };
    this.draw();
  }

  private ask(awakened: boolean): void {
    const box = this.makeConfirm();
    box.setText('WIDC_TEXT1', awakened ? ASK_REPLACE : ASK_AWAKEN);
    this.checked = false;
    this.drawCheck();
    box.open();
  }

  private make(): ResWindow {
    if (this.window !== null) {
      this.attach(this.window.element);
      return this.window;
    }
    const doc = this.host.ui.doc;
    const window = new ResWindow(AWAKEN, this.host.ui.art, doc);
    // `hud-jewel`: a phone shows it as the jewel windows' panel beside the bag (style.css)
    window.frame.element.classList.add('hud-awaken', 'hud-jewel');
    SLOT_IDS.forEach((id, slot) => {
      const box = window.control(id).parentElement!;
      box.dataset.slot = String(slot);
      takeDrops(box, (objectId) => this.takeAt(slot as 0 | 1 | 2, objectId));
      // a right click empties the slot; on the item's, all three; a phone's tap the same
      const empty = (): void => {
        if (slot === 0) for (let i = 0; i < 3; i++) this.set(i, null);
        else this.set(slot, null);
        this.draw();
      };
      box.oncontextmenu = (event) => {
        event.preventDefault();
        empty();
      };
      box.onclick = () => { if (this.host.mobile?.() === true) empty(); };
    });
    const button = textButton(doc, 'Awaken', () => this.press(), 'awaken', 'awaken');
    button.classList.add('auto-word');
    window.control('WIDC_AWAKEN').append(button);
    this.awakenButton = button;
    const lines = doc.createElement('div');
    lines.className = 'hud-awaken-lines';
    window.control('WIDC_LINES').append(lines);
    this.linesBox = lines;
    window.button('WIDC_CANCEL').onclick = () => window.close();
    window.onClose = () => {
      for (let i = 0; i < 3; i++) this.set(i, null);
      this.confirm?.close();
      this.lock = null;
      this.drawn = '';
      if (this.openedBag) {
        this.openedBag = false;
        this.host.closeBag?.();
      }
    };
    this.window = window;
    this.attach(window.element);
    return window;
  }

  /** The Yes/No box: its words, "Don't ask again" (V15's check box, ButtCheck.bmp), Yes and No. */
  private makeConfirm(): ResWindow {
    if (this.confirm !== null) {
      this.attach(this.confirm.element);
      return this.confirm;
    }
    const doc = this.host.ui.doc;
    const box = new ResWindow(AWAKEN_CONFIRM, this.host.ui.art, doc);
    box.frame.element.classList.add('hud-awaken-confirm');
    const check = doc.createElement('button');
    check.type = 'button';
    check.className = 'auto-check';
    check.setAttribute('role', 'checkbox');
    check.addEventListener('mousedown', (event) => event.preventDefault());
    const mark = doc.createElement('span');
    mark.className = 'auto-v15-check';
    mark.style.backgroundImage = themeUrl(this.host.ui.art, 'ButtCheck.bmp');
    const label = doc.createElement('span');
    label.className = 'auto-check-label';
    label.textContent = DONT_ASK;
    check.append(mark, label);
    check.addEventListener('click', () => {
      this.checked = !this.checked;
      this.drawCheck();
    });
    box.control('WIDC_CHECK').append(check);
    this.checkBox = check;
    box.button('WIDC_YES').onclick = () => {
      this.dontAsk = this.checked;
      box.close();
      this.press(true);
    };
    box.button('WIDC_NO').onclick = () => box.close();
    this.confirm = box;
    this.attach(box.element);
    return box;
  }

  private drawCheck(): void {
    const check = this.checkBox;
    if (check === null) return;
    check.setAttribute('aria-checked', String(this.checked));
    const mark = check.querySelector<HTMLElement>('.auto-v15-check');
    if (mark !== null) mark.dataset.frame = String(radioFrame({ checked: this.checked, disabled: false, highlighted: false, pressed: false }));
  }

  private attach(element: HTMLElement): void {
    const layer = this.host.ui.layer();
    if (layer !== null && element.parentElement !== layer) layer.append(element);
  }

  private set(slot: number, objectId: number | null): void {
    const old = this.slots[slot];
    if (old !== null && old !== undefined) this.host.reserve(old, false);
    this.slots[slot] = objectId;
    if (objectId !== null) this.host.reserve(objectId, true);
  }

  private fits(slot: number, prop: WebItemProp): boolean {
    return slot === 1 ? prop.id === AWAKEN_SCROLL : REVERSION_SCROLLS.has(prop.id);
  }

  private itemOf(slot: number): InventoryItem | undefined {
    const id = this.slots[slot];
    return id === null || id === undefined ? undefined : this.host.own()?.inventory?.get(id);
  }

  private propOf(objectId: number | null): WebItemProp | undefined {
    const item = objectId === null ? undefined : this.host.own()?.inventory?.get(objectId);
    return item && this.host.props.get(item.itemId);
  }

  private key(): string {
    return `${this.host.own()?.inventoryRevision ?? -1}:${this.itemOf(0)?.randomOption ?? 0n}:${this.lock === null}`;
  }

  /** The slots' icons and tooltips, the cost (50,000 with an item in, else 0), the awakening's lines, Awaken's lock. */
  private draw(): void {
    const window = this.window;
    if (window === null) return;
    SLOT_IDS.forEach((id, slot) => {
      const box = window.control(id).parentElement!;
      drawIcon(this.host, box, this.propOf(this.slots[slot] ?? null));
      slotTooltip(this.host, box, this.slots[slot] ?? null);
      box.toggleAttribute('data-filled', this.slots[slot] !== null);
    });
    window.setText('WIDC_STATIC9', this.slots[0] === null ? '0' : AWAKEN_COST.toLocaleString('en-US'));
    const item = this.itemOf(0);
    const lines = item === undefined ? [] : awakeningLines(item.randomOption, this.host.texts);
    const doc = this.host.ui.doc;
    this.linesBox?.replaceChildren(...(item === undefined ? [] : lines.length > 0 ? lines : [NOT_AWAKENED]).map((text) => {
      const row = doc.createElement('div');
      row.className = lines.length > 0 ? 'hud-awaken-line' : 'hud-awaken-line is-empty';
      row.textContent = text;
      return row;
    }));
    if (this.awakenButton !== null) this.awakenButton.disabled = this.lock !== null;
    this.drawn = this.key();
  }
}
