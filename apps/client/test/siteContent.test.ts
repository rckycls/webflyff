import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readSiteContent } from '../siteContent';

const dirs: string[] = [];
function contentDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'site-content-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('reads the thirty newest posts, newest first, and skips misnamed files', () => {
  const warn = vi.fn();
  const files: Record<string, string> = { 'about.md': 'About **us**', 'news/draft.md': '# Draft\n\nnot shown' };
  const day = (n: number): string => `2026-10-${String(n).padStart(2, '0')}`;
  for (let n = 1; n <= 31; n++) files[`news/${day(n)}-post-${n}.md`] = `# Post ${n}\n\nDay ${n}.`;
  const content = readSiteContent(contentDir(files), warn);
  expect(content.news).toHaveLength(30);
  expect(content.news.map((post) => post.date).slice(0, 3)).toEqual([day(31), day(30), day(29)]);
  expect(content.news.at(-1)!.date).toBe(day(2));
  expect(content.news[0]).toEqual({ date: day(31), title: 'Post 31', html: '<p>Day 31.</p>' });
  expect(content.aboutHtml).toBe('<p>About <strong>us</strong></p>');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('draft.md'));
});
it('escapes a title', () => {
  const content = readSiteContent(contentDir({ 'news/2026-11-11-x.md': '# <i>Beta</i>\n\nText' }), () => {});
  expect(content.news[0]!.title).toBe('<i>Beta</i>'); // a title is text: the page sets it with textContent
});
it('lists at most six screenshots, sorted, pictures only', () => {
  const files: Record<string, string> = { 'screenshots/notes.txt': 'x', 'screenshots/.gitkeep': '' };
  for (const n of [8, 7, 6, 5, 4, 3, 2, 1]) files[`screenshots/shot-${n}.webp`] = 'x';
  files['screenshots/a.png'] = 'x';
  const content = readSiteContent(contentDir(files), () => {});
  expect(content.screenshots).toEqual(['a.png', 'shot-1.webp', 'shot-2.webp', 'shot-3.webp', 'shot-4.webp', 'shot-5.webp']);
});
it('reads an empty folder as no news, no about and no screenshots', () => {
  expect(readSiteContent(contentDir({}), () => {})).toEqual({ news: [], aboutHtml: '', screenshots: [] });
});
