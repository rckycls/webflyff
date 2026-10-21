// The compare page, `#/compare` and `#/compare?spot=<id>`: the way to check the viewer against the Windows client.
// `spots.json` lists the places worth comparing, each a viewer address (a character pose or a position in a world) and
// the picture the owner took of the same view in the Windows client, kept in `apps/viewer/compare/refs/<id>.png`.
// Opening a spot shows the viewer on that address next to that picture (one above the other on a screen narrower than
// 768 px, see index.html).
//
// The live view is the viewer itself in a frame, started on the spot's address: what is compared is exactly what the
// address shows on its own (and what the picture tests keep). The router builds this view again on every address
// change, so a spot always starts a fresh viewer in a fresh frame, and leaving the page takes it away.

import type { ViewFactory } from '../router';
import spotsJson from './spots.json';

export type SpotKind = 'character' | 'world';

export interface Spot {
  /** Lower-case letters, digits and dashes: it is the picture's file name and the address of the spot. */
  id: string;
  kind: SpotKind;
  /** The viewer address of the view, with its parameters: `#/world?world=wdmadrigal&paused=1`. */
  route: string;
  /** The owner's picture, relative to `apps/viewer`: always `compare/refs/<id>.png`. */
  reference: string;
  /** How to find the same view in the Windows client. */
  note: string;
}

const KINDS: readonly SpotKind[] = ['character', 'world'];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** The folder holding the pictures, relative to `apps/viewer`, and where the page tells the owner to put them. */
const REFS_DIR = 'compare/refs';
const REFS_HOME = `apps/viewer/${REFS_DIR}`;

/** Checks the contents of `spots.json`. Throws an Error that names the problem (and the spot) for anything wrong. */
export function parseSpots(raw: unknown): Spot[] {
  if (!Array.isArray(raw)) throw new Error('spots.json: expected a list of spots');
  if (raw.length === 0) throw new Error('spots.json: no spots');

  const ids = new Set<string>();
  return raw.map((item: unknown, index): Spot => {
    if (typeof item !== 'object' || item === null) throw new Error(`spots.json: spot ${index + 1} is not an object`);
    const fields = item as Record<string, unknown>;
    const text = (name: string, spotName: string): string => {
      const value = fields[name];
      if (typeof value !== 'string' || value === '') {
        throw new Error(`spots.json: ${spotName}: "${name}" must be a text that is not empty`);
      }
      return value;
    };

    const id = text('id', `spot ${index + 1}`);
    if (!ID.test(id)) throw new Error(`spots.json: spot ${index + 1}: id "${id}" must be lower-case letters, digits and dashes`);
    if (ids.has(id)) throw new Error(`spots.json: id "${id}" is used twice`);
    ids.add(id);

    const kind = text('kind', id);
    if (!(KINDS as readonly string[]).includes(kind)) {
      throw new Error(`spots.json: ${id}: kind "${kind}" must be one of ${KINDS.join(', ')}`);
    }
    const route = text('route', id);
    if (!new RegExp(`^#/${kind}(\\?|$)`).test(route)) {
      throw new Error(`spots.json: ${id}: route "${route}" must be a #/${kind} address`);
    }
    const reference = text('reference', id);
    if (reference !== `${REFS_DIR}/${id}.png`) {
      throw new Error(`spots.json: ${id}: reference "${reference}" must be ${REFS_DIR}/${id}.png`);
    }
    return { id, kind: kind as SpotKind, route, reference, note: text('note', id) };
  });
}

export type Selection = { kind: 'none' } | { kind: 'spot'; spot: Spot } | { kind: 'unknown'; id: string };

/** The spot `spot=<id>` names. */
export function spotFromParams(params: URLSearchParams, spots: readonly Spot[]): Selection {
  const id = params.get('spot');
  if (id === null || id === '') return { kind: 'none' };
  const spot = spots.find((s) => s.id === id);
  return spot === undefined ? { kind: 'unknown', id } : { kind: 'spot', spot };
}

/** The viewer on the spot's route: this page's own address with the route as its hash. */
export function liveUrl(spot: Spot, pageUrl: string): string {
  return new URL(spot.route, pageUrl).href;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The pane that holds the owner's picture: the picture, or what to do about it not being there. */
function referencePane(spot: Spot): HTMLElement {
  const pane = element('figure', 'compare-pane compare-reference');
  pane.dataset.state = 'loading';
  const frame = element('div', 'compare-frame');
  pane.append(element('figcaption', undefined, 'Windows client'), frame);

  const picture = element('img');
  picture.alt = `${spot.id} in the Windows client`;
  picture.addEventListener('load', () => {
    pane.dataset.state = 'loaded';
  });
  // a 404, or the dev server answering with its page instead of a picture: either way there is no picture
  picture.addEventListener('error', () => {
    pane.dataset.state = 'missing';
    picture.remove();
    frame.append(element('p', 'compare-missing', `no screenshot yet: put ${REFS_HOME}/${spot.id}.png here`));
  });
  picture.setAttribute('src', spot.reference);
  frame.append(picture);
  return pane;
}

function livePane(spot: Spot): HTMLElement {
  const pane = element('figure', 'compare-pane compare-live');
  const caption = element('figcaption', undefined, 'Viewer ');
  const alone = element('a', undefined, 'open on its own');
  alone.href = spot.route;
  caption.append(alone);

  const frame = element('div', 'compare-frame');
  const viewer = element('iframe');
  viewer.title = `${spot.id} in the viewer`;
  viewer.src = liveUrl(spot, window.location.href);
  frame.append(viewer);
  pane.append(caption, frame);
  return pane;
}

export const compareView: ViewFactory = (ctx) => {
  const root = element('div', 'compare');
  root.append(
    element('h1', undefined, 'Compare with the Windows client'),
    element(
      'p',
      'compare-intro',
      `Pick a spot. The viewer on that spot shows next to your screenshot of the same view (${REFS_HOME}/<spot>.png).`,
    ),
  );

  let spots: Spot[] = [];
  try {
    spots = parseSpots(spotsJson);
  } catch (error) {
    root.append(element('p', 'compare-notice', error instanceof Error ? error.message : String(error)));
  }

  const selection = spotFromParams(ctx.route.params, spots);
  const list = element('ul', 'compare-spots');
  for (const spot of spots) {
    const item = element('li');
    const link = element('a');
    link.href = `#/compare?spot=${spot.id}`;
    link.append(element('span', 'compare-spot-id', spot.id), element('small', undefined, spot.kind));
    if (selection.kind === 'spot' && selection.spot.id === spot.id) link.setAttribute('aria-current', 'true');
    item.append(link);
    list.append(item);
  }
  root.append(list);

  if (selection.kind === 'unknown') {
    root.append(element('p', 'compare-notice', `no spot called "${selection.id}": pick one from the list`));
  } else if (selection.kind === 'spot') {
    const panes = element('div', 'compare-panes');
    panes.append(livePane(selection.spot), referencePane(selection.spot));
    root.append(element('p', 'compare-note', selection.spot.note), panes);
  }
  ctx.container.append(root);

  return {
    ready: Promise.resolve(),
    frame() {
      // the page covers the canvas; the shell's renderer has nothing of its own to draw here
      ctx.renderer.clear();
    },
    dispose() {
      root.remove();
    },
  };
};
