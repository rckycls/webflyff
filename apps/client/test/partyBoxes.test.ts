// @vitest-environment jsdom
// The party window's boxes (Piece 7 M4, [R §6.1], [R §6.4]): `CWndPartyLeaveConfirm`, `CWndPartyChangeTroup`,
// `CWndPartyChangeName` (`_Interface/WndPartyChangeTroup.cpp`).

import { afterEach, describe, expect, it } from 'vitest';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { PartyBoxes } from '../src/world/hud/party/partyBoxes';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const TEXTS: Texts = new Map([
  ['TID_DIAG_0084', { id: 'TID_DIAG_0084', text: 'Are you going to leave the party?', color: 0 }],
  ['TID_DIAG_0085', { id: 'TID_DIAG_0085', text: 'Kick? (0085)', color: 0 }],
  ['TID_GAME_PARTY_NAME', { id: 'TID_GAME_PARTY_NAME', text: 'Advance Party', color: 0 }],
]);

function setup(check: (name: string) => { send: string } | { box: string } | { stay: true } = (name) => ({ send: name })) {
  const boxes = new PartyBoxes(art, TEXTS, check);
  document.body.append(...boxes.elements);
  const calls: unknown[] = [];
  boxes.onLeaveYes = (id) => calls.push(['leave', id]);
  boxes.onName = (name) => calls.push(['name', name]);
  boxes.onBox = (tid) => calls.push(['box', tid]);
  const press = (box: string, name: string) =>
    document.querySelector<HTMLButtonElement>(`.${box} [data-button="${name}"]`)!.click();
  return { boxes, calls, press };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('PartyBoxes', () => {
  it('the leave box asks TID_DIAG_0084 or 0085; Yes calls onLeaveYes', () => {
    const { boxes, calls, press } = setup();
    boxes.leave(70001, false);
    expect(document.querySelector('.hud-party-leave .hud-party-box-text')!.textContent).toBe('Are you going to leave the party?');
    press('hud-party-leave', 'yes');
    boxes.leave(70002, true);
    expect(document.querySelector('.hud-party-leave .hud-party-box-text')!.textContent).toBe('Kick? (0085)');
    press('hud-party-leave', 'no');
    expect([calls, boxes.leaveOpen]).toEqual([[['leave', 70001]], false]);
  });

  it('the convert box opens the name box, filled with the saved name or "Advance Party"', () => {
    const { boxes, press } = setup();
    boxes.changeTroup('');
    press('hud-party-troup', 'ok');
    const edit = () => document.querySelector<HTMLInputElement>('.hud-party-name input')!;
    expect([boxes.nameOpen, edit().value]).toEqual([true, 'Advance Party']);
    press('hud-party-name', 'cancel');
    boxes.changeTroup('Saved');
    press('hud-party-troup', 'ok');
    expect(edit().value).toBe('Saved');
    // Cancel on the convert box sends nothing and opens nothing
    press('hud-party-name', 'cancel');
    boxes.changeTroup('Saved');
    press('hud-party-troup', 'cancel');
    expect(boxes.nameOpen).toBe(false);
  });

  it('a refused name keeps the box open with its message; an accepted one is sent and closes it', () => {
    const { boxes, calls, press } = setup((name) => (name === 'ab cd' ? { box: 'TID_DIAG_0013' } : { send: name.trim() }));
    boxes.changeName('ab cd');
    press('hud-party-name', 'ok');
    expect([boxes.nameOpen, calls]).toEqual([true, [['box', 'TID_DIAG_0013']]]);
    document.querySelector<HTMLInputElement>('.hud-party-name input')!.value = ' Webbies ';
    press('hud-party-name', 'ok');
    expect([boxes.nameOpen, calls.at(-1)]).toEqual([false, ['name', 'Webbies']]);
  });
});
