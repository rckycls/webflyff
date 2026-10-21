import { readdirSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { Document, Node } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import {
  NO_BONE,
  flipWinding,
  motionFps,
  readAni,
  readChr,
  readO3d,
  toWebMatrix,
  toWebPosition,
  toWebQuaternion,
} from '@flyffweb/formats';
import type {
  BoneTrack,
  GmObject,
  MaterialBlock,
  Motion,
  MotionKey,
  O3dMaterial,
  O3dModel,
  Skeleton,
} from '@flyffweb/formats';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import type { StageContext } from '../src/run';
import { DEFAULT_STAGES } from '../src/run';
import { textureKey } from '../src/textures/convertTexture';
import { ALPHA_REF, buildModelGlb, materialState, skinInfluences } from '../src/models/modelGlb';
import { buildMotionGlb } from '../src/models/motionGlb';
import { NAME_MISMATCH_WARNING, modelsStage } from '../src/models/modelsStage';
import { SKELETON_NODE, boneNodeNames, buildSkeletonGlb } from '../src/models/skeletonGlb';
import { skeletonFor, skeletonOfMotion } from '../src/models/skeletonFor';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

const io = new NodeIO();
const readGlb = (bytes: Uint8Array): Promise<Document> => io.readBinary(bytes);

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A D3DXMATRIX (row-vector, file order) that translates by (x, y, z). */
const translation = (x: number, y: number, z: number): Float32Array =>
  Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

/** A material block over the first `primitiveCount` triangles (from `startIndex`). */
const block = (extra: Partial<MaterialBlock> = {}): MaterialBlock => ({
  startIndex: 0,
  primitiveCount: 1,
  materialId: 0,
  effect: 0,
  amount: 255,
  usedBones: [],
  ...extra,
});

const TEXTURED: O3dMaterial = {
  texture: 'Tex.dds',
  diffuse: [1, 1, 1, 1],
  ambient: [1, 1, 1, 1],
  specular: [0, 0, 0, 0],
  emissive: [0, 0, 0, 0],
  power: 0,
};

/** One-triangle mesh object; `extra` overrides any field. */
function gmObject(extra: Partial<GmObject> = {}): GmObject {
  return {
    kind: 'normal',
    id: 0,
    light: false,
    parentId: -1,
    parentType: -1,
    transform: Float32Array.from(IDENTITY),
    bbMin: [0, 0, 0],
    bbMax: [1, 1, 1],
    opacity: false,
    bump: false,
    rigid: false,
    usedBones: [],
    positions: Float32Array.from([0, 0, 1, 1, 0, 1, 0, 1, 1]),
    normals: Float32Array.from([0, 0, -1, 0, 0, -1, 0, 0, -1]),
    uvs: Float32Array.from([0, 0, 1, 0, 0, 1]),
    skinWeights: null,
    skinJoints: null,
    indices: Uint16Array.from([0, 1, 2]),
    vertexList: new Float32Array(9),
    vertexListIndices: Uint16Array.from([0, 1, 2]),
    physique: null,
    materials: [TEXTURED],
    blocks: [block()],
    tmFrames: null,
    ...extra,
  };
}

function o3dModel(lods: GmObject[][], extra: Partial<O3dModel> = {}): O3dModel {
  return {
    file: 'Test.o3d',
    internalName: 'Test.o3d',
    nameMatches: true,
    version: 22,
    id: 0,
    forces: [],
    scrollU: 0,
    scrollV: 0,
    bbMin: [0, 0, 0],
    bbMax: [1, 1, 1],
    perSlerp: 0.5,
    frameCount: 0,
    events: [],
    collision: null,
    lods,
    baseBones: null,
    motion: null,
    sendVS: null,
    frameAttributes: null,
    ...extra,
  };
}

/** A skeleton of `names.length` bones in a chain, each 1 unit above its parent. */
function chainSkeleton(names: string[]): Skeleton {
  const bones = names.map((name, i) => ({
    name,
    parent: i - 1,
    tm: translation(0, i, 0),
    inverseTm: translation(0, -i, 0),
    localTm: translation(0, i === 0 ? 0 : 1, 0),
  }));
  return {
    version: 7,
    id: 0,
    bones,
    sendVS: true,
    localRH: Float32Array.from(IDENTITY),
    localShield: Float32Array.from(IDENTITY),
    localKnuckle: Float32Array.from(IDENTITY),
    localLH: Float32Array.from(IDENTITY),
    events: [],
    eventParents: [],
    rHandIdx: 0,
    lHandIdx: 0,
    rArmIdx: 0,
    lArmIdx: 0,
  };
}

const noTextures = (): null => null;

/** World matrix of `node` (column-major), composed from its TRS and its parents'. */
function worldOf(node: Node): number[] {
  return node.getWorldMatrix() as unknown as number[];
}

/** a * b for two D3DXMATRIX values in file order (row vectors: a applies first). */
function rowMultiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c]! += a[r * 4 + k]! * b[k * 4 + c]!;
  }
  return out;
}

function transformPoint(m: number[], p: number[]): number[] {
  return [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!);
}

const closeTo = (actual: number[], expected: number[], digits = 5): void => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, digits));
};

describe('boneNodeNames (R18)', () => {
  it('keeps names that are unique and suffixes every duplicate with #<bone index>', () => {
    expect(boneNodeNames(chainSkeleton(['Root', 'Bone11', 'Arm', 'Bone11']))).toEqual([
      'Root',
      'Bone11#1',
      'Arm',
      'Bone11#3',
    ]);
  });
});

describe('skeletonOfMotion', () => {
  it('picks the longest skeleton name that the motion name starts with, followed by "_", ignoring case', () => {
    const chrs = ['mvr_male', 'mvr_male_big', 'item_ridridwinangel01'];
    expect(skeletonOfMotion('Mvr_male_GenStand', chrs)).toBe('mvr_male');
    expect(skeletonOfMotion('mvr_Male_Big_walk', chrs)).toBe('mvr_male_big');
    expect(skeletonOfMotion('Item_RidRidWinAngel01_stand', chrs)).toBe('item_ridridwinangel01');
    expect(skeletonOfMotion('Mvr_BangBig_walk', chrs)).toBeNull();
    expect(skeletonOfMotion('mvr_male', chrs)).toBeNull();
  });
});

describe('skinInfluences', () => {
  it('writes 4 slots per vertex: the two source influences, then zeros', () => {
    const { joints, weights } = skinInfluences(Uint16Array.from([3, 7]), Float32Array.from([0.25, 0.75]));
    expect(Array.from(joints)).toEqual([3, 7, 0, 0]);
    closeTo(Array.from(weights), [0.25, 0.75, 0, 0]);
  });

  it('merges two slots on the same bone, so no joint repeats with a weight above 0', () => {
    const { joints, weights } = skinInfluences(Uint16Array.from([5, 5]), Float32Array.from([0.5, 0.5]));
    expect(Array.from(joints)).toEqual([5, 0, 0, 0]);
    closeTo(Array.from(weights), [1, 0, 0, 0]);
  });

  it('R20: a NO_BONE influence gets weight 0 and the other is renormalized; none valid binds to bone 0', () => {
    const one = skinInfluences(Uint16Array.from([NO_BONE, 4]), Float32Array.from([0.4, 0.6]));
    expect(Array.from(one.joints)).toEqual([0, 4, 0, 0]);
    closeTo(Array.from(one.weights), [0, 1, 0, 0]);
    const none = skinInfluences(Uint16Array.from([NO_BONE, NO_BONE]), Float32Array.from([0.4, 0.6]));
    expect(Array.from(none.joints)).toEqual([0, 0, 0, 0]);
    closeTo(Array.from(none.weights), [1, 0, 0, 0]);
  });

  it('every row sums to 1 even when the source weights do not', () => {
    const { weights } = skinInfluences(Uint16Array.from([1, 2, 1, 2]), Float32Array.from([0.3, 0.3, 2, 0]));
    closeTo(Array.from(weights), [0.5, 0.5, 0, 0, 1, 0, 0, 0]);
  });
});

describe('materialState (CObject3D::SetState, Object3D.cpp:2764)', () => {
  it('maps XE_OPACITY to an alpha test at ALPHAREF 0xb0, and with an amount below 255 to blending', () => {
    expect(ALPHA_REF).toBeCloseTo(176 / 255, 10);
    expect(materialState(0, 255, false)).toEqual({ alphaMode: 'OPAQUE', alpha: 1, doubleSided: false });
    expect(materialState(0x2, 255, false)).toEqual({ alphaMode: 'MASK', alpha: 1, doubleSided: false });
    expect(materialState(0x2, 0x80, false)).toEqual({ alphaMode: 'BLEND', alpha: 0x80 / 255, doubleSided: false });
    expect(materialState(0x4, 0, false)).toEqual({ alphaMode: 'OPAQUE', alpha: 1, doubleSided: true });
    // Without XE_OPACITY the amount is ignored; light objects are drawn with culling off.
    expect(materialState(0x30, 0, true)).toEqual({ alphaMode: 'OPAQUE', alpha: 1, doubleSided: true });
  });
});

describe('buildModelGlb (synthetic models)', () => {
  it('writes one mesh per LOD named lod0..2 on nodes of the same name, one primitive per block', async () => {
    const twoBlocks = gmObject({
      positions: new Float32Array(12),
      normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(8),
      indices: Uint16Array.from([0, 1, 2, 0, 2, 3]),
      blocks: [block(), block({ startIndex: 3, effect: 0x4 })],
    });
    const model = o3dModel([[twoBlocks], [gmObject()], [gmObject()]], { collision: gmObject() });
    const doc = await readGlb(await buildModelGlb(model, null, noTextures));
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.map((m) => m.getName())).toEqual(['lod0', 'lod1', 'lod2']); // the collision mesh is left out
    expect(meshes[0]!.listPrimitives().length).toBe(2);
    const lodNodes = doc.getRoot().listScenes()[0]!.listChildren().map((n) => n.getName());
    expect(lodNodes).toEqual(['lod0', 'lod1', 'lod2']);
    const second = meshes[0]!.listPrimitives()[1]!;
    expect(Array.from(second.getIndices()!.getArray()!)).toEqual([0, 3, 2]);
    expect(second.getMaterial()!.getDoubleSided()).toBe(true);
    expect(skinsOf(doc)).toEqual([]);
  });

  it('converts positions and normals to web space, flips the winding, keeps uvs', async () => {
    const doc = await readGlb(await buildModelGlb(o3dModel([[gmObject()]]), null, noTextures));
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(Array.from(prim.getAttribute('POSITION')!.getArray()!)).toEqual([0, 0, -1, 1, 0, -1, 0, 1, -1]);
    expect(Array.from(prim.getAttribute('NORMAL')!.getArray()!)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(Array.from(prim.getAttribute('TEXCOORD_0')!.getArray()!)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(prim.getIndices()!.getArray()!)).toEqual([0, 2, 1]);
  });

  it('writes unit normals (a zero normal becomes +Y) and 0 for a texture coordinate that is NaN', async () => {
    const object = gmObject({
      normals: Float32Array.from([0, 0, -2, 0, 0, 0, 3, 0, 0]),
      uvs: Float32Array.from([0.5, Number.NaN, 1, 0, 0, 1]),
    });
    const doc = await readGlb(await buildModelGlb(o3dModel([[object]]), null, noTextures));
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(Array.from(prim.getAttribute('NORMAL')!.getArray()!)).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 0]);
    expect(Array.from(prim.getAttribute('TEXCOORD_0')!.getArray()!)).toEqual([0.5, 0, 1, 0, 0, 1]);
  });

  it('bakes the transforms of static objects (and their parents) into the vertices', async () => {
    const parent = gmObject({ transform: translation(10, 0, 0) });
    const child = gmObject({ parentId: 0, parentType: 0, transform: translation(0, 5, 0) });
    const doc = await readGlb(await buildModelGlb(o3dModel([[parent, child]]), null, noTextures));
    const [, childPrim] = doc.getRoot().listMeshes()[0]!.listPrimitives();
    // child world = local * parent: (0,0,1) + (0,5,0) + (10,0,0) = (10,5,1), z negated
    expect(Array.from(childPrim!.getAttribute('POSITION')!.getArray()!.slice(0, 3))).toEqual([10, 5, -1]);
  });

  it('material extras carry the texture key and the block effect; a block without texture gets null', async () => {
    const keyed = (name: string): string => `textures/${name.toLowerCase()}.ktx2`;
    const untextured = gmObject({ materials: [] });
    const doc = await readGlb(await buildModelGlb(o3dModel([[gmObject(), untextured]]), null, keyed));
    const extras = doc.getRoot().listMaterials().map((m) => m.getExtras());
    expect(extras).toContainEqual({ texture: 'textures/tex.dds.ktx2', effect: 0 });
    expect(extras).toContainEqual({ texture: null, effect: 0 });
  });

  it('a texture the callback does not know is written as null', async () => {
    const doc = await readGlb(await buildModelGlb(o3dModel([[gmObject()]]), null, noTextures));
    expect(doc.getRoot().listMaterials()[0]!.getExtras()).toEqual({ texture: null, effect: 0 });
  });

  it('XE_OPACITY: MASK with alphaCutoff ALPHAREF/255; with an amount: BLEND with that alpha', async () => {
    const mask = gmObject({ blocks: [block({ effect: 2 })] });
    const blend = gmObject({ blocks: [block({ effect: 2, amount: 51 })] });
    const doc = await readGlb(await buildModelGlb(o3dModel([[mask, blend]]), null, noTextures));
    const [m, b] = doc.getRoot().listMeshes()[0]!.listPrimitives().map((p) => p.getMaterial()!);
    expect(m!.getAlphaMode()).toBe('MASK');
    expect(m!.getAlphaCutoff()).toBeCloseTo(176 / 255, 6);
    expect(b!.getAlphaMode()).toBe('BLEND');
    expect(b!.getBaseColorFactor()[3]).toBeCloseTo(51 / 255, 6);
  });

  it('skins skin objects to every skeleton bone with Bone.inverseTm as inverse bind matrices', async () => {
    const skel = chainSkeleton(['Root', 'Spine', 'Head']);
    const skin = gmObject({
      kind: 'skin',
      skinWeights: Float32Array.from([1, 0, 0.5, 0.5, 0.25, 0.75]),
      skinJoints: Uint16Array.from([0, 1, 1, 2, NO_BONE, 2]),
    });
    const doc = await readGlb(await buildModelGlb(o3dModel([[skin]]), skel, noTextures));
    const skins = skinsOf(doc);
    expect(skins.length).toBe(1);
    expect(skins[0]!.listJoints().map((n) => n.getName())).toEqual(['Root', 'Spine', 'Head']);
    const ibm = Array.from(skins[0]!.getInverseBindMatrices()!.getArray()!);
    expect(ibm.slice(16, 32)).toEqual(Array.from(toWebMatrix(skel.bones[1]!.inverseTm)));
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    // an influence of weight 0 points at joint 0
    expect(Array.from(prim.getAttribute('JOINTS_0')!.getArray()!)).toEqual([0, 0, 0, 0, 1, 2, 0, 0, 0, 2, 0, 0]);
    closeTo(Array.from(prim.getAttribute('WEIGHTS_0')!.getArray()!), [1, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1, 0, 0]);
    // joints are placed at their rest (bind) pose: world = Bone.tm
    const head = skins[0]!.listJoints()[2]!;
    closeTo(worldOf(head), Array.from(toWebMatrix(skel.bones[2]!.tm)));
  });

  it('a static object hung from a bone joins the skin, bound fully to that bone, baked in its bind space', async () => {
    const skel = chainSkeleton(['Root', 'Hand']);
    const sword = gmObject({ parentId: 1, parentType: 2, transform: translation(3, 0, 0) });
    const doc = await readGlb(await buildModelGlb(o3dModel([[sword]]), skel, noTextures));
    const skins = skinsOf(doc);
    expect(skins.length).toBe(1);
    const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(Array.from(prim.getAttribute('JOINTS_0')!.getArray()!.slice(0, 4))).toEqual([1, 0, 0, 0]);
    // at rest: jointWorld(Hand) * IBM(Hand) * baked vertex = Hand.tm applied to (local * vertex) in the C++
    const ibm = Array.from(skins[0]!.getInverseBindMatrices()!.getArray()!.slice(16, 32));
    const baked = Array.from(prim.getAttribute('POSITION')!.getArray()!.slice(0, 3));
    const skinned = transformPoint(worldOf(skins[0]!.listJoints()[1]!), transformPoint(ibm, baked));
    closeTo(skinned, [3, 1, -1]); // (0,0,1) + (3,0,0) + Hand at (0,1,0), z negated
  });

  it('objects with TM keys become nodes animated by an animation named "tm"', async () => {
    const keys: MotionKey[] = [
      { position: [0, 0, 1], rotation: [0, 0, 0, 1] },
      { position: [0, 0, 2], rotation: [0, 0.6, 0, 0.8] },
      { position: [0, 0, 3], rotation: [0, 0, 0, 2] }, // not unit: written normalized (R17)
    ];
    const still = gmObject();
    const spinning = gmObject({ tmFrames: keys });
    const model = o3dModel([[still, spinning]], { frameCount: 3, perSlerp: 0.5 });
    const doc = await readGlb(await buildModelGlb(model, null, noTextures));
    const animations = doc.getRoot().listAnimations();
    expect(animations.map((a) => a.getName())).toEqual(['tm']);
    const channels = animations[0]!.listChannels();
    expect(channels.map((c) => c.getTargetPath())).toEqual(['translation', 'rotation']);
    const node = channels[0]!.getTargetNode()!;
    expect(node.getName()).toBe('lod0_1');
    expect(node.getMesh()).not.toBeNull();
    expect(node.getParentNode()!.getName()).toBe('lod0');
    const sampler = channels[1]!.getSampler()!;
    closeTo(Array.from(sampler.getInput()!.getArray()!), [0, 1 / 30, 2 / 30]);
    const rotations = Array.from(sampler.getOutput()!.getArray()!);
    closeTo(rotations.slice(4, 8), toWebQuaternion([0, 0.6, 0, 0.8]));
    closeTo(rotations.slice(8, 12), [0, 0, 0, 1]);
    const translations = Array.from(channels[0]!.getSampler()!.getOutput()!.getArray()!);
    closeTo(translations.slice(3, 6), toWebPosition([0, 0, 2]));
    // the still object is baked into the LOD mesh
    expect(doc.getRoot().listMeshes()[0]!.getName()).toBe('lod0');
  });

  it('fails when a skin object has no skeleton', async () => {
    const skin = gmObject({
      kind: 'skin',
      skinWeights: Float32Array.from([1, 0, 1, 0, 1, 0]),
      skinJoints: new Uint16Array(6),
    });
    await expect(buildModelGlb(o3dModel([[skin]]), null, noTextures)).rejects.toThrow(/skeleton/);
  });

  const skinObject = (): GmObject =>
    gmObject({ kind: 'skin', skinWeights: Float32Array.from([1, 0, 1, 0, 1, 0]), skinJoints: new Uint16Array(6) });

  it('a LOD with skinned and static objects keeps the static ones in a child node and mesh lod<k>_static', async () => {
    const model = o3dModel([[skinObject(), gmObject()]]);
    const doc = await readGlb(await buildModelGlb(model, chainSkeleton(['Root']), noTextures));
    const lod0 = doc.getRoot().listScenes()[0]!.listChildren().find((n) => n.getName() === 'lod0')!;
    expect(lod0.getMesh()!.getName()).toBe('lod0');
    expect(lod0.getSkin()).not.toBeNull();
    const children = lod0.listChildren().map((n) => [n.getName(), n.getMesh()?.getName()]);
    expect(children).toEqual([['lod0_static', 'lod0_static']]);
  });

  it('an object with TM keys hung from a bone becomes a node under that joint, animated by "tm"', async () => {
    const pose: MotionKey = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const flag = gmObject({ parentId: 1, parentType: 2, tmFrames: [pose, pose] });
    const model = o3dModel([[flag]], { frameCount: 2 });
    const doc = await readGlb(await buildModelGlb(model, chainSkeleton(['Root', 'Hand']), noTextures));
    const node = doc.getRoot().listNodes().find((n) => n.getName() === 'lod0_0')!;
    expect(node.getParentNode()!.getName()).toBe('Hand');
    expect(node.getMesh()).not.toBeNull();
    const [tm] = doc.getRoot().listAnimations();
    expect(tm!.getName()).toBe('tm');
    expect(tm!.listChannels().every((c) => c.getTargetNode() === node)).toBe(true);
  });

  it('inverse bind matrices get an exact last row 0, 0, 0, 1 (stored ones are off by float rounding)', async () => {
    const skel = chainSkeleton(['Root']);
    skel.bones[0]!.inverseTm[3] = 1e-7;
    skel.bones[0]!.inverseTm[15] = 0.99999994;
    const doc = await readGlb(await buildModelGlb(o3dModel([[skinObject()]]), skel, noTextures));
    const ibm = Array.from(skinsOf(doc)[0]!.getInverseBindMatrices()!.getArray()!);
    expect([ibm[3], ibm[7], ibm[11], ibm[15]]).toEqual([0, 0, 0, 1]);
  });

  it('light objects: extras.light, double-sided, opaque whatever their flags; no material is metallic', async () => {
    const lamp = gmObject({ light: true, blocks: [block({ effect: 2 })] });
    const doc = await readGlb(await buildModelGlb(o3dModel([[lamp]]), null, (n) => `textures/${n}`));
    const [material] = doc.getRoot().listMaterials();
    expect(material!.getExtras()).toEqual({ texture: 'textures/Tex.dds', effect: 2, light: true });
    expect([material!.getAlphaMode(), material!.getDoubleSided()]).toEqual(['OPAQUE', true]);
    expect([material!.getMetallicFactor(), material!.getRoughnessFactor()]).toEqual([0, 1]);
  });
});

function skinsOf(doc: Document) {
  return doc.getRoot().listSkins();
}

/** Sets every channel's node to its value at `frame` (a constant channel's value holds at every frame). */
function poseAt(doc: Document, frame: number): void {
  for (const channel of doc.getRoot().listAnimations()[0]!.listChannels()) {
    const output = channel.getSampler()!.getOutput()!;
    const size = output.getElementSize();
    const at = Math.min(frame, output.getCount() - 1);
    const value = Array.from(output.getArray()!.slice(at * size, (at + 1) * size));
    const node = channel.getTargetNode()!;
    if (channel.getTargetPath() === 'rotation') node.setRotation(value as [number, number, number, number]);
    else if (channel.getTargetPath() === 'translation') node.setTranslation(value as [number, number, number]);
    else node.setScale(value as [number, number, number]);
  }
}

describe('buildSkeletonGlb / buildMotionGlb (synthetic)', () => {
  it('a skeleton glb holds the bone hierarchy with rest local transforms from Bone.tm', async () => {
    const skel = chainSkeleton(['Root', 'Spine', 'Head']);
    const doc = await readGlb(await buildSkeletonGlb(skel));
    const nodes = doc.getRoot().listNodes();
    expect(nodes.map((n) => n.getName())).toEqual([SKELETON_NODE, 'Root', 'Spine', 'Head']);
    expect(nodes[1]!.getParentNode()!.getName()).toBe(SKELETON_NODE);
    expect(nodes[3]!.getParentNode()!.getName()).toBe('Spine');
    closeTo(nodes[3]!.getTranslation() as number[], [0, 1, 0]);
    expect(doc.getRoot().listMeshes()).toEqual([]);
  });

  const key = (x: number): MotionKey => ({ position: [x, 0, 0], rotation: [0, 0, 0, 1] });

  /** A bone track with `frames` keys, or without keys when `frames` is 0. */
  const track = (frames: number): BoneTrack => ({
    name: 'x',
    parent: -1,
    inverseTm: Float32Array.from(IDENTITY),
    localTm: Float32Array.from(IDENTITY),
    keys: frames === 0 ? null : Array.from({ length: frames }, (_, i) => key(i)),
    defaultTm: frames === 0 ? Float32Array.from(IDENTITY) : null,
  });

  const motionOf = (frameCount: number, tracks: BoneTrack[]): Motion => ({
    version: 10,
    id: 0,
    perSlerp: 0.5,
    frameCount,
    boneCount: tracks.length,
    tracks,
    frameAttributes: [],
    path: null,
    events: [],
  });

  it('a motion glb has the skeleton node names and one animation driving every bone track (R27, R28)', async () => {
    const skel = chainSkeleton(['Root', 'Bone11', 'Bone11']);
    // a track without keys: its defaultTm scales by 2 and moves to z 5
    const still = { ...track(0), defaultTm: Float32Array.from([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 5, 1]) };
    const doc = await readGlb(await buildMotionGlb(skel, motionOf(4, [track(4), still, track(4)]), 'test_walk'));
    expect(doc.getRoot().listNodes().map((n) => n.getName())).toEqual([SKELETON_NODE, 'Root', 'Bone11#1', 'Bone11#2']);
    const [animation] = doc.getRoot().listAnimations();
    expect(animation!.getName()).toBe('test_walk');
    const channels = animation!.listChannels();
    expect(channels.map((c) => `${c.getTargetNode()!.getName()}.${c.getTargetPath()}`)).toEqual(
      ['Root', 'Bone11#1', 'Bone11#2'].flatMap((n) => [`${n}.translation`, `${n}.rotation`, `${n}.scale`]),
    );
    const times = (i: number): number[] => Array.from(channels[i]!.getSampler()!.getInput()!.getArray()!);
    const values = (i: number): number[] => Array.from(channels[i]!.getSampler()!.getOutput()!.getArray()!);
    // keyed: a sample per frame, and scale 1 held for the whole clip
    closeTo(times(0), [0, 1 / 30, 2 / 30, 3 / 30]);
    closeTo(values(0), [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
    closeTo(times(2), [0, 3 / 30]);
    closeTo(values(2), [1, 1, 1, 1, 1, 1]);
    // without keys: the defaultTm (web space), held from 0 to the clip's end
    closeTo(times(3), [0, 3 / 30]);
    closeTo(values(3), [0, 0, -5, 0, 0, -5]);
    closeTo(values(4), [0, 0, 0, 1, 0, 0, 0, 1]);
    closeTo(values(5), [2, 2, 2, 2, 2, 2]);
  });

  it('R28: a keyed bone whose rest scale is not 1 plays at scale 1, as the client builds keyed bones', async () => {
    const skel = chainSkeleton(['Root', 'Big']);
    skel.bones[1]!.tm = Float32Array.from([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 1, 0, 1]); // rest scale 2
    const doc = await readGlb(await buildMotionGlb(skel, motionOf(2, [track(2), track(2)]), 'm'));
    const big = doc.getRoot().listNodes().find((n) => n.getName() === 'Big')!;
    closeTo(big.getScale() as number[], [2, 2, 2]);
    poseAt(doc, 1);
    const world = worldOf(big);
    closeTo([0, 1, 2].map((c) => Math.hypot(world[c * 4]!, world[c * 4 + 1]!, world[c * 4 + 2]!)), [1, 1, 1]);
  });

  it('a motion with more bone tracks than its skeleton has bones is refused', async () => {
    const motion = motionOf(1, [track(1), track(1)]);
    await expect(buildMotionGlb(chainSkeleton(['Root']), motion, 'm')).rejects.toThrow(/2 bone tracks.*1 bone/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Real client files

/** `Client/Model/<name>` (any case): its real path. */
function modelPath(name: string): string {
  const dir = path.join(clientRoot()!, 'Model');
  const found = readdirSync(dir).find((f) => f.toLowerCase() === name.toLowerCase());
  if (found === undefined) throw new Error(`Client/Model/${name} not found`);
  return path.join(dir, found);
}

const fileBytes = (file: string): Uint8Array => new Uint8Array(readFileSync(file));
const loadO3d = (name: string): O3dModel => readO3d(fileBytes(modelPath(name)), modelPath(name));
const loadChr = (name: string): Skeleton => readChr(fileBytes(modelPath(name)), modelPath(name));

interface ValidatorReport {
  issues: { numErrors: number; messages: { code: string; message: string; severity: number; pointer?: string }[] };
}

async function validationErrors(bytes: Uint8Array): Promise<string[]> {
  const report = (await validateBytes(bytes, { maxIssues: 50 })) as ValidatorReport;
  const errors = report.issues.messages.filter((m) => m.severity === 0);
  return errors.map((m) => `${m.code} ${m.pointer ?? ''}: ${m.message}`);
}

/** skeletonFor on the client file `<base>.o3d`. */
const skeletonOf = (base: string, has: (chr: string) => boolean) => skeletonFor(base, loadO3d(`${base}.o3d`), has);

describeClient('models: real client files', () => {
  it('skeletonFor: part_mvag01upper -> mvr_male, part_femalehead01 -> mvr_female, a non-skinned model -> none', () => {
    const has = (chr: string): boolean => ['mvr_male', 'mvr_female'].includes(chr);
    expect(skeletonOf('part_mvag01upper', has)).toEqual({ kind: 'chr', chr: 'mvr_male' });
    expect(skeletonOf('part_femalehead01', has)).toEqual({ kind: 'chr', chr: 'mvr_female' });
    expect(skeletonOf('Obj_ AzriaThicket01', has)).toEqual({ kind: 'none' });
  });

  it('skeletonFor: own bones; a model with only bone-attached objects; a same-named .chr; none found fails', () => {
    const chrs = new Set(['mvr_female', 'mvr_asura', 'item_ridridbutterbujun01']);
    const has = (chr: string): boolean => chrs.has(chr);
    expect(skeletonOf('Obj_MaDaPrFan0201', has)).toEqual({ kind: 'own' });
    // A cap: no skin object, but its mesh hangs off a bone of the wearer's skeleton (SetExternBone, Object3D.h:285).
    expect(skeletonOf('Part_fAcr01Cap', has)).toEqual({ kind: 'chr', chr: 'mvr_female' });
    expect(skeletonOf('mvr_Asura', has)).toEqual({ kind: 'chr', chr: 'mvr_asura' });
    // Items load <model>.chr when it exists (ModelMng.cpp:243).
    expect(skeletonOf('Item_RidRidButterBuJun01', has)).toEqual({ kind: 'chr', chr: 'item_ridridbutterbujun01' });
    expect(() => skeletonOf('mvr_Asura', () => false)).toThrow('skinned model without skeleton');
  });

  it('Part_mVag01Upper + mvr_male: one skin with every bone, weights per vertex, flipped first triangle', async () => {
    const model = loadO3d('Part_mVag01Upper.o3d');
    const skel = loadChr('mvr_male.chr');
    const doc = await readGlb(await buildModelGlb(model, skel, noTextures));
    const skins = skinsOf(doc);
    expect(skins.length).toBe(1);
    expect(skins[0]!.listJoints().length).toBe(skel.bones.length);
    expect(skins[0]!.listJoints().map((n) => n.getName())).toEqual(boneNodeNames(skel));
    expect(doc.getRoot().listMeshes().map((m) => m.getName())).toEqual(['lod0', 'lod1', 'lod2']);
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('WEIGHTS_0')!.getCount()).toBe(prim.getAttribute('POSITION')!.getCount());
        expect(prim.getAttribute('JOINTS_0')!.getCount()).toBe(prim.getAttribute('POSITION')!.getCount());
      }
    }
    const source = model.lods[0]![0]!.indices;
    const first = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getIndices()!.getArray()!;
    expect(Array.from(first.slice(0, 3))).toEqual([source[0], source[2], source[1]]);
    expect(Array.from(first.slice(0, 3))).toEqual(Array.from(flipWinding(source.slice(0, 3))));
  });

  it('Mvr_male_GenStand: one animation, translation, rotation, scale per track, (frames - 1) / fps long', async () => {
    const skel = loadChr('mvr_male.chr');
    const motion = readAni(fileBytes(modelPath('Mvr_male_GenStand.ani')), 'Mvr_male_GenStand.ani');
    const doc = await readGlb(await buildMotionGlb(skel, motion, 'mvr_male_genstand'));
    const animations = doc.getRoot().listAnimations();
    expect(animations.length).toBe(1);
    // R27, R28: every track drives its bone, keyed or not
    expect(animations[0]!.listChannels().length).toBe(motion.tracks.length * 3);
    const duration = Math.max(...animations[0]!.listSamplers().map((s) => s.getInput()!.getMax([])[0]!));
    expect(Math.abs(duration - (motion.frameCount - 1) / motionFps(motion.perSlerp))).toBeLessThan(1e-4);
    expect(doc.getRoot().listNodes().map((n) => n.getName())).toEqual([SKELETON_NODE, ...boneNodeNames(skel)]);
  });

  it('a GenStand frame posed through the motion glb gives the bone matrices CMotion::AnimateBone gives', async () => {
    const skel = loadChr('mvr_male.chr');
    const motion = readAni(fileBytes(modelPath('Mvr_male_GenStand.ani')), 'Mvr_male_GenStand.ani');
    // R ForeArm has no keys in GenStand: the client holds it at its defaultTm, which is not the skeleton's rest pose
    const foreArm = skel.bones.findIndex((b) => b.name === 'Bip02 R ForeArm');
    expect(motion.tracks[foreArm]!.keys).toBeNull();
    const frame = 7;
    // AnimateBone (Bone.cpp:656), D3DX row vectors: keyed local = D3DXMatrixRotationQuaternion(q) * translation(p),
    // unkeyed local = the track's defaultTm (Bone.cpp:773); world = local * parent world.
    const world: number[][] = [];
    skel.bones.forEach((bone, i) => {
      const track = motion.tracks[i]!;
      const key = track.keys?.[frame];
      let local: number[];
      if (key !== undefined) {
        const [x, y, z, w] = key.rotation;
        const [px, py, pz] = key.position;
        local = [
          ...[1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0],
          ...[2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0],
          ...[2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0],
          ...[px, py, pz, 1],
        ];
      } else {
        local = Array.from(track.defaultTm!);
      }
      world[i] = bone.parent === -1 ? local : rowMultiply(local, world[bone.parent]!);
    });
    const doc = await readGlb(await buildMotionGlb(skel, motion, 'm'));
    poseAt(doc, frame);
    const joints = doc.getRoot().listNodes().slice(1);
    joints.forEach((joint, i) => closeTo(worldOf(joint), Array.from(toWebMatrix(Float32Array.from(world[i]!))), 4));
  });

  it('own-bone animation: the first .o3d with its own bones and frames gets an animation named "bones"', async () => {
    const dir = path.join(clientRoot()!, 'Model');
    const names = readdirSync(dir)
      .filter((f) => /\.o3d$/i.test(f))
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
    let found: O3dModel | undefined;
    for (const name of names) {
      try {
        const m = readO3d(fileBytes(path.join(dir, name)), name);
        if (m.baseBones !== null && m.frameCount > 0) {
          found = m;
          break;
        }
      } catch {
        // the two client-rejected heads
      }
    }
    expect(found).toBeDefined();
    const doc = await readGlb(await buildModelGlb(found!, null, noTextures));
    const bones = doc.getRoot().listAnimations().find((a) => a.getName() === 'bones');
    expect(bones).toBeDefined();
    expect(bones!.listChannels().length).toBe(found!.motion!.length * 3); // R27, R28: every bone track
    expect(skinsOf(doc).every((s) => s.listJoints()[0]!.getName() === 'bone0')).toBe(true);
  });

  it('the official glTF validator finds no errors in sample model, skeleton and motion glbs', async () => {
    const male = loadChr('mvr_male.chr');
    const model = (base: string, skel: Skeleton | null): Promise<Uint8Array> =>
      buildModelGlb(loadO3d(`${base}.o3d`), skel, noTextures);
    const genStand = readAni(fileBytes(modelPath('Mvr_male_GenStand.ani')), 'Mvr_male_GenStand.ani');
    const samples: [string, Uint8Array][] = [
      ['Part_mVag01Upper', await model('Part_mVag01Upper', male)],
      ['mvr_Asura (skin + bone-attached objects)', await model('mvr_Asura', loadChr('mvr_Asura.chr'))],
      ['obj_MaEveHalloween-01 (own bones, animated chains)', await model('obj_MaEveHalloween-01', null)],
      ['Ctrl_DuDkKiPro01 (TM keys)', await model('Ctrl_DuDkKiPro01', null)],
      ['Obj_ AzriaThicket01', await model('Obj_ AzriaThicket01', null)],
      ['mvr_male skeleton', await buildSkeletonGlb(male)],
      ['Mvr_male_GenStand', await buildMotionGlb(male, genStand, 'mvr_male_genstand')],
    ];
    for (const [name, bytes] of samples) {
      expect({ name, errors: await validationErrors(bytes) }).toEqual({ name, errors: [] });
    }
  });
});

describeClient('models stage on a small client copy', () => {
  let root: string;
  let out: string;

  const COPIED = [
    'Part_mVag01Upper.o3d',
    'Part_fCloSailor01Hat.o3d',
    'Part_maleHead.o3d',
    'mvr_male.chr',
    'Mvr_male_GenStand.ani',
    'Mvr_BangBig_walk.ani',
    'Obj_ AzriaThicket01.o3d',
  ];

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-models-client-');
    out = await makeTempDir('flyffweb-models-out-');
    const loose: Record<string, Uint8Array> = {};
    for (const name of COPIED) loose[`Model/${path.basename(modelPath(name))}`] = fileBytes(modelPath(name));
    // a copy in TextureMid must not be converted (R3)
    loose['Model/TextureMid/Obj_ AzriaThicket01.o3d'] = fileBytes(modelPath('Obj_ AzriaThicket01.o3d'));
    await writeFakeClient(root, { loose });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  async function runStage(only?: string, before?: (writer: AssetWriter) => Promise<void>) {
    const writer = new AssetWriter(out);
    const report = new Report();
    await before?.(writer);
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report, only, jobs: 2, outDir: out };
    await modelsStage.run(ctx);
    await report.write(out);
    const json = JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as {
      kinds: Record<string, { ok: number; warn: number; failed: number }>;
      warnings: { kind: string; source: string; message: string }[];
      failures: { source: string; message: string }[];
    };
    return { writer, report: json };
  }

  it('runs after the textures stage', () => {
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(['textures', 'models']);
  });

  it('writes models, skeletons and motions under their logical keys', async () => {
    const { writer, report } = await runStage();
    expect(report.failures).toEqual([]);
    expect(writer.pathOf('models/part_mvag01upper.glb')).toMatch(/^models\/part_mvag01upper\.[0-9a-f]{10}\.glb$/);
    expect(writer.pathOf('models/obj_-azriathicket01.glb')).toBeDefined();
    expect(writer.pathOf('skeletons/mvr_male.glb')).toBeDefined();
    expect(writer.pathOf('motions/mvr_male/mvr_male_genstand.glb')).toBeDefined();
    expect(report.kinds.models!.ok).toBe(2);
    expect(report.kinds.skeletons!.ok).toBe(1);
    expect(report.kinds.motions!.ok).toBe(1);
  });

  it('skips with a warning: a stored name not its own, a version Neuz refuses, a motion without skeleton', async () => {
    const { report } = await runStage();
    const warnings = report.warnings
      .filter((w) => !/texture/.test(w.message))
      .map((w) => [w.kind, path.basename(w.source), w.message])
      .sort((a, b) => (a[1]!.toLowerCase() < b[1]!.toLowerCase() ? -1 : 1));
    expect(warnings).toEqual([
      ['motions', 'Mvr_BangBig_walk.ani', expect.stringMatching(/no skeleton/)],
      ['models', 'Part_fCloSailor01Hat.o3d', NAME_MISMATCH_WARNING],
      ['models', 'Part_maleHead.o3d', expect.stringMatching(/^Neuz also rejects this file .*older than/)],
    ]);
    expect(NAME_MISMATCH_WARNING).toBe('Neuz also rejects this file (Object3D.cpp:951)');
  });

  it('missing texture: the model is still written, extras.texture is null, the report has one warning', async () => {
    const { writer, report } = await runStage('Part_mVag01Upper');
    expect(report.warnings.length).toBe(1);
    expect(report.warnings[0]!.message).toMatch(/Part_mVag01Upper\.dds/);
    const glb = await fs.readFile(path.join(out, writer.pathOf('models/part_mvag01upper.glb')!));
    const doc = await readGlb(new Uint8Array(glb));
    expect(doc.getRoot().listMaterials().map((m) => m.getExtras().texture)).toEqual([null]);
  });

  it('a texture converted earlier in the run is named by its logical key', async () => {
    const key = textureKey('model', 'Part_mVag01Upper.dds');
    const { writer, report } = await runStage('Part_mVag01Upper', async (w) => {
      await w.write(key, Uint8Array.from([1, 2, 3]), 'Model/TextureMid/Part_mVag01Upper.dds');
    });
    expect(report.warnings).toEqual([]);
    const glb = await fs.readFile(path.join(out, writer.pathOf('models/part_mvag01upper.glb')!));
    const doc = await readGlb(new Uint8Array(glb));
    expect(doc.getRoot().listMaterials().map((m) => m.getExtras().texture)).toEqual([key]);
  });

  it('--only limits every file kind, but a model still finds a skeleton the filter leaves out', async () => {
    const { writer } = await runStage('part_mvag01*');
    expect(writer.pathOf('models/part_mvag01upper.glb')).toBeDefined();
    expect(writer.pathOf('skeletons/mvr_male.glb')).toBeUndefined();
    expect(writer.pathOf('motions/mvr_male/mvr_male_genstand.glb')).toBeUndefined();
  });
});
