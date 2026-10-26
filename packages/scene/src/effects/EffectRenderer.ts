import { toWebMatrix } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { Camera, Scene, Texture } from 'three';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group, Mesh, NormalBlending,
  RGBAFormat, ShaderMaterial, UnsignedByteType,
} from 'three';
import { checkerTexture } from '../assets/placeholder';
import type { TextureCache } from '../assets/loaders';
import { EFFECT_QUAD, coneVertices } from './EffectModel';
import type { EffectConeDraw, EffectDraw } from './EffectModel';

/**
 * Draws what `EffectModel.drawList` says to: Neuz's `CSfxModel::Render` (`Source/_Common/sfxbase.cpp:2429-2505`) in
 * Three.js, with the render state it sets (`:2433-2446`, and the per-part blend `:396-407`).
 *
 * - **Colour:** the texture's RGB alone (`D3DTOP_SELECTARG1 TEXTURE`): an effect has no tint colour. The key alpha is
 *   the `TEXTUREFACTOR` alpha, and multiplies the texture's alpha (`D3DTOP_MODULATE`), so it is the one number that
 *   fades a part in and out.
 * - **Texture alpha (ruling R10):** Neuz loads every sfx texture as `D3DFMT_A1R5G5B5` (`CSfxTexture::AddTex`,
 *   `sfxbase.cpp:3146-3149`), where alpha is one bit. The shader thresholds the converted texture's alpha at one half (1
 *   at or above, else 0) before it multiplies the key alpha. 49 sfx textures have soft alpha that Neuz flattens like
 *   this. D3DX's own rounding to one bit is not known, so a banner's edge may differ by a texel.
 * - **Blending:** GLOW is `SRCBLEND SRCALPHA`, `DESTBLEND ONE` (additive), BLEND is `SRCALPHA`, `INVSRCALPHA`
 *   (`:2445`, `:396-407`). Depth test on, depth write off (`:2446,2454,2481,2493`), no culling (`:2437`): so the
 *   meshes are double sided, and a quad or cone seen from behind is drawn like one seen from the front.
 * - **Order:** after everything opaque and after the other transparent things (renderOrder 0: water), and before the
 *   name tags and the move mark (renderOrder 1, drawn over everything). Effects are sorted far to near by their
 *   distance to the camera on the ground (`ObjSortFarToNear`, `World3D.cpp:327-363`, called at `:1179`; the height
 *   counts for nothing), and each effect's parts keep file order (`:2448`, no sorting of parts).
 * - **Coordinates:** an entry's matrix is a `D3DXMATRIX` (row vectors) without the effect's position, and the vertices it
 *   moves are D3D's. Here the effect's position `at` is added to elements 12 to 14 and the matrix goes through
 *   `toWebMatrix`, the mirror of z every other web matrix goes through; the cone's vertices, which have a z, are
 *   mirrored the same way when they are built. The quad has z = 0, so it needs nothing. Nothing else converts.
 *
 * A frame is `begin()`, one `draw` for each effect, `end()`. The meshes are pooled: `begin()` takes last frame's off
 * the screen and the next `draw`s reuse them.
 */

/** Where the effects sit among the transparent things: between the water (0) and the name tags (1). */
const RENDER_ORDER_BASE = 0.5;
/** One mesh further on; 10000 meshes in a frame still sort before 1. */
const RENDER_ORDER_STEP = 0.00005;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

/**
 * Stage 0 of `CSfxModel::Render`: the colour is the texture's, the alpha the texture's times the key's. R10: the
 * texture's alpha is first one bit (`step( 0.5, a )`: 1 at 0.5 or above). `colorspace_fragment` turns the linear value of
 * the sRGB texture back into the bytes the texture holds, which D3D9 blends as they are (no sRGB write).
 */
const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D map;
uniform float alpha;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D( map, vUv );
  gl_FragColor = vec4( texel.rgb, step( 0.5, texel.a ) * alpha );
  #include <colorspace_fragment>
}
`;

type EffectMesh = Mesh<BufferGeometry, ShaderMaterial>;

interface ConeSlot {
  mesh: EffectMesh;
  /** The vertices its buffers hold. */
  capacity: number;
}

/** The meshes of one `draw` call (one effect), and how far it is from the camera. */
interface Batch {
  distance: number;
  meshes: EffectMesh[];
}

let sharedWhite: DataTexture | undefined;

/**
 * What Neuz draws for a part with no texture (`CSfxTexture::Tex` gives NULL for an empty name, `sfxbase.cpp:3169`, and
 * `AddTex` for a file it cannot load, `:3146-3157`; with no texture set the stage gives white, which the key alpha then
 * fades): one white texel. One instance for everyone, so nothing may dispose it.
 */
export function whiteTexture(): DataTexture {
  if (sharedWhite === undefined) {
    sharedWhite = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    sharedWhite.needsUpdate = true;
  }
  return sharedWhite;
}

/** The unit quad of `CSfxMng::RestoreDeviceObjects` (`sfxbase.cpp:1845-1869`) as two triangles: the fan 0, 1, 2, 3. */
function quadGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(EFFECT_QUAD.positions as number[], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(EFFECT_QUAD.uvs as number[], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/** Triangle `k` of a strip of `vertices` vertices is (k, k + 1, k + 2); both sides are drawn, so the winding does not matter. */
function stripIndex(vertices: number): BufferAttribute {
  const triangles = Math.max(vertices - 2, 0);
  const index = vertices > 0xffff ? new Uint32Array(triangles * 3) : new Uint16Array(triangles * 3);
  for (let k = 0; k < triangles; k++) index.set([k, k + 1, k + 2], k * 3);
  return new BufferAttribute(index, 1);
}

function coneGeometry(vertices: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(vertices * 2), 2));
  geometry.setIndex(stripIndex(vertices));
  return geometry;
}

function effectMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { map: { value: null }, alpha: { value: 1 } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}

function effectMesh(geometry: BufferGeometry): EffectMesh {
  const mesh: EffectMesh = new Mesh(geometry, effectMaterial());
  // the matrix is set whole each frame; the geometry is a unit quad or rebuilt, so its bounds are no use for culling
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

/**
 * The square of the distance on the ground between the camera and an effect at the D3D position `at`
 * (`ObjSortFarToNear`, `World3D.cpp:327-363`: x and z of the object and of the camera's position, no square root). The
 * camera's `matrixWorld` is in the web scene, where z is D3D's negated.
 */
function groundDistance(camera: Camera, at: Vec3): number {
  const e = camera.matrixWorld.elements;
  const dx = at[0] - e[12]!;
  const dz = at[2] + e[14]!;
  return dx * dx + dz * dz;
}

export class EffectRenderer {
  private readonly root = new Group();
  private readonly quadGeometry = quadGeometry();
  private readonly quads: EffectMesh[] = [];
  private readonly cones: ConeSlot[] = [];
  private quadsUsed = 0;
  private conesUsed = 0;
  private batches: Batch[] = [];
  /** `toWebMatrix`'s input, reused. */
  private readonly scratch = new Float32Array(16);

  /**
   * @param textures  The texture of a logical key (`textures/sfx/...`), or null while it is still loading, when the part
   *                  is not drawn this frame. A part with no texture does not ask. `effectTextureProvider` makes one.
   */
  constructor(
    scene: Scene,
    private readonly textures: (key: string) => Texture | null,
  ) {
    this.root.name = 'effects';
    scene.add(this.root);
  }

  /** Starts a frame: whatever was drawn last frame comes off the screen. */
  begin(): void {
    for (let i = 0; i < this.quadsUsed; i++) this.quads[i]!.visible = false;
    for (let i = 0; i < this.conesUsed; i++) this.cones[i]!.mesh.visible = false;
    this.quadsUsed = this.conesUsed = 0;
    this.batches = [];
  }

  /**
   * One effect's draw list, in part order, at `at` (D3D, where `CSfx::Render` puts `m_vPos`) as seen from `camera`, whose
   * `matrixWorld` is current. Parts whose texture is still loading are left out.
   */
  draw(list: EffectDraw[], at: Vec3, camera: Camera): void {
    const meshes: EffectMesh[] = [];
    for (const entry of list) {
      const texture = entry.texture === null ? whiteTexture() : this.textures(entry.texture);
      if (texture === null) continue;
      const mesh = entry.kind === 'quad' ? this.takeQuad() : this.takeCone(entry);
      if (mesh === null) continue;
      const { uniforms } = mesh.material;
      uniforms.map!.value = texture;
      uniforms.alpha!.value = entry.alpha / 255;
      mesh.material.blending = entry.additive ? AdditiveBlending : NormalBlending;
      this.place(mesh, entry.matrix, at);
      mesh.visible = true;
      meshes.push(mesh);
    }
    if (meshes.length > 0) this.batches.push({ distance: groundDistance(camera, at), meshes });
  }

  /** Ends the frame: the effects far to near, each in the order it was drawn in. */
  end(): void {
    // a stable sort: effects as far apart as each other keep the order they were drawn in
    const farToNear = [...this.batches].sort((a, b) => b.distance - a.distance);
    let order = RENDER_ORDER_BASE;
    for (const batch of farToNear) {
      for (const mesh of batch.meshes) {
        mesh.renderOrder = order;
        order += RENDER_ORDER_STEP;
      }
    }
    this.batches = [];
  }

  /** Takes the meshes off the scene and frees them. The textures belong to whoever made `textures`. */
  dispose(): void {
    this.root.removeFromParent();
    this.quadGeometry.dispose();
    for (const mesh of this.quads) mesh.material.dispose();
    for (const { mesh } of this.cones) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.quads.length = 0;
    this.cones.length = 0;
    this.quadsUsed = this.conesUsed = 0;
    this.batches = [];
  }

  private takeQuad(): EffectMesh {
    let mesh = this.quads[this.quadsUsed];
    if (mesh === undefined) {
      mesh = effectMesh(this.quadGeometry);
      this.quads.push(mesh);
      this.root.add(mesh);
    }
    this.quadsUsed++;
    return mesh;
  }

  /**
   * A cone's mesh with its geometry rebuilt from this frame's key (`coneVertices`, the C++ builds it each draw too,
   * `:1402-1431`): the strip's vertices with z mirrored, and as many triangles as it has. The buffers only grow; a cone
   * with fewer points draws a shorter range of them. Null for a cone with no ring to draw.
   */
  private takeCone(cone: EffectConeDraw): EffectMesh | null {
    const { positions, uvs } = coneVertices(cone);
    const vertices = positions.length / 3;
    if (vertices < 3) return null;
    let slot = this.cones[this.conesUsed];
    if (slot === undefined) {
      slot = { mesh: effectMesh(coneGeometry(vertices)), capacity: vertices };
      this.cones.push(slot);
      this.root.add(slot.mesh);
    } else if (slot.capacity < vertices) {
      slot.mesh.geometry.dispose();
      slot.mesh.geometry = coneGeometry(vertices);
      slot.capacity = vertices;
    }
    this.conesUsed++;
    const { geometry } = slot.mesh;
    const position = geometry.getAttribute('position') as Float32BufferAttribute;
    const uv = geometry.getAttribute('uv') as Float32BufferAttribute;
    for (let v = 0; v < vertices; v++) {
      position.setXYZ(v, positions[v * 3]!, positions[v * 3 + 1]!, 0 - positions[v * 3 + 2]!);
    }
    uv.array.set(uvs);
    position.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.setDrawRange(0, (vertices - 2) * 3);
    return slot.mesh;
  }

  /** The entry's matrix plus the effect's position in elements 12 to 14, as a web matrix (`toWebMatrix`). */
  private place(mesh: EffectMesh, matrix: readonly number[], at: Vec3): void {
    this.scratch.set(matrix);
    this.scratch[12] = this.scratch[12]! + at[0];
    this.scratch[13] = this.scratch[13]! + at[1];
    this.scratch[14] = this.scratch[14]! + at[2];
    mesh.matrix.fromArray(toWebMatrix(this.scratch));
    mesh.matrixWorldNeedsUpdate = true;
  }
}

/** The textures an `EffectRenderer` asks for. */
export interface EffectTextureProvider {
  /** The texture of a logical key: null while it loads (the first call starts the load), white if it cannot be had. */
  get(key: string): Texture | null;
  /** Lets go of every texture asked for. After this `get` gives null. */
  dispose(): void;
}

/**
 * The `textures` of an `EffectRenderer`, from the page's `TextureCache` (the KTX2 files of `textures/sfx/`, shared and
 * counted like every other texture). A texture that is still loading is null, so that its part is not drawn yet. One
 * that is not in the asset index or fails to load comes from the cache as the checkerboard, and the cache has said so
 * on the overlay, once for the key; it is white here, which is how Neuz draws a part whose texture file it cannot load
 * (`whiteTexture`).
 */
export function effectTextureProvider(cache: Pick<TextureCache, 'acquire' | 'release'>): EffectTextureProvider {
  /** The loaded textures; null while one loads. */
  const known = new Map<string, Texture | null>();
  let disposed = false;
  return {
    get(key) {
      if (disposed) return null;
      const texture = known.get(key);
      if (texture !== undefined) return texture;
      known.set(key, null);
      cache.acquire(key).then(
        (loaded) => {
          if (!disposed) known.set(key, loaded === checkerTexture() ? whiteTexture() : loaded);
        },
        () => {
          if (!disposed) known.set(key, whiteTexture());
        },
      );
      return null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const key of known.keys()) cache.release(key);
      known.clear();
    },
  };
}
