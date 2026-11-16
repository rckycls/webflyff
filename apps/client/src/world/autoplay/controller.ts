/**
 * custom (owner 2026-11-15): Auto Play, the farm bot, auto pots and auto skills V15 does not have. One controller,
 * stepped once per rules step from `WorldScreen.step`; it drives only the V15 paths FlyffWeb already copies (item use,
 * the attack loop, skill use, pickup), through the narrow hooks below, so it sends nothing a player could not send by
 * hand (docs/superpowers/specs/2026-11-15-auto-play-design.md).
 */
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { buffOf, itemBuffOn, pickBuff } from './buffs';
import type { BuffShown } from '../buffs';
import { PotionPacer, countOf, findStack, gaugeOf, pickPotion } from './potions';
import { SkillTimers, pickReadySkill } from './skillTimers';
import type { Gauges } from './potions';
import { GAUGE_ROWS } from './settings';
import type { AutoPlaySettings, BuffEntry, GaugeRow } from './settings';
import { AutoPlayStats } from './stats';
import { lowHpStop, stopReason } from './stopRules';
import type { AutoPlayEvent } from './stopRules';
import { OthersFighting, SkipList, StuckWatch, groundDistance, pickTarget } from './targets';
import type { TargetMover } from './targets';
import { farmBlocked, potsBlocked } from './zones';
import { pickSupportAction, supportBlocked } from './support';
import type { SupportInput } from './support';

export interface AutoPlayHooks {
  now(): number;
  worldId(): number;
  inDuel(): boolean;
  alive(): boolean;
  gauges(): Gauges;
  inventory(): ReadonlyMap<number, InventoryItem> | null;
  cooldownLeft(itemId: number): number;
  /** `ItemUse.use(objectId, 'bar')`: every Neuz refusal still applies. */
  useItem(objectId: number): boolean;
  /** A system-colour chat line. */
  say(text: string): void;
  /** Keeps the settings (per character). */
  save(s: AutoPlaySettings): void;
  // the farm bot (M2)
  self(): TargetMover | undefined;
  movers(): Iterable<TargetMover>;
  rankOf(m: TargetMover): number;
  attackable(m: TargetMover): boolean;
  isPlayer(objectId: number): boolean;
  /** The party's object ids (in view). */
  partyIds(): ReadonlySet<number>;
  flying(): boolean;
  /** As a double click on the monster: `AttackLoop.onMoverPressed(id, now, true)`. */
  engage(objectId: number): void;
  /** The attack loop's focus, or null. */
  focusId(): number | null;
  /** `OwnMover.walkTo`: a straight walk. */
  walkTo(pos: Vec3): void;
  /** `ItemActions.pick(id, now)`: walk to the item and pick it up. */
  pick(objectId: number): boolean;
  /** Whether the ground item is still there. */
  itemThere(objectId: number): boolean;
  bagFull(): boolean;
  holdsWand(): boolean;
  /** The attack button held (true) or let go (false): a wand's full-charge shots. */
  wandHold(on: boolean): void;
  /** A short alert sound (when the sound is on). */
  alert(): void;
  /** The page's title marks the stop while the tab is hidden. */
  flashTitle(reason: string): void;
  // the auto skills and buffs (M3)
  /** The task bar's Action Slot holds a skill. */
  actionSlotHasSkills(): boolean;
  /** An Action Slot chain runs, or a skill waits for the server (`execute`, `pending`). */
  chainBusy(): boolean;
  /** `SkillUse.useActionSlot()`, as the C key. */
  useActionSlot(): void;
  /** `SkillUse.useSlot(skillIndex)`: on the target, or on oneself for a skill on oneself. */
  useSkill(skillIndex: number): void;
  /** The skill slot holds a learned skill. */
  skillKnown(skillIndex: number): boolean;
  /** The own MP and FP pay for it at its level. */
  skillCostOk(skillIndex: number): boolean;
  /** Its cooldown at its level (ms). */
  skillCooldownMs(skillIndex: number): number;
  /** The own buffs now. */
  buffs(): readonly BuffShown[];
  /** The own player stands (no walk). */
  standing(): boolean;
  /** The skill id in a skill slot (what a skill's buff is keyed by). */
  buffSkillId(skillIndex: number): number | undefined;
  // phone and AFK (M4)
  /** Keep the screen on (Wake Lock) while the farm bot runs. */
  keepAwake(on: boolean): void;
  /** Lets go of the attack loop's target and its auto attack (as Escape: the focus, the walk to it). */
  disengage(): void;
  // 2026-11-17 (owner): smarter farming
  /** A monster's kind (`added.index`), for the chosen kinds. */
  indexOf(m: TargetMover): number;
  /** Whether an object stands on the straight line from the own player to the monster (`sightBlocked`). */
  lineBlocked(m: TargetMover): boolean;
  // 2026-11-17 (owner): Support mode
  /** The partner (by player id) in view: its HP, place, death and buffs; null when out of view. */
  partner(playerId: number): SupportInput['partner'];
  /** A skill slot cast on a mover (the partner, or oneself): the focus set to it, then `SkillUse.useSlot`. */
  castOn(skillIndex: number, objectId: number): void;
  /** V15's walk to a mover, with no attack (`AttackLoop.followTo`). */
  follow(objectId: number): void;
  /** The slot of the resurrection skill, or null when not learned. */
  resurrectSkill(): number | null;
}

export type FarmState = 'off' | 'running' | 'stopped';
export type FarmPhase = 'seeking' | 'fighting' | 'looting' | 'buffing' | 'returning' | 'supporting' | 'healing' | 'following';
/** 2026-11-17 (owner): the partner out of view this long stops Support mode (ms). */
const PARTNER_GONE_MS = 10_000;

const ROW_NAMES: Record<GaugeRow, string> = { hp: 'HP', mp: 'MP', fp: 'FP' };
/** The values of the spec (6.3, 6.5). */
const SCAN_MS = 500;
const ENGAGE_AGAIN_MS = 500;
const WALK_AGAIN_MS = 1000;
const STUCK_SKIP_MS = 60_000;
const STUCK_IN_ROW = 3;
const HOME_RANGE = 3;
const LEASH_EXTRA = 5;
const HITTING_US_MS = 5000;
const LOOT_RANGE = 5;
const LOOT_AFTER_KILL_MS = 3000;
const LOOT_GIVE_UP_MS = 6000;
const LOOT_SKIP_MS = 180_000;
/** After a chain ends or a skill is answered, this long before the next skill (ms, spec 6.4). */
const CAST_GAP_MS = 1000;
/** No answer from the server: try again after this long (ms). */
const CAST_SAFETY_MS = 5000;
/** A buff item's buff is looked for this long after its use; none: the entry is skipped (ms). */
const ITEM_BUFF_SEEN_MS = 3000;
/** 2026-11-17 (owner, "avoid obstacles"): no step closer and no attack for this long, still farther than SIDE_FAR: blocked (ms). */
const BLOCKED_MS = 1500;
/** Farther than this from the target the bot walks; nearer, a standstill is a fight, not an obstacle (m). */
const SIDE_FAR = 4;
/** A side step: this far across the line to the target (m), for this long (ms), at most SIDE_STEPS times a target. */
const SIDE_STEP = 4;
const SIDE_STEP_MS = 1200;
const SIDE_STEPS = 2;
/** A move of this much is a step closer (or away): the bot is not blocked (m). */
const MOVED = 0.3;

export class AutoPlay {
  private readonly pacer = new PotionPacer();
  /** The rows whose "no items left" line was said, until their item is back in the bag. */
  private readonly emptySaid = new Set<GaugeRow>();
  /** Items used by the auto pots since the page loaded the world. */
  potionsUsed = 0;

  farm: FarmState = 'off';
  /** Which mode runs (or ran last): the farm bot or Support mode (2026-11-17). */
  mode: 'farm' | 'support' = 'farm';
  /** Since when the partner is out of view, or null. */
  private partnerLostSince: number | null = null;
  phase: FarmPhase = 'seeking';
  lastStop: string | null = null;
  stats = new AutoPlayStats(0);
  /** Looting stopped: the bag is full. */
  bagIsFull = false;

  private anchor: Vec3 = [0, 0, 0];
  private startedAt = 0;
  private target: number | null = null;
  private lastEngage = -Infinity;
  /** 2026-11-17: the side steps around an obstacle: where the bot last moved from, when, how many for this target. */
  private stillAt: Vec3 = [0, 0, 0];
  private stillSince = 0;
  private sideSteps = 0;
  private sideUntil = 0;
  private lastWalk = -Infinity;
  private nextScan = 0;
  private stuckInRow = 0;
  private returning = false;
  private wandHeld = false;
  private readonly skip = new SkipList();
  private readonly lootSkip = new SkipList();
  private readonly stuck = new StuckWatch();
  private readonly fighting = new OthersFighting();
  private readonly hittingUs = new Map<number, number>();
  private lastKill: { pos: Vec3; at: number } | null = null;
  private loot: Array<{ id: number; pos: Vec3 }> = [];
  private looting: { id: number; since: number } | null = null;
  private readonly timers: SkillTimers;
  /** No skill, chain or buff is cast before this (ms). */
  private castWait = -Infinity;
  /** A buff was cast and has not been answered: the bot stands. */
  private buffing = false;
  /** The last skill the bot cast by itself, for a refusal without a skill (CLEAR_USESKILL). */
  private lastSkill: number | null = null;
  /** A buff item used, whose buff should show by `at` + ITEM_BUFF_SEEN_MS. */
  private itemBuff: { index: number; at: number } | null = null;
  /** Buff items that showed no buff: skipped while this controller lives. */
  private readonly noBuffItems = new Set<number>();
  /** An error inside Auto Play (WorldScreen reports it once). */
  onError: (error: unknown) => void = () => {};

  constructor(private readonly hooks: AutoPlayHooks, public settings: AutoPlaySettings) {
    this.timers = new SkillTimers((i) => hooks.skillCooldownMs(i));
  }

  /** The window changed `settings`: keep them. */
  saved(): void {
    this.hooks.save(this.settings);
  }

  /** Where Start was pressed (the radius is around it) while the farm bot runs; null otherwise. */
  get anchorAt(): Vec3 | null {
    return this.farm === 'running' ? this.anchor : null;
  }

  /** The ground item the farm bot is walking to, or null. */
  get lootingId(): number | null {
    return this.looting?.id ?? null;
  }

  /** Starts the farm bot where the player stands; false, with the reason said, where it may not run. */
  start(): boolean {
    const h = this.hooks;
    if (this.farm === 'running' && this.mode === 'farm') return true;
    const refused = farmBlocked(h.worldId(), h.inDuel()) ? 'not allowed here' : h.flying() ? 'flying' : !h.alive() ? 'you died' : null;
    const self = h.self();
    if (refused !== null || self === undefined) {
      h.say(`Auto Play stopped: ${refused ?? 'not allowed here'}.`);
      return false;
    }
    if (this.farm === 'running') this.dispose(); // the other mode ends quietly
    this.begin('farm', self);
    h.say('Auto Play started.');
    h.keepAwake(true);
    return true;
  }

  /**
   * 2026-11-17 (owner): Support mode: follow the partner, heal and buff them, raise them; never attack. Refused with no
   * partner, in PvP places and in a duel; dungeons allow it.
   */
  startSupport(): boolean {
    const h = this.hooks;
    if (this.farm === 'running' && this.mode === 'support') return true;
    const refused = supportBlocked(h.worldId(), h.inDuel()) ? 'not allowed here' : h.flying() ? 'flying' : !h.alive() ? 'you died'
      : this.settings.support.partnerPlayerId === 0 ? 'no partner' : null;
    const self = h.self();
    if (refused !== null || self === undefined) {
      h.say(`Auto Play stopped: ${refused ?? 'not allowed here'}.`);
      return false;
    }
    if (this.farm === 'running') this.dispose();
    this.begin('support', self);
    this.phase = 'supporting';
    h.say('Support started.');
    h.keepAwake(true);
    return true;
  }

  /** The AUTO button: the mode last started (the settings keep it). */
  startMode(): boolean {
    return this.settings.mode === 'support' ? this.startSupport() : this.start();
  }

  private begin(mode: 'farm' | 'support', self: TargetMover): void {
    const h = this.hooks, now = h.now();
    this.mode = mode;
    if (this.settings.mode !== mode) {
      this.settings.mode = mode;
      this.saved();
    }
    this.partnerLostSince = null;
    this.farm = 'running';
    this.phase = 'seeking';
    this.lastStop = null;
    this.anchor = [...self.act.body.pos] as Vec3;
    this.startedAt = now;
    this.stats = new AutoPlayStats(now);
    this.target = null;
    this.lastEngage = this.lastWalk = -Infinity;
    this.nextScan = now;
    this.stuckInRow = 0;
    this.returning = false;
    this.skip.clear();
    this.lootSkip.clear();
    this.stuck.clear();
    this.hittingUs.clear();
    this.lastKill = null;
    this.loot = [];
    this.looting = null;
    this.castWait = -Infinity;
    this.buffing = false;
    this.bagIsFull = h.bagFull();
  }

  /** Stops the farm bot and says why (once). */
  stop(reason: string): void {
    if (this.farm !== 'running') return;
    const h = this.hooks;
    this.farm = 'stopped';
    this.lastStop = reason;
    this.target = null;
    this.looting = null;
    this.letGoWand();
    h.keepAwake(false);
    h.say(`Auto Play stopped: ${reason}.`);
    h.alert();
    h.flashTitle(reason);
  }

  /** The world goes (log out, travel): the screen may sleep again; nothing is said. */
  dispose(): void {
    if (this.farm !== 'running') return;
    this.farm = 'off';
    this.target = null;
    this.looting = null;
    this.letGoWand();
    this.hooks.keepAwake(false);
  }

  /** Once per rules step. An error inside stops Auto Play, never the game's step. */
  step(): void {
    try {
      this.stepPots();
      if (this.farm === 'running') {
        if (this.mode === 'support') this.stepSupport();
        else this.stepFarm();
      }
    } catch (error) {
      this.failed(error);
    }
  }

  onEvent(e: AutoPlayEvent): void {
    try {
      this.handle(e);
    } catch (error) {
      this.failed(error);
    }
  }

  private failed(error: unknown): void {
    this.onError(error);
    try {
      this.stop('error');
    } catch {
      this.farm = 'stopped';
      this.lastStop = 'error';
    }
  }

  private handle(e: AutoPlayEvent): void {
    const h = this.hooks, now = h.now();
    if (e.kind === 'hit') {
      this.fighting.onHit(e.attackerId, e.victimId, now);
      const self = h.self();
      if (self !== undefined && e.victimId === self.objectId && !h.isPlayer(e.attackerId)) this.hittingUs.set(e.attackerId, now);
      if (self !== undefined && e.attackerId === self.objectId && e.victimId === this.target) this.stuck.attacked(now);
    }
    if (e.kind === 'swing') {
      const self = h.self();
      if (self !== undefined && e.attackerId === self.objectId && e.targetId === this.target) this.stuck.attacked(now);
    }
    if (this.farm !== 'running') return;
    this.stats.onEvent(e);
    switch (e.kind) {
      case 'kill':
        this.fighting.forget(e.targetId);
        this.hittingUs.delete(e.targetId);
        if (e.targetId === this.target) {
          this.target = null;
          this.stuck.clear();
          this.stuckInRow = 0;
          this.lastKill = { pos: [...e.pos] as Vec3, at: now };
          this.letGoWand();
        }
        break;
      case 'itemAppeared':
        if (this.settings.farm.loot && this.lastKill !== null && now - this.lastKill.at <= LOOT_AFTER_KILL_MS &&
          groundDistance(e.pos, this.lastKill.pos) <= LOOT_RANGE) this.loot.push({ id: e.id, pos: e.pos });
        break;
      case 'pickRefused':
        this.lootSkip.add(e.id, now, LOOT_SKIP_MS);
        this.dropLoot(e.id);
        break;
      case 'picked':
        this.dropLoot(e.id);
        break;
      case 'bagFull':
        this.bagIsFull = true;
        this.loot = [];
        this.looting = null;
        break;
      case 'bagChanged':
        if (!h.bagFull()) this.bagIsFull = false;
        break;
      case 'skillOk':
        if (this.target !== null) this.stuck.attacked(now);
        this.timers.ok(e.skillIndex, now);
        this.answered(now);
        break;
      case 'skillRefused':
        this.timers.refused(e.skillIndex >= 0 ? e.skillIndex : this.lastSkill ?? -1, now);
        this.answered(now);
        break;
      case 'chainEnded':
        this.answered(now);
        break;
      default:
        break;
    }
    // Support mode: the partner's whispers are talk between the two, not a check
    if (this.mode === 'support' && e.kind === 'whisper' && e.from === this.settings.support.partnerName) return;
    const reason = stopReason(e, h.partyIds());
    if (reason !== null) this.stop(reason);
  }

  /** The server answered a skill or ended a chain: the next one a second later. */
  private answered(now: number): void {
    this.castWait = now + CAST_GAP_MS;
    this.buffing = false;
  }

  private dropLoot(id: number): void {
    this.loot = this.loot.filter((item) => item.id !== id);
    if (this.looting?.id === id) this.looting = null;
  }

  private letGoWand(): void {
    if (!this.wandHeld) return;
    this.wandHeld = false;
    this.hooks.wandHold(false);
  }

  private potsAllowed(): boolean {
    const h = this.hooks;
    return this.settings.pots.enabled && h.alive() && !potsBlocked(h.worldId(), h.inDuel());
  }

  private stepPots(): void {
    if (!this.potsAllowed()) return;
    const h = this.hooks, now = h.now(), pots = this.settings.pots, inventory = h.inventory();
    for (const row of GAUGE_ROWS) {
      const set = pots.rows[row];
      if (!set.on || set.itemIndex <= 0) continue;
      if (countOf(inventory, set.itemIndex) > 0) this.emptySaid.delete(row);
      else if (!this.emptySaid.has(row)) {
        this.emptySaid.add(row);
        h.say(`Auto pots: no ${ROW_NAMES[row]} items left.`);
      }
    }
    const gauges = h.gauges();
    const pick = pickPotion(pots, gauges, inventory, (id) => h.cooldownLeft(id), this.pacer, now);
    if (!pick) return;
    // paced whether or not the use went through, so a refused item is not retried every step
    this.pacer.used(pick.row, now, gaugeOf(gauges, pick.row).value);
    if (h.useItem(pick.objectId)) {
      this.potionsUsed++;
      if (this.farm === 'running') this.stats.potionUsed();
    }
  }

  /** Whether the HP row can still heal: pots on, the row on, and its item in the bag. */
  private hpRowHasItem(): boolean {
    const pots = this.settings.pots, row = pots.rows.hp;
    return pots.enabled && row.on && countOf(this.hooks.inventory(), row.itemIndex) > 0;
  }

  private stepFarm(): void {
    const h = this.hooks, now = h.now();
    if (farmBlocked(h.worldId(), h.inDuel())) { this.stop('not allowed here'); return; }
    if (!h.alive()) return; // the died event stops it
    const stopAfter = this.settings.farm.stopAfterMin;
    if (stopAfter > 0 && now - this.startedAt >= stopAfter * 60_000) { this.stop('time limit'); return; }
    if (lowHpStop(h.gauges(), this.hpRowHasItem())) { this.stop('low HP, no potions'); return; }
    const self = h.self();
    if (self === undefined) return;
    for (const [id, at] of this.hittingUs) if (now - at > HITTING_US_MS) this.hittingUs.delete(id);
    const at = self.act.body.pos;

    if (this.target !== null && this.fight(self, now)) return;
    if (this.hittingUs.size === 0 && this.lootStep(now)) return;
    if (this.hittingUs.size === 0 && this.buffStep(now)) return;

    const fromHome = groundDistance(at, this.anchor);
    if (this.hittingUs.size > 0) this.returning = false;
    else if (this.returning || fromHome > this.settings.farm.radius + LEASH_EXTRA) {
      if (fromHome <= HOME_RANGE) this.returning = false;
      else { this.walkHome(now); return; }
    }

    if (now < this.nextScan) return;
    const party = h.partyIds();
    const next = pickTarget({
      self, anchor: this.anchor, radius: this.settings.farm.radius, movers: h.movers(), rankOf: (m) => h.rankOf(m),
      hittingUs: new Set(this.hittingUs.keys()), attackable: (m) => h.attackable(m),
      busy: (m) => this.fighting.busy(m, now, self.objectId, party, (id) => h.isPlayer(id)), skip: this.skip, now,
      avoidGiants: this.settings.farm.avoidGiants, only: new Set(this.settings.farm.only), indexOf: (m) => h.indexOf(m),
      blocked: (m) => h.lineBlocked(m),
    });
    if (next === null) {
      this.nextScan = now + SCAN_MS;
      if (fromHome > HOME_RANGE) this.walkHome(now);
      else this.phase = 'seeking';
      return;
    }
    this.target = next.objectId;
    this.stuck.choose(next.objectId, now);
    this.stillAt = [...at] as Vec3;
    this.stillSince = now;
    this.sideSteps = 0;
    this.sideUntil = 0;
    this.engage(next.objectId, now);
  }

  /**
   * 2026-11-17 (owner): a Support step: the urgent casts first (raise the partner, heal them, heal oneself), then the own
   * buffs of the Skills tab, then the partner's buffs, then the follow; one cast at a time, each waiting for its answer.
   */
  private stepSupport(): void {
    const h = this.hooks, now = h.now();
    if (supportBlocked(h.worldId(), h.inDuel())) { this.stop('not allowed here'); return; }
    if (!h.alive()) return;
    const stopAfter = this.settings.farm.stopAfterMin;
    if (stopAfter > 0 && now - this.startedAt >= stopAfter * 60_000) { this.stop('time limit'); return; }
    const self = h.self();
    if (self === undefined) return;
    const partner = h.partner(this.settings.support.partnerPlayerId);
    if (partner === null) {
      this.partnerLostSince ??= now;
      if (now - this.partnerLostSince >= PARTNER_GONE_MS) this.stop('partner gone');
      else this.phase = 'supporting';
      return;
    }
    this.partnerLostSince = null;
    const g = h.gauges();
    const action = pickSupportAction({
      self: { objectId: self.objectId, hp: g.hp, maxHp: g.maxHp, pos: self.act.body.pos }, partner, settings: this.settings.support,
      ready: (i) => h.skillKnown(i) && h.skillCostOk(i) && this.timers.ready(i, now),
      resurrectSkill: h.resurrectSkill(), buffSkillId: (i) => h.buffSkillId(i),
    });
    const canCast = now >= this.castWait && !h.chainBusy();
    if (action.kind === 'cast' && action.why !== 'buff') {
      this.phase = 'healing';
      if (canCast) this.cast(now, () => h.castOn(action.skillIndex, action.targetId), action.skillIndex);
      return;
    }
    if (this.buffStep(now)) return;
    if (action.kind === 'cast') {
      this.phase = 'buffing';
      if (canCast) this.cast(now, () => h.castOn(action.skillIndex, action.targetId), action.skillIndex);
      return;
    }
    if (action.kind === 'follow') {
      this.phase = 'following';
      if (now - this.lastWalk >= WALK_AGAIN_MS) {
        this.lastWalk = now;
        h.follow(action.targetId);
      }
      return;
    }
    this.phase = 'supporting';
  }

  /** The current target: keep at it; false when it is gone or given up. */
  private fight(self: TargetMover, now: number): boolean {
    const h = this.hooks, id = this.target!;
    let target: TargetMover | undefined;
    for (const m of h.movers()) if (m.objectId === id) { target = m; break; }
    if (target === undefined || !h.attackable(target)) {
      this.target = null;
      this.stuck.clear();
      this.letGoWand();
      return false;
    }
    if (this.stuck.stuck(now)) {
      this.skip.add(id, now, STUCK_SKIP_MS);
      this.target = null;
      this.stuck.clear();
      this.letGoWand();
      h.disengage(); // else V15's auto attack goes on chasing it
      if (++this.stuckInRow >= STUCK_IN_ROW) {
        this.stuckInRow = 0;
        this.returning = true;
      }
      return false;
    }
    this.phase = 'fighting';
    if (this.sideStep(self, target, now)) return true;
    if (h.focusId() !== id) {
      if (now - this.lastEngage >= ENGAGE_AGAIN_MS) this.engage(id, now);
      return true;
    }
    if (this.skillStep(now)) return true;
    // not while a fired skill waits for its answer: the press would drop it (clearCmd, worldPressed)
    if (h.holdsWand() && !this.wandHeld && !h.chainBusy() && now >= this.castWait) {
      this.wandHeld = true;
      h.wandHold(true);
    }
    return true;
  }

  /** A ready skill, else the Action Slot, on the target; false when none goes now. */
  private skillStep(now: number): boolean {
    const h = this.hooks, skills = this.settings.skills;
    if (now < this.castWait || h.chainBusy()) return false;
    const ready = pickReadySkill(skills.ready, this.timers, (i) => h.skillCostOk(i), (i) => h.skillKnown(i), now);
    if (ready !== null) {
      this.cast(now, () => h.useSkill(ready), ready);
      return true;
    }
    if (skills.actionSlot && h.actionSlotHasSkills()) {
      this.cast(now, () => h.useActionSlot(), null);
      return true;
    }
    return false;
  }

  /** Casts (a wand's held press let go first: a press during a chain ends it) and waits for the server's answer. */
  private cast(now: number, use: () => void, skill: number | null): void {
    this.letGoWand();
    this.lastSkill = skill;
    this.castWait = now + CAST_SAFETY_MS;
    use();
  }

  /** Between fights: the first buff of the list that is missing or ending, standing still; true while one is cast. */
  private buffStep(now: number): boolean {
    const h = this.hooks;
    if (this.buffing && now < this.castWait) { this.phase = 'buffing'; return true; }
    this.buffing = false;
    const item = this.itemBuff;
    if (item !== null && now - item.at >= ITEM_BUFF_SEEN_MS) {
      this.itemBuff = null;
      if (!itemBuffOn(h.buffs(), item.index)) {
        this.noBuffItems.add(item.index);
        h.say('Auto Play: a buff item showed no buff, so it is skipped.');
      }
    }
    const list = this.settings.skills.buffs;
    if (list.length === 0 || now < this.castWait || h.chainBusy() || !h.standing()) return false;
    const usable = (e: BuffEntry): boolean => (e.kind === 'skill'
      ? h.skillKnown(e.index) && h.skillCostOk(e.index) && this.timers.ready(e.index, now)
      : !this.noBuffItems.has(e.index) && this.itemBuff === null && findStack(h.inventory(), e.index) !== undefined
        && h.cooldownLeft(e.index) === 0);
    const entry = pickBuff(list, h.buffs(), (e) => buffOf(e, (i) => h.buffSkillId(i)), usable, now);
    if (entry === null) return false;
    if (entry.kind === 'skill') {
      this.phase = 'buffing';
      this.buffing = true;
      this.cast(now, () => h.useSkill(entry.index), entry.index);
      return true;
    }
    // an item: used at once (nothing answers it), its buff looked for 3 s later; the bot does not stand for it
    const stack = findStack(h.inventory(), entry.index);
    if (stack) h.useItem(stack.objectId);
    this.itemBuff = { index: entry.index, at: now };
    this.castWait = now + CAST_GAP_MS;
    return true;
  }

  /**
   * 2026-11-17 (owner, "avoid obstacles"): FlyffWeb walks in straight lines, so an object between the bot and its target
   * stops it. Still farther than 4 m, with no step and no attack for 1.5 s, it lets the target go, steps 4 m across the
   * line (one side, then the other), and after 1.2 s goes at it again; at most twice a target, then the 5 s rule
   * chooses another. True while a side step runs.
   */
  private sideStep(self: TargetMover, target: TargetMover, now: number): boolean {
    const h = this.hooks, at = self.act.body.pos, to = target.act.body.pos;
    if (this.sideUntil > 0) {
      if (now < this.sideUntil) return true;
      this.sideUntil = 0;
      this.stillAt = [...at] as Vec3;
      this.stillSince = now;
      this.engage(target.objectId, now);
      return true;
    }
    if (groundDistance(at, this.stillAt) > MOVED) {
      this.stillAt = [...at] as Vec3;
      this.stillSince = now;
      return false;
    }
    const dist = groundDistance(at, to);
    if (dist <= SIDE_FAR || this.sideSteps >= SIDE_STEPS || now - this.stillSince < BLOCKED_MS
      || now - this.stuck.lastAttack < BLOCKED_MS) return false;
    this.sideSteps++;
    const side = this.sideSteps % 2 === 1 ? 1 : -1;
    const dx = (to[0] - at[0]) / dist, dz = (to[2] - at[2]) / dist;
    this.letGoWand();
    h.disengage();
    h.walkTo([at[0] - dz * SIDE_STEP * side, at[1], at[2] + dx * SIDE_STEP * side]);
    this.sideUntil = now + SIDE_STEP_MS;
    return true;
  }

  private engage(id: number, now: number): void {
    this.lastEngage = now;
    this.phase = 'fighting';
    this.hooks.engage(id);
  }

  private walkHome(now: number): void {
    this.phase = 'returning';
    if (now - this.lastWalk < WALK_AGAIN_MS) return;
    this.lastWalk = now;
    if (this.hooks.focusId() !== null) this.hooks.disengage(); // the auto attack would walk the other way each step
    this.hooks.walkTo(this.anchor);
  }

  /** Picks up the items of our last kill, one by one; false when there is nothing to pick. */
  private lootStep(now: number): boolean {
    const h = this.hooks;
    if (!this.settings.farm.loot || this.bagIsFull) return false;
    if (this.looting !== null) {
      const { id, since } = this.looting;
      if (!h.itemThere(id)) this.dropLoot(id);
      else if (now - since > LOOT_GIVE_UP_MS) {
        this.lootSkip.add(id, now, LOOT_SKIP_MS);
        this.dropLoot(id);
      } else {
        this.phase = 'looting';
        return true;
      }
    }
    while (this.loot.length > 0) {
      const next = this.loot[0]!;
      if (!h.itemThere(next.id) || this.lootSkip.has(next.id, now)) { this.loot.shift(); continue; }
      this.looting = { id: next.id, since: now };
      this.phase = 'looting';
      h.pick(next.id);
      return true;
    }
    return false;
  }
}
