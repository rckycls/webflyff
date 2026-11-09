// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { ChatWindow } from '../src/world/hud/chatWindow';
import { lineAction, suggest } from '../src/world/hud/chatCommands';
import { CHAT_COMMANDS } from '../src/world/hud/chatCommandTable';

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

it('sends the commands as Neuz does: shout, party and guild chat as /s, /p, /g; a whisper as typed (2026-11-09)', () => {
  const send = vi.fn(), clock = { now: 0 };
  const chat = new ChatWindow(send, vi.fn(), document, CHAT_COMMANDS, () => clock.now); document.body.append(chat.element);
  chat.setParty(true);
  expect(chat.element.querySelector('select, [name=recipient]')).toBeNull();
  const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
  for (const [typed, sent] of [['/s hello', '/s hello'], ['/shout hi', '/s hi'], ['/w Rocky hi', '/w Rocky hi'],
    ['/whisper Rocky hi', '/whisper Rocky hi'], ['/p hello', '/p hello'], ['/partychat hi', '/p hi'], ['/g hello', '/g hello'],
    ['/GuildChat hi', '/g hi']]) {
    clock.now += 5000;
    input.value = typed!; chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(send).toHaveBeenLastCalledWith('nearby', sent, '');
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

it('in a party, the Party view sends to the party ("/p "); out of one, it sends nearby', () => {
  const send = vi.fn(), clock = { now: 0 };
  const chat = new ChatWindow(send, vi.fn(), document, CHAT_COMMANDS, () => clock.now); document.body.append(chat.element);
  const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
  const submit = (text: string) => {
    clock.now += 5000;
    input.value = text; chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  };
  chat.element.querySelector<HTMLButtonElement>('[data-view="party"]')!.click();
  submit('out of one'); expect(send).toHaveBeenLastCalledWith('nearby', 'out of one', '');
  chat.setParty(true);
  submit('hello team'); expect(send).toHaveBeenLastCalledWith('nearby', '/p hello team', '');
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
  { names: ['shout', 's'], usage: '<text>', help: 'Shout', auth: 'F'.charCodeAt(0), route: 'both' as const },
  { names: ['say', 'say'], usage: '<name> <text>', help: 'Whisper', auth: 'F'.charCodeAt(0), route: 'server' as const },
  { names: ['position', 'pos'], usage: '', help: 'Show your position', auth: 'F'.charCodeAt(0), route: 'client' as const },
  { names: ['summon', 'su'], usage: '<name>', help: 'Summon a player', auth: 'L'.charCodeAt(0), route: 'server' as const },
  { names: ['getgold', 'gg'], usage: '<amount>', help: 'Get Penya', auth: 'P'.charCodeAt(0), route: 'server' as const },
];

it('lists every command the account may use by its long name, sorted, the typed one highlighted (CWndCommand)', () => {
  expect(suggest('hello', 70, COMMANDS)).toEqual({ typing: false, rows: [], selected: -1 });
  const player = suggest('/', 70, COMMANDS);
  expect(player.rows.map((r) => r.name)).toEqual(['position', 'say', 'shout']);
  expect(player.selected).toBe(-1);
  expect(suggest('/sh', 70, COMMANDS).selected).toBe(2);
  // a game master ('L') sees the GM's, not the administrator's; a VIP ('1') ranks with the players (authorization.h:58-82)
  expect(suggest('/', 'L'.charCodeAt(0), COMMANDS).rows.map((r) => r.name)).toEqual(['position', 'say', 'shout', 'summon']);
  expect(suggest('/', 'P'.charCodeAt(0), COMMANDS).rows.map((r) => r.name)).toEqual(['getgold', 'position', 'say', 'shout', 'summon']);
  expect(suggest('/', '1'.charCodeAt(0), COMMANDS).rows.map((r) => r.name)).toEqual(['position', 'say', 'shout']);
  // after the name, its usage alone
  expect(suggest('/su Rocky', 'L'.charCodeAt(0), COMMANDS)).toMatchObject({ typing: false, rows: [{ name: 'su' }] });
});

it('a line as ParsingCommand takes it: sent, run here (TCM_CLIENT), or dropped (unknown, refused); an emoticon is sent', () => {
  const emoticons = ['laugh', 'cat face'];
  expect(lineAction('hello', 70, COMMANDS, emoticons)).toEqual({ kind: 'send' });
  expect(lineAction('/s hi', 70, COMMANDS, emoticons)).toEqual({ kind: 'send' });
  expect(lineAction('/pos', 70, COMMANDS, emoticons)).toEqual({ kind: 'client', command: 'position', args: '', line: '/pos' });
  expect(lineAction('/su Bob', 70, COMMANDS, emoticons)).toEqual({ kind: 'drop' });
  expect(lineAction('/su Bob', 'L'.charCodeAt(0), COMMANDS, emoticons)).toEqual({ kind: 'send' });
  expect(lineAction('/Shout hi', 70, COMMANDS, emoticons)).toEqual({ kind: 'drop' }); // exact case, as CString's ==
  expect(lineAction('/nothing', 70, COMMANDS, emoticons)).toEqual({ kind: 'drop' });
  expect(lineAction('/Laugh', 70, COMMANDS, emoticons)).toEqual({ kind: 'send' });
  expect(lineAction('/cat face', 70, COMMANDS, emoticons)).toEqual({ kind: 'send' });
});

it('shows the list over the line; the highlight follows the typing, Enter or Tab takes it, Escape hides it', () => {
  const send = vi.fn(), local = vi.fn();
  const chat = new ChatWindow(send, vi.fn(), document, COMMANDS); document.body.append(chat.element);
  chat.onClientCommand = local;
  const input = chat.element.querySelector<HTMLInputElement>('[name=message]')!;
  const list = chat.element.querySelector<HTMLElement>('.chat-suggestions')!;
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };
  const key = (key: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const names = () => [...list.querySelectorAll<HTMLElement>('.chat-suggestion')].map((row) => row.dataset.command);
  const submit = () => chat.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  type('/');
  expect(list.hidden).toBe(false);
  expect(names()).toEqual(['position', 'say', 'shout']);
  expect(list.querySelector('.chat-suggestion-gm')).toBeNull();
  chat.setAuthorization('L'.charCodeAt(0));
  expect(names()).toEqual(['position', 'say', 'shout', 'summon']);
  expect(list.querySelector('[data-command="summon"] .chat-suggestion-gm')!.textContent).toBe('GM');
  type('/sa');
  expect(list.querySelector('[aria-selected="true"]')!.getAttribute('data-command')).toBe('say');
  key('ArrowDown');
  expect(list.querySelector('[aria-selected="true"]')!.getAttribute('data-command')).toBe('shout');
  key('Enter');
  expect(input.value).toBe('/shout ');
  expect(send).not.toHaveBeenCalled();
  // the usage stays shown while the words are typed
  expect(list.textContent).toContain('/shout <text>');
  type('/su');
  key('Escape');
  expect(list.hidden).toBe(true);
  type('/s hi');
  submit();
  expect(send).toHaveBeenLastCalledWith('nearby', '/s hi', '');
  type('/pos');
  submit();
  expect(local).toHaveBeenCalledWith('position', '', '/pos');
  type('/unknown');
  submit();
  expect(send).toHaveBeenCalledTimes(1);
  chat.dispose();
});
