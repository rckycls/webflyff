// Landscape for the whole game, from the login form to the world (Piece 4 spec §3.10). Every screen is laid out for a
// screen wider than tall (style.css); this keeps the game that way:
//
// - while the page is taller than wide, a cover hides the game and asks for it to be turned: "Turn your device sideways
//   to play." on a touch screen, "Make the window wider to play." on a PC (the plan's two texts). Nothing behind it is
//   paused or closed: the world steps, draws and takes the server's messages under it, and turning back shows it as it
//   went on (Review Focus 5). Covered, the game takes no press, key focus or screen reader (`inert`); the keys the world
//   reads from the window still reach it.
// - on a touch screen, the taps that log in and enter the world (`requestLock`, LobbyApp) ask for full screen and then
//   `screen.orientation.lock('landscape')`, which Android Chrome allows (from full screen only). iOS Safari allows
//   neither, and any browser may refuse: a refusal is ignored, and the cover does the job. A PC is never put in full
//   screen: its cover asks for a wider window instead.
//
// Neuz has nothing of this: its window is the size the player picked, always wider than tall.

/** The plan's texts of the cover (plan-header's table of the texts not from the catalogs). */
const TOUCH_TEXT = 'Turn your device sideways to play.';
const PC_TEXT = 'Make the window wider to play.';

/** What `installLandscape` gives its owner. */
export interface Landscape {
  /**
   * On a touch screen, asks for full screen and then the landscape lock; resolves once both are answered, whatever the
   * answers. Called in a tap's handler, as a browser grants full screen only to a tap's: full screen is asked for before
   * this returns.
   */
  requestLock(): Promise<void>;
  /** Takes the cover off and lets the game go. */
  dispose(): void;
}

/** `screen.orientation` as the browsers that have `lock` give it (TypeScript's DOM types leave `lock` out). */
interface LockableOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
}

/**
 * Puts the cover beside `root` (the game's element, which the lobby and the world screen fill as they like) and shows it
 * whenever the page is taller than wide (`innerHeight > innerWidth`), from now and at every resize or turn of the device.
 * `isTouch` says which text it shows (`watchTouch`), asked each time the page changes size, and whether `requestLock`
 * asks for anything.
 */
export function installLandscape(root: HTMLElement, isTouch: () => boolean): Landscape {
  const doc = root.ownerDocument;
  const view = doc.defaultView ?? window;
  const cover = doc.createElement('div');
  cover.className = 'landscape-cover';
  cover.setAttribute('role', 'dialog');
  cover.setAttribute('aria-modal', 'true');
  cover.tabIndex = -1;
  cover.hidden = true;
  const icon = doc.createElement('div');
  icon.className = 'landscape-cover-icon';
  icon.setAttribute('aria-hidden', 'true');
  const text = doc.createElement('p');
  text.className = 'landscape-cover-text';
  cover.append(icon, text);
  doc.body.append(cover);

  const update = (): void => {
    const upright = view.innerHeight > view.innerWidth;
    if (upright) {
      const wanted = isTouch() ? TOUCH_TEXT : PC_TEXT;
      if (text.textContent !== wanted) {
        text.textContent = wanted;
        cover.setAttribute('aria-label', wanted);
      }
    }
    const showing = upright && cover.hidden;
    cover.hidden = !upright;
    if (upright) root.setAttribute('inert', '');
    else root.removeAttribute('inert');
    // the focus, which the inert game lets go, goes to the cover as it shows: a screen reader says its text
    if (showing) cover.focus({ preventScroll: true });
  };
  update();
  view.addEventListener('resize', update);
  // iOS Safari has given the new size by its orientationchange in some versions, and its resize late
  view.addEventListener('orientationchange', update);

  return {
    async requestLock() {
      if (!isTouch()) return;
      const page = doc.documentElement;
      // Android Chrome locks the orientation only in full screen; iOS Safari on an iPhone has no requestFullscreen
      try {
        if (doc.fullscreenElement == null && typeof page.requestFullscreen === 'function') {
          await page.requestFullscreen({ navigationUI: 'hide' });
        }
      } catch {
        // refused (not from a tap, not allowed): the cover still applies
      }
      try {
        await (view.screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
      } catch {
        // refused (not in full screen, not a phone, not supported): the cover still applies
      }
    },
    dispose() {
      view.removeEventListener('resize', update);
      view.removeEventListener('orientationchange', update);
      root.removeAttribute('inert');
      cover.remove();
    },
  };
}

/** Whether the player plays with a finger: asked again each time, as a first touch changes the answer. */
export type TouchWatch = (() => boolean) & { dispose(): void };

/**
 * The joystick's rule (`packages/scene/src/input/joystick.ts`, which the attack button follows): true where the main
 * pointer is a finger (`(pointer: coarse)`: phones, tablets), and on a computer with a touch screen besides its mouse from
 * its first touch on.
 */
export function watchTouch(view: Window): TouchWatch {
  let touched = false;
  const onTouch = (event: Event): void => {
    if ((event as PointerEvent).pointerType !== 'touch') return;
    touched = true;
    view.removeEventListener('pointerdown', onTouch, true);
  };
  view.addEventListener('pointerdown', onTouch, true);
  const isTouch = (): boolean => touched || view.matchMedia?.('(pointer: coarse)').matches === true;
  return Object.assign(isTouch, { dispose: () => view.removeEventListener('pointerdown', onTouch, true) });
}
