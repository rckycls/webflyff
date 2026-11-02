import type { WebItemProp } from '@flyffweb/formats';
import type { GroundItem, Vec3 } from '@flyffweb/protocol';
import type { OwnState } from '../OwnState';
import type { WorldSession } from '../WorldSession';

type Sender = Pick<WorldSession, 'sendEquipItem' | 'sendMoveItem' | 'sendDropItem' | 'sendDestObj'>;
/** Inventory requests never mutate local state. Pickup is the native PLAYERSETDESTOBJ -> server arrival/DoLoot path. */
export class ItemActions {
  private queue: number[] = [];
  private active: { id: number; until: number } | null = null;
  constructor(private readonly own: () => OwnState | undefined, private readonly pos: () => Vec3,
    private readonly drops: () => ReadonlyMap<number, GroundItem>, private readonly props: ReadonlyMap<number, WebItemProp>,
    private readonly session: Sender, private readonly approach: (pos: Vec3) => void) {}

  equip(id: number): boolean {
    const own = this.own(), item = own?.inventory?.get(id), prop = item && this.props.get(item.itemId);
    if (!own || own.hp <= 0 || !item || item.count <= 0 || !prop || prop.part < 0 || prop.part >= 31 || prop.part === 13) return false;
    const part = own.equipmentObjectIds.indexOf(id);
    this.session.sendEquipItem(id, part < 0 ? -1 : part);
    return true;
  }
  move(source: number, destination: number): boolean {
    const own = this.own();
    if (!own || own.hp <= 0 || !Number.isInteger(source) || !Number.isInteger(destination) ||
      source < 0 || source >= 42 || destination < 0 || destination >= 42 || source === destination ||
      !own.inventory?.has(own.inventorySlots[source]!)) return false;
    this.session.sendMoveItem(source, destination); return true;
  }
  drop(id: number, count: number): boolean {
    const own = this.own(), item = own?.inventory?.get(id);
    if (!own || own.hp <= 0 || !item || !Number.isInteger(count) || count < 1 || count > Math.min(item.count, 32767) ||
      own.equipmentObjectIds.includes(id)) return false;
    this.session.sendDropItem(id, count, this.pos()); return true;
  }
  pick(id: number, now: number): boolean {
    if (!this.own() || this.own()!.hp <= 0 || !this.drops().has(id)) return false;
    this.cancel(); this.queue = [id]; this.step(now); return true;
  }
  pickNearby(now: number): void {
    if (!this.own() || this.own()!.hp <= 0) return;
    const pos = this.pos();
    this.cancel();
    this.queue = [...this.drops()].filter(([, item]) => Math.hypot(item.pos[0] - pos[0], item.pos[1] - pos[1], item.pos[2] - pos[2]) <= 5)
      .sort((a, b) => Math.hypot(a[1].pos[0] - pos[0], a[1].pos[2] - pos[2]) - Math.hypot(b[1].pos[0] - pos[0], b[1].pos[2] - pos[2]))
      .slice(0, 64).map(([id]) => id);
    this.step(now);
  }
  cancel(): void { this.queue = []; this.active = null; }
  step(now: number): void {
    if (!this.own() || this.own()!.hp <= 0) { this.cancel(); return; }
    if (this.active && this.drops().has(this.active.id) && now < this.active.until) return;
    this.active = null;
    while (this.queue.length) {
      const id = this.queue.shift()!, drop = this.drops().get(id);
      if (!drop) continue;
      this.active = { id, until: now + 6000 };
      this.approach(drop.pos);
      this.session.sendDestObj(id, 0); // CMD_SetUseItem's default range; server checks ownership, inventory space and arrival
      break;
    }
  }
}
