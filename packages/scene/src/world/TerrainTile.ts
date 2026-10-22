// One converted terrain tile as three.js meshes, drawn the way the Windows client draws a CLandscape.
//
// What the C++ does (CWorld::RenderTerrain sets the state, World3D.cpp:444-469; CLandscape::Render, lod.cpp:866, and
// RenderPatches, lod.cpp:805, draw):
//  - Layers are drawn in file order, each one patch by patch, over the same triangles (same positions, depth test
//    LESSEQUAL, the D3D default, and depth writes on, World3D.cpp:468-469), so a later layer lands on the earlier ones.
//  - Texture stage 0 is `layer texture x vertex diffuse` (the D3D-lit colour, :448-454); stage 1 is `current x light
//    map x 2` (D3DTOP_MODULATE2X, :456-458). The light map's rgb is therefore 0.5 for "unchanged" (the Madrigal tiles checked
//    hold 127 everywhere); what it really carries is the alpha.
//  - The alpha blend is SRCALPHA / INVSRCALPHA (:463-464), always on. The alpha comes from stage 1 only when the patch
//    was already drawn by an earlier layer (D3DTOP_SELECTARG1 of the light map's alpha, lod.cpp:846); the first layer
//    to draw a patch has stage 1's alpha disabled (lod.cpp:855), which passes stage 0's alpha on, and the terrain textures are
//    all opaque (checked for every texture of Client/World/TextureMid), so that draw simply replaces what is there.
//    So there is no "layer 0 is the base": the first layer that covers a patch is, and not every patch is covered by
//    layer 0.
//  - Samplers: the layer texture wraps and is bilinear with the nearest mip level (World3D.cpp:117-120, :156, :199-202,
//    :238; here the texture cache's own filters are used, which blend between mip levels); the light map is bilinear
//    (lod.cpp:338-339).
//  - Culling is D3DCULL_CCW (:446), i.e. back faces are dropped, as three.js does by default.
//
// Here that becomes two kinds of mesh per layer, which share the tile's vertices and each have an index buffer of
// their own: an opaque one for the patches this layer is the first to cover (alpha 1, no blending), and a blended one
// for the patches earlier layers already drew (blended by the light map's alpha). Blended meshes are ordered by layer
// (`renderOrder`), all after the opaque ones, which gives the C++'s order; the opaque ones never overlap.
//
// Colour: D3D computes in the colour numbers as stored, with no sRGB step, and blends the same way. The shader does
// too, so it decodes the (sRGB flagged) layer texture back to those numbers and writes its result without three.js'
// output conversion, straight to the canvas. That is what makes the ground look like the client's. The fog is
// three.js' own chunk: for a canvas it hands the shader `fogColor` already in the output colour space (WebGLMaterials
// refreshFogUniforms, three@0.186), which is the space this shader works in, so `new Fog(hex)` fades to that hex, like
// every other material and the clear colour.
//
// Vertex lighting (the diffuse of stage 0) comes from `TerrainLighting`, which the world view owns and updates with the
// time of day (CWorld::SetLight, World3D.cpp:1778-2010); unlit (diffuse 1) until it does.
//
// Memory: a light map's pixels (64 KiB a layer, up to 33 layers a tile) are let go of once they are on the GPU
// (`onUpdate`); the tile streamer keeps only a tile's heights, so nothing else holds them. A lost WebGL context cannot
// get them back: the overlay then says to reload the page. The geometry is kept (three needs it to draw).

import type { WebTile, WorldManifest } from '@flyffweb/formats';
import type { IUniform, Texture } from 'three';
import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { TextureCache } from '../assets/loaders';
import { geometryBytes, textureBytes } from '../overlay/gpuMemory';
import { PATCH_COUNT, buildTerrainGeometry, layerIndices } from './terrainGeometry';

/** The light map is MAP_SIZE x MAP_SIZE texels per layer (lod.cpp:1682-1685), rgba. */
const LIGHT_SIZE = 128;
/**
 * Blended meshes sort by this plus their layer. Three.js draws transparent objects by `renderOrder` first, so the
 * layers keep their order; the base is negative so the ground is also before other transparent things (water, effects).
 */
const BLENDED_RENDER_ORDER = -1000;

/**
 * The lighting of stage 0's vertex diffuse: `clamp(ambient + sunColor * max(dot(normal, sunDirection), 0))`, numbers
 * as D3D uses them (0 to 1, no colour management). One instance can be shared by every tile; changing it changes
 * them all. The defaults are unlit: diffuse 1, so the ground is the layer textures times the light maps.
 */
export class TerrainLighting {
  /** What D3D adds without regard to the normal: the global ambient plus the light's ambient. */
  readonly ambient = new Vector3(1, 1, 1);
  readonly sunColor = new Vector3(0, 0, 0);
  /** Unit vector from the ground toward the sun, in the web frame. */
  readonly sunDirection = new Vector3(0, 1, 0);
}

export interface TerrainDeps {
  textures: Pick<TextureCache, 'acquire' | 'release'>;
  /** Shared with other tiles when given; each tile has its own, unlit, otherwise. */
  lighting?: TerrainLighting;
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 uv1;
  varying vec2 vTextureUv;
  varying vec2 vLightUv;
  varying vec3 vNormal;
  #include <fog_pars_vertex>

  // The layers draw the same triangles and rely on equal depths (depth func LESS_EQUAL).
  invariant gl_Position;

  void main() {
    vTextureUv = uv;
    vLightUv = uv1;
    vNormal = normal;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform sampler2D uLight;
  uniform vec3 uAmbient;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  varying vec2 vTextureUv;
  varying vec2 vLightUv;
  varying vec3 vNormal;
  #include <fog_pars_fragment>

  // The sRGB encoding of a linear colour: the number D3D would have had for it.
  vec3 toStored(vec3 c) {
    vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(high, c * 12.92, step(c, vec3(0.0031308)));
  }

  void main() {
    // stage 0: texture x diffuse
    vec3 diffuse = clamp(uAmbient + uSunColor * max(dot(normalize(vNormal), uSunDirection), 0.0), 0.0, 1.0);
    vec3 colour = toStored(texture2D(uTexture, vTextureUv).rgb) * diffuse;
    // stage 1: current x light map, doubled (D3DTOP_MODULATE2X)
    vec4 light = texture2D(uLight, vLightUv);
    colour = min(colour * light.rgb * 2.0, 1.0);

    #ifdef BLENDED
      gl_FragColor = vec4(colour, light.a);
    #else
      gl_FragColor = vec4(colour, 1.0);
    #endif

    // the fog colour is already an output-space colour (see the header), so it is mixed as it comes
    #include <fog_fragment>
  }
`;

/** What a layer's opaque and blended meshes share: its two textures. */
interface LayerUniforms {
  texture: IUniform<Texture | null>;
  light: IUniform<DataTexture>;
}

function terrainMaterial(blended: boolean, layer: LayerUniforms, lighting: TerrainLighting): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uTexture: layer.texture,
      uLight: layer.light,
      uAmbient: { value: lighting.ambient },
      uSunColor: { value: lighting.sunColor },
      uSunDirection: { value: lighting.sunDirection },
    },
    defines: blended ? { BLENDED: '' } : {},
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    fog: true,
    transparent: blended,
    depthTest: true,
    depthWrite: true,
  });
}

function lightTexture(rgba: Uint8Array): DataTexture {
  const texture = new DataTexture(rgba, LIGHT_SIZE, LIGHT_SIZE, RGBAFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  // three calls onUpdate right after the upload: from then on the GPU has the pixels
  texture.onUpdate = () => {
    texture.image.data = null;
  };
  return texture;
}

/** A geometry that has the tile's vertex attributes (the same objects, so they are uploaded once) and its own index. */
function meshGeometry(vertices: BufferGeometry, patches: Uint8Array): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(vertices.attributes)) geometry.setAttribute(name, attribute);
  // 16641 vertices: indices fit in 16 bits, half the memory of the Uint32Array layerIndices makes
  geometry.setIndex(new BufferAttribute(Uint16Array.from(layerIndices(patches)), 1));
  geometry.boundingSphere = vertices.boundingSphere!.clone();
  return geometry;
}

export class TerrainTile {
  /**
   * The ground. Empty until every layer's texture has arrived (`ready`), so a half-textured tile is never seen. Its
   * meshes are in world coordinates: leave the group where it is.
   */
  readonly group = new Group();
  /** Resolves once the textures are in and the meshes are in `group` (or the tile was disposed first). */
  readonly ready: Promise<void>;

  private readonly vertices: BufferGeometry;
  private readonly meshes: Mesh[] = [];
  private readonly lights: DataTexture[] = [];
  /** The texture key of each layer, null for the checkerboard. Each one acquired once, so released once. */
  private readonly keys: (string | null)[] = [];
  private readonly bytes: number;
  private readonly textures: TerrainDeps['textures'];
  private disposed = false;

  constructor(tile: WebTile, manifest: WorldManifest, deps: TerrainDeps) {
    this.textures = deps.textures;
    const lighting = deps.lighting ?? new TerrainLighting();
    this.vertices = buildTerrainGeometry(tile, manifest.mpu);

    const covered = new Uint8Array(PATCH_COUNT);
    const arrivals: Promise<void>[] = [];
    let bytes = geometryBytes(this.vertices);
    tile.layers.forEach((layer, i) => {
      // RenderPatches: a patch an earlier layer already drew is blended, any other is drawn over what is there
      const first = new Uint8Array(PATCH_COUNT);
      const later = new Uint8Array(PATCH_COUNT);
      for (let p = 0; p < PATCH_COUNT; p++) {
        if (layer.patchEnable[p] === 0) continue;
        (covered[p] === 0 ? first : later)[p] = 1;
        covered[p] = 1;
      }

      const light = lightTexture(layer.light);
      this.lights.push(light);
      bytes += textureBytes(LIGHT_SIZE, LIGHT_SIZE, 'rgba8', false);
      const uniforms: LayerUniforms = { texture: { value: null }, light: { value: light } };

      const key = manifest.terrainTextures[layer.texture] ?? null;
      this.keys.push(key);
      arrivals.push(
        deps.textures.acquire(key).then((texture) => {
          uniforms.texture.value = texture;
        }),
      );

      for (const [patches, blended] of [[first, false], [later, true]] as const) {
        if (!patches.includes(1)) continue;
        const geometry = meshGeometry(this.vertices, patches);
        bytes += (geometry.index!.array as Uint16Array).byteLength;
        const mesh = new Mesh(geometry, terrainMaterial(blended, uniforms, lighting));
        if (blended) mesh.renderOrder = BLENDED_RENDER_ORDER + i;
        this.meshes.push(mesh);
      }
    });
    this.bytes = bytes;

    this.ready = Promise.all(arrivals).then(() => {
      if (!this.disposed) this.group.add(...this.meshes);
    });
  }

  /** What the tile holds on the GPU, without the layer textures (the texture cache counts those). Constant. */
  gpuBytes(): number {
    return this.bytes;
  }

  /** Frees the tile's geometry, light textures and materials and gives its layer textures back. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.clear();
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as ShaderMaterial).dispose();
    }
    this.vertices.dispose();
    // A light map is shared by its layer's meshes, and a layer texture belongs to the cache: neither is the mesh's.
    for (const light of this.lights) light.dispose();
    for (const key of this.keys) this.textures.release(key);
  }
}
