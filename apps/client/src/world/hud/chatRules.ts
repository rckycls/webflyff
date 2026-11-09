// The desktop chat's rules, as Neuz V15's chat window has them (2026-11-09, the owner's "fix the chat on desktop view";
// docs/superpowers/specs/2026-11-09-chat-desktop-research.md). The window is built from these by `NeuzChat`
// (neuzChat.ts); the phone keeps its own chat (chatWindow.ts).
//
//   CWndChat::OnSize                  _Interface/WndCommunication.cpp:1017-1121  where every control goes
//   CWndChat::AdditionalSkinTexture   WndCommunication.cpp:1294-1312             the strip painted under the line
//   CWndChat::SetChannel              WndCommunication.cpp:518-544               what a tab shows
//   CWndEditChat::OnSetFocus          WndCommunication.cpp:30-71                 the tab's prefix in an empty line
//   CWndChat::Process                 WndCommunication.cpp:502-513               "/r " becomes "/whisper <name> "
//   CWndChat::OnRButtonDown           WndCommunication.cpp:1159-1258             a right-click whispers the line's sender
//   CWndMgr::PutString                _Interface/WndManager.cpp:4027-4174        a line's way: the chat, the System window
//   CDPClient::OnChat, OnWhisper ...  Neuz/DPClient.cpp                          how each line is written, its colour
//   CWndChat::SetWndRect              WndCommunication.cpp:1001-1016             the least size, the client area

import type { ControlRect } from './button';

/** The chat styles (`CHATSTY_*`, `_Interface/WndManager.h:136-150`): a line's kind, which the filters test. */
export const CHATSTY = {
  GENERAL: 0x0001,
  WHISPER: 0x0002,
  SHOUT: 0x0004,
  PARTY: 0x0008,
  GUILD: 0x0010,
  /** `CHATSTY_HELP`: the instant help's lines. */
  HELP: 0x0060,
  /** `CHATSTY_SYSTEM`: an announcement. */
  SYSTEM: 0x0180,
  /** `CHATSTY_GAME`, `PutString`'s default: the client's own lines, which go to the screen's messages. */
  GAME: 0x0600,
} as const;

/** The five chat styles a tab's filter holds. */
const CHAT_STYLES = CHATSTY.GENERAL | CHATSTY.WHISPER | CHATSTY.SHOUT | CHATSTY.PARTY | CHATSTY.GUILD;

/** A tab: its label (resData.txt.txt), picture (resdata.inc:21640-21682), prefix (`OnChildNotify`, :690-719), tooltip. */
export interface ChatTab {
  readonly view: 'general' | 'whisper' | 'shout' | 'party' | 'guild';
  readonly label: string;
  readonly picture: string;
  readonly prefix: string;
  readonly tooltip: string;
  readonly style: number;
}

export const CHAT_TABS: readonly ChatTab[] = [
  { view: 'general', label: 'Chat', picture: 'ButtChatChat.BMP', prefix: '', tooltip: 'Send normal messages.', style: CHATSTY.GENERAL },
  { view: 'whisper', label: 'Whisper', picture: 'ButtChatWhisper.BMP', prefix: '/w ', tooltip: 'Send whispering messages.', style: CHATSTY.WHISPER },
  { view: 'shout', label: 'Shout', picture: 'ButtChatShout.BMP', prefix: '/s ', tooltip: 'Send shouting messages.', style: CHATSTY.SHOUT },
  { view: 'party', label: 'Party', picture: 'ButtChatTroupe.BMP', prefix: '/p ', tooltip: 'Send messages to party members.', style: CHATSTY.PARTY },
  { view: 'guild', label: 'Guild', picture: 'ButtChatGuild.BMP', prefix: '/g ', tooltip: 'Sending messages to guild members.', style: CHATSTY.GUILD },
];

/** Each tab's filter at first (`CHwOption::Init`, `_Common/HwOption.cpp:222-226`). */
export const DEFAULT_FILTERS: readonly number[] = [
  CHAT_STYLES,
  CHATSTY.GENERAL | CHATSTY.WHISPER,
  CHATSTY.GENERAL | CHATSTY.SHOUT,
  CHATSTY.GENERAL | CHATSTY.PARTY,
  CHATSTY.GENERAL | CHATSTY.GUILD,
];

/** What a line is, as the web gets it. */
export type ChatSource =
  | { kind: 'general'; sender: string; text: string }
  | { kind: 'whisper'; sender: string; recipient: string; text: string }
  | { kind: 'shout'; sender: string; text: string; color?: number }
  | { kind: 'party' | 'guild'; sender: string; text: string }
  | { kind: 'announcement'; text: string }
  | { kind: 'game'; text: string; color?: number };

/** A line as the chat keeps it: its text, ARGB colour and style; `said` for one said nearby (its bubble). */
export interface ChatLine {
  text: string;
  color: number;
  style: number;
  said?: boolean;
}

const WHITE = 0xffffffff;
/** `OnWhisper`'s yellow (DPClient.cpp:11908). */
const WHISPER_COLOR = 0xffffff00;
/** `OnShout`'s colour before the server's (DPClient.cpp:11703). */
const SHOUT_COLOR = 0xffff99cc;
/** `OnPartyChat` (DPClient.cpp:5867). */
const PARTY_COLOR = 0xff99cc00;
/** `TID_GUILD_CHAT`'s colour (textClient.inc:4712), `OnGuildChat` (DPClient.cpp:12866). */
const GUILD_COLOR = 0xffffbaff;
/** `TID_ADMIN_ANNOUNCE`'s colour (textClient.inc:1702), "%s" in English, `OnSystem` and `OnGMChat`. */
const ANNOUNCE_COLOR = 0xffffff99;

/** A line written as DPClient.cpp writes it, `own` the player's name (whose whispers go "->"). */
export function chatLine(source: ChatSource, own: string): ChatLine {
  switch (source.kind) {
    case 'general':
      return { text: `${source.sender} : ${source.text}`, color: WHITE, style: CHATSTY.GENERAL, said: true };
    case 'whisper':
      return {
        text: source.sender === own ? `-> [${source.recipient}] ${source.text}` : `<- [${source.sender}] ${source.text}`,
        color: WHISPER_COLOR, style: CHATSTY.WHISPER,
      };
    case 'shout':
      return { text: `[${source.sender}] ${source.text}`, color: source.color ?? SHOUT_COLOR, style: CHATSTY.SHOUT };
    case 'party':
      return { text: `[${source.sender}] ${source.text}`, color: PARTY_COLOR, style: CHATSTY.PARTY };
    case 'guild':
      return { text: `[${source.sender}] ${source.text}`, color: GUILD_COLOR, style: CHATSTY.GUILD };
    case 'announcement':
      return { text: source.text, color: ANNOUNCE_COLOR, style: CHATSTY.SYSTEM };
    case 'game':
      return { text: source.text, color: source.color ?? WHITE, style: CHATSTY.GAME };
  }
}

/**
 * Whether a tab whose filter is `filter` shows a line of `style`: a chat style when the filter has it; help and system
 * lines always, game lines never (`m_dwChatFilterEtc` is fixed to `HELP_CHAT | SYSTEM_CHAT | GAME_CLIENT` at V15,
 * HwOption.cpp:227, :926-933).
 */
export function tabShows(filter: number, style: number): boolean {
  if ((style & CHAT_STYLES) !== 0) return (filter & style) !== 0;
  return style === CHATSTY.HELP || style === CHATSTY.SYSTEM;
}

/**
 * Whether the System window gets a line while the tab's filter is `filter` (`PutString`, :4166-4172): a chat line the tab
 * does not show, but not a shout nor one said nearby (it has its bubble); every help, system and game line.
 */
export function logGets(filter: number, line: { style: number; said?: boolean }): boolean {
  if ((line.style & CHAT_STYLES) === 0) return true;
  if (tabShows(filter, line.style)) return false;
  return line.style !== CHATSTY.SHOUT && line.said !== true;
}

/** The line's words when it takes the focus empty on tab `tab` (`CWndEditChat::OnSetFocus`). */
export function focusPrefix(tab: number, lastWhispered: string): string {
  if (tab === 1) return lastWhispered === '' ? '/w ' : `/w ${lastWhispered} `;
  return CHAT_TABS[tab]?.prefix ?? '';
}

/** "/r " (or "/R ") with someone to answer: "/whisper <name> " (`Process`); else undefined. */
export function replyLine(line: string, lastWhisperer: string): string | undefined {
  return (line === '/r ' || line === '/R ') && lastWhisperer !== '' ? `/whisper ${lastWhisperer} ` : undefined;
}

/** The name a sent "/w name ..." or "/whisper name ..." line whispers to (`m_strCharName`, :834-845). */
export function whisperedName(line: string): string | undefined {
  const match = /^\/(?:whisper|w)(?:\s+(\S*)|$)/.exec(line);
  return match === null ? undefined : match[1] ?? '';
}

/** `MAX_NAME` (`_Common/Mover.h:32`): a name the right-click takes is shorter. */
const MAX_NAME = 64;

/**
 * The sender of a chat line a right-click whispers to, or undefined (`OnRButtonDown`): "Name : ..." with no space
 * before the " :", "<- [Name] ..." or "-> [Name] ...", "[Name] ..."; never the player's own name.
 */
export function whisperNameOf(line: string, own: string): string | undefined {
  const accept = (name: string): string | undefined => (name !== '' && !name.includes(' ') && name !== own ? name : undefined);
  const colon = line.indexOf(' :');
  if (colon > 0 && colon < MAX_NAME) {
    const space = line.indexOf(' ');
    if (space === -1 || colon <= space) {
      const name = accept(line.slice(0, colon));
      if (name !== undefined) return name;
    }
  }
  const whisper = /^(?:<-|->) \[([^\]]*)\]/.exec(line);
  if (whisper !== null && whisper[1]!.length < MAX_NAME) return accept(whisper[1]!);
  const bracket = /^\[([^\]]*)\]/.exec(line);
  if (bracket !== null && bracket[1]!.length < MAX_NAME) return accept(bracket[1]!);
  return undefined;
}

/** The controls' places in the client area `width` x `height` (`OnSize`). */
export interface ChatLayout {
  text: ControlRect;
  tabs: ControlRect[];
  lock: ControlRect;
  option: ControlRect;
  system: ControlRect;
  moveLock: ControlRect;
  help: ControlRect;
  close: ControlRect;
  macro: ControlRect;
  edit: ControlRect;
}

/**
 * `OnSize`: the text over all but the bottom 39 px; the tabs at 0, 50 ... 200 and Lock, Option, System at 200, 150, 100
 * from the right, 38 px from the bottom; the move lock, Help and Close at 49, 32, 15 from the right a pixel lower; the
 * line from 30 to 20 short of the right, its bottom 18 px (`__CSC_VER11_1` moved it 90 px left, :306-309); the macro
 * button at 1 (moved 119 px left of the line's resdata place, :311-314). The sizes are resdata.inc's rects.
 */
export function chatLayout(width: number, height: number): ChatLayout {
  const row = height - 38;
  return {
    text: { left: 0, top: 0, width, height: height - 39 },
    tabs: [0, 50, 100, 150, 200].map((left) => ({ left, top: row, width: 45, height: 17 })),
    lock: { left: width - 200, top: row, width: 46, height: 17 },
    option: { left: width - 150, top: row, width: 44, height: 16 },
    system: { left: width - 100, top: row, width: 46, height: 17 },
    moveLock: { left: width - 49, top: row + 1, width: 14, height: 14 },
    help: { left: width - 32, top: row + 1, width: 15, height: 14 },
    close: { left: width - 15, top: row + 1, width: 15, height: 14 },
    macro: { left: 1, top: height - 19, width: 19, height: 19 },
    edit: { left: 30, top: height - 18, width: width - 20 - 30, height: 18 },
  };
}

/** The strip's pictures: WndChatEdit00_1 128 wide, WndChatEdit01 16, WndChatEdit02 32, all 47 high. */
const STRIP_LEFT = 128;
const STRIP_STEP = 16;
const STRIP_HEIGHT = 47;

/**
 * The pieces `AdditionalSkinTexture` paints along the window's bottom (`width` x `height`, the window's own size): the
 * left piece, then `(width - 128) / 16` places of 16 px, the middle piece at each but the last two, the right end at the
 * next to last, nothing at the last.
 */
export function editStrip(width: number, height: number): Array<{ picture: string; left: number; top: number }> {
  const top = height - STRIP_HEIGHT;
  const pieces = [{ picture: 'WndChatEdit00_1.tga', left: 0, top }];
  const places = Math.trunc((width - STRIP_LEFT) / STRIP_STEP);
  for (let i = 0; i < places; i++) {
    const left = STRIP_LEFT + i * STRIP_STEP;
    if (i === places - 2) pieces.push({ picture: 'WndChatEdit02.tga', left, top });
    else if (i < places - 2) pieces.push({ picture: 'WndChatEdit01.tga', left, top });
  }
  return pieces;
}
