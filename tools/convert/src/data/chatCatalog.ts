// The `chat` stage (2026-11-09, docs/superpowers/specs/2026-11-09-chat-desktop-research.md): data/chat.json, what the
// chat needs that no other catalog has (WebChat):
//
//   filter   Filter_ENG.inc (the resource packs) as CProject::LoadFilter reads it with __FILTER_0705
//            (_Common/Project.cpp:1108-1146): pairs of a word and its replacement; a word of letters only goes to the
//            letters' list in lower case, any other to the others' (CWndMgr::WordChange, WndManager.cpp:3723-3795)
//   help     Client/help.inc and help.txt.txt (loose in the client folder; Masquerade.prj's `help "Client\help.inc"`) as
//            CProject::LoadHelp reads them (Project.cpp:1072-1094): a keyword, then its paragraphs in braces, the text
//            "   " and each paragraph followed by "\n\n   " (the Help button's window, CWndHelpInstant, WndHelp.cpp:589-604)
//
// It runs when there is no `--only`, or when a glob matches `chat`: `--only chat` writes this catalog alone, so a folder
// whose data/itemProps.json is kept by hand needs no `--only data`. (Client/instantHelp.inc is not read: its whole list
// is inside a /* */ comment, so Neuz V15 shows no instant help.)

import { promises as fs } from 'node:fs';
import { CHAT_KEY, decodeScript } from '@flyffweb/formats';
import type { WebChat, WebChatFilter } from '@flyffweb/formats';
import type { Stage, StageContext } from '../run';
import { matchesOnly } from '../util';

const STAGE = 'chat';
const KIND = 'data';
/** `GetLangFileName( LANG_ENG, FILE_FILTER )` (_Common/ProjectCmn.cpp:11-40). */
const FILTER_FILE = 'Filter_ENG.inc';
const HELP_DIR = 'Client';
const HELP_FILE = 'help.inc';
const HELP_STRINGS = 'help.txt.txt';

/** The tokens of a script as CScanner gives them for these files: words, "strings" (their insides), braces; comments out. */
function tokens(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (text.startsWith('//', i)) { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end + 1; continue; }
    if (text.startsWith('/*', i)) { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    if (c === '{' || c === '}') { out.push(c); i++; continue; }
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      out.push(text.slice(i + 1, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    let end = i;
    while (end < text.length && !/\s/.test(text[end]!) && text[end] !== '{' && text[end] !== '}') end++;
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

/** Filter_ENG.inc: a word of ASCII letters only (`isalpha`) in lower case to `alpha`, any other entry to `nonAlpha`. */
export function readFilter(text: string): WebChatFilter {
  const words = tokens(text);
  const alpha: Record<string, string> = {};
  const nonAlpha: Record<string, string> = {};
  for (let i = 0; i + 1 < words.length; i += 2) {
    const from = words[i]!, to = words[i + 1]!;
    if (/^[A-Za-z]+$/.test(from)) {
      const key = from.toLowerCase();
      if (!Object.hasOwn(alpha, key)) alpha[key] = to;
    } else if (!Object.hasOwn(nonAlpha, from)) nonAlpha[from] = to;
  }
  return { alpha, nonAlpha };
}

/** A `*.txt.txt` string table: `KEY<tab>text` a line. */
export function readStringTable(text: string): Map<string, string> {
  const strings = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab > 0) strings.set(line.slice(0, tab).trim(), line.slice(tab + 1));
  }
  return strings;
}

/** help.inc: each keyword's text (`LoadHelp`), its IDS keys resolved by `strings`. */
export function readHelp(text: string, strings: ReadonlyMap<string, string>): Record<string, string> {
  const words = tokens(text);
  const resolve = (key: string): string => strings.get(key) ?? key;
  const help: Record<string, string> = {};
  let i = 0;
  while (i < words.length) {
    const keyword = resolve(words[i]!);
    i++;
    if (words[i] !== '{') continue;
    i++;
    let body = '   ';
    while (i < words.length && words[i] !== '}') {
      body += `${resolve(words[i]!)}\n\n   `;
      i++;
    }
    i++;
    help[keyword] = body;
  }
  return help;
}

export const chatStage: Stage = {
  name: STAGE,
  async run(ctx: StageContext) {
    if (!matchesOnly(STAGE, ctx.only)) return;
    try {
      const filter = readFilter(decodeScript(ctx.client.packs.read(FILTER_FILE)));
      const incPath = ctx.client.find(HELP_DIR, HELP_FILE);
      const stringsPath = ctx.client.find(HELP_DIR, HELP_STRINGS);
      let help: Record<string, string> = {};
      if (incPath === null || stringsPath === null) {
        ctx.report.warn(KIND, `${HELP_DIR}/${HELP_FILE}`, 'Client/help.inc or help.txt.txt is missing: the chat has no help text');
      } else {
        const strings = readStringTable(decodeScript(new Uint8Array(await fs.readFile(stringsPath))));
        help = readHelp(decodeScript(new Uint8Array(await fs.readFile(incPath))), strings);
      }
      const catalog: WebChat = { filter, help };
      const json = new TextEncoder().encode(JSON.stringify(catalog));
      await ctx.writer.write(CHAT_KEY, json, FILTER_FILE);
      ctx.report.ok(KIND, FILTER_FILE, 0, json.length);
    } catch (error) {
      ctx.report.fail(KIND, CHAT_KEY, error);
    }
  },
};
