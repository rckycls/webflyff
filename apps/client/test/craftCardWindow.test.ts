// @vitest-environment jsdom
// custom (owner 2026-11-19): Bozman's Craft Card window (items/craftCardWindow.ts;
// docs/superpowers/specs/2026-11-19-craft-card-design.md): its slots, rules, confirm, bulk and answers.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { CraftCardWindow } from '../src/world/items/craftCardWindow';
import type { CraftCardHost } from '../src/world/items/craftCardWindow';
import type { NpcWindowPacket } from '../src/world/items/npcWindowKit';
import { itemProp, newVagrant } from './helpers/ownState';

const BOZMAN = 0x3001;
const PROPS = new Map<number, WebItemProp>([
  [20280, itemProp({ id: 20280, kind2: 17, kind3: 39, name: 'Craft Stone', icon: 'items/stone.png' })],
  [3207, itemProp({ id: 3207, kind2: 17, kind3: 62, name: 'Volcano Card(4%)', icon: 'items/magma.png' })],
  [3255, itemProp({ id: 3255, kind2: 17, kind3: 62, name: 'Volcano Card(3%)', icon: 'items/v3.png' })],
  [3208, itemProp({ id: 3208, kind2: 17, kind3: 62, name: 'Volcano Card(7%)', icon: 'items/v7.png' })],
  [3218, itemProp({ id: 3218, kind2: 17, kind3: 62, name: 'Lightning Card(7%)', icon: 'items/l7.png' })],
  [26596, itemProp({ id: 26596, kind2: 17, kind3: 63, name: 'Fire Card (B)', icon: 'items/fb.png' })],
  [2800, itemProp({ id: 2800, kind1: 4, kind2: 14, kind3: 0, name: 'Potion', icon: 'items/potion.png' })],
]);
const letter = (c: string): number => c.charCodeAt(0);

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function rig(options: { authorization?: string; answerYes?: boolean } = {}) {
  const own = newVagrant();
  // 1: 12 stones, 2: 3 Magma 4%, 3: 1 Volcano 3%, 4: a Volcano 7%, 5: 5 Fire B, 6: a potion, 7: 10 Magma 4%
  const items: Array<[number, number, number]> = [[1, 20280, 12], [2, 3207, 3], [3, 3255, 1], [4, 3208, 1], [5, 26596, 5], [6, 2800, 3], [7, 3207, 10]];
  for (const [objectId, itemId, count] of items) own.inventory!.set(objectId, { objectId, itemId, count });
  const reserved = new Map<number, number>();
  const said: string[] = [], texts: string[] = [], sent: NpcWindowPacket[] = [], asked: string[] = [], triesAsked: number[] = [];
  let authorization = letter(options.authorization ?? 'F');
  let tries = 0;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: CraftCardHost = {
    own: () => own, props: PROPS, ultimate: () => undefined, text: (tid) => tid,
    alert: () => {}, say: (tid) => void said.push(tid),
    reserve: (id, on) => {
      const n = (reserved.get(id) ?? 0) + (on ? 1 : -1);
      if (n > 0) reserved.set(id, n); else reserved.delete(id);
    },
    reserved: (id) => reserved.get(id) ?? 0,
    dieFlag: () => {},
    send: (packet) => void sent.push(packet),
    mobile: () => false, bagOpen: () => true, openBag: () => {}, closeBag: () => {}, bagRect: () => null,
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
    authorization: () => authorization,
    sayText: (text) => void texts.push(text),
    confirm: (text, yes) => { asked.push(text); if (options.answerYes !== false) yes(); },
    askTries: (max, chosen) => { triesAsked.push(max); if (tries > 0) chosen(tries); },
  };
  const window = new CraftCardWindow(host);
  return {
    own, host, reserved, said, texts, sent, asked, triesAsked, layer, window,
    setLetter: (c: string) => { authorization = letter(c); }, choose: (n: number) => { tries = n; },
  };
}

const info = (r: ReturnType<typeof rig>): string => r.layer.querySelector('.hud-craft-card [data-control="WIDC_INFO"]')!.textContent ?? '';
const result = (r: ReturnType<typeof rig>): string => r.layer.querySelector('.hud-craft-card [data-control="WIDC_RESULT"]')!.textContent ?? '';
const craftButton = (r: ReturnType<typeof rig>) => r.layer.querySelector<HTMLButtonElement>('.hud-craft-card [data-craft="craft"]')!;
const bulkButton = (r: ReturnType<typeof rig>) => r.layer.querySelector<HTMLButtonElement>('.hud-craft-card [data-craft="bulk"]')!;

describe('Craft Card window', () => {
  it('a stone and a 4% card show Chance: 20% and Makes: one random 7% suit card', () => {
    const r = rig();
    expect(r.window.openAt(BOZMAN)).toBe(true);
    expect(r.layer.querySelector('.hud-craft-card .hud-window-title')!.textContent).toBe('Craft Card');
    expect(info(r)).toContain('Chance: 0%');
    expect(r.window.take(1, false)).toBe('taken');
    expect(r.window.take(2, false)).toBe('taken');
    expect(r.window.state.stone).toBe(1);
    expect(r.window.state.cards).toEqual([2, null, null, null, null]);
    expect(info(r)).toContain('Chance: 20%');
    expect(info(r)).toContain('Makes: one random 7% suit card');
    r.window.take(3, false);
    expect(info(r)).toContain('Chance: 35%');
  });

  it('a weapon card after a suit card is refused with "Suit and weapon cards cannot be mixed."', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(2, false);
    expect(r.window.take(5, false)).toBe('taken');
    expect(r.texts).toEqual(['Suit and weapon cards cannot be mixed.']);
    expect(r.window.state.cards).toEqual([2, null, null, null, null]);
  });

  it('a 7% card is refused with "7% and A cards cannot be crafted."; anything else is refused', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    expect(r.window.take(4, false)).toBe('taken');
    expect(r.texts).toEqual(['7% and A cards cannot be crafted.']);
    expect(r.window.take(6, false)).toBe('refused');
    expect(r.window.state.cards).toEqual([null, null, null, null, null]);
  });

  it('a stack of 3 fills three slots, not a fourth', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    for (let i = 0; i < 4; i++) r.window.take(2, false);
    expect(r.window.state.cards).toEqual([2, 2, 2, null, null]);
    expect(r.reserved.get(2)).toBe(3);
    expect(r.texts.at(-1)).toBe('No more of that item in the bag.');
  });

  it('Craft asks first and sends { npcId, stoneId, cardIds, tries: 1, stopOnSuccess: false } on yes, nothing on no', () => {
    const no = rig({ answerYes: false });
    no.window.openAt(BOZMAN);
    no.window.take(1, false);
    no.window.take(2, false);
    craftButton(no).click();
    expect(no.asked).toEqual(['Craft with a 20% chance? On a fail the Craft Stone and all cards are lost.']);
    expect(no.sent).toEqual([]);
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(2, false);
    r.window.take(3, false);
    craftButton(r).click();
    expect(r.sent).toEqual([{ type: 'craftCard', npcId: BOZMAN, stoneId: 1, cardIds: [2, 3], tries: 1, stopOnSuccess: false }]);
    expect(craftButton(r).disabled).toBe(true);
  });

  it('Craft without a stone says so and sends nothing', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(2, false);
    craftButton(r).click();
    expect(r.texts).toEqual(['Put a Craft Stone in the window.']);
    r.window.take(1, false);
    r.window.clearSlot(1);
    craftButton(r).click();
    expect(r.texts.at(-1)).toBe('Put 1 to 5 cards in the window.');
    expect(r.sent).toEqual([]);
  });

  it('the bulk button shows for \'B\' and asks up to 10, cut to what the stacks pay for', () => {
    const r = rig({ authorization: 'B' });
    r.window.openAt(BOZMAN);
    expect(bulkButton(r).hidden).toBe(false);
    r.window.take(1, false);
    r.window.take(7, false);
    r.window.take(7, false);
    r.choose(4);
    bulkButton(r).click();
    // 12 stones, 10 Magma in two slots: 5 tries; VIP2 allows 10
    expect(r.triesAsked).toEqual([5]);
    expect(r.asked).toEqual([
      'Craft 4 times with a 45% chance each? It uses up to 4 Craft Stones and 8 cards. Every fail loses its stone and cards.',
    ]);
    expect(r.sent).toEqual([{ type: 'craftCard', npcId: BOZMAN, stoneId: 1, cardIds: [7, 7], tries: 4, stopOnSuccess: false }]);
  });

  it('the bulk most leaves out the pieces another window holds (final review)', () => {
    const r = rig({ authorization: 'B' });
    for (let i = 0; i < 4; i++) r.host.reserve(7, true); // another window holds 4 of the 10 Magma
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(7, false);
    r.window.take(7, false);
    r.choose(2);
    bulkButton(r).click();
    // 10 - 4 = 6 Magma for two slots: 3 tries, not 5
    expect(r.triesAsked).toEqual([3]);
  });

  it('the stop tick box goes with the bulk press', () => {
    const r = rig({ authorization: 'E' });
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(7, false);
    r.layer.querySelector<HTMLButtonElement>('.hud-craft-card [data-craft="stop"]')!.click();
    r.choose(10);
    bulkButton(r).click();
    expect(r.triesAsked).toEqual([10]);
    expect(r.sent).toMatchObject([{ tries: 10, stopOnSuccess: true }]);
  });

  it('the bulk button hides when the letter is no VIP\'s', () => {
    const r = rig({ authorization: 'F' });
    r.window.openAt(BOZMAN);
    expect(bulkButton(r).hidden).toBe(true);
    r.setLetter('A');
    r.window.take(1, false);
    expect(bulkButton(r).hidden).toBe(false);
    r.setLetter('F');
    r.window.take(2, false);
    expect(bulkButton(r).hidden).toBe(true);
  });

  it('a success answer empties the slots and shows the card made', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(2, false);
    craftButton(r).click();
    r.window.onResult({ type: 'craftCard', code: 0, made: [3218] });
    expect(r.window.state.stone).toBeNull();
    expect(r.window.state.cards).toEqual([null, null, null, null, null]);
    expect(r.reserved.size).toBe(0);
    expect(result(r)).toContain('Success!');
    expect(result(r)).toContain('Lightning Card(7%)');
    expect(r.texts.at(-1)).toBe('You crafted Lightning Card(7%)!');
    expect(craftButton(r).disabled).toBe(false);
  });

  it('a fail answer shows Failed', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(2, false);
    craftButton(r).click();
    r.window.onResult({ type: 'craftCard', code: 0, made: [0] });
    expect(result(r)).toContain('Failed');
    expect(r.texts.at(-1)).toBe('Crafting failed. The Craft Stone and the cards are gone.');
  });

  it('a bulk answer shorter than asked shows the tries run', () => {
    const r = rig({ authorization: 'C' });
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(7, false);
    r.choose(10);
    bulkButton(r).click();
    r.window.onResult({ type: 'craftCard', code: 0, made: [0, 3218, 0] });
    expect(result(r)).toContain('3 tries: 1 made');
    expect(result(r)).toContain('Lightning Card(7%) x1');
    expect(r.texts.at(-1)).toBe('3 tries: 1 made (Lightning Card(7%) x1).');
  });

  it('a refused answer (2) keeps the slots, says "You are too far from Bozman.", unlocks Craft', () => {
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(2, false);
    craftButton(r).click();
    r.window.onResult({ type: 'craftCard', code: 2, made: [] });
    expect(r.texts.at(-1)).toBe('You are too far from Bozman.');
    expect(r.window.state.stone).toBe(1);
    expect(r.window.state.cards).toEqual([2, null, null, null, null]);
    expect(craftButton(r).disabled).toBe(false);
    r.window.onResult({ type: 'craftCard', code: 3, made: [] });
    expect(r.texts.at(-1)).toBe('Not enough space in the inventory.');
    r.window.onResult({ type: 'craftCard', code: 4, made: [] });
    expect(r.texts.at(-1)).toBe('Cannot be done.');
  });

  it('no answer: Craft unlocks after 3 s', () => {
    vi.useFakeTimers();
    const r = rig();
    r.window.openAt(BOZMAN);
    r.window.take(1, false);
    r.window.take(2, false);
    craftButton(r).click();
    expect(craftButton(r).disabled).toBe(true);
    craftButton(r).click();
    expect(r.sent).toHaveLength(1);
    vi.advanceTimersByTime(2999);
    expect(craftButton(r).disabled).toBe(true);
    vi.advanceTimersByTime(1);
    expect(craftButton(r).disabled).toBe(false);
  });
});
