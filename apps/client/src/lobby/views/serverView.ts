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

interface ChannelButton {
  button: HTMLElement;
  /** Whether the channel itself (offline, full) rules it out, whatever the screen is doing. */
  unavailable: boolean;
}

function channelButton(channel: ServerEntry, pick: (channel: ServerEntry) => void): ChannelButton {
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
    if (reason === undefined) pick(channel);
  });
  return { button, unavailable: reason !== undefined };
}

export function serverView({ servers, onSelect, onLogout }: ServerViewOptions): View {
  const buttons: ChannelButton[] = [];
  let busy = false;
  // One channel at a time: while the characters of the picked one are awaited, the others do nothing, so a double tap
  // cannot open a second connection. `idle` (an error came back) makes the open ones pickable again.
  const setBusy = (value: boolean): void => {
    busy = value;
    for (const { button, unavailable } of buttons) {
      if (value || unavailable) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  };
  const pick = (channel: ServerEntry): void => {
    if (busy) return;
    setBusy(true);
    onSelect(channel);
  };
  const sections = servers
    .filter((server) => server.parent === NULL_ID)
    .map((server) => {
      const channels = servers.filter((entry) => entry.parent === server.id);
      const items = channels.map((channel) => channelButton(channel, pick));
      buttons.push(...items);
      return h(
        'section',
        { class: 'server' },
        h('h3', {}, server.name),
        channels.length === 0
          ? h('p', { class: 'hint' }, 'No channels.')
          : h('ul', { class: 'list' }, ...items.map(({ button }) => h('li', {}, button))),
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
  return {
    element,
    idle() {
      setBusy(false);
    },
  };
}
