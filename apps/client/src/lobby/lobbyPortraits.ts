// The lobby's 3D characters, drawn as Neuz draws them into its windows (docs/superpowers/specs/2026-11-12-char-select-
// create-research.md §2, §3), with the page's renderer, into a render target read back to each box's canvas (as the
// pet window's portrait is, `petPortrait.ts`): the page's canvas has no alpha, and the window's picture shows around them.
//
//   CWndSelectChar::OnDraw   _Interface/WndTitle.cpp:1599-1722  each slot's viewport (158 x 238): a perspective of PI/4
//                                                               from (0, 0.5, -3.5) at (0, 0, 1); scaled 1.6, lowered 1.15;
//                                                               unlit; motions by `lobbyMotion.ts`
//   CWndCreateChar::OnDraw   WndTitle.cpp:2358-2593             the preview's viewport (270 x 305): orthographic, from
//                                                               (0, 0, -5) at (0, 0, 3); scaled 1.4, lowered 1.1; unlit
//   CWndCreateChar::SetSex   WndTitle.cpp:2651-2681             dressed in the Vagrant's start equipment
//
// A slot draws a frame only when its motion has moved and its last read has come back; everything is let go once the
// window's element leaves the page. Without WebGL, or with game files older than the motions, the windows stay usable.

import { attachHeld, loadGltf, loopMotion } from '@flyffweb/scene';
import type { AssembledCharacter, LoopedMotion, SceneServices } from '@flyffweb/scene';
import type { CharacterSummary } from '@flyffweb/protocol';
import { PerspectiveCamera, Scene } from 'three';
import type { Camera, WebGLRenderer } from 'three';
import { hairColorFor } from './appearance';
import { VAGRANT_START_EQUIPMENT } from './createRules';
import {
  LobbyMti, MotionClock, createMotion, getUpMotion, nextSelectMotion, openingSelectMotion, ticksIn,
} from './lobbyMotion';
import type { MotionState } from './lobbyMotion';
import type { GameData } from '../world/gameData';
import { page3d, sceneAssets } from '../world/page3d';
import type { Page3d } from '../world/page3d';
import { characterLook } from '../world/render/looks';
import { loadHeldItems, loadMoverModel } from '../world/render/moverModels';
import { PictureTarget, drawPicture, portraitCamera, unlit } from '../world/render/portrait';
import type { WingMotions } from '../world/render/wingCapes';

/** A slot's viewport (`m_aRect[ i ]`, 158 x 238) and the create window's (280 to 550, 0 to 305). */
export const SLOT_BOX = { width: 158, height: 238 } as const;
export const CREATE_BOX = { width: 270, height: 305 } as const;

/** A model dressed for a box, with the motions it may play (null where the game files lack one). */
interface Dressed {
  model: AssembledCharacter;
  motions: Map<number, LoopedMotion | null>;
  /** 2026-11-17: the wing cape's wings, playing their idle (2026-11-20). */
  wings: WingMotions[];
  release(): void;
}

/** The ticks a second (`ticksIn`): a wing cape's stand motion runs on them. */
const TICKS_PER_SECOND = 60;

const warn = (message: string): void => console.warn(`Lobby character: ${message}`);

/** Loads the model of `character`'s look with what it holds, and the motions `ids`. Rejects when the body cannot be had. */
async function dress(
  services: SceneServices, data: GameData, character: CharacterSummary, ids: readonly number[],
): Promise<Dressed> {
  const look = characterLook(character, data);
  const model = await loadMoverModel(services)(look, warn);
  const held: Awaited<ReturnType<ReturnType<typeof loadHeldItems>>> = [];
  try {
    held.push(...await loadHeldItems(services, data)(look, warn));
    for (const item of held) attachHeld(model, item.item, item.slot);
    const motions = new Map<number, LoopedMotion | null>();
    await Promise.all(ids.map(async (id) => {
      const key = look.motion(id);
      try {
        const clip = key === null ? undefined : (await loadGltf(services.store, services.loaders.gltf, key)).animations[0];
        motions.set(id, clip === undefined ? null : loopMotion(clip));
      } catch (error) {
        warn(`motion ${id}: ${error instanceof Error ? error.message : String(error)}`);
        motions.set(id, null);
      }
    }));
    return {
      model, motions, wings: held.flatMap((item) => (item.wing === undefined ? [] : [item.wing])),
      release() {
        for (const item of held) { item.item.removeFromParent(); item.release(); }
        model.release();
      },
    };
  } catch (error) {
    for (const item of held) { item.item.removeFromParent(); item.release(); }
    model.release();
    throw error;
  }
}

/** One box: a dressed model playing a motion, drawn into `canvas` (sized by the page's CSS). */
class Portrait {
  readonly canvas: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly picture = new PictureTarget();
  private dressed: Dressed | null = null;
  private clip: LoopedMotion | null = null;
  private clock: MotionClock | null = null;
  /** 2026-11-17: the ticks since the model came, for a wing cape's flap. */
  private ticks = 0;
  state: MotionState = { id: LobbyMti.STAND, loop: true, ended: false };
  private drawnFrame = -1;
  private reading = false;
  private generation = 0;

  constructor(
    doc: Document, private readonly box: { width: number; height: number }, private readonly camera: Camera,
    private readonly place: { scale: number; drop: number },
  ) {
    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'lobby-portrait';
    this.scratch = doc.createElement('canvas');
  }

  /** The model to draw from now on (owned from now, released by the next `show` or `dispose`), playing `id`. */
  show(dressed: Dressed, id: number, loop: boolean): void {
    this.clear();
    this.dressed = dressed;
    const { root } = dressed.model;
    unlit(root);
    root.scale.setScalar(this.place.scale);
    root.rotation.set(0, 0, 0);
    root.position.set(0, this.place.drop, 0);
    this.scene.add(root);
    this.play(id, loop);
  }

  /** `SetMotion`: `id` from its first frame, looping or once (a motion the files lack holds the pose). */
  play(id: number, loop: boolean): void {
    this.state = { id, loop, ended: false };
    const dressed = this.dressed;
    if (dressed === null) return;
    const clip = dressed.motions.get(id) ?? null;
    this.clip = clip;
    dressed.model.mixer.stopAllAction();
    if (clip !== null) dressed.model.mixer.clipAction(clip.clip).play();
    this.clock = new MotionClock(clip?.frames ?? 1, clip?.events.perSlerp ?? 0, loop);
    this.drawnFrame = -1;
  }

  /** One tick of the motion (`FrameMove`). */
  tick(): void {
    const clock = this.clock;
    if (clock === null) return;
    clock.tick();
    this.ticks++;
    this.state = { ...this.state, ended: clock.ended };
  }

  get shown(): boolean {
    return this.dressed !== null;
  }

  /** Draws the frame reached, unless it is drawn already or a read is on its way. */
  draw(renderer: WebGLRenderer, report: (error: unknown) => void): void {
    const { dressed, clock } = this;
    if (dressed === null || clock === null || this.reading || clock.frame === this.drawnFrame) return;
    if (this.clip !== null) dressed.model.mixer.setTime(timeOf(this.clip, clock.frame));
    for (const wing of dressed.wings) wing.mixer.setTime(this.ticks / TICKS_PER_SECOND);
    this.drawnFrame = clock.frame;
    this.reading = true;
    const generation = this.generation;
    drawPicture(renderer, this.scene, this.camera, this.scratch, this.box.width, this.box.height, this.picture)
      .then(() => {
        if (generation !== this.generation) return;
        const { canvas, scratch } = this;
        if (canvas.width !== scratch.width) canvas.width = scratch.width;
        if (canvas.height !== scratch.height) canvas.height = scratch.height;
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(scratch, 0, 0);
      })
      .catch((error: unknown) => { if (generation === this.generation) report(error); })
      .finally(() => { this.reading = false; });
  }

  private clear(): void {
    this.generation++;
    if (this.dressed !== null) {
      this.scene.remove(this.dressed.model.root);
      this.dressed.release();
    }
    this.dressed = null;
    this.clip = null;
    this.clock = null;
    this.drawnFrame = -1;
  }

  dispose(): void {
    this.clear();
    this.picture.dispose();
  }
}

/** The clip time of frame `frame`: between the key times of its frame and the next. */
function timeOf(motion: LoopedMotion, frame: number): number {
  const n = Math.min(Math.trunc(frame), motion.frames - 1);
  const time = motion.frameTime(n);
  const next = n + 1 < motion.frames ? motion.frameTime(n + 1) : motion.clip.duration;
  return time + (frame - n) * (next - time);
}

/** `D3DXMatrixPerspectiveFovLH( D3DX_PI/4, w/h, ... )` from D3D (0, 0.5, -3.5) at (0, 0, 1), Z mirrored for the web. */
function slotCamera(): Camera {
  const camera = new PerspectiveCamera(45, SLOT_BOX.width / SLOT_BOX.height, 0.1, 100);
  camera.position.set(0, 0.5, 3.5);
  camera.lookAt(0, 0, -1);
  return camera;
}

/** The create window's orthographic view from D3D (0, 0, -5) at (0, 0, 3), Z mirrored. */
function createCamera(): Camera {
  const camera = portraitCamera(CREATE_BOX.width, CREATE_BOX.height);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, -3);
  return camera;
}

/** Runs `frame` once a display frame until it returns false. */
function animate(view: Window, frame: (ms: number) => boolean): void {
  let last = view.performance.now();
  const step = (now: number): void => {
    const ms = now - last;
    last = now;
    if (frame(ms)) view.requestAnimationFrame(step);
  };
  view.requestAnimationFrame(step);
}

/** The page's renderer and what the models load with, or null (logged) when this browser cannot draw them. */
async function scene(doc: Document): Promise<{ page: Page3d; services: SceneServices; data: GameData } | null> {
  try {
    const page = page3d(doc);
    const { services, data } = await sceneAssets(page);
    return { page, services, data };
  } catch (error) {
    console.warn('Lobby characters unavailable:', error);
    return null;
  }
}

/**
 * The Select Character window's characters: each one in its slot's `.cs-portrait`, the one `selected()` names standing,
 * the others sitting, until `element` leaves the page.
 */
export async function selectPortraits(
  element: HTMLElement, characters: readonly CharacterSummary[], selected: () => number,
): Promise<void> {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const ready = await scene(doc);
  if (ready === null || view === null || !element.isConnected) return;
  const { page, services, data } = ready;
  const portraits = new Map<number, Portrait>();
  let current = selected();
  let carry = 0;
  let done = false;
  const report = (error: unknown): void => console.warn('Lobby character:', error);

  animate(view, (ms) => {
    if (!element.isConnected || page.released) {
      done = true;
      for (const portrait of portraits.values()) portrait.dispose();
      portraits.clear();
      return false;
    }
    const now = selected();
    if (now !== current) {
      current = now;
      // `SelectCharacter`: the one just selected gets up
      const portrait = portraits.get(now);
      if (portrait !== undefined) {
        const up = getUpMotion();
        portrait.play(up.id, up.loop);
      }
    }
    const time = ticksIn(ms, carry);
    carry = time.carry;
    for (const [slot, portrait] of portraits) {
      for (let i = 0; i < time.ticks; i++) {
        const next = nextSelectMotion(slot === current, portrait.state);
        if (next !== null) portrait.play(next.id, next.loop);
        portrait.tick();
      }
      portrait.draw(page.renderer, report);
    }
    return true;
  });

  for (const character of characters) {
    if (done) return;
    const target = element.querySelector<HTMLElement>(`.cs-portrait[data-slot="${character.slot}"]`);
    if (target === null) continue;
    let dressed: Dressed;
    try {
      dressed = await dress(services, data, character, [LobbyMti.STAND, LobbyMti.SIT, LobbyMti.SITSTAND, LobbyMti.GETUP]);
    } catch (error) {
      report(error);
      continue;
    }
    if (done) {
      dressed.release();
      return;
    }
    const portrait = new Portrait(doc, SLOT_BOX, slotCamera(), { scale: 1.6, drop: -1.15 });
    const opening = openingSelectMotion(character.slot === current);
    portrait.show(dressed, opening.id, opening.loop);
    portraits.set(character.slot, portrait);
    target.replaceChildren(portrait.canvas);
  }
}

/** The look of the create window's preview, as a character of the list would carry it. */
export function newCharacterSummary(look: { sex: number; hairMesh: number; headMesh: number }): CharacterSummary {
  return {
    slot: 0, blocked: 1, worldId: 0, index: 0, name: '', position: [0, 0, 0], playerId: 0, partyId: 0, guildId: 0,
    warId: 0, skinSet: 0, hairMesh: look.hairMesh, hairColor: hairColorFor(look.sex, look.hairMesh),
    headMesh: look.headMesh, sex: look.sex, job: 0, level: 1, jobLevel: 0, str: 15, sta: 15, dex: 15, int: 15, mode: 0,
    equipment: [...(VAGRANT_START_EQUIPMENT[look.sex] ?? [])],
  };
}

/** The New Character window's preview in its `.cc-preview`, following `look()`, until `element` leaves the page. */
export async function createPortrait(
  element: HTMLElement, look: () => { sex: number; hairMesh: number; headMesh: number },
): Promise<void> {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const target = element.querySelector<HTMLElement>('.cc-preview');
  const ready = await scene(doc);
  if (ready === null || view === null || target === null || !element.isConnected) return;
  const { page, services, data } = ready;
  const portrait = new Portrait(doc, CREATE_BOX, createCamera(), { scale: 1.4, drop: -1.1 });
  target.replaceChildren(portrait.canvas);
  const report = (error: unknown): void => console.warn('Lobby character:', error);
  let shown = '';
  let loading = '';
  let carry = 0;
  animate(view, (ms) => {
    if (!element.isConnected || page.released) {
      loading = '';
      portrait.dispose();
      return false;
    }
    const wanted = look();
    const key = `${wanted.sex}/${wanted.hairMesh}/${wanted.headMesh}`;
    if (key !== shown && key !== loading) {
      // `SetSex` / `UpdateParts`: the model made again for the new look
      loading = key;
      const motion = createMotion(wanted.sex);
      dress(services, data, newCharacterSummary(wanted), [motion]).then((dressed) => {
        if (loading !== key || !element.isConnected) {
          dressed.release();
          return;
        }
        loading = '';
        shown = key;
        portrait.show(dressed, motion, true);
      }, (error: unknown) => {
        if (loading === key) loading = '';
        shown = key; // not tried again until the look changes
        report(error);
      });
    }
    const time = ticksIn(ms, carry);
    carry = time.carry;
    if (portrait.shown) {
      for (let i = 0; i < time.ticks; i++) portrait.tick();
      portrait.draw(page.renderer, report);
    }
    return true;
  });
}
