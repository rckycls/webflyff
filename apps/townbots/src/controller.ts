// One bot's life in the world: its body, its role (given by the planner, switched when its time is up), its refusals,
// its gear put on as it enters, and the safety net. The runner logs it in and steps it.
import type { Vec3 } from '@flyffweb/protocol';
import { encodeDuelNo, encodePVendorClose, encodePVendorOpen, encodeRefuse, encodeRegisterPVendorItem } from '@flyffweb/protocol';
import { AutoPlay } from '@flyffweb/client/src/world/autoplay/controller';
import { defaultSettings } from '@flyffweb/client/src/world/autoplay/settings';
import { canToggleSit, useMotion } from '@flyffweb/client/src/world/motion/motionRules';
import { ActMsg, ObjSta, ObjStaF } from '@flyffweb/client/src/world/sim/constants';
import { isDie } from '@flyffweb/client/src/world/WorldState';
import type { BotBody } from './body';
import { AutoPlayFeed, headlessHooks } from './hooks';
import { Refusals } from './refusals';
import { RolePlanner } from './roles';
import { FarmRole, SpotBook } from './roles/farm';
import { ShopRole } from './roles/shop';
import { AfkRole, UpgradeRole, WanderRole } from './roles/town';
import type { FarmControl, RoleIo, RoleRunner } from './roles/types';
import { groundDistance } from './roles/types';
import { SafetyNet } from './safety';
import { gearToEquip } from './setup';
import type { Role, TownBotsSettings } from './settings';

/** The bots' world: Flaris is in Madrigal (`WI_WORLD_MADRIGAL`). */
export const BOT_WORLD = 1;
/** Gear sent by ITEM_SEND_TBL reaches the bag a moment after entering: it is put on this long after (ms). */
const EQUIP_AFTER_MS = 8_000;
/** The friendly motions of the Motion window a wandering bot plays (tilt head, nod, shake head, parade rest, attention). */
const FRIENDLY_MOTIONS: readonly number[] = [5, 6, 7, 9, 10];

/** What every bot's controller shares. */
export interface BotWorld {
  settings: TownBotsSettings;
  planner: RolePlanner;
  spots: SpotBook;
  /** Shop spots in use, by the bot holding each. */
  shopSpots: Map<string, Vec3>;
  /** The bots' names, lower-cased: bots never talk to bots, and never count as players. */
  botNames: ReadonlySet<string>;
  /** False once any bot's safety net tripped: nobody farms. */
  fighting: { allowed: boolean };
  random: () => number;
  log: (line: string) => void;
}

export class BotController {
  private runner: RoleRunner | undefined;
  private equipAt: number | null = null;
  private feed: AutoPlayFeed | undefined;
  private readonly refusals: Refusals;
  private readonly safety: SafetyNet;
  private elsewhereSaid = false;

  constructor(readonly body: BotBody, private readonly w: BotWorld) {
    const name = body.spec.name;
    const session = () => body.session;
    this.refusals = new Refusals({
      partyNo: (leaderId, memberId) => session()?.sendPartyMemberCancel(leaderId, memberId, 0),
      tradeNo: (askerId) => session()?.sendConfirmTradeCancel(askerId),
      duelNo: (asker, party) => session()?.sendVendor(encodeDuelNo(asker, party)),
      friendNo: (askerId) => session()?.sendFriendCancel(askerId),
      coupleNo: () => session()?.sendVendor(encodeRefuse()),
      whisper: (to, text) => { try { session()?.sendChat('whisper', text, to); } catch { /* a name the chat cannot take */ } },
    }, w.settings.replies, w.random, () => Date.now(), {
      ownName: () => name,
      isBot: (other) => w.botNames.has(other.toLowerCase()),
      ofObject: (id) => body.nameOf(id),
      ofPlayer: (id) => body.nameOfPlayer(id),
    });
    this.safety = new SafetyNet((why) => {
      w.log(`${name}: ${why}`);
      w.fighting.allowed = false;
    });
    body.onMessage = (objectId, message) => {
      this.refusals.onMessage(objectId, message);
      this.feed?.onMessage(objectId, message);
    };
    body.onChanges = (changes) => {
      this.feed?.onChanges(changes);
      const own = body.own();
      if (own !== undefined) this.safety.onOwn({ level: own.level, exp: Number(own.exp) });
    };
    body.onOwnSkill = (skill) => this.feed?.onOwnSkill(skill);
    body.onEntered = () => this.begin();
    body.onTransition = () => this.end();
  }

  get name(): string { return this.body.spec.name; }

  /** Every rules step: the body's step, then the role's. */
  step(): void {
    const body = this.body;
    body.step();
    if (!body.playing) return;
    if (body.worldId() !== BOT_WORLD) {
      if (!this.elsewhereSaid) this.w.log(`${this.name} is in world ${body.worldId()}, not Flaris's: it stands still`);
      this.elsewhereSaid = true;
      return;
    }
    const now = Date.now();
    if (this.equipAt !== null && now >= this.equipAt) {
      this.equipAt = null;
      this.putOnGear();
    }
    if (!this.w.fighting.allowed && this.runner?.role === 'farming') {
      this.runner.stop();
      this.runner = undefined;
      this.w.planner.drop(this.name, 'farming');
    }
    if (this.runner === undefined) {
      this.nextRole(false);
      return;
    }
    if (this.runner.tick() === 'done') this.nextRole(true);
  }

  /** The bot left the world (or is changing worlds): its role ends and is free. */
  end(): void {
    this.runner?.stop();
    this.runner = undefined;
    this.feed = undefined;
    this.w.spots.release(this.name);
    this.w.shopSpots.delete(this.name);
    this.w.planner.release(this.name);
  }

  private begin(): void {
    this.elsewhereSaid = false;
    this.equipAt = Date.now() + EQUIP_AFTER_MS;
    const own = this.body.own();
    if (own !== undefined) this.safety.start({ level: own.level, exp: Number(own.exp) });
  }

  private putOnGear(): void {
    const own = this.body.own();
    if (own === undefined || own.inventory === null) return;
    for (const objectId of gearToEquip(own.inventory, own.equipmentObjectIds, this.w.settings.items.gear)) {
      this.body.session?.sendEquipItem(objectId, -1);
    }
  }

  /** A role for the bot: its first (`switching` false) or the next one; one it cannot start now falls back to wandering. */
  private nextRole(switching: boolean): void {
    const { planner } = this.w;
    this.runner?.stop();
    this.w.spots.release(this.name);
    this.w.shopSpots.delete(this.name);
    this.feed = undefined;
    let role: Role = switching ? planner.switchRole(this.name, this.body.spec.group) : planner.assign(this.name, this.body.spec.group);
    let runner = this.make(role);
    if (runner === undefined) {
      // a spot taken (every field or shop spot in use) is for now only: another role this time; no fighting is for good
      if (role === 'farming' && !this.w.fighting.allowed) planner.drop(this.name, 'farming');
      role = planner.switchRole(this.name, this.body.spec.group);
      runner = this.make(role) ?? new WanderRole(this.w.settings.places.town, this.io(), () => planner.remaining(this.name), FRIENDLY_MOTIONS);
    }
    this.runner = runner;
    this.w.log(`${this.name}: ${runner.role}`);
  }

  private make(role: Role): RoleRunner | undefined {
    const { settings, planner } = this.w;
    const places = settings.places;
    const io = this.io();
    const duration = (): number => planner.remaining(this.name);
    switch (role) {
      case 'farming': {
        if (!this.w.fighting.allowed) return undefined;
        const spot = this.w.spots.take(this.name, this.body.spec.level);
        if (spot === undefined) return undefined;
        return new FarmRole(spot, places.routes[spot.route]!, { potions: settings.items.potions, readySkills: [] }, io, () => this.farmControl(), duration);
      }
      case 'wandering':
        return new WanderRole(places.town, io, duration, FRIENDLY_MOTIONS);
      case 'afk':
        return new AfkRole(places.town, io, duration);
      case 'upgrading':
        return new UpgradeRole(places.upgradeNpc.pos, settings.items.upgrade, io, duration);
      case 'shop': {
        const used = [...this.w.shopSpots.values()];
        const free = places.shopSpots.filter((spot) => !used.some((u) => groundDistance(u, spot) < 1));
        if (free.length === 0) return undefined;
        const spot = free[Math.min(free.length - 1, Math.floor(this.w.random() * free.length))]!;
        this.w.shopSpots.set(this.name, spot);
        return new ShopRole(spot, settings.items, io, duration);
      }
    }
  }

  /** Auto Play for this bot, with its feed of the world's events. */
  private farmControl(): FarmControl {
    const play = new AutoPlay(headlessHooks(this.body), defaultSettings());
    play.onError = (error) => this.w.log(`${this.name}: auto play: ${(error as Error).message}`);
    const feed = new AutoPlayFeed(play, this.body);
    return {
      get farm() { return play.farm; },
      set farm(_value) { /* Auto Play's own */ },
      start: (settings) => {
        play.settings = settings;
        this.feed = feed;
        return play.start();
      },
      step: () => play.step(),
      stop: (reason) => { play.stop(reason); this.feed = undefined; },
      fighting: () => play.farm === 'running' && (play.phase === 'fighting' || this.body.focus()?.targetId != null),
    };
  }

  /** The role's view of the bot. */
  private io(): RoleIo {
    const body = this.body;
    const self = () => body.self();
    return {
      now: () => Date.now(),
      random: this.w.random,
      position: () => self()?.act.body.pos as Vec3 | undefined,
      worldId: () => body.worldId(),
      dead: () => { const s = self(); return s !== undefined && isDie(s); },
      hpRatio: () => { const own = body.own(); return own === undefined || own.maxHp() <= 0 ? 1 : own.hp / own.maxHp(); },
      walkTo: (pos) => body.walkTo(pos),
      sitting: () => ((self()?.act.stateFlag ?? 0) & ObjStaF.SIT) !== 0,
      sit: () => { const s = self(); if (s !== undefined && canToggleSit(s.act) && (s.act.stateFlag & ObjStaF.SIT) === 0) body.session?.sendMotion(ActMsg.SITDOWN); },
      stand: () => { const s = self(); if (s !== undefined && canToggleSit(s.act) && (s.act.stateFlag & ObjStaF.SIT) !== 0) body.session?.sendMotion(ActMsg.STANDUP); },
      motion: (id) => {
        const s = self(), session = body.session;
        if (s === undefined || session === undefined) return;
        useMotion(id, {
          act: s.act, vendorOpen: () => false, chatLater: () => {}, runChat: () => {}, pickupAround: () => {},
          sendMotion: (message) => session.sendMotion(message), setAngle: (angle) => { s.act.body.angle = angle; },
          behave: () => { s.act.clearDest(); session.sendBehavior(s.act.report(body.clockTick())); },
          escape: () => {}, focusPlayer: () => null, sendCheering: () => {}, autoAttack: () => false, confirmPropose: () => {}, say: () => {},
        });
      },
      revive: () => body.session?.sendRevivalToLodestar(),
      bag: () => {
        const own = body.own();
        if (own === undefined || own.inventory === null) return new Map();
        const worn = new Set(own.equipmentObjectIds);
        return new Map([...own.inventory].filter(([id]) => !worn.has(id)));
      },
      sendUpgrade: (item, material) => body.session?.sendUpgrade('enchant', item, material),
      vendorOpen: (title) => body.session?.sendVendor(encodePVendorOpen(title)),
      vendorRegister: (slot, objectId, count, cost) => body.session?.sendVendor(encodeRegisterPVendorItem(slot, objectId, count, cost)),
      vendorClose: () => { const s = self(); if (s !== undefined) body.session?.sendVendor(encodePVendorClose(s.objectId)); },
      playersFightingNear: (center, range) => {
        for (const m of body.world()?.movers.values() ?? []) {
          if (m.kind !== 'player' || m.isSelf || this.w.botNames.has(m.name.toLowerCase())) continue;
          if (groundDistance(m.act.body.pos as Vec3, center) <= range && (m.act.state & ObjSta.ATK_ALL) !== 0) return true;
        }
        return false;
      },
      onDrop: (role) => this.w.planner.drop(this.name, role),
      log: (line) => this.w.log(`${this.name}: ${line}`),
    };
  }
}
