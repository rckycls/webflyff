// The Select Character window as V15 draws it (docs/superpowers/specs/2026-11-12-char-select-create-research.md §2):
// APP_SELECT_CHAR, 544 x 368, the picture WndSelectChar.tga; three slots of 158 x 238 at (16, 16), (186, 16) and (356, 16)
// in the client area (CWndSelectChar::OnInitialUpdate, _Interface/WndTitle.cpp:1892-1898), the selected one with a faint
// green fill and its name in blue, the others' names grey, "Available" for an empty slot (OnDraw, :1545-1810); Back,
// Create, Delete and Accept along the bottom (resdata.inc:24779-24798), enabled by the selection; Left and Right move the
// selection (OnKeyUp, :1386-1410); a character's stats in a tooltip (CWndMgr::PutToolTip_Character). The 3D characters
// are drawn into each slot's `.cs-portrait` by `lobbyPortraits.ts`.

import { MAX_CHARACTER_SLOTS } from '@flyffweb/protocol';
import type { CharacterSummary } from '@flyffweb/protocol';
import { EMPTY_SLOT_TEXT, characterTip, isBlocked, selectButtons, stepSelection } from '../selectRules';
import type { TipLine } from '../selectRules';
import { h } from './dom';
import type { View } from './dom';

export interface CharacterViewOptions {
  characters: CharacterSummary[];
  /** The slot selected as the window opens (`m_nSelectCharacter`, kept between visits; `settleSelection`). */
  selected: number;
  /** The job's name for the tooltip (`prj.m_aJob[ nJob ].szName`), empty while the game data is not loaded. */
  jobTitle?: (job: number) => string;
  /** The selection moved, to `slot`: its character, or undefined for an empty slot (and once as the window opens). */
  onSelect?: (slot: number, character: CharacterSummary | undefined) => void;
  /** A blocked character was clicked or accepted (`CWndCharBlockBox`). */
  onBlocked?: (character: CharacterSummary) => void;
  /** Create, on an empty slot. */
  onCreate(slot: number): void;
  /** Accept, on a character. */
  onEnter(character: CharacterSummary): void;
  /** Delete, on a character. */
  onDelete(character: CharacterSummary): void;
  /** Back: Neuz drops the login server and logs in again for the server list. */
  onChangeChannel(): void;
}

/** The Select Character window, with `select` to move the selection from outside. */
export interface CharacterView extends View {
  /** The slot selected. */
  selected(): number;
  /** Selects `slot` as a click would (a blocked character is refused). */
  select(slot: number): void;
}

/** A sprite button of the theme (four states side by side), its words kept for a screen reader. */
function spriteButton(label: string, className: string): HTMLButtonElement {
  return h('button', { type: 'button', class: `lobby-sprite ${className}` }, label);
}

/** The tooltip's lines, as the page shows them. */
function tipLines(lines: TipLine[]): HTMLElement[] {
  return lines.map((line) => {
    const row = h('span', { class: 'cs-tip-line' }, line.text);
    if (line.color !== undefined) row.style.color = line.color;
    if (line.bold === true) row.style.fontWeight = 'bold';
    return row;
  });
}

export function characterView(options: CharacterViewOptions): CharacterView {
  const jobTitle = options.jobTitle ?? (() => '');
  const characterIn = (slot: number): CharacterSummary | undefined => options.characters.find((c) => c.slot === slot);
  let selected = options.selected;

  const tip = h('div', { class: 'cs-tip', 'aria-hidden': 'true', hidden: true });
  const slots = Array.from({ length: MAX_CHARACTER_SLOTS }, (_, slot) => {
    const character = characterIn(slot);
    const label = character === undefined ? `Select slot ${slot + 1}, ${EMPTY_SLOT_TEXT}` : `Select ${character.name}`;
    // what the tooltip says, for a screen reader too
    const described = character === undefined ? null
      : h('span', { class: 'visually-hidden', id: `cs-desc-${slot}` },
        characterTip(character, jobTitle(character.job)).map((l) => l.text).join(', '));
    const button = h(
      'button',
      {
        type: 'button', class: 'cs-slot', 'data-slot': slot, 'aria-label': label, 'aria-pressed': 'false',
        'aria-describedby': described === null ? null : `cs-desc-${slot}`,
        'data-blocked': character !== undefined && isBlocked(character),
      },
      h('span', { class: 'cs-fill', 'aria-hidden': 'true' }),
      h('span', { class: 'cs-portrait', 'data-slot': slot, 'aria-hidden': 'true' }),
      described,
    );
    const name = h('span', { class: 'cs-name', 'data-slot': slot, 'aria-hidden': 'true' }, character?.name ?? EMPTY_SLOT_TEXT);
    return { button, name, character };
  });

  const back = spriteButton('Back', 'cs-back');
  const create = spriteButton('Create', 'cs-create');
  const remove = spriteButton('Delete', 'cs-delete');
  const accept = spriteButton('Accept', 'cs-accept');
  const element = h(
    'section',
    { class: 'screen select-char', 'aria-labelledby': 'cs-title' },
    h('h2', { tabindex: '-1', id: 'cs-title' }, 'Select Character'),
    h('div', { class: 'cs-slots' }, ...slots.flatMap((s) => [s.button, s.name])),
    h('div', { class: 'cs-buttons' }, back, create, remove, accept),
    tip,
  );

  const refresh = (): void => {
    for (const [slot, { button, name }] of slots.entries()) {
      const on = slot === selected;
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('selected', on);
      name.classList.toggle('selected', on);
    }
    const character = characterIn(selected);
    const enabled = selectButtons(character);
    create.disabled = !enabled.create;
    remove.disabled = !enabled.delete;
    accept.disabled = !enabled.accept;
    // the buttons say which character or slot they act on
    remove.setAttribute('aria-label', character === undefined ? 'Delete' : `Delete ${character.name}`);
    accept.setAttribute('aria-label', character === undefined ? 'Accept' : `Enter ${character.name}`);
    create.setAttribute('aria-label', character === undefined ? `Create in slot ${selected + 1}` : 'Create');
  };

  const select = (slot: number): void => {
    const character = characterIn(slot);
    if (character !== undefined && isBlocked(character)) {
      options.onBlocked?.(character);
      return;
    }
    const changed = slot !== selected;
    selected = slot;
    refresh();
    if (changed) options.onSelect?.(slot, character);
  };

  const hideTip = (): void => { tip.hidden = true; };
  for (const [slot, { button, character }] of slots.entries()) {
    button.addEventListener('click', () => select(slot));
    if (character === undefined) continue;
    // the tooltip follows a mouse over the slot; a finger shows it while it presses (a touch screen's hover)
    const showTip = (event: PointerEvent): void => {
      tip.replaceChildren(...tipLines(characterTip(character, jobTitle(character.job))));
      tip.hidden = false;
      const box = element.getBoundingClientRect();
      const scale = box.width / element.offsetWidth || 1;
      const x = (event.clientX - box.left) / scale;
      const y = (event.clientY - box.top) / scale;
      // kept inside the window: to the pointer's left near the right edge, up near the bottom
      const left = x + 12 + tip.offsetWidth <= element.offsetWidth - 4 ? x + 12 : Math.max(4, x - tip.offsetWidth - 8);
      const top = Math.max(4, Math.min(y + 16, element.offsetHeight - tip.offsetHeight - 4));
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };
    button.addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse') showTip(event); });
    button.addEventListener('pointerleave', hideTip);
    button.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'mouse') showTip(event); });
    button.addEventListener('pointerup', (event) => { if (event.pointerType !== 'mouse') hideTip(); });
    button.addEventListener('pointercancel', hideTip);
  }

  back.addEventListener('click', options.onChangeChannel);
  create.addEventListener('click', () => {
    if (characterIn(selected) === undefined) options.onCreate(selected);
  });
  remove.addEventListener('click', () => {
    const character = characterIn(selected);
    if (character !== undefined) options.onDelete(character);
  });
  const enter = (): void => {
    const character = characterIn(selected);
    if (character === undefined) return;
    if (isBlocked(character)) {
      options.onBlocked?.(character);
      return;
    }
    // Accept disables itself (`:2074-2075`); `idle` frees it if the world could not be entered
    accept.disabled = true;
    options.onEnter(character);
  };
  accept.addEventListener('click', enter);

  // Left and Right move the selection; Enter is the default button, Accept, unless another button has the focus
  element.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      select(stepSelection(selected, event.key === 'ArrowLeft' ? -1 : 1));
      const focused = element.ownerDocument.activeElement;
      if (focused instanceof HTMLElement && focused.classList.contains('cs-slot')) slots[selected]!.button.focus();
    } else if (event.key === 'Enter') {
      const target = event.target;
      if (target instanceof HTMLButtonElement && !target.classList.contains('cs-slot')) return;
      event.preventDefault();
      if (!accept.disabled) enter();
    }
  });

  refresh();
  options.onSelect?.(selected, characterIn(selected));
  return {
    element,
    selected: () => selected,
    select,
    idle() {
      refresh();
    },
  };
}
