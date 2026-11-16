import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { FOLLOW_FAR, pickSupportAction, supportBlocked } from '../src/world/autoplay/support';
import type { SupportInput } from '../src/world/autoplay/support';
import { defaultSettings } from '../src/world/autoplay/settings';

const HEAL = 3, CIRCLE = 4, BLESS = 6, HASTE = 7, RES = 9;
const ME = 1, PAL = 2;

function input(more: Partial<SupportInput> = {}): SupportInput {
  const s = defaultSettings().support;
  s.heals = [HEAL, CIRCLE];
  s.buffs = [BLESS, HASTE];
  return {
    self: { objectId: ME, hp: 1000, maxHp: 1000, pos: [0, 0, 0] as Vec3 },
    partner: { objectId: PAL, hp: 1000, maxHp: 1000, pos: [2, 0, 0] as Vec3, dead: false, buffs: [
      { buffType: 1, id: 106, level: 1, leftMs: 60_000, totalMs: 60_000 }, { buffType: 1, id: 107, level: 1, leftMs: 60_000, totalMs: 60_000 },
    ] },
    settings: s,
    ready: () => true,
    resurrectSkill: RES,
    buffSkillId: (i) => 100 + i,
    ...more,
  };
}

describe('Support mode (custom, owner 2026-11-17): what to do next', () => {
  it('all well and close → nothing', () => {
    expect(pickSupportAction(input())).toEqual({ kind: 'none' });
  });

  it('the partner under 70 % → the first ready heal on the partner', () => {
    const i = input();
    i.partner!.hp = 690;
    expect(pickSupportAction(i)).toEqual({ kind: 'cast', skillIndex: HEAL, targetId: PAL, why: 'heal' });
    expect(pickSupportAction({ ...i, ready: (s) => s !== HEAL })).toEqual({ kind: 'cast', skillIndex: CIRCLE, targetId: PAL, why: 'heal' });
  });

  it('myself under 50 % → a heal on myself, after the partner\'s', () => {
    const i = input();
    i.self.hp = 400;
    expect(pickSupportAction(i)).toEqual({ kind: 'cast', skillIndex: HEAL, targetId: ME, why: 'heal' });
    i.partner!.hp = 100;
    expect(pickSupportAction(i)).toEqual({ kind: 'cast', skillIndex: HEAL, targetId: PAL, why: 'heal' });
  });

  it('the partner dead with Resurrect on → resurrection first; off or not learned → nothing for them', () => {
    const i = input();
    i.partner!.dead = true;
    i.partner!.hp = 0;
    expect(pickSupportAction(i)).toEqual({ kind: 'cast', skillIndex: RES, targetId: PAL, why: 'resurrect' });
    i.settings.resurrect = false;
    expect(pickSupportAction(i).kind).not.toBe('cast');
    i.settings.resurrect = true;
    expect(pickSupportAction({ ...i, resurrectSkill: null }).kind).not.toBe('cast');
  });

  it('a partner buff missing or under 10 s → recast on the partner', () => {
    const i = input();
    i.partner!.buffs = [{ buffType: 1, id: 106, level: 1, leftMs: 9_000, totalMs: 60_000 }, { buffType: 1, id: 107, level: 1, leftMs: 60_000, totalMs: 60_000 }];
    expect(pickSupportAction(i)).toEqual({ kind: 'cast', skillIndex: BLESS, targetId: PAL, why: 'buff' });
    i.partner!.buffs = [i.partner!.buffs[0]!];
    i.partner!.buffs[0]!.leftMs = 60_000;
    expect(pickSupportAction(i)).toEqual({ kind: 'cast', skillIndex: HASTE, targetId: PAL, why: 'buff' });
  });

  it('a skill not ready (cooldown, MP) is passed over', () => {
    const i = input();
    i.partner!.buffs = [];
    expect(pickSupportAction({ ...i, ready: (s) => s === HASTE })).toEqual({ kind: 'cast', skillIndex: HASTE, targetId: PAL, why: 'buff' });
  });

  it('the partner farther than 4 m → follow (when nothing else is due)', () => {
    const i = input();
    i.partner!.pos = [FOLLOW_FAR + 1, 0, 0];
    expect(pickSupportAction(i)).toEqual({ kind: 'follow', targetId: PAL });
  });

  it('no partner in view → wait', () => {
    expect(pickSupportAction(input({ partner: null }))).toEqual({ kind: 'none' });
  });
});

describe('supportBlocked: fields and dungeons (owner 2026-11-17), not PvP', () => {
  it('Madrigal, an instance dungeon and a secret room allow it; the Arena, siege, 1:1 guild war and a duel do not', () => {
    for (const id of [1, 121, 151, 200, 211]) expect(supportBlocked(id, false), `world ${id}`).toBe(false);
    for (const id of [208, 202, 241]) expect(supportBlocked(id, false), `world ${id}`).toBe(true);
    expect(supportBlocked(1, true)).toBe(true);
  });
});
