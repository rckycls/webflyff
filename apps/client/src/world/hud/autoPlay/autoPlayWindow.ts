// custom (owner 2026-11-15): the Auto Play window, with no counterpart in Neuz (V15 has no bot, auto pots or auto
// skills): three tabs, Farm, Potions and Skills (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.11), in the
// look of the HUD's other windows: the frame of WindowFrame and the tab strip under the pages of Neuz's CWndTabCtrl
// (hud/guildCombat/tabs.ts). Slots are filled as the phone's Action Slot window fills its own: a tap on the slot opens a
// list to pick from, so desktop and phone work the same way. Numbers move with [-] and [+], so no keyboard is needed.

import type { UiArt } from '../art';
import { WindowFrame } from '../frame';
import { TabPages } from '../guildCombat/tabs';
import { textButton } from '../numpad';
import { BELOW, GAUGE_ROWS } from '../../autoplay/settings';
import type { AutoPlaySettings, GaugeRow } from '../../autoplay/settings';

/** An item a slot can take: its prop index, name, picture (a URL, or null) and how many the bag holds. */
export interface AutoPlayItemChoice {
  itemIndex: number;
  name: string;
  icon: string | null;
  count: number;
}

/** What the window reads of the game. */
export interface AutoPlayWindowDeps {
  /** The bag's potions, refreshers, drinks, food and pills, one entry per item index. */
  potionChoices(): AutoPlayItemChoice[];
  /** An item's name and picture by its index (a row's item may no longer be in the bag). */
  item(itemIndex: number): { name: string; icon: string | null } | null;
  /** How many of the item the bag holds. */
  count(itemIndex: number): number;
}

/** What the window edits: Auto Play's settings, kept after each change. */
export interface AutoPlayWindowPlay {
  settings: AutoPlaySettings;
  saved(): void;
}

export type AutoPlayTab = 'farm' | 'potions' | 'skills';
const TABS: readonly AutoPlayTab[] = ['farm', 'potions', 'skills'];
const TAB_LABELS = ['Farm', 'Potions', 'Skills'];
const ROW_NAMES: Record<GaugeRow, string> = { hp: 'HP', mp: 'MP', fp: 'FP' };

const WIDTH = 360;
const HEIGHT = 250;

export class AutoPlayWindow {
  readonly frame: WindowFrame;
  private readonly tabs: TabPages;
  /** The potion row whose pick list is open. */
  private picking: GaugeRow | null = null;
  /** What was drawn, as a string, to draw only what changed. */
  private shown = '';

  constructor(art: UiArt, private readonly play: AutoPlayWindowPlay, private readonly deps: AutoPlayWindowDeps,
    private readonly doc: Document = document) {
    this.frame = new WindowFrame('Auto Play', art, { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    this.frame.element.classList.add('hud-auto-play');
    this.tabs = new TabPages(doc, TAB_LABELS, () => { this.shown = ''; this.refresh(); });
    const holder = doc.createElement('div');
    holder.className = 'auto-play-tabs';
    holder.append(this.tabs.element);
    this.frame.body.append(holder);
    this.frame.onClose = () => { this.picking = null; this.shown = ''; };
    // Farm and Skills come with the farm bot and the auto skills (M2, M3)
    this.enableTab('farm', false);
    this.enableTab('skills', false);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Opens it centred on `tab`. */
  open(tab: AutoPlayTab = 'potions'): void {
    if (!this.frame.isOpen) this.frame.open('center');
    this.showTab(tab);
  }

  toggle(): void {
    if (this.frame.isOpen) this.frame.close();
    else this.open();
  }

  showTab(tab: AutoPlayTab): void {
    this.tabs.select(TABS.indexOf(tab));
  }

  enableTab(tab: AutoPlayTab, on: boolean): void {
    const button = this.tabs.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')[TABS.indexOf(tab)];
    if (button) button.disabled = !on;
  }

  /** Draws the shown tab as things are now (each frame while it is open; only a change is drawn). */
  refresh(): void {
    if (!this.frame.isOpen) return;
    const tab = TABS[this.tabs.selected];
    if (tab !== 'potions') return;
    const choices = this.picking === null ? [] : this.deps.potionChoices();
    const counts = GAUGE_ROWS.map((row) => this.deps.count(this.play.settings.pots.rows[row].itemIndex));
    const key = JSON.stringify([tab, this.play.settings.pots, this.picking, choices, counts]);
    if (key === this.shown) return;
    this.shown = key;
    this.tabs.pages[TABS.indexOf('potions')]!.replaceChildren(...this.potionsPage(choices, counts));
  }

  dispose(): void {
    this.frame.close();
    this.frame.element.remove();
  }

  /** A change from the window: keep it and draw it. */
  private changed(): void {
    this.play.saved();
    this.shown = '';
    this.refresh();
  }

  private potionsPage(choices: AutoPlayItemChoice[], counts: number[]): HTMLElement[] {
    const doc = this.doc, pots = this.play.settings.pots;
    const head = doc.createElement('label');
    head.className = 'auto-check auto-pots-on';
    const box = doc.createElement('input');
    box.type = 'checkbox';
    box.name = 'auto-pots';
    box.checked = pots.enabled;
    box.addEventListener('change', () => { pots.enabled = box.checked; this.changed(); });
    head.append(box, doc.createTextNode(' Auto pots'));

    const rows = GAUGE_ROWS.map((row, i) => this.potionRow(row, counts[i]!));
    const out: HTMLElement[] = [head, ...rows];
    if (this.picking !== null) out.push(this.pickList(this.picking, choices));
    return out;
  }

  private potionRow(row: GaugeRow, count: number): HTMLElement {
    const doc = this.doc, set = this.play.settings.pots.rows[row], name = ROW_NAMES[row];
    const line = doc.createElement('div');
    line.className = 'auto-pot-row';
    line.dataset.row = row;
    const label = doc.createElement('span');
    label.className = 'auto-pot-name';
    label.textContent = name;

    const slot = doc.createElement('button');
    slot.type = 'button';
    slot.className = 'auto-slot';
    slot.setAttribute('aria-label', `Choose the ${name} item`);
    const item = set.itemIndex > 0 ? this.deps.item(set.itemIndex) : null;
    slot.append(this.picture(item?.icon ?? null));
    slot.title = item?.name ?? (set.itemIndex > 0 ? '?' : 'Choose an item');
    slot.addEventListener('click', () => { this.picking = this.picking === row ? null : row; this.shown = ''; this.refresh(); });
    line.classList.toggle('is-missing', set.itemIndex > 0 && count === 0);

    const amount = doc.createElement('span');
    amount.className = 'auto-pot-count';
    amount.textContent = set.itemIndex > 0 ? `×${count}` : '';

    const lower = textButton(doc, '-', () => { set.below = Math.max(BELOW.min, set.below - BELOW.step); this.changed(); }, 'lower', 'autoPlay');
    lower.setAttribute('aria-label', `${name} lower`);
    const below = doc.createElement('span');
    below.className = 'auto-pot-below';
    below.textContent = `${set.below}%`;
    const higher = textButton(doc, '+', () => { set.below = Math.min(BELOW.max, set.below + BELOW.step); this.changed(); }, 'higher', 'autoPlay');
    higher.setAttribute('aria-label', `${name} higher`);

    const on = doc.createElement('input');
    on.type = 'checkbox';
    on.name = `auto-pot-on-${row}`;
    on.checked = set.on;
    on.setAttribute('aria-label', `Use the ${name} item`);
    on.addEventListener('change', () => { set.on = on.checked; this.changed(); });

    const clear = textButton(doc, '×', () => { set.itemIndex = 0; this.changed(); }, 'clear', 'autoPlay');
    clear.setAttribute('aria-label', `Clear the ${name} item`);
    clear.disabled = set.itemIndex <= 0;

    const use = doc.createElement('span');
    use.className = 'auto-pot-use';
    use.textContent = 'below';
    line.append(label, slot, amount, use, lower, below, higher, on, clear);
    return line;
  }

  private pickList(row: GaugeRow, choices: AutoPlayItemChoice[]): HTMLElement {
    const doc = this.doc;
    const list = doc.createElement('div');
    list.className = 'auto-pick-list';
    list.setAttribute('aria-label', `${ROW_NAMES[row]} items`);
    for (const choice of choices) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'auto-pick';
      button.append(this.picture(choice.icon), doc.createTextNode(`${choice.name} ×${choice.count}`));
      button.addEventListener('click', () => {
        this.play.settings.pots.rows[row].itemIndex = choice.itemIndex;
        this.picking = null;
        this.changed();
      });
      list.append(button);
    }
    if (choices.length === 0) {
      list.textContent = 'No potions or food in the bag.';
      list.dataset.empty = '';
    }
    return list;
  }

  private picture(url: string | null): HTMLElement {
    const icon = this.doc.createElement('span');
    icon.className = 'auto-icon';
    if (url !== null) icon.style.backgroundImage = `url(${JSON.stringify(url)})`;
    return icon;
  }
}
