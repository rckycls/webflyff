// 2026-11-15 (owner, "the screen is moving to the right with a left margin when opening a keyboard"): the game's screen never
// scrolls. A browser brings a focused text box into view by scrolling the page and every ancestor that can scroll, the
// world's `overflow: hidden` layers among them (iOS Safari does so even with the game's keyboard in place of its own): the
// whole game then stands off by that much, with an empty band at one side. This puts the page and the game's own layers
// back at 0 whenever they scroll; the windows' own lists and boxes (their bodies, the chat) scroll as they please.

/** The game's layers that are never scrolled: the world, its 3D view, its HUD layer. */
export const PINNED = '.world, .world-view, .world-hud';

export interface ScrollPin {
  dispose(): void;
}

/** Keeps the page and `PINNED` elements under `root` at scroll 0. */
export function pinScroll(root: HTMLElement): ScrollPin {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const reset = (element: Element): void => {
    if (element.scrollLeft !== 0) element.scrollLeft = 0;
    if (element.scrollTop !== 0) element.scrollTop = 0;
  };
  const page = (): void => {
    if (view !== null && (view.scrollX !== 0 || view.scrollY !== 0)) view.scrollTo(0, 0);
    const scrolling = doc.scrollingElement as Element | null | undefined;
    if (scrolling != null) reset(scrolling);
  };
  const all = (): void => {
    page();
    if (root.matches(PINNED)) reset(root);
    for (const element of root.querySelectorAll(PINNED)) reset(element);
  };
  const onScroll = (event: Event): void => {
    const target = event.target;
    if (target === doc || target === doc.documentElement || target === doc.body) page();
    else if (target instanceof Element && target.matches(PINNED) && (root === target || root.contains(target))) reset(target);
  };
  // a focus scrolls before or after its event, as the browser likes: looked at again on the next frame and a little later
  const onFocus = (): void => {
    all();
    view?.requestAnimationFrame?.(all);
    view?.setTimeout(all, 300);
  };
  doc.addEventListener('scroll', onScroll, true);
  doc.addEventListener('focusin', onFocus, true);
  view?.visualViewport?.addEventListener('scroll', page);
  return {
    dispose(): void {
      doc.removeEventListener('scroll', onScroll, true);
      doc.removeEventListener('focusin', onFocus, true);
      view?.visualViewport?.removeEventListener('scroll', page);
    },
  };
}
