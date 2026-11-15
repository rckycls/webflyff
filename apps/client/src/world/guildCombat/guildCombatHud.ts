// The Guild Siege's glue to the screen and the session (2026-11-15). It routes the book's events to the screen's listeners
// and the siege's packets out through `host.send` (`WorldSession.sendGuildCombat`), and (B3) it runs Frankie's and
// Donaris's windows (hud/guildCombat/*.ts):
//
//   CWndWorld::OnCommand MMI_GUILDWAR_* / MMI_GUILDCOMBAT_*   _Interface/WndWorld.cpp:3941-4159   what each entry does
//   CDPClient::OnGuildCombat                                  Neuz/DPClient.cpp:6745-7646         the answers that open a window
//   CWndWorld::Process                                        WndWorld.cpp:8402-8436              the NPC windows close when the
//                                                                                                  player starts to move: the offer,
//                                                                                                  the status and the join confirm
//                                                                                                  (the cancel confirm, the boards and
//                                                                                                  the two boxes stay)
//
// The arena HUD and the line-up, ranking and result windows come on top of it in later tasks.

import {
  encodeGcApply, encodeGcCancel, encodeGcJoin, encodeGcLineup, encodeGcLineupWindow, encodeGcPenyaGuild, encodeGcPlayerPoint, encodeGcSelectMap, encodeGcStatus,
  encodeGcTele, encodeGcWindow,
} from '@flyffweb/protocol';
import type { GuildCombatMessage } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { MMI } from '../hud/moverMenu';
import { formatText } from '../hud/format';
import { ApplyWindow } from '../hud/guildCombat/applyWindow';
import { BoardWindow } from '../hud/guildCombat/boardWindow';
import { YesNoWindow, cancelLayout, joinLayout } from '../hud/guildCombat/confirmWindows';
import { DiagBox, TeleBox } from '../hud/guildCombat/infoBoxes';
import { LineupWindow } from '../hud/guildCombat/lineupWindow';
import type { LineupPerson } from '../hud/guildCombat/lineupWindow';
import { StartPointWindow } from '../hud/guildCombat/startPointWindow';
import { RankingWindow } from '../hud/guildCombat/rankingWindow';
import { ResultWindow } from '../hud/guildCombat/resultWindow';
import { SiegeRankingWindow } from '../hud/guildCombat/siegeRankingWindow';
import { SiegeRankingCache } from './siegeWebApi';
import { StatusWindow } from '../hud/guildCombat/statusWindow';
import type { GuildCombatBook, GuildCombatEvent } from './guildCombatBook';
import { BOARD_OF_ENTRY } from './boardTexts';
import { GcState, GcTid, bidRefusal, joinRefusal, penyaNotice } from './guildCombatRules';

/** What the siege HUD needs of the screen. */
export interface GuildCombatHost {
  send(bytes: Uint8Array): void;
  /** A text of the catalog by its TID name ('' when it has none). */
  text(tid: string): string;
  /** A text of the catalog by its number (`textId`, `prj.GetText( TID_* )`). */
  textById(textId: number): string;
  /** `OpenMessageBox( text )`: OK only, or OK and Cancel with `ok` (the cancel does nothing). */
  box(text: string, ok?: () => void): void;
  /** `IsBaseJob()` of the own player (a vagrant). */
  ownIsVagrant(): boolean;
  /** The own guild's name, '' with none. */
  ownGuildName(): string;
  /** `pGuild->IsMaster( me )`. */
  ownIsGuildMaster(): boolean;
  /** The own guild's members, online or not, with their player data (the guild book); [] with no guild. */
  guildMembers(): LineupPerson[];
  /** The own penya (`GetGold`). */
  ownGold(): number;
  /** A player's name, '' while unknown (the player data asks for it once, `SendQueryPlayerData`). */
  nameOf(playerId: number): string;
  /** A guild's name, '' when the client does not know the guild. */
  guildName(guildId: number): string;
  /** A guild's master's player id, 0 when unknown. */
  guildMasterId(guildId: number): number;
  ownPlayerId(): number;
  ownGuildId(): number;
  /** The jobs of the game data by id. */
  jobs(): Readonly<Record<number, { title: string } | undefined>>;
  /** A download of a text file (the result window's Save). */
  save(filename: string, text: string): void;
  /** The screen's clock, in ms. */
  now(): number;
}

/** The English of a title when the catalog has none. */
const TITLES = {
  offer: 'Guild Siege - Apply', state: 'Guild Siege - Applying Situation', cancel: 'Guild Siege - Cancel Application',
  lineup: 'Set Entry List for Guild Siege', entrance: 'Entering Guild Siege Arena', board: 'Guild Siege - Info.', intro: 'Guild Siege Introduction',
} as const;

export class GuildCombatHud {
  /** Listeners for the book's events (the windows of the later tasks). */
  private readonly listeners = new Set<(events: readonly GuildCombatEvent[]) => void>();
  readonly apply: ApplyWindow;
  readonly status: StatusWindow;
  readonly cancel: YesNoWindow;
  readonly join: YesNoWindow;
  readonly board: BoardWindow;
  readonly tele: TeleBox;
  readonly diag: DiagBox;
  readonly lineup: LineupWindow;
  readonly startPoint: StartPointWindow;
  readonly result: ResultWindow;
  readonly ranking: RankingWindow;
  /** 2026-11-15 (C2): the owner's Siege Ranking window, from the website (the Start menu, the icons). */
  readonly siegeRanking: SiegeRankingWindow;
  /** The last offer window's data (`m_dwReqGold`, the minimum). */
  private offer = { ownBid: 0, minBid: 0 };
  private lastTick = 0;

  constructor(private readonly host: GuildCombatHost, readonly book: GuildCombatBook, art: UiArt, doc: Document = document) {
    const title = (tid: string, fallback: string): string => host.text(tid) || fallback;
    this.apply = new ApplyWindow(title('TID_GAME_GUILDCOMBAT_OFFER', TITLES.offer), art, doc);
    this.apply.onAccept = (fee) => this.accept(fee);
    this.status = new StatusWindow(title('TID_GAME_GUILDCOMBAT_OFFERSTATE', TITLES.state), art, doc);
    this.status.onApply = () => this.send(encodeGcWindow());
    this.status.onRefresh = () => this.send(encodeGcStatus());
    this.cancel = new YesNoWindow(
      cancelLayout(title('TID_GAME_GUILDCOMBAT_CANCEL_CONFIRM', TITLES.cancel), host.text('TID_GAME_GUILDWAR_CANCEL')), 'cancel', art, doc, 0xff000000,
    );
    this.cancel.onYes = () => { this.send(encodeGcCancel()); this.cancel.close(); };
    this.join = new YesNoWindow(
      joinLayout(title('TID_GAME_GUILDCOMBAT_ENTRANCE', TITLES.entrance), host.text('TID_GAME_GUILDWAR_JOIN')), 'join', art, doc, 0xff0000ff,
    );
    this.join.onYes = () => this.joinYes();
    this.board = new BoardWindow(title('TID_GAME_GUILDCOMBAT_BOARD', TITLES.board), art, doc);
    this.tele = new TeleBox(title('TID_GAME_GUILDCOMBAT_OFFERSTATE', TITLES.state), art, doc);
    this.tele.onYes = () => this.send(encodeGcTele());
    this.diag = new DiagBox(TITLES.intro, art, doc);
    this.lineup = new LineupWindow(title('TID_GAME_GUILDCOMBAT_SELECTION', TITLES.lineup), art, {
      refuse: (tid, maxJoin) => host.box(formatText(host.textById(tid), [maxJoin])),
      remake: (ok) => host.box(host.textById(GcTid.REMAKE_MAKEUP), ok),
      stillOpen: () => this.lineupOpen(),
      send: (defenderId, ids) => this.send(encodeGcLineup(defenderId, ids)),
    }, doc);
    this.startPoint = new StartPointWindow(art, doc, () => host.textById(GcTid.JOIN_MESSAGE) || 'After %d, you enter %s.');
    this.startPoint.onSelect = (map) => this.send(encodeGcSelectMap(map));
    this.result = new ResultWindow('Guild & Member Ranking', art, {
      book,
      context: () => ({
        playerName: (id) => host.nameOf(id), guildName: (id) => host.guildName(id), guildMasterId: (id) => host.guildMasterId(id),
        ownPlayerId: host.ownPlayerId(), text: (tid) => host.text(tid),
      }),
      ownGuildId: () => host.ownGuildId(), save: (name, text) => host.save(name, text), box: (text) => host.box(text),
      saveText: () => host.text('TID_GAME_GUILDCOMBAT_LOG_SAVE'), now: () => new Date(), text: (tid) => host.text(tid),
    }, doc);
    this.ranking = new RankingWindow('Guild Member Ranking', art, {
      playerName: (id) => host.nameOf(id), ownPlayerId: () => host.ownPlayerId(), jobs: () => host.jobs(), text: (tid) => host.text(tid),
    }, doc);
    const rankingCache = new SiegeRankingCache();
    this.siegeRanking = new SiegeRankingWindow(art, {
      load: (board, span) => rankingCache.load(board, span), ownName: () => host.nameOf(host.ownPlayerId()),
      ownGuildName: () => host.ownGuildName(), jobs: () => host.jobs(),
    }, doc);
  }

  /** The windows, for the world screen's layer. */
  get elements(): HTMLElement[] {
    return [this.apply, this.status, this.cancel, this.join, this.board, this.tele, this.diag, this.lineup, this.startPoint, this.result, this.ranking, this.siegeRanking].map((w) => w.element);
  }

  get isOpen(): boolean {
    return [this.apply, this.status, this.cancel, this.join, this.board, this.tele, this.diag, this.lineup, this.startPoint, this.result, this.ranking].some((w) => w.isOpen);
  }

  /** A siege packet the client sends (the `encodeGc*` bytes). */
  send(bytes: Uint8Array): void {
    this.host.send(bytes);
  }

  /** Hears the events of every message the book applies. Returns what stops it. */
  onEvents(listener: (events: readonly GuildCombatEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The events a message brought, from the screen: the windows' answers, then the listeners. */
  handle(events: readonly GuildCombatEvent[]): void {
    for (const event of events) if (event.kind === 'message') this.answer(event.message);
    for (const listener of [...this.listeners]) listener(events);
  }

  /** An NPC's menu entry (`CWndWorld::OnCommand`, WndWorld.cpp:3941-4159). */
  openEntry(mmi: number): void {
    switch (mmi) {
      case MMI.GUILDWAR_APP: this.send(encodeGcWindow()); break;
      case MMI.GUILDWAR_STATE: this.send(encodeGcStatus()); break;
      case MMI.GUILDWAR_CANCEL: this.cancel.close(); this.cancel.open(); break;
      case MMI.GUILDWAR_JOIN: this.join.close(); this.join.open(); break;
      case MMI.GUILDCOMBAT_RANKING: this.send(encodeGcPlayerPoint()); break;
      case MMI.GUILDCOMBAT_SELECTION: this.send(encodeGcLineupWindow()); break;
      // the guild master's only: for anyone else Neuz does nothing (:4027-4037)
      case MMI.GUILDCOMBAT_JACKPOT: if (this.host.ownIsGuildMaster()) this.send(encodeGcPenyaGuild()); break;
      default: {
        const text = BOARD_OF_ENTRY[mmi];
        if (text !== undefined) this.board.open(text);
      }
    }
  }

  /** The player started to move: the NPC windows Neuz deletes (`WndWorld.cpp:8402-8436`) close. */
  closeForMove(): void {
    this.apply.close();
    this.status.close();
    this.join.close();
    this.lineup.close(); // an NPC-opened siege window too (A-client.md §1.2)
    this.ranking.close(); // Donaris's ranking (B6; the result window stays)
  }

  /** Each frame: the status's count-down once a second. */
  step(nowMs: number): void {
    if (this.startPoint.isOpen) this.startPoint.tick(this.host.now());
    if (nowMs - this.lastTick < 1000) return;
    this.lastTick = nowMs;
    if (this.status.isOpen) this.status.tick(this.host.now());
    // the names that came since (the player data answers later)
    this.result.refresh();
    this.ranking.refresh();
  }

  close(): void {
    for (const w of [this.apply, this.status, this.cancel, this.join, this.board, this.tele, this.diag, this.lineup, this.startPoint, this.result, this.ranking]) w.close();
  }

  dispose(): void {
    this.listeners.clear();
    for (const w of [this.apply, this.status, this.cancel, this.join, this.board, this.tele, this.diag, this.lineup, this.startPoint, this.result, this.ranking]) {
      w.close();
      w.element.remove();
    }
  }

  /** What `OnGuildCombat` does with a message that is for a window or a box. */
  private answer(message: GuildCombatMessage): void {
    switch (message.sub) {
      case 'inWindow':
        // closed unless the siege is: "Guild Siege is closed." (DPClient.cpp:6822-6867; the prize is not shown on V15)
        if (this.book.state !== GcState.CLOSE) { this.host.box(this.host.textById(GcTid.REQUESTEND)); return; }
        this.offer = { ownBid: message.ownBid, minBid: message.minBid };
        this.apply.open(message.ownBid, message.minBid);
        break;
      case 'requestStatus':
        this.status.show({
          endsAt: this.host.now() + message.secondsToNext * 1000, guildNames: message.guildNames, ownBid: message.ownBid,
          ownGuildName: this.host.ownGuildName(),
        }, this.host.now());
        break;
      case 'selectPlayer': {
        // GC_SELECTPLAYER (DPClient.cpp:6927-6979): the window with the saved entrants, "completed" without one, nothing for a read
        if (!message.requestWar) break;
        if (!message.window) { this.host.box(this.host.textById(GcTid.PLAYER_MAKEUP)); break; }
        if (!this.lineupOpen()) break;
        this.lineup.open({
          maxJoin: message.maxJoin, maxWar: message.maxWar, defenderId: message.defenderId, playerIds: message.playerIds,
          infoText: formatText(this.host.textById(GcTid.OFFER_INFO) || 'Register an entry for guild siege.   Starting member %d (Maximum member %d)', [message.maxWar, message.maxJoin]),
        }, this.host.guildMembers());
        break;
      }
      case 'selectWarPos': this.startPoint.open(message.map, message.seconds, this.host.now()); break;
      case 'diagMessage': this.diag.open(message.text); break;
      case 'tele': this.tele.open(message.text); break;
      // B6: GC_LOG opens the result window, GC_PLAYERPOINT (Donaris's Ranking) the ranking window
      case 'log': this.result.open(); break;
      case 'playerPoint': this.ranking.open(message.players); break;
      case 'getPenyaGuild':
      case 'getPenyaPlayer': {
        const notice = penyaNotice(message.sub === 'getPenyaGuild' ? 'guild' : 'player', message.result, message.penya, this.host.ownGold());
        if (notice !== null) this.host.box(formatText(this.host.textById(notice.tid), notice.penya === null ? [] : [notice.penya]));
        break;
      }
      default:
    }
  }

  /** The line-up opens and completes only while the siege waits for entries (`m_nGCState`, WndField.cpp:16100-16115). */
  private lineupOpen(): boolean {
    if (this.book.warState === GcState.NOTENTER_COUNT) return true;
    this.host.box(this.host.textById(GcTid.CANNOT_MAKEUP));
    return false;
  }

  /** The offer's Accept (`WndGuildCombat1to1.cpp:670-718`). */
  private accept(fee: number): void {
    const refusal = bidRefusal(fee, this.offer.ownBid, this.offer.minBid);
    if (refusal !== null) { this.host.box(this.host.textById(refusal)); return; }
    const old = this.offer.ownBid;
    const question = formatText(this.host.textById(GcTid.MORE_REQUEST), old === 0 ? [0, fee] : [old, fee - old]);
    this.host.box(question, () => {
      this.send(encodeGcApply(fee));
      this.apply.close();
    });
  }

  /** The join confirm's Yes (`WndField.cpp:17031-17065`). */
  private joinYes(): void {
    const refusal = joinRefusal(this.host.ownIsVagrant());
    this.join.close();
    if (refusal !== null) { this.host.box(this.host.textById(refusal)); return; }
    this.send(encodeGcJoin());
  }
}
