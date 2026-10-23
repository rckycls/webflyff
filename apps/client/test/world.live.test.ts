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
// What is real and what is not: the gateway, the channels, LoginFlow, WorldSession, WorldState, the movement rules, the
// own mover's driving (`OwnMover`, as the world screen drives it: the controls each step, the moves it sends, a tap's
// DESTPOS and `m_nCorr`, the PLAYERCORR a step may owe) and the packets are the client's own. What the world screen
// adds (the 3D view, the keys, the pointer, the frame loop) is replaced by a loop of 60 rules steps a second from the
// real clock, run for both players, and by a walker that presses "run forward" for 3 s and then lets go of forward
// (with nothing held the mode stays as it was, Ruling 40, so the stop goes out as PLAYERMOVED alone, without a mode
// change's PLAYERBEHAVIOR, which would carry the position by itself), and then taps a point 8 m ahead of it. The game
// data (the movers' speeds, the world folders) is read from the worktree's dist/assets through a store that reads
// files, and the ground from the same folder's tiles (the terrain, without the objects), so the walker stands on the
// terrain as the screen would put it: the run and the tap need open ground ahead of the walker's character.
//
// The servers' accept limiter (helpers/connectGap.ts explains it): every connection below waits until 300 ms after the
// one before, the lobby's and the world's alike; keep it that way, and do not loop the test.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorldManifest } from '@flyffweb/formats';
import { CloseCode } from '@flyffweb/protocol';
import type { BundleMessage, CharacterSummary, MoveReport, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { MoveIntent } from '@flyffweb/scene';
import type { Gateway } from '@flyffweb/gateway/src/server';
import { closeText } from '../src/lobby/errorText';
import { TIMEOUT_TEXT } from '../src/lobby/LoginFlow';
import type { WorldEntry } from '../src/lobby/LoginFlow';
import { loadGameData } from '../src/world/gameData';
import type { GameData } from '../src/world/gameData';
import { ObjSta } from '../src/world/sim/constants';
import { OwnMover } from '../src/world/ownMover';
import type { OwnMoverSession } from '../src/world/ownMover';
import { FixedStepper } from '../src/world/sim/stepper';
import { JOIN_CLOSED_TEXT, WorldSession } from '../src/world/WorldSession';
import type { WorldEvent } from '../src/world/WorldSession';
import { WorldState } from '../src/world/WorldState';
import type { Mover } from '../src/world/WorldState';
import { checkReachable } from './helpers/connectGap';
import { ASSETS_DIR, DiskAssets, Terrain } from './helpers/diskAssets';
import { CONFIG_PATH, loadConfigFile, parseGatewaySettings, requireBankPin, requireText } from './helpers/liveConfig';
import type { GatewaySettings } from './helpers/liveConfig';
import { printGatewayLogOnFailure, startLiveGateway } from './helpers/liveGateway';
import { Link } from './helpers/liveLink';
import { LOGIN_WAIT_MS, LiveLobby, UnexpectedEvent, isOpenChannel, newVagrant } from './helpers/liveLobby';

// ---- The config ------------------------------------------------------------------------------------------------

interface Account {
  account: string;
  password: string;
  /** The 4-digit Bank PIN, for making and deleting the character the test makes. */
  bankPin: string;
}

interface WorldLiveConfig extends GatewaySettings {
  /** The walker's account, then the observer's. */
  accounts: [Account, Account];
}

const HOW_TO_SET_UP =
  'Copy apps/client/test/live.config.example.json to apps/client/test/live.config.json (if you have not yet) and add its '
  + '"world" section: two throwaway accounts with their Bank PINs. Start the game servers and run `npm run test:live:world` '
  + 'again. The comment at the top of the example explains the settings.';

function parseAccount(json: unknown, where: string): Account {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error(`${where} must be an object`);
  const item = json as Record<string, unknown>;
  return { account: requireText(item, 'account', `${where}.`), password: requireText(item, 'password', `${where}.`), bankPin: requireBankPin(item, `${where}.`) };
}

/** Checks the `world` section (anything else in the file, `_comment` and the lobby test's fields included, is ignored). */
function parseWorldConfig(root: Record<string, unknown>): WorldLiveConfig {
  const base = parseGatewaySettings(root);
  const world = root.world;
  if (typeof world !== 'object' || world === null || Array.isArray(world)) throw new Error('world must be an object');
  const list = (world as Record<string, unknown>).accounts;
  if (!Array.isArray(list) || list.length !== 2) throw new Error('world.accounts must hold exactly two accounts');
  const accounts: [Account, Account] = [parseAccount(list[0], 'world.accounts[0]'), parseAccount(list[1], 'world.accounts[1]')];
  // The login lower-cases the account, so these two would be one.
  if (accounts[0].account.trim().toLowerCase() === accounts[1].account.trim().toLowerCase()) throw new Error('world.accounts must be two different accounts');
  return { ...base, accounts };
}

/** The settings, or why the test is skipped: no live.config.json, or none with a `world` section. A file that is broken stops the run. */
function loadSetup(): { config: WorldLiveConfig; skip?: undefined } | { config?: undefined; skip: string } {
  const loaded = loadConfigFile('Live world test', (root) => (
    Object.hasOwn(root, 'world') ? { config: parseWorldConfig(root) } : { skip: `${CONFIG_PATH} has no "world" section` }
  ));
  return loaded ?? { skip: `${CONFIG_PATH} does not exist` };
}

// Read while the file is collected: the skip below depends on it, and a broken file stops the run here, at once.
const { config, skip } = loadSetup();
// The text is also in the suite's title, but a reporter that lists no skipped tests (vitest's default) shows only this.
if (skip !== undefined) console.warn(`Live world test skipped: ${skip}. ${HOW_TO_SET_UP}`);

/** The settings, for the code that runs only when the tests are not skipped. */
function settings(): WorldLiveConfig {
  if (config === undefined) throw new Error('the live world test ran without settings');
  return config;
}

// ---- Timing, places and numbers --------------------------------------------------------------------------------

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
/** `WI_WORLD_MADRIGAL` (`Resource/defineWorld.h`): Flaris is in Madrigal. */
const MADRIGAL = 1;
/** The walker must have run at least this far in its 3 s (a run is 6 m a second at the player's table speed), or "stopped within 1 m" would prove nothing. */
const MIN_RUN_M = 10;
/** The observer's walker must be this close (D3D x and z) to where the walker's own mover stands. */
const WITHIN_M = 1;
/** PLAYERMOVED goes out when the run starts and when it stops; the observer must have applied at least these two MOVERMOVED. */
const MIN_MOVES_APPLIED = 2;
/** How far ahead of the walker the tap is: open ground there, as the screen would pick it on the land. */
const TAP_M = 8;
/** A walk of 8 m at the run's 6 m a second takes under 2 s; the walker stands within this. */
const TAP_WALK_MS = 10000;

/** No keys: the mode stays as it is (the server's at first), as on the world screen (Ruling 40). */
const STAND: MoveIntent = { forward: 0, turn: 0, run: false };
/** Forward with the run key held. */
const RUN_FORWARD: MoveIntent = { forward: 1, turn: 0, run: true };
/** Forward let go after the run: the stop is PLAYERMOVED alone, since with no move held the mode stays (Ruling 40). */
const STOP_RUNNING: MoveIntent = { forward: 0, turn: 0, run: true };

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---- The converted game files ----------------------------------------------------------------------------------

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
let gatewayLog: string[] = [];

/** The world server turned the character away because it still holds it from the session before: worth trying again soon. */
class StillInGame extends Error {}

/**
 * The account is logged in on the servers already (a game client, or a session that has only just closed): the certifier
 * answers a login with that, and the flow reports `alreadyConnected`. Worth trying again soon, like `StillInGame`.
 */
const isStillInGame = (error: unknown): boolean =>
  error instanceof StillInGame || (error instanceof UnexpectedEvent && error.event.type === 'alreadyConnected');

/** A `LiveLobby` on its own `Link` to the in-process gateway. */
class Lobby extends LiveLobby {
  /** The characters of the channel the flow picked, once they have come. */
  characters: CharacterSummary[] = [];

  constructor() {
    super(new Link(gateway!.port, settings().gateway.allowedOrigins[0]!), settings().certifierAddress);
  }
}

/** What it usually means when a world session ends before the player is in. */
function explainEnd(message: string): string {
  if (message === closeText(CloseCode.SERVER_UNREACHABLE)) {
    return `${message}\nThe gateway could not connect to the cache server. Is it running, and is the address the login server announces (CACHE_ADDR, port 5400) a route with the role "cache" in gateway.routes?`;
  }
  if (message === TIMEOUT_TEXT) return `${message}\nPRE_JOIN or JOIN got no answer: are the login, cache and world servers all running?`;
  return message;
}

// ---- A player in the world -------------------------------------------------------------------------------------

type EnteredEvent = Extract<WorldEvent, { type: 'entered' }>;

/** The world session ended with this text before the player was in. */
class EndedBeforeEntering extends Error {}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * One account's player: logs in, picks (or makes) its character, enters, and then, like the world screen, runs the rules
 * 60 steps a second with the keys in `intent` and a `tap`, driving its own mover with the world screen's `OwnMover`.
 * It keeps its own `WorldState`, the movers in view of its session, which the other player's moves reach through the
 * server.
 */
class Player {
  /** The character it plays: the account's first, or the one the test made. */
  character: CharacterSummary | undefined;
  /** Set when the test made the character: it is deleted at the end. The slot is known once the list that holds it has come. */
  created: { name: string; slot?: number } | undefined;
  session: WorldSession | undefined;
  world: WorldState | undefined;
  entered: EnteredEvent | undefined;
  /** What the keys would ask of the own mover each step. */
  intent: MoveIntent = STAND;
  /** A tap on the land, at this D3D point, that the next step takes (`TapToWalk.take`). */
  tap: Vec3 | null = null;
  /** What the own mover's driving sent since the player entered: the DESTPOS points and the PLAYERCORR states. */
  readonly sentDestPos: Vec3[] = [];
  readonly sentCorr: MoveReport[] = [];
  /** Rules steps taken since the first entry. */
  steps = 0;
  /** The text of the `ended` event, if the session has ended. */
  endedWith: string | undefined;
  /** What went wrong in handling the session's events, which nothing else would report once the player is in. */
  failure: Error | undefined;
  /** In the world and stepping. */
  playing = false;

  private entry: WorldEntry | undefined;
  private lobby: Lobby | undefined;
  /** The own mover's driving, as the world screen's, for the session the player is in. */
  private ownMover: OwnMover | undefined;
  private finishEntering: { resolve: () => void; reject: (error: Error) => void } | undefined;
  /** MOVERMOVED messages applied, by the object they moved. */
  private readonly movesApplied = new Map<number, number>();
  /** DESTPOS messages applied, by the object they sent somewhere. */
  private readonly destsApplied = new Map<number, number>();

  /** `nameStart` keeps the made character's three digits apart from the other player's (this one's are `nameStart` to `nameStart` + 499). */
  constructor(readonly role: 'walker' | 'observer', readonly login: Account, private readonly nameStart: number) {}

  get name(): string {
    return this.character?.name ?? `the ${this.role}`;
  }

  /** The player's object ID in the world. */
  get objectId(): number {
    if (this.entered === undefined) throw new Error(`${this.role} has not entered the world`);
    return this.entered.playerObjectId;
  }

  /** How many MOVERMOVED messages about `objectId` this player has applied. */
  movesAppliedTo(objectId: number): number {
    return this.movesApplied.get(objectId) ?? 0;
  }

  /** How many DESTPOS messages about `objectId` this player has applied. */
  destsAppliedTo(objectId: number): number {
    return this.destsApplied.get(objectId) ?? 0;
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

  /** Throws if handling the session's events failed or the session has ended: nothing a test waits for can come then. */
  check(): void {
    if (this.failure !== undefined) throw new Error(`the ${this.role}'s handling of the world's messages failed: ${this.failure.message}`, { cause: this.failure });
    if (this.endedWith !== undefined) throw new Error(`the ${this.role}'s world session ended: ${this.endedWith}`);
  }

  /** Logs in, lists the characters and picks the character, makes one if the account has none, and enters the world. */
  async enter(): Promise<void> {
    this.playing = false;
    this.endedWith = undefined;
    this.failure = undefined;
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

  /**
   * One rules step, as the world screen takes it (`WorldScreen.step`): a tap, then the keys, to the own mover
   * (`OwnMover.control`), its moves sent; then every mover's step, and the PLAYERCORR it may owe.
   */
  step(): void {
    const { world, ownMover } = this;
    if (!this.playing || world === undefined || ownMover === undefined) return;
    const own = world.self();
    const tap = this.tap;
    this.tap = null;
    if (own !== undefined) ownMover.control(own, this.intent, tap);
    world.step();
    ownMover.corrected(own);
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
          if (character === undefined) return; // gone already, or never made
          lobby.flow.deleteCharacter(character.slot, this.login.bankPin);
          const after = await lobby.expect('characters');
          if (after.characters.some((c) => c.name === made.name)) throw new Error('the character is still in the list');
        } finally {
          await lobby.end();
        }
      });
      this.created = undefined;
    } catch (error) {
      const where = made.slot === undefined ? '' : ` (slot ${made.slot})`;
      throw new Error(`Deleting ${made.name}${where} of the account ${this.login.account} failed, so it may still be on the test account; delete it by hand. ${(error as Error).message}`, { cause: error });
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
    const name = `WebWalk${String(this.nameStart + Math.floor(Math.random() * 500)).padStart(3, '0')}`;
    lobby.flow.createCharacter(newVagrant(0, name, this.login.bankPin));
    // Kept before the list is awaited, so that a list that comes late (or never) still gets the character deleted, found by its name.
    this.created = { name };
    const { characters } = await lobby.expect('characters');
    const made = characters.find((c) => c.name === name);
    if (made === undefined) throw new Error(`the character ${name} is not in the list after it was made`);
    this.created.slot = made.slot;
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
        if (error.message === JOIN_CLOSED_TEXT) throw new StillInGame(error.message, { cause: error });
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
      // WorldSession would only log a throw from here: keep it, for `check` and the waits to report, entering or not.
      this.failure ??= asError(error);
      this.finishEntering?.reject(asError(error));
    }
  }

  /** The JOIN bundle: the world the player is in, with the movers in view, standing on its terrain; the own mover's driving. */
  private begin(event: EnteredEvent): void {
    const terrain = terrainOf(event.worldId);
    const session = this.session!;
    this.world = new WorldState(gameData!, this.entry!.clock, terrain.ground);
    this.entered = event;
    this.sentDestPos.length = 0;
    this.sentCorr.length = 0;
    // the session's sends, counted on the way (the world screen's mark of the tapped point is not drawn here)
    const sends: OwnMoverSession = {
      sendMoved: (move) => session.sendMoved(move),
      sendBehavior: (move) => session.sendBehavior(move),
      sendDestPos: (pos, forward) => {
        this.sentDestPos.push([...pos]);
        session.sendDestPos(pos, forward);
      },
      sendCorr: (move) => {
        this.sentCorr.push(move);
        session.sendCorr(move);
      },
    };
    this.ownMover = new OwnMover(sends, this.entry!.clock, { show: () => {} });
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
      if (value.type === 'moverMoved') this.movesApplied.set(objectId, this.movesAppliedTo(objectId) + 1);
      if (value.type === 'destPos') this.destsApplied.set(objectId, this.destsAppliedTo(objectId) + 1);
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

/** Runs `attempt` again every few seconds while it fails as `isStillInGame` says, for up to `REENTER_WAIT_MS` in all. */
async function retryWhileStillInGame(attempt: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + REENTER_WAIT_MS;
  for (;;) {
    try {
      await attempt();
      return;
    } catch (error) {
      if (!isStillInGame(error) || Date.now() + REENTER_EVERY_MS > deadline) {
        if (isStillInGame(error)) throw new Error(`still turned away after ${REENTER_WAIT_MS / 1000} s: ${(error as Error).message}`, { cause: error });
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
      this.failure = asError(error);
      console.error('live world test: a rules step failed:', error);
      this.stop();
    }
  }
}

// ---- State and helpers -----------------------------------------------------------------------------------------

let walker: Player;
let observer: Player;
const loop = new RulesLoop(() => [walker, observer]);

/** Throws if the rules loop failed, or either player's events failed to be handled or its session has ended. */
function checkWell(): void {
  loop.check();
  walker.check();
  observer.check();
}

/**
 * Polls `done` until it holds, checking all the while that nothing has failed (`checkWell`); `why` says what was seen
 * instead if it does not within `timeoutMs`.
 */
async function waitUntil(what: string, timeoutMs: number, done: () => boolean, why: () => string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    checkWell();
    if (done()) return;
    if (Date.now() > deadline) throw new Error(`${what}: not within ${timeoutMs / 1000} s. ${why()}`);
    await sleep(20);
  }
}

/** Both players, who must be in the world: the tests after the first need what it did. */
function bothInWorld(): [Player, Player] {
  checkWell();
  for (const player of [walker, observer]) {
    if (!player.playing) throw new Error(`the ${player.role} is not in the world: the first test did not get both players in`);
  }
  return [walker, observer];
}

/** The state of a mover as a short text, for a failure message. */
const stateText = (m: Pick<Mover, 'act' | 'corr' | 'dest'>): string =>
  `at ${m.act.body.pos.map((v) => v.toFixed(2)).join(', ')} in state 0x${m.act.state.toString(16)}, ${m.corr?.remnant ?? 0} correction steps left${m.dest?.pos == null ? '' : ', walking to a point'}`;

/** Standing, with no correction running and no point to walk to. */
const stands = (m: Mover): boolean =>
  (m.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND && (m.corr?.remnant ?? 0) === 0 && (m.dest?.pos ?? null) === null;

// ---- The tests -------------------------------------------------------------------------------------------------

describe.skipIf(config === undefined)(skip === undefined ? 'live world' : `live world (skipped: ${skip}. ${HOW_TO_SET_UP})`, () => {
  beforeAll(async () => {
    const live = settings();
    const certifier = live.gateway.routes[live.certifierAddress]!;
    await checkReachable('Live world test', certifier.host, certifier.port, 'npm run test:live:world');

    assets = DiskAssets.open();
    gameData = await loadGameData(assets);
    walker = new Player('walker', live.accounts[0], 0);
    observer = new Player('observer', live.accounts[1], 500);
    ({ gateway, log: gatewayLog } = await startLiveGateway('Live world test', live.gateway));
  });

  beforeEach(() => {
    printGatewayLogOnFailure(gatewayLog);
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
    const own = runner.world!.self();
    if (own === undefined) throw new Error(`the walker's own character is not among its movers in view: ${runner.inView()}`);
    const from = [...own.act.body.pos];
    const movesBefore = watcher.movesAppliedTo(runner.objectId);
    const stepsBefore = runner.steps;

    try {
      // 3 s of "run forward" (180 steps), then forward let go: the first idle step stands the mover and sends PLAYERMOVED,
      // and nothing else (with nothing held the mode stays), so the stop rides on PLAYERMOVED alone.
      runner.intent = RUN_FORWARD;
      await waitUntil('the walker running for 3 s', 10000, () => runner.steps >= stepsBefore + RUN_STEPS,
        () => `the walker took ${runner.steps - stepsBefore} of ${RUN_STEPS} rules steps: is the rules loop running?`);
      runner.intent = STOP_RUNNING;
      await waitUntil('the walker standing', 5000, () => (own.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND,
        () => `the walker is ${stateText(own)}.`);

      // The observer's walker is settled once the stop has come through the server: it stands, no correction has steps left
      // (a spent correction's action stays in `corr` until the next move; `remnant` is what runs) and no point is being walked to.
      const seen = (): Mover | undefined => watcher.sees(runner.name);
      await waitUntil(
        'the observer seeing the walker stand',
        SETTLE_MS,
        () => {
          const m = seen();
          return m !== undefined && stands(m);
        },
        () => {
          const m = seen();
          return m === undefined ? `${watcher.inView()}.${watcher.tableHint()}` : `The observer's walker is ${stateText(m)}. The observer applied ${watcher.movesAppliedTo(runner.objectId) - movesBefore} MOVERMOVED of it.`;
        },
      );
      await sleep(REST_MS);
      checkWell();

      const stood = seen();
      if (stood === undefined) throw new Error(`the observer lost sight of the walker while they rested. ${watcher.inView()}`);
      // D3D x and z; the heights are not compared.
      const says = own.act.body.pos;
      const sees = stood.act.body.pos;
      const ran = Math.hypot(says[0] - from[0]!, says[2] - from[2]!);
      const apart = Math.hypot(says[0] - sees[0], says[2] - sees[2]);
      const moves = watcher.movesAppliedTo(runner.objectId) - movesBefore;
      expect(ran, `the walker ran only ${ran.toFixed(1)} m in 3 s (from ${from.map((v) => v.toFixed(1)).join(', ')} to ${says.map((v) => v.toFixed(1)).join(', ')})`).toBeGreaterThan(MIN_RUN_M);
      expect(moves, `the observer applied ${moves} MOVERMOVED of the walker, not the ${MIN_MOVES_APPLIED} (start and stop) the PLAYERMOVED packets make: the server did not pass them on`).toBeGreaterThanOrEqual(MIN_MOVES_APPLIED);
      expect(
        apart,
        `the walker says it stands at (${says[0].toFixed(2)}, ${says[2].toFixed(2)}) and the observer sees it at (${sees[0].toFixed(2)}, ${sees[2].toFixed(2)}): ${apart.toFixed(2)} m apart`,
      ).toBeLessThanOrEqual(WITHIN_M);
    } finally {
      runner.intent = STAND;
    }
  }, 60000);

  it('the observer sees the walker walk to a point it tapped 8 m ahead, and stand within 1 m of it', async () => {
    const [runner, watcher] = bothInWorld();
    const own = runner.world!.self();
    if (own === undefined) throw new Error(`the walker's own character is not among its movers in view: ${runner.inView()}`);
    const destsBefore = watcher.destsAppliedTo(runner.objectId);
    // 8 m ahead in the way the walker faces (D3D (sin, -cos) of the angle), on the terrain: where a tap there would land
    const theta = (own.act.body.angle * Math.PI) / 180;
    const x = own.act.body.pos[0] + Math.sin(theta) * TAP_M;
    const z = own.act.body.pos[2] - Math.cos(theta) * TAP_M;
    const point: Vec3 = [x, terrainOf(runner.entered!.worldId).heightAt(x, z) ?? own.act.body.pos[1], z];

    // the tap: SetDestPos, m_nCorr -1 and the client SNAPSHOT with DESTPOS (OwnMover); the walker walks there in its mode
    runner.tap = point;
    await waitUntil('the walker standing at the tapped point', TAP_WALK_MS, () => runner.sentDestPos.length > 0 && stands(own),
      () => `the walker is ${stateText(own)}, ${Math.hypot(own.act.body.pos[0] - x, own.act.body.pos[2] - z).toFixed(2)} m from the point.`);

    // the server passes the DESTPOS on: the observer's copy walks there on its own and stands
    const seen = (): Mover | undefined => watcher.sees(runner.name);
    await waitUntil(
      'the observer seeing the walker stand at the point',
      SETTLE_MS,
      () => {
        const m = seen();
        return m !== undefined && watcher.destsAppliedTo(runner.objectId) > destsBefore && stands(m);
      },
      () => {
        const m = seen();
        return m === undefined ? `${watcher.inView()}.` : `The observer's walker is ${stateText(m)}. The observer applied ${watcher.destsAppliedTo(runner.objectId) - destsBefore} DESTPOS of it.`;
      },
    );
    await sleep(REST_MS);
    checkWell();

    const stood = seen();
    if (stood === undefined) throw new Error(`the observer lost sight of the walker while they rested. ${watcher.inView()}`);
    const says = own.act.body.pos;
    const sees = stood.act.body.pos;
    const fromPoint = Math.hypot(says[0] - x, says[2] - z);
    const apart = Math.hypot(says[0] - sees[0], says[2] - sees[2]);
    expect(runner.sentDestPos, 'the walker sent one DESTPOS, of the tapped point').toEqual([point]);
    // open ground: the walk met nothing and did not fall, so it owed no PLAYERCORR
    expect(runner.sentCorr, `the walker's tap-walk ended where it met something or fell (PLAYERCORR): ${runner.sentCorr.length} sent`).toEqual([]);
    expect(fromPoint, `the walker stands ${fromPoint.toFixed(2)} m from the point it tapped`).toBeLessThanOrEqual(WITHIN_M);
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
