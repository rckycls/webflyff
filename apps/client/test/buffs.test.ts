// A mover's buffs as the client keeps them (Piece 7 M2, [R §10]): CBuffMgr's client part (`_Common/buff.cpp`).

import { describe, expect, it } from 'vitest';
import { MoverBuffs, joinBuffParams } from '../src/world/buffs';

const SKILL = 1;
const ITEM2 = 3;
const FRAME = 1000 / 60;

describe('MoverBuffs (CBuffMgr, buff.cpp)', () => {
  it('a buff added times out after its length, checked every 64 frames', () => {
    const buffs = new MoverBuffs();
    buffs.add(SKILL, 49, 3, 1000, 0); // Heap Up, 1 s
    let now = 0;
    let gone: number | null = null;
    for (let frame = 1; frame <= 200 && gone === null; frame++) {
      now = frame * FRAME;
      buffs.step(now);
      if (buffs.list(now).length === 0) gone = frame;
    }
    // past 1000 ms at frame 60, and the 64th frame is the first check after it
    expect(gone).toBe(64);
  });

  it('a same-level refresh keeps the longer time and restarts the clock', () => {
    const buffs = new MoverBuffs();
    buffs.add(SKILL, 49, 3, 60000, 0);
    buffs.add(SKILL, 49, 3, 30000, 10000);
    expect(buffs.list(10000)).toEqual([{ buffType: SKILL, id: 49, level: 3, leftMs: 60000, totalMs: 60000 }]);
    // another level replaces it
    buffs.add(SKILL, 49, 4, 30000, 20000);
    expect(buffs.list(20000)).toEqual([{ buffType: SKILL, id: 49, level: 4, leftMs: 30000, totalMs: 30000 }]);
  });

  it('REMOVEALLSKILLINFULENCE drops the skill buffs', () => {
    const buffs = new MoverBuffs();
    buffs.add(SKILL, 49, 3, 60000, 0);
    buffs.add(ITEM2, 10270, -3600, 0, 0);
    buffs.removeCommon();
    expect(buffs.list(0).map((b) => b.id)).toEqual([10270]);
    buffs.remove(ITEM2, 10270);
    expect(buffs.list(0)).toEqual([]);
  });

  it("a BUFF_ITEM2's time is its level, the seconds it had left; it is the server's to end (2026-11-05)", () => {
    const buffs = new MoverBuffs();
    buffs.add(ITEM2, 10270, 7200, 0, 1000); // 2 hours left when it came
    expect(buffs.list(11_000)).toEqual([{ buffType: ITEM2, id: 10270, level: 7200, leftMs: 7_190_000, totalMs: 7_200_000 }]);
    for (let frame = 1; frame <= 128; frame++) buffs.step(8_000_000 + frame);
    expect(buffs.list(8_000_200)).toEqual([{ buffType: ITEM2, id: 10270, level: 7200, leftMs: 0, totalMs: 7_200_000 }]);
  });

  it('the list is in ascending skill id', () => {
    const buffs = new MoverBuffs();
    for (const id of [52, 20, 49]) buffs.add(SKILL, id, 1, 60000, 0);
    expect(buffs.list(0).map((b) => b.id)).toEqual([20, 49, 52]);
  });
});

describe('joinBuffParams (2026-11-13: the own ADD_OBJ\'s buffs, as ApplyParam adds them at the JOIN)', () => {
  it('a skill buff its level\'s first two parameters, an item buff its own; none for a pet\'s, a heal or a state', () => {
    const skill = (id: number, level: number) => {
      if (id === 317) return { destParams: [11, -1], adjParams: [level * 5 + 5, -1] }; // Quick Step (Event): DST_SPEED
      if (id === 50) return { destParams: [64, 38], adjParams: [0x8, 100] }; // a stun (CHS_STUN) and a heal (DST_HP)
      return undefined;
    };
    const item = (id: number) => (id === 26205 ? { destParams: [1, 2, 3], adjParams: [4, 5, 6] } : undefined);
    expect(joinBuffParams([
      { buffType: SKILL, id: 317, level: 2 }, { buffType: 0, id: 26205, level: 1 }, { buffType: ITEM2, id: 26205, level: 99 },
      { buffType: 2, id: 317, level: 1 }, { buffType: SKILL, id: 50, level: 1 }, { buffType: SKILL, id: 999, level: 1 },
    ], skill, item)).toEqual([
      { dst: 11, adj: 15 }, { dst: 1, adj: 4 }, { dst: 2, adj: 5 }, { dst: 1, adj: 4 }, { dst: 2, adj: 5 },
    ]);
  });

  it('MoverBuffs.has: HasBuff', () => {
    const buffs = new MoverBuffs();
    buffs.add(SKILL, 317, 2, 1000, 0);
    expect([buffs.has(SKILL, 317), buffs.has(0, 317), buffs.has(SKILL, 318)]).toEqual([true, false, false]);
  });
});
