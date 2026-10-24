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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import type { MotionEvents } from '@flyffweb/formats';
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

/** `part` with the box a converted model glb carries in its scene extras (GLTFLoader puts them in userData). */
function withBox<T extends { scene: Group }>(part: T, bbMin: number[], bbMax: number[]): T {
  part.scene.userData.bbMin = bbMin;
  part.scene.userData.bbMax = bbMax;
  return part;
}

describe('the box of an assembled character', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const body = (): ReturnType<typeof partScene> =>
    withBox(partScene(NAMES, 'textures/body.ktx2'), [-0.5, 0, -0.25], [0.5, 1.5, 0.25]);
  const hat = (): ReturnType<typeof partScene> =>
    withBox(partScene(NAMES, 'textures/hat.ktx2'), [-0.25, 1.25, -0.25], [0.25, 1.75, 0.5]);

  it('is the box of the one part there is, in D3D coordinates as the converter wrote it', async () => {
    const character = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [body()], fakeCache());

    expect(character.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.5, 0.25] });
  });

  it('grows with each part: the union of the loaded parts, as CModelObject::LoadElement unions them', async () => {
    const bodyOnly = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [body()], fakeCache());
    const dressed = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [body(), hat()], fakeCache());

    expect(bodyOnly.box().max[1]).toBe(1.5);
    expect(dressed.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.75, 0.5] });
  });

  it('takes each axis on its own from 65535 (ModelObject.cpp:738-743), so a box stored inverted stays', async () => {
    // 82 client models store bbMin above bbMax on an axis; the C++ compares each of the six numbers alone
    const inverted = withBox(partScene(NAMES, 't.ktx2'), [0.5, -1, 2], [-0.5, 1, -2]);

    const character = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [inverted], fakeCache());

    expect(character.box()).toEqual({ min: [0.5, -1, 2], max: [-0.5, 1, -2] });
  });

  it('adds nothing for a part of an older conversion, which has no box, and is empty without any box', async () => {
    const older = (): ReturnType<typeof partScene> => partScene(NAMES, 'textures/old.ktx2');
    const mixed = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [older(), body()], fakeCache());
    const none = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [older()], fakeCache());
    const nobody = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [], fakeCache());

    expect(mixed.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.5, 0.25] });
    // CModel::IsNullBoundBox (Model.h:138): nothing was loaded into the box; a box of zero size at the origin
    expect(none.box()).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(nobody.box()).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });

  it('gives a box of its own each time, so a caller cannot change the character', async () => {
    const character = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [body()], fakeCache());

    character.box().min[1] = 99;
    character.box().max.fill(-1);

    expect(character.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.5, 0.25] });
  });

  it('names the part whose box is not three numbers each, and a part with only one of the two', async () => {
    const skeleton = skeletonScene(NAMES);
    const broken = withBox(partScene(NAMES, 't.ktx2'), [0, 0], [1, 1, 1]);
    const half = partScene(NAMES, 't.ktx2');
    half.scene.userData.bbMin = [0, 0, 0];

    await expect(assembleCharacter({ scene: skeleton.scene }, [body(), broken], fakeCache())).rejects.toThrow(
      /part 1.*box/,
    );
    await expect(assembleCharacter({ scene: skeletonScene(NAMES).scene }, [half], fakeCache())).rejects.toThrow(
      /part 0.*box/,
    );
  });

  it('is read from the scene extras of a glb as GLTFLoader meets the converter\'s', async () => {
    const part = await new GLTFLoader().parseAsync(
      JSON.stringify({
        asset: { version: '2.0' },
        nodes: [{ name: 'skeleton' }, { name: 'lod0' }],
        scenes: [{ nodes: [0, 1], extras: { bbMin: [-1, 0, -2], bbMax: [1, 2, 3] } }],
        scene: 0,
      }),
      '',
    );
    const skeleton = skeletonScene(NAMES);

    const character = await assembleCharacter({ scene: skeleton.scene }, [part], fakeCache());

    expect(character.box()).toEqual({ min: [-1, 0, -2], max: [1, 2, 3] });
  });

  describe('grips', () => {
    const grips = {
      rHand: 4,
      lHand: 3,
      rArm: 2,
      lArm: 1,
      localRH: identity.map((v, i) => v + i / 100),
      localLH: identity.map((v, i) => v + i / 50),
      localShield: identity.map((v, i) => v + i / 25),
      localKnuckle: identity.map((v, i) => v - i / 100),
    };

    it('are the hand and forearm bones and the four grip matrices the skeleton glb carries', async () => {
      const skeleton = skeletonScene(NAMES);
      skeleton.scene.userData.grips = grips;

      const character = await assembleCharacter({ scene: skeleton.scene }, [], fakeCache());

      expect(character.grips).toEqual(grips);
    });

    it('are null for a skeleton of an older conversion', async () => {
      const character = await assembleCharacter({ scene: skeletonScene(NAMES).scene }, [], fakeCache());

      expect(character.grips).toBeNull();
    });

    it('are null for grips of the first conversion, which had the hands but not the forearms', async () => {
      // the shield and the knuckle hang from the forearm bones (ModelObject.cpp:1134-1142): without them the grips
      // cannot place a shield, so they count as absent rather than half there
      const { rArm: _rArm, lArm: _lArm, ...handsOnly } = grips;
      const skeleton = skeletonScene(NAMES);
      skeleton.scene.userData.grips = handsOnly;

      const character = await assembleCharacter({ scene: skeleton.scene }, [], fakeCache());

      expect(character.grips).toBeNull();
    });

    it('are read from the scene extras of a glb as GLTFLoader meets the converter\'s', async () => {
      const gltf = await new GLTFLoader().parseAsync(
        JSON.stringify({
          asset: { version: '2.0' },
          nodes: [{ name: 'skeleton' }],
          scenes: [{ nodes: [0], extras: { grips } }],
          scene: 0,
        }),
        '',
      );

      const character = await assembleCharacter(gltf, [], fakeCache());

      expect(character.grips).toEqual(grips);
    });

    it.each([
      ['a hand that is not a whole number', { ...grips, rHand: 1.5 }],
      ['a forearm that is negative', { ...grips, lArm: -1 }],
      ['a forearm that is a text', { ...grips, rArm: '2' }],
      ['one forearm only', { ...grips, lArm: undefined }],
      ['a matrix of 15 numbers', { ...grips, localRH: grips.localRH.slice(1) }],
      ['a matrix with a text in it', { ...grips, localLH: [...grips.localLH.slice(1), 'x'] }],
      ['a matrix that is missing', { ...grips, localKnuckle: undefined }],
      ['no object at all', 'grips'],
    ])('refuse grips with %s', async (_what, written) => {
      const skeleton = skeletonScene(NAMES);
      skeleton.scene.userData.grips = written;

      await expect(assembleCharacter({ scene: skeleton.scene }, [], fakeCache())).rejects.toThrow(/grips/);
    });
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

  describe('events', () => {
    // Mvr_male_AtkAtk1-01 as the converter writes it: 17 frames at perSlerp 0.5, a sound at frame 8, the hit at 12.
    const attack: MotionEvents = { hit: [12], sound: [[8, 140]], quake: [], frames: 17, perSlerp: 0.5 };

    /** A glb of one node moved by a two-key animation with `extras`, as GLTFLoader meets the converter's motions. */
    function glbWithExtras(extras: unknown): ArrayBuffer {
      const bin = new Uint8Array(32);
      bin.set(new Uint8Array(Float32Array.from([0, 1]).buffer), 0);
      bin.set(new Uint8Array(Float32Array.from([0, 0, 0, 1, 0, 0]).buffer), 8);
      const json = new TextEncoder().encode(
        JSON.stringify({
          asset: { version: '2.0' },
          buffers: [{ byteLength: 32 }],
          bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 8 },
            { buffer: 0, byteOffset: 8, byteLength: 24 },
          ],
          accessors: [
            { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
            { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' },
          ],
          nodes: [{ name: 'a' }],
          scenes: [{ nodes: [0] }],
          scene: 0,
          animations: [
            {
              name: 'attack',
              samplers: [{ input: 0, output: 1 }],
              channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
              extras,
            },
          ],
        }),
      );
      const jsonChunk = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
      jsonChunk.set(json);
      const glb = new Uint8Array(12 + 8 + jsonChunk.length + 8 + bin.length);
      const view = new DataView(glb.buffer);
      view.setUint32(0, 0x46546c67, true); // 'glTF'
      view.setUint32(4, 2, true);
      view.setUint32(8, glb.length, true);
      view.setUint32(12, jsonChunk.length, true);
      view.setUint32(16, 0x4e4f534a, true); // 'JSON'
      glb.set(jsonChunk, 20);
      view.setUint32(20 + jsonChunk.length, bin.length, true);
      view.setUint32(24 + jsonChunk.length, 0x004e4942, true); // 'BIN'
      glb.set(bin, 28 + jsonChunk.length);
      return glb.buffer;
    }

    it('carries the events a converted motion has in its animation extras', async () => {
      const gltf = await new GLTFLoader().parseAsync(glbWithExtras({ events: attack }), '');

      const looped = loopMotion(gltf.animations[0]!);

      expect(looped.events).toEqual(attack);
    });

    it('carries them on a one-frame motion too', () => {
      const clip = new AnimationClip('pose', -1, [new VectorKeyframeTrack('a.position', [0], [1, 2, 3])]);
      clip.userData.events = { hit: [], sound: [], quake: [0], frames: 1, perSlerp: 0.5 };

      expect(loopMotion(clip).events).toEqual({ hit: [], sound: [], quake: [0], frames: 1, perSlerp: 0.5 });
    });

    it('gives a motion without events (an older conversion) empty lists, its own frame count and its own speed', () => {
      expect(loopMotion(motion()).events).toEqual({ hit: [], sound: [], quake: [], frames: 3, perSlerp: 0.5 });
      // the speed is not in a one-frame motion
      const pose = new AnimationClip('pose', -1, [new VectorKeyframeTrack('a.position', [0], [1, 2, 3])]);
      expect(loopMotion(pose).events).toEqual({ hit: [], sound: [], quake: [], frames: 1, perSlerp: 0 });
    });

    it('refuses events that are not in the shape the converter writes', () => {
      const clip = motion();
      clip.userData.events = { ...attack, sound: [8, 140] };

      expect(() => loopMotion(clip)).toThrow(/events/);
    });
  });
});
