// @vitest-environment jsdom
// 2026-11-10: the Messenger's windows joined to the friend list and the session (friends/friendHud.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { FriendHud } from '../src/world/friends/friendHud';
import type { FriendHudScreen, FriendHudSession } from '../src/world/friends/friendHud';
import { DEFAULT_OPTIONS, FRS, Messenger } from '../src/world/friends/messenger';
import type { FriendOptions } from '../src/world/friends/messenger';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const OWN = 500;
const texts: Texts = new Map([
  ['TID_DIAG_0071', { text: '%s wants to be your friend. Do you accept?', color: 0xffffffff, textId: 1 }],
  ['TID_GAME_MSGINVATE', { text: 'You have asked for permission to add %s to your messenger.', color: 0xff00ffff, textId: 2 }],
  ['TID_DIAG_0056', { text: 'You cannot add yourself to your list.', color: 0xffffffff, textId: 3 }],
  ['TID_DIAG_0051', { text: 'That player is already in your friends list.', color: 0xffffffff, textId: 4 }],
  ['TID_GAME_NOTLOGIN', { text: 'That player is not connected.', color: 0xffffffff, textId: 5 }],
  ['TID_GAME_LOGIN', { text: 'has logged into the game.', color: 0xffccffcc, textId: 6 }],
  ['TID_GAME_WHISPERREFUSE', { text: 'Whisper refused.', color: 0xffff0000, textId: 7 }],
  ['TID_FRS_ONLINE_STATUS', { text: 'Online', color: 0xffffffff, textId: 8 }],
  ['TID_GAME_MSGBLOCKCHR', { text: 'Failure to send message, %s is blocked.', color: 0xffffffff, textId: 9 }],
]) as unknown as Texts;

let sent: Array<[string, ...unknown[]]>;
let lines: Array<[string, number]>;
let messenger: Messenger;
let options: FriendOptions;
let now = 0;
const made: FriendHud[] = [];

function hud(): FriendHud {
  const record = (name: string) => (...args: unknown[]) => { sent.push([name, ...args]); };
  const session: FriendHudSession = {
    sendAddFriend: record('addFriend'), sendAddFriendRequest: record('addFriendRequest'), sendAddFriendNameRequest: record('addFriendName'),
    sendFriendCancel: record('friendCancel'), sendGetFriendState: record('getFriendState'), sendSetFriendState: record('setFriendState'),
    sendFriendIntercept: record('intercept'), sendRemoveFriend: record('removeFriend'), sendFriendBlock: record('block'),
    sendChatLine: record('chat'),
  };
  const screen: FriendHudScreen = {
    session, say: (text, color) => { lines.push([text, color]); }, ownName: () => 'Webby', ownPlayerId: () => OWN, worldId: () => 1,
    gameMaster: () => false, inParty: () => false, invite: record('invite'),
    playerData: (id) => ({ name: id === 7 ? 'Lead' : `P${id}`, job: 6, level: 60, sex: 0, version: 1, login: 1 }),
    jobName: () => 'Knight', serverName: () => 'Bakbak', channelName: () => 'Channel 1', now: () => now, ring: vi.fn(),
    saveOptions: vi.fn(),
  };
  const hudMade = new FriendHud(art, texts, screen, messenger, options);
  document.body.append(...hudMade.elements);
  made.push(hudMade);
  return hudMade;
}

beforeEach(() => {
  sent = [];
  lines = [];
  messenger = new Messenger();
  options = { ...DEFAULT_OPTIONS };
  now = 0;
});
afterEach(() => {
  // a box left open holds the keys (ModalBackdrop): each test's windows go
  for (const h of made.splice(0)) h.dispose();
  document.body.replaceChildren();
});

describe('FriendHud', () => {
  it('asks with the Confirm; Yes sends ADDFRIEND with the asker; /mr and an open Confirm refuse with BLOCK', () => {
    const h = hud();
    const request = { type: 'friendRequest', askerId: 7, sex: 1, job: 6, name: 'Lead' } as const;
    h.handle([{ kind: 'requested', request }]);
    expect(h.confirm.isOpen).toBe(true);
    expect(document.querySelector('.hud-friend-confirm-text')?.textContent).toBe('Lead wants to be your friend. Do you accept?');
    h.handle([{ kind: 'requested', request: { ...request, askerId: 8, name: 'Other' } }]);
    expect(sent).toEqual([['block', 6, 'Other']]);
    (document.querySelector('.hud-friend-confirm [data-button="yes"]') as HTMLButtonElement).click();
    expect(sent.at(-1)).toEqual(['addFriend', 7, 1, 6]);
    expect(h.confirm.isOpen).toBe(false);
    h.clientCommand('messengerrefuse');
    h.handle([{ kind: 'requested', request }]);
    expect(sent.at(-1)).toEqual(['block', 2, 'Lead']);
  });

  it('adds by name with the checks, and from the player menu', () => {
    const h = hud();
    h.addWindow.open();
    h.addWindow.edit.value = 'Webby';
    (document.querySelector('.hud-add-friend [data-button="ok"]') as HTMLButtonElement).click();
    expect(sent).toEqual([]);
    expect(h.addWindow.edit.value).toBe('');
    expect(h.messageBox.frame.isOpen).toBe(true);
    h.addWindow.edit.value = 'Lead';
    (document.querySelector('.hud-add-friend [data-button="ok"]') as HTMLButtonElement).click();
    expect(sent).toEqual([['addFriendName', 'Lead']]);
    expect(lines.at(-1)).toEqual(['You have asked for permission to add Lead to your messenger.', 0xff00ffff]);
    expect(h.addWindow.frame.isOpen).toBe(false);
    messenger.apply({ type: 'friendList', state: 0, friends: [{ playerId: 7, blocked: false, state: 0 }] }, OWN);
    h.addFromMenu(7, 'Lead');
    expect(sent.length).toBe(1);
    h.addFromMenu(9, 'Nine');
    expect(sent.at(-1)).toEqual(['addFriendRequest', 9]);
  });

  it('shows the list and runs its menu and double click', () => {
    const h = hud();
    messenger.apply({ type: 'friendList', state: 0, friends: [{ playerId: 7, blocked: false, state: FRS.ONLINE }, { playerId: 9, blocked: false, state: FRS.OFFLINE }] }, OWN);
    h.toggle();
    expect(sent).toEqual([['getFriendState']]);
    h.update();
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-messenger-row')];
    expect(rows.map((row) => row.querySelector('[data-column="name"]')?.textContent)).toEqual(['Lead', 'P9']);
    expect(rows[0]!.querySelector('[data-part="state"]')?.getAttribute('data-frame')).toBe('7');
    expect(rows[1]!.querySelector('[data-part="state"]')?.getAttribute('data-frame')).toBe('13');
    expect(rows[1]!.querySelector('[data-part="channel"]')).toBeNull();
    expect(document.querySelector('[data-own="state"]')?.textContent).toBe('(Online)');
    rows[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(h.messages.get('Lead')?.frame.isOpen).toBe(true);
    rows[1]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(lines.at(-1)?.[0]).toBe('That player is not connected.');
    rows[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const entries = [...document.querySelectorAll<HTMLButtonElement>('.hud-friend-menu [data-menu-entry]')];
    expect(entries.map((entry) => entry.dataset.menuEntry)).toEqual(['0', '1', '2', '4', '8']);
    entries.find((entry) => entry.dataset.menuEntry === '1')!.click();
    expect(sent.at(-1)).toEqual(['intercept', 7]);
  });

  it('sends the Message window\'s line as /say, and follows OnSay', () => {
    const h = hud();
    const window = h.openMessage('Lead');
    window.edit.value = 'hi there';
    window.edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(sent).toEqual([['chat', '/say "Lead" hi there']]);
    h.onSay({ type: 'say', sender: 'Webby', recipient: 'Lead', text: 'hi there', fromId: OWN, toId: 7, search: 0 });
    expect(window.lines).toEqual(['Webby :', '  hi there']);
    // another's line with the window closed: an instant message and a yellow chat line
    h.onSay({ type: 'say', sender: 'Rocky', recipient: 'Webby', text: 'yo', fromId: 9, toId: OWN, search: 0 });
    expect(h.instants.get('Rocky')?.lines).toEqual(['Rocky :', '  yo']);
    expect(lines.at(-1)).toEqual(['[Rocky] yo', 0xffffff00]);
    // a press on it: the Message window with the line, and it goes
    (document.querySelector('.hud-instant-message .hud-instant-text') as HTMLElement).click();
    expect(h.messages.get('Rocky')?.lines).toEqual(['Rocky :', '  yo']);
    expect(h.instants.has('Rocky')).toBe(false);
    // it goes by itself 10 s after its last line
    h.onSay({ type: 'say', sender: 'Zed', recipient: 'Webby', text: 'a', fromId: 10, toId: OWN, search: 0 });
    now = 10_000;
    h.update();
    expect(h.instants.has('Zed')).toBe(false);
    // /wr: BLOCK 1, nothing shown; not connected: the line
    h.clientCommand('whisperrefuse');
    expect(lines.at(-1)).toEqual(['Whisper refused.', 0xffff0000]);
    h.onSay({ type: 'say', sender: 'Rocky', recipient: 'Webby', text: 'again', fromId: 9, toId: OWN, search: 0 });
    expect(sent.at(-1)).toEqual(['block', 1, 'Rocky']);
    h.onSay({ type: 'say', sender: '', recipient: '', text: '', fromId: OWN, toId: 9, search: 1 });
    expect(lines.at(-1)?.[0]).toBe('That player is not connected.');
  });

  it("drops a blocked friend's whisper and says why for one's own", () => {
    const h = hud();
    messenger.apply({ type: 'friendList', state: 0, friends: [{ playerId: 7, blocked: true, state: 0 }] }, OWN);
    const whisper = { type: 'whisper', sender: 'Lead', recipient: 'Webby', text: 'x', fromId: 7, toId: OWN, search: 0 } as const;
    expect(h.dropWhisper(whisper)).toBe(true);
    expect(h.dropWhisper({ ...whisper, sender: 'Webby', recipient: 'Lead', fromId: OWN, toId: 7 })).toBe(true);
    expect(lines.at(-1)?.[0]).toBe('Failure to send message, Lead is blocked.');
    expect(h.dropWhisper({ ...whisper, fromId: 8 })).toBe(false);
  });

  it('shows a friend log-in with /ca on, and brings auto-absent back online on input', () => {
    const h = hud();
    messenger.apply({ type: 'friendList', state: FRS.AUTOABSENT, friends: [{ playerId: 7, blocked: false, state: 1 }] }, OWN);
    h.handle(messenger.apply({ type: 'friendJoin', playerId: 7, state: 0, channel: 1 }, OWN));
    expect(h.instants.get('Lead')?.lines).toEqual(['Leadhas logged into the game.']);
    h.input();
    expect(sent.at(-1)).toEqual(['setFriendState', FRS.ONLINE]);
    h.input();
    expect(sent.filter(([name]) => name === 'setFriendState').length).toBe(1);
  });
});
