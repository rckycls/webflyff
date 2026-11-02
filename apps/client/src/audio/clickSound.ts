// The click of every button: CWndButton::OnLButtonDown plays SND_INF_CLICK (Source/_Interface/WndControl.cpp:692-694),
// for window buttons, close buttons, check boxes, radio buttons and menu lines alike. Every HUD and lobby control is a
// <button>, so one listener on the root plays it on the press. A button that stands for something Neuz does not draw
// as a button (an item slot, a ground item, the web's attack button and joystick) is marked `data-silent`.

import { SND_INF_CLICK } from './soundIds';

/** Plays the click on a pointer press of a `<button>` under `root`; returns the function that removes the listener. */
export function installClickSound(root: HTMLElement, play: (id: number) => void): () => void {
  const onPress = (event: Event): void => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button !== null && root.contains(button) && !button.hasAttribute('data-silent')) play(SND_INF_CLICK);
  };
  root.addEventListener('pointerdown', onPress);
  return () => root.removeEventListener('pointerdown', onPress);
}
