// The admin panel page: the login box, the sidebar of tabs, and the links between tabs. Each tab is its own module in
// js/. On a phone (below 1000 px) the sidebar slides in from the menu button and closes when a tab is picked.

import { accountsTab } from './js/accounts.js';
import { charactersTab } from './js/characters.js';
import { icon, placeIcons } from './js/icons.js';
import { logTab } from './js/log.js';
import { sendTab } from './js/send.js';
import { statusTab } from './js/status.js';
import { api, el, onSessionLost, setSession } from './js/ui.js';

const sidebar = /** @type {HTMLElement} */ (document.querySelector('.sidebar'));
const page = /** @type {HTMLElement} */ (document.querySelector('.page'));
const backdrop = /** @type {HTMLElement} */ (document.querySelector('.backdrop'));
const tabsNav = /** @type {HTMLElement} */ (document.querySelector('.tabs'));
const sections = /** @type {HTMLElement} */ (document.querySelector('.sections'));
const pageTitle = /** @type {HTMLElement} */ (document.querySelector('.page-title'));
const who = /** @type {HTMLElement} */ (document.querySelector('.who'));
const avatar = /** @type {HTMLElement} */ (document.querySelector('.avatar'));
const menuButton = /** @type {HTMLButtonElement} */ (document.querySelector('.menu'));
const cover = /** @type {HTMLElement} */ (document.querySelector('.login-cover'));
const form = /** @type {HTMLFormElement} */ (document.querySelector('.login'));
const loginMessage = /** @type {HTMLElement} */ (form.querySelector('.message'));

placeIcons();

/** @type {{ name: string, tab: { node: HTMLElement, show(): void, hide?(): void }, button: HTMLButtonElement }[]} */
const tabs = [];
let current = -1;

/** How tabs open each other: an account, a character, or the Send tab with a character picked. */
const nav = {
  openAccount: (account) => { select('Accounts'); byName('Accounts').openAccount(account); },
  openCharacter: (idPlayer) => { select('Characters'); byName('Characters').openCharacter(idPlayer); },
  sendTo: (character) => { select('Send'); byName('Send').pick(character); },
};

/** The tabs, in the sidebar's groups, with their icons. */
const GROUPS = [
  { title: 'Overview', tabs: [['Status', 'status', statusTab]] },
  { title: 'Manage', tabs: [['Accounts', 'user', accountsTab], ['Characters', 'characters', charactersTab], ['Send', 'send', sendTab]] },
  { title: 'Records', tabs: [['Log', 'log', logTab]] },
];

/** @type {Record<string, any>} */
const built = {};

function byName(name) { return built[name]; }

function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  backdrop.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
}

function select(name) {
  setMenu(false);
  const index = tabs.findIndex((t) => t.name === name);
  if (index === current) return;
  if (current >= 0) {
    tabs[current].tab.node.hidden = true;
    tabs[current].button.removeAttribute('aria-current');
    tabs[current].tab.hide?.();
  }
  current = index;
  tabs[index].tab.node.hidden = false;
  tabs[index].button.setAttribute('aria-current', 'page');
  pageTitle.textContent = name;
  window.scrollTo({ top: 0 });
  tabs[index].tab.show();
}

for (const group of GROUPS) {
  tabsNav.append(el('p', { class: 'nav-title', text: group.title }));
  for (const [name, iconName, make] of group.tabs) {
    const tab = make(nav);
    built[name] = tab;
    const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', onclick: () => select(name) }, icon(iconName), el('span', { text: name })));
    tabsNav.append(button);
    tab.node.hidden = true;
    sections.append(tab.node);
    tabs.push({ name, tab, button });
  }
}

menuButton.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
backdrop.addEventListener('click', () => setMenu(false));

let started = false;

function loggedIn(user, csrf) {
  setSession(csrf);
  who.textContent = user;
  avatar.textContent = user.slice(0, 1).toUpperCase();
  cover.hidden = true;
  sidebar.hidden = false;
  page.hidden = false;
  form.reset();
  if (!started) {
    started = true;
    select('Status');
  }
}

function askLogin() {
  setMenu(false);
  cover.hidden = false;
  loginMessage.hidden = true;
  /** @type {HTMLInputElement} */ (form.elements.namedItem('user')).focus();
}

onSessionLost(askLogin);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'));
  if (button.disabled) return;
  button.disabled = true;
  loginMessage.hidden = true;
  const data = new FormData(form);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ user: data.get('user'), password: data.get('password'), code: data.get('code') }),
    });
    const answer = await res.json().catch(() => ({}));
    if (res.ok) {
      loggedIn(answer.user, answer.csrf);
      return;
    }
    loginMessage.textContent = res.status === 429 ? 'Too many tries. Wait 15 minutes, then try again.' : 'Wrong name, password or code.';
    loginMessage.hidden = false;
  } catch {
    loginMessage.textContent = 'The panel cannot be reached.';
    loginMessage.hidden = false;
  } finally {
    button.disabled = false;
  }
});

/** @type {HTMLButtonElement} */ (document.querySelector('.logout')).addEventListener('click', async () => {
  try { await api('logout'); } catch { /* the session is gone either way */ }
  setSession('');
  sidebar.hidden = true;
  page.hidden = true;
  askLogin();
});

try {
  const res = await fetch('/api/session', { credentials: 'same-origin' });
  if (res.ok) {
    const session = await res.json();
    loggedIn(session.user, session.csrf);
  } else {
    askLogin();
  }
} catch {
  askLogin();
}
