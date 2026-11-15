// custom (owner 2026-11-15): the Auto Play window, with no counterpart in Neuz (V15 has no bot, auto pots or auto
// skills): three tabs, Farm, Potions and Skills (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.11), in the
// look of the HUD's other windows: the frame of WindowFrame and the tab strip under the pages of Neuz's CWndTabCtrl
// (hud/guildCombat/tabs.ts). Slots are filled as the phone's Action Slot window fills its own: a tap on the slot opens a
// list to pick from, so desktop and phone work the same way. Numbers move with [-] and [+], so no keyboard is needed.

import type { UiArt } from '../art';
import { WindowFrame } from '../frame';
import { TabPages } from '../guildCombat/tabs';
import { textButton } from '../numpad';
import { BELOW, GAUGE_ROWS, RADIUS, STOP_AFTER } from '../../autoplay/settings';
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
  /** Whether the farm bot may run here (the world, a duel). */
  farmAllowed(): boolean;
  /** The rules' clock (ms), for the counts' time. */
  now(): number;
}

/** What the window edits and shows: Auto Play's settings (kept after each change) and the farm bot. */
export interface AutoPlayWindowPlay {
  settings: AutoPlaySettings;
  saved(): void;
  readonly farm: 'off' | 'running' | 'stopped';
  readonly phase: string;
  readonly lastStop: string | null;
  readonly bagIsFull: boolean;
  readonly stats: { lines(now: number): string[] };
  start(): boolean;
  stop(reason: string): void;
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
    // Skills comes with the auto skills (M3)
    this.enableTab('skills', false);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Opens it centred on `tab`. */
  open(tab: AutoPlayTab = 'farm'): void {
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
    if (tab === 'farm') { this.refreshFarm(); return; }
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

  private refreshFarm(): void {
    const play = this.play, allowed = this.deps.farmAllowed();
    const lines = play.farm === 'off' ? [] : play.stats.lines(this.deps.now());
    const key = JSON.stringify(['farm', play.settings.farm, play.farm, play.phase, play.lastStop, play.bagIsFull, allowed, lines]);
    if (key === this.shown) return;
    this.shown = key;
    this.tabs.pages[TABS.indexOf('farm')]!.replaceChildren(this.farmPage(allowed, lines));
  }

  private farmPage(allowed: boolean, lines: string[]): HTMLElement {
    const doc = this.doc, play = this.play, farm = play.settings.farm;
    const page = doc.createElement('div');
    page.className = 'auto-farm';

    const radius = doc.createElement('div');
    radius.className = 'auto-farm-line';
    const radiusText = doc.createElement('span');
    radiusText.className = 'auto-farm-radius';
    radiusText.textContent = `${farm.radius} m`;
    radius.append(this.caption('Radius'),
      this.stepButton('-', 'Radius smaller', () => { farm.radius = Math.max(RADIUS.min, farm.radius - RADIUS.step); }),
      radiusText,
      this.stepButton('+', 'Radius larger', () => { farm.radius = Math.min(RADIUS.max, farm.radius + RADIUS.step); }));

    const loot = doc.createElement('label');
    loot.className = 'auto-check';
    const lootBox = doc.createElement('input');
    lootBox.type = 'checkbox';
    lootBox.name = 'auto-loot';
    lootBox.checked = farm.loot;
    lootBox.addEventListener('change', () => { farm.loot = lootBox.checked; this.changed(); });
    loot.append(lootBox, doc.createTextNode(' Pick up drops'));

    const after = doc.createElement('div');
    after.className = 'auto-farm-line';
    const afterText = doc.createElement('span');
    afterText.className = 'auto-farm-stop-after';
    afterText.textContent = farm.stopAfterMin === 0 ? 'off' : `${farm.stopAfterMin / 60}h`;
    after.append(this.caption('Stop after'),
      this.stepButton('-', 'Stop sooner', () => {
        farm.stopAfterMin = farm.stopAfterMin <= STOP_AFTER.min ? 0 : farm.stopAfterMin - STOP_AFTER.step;
      }),
      afterText,
      this.stepButton('+', 'Stop later', () => { farm.stopAfterMin = Math.min(STOP_AFTER.max, farm.stopAfterMin + STOP_AFTER.step); }));

    const running = play.farm === 'running';
    const go = textButton(doc, running ? 'Stop' : 'Start', () => {
      if (play.farm === 'running') play.stop('you took control');
      else play.start();
      this.shown = '';
      this.refresh();
    }, 'go', 'autoPlay');
    go.className = 'auto-farm-go';
    go.disabled = !running && !allowed;

    const state = doc.createElement('div');
    state.className = 'auto-farm-state';
    state.textContent = running ? `Running: ${play.phase}${play.bagIsFull ? ' (bag full)' : ''}`
      : play.farm === 'stopped' ? `Stopped: ${play.lastStop ?? ''}` : allowed ? 'Off' : 'Not allowed here.';
    const stats = doc.createElement('div');
    stats.className = 'auto-farm-stats';
    stats.textContent = lines.join('  ');

    page.append(radius, loot, after, go, state, stats);
    return page;
  }

  private caption(text: string): HTMLElement {
    const span = this.doc.createElement('span');
    span.className = 'auto-farm-caption';
    span.textContent = text;
    return span;
  }

  /** A [-] or [+] that changes a setting, then keeps and draws it. */
  private stepButton(label: string, name: string, change: () => void): HTMLButtonElement {
    const button = textButton(this.doc, label, () => { change(); this.changed(); }, label === '-' ? 'lower' : 'higher', 'autoPlay');
    button.setAttribute('aria-label', name);
    return button;
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
