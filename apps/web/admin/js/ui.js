// The panel page's shared pieces: building elements (text only, never HTML), calling the panel's API with the session's
// token, the login box, and plain-language messages for the API's error codes.

/**
 * An element with its properties and children. `text` sets textContent; `class` the class; `on<event>` a listener;
 * known properties (value, type, disabled, hidden...) are set as properties, the rest as attributes. Strings become
 * text nodes, so nothing given here is ever read as HTML.
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key in node && typeof value !== 'string') /** @type {any} */ (node)[key] = value;
    else if (key === 'value' || key === 'type' || key === 'placeholder' || key === 'name') /** @type {any} */ (node)[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Empties `node` and puts `children` in it. */
export function fill(node, ...children) {
  node.replaceChildren();
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : String(child));
}

/** A table with a header row; `rows` are arrays of cells (text or elements). `onRow(i)` makes rows clickable. */
export function table(headers, rows, onRow) {
  return el('div', { class: 'table-box' }, el('table', {},
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', { text: h })))),
    el('tbody', {}, rows.length === 0
      ? el('tr', {}, el('td', { class: 'empty', colspan: String(headers.length), text: 'Nothing found.' }))
      : rows.map((cells, i) => el('tr', onRow ? { class: 'clickable', tabindex: '0', onclick: () => onRow(i), onkeydown: (e) => { if (e.key === 'Enter') onRow(i); } } : {},
        cells.map((c) => el('td', {}, c)))))));
}

let csrf = '';
/** @type {() => void} */
let showLogin = () => {};

export function setSession(token) { csrf = token; }
export function onSessionLost(fn) { showLogin = fn; }

export class ApiError extends Error {
  constructor(status, body) {
    super(problemText(status, body));
    this.status = status;
    this.body = body;
  }
}

/** The plain message for an API answer that is not ok. */
export function problemText(status, body) {
  const error = body?.error;
  if (error === 'invalid') return body.message ?? `Check the ${body.field ?? 'form'}.`;
  if (error === 'locked') return `The servers are running, so character edits are locked (${body.message}). Stop the servers first.`;
  if (error === 'taken') return 'That name is taken.';
  if (error === 'refused') return body.message ?? 'The change was refused.';
  if (error === 'repeat') return 'That was already sent.';
  if (error === 'not_found') return 'Not found. It may have been changed or removed.';
  if (error === 'too_many') return 'Too many tries. Wait and try again.';
  if (error === 'session') return 'Your session ended. Log in again.';
  if (error === 'forbidden') return 'The request was refused. Reload the page.';
  if (error === 'server') return 'The server could not do it. Check the Log tab.';
  if (error === 'unclear') return 'No clear answer from the panel: the change may have been made. Check it (the list here, or the Log tab) before trying again.';
  if (error === 'network') return 'The panel cannot be reached. Check your connection.';
  return `Something went wrong (${status}).`;
}

/**
 * Calls `POST /api/<name>`. A write carries a new request id, so a second click cannot act twice. A lost session
 * shows the login box (the page keeps what was typed) and throws. `background` marks a timed refresh, which does not
 * count as use for the 30-minute idle logout.
 */
export async function api(name, body = {}, { write = false, background = false } = {}) {
  const payload = write ? { ...body, requestId: crypto.randomUUID() } : body;
  let res;
  try {
    res = await fetch(`/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': csrf, ...(background ? { 'X-Admin-Background': '1' } : {}) },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    });
  } catch {
    // no answer at all: a write may have reached the panel and been done
    throw new ApiError(0, { error: write ? 'unclear' : 'network' });
  }
  // a gateway error from Caddy says nothing about whether the panel did it
  if (write && (res.status === 502 || res.status === 503 || res.status === 504)) throw new ApiError(res.status, { error: 'unclear' });
  const answer = await res.json().catch(() => ({}));
  if (res.status === 401) showLogin();
  if (!res.ok) throw new ApiError(res.status, answer);
  return answer;
}

/** A message line under a form: ok (green) or problem (red); empty hides it. */
export function messageLine() {
  const node = el('p', { class: 'message', role: 'status', hidden: true });
  return {
    node,
    ok(text) { node.className = 'message ok'; node.textContent = text; node.hidden = false; },
    problem(text) { node.className = 'message problem'; node.textContent = text; node.hidden = false; },
    clear() { node.hidden = true; node.textContent = ''; },
  };
}

/**
 * Runs `work` once per click: the button is disabled at once (a double click does nothing more) until it ends.
 * Problems go to `message`.
 */
export function busy(button, message, work) {
  return async () => {
    if (button.disabled) return;
    button.disabled = true;
    message.clear();
    try {
      const text = await work();
      if (typeof text === 'string') message.ok(text);
    } catch (error) {
      message.problem(error instanceof Error ? error.message : String(error));
    } finally {
      button.disabled = false;
    }
  };
}

/** The browser's own confirm box: plain and keyboard-friendly. */
export function confirmBox(text) {
  return window.confirm(text);
}

/** `yyyymmdd` for today in this browser's time. */
export function todayText(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** `yyyymmdd` as `yyyy-mm-dd`. */
export function dayLabel(text) {
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** An account's ban state in words. */
export function banText(blockTime) {
  if (blockTime === '99991231') return 'Banned forever';
  if (blockTime && blockTime >= todayText()) return `Banned until ${dayLabel(blockTime)}`;
  return 'Not banned';
}

export const AUTHORITY_NAMES = { F: 'Player', J: 'Helper', L: 'GM 1', M: 'GM 2', N: 'GM 3', O: 'Operator', P: 'Admin' };

export function authorityName(letter) {
  return AUTHORITY_NAMES[letter] ? `${AUTHORITY_NAMES[letter]} (${letter})` : `Other (${letter})`;
}

/** An ISO time as the browser's local date and time. */
export function timeText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

export function numberText(n) {
  return Number(n).toLocaleString('en-US');
}
