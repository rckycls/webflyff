import { describe, expect, it } from 'vitest';
import type { WornPart } from '@flyffweb/protocol';
import type { WebItemModel, WebMover } from '@flyffweb/formats';
import { DEFAULT_MALE, partKey } from '@flyffweb/scene';
import { lookOf } from '../src/world/render/looks';
import { MI_FEMALE, MI_MALE, addedNpc, addedPlayer, gameDataOf, moverFrom } from './helpers/movers';

/** `PARTS_*` (`Resource/defineNeuz.h:24-61`). */
const PARTS = { HEAD: 0, HAIR: 1, UPPER: 2, LOWER: 3, HAND: 4, FOOT: 5, CAP: 6, HAT: 26, CLOTH: 27 };
/** NULL_ID, `=` in propItem.txt: no `dwExclusive` or `dwBasePartsIgnore`. */
const NONE = -1;

/** An item of items.json; `hides` is what propItem.txt says in `dwExclusive` and `dwBasePartsIgnore`. */
const item = (
  id: number, part: number, male: string | null, female: string | null = male,
  hides: { exclusive?: number; baseIgnore?: number } = {},
): WebItemModel => ({
  id, part, exclusive: hides.exclusive ?? NONE, baseIgnore: hides.baseIgnore ?? NONE, male, female,
});
const worn = (part: number, itemId: number, flag = 0): WornPart => ({ part, itemId, flag });

const mover = (index: number, name: string, model: string | null, skeleton: string | null, motions: Record<string, string> = {}): WebMover => ({
  index, name, speed: 0.1, ai: 2, model, skeleton, motions,
});
const MALE_MOTIONS = {
  0: 'motions/mvr_male/mvr_male_genstand.glb', 3: 'motions/mvr_male/mvr_male_genwalk.glb', 5: 'motions/mvr_male/mvr_male_genrun.glb',
};
const FEMALE_MOTIONS = { 0: 'motions/mvr_female/mvr_female_genstand.glb', 5: 'motions/mvr_female/mvr_female_genrun.glb' };

const data = gameDataOf({
  movers: new Map([
    [MI_MALE, mover(MI_MALE, 'Male', null, 'skeletons/mvr_male.glb', MALE_MOTIONS)],
    [MI_FEMALE, mover(MI_FEMALE, 'Female', null, 'skeletons/mvr_female.glb', FEMALE_MOTIONS)],
    [21, mover(21, 'Aibatt', 'models/mvr_aibatt.glb', 'skeletons/mvr_aibatt.glb', {
      0: 'motions/mvr_aibatt/mvr_aibatt_stand.glb', 3: 'motions/mvr_aibatt/mvr_aibatt_walk.glb',
    })],
    [22, mover(22, 'Statue', 'models/mvr_statue.glb', null)],
    [23, mover(23, 'Lost', null, null)],
  ]),
  items: new Map([
    // the vagrant clothes a new character starts in (jobItem.inc: II_ARM_M_VAG_SUIT01, GAUNTLET01, BOOTS01); like
    // every suit of propItem.txt the upper takes the bare lower body off
    [502, item(502, PARTS.UPPER, 'models/part_mvag01upper.glb', undefined, { exclusive: PARTS.LOWER })],
    [506, item(506, PARTS.HAND, 'models/part_mvag01hand.glb')],
    [510, item(510, PARTS.FOOT, 'models/part_mvag01foot.glb')],
    [700, item(700, PARTS.UPPER, 'models/part_mmer01upper.glb', 'models/part_fmer01upper.glb', { exclusive: PARTS.LOWER })],
    [710, item(710, PARTS.CAP, 'models/part_mcap01cap.glb', undefined, { baseIgnore: PARTS.HAIR })], // a helmet
    [711, item(711, PARTS.CAP, 'models/part_mcap02cap.glb')], // a circlet: the hair shows
    [730, item(730, PARTS.HAT, 'models/part_mhat01hat.glb', undefined, { baseIgnore: PARTS.HAIR })],
    [731, item(731, PARTS.HAT, 'models/part_mhat02hat.glb')],
    [732, item(732, PARTS.HAT, 'models/part_mhat03hat.glb', undefined, { baseIgnore: PARTS.HEAD })], // covers the head too
    [720, item(720, PARTS.CLOTH, 'models/part_mfas01cloth.glb', undefined, { exclusive: PARTS.LOWER })],
    [740, item(740, PARTS.UPPER, null)], // listed, but no model for either sex
    [750, item(750, PARTS.UPPER, 'models/part_mglv01upper.glb', undefined, { exclusive: PARTS.HAND })], // a long sleeve: no bare hand
    [760, item(760, PARTS.UPPER, 'models/part_mshr01upper.glb')], // a short top: the bare lower body stays
    // items.json from before the converter kept the two fields
    [770, { id: 770, part: PARTS.UPPER, male: 'models/part_mold01upper.glb', female: null } as WebItemModel],
    [771, { id: 771, part: PARTS.CAP, male: 'models/part_mold02cap.glb', female: null } as WebItemModel],
  ]),
});

/** A player with these worn parts, as another client's ADD_OBJ lists them. */
const player = (parts: WornPart[], extra: Parameters<typeof addedPlayer>[1] = {}) =>
  moverFrom(addedPlayer(1, { worn: parts, ...extra }), data);

describe('lookOf: players', () => {
  it("a new male vagrant looks like the viewer's default", () => {
    const look = lookOf(player([worn(PARTS.UPPER, 502), worn(PARTS.HAND, 506), worn(PARTS.FOOT, 510)]), data);
    expect(look?.parts).toEqual([
      'models/part_malehead01.glb', 'models/part_malehair01.glb', 'models/part_mvag01upper.glb',
      'models/part_mvag01hand.glb', 'models/part_mvag01foot.glb',
    ]);
    expect(look?.parts).toEqual(Object.values(DEFAULT_MALE).map(partKey));
    expect(look?.skeleton).toBe('skeletons/mvr_male.glb');
  });

  it('a player who wears nothing shows the bare body parts', () => {
    // UpdateParts loads Part_maleUpper, Part_maleLower, Part_maleHand and Part_maleFoot for a slot without an item
    expect(lookOf(player([]), data)?.parts).toEqual([
      'models/part_malehead01.glb', 'models/part_malehair01.glb', 'models/part_maleupper.glb',
      'models/part_malelower.glb', 'models/part_malehand.glb', 'models/part_malefoot.glb',
    ]);
  });

  it('a worn upper replaces the default upper, and takes the lower body off with it', () => {
    expect(lookOf(player([worn(PARTS.UPPER, 700)]), data)?.parts).toEqual([
      'models/part_malehead01.glb', 'models/part_malehair01.glb', 'models/part_mmer01upper.glb',
      'models/part_malehand.glb', 'models/part_malefoot.glb',
    ]);
  });

  it('a female gets the female part', () => {
    const look = lookOf(moverFrom(addedPlayer(1, { sex: 1, worn: [worn(PARTS.UPPER, 700)] }, { index: MI_FEMALE }), data), data);
    expect(look?.parts).toEqual([
      'models/part_femalehead01.glb', 'models/part_femalehair01.glb', 'models/part_fmer01upper.glb',
      'models/part_femalehand.glb', 'models/part_femalefoot.glb',
    ]);
    expect(look?.skeleton).toBe('skeletons/mvr_female.glb');
  });

  it('numbers the head and hair meshes from 1', () => {
    // PARTSMESH_HAIR( nSex ) with nHairMesh + 1, and the same for the head: "%02d"
    const look = lookOf(player([], { hairMesh: 9, headMesh: 14 }), data);
    expect(look?.parts.slice(0, 2)).toEqual(['models/part_malehead15.glb', 'models/part_malehair10.glb']);
  });

  it('an expired item, an unknown item and an item without a model leave the default in place', () => {
    const bare = lookOf(player([]), data)?.parts;
    expect(lookOf(player([worn(PARTS.UPPER, 700, 0x01)]), data)?.parts).toEqual(bare); // CItemElem::expired
    expect(lookOf(player([worn(PARTS.UPPER, 9999)]), data)?.parts).toEqual(bare);
    expect(lookOf(player([worn(PARTS.UPPER, 740)]), data)?.parts).toEqual(bare);
    // the flag's other bits (binds, isusing) do not matter
    expect(lookOf(player([worn(PARTS.UPPER, 700, 0x06)]), data)?.parts).toContain('models/part_mmer01upper.glb');
  });

  it('the head and hair slots are not dressed from the worn list', () => {
    expect(lookOf(player([worn(PARTS.HEAD, 502), worn(PARTS.HAIR, 506)]), data)?.parts).toEqual(lookOf(player([]), data)?.parts);
  });

  it('an overcoat hides the armour it covers', () => {
    // OverCoatItemRenderCheck: PARTS_HAT over PARTS_CAP, PARTS_CLOTH over PARTS_UPPER_BODY
    const look = lookOf(player([worn(PARTS.UPPER, 700), worn(PARTS.CAP, 711), worn(PARTS.HAT, 731), worn(PARTS.CLOTH, 720)]), data);
    expect(look?.parts).toEqual([
      'models/part_malehead01.glb', 'models/part_malehair01.glb', 'models/part_malehand.glb', 'models/part_malefoot.glb',
      'models/part_mhat02hat.glb', 'models/part_mfas01cloth.glb',
    ]);
    // an expired overcoat is not drawn, and the armour shows again
    const expired = lookOf(player([worn(PARTS.CAP, 711), worn(PARTS.HAT, 731, 0x01)]), data);
    expect(expired?.parts).toContain('models/part_mcap02cap.glb');
    expect(expired?.parts).not.toContain('models/part_mhat02hat.glb');
  });

  describe('the parts a worn item hides', () => {
    const HAIR = 'models/part_malehair01.glb';
    const HEAD = 'models/part_malehead01.glb';
    const partsOf = (...items: WornPart[]): string[] => lookOf(player(items), data)?.parts ?? [];

    it('a helmet that hides the hair gives no hair part', () => {
      // dwBasePartsIgnore = PARTS_HAIR: MoverRender.cpp:400-406 hides the hair element
      const parts = partsOf(worn(PARTS.CAP, 710));
      expect(parts).not.toContain(HAIR);
      expect(parts).toContain(HEAD);
      expect(parts).toContain('models/part_mcap01cap.glb');
    });

    it('a cap that does not hide the hair keeps it', () => {
      expect(partsOf(worn(PARTS.CAP, 711))).toContain(HAIR);
    });

    it('a fashion hat hides the hair when its row says so, and keeps it when not', () => {
      expect(partsOf(worn(PARTS.HAT, 730))).not.toContain(HAIR);
      expect(partsOf(worn(PARTS.HAT, 731))).toContain(HAIR);
    });

    it('a hat that covers the head hides the head and the hair', () => {
      // :418-421: dwBasePartsIgnore == PARTS_HEAD hides PARTS_HAIR as well
      const parts = partsOf(worn(PARTS.HAT, 732));
      expect(parts).not.toContain(HEAD);
      expect(parts).not.toContain(HAIR);
      expect(parts).toContain('models/part_mhat03hat.glb');
    });

    it('a fashion hat decides over the cap under it: it shows the hair a helmet hid, and hides what a circlet showed', () => {
      expect(partsOf(worn(PARTS.CAP, 710), worn(PARTS.HAT, 731))).toContain(HAIR); // :423-427 un-hides it
      expect(partsOf(worn(PARTS.CAP, 710), worn(PARTS.HAT, 730))).not.toContain(HAIR);
      expect(partsOf(worn(PARTS.CAP, 711), worn(PARTS.HAT, 730))).not.toContain(HAIR);
      // an expired hat is not looked at (:413), so the cap decides
      expect(partsOf(worn(PARTS.CAP, 710), worn(PARTS.HAT, 731, 0x01))).not.toContain(HAIR);
    });

    it('an expired cap still hides the hair, as Neuz checks no flag there', () => {
      // the cap is not drawn (UpdateParts skips it), but MoverRender.cpp:403,462 hides what it ignores all the same
      const parts = partsOf(worn(PARTS.CAP, 710, 0x01));
      expect(parts).not.toContain(HAIR);
      expect(parts).not.toContain('models/part_mcap01cap.glb');
    });

    it('an exclusive item takes the bare part it names off', () => {
      // 750 names PARTS_HAND: no bare hand, but the bare lower body and foot stay (it names no PARTS_LOWER_BODY)
      expect(partsOf(worn(PARTS.UPPER, 750))).toEqual([
        HEAD, HAIR, 'models/part_mglv01upper.glb', 'models/part_malelower.glb', 'models/part_malefoot.glb',
      ]);
      // the slot it names still shows an item worn in it (UpdateParts loads the item before it asks abExclusiveParts)
      expect(partsOf(worn(PARTS.UPPER, 750), worn(PARTS.HAND, 506))).toContain('models/part_mvag01hand.glb');
    });

    it('the lower body goes only under an item whose row names it', () => {
      expect(partsOf(worn(PARTS.UPPER, 760))).toContain('models/part_malelower.glb');
      expect(partsOf(worn(PARTS.UPPER, 700))).not.toContain('models/part_malelower.glb');
      expect(partsOf(worn(PARTS.CLOTH, 720))).not.toContain('models/part_malelower.glb');
    });

    it('an expired item takes nothing off', () => {
      expect(partsOf(worn(PARTS.UPPER, 700, 0x01))).toContain('models/part_malelower.glb');
    });

    it('an items.json without the two fields hides nothing, as an "=" cell does', () => {
      const parts = partsOf(worn(PARTS.UPPER, 770), worn(PARTS.CAP, 771));
      expect(parts).toContain('models/part_malelower.glb');
      expect(parts).toContain(HAIR);
      expect(parts).toContain('models/part_mold01upper.glb');
    });

    it('hides the hair of the own character too, from the character list', () => {
      const own = moverFrom(addedPlayer(7, { self: true }), data);
      expect(lookOf(own, data, [710])?.parts).not.toContain(HAIR);
      expect(lookOf(own, data, [711])?.parts).toContain(HAIR);
    });
  });

  it("the player's own character is dressed from the character list's item ids, each in the slot its item says", () => {
    const own = moverFrom(addedPlayer(7, { self: true }), data);
    // the foot first, an id the converter has no model for (a weapon), then the upper: the parts come out in slot order
    expect(lookOf(own, data, [510, 12345, 502])?.parts).toEqual([
      'models/part_malehead01.glb', 'models/part_malehair01.glb', 'models/part_mvag01upper.glb',
      'models/part_malehand.glb', 'models/part_mvag01foot.glb',
    ]);
    // without the list it shows the bare body
    expect(lookOf(own, data)?.parts).toEqual(lookOf(player([]), data)?.parts);
    // another player is dressed from what its ADD_OBJ lists, not from the own character's list
    expect(lookOf(player([worn(PARTS.UPPER, 700)]), data, [502])?.parts).toContain('models/part_mmer01upper.glb');
  });

  it('gives the hair colour ADD_OBJ sent', () => {
    expect(lookOf(player([], { hairColor: 0xff8a5a3c }), data)?.hairColor).toBe(0xff8a5a3c);
  });
});

describe('lookOf: human NPCs', () => {
  it('is dressed like a player from the NPC part of its ADD_OBJ', () => {
    const npc = moverFrom(addedNpc(5, MI_FEMALE, {
      characterKey: 'MaFl_Female', hairMesh: 2, headMesh: 1, hairColor: 0xff112233, worn: [worn(PARTS.UPPER, 700)],
    }), data);
    expect(npc.kind).toBe('npc');
    const look = lookOf(npc, data);
    expect(look?.parts).toEqual([
      'models/part_femalehead02.glb', 'models/part_femalehair03.glb', 'models/part_fmer01upper.glb',
      'models/part_femalehand.glb', 'models/part_femalefoot.glb',
    ]);
    expect(look?.skeleton).toBe('skeletons/mvr_female.glb');
    expect(look?.hairColor).toBe(0xff112233);
  });

  it('takes its sex from the body index', () => {
    const look = lookOf(moverFrom(addedNpc(5, MI_MALE, { characterKey: 'MaFl_Male' }), data), data);
    expect(look?.parts[0]).toBe('models/part_malehead01.glb');
    expect(look?.skeleton).toBe('skeletons/mvr_male.glb');
  });
});

describe('lookOf: monsters and other NPCs', () => {
  it('a monster uses its model and skeleton', () => {
    const look = lookOf(moverFrom(addedNpc(9, 21), data), data);
    expect(look?.skeleton).toBe('skeletons/mvr_aibatt.glb');
    expect(look?.parts).toEqual(['models/mvr_aibatt.glb']);
    expect(look?.hairColor).toBeNull();
  });

  it('an NPC with a model of its own is drawn from it, not dressed', () => {
    const npc = moverFrom(addedNpc(9, 21, { characterKey: 'MaFl_Aibatt', hairColor: 0xff112233 }), data);
    expect(npc.kind).toBe('npc');
    const look = lookOf(npc, data);
    expect(look?.parts).toEqual(['models/mvr_aibatt.glb']);
    expect(look?.hairColor).toBeNull();
  });

  it('a model that is not animated has no skeleton', () => {
    const look = lookOf(moverFrom(addedNpc(9, 22), data), data);
    expect(look?.skeleton).toBeNull();
    expect(look?.parts).toEqual(['models/mvr_statue.glb']);
  });

  it('an unconverted model gives null', () => {
    expect(lookOf(moverFrom(addedNpc(9, 23), data), data)).toBeNull();
    expect(lookOf(moverFrom(addedNpc(9, 4242), data), data)).toBeNull(); // an index the table does not have
  });
});

describe('lookOf: motions', () => {
  it('names the motion file of the mover, and plays the standing one for a motion it lacks', () => {
    const look = lookOf(moverFrom(addedNpc(9, 21), data), data);
    expect(look?.motion(3)).toBe('motions/mvr_aibatt/mvr_aibatt_walk.glb');
    expect(look?.motion(9)).toBe('motions/mvr_aibatt/mvr_aibatt_stand.glb'); // CModelMng::MakeMotionName: MTI_STAND
  });

  it('gives null when even the standing motion is missing', () => {
    expect(lookOf(moverFrom(addedNpc(9, 22), data), data)?.motion(0)).toBeNull();
    expect(lookOf(moverFrom(addedNpc(9, 22), data), data)?.motion(3)).toBeNull();
  });

  it("uses the gender's motion files for a player", () => {
    const man = lookOf(player([]), data);
    expect(man?.motion(5)).toBe('motions/mvr_male/mvr_male_genrun.glb');
    expect(man?.motion(99)).toBe('motions/mvr_male/mvr_male_genstand.glb');
    const woman = lookOf(moverFrom(addedPlayer(2, { sex: 1 }, { index: MI_FEMALE }), data), data);
    expect(woman?.motion(5)).toBe('motions/mvr_female/mvr_female_genrun.glb');
  });

  it("falls back to the viewer's standing motion when the game data does not list the body", () => {
    const bare = gameDataOf();
    const man = lookOf(moverFrom(addedPlayer(1), bare), bare);
    expect(man?.motion(5)).toBe('motions/mvr_male/mvr_male_genstand.glb');
    const woman = lookOf(moverFrom(addedPlayer(2, { sex: 1 }, { index: MI_FEMALE }), bare), bare);
    expect(woman?.motion(0)).toBe('motions/mvr_female/mvr_female_genstand.glb');
  });
});
