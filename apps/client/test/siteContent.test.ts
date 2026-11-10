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

it('reads the five newest posts, newest first, and skips misnamed files', () => {
  const warn = vi.fn();
  const files: Record<string, string> = { 'about.md': 'About **us**', 'news/draft.md': '# Draft\n\nnot shown' };
  for (let day = 1; day <= 7; day++) files[`news/2026-11-0${day}-post-${day}.md`] = `# Post ${day}\n\nDay ${day}.`;
  const content = readSiteContent(contentDir(files), warn);
  expect(content.news.map((post) => post.date)).toEqual(['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03']);
  expect(content.news[0]).toEqual({ date: '2026-11-07', title: 'Post 7', html: '<p>Day 7.</p>' });
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
