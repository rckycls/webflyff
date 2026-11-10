// What the site's pages share: a small element builder. The pages show outside data as text only (`textContent`).

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
  return root;
}
