// The town's walkable links: buildings stand between a town's squares, so a bot crosses town from place to place along
// straight walks known to be clear (`places.townLinks`, which apps/townbots/scripts/checkPlaces.ts --write-links finds
// by walking every pair with the movers' collision rules). The fields are reached the same way: every route's points
// and its field's centre are places too, linked along the route both ways (the routes are drawn so that each leg is
// clear), so a bot out in a field walks home back along its route. 2026-11-21: a bot that came into the world in a
// field (the program restarted while it farmed) walked straight to the nearest town place, into the river and the
// fences at the foot of the bridge, and stood there; the World refused the 70-90 m it claimed when its own walk and
// the server's parted. A walk to a place no link reaches is a straight one.
import type { Vec3 } from '@flyffweb/protocol';
import type { Places } from './settings';

/** Every place a bot stops at in town, by name: the town points, the lodestar, the upgrade NPC, the shop spots, the routes' starts. */
export function townNodes(places: Pick<Places, 'town' | 'lodestar' | 'upgradeNpc' | 'shopSpots' | 'routes'>): Map<string, Vec3> {
  const nodes = new Map<string, Vec3>();
  places.town.forEach((p, i) => nodes.set(`town[${i}]`, p));
  nodes.set('lodestar', places.lodestar);
  if (places.upgradeNpc !== undefined) nodes.set('upgradeNpc', places.upgradeNpc.pos);
  places.shopSpots.forEach((p, i) => nodes.set(`shopSpots[${i}]`, p));
  for (const [name, points] of Object.entries(places.routes)) nodes.set(`routes.${name}[0]`, points[0]!);
  return nodes;
}

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
/** Places closer than this are one place to start from (m): the routes share their first points. */
const SAME_PLACE_M = 1;

export class TownGraph {
  /** The town's places, then the routes' points (`routes.<name>[i]`) and the fields' centres (`spots.<id>`). */
  private readonly nodes: Map<string, Vec3>;
  private readonly links = new Map<string, string[]>();

  constructor(places: Places) {
    this.nodes = townNodes(places);
    const link = (a: string, b: string): void => {
      this.links.set(a, [...(this.links.get(a) ?? []), b]);
      this.links.set(b, [...(this.links.get(b) ?? []), a]);
    };
    for (const [a, b] of places.townLinks ?? []) link(a, b);
    for (const [name, points] of Object.entries(places.routes)) {
      for (let i = 1; i < points.length; i++) {
        this.nodes.set(`routes.${name}[${i}]`, points[i]!);
        link(`routes.${name}[${i - 1}]`, `routes.${name}[${i}]`);
      }
    }
    for (const spot of places.spots) {
      const route = places.routes[spot.route];
      if (route === undefined) continue;
      this.nodes.set(`spots.${spot.id}`, spot.center);
      link(`routes.${spot.route}[${route.length - 1}]`, `spots.${spot.id}`);
    }
  }

  /**
   * The places to walk through from `from` to `to`: the place nearest `from` (the walker passes it at once when the bot
   * is there already), along the fewest links to the place nearest `to`, then `to` itself. `skip` starts from the next
   * nearest place instead (1: the second nearest, and so on; places at one spot count once): the walk from the nearest
   * got stuck. Just `[to]` when no links join the two.
   */
  path(from: Vec3, to: Vec3, skip = 0): Vec3[] {
    const start = this.byDistance(from)[skip], end = this.byDistance(to)[0];
    if (start === undefined || end === undefined) return [to];
    const at = (name: string): Vec3 => this.nodes.get(name)!;
    if (start === end) return distance(at(start), to) > 0.01 ? [at(start), to] : [to];
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
    const names = [end];
    for (let node = end; node !== start; node = previous.get(node)!) names.unshift(previous.get(node)!);
    const points = names.map(at);
    // the last place is `to` itself when the target is a known place; otherwise walk on from it to `to`
    if (distance(points[points.length - 1]!, to) > 0.01) points.push(to);
    return points;
  }

  /** The places by their distance from `p`, nearest first, one for each spot (the first named there). */
  private byDistance(p: Vec3): string[] {
    const sorted = [...this.nodes].sort(([, a], [, b]) => distance(a, p) - distance(b, p));
    const kept: Array<[string, Vec3]> = [];
    for (const node of sorted) if (!kept.some(([, q]) => distance(q, node[1]) < SAME_PLACE_M)) kept.push(node);
    return kept.map(([name]) => name);
  }
}
