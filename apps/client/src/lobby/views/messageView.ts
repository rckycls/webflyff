import { ServerError, errorText } from '../errorText';
import { h } from './dom';
import type { View } from './dom';

/** A message for the player. `role="alert"` makes a screen reader read it out as soon as it appears. */
export function alertElement(message: string): HTMLElement {
  return h('p', { class: 'alert', role: 'alert' }, message);
}

export interface AlreadyConnectedOptions {
  /** The player agrees to close the other session. */
  onDisconnect(): void;
  onCancel(): void;
}

/** The account is logged in somewhere else (error 103): the server's own question, with the two answers. */
export function alreadyConnectedView({ onDisconnect, onCancel }: AlreadyConnectedOptions): View {
  const disconnect = h('button', { type: 'button', class: 'btn primary' }, 'Disconnect it');
  const cancel = h('button', { type: 'button', class: 'btn' }, 'Cancel');
  disconnect.addEventListener('click', onDisconnect);
  cancel.addEventListener('click', onCancel);
  const element = h(
    'section',
    { class: 'screen' },
    h('h2', { tabindex: '-1' }, 'Already connected'),
    alertElement(errorText(ServerError.DUPLICATE_ACCOUNT)),
    h('div', { class: 'actions' }, disconnect, cancel),
  );
  return { element };
}
