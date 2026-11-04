import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import {
  GUILDWAR, KEBARAS, MINIROOM, RETURN_SCROLL, castFill, isTravelItem, usableFromBag, useRefusal,
} from '../src/world/items/travelItems';
import type { UseCheck } from '../src/world/items/travelItems';

const prop = (over: Partial<WebItemProp>): WebItemProp => ({
  id: 1, name: 'x', packMax: 99, kind1: 5, kind2: 0, kind3: 0, handed: -1, part: -1, abilityMin: 0, abilityMax: 0,
  weaponType: -1, attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1], sfxHit: -1,
  model: null, icon: null, ...over,
} as WebItemProp);
const TOWN = prop({ id: 4805, kind2: 22, kind3: 47, castMs: 10000, sfxReady: 118 });
const SCROLL = prop({ id: RETURN_SCROLL, kind2: 19, kind3: 50, castMs: 4000 });
const POTION = prop({ id: 501, kind2: 12 });
const at = (over: Partial<UseCheck> = {}): UseCheck => ({
  prop: TOWN, worldId: 1, casting: false, standing: true, flying: false, returnBuff: false, ...over,
});

describe('the travel items (Piece 7 M3)', () => {
  it("each refusal in Neuz's order (SendDoUseItem, IsUseItemReadyTime)", () => {
    expect(useRefusal(at())).toBeNull();
    expect(useRefusal(at({ casting: true }))).toEqual({ kind: 'say', tid: 'TID_PK_BLINK_LIMIT' });
    expect(useRefusal(at({ standing: false }))).toEqual({ kind: 'say', tid: 'TID_PK_STAND_LIMIT' });
    expect(useRefusal(at({ flying: true }))).toEqual({ kind: 'say', tid: 'TID_PK_FLIGHT_NOUSE' });
    expect(useRefusal(at({ worldId: KEBARAS }))).toEqual({ kind: 'say', tid: 'TID_PK_BLINK_NO', args: 'Azria' });
    expect(useRefusal(at({ worldId: GUILDWAR }))).toEqual({ kind: 'box', tid: 'TID_GAME_GUILDCOMBAT_NO_OUTWAR' });
    expect(useRefusal(at({ worldId: MINIROOM }))).toEqual({ kind: 'say', tid: 'TID_PK_BLINK_NO', args: 'House' });
    // the earlier rule wins
    expect(useRefusal(at({ casting: true, standing: false, worldId: KEBARAS }))).toEqual({ kind: 'say', tid: 'TID_PK_BLINK_LIMIT' });
    expect(useRefusal(at({ standing: false, worldId: GUILDWAR }))).toEqual({ kind: 'say', tid: 'TID_PK_STAND_LIMIT' });
  });

  it('a potion has no cast refusals', () => {
    expect(useRefusal(at({ prop: POTION, casting: true, standing: false, flying: true, worldId: KEBARAS }))).toBeNull();
  });

  it('Kebaras and the house name the world; the Scroll is no Blinkwing there', () => {
    expect(useRefusal(at({ prop: SCROLL, worldId: KEBARAS }))).toBeNull();
    expect(useRefusal(at({ prop: SCROLL, worldId: GUILDWAR }))).toBeNull();
  });

  it('the Scroll of Return is refused only with its buff on', () => {
    expect(useRefusal(at({ prop: SCROLL }))).toBeNull();
    expect(useRefusal(at({ prop: SCROLL, returnBuff: true }))).toEqual({ kind: 'say', tid: 'TID_GAME_LIMITED_USE' });
    // its cast refusals come first, as IsUseItemReadyTime runs before the box (DPClient.cpp:10326, :10416)
    expect(useRefusal(at({ prop: SCROLL, returnBuff: true, standing: false }))).toEqual({ kind: 'say', tid: 'TID_PK_STAND_LIMIT' });
  });

  it('usableFromBag takes the travel items, the three old kinds and the premium ones', () => {
    expect(isTravelItem(TOWN)).toBe(true);
    expect(isTravelItem(SCROLL)).toBe(true);
    expect(isTravelItem(POTION)).toBe(false);
    for (const kind2 of [11, 12, 14]) expect(usableFromBag(prop({ kind2 }))).toBe(true);
    expect(usableFromBag(TOWN)).toBe(true);
    expect(usableFromBag(SCROLL)).toBe(true);
    // 2026-11-05: any system item, as Neuz sends it (the resurrection scroll alive does nothing on the server; a gift box
    // opens, which the browser cannot tell apart: propGiftbox.inc is the server's)
    expect(usableFromBag(prop({ kind2: 19, id: 10431 }))).toBe(true);
    expect(usableFromBag(prop({ kind2: 2 }))).toBe(false);
  });

  it('castFill clamps to 0..112 (RenderCasting)', () => {
    expect(castFill(-5, 10000)).toBe(0);
    expect(castFill(5000, 10000)).toBe(56);
    expect(castFill(20000, 10000)).toBe(112);
    expect(castFill(1, 10000)).toBe(0);
  });
});
