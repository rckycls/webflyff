// The Messenger's windows joined to the friend list, the private messages and the session (2026-11-10, friends-say
// research §2-§7), in one place so that the world screen only routes messages and presses to it:
//
//   CWndMgr::ObjectExecutor APP_MESSENGER_   E, Start → Messenger: the window on or off
//   CWndMessengerEx::OnChildNotify           _Interface/WndMessenger.cpp:800-928     Add, the state menu, the sorts
//   CWndFriendCtrlEx::OnCommand              _Interface/WndMessengerCtrl.cpp:694-814 the list's menu
//   CWndAddFriend::OnChildNotify             _Interface/WndFriendConFirm.cpp:174-224 OK: the checks, ADDFRIENDNAMEREQEST
//   CDPClient::OnAddFriendReqest             Neuz/DPClient.cpp:7935-7973             /mr: BLOCK 2; a Confirm open: BLOCK 6
//   CWndMgr::OpenMessage, OpenInstantMsg     _Interface/WndManager.cpp:7065-7155     one Message / instant message per name
//   CDPClient::OnSay                         DPClient.cpp:11911-12074                a `/say` line (friendRules.ts `sayAction`)
//   CDPClient::OnWhisper                     DPClient.cpp:11775-11909                the blocked friend and /wr (`whisperCheck`)
//   CWndMgr::SetMessengerAutoState           WndManager.cpp:7351-7362                auto-absent: a key or a press sends online
//   CWndWorld MMI_ADD_MESSENGER              _Interface/WndWorld.cpp:5141-5159       "Add to my list"

import type { MessageOf } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatText } from '../hud/format';
import { MessageBox } from '../hud/messageBox';
import { MoverMenu } from '../hud/moverMenu';
import type { MenuEntry } from '../hud/moverMenu';
import { AddFriendWindow, FriendConfirm, InstantMessage, MessageWindow, instantPlace } from '../hud/friends/friendWindows';
import { MessengerWindow } from '../hud/friends/messengerWindow';
import type { PlayerData } from '../party/playerData';
import {
  FriendMenu, FriendSort, addFriendCheck, cutServerName, doubleClickAction, friendMenuEntries, friendRows, messageNameColor,
  sayAction, sayLine, whisperCheck,
} from './friendRules';
import type { FriendRow, SortKey } from './friendRules';
import { FRS, MAX_FRIENDSTAT, optionCommand } from './messenger';
import type { FriendEvent, FriendOptions, Messenger } from './messenger';

/** What the windows send (`WorldSession`'s). */
export interface FriendHudSession {
  sendAddFriend(askerId: number, askerSex: number, askerJob: number): void;
  sendAddFriendRequest(targetId: number): void;
  sendAddFriendNameRequest(name: string): void;
  sendFriendCancel(askerId: number): void;
  sendGetFriendState(): void;
  sendSetFriendState(state: number): void;
  sendFriendIntercept(friendId: number): void;
  sendRemoveFriend(friendId: number): void;
  /** BLOCK `gu` with the own name and `other`. */
  sendFriendBlock(gu: number, other: string): void;
  /** A chat line as typed (`SendChat`): the Message window's `/say`, the GM's `/teleport`. */
  sendChatLine(line: string): void;
}

export interface FriendHudScreen {
  session: FriendHudSession;
  /** A line of the HUD's messages, in its colour (`PutString`). */
  say(text: string, color: number): void;
  ownName(): string;
  ownPlayerId(): number;
  worldId(): number;
  gameMaster(): boolean;
  inParty(playerId: number): boolean;
  /** Invite to the party (`CWndWorld::InviteParty`). */
  invite(playerId: number): void;
  playerData(playerId: number): Readonly<PlayerData>;
  jobName(job: number): string;
  serverName(): string;
  channelName(): string;
  /** The ms clock the instant messages run on. */
  now(): number;
  /** SND_INF_MESSENGERRING (`PLAYSND`, WndMessenger.cpp:1073, :1087). */
  ring(): void;
  /** The options changed: keep them. */
  saveOptions(options: FriendOptions): void;
}

const WHITE = 0xffffffff;
/** `PutString( str, NULL, 0xffffff00 )`: the other's `/say` line in the chat (:12061-12063). */
const YELLOW = 0xffffff00;
/** The state menu's lines (`WndMessenger.cpp:707-714`). */
const STATES: ReadonlyArray<[number, string, string]> = [
  [FRS.ONLINE, 'TID_FRS_ONLINE_STATUS', 'Online'], [FRS.ABSENT, 'TID_FRS_ABSENT', 'AFK'],
  [FRS.HARDPLAY, 'TID_FRS_HARDPLAY', 'Addict Mode'], [FRS.EAT, 'TID_FRS_EAT', 'Eating'],
  [FRS.REST, 'TID_FRS_REST', 'Resting / Vending'], [FRS.MOVE, 'TID_FRS_MOVE', 'Moving'],
  [FRS.OFFLINE, 'TID_FRS_OFFLINE_STATUS', 'Offline'],
];
type Request = MessageOf<'friendRequest'>;

export class FriendHud {
  readonly window: MessengerWindow;
  readonly addWindow: AddFriendWindow;
  readonly confirm: FriendConfirm;
  readonly messageBox: MessageBox;
  readonly menu: MoverMenu;
  readonly messages = new Map<string, MessageWindow>();
  readonly instants = new Map<string, InstantMessage>();
  private readonly sort = new FriendSort();
  private request: Request | null = null;

  constructor(
    private readonly art: UiArt,
    private readonly texts: Texts,
    private readonly screen: FriendHudScreen,
    readonly messenger: Messenger,
    readonly options: FriendOptions,
    private readonly doc: Document = document,
  ) {
    this.window = new MessengerWindow(art, (id, english) => this.text(id, english), doc);
    this.addWindow = new AddFriendWindow(art, doc);
    this.confirm = new FriendConfirm(art, doc);
    this.messageBox = new MessageBox(art, doc);
    this.menu = new MoverMenu(doc);
    this.menu.element.classList.add('hud-friend-menu');

    this.window.onSort = (key) => { this.rows(key); };
    this.window.onAdd = () => { if (!this.addWindow.frame.isOpen) this.addWindow.open(); };
    this.window.onStateMenu = (at) => this.menu.open(this.stateEntries(), at, (state) => {
      // `FRS_ONLINE <= nID < MAX_FRIENDSTAT`: SETFRIENDSTATE, the core tells everyone (:844-848)
      if (state >= FRS.ONLINE && state < MAX_FRIENDSTAT) screen.session.sendSetFriendState(state);
    });
    this.window.onOpen = (row) => this.doubleClick(row);
    this.window.onMenu = (row, at) => this.openMenu(row, at);
    this.addWindow.onOk = (name) => this.addByName(name);
    this.confirm.onYes = () => {
      const request = this.request;
      this.request = null;
      if (request !== null) screen.session.sendAddFriend(request.askerId, request.sex, request.job);
    };
    this.confirm.onNo = () => {
      const request = this.request;
      this.request = null;
      if (request !== null) screen.session.sendFriendCancel(request.askerId);
    };
    this.confirm.frame.onClose = () => { this.request = null; };
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [
      this.window.frame.element, this.addWindow.frame.element, this.confirm.frame.element, this.messageBox.element,
      this.menu.element,
    ];
  }

  // --- the messenger's events ---

  handle(events: readonly FriendEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case 'askStates': this.screen.session.sendGetFriendState(); break;
        case 'joined': if (this.options.join) this.joinNotice(event.playerId); break;
        case 'requested': this.requested(event.request); break;
        case 'line': this.line(event.tid, event.args); break;
        case 'box': this.box(event.tid, event.args); break;
        case 'closeMessage': this.messages.get(event.name)?.frame.close(); break;
        default: break;
      }
    }
  }

  /** `OnAddFriendReqest`: /mr refuses (BLOCK 2), an open Confirm says busy (BLOCK 6), else the Confirm asks. */
  private requested(request: Request): void {
    if (!this.options.messenger) { this.screen.session.sendFriendBlock(2, request.name); return; }
    if (this.confirm.isOpen) { this.screen.session.sendFriendBlock(6, request.name); return; }
    this.request = request;
    this.confirm.open(formatText(this.text('TID_DIAG_0071', '%s wants to be your friend. Do you accept?'), [request.name]));
  }

  // --- the window ---

  /** APP_MESSENGER_: on or off. Opening it with friends asks their states (`OnInitialUpdate`, :669-678). */
  toggle(): void {
    if (this.window.frame.isOpen) { this.window.frame.close(); return; }
    // at the layout's bottom-right corner (:771-775)
    const layer = this.window.frame.element.parentElement;
    const size = this.window.frame.scaledSize;
    this.window.frame.open({ x: Math.max(0, (layer?.clientWidth ?? size.width) - size.width), y: Math.max(0, (layer?.clientHeight ?? size.height) - size.height) });
    if (this.messenger.friends.size > 0) this.screen.session.sendGetFriendState();
  }

  /** The Friend tab's rows, sorted by the last head (a refresh) or by `press`. */
  private rows(press?: SortKey): FriendRow[] {
    const rows = friendRows(this.messenger.entries(), (id) => this.screen.playerData(id));
    return press === undefined ? this.sort.refresh(rows) : this.sort.press(press, rows);
  }

  /** Every frame: the open windows, and the instant messages' time. */
  update(): void {
    const now = this.screen.now();
    for (const instant of [...this.instants.values()]) if (now >= instant.endsAt) instant.frame.close();
    if (!this.window.frame.isOpen) return;
    const state = this.messenger.state;
    const stateTid = STATES.find(([id]) => id === state);
    this.window.update({
      ownName: this.screen.ownName(),
      stateText: stateTid === undefined ? '' : `(${this.text(stateTid[1], stateTid[2])})`,
      ownState: state,
      serverName: cutServerName(this.screen.serverName()),
      channelName: cutServerName(this.screen.channelName()),
      rows: this.rows(),
      jobName: (job) => this.screen.jobName(job),
    });
  }

  private stateEntries(): MenuEntry[] {
    return STATES.map(([id, tid, english]) => ({ id, label: this.text(tid, english), enabled: true }));
  }

  private doubleClick(row: FriendRow): void {
    const action = doubleClickAction(row);
    if ('open' in action) this.openMessage(action.open);
    // in TID_GAME_NOTLOGIN's colour (WndMessengerCtrl.cpp:627)
    else this.line(action.line, action.args, this.texts.get('TID_GAME_NOTLOGIN')?.color);
  }

  private openMenu(row: FriendRow, at: { x: number; y: number }): void {
    const entries = friendMenuEntries(row, this.screen.gameMaster(), this.screen.inParty(row.playerId))
      .map((entry) => ({ id: entry.id, label: this.text(entry.tid, entry.tid), enabled: entry.enabled }));
    this.menu.open(entries, at, (id) => this.command(row, id));
  }

  /** `OnCommand` (:694-814). */
  private command(row: FriendRow, id: number): void {
    const session = this.screen.session;
    switch (id) {
      case FriendMenu.MESSAGE: this.openMessage(row.name); break;
      case FriendMenu.BLOCK: session.sendFriendIntercept(row.playerId); break;
      case FriendMenu.DELETE: session.sendRemoveFriend(row.playerId); break;
      case FriendMenu.MOVE: session.sendChatLine(`/teleport "${row.name}"`); break;
      case FriendMenu.INVITE: this.screen.invite(row.playerId); break;
      default: break;
    }
  }

  // --- adding ---

  private addByName(name: string): void {
    const check = addFriendCheck(name, this.screen.ownName(), this.screen.worldId());
    if ('box' in check) {
      if (check.clear) this.addWindow.edit.value = '';
      this.box(check.box, []);
      return;
    }
    this.screen.session.sendAddFriendNameRequest(check.send);
    this.line('TID_GAME_MSGINVATE', [check.send]);
    this.addWindow.frame.close();
  }

  /** "Add to my list" in a player's menu: a friend already gets TID_DIAG_0051, else ADDFRIENDREQEST. */
  addFromMenu(playerId: number, name: string): void {
    if (this.messenger.get(playerId) !== undefined) { this.box('TID_DIAG_0051', []); return; }
    this.screen.session.sendAddFriendRequest(playerId);
    this.line('TID_GAME_MSGINVATE', [name]);
  }

  // --- the private messages ---

  /** `OpenMessage`: the window for `name`, made once; brought up again when open. */
  openMessage(name: string): MessageWindow {
    let window = this.messages.get(name);
    if (window === undefined) {
      const made = new MessageWindow(this.art, name, this.doc);
      made.onSend = (text) => this.screen.session.sendChatLine(sayLine(name, text));
      made.onClosed = () => { this.messages.delete(name); made.frame.element.remove(); };
      this.messages.set(name, made);
      this.host()?.append(made.frame.element);
      window = made;
      window.frame.open('center');
    } else if (!window.frame.isOpen) {
      window.frame.open('center');
    } else {
      window.frame.raise();
    }
    window.edit.focus();
    return window;
  }

  /** SAY (`OnSay`). */
  onSay(say: MessageOf<'say'>, text: string = say.text): void {
    const ownName = this.screen.ownName();
    const action = sayAction(say, ownName, (id) => this.messenger.get(id), this.options.say);
    switch (action.kind) {
      case 'blocked':
        if (action.ownLine) {
          this.line('TID_GAME_MSGBLOCKCHR', [action.name], this.texts.get('TID_GAME_NOTLOGIN')?.color);
          this.messages.get(action.name)?.block();
        }
        break;
      case 'notLoggedIn':
        this.line('TID_GAME_NOTLOGIN', []);
        break;
      case 'refuse':
        this.screen.session.sendFriendBlock(1, action.sender);
        break;
      case 'own':
        this.openMessageQuiet(action.window).add(action.from, text, messageNameColor(action.from, ownName));
        break;
      case 'other': {
        const open = this.messages.get(action.window);
        if (open !== undefined) {
          open.add(action.from, text, messageNameColor(action.from, ownName));
        } else {
          this.instant(action.window).add(action.from, text, this.screen.now());
          this.screen.ring();
          this.screen.say(`[${action.from}] ${text}`, YELLOW);
        }
        break;
      }
    }
  }

  /** The own line's window: opened when closed, without taking the keys from where they are. */
  private openMessageQuiet(name: string): MessageWindow {
    const open = this.messages.get(name);
    if (open !== undefined) return open;
    const active = this.doc.activeElement as HTMLElement | null;
    const window = this.openMessage(name);
    active?.focus?.();
    return window;
  }

  /** WHISPER's checks (`OnWhisper`): true when the whisper is not to be shown. */
  dropWhisper(whisper: MessageOf<'whisper'>): boolean {
    const check = whisperCheck(whisper, this.screen.ownName(), (id) => this.messenger.get(id), this.options.say);
    if (check === null) return false;
    if (check.kind === 'blocked') {
      if (check.ownLine) {
        this.line('TID_GAME_MSGBLOCKCHR', [check.name], this.texts.get('TID_GAME_NOTLOGIN')?.color);
        this.messages.get(check.name)?.block();
      }
    } else {
      this.screen.session.sendFriendBlock(1, check.sender);
    }
    return true;
  }

  /** `OpenInstantMsg` (`WndManager.cpp:7128-7155`): one per name, the n-th placed from the bottom-right corner. */
  private instant(name: string): InstantMessage {
    const known = this.instants.get(name);
    if (known !== undefined) return known;
    const instant = new InstantMessage(this.art, name, this.doc);
    instant.onClosed = () => { this.instants.delete(name); instant.frame.element.remove(); };
    instant.onPress = () => {
      // `OnLButtonUp`: the Message window with the last line, then gone (:1039-1047)
      const window = this.openMessage(name);
      if (instant.lastWords !== '') window.add(name, instant.lastWords, messageNameColor(name, this.screen.ownName()));
      instant.frame.close();
    };
    const n = this.instants.size;
    this.instants.set(name, instant);
    this.host()?.append(instant.frame.element);
    const host = this.window.frame.element.parentElement;
    instant.frame.open(instantPlace(n, host?.clientWidth ?? 0, host?.clientHeight ?? 0));
    return instant;
  }

  /** A friend logged in (`OnFriendJoin`, :8042-8047): "{name}has logged into the game." */
  private joinNotice(playerId: number): void {
    const name = this.screen.playerData(playerId).name;
    this.instant(name).addJoin(`${name}${this.text('TID_GAME_LOGIN', 'has logged into the game.')}`, this.screen.now());
    this.screen.ring();
  }

  // --- the client commands and the auto-absent ---

  /** /wa /wr /ma /mr /ca /cr: true when `command` was one of them. */
  clientCommand(command: string): boolean {
    const found = optionCommand(command);
    if (found === null) return false;
    this.options[found.option] = found.on;
    this.screen.saveOptions(this.options);
    this.line(found.tid, []);
    return true;
  }

  /** A key or a press (`SetMessengerAutoState`): from auto-absent back to online. */
  input(): void {
    if (this.messenger.connected && this.messenger.state === FRS.AUTOABSENT) {
      this.screen.session.sendSetFriendState(FRS.ONLINE);
      // the answer sets it; until then, no second one (`m_timerMessenger.Set`)
      this.messenger.state = FRS.ONLINE;
    }
  }

  /** The windows' layer the Messenger was put in. */
  private host(): HTMLElement | null {
    return this.window.frame.element.parentElement;
  }

  // --- lines and boxes ---

  private line(tid: string, args: readonly string[], color?: number): void {
    const entry = this.texts.get(tid);
    if (entry === undefined || entry.text === '') return;
    this.screen.say(formatText(entry.text, [...args]), color ?? entry.color ?? WHITE);
  }

  private box(tid: string, args: readonly string[]): void {
    const text = this.texts.get(tid)?.text;
    if (text === undefined || text === '') return;
    this.messageBox.open(formatText(text, [...args]), 'ok', () => {});
  }

  private text(id: string, english: string): string {
    return this.texts.get(id)?.text ?? english;
  }

  /** The windows go with the world; the friend list stays (the screen's). */
  dispose(): void {
    this.menu.dispose();
    for (const window of [...this.messages.values()]) window.frame.close();
    for (const instant of [...this.instants.values()]) instant.frame.close();
    for (const frame of [this.window.frame, this.addWindow.frame, this.confirm.frame]) if (frame.isOpen) frame.close();
    this.messageBox.dispose();
    for (const element of this.elements) element.remove();
  }
}
