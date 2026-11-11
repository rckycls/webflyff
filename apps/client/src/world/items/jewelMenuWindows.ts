// The rest of the jewel menu (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md §3): Peach's
// Create Shining Oricalkum, the Upgrade Specialist's Create Unique / Ultimate Weapon and Remove Jewel, as Neuz runs them.
//
//   Window                   Neuz (_Interface/WndField.cpp)                 sends
//   APP_SMELT_MIXJEWEL       CWndMixJewel :19069-19533, its confirm :19536  ULTIMATE_MAKEITEM 0xf000f110 (ten ids)
//   APP_SMELT_CHANGEWEAPON   CWndChangeWeapon :20472-20900                  ULTIMATE_TRANSWEAPON 0xf000f112
//   APP_SMELT_REMOVE_JEWEL   CWndRemoveJewel :22397-22812                   ULTIMATE_REMOVEGEM 0xf000f115, then closes
//
// The answers come in ULTIMATE 0x0100 (`OnUltimateWeapon`, Neuz/DPClient.cpp:11522-11594).

import type { WebItemProp } from '@flyffweb/formats';
import { UltimateResult, UltimateState } from '@flyffweb/protocol';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import { dstTid } from './itemTooltip';
import {
  NpcWindow, drawSlotIcon, freeOf, onSlotPress, propOf, setDescription, slotBox, takeDrops,
} from './npcWindowKit';
import type { BagPress, NpcWindowHost } from './npcWindowKit';
import { gemKind } from './ultimateRules';

const SLOT = 'WndChgElemItem.bmp';
const EDIT = 'WndEditTile00.tga';
/** Sunstone (ORICHALCUM01, its event one), Moonstone (and its event one), Shining Oricalkum (ORICHALCUM02). */
const SUNSTONES: ReadonlySet<number> = new Set([2035, 2082]);
const MOONSTONES: ReadonlySet<number> = new Set([2036, 2083]);
const SUNSTONE = 2035;
const MOONSTONE = 2036;
const ORICHALCUM02 = 2034;
/** The five jewels (II_GEN_MAT_DIAMOND .. TOPAZ). */
const JEWELS: ReadonlySet<number> = new Set([2029, 2030, 2031, 2032, 2033]);
/** IK1_WEAPON; IK2_WEAPON_DIRECT, _MAGIC; IK2_MATERIAL. `WEAPON_GENERAL`, `_UNIQUE`, `_ULTIMATE` (`dwReferStat1`). */
const IK1_WEAPON = 1;
const IK2_WEAPON_DIRECT = 2;
const IK2_WEAPON_MAGIC = 3;
const IK2_MATERIAL = 17;
const WEAPON_GENERAL = 0;
const WEAPON_UNIQUE = 1;
const WEAPON_ULTIMATE = 2;
/** The ghost of an empty slot (`OnDraw`'s alpha 50). */
const GHOST = 50 / 255;
const button = (id: string, rect: ResControl['rect'], picture = 'ButtStart.bmp', label = 'Start', quarter = 64): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });
const slot = (id: string, rect: ResControl['rect']): ResControl => ({ kind: 'static', id, rect, picture: SLOT });

// ---- Create Shining Oricalkum --------------------------------------------------------------------------------------

const MIX_SLOTS = Array.from({ length: 10 }, (_, i) => `WIDC_PIC_SLOT${i + 1}`);
const MIX_X = [26, 74, 122, 170, 218];

/** APP_SMELT_MIXJEWEL (resdata.inc:8420-8539): the Sunstones' row, the Moonstones' row, the description, START. */
export const MIX_JEWEL: ResLayout = {
  title: 'Sunstone & Moonstone Use.', width: 288, height: 288,
  controls: [
    ...MIX_SLOTS.map((id, i) => slot(id, [MIX_X[i % 5]!, i < 5 ? 24 : 72, MIX_X[i % 5]! + 32, i < 5 ? 56 : 104] as const)),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 118, 272, 206], tile: EDIT, scroll: true },
    button('WIDC_START', [106, 220, 170, 240]),
  ],
};

/** APP_SMELT_MIXJEWEL_CONFIRM (resdata.inc:8381-8419). */
export const MIX_JEWEL_CONFIRM: ResLayout = {
  title: 'Confirm Composing', width: 272, height: 176,
  controls: [
    slot('WIDC_PIC_SLOT', [114, 24, 146, 56]),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [24, 68, 244, 92], tile: EDIT },
    button('WIDC_OK', [98, 106, 170, 126], 'ButOk2.bmp', 'OK', 72),
  ],
};

/** CWndMixJewel: five Sunstones and five Moonstones; START makes a Shining Oricalkum. */
export class MixJewelWindow extends NpcWindow {
  /** `m_MatJewel`: each slot's bag item. */
  private slots: Array<number | null> = Array(10).fill(null);
  /** `m_bStart`: START sent, not answered. */
  private sent = false;
  private confirm: ResWindow | null = null;

  protected layout(): ResLayout { return MIX_JEWEL; }
  protected className(): string { return 'hud-mix-jewel'; }
  protected opensBag(): boolean { return true; }

  /** The slots' object ids, for the tests. */
  get state(): { slots: ReadonlyArray<number | null>; sent: boolean } {
    return { slots: [...this.slots], sent: this.sent };
  }

  /** OnInitialUpdate (:19195-19212): the bag's die flag, the description. */
  protected opening(window: ResWindow): void {
    this.host.dieFlag(true);
    setDescription(window, 'WIDC_TEXT1', this.host.ui.doc, this.host.ultimate()?.descriptions.mixJewel);
  }

  protected closing(): void {
    this.host.dieFlag(false);
    this.confirm?.close();
  }

  /** The bag's double-click (:2241-2253): a stone with a free piece to its row's first empty slot, else refused. */
  take(objectId: number): BagPress {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || (!SUNSTONES.has(prop.id) && !MOONSTONES.has(prop.id)) || freeOf(this.host, objectId) <= 0) return 'refused';
    this.fill(objectId, SUNSTONES.has(prop.id) ? 0 : 5, false);
    return 'taken';
  }

  /** `OnDropIcon` (:19277-19312): an empty slot takes its row's stone (with Shift the row's every empty slot). */
  drop(slotIndex: number, objectId: number, shift: boolean): void {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || this.slots[slotIndex] !== null || this.sent) return;
    const row = slotIndex < 5 ? SUNSTONES : MOONSTONES;
    if (!row.has(prop.id)) return;
    if (freeOf(this.host, objectId) <= 0) {
      this.host.alert(this.host.text('TID_GAME_SUMMONANGEL_ERROR1'));
      return;
    }
    if (shift) this.fill(objectId, slotIndex < 5 ? 0 : 5, true);
    else this.put(slotIndex, objectId);
    this.draw();
  }

  /** START (:19413-19469): ULTIMATE_MAKEITEM with the ten slots, disabled until the answer. */
  start(): void {
    if (this.sent || this.slots.some((id) => id === null)) return;
    this.sent = true;
    this.draw();
    this.host.send({ type: 'makeItem', itemIds: this.slots as number[] });
  }

  /** `ReceiveResult` (:19487-19519): the slots emptied; success the confirm, failure and cancel close, a full bag says so. */
  onResult(result: number): void {
    if (!this.isOpen) return;
    this.reset();
    if (result === UltimateResult.SUCCESS) this.openConfirm();
    else if (result === UltimateResult.FAILED || result === UltimateResult.CANCEL) this.close();
    else if (result === UltimateResult.INVENTORY) this.host.alert(this.host.text('TID_GAME_EXTRACTION_ERROR'));
    this.draw();
  }

  protected wire(window: ResWindow): void {
    MIX_SLOTS.forEach((id, i) => {
      const box = slotBox(window, id);
      box.dataset.slot = String(i);
      takeDrops(box, (objectId, shift) => this.drop(i, objectId, shift));
      // a double-click empties a slot (:19257-19271)
      onSlotPress(this.host, box, () => {
        if (this.slots[i] === null || this.sent) return;
        this.put(i, null);
        this.draw();
      });
    });
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    for (let i = 0; i < 10; i++) this.put(i, null);
    this.sent = false;
  }

  /** OnDraw (:19120-19177): each slot's stone, an empty one's ghost; START with all ten in. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    MIX_SLOTS.forEach((id, i) => {
      const box = slotBox(window, id);
      const filled = this.slots[i] ?? null;
      const prop = filled === null ? this.host.props.get(i < 5 ? SUNSTONE : MOONSTONE) : propOf(this.host, filled);
      drawSlotIcon(this.host, box, prop, filled === null ? GHOST : 1);
      box.toggleAttribute('data-filled', filled !== null);
    });
    window.button('WIDC_START').disabled = this.sent || this.slots.some((id) => id === null);
  }

  /** `SetJewel` (:19378-19409): the first empty slot of the row (`from` 0 or 5), or with Shift every one the stack fills. */
  private fill(objectId: number, from: number, all: boolean): void {
    for (let i = from; i < from + 5 && freeOf(this.host, objectId) > 0; i++) {
      if (this.slots[i] !== null) continue;
      this.put(i, objectId);
      if (!all) break;
    }
    this.draw();
  }

  private put(i: number, objectId: number | null): void {
    const old = this.slots[i] ?? null;
    if (old !== null) this.host.reserve(old, false);
    this.slots[i] = objectId;
    if (objectId !== null) this.host.reserve(objectId, true);
  }

  /** CWndMixJewelConfirm (:19536-19602): the Shining Oricalkum's icon, TID_GAME_MIXJEWEL_SUCCESS, OK. */
  private openConfirm(): void {
    if (this.confirm === null) {
      const confirm = new ResWindow(MIX_JEWEL_CONFIRM, this.host.ui.art, this.host.ui.doc);
      confirm.frame.element.classList.add('hud-jewel', 'hud-npc-item', 'hud-mix-jewel-confirm');
      confirm.button('WIDC_OK').onclick = () => confirm.close();
      this.confirm = confirm;
    }
    const confirm = this.confirm;
    const layer = this.host.ui.layer();
    if (layer !== null && confirm.element.parentElement !== layer) layer.append(confirm.element);
    drawSlotIcon(this.host, slotBox(confirm, 'WIDC_PIC_SLOT'), this.host.props.get(ORICHALCUM02));
    confirm.setText('WIDC_TEXT1', this.host.text('TID_GAME_MIXJEWEL_SUCCESS'));
    confirm.open();
  }
}

// ---- Create Unique / Ultimate Weapon -------------------------------------------------------------------------------

/** APP_SMELT_CHANGEWEAPON (resdata.inc:9371-9435): the weapon, the Shining Oricalkum, the jewel, two texts, START. */
export const CHANGE_WEAPON: ResLayout = {
  title: '', width: 224, height: 384,
  controls: [
    slot('WIDC_STATIC1', [92, 24, 124, 56]),
    slot('WIDC_STATIC2', [26, 64, 58, 96]),
    slot('WIDC_STATIC3', [154, 64, 186, 96]),
    { kind: 'text', id: 'WIDC_TEXT2', rect: [12, 108, 204, 204], tile: EDIT, scroll: true },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 216, 204, 312], tile: EDIT, scroll: true },
    button('WIDC_START', [75, 322, 139, 342]),
  ],
};
const CHANGE_SLOTS = ['WIDC_STATIC1', 'WIDC_STATIC2', 'WIDC_STATIC3'] as const;

/** Which weapon the window takes: Create Unique Weapon (54) a general one, Create Ultimate Weapon (55) a unique one. */
export type ChangeWeaponType = 'unique' | 'ultimate';

/** CWndChangeWeapon: a weapon, a Shining Oricalkum and its level's jewel; START tries the conversion. */
export class ChangeWeaponWindow extends NpcWindow {
  private type: ChangeWeaponType = 'unique';
  /** `m_pWItemElem`, `m_pJItemElem[0]` (the Shining Oricalkum), `m_pJItemElem[1]` (the jewel). */
  private slots: Array<number | null> = [null, null, null];
  /** `m_bIsSendChange`. */
  private sent = false;

  protected layout(): ResLayout { return CHANGE_WEAPON; }
  protected className(): string { return 'hud-change-weapon'; }
  protected overlapTid(): string { return 'TID_GAME_CHANGE_NOWUSING'; }
  /** Closing the bag leaves it open (WndField.cpp:1015-1075 has no case for it). */
  protected closesWithBag(): boolean { return false; }

  /** The window's type and slots, for the tests. */
  get state(): { type: ChangeWeaponType; slots: ReadonlyArray<number | null>; sent: boolean } {
    return { type: this.type, slots: [...this.slots], sent: this.sent };
  }

  /** MMI_SMELT_CHANGEGWEAPON / _CHANGEUWEAPON (WndWorld.cpp:4986-5027): `new CWndChangeWeapon( WEAPON_GENERAL / _UNIQUE )`. */
  openAs(type: ChangeWeaponType): boolean {
    if (!this.isOpen) this.type = type;
    return this.open();
  }

  /** OnInitialUpdate (:20550-20592) and `SetDescription` (:20827-20858): the title and the two texts by the type. */
  protected opening(window: ResWindow): void {
    const unique = this.type === 'unique';
    window.frame.setTitle(this.host.text(unique ? 'TID_GAME_CHANGEWEAPON_UNIQUE' : 'TID_GAME_CHANGEWEAPON_ULTIMATE'));
    const texts = this.host.ultimate()?.descriptions;
    setDescription(window, 'WIDC_TEXT1', this.host.ui.doc, unique ? texts?.changeUnique : texts?.changeUltimate);
    setDescription(window, 'WIDC_TEXT2', this.host.ui.doc, unique ? texts?.changeUniqueInfo : texts?.changeUltimateInfo);
    const tips = [unique ? 'TID_TOOLTIP_CHANGEW_GENERAL' : 'TID_TOOLTIP_CHANGEW_UNIQUE', 'TID_TOOLTIP_CHANGEW_ORICALCUM', 'TID_TOOLTIP_CHANGEW_JEWEL'];
    CHANGE_SLOTS.forEach((id, i) => { slotBox(window, id).title = this.host.text(tips[i]!); }); // OnMouseWndSurface (:20642-20679)
  }

  /**
   * The bag's double-click (:2272-2289): a weapon, the Shining Oricalkum or a jewel with a free piece goes to `SetItem`,
   * which takes it or not; any other item is used as it would be.
   */
  take(objectId: number): BagPress {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || freeOf(this.host, objectId) <= 0) return 'pass';
    if (prop.kind1 !== IK1_WEAPON && prop.id !== ORICHALCUM02 && !JEWELS.has(prop.id)) return 'pass';
    if (prop.kind1 === IK1_WEAPON) this.drop(0, objectId);
    else if (prop.id === ORICHALCUM02) this.drop(1, objectId);
    else this.drop(2, objectId);
    return 'taken';
  }

  /** `OnDropIcon` (:20681-20745), `SetItem` (:20747-20792): each slot's item, into an empty slot; others are ignored. */
  drop(slotIndex: number, objectId: number): void {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || this.sent || this.slots[slotIndex] !== null || freeOf(this.host, objectId) <= 0) return;
    if (slotIndex === 0 && !this.weaponFits(objectId, prop)) return;
    if (slotIndex === 1 && prop.id !== ORICHALCUM02) return;
    if (slotIndex === 2) {
      const weapon = propOf(this.host, this.slots[0] ?? null);
      if (weapon === undefined || prop.id !== gemKind(weapon.limitLevel ?? 0, this.host.ultimate())) return;
    }
    this.put(slotIndex, objectId);
    this.draw();
  }

  /** START (:20810-20825): disabled, TRANSWEAPON with the weapon, the jewel, the Shining Oricalkum. */
  start(): void {
    const [weapon, orichalcum, jewel] = this.slots;
    if (this.sent || weapon == null || orichalcum == null || jewel == null) return;
    this.sent = true;
    this.draw();
    this.host.send({ type: 'transWeapon', weaponId: weapon, gem1Id: jewel, gem2Id: orichalcum });
  }

  /** `ReceiveResult` (:20860-20900): the boxes; cancel closes; every slot emptied after. */
  onResult(result: number): void {
    if (!this.isOpen) return;
    const ultimate = this.type === 'ultimate';
    if (result === UltimateResult.CANCEL) {
      this.close();
      return;
    }
    if (result === UltimateResult.SUCCESS) this.host.alert(this.host.text(ultimate ? 'TID_GAME_CUWEAPON_SUCCESS' : 'TID_GAME_CGWEAPON_SUCCESS'));
    else if (result === UltimateResult.FAILED) this.host.alert(this.host.text(ultimate ? 'TID_GAME_CUWEAPON_FAILED' : 'TID_GAME_CGWEAPON_FAILED'));
    else if (result === UltimateResult.INVENTORY) this.host.alert(this.host.text('TID_GAME_EXTRACTION_ERROR'));
    this.reset();
    this.draw();
  }

  protected wire(window: ResWindow): void {
    CHANGE_SLOTS.forEach((id, i) => {
      const box = slotBox(window, id);
      box.dataset.slot = String(i);
      takeDrops(box, (objectId) => this.drop(i, objectId));
      // a double-click empties a slot (:20614-20640)
      onSlotPress(this.host, box, () => {
        if (this.slots[i] === null || this.sent) return;
        this.put(i, null);
        this.draw();
      });
    });
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    for (let i = 0; i < 3; i++) this.put(i, null);
    this.sent = false;
  }

  /** OnDraw (:20508-20548): the filled slots' icons; START (`Process` :20794-20808) with all three in and nothing sent. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    CHANGE_SLOTS.forEach((id, i) => {
      const box = slotBox(window, id);
      drawSlotIcon(this.host, box, propOf(this.host, this.slots[i] ?? null));
      box.toggleAttribute('data-filled', this.slots[i] !== null);
    });
    window.button('WIDC_START').disabled = this.sent || this.slots.some((id) => id === null);
  }

  /** A weapon of level 60+ of the window's kind; Create Ultimate Weapon's at +10 or more (:20689-20717). */
  private weaponFits(objectId: number, prop: WebItemProp): boolean {
    const stat = this.type === 'unique' ? WEAPON_GENERAL : WEAPON_UNIQUE;
    if (prop.kind1 !== IK1_WEAPON || (prop.limitLevel ?? 0) < 60 || (prop.referStat1 ?? WEAPON_GENERAL) !== stat) return false;
    return this.type === 'unique' || (this.host.own()?.inventory?.get(objectId)?.abilityOption ?? 0) >= 10;
  }

  private put(i: number, objectId: number | null): void {
    const old = this.slots[i] ?? null;
    if (old !== null) this.host.reserve(old, false);
    this.slots[i] = objectId;
    if (objectId !== null) this.host.reserve(objectId, true);
  }
}

// ---- Remove Jewel --------------------------------------------------------------------------------------------------

const JEWEL_TOPS = [100, 136, 172, 206, 240];
/** APP_SMELT_REMOVE_JEWEL (resdata.inc:22458-22592). */
export const REMOVE_JEWEL: ResLayout = {
  title: 'Remove Jewel from Ultimate Weapon', width: 272, height: 432,
  controls: [
    slot('WIDC_PIC_SLOT', [114, 18, 146, 50]),
    slot('WIDC_PIC_SLOT1', [114, 56, 146, 88]),
    ...JEWEL_TOPS.flatMap((top, i): ResControl[] => [
      slot(`WIDC_JEWEL_SLOT${i + 1}`, [22, top, 54, top + 32]),
      { kind: 'static', id: `WIDC_JEWEL_SLOT_INFO${i + 1}`, rect: [68, top, 236, top + 32], picture: 'Window02.bmp' },
    ]),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 282, 258, 358], tile: EDIT, scroll: true },
    button('WIDC_START', [98, 364, 162, 384]),
  ],
};

/**
 * The ability jewels' families (OnDraw :22478-22522), DIAMOND01..TOPAZ01 (2037-2041) the first, each next five ids on:
 * the stat's TID and its colour (`dwAddedOpt1..9`, WndManager.cpp:575-583).
 */
const JEWEL_FAMILIES: ReadonlyArray<{ tid: string; color: string }> = [
  { tid: 'TID_TOOLTIP_DST_HP_MAX', color: 'rgb(127, 255, 0)' },
  { tid: 'TID_TOOLTIP_DST_ATKPOWER', color: 'rgb(0, 255, 255)' },
  { tid: 'TID_TOOLTIP_DST_ADJDEF', color: 'rgb(140, 23, 23)' },
  { tid: 'TID_TOOLTIP_DST_MELEE_STEALHP', color: 'rgb(255, 127, 0)' },
  { tid: 'TID_TOOLTIP_DST_PVP_DMG', color: 'rgb(255, 110, 199)' },
  { tid: 'TID_TOOLTIP_STR', color: 'rgb(205, 127, 50)' },
  { tid: 'TID_TOOLTIP_STA', color: 'rgb(255, 0, 0)' },
  { tid: 'TID_TOOLTIP_DEX', color: 'rgb(50, 50, 255)' },
  { tid: 'TID_TOOLTIP_INT', color: 'rgb(147, 112, 219)' },
];
const FIRST_ABILITY_JEWEL = 2037;

/** CWndRemoveJewel: an Ultimate weapon and a Moonstone; START removes the last jewel set, and the window closes. */
export class RemoveJewelWindow extends NpcWindow {
  private weapon: number | null = null;
  private moonstone: number | null = null;

  protected layout(): ResLayout { return REMOVE_JEWEL; }
  protected className(): string { return 'hud-remove-jewel'; }

  get state(): { weapon: number | null; moonstone: number | null } {
    return { weapon: this.weapon, moonstone: this.moonstone };
  }

  /** OnInitialUpdate (:22531-22563): the description and the slots' hover texts (:22621-22654). */
  protected opening(window: ResWindow): void {
    setDescription(window, 'WIDC_TEXT1', this.host.ui.doc, this.host.ultimate()?.descriptions.removeJewel);
    slotBox(window, 'WIDC_PIC_SLOT').title = this.host.text('TID_GAME_TOOLTIP_REMOVEJEWEL1');
    slotBox(window, 'WIDC_PIC_SLOT1').title = this.host.text('TID_GAME_TOOLTIP_REMOVEJEWEL2');
    for (let i = 1; i <= 5; i++) {
      slotBox(window, `WIDC_JEWEL_SLOT${i}`).title = slotBox(window, `WIDC_JEWEL_SLOT_INFO${i}`).title =
        this.host.text('TID_GAME_TOOLTIP_REMOVEJEWEL3');
    }
  }

  /** The bag's double-click (:2189-2202): an Ultimate weapon or a material not held goes to `SetItem`; others are used. */
  take(objectId: number): BagPress {
    const prop = propOf(this.host, objectId);
    if (prop === undefined || this.host.reserved(objectId) > 0) return 'pass';
    if (prop.referStat1 !== WEAPON_ULTIMATE && prop.kind2 !== IK2_MATERIAL) return 'pass';
    this.setItem(objectId);
    return 'taken';
  }

  /** `SetItem` (:22722-22767): a material to the empty Moonstone slot, else the weapon to the empty weapon slot. */
  setItem(objectId: number): void {
    const prop = propOf(this.host, objectId);
    if (prop === undefined) return;
    if (this.moonstone === null && prop.kind2 === IK2_MATERIAL) this.setMoonstone(objectId, prop);
    else if (this.weapon === null) this.setWeapon(objectId, prop);
    this.draw();
  }

  /** START (:22769-22785): REMOVEGEM, and the window closes without waiting. */
  start(): void {
    if (this.weapon === null || this.moonstone === null) return;
    this.host.send({ type: 'removeGem', weaponId: this.weapon, gemId: this.moonstone });
    this.close();
  }

  protected wire(window: ResWindow): void {
    const weaponBox = slotBox(window, 'WIDC_PIC_SLOT'), moonBox = slotBox(window, 'WIDC_PIC_SLOT1');
    weaponBox.dataset.slot = '0';
    moonBox.dataset.slot = '1';
    // a drop on each slot (:22656-22720)
    takeDrops(weaponBox, (objectId) => {
      const prop = propOf(this.host, objectId);
      if (prop !== undefined && this.weapon === null && this.host.reserved(objectId) === 0) this.setWeapon(objectId, prop);
      this.draw();
    });
    takeDrops(moonBox, (objectId) => {
      const prop = propOf(this.host, objectId);
      if (prop !== undefined && this.moonstone === null && this.host.reserved(objectId) === 0) this.setMoonstone(objectId, prop);
      this.draw();
    });
    // a double-click empties a slot (:22585-22619)
    onSlotPress(this.host, weaponBox, () => { this.letGo('weapon'); this.draw(); });
    onSlotPress(this.host, moonBox, () => { this.letGo('moonstone'); this.draw(); });
    window.button('WIDC_START').onclick = () => this.start();
  }

  protected reset(): void {
    this.letGo('weapon');
    this.letGo('moonstone');
  }

  /** OnDraw (:22432-22529): the weapon, the Moonstone (a ghost when empty), each set jewel and its stat's name in its colour. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const weaponBox = slotBox(window, 'WIDC_PIC_SLOT'), moonBox = slotBox(window, 'WIDC_PIC_SLOT1');
    drawSlotIcon(this.host, weaponBox, propOf(this.host, this.weapon));
    weaponBox.toggleAttribute('data-filled', this.weapon !== null);
    drawSlotIcon(this.host, moonBox, this.moonstone === null ? this.host.props.get(MOONSTONE) : propOf(this.host, this.moonstone),
      this.moonstone === null ? GHOST : 1);
    moonBox.toggleAttribute('data-filled', this.moonstone !== null);
    const sockets = this.weapon === null ? [] : this.host.own()?.inventory?.get(this.weapon)?.ultimate ?? [];
    for (let i = 0; i < 5; i++) {
      const jewel = sockets[i] ?? 0;
      const box = slotBox(window, `WIDC_JEWEL_SLOT${i + 1}`);
      drawSlotIcon(this.host, box, jewel === 0 ? undefined : this.host.props.get(jewel));
      const info = window.control(`WIDC_JEWEL_SLOT_INFO${i + 1}`);
      const family = jewel === 0 ? undefined : JEWEL_FAMILIES[Math.trunc((jewel - FIRST_ABILITY_JEWEL) / 5)];
      info.textContent = family === undefined ? '' : this.statName(jewel, family.tid);
      info.style.color = family?.color ?? '';
      info.classList.add('hud-remove-jewel-stat');
    }
    window.button('WIDC_START').disabled = this.weapon === null || this.moonstone === null;
  }

  /** The family's name; the three the English text file has as "#NAME?" (textClient.txt.txt:1786-1788) by its DST. */
  private statName(jewel: number, tid: string): string {
    const text = this.host.text(tid);
    if (text !== '' && text !== '#NAME?') return text;
    const dst = this.host.ultimate()?.abilities.find((block) => block.jewels.some((row) => row.ability === jewel))?.dst;
    const byDst = dst === undefined ? undefined : dstTid(dst);
    return byDst === undefined ? text : this.host.text(byDst);
  }

  private setMoonstone(objectId: number, prop: WebItemProp): void {
    if (!MOONSTONES.has(prop.id)) {
      this.host.say('TID_GAME_REMOVE_JEWEL_ERROR1');
      return;
    }
    this.moonstone = objectId;
    this.host.reserve(objectId, true);
  }

  private setWeapon(objectId: number, prop: WebItemProp): void {
    const sockets = this.host.own()?.inventory?.get(objectId)?.ultimate?.length ?? 0;
    if ((prop.kind2 !== IK2_WEAPON_DIRECT && prop.kind2 !== IK2_WEAPON_MAGIC) || prop.referStat1 !== WEAPON_ULTIMATE || sockets <= 0) {
      this.host.say('TID_GAME_REMOVE_JEWEL_ERROR2');
      return;
    }
    this.weapon = objectId;
    this.host.reserve(objectId, true);
  }

  private letGo(which: 'weapon' | 'moonstone'): void {
    const id = this[which];
    if (id !== null) this.host.reserve(id, false);
    this[which] = null;
  }
}

/** The three windows, as the world screen holds them, with their answers. */
export class JewelMenuWindows {
  readonly mix: MixJewelWindow;
  readonly change: ChangeWeaponWindow;
  readonly removeJewel: RemoveJewelWindow;

  constructor(host: NpcWindowHost) {
    this.mix = new MixJewelWindow(host);
    this.change = new ChangeWeaponWindow(host);
    this.removeJewel = new RemoveJewelWindow(host);
  }

  get all(): NpcWindow[] {
    return [this.mix, this.change, this.removeJewel];
  }

  /** ULTIMATE: MAKEITEM to Create Shining Oricalkum, TRANSWEAPON to the weapon change; REMOVEGEM's is read and ignored. */
  onUltimate(message: { state: number; result: number }): void {
    if (message.state === UltimateState.MAKEITEM) this.mix.onResult(message.result);
    else if (message.state === UltimateState.TRANSWEAPON) this.change.onResult(message.result);
  }
}
