// The dialogue's text, as CWndDialog builds a page and CEditString reads its codes:
//
//   CWndDialog::Say              WndDialog.cpp:423-453       two spaces first; a quest page's title first, bold, in
//                                                            0xff5050f0; each literal `\n` a new line and two spaces
//   CWndDialog::ParsingString    WndDialog.cpp:455-562       `[word][key]`: the word in bold, a context word that sends
//                                                            its key (`[word][]` sends the word)
//   CEditString::ParsingString   _Common/EditString.cpp:307-447
//                                                            #cAARRGGBB colour (8 characters), #b bold, #u underline,
//                                                            #s strike, #lNNNN codepage (4 digits); #n + c, b, u, s, l
//                                                            ends one; any other #x stays as it is; a literal `\n` is a
//                                                            new line
//
// Text stays text: a run's `text` goes into the page with `textContent`. Neuz reads only lower-case hex in #c; both cases
// are read here (plan decision 5). A link's word is taken as written, with the style around it and bold.

/** A stretch of the page in one style. `link` is the key a context word sends. */
export interface TextRun {
  text: string;
  color: number;
  bold: boolean;
  underline: boolean;
  strike: boolean;
  link?: string;
}

/** `CEditString`'s default colour (EditString.h:111). */
const BLACK = 0xff000000;
/** The quest title's colour in `Say` (`#cff5050f0`). */
const QUEST_TITLE = '#b#cff5050f0';

/** The string `CWndDialog::Say` pages: `questTitle` given for a SAY that names a quest it knows. */
export function sayText(text: string, questTitle?: string): string {
  const page = questTitle === undefined ? '  ' + text : `${QUEST_TITLE}${questTitle}#nb#nc\n  ${text}`;
  return page.replace(/\\n/g, '\n  ');
}

const LINK = /^\[([^\]]*)\]\[([^\]]*)\]/;
const HEX8 = /^[0-9a-f]{8}$/i;

/** The page's runs, in order: the codes read, the links found, nothing else changed. */
export function parseDialogText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const style = { color: BLACK, bold: false, underline: false, strike: false };
  const push = (part: string, extra: Partial<TextRun> = {}): void => {
    if (part === '') return;
    const next: TextRun = { text: part, ...style, ...extra };
    const last = runs.at(-1);
    if (last !== undefined && last.link === undefined && next.link === undefined && last.color === next.color &&
      last.bold === next.bold && last.underline === next.underline && last.strike === next.strike) {
      last.text += part;
    } else {
      runs.push(next);
    }
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '#') {
      const code = text[++i];
      if (code === undefined) break; // a last `#` alone is dropped
      switch (code) {
        case 'c': {
          const hex = text.slice(i + 1, i + 9);
          if (HEX8.test(hex)) style.color = Number.parseInt(hex, 16) >>> 0;
          i += 8; // the C++ takes 8 characters whatever they are
          break;
        }
        case 'b': style.bold = true; break;
        case 'u': style.underline = true; break;
        case 's': style.strike = true; break;
        case 'l': i += 4; break; // a codepage: nothing to draw differently
        case 'n': {
          const off = text[++i];
          if (off === 'c') style.color = BLACK;
          else if (off === 'b') style.bold = false;
          else if (off === 'u') style.underline = false;
          else if (off === 's') style.strike = false;
          break;
        }
        default: push('#' + code);
      }
    } else if (c === '\\' && text[i + 1] === 'n') {
      push('\n');
      i++;
    } else if (c === '[') {
      const link = LINK.exec(text.slice(i));
      if (link === null) {
        push('[');
      } else {
        const word = link[1]!;
        push(word, { bold: true, link: link[2] === '' ? word : link[2]! });
        i += link[0].length - 1;
      }
    } else {
      push(c);
    }
  }
  return runs;
}
