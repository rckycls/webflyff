import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { NULL_ID } from '@flyffweb/protocol';
import { Missiles } from '../src/world/combat/missiles';
import type { MissileLaunch, MissileWorld } from '../src/world/combat/missiles';

const f32 = Math.fround;
const OWN = 9000;
const MONSTER = 9001;
const OTHER = 9002;
const XI_HIT_WAND01 = 22;
const XI_FIR_WAND01 = 27;
const XI_HIT_BOW01 = 33;
const XI_ITEM_RANGE_ATK1 = 112;

interface FakeMover { act: { body: { pos: Vec3 }; isDie(): boolean } }
const moverAt = (pos: Vec3, dead = false): FakeMover => ({ act: { body: { pos }, isDie: () => dead } });

/** The own player at the origin, a monster 10 m east with a 1 x 2 x 1 box, another player beside the own one. */
function world(): { movers: Map<number, FakeMover>; view: MissileWorld; kill(id: number): void } {
  const movers = new Map<number, FakeMover>([
    [OWN, moverAt([0, 0, 0])], [MONSTER, moverAt([10, 0, 0])], [OTHER, moverAt([0, 0, 2])],
  ]);
  const view: MissileWorld = {
    movers,
    boxOf: (id) => (movers.has(id) ? { min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5], scale: 1 } : undefined),
  };
  return { movers, view, kill: (id) => movers.set(id, moverAt(movers.get(id)!.act.body.pos, true)) };
}

function recorder() {
  const reports: unknown[][] = [];
  return {
    reports,
    shots: {
      hit: (...args: unknown[]) => void reports.push(['hit', ...args]),
      clear: (...args: unknown[]) => void reports.push(['clear', ...args]),
    },
  };
}

const wand = (over: Partial<MissileLaunch> = {}): MissileLaunch => ({
  cls: 'wand', sourceId: OWN, targetId: MONSTER, from: [0, 1, 0], flightXi: XI_FIR_WAND01, hitXi: XI_HIT_WAND01, scale: 1.7,
  report: { sfxHitId: 5, power: 2, skill: NULL_ID }, ...over,
});
const arrow = (over: Partial<MissileLaunch> = {}): MissileLaunch => ({
  cls: 'arrow', sourceId: OWN, targetId: MONSTER, from: [0, 1, 0], flightXi: XI_ITEM_RANGE_ATK1, hitXi: XI_HIT_BOW01,
  scale: 1, report: { sfxHitId: 6, power: 0, skill: NULL_ID }, ...over,
});

describe('Missiles: the wand\'s CSfxItemWandAtk1 (Sfx.cpp:836-951)', () => {
  it("a wand missile homes at 0.2 m a tick on the target's middle, made 0.01 m up (SetSfx)", () => {
    const { view } = world();
    const missiles = new Missiles(recorder().shots);
    missiles.launch(wand());
    expect(missiles.views()[0]!.pos).toEqual([0, Math.fround(1.01), 0]);
    missiles.step(view);
    const [x, y] = missiles.views()[0]!.pos;
    expect(x).toBeCloseTo(0.2, 5);
    expect(y).toBeCloseTo(1.01 - 0.0002, 4); // toward the target's middle, |vMax.y| / 2 = 1 m up
    expect(missiles.views()[0]).toMatchObject({ xi: XI_FIR_WAND01, scale: 1.7, loopFrame: 20 });
  });

  it("it arrives inside a third of the box's half sum, reports the next tick, and plays sfx_HitWand01 1 m up", () => {
    const { view } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(wand());
    for (let i = 0; i < 48; i++) expect(missiles.step(view)).toEqual([]);
    // the 49th step: 0.2 m from the target's middle, inside (1 + 1) / 2 / 3: the hit model, no report yet
    const hits = missiles.step(view);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ xi: XI_HIT_WAND01, sourceId: OWN, targetId: MONSTER });
    expect(hits[0]!.pos[0]).toBeCloseTo(9.8, 3);
    expect(hits[0]!.pos[1]).toBeCloseTo(2, 2);
    expect(reports).toEqual([]);
    expect(missiles.views()).toEqual([]);
    missiles.step(view);
    expect(reports).toEqual([['hit', 5, 2, NULL_ID, OWN, 0, 0, 0]]);
    missiles.step(view);
    expect(reports).toHaveLength(1);
  });

  it('a target dead in flight, or dead before the report, clears the shot', () => {
    const { view, kill } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(wand());
    missiles.step(view);
    kill(MONSTER);
    missiles.step(view);
    expect(reports).toEqual([['clear', 5, OWN]]);
    expect(missiles.views()).toEqual([]);
  });

  it('600 ticks without arriving clears the shot (m_nFrame >= SEC1 * 10)', () => {
    const { view, movers } = world();
    movers.set(MONSTER, moverAt([1000, 0, 0]));
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(wand());
    for (let i = 0; i < 599; i++) missiles.step(view);
    expect(reports).toEqual([]);
    missiles.step(view);
    expect(reports).toEqual([['clear', 5, OWN]]);
  });

  it("another player's missile flies and reports nothing", () => {
    const { view } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(wand({ sourceId: OTHER, report: null }));
    let hits = 0;
    for (let i = 0; i < 60; i++) hits += missiles.step(view).length;
    expect(hits).toBe(1);
    expect(reports).toEqual([]);
  });

  it('dispose drops every missile without reporting', () => {
    const { view } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(wand());
    missiles.launch(arrow());
    missiles.step(view);
    missiles.dispose();
    missiles.step(view);
    expect(missiles.views()).toEqual([]);
    expect(reports).toEqual([]);
  });
});

describe("Missiles: the bow's CSfxItemRangeAtk1 (Sfx.cpp:954-1072)", () => {
  it('an arrow flies at 0.7 m a tick to the target + 1 m, arrives within 0.4 m, reports and plays its hit effect at once', () => {
    const { view } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(arrow());
    for (let i = 0; i < 13; i++) expect(missiles.step(view)).toEqual([]);
    const hits = missiles.step(view);
    expect(reports).toEqual([['hit', 6, 0, NULL_ID, OWN, 0, 0, 0]]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ xi: XI_HIT_BOW01, sourceId: OWN, targetId: MONSTER });
    expect(hits[0]!.angle).toBeCloseTo(90, 3); // SetAngle( m_vRotate.y ): the arrow's yaw, east
    expect(missiles.views()).toEqual([]);
  });

  it('a target gone clears the shot; a dead one is still flown at and hit (no IsDie test)', () => {
    const gone = world();
    const first = recorder();
    const a = new Missiles(first.shots);
    a.launch(arrow());
    a.step(gone.view);
    gone.movers.delete(MONSTER);
    a.step(gone.view);
    expect(first.reports).toEqual([['clear', 6, OWN]]);

    const dead = world();
    const second = recorder();
    const b = new Missiles(second.shots);
    b.launch(arrow());
    dead.kill(MONSTER);
    for (let i = 0; i < 14; i++) b.step(dead.view);
    expect(second.reports).toEqual([['hit', 6, 0, NULL_ID, OWN, 0, 0, 0]]);
  });

  it('the views turn +Z to the target as pitch, yaw and roll (QuaternionRotationToYPW, xUtil3D.cpp)', () => {
    const { view } = world();
    const missiles = new Missiles(recorder().shots);
    missiles.launch(arrow({ from: [0, 0.99, 0] })); // level with its aim, the target + 1 m, once made 0.01 m up
    missiles.step(view);
    const [pitch, yaw, roll] = missiles.views()[0]!.rotation;
    expect(yaw).toBeCloseTo(90, 3);
    expect(pitch).toBeCloseTo(0, 1);
    expect(roll).toBeCloseTo(0, 3);
    expect(missiles.views()[0]!.loopFrame).toBeNull();
  });
});

describe('Missiles: a monster\'s missile at the own player (CSfx::DamageToTarget, SfxObj.cpp:107-133)', () => {
  it('reports with the monster as the attacker', () => {
    const { view } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(wand({ sourceId: MONSTER, targetId: OWN, from: [10, 1, 0], report: { sfxHitId: 77, power: 0, skill: NULL_ID } }));
    for (let i = 0; i < 60; i++) missiles.step(view);
    expect(reports).toEqual([['hit', 77, 0, NULL_ID, MONSTER, 0, 0, 0]]);
  });

  it('a monster gone from view before the hit reports nothing and clears with the monster', () => {
    const { view, movers } = world();
    const { reports, shots } = recorder();
    const missiles = new Missiles(shots);
    missiles.launch(arrow({ sourceId: MONSTER, targetId: OWN, from: [10, 1, 0], report: { sfxHitId: 77, power: 0, skill: NULL_ID } }));
    missiles.step(view);
    movers.delete(MONSTER);
    for (let i = 0; i < 20; i++) missiles.step(view);
    expect(reports).toEqual([['clear', 77, MONSTER]]);
  });
});

describe('Missiles: the thrown yoyo (CSfxItemYoyoAtk::MakePath and Process, Sfx.cpp:1118-1348; Piece 7 M2)', () => {
  const XI_ITEM_YOYO_ATK1 = 116;
  const HAND: Vec3 = [0.3, 1, 0];

  /** The own player at the origin throws at a monster at `targetAt` from its right hand; the flight, tick by tick. */
  function throwAt(targetAt: Vec3) {
    const w = world();
    w.movers.set(MONSTER, moverAt(targetAt));
    const r = recorder();
    const missiles = new Missiles(r.shots);
    const view: MissileWorld = { ...w.view, handOf: () => HAND };
    missiles.launch({
      cls: 'yoyo', sourceId: OWN, targetId: MONSTER, from: HAND, flightXi: XI_ITEM_YOYO_ATK1, hitXi: -1, scale: 1, report: null,
      yoyo: { hand: 'right', sourceAt: [0, 0, 0], dest: [targetAt[0], targetAt[1] + 1, targetAt[2]] },
    });
    const first = missiles.views()[0]!;
    let reach = 0;
    let last = first.pos;
    let ticks = 0;
    while (missiles.views().length > 0 && ticks < 400) {
      const [now] = missiles.views();
      reach = Math.max(reach, Math.hypot(now!.pos[0], now!.pos[2]));
      last = now!.pos;
      expect(missiles.step(view)).toEqual([]); // drawing only: no hit effect, no arrival test
      ticks++;
    }
    return { first, reach, last, ticks, reports: r.reports };
  }

  it('the thrown yoyo goes out to the target and back along MakePath, its length clamped to 12/5-49/5', () => {
    // 5.7 m from the hand: |dest - pos|² = 32.49, over 5 = 6.498 m, and the far point 1.2 m past it
    const six = throwAt([6, 0, 0]);
    expect(six.first).toMatchObject({ xi: XI_ITEM_YOYO_ATK1, rotation: [0, 0, 0], scale: 1, loopFrame: null });
    expect(six.first.pos).toEqual([f32(0.3), f32(1.01), 0]);
    expect(six.reach).toBeCloseTo(6.498 + 1.2, 2);
    expect(Math.hypot(six.last[0] - HAND[0], six.last[1] - HAND[1], six.last[2] - HAND[2])).toBeLessThan(0.75);
    expect(six.ticks).toBeLessThan(300);
    expect(six.reports).toEqual([]);
    // past 7 m it flies 49/5; under 3 m, 12/5
    expect(throwAt([20, 0, 0]).reach).toBeCloseTo(9.8 + 1.2, 2);
    expect(throwAt([1, 0, 0]).reach).toBeCloseTo(2.4 + 1.2, 2);
  });

  it('a thrown yoyo goes with its thrower', () => {
    const w = world();
    const missiles = new Missiles(recorder().shots);
    missiles.launch({
      cls: 'yoyo', sourceId: OTHER, targetId: MONSTER, from: HAND, flightXi: XI_ITEM_YOYO_ATK1, hitXi: -1, scale: 1, report: null,
      yoyo: { hand: 'left', sourceAt: [0, 0, 2], dest: [10, 1, 0] },
    });
    missiles.step(w.view);
    w.movers.delete(OTHER);
    missiles.step(w.view);
    expect(missiles.views()).toEqual([]);
  });
});

describe('Missiles: the skills\' (ShootSkill, CreateShootSfx and the classes of Sfx.cpp; Piece 7 M2)', () => {
  const report = (sfxHitId: number, skill: number) => ({ sfxHitId, power: 3, skill });
  /** Flies one missile of the own player at the monster 10 m east; the ticks, the hits and the reports, tick by tick. */
  function fly(launch: Partial<MissileLaunch> & Pick<MissileLaunch, 'cls'>, ticks = 200, rank = 0) {
    const w = world();
    const r = recorder();
    const pushes: Array<[number, Vec3]> = [];
    const missiles = new Missiles(r.shots, () => {}, (id, delta) => void pushes.push([id, delta]));
    const view: MissileWorld = { ...w.view, rankOf: () => rank };
    missiles.launch({
      sourceId: OWN, targetId: MONSTER, from: [0, 1, 0], flightXi: 1, hitXi: 2, scale: 1, report: report(5, 112), ...launch,
    });
    const log: Array<{ tick: number; hits: ReturnType<Missiles['step']>; reports: number }> = [];
    const first = missiles.views();
    // on while one is drawn, and a tick past a hit, whose report may be the next tick's
    let more = true;
    for (let tick = 1; tick <= ticks && more; tick++) {
      const hits = missiles.step(view);
      log.push({ tick, hits, reports: r.reports.length });
      more = missiles.views().length > 0 || hits.length > 0;
    }
    return { log, reports: r.reports, pushes, first, missiles, w, view };
  }
  const hitTick = (log: ReturnType<typeof fly>['log']) => log.find((l) => l.hits.length > 0)?.tick;
  const reportTick = (log: ReturnType<typeof fly>['log']) => log.find((l) => l.reports > 0)?.tick;

  it('CSfxShoot reports on the arrival tick and makes dwSfxObj3 at the target', () => {
    const { log, reports } = fly({ cls: 'shoot', hitXi: 236 });
    // 0.2 a tick from (0, 1.01, 0) to the monster + 1 m: under 0.2 at the 50th
    expect(reportTick(log)).toBe(hitTick(log));
    expect(hitTick(log)).toBe(50);
    expect(log.find((l) => l.hits.length > 0)!.hits[0]).toMatchObject({ xi: 236 });
    expect(reports).toEqual([['hit', 5, 3, 112, OWN, 0, 0, 0]]);
  });

  it("a bow skill's arrow starts at the left hand, 0.7 a tick, < 0.4", () => {
    const { log, first } = fly({ cls: 'skillArrow', from: [0.2, 1.3, 0.1], hitXi: 545 });
    expect(first[0]!.pos).toEqual([f32(0.2), f32(1.31), f32(0.1)]);
    expect(hitTick(log)).toBe(14); // 9.8 m at 0.7, under 0.4
  });

  it('Junk Bow is drawn three times', () => {
    const { first } = fly({ cls: 'junkBow', hitXi: 545 }, 1);
    expect(first.map((v) => f32(v.pos[1] - first[0]!.pos[1]))).toEqual([0, f32(0.5), f32(-0.5)]);
    expect(new Set(first.map((v) => v.id)).size).toBe(3);
  });

  it('Sword Wind and Strong Wind fly feet to feet and report the next tick', () => {
    // from (0, 0.01, 0) to (10, 0, 0) at 0.2: under 0.4 left after 49 steps, under 0.2 after 50
    for (const [cls, xi, steps] of [['swordWind', 1737, 49], ['strongWind', 1736, 50]] as const) {
      const { log, first } = fly({ cls, from: [0, 0, 0], hitXi: xi });
      expect(first[0]!.pos[1]).toBe(f32(0.01));
      const arrived = hitTick(log)!;
      expect(arrived).toBe(steps);
      expect(reportTick(log)).toBe(arrived + 1);
      expect(log[arrived - 1]!.hits[0]).toMatchObject({ xi });
    }
  });

  it("Strong Wind's report carries the angle and 0.4, and none for a RANK_SUPER or RANK_MIDBOSS target", () => {
    const east = fly({ cls: 'strongWind', from: [0, 0, 0], hitXi: 1736, push: f32(0.4) });
    expect(east.reports[0]).toEqual(['hit', 5, 3, 112, OWN, 0, 90, f32(0.4)]);
    for (const rank of [7, 5]) expect(fly({ cls: 'strongWind', from: [0, 0, 0], hitXi: 1736, push: f32(0.4) }, 200, rank).reports[0]).toEqual(['hit', 5, 3, 112, OWN, 0, 0, 0]);
  });

  it('Strong Wind pushes its target 0.4 a tick, 0.9 times less each tick', () => {
    const { pushes } = fly({ cls: 'strongWind', from: [0, 0, 0], hitXi: 1736, push: f32(0.4) });
    expect(pushes).toHaveLength(1);
    const [id, delta] = pushes[0]!;
    expect(id).toBe(MONSTER);
    expect(delta[0]).toBeCloseTo(0.4, 5); // AngleToVectorXZ( 90, 0.4 ): east
    expect(delta[2]).toBeCloseTo(0, 5);
  });

  it('Boomerang, Ice Missile, Lightning Ball and Spike Stone aim at the target + 0.3 and hit at scale 2', () => {
    const { log } = fly({ cls: 'straight', hitXi: 1738 });
    const hit = log.find((l) => l.hits.length > 0)!;
    expect(hit.hits[0]).toMatchObject({ xi: 1738, pos: [10, f32(0.3), 0], scale: 2 });
    expect(reportTick(log)).toBe(hit.tick + 1);
  });

  it("Guillotine's wave keeps the target's height, 0.25 a tick", () => {
    const { log } = fly({ cls: 'wave', from: [0, 1, 0], hitXi: 230 });
    const hit = log.find((l) => l.hits.length > 0)!;
    expect(hit.tick).toBe(Math.ceil((Math.hypot(10, 1.01) - 0.4) / 0.25));
    expect(hit.hits[0]).toMatchObject({ xi: 230, scale: 2 });
    expect(reportTick(log)).toBe(hit.tick);
  });

  it('Hot Air reports once at once with its max hit count, and ends at dwSkillTime', () => {
    // dwSkillTime 3000, dwPainTime 1000: 4 hits on the server, one SFX_HIT here (plan, Decisions 11); 180 ticks
    const { log, reports } = fly({ cls: 'hotAir', from: [0, 0, 0], hitXi: 1739, hotAir: { painTicks: 60, lastTicks: 180, maxDmgCnt: 4 } }, 400);
    expect(reports).toEqual([['hit', 5, 3, 112, OWN, 1, 0, 0]]);
    expect(reportTick(log)).toBe(1);
    expect(log[0]!.hits[0]).toMatchObject({ xi: 1739, pos: [10, 0, 0] });
    expect(log.length).toBe(181); // gone after its 180 ticks, with no SFX_CLEAR: its hits were all counted
  });

  it("Arrow Rain's hit plays its rain and reports once", () => {
    const { log, reports } = fly({ cls: 'skillArrow', hitXi: 557 });
    expect(log.filter((l) => l.hits.length > 0).map((l) => l.hits[0]!.xi)).toEqual([557]);
    expect(reports).toHaveLength(1);
  });
});
