// The VIP tab's Codes view (2026-11-20, redeem codes): make codes that give a VIP level for some days, up to 6 item
// stacks (searched as in the Gift box view), or both; for everyone (an optional cap), only some accounts, or a batch
// of one-use codes; with an end time in your own time zone. Players type them in the game (Start → Extras → Redeem
// Code). The list shows each code, what it gives, its uses and its state; turn a code off or on, change its name or
// end time, copy or download its codes, and see who used it. What a code gives never changes after it is made.

import { api, busy, el, fill, messageLine, timeText } from './ui.js';

const KIND_NAMES = { E: 'Everyone', L: 'Only these accounts', K: 'One-use codes' };
const STATE_NAMES = { on: 'On', off: 'Off', expired: 'Expired', used_up: 'Used up' };

/** A datetime-local input's value for `ms` (this browser's time). */
function localInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value as ISO (UTC), or '' when it is empty or not a time. */
function isoOf(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function givesText(code) {
  const parts = [];
  if (code.vipLevel > 0) parts.push(`VIP ${code.vipLevel} for ${code.vipDays} day${code.vipDays === 1 ? '' : 's'}`);
  for (const i of code.items) parts.push(`${i.name ?? `item ${i.itemId}`} x${i.count}`);
  return parts.join(', ');
}

function usesText(code) {
  if (code.kind === 'K') return `${code.keysTotal - code.keysUnused} of ${code.keysTotal} used`;
  return code.maxUses === null ? `${code.uses} used` : `${code.uses} of ${code.maxUses} used`;
}

/** Copy and Download .txt buttons for a list of codes. */
function keyButtons(keys, label, message) {
  const copy = el('button', { type: 'button', class: 'quiet', text: 'Copy' });
  copy.addEventListener('click', busy(copy, message, async () => {
    await navigator.clipboard.writeText(keys.join('\n'));
    return `Copied ${keys.length} code${keys.length === 1 ? '' : 's'}.`;
  }));
  const download = el('button', { type: 'button', class: 'quiet', text: 'Download .txt' });
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([`${keys.join('\r\n')}\r\n`], { type: 'text/plain' }));
    const link = el('a', { href: url, download: `codes-${label.replace(/[^\w-]+/g, '-').slice(0, 40) || 'list'}.txt` });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
  return el('span', { class: 'vip-actions' }, copy, download);
}

/** One item stack row of the form: a search, a picked item, a count. */
function itemRow(n, message) {
  const query = el('input', { autocomplete: 'off', placeholder: 'Search an item', 'aria-label': `Item ${n}` });
  const count = el('input', { type: 'number', min: '1', max: '9999', value: '1', size: 6, 'aria-label': `Item ${n} count` });
  const picks = el('div', { class: 'picks' });
  let itemId = 0;
  let timer = 0;
  query.addEventListener('input', () => {
    itemId = 0; // typing forgets the item: Make then asks for one picked from the search
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const text = query.value.trim();
      if (text === '') { fill(picks); return; }
      api('items.search', { query: text }).then(({ rows }) => {
        fill(picks, rows.length === 0 ? el('p', { class: 'small', text: 'No item found.' })
          : rows.map((i) => el('button', { type: 'button', text: `${i.name} (id ${i.id}, stacks to ${i.packMax})`, onclick: () => {
            itemId = i.id; query.value = i.name; count.max = String(Math.min(i.packMax, 9999)); fill(picks);
          } })));
      }).catch((error) => message.problem(error.message));
    }, 300);
  });
  return {
    node: el('tr', {}, el('td', { text: String(n) }), el('td', {}, query, picks), el('td', {}, count)),
    /** The stack, null when the row is empty, or 'unpicked' when text was typed but no item picked. */
    value: () => (query.value.trim() === '' ? null : itemId === 0 ? 'unpicked' : { itemId, count: Number(count.value) }),
    clear: () => { query.value = ''; itemId = 0; count.value = '1'; fill(picks); },
  };
}

function makeForm(onMade) {
  const message = messageLine();
  const label = el('input', { maxlength: '64', autocomplete: 'off', placeholder: 'e.g. Discord launch giveaway', 'aria-label': 'Code name' });
  const vipLevel = el('select', { 'aria-label': 'VIP level' }, el('option', { value: '0', text: 'No VIP' }), [1, 2, 3, 4].map((n) => el('option', { value: String(n), text: `VIP ${n}` })));
  const vipDays = el('input', { type: 'number', min: '1', max: '366', value: '7', 'aria-label': 'VIP days' });
  const items = [1, 2, 3, 4, 5, 6].map((n) => itemRow(n, message));
  const kind = el('select', { 'aria-label': 'Who can use it' }, Object.entries(KIND_NAMES).map(([value, text]) => el('option', { value, text })));
  const maxUses = el('input', { type: 'number', min: '1', max: '100000', placeholder: 'no cap', 'aria-label': 'Most uses' });
  const word = el('input', { maxlength: '40', autocomplete: 'off', placeholder: 'random', 'aria-label': 'Your own word' });
  const accounts = el('textarea', { rows: '4', placeholder: 'one account per line', 'aria-label': 'Accounts' });
  const count = el('input', { type: 'number', min: '1', max: '500', value: '10', 'aria-label': 'How many codes' });
  const expiresAt = el('input', { type: 'datetime-local', value: localInput(Date.now() + 7 * 86_400_000), 'aria-label': 'End time' });
  const made = el('div');
  const capRow = el('label', {}, 'Most uses ', maxUses);
  const wordRow = el('label', {}, ' Code ', word);
  const accountsRow = el('label', { class: 'block' }, 'Accounts ', accounts);
  const countRow = el('label', {}, 'How many ', count);
  const daysRow = el('label', {}, ' for ', vipDays, ' days');
  function showKind() {
    capRow.hidden = kind.value !== 'E';
    wordRow.hidden = kind.value === 'K';
    accountsRow.hidden = kind.value !== 'L';
    countRow.hidden = kind.value !== 'K';
    daysRow.hidden = vipLevel.value === '0';
  }
  kind.addEventListener('change', showKind);
  vipLevel.addEventListener('change', showKind);
  showKind();
  const go = el('button', { type: 'submit', text: 'Make' });
  const form = el('form', { class: 'card' },
    el('h3', { text: 'Make a code' }),
    el('p', { class: 'small', text: 'Players type it in the game: Start → Extras → Redeem Code. Items arrive by in-game mail and go into the bag. A code never takes days from a higher VIP: it is refused until that VIP ends. One use per account.' }),
    el('label', {}, 'Name ', label),
    el('div', { class: 'row' }, el('label', {}, 'VIP ', vipLevel), daysRow),
    el('div', { class: 'table-box' }, el('table', {}, el('thead', {}, el('tr', {}, ['', 'Item (optional)', 'Count'].map((h) => el('th', { text: h })))),
      el('tbody', {}, items.map((i) => i.node)))),
    el('div', { class: 'row' }, el('label', {}, 'Who ', kind), ' ', capRow, wordRow, countRow),
    accountsRow,
    el('label', {}, 'Ends ', expiresAt, el('span', { class: 'small', text: ' (your time)' })),
    ' ', go, message.node, made);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void busy(go, message, async () => {
      fill(made);
      const stacks = items.map((i) => i.value());
      if (stacks.includes('unpicked')) throw new Error('Pick each item from the search (or empty its box).');
      const body = {
        label: label.value.trim(), vipLevel: Number(vipLevel.value), vipDays: Number(vipDays.value), items: stacks.filter((s) => s !== null),
        kind: kind.value, expiresAt: isoOf(expiresAt.value),
        ...(kind.value === 'E' && maxUses.value.trim() !== '' ? { maxUses: Number(maxUses.value) } : {}),
        ...(kind.value !== 'K' && word.value.trim() !== '' ? { word: word.value.trim() } : {}),
        ...(kind.value === 'L' ? { accounts: accounts.value } : {}),
        ...(kind.value === 'K' ? { count: Number(count.value) } : {}),
      };
      const done = await api('codes.add', body, { write: true });
      fill(made, el('div', { class: 'card' },
        el('p', { text: done.keys.length === 1 ? `Made the code ${done.keys[0]}.` : `Made ${done.keys.length} one-use codes.` }),
        done.keys.length > 1 ? el('pre', { class: 'small', text: done.keys.join('\n') }) : null,
        keyButtons(done.keys, body.label, message)));
      for (const i of items) i.clear();
      onMade();
      return 'Made. You can copy the codes now or later from the list.';
    })();
  });
  return form;
}

/** One code in the list, with its actions. */
function codeCard(code, reload) {
  const message = messageLine();
  const more = el('div');
  const label = el('input', { maxlength: '64', value: code.label, 'aria-label': `Name of code ${code.id}` });
  const expiresAt = el('input', { type: 'datetime-local', value: localInput(Date.parse(code.expiresAt)), 'aria-label': `End time of code ${code.id}` });
  const save = el('button', { type: 'button', class: 'quiet', text: 'Save' });
  save.addEventListener('click', busy(save, message, async () => {
    await api('codes.save', { id: code.id, label: label.value.trim(), expiresAt: isoOf(expiresAt.value), on: code.on }, { write: true });
    reload();
    return 'Saved.';
  }));
  const toggle = el('button', { type: 'button', class: code.on ? 'danger' : 'quiet', text: code.on ? 'Turn off' : 'Turn on' });
  toggle.addEventListener('click', busy(toggle, message, async () => {
    await api('codes.save', { id: code.id, label: code.label, expiresAt: code.expiresAt, on: !code.on }, { write: true });
    reload();
    return code.on ? 'Turned off: players can no longer use it.' : 'Turned on.';
  }));
  const keys = el('button', { type: 'button', class: 'quiet', text: code.kind === 'K' ? 'Codes' : 'Copy code' });
  keys.addEventListener('click', busy(keys, message, async () => {
    const { rows } = await api('codes.keys', { id: code.id });
    const unused = rows.filter((k) => k.usedBy === null).map((k) => k.key);
    if (code.kind !== 'K') {
      await navigator.clipboard.writeText(rows[0]?.key ?? '');
      return `Copied ${rows[0]?.key ?? ''}.`;
    }
    fill(more, el('div', { class: 'card' },
      el('p', { class: 'small', text: `${unused.length} unused of ${rows.length}.` }),
      keyButtons(unused, code.label, message),
      el('div', { class: 'table-box' }, el('table', {}, el('thead', {}, el('tr', {}, ['Code', 'Used by', 'When'].map((h) => el('th', { text: h })))),
        el('tbody', {}, rows.map((k) => el('tr', {}, el('td', { text: k.key }), el('td', { text: k.usedBy ?? '' }), el('td', { text: k.usedAt ? timeText(k.usedAt) : '' }))))))));
    return undefined;
  }));
  const uses = el('button', { type: 'button', class: 'quiet', text: 'Uses' });
  uses.addEventListener('click', busy(uses, message, async () => {
    const { rows } = await api('codes.uses', { id: code.id });
    fill(more, rows.length === 0 ? el('p', { class: 'small', text: 'Nobody used it yet.' }) : el('div', { class: 'table-box' }, el('table', {},
      el('thead', {}, el('tr', {}, ['When', 'Account', 'Character', 'VIP given', 'Replaced', 'Items'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.map((u) => el('tr', {},
        el('td', { text: timeText(u.usedAt) }), el('td', { text: u.account }), el('td', { text: u.characterName }),
        el('td', { text: u.vipLevel > 0 ? `VIP ${u.vipLevel} until ${timeText(u.vipEndsAt)}` : '' }),
        el('td', { text: u.replacedLevel ? `VIP ${u.replacedLevel} (was until ${timeText(u.replacedEndsAt)})` : '' }),
        el('td', { text: code.items.length === 0 ? '' : u.deliveredAt ? `Mailed to ${u.deliveredName ?? u.characterName}` : 'Waiting (mailed within 5 minutes)' })))))));
    return undefined;
  }));
  return el('div', { class: 'card' },
    el('h3', { text: `${code.label} · ${STATE_NAMES[code.state] ?? code.state}` }),
    el('p', { class: 'small', text: `${KIND_NAMES[code.kind]}${code.firstKey ? ` · ${code.firstKey}` : ''} · ${givesText(code)} · ${usesText(code)} · ends ${timeText(code.expiresAt)} · made by ${code.createdBy}` }),
    el('div', { class: 'row' }, el('label', {}, 'Name ', label), el('label', {}, ' Ends ', expiresAt), ' ', save, ' ', toggle, ' ', keys, ' ', uses),
    message.node, more);
}

export function codesView() {
  const message = messageLine();
  const list = el('div', { class: 'vip-list' });
  async function load() {
    try {
      const { rows } = await api('codes.list', {});
      fill(list, rows.length === 0 ? el('p', { class: 'small', text: 'No codes yet.' }) : rows.map((code) => codeCard(code, () => void load())));
    } catch (error) {
      message.problem(error.message);
    }
  }
  return { node: el('div', { class: 'vip-view' }, makeForm(() => void load()), el('h3', { text: 'Codes' }), message.node, list), show: load };
}
