// The corner marks around the selected target: Neuz's `CWndWorld::RenderFocusObj` (Source/_Interface/WndWorld.cpp:3080-3165)
// around the rect `CWndWorld::GetBoundRect` (:2661-2714) gives, which `CWndWorld::RenderSelectObj` draws for the focus
// and for the next target queued while auto-attacking (:3002-3058). The cells are `Icon/icon_target.inc`'s
// (`m_texTarget`, :3511; `WebUiSheets.targetCorners`), drawn in a `SpriteLayer` of the converted `icon_target.dds`.

import type { Vec3 } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { ModelBox } from '@flyffweb/scene';
import type { Camera } from 'three';
import { Vector3, Vector4 } from 'three';
import { Belli } from '../sim/constants';
import { transformCoord } from '../sim/d3dx';
import type { Matrix } from '../sim/d3dx';
import type { Sprite, SpritePainter } from './SpriteLayer';

/** A rect on the drawing, CSS pixels from its top left (`CRect`). */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The cells of `icon_target.inc`: 0-3 the white corner in its four flips, 8-11 the red one (`RenderFocusObj`, :3116-3162). */
const WHITE = 0;
const RED = 8;
/** `rect.left - 32` and `rect.top - 32` (`:3096-3099`): the corners sit outside the rect, a cell's size away. */
const CELL = 32;

/** `(LONG)` of a float: towards zero (and no negative zero, which an integer has not). */
const toLong = (v: number): number => Math.trunc(v) + 0;

/**
 * The loop of `CWndWorld::GetBoundRect` (`WndWorld.cpp:2701-2713`): from `SetRect( 65535, 65535, -65535, -65535 )`, each
 * point that is past a side moves it there, cast to `LONG`.
 */
export function boundRect(points: readonly { x: number; y: number }[]): ScreenRect {
  const rect = { left: 65535, top: 65535, right: -65535, bottom: -65535 };
  for (const { x, y } of points) {
    if (x < rect.left) rect.left = toLong(x);
    if (x > rect.right) rect.right = toLong(x);
    if (y < rect.top) rect.top = toLong(y);
    if (y > rect.bottom) rect.bottom = toLong(y);
  }
  return rect;
}

/** The eight corners of a box (`BOUND_BOX::m_vPos`), in any order: the rect and the cull test do not care. */
function cornersOf({ min, max }: ModelBox): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  return corners;
}

const clip = new Vector4();

/**
 * `CObj::IsCull()` (`Obj.h:256`): the world's `CullObject` (`World3D.cpp:2785-2819`) found the box `CS_OUTSIDE`, all its
 * corners (in the world, `m_vecBoundsWorld`: the box through the drawn matrix) outside one plane of the view frustum. The
 * planes are the camera's, in clip space: x and y beyond ±w, z beyond the near and far planes.
 */
function isCull(camera: Camera, corners: readonly Vec3[]): boolean {
  let outside = 0x3f;
  for (const corner of corners) {
    clip.set(...toWebPosition(corner), 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    const { x, y, z, w } = clip;
    const bits = (x < -w ? 1 : 0) | (x > w ? 2 : 0) | (y < -w ? 4 : 0) | (y > w ? 8 : 0) | (z < -w ? 16 : 0) | (z > w ? 32 : 0);
    // a corner inside every plane: inside (CS_INSIDE)
    if (bits === 0) return false;
    outside &= bits;
  }
  return outside !== 0;
}

const projected = new Vector3();

/**
 * The rect the focus's corners go around, or null when there are none: the mover is culled (`IsCull()`, `:3008`). The
 * rect is `CWndWorld::GetBoundRect` (`WndWorld.cpp:2661-2714`): the model's box (`GetBBVector`, a held weapon's
 * included) through `scale * rotation * translation( GetPos() )`, which is the drawn matrix `drawn` (`moverMatrix` of
 * `m_vScrPos`, its scale and rotation `m_matScale`, `m_matRotation`) with the rules position `at` for its translation,
 * each corner put through `D3DXVec3Project` (which divides by w whatever its sign: the C++ checks nothing else) on a
 * viewport `width` by `height` CSS pixels at 0, 0. The culling is the drawn box's, as the world culls it. (A pet's or an
 * egg's `GetScrPos`, `:2671-2676`, is not Piece 4's.) The camera's matrices are taken as they are.
 */
export function focusRect(
  camera: Camera, width: number, height: number, box: ModelBox, drawn: Matrix, at: Vec3,
): ScreenRect | null {
  const corners = cornersOf(box);
  if (isCull(camera, corners.map((c) => transformCoord(c, drawn)))) return null;
  const world = Float32Array.from(drawn);
  world[12] = at[0];
  world[13] = at[1];
  world[14] = at[2];
  return boundRect(corners.map((corner) => {
    projected.set(...toWebPosition(transformCoord(corner, world))).project(camera);
    return { x: ((projected.x + 1) * width) / 2, y: ((1 - projected.y) * height) / 2 };
  }));
}

/** What `attackMarks` reads of the focus: `CMover::IsPlayer()` and `IsPeaceful()` (`m_dwBelligerence`, `Mover.h:1091`). */
export interface MarkedMover {
  objectId: number;
  added: { isPlayer: boolean; belligerence: number };
}

/**
 * The red corners of `RenderFocusObj` (`WndWorld.cpp:3109-3110`, `__CSC_VER11_2`): on a focus that is not the queued next
 * target (`m_pNextTargetObj`, `nextId`), while the button holds a target or the player auto-attacks (`m_bSelectTarget ||
 * m_bAutoAttack`; the `OBJACT_USESKILL` command is milestone 2's), on a mover that is not peaceful or is a player. White
 * otherwise.
 */
export function attackMarks(focus: MarkedMover, nextId: number | null, selectTarget: boolean, autoAttack: boolean): boolean {
  if (focus.objectId === nextId) return false;
  if (!selectTarget && !autoAttack) return false;
  return focus.added.belligerence !== Belli.PEACEFUL || focus.added.isPlayer;
}

/** The four corners of `RenderFocusObj` on the ground (`:3094-3100`), from `cells` (white or red). */
function cornerSprites(rect: ScreenRect, cells: number): Sprite[] {
  const at = (frame: number, x: number, y: number): Sprite => ({ frame: cells + frame, x, y, scale: 1, alpha: 255 });
  return [
    at(0, rect.left - CELL, rect.top - CELL),
    at(1, rect.right, rect.top - CELL),
    at(2, rect.left - CELL, rect.bottom),
    at(3, rect.right, rect.bottom),
  ];
}

/**
 * The corners on screen, through `painter`. `show` is what `RenderSelectObj` draws each frame: the focus's corners
 * (`:3002-3024`) and then, while auto-attacking, the queued next target's (`:3041-3056`), whose corners are white
 * (`RenderFocusObj` finds it is `m_pNextTargetObj`). The flying player's corners (`m_texTargetFly`, `:3094-3095`) are not
 * Piece 4's: the browser's player never flies.
 */
export class TargetMarks {
  constructor(private readonly painter: SpritePainter) {}

  /**
   * The focus's corners around `rect` (null: no focus, or none on screen), red when `attacking` (`attackMarks`), and the
   * next target's around `next` (null for none).
   */
  show(rect: ScreenRect | null, attacking: boolean, next: ScreenRect | null = null): void {
    const sprites: Sprite[] = [];
    if (rect !== null) sprites.push(...cornerSprites(rect, attacking ? RED : WHITE));
    if (next !== null) sprites.push(...cornerSprites(next, WHITE));
    this.painter.paint(sprites);
  }
}
