// The jewel windows (2026-11-10, docs/superpowers/specs/2026-11-10-jewels-research.md): Peach's Create Jewels and Jewel
// Setting, as Neuz draws and runs them.
//
//   Window                Neuz                                                 sends
//   APP_SMELT_EXTRACTION  CWndExtraction (_Interface/WndField.cpp:19650-19920)  ULTIMATE_MAKEGEM 0xf000f111 at START
//   APP_SMELT_JEWEL       CWndSmeltJewel (WndField.cpp:19900-20530)             ULTIMATE_SETGEM 0xf000f114 after START's
//                                                                              turn (`Process`, :19993-20050)
//
// Both answer in ULTIMATE 0x0100 (`OnUltimateWeapon`, Neuz/DPClient.cpp:11577-11655). Items go in by a drop from the bag,
// or the bag's double-click (`CWndInventory::OnChildNotify`, WndField.cpp:2288-2350): a jewel into Jewel Setting, a weapon
// into Create Jewels. A phone, which has no drag, taps a bag item in: to the place a drop would take it. The bag holds
// what a window holds (`SetExtra`).
//
// Jewel Setting draws the weapon's 3D model turning in WIDC_CUSTOM1 (OnDraw :20053-20230); the browser draws its icon
// there instead, turning while START runs (the checkpoint's plan has the model).

import type { WebItemProp, WebUltimate } from '@flyffweb/formats';
import { UltimateResult, UltimateState } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { themeUrl } from '../hud/art';
import { parseDialogText } from '../hud/dialogue/dialogText';
import { formatText } from '../hud/format';
import { ResWindow } from '../hud/resWindow';
import type { ResLayout } from '../hud/resWindow';
import type { OwnState } from '../OwnState';
import { canCreateJewels, gemKind, isJewel, isUltimate, usableSocket } from './ultimateRules';

/** SND_INF_UPGRADESUCCESS (Resource/defineSound.h:19), "InfUpgradeSuccess.wav". */
const SND_INF_UPGRADESUCCESS = 14;
/** START's sound (`PLAYSND( "PcSkillD-Counter01.wav" )`, WndField.cpp:20431). */
const START_SOUND = 'PcSkillD-Counter01.wav';
/** The edit tiles of a text, and the sockets' pictures. */
const EDIT = 'WndEditTile00.tga';
const SLOT = 'WndChgElemItem.bmp';
/** CWndSmeltJewel's five sockets (`m_nJewelSlot`, WIDC_STATIC1..5). */
const SOCKETS = 5;
const SOCKET_IDS = ['WIDC_STATIC1', 'WIDC_STATIC2', 'WIDC_STATIC3', 'WIDC_STATIC4', 'WIDC_STATIC5'];
/** Neuz's `Process` runs once a frame; its counts are frames, here at 60 a second. */
const FRAME_MS = 1000 / 60;

/** APP_SMELT_EXTRACTION (resdata.inc:8333-8380), "Create Jewels". (WIDC_STATIC1 lies off the window, unused.) */
export const EXTRACTION: ResLayout = {
  title: 'Create Jewels', width: 272, height: 208,
  controls: [
    { kind: 'static', id: 'WIDC_PIC_SLOT', rect: [112, 24, 144, 56], picture: SLOT },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [16, 68, 250, 134], tile: EDIT },
    { kind: 'button', id: 'WIDC_START', rect: [98, 144, 162, 164], picture: 'ButtStart.bmp', label: 'Start', quarter: 64 },
  ],
};

/**
 * APP_SMELT_JEWEL (resdata.inc:8984-9073), "Jewel Setting". WIDC_STATIC6's picture is the weapon's background, under
 * WIDC_CUSTOM1 (a static's picture is part of the window's own skin, `CWndNeuz::AdditionalSkinTexture`).
 */
export const SMELT_JEWEL: ResLayout = {
  title: 'Jewel Setting', width: 256, height: 432,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC6', rect: [16, 16, 176, 246], picture: 'Window01.bmp' },
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [16, 16, 176, 246] },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 260, 236, 358], tile: EDIT },
    ...SOCKET_IDS.map((id, i) => ({ kind: 'static' as const, id, rect: [192, 32 + 42 * i, 224, 64 + 42 * i] as const, picture: SLOT })),
    { kind: 'button', id: 'WIDC_START', rect: [90, 366, 154, 386], picture: 'ButtStart.bmp', label: 'Start', quarter: 64 },
  ],
};

export interface JewelHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** data/ultimate.json: the jewel by level and the descriptions; none without it. */
  ultimate(): WebUltimate | undefined;
  text(tid: string): string;
  /** g_WndMng.OpenMessageBox: an OK box with `text`. */
  alert(text: string): void;
  /** A chat line in the TID's colour (`PutString`). */
  say(tid: string): void;
  /** The bag holds a piece of `objectId` (`SetExtra( +1 )`) or lets it go. */
  reserve(objectId: number, on: boolean): void;
  reserved(objectId: number): number;
  /** `PLAYSND( file )`, and a sound of sound.inc by its id. */
  sound(file: string): void;
  soundId(id: number): void;
  sendMakeGem(weaponId: number): void;
  sendSetGem(weaponId: number, jewelId: number): void;
  /** A phone: a tap puts a bag item in, a tap on a filled slot takes it out, and the bag opens beside the window. */
  mobile(): boolean;
  openBag(): void;
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** The pieces of a bag stack not held by a window. */
const free = (host: JewelHost, objectId: number): number =>
  (host.own()?.inventory?.get(objectId)?.count ?? 0) - host.reserved(objectId);

const propOf = (host: JewelHost, objectId: number | null): WebItemProp | undefined => {
  const item = objectId === null ? undefined : host.own()?.inventory?.get(objectId);
  return item && host.props.get(item.itemId);
};

/** An icon drawn in `box` at its top left (32 x 32), or the box emptied of one; `cover` a theme picture under it. */
function drawIcon(host: JewelHost, box: HTMLElement, prop: WebItemProp | undefined, cover?: string): void {
  box.querySelector('.hud-res-slot')?.remove();
  if (prop?.icon === undefined && cover === undefined) return;
  const doc = host.ui.doc;
  const holder = doc.createElement('div');
  holder.className = 'hud-res-slot';
  if (cover !== undefined) holder.style.backgroundImage = themeUrl(host.ui.art, cover);
  if (prop?.icon) {
    const icon = doc.createElement('img');
    icon.src = host.ui.art.url(prop.icon);
    icon.alt = prop.name;
    icon.draggable = false;
    holder.append(icon);
  }
  box.append(holder);
}

/** A slot takes a bag item dropped on it (the bag's drag, `application/x-flyff-inventory`). */
function takeDrops(box: HTMLElement, take: (objectId: number) => void): void {
  box.ondragover = (event) => {
    if (event.dataTransfer?.types.includes('application/x-flyff-inventory') === true) event.preventDefault();
  };
  box.ondrop = (event) => {
    const id = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
    if (!Number.isFinite(id)) return;
    event.preventDefault();
    take(id);
  };
}

/** A description (`SetDescription`, `AddParsingString`): its #b #c codes as spans. */
function description(window: ResWindow, doc: Document, text: string | undefined): void {
  const nodes = parseDialogText((text ?? '').replace(/\r\n/g, '\n')).map((run) => {
    const span = doc.createElement('span');
    span.textContent = run.text;
    span.style.color = `#${(run.color & 0xffffff).toString(16).padStart(6, '0')}`;
    if (run.bold) span.style.fontWeight = 'bold';
    return span;
  });
  window.setContent('WIDC_TEXT1', ...nodes);
}

/** A slot's press: a double-click on the desktop (`OnLButtonDblClk`), a tap on a phone. */
function onSlotPress(host: JewelHost, box: HTMLElement, press: () => void): void {
  box.addEventListener('dblclick', (event) => { event.preventDefault(); if (!host.mobile()) press(); });
  box.addEventListener('click', () => { if (host.mobile()) press(); });
}

abstract class JewelWindow {
  protected window: ResWindow | null = null;

  constructor(protected readonly host: JewelHost) {}

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  /** The NPC's entry (WndWorld.cpp:4958-4985): refused while open; else the window, centred (`MoveParentCenter`). */
  open(): void {
    if (this.isOpen) {
      this.host.say('TID_GAME_WND_OVERLAPED');
      return;
    }
    const window = this.make();
    this.reset();
    this.draw();
    window.open();
    // a phone has no drag: the bag opens beside the window, for its taps
    if (this.host.mobile()) this.host.openBag();
  }

  close(): void {
    this.window?.close();
  }

  /** The player moved (`CWndWorld::Process`, WndWorld.cpp:8198-8222): the window closes. */
  dismiss(): void {
    this.close();
  }

  protected abstract layout(): ResLayout;
  protected abstract className(): string;
  protected abstract descriptionKey(): 'jewel' | 'extraction';
  protected abstract wire(window: ResWindow): void;
  /** OnDestroy: every held item let go. */
  protected abstract reset(): void;
  protected abstract draw(): void;

  private make(): ResWindow {
    if (this.window !== null) {
      this.attach(this.window);
      return this.window;
    }
    const window = new ResWindow(this.layout(), this.host.ui.art, this.host.ui.doc);
    window.frame.element.classList.add('hud-jewel', this.className());
    description(window, this.host.ui.doc, this.host.ultimate()?.descriptions[this.descriptionKey()]);
    window.onClose = () => this.reset();
    this.wire(window);
    this.window = window;
    this.attach(window);
    return window;
  }

  private attach(window: ResWindow): void {
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
  }
}

/** CWndExtraction, Create Jewels: a weapon; START breaks it into jewels (or nothing). */
export class ExtractionWindow extends JewelWindow {
  /** `m_pItemElem`: the weapon in the slot. */
  private weapon: number | null = null;
  /** `m_pEItemProp`: the last weapon's row, which names the jewel made after the weapon is gone. */
  private weaponProp: WebItemProp | undefined;
  /** START sent and not answered (the button disabled, :19820-19826). */
  private sent = false;

  protected layout(): ResLayout { return EXTRACTION; }
  protected className(): string { return 'hud-jewel-extraction'; }
  protected descriptionKey(): 'extraction' { return 'extraction'; }

  /** The slot's object id, for the tests. */
  get slot(): number | null {
    return this.weapon;
  }

  /**
   * The bag's double-click (WndField.cpp:2341-2350): a weapon with a free piece goes to `SetWeapon`, which takes it or not;
   * false for anything else, which the bag refuses (TID_SBEVE_NOTUSEITEM, :2577-2580).
   */
  take(objectId: number): boolean {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || prop.kind1 !== 1 || free(this.host, objectId) <= 0) return false;
    this.setWeapon(objectId);
    return true;
  }

  /** A phone's tap on a bag item: as the double-click. */
  tapItem(objectId: number): boolean {
    return this.take(objectId);
  }

  /** `OnDropIcon` (:19763-19792) and `SetWeapon` (:19794-19812): an empty slot takes a weapon Create Jewels takes. */
  setWeapon(objectId: number): void {
    const prop = propOf(this.host, objectId);
    if (this.weapon !== null || prop === undefined || !canCreateJewels(prop)) return;
    this.weapon = objectId;
    this.weaponProp = prop;
    this.host.reserve(objectId, true);
    this.sent = false;
    this.draw();
  }

  /** START (:19814-19829): disabled, then ULTIMATE_MAKEGEM with the weapon. */
  start(): void {
    if (this.weapon === null || this.sent) return;
    this.sent = true;
    this.draw();
    this.host.sendMakeGem(this.weapon);
  }

  /** `ReceiveResult` (:19845-19919). */
  onResult(result: number, count: number): void {
    if (!this.isOpen) return;
    if (result === UltimateResult.SUCCESS) {
      // "You have created %s %d.": the jewel of the weapon's level; the weapon is gone, and the slot empty
      const gem = gemKind(this.weaponProp?.limitLevel ?? 0, this.host.ultimate());
      const name = gem === null ? '' : this.host.props.get(gem)?.name ?? '';
      this.host.alert(formatText(this.host.text('TID_GAME_EXTRACTION_SUCCESS'), [name, count]));
      this.letGo();
      this.draw();
    } else if (result === UltimateResult.FAILED || result === UltimateResult.CANCEL) {
      this.host.alert(this.host.text('TID_GAME_EXTRACTION_FAILED'));
      this.close();
    } else if (result === UltimateResult.INVENTORY) {
      this.host.alert(this.host.text('TID_GAME_EXTRACTION_ERROR'));
      this.sent = false;
      this.draw();
    }
  }

  protected wire(window: ResWindow): void {
    const box = window.control('WIDC_PIC_SLOT').parentElement!;
    takeDrops(box, (objectId) => this.setWeapon(objectId));
    // a double-click on the slot takes the weapon out, START disabled (:19745-19761)
    onSlotPress(this.host, box, () => {
      if (this.weapon === null) return;
      this.letGo();
      this.sent = false;
      this.draw();
    });
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    this.letGo();
    this.sent = false;
  }

  private letGo(): void {
    if (this.weapon !== null) this.host.reserve(this.weapon, false);
    this.weapon = null;
  }

  /** OnDraw (:19668-19684): the weapon's icon; START enabled with a weapon in and nothing sent. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const box = window.control('WIDC_PIC_SLOT').parentElement!;
    const prop = propOf(this.host, this.weapon);
    drawIcon(this.host, box, prop);
    box.title = prop?.name ?? '';
    box.toggleAttribute('data-filled', prop !== undefined);
    window.button('WIDC_START').disabled = this.weapon === null || this.sent;
  }
}

/** CWndSmeltJewel, Jewel Setting: an Ultimate weapon, its sockets, a jewel for the next; START sets it after a turn. */
export class SmeltJewelWindow extends JewelWindow {
  /** `m_pItemElem`: the weapon. */
  private weapon: number | null = null;
  /** `m_dwJewel`: each open socket's jewel (an ability jewel set, or the jewel put in), 0 for none. */
  private jewels: number[] = [];
  /** `m_nUsableSlot`: the socket the next jewel goes in, or -1. */
  private usable = -1;
  /** `m_objJewelId` / `m_pJewelElem`: the bag's jewel put in the usable socket. */
  private jewel: number | null = null;
  /** `m_nStatus`, and START's turn: `m_nDelay`, `m_nCount`, `m_fAddRot`, `m_fRotate`, `m_nAlpha`. */
  private running = false;
  private delay = 25;
  private count = 0;
  private addRot = 2;
  private rotate = 0;
  private alpha = 0;
  private lastStep = 0;

  protected layout(): ResLayout { return SMELT_JEWEL; }
  protected className(): string { return 'hud-jewel-setting'; }
  protected descriptionKey(): 'jewel' { return 'jewel'; }

  /** The weapon's object id, the sockets as drawn, the jewel's, and START's turn running: for the tests. */
  get state(): { weapon: number | null; jewels: readonly number[]; usable: number; jewel: number | null; running: boolean } {
    return { weapon: this.weapon, jewels: [...this.jewels], usable: this.usable, jewel: this.jewel, running: this.running };
  }

  /**
   * The bag's double-click (WndField.cpp:2288-2300): one of the five jewels with a free piece goes to `SetJewel`, which
   * takes it or not; false for anything else, which the bag refuses (TID_SBEVE_NOTUSEITEM, :2581-2584). The weapon goes
   * in only by a drop (:20300-20330).
   */
  take(objectId: number): boolean {
    const item = this.host.own()?.inventory?.get(objectId);
    if (item === undefined || !isJewel(item.itemId) || free(this.host, objectId) <= 0) return false;
    this.setJewel(objectId);
    return true;
  }

  /** A phone's tap on a bag item: where a drop would take it, an Ultimate weapon to the weapon, a jewel to its socket. */
  tapItem(objectId: number): boolean {
    const prop = propOf(this.host, objectId);
    if (prop !== undefined && isUltimate(prop) && free(this.host, objectId) > 0) {
      this.setWeapon(objectId);
      return true;
    }
    return this.take(objectId);
  }

  /** `OnDropIcon` on WIDC_CUSTOM1 (:20300-20330): an Ultimate weapon, in place of any before it. */
  setWeapon(objectId: number): void {
    const prop = propOf(this.host, objectId);
    if (this.running || prop === undefined || !isUltimate(prop)) return;
    if (this.weapon !== null) this.host.reserve(this.weapon, false);
    this.weapon = objectId;
    this.host.reserve(objectId, true);
    this.initialize();
    this.draw();
  }

  /** `OnDropIcon` on a socket (:20332-20361), `SetJewel` (:20365-20389): one of the five jewels, into the usable socket. */
  setJewel(objectId: number, socket = this.usable): void {
    const item = this.host.own()?.inventory?.get(objectId);
    if (this.running || this.weapon === null || this.jewels.length === 0 || item === undefined || !isJewel(item.itemId)) return;
    if (this.usable < 0 || this.jewels[this.usable] !== 0 || socket !== this.usable) return;
    this.jewels[this.usable] = item.itemId;
    this.jewel = objectId;
    this.host.reserve(objectId, true);
    this.draw();
  }

  /** START (:20419-20435): disabled, its sound, and the turn; `step` sends when it ends. */
  start(): void {
    if (!this.canStart()) return;
    this.running = true;
    this.delay = 25;
    this.count = 0;
    this.host.sound(START_SOUND);
    this.draw();
  }

  /**
   * `Process` (:19993-20050), run for the frames since the last call: while START's turn runs, a step every `delay + 1`
   * frames, each turning faster (+4), the last ten moving in and whitening (+18 to 230); after the 26th, ULTIMATE_SETGEM.
   */
  step(now: number): void {
    if (!this.isOpen) { this.lastStep = now; return; }
    const frames = Math.min(Math.floor((now - this.lastStep) / FRAME_MS), 30);
    if (frames <= 0) return;
    this.lastStep += frames * FRAME_MS;
    for (let i = 0; i < frames && this.running; i++) this.frame();
    this.drawTurn();
  }

  /** `ReceiveResult` (:20437-20462). */
  onResult(result: number): void {
    if (!this.isOpen) return;
    if (result === UltimateResult.SUCCESS) {
      this.host.alert(this.host.text('TID_GAME_SMELTJEWEL_SUCCESS'));
      this.host.soundId(SND_INF_UPGRADESUCCESS);
      this.close();
    } else if (result === UltimateResult.FAILED) {
      this.host.alert(this.host.text('TID_GAME_SMELTJEWEL_FAIL'));
      this.initialize();
      this.draw();
    } else if (result === UltimateResult.CANCEL) {
      this.close();
    }
  }

  /** The bag changed (the jewel used up, the socket set): the sockets read again when idle and nothing is waiting. */
  refresh(): void {
    if (!this.isOpen) return;
    if (this.weapon !== null && this.host.own()?.inventory?.get(this.weapon) === undefined) {
      this.weapon = null;
      this.initialize();
    }
    this.draw();
  }

  protected wire(window: ResWindow): void {
    takeDrops(window.control('WIDC_CUSTOM1'), (objectId) => this.setWeapon(objectId));
    SOCKET_IDS.forEach((id, socket) => {
      const box = window.control(id).parentElement!;
      takeDrops(box, (objectId) => this.setJewel(objectId, socket));
      // a double-click on the usable socket takes its jewel out (:20391-20403)
      onSlotPress(this.host, box, () => {
        if (this.running || socket !== this.usable || this.jewel === null) return;
        this.host.reserve(this.jewel, false);
        this.jewel = null;
        this.jewels[socket] = 0;
        this.draw();
      });
    });
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    if (this.weapon !== null) this.host.reserve(this.weapon, false);
    this.weapon = null;
    this.initialize();
    this.running = false;
    this.alpha = 0;
    this.addRot = 2;
  }

  /** `InitializeJewel` (:20464-20520): the weapon's sockets read, the usable one found, the jewel put in let go. */
  private initialize(): void {
    if (this.jewel !== null) this.host.reserve(this.jewel, false);
    this.jewel = null;
    const item = this.weapon === null ? undefined : this.host.own()?.inventory?.get(this.weapon);
    this.jewels = [...(item?.ultimate ?? [])].slice(0, SOCKETS);
    this.usable = usableSocket(this.jewels);
  }

  private canStart(): boolean {
    return !this.running && this.weapon !== null && this.usable >= 0 && this.usable < SOCKETS && this.jewel !== null;
  }

  private frame(): void {
    this.rotate += this.addRot;
    if (this.count > this.delay) {
      this.addRot += 4;
      if (this.delay < 10) this.alpha = Math.min(this.alpha + 18, 230);
      this.delay -= 1;
      if (this.delay < 0) {
        this.running = false;
        this.delay = 25;
        this.rotate = 0;
        this.addRot = 2;
        this.alpha = 0;
        if (this.weapon !== null && this.jewel !== null) this.host.sendSetGem(this.weapon, this.jewel);
        this.draw();
      }
      this.count = 0;
    }
    this.count++;
  }

  /** The weapon turning and the white over it while START runs (OnDraw :20160-20165, :20285-20297). */
  private drawTurn(): void {
    const area = this.window?.control('WIDC_CUSTOM1');
    if (area === undefined) return;
    const icon = area.querySelector<HTMLElement>('.hud-jewel-weapon');
    if (icon !== null) icon.style.transform = this.running ? `rotate(${this.rotate % 360}deg)` : '';
    area.style.setProperty('--jewel-white', String(this.alpha / 255));
  }

  /** OnDraw (:20053-20297): the weapon, each socket by its state; START enabled when a jewel waits (`Process`). */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const area = window.control('WIDC_CUSTOM1');
    area.querySelector('.hud-jewel-weapon')?.remove();
    const weaponProp = propOf(this.host, this.weapon);
    if (weaponProp?.icon) {
      const icon = this.host.ui.doc.createElement('img');
      icon.className = 'hud-jewel-weapon';
      icon.src = this.host.ui.art.url(weaponProp.icon);
      icon.alt = weaponProp.name;
      icon.draggable = false;
      area.append(icon);
    }
    area.title = weaponProp?.name ?? '';
    area.toggleAttribute('data-filled', weaponProp !== undefined);
    SOCKET_IDS.forEach((id, socket) => {
      const box = window.control(id).parentElement!;
      let cover: string | undefined, jewel: WebItemProp | undefined;
      if (this.weapon !== null) {
        if (socket >= this.jewels.length) cover = 'WndDisableRed.bmp'; // not opened
        else if (this.jewels[socket] !== 0) {
          // a set jewel over blue; the jewel just put in, plain
          if (socket !== this.usable) cover = 'WndDisableBlue.bmp';
          jewel = this.host.props.get(this.jewels[socket]!);
        } else if (socket !== this.usable) cover = 'WndDisableBlack.bmp'; // open, but not the next
      }
      drawIcon(this.host, box, jewel, cover);
      box.title = jewel?.name ?? '';
      box.dataset.socket = this.weapon === null ? '' : socket >= this.jewels.length ? 'closed' : socket === this.usable ? 'usable'
        : this.jewels[socket] !== 0 ? 'set' : 'open';
      box.toggleAttribute('data-filled', jewel !== undefined && socket === this.usable);
    });
    window.button('WIDC_START').disabled = !this.canStart();
    this.drawTurn();
  }
}

/** Both windows, as the world screen holds them. */
export class JewelWindows {
  readonly extraction: ExtractionWindow;
  readonly setting: SmeltJewelWindow;

  constructor(host: JewelHost) {
    this.extraction = new ExtractionWindow(host);
    this.setting = new SmeltJewelWindow(host);
  }

  get isOpen(): boolean {
    return this.extraction.isOpen || this.setting.isOpen;
  }

  /** The bag's double-click: into the open window (true), or refused by the bag (false). */
  take(objectId: number): boolean {
    if (this.setting.isOpen) return this.setting.take(objectId);
    if (this.extraction.isOpen) return this.extraction.take(objectId);
    return false;
  }

  /** A phone's tap on a bag item. */
  tapItem(objectId: number): boolean {
    if (this.setting.isOpen) return this.setting.tapItem(objectId);
    if (this.extraction.isOpen) return this.extraction.tapItem(objectId);
    return false;
  }

  /** ULTIMATE: MAKEGEM to Create Jewels, SETGEM to Jewel Setting (`OnUltimateWeapon`, DPClient.cpp:11577-11643). */
  onUltimate(message: { state: number; result: number; count?: number }): void {
    if (message.state === UltimateState.MAKEGEM) this.extraction.onResult(message.result, message.count ?? 0);
    else if (message.state === UltimateState.SETGEM) this.setting.onResult(message.result);
  }

  /** The player moved: both close (WndWorld.cpp:8198-8222). */
  dismiss(): void {
    this.extraction.dismiss();
    this.setting.dismiss();
  }

  /** The bag closed: Create Jewels closes, Jewel Setting stays (`CWndInventory::OnDestroy`, WndField.cpp:1036-1045). */
  bagClosed(): void {
    this.extraction.dismiss();
  }

  close(): void {
    this.extraction.close();
    this.setting.close();
  }
}
