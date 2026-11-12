// The motions of the lobby's 3D characters (docs/superpowers/specs/2026-11-12-char-select-create-research.md §2, §3):
//
//   CWndSelectChar::Process         _Interface/WndTitle.cpp:1462-1516   the selected stands, the others sit
//   CWndSelectChar::SelectCharacter WndTitle.cpp:2252-2281              a newly selected one gets up
//   CWndSelectChar::UpdateCharacter WndTitle.cpp:1824-1846              as the window opens: standing or sitting
//   CWndCreateChar::SetSex          WndTitle.cpp:2651-2681              MTI_STAND for a man, MTI_STAND2 for a woman
//   CModelObject::FrameMove         (ANILOOP_1PLAY / ANILOOP_LOOP)      a frame per tick; once and held, or round and round
//
// Pure, without three.js: `lobbyPortraits.ts` plays what this decides.

/** `MTI_*` (`Resource/defineNeuz.h:352-374, :461`). */
export const LobbyMti = { STAND: 0, SIT: 20, SITSTAND: 21, GETUP: 22, STAND2: 199 } as const;

/** A motion as it plays: which, looped or played once, and whether a played-once one has reached its end. */
export interface MotionState {
  id: number;
  loop: boolean;
  ended: boolean;
}

/** What `UpdateCharacter` starts a slot with: the selected one standing, the others sitting, both looping. */
export function openingSelectMotion(selected: boolean): MotionState {
  return { id: selected ? LobbyMti.STAND : LobbyMti.SITSTAND, loop: true, ended: false };
}

/** `SelectCharacter`: the character just selected gets up, once. */
export function getUpMotion(): MotionState {
  return { id: LobbyMti.GETUP, loop: false, ended: false };
}

/**
 * One `Process` of a slot's character: the motion to switch to, or null to keep the one playing.
 * - selected: a finished `MTI_GETUP` becomes `MTI_STAND`, looping;
 * - not selected: a finished played-once motion becomes `MTI_SITSTAND`, looping; anything else but `MTI_SIT` and
 *   `MTI_SITSTAND` becomes `MTI_SIT`, once.
 */
export function nextSelectMotion(selected: boolean, now: MotionState): { id: number; loop: boolean } | null {
  if (selected) {
    return now.id === LobbyMti.GETUP && now.ended && !now.loop ? { id: LobbyMti.STAND, loop: true } : null;
  }
  if (now.id === LobbyMti.SITSTAND) return null;
  if (now.ended && !now.loop) return { id: LobbyMti.SITSTAND, loop: true };
  return now.id === LobbyMti.SIT ? null : { id: LobbyMti.SIT, loop: false };
}

/** `SetSex`: the create window's standing motion. */
export function createMotion(sex: number): number {
  return sex === 1 ? LobbyMti.STAND2 : LobbyMti.STAND;
}

/**
 * `m_fFrameCurrent` of a motion of `frames` frames moving on by `perSlerp` a tick (`FrameMove`): round and round when
 * `loop`, else up to the last frame and held there, `ended` from then on.
 */
export class MotionClock {
  frame = 0;
  ended = false;

  constructor(readonly frames: number, readonly perSlerp: number, readonly loop: boolean) {}

  tick(): void {
    if (this.frames < 2 || this.ended) {
      if (this.frames < 2 && !this.loop) this.ended = true;
      return;
    }
    const step = Math.fround(Math.trunc(Math.fround(this.perSlerp * 1000)) / 1000);
    let frame = this.frame + step;
    const last = this.frames - 1;
    if (this.loop) {
      if (frame > last) frame = frame - Math.trunc(frame) + (Math.trunc(frame) % this.frames);
    } else if (frame >= last) {
      frame = last;
      this.ended = true;
    }
    this.frame = frame;
  }
}

/** Neuz moves its models once a frame at 60 frames a second: the ticks `ms` milliseconds hold, `carry` the rest kept. */
export function ticksIn(ms: number, carry: number): { ticks: number; carry: number } {
  const total = Math.max(0, ms) + carry;
  const ticks = Math.floor(total / (1000 / 60));
  // a page held in the background does not catch up: past 6 ticks the rest is dropped
  if (ticks > 6) return { ticks: 6, carry: 0 };
  return { ticks, carry: total - ticks * (1000 / 60) };
}
