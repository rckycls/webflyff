// The charge gauge of a wand or a bow over the own head (Piece 7 M2): `CMover::RenderGauge`, `_Common/MoverRender.cpp:925-986`.
// Neuz draws it in 2D after the world: the bound box's top over the mover, projected, 40 px up (:945-952); the five
// `GauMagCharge*.TGA` of the theme (`Neuz/Neuz.cpp:1613-1617`) at (x − 42, y − 5), x made even, alpha 200, scaled
// 0.8 × 0.55 (:954-963). The background always; then, falling through, level 4 adds the tail, 3 the second body, 2 the
// body and 1 the head (:965-981). Here it is a DOM layer of the five pictures over the canvas, as the HUD is.

import type { Vec3 } from '@flyffweb/formats';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { themeKey } from '../hud/art';
import type { UiArt } from '../hud/art';

/** The pictures' size in the theme: 112 × 16 (`GauMagChargeBG.TGA`). */
const PIECE_W = 112;
const PIECE_H = 16;
/** `vScal( 0.8f, 0.55f )` (:956). */
const SCALE_X = 0.8;
const SCALE_Y = 0.55;
/** `Render( ..., 200, ... )` (:963-981). */
const ALPHA = 200 / 255;
/** 40 px over the projected head (:952); the pictures at (x − 42, y − 5) (:954-955). */
const ABOVE_PX = 40;
const LEFT_PX = 42;
const UP_PX = 5;

/** The pieces in the order Neuz draws them, with the lowest level that draws each: the background at every level. */
const PIECES: ReadonlyArray<{ piece: string; file: string; from: number }> = [
  { piece: 'bg', file: 'GauMagChargeBG.TGA', from: 0 },
  { piece: 'tail', file: 'GauMagChargeTail.TGA', from: 4 },
  { piece: 'body2', file: 'GauMagChargeBody2.TGA', from: 3 },
  { piece: 'body', file: 'GauMagChargeBody.TGA', from: 2 },
  { piece: 'head', file: 'GauMagChargeHead.TGA', from: 1 },
];

const projected = new Vector3();

export class ChargeGauge {
  readonly element: HTMLDivElement;
  private readonly pieces: ReadonlyArray<{ img: HTMLImageElement; from: number }>;

  constructor(art: UiArt, doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'charge-gauge';
    element.hidden = true;
    const width = `${+(PIECE_W * SCALE_X).toFixed(2)}px`;
    const height = `${+(PIECE_H * SCALE_Y).toFixed(2)}px`;
    Object.assign(element.style, { position: 'absolute', pointerEvents: 'none', opacity: String(ALPHA), width, height });
    this.pieces = PIECES.map(({ piece, file, from }) => {
      const img = doc.createElement('img');
      img.alt = '';
      img.dataset.piece = piece;
      img.src = art.url(themeKey(file));
      Object.assign(img.style, { position: 'absolute', left: '0px', top: '0px', width, height });
      element.append(img);
      return { img, from };
    });
    this.element = element;
  }

  /**
   * Shows the gauge at `level` (0-4; null hides it: no wand or bow, or no focus) over `head`, the top of the own model in
   * the scene's coordinates, for a view `width` × `height` CSS pixels.
   */
  update(level: number | null, head: Vec3 | null, camera: Camera, width: number, height: number): void {
    if (level === null || head === null) { this.element.hidden = true; return; }
    projected.set(head[0], head[1], head[2]).project(camera);
    if (projected.z > 1) { this.element.hidden = true; return; } // behind the camera
    const x = Math.trunc((projected.x + 1) / 2 * width) & ~1;
    const y = Math.trunc((1 - projected.y) / 2 * height) - ABOVE_PX;
    this.element.style.left = `${x - LEFT_PX}px`;
    this.element.style.top = `${y - UP_PX}px`;
    for (const { img, from } of this.pieces) img.hidden = level < from;
    this.element.hidden = false;
  }

  dispose(): void {
    this.element.remove();
  }
}
