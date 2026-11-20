// The home page (website spec §3.2; the owner's design of 2026-11-11): the game's art over the whole page, minimal. The
// first screen has the logo (in the art), the Closed Beta label, a big Play button, the server status and a quiet Sign up;
// News and About follow below. No game code: three.js, the scene and the world stay on /play, and so does the landscape
// cover (`npm run check:public-build` checks the first).
import { content } from 'virtual:site-content';
import { showDiscord } from './discordBox';
import { el, showLobbyArt, siteLogo, siteRoot } from './page';
import { shotLabel } from './shotLabel';
import { watchStatus } from './statusBox';
import './site.css';

const DEVICES = 'Windows and Mac browsers · Android phones and tablets · iPhone and iPad';

const root = siteRoot('home-page');
const status = el('p', { class: 'site-status', role: 'status' });
// the Discord button: hidden until the web service gives an invite (discordBox.ts)
const discord = el('div', { class: 'home-discord', hidden: '' });

/** Build-time HTML from the Markdown files, escaped there (siteContent.ts). */
function markdown(html: string): HTMLElement {
  const box = el('div', { class: 'site-text' });
  box.innerHTML = html;
  return box;
}

// 2026-11-21 (owner): every post of the last days, in a box that scrolls on its own (focusable, so keys scroll it too)
const news = content.news.length === 0
  ? [el('p', { class: 'site-quiet' }, 'No news yet.')]
  : [el('div', { class: 'site-news-list', tabindex: '0', role: 'region', 'aria-label': 'News posts' },
    ...content.news.map((post) => el('article', { class: 'site-post' },
      el('time', { datetime: post.date }, post.date),
      el('h3', {}, post.title),
      markdown(post.html))))];

// each picture opens full size; its caption comes from the file name
const shots = content.screenshots.length === 0
  ? el('p', { class: 'site-shots-empty' }, 'Screenshots coming soon')
  : el('ul', { class: 'site-shots' },
    ...content.screenshots.map((url, i) => el('li', {},
      el('a', { href: url, target: '_blank', rel: 'noopener' },
        el('img', { src: url, alt: shotLabel(url, i), loading: 'lazy' }),
        el('span', { class: 'site-shot-label' }, shotLabel(url, i))))));

root.replaceChildren(
  el('header', { class: 'home-hero' },
    siteLogo(),
    el('div', { class: 'home-call' },
      el('p', { class: 'site-badge' }, 'Closed Beta'),
      el('a', { class: 'play-button', href: '/play/' }, 'Play'),
      status,
      el('p', { class: 'home-new' }, 'New here? ', el('a', { class: 'ghost-button', href: '/sign-up/' }, 'Sign up')),
      discord,
      el('p', { class: 'home-support' }, el('a', { href: '/vip/' }, 'Support / VIP')))),
  el('section', { class: 'site-panel', 'aria-labelledby': 'site-news' }, el('h2', { id: 'site-news' }, 'News'), ...news),
  el('section', { class: 'site-panel', 'aria-labelledby': 'site-about' },
    el('h2', { id: 'site-about' }, 'About'),
    markdown(content.aboutHtml),
    shots,
    el('p', { class: 'site-devices' }, DEVICES)),
);

showLobbyArt();
watchStatus(status, fetch.bind(window), document);
void showDiscord(discord, fetch.bind(window));
