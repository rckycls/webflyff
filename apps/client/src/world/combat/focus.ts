import { NULL_ID } from '@flyffweb/protocol';
import type { WorldSession } from '../WorldSession';

/**
 * The focus: the mover the player has selected (`CWorld::m_pObjFocus`), and the next target queued behind it
 * (`CWndWorld::m_pNextTargetObj`), with the SETTARGET the server is told of each change. A copy of
 * `CWorld::SetObjFocus` (`Source/_Common/World.cpp:253-359`), for movers (the browser selects nothing else), and of the
 * two places that drop the focus when its mover goes: `CWorld::Process` for a mover deleted (`:892-893`) and
 * `CDPClient::OnMoverDeath` for the player's kill (`Neuz/DPClient.cpp:1956-1970`).
 *
 * The server only hears of the focus: it is told nothing of a mover the player is merely looking at, and a tap on bare
 * ground does not clear it (`SelectObj` only focuses what it picked, `WndWorld.cpp:6353-6386`).
 */
export class Focus {
  private target: number | null = null;

  /**
   * `m_pNextTargetObj`: a mover selected while the player was auto-attacking another, which becomes the focus when that
   * one dies (`onRemoved`), and is dropped when the focus is cleared. Its owner (the attack loop) sets it.
   */
  next: number | null = null;

  /**
   * `isLive` is `CMover::IsLive` (`Mover.h:1222`), asked of the old target when the focus moves from it: a target that is
   * dead is not released (`World.cpp:310`). It is asked at the moment of the change, so a caller that has already put the
   * target in its dead state with no HP left gets no release, as the C++ does; by default every target is live.
   */
  constructor(
    private readonly session: Pick<WorldSession, 'sendSetTarget'>,
    private readonly isLive: (objectId: number) => boolean = () => true,
  ) {}

  /** `m_pObjFocus`'s object ID, or null with no focus. */
  get targetId(): number | null {
    return this.target;
  }

  /**
   * `CWorld::SetObjFocus( pObj )` (`World.cpp:253-359`) for a mover with the object ID `objectId`, or none (null): the old
   * target, if it is another and live, is released with 1 (:310-315); the new one is focused with 2 (:319-329); and a
   * focus cleared sends `NULL_ID` with 2 and drops the queued next target (:331-343). Nothing is sent when the focus does
   * not change.
   */
  select(objectId: number | null): void {
    const old = this.target;
    if (old !== null && old !== objectId && this.isLive(old)) this.session.sendSetTarget(old, 1);
    if (objectId !== old) {
      if (objectId !== null) {
        this.session.sendSetTarget(objectId, 2);
      } else {
        this.session.sendSetTarget(NULL_ID, 2);
        this.next = null;
      }
    }
    this.target = objectId;
  }

  /**
   * The mover `objectId` is gone: the focus is cleared if it was the target (`SetObjFocus( NULL )`), and the queued next
   * target is dropped if it was that. When the target was killed by the player (`takesNext`, the default;
   * `OnMoverDeath` keeps `m_pNextTargetObj` through the clearing and then `SetNextTarget`, `DPClient.cpp:1959-1969`,
   * `WndWorld.cpp:6389-6419`) the next target becomes the focus. When it was deleted (`takesNext` false, a DEL_OBJ:
   * `CWorld::Process`, `World.cpp:892-893`, whose `SetObjFocus( NULL )` clears `m_pNextTargetObj` too) the focus stays
   * cleared. `SetNextTarget` also stops the auto-attack (`m_bAutoAttack = FALSE`), which the attack loop's owner does when
   * the focus has changed under it.
   */
  onRemoved(objectId: number, takesNext = true): void {
    if (objectId !== this.target) {
      // World.cpp:901-902, DPClient.cpp:1984-1992: a next target that goes is forgotten
      if (objectId === this.next) this.next = null;
      return;
    }
    const next = takesNext ? this.next : null;
    this.select(null);
    if (next !== null) this.select(next);
  }
}
