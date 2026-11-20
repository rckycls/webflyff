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

  it('goes through the linked places to the target', () => {
    expect(graph.path([0.5, 0, 0], C)).toEqual([B, C]);
  });

  it('is a straight walk to a target in reach, or one it cannot reach by links', () => {
    expect(graph.path([0.5, 0, 0], B)).toEqual([B]);
    expect(graph.path([0.5, 0, 0], D)).toEqual([D]);
  });

  it('is a straight walk when the places have no links', () => {
    expect(new TownGraph(places()).path([0.5, 0, 0], C)).toEqual([C]);
  });
});
