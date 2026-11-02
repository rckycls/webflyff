/** Block browser zoom/selection gestures in the game while preserving its own pointer and double-click handlers. */
export function blockBrowserGestures(surface: HTMLElement, keys: EventTarget): () => void {
  const prevent = (event: Event): void => event.preventDefault();
  const wheel = (event: Event): void => {
    const gesture = event as WheelEvent;
    if (gesture.ctrlKey || gesture.metaKey) event.preventDefault();
  };
  const key = (event: Event): void => {
    const shortcut = event as KeyboardEvent;
    if ((shortcut.ctrlKey || shortcut.metaKey) && ['+', '=', '-', '0'].includes(shortcut.key)) event.preventDefault();
  };
  const gestures = ['dblclick', 'gesturestart', 'gesturechange', 'gestureend'];
  for (const type of gestures) surface.addEventListener(type, prevent, { passive: false });
  surface.addEventListener('wheel', wheel, { passive: false });
  keys.addEventListener('keydown', key, true);
  return () => {
    for (const type of gestures) surface.removeEventListener(type, prevent);
    surface.removeEventListener('wheel', wheel);
    keys.removeEventListener('keydown', key, true);
  };
}
