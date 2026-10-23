import { describe, expect, it } from 'vitest';
import type { WebMover } from '@flyffweb/formats';
import { nameTagOf, tagOpacity } from '../src/world/render/nameTags';
import { addedNpc, addedPlayer, gameDataOf, moverFrom } from './helpers/movers';

// The colours of PKSetting.inc are not all the code has: a different set shows the tag takes them from `nameColors`
const colors = { general: 0xfff0f0f0, chaotic: 0xff010203, ready: 0xff040506 };
const titles = new Map([[3, 'Hero of Flaris']]);

const mover = (index: number, name: string): WebMover => ({ index, name, speed: 0.1, ai: 2, flying: false, model: null, skeleton: null, motions: {} });
const data = gameDataOf({
  movers: new Map([[21, mover(21, 'Aibatt')], [40, mover(40, 'Clerk')]]),
  npcs: new Map([['mafl_mikyel', { key: 'MaFl_Mikyel', name: 'Mikyel' }]]),
  nameColors: colors,
});

const auth = (letter: string): number => letter.charCodeAt(0);
const BELLI_PEACEFUL = 1; // Resource/defineAttribute.h:203
const TRANSPARENT_MODE = 0x2; // _Common/authorization.h

const tagOfPlayer = (player: Parameters<typeof addedPlayer>[1]) =>
  nameTagOf(moverFrom(addedPlayer(1, { name: 'Rocky', ...player }), data), undefined, colors, titles);
const tagOfNpc = (index: number, npc: Parameters<typeof addedNpc>[2], extra: Parameters<typeof addedNpc>[3] = {}) =>
  nameTagOf(moverFrom(addedNpc(2, index, npc, extra), data), undefined, colors, titles);

describe('nameTagOf: players', () => {
  it('a player is white-ish general colour from nameColors', () => {
    expect(tagOfPlayer({})).toEqual({ text: 'Rocky', color: 0xfff0f0f0, maxDistance: 100 });
  });

  it('a GM gets " [GM]" and COLOR_GAMEMASTER', () => {
    for (const letter of ['L', 'M', 'N', 'O']) {
      expect(tagOfPlayer({ authorization: auth(letter) })).toEqual({ text: 'Rocky [GM]', color: 0xff2d7cae, maxDistance: 100 });
    }
  });

  it('an administrator gets " [Admin]" and COLOR_ADMINISTRATOR', () => {
    expect(tagOfPlayer({ authorization: auth('P') })).toEqual({ text: 'Rocky [Admin]', color: 0xffae2d2d, maxDistance: 100 });
  });

  it('a VIP gets the cornsilk colour and no tag; the staff moderator and the lower ranks are ordinary', () => {
    for (const letter of ['1', '2', '3']) expect(tagOfPlayer({ authorization: auth(letter) })?.color).toBe(0xfffff8dc);
    for (const letter of ['D', 'F', 'G', 'H', 'J', 'K']) {
      expect(tagOfPlayer({ authorization: auth(letter) })).toEqual({ text: 'Rocky', color: 0xfff0f0f0, maxDistance: 100 });
    }
  });

  it('a title is in brackets', () => {
    expect(tagOfPlayer({ honor: 3 })?.text).toBe('[Hero of Flaris] Rocky');
    expect(tagOfPlayer({ honor: 3, authorization: auth('L') })?.text).toBe('[Hero of Flaris] Rocky [GM]');
  });

  it('shows no brackets for no title, a title the table lacks, or the private shop title', () => {
    expect(tagOfPlayer({ honor: -1 })?.text).toBe('Rocky');
    expect(tagOfPlayer({ honor: 77 })?.text).toBe('Rocky');
    expect(tagOfPlayer({ shopTitle: 'Cheap swords' })?.text).toBe('Rocky');
  });

  it('a chaotic player gets the chaotic colour', () => {
    expect(tagOfPlayer({ pkPropensity: 1 })?.color).toBe(0xff010203);
  });

  it('a player in pink state gets the ready colour, and chaos wins over pink', () => {
    expect(tagOfPlayer({ pkTime: 5000 })?.color).toBe(0xff040506);
    expect(tagOfPlayer({ pkTime: 5000, pkPropensity: 2 })?.color).toBe(0xff010203);
  });

  it('the PK colours win over the staff colours, and the staff tag stays', () => {
    expect(tagOfPlayer({ authorization: auth('P'), pkPropensity: 1 })).toEqual({
      text: 'Rocky [Admin]', color: 0xff010203, maxDistance: 100,
    });
    expect(tagOfPlayer({ authorization: auth('L'), pkTime: 1 })?.color).toBe(0xff040506);
  });

  it('a transparent mover has no tag', () => {
    expect(tagOfPlayer({ mode: TRANSPARENT_MODE })).toBeNull();
    expect(tagOfPlayer({ mode: 0x1 | TRANSPARENT_MODE | 0x100 })).toBeNull();
    expect(tagOfPlayer({ self: true, mode: TRANSPARENT_MODE })).toBeNull(); // the own character is no exception
    expect(tagOfPlayer({ mode: 0x1 | 0x100 })).not.toBeNull(); // other modes (invincible, no community) still show
  });

  it('does not depend on the viewer: RenderName is not given one', () => {
    const other = moverFrom(addedPlayer(1, { name: 'Rocky', authorization: auth('P') }), data);
    const gm = moverFrom(addedPlayer(3, { name: 'Watcher', authorization: auth('P') }), data);
    expect(nameTagOf(other, gm, colors, titles)).toEqual(nameTagOf(other, undefined, colors, titles));
  });
});

describe('nameTagOf: monsters and NPCs', () => {
  it("a monster's limit is 40, a peaceful NPC's and a player's 100", () => {
    expect(tagOfNpc(21, {})?.maxDistance).toBe(40);
    expect(tagOfNpc(40, { characterKey: 'MaFl_Mikyel' }, { belligerence: BELLI_PEACEFUL })?.maxDistance).toBe(100);
    expect(tagOfPlayer({})?.maxDistance).toBe(100);
  });

  it('a monster shows its name in the monster colour', () => {
    expect(tagOfNpc(21, {})).toEqual({ text: 'Aibatt', color: 0xffffffa0, maxDistance: 40 });
  });

  it('an aggressive monster shows its name in red', () => {
    expect(tagOfNpc(21, { activeAttack: 1 })).toEqual({ text: 'Aibatt', color: 0xffff0000, maxDistance: 40 });
  });

  it('a peaceful NPC shows its name in the NPC colour', () => {
    expect(tagOfNpc(40, { characterKey: 'MaFl_Mikyel' }, { belligerence: BELLI_PEACEFUL })).toEqual({
      text: 'Mikyel', color: 0xffa0a0ff, maxDistance: 100,
    });
  });

  it("an NPC that is not peaceful is a monster's tag: 40 m", () => {
    for (const belligerence of [0, 2, 3]) {
      expect(tagOfNpc(40, { characterKey: 'MaFl_Mikyel' }, { belligerence })).toEqual({
        text: 'Mikyel', color: 0xffffffa0, maxDistance: 40,
      });
    }
  });

  it('a peaceful monster is treated like a peaceful NPC', () => {
    // CWorld::Render asks IsNPC (not a player) && IsPeaceful, which a monster can be
    expect(tagOfNpc(21, {}, { belligerence: BELLI_PEACEFUL })).toEqual({ text: 'Aibatt', color: 0xffa0a0ff, maxDistance: 100 });
  });
});

describe('tagOpacity', () => {
  it('is 1 up to ten metres before the limit, then fades linearly to 0 at the limit', () => {
    expect(tagOpacity(30, 40)).toBe(1);
    expect(tagOpacity(0, 40)).toBe(1);
    expect(tagOpacity(35, 40)).toBe(0.5);
    expect(tagOpacity(40, 40)).toBe(0);
    expect(tagOpacity(95, 100)).toBe(0.5);
  });

  it('stays within 0 and 1 beyond both ends', () => {
    expect(tagOpacity(55, 40)).toBe(0);
    expect(tagOpacity(-5, 40)).toBe(1);
  });
});
