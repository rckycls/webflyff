// The Summon Angel window (2026-11-10, docs/superpowers/specs/2026-11-10-summon-angel-research.md §2-§4): APP_SUMMON_ANGEL,
// "Angel Window", which the Priest of Confession's "Summon Angel" opens beside the bag.
//
//   Function                            File:lines                               what
//   CWndWorld::OnCommand MMI_SUMMON_ANGEL _Interface/WndWorld.cpp:4783-4872      the refusals, the bag, the window, its text
//   CWndSummonAngel::OnInitialUpdate   _Interface/WndSummonAngel.cpp:124-190    the texts, the slots, the die flag, beside
//                                                                               the bag
//   CWndSummonAngel::OnDraw            WndSummonAngel.cpp:58-122                the two stones' icons, the slot under a
//                                                                               carried item, the slots' icons, the "%"s
//   CWndSummonAngel::OnDropIcon        WndSummonAngel.cpp:250-292               a stone on a slot (angelRules.AngelSlots)
//   CWndSummonAngel::OnLButtonDblClk   WndSummonAngel.cpp:229-244               a slot's piece out
//   CWndSummonAngel::OnChildNotify     WndSummonAngel.cpp:425-485               RESET, START (3 stones at least), CANCEL
//   CWndSummonAngel::OnDestroy         WndSummonAngel.cpp:39-51                 the pieces let go, the die flag off
//   CWndInventory::OnChildNotify       _Interface/WndField.cpp:2146-2160        the bag's double-click puts a stone in
//
// The server answers START with the bag's changes alone (the stones gone, the angel item come): no result, no text.
// A phone, which has no drag, taps a bag item in where the double-click would put it, and taps a slot to take it out.

import type { WebItemProp } from '@flyffweb/formats';
import { createAngelText } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { parseDialogText } from '../hud/dialogue/dialogText';
import { ResWindow } from '../hud/resWindow';
import type { ResLayout } from '../hud/resWindow';
import type { OwnState } from '../OwnState';
import { AngelSlots, MAX_SLOTS, rateText, stoneRow, summonRates } from './angelRules';

/** `II_GEN_MAT_ORICHALCUM01` and `II_GEN_MAT_MOONSTONE`: the icons OnDraw draws at (30, 218) and (30, 306). */
const SUNSTONE = 2035;
const MOONSTONE = 2036;
const EDIT = 'WndEditTile00.tga';
const SLOT = 'WndChgElemItem.bmp';
/** WIDC_STATIC11..30: the slots' controls, 0-9 the Sunstone rows (y 198, 236), 10-19 the Moonstone rows (y 286, 324). */
const SLOT_IDS = Array.from({ length: MAX_SLOTS }, (_, i) => `WIDC_STATIC${11 + i}`);
const SLOT_X = [78, 116, 154, 192, 230];
const SLOT_Y = [198, 236, 286, 324];

/** APP_SUMMON_ANGEL (`Resource/resdata.inc:4628-4945`), its texts set again by OnInitialUpdate (:151-164). */
export function summonAngelLayout(text: (tid: string) => string): ResLayout {
  return {
    title: 'Angel Window', width: 464, height: 464,
    controls: [
      { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 8, 444, 182], tile: EDIT, scroll: true },
      // WIDC_STATIC2: a plain static of tiled WndEditTile00, the rates' box
      { kind: 'custom', id: 'WIDC_STATIC2', rect: [286, 188, 442, 366], tile: EDIT },
      ...SLOT_IDS.map((id, i) => {
        const x = SLOT_X[i % 5]!, y = SLOT_Y[Math.trunc(i / 5)]!;
        return { kind: 'static' as const, id, rect: [x, y, x + 32, y + 32] as const, picture: SLOT };
      }),
      { kind: 'static', id: 'WIDC_STATIC3', rect: [298, 204, 430, 220], text: text('TID_GAME_REDANGEL_RATE') },
      { kind: 'static', id: 'WIDC_STATIC4', rect: [298, 228, 430, 244], text: text('TID_GAME_BLUEANGEL_RATE') },
      { kind: 'static', id: 'WIDC_STATIC5', rect: [298, 252, 430, 268], text: text('TID_GAME_GREENANGEL_RATE') },
      { kind: 'static', id: 'WIDC_STATIC_RED', rect: [380, 204, 412, 220] },
      { kind: 'static', id: 'WIDC_STATIC_BLUE', rect: [380, 228, 412, 244] },
      { kind: 'static', id: 'WIDC_STATIC_GREEN', rect: [380, 252, 412, 268] },
      { kind: 'static', id: 'WIDC_STATIC6', rect: [298, 302, 423, 318], text: text('TID_GAME_WHITEANGEL_INFO1') },
      { kind: 'static', id: 'WIDC_STATIC1', rect: [298, 322, 423, 338], text: text('TID_GAME_WHITEANGEL_INFO2') },
      { kind: 'static', id: 'WIDC_STATIC7', rect: [298, 340, 423, 356], text: text('TID_GAME_WHITEANGEL_INFO3') },
      { kind: 'button', id: 'WIDC_RESET', rect: [28, 388, 100, 408], picture: 'reset.bmp', label: 'Reset', quarter: 72 },
      { kind: 'button', id: 'WIDC_CANCEL', rect: [266, 388, 338, 408], picture: 'ButCancel2.bmp', label: 'Cancel', quarter: 72 },
      { kind: 'button', id: 'WIDC_START', rect: [358, 388, 430, 408], picture: 'ButtVoteStart.BMP', label: 'Start', quarter: 72 },
    ],
  };
}

export interface SummonAngelHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** A text by its TID. */
  text(tid: string): string;
  /** `summonAngelQuest.inc` (data/ultimate.json's `descriptions.summonAngel`), or undefined. */
  questText(): string | undefined;
  /** g_WndMng.OpenMessageBox: an OK box with `text`. */
  alert(text: string): void;
  /** The bag holds a piece of `objectId` (`SetExtra( +1 )`) or lets it go. */
  reserve(objectId: number, on: boolean): void;
  reserved(objectId: number): number;
  /** `m_wndItemCtrl.SetDieFlag`: a held stack shows its count less what is held. */
  dieFlag(on: boolean): void;
  sendCreateAngel(text: string): void;
  /** The bag (`CreateApplet( APP_INVENTORY )`), its place in the layer for the window's, and its close. */
  openBag(): void;
  closeBag(): void;
  bagRect(): { x: number; y: number; width: number } | null;
  /** A phone: a tap puts a bag item in, a tap on a filled slot takes it out. */
  mobile(): boolean;
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** The window's text (`SetQuestText`, `AddParsingString`): its #b #c codes as spans. */
function questNodes(doc: Document, text: string | undefined): Node[] {
  return parseDialogText((text ?? '').replace(/\r\n/g, '\n')).map((run) => {
    const span = doc.createElement('span');
    span.textContent = run.text;
    span.style.color = `#${(run.color & 0xffffff).toString(16).padStart(6, '0')}`;
    if (run.bold) span.style.fontWeight = 'bold';
    return span;
  });
}

export class SummonAngelWindow {
  private window: ResWindow | null = null;
  private readonly slots = new AngelSlots();
  /** `m_nowStarting`: START sent, until the window lets everything go (at once, `ReFreshAll( TRUE )`). */
  private starting = false;

  constructor(private readonly host: SummonAngelHost) {}

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  /** The object in each slot, for the tests. */
  get slotIds(): ReadonlyArray<number | null> {
    return this.slots.all;
  }

  /**
   * MMI_SUMMON_ANGEL after its refusals (WndWorld.cpp:4855-4870): the bag opens, then the window, beside it: at its left
   * when the bag's left edge is past half the window's width, else at its right (OnInitialUpdate, :171-189).
   */
  open(): void {
    const window = this.make();
    this.reset();
    this.starting = false;
    this.host.openBag();
    this.host.dieFlag(true);
    this.draw();
    const bag = this.host.bagRect();
    const width = window.layout.width;
    window.open(bag === null || this.host.mobile() ? 'center'
      : { x: bag.x > width / 2 ? bag.x - width : bag.x + bag.width, y: bag.y });
  }

  close(): void {
    this.window?.close();
  }

  /** The player moved (`CWndWorld::Process`, WndWorld.cpp:8154-8165): the window closes, and the bag with it. */
  dismiss(): void {
    if (!this.isOpen) return;
    this.close();
    this.host.closeBag();
  }

  /** The bag closed (`CWndInventory::OnDestroy`, WndField.cpp:1022-1026): the window closes. */
  bagClosed(): void {
    this.close();
  }

  /**
   * The bag's double-click while open (WndField.cpp:2146-2160): a stone with a free piece goes to the first empty slot of
   * its row (none when the row is full) and true; false for anything else, which the bag refuses as a use
   * (TID_GAME_TRADELIMITUSING, :2548-2552).
   */
  take(objectId: number): boolean {
    const item = this.host.own()?.inventory?.get(objectId);
    if (item === undefined || this.free(objectId) <= 0 || !this.isStone(item.itemId)) return false;
    if (this.slots.fromBag({ objectId, itemId: item.itemId }) !== null) this.host.reserve(objectId, true);
    this.draw();
    return true;
  }

  /** A phone's tap on a bag item: as the double-click. */
  tapItem(objectId: number): boolean {
    return this.take(objectId);
  }

  /**
   * `OnDropIcon` on slot `slot` (`m_nSelecCtrl`): see `AngelSlots.drop`. A stack whose pieces are all in already says
   * TID_GAME_SUMMONANGEL_ERROR1 ("Too many Gems.") in a box.
   */
  drop(slot: number, objectId: number, shift: boolean): void {
    const item = this.host.own()?.inventory?.get(objectId);
    if (item === undefined) return;
    const { result, put } = this.slots.drop(slot, { objectId, itemId: item.itemId }, this.free(objectId), shift);
    if (result === 'overflow') this.host.alert(this.host.text('TID_GAME_SUMMONANGEL_ERROR1'));
    for (let i = 0; i < put.length; i++) this.host.reserve(objectId, true);
    this.draw();
  }

  /** A slot's double-click (a phone's tap): its piece out. */
  removeAt(slot: number): void {
    const id = this.slots.remove(slot);
    if (id === null) return;
    this.host.reserve(id, false);
    this.draw();
  }

  /** RESET (`ReFreshAll( TRUE )`): every piece let go. */
  resetAll(): void {
    this.reset();
    this.starting = false;
    this.draw();
  }

  /**
   * START: fewer than 3 stones says TID_GAME_SUMMONANGEL_ERROR2 in a box; else, once, CREATEANGEL with each stack's
   * object id and count, then everything let go (:429-479).
   */
  start(): void {
    if (this.slots.counts().total < 3) {
      this.host.alert(this.host.text('TID_GAME_SUMMONANGEL_ERROR2'));
      return;
    }
    if (this.starting) return;
    this.starting = true;
    const stacks = this.slots.stacks().filter(({ objectId }) => this.host.reserved(objectId) > 0);
    this.host.sendCreateAngel(createAngelText(stacks));
    this.resetAll();
  }

  private free(objectId: number): number {
    return (this.host.own()?.inventory?.get(objectId)?.count ?? 0) - this.host.reserved(objectId);
  }

  private isStone(itemId: number): boolean {
    return stoneRow(itemId) !== null;
  }

  /** OnDestroy's and ReFreshAll's let-go: every piece's hold released. */
  private reset(): void {
    for (const id of this.slots.clear()) this.host.reserve(id, false);
  }

  private make(): ResWindow {
    if (this.window !== null) {
      this.attach(this.window);
      return this.window;
    }
    const doc = this.host.ui.doc;
    const window = new ResWindow(summonAngelLayout((tid) => this.host.text(tid)), this.host.ui.art, doc);
    window.frame.element.classList.add('hud-summon-angel');
    window.setContent('WIDC_TEXT1', ...questNodes(doc, this.host.questText()));
    // the two stones' icons (OnDraw :64-78) and the rates' "%"s in 0xff2e70a9 (:112-121)
    for (const [itemId, top, stone] of [[SUNSTONE, 218, 'sun'], [MOONSTONE, 306, 'moon']] as const) {
      const icon = doc.createElement('img');
      icon.className = 'hud-summon-angel-stone';
      icon.dataset.stone = stone;
      icon.alt = this.host.props.get(itemId)?.name ?? '';
      icon.draggable = false;
      const key = this.host.props.get(itemId)?.icon;
      if (key) icon.src = this.host.ui.art.url(key);
      Object.assign(icon.style, { left: '30px', top: `${top}px` });
      window.frame.body.append(icon);
    }
    for (const top of [206, 230, 254]) {
      const percent = doc.createElement('span');
      percent.className = 'hud-summon-angel-percent';
      percent.textContent = '%';
      Object.assign(percent.style, { left: '415px', top: `${top}px` });
      window.frame.body.append(percent);
    }
    window.onClose = () => this.closed();
    this.wire(window);
    this.window = window;
    this.attach(window);
    return window;
  }

  /** OnDestroy: the pieces let go and the die flag off. */
  private closed(): void {
    this.reset();
    this.starting = false;
    this.host.dieFlag(false);
  }

  private attach(window: ResWindow): void {
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
  }

  private wire(window: ResWindow): void {
    SLOT_IDS.forEach((id, slot) => {
      const box = window.control(id).parentElement!;
      box.dataset.angelSlot = String(slot);
      // the slot under a carried item, 0x60ffff00 (OnDraw :80-93), and its drop
      box.ondragover = (event) => {
        if (event.dataTransfer?.types.includes('application/x-flyff-inventory') !== true) return;
        event.preventDefault();
        box.classList.add('is-drag-over');
      };
      box.ondragleave = () => box.classList.remove('is-drag-over');
      box.ondrop = (event) => {
        box.classList.remove('is-drag-over');
        const objectId = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
        if (!Number.isFinite(objectId)) return;
        event.preventDefault();
        this.drop(slot, objectId, event.shiftKey);
      };
      box.addEventListener('dblclick', (event) => { event.preventDefault(); if (!this.host.mobile()) this.removeAt(slot); });
      box.addEventListener('click', () => { if (this.host.mobile()) this.removeAt(slot); });
    });
    window.button('WIDC_RESET').onclick = () => this.resetAll();
    window.button('WIDC_START').onclick = () => this.start();
    window.button('WIDC_CANCEL').onclick = () => this.close();
  }

  /** OnDraw: each slot's stone, and the rates (`SummonRateRefresh`). */
  private draw(): void {
    const window = this.window;
    if (window === null) return;
    const doc = this.host.ui.doc;
    this.slots.all.forEach((objectId, slot) => {
      const box = window.control(SLOT_IDS[slot]!).parentElement!;
      box.querySelector('.hud-res-slot')?.remove();
      const itemId = objectId === null ? undefined : this.host.own()?.inventory?.get(objectId)?.itemId;
      const prop = itemId === undefined ? undefined : this.host.props.get(itemId);
      box.toggleAttribute('data-filled', objectId !== null);
      box.title = prop?.name ?? '';
      if (prop?.icon === undefined) return;
      const holder = doc.createElement('div');
      holder.className = 'hud-res-slot';
      const icon = doc.createElement('img');
      icon.src = this.host.ui.art.url(prop.icon);
      icon.alt = prop.name;
      icon.draggable = false;
      holder.append(icon);
      box.append(holder);
    });
    const rates = summonRates(this.slots.counts().total);
    window.setText('WIDC_STATIC_RED', rateText(rates.red));
    window.setText('WIDC_STATIC_BLUE', rateText(rates.blue));
    window.setText('WIDC_STATIC_GREEN', rateText(rates.green));
  }
}

