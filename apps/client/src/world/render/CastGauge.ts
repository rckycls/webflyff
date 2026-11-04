// An item cast's gauge over the own head (Piece 7 M3, [R §3]): `CMover::RenderCasting`, `_Common/MoverRender.cpp:1982-2043`,
// drawn for the own player while it is in STATE_BASEMOTION_MODE with `m_nReadyTime` set (`WndWorld.cpp:1040`). The
// bound box's top over the mover, projected, 48 px up (:2012-2018); `GauAccelBG.TGA` at (x − 42, y − 5), x made even,
// alpha 200, scaled 0.8 × 0.55 (:2021-2025); then `GauAccelInner.TGA` at the same point, alpha 255, the same scale, as
// wide as the fill (`GauPartyHp.TGA`'s 112 px times the time gone, `castFill`) (:2027-2041); the textures are
// `Neuz/Neuz.cpp:1624-1625`. Here it is a DOM layer of the two pictures over the canvas, as `ChargeGauge` is.
//
//   Function                  File:lines                         what
//   CMover::RenderCasting     _Common/MoverRender.cpp:1982-2043  where, the background, the fill
//   CWndWorld::OnEraseBkgnd   _Interface/WndWorld.cpp:1040       the own player's only

import type { Vec3 } from '@flyffweb/formats';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { themeKey } from '../hud/art';
import type { UiArt } from '../hud/art';

/** The pictures' size in the theme: 112 × 16 (`GauAccelBG.TGA`, `GauAccelInner.TGA`). */
const PIECE_W = 112;
const PIECE_H = 16;
/** `RenderScal( ..., 0.8f, 0.55f )` and `Render( ..., 0.8f, 0.55f )` (:2025, :2041). */
const SCALE_X = 0.8;
const SCALE_Y = 0.55;
/** The background's `RenderScal( ..., 200, ... )` (:2025); the fill's alpha is 255. */
const BG_ALPHA = 200 / 255;
/** 48 px over the projected head (:2018); the pictures at (x − 40 − 2, y − 3 − 2) (:2020-2023). */
const ABOVE_PX = 48;
const LEFT_PX = 42;
const UP_PX = 5;

const px = (n: number): string => `${+n.toFixed(2)}px`;
const projected = new Vector3();

export class CastGauge {
  readonly element: HTMLDivElement;
  private readonly fill: HTMLImageElement;

  constructor(art: UiArt, doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'cast-gauge';
    element.hidden = true;
    const width = px(PIECE_W * SCALE_X);
    const height = px(PIECE_H * SCALE_Y);
    Object.assign(element.style, { position: 'absolute', pointerEvents: 'none', width, height });
    const picture = (piece: string, file: string): HTMLImageElement => {
      const img = doc.createElement('img');
      img.alt = '';
      img.dataset.piece = piece;
      img.src = art.url(themeKey(file));
      Object.assign(img.style, { position: 'absolute', left: '0px', top: '0px', width, height });
      element.append(img);
      return img;
    };
    picture('bg', 'GauAccelBG.TGA').style.opacity = String(BG_ALPHA);
    this.fill = picture('fill', 'GauAccelInner.TGA');
    this.element = element;
  }

  /**
   * Shows the gauge with `fill` (0-112, `castFill`; null hides it: no cast with a start) over `head`, the top of the own
   * model in the scene's coordinates, for a view `width` × `height` CSS pixels.
   */
  update(fill: number | null, head: Vec3 | null, camera: Camera, width: number, height: number): void {
    if (fill === null || head === null) { this.element.hidden = true; return; }
    projected.set(head[0], head[1], head[2]).project(camera);
    if (projected.z > 1) { this.element.hidden = true; return; } // behind the camera
    const x = Math.trunc((projected.x + 1) / 2 * width);
    const y = Math.trunc((1 - projected.y) / 2 * height) - ABOVE_PX;
    this.element.style.left = `${(x - LEFT_PX) & ~1}px`; // MakeEven( p.x )
    this.element.style.top = `${y - UP_PX}px`;
    this.fill.style.width = px(fill * SCALE_X);
    this.element.hidden = false;
  }

  dispose(): void {
    this.element.remove();
  }
}
