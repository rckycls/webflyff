// The item windows' flows (2026-11-05): each window's steps and the packets they send.

import { describe, expect, it } from 'vitest';
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
  [26202, itemProp({ id: 26202, kind2: 19, part: -1, name: 'Party Summon' })],
  [30500, itemProp({ id: 30500, kind2: 19, kind3: 85, part: -1, name: 'Monster Summon' })],
  [500, itemProp({ id: 500, kind1: 1, kind2: 2, kind3: 3, part: 10, name: 'Sword' })],
  [600, itemProp({ id: 600, kind2: 7, kind3: 18, part: 2, sex: 0, abilityMin: 10, abilityMax: 12, limitLevel: 30, name: 'Suit M' })],
  [601, itemProp({ id: 601, kind2: 7, kind3: 18, part: 2, sex: 1, abilityMin: 10, abilityMax: 12, limitLevel: 30, name: 'Suit F' })],
]);

function rig(over: Partial<ItemWindowHost> = {}) {
  const own = newVagrant();
  [[3, 10424], [4, 26529], [5, 10220], [6, 20037], [7, 26204], [8, 26202], [9, 30500], [12, 500], [13, 600]]
    .forEach(([objectId, itemId]) => own.inventory!.set(objectId!, { objectId: objectId!, itemId: itemId!, count: 1 }));
  own.inventory!.set(12, { objectId: 12, itemId: 500, count: 1, resistOption: 2 });
  const sent: unknown[][] = [];
  const said: string[] = [];
  const prompts: Array<{ text: string; options: unknown; answer: (a: { value: string; choice: number }) => void; cancel: () => void }> = [];
  const boxes: Array<{ text: string; ok: () => void; cancel: () => void }> = [];
  const alerts: string[] = [];
  let armed = false;
  const host: ItemWindowHost = {
    own: () => own, props: PROPS, setItems: new Set(), worldId: () => 1, worldName: () => 'Madrigal', partyName: () => 'Party',
    isLeader: () => true, focusId: () => 0xffffffff,
    text: (tid, args = []) => [tid, ...args].join('|'),
    prompt: (text, options, answer, cancel = () => {}) => void prompts.push({ text, options, answer, cancel }),
    box: (text, ok, cancel = () => {}) => void boxes.push({ text, ok, cancel }),
    alert: (text) => void alerts.push(text),
    say: (tid) => void said.push(tid),
    arm: (on) => { armed = on; },
    send: (...packet) => void sent.push(packet),
    ...over,
  };
  return { own, flows: new ItemWindowFlows(host), sent, said, prompts, boxes, alerts, armed: () => armed };
}

describe('ItemWindowFlows', () => {
  it('name change: the field, the rules in a box, then QUERYSETPLAYERNAME', () => {
    const r = rig();
    expect(r.flows.open(3)).toBe(true);
    r.prompts[0]!.answer({ value: '1Bad', choice: 0 });
    expect(r.alerts).toEqual(['TID_DIAG_0012']);
    expect(r.sent).toEqual([]);
    r.flows.open(3);
    r.prompts[1]!.answer({ value: ' Webster ', choice: 0 });
    expect(r.sent).toEqual([['querySetPlayerName', 3, 'Webster']]);
  });

  it('a ticket: its channels away from its world, the main one "0", a layer "-1"; and a plain DOUSEITEM as Neuz sends', () => {
    const r = rig();
    r.flows.open(4);
    expect(r.prompts[0]!.options).toEqual({ choices: ['Channel 1', 'Channel 2'] });
    expect(r.sent).toEqual([['useItem', 4, -1, 0xffffffff]]);
    r.prompts[0]!.answer({ value: '', choice: 1 });
    expect(r.sent).toEqual([['useItem', 4, -1, 0xffffffff], ['doUseItemInput', 4, '-1']]);
    const there = rig({ worldId: () => 2 });
    there.flows.open(4);
    expect(there.boxes.map((b) => b.text)).toEqual(['TID_GAME_TICKET_DESC']);
    there.boxes[0]!.ok();
    expect(there.sent).toEqual([['doUseItemInput', 4, '0']]);
  });

  it('sex change: nothing but the kept parts worn, a face, then DOUSEITEM with the face as its part', () => {
    const r = rig();
    r.flows.open(5);
    expect(r.prompts[0]!.options).toEqual({ choices: ['1', '2', '3', '4', '5'] });
    r.prompts[0]!.answer({ value: '', choice: 2 });
    expect(r.sent).toEqual([['useItem', 5, 2, 0xffffffff]]);
    const dressed = rig();
    dressed.own.equipmentObjectIds[2] = 13;
    dressed.flows.open(5);
    expect(dressed.said).toEqual(['TID_GAME_CHECK_EQUIP']);
  });

  it('element change: the next bag item is its weapon, then an element; CHANGE_ATTRIBUTE (weapon, scroll, element)', () => {
    const r = rig();
    r.flows.open(6, 'bag');
    expect(r.flows.picking).toBe(true);
    expect(r.flows.pick(13)).toBe(true); // the suit: no element
    expect(r.said).toEqual(['TID_GAME_NOTELEMENT']);
    r.flows.open(6, 'bag');
    r.flows.pick(12);
    r.prompts.at(-1)!.answer({ value: '', choice: 3 }); // wind
    expect(r.sent).toEqual([['changeAttribute', 12, 6, 4]]);
    expect(r.flows.open(6, 'bar')).toBe(false); // the task bar's use is a plain one (the bag opens the window)
  });

  it('transmute: the next bag item, its twin in a box, then ITEMTRANSY', () => {
    const r = rig();
    r.flows.open(7, 'bag');
    r.flows.pick(13);
    expect(r.boxes.map((b) => b.text)).toEqual(['Suit M → Suit F']);
    r.boxes[0]!.ok();
    expect(r.sent).toEqual([['itemTransy', 13, 7, 601]]);
  });

  it('party summon: the leader only; the box names the world; then SUMMON_PARTY', () => {
    const member = rig({ isLeader: () => false });
    member.flows.open(8);
    expect(member.said).toEqual(['TID_GAME_TROUPECREATE']);
    const r = rig();
    r.flows.open(8);
    expect(r.boxes[0]!.text).toBe('TID_GAME_SUMMONPARTY|Madrigal');
    r.boxes[0]!.ok();
    expect(r.sent).toEqual([['summonParty', 8]]);
  });

  it("a member called: the box, then the buff's double-click asks and sends SUMMON_PARTY_CONFIRM", () => {
    const r = rig();
    r.flows.onSummon({ type: 'summon', kind: 'partyConfirm', objectId: 4321, data: 9, world: 'Madrigal' });
    expect(r.boxes[0]!.text).toBe('TID_DIAG_SUMMONPARTY_CONFIRM|Party\nTID_DIAG_SUMMONPARTY_CONFIRM_USE|Party Summon');
    r.boxes[0]!.ok();
    expect(r.sent).toEqual([]);
    r.flows.partySummonBuff();
    expect(r.boxes[1]!.text).toBe('TID_DIAG_SUMMONPARTY_USE|Madrigal');
    r.boxes[1]!.ok();
    expect(r.sent).toEqual([['summonPartyConfirm', 4321, 9]]);
  });

  it('friend summon: its use asks for a name; the friend is asked and answers', () => {
    const r = rig();
    r.flows.onSummon({ type: 'summon', kind: 'friendUse', data: 9 << 16, objectId: 9 });
    r.prompts[0]!.answer({ value: 'Buddy', choice: 0 });
    expect(r.sent).toEqual([['summonFriend', 9 << 16, 'Buddy']]);
    r.flows.onSummon({ type: 'summon', kind: 'friendConfirm', objectId: 4321, data: 77, name: 'Webby', world: 'Flaris' });
    expect(r.boxes[0]!.text).toBe('TID_DIAG_SUMMONFRIEND_CONFIRM|Webby|Flaris');
    r.boxes[0]!.cancel();
    expect(r.sent.at(-1)).toEqual(['summonFriendAnswer', false, 4321, 77]);
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
