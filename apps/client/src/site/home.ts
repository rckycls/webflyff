// The home page (website spec §3.2). No game code: three.js, the scene and the world stay on /play.
import { el, siteRoot } from './page';
import './site.css';

const root = siteRoot();
root.className = 'site-page';
root.replaceChildren(
  el('h1', {}, 'FlyFF'),
  el('nav', { class: 'site-actions' },
    el('a', { class: 'site-button', href: '/play/' }, 'Play'),
    el('a', { class: 'site-button', href: '/sign-up/' }, 'Sign up')),
);
