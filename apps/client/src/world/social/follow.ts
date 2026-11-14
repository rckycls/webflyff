// 2026-11-15 (social): following another player, `CWndWorld::m_objidTracking` (docs/2026-11-15-social-research.md §3).
//
//   OnCommand MMI_TRACE            _Interface/WndWorld.cpp:5673-5679          the menu's Follow, not flying: the player
//                                                                            tracked, SetDestObj( it )
//   OnLButtonDown                  WndWorld.cpp:6723, :7055-7066              any press in the world ends it; Z held on a
//                                                                            player, not flying, starts it
//   ControlGround                  _Interface/WndWorldControlPlayer.cpp:385-417  a move or turn key ends it; each step, a
//                                                                            player gone ends it, one more than 4 m away
//                                                                            (3-D, d² > 16) is walked to again
//   OnMoverDeath                   Neuz/DPClient.cpp:2069-2074                the own death or the player's ends it
//   CWndVendor::SetVendor          _Interface/WndVendor.cpp:63-65             a shop window ends it
//
// The walk itself is SetDestObj's (PLAYERSETDESTOBJ, range 0, sent when the destination changes), which the rules end at
// arrival (`ProcessMoveArrival`'s default: ClearDestObj and STOP). In the air ControlGround does not run: the follow waits.

import type { Vec3 } from '@flyffweb/protocol';

/** `D3DXVec3LengthSq( &vDis ) > 16`: farther than 4 m, the walk goes again. */
export const FOLLOW_REARM_SQ = 16;

export class Follow {
  private tracking: number | null = null;

  /** The player followed (`m_objidTracking`), or null. */
  get targetId(): number | null {
    return this.tracking;
  }

  start(objectId: number): void {
    this.tracking = objectId;
  }

  stop(): void {
    this.tracking = null;
  }

  /**
   * ControlGround's part at `own`: the player followed found by `find`; gone, the follow ends; farther than 4 m, `walk` to it
   * (`SetDestObj( m_objidTracking )`).
   */
  step(own: Vec3, find: (objectId: number) => Vec3 | undefined, walk: (objectId: number) => void): void {
    const id = this.tracking;
    if (id === null) return;
    const at = find(id);
    if (at === undefined) {
      this.tracking = null;
      return;
    }
    const dx = own[0] - at[0], dy = own[1] - at[1], dz = own[2] - at[2];
    if (dx * dx + dy * dy + dz * dz > FOLLOW_REARM_SQ) walk(id);
  }

  /** `OnMoverDeath`: the own player or the one followed died. */
  died(victimId: number, ownObjectId: number | undefined): void {
    if (victimId === this.tracking || victimId === ownObjectId) this.tracking = null;
  }
}
