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
/**
 * 2026-11-09: the Master or Hero mark (`RenderName`, MoverRender.cpp:1495-1563): 25 x 25, its left at half the name's
 * width right of the head point (3 px after the name, which is 3 px left of centred), its bottom 5 px above the point.
 */
const MARK_PX = 25;
const MARK_BOTTOM_PX = 5;
/**
 * 2026-11-10 (guild): the guild line 12 px above the name (`vOut.y - 32` against `- 20`), centred the same way, and the
 * 24 x 24 logo left of the wider of the two lines, 2 px off it, its top 29 px above the head point (`RenderName`,
 * `MoverRender.cpp:1569-1646`). The logo is drawn opaque (DESTBLEND ZERO): its black stays black.
 */
const GUILD_ABOVE_PX = 32;
const LOGO_PX = 24;
const LOGO_GAP_PX = 2;
const LOGO_BOTTOM_PX = 5;
/** The canvas is drawn at the screen's pixel ratio, as the renderer is (at most 2: `createRenderer`). */
const MAX_PIXEL_RATIO = 2;

interface Tag {
  sprite: Sprite;
  texture: CanvasTexture;
  maxDistance: number;
  /** What it was drawn with, for `recolor`. */
  text: string;
  color: number;
  mark: string | null;
  /** 2026-11-10: the guild line it was drawn with ('' for none), for `recolor` and the tests. */
  guild: string;
  /** The canvas in CSS pixels. */
  width: number;
  height: number;
}

const cssColor = (argb: number): string => {
  const [r, g, b] = d3dColor(argb).map((c) => Math.round(c * 255));
  return `rgb(${r}, ${g}, ${b})`;
};

const at = new Vector3();

/** A tag's guild line as one string ('' for none): what `recolor` compares and the tests read. */
const guildKey = (tag: NameTag): string =>
  (tag.guild === undefined ? '' : `${tag.guild.text}|${tag.guild.color.toString(16)}|${tag.guild.logo ?? ''}`);

export class NameTagLayer {
  private readonly tags = new Map<number, Tag>();

  constructor(
    private readonly scene: Scene,
    private readonly doc: Document,
    /** 2026-11-09: a picture's URL by its key (the marks'), '' for one the store lacks. */
    private readonly url: (key: string) => string = () => '',
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
   * Asks `tagOf` again for every mover in view (the party changed: `COLOR_PARTY`; a mode changed: MODIFYMODE): a tag whose
   * text or colour differs is drawn again, one `tagOf` now gives none is dropped, and a mover that had none gets one when
   * `tagOf` now gives it (2026-11-10: a player seen again after /noinvisible). The others stay as they are.
   */
  recolor(movers: ReadonlyMap<number, Mover>, tagOf: (mover: Mover) => NameTag | null): void {
    for (const objectId of [...this.tags.keys()]) if (!movers.has(objectId)) this.remove(objectId);
    movers.forEach((mover, objectId) => {
      const old = this.tags.get(objectId);
      const tag = tagOf(mover);
      if (old === undefined) {
        if (tag !== null && tag.text !== '') this.add(objectId, tag);
        return;
      }
      if (tag !== null && tag.text === old.text && tag.color === old.color && (tag.mark ?? null) === old.mark && guildKey(tag) === old.guild) return;
      this.remove(objectId);
      if (tag !== null && tag.text !== '') this.add(objectId, tag);
    });
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
    // forEach and no spread: nothing made per tag a frame (Piece 6 M5, part B)
    this.tags.forEach((tag, objectId) => {
      const place = placeOf(objectId);
      const opacity = place === null ? 0 : tagOpacity(camera.position.distanceTo(at.set(place.at[0], place.at[1], place.at[2])), tag.maxDistance);
      tag.sprite.visible = opacity > 0;
      if (place === null || opacity <= 0) return;
      tag.sprite.position.set(place.head[0], place.head[1], place.head[2]);
      tag.sprite.scale.set(tag.width * pixel, tag.height * pixel, 1);
      (tag.sprite.material as SpriteMaterial).opacity = opacity;
    });
  }

  /** The movers that have a tag. */
  count(): number {
    return this.tags.size;
  }

  /** 2026-11-10: the text of the mover's tag, or null when it has none (for the tests' hooks). */
  textOf(objectId: number): string | null {
    return this.tags.get(objectId)?.text ?? null;
  }

  /** 2026-11-10: the guild line of the mover's tag ("name|colour|logo"), '' for none, null without a tag (the tests' hooks). */
  guildOf(objectId: number): string | null {
    return this.tags.get(objectId)?.guild ?? null;
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
    const textWidth = Math.ceil(context.measureText(tag.text).width);
    // the box round the head point (0, 0), y down: the text's top 20 px above it and 3 px left of centred, the mark after
    const mark = tag.mark ?? null;
    const guild = tag.guild;
    const guildWidth = guild === undefined ? 0 : Math.ceil(context.measureText(guild.text).width);
    // the mark and the logo go by the wider of the two lines (`:1514-1522`, `:1631-1642`)
    const wide = Math.max(textWidth, guildWidth);
    const textLeft = -Math.floor(textWidth / 2) - LEFT_PX, textTop = -ABOVE_PX;
    const guildLeft = -Math.floor(guildWidth / 2) - LEFT_PX, guildTop = -GUILD_ABOVE_PX;
    const logo = guild?.logo ?? null;
    const logoLeft = -Math.floor(wide / 2) - (LOGO_PX + LOGO_GAP_PX), logoTop = -(LOGO_PX + LOGO_BOTTOM_PX);
    const markLeft = Math.ceil(wide / 2), markTop = -(MARK_PX + MARK_BOTTOM_PX);
    const left = Math.min(textLeft - OUTLINE_PX, guild === undefined ? Infinity : guildLeft - OUTLINE_PX, logo === null ? Infinity : logoLeft);
    const top = Math.min(textTop - OUTLINE_PX, mark === null ? Infinity : markTop, guild === undefined ? Infinity : guildTop - OUTLINE_PX,
      logo === null ? Infinity : logoTop);
    const right = Math.max(textLeft + textWidth + OUTLINE_PX, mark === null ? -Infinity : markLeft + MARK_PX,
      guild === undefined ? -Infinity : guildLeft + guildWidth + OUTLINE_PX);
    const bottom = textTop + LINE_PX + OUTLINE_PX;
    const width = right - left;
    const height = bottom - top;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    // resizing the canvas resets its state
    context.scale(ratio, ratio);
    context.font = FONT;
    context.textBaseline = 'top';
    context.lineJoin = 'round';
    context.lineWidth = 2 * OUTLINE_PX;
    context.strokeStyle = OUTLINE_COLOR;
    context.strokeText(tag.text, textLeft - left, textTop - top);
    context.fillStyle = cssColor(tag.color);
    context.fillText(tag.text, textLeft - left, textTop - top);
    if (guild !== undefined) {
      context.strokeText(guild.text, guildLeft - left, guildTop - top);
      context.fillStyle = cssColor(guild.color);
      context.fillText(guild.text, guildLeft - left, guildTop - top);
    }

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
    sprite.center.set(-left / width, 1 + top / height);
    // written after the world, as Neuz writes names last
    sprite.renderOrder = 1;
    sprite.visible = false;
    this.scene.add(sprite);
    this.tags.set(objectId, {
      sprite, texture, maxDistance: tag.maxDistance, text: tag.text, color: tag.color, mark, guild: guildKey(tag), width, height,
    });
    // the mark and the logo are drawn into the tag once their pictures are in
    const picture = (key: string | null, x: number, y: number, size: number): void => {
      const src = key === null ? '' : this.url(key);
      if (src === '') return;
      const image = new Image();
      image.onload = () => {
        if (this.tags.get(objectId)?.texture !== texture) return; // the tag was drawn again or dropped meanwhile
        context.drawImage(image, x - left, y - top, size, size);
        texture.needsUpdate = true;
      };
      image.src = src;
    };
    picture(mark, markLeft, markTop, MARK_PX);
    picture(logo, logoLeft, logoTop, LOGO_PX);
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
