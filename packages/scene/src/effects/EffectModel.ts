import type { SfxKey, SfxParticle, Vec3, WebEffect, WebEffectPart } from '@flyffweb/formats';
import {
  degToRad, degToRadVec, multiply, product, rotationX, rotationZ, scaling, transformCoord, translation, vecAdd, vecLength,
  vecMul, vecSub, yawPitchRoll, yawPitchRollOf,
} from './d3dx';
import type { Matrix } from './d3dx';

/**
 * The effect player's stepping: what Neuz's `CSfxModel` does with a `.sfx` each game tick, with no Three.js in it.
 * `step` is `CSfxModel::Process` (`Source/_Common/sfxbase.cpp:2699-2975`): the frame, the particles, the end of the
 * effect. `drawList` is the maths of `CSfxModel::Render` (`:2429-2505`) and the part renderers it calls,
 * `CSfxPartBill::Render` (`:314-418`), `CSfxPartCustomMesh::Render` (`:1303-1442`) and `CSfxModel::RenderParticles`
 * (`:2507-2697`): one entry per quad, cone or particle to draw this tick, in part order, for the renderer to draw.
 *
 * - **Time:** one frame is one 60 Hz tick, and `Process` adds 1 to the frame before anything uses it (`:2705`), so the
 *   first tick sees frame 1. The frame is a WORD (`sfxbase.h:285`).
 * - **Keys:** a part is drawn only from its first key frame to its last (`GetPrevKey` and `GetNextKey` both found,
 *   `:107-143`), with the floats interpolated in floats and the alpha in integers (`:325-339`).
 * - **Coordinates:** D3D's and FlyFF's degrees, as the C++ has them; matrices are `D3DXMATRIX`es (`d3dx.ts`: row
 *   vectors, `S * R * T`). The effect's own position (`m_vPos`) is not in them: the C++ only adds it to the translation
 *   (`vPos.x + ...`, `:389-393,1380-1383,2644-2647`), so the renderer adds it to elements 12 to 14 when it draws.
 * - **Floats:** `f32` after every float operation; integer maths where the C++ has `int`s and WORDs.
 * - **Drawing is pure:** `drawList` reads the state and changes nothing, so it can be called any number of times a tick,
 *   or not at all. The one thing Neuz changes while drawing, the `repeatScal` scale ping-pong (`:2625-2638`), is done
 *   by `step`, once a tick, as if Neuz drew every tick (it draws at most once a tick, after `Process`).
 * - **Mesh parts** (type 3, an `.o3d` model) are not drawn in Piece 4 (spec §3.7), but they keep the effect alive as
 *   `Process` has them do (`:2968-2972`).
 */

const f32 = Math.fround;

/** SFXPARTTYPE (`sfxbase.h:17-22`). */
const PART_BILL = 1;
const PART_PARTICLE = 2;
const PART_MESH = 3;
const PART_CUSTOMMESH = 4;
/** SFXPARTBILLTYPE (`sfxbase.h:23-28`). */
const BILL_BILL = 1;
const BILL_BOTTOM = 2;
const BILL_POLE = 3;
const BILL_NORMAL = 4;
/** SFXPARTALPHATYPE_GLOW (`sfxbase.h:31`): `DESTBLEND ONE`, additive; BLEND (1) is `INVSRCALPHA` (`:396-407`). */
const ALPHA_GLOW = 2;

/** `RAND_MAX` of the MSVC `rand()` Neuz is built with (v143, `Neuz/Neuz.vcxproj:20`): 0x7fff. */
const RAND_MAX = 0x7fff;
/** `RANDF` (`sfxbase.cpp:14`): `( rand() % 50000 ) / 50000.0f`. */
const RAND_DIVISOR = 50000;
/** `f >= 0.65f` and `nEndFrame * 0.6f`: the `repeat` sustain loop (`:2956-2958`). */
const REPEAT_AT = f32(0.65);
const REPEAT_BACK = f32(0.6);
/** `DEGREETORADIAN( 90 )`: BOTTOM parts lie flat (`:364,1345,2548`). */
const RIGHT_ANGLE = degToRad(90);
/** `Key.vPosRotate.y + 0.02f`: the cone's top v (`:1414`). */
const CONE_TOP_V = f32(0.02);
/** The low 16 bits: `m_nCurFrame` is a WORD. */
const WORD = 0xffff;

/** `[0, 1)`: the game's `RANDF`, `( rand() % 50000 ) / 50000.0f` (`sfxbase.cpp:14`). */
export interface EffectRandom {
  next(): number;
}

/**
 * `RANDF` with MSVC's `rand()`, which gives 0 to `RAND_MAX` = 32767: the `% 50000` never wraps, so the values are
 * whole numbers of 50000ths from 0 to 0.65534, never above. The particles' random speeds, heights, turns and scale
 * speeds thus only reach about two thirds of the way from their low value to their high one, as in Neuz.
 */
export const neuzRandom: EffectRandom = {
  next: () => f32((Math.floor(Math.random() * (RAND_MAX + 1)) % RAND_DIVISOR) / RAND_DIVISOR),
};

/**
 * A BILL part's quad, or one particle (`CSfxPartBill::Render`, `RenderParticles`): the unit quad `EFFECT_QUAD` times
 * `matrix`, as a triangle fan with no culling (`:416`).
 */
export interface EffectQuadDraw {
  kind: 'quad';
  /** The part's index in the effect. */
  part: number;
  /** The texture's logical key (the animation's frame for this tick), or null: drawn untextured, as Neuz draws "". */
  texture: string | null;
  /** The part's SFXPARTBILLTYPE: 1 BILL, 2 BOTTOM, 3 POLE, 4 NORMAL. Already in `matrix`. */
  billType: 1 | 2 | 3 | 4;
  /** A `D3DXMATRIX` (16 floats, row vectors), without the effect's position. */
  matrix: number[];
  /**
   * The alpha byte of `D3DRS_TEXTUREFACTOR = nAlpha << 24 | 0x404040` (`:414,1435,2693`): `nAlpha & 0xff`, so a key
   * alpha above 255 wraps. It multiplies the texture's alpha; there is no colour (the colour stage takes the
   * texture's alone, `:2434-2438`).
   */
  alpha: number;
  /** GLOW (`DESTBLEND ONE`), else BLEND (`DESTBLEND INVSRCALPHA`); `SRCBLEND` is `SRCALPHA` for both (`:2445`). */
  additive: boolean;
}

/**
 * A CUSTOMMESH part's open cylinder, cone or ring (`CSfxPartCustomMesh::Render`, `:1303-1442`): `coneVertices` times
 * `matrix`, a triangle strip drawn on both sides (`:1436-1439`).
 */
export interface EffectConeDraw extends Omit<EffectQuadDraw, 'kind'> {
  kind: 'cone';
  /** `Key.vScale.x`: the top ring's radius. */
  top: number;
  /** `Key.vScale.z`: the bottom ring's radius. */
  bottom: number;
  /** `Key.vScale.y`: the top ring's height; the bottom ring is at 0. */
  height: number;
  /** `Key.vPosRotate`, which the cone uses for its UVs: x the U repeats around the ring, y the top V less 0.02, z the bottom V. */
  uv: Vec3;
  /** `m_nPoints`: the ring has `points * 2 + 1` vertex pairs. */
  points: number;
  /** What the top V adds to `uv.y`: 0.02 in `Render` (`:1414`), 0.1 in `Render2` (Piece 7 M2); 0.02 when not given. */
  topV?: number;
  /**
   * As a quad's, with one more thing first: the C++ multiplies the cone's vertices by the effect's scale, axis by axis,
   * before its world matrix (`:1407-1412`), and that scale is the first factor here.
   */
  matrix: number[];
}

/**
 * Piece 7 M2: a MESH part's model (`CSfxPartMesh::Render`, `:1072-1130`), the `.o3d` its part names (`model`) drawn whole
 * with `matrix`, the key's alpha as the texture factor, its blend, and depth written (`ZWRITEENABLE TRUE`, :1126-1128).
 */
export interface EffectMeshDraw {
  kind: 'mesh';
  part: number;
  /** The model's logical key (`models/<name>.glb`). */
  model: string;
  matrix: number[];
  alpha: number;
  additive: boolean;
}

export type EffectDraw = EffectQuadDraw | EffectConeDraw | EffectMeshDraw;

/**
 * How the effect is turned: `CSfxModel::Render`'s heading alone (`m_vRotate.y`, `angle`) or, Piece 7 M2, `Render2`'s
 * whole rotation too (`m_vRotate`, degrees: x pitch, y yaw, z roll; `:2063-2135`), which a missile in flight is drawn with.
 */
interface Turn {
  angle: number;
  rotation?: Vec3;
}

/** Piece 7 M2: `D3DXMatrixRotationYawPitchRoll` of a degree vector (x pitch, y yaw, z roll). */
const yprOf = (degrees: Vec3): Matrix => yawPitchRollOf(degToRadVec(degrees));
/** `Key.vPosRotate.y + 0.1f`: the cone's top V in `Render2` (`:1531`). */
const CONE_TOP_V2 = f32(0.1);

/**
 * The quad every BILL part and particle draws (`CSfxMng::RestoreDeviceObjects`, `:1845-1869`): half size
 * `m_fScale = 0.5` (`sfxbase.h:259`), corners (-.5, .5), (.5, .5), (.5, -.5), (-.5, -.5) at z 0, UVs (0, 0), (1, 0),
 * (1, 1), (0, 1), as a triangle fan.
 */
export const EFFECT_QUAD = {
  positions: [-0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 0] as readonly number[],
  uvs: [0, 0, 1, 0, 1, 1, 0, 1] as readonly number[],
};

/**
 * The cone's vertices as `CSfxPartCustomMesh::Render` builds them (`:1402-1431`), before its matrix: pair `i` (0 to
 * `points * 2`) is the top vertex `(sin a * top, height, cos a * top)` then the bottom one `(sin a * bottom, 0,
 * cos a * bottom)`, at `a = DEGREETORADIAN( 360 / ( points * 2 ) * i )` in **integers** (so with 8 or 25 points, which
 * some shipped parts have, the ring stops short of 360 degrees). V is `uv.y + 0.02` at the top and `uv.z` at the bottom;
 * U is `uv.x * i / ( points * 2 )`, or 0 and 1 by turns when `uv.x` is 0 (`:1414-1430`). In triangle-strip order.
 */
export function coneVertices(cone: EffectConeDraw): { positions: Float32Array; uvs: Float32Array } {
  const around = cone.points * 2;
  const pairs = around + 1;
  const step = Math.trunc(360 / around);
  const positions = new Float32Array(pairs * 6);
  const uvs = new Float32Array(pairs * 4);
  const [repeats, topV, bottomV] = cone.uv;
  const vTop = f32(topV + (cone.topV ?? CONE_TOP_V));
  for (let i = 0; i < pairs; i++) {
    const a = degToRad(step * i);
    const s = f32(Math.sin(a));
    const c = f32(Math.cos(a));
    // written in place: a cone is rebuilt every frame (Piece 6 M5, part B)
    const p = i * 6;
    positions[p] = f32(s * cone.top);
    positions[p + 1] = cone.height;
    positions[p + 2] = f32(c * cone.top);
    positions[p + 3] = f32(s * cone.bottom);
    positions[p + 4] = 0;
    positions[p + 5] = f32(c * cone.bottom);
    const u = repeats === 0 ? i % 2 : f32(f32(repeats * i) / around);
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = vTop;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = bottomV;
  }
  return { positions, uvs };
}

/** One live particle (`struct Particle`, `sfxbase.h:63-76`). */
interface Particle {
  /** `nFrame`: frames since it was born. */
  age: number;
  pos: Vec3;
  speed: Vec3;
  scale: Vec3;
  /** Degrees, reached at the end of the current key segment. */
  rotation: Vec3;
  scaleStart: Vec3;
  scaleEnd: Vec3;
  /** Used only by `repeatScal` parts' ping-pong. */
  scaleSpeed: Vec3;
  /** `bSwScal`: shrinking. */
  shrinking: boolean;
}

/** The key a part has at a frame, interpolated, with what the particle turn needs. */
interface FrameKey {
  key: SfxKey;
  prev: SfxKey;
  /** `next.frame - prev.frame`; 0 when the frame is a key's. */
  span: number;
}

/** `GetPrevKey` (`:107-117`): the last key at or before `frame`. */
function prevKey(keys: readonly SfxKey[], frame: number): SfxKey | null {
  let found: SfxKey | null = null;
  for (const key of keys) {
    if (key.frame > frame) break;
    found = key;
  }
  return found;
}

/** `GetNextKey( frame )` with its default `bSkip = TRUE` (`:118-143`, `sfxbase.h:117`): the first key at or after `frame`. */
function nextKey(keys: readonly SfxKey[], frame: number): SfxKey | null {
  for (const key of keys) if (key.frame >= frame) return key;
  return null;
}

/**
 * The key at `frame` as the part renderers work it out (`:325-339`, `:1313-1326`, `:2514-2531`), or null when the frame
 * is before the first key or after the last, where nothing is drawn. Between two keys each vector is `prev +=
 * ( next - prev ) * (FLOAT)( frame - prev.frame ) / (FLOAT)dFrame`, where `D3DXVECTOR3::operator /` multiplies by
 * `1.0f / dFrame`; the alpha is `prev + ( next - prev ) * ( frame - prev.frame ) / dFrame` in `int`s, rounded toward 0.
 * (`RenderParticles` leaves the scale alone for `repeatScal` parts, `:2526-2529`; particles never use it.)
 */
function keyAt(keys: readonly SfxKey[], frame: number): FrameKey | null {
  const prev = prevKey(keys, frame);
  const next = nextKey(keys, frame);
  if (prev === null || next === null) return null;
  const span = next.frame - prev.frame;
  if (span === 0) return { key: prev, prev, span };
  const along = frame - prev.frame;
  const inverse = f32(1 / span);
  const lerp = (a: Vec3, b: Vec3): Vec3 => {
    const d = vecSub(b, a);
    return vecAdd(a, [f32(f32(d[0] * along) * inverse), f32(f32(d[1] * along) * inverse), f32(f32(d[2] * along) * inverse)]);
  };
  const key: SfxKey = {
    frame,
    pos: lerp(prev.pos, next.pos),
    posRotate: lerp(prev.posRotate, next.posRotate),
    scale: lerp(prev.scale, next.scale),
    rotate: lerp(prev.rotate, next.rotate),
    alpha: prev.alpha + Math.trunc(((next.alpha - prev.alpha) * along) / span),
  };
  return { key, prev, span };
}

/**
 * The texture a BILL or CUSTOMMESH part draws at `frame` (`:316-324`, `:1305-1312`), or undefined when an animated part
 * is before its first key (nothing is drawn). Frame `( texFrame * ( frame - firstKey.frame ) / texLoop ) % texFrame`, in
 * integers, of the converted `frames` (`GetTextureName`). A part with no keys draws nothing anyway (`keyAt`); the C++
 * would read a null first key there, and no shipped animated part has none.
 */
function partTexture(part: WebEffectPart, frame: number): string | null | undefined {
  if (part.texFrame <= 1) return part.texture;
  const first = nextKey(part.keys, 0);
  if (first === null || frame < first.frame) return undefined;
  return part.frames[Math.trunc((part.texFrame * (frame - first.frame)) / part.texLoop) % part.texFrame] ?? null;
}

/** `( D3DXVECTOR3 ) + D3DXVECTOR3( .0f, fAngle, .0f )`, turned to radians. */
const turnedBy = (degrees: Vec3, angleY: number): Matrix => yawPitchRollOf(degToRadVec(vecAdd(degrees, [0, angleY, 0])));

/** `low + r * ( high - low )`, in floats. */
const between = (low: number, high: number, r: number): number => f32(low + f32(r * f32(high - low)));

/** A copy of `v` as floats: a `D3DXVECTOR3` built from it. */
const floats = (v: ArrayLike<number>): Vec3 => [f32(v[0]!), f32(v[1]!), f32(v[2]!)];

export class EffectModel {
  /** `m_nCurFrame`. */
  private curFrame = 0;
  /** `m_apParticles`: the live particles of each PARTICLE part, null for the other parts (`SetSfx`, `:1983-1994`). */
  private readonly particles: (Particle[] | null)[];

  constructor(
    private readonly effect: WebEffect,
    private readonly random: EffectRandom,
  ) {
    this.particles = effect.parts.map((part, i) => {
      if (part.type !== PART_PARTICLE) return null;
      if (part.particle === null) throw new Error(`EffectModel: part ${i} is a PARTICLE part with no particle block`);
      return [];
    });
  }

  /** `m_nCurFrame`: the frame the last `step` reached (0 before the first), which `drawList` draws. */
  get frame(): number {
    return this.curFrame;
  }

  /**
   * One 60 Hz tick: `CSfxModel::Process` (`:2699-2975`). Returns true when the effect is over: no non-particle part has
   * a key at or after the frame, every particle part in use is past its first key, has no live particles, and this is
   * not one of its emission frames still to come (`:2845-2846,2944-2948,2968-2972`). An effect with a `repeat` part
   * never ends by itself; `CSfx` deletes it from outside.
   */
  step(): boolean {
    let over = true;
    this.curFrame = (this.curFrame + 1) & WORD;
    const parts = this.effect.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const particles = this.particles[i];
      if (particles === null || particles === undefined) {
        // :2968-2972: every other part, drawn or not (in use or not, MESH too), while it has a key still to come
        if (nextKey(part.keys, this.curFrame) !== null) over = false;
        continue;
      }
      if (!part.using) continue; // :2715
      const block = part.particle!;
      this.advance(particles, block);
      const start = part.keys.length > 0 ? part.keys[0]!.frame : 0; // :2741-2747
      const end = part.keys.length > 0 ? part.keys[part.keys.length - 1]!.frame : 0;
      if (this.curFrame >= start && this.curFrame <= end - block.disappear) {
        // :2750-2847 (__SFX_OPT, on: Neuz/VersionCommon.h:104): three randoms a tick, emitting or not, shared by the
        // tick's particles
        const r1 = f32(this.random.next());
        const r2 = f32(this.random.next());
        const r3 = f32(this.random.next());
        if (block.create === 0) {
          if (this.curFrame === start) this.emit(particles, block, r1, r2, r3);
        } else if ((this.curFrame - start) % block.create === 0) {
          this.emit(particles, block, r1, r2, r3);
        } else {
          over = false;
        }
      }
      if (particles.length > 0) over = false; // :2944-2945
      if (this.curFrame < start) over = false; // :2947-2948
      if (block.repeat) {
        // :2950-2965: the whole effect's frame goes back, before the later parts of this tick look at it. (`nEndFrame`
        // is a WORD, never below 0; with no keys it is 0 and the frame goes to 0 every tick.)
        if (f32(this.curFrame / end) >= REPEAT_AT) this.curFrame = Math.trunc(f32(end * REPEAT_BACK));
      }
    }
    this.pingPongScales();
    return over;
  }

  /**
   * What to draw at the current frame (`CSfxModel::Render`, `:2429-2505`): one entry per BILL quad, CUSTOMMESH cone and
   * live particle, in part order, skipping parts not in use (`:2450`) and MESH parts.
   *
   * @param angleY  `m_vRotate.y`, the effect's heading in degrees (`CSfx::Render` sets it to `GetAngle()`).
   * @param scale   `m_vScale`, the effect's scale (`GetScale()`).
   * @param invView `g_matInvView`: the inverse of the camera's D3D view matrix (16 floats, row vectors), which BILL and
   *                POLE parts face (`Camera.cpp:66-68`). Its translation is ignored, as Neuz zeroes it. From a three.js
   *                camera that is `toWebMatrix` of its `matrixWorld` (the mirror is its own inverse).
   */
  drawList(angleY: number, scale: Vec3, invView: ArrayLike<number>): EffectDraw[] {
    return this.draws({ angle: f32(angleY) }, scale, invView);
  }

  /**
   * Piece 7 M2: `CSfxModel::Render2` (`:2063-2135`), what a missile in flight is drawn with: the whole `rotation` (degrees:
   * x pitch, y yaw, z roll) turns the BILL, PARTICLE and CUSTOMMESH parts (their `Render2`s, `:196-310`, `:2143-2330`,
   * `:1445-1560`); a MESH part takes the yaw alone (`Render( ..., m_vRotate.y, ... )`, :2117-2121).
   */
  drawList2(rotation: Vec3, scale: Vec3, invView: ArrayLike<number>): EffectDraw[] {
    return this.draws({ angle: f32(rotation[1]), rotation: floats(rotation) }, scale, invView);
  }

  /** Piece 7 M2: `m_nCurFrame = 0`, as a missile sends its looping flight model back (`Sfx.cpp:884-888`, :978-981). */
  rewind(): void {
    this.curFrame = 0;
  }

  private draws(turn: Turn, scale: Vec3, invView: ArrayLike<number>): EffectDraw[] {
    const size = floats(scale);
    const camera = Array.from(invView, f32);
    camera[12] = camera[13] = camera[14] = 0;
    const out: EffectDraw[] = [];
    this.effect.parts.forEach((part, i) => {
      if (!part.using) return;
      if (part.type === PART_BILL) {
        const quad = this.billDraw(part, i, turn, size, camera);
        if (quad !== null) out.push(quad);
      } else if (part.type === PART_PARTICLE) {
        this.particleDraws(part, i, this.particles[i]!, turn, size, camera, out);
      } else if (part.type === PART_CUSTOMMESH) {
        const cone = this.coneDraw(part, i, turn, size, camera);
        if (cone !== null) out.push(cone);
      } else if (part.type === PART_MESH) {
        const mesh = this.meshDraw(part, i, turn.angle, size);
        if (mesh !== null) out.push(mesh);
      }
    });
    return out;
  }

  /**
   * Piece 7 M2: `CSfxPartMesh::Render( vPos, nFrame, fAngle, vScale )` (`:1072-1130`): scale = effect scale * key scale,
   * then `YawPitchRoll( rotate + ( 0, angle, 0 ) )`; the offset `key.pos` turned by `YawPitchRoll( posRotate + ( 0, angle,
   * 0 ) )` and multiplied by the effect scale. A part whose model was not converted draws nothing.
   */
  private meshDraw(part: WebEffectPart, index: number, angle: number, scale: Vec3): EffectMeshDraw | null {
    if (part.model === null) return null;
    const at = keyAt(part.keys, this.curFrame);
    if (at === null) return null;
    const { key } = at;
    const sized = vecMul(scale, key.scale);
    const local = multiply(scaling(sized[0], sized[1], sized[2]), turnedBy(key.rotate, angle));
    const offset = vecMul(transformCoord(key.pos, turnedBy(key.posRotate, angle)), scale);
    return {
      kind: 'mesh', part: index, model: part.model, matrix: multiply(local, translation(offset[0], offset[1], offset[2])),
      alpha: key.alpha & 0xff, additive: part.alphaType === ALPHA_GLOW,
    };
  }

  /** :2723-2740: move, speed up and grow (unless `repeatScal`) every live particle, one frame older; drop the old. */
  private advance(particles: Particle[], block: SfxParticle): void {
    let kept = 0;
    for (const particle of particles) {
      particle.pos = vecAdd(particle.pos, particle.speed);
      particle.speed = vecAdd(particle.speed, floats(block.accel));
      if (!block.repeatScal) particle.scale = vecAdd(particle.scale, floats(block.scaleSpeed)); // the part's, not the particle's
      particle.age++;
      if (particle.age < block.disappear) particles[kept++] = particle;
    }
    particles.length = kept;
  }

  /**
   * :2759-2796 (and the same at :2803-2843): `createNum` new particles, born after the others moved this tick. Each
   * draws only its own angle, `RANDF * 360.0f`, which `sin` and `cos` take as radians; the rest comes from the tick's
   * `r1`, `r2`, `r3`, so the particles of one tick share their height and speeds (a ring, not a cloud).
   */
  private emit(particles: Particle[], block: SfxParticle, r1: number, r2: number, r3: number): void {
    for (let n = 0; n < block.createNum; n++) {
      const angle = f32(f32(this.random.next()) * 360);
      const s = f32(Math.sin(angle));
      const c = f32(Math.cos(angle));
      const factor = between(block.xzLow, block.xzHigh, r2);
      particles.push({
        age: 0,
        pos: [f32(s * block.startPosVar), f32(r1 * block.startPosVarY), f32(c * block.startPosVar)],
        speed: [f32(s * factor), between(block.yLow, block.yHigh, r2), f32(c * factor)],
        scale: floats(block.scale),
        scaleStart: floats(block.scale),
        rotation: [
          between(block.rotationLow[0], block.rotationHigh[0], r1),
          between(block.rotationLow[1], block.rotationHigh[1], r3),
          between(block.rotationLow[2], block.rotationHigh[2], r2),
        ],
        shrinking: false,
        scaleEnd: floats(block.scaleEnd),
        scaleSpeed: [
          between(block.scaleSpeedLow[0], block.scaleSpeedHigh[0], r3),
          between(block.scaleSpeedLow[1], block.scaleSpeedHigh[1], r2),
          between(block.scaleSpeedLow[2], block.scaleSpeedHigh[2], r1),
        ],
      });
    }
  }

  /**
   * `RenderParticles`' scale ping-pong for `repeatScal` parts (`:2625-2638`), one step per particle wherever Neuz would
   * draw it this tick (a part in use, between its first and last key, `:2450,2516`): shrink once the scale is as long as
   * `scaleEnd`, grow once it is back to `scaleStart`, by the particle's own `scaleSpeed`.
   */
  private pingPongScales(): void {
    this.effect.parts.forEach((part, i) => {
      const particles = this.particles[i];
      if (particles === null || particles === undefined || !part.using || !part.particle!.repeatScal) return;
      if (keyAt(part.keys, this.curFrame) === null) return;
      for (const particle of particles) {
        const length = vecLength(particle.scale);
        if (length >= vecLength(particle.scaleEnd)) particle.shrinking = true;
        else if (length <= vecLength(particle.scaleStart)) particle.shrinking = false;
        particle.scale = particle.shrinking ? vecSub(particle.scale, particle.scaleSpeed) : vecAdd(particle.scale, particle.scaleSpeed);
      }
    });
  }

  /**
   * `CSfxPartBill::Render` (`:314-418`): scale = effect scale * key scale; then by bill type BILL and POLE `S * Rz(
   * rotate.z ) * invView` (POLE "is not done yet" and is the same, `:368-376`), BOTTOM `S * Rz( rotate.z - angle ) *
   * Rx( 90 )`, NORMAL `S * YawPitchRoll( rotate + ( 0, angle, 0 ) )`; then the offset `key.pos` turned by
   * `YawPitchRoll( posRotate + ( 0, angle, 0 ) )` and multiplied by the effect scale (`:386-394`).
   */
  private billDraw(part: WebEffectPart, index: number, turn: Turn, scale: Vec3, invView: Matrix): EffectQuadDraw | null {
    const texture = partTexture(part, this.curFrame);
    if (texture === undefined) return null;
    const at = keyAt(part.keys, this.curFrame);
    if (at === null) return null;
    const { key } = at;
    const { angle, rotation } = turn;
    const sized = vecMul(scale, key.scale);
    const matScale = scaling(sized[0], sized[1], sized[2]);
    let local: Matrix;
    if (part.billType === BILL_BOTTOM) {
      // Render2 turns a bottom quad by the roll (`Key.vRotate.z - fAngle.z`, :233), Render by the heading
      const by = rotation === undefined ? angle : rotation[2];
      local = product(matScale, rotationZ(degToRad(f32(key.rotate[2] - by))), rotationX(RIGHT_ANGLE));
    } else if (part.billType === BILL_NORMAL) {
      // Render2: S * YawPitchRoll( rotate ) * YawPitchRoll( fAngle ) (:248-256)
      local = rotation === undefined ? multiply(matScale, turnedBy(key.rotate, angle)) : product(matScale, yprOf(key.rotate), yprOf(rotation));
    } else {
      local = product(matScale, rotationZ(degToRad(key.rotate[2])), invView); // BILL_BILL, BILL_POLE
    }
    // Render2: the offset turned by YawPitchRoll( fAngle ) * YawPitchRoll( posRotate ) (:260-266)
    const placing = rotation === undefined ? turnedBy(key.posRotate, angle) : multiply(yprOf(rotation), yprOf(key.posRotate));
    const offset = vecMul(transformCoord(key.pos, placing), scale);
    return {
      kind: 'quad', part: index, texture, billType: part.billType, matrix: multiply(local, translation(offset[0], offset[1], offset[2])),
      alpha: key.alpha & 0xff, additive: part.alphaType === ALPHA_GLOW,
    };
  }

  /**
   * `CSfxModel::RenderParticles` (`:2507-2697`): the part's key at the frame places the emitter, and each particle is a
   * quad `Rot * S * orientation * T`:
   * - orientation by bill type: BILL and POLE `Rz( rotate.z ) * invView`, BOTTOM `Rz( rotate.z - angle ) * Rx( 90 )`,
   *   NORMAL `YawPitchRoll( rotate + ( 0, angle, 0 ) )` (`:2536-2566`);
   * - T: the emitter offset `key.pos` turned by `YawPitchRoll( posRotate + ( 0, angle, 0 ) )`, **not** scaled, plus the
   *   particle's position turned by `YawPitchRoll( rotate + posRotate + ( 0, angle, 0 ) )` times the effect scale
   *   (`:2581-2583,2640-2647`);
   * - S: the particle's scale x and y times the effect's, z the effect's (`:2649`); the key's scale is not used;
   * - Rot: `YawPitchRoll` of the particle's rotation times how far the frame is through the key segment (not the
   *   particle's age), none when the frame is a key's (`:2654-2665`);
   * - texture by the particle's age, `( texFrame * age / texLoop ) % texFrame` (`:2597-2614`);
   * - alpha in integers: rising over `appear`, the key's until `keep`, falling to 0 at `disappear` (`:2679-2692`).
   */
  private particleDraws(
    part: WebEffectPart, index: number, particles: readonly Particle[], turn: Turn, scale: Vec3, invView: Matrix, out: EffectDraw[],
  ): void {
    const at = keyAt(part.keys, this.curFrame);
    if (at === null) return;
    const { key, prev, span } = at;
    const block = part.particle!;
    const { angle, rotation } = turn;
    let orientation: Matrix;
    if (part.billType === BILL_BOTTOM) {
      // RenderParticles2 does not turn a bottom particle (:2180-2185)
      const by = rotation === undefined ? angle : 0;
      orientation = multiply(rotationZ(degToRad(f32(key.rotate[2] - by))), rotationX(RIGHT_ANGLE));
    } else if (part.billType === BILL_NORMAL) {
      orientation = rotation === undefined ? turnedBy(key.rotate, angle) : multiply(yprOf(key.rotate), yprOf(rotation));
    } else {
      orientation = multiply(rotationZ(degToRad(key.rotate[2])), invView); // BILL_BILL, BILL_POLE
    }
    // RenderParticles2: the emitter by YawPitchRoll( fAngle ) * YawPitchRoll( posRotate ), each particle by
    // YawPitchRoll( rotate + posRotate ) * YawPitchRoll( fAngle ) (:2216-2222, :2282-2285)
    const emitter = transformCoord(key.pos, rotation === undefined
      ? turnedBy(key.posRotate, angle) : multiply(yprOf(rotation), yprOf(key.posRotate)));
    const spread = rotation === undefined
      ? turnedBy(vecAdd(key.rotate, key.posRotate), angle) : multiply(yprOf(vecAdd(key.rotate, key.posRotate)), yprOf(rotation));
    const through = span === 0 ? 0 : f32((this.curFrame - prev.frame) / span);
    for (const particle of particles) {
      const texture = part.texFrame > 1
        ? (part.frames[Math.trunc((part.texFrame * particle.age) / part.texLoop) % part.texFrame] ?? null)
        : part.texture;
      const offset = transformCoord(particle.pos, spread);
      const matTrans = translation(
        f32(emitter[0] + f32(offset[0] * scale[0])), f32(emitter[1] + f32(offset[1] * scale[1])), f32(emitter[2] + f32(offset[2] * scale[2])),
      );
      const matScale = scaling(f32(particle.scale[0] * scale[0]), f32(particle.scale[1] * scale[1]), scale[2]);
      // D3DXVec3Lerp( 0, rotation, through ): 0 + through * ( rotation - 0 )
      const turn: Vec3 = span === 0 ? [0, 0, 0] : [f32(through * particle.rotation[0]), f32(through * particle.rotation[1]), f32(through * particle.rotation[2])];
      const matRot = yawPitchRoll(degToRad(turn[1]), degToRad(turn[0]), degToRad(turn[2]));
      let alpha: number;
      if (particle.age < block.appear) alpha = Math.trunc((particle.age * key.alpha) / block.appear);
      else if (particle.age > block.keep) alpha = key.alpha - Math.trunc((key.alpha * (particle.age - block.keep)) / (block.disappear - block.keep));
      else alpha = key.alpha;
      out.push({
        kind: 'quad', part: index, texture, billType: part.billType, matrix: product(matRot, matScale, orientation, matTrans),
        alpha: alpha & 0xff, additive: part.alphaType === ALPHA_GLOW,
      });
    }
  }

  /**
   * `CSfxPartCustomMesh::Render` (`:1303-1442`): the cone's size and UVs are the key's scale and posRotate
   * (`EffectConeDraw`); orientation by bill type BILL `Rz( rotate.z - angle ) * inverse( view without translation )`
   * (the same rotation as `g_matInvView`), POLE `Rz( rotate.z ) * the same`, BOTTOM `Rz( rotate.z ) * Rx( 90 )`, NORMAL
   * `YawPitchRoll( rotate + ( 0, angle, 0 ) )` (`:1331-1366`); the offset `key.pos` turned by the effect angle alone
   * (`posRotate` is not a turn here) and multiplied by the effect scale (`:1372-1385`).
   */
  private coneDraw(part: WebEffectPart, index: number, turn: Turn, scale: Vec3, invView: Matrix): EffectConeDraw | null {
    const texture = partTexture(part, this.curFrame);
    if (texture === undefined) return null;
    const at = keyAt(part.keys, this.curFrame);
    if (at === null) return null;
    const { key } = at;
    const { angle, rotation } = turn;
    let orientation: Matrix;
    // Render2 (:1478-1507): BILL by the roll, NORMAL by YawPitchRoll( rotate ) * YawPitchRoll( fAngle )
    if (part.billType === BILL_BILL) {
      orientation = multiply(rotationZ(degToRad(f32(key.rotate[2] - (rotation === undefined ? angle : rotation[2])))), invView);
    } else if (part.billType === BILL_POLE) {
      orientation = multiply(rotationZ(degToRad(key.rotate[2])), invView);
    } else if (part.billType === BILL_BOTTOM) {
      orientation = multiply(rotationZ(degToRad(key.rotate[2])), rotationX(RIGHT_ANGLE));
    } else {
      orientation = rotation === undefined ? turnedBy(key.rotate, angle) : multiply(yprOf(key.rotate), yprOf(rotation));
    }
    // Render2: the offset turned by YawPitchRoll( fAngle ) (:1508-1513)
    const offset = vecMul(transformCoord(key.pos, rotation === undefined ? turnedBy([0, 0, 0], angle) : yprOf(rotation)), scale);
    const placed = multiply(orientation, translation(offset[0], offset[1], offset[2]));
    return {
      kind: 'cone', part: index, texture, billType: part.billType, matrix: multiply(scaling(scale[0], scale[1], scale[2]), placed),
      top: key.scale[0], bottom: key.scale[2], height: key.scale[1], uv: [...key.posRotate], points: part.points,
      alpha: key.alpha & 0xff, additive: part.alphaType === ALPHA_GLOW, ...(rotation === undefined ? {} : { topV: CONE_TOP_V2 }),
    };
  }
}
