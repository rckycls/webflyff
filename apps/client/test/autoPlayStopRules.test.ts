import { describe, expect, it } from 'vitest';
import { lowHpStop, stopReason } from '../src/world/autoplay/stopRules';
import type { AutoPlayEvent } from '../src/world/autoplay/stopRules';
import { AutoPlayStats } from '../src/world/autoplay/stats';

const NOBODY = new Set<number>();
const full = { hp: 1000, maxHp: 1000, mp: 0, maxMp: 0, fp: 0, maxFp: 0 };

describe('Auto Play stop rules (spec 6.8)', () => {
  it('died → "you died"', () => {
    expect(stopReason({ kind: 'died' }, NOBODY)).toBe('you died');
  });

  it('a player\'s hit → "attacked by <name>"; a monster\'s or a party member\'s → null', () => {
    expect(stopReason({ kind: 'hitBy', attackerId: 7, attackerIsPlayer: true, name: 'Bob' }, NOBODY)).toBe('attacked by Bob');
    expect(stopReason({ kind: 'hitBy', attackerId: 8, attackerIsPlayer: false, name: 'Aibatt' }, NOBODY)).toBeNull();
    expect(stopReason({ kind: 'hitBy', attackerId: 7, attackerIsPlayer: true, name: 'Bob' }, new Set([7]))).toBeNull();
  });

  it('a whisper or a GM talking in view → "message from <name>"', () => {
    expect(stopReason({ kind: 'whisper', from: 'GM_Ann' }, NOBODY)).toBe('message from GM_Ann');
    expect(stopReason({ kind: 'gmTalk', from: 'GM_Ann' }, NOBODY)).toBe('message from GM_Ann');
  });

  it('duelStart → "duel"; worldChange / replace / disconnect → "left the area"', () => {
    expect(stopReason({ kind: 'duelStart' }, NOBODY)).toBe('duel');
    for (const kind of ['worldChange', 'replace', 'disconnect'] as const) expect(stopReason({ kind }, NOBODY)).toBe('left the area');
  });

  it('manualControl → "you took control"; flying → "flying"', () => {
    expect(stopReason({ kind: 'manualControl' }, NOBODY)).toBe('you took control');
    expect(stopReason({ kind: 'flying' }, NOBODY)).toBe('flying');
  });

  it('bag full, kills, items, hits between others and skills are not stops', () => {
    const events: AutoPlayEvent[] = [
      { kind: 'bagFull' }, { kind: 'bagChanged' }, { kind: 'revived' }, { kind: 'kill', targetId: 1, pos: [0, 0, 0] },
      { kind: 'itemAppeared', id: 2, pos: [0, 0, 0] }, { kind: 'picked', id: 2 }, { kind: 'pickRefused', id: 2 },
      { kind: 'hit', attackerId: 1, victimId: 2 }, { kind: 'skillOk', skillIndex: 1 }, { kind: 'chainEnded' }, { kind: 'exp', gained: 5 },
    ];
    for (const e of events) expect(stopReason(e, NOBODY), e.kind).toBeNull();
  });

  it('lowHpStop: under 20 % with no HP item → true; with an item → false; at 20 % → false', () => {
    expect(lowHpStop({ ...full, hp: 190 }, false)).toBe(true);
    expect(lowHpStop({ ...full, hp: 190 }, true)).toBe(false);
    expect(lowHpStop({ ...full, hp: 200 }, false)).toBe(false);
    expect(lowHpStop({ ...full, hp: 0, maxHp: 0 }, false)).toBe(false);
  });
});

describe('AutoPlayStats', () => {
  it('counts kills, EXP, picks and potions, and shows them with the time', () => {
    const stats = new AutoPlayStats(1000);
    stats.onEvent({ kind: 'kill', targetId: 1, pos: [0, 0, 0] });
    stats.onEvent({ kind: 'kill', targetId: 2, pos: [0, 0, 0] });
    stats.onEvent({ kind: 'exp', gained: 1500 });
    stats.onEvent({ kind: 'exp', gained: 250 });
    stats.onEvent({ kind: 'picked', id: 9 });
    stats.potionUsed();
    expect([stats.kills, stats.exp, stats.picked, stats.potions]).toEqual([2, 1750, 1, 1]);
    expect(stats.lines(1000 + 3_900_000)).toEqual(['Time 1h5m', 'Kills 2', 'EXP +1,750', 'Items 1', 'Potions 1']);
  });
});
