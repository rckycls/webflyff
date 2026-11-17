import type { Vec3 } from '@flyffweb/formats';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import { themeKey } from '../hud/art';

interface Bubble { sprite: Sprite; texture: CanvasTexture; width: number; height: number; expires: number; kind: BubbleKind; picture: boolean }
const position = new Vector3();

/** A line said nearby, in a party or a guild (the layer's own balloon), or a shout (Neuz's shout picture). */
export type BubbleKind = 'say' | 'shout';

const FONT = '12px Arial, sans-serif';
const LINE_PX = 15;
/** How far over the head point a balloon's tail ends. */
const GAP_PX = 28;
/** The shout's picture and text are drawn at alpha 200 (`nAlpha`, `SetAlpha( nAlpha )`: DialogMsg.cpp:420, :514, :622). */
const SHOUT_ALPHA = 200 / 255;

/**
 * The shout's picture by the text's length in characters (`_tcsclen( lpStr )`, DialogMsg.cpp:485-509): 1, 2-3, 4-5, 6-9,
 * 10-20, 21-40, 41-60, 61 and more.
 */
export function shoutPicture(text: string): string {
  const length = [...text].length;
  const index = length <= 1 ? 0 : length <= 3 ? 1 : length <= 5 ? 2 : length <= 9 ? 3 : length <= 20 ? 4 : length <= 40 ? 5 : length <= 60 ? 6 : 7;
  return `texDialogBoxShout0${index}.bmp`;
}

const upTo16 = (value: number): number => Math.ceil(value / 16) * 16;

/** The text's lines, broken by measured characters (long words too) at `maxWidth`, at most `maxLines`. */
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []; let line = '';
  for (const character of text.slice(0, 1023)) {
    if (character === '\n' || context.measureText(line + character).width > maxWidth) {
      lines.push(line); line = '';
      if (lines.length === maxLines) break;
    }
    if (character !== '\n') line += character;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Where Neuz may break an English line: after one of these (`CEditString::Align`, EditString.cpp:742). */
const BREAKS = ' +-*^/%=;(),\':{}.';

/**
 * 2026-11-17: a shout's lines as Neuz breaks them in English (`CEditString::Align`, EditString.cpp:681-805, word alignment
 * on: :6-9, :719-728). A line takes characters while they fit in `maxWidth`, a space never ending it; at the first that
 * does not fit, it ends after the last break point it has (that one kept, even past the width), else before that
 * character. A '\n' ends a line too.
 */
export function neuzLines(context: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  const chars = [...text], lines: string[] = [];
  let offset = 0;
  while (offset < chars.length) {
    const start = offset;
    let after = 0, end = -1;
    while (offset < chars.length) {
      const character = chars[offset]!;
      if (BREAKS.includes(character)) after = offset + 1;
      if (character === '\n') { end = offset; offset++; break; }
      const width = context.measureText(chars.slice(start, offset + 1).join('')).width;
      if (character !== ' ' && width > maxWidth && offset > start) {
        if (after > start) offset = after;
        break;
      }
      offset++;
    }
    lines.push(chars.slice(start, end < 0 ? offset : end).join(''));
  }
  return lines;
}

/** Native CDialogMsg uses a 5000ms lifetime. Messages enter only from server echoes. */
export class SpeechBubbleLayer {
  private readonly bubbles = new Map<number, Bubble>();
  private readonly pictures = new Map<string, HTMLImageElement>();
  constructor(private readonly scene: Scene, private readonly doc: Document, private readonly now = () => performance.now(),
    /** 2026-11-17: a picture's URL by its key (the shout's), '' for one the store lacks. */
    private readonly url: (key: string) => string = () => '') {}

  /** A balloon over `objectId` for 5 s, in place of its last one; a shout's is the shout picture when the store has it. */
  say(objectId: number, text: string, kind: BubbleKind = 'say'): void {
    if (!text.trim()) return;
    const picture = kind === 'shout' ? this.url(themeKey(shoutPicture(text))) : '';
    if (picture !== '') this.shout(objectId, text, picture);
    else this.plain(objectId, text, kind);
  }

  /** The balloons shown or waiting (for the tests): the speaker, the look asked for and whether the shout picture drew it. */
  list(): Array<{ objectId: number; kind: BubbleKind; picture: boolean }> {
    return [...this.bubbles].map(([objectId, bubble]) => ({ objectId, kind: bubble.kind, picture: bubble.picture }));
  }

  private plain(objectId: number, text: string, kind: BubbleKind): void {
    const canvas = this.doc.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) return;
    context.font = FONT;
    // Wrap by measured characters, including long words, with a bounded six-line bubble.
    const lines = wrap(context, text, 170, 6);
    const width = Math.ceil(Math.max(30, ...lines.map(value => context.measureText(value).width))) + 16;
    const height = lines.length * LINE_PX + 20;
    const texture = this.start(objectId, canvas, context, width, height, width / 2, height + GAP_PX, kind);
    context.fillStyle = '#fffdf0'; context.strokeStyle = '#857d67'; context.lineWidth = 1;
    context.beginPath(); context.roundRect(0.5, 0.5, width - 1, height - 8, 5); context.fill(); context.stroke();
    context.beginPath(); context.moveTo(width / 2 - 5, height - 8); context.lineTo(width / 2, height - 1);
    context.lineTo(width / 2 + 5, height - 8); context.fill(); context.stroke();
    context.fillStyle = '#29271f'; context.textBaseline = 'top';
    lines.forEach((value, index) => context.fillText(value, 8, 6 + index * LINE_PX));
    texture.needsUpdate = true;
  }

  /**
   * 2026-11-17: a shout's balloon as Neuz sizes and draws it (CDialogMsg::AddMessage, DialogMsg.cpp:896-919; Render,
   * :452-516, :612-624). The text's box is cx by cy: the text's width plus 16 (at most 160, the lines then broken at 144),
   * the lines' height plus 16, both rounded up to 16. The picture is stretched from 20 left of and over the box, fWidth + 50
   * by fHeight + 40 (fWidth 0.9 cx, 0.7 cx up to 5 cells of 8; fHeight 0.75 cy), the text in black from 8 in. The box's
   * point where the plain balloon's tail ends (16 + fHeight + 8 down) is GAP_PX over the head, as the plain balloon's.
   */
  private shout(objectId: number, text: string, src: string): void {
    const canvas = this.doc.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) return;
    context.font = FONT;
    const measured = Math.ceil(context.measureText(text).width);
    const cx = measured >= 160 ? 160 : upTo16(measured + 16);
    const lines = neuzLines(context, text, cx - 16);
    const cy = upTo16(lines.length * LINE_PX + 16);
    const pictureWidth = (cx / 8 <= 5 ? cx * 0.7 : cx * 0.9) + 50, pictureHeight = cy * 0.75 + 40;
    const width = Math.ceil(pictureWidth), height = Math.ceil(Math.max(pictureHeight, 28 + lines.length * LINE_PX));
    const texture = this.start(objectId, canvas, context, width, height, 20 + cx / 2, pictureHeight + 4 + GAP_PX, 'shout');
    const paint = (image: HTMLImageElement | null): void => {
      context.clearRect(0, 0, width, height);
      context.globalAlpha = SHOUT_ALPHA;
      if (image !== null) {
        context.drawImage(image, 0, 0, pictureWidth, pictureHeight);
        const bubble = this.bubbles.get(objectId);
        if (bubble?.texture === texture) bubble.picture = true;
      }
      context.fillStyle = '#000000'; context.textBaseline = 'top';
      lines.forEach((value, index) => context.fillText(value, 28, 28 + index * LINE_PX));
      context.globalAlpha = 1;
      texture.needsUpdate = true;
    };
    const image = this.picture(src);
    if (image.complete && image.naturalWidth > 0) { paint(image); return; }
    paint(null);
    image.addEventListener('load', () => {
      if (this.bubbles.get(objectId)?.texture === texture) paint(image); // not when the balloon was replaced or dropped
    }, { once: true });
  }

  private picture(src: string): HTMLImageElement {
    let image = this.pictures.get(src);
    if (image === undefined) {
      image = this.doc.createElement('img');
      image.src = src;
      this.pictures.set(src, image);
    }
    return image;
  }

  /** The canvas sized for `width` by `height`, its sprite in the scene with the head point at (`headX`, `headY`). */
  private start(objectId: number, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number,
    headX: number, headY: number, kind: BubbleKind): CanvasTexture {
    const ratio = Math.min(this.doc.defaultView?.devicePixelRatio ?? 1, 2);
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    context.scale(ratio, ratio); context.font = FONT;
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter; texture.generateMipmaps = false;
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false });
    const sprite = new Sprite(material); sprite.name = `speech bubble ${objectId}`;
    sprite.center.set(headX / width, (height - headY) / height); sprite.renderOrder = 2; sprite.visible = false;
    this.remove(objectId); this.scene.add(sprite);
    this.bubbles.set(objectId, { sprite, texture, width, height, expires: this.now() + 5000, kind, picture: false });
    return texture;
  }

  update(camera: PerspectiveCamera, heightPx: number, placeOf: (id: number) => { at: Vec3; head: Vec3 } | null): void {
    const now = this.now(), pixel = 2 / (camera.projectionMatrix.elements[5]! * Math.max(1, heightPx));
    for (const [id, bubble] of this.bubbles) {
      if (now >= bubble.expires) { this.remove(id); continue; }
      const place = placeOf(id);
      bubble.sprite.visible = place !== null && camera.position.distanceTo(position.set(...place.at)) < 100;
      if (!place) continue;
      bubble.sprite.position.set(...place.head); bubble.sprite.scale.set(bubble.width * pixel, bubble.height * pixel, 1);
      (bubble.sprite.material as SpriteMaterial).opacity = Math.min(1, (bubble.expires - now) / 1000);
    }
  }
  remove(id: number): void {
    const bubble = this.bubbles.get(id); if (!bubble) return;
    bubble.sprite.removeFromParent(); bubble.texture.dispose(); (bubble.sprite.material as SpriteMaterial).dispose(); this.bubbles.delete(id);
  }
  dispose(): void { for (const id of this.bubbles.keys()) this.remove(id); }
}
