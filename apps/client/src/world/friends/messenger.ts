// The friend list, `g_WndMng.m_RTMessenger` (`CRTMessenger`, `__RT_1025`), and what Neuz's handlers do with each of the
// messenger's packets (friends-say research §4, §6, §7):
//
//   CRTMessenger                    _Common/rtmessenger.h:6-40, .cpp     map<id, Friend{ bBlock, dwState }>, the own state
//   CDPClient::OnFriendGameJoin     Neuz/DPClient.cpp:7849-7884           the list at log-in; GETFRIENDSTATE when not empty
//   OnAddFriend                     :7886-7915                            a friend added (`SetFriend( id, NULL )`), GETFRIENDSTATE
//   OnRemoveFriend                  :7917-7932                            gone
//   OnAddFriendReqest               :7935-7973                            /mr: BLOCK 2; a Confirm open: BLOCK 6; else the Confirm
//   OnAddFriendCancel, ...Error     :7975-7994                            TID_GAME_MSGDENYINVATE; TID_DIAG_0059 / 0060 boxes
//   OnAddFriendNotConnect           :7996-8004                            TID_DIAG_0061 box
//   OnRemoveFriendState             :8006-8024                            `SetFriend( id, NULL )`: unblocked and offline
//   OnFriendJoin                    :8026-8053                            the state; /ca on and not offline: the log-in notice
//   OnFriendLogOut                  :8090-8104                            offline
//   OnFriendNoIntercept, Intercept  :8121-8170                            unblocked; blocked (oneself) or offline (the other)
//   OnGetFriendState                :8217-8278                            each listed friend's state
//   OnSetFriendState                :8280-8315                            the own state, or a friend's
//   OnOneFriendState                :8317-8334                            a friend's state
//   OnBlock                         :8336-8396                            gu 1, 2, 6 (7 is the party's, partyState.ts)
//
// The options `m_bSay` (/wa /wr), `m_bMessenger` (/ma /mr) and `m_bMessengerJoin` (/ca /cr) start on
// (`_Common/HwOption.cpp:188-192`) and are kept for the next time (neuz.ini, :1086-1090; here the browser's storage).

import type { WorldMessage } from '@flyffweb/protocol';

export const FRS = {
  ONLINE: 0, OFFLINE: 1, BLOCK: 2, ABSENT: 3, HARDPLAY: 4, EAT: 5, REST: 6, MOVE: 7, DIE: 8, DANGER: 9, OFFLINEBLOCK: 10,
  AUTOABSENT: 11,
} as const;
/** `MAX_FRIENDSTAT`: the states a SETFRIENDSTATE may name (`FRS_ONLINE <= nID < MAX_FRIENDSTAT`, `WndMessenger.cpp:844`). */
export const MAX_FRIENDSTAT = 12;

export interface Friend {
  blocked: boolean;
  state: number;
}

/** The three options a client command switches. */
export interface FriendOptions {
  /** `m_bSay`: whispers and `/say` lines from others are shown (else BLOCK 1 answers them). */
  say: boolean;
  /** `m_bMessenger`: friend requests are asked (else BLOCK 2 refuses them). */
  messenger: boolean;
  /** `m_bMessengerJoin`: a friend's log-in shows a notice. */
  join: boolean;
}

export const DEFAULT_OPTIONS: Readonly<FriendOptions> = { say: true, messenger: true, join: true };

type Request = Extract<WorldMessage, { type: 'friendRequest' }>;

/** What a message asks of the windows and the session. */
export type FriendEvent =
  /** The list changed: an open Messenger refreshes its Friend tab (`UpdateFriendList`). */
  | { kind: 'changed' }
  /** GETFRIENDSTATE to send (the list came, or a friend was added). */
  | { kind: 'askStates' }
  /** A friend logged in: the instant message (TID_GAME_LOGIN), when /ca is on. */
  | { kind: 'joined'; playerId: number }
  /** A request to answer: the Confirm window, or a BLOCK (2 with /mr on, 6 with a Confirm open: `FriendHud`). */
  | { kind: 'requested'; request: Request }
  /** A line of the chat: the TID and its `%s`. */
  | { kind: 'line'; tid: string; args: string[] }
  /** A message box: the TID and its `%s`. */
  | { kind: 'box'; tid: string; args: string[] }
  /** BLOCK 1: the Message window for `name` closes. */
  | { kind: 'closeMessage'; name: string };

export class Messenger {
  readonly friends = new Map<number, Friend>();
  /** `m_dwState`, the own state. */
  state: number = FRS.ONLINE;
  /** `m_bConnect`: the list came (ADDFRIENDGAMEJOIN). */
  connected = false;

  /** Every friend, in the map's order (ascending player id), as `UpdatePlayerList` walks it. */
  entries(): Array<[number, Friend]> {
    return [...this.friends.entries()].sort((a, b) => a[0] - b[0]);
  }

  get(playerId: number): Friend | undefined {
    return this.friends.get(playerId);
  }

  /** `SetFriend( id, NULL )` (`rtmessenger.cpp:14-26`): a new or reset entry, unblocked, its state 0. */
  private reset(playerId: number): void {
    if (playerId === 0) return;
    this.friends.set(playerId, { blocked: false, state: 0 });
  }

  /** A message; `ownPlayerId` tells the own SETFRIENDSTATE and FRIENDINTERCEPTSTATE from a friend's. */
  apply(message: WorldMessage, ownPlayerId: number): FriendEvent[] {
    switch (message.type) {
      case 'friendList': {
        this.friends.clear();
        this.state = message.state;
        for (const friend of message.friends) {
          if (friend.playerId !== 0) this.friends.set(friend.playerId, { blocked: friend.blocked, state: friend.state });
        }
        this.connected = true;
        return this.friends.size > 0 ? [{ kind: 'askStates' }, { kind: 'changed' }] : [{ kind: 'changed' }];
      }
      case 'friendAdded':
        this.reset(message.playerId);
        return [{ kind: 'askStates' }, { kind: 'changed' }];
      case 'friendRemoved':
        this.friends.delete(message.playerId);
        return [{ kind: 'changed' }];
      case 'friendRequest':
        return [{ kind: 'requested', request: message }];
      case 'friendRequestCancel':
        return [{ kind: 'line', tid: 'TID_GAME_MSGDENYINVATE', args: [] }];
      case 'friendError':
        if (message.error === 1) return [{ kind: 'box', tid: 'TID_DIAG_0059', args: [message.name] }];
        if (message.error === 2) return [{ kind: 'box', tid: 'TID_DIAG_0060', args: [message.name] }];
        return [];
      case 'friendNameNotFound':
        return [{ kind: 'box', tid: 'TID_DIAG_0061', args: [message.name] }];
      case 'friendRemovedState':
        this.reset(message.playerId);
        return [{ kind: 'changed' }];
      case 'friendJoin': {
        const friend = this.friends.get(message.playerId);
        if (friend === undefined) return [];
        friend.state = message.state;
        return friend.state !== FRS.OFFLINE ? [{ kind: 'joined', playerId: message.playerId }, { kind: 'changed' }] : [{ kind: 'changed' }];
      }
      case 'friendLogout': {
        const friend = this.friends.get(message.playerId);
        if (friend === undefined) return [];
        friend.state = FRS.OFFLINE;
        return [{ kind: 'changed' }];
      }
      case 'friendNoIntercept': {
        const friend = this.friends.get(message.playerId);
        if (friend !== undefined) friend.blocked = false;
        return [{ kind: 'changed' }];
      }
      case 'friendIntercept': {
        if (message.playerId === ownPlayerId) {
          const friend = this.friends.get(message.friendId);
          if (friend !== undefined) friend.blocked = true;
        } else {
          const friend = this.friends.get(message.playerId);
          if (friend !== undefined) friend.state = FRS.OFFLINE;
        }
        return [{ kind: 'changed' }];
      }
      case 'friendStates': {
        for (const entry of message.entries) {
          const friend = this.friends.get(entry.playerId);
          if (friend !== undefined) friend.state = entry.state;
        }
        return message.entries.length > 0 ? [{ kind: 'changed' }] : [];
      }
      case 'friendState': {
        if (!message.one && message.playerId === ownPlayerId) {
          this.state = message.state;
          return [];
        }
        const friend = this.friends.get(message.playerId);
        if (friend !== undefined) friend.state = message.state;
        return [{ kind: 'changed' }];
      }
      case 'block':
        if (message.gu === 1) return [{ kind: 'closeMessage', name: message.name }, { kind: 'line', tid: 'TID_GAME_MSGCHATDENY', args: [message.name] }];
        if (message.gu === 2) return [{ kind: 'line', tid: 'TID_GAME_MSGDENY', args: [message.name] }];
        if (message.gu === 6) return [{ kind: 'line', tid: 'TID_GAME_YETFRIEND', args: [] }];
        return [];
      default:
        return [];
    }
  }

  /** The list forgotten (a log-out). */
  clear(): void {
    this.friends.clear();
    this.state = FRS.ONLINE;
    this.connected = false;
  }
}

/** The options kept in the browser's storage (neuz.ini's `Say`, `Messenger`, `MessengerJoin`). */
const OPTIONS_KEY = 'flyffweb.friendOptions';

export function loadFriendOptions(storage: Pick<Storage, 'getItem'> | null): FriendOptions {
  try {
    const raw = storage?.getItem(OPTIONS_KEY);
    if (raw === null || raw === undefined) return { ...DEFAULT_OPTIONS };
    const value = JSON.parse(raw) as Partial<FriendOptions>;
    return {
      say: typeof value.say === 'boolean' ? value.say : true,
      messenger: typeof value.messenger === 'boolean' ? value.messenger : true,
      join: typeof value.join === 'boolean' ? value.join : true,
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveFriendOptions(storage: Pick<Storage, 'setItem'> | null, options: FriendOptions): void {
  try { storage?.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch { /* a private window: kept for this visit only */ }
}

/**
 * The client commands (`FuncTextCmd.cpp:3776-3823`): the option they set and the line they put, in its TID's colour; null
 * for another command.
 */
export function optionCommand(command: string): { option: keyof FriendOptions; on: boolean; tid: string } | null {
  switch (command) {
    case 'whisperagree': return { option: 'say', on: true, tid: 'TID_GAME_WHISPERAGREE' };
    case 'whisperrefuse': return { option: 'say', on: false, tid: 'TID_GAME_WHISPERREFUSE' };
    case 'messengeragree': return { option: 'messenger', on: true, tid: 'TID_GAME_MSGERAGREE' };
    case 'messengerrefuse': return { option: 'messenger', on: false, tid: 'TID_GAME_MSGERREFUSE' };
    case 'connectagree': return { option: 'join', on: true, tid: 'TID_GAME_CONNAGREE' };
    case 'connectrefuse': return { option: 'join', on: false, tid: 'TID_GAME_CONNREFUSE' };
    default: return null;
  }
}

