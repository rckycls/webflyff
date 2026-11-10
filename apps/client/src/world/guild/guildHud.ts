// The guild's windows wired to the guild book and the session (2026-11-10, guild research §2-§5): the guild window and its
// tabs' buttons, the member menu, the small windows' checks, the invite window, the guild lines in the chat, and the rows
// of the Messenger's Guild tab. The packets go out through `screen.send`; the rules are guildRules.ts's.
//
//   CWndGuildTabInfo::OnChildNotify    _Interface/WndGuildTabInfo.cpp:525-618   the four buttons, master only (silent)
//   CWndGuildTabMember::OnCommand      _Interface/WndGuildTabMember.cpp:552-665 the member menu
//   CWndGuildTabApp::OnChildNotify     _Interface/WndGuildTabApp.cpp:87-282     the rights, the salaries, Apply
//   CWndGuildTabPower::OnChildNotify   _Interface/WndGuildTabPower.cpp:174-267  the guild house's rights, OK
//   CWndGuildName / NickName / Notice / SetLogo / DisMiss / PayConfirm / Confirm: their OKs (guildDialogs.ts)
//   CWndWorld::InviteCompany           _Interface/WndWorld.cpp:11268-11282      the player menu's invite
//   CWndGuildCtrlEx                    _Interface/WndMessengerCtrl.cpp:1094-1419 the Messenger's Guild tab

import { encodeAddGuildMember, encodeChgMaster, encodeDestroyGuild, encodeGuildAuthority, encodeGuildClass,
  encodeGuildInvite, encodeGuildLogo, encodeGuildMemberLevel, encodeGuildNickname, encodeGuildNotice, encodeGuildPenya,
  encodeGuildSetName, encodeQueryPlayerData2, encodeQuerySetGuildName, encodeRemoveGuildMember } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatText } from '../hud/format';
import { MessageBox } from '../hud/messageBox';
import { MoverMenu } from '../hud/moverMenu';
import {
  GuildDisbandWindow, GuildInviteWindow, GuildLogoWindow, GuildNoticeWindow, guildNameWindow, guildNicknameWindow,
  guildPayWindow,
} from '../hud/guild/guildDialogs';
import type { GuildFieldWindow } from '../hud/guild/guildDialogs';
import { GuildWindow } from '../hud/guild/guildWindow';
import type { GuildView, InfoButton } from '../hud/guild/guildWindow';
import type { FriendRow } from '../friends/friendRules';
import { FRS } from '../friends/messenger';
import type { PlayerData } from '../party/playerData';
import type { Guild, GuildBook, GuildEvent } from './guildBook';
import {
  MemberSort, guildNameCheck, isMaster, logoRefusal, memberAction, memberMenuEntries, memberTip, nicknameCheck,
  noticeCheck, payCheck, togglePower,
} from './guildRules';
import type { MemberRow, MemberSortKey, NameCatalog } from './guildRules';

/** `BGM_IN_COMPANY` (`Resource/defineSound.h`), the music of a guild joined (`OnSetGuild`, :12719). */
export const BGM_IN_COMPANY = 26;
const WHITE = 0xffffffff;

/** What the guild windows need of the screen. */
export interface GuildHudScreen {
  send(bytes: Uint8Array): void;
  ownPlayerId(): number;
  /** A game line (`PutString`) in a colour. */
  say(text: string, color: number): void;
  playerData(playerId: number): Readonly<PlayerData>;
  /** The member's player data without asking for it (`GetPlayerData( id, FALSE )`): its version. */
  playerVersion(playerId: number): number;
  /** The name tags to draw again. */
  recolorTags(): void;
  /** The chat's Guild tab enabled or not (`WndCommunication.cpp:216`). */
  setChatGuild(inGuild: boolean): void;
  playMusic(id: number): void;
  /** The banned words and allowed letters of the name rules. */
  nameCatalog(): NameCatalog;
  /** Open the private message window with a player (the Messenger's double click, `OpenMessage`). */
  openMessage(name: string): void;
  /** The world's clock, in seconds since 1970 (the war's time left). */
  now(): number;
}

export class GuildHud {
  readonly window: GuildWindow;
  readonly invite: GuildInviteWindow;
  readonly nameWindow: GuildFieldWindow;
  readonly nicknameWindow: GuildFieldWindow;
  readonly payWindow: GuildFieldWindow;
  readonly notice: GuildNoticeWindow;
  readonly logo: GuildLogoWindow;
  readonly disband: GuildDisbandWindow;
  readonly messageBox: MessageBox;
  readonly menu: MoverMenu;
  private readonly sort = new MemberSort();
  /** The rights as the Title and Permissions tabs show them: a copy of the guild's, changed by the master's presses. */
  private draft: number[] = [0, 0, 0, 0, 0];
  private powerChanged = false;
  /** The guild the draft was taken from, and its rights then. */
  private draftOf = '';
  /** The inviter of the open invite window (`m_idMaster`). */
  private inviterId = 0;
  private nicknameTarget = 0;
  private payRank = 0;
  /**
   * The name window's `m_nId` (`WndGuildName.cpp:84-149`): 0xff from the Information tab (GUILD_SETNAME), else the rename
   * scroll's object id, or 0x7f for the server's forced rename (QUERYSETGUILDNAME).
   */
  private nameId = 0xff;

  constructor(
    art: UiArt,
    private readonly texts: Texts,
    private readonly screen: GuildHudScreen,
    readonly book: GuildBook,
    url: (key: string) => string,
    private readonly doc: Document = document,
  ) {
    const text = (id: string, english: string): string => this.text(id, english);
    this.window = new GuildWindow(art, text, url, doc);
    this.invite = new GuildInviteWindow(art, doc);
    this.nameWindow = guildNameWindow(art, doc);
    this.nicknameWindow = guildNicknameWindow(art, doc);
    this.payWindow = guildPayWindow(art, doc);
    this.notice = new GuildNoticeWindow(art, doc);
    this.logo = new GuildLogoWindow(art, url, doc);
    this.disband = new GuildDisbandWindow(art, doc);
    this.messageBox = new MessageBox(art, doc);
    this.menu = new MoverMenu(doc);
    this.menu.element.className = 'hud-guild-menu';

    this.window.onInfo = (button) => this.infoButton(button);
    this.window.onSort = (key) => this.sortBy(key);
    this.window.onMemberMenu = (row, at) => this.openMenu(row, at);
    this.window.onToggle = (rank, bit) => this.toggleRight(rank, bit);
    this.window.onApply = () => this.apply();
    this.window.onPay = (rank) => this.openPay(rank);
    this.invite.onYes = () => this.send(encodeAddGuildMember(this.inviterId, this.own));
    this.nameWindow.onOk = (typed) => this.setName(typed);
    this.nicknameWindow.onOk = (typed) => this.setNickname(typed);
    this.payWindow.onOk = (typed) => this.setPay(typed);
    this.notice.onPost = (typed) => this.postNotice(typed);
    this.logo.onOk = (logo) => this.send(encodeGuildLogo(logo));
    this.disband.onYes = () => this.send(encodeDestroyGuild(this.own));
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [
      this.window.frame.element, this.invite.window.element, this.nameWindow.window.element,
      this.nicknameWindow.window.element, this.payWindow.window.element, this.notice.window.element,
      this.logo.window.element, this.disband.window.element, this.messageBox.element, this.menu.element,
    ];
  }

  /** The modal windows (the screen holds its input while one is open). */
  get modals() {
    return [
      this.nameWindow.window.modal, this.nicknameWindow.window.modal, this.payWindow.window.modal, this.notice.window.modal,
      this.logo.window.modal, this.disband.window.modal, this.messageBox.modal,
    ].filter((modal) => modal !== null);
  }

  private get own(): number {
    return this.screen.ownPlayerId();
  }

  /** The own guild (`g_pPlayer->GetGuild()`), or null. */
  get guild(): Guild | null {
    return this.book.own(this.own);
  }

  /** The Start menu's Guild, its applet and G (`CWndGuild`, opened even without a guild, centred). */
  toggle(): void {
    if (this.window.isOpen) { this.window.frame.close(); return; }
    this.window.frame.open('center');
    this.update();
  }

  /** The player menu's "Invite to join guild" (`InviteCompany`): the siege checks are siege-only; the packet. */
  inviteMover(objectId: number): void {
    this.send(encodeGuildInvite(objectId));
  }

  /**
   * The guild rename scroll `II_SYS_SYS_SCR_GCHANAM` used (`SendDoUseItem`, `DPClient.cpp:10525-10535`: its object id), or
   * the server's forced rename (`FUNCTYPE_QUERYSETGUILDNAME`, :14469-14479: 0x7f): the name window, which closes at once
   * without a guild (`WndGuildName.cpp:39-60`); its OK sends QUERYSETGUILDNAME.
   */
  openRename(nameId: number): void {
    const guild = this.guild;
    if (guild === null) return;
    this.nameId = nameId;
    this.nameWindow.open(guild.name);
  }

  // --- the book's events ---

  handle(events: readonly GuildEvent[]): void {
    let tags = false;
    for (const event of events) {
      switch (event.kind) {
        case 'line': this.line(event.tid, event.english, event.args); break;
        case 'invite':
          this.inviterId = event.inviterId;
          this.invite.open(event.guildName);
          break;
        case 'joined':
          this.screen.playMusic(BGM_IN_COMPANY);
          this.screen.setChatGuild(true);
          break;
        case 'left': this.screen.setChatGuild(false); break;
        case 'tags': tags = true; break;
        case 'queryMembers':
          // `OnGuild`: every member with the version known, in one QUERY_PLAYER_DATA2 (:12662-12684)
          this.send(encodeQueryPlayerData2(event.playerIds.map((playerId) => ({ playerId, version: this.screen.playerVersion(playerId) }))));
          break;
        case 'changed': break;
      }
    }
    if (tags) this.screen.recolorTags();
  }

  /** Every frame while open: the tabs drawn from the guild. */
  update(): void {
    if (!this.window.isOpen) return;
    this.window.update(this.view());
  }

  /** The Messenger's Guild tab: the guild's members with their player data, online or offline (`UpdatePlayerList`, :1094-1151). */
  messengerRows(): FriendRow[] {
    const guild = this.guild;
    if (guild === null) return [];
    return [...guild.members.keys()].map((playerId) => {
      const data = this.screen.playerData(playerId);
      const online = data.login > 0;
      return { playerId, name: data.name, job: data.job, level: data.level, state: online ? FRS.ONLINE : FRS.OFFLINE, blocked: false, channel: data.login };
    });
  }

  /** The Messenger's double click on a guild member (`OnLButtonDblClk`, :1374-1419). */
  openMember(row: FriendRow): void {
    if (row.state === FRS.OFFLINE) this.line('TID_GAME_NOTLOGIN', 'That player is not connected.', []);
    else this.screen.openMessage(row.name);
  }

  dispose(): void {
    this.menu.dispose();
    for (const window of [this.nameWindow, this.nicknameWindow, this.payWindow]) window.close();
    this.notice.close();
    this.invite.close();
    if (this.window.isOpen) this.window.frame.close();
  }

  // --- the view ---

  private view(): GuildView {
    const guild = this.guild;
    const own = this.own;
    this.takeDraft(guild);
    const rows = guild === null ? [] : this.sort.refresh(this.memberRows(guild));
    const war = this.book.war;
    const enemy = guild === null ? undefined : this.book.guild(guild.enemyGuildId);
    const left = war === null ? '' : timeLeft(war.start + 2 * 60 * 60 - this.screen.now());
    return {
      guild, ownPlayerId: own, masterName: guild === null ? '' : this.screen.playerData(guild.masterId).name, rows,
      draft: this.draft, powerChanged: this.powerChanged, enemyName: enemy?.name ?? '', enemyLogo: enemy?.logo ?? 0,
      warLeft: war === null || this.book.ownWarId === 0 ? '' : left,
      tipOf: (row) => memberTip(row, (tid, english) => this.text(tid, english)),
    };
  }

  private memberRows(guild: Guild): MemberRow[] {
    return [...guild.members.values()].map((member) => {
      const data = this.screen.playerData(member.playerId);
      return {
        playerId: member.playerId, rank: member.rank, rankClass: member.rankClass, alias: member.alias, name: data.name,
        job: data.job, level: data.level, online: data.login > 0, giveGold: member.giveGold, givePxp: member.givePxp, lose: member.lose,
      };
    });
  }

  /** The draft follows the guild's rights until the master changes a box (and again once they are applied). */
  private takeDraft(guild: Guild | null): void {
    const key = guild === null ? '' : `${guild.guildId}:${guild.power.join(',')}`;
    if (key === this.draftOf) return;
    this.draftOf = key;
    this.draft = guild === null ? [0, 0, 0, 0, 0] : [...guild.power];
    this.powerChanged = false;
  }

  private sortBy(key: MemberSortKey): void {
    const guild = this.guild;
    if (guild !== null) this.sort.press(key, this.memberRows(guild));
    this.menu.close();
    this.update();
  }

  // --- the Information tab ---

  private infoButton(button: InfoButton): void {
    const guild = this.guild;
    // nothing for anyone but the master (`:527-533`)
    if (guild === null || !isMaster(guild, this.own)) return;
    const atWar = this.book.ownWarId !== 0;
    switch (button) {
      case 'name':
        if (guild.name !== '') { this.box('TID_GAME_GUILDNOTCHGNAME', 'The guild name can only be changed once.'); return; }
        this.nameId = 0xff;
        this.nameWindow.open(guild.name);
        return;
      case 'notice':
        this.notice.open(guild.notice);
        return;
      case 'logo': {
        const refusal = logoRefusal(guild, atWar);
        if (refusal !== null) { this.box(refusal, ''); return; }
        this.logo.open(guild.logo);
        return;
      }
      case 'disband':
        if (atWar) { this.box('TID_GAME_GUILDWARERRORDISBAND', 'You cannot disband your guild during a guild duel.'); return; }
        this.disband.open();
        return;
    }
  }

  private setName(typed: string): boolean {
    const check = guildNameCheck(typed, this.screen.nameCatalog());
    if (!check.ok) { this.box(check.box, ''); return false; }
    const guild = this.guild;
    if (guild === null) return true;
    if (this.nameId === 0xff) this.send(encodeGuildSetName(this.own, guild.guildId, check.value));
    else this.send(encodeQuerySetGuildName(this.nameId, check.value));
    return true;
  }

  private postNotice(typed: string): boolean {
    const check = noticeCheck(typed);
    if (!check.ok) { this.box(check.box, 'The number of characters exceeds the limit. Please shorten it.'); return false; }
    this.send(encodeGuildNotice(check.value));
    return true;
  }

  // --- the member tab ---

  private openMenu(row: MemberRow, at: { x: number; y: number }): void {
    const guild = this.guild;
    if (guild === null) return;
    const entries = memberMenuEntries(isMaster(guild, this.own)).map((entry) => ({ id: entry.id, label: this.text(entry.tid, entry.english), enabled: true }));
    this.menu.open(entries, at, (id) => this.memberCommand(id, row.playerId));
  }

  private memberCommand(id: number, playerId: number): void {
    const guild = this.guild;
    const row = guild === null ? undefined : this.memberRows(guild).find((r) => r.playerId === playerId);
    const action = memberAction(id, guild, row, this.own, this.book.ownWarId !== 0);
    if (action === null) return;
    if ('box' in action) { this.box(action.box, ''); return; }
    if ('open' in action) {
      this.nicknameTarget = action.playerId;
      this.nicknameWindow.open(row?.alias ?? '');
      return;
    }
    switch (action.send) {
      case 'memberLevel': this.send(encodeGuildMemberLevel(this.own, action.playerId, action.rank)); break;
      case 'class': this.send(encodeGuildClass(this.own, action.playerId, action.up)); break;
      case 'remove': this.send(encodeRemoveGuildMember(this.own, action.playerId)); break;
      case 'chgMaster': this.send(encodeChgMaster(this.own, action.playerId)); break;
    }
  }

  /**
   * The nickname's OK. Neuz sends it only when it differs from the MASTER's own nickname (`:309-321`, a bug); here it is
   * compared with the target's, as meant.
   */
  private setNickname(typed: string): boolean {
    const check = nicknameCheck(typed, this.screen.nameCatalog());
    if (!check.ok) { this.box(check.box, ''); return false; }
    const current = this.guild?.members.get(this.nicknameTarget)?.alias ?? '';
    if (check.value === current) return false;
    this.send(encodeGuildNickname(this.own, this.nicknameTarget, check.value));
    return true;
  }

  // --- the Title and Permissions tabs ---

  private toggleRight(rank: number, bit: number): void {
    const guild = this.guild;
    if (guild === null || !isMaster(guild, this.own)) return;
    this.draft = togglePower(this.draft, rank, bit);
    this.powerChanged = true;
    this.update();
  }

  private apply(): void {
    const guild = this.guild;
    if (guild === null || !isMaster(guild, this.own)) return;
    this.send(encodeGuildAuthority(this.own, guild.guildId, this.draft));
    this.powerChanged = false;
    this.update();
  }

  private openPay(rank: number): void {
    const guild = this.guild;
    if (guild === null || !isMaster(guild, this.own)) return;
    this.payRank = rank;
    this.payWindow.open('');
  }

  private setPay(typed: string): boolean {
    const check = payCheck(typed);
    if (!check.ok) {
      this.payWindow.value = '';
      this.box(check.box, 'Please enter the number.');
      return false;
    }
    const guild = this.guild;
    if (guild !== null) this.send(encodeGuildPenya(this.own, guild.guildId, this.payRank, check.penya));
    return true;
  }

  // --- helpers ---

  private send(bytes: Uint8Array): void {
    this.screen.send(bytes);
  }

  private line(tid: string, english: string, args: ReadonlyArray<string | number>): void {
    const entry = this.texts.get(tid);
    const text = entry?.text ?? english;
    if (text === '') return;
    this.screen.say(formatText(text, [...args]), entry?.color ?? WHITE);
  }

  /** `OpenMessageBox( text, MB_OK )`: no colour. */
  private box(tid: string, english: string): void {
    const text = this.texts.get(tid)?.text ?? english;
    if (text !== '') this.messageBox.open(text, 'ok', () => {});
  }

  private text(id: string, english: string): string {
    return this.texts.get(id)?.text ?? english;
  }
}

/** `CTimeSpan::Format( "%H:%M:%S" )` of the seconds left (0 at the end). */
export function timeLeft(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(Math.trunc(s / 3600))}:${two(Math.trunc(s / 60) % 60)}:${two(s % 60)}`;
}
