// The GM's /ResistItem window (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md §6): Neuz's
// CWndUpgradeBase (APP_TEST, _Interface/WndUpgradeBase.cpp), which `TextCmd_ResistItem` opens the first time
// (FuncTextCmd.cpp:1612-1661). With it open and an item in its first slot, the next `/ResistItem element rao ao` goes to
// the server as `/ritem objid element rao ao`, which sets the item's element, element upgrade and upgrade.
//
// Only the first slot is used: the other five belong to an upgrade Neuz never finished (its UPGRADEBASE packet's handler
// is empty, DPSrvr.cpp:3851-3853), and OK, which needs the second slot, does nothing.

import type { ResControl, ResLayout } from '../hud/resWindow';
import type { ResWindow } from '../hud/resWindow';
import { NpcWindow, drawSlotIcon, propOf, slotBox, takeDrops } from './npcWindowKit';
import type { BagPress } from './npcWindowKit';

const label = (id: string, rect: ResControl['rect'], text = ''): ResControl => ({ kind: 'static', id, rect, text });
const custom = (id: string, rect: ResControl['rect']): ResControl => ({ kind: 'custom', id, rect });

/** APP_TEST (resdata.inc:11414-11577): WndUpgradeBase.tga, 240 x 280; the item is WIDC_CUSTOM3 (`m_Rect[0]`, :93-105). */
export const UPGRADE_BASE: ResLayout = {
  title: 'Upgrade', width: 240, height: 280, texture: 'WndUpgradeBase.tga',
  controls: [
    label('WIDC_STATIC1', [10, 22, 62, 42], 'Item'),
    custom('WIDC_CUSTOM3', [74, 24, 106, 56]),
    label('WIDC_STATIC8', [112, 20, 162, 40], 'Penya Needed'),
    label('WIDC_STATIC5', [114, 40, 194, 58]),
    label('WIDC_STATIC2', [8, 62, 76, 82], 'Upgrade Material'),
    custom('WIDC_CUSTOM4', [74, 62, 106, 94]),
    label('WIDC_STATIC3', [8, 110, 68, 132], 'Supplement Item'),
    custom('WIDC_CUSTOM1', [74, 110, 106, 142]),
    custom('WIDC_CUSTOM5', [120, 110, 152, 142]),
    label('WIDC_STATIC10', [156, 110, 224, 128]),
    label('WIDC_STATIC6', [156, 124, 214, 142]),
    custom('WIDC_CUSTOM2', [74, 150, 106, 182]),
    custom('WIDC_CUSTOM6', [120, 150, 152, 182]),
    label('WIDC_STATIC11', [154, 152, 208, 170]),
    label('WIDC_STATIC4', [156, 164, 214, 186]),
    { kind: 'button', id: 'WIDC_OK', rect: [32, 210, 106, 232], picture: 'ButOk2.bmp', label: 'OK', quarter: 72 },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [124, 210, 196, 230], picture: 'ButCancel2.bmp', label: 'Cancel', quarter: 72 },
  ],
};
/** IK2_WEAPON_DIRECT 2, _MAGIC 3, IK2_ARMOR 7, _ARMORETC 8: what the first slot takes (:195-202). */
const TAKES: ReadonlySet<number> = new Set([2, 3, 7, 8]);

/** CWndUpgradeBase, as /ResistItem uses it. */
export class ResistItemWindow extends NpcWindow {
  /** `m_pItemElem[0]`. */
  private item: number | null = null;

  protected layout(): ResLayout { return UPGRADE_BASE; }
  protected className(): string { return 'hud-resist-item'; }
  protected opensBag(): boolean { return true; }
  protected placement(window: ResWindow): { x: number; y: number } | 'center' { return this.besideBag(window); }

  /** The first slot's object id, which `/ResistItem` reads (FuncTextCmd.cpp:1643-1647). */
  get slot(): number | null {
    return this.isOpen ? this.item : null;
  }

  /** No double-click goes in it: the bag uses the item as it would. */
  take(): BagPress {
    return 'pass';
  }

  /** A phone's tap: into the first slot, as a drop there. */
  tapItem(objectId: number): BagPress {
    this.drop(objectId);
    return 'taken';
  }

  /** `OnDropIcon` on `m_Rect[0]` (:159-202): an empty slot takes armour or a weapon not worn and with no premium element. */
  drop(objectId: number): void {
    const own = this.host.own(), item = own?.inventory?.get(objectId), prop = propOf(this.host, objectId);
    if (own === undefined || item === undefined || prop === undefined || this.item !== null) return;
    if (own.equipmentObjectIds.includes(objectId)) {
      this.host.say('TID_GAME_EQUIPPUT');
      return;
    }
    if ((item.resistSMItemId ?? 0) !== 0) {
      this.host.alert(this.host.text('TID_GAME_NOTUPGRADE'));
      return;
    }
    if (!TAKES.has(prop.kind2)) return;
    this.item = objectId;
    this.host.reserve(objectId, true);
    this.draw();
  }

  protected wire(window: ResWindow): void {
    const box = slotBox(window, 'WIDC_CUSTOM3');
    box.dataset.slot = '0';
    takeDrops(box, (objectId) => this.drop(objectId));
    // a right click on the item's slot empties every slot (OnRButtonUp :632-717); a phone taps it
    const empty = (): void => { this.letGo(); this.draw(); };
    box.addEventListener('contextmenu', (event) => { event.preventDefault(); empty(); });
    box.addEventListener('click', () => { if (this.host.mobile()) empty(); });
    window.button('WIDC_CANCEL').onclick = () => window.close();
    // OK needs the second slot, never filled here (:533-545): nothing
    window.button('WIDC_OK').onclick = () => {};
  }

  protected reset(): void {
    this.letGo();
  }

  /** OnDraw (:38-67): the item's icon. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const box = slotBox(window, 'WIDC_CUSTOM3');
    const prop = propOf(this.host, this.item);
    drawSlotIcon(this.host, box, prop);
    box.title = prop?.name ?? '';
    box.toggleAttribute('data-filled', prop !== undefined);
  }

  private letGo(): void {
    if (this.item !== null) this.host.reserve(this.item, false);
    this.item = null;
  }
}

/**
 * The client half of /ResistItem (FuncTextCmd.cpp:1612-1661): the window opened when closed (nothing sent); open, the line
 * `/ritem objid element rao ao` with the first slot's item, or nothing for a wrong word or an empty slot. `args` are the
 * words after the command; a missing one reads 0 (`GetNumber`).
 */
export function resistItemLine(args: string, slot: number | null | undefined): { open: true } | { send: string } | null {
  if (slot === undefined) return { open: true };
  const words = args.trim().split(/\s+/).filter((w) => w !== '');
  const number = (i: number): number => {
    const n = Number.parseInt(words[i] ?? '', 10);
    return Number.isNaN(n) ? 0 : n;
  };
  const element = number(0) & 0xff; // a BYTE
  let rao = number(1);
  const ao = number(2);
  if (element > 5) return null;
  if (rao < 0 || rao > 20 || ao < 0 || ao > 10) return null; // __EXT_ENCHANT (:1630)
  if (element === 0) rao = 0;
  if (slot === null) return null;
  return { send: `/ritem ${slot} ${element} ${rao} ${ao}` };
}
