// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { ChatWindow } from '../src/world/hud/chatWindow';

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
