import type { NewCharacter } from '@flyffweb/protocol';
import { HAIR_MESH_COUNT, HEAD_MESH_COUNT, JOB_VAGRANT, Sex, hairColorFor } from '../appearance';
import { validateBankPin, validateCharacterName } from '../validation';
import { h } from './dom';
import type { View } from './dom';

export interface CreateViewOptions {
  /** The empty slot the character goes in (0 to 2). */
  slot: number;
  onCreate(character: NewCharacter): void;
  /** What was typed breaks a rule of the create screen: the message to show. Nothing is sent. */
  onInvalid(message: string): void;
  onCancel(): void;
}

interface Stepper {
  element: HTMLElement;
  /** The choice as the player sees it, from 1 to the count. */
  value(): number;
}

/** A choice from 1 to `count` with a button each way; it wraps around, so no button is ever dead. */
function stepper(label: string, count: number): Stepper {
  let value = 1;
  const shown = h('span', { class: 'stepper-value', 'aria-live': 'polite' }, `1 / ${count}`);
  const previous = h('button', { type: 'button', class: 'btn stepper-button', 'aria-label': `Previous ${label.toLowerCase()}` }, '−');
  const next = h('button', { type: 'button', class: 'btn stepper-button', 'aria-label': `Next ${label.toLowerCase()}` }, '+');
  const step = (by: number): void => {
    value = ((value - 1 + by + count) % count) + 1;
    shown.textContent = `${value} / ${count}`;
  };
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const element = h(
    'div',
    { class: 'field', role: 'group', 'aria-label': label },
    h('span', { class: 'label', 'aria-hidden': 'true' }, label),
    h('div', { class: 'stepper' }, previous, shown, next),
  );
  return { element, value: () => value };
}

/** A Bank PIN field: digits only on a phone's keyboard, and shown as dots like a password. */
function pinInput(name: string): HTMLInputElement {
  return h('input', { type: 'password', name, inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'off', enterkeyhint: 'next' });
}

/**
 * The create screen: a name, the sex, a hair style and a head, and the Bank PIN twice. Everything else about the
 * new character is the create screen's default of the game (face, costume and skin set 0, a Vagrant, the hair colour
 * that belongs to the hair style).
 */
export function createView({ slot, onCreate, onInvalid, onCancel }: CreateViewOptions): View {
  const nameInput = h('input', {
    type: 'text', name: 'name', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'next',
  });
  const male = h('input', { type: 'radio', name: 'sex', value: String(Sex.MALE), checked: true });
  const female = h('input', { type: 'radio', name: 'sex', value: String(Sex.FEMALE) });
  const hair = stepper('Hair', HAIR_MESH_COUNT);
  const head = stepper('Head', HEAD_MESH_COUNT);
  const pin = pinInput('bankPin');
  const confirm = pinInput('confirmBankPin');
  const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Create');
  const cancel = h('button', { type: 'button', class: 'btn' }, 'Cancel');
  const form = h(
    'form',
    { class: 'screen', novalidate: true },
    h('h2', { tabindex: '-1' }, `Create a character in slot ${slot + 1}`),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Name'), nameInput),
    h(
      'fieldset',
      { class: 'field plain' },
      h('legend', { class: 'label' }, 'Sex'),
      h('div', { class: 'segmented' }, h('label', {}, male, h('span', {}, 'Male')), h('label', {}, female, h('span', {}, 'Female'))),
    ),
    hair.element,
    head.element,
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Bank PIN'), pin),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Confirm Bank PIN'), confirm),
    h('p', { class: 'hint' }, 'The Bank PIN is 4 digits. You need it to delete this character.'),
    h('div', { class: 'actions' }, submit, cancel),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameProblem = validateCharacterName(nameInput.value);
    if (nameProblem !== undefined) {
      onInvalid(nameProblem);
      nameInput.focus();
      return;
    }
    const pinProblem = validateBankPin(pin.value, confirm.value);
    if (pinProblem !== undefined) {
      onInvalid(pinProblem);
      // The PIN alone decides which field is wrong; when it passes, the fault is in the confirmation.
      (validateBankPin(pin.value, pin.value) === undefined ? confirm : pin).focus();
      return;
    }
    const sex = female.checked ? Sex.FEMALE : Sex.MALE;
    const hairMesh = hair.value() - 1;
    // No second tap while the answer is awaited; `idle` frees the button if it was an error.
    submit.disabled = true;
    onCreate({
      slot,
      name: nameInput.value.trim(),
      face: 0,
      costume: 0,
      skinSet: 0,
      hairMesh,
      hairColor: hairColorFor(sex, hairMesh),
      sex,
      job: JOB_VAGRANT,
      headMesh: head.value() - 1,
      bankPin: Number(pin.value),
    });
  });
  cancel.addEventListener('click', onCancel);
  return {
    element: form,
    idle() {
      submit.disabled = false;
    },
  };
}
