// custom (owner 2026-11-15): Auto Play's battery saver: a black screen with dim text over the game while the farm bot runs
// (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.10). While it shows, WorldScreen stops drawing the world
// (`onShow`); the rules keep stepping from the worker clock. It opens from the Farm tab, and by itself on a phone after 2
// minutes with no touch; a tap closes it; a stop closes it (the AUTO button and the chat then say why).

import type { Gauges } from '../../autoplay/potions';

/** No touch for this long while the farm bot runs, on a phone: the saver opens by itself (ms). */
export const SAVER_AFTER_MS = 120_000;
/** Its text is drawn at most this often (ms). */
const REDRAW_MS = 1000;

export interface SaverPlay {
  readonly farm: 'off' | 'running' | 'stopped';
  readonly lastStop: string | null;
  readonly phase: string;
  readonly stats: { lines(now: number): string[] };
}

export interface SaverDeps {
  isPhone(): boolean;
  gauges(): Gauges;
  /** The saver opened (true: stop drawing the world) or closed (false: draw again). */
  onShow(shown: boolean): void;
}

export class SaverScreen {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private readonly bars: Record<'hp' | 'mp' | 'fp', HTMLElement>;
  private isShown = false;
  private lastTouch = 0;
  private wasRunning = false;
  private drawnAt = -Infinity;

  constructor(private readonly play: SaverPlay, private readonly deps: SaverDeps, private readonly doc: Document = document) {
    const layer = doc.createElement('div');
    layer.className = 'hud-auto-saver';
    layer.hidden = true;
    layer.setAttribute('role', 'button');
    layer.setAttribute('aria-label', 'Auto Play running: tap to show the game');
    this.text = doc.createElement('div');
    this.text.className = 'saver-text';
    const gauges = doc.createElement('div');
    gauges.className = 'saver-gauges';
    const bar = (name: 'hp' | 'mp' | 'fp'): HTMLElement => {
      const row = doc.createElement('div');
      row.className = 'saver-gauge';
      row.dataset.gauge = name;
      const label = doc.createElement('span');
      label.textContent = name.toUpperCase();
      const track = doc.createElement('span');
      track.className = 'saver-track';
      const fill = doc.createElement('span');
      fill.className = 'saver-fill';
      track.append(fill);
      row.append(label, track);
      gauges.append(row);
      return fill;
    };
    this.bars = { hp: bar('hp'), mp: bar('mp'), fp: bar('fp') };
    const hint = doc.createElement('div');
    hint.className = 'saver-hint';
    hint.textContent = 'Tap to show the game';
    layer.append(this.text, gauges, hint);
    layer.addEventListener('click', () => this.hide());
    this.element = layer;
  }

  get shown(): boolean {
    return this.isShown;
  }

  show(): void {
    if (this.isShown) return;
    this.isShown = true;
    this.element.hidden = false;
    this.drawnAt = -Infinity;
    this.draw(this.lastTouch);
    this.deps.onShow(true);
  }

  hide(): void {
    if (!this.isShown) return;
    this.isShown = false;
    this.element.hidden = true;
    this.deps.onShow(false);
  }

  /** The player touched the screen or pressed a key. */
  touched(now: number): void {
    this.lastTouch = now;
  }

  /** Each rules step: open by itself on a phone, close at a stop, redraw the text once a second. */
  step(now: number): void {
    const running = this.play.farm === 'running';
    if (running && !this.wasRunning) this.lastTouch = now;
    this.wasRunning = running;
    if (this.isShown) {
      if (!running) { this.hide(); return; }
      this.draw(now);
      return;
    }
    if (running && this.deps.isPhone() && now - this.lastTouch >= SAVER_AFTER_MS) this.show();
  }

  private draw(now: number): void {
    if (now - this.drawnAt < REDRAW_MS) return;
    this.drawnAt = now;
    this.text.textContent = ['Auto Play running', ...this.play.stats.lines(now), `Now: ${this.play.phase}`].join('\n');
    const g = this.deps.gauges();
    const percent = (value: number, max: number) => `${max > 0 ? Math.round((Math.max(0, value) * 100) / max) : 0}%`;
    this.bars.hp.style.width = percent(g.hp, g.maxHp);
    this.bars.mp.style.width = percent(g.mp, g.maxMp);
    this.bars.fp.style.width = percent(g.fp, g.maxFp);
  }
}
