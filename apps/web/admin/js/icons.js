// Small line icons for the panel, drawn as inline SVG (no image files, nothing from another site). Each is a list of
// shapes on a 24 x 24 grid.

const SVG = 'http://www.w3.org/2000/svg';

/** @type {Record<string, [string, Record<string, string>][]>} */
const SHAPES = {
  bolt: [['path', { d: 'M13 2 4 14h7l-1 8 9-12h-7z' }]],
  status: [['path', { d: 'M3 12h4l3-8 4 16 3-8h4' }]],
  user: [['circle', { cx: '12', cy: '8', r: '4' }], ['path', { d: 'M4 21c0-4 4-6 8-6s8 2 8 6' }]],
  characters: [['circle', { cx: '9', cy: '8', r: '3.5' }], ['path', { d: 'M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5' }],
    ['path', { d: 'M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.5 2.4 3.5 5.2' }]],
  send: [['path', { d: 'M21 3 10 14' }], ['path', { d: 'M21 3l-7 18-4-7-7-4z' }]],
  log: [['path', { d: 'M8 6h13M8 12h13M8 18h13' }], ['path', { d: 'M3.5 6h.01M3.5 12h.01M3.5 18h.01' }]],
  logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }], ['path', { d: 'M16 17l5-5-5-5M21 12H9' }]],
  menu: [['path', { d: 'M4 6h16M4 12h16M4 18h16' }]],
  server: [['rect', { x: '3', y: '4', width: '18', height: '7', rx: '2' }], ['rect', { x: '3', y: '13', width: '18', height: '7', rx: '2' }],
    ['path', { d: 'M7 7.5h.01M7 16.5h.01' }]],
  players: [['circle', { cx: '12', cy: '7', r: '4' }], ['path', { d: 'M5.5 21a6.5 6.5 0 0 1 13 0' }]],
  database: [['ellipse', { cx: '12', cy: '5', rx: '8', ry: '3' }], ['path', { d: 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5' }],
    ['path', { d: 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' }]],
  lock: [['rect', { x: '4', y: '11', width: '16', height: '10', rx: '2' }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
  unlock: [['rect', { x: '4', y: '11', width: '16', height: '10', rx: '2' }], ['path', { d: 'M8 11V7a4 4 0 0 1 7.8-1.2' }]],
  gateway: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  refresh: [['path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }], ['path', { d: 'M20 4v7h-7' }]],
  vip: [['path', { d: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z' }]],
};

/** An inline SVG icon by name (hidden from screen readers: the text next to it says what it is). */
export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributes] of SHAPES[name] ?? []) {
    const shape = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

/** Puts the named icon into every `[data-icon]` placeholder under `root`. */
export function placeIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) node.replaceChildren(icon(node.getAttribute('data-icon') ?? ''));
}
