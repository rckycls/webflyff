// The home page's news, about text and screenshots (website spec §3.2), read from `apps/client/content/` when the page
// is built and given to it as the module `virtual:site-content`:
//
// - news: `content/news/YYYY-MM-DD-slug.md`, the first line `# Title`; the 5 newest, newest first;
// - about: `content/about.md`;
// - screenshots: `content/screenshots/*.webp|png|jpg`, up to 6, sorted by name. The dev server serves them at
//   `/site/screenshots/<name>`; the build copies them to `client/site/<name>`.
//
// The Markdown becomes HTML here, escaped (src/site/newsMarkdown.ts): the page gets no raw HTML from the files.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { renderMarkdown } from './src/site/newsMarkdown';

export interface NewsPost { date: string; title: string; html: string }
export interface SiteContent { news: NewsPost[]; aboutHtml: string; screenshots: string[] }

export const NEWS_COUNT = 5;
export const SCREENSHOT_COUNT = 6;
const NEWS_FILE = /^(\d{4}-\d{2}-\d{2})-.+\.md$/;
const SCREENSHOT_FILE = /\.(webp|png|jpe?g)$/i;
const VIRTUAL_ID = 'virtual:site-content';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const DEV_SCREENSHOTS = '/site/screenshots/';

function files(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];
}

/** The content in `contentDir`; a news file named or written wrongly is skipped with a `warn`. Screenshots are file names. */
export function readSiteContent(contentDir: string, warn: (message: string) => void = console.warn): SiteContent {
  const newsDir = path.join(contentDir, 'news');
  const posts: (NewsPost & { name: string })[] = [];
  for (const name of files(newsDir).filter((n) => n.endsWith('.md'))) {
    const date = NEWS_FILE.exec(name)?.[1];
    if (date === undefined) {
      warn(`site content: news/${name} is not named YYYY-MM-DD-slug.md; it is left out`);
      continue;
    }
    const [first = '', ...rest] = readFileSync(path.join(newsDir, name), 'utf8').replace(/\r\n?/g, '\n').split('\n');
    if (!first.startsWith('# ')) {
      warn(`site content: news/${name} does not start with "# Title"; it is left out`);
      continue;
    }
    posts.push({ name, date, title: first.slice(2).trim(), html: renderMarkdown(rest.join('\n')) });
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name));

  const about = path.join(contentDir, 'about.md');
  return {
    news: posts.slice(0, NEWS_COUNT).map(({ date, title, html }) => ({ date, title, html })),
    aboutHtml: existsSync(about) ? renderMarkdown(readFileSync(about, 'utf8')) : '',
    screenshots: files(path.join(contentDir, 'screenshots')).filter((n) => SCREENSHOT_FILE.test(n)).sort().slice(0, SCREENSHOT_COUNT),
  };
}

const TYPES: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** The plugin: `virtual:site-content` exports `content`, a `SiteContent` whose screenshots are the pictures' URLs. */
export function siteContent(contentDir: string): Plugin {
  let building = false;
  return {
    name: 'flyffweb-site-content',
    configResolved(config) {
      building = config.command === 'build';
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const content = readSiteContent(contentDir, (message) => this.warn(message));
      const screenshots = content.screenshots.map((name) => {
        if (!building) return DEV_SCREENSHOTS + encodeURIComponent(name);
        const fileName = `client/site/${name}`;
        this.emitFile({ type: 'asset', fileName, source: readFileSync(path.join(contentDir, 'screenshots', name)) });
        return `/${fileName.split('/').map(encodeURIComponent).join('/')}`;
      });
      return `export const content = ${JSON.stringify({ ...content, screenshots })};`;
    },
    configureServer(server) {
      // a post or a picture changed while the dev server runs: the page reloads with it
      server.watcher.add(contentDir);
      server.watcher.on('all', (_event, file) => {
        if (!path.resolve(file).startsWith(path.resolve(contentDir) + path.sep)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module !== undefined) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use(DEV_SCREENSHOTS, (req, res, next) => {
        let name: string;
        try {
          name = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''));
        } catch {
          return next();
        }
        // only the listed pictures: no other file of the folder, and no path out of it
        if (!readSiteContent(contentDir, () => {}).screenshots.includes(name)) return next();
        res.writeHead(200, { 'Content-Type': TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' });
        res.end(readFileSync(path.join(contentDir, 'screenshots', name)));
      });
    },
  };
}
