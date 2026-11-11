// Jewel Setting's turning weapon (2026-11-11, docs/superpowers/specs/2026-11-11-item-npc-windows-research.md §5): the
// Ultimate weapon's 3D model in WIDC_CUSTOM1, drawn as `CWndSmeltJewel::OnDraw` draws it (_Interface/WndField.cpp):
//
//   :20053-20113   the camera by the weapon's kind: from above, looking down at the weapon laid along X
//   :20117-20120   during START (`m_nStatus == 1`) the eye moved by `m_nEyeYPos` (Process takes 0.4 off it in the last steps)
//   :20122-20127   `D3DXMatrixLookAtLH`, up (0, 1, 0); `D3DXMatrixPerspectiveFovLH( D3DX_PI/4, 1.0f, 1.0f, 100.0f )`: an
//                  aspect of 1 in a 160 x 230 viewport, so the picture is stretched as tall as the box
//   :20129-20134   the model turned `m_fRotate` degrees on X (`m_fRotate += m_fAddRot` each draw), scaled 1.5
//   :20136-20145   the viewport WIDC_CUSTOM1's rect, only the depth cleared (the window's picture shows around it)
//   :20151-20162   unlit, diffuse and ambient 1: each texture as it is
//   :20283-20284   the model, `LoadModel( OT_ITEM, dwItemId )`
//
// As the pet portraits (petPortrait.ts), the picture is drawn into a render target and read back to a canvas, one read at
// a time.

import type { Object3D, WebGLRenderer } from 'three';
import { PerspectiveCamera, Scene } from 'three';
import { PictureTarget, drawPicture, unlit } from './portrait';

/** WIDC_CUSTOM1 of APP_SMELT_JEWEL (`Resource/resdata.inc`): (16, 16) to (176, 246). */
export const WEAPON_VIEW = { width: 160, height: 230 } as const;
/** `D3DXMatrixScaling( 1.5f, ... )` (:20133). */
const SCALE = 1.5;

/** IK3_SWD 2, IK3_AXE 3, IK3_CHEERSTICK 4, IK3_KNUCKLEHAMMER 5, IK3_WAND 6, IK3_STAFF 7, IK3_YOYO 11, IK3_BOW 12. */
const IK3 = { SWD: 2, AXE: 3, CHEERSTICK: 4, KNUCKLEHAMMER: 5, WAND: 6, STAFF: 7, YOYO: 11, BOW: 12 } as const;
/** `HD_ONE`, `HD_TWO` (Resource/defineAttribute.h:27-28). */
const HD_ONE = 1;
const HD_TWO = 2;

/** Where the camera is and what it looks at, in D3D's coordinates. */
export interface WeaponCamera {
  eye: readonly [number, number, number];
  lookAt: readonly [number, number, number];
}

/**
 * The camera of a weapon of `kind3` held in `handed` hands (:20058-20113). A kind the C++ lists nowhere keeps (0, 0, 0)
 * for both, which draws nothing.
 */
export function smeltJewelCamera(kind3: number, handed: number): WeaponCamera {
  if (kind3 === IK3.AXE || kind3 === IK3.SWD) {
    if (handed === HD_ONE) return { eye: [0, 3, 0], lookAt: [0.6, -0.2, 0] };
    if (handed === HD_TWO) return { eye: [1, 5, 0], lookAt: [1.2, -0.2, 0] };
  } else if (kind3 === IK3.YOYO || kind3 === IK3.KNUCKLEHAMMER || kind3 === IK3.BOW) {
    return { eye: [0, 3, 0], lookAt: [0.01, -0.2, 0] };
  } else if (kind3 === IK3.WAND) {
    return { eye: [0, 3, 0], lookAt: [0.4, -0.2, 0] };
  } else if (kind3 === IK3.CHEERSTICK || kind3 === IK3.STAFF) {
    return { eye: [0, 4, 0], lookAt: [0.01, -0.2, 0] };
  }
  return { eye: [0, 0, 0], lookAt: [0, 0, 0] };
}

/** A loaded weapon model, and how to let it go. */
export interface WeaponModel {
  item: Object3D;
  release(): void;
}

/** The turning weapon: `show` gives it a model, `draw` draws it at a turn and an eye height. */
export class WeaponPortrait {
  readonly canvas: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly picture = new PictureTarget();
  private model: WeaponModel | null = null;
  private camera: WeaponCamera | null = null;
  private reading = false;
  private generation = 0;
  /** A picture has come back for the model shown. */
  private drawnOnce = false;

  constructor(doc: Document, private readonly report: (error: unknown) => void = () => {}) {
    this.canvas = doc.createElement('canvas');
    this.canvas.className = 'hud-jewel-model';
    this.canvas.style.width = `${WEAPON_VIEW.width}px`;
    this.canvas.style.height = `${WEAPON_VIEW.height}px`;
    this.scratch = doc.createElement('canvas');
  }

  get shown(): boolean {
    return this.model !== null;
  }

  /** A picture of the model shown has been drawn. */
  get drawn(): boolean {
    return this.drawnOnce;
  }

  /** The model (owned from then on), unlit and scaled 1.5, seen by `camera`. One shown before is let go. */
  show(model: WeaponModel, camera: WeaponCamera): void {
    this.clear();
    this.model = model;
    this.camera = camera;
    unlit(model.item);
    model.item.scale.setScalar(SCALE);
    model.item.position.set(0, 0, 0);
    this.scene.add(model.item);
  }

  clear(): void {
    this.generation++;
    if (this.model !== null) {
      this.scene.remove(this.model.item);
      this.model.release();
    }
    this.model = null;
    this.camera = null;
    this.drawnOnce = false;
    this.picture.dispose();
    this.canvas.width = this.canvas.width;
  }

  /**
   * Draws the model turned `rotate` degrees on X with the eye `eyeY` higher (lower when negative), unless a read is on
   * its way. D3D's left-handed place is the web's with Z mirrored: a turn on X goes the other way.
   */
  draw(renderer: WebGLRenderer, rotate: number, eyeY: number): void {
    const { model, camera } = this;
    if (model === null || camera === null || this.reading) return;
    model.item.rotation.set((-rotate * Math.PI) / 180, 0, 0);
    const view = new PerspectiveCamera(45, 1, 1, 100);
    view.position.set(camera.eye[0], camera.eye[1] + eyeY, -camera.eye[2]);
    view.up.set(0, 1, 0);
    view.lookAt(camera.lookAt[0], camera.lookAt[1], -camera.lookAt[2]);
    this.reading = true;
    const generation = this.generation;
    drawPicture(renderer, this.scene, view, this.scratch, WEAPON_VIEW.width, WEAPON_VIEW.height, this.picture)
      .then(() => {
        if (generation !== this.generation) return;
        const { canvas, scratch } = this;
        if (canvas.width !== scratch.width) canvas.width = scratch.width;
        if (canvas.height !== scratch.height) canvas.height = scratch.height;
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(scratch, 0, 0);
        this.drawnOnce = true;
      })
      .catch((error: unknown) => { if (generation === this.generation) this.report(error); })
      .finally(() => { this.reading = false; });
  }

  dispose(): void {
    this.clear();
  }
}
