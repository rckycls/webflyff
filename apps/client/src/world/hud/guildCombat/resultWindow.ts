// The result window (2026-11-15, B6; A-client.md §2.10): after a siege, the guilds' and members' ranking and the battle log.
//
//   CWndGuildCombatResult         WndField.cpp:17547-17590  APP_GUILDCOMBAT_RESULT_POINT, resdata.inc:2378, 560 x 320, "Guild &
//                                                           Member Ranking"; WIDC_TABCTRL1 (8,12)-(552,282), tabs "United Rank"
//                                                           (TID_GAME_TOOLTIP_LOG1) and "Battle Log" (TID_GAME_TOOLTIP_LOG2)
//   CWndGuildCombatTabResult      resdata.inc:1886          the guild list (12,56)-(242,218), the member list (276,56)-(506,218)
//   CWndGuildCombatTabResultLog   WndField.cpp:17690-17728  resdata.inc:2399: the log (8,8)-(514,210), ButtSave.tga (229,217)
//                                                           saves it to GuildLog_YYYYMMDD.txt and says so (TID_GAME_GUILDCOMBAT_LOG_SAVE)
//   CDPClient::OnGuildCombat GC_LOG   DPClient.cpp:7254-7513  the rows and the log lines, the player data asked for the names
//
// Neuz crashes on a guild it does not know (`pGuildAtk->IsMaster` on null, DPClient.cpp:7393); here its name is "?" and the
// line is written all the same.

import type { GuildCombatLogEntry } from '@flyffweb/protocol';
import type { GuildCombatBook } from '../../guildCombat/guildCombatBook';
import type { UiArt } from '../art';
import { formatText } from '../format';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { ranked } from './arenaHud';
import { TabPages } from './tabs';

const UNKNOWN = '?';
/** `GetStrCut( str, szBuf, 10 )` and "..." for a name of 10 characters or more (DPClient.cpp:7283-7292). */
const CUT = 10;
const GREEN = '#cff009c00';
const RED = '#cff9c0000';
const END = '#nc';

export function cutName(name: string): string {
  const chars = [...name];
  return chars.length >= CUT ? `${chars.slice(0, CUT).join('')}...` : name;
}

/**
 * The two lists of the first tab (DPClient.cpp:7271-7369): `"%2d   %s\t(%d)"` of each rank's first row (" WINNER" on rank 1 of
 * the guilds, " MVP" on the best player's), a tie `"     %s\t(%d)"`; the most points first, of equal points the later entry
 * first (the multimap's reverse walk). An unknown player is "?".
 */
export function resultRows(book: GuildCombatBook, playerName: (playerId: number) => string): { guilds: string[]; players: string[] } {
  const guilds = ranked(book.guildRanks.flatMap((g) => (g.has ? [{ name: g.name, points: g.points }] : []))).map(({ entry, rank, first }) => (
    first
      ? `${String(rank).padStart(2, ' ')}   ${cutName(entry.name)}\t(${entry.points})${rank === 1 ? ' WINNER' : ''}`
      : `     ${cutName(entry.name)}\t(${entry.points})`
  ));
  const players = ranked(book.playerRanks.flat()).map(({ entry, rank, first }) => {
    const name = cutName(playerName(entry.playerId) || UNKNOWN);
    return first
      ? `${String(rank).padStart(2, ' ')}   ${name}\t(${entry.points})${entry.playerId === book.bestPlayerId ? ' MVP' : ''}`
      : `     ${name}\t(${entry.points})`;
  });
  return { guilds, players };
}

/** What a log line needs of the screen. */
export interface ResultContext {
  /** A player's name, '' while unknown. */
  playerName(playerId: number): string;
  /** A guild's name, '' when the client does not know the guild. */
  guildName(guildId: number): string;
  /** `pGuild->IsMaster( id )`: the guild's master's player id, 0 when unknown. */
  guildMasterId(guildId: number): number;
  ownPlayerId: number;
  /** A text of the catalog by its TID name ('' when it has none). */
  text(tid: string): string;
}

const ENGLISH: Readonly<Record<string, string>> = {
  TID_GAME_GC_LOG_GUILD: '[%s]', TID_GAME_GC_LOG_POINT: '(%d grade)', TID_GAME_GC_LOG_MASTER: '[Guild Master]', TID_GAME_GC_LOG_DEFENDER: '[Defender]',
  TID_GAME_ATTACK: 'Attack', TID_GAME_GC_LOG1: 'Basic Point +2', TID_GAME_GC_LOG2: 'Guild Master Bonus +1', TID_GAME_GC_LOG3: 'Defender Bonus +1',
  TID_GAME_GC_LOG4: 'Kill bonus +1', TID_GAME_GC_LOG5: 'Resurrecting Bonus +1',
};

/**
 * One kill's lines (DPClient.cpp:7375-7510): the kill with the guild masters and the defender, the bonuses, a blank line. The
 * own kills and the own guild's kills are green, the own guild's deaths red, in Neuz's `#cAARRGGBB ... #nc` codes.
 */
export function logLines(entry: GuildCombatLogEntry, ownGuildId: number, ctx: ResultContext): string[] {
  const text = (tid: string): string => ctx.text(tid) || ENGLISH[tid] || '';
  const atkMaster = ctx.guildMasterId(entry.atkGuildId) === entry.atkPlayerId && entry.atkPlayerId !== 0;
  const defMaster = ctx.guildMasterId(entry.defGuildId) === entry.defPlayerId && entry.defPlayerId !== 0;
  const master = text('TID_GAME_GC_LOG_MASTER');
  const guild1 = atkMaster ? master : '';
  const guild2 = entry.defender ? text('TID_GAME_GC_LOG_DEFENDER') : defMaster ? master : '';
  const atkName = ctx.playerName(entry.atkPlayerId) || UNKNOWN;
  const defName = ctx.playerName(entry.defPlayerId) || UNKNOWN;
  const atkGuild = formatText(text('TID_GAME_GC_LOG_GUILD'), [ctx.guildName(entry.atkGuildId) || UNKNOWN]);
  const defGuild = formatText(text('TID_GAME_GC_LOG_GUILD'), [ctx.guildName(entry.defGuildId) || UNKNOWN]);
  const points = formatText(text('TID_GAME_GC_LOG_POINT'), [entry.point]);
  const attack = text('TID_GAME_ATTACK');
  const left = `${atkGuild} ${guild1} ${atkName}${points}`;
  const right = `${defGuild} ${guild2} ${defName}`;
  let line: string;
  if (entry.atkPlayerId === ctx.ownPlayerId || (ownGuildId !== 0 && ownGuildId === entry.atkGuildId)) line = `${GREEN}${left}${END} ${attack} → ${right}`;
  else if (ownGuildId !== 0 && ownGuildId === entry.defGuildId) line = `${left} ${attack} → ${RED}${right}${END}`;
  else line = `${left} ${attack} → ${right}`;
  const bonuses = [text('TID_GAME_GC_LOG1')];
  if (entry.master) bonuses.push(text('TID_GAME_GC_LOG2'));
  if (entry.defender) bonuses.push(text('TID_GAME_GC_LOG3'));
  if (entry.diffGuild) bonuses.push(text('TID_GAME_GC_LOG4'));
  if (entry.lastLife) bonuses.push(text('TID_GAME_GC_LOG5'));
  return [line, `< ${bonuses.join(', ')} >`, ''];
}

/** A line's `#cAARRGGBB ... #nc` pieces: the words and their colour (null: the text's own). */
export function colourPieces(line: string): Array<{ text: string; color: string | null }> {
  const pieces: Array<{ text: string; color: string | null }> = [];
  const code = /#c([0-9a-fA-F]{8})|#nc/g;
  let color: string | null = null;
  let at = 0;
  for (let m = code.exec(line); m !== null; m = code.exec(line)) {
    if (m.index > at) pieces.push({ text: line.slice(at, m.index), color });
    color = m[1] === undefined ? null : `#${m[1].slice(2)}`;
    at = m.index + m[0].length;
  }
  if (at < line.length) pieces.push({ text: line.slice(at), color });
  return pieces;
}

const plain = (line: string): string => colourPieces(line).map((p) => p.text).join('');

export interface ResultDeps {
  book: GuildCombatBook;
  context(): ResultContext;
  ownGuildId(): number;
  /** Writes the file (a download). */
  save(filename: string, text: string): void;
  /** `OpenMessageBox( text )`. */
  box(text: string): void;
  /** `TID_GAME_GUILDCOMBAT_LOG_SAVE` ("Log was saved to %s file"). */
  saveText(): string;
  now(): Date;
  /** A text of the catalog by its TID name ('' when it has none). */
  text?(tid: string): string;
}

export const resultLayout = (title: string): ResLayout => ({
  title, width: 560, height: 320,
  controls: [
    { kind: 'custom', id: 'WIDC_TABCTRL1', rect: [8, 12, 552, 282] },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [237, 229, 309, 249], picture: 'ButtSave.tga', label: 'Save', quarter: 72 },
  ],
});

export class ResultWindow {
  readonly window: ResWindow;
  private readonly tabs: TabPages;
  private readonly guildList: HTMLElement;
  private readonly memberList: HTMLElement;
  private readonly log: HTMLElement;
  private signature = '';

  constructor(title: string, art: UiArt, private readonly deps: ResultDeps, private readonly doc: Document = document) {
    const window = new ResWindow(resultLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-result');
    const save = window.button('WIDC_BUTTON1');
    save.addEventListener('click', () => this.save());
    this.tabs = new TabPages(doc, art, [deps.text?.('TID_GAME_TOOLTIP_LOG1') || 'United Rank', deps.text?.('TID_GAME_TOOLTIP_LOG2') || 'Battle Log'], 544, (i) => {
      save.hidden = i !== 1;
    });
    const [rank, battle] = this.tabs.pages as [HTMLElement, HTMLElement];
    this.guildList = this.box('hud-gc-result-guilds');
    this.memberList = this.box('hud-gc-result-members');
    rank.append(this.heading('Guild Ranking', 'hud-gc-result-h1'), this.guildList, this.heading('Member Ranking', 'hud-gc-result-h2'), this.memberList);
    this.log = this.box('hud-gc-result-log');
    battle.append(this.log);
    window.control('WIDC_TABCTRL1').append(this.tabs.element);
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** GC_LOG: a new window each time (Neuz deletes an open one), on the first tab. */
  open(): void {
    if (this.window.isOpen) this.window.close();
    this.signature = '';
    this.tabs.select(0);
    this.draw();
    this.window.open();
  }

  close(): void {
    this.window.close();
  }

  /** The names that came since, and the lines the real-time log added. */
  refresh(): void {
    if (this.window.isOpen) this.draw();
  }

  private draw(): void {
    const ctx = this.deps.context();
    const { book } = this.deps;
    const rows = resultRows(book, ctx.playerName);
    const lines = book.log.flatMap((entry) => logLines(entry, this.deps.ownGuildId(), ctx));
    const signature = JSON.stringify([rows, lines]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.guildList.replaceChildren(...rows.guilds.map((row) => this.row(row)));
    this.memberList.replaceChildren(...rows.players.map((row) => this.row(row)));
    this.log.replaceChildren(...lines.map((line) => {
      const div = this.doc.createElement('div');
      div.className = 'hud-gc-log-line';
      for (const piece of colourPieces(line)) {
        const span = this.doc.createElement('span');
        span.textContent = piece.text;
        if (piece.color !== null) span.style.color = piece.color;
        div.append(span);
      }
      return div;
    }));
  }

  /** `GuildLog_YYYYMMDD.txt` of the log's words: a line each, no colour codes (`pWndText->m_string`), then the box. */
  private save(): void {
    const ctx = this.deps.context();
    const text = this.deps.book.log.flatMap((entry) => logLines(entry, this.deps.ownGuildId(), ctx)).map((line) => `${plain(line)}\r\n`).join('');
    const now = this.deps.now();
    const two = (n: number): string => String(n).padStart(2, '0');
    const name = `GuildLog_${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}.txt`;
    this.deps.save(name, text);
    this.deps.box(formatText(this.deps.saveText() || 'Log was saved to %s file', [name]));
  }

  private box(className: string): HTMLElement {
    const box = this.doc.createElement('div');
    box.className = `hud-gc-result-box ${className}`;
    return box;
  }

  private heading(text: string, className: string): HTMLElement {
    const heading = this.doc.createElement('div');
    heading.className = `hud-gc-result-h ${className}`;
    heading.textContent = text;
    return heading;
  }

  private row(text: string): HTMLElement {
    const row = this.doc.createElement('div');
    row.className = 'hud-gc-result-row';
    row.textContent = text;
    return row;
  }
}
