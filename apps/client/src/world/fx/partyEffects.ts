// The party skills' effects (Piece 7 M4, [R §8.4], [R §8.5]): what Neuz's party handlers create, as `EffectManager`
// requests. The client moves, targets and says nothing for these skills: they are effects only.
//
//   CDPClient::OnPartySkillCall       Neuz/DPClient.cpp:5380-5442  the leader's client: dwSfxObj2 on itself at 1.1; a
//                                                                  member's: dwSfxObj2 on the leader (in view) and
//                                                                  dwSfxObj on itself at 1.1, its height up, turned by
//                                                                  `atan2( leader.x − x, leader.z − z )` in degrees
//   CDPClient::OnPartySkillBlitz      DPClient.cpp:5444-5463       dwSfxObj on the target (its idDest), once
//   CSfxTroBlitz::Render              _Common/Sfx.cpp:366-376      at the target, `maxY × scale.y − 0.7 × scale.y` up, at
//                                                                  the target's scale
//   CDPClient::OnPartySkillRetreat    DPClient.cpp:5466-5488       dwSfxObj on each member in view
//   CDPClient::OnPartySkillSphereCircle DPClient.cpp:5491-5514     dwSfxObj on the leader, none out of view
//   CDPClient::OnSetPartyMode         DPClient.cpp:5023-5239       on: modes 0, 1, 3 the skill's dwSfxObj on the leader at
//                                                                  0.8, 0.7, 1.0; mode 2 (on and off alike) dwSfxObj on
//                                                                  each sitting member in view
//   CSfxTroStretching01, 02           Sfx.cpp:251-325              0.1 m up; the first makes dwSfxObj2, which loops while
//                                                                  its mover sits and the mode is on
//
// Left out: CSfxTroStretching's turn to `-angle` (a ring the turn does not show).

import type { Vec3, WorldMessage } from '@flyffweb/protocol';
import type { PartyEvent } from '../party/partyState';
import type { EffectRequest } from './EffectManager';

/** A mover in view the effects use. */
export interface PartyMover {
  objectId: number;
  /** D3D. */
  pos: Vec3;
  /** `m_pModel->GetMaxHeight()`, the model's top (unscaled); 0 while the model loads. */
  height: number;
  /** `GetScale().y`. */
  scale: number;
  sitting: boolean;
}

export interface PartyEffectContext {
  /** `CMover::GetActiveMover()`, the own mover. */
  own: PartyMover | null;
  /** `g_Party.IsLeader( g_pPlayer->m_idPlayer )`. */
  isLeader: boolean;
  /** The leader's mover in view (the own one when leading), or null. */
  leader: PartyMover | null;
  /** The members' movers in view, in slot order, the own one included. */
  members: readonly PartyMover[];
  mover(objectId: number): PartyMover | null;
  /** A party skill's `dwSfxObj` and `dwSfxObj2` (the catalog's). */
  skill(id: number): { sfx: number | null; sfx2: number | null } | undefined;
  /** `g_Party.m_nModeTime[ PARTY_STRETCHING_MODE ]`. */
  restingOn(): boolean;
  /** `m_pActMover->IsSit()` of a mover now. */
  sits(objectId: number): boolean;
}

const ST_CALL = 1;
const ST_BLITZ = 2;
const ST_RETREAT = 3;
const ST_SPHERECIRCLE = 4;
const ST_STRETCHING = 7;
/** `PARTY_STRETCHING_MODE`. */
const RESTING_MODE = 2;
/** The modes' effects on the leader, by mode (`DPClient.cpp:5130-5150`). */
const MODE_SCALE: Readonly<Record<number, number>> = { 0: 0.8, 1: 0.7, 3: 1 };
const CALL_SCALE = 1.1;
const RESTING_LIFT = 0.1;

type PartyInput = WorldMessage | Extract<PartyEvent, { kind: 'modeOn' | 'modeOff' }>;

/** The effects one party skill message or mode change makes, in Neuz's order; none for anything else. */
export function partyEffects(input: PartyInput, context: PartyEffectContext): EffectRequest[] {
  // a mode event has no type (a message may have a kind of its own: REMOVEQUEST's)
  if (!('type' in input)) return modeEffects(input.mode, input.kind === 'modeOn', input.skill, context);
  const sfx = (id: number): number | null => context.skill(id)?.sfx ?? null;
  switch (input.type) {
    case 'partySkillCall': {
      const own = context.own;
      const ids = context.skill(ST_CALL);
      if (own === null || ids === undefined) return [];
      const at: Vec3 = [own.pos[0], own.pos[1] + own.height, own.pos[2]];
      const out: EffectRequest[] = [];
      if (context.isLeader) {
        if (ids.sfx2 !== null) out.push({ xi: ids.sfx2, pos: at, followId: own.objectId, scale: CALL_SCALE });
        return out;
      }
      const leader = context.leader;
      if (leader !== null && ids.sfx2 !== null) out.push({ xi: ids.sfx2, pos: [...leader.pos], followId: leader.objectId, scale: CALL_SCALE });
      if (ids.sfx !== null) {
        const angle = (Math.atan2(input.pos[0] - at[0], input.pos[2] - at[2]) * 180) / Math.PI;
        out.push({ xi: ids.sfx, pos: at, followId: own.objectId, scale: CALL_SCALE, angle });
      }
      return out;
    }
    case 'partySkillBlitz': {
      const target = context.mover(input.targetId);
      const xi = sfx(ST_BLITZ);
      if (target === null || xi === null) return [];
      return [{
        xi, pos: [...target.pos], followId: target.objectId, followDest: true,
        lift: target.height * target.scale - target.scale * 0.7, scale: target.scale,
      }];
    }
    case 'partySkillRetreat': {
      const xi = sfx(ST_RETREAT);
      return xi === null ? [] : context.members.map((m) => ({ xi, pos: [...m.pos] as Vec3, followId: m.objectId, scale: 1 }));
    }
    case 'partySkillSphereCircle': {
      const xi = sfx(ST_SPHERECIRCLE);
      const leader = context.leader;
      return xi === null || leader === null ? [] : [{ xi, pos: [...leader.pos], followId: leader.objectId, scale: 1 }];
    }
    default:
      return [];
  }
}

function modeEffects(mode: number, on: boolean, skill: number, context: PartyEffectContext): EffectRequest[] {
  if (mode === RESTING_MODE) {
    const ids = context.skill(ST_STRETCHING);
    if (ids === undefined || ids.sfx === null) return [];
    const loop = ids.sfx2;
    return context.members.filter((m) => m.sitting).map((m) => ({
      xi: ids.sfx!, pos: [...m.pos] as Vec3, followId: m.objectId, scale: 1, lift: RESTING_LIFT,
      ...(loop === null ? {} : {
        then: {
          xi: loop, pos: [...m.pos] as Vec3, followId: m.objectId, scale: 1, lift: RESTING_LIFT,
          // CSfxTroStretching02 as M3's CSfxReady: its model loops while this holds
          whileTrue: () => context.sits(m.objectId) && context.restingOn(),
        },
      }),
    }));
  }
  const scale = MODE_SCALE[mode];
  const xi = context.skill(skill)?.sfx ?? null;
  const leader = context.leader;
  if (!on || scale === undefined || xi === null || leader === null) return [];
  return [{ xi, pos: [...leader.pos], followId: leader.objectId, scale }];
}
