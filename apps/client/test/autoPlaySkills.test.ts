import { describe, expect, it } from 'vitest';
import { SkillTimers, pickReadySkill } from '../src/world/autoplay/skillTimers';
import { buffOf, pickBuff } from '../src/world/autoplay/buffs';
import type { BuffEntry } from '../src/world/autoplay/settings';
import { BUFF_ITEM, BUFF_SKILL } from '../src/world/buffs';

describe('SkillTimers (custom, owner 2026-11-15; spec 6.4)', () => {
  const cooldowns = new Map([[3, 6000], [4, 0]]);
  const timers = () => new SkillTimers((i) => cooldowns.get(i) ?? 0);

  it('ready after the data cooldown, not before', () => {
    const t = timers();
    expect(t.ready(3, 0)).toBe(true);
    t.ok(3, 1000);
    expect(t.ready(3, 6999)).toBe(false);
    expect(t.ready(3, 7000)).toBe(true);
  });

  it('refused → not ready for 3 s', () => {
    const t = timers();
    t.refused(4, 0);
    expect(t.ready(4, 2999)).toBe(false);
    expect(t.ready(4, 3000)).toBe(true);
  });

  it('pickReadySkill: list order; a skill the character lacks or cannot pay for is skipped (Review Focus 4)', () => {
    const t = timers();
    const known = (i: number) => i !== 9;
    expect(pickReadySkill([9, 3, 4], t, () => true, known, 0)).toBe(3);
    t.ok(3, 0);
    expect(pickReadySkill([9, 3, 4], t, () => true, known, 100)).toBe(4);
    expect(pickReadySkill([9, 3, 4], t, (i) => i !== 4, known, 100)).toBeNull();
  });
});

describe('pickBuff (spec 6.7)', () => {
  const list: BuffEntry[] = [{ kind: 'skill', index: 5 }, { kind: 'item', index: 2001 }];
  // the skill entry's buff: its skill id (the own skill slot 5 holds skill 40)
  const of = (e: BuffEntry) => buffOf(e, (slot) => (slot === 5 ? 40 : undefined));
  const usable = () => true;

  it('a missing buff is chosen', () => {
    expect(pickBuff(list, [{ buffType: BUFF_ITEM, id: 2001, level: 1, leftMs: 60_000, totalMs: 60_000 }], of, usable, 0)).toEqual(list[0]);
  });

  it('9 s left → chosen, 11 s → not; an endless buff (totalMs 0) → not', () => {
    const buff = (leftMs: number, totalMs = 60_000) => [
      { buffType: BUFF_SKILL, id: 40, level: 1, leftMs, totalMs }, { buffType: BUFF_ITEM, id: 2001, level: 1, leftMs: 60_000, totalMs: 60_000 },
    ];
    expect(pickBuff(list, buff(9_000), of, usable, 0)).toEqual(list[0]);
    expect(pickBuff(list, buff(11_000), of, usable, 0)).toBeNull();
    expect(pickBuff(list, buff(0, 0), of, usable, 0)).toBeNull();
  });

  it('an entry that cannot be used now (no item, MP short) is skipped (Review Focus 4)', () => {
    expect(pickBuff(list, [], of, (e) => e.kind === 'item', 0)).toEqual(list[1]);
    expect(pickBuff(list, [], of, () => false, 0)).toBeNull();
  });

  it('buffOf: a skill entry → (BUFF_SKILL, its skill id); an item → (BUFF_ITEM, item index); an unknown skill slot → null', () => {
    expect(of({ kind: 'skill', index: 5 })).toEqual({ buffType: BUFF_SKILL, id: 40 });
    expect(of({ kind: 'item', index: 2001 })).toEqual({ buffType: BUFF_ITEM, id: 2001 });
    expect(of({ kind: 'skill', index: 6 })).toBeNull();
  });
});
