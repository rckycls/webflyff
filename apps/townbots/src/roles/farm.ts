// Farming: walk the spot's route out of town, run Auto Play there (no looting, the spot's monsters, the bot's potion
// and skills), and walk back when the role's time is up, when Auto Play stops, or when a real player has been fighting
// at the spot for a minute (the field is theirs). A death: revive at the lodestar, and the role is over.
import type { Vec3 } from '@flyffweb/protocol';
import { defaultSettings } from '@flyffweb/client/src/world/autoplay/settings';
import type { AutoPlaySettings } from '@flyffweb/client/src/world/autoplay/settings';
import type { Spot } from '../settings';
import { RouteWalker } from './route';
import type { FarmControl, RoleIo, RoleRunner, RoleStatus } from './types';

/** A real player fighting within this of the spot's centre (m)... */
const PLAYER_NEAR_M = 15;
/** ...for this long: the bot leaves the spot (ms). */
const PLAYER_NEAR_MS = 60_000;
/** Auto Play's limit on chosen kinds. */
const MAX_ONLY = 16;
/** Auto Play's limit on ready skills. */
const MAX_READY = 4;

export interface FarmPlan {
  /** The bot's potion item ids, best first (the first one in the bag is used). */
  potions: number[];
  /** Skill slot indexes Auto Play may use, max 4. */
  readySkills: number[];
}

/** Auto Play's settings for a bot on `spot`. */
export function farmSettings(spot: Spot, potion: number, readySkills: readonly number[]): AutoPlaySettings {
  const s = defaultSettings();
  s.farm = { radius: spot.radius, loot: false, stopAfterMin: 0, avoidGiants: true, only: spot.kinds.slice(0, MAX_ONLY), center: 'start' };
  s.pots.enabled = potion > 0;
  s.pots.rows.hp = { itemIndex: potion, below: 50, on: potion > 0 };
  s.skills = { actionSlot: false, ready: readySkills.slice(0, MAX_READY), buffs: [] };
  s.mode = 'farm';
  return s;
}

type Phase = 'out' | 'farming' | 'back' | 'reviving' | 'done';

export class FarmRole implements RoleRunner {
  readonly role = 'farming' as const;
  private phase: Phase = 'out';
  private walker: RouteWalker;
  private farm: FarmControl | undefined;
  private until = Infinity;
  private playerSince: number | null = null;

  constructor(
    private readonly spot: Spot,
    private readonly route: readonly Vec3[],
    private readonly plan: FarmPlan,
    private readonly io: RoleIo,
    private readonly makeFarm: () => FarmControl,
    private readonly duration: () => number,
  ) {
    // through town to the route's start, then the route out, then the spot
    this.walker = new RouteWalker([...io.pathTo(route[0]!), ...route.slice(1), spot.center], io);
  }

  tick(): RoleStatus {
    if (this.phase === 'done') return 'done';
    if (this.io.dead() && this.phase !== 'reviving') {
      this.farm?.stop('died');
      this.io.revive();
      this.phase = 'reviving';
      return 'running';
    }
    switch (this.phase) {
      case 'reviving':
        if (!this.io.dead()) this.phase = 'done';
        break;
      case 'out': {
        const status = this.walker.tick();
        if (status === 'arrived') this.startFarming();
        else if (status === 'failed') this.phase = 'done';
        break;
      }
      case 'farming':
        this.farmStep();
        break;
      case 'back': {
        const status = this.walker.tick();
        if (status !== 'walking') this.phase = 'done';
        break;
      }
    }
    return this.phase === 'done' ? 'done' : 'running';
  }

  busy(): boolean {
    return this.phase === 'farming' && this.farm?.fighting() === true;
  }

  stop(): void {
    if (this.farm?.farm === 'running') this.farm.stop('role ended');
    this.phase = 'done';
  }

  private startFarming(): void {
    const bag = this.io.bag();
    const potion = this.plan.potions.find((id) => [...bag.values()].some((item) => item.itemId === id && item.count > 0)) ?? 0;
    const farm = this.makeFarm();
    this.farm = farm;
    if (!farm.start(farmSettings(this.spot, potion, this.plan.readySkills))) {
      this.io.log('Auto Play would not start here: back to town');
      this.goBack();
      return;
    }
    this.until = this.io.now() + this.duration();
    this.phase = 'farming';
  }

  private farmStep(): void {
    const farm = this.farm!;
    farm.step();
    const now = this.io.now();
    if (this.io.playersFightingNear(this.spot.center, PLAYER_NEAR_M)) this.playerSince ??= now;
    else this.playerSince = null;
    const playerTookIt = this.playerSince !== null && now - this.playerSince >= PLAYER_NEAR_MS;
    if (farm.farm !== 'running') {
      this.goBack();
    } else if ((now >= this.until || playerTookIt) && !farm.fighting()) {
      if (playerTookIt) this.io.log(`a player is fighting at ${this.spot.id}: leaving it to them`);
      farm.stop(playerTookIt ? 'a player is fighting here' : 'time to go');
      this.goBack();
    }
  }

  private goBack(): void {
    this.walker = new RouteWalker(this.route, this.io, { reverse: true });
    this.phase = 'back';
  }
}

/** The field spots and who farms where: at most two bots on a spot, the spot fitting the bot's level. */
export class SpotBook {
  private readonly taken = new Map<string, string>();

  constructor(private readonly spots: readonly Spot[], private readonly random: () => number = Math.random) {}

  take(bot: string, level: number): Spot | undefined {
    this.release(bot);
    const free = this.spots.filter((spot) => level >= spot.minLevel && level <= spot.maxLevel && this.count(spot.id) < 2);
    if (free.length === 0) return undefined;
    const least = Math.min(...free.map((spot) => this.count(spot.id)));
    const choices = free.filter((spot) => this.count(spot.id) === least);
    const spot = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))]!;
    this.taken.set(bot, spot.id);
    return spot;
  }

  release(bot: string): void {
    this.taken.delete(bot);
  }

  private count(spotId: string): number {
    let n = 0;
    for (const id of this.taken.values()) if (id === spotId) n++;
    return n;
  }
}
