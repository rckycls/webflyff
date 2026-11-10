// The little Markdown the news and the about text are written in (website spec §3.2), made into HTML at build time.
// Every character of the text is escaped first, so the files cannot put HTML in the page; links keep only http: and
// https: addresses.
//
// Paragraphs are separated by blank lines; a block whose lines all start with "- " is a list. Inline: **bold**, *italic*
// and [text](url).

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** [text](url), the url with one level of balanced parentheses. Run on escaped text. */
const LINK = /\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;
const SAFE_URL = /^https?:\/\//i;

function emphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function inline(text: string): string {
  const escaped = escapeHtml(text);
  let html = '';
  let last = 0;
  for (const match of escaped.matchAll(LINK)) {
    html += emphasis(escaped.slice(last, match.index));
    const [, label, url] = match as unknown as [string, string, string];
    html += SAFE_URL.test(url) ? `<a href="${url}" rel="noopener noreferrer">${emphasis(label)}</a>` : emphasis(label);
    last = match.index + match[0].length;
  }
  return html + emphasis(escaped.slice(last));
}

/** The HTML for `text`. */
export function renderMarkdown(text: string): string {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((block) => block.trim()).filter((block) => block !== '');
  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim());
    if (lines.every((line) => line.startsWith('- '))) {
      return `<ul>${lines.map((line) => `<li>${inline(line.slice(2).trim())}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('');
}
