import { describe, expect, it } from 'vitest';
import { letterRefusal, rulesStep } from '../src/body';

describe('rulesStep', () => {
  it('runs as WorldScreen.step: the role (Auto Play) before the attack loop, which gets the clock (a wand\'s shot)', () => {
    const calls: string[] = [];
    const own = { objectId: 1 };
    rulesStep({
      world: { self: () => own, movers: new Map(), step: () => calls.push('world.step') },
      ownMover: { control: () => calls.push('control'), corrected: () => calls.push('corrected') },
      attack: { onReleased: () => calls.push('onReleased'), step: (branch: boolean, now?: number) => { calls.push(`attack.step ${branch} ${now}`); return true; } },
      skillUse: { step: () => { calls.push('skillUse.step'); return false; } },
      take: () => calls.push('take'),
      views: { step: () => calls.push('views.step') },
    } as never, 123, () => calls.push('role'));
    expect(calls).toEqual(['onReleased', 'role', 'skillUse.step', 'attack.step false 123', 'control', 'world.step', 'corrected', 'take', 'views.step']);
  });
});

describe('letterRefusal', () => {
  it('lets a town bot (D) play, and a GM (P) only in the setup', () => {
    expect(letterRefusal(0x44, false)).toBeUndefined();
    expect(letterRefusal(0x50, true)).toBeUndefined();
    expect(letterRefusal(0x50, false)).toMatch(/letter P/);
    expect(letterRefusal(0x46, false)).toMatch(/letter F/);
    expect(letterRefusal(0x44, true)).toMatch(/setup/);
  });
});
