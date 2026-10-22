import { h } from './dom';
import type { View } from './dom';

export interface LoginViewOptions {
  /** What to put in the account field, for a player coming back to the form. The password is never kept. */
  account: string;
  onLogin(account: string, password: string): void;
}

export function loginView({ account, onLogin }: LoginViewOptions): View {
  // Phone keyboards: no capital letter or correction on the account, which the lobby lower-cases anyway.
  const accountInput = h('input', {
    type: 'text', name: 'account', value: account, autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off',
    spellcheck: 'false', enterkeyhint: 'next',
  });
  const passwordInput = h('input', {
    type: 'password', name: 'password', autocomplete: 'current-password', enterkeyhint: 'go',
  });
  const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Log in');
  // A disabled fieldset disables everything in it, so a second tap cannot start a second login.
  const fields = h(
    'fieldset',
    { class: 'plain' },
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Account'), accountInput),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Password'), passwordInput),
    h('div', { class: 'actions' }, submit),
  );
  const form = h('form', { class: 'screen', novalidate: true }, h('h2', { tabindex: '-1' }, 'Log in'), fields);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    fields.disabled = true;
    onLogin(accountInput.value, passwordInput.value);
  });
  return { element: form };
}
