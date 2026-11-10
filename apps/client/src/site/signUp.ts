// The sign-up page (website spec §3.3). No game code.
import { el, siteRoot } from './page';
import './site.css';

const root = siteRoot();
root.className = 'site-page';
root.replaceChildren(
  el('h1', {}, 'Sign up'),
  el('p', {}, el('a', { href: '/' }, 'Home')),
);
