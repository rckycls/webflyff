// The Status tab: the 7 game servers, the gateway, SQL Server, who is online, the character-edit lock line, and the
// recent panel logins. Refreshes every 30 seconds while shown.

import { recentLogins } from './log.js';
import { api, el, fill, messageLine, table } from './ui.js';

const REFRESH_MS = 30_000;

const state = (up) => el('span', { class: up === true ? 'up' : up === false ? 'down' : up, text: up === true ? 'up' : up === false ? 'down' : up });

/** The lock line, shared with the Characters tab. */
export function lockLine(open) {
  return el('p', { class: open ? 'lock open' : 'lock', text: open ? 'Database and World stopped: character edits open.' : 'Servers running: character edits locked.' });
}

export function statusTab(nav) {
  const servers = el('div');
  const lock = el('div');
  const online = el('div');
  const logins = el('div');
  const checked = el('p', { class: 'small' });
  const message = messageLine();
  const refresh = el('button', { type: 'button', class: 'quiet', text: 'Refresh' });
  const node = el('section', { 'aria-label': 'Status' },
    el('h2', { text: 'Status' }),
    el('div', { class: 'card' }, el('div', { class: 'row' }, el('h3', { text: 'Servers' }), refresh), lock, servers, checked, message.node),
    el('div', { class: 'card' }, el('h3', { text: 'Online now' }), online),
    el('div', { class: 'card' }, el('h3', { text: 'Recent panel logins' }), logins));

  let timer = 0;

  async function load() {
    message.clear();
    try {
      const s = await api('status');
      fill(lock, lockLine(s.charactersOpen));
      fill(servers, table(['Server', 'Ports', 'State'], [
        ...s.servers.map((x) => [x.name, x.ports.join(', '), state(x.up)]),
        ['Gateway', '', state(s.gateway)],
        ['SQL Server', '', state(s.sql)],
      ]));
      if (s.online === null) {
        fill(online, el('p', { class: 'small', text: s.stale ? 'The World server is not up: the online flags are stale until it starts.' : 'SQL Server did not answer.' }));
      } else {
        fill(online, el('p', { text: `${s.players} player(s) online.` }), table(['Name', 'Level', 'Account', 'World'],
          s.online.map((c) => [c.name, String(c.level), c.account, String(c.worldId)]), (i) => nav.openCharacter(s.online[i].idPlayer)));
      }
      checked.textContent = `Checked ${new Date().toLocaleTimeString()}.`;
      fill(logins, await recentLogins());
    } catch (error) {
      message.problem(error.message);
    }
  }

  refresh.addEventListener('click', () => { void load(); });

  return {
    node,
    show() {
      void load();
      timer = window.setInterval(() => { void load(); }, REFRESH_MS);
    },
    hide() { window.clearInterval(timer); },
  };
}
