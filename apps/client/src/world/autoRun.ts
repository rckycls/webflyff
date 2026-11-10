// The auto-run (2026-11-11): Neuz's double W (`CWndWorld::ControlGround`, `Source/_Interface/WndWorldControlPlayer.cpp:157-193`,
// `g_WndMng.m_bAutoRun`). W pressed again within 200 ms of its let-go locks the walk forward (`bUp = TRUE` while
// `m_bAutoRun`, :192-193); the camera and the turn keys go on working. S stops it (:157-160), and so does a later press of W
// (`m_timerAutoRunBlock` out, :176-177); a second press held 200 ms or more is a plain walk, off as it is let go.
//
// Neuz reads its key table once a frame; here the presses are the key events, with their own times, so that a quick press
// between two slow frames still counts (as `WalkKey` keeps a press made between two reads). Neuz also stops it on a take-off
// (`CMover::EquipItem` with a ride, `_Common/MoverEquip.cpp:1820`) and on entering the world (`CWndMgr::OpenField`,
// `WndManager.cpp:2142`). The browser adds the stops below (`autoRunStops`, the world screen's `stopOwnMover`): Neuz goes on
// walking through them, a click on the ground walking there and on, and an attack cleared at each frame (`ClearCmd`, :382).

/** `m_timerAutoRun`, `m_timerAutoRunPush` and `m_timerAutoRunBlock`, each `Set( 200 )` (`WndWorld.cpp:624-626`). */
export const AUTO_RUN_MS = 200;

/** The rule of the double W, on the presses' times (ms). */
export class AutoRun {
  private locked = false;
  /** When the press that locked it went down (`m_timerAutoRunBlock.Reset()`, :169). */
  private lockedAt = 0;
  /** When W was last let go (`m_timerAutoRun` and `m_timerAutoRunPush`, reset at each frame W is held, :163, :174). */
  private lastUp = Number.NEGATIVE_INFINITY;

  /** `g_WndMng.m_bAutoRun`. */
  get on(): boolean {
    return this.locked;
  }

  /** W goes down at `time`. */
  forwardDown(time: number): void {
    if (time - this.lastUp < AUTO_RUN_MS) {
      // m_nDubleUp == 2 && !m_timerAutoRun.TimeOut(): locked, and the block timer starts (:164-170)
      this.locked = true;
      this.lockedAt = time;
    } else if (this.locked && time - this.lockedAt >= AUTO_RUN_MS) {
      this.locked = false; // a later press (:176-177)
    }
  }

  /** W is let go at `time`: held past the block timer, the press that locked it was a plain walk (:176-177). */
  forwardUp(time: number): void {
    this.lastUp = time;
    if (this.locked && time - this.lockedAt >= AUTO_RUN_MS) this.locked = false;
  }

  /** S goes down (`bDown`, :157-160). */
  backDown(): void {
    this.locked = false;
  }

  stop(): void {
    this.locked = false;
  }
}

/** What stops the auto-run at a rules step of the ground (the browser's own stops, beside Neuz's take-off). */
export interface AutoRunStops {
  /** The own player died (Neuz leaves `m_bAutoRun` on through a death: the revived player would walk off). */
  dead: boolean;
  /** It sits (`OBJSTAF_SIT`). */
  sitting: boolean;
  /** It flies: the take-off (`MoverEquip.cpp:1820`, Neuz's own). */
  flying: boolean;
  /** A click on the ground: the walk goes there and stops. */
  tapped: boolean;
  /** An attack or a skill under way, or a press on a mover. */
  attacking: boolean;
}

export function autoRunStops(s: AutoRunStops): boolean {
  return s.dead || s.sitting || s.flying || s.tapped || s.attacking;
}

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

const FORWARD = 'KeyW';
const BACKWARD = 'KeyS';

/**
 * W and S, by their place on the keyboard, as `AutoRun` reads them. Keys typed in a field are the field's. A window's key
 * hold (the modal backdrop's) keeps them from here, and a lost focus does not stop the lock: the world screen does that
 * (`stopOwnMover`). `target` is usually `window`.
 */
export class AutoRunKeys {
  private readonly rule = new AutoRun();
  private readonly onKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.repeat) return;
    const field = key.target as HTMLElement | null;
    if (field?.tagName === 'INPUT' || field?.tagName === 'TEXTAREA' || field?.isContentEditable) return;
    if (key.code === FORWARD) this.rule.forwardDown(key.timeStamp);
    else if (key.code === BACKWARD) this.rule.backDown();
  };
  private readonly onKeyUp = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.code === FORWARD) this.rule.forwardUp(key.timeStamp);
  };

  constructor(private readonly target: Listen) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  get on(): boolean {
    return this.rule.on;
  }

  stop(): void {
    this.rule.stop();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.rule.stop();
  }
}
