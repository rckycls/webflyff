// The Accounts tab: find accounts by account name, email or character name; open one to see it and its characters;
// reset its password, change its email, set its GM level, ban or unban it; and make a new account.

import { api, AUTHORITY_NAMES, authorityName, banText, busy, confirmBox, el, fill, messageLine, table, timeText, todayText, dayLabel } from './ui.js';

function field(label, input) {
  return el('label', {}, label, input);
}

export function accountsTab(nav) {
  const query = el('input', { placeholder: 'Account, email or character name', size: 28 });
  const by = el('select', {}, el('option', { value: 'account', text: 'Account' }), el('option', { value: 'email', text: 'Email' }), el('option', { value: 'characterName', text: 'Character' }));
  const findButton = el('button', { type: 'submit', text: 'Find' });
  const findMessage = messageLine();
  const results = el('div');
  const view = el('div');
  const searchForm = el('form', { class: 'row' }, field('Find', query), field('By', by), findButton);

  // a new account
  const newName = el('input', { placeholder: 'account name', autocomplete: 'off' });
  const newPassword = el('input', { type: 'password', placeholder: 'password', autocomplete: 'new-password' });
  const newEmail = el('input', { type: 'email', placeholder: 'email (optional)', autocomplete: 'off' });
  const createButton = el('button', { type: 'button', text: 'Create account' });
  const createMessage = messageLine();
  createButton.addEventListener('click', busy(createButton, createMessage, async () => {
    const answer = await api('accounts.create', { account: newName.value, password: newPassword.value, email: newEmail.value }, { write: true });
    newPassword.value = '';
    return `Made the account ${answer.account}.`;
  }));

  const node = el('section', { 'aria-label': 'Accounts' }, el('h2', { text: 'Accounts' }),
    el('div', { class: 'card' }, searchForm, findMessage.node, results),
    view,
    el('details', { class: 'card' }, el('summary', { text: 'New account' }),
      el('div', { class: 'row' }, field('Account', newName), field('Password', newPassword), field('Email', newEmail), createButton), createMessage.node));

  async function find() {
    findMessage.clear();
    const text = query.value.trim();
    if (text === '') { findMessage.problem('Type something to find.'); return; }
    const { rows } = await api('accounts.search', { [by.value]: text });
    fill(results, table(['Account', 'Email', 'GM level', 'Ban', 'Made'],
      rows.map((a) => [a.account, a.email ?? '', authorityName(a.authority), banText(a.blockTime), timeText(a.created)]),
      (i) => { void open(rows[i].account); }));
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    find().catch((error) => findMessage.problem(error.message));
  });

  async function open(account) {
    const { account: a, characters } = await api('accounts.get', { account });
    const message = messageLine();

    const password = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'new password' });
    const setPassword = el('button', { type: 'button', text: 'Set password' });
    setPassword.addEventListener('click', busy(setPassword, message, async () => {
      await api('accounts.password', { account: a.account, password: password.value }, { write: true });
      password.value = '';
      return 'Password changed.';
    }));

    const email = el('input', { type: 'email', value: a.email ?? '' });
    const setEmail = el('button', { type: 'button', text: 'Save email' });
    setEmail.addEventListener('click', busy(setEmail, message, async () => {
      await api('accounts.email', { account: a.account, email: email.value }, { write: true });
      return 'Email saved.';
    }));

    const level = el('select', {}, Object.entries(AUTHORITY_NAMES).map(([letter, name]) => el('option', { value: letter, text: `${name} (${letter})`, selected: letter === a.authority })));
    const setLevel = el('button', { type: 'button', text: 'Set GM level' });
    setLevel.addEventListener('click', busy(setLevel, message, async () => {
      if (!confirmBox(`Make ${a.account} ${authorityName(level.value)}? It takes effect at the next login.`)) return undefined;
      await api('accounts.authority', { account: a.account, authority: level.value }, { write: true });
      await open(a.account);
      return undefined;
    }));

    const until = el('input', { type: 'date', min: dayLabel(todayText()) });
    const forever = el('input', { type: 'checkbox' });
    const reason = el('input', { placeholder: 'reason (kept in the log)', maxlength: '200', size: 30 });
    const banButton = el('button', { type: 'button', class: 'danger', text: 'Ban' });
    banButton.addEventListener('click', busy(banButton, message, async () => {
      if (forever.checked && !confirmBox(`Ban ${a.account} forever?`)) return undefined;
      await api('accounts.ban', { account: a.account, until: forever.checked ? 'forever' : until.value, reason: reason.value }, { write: true });
      await open(a.account);
      return undefined;
    }));
    const unbanButton = el('button', { type: 'button', class: 'quiet', text: 'Unban' });
    unbanButton.addEventListener('click', busy(unbanButton, message, async () => {
      await api('accounts.unban', { account: a.account }, { write: true });
      await open(a.account);
      return undefined;
    }));

    fill(view, el('div', { class: 'card' },
      el('h3', { text: a.account }),
      el('dl', { class: 'facts' },
        el('dt', { text: 'Email' }), el('dd', { text: a.email ?? '(none)' }),
        el('dt', { text: 'GM level' }), el('dd', { text: authorityName(a.authority) }),
        el('dt', { text: 'Ban' }), el('dd', { class: 'ban', text: banText(a.blockTime) }),
        el('dt', { text: 'Made' }), el('dd', { text: timeText(a.created) })),
      el('h3', { text: 'Characters' }),
      table(['Name', 'Level', 'Slot', 'State'], characters.map((c) => [c.name, String(c.level), String(c.slot), c.deleted ? 'deleted' : c.online ? 'online' : 'offline']),
        (i) => nav.openCharacter(characters[i].idPlayer)),
      el('h3', { text: 'Change' }),
      el('div', { class: 'row' }, field('Password', password), setPassword),
      el('div', { class: 'row' }, field('Email', email), setEmail),
      el('div', { class: 'row' }, field('GM level', level), setLevel),
      el('div', { class: 'row' }, field('Ban until', until), el('label', {}, 'Forever', forever), field('Reason', reason), banButton, unbanButton),
      el('p', { class: 'small', text: 'A ban stops the next login. A player who is online keeps playing until they log out.' }),
      message.node));
  }

  return {
    node,
    show() {},
    openAccount(account) {
      query.value = account;
      by.value = 'account';
      open(account).catch((error) => findMessage.problem(error.message));
    },
    open,
  };
}
