import { describe, expect, it } from 'vitest';
import { forwardOf } from '../src/world/player';
import { readWorldParams, startPose } from '../src/world/WorldView';

describe('readWorldParams', () => {
  it('defaults to Madrigal, radius 1, playing, and the manifest start', () => {
    expect(readWorldParams(new URLSearchParams())).toEqual({
      world: 'wdmadrigal',
      radius: 1,
      paused: false,
      x: null,
      z: null,
      yaw: null,
    });
  });

  it('reads the world by its web name, the radius and paused', () => {
    expect(readWorldParams(new URLSearchParams('world=wdvolcane&radius=2&paused=1'))).toMatchObject({
      world: 'wdvolcane',
      radius: 2,
      paused: true,
    });
    expect(readWorldParams(new URLSearchParams('paused=true&radius=0')).paused).toBe(true);
    expect(readWorldParams(new URLSearchParams('paused=true&radius=0')).radius).toBe(0);
  });

  it('falls back to radius 1 for anything but a whole number from 0 to 4', () => {
    for (const radius of ['-1', '1.5', '5', 'x', '']) {
      expect(readWorldParams(new URLSearchParams({ radius })).radius).toBe(1);
    }
  });

  describe('x, z and yaw (the start, in the numbers a player sees)', () => {
    it('reads x and z in the client coordinates and yaw in degrees', () => {
      const params = readWorldParams(new URLSearchParams('x=6968&z=3328&yaw=180'));

      expect(params).toMatchObject({ x: 6968, z: 3328, yaw: 180 });
    });

    it('takes decimals, negative numbers and a yaw outside 0..360', () => {
      const params = readWorldParams(new URLSearchParams('x=6968.5&z=-12.25&yaw=-90'));

      expect(params).toMatchObject({ x: 6968.5, z: -12.25, yaw: -90 });
      expect(readWorldParams(new URLSearchParams('yaw=450')).yaw).toBe(450);
    });

    it('needs x and z together: one alone, or anything that is not a number, leaves the manifest position', () => {
      for (const query of ['x=6968', 'z=3328', 'x=abc&z=3328', 'x=6968&z=', 'x=&z=', 'x=Infinity&z=1']) {
        const params = readWorldParams(new URLSearchParams(query));
        expect(params.x, query).toBeNull();
        expect(params.z, query).toBeNull();
      }
    });

    it('takes yaw without x and z, and ignores a yaw that is not a number', () => {
      expect(readWorldParams(new URLSearchParams('yaw=90'))).toMatchObject({ x: null, z: null, yaw: 90 });
      for (const yaw of ['', 'north', 'NaN', 'Infinity']) {
        expect(readWorldParams(new URLSearchParams({ yaw })).yaw, yaw).toBeNull();
      }
    });
  });
});

describe('startPose', () => {
  // WdMadrigal's: D3D (5064, 4096), the world editor's yaw 0.191 rad
  const camera = { position: [5063.999, 240.888, -4095.91] as [number, number, number], angleX: 0.191 };
  const none = { x: null, z: null, yaw: null };

  it('is the manifest camera when nothing is given: its position and its yaw as the heading', () => {
    expect(startPose(none, camera)).toEqual({ x: 5063.999, z: -4095.91, heading: 0.191 });
  });

  it('turns the client z into the web z (negated) and keeps x', () => {
    const pose = startPose({ x: 6968, z: 3328, yaw: null }, camera);

    expect(pose.x).toBe(6968);
    expect(pose.z).toBe(-3328);
    // no yaw: the manifest camera's heading
    expect(pose.heading).toBe(0.191);
  });

  it('turns the yaw from degrees into the heading in radians: 0 faces D3D +z (north), 90 faces +x (east)', () => {
    expect(startPose({ ...none, yaw: 0 }, camera).heading).toBe(0);
    expect(startPose({ ...none, yaw: 90 }, camera).heading).toBeCloseTo(Math.PI / 2, 12);
    expect(startPose({ ...none, yaw: 180 }, camera).heading).toBeCloseTo(Math.PI, 12);
    expect(startPose({ ...none, yaw: -90 }, camera).heading).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('keeps the manifest position for a yaw alone', () => {
    const pose = startPose({ x: null, z: null, yaw: 180 }, camera);

    expect(pose).toMatchObject({ x: 5063.999, z: -4095.91 });
  });

  it('faces the way the yaw says in the web frame: 0 north (web -z), 90 east (+x), 180 south (web +z)', () => {
    const facing = (yaw: number) => forwardOf(startPose({ ...none, yaw }, camera).heading);

    expect(facing(0)[0]).toBeCloseTo(0, 12);
    expect(facing(0)[1]).toBeCloseTo(-1, 12);
    expect(facing(90)[0]).toBeCloseTo(1, 12);
    expect(facing(90)[1]).toBeCloseTo(0, 12);
    expect(facing(180)[0]).toBeCloseTo(0, 12);
    expect(facing(180)[1]).toBeCloseTo(1, 12);
  });
});
