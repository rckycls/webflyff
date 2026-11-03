// The effect renderer (EffectRenderer): an EffectModel's draw list as Three.js meshes, with the render state of
// `CSfxModel::Render` (Source/_Common/sfxbase.cpp:2433-2446): blending, depth, no tint, and the D3D to web conversion of
// the matrices. Nothing here needs a GPU: the tests read the objects the renderer puts in the scene.

import type { Vec3 } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { BufferGeometry, Mesh, ShaderMaterial, Texture } from 'three';
import {
  AdditiveBlending, DataTexture, DoubleSide, NormalBlending, PerspectiveCamera, RGBAFormat, Scene, UnsignedByteType, Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { multiply, rotationX, scaling, transformCoord, translation, yawPitchRoll } from '../src/effects/d3dx';
import { EffectRenderer, effectTextureProvider } from '../src/effects/EffectRenderer';
import type { EffectConeDraw, EffectDraw, EffectQuadDraw } from '../src/effects/EffectModel';
import { coneVertices } from '../src/effects/EffectModel';
import { checkerTexture } from '../src/assets/placeholder';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const ORIGIN: Vec3 = [0, 0, 0];

type EffectMesh = Mesh<BufferGeometry, ShaderMaterial>;

const pixel = (): Texture => {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
};

function quad(over: Partial<EffectQuadDraw> = {}): EffectQuadDraw {
  return { kind: 'quad', part: 0, texture: 'tex', billType: 4, matrix: [...IDENTITY], alpha: 255, additive: true, ...over };
}

function cone(over: Partial<EffectConeDraw> = {}): EffectConeDraw {
  return {
    kind: 'cone', part: 0, texture: 'tex', billType: 4, matrix: [...IDENTITY], alpha: 255, additive: true,
    top: 1, bottom: 2, height: 3, uv: [3, 0.25, 0.75], points: 4, ...over,
  };
}

/** The camera a world screen has: at the origin of the web scene, looking down -Z. */
function camera(at: Vec3 = [0, 0, 0]): PerspectiveCamera {
  const view = new PerspectiveCamera(45, 1, 0.1, 1000);
  view.position.set(...at);
  view.updateMatrixWorld();
  return view;
}

interface Rig {
  scene: Scene;
  renderer: EffectRenderer;
  textures: Mock<(key: string) => Texture | null>;
  /** The meshes shown now, in the order they were made. */
  shown(): EffectMesh[];
  /** All the renderer's meshes, shown or not. */
  all(): EffectMesh[];
}

function rig(textures: Record<string, Texture | null> = { tex: pixel() }): Rig {
  const scene = new Scene();
  const lookup = vi.fn<(key: string) => Texture | null>((key) => textures[key] ?? null);
  const renderer = new EffectRenderer(scene, lookup);
  const group = (): EffectMesh[] => (scene.getObjectByName('effects')?.children ?? []) as EffectMesh[];
  return { scene, renderer, textures: lookup, shown: () => group().filter((mesh) => mesh.visible), all: group };
}

/** One frame: begin, one effect's list, end. */
function frame(r: Rig, list: EffectDraw[], at: Vec3 = ORIGIN, view: PerspectiveCamera = camera()): void {
  r.renderer.begin();
  r.renderer.draw(list, at, view);
  r.renderer.end();
  r.scene.updateMatrixWorld(true);
}

/** Where vertex `i` of `mesh` is in the web scene. */
function worldVertex(mesh: EffectMesh, i: number): Vector3 {
  const positions = mesh.geometry.getAttribute('position');
  return new Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(mesh.matrixWorld);
}

function expectVector(actual: Vector3, expected: Vec3): void {
  expect([actual.x, actual.y, actual.z]).toEqual(expected.map((value) => expect.closeTo(value, 5)));
}

describe('EffectRenderer: render state (CSfxModel::Render, sfxbase.cpp:2433-2446)', () => {
  it('draws a GLOW quad additive (SRCALPHA, ONE), with the depth test on and the depth write off, on both sides', () => {
    const r = rig();
    frame(r, [quad({ additive: true })]);
    const [mesh] = r.shown();
    expect(mesh!.material.blending).toBe(AdditiveBlending);
    expect(mesh!.material.depthWrite).toBe(false);
    expect(mesh!.material.depthTest).toBe(true);
    expect(mesh!.material.transparent).toBe(true);
    expect(mesh!.material.side).toBe(DoubleSide);
    // in one pass, as D3D draws it with culling off (a ShaderMaterial's default; three.js draws another see-through
    // two-sided material twice, Piece 6 M5 part B)
    expect(mesh!.material.forceSinglePass).toBe(true);
  });

  it('draws a BLEND quad with SRCALPHA, INVSRCALPHA, still with the depth write off', () => {
    const r = rig();
    frame(r, [quad({ additive: false })]);
    const [mesh] = r.shown();
    expect(mesh!.material.blending).toBe(NormalBlending);
    expect(mesh!.material.depthWrite).toBe(false);
    expect(mesh!.material.depthTest).toBe(true);
  });

  it('takes the key alpha (0 to 255) as the alpha that multiplies the texture alpha, and no tint', () => {
    const r = rig();
    frame(r, [quad({ alpha: 51 })]);
    const [mesh] = r.shown();
    expect(mesh!.material.uniforms.alpha!.value).toBe(51 / 255);
    // the colour stage is the texture's alone (D3DTOP_SELECTARG1): there is no colour uniform to tint with
    expect(Object.keys(mesh!.material.uniforms).sort()).toEqual(['alpha', 'map']);
  });

  it('flattens the texture alpha to 0 or 1 at one half before it multiplies the key alpha (ruling R10: A1R5G5B5)', () => {
    const r = rig();
    frame(r, [quad()]);
    const source = r.shown()[0]!.material.fragmentShader;
    expect(source).toMatch(/step\(\s*0\.5\s*,\s*\w+\.a\s*\)/);
    expect(source).toMatch(/alpha/);
  });

  it('puts the meshes after the other transparent things and before the name tags (renderOrder 0 and 1)', () => {
    const r = rig();
    frame(r, [quad(), quad(), cone()]);
    for (const mesh of r.shown()) {
      expect(mesh.renderOrder).toBeGreaterThan(0);
      expect(mesh.renderOrder).toBeLessThan(1);
    }
  });
});

describe('EffectRenderer: textures', () => {
  it('gives each mesh the texture its key names, and takes it back for another key on a later frame', () => {
    const a = pixel();
    const b = pixel();
    const r = rig({ a, b });
    frame(r, [quad({ texture: 'a' })]);
    expect(r.shown()[0]!.material.uniforms.map!.value).toBe(a);
    frame(r, [quad({ texture: 'b' })]);
    expect(r.shown()[0]!.material.uniforms.map!.value).toBe(b);
  });

  it('draws nothing for a texture that is still loading, and draws it once it has loaded', () => {
    const loaded = pixel();
    const textures: Record<string, Texture | null> = { slow: null, quick: loaded };
    const r = rig(textures);
    frame(r, [quad({ texture: 'slow' }), quad({ texture: 'quick' })]);
    expect(r.shown().map((mesh) => mesh.material.uniforms.map!.value)).toEqual([loaded]);
    textures.slow = loaded;
    frame(r, [quad({ texture: 'slow' }), quad({ texture: 'quick' })]);
    expect(r.shown()).toHaveLength(2);
  });

  it('draws a part with no texture (an empty name in Neuz) untextured: white, without asking for a texture', () => {
    const r = rig();
    frame(r, [quad({ texture: null }), cone({ texture: null })]);
    const maps = r.shown().map((mesh) => mesh.material.uniforms.map!.value as Texture);
    expect(maps).toHaveLength(2);
    expect(maps[0]).toBe(maps[1]);
    expect(r.textures).not.toHaveBeenCalled();
    const image = maps[0]!.image as { data: Uint8Array };
    expect([...image.data]).toEqual([255, 255, 255, 255]);
  });
});

describe('EffectRenderer: placing the draws (D3D to the web scene, once)', () => {
  it('moves the quad to the effect position plus the matrix translation, with z negated', () => {
    const r = rig();
    frame(r, [quad({ matrix: translation(1, 2, 3) })], [10, 20, 30]);
    const [mesh] = r.shown();
    // the quad's centre
    const centre = new Vector3(0, 0, 0).applyMatrix4(mesh!.matrixWorld);
    expectVector(centre, toWebPosition([11, 22, 33]));
  });

  it("turns the quad's corners as D3D's row vectors would, then mirrors them", () => {
    // S * R * T in D3D, with a turn about all three axes
    const matrix = multiply(multiply(scaling(2, 3, 1), yawPitchRoll(0.7, -0.4, 1.1)), translation(0.5, -1, 2));
    const at: Vec3 = [4, 5, -6];
    const r = rig();
    frame(r, [quad({ matrix })], at);
    const [mesh] = r.shown();
    const corners: Vec3[] = [[-0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, -0.5, 0]];
    corners.forEach((corner, i) => {
      const d3d = transformCoord(corner, matrix);
      expectVector(worldVertex(mesh!, i), toWebPosition([d3d[0] + at[0], d3d[1] + at[1], d3d[2] + at[2]]));
    });
  });

  it('is the quad of EFFECT_QUAD with the UVs of D3D: (0, 0) top left, (1, 1) bottom right', () => {
    const r = rig();
    frame(r, [quad()]);
    const geometry = r.shown()[0]!.geometry;
    const uv = geometry.getAttribute('uv');
    expect([[0, 0], [1, 0], [1, 1], [0, 1]]).toEqual([0, 1, 2, 3].map((i) => [uv.getX(i), uv.getY(i)]));
    // the triangle fan of the C++ (0, 1, 2, 3) as two triangles
    expect([...geometry.getIndex()!.array]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('lays a BOTTOM quad flat: the matrix of D3D Rx(90) puts the quad in the ground plane', () => {
    const r = rig();
    frame(r, [quad({ billType: 2, matrix: multiply(scaling(2, 2, 2), rotationX(Math.PI / 2)) })]);
    const mesh = r.shown()[0]!;
    for (let i = 0; i < 4; i++) expect(worldVertex(mesh, i).y).toBeCloseTo(0, 5);
  });

  it("places a cone's vertices from coneVertices, as the matrix of D3D would, then mirrors them", () => {
    const draw = cone({ matrix: multiply(scaling(2, 2, 2), translation(1, 0.5, -2)), points: 4 });
    const at: Vec3 = [7, 0.2, 9];
    const r = rig();
    frame(r, [draw], at);
    const mesh = r.shown()[0]!;
    const { positions } = coneVertices(draw);
    expect(mesh.geometry.drawRange.count).toBe((positions.length / 3 - 2) * 3); // a strip of 18 vertices: 16 triangles
    for (let i = 0; i < positions.length / 3; i++) {
      const d3d = transformCoord([positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!], draw.matrix);
      expectVector(worldVertex(mesh, i), toWebPosition([d3d[0] + at[0], d3d[1] + at[1], d3d[2] + at[2]]));
    }
  });

  it("gives a cone the UVs of coneVertices and a strip's triangles", () => {
    const draw = cone({ points: 2 });
    const r = rig();
    frame(r, [draw]);
    const mesh = r.shown()[0]!;
    const { uvs } = coneVertices(draw);
    const uv = mesh.geometry.getAttribute('uv');
    for (let i = 0; i < uvs.length / 2; i++) expect([uv.getX(i), uv.getY(i)]).toEqual([uvs[i * 2], uvs[i * 2 + 1]]);
    // 5 pairs = 10 vertices: triangles (0 1 2), (1 2 3) ... (7 8 9)
    expect([...mesh.geometry.getIndex()!.array].slice(0, 6)).toEqual([0, 1, 2, 1, 2, 3]);
    expect(mesh.geometry.drawRange).toEqual({ start: 0, count: 24 });
  });

  it('rebuilds a cone each frame from its new key, and grows its buffers for a cone with more points', () => {
    const r = rig();
    frame(r, [cone({ top: 1, bottom: 1, height: 1, points: 2 })]);
    const mesh = r.shown()[0]!;
    expect(r.all()).toHaveLength(1);
    expect(worldVertex(mesh, 0).y).toBeCloseTo(1, 5);
    frame(r, [cone({ top: 1, bottom: 1, height: 5, points: 20 })]);
    expect(r.all()).toHaveLength(1);
    expect(mesh.geometry.drawRange.count).toBe((82 - 2) * 3);
    expect(worldVertex(mesh, 0).y).toBeCloseTo(5, 5);
    frame(r, [cone({ points: 2 })]); // fewer again: the same buffers, a shorter range
    expect(mesh.geometry.drawRange.count).toBe((10 - 2) * 3);
  });
});

describe('EffectRenderer: frames and the pool', () => {
  it('takes last frame off the screen at begin, and reuses its meshes', () => {
    const r = rig();
    frame(r, [quad(), quad(), quad()]);
    expect(r.shown()).toHaveLength(3);
    const made = r.all();
    r.renderer.begin();
    expect(r.shown()).toHaveLength(0);
    frame(r, [quad()]);
    expect(r.shown()).toHaveLength(1);
    r.all().forEach((mesh, i) => expect(mesh).toBe(made[i]));
  });

  it("keeps quads and cones in pools of their own, and draws several effects' lists in one frame", () => {
    const r = rig();
    r.renderer.begin();
    r.renderer.draw([quad(), cone()], ORIGIN, camera());
    r.renderer.draw([quad(), cone()], [5, 0, 0], camera());
    r.renderer.end();
    expect(r.shown()).toHaveLength(4);
    expect(r.shown().filter((mesh) => mesh.geometry.getAttribute('position').count === 4)).toHaveLength(2);
  });

  it('draws nothing for an empty list', () => {
    const r = rig();
    frame(r, []);
    expect(r.shown()).toHaveLength(0);
  });

  it('draws the effects far to near by their distance to the camera on the ground, and each effect in part order', () => {
    const r = rig();
    const view = camera([0, 50, 0]); // the web scene's z is D3D's -z; the height does not count
    r.renderer.begin();
    r.renderer.draw([quad({ alpha: 1 }), quad({ alpha: 2 })], [0, 0, -3], view); // 3 away: the nearest
    r.renderer.draw([quad({ alpha: 3 }), quad({ alpha: 4 })], [0, 0, 20], view); // 20 away: the farthest
    r.renderer.draw([quad({ alpha: 5 })], [8, 0, 0], view); // 8 away
    r.renderer.end();
    const byOrder = [...r.shown()].sort((x, y) => x.renderOrder - y.renderOrder);
    expect(byOrder.map((mesh) => Math.round((mesh.material.uniforms.alpha!.value as number) * 255))).toEqual([3, 4, 5, 1, 2]);
    expect(new Set(byOrder.map((mesh) => mesh.renderOrder)).size).toBe(5);
  });

  it('measures the distance on the ground only, from the camera as it is now', () => {
    const r = rig();
    const view = camera([0, 1000, 0]);
    r.renderer.begin();
    r.renderer.draw([quad()], [0, 0, 9], view); // 9 away on the ground, 1000 away in space
    r.renderer.draw([quad()], [0, 900, 10], view); // 10 away on the ground, 100 away in space
    r.renderer.end();
    const [nearer, farther] = r.shown();
    expect(farther!.renderOrder).toBeLessThan(nearer!.renderOrder);
  });

  it('removes its meshes from the scene and frees what it made when disposed', () => {
    const r = rig();
    frame(r, [quad(), cone()]);
    const meshes = r.all();
    const geometryDispose = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    const materialDispose = meshes.map((mesh) => vi.spyOn(mesh.material, 'dispose'));
    r.renderer.dispose();
    expect(r.scene.getObjectByName('effects')).toBeUndefined();
    expect(geometryDispose.every((spy) => spy.mock.calls.length >= 1)).toBe(true);
    expect(materialDispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});

describe('effectTextureProvider', () => {
  /** A texture cache whose `acquire` resolves when told to. */
  function fakeCache() {
    const waiting = new Map<string, (texture: Texture) => void>();
    return {
      waiting,
      acquire: vi.fn((key: string | null) => new Promise<Texture>((resolve) => waiting.set(key!, resolve))),
      release: vi.fn<(key: string | null) => void>(),
    };
  }
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('gives null while a texture loads (acquiring it once), then the texture', async () => {
    const cache = fakeCache();
    const provider = effectTextureProvider(cache);
    expect(provider.get('textures/sfx/a.ktx2')).toBeNull();
    expect(provider.get('textures/sfx/a.ktx2')).toBeNull();
    expect(cache.acquire).toHaveBeenCalledTimes(1);
    const texture = pixel();
    cache.waiting.get('textures/sfx/a.ktx2')!(texture);
    await settle();
    expect(provider.get('textures/sfx/a.ktx2')).toBe(texture);
    expect(cache.acquire).toHaveBeenCalledTimes(1);
  });

  it("draws a texture that is missing or broken (the cache's checkerboard) as white, not as the checkerboard", async () => {
    const cache = fakeCache();
    const provider = effectTextureProvider(cache);
    provider.get('textures/sfx/gone.ktx2');
    cache.waiting.get('textures/sfx/gone.ktx2')!(checkerTexture());
    await settle();
    const white = provider.get('textures/sfx/gone.ktx2');
    expect(white).not.toBeNull();
    expect(white).not.toBe(checkerTexture());
    expect([...(white!.image as { data: Uint8Array }).data]).toEqual([255, 255, 255, 255]);
  });

  it('lets each key go once when disposed, and nothing still loading is kept', async () => {
    const cache = fakeCache();
    const provider = effectTextureProvider(cache);
    provider.get('a');
    provider.get('b');
    cache.waiting.get('a')!(pixel());
    await settle();
    provider.dispose();
    provider.dispose();
    cache.waiting.get('b')!(pixel());
    await settle();
    expect(cache.release.mock.calls.map(([key]) => key).sort()).toEqual(['a', 'b']);
    expect(provider.get('a')).toBeNull();
  });
});
