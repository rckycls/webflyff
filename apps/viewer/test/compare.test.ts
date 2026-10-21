import { describe, expect, it } from 'vitest';
import spotsJson from '../src/compare/spots.json';
import { liveUrl, parseSpots, spotFromParams } from '../src/compare/ComparePage';
import { readWorldParams, startPose } from '../src/world/WorldView';

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'a-spot',
  kind: 'world',
  route: '#/world?world=wdmadrigal',
  reference: 'compare/refs/a-spot.png',
  note: 'somewhere',
  ...over,
});

describe('parseSpots', () => {
  it('returns the spots as they are written', () => {
    const spots = parseSpots([
      raw(),
      raw({ id: 'b', kind: 'character', route: '#/character', reference: 'compare/refs/b.png' }),
    ]);

    expect(spots.map((s) => s.id)).toEqual(['a-spot', 'b']);
    expect(spots[1]).toEqual({
      id: 'b',
      kind: 'character',
      route: '#/character',
      reference: 'compare/refs/b.png',
      note: 'somewhere',
    });
  });

  it('refuses what is not a list of spots, naming the problem', () => {
    expect(() => parseSpots({})).toThrow(/list/);
    expect(() => parseSpots([])).toThrow(/no spots/);
    expect(() => parseSpots([raw({ id: '' })])).toThrow(/id/);
    expect(() => parseSpots([raw({ note: 3 })])).toThrow(/note/);
    expect(() => parseSpots([null])).toThrow(/spot 1/);
  });

  it('refuses two spots with one id', () => {
    expect(() => parseSpots([raw(), raw()])).toThrow(/a-spot.*twice/);
  });

  it('refuses a route that is not the spot kind, or not a hash route', () => {
    expect(() => parseSpots([raw({ kind: 'character' })])).toThrow(/a-spot.*route/);
    expect(() => parseSpots([raw({ route: '/world?world=wdmadrigal' })])).toThrow(/a-spot.*route/);
    expect(() => parseSpots([raw({ kind: 'sky' })])).toThrow(/a-spot.*kind/);
  });

  it('refuses a reference that is not compare/refs/<id>.png', () => {
    expect(() => parseSpots([raw({ reference: 'compare/refs/other.png' })])).toThrow(/a-spot.*reference/);
    expect(() => parseSpots([raw({ reference: 'refs/a-spot.png' })])).toThrow(/a-spot.*reference/);
  });
});

describe('spots.json', () => {
  const spots = parseSpots(spotsJson);
  const byId = new Map(spots.map((s) => [s.id, s]));

  it('is valid and lists exactly the four agreed spots, in order', () => {
    expect(spots.map((s) => s.id)).toEqual([
      'character-male-default',
      'world-start',
      'flaris-plaza',
      'flaris-plaza-east',
    ]);
  });

  it('has the routes the picture tests use', () => {
    expect(byId.get('character-male-default')).toMatchObject({
      kind: 'character',
      route: '#/character?gender=male&paused=1&frame=0',
    });
    expect(byId.get('world-start')).toMatchObject({ kind: 'world', route: '#/world?world=wdmadrigal&paused=1' });
    expect(byId.get('flaris-plaza')).toMatchObject({
      kind: 'world',
      route: '#/world?world=wdmadrigal&x=6968&z=3328&yaw=180&paused=1',
    });
    expect(byId.get('flaris-plaza-east')).toMatchObject({
      kind: 'world',
      route: '#/world?world=wdmadrigal&x=6968&z=3328&yaw=90&paused=1',
    });
  });

  it('stands the two plaza spots at the same place, one facing south and one east', () => {
    const camera = { position: [5063.999, 240.888, -4095.91] as [number, number, number], angleX: 0.191 };
    const pose = (id: string) => {
      const route = byId.get(id)!.route;
      return startPose(readWorldParams(new URLSearchParams(route.slice(route.indexOf('?') + 1))), camera);
    };

    expect(pose('flaris-plaza')).toMatchObject({ x: 6968, z: -3328 });
    expect(pose('flaris-plaza').heading).toBeCloseTo(Math.PI, 12);
    expect(pose('flaris-plaza-east')).toMatchObject({ x: 6968, z: -3328 });
    expect(pose('flaris-plaza-east').heading).toBeCloseTo(Math.PI / 2, 12);
  });

  it('has a note for each spot, for the person taking the screenshot', () => {
    for (const s of spots) expect(s.note.length, s.id).toBeGreaterThan(10);
  });
});

describe('spotFromParams', () => {
  const spots = parseSpots([raw(), raw({ id: 'b', reference: 'compare/refs/b.png' })]);

  it('is none when no spot is named', () => {
    expect(spotFromParams(new URLSearchParams(), spots)).toEqual({ kind: 'none' });
    expect(spotFromParams(new URLSearchParams('spot='), spots)).toEqual({ kind: 'none' });
  });

  it('finds the spot by id', () => {
    expect(spotFromParams(new URLSearchParams('spot=b'), spots)).toEqual({ kind: 'spot', spot: spots[1] });
  });

  it('says so for an id it does not have', () => {
    expect(spotFromParams(new URLSearchParams('spot=nope'), spots)).toEqual({ kind: 'unknown', id: 'nope' });
  });
});

describe('liveUrl', () => {
  it('is the viewer itself on the spot route: the same page with the route as its hash', () => {
    const [spot] = parseSpots([raw({ route: '#/world?world=wdmadrigal&paused=1' })]);

    expect(liveUrl(spot!, 'http://192.168.1.20:5173/#/compare?spot=a-spot')).toBe(
      'http://192.168.1.20:5173/#/world?world=wdmadrigal&paused=1',
    );
  });

  it('keeps the page path of the host', () => {
    const [spot] = parseSpots([raw({ kind: 'character', route: '#/character', reference: 'compare/refs/a-spot.png' })]);

    expect(liveUrl(spot!, 'https://example.test/viewer/index.html#/compare')).toBe(
      'https://example.test/viewer/index.html#/character',
    );
  });
});
