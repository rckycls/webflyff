// Whether the player plays with a finger: one rule for every control that is a touch screen's (the joystick here; the game
// client's attack button, the size of its Start menu and the text of its landscape cover). True where the main pointer is
// a finger (`(pointer: coarse)`: phones, tablets); a computer with a touch screen besides its mouse or trackpad counts from
// its first touch on.

/** Capture: a touch anywhere counts, whatever takes it (the object form, which every EventTarget matches on removal). */
const CAPTURE = { capture: true } as const;

/** Whether the player plays with a finger, asked again each time (a first touch changes it); `dispose` stops listening. */
export type TouchWatch = (() => boolean) & { dispose(): void };

/**
 * Watches `view` for the rule above. `onFirstTouch` is told once, at the first touch that makes the answer true (never on
 * a page whose main pointer is already a finger), for the controls that show from then on.
 */
export function watchTouch(view: Window, onFirstTouch?: () => void): TouchWatch {
  let touched = false;
  const coarse = (): boolean => view.matchMedia?.('(pointer: coarse)').matches === true;
  const isTouch = (): boolean => touched || coarse();
  const onPress = (event: Event): void => {
    if ((event as PointerEvent).pointerType !== 'touch') return;
    const was = isTouch();
    touched = true;
    view.removeEventListener('pointerdown', onPress, CAPTURE);
    if (!was) onFirstTouch?.();
  };
  view.addEventListener('pointerdown', onPress, CAPTURE);
  return Object.assign(isTouch, { dispose: () => view.removeEventListener('pointerdown', onPress, CAPTURE) });
}
