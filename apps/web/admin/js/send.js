// The Send tab: pick a character, then an item (searched by name or id in the game's item list) or an amount of penya.
// Sends go into the game's own delivery table and arrive when the character next enters the game. Below: the sends
// not yet delivered; the panel's own can be cancelled.

import { api, busy, el, fill, messageLine, numberText, table, timeText } from './ui.js';

const SEARCH_DELAY_MS = 250;

function field(label, input) {
  return el('label', {}, label, input);
}

export function sendTab() {
  /** @type {{ idPlayer: string, name: string, account: string } | null} */
  let character = null;
  /** @type {{ id: number, name: string, packMax: number, upgradable: boolean } | null} */
  let item = null;

  const who = el('input', { placeholder: 'Character name', size: 24 });
  const findWho = el('button', { type: 'submit', text: 'Find' });
  const whoPicks = el('div', { class: 'picks' });
  const chosen = el('p', { class: 'chosen', text: 'No character picked yet.' });
  const whoForm = el('form', { class: 'row' }, field('Send to', who), findWho);

  const itemQuery = el('input', { placeholder: 'Item name or id', size: 24, autocomplete: 'off' });
  const itemPicks = el('div', { class: 'picks' });
  const itemChosen = el('p', { class: 'small', text: 'No item picked yet.' });
  const count = el('input', { type: 'number', min: '1', value: '1' });
  const upgrade = el('select', {}, Array.from({ length: 11 }, (_, n) => el('option', { value: String(n), text: `+${n}` })));
  const upgradeField = field('Upgrade', upgrade);
  const sendItem = el('button', { type: 'button', text: 'Send item', disabled: true });
  const penya = el('input', { type: 'number', min: '1', placeholder: 'amount' });
  const sendPenya = el('button', { type: 'button', text: 'Send penya', disabled: true });
  const message = messageLine();
  const pending = el('div');

  const node = el('section', { 'aria-label': 'Send' }, el('h2', { text: 'Send' }),
    el('div', { class: 'card' }, whoForm, whoPicks, chosen),
    el('div', { class: 'card' }, el('h3', { text: 'Item' }),
      el('div', { class: 'row' }, field('Find item', itemQuery)), itemPicks, itemChosen,
      el('div', { class: 'row' }, field('Count', count), upgradeField, sendItem),
      el('h3', { text: 'Penya' }),
      el('div', { class: 'row' }, field('Amount', penya), sendPenya),
      el('p', { class: 'small', text: 'It arrives the next time the character enters the game.' }),
      message.node),
    el('div', { class: 'card' }, el('h3', { text: 'Sends not yet delivered' }), pending));

  function ready() {
    sendItem.disabled = character === null || item === null;
    sendPenya.disabled = character === null;
  }

  async function showPending() {
    if (character === null) { fill(pending, el('p', { class: 'small', text: 'Pick a character to see its sends.' })); return; }
    const picked = character;
    const { rows } = await api('sends.list', { idPlayer: picked.idPlayer });
    fill(pending, table(['What', 'Count', 'Upgrade', 'Sent', 'Made by', ''], rows.map((p) => {
      const cancel = el('button', { type: 'button', class: 'quiet', text: 'Cancel' });
      cancel.addEventListener('click', busy(cancel, message, async () => {
        await api('sends.cancel', { idPlayer: picked.idPlayer, no: p.no }, { write: true });
        await showPending();
        return 'Cancelled.';
      }));
      return [p.name ?? `item ${p.item}`, numberText(p.count), p.upgrade > 0 ? `+${p.upgrade}` : '', timeText(p.received), p.byPanel ? 'panel' : 'game', p.byPanel ? cancel : ''];
    })));
  }

  function pick(c) {
    character = { idPlayer: c.idPlayer, name: c.name, account: c.account };
    chosen.textContent = `Sending to ${c.name} (account ${c.account}).`;
    fill(whoPicks);
    ready();
    showPending().catch((error) => message.problem(error.message));
  }

  whoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = who.value.trim();
    if (text === '') return;
    api('characters.search', { name: text }).then(({ rows }) => {
      fill(whoPicks, rows.length === 0 ? el('p', { class: 'small', text: 'No character with that name.' })
        : rows.filter((c) => !c.deleted).map((c) => el('button', { type: 'button', text: `${c.name} — ${c.account}, level ${c.level}`, onclick: () => pick(c) })));
    }).catch((error) => message.problem(error.message));
  });

  let searchTimer = 0;
  itemQuery.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const text = itemQuery.value.trim();
      if (text === '') { fill(itemPicks); return; }
      api('items.search', { query: text }).then(({ rows }) => {
        fill(itemPicks, rows.length === 0 ? el('p', { class: 'small', text: 'No item found.' })
          : rows.map((i) => el('button', { type: 'button', text: `${i.name} (id ${i.id})`, onclick: () => {
            item = i;
            itemChosen.textContent = `${i.name}, id ${i.id}: up to ${numberText(i.packMax)} in one send${i.upgradable ? ', can be upgraded' : ''}.`;
            count.max = String(i.packMax);
            count.value = '1';
            upgrade.value = '0';
            upgradeField.hidden = !i.upgradable;
            fill(itemPicks);
            ready();
          } })));
      }).catch((error) => message.problem(error.message));
    }, SEARCH_DELAY_MS);
  });

  sendItem.addEventListener('click', busy(sendItem, message, async () => {
    if (character === null || item === null) return undefined;
    await api('sends.item', { idPlayer: character.idPlayer, itemId: item.id, count: Number(count.value), upgrade: item.upgradable ? Number(upgrade.value) : 0 }, { write: true });
    await showPending();
    return `Sent ${numberText(Number(count.value))} × ${item.name} to ${character.name}.`;
  }));

  sendPenya.addEventListener('click', busy(sendPenya, message, async () => {
    if (character === null) return undefined;
    await api('sends.penya', { idPlayer: character.idPlayer, amount: Number(penya.value) }, { write: true });
    await showPending();
    return `Sent ${numberText(Number(penya.value))} penya to ${character.name}.`;
  }));

  return {
    node,
    show() { showPending().catch((error) => message.problem(error.message)); },
    pick,
  };
}
