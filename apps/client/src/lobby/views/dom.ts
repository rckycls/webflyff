/** A child of `h`. A string becomes a text node, never parsed HTML: text that came from a server is safe to pass as it is. */
export type Child = Node | string | null | undefined | false;

/** Attributes for `h`: `false`, `null` and `undefined` leave an attribute out, `true` sets it empty (`disabled`, `novalidate`). */
export type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Makes an element. The views build the page with this and never with `innerHTML`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  return element;
}

/** One screen of the lobby. */
export interface View {
  element: HTMLElement;
  /** What the screen was waiting for was refused (an error came back): it may be used again. */
  idle?(): void;
}
