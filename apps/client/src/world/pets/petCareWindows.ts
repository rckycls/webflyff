// The raised pet's care windows (pets R3, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §2.3-2.5): each its own resdata.inc window as Neuz draws it, doing
// what its class does, in Neuz's order, and sending its packet. The rules are petCare.ts's.
//
//   Window / use                 Neuz                                                      sends
//   the pet's items              CDPClient::SendDoUseItem (Neuz/DPClient.cpp:10604-10661,  USE_PET_FEED, DOUSEITEM
//                                :10845-10857)
//   the food mill                CWndPetFoodMill (_Interface/WndPetSys.cpp:1637-1822)      MAKE_PET_FEED
//   its count                    CWndFoodConfirm( 2 ) (WndPetSys.cpp:1055-1266)            -
//   the tamer's miracle          CWndPetMiracle (WndPetSys.cpp:1269-1634)                  PET_TAMER_MIRACLE
//   the tamer's mistake          CWndCommItemDlg (_Interface/WndField.cpp:12937-12991)     PET_TAMER_MISTAKE
//   the hatch scroll             CWndCommItemDlg                                           DOUSEITEM, the focus
//   the life scroll              CWndPetLifeConfirm (WndPetSys.cpp:1825-1912)              DOUSEITEM, NULL_ID
//   the naming scroll            CWndChangePetName (_Interface/WndChangeName.cpp:125-232)  DO_USE_ITEM_INPUT
//   PET_MILL                     CDPClient::OnPetFoodMill (DPClient.cpp:16619-16632)       -
//   PET_RELEASE                  CDPClient::OnPetRelease (DPClient.cpp:16420-16448)        the miracle closes
//
// Every window opens centred (`MoveParentCenter`); a new one replaces the one open (`SAFE_DELETE`). The food mill takes
// its item by a drop on its slot or, as the element change does (a phone has no drag), a click on it in the bag.

import type { WebItemProp } from '@flyffweb/formats';
import { NULL_ID } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { themeKey } from '../hud/art';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import { CHANGE_NAME } from '../items/itemWindowLayouts';
import { nameRefusal } from '../items/itemWindows';
import type { OwnState } from '../OwnState';
import {
  MiracleRoll, availLevel, foodCountOf, foodCountStart, foodCountText, millRefusal, miracleOf, petItemUse,
} from './petCare';

const EDIT = 'WndEditTile00.tga';
const GROUP = 'WndEditTile200.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter: 72 });

/** APP_PET_FOODMILL (resdata.inc:9209-9256), CWndPetFoodMill: the help, the slot, OK and ButCancel2's Cancel. */
export const PET_FOODMILL: ResLayout = {
  title: 'Feed machine', width: 208, height: 176,
  controls: [
    button('WIDC_OK', [22, 112, 94, 132], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [104, 112, 176, 132], 'ButCancel2.bmp', 'Cancel'),
    { kind: 'static', id: 'WIDC_STATIC2', rect: [84, 54, 116, 86], picture: 'WndChgElemItem.bmp' },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [20, 22, 178, 38] },
  ],
};

/** APP_PET_ITEM (resdata.inc:10535-10589), CWndFoodConfirm: no title of its own (`PaintFrame` writes one). */
export const PET_ITEM: ResLayout = {
  title: '', width: 272, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [46, 14, 232, 36] },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [40, 52, 84, 74], text: 'Number' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [92, 52, 218, 72], tile: EDIT },
    button('WIDC_OK', [44, 90, 116, 110], 'ButtOk.tga', 'OK'),
    button('WIDC_CANCEL', [140, 90, 212, 110], 'ButtCancel.tga', 'Cancel'),
  ],
};

/**
 * APP_PET_MIRACLE (resdata.inc:9257-9331), CWndPetMiracle: the two grades' boxes (tiled statics the class writes in), the
 * two steps' boxes, the help (with a scroll bar), OK (hidden until the spins stop) and WIDC_BUTTON2 in its place, whose
 * English picture is ButChance.bmp (`OnInitialUpdate`, WndPetSys.cpp:1366-1372).
 */
export const PET_MIRACLE: ResLayout = {
  title: 'Chance of the Pet Tamer', width: 272, height: 336,
  controls: [
    { kind: 'custom', id: 'WIDC_STATIC1', rect: [40, 12, 88, 30], tile: GROUP },
    { kind: 'custom', id: 'WIDC_STATIC2', rect: [172, 12, 220, 30], tile: GROUP },
    { kind: 'custom', id: 'WIDC_STATIC3', rect: [20, 36, 108, 136], tile: EDIT },
    { kind: 'custom', id: 'WIDC_STATIC4', rect: [152, 36, 240, 136], tile: EDIT },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [18, 146, 258, 258], tile: EDIT, scroll: true },
    button('WIDC_OK', [96, 270, 168, 290], 'ButOk2.bmp', 'OK'),
    button('WIDC_BUTTON2', [96, 270, 168, 290], 'ButChance.bmp', 'Chance'),
  ],
};

/**
 * APP_MESSAGEBOX (resdata.inc:24534, "WndMessagebox.tga" whole, 256 x 144) as CWndPetLifeConfirm::OnInitialUpdate makes it
 * (WndPetSys.cpp:1849-1881): the text in the client area (244 x 112) less 10 10 10 35, YES 70 px left of the middle and NO
 * 10 px right of it, 30 px over the bottom, ButtYes and ButtNo at their own 72 x 20 (`FitTextureSize`). Not modal.
 */
export const PET_LIFE_CONFIRM: ResLayout = {
  title: 'Message Box', width: 256, height: 144, texture: 'WndMessagebox.tga',
  controls: [
    { kind: 'text', id: 'TEXT', rect: [10, 10, 234, 77] },
    button('IDYES', [52, 82, 124, 102], 'ButtYes.tga', 'Yes'),
    button('IDNO', [132, 82, 204, 102], 'ButtNo.tga', 'No'),
  ],
};

/** `Client/Client/PetMiracle.inc` (`SetDescription`, :1622-1634): its blue bold title, then the help. */
const MIRACLE_TITLE = ' Chance of Pet Tamer ';
const MIRACLE_HELP = 'Selecting Miracle will re-distribute the attribute points of the current and previous levels randomly.';

/** The packets the windows send, by name, with their fields (WorldSession's senders). */
export type PetCarePacket =
  | ['usePetFeed', number]
  | ['makePetFeed', number, number, number]
  | ['petTamerMistake', number]
  | ['petTamerMiracle', number]
  | ['doUseItemInput', number, string];

export interface PetCareHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** A text by its TID, `%s` and `%d` filled from `args` (the catalog's "\n" as line breaks). */
  text(tid: string, args?: ReadonlyArray<string | number>): string;
  /** A line in the TID's colour (`PutString`). */
  say(tid: string, args?: ReadonlyArray<string | number>): void;
  /** CWndCommItemDlg with `text`: OK runs `ok`. */
  box(text: string, ok: () => void): void;
  /** Neuz's message box (`OpenMessageBox`): the name's rules. */
  alert(text: string): void;
  /** A shop is open: CWndCommItemDlg's OK says `TID_GAME_TRADELIMITUSING` (WndField.cpp:12937-12943). */
  shopOpen(): boolean;
  /** `SendDoUseItem( ..., bResult FALSE )` of the item at `objectId` naming `target`: a box's OK ('confirmed') or the life
   * scroll's YES ('again', with none of the box's own checks). */
  use(objectId: number, from: 'confirmed' | 'again', target: number): void;
  send(...packet: PetCarePacket): void;
  /** The bag's hold on an item while a window has it (`CItemBase::SetExtra`): drawn faded, not dragged nor used. */
  reserve(objectId: number, on: boolean): void;
  /** `CreateApplet( APP_INVENTORY )`: the bag opened (the food mill's, V15). */
  openBag(): void;
  /** The pet's status window is open (`GetWndBase( APP_PET_STATUS )`). */
  statusOpen(): boolean;
  /** Its `LockShowLevel( on, level, slot )`. */
  lock(on: boolean, level: number, slot: 0 | 1): void;
  /** `PLAYSND( "InfOpen.wav" )`. */
  sound(): void;
  /** `rand()`, as a number in [0, 1). */
  random?(): number;
  /** What the windows draw with, and the layer they go in. */
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** The food mill open: the feed maker that opened it (`m_dwObjId`, NULL_ID at the tamer), the item placed and its count. */
interface Mill { tool: number; item: number | null; count: number }
/** The miracle open: its scroll (`m_dwObjId`), the pet's level (`m_nPetLevel`), the spins, the status window's locks. */
interface Miracle { scroll: number; level: number; roll: MiracleRoll; locked: [boolean, boolean] }

export class PetCareWindows {
  private readonly windows = new Map<ResLayout, ResWindow>();
  private mill: Mill | null = null;
  /** The count window's item (`CWndFoodConfirm::m_pItemElem`). */
  private counting: number | null = null;
  private miracle: Miracle | null = null;
  private lifeScroll = -1;
  private nameScroll = 0;

  constructor(private readonly host: PetCareHost) {}

  /** The food mill is open (`GetWndBase( APP_PET_FOODMILL )`): the bag's uses are refused, its clicks are the mill's. */
  get millOpen(): boolean {
    return this.mill !== null && this.window(PET_FOODMILL).isOpen;
  }

  /** A click on a bag item goes in the food mill. */
  get picking(): boolean {
    return this.millOpen;
  }

  /**
   * The pet branches of `SendDoUseItem` for a use from the bag or the task bar (`bResult` TRUE, :10614-10661, :10845-10857),
   * after its EXT_PET check: true when the item is the pet's and its window opened (or its food went); `target` is the
   * focused mover DOUSEITEM would name.
   */
  use(objectId: number, target: number): boolean {
    const item = this.host.own()?.inventory?.get(objectId);
    const prop = item && this.host.props.get(item.itemId);
    const kind = prop ? petItemUse(prop) : null;
    switch (kind) {
      case 'miracle':
        this.openMiracle(objectId);
        return true;
      case 'mistake':
        // SetItem( TID_GAME_PET_MISTAKE_DESC, dwId, II_SYS_SYS_SCR_PET_TAMER_MISTAKE ): OK sends the mistake
        this.host.box(this.host.text('TID_GAME_PET_MISTAKE_DESC'), () => {
          if (this.host.shopOpen()) this.host.say('TID_GAME_TRADELIMITUSING');
          else this.host.send('petTamerMistake', objectId);
        });
        return true;
      case 'hatch':
        // SetItem( TID_GAME_PET_HATCH_DESC, dwId, objid ): OK is SendDoUseItem( ..., objid, -1, FALSE )
        this.host.box(this.host.text('TID_GAME_PET_HATCH_DESC'), () => this.host.use(objectId, 'confirmed', target));
        return true;
      case 'feed':
        this.host.send('usePetFeed', objectId); // __PET_0519: no count asked, the server feeds what fits
        return true;
      case 'feedMaker':
        if (this.millOpen) this.host.say('TID_GAME_WND_OVERLAPED');
        else this.openMill(objectId);
        return true;
      case 'life':
        this.openLife(objectId);
        return true;
      case 'naming':
        this.openName(objectId);
        return true;
      default:
        return false;
    }
  }

  /** The Pet Tamer's `MMI_PET_FOODMILL` (`WndWorld.cpp:5863-5876`): `TID_GAME_NOWUSING` when it is open, else the mill. */
  tamerMill(): void {
    if (this.millOpen) this.host.say('TID_GAME_NOWUSING');
    else this.openMill(NULL_ID);
  }

  /**
   * A bag item clicked (or dropped on the slot) while the food mill is open (`OnDropIcon`, :1744-1779): the item held
   * before is let go and the count window asks how many of this one; true when the mill took the click.
   */
  pick(objectId: number): boolean {
    const mill = this.mill;
    if (mill === null || !this.millOpen) return false;
    const item = this.host.own()?.inventory?.get(objectId);
    if (item === undefined) return true;
    this.placeInMill(null, 0);
    this.openCount(objectId);
    return true;
  }

  /** PET_MILL (`OnPetFoodMill`): the result said (`ReceiveResult`, :1801-1822); a feed maker's mill then closes. */
  onMill(result: number, count: number): void {
    const mill = this.mill;
    if (mill === null || !this.millOpen) return;
    if (result === 0) {
      this.host.say('TID_GAME_LACKSPACE');
    } else if (result === 1) {
      this.host.say('TID_GAME_PETFEED_MAKE', [count]);
      this.placeInMill(null, 0);
    }
    if (mill.tool !== NULL_ID) this.window(PET_FOODMILL).close();
  }

  /** The bag closed: the food mill goes with it (`CWndInventory::OnDestroy`, WndField.cpp:1092-1096, V15). */
  bagClosed(): void {
    this.window(PET_FOODMILL).close();
  }

  /**
   * The own pet's mover made again after the tamer's miracle (`CreatePetSfx`, `Mover.cpp:11163-11175`): the window spins to
   * the pet's two new steps (`ReceiveResult( GetAvailLevel( nLevel - 1 ), GetAvailLevel( nLevel ) )`).
   */
  miracleResult(): void {
    const open = this.miracle, pet = this.host.own()?.petItem()?.pet;
    if (open === null || !this.window(PET_MIRACLE).isOpen || pet === undefined) return;
    open.roll.receive(availLevel(pet, pet.level - 1), availLevel(pet, pet.level));
    this.drawMiracle();
  }

  /**
   * PET_RELEASE about the own player: the miracle window closes (`OnPetRelease`, :16437-16439). Its
   * `g_WndMng.m_pWndFoodConfirm` (:16441-16442) is the food's count box, `CWndFoodConfirm( 1 )`, which V15 never makes (the
   * food is used at once, `__PET_0519`, :10637-10649); the food mill's count box is the mill's own (`m_pWndFoodConfrim`,
   * WndPetSys.cpp:1770-1774), which stays (2026-11-09, pets review).
   */
  released(): void {
    this.window(PET_MIRACLE).close();
  }

  /** A frame of the windows' `Process`: the miracle's spins (`CWndPetMiracle::Process`). */
  step(): void {
    const open = this.miracle;
    if (open === null || !open.roll.rolling || !this.window(PET_MIRACLE).isOpen) return;
    const stopped = open.roll.step(() => this.host.random?.() ?? Math.random(), () => this.host.sound());
    for (const slot of stopped) {
      // the status window's lock lets go of that level (:1527-1532, :1594-1599)
      if (open.locked[slot] && this.host.statusOpen()) this.host.lock(false, slot === 0 ? open.level - 1 : open.level, slot);
      open.locked[slot] = false;
      if (slot === 1) {
        // the last stop: the miracle button goes, OK comes (:1600-1607)
        const window = this.window(PET_MIRACLE);
        window.button('WIDC_BUTTON2').hidden = true;
        window.button('WIDC_OK').hidden = false;
        window.button('WIDC_OK').disabled = false;
      }
    }
    this.drawMiracle();
  }

  dispose(): void {
    for (const window of this.windows.values()) window.dispose();
    this.windows.clear();
    this.mill = null;
    this.miracle = null;
  }

  /** A window by its layout, made once and kept in the layer. */
  private window(layout: ResLayout): ResWindow {
    let window = this.windows.get(layout);
    if (window === undefined) {
      window = new ResWindow(layout, this.host.ui.art, this.host.ui.doc);
      this.windows.set(layout, window);
    }
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
    return window;
  }

  /** The button `id` of `window` now does `press`, in place of what it did. */
  private press(window: ResWindow, id: string, press: () => void): void {
    window.button(id).onclick = (event) => {
      event.preventDefault();
      press();
    };
  }

  /** CWndPetFoodMill: the help, the slot, the bag opened; `tool` the feed maker (`SetItem`), NULL_ID at the tamer. */
  private openMill(tool: number): void {
    const window = this.window(PET_FOODMILL);
    window.close(); // SAFE_DELETE of the one open
    const mill: Mill = { tool, item: null, count: 0 };
    this.mill = mill;
    window.setText('WIDC_STATIC1', this.host.text('TID_GAME_PETFOODMILL_DESC'));
    const slot = this.millSlot();
    slot.ondragover = (event) => {
      if (event.dataTransfer?.types.includes('application/x-flyff-inventory') === true) event.preventDefault();
    };
    slot.ondrop = (event) => {
      const id = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
      if (!Number.isFinite(id) || this.mill !== mill) return;
      event.preventDefault();
      this.pick(id);
    };
    // a double-click on the slot empties it (OnLButtonDblClk, :1732-1742)
    slot.ondblclick = () => { if (this.mill === mill) this.placeInMill(null, 0); };
    this.press(window, 'WIDC_OK', () => this.millOk(mill));
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.onClose = () => {
      // OnDestroy (:1651-1662): the item let go, the count window closed
      if (this.mill === mill) this.placeInMill(null, 0);
      if (this.mill === mill) this.mill = null;
      this.window(PET_ITEM).close();
    };
    this.drawMill();
    this.host.openBag(); // OnInitialUpdate, __IMPROVE_SYSTEM_VER15 (:1696-1698)
    window.open();
  }

  /** OK (:1710-1725): MAKE_PET_FEED for a gem, else TID_GAME_NOTFOOD; the window stays. */
  private millOk(mill: Mill): void {
    if (this.mill !== mill || mill.item === null) return;
    const item = this.host.own()?.inventory?.get(mill.item);
    const prop = item && this.host.props.get(item.itemId);
    if (item === undefined || prop === undefined) return;
    const refused = millRefusal(prop, item);
    if (refused !== null) this.host.say(refused);
    else this.host.send('makePetFeed', mill.item, mill.tool, mill.count);
  }

  /** `SetItemForFeed` (:1786-1799), or the slot emptied (`SetExtra( 0 )`, null): the bag's hold follows. */
  private placeInMill(objectId: number | null, count: number): void {
    const mill = this.mill;
    if (mill === null) return;
    if (mill.item !== null) this.host.reserve(mill.item, false);
    mill.item = objectId;
    mill.count = count;
    if (objectId !== null) this.host.reserve(objectId, true);
    this.drawMill();
  }

  /** The slot's box: WIDC_STATIC2's picture. */
  private millSlot(): HTMLElement {
    return this.window(PET_FOODMILL).control('WIDC_STATIC2').parentElement!;
  }

  /**
   * `OnDraw` (:1664-1687): the item's icon at the slot's top left and "Count : n" in blue, its right at the slot's left + 36
   * and its bottom at its top + 48.
   */
  private drawMill(): void {
    const slot = this.millSlot();
    slot.querySelector('.hud-res-slot')?.remove();
    slot.querySelector('.hud-pet-mill-count')?.remove();
    const mill = this.mill;
    const item = mill?.item == null ? undefined : this.host.own()?.inventory?.get(mill.item);
    const prop = item && this.host.props.get(item.itemId);
    if (mill === null || prop === undefined) return;
    const doc = this.host.ui.doc;
    const holder = doc.createElement('div');
    holder.className = 'hud-res-slot';
    if (prop.icon) {
      const icon = doc.createElement('img');
      icon.src = this.host.ui.art.url(prop.icon);
      icon.alt = prop.name;
      icon.draggable = false;
      holder.append(icon);
    }
    const count = doc.createElement('span');
    count.className = 'hud-pet-mill-count';
    count.textContent = this.host.text('TID_GAME_KWAIBAWIBO_PRESENT_NUM', [mill.count]);
    slot.append(holder, count);
  }

  /**
   * CWndFoodConfirm( 2 ) (:1130-1227): "Check the amount of items you have." over "How many items will you use?", the
   * count (the stack, at most 1000, kept so as it is typed); OK or Enter puts that many in the mill, Cancel nothing.
   */
  private openCount(objectId: number): void {
    const window = this.window(PET_ITEM);
    window.close(); // SAFE_DELETE( m_pWndFoodConfrim )
    const stack = this.host.own()?.inventory?.get(objectId)?.count ?? 0;
    this.counting = objectId;
    window.frame.setTitle(this.host.text('TID_GAME_ITEMCOUNT_CONFIRM'));
    window.setText('WIDC_STATIC1', this.host.text('TID_GAME_ITEMCOUNT_QUESTION'));
    const input = window.input('WIDC_EDIT1');
    input.value = foodCountStart(stack);
    input.oninput = () => {
      const kept = foodCountText(input.value, stack);
      if (kept !== input.value) input.value = kept;
    };
    const ok = (): void => {
      const count = foodCountOf(input.value, stack);
      const mill = this.mill;
      if (count !== null && mill !== null && this.millOpen && this.counting === objectId) this.placeInMill(objectId, count);
      window.close();
    };
    input.onkeydown = (event) => {
      if (event.key !== 'Enter') return; // EN_RETURN
      event.preventDefault();
      ok();
    };
    this.press(window, 'WIDC_OK', ok);
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.onClose = () => { if (this.counting === objectId) this.counting = null; };
    window.open();
    input.focus();
    input.select();
  }

  /**
   * CWndPetMiracle (`OnInitialUpdate`, :1362-1426): only for a B, A or S pet out (else nothing shows); the two grades, the
   * steps, the help; OK hidden until the spins stop; the status window, when open, keeps the two steps it shows.
   */
  private openMiracle(scroll: number): void {
    const window = this.window(PET_MIRACLE);
    window.close(); // SAFE_DELETE( m_pWndPetMiracle )
    const pet = this.host.own()?.petItem()?.pet;
    const of = pet === undefined ? null : miracleOf(pet);
    if (of === null) return;
    const open: Miracle = { scroll, level: of.level, roll: new MiracleRoll(of.steps), locked: [false, false] };
    this.miracle = open;
    const doc = this.host.ui.doc;
    of.grades.forEach((tid, i) => {
      const grade = doc.createElement('span');
      grade.className = 'hud-pet-miracle-grade';
      grade.textContent = this.host.text(tid);
      window.control(`WIDC_STATIC${i + 1}`).replaceChildren(grade);
    });
    const title = doc.createElement('span');
    title.className = 'hud-res-words-title';
    title.textContent = MIRACLE_TITLE;
    window.setContent('WIDC_TEXT1', title, '\n', MIRACLE_HELP);
    const ok = window.button('WIDC_OK'), chance = window.button('WIDC_BUTTON2');
    ok.hidden = true;
    ok.disabled = true;
    chance.hidden = false;
    chance.disabled = false;
    this.press(window, 'WIDC_BUTTON2', () => {
      // OnChildNotify (:1438-1447): the button off, the scroll sent
      if (this.miracle !== open || chance.disabled) return;
      chance.disabled = true;
      this.host.send('petTamerMiracle', open.scroll);
    });
    this.press(window, 'WIDC_OK', () => window.close());
    if (this.host.statusOpen()) {
      this.host.lock(true, open.level - 1, 0);
      this.host.lock(true, open.level, 1);
      open.locked = [true, true];
    }
    window.onClose = () => {
      // OnDestroy (:1310-1323): the locks still held let go
      if (this.host.statusOpen()) {
        if (open.locked[0]) this.host.lock(false, open.level - 1, 0);
        if (open.locked[1]) this.host.lock(false, open.level, 1);
      }
      open.locked = [false, false];
      if (this.miracle === open) this.miracle = null;
    };
    this.drawMiracle();
    window.open();
  }

  /** `OnDraw` (:1325-1360): each place's step icon (`Icon_PetLevel<n>_L.dds`) at its box's left and top + 4. */
  private drawMiracle(): void {
    const open = this.miracle;
    if (open === null) return;
    const window = this.window(PET_MIRACLE);
    for (const slot of [0, 1] as const) {
      const box = window.control(`WIDC_STATIC${slot + 3}`);
      const index = open.roll.drawn(slot);
      let icon = box.querySelector<HTMLImageElement>('.hud-pet-miracle-step');
      if (index < 0 || index > 8) {
        icon?.remove();
        continue;
      }
      if (icon === null) {
        icon = this.host.ui.doc.createElement('img');
        icon.className = 'hud-pet-miracle-step';
        icon.alt = '';
        icon.draggable = false;
        box.append(icon);
      }
      const src = this.host.ui.art.url(themeKey(`Icon_PetLevel${index + 1}_L.dds`));
      if (icon.getAttribute('src') !== src) icon.src = src;
      icon.dataset.step = String(index + 1);
    }
  }

  /** CWndPetLifeConfirm (:1849-1912): TID_GAME_PET_USELIFE; YES uses the scroll on no one, any answer closes. */
  private openLife(scroll: number): void {
    const window = this.window(PET_LIFE_CONFIRM);
    window.close(); // SAFE_DELETE( m_pWndPetLifeConfirm )
    this.lifeScroll = scroll;
    window.setText('TEXT', this.host.text('TID_GAME_PET_USELIFE'));
    this.press(window, 'IDYES', () => {
      // SendDoUseItem( MAKELONG( 0, m_nId ), NULL_ID, -1, FALSE )
      if (this.lifeScroll !== -1) this.host.use(this.lifeScroll, 'again', NULL_ID);
      window.close();
    });
    this.press(window, 'IDNO', () => window.close());
    window.open();
  }

  /**
   * CWndChangePetName (WndChangeName.cpp:125-232), APP_CHANGENAME: a new one each time; OK checks the name as the player's
   * (`IsValidPlayerName`; the InvalidName list is the server's) and sends it with the scroll (`SendDoUseItemInput`).
   */
  private openName(scroll: number): void {
    const window = this.window(CHANGE_NAME);
    window.close(); // SAFE_DELETE( m_pWndChangePetName )
    this.nameScroll = scroll;
    const input = window.input('WIDC_EDIT_CHANGENAME');
    input.value = '';
    this.press(window, 'WIDC_OK', () => {
      const { name, tid } = nameRefusal(input.value);
      input.value = name;
      if (tid !== null) {
        this.host.alert(this.host.text(tid));
        input.focus();
        return;
      }
      this.host.send('doUseItemInput', this.nameScroll, name);
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.open();
    input.focus();
  }
}
