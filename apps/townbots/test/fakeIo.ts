// A bot's world as the roles see it, made of plain fields a test sets: no server, no rules steps.
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { PlaceBook } from '../src/roles/places';
import type { FarmControl, RoleIo } from '../src/roles/types';
import type { Role } from '../src/settings';

export interface FakeIo extends RoleIo {
  t: number;
  pos: Vec3;
  isDead: boolean;
  isCombat: boolean;
  /** The region's held places: this bot is `me` in it. */
  places: PlaceBook;
  dest: Vec3 | null;
  items: Map<number, InventoryItem>;
  calls: string[];
  dropped: Role[];
  playersNear: boolean;
  /** Walks arrive at once unless `stuck`. */
  stuck: boolean;
}

export function fakeIo(random: () => number = () => 0.5): FakeIo {
  const io: FakeIo = {
    t: 0, pos: [0, 0, 0], isDead: false, isCombat: false, places: new PlaceBook(), dest: null, items: new Map(), calls: [], dropped: [],
    playersNear: false, stuck: false,
    now: () => io.t,
    random,
    position: () => io.pos,
    worldId: () => 1,
    dead: () => io.isDead,
    hpRatio: () => 1,
    walkTo: (pos) => {
      io.calls.push(`walk ${pos.join(',')}`);
      io.dest = pos;
      if (!io.stuck) io.pos = [...pos] as Vec3;
    },
    pathTo: (target) => [target],
    pickPlace: (candidates) => { io.calls.push('pick'); return io.places.take('me', candidates, random); },
    combatStance: () => { if (!io.isCombat) { io.calls.push('combat'); io.isCombat = true; } },
    peaceStance: () => { if (io.isCombat) { io.calls.push('peace'); io.isCombat = false; } },
    motion: (id) => io.calls.push(`motion ${id}`),
    revive: () => io.calls.push('revive'),
    bag: () => io.items,
    sendUpgrade: (item, material) => io.calls.push(`upgrade ${item} ${material}`),
    vendorOpen: (title) => io.calls.push(`open ${title}`),
    vendorRegister: (slot, objectId, count, cost) => io.calls.push(`register ${slot} ${objectId} ${count} ${cost}`),
    vendorClose: () => io.calls.push('close'),
    playersFightingNear: () => io.playersNear,
    onDrop: (role) => io.dropped.push(role),
    log: () => {},
  };
  return io;
}

export function item(objectId: number, itemId: number, count = 1, upgrade = 0): InventoryItem {
  return { objectId, itemId, count, abilityOption: upgrade } as unknown as InventoryItem;
}

/** Auto Play as the farm role drives it: started with some settings, then running until told to stop. */
export function fakeFarm(): FarmControl & { started: unknown[]; stops: string[]; steps: number } {
  const farm = {
    farm: 'off' as 'off' | 'running' | 'stopped',
    started: [] as unknown[], stops: [] as string[], steps: 0,
    start(settings: unknown) { farm.started.push(settings); farm.farm = 'running'; return true; },
    step() { farm.steps++; },
    stop(reason: string) { farm.stops.push(reason); farm.farm = 'stopped'; },
    fighting: () => false,
  };
  return farm;
}
