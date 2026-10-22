import type { CharacterSummary } from '@flyffweb/protocol';
import { validateBankPin } from '../validation';
import { h } from './dom';
import type { View } from './dom';

export interface DeleteViewOptions {
  character: CharacterSummary;
  /** The typed Bank PIN passed the create screen's rules; the server decides whether it is the right one. */
  onDelete(bankPin: string): void;
  /** What was typed breaks a rule: the message to show. Nothing is sent. */
  onInvalid(message: string): void;
  onCancel(): void;
}

export function deleteView({ character, onDelete, onInvalid, onCancel }: DeleteViewOptions): View {
  const pin = h('input', {
    type: 'password', name: 'bankPin', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'off', enterkeyhint: 'go',
  });
  const submit = h('button', { type: 'submit', class: 'btn danger' }, 'Delete');
  const cancel = h('button', { type: 'button', class: 'btn' }, 'Cancel');
  const form = h(
    'form',
    { class: 'screen', novalidate: true },
    h('h2', { tabindex: '-1' }, 'Delete a character'),
    h('p', {}, 'Delete ', h('strong', {}, character.name), `, level ${character.level}? This cannot be undone. Enter its Bank PIN to confirm.`),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Bank PIN'), pin),
    h('div', { class: 'actions' }, submit, cancel),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = validateBankPin(pin.value, pin.value);
    if (problem !== undefined) {
      onInvalid(problem);
      pin.focus();
      return;
    }
    // No second tap while the answer is awaited; `idle` frees the button if it was an error.
    submit.disabled = true;
    onDelete(pin.value);
  });
  cancel.addEventListener('click', onCancel);
  return {
    element: form,
    idle() {
      submit.disabled = false;
    },
  };
}
