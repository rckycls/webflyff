// Checks a places file against the converted map: every point stands on the terrain, and every leg of every route (and
// the last leg to its spot) can be walked: a mover heading straight for the next point with the movers' collision rules
// and the placed objects around the lodestar. It prints each problem and "all clear" when there is none.
//   npx tsx apps/townbots/scripts/checkPlaces.ts <places.json> [assets dir] [world id]
import { readFileSync } from 'node:fs';
import type { WorldManifest } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import { DiskAssets, Terrain, placedObjects } from '@flyffweb/client/src/headless/diskAssets';
import { collideMove, processUnderCollision } from '@flyffweb/client/src/world/sim/collision';
import { loadGameData } from '@flyffweb/client/src/world/gameData';
import type { Ground } from '@flyffweb/client/src/world/sim/collision';
import { parseSettings } from '../src/settings';

/** A run step of the rules (6 m a second, 60 steps a second). */
const STEP_M = 0.1;
const ARRIVE_M = 1.5;
const STUCK_STEPS = 180;

async function main(): Promise<void> {
  const [placesPath, assetsDir, worldArg] = process.argv.slice(2);
  if (placesPath === undefined) throw new Error('usage: checkPlaces.ts <places.json> [assets dir] [world id]');
  const worldId = Number(worldArg ?? 1);
  // the places file alone, checked as the settings check it (a minimal settings object around it)
  const places = parseSettings({
    gatewayConfig: '-', assetsDir: '-', logFile: '-', roleTargets: { farming: 0, wandering: 0, upgrading: 0, shop: 0, afk: 0 },
    bots: [{ account: 'check', password: 'check', bankPin: '0000', name: 'chEck', group: 'rookie', level: 1, job: 0, look: { sex: 0, hair: 0, face: 0 } }],
    replies: ['-'], items: { potions: [], upgrade: { materials: [], spares: [] }, shop: [], shopTitles: [] },
    places: JSON.parse(readFileSync(placesPath, 'utf8')) as unknown,
  }).places;
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
  const leg = (what: string, a: Vec3, b: Vec3): void => {
    const pos: Vec3 = [a[0], standY(a), a[2]];
    let best = Infinity, stuckSteps = 0;
    for (let step = 0; step < 60 * 600; step++) {
      const dx = b[0] - pos[0], dz = b[2] - pos[2];
      const distance = Math.hypot(dx, dz);
      if (distance <= ARRIVE_M) return;
      if (distance < best - 0.5) { best = distance; stuckSteps = 0; }
      else if (++stuckSteps > STUCK_STEPS) {
        problems.push(`${what}: blocked near ${pos.map(Math.round).join(',')} (${Math.round(distance)} m short)`);
        return;
      }
      const stepLength = Math.min(STEP_M, distance);
      collideMove(pos, [dx / distance * stepLength, 0, dz / distance * stepLength], ground);
      pos[1] = standY(pos);
    }
    problems.push(`${what}: did not arrive`);
  };

  places.town.forEach((p, i) => point(`town[${i}]`, p));
  point('lodestar', places.lodestar);
  point('upgradeNpc.pos', places.upgradeNpc.pos);
  places.shopSpots.forEach((p, i) => point(`shopSpots[${i}]`, p));
  for (const [name, points] of Object.entries(places.routes)) {
    points.forEach((p, i) => point(`routes.${name}[${i}]`, p));
    for (let i = 1; i < points.length; i++) leg(`routes.${name} leg ${i}`, points[i - 1]!, points[i]!);
  }
  for (const spot of places.spots) {
    point(`spot ${spot.id}`, spot.center);
    const route = places.routes[spot.route]!;
    leg(`spot ${spot.id}: last leg`, route[route.length - 1]!, spot.center);
  }
  // in town a bot walks straight from wherever it is to its next place: every town place to every other, the lodestar
  // (where it revives), the upgrade NPC, the shop spots and the routes' first points
  const town: Array<[string, Vec3]> = [
    ...places.town.map((p, i): [string, Vec3] => [`town[${i}]`, p]),
    ['lodestar', places.lodestar], ['upgradeNpc', places.upgradeNpc.pos],
    ...places.shopSpots.map((p, i): [string, Vec3] => [`shopSpots[${i}]`, p]),
    ...Object.entries(places.routes).map(([name, points]): [string, Vec3] => [`routes.${name}[0]`, points[0]!]),
  ];
  for (let i = 0; i < town.length; i++) {
    for (let j = 0; j < town.length; j++) if (i !== j) leg(`${town[i]![0]} to ${town[j]![0]}`, town[i]![1], town[j]![1]);
  }
  for (const line of problems) console.log(line);
  console.log(problems.length === 0 ? 'all clear' : `${problems.length} problems`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

main().catch((error: Error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
