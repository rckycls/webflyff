// Landscape for the whole game, from the login form to the world (Piece 4 spec §3.10). Every screen is laid out for a
// screen wider than tall (style.css); this keeps the game that way:
//
// - while the page is taller than wide, a cover hides the game and asks for it to be turned: "Turn your device sideways
//   to play." on a touch screen, "Make the window wider to play." on a PC (the plan's two texts). Nothing behind it is
//   paused or closed: the world steps, draws and takes the server's messages under it, and turning back shows it as it
//   went on (Review Focus 5). Covered, the game takes no press, key focus or screen reader (`inert`); the keys the world
//   reads from the window still reach it. The focus goes to the cover as it shows, and back where it was as it goes. A turn
//   of the device is looked at as it is said and again 300 ms later, for an iOS that gives the new size late.
// - play taps may request landscape orientation without requesting fullscreen. Unsupported locks are ignored;
//   the cover remains the fallback on phones and narrow desktop windows.
//
// Neuz has nothing of this: its window is the size the player picked, always wider than tall.

/** The plan's texts of the cover (plan-header's table of the texts not from the catalogs). */
const TOUCH_TEXT = 'Turn your device sideways to play.';
const PC_TEXT = 'Make the window wider to play.';

/** What `installLandscape` gives its owner. */
export interface Landscape {
  /**
   * On a touch screen, requests landscape orientation without fullscreen. A refusal is ignored; the cover applies.
   */
  requestLock(): Promise<void>;
  /** Takes the cover off and lets the game go. */
  dispose(): void;
}

/** `screen.orientation` as the browsers that have `lock` give it (TypeScript's DOM types leave `lock` out). */
interface LockableOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
}

/** How long after a turn of the device the cover looks again: iOS Safari has given the new size late, with no resize. */
const LATE_TURN_MS = 300;

/** The cover's rule, which the world screen also asks (it lets go of a finger held on the joystick): taller than wide. */
export function isUpright(view: Window): boolean {
  return view.innerHeight > view.innerWidth;
}

/**
 * Puts the cover beside `root` (the game's element, which the lobby and the world screen fill as they like) and shows it
 * whenever the page is taller than wide (`isUpright`), from now and at every resize or turn of the device. `isTouch`
 * says which text it shows (the touch rule, `watchTouch` of @flyffweb/scene), asked each time the page changes size,
 * and whether `requestLock` asks for anything.
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
  /** What had the focus as the cover showed: it gets it back as the cover goes, if it is still there and nothing took it. */
  let focused: HTMLElement | null = null;
  let lateTurn: ReturnType<typeof setTimeout> | undefined;

  const update = (): void => {
    const upright = isUpright(view);
    if (upright) {
      const wanted = isTouch() ? TOUCH_TEXT : PC_TEXT;
      if (text.textContent !== wanted) {
        text.textContent = wanted;
        cover.setAttribute('aria-label', wanted);
      }
    }
    if (upright === !cover.hidden) return;
    if (upright) {
      const active = doc.activeElement;
      focused = active instanceof view.HTMLElement && active !== doc.body ? active : null;
      cover.hidden = false;
      root.setAttribute('inert', '');
      // the focus, which the inert game lets go, goes to the cover as it shows: a screen reader says its text
      cover.focus({ preventScroll: true });
    } else {
      const coverHadFocus = doc.activeElement === cover;
      if (coverHadFocus) cover.blur();
      cover.hidden = true;
      root.removeAttribute('inert');
      const back = focused;
      focused = null;
      if (back !== null && back.isConnected && (coverHadFocus || doc.activeElement === doc.body)) back.focus({ preventScroll: true });
    }
  };
  const onTurn = (): void => {
    update();
    clearTimeout(lateTurn);
    lateTurn = setTimeout(update, LATE_TURN_MS);
  };
  update();
  view.addEventListener('resize', update);
  // a turn of the device: as it is said, and again a little later (`LATE_TURN_MS`)
  view.addEventListener('orientationchange', onTurn);

  return {
    async requestLock() {
      if (!isTouch()) return;
      try {
        await (view.screen.orientation as LockableOrientation | undefined)?.lock?.('landscape');
      } catch {
        // refused (not in full screen, not a phone, not supported): the cover still applies
      }
    },
    dispose() {
      view.removeEventListener('resize', update);
      view.removeEventListener('orientationchange', onTurn);
      clearTimeout(lateTurn);
      root.removeAttribute('inert');
      cover.remove();
    },
  };
}
