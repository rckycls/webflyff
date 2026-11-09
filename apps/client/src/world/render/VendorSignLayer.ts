// The personal shop's title balloon over each seller (2026-11-10, personal-shop research §3.1): `CDialogMsg::
// AddVendorMessage` and its part of `CDialogMsg::Render` (`_Common/DialogMsg.cpp:930-998, :630-716`). Each is an element
// over the world, placed each frame at the seller's projected head, so that a finger on a phone can tap it (Neuz's balloon
// is not clicked: the seller is). The look is Neuz's: texDialogBox_left, _center stretched over the text, _right, alpha 200,
// the text in red or blue at random, never fading.
//
//   AddVendorMessage   :930-998    cx = the text's width + 16, rounded up to 16; one line is 32 high; the colour
//                                  `rand() % 2 ? red : blue`; line breaks as spaces
//   Render             :656-714    the head point (the bound box's top over the mover) projected; x less half cx, y less
//                                  the height; the left piece at (x - 24, y - 42), the centre from x + 8, cx wide, the
//                                  right after it; the text at (x + 8, y - 32)

import type { Vec3 } from '@flyffweb/formats';
import type { PerspectiveCamera } from 'three';
import { Vector3 } from 'three';
import type { UiArt } from '../hud/art';
import { themeUrl } from '../hud/art';
import { balloonText } from '../vendor/vendorRules';

/** `m_pFontText` (Verdana 9 points, 12 px); 14 px on a phone (the owner's least). */
const FONT_PX = 12;
const PHONE_FONT_PX = 14;
const PHONE = '(max-width: 1000px) and (pointer: coarse)';
/** The pictures' alpha (`nAlpha = 200`) and the text's (`SetAlpha( 250 )`). */
const PICTURE_ALPHA = 200 / 255;

interface Sign {
  element: HTMLElement;
  title: string;
  /** cx: the text's width plus 16, rounded up to 16. */
  width: number;
}

const point = new Vector3();

export class VendorSignLayer {
  readonly element: HTMLElement;
  private readonly signs = new Map<number, Sign>();
  private readonly measure: CanvasRenderingContext2D | null;
  private readonly phone: boolean;

  constructor(private readonly doc: Document, private readonly art: UiArt, private readonly onTap: (objectId: number) => void,
    private readonly random: () => number = Math.random) {
    this.element = doc.createElement('div');
    this.element.className = 'vendor-signs';
    this.phone = doc.defaultView?.matchMedia?.(PHONE).matches === true;
    this.element.toggleAttribute('data-phone', this.phone);
    this.measure = doc.createElement('canvas').getContext('2d');
    if (this.measure !== null) this.measure.font = `${this.phone ? PHONE_FONT_PX : FONT_PX}px Verdana, sans-serif`;
  }

  /** A seller's title (`AddVendorMessage`), or none (`RemoveVendorMessage`) for ''. */
  set(objectId: number, title: string): void {
    const old = this.signs.get(objectId);
    if (title === '') {
      old?.element.remove();
      this.signs.delete(objectId);
      return;
    }
    if (old?.title === title) return;
    old?.element.remove();
    const text = balloonText(title);
    const measured = this.measure?.measureText(text).width ?? text.length * 7;
    const cx = Math.ceil((Math.ceil(measured) + 16) / 16) * 16;
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'vendor-sign';
    element.dataset.objectId = String(objectId);
    element.style.width = `${cx + 64}px`;
    element.style.setProperty('--sign-center', `${cx}px`);
    const piece = (name: string, file: string): HTMLElement => {
      const part = doc.createElement('div');
      part.className = `vendor-sign-${name}`;
      part.style.backgroundImage = themeUrl(this.art, file);
      part.style.opacity = String(PICTURE_ALPHA);
      return part;
    };
    const words = doc.createElement('span');
    words.className = 'vendor-sign-text';
    words.textContent = text;
    // rand() % 2 ? 0xffff0000 : 0xff0000ff (DialogMsg.cpp:978-983)
    words.style.color = Math.floor(this.random() * 2) % 2 === 1 ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)';
    element.append(piece('left', 'texDialogBox_left.tga'), piece('center', 'texDialogBox_center.TGA'), piece('right', 'texDialogBox_right.tga'), words);
    if (this.phone) {
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `Shop: ${text}`);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onTap(objectId);
      });
    }
    element.hidden = true;
    this.element.append(element);
    this.signs.set(objectId, { element, title, width: cx });
  }

  has(objectId: number): boolean {
    return this.signs.has(objectId);
  }

  /**
   * Places each balloon (`CDialogMsg::Render`): the head point of `placeOf` projected through `camera` onto `canvas`, the
   * layer's own box `layer` (both from `getBoundingClientRect`). A mover not drawn, or behind the camera, has none shown.
   */
  update(camera: PerspectiveCamera, canvas: DOMRect, layer: DOMRect, placeOf: (objectId: number) => { at: Vec3; head: Vec3 } | null): void {
    for (const [objectId, sign] of this.signs) {
      const place = placeOf(objectId);
      if (place === null) { sign.element.hidden = true; continue; }
      point.set(place.head[0], place.head[1], place.head[2]).project(camera);
      if (point.z > 1 || point.z < -1) { sign.element.hidden = true; continue; }
      const headX = canvas.left - layer.left + ((point.x + 1) / 2) * canvas.width;
      const headY = canvas.top - layer.top + ((1 - point.y) / 2) * canvas.height;
      const x = headX - sign.width / 2;
      const y = headY - 32;
      sign.element.hidden = false;
      sign.element.style.transform = `translate(${Math.round(x - 24)}px, ${Math.round(y - 42)}px)`;
    }
  }

  clear(): void {
    for (const sign of this.signs.values()) sign.element.remove();
    this.signs.clear();
  }
}
