// The attack button of a touch screen (spec §3.4, §3.9): right side, above the task bar. Neuz has none: a finger cannot
// double-click a monster comfortably, so the button is the focused mover pressed again (`AttackLoop.attackButton`,
// `CWndWorld::OnLButtonDblClk`, `WndWorld.cpp:7248-7260`). It is enabled while an attackable target is selected, as the
// attack loop judges it (`AttackLoop.canAttackFocus`, `IsAttackAble`), which its owner passes to `update` each frame.
//
// It shows where the joystick shows (Piece 3's rule, `packages/scene/src/input/joystick.ts`): where the main pointer is a
// finger (`(pointer: coarse)`), or from the first touch on a computer that has a touch screen besides its mouse.

/** The label a screen reader says (the button itself is a picture). */
const LABEL = 'Attack';

/** `touchFirst` of the joystick: the main pointer is a finger (phones, tablets). */
function touchFirst(view: Window | null): boolean {
  return view?.matchMedia?.('(pointer: coarse)').matches === true;
}

export class AttackButton {
  readonly element: HTMLButtonElement;
  private readonly view: Window;

  /** `onPress` is called at each press of the button while it is enabled. */
  constructor(onPress: () => void, doc: Document = document) {
    this.view = doc.defaultView ?? window;
    const element = doc.createElement('button');
    element.type = 'button';
    element.className = 'hud-attack';
    element.setAttribute('aria-label', LABEL);
    element.disabled = true;
    element.hidden = !touchFirst(this.view);
    element.addEventListener('click', () => {
      if (!element.disabled) onPress();
    });
    this.element = element;
    if (element.hidden) this.view.addEventListener('pointerdown', this.onTouch, true);
  }

  /** Enabled while an attackable target is selected (`AttackLoop.canAttackFocus`). */
  update(enabled: boolean): void {
    if (this.element.disabled === enabled) this.element.disabled = !enabled;
  }

  /** Takes the button off and lets go of the touches. */
  dispose(): void {
    this.view.removeEventListener('pointerdown', this.onTouch, true);
    this.element.remove();
  }

  /** A finger on the screen: the button shows from then on, as the joystick does (`Joystick.onTouch`). */
  private readonly onTouch = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.element.hidden = false;
    this.view.removeEventListener('pointerdown', this.onTouch, true);
  };
}
