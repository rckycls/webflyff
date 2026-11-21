// One bot's life in the world: its body, its role (given by its home region's planner, switched when its time is up),
// its refusals, its gear put on as it enters, its renames (a Scroll of Name Change every 5-7 hours) and the safety net.
// The runner logs it in and steps it. The planner and the books know a bot by its account: its name changes.
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { encodeDuelNo, encodePVendorClose, encodePVendorOpen, encodeRefuse, encodeRegisterPVendorItem } from '@flyffweb/protocol';
import { AutoPlay } from '@flyffweb/client/src/world/autoplay/controller';
import { defaultSettings } from '@flyffweb/client/src/world/autoplay/settings';
import { useMotion } from '@flyffweb/client/src/world/motion/motionRules';
import { MotId } from '@flyffweb/client/src/world/motion/motionTable';
import { ObjSta, ObjStaF } from '@flyffweb/client/src/world/sim/constants';
import { isDie } from '@flyffweb/client/src/world/WorldState';
import type { BotBody } from './body';
import { AutoPlayFeed, headlessHooks } from './hooks';
import { ignName } from './names';
import type { BotNames } from './names';
import { Refusals } from './refusals';
import { RenameTimer } from './rename';
import { ReviveWatch } from './revive';
import { RolePlanner } from './roles';
import { FarmRole, SpotBook } from './roles/farm';
import type { PlaceBook } from './roles/places';
import { ShopRole } from './roles/shop';
import { AfkRole, UpgradeRole, WanderRole } from './roles/town';
import type { FarmControl, RoleIo, RoleRunner } from './roles/types';
import { groundDistance } from './roles/types';
import { SafetyNet } from './safety';
import { gearToEquip } from './setup';
import type { TownGraph } from './townGraph';
import { supplyCounts } from './stock';
import type { Region, Role, TownBotsSettings } from './settings';

/** The bots' world: every region they live in is in Madrigal (`WI_WORLD_MADRIGAL`). */
export const BOT_WORLD = 1;
/** Gear sent by ITEM_SEND_TBL reaches the bag a moment after entering: it is put on this long after (ms). */
const EQUIP_AFTER_MS = 8_000;
/** The friendly motions of the Motion window a wandering bot plays (tilt head, nod, shake head, parade rest, attention). */
const FRIENDLY_MOTIONS: readonly number[] = [5, 6, 7, 9, 10];

/** What the controllers of one region's bots share (`botNames`, `fighting`, `random` and `log`: every bot's). */
export interface BotWorld {
  settings: TownBotsSettings;
  /** The bot's home region: its places and role targets. */
  region: Region;
  planner: RolePlanner;
  spots: SpotBook;
  /** The town places (and shop spots) the region's bots hold. */
  places: PlaceBook;
  /** Every bot's live name: bots never talk to bots, and never count as players. */
  botNames: BotNames;
  /** The town's clear walks, for crossing town place to place. */
  town: TownGraph;
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
  private readonly revive = new ReviveWatch();
  /** The role ended with a death: the next one is a switch. */
  private afterDeath = false;
  private readonly rename: RenameTimer;
  private noScrollSaid = false;

  constructor(readonly body: BotBody, private readonly w: BotWorld) {
    const account = body.spec.account;
    if (w.botNames.nameOf(account) === undefined) w.botNames.set(account, body.spec.name);
    this.rename = new RenameTimer(w.random, () => Date.now(), body.spec.renameSoon);
    const session = () => body.session;
    this.refusals = new Refusals({
      partyNo: (leaderId, memberId) => session()?.sendPartyMemberCancel(leaderId, memberId, 0),
      tradeNo: (askerId) => session()?.sendConfirmTradeCancel(askerId),
      duelNo: (asker, party) => session()?.sendVendor(encodeDuelNo(asker, party)),
      friendNo: (askerId) => session()?.sendFriendCancel(askerId),
      coupleNo: () => session()?.sendVendor(encodeRefuse()),
      whisper: (to, text) => { try { session()?.sendChat('whisper', text, to); } catch { /* a name the chat cannot take */ } },
    }, w.settings.replies, w.random, () => Date.now(), {
      ownName: () => this.name,
      isBot: (other) => w.botNames.has(other),
      ofObject: (id) => body.nameOf(id),
      ofPlayer: (id) => body.nameOfPlayer(id),
    });
    this.safety = new SafetyNet((why) => {
      w.log(`${this.name}: ${why}`);
      w.fighting.allowed = false;
    });
    body.onMessage = (objectId, message) => {
      if (message.type === 'setPlayerName') this.renamed(message.playerId, message.name);
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

  /** The bot's name as the game shows it now. */
  get name(): string { return this.w.botNames.nameOf(this.key) ?? this.body.spec.name; }

  /** What the planner and the books know the bot by: its account (its name changes). */
  private get key(): string { return this.body.spec.account; }

  /** Every rules step: the body's, with the role's where the screen steps Auto Play (before the attack loop). */
  step(): void {
    this.body.step(() => this.roleStep());
  }

  private roleStep(): void {
    const body = this.body;
    if (!body.playing) return;
    if (body.worldId() !== BOT_WORLD) {
      if (!this.elsewhereSaid) this.w.log(`${this.name} is in world ${body.worldId()}, not Madrigal: it stands still`);
      this.elsewhereSaid = true;
      return;
    }
    const now = Date.now();
    // dead, wherever and whatever its role: the role ends, the bot is revived at the lodestar (again while it stays
    // dead), and takes its next role from there once alive
    const self = body.self();
    const dead = self !== undefined && isDie(self);
    if (this.revive.tick(dead, now)) {
      body.session?.sendRevivalToLodestar();
      this.w.log(`${this.name} died: revived at the lodestar`);
    }
    if (dead) {
      if (this.runner !== undefined) {
        this.runner.stop();
        this.runner = undefined;
        this.afterDeath = true;
      }
      return;
    }
    if (this.equipAt !== null && now >= this.equipAt) {
      this.equipAt = null;
      this.putOnGear();
    }
    this.renameStep();
    if (!this.w.fighting.allowed && this.runner?.role === 'farming') {
      this.runner.stop();
      this.runner = undefined;
      this.w.planner.drop(this.key, 'farming');
    }
    if (this.runner === undefined) {
      this.nextRole(this.afterDeath);
      this.afterDeath = false;
      return;
    }
    if (this.runner.tick() === 'done') this.nextRole(true);
  }

  /** What the bot holds of `ids` (not worn), while it is in the world. */
  supplies(ids: readonly number[]): Record<number, number> | undefined {
    const own = this.body.own();
    if (!this.body.playing || own === undefined || own.inventory === null) return undefined;
    const worn = new Set(own.equipmentObjectIds);
    return supplyCounts(new Map([...own.inventory].filter(([id]) => !worn.has(id))), ids);
  }

  /** The bot left the world (or is changing worlds): its role ends and is free. */
  end(): void {
    this.runner?.stop();
    this.runner = undefined;
    this.feed = undefined;
    this.w.spots.release(this.key);
    this.w.places.release(this.key);
    this.w.planner.release(this.key);
  }

  private begin(): void {
    this.elsewhereSaid = false;
    this.equipAt = Date.now() + EQUIP_AFTER_MS;
    // the name it has in the game (it may have renamed itself before the program last started)
    const self = this.body.self();
    if (self !== undefined && self.name !== '') this.w.botNames.set(this.key, self.name);
    const own = this.body.own();
    if (own !== undefined) this.safety.start({ level: own.level, exp: Number(own.exp) });
  }

  /** Its rename when one is due: a Scroll of Name Change from the bag, with a new name; a refused one is tried again. */
  private renameStep(): void {
    const scrollId = this.w.settings.items.renameScroll, words = this.w.settings.names;
    if (scrollId === undefined || words === undefined) return;
    const timer = this.rename;
    if (timer.waiting()) {
      if (timer.overdue()) {
        this.w.log(`${this.name}: the new name was refused (taken?)`);
        timer.failed();
      }
      return;
    }
    if (!timer.due()) return;
    const scroll = [...this.bag().values()].find((it) => it.itemId === scrollId && it.count > 0);
    if (scroll === undefined) {
      if (!this.noScrollSaid) this.w.log(`${this.name}: no Scroll of Name Change to rename with: refill`);
      this.noScrollSaid = true;
      timer.failed();
      return;
    }
    this.noScrollSaid = false;
    const name = ignName(words, this.w.random);
    this.body.session?.sendQuerySetPlayerName(scroll.objectId, name);
    timer.sent();
  }

  /** A player was renamed: when it is this bot, its new name is known to every bot. */
  private renamed(playerId: number, name: string): void {
    if (playerId !== this.body.self()?.added.player?.playerId) return;
    const before = this.name;
    this.w.botNames.set(this.key, name);
    this.rename.answered();
    this.w.log(`${before} renamed itself ${name}`);
  }

  /** The bag by object id, without what is worn. */
  private bag(): ReadonlyMap<number, InventoryItem> {
    const own = this.body.own();
    if (own === undefined || own.inventory === null) return new Map();
    const worn = new Set(own.equipmentObjectIds);
    return new Map([...own.inventory].filter(([id]) => !worn.has(id)));
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
    this.w.spots.release(this.key);
    this.w.places.release(this.key);
    this.feed = undefined;
    let role: Role = switching ? planner.switchRole(this.key, this.body.spec.group) : planner.assign(this.key, this.body.spec.group);
    let runner = this.make(role);
    if (runner === undefined) {
      // a spot taken (every field or shop spot in use) is for now only: another role this time; no fighting is for good
      if (role === 'farming' && !this.w.fighting.allowed) planner.drop(this.key, 'farming');
      role = planner.switchRole(this.key, this.body.spec.group);
      runner = this.make(role) ?? new WanderRole(this.w.region.places.town, this.io(), () => planner.remaining(this.key), FRIENDLY_MOTIONS);
    }
    this.runner = runner;
    this.w.log(`${this.name}: ${runner.role}`);
  }

  private make(role: Role): RoleRunner | undefined {
    const { settings, planner } = this.w;
    const places = this.w.region.places;
    const io = this.io();
    const duration = (): number => planner.remaining(this.key);
    switch (role) {
      case 'farming': {
        if (!this.w.fighting.allowed) return undefined;
        const spot = this.w.spots.take(this.key, this.body.spec.level);
        if (spot === undefined) return undefined;
        return new FarmRole(spot, places.routes[spot.route]!, { potions: settings.items.potions, readySkills: [] }, io, () => this.farmControl(), duration);
      }
      case 'wandering':
        return new WanderRole(places.town, io, duration, FRIENDLY_MOTIONS);
      case 'afk':
        return new AfkRole(places.town, io, duration);
      case 'upgrading':
        return places.upgradeNpc === undefined ? undefined : new UpgradeRole(places.upgradeNpc.pos, settings.items.upgrade, io, duration);
      case 'shop': {
        // a shop spot no other bot of the region holds or stands within 8 m of
        const spot = io.pickPlace(places.shopSpots);
        return spot === undefined ? undefined : new ShopRole(spot, settings.items, io, duration);
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
    /** A motion of the Motion window, as its button (Combat Stance toggles: `MotId.BATTLE`). */
    const motion = (id: number): void => {
      const s = self(), session = body.session;
      if (s === undefined || session === undefined) return;
      useMotion(id, {
        act: s.act, vendorOpen: () => false, chatLater: () => {}, runChat: () => {}, pickupAround: () => {},
        sendMotion: (message) => session.sendMotion(message), setAngle: (angle) => { s.act.body.angle = angle; },
        behave: () => { s.act.clearDest(); session.sendBehavior(s.act.report(body.clockTick())); },
        escape: () => {}, focusPlayer: () => null, sendCheering: () => {}, autoAttack: () => false, confirmPropose: () => {}, say: () => {},
      });
    };
    return {
      now: () => Date.now(),
      random: this.w.random,
      position: () => self()?.act.body.pos as Vec3 | undefined,
      worldId: () => body.worldId(),
      dead: () => { const s = self(); return s !== undefined && isDie(s); },
      hpRatio: () => { const own = body.own(); return own === undefined || own.maxHp() <= 0 ? 1 : own.hp / own.maxHp(); },
      walkTo: (pos) => body.walkTo(pos),
      pathTo: (target, skip) => { const at = self()?.act.body.pos as Vec3 | undefined; return at === undefined ? [target] : this.w.town.path(at, target, skip); },
      pickPlace: (candidates) => this.w.places.take(this.key, candidates, this.w.random),
      combatStance: () => { if (((self()?.act.stateFlag ?? 0) & ObjStaF.COMBAT) === 0) motion(MotId.BATTLE); },
      peaceStance: () => { if (((self()?.act.stateFlag ?? 0) & ObjStaF.COMBAT) !== 0) motion(MotId.BATTLE); },
      motion,
      revive: () => body.session?.sendRevivalToLodestar(),
      bag: () => this.bag(),
      sendUpgrade: (item, material) => body.session?.sendUpgrade('enchant', item, material),
      vendorOpen: (title) => body.session?.sendVendor(encodePVendorOpen(title)),
      vendorRegister: (slot, objectId, count, cost) => body.session?.sendVendor(encodeRegisterPVendorItem(slot, objectId, count, cost)),
      vendorClose: () => { const s = self(); if (s !== undefined) body.session?.sendVendor(encodePVendorClose(s.objectId)); },
      playersFightingNear: (center, range) => {
        for (const m of body.world()?.movers.values() ?? []) {
          if (m.kind !== 'player' || m.isSelf || this.w.botNames.has(m.name)) continue;
          if (groundDistance(m.act.body.pos as Vec3, center) <= range && (m.act.state & ObjSta.ATK_ALL) !== 0) return true;
        }
        return false;
      },
      onDrop: (role) => this.w.planner.drop(this.key, role),
      log: (line) => this.w.log(`${this.name}: ${line}`),
    };
  }
}
