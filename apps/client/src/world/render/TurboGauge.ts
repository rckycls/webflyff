// The turbo gauge over the own flier (Piece 7 M5, Decision 7): `CMover::RenderTurboGauge`, `_Common/MoverRender.cpp:990-1089`,
// drawn for the own player while it flies (`CWndWorld::OnEraseBkgnd`, `WndWorld.cpp:1001-1007`) with `m_tmAccFuel` out of
// 12000. The bound box's top over the mover, projected, 43 px up and 40 left (:1018); `GauAccelBG.TGA` at (x − 2, y − 2),
// x made even, alpha 200, scaled 0.8 × 0.55; then `GauAccelInner.TGA` as wide as `112 * accFuel / 12000`, or, with the
// turbo on, on every other frame a white bar `(96 * v / max) * 0.8` wide (:1031-1047). The speed (`g_nFlySpeed`), which
// Neuz writes in its digital font, is a plain number beside the gauge here (the font sheet is not converted). A DOM layer
// of the pictures over the canvas, as `CastGauge` is.

import type { Vec3 } from '@flyffweb/formats';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { themeKey } from '../hud/art';
import type { UiArt } from '../hud/art';

/** The pictures' size in the theme: 112 × 16. */
const PIECE_W = 112;
const PIECE_H = 16;
const SCALE_X = 0.8;
const SCALE_Y = 0.55;
const ALPHA = 200 / 255;
/** `CPoint( vOut.x - 80 / 2, vOut.y - 40 - 3 )`, then 2 left and 2 up. */
const LEFT_PX = 40 + 2;
const UP_PX = 43 + 2;
/** The turbo fuel the gauge shows full: `m_tmAccFuel`'s most, 12 s. */
export const TURBO_FUEL_MAX = 12000;
/** The white bar's `p.y + 1` to `p.y + 6`, from `p.x + 1`. */
const WHITE_H = 5;

const px = (n: number): string => `${+n.toFixed(2)}px`;
const projected = new Vector3();

export class TurboGauge {
  readonly element: HTMLDivElement;
  private readonly fill: HTMLImageElement;
  private readonly white: HTMLDivElement;
  private readonly speed: HTMLSpanElement;

  constructor(art: UiArt, doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'turbo-gauge';
    element.hidden = true;
    const width = px(PIECE_W * SCALE_X);
    const height = px(PIECE_H * SCALE_Y);
    Object.assign(element.style, { position: 'absolute', pointerEvents: 'none', width, height });
    const picture = (piece: string, file: string): HTMLImageElement => {
      const img = doc.createElement('img');
      img.alt = '';
      img.dataset.piece = piece;
      img.src = art.url(themeKey(file));
      Object.assign(img.style, { position: 'absolute', left: '0px', top: '0px', width, height, opacity: String(ALPHA) });
      element.append(img);
      return img;
    };
    picture('bg', 'GauAccelBG.TGA');
    this.fill = picture('fill', 'GauAccelInner.TGA');
    const white = doc.createElement('div');
    white.dataset.piece = 'white';
    white.hidden = true;
    Object.assign(white.style, { position: 'absolute', left: '1px', top: '1px', height: `${WHITE_H}px`, background: '#fff' });
    element.append(white);
    this.white = white;
    const speed = doc.createElement('span');
    speed.dataset.piece = 'speed';
    Object.assign(speed.style, {
      position: 'absolute', left: `${width}`, top: '-3px', marginLeft: '6px', color: '#fff',
      font: '700 13px/1 system-ui, sans-serif', textShadow: '0 1px 2px #000',
    });
    element.append(speed);
    this.speed = speed;
    this.element = element;
  }

  /**
   * Shows the gauge for `accFuel` (ms of turbo; null hides it: not flying), the turbo on or off, the speed shown, the drawn
   * frame's count (`g_nRenderCnt`: the white bar on its even frames), over `head`, the top of the own model in the scene's
   * coordinates, for a view `width` × `height` CSS pixels.
   */
  update(
    accFuel: number | null, turbo: boolean, speedShown: number, frame: number, head: Vec3 | null, camera: Camera,
    width: number, height: number,
  ): void {
    if (accFuel === null || head === null) { this.element.hidden = true; return; }
    projected.set(head[0], head[1], head[2]).project(camera);
    if (projected.z > 1) { this.element.hidden = true; return; } // behind the camera
    const x = Math.trunc((projected.x + 1) / 2 * width);
    const y = Math.trunc((1 - projected.y) / 2 * height);
    this.element.style.left = `${(x - LEFT_PX) & ~1}px`; // MakeEven( p.x )
    this.element.style.top = `${y - UP_PX}px`;
    const value = Math.max(0, Math.min(accFuel, TURBO_FUEL_MAX));
    const flash = turbo && (frame & 1) === 0;
    this.fill.hidden = flash;
    this.fill.style.width = px(Math.trunc((PIECE_W * value) / TURBO_FUEL_MAX) * SCALE_X);
    this.white.hidden = !flash;
    if (flash) this.white.style.width = `${Math.max(0, Math.trunc(Math.trunc((96 * value) / TURBO_FUEL_MAX) * 0.8) - 1)}px`;
    this.speed.textContent = String(speedShown);
    this.element.hidden = false;
  }

  dispose(): void {
    this.element.remove();
  }
}
