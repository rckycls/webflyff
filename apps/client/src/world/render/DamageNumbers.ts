// The damage numbers over the movers: Neuz's `CDamageNum` and `CDamageNumMng` (Source/_Common/2DRender.cpp:1855-2070,
// 2DRender.h:317-370). A number is made at a mover's feet when a hit or a death is shown (`AddNumber`), steps with the
// game's 60 Hz ticks (`Process`, which `CNeuzApp::FrameMove` calls, Neuz/Neuz.cpp:1084) and is drawn with the world window
// (`Render`, _Interface/WndWorld.cpp:1092) in the glyphs of `SFX/DmgEffect.inc`: a screen-space layer, like the name
// tags, here a `SpriteLayer` of the converted `DmgEffect.dds`.

import type { PackFrame, Vec3 } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import type { Sprite, SpritePainter } from './SpriteLayer';

const f32 = Math.fround;

/** `if( pDamagenum->m_nFrame >= 100 )` the number is deleted (`CDamageNumMng::Process`, `2DRender.cpp:2041-2052`). */
const LIFE_FRAMES = 100;
/** `nIndex = strTemp[i] - '0' + m_nAttribute * 14` (`:1961`): the second colour set starts at glyph 14. */
const SET_GLYPHS = 14;
/** `m_vPos + D3DXVECTOR3( 0, 1.0f, 0 )` (`:1862`, `:1925`): the number is placed 1 m over the feet. */
const RAISE = 1;
/** `0.05f` (`:1940`): the scale the fade grows by a tick. */
const FADE_GROWTH = f32(0.05);

/** A point on the drawing, in CSS pixels from its top left (`D3DXVec3Project` with the viewport at 0, 0). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Where a D3D point is on the drawing, or null when it is behind the camera. */
export type Project = (p: Vec3) => ScreenPoint | null;

/**
 * The projection `CDamageNum::Render` makes with the camera's view and projection and the viewport
 * (`2DRender.cpp:1919-1926`; `CWndWorld` copies them for it, `WndWorld.cpp:1079-1081`): null for a point behind the
 * camera (`D3DXVec3TransformCoord( &vTemp, &m_vPos, &m_matView ); if( vTemp.z < 0 ) return;`: D3D's view looks down +z,
 * the web's down -z), else `D3DXVec3Project` on a viewport `width` by `height` CSS pixels at 0, 0. The camera's matrices
 * are taken as they are: the renderer brings them up to date as it draws.
 */
export function screenProjector(camera: Camera, width: number, height: number): Project {
  const v = new Vector3();
  return (p) => {
    v.set(...toWebPosition(p)).applyMatrix4(camera.matrixWorldInverse);
    if (v.z > 0) return null;
    v.applyMatrix4(camera.projectionMatrix);
    return { x: ((v.x + 1) * width) / 2, y: ((1 - v.y) * height) / 2 };
  };
}

/** `D3DXVECTOR3` `m_vPos + D3DXVECTOR3( 0, 1.0f, 0 )`, in floats. */
const raised = (p: Vec3): Vec3 => [p[0], f32(p[1] + RAISE), p[2]];

/** `(LONG)` / `(int)` of a float: towards zero (and no negative zero, which an integer has not). */
const toInt = (v: number): number => Math.trunc(v) + 0;

/** One `CDamageNum` (`2DRender.h:319-333`). */
interface DamageNum {
  /** `m_vPos`: the feet of the mover, when the number was made. */
  pos: Vec3;
  /** `m_nNumber`. */
  number: number;
  /** `m_nAttribute`: 0 when the own player was hurt, 1 otherwise. */
  attribute: 0 | 1;
  /** `m_nFrame`, which `Process` and `Render` both count. */
  frame: number;
  /** `m_nState` (0 to 4), `m_nCnt`, `m_fDy`. */
  state: number;
  cnt: number;
  dy: number;
  /**
   * `m_fY`: the screen y, projected at the first `Process` and moved by `m_fDy` at each. Null while the projection is not
   * known (a number made before the layer was ever drawn): the moves wait in `pending` for the first draw.
   */
  y: number | null;
  pending: number;
}

/**
 * The numbers on screen. `add` is `CDamageNumMng::AddNumber( vPos, nNumber, nAttribute )` (`2DRender.cpp:2025-2029`),
 * `step` its `Process` (`:2041-2052`) and `draw` its `Render` (`:2054-2064`), which paints every glyph through
 * `painter`, in the order the numbers came (several at one place overlap, as in Neuz).
 *
 * **Time.** `CDamageNum::Process` runs once a tick and moves the number; `Render` runs once a drawn frame, and both count
 * `m_nFrame`, which ends the number at 100 (`:1909`, `:2000`): drawn every tick, a number lives 50 ticks. Neuz draws at
 * most once a tick (`CD3DApplication::Render3DEnvironment` runs one `FrameMove`, then a `Render` unless it is behind,
 * `_DirectX/d3dapp.cpp:1641-1678`), and `g_nRenderCnt`, whose parity shakes the numbers, counts those renders
 * (`Neuz.cpp:788`). So a `draw` counts as a render only when a `step` came since the last one; a browser frame with no
 * step in between (a screen faster than 60 Hz) paints nothing new, and a frame after several steps is one render, as a
 * frame Neuz skips while behind.
 *
 * **The projection.** `Process` projects with the view and projection the last `Render` had (`CDamageNumMng::m_matView`,
 * `m_matProj`): `step` uses the `project` of the last `draw`.
 */
export class DamageNumbers {
  private numbers: DamageNum[] = [];
  /** The projection of the last draw: `CDamageNumMng`'s matrices and viewport. */
  private project: Project | null = null;
  /** A step came since the last render. */
  private stepped = false;
  /** `g_nRenderCnt`: the renders so far. */
  private renders = 0;

  /**
   * @param frames   The glyphs of `SFX/DmgEffect.inc` (`WebUiSheets.damageDigits.frames`): digits 0-9 and 14-23.
   * @param painter  Where the glyphs are drawn (a `SpriteLayer` of `DmgEffect.dds`).
   */
  constructor(
    private readonly frames: readonly PackFrame[],
    private readonly painter: SpritePainter,
  ) {}

  /**
   * A number `value` at `worldPos` (D3D, the mover's `GetPos()`): `AddNumber( vPos, nNumber, nAttribute )` with the
   * attribute `IsActiveMover() ? 0 : 1` of the hurt mover (`ownHurt`: the own player), which picks the colour set
   * (`DPClient.cpp:1872`, `:1895`, `:2007`).
   */
  add(worldPos: Vec3, value: number, ownHurt: boolean): void {
    this.numbers.push({
      pos: [f32(worldPos[0]), f32(worldPos[1]), f32(worldPos[2])], number: value, attribute: ownHurt ? 0 : 1,
      frame: 0, state: 0, cnt: 0, dy: 0, y: null, pending: 0,
    });
  }

  /** One tick: `CDamageNumMng::Process`: a number at the end of its life (`m_nFrame >= 100`) goes, the others `Process`. */
  step(): void {
    this.numbers = this.numbers.filter((n) => {
      if (n.frame >= LIFE_FRAMES) return false;
      this.process(n);
      return true;
    });
    this.stepped = true;
  }

  /**
   * `CDamageNumMng::Render`: each number's glyphs, projected by `project`, to the painter; at most once a step (see the
   * class). A number whose feet are behind the camera is not drawn, and its render does not count towards its life.
   */
  draw(project: Project): void {
    this.project = project;
    if (!this.stepped) return;
    this.stepped = false;
    this.renders++;
    const sprites: Sprite[] = [];
    for (const n of this.numbers) this.render(n, project, sprites);
    this.painter.paint(sprites);
  }

  /** The numbers alive. */
  count(): number {
    return this.numbers.length;
  }

  /**
   * `CDamageNum::Process` (`2DRender.cpp:1855-1910`): the first tick takes the screen y of the point 1 m over the feet
   * and starts the rise; 8 ticks rise 10 px; then 10 shake 3 px up or down by the parity of `g_nRenderCnt`; 15 hold; then
   * the fade rises 2 px a tick. Each tick `m_fY -= m_fDy`, and `m_nCnt` and `m_nFrame` count it.
   */
  private process(n: DamageNum): void {
    switch (n.state) {
      case 0: {
        // init: m_fY = vTemp.y of the point over the feet, m_fDy = 10
        const at = this.project?.(raised(n.pos)) ?? null;
        n.y = at === null ? null : f32(at.y);
        n.dy = 10;
        n.state++;
        break;
      }
      case 1: // rising
        if (n.cnt >= 8) {
          n.state++;
          n.cnt = 0;
          n.dy = 0;
        }
        break;
      case 2: // shaking
        n.dy = this.renders & 1 ? -3 : 3;
        if (n.cnt >= 10) {
          n.state++;
          n.dy = 0;
          n.cnt = 0;
        }
        break;
      case 3: // holding
        if (n.cnt >= 15) {
          n.cnt = 0;
          n.dy = 2;
          n.state++;
        }
        break;
      default: // 4, fading
        break;
    }
    if (n.y === null) n.pending += n.dy;
    else n.y = f32(n.y - n.dy);
    n.cnt++;
    n.frame++;
  }

  /**
   * `CDamageNum::Render` (`2DRender.cpp:1913-2001`) for a number (`m_nAttribute < 4`): nothing while the feet are behind
   * the camera; else x is the projected point over the feet, y the one `Process` keeps; the scale is 2 (3 + 0.05 cnt
   * fading) over 4, and the alpha 255 (75 - 2 cnt fading, at least 0). The digits of `"%d"` are drawn from the left edge
   * of the centred string, `fX -= fScaleX * width0 * (1 + 0.5 (n - 1)) / 2`, each `width * 0.5 * fScaleX` after the last
   * (they overlap by half), at the integer point.
   */
  private render(n: DamageNum, project: Project, out: Sprite[]): void {
    if (project(n.pos) === null) return;
    const at = project(raised(n.pos));
    if (at === null) return;
    if (n.y === null) n.y = f32(f32(at.y) - n.pending);
    let fx = f32(at.x);
    const fy = n.y;
    let scale = 2;
    let alpha = 255;
    if (n.state === 4) {
      scale = f32(3 + f32(n.cnt * FADE_GROWTH));
      alpha = Math.max(0, 75 - n.cnt * 2);
    }
    scale = f32(scale / 4);
    // sprintf( "%d", m_nNumber ) of a DWORD: its signed value
    const text = String(n.number | 0);
    const first = this.frames[0]?.w ?? 0;
    fx = f32(fx - f32(f32(f32(scale * first) * f32(1 + f32(0.5 * (text.length - 1)))) / 2));
    for (const ch of text) {
      const index = ch.charCodeAt(0) - 48 + n.attribute * SET_GLYPHS;
      // `if( (int)nIndex >= 0 )`: a '-' of the first set is no glyph (and its width, read out of the array, is not known)
      if (index >= 0) out.push({ frame: index, x: toInt(fx), y: toInt(fy), scale, alpha });
      // (FLOAT)( fX + ( m_size.cx * 0.5 * fScaleX ) ), in doubles
      fx = f32(fx + (this.frames[index]?.w ?? 0) * 0.5 * scale);
    }
    n.frame++;
  }
}
