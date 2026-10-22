// Site scan for world-snapshot-index.patch: node scan-snapshot-sites.mjs <Source folder>
//
// The patch records where each message of a bundle starts at `m_Snapshot.cb++` (CSnapshotCount, Snapshot.h). That
// start is right only when nothing of the message is written into `m_Snapshot.ar` before its `cb++`. This scan lists
// every `m_Snapshot.cb++` in WORLDSERVER/*.cpp (CUser::AddBlock, CUser::AddHdr and the CUser::Add... writers of
// User.cpp and UserLux.cpp) and reports, per function:
//   - a write into `m_Snapshot.ar` before the function's first `m_Snapshot.cb++` (it would belong to no message, or
//     to the message before), and
//   - a `m_Snapshot.cb++` with no write after it before the next one (an empty message), and
//   - a rewind of `m_Snapshot.ar` (ReelIn, Flush) in a function that starts messages.
// Only CUser::Notify (User.cpp) may rewind; it starts no message.
// Code in comments is listed (it is in the file) but not checked, because it isn't compiled.
// Prints one line per site, then "<n> sites, <m> problems", and exits 1 when there is a problem.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scan-snapshot-sites.mjs <Source folder>');
  process.exit(2);
}

// The text with comments and string and character literals turned into spaces (line breaks kept), so offsets and
// line numbers stay those of the file. `inComment[i]` is true for each character of a comment.
function blank(text) {
  const out = text.split('');
  const inComment = new Uint8Array(text.length);
  let i = 0;
  const clear = (from, to, comment) => {
    for (let k = from; k < to; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
      if (comment) inComment[k] = 1;
    }
  };
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      let e = text.indexOf('\n', i);
      if (e === -1) e = text.length;
      clear(i, e, true);
      i = e;
    } else if (c === '/' && d === '*') {
      let e = text.indexOf('*/', i + 2);
      e = e === -1 ? text.length : e + 2;
      clear(i, e, true);
      i = e;
    } else if (c === '"' || c === "'") {
      let e = i + 1;
      while (e < text.length && text[e] !== c && text[e] !== '\n') e += text[e] === '\\' ? 2 : 1;
      clear(i + 1, e, false);
      i = e + 1;
    } else {
      i++;
    }
  }
  return { code: out.join(''), inComment };
}

// The name of the function whose body opens at `brace`: the identifier before the last "(" of the text since the
// previous top-level "}" or ";", skipping preprocessor lines.
function functionName(code, from, brace) {
  const head = code
    .slice(from, brace)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join(' ');
  const m = /([A-Za-z_~][\w:~]*)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)[^()]*$/.exec(head);
  return m ? m[1] : '(top level)';
}

const lineAt = (starts, offset) => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

const SITE = /m_Snapshot\s*\.\s*cb\s*\+\+/y;
const AR = /m_Snapshot\s*\.\s*ar\b/y;
const NOT_WRITE = /\s*\.\s*(GetOffset|GetBuffer)\s*\(/y;
const REWIND = /\s*\.\s*(ReelIn|Flush)\s*\(/y;
const GETBLOCK = /GETBLOCK\s*\(\s*$/;

const folder = join(source, 'WORLDSERVER');
const files = readdirSync(folder)
  .filter((f) => /\.cpp$/i.test(f))
  .sort();

let nSites = 0;
const problems = [];
const perFile = [];

for (const file of files) {
  const text = readFileSync(join(folder, file), 'latin1');
  const rel = `WORLDSERVER/${file}`;
  const lineStarts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') lineStarts.push(k + 1);

  // Sites in comments: listed, not checked.
  const { code, inComment } = blank(text);
  const all = [...text.matchAll(/m_Snapshot\s*\.\s*cb\s*\+\+/g)];
  const commented = all.filter((m) => inComment[m.index]);
  for (const m of commented) {
    console.log(`${rel}:${lineAt(lineStarts, m.index)} (in a comment, not compiled)`);
  }

  let depth = 0;
  let fnStart = 0; // where the text before the current function starts
  let fn = null; // { name, line, open, lastSite }
  let since = 0;
  const closeSite = () => {
    if (fn && fn.lastSite && !fn.lastSite.written) {
      problems.push(`${rel}:${fn.lastSite.line} ${fn.name}: m_Snapshot.cb++ with nothing written after it`);
    }
  };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '{') {
      if (depth === 0) {
        fn = { name: functionName(code, fnStart, i), line: lineAt(lineStarts, i), open: false, lastSite: null };
      }
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth < 0) {
        problems.push(`${rel}:${lineAt(lineStarts, i)}: the braces don't balance; the scan can't tell the functions apart`);
        depth = 0;
      }
      if (depth === 0) {
        closeSite();
        fn = null;
        fnStart = i + 1;
      }
      continue;
    }
    if (c === ';' && depth === 0) {
      fnStart = i + 1;
      continue;
    }
    if (c !== 'm') continue;
    SITE.lastIndex = i;
    if (SITE.test(code)) {
      const line = lineAt(lineStarts, i);
      nSites++;
      if (!fn) {
        problems.push(`${rel}:${line}: m_Snapshot.cb++ outside a function`);
      } else {
        closeSite();
        fn.open = true;
        fn.lastSite = { line, written: false };
        if (fn.rewound) problems.push(`${rel}:${line} ${fn.name}: m_Snapshot.cb++ in a function that rewinds m_Snapshot.ar`);
        console.log(`${rel}:${line} ${fn.name}`);
      }
      i = SITE.lastIndex - 1;
      continue;
    }
    AR.lastIndex = i;
    if (AR.test(code)) {
      const end = AR.lastIndex;
      const line = lineAt(lineStarts, i);
      NOT_WRITE.lastIndex = end;
      REWIND.lastIndex = end;
      if (NOT_WRITE.test(code) || GETBLOCK.test(code.slice(Math.max(0, i - 40), i))) {
        // reads the buffer or the offset: no write
      } else if (REWIND.test(code)) {
        if (fn) {
          fn.rewound = true;
          if (fn.lastSite) problems.push(`${rel}:${line} ${fn.name}: m_Snapshot.ar rewound in a function that starts messages`);
        }
      } else if (!fn) {
        problems.push(`${rel}:${line}: m_Snapshot.ar written outside a function`);
      } else if (!fn.open) {
        problems.push(`${rel}:${line} ${fn.name}: m_Snapshot.ar written before the function's first m_Snapshot.cb++`);
      } else {
        fn.lastSite.written = true;
      }
      i = end - 1;
    }
  }
  if (depth !== 0) problems.push(`${rel}: the braces don't balance (depth ${depth} at the end)`);
  const n = all.length;
  perFile.push(`${rel}: ${n} site${n === 1 ? '' : 's'}${commented.length ? ` (${commented.length} in a comment)` : ''}`);
  nSites += commented.length;
}

for (const p of problems) console.log(`PROBLEM ${p}`);
for (const f of perFile.filter((l) => !/: 0 sites$/.test(l))) console.log(f);
console.log(`${nSites} sites, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
