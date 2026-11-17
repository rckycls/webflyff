// The Accounts tab: the account list, 10 a page (2026-11-17), filtered by account name, email or character name; open
// one to see it and its characters; reset its password, change its email, set its level (the account's own, and its
// characters' too if wanted), ban or unban it; and make a new account.

import { pagedList } from './pages.js';
import {
  api, authorityName, banText, busy, confirmBox, dayLabel, el, fill, levelSelect, messageLine, onStale, table, timeText, todayText,
} from './ui.js';

function field(label, input) {
  return el('label', {}, label, input);
}

export function accountsTab(nav) {
  const query = el('input', { placeholder: 'Account, email or character name', size: 28 });
  const by = el('select', {}, el('option', { value: 'account', text: 'Account' }), el('option', { value: 'email', text: 'Email' }), el('option', { value: 'characterName', text: 'Character' }));
  const findButton = el('button', { type: 'submit', text: 'Find' });
  const allButton = el('button', { type: 'button', class: 'quiet', text: 'Show all' });
  const findMessage = messageLine();
  const view = el('div');
  const searchForm = el('form', { class: 'row' }, field('Find', query), field('By', by), findButton, allButton);

  const list = pagedList({
    kind: 'accounts',
    action: 'accounts.page',
    columns: ['Account', 'Email', 'Level', 'Ban', 'Made'],
    cells: (a) => [a.account, a.email ?? '', authorityName(a.authority), banText(a.blockTime), timeText(a.created)],
    onRow: (a) => { open(a.account).catch((error) => findMessage.problem(error.message)); },
    onError: (error) => findMessage.problem(error.message),
  });
  onStale((stale) => list.stale(stale));

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
    el('div', { class: 'card' }, searchForm, findMessage.node, list.node),
    view,
    el('details', { class: 'card' }, el('summary', { text: 'New account' }),
      el('div', { class: 'row' }, field('Account', newName), field('Password', newPassword), field('Email', newEmail), createButton), createMessage.node));

  /** The filter typed: nothing typed shows every account. */
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

    // the account's level, and its characters' too unless unticked
    const level = levelSelect(a.authority);
    const alsoCharacters = el('input', { type: 'checkbox', checked: characters.length > 0, disabled: characters.length === 0 });
    const setLevel = el('button', { type: 'button', text: 'Set account level' });
    setLevel.addEventListener('click', busy(setLevel, message, async () => {
      const also = alsoCharacters.checked && characters.length > 0;
      const what = also ? `${a.account} and its ${characters.length} character(s)` : `the account ${a.account} (not its characters)`;
      if (!confirmBox(`Make ${what} ${authorityName(level.value)}? It takes effect at the next login.`)) return undefined;
      await api('accounts.authority', { account: a.account, authority: level.value, characters: also }, { write: true });
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
        el('dt', { text: 'Account level' }), el('dd', { class: 'level', text: authorityName(a.authority) }),
        el('dt', { text: 'Ban' }), el('dd', { class: 'ban', text: banText(a.blockTime) }),
        el('dt', { text: 'Made' }), el('dd', { text: timeText(a.created) })),
      el('h3', { text: 'Characters' }),
      table(['Name', 'Level', 'Own level', 'Slot', 'State'], characters.map((c) => [c.name, String(c.level), authorityName(c.authority), String(c.slot), c.deleted ? 'deleted' : c.online ? 'online' : 'offline']),
        (i) => nav.openCharacter(characters[i].idPlayer)),
      el('h3', { text: 'Change' }),
      el('div', { class: 'row' }, field('Password', password), setPassword),
      el('div', { class: 'row' }, field('Email', email), setEmail),
      el('div', { class: 'row' }, field('Account level', level), el('label', { class: 'inline' }, alsoCharacters, 'Also its characters'), setLevel),
      el('p', { class: 'small', text: 'In the game the account\'s level counts for all its characters, unless it is Player or VIP: then each character\'s own level counts (set it on the character). VIP 1-4 are titles only: VIP players play exactly as players do. It takes effect at the next login.' }),
      el('div', { class: 'row' }, field('Ban until', until), el('label', {}, 'Forever', forever), field('Reason', reason), banButton, unbanButton),
      el('p', { class: 'small', text: 'A ban stops the next login. A player who is online keeps playing until they log out.' }),
      message.node));
  }

  return {
    node,
    show() {
      list.opened().catch((error) => findMessage.problem(error.message));
    },
    hide() {
      list.closed();
    },
    openAccount(account) {
      query.value = account;
      by.value = 'account';
      find().catch((error) => findMessage.problem(error.message));
      open(account).catch((error) => findMessage.problem(error.message));
    },
    open,
  };
}
