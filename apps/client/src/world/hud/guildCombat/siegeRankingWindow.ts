// The owner's Siege Ranking window (2026-11-15, Guild Siege C2): a FlyffWeb feature with no Neuz counterpart, drawn in the look
// of Donaris's ranking window (rankingWindow.ts: APP_GUILDCOMBAT_RANK_P, 400 x 384, the tab strip under the pages, the first
// row red, the own row blue) from the website's ranking (siegeWebApi.ts): Individual and Guild tabs, This week and All time.

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { RankBoard, RankSpan, SiegeRankRow } from '../../guildCombat/siegeWebApi';
import { rankingLayout } from './rankingWindow';
import { TabPages } from './tabs';

type Jobs = Readonly<Record<number, { title: string } | undefined>>;

export interface SiegeRankingDeps {
  /** One board's rows (the cache of siegeWebApi.ts), null when the website is unavailable. */
  load(board: RankBoard, span: RankSpan): Promise<SiegeRankRow[] | null>;
  /** The own character's name and guild's name ('' with none): their rows are blue. */
  ownName(): string;
  ownGuildName(): string;
  jobs(): Jobs;
}

const BOARDS: readonly RankBoard[] = ['player', 'guild'];
const HEADS: Readonly<Record<RankBoard, readonly string[]>> = {
  player: ['Rank', 'Name', 'Job', 'Guild', 'Points'],
  guild: ['Rank', 'Guild', 'Wins', 'Sieges', 'Points'],
};

export class SiegeRankingWindow {
  readonly window: ResWindow;
  private readonly tabs: TabPages;
  private readonly spanButtons: Record<RankSpan, HTMLButtonElement>;
  private span: RankSpan = 'week';
  /** Bumped by each load: an answer that is no longer the one asked for is dropped. */
  private ticket = 0;

  constructor(art: UiArt, private readonly deps: SiegeRankingDeps, private readonly doc: Document = document) {
    const window = new ResWindow(rankingLayout('Siege Ranking'), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-rank', 'hud-sr');
    window.button('WIDC_CLOSE').addEventListener('click', () => window.close());
    this.tabs = new TabPages(doc, art, ['Individual', 'Guild'], 380, () => this.show());
    const bar = doc.createElement('div');
    bar.className = 'hud-sr-spans';
    const make = (span: RankSpan, text: string): HTMLButtonElement => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'hud-sr-span';
      button.textContent = text;
      button.addEventListener('click', () => { this.span = span; this.show(); });
      bar.append(button);
      return button;
    };
    this.spanButtons = { week: make('week', 'This week'), all: make('all', 'All time') };
    this.tabs.element.append(bar);
    window.control('WIDC_TABCTRL1').append(this.tabs.element);
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** Opens on a board (Individual by default), This week. */
  open(board: RankBoard = 'player'): void {
    this.span = 'week';
    if (!this.window.isOpen) this.window.open();
    this.tabs.select(BOARDS.indexOf(board));
  }

  toggle(): void {
    if (this.window.isOpen) this.window.close(); else this.open();
  }

  close(): void {
    this.window.close();
  }

  /** Draws the chosen tab and span: a note while it loads, then its rows, or "Not available". */
  private show(): void {
    const tab = this.tabs.selected;
    const board = BOARDS[tab]!;
    const span = this.span;
    (Object.keys(this.spanButtons) as RankSpan[]).forEach((key) => {
      this.spanButtons[key].classList.toggle('is-chosen', key === span);
      this.spanButtons[key].setAttribute('aria-pressed', String(key === span));
    });
    const page = this.tabs.pages[tab]!;
    const ticket = ++this.ticket;
    page.replaceChildren(this.note('Loading...'));
    void this.deps.load(board, span).then((rows) => {
      if (ticket !== this.ticket) return;
      page.replaceChildren(...this.draw(board, rows));
    });
  }

  private draw(board: RankBoard, rows: readonly SiegeRankRow[] | null): HTMLElement[] {
    if (rows === null) return [this.note('Not available')];
    if (rows.length === 0) return [this.note('No ranking yet')];
    const own = board === 'player' ? this.deps.ownName() : this.deps.ownGuildName();
    const jobs = this.deps.jobs();
    const head = this.line(`hud-gc-rank-head hud-sr-head hud-sr-${board}`, HEADS[board]);
    const list = this.doc.createElement('div');
    list.className = 'hud-sr-rows';
    rows.forEach((row, i) => {
      const cells = board === 'player'
        ? [String(row.rank).padStart(3, ' '), row.name, row.job === undefined ? '' : jobs[row.job]?.title ?? '', row.guild ?? '', String(row.points)]
        : [String(row.rank).padStart(3, ' '), row.name, String(row.wins ?? 0), String(row.sieges ?? 0), String(row.points)];
      const line = this.line(`hud-gc-rank-row hud-sr-row hud-sr-${board}`, cells);
      line.classList.toggle('is-first', i === 0);
      line.classList.toggle('is-own', own !== '' && row.name === own);
      list.append(line);
    });
    return [head, list];
  }

  private note(text: string): HTMLElement {
    const note = this.doc.createElement('div');
    note.className = 'hud-sr-note';
    note.textContent = text;
    return note;
  }

  private line(className: string, cells: readonly string[]): HTMLElement {
    const line = this.doc.createElement('div');
    line.className = className;
    cells.forEach((text, i) => {
      const cell = this.doc.createElement('span');
      cell.className = `hud-sr-c${i}`;
      cell.textContent = text;
      line.append(cell);
    });
    return line;
  }
}
