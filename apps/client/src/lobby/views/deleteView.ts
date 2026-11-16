// The Delete Character window as V15 shows it to LANG_ENG (docs/superpowers/specs/2026-11-12-char-select-create-research.md
// §4): APP_DELETE_CHAR, 272 x 208, the tiled frame, modal over the Select Character window (resdata.inc:11012-11060,
// CWndDeleteChar::Initialize, _Interface/WndTitle.cpp:1188-1241): two lines of text, a password edit, OK and CANCEL. Any
// text of 1 to 63 characters is sent (`validateDeletePassword`). 2026-11-17: the Database server checks the code against
// the character's bank PIN (0000 if never set), so the two lines say so in place of V15's "Password for deleting
// character" and "Enter The Password". The look is V15's.

import type { CharacterSummary } from '@flyffweb/protocol';
import { validateDeletePassword } from '../createRules';
import { focusEdit, h } from './dom';
import type { View } from './dom';

export interface DeleteViewOptions {
  character: CharacterSummary;
  /** The typed password passed the window's rule; the server decides the rest. */
  onDelete(password: string): void;
  /** What was typed breaks the rule: the message to show. Nothing is sent. */
  onInvalid(message: string): void;
  onCancel(): void;
}

export function deleteView({ character, onDelete, onInvalid, onCancel }: DeleteViewOptions): View {
  const password = h('input', {
    type: 'password', name: 'password', 'aria-label': 'Bank PIN', maxlength: 63,
    autocomplete: 'off', enterkeyhint: 'done', class: 'lobby-edit',
  });
  const ok = h('button', { type: 'submit', class: 'lobby-sprite cd-ok' }, 'OK');
  const cancel = h('button', { type: 'button', class: 'lobby-sprite cd-cancel' }, 'CANCEL');
  const form = h(
    'form',
    { class: 'screen delete-char', novalidate: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cd-title',
      'data-character': character.name },
    h('h2', { tabindex: '-1', id: 'cd-title' }, 'Delete Character'),
    h('p', { class: 'cd-line1' }, "Enter this character's bank PIN"),
    h('p', { class: 'cd-line2' }, '(0000 if you never set one)'),
    password,
    h('div', { class: 'cd-buttons' }, ok, cancel),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = validateDeletePassword(password.value);
    if (problem !== undefined) {
      // `pWndEdit->SetString( "" )` and the message box
      password.value = '';
      onInvalid(problem);
      focusEdit(password);
      return;
    }
    // OK and CANCEL are disabled while the answer is awaited (`DeletePlayer`, :1261-1268); `idle` frees them after an error
    ok.disabled = true;
    cancel.disabled = true;
    onDelete(password.value);
  });
  cancel.addEventListener('click', onCancel);
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !cancel.disabled) {
      event.preventDefault();
      onCancel();
    }
  });
  return {
    element: form,
    idle() {
      ok.disabled = false;
      cancel.disabled = false;
    },
  };
}
