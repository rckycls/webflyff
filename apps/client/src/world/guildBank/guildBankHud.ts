// The guild bank's windows joined to its rules and the session (2026-11-15, side-session-notes housing-research/research-note.md
// §1; A-client.md §1, B-server.md §1), so that the world screen only routes messages, presses and the frame to it:
//
//   CWndWorld MMI_GUILDBANKING          _Interface/WndWorld.cpp:5543-5612   the checks, then GUILD_BANK_WND
//   CDPClient::OnGuildBankWindow        Neuz/DPClient.cpp:3010-3034         mode 0: the guild's penya, the bank, the bag, then
//                                                                           the Guild Safebox beside it
//   CWndGuildBank::OnInitialUpdate      _Interface/WndGuildBank.cpp:90-172  goes at once with a trade, shop, bank or vendor
//                                                                           open; Create Cloak for the master only; beside the bag
//   CWndGuildBank::OnChildNotify        :190-397                            a bag item dropped: worn, premium, the count's box;
//                                                                           Contribute Guild, Create Cloak, the log
//   CWndInventory::OnChildNotify        _Interface/WndField.cpp:2001-2060   a guild bank item or its penya dropped on the bag:
//                                                                           silent without the Item / Penya right
//   CWndTradeGold::OnChildNotify        WndField.cpp:8545-8604              the count's box for APP_GUILD_BANK and APP_MESSENGER
//   CWndGuildMerit::OnChildNotify       _Interface/WndGuildMerit.cpp:120-207 the gems, the penya, CanContribute, MeritResultMsg
//   CWndManager (the bank closed)       _Interface/WndManager.cpp:1478-1491 GUILD_BANK_WND_CLOSE, the count's box goes
//   CWndWorld::Process                  WndWorld.cpp:8351-8356              any move: GUILD_BANK_WND_CLOSE and the window goes
//   CDPClient::OnPutItemGuildBank ...   Neuz/DPClient.cpp:2843-2943, :16120-16134, :17029-17175  the bank's changes, the log

import type { GuildBankLogRow, GuildBankMessage, GuildMemberEntry, InventoryItem } from '@flyffweb/protocol';
import {
  GuildBankMode, GuildLogType, NULL_ID, encodeCloseGuildBankWnd, encodeCreateGuildCloak, encodeGetGoldGuildBank,
  encodeGetItemGuildBank, encodeGuildBankLogView, encodeGuildContribution, encodeOpenGuildBankWnd, encodePutItemGuildBank,
} from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { AmountBox } from '../hud/amountBox';
import { formatText } from '../hud/format';
import type { WindowFrame } from '../hud/frame';
import { GuildBankLogWindow, GuildBankWindow, GuildMeritWindow, LOG_TABS } from '../hud/guildBank/guildBankWindows';
import { GuildPower, GuildRank, hasPower, isMaster, rankOf } from '../guild/guildRules';
import type { GuildLike } from '../guild/guildRules';
import { GuildBankBook } from './guildBankBook';

const WHITE = 0xffffffff;
/** The Guild Safebox's width (its picture's, guildBankWindows.ts GUILD_BANK): it goes this far left of a bag on the right half. */
const WINDOW_WIDTH = 208;
/** `APP_INVENTORY`'s width (resdata.inc:19776). */
const BAG_WIDTH = 240;
/** The log window's width (resdata.inc:13304), and its gap from the Guild Safebox (WndGuildBank.cpp:458-472). */
const LOG_WIDTH = 496;
const LOG_GAP = 10;
/** `CGuildTable::GetMaxLevel()`: the table's 50 rows. */
const MAX_GUILD_LEVEL = 50;
/** Create Cloak needs guild level 4 (`m_nLevel < 4`, WndGuildBank.cpp:333-341). */
const CLOAK_LEVEL = 4;
/** `IK3_GEM` (`Resource/defineItemkind.h:107`): the quest items Contribute Guild gives; `IK3_CLOAK` (:92). */
const IK3_GEM = 34;
const IK3_CLOAK = 24;
/** `WEAPON_ULTIMATE` (`dwReferStat1`, defineItemkind.h:234): "(U)" before the name in the log. */
const WEAPON_ULTIMATE = 2;
/** `II_ARM_S_CLO_CLO_DRAGON1` .. 4 (`Resource/defineItem.h:1468-1471`): the siege cloaks keep their own names in the log. */
const DRAGON_CLOAKS: ReadonlySet<number> = new Set([4703, 4704, 4705, 4706]);
const U32 = 0x1_0000_0000;
const INT_MAX = 0x7fffffff;

/** What the own guild gives the guild bank's rules. */
export interface GuildBankGuild extends GuildLike {
  guildId: number;
  /** `m_nGoldGuild`: the guild's penya. */
  gold: number;
  /** `m_dwContributionPxp`. */
  contributionPxp: number;
  members: ReadonlyMap<number, GuildMemberEntry>;
}

/** What the guild bank needs of the world screen. */
export interface GuildBankHudScreen {
  send(bytes: Uint8Array): void;
  /** A line of the HUD's messages (`PutString`). */
  say(text: string, color: number): void;
  /** `OpenMessageBox( text )`. */
  box(text: string): void;
  /** The own guild (`g_pPlayer->GetGuild()`), null without one; the own player's id. */
  guild(): GuildBankGuild | null;
  ownPlayerId(): number;
  /** OnGuildBankWindow's penya, and OnGetItemGuildBank's: the guild book's fund (and a member's contribution) changed. */
  setGuildGold(gold: number): void;
  takeGuildGold(gold: number, playerId: number, cloak: boolean): void;
  /** The guild with id `guildId` loses `gold` (a GM's REMOVE_GUILD_BANK_ITEM). */
  removeGuildGold(guildId: number, gold: number): void;
  bagItems(): ReadonlyMap<number, InventoryItem> | null;
  /** `m_Inventory.Add( &itemElem )` and `AddGold( n, FALSE )`: the own bag. */
  bagAdd(item: InventoryItem): void;
  addOwnGold(delta: number): void;
  /** The bag object is worn (`IsEquip`). */
  worn(objectId: number): boolean;
  prop(itemId: number): WebItemProp | undefined;
  packMax(itemId: number): number;
  /** The windows the menu's checks and `OnInitialUpdate`'s look at. */
  tradeOpen(): boolean;
  npcShopOpen(): boolean;
  /** The bank or one of its PIN windows is open. */
  bankBusy(): boolean;
  vendorOpen(): boolean;
  summonAngelOpen(): boolean;
  /** `CreateApplet( APP_INVENTORY )`, and the bag's frame for the placing. */
  openInventory(): void;
  inventoryFrame(): WindowFrame | null;
  /** An item's tooltip over `anchor` in `host`, or none. */
  showTooltip(item: InventoryItem | null, anchor: HTMLElement | null, host: HTMLElement): void;
}

/** What a drop asks: nothing, a line, a packet at once, or the count's box first (its title, lines, all of it, the packet). */
export type GuildBankAction =
  | { kind: 'none' }
  | { kind: 'line'; tid: string; english: string }
  | { kind: 'send'; bytes: Uint8Array }
  | { kind: 'ask'; penya: boolean; max: number; send: (amount: number) => Uint8Array | null };

/** A bag item dropped on the Guild Safebox (WndGuildBank.cpp:225-277; the box's APP_GUILD_BANK, WndField.cpp:8545-8560). */
export function putAction(
  objectId: number, bag: ReadonlyMap<number, InventoryItem> | null, worn: (objectId: number) => boolean,
): GuildBankAction {
  const item = bag?.get(objectId);
  if (item === undefined) return { kind: 'none' };
  // dragged from the equipment: not one selected bag item
  if (worn(objectId)) return { kind: 'line', tid: 'TID_GAME_EQUIPPUT', english: 'Please unequip the item first.' };
  // `IsCharged` (the browser keeps `m_bCharged`)
  if (item.charged === 1) return { kind: 'line', tid: 'TID_GAME_NOTTRADE', english: 'You cannot trade a premium item.' };
  if (item.count > 1) {
    return {
      kind: 'ask', penya: false, max: item.count,
      send: (n) => {
        const now = bag?.get(objectId);
        return now === undefined ? null : encodePutItemGuildBank(objectId, Math.min(n, now.count));
      },
    };
  }
  return { kind: 'send', bytes: encodePutItemGuildBank(objectId, 1) };
}

/**
 * A guild bank item (or, `objectId` undefined, its penya) dropped on the bag (WndField.cpp:2001-2060): silent without the
 * Item or Penya right; the count's box (APP_MESSENGER, :8568-8604) clamps to what the bank holds.
 */
export function takeAction(
  objectId: number | undefined, book: GuildBankBook, guild: GuildBankGuild | null, ownPlayerId: number,
): GuildBankAction {
  if (guild === null) return { kind: 'none' };
  if (objectId === undefined) {
    if (!hasPower(guild, ownPlayerId, GuildPower.PENYA)) return { kind: 'none' };
    return {
      kind: 'ask', penya: true, max: guild.gold,
      send: (n) => { const m = Math.min(n, guild.gold); return m > 0 ? encodeGetGoldGuildBank(m) : null; },
    };
  }
  if (!hasPower(guild, ownPlayerId, GuildPower.ITEM)) return { kind: 'none' };
  const item = book.item(objectId);
  if (item === undefined) return { kind: 'none' };
  if (item.count > 1) {
    return {
      kind: 'ask', penya: false, max: item.count,
      send: (n) => {
        const now = book.item(objectId);
        return now === undefined ? null : encodeGetItemGuildBank(objectId, Math.min(n, now.count));
      },
    };
  }
  return { kind: 'send', bytes: encodeGetItemGuildBank(objectId, 1) };
}

/** `CGuild::MeritResultMsg`'s lines (WndGuildMerit.cpp:92-118); the two PXP overflows print nothing. */
const MERIT_LINES: Readonly<Record<string, string>> = {
  TID_GAME_GUILDMERITSTUFF: 'You have Contributed to the guild.',
  TID_GAME_GUILDMERITMAXLEVEL: 'Unable to make a contribution. The guild has reached its maximum level.',
  TID_GAME_GUILDMAXBANKGOLD: 'You can only have a maximum of 420 million Penya in the guild bank.',
  TID_GAME_GUILDMERITSYSERROR: 'System error. Contribution cancelled.',
  TID_GAME_GUILDMERITMAXGOLD: 'Maximum Penya contribution reached.',
};

/**
 * `CGuild::CanContribute( dwPxp, dwPenya, idPlayer )` (`_Common/guild.cpp:554-576`) with `MeritResultMsg`'s line: `ok`
 * whether the packet goes, `tid` the line printed (null for none).
 */
export function contributeCheck(guild: GuildBankGuild, ownPlayerId: number, pxp: number, penya: number): { ok: boolean; tid: string | null } {
  if (pxp > 0 && guild.level >= MAX_GUILD_LEVEL) return { ok: false, tid: 'TID_GAME_GUILDMERITMAXLEVEL' };
  if (guild.contributionPxp + pxp >= U32) return { ok: false, tid: null };
  if (guild.gold + penya >= U32) return { ok: false, tid: 'TID_GAME_GUILDMAXBANKGOLD' };
  const member = guild.members.get(ownPlayerId);
  if (member === undefined) return { ok: false, tid: 'TID_GAME_GUILDMERITSYSERROR' };
  if (member.givePxp + pxp >= U32) return { ok: false, tid: null };
  if (member.giveGold + penya > INT_MAX) return { ok: false, tid: 'TID_GAME_GUILDMERITMAXGOLD' };
  return { ok: true, tid: 'TID_GAME_GUILDMERITSTUFF' };
}

/** `atoi` of the penya field, below 0 taken as 0 (WndGuildMerit.cpp:171-174); past INT_MAX held at it. */
export function meritPenya(typed: string): number {
  const match = /^\s*([+-]?\d+)/.exec(typed);
  if (match === null) return 0;
  const value = Number(match[1]);
  return value < 0 ? 0 : Math.min(value, INT_MAX);
}

/** The bag's gems (`dwItemKind3 == IK3_GEM`, :130-150), in object order, as Quest Items lists them. */
export function meritItems(bag: ReadonlyMap<number, InventoryItem> | null, prop: (itemId: number) => WebItemProp | undefined): InventoryItem[] {
  if (bag === null) return [];
  return [...bag.values()].filter((item) => prop(item.itemId)?.kind3 === IK3_GEM).sort((a, b) => a.objectId - b.objectId);
}

/** `CString::Left` past `n` characters with "..." (the log's names at 9, its items at 25). */
const shorten = (text: string, n: number): string => (text.length > n ? `${text.slice(0, n)}...` : text);

/** `"%.2d%.2d%.2d %.2d:%.2d   "` of a `CTime`: the year, month, day, hour and minute in the local time, three spaces after. */
export function logDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getFullYear())}${two(d.getMonth() + 1)}${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}   `;
}

/** What a log line reads besides the row. */
export interface LogLineContext {
  text(tid: string, english: string): string;
  prop(itemId: number): WebItemProp | undefined;
  /** The own guild's name, for "%s Guild Cloak". */
  guildName: string;
}

/** One row of GUILDLOG_VIEW as `OnGuildBankLogList` writes it (DPClient.cpp:17080-17170). */
export function logLine(logType: number, row: GuildBankLogRow, ctx: LogLineContext): string {
  const date = logDate(row.date);
  if (logType === GuildLogType.ITEM_ADD || logType === GuildLogType.ITEM_REMOVE) {
    const prop = ctx.prop(row.value);
    let item = prop?.name ?? `Item ${row.value}`;
    if (prop?.referStat1 === WEAPON_ULTIMATE) item = `(U)${item}`;
    if (prop?.kind3 === IK3_CLOAK && !DRAGON_CLOAKS.has(row.value)) item = formatText(ctx.text('TID_GUILD_CLOAK', '%s Guild Cloak'), [ctx.guildName]);
    item = shorten(item, 25);
    if (row.option > 0) item += ` +${row.option}`;
    const [tid, english] = logType === GuildLogType.ITEM_ADD
      ? ['TID_GAME_GUILDBANK_LOG_ITEM_ADD', 'Add %s    %s    %s    %d'] : ['TID_GAME_GUILDBANK_LOG_ITEM_REMOVE', 'Remove %s    %s    %s    %d'];
    return formatText(ctx.text(tid, english), [date, shorten(row.name, 9), item, row.count]);
  }
  const [tid, english] = logType === GuildLogType.PENYA_ADD
    ? ['TID_GAME_GUILDBANK_LOG_PENYA_ADD', 'Deposit Penya %s         %s         %d']
    : ['TID_GAME_GUILDBANK_LOG_PENYA_REMOVE', 'Withdraw Penya %s         %s         %d'];
  return formatText(ctx.text(tid, english), [date, row.name, row.value]);
}

export class GuildBankHud {
  readonly window: GuildBankWindow;
  readonly merit: GuildMeritWindow;
  readonly log: GuildBankLogWindow;
  readonly amount: AmountBox;
  readonly book = new GuildBankBook();
  private pending: ((amount: number) => Uint8Array | null) | null = null;
  /** The window closed by the game: no GUILD_BANK_WND_CLOSE (the world left, or a move already sent it). */
  private quiet = false;
  private drawn = '';

  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: GuildBankHudScreen, doc: Document = document) {
    this.window = new GuildBankWindow(art, doc);
    this.merit = new GuildMeritWindow(art, doc);
    this.log = new GuildBankLogWindow(art, doc);
    this.amount = new AmountBox(art, doc);
    this.log.setTitles(LOG_TABS.map((english, i) => this.text(
      ['TID_GAME_GUILD_BANK_ADDITEMLOG', 'TID_GAME_GUILD_BANK_REMOVEITEMLOG', 'TID_GAME_GUILD_BANK_RECEIVEPENYALOG', 'TID_GAME_GUILD_BANK_INVESTPENYALOG'][i]!,
      english,
    ).text));

    this.window.onDrop = (objectId) => this.dropOnBank(objectId);
    this.window.onTapItem = (objectId) => this.dropOnBag(objectId);
    this.window.onTapPenya = () => this.dropOnBag(undefined);
    this.window.onHover = (objectId, anchor) => {
      const item = objectId === null ? undefined : this.book.item(objectId);
      screen.showTooltip(item ?? null, item === undefined ? null : anchor, this.window.frame.element);
    };
    this.window.onContribute = () => this.contribute();
    this.window.onCloak = () => this.cloak();
    this.window.onLog = () => this.toggleLog();
    // the window gone, whatever closed it: GUILD_BANK_WND_CLOSE, and the merit, the count's box and the log go (~CWndGuildBank)
    this.window.window.onClose = () => {
      screen.showTooltip(null, null, this.window.frame.element);
      this.amount.close();
      this.merit.close();
      this.log.close();
      if (!this.quiet) screen.send(encodeCloseGuildBankWnd());
    };

    // 2026-11-15 (consistency scan): the gems' tooltips, in the merit window, gone with it
    this.merit.onHover = (item, anchor) => screen.showTooltip(item, anchor, this.merit.window.frame.element);
    this.merit.window.onClose = () => screen.showTooltip(null, null, this.merit.window.frame.element);
    this.merit.onCheck = (on) => {
      this.merit.showItems(on ? meritItems(screen.bagItems(), (id) => screen.prop(id)) : [], (id) => screen.prop(id));
    };
    this.merit.onOk = (typed, items) => this.giveMerit(typed, items);
    this.log.onTab = (logType) => screen.send(encodeGuildBankLogView(logType));

    this.amount.onOk = (amount) => {
      const send = this.pending;
      this.pending = null;
      const bytes = send?.(amount) ?? null;
      if (bytes !== null) screen.send(bytes);
    };
    this.amount.onClose = () => { this.pending = null; };
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.window.frame.element, this.merit.window.element, this.log.window.element, this.amount.element];
  }

  /** The Guild Safebox is open (`GetWndBase( APP_GUILD_BANK )`). */
  get isOpen(): boolean {
    return this.window.frame.isOpen;
  }

  /** It or Contribute Guild is open (the checks before dropping an item on the ground, WndWorld.cpp:7782-7784). */
  get busy(): boolean {
    return this.isOpen || this.merit.isOpen;
  }

  private text(tid: string, fallback: string): { text: string; color: number } {
    const entry = this.texts.get(tid);
    return { text: entry?.text || fallback, color: entry?.color ?? WHITE };
  }

  private line(tid: string, fallback: string): void {
    const { text, color } = this.text(tid, fallback);
    this.screen.say(text, color);
  }

  private box(tid: string, fallback: string): void {
    this.screen.box(this.text(tid, fallback).text.replace(/\\n/g, '\n'));
  }

  /** The NPC menu's Guild Warehouse (`MMI_GUILDBANKING`, WndWorld.cpp:5543-5612). */
  request(): void {
    if (this.screen.tradeOpen()) { this.line('TID_GAME_TRADENOBANK', 'You cannot trade items when using the bank.'); return; }
    // the repair window of the checks is not the browser's
    if (this.screen.npcShopOpen()) { this.line('TID_GAME_BANKNOTRADE', 'You cannot use the bank while trading'); return; }
    if (this.isOpen || this.screen.bankBusy()) { this.line('TID_GAME_BANKSTILLUSING', 'You are already using the bank.'); return; }
    // the beauty shops are not the browser's
    if (this.screen.summonAngelOpen()) { this.line('TID_GAME_SUMMONANGELUSING', 'You have summoned an Angel.'); return; }
    this.screen.send(encodeOpenGuildBankWnd());
  }

  /** A guild bank snapshot. */
  handle(message: GuildBankMessage): void {
    switch (message.type) {
      case 'guildBankWindow':
        // OnGuildBankWindow: only mode 0 opens it, and only with a guild (`GetGuild()` is not checked in Neuz)
        if (message.mode !== 0 || message.bank === null || this.screen.guild() === null) return;
        this.screen.setGuildGold(message.gold);
        this.book.load(message.bank);
        this.openBank();
        return;
      case 'putItemGuildBank':
        if (this.screen.guild() === null) return;
        this.book.put(message.item, (id) => this.screen.packMax(id));
        return;
      case 'getItemGuildBank':
        // the bag gets it only when the bank had it (GetAtId first, DPClient.cpp:2911-2921)
        if (this.screen.guild() === null) return;
        if (message.mode === GuildBankMode.ITEM_MINE) {
          const had = this.book.item(message.item.objectId) !== undefined;
          if (had) this.screen.bagAdd(message.item);
        }
        this.book.take(message.item.objectId, message.item.count);
        return;
      case 'getGoldGuildBank':
        if (this.screen.guild() === null) return;
        if (message.mode === GuildBankMode.PENYA_MINE) this.screen.addOwnGold(message.gold);
        this.screen.takeGuildGold(message.gold, message.playerId, message.cloak);
        return;
      case 'removeGuildBankItem': {
        if (message.objectId === NULL_ID) { this.screen.removeGuildGold(message.guildId, message.count); return; }
        // the bank the client holds is the own guild's (`g_GuildMng.GetGuild( idGuild )->RemoveItem`)
        if (this.screen.guild()?.guildId === message.guildId) this.book.take(message.objectId, message.count);
        return;
      }
      case 'guildBankLog': {
        if (!this.log.isOpen) return;
        const guild = this.screen.guild();
        const ctx: LogLineContext = {
          text: (tid, english) => this.text(tid, english).text, prop: (id) => this.screen.prop(id), guildName: guild?.name ?? '',
        };
        this.log.showLines(message.logType, message.rows.map((row) => logLine(message.logType, row, ctx)));
        return;
      }
    }
  }

  /** OnGuildBankWindow: the bag opens, then the Guild Safebox beside it; it goes at once with a trade, shop, bank or vendor open. */
  private openBank(): void {
    this.amount.close();
    this.screen.openInventory();
    if (this.screen.tradeOpen() || this.screen.npcShopOpen() || this.screen.bankBusy() || this.screen.vendorOpen()) {
      // the window destroys itself at once, and its destruction tells the server (WndManager.cpp:1478-1484)
      this.screen.send(encodeCloseGuildBankWnd());
      return;
    }
    const bag = this.screen.inventoryFrame();
    if (!this.isOpen) {
      if (bag !== null && bag.isOpen && !this.window.phone) {
        const at = bag.position;
        // left of a bag on the right half, else right of it (`ptInventory.x > rect.Width() / 2`, :137-149)
        const x = at.x > WINDOW_WIDTH / 2 ? at.x - WINDOW_WIDTH : at.x + BAG_WIDTH;
        this.window.window.open({ x, y: at.y });
      } else this.window.window.open();
    }
    this.drawn = '';
    this.update();
  }

  /** Every frame while open: drawn again when the bank, the penya or the master changed (Neuz draws live). */
  update(): void {
    if (!this.isOpen) return;
    const guild = this.screen.guild();
    if (guild === null) {
      // the guild left while it was open: nothing to show
      this.window.frame.close();
      return;
    }
    const master = isMaster(guild, this.screen.ownPlayerId());
    const key = `${this.book.revision}:${guild.gold}:${master}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.window.draw({ items: this.book.packed(), gold: guild.gold, master, prop: (id) => this.screen.prop(id) });
  }

  /** A bag item dropped on the grid (or tapped on the phone); any open count box goes first (:211). */
  dropOnBank(objectId: number): void {
    if (!this.isOpen) return;
    this.amount.close();
    this.run(putAction(objectId, this.screen.bagItems(), (id) => this.screen.worn(id)));
  }

  /** A guild bank item (or, with none, the penya) dropped on the bag, or tapped on the phone. */
  dropOnBag(objectId: number | undefined): void {
    if (!this.isOpen) return;
    this.amount.close();
    this.run(takeAction(objectId, this.book, this.screen.guild(), this.screen.ownPlayerId()));
  }

  private run(action: GuildBankAction): void {
    switch (action.kind) {
      case 'none':
        return;
      case 'line':
        this.line(action.tid, action.english);
        return;
      case 'send':
        this.screen.send(action.bytes);
        return;
      case 'ask': {
        this.pending = action.send;
        const question = action.penya
          ? this.text('TID_GAME_MOVEPENYA', 'How many do you want to move?').text
          : this.text('TID_GAME_MOVECOUNT', 'Move how many items?').text;
        const label = action.penya ? this.text('TID_GAME_PENYACOUNT', 'Penya:').text : this.text('TID_GAME_NUMCOUNT', 'Number:').text;
        this.amount.open('Move Items', question, label, action.max);
        return;
      }
    }
  }

  /** Contribute Guild (WIDC_BUTTON1, :313-332): the guild must have a name. */
  private contribute(): void {
    const guild = this.screen.guild();
    if (guild === null) return;
    if (guild.name === '') {
      this.box('TID_GAME_GUILDNOTHINGNAME', 'Unable to make a contribution. Ask your Guild Leader to set the guild name first.');
      return;
    }
    this.merit.open();
  }

  /** CWndGuildMerit's YES (WndGuildMerit.cpp:166-200): the penya, then the gems, each checked and its line printed; then it goes. */
  private giveMerit(typed: string, items: boolean): void {
    const guild = this.screen.guild();
    const own = this.screen.ownPlayerId();
    if (guild !== null) {
      const penya = meritPenya(typed);
      if (penya > 0) {
        const check = contributeCheck(guild, own, 0, penya);
        if (check.ok) this.screen.send(encodeGuildContribution(0, penya, 0));
        if (check.tid !== null) this.line(check.tid, MERIT_LINES[check.tid] ?? '');
      }
      if (items) {
        const total = meritItems(this.screen.bagItems(), (id) => this.screen.prop(id)).reduce((sum, item) => sum + item.count, 0);
        const check = contributeCheck(guild, own, total, 0);
        if (check.ok) this.screen.send(encodeGuildContribution(0, 0, 1));
        if (check.tid !== null) this.line(check.tid, MERIT_LINES[check.tid] ?? '');
      }
    }
    this.merit.close();
  }

  /** Create Cloak (WIDC_BUTTON2, :333-345): the master's, at guild level 4; the server checks the logo, the fund, the room. */
  private cloak(): void {
    const guild = this.screen.guild();
    if (guild === null || !isMaster(guild, this.screen.ownPlayerId())) return;
    if (guild.level < CLOAK_LEVEL) { this.box('TID_GAME_GUILDNOTLEVEL', 'Guild level is too low.'); return; }
    this.screen.send(encodeCreateGuildCloak());
  }

  /** The log button (WIDC_LOG, :365-386): the master's and the kingpins'; opens or closes the log beside the Guild Safebox. */
  private toggleLog(): void {
    const guild = this.screen.guild();
    const rank = rankOf(guild, this.screen.ownPlayerId());
    if (rank !== GuildRank.MASTER && rank !== GuildRank.KINGPIN) {
      this.line('TID_GAME_CANNT_USE_GLOG', 'Only Guild Leader or Kingpin can check Guild Bank logs.');
      return;
    }
    if (this.log.isOpen) { this.log.close(); return; }
    if (this.window.phone) { this.log.open('center'); return; }
    // right of the Guild Safebox, or left of it when the screen has no room (WndGuildBank.cpp:452-472)
    const at = this.window.frame.position;
    const root = this.window.frame.element.parentElement?.clientWidth ?? 0;
    const x = root - (at.x + WINDOW_WIDTH) < LOG_WIDTH ? at.x - (LOG_GAP + LOG_WIDTH) : at.x + WINDOW_WIDTH + LOG_GAP;
    this.log.open({ x, y: at.y });
  }

  /** The player moved (WndWorld.cpp:8351-8356): GUILD_BANK_WND_CLOSE, and the window goes with the count's box and the log. */
  moved(): void {
    if (!this.isOpen) return;
    this.screen.send(encodeCloseGuildBankWnd());
    this.closeQuietly();
  }

  /** The own guild left: the windows close (the server's flag goes with the guild). */
  guildLeft(): void {
    this.book.clear();
    if (this.isOpen) this.window.frame.close();
    this.merit.close();
  }

  private closeQuietly(): void {
    this.quiet = true;
    this.window.frame.close();
    this.quiet = false;
  }

  /** The world left: every window closed with no packet (the session is gone). */
  reset(): void {
    this.pending = null;
    this.amount.close();
    this.merit.close();
    this.log.close();
    if (this.isOpen) this.closeQuietly();
    this.book.clear();
  }
}
