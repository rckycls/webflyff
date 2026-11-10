// What the site's pages share: a small element builder, the game's art behind the whole page, and the logo. The pages
// show outside data as text only (`textContent`); the only HTML they insert is the news and about text, escaped when the
// page was built.

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

/** The page's `<main id="site">`, with the page's class. */
export function siteRoot(className = 'site-page'): HTMLElement {
  const root = document.getElementById('site');
  if (root === null) throw new Error('the page has no #site');
  root.className = className;
  return root;
}

/**
 * The login screen's picture (which carries the FlyFF logo at its top centre) behind the whole page, once the asset
 * index gives it (`html.has-art`, site.css). Without it the page keeps its sky gradient and shows the word FlyFF.
 */
export function showLobbyArt(): void {
  void lobbyPicture(fetch.bind(window)).then((url) => {
    if (url === null) return;
    const html = document.documentElement;
    html.style.setProperty('--site-screen', `url(${JSON.stringify(url)})`);
    html.classList.add('has-art');
  });
}

/** The logo: the word FlyFF, a link home. Over the art it is hidden from the eye (the art shows the logo) but not from a screen reader. */
export function siteLogo(): HTMLElement {
  return el('h1', { class: 'site-logo' }, el('a', { href: '/' }, 'FlyFF'));
}
