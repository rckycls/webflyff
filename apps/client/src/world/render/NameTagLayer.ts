// The name tags above the movers, the own character's included: the text and colour `nameTagOf` gives, drawn as Neuz
// draws names. Neuz writes them on the screen last, with its world font, over everything (`CWorld::Render` step 5,
// `World3D.cpp:1262-1300`); here each is a sprite of a canvas, the same size in pixels at any distance and drawn
// without the depth test, so it is never hidden behind a wall either. Past its distance it fades (`tagOpacity`).

import type { Vec3 } from '@flyffweb/formats';
import { d3dColor } from '@flyffweb/scene';
import type { PerspectiveCamera, Scene } from 'three';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Mover, WorldChanges } from '../WorldState';
import { tagOpacity } from './nameTags';
import type { NameTag } from './nameTags';

/**
 * `FontWorld`, the font names are written in (`CTheme`, `_Interface/ITheme.cpp:91-124`, `__LANG_1013`): the English row of
 * `propLang.txt` makes it Verdana at 9 points, which `CD3DFont::CreateGDIFont` makes 12 px at 96 dpi
 * (`-MulDiv( 9, LOGPIXELSY, 72 )`, `_DirectX/d3dfont.cpp:565`), outlined 2 px in ARGB(255, 60, 60, 60) (`MakeOutLine`).
 */
const FONT_PX = 12;
const FONT = `${FONT_PX}px Verdana, sans-serif`;
const OUTLINE_PX = 2;
const OUTLINE_COLOR = 'rgb(60, 60, 60)';
/** The height of a line of the font: `GetTextExtentPoint32( "W" ).cy + 2` (`d3dfont.cpp:618-622`), about 15 px for Verdana 12 px. */
const LINE_PX = 15;
/** `CMover::RenderName` writes the text from 20 px above the projected top of the model and 3 px left of centred (`MoverRender.cpp:1358-1363`). */
const ABOVE_PX = 20;
const LEFT_PX = 3;
/** The canvas is drawn at the screen's pixel ratio, as the renderer is (at most 2: `createRenderer`). */
const MAX_PIXEL_RATIO = 2;

interface Tag {
  sprite: Sprite;
  texture: CanvasTexture;
  maxDistance: number;
  /** The canvas in CSS pixels. */
  width: number;
  height: number;
}

const cssColor = (argb: number): string => {
  const [r, g, b] = d3dColor(argb).map((c) => Math.round(c * 255));
  return `rgb(${r}, ${g}, ${b})`;
};

const at = new Vector3();

export class NameTagLayer {
  private readonly tags = new Map<number, Tag>();

  constructor(
    private readonly scene: Scene,
    private readonly doc: Document,
  ) {}

  /** Drops the tags of the movers that left and makes one for each mover that came, unless `tagOf` gives it none. */
  sync(changes: WorldChanges, movers: ReadonlyMap<number, Mover>, tagOf: (mover: Mover) => NameTag | null): void {
    for (const objectId of changes.removed) this.remove(objectId);
    for (const mover of changes.added) {
      if (movers.get(mover.objectId) !== mover || this.tags.has(mover.objectId)) continue;
      const tag = tagOf(mover);
      if (tag !== null && tag.text !== '') this.add(mover.objectId, tag);
    }
  }

  /**
   * Puts each tag over its mover's head, `placeOf` giving where the mover is drawn and the top of its model (null hides
   * the tag), sized to its pixels for a viewport `heightPx` CSS pixels high and faded by its distance from the camera
   * (`m_fDistCamera`: to the mover's position).
   */
  update(camera: PerspectiveCamera, heightPx: number, placeOf: (objectId: number) => { at: Vec3; head: Vec3 } | null): void {
    // A sprite without size attenuation is `scale` times its distance wide in view space, so `scale * P11 / 2` of the
    // viewport's height on screen; this is the scale of one pixel.
    const pixel = 2 / (camera.projectionMatrix.elements[5]! * Math.max(1, heightPx));
    for (const [objectId, tag] of this.tags) {
      const place = placeOf(objectId);
      const opacity = place === null ? 0 : tagOpacity(camera.position.distanceTo(at.set(...place.at)), tag.maxDistance);
      tag.sprite.visible = opacity > 0;
      if (place === null || opacity <= 0) continue;
      tag.sprite.position.set(...place.head);
      tag.sprite.scale.set(tag.width * pixel, tag.height * pixel, 1);
      (tag.sprite.material as SpriteMaterial).opacity = opacity;
    }
  }

  /** The movers that have a tag. */
  count(): number {
    return this.tags.size;
  }

  dispose(): void {
    for (const objectId of [...this.tags.keys()]) this.remove(objectId);
  }

  private add(objectId: number, tag: NameTag): void {
    const ratio = Math.min(this.doc.defaultView?.devicePixelRatio ?? 1, MAX_PIXEL_RATIO);
    const canvas = this.doc.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.font = FONT;
    const width = Math.ceil(context.measureText(tag.text).width) + 2 * OUTLINE_PX;
    const height = LINE_PX + 2 * OUTLINE_PX;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    // resizing the canvas resets its state
    context.scale(ratio, ratio);
    context.font = FONT;
    context.textBaseline = 'top';
    context.lineJoin = 'round';
    context.lineWidth = 2 * OUTLINE_PX;
    context.strokeStyle = OUTLINE_COLOR;
    context.strokeText(tag.text, OUTLINE_PX, OUTLINE_PX);
    context.fillStyle = cssColor(tag.color);
    context.fillText(tag.text, OUTLINE_PX, OUTLINE_PX);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    const material = new SpriteMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false,
    });
    const sprite = new Sprite(material);
    sprite.name = `name tag ${objectId}`;
    // anchored on the head: the text's top 20 px above it (with the outline over that) and 3 px left of centred
    sprite.center.set(0.5 + LEFT_PX / width, 1 - (ABOVE_PX + OUTLINE_PX) / height);
    // written after the world, as Neuz writes names last
    sprite.renderOrder = 1;
    sprite.visible = false;
    this.scene.add(sprite);
    this.tags.set(objectId, { sprite, texture, maxDistance: tag.maxDistance, width, height });
  }

  private remove(objectId: number): void {
    const tag = this.tags.get(objectId);
    if (tag === undefined) return;
    this.tags.delete(objectId);
    tag.sprite.removeFromParent();
    tag.texture.dispose();
    (tag.sprite.material as SpriteMaterial).dispose();
  }
}
