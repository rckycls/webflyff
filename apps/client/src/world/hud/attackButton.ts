// The attack button of a touch screen (spec §3.4, §3.9): right side, above the task bar. Neuz has none: a finger cannot
// double-click a monster comfortably, so the button is the focused mover pressed again (`AttackLoop.attackButton`,
// `CWndWorld::OnLButtonDblClk`, `WndWorld.cpp:7248-7260`). It is enabled while an attackable target is selected, as the
// attack loop judges it (`AttackLoop.canAttackFocus`, `IsAttackAble`), which its owner passes to `update` each frame.
//
// It shows where the joystick shows, by the one touch rule (`watchTouch`, `packages/scene/src/input/touch.ts`): where the
// main pointer is a finger (`(pointer: coarse)`), or from the first touch on a computer that has a touch screen besides
// its mouse.

import { watchTouch } from '@flyffweb/scene';
import type { TouchWatch } from '@flyffweb/scene';

/** The label a screen reader says (the button itself is a picture). */
const LABEL = 'Attack';

export class AttackButton {
  readonly element: HTMLButtonElement;
  private readonly touch: TouchWatch;
  /** Takes the page's let-go listeners off. */
  private readonly unlisten: () => void;

  /**
   * `onPress` is called at each press of the button while it is enabled; `onRelease`, when given, once at the let-go of
   * that press (pointerup or pointercancel; a mouse click or a key is a press and its let-go at once): with a wand or a
   * bow the button is held to charge (Piece 7 M2, plan Decisions 4). Each is given the time of the event that made it
   * (`Event.timeStamp`, in the clock of `performance.now()`), as the canvas's presses are timed (`TapToWalk`), so that a
   * busy page that runs the handler late does not lengthen the charge.
   */
  constructor(
    onPress: (time: number) => void,
    doc: Document = document,
    options: { label?: string; className?: string; onRelease?: (time: number) => void } = {},
  ) {
    const element = doc.createElement('button');
    element.type = 'button';
    element.className = options.className ?? 'hud-attack';
    element.dataset.silent = ''; // the web's own control: no CWndButton, no click (Piece 6 M2)
    element.setAttribute('aria-label', options.label ?? LABEL);
    let touchPressed = false;
    let held = false;
    /** The finger that holds it (Piece 7 M5): another finger's let-go (the stick's, another button's) is not this one's. */
    let holder: number | null = null;
    const letGo = (time: number) => { holder = null; if (held) { held = false; options.onRelease?.(time); } };
    const release = (event: Event) => {
      const id = (event as PointerEvent).pointerId;
      if (holder !== null && id !== undefined && id !== holder) return;
      letGo(event.timeStamp);
    };
    const activate = (event: Event) => { if (!element.disabled) { held = true; onPress(event.timeStamp); } element.blur(); };
    element.addEventListener('pointerdown', (event) => {
      touchPressed = event.pointerType === 'touch';
      event.preventDefault();
      if (touchPressed) {
        holder = event.pointerId ?? null;
        activate(event); // secondary touches need not produce a compatibility click
      }
    });
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    // a let-go off the button, or after it went disabled under the finger (its target died), ends the press too:
    // a disabled button may get no pointer events at all
    doc.addEventListener('pointerup', release);
    doc.addEventListener('pointercancel', release);
    this.unlisten = () => {
      doc.removeEventListener('pointerup', release);
      doc.removeEventListener('pointercancel', release);
    };
    element.disabled = true;
    element.addEventListener('click', (event) => {
      if (touchPressed && event.detail !== 0) { touchPressed = false; return; }
      activate(event);
      letGo(event.timeStamp);
    });
    this.element = element;
    // a finger on the screen: the button shows from then on, as the joystick does
    this.touch = watchTouch(doc.defaultView ?? window, (touch) => {
      element.hidden = !touch;
    });
    element.hidden = !this.touch();
  }

  /** Enabled while an attackable target is selected (`AttackLoop.canAttackFocus`). */
  update(enabled: boolean): void {
    if (this.element.disabled === enabled) this.element.disabled = !enabled;
  }

  /** Takes the button off and lets go of the touches. */
  dispose(): void {
    this.touch.dispose();
    this.unlisten();
    this.element.remove();
  }
}
