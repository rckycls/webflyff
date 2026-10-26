import { Bone, BoxGeometry, BufferGeometry, Group, Matrix4, Mesh, Object3D, Skeleton, SkinnedMesh, Texture, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { toWebPosition } from '@flyffweb/formats';
import type { SkeletonGrips, Vec3 } from '@flyffweb/formats';
import { assembleCharacter } from '../src/character/assemble';
import { attachHeld } from '../src/character/held';

/**
 * The grips of the converted `mvr_male.chr` (skeletons/mvr_male.glb): the right hand is bone 17, the left hand 13, the
 * right forearm 16 and the left forearm 12, and the four matrices as the file stores them (D3DXMATRIX memory order).
 */
const MALE_GRIPS: SkeletonGrips = {
  rHand: 17,
  lHand: 13,
  rArm: 16,
  lArm: 12,
  localRH: [
    0.1805204302072525, 0.9835354089736938, -0.008394023403525352, 0, 0.05313798785209656, -0.018273919820785522,
    -0.9984198808670044, 0, -0.9821346998214722, 0.1797892153263092, -0.05556169152259827, 0, 0.10551118850708008,
    -0.01572871208190918, -0.004545331001281738, 1.0000001192092896,
  ],
  localLH: [
    0.1805187165737152, -0.9835355877876282, -0.008391354233026505, 0, -0.053135186433792114, -0.018271058797836304,
    0.998420000076294, 0, -0.9821351766586304, -0.17978769540786743, -0.05555856227874756, 0, 0.10592564940452576,
    0.01580803468823433, -0.005081892013549805, 0.9999999403953552,
  ],
  localShield: [
    -0.998146653175354, -0.031813085079193115, -0.05187687277793884, 0, -0.032164450734853745, 0.9994648098945618,
    0.005950744263827801, 0, 0.05165974423289299, 0.0076082684099674225, -0.9986355900764465, 0, 0.08033421635627747,
    0.05767160654067993, -0.02940378338098526, 1,
  ],
  localKnuckle: [
    -0.9981464743614197, 0.0318128764629364, -0.05187873914837837, 0, -0.03216417506337166, -0.999464750289917,
    0.005952903535217047, 0, -0.05166154354810715, 0.007610558532178402, 0.9986355304718018, 0, 0.11212369799613953,
    0.008302867412567139, 0.000004015862941741943, 0.9999999403953552,
  ],
};

/** The bone names of the male skeleton where the grips are; the others are numbered. */
const NAMED: Record<number, string> = {
  12: 'Bip02 L ForeArm',
  13: 'Bip02 L Hand',
  16: 'Bip02 R ForeArm',
  17: 'Bip02 R Hand',
};
const BONES = Array.from({ length: 20 }, (_, i) => NAMED[i] ?? `Bip02 bone${i}`);

/** Bones in a chain under a node named `skeleton`, each a step up and turned a little, so no two world matrices agree. */
function joints(names: readonly string[]): { scene: Group; bones: Bone[] } {
  const scene = new Group();
  const root = new Object3D();
  root.name = 'skeleton';
  scene.add(root);
  const bones = names.map((name, i) => {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(0.01 * i, i === 0 ? 1 : 0.05, -0.02 * i);
    bone.rotation.set(0.1, 0.2 * (i % 3), -0.15);
    return bone;
  });
  bones.forEach((bone, i) => (i === 0 ? root : bones[i - 1]!).add(bone));
  return { scene, bones };
}

/** A body part as GLTFLoader gives a converted one: its own joints, and a lod0 skinned to all of them, in bone order. */
function part(names: readonly string[], box?: { min: Vec3; max: Vec3 }): { scene: Group } {
  const { scene, bones } = joints(names);
  const mesh = new SkinnedMesh(new BufferGeometry());
  mesh.name = 'lod0';
  mesh.bind(new Skeleton(bones), new Matrix4());
  scene.add(mesh);
  if (box !== undefined) Object.assign(scene.userData, { bbMin: box.min, bbMax: box.max });
  return { scene };
}

const cache = () => ({ acquire: vi.fn(async () => new Texture()), release: vi.fn() });

/**
 * A man in the world as the mover views place one: the character in a holder moved and turned like a mover, with the
 * grips `grips` (the male's unless given) and a body whose box is 1.8 m tall.
 */
async function man(grips: SkeletonGrips = MALE_GRIPS, names: readonly string[] = BONES) {
  const skeleton = joints(names);
  skeleton.scene.userData.grips = grips;
  const body = part(names, { min: [-0.5, 0, -0.25], max: [0.5, 1.8, 0.25] });
  const character = await assembleCharacter(skeleton, [body], cache());
  const holder = new Group();
  holder.position.set(6968, 100, -3328);
  holder.rotation.y = (135 * Math.PI) / 180;
  holder.add(character.root);
  const bone = (name: string): Object3D => character.root.getObjectByName(name)!;
  return { character, holder, bone };
}

/** The Wooden Sword's box as models/item_weaswowooden.glb carries it (`bbMin`, `bbMax`). */
const SWORD_BOX = {
  min: [-0.08166458457708359, -0.0262292493134737, -0.10294780135154724] as Vec3,
  max: [0.7434495091438293, 0.02671799808740616, 0.10251854360103607] as Vec3,
};

/** A held item as its glb's scene: a mesh in its lod0, and the box in the scene's userData unless it is of an older conversion. */
function item(box: { min: Vec3; max: Vec3 } | null = SWORD_BOX): Group {
  const scene = new Group();
  const lod = new Mesh(new BoxGeometry(0.8, 0.05, 0.2));
  lod.name = 'lod0';
  scene.add(lod);
  if (box !== null) Object.assign(scene.userData, { bbMin: box.min, bbMax: box.max });
  return scene;
}

/** Where `point` (D3D, in the item's space) of a held item is in the world, by its world matrix. */
const worldOf = (held: Object3D, point: Vec3): Vector3 => new Vector3(...toWebPosition(point)).applyMatrix4(held.matrixWorld);

/**
 * Where CModelObject::Render (ModelObject.cpp:1134-1142) puts `point` (D3D, in the item's space) of an item held with the
 * grip matrix `local` from `bone`: `point * local * m_mUpdateBone[bone] * mWorld`. The bone's world matrix already is
 * `m_mUpdateBone[bone] * mWorld` (the joint under the mover's holder), so only `point * local` is worked out here, in
 * D3D (row vector times the matrix as stored), then moved by the joint's world matrix.
 */
function heldAt(bone: Object3D, local: readonly number[], point: Vec3): Vector3 {
  const [x, y, z] = point;
  const byLocal: Vec3 = [0, 1, 2].map((c) => x * local[c]! + y * local[4 + c]! + z * local[8 + c]! + local[12 + c]!) as Vec3;
  return new Vector3(...toWebPosition(byLocal)).applyMatrix4(bone.matrixWorld);
}

/** Within 1e-4 m. */
function expectAt(actual: Vector3, expected: Vector3): void {
  expect(actual.distanceTo(expected), `${actual.toArray().join(', ')} vs ${expected.toArray().join(', ')}`).toBeLessThan(1e-4);
}

/** The origin and the tips of the item's axes, which pin its position and its turn. */
const POINTS: Vec3[] = [
  [0, 0, 0],
  [0.7, 0, 0],
  [0, 0.3, 0],
  [0, 0, 0.2],
];

describe('attachHeld', () => {
  it('the Wooden Sword sits at the right hand', async () => {
    const { character, holder, bone } = await man();
    const sword = item();

    attachHeld(character, sword, 'right');
    holder.updateMatrixWorld(true);

    // its origin is the right hand's world matrix times localRH, and so is the tip of its blade (the item's +x)
    for (const point of POINTS) expectAt(worldOf(sword, point), heldAt(bone('Bip02 R Hand'), MALE_GRIPS.localRH, point));
  });

  it('follows the hand as the motion moves it', async () => {
    const { character, holder, bone } = await man();
    const sword = item();
    attachHeld(character, sword, 'right');

    const hand = bone('Bip02 R Hand');
    hand.rotation.set(0.7, -0.4, 1.1);
    hand.position.x += 0.1;
    holder.updateMatrixWorld(true);

    for (const point of POINTS) expectAt(worldOf(sword, point), heldAt(hand, MALE_GRIPS.localRH, point));
  });

  it('a shield goes to the shield grip: the left forearm, with localShield', async () => {
    const { character, holder, bone } = await man();
    const shield = item({ min: [-0.3, -0.4, -0.05], max: [0.3, 0.4, 0.1] });

    attachHeld(character, shield, 'shield');
    holder.updateMatrixWorld(true);

    // SetParent( PARTS_SHIELD, GetLArmIdx() ) (MoverEquip.cpp:422), drawn with m_mLocalShield (ModelObject.cpp:1139-1140)
    for (const point of POINTS) expectAt(worldOf(shield, point), heldAt(bone('Bip02 L ForeArm'), MALE_GRIPS.localShield, point));
  });

  it('a knuckle goes to the right forearm with localKnuckle, and the left hand holds with localLH', async () => {
    const { character, holder, bone } = await man();
    const knuckle = item();
    const left = item();

    attachHeld(character, knuckle, 'knuckle');
    attachHeld(character, left, 'left');
    holder.updateMatrixWorld(true);

    // IK3_KNUCKLEHAMMER: SetParent( PARTS_RWEAPON, GetRArmIdx() ) (MoverEquip.cpp:385-387), m_mLocalKnuckle (:1141-1142)
    for (const point of POINTS) expectAt(worldOf(knuckle, point), heldAt(bone('Bip02 R ForeArm'), MALE_GRIPS.localKnuckle, point));
    // PARTS_LWEAPON: SetParent( PARTS_LWEAPON, GetLHandIdx() ) (:414), m_mLocalLH (:1137-1138)
    for (const point of POINTS) expectAt(worldOf(left, point), heldAt(bone('Bip02 L Hand'), MALE_GRIPS.localLH, point));
  });

  it('uses the matrix Render tests first when one bone is two grips', async () => {
    // a skeleton with no bone named like the hands leaves both indices at 0 (CBones::LoadBone, Bone.cpp:122-125); an item
    // for the left hand then hangs from bone 0, and Render takes localRH, whose test comes first (ModelObject.cpp:1135-1138)
    const { character, holder, bone } = await man({ ...MALE_GRIPS, rHand: 0, lHand: 0 });
    const left = item();

    attachHeld(character, left, 'left');
    holder.updateMatrixWorld(true);

    for (const point of POINTS) expectAt(worldOf(left, point), heldAt(bone('Bip02 bone0'), MALE_GRIPS.localRH, point));
  });

  it("puts the item's box into the character's, as LoadElement unions every element it loads", async () => {
    const { character } = await man();
    expect(character.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.8, 0.25] });

    attachHeld(character, item(), 'right');

    // ModelObject.cpp:735-744: the sword's own box, as stored, beside the body's (its comment: a spear held is in the box)
    expect(character.box()).toEqual({
      min: [-0.5, SWORD_BOX.min[1], -0.25],
      max: [SWORD_BOX.max[0], 1.8, 0.25],
    });
  });

  it('adds nothing to the box for an item of an older conversion, which has none', async () => {
    const { character } = await man();

    attachHeld(character, item(null), 'right');

    expect(character.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.8, 0.25] });
  });

  it('refuses a character without grips, and a grip bone the skeleton does not have, holding nothing', async () => {
    const noGrips = await assembleCharacter(joints(BONES), [part(BONES)], cache());
    const sword = item();
    expect(() => attachHeld(noGrips, sword, 'right')).toThrow(/grips/);
    expect(sword.parent).toBeNull();

    const { character } = await man({ ...MALE_GRIPS, rHand: 40 });
    expect(() => attachHeld(character, sword, 'right')).toThrow(/bone 40/);
    expect(sword.parent).toBeNull();
    expect(character.box()).toEqual({ min: [-0.5, 0, -0.25], max: [0.5, 1.8, 0.25] });
  });

  it('finds the bones through a part of the body, not through an item already held', async () => {
    const { character, holder, bone } = await man();
    const hand = bone('Bip02 R Hand');
    // an item with a skin of its own, bound to joints in another order: it is not the body
    const odd = joints([...BONES].reverse());
    const skinned = new SkinnedMesh(new BufferGeometry());
    skinned.bind(new Skeleton(odd.bones), new Matrix4());
    const first = item();
    first.add(skinned, odd.scene);
    attachHeld(character, first, 'shield');
    const sword = item();

    attachHeld(character, sword, 'right');
    holder.updateMatrixWorld(true);

    expectAt(worldOf(sword, [0, 0, 0]), heldAt(hand, MALE_GRIPS.localRH, [0, 0, 0]));
  });
});
