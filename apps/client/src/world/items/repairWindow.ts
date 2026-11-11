// The Repair window (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md §5): CWndRepairItem and its
// grid CWndRepairItemCtrl (_Interface/WndRepairItem.cpp, WndRepairItemCtrl.cpp), opened by an NPC's MMI_REPAIR
// (WndWorld.cpp:5388-5450). Worn weapons and armour dropped in add their cost; OK sends REPAIRITEM 0x00ff00b5 and the
// window stays; Cancel and the close let everything go.
//
// In V15 no NPC lists MMI_REPAIR and endurance never drops (`Abrade`, `#if __VER < 11`): only items made with an
// endurance of -1 (the GM's /ci) ever need it, and the server takes no Penya (DPSrvr.cpp:2585-2587).

import type { ResControl, ResLayout } from '../hud/resWindow';
import type { ResWindow } from '../hud/resWindow';
import { NpcWindow, drawSlotIcon, propOf, takeDrops } from './npcWindowKit';
import type { BagPress, NpcWindowHost } from './npcWindowKit';

/** `MAX_REPAIRINGITEM` (_Common/ProjectCmn.h:13): 5 x 5 cells of 32 px. */
const CELLS = 25;
const CELL = 32;
/** The grid's place (`CRect( 6, 24, 174, 192 )`, WndRepairItem.cpp:59) and an icon's in it (WndRepairItemCtrl.cpp:64). */
const GRID: ResControl['rect'] = [6, 24, 174, 192];
const ICON_X = 6;
const ICON_Y = 10;
/** IK2_WEAPON_HAND 1 .. IK2_ARMORETC 8: what can be repaired (WndRepairItem.cpp:131). */
const IK2_FIRST = 1;
const IK2_LAST = 8;
/**
 * `nMaxRepair`: propItem.txt has 180 for the gear (1628 of 1636 weapon and armour rows), which the web's catalog does not
 * carry; V15's server never raises `m_nRepair`, so the limit is never reached.
 */
const MAX_REPAIR = 180;

/** APP_REPAIR (resdata.inc:692-757). */
export const REPAIR: ResLayout = {
  title: 'Repair', width: 192, height: 304,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC2', rect: [6, 2, 106, 20], text: 'Repair List' },
    { kind: 'custom', id: 'WIDC_EDIT1', rect: [6, 30, 174, 198], tile: 'WndEditTile00.tga' },
    { kind: 'custom', id: 'WIDC_GRID', rect: GRID },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 212, 78, 232], text: 'Repair Cost' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [86, 214, 170, 230] },
    { kind: 'button', id: 'WIDC_OK', rect: [6, 242, 78, 262], picture: 'ButtOk.tga', label: 'OK', quarter: 72 },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [102, 242, 174, 262], picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 },
  ],
};

/** What may stop the window opening (WndWorld.cpp:5388-5446): the first TID that applies, or null. */
export type RepairBusy = () => string | null;

/** CWndRepairItem. */
export class RepairWindow extends NpcWindow {
  /** `m_adwIdRepair`: each cell's bag item. */
  private cells: Array<number | null> = Array(CELLS).fill(null);
  /** `m_dwCost`: the cost so far. */
  private cost = 0;

  constructor(host: NpcWindowHost, private readonly busy: RepairBusy) {
    super(host);
  }

  protected layout(): ResLayout { return REPAIR; }
  protected className(): string { return 'hud-repair'; }
  protected overlapTid(): string { return 'TID_GAME_REPAIR_STILL'; }
  protected opensBag(): boolean { return true; }
  /** The bag's close leaves it (`CWndInventory::OnDestroy` has no case for it). */
  protected closesWithBag(): boolean { return false; }
  protected placement(window: ResWindow): { x: number; y: number } | 'center' { return this.besideBag(window); }

  get state(): { cells: ReadonlyArray<number | null>; cost: number } {
    return { cells: [...this.cells], cost: this.cost };
  }

  /** MMI_REPAIR (WndWorld.cpp:5388-5450): refused while the bank, a trade, a shop, Summon Angel or a vendor is open. */
  open(): boolean {
    const refusal = this.isOpen ? null : this.busy();
    if (refusal !== null) {
      this.host.say(refusal);
      return false;
    }
    return super.open();
  }

  /** The player moved: it closes, and the bag with it (WndWorld.cpp:8325-8331). */
  dismiss(): void {
    if (!this.isOpen) return;
    this.close();
    this.host.closeBag();
  }

  /** The bag's double-click while it is open (WndField.cpp:2573-2577): TID_GAME_REPAIR_NOTUSE. */
  take(): BagPress {
    this.host.say('TID_GAME_REPAIR_NOTUSE', 'TID_GAME_TRADELIMITUSING');
    return 'taken';
  }

  /** A phone's tap on a bag item: into the first empty cell, as a drop there. */
  tapItem(objectId: number): BagPress {
    const cell = this.cells.indexOf(null);
    if (cell >= 0) this.drop(cell, objectId);
    return 'taken';
  }

  /** `OnChildNotify( WIN_ITEMDROP )` (WndRepairItem.cpp:110-207): an empty cell takes a worn item the Penya covers. */
  drop(cell: number, objectId: number): void {
    const own = this.host.own(), item = own?.inventory?.get(objectId), prop = propOf(this.host, objectId);
    if (own === undefined || item === undefined || prop === undefined || this.cells[cell] !== null) return;
    if (this.cells.includes(objectId) || this.host.reserved(objectId) > 0) return;
    if (own.equipmentObjectIds.includes(objectId)) {
      this.host.say('TID_GAME_REPAIR_EQUIP');
      return;
    }
    if (prop.kind2 < IK2_FIRST || prop.kind2 > IK2_LAST || (item.repair ?? 0) >= MAX_REPAIR) {
      this.host.say('TID_GAME_REPAIR_DONOT');
      return;
    }
    const hp = Math.max(0, item.hitPoint ?? 0), endurance = prop.endurance ?? 0;
    if (hp >= endurance) {
      this.host.say('TID_GAME_REPAIR_FULLENDURANCE');
      return;
    }
    const sum = this.cost + repairCost(hp, endurance, prop.cost ?? 0);
    if ((own.gold ?? 0) < sum) {
      this.host.say('TID_GAME_REPAIR_NOTENOUGHPENYA');
      return;
    }
    this.cost = sum;
    this.cells[cell] = objectId;
    this.host.reserve(objectId, true);
    this.draw();
  }

  /** OK (:211-214): REPAIRITEM with the items still worn (DPClient.cpp:14150-14190), or TID_GAME_REPAIR_NO. The window stays. */
  repair(): void {
    const own = this.host.own();
    const ids = this.cells.filter((id): id is number => {
      const item = id === null ? undefined : own?.inventory?.get(id);
      const prop = item && this.host.props.get(item.itemId);
      return item !== undefined && prop !== undefined && (item.hitPoint ?? 0) < (prop.endurance ?? 0) && (item.repair ?? 0) !== MAX_REPAIR;
    });
    if (ids.length === 0) this.host.say('TID_GAME_REPAIR_NO');
    else this.host.send({ type: 'repair', objectIds: ids });
  }

  protected wire(window: ResWindow): void {
    const grid = window.control('WIDC_GRID');
    for (let i = 0; i < CELLS; i++) {
      const cell = this.host.ui.doc.createElement('div');
      cell.className = 'hud-repair-cell';
      cell.dataset.slot = String(i);
      cell.style.left = `${(i % 5) * CELL + ICON_X}px`;
      cell.style.top = `${Math.trunc(i / 5) * CELL + ICON_Y}px`;
      takeDrops(cell, (objectId) => this.drop(i, objectId));
      grid.append(cell);
    }
    window.button('WIDC_OK').onclick = () => this.repair();
    window.button('WIDC_CANCEL').onclick = () => window.close();
  }

  /** `OnInit` (:229-242): every item let go, the cost 0. */
  protected reset(): void {
    for (const id of this.cells) if (id !== null) this.host.reserve(id, false);
    this.cells = Array(CELLS).fill(null);
    this.cost = 0;
  }

  /** The cells' icons (WndRepairItemCtrl.cpp:48-83) and the cost, `%-d` (:143-146). */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    window.control('WIDC_GRID').querySelectorAll<HTMLElement>('.hud-repair-cell').forEach((cell, i) => {
      const prop = propOf(this.host, this.cells[i] ?? null);
      drawSlotIcon(this.host, cell, prop);
      cell.title = prop?.name ?? '';
      cell.toggleAttribute('data-filled', prop !== undefined);
    });
    window.setText('WIDC_STATIC3', String(this.cost));
  }
}

/** One item's repair (WndRepairItem.cpp:139-140): the endurance lost in percent, times `dwCost / 1000 + 1`. */
export function repairCost(hitPoint: number, endurance: number, cost: number): number {
  const lost = 100 - Math.trunc((Math.max(0, hitPoint) * 100) / endurance);
  return lost * (Math.trunc(cost / 1000) + 1);
}
