/**
 * custom (owner 2026-11-15): Auto Play, the farm bot, auto pots and auto skills V15 does not have. One controller,
 * stepped once per rules step from `WorldScreen.step`; it drives only the V15 paths FlyffWeb already copies (item use,
 * the attack loop, skill use, pickup), through the narrow hooks below, so it sends nothing a player could not send by
 * hand (docs/superpowers/specs/2026-11-15-auto-play-design.md).
 */
import type { InventoryItem } from '@flyffweb/protocol';
import { PotionPacer, countOf, gaugeOf, pickPotion } from './potions';
import type { Gauges } from './potions';
import { GAUGE_ROWS } from './settings';
import type { AutoPlaySettings, GaugeRow } from './settings';
import type { AutoPlayEvent } from './stopRules';
import { potsBlocked } from './zones';

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
}

const ROW_NAMES: Record<GaugeRow, string> = { hp: 'HP', mp: 'MP', fp: 'FP' };

export class AutoPlay {
  private readonly pacer = new PotionPacer();
  /** The rows whose "no items left" line was said, until their item is back in the bag. */
  private readonly emptySaid = new Set<GaugeRow>();
  /** Items used by the auto pots since the page loaded the world. */
  potionsUsed = 0;

  constructor(private readonly hooks: AutoPlayHooks, public settings: AutoPlaySettings) {}

  /** The window changed `settings`: keep them. */
  saved(): void {
    this.hooks.save(this.settings);
  }

  /** Once per rules step. */
  step(): void {
    this.stepPots();
  }

  onEvent(_e: AutoPlayEvent): void {
    // M2 adds the stop rules
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
    if (h.useItem(pick.objectId)) this.potionsUsed++;
  }
}
