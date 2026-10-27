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
// The last test is a fight (Piece 4): the walker checks that its own ADD_OBJ's inventory was read (the starter food),
// walks out of Flaris through the north gate to the Small Aibatts (`MI_AIBATT1`; never a giant, Ruling R30), taps the
// nearest and presses the attack button, and the world screen's attack (`Focus`, `AttackLoop`, the own numbers'
// `OwnState`, wired as `WorldScreen` wires them) attacks it until it dies. It fails on the server's
// `TID_GAME_MODIFY_ATTACK_SPEED` (and on a second `TID_GAME_PRIORITYMOB`: after the first it tries another Aibatt once),
// on a swing with no DAMAGE within 3 s, on EXP that does not rise after the kill, and on any message misread. For it the
// walker's steps also meet the placed objects, as on the screen: their collision shapes, read from the disk as the
// stage reads them (`placedObjects`, its tiles around the walker as the test starts). Every player has the world
// screen's views of the movers, without a screen (`headlessViews`): their models' frames end the swings and land their
// blows (without them a swing would end at once, and the next would follow it a step later), and their boxes give the
// radii of `IsRangeObj` (`WorldScreen.measureRadii`). A character the test did not make walks back to where it started,
// so that the next run's first test finds it in sight of the other's. Run alone (`npm run test:live:world -- -t fight`),
// the test enters the walker itself.
//
// The servers' accept limiter (helpers/connectGap.ts explains it): every connection below waits until 300 ms after the
// one before, the lobby's and the world's alike; keep it that way, and do not loop the test.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorldManifest } from '@flyffweb/formats';
import { CloseCode } from '@flyffweb/protocol';
import type { AddedMover, BundleMessage, CharacterSummary, MoveReport, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { CollisionShapes, MoveIntent } from '@flyffweb/scene';
import type { Gateway } from '@flyffweb/gateway/src/server';
import { closeText } from '../src/lobby/errorText';
import { TIMEOUT_TEXT } from '../src/lobby/LoginFlow';
import type { WorldEntry } from '../src/lobby/LoginFlow';
import { AttackLoop, attackAble, objRadius } from '../src/world/combat/attackLoop';
import type { AttackLoopSession } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import { movesOrTurns } from '../src/world/controls';
import { loadGameData } from '../src/world/gameData';
import type { GameData } from '../src/world/gameData';
import { OwnState } from '../src/world/OwnState';
import type { MoverViews } from '../src/world/render/MoverViews';
import type { Ground } from '../src/world/sim/collision';
import { ObjSta } from '../src/world/sim/constants';
import { OwnMover } from '../src/world/ownMover';
import type { OwnMoverSession } from '../src/world/ownMover';
import { FixedStepper } from '../src/world/sim/stepper';
import { JOIN_CLOSED_TEXT, WorldSession } from '../src/world/WorldSession';
import type { WorldEvent } from '../src/world/WorldSession';
import { WorldState, isDie, isLive } from '../src/world/WorldState';
import type { CombatEvent, Mover } from '../src/world/WorldState';
import { checkReachable } from './helpers/connectGap';
import { ASSETS_DIR, DiskAssets, Terrain, placedObjects } from './helpers/diskAssets';
import { headlessViews } from './helpers/headlessViews';
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

// ---- The fight ---------------------------------------------------------------------------------------------------

/** `II_GEN_FOO_INS_LOLLIPOP`, `II_GEN_FOO_INS_BISCUIT` (`Resource/defineItem.h:1063-1064`): a new character's 3 and 1 (`BASE_VALUE_TBL`, `Database.sql:2741-2742`, both sexes). */
const STARTER_FOOD = [2800, 2801];
/** `MI_AIBATT1` (`Resource/defineObj.h:1028`), the Small Aibatt: level 1, `dwAddHp` 120, `nExpValue` 2 (`propMover.txt:7`). */
const MI_AIBATT1 = 20;
/**
 * The way out of Flaris to the Small Aibatts north of it, D3D x and z, each point a tap's walk (DESTPOS) once the walker
 * stands at the one before: to where new characters start (`RI_BEGIN`, `Resource/World/WdMadrigal/WdMadrigal.rgn:742`,
 * beside the lodestar; after the first tests a new character stands 26 m south of it), north between the fences to the
 * north gate (its two lamps, `obj_mafiprla02` at 6953.6, 3377.6 and 6965.6, 3377.6), over the bridge (`obj_maflprbr03`,
 * 6960.4, 3396.0), and across the field to a spot between the two Small Aibatt respawns there (`WdMadrigal.rgn:700-701`:
 * 18 each, in 7028-7076 x 3392-3440 and 6988-7036 x 3400-3448), with nothing in the way for about 12 m around. Each leg
 * was walked through the rules with Madrigal's placed objects (the converted files) and met nothing. The giants'
 * respawns (`MI_AIBATT4`, `RANK_BOSS`, `WdMadrigal.rgn:687`) are 300 m west of it.
 */
const TO_THE_AIBATTS: readonly (readonly [number, number])[] = [[6972, 3337], [6962, 3348], [6960, 3366], [6960, 3412], [7040, 3430]];
/** A walker in walk mode goes a quarter of its 6 m a second (`moveSpeed`); each leg of the way gets that long, and this more. */
const WALK_M_PER_S = 1.5;
const LEG_SPARE_MS = 10000;
/** All the Small Aibatts near may be dead: one comes back within 30 s (`m_uTime` 60, halved for `MI_AIBATT1`: `CWorld::ReadRespawn`, `WorldFile.cpp:597`, :627-636). */
const AIBATT_WAIT_MS = 40000;
/** The attack runs until MOVERDEATH, for at most this long (each Aibatt). */
const FIGHT_MS = 60000;
/**
 * Every swing's DAMAGE comes within this; the killing blow's answer is the MOVERDEATH instead, as the server sends no
 * DAMAGE for it (`CAttackArbiter::OnDamageMsgW`, `WORLDSERVER/AttackArbiter.cpp:228-255`: `OnDamaged` with HP left,
 * else `OnDied`).
 */
const DAMAGE_WAIT_MS = 3000;
/** The kill's SETEXPERIENCE comes with the MOVERDEATH (`OnDied`, `SubExperience`, `AttackArbiter.cpp:792`); this is only the safety net. */
const EXP_WAIT_MS = 10000;
/** What the stage gives the rules with no objects near, and the walker's ground before the fight turns them on. */
const NO_OBJECTS: ReturnType<Ground['objectsNear']> = Object.freeze([]);

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
const worlds = new Map<number, { manifest: WorldManifest; terrain: Terrain }>();

/** The manifest and the terrain of a world by its `WI_*` id; throws for a world the converter has not converted. */
function worldOf(worldId: number): { manifest: WorldManifest; terrain: Terrain } {
  let world = worlds.get(worldId);
  if (world === undefined) {
    const folder = gameData!.worlds.get(worldId);
    const key = `worlds/${folder}/manifest.json`;
    if (folder === undefined || !assets!.has(key)) {
      throw new Error(`world ${worldId} (${folder ?? 'not in World.inc'}) is not converted in ${ASSETS_DIR}: the world screen would show "This map isn't available in the browser yet."`);
    }
    const manifest = assets!.readJson<WorldManifest>(key);
    world = { manifest, terrain: new Terrain(assets!, manifest) };
    worlds.set(worldId, world);
  }
  return world;
}

const terrainOf = (worldId: number): Terrain => worldOf(worldId).terrain;

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
 * 60 steps a second with the keys in `intent` and a `tap`, driving its own mover with the world screen's `OwnMover`,
 * and its attack with the world screen's `AttackLoop` (a tap on a mover, `pressMover`; the attack button,
 * `pressAttack`; Escape, `giveUpTarget`). It keeps its own `WorldState`, the movers in view of its session, which the
 * other player's moves reach through the server, and the own character's numbers (`OwnState`) that the messages about
 * it change.
 */
class Player {
  /** The character it plays: the account's first, or the one the test made. */
  character: CharacterSummary | undefined;
  /** Set when the test made the character: it is deleted at the end. The slot is known once the list that holds it has come. */
  created: { name: string; slot?: number } | undefined;
  session: WorldSession | undefined;
  world: WorldState | undefined;
  entered: EnteredEvent | undefined;
  /** The own character's numbers, from the JOIN's own ADD_OBJ and the lobby's equipment (`WorldScreen.ownState`). */
  own: OwnState | undefined;
  /** What the keys would ask of the own mover each step. */
  intent: MoveIntent = STAND;
  /** A tap on the land, at this D3D point, that the next step takes (`TapToWalk.take`). */
  tap: Vec3 | null = null;
  /**
   * The world's placed objects (their collision shapes, `placedObjects`) that the movers' steps meet, as on the world
   * screen's stage; none until a test sets them, as the first tests had it (the terrain alone).
   */
  objects: Pick<CollisionShapes, 'objectsNear'> | undefined;
  /** What the own mover's driving sent since the player entered: the DESTPOS points and the PLAYERCORR states. */
  readonly sentDestPos: Vec3[] = [];
  readonly sentCorr: MoveReport[] = [];
  /** What the attack sent since the player entered: the targets of its PLAYERSETDESTOBJs, and its MELEE_ATTACKs with when. */
  readonly sentDestObj: number[] = [];
  readonly sentSwings: { at: number; targetId: number }[] = [];
  /** The hits, deaths and texts the world played since the player entered (`WorldState.takeChanges`), with when (`performance.now()`). */
  readonly combatSeen: { at: number; event: CombatEvent }[] = [];
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
  /** The focus and the auto-attack, as the world screen's, for the session the player is in. */
  private focus: Focus | undefined;
  private attack: AttackLoop | undefined;
  /**
   * The world screen's views of the movers, without a screen (`headlessViews`): the models' frames that end a swing and
   * land its blow, and the boxes of the attack's radii. What they could not load (the screen's overlay says it) is in
   * `viewProblems`.
   */
  private views: MoverViews | undefined;
  readonly viewProblems = new Set<string>();
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

  /** The mover the player has selected (`Focus.targetId`), if any. */
  get focusId(): number | null {
    return this.focus?.targetId ?? null;
  }

  /** Whether the attack button would be enabled now (`AttackLoop.canAttackFocus`, which the world screen gives it each frame). */
  get canAttackFocus(): boolean {
    return this.attack?.canAttackFocus === true;
  }

  /**
   * A tap on the mover `objectId`: the world screen's `TapToWalk` hands the press to the attack loop as it goes down
   * (`onMoverPressed`, not a double tap), between two rules steps; the next step finds it let go (`onReleased`).
   */
  pressMover(objectId: number): void {
    this.attack?.onMoverPressed(objectId, performance.now(), false);
  }

  /** The attack button of a touch screen (`AttackButton`'s press: `AttackLoop.attackButton`). */
  pressAttack(): void {
    this.attack?.attackButton();
  }

  /**
   * Escape until the target is gone (`escapeStep`'s `'target'`: `AttackLoop.escape`, once for a queued next target and
   * once for the focus), which also ends the walk up to it and the auto-attack.
   */
  giveUpTarget(): void {
    while (this.attack?.escape() === true) {
      // each press clears one of the two
    }
  }

  /** Logs in, lists the characters and picks the character, makes one if the account has none, and enters the world. */
  async enter(): Promise<void> {
    this.playing = false;
    this.endedWith = undefined;
    this.failure = undefined;
    this.world = undefined;
    this.entered = undefined;
    this.own = undefined;
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
   * What the world screen's frame does before its rules steps (`WorldScreen.frame`): the radii the attack's arrival
   * needs (`measureRadii`). (The changes of the bundles are taken as they come, `apply`.)
   */
  frame(): void {
    const { world, views } = this;
    const own = world?.self();
    if (!this.playing || world === undefined || views === undefined || own === undefined) return;
    this.measureRadii(world, views, own);
  }

  /**
   * One rules step, as the world screen takes it (`WorldScreen.step`): the press let go (none is held from one step to
   * the next here: a press on a mover is a tap, `pressMover`); a move of the keys stopping the auto-attack, then the
   * attack loop's branch of `CWndWorld::Process`, and where that is `ControlPlayer`, a tap, then the keys, to the own
   * mover (`OwnMover.control`), its moves sent; then every mover's step, the PLAYERCORR it may owe, what the step played
   * (`take`, the world screen's `syncViews`), and the views' step (the models' frames).
   */
  step(): void {
    const { world, ownMover, attack, views } = this;
    if (!this.playing || world === undefined || ownMover === undefined || attack === undefined || views === undefined) return;
    const own = world.self();
    const tap = this.tap;
    this.tap = null;
    attack.onReleased();
    if (own !== undefined) {
      if (movesOrTurns(this.intent)) attack.stop('move');
      if (attack.step()) ownMover.control(own, this.intent, tap);
    }
    world.step();
    ownMover.corrected(own);
    this.take(world);
    views.step(world.movers);
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

  /**
   * The JOIN bundle, as the world screen enters it (`WorldScreen.enter`): the own character's numbers from the JOIN's own
   * ADD_OBJ and the lobby's equipment (`OwnState`, made before the bundle is applied, so that its messages about the own
   * character reach them); the world the player is in, with the movers in view, standing on its terrain (and on the
   * placed objects once a test sets `objects`); the views of the movers (`WorldScreen.openStage`); the own mover's
   * driving; the bundle; then the focus and the attack (`WorldScreen.showWorld`).
   */
  private begin(event: EnteredEvent): void {
    const terrain = terrainOf(event.worldId);
    const session = this.session!;
    const entry = this.entry!;
    let added: AddedMover | undefined;
    for (const { value } of event.messages) {
      if (value.type === 'addMover' && value.mover.player?.self === true) added ??= value.mover;
    }
    this.own = added === undefined ? undefined : new OwnState(gameData!, added, entry.character.equipment);
    const ground: Ground = { ...terrain.ground, objectsNear: (x, z, range) => this.objects?.objectsNear(x, z, range) ?? NO_OBJECTS };
    this.world = new WorldState(gameData!, entry.clock, ground, this.own);
    this.views?.dispose();
    this.views = headlessViews(assets!, gameData!, entry.character.equipment, (message) => this.viewProblems.add(message));
    this.entered = event;
    for (const sent of [this.sentDestPos, this.sentCorr, this.sentDestObj, this.sentSwings, this.combatSeen]) sent.length = 0;
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
    this.ownMover = new OwnMover(sends, entry.clock, { show: () => {} });
    this.apply(event.messages, true);
    this.startAttack(session, entry, this.world);
    this.playing = true;
  }

  /**
   * The focus and the auto-attack as the world screen makes them (`WorldScreen.showWorld`): the focus tells the server
   * of its changes (SETTARGET) and asks `IsLive` of a mover in view (`WorldScreen.isLive`); the attack reads the own
   * numbers and the movers in view, and sends through the session, its approaches and swings counted on the way.
   */
  private startAttack(session: WorldSession, entry: WorldEntry, world: WorldState): void {
    const focus = new Focus(session, (objectId) => {
      const mover = world.movers.get(objectId);
      return mover === undefined || isLive(mover);
    });
    const sends: AttackLoopSession = {
      sendDestObj: (targetId, range) => {
        this.sentDestObj.push(targetId);
        session.sendDestObj(targetId, range);
      },
      sendMeleeAttack: (message, targetId, attackSpeed) => {
        this.sentSwings.push({ at: performance.now(), targetId });
        session.sendMeleeAttack(message, targetId, attackSpeed);
      },
      sendGetDestObj: (fromId, destId) => session.sendGetDestObj(fromId, destId),
      sendBehavior: (move) => session.sendBehavior(move),
    };
    this.focus = focus;
    this.attack = new AttackLoop(sends, focus, world, () => this.own, entry.clock, gameData!.movers);
  }

  /**
   * A bundle's messages to the movers in view, in order (`WorldScreen.apply`); `joining` for the JOIN's. QUERYGETDESTOBJ
   * is the attack loop's, and so are a death and a DEL_OBJ of a mover in view, told before the world applies them
   * (`AttackLoop.onMoverDeath`, `onRemoved`). Then what they played (`take`).
   */
  private apply(messages: BundleMessage<WorldMessage>[], joining = false): void {
    const world = this.world!;
    for (const { objectId, value } of messages) {
      if (value.type === 'replace') {
        const self = world.self();
        if (self !== undefined) world.apply(self.objectId, { type: 'setPos', pos: value.pos });
        continue;
      }
      if (value.type === 'queryGetDestObj') {
        this.attack?.onQueryGetDestObj(value.fromId);
        continue;
      }
      if (world.movers.has(objectId)) {
        if (value.type === 'moverDeath') this.attack?.onMoverDeath(objectId, value.attackerId);
        else if (value.type === 'delObj') this.attack?.onRemoved(objectId);
      }
      if (value.type === 'moverMoved') this.movesApplied.set(objectId, this.movesAppliedTo(objectId) + 1);
      if (value.type === 'destPos') this.destsApplied.set(objectId, this.destsAppliedTo(objectId) + 1);
      world.apply(objectId, value, joining);
    }
    this.take(world);
  }

  /**
   * What the world played since the last call (`WorldState.takeChanges`), as the world screen's `syncViews` takes it after
   * each bundle and each step: the movers that came and went to the views, and the hits, deaths and texts kept for the
   * fight, with when they came.
   */
  private take(world: WorldState): void {
    const changes = world.takeChanges();
    this.views?.sync(changes, world.movers);
    const at = performance.now();
    for (const event of changes.combat) {
      if (event.kind === 'hit' || event.kind === 'death' || event.kind === 'text') this.combatSeen.push({ at, event });
    }
  }

  /**
   * `WorldScreen.measureRadii`: `CObj::GetRadius` (`objRadius`) of the own mover and of the movers its attack is about
   * (the focus and the one it follows), for `IsRangeObj`'s arrival, from the boxes of their models as the views have
   * them; a mover whose model is still loading stays as it was (0 at first). Only while there is such a mover.
   */
  private measureRadii(world: WorldState, views: MoverViews, own: Mover): void {
    const about = [this.focus?.targetId, own.dest?.targetId].filter((id): id is number => id !== null && id !== undefined);
    if (about.length === 0) return;
    for (const candidate of views.pickCandidates(undefined)) {
      if (candidate.objectId !== own.objectId && !about.includes(candidate.objectId)) continue;
      const mover = world.movers.get(candidate.objectId);
      if (mover !== undefined) mover.radius = objRadius(candidate.box, mover.added.scale);
    }
  }

  /** Stops stepping and closes whatever is open (the session's two connections, or the lobby's), waiting until each has closed. */
  private async drop(): Promise<void> {
    this.playing = false;
    this.views?.dispose();
    this.views = undefined;
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

  /** Starts stepping; does nothing while it steps already. */
  start(): void {
    if (this.timer !== undefined) return;
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
      // a frame of the world screen: what it does before the steps, then the steps
      for (const player of this.players()) player.frame();
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

// ---- The fight's helpers ---------------------------------------------------------------------------------------

/** The walker, in the world: the first tests put it there; run alone (`-t fight`), this enters it and starts the steps. */
async function walkerInWorld(): Promise<Player> {
  if (!walker.playing) {
    loop.start();
    await retryWhileStillInGame(() => walker.enter());
  }
  checkWell();
  return walker;
}

/** A text of the texts catalog that the server names by its number (DEFINEDTEXT). */
interface NumberedText {
  textId: number;
  text: string;
}

/** The two texts the fight fails on, by the numbers DEFINEDTEXT carries (the catalog's `textId`). */
interface FightTexts {
  attackSpeed: NumberedText;
  priorityMob: NumberedText;
}

function fightTexts(): FightTexts {
  const numbered = (id: string): NumberedText => {
    const entry = gameData!.texts.get(id);
    if (entry?.textId === undefined) {
      throw new Error(`the texts catalog has no number for ${id}: the converted game files in ${ASSETS_DIR} are older than the texts' numbers (npm run convert)`);
    }
    return { textId: entry.textId, text: entry.text };
  };
  return { attackSpeed: numbered('TID_GAME_MODIFY_ATTACK_SPEED'), priorityMob: numbered('TID_GAME_PRIORITYMOB') };
}

/** The D3D x, z distance between two points. */
const apart = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * Walks `player` to each point of `route` in turn as a tap on the land there does (`Player.tap`: `SetDestPos`,
 * `m_nCorr` -1 and the client SNAPSHOT with DESTPOS, `OwnMover`), the next once it stands; fails where a walk ended
 * short: where it met something or began to fall (it ends there, with a PLAYERCORR), or more than 1 m from its point.
 * `progress.reached` counts the points reached.
 */
async function walkRoute(
  player: Player, route: readonly (readonly [number, number])[], what: string, progress = { reached: 0 },
): Promise<void> {
  const own = player.world?.self();
  if (own === undefined) throw new Error(`the ${player.role}'s own character is not among its movers in view: ${player.inView()}`);
  const terrain = terrainOf(player.entered!.worldId);
  for (const [x, z] of route) {
    const point: Vec3 = [x, terrain.heightAt(x, z) ?? own.act.body.pos[1], z];
    const corrBefore = player.sentCorr.length;
    const destsBefore = player.sentDestPos.length;
    player.tap = point;
    await waitUntil(
      `the walk ${what} to (${x}, ${z})`,
      (apart(own.act.body.pos, point) / WALK_M_PER_S) * 1000 + LEG_SPARE_MS,
      () => player.sentDestPos.length > destsBefore && stands(own),
      () => `The walker is ${stateText(own)}, ${apart(own.act.body.pos, point).toFixed(2)} m from the point.`,
    );
    const met = player.sentCorr.length - corrBefore;
    const off = apart(own.act.body.pos, point);
    if (met > 0 || off > WITHIN_M) {
      throw new Error(
        `the walk ${what} to (${x}, ${z}) ended ${off.toFixed(2)} m from it, the walker ${stateText(own)}${met > 0 ? ', where it met something or began to fall (PLAYERCORR)' : ''}. `
        + `The way to the Aibatts begins where new characters start, beside Flaris's lodestar (${TO_THE_AIBATTS[0]!.join(', ')}): a character that stands elsewhere may find something in its way there. `
        + 'Use an account with no character (the test makes one), or bring the character there.',
      );
    }
    progress.reached++;
  }
}

/**
 * The Small Aibatt in `player`'s view nearest it (D3D x and z) that the attack takes (`attackAble`: alive, killable, not
 * peaceful, on the ground), other than those in `skip`; waits for one to come into view. Only `MI_AIBATT1`: never a
 * giant (Ruling R30).
 */
async function nearestSmallAibatt(player: Player, skip: ReadonlySet<number>): Promise<Mover> {
  const own = player.world!.self()!;
  const nearest = (): Mover | undefined => {
    let found: Mover | undefined;
    let best = Infinity;
    for (const mover of player.world!.movers.values()) {
      if (mover.kind !== 'monster' || mover.added.index !== MI_AIBATT1 || skip.has(mover.objectId)) continue;
      if (!attackAble(mover, gameData!.movers)) continue;
      const distance = apart(mover.act.body.pos, own.act.body.pos);
      if (distance < best) {
        best = distance;
        found = mover;
      }
    }
    return found;
  };
  const picked: { mover?: Mover } = {};
  await waitUntil(
    'a Small Aibatt in view',
    AIBATT_WAIT_MS,
    () => (picked.mover = nearest()) !== undefined,
    () => `${player.inView()}. Small Aibatts (MI_AIBATT1) live on the field north of Flaris's north gate, around (${TO_THE_AIBATTS.at(-1)!.join(', ')}); one that dies comes back within 30 s.`,
  );
  return picked.mover!;
}

/** Where the counts of a fight start: the lengths of the player's lists as the attack began. */
interface FightMarks {
  swings: number;
  seen: number;
  corr: number;
  destObj: number;
}

/** How the fight with `target` stands, for a failure message. */
function fightText(player: Player, target: Mover, from: FightMarks): string {
  const self = player.world?.self();
  const swings = player.sentSwings.length - from.swings;
  const hits = player.combatSeen.slice(from.seen).filter(({ event }) => (
    event.kind === 'hit' && event.victimId === target.objectId && event.attackerId === self?.objectId
  )).length;
  const stats = player.session?.stats;
  const where = self === undefined ? 'not in view' : `${stateText(self)}, ${apart(self.act.body.pos, target.act.body.pos).toFixed(2)} m from it with ${self.hp} HP`;
  return `Since the attack began: ${player.sentDestObj.length - from.destObj} PLAYERSETDESTOBJ, ${swings} MELEE_ATTACK, ${hits} DAMAGE from the walker on it, `
    + `${player.sentCorr.length - from.corr} PLAYERCORR (the walk up to it met something). The walker is ${where}; the Small Aibatt is `
    + `${stateText(target)} with ${target.hp} HP. ${stats?.mismatched ?? 0} messages misread so far.`
    + (player.viewProblems.size === 0 ? '' : ` The views could not load: ${[...player.viewProblems].join('; ')}.`);
}

/**
 * Attacks `target` as a player on a touch screen does: a tap on it (the focus, SETTARGET), then the attack button (the
 * auto-attack), and from there the attack loop walks up to it and swings, every rules step, until it dies. Ends
 * `'killed'` at its MOVERDEATH by the walker, and `'priorityMob'` at a TID_GAME_PRIORITYMOB (another player fights it:
 * `CMover::IsSteal`, `_Common/Mover.cpp:7010-7052`). Fails at a TID_GAME_MODIFY_ATTACK_SPEED (`CDPSrvr::OnMeleeAttack`,
 * `WORLDSERVER/DPSrvr.cpp:2040-2045`: the MELEE_ATTACK's speed is not the held item's `fAttackSpeed`); at a swing whose
 * DAMAGE does not come within 3 s (every swing the server takes has one, a miss's too, the killing one the MOVERDEATH);
 * and when the Aibatt has not died within 60 s, is killed by another, leaves the view alive, or the walker dies.
 */
async function fight(player: Player, target: Mover, texts: FightTexts): Promise<'killed' | 'priorityMob'> {
  const self = player.world!.self()!;
  const from: FightMarks = {
    swings: player.sentSwings.length, seen: player.combatSeen.length, corr: player.sentCorr.length, destObj: player.sentDestObj.length,
  };
  const state = (): string => fightText(player, target, from);
  player.pressMover(target.objectId);
  // the attack button is enabled while the focus is a mover the attack takes (`WorldScreen.drawHud`)
  if (player.focusId !== target.objectId || !player.canAttackFocus) {
    throw new Error(`the tap on the Small Aibatt ${target.objectId} did not make it a target the attack takes (the focus is ${player.focusId}). ${state()}`);
  }
  player.pressAttack();
  const deadline = performance.now() + FIGHT_MS;
  for (;;) {
    checkWell();
    const seen = player.combatSeen.slice(from.seen);
    for (const { event } of seen) {
      if (event.kind === 'text' && event.textId === texts.attackSpeed.textId) {
        throw new Error(`the world server refused a MELEE_ATTACK with TID_GAME_MODIFY_ATTACK_SPEED ("${texts.attackSpeed.text}"): the speed it carries (${player.own?.attackSpeed()}) is not the held item's fAttackSpeed to the server. ${state()}`);
      }
      if (event.kind === 'text' && event.textId === texts.priorityMob.textId) return 'priorityMob';
      if (event.kind === 'death' && event.victimId === target.objectId) {
        if (event.attackerId !== self.objectId) throw new Error(`the Small Aibatt ${target.objectId} was killed by ${event.attackerId}, not by the walker. ${state()}`);
        return 'killed';
      }
    }
    if (isDie(self)) throw new Error(`the walker died in the fight. ${state()}`);
    // the swings at it in order, and the DAMAGEs from the walker on it: the next one owed is that of the first swing not answered yet
    const swings = player.sentSwings.slice(from.swings).filter((swing) => swing.targetId === target.objectId);
    const answered = seen.filter(({ event }) => event.kind === 'hit' && event.victimId === target.objectId && event.attackerId === self.objectId).length;
    const owed = swings[answered];
    if (owed !== undefined && performance.now() - owed.at > DAMAGE_WAIT_MS) {
      throw new Error(`swing ${answered + 1} at the Small Aibatt (its MELEE_ATTACK) got no DAMAGE within ${DAMAGE_WAIT_MS / 1000} s. ${state()}`);
    }
    if (!player.world!.movers.has(target.objectId)) throw new Error(`the Small Aibatt ${target.objectId} left the walker's view alive. ${state()}`);
    if (performance.now() > deadline) throw new Error(`the Small Aibatt ${target.objectId} did not die within ${FIGHT_MS / 1000} s. ${state()}`);
    await sleep(20);
  }
}

/**
 * Kills the Small Aibatt nearest the walker (`fight`); after a TID_GAME_PRIORITYMOB, Escape (as a player gives a target
 * up) and once more with the nearest other one.
 */
async function killSmallAibatt(player: Player, texts: FightTexts): Promise<void> {
  const tried = new Set<number>();
  for (;;) {
    const target = await nearestSmallAibatt(player, tried);
    tried.add(target.objectId);
    if (await fight(player, target, texts) === 'killed') return;
    if (tried.size >= 2) {
      throw new Error(`a second Small Aibatt (${target.objectId}) was refused with TID_GAME_PRIORITYMOB ("${texts.priorityMob.text}") too: another player fights the Aibatts here.`);
    }
    player.giveUpTarget();
  }
}

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

  it('the walker reads its inventory, walks out of Flaris and kills a Small Aibatt in a fight', async () => {
    const runner = await walkerInWorld();
    const own = runner.own;
    const self = runner.world?.self();
    if (own === undefined || self === undefined) throw new Error(`the walker's JOIN bundle had no own ADD_OBJ to read its numbers from: ${runner.inView()}`);
    expect(runner.entered?.worldId, `the walker ${runner.name} is in world ${runner.entered?.worldId}, not Madrigal (Flaris)`).toBe(MADRIGAL);

    // the own ADD_OBJ's inventory was read: the starter food is in it, with counts
    expect(own.inventoryError, "the walker's inventory could not be read from its ADD_OBJ").toBeNull();
    const items = [...(own.inventory?.values() ?? [])];
    const listed = items.map((item) => `${item.itemId} x${item.count}`).join(', ');
    for (const itemId of STARTER_FOOD) {
      const count = items.filter((item) => item.itemId === itemId).reduce((sum, item) => sum + item.count, 0);
      expect(count, `the walker's inventory holds no item ${itemId} (a new character has 3 of 2800 and 1 of 2801): ${items.length} items, ${listed}. Use a new character, or one that still carries its starter food.`).toBeGreaterThan(0);
    }

    const texts = fightTexts();
    // from here on the walker's steps meet the placed objects around it, as on the world screen
    runner.objects = await placedObjects(assets!, worldOf(MADRIGAL).manifest, self.act.body.pos[0], self.act.body.pos[2]);
    let failure: unknown;
    const out = { reached: 0 };
    try {
      await walkRoute(runner, TO_THE_AIBATTS, 'out of Flaris', out);
      const before = { exp: own.exp, level: own.level };
      await killSmallAibatt(runner, texts);
      await waitUntil(
        'the EXP rising after the kill',
        EXP_WAIT_MS,
        () => own.level > before.level || own.exp > before.exp,
        () => `The walker has ${own.exp} EXP at level ${own.level}, as before the fight (${before.exp} at level ${before.level}): no SETEXPERIENCE came, or it gave nothing (a character of a high level gets little or nothing for a level 1 monster, and a Vagrant at level 15 none).`,
      );
      const stats = runner.session!.stats;
      expect(stats.mismatched, `a reader of the walker did not end where the table says (${stats.bundles} bundles, ${stats.indexed} with a table, ${stats.mismatched} mismatched, ${stats.unknownPackets} unknown packets)`).toBe(0);
    } catch (error) {
      failure = error;
    }
    // a character the test did not make goes back the way it came, as far as it got, for the next run's first test (one
    // the test made is deleted at the end)
    if (runner.created === undefined && runner.playing && !isDie(self) && out.reached > 0) {
      try {
        runner.giveUpTarget();
        await walkRoute(runner, TO_THE_AIBATTS.slice(0, out.reached).reverse(), 'back into Flaris');
      } catch (error) {
        failure ??= error;
      }
    }
    runner.objects = undefined;
    if (failure !== undefined) throw failure;
  }, 600000);
});
