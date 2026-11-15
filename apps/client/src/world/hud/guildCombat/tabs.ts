// A strip of tabs under pages (2026-11-15, B6): `CWndTabCtrl` of the siege's result and ranking windows (WndField.cpp:17547-17590,
// 17746-17791): the pages above, the strip of tabs under them, one page shown at a time.
// 2026-11-15 (consistency scan): the strip drawn as Neuz's tab control is, on its WndTabTile pictures (`tabStrip`, the bank's,
// the mail's, the Motion and couple windows'), in place of the web's grey boxes; laid again at the control's width as it is
// shown (a phone's panel is wider or narrower than the desktop's rect).

import type { UiArt } from '../art';
import { tabStrip } from '../tiles';

export class TabPages {
  readonly element: HTMLElement;
  readonly pages: HTMLElement[] = [];
  private readonly labels: string[];
  private readonly strip: HTMLElement;
  private current = -1;
  private drawnWidth = 0;

  constructor(
    private readonly doc: Document, private readonly art: UiArt, labels: readonly string[], private readonly width: number,
    private readonly onSelect: (index: number) => void = () => {},
  ) {
    this.labels = [...labels];
    this.element = doc.createElement('div');
    this.element.className = 'hud-gc-tabctrl';
    this.strip = doc.createElement('div');
    this.strip.className = 'hud-gc-tabs';
    this.strip.setAttribute('role', 'tablist');
    this.labels.forEach(() => {
      const page = doc.createElement('div');
      page.className = 'hud-gc-page';
      page.setAttribute('role', 'tabpanel');
      page.hidden = true;
      this.pages.push(page);
    });
    this.element.append(...this.pages, this.strip);
    this.draw();
    // the control laid out at another width (the phone's panel, a turn of the device): the strip laid again
    const view = doc.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
    if (view?.ResizeObserver !== undefined) {
      new view.ResizeObserver(() => { if (this.measured() !== this.drawnWidth) this.draw(); }).observe(this.element);
    }
  }

  get selected(): number {
    return this.current;
  }

  setLabel(index: number, label: string): void {
    if (this.labels[index] === label) return;
    this.labels[index] = label;
    this.draw();
  }

  select(index: number): void {
    this.current = index;
    this.pages.forEach((page, i) => { page.hidden = i !== index; });
    this.draw();
    this.onSelect(index);
  }

  /** The control's width as shown, or the rect's while it is not laid out. */
  private measured(): number {
    return this.element.clientWidth > 0 ? this.element.clientWidth : this.width;
  }

  /** The strip at the control's width, the chosen tab drawn over it (`tabStrip`); its titles are the tabs. */
  private draw(): void {
    const width = this.measured();
    this.drawnWidth = width;
    const strip = tabStrip(this.doc, this.art, width, this.labels, Math.max(0, this.current), (i) => this.select(i));
    strip.querySelectorAll<HTMLElement>('.hud-tab-title').forEach((tab, i) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === this.current));
      tab.classList.toggle('is-chosen', i === this.current);
    });
    this.strip.replaceChildren(strip);
  }
}
