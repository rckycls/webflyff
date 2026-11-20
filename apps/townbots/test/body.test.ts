import { describe, expect, it } from 'vitest';
import { letterRefusal, renameMover, rulesStep } from '../src/body';

describe('renameMover', () => {
  it("gives a renamed player's mover its new name, as WorldScreen.renamePlayer does", () => {
    const player = { kind: 'player', name: 'Abcd', added: { player: { playerId: 7, name: 'Abcd' } } };
    const world = { moverByPlayerId: (id: number) => (id === 7 ? player : undefined) };
    renameMover(world as never, 7, 'ZorbyTrel');
    expect(player.name).toBe('ZorbyTrel');
    expect(player.added.player.name).toBe('ZorbyTrel');
    expect(() => renameMover(world as never, 8, 'Nobody')).not.toThrow();
  });
});

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
  it('lets a bot play with a player letter (A-F: the VIP ones, the bot letter D, a plain F), a GM (P) only in the setup', () => {
    for (const letter of 'ABCDEF') expect(letterRefusal(letter.charCodeAt(0), false)).toBeUndefined();
    expect(letterRefusal(0x50, true)).toBeUndefined();
    expect(letterRefusal(0x50, false)).toMatch(/letter P/);
    for (const letter of 'GHLOZ') expect(letterRefusal(letter.charCodeAt(0), false)).toMatch(new RegExp(`letter ${letter}`));
    expect(letterRefusal(0x44, true)).toMatch(/setup/);
    expect(letterRefusal(0x45, true)).toMatch(/setup/);
  });
});
