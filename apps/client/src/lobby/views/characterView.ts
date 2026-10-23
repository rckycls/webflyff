import { MAX_CHARACTER_SLOTS } from '@flyffweb/protocol';
import type { CharacterSummary } from '@flyffweb/protocol';
import { h } from './dom';
import type { View } from './dom';

export interface CharacterViewOptions {
  characters: CharacterSummary[];
  /** The player picked an empty slot. */
  onCreate(slot: number): void;
  /** The player pressed Enter on a character. */
  onEnter(character: CharacterSummary): void;
  onDelete(character: CharacterSummary): void;
  onChangeChannel(): void;
  onLogout(): void;
}

function slotItem(slot: number, character: CharacterSummary | undefined, options: CharacterViewOptions): HTMLElement {
  const label = h('span', { class: 'slot-number' }, `Slot ${slot + 1}`);
  if (character === undefined) {
    const create = h('button', { type: 'button', class: 'btn slot-create' }, 'Empty — Create');
    create.addEventListener('click', () => options.onCreate(slot));
    return h('li', { class: 'slot' }, label, create);
  }
  const enter = h('button', { type: 'button', class: 'btn primary slot-enter', 'aria-label': `Enter ${character.name}` }, 'Enter');
  enter.addEventListener('click', () => options.onEnter(character));
  const remove = h('button', { type: 'button', class: 'btn danger-outline', 'aria-label': `Delete ${character.name}` }, 'Delete');
  remove.addEventListener('click', () => options.onDelete(character));
  return h(
    'li',
    { class: 'slot' },
    label,
    h(
      'div',
      { class: 'slot-row' },
      h('div', { class: 'slot-info' }, h('strong', { class: 'slot-name' }, character.name), h('span', {}, `Level ${character.level} · Job ${character.job}`)),
      remove,
    ),
    enter,
  );
}

/** The account's characters, as the 3 slots the game has; a slot is either a character or an invitation to create one. */
export function characterView(options: CharacterViewOptions): View {
  const slots = Array.from({ length: MAX_CHARACTER_SLOTS }, (_, slot) =>
    slotItem(slot, options.characters.find((c) => c.slot === slot), options));
  const channel = h('button', { type: 'button', class: 'btn' }, 'Change channel');
  const logout = h('button', { type: 'button', class: 'btn' }, 'Log out');
  channel.addEventListener('click', options.onChangeChannel);
  logout.addEventListener('click', options.onLogout);
  const element = h(
    'section',
    { class: 'screen' },
    h('h2', { tabindex: '-1' }, 'Your characters'),
    h('ul', { class: 'list' }, ...slots),
    h('div', { class: 'actions' }, channel, logout),
  );
  return { element };
}
