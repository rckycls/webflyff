// 2026-11-20 (loading screen): the picture over the world screen while a world loads, as V15 draws it on a change of
// world, with the owner's additions: the first entry too, a real progress bar and the sides of a wide screen filled.
//
//   CDPClient::OnReplace  Source/Neuz/DPClient.cpp:2315-2359  the picture, full screen; on a wide screen the 4:3 picture
//                                                            in the middle (black sides there; here a dark blur of it)
//   CNeuzApp::Render      Source/Neuz/Neuz.cpp:849-900        once the own mover is in, the picture fades, alpha -6 a
//                                                            frame: 255 / 6 frames at 60 a second, 0.7 s
//
// The layer reads what has come (`LoadParts`) on each animation frame and shows it as a bar that never goes back. The bar
// is V15's gauge picture (`GauEmptyNormal.bmp`, cut in three as `CTheme::MakeGaugeVertex` cuts it), under the picture's
// "Now Loading" badge, with the percent beside it. Once the world has been drawn, the bar is full and the layer fades
// over the world, which can be played through it. The words "Entering the world…" stay for screen readers.

import { cssRgb, themeKey, themeUrl } from '../hud/art';
import type { UiArt } from '../hud/art';
import { loadFraction } from './loadProgress';
import type { LoadParts } from './loadProgress';

/** Neuz's fade: alpha 255 down by 6 a frame. */
export const FADE_MS = 700;
/** Shown over the world this long without its first frame, the layer goes anyway: a world that cannot draw is not hidden. */
const COVER_LIMIT_MS = 5000;
const GAUGE = 'GauEmptyNormal.bmp';
/** The track's colour and the fill's (ARGB, the picture multiplied by it, as `CTheme::RenderGauge` does). */
const TRACK_COLOR = 0xd2303030;
const FILL_COLOR = 0xff5ab4ff;

/** A gauge of three pieces that scales with its box: the caps a third of the height wide, the middle stretched. */
function gauge(doc: Document, art: UiArt | null, color: number, name: string): HTMLElement {
  const element = doc.createElement('div');
  element.className = 'world-loading-gauge';
  element.dataset.gauge = name;
  element.style.opacity = String(((color >>> 24) & 0xff) / 255);
  // a picture the store lacks would mask the whole bar away: a plain bar then
  const url = art === null || art.url(themeKey(GAUGE)) === '' ? 'none' : themeUrl(art, GAUGE);
  for (const position of ['0%', '50%', '100%']) {
    const piece = doc.createElement('div');
    piece.style.backgroundColor = cssRgb(color);
    piece.style.backgroundImage = url;
    piece.style.setProperty('-webkit-mask-image', url);
    piece.style.setProperty('mask-image', url);
    for (const prefix of ['background', '-webkit-mask', 'mask']) piece.style.setProperty(`${prefix}-position`, `${position} 0`);
    element.append(piece);
  }
  return element;
}

export class LoadingScreen {
  readonly element: HTMLElement;
  private readonly blur: HTMLElement;
  private readonly art: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly percent: HTMLElement;
  private fill: HTMLElement | null = null;
  /** The fraction on screen: it only grows. */
  private shown = 0;
  private frameId = 0;
  private read: (() => LoadParts) | null = null;
  /** When the layer went over the world (`cover`), or null while the world is not on the page. */
  private coveredAt: number | null = null;
  private fading = false;
  private disposed = false;

  constructor(private readonly doc: Document, text: string) {
    const div = (className: string): HTMLElement => {
      const element = doc.createElement('div');
      element.className = className;
      return element;
    };
    this.element = div('world-loading');
    this.blur = div('world-loading-blur');
    const box = div('world-loading-box');
    this.art = div('world-loading-art');
    this.bar = div('world-loading-bar');
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-label', 'Loading');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.percent = div('world-loading-percent');
    const status = doc.createElement('p');
    status.className = 'world-status';
    status.setAttribute('role', 'status');
    status.textContent = text;
    box.append(this.art, this.bar, this.percent);
    this.element.append(this.blur, box, status);
    this.setArt(null);
    this.draw(0);
  }

  /** The picture, shown once it is decoded (the layer stays dark before, and without one: no convert yet). */
  setPicture(url: string | null): void {
    if (url === null || url === '') return;
    const view = this.doc.defaultView ?? window;
    const picture = new view.Image();
    picture.src = url;
    const show = (): void => {
      if (this.disposed) return;
      const css = `url(${JSON.stringify(url)})`;
      this.art.style.backgroundImage = css;
      this.blur.style.backgroundImage = css;
      this.element.dataset.picture = url;
    };
    picture.decode().then(show, () => { /* a picture that cannot be had: the dark layer and the bar */ });
  }

  /** The gauge's pictures, from the asset store (drawn as plain bars until then). */
  setArt(art: UiArt | null): void {
    this.bar.replaceChildren(gauge(this.doc, art, TRACK_COLOR, 'track'));
    this.fill = gauge(this.doc, art, FILL_COLOR, 'fill');
    this.bar.append(this.fill);
    this.draw(this.shown);
  }

  /** Reads `read` on each animation frame until the world is drawn, then fades. */
  start(read: () => LoadParts): void {
    this.read = read;
    if (this.frameId === 0 && !this.disposed) this.frameId = (this.doc.defaultView ?? window).requestAnimationFrame(this.tick);
  }

  /** The layer is now over the world and its windows (they are on the page under it), until the fade has run. */
  cover(): void {
    this.coveredAt = performance.now();
    this.element.classList.add('world-loading-over');
  }

  /** Reading stops, and the layer stays as it is (a dropped connection: the drop box goes over it). */
  stop(): void {
    this.read = null;
    if (this.frameId !== 0) (this.doc.defaultView ?? window).cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  /** The bar full, then the fade on the next frame; the layer leaves the page when it is over. */
  finish(): void {
    if (this.fading || this.disposed) return;
    this.fading = true;
    this.stop();
    this.draw(1);
    const view = this.doc.defaultView ?? window;
    view.requestAnimationFrame(() => {
      if (this.disposed) return;
      this.element.classList.add('world-loading-over', 'world-loading-fading');
      this.element.addEventListener('transitionend', (event) => { if (event.target === this.element) this.dispose(); });
      // a page in the background runs no transition: the layer goes anyway
      view.setTimeout(() => this.dispose(), FADE_MS + 200);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.element.remove();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  private readonly tick = (): void => {
    this.frameId = 0;
    const read = this.read;
    if (read === null || this.disposed) return;
    const parts = read();
    this.draw(loadFraction(parts));
    const late = this.coveredAt !== null && performance.now() - this.coveredAt > COVER_LIMIT_MS;
    if (parts.drawn || late) {
      this.finish();
      return;
    }
    this.frameId = (this.doc.defaultView ?? window).requestAnimationFrame(this.tick);
  };

  private draw(fraction: number): void {
    this.shown = Math.max(this.shown, Math.min(1, fraction));
    const percent = Math.floor(this.shown * 100);
    // under two caps' width the fill is not drawn (MakeGaugeVertex: under two slices nothing is made)
    if (this.fill !== null) {
      this.fill.style.width = `${this.shown * 100}%`;
      this.fill.hidden = percent < 2;
    }
    this.percent.textContent = `${percent}%`;
    this.bar.setAttribute('aria-valuenow', String(percent));
  }
}
