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

  /** `onPress` is called at each press of the button while it is enabled. */
  constructor(onPress: () => void, doc: Document = document, options: { label?: string; className?: string } = {}) {
    const element = doc.createElement('button');
    element.type = 'button';
    element.className = options.className ?? 'hud-attack';
    element.dataset.silent = ''; // the web's own control: no CWndButton, no click (Piece 6 M2)
    element.setAttribute('aria-label', options.label ?? LABEL);
    let touchPressed = false;
    const activate = () => { if (!element.disabled) onPress(); element.blur(); };
    element.addEventListener('pointerdown', (event) => {
      touchPressed = event.pointerType === 'touch';
      event.preventDefault();
      if (touchPressed) activate(); // secondary touches need not produce a compatibility click
    });
    element.disabled = true;
    element.addEventListener('click', (event) => {
      if (touchPressed && event.detail !== 0) { touchPressed = false; return; }
      activate();
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
    this.element.remove();
  }
}
