// The New Character window as V15 lays it out (docs/superpowers/specs/2026-11-12-char-select-create-research.md §3):
// APP_CREATE_CHAR, 544 x 368, the tiled frame (resdata.inc:24546-24773): Character Name; Sex (ButtMale, ButtFemale);
// Hair Style, Hair Color (disabled) and Face with ButtLeft and ButtRight; Bank PIN and Confirm Bank PIN; the red note;
// OK and Cancel. The 3D preview at the right (CWndCreateChar::OnDraw, _Interface/WndTitle.cpp:2358-2593) is drawn into
// `.cc-preview` by `lobbyPortraits.ts`, from `look()`.

import type { NewCharacter } from '@flyffweb/protocol';
import { HAIR_MESH_COUNT, HEAD_MESH_COUNT, JOB_VAGRANT, Sex, hairColorFor } from '../appearance';
import { nameNotAllowed, pinDigits, stepChoice } from '../createRules';
import { validateBankPin, validateCharacterName } from '../validation';
import { h } from './dom';
import type { View } from './dom';

/** The look the window shows and sends. */
export interface CreateLook {
  sex: number;
  hairMesh: number;
  headMesh: number;
}

export interface CreateViewOptions {
  /** The empty slot the character goes in (0 to 2). */
  slot: number;
  /** The look the window opens with (`openingLook`: a woman, a random hair style and face). */
  look: CreateLook;
  /** `InvalidName_ENG.inc` and `Letter_ENG.inc` (the party catalog), or null while they are not loaded. */
  nameRules?: () => { invalidNames: readonly string[]; letters: string } | null;
  onCreate(character: NewCharacter): void;
  /** What was typed breaks a rule of the window: the message to show. Nothing is sent. */
  onInvalid(message: string): void;
  onCancel(): void;
  /** The look changed (sex, hair style or face). */
  onLook?: (look: CreateLook) => void;
}

export interface CreateView extends View {
  /** The look chosen so far. */
  look(): CreateLook;
}

/** `TID`-less layout texts (`Resource/resData.txt.txt`, IDS_RESDATA_INC_003075, 006900). */
const NAME_TIP = 'Total approved amount of letters for a name is 16 at maximum. No special letter or space is approved.';
const PIN_NOTE = 'Character PIN is the same as your Bank PIN.';

/** A sprite button of the theme, its words kept for a screen reader. */
function spriteButton(label: string, className: string, attrs: Record<string, string | boolean> = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: `lobby-sprite ${className}`, ...attrs }, label);
}

/** A Bank PIN edit: `EBS_PASSWORD | EBS_NUMBER`, 4 digits at most; digits only on a phone's keyboard. */
function pinInput(name: string, label: string): HTMLInputElement {
  const input = h('input', {
    type: 'password', name, 'aria-label': label, inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4,
    autocomplete: 'off', enterkeyhint: 'next', class: 'lobby-edit',
  });
  input.addEventListener('input', () => {
    const kept = pinDigits(input.value);
    if (kept !== input.value) input.value = kept;
  });
  return input;
}

/** A row's label at x 16 (`WIDC_STATIC*`). */
const label = (text: string, forId?: string): HTMLElement =>
  forId === undefined ? h('span', { class: 'cc-label' }, text) : h('label', { class: 'cc-label', for: forId }, text);

export function createView(options: CreateViewOptions): CreateView {
  const { slot, onCreate, onInvalid, onCancel } = options;
  const look: CreateLook = { ...options.look };

  const name = h('input', {
    type: 'text', name: 'name', id: 'cc-name', title: NAME_TIP, autocomplete: 'off', autocapitalize: 'none',
    autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'next', class: 'lobby-edit',
  });
  const male = spriteButton('Male', 'cc-male', { 'aria-pressed': 'false' });
  const female = spriteButton('Female', 'cc-female', { 'aria-pressed': 'false' });
  const hairLeft = spriteButton('Left', 'cc-left', { 'aria-label': 'Previous hair style' });
  const hairRight = spriteButton('Right', 'cc-right', { 'aria-label': 'Next hair style' });
  const colorLeft = spriteButton('Left', 'cc-left', { 'aria-label': 'Previous hair color', disabled: true });
  const colorRight = spriteButton('Right', 'cc-right', { 'aria-label': 'Next hair color', disabled: true });
  const faceLeft = spriteButton('Left', 'cc-left', { 'aria-label': 'Previous face' });
  const faceRight = spriteButton('Right', 'cc-right', { 'aria-label': 'Next face' });
  // Neuz shows no number; a screen reader is told the choice
  const hairValue = h('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  const faceValue = h('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  const pin = pinInput('bankPin', 'Bank PIN');
  pin.id = 'cc-pin';
  const confirm = pinInput('confirmBankPin', 'Confirm Bank PIN');
  confirm.id = 'cc-confirm';
  const ok = h('button', { type: 'submit', class: 'lobby-sprite cc-ok' }, 'OK');
  const cancel = spriteButton('Cancel', 'cc-cancel');

  const form = h(
    'form',
    { class: 'screen create-char', novalidate: true, 'aria-labelledby': 'cc-title', 'data-slot': slot },
    h('h2', { tabindex: '-1', id: 'cc-title' }, 'New Character'),
    h('div', { class: 'cc-rows' },
      h('div', { class: 'cc-row cc-row-name' }, label('Character Name', 'cc-name'), name),
      h('div', { class: 'cc-row cc-row-sex', role: 'group', 'aria-label': 'Sex' }, label('Sex'), male, female),
      h('div', { class: 'cc-row', role: 'group', 'aria-label': 'Hair Style' }, label('Hair Style'), hairLeft, hairRight, hairValue),
      h('div', { class: 'cc-row cc-row-off', role: 'group', 'aria-label': 'Hair Color' }, label('Hair Color'), colorLeft, colorRight),
      h('div', { class: 'cc-row', role: 'group', 'aria-label': 'Face' }, label('Face'), faceLeft, faceRight, faceValue),
      h('div', { class: 'cc-row cc-row-pin' }, label('Bank PIN', 'cc-pin'), pin),
      h('div', { class: 'cc-row cc-row-pin' }, label('Confirm Bank PIN', 'cc-confirm'), confirm),
      h('p', { class: 'cc-note' }, PIN_NOTE),
    ),
    h('div', { class: 'cc-preview', 'aria-hidden': 'true' }),
    h('div', { class: 'cc-buttons' }, ok, cancel),
  );

  const shown = (): void => {
    male.setAttribute('aria-pressed', String(look.sex === Sex.MALE));
    female.setAttribute('aria-pressed', String(look.sex === Sex.FEMALE));
    hairValue.textContent = `Hair style ${look.hairMesh + 1} of ${HAIR_MESH_COUNT}`;
    faceValue.textContent = `Face ${look.headMesh + 1} of ${HEAD_MESH_COUNT}`;
    form.dataset.sex = String(look.sex);
    form.dataset.hair = String(look.hairMesh);
    form.dataset.face = String(look.headMesh);
  };
  const change = (next: Partial<CreateLook>): void => {
    Object.assign(look, next);
    shown();
    options.onLook?.({ ...look });
  };
  male.addEventListener('click', () => change({ sex: Sex.MALE }));
  female.addEventListener('click', () => change({ sex: Sex.FEMALE }));
  hairLeft.addEventListener('click', () => change({ hairMesh: stepChoice(look.hairMesh, -1, HAIR_MESH_COUNT) }));
  hairRight.addEventListener('click', () => change({ hairMesh: stepChoice(look.hairMesh, 1, HAIR_MESH_COUNT) }));
  faceLeft.addEventListener('click', () => change({ headMesh: stepChoice(look.headMesh, -1, HEAD_MESH_COUNT) }));
  faceRight.addEventListener('click', () => change({ headMesh: stepChoice(look.headMesh, 1, HEAD_MESH_COUNT) }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // `OnChildNotify`'s WIDC_OK, in its order: the name's rules, the banned names, then the Bank PIN
    const nameProblem = validateCharacterName(name.value);
    if (nameProblem !== undefined) {
      onInvalid(nameProblem);
      name.focus();
      return;
    }
    const rules = options.nameRules?.() ?? null;
    const banned = rules === null ? undefined : nameNotAllowed(name.value, rules.invalidNames, rules.letters);
    if (banned !== undefined) {
      onInvalid(banned);
      name.focus();
      return;
    }
    const pinProblem = validateBankPin(pin.value, confirm.value);
    if (pinProblem !== undefined) {
      onInvalid(pinProblem);
      // the PIN alone decides which edit is wrong; when it passes, the fault is in the confirmation
      (validateBankPin(pin.value, pin.value) === undefined ? confirm : pin).focus();
      return;
    }
    // OK and Cancel are disabled while the answer is awaited (`:2903-2906`); `idle` frees them after an error
    ok.disabled = true;
    cancel.disabled = true;
    onCreate({
      slot,
      name: name.value.trim(),
      face: 0,
      costume: 0,
      skinSet: 0,
      hairMesh: look.hairMesh,
      hairColor: hairColorFor(look.sex, look.hairMesh),
      sex: look.sex,
      job: JOB_VAGRANT,
      headMesh: look.headMesh,
      bankPin: Number(pin.value),
    });
  });
  cancel.addEventListener('click', onCancel);
  shown();
  return {
    element: form,
    look: () => ({ ...look }),
    idle() {
      ok.disabled = false;
      cancel.disabled = false;
    },
  };
}
