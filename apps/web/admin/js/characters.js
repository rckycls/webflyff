// The Characters tab: the character list, 10 a page (2026-11-17), filtered by name or account; open one. Rename, set
// penya, move to Flarine, delete and undo work only while the Database and World servers are stopped (their memory
// would undo the change otherwise); the buttons say so while they are locked. The character's own level can be set at
// any time: the Database server reads it each time the character enters the game.

import { pagedList } from './pages.js';
import { lockLine } from './status.js';
import { api, authorityName, busy, confirmBox, el, fill, isPlayerLevel, levelSelect, messageLine, numberText, onStale, table, timeText } from './ui.js';

function field(label, input) {
  return el('label', {}, label, input);
}

function playTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function charactersTab(nav) {
  const query = el('input', { placeholder: 'Character name or account', size: 28 });
  const by = el('select', {}, el('option', { value: 'name', text: 'Name' }), el('option', { value: 'account', text: 'Account' }));
  const findButton = el('button', { type: 'submit', text: 'Find' });
  const allButton = el('button', { type: 'button', class: 'quiet', text: 'Show all' });
  const findMessage = messageLine();
  const view = el('div');
  const searchForm = el('form', { class: 'row' }, field('Find', query), field('By', by), findButton, allButton);

  const list = pagedList({
    kind: 'characters',
    action: 'characters.page',
    columns: ['Name', 'Account', 'Level', 'Own level', 'Slot', 'State'],
    cells: (c) => [c.name, c.account, String(c.level), authorityName(c.authority), String(c.slot), c.deleted ? 'deleted' : c.online ? 'online' : 'offline'],
    onRow: (c) => { open(c.idPlayer).catch((error) => findMessage.problem(error.message)); },
    onError: (error) => findMessage.problem(error.message),
  });
  onStale((stale) => list.stale(stale));

  const node = el('section', { 'aria-label': 'Characters' }, el('h2', { text: 'Characters' }),
    el('div', { class: 'card' }, searchForm, findMessage.node, list.node), view);

  /** The filter typed: nothing typed shows every character. */
  async function find() {
    findMessage.clear();
    const text = query.value.trim();
    await list.find(text === '' ? {} : { [by.value]: text });
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    find().catch((error) => findMessage.problem(error.message));
  });
  allButton.addEventListener('click', () => {
    query.value = '';
    find().catch((error) => findMessage.problem(error.message));
  });

  async function open(idPlayer) {
    const [{ character: c, pending, accountAuthority, gameAuthority }, status] = await Promise.all([api('characters.get', { idPlayer }), api('status')]);
    const editsOpen = status.charactersOpen === true;
    const message = messageLine();
    const locked = editsOpen ? undefined : 'Stop the servers first: the Database server would undo this change.';

    /** A button that runs one edit, then shows the character again; `always` for one the servers' memory does not undo. */
    function edit(text, run, cls, always = false) {
      const button = el('button', { type: 'button', text, class: cls, disabled: !always && !editsOpen, title: always ? undefined : locked });
      button.addEventListener('click', busy(button, message, async () => {
        const done = await run();
        if (done === false) return undefined;
        await open(idPlayer);
        return undefined;
      }));
      return button;
    }

    const name = el('input', { value: c.name, maxlength: '16' });
    const gold = el('input', { type: 'number', min: '0', max: '2000000000', value: String(c.gold) });
    const level = levelSelect(c.authority);
    const accountCounts = accountAuthority !== null && !isPlayerLevel(accountAuthority);

    const pendingRows = pending.map((p) => [p.name ?? `item ${p.item}`, numberText(p.count), p.upgrade > 0 ? `+${p.upgrade}` : '', timeText(p.received), p.byPanel ? 'panel' : 'game']);

    fill(view, el('div', { class: 'card' },
      el('h3', { text: `${c.name} (${c.idPlayer})` }),
      lockLine(editsOpen, status.lockSeen),
      el('dl', { class: 'facts' },
        el('dt', { text: 'Account' }), el('dd', {}, el('a', { href: '#', text: c.account, onclick: (e) => { e.preventDefault(); nav.openAccount(c.account); } })),
        el('dt', { text: 'Level' }), el('dd', { text: String(c.level) }),
        el('dt', { text: 'Job' }), el('dd', { text: String(c.job) }),
        el('dt', { text: 'Own level' }), el('dd', { class: 'level', text: authorityName(c.authority) }),
        el('dt', { text: 'Plays as' }), el('dd', { class: 'plays-as', text: accountCounts ? `${authorityName(gameAuthority)}, the account's level` : authorityName(gameAuthority) }),
        el('dt', { text: 'Penya' }), el('dd', { text: numberText(c.gold) }),
        el('dt', { text: 'Where' }), el('dd', { text: `world ${c.worldId} at ${Math.round(c.x)}, ${Math.round(c.y)}, ${Math.round(c.z)}` }),
        el('dt', { text: 'Slot' }), el('dd', { text: String(c.slot) }),
        el('dt', { text: 'Made' }), el('dd', { text: timeText(c.created) }),
        el('dt', { text: 'Play time' }), el('dd', { text: playTime(c.playTimeSeconds) }),
        el('dt', { text: 'State' }), el('dd', { text: c.deleted ? 'deleted' : c.online ? (status.stale ? 'online flag set (stale while the World is down)' : 'online') : 'offline' }),
        el('dt', { text: 'Guild' }), el('dd', { text: c.inGuild ? 'in a guild' : 'none' })),
      el('h3', { text: 'Change' }),
      el('div', { class: 'row' }, field('Own level', level), edit('Set character level', async () => {
        if (!confirmBox(`Make ${c.name} ${authorityName(level.value)}? It takes effect the next time ${c.name} enters the game.`)) return false;
        return api('characters.authority', { idPlayer, authority: level.value }, { write: true });
      }, undefined, true)),
      el('p', { class: 'small', text: accountCounts
        ? `The account is ${authorityName(accountAuthority)}: its level counts in the game, and the game copies it onto this character at each login. Set the account's level to change it.`
        : 'This level counts in the game while the account is Player or VIP. The servers can keep running.' }),
      el('div', { class: 'row' }, field('Name', name), edit('Rename', () => api('characters.rename', { idPlayer, name: name.value }, { write: true }))),
      el('div', { class: 'row' }, field('Penya', gold), edit('Set penya', () => api('characters.gold', { idPlayer, gold: Number(gold.value) }, { write: true }))),
      el('div', { class: 'row' },
        edit('Move to Flarine', () => api('characters.move', { idPlayer }, { write: true }), 'quiet'),
        c.deleted
          ? edit('Undo delete', () => api('characters.undelete', { idPlayer }, { write: true }), 'quiet')
          : edit('Delete', async () => {
            if (!confirmBox(`Delete ${c.name}? The game clears it for good after 7 days.`)) return false;
            return api('characters.delete', { idPlayer }, { write: true });
          }, 'danger'),
        el('button', { type: 'button', class: 'quiet', text: 'Send item or penya', onclick: () => nav.sendTo(c) })),
      message.node,
      el('h3', { text: 'Sends not yet delivered' }),
      table(['What', 'Count', 'Upgrade', 'Sent', 'Made by'], pendingRows)));
  }

  return {
    node,
    show() {
      list.opened().catch((error) => findMessage.problem(error.message));
    },
    hide() {
      list.closed();
    },
    openCharacter(idPlayer) {
      open(idPlayer).catch((error) => findMessage.problem(error.message));
    },
  };
}
