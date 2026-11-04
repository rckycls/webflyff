// The chat's command suggestions (2026-11-05, the owner's request: "/" typed in the chat lists the commands, GM ones for
// a game master's account). Neuz has no such list: its chat box sends the line, and `ParsingCommand`
// (_Interface/FuncTextCmd.cpp) looks the first word up in its table. The table below is that table's, read at V15
// (COMMANDS, chatCommandTable.ts); only the commands the account's authorization reaches are offered, as
// `ParsingCommand` refuses the others.

import { isAuthorizationHigher } from '../authorization';

/** A command of FuncTextCmd.cpp's table: its names (the long one first), what follows it, and the authorization it needs. */
export interface ChatCommand {
  /** The names it is typed by, without the "/": the long name first, then the short ones. */
  names: readonly string[];
  /** What it takes after its name, as the help shows it ('' for nothing). */
  usage: string;
  /** What it does, in a few words. */
  help: string;
  /** The `AUTH_*` letter it needs (`IsAuthHigher`): a player's 'F' for everyone's. */
  auth: number;
}

/** `AUTH_GENERAL` (`_Common/authorization.h`): every account's. */
export const AUTH_GENERAL = 'F'.charCodeAt(0);

/** A suggestion row: the command and the name the typed word matched. */
export interface Suggestion {
  command: ChatCommand;
  name: string;
}

/**
 * What the chat line suggests: nothing unless it starts with "/"; while the first word is typed, every command the account
 * may use with a name starting with it (each command once, by the first name that matches, the long names' order kept);
 * once a space follows, the one command named, for its usage.
 */
export function suggest(line: string, authorization: number, commands: readonly ChatCommand[]): { typing: boolean; rows: Suggestion[] } {
  if (!line.startsWith('/')) return { typing: false, rows: [] };
  const space = line.indexOf(' ');
  const word = (space < 0 ? line.slice(1) : line.slice(1, space)).toLowerCase();
  const allowed = commands.filter((command) => isAuthorizationHigher(authorization, command.auth));
  if (space >= 0) {
    const command = allowed.find((c) => c.names.some((name) => name.toLowerCase() === word));
    return { typing: false, rows: command ? [{ command, name: command.names.find((n) => n.toLowerCase() === word)! }] : [] };
  }
  const rows: Suggestion[] = [];
  for (const command of allowed) {
    const name = command.names.find((n) => n.toLowerCase().startsWith(word));
    if (name !== undefined) rows.push({ command, name });
  }
  return { typing: true, rows };
}
