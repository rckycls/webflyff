// The Upgrade Specialist's windows (2026-11-05, docs/superpowers/specs/2026-11-05-ui-fixes-research.md §4): BoBoChan's
// (`MaFl_Bobochan`) and Radyan's Piercing, Safe Upgrade and Safe Piercing (and Safe Accessory Upgrade), as Neuz draws
// and runs them.
//
//   Window             Neuz                                                  sends
//   APP_PIERCING       CWndPiercing (_Interface/WndPiercing.cpp)              PIERCING_SIZE 0xf000d008 after its box
//   APP_SMELT_SAFETY   CWndSmeltSafety (_Interface/WndField.cpp:23619-25234)  SMELT_SAFETY 0x70007000 every 2 s; the answer
//                                                                             SMELT_SAFETY 0x9900 moves its row on
//
// Items go in by a drop from the bag, or a double-click (a phone's Use) on a bag item while the window is open; the bag
// holds them (`SetExtra`): the piercing's faded and locked, the safe upgrade's counted down (its "die flag").

import type { WebItemProp } from '@flyffweb/formats';
import type { UiArt } from '../hud/art';
import { themeUrl } from '../hud/art';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import type { OwnState } from '../OwnState';
import { PIERCING } from './itemWindowLayouts';

const NULL_ID = 0xffffffff;
/** The Moonstones (II_GEN_MAT_MOONSTONE, _1), the Sunstones (ORICHALCUM01, _1), Shining Oricalkum (ORICHALCUM02). */
const MOONSTONES: ReadonlySet<number> = new Set([2036, 2083]);
const SUNSTONES: ReadonlySet<number> = new Set([2035, 2082]);
const ORICHALCUM02 = 2034;
/** The scrolls: SProtect, GProtect, XProtect, AProtect; Smelting. */
const SPROTECT = 10464;
const GPROTECT = 10465;
const XPROTECT = 10488;
const APROTECT = 26473;
const SMELTING = 10468;
/** `WEAPON_ULTIMATE`: `dwReferStat1` of an Ultimate weapon. */
const WEAPON_ULTIMATE = 2;
/** IK3_SUIT, IK3_SHIELD; IK2_WEAPON_DIRECT, _MAGIC, IK2_ARMOR, _ARMORETC, IK2_JEWELRY. */
const IK3_SUIT = 18;
const IK3_SHIELD = 16;
const IK2_WEAPON_DIRECT = 2;
const IK2_WEAPON_MAGIC = 3;
const IK2_ARMOR = 7;
const IK2_ARMORETC = 8;
const IK2_JEWELRY = 13;
/** `MAX_PIERCING_SUIT`, `MAX_PIERCING_WEAPON` (_Common/Piercing.h:4-7). */
const MAX_PIERCING_SUIT = 4;
const MAX_PIERCING_WEAPON = 10;
/** The piercing's cost (`__EXT_PIERCING`): a flat 100,000 Penya. */
export const PIERCING_COST = 100000;

/** `CItemElem::IsPierceAble( NULL_ID, bSize )` (Item.cpp:694-741): a suit to 4 sockets, a shield or a weapon to 10. */
export function isPierceAble(prop: WebItemProp, size: number, next: boolean): boolean {
  const after = size + (next ? 1 : 0);
  if (prop.kind3 === IK3_SUIT) return after <= MAX_PIERCING_SUIT;
  if (prop.kind3 === IK3_SHIELD || prop.kind2 === IK2_WEAPON_DIRECT || prop.kind2 === IK2_WEAPON_MAGIC) return after <= MAX_PIERCING_WEAPON;
  return false;
}

export interface UpgradeNpcHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  text(tid: string): string;
  say(tid: string): void;
  /** CWndMessageBox MB_OKCANCEL with the TID's text; OK runs `ok`. */
  ask(tid: string, ok: () => void): void;
  /** The bag holds a piece of `objectId` (`SetExtra( +1 )`) or lets one go. */
  reserve(objectId: number, on: boolean): void;
  /** The pieces of `objectId` held. */
  reserved(objectId: number): number;
  /** The safe upgrade's "die flag" on the bag (`SetDieFlag`): a stack held in part is still drawn and counted down. */
  dieFlag(on: boolean): void;
  /** The bag opened (`CreateApplet( APP_INVENTORY )`). */
  openBag(): void;
  /** The piercing's effect on the player (XI_INT_INCHANT), on or off. */
  effect(on: boolean): void;
  sendPiercingSize(itemId: number, moonstoneId: number, protectId: number): void;
  sendSmeltSafety(itemId: number, materialId: number, scrollId: number, smeltingId: number): void;
  now(): number;
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** The pieces of a bag stack not held by a window. */
const free = (host: UpgradeNpcHost, objectId: number): number =>
  (host.own()?.inventory?.get(objectId)?.count ?? 0) - host.reserved(objectId);

/** An item's icon drawn in `box` at its top left (32 x 32), or the box emptied of one. */
function drawIcon(host: UpgradeNpcHost, box: HTMLElement, prop: WebItemProp | null | undefined, alpha = 1): void {
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
function takeDrops(box: HTMLElement, take: (objectId: number, shift: boolean) => void): void {
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

/** CWndPiercing: the item, a Moonstone and an optional GProtect; OK asks, then PIERCING_SIZE, and the window closes. */
export class PiercingWindow {
  private window: ResWindow | null = null;
  /** `m_pItemElem[ 0..2 ]`: the item, the Moonstone, the GProtect. */
  private readonly slots: Array<number | null> = [null, null, null];

  constructor(private readonly host: UpgradeNpcHost) {}

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  /** MMI_PIERCING: the bag opens, the window beside it, the effect on (OnInitialUpdate, WndPiercing.cpp:125-156). */
  open(): void {
    if (this.isOpen) return;
    const window = this.make();
    this.host.openBag();
    this.host.effect(true);
    this.draw();
    window.open();
  }

  close(): void {
    this.window?.close();
  }

  /** A bag item double-clicked while open: into the slot its kind goes in (Neuz takes a drop on the slot). */
  take(objectId: number): void {
    const prop = this.propOf(objectId);
    if (prop === undefined) return;
    if (MOONSTONES.has(prop.id)) this.takeAt(1, objectId);
    else if (prop.id === GPROTECT) this.takeAt(2, objectId);
    else this.takeAt(0, objectId);
  }

  /** `OnDropIcon` (WndPiercing.cpp:182-290): the rules of slot `slot`. */
  takeAt(slot: number, objectId: number): void {
    const own = this.host.own(), item = own?.inventory?.get(objectId), prop = this.propOf(objectId);
    if (!own || !item || !prop || this.host.reserved(objectId) > 0) return;
    if (own.equipmentObjectIds.includes(objectId)) {
      this.host.say('TID_GAME_EQUIPPUT');
      return;
    }
    if (slot === 0) {
      if (!isPierceAble(prop, item.piercing?.length ?? 0, true)) {
        this.host.say('TID_PIERCING_POSSIBLE');
        return;
      }
      for (let i = 0; i < 3; i++) this.set(i, null);
      this.set(0, objectId);
    } else {
      if (this.slots[0] === null) return;
      const fits = slot === 1 ? MOONSTONES.has(prop.id) : prop.id === GPROTECT;
      if (!fits) {
        this.host.say('TID_SBEVE_NOTUSEITEM');
        return;
      }
      this.set(slot, objectId);
    }
    this.draw();
  }

  /** The player moved or the bag closed: the window closes (WndWorld.cpp:8360-8362, WndField.cpp:1047-1050). */
  dismiss(): void {
    this.close();
  }

  private make(): ResWindow {
    if (this.window !== null) {
      this.attach(this.window);
      return this.window;
    }
    const window = new ResWindow(PIERCING, this.host.ui.art, this.host.ui.doc);
    window.frame.element.classList.add('hud-piercing');
    ['WIDC_STATIC5', 'WIDC_STATIC6', 'WIDC_STATIC7'].forEach((id, slot) => {
      const box = window.control(id).parentElement!;
      takeDrops(box, (objectId) => this.takeAt(slot, objectId));
      // a right click empties the slot; on the item's, all three (OnRButtonUp, :336-366)
      box.oncontextmenu = (event) => {
        event.preventDefault();
        if (slot === 0) for (let i = 0; i < 3; i++) this.set(i, null);
        else this.set(slot, null);
        this.draw();
      };
    });
    window.button('WIDC_OK').onclick = () => {
      const [item, moon, protect] = this.slots;
      if (item === null || moon === null) return;
      this.host.ask('TID_PIERCING_ERROR_NOTICE', () => {
        this.host.sendPiercingSize(item, moon, protect ?? NULL_ID);
        window.close();
      });
    };
    window.button('WIDC_CANCEL').onclick = () => window.close();
    window.onClose = () => {
      for (let i = 0; i < 3; i++) this.set(i, null);
      this.host.effect(false);
    };
    this.window = window;
    this.attach(window);
    return window;
  }

  private attach(window: ResWindow): void {
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
  }

  private set(slot: number, objectId: number | null): void {
    const old = this.slots[slot];
    if (old !== null && old !== undefined) this.host.reserve(old, false);
    this.slots[slot] = objectId;
    if (objectId !== null) this.host.reserve(objectId, true);
  }

  private propOf(objectId: number | null): WebItemProp | undefined {
    const item = objectId === null ? undefined : this.host.own()?.inventory?.get(objectId);
    return item && this.host.props.get(item.itemId);
  }

  /** OnDraw (:75-123): each slot's icon, the cost "100,000" with an item in, else "0" (WSS_MONEY). */
  private draw(): void {
    const window = this.window;
    if (window === null) return;
    ['WIDC_STATIC5', 'WIDC_STATIC6', 'WIDC_STATIC7'].forEach((id, slot) => {
      const box = window.control(id).parentElement!;
      const prop = this.propOf(this.slots[slot] ?? null);
      drawIcon(this.host, box, prop);
      box.title = prop?.name ?? '';
    });
    window.setText('WIDC_STATIC9', this.slots[0] === null ? '0' : PIERCING_COST.toLocaleString('en-US'));
  }
}

/** The safe upgrade's modes (`WND_NORMAL`, `WND_ACCESSARY`, `WND_PIERCING`). */
export type SafetyMode = 'normal' | 'accessory' | 'piercing';

/** `SMELT_MAX`: the rows; `ENCHANT_TIME`: 2 s between the sends; the rows' pitch and the result bar's width. */
const SMELT_MAX = 10;
const ENCHANT_TIME = 2000;
const ROW_TOP = 60;
const ROW_PITCH = 42;
const BAR_WIDTH = 168;
/** `GENERAL_NON_USING_SCROLL2_LEVEL`: the smelting scroll is taken while the item is under +7. */
const SCROLL2_LEVEL = 7;
/** SafetyGauge.bmp: 12 x 32, three slices of 4 px (CTheme::RenderGauge: none under two slices). */
const GAUGE_SLICE = 4;

/** One row of the list: its material, protection and smelting scroll (in use), and its result once answered. */
interface SafetyRow {
  material: number | null;
  scroll1: number | null;
  scroll2: number | null;
  result: 'success' | 'failure' | null;
}

/** The mode's texts, rules and fixed icons (§4.3 of the research). */
interface ModeRules {
  title: string;
  nowTitle: string;
  maxTitle: string;
  /** NORMAL widens the window by 32 and moves the header by 16, for its smelting scroll column. */
  wide: boolean;
  /** The pair missing at START. */
  missing: string;
  /** A scroll placed with no free material row. */
  noMaterial: string;
  /** The target's refusal. */
  refusal: string;
}

const MODES: Record<SafetyMode, ModeRules> = {
  normal: {
    title: 'TID_GAME_SMELTSAFETY_NORMAL', nowTitle: 'TID_GAME_SMELT_SAFETY_NOW_GRADE', maxTitle: 'TID_GAME_SMELT_SAFETY_MAX_GRADE',
    wide: true, missing: 'TID_GAME_SMELT_SAFETY_ERROR08', noMaterial: 'TID_GAME_SMELT_SAFETY_ERROR03', refusal: 'TID_GAME_SMELT_SAFETY_ERROR01',
  },
  accessory: {
    title: 'TID_GAME_SMELTSAFETY_ACCESSARY', nowTitle: 'TID_GAME_SMELT_SAFETY_NOW_GRADE', maxTitle: 'TID_GAME_SMELT_SAFETY_MAX_GRADE',
    wide: false, missing: 'TID_GAME_SMELT_SAFETY_ERROR10', noMaterial: 'TID_GAME_SMELT_SAFETY_ERROR05', refusal: 'TID_GAME_SMELT_SAFETY_ERROR01',
  },
  piercing: {
    title: 'TID_GAME_SMELTSAFETY_PIERCING', nowTitle: 'TID_GAME_SMELT_SAFETY_NOW_PIERCING', maxTitle: 'TID_GAME_SMELT_SAFETY_MAX_PIERCING',
    wide: false, missing: 'TID_GAME_SMELT_SAFETY_ERROR11', noMaterial: 'TID_GAME_SMELT_SAFETY_ERROR05', refusal: 'TID_GAME_SMELT_SAFETY_ERROR02',
  },
};

/** APP_SMELT_SAFETY (resdata.inc:1310-1771), its controls moved for a wide mode (OnInitialUpdate, :23784-23852). */
export function smeltSafetyLayout(mode: SafetyMode): ResLayout {
  const wide = MODES[mode].wide;
  const x = wide ? 16 : 0, bar = wide ? 32 : 0;
  const controls: ResControl[] = [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [130 + x, 8, 162 + x, 40], picture: 'WndChgElemItem.bmp' },
    { kind: 'static', id: 'WIDC_TITLE_NOW_GRADE', rect: [18 + x, 16, 118 + x, 32] },
    { kind: 'static', id: 'WIDC_TITLE_MAX_GRADE', rect: [174 + x, 16, 274 + x, 32] },
    { kind: 'static', id: 'WIDC_NOW_GRADE', rect: [59 + x, 34, 79 + x, 52] },
    { kind: 'edit', id: 'WIDC_EDIT_MAX_GRADE', rect: [212 + x, 34, 236 + x, 52], tile: 'WndEditTile00.tga', maxLength: 2 },
    { kind: 'button', id: 'WIDC_BUTTON_PLUS', rect: [196 + x, 36, 210 + x, 52], picture: 'ButItemPlus.bmp', label: 'Goal up', quarter: 14 },
    { kind: 'button', id: 'WIDC_BUTTON_MINUS', rect: [238 + x, 36, 252 + x, 52], picture: 'ButItemMinus.bmp', label: 'Goal down', quarter: 14 },
    { kind: 'button', id: 'WIDC_BUTTON_START', rect: [30 + x, 480, 94 + x, 500], picture: 'ButtStart.bmp', label: 'Start', quarter: 64 },
    { kind: 'button', id: 'WIDC_BUTTON_STOP', rect: [114 + x, 480, 178 + x, 500], picture: 'Buttstop.bmp', label: 'Stop', quarter: 64 },
    { kind: 'button', id: 'WIDC_BUTTON_RESET', rect: [197 + x, 480, 269 + x, 500], picture: 'ButtReset.bmp', label: 'Reset', quarter: 72 },
  ];
  for (let i = 0; i < SMELT_MAX; i++) {
    const top = ROW_TOP + ROW_PITCH * i;
    controls.push(
      { kind: 'static', id: `MATERIAL${i}`, rect: [8, top, 40, top + 32], picture: 'WndChgElemItem.bmp' },
      { kind: 'static', id: `SCROLL1_${i}`, rect: [62, top, 94, top + 32], picture: 'WndChgElemItem.bmp' },
      { kind: 'static', id: `RESULT${i}`, rect: [116 + bar, top, 284 + bar, top + 32], picture: 'Window02.bmp' },
    );
    if (wide) controls.push({ kind: 'static', id: `SCROLL2_${i}`, rect: [98, top, 130, top + 32], picture: 'WndChgElemItem.bmp' });
  }
  return { title: 'Safe Upgrade', width: wide ? 336 : 304, height: 544, controls };
}

/**
 * CWndSmeltSafety: the item to upgrade, ten rows of a material, a protection scroll and (Safe Upgrade) a smelting scroll;
 * START sends a row every 2 s until the goal, the rows or STOP; each answer marks its row and moves on.
 */
export class SmeltSafetyWindow {
  private window: ResWindow | null = null;
  private mode: SafetyMode = 'normal';
  private target: number | null = null;
  private rows: SafetyRow[] = [];
  private materialCount = 0;
  private scroll1Count = 0;
  private scroll2Count = 0;
  private currentRow = 0;
  private goal = 0;
  private running = false;
  /** `m_bResultSwitch`: the gauge shows (from START or an answer until the send). */
  private resultSwitch = false;
  private timer: { start: number; end: number } | null = null;

  constructor(private readonly host: UpgradeNpcHost) {
    this.resetRows();
  }

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  /** The mode open, or null. */
  get openMode(): SafetyMode | null {
    return this.isOpen ? this.mode : null;
  }

  /** MMI_SMELT_SAFETY_*: the window in `mode`, any open one deleted first; the bag opens with its die flag. */
  open(mode: SafetyMode): void {
    this.close();
    this.window?.dispose();
    this.mode = mode;
    const rules = MODES[mode];
    const window = new ResWindow(smeltSafetyLayout(mode), this.host.ui.art, this.host.ui.doc);
    window.frame.element.classList.add('hud-smelt-safety');
    window.frame.setTitle(this.host.text(rules.title) || 'Safe Upgrade');
    window.setText('WIDC_TITLE_NOW_GRADE', this.host.text(rules.nowTitle));
    window.setText('WIDC_TITLE_MAX_GRADE', this.host.text(rules.maxTitle));
    for (const id of ['WIDC_TITLE_NOW_GRADE', 'WIDC_TITLE_MAX_GRADE', 'WIDC_NOW_GRADE']) window.control(id).classList.add('is-centred');
    this.window = window;
    this.wire(window);
    const layer = this.host.ui.layer();
    if (layer !== null) layer.append(window.element);
    this.target = null;
    this.resetRows();
    this.running = false;
    this.timer = null;
    this.host.openBag();
    this.host.dieFlag(true);
    this.refresh();
    window.open();
  }

  close(): void {
    this.window?.close();
  }

  /** The player moved or the bag closed (WndWorld.cpp:8493-8495, WndField.cpp:1071-1079). */
  dismiss(): void {
    this.close();
  }

  /**
   * A bag item double-clicked or dropped while open (`SetItem`, :24428-24692): the target, or into its column; with Shift
   * (2026-11-05, the owner's ask, as Neuz does: `AddListItem` in a loop) its column filled while the stack has a piece
   * left: the materials to 10, the scrolls to the materials.
   */
  take(objectId: number, shift = false): void {
    if (!this.isOpen) return;
    if (this.running) {
      this.host.say('TID_GAME_SMELT_SAFETY_ERROR12');
      return;
    }
    const own = this.host.own(), item = own?.inventory?.get(objectId);
    const prop = item && this.host.props.get(item.itemId);
    if (!own || !item || !prop || free(this.host, objectId) <= 0) return;
    const rules = MODES[this.mode];
    if (this.target === null) {
      if (!this.acceptsTarget(prop)) {
        this.host.say(rules.refusal);
        return;
      }
      this.target = objectId;
      this.host.reserve(objectId, true);
      this.goal = this.defaultMax();
      this.refresh();
      return;
    }
    const more = (): boolean => free(this.host, objectId) > 0;
    if (this.isMaterial(prop)) {
      while (this.materialCount < SMELT_MAX && more()) {
        this.add('material', objectId);
        if (!shift) break;
      }
    } else if (this.isScroll1(prop)) {
      if (this.scroll1Count < this.materialCount) {
        while (this.scroll1Count < this.materialCount && more()) {
          this.add('scroll1', objectId);
          if (!shift) break;
        }
      } else if (this.scroll1Count < SMELT_MAX) this.host.say(this.noMaterial());
    } else if (this.isScroll2(prop)) {
      if (this.scroll2Count < this.materialCount) {
        this.scroll2Count = Math.max(this.currentRow, this.scroll2Count);
        while (this.scroll2Count < this.materialCount && more()) {
          this.add('scroll2', objectId);
          if (!shift) break;
        }
      } else if (this.scroll2Count < SMELT_MAX) {
        this.host.say(this.noMaterial());
      }
    } else {
      this.host.say('TID_GAME_SMELT_SAFETY_ERROR06');
    }
    this.refresh();
  }

  /** SMELT_SAFETY's answer (`OnSmeltSafety`, DPClient.cpp:18748-18783): 1 success, 2 failure; 0 and 3 change nothing. */
  onResult(result: number): void {
    if (!this.isOpen || (result !== 1 && result !== 2) || this.currentRow >= SMELT_MAX) return;
    this.rows[this.currentRow]!.result = result === 1 ? 'success' : 'failure';
    this.currentRow++;
    if (result === 1) this.disableScroll2();
    this.resultSwitch = true;
    this.refresh();
  }

  /** One frame (`Process`, :23880-23967): the run's stops, then each 2 s a row's send. */
  step(): void {
    if (!this.isOpen || !this.running || this.target === null || this.timer === null) {
      this.drawGauge(0);
      return;
    }
    const now = this.host.now();
    if (this.validCount() === 0 || this.currentValue() === this.defaultMax()) this.stop();
    if (this.mode === 'piercing' && (this.host.own()?.gold ?? 0) < PIERCING_COST) {
      this.host.say('TID_GAME_LACKMONEY');
      this.stop();
    }
    if (this.timer.end < now) {
      this.resultSwitch = false;
      const row = this.rows[this.currentRow];
      if (row !== undefined && row.material !== null && row.scroll1 !== null) {
        this.host.sendSmeltSafety(this.target, row.material, row.scroll1, row.scroll2 ?? NULL_ID);
        for (const key of ['material', 'scroll1', 'scroll2'] as const) {
          if (row[key] !== null) this.host.reserve(row[key]!, false);
          row[key] = null;
        }
        this.refresh();
      }
      this.timer = { start: now, end: now + ENCHANT_TIME };
    }
    const rate = this.resultSwitch ? (now - this.timer.start) / (this.timer.end - this.timer.start) : 0;
    this.drawGauge(rate);
  }

  private wire(window: ResWindow): void {
    const target = window.control('WIDC_STATIC1').parentElement!;
    takeDrops(target, (id, shift) => this.take(id, shift));
    takeDrops(window.frame.body, (id, shift) => this.take(id, shift));
    // a double-click on the target slot takes it out, the rows reset (OnLButtonDblClk, :24249-24378)
    target.ondblclick = () => {
      if (this.running || this.target === null) return;
      this.host.reserve(this.target, false);
      this.target = null;
      this.resetData();
      this.refresh();
    };
    for (let i = 0; i < SMELT_MAX; i++) {
      for (const [column, key] of [['MATERIAL', 'material'], ['SCROLL1_', 'scroll1'], ['SCROLL2_', 'scroll2']] as const) {
        if (!MODES[this.mode].wide && key === 'scroll2') continue;
        window.control(`${column}${i}`).parentElement!.ondblclick = (event) => this.removeLast(key, event.shiftKey);
      }
    }
    const input = window.input('WIDC_EDIT_MAX_GRADE');
    input.inputMode = 'numeric';
    input.addEventListener('input', () => {
      if (this.running || this.target === null) return;
      const digits = input.value.replace(/\D/g, '');
      this.goal = Math.min(Number(digits || '0'), this.defaultMax());
      input.value = digits === '' ? '' : String(this.goal);
      this.refresh();
    });
    const step = (by: number) => () => {
      if (this.running || this.target === null) return;
      this.goal = Math.max(0, Math.min(this.goal + by, this.defaultMax()));
      this.refresh();
    };
    window.button('WIDC_BUTTON_PLUS').onclick = step(1);
    window.button('WIDC_BUTTON_MINUS').onclick = step(-1);
    window.button('WIDC_BUTTON_START').onclick = () => this.start();
    window.button('WIDC_BUTTON_STOP').onclick = () => { if (this.running) this.stop(); };
    window.button('WIDC_BUTTON_RESET').onclick = () => {
      if (this.running) return;
      this.resetData();
      this.refresh();
    };
    window.onClose = () => {
      this.running = false;
      this.timer = null;
      this.resetData();
      if (this.target !== null) this.host.reserve(this.target, false);
      this.target = null;
      this.host.dieFlag(false);
    };
  }

  /** START (:24052-24218): its refusals in Neuz's order, or the run begins (the first send 2 s on). */
  private start(): void {
    if (this.running) return;
    if (this.target === null) {
      this.host.say('TID_GAME_SMELT_SAFETY_ERROR07');
      return;
    }
    if (this.validCount() > 0) {
      if (this.mode === 'piercing' && (this.host.own()?.gold ?? 0) < PIERCING_COST) {
        this.host.say('TID_GAME_LACKMONEY');
        return;
      }
      const now = this.host.now();
      this.running = true;
      this.resultSwitch = true;
      this.timer = { start: now, end: now + ENCHANT_TIME };
      this.refresh();
      return;
    }
    if (this.currentValue() === this.defaultMax()) this.host.say('TID_GAME_SMELT_SAFETY_ERROR13');
    else if (this.currentRow >= SMELT_MAX) this.host.say('TID_GAME_SMELT_SAFETY_ERROR15');
    else if (this.materialCount <= this.currentRow || this.scroll1Count <= this.currentRow) this.host.say(this.missing());
    else this.host.say('TID_GAME_SMELT_SAFETY_ERROR14');
  }

  private stop(): void {
    this.running = false;
    this.resultSwitch = false;
    this.refresh();
  }

  /** `AddListItem`: the next cell of the column, a piece of the stack held. */
  private add(key: 'material' | 'scroll1' | 'scroll2', objectId: number): void {
    const count = key === 'material' ? this.materialCount : key === 'scroll1' ? this.scroll1Count : this.scroll2Count;
    this.rows[count]![key] = objectId;
    this.host.reserve(objectId, true);
    if (key === 'material') this.materialCount++;
    else if (key === 'scroll1') this.scroll1Count++;
    else this.scroll2Count++;
  }

  /**
   * A double-click on a column: its last unused cell out (with Shift every unused one), the scrolls trimmed to the
   * materials left.
   */
  private removeLast(key: 'material' | 'scroll1' | 'scroll2', shift = false): void {
    if (this.running) return;
    const take = (column: 'material' | 'scroll1' | 'scroll2', index: number): void => {
      const cell = this.rows[index]!;
      if (cell[column] !== null) this.host.reserve(cell[column]!, false);
      cell[column] = null;
    };
    if (key === 'material') {
      if (this.materialCount <= this.currentRow) return;
      do {
        this.materialCount--;
        take('material', this.materialCount);
      } while (shift && this.materialCount > this.currentRow);
      while (this.scroll1Count > this.materialCount) take('scroll1', --this.scroll1Count);
      while (this.scroll2Count > this.materialCount) take('scroll2', --this.scroll2Count);
    } else if (key === 'scroll1') {
      if (this.scroll1Count <= this.currentRow) return;
      do take('scroll1', --this.scroll1Count); while (shift && this.scroll1Count > this.currentRow);
    } else {
      if (this.scroll2Count <= this.currentRow) return;
      do take('scroll2', --this.scroll2Count); while (shift && this.scroll2Count > this.currentRow);
    }
    this.refresh();
  }

  /** `ResetData` (:24764-24798): every row emptied and let go, the results cleared; the target stays. */
  private resetData(): void {
    for (const row of this.rows) {
      for (const key of ['material', 'scroll1', 'scroll2'] as const) if (row[key] !== null) this.host.reserve(row[key]!, false);
    }
    this.resetRows();
  }

  private resetRows(): void {
    this.rows = Array.from({ length: SMELT_MAX }, () => ({ material: null, scroll1: null, scroll2: null, result: null }));
    this.materialCount = this.scroll1Count = this.scroll2Count = this.currentRow = 0;
  }

  /** `DisableScroll2` (:24740-24762): from +7 (or an Ultimate) the smelting scrolls go back. */
  private disableScroll2(): void {
    if (this.mode !== 'normal' || (this.currentValue() < SCROLL2_LEVEL && !this.isUltimate())) return;
    for (const row of this.rows) {
      if (row.scroll2 !== null) this.host.reserve(row.scroll2, false);
      row.scroll2 = null;
    }
    this.scroll2Count = 0;
  }

  /** `RefreshValidSmeltCounter` (:24716-24729): the rows that may still go, up to the goal. */
  private validCount(): number {
    const valid = Math.min(this.materialCount, this.scroll1Count) - this.currentRow;
    return Math.max(0, Math.min(valid, Math.max(this.goal - this.currentValue(), 0)));
  }

  private targetProp(): WebItemProp | undefined {
    const item = this.target === null ? undefined : this.host.own()?.inventory?.get(this.target);
    return item && this.host.props.get(item.itemId);
  }

  private isUltimate(): boolean {
    return this.targetProp()?.referStat1 === WEAPON_ULTIMATE;
  }

  /** `GetNowSmeltValue` (:25176-25195): the +N, or the sockets in Safe Piercing. */
  private currentValue(): number {
    const item = this.target === null ? undefined : this.host.own()?.inventory?.get(this.target);
    if (item === undefined) return 0;
    return this.mode === 'piercing' ? item.piercing?.length ?? 0 : item.abilityOption ?? 0;
  }

  /** `GetDefaultMaxSmeltValue` (:25197-25234): 10, 20 for an accessory, 4 sockets for a suit. */
  private defaultMax(): number {
    if (this.mode === 'accessory') return 20;
    if (this.mode === 'piercing') return this.targetProp()?.kind3 === IK3_SUIT ? MAX_PIERCING_SUIT : MAX_PIERCING_WEAPON;
    return 10;
  }

  private acceptsTarget(prop: WebItemProp): boolean {
    if (this.mode === 'normal') return [IK2_ARMOR, IK2_WEAPON_MAGIC, IK2_WEAPON_DIRECT, IK2_ARMORETC].includes(prop.kind2);
    if (this.mode === 'accessory') return prop.kind2 === IK2_JEWELRY;
    return isPierceAble(prop, 0, false);
  }

  private isMaterial(prop: WebItemProp): boolean {
    if (this.mode === 'normal') return this.isUltimate() ? prop.id === ORICHALCUM02 : SUNSTONES.has(prop.id);
    return MOONSTONES.has(prop.id);
  }

  private isScroll1(prop: WebItemProp): boolean {
    if (this.mode === 'normal') return prop.id === (this.isUltimate() ? XPROTECT : SPROTECT);
    return prop.id === (this.mode === 'accessory' ? APROTECT : GPROTECT);
  }

  private isScroll2(prop: WebItemProp): boolean {
    return this.mode === 'normal' && prop.id === SMELTING && this.currentValue() < SCROLL2_LEVEL && !this.isUltimate();
  }

  private missing(): string {
    return this.mode === 'normal' && this.isUltimate() ? 'TID_GAME_SMELT_SAFETY_ERROR09' : MODES[this.mode].missing;
  }

  private noMaterial(): string {
    return this.mode === 'normal' && this.isUltimate() ? 'TID_GAME_SMELT_SAFETY_ERROR04' : MODES[this.mode].noMaterial;
  }

  /** The columns' fixed icons (`DrawListItem`, :24815-24961), by the mode and the target. */
  private placeholders(): { material: number | null; scroll1: number | null; scroll2: number | null } {
    if (this.mode === 'piercing') return { material: 2036, scroll1: GPROTECT, scroll2: null };
    if (this.mode === 'accessory') return { material: 2036, scroll1: APROTECT, scroll2: null };
    if (this.target === null) return { material: null, scroll1: null, scroll2: null };
    const ultimate = this.isUltimate();
    return {
      material: ultimate ? ORICHALCUM02 : 2035, scroll1: ultimate ? XPROTECT : SPROTECT,
      scroll2: !ultimate && this.currentValue() < SCROLL2_LEVEL ? SMELTING : null,
    };
  }

  /** `RefreshInformation` and `OnDraw` (:23969-24050): the target, NOW and the goal, the rows' icons and results. */
  private refresh(): void {
    const window = this.window;
    if (window === null) return;
    const target = window.control('WIDC_STATIC1').parentElement!;
    drawIcon(this.host, target, this.targetProp());
    target.title = this.targetProp()?.name ?? this.host.text('TID_GAME_TOOLTIP_SMELT_SAFETY_ITEM');
    target.toggleAttribute('data-upgrade-wait', this.running && this.timer !== null);
    window.setText('WIDC_NOW_GRADE', this.target === null ? '--' : String(this.currentValue()));
    const input = window.input('WIDC_EDIT_MAX_GRADE');
    input.disabled = this.running || this.target === null;
    const goal = this.target === null ? '' : String(this.goal);
    if (input.value !== goal && this.host.ui.doc.activeElement !== input) input.value = goal;
    const icons = this.placeholders();
    const art = this.host.ui.art;
    for (let i = 0; i < SMELT_MAX; i++) {
      const row = this.rows[i]!;
      for (const [column, key] of [['MATERIAL', 'material'], ['SCROLL1_', 'scroll1'], ['SCROLL2_', 'scroll2']] as const) {
        if (!MODES[this.mode].wide && key === 'scroll2') continue;
        const box = window.control(`${column}${i}`).parentElement!;
        const icon = icons[key];
        // rows from the current one on: the column's icon, 255 when filled, 75 when empty
        drawIcon(this.host, box, i >= this.currentRow && icon !== null ? this.host.props.get(icon) : null, row[key] === null ? 75 / 255 : 1);
        box.dataset.filled = String(row[key] !== null);
      }
      const bar = window.control(`RESULT${i}`).parentElement!;
      bar.dataset.result = row.result ?? '';
      bar.style.backgroundImage = row.result === null ? themeUrl(art, 'Window02.bmp')
        : `${themeUrl(art, row.result === 'success' ? 'SafetySuccess.bmp' : 'SafetyFailure.bmp')}, ${themeUrl(art, 'Window02.bmp')}`;
    }
  }

  /** The progress gauge over the current row's bar: SafetyGauge.bmp to trunc(168 x rate), in 4 px slices, none under 8. */
  private drawGauge(rate: number): void {
    const window = this.window;
    if (window === null) return;
    for (let i = 0; i < SMELT_MAX; i++) {
      const bar = window.control(`RESULT${i}`).parentElement!;
      let gauge = bar.querySelector<HTMLElement>('.hud-safety-gauge');
      const on = i === this.currentRow && this.running && this.resultSwitch;
      const width = on ? Math.trunc(Math.min(BAR_WIDTH, BAR_WIDTH * Math.max(0, rate)) / GAUGE_SLICE) * GAUGE_SLICE : 0;
      if (width < 2 * GAUGE_SLICE) {
        gauge?.remove();
        continue;
      }
      if (gauge === null) {
        gauge = this.host.ui.doc.createElement('div');
        gauge.className = 'hud-safety-gauge';
        gauge.style.setProperty('--hud-safety-gauge', themeUrl(this.host.ui.art, 'SafetyGauge.bmp'));
        bar.append(gauge);
      }
      gauge.style.width = `${width}px`;
    }
  }
}
