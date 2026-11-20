import { describe, expect, it } from 'vitest';
import { headlessHooks } from '../src/hooks';
import type { BotParts } from '../src/hooks';

/** The parts the hooks read, as small fakes: only what each test looks at. */
function fakeParts() {
  const pressed: Array<[number, boolean]> = [];
  const walked: number[][] = [];
  const own = { hp: 30, maxHp: () => 100, mp: 5, maxMp: () => 10, fp: 1, maxFp: () => 2, inventory: new Map(), inventorySlots: [], skills: [], taskBar: undefined };
  const self = { objectId: 1, act: { isDie: () => false, isFlying: () => false, body: { pos: [0, 0, 0] }, clearDest: () => {} }, buffs: { list: () => [] } };
  const movers = new Map<number, unknown>([[1, self], [2, { objectId: 2, kind: 'player' }], [3, { objectId: 3, kind: 'monster', added: { index: 20 } }]]);
  const parts = {
    data: { movers: new Map(), skills: new Map(), itemProps: new Map() },
    worldId: () => 1,
    world: () => ({ self: () => self, movers, nowMs: () => 1234, groundItems: new Map([[9, {}]]), handItem: () => null, moverByPlayerId: () => undefined }),
    own: () => own,
    focus: () => ({ targetId: null, select: () => {} }),
    attack: () => ({ onMoverPressed: (id: number, _now: number, second: boolean) => pressed.push([id, second]), stop: () => {} }),
    ownMover: () => ({ walkTo: (_self: unknown, pos: number[]) => walked.push(pos) }),
    skillUse: () => undefined,
    itemUse: () => undefined,
    ground: () => undefined,
    now: () => 50,
  } as unknown as BotParts;
  return { parts, pressed, walked };
}

describe('headlessHooks', () => {
  it('has no weekly hours: no limit, nothing counted', () => {
    const hooks = headlessHooks(fakeParts().parts);
    expect(hooks.usageLeftMin()).toBeNull();
    expect(() => hooks.usageTick(60_000)).not.toThrow();
  });

  it('never loots: no pick, no item seen there', () => {
    const hooks = headlessHooks(fakeParts().parts);
    expect(hooks.pick(9)).toBe(false);
    expect(hooks.itemThere(9)).toBe(false);
  });

  it('engages a monster as a double click: a press, then the second press', () => {
    const { parts, pressed } = fakeParts();
    headlessHooks(parts).engage(3);
    expect(pressed).toEqual([[3, false], [3, true]]);
  });

  it('reads the gauges, the movers and the world from the parts', () => {
    const { parts, walked } = fakeParts();
    const hooks = headlessHooks(parts);
    expect(hooks.gauges()).toEqual({ hp: 30, maxHp: 100, mp: 5, maxMp: 10, fp: 1, maxFp: 2 });
    expect(hooks.isPlayer(2)).toBe(true);
    expect(hooks.isPlayer(3)).toBe(false);
    expect(hooks.worldId()).toBe(1);
    expect(hooks.now()).toBe(1234);
    expect(hooks.partyIds().size).toBe(0);
    hooks.walkTo([5, 0, 5]);
    expect(walked).toEqual([[5, 0, 5]]);
  });
});
