// A layer of pictures cut from one sheet, drawn over the 3D view in CSS pixels: what Neuz draws with
// `CTexturePack::Render` and `CTexture::Render` on its 2D render (`C2DRender::RenderTexture`,
// Source/_Common/2DRender.cpp:828-877) after the world. The damage numbers (`DamageNumbers`) and the target corners
// (`TargetMarks`) say what to draw each frame; this layer puts one element per picture on the page, as the name tags'
// layer does on the scene, reused from frame to frame.

import type { PackFrame } from '@flyffweb/formats';

/** One picture of a sheet on the screen: `CTexturePack::Render( p2DRender, point, index, alpha, scale, scale )`. */
export interface Sprite {
  /** The frame of the sheet: the number Neuz draws it by (`m_ap2DTexture[ index ]`). */
  frame: number;
  /** The point it is drawn at, its top left (the frames' centre is 0, 0), in whole CSS pixels (`CPoint`). */
  x: number;
  y: number;
  /** `fScaleX` and `fScaleY`, which are the same here: the frame is drawn `w * scale` by `h * scale`. */
  scale: number;
  /** The blend factor alpha (`D3DRS_TEXTUREFACTOR`), 0 to 255, which multiplies the picture's own. */
  alpha: number;
}

/** What draws the sprites of a layer: each call gives every sprite of the frame, in the order they are drawn. */
export interface SpritePainter {
  paint(sprites: readonly Sprite[]): void;
}

const LAYER_STYLE = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
const SPRITE_STYLE = 'position:absolute;left:0;top:0;background-repeat:no-repeat;transform-origin:0 0;';

/**
 * The flip of a `pos` frame (`CTexturePack::LoadScript`, `2DRender.cpp:1631-1687`: `h` swaps the left and right texture
 * coordinates, `v` the top and bottom ones), as a CSS transform of the frame's box, `w` by `h` pixels, onto itself.
 */
function flipOf(frame: PackFrame): string {
  switch (frame.flip) {
    case 'h':
      return ` translate(${frame.w}px,0) scale(-1,1)`;
    case 'v':
      return ` translate(0,${frame.h}px) scale(1,-1)`;
    case 'hv':
      return ` translate(${frame.w}px,${frame.h}px) scale(-1,-1)`;
    default:
      return '';
  }
}

/**
 * The sprites of the sheet `image` (a URL; the frames are rectangles of it, `frames`) as elements of `element`, which
 * the caller puts over the canvas. An element shows the frame's rectangle of the picture at its own size, then is scaled
 * and moved to the sprite's place; the browser filters it linearly when it is scaled, as D3D's `D3DTEXF_LINEAR` does
 * (`:858-859`). A sprite whose frame the sheet lacks is skipped (Neuz logs an error and fails, `2DRender.h:288-293`).
 */
export class SpriteLayer implements SpritePainter {
  readonly element: HTMLElement;
  private readonly pool: HTMLElement[] = [];
  /** How many of the pool the last paint showed. */
  private shown = 0;

  constructor(
    private readonly doc: Document,
    private readonly image: string,
    private readonly frames: readonly PackFrame[],
    name: string,
  ) {
    this.element = doc.createElement('div');
    this.element.className = name;
    this.element.style.cssText = LAYER_STYLE;
  }

  paint(sprites: readonly Sprite[]): void {
    let used = 0;
    for (const sprite of sprites) {
      const frame = this.frames[sprite.frame];
      if (frame === undefined) continue;
      const el = this.take(used++);
      const { style } = el;
      style.width = `${frame.w}px`;
      style.height = `${frame.h}px`;
      style.backgroundPosition = `${-frame.x}px ${-frame.y}px`;
      style.transform = `translate(${sprite.x}px,${sprite.y}px) scale(${sprite.scale})${flipOf(frame)}`;
      style.opacity = String(sprite.alpha / 255);
      style.display = '';
    }
    for (let i = used; i < this.shown; i++) this.pool[i]!.style.display = 'none';
    this.shown = used;
  }

  /** Takes the layer off the page. */
  dispose(): void {
    this.element.remove();
    this.pool.length = 0;
    this.shown = 0;
  }

  private take(index: number): HTMLElement {
    let el = this.pool[index];
    if (el === undefined) {
      el = this.doc.createElement('div');
      el.style.cssText = SPRITE_STYLE;
      el.style.backgroundImage = `url(${JSON.stringify(this.image)})`;
      this.element.append(el);
      this.pool.push(el);
    }
    return el;
  }
}
