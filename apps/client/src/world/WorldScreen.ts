// The world screen (spec §3.2, §3.5): "Entering the world…" while the session enters, then the world in 3D with its
// movers and their name tags, the joystick, a Leave button and the measurement overlay. It wires the parts together:
// the session's bundles go into `WorldState` as they come; once the world is on screen the frame loop runs the rules'
// 60 steps a second, the keys and the joystick driving the own mover as `CWndWorld::ControlGround` does and its moves
// sent as Neuz sends them; and it draws the stage around the own mover, from the chase camera behind it. Every ending
// closes everything and hands the lobby its message (Ruling 8): nothing that goes wrong here is thrown at the lobby.

import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { BundleMessage, WorldMessage } from '@flyffweb/protocol';
import { CHASE_PITCH, Joystick, KeyboardInput, WorldStage, chaseCamera, combineIntents, loadGltf, loopMotion } from '@flyffweb/scene';
import type { LoopedMotion, SceneServices } from '@flyffweb/scene';
import { Vector2 } from 'three';
import { UNEXPECTED_PROBLEM } from '../lobby/errorText';
import type { WorldEntry } from '../lobby/LoginFlow';
import { h } from '../lobby/views/dom';
import type { OpenChannel } from '../net/PacketChannel';
import { registerWorld } from '../testHooks';
import { STANDING, desiredFrom, driveOwnMover, movedReport } from './controls';
import type { Desired } from './controls';
import { GameDataMissingError } from './gameData';
import type { GameData } from './gameData';
import { NoWebGLError, page3d, sceneAssets } from './page3d';
import type { Page3d } from './page3d';
import { MoverViews } from './render/MoverViews';
import { NameTagLayer } from './render/NameTagLayer';
import { lookOf } from './render/looks';
import { loadMoverModel } from './render/moverModels';
import { nameTagOf } from './render/nameTags';
import type { ActionMover } from './sim/ActionMover';
import { FixedStepper, STEPS_PER_SECOND } from './sim/stepper';
import { WorldSession } from './WorldSession';
import type { WorldEvent } from './WorldSession';
import { WorldState } from './WorldState';

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
  private views: MoverViews | undefined;
  private tags: NameTagLayer | undefined;
  private keyboard: KeyboardInput | undefined;
  private joystick: Joystick | undefined;
  /** What the controls asked for at the last step, which the joystick's sectors hold on to (`desiredFrom`). */
  private desired: Desired = STANDING;
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
      pause: () => {
        this.paused = true;
        this.views?.freeze();
      },
    });
    void this.start();
  }

  /** Leave (spec §3.2.7): both connections close, and the lobby comes back with no message. */
  leave(): void {
    this.end(undefined);
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

  /** The JOIN bundle: the world (spec §3.2.5, a converted one or the session ends), the movers in view, then the map. */
  private enter(worldId: number, pos: Vec3, messages: BundleMessage<WorldMessage>[]): void {
    const services = this.services!;
    const folder = this.data!.worlds.get(worldId);
    if (folder === undefined || services.store.url(`worlds/${folder}/manifest.json`) === null) {
      this.end(NOT_AVAILABLE_TEXT);
      return;
    }
    // the rules stand the movers on the terrain once its tile is in (`groundAt` is in D3D x, z; web z is -z)
    this.world = new WorldState(this.data!, this.entry.clock, (x, z) => this.stage?.heightAt([x, 0, 0 - z]) ?? null);
    this.entered = pos;
    this.apply(messages);
    void this.openStage(folder, services).catch((error: unknown) => this.fail(error));
  }

  /**
   * A bundle's messages, in order, to the movers in view. SETPOS ends with `InitInterpolation` (`CDPClient::OnSetPos`,
   * `DPClient.cpp:2270`): the mover is drawn where it is put. A REPLACE within the world (another world has ended the
   * session) puts the own mover there as SETPOS does; the frame loop then streams the map there and moves the camera.
   */
  private apply(messages: BundleMessage<WorldMessage>[]): void {
    const world = this.world!;
    for (const { objectId, value } of messages) {
      const self = world.self();
      if (value.type === 'replace') {
        if (self === undefined) continue;
        world.apply(self.objectId, { type: 'setPos', pos: value.pos });
        this.views?.snap(self.objectId);
        continue;
      }
      world.apply(objectId, value);
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
    const equipment = this.entry.character.equipment;
    this.views = new MoverViews(
      stage.scene, loadMoverModel(services), overlay, (mover) => lookOf(mover, data, equipment),
      (key) => loadMotion(services, key),
    );
    this.tags = new NameTagLayer(stage.scene, this.element.ownerDocument);
    this.syncViews();
    stage.focus(this.ownAt());
    // a download that stalls must not hold the loading screen for good
    const late = new Promise<'late'>((resolve) => {
      this.loadTimer = setTimeout(() => resolve('late'), LOAD_LIMIT_MS);
    });
    const loaded = await Promise.race([Promise.all([stage.ready(), this.views.settled()]), late]);
    clearTimeout(this.loadTimer);
    if (this.over) return;
    if (loaded === 'late') this.end(TOO_SLOW_TEXT);
    else this.showWorld();
  }

  /** The world is ready to be seen: the map, the controls, and the frame loop. */
  private showWorld(): void {
    const { holder, renderer } = this.page!;
    const doc = this.element.ownerDocument;
    this.element.replaceChildren(holder, this.leaveButton);
    this.keyboard = new KeyboardInput(doc.defaultView ?? window);
    this.joystick = new Joystick(this.element);
    doc.addEventListener('visibilitychange', this.onVisibility);
    (doc.defaultView ?? window).addEventListener('blur', this.onBlur);
    this.lastTime = performance.now();
    renderer.setAnimationLoop((now) => this.frame(now));
    this.resolveShown();
  }

  /** The changes in view since the last call, to the views and the name tags. */
  private syncViews(): void {
    const world = this.world!;
    const data = this.data!;
    const changes = world.takeChanges();
    this.views!.sync(changes, world.movers);
    this.tags!.sync(changes, world.movers, (mover) => nameTagOf(mover, world.self(), data.nameColors, data.honorTitles));
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
      const steps = this.paused ? 0 : this.stepper.advance(dt);
      for (let i = 0; i < steps; i++) this.step(world, views);
      views.update(world.movers, steps / STEPS_PER_SECOND);

      // the back camera behind the own mover: heading = pi - angle in radians (global constraints)
      const at = this.ownAt();
      stage.focus(at);
      const heading = Math.PI - ((world.self()?.act.body.angle ?? 0) * Math.PI) / 180;
      const camera = chaseCamera(at, heading, CHASE_PITCH, (x, z) => stage.heightAt([x, 0, z]));
      stage.setCamera(camera.position, camera.target);
      this.tags!.update(stage.camera, renderer.getSize(drawingSize).y, (objectId) => views.placeOf(objectId));

      const { tiles, models } = stage.counts();
      overlay.setCounts({ tiles, models: models + views.count(), textures: this.services!.textures.size() });
      overlay.setMessageCounts(this.session.stats);
      stage.render();
    } catch (error) {
      // a frame that throws every frame must not fill the overlay with the same line sixty times a second
      const message = `world: ${messageOf(error)}`;
      if (message !== this.lastError) overlay.error(message);
      this.lastError = message;
    }
  }

  /**
   * One rules step: the keys and the joystick to the own mover (`drive`); then every mover's step (the own one's
   * included), then the views'.
   */
  private step(world: WorldState, views: MoverViews): void {
    const own = world.self();
    if (own !== undefined) {
      this.desired = desiredFrom(combineIntents(this.keyboard!.intent(), this.joystick!.intent()), this.desired);
      this.drive(own.act, this.desired);
    }
    world.step();
    views.step(world.movers);
  }

  /**
   * What the controls ask of the own mover (`driveOwnMover`), its moves sent as `ControlGround` sends them, PLAYERMOVED
   * then PLAYERBEHAVIOR (`WndWorldControlPlayer.cpp:557-559`; stopping after a run, or the first idle step of a mover the
   * server started running, sends both).
   */
  private drive(act: ActionMover, desired: Desired): void {
    const { moved, behavior } = driveOwnMover(act, desired);
    if (moved) this.session.sendMoved(movedReport(act, this.entry.clock.tick()));
    if (behavior) this.session.sendBehavior(act.report(this.entry.clock.tick()));
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
   * controls let go and the player stops now, its moves sent from here rather than from the frame loop.
   */
  private stopOwnMover(): void {
    this.keyboard?.reset();
    this.joystick?.reset();
    this.desired = STANDING;
    const own = this.world?.self();
    if (own !== undefined) this.drive(own.act, STANDING);
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
    this.joystick?.dispose();
    this.views?.dispose();
    this.tags?.dispose();
    this.stage?.dispose();
    this.page?.holder.remove();
    this.element.remove();
    this.unregister();
    this.rejectShown(new Error(message ?? 'the player left the world'));
    this.onEnd(message);
  }
}
