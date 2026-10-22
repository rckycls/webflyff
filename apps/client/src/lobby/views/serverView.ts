import { NULL_ID } from '@flyffweb/protocol';
import type { ServerEntry } from '@flyffweb/protocol';
import { h } from './dom';
import type { View } from './dom';

export interface ServerViewOptions {
  /** The server list as the certifier sent it: servers (`parent` is `NULL_ID`) and their channels. */
  servers: ServerEntry[];
  onSelect(channel: ServerEntry): void;
  onLogout(): void;
}

/** Why a channel cannot be picked, as the short text to show; `undefined` for one that can. */
function unavailableReason(channel: ServerEntry): string | undefined {
  if (channel.enabled === 0) return 'Offline';
  if (channel.maxPlayers > 0 && channel.playerCount >= channel.maxPlayers) return 'Full';
  return undefined;
}

function channelButton(channel: ServerEntry, onSelect: (channel: ServerEntry) => void): HTMLElement {
  const reason = unavailableReason(channel);
  const count = channel.maxPlayers > 0 ? `${channel.playerCount} / ${channel.maxPlayers}` : `${channel.playerCount} online`;
  // `aria-disabled`, not `disabled`: a disabled button drops out of the keyboard order and a screen reader skips it,
  // so the player would not learn why the channel is not there to pick.
  const button = h(
    'button',
    { type: 'button', class: 'btn channel', 'aria-disabled': reason === undefined ? null : 'true' },
    h('span', { class: 'channel-name' }, channel.name === '' ? `Channel ${channel.id}` : channel.name),
    h('span', { class: 'channel-state' }, reason ?? count),
  );
  button.addEventListener('click', () => {
    if (reason === undefined) onSelect(channel);
  });
  return button;
}

export function serverView({ servers, onSelect, onLogout }: ServerViewOptions): View {
  const sections = servers
    .filter((server) => server.parent === NULL_ID)
    .map((server) => {
      const channels = servers.filter((entry) => entry.parent === server.id);
      return h(
        'section',
        { class: 'server' },
        h('h3', {}, server.name),
        channels.length === 0
          ? h('p', { class: 'hint' }, 'No channels.')
          : h('ul', { class: 'list' }, ...channels.map((channel) => h('li', {}, channelButton(channel, onSelect)))),
      );
    });
  const logout = h('button', { type: 'button', class: 'btn' }, 'Log out');
  logout.addEventListener('click', onLogout);
  const element = h(
    'section',
    { class: 'screen' },
    h('h2', { tabindex: '-1' }, 'Choose a channel'),
    ...(sections.length === 0 ? [h('p', { class: 'hint' }, 'No servers are available.')] : sections),
    h('div', { class: 'actions' }, logout),
  );
  return { element };
}
