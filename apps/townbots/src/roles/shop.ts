// A personal shop: on a free shop spot in town, the bot registers what it holds of the stock list, at the list's price
// (the Flaris NPC's), and opens with a friendly title. Nothing outside the list is ever sold, and nothing is bought.
// Sold out: the shop closes and the role is dropped until a refill; at the end of its time it just closes.
import type { Vec3 } from '@flyffweb/protocol';
import { TownWalk } from './route';

import type { RoleIo, RoleRunner, RoleStatus } from './types';

/** Items a bot shop shows at once. */
const MAX_SHOP_ITEMS = 8;
/** REGISTER_PVENDOR_ITEM's largest count. */
const MAX_COUNT = 32767;

export class ShopRole implements RoleRunner {
  readonly role = 'shop' as const;
  private readonly until: number;
  private walk: TownWalk | null = null;
  private open = false;
  /** The registered items' object ids. */
  private registered: number[] = [];

  constructor(
    private readonly spot: Vec3,
    private readonly stock: { shop: ReadonlyArray<{ itemId: number; price: number }>; shopTitles: readonly string[] },
    private readonly io: RoleIo,
    duration: () => number,
  ) {
    this.until = io.now() + duration();
  }

  tick(): RoleStatus {
    if (!this.open) {
      this.walk ??= new TownWalk(this.spot, this.io);
      const status = this.walk.tick();
      if (status === 'failed') {
        this.io.log('cannot reach the shop spot: another role');
        return 'done';
      }
      if (status !== 'arrived') return this.io.now() >= this.until ? 'done' : 'running';
      return this.openShop();
    }
    if (this.registered.every((id) => (this.io.bag().get(id)?.count ?? 0) <= 0)) {
      this.close();
      this.io.log('shop sold out: refill');
      this.io.onDrop('shop');
      return 'done';
    }
    if (this.io.now() >= this.until) {
      this.close();
      return 'done';
    }
    return 'running';
  }

  busy(): boolean { return false; }

  stop(): void {
    this.close();
  }

  private openShop(): RoleStatus {
    const prices = new Map(this.stock.shop.map((s) => [s.itemId, s.price]));
    const goods = [...this.io.bag().values()].filter((it) => prices.has(it.itemId) && it.count > 0).slice(0, MAX_SHOP_ITEMS);
    if (goods.length === 0 || this.stock.shopTitles.length === 0) {
      this.io.onDrop('shop');
      return 'done';
    }
    goods.forEach((it, slot) => this.io.vendorRegister(slot, it.objectId, Math.min(it.count, MAX_COUNT), prices.get(it.itemId)!));
    this.registered = goods.map((it) => it.objectId);
    const titles = this.stock.shopTitles;
    this.io.vendorOpen(titles[Math.min(titles.length - 1, Math.floor(this.io.random() * titles.length))]!);
    this.open = true;
    return 'running';
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.io.vendorClose();
  }
}
