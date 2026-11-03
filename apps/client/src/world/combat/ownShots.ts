// The own player's missile ids and the three reports of its missiles (Piece 7 M2, [R §5]):
//
//   CMover::m_idSfxHit         _Common/Mover.cpp:408               0 at construction, pre-incremented per missile
//   CMover::OnAttackMagic      _Common/MoverActEvent.cpp:856-862   ++m_idSfxHit, SendSfxID( target, id, AF_MAGIC )
//   CMover::OnAttackRange      MoverActEvent.cpp:754-760           ++m_idSfxHit, SendSfxID( target, id, AF_GENERIC | AF_RANGE )
//   CCtrl::ShootSkill          _Common/Ctrl.cpp:1394-1406          ++m_idSfxHit, SendSfxID( ..., AF_*SKILL, NULL_ID, nMaxDmgCnt )
//   CSfx::DamageToTarget       _Common/SfxObj.cpp:124-129          SendSfxHit on the hit
//   CSfx::~CSfx                SfxObj.cpp:44-55                    SendSfxClear for a missile that never hit
//
// The world server deals a missile's damage only once it has both the SFX_ID and the SFX_HIT (`CDPSrvr::OnSfxHit`,
// `WORLDSERVER/DPSrvr.cpp:1933-1993`).

import { NULL_ID } from '@flyffweb/protocol';
import type { WorldSession } from '../WorldSession';

/** What the reports are sent through. */
export type OwnShotsSession = Pick<WorldSession, 'sendSfxId' | 'sendSfxHit' | 'sendSfxClear'>;

export class OwnShots {
  /** `m_idSfxHit` of the own mover. */
  private id = 0;

  constructor(private readonly session: OwnShotsSession) {}

  /** `m_idSfxHit` as it is now: what MAGIC_ATTACK and RANGE_ATTACK carry (`MoverSkill.cpp:3271-3274`, :3375-3376). */
  get current(): number {
    return this.id;
  }

  /**
   * A missile made at a hit frame: `idSfxHit = ++m_idSfxHit`, then SFX_ID with the shot's `AF_*` type, the skill
   * (`NULL_ID` for the wand and the bow, as `SendSfxID`'s default) and the hits it may make. Its id.
   */
  register(targetId: number, type: number, skill: number = NULL_ID, maxDmgCnt = 1): number {
    this.id = (this.id + 1) | 0;
    this.session.sendSfxId(targetId, this.id, type, skill, maxDmgCnt);
    return this.id;
  }

  /**
   * SFX_HIT: `SendSfxHit( m_idSfxHit, m_nMagicPower, m_dwSkill, pObjSrc->GetId(), nDmgCnt, fDmgAngle, fDmgPower )`, the
   * last three a skill's (`DamageToTarget`'s: Strong Wind's push, Hot Air's count; 0 for the wand and the bow).
   */
  hit(sfxHitId: number, power: number, skill: number, attackerId: number, dmgCnt = 0, dmgAngle = 0, dmgPower = 0): void {
    this.session.sendSfxHit(sfxHitId, power, skill, attackerId, dmgCnt, dmgAngle, dmgPower);
  }

  /** SFX_CLEAR: `SendSfxClear( m_idSfxHit, m_idSrc )`. */
  clear(sfxHitId: number, moverId: number): void {
    this.session.sendSfxClear(sfxHitId, moverId);
  }
}
