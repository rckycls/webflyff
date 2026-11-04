// @vitest-environment jsdom
// The Scroll of Return's flow (Piece 7 M3): DPClient.cpp:10416-10431, WndSelectVillage.cpp:17-45, :15784-15787.

import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { MessageBox } from '../src/world/hud/messageBox';
import { SelectVillageWindow } from '../src/world/hud/selectVillageWindow';
import { ReturnScroll } from '../src/world/items/returnScroll';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const TEXTS = new Map([['TID_GAME_RETURN_USEITEM', { text: 'Do you want to use the item?' }]]);

function rig() {
  const box = new MessageBox(art, document);
  const villages = new SelectVillageWindow(art, document);
  const sent: number[] = [];
  const scroll = new ReturnScroll(box, villages, { sendReturnScroll: (select) => void sent.push(select) }, TEXTS);
  const press = (root: HTMLElement, key: string): void => root.querySelector<HTMLButtonElement>(`[data-button="${key}"]`)!.click();
  return { box, villages, sent, scroll, press };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('ReturnScroll (CReturnScrollMsgBox, CWndSelectVillage, OnReturnScrollACK)', () => {
  it('the box, the village, then RETURNSCROLL 1', () => {
    const r = rig();
    r.scroll.begin(9);
    expect(r.box.isOpen).toBe(true);
    expect(r.box.frame.element.textContent).toContain('Do you want to use the item?');
    r.press(r.box.frame.element, 'ok');
    expect(r.box.isOpen).toBe(false);
    expect(r.villages.isOpen).toBe(true);
    r.villages.frame.element.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]!.click();
    r.press(r.villages.frame.element, 'ok');
    expect(r.sent).toEqual([1]);
  });

  it('Cancel at the box sends nothing', () => {
    const r = rig();
    r.scroll.begin(9);
    r.press(r.box.frame.element, 'cancel');
    expect(r.villages.isOpen).toBe(false);
    expect(r.sent).toEqual([]);
  });

  it('the answer gives the stored scroll to use again (Review Focus 4)', () => {
    const r = rig();
    expect(r.scroll.answered()).toBeNull(); // nothing stored: an answer nothing asked for uses nothing
    r.scroll.begin(9);
    expect(r.scroll.answered()).toBe(9);
  });

  it('a second use while the box is open does nothing', () => {
    const r = rig();
    r.scroll.begin(9);
    r.scroll.begin(11);
    expect(r.scroll.answered()).toBe(9);
    expect(document.querySelectorAll('.hud-message').length).toBeLessThanOrEqual(1);
  });

  it('goBack sends RETURNSCROLL -1', () => {
    const r = rig();
    r.scroll.goBack();
    expect(r.sent).toEqual([-1]);
  });
});
