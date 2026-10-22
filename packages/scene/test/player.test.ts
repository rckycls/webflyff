import { describe, expect, it } from 'vitest';
import { d3dColor, noonLight } from '../src/world/lighting';
import {
  CHASE_DISTANCE,
  CHASE_LOOK_HEIGHT,
  CHASE_PITCH,
  RUN_SPEED,
  Route,
  TURN_SPEED,
  WALK_SPEED,
  chaseCamera,
  forwardOf,
  headingOf,
  steer,
} from '../src/world/player';

describe('heading', () => {
  it('faces -z (D3D +z) at 0 and turns toward +x as it grows', () => {
    const [x0, z0] = forwardOf(0);
    expect(x0).toBeCloseTo(0);
    expect(z0).toBeCloseTo(-1);
    const [x1, z1] = forwardOf(Math.PI / 2);
    expect(x1).toBeCloseTo(1);
    expect(z1).toBeCloseTo(0);
  });

  it('headingOf is the heading that faces a direction', () => {
    for (const h of [0, 0.393, 1, -2, 3]) {
      const [x, z] = forwardOf(h);
      expect(Math.cos(headingOf(x, z) - h)).toBeCloseTo(1);
    }
  });
});

describe('steer', () => {
  it('stands still without input', () => {
    const player = { x: 1, z: 2, heading: 0.5 };
    expect(steer(player, { forward: 0, turn: 0, run: false }, 0.1)).toBe('stand');
    expect(player).toEqual({ x: 1, z: 2, heading: 0.5 });
  });

  it('walks at 6 m/s and runs at 12 m/s along the heading', () => {
    const walker = { x: 0, z: 0, heading: Math.PI / 2 };
    expect(steer(walker, { forward: 1, turn: 0, run: false }, 0.5)).toBe('walk');
    expect(walker.x).toBeCloseTo(WALK_SPEED * 0.5);
    expect(walker.z).toBeCloseTo(0);
    expect(WALK_SPEED).toBe(6);

    const runner = { x: 0, z: 0, heading: 0 };
    expect(steer(runner, { forward: 1, turn: 0, run: true }, 0.5)).toBe('run');
    expect(runner.z).toBeCloseTo(-RUN_SPEED * 0.5);
    expect(RUN_SPEED).toBe(12);
  });

  it('walks backward at walking speed, even with run held', () => {
    const player = { x: 0, z: 0, heading: 0 };
    expect(steer(player, { forward: -1, turn: 0, run: true }, 1)).toBe('walk');
    expect(player.z).toBeCloseTo(WALK_SPEED);
  });

  it('turns at TURN_SPEED, right for a positive turn', () => {
    const player = { x: 0, z: 0, heading: 0 };
    expect(steer(player, { forward: 0, turn: 1, run: false }, 0.2)).toBe('stand');
    expect(player.heading).toBeCloseTo(TURN_SPEED * 0.2);
    steer(player, { forward: 0, turn: -0.5, run: false }, 0.2);
    expect(player.heading).toBeCloseTo(TURN_SPEED * 0.1);
  });
});

describe('Route', () => {
  it('walks to each point in turn at its speed, facing where it goes, and ends on the last point', () => {
    const player = { x: 0, z: 0, heading: 0 };
    const route = new Route(
      [
        [10, 99, 0],
        [10, 99, -10],
      ],
      5,
    );
    expect(route.gait).toBe('walk');

    expect(route.step(player, 1)).toBe(false);
    expect(player.x).toBeCloseTo(5);
    expect(player.z).toBeCloseTo(0);
    expect(player.heading).toBeCloseTo(Math.PI / 2);

    // 1.5 s = 7.5 m: 5 to reach the corner, 2.5 down the second leg
    expect(route.step(player, 1.5)).toBe(false);
    expect(player.x).toBeCloseTo(10);
    expect(player.z).toBeCloseTo(-2.5);
    expect(Math.cos(player.heading)).toBeCloseTo(1);

    expect(route.step(player, 100)).toBe(true);
    expect(player).toMatchObject({ x: 10, z: -10 });
  });

  it('runs at run speed', () => {
    expect(new Route([[1, 0, 1]], RUN_SPEED).gait).toBe('run');
  });

  it('is done at once when already on the point', () => {
    const player = { x: 3, z: 4, heading: 1 };
    expect(new Route([[3, 0, 4]], 12).step(player, 0.016)).toBe(true);
    expect(player.heading).toBe(1);
  });
});

describe('chaseCamera', () => {
  it('sits CHASE_DISTANCE behind and above the player, looking at its head height', () => {
    const pitch = 0.2;
    const { position, target } = chaseCamera([100, 50, -200], 0, pitch);
    expect(target).toEqual([100, 50 + CHASE_LOOK_HEIGHT, -200]);
    // heading 0 faces -z, so behind is +z
    expect(position[0]).toBeCloseTo(100);
    expect(position[1]).toBeCloseTo(50 + CHASE_LOOK_HEIGHT + CHASE_DISTANCE * Math.sin(pitch));
    expect(position[2]).toBeCloseTo(-200 + CHASE_DISTANCE * Math.cos(pitch));
  });

  it('uses the client’s back camera: 16 m (4 + zoom 6 x 2) back, 12 degrees down, looking at 0.9 + 0.4 m', () => {
    expect(CHASE_DISTANCE).toBe(16);
    expect(CHASE_LOOK_HEIGHT).toBeCloseTo(1.3);
    expect(CHASE_PITCH).toBeCloseTo((12 * Math.PI) / 180);
  });

  it('stops in front of ground that is in the way, 0.6 m above it, as CWorld::CheckBound does', () => {
    // flat ground at 0, but a wall of ground 10 m high from 5 m behind the player (+z, heading 0)
    const groundAt = (_x: number, z: number): number => (z >= 5 ? 10 : 0);
    const { position, target } = chaseCamera([0, 0, 0], 0, 0, groundAt);
    expect(target).toEqual([0, CHASE_LOOK_HEIGHT, 0]);
    expect(position[2]).toBeGreaterThanOrEqual(5);
    expect(position[2]).toBeLessThan(5.1 + 1e-9);
    expect(position[1]).toBeCloseTo(CHASE_LOOK_HEIGHT);
  });

  it('keeps its full distance over ground that is not in the way, or not known', () => {
    const low = chaseCamera([0, 0, 0], 0, CHASE_PITCH, () => -5);
    const unknown = chaseCamera([0, 0, 0], 0, CHASE_PITCH, () => null);
    const free = chaseCamera([0, 0, 0], 0, CHASE_PITCH);
    expect(low.position).toEqual(free.position);
    expect(unknown.position).toEqual(free.position);
  });
});

describe('noonLight', () => {
  it('is the outdoor light of CWorld::SetLight at 12:00 with the default 24-hour table', () => {
    const light = noonLight();
    // D3DRS_AMBIENT (DWORD)(0.45 * 255) = 114, plus the light's own ambient 0.5 * 0.9
    expect(light.ambient).toBeCloseTo(114 / 255 + 0.45, 6);
    expect(light.sunColor).toBeCloseTo(1.1, 6);
    // sun angle 45 deg; direction (0, 0, 1) rotated about x by 225 deg; toward the light is minus that, z mirrored
    expect(light.sunDirection[0]).toBeCloseTo(0);
    expect(light.sunDirection[1]).toBeCloseTo(-Math.SQRT1_2);
    expect(light.sunDirection[2]).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe('d3dColor', () => {
  it('reads a D3DCOLOR as 0xAARRGGBB, ignoring alpha', () => {
    expect(d3dColor(0xffe0e0ff)).toEqual([224 / 255, 224 / 255, 1]);
    expect(d3dColor(0x808080)).toEqual([128 / 255, 128 / 255, 128 / 255]);
  });
});
