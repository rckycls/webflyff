import { SpeechBubbleLayer } from './render/SpeechBubbleLayer';
// The world screen (spec §3.2, §3.5): "Entering the world…" with a Leave button while the session enters, then the world in
// 3D with its movers and their name tags, the joystick and the measurement overlay. It wires the parts together:
// the session's bundles go into `WorldState` as they come; once the world is on screen the frame loop runs the rules'
// 60 steps a second, the keys, the joystick and a tap on the world (spec §3.7) driving the own mover as
// `CWndWorld::ControlGround` does and its moves sent as Neuz sends them, the presses on a mover selecting and
// attacking it (`AttackLoop`, Piece 4 §3.4), and the task bar's skills and action slot used (`SkillUse`, §3.11); and it
// draws the stage around the own mover, from the chase camera behind
// it, with the mark of the point a tap sends it to, the effects and damage numbers of the fight, and the corners around
// the target (Piece 4 §3.7), and over it Neuz's windows: the status window, the target bar, the server messages and the
// caption (`Hud`, Piece 4 §3.9), the task bar with its Start menu, whose Log out asks first (`LogOutBox`) and then leaves
// as the loading screen's Leave does (`TaskBar`), the attack button of a touch screen (`AttackButton`), the revive window
// of the dead player (`ReviveWindow`, Piece 4 §3.5), the Character window, where the stat points are placed
// (`CharacterWindow`, §3.6), and the skill tree window, where the skill points are (`SkillWindow`, §3.11), and Escape in
// Neuz's order (`escapeStep`). Every ending closes everything and hands the lobby its message (Ruling 8): nothing that goes
// wrong here is thrown at the lobby.

import { UI_SHEETS_KEY, toWebPosition } from '@flyffweb/formats';
import type { Vec3, WebEffect, WebUiSheet, WebUiSheets, WebWorldMap } from '@flyffweb/formats';
import type { AddedMover, BundleMessage, NpcAction, WorldMessage } from '@flyffweb/protocol';
import {
  EffectRenderer, Joystick, KeyboardInput, WorldStage, effectTextureProvider, loadGltf, loopMotion, neuzRandom, attachHeld,
  rendererCounts,
} from '@flyffweb/scene';
import type { EffectTextureProvider, Ground, LoopedMotion, SceneServices } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import { Vector2, Vector3 } from 'three';
import { isUpright } from '../landscape';
import { UNEXPECTED_PROBLEM } from '../lobby/errorText';
import type { WorldEntry } from '../lobby/LoginFlow';
import { h } from '../lobby/views/dom';
import type { OpenChannel } from '../net/PacketChannel';
import { registerWorld } from '../testHooks';
import type { ClientPlayed } from '../testHooks';
import { askBeforeLeaving } from './askBeforeLeaving';
import { BackCamera } from './backCamera';
import type { ChaseView } from './backCamera';
import { AttackLoop, objRadius } from './combat/attackLoop';
import { Missiles } from './combat/missiles';
import type { MissileWorld } from './combat/missiles';
import { OwnShots } from './combat/ownShots';
import { Focus } from './combat/focus';
import { NO_FLIGHT_STICK, TapToWalk, WalkKey, controlIntent, flightStick, movesOrTurns } from './controls';
import type { FlightStick } from './controls';
import { FlightControl } from './flightControl';
import type { FlightInput } from './flightControl';
import { FlightButtons } from './hud/flightButtons';
import { TurboGauge } from './render/TurboGauge';
import { isGameMaster } from './authorization';
import { WARM_UP_EFFECTS, playCombatEvent, playOwnEvent } from './fx/combatEffects';
import type { CombatFxOut, CombatFxWorld } from './fx/combatEffects';
import { EffectManager } from './fx/EffectManager';
import { GameDataMissingError } from './gameData';
import type { GameData } from './gameData';
import { AttackButton } from './hud/attackButton';
import { effectModelProvider } from './fx/effectModels';
import type { EffectModels } from './fx/effectModels';
import { ChargeGauge } from './render/ChargeGauge';
import { BuffStatus } from './hud/buffStatus';
import { TargetBuffs } from './hud/targetBuffs';
import { CameraControls } from './cameraControls';
import { blockBrowserGestures } from './browserGestures';
import { CharacterWindow } from './hud/characterWindow';
import { escapeWindow, refitWindows } from './hud/frame';
import type { UiArt } from './hud/art';
import { Hud } from './hud/hud';
import { escapeStep } from './hud/escape';
import { LogOutBox } from './hud/logOutBox';
import { ReviveWindow } from './hud/reviveWindow';
import { SkillWindow } from './hud/skillWindow';
import { OptionWindow } from './hud/optionWindow';
import { DropBox } from './hud/dropBox';
import type { BoxState, KeptLogin } from '../lobby/reconnect';
import { TaskBar } from './hud/taskBar';
import { InventoryWindow } from './hud/inventoryWindow';
import { ChatWindow } from './hud/chatWindow';
import { MENU_RANGE, MMI, MoverMenu, npcMenuEntries, soleEntry } from './hud/moverMenu';
import { DialogWindow } from './hud/dialogue/dialogWindow';
import { parseDialogText } from './hud/dialogue/dialogText';
import { QuestTracker } from './hud/quests/questTracker';
import { QuestWindow } from './hud/quests/questWindow';
import type { QuestWindowState } from './hud/quests/questWindow';
import { loadQuests } from './quests/questCatalog';
import type { WebParty } from '@flyffweb/formats';
import type { MemberView, PartyView } from './hud/party/memberList';
import { loadParty } from './party/partyCatalog';
import { PartyHud } from './party/partyHud';
import { navigatorKind, partyMapMarks } from './party/partyMarks';
import { inviteCheck } from './party/partyRules';
import { PartyState } from './party/partyState';
import type { PartyEvent } from './party/partyState';
import { PlayerDataCenter } from './party/playerData';
import { MMI_INVITE_PARTY, menuInReach, playerMenuEntries } from './party/playerMenu';
import { PartyHpBars } from './render/PartyHpBars';
import { partyEffects } from './fx/partyEffects';
import type { PartyEffectContext, PartyMover } from './fx/partyEffects';
import type { PartyHpMember } from './render/PartyHpBars';
import { questLines, timedOut } from './quests/questLines';
import { createQuestLookup } from './quests/questRules';
import type { QuestCatalog, QuestNames, QuestOwner } from './quests/questRules';
import type { QuestChange } from './OwnState';
import { expNeeded, expPercent } from './sim/params';
import { dialogueStays, ownStands } from './hud/dialogue/dialogueStays';
import { ShopWindow } from './hud/shopWindow';
import { Minimap } from './hud/minimap';
import { WorldMap } from './hud/worldMap';
import type { MapView } from './hud/worldMap';
import { loadWorldMap } from './worldMapData';
import { loadAudio } from '../audio/audioCatalog';
import type { GameAudio } from '../audio/gameAudio';
import { MusicRules } from './sound/musicRules';
import { listenerAngle } from './sound/soundRules';
import { WorldSounds } from './sound/worldSounds';
import { TeleporterWindow } from './hud/teleporterWindow';
import { formatDefinedText } from './hud/messages';
import { ItemUse } from './items/itemUse';
import { ItemCast } from './items/itemCast';
import { MoverBuffs } from './buffs';
import type { BuffShown } from './buffs';
import { ReturnScroll } from './items/returnScroll';
import type { Refusal, UseCheck } from './items/travelItems';
import { castFill } from './items/travelItems';
import { CastGauge } from './render/CastGauge';
import { MessageBox } from './hud/messageBox';
import { SelectVillageWindow } from './hud/selectVillageWindow';
import { formatText } from './hud/format';
import { ItemActions } from './items/itemActions';
import { GroundItems } from './items/groundItems';
import { GroundModels, loadDropModel } from './items/groundModels';
import { NearbyItems } from './items/nearbyItems';
import { STATE_BASEMOTION_MODE, ShortcutKind } from '@flyffweb/protocol';
import type { TaskBarData, TaskBarWindow } from './hud/taskBar';
import { OwnMover, pickOnStage } from './ownMover';
import { OwnState } from './OwnState';
import { NoWebGLError, page3d, sceneAssets } from './page3d';
import type { Page3d } from './page3d';
import { DamageNumbers, screenProjector } from './render/DamageNumbers';
import { MoverViews } from './render/MoverViews';
import { NameTagLayer } from './render/NameTagLayer';
import { lookOf } from './render/looks';
import { MoveMark } from './render/moveMark';
import { loadHeldItems, loadMoverModel, loadRideModel } from './render/moverModels';
import { nameTagOf } from './render/nameTags';
import type { TapHit } from './render/picking';
import { latestOnly, renderPortrait } from './render/portrait';
import { SpriteLayer } from './render/SpriteLayer';
import { TargetMarks, attackMarks, focusRect } from './render/TargetMarks';
import type { ScreenRect } from './render/TargetMarks';
import { HAttr } from './sim/collision';
import { Mti, ObjSta, ObjStaF, PARTS_RIDE } from './sim/constants';

/** Piece 7 M5: the ground's field of view (`WorldStage`'s 45 degrees, `fDiv` 4), which a landing gives back. */
const GROUND_FOV = 45;
import { BLINKPOOL_NOT_YET, SkillUse } from './skills/skillUse';
import { transformCoord } from './sim/d3dx';
import { STEPS_PER_SECOND, catchUp } from './sim/stepper';
import { SimulationClock } from './simulationClock';
import { WorldSession } from './WorldSession';
import type { WorldEvent } from './WorldSession';
import { WorldState, isDie, isLive } from './WorldState';
import type { Mover, WorldChanges } from './WorldState';

const LOADING_TEXT = 'Entering the world…';
/** The joystick's height over the bottom, as Piece 3's: the task bar's 48 px and 8 more. */
/** `PutString( prj.GetText( TID_PK_COMBAT_END ), NULL, 0xffff0000 )` (`WndManager.cpp:2615`): red, not the text's colour. */
const COMBAT_END_COLOR = 0xffff0000;
/** `PutString`'s colour when none is given (`WndManager.h:641`): the quest lines without a TID colour. */
const WHITE = 0xffffffff;
const NOT_AVAILABLE_TEXT = "This map isn't available in the browser yet.";
const NO_WEBGL_TEXT = "This browser can't show the 3D world (WebGL is off or not supported).";
const OUT_OF_DATE_TEXT = 'The game files on the server are out of date.';
const TOO_SLOW_TEXT = 'The game files took too long to load. Check the connection and try again.';
/** How long the map around the player and the models in view may take to load before the entry gives up. */
const LOAD_LIMIT_MS = 60_000;
/** The longest the ring of tiles around the view waits for the models in view before it downloads anyway. */
const PRELOAD_WAIT_MS = 10_000;
/** The tiles shown around the player: 3 x 3, as the viewer's world view by default. */
const RADIUS = 1;
/** What the test hooks keep of what was played (`ClientPlayed`): the latest of each kind, so a long session stays small. */
const PLAYED_KEPT = 256;

/** `list` with `entry` added, and the oldest dropped past `PLAYED_KEPT`. */
function keep<T>(list: T[], entry: T): void {
  list.push(entry);
  if (list.length > PLAYED_KEPT) list.shift();
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The text an entry that failed ends with: its cause, where the player or the owner can do something about it. */
function endingOf(error: unknown): string {
  if (error instanceof NoWebGLError) return NO_WEBGL_TEXT;
  if (error instanceof GameDataMissingError) return OUT_OF_DATE_TEXT;
  return UNEXPECTED_PROBLEM;
}

/** A motion glb, looped as the client loops it (`loopMotion`). */
async function loadMotion(services: SceneServices, key: string): Promise<LoopedMotion> {
  const clip = (await loadGltf(services.store, services.loaders.gltf, key)).animations[0];
  if (clip === undefined) throw new Error('the file has no animation');
  return loopMotion(clip);
}

const drawingSize = new Vector2();
/** MMI_DIALOG is refused this long after an item drop (`GetTickCount() - m_dwDropTime < 3000`, WndWorld.cpp:5164). */
const DROP_GUARD_MS = 3000;

/**
 * A world whose session dropped on its own, frozen behind its box (Piece 6 M3): what the lobby needs to reconnect. The lobby
 * sets `onReconnect` and `onBack` (the box's buttons), shows each attempt's state with `box`, and takes the frozen world
 * away with `close` once it goes on: into a new world, or back to the lobby.
 */
export interface DroppedWorld {
  message: string;
  /** The kept login, until the lobby takes it (and blanks this): the reconnect alone holds it then, for its 5 minutes. */
  kept: KeptLogin | undefined;
  box(state: BoxState): void;
  onReconnect: () => void;
  onBack: () => void;
  close(): void;
}

export class WorldScreen {
  private readonly session: WorldSession;
  private readonly element: HTMLElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly unregister: () => void;
  /** Stops the browser's question before the page is closed, reloaded or left (`askBeforeLeaving`): asked from `open` to the ending. */
  private readonly stopAsking: () => void;
  private over = false;
  private page: Page3d | undefined;
  private services: SceneServices | undefined;
  private data: GameData | undefined;
  /** What the session said before the game data was in, in order. */
  private readonly waiting: WorldEvent[] = [];
  private world: WorldState | undefined;
  /** Where WORLD_READINFO put the player: the camera looks there until the own mover is in view. */
  private entered: Vec3 = [0, 0, 0];
  private stage: WorldStage | undefined;
  private stageGeneration = 0;
  /**
   * The world the rules move the movers in (D3D x, z): the stage's (`WorldStage.ground`: the land of its tiles and
   * their objects' collision shapes) once the stage is open; no land and nothing in the way before.
   */
  private readonly ground: Ground = {
    terrainHeight: (x, z) => this.stage?.ground().terrainHeight(x, z) ?? null,
    landAttr: (x, z) => this.stage?.ground().landAttr(x, z) ?? HAttr.NONE,
    objectsNear: (x, z, range) => this.stage?.ground().objectsNear(x, z, range) ?? [],
    landTri: (x, z, out) => this.stage?.ground().landTri?.(x, z, out) ?? false,
    // Piece 7 M5: the water (the 85 m floor over cloud) and the world's size (ClipX, ClipZ) of the flight collision
    waterTexture: (x, z) => this.stage?.ground().waterTexture?.(x, z) ?? null,
  };
  /** Piece 7 M5: the own flier's controls, the phone's flight buttons, and the turbo gauge. */
  private flightControl: FlightControl | undefined;
  private flightButtons: FlightButtons | undefined;
  private turboGauge: TurboGauge | undefined;
  /** Piece 7 M5: the right drag's steering since the last step, the phone's buttons, and the stick's flight keys. */
  private flightMouse = { dx: 0, dy: 0 };
  private flightAccelerate: boolean | undefined;
  private flightTurbo = false;
  private flightAttack = false;
  private flightStickWas: FlightStick = NO_FLIGHT_STICK;
  /** Piece 7 M5: the speed the HUD shows (`g_nFlySpeed`), and whether the own mover flew the step before. */
  private flightSpeed = 0;
  private wasFlying = false;
  /**
   * Piece 7 M5: the own mover the flight controls have seen flying (null on the ground), and whether its flight began
   * with a take-off this session saw (a DOEQUIP): one that entered the world flying sends PLAYERBEHAVIOR2 once.
   */
  private flyingSeen: Mover | null = null;
  private tookOff = false;
  private views: MoverViews | undefined;
  private tags: NameTagLayer | undefined;
  private keyboard: KeyboardInput | undefined;
  private joystick: Joystick | undefined;
  private tap: TapToWalk | undefined;
  /** X, the walk key (spec §1). */
  private walkKey: WalkKey | undefined;
  /** The mover the player selected (`CWorld::m_pObjFocus`), which the server is told of. */
  private focus: Focus | undefined;
  /** The own character's auto-attack: the presses on a mover, the attack each rules step, what stops it. */
  private attackLoop: AttackLoop | undefined;
  /** The own character's skill use (milestone 2): the task bar's skills and the action slot, and the server's answers. */
  private skillUse: SkillUse | undefined;
  private mark: MoveMark | undefined;
  /** The effects by `XI_*` id (`CreateSfx`), the renderer that draws them on the stage, and the textures it draws with. */
  private effects: EffectManager | undefined;
  private effectRenderer: EffectRenderer | undefined;
  private effectTextures: EffectTextureProvider | undefined;
  /** Piece 7 M2: the models the effects' mesh parts draw (the wand's flight model among them). */
  private effectModels: EffectModels | undefined;
  /**
   * Piece 7 M2: the missiles in flight (the wand's, the bow's, the monsters', a thrown yoyo), what they read of the world,
   * the own missiles' ids and reports, and the charge gauge over the own head.
   */
  private missiles: Missiles | undefined;
  private missileWorld: MissileWorld | undefined;
  private chargeGauge: ChargeGauge | undefined;
  /**
   * Piece 7 M3: the own item cast (its cancel), its gauge over the head, and the Scroll of Return's question box, village
   * window and flow; the box also shows the guild war's Blinkwing refusal.
   */
  private itemCast: ItemCast | undefined;
  /** Piece 7 M3: the own buffs kept from the world left by a REPLACE, for the new world's own mover. */
  private carriedBuffs: BuffShown[] = [];
  private castGauge: CastGauge | undefined;
  private messageBox: MessageBox | undefined;
  private selectVillage: SelectVillageWindow | undefined;
  private returnScroll: ReturnScroll | undefined;
  /** Piece 7 M2: the own buffs' icons (`CWndBuffStatus`) and the target's under its bar (`RenderMoverBuff`). */
  private buffStatus: BuffStatus | undefined;
  private targetBuffs: TargetBuffs | undefined;
  /**
   * The damage numbers and the corners around the target, each drawn in a layer of its glyph sheet over the canvas
   * (`spriteLayers`); none of either when the sheets cannot be had.
   */
  private numbers: DamageNumbers | undefined;
  private marks: TargetMarks | undefined;
  private readonly spriteLayers: SpriteLayer[] = [];
  /** The sheets' pictures, decoded as the world is entered and kept while it is on screen (`loadSheets`). */
  private sheetPictures: HTMLImageElement[] = [];
  /**
   * The on-screen windows and texts (spec §3.9), made with the stage so that the texts of the messages applied while the
   * world loads are kept, and put on screen with the world; the UI pictures they are drawn with (`hudArt`).
   */
  private hud: Hud | undefined;
  private hudArt: UiArt | undefined;
  /**
   * The task bar, the attack button and the box that asks before logging out, in the windows' layer once the world is on
   * screen (`showWorld`).
   */
  private taskBar: TaskBar | undefined;
  private attackButton: AttackButton | undefined;
  private cameraControls: CameraControls | undefined;
  private jumpButton: AttackButton | undefined;
  private jumpRequested = false;
  private releaseBrowserGestures: () => void = () => {};
  private logOutBox: LogOutBox | undefined;
  /**
   * The revive window (`CWndRevival`, Piece 4 §3.5), which the own death and Escape while dead open, and the Character
   * window with its confirm box (`CWndCharacter`, §3.6), which H, the applet and the Start menu open: in the windows'
   * layer once the world is on screen (`showWorld`).
   */
  private reviveWindow: ReviveWindow | undefined;
  private characterWindow: CharacterWindow | undefined;
  /** The skill tree window with its box (`CWndSkillTreeEx`, §3.11), which K, the applet and the Start menu open. */
  private skillWindow: SkillWindow | undefined;
  private inventoryWindow: InventoryWindow | undefined;
  private chatWindow: ChatWindow | undefined;
  private speechBubbles: SpeechBubbleLayer | undefined;
  private moverMenu: MoverMenu | undefined;
  /**
   * Piece 7 M4: `g_Party` and the player data, this login's: kept through a world change (plan Decisions 3), gone with
   * the screen at a log-out or a reconnect. The party's messages reach them before the world's; their events wait for
   * the windows while a world loads.
   */
  private readonly party = new PartyState({
    ownPlayerId: () => this.entry.character.playerId,
    inView: (playerId) => this.world?.moverByPlayerId(playerId) !== undefined,
    nameInView: (playerId) => this.world?.moverByPlayerId(playerId)?.name ?? null,
    skillName: (skill) => this.partyCatalog?.skills.find((s) => s.id === skill)?.name ?? '',
    defaultName: () => this.data?.texts.get('TID_GAME_PARTY_NAME')?.text ?? 'Advance Party',
  });
  private readonly playerData = new PlayerDataCenter((playerId) => this.session.sendQueryPlayerData(playerId));
  private partyCatalog: WebParty | null = null;
  /** The party skills' mode icons, the screen's as the party is (final review: a world change kept the mode, not its icon). */
  private readonly partyModeIcons = new MoverBuffs();
  private partyHud: PartyHud | undefined;
  private partyBars: PartyHpBars | undefined;
  private readonly partyEvents: PartyEvent[] = [];
  private dialog: DialogWindow | undefined;
  /** `CWndWorld::m_dwDropTime` (WndWorld.cpp:590): when the player last dropped an item. */
  private lastDropAt = -Infinity;
  private shopWindow: ShopWindow | undefined;
  private minimap: Minimap | undefined;
  /** The world map (Piece 6 M1), its catalog (null without one) and its monster switch, kept across world changes. */
  private worldMap: WorldMap | undefined;
  private worldMapData: WebWorldMap | null = null;
  /** The quest catalog (Piece 7 M1; null without one: quests listed by id), the quest window and the tracker. */
  private questCatalog: QuestCatalog | null = null;
  private questWindow: QuestWindow | undefined;
  private questTracker: QuestTracker | undefined;
  /**
   * This login's music rules (CWndWorld's, WndWorld.cpp:8013-8689) and the world's sound triggers (Piece 6 M2); null
   * without the page's audio, and the rules also without the audio catalog.
   */
  private music: MusicRules | null = null;
  /** The Option window's sound sliders (Piece 6 M2); none without the page's audio. */
  private optionWindow: OptionWindow | undefined;
  /**
   * Whether a session ending is a drop (Piece 6 M3): from the world's first frame on, or from the start for the world a
   * reconnect enters (`open`'s `reconnected`), so that one ending before it is shown keeps the login too.
   */
  private endingsAreDrops: boolean;
  /** The box of a dropped world, while it shows. */
  private dropBox: DropBox | undefined;
  private sounds: WorldSounds | null = null;
  private worldMapMonsters = false;
  /** The world the player is in (`enter`). */
  private worldId = 0;
  private teleporter: TeleporterWindow | undefined;
  private itemUse: ItemUse | undefined;
  private itemActions: ItemActions | undefined;
  private groundItems: GroundItems | undefined;
  /** The ground items' models, which the ring of tiles waits for (`settled`). */
  private dropModels: GroundModels | undefined;
  private nearbyItems: NearbyItems | undefined;
  /** The own character's driving: the controls each rules step, the moves sent, the stop. */
  private ownMover: OwnMover | undefined;
  /** The own character's numbers (`ownState`). */
  private own: OwnState | undefined;
  /** The chase camera behind the own mover, which follows it once a rules step. */
  private backCamera = new BackCamera();
  private simulationClock: SimulationClock | undefined;
  private paused = false;
  /**
   * While paused, the rules steps the next frame runs (the test hooks' `step`), and the calls that wait for that frame to
   * be drawn.
   */
  private askedSteps = 0;
  private stepsDrawn: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  /**
   * What the screen played of the fight (the test hooks' `played`), the latest `PLAYED_KEPT` of each kind, each with the
   * rules steps run when it was played (`stepsRun`, which every `step` counts).
   */
  private readonly playedSoFar: Omit<ClientPlayed, 'sounds' | 'music'> = { numbers: [], effects: [], swings: [] };
  private stepsRun = 0;
  /** The window was resized (or the device turned) since the last frame: the open windows are kept on the screen. */
  private resized = false;
  private lastTime = 0;
  /** The time the rules steps took since the last frame (`simulate`), in ms, for the frame's `cpu`. */
  private simulatedMs = 0;
  /** When the world was first drawn (`ClientPerf.onScreenAt`), in ms since 1970; null before. */
  private onScreenAt: number | null = null;
  /** This world's stage has been drawn once; reset with the stage (travel). */
  private stageDrawn = false;
  /** This world's stage was told to download the ring of tiles around the visible ones (the frame after its first). */
  private preloadStarted = false;
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  private lastError = '';
  /** The errors of applying a bundle said on the overlay, so that one that comes with every bundle is listed once. */
  private readonly reported = new Set<string>();
  /**
   * The stage's camera has been put behind the player by a frame: until the first frame it is the stage's default one at
   * the origin, and a point projected or picked through it is nowhere the player sees.
   */
  private cameraPlaced = false;
  /** Resolved once the first frame has drawn the world (`ready()`), rejected if the screen ends first. */
  private readonly shown: Promise<void>;
  private resolveShown!: () => void;
  private rejectShown!: (error: Error) => void;

  /**
   * Opens the world screen over `root` for `entry` and starts entering. `onEnd` is called once, when the world is over:
   * with the text to show, or undefined after Leave or Log out. Never throws. `onDrop` takes over instead when the session
   * ends on its own after the world was shown, or at any time when `reconnected` (the world a reconnect enters).
   */
  static open(
    root: HTMLElement, entry: WorldEntry, open: OpenChannel, onEnd: (message: string | undefined) => void, audio: GameAudio | null = null,
    onDrop?: (drop: DroppedWorld) => void, reconnected = false,
  ): WorldScreen {
    return new WorldScreen(root, entry, open, onEnd, audio, onDrop, reconnected);
  }

  private constructor(
    root: HTMLElement,
    private readonly entry: WorldEntry,
    open: OpenChannel,
    private readonly onEnd: (message: string | undefined) => void,
    private readonly audio: GameAudio | null,
    private readonly onDrop: ((drop: DroppedWorld) => void) | undefined,
    reconnected: boolean,
  ) {
    this.endingsAreDrops = reconnected;
    // the session takes over the login-server connection first, so that an ending below closes it too
    this.session = new WorldSession(open, entry, (event) => this.onEvent(event));
    this.shown = new Promise<void>((resolve, reject) => {
      this.resolveShown = resolve;
      this.rejectShown = reject;
    });
    this.shown.catch(() => {}); // only `ready()` callers care
    // Leave is there from the start, so that a loading screen that hangs has a way out; in the world, the task bar's Start
    // menu has Log out instead (`showWorld`)
    this.leaveButton = h('button', { type: 'button', class: 'world-leave' }, 'Leave');
    this.leaveButton.addEventListener('click', () => this.leave());
    this.element = h('div', { class: 'world' }, h('p', { class: 'world-status', role: 'status' }, LOADING_TEXT), this.leaveButton);
    root.append(this.element);
    this.releaseBrowserGestures = blockBrowserGestures(this.element, this.element.ownerDocument.defaultView ?? window);
    // from here to every ending, closing, reloading or leaving the page asks the player first; the ending lifts it
    this.stopAsking = askBeforeLeaving(this.element.ownerDocument.defaultView ?? window);
    this.unregister = registerWorld({
      ready: () => this.shown,
      movers: () => [...(this.world?.movers.values() ?? [])].map((m) => ({
        objectId: m.objectId, name: m.name, pos: [...m.act.body.pos], hp: m.hp, motion: m.act.motion, state: m.act.state,
        angle: m.act.body.angle, angleX: m.act.angleX, stateFlag: m.act.stateFlag, rideItemId: m.act.rideItemId,
      })),
      own: () => {
        const own = this.own;
        return own === undefined ? null : { hp: own.hp, level: own.level, actionPoint: own.taskBar?.actionPoint ?? null };
      },
      stats: () => ({ ...this.session.stats, errors: this.page?.overlay.snapshot().errors ?? [] }),
      perf: () => {
        if (this.page === undefined) throw new Error('no world page');
        const { overlay, renderer } = this.page;
        return {
          ...overlay.snapshot(), renderer: rendererCounts(renderer), loadedTiles: this.stage?.loadedTiles() ?? [],
          onScreenAt: this.onScreenAt,
        };
      },
      camera: () => toWebPosition(this.backCamera.view?.position ?? [0, 0, 0]),
      pause: () => {
        this.paused = true;
        this.views?.freeze();
      },
      step: (steps) => this.askSteps(steps),
      played: () => {
        const { numbers, effects, swings } = this.playedSoFar;
        return {
          numbers: numbers.map((n) => ({ ...n })), effects: effects.map((e) => ({ ...e })), swings: swings.map((s) => ({ ...s })),
          sounds: [...(this.audio?.played.sounds ?? [])], music: [...(this.audio?.played.music ?? [])],
        };
      },
      screenOf: (objectId) => this.screenOf(objectId),
    });
    void this.start();
  }

  /** Leave (spec §3.2.7), and the Start menu's Log out: both connections close, and the lobby comes back with no message. */
  leave(): void {
    this.end(undefined);
  }

  /**
   * The own character's numbers (`OwnState`), made from the own ADD_OBJ and the character list's equipment as the JOIN
   * enters the world (`enter`); undefined before, or with no own mover in the JOIN. The attack loop reads them, and the
   * world (`WorldState`) applies the messages about the own character to this same object, in bundle order.
   */
  get ownState(): OwnState | undefined {
    return this.own;
  }

  private async start(): Promise<void> {
    try {
      this.session.start().catch((error: unknown) => this.fail(error));
      this.page = page3d(this.element.ownerDocument);
      const { services, data } = await sceneAssets(this.page);
      if (this.over) return;
      this.services = services;
      this.data = data;
      [this.worldMapData, this.questCatalog, this.partyCatalog] = await Promise.all([
        loadWorldMap(services.store, (error) => this.reportOnce(`world map: ${messageOf(error)}`, error)),
        loadQuests(services.store, (error) => this.reportOnce(`quests: ${messageOf(error)}`, error)),
        loadParty(services.store, (error) => this.reportOnce(`party: ${messageOf(error)}`, error)),
      ]);
      if (this.over) return;
      const audio = this.audio;
      if (audio !== null) {
        // a file that fails is said once on the overlay while the world is up (Piece 6 design §4)
        audio.setReport((error) => { if (!this.over) this.reportOnce(error.message, error); });
        this.sounds = new WorldSounds(audio, { play: () => {} }, null);
        // the game never waits for sound: the world goes on while the catalog loads, silent until it is in, and a failed
        // load leaves the page's catalog as it was (the M2 final review)
        void loadAudio(services.store, (error) => this.reportOnce(`audio: ${messageOf(error)}`, error)).then((catalog) => {
          if (this.over || catalog === null) return;
          audio.setCatalog(catalog, services.store);
          this.music = new MusicRules(audio.music, catalog);
          if (this.world !== undefined) this.music.enterWorld(this.worldId); // a world entered before the catalog came
          this.sounds = new WorldSounds(audio, this.music, catalog);
        });
      }
      for (const event of this.waiting.splice(0)) this.handle(event);
    } catch (error) {
      this.fail(error);
    }
  }

  private onEvent(event: WorldEvent): void {
    if (this.over) return;
    if (event.type === 'ended') {
      if (this.endingsAreDrops && this.onDrop !== undefined) this.drop(event.message);
      else this.end(event.message);
    }
    else if (this.data === undefined) this.waiting.push(event);
    else this.handle(event);
  }

  private handle(event: WorldEvent): void {
    // an ending while the waiting events are handled (the map is not available) ends the ones after it too
    if (this.over) return;
    if (event.type === 'transition') {
      // Piece 7 M3 (final review, Important 1): the own buffs go with the player, as the new world's own ADD_OBJ carries
      // them (CMover::Serialize's m_buffs), which the browser does not read yet (M2 Decision 9)
      const own = this.world?.self();
      this.carriedBuffs = own === undefined ? [] : own.buffs.list(this.world!.nowMs());
      this.disposeWorld();
      this.element.replaceChildren(h('p', { class: 'world-status', role: 'status' }, LOADING_TEXT), this.leaveButton);
      const folder = this.data!.worlds.get(event.worldId);
      if (folder === undefined || this.services!.store.url(`worlds/${folder}/manifest.json`) === null) this.end(NOT_AVAILABLE_TEXT);
    } else if (event.type === 'entered') {
      try {
        this.enter(event.worldId, event.pos, event.messages);
      } catch (error) {
        this.fail(error);
      }
    } else if (event.type === 'messages') {
      try {
        this.apply(event.messages);
      } catch (error) {
        // the error is the browser's, not the server's: the overlay lists it (spec §4) and the world goes on
        this.reportOnce(`world: ${messageOf(error)}`, error);
      }
    }
  }

  /**
   * The JOIN bundle: the world (spec §3.2.5, a converted one or the session ends), the own character's numbers from its
   * ADD_OBJ (the JOIN's first, `CUser::Open`, `WORLDSERVER/User.cpp:326`) and the character list's equipment
   * (`OwnState`, whose throw ends the entry: the game files may be out of date), made before the bundle is applied so
   * that its messages about the own character (the TASKBAR after the ADD_OBJ, `User.cpp:328`) reach them; then the movers
   * in view, and the map. An inventory that could not be read is named on the overlay (Ruling R1; the session counts it).
   */
  private enter(worldId: number, pos: Vec3, messages: BundleMessage<WorldMessage>[]): void {
    const generation = ++this.stageGeneration;
    this.element.dataset.worldId = String(worldId);
    this.worldId = worldId;
    // OpenField and OnReplace: the music stops, and the world's rules start afresh (WndManager.cpp:2153, DPClient.cpp:2422-2427)
    this.audio?.music.stop();
    this.music?.enterWorld(worldId);
    const services = this.services!;
    const folder = this.data!.worlds.get(worldId);
    if (folder === undefined || services.store.url(`worlds/${folder}/manifest.json`) === null) {
      this.end(NOT_AVAILABLE_TEXT);
      return;
    }
    let added: AddedMover | undefined;
    for (const { value } of messages) {
      if (value.type === 'addMover' && value.mover.player?.self === true) added ??= value.mover;
    }
    if (added !== undefined) {
      this.own = new OwnState(this.data!, added, this.entry.character.equipment,
        (questId) => this.questCatalog?.get(questId)?.repeat === true);
    }
    const inventoryError = this.own?.inventoryError ?? null;
    if (inventoryError !== null) this.page?.overlay.error(`own inventory: ${inventoryError}`);
    // the rules stand the movers on the stage's land and objects once their tiles are in (`ground`)
    this.world = new WorldState(this.data!, this.entry.clock, this.ground, this.own);
    this.entered = pos;
    this.apply(messages, true);
    // Piece 7 M3: the buffs the player had in the world before, with the time each had left
    const self = this.world.self();
    const now = this.world.nowMs();
    for (const b of this.carriedBuffs) self?.buffs.add(b.buffType, b.id, b.level, b.totalMs > 0 ? b.leftMs : 0, now);
    this.carriedBuffs = [];
    this.loadTimer = setTimeout(() => { if (generation === this.stageGeneration) this.end(TOO_SLOW_TEXT); }, LOAD_LIMIT_MS);
    void this.openStage(folder, services, generation).catch((error: unknown) => {
      if (!this.over && generation === this.stageGeneration) {
        console.warn(`Unable to load map ${folder}:`, error);
        this.end(NOT_AVAILABLE_TEXT);
      }
    });
  }

  /**
   * A bundle's messages, in order, to the movers in view and the own numbers (`WorldState`); `joining` for the JOIN's.
   * SETPOS ends with `InitInterpolation` (`CDPClient::OnSetPos`, `DPClient.cpp:2270`): the mover is drawn where it is
   * put. A REPLACE within the world (another world has ended the session) puts the own mover there as SETPOS does; the
   * frame loop then streams the map there and moves the camera. QUERYGETDESTOBJ is the attack loop's, and so are the
   * focus and the attack when a mover in view dies (`AttackLoop.onMoverDeath`, `OnMoverDeath`) or leaves
   * (`AttackLoop.onRemoved`, `CWorld::Process`, `World.cpp:883-893`): told before the world puts the mover in its dead
   * state or drops it, so that the focus released is as live as Neuz finds it (`IsLive`, the SETTARGET with 1 of a
   * live target only, `World.cpp:310`). The skill use takes its answers after the world (`SkillUse.onMessage`; USESKILL
   * reaches it through the world, `WorldState.onUseSkill`), once the world is on screen.
   */
  private apply(messages: BundleMessage<WorldMessage>[], joining = false): void {
    const world = this.world!;
    for (const { objectId, value } of messages) {
      const self = world.self();
      // Piece 7 M4: the player data and the party first (they ignore what is not theirs); their events to the windows
      this.playerData.apply(value);
      const partyEvents = this.party.apply(value);
      this.playPartyEffects(value, partyEvents);
      this.partyEvents.push(...partyEvents);
      if (this.partyHud !== undefined && this.partyEvents.length > 0) this.partyHud.handle(this.partyEvents.splice(0));
      if (value.type === 'npcScript') {
        if (objectId === self?.objectId) this.npcScript(value.action);
        continue;
      }
      if (value.type === 'delObj') this.speechBubbles?.remove(objectId);
      if (value.type === 'playMusic') { this.sounds?.serverMusic(value.music); continue; }
      if (value.type === 'playSound') { this.sounds?.serverSound(value.sound); continue; }
      this.messageSounds(objectId, value, self);
      if (value.type === 'shopStock') { this.shopWindow?.receive(objectId, value.tabs); continue; }
      if (value.type === 'gmChat') {
        for (const text of value.texts) this.chatWindow?.append('system', '', text);
        continue;
      }
      if (value.type === 'chat' || value.type === 'shout' || value.type === 'whisper' || value.type === 'party' || value.type === 'guild' || value.type === 'system' || value.type === 'announcement') {
        if (value.type === 'chat' && world.movers.get(objectId)?.kind !== 'player') continue;
        if (value.type === 'chat') {
          this.chatWindow?.append('nearby', world.movers.get(objectId)?.name ?? 'Unknown', value.text);
          const speaker = world.movers.get(objectId);
          if (speaker && this.data && nameTagOf(speaker, world.self(), this.data.nameColors, this.data.honorTitles)) this.speechBubbles?.say(objectId, value.text);
        }
        else this.chatWindow?.append(value.type, value.sender, value.text, value.type === 'whisper' ? value.recipient : undefined);
        if (value.type === 'party' && value.speakerId !== undefined && value.text !== '' && world.movers.has(value.speakerId)) {
          this.speechBubbles?.say(value.speakerId, value.text);
        }
        continue;
      }
      if (value.type === 'chatReturn') {
        this.chatWindow?.append('system', '', value.flag === 1 ? value.text : value.flag === 2 ? 'You cannot whisper to yourself.' : `Whisper unavailable: ${value.text}`);
        continue;
      }
      if (value.type === 'definedText' && this.data) {
        const text = formatDefinedText(this.data.texts, value.textId, value.args).text;
        if (text) this.chatWindow?.append('system', '', text);
        if (text) this.shopWindow?.feedback(text);
      }
      if (value.type === 'replace') {
        if (self === undefined) continue;
        this.music?.enterWorld(this.worldId); // OnReplace reopens the world: its music starts afresh (DPClient.cpp:2422-2427)
        world.apply(self.objectId, { type: 'setPos', pos: value.pos });
        this.views?.snap(self.objectId);
        this.backCamera.relocate();
        continue;
      }
      if (value.type === 'queryGetDestObj') {
        this.attackLoop?.onQueryGetDestObj(value.fromId);
        continue;
      }
      if (value.type === 'returnScrollAck') {
        // Piece 7 M3: OnReturnScrollACK (DPClient.cpp:677, :15784-15787): the scroll used again, with no box
        const id = this.returnScroll?.answered() ?? null;
        if (id !== null) this.itemUse?.use(id, 'again');
        continue;
      }
      if (world.movers.has(objectId)) {
        if (value.type === 'moverDeath') this.attackLoop?.onMoverDeath(objectId, value.attackerId);
        else if (value.type === 'delObj') this.attackLoop?.onRemoved(objectId);
      }
      world.apply(objectId, value, joining);
      this.skillUse?.onMessage(objectId, value, world.self());
      this.skillWindow?.onMessage(objectId, value, this.own);
      if (value.type === 'setPos' || value.type === 'setPosAngle') {
        this.views?.snap(objectId);
        if (objectId === self?.objectId) this.backCamera.relocate();
      }
    }
  }

  private async openStage(folder: string, services: SceneServices, generation: number): Promise<void> {
    const stage = await WorldStage.open(folder, services, RADIUS);
    if (this.over || generation !== this.stageGeneration) {
      stage.dispose();
      return;
    }
    this.stage = stage;
    // Piece 7 M5: the world's size for the flight collision's edge (ClipX, ClipZ)
    (this.ground as { extent?: readonly [number, number] }).extent = stage.ground().extent;
    const { size, mapSize, mpu } = stage.manifest;
    this.world!.setItemBounds(size[0] * mapSize * mpu, size[1] * mapSize * mpu);
    const { overlay } = this.page!;
    const data = this.data!;
    // the own character is dressed, and armed, from the character list's item ids (`lookOf`); what the hands hold picks
    // each player's weapon set of its motions in combat, from the item catalog
    const equipment = this.entry.character.equipment;
    this.views = new MoverViews(
      stage.scene, loadMoverModel(services), overlay, (mover) => lookOf(mover, data,
        this.own?.inventory ? this.own.equipmentObjectIds.map((id) => this.own!.inventory!.get(id)?.itemId ?? 0) : equipment),
      (key) => loadMotion(services, key), loadHeldItems(services, data), data.itemProps, {
        moverProps: data.movers,
        loadRide: loadRideModel(services), // Piece 7 M5
        sounds: { motion: (at, id) => this.sounds?.motion(at, id), footstep: (at) => this.sounds?.footstep(at) },
      },
    );
    this.world!.onEquipmentChange = (mover) => {
      this.views?.refresh(mover);
      if (mover.isSelf && this.inventoryWindow?.frame.isOpen) void this.makePortrait(true);
    };
    this.tags = new NameTagLayer(stage.scene, this.element.ownerDocument);
    this.speechBubbles = new SpeechBubbleLayer(stage.scene, this.element.ownerDocument);
    this.startEffects(stage, services);
    this.startHud(services, folder);
    this.syncViews();
    // the objects' collision shapes come with the tiles from here on, and `ready` waits for them
    stage.ground();
    stage.focus(this.ownAt());
    const loaded = await Promise.all([stage.ready(), this.views.settled(), this.loadSheets(services, generation)]);
    if (this.over || generation !== this.stageGeneration) return;
    clearTimeout(this.loadTimer);
    this.showWorld(loaded[2]);
  }

  /**
   * The effects (spec §3.7): the manager plays them by `XI_*` id on the stage, with the page's texture cache, and says on
   * the overlay what it cannot play. The milestone's effects (`WARM_UP_EFFECTS`) start loading now, files and textures,
   * so that the first hit's spark is not lost to its download.
   */
  private startEffects(stage: WorldStage, services: SceneServices): void {
    const overlay = this.page!.overlay;
    const textures = effectTextureProvider(services.textures);
    // a file that fails after the screen has ended is not this entry's to say: the overlay is the page's
    const report = (message: string): void => {
      if (!this.over) overlay.error(message);
    };
    const models = effectModelProvider(async (key) => (await loadGltf(services.store, services.loaders.gltf, key)).scene, report);
    const renderer = new EffectRenderer(stage.scene, (key) => textures.get(key), (key) => models.get(key));
    this.effectTextures = textures;
    this.effectModels = models;
    this.effectRenderer = renderer;
    const effects = new EffectManager(this.data!, (key) => services.store.json<WebEffect>(key), renderer, neuzRandom, report);
    this.effects = effects;
    effects.made = (xi, pos) => this.sounds?.effect(xi, { x: pos[0], y: pos[1], z: pos[2] });
    for (const xi of WARM_UP_EFFECTS) effects.preload(xi, (key) => void textures.get(key));
  }

  /**
   * The on-screen windows (`Hud`), drawn with the UI stage's pictures from the asset store: one the asset index lacks
   * (game files converted before the UI stage) is drawn as nothing, and named once on the overlay (spec §4). The glyph
   * sheets come with the world (`showWorld`).
   */
  private startHud(services: SceneServices, folder: string): void {
    const art: UiArt = {
      url: (key) => {
        const url = services.store.url(key);
        if (url === null) this.reportOnce(`ui: ${key}`, new Error(`${key} is not in the asset index`));
        return url ?? '';
      },
      sheets: null,
    };
    this.hudArt = art;
    this.hud = new Hud(this.element.ownerDocument, art, this.data!);
    this.minimap = new Minimap(art, this.stage!.manifest, folder, key => services.store.url(key), this.element.ownerDocument);
    this.hud.element.append(this.minimap.frame.element);
    this.worldMap = new WorldMap(art, this.worldMapData, this.data!, (id) => this.say(id), this.element.ownerDocument);
    this.worldMap.monsterInfo = this.worldMapMonsters;
    this.hud.element.append(this.worldMap.element);
  }

  /**
   * The glyph sheets of the damage numbers and the target corners (`data/uiSheets.json`, `WebUiSheets`), or null when
   * they cannot be had (game files converted before the UI stage, or a failed download): the world goes on without the
   * numbers and the corners, and the overlay says why. Their pictures are downloaded and decoded too, as the effects are
   * warmed up (`startEffects`): a number lasts under a second, and its first one must not be drawn blank while its
   * picture comes. A picture that cannot be had is said once; its layer tries again as it draws. One that fails after the
   * screen has ended (the player left while it came, or the page is going) is not this entry's to say, as an effect's
   * file is not (`startEffects`).
   */
  private async loadSheets(services: SceneServices, generation: number): Promise<WebUiSheets | null> {
    let sheets: WebUiSheets;
    try {
      sheets = await services.store.json<WebUiSheets>(UI_SHEETS_KEY);
    } catch (error) {
      if (!this.over) this.reportOnce(`ui sheets: ${messageOf(error)}`, error);
      return null;
    }
    if (this.over || generation !== this.stageGeneration) return null;
    await Promise.all([sheets.targetCorners, sheets.damageDigits].map(async ({ image }) => {
      const url = services.store.url(image);
      if (url === null) return; // `screenLayers` says so
      const picture = new (this.element.ownerDocument.defaultView ?? window).Image();
      picture.src = url;
      this.sheetPictures.push(picture);
      try {
        await picture.decode();
      } catch (error) {
        if (!this.over) this.reportOnce(`ui sheets: ${image} could not be decoded`, error);
      }
    }));
    return sheets;
  }

  /**
   * The layers over the canvas, under the controls, from the glyph sheets: the target corners, then the damage numbers
   * over them, the order `CWndWorld::OnDraw` draws them in (`RenderSelectObj`, `WndWorld.cpp:1058`, then
   * `g_DamageNumMng.Render()`, :1092). A sheet whose picture the asset index lacks leaves its part out, said once.
   */
  private screenLayers(doc: Document, sheets: WebUiSheets | null): HTMLElement[] {
    if (sheets === null) return [];
    const store = this.services!.store;
    const layerOf = (sheet: WebUiSheet, name: string): SpriteLayer | null => {
      const url = store.url(sheet.image);
      if (url === null) {
        this.reportOnce(`ui sheets: ${sheet.image}`, new Error(`${sheet.image} is not in the asset index`));
        return null;
      }
      const layer = new SpriteLayer(doc, url, sheet.frames, name);
      this.spriteLayers.push(layer);
      return layer;
    };
    const corners = layerOf(sheets.targetCorners, 'world-target-marks');
    if (corners !== null) this.marks = new TargetMarks(corners);
    const digits = layerOf(sheets.damageDigits, 'world-damage-numbers');
    if (digits !== null) this.numbers = new DamageNumbers(sheets.damageDigits.frames, digits);
    return this.spriteLayers.map((layer) => layer.element);
  }

  /**
   * The world is ready to be seen: the map, the layers of numbers and corners over it, the windows with the task bar in
   * place of the loading screen's Leave (its Start menu's Log out leaves), the controls, Escape, and the frame loop.
   */
  private showWorld(sheets: WebUiSheets | null): void {
    const { holder, renderer } = this.page!;
    const doc = this.element.ownerDocument;
    const view = doc.defaultView ?? window;
    this.hudArt!.sheets = sheets;
    this.element.replaceChildren(holder, ...this.screenLayers(doc, sheets), this.hud!.element);
    // Piece 7 M2: the charge gauge, over the canvas and under the windows (CMover::RenderGauge draws it with the world)
    this.chargeGauge = new ChargeGauge(this.hudArt!, doc);
    this.element.insertBefore(this.chargeGauge.element, this.hud!.element);
    // Piece 7 M4: the HP bars over the party's members, drawn with the world as the gauge is (CMover::RenderHP)
    this.partyBars = new PartyHpBars(this.hudArt!, doc);
    this.element.insertBefore(this.partyBars.element, this.hud!.element);
    // Piece 7 M3: an item cast's gauge, there too (CMover::RenderCasting)
    this.castGauge = new CastGauge(this.hudArt!, doc);
    this.element.insertBefore(this.castGauge.element, this.hud!.element);
    // Piece 7 M5: the turbo gauge over the own flier (CMover::RenderTurboGauge)
    this.turboGauge = new TurboGauge(this.hudArt!, doc);
    this.element.insertBefore(this.turboGauge.element, this.hud!.element);
    // the item buffs too, and the Scroll of Return's icon goes back (Piece 7 M3)
    this.buffStatus = new BuffStatus(this.hudArt!, doc, {
      items: this.data!.itemProps, onReturnScroll: () => this.returnScroll?.goBack(), now: () => performance.now(),
    });
    this.targetBuffs = new TargetBuffs(this.hudArt!, doc);
    this.hud!.element.append(this.buffStatus.element, this.targetBuffs.element);
    this.minimap?.open();
    this.element.addEventListener('contextmenu', this.onContextMenu);
    this.page?.overlay.setCompact(view.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true);
    this.keyboard = new KeyboardInput(view, { arrows: false });
    // Piece 7 M5: in the air Tab is the targets', not the page's focus
    this.keyboard.preventDefault = (code) => code === 'Tab' && this.world?.self()?.act.isFlying() === true;
    this.flightControl = new FlightControl(this.session, this.entry.clock); // Piece 7 M5
    this.walkKey = new WalkKey(view);
    // above the task bar (48 px, smaller on a narrow screen) and out of the safe area under it
    this.joystick = new Joystick(this.element, { floating: true, onClaim: () => this.tap?.reset() });
    this.focus = new Focus(this.session, (objectId) => this.isLive(objectId));
    // Piece 7 M3: the own item cast; a skill or an attack during it sends its cancel and is refused
    this.itemCast = new ItemCast(() => this.world?.self(), this.session);
    const interruptCast = (): boolean => this.itemCast?.interrupt() ?? false;
    // the skill use and the attack loop share the own mover's one command, the reserved skill and the auto-attack
    const skillUse = new SkillUse(this.session, this.focus, () => this.own, () => performance.now(), this.data!, {
      tick: () => this.entry.clock.tick(), ground: () => this.ground, interruptCast,
    });
    // the web's own line where Neuz would teleport (Blinkpool, plan Decisions 8); the catalog's texts for the rest
    skillUse.onText = (id) => (id === BLINKPOOL_NOT_YET
      ? this.hud?.messages.add('Blinkpool is not in the browser yet.', 0xffff0000)
      : this.say(id));
    this.skillUse = skillUse;
    const attackLoop = new AttackLoop(
      this.session, this.focus, this.world!, () => this.own, this.entry.clock, this.data!.movers, skillUse,
      (mover, motion) => this.views!.motionReady(mover, motion), interruptCast,
    );
    skillUse.attack = attackLoop;
    this.world!.onUseSkill = (casterId, message, started) => skillUse.onUseSkill(casterId, message, started);
    this.attackLoop = attackLoop;
    // Piece 7 M2: the own missiles' ids and reports, the missiles of everyone, and what the attack loop says and tests
    const ownShots = new OwnShots(this.session);
    const views = this.views!;
    // Strong Wind's push goes into the target's outside force (m_vDeltaE), which fades as a knock-back's does
    this.missiles = new Missiles(ownShots, (targetId, shake) => { if (shake) views.shake(targetId); }, (id, delta) => {
      const pushed = this.world?.movers.get(id);
      if (pushed !== undefined) pushed.act.deltaE = [...delta];
    });
    this.missileWorld = {
      movers: this.world!.movers,
      boxOf: (id) => {
        const box = views.pickCandidate(id)?.box;
        return box === undefined ? undefined : { ...box, scale: this.world!.movers.get(id)?.added.scale ?? 1 };
      },
      handOf: (id, hand) => views.handAt(id, hand),
      rankOf: (id) => {
        const mover = this.world?.movers.get(id);
        return mover === undefined || mover.added.isPlayer ? 0 : this.data?.movers.get(mover.added.index)?.rank ?? 0;
      },
    };
    this.world!.missiles = this.missiles;
    this.world!.shots = ownShots;
    this.world!.handOf = (id, hand) => views.handAt(id, hand);
    attackLoop.shots = ownShots;
    attackLoop.onText = (id) => this.say(id);
    attackLoop.ground = () => this.ground;
    const session = this.session;
    // Piece 7 M3: the Blinkwings and the Scroll of Return go through Neuz's refusals; the Scroll through its two windows
    const messageBox = new MessageBox(this.hudArt!, doc);
    this.messageBox = messageBox;
    const selectVillage = new SelectVillageWindow(this.hudArt!, doc);
    this.selectVillage = selectVillage;
    const returnScroll = new ReturnScroll(messageBox, selectVillage, session, this.data!.texts);
    this.returnScroll = returnScroll;
    this.itemUse = new ItemUse(() => this.own, this.data!.itemProps, session, {
      check: () => this.useCheck(),
      say: (refusal) => this.sayRefusal(refusal),
      returnScroll,
      shopOpen: () => this.shopWindow?.frame.isOpen === true,
    });
    const itemActions = new ItemActions(() => this.own, () => this.world!.self()!.act.body.pos,
      () => this.world!.groundItems, this.data!.itemProps, session, (pos) => {
        attackLoop.stop('move');
        const own = this.world?.self();
        if (own) this.ownMover?.walkTo(own, pos, false);
      });
    this.itemActions = itemActions;
    const dropModels = new GroundModels(this.stage!.scene, this.data!, loadDropModel(this.services!),
      () => this.ground, message => this.page!.overlay.error(message),
      pos => this.effects?.play({ xi: 64, pos })); // XI_GEN_ITEM_SHINE01, CItem::Render
    this.dropModels = dropModels;
    this.groundItems = new GroundItems(this.data!, this.hudArt!, (id) => itemActions.pick(id, performance.now()), doc, dropModels);
    this.nearbyItems = new NearbyItems(this.data!, this.hudArt!, (id) => itemActions.pick(id, performance.now()), doc,
      () => itemActions.pickNearby(performance.now()));
    this.element.append(this.groundItems.element);
    const taskBar = new TaskBar(this.hudArt!, {
      open: (window) => this.openWindow(window),
      logOut: () => this.logOut(),
      // a skill shortcut is the skill use's (`ObjectExecutor`'s SHORTCUT_SKILL); the slots' items are used in Piece 5
      useSlot: (_bar, _slot, shortcut) => { if (shortcut.kind === ShortcutKind.ITEM) this.itemUse!.use(shortcut.id); else skillUse.useShortcut(shortcut); },
      useAppletSlot: (_slot, shortcut) => { if (shortcut.kind === ShortcutKind.ITEM) this.itemUse!.use(shortcut.id); else skillUse.useShortcut(shortcut); },
      useActionSlot: () => skillUse.useActionSlot(),
      sendAddItemTaskBar: (bar, slot, shortcut) => session.sendAddItemTaskBar(bar, slot, shortcut),
      sendRemoveItemTaskBar: (bar, slot) => session.sendRemoveItemTaskBar(bar, slot),
      sendSkillTaskBar: (queue) => session.sendSkillTaskBar(queue),
      queueRunning: () => skillUse.execute !== 0,
      say: (text, color) => this.hud?.messages.add(text, color),
    }, doc);
    this.taskBar = taskBar;
    // T, the status window's key, waits while the bar carries a shortcut, as the bar's own hotkeys do
    this.hud!.carrying = () => taskBar.carrying;
    // the Start menu opens where the joystick stands, which is over the windows' layer: it hides while the menu is open
    this.taskBar.onMenuChange = (open) => this.element.classList.toggle('world-menu-open', open);
    // held with a wand or a bow it charges, and its let-go shoots (Piece 7 M2, plan Decisions 4)
    this.attackButton = new AttackButton(() => {
      // Piece 7 M5: in the air the button is held to attack (ControlFlying's m_bLButtonDown)
      if (this.world?.self()?.act.isFlying() === true) this.flightAttack = true;
      else attackLoop.attackButtonDown(performance.now());
    }, doc, {
      onRelease: () => {
        if (this.flightAttack) this.flightAttack = false;
        else attackLoop.attackButtonUp(performance.now());
      },
    });
    this.jumpButton = new AttackButton(() => { this.jumpRequested = true; }, doc, { label: 'Jump', className: 'hud-jump' });
    // Piece 7 M5: Accelerate (held), Turbo and Land in the air (Decision 4)
    this.flightButtons = new FlightButtons(doc, {
      accelerate: (held) => { this.flightAccelerate = held; },
      turbo: () => { this.flightTurbo = true; },
      land: () => this.landRide(),
    });
    const mobileTools = doc.createElement('div');
    mobileTools.className = 'hud-mobile-tools';
    mobileTools.setAttribute('role', 'toolbar');
    mobileTools.setAttribute('aria-label', 'Window shortcuts');
    for (const [label, action] of [
      ['Skill', () => this.openWindow('skills')],
      ['Bag', () => this.openWindow('inventory')],
      ['Character', () => this.openWindow('character')],
      ['Stats', () => { statsButton.ariaExpanded = String(this.page!.overlay.togglePanel()); }],
    ] as const) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => { action(); button.blur(); });
      mobileTools.append(button);
    }
    const statsButton = mobileTools.lastElementChild as HTMLButtonElement;
    statsButton.ariaExpanded = 'false';
    const logOutBox = new LogOutBox(this.hudArt!, this.data!.texts, () => this.leave(), doc);
    this.logOutBox = logOutBox;
    const characterWindow = new CharacterWindow(
      this.hudArt!, this.data!.texts, (counts) => this.session.sendModifyStatus(counts), doc,
    );
    this.characterWindow = characterWindow;
    const reviveWindow = new ReviveWindow(this.hudArt!, this.data!.texts, () => this.session.sendRevivalToLodestar(), doc);
    this.reviveWindow = reviveWindow;
    reviveWindow.onStand = () => this.itemUse!.revive();
    const inventoryWindow = new InventoryWindow(this.hudArt!, this.data!, {
      use: (id) => { this.itemUse!.use(id, 'bag'); }, equip: (id) => { itemActions.equip(id); },
      land: (id) => { this.itemUse!.land(id); }, // Piece 7 M5: the worn ride's equipment cell
      drop: (id, count) => {
        if (this.dialog?.frame.isOpen === true) return; // no drop while the dialogue is open (DPClient.cpp:9378-9382)
        this.sounds?.drop();
        if (itemActions.drop(id, count)) this.lastDropAt = performance.now();
      },
      move: (source, dest) => { itemActions.move(source, dest); },
      shortcut: (id, slot) => taskBar.setInventoryShortcut(id, slot),
    }, doc);
    this.inventoryWindow = inventoryWindow;
    this.chatWindow ??= new ChatWindow((channel, text, target) => this.session.sendChat(channel, text, target), () => this.stopOwnMover(), doc);
    this.shopWindow = new ShopWindow(this.hudArt!, this.data!, () => this.own, (id) => this.canTalk(id), {
      open: (id) => session.sendOpenShop(id), close: () => session.sendCloseShop(),
      // the trade sound of a buy confirmed and of a sale (WndShop.cpp:655, :232-235)
      buy: (tab, id, count, itemId) => { this.sounds?.shop(); session.sendBuyItem(tab, id, count, itemId); },
      sell: (id, count) => { this.sounds?.shop(); session.sendSellItem(id, count); },
    }, doc);
    this.shopWindow.onOpen = () => {
      this.hud!.element.classList.add('shop-active');
      inventoryWindow.shopSelect = id => this.shopWindow!.selectSell(id);
      if (this.own) {
        if (!inventoryWindow.frame.isOpen) inventoryWindow.toggle(this.own);
        inventoryWindow.update(this.own, true); void this.makePortrait(true);
      }
    };
    this.shopWindow.onClosed = () => {
      this.hud?.element.classList.remove('shop-active'); inventoryWindow.shopSelect = undefined;
      if (this.own) inventoryWindow.update(this.own, true);
    };
    inventoryWindow.onShopClose = () => this.shopWindow?.frame.close();
    this.teleporter = new TeleporterWindow(this.hudArt!, id => this.canTalk(id), (key, index) => session.sendTeleporter(key, index), doc);
    this.moverMenu = new MoverMenu(doc);
    const partyHud = new PartyHud(this.hudArt!, this.data!.texts, () => this.partyCatalog, {
      session,
      say: (text, color) => this.hud?.messages.add(text, color),
      music: (id) => this.sounds?.serverMusic(id),
      recolor: () => this.recolorTags(),
      target: (playerId) => this.focus?.select(playerId === null ? null : this.world?.moverByPlayerId(playerId)?.objectId ?? null),
      quickAt: () => {
        const status = this.hud?.status.frame.element.getBoundingClientRect(), layer = this.hud?.element.getBoundingClientRect();
        return { x: 0, y: status === undefined || layer === undefined || status.height === 0 ? 112 : Math.round(status.bottom - layer.top) };
      },
      ownPlayerId: () => this.entry.character.playerId,
      now: () => this.world?.nowMs() ?? 0,
      carryPartySkill: (skill, event) => taskBar.carryPartySkill(skill, event),
    }, this.party, this.partyModeIcons, doc);
    this.partyHud = partyHud;
    // a type-2 shortcut of the task bar: the party skill's rule (ObjectExecutor, WndManager.cpp:2779-2876)
    skillUse.onPartySkill = (skill) => partyHud.useSkill(skill);
    // RunScript: the NPC and the player as nGlobal3 and nGlobal4 (WndDialog.cpp:234-240)
    // the dialogue's quest rows from the catalog and the own quests (Piece 7 M1: `[min~max] title`, the papers)
    const quests = createQuestLookup(() => this.questCatalog, () => this.own?.quests ?? new Map(), () => this.questOwner());
    this.dialog = new DialogWindow(this.hudArt!, this.data!.texts, quests, (request) => {
      const npcId = this.dialog?.npcId ?? null, self = this.world?.self();
      if (npcId !== null && self !== undefined) session.sendNpcDialog(npcId, request.key, request.param, request.quest, self.objectId);
    }, doc);
    const questNames = this.questNames();
    const destination = (goal: { x: number; z: number }): void => {
      this.worldMap?.showDestination(this.mapView(), goal);
      if (this.worldMap?.isOpen === true) this.releaseControls();
    };
    const questWindow = new QuestWindow(this.hudArt!, this.data!.texts, questNames, {
      check: (questId, check) => session.sendQuestCheck(questId, check),
      abandon: (questId) => session.sendRemoveQuest(questId),
      destination,
      // PutString with TID_GAME_ERROR_DONT_CHECK's colour (WndQuest.cpp:1545)
      say: (text) => this.hud?.messages.add(text, this.data!.texts.get('TID_GAME_ERROR_DONT_CHECK')?.color ?? WHITE),
    }, doc);
    this.questWindow = questWindow;
    this.questTracker = new QuestTracker(this.data!.texts, questNames, {
      title: (questId) => questWindow.showDetail(questId, this.questState()),
      destination,
    }, doc);
    // Finish sends DOUSESKILLPOINT through the skill use, which also ends a spend the server leaves unanswered
    const skillWindow = new SkillWindow(this.hudArt!, this.data!, (skills) => void skillUse.spendSkillPoints(skills), taskBar, doc);
    this.skillWindow = skillWindow;
    this.optionWindow = this.audio === null ? undefined : new OptionWindow(this.hudArt!, this.audio, doc);
    for (const modal of [
      logOutBox.modal, reviveWindow.modal, skillWindow.warning.modal, this.dialog.modal, questWindow.modal, messageBox.modal, selectVillage.modal, partyHud.messageBox.modal,
    ]) {
      modal.onChange = () => this.modalChanged();
    }
    this.hud!.element.append(
      this.questTracker.element, this.teleporter.frame.element,
      taskBar.element, this.attackButton.element, this.jumpButton.element, this.flightButtons.element, mobileTools,
      logOutBox.element, messageBox.element,
      selectVillage.element, characterWindow.frame.element,
      characterWindow.confirm.frame.element, skillWindow.frame.element, skillWindow.warning.element, reviveWindow.element,
      inventoryWindow.frame.element, this.nearbyItems.element, this.chatWindow.element, this.shopWindow.frame.element,
      ...questWindow.elements, this.dialog.element, this.moverMenu.element, ...partyHud.elements,
    );
    // what the party said while the world loaded
    if (this.partyEvents.length > 0) partyHud.handle(this.partyEvents.splice(0));
    if (this.optionWindow !== undefined) this.hud!.element.append(this.optionWindow.frame.element);
    // before the windows' own Escape (frame.ts), which closes a window only if this one leaves the key to it
    view.addEventListener('keydown', this.onEscape, true);
    // on the canvas: the joystick is an element of its own over it, and its touches never reach it; each press goes to
    // the attack loop as it goes down (OnLButtonDown, OnLButtonDblClk): on a mover, or on the ground, which stops it
    this.tap = new TapToWalk(
      renderer.domElement, (x, y) => this.pick(x, y), (error) => this.reportOnce(`tap: ${messageOf(error)}`, error),
      (press) => {
        const pressed = press.mover === null ? undefined : this.world?.movers.get(press.mover);
        if (press.mover === null) attackLoop.onGroundPressed(press.double);
        // in the air no NPC menu opens (WndWorld.cpp:7059, !IsFly()): the press goes to the air's selection (Piece 7 M5)
        else if (pressed?.kind === 'npc' && this.world?.self()?.act.isFlying() !== true) this.pressNpc(press.mover);
        else if (pressed?.kind === 'player' && !pressed.isSelf && (press.alt || (press.touch && this.focus?.targetId === press.mover))) {
          this.pressPlayer(press.mover);
        } else attackLoop.onMoverPressed(press.mover, press.time, press.double);
      },
      (mover) => {
        const pressed = this.world?.movers.get(mover);
        if (pressed?.kind === 'player' && !pressed.isSelf) this.pressPlayer(mover);
      },
    );
    this.cameraControls = new CameraControls(renderer.domElement, (dx, dy) => this.backCamera.rotate(dx, dy));
    // Piece 7 M5: in the air the right drag steers (ControlFlying's mouse, mode 0)
    this.cameraControls.steer = (dx, dy) => {
      if (this.world?.self()?.act.isFlying() !== true) return false;
      this.flightMouse.dx += dx;
      this.flightMouse.dy += dy;
      return true;
    };
    this.mark = new MoveMark(this.stage!.scene);
    this.ownMover = new OwnMover(this.session, this.entry.clock, this.mark);
    doc.addEventListener('visibilitychange', this.onVisibility);
    view.addEventListener('blur', this.onBlur);
    view.addEventListener('resize', this.onResize);
    view.addEventListener('keydown', this.onKeyDown);
    view.addEventListener('keyup', this.onKeyUp);
    this.lastTime = performance.now();
    this.simulationClock = new SimulationClock((steps, now) => this.simulate(steps, now), () => this.paused || this.over);
    // `ready()` resolves at the end of the first frame (`frame`), once the camera is placed and the world drawn
    renderer.setAnimationLoop((now) => this.frame(now));
    void this.makePortrait();
  }

  /**
   * The face of the status window (`renderPortrait`): the own look, loaded for it alone, in the first frame of its standing
   * motion, drawn once with the page's renderer and let go. What cannot be had leaves the face box empty, said once.
   */
  private portraitGeneration = 0;
  private readonly newestPreview = latestOnly<HTMLCanvasElement>();
  private async makePortrait(inventory = false): Promise<void> {
    const stageGeneration = this.stageGeneration;
    const generation = inventory ? ++this.portraitGeneration : 0;
    const self = this.world?.self();
    const services = this.services!;
    const data = this.data!;
    const equipment = inventory && this.own?.inventory ? this.own.equipmentObjectIds.map((id) => this.own!.inventory!.get(id)?.itemId ?? 0) : this.entry.character.equipment;
    const look = self === undefined ? null : lookOf(self, data, equipment);
    if (look === null) return;
    const report = (message: string): void => this.reportOnce(`portrait: ${message}`, new Error(message));
    try {
      const model = await loadMoverModel(services)(look, report);
      const held = inventory ? await loadHeldItems(services, data)(look, report) : [];
      try {
        for (const item of held) attachHeld(model, item.item, item.slot);
        const key = look.motion(Mti.STAND);
        const motion = key === null ? null : await loadMotion(services, key);
        if (this.over || stageGeneration !== this.stageGeneration) return;
        // the picture comes back after its asynchronous read (Piece 6 M5): the screen may have ended meanwhile, and a newer
        // inventory picture started meanwhile wins over this one
        const gone = (): boolean => this.over || stageGeneration !== this.stageGeneration;
        if (inventory) {
          if (generation !== this.portraitGeneration) return;
          const canvas = await this.newestPreview(renderPortrait(this.page!.renderer, model, motion, this.element.ownerDocument, true));
          if (canvas !== null && !gone()) this.inventoryWindow?.setPreview(canvas);
        } else {
          const canvas = await renderPortrait(this.page!.renderer, model, motion, this.element.ownerDocument);
          if (!gone()) this.hud?.status.setPortrait(canvas);
        }
      } finally {
        for (const item of held) { item.item.removeFromParent(); item.release(); }
        model.release();
      }
    } catch (error) {
      if (!this.over) report(messageOf(error));
    }
  }

  /**
   * The changes in view since the last call, to the views and the name tags, and what the combat and own messages
   * played to the effects and the damage numbers (`play`). The focus heard of the movers that left as their DEL_OBJ came
   * (`apply`).
   */
  private syncViews(): void {
    const world = this.world!;
    const data = this.data!;
    const changes = world.takeChanges();
    this.countDropped(changes.dropped);
    this.views!.sync(changes, world.movers);
    this.tags!.sync(changes, world.movers, (mover) => nameTagOf(mover, world.self(), data.nameColors, data.honorTitles, this.inParty));
    this.play(changes);
  }

  /**
   * Drawing events the world dropped untaken (`WorldChanges.dropped`: the page was hidden while the fight went on): counted
   * in the session's stats, and named once on the overlay, as an own inventory that could not be read is (Ruling R1).
   */
  private countDropped(dropped: number): void {
    if (dropped === 0) return;
    this.session.countDroppedEvents(dropped);
    const message = 'world: drawing events were dropped untaken (the page was hidden)';
    if (this.reported.has(message)) return;
    this.reported.add(message);
    this.page?.overlay.error(message);
  }

  /**
   * What the combat and own events show (`playCombatEvent`, `playOwnEvent`): the effects, the damage numbers once their
   * layer is up, and the movers' flashes and shakes. A message's events are played at the start of the frame after it,
   * before any rules step, so the movers are where the handler found them; a step's (a swing's hit frame: `spark`,
   * `attackerHit`) right after that step (`step`), so that its effect starts on its hit's step, as `CreateSfx` in the
   * attacker's `Process` starts it. The test hooks are told what was played (`playedSoFar`): the effects asked for, the
   * numbers added to their layer, and the swings started, with the motion each mover swings with as its event is played,
   * before any step of the frame; each with the rules steps run so far, which puts a hit frame's spark (played in its
   * step) and a DAMAGE's number (played in a frame after the message) in order.
   */
  private play(changes: WorldChanges): void {
    this.hud?.play(changes.combat, changes.own, this.own);
    for (const event of changes.own) {
      if (event.kind === 'quest') this.playQuest(event.change);
      else if (event.kind === 'speed') this.flightSpeed = event.shown; // Piece 7 M5
    }
    // Piece 7 M5: the own mover took off (MODE_FLY: the focus goes, ActionMoverMsg.cpp:1084-1089) or entered flying
    // (PLAYERBEHAVIOR2 once), or landed (the phone's Accelerate is let go)
    const flier = this.world?.self();
    for (const event of changes.combat) {
      if (event.kind !== 'flight') continue;
      if (event.flying) this.sounds?.flightMusic(event.moverId === flier?.objectId);
      if (flier === undefined || event.moverId !== flier.objectId) continue;
      if (event.flying) {
        this.focus?.select(null);
        this.tookOff = true;
      } else {
        this.flightAccelerate = undefined;
        this.flyingSeen = null;
      }
    }
    // the own death opens the revive window after its chat line (`OnMoverDeath`, DPClient.cpp:2040-2072); one before the
    // windows are up (the world still loading) leaves it to Escape
    this.reviveWindow?.play(changes.own);
    // Piece 7 M3: an own cast's start re-arms its cancel, and one begun while not standing is cancelled at once
    // (OnStateMode, DPClient.cpp:12419-12422); a hit on or by the own player cancels it (OnDamage, :1843-1846)
    const selfId = this.world?.self()?.objectId;
    for (const event of changes.combat) {
      if (event.kind === 'itemCast' && event.fresh && event.moverId === selfId) {
        this.itemCast?.started();
        if (!this.useCheck().standing) this.itemCast?.interrupt();
      } else if (event.kind === 'hit' && selfId !== undefined && (event.victimId === selfId || event.attackerId === selfId)) {
        this.itemCast?.interrupt();
      }
    }
    const sounds = this.sounds;
    const soundWorld = this.world;
    if (sounds !== null && soundWorld !== undefined) {
      const mover = (id: number): { pos: { x: number; y: number; z: number }; weapon: number | null } | undefined => {
        const m = soundWorld.movers.get(id);
        if (m === undefined) return undefined;
        const p = m.act.body.pos;
        return { pos: { x: p[0], y: p[1], z: p[2] }, weapon: soundWorld.handItem(m) };
      };
      for (const event of changes.combat) sounds.combatEvent(event, mover);
      for (const event of changes.own) sounds.ownEvent(event, this.worldId);
    }
    const effects = this.effects;
    if (effects === undefined) return;
    const world = this.world!;
    const self = world.self();
    const fxWorld: CombatFxWorld = {
      movers: world.movers, selfId: self?.objectId, gameMaster: isGameMaster(self?.added.player?.authorization ?? 0),
      focusId: this.focus?.targetId ?? null, itemProps: this.data!.itemProps, skills: this.data!.skills,
    };
    const views = this.views!;
    const played = this.playedSoFar;
    const step = this.stepsRun;
    const out: CombatFxOut = {
      effect: (request) => {
        keep(played.effects, { xi: request.xi, step });
        effects.play(request);
      },
      number: (pos, value, ownHurt) => {
        const numbers = this.numbers;
        if (numbers === undefined) return;
        numbers.add(pos, value, ownHurt);
        keep(played.numbers, { value, ownHurt, step });
      },
      flash: (moverId, direction, color) => views.flash(moverId, direction, color),
      shake: (moverId) => views.shake(moverId),
    };
    for (const event of changes.combat) {
      if (event.kind === 'swing') {
        const motion = world.movers.get(event.attackerId)?.act.motion ?? -1;
        keep(played.swings, { attackerId: event.attackerId, motion, step });
      }
      if (event.kind === 'itemCast') {
        // Piece 7 M3: CreateItemReadySfx( dwSfxObj ) at the caster, a CSfxReady that lasts while it casts (Sfx.cpp:3826-3837)
        const xi = this.data!.itemProps.get(event.itemId)?.sfxReady;
        const caster = world.movers.get(event.moverId);
        if (xi !== undefined && caster !== undefined) {
          const id = event.moverId;
          out.effect({
            xi, pos: [caster.act.body.pos[0], caster.act.body.pos[1], caster.act.body.pos[2]], followId: id,
            whileTrue: () => ((world.movers.get(id)?.stateMode ?? 0) & STATE_BASEMOTION_MODE) !== 0,
          });
        }
        continue;
      }
      playCombatEvent(event, fxWorld, out);
    }
    for (const event of changes.own) playOwnEvent(event, fxWorld, out);
  }

  /**
   * What a quest message shows (Piece 7 M1, `CDPClient::OnSetQuest` and `OnRemoveQuest`; the jingles are WorldSounds'):
   * its lines among the messages and in the chat, the text codes dropped; a time run out sends REMOVEQUEST
   * (DPClient.cpp:8444-8573); an end clears the destination (`m_vDestinationArrow`, MoverParam.cpp:3586-3590).
   */
  private playQuest(change: QuestChange): void {
    for (const line of questLines(change, this.questCatalog, this.questNames(), this.data!.texts)) {
      const text = parseDialogText(line.text).map((run) => run.text).join('');
      this.hud?.messages.add(text, line.color ?? WHITE);
      this.chatWindow?.append('system', '', text);
    }
    if (change.kind === 'progress' && timedOut(change)) this.session.sendRemoveQuest(change.after.id);
    if (change.kind === 'ended') this.worldMap?.clearDestination();
  }

  /** The names the quest rows give (`QuestNames`): movers and items by id, NPCs by their character key. */
  private questNames(): QuestNames {
    const data = this.data!;
    return {
      mover: (index) => data.movers.get(index)?.name ?? '',
      item: (id) => data.itemProps.get(id)?.name ?? '',
      npc: (key) => data.npcs.get(key.toLowerCase())?.name ?? key,
    };
  }

  /**
   * What `__IsEndQuestCondition` reads off the player (Mover.cpp:9277), from the own state: the EXP as `GetExpPercent`
   * (0.01 %, 0 at the table's top), an item's count summed over the inventory (`GetItemNum`, MoverParam.cpp:3610-3629).
   */
  private questOwner(): QuestOwner | undefined {
    const own = this.own;
    if (own === undefined) return undefined;
    let percent = 0;
    try {
      percent = expPercent(own.exp, expNeeded(this.data!.exp, own.level));
    } catch {
      // the EXP table's last level has no next one to reach
    }
    return {
      level: own.level, job: own.job, sex: this.world?.self()?.added.player?.sex ?? 0, gold: own.gold, expPercent: percent,
      skillLevel: (skill) => own.skills.find((slot) => slot.skill === skill)?.level ?? 0,
      itemCount: (item) => {
        let count = 0;
        for (const held of own.inventory?.values() ?? []) if (held.itemId === item) count += held.count;
        return count;
      },
      completed: own.completedQuests,
    };
  }

  /** The quest window's and the tracker's state, from the own quests (none before the own ADD_OBJ). */
  private questState(): QuestWindowState {
    const own = this.own;
    return {
      catalog: this.questCatalog, current: own?.quests ?? new Map(), completed: own?.completedQuests ?? [],
      checked: own?.checkedQuests ?? [], owner: this.questOwner(), dialogueOpen: this.dialog?.frame.isOpen === true,
    };
  }

  /**
   * The sounds a message plays as Neuz's handler of it does (Piece 6 M2): a ground item's drop sound and a boss's track
   * (`OnAddObj`, DPClient.cpp:1252-1259, :1293-1298), an equip (`DoEquip`, MoverEquip.cpp:1013-1041), the own pick-ups
   * (`OnCreateItem`, :2148-2156) and gold (`DST_GOLD`, MoverParam.cpp:946-947).
   */
  private messageSounds(objectId: number, value: WorldMessage, self: ReturnType<WorldState['self']>): void {
    const sounds = this.sounds;
    if (sounds === null) return;
    const at = (p: Vec3): { x: number; y: number; z: number } => ({ x: p[0], y: p[1], z: p[2] });
    if (value.type === 'addItem') {
      sounds.groundItem(at(value.item.pos), value.item.item.itemId);
    } else if (value.type === 'addMover') {
      if (!value.mover.isPlayer && self !== undefined) {
        sounds.bossAdded(at(value.mover.pos), at(self.act.body.pos), this.data!.movers.get(value.mover.index)?.rank ?? 0);
      }
    } else if (value.type === 'equipItem') {
      const mover = this.world!.movers.get(objectId);
      if (mover !== undefined) sounds.equip(at(mover.act.body.pos), this.data!.itemProps.get(value.itemId), value.equip);
    } else if (self !== undefined && objectId === self.objectId) {
      if (value.type === 'createItem') sounds.itemsCreated(at(self.act.body.pos), value.stacks.length);
      else if (value.type === 'setPointParam' && value.param === 10000) sounds.gold(); // DST_GOLD, defineAttribute.h
    }
  }

  /**
   * The listener and the music, once a rules step: `SetListener( pos, angle )` (WndWorld.cpp:8498) with the own player and
   * the camera's heading, and the music rules of CWndWorld::Process, with the land under the player for an inn region.
   */
  private stepAudio(world: WorldState): void {
    const self = world.self();
    if (self === undefined || this.audio === null) return;
    const p = self.act.body.pos;
    const pos = { x: p[0], y: p[1], z: p[2] };
    const view = this.backCamera.view;
    if (view) {
      const camera = toWebPosition(view.position); // the web mirror is its own inverse: FlyFF again
      this.audio.setListener(pos, listenerAngle({ x: camera[0], y: camera[1], z: camera[2] }, pos));
    }
    this.music?.step(pos, () => this.ground.terrainHeight(p[0], p[2]) ?? p[1]);
  }

  /** Where the own mover is (web coordinates), or where the player entered while it is not in view. */
  private ownAt(): Vec3 {
    return toWebPosition(this.world!.self()?.act.body.pos ?? this.entered);
  }

  private frame(now: number): void {
    // the Stats panel's `cpu`: this frame's own work and the rules steps run since the last one (Piece 6 M5, part B), the
    // page's script time per frame; a frame time well over it is the GPU's
    const started = performance.now();
    try {
      this.drawFrame(now);
    } finally {
      this.page!.overlay.addWork(performance.now() - started + this.simulatedMs);
      this.simulatedMs = 0;
    }
  }

  private drawFrame(now: number): void {
    // the Stats panel reads the frame's whole time (Piece 6 M5: capped, it could never show under 4 fps); the frame's
    // other uses keep the quarter-second cap
    const elapsed = Math.max(0, (now - this.lastTime) / 1000);
    const dt = Math.min(.25, elapsed);
    this.lastTime = now;
    const { overlay, renderer } = this.page!;
    overlay.frame(elapsed);
    // paused, the frame runs only the steps the test hooks asked for, and tells them once it is drawn (or has failed)
    const asked = this.paused ? this.askedSteps : null;
    const drawn = this.paused ? this.stepsDrawn.splice(0) : [];
    this.askedSteps = 0;
    try {
      const world = this.world!;
      const stage = this.stage!;
      const views = this.views!;
      this.syncViews();
      this.measureRadii(world, views);
      const steps = asked ?? 0;
      for (let i = 0; i < steps; i++) this.step(world, stage, views, now);
      views.update(world.movers, steps / STEPS_PER_SECOND);
      // the mark goes once the walk to its point is over: arrived, or ended by a key, a stop or the server
      this.mark!.follow(world.self()?.dest?.pos ?? null);

      // the ring of tiles around the visible ones downloads only once the character is on screen (Piece 6 M5, part B: not
      // part of the first load, tileStreamer.ts), and once the models in view are in: on a slow CPU its downloads, from
      // the frame after the first, doubled the time a model in view took to come. PRELOAD_WAIT_MS at most.
      if (this.stageDrawn && !this.preloadStarted) {
        this.preloadStarted = true;
        const generation = this.stageGeneration;
        const inView = Promise.all([views.settled(), this.dropModels?.settled()]);
        void Promise.race([inView, new Promise((resolve) => setTimeout(resolve, PRELOAD_WAIT_MS))]).then(() => {
          if (generation === this.stageGeneration && !this.over) stage.startPreloading();
        });
      }
      // the map around the own mover, and the chase camera of the last rules step (of now, before the first)
      stage.focus(this.ownAt());
      const view = this.backCamera.view ?? this.follow(world, stage);
      stage.setCamera(view.position, view.target);
      this.cameraPlaced = true;
      this.groundItems?.update(world.groundItems, stage.camera, this.stepsRun);
      this.tags!.update(stage.camera, renderer.getSize(drawingSize).y, (objectId) => views.placeOf(objectId));
      this.speechBubbles?.update(stage.camera, drawingSize.y, (objectId) => views.placeOf(objectId));
      this.effects?.draw(stage.camera);
      const ownView = world.self();
      this.chargeGauge?.update(this.attackLoop?.gauge(now) ?? null, ownView === undefined ? null : views.placeOf(ownView.objectId)?.head ?? null,
        stage.camera, drawingSize.x, drawingSize.y);
      this.partyBars?.update(stage.camera, this.partyBarMembers(world, (objectId) => views.placeOf(objectId)?.head ?? null),
        ownView?.objectId ?? null, drawingSize.x, drawingSize.y);
      // Piece 7 M3: the own cast's gauge, from its STATEMODE ON on the world's clock (RenderCasting: m_nReadyTime set)
      const cast = ownView?.stateMode !== undefined && (ownView.stateMode & STATE_BASEMOTION_MODE) !== 0 ? ownView.cast : null;
      const castMs = cast === null ? undefined : this.data?.itemProps.get(cast.itemId)?.castMs;
      const fill = cast === null || cast.startedAt === null || castMs === undefined || this.world === undefined
        ? null : castFill(this.world.nowMs() - cast.startedAt, castMs);
      this.castGauge?.update(fill, ownView === undefined ? null : views.placeOf(ownView.objectId)?.head ?? null,
        stage.camera, drawingSize.x, drawingSize.y);
      // Piece 7 M5: the turbo gauge over the own flier, and the phone's flight buttons
      const flying = ownView?.act.isFlying() === true;
      this.turboGauge?.update(flying ? ownView!.act.accFuel : null, flying && (ownView!.act.stateFlag & ObjStaF.TURBO) !== 0,
        this.flightSpeed, this.stepsRun, flying ? views.placeOf(ownView!.objectId)?.head ?? null : null,
        stage.camera, drawingSize.x, drawingSize.y);
      this.flightButtons?.update(flying, flying && ownView!.act.accFuel > 0);

      const { tiles, models } = stage.counts();
      overlay.setCounts({ tiles, models: models + views.count(), textures: this.services!.textures.size() });
      overlay.setMessageCounts(this.session.stats);
      stage.render();
      // the world's own draw: the screen layers and a portrait after it render too, and three.js counts each render anew
      overlay.setRenderCounts({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
      this.drawScreenLayers(world, stage, views, renderer);
      this.drawHud(world, now);
      // the world is on screen: `ready()` (a second call does nothing), and an ending from here on is a drop
      this.endingsAreDrops = true;
      this.resolveShown();
      this.stageDrawn = true;
      this.onScreenAt ??= performance.timeOrigin + performance.now();
    } catch (error) {
      // a frame that throws every frame must not fill the overlay with the same line sixty times a second; the console has
      // it too, with its stack, beside what came before it there (a lost WebGL context, errorHandlers.ts). A page that let
      // its context go on purpose as it was thrown away (`Page3d.released`) has no fault to say.
      const message = `world: ${messageOf(error)}`;
      if (message !== this.lastError && !this.page!.released) {
        overlay.error(message);
        console.warn(message, error);
      }
      this.lastError = message;
    }
    for (const { resolve } of drawn) resolve();
  }

  /** Advances rules and animation hit frames without rendering WebGL or waiting for a visible tab. */
  private simulate(steps: number, now: number): void {
    const world = this.world, stage = this.stage, views = this.views;
    if (this.over || !world || !stage || !views) return;
    const started = performance.now();
    try {
      this.syncViews(); this.measureRadii(world, views);
      catchUp(steps, this.audio ? (on) => this.audio!.hold(on) : undefined, () => this.step(world, stage, views, now));
      views.update(world.movers, steps / STEPS_PER_SECOND);
      stage.focus(this.ownAt());
    } catch (error) { this.reportOnce(`simulation: ${messageOf(error)}`, error instanceof Error ? error : new Error(String(error))); }
    // the rules steps share the page's thread with the frames: the next frame's `cpu` counts them
    this.simulatedMs += performance.now() - started;
  }

  /**
   * The test hooks' `step`: while paused, the next frame runs `steps` more rules steps; the promise resolves once that
   * frame is drawn, and rejects when the rules are not paused or the screen ends first (`end`), or for a count of steps
   * that is not a whole number from 0.
   */
  private askSteps(steps: number): Promise<void> {
    if (!Number.isInteger(steps) || steps < 0) return Promise.reject(new Error(`${steps} is not a count of steps`));
    if (!this.paused || this.over) return Promise.reject(new Error('the rules are not paused'));
    return new Promise((resolve, reject) => {
      this.askedSteps += steps;
      this.stepsDrawn.push({ resolve, reject });
    });
  }

  /**
   * One rules step at `now` (ms): the press held on a mover, a tap, the keys, the joystick and the walk key, as
   * `CWndWorld::Process` takes them (`WndWorld.cpp:8513-8537`): a move of the keys or the joystick stops the auto-attack
   * ([combat §2.6]; a press on the ground stopped it as it went down); then the attack loop's step runs `Process`'s
   * branch, and where that is `ControlPlayer` the controls drive the own mover (`OwnMover.control`, in `ControlGround`'s
   * order). The walk key is read at every step, as Neuz reads its key table (`WndWorldControlPlayer.cpp:524`): a press
   * made and let go while the attack runs is gone. Then every mover's step (the own one's included), the PLAYERCORR it
   * may have led to, what the step's hits play (`syncViews`: the effects, flashes and shakes a hit frame makes inside
   * the attacker's `Process`), the views', the effects' (`CWorld::Process` steps them with the movers, `CSfx::Process`),
   * the damage numbers' (`CDamageNumMng::Process`, `Neuz.cpp:1084`), and the chase camera's (`CWorld::Process`
   * processes the camera at each `FrameMove`, `World.cpp:924-935`).
   */
  private step(world: WorldState, stage: WorldStage, views: MoverViews, now: number): void {
    this.stepsRun++;
    this.cameraControls?.step();
    const own = world.self();
    const shopPosition = this.shopWindow?.frame.isOpen ? own?.act.body.pos : undefined;
    const loop = this.attackLoop!;
    const held = this.tap!.heldMover();
    if (held === null) loop.onReleased(now);
    else loop.onMoverHeld(held.mover, now - held.time);
    const tap = this.tap!.take();
    const walkKey = this.walkKey!.held();
    // Piece 7 M5: the world's fly (CWorld::m_bFly) from the worlds without flight
    world.worldFly = !(this.data?.noFlyWorlds.has(this.worldId) ?? false);
    if (own !== undefined && own.act.isFlying()) {
      this.stepFlight(own, world, stage, loop, now);
      return;
    }
    this.jumpRequested = this.keyboard!.takeJump() || this.jumpRequested;
    this.keyboard!.clearPressed(); // Piece 7 M5: X, Z and Tab pressed on the ground do nothing at a take-off
    const airborne = own !== undefined && (own.act.state & ObjSta.JUMP_ALL) !== 0;
    const jump = this.jumpRequested && own !== undefined && !own.act.isDie() &&
      (own.act.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL | ObjSta.DMG_ALL)) === 0 && !this.skillUse!.pending;
    if (jump || airborne || own?.act.isDie()) this.jumpRequested = false;
    if (own !== undefined) {
      // the keys' Shift no longer changes the gait: X toggles it (spec §1)
      const cameraAngle = this.backCamera.heading === null ? own.act.body.angle : 180 - this.backCamera.heading * 180 / Math.PI;
      const intent = controlIntent(this.keyboard!.intent(), this.joystick!.intent(), cameraAngle);
      if (movesOrTurns(intent) || jump || tap !== null) this.itemActions?.cancel();
      // Piece 7 M3: a walk forward or back, a jump or a tap on the ground cancels an item cast; a turn does not
      // (WndWorldControlPlayer.cpp:341, :422-433, :487-505)
      if (intent.forward !== 0 || jump || tap !== null) this.itemCast?.interrupt();
      if (movesOrTurns(intent)) loop.stop('move');
      this.itemActions?.step(now);
      // the task bar's skills, then the reserved skill's branch of Process, which leaves neither the attack nor the controls
      const skillBranch = this.skillUse!.step(own, (objectId) => world.movers.get(objectId));
      if (((jump || airborne) && !skillBranch) || loop.step(skillBranch, now)) this.ownMover!.control(own, intent, tap, walkKey, jump);
    }
    world.step();
    if (shopPosition !== undefined && own !== undefined &&
      (own.act.body.pos[0] !== shopPosition[0] || own.act.body.pos[2] !== shopPosition[2])) {
      this.shopWindow?.frame.close();
    }
    this.ownMover!.corrected(own);
    this.syncViews();
    views.step(world.movers);
    this.stepAudio(world);
    this.effects?.step((objectId) => world.movers.get(objectId)?.act.body);
    // Piece 7 M2: the missiles' tick (`CSfx::Process` of each), their hits played, and their flight models' frames
    const missiles = this.missiles;
    if (missiles !== undefined && this.missileWorld !== undefined) {
      for (const hit of missiles.step(this.missileWorld)) {
        this.effects?.play({ xi: hit.xi, pos: hit.pos, angle: hit.angle, ...(hit.scale !== undefined ? { scale: hit.scale } : {}) });
      }
      this.effects?.stepMissiles(missiles.views());
    }
    this.numbers?.step();
    this.follow(world, stage);
  }

  /**
   * Piece 7 M5: a rules step of the own flier: `ControlFlying` (`FlightControl.control`) with the keys (W, S, A, D, Space,
   * X, Z, Tab, Insert), the right drag, the phone's stick and buttons; the air attack (the attack loop's); the world's
   * step; `FlushPlayerAngle`, and PLAYERCORR2 for a collision; then the views, the sounds, the effects and the camera
   * as on the ground.
   */
  private stepFlight(own: Mover, world: WorldState, stage: WorldStage, loop: AttackLoop, now: number): void {
    // the first step of a flier that entered the world flying (no take-off seen): PLAYERBEHAVIOR2 once
    if (this.flyingSeen !== own) {
      this.flyingSeen = own;
      if (!this.tookOff) this.flightControl!.entered(own);
    }
    this.tookOff = false;
    const keys = this.keyboard!;
    const stick = flightStick(this.joystick!.intent(), this.flightStickWas);
    this.flightStickWas = stick;
    const mouse = this.flightMouse.dx !== 0 || this.flightMouse.dy !== 0 ? { ...this.flightMouse } : null;
    this.flightMouse = { dx: 0, dy: 0 };
    const input: FlightInput = {
      dive: keys.held('KeyW') || stick.dive,
      climb: keys.held('KeyS') || stick.climb,
      left: keys.held('KeyA') || stick.left,
      right: keys.held('KeyD') || stick.right,
      accelerateToggle: keys.takeJump(),
      ...(this.flightAccelerate !== undefined ? { accelerateHeld: this.flightAccelerate } : {}),
      turboToggle: keys.takePressed('KeyX') || this.flightTurbo,
      trackToggle: keys.takePressed('KeyZ'),
      nextTarget: keys.takePressed('Tab'),
      attack: keys.held('Insert') || this.flightAttack,
      mouse,
    };
    this.flightTurbo = false;
    this.jumpRequested = false;
    if (input.trackToggle) loop.toggleTracking();
    if (input.nextTarget) {
      const view = this.backCamera.view;
      const forward: Vec3 = view === null ? [0, 0, -1] : toWebPosition([
        view.target[0] - view.position[0], view.target[1] - view.position[1], view.target[2] - view.position[2],
      ]);
      loop.nextFlyTarget(forward);
    }
    loop.attackHeld = input.attack;
    loop.step(false, now);
    this.flightControl!.control(own, input, stage.ground());
    world.step();
    const flight = own.act.flight;
    if (flight?.turned) this.flightControl!.postAngle();
    this.flightControl!.flushAngle(own);
    if (own.corrReport) {
      own.corrReport = null;
      if (own.act.isFlying()) this.flightControl!.corr2(own);
    }
    this.syncViews();
    this.views?.step(world.movers);
    this.stepAudio(world);
    this.effects?.step((objectId) => world.movers.get(objectId)?.act.body);
    const missiles = this.missiles;
    if (missiles !== undefined && this.missileWorld !== undefined) {
      for (const hit of missiles.step(this.missileWorld)) {
        this.effects?.play({ xi: hit.xi, pos: hit.pos, angle: hit.angle, ...(hit.scale !== undefined ? { scale: hit.scale } : {}) });
      }
      this.effects?.stepMissiles(missiles.views());
    }
    this.numbers?.step();
    this.follow(world, stage);
  }

  /** Piece 7 M5: the Land button: the worn ride used again (`ItemUse`), which lands. */
  private landRide(): void {
    const own = this.own;
    const objectId = own?.equipmentObjectIds[PARTS_RIDE];
    if (own === undefined || objectId === undefined || own.inventory?.get(objectId) === undefined) return;
    this.itemUse?.use(objectId, 'bar');
  }

  /**
   * The damage numbers and the target corners of the frame just drawn, in CSS pixels of the canvas, through the camera as
   * the renderer drew with it. The corners go around the focus (`CWndWorld::RenderSelectObj`, `WndWorld.cpp:3002-3024`),
   * red or white (`attackMarks`), and, while auto-attacking, around the next target queued (:3041-3056).
   */
  private drawScreenLayers(world: WorldState, stage: WorldStage, views: MoverViews, renderer: WebGLRenderer): void {
    const { x: width, y: height } = renderer.getSize(drawingSize);
    this.numbers?.draw(screenProjector(stage.camera, width, height));
    const marks = this.marks;
    if (marks === undefined) return;
    const focus = this.focus!;
    const loop = this.attackLoop!;
    const rectOf = (objectId: number | null): ScreenRect | null => {
      const mover = objectId === null ? undefined : world.movers.get(objectId);
      const candidate = mover === undefined ? null : views.pickCandidate(mover.objectId);
      if (mover === undefined || candidate === null) return null;
      return focusRect(stage.camera, width, height, candidate.box, candidate.world, mover.act.body.pos);
    };
    const target = focus.targetId === null ? undefined : world.movers.get(focus.targetId);
    const attacking = target !== undefined && attackMarks(target, focus.next, loop.selectsTarget, loop.autoAttack);
    marks.show(rectOf(focus.targetId), attacking, loop.autoAttack ? rectOf(focus.next) : null);
  }

  /**
   * The windows of the frame at `now` (`Hud.frame`): the own numbers and name, and the target bar's mover, which is
   * the attack's mark (`m_pRenderTargetObj`) when there is one, else the focus (`CWndWorld::RenderSelectObj`,
   * `WndWorld.cpp:2720-2723`, called with the focus at :1058); the task bar with the own bars (empty without the own
   * numbers), the attack button, enabled while the focus is a mover the attack would take (`canAttackFocus`), and the
   * Character window while it is open, with the own numbers and the lobby's name, server and channel. After a resize or a
   * turn of the device, once the task bar is laid out for the new size, the open windows are kept on the screen
   * (`refitWindows`, spec §3.10: the windows' layer hides what is past its edges).
   */
  private drawHud(world: WorldState, now: number): void {
    const self = world.self();
    const loop = this.attackLoop!;
    const targetId = loop.renderTargetId ?? this.focus!.targetId;
    const target = targetId === null ? null : world.movers.get(targetId) ?? null;
    // Piece 7 M2: the buffs' icons, the own and the target's, on the world's clock
    const buffNow = world.nowMs();
    this.buffStatus?.update(self?.buffs.list(buffNow) ?? [], this.data!.skills, buffNow);
    this.targetBuffs?.update(target?.buffs.list(buffNow) ?? [], this.data!.skills, buffNow, this.element.clientWidth);
    const gameMaster = isGameMaster(self?.added.player?.authorization ?? 0);
    this.hud!.frame(now, this.own, self?.name ?? this.entry.character.name, target, gameMaster);
    this.taskBar!.update(this.own, this.barData());
    this.nearbyItems?.update(world.groundItems, self?.act.body.pos ?? null);
    if (this.own) this.inventoryWindow?.update(this.own);
    // the dialogue and the menu go with their NPC or when the player moves (WndWorld.cpp:8052-8081)
    const dialogNpc = this.dialog?.npcId ?? null;
    if (dialogNpc !== null && !dialogueStays(world.movers.get(dialogNpc), self)) this.dialog!.close();
    const menuNpc = this.moverMenu?.npcId ?? null;
    if (this.moverMenu?.isOpen === true &&
      (menuNpc === null ? !ownStands(self) : !dialogueStays(world.movers.get(menuNpc), self))) this.moverMenu.close();
    this.shopWindow?.update();
    this.teleporter?.update();
    if (this.worldMap?.isOpen === true) this.worldMap.update(this.mapView(), this.partyMarks(world));
    this.chatWindow?.setParty(this.party.size() > 0);
    const partyHud = this.partyHud;
    if (partyHud !== undefined && (partyHud.window.frame.isOpen || partyHud.quick.frame.isOpen)) {
      partyHud.update(this.partyView(world), loop.autoAttack);
    }
    // the mode icons, while mode 4 is on or the leader is in view (RenderBuff, WndWorld.cpp:10637-10745)
    const leader = this.party.members[0];
    partyHud?.updateIcons(this.party.modeOn(4) || (leader !== undefined && world.moverByPlayerId(leader.playerId) !== undefined));
    if (this.questTracker !== undefined || this.questWindow !== undefined) {
      const questState = this.questState();
      this.questTracker?.update(questState);
      this.questWindow?.update(questState);
    }
    if (self !== undefined) this.minimap?.update(self.act.body.pos, this.backCamera.heading ?? 0,
      [...world.movers.values()].filter(mover => !mover.isSelf && mover.hp > 0 &&
        !isGameMaster(mover.added.player?.authorization ?? 0)).map(mover => ({
        id: mover.objectId, kind: navigatorKind(mover, this.party), name: mover.name, pos: mover.act.body.pos,
      })));
    this.reviveWindow?.update(this.itemUse?.canRevive ?? false);
    if (this.resized) {
      this.resized = false;
      refitWindows(this.element.ownerDocument);
    }
    this.attackButton!.update(loop.canAttackFocus);
    const ownMover = this.world?.self();
    this.jumpButton!.update(ownMover !== undefined && !ownMover.act.isDie() &&
      (ownMover.act.state & (ObjSta.JUMP_ALL | ObjSta.DMG_ALL)) === 0 &&
      ((ownMover.act.state & ObjSta.ATK_ALL) === 0 || loop.autoAttack));
    if (this.own !== undefined && this.characterWindow?.frame.isOpen === true) this.characterWindow.update(this.own, this.entry, now);
    if (this.own !== undefined && this.skillWindow?.isOpen === true) this.skillWindow.update(this.own);
  }

  /**
   * A window of Piece 4 the task bar opens or closes (`ObjectExecutor` on its applet: the Start menu, a slot, its hotkey):
   * the status window, with own numbers to show (as T does); the Character window (`openCharacter`); the skill tree window,
   * with own numbers (`SkillWindow.toggle`, which asks first when points were placed).
   */
  private openWindow(window: TaskBarWindow): void {
    if (window === 'navigator') { this.minimap?.toggle(); return; }
    if (window === 'worldmap') {
      // ObjectExecutor does nothing while the NPC dialog is open (WndManager.cpp:2570-2576)
      if (this.dialog?.frame.isOpen === true) return;
      this.worldMap?.toggle(this.mapView());
      // the map holds the keys and the presses from here: what was held lets go (the plan's Ruling 4)
      if (this.worldMap?.isOpen === true) this.releaseControls();
      return;
    }
    if (window === 'chat') { this.chatWindow?.open(); return; }
    if (window === 'party') { this.partyHud?.toggle(); return; }
    if (window === 'quests') { this.questWindow?.toggle(this.hud?.element.clientWidth ?? 0, this.questState()); return; }
    if (window === 'option') { this.optionWindow?.toggle(); return; }
    if (window === 'inventory') {
      if (this.own) {
        this.inventoryWindow?.toggle(this.own);
        if (this.inventoryWindow?.frame.isOpen) void this.makePortrait(true);
      }
    } else if (window === 'status') {
      if (this.own !== undefined) this.hud?.status.toggle();
    } else if (window === 'character') {
      this.openCharacter();
    } else if (this.own !== undefined) {
      this.skillWindow?.toggle(this.own);
    }
  }

  /** A line of the messages window, `PutString( prj.GetText( id ), NULL, prj.GetTextColor( id ) )`: the skill use's texts. */
  private say(id: string): void {
    const entry = this.data?.texts.get(id);
    if (entry !== undefined && entry.text !== '') this.hud?.messages.add(entry.text, entry.color);
  }

  /**
   * Piece 7 M3: what `SendDoUseItem` checks of the own player for an item with a cast ([R §2]): the world, the cast,
   * standing (`GetMoveState() == OBJSTA_STAND`), flying (none before M5) and the Scroll of Return's buff.
   */
  private useCheck(): Omit<UseCheck, 'prop'> {
    const own = this.world?.self();
    const now = this.world?.nowMs() ?? 0;
    const at = own?.act.body.pos;
    return {
      worldId: this.worldId,
      casting: this.itemCast?.casting ?? false,
      standing: own === undefined || (own.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND,
      // Piece 7 M5: flying, and what a ride's use and landing look at
      flying: own !== undefined && (own.act.stateFlag & ObjStaF.FLY) !== 0,
      returnBuff: own?.buffs.list(now).some((b) => b.buffType === 0 && b.id === 10469) === true,
      level: this.own?.level ?? own?.level ?? 1,
      worldFly: !(this.data?.noFlyWorlds.has(this.worldId) ?? false),
      landAttr: at === undefined ? HAttr.NONE : this.ground.landAttr(at[0], at[2]),
      sitting: own !== undefined && (own.act.stateFlag & ObjStaF.SIT) !== 0,
      disguised: false,
    };
  }

  /** Piece 7 M3: a travel item's refusal: a line in its TID's colour (`%s` the world's title), or an OK box. */
  private sayRefusal(refusal: Refusal): void {
    const entry = this.data?.texts.get(refusal.tid);
    const text = entry?.text ?? '';
    if (refusal.kind === 'box') {
      if (text !== '' && this.messageBox?.isOpen !== true) this.messageBox?.open(text, 'ok', () => {});
      return;
    }
    if (text === '') return;
    this.hud?.messages.add(refusal.args === undefined ? text : formatText(text, [refusal.args]), entry!.color);
  }

  /**
   * The Start menu's Log out (`ObjectExecutor`'s APP_LOGOUT, `WndManager.cpp:2610-2621`): refused while the player fights
   * (`IsAttackMode`: a swing started in the last 10 s), with `TID_PK_COMBAT_END` in red among the server messages; otherwise
   * the box that asks first (`CWndLogOut`), whose OK leaves.
   */
  private logOut(): void {
    if (this.world?.self()?.act.isAttackMode() === true) {
      const refusal = this.data!.texts.get('TID_PK_COMBAT_END')?.text ?? '';
      if (refusal !== '') this.hud?.messages.add(refusal, COMBAT_END_COLOR);
      return;
    }
    this.logOutBox?.open(this.hud?.element.clientWidth ?? 0);
  }

  /**
   * Opens or closes the Character window (`APP_CHARACTER3`, H: `ObjectExecutor` creates the applet or destroys it,
   * `WndManager.cpp:2650-2700`), with own numbers to show (as T does for the status window); drawn at once, then each
   * frame (`drawHud`).
   */
  private openCharacter(): void {
    const { own, characterWindow } = this;
    if (own === undefined || characterWindow === undefined) return;
    characterWindow.toggle();
    if (characterWindow.frame.isOpen) characterWindow.update(own, this.entry, performance.now());
  }

  /** Opens the revive window, unless it is open (`CWndRevival`, Escape when dead, `WndManager.cpp:3311-3318`). */
  private openRevive(): void {
    this.reviveWindow?.open();
  }

  /**
   * A WBS_MODAL window (the revive window, the log-out box) opened or closed. While one is open the joystick, which stands
   * over the windows' layer, hides (`.world-modal`); as one opens, the Start menu closes, as `CWndTaskMenu::OnKillFocus`
   * hides it when the focus goes to another window (`WndTaskBar.cpp:2795-2799`; it stands over the backdrop), and the
   * keys, the joystick and the finger on the world let go, as when the page loses the focus (`stopOwnMover`), for the
   * presses and keys they would have had go to the window's backdrop and its key hold now. No move is sent: the player
   * stands, or is dead.
   */
  private modalChanged(): void {
    const open = this.reviveWindow?.modal.isShown === true || this.logOutBox?.modal.isShown === true ||
      this.skillWindow?.warning.modal.isShown === true || this.dialog?.modal.isShown === true ||
      this.questWindow?.modal.isShown === true || this.messageBox?.modal.isShown === true ||
      this.selectVillage?.modal.isShown === true || this.partyHud?.messageBox.modal.isShown === true;
    this.element.classList.toggle('world-modal', open);
    if (!open) return;
    this.worldMap?.close();
    this.releaseControls();
  }

  /** The keys, the joystick, the camera drag and the finger on the world let go, and the Start menu closes. */
  private releaseControls(): void {
    this.cameraControls?.reset();
    this.jumpRequested = false;
    this.taskBar?.closeMenu();
    this.keyboard?.reset();
    this.walkKey?.reset();
    this.joystick?.reset();
    this.tap?.reset();
  }

  /** What the world map draws the player from: the world, the own mover and the camera in D3D, the own name. */
  private mapView(): MapView {
    const self = this.world?.self();
    return {
      worldId: this.worldId,
      pos: self?.act.body.pos ?? this.entered,
      // the chase view is in web coordinates; the mirror is its own inverse (web z = -z)
      camera: toWebPosition(this.backCamera.view?.position ?? [0, 0, 0]),
      name: self?.name ?? this.entry.character.name,
    };
  }

  /**
   * Escape in Neuz's order (`escapeStep`, `CWndMgr::Process`, `WndManager.cpp:3295-3427`): dead, the revive window
   * (`openRevive`); the Start menu open, nothing; a target, cleared (`AttackLoop.escape`); a window Escape closes
   * (`escapeWindow`, never the status window), left to the windows' own handler, which runs after this one; else the
   * Start menu. A held key does it once. Before all that, the keys are a modal window's while one is open (the revive
   * window, the log-out box, the skill points' box; WBS_MODAL: `CNeuzApp::MsgProc` takes none, `Neuz/Neuz.cpp:1253-1309`)
   * and the stat points' confirm box's while it is open (`CNeuzApp::KillWindow`, :1262, :1323): their own handlers take
   * Escape. While the task bar carries a shortcut (a drag, a skill a finger picked), the window and menu steps do nothing
   * (`if( CWndBase::m_GlobalShortcut.IsEmpty() )`, `WndManager.cpp:3383`).
   */
  private readonly onEscape = (event: KeyboardEvent): void => {
    if (this.chatWindow?.typing || this.dropBox !== undefined) return;
    if (this.worldMap?.isOpen === true) return; // the map's own key hold closes it, and Escape does nothing else
    // the NPC's menu and the dialogue take Escape themselves (plan decision 4)
    if (this.moverMenu?.isOpen === true || this.dialog?.frame.isOpen === true) return;
    const { taskBar, attackLoop, focus } = this;
    if (event.key !== 'Escape' || event.repeat || taskBar === undefined || attackLoop === undefined || focus === undefined) {
      return;
    }
    if (
      this.reviveWindow?.isOpen === true || this.logOutBox?.isOpen === true || this.characterWindow?.confirm.isOpen === true ||
      this.skillWindow?.warning.isOpen === true || this.messageBox?.isOpen === true || this.selectVillage?.isOpen === true
    ) {
      return;
    }
    const self = this.world?.self();
    const step = escapeStep({
      dead: self !== undefined && isDie(self),
      menuOpen: taskBar.menuOpen,
      target: focus.next !== null || focus.targetId !== null,
      window: escapeWindow(this.element.ownerDocument) !== undefined,
    });
    if (step === 'window' && !taskBar.carrying) return;
    event.preventDefault();
    if ((step === 'window' || step === 'menu') && taskBar.carrying) return;
    if (step === 'revive') this.openRevive();
    else if (step === 'target') attackLoop.escape();
    else if (step === 'menu') taskBar.openMenu();
  };

  /**
   * `CObj::GetRadius` (`objRadius`) of the own mover and of the movers its attack is about (the focus and the one it
   * follows), from the boxes of their models as drawn (a held weapon's included), for `IsRangeObj`'s arrival; a mover
   * whose model is still loading stays as it was (0 at first). The others' stay unknown (0), as in Piece 3. Once a frame,
   * and only while there is such a mover: the boxes are made anew at each `pickCandidates`.
   */
  private measureRadii(world: WorldState, views: MoverViews): void {
    const own = world.self();
    if (own === undefined) return;
    const target = this.focus?.targetId, toward = own.dest?.targetId;
    if ((target === null || target === undefined) && (toward === null || toward === undefined)) return;
    // the candidates of these alone, not every view's (Piece 6 M5, part B: this runs every frame while focused)
    this.measureRadius(world, views, own.objectId);
    if (target !== null && target !== undefined) this.measureRadius(world, views, target);
    if (toward !== null && toward !== undefined && toward !== target) this.measureRadius(world, views, toward);
  }

  private measureRadius(world: WorldState, views: MoverViews, objectId: number): void {
    const candidate = views.pickCandidate(objectId);
    const mover = world.movers.get(objectId);
    if (candidate !== null && mover !== undefined) mover.radius = objRadius(candidate.box, mover.added.scale);
  }

  /**
   * The chase camera behind the own mover (or where the player entered, while it is not in view), kept out of the
   * stage's land and objects and eased back out after a hit (`BackCamera`).
   */
  private follow(world: WorldState, stage: WorldStage): ChaseView {
    const own = world.self();
    // Piece 7 M5: the flight camera, and its field of view (CBackCamera in flight, CWorld::Projection)
    if (own !== undefined && own.act.isFlying()) {
      const flag = own.act.stateFlag;
      const view = this.backCamera.followFlight(
        this.ownAt(), own.act.body.angle, own.act.angleX, (flag & ObjStaF.ACC) !== 0, (flag & ObjStaF.TURBO) !== 0, stage.ground(),
      );
      if (stage.camera.fov !== view.fov) {
        stage.camera.fov = view.fov;
        stage.camera.updateProjectionMatrix();
      }
      this.wasFlying = true;
      return view;
    }
    if (this.wasFlying) {
      this.wasFlying = false;
      stage.camera.fov = GROUND_FOV;
      stage.camera.updateProjectionMatrix();
    }
    return this.backCamera.follow(this.ownAt(), own?.act.body.angle ?? 0, stage.ground());
  }

  /**
   * What a press at (`ndcX`, `ndcY`) lands on (`pickOnStage`, from the camera as last drawn): a mover, which the press
   * hands to the attack loop to select (`CWndWorld::SelectObj`, `WndWorld.cpp:6353-6386`) and maybe attack, the player
   * walking nowhere; or the D3D point the own mover walks to, which leaves the focus as it is (`:6361-6383`).
   */
  private pick(ndcX: number, ndcY: number): TapHit | null {
    const { stage, views } = this;
    if (stage === undefined || views === undefined || !this.cameraPlaced) return null;
    return pickOnStage(stage, views, this.world?.self(), ndcX, ndcY);
  }

  /**
   * Where the middle of a mover's box is on the drawing, as shares of its width and height from the top left (`testHooks`);
   * null for a mover not drawn, and before the first frame has placed the camera.
   */
  private screenOf(objectId: number): [number, number] | null {
    if (!this.cameraPlaced) return null;
    const candidate = this.views?.pickCandidates(undefined).find((c) => c.objectId === objectId);
    const camera = this.stage?.camera;
    if (candidate === undefined || camera === undefined) return null;
    const { min, max } = candidate.box;
    const middle: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const ndc = new Vector3(...toWebPosition(transformCoord(middle, candidate.world))).project(camera);
    return [(ndc.x + 1) / 2, (1 - ndc.y) / 2];
  }

  /**
   * `CMover::IsLive` (`Mover.h:1222`) of the mover `objectId`: not in a dead state, or with HP left (`isLive`). The
   * focus asks it of a mover still in view: the world screen tells the attack loop of a DEL_OBJ before the world drops
   * the mover (`apply`). One not in view counts as live.
   */
  private isLive(objectId: number): boolean {
    const mover = this.world?.movers.get(objectId);
    return mover === undefined || isLive(mover);
  }

  /**
   * A press on an NPC (`CWndWorld::OnLButtonDown`, WndWorld.cpp:7063-7078; `ShowMoverMenu`, :6517-6710): its idle sound;
   * within MENU_RANGE the player stops, and its sole entry runs or its menu opens at the right and top of its bound rect;
   * farther, the player walks up to it and nothing opens on arrival.
   */
  private pressNpc(id: number): void {
    const world = this.world!, npc = world.movers.get(id)!, own = world.self();
    this.attackLoop!.stop('move');
    this.focus!.select(id);
    this.sounds?.moverClicked(npc.added.index);
    if (own === undefined || own.act.isDie() || npc.act.isDie()) return;
    const distance = npc.act.body.pos.reduce((sum, value, axis) => sum + (value - own.act.body.pos[axis]!) ** 2, 0);
    if (distance >= MENU_RANGE * MENU_RANGE) {
      this.attackLoop!.walkTo(id);
      return;
    }
    this.stopOwnMover();
    const data = this.data!.npcs.get(npc.added.npc!.characterKey.toLowerCase());
    // the base job is the Vagrant's (CMover::IsBaseJob)
    const entries = npcMenuEntries(data, this.data!.texts, (this.own?.job ?? 0) === 0);
    const sole = soleEntry(data, entries);
    if (sole !== null) {
      this.chooseNpcEntry(id, sole);
      return;
    }
    const at = this.menuPoint(id);
    if (at === null || entries.length === 0) return;
    this.moverMenu!.open(entries, at, (entry) => this.chooseNpcEntry(id, entry), id);
  }

  /**
   * Piece 7 M4: a player's menu (`CWndWorld::ShowMoverMenu`, WndWorld.cpp:6517-6709; `OnRButtonUp`, :7114-7131): the
   * auto-attack off and the player the focus; within 20 m the menu opens (the walk cleared), farther the player walks to it.
   */
  private pressPlayer(id: number): void {
    const world = this.world!, player = world.movers.get(id), own = world.self();
    if (player === undefined || own === undefined || own.act.isDie()) return;
    this.attackLoop!.stop('move');
    this.focus!.select(id);
    if (!menuInReach(own.act.body.pos, player.act.body.pos)) {
      this.attackLoop!.walkTo(id);
      return;
    }
    this.stopOwnMover();
    const at = this.menuPoint(id);
    if (at === null) return;
    this.moverMenu!.open(playerMenuEntries(this.data!.texts), at, (entry) => this.choosePlayerEntry(id, entry));
  }

  /** Invite (`OnCommand` MMI_INVITE_PARTY, :5639-5644, `InviteParty`, :11237-11266): the focus a player, the party's rule. */
  private choosePlayerEntry(id: number, entry: number): void {
    const player = this.world?.movers.get(id)?.added.player;
    if (entry !== MMI_INVITE_PARTY || player === undefined || this.focus?.targetId !== id) return;
    const check = inviteCheck(this.party, this.entry.character.playerId);
    if ('send' in check) this.session.sendPartyMemberRequest(player.playerId);
    else if ('box' in check) this.partyHud?.handle([{ kind: 'box', tid: check.box }]);
    // in FULLPARTY1's colour (WndWorld.cpp:11255-11258)
    else this.partyHud?.handle([{ kind: 'line', tid: check.line, args: [], color: this.data?.texts.get('TID_GAME_FULLPARTY1')?.color ?? null }]);
  }

  private readonly inParty = (playerId: number): boolean => this.party.isMember(playerId);

  /** Piece 7 M4: the party skills' and the modes' effects (`partyEffects`), told to the test hooks as the fight's are. */
  private playPartyEffects(value: WorldMessage, events: readonly PartyEvent[]): void {
    const effects = this.effects, world = this.world;
    if (effects === undefined || world === undefined) return;
    const inputs: Array<Parameters<typeof partyEffects>[0]> = [];
    if (value.type === 'partySkillCall' || value.type === 'partySkillBlitz' || value.type === 'partySkillRetreat'
      || value.type === 'partySkillSphereCircle') inputs.push(value);
    for (const event of events) if (event.kind === 'modeOn' || event.kind === 'modeOff') inputs.push(event);
    if (inputs.length === 0) return;
    const context = this.partyEffectContext(world);
    for (const input of inputs) {
      for (const request of partyEffects(input, context)) {
        keep(this.playedSoFar.effects, { xi: request.xi, step: this.stepsRun });
        effects.play(request);
      }
    }
  }

  /** What the party's effects read of the world: the movers in view by player id, their models' tops, the catalog. */
  private partyEffectContext(world: WorldState): PartyEffectContext {
    const views = this.views;
    // `IsSit()`: the state's move part is OBJSTA_SIT (ActionMover.h)
    const sitting = (mover: Mover): boolean => (mover.act.state & ObjSta.MOVE_ALL) === ObjSta.SIT;
    const of = (mover: Mover | undefined): PartyMover | null => {
      if (mover === undefined) return null;
      const scale = mover.added.scale;
      const place = views?.placeOf(mover.objectId);
      const height = place === null || place === undefined || scale === 0 ? 0 : (place.head[1] - place.at[1]) / scale;
      const [x, y, z] = mover.act.body.pos;
      return { objectId: mover.objectId, pos: [x, y, z], height, scale, sitting: sitting(mover) };
    };
    const own = world.self();
    const leaderSlot = this.party.members[0];
    const members = this.party.members.map((slot) => of(world.moverByPlayerId(slot.playerId))).filter((m): m is PartyMover => m !== null);
    return {
      own: of(own),
      isLeader: this.party.isLeader(this.entry.character.playerId),
      leader: leaderSlot === undefined ? null : of(world.moverByPlayerId(leaderSlot.playerId)),
      members,
      mover: (objectId) => of(world.movers.get(objectId)),
      skill: (id) => {
        const row = this.partyCatalog?.skills.find((s) => s.id === id);
        return row === undefined ? undefined : { sfx: row.sfx, sfx2: row.sfx2 };
      },
      restingOn: () => this.party.modeOn(2),
      sits: (objectId) => {
        const mover = this.world?.movers.get(objectId);
        return mover !== undefined && sitting(mover);
      },
    };
  }

  /** The task bar's catalogs: the game data's, and the party skills (made once, when both are in). */
  private taskBarData: TaskBarData | undefined;
  private barData(): TaskBarData {
    this.taskBarData ??= { ...this.data!, partySkills: new Map((this.partyCatalog?.skills ?? []).map((skill) => [skill.id, skill])) };
    return this.taskBarData;
  }

  /** The members changed: every name tag's colour again (`COLOR_PARTY`). */
  private recolorTags(): void {
    const world = this.world, data = this.data;
    if (world === undefined || data === undefined) return;
    this.tags?.recolor(world.movers, (mover) => nameTagOf(mover, world.self(), data.nameColors, data.honorTitles, this.inParty));
  }

  /** What the party windows draw: each member from its mover in view, else from the player data (queried once). */
  private partyView(world: WorldState): PartyView {
    const jobs = this.data!.jobs;
    const members = this.party.members.map((slot): MemberView => {
      const mover = world.moverByPlayerId(slot.playerId);
      if (mover !== undefined) {
        const job = mover.added.player?.job ?? 0;
        return {
          playerId: slot.playerId, inView: true, removed: slot.removed, level: mover.level, job, jobName: jobs[job]?.title ?? '',
          name: mover.name, hp: mover.hp, maxHp: mover.maxHp ?? 0,
        };
      }
      const data = this.playerData.get(slot.playerId);
      return {
        playerId: slot.playerId, inView: false, removed: slot.removed, level: data.level, job: data.job, jobName: jobs[data.job]?.title ?? '',
        name: data.name, hp: 0, maxHp: 0,
      };
    });
    return { party: this.party, ownPlayerId: this.entry.character.playerId, members, exp: this.partyCatalog?.exp ?? [], catalog: this.partyCatalog };
  }

  /** The members in view but oneself whose model is drawn, for their HP bars (`CWndWorld::OnEraseBkgnd`, :1009-1031). */
  private partyBarMembers(world: WorldState, headOf: (objectId: number) => Vec3 | null): PartyHpMember[] {
    if (this.party.size() === 0) return [];
    const bars: PartyHpMember[] = [];
    for (const slot of this.party.members) {
      const mover = world.moverByPlayerId(slot.playerId);
      const head = mover === undefined || mover.isSelf ? null : headOf(mover.objectId);
      if (mover !== undefined && head !== null) bars.push({ objectId: mover.objectId, head, hp: mover.hp, maxHp: mover.maxHp ?? 0 });
    }
    return bars;
  }

  /** The world map's party marks (`RenderWorldMap`, WorldMap.cpp:806-821). */
  private partyMarks(world: WorldState): Array<{ pos: Vec3; name: string }> {
    if (this.party.size() === 0) return [];
    return partyMapMarks(this.party, this.entry.character.playerId, (playerId) => world.moverByPlayerId(playerId)?.act.body.pos ?? null, this.playerData);
  }

  /** The right and top of the NPC's bound rect (`GetBoundRect`, WndWorld.cpp:2661-2701), in the HUD layer's pixels. */
  private menuPoint(id: number): { x: number; y: number } | null {
    const mover = this.world?.movers.get(id), candidate = this.views?.pickCandidate(id), stage = this.stage;
    if (mover === undefined || candidate == null || stage === undefined || this.page === undefined || this.hud === undefined) return null;
    const { x: width, y: height } = this.page.renderer.getSize(drawingSize);
    const rect = focusRect(stage.camera, width, height, candidate.box, candidate.world, mover.act.body.pos);
    if (rect === null) return null;
    const canvas = this.page.renderer.domElement.getBoundingClientRect(), layer = this.hud.element.getBoundingClientRect();
    return { x: canvas.left - layer.left + rect.right, y: canvas.top - layer.top + rect.top };
  }

  /** `CWndWorld::OnCommand` for an NPC's entry: Dialog (:5163-5177), Trade (:5251-5386), Teleport (:5949-5969). */
  private chooseNpcEntry(id: number, entry: number): void {
    const npc = this.world?.movers.get(id);
    if (npc === undefined || npc.kind !== 'npc') return;
    const data = this.data!.npcs.get(npc.added.npc!.characterKey.toLowerCase());
    if (entry === MMI.DIALOG) {
      // refused within 3 s of a drop, or with a shop open (:5164-5171)
      if (performance.now() - this.lastDropAt < DROP_GUARD_MS || this.shopWindow?.frame.isOpen === true) return;
      this.inventoryWindow?.frame.close(); // OnInitialUpdate destroys the inventory (WndDialog.cpp:280-285)
      this.dialog!.open(id, data, this.hud!.element.clientWidth);
      this.session.sendNpcDialogOpen(id);
      this.sounds?.npcDialog(npc.added.npc!.characterKey);
    } else if (entry === MMI.TRADE && !data?.vendorType && this.canTalk(id)) {
      this.dialog?.close();
      this.shopWindow!.open(id, npc.name, data);
    } else if (entry === MMI.TELEPORTER && data !== undefined) {
      this.dialog?.close();
      this.teleporter!.open(id, data);
    }
  }

  /** A RUNSCRIPTFUNC for the player (`CDPClient::OnRunScriptFunc`, DPClient.cpp:14265-14476). */
  private npcScript(action: NpcAction): void {
    switch (action.kind) {
      case 'initStat':
        this.own?.initStat(action.stat, action.remainGP);
        return;
      case 'queryName':
        this.reportOnce(`npc: the ${action.of === 'player' ? 'rename' : 'guild name'} window is not in the browser`,
          new Error(`QUERYSET${action.of === 'player' ? 'PLAYER' : 'GUILD'}NAME`));
        return;
      case 'navigator':
      case 'removeNavigator':
        return; // never sent by V15
      default:
        this.dialog?.receive(action);
    }
  }

  /** MAX_LEN_MOVER_MENU is a squared distance of 1024 in the native server's script handler. */
  private canTalk(id: number): boolean {
    const npc = this.world?.movers.get(id), own = this.world?.self();
    if (!npc || npc.kind !== 'npc' || !own || own.act.isDie() || npc.act.isDie()) return false;
    return npc.act.body.pos.reduce((sum, value, axis) => sum + (value - own.act.body.pos[axis]!) ** 2, 0) <= 1024;
  }

  /** Release held controls when hidden; the simulation clock keeps toggled combat running. */
  private readonly onVisibility = (): void => {
    if (this.element.ownerDocument.visibilityState !== 'hidden') return;
    this.stopOwnMover();
  };

  private readonly onBlur = (): void => this.stopOwnMover();

  private readonly onContextMenu = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input,textarea,[contenteditable="true"]')) return;
    event.preventDefault();
  };

  /**
   * The keys as the world gets them, for the skill use's `m_SkillTimerStop`: any key going down
   * (`CWndWorld::OnKeyDown`, `WndWorld.cpp:7756`) and any let go (`OnKeyUp`, :7734).
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.chatWindow?.typing || this.dropBox !== undefined) return;
    if (event.key === 'Enter' && !event.repeat && !(event.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]')) {
      event.preventDefault(); this.chatWindow?.open(); return;
    }
    this.skillUse?.keyDown();
  };
  private readonly onKeyUp = (): void => this.skillUse?.keyUp();

  /**
   * A resize or a turn of the device: the next frame keeps the open windows on the screen (`drawHud`). Turned upright, the
   * landscape cover is up over the world (`isUpright`, landscape.ts) and the game under it is inert: a finger held on the
   * joystick or on the world may never be seen to lift, so both let go now, and the player stops at the next step as at a
   * lifted finger. The keys stay: a PC's cover leaves them to the player, and the fight goes on (Review Focus 5).
   */
  private readonly onResize = (): void => {
    this.resized = true;
    this.page?.overlay.setCompact(this.element.ownerDocument.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true);
    if (isUpright(this.element.ownerDocument.defaultView ?? window)) {
      this.cameraControls?.reset();
      this.joystick?.reset();
      this.tap?.reset();
    }
  };

  /**
   * Release controls immediately on blur: key/finger releases may never arrive. This prevents stuck movement,
   * including if the browser later freezes the page. A walk to a tapped point ends too; toggled combat stays enabled
   * and continues through the simulation clock.
   */
  private stopOwnMover(): void {
    this.keyboard?.reset();
    this.walkKey?.reset();
    this.joystick?.reset();
    this.tap?.reset();
    this.cameraControls?.reset();
    this.jumpRequested = false;
    this.ownMover?.stop(this.world?.self());
  }

  /** Says an error on the overlay, and in the console with its stack, once for each message. */
  private reportOnce(message: string, error: unknown): void {
    if (this.reported.has(message)) return;
    this.reported.add(message);
    console.error(message, error);
    this.page?.overlay.error(message);
  }

  private fail(error: unknown): void {
    if (this.over) return;
    const ending = endingOf(error);
    // an ending with its own text says all there is; anything else is a bug, logged for whoever looks into it
    if (ending === UNEXPECTED_PROBLEM) console.error('the world screen failed:', error);
    this.end(ending);
  }

  /** Dispose world-owned resources while leaving the cache session and page renderer available. */
  private disposeWorld(): void {
    this.audio?.stopWorld(); // travel and leaving stop the world's sounds (Piece 6 design §3.3)
    this.optionWindow?.dispose();
    this.optionWindow = undefined;
    this.stageGeneration++;
    this.portraitGeneration++;
    // the next world's stage is drawn anew and starts its own ring (`onScreenAt` stays the first world's)
    this.stageDrawn = false;
    this.preloadStarted = false;
    this.stopOwnMover();
    this.itemActions?.cancel();
    this.element.classList.remove('world-modal', 'world-menu-open');
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    clearTimeout(this.loadTimer);
    this.page?.renderer.setAnimationLoop(null);
    this.simulationClock?.dispose();
    const doc = this.element.ownerDocument;
    doc.removeEventListener('visibilitychange', this.onVisibility);
    (doc.defaultView ?? window).removeEventListener('blur', this.onBlur);
    (doc.defaultView ?? window).removeEventListener('resize', this.onResize);
    (doc.defaultView ?? window).removeEventListener('keydown', this.onEscape, true);
    (doc.defaultView ?? window).removeEventListener('keydown', this.onKeyDown);
    (doc.defaultView ?? window).removeEventListener('keyup', this.onKeyUp);
    this.taskBar?.dispose();
    this.attackButton?.dispose();
    this.jumpButton?.dispose();
    this.cameraControls?.dispose();
    this.keyboard?.dispose();
    this.walkKey?.dispose();
    this.joystick?.dispose();
    this.tap?.dispose();
    this.mark?.dispose();
    this.views?.dispose();
    this.tags?.dispose();
    this.speechBubbles?.dispose();
    this.effectRenderer?.dispose();
    this.effectTextures?.dispose();
    this.effectModels?.dispose();
    this.missiles?.dispose(); // the world they flew in is gone: nothing is reported
    this.missiles = undefined;
    this.missileWorld = undefined;
    if (this.world !== undefined) this.world.missiles = null;
    this.chargeGauge?.dispose();
    this.chargeGauge = undefined;
    this.partyBars?.dispose();
    this.partyBars = undefined;
    // Piece 7 M3: the cast's gauge and the Scroll of Return's windows go with the world; its ready effect went with the effects
    this.castGauge?.dispose();
    // Piece 7 M5: the flight's pieces, and what they held
    this.turboGauge?.dispose();
    this.turboGauge = undefined;
    this.flightButtons?.dispose();
    this.flightButtons = undefined;
    this.flightAccelerate = undefined;
    this.flightTurbo = false;
    this.flightAttack = false;
    this.flightMouse = { dx: 0, dy: 0 };
    this.flyingSeen = null;
    this.tookOff = false;
    this.wasFlying = false;
    this.messageBox?.dispose();
    this.selectVillage?.dispose();
    this.buffStatus?.dispose();
    this.buffStatus = undefined;
    this.targetBuffs?.dispose();
    this.targetBuffs = undefined;
    for (const layer of this.spriteLayers.splice(0)) layer.dispose();
    this.logOutBox?.dispose();
    this.characterWindow?.dispose();
    this.skillWindow?.dispose();
    this.reviveWindow?.dispose();
    this.inventoryWindow?.dispose();
    if (this.over) { this.chatWindow?.dispose(); this.chatWindow = undefined; }
    else this.chatWindow?.close();
    this.moverMenu?.dispose(); this.dialog?.dispose(); this.shopWindow?.dispose();
    this.partyHud?.dispose();
    this.groundItems?.dispose();
    this.dropModels = undefined; // the ground items' own, disposed with them
    this.nearbyItems?.dispose();
    this.minimap?.dispose();
    if (this.worldMap !== undefined) this.worldMapMonsters = this.worldMap.monsterInfo;
    this.worldMap?.dispose();
    this.questWindow?.dispose();
    this.questTracker?.dispose();
    this.teleporter?.dispose();
    this.hud?.dispose();
    this.sheetPictures = [];
    this.stage?.dispose();
    this.backCamera = new BackCamera();
    this.cameraPlaced = false;
    this.jumpRequested = false;
    this.paused = false;
    this.askedSteps = 0;
    for (const { reject } of this.stepsDrawn.splice(0)) reject(new Error('the world changed'));
    for (const key of ['world', 'own', 'stage', 'views', 'tags', 'speechBubbles', 'keyboard', 'walkKey', 'joystick', 'tap',
      'focus', 'attackLoop', 'skillUse', 'mark', 'effects', 'effectRenderer', 'effectTextures', 'numbers', 'marks',
      'hud', 'hudArt', 'taskBar', 'attackButton', 'cameraControls', 'jumpButton', 'logOutBox', 'reviveWindow',
      'characterWindow', 'skillWindow', 'inventoryWindow', 'moverMenu', 'dialog', 'shopWindow', 'itemUse',
      'itemActions', 'groundItems', 'nearbyItems', 'ownMover', 'simulationClock', 'minimap', 'teleporter', 'worldMap',
      'questWindow', 'questTracker', 'itemCast', 'castGauge', 'messageBox', 'selectVillage', 'returnScroll', 'partyHud'] as const) this[key] = undefined;
  }

  /** Closes the connections and everything on screen, once, then tells the lobby. */
  private end(message: string | undefined): void {
    if (this.over) return;
    this.over = true;
    this.teardown(message);
    this.onEnd(message);
  }

  /** Everything the screen holds, closed and taken off the page. */
  private teardown(message: string | undefined): void {
    this.session.leave();
    this.releaseBrowserGestures();
    this.stopAsking();
    this.disposeWorld();
    this.page?.holder.remove();
    this.element.remove();
    this.unregister();
    for (const { reject } of this.stepsDrawn.splice(0)) reject(new Error('the world screen ended'));
    this.rejectShown(new Error(message ?? 'the player left the world'));
  }

  /**
   * The session dropped on its own after the world was shown, or in the world a reconnect enters (Piece 6 M3, the plan's
   * rulings 1-2, and the final review): the rules, the sounds and every late event stop here, the controls let go, the
   * windows close, and the last picture (or the loading text) stays behind the drop box. The lobby gets the kept login (`onDrop`), and the screen drops the hash from its entry, which the session and
   * its JOIN shared. `close` takes the frozen world away for good, without `onEnd`: the lobby goes on from there.
   */
  private drop(message: string): void {
    if (this.over) return;
    this.over = true;
    const entry = this.entry;
    const kept: KeptLogin = {
      account: entry.account, passwordHash: entry.passwordHash, serverId: entry.serverId, channelId: entry.channelId,
      playerId: entry.character.playerId,
    };
    entry.passwordHash = '';
    this.session.leave();
    this.releaseControls();
    this.moverMenu?.close();
    for (const window of [this.shopWindow, this.dialog, this.teleporter, this.inventoryWindow, this.characterWindow,
      this.skillWindow, this.optionWindow, this.messageBox, this.selectVillage]) window?.frame.close();
    this.worldMap?.close();
    this.audio?.stopWorld();
    this.stopAsking(); // nothing is left to lose by closing the page
    const doc = this.element.ownerDocument;
    // a drop while a new world loads has no HUD: the box takes its pictures from the store
    const art: UiArt = this.hudArt ?? { url: (key) => this.services?.store.url(key) ?? '', sheets: null };
    // the next world's HUD is built before its tiles and models are in, and stays off the page until then: the box goes
    // on the screen itself then, over the loading text, whose Leave would do nothing now
    const layer = this.hud?.element.parentElement === this.element ? this.hud.element : this.element;
    this.leaveButton.hidden = true;
    const box = new DropBox(art, doc);
    layer.append(box.element);
    this.dropBox = box;
    const dropped: DroppedWorld = {
      message,
      kept,
      box: (state) => box.show(state, layer.clientWidth),
      onReconnect: () => {},
      onBack: () => {},
      close: () => {
        box.dispose();
        this.dropBox = undefined;
        this.teardown(message);
      },
    };
    box.onReconnect = () => dropped.onReconnect();
    box.onBack = () => dropped.onBack();
    this.onDrop!(dropped);
  }
}
