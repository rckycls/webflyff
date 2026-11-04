// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { ChatWindow } from '../src/world/hud/chatWindow';
import { suggest } from '../src/world/hud/chatCommands';

it('validates sending, isolates typing and retains a bounded, safe transcript', () => {
  const send = vi.fn(), focus = vi.fn(), worldKey = vi.fn();
  const chat = new ChatWindow(send, focus); document.body.append(chat.element);
  window.addEventListener('keydown', worldKey);
  chat.open(); expect(focus).toHaveBeenCalled();
  const input = chat.element.querySelector<HTMLInputElement>('[name="message"]')!;
  expect(input.hasAttribute('placeholder')).toBe(false);
  input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
  expect(worldKey).not.toHaveBeenCalled();
  const form = chat.element.querySelector('form')!;
  form.dispatchEvent(new Event('submit', { cancelable: true })); expect(send).not.toHaveBeenCalled();
  input.value = 'hello'; form.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(send).toHaveBeenCalledWith('nearby', 'hello', '');
  expect(chat.element.querySelector('[role="log"]')!.children).toHaveLength(0); // wait for server echo
  for (let i = 0; i < 151; i++) chat.append('nearby', 'Rocky', `<img onerror=bad>${i}`);
  expect(chat.element.querySelector('[role="log"]')!.children).toHaveLength(150);
  expect(chat.element.querySelector('img')).toBeNull();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(chat.typing).toBe(false);
  window.removeEventListener('keydown', worldKey); chat.dispose();
});

it('isolates channel views and includes announcements in System and Chat', () => {
  const chat = new ChatWindow(vi.fn(), vi.fn()); document.body.append(chat.element);
  chat.append('nearby', 'Player', 'local'); chat.append('whisper', 'Friend', 'private');
  chat.append('party', 'Party', 'party'); chat.append('guild', 'Guild', 'guild');
  chat.append('system', 'GM', 'notice'); chat.append('announcement', '', 'event');
  const visible = () => [...chat.element.querySelectorAll<HTMLElement>('[data-channel]')].filter(line => !line.hidden).map(line => line.dataset.channel);
  const select = (view: string) => chat.element.querySelector<HTMLButtonElement>('[data-view="' + view + '"]')!.click();
  select('whisper'); expect(visible()).toEqual(['whisper']);
  expect(chat.element.querySelector('select')).toBeNull();
  select('party'); expect(visible()).toEqual(['party']);
  select('guild'); expect(visible()).toEqual(['guild']);
  select('system'); expect(visible()).toEqual(['system', 'announcement']);
  select('announcement'); expect(visible()).toEqual(['announcement']);
  select('all'); expect(visible()).toHaveLength(6);
  const lock = [...chat.element.querySelectorAll('button')].find(button => button.textContent === 'Lock')!;
  lock.click(); expect(lock.getAttribute('aria-pressed')).toBe('true');
  chat.dispose();
});

it('passes native slash aliases unchanged without channel or recipient controls', () => {
  const send = vi.fn(); const chat = new ChatWindow(send, vi.fn()); document.body.append(chat.element);
  expect(chat.element.querySelector('select, [name=recipient]')).toBeNull();
  const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
  for (const command of ['/s hello', '/shout hello', '/w Rocky hi', '/whisper Rocky hi', '/p hello', '/partychat hello', '/g hello', '/GuildChat hello']) {
    input.value = command; chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(send).toHaveBeenLastCalledWith('nearby', command, '');
  }
  chat.dispose();
});

it('opens mobile chat without focusing the input and blurs it after sending', () => {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  const chat = new ChatWindow(vi.fn(), vi.fn()); document.body.append(chat.element);
  try {
    chat.open(); const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
    expect(document.activeElement).not.toBe(input);
    input.focus(); input.value = 'hello';
    expect(chat.element.dataset.expanded).toBe('true');
    chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.activeElement).not.toBe(input);
    expect(chat.element.dataset.expanded).toBeUndefined();
    input.focus();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.activeElement).not.toBe(input);
    expect(chat.element.dataset.expanded).toBeUndefined();
  } finally { chat.dispose(); window.matchMedia = original; }
});

it('in a party, the Party view sends to the party; out of one, it sends nearby', () => {
  const send = vi.fn(); const chat = new ChatWindow(send, vi.fn()); document.body.append(chat.element);
  const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
  const submit = (text: string) => { input.value = text; chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); };
  chat.element.querySelector<HTMLButtonElement>('[data-view="party"]')!.click();
  submit('out of one'); expect(send).toHaveBeenLastCalledWith('nearby', 'out of one', '');
  chat.setParty(true);
  submit('hello team'); expect(send).toHaveBeenLastCalledWith('party', 'hello team', '');
  // a typed command still goes as typed
  submit('/s hi all'); expect(send).toHaveBeenLastCalledWith('nearby', '/s hi all', '');
  chat.element.querySelector<HTMLButtonElement>('[data-view="all"]')!.click();
  submit('everyone'); expect(send).toHaveBeenLastCalledWith('nearby', 'everyone', '');
  chat.element.querySelector<HTMLButtonElement>('[data-view="party"]')!.click();
  chat.setParty(false);
  submit('left'); expect(send).toHaveBeenLastCalledWith('nearby', 'left', '');
  chat.dispose();
});

it('Arrow Up brings back the lines sent before, newest first, and Arrow Down goes the other way (2026-11-05)', () => {
  // CWndChat keeps the last 20 lines sent (MAX_HISTORY_STRING, WndCommunication.cpp:15, :822-828) and EN_UP recalls them (:741-755)
  const send = vi.fn();
  const chat = new ChatWindow(send, vi.fn()); document.body.append(chat.element);
  chat.open();
  const input = chat.element.querySelector<HTMLInputElement>('[name="message"]')!;
  const form = chat.element.querySelector('form')!;
  const say = (text: string) => { input.value = text; form.dispatchEvent(new Event('submit', { cancelable: true })); };
  const key = (name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };
  key('ArrowUp'); expect(input.value).toBe('');
  say('one'); say('two'); say('three');
  expect(key('ArrowUp')).toBe(true); expect(input.value).toBe('three');
  key('ArrowUp'); expect(input.value).toBe('two');
  key('ArrowUp'); expect(input.value).toBe('one');
  key('ArrowUp'); expect(input.value).toBe('one');
  expect(key('ArrowDown')).toBe(true); expect(input.value).toBe('two');
  key('ArrowDown'); expect(input.value).toBe('three');
  key('ArrowDown'); expect(input.value).toBe('');
  // a line being typed comes back after the newest
  input.value = 'draft'; key('ArrowUp'); expect(input.value).toBe('three');
  key('ArrowDown'); expect(input.value).toBe('draft');
  // the same line twice in a row is kept once; only 20 are kept
  say('three');
  for (let i = 0; i < 25; i++) say(`line ${i}`);
  for (let i = 0; i < 30; i++) key('ArrowUp');
  expect(input.value).toBe('line 5');
  chat.dispose();
});

// 2026-11-05: "/" typed lists the commands the account may use (FuncTextCmd.cpp's table), the GM ones for a GM only
const COMMANDS = [
  { names: ['shout', 's'], usage: '[text]', help: 'Shout', auth: 'F'.charCodeAt(0) },
  { names: ['say', 'w'], usage: '[name] [text]', help: 'Whisper', auth: 'F'.charCodeAt(0) },
  { names: ['summon', 'su'], usage: '[name]', help: 'Summon a player', auth: 'L'.charCodeAt(0) },
  { names: ['shutdown'], usage: '', help: 'Stop the server', auth: 'P'.charCodeAt(0) },
];

it('suggests the commands a "/" starts, by long or short name, and only those the account may use', () => {
  expect(suggest('hello', 70, COMMANDS)).toEqual({ typing: false, rows: [] });
  expect(suggest('/', 70, COMMANDS).rows.map((r) => r.name)).toEqual(['shout', 'say']);
  expect(suggest('/S', 70, COMMANDS).rows.map((r) => r.name)).toEqual(['shout', 'say']);
  expect(suggest('/w', 70, COMMANDS).rows.map((r) => r.name)).toEqual(['w']);
  // a game master ('L') sees the GM's, not the administrator's; a VIP ('1') ranks with the players (authorization.h:58-82)
  expect(suggest('/s', 'L'.charCodeAt(0), COMMANDS).rows.map((r) => r.name)).toEqual(['shout', 'say', 'summon']);
  expect(suggest('/s', 'P'.charCodeAt(0), COMMANDS).rows.map((r) => r.name)).toEqual(['shout', 'say', 'summon', 'shutdown']);
  expect(suggest('/', '1'.charCodeAt(0), COMMANDS).rows.map((r) => r.name)).toEqual(['shout', 'say']);
  // after the name, its usage alone
  expect(suggest('/su Rocky', 'L'.charCodeAt(0), COMMANDS)).toMatchObject({ typing: false, rows: [{ name: 'su' }] });
});

it('shows the suggestions over the line; the arrows walk them, Tab takes one, Escape hides them', () => {
  const send = vi.fn();
  const chat = new ChatWindow(send, vi.fn(), document, COMMANDS); document.body.append(chat.element);
  const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
  const list = chat.element.querySelector<HTMLElement>('.chat-suggestions')!;
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };
  const key = (key: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const names = () => [...list.querySelectorAll<HTMLElement>('.chat-suggestion')].map((row) => row.dataset.command);
  type('/s');
  expect(list.hidden).toBe(false);
  expect(names()).toEqual(['shout', 'say']);
  expect(list.querySelector('.chat-suggestion-gm')).toBeNull();
  chat.setAuthorization('L'.charCodeAt(0));
  expect(names()).toEqual(['shout', 'say', 'summon']);
  expect(list.querySelector('[data-command="summon"] .chat-suggestion-gm')!.textContent).toBe('GM');
  key('ArrowDown'); key('ArrowDown');
  expect(list.querySelector('[aria-selected="true"]')!.getAttribute('data-command')).toBe('say');
  key('Tab');
  expect(input.value).toBe('/say ');
  // the usage stays shown while the words are typed
  expect(list.hidden).toBe(false);
  expect(list.textContent).toContain('/say [name] [text]');
  type('/su');
  key('Escape');
  expect(list.hidden).toBe(true);
  expect(chat.typing).toBe(true);
  // Enter with no row walked to sends the line as typed
  type('/s hi');
  chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(send).toHaveBeenLastCalledWith('nearby', '/s hi', '');
  expect(list.hidden).toBe(true);
  chat.dispose();
});
