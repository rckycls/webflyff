// @vitest-environment jsdom
// The Delete Character window's text (2026-11-17): the Database server checks the delete code against the character's
// bank PIN, so the window asks for that PIN; the rest is V15's (see charSelectCreate.test.ts for its rule).

import { afterEach, describe, expect, it } from 'vitest';
import type { CharacterSummary } from '@flyffweb/protocol';
import { deleteView } from '../src/lobby/views/deleteView';

afterEach(() => {
  document.body.replaceChildren();
});

describe('the Delete Character window asks for the bank PIN', () => {
  it('says so in its two lines and on its edit, and sends what was typed', () => {
    const sent: string[] = [];
    const view = deleteView({
      character: { name: 'Webby' } as CharacterSummary,
      onDelete: (password) => void sent.push(password),
      onInvalid: () => {},
      onCancel: () => {},
    });
    document.body.append(view.element);
    const text = (selector: string) => view.element.querySelector(selector)!.textContent;
    expect([text('h2'), text('.cd-line1'), text('.cd-line2')])
      .toEqual(['Delete Character', "Enter this character's bank PIN", '(0000 if you never set one)']);
    const edit = view.element.querySelector<HTMLInputElement>('input')!;
    expect([edit.type, edit.getAttribute('aria-label')]).toEqual(['password', 'Bank PIN']);
    edit.value = '0000';
    view.element.querySelector<HTMLButtonElement>('.cd-ok')!.click();
    expect(sent).toEqual(['0000']);
  });
});
