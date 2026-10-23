// The live world test: two real players, each a LoginFlow and a WorldSession on the real gateway (started inside this
// process), enter the game servers running on this PC; one walks, the other watches. It is not part of `npm test`; run
// it with `npm run test:live:world` (or with the lobby test in `npm run test:live`).
//
// Before the first run copy live.config.example.json to live.config.json (same folder, git ignores it) and add the
// `world` section: two throwaway accounts with their Bank PINs. The servers must be running, with the rebuilt
// WorldServer (world-snapshot-index.patch: the table of contents the third test counts) and the rebuilt CacheServer
// (cache-client-addr.patch, with a `Gateway "127.0.0.1"` line in CacheServer.ini, so that it takes the player's address
// from the gateway). Each account uses its first character; an account without one gets `WebWalk` and three digits,
// made first and deleted at the end. Without a `world` section (or without live.config.json) the tests are skipped.
//
// What is real and what is not: the gateway, the channels, LoginFlow, WorldSession, WorldState, the movement rules and
// the packets are the client's own. What the world screen adds (the 3D view, the keys, the frame loop) is replaced by
// a loop of 60 rules steps a second from the real clock, run for both players, and by a walker that presses "run
// forward" for 3 s. The game data (the movers' speeds, the world folders) is read from the worktree's dist/assets through
// a store that reads files, and the ground height from the same folder's tiles, so the walker stands on the terrain as
// the screen would put it.
//
// The servers' connection-flood limiter (see lobby.live.test.ts) counts connections from this PC that arrive less than
// 200 ms apart, and cuts them all after 50. Every connection below, the lobby's and the world's, waits until 300 ms after
// the one before; keep it that way, and do not loop the test.
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest';
import { MAP_SIZE, decodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WebTile, WorldManifest } from '@flyffweb/formats';
import { CloseCode, NULL_ID } from '@flyffweb/protocol';
import type { BundleMessage, CharacterSummary, ServerEntry, WorldMessage } from '@flyffweb/protocol';
import { sampleHeight } from '@flyffweb/scene';
import { parseConfig } from '@flyffweb/gateway/src/config';
import type { GatewayConfig } from '@flyffweb/gateway/src/config';
import { startGateway } from '@flyffweb/gateway/src/server';
import type { Gateway } from '@flyffweb/gateway/src/server';
import { JOB_VAGRANT, Sex, hairColorFor } from '../src/lobby/appearance';
import { closeText, errorText } from '../src/lobby/errorText';
import { LoginFlow, TIMEOUT_TEXT } from '../src/lobby/LoginFlow';
import type { LobbyEvent, WorldEntry } from '../src/lobby/LoginFlow';
import { validateBankPin } from '../src/lobby/validation';
import type { OpenChannel, PacketChannel } from '../src/net/PacketChannel';
import { desiredFrom, driveOwnMover, movedReport } from '../src/world/controls';
import type { Desired } from '../src/world/controls';
import { loadGameData } from '../src/world/gameData';
import type { GameData } from '../src/world/gameData';
import { ObjSta } from '../src/world/sim/constants';
import { FixedStepper } from '../src/world/sim/stepper';
import { WorldSession } from '../src/world/WorldSession';
import type { WorldEvent } from '../src/world/WorldSession';
import { WorldState } from '../src/world/WorldState';
import type { Mover } from '../src/world/WorldState';
import { openNodeChannel } from './helpers/nodeChannel';

// ---- The config ------------------------------------------------------------------------------------------------

interface Account {
  account: string;
  password: string;
  /** The 4-digit Bank PIN, for making and deleting the character the test makes. */
  bankPin: string;
}

interface WorldLiveConfig {
  gateway: GatewayConfig;
  /** The certifier's advertised `address:port`, a key of `gateway.routes`. */
  certifierAddress: string;
  /** The walker's account, then the observer's. */
  accounts: [Account, Account];
}

const CONFIG_PATH = fileURLToPath(new URL('./live.config.json', import.meta.url));

const HOW_TO_SET_UP =
  'Copy apps/client/test/live.config.example.json to apps/client/test/live.config.json (if you have not yet) and add its '
  + '"world" section: two throwaway accounts with their Bank PINs. Start the game servers and run `npm run test:live:world` '
  + 'again. The comment at the top of the example explains the settings.';

function parseAccount(json: unknown, where: string): Account {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error(`${where} must be an object`);
  const item = json as Record<string, unknown>;
  const text = (name: string): string => {
    const value = item[name];
    if (typeof value !== 'string' || value === '') throw new Error(`${where}.${name} must be a non-empty string`);
    return value;
  };
  const bankPin = text('bankPin');
  const pinProblem = validateBankPin(bankPin, bankPin);
  if (pinProblem !== undefined) throw new Error(`${where}.bankPin: ${pinProblem}`);
  return { account: text('account'), password: text('password'), bankPin };
}

/** Checks the settings this test reads (anything else in the file, `_comment` and the lobby test's fields included, is ignored). */
function parseWorldConfig(root: Record<string, unknown>): WorldLiveConfig {
  let gateway: GatewayConfig;
  try {
    gateway = parseConfig(root.gateway);
  } catch (error) {
    throw new Error(`gateway: ${(error as Error).message}`);
  }
  const certifierAddress = root.certifierAddress;
  if (typeof certifierAddress !== 'string' || certifierAddress === '') throw new Error('certifierAddress must be a non-empty string');
  const certifierRoute = Object.hasOwn(gateway.routes, certifierAddress) ? gateway.routes[certifierAddress] : undefined;
  if (certifierRoute?.role !== 'certifier') throw new Error(`certifierAddress ${certifierAddress} must be a route of gateway.routes with the role "certifier"`);
  if (gateway.allowedOrigins.length === 0) throw new Error('gateway.allowedOrigins must hold an origin for the test to connect as');

  const world = root.world;
  if (typeof world !== 'object' || world === null || Array.isArray(world)) throw new Error('world must be an object');
  const list = (world as Record<string, unknown>).accounts;
  if (!Array.isArray(list) || list.length !== 2) throw new Error('world.accounts must hold exactly two accounts');
  const accounts: [Account, Account] = [parseAccount(list[0], 'world.accounts[0]'), parseAccount(list[1], 'world.accounts[1]')];
  // The login lower-cases the account, so these two would be one.
  if (accounts[0].account.trim().toLowerCase() === accounts[1].account.trim().toLowerCase()) throw new Error('world.accounts must be two different accounts');
  return { gateway, certifierAddress, accounts };
}

/** The settings, or why the test is skipped: no live.config.json, or none with a `world` section. A file that is broken stops the run. */
function loadSetup(): { config: WorldLiveConfig; skip?: undefined } | { config?: undefined; skip: string } {
  let source: string;
  try {
    source = readFileSync(CONFIG_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { skip: `${CONFIG_PATH} does not exist` };
    throw error;
  }
  try {
    const root: unknown = JSON.parse(source);
    if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new Error('the file must hold a JSON object');
    if (!Object.hasOwn(root, 'world')) return { skip: `${CONFIG_PATH} has no "world" section` };
    return { config: parseWorldConfig(root as Record<string, unknown>) };
  } catch (error) {
    throw new Error(`Live world test: cannot use ${CONFIG_PATH}: ${(error as Error).message}`);
  }
}

// Read while the file is collected: the skip below depends on it, and a broken file stops the run here, at once.
const { config, skip } = loadSetup();
if (skip !== undefined) console.warn(`Live world test skipped: ${skip}. ${HOW_TO_SET_UP}`);

/** The settings, for the code that runs only when the tests are not skipped. */
function settings(): WorldLiveConfig {
  if (config === undefined) throw new Error('the live world test ran without settings');
  return config;
}

// ---- Timing, places and numbers --------------------------------------------------------------------------------

/** The accept limiter counts arrivals less than 200 ms apart; stay well clear of that. */
const CONNECT_GAP_MS = 300;
/** How long a flow gets for an answer that needs the database (the certifier's own timeout, 20 s, fires first). */
const LOGIN_WAIT_MS = 25000;
const WAIT_MS = 15000;
/** The login server has sent the character list, but CACHE_ADDR and the clock's answer may still be on their way. */
const HANDOVER_WAIT_MS = 5000;
/** Entering ends by itself with a text: the 1 s pause, 15 s for PRE_JOIN and 25 s for JOIN. This is only the safety net. */
const ENTER_WAIT_MS = 60000;
/** The second player's ADD_OBJ comes when the world server sees it; the same for the first. */
const SEE_EACH_OTHER_MS = 10000;
/** 3 s of rules steps (`FRAME_PER_SEC` = 60). */
const RUN_STEPS = 180;
/** The walker has stopped; the observer's mover stands and has finished its correction within this. */
const SETTLE_MS = 10000;
/** After that, both rest for this long before the positions are read. */
const REST_MS = 500;
/**
 * Entering again after leaving: the world server saves a character when the cache server reports the closed connection,
 * and until then it turns the character away (the JOIN text: "... wait a moment and try again"), or the servers still hold
 * the account as logged in. So an entry that fails that way is tried again every few seconds, for up to this long in
 * all; any other failure stops at once. The same wait applies to the login before deleting a character.
 */
const REENTER_WAIT_MS = 30000;
const REENTER_EVERY_MS = 3000;
/** The part of the world server's JOIN text that says "wait" (`WorldSession`: JOIN_CLOSED_TEXT). */
const WAIT_AND_TRY_AGAIN = 'wait a moment and try again';
/** `WI_WORLD_MADRIGAL` (`Resource/defineWorld.h`): Flaris is in Madrigal. */
const MADRIGAL = 1;
/** The walker must have run at least this far in its 3 s (a run is 6 m a second at the player's table speed), or "stopped within 1 m" would prove nothing. */
const MIN_RUN_M = 10;
/** The observer's walker must be this close (D3D x and z) to where the walker's own mover stands. */
const WITHIN_M = 1;

/** No keys: stand, in walk mode (what the screen sends with nothing pressed). */
const STAND = desiredFrom({ forward: 0, turn: 0, run: false });
/** Forward with the run key held. */
const RUN_FORWARD = desiredFrom({ forward: 1, turn: 0, run: true });

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

let lastConnectAt = 0;

/** Resolves once at least `CONNECT_GAP_MS` have passed since the previous connection was started. */
async function waitForConnectGap(): Promise<void> {
  const wait = lastConnectAt + CONNECT_GAP_MS - Date.now();
  lastConnectAt = Date.now() + Math.max(0, wait); // takes the slot at once, so two callers cannot share one
  if (wait > 0) await sleep(wait);
}

/** A bare connection to the certifier's real address, so that servers which are not running are reported as such and not as a failed login. */
function checkReachable(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const fail = (why: string): void => {
      socket.destroy();
      reject(new Error(
        `Live world test: the certifier is not reachable at ${host}:${port} (${why}). Start the game servers (the certifier and `
        + 'the others in Program\\), check the routes in live.config.json, and run `npm run test:live:world` again.',
      ));
    };
    socket.setTimeout(3000, () => fail('no answer within 3 s'));
    socket.once('error', (error) => fail(error.message));
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
  });
}

// ---- The converted game files ----------------------------------------------------------------------------------

/** The worktree's converted assets (`npm run convert`), which the world screen's dev server serves too. */
const ASSETS_DIR = fileURLToPath(new URL('../../../dist/assets/', import.meta.url));

/** `dist/assets` read from the disk instead of fetched: the same logical keys, through the same `index.json`. */
class DiskAssets {
  private constructor(private readonly files: Readonly<Record<string, string>>) {}

  static open(): DiskAssets {
    const indexPath = `${ASSETS_DIR}index.json`;
    if (!existsSync(indexPath)) throw new Error(`Live world test: ${indexPath} is missing: run \`npm run convert\` first (the test reads the game data from it).`);
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Partial<AssetIndex>;
    if (index.version !== 1 || typeof index.files !== 'object' || index.files === null) throw new Error(`${indexPath} is not an asset index this test reads`);
    return new DiskAssets(index.files);
  }

  has(key: string): boolean {
    return Object.hasOwn(this.files, key);
  }

  /** What `AssetStore.json` gives `loadGameData`. */
  json<T>(key: string): Promise<T> {
    return Promise.resolve(this.readJson<T>(key));
  }

  readJson<T>(key: string): T {
    return JSON.parse(readFileSync(this.path(key), 'utf8')) as T;
  }

  /** A tile by the hashed path the world's manifest names. */
  tile(hashedPath: string): WebTile {
    const path = ASSETS_DIR + hashedPath;
    return decodeTileBin(new Uint8Array(readFileSync(path)), path);
  }

  private path(key: string): string {
    if (!this.has(key)) throw new Error(`asset "${key}" is not in ${ASSETS_DIR}index.json`);
    return ASSETS_DIR + this.files[key]!;
  }
}

/**
 * The ground under a D3D x, z of one converted world (`CLandscape::GetHeight`), which the movers' steps stand on as the
 * screen's `stage.heightAt` does; `null` where the world has no tile, and the mover then stays where it is.
 */
class Terrain {
  private readonly tiles = new Map<string, WebTile | null>();
  private readonly side: number;

  constructor(private readonly assets: DiskAssets, private readonly manifest: WorldManifest) {
    this.side = MAP_SIZE * manifest.mpu;
  }

  readonly heightAt = (x: number, z: number): number | null => {
    const tx = Math.floor(x / this.side);
    const tz = Math.floor(z / this.side);
    const key = `${tx}_${tz}`;
    let tile = this.tiles.get(key);
    if (tile === undefined) {
      tile = Object.hasOwn(this.manifest.tiles, key) ? this.assets.tile(this.manifest.tiles[key]!) : null;
      this.tiles.set(key, tile);
    }
    return tile === null ? null : sampleHeight(tile, x - tx * this.side, z - tz * this.side, this.manifest.mpu);
  };
}

let assets: DiskAssets | undefined;
let gameData: GameData | undefined;
const terrains = new Map<number, Terrain>();

/** The terrain of a world by its `WI_*` id; throws for a world the converter has not converted. */
function terrainOf(worldId: number): Terrain {
  let terrain = terrains.get(worldId);
  if (terrain === undefined) {
    const folder = gameData!.worlds.get(worldId);
    const key = `worlds/${folder}/manifest.json`;
    if (folder === undefined || !assets!.has(key)) {
      throw new Error(`world ${worldId} (${folder ?? 'not in World.inc'}) is not converted in ${ASSETS_DIR}: the world screen would show "This map isn't available in the browser yet."`);
    }
    terrain = new Terrain(assets!, assets!.readJson<WorldManifest>(key));
    terrains.set(worldId, terrain);
  }
  return terrain;
}

// ---- Connections and the lobby ---------------------------------------------------------------------------------

let gateway: Gateway | undefined;
const gatewayLog: string[] = [];

/** The account is logged in on the servers already: a session that has only just closed, or a game client. Worth trying again soon. */
class StillInGame extends Error {}

/** Why an event the test waited for did not come: what came instead, and what usually causes it. */
function explain(event: LobbyEvent): string {
  const said = 'message' in event ? `${event.type} ("${event.message}")` : event.type;
  let hint = '';
  if (event.type === 'closed' && event.message === closeText(CloseCode.SERVER_UNREACHABLE)) {
    hint = 'The gateway could not connect to the server. Is it running, and do the routes in live.config.json point at where it listens?';
  } else if (event.type === 'error' && (event.message === errorText(134) || event.message === errorText(135))) {
    hint = 'The certifier blocks this address after an earlier wrong password (15 seconds, or 15 minutes after three in a row): wait and run again.';
  } else if (event.type === 'error' && event.message === errorText(120)) {
    hint = 'Check account and password in the "world" section of live.config.json. (A wrong password also blocks this address for 15 seconds.)';
  }
  return hint === '' ? said : `${said}\n${hint}`;
}

/** What it usually means when a world session ends before the player is in. */
function explainEnd(message: string): string {
  if (message === closeText(CloseCode.SERVER_UNREACHABLE)) {
    return `${message}\nThe gateway could not connect to the cache server. Is it running, and is the address the login server announces (CACHE_ADDR, port 5400) a route with the role "cache" in gateway.routes?`;
  }
  if (message === TIMEOUT_TEXT) return `${message}\nPRE_JOIN or JOIN got no answer: are the login, cache and world servers all running?`;
  return message;
}

/**
 * One player's connections to the gateway, all of them: the certifier's and the login server's for the lobby, then the login
 * server's (handed over) and the cache server's for the world. Each opens 300 ms after the previous connection of any
 * player, and `closed` waits until every one of them has really closed.
 */
class Link {
  /** One per connection opened; settles when that connection has really closed. */
  private readonly ended: Promise<void>[] = [];
  private readonly raw: OpenChannel = openNodeChannel(`ws://127.0.0.1:${gateway!.port}`, { origin: settings().gateway.allowedOrigins[0]! });

  readonly open: OpenChannel = async (target) => {
    await waitForConnectGap();
    try {
      return this.watch(await this.raw(target));
    } catch (error) {
      // The flow reports only "cannot reach the gateway"; the reason is here.
      console.error(`live world test: could not open ${target} through the gateway: ${(error as Error).message}`);
      throw error;
    }
  };

  async closed(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000); // the gateway's own close at the end of the run cuts whatever is left
      void Promise.all(this.ended).then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** The same channel, remembering when it closes. */
  private watch(channel: PacketChannel): PacketChannel {
    let closed!: () => void;
    this.ended.push(new Promise<void>((resolve) => { closed = resolve; }));
    const watched: PacketChannel = {
      send: (body) => channel.send(body),
      close: () => channel.close(),
      onPacket: () => {},
      onClose: () => {},
    };
    channel.onPacket = (body) => watched.onPacket(body);
    channel.onClose = (code) => {
      closed();
      watched.onClose(code);
    };
    return watched;
  }
}

/** One `LoginFlow` on its own `Link`, with its events queued for the test to take one by one. */
class Lobby {
  readonly link = new Link();
  readonly flow: LoginFlow;
  /** The characters of the channel the flow picked, once they have come. */
  characters: CharacterSummary[] = [];
  private readonly queue: LobbyEvent[] = [];
  private waiting: ((event: LobbyEvent) => void) | undefined;

  constructor() {
    this.flow = new LoginFlow(this.link.open, settings().certifierAddress, (event) => this.onEvent(event));
  }

  /** Takes the next event, in order, and fails with what happened instead unless it is a `type` event. */
  async expect<T extends LobbyEvent['type']>(type: T, timeoutMs = WAIT_MS): Promise<Extract<LobbyEvent, { type: T }>> {
    const event = await this.take(`a ${type} event`, timeoutMs);
    if (event.type === 'alreadyConnected' && type !== 'alreadyConnected') {
      throw new StillInGame('the account is logged in on the servers already (a game client, or a session that has only just closed)');
    }
    if (event.type !== type) throw new Error(`expected a ${type} event, but the flow reported ${explain(event)}`);
    return event as Extract<LobbyEvent, { type: T }>;
  }

  /** Ends the flow and waits until every connection it opened has closed, so the next one starts clean. */
  async end(): Promise<void> {
    this.flow.dispose();
    await this.link.closed();
  }

  private take(wanted: string, timeoutMs: number): Promise<LobbyEvent> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error(`expected ${wanted}, but the flow said nothing for ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.waiting = (event) => {
        clearTimeout(timer);
        resolve(event);
      };
    });
  }

  private onEvent(event: LobbyEvent): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    if (waiting !== undefined) waiting(event);
    else this.queue.push(event);
  }
}

/** The first channel (an entry with a parent server) that is enabled and not full, as the lobby offers it. */
const isOpenChannel = (e: ServerEntry): boolean =>
  e.parent !== NULL_ID && e.enabled !== 0 && !(e.maxPlayers > 0 && e.playerCount >= e.maxPlayers);

// ---- A player in the world -------------------------------------------------------------------------------------

type EnteredEvent = Extract<WorldEvent, { type: 'entered' }>;

/** The world session ended with this text before the player was in. */
class EndedBeforeEntering extends Error {}

/**
 * One account's player: logs in, picks (or makes) its character, enters, and then, like the world screen, runs the rules
 * 60 steps a second with the controls in `desired`, sending its moves as `ControlGround` does. It keeps its own
 * `WorldState`, the movers in view of its session, which the other player's moves reach through the server.
 */
class Player {
  /** The character it plays: the account's first, or the one the test made. */
  character: CharacterSummary | undefined;
  /** Set when the test made the character: it is deleted at the end. */
  created: { name: string; slot: number } | undefined;
  session: WorldSession | undefined;
  world: WorldState | undefined;
  entered: EnteredEvent | undefined;
  /** What the keys would ask of the own mover this step. */
  desired: Desired = STAND;
  /** Rules steps taken since the first entry. */
  steps = 0;
  /** The text of the `ended` event, if the session has ended. */
  endedWith: string | undefined;
  /** In the world and stepping. */
  playing = false;

  private entry: WorldEntry | undefined;
  private lobby: Lobby | undefined;
  private finishEntering: { resolve: () => void; reject: (error: Error) => void } | undefined;

  constructor(readonly role: 'walker' | 'observer', readonly login: Account) {}

  get name(): string {
    return this.character?.name ?? `the ${this.role}`;
  }

  /** The mover of the other player named `name` in this player's view, if the world server has told it of one. */
  sees(name: string): Mover | undefined {
    for (const mover of this.world?.movers.values() ?? []) {
      if (mover.kind === 'player' && !mover.isSelf && mover.name === name) return mover;
    }
    return undefined;
  }

  /** What is in view, for a failure message. */
  inView(): string {
    const movers = [...(this.world?.movers.values() ?? [])];
    const text = movers.slice(0, 12).map((m) => `${m.name || '?'} (${m.isSelf ? 'self' : m.kind})`).join(', ');
    return `${this.role} ${this.name} has ${movers.length} movers in view: ${text}${movers.length > 12 ? ', ...' : ''}`;
  }

  /** Why the movers may be missing: a world server without the table of contents leaves the rest of the JOIN bundle unread. */
  tableHint(): string {
    const stats = this.session?.stats;
    if (stats === undefined || stats.indexed === stats.bundles) return '';
    return ` Only ${stats.indexed} of ${stats.bundles} bundles of the ${this.role} had a table of contents: is the rebuilt WorldServer (world-snapshot-index.patch) running?`;
  }

  /** Logs in, lists the characters and picks the character, makes one if the account has none, and enters the world. */
  async enter(): Promise<void> {
    this.playing = false;
    this.endedWith = undefined;
    this.world = undefined;
    this.entered = undefined;
    const lobby = await this.logIn();
    this.lobby = lobby;
    try {
      let characters = lobby.characters;
      if (characters.length === 0) characters = await this.makeCharacter(lobby);
      const character = [...characters].sort((a, b) => a.slot - b.slot)[0]!;
      this.character = character;
      this.entry = await this.handOver(lobby, character.slot);
      await this.start(this.entry, lobby.link);
    } catch (error) {
      await this.drop();
      throw error;
    }
  }

  /** One rules step, as the world screen takes it: the controls to the own mover and its moves sent, then every mover's step. */
  step(): void {
    const { world, session, entry } = this;
    if (!this.playing || world === undefined || session === undefined || entry === undefined) return;
    const own = world.self();
    if (own !== undefined) {
      const { moved, behavior } = driveOwnMover(own.act, this.desired);
      if (moved) session.sendMoved(movedReport(own.act, entry.clock.tick()));
      if (behavior) session.sendBehavior(own.act.report(entry.clock.tick()));
    }
    world.step();
    this.steps++;
  }

  /** Leaves the world as the Leave button does, and waits until both connections have closed. */
  async leave(): Promise<void> {
    await this.drop();
  }

  /** Logs in again and deletes the character the test made, if any; throws what to do by hand if it cannot. */
  async deleteCreated(): Promise<void> {
    const made = this.created;
    if (made === undefined) return;
    try {
      await retryWhileStillInGame(async () => {
        const lobby = await this.logIn();
        try {
          const character = lobby.characters.find((c) => c.name === made.name);
          if (character === undefined) return; // gone already
          lobby.flow.deleteCharacter(character.slot, this.login.bankPin);
          const after = await lobby.expect('characters');
          if (after.characters.some((c) => c.name === made.name)) throw new Error('the character is still in the list');
        } finally {
          await lobby.end();
        }
      });
      this.created = undefined;
    } catch (error) {
      throw new Error(`Deleting ${made.name} (slot ${made.slot}) of the account ${this.login.account} failed, so it may still be on the test account; delete it by hand. ${(error as Error).message}`, { cause: error });
    }
  }

  /** The certifier's server list, the first open channel, and its character list. Closes everything itself when it fails. */
  private async logIn(): Promise<Lobby> {
    const lobby = new Lobby();
    try {
      await lobby.flow.login(this.login.account, this.login.password);
      const { servers } = await lobby.expect('serverList', LOGIN_WAIT_MS);
      const channel = servers.find(isOpenChannel);
      if (channel === undefined) throw new Error(`the server list has no channel that is enabled and not full (${servers.length} entries)`);
      await lobby.flow.selectChannel(channel);
      lobby.characters = (await lobby.expect('characters')).characters;
      return lobby;
    } catch (error) {
      await lobby.end();
      throw error;
    }
  }

  /** The account has no character: makes `WebWalk` and 3 digits in the first slot, to be deleted at the end. */
  private async makeCharacter(lobby: Lobby): Promise<CharacterSummary[]> {
    const name = `WebWalk${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    lobby.flow.createCharacter({
      slot: 0,
      name,
      face: 0,
      costume: 0,
      skinSet: 0,
      hairMesh: 0,
      hairColor: hairColorFor(Sex.MALE, 0),
      sex: Sex.MALE,
      job: JOB_VAGRANT,
      headMesh: 0,
      bankPin: Number(this.login.bankPin),
    });
    const { characters } = await lobby.expect('characters');
    const made = characters.find((c) => c.name === name);
    if (made === undefined) throw new Error(`the character ${name} is not in the list after it was made`);
    this.created = { name, slot: made.slot };
    return characters;
  }

  /** The flow gives the world what it needs once CACHE_ADDR and the clock's answer are in, which may be a moment after the list. */
  private async handOver(lobby: Lobby, slot: number): Promise<WorldEntry> {
    const deadline = Date.now() + HANDOVER_WAIT_MS;
    for (;;) {
      const entry = lobby.flow.handOver(slot);
      if (entry !== undefined) return entry;
      if (Date.now() > deadline) {
        throw new Error('the login server sent the character list but not the cache server address or the clock (CACHE_ADDR, QUERYTICKCOUNT)');
      }
      await sleep(50);
    }
  }

  /** The world session: resolves once the JOIN bundle has put the player in the world; fails with the text it ended with. */
  private async start(entry: WorldEntry, link: Link): Promise<void> {
    const entering = new Promise<void>((resolve, reject) => { this.finishEntering = { resolve, reject }; });
    entering.catch(() => {}); // only awaited below, once the session has started
    const session = new WorldSession(link.open, entry, (event) => this.onWorldEvent(event));
    this.session = session;
    const safetyNet = setTimeout(() => this.finishEntering?.reject(new Error(`${this.role} did not enter within ${ENTER_WAIT_MS / 1000} s`)), ENTER_WAIT_MS);
    try {
      await session.start();
      await entering;
    } catch (error) {
      if (error instanceof EndedBeforeEntering) {
        if (error.message.includes(WAIT_AND_TRY_AGAIN)) throw new StillInGame(error.message);
        throw new Error(`the world session of ${this.role} ${this.name} ended before it was in: ${explainEnd(error.message)}`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(safetyNet);
      this.finishEntering = undefined;
    }
  }

  private onWorldEvent(event: WorldEvent): void {
    try {
      if (event.type === 'ended') {
        this.endedWith = event.message;
        this.playing = false;
        this.finishEntering?.reject(new EndedBeforeEntering(event.message));
      } else if (event.type === 'entered') {
        this.begin(event);
        this.finishEntering?.resolve();
      } else {
        this.apply(event.messages);
      }
    } catch (error) {
      // WorldSession would only log a throw from here; the test must hear it.
      this.finishEntering?.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** The JOIN bundle: the world the player is in, with the movers in view, standing on its terrain. */
  private begin(event: EnteredEvent): void {
    const terrain = terrainOf(event.worldId);
    this.world = new WorldState(gameData!, this.entry!.clock, terrain.heightAt);
    this.entered = event;
    this.apply(event.messages);
    this.playing = true;
  }

  /** A bundle's messages to the movers in view, in order (`WorldScreen.apply`). */
  private apply(messages: BundleMessage<WorldMessage>[]): void {
    const world = this.world!;
    for (const { objectId, value } of messages) {
      if (value.type === 'replace') {
        const self = world.self();
        if (self !== undefined) world.apply(self.objectId, { type: 'setPos', pos: value.pos });
        continue;
      }
      world.apply(objectId, value);
    }
  }

  /** Stops stepping and closes whatever is open (the session's two connections, or the lobby's), waiting until each has closed. */
  private async drop(): Promise<void> {
    this.playing = false;
    this.session?.leave();
    this.lobby?.flow.dispose();
    await this.lobby?.link.closed();
  }
}

/** Runs `attempt` again every few seconds while it fails with `StillInGame`, for up to `REENTER_WAIT_MS` in all. */
async function retryWhileStillInGame(attempt: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + REENTER_WAIT_MS;
  for (;;) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (!(error instanceof StillInGame) || Date.now() + REENTER_EVERY_MS > deadline) {
        if (error instanceof StillInGame) throw new Error(`still turned away after ${REENTER_WAIT_MS / 1000} s: ${error.message}`, { cause: error });
        throw error;
      }
      await sleep(REENTER_EVERY_MS);
    }
  }
}

// ---- The rules loop --------------------------------------------------------------------------------------------

/**
 * The world screen's frame loop without the screen: the steps owed by the real clock (`FixedStepper`, 60 a second) for
 * every player in the world, so that their packets leave at the times the screen would send them and the server's clock
 * offsets make sense. A step that throws stops the loop, and `check` tells the test.
 */
class RulesLoop {
  failure: Error | undefined;
  private readonly stepper = new FixedStepper();
  private last = performance.now();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly players: () => Player[]) {}

  start(): void {
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), 8);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  check(): void {
    if (this.failure !== undefined) throw new Error(`the rules loop failed: ${this.failure.message}`, { cause: this.failure });
  }

  private tick(): void {
    const now = performance.now();
    const steps = this.stepper.advance((now - this.last) / 1000);
    this.last = now;
    try {
      for (let i = 0; i < steps; i++) for (const player of this.players()) player.step();
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error));
      console.error('live world test: a rules step failed:', error);
      this.stop();
    }
  }
}

// ---- State and helpers -----------------------------------------------------------------------------------------

let walker: Player;
let observer: Player;
const loop = new RulesLoop(() => [walker, observer]);

/** Polls `done` until it holds; `why` says what was seen instead if it does not within `timeoutMs`. */
async function waitUntil(what: string, timeoutMs: number, done: () => boolean, why: () => string = () => ''): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    loop.check();
    if (Date.now() > deadline) throw new Error(`${what}: not within ${timeoutMs / 1000} s. ${why()}`);
    await sleep(20);
  }
}

/** Both players, who must be in the world: the tests after the first need what it did. */
function bothInWorld(): [Player, Player] {
  for (const player of [walker, observer]) {
    if (player.endedWith !== undefined) throw new Error(`the ${player.role}'s world session ended: ${player.endedWith}`);
    if (!player.playing) throw new Error(`the ${player.role} is not in the world: the first test did not get both players in`);
  }
  return [walker, observer];
}

// ---- The tests -------------------------------------------------------------------------------------------------

describe.skipIf(config === undefined)('live world', () => {
  beforeAll(async () => {
    const live = settings();
    const certifier = live.gateway.routes[live.certifierAddress]!;
    await checkReachable(certifier.host, certifier.port);
    lastConnectAt = Date.now();

    assets = DiskAssets.open();
    gameData = await loadGameData(assets);
    walker = new Player('walker', live.accounts[0]);
    observer = new Player('observer', live.accounts[1]);

    try {
      gateway = await startGateway(live.gateway, { info: (line) => { gatewayLog.push(line); } });
    } catch (error) {
      const { host, port } = live.gateway.listen;
      throw new Error(`Live world test: the gateway cannot listen on ${host}:${port}: ${(error as Error).message}. Is the port taken? Change gateway.listen.port in live.config.json.`);
    }
  });

  beforeEach(() => {
    onTestFailed(() => {
      // What the gateway saw (addresses, routes, close codes; never packet contents) often explains a failure.
      console.error(`Gateway log so far:\n${gatewayLog.join('\n')}`);
    });
  });

  afterAll(async () => {
    loop.stop();
    const problems: string[] = [];
    if (walker !== undefined) {
      // Everyone leaves first; the world server saves a character when the cache server reports its closed connection.
      await Promise.all([walker.leave(), observer.leave()]);
      if (walker.created !== undefined || observer.created !== undefined) await sleep(REENTER_EVERY_MS);
      for (const player of [walker, observer]) {
        try {
          await player.deleteCreated();
        } catch (error) {
          problems.push((error as Error).message);
        }
      }
    }
    await gateway?.close();
    if (problems.length > 0) throw new Error(problems.join('\n'));
  }, 120000);

  it('two players enter Flaris and see each other', async () => {
    // One after the other: the walker is in the world, standing, while the observer logs in and comes into its view.
    loop.start();
    await walker.enter();
    await observer.enter();

    for (const player of [walker, observer]) {
      expect(player.entered?.worldId, `${player.role} ${player.name} entered world ${player.entered?.worldId}, not Madrigal (Flaris): use characters that stand in Flaris`).toBe(MADRIGAL);
    }
    await waitUntil(
      'the two players seeing each other',
      SEE_EACH_OTHER_MS,
      () => walker.sees(observer.name) !== undefined && observer.sees(walker.name) !== undefined,
      () => `${walker.inView()}; ${observer.inView()}. The characters must stand within sight of each other; the test's own new characters start on the same spot.${walker.tableHint()}${observer.tableHint()}`,
    );
  }, 180000);

  it('the observer sees the walker stop within 1 m of where the walker says it stands', async () => {
    const [runner, watcher] = bothInWorld();
    const own = runner.world!.self()!;
    const from = [...own.act.body.pos];

    // 3 s of "run forward" (180 steps), then no keys: the first idle step stands the mover and sends the stop.
    runner.desired = RUN_FORWARD;
    const stopAt = runner.steps + RUN_STEPS;
    await waitUntil('the walker running for 3 s', 10000, () => runner.steps >= stopAt);
    runner.desired = STAND;
    await waitUntil('the walker standing', 5000, () => (own.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND);

    // The observer's walker is settled once the stop has come through the server: it stands, no correction has steps left
    // (a spent correction's action stays in `corr` until the next move; `remnant` is what runs) and no point is being walked to.
    const settled = (m: Mover | undefined): boolean =>
      m !== undefined && (m.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND && (m.corr?.remnant ?? 0) === 0 && (m.dest?.pos ?? null) === null;
    const seen = (): Mover | undefined => watcher.sees(runner.name);
    await waitUntil(
      'the observer seeing the walker stand',
      SETTLE_MS,
      () => settled(seen()),
      () => {
        const m = seen();
        return m === undefined ? `${watcher.inView()}.${watcher.tableHint()}` : `The observer's walker is at ${m.act.body.pos.map((v) => v.toFixed(2)).join(', ')} in state 0x${m.act.state.toString(16)}, ${m.corr?.remnant ?? 0} correction steps left${m.dest?.pos == null ? '' : ', walking to a point'}.`;
      },
    );
    await sleep(REST_MS);

    // D3D x and z; the heights are not compared.
    const says = own.act.body.pos;
    const sees = seen()!.act.body.pos;
    const ran = Math.hypot(says[0] - from[0]!, says[2] - from[2]!);
    const apart = Math.hypot(says[0] - sees[0], says[2] - sees[2]);
    expect(ran, `the walker ran only ${ran.toFixed(1)} m in 3 s (from ${from.map((v) => v.toFixed(1)).join(', ')} to ${says.map((v) => v.toFixed(1)).join(', ')})`).toBeGreaterThan(MIN_RUN_M);
    expect(
      apart,
      `the walker says it stands at (${says[0].toFixed(2)}, ${says[2].toFixed(2)}) and the observer sees it at (${sees[0].toFixed(2)}, ${sees[2].toFixed(2)}): ${apart.toFixed(2)} m apart`,
    ).toBeLessThanOrEqual(WITHIN_M);
  }, 60000);

  it('every bundle had a table and no reader mismatched', () => {
    // The counts of the first sessions, before they leave. Without the table of contents (world-snapshot-index.patch in the WorldServer) `indexed` stays 0.
    for (const player of [walker, observer]) {
      const stats = player.session?.stats;
      if (stats === undefined) throw new Error(`the ${player.role} has no session: the first test did not get it in`);
      const counts = `(${stats.bundles} bundles, ${stats.indexed} with a table, ${stats.skipped} messages skipped, ${stats.mismatched} mismatched, ${stats.unknownPackets} unknown packets)`;
      expect(stats.bundles, `the ${player.role} got no bundle`).toBeGreaterThan(0);
      expect(stats.indexed, `the ${player.role}'s bundles without a table of contents: is the rebuilt WorldServer running? ${counts}`).toBe(stats.bundles);
      expect(stats.mismatched, `a reader of the ${player.role} did not end where the table says ${counts}`).toBe(0);
    }
  });

  it('both leave and can enter again', async () => {
    bothInWorld();
    await Promise.all([walker.leave(), observer.leave()]);

    // Too soon the world server still holds the characters; see REENTER_WAIT_MS.
    for (const player of [walker, observer]) {
      await retryWhileStillInGame(() => player.enter());
      expect(player.entered?.worldId, `${player.role} ${player.name} entered world ${player.entered?.worldId} the second time`).toBe(MADRIGAL);
    }
  }, 240000);
});
