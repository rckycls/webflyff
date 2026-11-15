// Donaris's ranking window (2026-11-15, B6; A-client.md §2.9): the all-time points of the siege's players, in 5 tabs.
//
//   CWndGuildCombatRank_Person   WndField.cpp:17746-17922  APP_GUILDCOMBAT_RANK_P, resdata.inc:2468, 400 x 384, "Guild Member
//                                                          Ranking"; WIDC_TABCTRL1 (10,8)-(390,310), WIDC_CLOSE (162,318)-(234,338);
//                                                          the tabs United Rank, Mercenary, Magician, Acrobat, Assist
//   CWndGuildCombatRank_Class    WndField.cpp:17937-18200  APP_GUILDCOMBAT_RANKINGCLASS, 368 x 288: headers at y 10 (x 12, 48,
//                                                          188, 283), rows from y 35 every 18 px, 11 to a page, a tie's rank blank,
//                                                          the first row red, the own row again at y 250 in blue; 100 rows at most
//   CDPClient::OnGuildCombat GC_PLAYERPOINT  DPClient.cpp:7594-7646  the entries (id, job, point), the player data asked for all
//
// The rows scroll by themselves (the wheel on a computer, a swipe on a phone) where Neuz draws a scroll bar over 11 rows.

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { jobLineOf } from '../skillPlaces';
import { ranked } from './arenaHud';
import { TabPages } from './tabs';

/** `MAX_GUILDCOMBAT_RANK` (WndField.h:1767) and `MAX_GUILDCOMBAT_RANK_PER_PAGE` (:1766). */
export const MAX_RANK_ROWS = 100;
export const RANK_PAGE_ROWS = 11;
/** `__GetJobKindWnd`: the first job of each job tab's line, after the United tab (Mercenary 1, Magician 4, Acrobat 2, Assist 3). */
const TAB_LINES: readonly number[] = [1, 4, 2, 3];
const TAB_NAMES = ['Mercenary', 'Magician', 'Acrobat', 'Assist'] as const;
/** A player whose name never came: "?", as the siege's other unknowns. */
const NO_NAME = '?';

export interface RankRow {
  /** The rank: it counts each new number of points. */
  rank: number;
  /** A tie's row: the rank cell is blank. */
  shared: boolean;
  playerId: number;
  job: number;
  jobName: string;
  point: number;
}

type Jobs = Readonly<Record<number, { title: string } | undefined>>;
type Entry = { playerId: number; job: number; point: number };

/**
 * `DivisionList`: the entries by points (of equal points the later entry first, the multimap's reverse walk) into the job
 * tab of their line and into the United tab; a job in no line (a vagrant, a puppeteer) goes nowhere; each tab keeps 100 rows.
 */
export function rankTabs(points: readonly Entry[], jobs: Jobs): RankRow[][] {
  const order = ranked(points.map((p) => ({ ...p, points: p.point }))).map(({ entry }) => entry);
  const lists: Entry[][] = [[], [], [], [], []];
  for (const entry of order) {
    const first = jobLineOf(entry.job).first;
    const line = first === null ? -1 : TAB_LINES.indexOf(first);
    if (line < 0) continue;
    if (lists[0]!.length < MAX_RANK_ROWS) lists[0]!.push(entry);
    if (lists[line + 1]!.length < MAX_RANK_ROWS) lists[line + 1]!.push(entry);
  }
  return lists.map((list) => {
    let rank = 0;
    let last: number | null = null;
    return list.map((entry) => {
      const first = entry.point !== last;
      if (first) rank++;
      last = entry.point;
      return { rank, shared: !first, playerId: entry.playerId, job: entry.job, jobName: jobs[entry.job]?.title ?? '', point: entry.point };
    });
  });
}

/** What the window needs of the screen. */
export interface RankingDeps {
  /** A player's name, '' while unknown (the player data asks for it once). */
  playerName(playerId: number): string;
  ownPlayerId(): number;
  jobs(): Jobs;
  /** A text of the catalog by its TID name ('' when it has none). */
  text(tid: string): string;
}

export const rankingLayout = (title: string): ResLayout => ({
  title, width: 400, height: 384,
  controls: [
    { kind: 'custom', id: 'WIDC_TABCTRL1', rect: [10, 8, 390, 310] },
    { kind: 'button', id: 'WIDC_CLOSE', rect: [162, 318, 234, 338], picture: 'ButtClose.tga', label: 'Close', quarter: 72 },
  ],
});

export class RankingWindow {
  readonly window: ResWindow;
  private readonly tabs: TabPages;
  private points: Entry[] = [];
  private signature = '';
  private selectedRow = -1;

  constructor(title: string, art: UiArt, private readonly deps: RankingDeps, private readonly doc: Document = document) {
    const window = new ResWindow(rankingLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-rank');
    window.button('WIDC_CLOSE').addEventListener('click', () => window.close());
    this.tabs = new TabPages(doc, art, ['United Rank', ...TAB_NAMES], 380, () => { this.selectedRow = -1; this.signature = ''; this.refresh(); });
    window.control('WIDC_TABCTRL1').append(this.tabs.element);
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** GC_PLAYERPOINT: a new window each time (Neuz deletes an open one), on the United tab. */
  open(points: readonly Entry[]): void {
    this.points = [...points];
    this.tabs.setLabel(0, this.deps.text('TID_GAME_TOOLTIP_LOG1') || 'United Rank');
    const jobs = this.deps.jobs();
    TAB_LINES.forEach((line, i) => this.tabs.setLabel(i + 1, jobs[line]?.title || TAB_NAMES[i]!));
    if (this.window.isOpen) this.window.close();
    this.tabs.select(0);
    this.window.open();
    this.refresh();
  }

  close(): void {
    this.window.close();
  }

  /** Each second while open: the names that came since are drawn. */
  refresh(): void {
    const tab = this.tabs.selected;
    if (tab < 0 || !this.window.isOpen) return;
    const rows = rankTabs(this.points, this.deps.jobs())[tab]!;
    const own = this.deps.ownPlayerId();
    const names = rows.map((r) => this.deps.playerName(r.playerId));
    const signature = `${tab}|${names.join('\u0001')}|${this.selectedRow}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const page = this.tabs.pages[tab]!;
    const keep = page.querySelector<HTMLElement>('.hud-gc-rank-rows')?.scrollTop ?? 0;
    const head = this.line('hud-gc-rank-head', [
      this.deps.text('TID_GAME_RATE') || 'Rank', this.deps.text('TID_GAME_NAME') || 'Name', this.deps.text('TID_GAME_JOB') || 'Job',
      this.deps.text('TID_GAME_POINT') || 'Point',
    ]);
    const list = this.doc.createElement('div');
    list.className = 'hud-gc-rank-rows';
    rows.forEach((row, i) => {
      const line = this.line('hud-gc-rank-row', this.cells(row, names[i]!));
      line.classList.toggle('is-first', i === 0);
      line.classList.toggle('is-selected', i === this.selectedRow);
      line.addEventListener('click', () => { this.selectedRow = i; this.refresh(); });
      list.append(line);
    });
    page.replaceChildren(head, list);
    list.scrollTop = keep;
    const mine = rows.findIndex((r) => r.playerId === own);
    if (mine >= 0) page.append(this.line('hud-gc-rank-own', this.cells(rows[mine]!, names[mine]!)));
  }

  private cells(row: RankRow, name: string): string[] {
    return [row.shared ? '' : String(row.rank).padStart(3, ' '), name === '' ? NO_NAME : name, row.jobName, String(row.point).padStart(2, ' ')];
  }

  private line(className: string, cells: readonly string[]): HTMLElement {
    const line = this.doc.createElement('div');
    line.className = className;
    cells.forEach((text, i) => {
      const cell = this.doc.createElement('span');
      cell.className = `hud-gc-rank-c${i}`;
      cell.textContent = text;
      line.append(cell);
    });
    return line;
  }
}
