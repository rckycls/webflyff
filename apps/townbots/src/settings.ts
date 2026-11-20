// The town bots' settings file: the gateway, the assets, the log, the role targets, the bots and what they use. The
// install script writes it on the server; nothing in this repository names the bots. Every check names the path of
// what it refused, so a broken file says where it is broken.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateCharacterName } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';

export type Group = 'rookie' | 'first' | 'veteran';
export type Role = 'farming' | 'wandering' | 'upgrading' | 'shop' | 'afk';
export const ROLES: readonly Role[] = ['farming', 'wandering', 'upgrading', 'shop', 'afk'];
const GROUPS: readonly Group[] = ['rookie', 'first', 'veteran'];
/** Each group's levels and job ids: [min level, max level, min job, max job]. */
const GROUP_RANGES: Record<Group, [number, number, number, number]> = {
  rookie: [1, 15, 0, 0], first: [16, 60, 1, 5], veteran: [61, 150, 6, 15],
};

/** The look the create screen offers: the hair's colour follows the style there. */
export interface BotLook { sex: 0 | 1; hair: number; face: number }

export interface BotSpec {
  account: string; password: string; bankPin: string; name: string; group: Group;
  level: number; job: number; look: BotLook;
}

export interface Spot {
  id: string; center: Vec3; radius: number;
  /** The monster kinds (`added.index`) the bots fight there. */
  kinds: number[];
  minLevel: number; maxLevel: number;
  /** The route (in `Places.routes`) from the town square out to the spot. */
  route: string;
}

export interface Places {
  /** Points in town the bots walk between, stand or sit at. */
  town: Vec3[];
  lodestar: Vec3;
  upgradeNpc: { pos: Vec3; npcId: string };
  shopSpots: Vec3[];
  spots: Spot[];
  /** Way points from the town square out to a spot, by name. */
  routes: Record<string, Vec3[]>;
}

export interface ItemPlan {
  potions: number[];
  upgrade: { materials: number[]; spares: number[] };
  /** What a shop may sell, at the NPC's price. */
  shop: Array<{ itemId: number; price: number }>;
  shopTitles: string[];
  /** The bots' gear: any of these in a bot's bag and not worn is put on as it enters (never a shop item). */
  gear: number[];
}

/** Setup's job changes and skill lines, by the bot's final job id. */
export interface SetupPlan { jobChains: Record<string, number[]>; skillLines: Record<string, string[]> }

export interface TownBotsSettings {
  /** The public gateway's `gateway.config.json`: the bots' own gateway takes its routes. */
  gatewayConfig: string;
  /** The bots' own gateway's port, on 127.0.0.1 only. */
  listenPort: number;
  assetsDir: string;
  logFile: string;
  roleTargets: Record<Role, number>;
  bots: BotSpec[];
  replies: string[];
  places: Places;
  items: ItemPlan;
  setup: SetupPlan;
}

const DEFAULT_PORT = 8095;
const MAX_REPLY = 100;

type Json = Record<string, unknown>;

function fail(path: string, why: string): never {
  throw new Error(`${path} ${why}`);
}

function obj(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object');
  return value as Json;
}

function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be a list');
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be some text');
  return value;
}

function int(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(path, `must be a whole number from ${min} to ${max}`);
  return value;
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a number');
  return value;
}

function vec(value: unknown, path: string): Vec3 {
  const list = arr(value, path);
  if (list.length !== 3) fail(path, 'must be [x, y, z]');
  return [num(list[0], `${path}[0]`), num(list[1], `${path}[1]`), num(list[2], `${path}[2]`)];
}

const ints = (value: unknown, path: string): number[] => arr(value, path).map((v, i) => int(v, `${path}[${i}]`, 0));
const vecs = (value: unknown, path: string): Vec3[] => arr(value, path).map((v, i) => vec(v, `${path}[${i}]`));

/** One capital letter, the rest lower case (the bots' name style). */
export function hasOneCapital(name: string): boolean {
  return (name.match(/[A-Z]/g) ?? []).length === 1;
}

function bot(value: unknown, path: string): BotSpec {
  const b = obj(value, path);
  const name = str(b.name, `${path}.name`);
  const refused = validateCharacterName(name);
  if (refused !== undefined) fail(`${path}.name`, `is refused by the game: ${refused}`);
  if (!hasOneCapital(name)) fail(`${path}.name`, 'must have exactly one capital letter');
  const group = b.group as Group;
  if (!GROUPS.includes(group)) fail(`${path}.group`, `must be one of ${GROUPS.join(', ')}`);
  // the GM /level command's own ranges (FuncTextCmd.cpp TextCmd_Level): up to 15 is a Vagrant, 16-60 a first job
  // (JOB_MERCENARY..JOB_PUPPETEER), 61 and up a second job (JOB_KNIGHT..JOB_DOPPLER)
  const [minLevel, maxLevel, minJob, maxJob] = GROUP_RANGES[group];
  const level = int(b.level, `${path}.level`, minLevel, maxLevel);
  const job = int(b.job, `${path}.job`, minJob, maxJob);
  const pin = str(b.bankPin, `${path}.bankPin`);
  if (!/^\d{4}$/.test(pin)) fail(`${path}.bankPin`, 'must be 4 digits');
  const look = obj(b.look, `${path}.look`);
  return {
    account: str(b.account, `${path}.account`).trim().toLowerCase(),
    password: str(b.password, `${path}.password`),
    bankPin: pin, name, group, level, job,
    look: { sex: int(look.sex, `${path}.look.sex`, 0, 1) as 0 | 1, hair: int(look.hair, `${path}.look.hair`, 0), face: int(look.face, `${path}.look.face`, 0) },
  };
}

function places(value: unknown, path: string): Places {
  const p = obj(value, path);
  const routesJson = obj(p.routes, `${path}.routes`);
  const routes: Record<string, Vec3[]> = {};
  for (const [name, points] of Object.entries(routesJson)) {
    routes[name] = vecs(points, `${path}.routes.${name}`);
    if (routes[name].length === 0) fail(`${path}.routes.${name}`, 'must have at least one point');
  }
  const town = vecs(p.town, `${path}.town`);
  if (town.length === 0) fail(`${path}.town`, 'must have at least one point');
  const npc = obj(p.upgradeNpc, `${path}.upgradeNpc`);
  const spots = arr(p.spots, `${path}.spots`).map((value, i): Spot => {
    const at = `${path}.spots[${i}]`;
    const s = obj(value, at);
    const route = str(s.route, `${at}.route`);
    if (!Object.hasOwn(routes, route)) fail(`${at}.route`, `names no route in ${path}.routes`);
    const minLevel = int(s.minLevel, `${at}.minLevel`, 1, 150);
    return {
      id: str(s.id, `${at}.id`), center: vec(s.center, `${at}.center`), radius: int(s.radius, `${at}.radius`, 1, 100),
      kinds: ints(s.kinds, `${at}.kinds`), minLevel, maxLevel: int(s.maxLevel, `${at}.maxLevel`, minLevel, 150), route,
    };
  });
  return {
    town, lodestar: vec(p.lodestar, `${path}.lodestar`),
    upgradeNpc: { pos: vec(npc.pos, `${path}.upgradeNpc.pos`), npcId: str(npc.npcId, `${path}.upgradeNpc.npcId`) },
    shopSpots: vecs(p.shopSpots, `${path}.shopSpots`), spots, routes,
  };
}

function items(value: unknown, path: string): ItemPlan {
  const it = obj(value, path);
  const upgrade = obj(it.upgrade, `${path}.upgrade`);
  const shop = arr(it.shop, `${path}.shop`).map((value, i) => {
    const s = obj(value, `${path}.shop[${i}]`);
    return { itemId: int(s.itemId, `${path}.shop[${i}].itemId`, 1), price: int(s.price, `${path}.shop[${i}].price`, 1) };
  });
  const gear = it.gear === undefined ? [] : ints(it.gear, `${path}.gear`);
  const spares = ints(upgrade.spares, `${path}.upgrade.spares`);
  // a worn shop item or upgrade spare would be sold or broken off the bot
  gear.forEach((id, i) => {
    if (shop.some((s) => s.itemId === id) || spares.includes(id)) fail(`${path}.gear[${i}]`, 'is also a shop item or an upgrade spare');
  });
  return {
    potions: ints(it.potions, `${path}.potions`),
    upgrade: { materials: ints(upgrade.materials, `${path}.upgrade.materials`), spares },
    shop,
    shopTitles: arr(it.shopTitles, `${path}.shopTitles`).map((v, i) => str(v, `${path}.shopTitles[${i}]`)),
    gear,
  };
}

function setup(value: unknown, path: string): SetupPlan {
  if (value === undefined) return { jobChains: {}, skillLines: {} };
  const s = obj(value, path);
  const chains = obj(s.jobChains ?? {}, `${path}.jobChains`);
  const lines = obj(s.skillLines ?? {}, `${path}.skillLines`);
  const jobChains: Record<string, number[]> = {};
  const skillLines: Record<string, string[]> = {};
  for (const [job, chain] of Object.entries(chains)) jobChains[job] = ints(chain, `${path}.jobChains.${job}`);
  for (const [job, list] of Object.entries(lines)) skillLines[job] = arr(list, `${path}.skillLines.${job}`).map((v, i) => str(v, `${path}.skillLines.${job}[${i}]`));
  return { jobChains, skillLines };
}

/** Checks a settings object; throws an `Error` that names the path of the first thing it refuses. */
export function parseSettings(json: unknown): TownBotsSettings {
  const root = obj(json, 'settings');
  const bots = arr(root.bots, 'bots').map((value, i) => bot(value, `bots[${i}]`));
  if (bots.length === 0) fail('bots', 'must list at least one bot');
  const seen = new Set<string>();
  bots.forEach((b, i) => {
    if (seen.has(b.account)) fail(`bots[${i}].account`, 'is listed twice');
    seen.add(b.account);
  });
  const targetsJson = obj(root.roleTargets, 'roleTargets');
  const roleTargets = Object.fromEntries(ROLES.map((role) => [role, int(targetsJson[role], `roleTargets.${role}`, 0)])) as Record<Role, number>;
  const total = ROLES.reduce((sum, role) => sum + roleTargets[role], 0);
  if (total > bots.length) fail('roleTargets', `add up to ${total}, more than the ${bots.length} bots`);
  const replies = arr(root.replies, 'replies').map((v, i) => str(v, `replies[${i}]`));
  if (replies.length === 0) fail('replies', 'must hold at least one line');
  replies.forEach((line, i) => { if (line.length > MAX_REPLY) fail(`replies[${i}]`, `is longer than ${MAX_REPLY} characters`); });
  return {
    gatewayConfig: str(root.gatewayConfig, 'gatewayConfig'),
    listenPort: root.listenPort === undefined ? DEFAULT_PORT : int(root.listenPort, 'listenPort', 1, 65535),
    assetsDir: str(root.assetsDir, 'assetsDir'),
    logFile: str(root.logFile, 'logFile'),
    roleTargets, bots, replies,
    places: places(root.places, 'places'),
    items: items(root.items, 'items'),
    setup: setup(root.setup, 'setup'),
  };
}

/** Reads a part given as a file name beside the settings file: JSON, or a .txt of one line each (blank lines skipped). */
function readPart(value: unknown, base: string): unknown {
  if (typeof value !== 'string') return value;
  const text = readFileSync(resolve(base, value), 'utf8');
  if (value.toLowerCase().endsWith('.txt')) return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
  return JSON.parse(text) as unknown;
}

/** Reads and checks the settings file; `places`, `items`, `replies` and `setup` may be file names beside it. */
export function loadSettings(path: string): TownBotsSettings {
  const root = obj(JSON.parse(readFileSync(path, 'utf8')) as unknown, 'settings');
  const base = dirname(path);
  for (const key of ['places', 'items', 'replies', 'setup'] as const) root[key] = readPart(root[key], base);
  return parseSettings(root);
}
