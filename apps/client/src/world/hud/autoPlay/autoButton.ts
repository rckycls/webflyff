// custom (owner 2026-11-15): Auto Play's AUTO button, with no counterpart in Neuz: grey "AUTO" while the farm bot is off,
// gold while it runs, a "!" after it stopped (its reason in the tip). A click starts or stops the farm bot with the saved
// settings; a right-click (a long press on a phone, M4) opens the Auto Play window. Desktop: at the right end above the
// task bar (style.css).

/** What the button reads and drives of Auto Play. */
export interface AutoButtonPlay {
  readonly farm: 'off' | 'running' | 'stopped';
  readonly lastStop: string | null;
  start(): boolean;
  stop(reason: string): void;
}

export class AutoButton {
  readonly element: HTMLButtonElement;
  private readonly mark: HTMLElement;
  private shown = '';

  constructor(private readonly play: AutoButtonPlay, private readonly openWindow: () => void, doc: Document = document) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'hud-auto-button';
    button.setAttribute('aria-label', 'Auto Play');
    const text = doc.createElement('span');
    text.className = 'hud-auto-text';
    text.textContent = 'AUTO';
    this.mark = doc.createElement('span');
    this.mark.className = 'hud-auto-mark';
    button.append(text, this.mark);
    button.addEventListener('click', () => {
      if (this.play.farm === 'running') this.play.stop('you took control');
      else this.play.start();
      this.refresh();
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.openWindow();
    });
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
    this.element.title = farm === 'running' ? 'Auto Play: running (click to stop)'
      : farm === 'stopped' ? `Auto Play stopped: ${lastStop ?? ''}` : 'Auto Play (click to start, right-click for settings)';
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
