// @vitest-environment jsdom
// The message box's prompts (2026-11-05): a text field (the name change, the friend summon) or a row of choices (the
// ticket's channels, the faces, the elements), OK handing the answer on.

import { afterEach, describe, expect, it } from 'vitest';
import { MessageBox } from '../src/world/hud/messageBox';

const art = { url: (key: string) => `/assets/${key}`, sheets: null };

afterEach(() => document.body.replaceChildren());

describe('MessageBox.prompt', () => {
  it('a text field, cut to its length; OK hands its value on', () => {
    const box = new MessageBox(art, document);
    document.body.append(box.element);
    const answers: unknown[] = [];
    box.prompt('Please input the new name to change into.', { input: { maxLength: 16 } }, (answer) => answers.push(answer));
    const input = box.frame.element.querySelector<HTMLInputElement>('.hud-message-input')!;
    expect(input.maxLength).toBe(16);
    input.value = 'Webster';
    box.frame.element.querySelector<HTMLButtonElement>('[data-button="ok"]')!.click();
    expect(answers).toEqual([{ value: 'Webster', choice: 0 }]);
    expect(box.isOpen).toBe(false);
  });

  it('a row of choices, the first chosen; OK hands on the one chosen; Cancel runs its own', () => {
    const box = new MessageBox(art, document);
    document.body.append(box.element);
    const answers: unknown[] = [];
    let cancelled = 0;
    box.prompt('Please choose a channel', { choices: ['Channel 1', 'Channel 2'] }, (answer) => answers.push(answer), () => cancelled++);
    const choices = [...box.frame.element.querySelectorAll<HTMLButtonElement>('.hud-message-choice')];
    expect(choices.map((c) => [c.textContent, c.getAttribute('aria-pressed')])).toEqual([['Channel 1', 'true'], ['Channel 2', 'false']]);
    choices[1]!.click();
    expect(choices[1]!.getAttribute('aria-pressed')).toBe('true');
    box.frame.element.querySelector<HTMLButtonElement>('[data-button="ok"]')!.click();
    expect(answers).toEqual([{ value: '', choice: 1 }]);
    box.prompt('Again', { choices: ['A'] }, () => {}, () => cancelled++);
    box.frame.element.querySelector<HTMLButtonElement>('[data-button="cancel"]')!.click();
    expect(cancelled).toBe(1);
  });

  it('a plain open after a prompt has neither field nor choices', () => {
    const box = new MessageBox(art, document);
    document.body.append(box.element);
    box.prompt('x', { input: { maxLength: 8 }, choices: ['A'] }, () => {});
    box.close();
    box.open('plain', 'ok', () => {});
    expect(box.frame.element.querySelector<HTMLElement>('.hud-message-input')!.hidden).toBe(true);
    expect(box.frame.element.querySelector<HTMLElement>('.hud-message-choices')!.hidden).toBe(true);
  });
});
