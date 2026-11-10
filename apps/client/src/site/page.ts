// What the site's pages share: a small element builder and the header with the game's logo. The pages show outside data
// as text only (`textContent`); the only HTML they insert is the news and about text, escaped when the page was built.

import { lobbyPicture } from './siteArt';

type Attributes = Record<string, string>;

/** An element with its attributes and children; strings become text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attributes: Attributes = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

/** The page's `<main id="site">`. */
export function siteRoot(): HTMLElement {
  const root = document.getElementById('site');
  if (root === null) throw new Error('the page has no #site');
  root.className = 'site-page';
  return root;
}

/**
 * The header: the word FlyFF, shown as the login screen's picture (which carries the logo) once the asset index gives
 * it, and what follows it (the label, the buttons). Without the picture the word stays.
 */
export function siteHeader(...children: (Node | string)[]): HTMLElement {
  const header = el('header', { class: 'site-hero' }, el('h1', { class: 'site-logo' }, el('a', { href: '/' }, 'FlyFF')), ...children);
  void lobbyPicture(fetch.bind(window)).then((url) => {
    if (url === null) return;
    header.style.setProperty('--site-screen', `url(${JSON.stringify(url)})`);
    header.classList.add('has-picture');
  });
  return header;
}
