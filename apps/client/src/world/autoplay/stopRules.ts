/**
 * custom (owner 2026-11-15): Auto Play. The game events the controller is told about, and which of them stop the farm
 * bot (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.8). Only what is sent to this player stops it: any
 * whisper, a GM talking in view; never a broadcast (GM chat announcements, /system, shouts), which reach everyone.
 */
import type { Vec3 } from '@flyffweb/protocol';
import type { Gauges } from './potions';

export type AutoPlayEvent =
  | { kind: 'died' } | { kind: 'revived' }
  /** A hit on the own player. */
  | { kind: 'hitBy'; attackerId: number; attackerIsPlayer: boolean; name: string }
  /** Any hit seen (who fights what: kill stealing, and the monsters hitting us). */
  | { kind: 'hit'; attackerId: number; victimId: number }
  /** `gmTalk`: normal chat from a GM in view; never a broadcast. */
  | { kind: 'whisper' | 'gmTalk'; from: string }
  | { kind: 'duelStart' } | { kind: 'worldChange' } | { kind: 'replace' } | { kind: 'disconnect' }
  | { kind: 'manualControl' } | { kind: 'flying' } | { kind: 'bagFull' } | { kind: 'bagChanged' }
  /** A monster the own player or the party killed died at `pos`. */
  | { kind: 'kill'; targetId: number; pos: Vec3 }
  | { kind: 'exp'; gained: number }
  | { kind: 'itemAppeared'; id: number; pos: Vec3 }
  | { kind: 'pickRefused'; id: number } | { kind: 'picked'; id: number }
  | { kind: 'skillOk'; skillIndex: number } | { kind: 'skillRefused'; skillIndex: number }
  | { kind: 'chainEnded' };

/** The farm bot's reason to stop for `e`, or null when `e` is no stop. `partyIds`: the party's object ids. */
export function stopReason(e: AutoPlayEvent, partyIds: ReadonlySet<number>): string | null {
  switch (e.kind) {
    case 'died': return 'you died';
    case 'hitBy': return e.attackerIsPlayer && !partyIds.has(e.attackerId) ? `attacked by ${e.name}` : null;
    case 'whisper': case 'gmTalk': return `message from ${e.from}`;
    case 'duelStart': return 'duel';
    case 'worldChange': case 'replace': case 'disconnect': return 'left the area';
    case 'manualControl': return 'you took control';
    case 'flying': return 'flying';
    default: return null;
  }
}

/** The farm bot stops below this percent of HP when the HP row has nothing left (spec 6.8). */
export const LOW_HP_PERCENT = 20;

/** Whether HP is under 20 % of the maximum and the HP row has no item left. */
export function lowHpStop(g: Gauges, hpRowHasItem: boolean): boolean {
  return !hpRowHasItem && g.maxHp > 0 && g.hp * 100 < g.maxHp * LOW_HP_PERCENT;
}
