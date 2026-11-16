// The Log tab: every panel change and login, newest first, 50 at a time, filtered by account, character or action.
// Rows still 'started' mean the service stopped halfway through a change.

import { api, el, fill, messageLine, table, timeText } from './ui.js';

const ACTIONS = [
  '', 'login', 'login_failed', 'accounts.create', 'accounts.password', 'accounts.email', 'accounts.authority', 'accounts.ban',
  'accounts.unban', 'characters.rename', 'characters.gold', 'characters.move', 'characters.delete', 'characters.undelete',
  'sends.item', 'sends.penya', 'sends.cancel', 'vip.approve', 'vip.reject', 'vip.qrAdd', 'vip.qrSave', 'vip.qrDelete', 'vip.tierSave',
];

const resultCell = (result) => el('span', { class: result === 'ok' ? 'up' : result === 'started' ? 'partial' : 'down', text: result === 'started' ? 'started (not finished)' : result });

/** The front page's last 10 logins. */
export async function recentLogins(background = false) {
  const { rows } = await api('log.logins', {}, { background });
  return table(['When', 'IP', 'Result'], rows.map((r) => [timeText(r.at), r.address, r.action === 'login' ? resultCell('ok') : resultCell('failed')]));
}

export function logTab() {
  const account = el('input', { placeholder: 'Account' });
  const character = el('input', { placeholder: 'Character' });
  const action = el('select', {}, ACTIONS.map((a) => el('option', { value: a, text: a === '' ? 'Any action' : a })));
  const load = el('button', { type: 'submit', text: 'Show' });
  const older = el('button', { type: 'button', class: 'quiet', text: 'Older', hidden: true });
  const message = messageLine();
  const list = el('div');
  /** @type {any[]} */
  let rows = [];
  const filters = el('form', { class: 'row' }, el('label', {}, 'Account', account), el('label', {}, 'Character', character), el('label', {}, 'Action', action), load);
  const node = el('section', { 'aria-label': 'Log' }, el('h2', { text: 'Log' }),
    el('div', { class: 'card' }, filters, message.node), list, el('p', {}, older));

  function render() {
    fill(list, table(['When', 'Admin', 'IP', 'Action', 'Account', 'Character', 'Result', 'Before', 'After'],
      rows.map((r) => [timeText(r.at), r.admin, r.address, r.action, r.account ?? '', r.characterName ?? '', resultCell(r.result), r.before, r.after])));
  }

  async function fetchRows(beforeId) {
    message.clear();
    const body = {};
    if (account.value.trim() !== '') body.account = account.value.trim();
    if (character.value.trim() !== '') body.characterName = character.value.trim();
    if (action.value !== '') body.action = action.value;
    if (beforeId !== undefined) body.beforeId = beforeId;
    try {
      const answer = await api('log.read', body);
      rows = beforeId === undefined ? answer.rows : [...rows, ...answer.rows];
      older.hidden = answer.rows.length < 50;
      render();
    } catch (error) {
      message.problem(error.message);
    }
  }

  filters.addEventListener('submit', (event) => { event.preventDefault(); void fetchRows(undefined); });
  older.addEventListener('click', () => { if (rows.length > 0) void fetchRows(rows[rows.length - 1].id); });

  return { node, show() { void fetchRows(undefined); } };
}
