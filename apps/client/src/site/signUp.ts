// The sign-up page (website spec §3.3): the rules are checked here first (the shared module the web service checks them
// with again), then the form goes to the web service with a ticket fetched when the page loaded. No game code.

import { checkSignUp, normalizeAccount } from '@flyffweb/protocol';
import type { SignUpField, SignUpProblem } from '@flyffweb/protocol';
import { pageSessionStorage, putSignUpAccount } from './handoff';
import { el, showLobbyArt, siteLogo, siteRoot } from './page';
import { SignUpApi } from './signUpApi';
import type { SignUpAnswer } from './signUpApi';
import './site.css';

const MESSAGES = {
  taken: 'That account name is taken.',
  too_many: 'Too many sign-ups from your network. Try again later.',
  paused: 'Sign-ups are paused for a few minutes. Try again soon.',
  ticket: 'Please press Sign up again.',
  failed: 'Something went wrong. Please try again later.',
} as const;

const api = new SignUpApi(fetch.bind(window));
const root = siteRoot();

/** A labelled input with its message line under it. */
function field(name: SignUpField, label: string, attributes: Record<string, string>, hint?: string) {
  const input = el('input', { id: `site-${name}`, name, 'aria-describedby': `site-${name}-message`, ...attributes });
  const message = el('p', { class: 'site-field-message', id: `site-${name}-message` });
  const box = el('div', { class: 'site-field' }, el('label', { for: input.id }, label), input);
  if (hint !== undefined) box.append(el('p', { class: 'site-hint' }, hint));
  box.append(message);
  return { name, input, message, box };
}

const fields = {
  account: field('account', 'Account', { type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '64' }),
  password: field('password', 'Password', { type: 'password', autocomplete: 'new-password', maxlength: '64' },
    "Use a password you don't use anywhere else."),
  confirm: field('confirm', 'Confirm password', { type: 'password', autocomplete: 'new-password', maxlength: '64' }),
  email: field('email', 'Email (optional)', { type: 'email', autocomplete: 'email', maxlength: '120' }),
};
// The trap: people never see or reach it; a bot that fills every input fills it too (the service then creates nothing).
// Its name, id and label are words no password or identity manager matches (not website, url, name, email...), so that
// a form filler never fills it for a real person, who would then be told 'created' with nothing made. The service still
// gets it as `website`.
const website = el('input', { type: 'text', name: 'hp_check', id: 'hp-check', tabindex: '-1', autocomplete: 'off' });
const trap = el('div', { class: 'trap', 'aria-hidden': 'true' }, el('label', { for: website.id }, 'Leave this empty'), website);

const alert = el('p', { class: 'site-alert', role: 'alert' });
const progress = el('p', { class: 'site-progress', role: 'status' });
const submit = el('button', { type: 'submit', class: 'site-button' }, 'Sign up');
const form = el('form', { class: 'site-panel site-form', novalidate: '' },
  el('h2', {}, 'Make an account'),
  ...Object.values(fields).map((f) => f.box),
  trap,
  alert,
  el('div', { class: 'site-actions' }, submit, progress));

root.replaceChildren(
  el('header', { class: 'site-top' }, siteLogo()),
  form,
  el('p', { class: 'site-back' }, el('a', { href: '/' }, 'Home')),
);
showLobbyArt();

/**
 * The service takes a ticket from 3 s after it gave it (a bot that posts at once is refused): a ticket is kept with the
 * time it came, and the form is sent only once it is that old, with a little room. A press sooner waits, with 'Sending…'.
 */
const TICKET_GOOD_AFTER_MS = 3200;
interface Ticket { value: string; cameAt: number }
const fetchTicket = async (): Promise<Ticket | undefined> => {
  const value = await api.ticket();
  return value === undefined ? undefined : { value, cameAt: performance.now() };
};
let ticket: Promise<Ticket | undefined> = fetchTicket();
let sending = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clearMessages(): void {
  alert.textContent = '';
  for (const f of Object.values(fields)) {
    f.message.textContent = '';
    f.input.removeAttribute('aria-invalid');
  }
}

/** A message by its field, which gets the focus. */
function showProblem({ field: name, message }: SignUpProblem): void {
  const f = fields[name];
  f.message.textContent = message;
  f.input.setAttribute('aria-invalid', 'true');
  f.input.focus();
}

function formValues() {
  return {
    account: fields.account.input.value,
    password: fields.password.input.value,
    confirm: fields.confirm.input.value,
    email: fields.email.input.value.trim(),
  };
}

function created(account: string): void {
  putSignUpAccount(pageSessionStorage(), account);
  const done = el('section', { class: 'site-panel site-done', 'aria-labelledby': 'site-done' },
    el('h2', { id: 'site-done', tabindex: '-1' }, 'Account created.'),
    el('p', {}, 'Your account ', el('strong', {}, account), ' is ready.'),
    el('div', { class: 'site-actions' }, el('a', { class: 'site-button', href: '/play/' }, 'Play now')));
  form.replaceWith(done);
  done.querySelector('h2')!.focus();
}

/**
 * The message for a field the service found invalid: the field's own, from the same rules. A field the page's rules pass
 * can still be refused by the service's settings (more reserved names): it gets that field's plain message.
 */
function invalidProblem(name: SignUpField | undefined, values: ReturnType<typeof formValues>): SignUpProblem | undefined {
  const problem = checkSignUp({ account: values.account, password: values.password, email: values.email });
  if (name !== undefined && problem?.field === name) return problem;
  if (name === 'account') return { field: name, message: 'That account name is reserved.' };
  if (name === 'email') return { field: name, message: 'Enter a valid email address, or leave it empty.' };
  return undefined;
}

/**
 * The answer's message. A ticket refused twice (the form is sent again by itself once, below) is renewed and every field
 * kept, so the player only presses again. Any other refusal spent the ticket: a new one is fetched, and the passwords
 * are cleared (spec §4).
 */
function refused(answer: Exclude<SignUpAnswer, { ok: true }>): void {
  ticket = fetchTicket();
  if (answer.error === 'ticket') {
    alert.textContent = MESSAGES.ticket;
    return;
  }
  const problem = answer.error === 'taken' ? { field: 'account' as const, message: MESSAGES.taken }
    : answer.error === 'invalid' ? invalidProblem(answer.field, formValues()) : undefined;
  fields.password.input.value = '';
  fields.confirm.input.value = '';
  if (problem !== undefined) showProblem(problem);
  else alert.textContent = answer.error === 'too_many' ? MESSAGES.too_many : answer.error === 'paused' ? MESSAGES.paused : MESSAGES.failed;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (sending) return;
  clearMessages();
  const values = formValues();
  const problem = checkSignUp(values);
  if (problem !== undefined) {
    showProblem(problem);
    return;
  }
  sending = true;
  submit.disabled = true;
  const account = normalizeAccount(values.account);
  /** One send with the current ticket (a new one if there is none), once it is good; `undefined` when none can be had. */
  const sendOnce = async (): Promise<SignUpAnswer | undefined> => {
    const held = (await ticket) ?? (await (ticket = fetchTicket()));
    if (held === undefined) return undefined;
    const wait = held.cameAt + TICKET_GOOD_AFTER_MS - performance.now();
    if (wait > 0) {
      progress.textContent = 'Sending…';
      await sleep(wait);
    }
    return api.send({ account, password: values.password, email: values.email, website: website.value, ticket: held.value });
  };
  void (async () => {
    try {
      let answer = await sendOnce();
      // a ticket too old (a page left open over 30 minutes) or already used: a new one, and the same form again, once
      if (answer !== undefined && !answer.ok && answer.error === 'ticket') {
        ticket = fetchTicket();
        answer = await sendOnce();
      }
      if (answer === undefined) alert.textContent = MESSAGES.failed;
      else if (answer.ok) created(account);
      else refused(answer);
    } finally {
      sending = false;
      submit.disabled = false;
      progress.textContent = '';
    }
  })();
});
