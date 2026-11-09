// The Friend tab's rules (friends-say research §3, §4, §7): `CWndFriendCtrlEx` and the `/say` and whisper handlers.
//
//   UpdatePlayerList     _Interface/WndMessengerCtrl.cpp:263-339   a row per friend, from the player data; offline is
//                                                                  channel 100
//   pr*Asce / pr*Desc    :28-193                                   the sorts' comparisons (the "Asce" ones of channel,
//                                                                  level, job and name order downwards)
//   SortbyX              :966-1054                                 a press flips the direction; a refresh keeps it
//   OnDraw               :356-538                                  the icons' frames and the texts' places and colours
//   OnLButtonDblClk      :587-630                                  the Message window, or the not-connected / blocked line
//   OnRButtonUp          :816-903                                  the menu's entries
//   CWndAddFriend        _Interface/WndFriendConFirm.cpp:174-224   the Add Friend window's OK
//   CWndWorld MMI_ADD_MESSENGER  WndWorld.cpp:5141-5159            "Add to my list"
//   CDPClient::OnSay     Neuz/DPClient.cpp:11911-12074             a `/say` line
//   CDPClient::OnWhisper DPClient.cpp:11775-11909                  a whisper: the blocked friend and /wr

import type { PlayerData } from '../party/playerData';
import { FRS } from './messenger';
import type { Friend } from './messenger';

/** A friend's row (`__MESSENGER_PLAYER`, `WndMessengerCtrl.h:8-26`). */
export interface FriendRow {
  playerId: number;
  name: string;
  job: number;
  level: number;
  state: number;
  blocked: boolean;
  /** The player data's `uLogin`, or 100 for an offline friend. */
  channel: number;
}

/** `JTYPE_*` (`Resource/defineJob.h:4-10`), by the job's line of `Resource/etc.inc` (`JOB_*`, `defineJob.h:40-80`). */
export const JTYPE = { BASE: 0, EXPERT: 1, PRO: 2, MASTER: 5, HERO: 6 } as const;

export function jobType(job: number): number {
  if (job <= 0) return JTYPE.BASE;
  if (job < 6) return JTYPE.EXPERT;
  if (job < 16) return JTYPE.PRO;
  if (job < 24) return JTYPE.MASTER;
  return JTYPE.HERO;
}

/** `m_nChannel` of an offline friend (`:311-314`). */
export const OFFLINE_CHANNEL = 100;

export function friendRows(
  entries: ReadonlyArray<readonly [number, Friend]>, data: (playerId: number) => Readonly<PlayerData>,
): FriendRow[] {
  return entries.map(([playerId, friend]) => {
    const record = data(playerId);
    return {
      playerId, name: record.name, job: record.job, level: record.level, state: friend.state, blocked: friend.blocked,
      channel: friend.state === FRS.OFFLINE ? OFFLINE_CHANNEL : record.login,
    };
  });
}

export type SortKey = 'channel' | 'state' | 'level' | 'job' | 'name';

/** `prStatus*`: offline counts as 12, after every other state. */
const stateRank = (row: FriendRow): number => (row.state === FRS.OFFLINE ? 12 : row.state);
/** `CString`'s `>`: a byte compare (`strcmp`). */
const byteCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The comparisons, as `std::sort` reads `pr*Asce` (`up`) and `pr*Desc`. */
function compare(key: SortKey, up: boolean): (a: FriendRow, b: FriendRow) => number {
  switch (key) {
    // prChannelAsce: p1 > p2 first
    case 'channel': return up ? (a, b) => b.channel - a.channel : (a, b) => a.channel - b.channel;
    // prStatusAsce: p1 < p2 first
    case 'state': return up ? (a, b) => stateRank(a) - stateRank(b) : (a, b) => stateRank(b) - stateRank(a);
    // prLevelAsce: the job type, then the level, both downwards
    case 'level': return up
      ? (a, b) => jobType(b.job) - jobType(a.job) || b.level - a.level
      : (a, b) => jobType(a.job) - jobType(b.job) || a.level - b.level;
    case 'job': return up
      ? (a, b) => jobType(b.job) - jobType(a.job) || b.job - a.job
      : (a, b) => jobType(a.job) - jobType(b.job) || a.job - b.job;
    // prNameAsce: p1 > p2 first
    case 'name': return up ? (a, b) => byteCompare(b.name, a.name) : (a, b) => byteCompare(a.name, b.name);
  }
}

/**
 * The sort of `CWndFriendCtrlEx` (`:227-240`, `:966-1054`): each key's flag (TRUE: the next press uses `pr*Asce`) and
 * the last key. It starts on the state.
 */
export class FriendSort {
  private readonly flags: Record<SortKey, boolean> = { channel: true, state: false, level: true, job: true, name: true };
  current: SortKey = 'state';

  /** A column head pressed (`SortbyX( TRUE )`): `rows` sorted, the flag flipped for the next press. */
  press(key: SortKey, rows: FriendRow[]): FriendRow[] {
    const up = this.flags[key];
    this.flags[key] = !up;
    this.current = key;
    return rows.sort(compare(key, up));
  }

  /** A refresh (`SortbyX( FALSE )` of the last key): the flag flipped back, so the same direction again. */
  refresh(rows: FriendRow[]): FriendRow[] {
    const key = this.current;
    this.flags[key] = !this.flags[key];
    return this.press(key, rows);
  }
}

// --- the drawing (`OnDraw`, :356-538): `icon_PlayerData.inc`'s frames ---

/** The state a row's (or the own) state icon shows (`dwMyState`, :391-400; the own at `WndMessenger.cpp:422-442`). */
function shownState(state: number): number {
  if (state === FRS.AUTOABSENT) return FRS.ABSENT;
  if (state === FRS.ONLINE) return 2;
  if (state === FRS.OFFLINE) return 8;
  return state;
}

/** The own 32 x 32 state icon's frame (`dwMyState - 2`, `WndMessenger.cpp:447`). */
export const ownStateFrame = (state: number): number => shownState(state) - 2;
/** A row's 16 x 16 state icon's frame (`7 + ( dwMyState - 2 )`, :403). */
export const stateFrame = (state: number): number => 7 + shownState(state) - 2;
/** The channel icon's frame for channels 1-10, none otherwise (:388-389). */
export const channelFrame = (channel: number): number | null =>
  channel !== OFFLINE_CHANNEL && channel > 0 && channel < 11 ? 34 + channel - 1 : null;

/** The job icons (`__CAMPUS`, :426-456): the job type's at x 174 (masters and heroes) and the job's at x 194. */
export function jobFrames(job: number, level: number): { type: number | null; job: number } {
  switch (jobType(job)) {
    case JTYPE.PRO: return { type: null, job: 19 + job - 6 };
    case JTYPE.MASTER: {
      let type = 27;
      if (level >= 70 && level < 80) type = 28;
      else if (level >= 80 && level < 90) type = 29;
      else if (level >= 90 && level < 100) type = 30;
      else if (level >= 100 && level < 110) type = 31;
      else if (level >= 110 && level <= 120) type = 32;
      return { type, job: 19 + job - 16 };
    }
    case JTYPE.HERO: return { type: 33, job: 19 + job - 24 };
    default: return { type: null, job: 14 + job };
  }
}

/** A frame of `icon_PlayerData.inc` (`serialize` lines, `CTexturePack::LoadScript`, `2DRender.cpp:1712-1760`). */
export function playerDataFrame(frame: number): { x: number; y: number; size: number } | null {
  const strips: ReadonlyArray<[number, number, number]> = [
    // count, size, top (each from x 1, left to right)
    [7, 32, 1], [7, 16, 33], [5, 16, 49], [8, 16, 65], [7, 16, 81], [10, 16, 97], [5, 16, 113],
  ];
  let first = 0;
  for (const [count, size, top] of strips) {
    if (frame < first + count) return frame < first ? null : { x: 1 + size * (frame - first), y: top, size };
    first += count;
  }
  return null;
}

/** The name: black, the selected 0xff6060ff, a blocked friend 0xffff0000; past 10 bytes cut with "..." (:488-516). */
export function nameText(name: string): string {
  return name.length > 10 ? `${name.slice(0, 10)}...` : name;
}
export function nameColor(row: FriendRow, selected: boolean): number {
  if (row.blocked) return 0xffff0000;
  return selected ? 0xff6060ff : 0xff000000;
}

/** `CString::Format( "%s" )` cut to 18 bytes with "...", the server's and the channel's names (`WndMessenger.cpp:510-525`). */
export const cutServerName = (name: string): string => (name.length > 18 ? `${name.slice(0, 18)}...` : name);

// --- the menu (`OnRButtonUp`, :816-903) ---

export const FriendMenu = {
  MESSAGE: 0, BLOCK: 1, DELETE: 2, MOVE: 3, INVITE: 4, MEMO: 6, PROHIBIT_VISIT: 7, ALLOW_VISIT: 8,
} as const;

export interface FriendMenuEntry {
  id: number;
  tid: string;
  /** The browser carries this entry out (the memo and the house's entries have no window here). */
  enabled: boolean;
}

export function friendMenuEntries(row: FriendRow, gameMaster: boolean, inParty: boolean): FriendMenuEntry[] {
  const away = row.state === FRS.OFFLINE || row.blocked;
  const entries: FriendMenuEntry[] = [];
  if (!away) entries.push({ id: FriendMenu.MESSAGE, tid: 'TID_APP_MESSAGE', enabled: true });
  entries.push({ id: FriendMenu.BLOCK, tid: row.blocked ? 'TID_FRS_BLOCKRESTORE' : 'TID_FRS_BLOCK', enabled: true });
  entries.push({ id: FriendMenu.DELETE, tid: 'TID_FRS_DELETE', enabled: true });
  if (!away) {
    if (gameMaster) entries.push({ id: FriendMenu.MOVE, tid: 'TID_FRS_MOVE2', enabled: true });
    if (!inParty) entries.push({ id: FriendMenu.INVITE, tid: 'TID_MMI_INVITE_PARTY', enabled: true });
  }
  if (away) entries.push({ id: FriendMenu.MEMO, tid: 'TID_GAME_TAGSEND', enabled: false });
  // housing (`__VER >= 13`, :882-898): no one is allowed in a house the browser knows of
  entries.push({ id: FriendMenu.ALLOW_VISIT, tid: 'TID_GAME_ALLOW_VISIT', enabled: false });
  return entries;
}

/** A double click (:587-630): the Message window for the name, or the line that says why not. */
export function doubleClickAction(row: FriendRow): { open: string } | { line: string; args: string[] } {
  if (row.state !== FRS.OFFLINE && !row.blocked) return { open: row.name };
  if (row.state === FRS.OFFLINE) return { line: 'TID_GAME_NOTLOGIN', args: [] };
  return { line: 'TID_GAME_MSGBLOCKCHR', args: [row.name] };
}

// --- adding ---

/** `MAX_NAME` (`_Common/Mover.h:32`). */
export const MAX_NAME = 64;
/** `WI_WORLD_GUILDWAR` (`Resource/defineWorld.h`). */
export const WI_WORLD_GUILDWAR = 202;

/** The Add Friend window's OK (`WndFriendConFirm.cpp:174-214`): what it does with the name typed. */
export function addFriendCheck(name: string, ownName: string, worldId: number):
  { send: string } | { box: string; clear: boolean } {
  if (name.length >= MAX_NAME) return { box: 'TID_DIAG_0057', clear: true };
  if (name === ownName) return { box: 'TID_DIAG_0056', clear: true };
  if (worldId === WI_WORLD_GUILDWAR) return { box: 'TID_GAME_GUILDCOMBAT_CANNOT_FRIENDADD', clear: false };
  return { send: name };
}

// --- the private messages ---

/** One of `OnSay`'s outcomes. */
export type SayAction =
  /** Dropped: the other side is a blocked friend; one's own line says so and stops that Message window's sending. */
  | { kind: 'blocked'; ownLine: boolean; name: string }
  /** `search`: the receiver is not on. */
  | { kind: 'notLoggedIn' }
  /** /wr: BLOCK 1 to the sender, nothing shown. */
  | { kind: 'refuse'; sender: string }
  /** One's own line, into the Message window for the receiver (opened when closed). */
  | { kind: 'own'; window: string; from: string }
  /** The other's line: into its Message window when open, else an instant message and a chat line. */
  | { kind: 'other'; window: string; from: string };

export interface SayInput {
  sender: string;
  recipient: string;
  fromId: number;
  toId: number;
  search: number;
}

export function sayAction(say: SayInput, ownName: string, friend: (playerId: number) => Friend | undefined, allowSay: boolean): SayAction {
  const own = say.sender === ownName;
  const other = friend(own ? say.toId : say.fromId);
  if (other?.blocked === true) return { kind: 'blocked', ownLine: own, name: say.recipient };
  if (say.search !== 0) return { kind: 'notLoggedIn' };
  if (own) return { kind: 'own', window: say.recipient, from: say.sender };
  if (!allowSay) return { kind: 'refuse', sender: say.sender };
  return { kind: 'other', window: say.sender, from: say.sender };
}

/**
 * `OnWhisper`'s checks before the line (:11790-11831, :11899-11903): a blocked friend's whisper is dropped (one's own to
 * it says TID_GAME_MSGBLOCKCHR), and with /wr another's whisper is answered with BLOCK 1 and not shown. Null: show it.
 */
export function whisperCheck(say: SayInput, ownName: string, friend: (playerId: number) => Friend | undefined, allowSay: boolean):
  { kind: 'blocked'; ownLine: boolean; name: string } | { kind: 'refuse'; sender: string } | null {
  const own = say.sender === ownName;
  const other = friend(own ? say.toId : say.fromId);
  if (other?.blocked === true) return { kind: 'blocked', ownLine: own, name: say.recipient };
  if (say.search !== 0) return null;
  if (!own && !allowSay) return { kind: 'refuse', sender: say.sender };
  return null;
}

/** `CWndMessage::AddMessage` (`WndMessenger.cpp:1253-1267`): one's own name red, the other's blue. */
export const messageNameColor = (from: string, ownName: string): number => (from === ownName ? 0xffff0000 : 0xff0000ff);

/** The line `CWndMessage` sends (`WndMessenger.cpp:1222-1225`): `/say "name" text`. */
export const sayLine = (name: string, text: string): string => `/say "${name}" ${text}`;
