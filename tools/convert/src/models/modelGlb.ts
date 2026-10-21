// Model (`.o3d`) to glTF, following how CObject3D draws it (Source/_Common/Object3D.cpp).
//
// Layout of the glb (default scene):
//   skeleton                 when the model uses bones: the joint hierarchy (skeletonGlb.ts), from the model's own
//                            bones (named bone<i>, parents from its built-in motion) or from the given `.chr`
//   lod0, lod1, lod2         one node per LOD group (one for a model without LOD), identity transform, carrying the
//                            mesh named like it: one primitive per material block of the objects below
//     lod<k>_static          only when the LOD has both of the first two kinds below: the mesh of the static objects
//     lod<k>_<j>             object j of the group when it, or an object above it, has TM keys (see below)
//
// What goes where, per object of a LOD group:
//   - skin objects: skinned to every joint (one shared glTF skin; inverse bind matrices from Bone.inverseTm, R19).
//     RenderSkin draws them with the world matrix alone (Object3D.cpp:3025), so their own TM is not applied.
//   - static objects hung from a bone (parent type GMT_BONE, through any objects in between): their world matrix is
//     `TM chain * bone` (CObject3D::Animate, Object3D.cpp:2582). They join the skin, bound fully to that bone, with
//     the vertices moved by `inverse(inverse bind matrix) * TM chain` so that skinning gives exactly `bone * chain`.
//   - other static objects: the TM chain (TM * parent TM ...) is baked into the vertices.
//   - objects with TM keys (LoadTMAni), and every object below one: a node per object, nested like the objects (or
//     under the bone's joint), with its own mesh; the keys become the animation named "tm". A static object above an
//     animated one is baked as usual and also gets a node (no mesh) for its children to hang from.
//   The LOD mesh is the skinned mesh when the LOD has skinned content, else the static mesh.
//   The collision mesh is left out.
//
// Animations: "tm" (object TM keys) and "bones" (the model's own bone motion), frame i at i / motionFps(perSlerp).
// "bones" drives every joint as a motion glb does (motionGlb.ts, R27/R28: keys with scale 1, or the track's defaultTm).
// A keyed object node animates translation and rotation; its rest scale is already 1, as the C++ builds it.
//
// Coordinates: positions and normals through the handedness conversion (z negated), matrices through toWebMatrix,
// quaternions through toWebQuaternion and then normalized (R17), indices through flipWinding; uvs unchanged.
// Normals are written normalized (glTF requires unit normals; a few thousand client normals are not), and a
// texture coordinate that is not a number is written as 0 (glTF forbids NaN; 288 vertices of obj_HeavenTorch07.o3d).
//
// Materials: no image is embedded. `extras.texture` is the logical key `textureKey` gives for the material's texture
// name (or null), `extras.effect` the block's XE_* flags, and `extras.light` is true for light objects. Alpha and
// culling follow CObject3D::SetState (Object3D.cpp:2764), see `materialState`.

import type { Document, Material, Mesh, Node, Skin } from '@gltf-transform/core';
import { NO_BONE, flipWinding, toWebPosition, toWebQuaternion } from '@flyffweb/formats';
import type { GmObject, MaterialBlock, MotionKey, O3dModel, Skeleton } from '@flyffweb/formats';
import {
  IDENTITY,
  addAccessor,
  invert,
  multiply,
  newDocument,
  normalizeQuaternion,
  setTransform,
  transformNormals,
  transformPositions,
  webMatrix,
  writeGlb,
} from './gltf';
import type { Mat4 } from './gltf';
import { addKeyAnimation, boneTargets, fromKeys } from './motionGlb';
import type { AnimatedNode } from './motionGlb';
import { addJointNodes, chrJoints } from './skeletonGlb';

/** D3DRS_ALPHAREF 0xb0 (SetState, Object3D.cpp:2801), as glTF's alphaCutoff; the client tests GREATEREQUAL. */
export const ALPHA_REF = 0xb0 / 255;

/** XE_* block flags (Source/_Common/ModelGlobal.h). */
const XE_OPACITY = 0x2;
const XE_2SIDE = 0x4;

/** GMOBJECT parent types (m_ParentType). */
const PARENT_OBJECT = 0;
const PARENT_BONE = 2;

export interface MaterialState {
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  /** baseColorFactor alpha: the texture's alpha is multiplied by it. */
  alpha: number;
  doubleSided: boolean;
}

/**
 * How a material block is drawn, as CObject3D::SetState (Object3D.cpp:2764) sets it up for a model drawn at full
 * opacity:
 *   - XE_2SIDE: culling off (D3DCULL_NONE) -> doubleSided.
 *   - XE_OPACITY with amount 255: alpha test on the texture alpha, ALPHAREF 0xb0, GREATEREQUAL -> MASK, cutoff
 *     ALPHA_REF.
 *   - XE_OPACITY with amount below 255: alpha blending (SRCALPHA / INVSRCALPHA) of texture alpha times
 *     amount / 255 (TEXTUREFACTOR, MODULATE), alpha test ref 0 -> BLEND with that alpha.
 *   - otherwise opaque (ALPHAOP DISABLE); `amount` is then ignored.
 * Light objects (bit 31 of the object type) skip SetState: CObject3D::RenderNormal draws them additively, unlit, with
 * culling off and no depth writes (Object3D.cpp:3422-3433), and only at night (Object3D.cpp:3820), which glTF cannot
 * say; they are marked `extras.light` for the viewer and written double-sided and opaque.
 */
export function materialState(effect: number, amount: number, light: boolean): MaterialState {
  if (light) return { alphaMode: 'OPAQUE', alpha: 1, doubleSided: true };
  const doubleSided = (effect & XE_2SIDE) !== 0;
  if ((effect & XE_OPACITY) === 0) return { alphaMode: 'OPAQUE', alpha: 1, doubleSided };
  if (amount < 255) return { alphaMode: 'BLEND', alpha: Math.max(0, amount) / 255, doubleSided };
  return { alphaMode: 'MASK', alpha: 1, doubleSided };
}

/**
 * glTF JOINTS_0 / WEIGHTS_0 (4 slots per vertex) from the client's two influences per vertex. Slots keep their
 * order; slots 3 and 4 are unused. A NO_BONE joint gets weight 0 (R20); two slots on the same bone are merged into
 * the first; the weights are scaled to sum to 1; a vertex left without weight binds fully to bone 0 (R20). A slot of
 * weight 0 points at joint 0.
 */
export function skinInfluences(
  joints: Uint16Array,
  weights: Float32Array,
): { joints: Uint16Array; weights: Float32Array } {
  const count = joints.length / 2;
  const outJoints = new Uint16Array(count * 4);
  const outWeights = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    const j = [joints[v * 2]!, joints[v * 2 + 1]!];
    const w = j.map((joint, s) => (joint === NO_BONE ? 0 : Math.max(0, weights[v * 2 + s]!)));
    if (j[0] === j[1]) {
      w[0]! += w[1]!;
      w[1] = 0;
    }
    const sum = w[0]! + w[1]!;
    if (!(sum > 0)) {
      outWeights[v * 4] = 1; // joint 0
      continue;
    }
    for (let s = 0; s < 2; s++) {
      if (w[s]! > 0) {
        outJoints[v * 4 + s] = j[s]!;
        outWeights[v * 4 + s] = w[s]! / sum;
      }
    }
  }
  return { joints: outJoints, weights: outWeights };
}

/** The bones a model is drawn with: joint nodes and inverse bind matrices, by bone index. */
interface Rig {
  nodes: Node[];
  inverseBind: Mat4[];
}

function addRig(doc: Document, model: O3dModel, skeleton: Skeleton | null): Rig | null {
  if (model.baseBones !== null) {
    // The model's own bones have no names or parents of their own; its built-in motion has the parents.
    const joints = model.baseBones.map((bone, i) => ({
      name: `bone${i}`,
      parent: model.motion?.[i]?.parent ?? -1,
      world: webMatrix(bone.tm),
    }));
    return { nodes: addJointNodes(doc, joints), inverseBind: model.baseBones.map((bone) => webMatrix(bone.inverseTm)) };
  }
  if (skeleton !== null) {
    return {
      nodes: addJointNodes(doc, chrJoints(skeleton)),
      inverseBind: skeleton.bones.map((bone) => webMatrix(bone.inverseTm)),
    };
  }
  return null;
}

/** Vertex data of one object, ready to be written. */
interface Part {
  object: GmObject;
  positions: Float32Array;
  normals: Float32Array;
  joints: Uint8Array | Uint16Array | null;
  weights: Float32Array | null;
}

/** The handedness conversion for a list of positions or directions: (x, y, z) -> (x, y, -z). */
function toWeb(values: Float32Array): Float32Array {
  const out = Float32Array.from(values);
  for (let i = 2; i < out.length; i += 3) out[i] = toWebPosition([0, 0, values[i]!])[2];
  return out;
}

/** `uvs`, or a copy with every NaN or infinite coordinate set to 0. */
function finiteUvs(uvs: Float32Array): Float32Array {
  return uvs.every(Number.isFinite) ? uvs : uvs.map((v) => (Number.isFinite(v) ? v : 0));
}

/** Unit-length copies of the normals; a zero or broken normal becomes +Y. */
function normalized(normals: Float32Array): Float32Array {
  const out = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (length > 0 && Number.isFinite(length)) {
      for (let k = 0; k < 3; k++) out[i + k] = normals[i + k]! / length;
    } else {
      out[i + 1] = 1;
    }
  }
  return out;
}

/** An object's vertices moved by `m` (a web matrix); identity leaves them as they are. */
function movedPart(object: GmObject, m: Mat4): Part {
  return {
    object,
    positions: transformPositions(m, toWeb(object.positions)),
    normals: normalized(transformNormals(m, toWeb(object.normals))),
    joints: null,
    weights: null,
  };
}

/** JOINTS_0 as bytes when every joint fits. */
const compactJoints = (joints: Uint16Array, jointCount: number): Uint8Array | Uint16Array =>
  jointCount <= 256 ? Uint8Array.from(joints) : joints;

/** What one object of a LOD group becomes; see the top of the file. */
type Role =
  | { kind: 'skin' }
  | { kind: 'animated' }
  /** `chain`: the TM chain up to the top object; `bone`: the bone the top object hangs from, or -1. */
  | { kind: 'static'; chain: Mat4; bone: number };

function roleOf(group: GmObject[], j: number, where: string): Role {
  const object = group[j]!;
  if (object.kind === 'skin') return { kind: 'skin' };
  let chain = webMatrix(object.transform);
  let animated = object.tmFrames !== null;
  let top = object;
  const seen = new Set([j]);
  while (top.parentType === PARENT_OBJECT) {
    const parent = top.parentId;
    if (seen.has(parent)) throw new Error(`${where} object ${j}: its parents form a loop`);
    seen.add(parent);
    top = group[parent]!;
    chain = multiply(webMatrix(top.transform), chain);
    if (top.tmFrames !== null) animated = true;
  }
  if (animated) return { kind: 'animated' };
  return { kind: 'static', chain, bone: top.parentType === PARENT_BONE ? top.parentId : -1 };
}

/** One glTF material per texture name, flags, amount and light kind. */
class Materials {
  private readonly made = new Map<string, Material>();

  constructor(
    private readonly doc: Document,
    private readonly textureKey: (name: string) => string | null,
  ) {}

  of(object: GmObject, block: MaterialBlock): Material {
    const texture = object.materials[block.materialId]?.texture ?? '';
    const id = JSON.stringify([texture, block.effect, block.amount, object.light]);
    let material = this.made.get(id);
    if (material === undefined) {
      const state = materialState(block.effect, block.amount, object.light);
      material = this.doc
        .createMaterial(texture === '' ? 'untextured' : texture)
        .setBaseColorFactor([1, 1, 1, state.alpha])
        .setMetallicFactor(0)
        .setRoughnessFactor(1)
        .setAlphaMode(state.alphaMode)
        .setDoubleSided(state.doubleSided)
        .setExtras({
          texture: texture === '' ? null : this.textureKey(texture),
          effect: block.effect,
          ...(object.light ? { light: true } : {}),
        });
      if (state.alphaMode === 'MASK') material.setAlphaCutoff(ALPHA_REF);
      this.made.set(id, material);
    }
    return material;
  }
}

/**
 * Builds a model glb. `skeleton` is the `.chr` the model is drawn with (see skeletonFor), or null when it uses its own
 * bones or none. `textureKey(name)` gives the logical key of a texture file name as the material stores it, or null
 * when that texture is not available. Throws when an object needs a bone the model does not have.
 */
export async function buildModelGlb(
  model: O3dModel,
  skeleton: Skeleton | null,
  textureKey: (name: string) => string | null,
): Promise<Uint8Array> {
  const doc = newDocument();
  const scene = doc.getRoot().getDefaultScene()!;
  const rig = addRig(doc, model, skeleton);
  const materials = new Materials(doc, textureKey);
  let skin: Skin | undefined;
  const tmTargets: AnimatedNode[] = [];

  const sharedSkin = (): Skin => {
    if (skin === undefined) {
      skin = doc.createSkin('skin');
      const matrices = new Float32Array(rig!.nodes.length * 16);
      rig!.nodes.forEach((node, i) => {
        skin!.addJoint(node);
        matrices.set(rig!.inverseBind[i]!, i * 16);
      });
      skin.setInverseBindMatrices(addAccessor(doc, 'MAT4', matrices));
    }
    return skin;
  };

  const addMesh = (name: string, parts: Part[]): Mesh | null => {
    const primitives = parts.flatMap((part) => {
      const blocks = part.object.blocks.filter((block) => block.primitiveCount > 0);
      if (blocks.length === 0) return [];
      const attributes: [string, ReturnType<typeof addAccessor>][] = [
        ['POSITION', addAccessor(doc, 'VEC3', part.positions)],
        ['NORMAL', addAccessor(doc, 'VEC3', part.normals)],
        ['TEXCOORD_0', addAccessor(doc, 'VEC2', finiteUvs(part.object.uvs))],
      ];
      if (part.joints !== null && part.weights !== null) {
        attributes.push(['JOINTS_0', addAccessor(doc, 'VEC4', part.joints)]);
        attributes.push(['WEIGHTS_0', addAccessor(doc, 'VEC4', part.weights)]);
      }
      return blocks.map((block) => {
        const end = block.startIndex + block.primitiveCount * 3;
        const primitive = doc
          .createPrimitive()
          .setIndices(addAccessor(doc, 'SCALAR', flipWinding(part.object.indices.slice(block.startIndex, end))))
          .setMaterial(materials.of(part.object, block));
        for (const [semantic, accessor] of attributes) primitive.setAttribute(semantic, accessor);
        return primitive;
      });
    });
    if (primitives.length === 0) return null;
    const mesh = doc.createMesh(name);
    for (const primitive of primitives) mesh.addPrimitive(primitive);
    return mesh;
  };

  const jointOf = (bone: number, where: string): number => {
    if (rig === null) throw new Error(`${where} needs bone ${bone}, but the model has no skeleton`);
    if (bone < 0 || bone >= rig.nodes.length) {
      throw new Error(`${where} needs bone ${bone}, but the skeleton has ${rig.nodes.length} bones`);
    }
    return bone;
  };

  model.lods.forEach((group, k) => {
    const lodName = `lod${k}`;
    const lodNode = doc.createNode(lodName);
    scene.addChild(lodNode);
    const roles = group.map((_, j) => roleOf(group, j, `LOD ${k}`));

    const skinned: Part[] = [];
    const still: Part[] = [];
    group.forEach((object, j) => {
      const role = roles[j]!;
      const where = `LOD ${k} object ${j}`;
      if (role.kind === 'skin') {
        if (rig === null) throw new Error(`${where} is a skin object, but the model has no skeleton`);
        const influences = skinInfluences(object.skinJoints!, object.skinWeights!);
        influences.joints.forEach((joint) => jointOf(joint, where));
        skinned.push({
          ...movedPart(object, IDENTITY),
          joints: compactJoints(influences.joints, rig.nodes.length),
          weights: influences.weights,
        });
      } else if (role.kind === 'static' && role.bone === -1) {
        still.push(movedPart(object, role.chain));
      } else if (role.kind === 'static') {
        const bone = jointOf(role.bone, where);
        const vertices = object.positions.length / 3;
        const joints = new Uint16Array(vertices * 4);
        const weights = new Float32Array(vertices * 4);
        for (let v = 0; v < vertices; v++) {
          joints[v * 4] = bone;
          weights[v * 4] = 1;
        }
        skinned.push({
          ...movedPart(object, multiply(invert(rig!.inverseBind[bone]!), role.chain)),
          joints: compactJoints(joints, rig!.nodes.length),
          weights,
        });
      }
    });

    const skinnedMesh = addMesh(lodName, skinned);
    if (skinnedMesh !== null) {
      lodNode.setMesh(skinnedMesh).setSkin(sharedSkin());
      const stillMesh = addMesh(`${lodName}_static`, still);
      if (stillMesh !== null) lodNode.addChild(doc.createNode(`${lodName}_static`).setMesh(stillMesh));
    } else {
      const stillMesh = addMesh(lodName, still);
      if (stillMesh !== null) lodNode.setMesh(stillMesh);
    }

    // Objects with TM keys, and everything below them, as nodes.
    const objectNodes = new Map<number, Node>();
    const nodeFor = (j: number): Node => {
      const existing = objectNodes.get(j);
      if (existing !== undefined) return existing;
      const object = group[j]!;
      const node = doc.createNode(`${lodName}_${j}`);
      objectNodes.set(j, node);
      if (object.tmFrames !== null) setKeyPose(node, object.tmFrames[0]!);
      else setTransform(node, webMatrix(object.transform));
      const parent =
        object.parentType === PARENT_OBJECT
          ? nodeFor(object.parentId)
          : object.parentType === PARENT_BONE
            ? rig!.nodes[jointOf(object.parentId, `LOD ${k} object ${j}`)]!
            : lodNode;
      parent.addChild(node);
      return node;
    };
    group.forEach((object, j) => {
      if (roles[j]!.kind !== 'animated') return;
      const node = nodeFor(j);
      const mesh = addMesh(`${lodName}_${j}`, [movedPart(object, IDENTITY)]);
      if (mesh !== null) node.setMesh(mesh);
      if (object.tmFrames !== null) tmTargets.push({ node, ...fromKeys(object.tmFrames), scale: null });
    });
  });

  addKeyAnimation(doc, 'tm', tmTargets, model.frameCount, model.perSlerp);
  if (model.motion !== null && rig !== null) {
    addKeyAnimation(doc, 'bones', boneTargets(model.motion, rig.nodes), model.frameCount, model.perSlerp);
  }
  return writeGlb(doc);
}

/** A keyed node's rest pose: its first key (rotation then translation, unit scale, as AnimateBone builds it). */
function setKeyPose(node: Node, key: MotionKey): void {
  node
    .setTranslation(toWebPosition(key.position))
    .setRotation(normalizeQuaternion(toWebQuaternion(key.rotation)))
    .setScale([1, 1, 1]);
}
