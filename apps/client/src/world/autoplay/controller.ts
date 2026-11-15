/**
 * custom (owner 2026-11-15): Auto Play, the farm bot, auto pots and auto skills V15 does not have. One controller,
 * stepped once per rules step from `WorldScreen.step`; it drives only the V15 paths FlyffWeb already copies (item use,
 * the attack loop, skill use, pickup), through the narrow hooks below, so it sends nothing a player could not send by
 * hand (docs/superpowers/specs/2026-11-15-auto-play-design.md).
 */
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { buffOf, pickBuff } from './buffs';
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
}

export type FarmState = 'off' | 'running' | 'stopped';
export type FarmPhase = 'seeking' | 'fighting' | 'looting' | 'buffing' | 'returning';

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

export class AutoPlay {
  private readonly pacer = new PotionPacer();
  /** The rows whose "no items left" line was said, until their item is back in the bag. */
  private readonly emptySaid = new Set<GaugeRow>();
  /** Items used by the auto pots since the page loaded the world. */
  potionsUsed = 0;

  farm: FarmState = 'off';
  phase: FarmPhase = 'seeking';
  lastStop: string | null = null;
  stats = new AutoPlayStats(0);
  /** Looting stopped: the bag is full. */
  bagIsFull = false;

  private anchor: Vec3 = [0, 0, 0];
  private startedAt = 0;
  private target: number | null = null;
  private lastEngage = -Infinity;
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

  constructor(private readonly hooks: AutoPlayHooks, public settings: AutoPlaySettings) {
    this.timers = new SkillTimers((i) => hooks.skillCooldownMs(i));
  }

  /** The window changed `settings`: keep them. */
  saved(): void {
    this.hooks.save(this.settings);
  }

  /** The ground item the farm bot is walking to, or null. */
  get lootingId(): number | null {
    return this.looting?.id ?? null;
  }

  /** Starts the farm bot where the player stands; false, with the reason said, where it may not run. */
  start(): boolean {
    const h = this.hooks;
    if (this.farm === 'running') return true;
    const refused = farmBlocked(h.worldId(), h.inDuel()) ? 'not allowed here' : h.flying() ? 'flying' : !h.alive() ? 'you died' : null;
    const self = h.self();
    if (refused !== null || self === undefined) {
      h.say(`Auto Play stopped: ${refused ?? 'not allowed here'}.`);
      return false;
    }
    const now = h.now();
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
    h.say('Auto Play started.');
    return true;
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
    h.say(`Auto Play stopped: ${reason}.`);
    h.alert();
    h.flashTitle(reason);
  }

  /** Once per rules step. */
  step(): void {
    this.stepPots();
    if (this.farm === 'running') this.stepFarm();
  }

  onEvent(e: AutoPlayEvent): void {
    const h = this.hooks, now = h.now();
    if (e.kind === 'hit') {
      this.fighting.onHit(e.attackerId, e.victimId, now);
      const self = h.self();
      if (self !== undefined && e.victimId === self.objectId && !h.isPlayer(e.attackerId)) this.hittingUs.set(e.attackerId, now);
      if (self !== undefined && e.attackerId === self.objectId && e.victimId === this.target) this.stuck.progress(Infinity, true, now);
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
    });
    if (next === null) {
      this.nextScan = now + SCAN_MS;
      if (fromHome > HOME_RANGE) this.walkHome(now);
      else this.phase = 'seeking';
      return;
    }
    this.target = next.objectId;
    this.stuck.choose(next.objectId, groundDistance(at, next.act.body.pos), now);
    this.engage(next.objectId, now);
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
    this.stuck.progress(groundDistance(self.act.body.pos, target.act.body.pos), false, now);
    if (this.stuck.stuck(now)) {
      this.skip.add(id, now, STUCK_SKIP_MS);
      this.target = null;
      this.stuck.clear();
      this.letGoWand();
      if (++this.stuckInRow >= STUCK_IN_ROW) {
        this.stuckInRow = 0;
        this.returning = true;
      }
      return false;
    }
    this.phase = 'fighting';
    if (h.focusId() !== id) {
      if (now - this.lastEngage >= ENGAGE_AGAIN_MS) this.engage(id, now);
      return true;
    }
    if (this.skillStep(now)) return true;
    if (h.holdsWand() && !this.wandHeld && !h.chainBusy()) {
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
    const list = this.settings.skills.buffs;
    if (list.length === 0 || now < this.castWait || h.chainBusy() || !h.standing()) return false;
    const usable = (e: BuffEntry): boolean => (e.kind === 'skill'
      ? h.skillKnown(e.index) && h.skillCostOk(e.index) && this.timers.ready(e.index, now)
      : findStack(h.inventory(), e.index) !== undefined && h.cooldownLeft(e.index) === 0);
    const entry = pickBuff(list, h.buffs(), (e) => buffOf(e, (i) => h.buffSkillId(i)), usable, now);
    if (entry === null) return false;
    this.phase = 'buffing';
    this.buffing = true;
    if (entry.kind === 'skill') this.cast(now, () => h.useSkill(entry.index), entry.index);
    else {
      const stack = findStack(h.inventory(), entry.index);
      this.cast(now, () => { if (stack) h.useItem(stack.objectId); }, null);
    }
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
