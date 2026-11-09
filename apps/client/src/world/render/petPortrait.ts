// The raised pet's 3D portrait in its status window (pets R2, docs/superpowers/plans/2026-11-09-pets-rest.md), drawn as
// `CWndPetStatus` draws it in its face box, the way `portrait.ts` draws the status window's face:
//
//   CWndPetStatus::SetPetCamTable   _Interface/WndPetSys.cpp:225-283   the camera and the scale of each kind
//   CWndPetStatus::OnDraw           WndPetSys.cpp:616-771              the viewport of WIDC_CUSTOM1, the projection
//                                                                      `D3DXMatrixOrthoLH( h * aspect, h, ... )` (:647-654),
//                                                                      the egg's camera (:676-687), the kind's (:688-693),
//                                                                      the model scaled, not turned nor moved (:695-703),
//                                                                      unlit (`SetDiffuse( 0 )`, `SetAmbient( 1 )`, :754-755)
//                                                                      with its texture set (`SetTextureEx`, :758)
//   CWndPetStatus::Process          WndPetSys.cpp:986-1029             the pet mover's model, its stand motion (the egg's
//                                                                      idle), moved a frame each frame (`FrameMove`)
//
// The model is the own pet mover's, loaded for the portrait alone (`m_pPetModel`, deleted when the pet mover goes). Each
// frame the motion moves on; the picture is drawn into a render target and read back to the portrait's canvas, one read
// at a time, as the status window's face is (Piece 6 M5): the window's HTML is over the 3D view, where Neuz's viewport
// drew into the window itself.

import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import { Scene } from 'three';
import type { WebGLRenderer } from 'three';
import { drawPicture, portraitCamera, unlit } from './portrait';

const f32 = Math.fround;

/** The face box (`WIDC_CUSTOM1`, `Resource/resdata.inc:8808`): (8, 6) to (72, 74), 64 x 68. */
export const PET_FACE_WIDTH = 64;
export const PET_FACE_HEIGHT = 68;

/** A camera of `m_PetCameTable` (`PETCAMTABLE`): where it is and what it looks at in D3D's coordinates, and the scale. */
export interface PetCamera {
  pos: readonly [number, number, number];
  lookAt: readonly [number, number, number];
  scale: number;
}

/**
 * `SetPetCamTable` (`WndPetSys.cpp:225-283`), by kind (`PK_*`): the white tiger, the Barbary lion, the rabbit, the
 * nine-tailed fox, the dragon, the griffin, the unicorn. `MAX_PET_CLASS` is 7 (`WndPetSys.h:16`).
 */
export const PET_CAMERAS: readonly PetCamera[] = [
  { pos: [1.2, 4.6, -7.0], lookAt: [-2.4, 3.0, 0.0], scale: 6.0 },
  { pos: [0.7, 3.0, -5.2], lookAt: [-2.2, 2.5, 1.0], scale: 6.0 },
  { pos: [2.0, 2.2, -4.0], lookAt: [-2.2, 1.0, 3.0], scale: 7.0 },
  { pos: [1.4, 4.2, -8.0], lookAt: [-2.2, 2.0, 3.0], scale: 6.0 },
  { pos: [1.4, 6.8, -6.0], lookAt: [-2.0, 6.0, 3.0], scale: 5.5 },
  { pos: [3.0, 6.0, -12.0], lookAt: [-2.0, 3.0, 3.0], scale: 4.5 },
  { pos: [4.0, 3.0, -10.0], lookAt: [-6.0, 6.0, 3.0], scale: 5.0 },
];

/** The egg's camera (`OnDraw`, :676-686): from (0, 5, -4) at (0, 0, 3), scale 5. */
export const EGG_CAMERA: PetCamera = { pos: [0, 5, -4], lookAt: [0, 0, 3], scale: 5 };

/** `PK_UNICORN` and `PK_MANA_UNICORN` (`Resource/define.h:256-257`). */
const PK_UNICORN = 6;
const PK_MANA_UNICORN = 7;

/**
 * The camera of a pet at `level` (0 the egg) of `kind`: the egg's, else the kind's (`m_PetCameTable[ GetKind() ]`). The
 * owner's mana unicorn (kind 7, `PK_MAX` 8) is past Neuz's table of 7, where the C++ reads whatever follows it
 * (docs/superpowers/specs/2026-11-09-pets-research.md §6): it takes the unicorn's, the same body's. Null for a kind past
 * that.
 */
export function petCamera(level: number, kind: number): PetCamera | null {
  if (level === 0) return EGG_CAMERA;
  return PET_CAMERAS[kind === PK_MANA_UNICORN ? PK_UNICORN : kind] ?? null;
}

/**
 * The portrait: `show` gives it a model (which it owns from then and releases), its stand motion and its camera; `step`
 * moves the motion a frame (`FrameMove`, each `Process`); `draw` draws the frame reached, unless that is drawn already or a
 * read is still on its way. `canvas` is the picture, 64 x 68 CSS pixels; it is empty until the first read comes back.
 */
export class PetPortrait {
  readonly canvas: HTMLCanvasElement;
  /** Where a read lands before it is copied to `canvas`, so that a read for a model gone draws nothing. */
  private readonly scratch: HTMLCanvasElement;
  private readonly scene = new Scene();
  private model: AssembledCharacter | null = null;
  private motion: LoopedMotion | null = null;
  private camera: PetCamera | null = null;
  /** `m_fFrameCurrent`, and the frame last drawn (-1: none). */
  private frame = 0;
  private drawnFrame = -1;
  private reading = false;
  /** Bumped by every `show` and `clear`: a read that comes back for an older model draws nothing more. */
  private generation = 0;

  constructor(doc: Document, private readonly report: (error: unknown) => void = () => {}) {
    this.canvas = doc.createElement('canvas');
    this.canvas.style.width = `${PET_FACE_WIDTH}px`;
    this.canvas.style.height = `${PET_FACE_HEIGHT}px`;
    this.scratch = doc.createElement('canvas');
  }

  /** Whether a model is shown. */
  get shown(): boolean {
    return this.model !== null;
  }

  /**
   * `m_pPetModel` made (`Process`, :998-1023): `model` scaled by the camera's scale, as it is otherwise (the identity's
   * turn and place), unlit, playing `motion` from its first frame. A model shown before is released.
   */
  show(model: AssembledCharacter, motion: LoopedMotion | null, camera: PetCamera): void {
    this.clear();
    this.model = model;
    this.motion = motion;
    this.camera = camera;
    const { root } = model;
    unlit(root);
    root.scale.setScalar(camera.scale);
    root.rotation.set(0, 0, 0);
    root.position.set(0, 0, 0);
    if (motion !== null) model.mixer.clipAction(motion.clip).play();
    this.scene.add(root);
    this.frame = 0;
    this.drawnFrame = -1;
  }

  /** `SAFE_DELETE( m_pPetModel )`: the model released and the picture emptied. */
  clear(): void {
    this.generation++;
    if (this.model !== null) {
      this.scene.remove(this.model.root);
      this.model.release();
    }
    this.model = null;
    this.motion = null;
    this.camera = null;
    this.drawnFrame = -1;
    this.canvas.width = this.canvas.width; // a canvas given its width again is emptied
  }

  /**
   * `m_pPetModel->FrameMove()` (`Process`, :1025-1026): the motion's frame moves on by its `m_fPerSlerp` (cut to 3
   * decimals, `CModelObject::LoadMotion`), round and round (`ANILOOP_LOOP`, the portrait's).
   */
  step(): void {
    const motion = this.motion;
    if (motion === null || motion.frames < 2) return;
    const perSlerp = f32(Math.trunc(f32(motion.events.perSlerp * 1000)) / 1000);
    let frame = f32(this.frame + perSlerp);
    if (frame > motion.frames - 1) frame = f32(frame - Math.trunc(frame) + (Math.trunc(frame) % motion.frames));
    this.frame = frame;
  }

  /** Draws the frame reached with `renderer`, one read at a time; the frame already drawn is not drawn again. */
  draw(renderer: WebGLRenderer): void {
    const { model, camera } = this;
    if (model === null || camera === null || this.reading || this.frame === this.drawnFrame) return;
    if (this.motion !== null) model.mixer.setTime(timeOf(this.motion, this.frame));
    const view = portraitCamera(PET_FACE_WIDTH, PET_FACE_HEIGHT);
    // D3D's left-handed place, Z mirrored for the web's right-handed one (as portrait.ts's EYE and LOOK_AT)
    view.position.set(camera.pos[0], camera.pos[1], -camera.pos[2]);
    view.lookAt(camera.lookAt[0], camera.lookAt[1], -camera.lookAt[2]);
    this.drawnFrame = this.frame;
    this.reading = true;
    const generation = this.generation;
    drawPicture(renderer, this.scene, view, this.scratch, PET_FACE_WIDTH, PET_FACE_HEIGHT)
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

  dispose(): void {
    this.clear();
  }
}

/** The clip time of frame `frame` (`m_fFrameCurrent`): between the key times of its frame and the next. */
function timeOf(motion: LoopedMotion, frame: number): number {
  const n = Math.min(Math.trunc(frame), motion.frames - 1);
  const time = motion.frameTime(n);
  const next = n + 1 < motion.frames ? motion.frameTime(n + 1) : motion.clip.duration;
  return time + (frame - n) * (next - time);
}
