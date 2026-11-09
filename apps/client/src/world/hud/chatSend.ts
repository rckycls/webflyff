// A line sent as Neuz V15 sends it (2026-11-09, the owner's "what you left out is an important essence of the chat";
// docs/superpowers/specs/2026-11-09-chat-desktop-research.md §4), for both chats:
//
//   CWndMgr::ParsingChat          _Interface/WndManager.cpp:3820-3999   trimmed, cut at 120 bytes, the quotes taken off
//                                                                       (FormalizeChatString, :7879-7895); a "/" line is a
//                                                                       command; a plain one goes through the anti-spam
//                                                                       (__BAN_CHATTING_SYSTEM, Neuz/VersionCommon.h:238) and
//                                                                       the word filter, a game master past both
//   CWndMgr::WordChange           WndManager.cpp:3723-3795              __FILTER_0705 (VersionCommon.h:49): a word of letters
//                                                                       in Filter_ENG.inc becomes asterisks; the other
//                                                                       entries are replaced by theirs (SlangWord 0)
//   TextCmd_shout (client)        _Interface/FuncTextCmd.cpp:1856-2012  IsRight; the same shout within 3 s refused; the
//                                                                       anti-spam; "/s text", filtered
//   TextCmd_PartyChat (client)    FuncTextCmd.cpp:2107-2128             a party of two at least, else TID_GAME_PARTYNOTCHAT;
//                                                                       "/p text", filtered
//   TextCmd_GuildChat (client)    FuncTextCmd.cpp:1172-1183             "/g text", filtered
//   CWndMgr (the timers)          WndManager.h:255-256, WndManager.cpp:1019-1024  the same line 2 s; 0.7 s and 1 s between
//                                                                       lines; 3 s between chat shortcuts; 5 and 2 warnings;
//                                                                       a 3-minute block
//
// The shout limit of the command line (`m_nShoutLimitCount`, NeuzMsgProc.cpp:137-138) is 0 when Neuz starts as the
// launcher starts it, so there is none. A line's "#l" code-page marks (:3833-3842) are a Korean IME's.

import { isGameMaster } from '../authorization';
import { lineAction } from './chatCommands';
import type { ChatCommand } from './chatCommands';
import { formatText } from './format';

/** Filter_ENG.inc as the converter writes it (`data/chat.json`): the words of letters (lower case) and the others. */
export interface WordFilter {
  alpha: Readonly<Record<string, string>>;
  nonAlpha: Readonly<Record<string, string>>;
}

/** A red line the sending prints: into the chat's text alone (`pWndChat->PutString`), or a game line (`g_WndMng.PutString`). */
export interface SendNote {
  text: string;
  color: number;
  game?: boolean;
}

/** What a line does: the text sent (`SendChat`), a client command run, and the lines printed. */
export interface SendOutcome {
  send?: string;
  client?: { command: string; args: string; line: string };
  notes: SendNote[];
}

/** Who sends: the account's authorization, the party's size (`g_Party.GetSizeofMember()`), a chat shortcut of the bar. */
export interface SendContext {
  authorization: number;
  partySize: number;
  shortcut?: boolean;
}

export interface ChatSenderOptions {
  now: () => number;
  /** A text of textClient.inc by its TID name. */
  text: (id: string) => { text: string; color: number } | undefined;
  commands: readonly ChatCommand[];
  emoticons: readonly string[];
}

/** `SetStrNull( string, 120 )`: a line's bytes (one a character in the game's code page). */
const MOST = 120;
/** `m_timerDobe.Set( SEC( 2 ) )` (WndManager.cpp:1019); the shout's `timerDobe.Set( SEC( 3 ) )` (FuncTextCmd.cpp:1913). */
const SAME_MS = 2000;
const SAME_SHOUT_MS = 3000;
/** `WARNING_MILLISECOND`, `WARNING_2_MILLISECOND`, `SHORTCUT_WARNING_MILLISECOND`, `BANNING_MILLISECOND` (WndManager.h:256). */
const WARNING_MS = 700;
const WARNING_2_MS = 1000;
const SHORTCUT_MS = 3000;
const BANNING_MS = 180_000;
/** `BANNING_POINT`, `BANNING_2_POINT` (WndManager.h:255). */
const BANNING_POINT = 5;
const BANNING_2_POINT = 2;
const RED = 0xffff0000;

/**
 * `CWndMgr::WordChange` with __FILTER_0705: every word (`WORD`) whose lower case is a word of the list becomes as many
 * asterisks; then every other entry of the list is replaced by its own replacement (`m_nSlangWord` 0, neuz.ini's). The
 * spaces are kept as typed (Neuz rebuilds them, one between words).
 */
export function wordChange(text: string, filter: WordFilter | null): string {
  if (filter === null) return text;
  let out = text.replace(WORD, (word) => (Object.hasOwn(filter.alpha, word.toLowerCase()) ? '*'.repeat(word.length) : word));
  for (const [from, to] of Object.entries(filter.nonAlpha)) out = out.split(from).join(to);
  return out;
}

/** A word as `CScanner` reads one: a run of anything but its delimiters (`isdelim`, `` !:;,+-<>'/*%^=()&|"{}`` and the
 * blanks), so "." continues a word. */
const WORD = /[^ !:;,+\-<>'/*%^=()&|"{}\t\r\n]+/g;

/** `IsRight` (FuncTextCmd.cpp:1743-1767): a shout of a lone "#", "#u" or "#b", or a "#c" with no colour after it, is not. */
function isRight(text: string): boolean {
  if (text.length === 1 && text.startsWith('#')) return false;
  if (text.length === 2 && (text.startsWith('#u') || text.startsWith('#b'))) return false;
  const colour = text.indexOf('#c');
  return colour === -1 || text.length - colour >= 8;
}

/** `FormalizeChatString`: trimmed, and the quotes at its ends taken off, again while it starts with one. */
function formalize(text: string): string {
  let out = text.trim();
  while (out.startsWith('"')) {
    out = out.slice(1);
    if (out.length > 1) {
      if (out.endsWith('"')) out = out.slice(0, -1);
      out = out.trim();
    }
  }
  return out;
}

/** The commands whose client halves send for themselves (FuncTextCmd.cpp's table: shout, partychat, GuildChat). */
const SHOUT = 'shout';
const PARTY = 'partychat';
const GUILD = 'GuildChat';

/**
 * A line as Neuz sends it, with the anti-spam's clocks (CWndMgr's, which the shout's half shares) and the shout's own.
 * `line` takes a line typed in the chat, or a chat shortcut of the task bar (`ctx.shortcut`); `restart` is the world
 * entered again (`SetWarningCounter( 0 )`, WndManager.cpp:2149-2150).
 */
export class ChatSender {
  private filter: WordFilter | null = null;
  private backup = '';
  private sameEnd = -Infinity;
  private warningEnd = -Infinity;
  private warning2End = -Infinity;
  private shortcutEnd = -Infinity;
  private banEnd = -Infinity;
  private warnings = 0;
  private warnings2 = 0;
  private shoutBackup = '';
  private shoutSameEnd = -Infinity;

  constructor(private readonly options: ChatSenderOptions) {}

  /** The word list (`data/chat.json`); none until it is read. */
  setFilter(filter: WordFilter | null): void {
    this.filter = filter;
  }

  restart(): void {
    this.warnings = 0;
    this.warnings2 = 0;
  }

  line(typed: string, ctx: SendContext): SendOutcome {
    let text = typed.trimStart();
    if (text === '') return { notes: [] };
    text = formalize(text.slice(0, MOST));
    if (text === '') return { notes: [] };
    if (text.startsWith('/')) return this.command(text, ctx);
    return this.plain(text, ctx);
  }

  private note(id: string, args: Array<string | number> = [], game = false): SendNote {
    const entry = this.options.text(id);
    return { text: entry === undefined ? id : formatText(entry.text, args), color: entry?.color ?? RED, game };
  }

  /** While blocked: `TID_GAME_ERROR_CHATTING_3` with the time left; else undefined. */
  private blocked(now: number): SendNote | undefined {
    if (now >= this.banEnd) return undefined;
    const seconds = Math.trunc((this.banEnd - now) / 1000);
    return { ...this.note('TID_GAME_ERROR_CHATTING_3', [Math.trunc(seconds / 60), seconds % 60]), color: RED };
  }

  private ban(now: number): SendNote {
    this.banEnd = now + BANNING_MS;
    return this.note('TID_GAME_ERROR_CHATTING_2', [BANNING_MS / 1000 / 60]);
  }

  /** The anti-spam's warnings for `send`, a line already past the same-line check (ParsingChat :3883-3958). */
  private spam(send: string, ctx: SendContext, now: number): SendOutcome {
    if (ctx.shortcut === true) {
      let outcome: SendOutcome = { send, notes: [] };
      if (now < this.shortcutEnd) {
        this.warnings++;
        if (this.warnings >= BANNING_POINT) { this.warnings = 0; outcome = { notes: [this.ban(now)] }; }
        else outcome = { notes: [{ ...this.note('TID_GAME_ERROR_CHATTING_1'), color: RED }] };
      }
      this.shortcutEnd = now + SHORTCUT_MS;
      return outcome;
    }
    let outcome: SendOutcome = { send, notes: [] };
    if (now < this.warningEnd) {
      this.warnings++;
      if (this.warnings >= BANNING_POINT) { this.warnings = 0; outcome = { notes: [this.ban(now)] }; }
      else outcome = { notes: [{ ...this.note('TID_GAME_ERROR_CHATTING_1'), color: RED }] };
    } else if (now < this.warning2End) {
      this.warnings2++;
      if (this.warnings2 >= BANNING_2_POINT) { this.warnings2 = 0; outcome = { notes: [this.ban(now)] }; }
    }
    this.warningEnd = now + WARNING_MS;
    this.warning2End = now + WARNING_2_MS;
    return outcome;
  }

  /** A plain line (ParsingChat :3854-3973). */
  private plain(text: string, ctx: SendContext): SendOutcome {
    const now = this.options.now();
    const gm = isGameMaster(ctx.authorization);
    if (!gm) {
      const blocked = this.blocked(now);
      if (blocked !== undefined) return { notes: [blocked] };
    }
    if (text !== this.backup || now >= this.sameEnd || gm) {
      this.sameEnd = now + SAME_MS;
      this.backup = text;
      const send = wordChange(text, this.filter).slice(0, MOST);
      return gm ? { send, notes: [] } : this.spam(send, ctx, now);
    }
    return { notes: [this.note('TID_GAME_CHATSAMETEXT')] };
  }

  /** A "/" line (ParsingCommand, FuncTextCmd.cpp:5549-5650), and the client halves of shout, party and guild chat. */
  private command(text: string, ctx: SendContext): SendOutcome {
    const action = lineAction(text, ctx.authorization, this.options.commands, this.options.emoticons);
    if (action.kind === 'drop') return { notes: [] };
    if (action.kind === 'client') return { client: { command: action.command, args: action.args, line: action.line }, notes: [] };
    const rest = text.slice(1);
    const space = rest.indexOf(' ');
    const word = space < 0 ? rest : rest.slice(0, space);
    const args = space < 0 ? '' : rest.slice(space + 1).trim();
    const command = this.options.commands.find((c) => c.names.includes(word))?.names[0];
    if (command === PARTY) {
      if (ctx.partySize < 2) return { notes: [this.note('TID_GAME_PARTYNOTCHAT', [], true)] };
      return { send: `/p ${wordChange(args, this.filter)}`, notes: [] };
    }
    if (command === GUILD) return { send: `/g ${wordChange(args, this.filter)}`, notes: [] };
    if (command === SHOUT) return this.shout(args, ctx);
    return { send: text, notes: [] };
  }

  /** `TextCmd_shout`'s client half (FuncTextCmd.cpp:1856-2012). */
  private shout(args: string, ctx: SendContext): SendOutcome {
    if (!isRight(args)) return { notes: [] };
    const now = this.options.now();
    const blocked = this.blocked(now);
    if (blocked !== undefined) return { notes: [blocked] };
    if (args !== this.shoutBackup || now >= this.shoutSameEnd) {
      this.shoutBackup = args;
      this.shoutSameEnd = now + SAME_SHOUT_MS;
      return this.spam(`/s ${wordChange(args, this.filter)}`, ctx, now);
    }
    return { notes: [this.note('TID_GAME_CHATSAMETEXT', [], true)] };
  }
}
