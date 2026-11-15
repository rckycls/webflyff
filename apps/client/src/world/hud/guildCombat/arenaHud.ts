// 2026-11-15 (Guild Siege, B5): the HUD of the siege's arena, WI_WORLD_GUILDWAR 202 (docs/guild-siege/research/A-client.md
// §4.1, §4.3, §3.2). Two parts:
//
// - `ArenaState`, the screen's for the whole session (the book's companion): what each GC_GCSTATE, GC_NEXTTIMESTATE,
//   GC_ENTERTIME and GC_LOG_REALTIME says at once (the lines, the captions, the war's music, the per-kill line) and the
//   count-down's label and end (`CWndWorld::m_szGuildCombatStr`, `m_dwGuildCombatTime`, which outlive a world change into
//   202). It hears every siege message, the JOIN's too, so a player who logs in during the war has them before any HUD.
// - `ArenaHud`, made with each world's windows: it draws, from the book and the state alone, the count-down, the guild
//   and player boards (202 only), the own guild's list (any world, while the own player is on a line-up) and the two
//   "be ready" lines.
//
//   CDPClient::OnGuildCombatState      Neuz/DPClient.cpp:7647-7716  the lines, captions and music of a state change
//   CDPClient::OnGuildCombatNextTimeState                  :7718-7790  the count-down's label by the state that follows
//   CDPClient::OnGuildCombatEnterTime                      :7792-7808  "Time Limit" and its line, for a guild that applied
//   CDPClient::OnGCLogRealTime                             :7514-7592  one white line per kill, Neuz's English format
//   CDPClient::OnReplace                                   :2303-2310  an ordinary world clears the count-down
//   CWndWorld::OnEraseBkgnd           _Interface/WndWorld.cpp:1163-1197  the count-down, centred at y 110
//                                                         :1248-1458  the boards at (width - 150, 200)
//                                                         :1461-1618  the own guild's list and the "be ready" lines
//
// The end's music (BGM_IN_FITUP) is the server's own PLAYMUSIC to world 202 (`SendPlayMusic`, eveschool.cpp:1284-1285),
// which the world screen already plays; Neuz plays nothing of its own then.
//
// On a phone (`compact`: the phone layout of style.css, whose game area is about 350 px tall) the boards show the top 5
// and the own row, fold on a tap of their title, and stand in a column under the Navigator, with the count-down and the
// "be ready" lines at its top, as far right as the attack button, the quick slots and the other controls leave room for
// (`layoutCompact`); the own guild's list is narrower: the owner's phone layout, not Neuz's.

import type { GuildCombatMessage } from '@flyffweb/protocol';
import { BGM_BA_CRISIS } from '../../../audio/soundIds';
import { warStatusOf } from '../../combat/siege';
import type { WarPlayers } from '../../combat/siege';
import { GuildRank } from '../../guild/guildRules';
import type { GuildCombatBook, GuildCombatGuildRank, GuildCombatStatus } from '../../guildCombat/guildCombatBook';
import { GcState, SIEGE } from '../../guildCombat/guildCombatRules';
import { cssRgb } from '../art';

/** The texts, in English when the catalog has none (`Resource/textClient.inc`). */
const ENGLISH: Readonly<Record<string, string>> = {
  TID_GAME_GUILDCOMBAT_MAINTENANCE: 'Maintenance Schedule', TID_GAME_GUILDCOMBAT_WAR: 'Start Combat',
  TID_GAME_GUILDCOMBAT_WAR_END: 'End combat', TID_GAME_GUILDCOMBAT_EXIT_MSG: 'Teleporting to Flaris',
  TID_GAME_GUILDCOMBAT_PLAYER_MAKEUP_FINISH: 'Time for organizing line up and preparation for Guild Siege.',
  TID_GAME_GUILDCOMBAT_JOIN_LIMIT_TIME: 'Time Limit', TID_GAME_GUILDCOMBAT_JOIN_NOW: 'Guild Siege mode is now available.',
  TID_GAME_GUILDCOMBAT_NOW_PLAYER_MAKEUP: 'From now on, you can organize the entry of guild siege.',
  TID_GAME_GUILDCOMBAT_MAINTENANCE2: 'Combat starts right after server maintenance. Prepare for war!',
  TID_GAME_GUILDCOMBAT_RATE: 'Current rank:', TID_GAME_GUILDCOMBAT_PERSON_RATE: 'Individual rank:',
  TID_GAME_GUILDCOMBAT_JOIN_READY: 'Gain entrance when one of your guild mates dies.', TID_GAME_GUILDCOMBAT_JOIN_READY2: 'Be ready!',
};

const WHITE = 0xffffffff;
/** The boards' and the list's colours (WndWorld.cpp:1265-1618). */
const COLOR_OWN = 0xff9ed3ff;
const COLOR_OTHER = 0xffffff99;
const COLOR_TITLE = 0xffebad18;
const COLOR_NEXT = 0xff00cb00;
const COLOR_OUT = 0xffcbcbcb;
/** The player board's rows (`nMaxRender`, WndWorld.cpp:1341). */
const PLAYER_ROWS = 10;
/** The phone's rows of each board, the own row besides. */
const COMPACT_ROWS = 5;
/** A player whose name never came (no player data): "?" in the boards and the list, as the siege's other unknowns. */
const UNKNOWN_NAME = '?';

// --- The texts ---

/** `GetStrCut( str, szBuf, 5 )` and "..." when the name has 5 characters or more (WndWorld.cpp:1291-1302). */
export function cutName(name: string): string {
  const chars = [...name];
  return chars.length >= 5 ? `${chars.slice(0, 5).join('')}...` : name;
}

/**
 * The count-down: `"%s %.2d:%.2d:%.2d"` of the whole seconds left (`CTimeSpan`'s hours, minutes, seconds); null once they
 * reach 0, when Neuz stops drawing it (`m_dwGuildCombatTime = 0xffffffff`). A ticking clock: the owner's short durations
 * (hud/duration.ts) leave it alone.
 */
export function siegeClockText(label: string, msLeft: number): string | null {
  const seconds = Math.floor(msLeft / 1000);
  if (seconds <= 0) return null;
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${label} ${two(Math.floor(seconds / 3600) % 24)}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
}

// --- The boards ---

/** A board's row: `"%2d"` (blank for a tie), the cut name, the points, its colour. */
export interface BoardRow { rank: string; name: string; points: string; color: number; own: boolean }
/** A board: the rows drawn, and the own row after them (null: none). */
export interface Board { rows: BoardRow[]; own: BoardRow | null }

/**
 * The multimap's reverse walk (`m_mmapGuildCombat_*Precedence`, `rbegin` to `rend`): the most points first, of equal points
 * the one inserted later first; the rank counts each new number of points (`nOldPoint != nPoint`).
 */
export function ranked<T extends { points: number }>(entries: readonly T[]): Array<{ entry: T; rank: number; first: boolean }> {
  const order = entries.map((entry, i) => ({ entry, i })).sort((a, b) => b.entry.points - a.entry.points || b.i - a.i);
  let rank = 0;
  let last: number | null = null;
  return order.map(({ entry }) => {
    const first = entry.points !== last;
    if (first) rank++;
    last = entry.points;
    return { entry, rank, first };
  });
}

const rankText = (rank: number): string => String(rank).padStart(2, ' ');

/**
 * The guild board (WndWorld.cpp:1265-1327): every guild with entrants (`has`), the own guild (its name, case aside) light
 * blue. Neuz draws them all; `limit` (the phone's) cuts it, and then the own guild below it comes after, with its rank.
 */
export function guildBoardRows(ranks: readonly GuildCombatGuildRank[], ownGuildName: string, limit = Infinity): Board {
  const own = ownGuildName.toLowerCase();
  const entries = ranks.flatMap((g) => (g.has ? [{ name: g.name, points: g.points }] : []));
  const all = ranked(entries).map(({ entry, rank, first }) => {
    const mine = own !== '' && entry.name.toLowerCase() === own;
    return { row: { rank: first ? rankText(rank) : '  ', name: cutName(entry.name), points: String(entry.points), color: mine ? COLOR_OWN : COLOR_OTHER, own: mine }, rank };
  });
  const at = all.findIndex(({ row }) => row.own);
  return {
    rows: all.slice(0, limit).map(({ row }) => row),
    own: at >= limit ? { ...all[at]!.row, rank: rankText(all[at]!.rank) } : null,
  };
}

/**
 * The player board (WndWorld.cpp:1329-1458): every guild's players by points, the top 10 drawn (the phone's `limit` 5),
 * the own player light blue; when it is not among them, its row after a gap, with its rank and points (0 and 0 when it
 * is on no list). An empty board has no own row.
 */
export function playerBoardRows(
  ranks: ReadonlyArray<ReadonlyArray<{ playerId: number; points: number }>>, ownPlayerId: number, nameOf: (playerId: number) => string,
  ownName: string, limit = PLAYER_ROWS,
): Board {
  const entries = ranks.flat();
  if (entries.length === 0) return { rows: [], own: null };
  const all = ranked(entries);
  const rows = all.slice(0, limit).map(({ entry, rank, first }) => {
    const mine = entry.playerId === ownPlayerId;
    return { rank: first ? rankText(rank) : '  ', name: cutName(nameOf(entry.playerId)), points: String(entry.points), color: mine ? COLOR_OWN : COLOR_OTHER, own: mine };
  });
  if (rows.some((row) => row.own)) return { rows, own: null };
  const mine = all.slice(limit).find(({ entry }) => entry.playerId === ownPlayerId);
  return { rows, own: { rank: rankText(mine?.rank ?? 0), name: cutName(ownName), points: String(mine?.entry.points ?? 0), color: COLOR_OWN, own: true } };
}

// --- The own guild's list ---

/** A row of the own guild's list: number, name, lives left, colour, an extra gap above it, the "D", the HP bar's fill. */
export interface OwnRow {
  number: string; name: string; lives: string; color: number; gapBefore: boolean; defender: boolean;
  /** The HP bar's green, in px of the 60 px bar: its fill rect `DeflateRect( 1, 1, ( 60 - fDraw ) + 1, 1 )`. */
  hp: number;
}

/**
 * The own guild's list (GC_GUILDSTATUS, WndWorld.cpp:1497-1599): the server's order (fighters, the queue, the dead); the
 * own player light blue, the others light yellow; the next to go in (`joinIndex`, not 0) green after an extra gap; from the
 * first with no lives left, grey after an extra gap; lives shown as `max( nLife - 1, 0 )`; "D" by a line-up's defender;
 * the HP bar from the member's HP when in view (`hpOf`, 0 to 1), else empty. `ownNext`: the own player goes in next with
 * lives left (the "be ready" lines).
 */
export function ownGuildRows(
  status: GuildCombatStatus | null, warPlayers: WarPlayers, ownPlayerId: number, nameOf: (playerId: number) => string,
  hpOf: (playerId: number) => number | null,
): { rows: OwnRow[]; ownNext: boolean } {
  let space = false;
  let ownNext = false;
  const rows = (status?.players ?? []).map(({ playerId, lives }, i) => {
    const mine = playerId === ownPlayerId;
    const ready = status!.joinIndex !== 0 && i === status!.joinIndex && lives > 0;
    if (mine && ready) ownNext = true;
    let gapBefore = ready;
    if (lives <= 0 && !space) { gapBefore = true; space = true; }
    const color = ready ? COLOR_NEXT : space ? COLOR_OUT : mine ? COLOR_OWN : COLOR_OTHER;
    const draw = 60 * Math.min(1, Math.max(0, hpOf(playerId) ?? 0));
    return {
      number: rankText(i + 1), name: cutName(nameOf(playerId)), lives: String(Math.max(lives - 1, 0)), color, gapBefore,
      defender: warPlayers.has(playerId), hp: Math.max(0, 59 - Math.trunc(61 - draw)),
    };
  });
  return { rows, ownNext };
}

// --- What the messages say at once, and the count-down ---

/** What the arena's state needs of the screen. */
export interface ArenaStateHost {
  /** The world the own player is in. */
  worldId(): number;
  /** The own rank in the own guild (`m_nMemberLv`: GuildRank), null with no guild. */
  ownGuildRank(): number | null;
  /** A text of the catalog by its TID name ('' when it has none). */
  text(tid: string): string;
  /** `g_WndMng.PutString( text, NULL, color )`: a CHATSTY_GAME line (the screen's messages). */
  line(text: string, color: number): void;
  /** `PutString( text, NULL, color, CHATSTY_GENERAL )`: a line of the chat. */
  chat(text: string, color: number): void;
  /** `g_Caption1.AddCaption( text, m_pFontAPITitle )`. */
  caption(text: string): void;
  /** `PlayMusic( id, loops )`: nothing when the tune is not converted. */
  music(id: number, loops: number): void;
  /** `g_GuildMng.GetGuild( id )->m_szGuild`, undefined when unknown. */
  guildName(guildId: number): string | undefined;
}

export class ArenaState {
  /** `m_szGuildCombatStr` and `m_dwGuildCombatTime`, on the screen's clock; null: none (`0xffffffff`). */
  private clock: { label: string; endsAt: number } | null = null;

  constructor(private readonly book: GuildCombatBook, private readonly host: ArenaStateHost) {}

  /**
   * A world entered (`OnReplace`): its movers come anew (the book forgets their USERSTATEs), and an ordinary world clears
   * the count-down (DPClient.cpp:2303-2310); 202 keeps it. (Neuz keeps it in its other worlds with a loading picture of
   * their own too; the browser draws none of those.)
   */
  enterWorld(worldId: number): void {
    this.book.forgetMovers();
    if (worldId !== SIEGE.worldId) this.clock = null;
  }

  /** The count-down's text at `now`, null when there is none or it has run out. */
  clockText(now: number): string | null {
    if (this.clock === null) return null;
    const text = siegeClockText(this.clock.label, this.clock.endsAt - now);
    if (text === null) this.clock = null;
    return text;
  }

  /** A siege message, after the book has applied it. */
  apply(message: GuildCombatMessage, now: number): void {
    const inArena = this.host.worldId() === SIEGE.worldId;
    switch (message.sub) {
      case 'gcState': this.onState(inArena); break;
      case 'nextTimeState': {
        const tid = this.labelOf(message.nextState, inArena);
        if (tid !== null) this.clock = { label: this.text(tid), endsAt: now + message.msLeft };
        break;
      }
      case 'enterTime':
        // the book keeps it as the ENTER label; Neuz shows it only to a guild that applied (`IsRequest`)
        if (!this.book.requested) break;
        this.clock = { label: this.text('TID_GAME_GUILDCOMBAT_JOIN_LIMIT_TIME'), endsAt: this.book.countdown?.endsAt ?? now + message.msLeft };
        this.host.line(this.text('TID_GAME_GUILDCOMBAT_JOIN_NOW'), WHITE);
        break;
      case 'logRealtime': {
        const guild = (id: number): string => this.host.guildName(id) ?? '?';
        this.host.chat(`[${guild(message.atkGuildId)}][${message.atkName}] has killed [${guild(message.defGuildId)}][${message.defName}] and has gained ${message.point} points.`, WHITE);
        break;
      }
      default:
    }
  }

  private text(tid: string): string {
    return this.host.text(tid) || (ENGLISH[tid] ?? '');
  }

  /** `OnGuildCombatState`'s lines, captions and music (DPClient.cpp:7655-7715), the book already holding the new states. */
  private onState(inArena: boolean): void {
    const { state, warState } = this.book;
    // the line-up's opening, in any world: the master of a guild that applied
    if (warState === GcState.NOTENTER_COUNT && this.book.requested && this.host.ownGuildRank() === GuildRank.MASTER) {
      this.host.line(this.text('TID_GAME_GUILDCOMBAT_NOW_PLAYER_MAKEUP'), WHITE);
    }
    if (!inArena) return;
    if (state === GcState.WAR && warState === GcState.MAINTENANCE) this.host.line(this.text('TID_GAME_GUILDCOMBAT_MAINTENANCE2'), WHITE);
    if (state === GcState.WAR && warState === GcState.WAR_WAR) {
      this.host.music(BGM_BA_CRISIS, 0);
      this.host.caption(this.text('TID_GAME_GUILDCOMBAT_WAR'));
    }
    if (state === GcState.COMPLET_CLOSE && warState === GcState.WAR_CLOSE) this.host.caption(this.text('TID_GAME_GUILDCOMBAT_WAR_END'));
    if (state === GcState.COMPLET_CLOSE && warState === GcState.WAR_CLOSE_WAIT) this.book.requested = false;
    if (state === GcState.CLOSE && warState === GcState.WAR_TELEPORT) {
      this.clock = null;
      this.book.warPlayers = new Map(); // `m_mapGC_GuildStatus.clear()`: the own guild's list goes with it
    }
  }

  /** The count-down's label for the state that comes next (DPClient.cpp:7734-7788); null: Neuz sets none and keeps the last. */
  private labelOf(next: number, inArena: boolean): string | null {
    switch (next) {
      case GcState.WAR_WAR: return inArena ? 'TID_GAME_GUILDCOMBAT_MAINTENANCE' : null;
      case GcState.WAR_CLOSE: return inArena ? 'TID_GAME_GUILDCOMBAT_WAR_END' : null;
      case GcState.WAR_TELEPORT: return inArena ? 'TID_GAME_GUILDCOMBAT_EXIT_MSG' : null;
      case GcState.ENTER: {
        const rank = this.host.ownGuildRank();
        return this.book.requested && (rank === GuildRank.MASTER || rank === GuildRank.KINGPIN) ? 'TID_GAME_GUILDCOMBAT_PLAYER_MAKEUP_FINISH' : null;
      }
      default: return null;
    }
  }
}

// --- The drawing ---

/** What the arena's HUD needs of the screen. */
export interface ArenaHudHost {
  worldId(): number;
  ownPlayerId(): number;
  ownName(): string;
  /** The own guild's name, '' with none (`g_pPlayer->GetGuild()`). */
  ownGuildName(): string;
  /** A player's name (`CPlayerDataCenter::GetPlayerString`), '' when unknown (the HUD then shows `UNKNOWN_NAME`, "?"). */
  nameOf(playerId: number): string;
  /** A player's HP, 0 to 1, when in view (`prj.GetUserByID`); null otherwise. */
  hpOf(playerId: number): number | null;
  /**
   * The phone's layout (style.css's coarse-pointer rule: every phone game area, 350 px tall or less among them), whose
   * attack button and quick slots Neuz's full boards would cover.
   */
  compact(): boolean;
  text(tid: string): string;
}

/** Where a board's pieces stand inside its box, and how tall a row is (desktop: WndWorld.cpp:1250-1373). */
interface Metrics { width: number; titleX: number; titleY: number; firstRow: number; row: number; rankX: number; nameX: number; pointsX: number; ownGap: number }
const DESKTOP: Metrics = { width: 150, titleX: 20, titleY: 10, firstRow: 34, row: 16, rankX: 10, nameX: 35, pointsX: 120, ownGap: 16 };
const COMPACT: Metrics = { width: 120, titleX: 4, titleY: 3, firstRow: 19, row: 13, rankX: 3, nameX: 21, pointsX: 90, ownGap: 3 };
/** The own guild's list: its row, the columns (the "D", number, name, lives) and its HP bar (WndWorld.cpp:1476-1595); the phone's narrower. */
interface ListMetrics { width: number; row: number; numberX: number; nameX: number; livesX: number; barX: number; bar: number }
const LIST_DESKTOP: ListMetrics = { width: 135, row: 16, numberX: 5, nameX: 30, livesX: 115, barX: 145, bar: 60 };
const LIST_COMPACT: ListMetrics = { width: 104, row: 14, numberX: 4, nameX: 21, livesX: 78, barX: 88, bar: 30 };
/** A folded board's height on the phone: its title. */
const FOLDED_HEIGHT = 19;
/** The bottom padding of the phone's board. */
const COMPACT_PAD = 3;
/** The phone's count-down and "be ready" lines, stacked over the boards: their heights. */
const CLOCK_HEIGHT = 15;
const READY_HEIGHT = 36;
/** The gap the phone's boards keep from each other and from the controls. */
const GAP = 4;
/**
 * What the phone's column keeps clear of, by standing left of it: the controls of the right side (Attack, Jump, the Action
 * Slot button, the quick slots). The Navigator is above the column; the task bar and the chat (bottom left) are below it,
 * the column's 5 rows ending above them on a 320 px high screen.
 */
const OBSTACLES = '.hud-attack, .hud-jump, .hud-action-trigger, .hud-quick-slot';
/** How often the boards and the list are drawn again (their packets come seconds apart; the HP bars move) and placed. */
const REDRAW_MS = 250;
const LAYOUT_MS = 300;

interface BoardView { box: HTMLElement; title: HTMLButtonElement; rows: HTMLElement; height: number; folded: boolean; drawn: string }

export class ArenaHud {
  readonly element: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly guildBoard: BoardView;
  private readonly playerBoard: BoardView;
  private readonly list: HTMLElement;
  private readonly listTitle: HTMLElement;
  private readonly listRows: HTMLElement;
  private readonly ready: HTMLElement;
  private listDrawn = '';
  private lastDraw = -Infinity;
  private lastLayout = -Infinity;
  private dirty = true;

  constructor(private readonly host: ArenaHudHost, private readonly book: GuildCombatBook, private readonly state: ArenaState, private readonly doc: Document = document) {
    const div = (className: string): HTMLElement => {
      const element = doc.createElement('div');
      element.className = className;
      return element;
    };
    this.element = div('hud-siege');
    this.clock = div('hud-siege-clock');
    this.clock.setAttribute('role', 'timer');
    this.clock.hidden = true;
    this.guildBoard = this.board('guild', this.text('TID_GAME_GUILDCOMBAT_RATE'));
    this.playerBoard = this.board('player', this.text('TID_GAME_GUILDCOMBAT_PERSON_RATE'));
    this.list = div('hud-siege-guild');
    this.list.hidden = true;
    this.listTitle = div('hud-siege-title');
    this.listRows = div('hud-siege-rows');
    this.list.append(this.listTitle, this.listRows);
    this.ready = div('hud-siege-ready');
    this.ready.setAttribute('role', 'status');
    this.ready.hidden = true;
    for (const tid of ['TID_GAME_GUILDCOMBAT_JOIN_READY', 'TID_GAME_GUILDCOMBAT_JOIN_READY2']) {
      const line = div('hud-siege-ready-line');
      line.textContent = this.text(tid);
      this.ready.append(line);
    }
    this.element.append(this.clock, this.guildBoard.box, this.playerBoard.box, this.list, this.ready);
  }

  /** Each frame: the count-down; four times a second (or at once after a fold) the boards and the list, and on the phone their place. */
  update(nowMs: number): void {
    const clock = this.state.clockText(nowMs);
    if (clock === null) {
      if (!this.clock.hidden) { this.clock.hidden = true; this.lastLayout = -Infinity; }
    } else {
      if (this.clock.hidden) { this.clock.hidden = false; this.lastLayout = -Infinity; }
      if (this.clock.textContent !== clock) this.clock.textContent = clock;
    }
    if (!this.dirty && nowMs - this.lastDraw < REDRAW_MS) return;
    this.dirty = false;
    this.lastDraw = nowMs;
    const compact = this.host.compact();
    if ((this.element.dataset.compact === 'true') !== compact) {
      if (compact) this.element.dataset.compact = 'true';
      else {
        delete this.element.dataset.compact;
        // back to Neuz's places: the style sheet's
        for (const element of [this.clock, this.ready]) for (const side of ['left', 'right', 'top']) element.style.removeProperty(side);
      }
      this.lastLayout = -Infinity;
    }
    this.drawBoards(compact);
    this.drawList(compact);
    if (compact && nowMs - this.lastLayout >= LAYOUT_MS) {
      this.lastLayout = nowMs;
      this.layoutCompact();
    }
  }

  dispose(): void {
    this.element.remove();
  }

  private text(tid: string): string {
    return this.host.text(tid) || (ENGLISH[tid] ?? '');
  }

  private board(name: 'guild' | 'player', title: string): BoardView {
    const box = this.doc.createElement('div');
    box.className = 'hud-siege-board';
    box.dataset.board = name;
    box.hidden = true;
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = 'hud-siege-title';
    button.textContent = title;
    button.style.color = cssRgb(COLOR_TITLE);
    const rows = this.doc.createElement('div');
    rows.className = 'hud-siege-rows';
    box.append(button, rows);
    const view: BoardView = { box, title: button, rows, height: 0, folded: false, drawn: '' };
    // the phone's fold (the owner's): a tap on the title
    button.addEventListener('click', () => {
      if (this.element.dataset.compact !== 'true') return;
      view.folded = !view.folded;
      this.dirty = true;
      this.lastLayout = -Infinity;
    });
    return view;
  }

  private drawBoards(compact: boolean): void {
    const shown = this.host.worldId() === SIEGE.worldId;
    for (const view of [this.guildBoard, this.playerBoard]) if (view.box.hidden === shown) view.box.hidden = !shown;
    if (!shown) return;
    const limit = compact ? COMPACT_ROWS : undefined;
    const guild = guildBoardRows(this.book.guildRanks, this.host.ownGuildName(), limit);
    const ownId = this.host.ownPlayerId();
    const nameOf = (id: number): string => this.host.nameOf(id) || (id === ownId ? this.host.ownName() : UNKNOWN_NAME);
    const players = playerBoardRows(this.book.playerRanks, ownId, nameOf, this.host.ownName(), limit);
    const metrics = compact ? COMPACT : DESKTOP;
    // Neuz's boxes: (n + 3) x 16 of every entry, the player board's too though it draws 10 (WndWorld.cpp:1257-1263, :1332-1339)
    const guildCount = this.book.guildRanks.filter((g) => g.has).length;
    const playerCount = this.book.playerRanks.reduce((n, list) => n + list.length, 0);
    this.drawBoard(this.guildBoard, guild, metrics, compact, (guildCount + 3) * 16);
    this.drawBoard(this.playerBoard, players, metrics, compact, (playerCount + 3) * 16);
    if (!compact) {
      this.place(this.guildBoard.box, { right: 10, top: 190 });
      // 50 px under the last guild row: its box 26 px under the guild board's (WndWorld.cpp:1329-1334)
      this.place(this.playerBoard.box, { right: 10, top: 190 + this.guildBoard.height + 26 });
    }
  }

  private drawBoard(view: BoardView, board: Board, m: Metrics, compact: boolean, desktopHeight: number): void {
    const folded = compact && view.folded;
    const signature = `${compact}|${folded}|${desktopHeight}|${JSON.stringify(board)}`;
    if (signature === view.drawn) return;
    view.drawn = signature;
    view.title.disabled = !compact;
    view.title.setAttribute('aria-expanded', String(!folded));
    view.title.style.left = `${m.titleX}px`;
    view.title.style.top = `${m.titleY}px`;
    const rows: HTMLElement[] = board.rows.map((row, i) => this.row(row, m, m.firstRow + i * m.row));
    if (board.own !== null) rows.push(this.row(board.own, m, m.firstRow + board.rows.length * m.row + m.ownGap));
    for (const row of rows) row.hidden = folded;
    view.rows.replaceChildren(...rows);
    view.height = !compact ? desktopHeight
      : folded ? FOLDED_HEIGHT
        : m.firstRow + board.rows.length * m.row + (board.own !== null ? m.ownGap + m.row : 0) + COMPACT_PAD;
    view.box.style.width = `${m.width}px`;
    view.box.style.height = `${view.height}px`;
    this.lastLayout = -Infinity;
  }

  private row(row: BoardRow, m: Metrics, top: number): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = 'hud-siege-row';
    if (row.own) element.dataset.own = 'true';
    element.style.top = `${top}px`;
    element.style.color = cssRgb(row.color);
    for (const [className, text, left] of [['hud-siege-rank', row.rank, m.rankX], ['hud-siege-name', row.name, m.nameX], ['hud-siege-points', row.points, m.pointsX]] as const) {
      const span = this.doc.createElement('span');
      span.className = className;
      span.textContent = text;
      span.style.left = `${left}px`;
      element.append(span);
    }
    return element;
  }

  private drawList(compact: boolean): void {
    const ownId = this.host.ownPlayerId();
    const guildName = this.host.ownGuildName();
    const status = warStatusOf(this.book.warPlayers, ownId);
    const shown = guildName !== '' && (status === 0 || status === 1);
    if (this.list.hidden === shown) this.list.hidden = !shown;
    const nameOf = (id: number): string => this.host.nameOf(id) || (id === ownId ? this.host.ownName() : UNKNOWN_NAME);
    const { rows, ownNext } = shown ? ownGuildRows(this.book.guildStatus, this.book.warPlayers, ownId, nameOf, (id) => this.host.hpOf(id))
      : { rows: [], ownNext: false };
    // the two lines while the war is on (`m_nState == WAR_STATE`, WndWorld.cpp:1601-1616)
    const ready = ownNext && this.book.state === GcState.WAR;
    if (this.ready.hidden === ready) { this.ready.hidden = !ready; this.lastLayout = -Infinity; }
    if (!shown) return;
    const signature = `${compact}|${guildName}|${JSON.stringify(rows)}`;
    if (signature === this.listDrawn) return;
    this.listDrawn = signature;
    const m = compact ? LIST_COMPACT : LIST_DESKTOP;
    const step = m.row;
    this.listTitle.textContent = guildName;
    this.listTitle.style.color = cssRgb(COLOR_TITLE);
    // the box: x 5 to 140 from y 120, (n + 2) rows high; the title at (10, 129), the rows from y 150 (WndWorld.cpp:1476-1492)
    this.place(this.list, { left: 5, top: 120 });
    this.list.style.width = `${m.width}px`;
    this.list.style.height = `${(rows.length + 2) * step}px`;
    this.listTitle.style.left = '5px';
    this.listTitle.style.top = '9px';
    let y = 30;
    const elements = rows.map((row) => {
      if (row.gapBefore) y += step;
      const element = this.doc.createElement('div');
      element.className = 'hud-siege-member';
      element.style.top = `${y}px`;
      element.style.color = cssRgb(row.color);
      const span = (className: string, text: string, left: number): void => {
        const piece = this.doc.createElement('span');
        piece.className = className;
        piece.textContent = text;
        piece.style.left = `${left}px`;
        element.append(piece);
      };
      if (row.defender) span('hud-siege-defender', 'D', -1);
      span('hud-siege-number', row.number, m.numberX);
      span('hud-siege-name', row.name, m.nameX);
      span('hud-siege-lives', row.lives, m.livesX);
      // the HP bar at x 150: 60 x 11, ARGB(100, 0, 0, 0) under ARGB(100, 0, 255, 0) (:1583-1595); the phone's 30 px
      const bar = this.doc.createElement('span');
      bar.className = 'hud-siege-hp';
      bar.style.left = `${m.barX}px`;
      bar.style.width = `${m.bar}px`;
      const fill = this.doc.createElement('span');
      fill.style.width = `${m.bar === 60 ? row.hp : Math.round((row.hp * m.bar) / 60)}px`;
      bar.append(fill);
      element.append(bar);
      y += step;
      return element;
    });
    this.listRows.replaceChildren(...elements);
  }

  private place(element: HTMLElement, at: { left?: number; right?: number; top: number }): void {
    element.style.left = at.left === undefined ? '' : `${at.left}px`;
    element.style.right = at.right === undefined ? '' : `${at.right}px`;
    element.style.top = `${at.top}px`;
  }

  /**
   * The phone's column under the Navigator: the count-down and the "be ready" lines right-aligned at its top, then the
   * guild board, and the player board left of it; the column as far right as it can stand clear of the controls
   * (`OBSTACLES`) over its height, the player board likewise. Read from the page's layout, as the controls' places come
   * from style.css's phone rules.
   */
  private layoutCompact(): void {
    const root = this.element.getBoundingClientRect();
    if (root.width === 0 || root.height === 0) return;
    const nav = this.doc.querySelector<HTMLElement>('.hud-navigator');
    const navBox = nav === null || nav.hidden ? null : nav.getBoundingClientRect();
    const top = Math.max(GAP, (navBox !== null && navBox.height > 0 ? navBox.bottom - root.top : 0) + GAP);
    const obstacles = [...this.doc.querySelectorAll<HTMLElement>(OBSTACLES)]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => ({ left: box.left - root.left, right: box.right - root.left, top: box.top - root.top, bottom: box.bottom - root.top }));
    const boards = !this.guildBoard.box.hidden;
    const clock = this.clock.hidden ? 0 : CLOCK_HEIGHT;
    const ready = this.ready.hidden ? 0 : READY_HEIGHT;
    const width = COMPACT.width;
    const right = clearOf(obstacles, root.width - GAP, top, width, clock + ready + (boards ? this.guildBoard.height : 0));
    const text = (element: HTMLElement, y: number): void => {
      element.style.left = 'auto';
      element.style.right = `${root.width - right}px`;
      element.style.top = `${y}px`;
    };
    text(this.clock, top);
    text(this.ready, top + clock);
    if (!boards) return;
    const y = top + clock + ready;
    this.place(this.guildBoard.box, { left: Math.max(0, right - width), top: y });
    const left = clearOf(obstacles, right - width - GAP, y, width, this.playerBoard.height);
    this.place(this.playerBoard.box, { left: Math.max(0, left - width), top: y });
  }
}

/** The rightmost right edge at or left of `right` where a `width` x `height` box at `top` meets none of `obstacles`. */
function clearOf(obstacles: ReadonlyArray<{ left: number; right: number; top: number; bottom: number }>, right: number, top: number, width: number, height: number): number {
  for (let moved = true, rounds = 0; moved && rounds < 50; rounds++) {
    moved = false;
    for (const o of obstacles) {
      if (o.bottom + GAP <= top || o.top - GAP >= top + height) continue;
      if (o.right + GAP <= right - width || o.left - GAP >= right) continue;
      right = o.left - GAP;
      moved = true;
    }
  }
  return right;
}
