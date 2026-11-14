// The admin panel page: the login box, the tabs, and the links between them. Each tab is its own module in js/.

import { accountsTab } from './js/accounts.js';
import { charactersTab } from './js/characters.js';
import { logTab } from './js/log.js';
import { sendTab } from './js/send.js';
import { statusTab } from './js/status.js';
import { api, el, onSessionLost, setSession } from './js/ui.js';

const header = /** @type {HTMLElement} */ (document.querySelector('.top'));
const tabsNav = /** @type {HTMLElement} */ (document.querySelector('.tabs'));
const sections = /** @type {HTMLElement} */ (document.querySelector('.sections'));
const who = /** @type {HTMLElement} */ (document.querySelector('.who'));
const cover = /** @type {HTMLElement} */ (document.querySelector('.login-cover'));
const form = /** @type {HTMLFormElement} */ (document.querySelector('.login'));
const loginMessage = /** @type {HTMLElement} */ (form.querySelector('.message'));

/** @type {{ name: string, tab: { node: HTMLElement, show(): void, hide?(): void }, button: HTMLButtonElement }[]} */
const tabs = [];
let current = -1;

/** How tabs open each other: an account, a character, or the Send tab with a character picked. */
const nav = {
  openAccount: (account) => { select('Accounts'); byName('Accounts').openAccount(account); },
  openCharacter: (idPlayer) => { select('Characters'); byName('Characters').openCharacter(idPlayer); },
  sendTo: (character) => { select('Send'); byName('Send').pick(character); },
};

const built = {
  Status: statusTab(nav),
  Accounts: accountsTab(nav),
  Characters: charactersTab(nav),
  Send: sendTab(nav),
  Log: logTab(nav),
};

function byName(name) { return /** @type {any} */ (built)[name]; }

function select(name) {
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
  tabs[index].tab.show();
}

for (const [name, tab] of Object.entries(built)) {
  const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', text: name, onclick: () => select(name) }));
  tabsNav.append(button);
  tab.node.hidden = true;
  sections.append(tab.node);
  tabs.push({ name, tab, button });
}

let started = false;

function loggedIn(user, csrf) {
  setSession(csrf);
  who.textContent = user;
  cover.hidden = true;
  header.hidden = false;
  form.reset();
  if (!started) {
    started = true;
    select('Status');
  }
}

function askLogin() {
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
  header.hidden = true;
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
