// @vitest-environment jsdom
// The item windows (2026-11-05, Neuz's own windows): each window's controls, steps and the packets they send.

import { afterEach, describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import { ItemWindowFlows } from '../src/world/items/itemWindowFlows';
import type { ItemWindowHost } from '../src/world/items/itemWindowFlows';
import { itemProp, newVagrant } from './helpers/ownState';

const PROPS = new Map<number, WebItemProp>([
  [10424, itemProp({ id: 10424, kind2: 19, part: -1, name: 'Scroll of Name Change' })],
  [26529, itemProp({ id: 26529, kind2: 19, kind3: 122, part: -1, name: 'Kebaras Ticket' })],
  [10220, itemProp({ id: 10220, kind2: 19, part: -1, name: 'Transy' })],
  [20037, itemProp({ id: 20037, kind2: 19, part: -1, name: 'Sokchang' })],
  [26204, itemProp({ id: 26204, kind2: 19, part: -1, name: 'Transmute A' })],
  [26202, itemProp({ id: 26202, kind2: 19, part: -1, name: 'Party Summon', icon: 'items/partycome.png' })],
  [26201, itemProp({ id: 26201, kind2: 19, part: -1, name: 'Friendship (B)' })],
  [30500, itemProp({ id: 30500, kind2: 19, kind3: 85, part: -1, name: 'Monster Summon' })],
  [500, itemProp({ id: 500, kind1: 1, kind2: 2, kind3: 3, part: 10, name: 'Sword', icon: 'items/sword.png' })],
  [600, itemProp({ id: 600, kind2: 7, kind3: 18, part: 2, sex: 0, abilityMin: 10, abilityMax: 12, limitLevel: 30, name: 'Suit M', icon: 'items/m.png' })],
  [601, itemProp({ id: 601, kind2: 7, kind3: 18, part: 2, sex: 1, abilityMin: 10, abilityMax: 12, limitLevel: 30, name: 'Suit F', icon: 'items/f.png' })],
]);

afterEach(() => document.body.replaceChildren());

function rig(over: Partial<ItemWindowHost> = {}) {
  const own = newVagrant();
  [[3, 10424], [4, 26529], [5, 10220], [6, 20037], [7, 26204], [8, 26202], [9, 30500], [12, 500], [13, 600], [14, 26201]]
    .forEach(([objectId, itemId]) => own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: 1 }));
  own.inventory!.set(12, { objectId: 12, itemId: 500, count: 1, resistOption: 2 });
  const sent: unknown[][] = [];
  const said: string[] = [];
  const boxes: Array<{ text: string; ok: () => void }> = [];
  const alerts: string[] = [];
  const reserved = new Set<number>();
  const faces: number[] = [];
  let armed = false;
  const layer = document.createElement('div');
  document.body.append(layer);
  const host: ItemWindowHost = {
    own: () => own, props: PROPS, setItems: new Set(), worldId: () => 1, worldName: () => 'Madrigal', partyName: () => 'Party',
    isLeader: () => true, ownName: () => 'Webby', focusId: () => 0xffffffff,
    text: (tid, args = []) => [tid, ...args].join('|'),
    box: (text, ok) => void boxes.push({ text, ok }),
    alert: (text) => void alerts.push(text),
    say: (tid) => void said.push(tid),
    arm: (on) => { armed = on; },
    send: (...packet) => void sent.push(packet),
    reserve: (id, on) => { if (on) reserved.add(id); else reserved.delete(id); },
    facePreview: async (face) => { faces.push(face); return document.createElement('canvas'); },
    friends: () => ['Buddy', 'Pal'],
    ui: { art: { url: (key) => `/assets/${key}`, sheets: null }, doc: document, layer: () => layer },
    ...over,
  };
  const win = (title: string): HTMLElement | undefined =>
    [...layer.querySelectorAll<HTMLElement>('.hud-res-window')]
      .find((w) => !w.hidden && w.querySelector('.hud-window-title')!.textContent === title);
  const click = (title: string, control: string): void => win(title)!.querySelector<HTMLElement>(`[data-control="${control}"]`)!.click();
  return { own, flows: new ItemWindowFlows(host), sent, said, boxes, alerts, reserved, faces, armed: () => armed, win, click, layer };
}

describe('ItemWindowFlows', () => {
  it('name change: APP_CHANGENAME; the rules in a message box, the window kept; then QUERYSETPLAYERNAME', () => {
    const r = rig();
    expect(r.flows.open(3)).toBe(true);
    const window = r.win('Change Name')!;
    expect(window.querySelector('[data-control="WIDC_STATIC1"]')!.textContent).toBe('Please input the new name to change into.');
    const input = window.querySelector<HTMLInputElement>('input')!;
    input.value = '1Bad';
    r.click('Change Name', 'WIDC_OK');
    expect(r.alerts).toEqual(['TID_DIAG_0012']);
    expect(r.sent).toEqual([]);
    expect(r.win('Change Name')).toBeDefined();
    input.value = ' Webster ';
    r.click('Change Name', 'WIDC_OK');
    expect(r.sent).toEqual([['querySetPlayerName', 3, 'Webster']]);
    expect(r.win('Change Name')).toBeUndefined();
  });

  it('a ticket: APP_SELECT_CHANNEL away from its world, a click on row 2 sends "-1"; the plain DOUSEITEM as Neuz sends', () => {
    const r = rig();
    r.flows.open(4);
    const window = r.win('Channel Selection')!;
    const rows = [...window.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(rows.map((row) => row.textContent)).toEqual(['TID_GAME_CHAR_SERVERNAME 1', 'TID_GAME_CHAR_SERVERNAME 2']);
    expect(window.querySelector('[data-control="WIDC_STATIC1"]')!.textContent).toBe('Please choose a channel');
    expect(r.sent).toEqual([['useItem', 4, -1, 0xffffffff]]);
    rows[1]!.click();
    expect(r.sent).toEqual([['useItem', 4, -1, 0xffffffff], ['doUseItemInput', 4, '-1']]);
    expect(r.win('Channel Selection')).toBeUndefined();
    const there = rig({ worldId: () => 2 });
    there.flows.open(4);
    expect(there.boxes.map((b) => b.text)).toEqual(['TID_GAME_TICKET_DESC']);
    there.boxes[0]!.ok();
    expect(there.sent).toEqual([['doUseItemInput', 4, '0']]);
  });

  it('sex change: APP_CHANGESEX, Left and Right through faces 0-4 (wrapping), each drawn; OK sends the face', async () => {
    const r = rig();
    r.flows.open(5, 'bag');
    expect(r.faces).toEqual([0]);
    r.click('Change Sex', 'WIDC_LEFT');
    r.click('Change Sex', 'WIDC_LEFT');
    r.click('Change Sex', 'WIDC_RIGHT');
    expect(r.faces).toEqual([0, 4, 3, 4]);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.win('Change Sex')!.querySelectorAll('.hud-res-preview')).toHaveLength(1);
    r.click('Change Sex', 'WIDC_OK');
    expect(r.sent).toEqual([['useItem', 5, 4, 0xffffffff]]);
    const dressed = rig();
    dressed.own.equipmentObjectIds[2] = 13;
    dressed.flows.open(5, 'bag');
    expect(dressed.said).toEqual(['TID_GAME_CHECK_EQUIP']);
  });

  it('element change: the scroll held; the bag item placed in the slot, an element chosen; OK sends (weapon, scroll, element)', () => {
    const r = rig();
    expect(r.flows.open(6, 'bar')).toBe(false); // the task bar's use is a plain one (the bag opens the window)
    r.flows.open(6, 'bag');
    expect(r.flows.picking).toBe(true);
    expect(r.reserved).toEqual(new Set([6]));
    const window = r.win('Scroll of Attribute Change')!;
    expect(window.querySelector('.hud-res-words-title')!.textContent).toBe(' Scroll of Attribute Change ');
    expect(r.flows.pick(13)).toBe(true); // the suit: no element
    expect(r.said).toEqual(['TID_GAME_NOTELEMENT']);
    r.flows.pick(12);
    expect(r.reserved).toEqual(new Set([6, 12]));
    expect(window.querySelector<HTMLImageElement>('.hud-res-slot img')!.src).toContain('/assets/items/sword.png');
    r.click('Scroll of Attribute Change', 'WIDC_CUSTOM4'); // wind
    expect(window.querySelector('[data-control="WIDC_CUSTOM4"]')!.classList.contains('is-chosen')).toBe(true);
    r.click('Scroll of Attribute Change', 'WIDC_OK');
    expect(r.sent).toEqual([['changeAttribute', 12, 6, 4]]);
    expect(r.reserved).toEqual(new Set());
    expect(r.flows.picking).toBe(false);
  });

  it('element change: a move closes it, sending nothing and letting both items go', () => {
    const r = rig();
    r.flows.open(6, 'bag');
    r.flows.pick(12);
    r.flows.playerMoved();
    expect(r.win('Scroll of Attribute Change')).toBeUndefined();
    expect(r.sent).toEqual([]);
    expect(r.reserved).toEqual(new Set());
  });

  it('transmute: APP_ITEM_TRANSY, the item and its twin in their slots; OK sends ITEMTRANSY', () => {
    const r = rig();
    r.flows.open(7, 'bag');
    r.flows.pick(13);
    const window = r.win('Trasy for Item')!;
    expect([...window.querySelectorAll<HTMLImageElement>('.hud-res-slot img')].map((img) => img.alt)).toEqual(['Suit M', 'Suit F']);
    expect(r.reserved).toEqual(new Set([7, 13]));
    r.click('Trasy for Item', 'WIDC_OK');
    expect(r.sent).toEqual([['itemTransy', 13, 7, 601]]);
    expect(r.reserved).toEqual(new Set());
  });

  it('party summon: the leader only; APP_SUMMON_PARTY names the world; OK sends SUMMON_PARTY', () => {
    const member = rig({ isLeader: () => false });
    member.flows.open(8);
    expect(member.said).toEqual(['TID_GAME_TROUPECREATE']);
    const r = rig();
    r.flows.open(8);
    expect(r.win('Summon Party')!.querySelector('.hud-res-text-body')!.textContent).toBe('TID_GAME_SUMMONPARTY|Madrigal');
    r.click('Summon Party', 'WIDC_OK');
    expect(r.sent).toEqual([['summonParty', 8]]);
  });

  it("a member called: the notice with the scroll's icon, then the buff's double-click asks and sends SUMMON_PARTY_CONFIRM", () => {
    const r = rig();
    r.flows.onSummon({ type: 'summon', kind: 'partyConfirm', objectId: 4321, data: 9, world: 'Madrigal' });
    const notice = r.win('Summon P. Members')!;
    expect([...notice.querySelectorAll('.hud-res-text-body')].map((t) => t.textContent))
      .toEqual(['TID_DIAG_SUMMONPARTY_CONFIRM|Party', 'TID_DIAG_SUMMONPARTY_CONFIRM_USE|Party Summon']);
    expect(notice.querySelector('[data-control="WIDC_STATIC1"]')!.textContent).toBe('How to Use');
    expect(notice.querySelector<HTMLImageElement>('[data-control="ICON"] img')!.src).toContain('/assets/items/partycome.png');
    r.click('Summon P. Members', 'WIDC_OK');
    expect(r.sent).toEqual([]);
    r.flows.partySummonBuff();
    expect(r.win('Summon P. Members')!.querySelector('.hud-res-text-body')!.textContent).toBe('TID_DIAG_SUMMONPARTY_USE|Madrigal');
    r.click('Summon P. Members', 'WIDC_OK');
    expect(r.sent).toEqual([['summonPartyConfirm', 4321, 9]]);
  });

  it("friend summon: the scroll from the data's high word, the friends listed, the name checked; the friend answers", () => {
    const r = rig();
    r.flows.onSummon({ type: 'summon', kind: 'friendUse', data: 14 << 16, objectId: 9 });
    const window = r.win('Summon')!;
    expect([...window.querySelectorAll('.hud-res-combo-rows [role="option"]')].map((o) => o.textContent)).toEqual(['Buddy', 'Pal']);
    const input = window.querySelector<HTMLInputElement>('input')!;
    input.value = 'Bo';
    r.click('Summon', 'WIDC_OK');
    expect(r.win('Summon')).toBeDefined(); // too short: nothing, the window stays
    input.value = 'Webby';
    r.click('Summon', 'WIDC_OK');
    expect(r.said).toEqual(['TID_GAME_SUMMON_FRIEND_MY_NOUSE']);
    r.flows.onSummon({ type: 'summon', kind: 'friendUse', data: 14 << 16, objectId: 9 });
    window.querySelector<HTMLElement>('.hud-res-combo-rows [role="option"]')!.click();
    r.click('Summon', 'WIDC_OK');
    expect(r.sent).toEqual([['summonFriend', 14, 'Buddy']]);
    r.flows.onSummon({ type: 'summon', kind: 'friendConfirm', objectId: 4321, data: 77, name: 'Webby', world: 'Flaris' });
    expect(r.win('Summon')!.querySelector('.hud-res-text-body')!.textContent).toBe('TID_DIAG_SUMMONFRIEND_CONFIRM|Webby|Flaris');
    r.click('Summon', 'WIDC_CANCEL');
    expect(r.sent.at(-1)).toEqual(['summonFriendAnswer', false, 4321, 77]);
  });

  it("the friend's question closed by its close button sends nothing", () => {
    const r = rig();
    r.flows.onSummon({ type: 'summon', kind: 'friendConfirm', objectId: 4321, data: 77, name: 'Webby', world: 'Flaris' });
    r.win('Summon')!.querySelector<HTMLElement>('.hud-window-close')!.click();
    expect(r.sent).toEqual([]);
  });

  it('monster summon: armed, then a place within 15 m in Madrigal sends CREATEMONSTER', () => {
    const r = rig();
    r.flows.open(9);
    expect(r.armed()).toBe(true);
    expect(r.flows.place([1, 2, 3], 20, 0)).toBe(true);
    expect(r.said).toEqual(['TID_GAME_CREATEMON_F_15']);
    expect(r.armed()).toBe(true); // it stays armed
    r.flows.place([1, 2, 3], 5, 0);
    expect(r.sent).toEqual([['createMonster', 9, [1, 2, 3]]]);
    expect(r.armed()).toBe(false);
    expect(r.flows.place([1, 2, 3], 5, 0)).toBe(false);
  });
});
