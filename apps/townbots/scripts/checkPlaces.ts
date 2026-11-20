// Checks a places file against the converted map: every point stands on the terrain, every leg of every route (and the
// last leg to its spot) can be walked (a mover heading straight for the next point, with the movers' collision rules
// and the placed objects around the lodestar), and the town is one piece: its places joined by straight walks that are
// clear both ways (`townLinks`, which the bots cross town along). It prints each problem and "all clear" when there is
// none. With --write-links it first finds the clear town walks and writes them into the file as `townLinks`.
//   npx tsx apps/townbots/scripts/checkPlaces.ts <places.json> [assets dir] [world id] [--write-links]
import { readFileSync, writeFileSync } from 'node:fs';
import type { WorldManifest } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import { DiskAssets, Terrain, placedObjects } from '@flyffweb/client/src/headless/diskAssets';
import { collideMove, processUnderCollision } from '@flyffweb/client/src/world/sim/collision';
import { loadGameData } from '@flyffweb/client/src/world/gameData';
import type { Ground } from '@flyffweb/client/src/world/sim/collision';
import { parseSettings } from '../src/settings';
import { townNodes } from '../src/townGraph';

/** A run step of the rules (6 m a second, 60 steps a second). */
const STEP_M = 0.1;
const ARRIVE_M = 1.5;
const STUCK_STEPS = 180;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const writeLinks = args.includes('--write-links');
  const [placesPath, assetsDir, worldArg] = args.filter((a) => a !== '--write-links');
  if (placesPath === undefined) throw new Error('usage: checkPlaces.ts <places.json> [assets dir] [world id]');
  const worldId = Number(worldArg ?? 1);
  // the places file alone, checked as the settings check a region's (a minimal settings object around it)
  const places = parseSettings({
    gatewayConfig: '-', assetsDir: '-', logFile: '-',
    regions: { check: { roleTargets: { farming: 0, wandering: 0, upgrading: 0, shop: 0, afk: 0 }, places: JSON.parse(readFileSync(placesPath, 'utf8')) as unknown } },
    bots: [{ account: 'check', password: 'check', bankPin: '0000', name: 'Check', home: 'check', group: 'rookie', level: 1, job: 0, look: { sex: 0, hair: 0, face: 0 } }],
    replies: ['-'], items: { potions: [], upgrade: { materials: [], spares: [] }, shop: [], shopTitles: [] },
  }).regions.check!.places;
  const assets = assetsDir === undefined ? DiskAssets.open() : DiskAssets.open(assetsDir);
  const data = await loadGameData(assets);
  const folder = data.worlds.get(worldId);
  const manifest = assets.readJson<WorldManifest>(`worlds/${folder}/manifest.json`);
  const terrain = new Terrain(assets, manifest);
  const objects = await placedObjects(assets, manifest, places.lodestar[0], places.lodestar[2], 2);
  const ground: Ground = { ...terrain.ground, objectsNear: (x, z, range) => objects.objectsNear(x, z, range) };
  const standY = (p: Vec3): number => {
    const top = terrain.heightAt(p[0], p[2]) ?? p[1];
    // from 1 over the higher of the feet and the terrain: the object (a bridge) or the land under them
    return processUnderCollision([0, 0, 0], [p[0], Math.max(p[1], top) + 1, p[2]], ground);
  };
  const problems: string[] = [];

  const point = (what: string, p: Vec3): void => {
    if (terrain.heightAt(p[0], p[2]) === null) problems.push(`${what} ${p.map(Math.round).join(',')} has no ground`);
  };
  // a walk along the leg with the movers' own collision rules (`collideMove`: the knee-high test and the slide; and
  // `processUnderCollision`: standing on what is under the feet, a bridge included), as the rules step a mover heading
  // for its destination; blocked when it gets no nearer for 3 s
  const leg = (what: string, a: Vec3, b: Vec3, quiet = false): boolean => {
    const pos: Vec3 = [a[0], standY(a), a[2]];
    let best = Infinity, stuckSteps = 0;
    for (let step = 0; step < 60 * 600; step++) {
      const dx = b[0] - pos[0], dz = b[2] - pos[2];
      const distance = Math.hypot(dx, dz);
      if (distance <= ARRIVE_M) return true;
      if (distance < best - 0.5) { best = distance; stuckSteps = 0; }
      else if (++stuckSteps > STUCK_STEPS) {
        if (!quiet) problems.push(`${what}: blocked near ${pos.map(Math.round).join(',')} (${Math.round(distance)} m short)`);
        return false;
      }
      const stepLength = Math.min(STEP_M, distance);
      collideMove(pos, [dx / distance * stepLength, 0, dz / distance * stepLength], ground);
      pos[1] = standY(pos);
    }
    if (!quiet) problems.push(`${what}: did not arrive`);
    return false;
  };

  places.town.forEach((p, i) => point(`town[${i}]`, p));
  point('lodestar', places.lodestar);
  if (places.upgradeNpc !== undefined) point('upgradeNpc.pos', places.upgradeNpc.pos);
  places.shopSpots.forEach((p, i) => point(`shopSpots[${i}]`, p));
  // the places a bot holds stand 8 m apart (`PlaceBook`): two closer than that are never held at once
  const held: Array<[string, Vec3]> = [...places.town.map((p, i): [string, Vec3] => [`town[${i}]`, p]), ...places.shopSpots.map((p, i): [string, Vec3] => [`shopSpots[${i}]`, p])];
  held.forEach(([a, p], i) => held.slice(i + 1).forEach(([b, q]) => {
    if (Math.hypot(p[0] - q[0], p[2] - q[2]) < 8) problems.push(`${a} and ${b} are under 8 m apart: never held at once`);
  }));
  for (const [name, points] of Object.entries(places.routes)) {
    points.forEach((p, i) => point(`routes.${name}[${i}]`, p));
    for (let i = 1; i < points.length; i++) leg(`routes.${name} leg ${i}`, points[i - 1]!, points[i]!);
  }
  for (const spot of places.spots) {
    point(`spot ${spot.id}`, spot.center);
    const route = places.routes[spot.route]!;
    leg(`spot ${spot.id}: last leg`, route[route.length - 1]!, spot.center);
  }
  // in town a bot crosses from place to place along clear straight walks (the town's links)
  const nodes = [...townNodes(places)];
  let links = places.townLinks ?? [];
  if (writeLinks) {
    links = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const [a, pa] = nodes[i]!, [b, pb] = nodes[j]!;
        if (leg(`${a} to ${b}`, pa, pb, true) && leg(`${b} to ${a}`, pb, pa, true)) links.push([a, b]);
      }
    }
    const json = JSON.parse(readFileSync(placesPath, 'utf8')) as Record<string, unknown>;
    json.townLinks = links;
    writeFileSync(placesPath, `${JSON.stringify(json, null, 1)}
`);
    console.log(`${links.length} town links written to ${placesPath}`);
  } else {
    const at = new Map(nodes);
    for (const [a, b] of links) leg(`townLinks ${a} to ${b}`, at.get(a)!, at.get(b)!);
  }
  // one piece: every place reached from the lodestar along the links
  const reached = new Set(['lodestar']);
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of links) {
      if (reached.has(a) !== reached.has(b)) { reached.add(a); reached.add(b); grew = true; }
    }
  }
  const apart = nodes.map(([name]) => name).filter((name) => !reached.has(name));
  if (apart.length > 0) problems.push(`the town links reach no further than the lodestar's group: ${apart.join(', ')} cannot be reached`);
  for (const line of problems) console.log(line);
  console.log(problems.length === 0 ? 'all clear' : `${problems.length} problems`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

main().catch((error: Error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
