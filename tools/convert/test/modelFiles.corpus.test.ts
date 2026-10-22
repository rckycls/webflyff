// The model, skeleton and motion converters on real client files: skeleton choice, skins, a motion posed against the
// C++ bone matrices, own-bone animation (found by reading the client's models until one has it) and the official glTF
// validator on samples. Corpus tests (`npm run test:corpus`): they need the client folder. Every file of Client/Model
// is swept in models.corpus.test.ts; the converters' rules are unit-tested on synthetic models in models.test.ts.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { validateBytes } from 'gltf-validator';
import { flipWinding, motionFps, readAni, readChr, readO3d, toWebMatrix } from '@flyffweb/formats';
import type { O3dModel, Skeleton } from '@flyffweb/formats';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';
import { buildModelGlb } from '../src/models/modelGlb';
import { buildMotionGlb } from '../src/models/motionGlb';
import { SKELETON_NODE, boneNodeNames, buildSkeletonGlb } from '../src/models/skeletonGlb';
import { skeletonFor } from '../src/models/skeletonFor';
import {
  closeTo,
  fileBytes,
  modelPath,
  noTextures,
  poseAt,
  readGlb,
  rowMultiply,
  skinsOf,
  worldOf,
} from './helpers/glbChecks';

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
