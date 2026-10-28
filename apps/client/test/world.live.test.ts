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
// The last test is a fight (Piece 4; its way and steps are helpers/liveFight.ts's): the walker checks that its own
// ADD_OBJ's inventory was read (the starter food: exactly a new character's in one the test made), walks out of Flaris
// through the north gate to the Small Aibatts (`MI_AIBATT1`; never a giant, Ruling R30), taps the nearest and presses
// the attack button, and the world screen's attack (`Focus`, `AttackLoop`, the own numbers' `OwnState`, wired as
// `WorldScreen` wires them) attacks it until it dies. It fails on the server's `TID_GAME_MODIFY_ATTACK_SPEED` (and on a
// second `TID_GAME_PRIORITYMOB`: after the first it tries another Aibatt once), on a swing with no DAMAGE within 3 s, on
// EXP that does not rise after the kill, and on any bundle without its table or misread. For it the walker's steps
// also meet the placed objects, as on the screen: their collision shapes, read from the disk as the stage reads them
// (`placedObjects`, its tiles around the walker as the test starts). Every player has the world screen's views of the
// movers, without a screen (`headlessViews`): their models' frames end the swings and land their blows (without them a
// swing would end at once, and the next would follow it a step later), and their boxes give the radii of `IsRangeObj`
// (`WorldScreen.measureRadii`). Afterwards a character the test did not make walks back to where new characters start,
// beside the lodestar, if it is alive and still in the world; a dead one is revived there (REVIVAL_TO_LODESTAR, as the
// revive window does). A character an earlier run left on the way walks back first. Where the test leaves a living
// character outside the town, its error says where, and to walk it back through the north gate in the browser before
// the next run. Run alone (`npm run test:live:world -- -t fight`), the test enters the walker itself.
//
// After it comes the skill part (milestone 2; run alone: `-t skill`), with the same character: it spends one skill point
// on Clean Hit as the skill window's + and Finish do (`SkillPlan`, DOUSESKILLPOINT, which the server must answer with
// DOUSESKILLPOINT), puts Clean Hit on the first bar's F4 as a drop there does (`TaskBarEdits`, ADDITEMTASKBAR), walks out
// to the Small Aibatts again, taps the nearest and presses F4: the world screen's skill use (`SkillUse`, wired with the
// attack as `WorldScreen` wires it) walks up to it and sends USESKILL, and the server must answer with USESKILL and the
// skill's DAMAGE (`AF_MELEESKILL`); the auto-attack the skill turns on then finishes the Aibatt, and the character walks
// back as after the fight. Clean Hit opens at level 3, so the part is skipped, with one sentence that says why, for a
// character below level 3, without a skill point left, or with Clean Hit at its top level. The fight needs a character
// of level 1 to 3 (from level 4 on a Small Aibatt gives no EXP: `CMover::AddExperienceSolo`, `_Common/Mover.cpp:6198-6216`,
// its 2 EXP times 0.4 or 0.1 cut to 0 by the `static_cast<EXPINTEGER>` at :6245), so the one character that runs both is a
// Vagrant of level 3 with its skill points unspent (the comment in live.config.example.json says how to get one).
//
// The servers' accept limiter (helpers/connectGap.ts explains it): every connection below waits until 300 ms after the
// one before, the lobby's and the world's alike; keep it that way, and do not loop the test.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorldManifest } from '@flyffweb/formats';
import { CloseCode, MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, ShortcutKind } from '@flyffweb/protocol';
import type {
  AddedMover, BundleMessage, CharacterSummary, MoveReport, Shortcut, SkillSlot, Vec3, WorldMessage,
} from '@flyffweb/protocol';
import type { CollisionShapes, MoveIntent } from '@flyffweb/scene';
import type { Gateway } from '@flyffweb/gateway/src/server';
import { closeText } from '../src/lobby/errorText';
import { TIMEOUT_TEXT } from '../src/lobby/LoginFlow';
import type { WorldEntry } from '../src/lobby/LoginFlow';
import { AttackLoop, objRadius } from '../src/world/combat/attackLoop';
import type { AttackLoopSession } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import { movesOrTurns } from '../src/world/controls';
import { loadGameData } from '../src/world/gameData';
import type { GameData } from '../src/world/gameData';
import { EMPTY, TaskBarEdits } from '../src/world/hud/taskBarEdits';
import type { LoadedBars } from '../src/world/hud/taskBarEdits';
import { OwnState } from '../src/world/OwnState';
import type { MoverViews } from '../src/world/render/MoverViews';
import type { Ground } from '../src/world/sim/collision';
import { ObjSta } from '../src/world/sim/constants';
import { OwnMover } from '../src/world/ownMover';
import type { OwnMoverSession } from '../src/world/ownMover';
import { FixedStepper } from '../src/world/sim/stepper';
import { SkillUse } from '../src/world/skills/skillUse';
import type { SkillUseSession } from '../src/world/skills/skillUse';
import { JOIN_CLOSED_TEXT, WorldSession } from '../src/world/WorldSession';
import type { WorldEvent } from '../src/world/WorldSession';
import { WorldState, isDie, isLive } from '../src/world/WorldState';
import type { CombatEvent, Mover } from '../src/world/WorldState';
import { checkReachable } from './helpers/connectGap';
import { ASSETS_DIR, DiskAssets, Terrain, placedObjects } from './helpers/diskAssets';
import { headlessViews } from './helpers/headlessViews';
import {
  SKILL_BAR, SKILL_SLOT, SPEND_WAIT_MS, TO_THE_AIBATTS, attackSpeedRefusals, cleanHitSpend, fightTexts, foodProblem,
  killSmallAibatt, leftOutsideNote, numberedText, pollUntil, resumeRoute, reviveIfDead, skillOnSmallAibatt, stands,
  stateText, walkRoute, withNote,
} from './helpers/liveFight';
import type { FightContext, SkillPlayer } from './helpers/liveFight';
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

// ---- The fight (its way, its numbers and its steps are helpers/liveFight.ts's) -----------------------------------

/** The kill's SETEXPERIENCE comes with the MOVERDEATH (`OnDied`, `SubExperience`, `AttackArbiter.cpp:792`); this is only the safety net. */
const EXP_WAIT_MS = 10000;
/** REVIVAL_TO_LODESTAR is answered with the revival and the position at the lodestar; this is only the safety net. */
const REVIVE_WAIT_MS = 10000;
/**
 * The fight's own waits add up to under 10 minutes (the way out and back at a walk, two Aibatts' waits and fights);
 * the test gets more, so that one of them, which says what it waited for, ends it rather than vitest's timeout.
 */
const FIGHT_TEST_MS = 900000;
/** The skill part's waits are the fight's, and the spend's few seconds more. */
const SKILL_TEST_MS = 900000;
/** The skill messages the skill part reads (`Player.skillSeen`). */
const SKILL_MESSAGES: ReadonlySet<WorldMessage['type']> = new Set(['useSkill', 'clearUseSkill', 'doUseSkillPoint', 'endSkillQueue']);
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
 * its attack with the world screen's `AttackLoop` (a tap on a mover, `pressMover`; the attack button, `pressAttack`;
 * Escape, `giveUpTarget`) and its skills with the world screen's `SkillUse` (a slot of the bar, `pressShortcut`; the
 * skill window's Finish, `spendSkillPoints`; a skill dropped on the bar, `placeSkillOnBar`). It keeps its own
 * `WorldState`, the movers in view of its session, which the other player's moves reach through the server, and the own
 * character's numbers (`OwnState`) that the messages about it change.
 */
class Player implements SkillPlayer {
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
  /**
   * What the skill use and the bar sent since the player entered: the USESKILLs with when, the DOUSESKILLPOINTs' slots,
   * and the ADDITEMTASKBARs.
   */
  readonly sentUseSkill: { at: number; index: number; targetId: number; useType: number }[] = [];
  readonly sentSkillPoints: SkillSlot[][] = [];
  readonly sentAddItemTaskBar: { bar: number; slot: number; shortcut: Shortcut }[] = [];
  /** The skill messages since the player entered (USESKILL, CLEAR_USESKILL, DOUSESKILLPOINT, ENDSKILLQUEUE), with when and about whom. */
  readonly skillSeen: { at: number; objectId: number; message: WorldMessage }[] = [];
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
  /** The focus, the auto-attack and the skill use, as the world screen's, for the session the player is in. */
  private focus: Focus | undefined;
  private attack: AttackLoop | undefined;
  private skillUse: SkillUse | undefined;
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

  /** A press on a slot of the bar that holds `shortcut`, or its F-key (the world screen's `useSlot`: `SkillUse.useShortcut`). */
  pressShortcut(shortcut: Shortcut): void {
    this.skillUse?.useShortcut(shortcut);
  }

  /**
   * The skill window's Finish and its box's Yes with `skills`, the 45 slots of the plan (`SkillUse.spendSkillPoints`:
   * DOUSESKILLPOINT); false where it did not go (one waits for its answer, or the player is not in).
   */
  spendSkillPoints(skills: readonly SkillSlot[]): boolean {
    return this.skillUse?.spendSkillPoints(skills) === true;
  }

  /**
   * The skill of slot `skillIndex` carried from the skill window to slot `slot` of the first bar, the bar shown, and let go
   * there (`TaskBarEdits.dropOn`, `CWndTaskBar::OnDropIcon`: the bar's rules, then `SetShortcut`'s ADDITEMTASKBAR); the
   * shortcut the slot then holds, or null where the rules turned the skill away. The bars start empty, as the world screen's
   * do before a TASKBAR: a drop takes its slot whatever the server's bar had there, as Neuz's does. Nothing here draws the
   * bars, so the edit is not put back in `OwnState.taskBar`.
   */
  placeSkillOnBar(skillIndex: number, slot: number): Shortcut | null {
    const session = this.session;
    if (session === undefined || gameData === undefined) return null;
    const bars: LoadedBars = {
      applets: Array.from({ length: MAX_SLOT_APPLET }, () => EMPTY),
      items: Array.from({ length: MAX_SLOT_ITEM_COUNT }, () => Array.from({ length: MAX_SLOT_ITEM }, () => EMPTY)),
      queue: Array.from({ length: MAX_SLOT_QUEUE }, () => EMPTY),
      queueCount: 0,
      itemIds: new Map(),
    };
    const data = { itemProps: gameData.itemProps, skills: gameData.skills, texts: gameData.texts };
    const edits = new TaskBarEdits({ bars, own: this.own, data, bar: SKILL_BAR, commit: () => {} }, {
      sendAddItemTaskBar: (bar, at, shortcut) => {
        session.sendAddItemTaskBar(bar, at, shortcut);
        this.sentAddItemTaskBar.push({ bar, slot: at, shortcut });
      },
      sendRemoveItemTaskBar: (bar, at) => session.sendRemoveItemTaskBar(bar, at),
      sendSkillTaskBar: (queue) => session.sendSkillTaskBar(queue),
      queueRunning: () => (this.skillUse?.execute ?? 0) !== 0,
      say: () => {},
    });
    edits.dropOn({ from: 'skills', skillIndex }, { row: 'item', slot });
    const placed = bars.items[SKILL_BAR]![slot]!;
    return placed.kind === ShortcutKind.SKILL ? placed : null;
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
   * the next here: a press on a mover is a tap, `pressMover`); a move of the keys stopping the auto-attack, then the skill
   * use's step (the bar's presses, and a reserved skill's branch of `CWndWorld::Process`) and the attack loop's branch,
   * and where that is `ControlPlayer`, a tap, then the keys, to the own mover (`OwnMover.control`), its moves sent; then
   * every mover's step, the PLAYERCORR it may owe, what the step played (`take`, the world screen's `syncViews`), and the
   * views' step (the models' frames).
   */
  step(): void {
    const { world, ownMover, attack, skillUse, views } = this;
    if (!this.playing || world === undefined || ownMover === undefined || attack === undefined || skillUse === undefined || views === undefined) return;
    const own = world.self();
    const tap = this.tap;
    this.tap = null;
    attack.onReleased();
    if (own !== undefined) {
      if (movesOrTurns(this.intent)) attack.stop('move');
      const skillBranch = skillUse.step(own, (objectId) => world.movers.get(objectId));
      if (attack.step(skillBranch)) ownMover.control(own, this.intent, tap);
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
   * driving; the bundle; then the focus, the skill use and the attack (`WorldScreen.showWorld`).
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
    for (const sent of [
      this.sentDestPos, this.sentCorr, this.sentDestObj, this.sentSwings, this.combatSeen, this.sentUseSkill,
      this.sentSkillPoints, this.sentAddItemTaskBar, this.skillSeen,
    ]) {
      sent.length = 0;
    }
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
    this.startAttack(session, entry, this.world, ground);
    this.playing = true;
  }

  /**
   * The focus, the skill use and the auto-attack as the world screen makes them (`WorldScreen.showWorld`): the focus tells
   * the server of its changes (SETTARGET) and asks `IsLive` of a mover in view (`WorldScreen.isLive`); the skill use and the
   * attack share the own mover's one command and the reserved skill, and the world tells the skill use of a USESKILL's
   * outcome (`onUseSkill`); both read the own numbers and the movers in view (the skill use the ground too, for its line of
   * sight), and send through the session, their approaches, swings, USESKILLs and spends counted on the way.
   */
  private startAttack(session: WorldSession, entry: WorldEntry, world: WorldState, ground: Ground): void {
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
    // each counted once it went: the encoders throw at a value the server would drop (SkillUse says it and goes on)
    const skillSends: SkillUseSession = {
      sendUseSkill: (index, targetId, useType, control) => {
        session.sendUseSkill(index, targetId, useType, control);
        this.sentUseSkill.push({ at: performance.now(), index, targetId, useType });
      },
      sendDoUseSkillPoint: (skills) => {
        session.sendDoUseSkillPoint(skills);
        this.sentSkillPoints.push(skills.map((slot) => ({ ...slot })));
      },
      sendEndSkillQueue: () => session.sendEndSkillQueue(),
      sendDestObj: (targetId, range) => sends.sendDestObj(targetId, range),
      sendBehavior: (move) => session.sendBehavior(move),
    };
    const skillUse = new SkillUse(skillSends, focus, () => this.own, () => performance.now(), gameData!, {
      tick: () => entry.clock.tick(), ground: () => ground,
    });
    const attack = new AttackLoop(sends, focus, world, () => this.own, entry.clock, gameData!.movers, skillUse);
    skillUse.attack = attack;
    world.onUseSkill = (casterId, message, started) => skillUse.onUseSkill(casterId, message, started);
    this.focus = focus;
    this.skillUse = skillUse;
    this.attack = attack;
  }

  /**
   * A bundle's messages to the movers in view, in order (`WorldScreen.apply`); `joining` for the JOIN's. QUERYGETDESTOBJ
   * is the attack loop's, and so are a death and a DEL_OBJ of a mover in view, told before the world applies them
   * (`AttackLoop.onMoverDeath`, `onRemoved`). The skill use takes its answers after the world (`SkillUse.onMessage`), and
   * the skill messages are kept for the skill part (`skillSeen`). Then what they played (`take`).
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
      this.skillUse?.onMessage(objectId, value, world.self());
      if (SKILL_MESSAGES.has(value.type)) this.skillSeen.push({ at: performance.now(), objectId, message: value });
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
function waitUntil(what: string, timeoutMs: number, done: () => boolean, why: () => string): Promise<void> {
  return pollUntil(checkWell, what, timeoutMs, done, why);
}

/** Both players, who must be in the world: the tests after the first need what it did. */
function bothInWorld(): [Player, Player] {
  checkWell();
  for (const player of [walker, observer]) {
    if (!player.playing) throw new Error(`the ${player.role} is not in the world: the first test did not get both players in`);
  }
  return [walker, observer];
}

// ---- The fight's and the skill part's helpers (the rest are helpers/liveFight.ts's) -----------------------------

/** The walker, in the world: the first tests put it there; run alone (`-t fight`, `-t skill`), this enters it and starts the steps. */
async function walkerInWorld(): Promise<Player> {
  if (!walker.playing) {
    loop.start();
    await retryWhileStillInGame(() => walker.enter());
  }
  checkWell();
  return walker;
}

/** What the fight's helpers need of the test besides the player. */
function fightContext(player: Player): FightContext {
  const terrain = terrainOf(player.entered!.worldId);
  return { data: gameData!, heightAt: (x, z) => terrain.heightAt(x, z), check: checkWell };
}

/**
 * Set while the fight or the skill part may have the walker's character outside the town and has not said so itself:
 * the test may still end on vitest's timeout, or the run stop; `afterAll` then says where it was left (`leftOutsideNote`).
 */
let walkerMayBeOutside = false;

/**
 * The walker's way out of the town and back, around `leg`: from here on its steps meet the placed objects around it, as
 * on the world screen; a character an earlier run left on the way, or by the Aibatts, first goes back to where the way
 * begins; then the way out to the Small Aibatts, and `leg`. Whatever came of that, a dead walker revives at the lodestar,
 * as the revive window's button has it (were the revival lost, logging out revives it at the nearest lodestar:
 * `leftOutsideNote`), and a living character the test did not make goes back into the town, for the next run's first test
 * (one the test made is deleted at the end). Throws the leg's failure with the note of where the character was left when
 * it is still outside, or that note alone.
 */
async function outOfTown(runner: Player, self: Mover, leg: (ctx: FightContext) => Promise<void>): Promise<void> {
  const ctx = fightContext(runner);
  runner.objects = await placedObjects(assets!, worldOf(MADRIGAL).manifest, self.act.body.pos[0], self.act.body.pos[2]);
  walkerMayBeOutside = true;
  let failure: unknown;
  try {
    await walkRoute(ctx, runner, resumeRoute(self.act.body.pos), 'back into Flaris from where an earlier run left it');
    await walkRoute(ctx, runner, TO_THE_AIBATTS, 'out of Flaris');
    await leg(ctx);
  } catch (error) {
    failure = error;
  }
  if (reviveIfDead(runner)) {
    await waitUntil('the revival at the lodestar', REVIVE_WAIT_MS, () => !isDie(self), () => `The walker is ${stateText(self)}.`)
      .catch(() => {});
  }
  let walkBack: unknown;
  if (runner.created === undefined && runner.playing && !isDie(self)) {
    try {
      runner.giveUpTarget();
      await walkRoute(ctx, runner, resumeRoute(self.act.body.pos), 'back into Flaris');
    } catch (error) {
      walkBack = error;
    }
  }
  runner.objects = undefined;
  walkerMayBeOutside = false;
  let note = leftOutsideNote(runner.created !== undefined, self);
  if (note !== null && walkBack !== undefined) note += ` (The walk back failed: ${(walkBack as Error).message})`;
  if (failure !== undefined) throw withNote(failure, note);
  if (note !== null) throw new Error(note);
}

/**
 * Every bundle of the sessions in the world now had its table of contents, and no reader mismatched: the walker's, and the
 * observer's while it is in (after the re-entry test its second session; run alone, the walker is the only one in).
 */
function expectEveryBundleRead(): void {
  for (const player of [walker, observer]) {
    const stats = player.session?.stats;
    if (!player.playing || stats === undefined) continue;
    const counts = `(${stats.bundles} bundles, ${stats.indexed} with a table, ${stats.mismatched} mismatched, ${stats.unknownPackets} unknown packets)`;
    expect(stats.indexed, `the ${player.role}'s bundles without a table of contents: is the rebuilt WorldServer running? ${counts}`).toBe(stats.bundles);
    expect(stats.mismatched, `a reader of the ${player.role} did not end where the table says ${counts}`).toBe(0);
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
    // the fight or the skill part stopped before it could say so itself (vitest's timeout): where it left the walker's
    // character, as seen last
    const note = walkerMayBeOutside ? leftOutsideNote(walker.created !== undefined, walker.world?.self()) : null;
    if (note !== null) problems.push(note);
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

    // the own ADD_OBJ's inventory was read: the starter food is in it, exactly a new character's in one the test made
    expect(foodProblem(own, runner.created !== undefined)).toBeNull();

    const texts = fightTexts(gameData!);
    const seenFrom = runner.combatSeen.length;
    await outOfTown(runner, self, async (ctx) => {
      const before = { exp: own.exp, level: own.level };
      await killSmallAibatt(ctx, runner, texts);
      await waitUntil(
        'the EXP rising after the kill',
        EXP_WAIT_MS,
        () => own.level > before.level || own.exp > before.exp,
        () => `The walker has ${own.exp} EXP at level ${own.level}, as before the fight (${before.exp} at level ${before.level}): no SETEXPERIENCE came, or it gave nothing (from level 4 on a Small Aibatt gives no EXP: use a character of level 1 to 3).`,
      );
      // a refusal of the attack speed that came after the kill counts too
      const refusals = attackSpeedRefusals(runner.combatSeen.slice(seenFrom), texts.attackSpeed.textId);
      expect(refusals, `the world server refused ${refusals} MELEE_ATTACK with TID_GAME_MODIFY_ATTACK_SPEED ("${texts.attackSpeed.text}")`).toBe(0);
      expectEveryBundleRead();
    });
  }, FIGHT_TEST_MS);

  it('the skill part: the walker spends a skill point on Clean Hit, puts it on F4 and uses it on a Small Aibatt', async (context) => {
    const runner = await walkerInWorld();
    const own = runner.own;
    const self = runner.world?.self();
    if (own === undefined || self === undefined) throw new Error(`the walker's JOIN bundle had no own ADD_OBJ to read its numbers from: ${runner.inView()}`);
    expect(runner.entered?.worldId, `the walker ${runner.name} is in world ${runner.entered?.worldId}, not Madrigal (Flaris)`).toBe(MADRIGAL);
    // Clean Hit opens at level 3 and needs a point to raise: a character that cannot is skipped, with one sentence (also in
    // the console, as a reporter that lists no skipped tests, vitest's default, shows only that)
    const spend = cleanHitSpend(own, gameData!.skills, runner.name);
    if ('skip' in spend) {
      console.warn(`Live world test, the skill part: ${spend.skip}`);
      context.skip(spend.skip);
      return;
    }

    // 1. A point on Clean Hit: the skill window's + and Finish, and its box's Yes (DOUSESKILLPOINT), which the server
    // answers with DOUSESKILLPOINT (the slots, then the points left), or refuses with TID_RESKILLPOINT_ERROR
    const refusal = numberedText(gameData!, 'TID_RESKILLPOINT_ERROR');
    const before = { level: own.skills[spend.index]!.level, points: own.skillPoint };
    const seenFrom = runner.skillSeen.length;
    const textsFrom = runner.combatSeen.length;
    const refused = (): boolean =>
      runner.combatSeen.slice(textsFrom).some(({ event }) => event.kind === 'text' && event.textId === refusal.textId);
    const answered = (): boolean => runner.skillSeen.slice(seenFrom).some(({ message }) => message.type === 'doUseSkillPoint');
    expect(runner.spendSkillPoints(spend.skills), 'the skill use sent the DOUSESKILLPOINT').toBe(true);
    await waitUntil(
      'the answer to the skill point (DOUSESKILLPOINT)',
      SPEND_WAIT_MS,
      () => answered() || refused(),
      () => `The walker sent ${runner.sentSkillPoints.length} DOUSESKILLPOINT (Clean Hit from level ${before.level} to ${before.level + 1}, with ${before.points} points) and the world server said nothing, which it does for a spend that changes no level.`,
    );
    if (refused()) {
      throw new Error(`the world server refused the skill point with TID_RESKILLPOINT_ERROR ("${refusal.text}"): its copy of the character's skills or points is not the one the walker read (Clean Hit at ${before.level}, ${before.points} points), or a level costs more on it.`);
    }
    expect(own.skills[spend.index]!.level, 'Clean Hit after the DOUSESKILLPOINT').toBe(before.level + 1);
    expect(own.skillPoint, 'the skill points after the DOUSESKILLPOINT (a level of a Vagrant skill costs 1)').toBe(before.points - 1);

    // 2. Clean Hit on the first bar's F4, as a drop from the skill window does it (ADDITEMTASKBAR, which has no answer)
    const placedFrom = runner.sentAddItemTaskBar.length;
    const shortcut = runner.placeSkillOnBar(spend.index, SKILL_SLOT);
    if (shortcut === null) throw new Error(`the bar turned Clean Hit (level ${own.skills[spend.index]!.level}) away from F4`);
    expect(runner.sentAddItemTaskBar.slice(placedFrom)).toEqual([{ bar: SKILL_BAR, slot: SKILL_SLOT, shortcut }]);

    // 3. and 4. Out to the Small Aibatts: Clean Hit (F4) on the nearest, which the server begins (USESKILL) and lands (a
    // DAMAGE with AF_MELEESKILL), then the auto-attack it turned on finishes the Aibatt; and back into the town
    const texts = fightTexts(gameData!);
    await outOfTown(runner, self, async (ctx) => {
      await skillOnSmallAibatt(ctx, runner, texts, shortcut);
      expectEveryBundleRead();
    });
  }, SKILL_TEST_MS);
});
