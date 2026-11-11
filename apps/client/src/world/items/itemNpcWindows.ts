// The item NPC windows as the world screen holds them (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md):
// the rest of the jewel menu, the Upgrade Specialist's removals, the Repair window and the GM's ResistItem window; the bag's
// presses go to the open one, and the moves, the bag's close and the answers to each.

import type { WebPiercingAvail } from '@flyffweb/formats';
import { JewelMenuWindows } from './jewelMenuWindows';
import type { BagPress, NpcWindow, NpcWindowHost } from './npcWindowKit';
import { RemoveAttributeWindow, RemovePiercingWindow } from './removalWindows';
import { RepairWindow } from './repairWindow';
import type { RepairBusy } from './repairWindow';
import { ResistItemWindow } from './resistItemWindow';

export class ItemNpcWindows {
  readonly jewels: JewelMenuWindows;
  readonly removeAttribute: RemoveAttributeWindow;
  readonly removePiercing: RemovePiercingWindow;
  readonly repair: RepairWindow;
  readonly resistItem: ResistItemWindow;

  constructor(host: NpcWindowHost, extra: { cards: () => ReadonlyMap<number, WebPiercingAvail['params']>; repairBusy: RepairBusy }) {
    this.jewels = new JewelMenuWindows(host);
    this.removeAttribute = new RemoveAttributeWindow(host);
    this.removePiercing = new RemovePiercingWindow(host, extra.cards);
    this.repair = new RepairWindow(host, extra.repairBusy);
    this.resistItem = new ResistItemWindow(host);
  }

  get all(): NpcWindow[] {
    return [...this.jewels.all, this.removeAttribute, this.removePiercing, this.repair, this.resistItem];
  }

  get isOpen(): boolean {
    return this.all.some((window) => window.isOpen);
  }

  /** The bag's double-click while one is open: what the open one makes of it ('pass' with none). */
  take(objectId: number, shift = false): BagPress {
    return this.all.find((window) => window.isOpen)?.take(objectId, shift) ?? 'pass';
  }

  /** A phone's tap on a bag item while one is open. */
  tapItem(objectId: number): BagPress {
    return this.all.find((window) => window.isOpen)?.tapItem(objectId) ?? 'pass';
  }

  /** The player moved: each closes (WndWorld.cpp:8052-8496). */
  dismiss(): void {
    for (const window of this.all) window.dismiss();
  }

  /** The bag closed: the ones it closes (WndField.cpp:1015-1075). */
  bagClosed(): void {
    for (const window of this.all) window.bagClosed();
  }

  close(): void {
    for (const window of this.all) window.close();
  }

  onUltimate(message: { state: number; result: number }): void {
    this.jewels.onUltimate(message);
  }
}
