// The chat's command list (2026-11-05, the owner's request: "/" typed in the chat suggests the commands, GM ones for a
// game master's account), as Neuz V15 has it (docs/superpowers/specs/2026-11-05-ui-fixes-research.md §5):
//
//   CWndCommand            _Interface/WndCommand.cpp:47-103          "/" typed first opens the list: every command the
//                                                                    account may use (IsAuthHigher), by its long name,
//                                                                    sorted (_stricmp); not filtered, the typed name
//                                                                    highlighted; Enter or a double-click takes it ("/x ")
//   CWndChat::OnChildNotify WndCommunication.cpp:758-778, :876-926  a space or an empty line closes it
//   ParsingCommand          _Interface/FuncTextCmd.cpp:5549-5650     a "/" line's first word matched exactly (case and
//                                                                    all) against the long and short names; the first match
//                                                                    wins; TCM_CLIENT runs in Neuz and sends nothing; an
//                                                                    unknown or refused one is not sent, but an emoticon
//                                                                    goes as plain chat
//
// The web adds what an English Neuz leaves out: each row's words (its usage) and a GM mark, and the arrows walk the list.

import { isAuthorizationHigher } from '../authorization';
import type { CommandRoute } from './chatCommandTable';

/** A command of FuncTextCmd.cpp's table: its names (the long one first), what follows it, and the authorization it needs. */
export interface ChatCommand {
  /** The names it is typed by, without the "/": the long name first, then the short ones. */
  names: readonly string[];
  /** What it takes after its name ('' for nothing). */
  usage: string;
  /** What it does, in a few words. */
  help: string;
  /** The `AUTH_*` letter it needs (`IsAuthHigher`): a player's 'F' for everyone's. */
  auth: number;
  /** Where it runs: `TCM_CLIENT`, `_SERVER` or `_BOTH` (the server's when absent). */
  route?: CommandRoute;
}

/** `AUTH_GENERAL` (`_Common/authorization.h`): every account's. */
export const AUTH_GENERAL = 'F'.charCodeAt(0);

/** A row of the list: the command and the name it shows. */
export interface Suggestion {
  command: ChatCommand;
  name: string;
}

/**
 * What the chat line shows: nothing unless it starts with "/". While its first word is typed (`typing`): every command
 * the account may use, by its long name, sorted without case (`SortListBox`), and `selected` the first whose long name
 * starts with the typed word (-1 for none). Once a space follows: the one command named, for its usage.
 */
export function suggest(
  line: string, authorization: number, commands: readonly ChatCommand[],
): { typing: boolean; rows: Suggestion[]; selected: number } {
  if (!line.startsWith('/')) return { typing: false, rows: [], selected: -1 };
  const space = line.indexOf(' ');
  const word = space < 0 ? line.slice(1) : line.slice(1, space);
  const allowed = commands.filter((command) => isAuthorizationHigher(authorization, command.auth));
  if (space >= 0) {
    const command = allowed.find((c) => c.names.includes(word));
    return { typing: false, rows: command ? [{ command, name: word }] : [], selected: -1 };
  }
  const rows = allowed
    .map((command) => ({ command, name: command.names[0]! }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const lower = word.toLowerCase();
  const selected = word === '' ? -1 : rows.findIndex((row) => row.name.toLowerCase().startsWith(lower));
  return { typing: true, rows, selected };
}

/** What a sent line does (`ParsingChat`, `ParsingCommand`): goes to the server, runs in the client, or goes nowhere. */
export type LineAction = { kind: 'send' } | { kind: 'client'; command: string; args: string } | { kind: 'drop' };

/**
 * A line as Neuz handles it: plain text, a server command the account may use, and an emoticon (`/laugh`, matched without
 * case) are sent; a client command (TCM_CLIENT) runs here; an unknown or refused command goes nowhere.
 */
export function lineAction(
  line: string, authorization: number, commands: readonly ChatCommand[], emoticons: readonly string[],
): LineAction {
  if (!line.startsWith('/')) return { kind: 'send' };
  const rest = line.slice(1);
  const space = rest.indexOf(' ');
  const word = space < 0 ? rest : rest.slice(0, space);
  const command = commands.find((c) => c.names.includes(word));
  if (command === undefined) {
    const lower = rest.toLowerCase();
    return !line.includes('#') && emoticons.some((e) => e.toLowerCase() === lower) ? { kind: 'send' } : { kind: 'drop' };
  }
  if (!isAuthorizationHigher(authorization, command.auth)) return { kind: 'drop' };
  if (command.route === 'client') return { kind: 'client', command: command.names[0]!, args: space < 0 ? '' : rest.slice(space + 1) };
  return { kind: 'send' };
}
