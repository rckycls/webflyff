import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { assembleCharacter, loopMotion } from '../src/character/assemble';

/** A chain of bones under a node named `skeleton`, as the converter writes them (names as GLTFLoader leaves them). */
function skeletonScene(names: string[]): { scene: Group; bones: Bone[] } {
  const scene = new Group();
  const root = new Object3D();
  root.name = 'skeleton';
  scene.add(root);
  const bones = names.map((name, i) => {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(0, i === 0 ? 0 : 1, 0);
    return bone;
  });
  bones.forEach((bone, i) => (i === 0 ? root : bones[i - 1]!).add(bone));
  return { scene, bones };
}

/** A triangle skinned fully to `joint`. */
function skinnedTriangle(name: string, texture: string): SkinnedMesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const material = new MeshStandardMaterial();
  material.userData.texture = texture;
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = name;
  return mesh;
}

/**
 * A part glb as GLTFLoader returns it: its own copy of the joints, and lod0..lod2 bound to them with inverse bind
 * matrices that are NOT the inverse of the joints' rest pose (as for 326 bones of the client).
 */
function partScene(names: string[], texture: string): { scene: Group; inverses: Matrix4[] } {
  const { scene, bones } = skeletonScene(names);
  scene.updateMatrixWorld(true);
  const inverses = bones.map((_, i) => new Matrix4().makeTranslation(0, -i, 0.25 * (i + 1)));
  for (const lod of ['lod0', 'lod1', 'lod2']) {
    const mesh = skinnedTriangle(lod, texture);
    mesh.bind(new Skeleton(bones, inverses.map((m) => m.clone())), new Matrix4());
    scene.add(mesh);
  }
  return { scene, inverses };
}

function fakeCache() {
  const texture = new Texture();
  return {
    texture,
    acquire: vi.fn(async (_key: string | null) => texture),
    release: vi.fn((_key: string | null) => {}),
  };
}

const NAMES = ['Bip02', 'Bip02_Pelvis', 'Bip02_Spine'];

describe('assembleCharacter', () => {
  it('re-binds every part to the shared skeleton by bone name, keeping the part inverse bind matrices', async () => {
    const skeleton = skeletonScene(NAMES);
    const upper = partScene(NAMES, 'textures/upper.ktx2');
    const head = partScene([...NAMES], 'textures/head.ktx2');

    const character = await assembleCharacter({ scene: skeleton.scene }, [upper, head], fakeCache());

    const meshes: SkinnedMesh[] = [];
    character.root.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh);
    });
    expect(meshes.map((m) => m.name)).toEqual(['lod0', 'lod0']);
    for (const [mesh, part] of [
      [meshes[0]!, upper],
      [meshes[1]!, head],
    ] as const) {
      expect(mesh.skeleton.bones).toHaveLength(skeleton.bones.length);
      mesh.skeleton.bones.forEach((bone, i) => expect(bone).toBe(skeleton.bones[i]));
      mesh.skeleton.boneInverses.forEach((inverse, i) => expect(inverse.equals(part.inverses[i]!)).toBe(true));
      expect(mesh.bindMatrix.equals(new Matrix4())).toBe(true);
    }
    expect(character.root.getObjectByName('Bip02_Spine')).toBe(skeleton.bones[2]);
  });

  it('skins each vertex with the shared bone and the part inverse bind matrix', async () => {
    const skeleton = skeletonScene(NAMES);
    const part = partScene(NAMES, 'textures/upper.ktx2');
    const character = await assembleCharacter({ scene: skeleton.scene }, [part], fakeCache());
    skeleton.bones[1]!.position.set(5, 1, 0);
    character.root.updateMatrixWorld(true);
    const mesh = character.root.getObjectByName('lod0') as SkinnedMesh;

    // Vertex 0 is bound to bone 1: world(bone 1) * inverse 1 * (0, 0, 0). Bone 1 is at (5, 1, 0); inverse 1 moves by
    // (0, -1, 0.5).
    const v = mesh.getVertexPosition(0, new Vector3());

    expect(v.toArray()).toEqual([5, 0, 0.5]);
  });

  it('applies the textures the materials name and gives them back on release, once', async () => {
    const skeleton = skeletonScene(NAMES);
    const cache = fakeCache();
    const character = await assembleCharacter(
      { scene: skeleton.scene },
      [partScene(NAMES, 'textures/upper.ktx2'), partScene(NAMES, 'textures/head.ktx2')],
      cache,
    );

    expect(cache.acquire.mock.calls.map(([key]) => key).sort()).toEqual(['textures/head.ktx2', 'textures/upper.ktx2']);
    const mesh = character.root.getObjectByName('lod0') as SkinnedMesh;
    expect((mesh.material as MeshStandardMaterial).map).toBe(cache.texture);

    character.release();
    character.release();

    expect(cache.release.mock.calls.map(([key]) => key).sort()).toEqual(['textures/head.ktx2', 'textures/upper.ktx2']);
  });

  it('drives the shared skeleton through its mixer', async () => {
    const skeleton = skeletonScene(NAMES);
    const character = await assembleCharacter({ scene: skeleton.scene }, [], fakeCache());
    const clip = new AnimationClip('move', 1, [new VectorKeyframeTrack('Bip02_Pelvis.position', [0, 1], [0, 0, 0, 2, 4, 6])]);

    character.mixer.clipAction(clip).play();
    character.mixer.setTime(0.5);

    expect(skeleton.bones[1]!.position.toArray()).toEqual([1, 2, 3]);
  });

  it('names the bone a part needs and the skeleton does not have', async () => {
    const skeleton = skeletonScene(NAMES);

    await expect(
      assembleCharacter({ scene: skeleton.scene }, [partScene([...NAMES, 'Bip02_Tail'], 't.ktx2')], fakeCache()),
    ).rejects.toThrow(/part 0.*Bip02_Tail/);
  });

  it('names a part without a lod0 node', async () => {
    const skeleton = skeletonScene(NAMES);

    await expect(assembleCharacter({ scene: skeleton.scene }, [{ scene: new Group() }], fakeCache())).rejects.toThrow(
      /part 0.*lod0/,
    );
  });

  it('needs a skeleton node', async () => {
    await expect(assembleCharacter({ scene: new Group() }, [], fakeCache())).rejects.toThrow(/skeleton/);
  });
});

describe('loopMotion', () => {
  const fps = 30;
  /** Three frames of a keyed bone, and a bone held still (keys at 0 and at the last frame, as the converter writes). */
  function motion(): AnimationClip {
    const keyed = new VectorKeyframeTrack('a.position', [0, 1 / fps, 2 / fps], [0, 0, 0, 3, 0, 0, 6, 0, 0]);
    const still = new QuaternionKeyframeTrack('b.quaternion', [0, 2 / fps], [0, 0, 0, 1, 0, 0, 0, 1]);
    return new AnimationClip('walk', -1, [keyed, still]);
  }

  it('appends frame 0 one frame after the last frame, on every track', () => {
    const looped = loopMotion(motion());

    expect(looped.frames).toBe(3);
    expect(looped.clip.duration).toBeCloseTo(3 / fps, 6);
    const [keyed, still] = looped.clip.tracks;
    // The frames keep their exact times; the appended one is within float32 rounding of 3 / fps.
    expect([...keyed!.times.slice(0, 3)]).toEqual([...Float32Array.from([0, 1 / fps, 2 / fps])]);
    expect(keyed!.times[3]).toBeCloseTo(3 / fps, 6);
    expect([...keyed!.values]).toEqual([0, 0, 0, 3, 0, 0, 6, 0, 0, 0, 0, 0]);
    expect(still).toBeInstanceOf(QuaternionKeyframeTrack);
    expect([...still!.times.slice(0, 2)]).toEqual([...Float32Array.from([0, 2 / fps])]);
    expect(still!.times[2]).toBe(keyed!.times[3]);
    expect([...still!.values]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('blends the last frame back to frame 0 when it loops', () => {
    const looped = loopMotion(motion());
    const root = new Object3D();
    const a = new Object3D();
    a.name = 'a';
    root.add(a);
    const mixer = new AnimationMixer(root);
    mixer.clipAction(looped.clip).play();

    mixer.setTime(2.5 / fps);

    expect(a.position.x).toBeCloseTo(3, 4);
  });

  it('gives the exact key time of frame n, wrapping past the last frame', () => {
    const looped = loopMotion(motion());
    const times = looped.clip.tracks[0]!.times;

    expect(looped.frameTime(0)).toBe(0);
    expect(looped.frameTime(2)).toBe(times[2]);
    expect(looped.frameTime(3)).toBe(0);
    expect(looped.frameTime(4)).toBe(times[1]);
  });

  it('leaves a one-frame motion alone', () => {
    const clip = new AnimationClip('pose', -1, [new VectorKeyframeTrack('a.position', [0], [1, 2, 3])]);

    const looped = loopMotion(clip);

    expect(looped.clip).toBe(clip);
    expect(looped.frames).toBe(1);
    expect(looped.frameTime(5)).toBe(0);
  });
});
