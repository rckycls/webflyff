// custom (owner 2026-11-15): the Auto Play window, with no counterpart in Neuz (V15 has no bot, auto pots or auto
// skills): three tabs, Farm, Potions and Skills (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.11), in the
// look of the HUD's other windows: the frame of WindowFrame and the tab strip under the pages of Neuz's CWndTabCtrl
// (hud/guildCombat/tabs.ts). Slots are filled as the phone's Action Slot window fills its own: a tap on the slot opens a
// list to pick from, so desktop and phone work the same way. Numbers move with [-] and [+], so no keyboard is needed.
// custom (owner 2026-11-16): a fourth tab, Loot, the loot filter (items/lootFilter.ts): the kinds of item the pick-up pet
// and the farm bot may pick up (docs/superpowers/plans/2026-11-16-pet-loot-filter.md).

import { themeUrl } from '../art';
import type { UiArt } from '../art';
import { radioFrame } from '../radio';
import { WindowFrame } from '../frame';
import { TabPages } from '../guildCombat/tabs';
import { textButton } from '../numpad';
import { LOOT_ALL, LOOT_KINDS, LOOT_KIND_LABELS, lootBit } from '../../items/lootFilter';
import { BELOW, GAUGE_ROWS, MAX_BUFFS, MAX_READY, RADIUS, STOP_AFTER } from '../../autoplay/settings';
import type { AutoPlaySettings, GaugeRow } from '../../autoplay/settings';

/** An item a slot can take: its prop index, name, picture (a URL, or null) and how many the bag holds. */
export interface AutoPlayItemChoice {
  itemIndex: number;
  name: string;
  icon: string | null;
  count: number;
}

/** A learned skill a slot can take: its skill slot (`m_aJobSkill`), name and picture. */
export interface AutoPlaySkillChoice {
  skillIndex: number;
  name: string;
  icon: string | null;
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
  /** The player's learned skills, in skill slot order. */
  skillChoices(): AutoPlaySkillChoice[];
  /** A skill slot's name and picture, or null when the character has no skill there now. */
  skill(skillIndex: number): AutoPlaySkillChoice | null;
  /** The bag's buff items (not worn, with an effect that is not a heal), one entry per item index. */
  buffItemChoices(): AutoPlayItemChoice[];
  /** Opens the battery saver screen (M4). */
  showSaver?(): void;
  /** 2026-11-17 (owner): the monster kinds inside the radius now (around the start point while farming), nearest first. */
  monstersNear?(): Array<{ index: number; name: string; level: number; count: number }>;
  /** A monster kind's name, for a chosen kind no longer near. */
  monsterName?(index: number): string;
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

export type AutoPlayTab = 'farm' | 'potions' | 'skills' | 'loot';
const TABS: readonly AutoPlayTab[] = ['farm', 'potions', 'skills', 'loot'];
const TAB_LABELS = ['Farm', 'Potions', 'Skills', 'Loot'];
const ROW_NAMES: Record<GaugeRow, string> = { hp: 'HP', mp: 'MP', fp: 'FP' };

const WIDTH = 360;
const HEIGHT = 290; // 2026-11-17: the Farm tab's monster options (was 250)

export class AutoPlayWindow {
  readonly frame: WindowFrame;
  private readonly tabs: TabPages;
  /** The potion row whose pick list is open. */
  private picking: GaugeRow | null = null;
  /** The Skills tab's slot whose pick list is open. */
  private pickingSkill: { list: 'ready' | 'buffs'; slot: number } | null = null;
  /** The Farm tab's list of monster kinds is open. */
  private choosingKinds = false;
  /** What was drawn, as a string, to draw only what changed. */
  private shown = '';

  constructor(private readonly art: UiArt, private readonly play: AutoPlayWindowPlay, private readonly deps: AutoPlayWindowDeps,
    private readonly doc: Document = document) {
    this.frame = new WindowFrame('Auto Play', art, { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    this.frame.element.classList.add('hud-auto-play');
    // 2026-11-16 (owner): above the phone's open bag (`overBag`)
    this.frame.overBag = true;
    // (merge with the consistency scan) the strip on Neuz's WndTabTile pictures, at the body's width inside its 4 px padding
    this.tabs = new TabPages(doc, art, TAB_LABELS, WIDTH - 8, () => { this.shown = ''; this.refresh(); });
    const holder = doc.createElement('div');
    holder.className = 'auto-play-tabs';
    holder.append(this.tabs.element);
    this.frame.body.append(holder);
    this.frame.onClose = () => { this.picking = null; this.pickingSkill = null; this.choosingKinds = false; this.shown = ''; };
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
    if (tab === 'skills') { this.refreshSkills(); return; }
    if (tab === 'loot') { this.refreshLoot(); return; }
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

  private refreshSkills(): void {
    const skills = this.play.settings.skills, picking = this.pickingSkill;
    const named = [...skills.ready.map((i) => this.deps.skill(i)), ...skills.buffs.map((e) => (e.kind === 'skill' ? this.deps.skill(e.index) : this.deps.item(e.index)))];
    const counts = skills.buffs.map((e) => (e.kind === 'item' ? this.deps.count(e.index) : 0));
    const choices = picking === null ? null : [this.deps.skillChoices(), picking.list === 'buffs' ? this.deps.buffItemChoices() : []];
    const key = JSON.stringify(['skills', skills, picking, named, counts, choices]);
    if (key === this.shown) return;
    this.shown = key;
    this.tabs.pages[TABS.indexOf('skills')]!.replaceChildren(this.skillsPage());
  }

  private skillsPage(): HTMLElement {
    const doc = this.doc, skills = this.play.settings.skills;
    const page = doc.createElement('div');
    page.className = 'auto-skills';
    const slot = this.check('auto-action-slot', 'Use Action Slot', skills.actionSlot, (on) => { skills.actionSlot = on; });
    page.append(slot,
      this.slotRow('ready', 'Ready skills', MAX_READY, 'ready skill'),
      this.slotRow('buffs', 'Buffs', MAX_BUFFS, 'buff'));
    if (this.pickingSkill !== null) page.append(this.skillPickList(this.pickingSkill));
    return page;
  }

  /** A row of `size` slots for the ready skills or the buffs: filled ones first, then the next empty one, greyed after. */
  private slotRow(list: 'ready' | 'buffs', caption: string, size: number, name: string): HTMLElement {
    const doc = this.doc, skills = this.play.settings.skills;
    const row = doc.createElement('div');
    row.className = `auto-slot-row auto-${list}`;
    row.append(this.caption(caption));
    const filled = list === 'ready' ? skills.ready.length : skills.buffs.length;
    for (let i = 0; i < size; i++) {
      const cell = doc.createElement('span');
      cell.className = 'auto-slot-cell';
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'auto-slot';
      button.setAttribute('aria-label', `Choose ${name} ${i + 1}`);
      button.disabled = i > filled;
      let shown: { name: string; icon: string | null } | null = null;
      if (i < filled) {
        if (list === 'ready') shown = this.deps.skill(skills.ready[i]!);
        else {
          const entry = skills.buffs[i]!;
          shown = entry.kind === 'skill' ? this.deps.skill(entry.index) : this.deps.item(entry.index);
          if (entry.kind === 'item' && this.deps.count(entry.index) === 0) button.classList.add('is-missing');
        }
        if (shown === null) button.classList.add('is-missing');
      }
      button.append(this.picture(shown?.icon ?? null));
      button.title = shown?.name ?? (i < filled ? '?' : 'Choose');
      button.addEventListener('click', () => {
        const same = this.pickingSkill?.list === list && this.pickingSkill.slot === i;
        this.pickingSkill = same ? null : { list, slot: i };
        this.shown = '';
        this.refresh();
      });
      cell.append(button);
      if (i < filled) {
        const clear = this.word('×', () => {
          if (list === 'ready') skills.ready.splice(i, 1);
          else skills.buffs.splice(i, 1);
          this.pickingSkill = null;
          this.changed();
        }, 'clear', 'autoPlay');
        clear.classList.add('auto-slot-clear');
        clear.setAttribute('aria-label', `Clear ${name} ${i + 1}`);
        cell.append(clear);
      }
      row.append(cell);
    }
    return row;
  }

  private skillPickList(at: { list: 'ready' | 'buffs'; slot: number }): HTMLElement {
    const doc = this.doc, skills = this.play.settings.skills;
    const list = doc.createElement('div');
    list.className = 'auto-pick-list';
    const put = (choose: () => void) => {
      choose();
      this.pickingSkill = null;
      this.changed();
    };
    for (const skill of this.deps.skillChoices()) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'auto-pick';
      button.append(this.picture(skill.icon), doc.createTextNode(skill.name));
      button.addEventListener('click', () => put(() => {
        if (at.list === 'ready') skills.ready[at.slot] = skill.skillIndex;
        else skills.buffs[at.slot] = { kind: 'skill', index: skill.skillIndex };
      }));
      list.append(button);
    }
    if (at.list === 'buffs') {
      for (const item of this.deps.buffItemChoices()) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'auto-pick';
        button.append(this.picture(item.icon), doc.createTextNode(`${item.name} ×${item.count}`));
        button.addEventListener('click', () => put(() => { skills.buffs[at.slot] = { kind: 'item', index: item.itemIndex }; }));
        list.append(button);
      }
    }
    if (list.childElementCount === 0) {
      list.textContent = 'No skill learned yet.';
      list.dataset.empty = '';
    }
    return list;
  }

  private refreshLoot(): void {
    const key = JSON.stringify(['loot', this.play.settings.loot]);
    if (key === this.shown) return;
    this.shown = key;
    this.tabs.pages[TABS.indexOf('loot')]!.replaceChildren(this.lootPage());
  }

  /** The loot filter: a box per kind of item, in two columns, then All and None. */
  private lootPage(): HTMLElement {
    const doc = this.doc, loot = this.play.settings.loot;
    const page = doc.createElement('div');
    page.className = 'auto-loot';
    const head = doc.createElement('div');
    head.className = 'auto-loot-head';
    head.textContent = 'Your pick-up pet and Auto Play pick up:';
    const grid = doc.createElement('div');
    grid.className = 'auto-loot-kinds';
    for (const kind of LOOT_KINDS) {
      grid.append(this.check(`auto-loot-${kind}`, LOOT_KIND_LABELS[kind], (loot.mask & lootBit(kind)) !== 0, (on) => {
        loot.mask = on ? loot.mask | lootBit(kind) : loot.mask & ~lootBit(kind);
      }));
    }
    const all = this.word('All', () => { loot.mask = LOOT_ALL; this.changed(); }, 'loot-all', 'autoPlay');
    all.classList.add('auto-farm-go');
    all.disabled = loot.mask === LOOT_ALL;
    const none = this.word('None', () => { loot.mask = 0; this.changed(); }, 'loot-none', 'autoPlay');
    none.classList.add('auto-farm-go');
    none.disabled = loot.mask === 0;
    const buttons = doc.createElement('div');
    buttons.className = 'auto-farm-buttons';
    buttons.append(all, none);
    page.append(head, grid, buttons);
    return page;
  }

  private refreshFarm(): void {
    const play = this.play, allowed = this.deps.farmAllowed();
    const lines = play.farm === 'off' ? [] : play.stats.lines(this.deps.now());
    const near = this.choosingKinds ? this.deps.monstersNear?.() ?? [] : [];
    const key = JSON.stringify(['farm', play.settings.farm, play.farm, play.phase, play.lastStop, play.bagIsFull, allowed, lines,
      this.choosingKinds, near]);
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

    const loot = this.check('auto-loot', 'Pick up drops', farm.loot, (on) => { farm.loot = on; });

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
    const go = this.word(running ? 'Stop' : 'Start', () => {
      if (play.farm === 'running') play.stop('you took control');
      else play.start();
      this.shown = '';
      this.refresh();
    }, 'go', 'autoPlay');
    go.classList.add('auto-farm-go');
    go.disabled = !running && !allowed;

    const state = doc.createElement('div');
    state.className = 'auto-farm-state';
    state.textContent = running ? `Running: ${play.phase}${play.bagIsFull ? ' (bag full)' : ''}`
      : play.farm === 'stopped' ? `Stopped: ${play.lastStop ?? ''}` : allowed ? 'Off' : 'Not allowed here.';
    const stats = doc.createElement('div');
    stats.className = 'auto-farm-stats';
    stats.textContent = lines.join('  ');

    const buttons = doc.createElement('div');
    buttons.className = 'auto-farm-buttons';
    buttons.append(go);
    if (running && this.deps.showSaver !== undefined) {
      const saver = this.word('Battery saver', () => this.deps.showSaver?.(), 'saver', 'autoPlay');
      saver.classList.add('auto-farm-go');
      buttons.append(saver);
    }
    // 2026-11-17 (owner): "avoid giants, select specific monster on the said radius and only attack that mob"
    const giants = this.check('auto-avoid-giants', 'Avoid giants and bosses', farm.avoidGiants, (on) => { farm.avoidGiants = on; });
    const kinds = doc.createElement('div');
    kinds.className = 'auto-farm-line';
    const chosen = doc.createElement('span');
    chosen.className = 'auto-farm-only';
    chosen.textContent = farm.only.length === 0 ? 'All' : farm.only.map((index) => this.deps.monsterName?.(index) ?? String(index)).join(', ');
    const choose = this.word(this.choosingKinds ? 'Done' : 'Choose', () => { this.choosingKinds = !this.choosingKinds; this.shown = ''; this.refresh(); },
      'only-choose');
    choose.setAttribute('aria-label', 'Choose');
    kinds.append(this.caption('Monsters'), chosen, choose);
    const parts: HTMLElement[] = [radius, loot, giants, kinds];
    if (this.choosingKinds) parts.push(this.kindList());
    page.append(...parts, after, buttons, state, stats);
    return page;
  }

  /** The monster kinds in the radius, and the chosen ones no longer near, each a V15 check box; "All kinds" clears them. */
  private kindList(): HTMLElement {
    const doc = this.doc, farm = this.play.settings.farm;
    const list = doc.createElement('div');
    list.className = 'auto-only-list';
    const near = this.deps.monstersNear?.() ?? [];
    const rows = near.map((m) => ({ index: m.index, text: `${m.name} Lv ${m.level} ×${m.count}` }));
    for (const index of farm.only) {
      if (!near.some((m) => m.index === index)) rows.push({ index, text: this.deps.monsterName?.(index) ?? String(index) });
    }
    for (const row of rows) {
      list.append(this.check(`auto-only-${row.index}`, row.text, farm.only.includes(row.index), (on) => {
        farm.only = on ? [...farm.only, row.index] : farm.only.filter((index) => index !== row.index);
      }));
    }
    if (rows.length === 0) {
      const none = doc.createElement('span');
      none.className = 'auto-only-none';
      none.textContent = 'No monster in the radius.';
      list.append(none);
    }
    const all = this.word('All kinds', () => { farm.only = []; this.changed(); }, 'only-all');
    all.disabled = farm.only.length === 0;
    list.append(all);
    return list;
  }

  private caption(text: string): HTMLElement {
    const span = this.doc.createElement('span');
    span.className = 'auto-farm-caption';
    span.textContent = text;
    return span;
  }

  /** A [-] or [+] that changes a setting, then keeps and draws it. */
  private stepButton(label: string, name: string, change: () => void): HTMLButtonElement {
    const button = this.word(label, () => { change(); this.changed(); }, label === '-' ? 'lower' : 'higher', 'autoPlay');
    button.setAttribute('aria-label', name);
    return button;
  }

  /**
   * 2026-11-17 (owner, "follow the v15 theme"): a check box as Neuz draws one (`CTheme::RenderWndButtonCheck`):
   * ButtCheck.bmp's six 14 px frames, `radioFrame`'s 1 unticked and 3 ticked, its title beside it. The whole line is
   * the press area (a finger's 28 px on a phone, style.css).
   */
  private check(name: string, label: string, checked: boolean, change: (on: boolean) => void): HTMLButtonElement {
    const doc = this.doc;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'auto-check';
    button.setAttribute('role', 'checkbox');
    button.setAttribute('aria-checked', String(checked));
    button.dataset.name = name;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    const box = doc.createElement('span');
    box.className = 'auto-v15-check';
    box.style.backgroundImage = themeUrl(this.art, 'ButtCheck.bmp');
    box.dataset.frame = String(radioFrame({ checked, disabled: false, highlighted: false, pressed: false }));
    button.append(box);
    if (label !== '') {
      const text = doc.createElement('span');
      text.className = 'auto-check-label';
      text.textContent = label;
      button.append(text);
    }
    button.addEventListener('click', () => { change(!checked); this.changed(); });
    return button;
  }

  /** 2026-11-17 (owner, V15 theme): a word button, in the silver look of Neuz's word buttons (style.css `.auto-word`). */
  private word(label: string, press: () => void, name?: string, attribute = 'autoPlay'): HTMLButtonElement {
    const button = textButton(this.doc, label, press, name, attribute);
    button.classList.add('auto-word');
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
    const head = this.check('auto-pots', 'Auto pots', pots.enabled, (on) => { pots.enabled = on; });
    head.classList.add('auto-pots-on');

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

    const lower = this.word('-', () => { set.below = Math.max(BELOW.min, set.below - BELOW.step); this.changed(); }, 'lower', 'autoPlay');
    lower.setAttribute('aria-label', `${name} lower`);
    const below = doc.createElement('span');
    below.className = 'auto-pot-below';
    below.textContent = `${set.below}%`;
    const higher = this.word('+', () => { set.below = Math.min(BELOW.max, set.below + BELOW.step); this.changed(); }, 'higher', 'autoPlay');
    higher.setAttribute('aria-label', `${name} higher`);

    const on = this.check(`auto-pot-on-${row}`, '', set.on, (value) => { set.on = value; });
    on.setAttribute('aria-label', `Use the ${name} item`);

    const clear = this.word('×', () => { set.itemIndex = 0; this.changed(); }, 'clear', 'autoPlay');
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
