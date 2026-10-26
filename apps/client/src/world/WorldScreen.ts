// The world screen (spec §3.2, §3.5): "Entering the world…" while the session enters, then the world in 3D with its
// movers and their name tags, the joystick, a Leave button and the measurement overlay. It wires the parts together:
// the session's bundles go into `WorldState` as they come; once the world is on screen the frame loop runs the rules'
// 60 steps a second, the keys, the joystick and a tap on the world (spec §3.7) driving the own mover as
// `CWndWorld::ControlGround` does and its moves sent as Neuz sends them, and the presses on a mover selecting and
// attacking it (`AttackLoop`, Piece 4 §3.4); and it draws the stage around the own mover, from the chase camera behind
// it, with the mark of the point a tap sends it to, the effects and damage numbers of the fight, and the corners around
// the target (Piece 4 §3.7). Every ending closes everything and hands the lobby its message (Ruling 8): nothing that goes
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
import { WARM_UP_EFFECTS, isGameMaster, playCombatEvent, playOwnEvent } from './fx/combatEffects';
import type { CombatFxOut, CombatFxWorld } from './fx/combatEffects';
import { EffectManager } from './fx/EffectManager';
import { GameDataMissingError } from './gameData';
import type { GameData } from './gameData';
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
import { SpriteLayer } from './render/SpriteLayer';
import { TargetMarks, attackMarks, focusRect } from './render/TargetMarks';
import type { ScreenRect } from './render/TargetMarks';
import { HAttr } from './sim/collision';
import { transformCoord } from './sim/d3dx';
import { FixedStepper, STEPS_PER_SECOND } from './sim/stepper';
import { WorldSession } from './WorldSession';
import type { WorldEvent } from './WorldSession';
import { WorldState, isLive } from './WorldState';
import type { WorldChanges } from './WorldState';

const LOADING_TEXT = 'Entering the world…';
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
  private readonly shown: Promise<void>;
  private resolveShown!: () => void;
  private rejectShown!: (error: Error) => void;

  /**
   * Opens the world screen over `root` for `entry` and starts entering. `onEnd` is called once, when the world is over:
   * with the text to show, or undefined after Leave. Never throws.
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
    // Leave is there from the start, so that a loading screen that hangs has a way out
    this.leaveButton = h('button', { type: 'button', class: 'world-leave' }, 'Leave');
    this.leaveButton.addEventListener('click', () => this.leave());
    this.element = h('div', { class: 'world' }, h('p', { class: 'world-status', role: 'status' }, LOADING_TEXT), this.leaveButton);
    root.append(this.element);
    this.unregister = registerWorld({
      ready: () => this.shown,
      movers: () => [...(this.world?.movers.values() ?? [])].map((m) => ({ objectId: m.objectId, name: m.name, pos: [...m.act.body.pos] })),
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

  /** Leave (spec §3.2.7): both connections close, and the lobby comes back with no message. */
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
      (key) => loadMotion(services, key), loadHeldItems(services, data), data.itemProps,
    );
    this.tags = new NameTagLayer(stage.scene, this.element.ownerDocument);
    this.startEffects(stage, services);
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
   * The glyph sheets of the damage numbers and the target corners (`data/uiSheets.json`, `WebUiSheets`), or null when
   * they cannot be had (game files converted before the UI stage, or a failed download): the world goes on without the
   * numbers and the corners, and the overlay says why.
   */
  private async loadSheets(services: SceneServices): Promise<WebUiSheets | null> {
    try {
      return await services.store.json<WebUiSheets>(UI_SHEETS_KEY);
    } catch (error) {
      this.reportOnce(`ui sheets: ${messageOf(error)}`, error);
      return null;
    }
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

  /** The world is ready to be seen: the map, the layers of numbers and corners over it, the controls, and the frame loop. */
  private showWorld(sheets: WebUiSheets | null): void {
    const { holder, renderer } = this.page!;
    const doc = this.element.ownerDocument;
    this.element.replaceChildren(holder, ...this.screenLayers(doc, sheets), this.leaveButton);
    this.keyboard = new KeyboardInput(doc.defaultView ?? window);
    this.walkKey = new WalkKey(doc.defaultView ?? window);
    this.joystick = new Joystick(this.element);
    this.focus = new Focus(this.session, (objectId) => this.isLive(objectId));
    const attackLoop = new AttackLoop(
      this.session, this.focus, this.world!, () => this.own, this.entry.clock, this.data!.movers,
    );
    this.attackLoop = attackLoop;
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
    (doc.defaultView ?? window).addEventListener('blur', this.onBlur);
    this.lastTime = performance.now();
    renderer.setAnimationLoop((now) => this.frame(now));
    this.resolveShown();
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
    this.views!.sync(changes, world.movers);
    this.tags!.sync(changes, world.movers, (mover) => nameTagOf(mover, world.self(), data.nameColors, data.honorTitles));
    this.play(changes);
  }

  /**
   * What the combat and own events show (`playCombatEvent`, `playOwnEvent`): the effects, and the damage numbers once
   * their layer is up. They are played at the start of the frame after their message, before any rules step, so the
   * movers are where the handler found them; a swing's hit frame (`attackerHit`) comes from the rules' step, and plays at
   * the frame after it.
   */
  private play(changes: WorldChanges): void {
    const effects = this.effects;
    if (effects === undefined) return;
    const world = this.world!;
    const self = world.self();
    const fxWorld: CombatFxWorld = {
      movers: world.movers, selfId: self?.objectId, gameMaster: isGameMaster(self?.added.player?.authorization ?? 0),
      focusId: this.focus?.targetId ?? null, itemProps: this.data!.itemProps,
    };
    const out: CombatFxOut = {
      effect: (request) => effects.play(request),
      number: (pos, value, ownHurt) => this.numbers?.add(pos, value, ownHurt),
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
      this.tags!.update(stage.camera, renderer.getSize(drawingSize).y, (objectId) => views.placeOf(objectId));
      this.effects?.draw(stage.camera);

      const { tiles, models } = stage.counts();
      overlay.setCounts({ tiles, models: models + views.count(), textures: this.services!.textures.size() });
      overlay.setMessageCounts(this.session.stats);
      stage.render();
      this.drawScreenLayers(world, stage, views, renderer);
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
   * may have led to, the views', the effects' (`CWorld::Process` steps them with the movers, `CSfx::Process`), the damage
   * numbers' (`CDamageNumMng::Process`, `Neuz.cpp:1084`), and the chase camera's (`CWorld::Process` processes the camera
   * at each `FrameMove`, `World.cpp:924-935`).
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
    if (stage === undefined || views === undefined) return null;
    return pickOnStage(stage, views, this.world?.self(), ndcX, ndcY);
  }

  /** Where the middle of a mover's box is on the drawing, as shares of its width and height from the top left (`testHooks`). */
  private screenOf(objectId: number): [number, number] | null {
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
    this.stage?.dispose();
    this.page?.holder.remove();
    this.element.remove();
    this.unregister();
    this.rejectShown(new Error(message ?? 'the player left the world'));
    this.onEnd(message);
  }
}
