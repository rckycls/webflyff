// A strip of tabs under pages (2026-11-15, B6): `CWndTabCtrl` of the siege's result and ranking windows (WndField.cpp:17547-17590,
// 17746-17791): the pages above, the strip of tabs under them, one page shown at a time.

export class TabPages {
  readonly element: HTMLElement;
  readonly pages: HTMLElement[] = [];
  private readonly tabs: HTMLButtonElement[] = [];
  private current = -1;

  constructor(doc: Document, labels: readonly string[], private readonly onSelect: (index: number) => void = () => {}) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-gc-tabctrl';
    const strip = doc.createElement('div');
    strip.className = 'hud-gc-tabs';
    strip.setAttribute('role', 'tablist');
    labels.forEach((label, i) => {
      const page = doc.createElement('div');
      page.className = 'hud-gc-page';
      page.setAttribute('role', 'tabpanel');
      page.hidden = true;
      const tab = doc.createElement('button');
      tab.type = 'button';
      tab.className = 'hud-gc-tab';
      tab.setAttribute('role', 'tab');
      tab.textContent = label;
      tab.addEventListener('click', () => this.select(i));
      this.pages.push(page);
      this.tabs.push(tab);
      strip.append(tab);
    });
    this.element.append(...this.pages, strip);
  }

  get selected(): number {
    return this.current;
  }

  setLabel(index: number, label: string): void {
    this.tabs[index]!.textContent = label;
  }

  select(index: number): void {
    this.current = index;
    this.pages.forEach((page, i) => { page.hidden = i !== index; });
    this.tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.classList.toggle('is-chosen', i === index);
    });
    this.onSelect(index);
  }
}
