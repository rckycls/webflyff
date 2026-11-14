// The Status tab: a greeting card with the quick numbers, the 7 game servers, the gateway, SQL Server, who is online,
// the character-edit lock line, and the recent panel logins. Refreshes every 30 seconds while shown; those timed
// refreshes are "background", so they do not keep an idle session alive.

import { icon } from './icons.js';
import { recentLogins } from './log.js';
import { api, el, fill, messageLine, table } from './ui.js';

const REFRESH_MS = 30_000;

const state = (up) => el('span', {
  class: up === true ? 'up' : up === false ? 'down' : up === 'unknown' ? 'partial' : up,
  text: up === true ? 'up' : up === false ? 'down' : up === 'unknown' ? 'no answer' : up,
});

/** The lock line, shared with the Characters tab. */
export function lockLine(open, seen) {
  return el('p', { class: open ? 'lock open' : 'lock' }, icon(open ? 'unlock' : 'lock'),
    el('span', { text: open ? 'Database and World stopped: character edits open.' : `Character edits locked: ${seen ?? 'the servers are running'}. Stop the servers first.` }));
}

function greeting() {
  const hour = new Date().getHours();
  const user = document.querySelector('.who')?.textContent || 'admin';
  return `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${user}`;
}

function statCard(iconName, colour, value, label) {
  return el('div', { class: 'card stat' }, el('div', { class: `stat-icon ${colour}` }, icon(iconName)), el('strong', { text: value }), el('span', { text: label }));
}

export function statusTab(nav) {
  const hero = el('div');
  const stats = el('div', { class: 'stats' });
  const servers = el('div');
  const lock = el('div');
  const online = el('div');
  const logins = el('div');
  const checked = el('p', { class: 'small' });
  const message = messageLine();
  const refresh = el('button', { type: 'button', class: 'quiet' }, icon('refresh'), ' Refresh');
  const node = el('section', { 'aria-label': 'Status' },
    el('h2', { text: 'Status' }),
    hero,
    stats,
    el('div', { class: 'grid-2' },
      el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('div', {}, el('h3', { text: 'Servers' }), el('p', { class: 'sub', text: 'Each port is knocked on; nothing is sent.' })), refresh),
        lock, servers, checked, message.node),
      el('div', {},
        el('div', { class: 'card' }, el('h3', { text: 'Online now' }), el('p', { class: 'sub', text: 'Characters in the game' }), online),
        el('div', { class: 'card' }, el('h3', { text: 'Recent panel logins' }), el('p', { class: 'sub', text: 'Spot a login that was not you' }), logins))));

  let timer = 0;

  /** `background`: a timed refresh, which does not keep an idle session alive. */
  async function load(background = false) {
    message.clear();
    try {
      const s = await api('status', {}, { background });
      const upCount = s.servers.filter((x) => x.up === 'up').length;
      fill(hero, el('div', { class: 'hero' },
        el('span', { class: 'chip', text: 'Server' }),
        el('h2', { text: greeting() }),
        el('p', { text: upCount === s.servers.length ? 'Every game server is up.' : upCount === 0 ? 'The game servers are stopped.' : 'Some game servers are not up.' }),
        el('div', { class: 'hero-stats' },
          el('div', { class: 'hero-stat' }, el('strong', { text: `${upCount}/${s.servers.length}` }), el('span', { text: 'servers up' })),
          el('div', { class: 'hero-stat' }, el('strong', { text: s.players === null ? '–' : String(s.players) }), el('span', { text: 'players online' })),
          el('div', { class: 'hero-stat' }, el('strong', { text: s.charactersOpen ? 'Open' : 'Locked' }), el('span', { text: 'character edits' })))));
      fill(stats,
        statCard('server', 'purple', `${upCount}/${s.servers.length}`, 'Game servers up'),
        statCard('players', 'green', s.players === null ? '–' : String(s.players), 'Players online'),
        statCard('database', 'blue', s.sql ? 'Up' : 'Down', 'SQL Server'),
        statCard('gateway', 'amber', s.gateway ? 'Up' : 'Down', 'Gateway'));
      fill(lock, lockLine(s.charactersOpen, s.lockSeen));
      fill(servers, table(['Server', 'Ports', 'State'], [
        ...s.servers.map((x) => [x.name, x.ports.join(', '), state(x.up)]),
        ['Gateway', '', state(s.gateway)],
        ['SQL Server', '', state(s.sql)],
      ]));
      if (s.online === null) {
        fill(online, el('p', { class: 'small', text: s.stale ? 'The World server is not up: the online flags are stale until it starts.' : 'SQL Server did not answer.' }));
      } else {
        fill(online, table(['Name', 'Level', 'Account'],
          s.online.map((c) => [c.name, String(c.level), c.account]), (i) => nav.openCharacter(s.online[i].idPlayer)));
      }
      checked.textContent = `Checked ${new Date().toLocaleTimeString()}.`;
      fill(logins, await recentLogins(background));
    } catch (error) {
      message.problem(error.message);
    }
  }

  refresh.addEventListener('click', () => { void load(); });

  return {
    node,
    show() {
      void load();
      timer = window.setInterval(() => { void load(true); }, REFRESH_MS);
    },
    hide() { window.clearInterval(timer); },
  };
}
