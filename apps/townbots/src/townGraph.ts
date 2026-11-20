// The town's walkable links: buildings stand between a town's squares, so a bot crosses town from place to place along
// straight walks known to be clear (`places.townLinks`, which apps/townbots/scripts/checkPlaces.ts --write-links finds
// by walking every pair with the movers' collision rules). A walk to a place no link reaches is a straight one.
import type { Vec3 } from '@flyffweb/protocol';
import type { Places } from './settings';

/** Every place a bot stops at in town, by name: the town points, the lodestar, the upgrade NPC, the shop spots, the routes' starts. */
export function townNodes(places: Pick<Places, 'town' | 'lodestar' | 'upgradeNpc' | 'shopSpots' | 'routes'>): Map<string, Vec3> {
  const nodes = new Map<string, Vec3>();
  places.town.forEach((p, i) => nodes.set(`town[${i}]`, p));
  nodes.set('lodestar', places.lodestar);
  nodes.set('upgradeNpc', places.upgradeNpc.pos);
  places.shopSpots.forEach((p, i) => nodes.set(`shopSpots[${i}]`, p));
  for (const [name, points] of Object.entries(places.routes)) nodes.set(`routes.${name}[0]`, points[0]!);
  return nodes;
}

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

export class TownGraph {
  private readonly nodes: Map<string, Vec3>;
  private readonly links = new Map<string, string[]>();

  constructor(places: Places) {
    this.nodes = townNodes(places);
    for (const [a, b] of places.townLinks ?? []) {
      this.links.set(a, [...(this.links.get(a) ?? []), b]);
      this.links.set(b, [...(this.links.get(b) ?? []), a]);
    }
  }

  /**
   * The places to walk through from `from` to `to`: from the place nearest `from` along the fewest links to the place
   * nearest `to`, then `to` itself. Just `[to]` when the two nearest places are linked directly, are the same, or no
   * links join them.
   */
  path(from: Vec3, to: Vec3): Vec3[] {
    const start = this.nearest(from), end = this.nearest(to);
    if (start === undefined || end === undefined || start === end) return [to];
    const previous = new Map<string, string>([[start, start]]);
    const queue = [start];
    while (queue.length > 0 && !previous.has(end)) {
      const node = queue.shift()!;
      for (const next of this.links.get(node) ?? []) {
        if (previous.has(next)) continue;
        previous.set(next, node);
        queue.push(next);
      }
    }
    if (!previous.has(end)) return [to];
    const names: string[] = [];
    for (let node = end; node !== start; node = previous.get(node)!) names.unshift(node);
    const points = names.map((name) => this.nodes.get(name)!);
    // the last place is `to` itself when the target is a known place; otherwise walk on from it to `to`
    if (distance(points[points.length - 1]!, to) > 0.01) points.push(to);
    return points;
  }

  private nearest(p: Vec3): string | undefined {
    let best: string | undefined, bestDistance = Infinity;
    for (const [name, at] of this.nodes) {
      const d = distance(at, p);
      if (d < bestDistance) { best = name; bestDistance = d; }
    }
    return best;
  }
}
