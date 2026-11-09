// @vitest-environment jsdom
// 2026-11-09: the desktop chat as Neuz V15's CWndChat (docs/superpowers/specs/2026-11-09-chat-desktop-research.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { NeuzChat } from '../src/world/hud/neuzChat';
import type { NeuzChatOptions } from '../src/world/hud/neuzChat';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

let chats: NeuzChat[] = [];
afterEach(() => { for (const chat of chats) chat.dispose(); chats = []; document.body.replaceChildren(); });

function layer(width = 1280, height = 720): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  document.body.append(element);
  return element;
}

function make(options: Partial<NeuzChatOptions> = {}): { chat: NeuzChat; send: ReturnType<typeof vi.fn>; clock: { now: number } } {
  const send = vi.fn();
  const clock = { now: 0 };
  const chat = new NeuzChat({ send, onFocus: vi.fn(), ownName: () => 'Webby', art, now: () => clock.now, ...options });
  chats.push(chat);
  const parent = layer();
  parent.append(...chat.elements);
  chat.show();
  return { chat, send, clock };
}

const $ = <T extends Element = HTMLElement>(chat: NeuzChat, selector: string): T => chat.element.querySelector<T>(selector)!;
const input = (chat: NeuzChat) => $<HTMLInputElement>(chat, 'input[aria-label="Chat message"]');
const tab = (chat: NeuzChat, view: string) => $<HTMLButtonElement>(chat, `[data-view="${view}"]`);
const lines = (chat: NeuzChat) => [...$(chat, '[role="log"]').querySelectorAll<HTMLElement>('.neuz-chat-line')].map((l) => l.textContent);
const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
const type = (chat: NeuzChat, text: string) => { input(chat).value = text; input(chat).dispatchEvent(new Event('input', { bubbles: true })); };

describe('NeuzChat: the window', () => {
  it('is the 528 x 128 window of WndTile300-311 at the bottom left, with the tabs, buttons, line and strip', () => {
    const { chat } = make();
    expect(chat.element.style.width).toBe('528px');
    expect(chat.element.style.height).toBe('128px');
    expect(chat.element.style.left).toBe('0px');
    expect(chat.element.style.top).toBe(`${720 - 128}px`);
    expect(chat.element.querySelector('.hud-window-title')).toBeNull();
    expect([...chat.element.querySelectorAll('[data-view]')].map((t) => t.getAttribute('aria-label')))
      .toEqual(['Chat', 'Whisper', 'Shout', 'Party', 'Guild']);
    expect(tab(chat, 'general').getAttribute('aria-checked')).toBe('true');
    expect(tab(chat, 'whisper').querySelector<HTMLElement>('.hud-six-frame-picture')!.style.backgroundImage).toContain('buttchatwhisper');
    for (const label of ['Lock', 'Option', 'System', 'Move lock', 'Help', 'Close']) {
      expect(chat.element.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(chat.element.querySelector('button[type="submit"]')).toBeNull();
    const strip = [...chat.element.querySelectorAll<HTMLElement>('.neuz-chat-strip > div')];
    expect(strip[0]!.style.backgroundImage).toContain('wndchatedit00_1');
    expect(strip.at(-1)!.style.left).toBe('496px');
    // OnSize: the line from 30 to 20 short of the client area's right, its bottom 18 px
    const line = $(chat, '.neuz-chat-edit');
    expect([line.style.left, line.style.top, line.style.width, line.style.height]).toEqual(['30px', '100px', '468px', '18px']);
  });

  it('Party is enabled in a party, Guild in a guild', () => {
    const { chat } = make();
    expect(tab(chat, 'party').disabled).toBe(true);
    expect(tab(chat, 'guild').disabled).toBe(true);
    chat.setParty(true); chat.setGuild(true);
    expect(tab(chat, 'party').disabled).toBe(false);
    expect(tab(chat, 'guild').disabled).toBe(false);
  });

  it('an edge dragged lays the controls out again (OnSize)', () => {
    const { chat } = make();
    chat.frame.setSize(624, 160);
    const line = $(chat, '.neuz-chat-edit');
    expect([line.style.top, line.style.width]).toEqual(['132px', '564px']);
    expect($(chat, '[aria-label="Close"]').style.left).toBe(`${614 - 15}px`);
    expect($(chat, '.neuz-chat-text').style.height).toBe(`${150 - 39}px`);
  });

  it('Close hides it; Enter shows it again where it was, the line focused (2026-11-10, the owner\'s; Neuz does nothing)', () => {
    const { chat } = make();
    $<HTMLButtonElement>(chat, '[aria-label="Close"]').click();
    expect(chat.element.hidden).toBe(true);
    chat.open();
    expect(chat.element.hidden).toBe(false);
    expect(chat.element.style.top).toBe(`${720 - 128}px`);
    expect(document.activeElement).toBe(input(chat));
    // the Start menu's Chatting does the same
    $<HTMLButtonElement>(chat, '[aria-label="Close"]').click();
    chat.open();
    expect(chat.element.hidden).toBe(false);
    expect(document.activeElement).toBe(input(chat));
  });

  it('Escape, even while typing, closes the window on top: the chat, the line given up (Neuz.cpp:1222-1231, GetWndBase)', () => {
    const { chat } = make();
    chat.open();
    expect(chat.typing).toBe(true);
    key(input(chat), 'Escape');
    expect(chat.element.hidden).toBe(true);
    expect(chat.typing).toBe(false);
  });

  it('F1 to F9 typed in the line reach the game (Neuz.cpp:1222-1223); the other keys do not', () => {
    const worldKey = vi.fn();
    window.addEventListener('keydown', worldKey);
    const { chat } = make();
    chat.open();
    key(input(chat), 'a');
    expect(worldKey).not.toHaveBeenCalled();
    key(input(chat), 'F3');
    expect(worldKey).toHaveBeenCalledTimes(1);
    expect(input(chat).dataset.fkeys).toBe('');
    window.removeEventListener('keydown', worldKey);
  });

  it('shown again in a new layer (the world entered again), it stays closed, or where it was put', () => {
    const { chat } = make();
    chat.frame.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 620, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 520, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 520, bubbles: true }));
    expect(chat.frame.position).toEqual({ x: 100, y: 492 });
    const next = layer();
    next.append(...chat.elements);
    chat.show();
    expect(chat.frame.position).toEqual({ x: 100, y: 492 });
    $<HTMLButtonElement>(chat, '[aria-label="Close"]').click();
    layer().append(...chat.elements);
    chat.show();
    expect(chat.element.hidden).toBe(true);
  });

  it('a press on its free parts goes to the world under it too; one on a control does not (CWndChat::OnLButtonDown ...)', () => {
    const forward = vi.fn();
    const { chat } = make({ forward });
    chat.put({ kind: 'general', sender: 'Rocky', text: 'hi' });
    $(chat, '.neuz-chat-line').dispatchEvent(new MouseEvent('pointerdown', { button: 2, bubbles: true }));
    $(chat, '.neuz-chat-words').dispatchEvent(new MouseEvent('pointerup', { button: 2, bubbles: true }));
    expect(forward.mock.calls.map(([event]) => event.type)).toEqual(['pointerdown', 'pointerup']);
    $(chat, '[aria-label="Lock"]').dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    input(chat).dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    expect(forward).toHaveBeenCalledTimes(2);
  });

  it('keeps Lock, the filters and its place for the next time (regInfo.dat, neuz.ini)', () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) } as Storage;
    const { chat } = make({ storage });
    $<HTMLButtonElement>(chat, '[aria-label="Lock"]').click();
    $<HTMLButtonElement>(chat, '[aria-label="Option"]').click();
    chat.filterWindow.element.querySelector<HTMLButtonElement>('[aria-label="Shout"]')!.click();
    chat.frame.element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 620, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 520, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 520, bubbles: true }));
    chat.frame.setSize(560, 160);
    chat.dispose();
    const { chat: again } = make({ storage });
    expect($(again, '[aria-label="Lock"]').getAttribute('aria-checked')).toBe('true');
    expect(again.frame.position).toEqual({ x: 100, y: 492 });
    expect(again.frame.size).toEqual({ width: 560, height: 160 });
    again.put({ kind: 'shout', sender: 'Rocky', text: 'hey' });
    expect(lines(again)).toEqual([]);
  });

  it('Help opens the Fast Help window with help.inc\'s "Chatting window" text (CWndHelpInstant)', () => {
    const { chat } = make();
    chat.setHelp({ 'Chatting window': '   It is located right above the task bar.\n\n   ' });
    $<HTMLButtonElement>(chat, '[aria-label="Help"]').click();
    const help = chat.helpWindow.frame.element;
    expect(help.hidden).toBe(false);
    expect(help.getAttribute('aria-label')).toBe('Fast Help');
    expect(help.querySelector('.hud-res-text-body')!.textContent).toContain('It is located right above the task bar.');
    help.querySelector<HTMLButtonElement>('[data-control="WIDC_CLOSE"]')!.click();
    expect(help.hidden).toBe(true);
  });

  it('the move lock keeps it still', () => {
    const { chat } = make();
    $<HTMLButtonElement>(chat, '[aria-label="Move lock"]').click();
    expect(chat.frame.movable).toBe(false);
    expect($(chat, '[aria-label="Move lock"]').getAttribute('aria-checked')).toBe('true');
  });
});

describe('NeuzChat: the line', () => {
  it('Enter on the world gives the line the focus with the tab prefix; keys typed never reach the game', () => {
    const worldKey = vi.fn();
    window.addEventListener('keydown', worldKey);
    const { chat } = make();
    tab(chat, 'shout').click();
    expect(input(chat).value).toBe('/s ');
    expect(document.activeElement).toBe(input(chat));
    input(chat).blur(); input(chat).value = '';
    chat.open();
    expect(input(chat).value).toBe('/s ');
    key(input(chat), 'w');
    expect(worldKey).not.toHaveBeenCalled();
    window.removeEventListener('keydown', worldKey);
  });

  it('Enter sends the line as typed, empties it and gives the focus back, unless Lock is on', () => {
    const { chat, send } = make();
    chat.open();
    type(chat, 'Hello Flaris');
    key(input(chat), 'Enter');
    expect(send).toHaveBeenLastCalledWith('Hello Flaris');
    expect(input(chat).value).toBe('');
    expect(chat.typing).toBe(false);
    $<HTMLButtonElement>(chat, '[aria-label="Lock"]').click();
    chat.open();
    type(chat, '/w Rocky hi');
    key(input(chat), 'Enter');
    expect(send).toHaveBeenLastCalledWith('/w Rocky hi');
    expect(chat.typing).toBe(true);
    // the Whisper tab now writes to Rocky (m_strCharName)
    input(chat).blur();
    tab(chat, 'whisper').click();
    input(chat).value = ''; input(chat).blur(); chat.open();
    expect(input(chat).value).toBe('/w Rocky ');
  });

  it('an unknown command is not sent; a client command runs here', () => {
    const { chat, send } = make();
    const ran = vi.fn();
    chat.onClientCommand = ran;
    chat.open();
    type(chat, '/nosuchthing'); key(input(chat), 'Enter');
    expect(send).not.toHaveBeenCalled();
    chat.open();
    type(chat, '/position'); key(input(chat), 'Enter');
    expect(ran).toHaveBeenCalledWith('position', '', '/position');
  });

  it('a line within 0.7 s of the last is not sent: a red line in the chat (ParsingChat); a shortcut runs as typed', () => {
    const { chat, send, clock } = make({
      text: (id) => (id === 'TID_GAME_ERROR_CHATTING_1' ? { text: 'spam!', color: 0xffff0000 } : undefined),
    });
    chat.open(); type(chat, 'one'); key(input(chat), 'Enter');
    clock.now += 100;
    chat.open(); type(chat, 'two'); key(input(chat), 'Enter');
    expect(send.mock.calls).toEqual([['one']]);
    expect(lines(chat)).toEqual(['spam!']);
    clock.now += 5000;
    chat.setFilter({ alpha: { jerk: '*' }, nonAlpha: {} });
    chat.runShortcut('hi jerk');
    expect(send).toHaveBeenLastCalledWith('hi ****');
  });

  it('"/r " becomes "/whisper <the last whisperer> "', () => {
    const { chat } = make();
    chat.put({ kind: 'whisper', sender: 'Rocky', recipient: 'Webby', text: 'psst' });
    chat.open();
    type(chat, '/r ');
    expect(input(chat).value).toBe('/whisper Rocky ');
  });

  it('the macro mark shows while the line holds words; a press on it carries the line to the task bar', () => {
    const carry = vi.fn();
    const { chat } = make({ carry });
    const macro = $(chat, '.neuz-chat-macro');
    expect(macro.dataset.full).toBeUndefined();
    macro.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    expect(carry).not.toHaveBeenCalled();
    type(chat, 'hi');
    expect(macro.dataset.full).toBe('true');
    const before = chat.frame.position;
    macro.dispatchEvent(new MouseEvent('pointerdown', { clientX: 5, clientY: 700, button: 0, bubbles: true }));
    expect(carry).toHaveBeenCalledWith('hi', expect.anything());
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 400, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, clientY: 400, bubbles: true }));
    expect(chat.frame.position).toEqual(before);
  });
});

describe('NeuzChat: the messages', () => {
  it('writes each line as Neuz does, in its colour', () => {
    const { chat } = make();
    chat.put({ kind: 'general', sender: 'Rocky', text: 'hi' });
    chat.put({ kind: 'whisper', sender: 'Webby', recipient: 'Rocky', text: 'yo' });
    chat.put({ kind: 'shout', sender: 'Rocky', text: 'hey', color: 0xffff99cc });
    expect(lines(chat)).toEqual(['Rocky : hi', '-> [Rocky] yo', '[Rocky] hey']);
    const shout = $(chat, '.neuz-chat-line:last-child');
    expect(shout.style.color).toBe('rgb(255, 153, 204)');
  });

  it('a tab shows its filter; the System window gets what it hides, but never a shout', () => {
    const { chat } = make();
    tab(chat, 'whisper').click();
    chat.put({ kind: 'general', sender: 'Rocky', text: 'hi' });
    chat.put({ kind: 'shout', sender: 'Rocky', text: 'hey' });
    chat.put({ kind: 'party', sender: 'Lead', text: 'go' });
    chat.put({ kind: 'game', text: 'You got 3 Penya' });
    expect(lines(chat)).toEqual(['Rocky : hi']);
    const system = [...chat.systemWindow.element.querySelectorAll('.neuz-chat-line')].map((l) => l.textContent);
    expect(system).toEqual(['[Lead] go', 'You got 3 Penya']);
    // a tab chosen later shows what came before
    tab(chat, 'general').click();
    expect(lines(chat)).toEqual(['Rocky : hi', '[Rocky] hey', '[Lead] go']);
  });

  it('Option opens the filter: this tab\'s checks, its own disabled; a check off hides that kind', () => {
    const { chat } = make();
    chat.put({ kind: 'shout', sender: 'Rocky', text: 'hey' });
    $<HTMLButtonElement>(chat, '[aria-label="Option"]').click();
    const filter = chat.filterWindow.element;
    expect(filter.hidden).toBe(false);
    const general = filter.querySelector<HTMLButtonElement>('[aria-label="General"]')!;
    const shout = filter.querySelector<HTMLButtonElement>('[aria-label="Shout"]')!;
    expect(general.disabled).toBe(true);
    expect(shout.getAttribute('aria-checked')).toBe('true');
    shout.click();
    expect(shout.getAttribute('aria-checked')).toBe('false');
    expect(lines(chat)).toEqual([]);
  });

  it('System shows the System window beside the chat', () => {
    const { chat } = make();
    expect(chat.systemWindow.element.hidden).toBe(true);
    $<HTMLButtonElement>(chat, '[aria-label="System"]').click();
    expect(chat.systemWindow.element.hidden).toBe(false);
    expect(chat.systemWindow.element.style.left).toBe('528px');
    expect(chat.systemWindow.element.style.top).toBe(chat.element.style.top);
  });

  it('a right-click on a line whispers its sender', () => {
    const { chat } = make();
    chat.put({ kind: 'general', sender: 'Rocky', text: 'hi' });
    const line = $(chat, '.neuz-chat-line');
    line.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    expect(input(chat).value).toBe('/whisper Rocky ');
    expect(document.activeElement).toBe(input(chat));
  });

  it('the words fade 300 s after the last use; a new line brings them back', () => {
    const { chat, clock } = make();
    chat.put({ kind: 'general', sender: 'Rocky', text: 'hi' });
    clock.now = 299_000; chat.update();
    expect($(chat, '.neuz-chat-text').dataset.faded).toBeUndefined();
    clock.now = 301_000; chat.update();
    expect($(chat, '.neuz-chat-text').dataset.faded).toBe('true');
    chat.put({ kind: 'general', sender: 'Rocky', text: 'again' });
    expect($(chat, '.neuz-chat-text').dataset.faded).toBeUndefined();
  });

  it('keeps 1000 lines, then the first 500 go', () => {
    const { chat } = make();
    for (let i = 0; i < 1000; i++) chat.put({ kind: 'game', text: `line ${i}` });
    const count = () => chat.systemWindow.element.querySelectorAll('.neuz-chat-line').length;
    expect(count()).toBe(500);
    for (let i = 0; i < 1000; i++) chat.put({ kind: 'party', sender: 'Lead', text: `${i}` });
    expect(lines(chat).length).toBeLessThan(1000);
    expect(lines(chat).at(-1)).toBe('[Lead] 999');
    // 2000 lines through jsdom: a busy machine running other test files beside it passes the default 5 s
  }, 30_000);
});
