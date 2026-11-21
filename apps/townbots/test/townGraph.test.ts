import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { TownGraph, townNodes } from '../src/townGraph';
import type { Places } from '../src/settings';

const A: Vec3 = [0, 0, 0], B: Vec3 = [10, 0, 0], C: Vec3 = [20, 0, 0], D: Vec3 = [90, 0, 90];

function places(links?: Array<[string, string]>): Places {
  return {
    town: [A, B, C, D], lodestar: A, upgradeNpc: { pos: C, npcId: 'x' }, shopSpots: [],
    spots: [], routes: { north: [B, [50, 0, 0]] }, ...(links === undefined ? {} : { townLinks: links }),
  };
}

describe('townNodes', () => {
  it('names every place a bot stops at in town', () => {
    expect([...townNodes(places()).keys()]).toEqual(['town[0]', 'town[1]', 'town[2]', 'town[3]', 'lodestar', 'upgradeNpc', 'routes.north[0]']);
  });
});

describe('TownGraph', () => {
  const graph = new TownGraph(places([['town[0]', 'town[1]'], ['town[1]', 'town[2]']]));

  it('goes from the nearest place through the linked places to the target', () => {
    // the walker skips a first place already within reach
    expect(graph.path([0.5, 0, 0], C)).toEqual([A, B, C]);
    expect(graph.path([0.5, 0, 0], B)).toEqual([A, B]);
  });

  it('walks to the nearest place first when a few metres from it, not straight past it', () => {
    expect(graph.path([4, 0, 3], C)).toEqual([A, B, C]);
  });

  it('is a straight walk to a target it cannot reach by links', () => {
    expect(graph.path([0.5, 0, 0], D)).toEqual([D]);
  });

  it('starts from the next nearest place when asked (the nearest could not be reached)', () => {
    expect(graph.path([4, 0, 3], C, 1)).toEqual([B, C]);
    expect(graph.path([4, 0, 3], C, 2)).toEqual([C]);
  });

  it('is a straight walk when the places have no links', () => {
    expect(new TownGraph(places()).path([0.5, 0, 0], C)).toEqual([C]);
  });
});

describe('TownGraph with the fields', () => {
  // a field 130 m north, reached by a route that leaves town at R0; the straight line from the field to town is not a way
  const R0: Vec3 = [5, 0, 5], R1: Vec3 = [10, 0, 50], R2: Vec3 = [10, 0, 100], FIELD: Vec3 = [10, 0, 130];
  const withField: Places = {
    town: [A, B, C], lodestar: A, shopSpots: [],
    spots: [{ id: 'north', center: FIELD, radius: 12, kinds: [1], minLevel: 1, maxLevel: 10, route: 'north' }],
    routes: { north: [R0, R1, R2] },
    townLinks: [['town[0]', 'town[1]'], ['town[1]', 'town[2]'], ['town[1]', 'routes.north[0]']],
  };
  const graph = new TownGraph(withField);

  it('a bot out in a field walks home back along its route', () => {
    expect(graph.path([12, 0, 127], C)).toEqual([FIELD, R2, R1, R0, B, C]);
  });

  it('a bot on the way, between two route points, goes on from the nearest', () => {
    expect(graph.path([9, 0, 70], A)).toEqual([R1, R0, B, A]);
  });

  it('a bot in town walks out to a field along the route', () => {
    expect(graph.path([0.5, 0, 0], FIELD)).toEqual([A, B, R0, R1, R2, FIELD]);
  });
});
