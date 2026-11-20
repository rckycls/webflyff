// The town bots' program.
//   --config <settings.json>             run every bot until stopped (Ctrl+C, or the service's stop)
//   --config <settings.json> --setup     make each bot's character and give it its level and job (accounts GM for it)
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { WorldManifest } from '@flyffweb/formats';
import type { CollisionShapes } from '@flyffweb/scene';
import { parseConfig } from '@flyffweb/gateway/src/config';
import type { GatewayConfig } from '@flyffweb/gateway/src/config';
import { startGateway } from '@flyffweb/gateway/src/server';
import { DiskAssets, Terrain, placedObjectsAround } from '@flyffweb/client/src/headless/diskAssets';
import { Link } from '@flyffweb/client/src/headless/link';
import { loadGameData } from '@flyffweb/client/src/world/gameData';
import { BotBody } from './body';
import type { Shared } from './body';
import { BotController } from './controller';
import type { BotWorld } from './controller';
import { fileLog } from './log';
import type { Log } from './log';
import { BotNames } from './names';
import { RolePlanner } from './roles';
import { SpotBook } from './roles/farm';
import { PlaceBook } from './roles/places';
import { Runner } from './runner';
import type { BotHandle } from './runner';
import { loadSettings } from './settings';
import { writeStock } from './stock';
import type { TownBotsSettings } from './settings';
import { runSetup } from './setupRun';
import { TownGraph } from './townGraph';

/** The bots' gateway takes only this origin, and listens on 127.0.0.1 alone. */
const ORIGIN = 'http://townbots.localhost';
/** The placed objects are loaded once per world, this many tiles around each region's lodestar. */
const OBJECTS_RADIUS = 2;

/** The bots' own gateway: the public one's routes, on loopback only, for one origin, with room for every bot. */
function botGatewayConfig(settings: TownBotsSettings): { config: GatewayConfig; certifierAddress: string } {
  const pub = parseConfig(JSON.parse(readFileSync(settings.gatewayConfig, 'utf8')) as unknown);
  const certifierAddress = Object.entries(pub.routes).find(([, route]) => route.role === 'certifier')?.[0];
  if (certifierAddress === undefined) throw new Error(`${settings.gatewayConfig} has no certifier route`);
  return {
    certifierAddress,
    config: {
      ...pub,
      listen: { host: '127.0.0.1', port: settings.listenPort },
      allowedOrigins: [ORIGIN],
      trustedProxies: [],
      limits: { ...pub.limits, maxConnectionsPerAddress: 4 * settings.bots.length + 8, maxNewConnectionsPerAddressPerMinute: 200 },
    },
  };
}

function makeShared(settings: TownBotsSettings, assets: DiskAssets, data: Shared['data'], port: number, certifierAddress: string, log: Log): Shared {
  const worlds = new Map<number, { manifest: WorldManifest; terrain: Terrain }>();
  const objects = new Map<number, CollisionShapes | 'loading' | 'failed'>();
  const world = (worldId: number): { manifest: WorldManifest; terrain: Terrain } => {
    let w = worlds.get(worldId);
    if (w === undefined) {
      const folder = data.worlds.get(worldId);
      const key = `worlds/${folder}/manifest.json`;
      if (folder === undefined || !assets.has(key)) throw new Error(`world ${worldId} is not in ${settings.assetsDir}`);
      const manifest = assets.readJson<WorldManifest>(key);
      w = { manifest, terrain: new Terrain(assets, manifest) };
      worlds.set(worldId, w);
    }
    return w;
  };
  return {
    assets, data, certifierAddress, world,
    objects: (worldId) => {
      const got = objects.get(worldId);
      if (got !== undefined) return got === 'loading' || got === 'failed' ? undefined : got;
      objects.set(worldId, 'loading');
      const centers = Object.values(settings.regions).map((r): [number, number] => [r.places.lodestar[0], r.places.lodestar[2]]);
      placedObjectsAround(assets, world(worldId).manifest, centers, OBJECTS_RADIUS).then(
        (shapes) => { objects.set(worldId, shapes); log(`placed objects of world ${worldId} loaded`); },
        (error: Error) => { objects.set(worldId, 'failed'); log(`placed objects of world ${worldId}: ${error.message}`); },
      );
      return undefined;
    },
    link: () => new Link(port, ORIGIN),
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' }, setup: { type: 'boolean' },
    },
  });
  if (values.config === undefined) throw new Error('usage: townbots --config <settings.json> [--setup]');
  const settings = loadSettings(values.config);
  const log = fileLog(settings.logFile);
  const assets = DiskAssets.open(settings.assetsDir);
  const data = await loadGameData(assets);
  const { config, certifierAddress } = botGatewayConfig(settings);
  const gateway = await startGateway(config, { info: (line) => { if (!/^(open|close) /.test(line)) log(`gateway: ${line}`); } });
  const shared = makeShared(settings, assets, data, gateway.port, certifierAddress, log);
  const botNames = new BotNames();
  for (const bot of settings.bots) botNames.set(bot.account, bot.name);

  if (values.setup === true) {
    log(`setup of ${settings.bots.length} bots`);
    const jobTitle = (job: number): string => data.jobs[job]?.title ?? '';
    const failed = await runSetup(settings, (i) => new BotBody(settings.bots[i]!, shared, log), jobTitle, log);
    await gateway.close();
    log(failed.length === 0 ? 'setup done' : `setup failed for ${failed.join(', ')}`);
    process.exitCode = failed.length === 0 ? 0 : 1;
    return;
  }

  // one planner, spot book, town graph and place book per region; the names and the fighting switch are every bot's
  const fighting = { allowed: true };
  const regions = new Map<string, BotWorld>(Object.entries(settings.regions).map(([name, region]) => [name, {
    settings, region, botNames, fighting, random: Math.random, log,
    planner: new RolePlanner(region.roleTargets, Math.random, () => Date.now()),
    spots: new SpotBook(region.places.spots),
    places: new PlaceBook(),
    town: new TownGraph(region.places),
  }]));
  const controllers = settings.bots.map((spec) => new BotController(new BotBody(spec, shared, log), regions.get(spec.home)!));
  const handles: BotHandle[] = controllers.map((c) => ({
    name: c.name,
    enter: () => c.body.enter(),
    leave: async () => { c.end(); await c.body.leave(); },
    playing: () => c.body.playing,
    frame: () => c.body.frame(),
    step: () => c.step(),
    onEnded: undefined,
  }));
  controllers.forEach((c, i) => {
    c.body.onEnded = (message) => {
      c.end();
      handles[i]!.onEnded?.(message);
    };
  });
  const runner = new Runner(handles, { now: () => Date.now(), log });
  runner.start();
  log(`town bots: ${handles.length} bots in ${regions.size} regions, their gateway on 127.0.0.1:${gateway.port}`);
  // what the bots cost the server, every 10 minutes
  let cpu = process.cpuUsage();
  let at = Date.now();
  const usage = setInterval(() => {
    const used = process.cpuUsage(cpu), now = Date.now();
    const percent = ((used.user + used.system) / 1000 / (now - at)) * 100;
    log(`load: ${percent.toFixed(1)} % of one core, ${Math.round(process.memoryUsage().rss / 1048576)} MB, ${handles.filter((h) => h.playing()).length} bots in the world`);
    cpu = process.cpuUsage();
    at = now;
  }, 600_000);
  // what each bot holds of its supplies, for a refill (every 5 minutes, and at the stop)
  const items = settings.items;
  const supplyIds = [...new Set([...items.potions, ...items.upgrade.materials, ...items.upgrade.spares, ...items.shop.map((s) => s.itemId),
    ...(items.renameScroll === undefined ? [] : [items.renameScroll])])];
  const stock = new Map<string, Record<number, number>>();
  const saveStock = (): void => {
    if (settings.stockFile === undefined) return;
    for (const c of controllers) {
      const counts = c.supplies(supplyIds);
      if (counts !== undefined) stock.set(c.body.spec.account, counts);
    }
    try { writeStock(settings.stockFile, stock); } catch (error) { log(`the stock file could not be written: ${(error as Error).message}`); }
  };
  const stockTimer = setInterval(saveStock, 300_000);
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    clearInterval(usage);
    clearInterval(stockTimer);
    saveStock();
    log('stopping: every bot leaves');
    void runner.stop().then(() => gateway.close()).finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: Error) => {
  process.stderr.write(`town bots: ${error.stack ?? error.message}\n`);
  process.exit(1);
});
