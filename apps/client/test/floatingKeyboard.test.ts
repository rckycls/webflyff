// @vitest-environment jsdom
// 2026-11-14 (owner): the game's floating keyboard in place of the phone's (keyboard/keyboardRules.ts, floatingKeyboard.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KeyRepeat, KeyboardState, PAGES, REPEAT_DELAY, REPEAT_EVERY, backspace, digitRows, insert, placeKeyboard, rulesOf, shownText,
} from '../src/keyboard/keyboardRules';
import type { KeyAction } from '../src/keyboard/keyboardRules';
import { FloatingKeyboard, boxRules, giveBack, isTypedBox, keepAway, keyboardChoice, labelOf } from '../src/keyboard/floatingKeyboard';

const TEXT = rulesOf({ tagName: 'INPUT', type: 'text' });
const at = (value: string, caret = value.length) => ({ value, start: caret, end: caret });
const char = (c: string): KeyAction => ({ kind: 'char', char: c });

describe('the keyboard\'s rules', () => {
  it('tells a box\'s kind from the attributes its page gave it', () => {
    expect(rulesOf({ tagName: 'INPUT', type: 'text', maxLength: 16 })).toEqual({ digits: false, secret: false, multiline: false, maxLength: 16 });
    expect(rulesOf({ tagName: 'INPUT', type: 'password' })).toMatchObject({ secret: true, digits: false, maxLength: -1 });
    // the Bank PIN: a password of digits (createView.ts, bankWindows.ts)
    expect(rulesOf({ tagName: 'INPUT', type: 'password', inputMode: 'numeric', maxLength: 4 })).toMatchObject({ secret: true, digits: true, maxLength: 4 });
    expect(rulesOf({ tagName: 'INPUT', type: 'number', max: '250' })).toMatchObject({ digits: true, max: 250 });
    expect(rulesOf({ tagName: 'INPUT', type: 'text', pattern: '[0-9]*' }).digits).toBe(true);
    expect(rulesOf({ tagName: 'TEXTAREA', inputMode: 'numeric' })).toMatchObject({ multiline: true, digits: false });
  });

  it('types over the selection and keeps the box\'s most letters', () => {
    expect(insert(at('helo', 3), 'l', TEXT)).toEqual(at('hello', 4));
    expect(insert({ value: 'hello world', start: 6, end: 11 }, 'F', TEXT)).toEqual(at('hello F'));
    const short = { ...TEXT, maxLength: 5 };
    expect(insert(at('hell'), 'oo', short)).toEqual(at('hello'));
    expect(insert(at('hello'), 'x', short)).toEqual(at('hello'));
    // a selection typed over makes its room
    expect(insert({ value: 'hello', start: 0, end: 5 }, 'yo', short)).toEqual(at('yo'));
    // one line: no new line in an input
    expect(insert(at('a'), '\n', TEXT)).toEqual(at('a'));
    expect(insert(at('a'), '\n', { ...TEXT, multiline: true })).toEqual(at('a\n'));
  });

  it('Backspace takes the selection, else the letter before the caret', () => {
    expect(backspace(at('hello'))).toEqual(at('hell'));
    expect(backspace(at('hello', 1))).toEqual(at('ello', 0));
    expect(backspace(at('hello', 0))).toEqual(at('hello', 0));
    expect(backspace({ value: 'hello', start: 1, end: 4 })).toEqual(at('ho', 1));
  });

  it('a number box takes digits only, no 0 in front, never over its most', () => {
    const amount = rulesOf({ tagName: 'INPUT', type: 'number', max: '500' });
    expect(insert(at('12'), 'a3', amount)).toEqual(at('123'));
    expect(insert(at('0'), '7', amount)).toEqual(at('7'));
    expect(insert(at(''), '00', amount)).toEqual(at('0'));
    expect(insert(at('99'), '9', amount)).toEqual(at('500'));
    const pin = rulesOf({ tagName: 'INPUT', type: 'password', inputMode: 'numeric', maxLength: 4 });
    expect(insert(at('123'), '45', pin)).toEqual(at('1234'));
  });

  it('Shift is for one letter, Caps for all; both together write small, as a PC', () => {
    const state = new KeyboardState();
    expect(state.press(char('a'))).toEqual({ type: 'a' });
    state.press({ kind: 'shift' });
    expect(state.shift).toBe('once');
    expect(state.press(char('a'))).toEqual({ type: 'A' });
    expect(state.press(char('a'))).toEqual({ type: 'a' });
    state.press({ kind: 'caps' });
    expect(state.press(char('b'))).toEqual({ type: 'B' });
    expect(state.press(char('c'))).toEqual({ type: 'C' });
    state.press({ kind: 'shift' });
    expect(state.press(char('d'))).toEqual({ type: 'd' });
    // a sign is never made big, and Shift waits for a letter
    state.press({ kind: 'caps' });
    state.press({ kind: 'shift' });
    expect(state.press(char('1'))).toEqual({ type: '1' });
    expect(state.press(char('e'))).toEqual({ type: 'E' });
  });

  it('the page keys go between letters and signs; a digits box starts on its number pad', () => {
    const state = new KeyboardState();
    state.press({ kind: 'page', page: 'symbols' });
    expect(state.page).toBe('symbols');
    state.press({ kind: 'page', page: 'more' });
    expect(state.page).toBe('more');
    state.reset(true);
    expect(state.page).toBe('digits');
    state.reset(false);
    expect(state.page).toBe('letters');
    expect(state.press({ kind: 'space' })).toEqual({ type: ' ' });
    expect(state.press({ kind: 'enter' })).toEqual({ do: 'enter' });
    expect(state.press({ kind: 'back' })).toEqual({ do: 'back' });
  });

  it('the pages hold the 26 letters and the 32 ASCII signs, and every row is 10 keys wide or less', () => {
    const typed = (page: keyof typeof PAGES) => PAGES[page].flat().flatMap((k) => (k.action.kind === 'char' ? [k.action.char] : []));
    expect(new Set(typed('letters').filter((c) => /[a-z]/.test(c))).size).toBe(26);
    const signs = new Set([...typed('symbols'), ...typed('more')].filter((c) => !/[0-9]/.test(c)));
    expect([...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'].every((c) => signs.has(c))).toBe(true);
    for (const page of ['letters', 'symbols', 'more'] as const) {
      for (const row of PAGES[page]) expect(row.reduce((sum, k) => sum + (k.width ?? 1), 0)).toBeLessThanOrEqual(10);
    }
    // the number pads: four across, Max for a box with a most
    for (const hasMax of [true, false]) {
      const rows = digitRows(hasMax);
      for (const row of rows) expect(row.reduce((sum, k) => sum + (k.width ?? 1), 0)).toBe(4);
      expect(rows.flat().some((k) => k.action.kind === 'max')).toBe(hasMax);
    }
  });

  it('the line shows dots for a password and a mark for a new line', () => {
    expect(shownText('abc', rulesOf({ tagName: 'INPUT', type: 'password' }))).toBe('•••');
    expect(shownText('a\nb', rulesOf({ tagName: 'TEXTAREA' }))).toBe('a↵b');
  });

  it('stands at the bottom, or the top, or a corner, never on the box when it can help it', () => {
    const screen = { width: 730, height: 320 }, size = { width: 560, height: 176 };
    // a box near the top (a window's name): the bottom middle
    expect(placeKeyboard(screen, size, { left: 300, top: 40, width: 120, height: 20 })).toEqual({ left: 85, top: 140 });
    // the phone's chat line at the bottom left: the top
    expect(placeKeyboard(screen, size, { left: 10, top: 280, width: 300, height: 18 })).toEqual({ left: 85, top: 4 });
    // in the middle under every place: the one that covers least
    const middle = placeKeyboard(screen, size, { left: 150, top: 150, width: 430, height: 24 });
    expect(middle.top === 140 || middle.top === 4).toBe(true);
    expect(placeKeyboard(screen, size, null)).toEqual({ left: 85, top: 140 });
  });

  it('a held key repeats after a wait, until let go', () => {
    vi.useFakeTimers();
    try {
      const repeat = new KeyRepeat();
      let presses = 0;
      repeat.start(() => { presses += 1; });
      expect(presses).toBe(1);
      vi.advanceTimersByTime(REPEAT_DELAY - 1);
      expect(presses).toBe(1);
      vi.advanceTimersByTime(1 + 3 * REPEAT_EVERY);
      expect(presses).toBe(4);
      repeat.stop();
      vi.advanceTimersByTime(10 * REPEAT_EVERY);
      expect(presses).toBe(4);
      expect(repeat.held).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the address can turn it off or make the boxes read-only', () => {
    expect(keyboardChoice('')).toBe('inputmode');
    expect(keyboardChoice('?keyboard=off')).toBe('off');
    expect(keyboardChoice('?stats&keyboard=readonly')).toBe('readonly');
  });
});

describe('the boxes', () => {
  afterEach(() => document.body.replaceChildren());

  it('types in text boxes and textareas, not buttons, checkboxes or read-only or disabled boxes', () => {
    const make = (html: string) => { document.body.innerHTML = html; return document.body.firstElementChild!; };
    expect(isTypedBox(make('<input>'))).toBe(true);
    expect(isTypedBox(make('<input type="password">'))).toBe(true);
    expect(isTypedBox(make('<input type="number">'))).toBe(true);
    expect(isTypedBox(make('<textarea></textarea>'))).toBe(true);
    expect(isTypedBox(make('<input type="checkbox">'))).toBe(false);
    expect(isTypedBox(make('<input type="radio">'))).toBe(false);
    expect(isTypedBox(make('<input readonly>'))).toBe(false);
    expect(isTypedBox(make('<input disabled>'))).toBe(false);
    expect(isTypedBox(make('<button></button>'))).toBe(false);
  });

  it('keeps the page\'s inputmode while it puts "none" there, and gives it back', () => {
    document.body.innerHTML = '<input type="password" inputmode="numeric" maxlength="4">';
    const pin = document.body.querySelector('input')!;
    keepAway(pin, 'inputmode');
    expect(pin.getAttribute('inputmode')).toBe('none');
    expect(boxRules(pin)).toMatchObject({ digits: true, secret: true, maxLength: 4 });
    giveBack(pin);
    expect(pin.getAttribute('inputmode')).toBe('numeric');
    keepAway(pin, 'readonly');
    expect(pin.readOnly).toBe(true);
    // still a box the keyboard types in
    expect(isTypedBox(pin)).toBe(true);
    giveBack(pin);
    expect(pin.readOnly).toBe(false);
  });

  it('hears an inputmode the page sets after the keyboard put "none" there (a PIN field made numeric once built)', () => {
    document.body.innerHTML = '<input maxlength="4">';
    const pin = document.body.querySelector('input')!;
    keepAway(pin, 'inputmode');
    pin.type = 'password';
    pin.inputMode = 'numeric';
    keepAway(pin, 'inputmode');
    expect(pin.getAttribute('inputmode')).toBe('none');
    expect(boxRules(pin)).toMatchObject({ digits: true, secret: true });
  });

  it('names a box by its label, its name for a screen reader or its placeholder', () => {
    document.body.innerHTML = '<label><span class="label">Account</span><input id="a"></label>' +
      '<input id="b" aria-label="Chat message"><input id="c" placeholder="Search">';
    expect(labelOf(document.getElementById('a') as HTMLInputElement)).toBe('Account');
    expect(labelOf(document.getElementById('b') as HTMLInputElement)).toBe('Chat message');
    expect(labelOf(document.getElementById('c') as HTMLInputElement)).toBe('Search');
  });
});

describe('FloatingKeyboard', () => {
  let keyboard: FloatingKeyboard | undefined;
  afterEach(() => {
    keyboard?.dispose();
    keyboard = undefined;
    document.body.replaceChildren();
  });

  /** The page's keyboard on a touch screen (or not), and `html` in the page. */
  function setup(html: string, touch = true) {
    document.body.innerHTML = html;
    keyboard = new FloatingKeyboard(document, { touch: () => touch });
    return keyboard;
  }
  const key = (name: string) =>
    [...keyboard!.element.querySelectorAll<HTMLButtonElement>('[data-key]')].find((button) => button.dataset.key === name) ?? null;
  /** A finger on a key of the keyboard. */
  const tapKey = (name: string) => {
    const button = key(name);
    expect(button, name).not.toBeNull();
    button!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  };
  const type = (text: string) => { for (const c of text) tapKey(c === ' ' ? 'space' : c); };
  /** A finger on an element of the page: its press, then what the press gives (the focus of a box). */
  const press = (element: Element) => element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  const tapBox = (box: HTMLElement) => { press(box); box.focus(); };

  it('comes up for a focused box on a touch screen, with "none" in its inputmode, and types in it', () => {
    const kb = setup('<input aria-label="Chat message" maxlength="8">');
    const box = document.querySelector('input')!;
    // the boxes already in the page get "none" before any focus
    expect(box.getAttribute('inputmode')).toBe('none');
    const typed: string[] = [];
    box.addEventListener('input', () => typed.push(box.value));
    tapBox(box);
    expect(kb.shown).toBe(true);
    expect(kb.target).toBe(box);
    expect(kb.element.querySelector('.floating-keyboard-title')!.textContent).toBe('Chat message');
    type('hi you');
    expect(box.value).toBe('hi you');
    expect(typed.at(-1)).toBe('hi you');
    expect(kb.element.querySelector('.floating-keyboard-text')!.textContent).toBe('hi you');
    type('there');
    // the box's maxlength kept
    expect(box.value).toBe('hi youth');
    tapKey('back');
    expect(box.value).toBe('hi yout');
    // the focus stays the box's
    expect(document.activeElement).toBe(box);
  });

  it('nothing changes on a computer without a touch screen', () => {
    const kb = setup('<input inputmode="numeric">', false);
    const box = document.querySelector('input')!;
    box.focus();
    expect(kb.shown).toBe(false);
    expect(box.getAttribute('inputmode')).toBe('numeric');
  });

  it('Shift and Caps write the keys big', () => {
    const kb = setup('<input>');
    const box = document.querySelector('input')!;
    tapBox(box);
    tapKey('shift');
    expect(key('shift')!.getAttribute('aria-pressed')).toBe('true');
    expect(key('a')!.textContent).toBe('A');
    type('ab');
    expect(box.value).toBe('Ab');
    tapKey('caps');
    type('cd');
    expect(box.value).toBe('AbCD');
    tapKey('page-symbols');
    expect(kb.page).toBe('symbols');
    type('1@');
    tapKey('page-letters');
    expect(box.value).toBe('AbCD1@');
  });

  it('a password box shows dots on the keyboard\'s line, its text in the box', () => {
    const kb = setup('<input type="password" aria-label="Password">');
    const box = document.querySelector('input')!;
    tapBox(box);
    type('abc');
    expect(box.value).toBe('abc');
    expect(kb.element.querySelector('.floating-keyboard-text')!.textContent).toBe('•••');
  });

  it('Backspace held repeats', () => {
    vi.useFakeTimers();
    try {
      setup('<input value="abcdefgh">');
      const box = document.querySelector('input')!;
      tapBox(box);
      box.setSelectionRange(8, 8);
      key('back')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(box.value).toBe('abcdefg');
      vi.advanceTimersByTime(REPEAT_DELAY + 2 * REPEAT_EVERY);
      expect(box.value).toBe('abcde');
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      vi.advanceTimersByTime(5 * REPEAT_EVERY);
      expect(box.value).toBe('abcde');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Enter is the box\'s Enter: its own handler first (the chat sends its line)', () => {
    setup('<input aria-label="Chat message">');
    const box = document.querySelector('input')!;
    const sent: string[] = [];
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); sent.push(box.value); box.value = ''; }
    });
    tapBox(box);
    type('hello');
    expect(key('enter')!.textContent).toBe('Enter');
    tapKey('enter');
    expect(sent).toEqual(['hello']);
    expect(box.value).toBe('');
  });

  it('Enter goes to the next box for "next" and logs in from the last one (the login form)', () => {
    setup('<form><input name="account" enterkeyhint="next"><input type="password" name="password" enterkeyhint="go">' +
      '<button type="submit">Log in</button></form>');
    const [account, password] = [...document.querySelectorAll('input')];
    const submitted: string[] = [];
    document.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted.push(`${account!.value}/${password!.value}`);
    });
    tapBox(account!);
    type('rocky');
    expect(key('enter')!.textContent).toBe('Next');
    tapKey('enter');
    expect(document.activeElement).toBe(password);
    expect(keyboard!.target).toBe(password);
    type('pw');
    expect(key('enter')!.textContent).toBe('Go');
    tapKey('enter');
    expect(submitted).toEqual(['rocky/pw']);
  });

  it('Enter writes a new line in a textarea that does nothing with it', () => {
    setup('<textarea></textarea>');
    const box = document.querySelector('textarea')!;
    tapBox(box);
    type('a');
    tapKey('enter');
    type('b');
    expect(box.value).toBe('a\nb');
  });

  it('a number box gets the number pad: digits, Max, C', () => {
    const kb = setup('<input type="number" min="1" max="250" value="1">');
    const box = document.querySelector('input')!;
    tapBox(box);
    expect(kb.page).toBe('digits');
    expect(key('q')).toBeNull();
    tapKey('clear');
    type('12');
    expect(box.value).toBe('12');
    type('0');
    expect(box.value).toBe('120');
    type('9');
    expect(box.value).toBe('250');
    tapKey('clear');
    expect(box.value).toBe('');
    tapKey('max');
    expect(box.value).toBe('250');
  });

  it('a PIN box gets the number pad without Max, four digits at most', () => {
    const kb = setup('<input type="password" inputmode="numeric" maxlength="4">');
    const box = document.querySelector('input')!;
    tapBox(box);
    expect(kb.page).toBe('digits');
    expect(key('max')).toBeNull();
    type('12345');
    expect(box.value).toBe('1234');
  });

  it('closes when the box loses the focus, or with its X; the box hears its change', async () => {
    const kb = setup('<input><button>OK</button>');
    const box = document.querySelector('input')!;
    let changes = 0;
    box.addEventListener('change', () => { changes += 1; });
    tapBox(box);
    type('a');
    (document.querySelector('button') as HTMLButtonElement).focus();
    expect(kb.shown).toBe(false);
    expect(changes).toBe(1);
    tapBox(box);
    expect(kb.shown).toBe(true);
    kb.element.querySelector('.floating-keyboard-close')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(kb.shown).toBe(false);
    expect(document.activeElement).not.toBe(box);
    // a blur to nothing closes it too (after the focus has had its chance to go to another box)
    tapBox(box);
    box.blur();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(kb.shown).toBe(false);
  });

  it('a box put in the page later gets "none" too, and a press elsewhere lets the box go', async () => {
    const kb = setup('<div id="window"></div><div id="world"></div>');
    const box = document.createElement('input');
    document.getElementById('window')!.append(box);
    await Promise.resolve();
    expect(box.getAttribute('inputmode')).toBe('none');
    tapBox(box);
    expect(kb.shown).toBe(true);
    document.getElementById('world')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(document.activeElement).not.toBe(box);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(kb.shown).toBe(false);
  });

  /**
   * The phone chat's line (hud/neuzChat.ts): a press anywhere outside the chat, seen first on the document (capture), leaves
   * the line; Enter sends the line and leaves it too, unless Lock keeps it.
   */
  function chatLine(lock = false) {
    const kb = setup('<div class="chat"><input aria-label="Chat message"></div>');
    const chat = document.querySelector<HTMLElement>('.chat')!;
    const line = chat.querySelector('input')!;
    const sent: string[] = [];
    const outside = (event: Event) => { if (!chat.contains(event.target as Node)) line.blur(); };
    document.addEventListener('pointerdown', outside, true);
    line.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      sent.push(line.value);
      line.value = '';
      if (!lock) line.blur();
    });
    return { kb, line, sent, dispose: () => document.removeEventListener('pointerdown', outside, true) };
  }

  it('2026-11-14 (owner): a key tap keeps the chat\'s line, whose outside press would leave it', async () => {
    const { kb, line, sent, dispose } = chatLine();
    try {
      tapBox(line);
      type('hi');
      expect(document.activeElement).toBe(line);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(kb.shown).toBe(true);
      expect(line.value).toBe('hi');
      // Enter sends and leaves the line (Neuz's chat); a tap on the line again types the next one
      tapKey('enter');
      expect(sent).toEqual(['hi']);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(kb.shown).toBe(false);
      tapBox(line);
      type('yo');
      tapKey('enter');
      expect(sent).toEqual(['hi', 'yo']);
    } finally {
      dispose();
    }
  });

  it('with the chat\'s Lock the line keeps the focus after Enter, and the keyboard stays for the next line', async () => {
    const { kb, line, sent, dispose } = chatLine(true);
    try {
      tapBox(line);
      type('a');
      tapKey('enter');
      type('b');
      tapKey('enter');
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(sent).toEqual(['a', 'b']);
      expect(kb.shown).toBe(true);
      expect(document.activeElement).toBe(line);
    } finally {
      dispose();
    }
  });

  it('2026-11-14 (owner): Done on the private shop\'s name (its Enter not prevented) closes the keyboard', () => {
    const kb = setup('<div class="shop"><input enterkeyhint="done" maxlength="47"><button>Open</button></div>');
    const name = document.querySelector('input')!;
    const opened: string[] = [];
    name.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') opened.push(name.value); });
    tapBox(name);
    type('shop');
    expect(key('enter')!.textContent).toBe('Done');
    tapKey('enter');
    expect(opened).toEqual(['shop']);
    expect(kb.shown).toBe(false);
    expect(document.activeElement).not.toBe(name);
  });

  it('Send (the private shop\'s chat room) keeps the box for the next line', () => {
    const kb = setup('<input enterkeyhint="send">');
    const box = document.querySelector('input')!;
    const sent: string[] = [];
    box.addEventListener('keydown', (event) => { if (event.key === 'Enter') { sent.push(box.value); box.value = ''; } });
    tapBox(box);
    type('hi');
    expect(key('enter')!.textContent).toBe('Send');
    tapKey('enter');
    type('yo');
    tapKey('enter');
    expect(sent).toEqual(['hi', 'yo']);
    expect(kb.shown).toBe(true);
  });

  it('closes at once when its box is hidden, disabled or taken out by its own Enter', () => {
    for (const what of ['hidden', 'disabled', 'removed'] as const) {
      const kb = setup('<div class="window"><input></div>');
      const box = document.querySelector('input')!;
      const window = document.querySelector<HTMLElement>('.window')!;
      box.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (what === 'hidden') window.hidden = true;
        else if (what === 'disabled') box.disabled = true;
        else window.remove();
      });
      tapBox(box);
      type('x');
      tapKey('enter');
      expect(kb.shown, what).toBe(false);
      expect(kb.target, what).toBeNull();
      kb.dispose();
      keyboard = undefined;
    }
  });

  it('closes when its box is hidden while it is open (a window closed under it)', () => {
    vi.useFakeTimers();
    try {
      const kb = setup('<div class="window"><input></div>');
      const box = document.querySelector('input')!;
      tapBox(box);
      expect(kb.shown).toBe(true);
      document.querySelector<HTMLElement>('.window')!.hidden = true;
      vi.advanceTimersByTime(250);
      expect(kb.shown).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a press that keeps the focus (a chat suggestion) does not let the box go', () => {
    const kb = setup('<input><div id="suggestion"></div>');
    const box = document.querySelector('input')!;
    const row = document.getElementById('suggestion')!;
    row.addEventListener('pointerdown', (event) => event.preventDefault());
    tapBox(box);
    row.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(box);
    expect(kb.shown).toBe(true);
  });

  it('2026-11-17: a box the page focuses by itself (a window a server packet opened) keeps the focus; the keyboard waits for a tap on it', () => {
    const kb = setup('<div class="hud-window"><input aria-label="Message to Lead"><button class="hud-window-close"></button></div>');
    const box = document.querySelector('input')!;
    // V15's SetFocus on the window's edit (friendHud.ts openMessage): its X, OK and Cancel stay uncovered
    box.focus();
    expect(document.activeElement).toBe(box);
    expect(box.getAttribute('inputmode')).toBe('none');
    expect(kb.target).toBe(box);
    expect(kb.shown).toBe(false);
    // a tap on the box brings it up
    tapBox(box);
    expect(kb.shown).toBe(true);
    type('hi');
    expect(box.value).toBe('hi');
    // so does a tap on a box's label
    box.blur();
    document.body.insertAdjacentHTML('beforeend', '<label>Name : <input id="name"></label>');
    const name = document.getElementById('name') as HTMLInputElement;
    press(document.querySelector('label')!);
    name.focus();
    expect(kb.target).toBe(name);
    expect(kb.shown).toBe(true);
  });

  it('2026-11-17: a press in the box\'s own window that focuses it brings it up (a chat tab); one in another window does not (the Messenger\'s row)', () => {
    const kb = setup('<div class="hud-window"><button id="tab">Party</button><input aria-label="Chat message"></div>' +
      '<div class="hud-window"><div id="row">Lead</div></div><div class="hud-window" id="message" hidden><input aria-label="Message to Lead"></div>');
    const [line, edit] = [...document.querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement];
    const tab = document.getElementById('tab')!, row = document.getElementById('row')!;
    tab.addEventListener('click', () => line.focus());
    press(tab);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(line);
    expect(kb.shown).toBe(true);
    // the row's double press opens the Message window with its edit focused: the keyboard waits for a tap on it
    row.addEventListener('dblclick', () => { document.getElementById('message')!.hidden = false; edit.focus(); });
    press(row);
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(document.activeElement).toBe(edit);
    expect(kb.target).toBe(edit);
    expect(kb.shown).toBe(false);
    // a focus the page gives once the press is over is its own too, even for the line the player let go
    line.focus();
    expect(kb.target).toBe(line);
    expect(kb.shown).toBe(false);
  });

  it('2026-11-17: the box it was up for, given the focus back by the page, keeps it (the chat with Lock after its /say)', () => {
    const kb = setup('<div class="hud-window"><input aria-label="Chat message"></div><div class="hud-window"><input aria-label="Message to Lead"></div>');
    const [line, edit] = [...document.querySelectorAll('input')] as [HTMLInputElement, HTMLInputElement];
    tapBox(line);
    expect(kb.shown).toBe(true);
    // the own line's Message window, opened quietly (friendHud.ts openMessageQuiet): its edit focused, the focus given back
    edit.focus();
    expect(kb.shown).toBe(false);
    line.focus();
    expect(kb.target).toBe(line);
    expect(kb.shown).toBe(true);
  });
});
