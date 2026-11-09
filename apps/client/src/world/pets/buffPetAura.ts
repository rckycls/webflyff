// The buff pets' aura (pets B1, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §4.2): the effect linked to a mover by its `m_dwMoverSfxId`, for every
// mover in view (the server gives it to the buff pet's mover: `ActivateEatPet`, `MoverSkill.cpp:4081`; `ChangeVisPetSfx`,
// `WORLDSERVER/ItemUpgrade.cpp:1684-1696`).
//
//   CMover::SetSfxBuffPet       _Common/Mover.cpp:1940-1950        the old effect removed, `CreateSfx( idEffect, GetPos(),
//                                                                  GetId(), GetPos(), GetId(), -1 )` made for a set id
//   CMover::Process             Mover.cpp:3958-3961                made again whenever the id is set and there is none
//   CreateSfx                   _Common/CreateObj.cpp:304-308      XI_BUFFPET_GRADE1-3 make a CSfxLinkMover
//   CSfxLinkMover::Process      _Common/Sfx.cpp:4032-4051          at the mover's position each tick, round and round
//                                                                  (`m_nCurFrame = 0` at the end); gone with the mover
//   CSfxLinkMover::Render       Sfx.cpp:4053-4082                  at the mover's origin, its own angle (0), not lifted
//
// The effects are the EffectManager's: one played for a mover follows it (`followId`), loops while the mover still has
// that id (`whileTrue`), and is drawn where it is (`lift` 0).

import type { Vec3 } from '@flyffweb/formats';
import type { EffectRequest } from '../fx/EffectManager';

/** `NULL_ID`: no effect. */
const NULL_ID = 0xffffffff;

/** What the auras read of a mover. */
export interface AuraMover {
  objectId: number;
  moverSfxId: number;
  act: { body: { pos: Vec3 } };
}

/** An effect id that makes something: not `NULL_ID`, and above 0 (`case 0: break;`, `CreateObj.cpp:310`). */
const isEffect = (xi: number): boolean => xi !== NULL_ID && xi > 0;

export class BuffPetAuras {
  /** The id of the aura each mover has (`m_pSfxBuffPet`'s), by object id. */
  private readonly playing = new Map<number, number>();

  /**
   * `CMover::Process`'s test (`Mover.cpp:3958-3961`) for each mover in view: a set id with no aura (or another id's, which
   * `SetSfxBuffPet` replaces on MOVER_CHANGESFX) plays its effect; an id gone (or a mover gone) lets it go.
   */
  sync(movers: Iterable<AuraMover>, play: (request: EffectRequest) => void): void {
    const seen = new Set<number>();
    for (const mover of movers) {
      const id = mover.objectId, xi = mover.moverSfxId;
      if (!isEffect(xi)) continue;
      seen.add(id);
      if (this.playing.get(id) === xi) continue;
      this.playing.set(id, xi);
      const pos = mover.act.body.pos;
      play({ xi, pos: [pos[0], pos[1], pos[2]], followId: id, whileTrue: () => this.playing.get(id) === xi, lift: 0 });
    }
    for (const id of [...this.playing.keys()]) if (!seen.has(id)) this.playing.delete(id);
  }

  /** The aura of `objectId`, or undefined. */
  of(objectId: number): number | undefined {
    return this.playing.get(objectId);
  }

  /** A world left: every aura goes. */
  clear(): void {
    this.playing.clear();
  }
}
