// The beauty shop's 3D pictures (2026-11-15, docs/2026-11-15-beauty-shop-research.md §3), drawn as the hair and face
// windows draw their models in their boxes, the way portrait.ts draws the status window's face:
//
//   CWndBeautyShop::OnDraw        _Interface/WndShop.cpp:1065-1474   WIDC_CUSTOM5 (the look as it is) and WIDC_CUSTOM6 (the
//                                                                    chosen one, turned g_tmCurrent / 1000 radians): the
//                                                                    camera (0, 0.7, -3.5) at (0, 0, 3), the box's ortho
//                                                                    projection, scale 4.5, lowered 5.6 (male) or 5.2
//   CWndBeautyShop::DrawHairKind  WndShop.cpp:1477-1573              each style's box less 2 px: scale 6, (0.05, -8, -1) or
//                                                                    (0, -7.5, -1), in the player's own colour
//   CWndFaceShop::DrawFaces       WndShop.cpp:2729-2853              each face's box less 2 px: scale 7.5, (0.05, -10, -1)
//                                                                    or (0, -9.5, -1)
//
// Every model is the body of the player's sex dressed as the player (`CMover::UpdateParts`), in the first frame of
// MTI_STAND2 (`LoadMotion`, never moved on), unlit. A picture is drawn into a render target and read back to a canvas;
// the turning one again each frame, one read at a time (as the pet window's portrait).

import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import { Scene } from 'three';
import type { WebGLRenderer } from 'three';
import type { MoverLook } from '../render/looks';
import { EYE, LOOK_AT, PictureTarget, drawPicture, portraitCamera, unlit } from '../render/portrait';

/** `MTI_STAND2` (`Resource/defineNeuz.h`): the pose `LoadMotion` gives every model of the two windows. */
export const MTI_STAND2 = 199;

/** A box's picture: its size, the model's scale, its place (D3D's, before Z is mirrored) by sex. */
export interface BeautyView {
  width: number;
  height: number;
  scale: number;
  male: readonly [number, number, number];
  female: readonly [number, number, number];
}

/** WIDC_CUSTOM5 and WIDC_CUSTOM6: 152 x 120. */
export const BIG_VIEW: BeautyView = { width: 152, height: 120, scale: 4.5, male: [0, -5.6, 0], female: [0, -5.2, 0] };
/** A hair style's box (74 x 74) less 2 px. */
export const HAIR_VIEW: BeautyView = { width: 72, height: 72, scale: 6, male: [0.05, -8, -1], female: [0, -7.5, -1] };
/** A face's box less 2 px. */
export const FACE_VIEW: BeautyView = { width: 72, height: 72, scale: 7.5, male: [0.05, -10, -1], female: [0, -9.5, -1] };

/** A model to draw: the look's, loaded for the picture alone, with its pose; `release` lets it go. */
export interface PosedModel {
  model: AssembledCharacter;
  motion: LoopedMotion | null;
  release(): void;
}

/** Places `model` for `view` (scale, then the turn, then the place: D3D's S * R * T), its pose at its first frame. */
function pose(posed: PosedModel, view: BeautyView, male: boolean, turn: number): void {
  const { root, mixer } = posed.model;
  const at = male ? view.male : view.female;
  root.scale.setScalar(view.scale);
  // a D3D turn about Y is the opposite one in the web's mirrored Z (portrait.ts)
  root.rotation.set(0, -turn, 0);
  root.position.set(at[0], at[1], -at[2]);
  if (posed.motion !== null) {
    mixer.clipAction(posed.motion.clip).play();
    mixer.setTime(posed.motion.frameTime(0));
  }
}

function cameraFor(view: BeautyView): ReturnType<typeof portraitCamera> {
  const camera = portraitCamera(view.width, view.height);
  camera.position.set(...EYE);
  camera.lookAt(...LOOK_AT);
  return camera;
}

/**
 * Draws `posed` once for `view` with `renderer` into a new canvas, and gives it once read. The model is the caller's to
 * release after.
 */
export async function drawOnce(
  renderer: WebGLRenderer, posed: PosedModel, view: BeautyView, male: boolean, doc: Document,
): Promise<HTMLCanvasElement> {
  unlit(posed.model.root);
  pose(posed, view, male, 0);
  const scene = new Scene();
  scene.add(posed.model.root);
  const canvas = doc.createElement('canvas');
  const reading = drawPicture(renderer, scene, cameraFor(view), canvas, view.width, view.height);
  scene.remove(posed.model.root);
  await reading;
  return canvas;
}

/**
 * WIDC_CUSTOM6's model: shown in `canvas`, turned `now / 1000` radians each frame (`D3DXMatrixRotationY( g_tmCurrent /
 * 1000.0f )`), one read at a time. `show` takes a model (owned from then on), `clear` lets it go.
 */
export class TurningPicture {
  readonly canvas: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly picture = new PictureTarget();
  private posed: PosedModel | null = null;
  private male = true;
  private reading = false;
  private generation = 0;

  constructor(doc: Document, private readonly view: BeautyView, private readonly report: (error: unknown) => void) {
    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'hud-beauty-model';
    this.canvas.style.width = `${view.width}px`;
    this.canvas.style.height = `${view.height}px`;
    this.scratch = doc.createElement('canvas');
  }

  get shown(): boolean {
    return this.posed !== null;
  }

  show(posed: PosedModel, male: boolean): void {
    this.clear(false);
    this.posed = posed;
    this.male = male;
    unlit(posed.model.root);
    pose(posed, this.view, male, 0);
    this.scene.add(posed.model.root);
  }

  /** The model let go; `blank` empties the picture too (the window closed), else the last one stays until the next. */
  clear(blank = true): void {
    this.generation++;
    if (this.posed !== null) {
      this.scene.remove(this.posed.model.root);
      this.posed.release();
    }
    this.posed = null;
    if (blank) {
      this.picture.dispose();
      this.canvas.width = this.canvas.width;
    }
  }

  /** The frame at `now` (ms): the model turned and drawn, unless a read is on its way. */
  draw(renderer: WebGLRenderer, now: number): void {
    const posed = this.posed;
    if (posed === null || this.reading) return;
    pose(posed, this.view, this.male, now / 1000);
    this.reading = true;
    const generation = this.generation;
    drawPicture(renderer, this.scene, cameraFor(this.view), this.scratch, this.view.width, this.view.height, this.picture)
      .then(() => {
        if (generation !== this.generation) return;
        const { canvas, scratch } = this;
        if (canvas.width !== scratch.width) canvas.width = scratch.width;
        if (canvas.height !== scratch.height) canvas.height = scratch.height;
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(scratch, 0, 0);
      })
      .catch((error: unknown) => { if (generation === this.generation) this.report(error); })
      .finally(() => { this.reading = false; });
  }
}

/** What the pictures need from the world: the player's look with a change, a model of a look, and the renderer. */
export interface BeautyPicturesHost {
  /** The own look with another hair style (0-based), colour (0xAARRGGBB) or face (0-based); null without a player. */
  look(change: LookChange, held: boolean): MoverLook | null;
  /** The player is male (the models' place). */
  male(): boolean;
  /** A model of `look`, posed in MTI_STAND2's first frame; null when it cannot be had (said once by the host). */
  load(look: MoverLook, held: boolean): Promise<PosedModel | null>;
  renderer(): WebGLRenderer | null;
  report(error: unknown): void;
}

/** What makes a look's picture: its parts, hair colour and held items. */
function keyOf(look: MoverLook): string {
  return `${look.parts.join(',')}|${look.hairColor}|${look.held.right}|${look.held.left}`;
}

export interface LookChange {
  hairMesh?: number;
  hairColor?: number;
  headMesh?: number;
}

/**
 * One window's pictures: the still model (WIDC_CUSTOM5), the turning one (WIDC_CUSTOM6), and the small boxes. Each `set*`
 * draws again only what changed; a slower answer never puts an older picture over a newer.
 */
export class BeautyPictures {
  readonly turning: TurningPicture;
  private stillKey = '';
  private turningKey = '';
  private readonly smallKeys = new Map<HTMLElement, string>();
  private stillTicket = 0;
  private turningTicket = 0;
  private readonly smallTickets = new Map<HTMLElement, number>();

  constructor(private readonly host: BeautyPicturesHost, private readonly doc: Document) {
    this.turning = new TurningPicture(doc, BIG_VIEW, (error) => host.report(error));
  }

  /** WIDC_CUSTOM5: the look as it is, in `box`; drawn again only when the look changed. */
  setStill(box: HTMLElement): void {
    const look = this.host.look({}, true);
    if (look === null) return;
    const key = keyOf(look);
    if (key === this.stillKey) return;
    this.stillKey = key;
    const ticket = ++this.stillTicket;
    void this.picture(look, BIG_VIEW, true).then((canvas) => {
      if (canvas !== null && ticket === this.stillTicket) this.put(box, canvas);
    });
  }

  /** WIDC_CUSTOM6: the look with `change`, turning in `box`. */
  setTurning(box: HTMLElement, change: LookChange): void {
    if (this.turning.canvas.parentElement !== box) box.prepend(this.turning.canvas);
    const look = this.host.look(change, true);
    if (look === null) return;
    const key = keyOf(look);
    if (key === this.turningKey) return;
    this.turningKey = key;
    const ticket = ++this.turningTicket;
    void this.host.load(look, true).then((posed) => {
      if (posed === null) return;
      if (ticket !== this.turningTicket) posed.release();
      else this.turning.show(posed, this.host.male());
    });
  }

  /** A small box: the look with `change`, in `view`. */
  setSmall(box: HTMLElement, change: LookChange, view: BeautyView): void {
    const look = this.host.look(change, false);
    if (look === null) return;
    const key = `${keyOf(look)}|${view.scale}`;
    if (this.smallKeys.get(box) === key) return;
    this.smallKeys.set(box, key);
    const ticket = (this.smallTickets.get(box) ?? 0) + 1;
    this.smallTickets.set(box, ticket);
    void this.picture(look, view, false).then((canvas) => {
      if (canvas !== null && this.smallTickets.get(box) === ticket) this.put(box, canvas);
    });
  }

  /** Each frame: the turning model. */
  frame(now: number): void {
    const renderer = this.host.renderer();
    if (renderer !== null) this.turning.draw(renderer, now);
  }

  /** The window closed: every model let go, the keys forgotten (the next open draws everything again). */
  clear(): void {
    this.turning.clear();
    this.stillKey = '';
    this.turningKey = '';
    this.smallKeys.clear();
    this.stillTicket++;
    this.turningTicket++;
    for (const [box, ticket] of this.smallTickets) this.smallTickets.set(box, ticket + 1);
  }

  private put(box: HTMLElement, canvas: HTMLCanvasElement): void {
    canvas.className = 'hud-beauty-model';
    box.querySelector('canvas.hud-beauty-model')?.remove();
    box.prepend(canvas);
  }

  private async picture(look: MoverLook, view: BeautyView, held: boolean): Promise<HTMLCanvasElement | null> {
    const renderer = this.host.renderer();
    if (renderer === null) return null;
    const posed = await this.host.load(look, held);
    if (posed === null) return null;
    try {
      return await drawOnce(renderer, posed, view, this.host.male(), this.doc);
    } catch (error) {
      this.host.report(error);
      return null;
    } finally {
      posed.release();
    }
  }
}
