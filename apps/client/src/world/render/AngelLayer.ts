// The angels in the scene (2026-11-10, docs/superpowers/specs/2026-11-10-summon-angel-research.md §6): each angel's model
// where `AngelFollowers` put it, and its EXP gauge over it.
//
//   Function                     File:lines                          what
//   CMover::Process              _Common/Mover.cpp:3560-3627         `szTextFile`.chr/.o3d/_stand01.ani, its stand motion
//                                                                    played on; scale 0.2, the player's turn, 1 up
//   CMover::Render               _Common/MoverRender.cpp:721-727     drawn with `m_AngelWorldM` after the player
//   CMover::RenderAngelStatus    MoverRender.cpp:1907-1979           40 px wide over the angel's place 1.4 up (the
//                                                                    player's scale and turn): GauAngelExpBG.tga then
//                                                                    GauAngelExp.tga cut to the EXP, at 0.4 x 0.55 and
//                                                                    alpha 200 (`Neuz.cpp:1642-1643`)
//   CWndWorld::OnEraseBkgnd      _Interface/WndWorld.cpp:1009-1041   RenderHP (and so the gauge) for the own player and
//                                                                    the party's members in view

import type { Vec3 } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { AnimationMixer, Camera, Object3D, Scene } from 'three';
import { Group, Vector3 } from 'three';
import { themeKey } from '../hud/art';
import type { UiArt } from '../hud/art';
import { ANGEL_LIFT, ANGEL_SCALE } from '../angel/angelFollow';

/** An angel's model, loaded: its root, its mixer (the stand motion playing), and its release. */
export interface AngelModel {
  object: Object3D;
  mixer: AnimationMixer | null;
  release(): void;
}

/** What the layer draws of an angel: its place (D3D), its player's turn (degrees) and its model's name. */
export interface AngelShown {
  pos: Vec3;
  angle: number;
  model: string;
}

interface Entry { model: string; holder: Group; loaded: AngelModel | null; gone: boolean }

export class AngelLayer {
  private readonly entries = new Map<number, Entry>();
  private disposed = false;

  constructor(private readonly scene: Scene, private readonly load: (model: string) => Promise<AngelModel>) {}

  /** Each angel's model, placed (`m_AngelWorldM`) and played on by `dt` seconds; the others' let go. */
  update(angels: ReadonlyMap<number, AngelShown>, dt: number): void {
    for (const [id, entry] of this.entries) {
      const angel = angels.get(id);
      if (angel === undefined || angel.model !== entry.model) this.drop(id, entry);
    }
    for (const [id, angel] of angels) {
      let entry = this.entries.get(id);
      if (entry === undefined) entry = this.add(id, angel.model);
      const [x, y, z] = toWebPosition([angel.pos[0], angel.pos[1] + ANGEL_LIFT, angel.pos[2]]);
      entry.holder.position.set(x, y, z);
      entry.holder.rotation.y = (angel.angle * Math.PI) / 180;
      entry.loaded?.mixer?.update(dt);
    }
  }

  /** The players whose angel is drawn (loaded), for the tests. */
  drawn(): number[] {
    return [...this.entries].filter(([, entry]) => entry.loaded !== null).map(([id]) => id);
  }

  dispose(): void {
    this.disposed = true;
    for (const [id, entry] of this.entries) this.drop(id, entry);
  }

  private add(id: number, model: string): Entry {
    const holder = new Group();
    holder.name = `angel:${id}`;
    holder.scale.setScalar(ANGEL_SCALE);
    this.scene.add(holder);
    const entry: Entry = { model, holder, loaded: null, gone: false };
    this.entries.set(id, entry);
    this.load(model).then((loaded) => {
      if (entry.gone || this.disposed) { loaded.release(); return; }
      entry.loaded = loaded;
      holder.add(loaded.object);
    }, () => {}); // a model that is not converted: no angel is drawn
    return entry;
  }

  private drop(id: number, entry: Entry): void {
    entry.gone = true;
    this.entries.delete(id);
    entry.holder.removeFromParent();
    entry.loaded?.release();
  }
}

/** The gauge pictures' size: 112 x 16; `RenderScal( ..., 200, 0.4f, 0.55f )`. */
const PIECE_W = 112;
const PIECE_H = 16;
const SCALE_X = 0.4;
const SCALE_Y = 0.55;
const ALPHA = 200 / 255;
/** `nGaugeWidth` 40: the gauge at (x − 20 − 2, y − 3 − 2), x made even; 1.4 over the angel's place. */
const LEFT_PX = 22;
const UP_PX = 5;
const OVER = 1.4;
const px = (n: number): string => `${+n.toFixed(2)}px`;
const projected = new Vector3();

/** The EXP gauges over the angels (`RenderAngelStatus`): a DOM layer over the canvas, as the party's HP bars. */
export class AngelGauges {
  readonly element: HTMLDivElement;
  private readonly gauges = new Map<number, { element: HTMLDivElement; fill: HTMLImageElement }>();

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'angel-gauges';
    Object.assign(this.element.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  }

  /**
   * One gauge for each of `shown`: its angel's place (D3D) and the player's scale, and its EXP as a part of the full EXP
   * (0-1; null draws the background alone, as Neuz does for a player whose angel EXP it does not know).
   */
  update(shown: ReadonlyMap<number, { pos: Vec3; scale: number; fill: number | null }>, camera: Camera, width: number, height: number): void {
    for (const [id, gauge] of this.gauges) {
      if (!shown.has(id)) { gauge.element.remove(); this.gauges.delete(id); }
    }
    for (const [id, { pos, scale, fill }] of shown) {
      const gauge = this.gauges.get(id) ?? this.make(id);
      const [x, y, z] = toWebPosition([pos[0], pos[1] + OVER * scale, pos[2]]);
      projected.set(x, y, z).project(camera);
      if (projected.z > 1) { gauge.element.hidden = true; continue; } // behind the camera
      const sx = Math.trunc((projected.x + 1) / 2 * width);
      const sy = Math.trunc((1 - projected.y) / 2 * height);
      gauge.element.style.left = `${(sx - LEFT_PX) & ~1}px`; // MakeEven( p.x )
      gauge.element.style.top = `${sy - UP_PX}px`;
      gauge.fill.hidden = fill === null;
      gauge.fill.style.width = px(PIECE_W * Math.min(1, Math.max(0, fill ?? 0)) * SCALE_X);
      gauge.element.hidden = false;
    }
  }

  dispose(): void {
    this.element.remove();
    this.gauges.clear();
  }

  private make(id: number): { element: HTMLDivElement; fill: HTMLImageElement } {
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'angel-gauge';
    element.dataset.angelGauge = String(id);
    const width = px(PIECE_W * SCALE_X), height = px(PIECE_H * SCALE_Y);
    Object.assign(element.style, { position: 'absolute', width, height });
    const picture = (piece: string, file: string): HTMLImageElement => {
      const img = doc.createElement('img');
      img.alt = '';
      img.dataset.piece = piece;
      img.src = this.art.url(themeKey(file));
      Object.assign(img.style, { position: 'absolute', left: '0px', top: '0px', width, height, opacity: String(ALPHA) });
      element.append(img);
      return img;
    };
    picture('bg', 'GauAngelExpBG.tga');
    const fill = picture('fill', 'GauAngelExp.tga');
    fill.style.objectFit = 'cover';
    fill.style.objectPosition = 'left';
    this.element.append(element);
    const gauge = { element, fill };
    this.gauges.set(id, gauge);
    return gauge;
  }
}
