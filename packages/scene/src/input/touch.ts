// Current input mode shared by mobile controls. Mouse/keyboard use restores desktop controls on hybrid computers.

/** Capture: a touch anywhere counts, whatever takes it (the object form, which every EventTarget matches on removal). */
const CAPTURE = { capture: true } as const;

/** Whether touch is the current input; `dispose` stops listening. */
export type TouchWatch = (() => boolean) & { dispose(): void };

/**
 * Uses device pointer capabilities initially, then follows actual touch/mouse/keyboard input.
 * The callback updates control visibility whenever the input mode changes.
 */
export function watchTouch(view: Window, onChange?: (touch: boolean) => void): TouchWatch {
  let current: boolean | null = null;
  const coarse = (): boolean => view.matchMedia?.('(pointer: coarse)').matches === true &&
    view.matchMedia?.('(any-pointer: fine)').matches !== true;
  const isTouch = (): boolean => current ?? coarse();
  const set = (touch: boolean): void => {
    // A phone's virtual keyboard/compatibility mouse events do not turn it into a desktop.
    if (!touch && coarse()) return;
    const was = isTouch();
    current = touch;
    if (touch !== was) onChange?.(touch);
  };
  const onPress = (event: Event): void => {
    const type = (event as PointerEvent).pointerType;
    if (type === 'touch') set(true);
    else if (type === 'mouse' || type === 'pen') set(false);
  };
  const onMove = (event: Event): void => { if ((event as PointerEvent).pointerType === 'mouse') set(false); };
  const onKey = (): void => set(false);
  view.addEventListener('pointerdown', onPress, CAPTURE);
  view.addEventListener('pointermove', onMove, CAPTURE);
  view.addEventListener('keydown', onKey, CAPTURE);
  return Object.assign(isTouch, { dispose: () => {
    view.removeEventListener('pointerdown', onPress, CAPTURE);
    view.removeEventListener('pointermove', onMove, CAPTURE);
    view.removeEventListener('keydown', onKey, CAPTURE);
  } });
}
