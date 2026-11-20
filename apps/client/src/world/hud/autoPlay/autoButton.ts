// custom (owner 2026-11-15): Auto Play's AUTO button, with no counterpart in Neuz: grey "AUTO" while the farm bot is off,
// gold while it runs, a "!" after it stopped (its reason in the tip). Desktop: at the right end above the task bar; phone:
// above the quick slot over Attack (style.css).
// 2026-11-20 (owner, "move Autoplay button icon to the place of Auto icon. Add an active autoplay indicator like a glow
// animation or rotate glow"): the button is Auto Play's own icon (the gear with the play sign, src/icons/big), no word;
// while the farm bot runs a gold glow turns round it (style.css); the "!" after a stop is a red badge. (A second finger's
// tap, while the first walks, clicks it too: secondFingerTaps.ts.)
// 2026-11-20 (owner, "the autoplay icon on display should open the autoplay window when clicked and not just stop and
// start the autoplay. stop and start should be inside the autoplay window"): a click (a tap) opens the Auto Play window, or
// closes it; it starts and stops nothing (the window's Start / Stop does, autoPlayWindow.ts). The glow and the "!" stay.

import autoPlayIcon from '../../../icons/big/icon_autoplay.png';

/** What the button reads of Auto Play. */
export interface AutoButtonPlay {
  readonly farm: 'off' | 'running' | 'stopped';
  readonly lastStop: string | null;
}

export class AutoButton {
  readonly element: HTMLButtonElement;
  private readonly mark: HTMLElement;
  private shown = '';

  /** `toggleWindow` opens the Auto Play window, or closes it while it is open. */
  constructor(private readonly play: AutoButtonPlay, toggleWindow: () => void, doc: Document = document) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'hud-auto-button';
    button.setAttribute('aria-label', 'Auto Play');
    const icon = doc.createElement('span');
    icon.className = 'hud-auto-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.style.backgroundImage = `url(${JSON.stringify(autoPlayIcon)})`;
    this.mark = doc.createElement('span');
    this.mark.className = 'hud-auto-mark';
    button.append(icon, this.mark);
    button.addEventListener('click', () => { toggleWindow(); button.blur(); });
    // no browser menu on a right-click or a phone's long press
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    this.element = button;
    this.refresh();
  }

  /** Draws the farm bot's state (each frame; only a change is drawn). */
  refresh(): void {
    const { farm, lastStop } = this.play;
    const key = `${farm}|${lastStop ?? ''}`;
    if (key === this.shown) return;
    this.shown = key;
    this.element.dataset.state = farm;
    this.mark.textContent = farm === 'stopped' ? '!' : '';
    this.element.title = farm === 'running' ? 'Auto Play: running'
      : farm === 'stopped' ? `Auto Play stopped: ${lastStop ?? ''}` : 'Auto Play';
  }
}

const STOPPED_TITLE = '(!) Stopped - ';

/** While the tab is hidden, the page's title says Auto Play stopped; it is put back when the tab is seen again. */
export function flashStoppedTitle(doc: Document): void {
  if (doc.visibilityState !== 'hidden' || doc.title.startsWith(STOPPED_TITLE)) return;
  const title = doc.title;
  doc.title = STOPPED_TITLE + title;
  const back = (): void => {
    if (doc.visibilityState === 'hidden') return;
    if (doc.title.startsWith(STOPPED_TITLE)) doc.title = title;
    doc.removeEventListener('visibilitychange', back);
  };
  doc.addEventListener('visibilitychange', back);
}
