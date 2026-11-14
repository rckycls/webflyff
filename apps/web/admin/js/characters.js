// The Characters tab: find characters by name or account and open one. Rename, set penya, move to Flarine, delete and
// undo work only while the Database and World servers are stopped (their memory would undo the change otherwise);
// the buttons say so while they are locked.

import { lockLine } from './status.js';
import { api, busy, confirmBox, el, fill, messageLine, numberText, table, timeText } from './ui.js';

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
  const findMessage = messageLine();
  const results = el('div');
  const view = el('div');
  const searchForm = el('form', { class: 'row' }, field('Find', query), field('By', by), findButton);
  const node = el('section', { 'aria-label': 'Characters' }, el('h2', { text: 'Characters' }),
    el('div', { class: 'card' }, searchForm, findMessage.node, results), view);

  async function find() {
    findMessage.clear();
    const text = query.value.trim();
    if (text === '') { findMessage.problem('Type something to find.'); return; }
    const { rows } = await api('characters.search', { [by.value]: text });
    fill(results, table(['Name', 'Account', 'Level', 'Slot', 'State'],
      rows.map((c) => [c.name, c.account, String(c.level), String(c.slot), c.deleted ? 'deleted' : c.online ? 'online' : 'offline']),
      (i) => { void open(rows[i].idPlayer); }));
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    find().catch((error) => findMessage.problem(error.message));
  });

  async function open(idPlayer) {
    const [{ character: c, pending }, status] = await Promise.all([api('characters.get', { idPlayer }), api('status')]);
    const editsOpen = status.charactersOpen === true;
    const message = messageLine();
    const locked = editsOpen ? undefined : 'Stop the servers first: the Database server would undo this change.';

    /** A button that runs one edit, then shows the character again. */
    function edit(text, run, cls) {
      const button = el('button', { type: 'button', text, class: cls, disabled: !editsOpen, title: locked });
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

    const pendingRows = pending.map((p) => [p.name ?? `item ${p.item}`, numberText(p.count), p.upgrade > 0 ? `+${p.upgrade}` : '', timeText(p.received), p.byPanel ? 'panel' : 'game']);

    fill(view, el('div', { class: 'card' },
      el('h3', { text: `${c.name} (${c.idPlayer})` }),
      lockLine(editsOpen),
      el('dl', { class: 'facts' },
        el('dt', { text: 'Account' }), el('dd', {}, el('a', { href: '#', text: c.account, onclick: (e) => { e.preventDefault(); nav.openAccount(c.account); } })),
        el('dt', { text: 'Level' }), el('dd', { text: String(c.level) }),
        el('dt', { text: 'Job' }), el('dd', { text: String(c.job) }),
        el('dt', { text: 'Penya' }), el('dd', { text: numberText(c.gold) }),
        el('dt', { text: 'Where' }), el('dd', { text: `world ${c.worldId} at ${Math.round(c.x)}, ${Math.round(c.y)}, ${Math.round(c.z)}` }),
        el('dt', { text: 'Slot' }), el('dd', { text: String(c.slot) }),
        el('dt', { text: 'Made' }), el('dd', { text: timeText(c.created) }),
        el('dt', { text: 'Play time' }), el('dd', { text: playTime(c.playTimeSeconds) }),
        el('dt', { text: 'State' }), el('dd', { text: c.deleted ? 'deleted' : c.online ? (status.stale ? 'online flag set (stale while the World is down)' : 'online') : 'offline' }),
        el('dt', { text: 'Guild' }), el('dd', { text: c.inGuild ? 'in a guild' : 'none' })),
      el('h3', { text: 'Change' }),
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
    show() {},
    openCharacter(idPlayer) {
      open(idPlayer).catch((error) => findMessage.problem(error.message));
    },
  };
}
