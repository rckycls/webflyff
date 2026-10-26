// The world screen (spec §3.2, §3.5): "Entering the world…" with a Leave button while the session enters, then the world in
// 3D with its movers and their name tags, the joystick and the measurement overlay. It wires the parts together:
// the session's bundles go into `WorldState` as they come; once the world is on screen the frame loop runs the rules'
// 60 steps a second, the keys, the joystick and a tap on the world (spec §3.7) driving the own mover as
// `CWndWorld::ControlGround` does and its moves sent as Neuz sends them, and the presses on a mover selecting and
// attacking it (`AttackLoop`, Piece 4 §3.4); and it draws the stage around the own mover, from the chase camera behind
// it, with the mark of the point a tap sends it to, the effects and damage numbers of the fight, and the corners around
// the target (Piece 4 §3.7), and over it Neuz's windows: the status window, the target bar, the server messages and the
// caption (`Hud`, Piece 4 §3.9), the task bar with its Start menu, whose Log out asks first (`LogOutBox`) and then leaves
// as the loading screen's Leave does (`TaskBar`), the attack button of a touch screen (`AttackButton`), and Escape in
// Neuz's order (`escapeStep`). Every ending closes everything and hands the lobby its message (Ruling 8): nothing that goes
// wrong here is thrown at the lobby.

import { UI_SHEETS_KEY, toWebPosition } from '@flyffweb/formats';
import type { Vec3, WebEffect, WebUiSheet, WebUiSheets } from '@flyffweb/formats';
import type { AddedMover, BundleMessage, WorldMessage } from '@flyffweb/protocol';
import {
  EffectRenderer, Joystick, KeyboardInput, WorldStage, effectTextureProvider, loadGltf, loopMotion, neuzRandom,
} from '@flyffweb/scene';
import type { EffectTextureProvider, Ground, LoopedMotion, SceneServices } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import { Vector2, Vector3 } from 'three';
import { UNEXPECTED_PROBLEM } from '../lobby/errorText';
import type { WorldEntry } from '../lobby/LoginFlow';
import { h } from '../lobby/views/dom';
import type { OpenChannel } from '../net/PacketChannel';
import { registerWorld } from '../testHooks';
import { BackCamera } from './backCamera';
import type { ChaseView } from './backCamera';
import { AttackLoop, objRadius } from './combat/attackLoop';
import { Focus } from './combat/focus';
import { TapToWalk, WalkKey, controlIntent, movesOrTurns } from './controls';
import { isGameMaster } from './authorization';
import { WARM_UP_EFFECTS, playCombatEvent, playOwnEvent } from './fx/combatEffects';
import type { CombatFxOut, CombatFxWorld } from './fx/combatEffects';
import { EffectManager } from './fx/EffectManager';
import { GameDataMissingError } from './gameData';
import type { GameData } from './gameData';
import { AttackButton } from './hud/attackButton';
import { escapeWindow } from './hud/frame';
import type { UiArt } from './hud/art';
import { Hud } from './hud/hud';
import { escapeStep } from './hud/escape';
import { LogOutBox } from './hud/logOutBox';
import { TaskBar } from './hud/taskBar';
import type { TaskBarWindow } from './hud/taskBar';
import { OwnMover, pickOnStage } from './ownMover';
import { OwnState } from './OwnState';
import { NoWebGLError, page3d, sceneAssets } from './page3d';
import type { Page3d } from './page3d';
import { DamageNumbers, screenProjector } from './render/DamageNumbers';
import { MoverViews } from './render/MoverViews';
import { NameTagLayer } from './render/NameTagLayer';
import { lookOf } from './render/looks';
import { MoveMark } from './render/moveMark';
import { loadHeldItems, loadMoverModel } from './render/moverModels';
import { nameTagOf } from './render/nameTags';
import type { TapHit } from './render/picking';
import { renderPortrait } from './render/portrait';
import { SpriteLayer } from './render/SpriteLayer';
import { TargetMarks, attackMarks, focusRect } from './render/TargetMarks';
import type { ScreenRect } from './render/TargetMarks';
import { HAttr } from './sim/collision';
import { Mti } from './sim/constants';
import { transformCoord } from './sim/d3dx';
import { FixedStepper, STEPS_PER_SECOND } from './sim/stepper';
import { WorldSession } from './WorldSession';
import type { WorldEvent } from './WorldSession';
import { WorldState, isDie, isLive } from './WorldState';
import type { WorldChanges } from './WorldState';

const LOADING_TEXT = 'Entering the world…';
/** The joystick's height over the bottom, as Piece 3's: the task bar's 48 px and 8 more. */
const JOYSTICK_BOTTOM = 56;
/** `PutString( prj.GetText( TID_PK_COMBAT_END ), NULL, 0xffff0000 )` (`WndManager.cpp:2615`): red, not the text's colour. */
const COMBAT_END_COLOR = 0xffff0000;
const NOT_AVAILABLE_TEXT = "This map isn't available in the browser yet.";
const NO_WEBGL_TEXT = "This browser can't show the 3D world (WebGL is off or not supported).";
const OUT_OF_DATE_TEXT = 'The game files on the server are out of date.';
const TOO_SLOW_TEXT = 'The game files took too long to load. Check the connection and try again.';
/** How long the map around the player and the models in view may take to load before the entry gives up. */
const LOAD_LIMIT_MS = 60_000;
/** The tiles shown around the player: 3 x 3, as the viewer's world view by default. */
const RADIUS = 1;

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

export class WorldScreen {
  private readonly session: WorldSession;
  private readonly element: HTMLElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly unregister: () => void;
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
  /**
   * The world the rules move the movers in (D3D x, z): the stage's (`WorldStage.ground`: the land of its tiles and
   * their objects' collision shapes) once the stage is open; no land and nothing in the way before.
   */
  private readonly ground: Ground = {
    terrainHeight: (x, z) => this.stage?.ground().terrainHeight(x, z) ?? null,
    landAttr: (x, z) => this.stage?.ground().landAttr(x, z) ?? HAttr.NONE,
    objectsNear: (x, z, range) => this.stage?.ground().objectsNear(x, z, range) ?? [],
    landTri: (x, z, out) => this.stage?.ground().landTri?.(x, z, out) ?? false,
  };
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
  private mark: MoveMark | undefined;
  /** The effects by `XI_*` id (`CreateSfx`), the renderer that draws them on the stage, and the textures it draws with. */
  private effects: EffectManager | undefined;
  private effectRenderer: EffectRenderer | undefined;
  private effectTextures: EffectTextureProvider | undefined;
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
  private logOutBox: LogOutBox | undefined;
  /** The own character's driving: the controls each rules step, the moves sent, the stop. */
  private ownMover: OwnMover | undefined;
  /** The own character's numbers (`ownState`). */
  private own: OwnState | undefined;
  /** The chase camera behind the own mover, which follows it once a rules step. */
  private readonly backCamera = new BackCamera();
  private readonly stepper = new FixedStepper();
  private paused = false;
  private lastTime = 0;
  /** The page was hidden: the next frame owes nothing for the time it was away. */
  private away = false;
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
   * with the text to show, or undefined after Leave or Log out. Never throws.
   */
  static open(root: HTMLElement, entry: WorldEntry, open: OpenChannel, onEnd: (message: string | undefined) => void): WorldScreen {
    return new WorldScreen(root, entry, open, onEnd);
  }

  private constructor(
    root: HTMLElement,
    private readonly entry: WorldEntry,
    open: OpenChannel,
    private readonly onEnd: (message: string | undefined) => void,
  ) {
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
    this.unregister = registerWorld({
      ready: () => this.shown,
      movers: () => [...(this.world?.movers.values() ?? [])].map((m) => ({
        objectId: m.objectId, name: m.name, pos: [...m.act.body.pos], hp: m.hp,
      })),
      own: () => {
        const own = this.own;
        return own === undefined ? null : { hp: own.hp, level: own.level, actionPoint: own.taskBar?.actionPoint ?? null };
      },
      stats: () => ({ ...this.session.stats, errors: this.page?.overlay.snapshot().errors ?? [] }),
      camera: () => toWebPosition(this.backCamera.view?.position ?? [0, 0, 0]),
      pause: () => {
        this.paused = true;
        this.views?.freeze();
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
      for (const event of this.waiting.splice(0)) this.handle(event);
    } catch (error) {
      this.fail(error);
    }
  }

  private onEvent(event: WorldEvent): void {
    if (this.over) return;
    if (event.type === 'ended') this.end(event.message);
    else if (this.data === undefined) this.waiting.push(event);
    else this.handle(event);
  }

  private handle(event: WorldEvent): void {
    // an ending while the waiting events are handled (the map is not available) ends the ones after it too
    if (this.over) return;
    if (event.type === 'entered') {
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
    if (added !== undefined) this.own = new OwnState(this.data!, added, this.entry.character.equipment);
    const inventoryError = this.own?.inventoryError ?? null;
    if (inventoryError !== null) this.page?.overlay.error(`own inventory: ${inventoryError}`);
    // the rules stand the movers on the stage's land and objects once their tiles are in (`ground`)
    this.world = new WorldState(this.data!, this.entry.clock, this.ground, this.own);
    this.entered = pos;
    this.apply(messages, true);
    void this.openStage(folder, services).catch((error: unknown) => this.fail(error));
  }

  /**
   * A bundle's messages, in order, to the movers in view and the own numbers (`WorldState`); `joining` for the JOIN's.
   * SETPOS ends with `InitInterpolation` (`CDPClient::OnSetPos`, `DPClient.cpp:2270`): the mover is drawn where it is
   * put. A REPLACE within the world (another world has ended the session) puts the own mover there as SETPOS does; the
   * frame loop then streams the map there and moves the camera. QUERYGETDESTOBJ is the attack loop's, and so are the
   * focus and the attack when a mover in view dies (`AttackLoop.onMoverDeath`, `OnMoverDeath`) or leaves
   * (`AttackLoop.onRemoved`, `CWorld::Process`, `World.cpp:883-893`): told before the world puts the mover in its dead
   * state or drops it, so that the focus released is as live as Neuz finds it (`IsLive`, the SETTARGET with 1 of a
   * live target only, `World.cpp:310`).
   */
  private apply(messages: BundleMessage<WorldMessage>[], joining = false): void {
    const world = this.world!;
    for (const { objectId, value } of messages) {
      const self = world.self();
      if (value.type === 'replace') {
        if (self === undefined) continue;
        world.apply(self.objectId, { type: 'setPos', pos: value.pos });
        this.views?.snap(self.objectId);
        continue;
      }
      if (value.type === 'queryGetDestObj') {
        this.attackLoop?.onQueryGetDestObj(value.fromId);
        continue;
      }
      if (world.movers.has(objectId)) {
        if (value.type === 'moverDeath') this.attackLoop?.onMoverDeath(objectId, value.attackerId);
        else if (value.type === 'delObj') this.attackLoop?.onRemoved(objectId);
      }
      world.apply(objectId, value, joining);
      if (value.type === 'setPos') this.views?.snap(objectId);
    }
  }

  private async openStage(folder: string, services: SceneServices): Promise<void> {
    const stage = await WorldStage.open(folder, services, RADIUS);
    if (this.over) {
      stage.dispose();
      return;
    }
    this.stage = stage;
    const { overlay } = this.page!;
    const data = this.data!;
    // the own character is dressed, and armed, from the character list's item ids (`lookOf`); what the hands hold picks
    // each player's weapon set of its motions in combat, from the item catalog
    const equipment = this.entry.character.equipment;
    this.views = new MoverViews(
      stage.scene, loadMoverModel(services), overlay, (mover) => lookOf(mover, data, equipment),
      (key) => loadMotion(services, key), loadHeldItems(services, data), data.itemProps, { moverProps: data.movers },
    );
    this.tags = new NameTagLayer(stage.scene, this.element.ownerDocument);
    this.startEffects(stage, services);
    this.startHud(services);
    this.syncViews();
    // the objects' collision shapes come with the tiles from here on, and `ready` waits for them
    stage.ground();
    stage.focus(this.ownAt());
    // a download that stalls must not hold the loading screen for good
    const late = new Promise<'late'>((resolve) => {
      this.loadTimer = setTimeout(() => resolve('late'), LOAD_LIMIT_MS);
    });
    const loaded = await Promise.race([Promise.all([stage.ready(), this.views.settled(), this.loadSheets(services)]), late]);
    clearTimeout(this.loadTimer);
    if (this.over) return;
    if (loaded === 'late') this.end(TOO_SLOW_TEXT);
    else this.showWorld(loaded[2]);
  }

  /**
   * The effects (spec §3.7): the manager plays them by `XI_*` id on the stage, with the page's texture cache, and says on
   * the overlay what it cannot play. The milestone's effects (`WARM_UP_EFFECTS`) start loading now, files and textures,
   * so that the first hit's spark is not lost to its download.
   */
  private startEffects(stage: WorldStage, services: SceneServices): void {
    const overlay = this.page!.overlay;
    const textures = effectTextureProvider(services.textures);
    const renderer = new EffectRenderer(stage.scene, (key) => textures.get(key));
    this.effectTextures = textures;
    this.effectRenderer = renderer;
    // a file that fails after the screen has ended is not this entry's to say: the overlay is the page's
    const report = (message: string): void => {
      if (!this.over) overlay.error(message);
    };
    const effects = new EffectManager(this.data!, (key) => services.store.json<WebEffect>(key), renderer, neuzRandom, report);
    this.effects = effects;
    for (const xi of WARM_UP_EFFECTS) effects.preload(xi, (key) => void textures.get(key));
  }

  /**
   * The on-screen windows (`Hud`), drawn with the UI stage's pictures from the asset store: one the asset index lacks
   * (game files converted before the UI stage) is drawn as nothing, and named once on the overlay (spec §4). The glyph
   * sheets come with the world (`showWorld`).
   */
  private startHud(services: SceneServices): void {
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
  }

  /**
   * The glyph sheets of the damage numbers and the target corners (`data/uiSheets.json`, `WebUiSheets`), or null when
   * they cannot be had (game files converted before the UI stage, or a failed download): the world goes on without the
   * numbers and the corners, and the overlay says why. Their pictures are downloaded and decoded too, as the effects are
   * warmed up (`startEffects`): a number lasts under a second, and its first one must not be drawn blank while its
   * picture comes. A picture that cannot be had is said once; its layer tries again as it draws.
   */
  private async loadSheets(services: SceneServices): Promise<WebUiSheets | null> {
    let sheets: WebUiSheets;
    try {
      sheets = await services.store.json<WebUiSheets>(UI_SHEETS_KEY);
    } catch (error) {
      this.reportOnce(`ui sheets: ${messageOf(error)}`, error);
      return null;
    }
    await Promise.all([sheets.targetCorners, sheets.damageDigits].map(async ({ image }) => {
      const url = services.store.url(image);
      if (url === null) return; // `screenLayers` says so
      const picture = new (this.element.ownerDocument.defaultView ?? window).Image();
      picture.src = url;
      this.sheetPictures.push(picture);
      try {
        await picture.decode();
      } catch (error) {
        this.reportOnce(`ui sheets: ${image} could not be decoded`, error);
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
    this.keyboard = new KeyboardInput(view);
    this.walkKey = new WalkKey(view);
    // above the task bar (48 px, smaller on a narrow screen) and out of the safe area under it
    this.joystick = new Joystick(this.element, { bottom: `calc(env(safe-area-inset-bottom, 0px) + ${JOYSTICK_BOTTOM}px)` });
    this.focus = new Focus(this.session, (objectId) => this.isLive(objectId));
    const attackLoop = new AttackLoop(
      this.session, this.focus, this.world!, () => this.own, this.entry.clock, this.data!.movers,
    );
    this.attackLoop = attackLoop;
    this.taskBar = new TaskBar(this.hudArt!, {
      open: (window) => this.openWindow(window),
      logOut: () => this.logOut(),
      // the slots' items are used in Piece 5, their skills in milestone 2
      useSlot: () => {},
      useActionSlot: () => {},
    }, doc);
    // the Start menu opens where the joystick stands, which is over the windows' layer: it hides while the menu is open
    this.taskBar.onMenuChange = (open) => this.element.classList.toggle('world-menu-open', open);
    this.attackButton = new AttackButton(() => attackLoop.attackButton(), doc);
    this.logOutBox = new LogOutBox(this.hudArt!, this.data!.texts, () => this.leave(), doc);
    this.hud!.element.append(this.taskBar.element, this.attackButton.element, this.logOutBox.frame.element);
    // before the windows' own Escape (frame.ts), which closes a window only if this one leaves the key to it
    view.addEventListener('keydown', this.onEscape, true);
    // on the canvas: the joystick is an element of its own over it, and its touches never reach it; each press goes to
    // the attack loop as it goes down (OnLButtonDown, OnLButtonDblClk): on a mover, or on the ground, which stops it
    this.tap = new TapToWalk(
      renderer.domElement, (x, y) => this.pick(x, y), (error) => this.reportOnce(`tap: ${messageOf(error)}`, error),
      (press) => {
        if (press.mover === null) attackLoop.onGroundPressed(press.double);
        else attackLoop.onMoverPressed(press.mover, press.time, press.double);
      },
    );
    this.mark = new MoveMark(this.stage!.scene);
    this.ownMover = new OwnMover(this.session, this.entry.clock, this.mark);
    doc.addEventListener('visibilitychange', this.onVisibility);
    view.addEventListener('blur', this.onBlur);
    this.lastTime = performance.now();
    // `ready()` resolves at the end of the first frame (`frame`), once the camera is placed and the world drawn
    renderer.setAnimationLoop((now) => this.frame(now));
    void this.makePortrait();
  }

  /**
   * The face of the status window (`renderPortrait`): the own look, loaded for it alone, in the first frame of its standing
   * motion, drawn once with the page's renderer and let go. What cannot be had leaves the face box empty, said once.
   */
  private async makePortrait(): Promise<void> {
    const self = this.world?.self();
    const services = this.services!;
    const data = this.data!;
    const look = self === undefined ? null : lookOf(self, data, this.entry.character.equipment);
    if (look === null) return;
    const report = (message: string): void => this.reportOnce(`portrait: ${message}`, new Error(message));
    try {
      const model = await loadMoverModel(services)(look, report);
      try {
        const key = look.motion(Mti.STAND);
        const motion = key === null ? null : await loadMotion(services, key);
        if (this.over) return;
        this.hud?.status.setPortrait(renderPortrait(this.page!.renderer, model, motion, this.element.ownerDocument));
      } finally {
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
    this.tags!.sync(changes, world.movers, (mover) => nameTagOf(mover, world.self(), data.nameColors, data.honorTitles));
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
   * attacker's `Process` starts it.
   */
  private play(changes: WorldChanges): void {
    this.hud?.play(changes.combat, changes.own, this.own);
    const effects = this.effects;
    if (effects === undefined) return;
    const world = this.world!;
    const self = world.self();
    const fxWorld: CombatFxWorld = {
      movers: world.movers, selfId: self?.objectId, gameMaster: isGameMaster(self?.added.player?.authorization ?? 0),
      focusId: this.focus?.targetId ?? null, itemProps: this.data!.itemProps,
    };
    const views = this.views!;
    const out: CombatFxOut = {
      effect: (request) => effects.play(request),
      number: (pos, value, ownHurt) => this.numbers?.add(pos, value, ownHurt),
      flash: (moverId, direction) => views.flash(moverId, direction),
      shake: (moverId) => views.shake(moverId),
    };
    for (const event of changes.combat) playCombatEvent(event, fxWorld, out);
    for (const event of changes.own) playOwnEvent(event, fxWorld, out);
  }

  /** Where the own mover is (web coordinates), or where the player entered while it is not in view. */
  private ownAt(): Vec3 {
    return toWebPosition(this.world!.self()?.act.body.pos ?? this.entered);
  }

  private frame(now: number): void {
    // the first frame after the page was hidden owes nothing for the time it was away: no steps replay it
    const dt = this.away ? 0 : (now - this.lastTime) / 1000;
    this.away = false;
    this.lastTime = now;
    const { overlay, renderer } = this.page!;
    overlay.frame(dt);
    try {
      const world = this.world!;
      const stage = this.stage!;
      const views = this.views!;
      this.syncViews();
      this.measureRadii(world, views);
      const steps = this.paused ? 0 : this.stepper.advance(dt);
      for (let i = 0; i < steps; i++) this.step(world, stage, views, now);
      views.update(world.movers, steps / STEPS_PER_SECOND);
      // the mark goes once the walk to its point is over: arrived, or ended by a key, a stop or the server
      this.mark!.follow(world.self()?.dest?.pos ?? null);

      // the map around the own mover, and the chase camera of the last rules step (of now, before the first)
      stage.focus(this.ownAt());
      const view = this.backCamera.view ?? this.follow(world, stage);
      stage.setCamera(view.position, view.target);
      this.cameraPlaced = true;
      this.tags!.update(stage.camera, renderer.getSize(drawingSize).y, (objectId) => views.placeOf(objectId));
      this.effects?.draw(stage.camera);

      const { tiles, models } = stage.counts();
      overlay.setCounts({ tiles, models: models + views.count(), textures: this.services!.textures.size() });
      overlay.setMessageCounts(this.session.stats);
      stage.render();
      this.drawScreenLayers(world, stage, views, renderer);
      this.drawHud(world, now);
      // the world is on screen: `ready()` (a second call does nothing)
      this.resolveShown();
    } catch (error) {
      // a frame that throws every frame must not fill the overlay with the same line sixty times a second
      const message = `world: ${messageOf(error)}`;
      if (message !== this.lastError) overlay.error(message);
      this.lastError = message;
    }
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
    const own = world.self();
    const loop = this.attackLoop!;
    const held = this.tap!.heldMover();
    if (held === null) loop.onReleased();
    else loop.onMoverHeld(held.mover, now - held.time);
    const tap = this.tap!.take();
    const walkKey = this.walkKey!.held();
    if (own !== undefined) {
      // the keys' Shift no longer changes the gait: X toggles it (spec §1)
      const intent = controlIntent(this.keyboard!.intent(), this.joystick!.intent());
      if (movesOrTurns(intent)) loop.stop('move');
      if (loop.step()) this.ownMover!.control(own, intent, tap, walkKey);
    }
    world.step();
    this.ownMover!.corrected(own);
    this.syncViews();
    views.step(world.movers);
    this.effects?.step((objectId) => world.movers.get(objectId)?.act.body);
    this.numbers?.step();
    this.follow(world, stage);
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
   * numbers), and the attack button, enabled while the focus is a mover the attack would take (`canAttackFocus`).
   */
  private drawHud(world: WorldState, now: number): void {
    const self = world.self();
    const loop = this.attackLoop!;
    const targetId = loop.renderTargetId ?? this.focus!.targetId;
    const target = targetId === null ? null : world.movers.get(targetId) ?? null;
    const gameMaster = isGameMaster(self?.added.player?.authorization ?? 0);
    this.hud!.frame(now, this.own, self?.name ?? this.entry.character.name, target, gameMaster);
    this.taskBar!.update(this.own, this.data!);
    this.attackButton!.update(loop.canAttackFocus);
  }

  /**
   * A window of Piece 4 the task bar opens or closes (`ObjectExecutor` on its applet: the Start menu, a slot, its hotkey):
   * the status window, with own numbers to show (as T does); the Character window (`openCharacter`); the skill window is
   * milestone 2's.
   */
  private openWindow(window: TaskBarWindow): void {
    if (window === 'status') {
      if (this.own !== undefined) this.hud?.status.toggle();
    } else if (window === 'character') {
      this.openCharacter();
    }
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

  /** Opens or closes the Character window (`APP_CHARACTER3`, H). Task 24 builds it: until then, nothing. */
  private openCharacter(): void {}

  /** Opens the revive window, unless it is open (`CWndRevival`, Escape when dead). Task 24 builds it: until then, nothing. */
  private openRevive(): void {}

  /**
   * Escape in Neuz's order (`escapeStep`, `CWndMgr::Process`, `WndManager.cpp:3295-3427`): dead, the revive window
   * (`openRevive`); the Start menu open, nothing; a target, cleared (`AttackLoop.escape`); a window Escape closes
   * (`escapeWindow`, never the status window), left to the windows' own handler, which runs after this one; else the
   * Start menu. A held key does it once.
   */
  private readonly onEscape = (event: KeyboardEvent): void => {
    const { taskBar, attackLoop, focus } = this;
    if (event.key !== 'Escape' || event.repeat || taskBar === undefined || attackLoop === undefined || focus === undefined) {
      return;
    }
    const self = this.world?.self();
    const step = escapeStep({
      dead: self !== undefined && isDie(self),
      menuOpen: taskBar.menuOpen,
      target: focus.next !== null || focus.targetId !== null,
      window: escapeWindow(this.element.ownerDocument) !== undefined,
    });
    if (step === 'window') return;
    event.preventDefault();
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
    const about = [this.focus?.targetId, own.dest?.targetId].filter((id): id is number => id !== null && id !== undefined);
    if (about.length === 0) return;
    for (const candidate of views.pickCandidates(undefined)) {
      if (candidate.objectId !== own.objectId && !about.includes(candidate.objectId)) continue;
      const mover = world.movers.get(candidate.objectId);
      if (mover !== undefined) mover.radius = objRadius(candidate.box, mover.added.scale);
    }
  }

  /**
   * The chase camera behind the own mover (or where the player entered, while it is not in view), kept out of the
   * stage's land and objects and eased back out after a hit (`BackCamera`).
   */
  private follow(world: WorldState, stage: WorldStage): ChaseView {
    return this.backCamera.follow(this.ownAt(), world.self()?.act.body.angle ?? 0, stage.ground());
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

  /** The page is hidden (another tab, the home screen, a phone going to sleep): no frame runs until it shows again. */
  private readonly onVisibility = (): void => {
    if (this.element.ownerDocument.visibilityState !== 'hidden') return;
    this.away = true;
    this.stopOwnMover();
  };

  private readonly onBlur = (): void => this.stopOwnMover();

  /**
   * The page lost the focus or is hidden: a key's or the finger's let-go may never come, and a hidden page runs no frame
   * to send a stop. The server's copy of the player would run on, and once it is 1000 units from where the player
   * stands the server takes none of the player's moves (`CDPSrvr::OnPlayerMoved`, `DPSrvr.cpp:12524-12529`). So the
   * controls let go and the player stops now, its moves sent from here rather than from the frame loop
   * (`OwnMover.stop`: a walk to a tapped point ends too), and a tap not yet taken is dropped.
   */
  private stopOwnMover(): void {
    this.keyboard?.reset();
    this.walkKey?.reset();
    this.joystick?.reset();
    this.tap?.reset();
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

  /** Closes the connections and everything on screen, once, then tells the lobby. */
  private end(message: string | undefined): void {
    if (this.over) return;
    this.over = true;
    this.session.leave();
    clearTimeout(this.loadTimer);
    this.page?.renderer.setAnimationLoop(null);
    const doc = this.element.ownerDocument;
    doc.removeEventListener('visibilitychange', this.onVisibility);
    (doc.defaultView ?? window).removeEventListener('blur', this.onBlur);
    (doc.defaultView ?? window).removeEventListener('keydown', this.onEscape, true);
    this.taskBar?.dispose();
    this.attackButton?.dispose();
    this.keyboard?.dispose();
    this.walkKey?.dispose();
    this.joystick?.dispose();
    this.tap?.dispose();
    this.mark?.dispose();
    this.views?.dispose();
    this.tags?.dispose();
    this.effectRenderer?.dispose();
    this.effectTextures?.dispose();
    for (const layer of this.spriteLayers) layer.dispose();
    if (this.logOutBox?.isOpen === true) this.logOutBox.frame.close();
    this.hud?.dispose();
    this.sheetPictures = [];
    this.stage?.dispose();
    this.page?.holder.remove();
    this.element.remove();
    this.unregister();
    this.rejectShown(new Error(message ?? 'the player left the world'));
    this.onEnd(message);
  }
}
