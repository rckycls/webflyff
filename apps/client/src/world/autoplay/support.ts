/**
 * custom (owner 2026-11-17): Auto Play's Support mode, for a buffer (Assist, Ringmaster, Billposter): it follows a partner
 * (any player the owner targets), heals them and itself, keeps buffs on them and raises them, and never starts a fight.
 * The next thing to do, from what the client sees: the partner's and the own HP (the partner's maximum is the client's
 * estimate, as the target bar's), the partner's buffs (sent for every mover in view), and which skills are ready.
 * Runs in the fields and in dungeons (owner 2026-11-17: "fields and dungeons"), never in PvP places.
 */
import type { Vec3 } from '@flyffweb/protocol';
import { BUFF_SKILL } from '../buffs';
import type { BuffShown } from '../buffs';
import { BUFF_RECAST_MS } from './buffs';
import type { AutoPlaySettings } from './settings';
import { groundDistance } from './targets';
import { potsBlocked } from './zones';

/** Farther than this from the partner, the buffer follows (m). */
export const FOLLOW_FAR = 4;

export interface SupportInput {
  self: { objectId: number; hp: number; maxHp: number; pos: Vec3 };
  /** The partner in view, or null. */
  partner: { objectId: number; hp: number; maxHp: number; pos: Vec3; dead: boolean; buffs: readonly BuffShown[] } | null;
  settings: AutoPlaySettings['support'];
  /** A skill slot learned, off its timer and paid for. */
  ready: (skillIndex: number) => boolean;
  /** The slot of the resurrection skill (SI_ASS_HEAL_RESURRECTION), or null when not learned. */
  resurrectSkill: number | null;
  /** The skill id in a slot (a skill's buff is keyed by it). */
  buffSkillId: (skillIndex: number) => number | undefined;
}

export type SupportAction =
  | { kind: 'none' }
  | { kind: 'follow'; targetId: number }
  | { kind: 'cast'; skillIndex: number; targetId: number; why: 'resurrect' | 'heal' | 'buff' };

const below = (hp: number, max: number, percent: number): boolean => max > 0 && hp * 100 < max * percent;

/**
 * In order: raise the dead partner; heal the partner under its percent; heal oneself under its percent; recast a partner
 * buff that is missing or ends within 10 s; follow a partner farther than 4 m; else nothing.
 */
export function pickSupportAction(input: SupportInput): SupportAction {
  const { self, partner, settings, ready } = input;
  const heal = settings.heals.find((i) => ready(i));
  if (partner !== null) {
    if (partner.dead) {
      if (settings.resurrect && input.resurrectSkill !== null && ready(input.resurrectSkill)) {
        return { kind: 'cast', skillIndex: input.resurrectSkill, targetId: partner.objectId, why: 'resurrect' };
      }
    } else if (heal !== undefined && below(partner.hp, partner.maxHp, settings.partnerBelow)) {
      return { kind: 'cast', skillIndex: heal, targetId: partner.objectId, why: 'heal' };
    }
  }
  if (heal !== undefined && below(self.hp, self.maxHp, settings.selfBelow)) {
    return { kind: 'cast', skillIndex: heal, targetId: self.objectId, why: 'heal' };
  }
  if (partner === null || partner.dead) return { kind: 'none' };
  for (const skillIndex of settings.buffs) {
    const id = input.buffSkillId(skillIndex);
    if (id === undefined || !ready(skillIndex)) continue;
    const on = partner.buffs.find((b) => b.buffType === BUFF_SKILL && b.id === id);
    if (on === undefined || (on.totalMs > 0 && on.leftMs < BUFF_RECAST_MS)) {
      return { kind: 'cast', skillIndex, targetId: partner.objectId, why: 'buff' };
    }
  }
  if (groundDistance(self.pos, partner.pos) > FOLLOW_FAR) return { kind: 'follow', targetId: partner.objectId };
  return { kind: 'none' };
}

/** Support mode is off where the auto pots are (the Arena, the siege, 1:1 guild war) and in a duel; dungeons allow it. */
export function supportBlocked(worldId: number, inDuel: boolean): boolean {
  return potsBlocked(worldId, inDuel);
}
