// The home page (website spec §3.2): the logo, the Closed Beta label and the Play and Sign up buttons; the server
// status; the news; about, with the screenshots and the devices. No game code: three.js, the scene and the world stay on
// /play, and so does the landscape cover (`npm run check:public-build` checks the first).
import { content } from 'virtual:site-content';
import { el, siteHeader, siteRoot } from './page';
import { watchStatus } from './statusBox';
import './site.css';

const DEVICES = 'Windows and Mac browsers · Android phones and tablets · iPhone and iPad';

const root = siteRoot();
const status = el('p', { class: 'site-status', role: 'status' });

/** Build-time HTML from the Markdown files, escaped there (siteContent.ts). */
function markdown(html: string): HTMLElement {
  const box = el('div', { class: 'site-text' });
  box.innerHTML = html;
  return box;
}

const news = content.news.length === 0
  ? [el('p', {}, 'No news yet.')]
  : content.news.map((post) => el('article', { class: 'site-post' },
    el('h3', {}, post.title),
    el('time', { datetime: post.date }, post.date),
    markdown(post.html)));

const shots = content.screenshots.length === 0
  ? el('p', { class: 'site-shots-empty' }, 'Screenshots coming soon')
  : el('ul', { class: 'site-shots' },
    ...content.screenshots.map((url, i) => el('li', {}, el('img', { src: url, alt: `Screenshot ${i + 1}`, loading: 'lazy' }))));

root.replaceChildren(
  siteHeader(
    el('p', { class: 'site-badge' }, 'Closed Beta'),
    el('nav', { class: 'site-actions', 'aria-label': 'Play or sign up' },
      el('a', { class: 'site-button', href: '/play/' }, 'Play'),
      el('a', { class: 'site-button', href: '/sign-up/' }, 'Sign up'))),
  el('section', { class: 'site-panel', 'aria-label': 'Server status' }, status),
  el('section', { class: 'site-panel', 'aria-labelledby': 'site-news' }, el('h2', { id: 'site-news' }, 'News'), ...news),
  el('section', { class: 'site-panel', 'aria-labelledby': 'site-about' },
    el('h2', { id: 'site-about' }, 'About'),
    markdown(content.aboutHtml),
    shots,
    el('p', { class: 'site-devices' }, DEVICES)),
);

watchStatus(status, fetch.bind(window), document);
