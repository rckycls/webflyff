// The HP bars over the party's members (Piece 7 M4, [R §9.3]).
//
//   CWndWorld::OnEraseBkgnd  _Interface/WndWorld.cpp:1009-1031     each member of g_Party but oneself, in view
//                                                                  (`prj.GetUserByID`), calls RenderHP
//   CMover::RenderHP         _Common/MoverRender.cpp:1736-1844     the bound box's top projected, 34 px up; the 80 px
//                                                                  gauge at (x − 40, y − 3) less 2 each way, x made even
//                                                                  (:1798-1804); GauPartyHpBG.TGA at 0.8 × 0.55, alpha
//                                                                  200 (:1828); over it GauPartyHp.TGA cut to
//                                                                  `m_size.cx * HP / maxHP` texture px (:1830-1837)
//   CNeuzApp (the textures)  Neuz/Neuz.cpp:1619-1621               GauPartyHpBG.TGA, GauPartyHp.TGA, GauPartyHp_Dbf.TGA
//
// Drawn as `ChargeGauge.ts` draws its gauge: a DOM layer over the canvas. The debuff picture (GauPartyHp_Dbf.TGA, while
// stunned, poisoned and the like) is left out: the browser does not follow those states after ADD_OBJ (plan Decisions 13).

import type { Vec3 } from '@flyffweb/formats';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { themeKey } from '../hud/art';
import type { UiArt } from '../hud/art';

/** GauPartyHpBG.TGA and GauPartyHp.TGA are 112 × 16. */
const PIECE_W = 112;
const PIECE_H = 16;
/** `Render( ..., 200, 0.8f, 0.55f )` (:1828-1837). */
const SCALE_X = 0.8;
const SCALE_Y = 0.55;
const ALPHA = 200 / 255;
/** 34 px over the projected head (:1798); the gauge at (x − 42, y − 5) (:1800-1803). */
const ABOVE_PX = 34;
const LEFT_PX = 42;
const UP_PX = 5;

const px = (value: number): string => `${+value.toFixed(2)}px`;

/** A member to draw: its object, the top of its model in the scene, its HP. */
export interface PartyHpMember {
  objectId: number;
  head: Vec3;
  hp: number;
  maxHp: number;
}

interface Bar {
  element: HTMLDivElement;
  fill: HTMLDivElement;
  /** The frame it was last drawn in. */
  frame: number;
}

const projected = new Vector3();

export class PartyHpBars {
  readonly element: HTMLDivElement;
  private readonly bars = new Map<number, Bar>();
  private frame = 0;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'party-hp-bars';
    Object.assign(element.style, { position: 'absolute', left: '0px', top: '0px', pointerEvents: 'none' });
    this.element = element;
  }

  /**
   * Draws a bar over each member but `ownObjectId` that is in front of the camera, for a view `width` × `height` CSS
   * pixels; the bars of members not in the list are dropped.
   */
  update(camera: Camera, members: readonly PartyHpMember[], ownObjectId: number | null, width: number, height: number): void {
    const frame = ++this.frame;
    for (const member of members) {
      if (member.objectId === ownObjectId) continue;
      const bar = this.bars.get(member.objectId) ?? this.add(member.objectId);
      bar.frame = frame;
      projected.set(member.head[0], member.head[1], member.head[2]).project(camera);
      if (projected.z > 1) { bar.element.hidden = true; continue; } // behind the camera
      const x = Math.trunc((projected.x + 1) / 2 * width) & ~1;
      const y = Math.trunc((1 - projected.y) / 2 * height) - ABOVE_PX;
      bar.element.style.left = `${x - LEFT_PX}px`;
      bar.element.style.top = `${y - UP_PX}px`;
      const cut = member.maxHp > 0 ? Math.trunc((PIECE_W * Math.max(0, member.hp)) / member.maxHp) : 0;
      bar.fill.style.width = px(Math.min(PIECE_W, cut) * SCALE_X);
      bar.element.hidden = false;
    }
    this.bars.forEach((bar, objectId) => {
      if (bar.frame === frame) return;
      bar.element.remove();
      this.bars.delete(objectId);
    });
  }

  dispose(): void {
    this.bars.clear();
    this.element.remove();
  }

  private add(objectId: number): Bar {
    const width = px(PIECE_W * SCALE_X);
    const height = px(PIECE_H * SCALE_Y);
    const picture = (file: string, piece: string): HTMLImageElement => {
      const img = this.doc.createElement('img');
      img.alt = '';
      img.dataset.piece = piece;
      img.src = this.art.url(themeKey(file));
      Object.assign(img.style, { position: 'absolute', left: '0px', top: '0px', width, height });
      return img;
    };
    const element = this.doc.createElement('div');
    element.className = 'party-hp-bar';
    element.dataset.object = String(objectId);
    Object.assign(element.style, { position: 'absolute', opacity: String(ALPHA), width, height });
    const fill = this.doc.createElement('div');
    fill.className = 'party-hp-fill';
    Object.assign(fill.style, { position: 'absolute', left: '0px', top: '0px', height, overflow: 'hidden' });
    fill.append(picture('GauPartyHp.TGA', 'fill'));
    element.append(picture('GauPartyHpBG.TGA', 'bg'), fill);
    this.element.append(element);
    const bar: Bar = { element, fill, frame: 0 };
    this.bars.set(objectId, bar);
    return bar;
  }
}
