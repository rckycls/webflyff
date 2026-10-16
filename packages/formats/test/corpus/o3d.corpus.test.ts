import path from 'node:path';
import { expect, it } from 'vitest';
import { FormatError, NO_BONE, readChr, readO3d } from '../../src/index';
import type { GmObject, O3dModel } from '../../src/index';
import { describeClient, forEachClientFile } from '../helpers/client';

/** Reads the one file of `Client/Model` called `name` (any case) with `read`. */
function readModelFile<T>(name: string, read: (bytes: Uint8Array, file: string) => T): T {
  let result: T | undefined;
  const exactName = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const { count, failures } = forEachClientFile('Model', exactName, (bytes, file) => {
    result = read(bytes, file);
  });
  if (failures.length > 0) throw failures[0].error;
  if (count !== 1) throw new Error(`expected exactly one Model/${name}, found ${count}`);
  return result as T;
}

/** A short list for a failure message: the first `limit` entries, then how many more there are. */
function summarize(items: string[], limit = 12): string {
  const shown = items.slice(0, limit).join('; ');
  return items.length > limit ? `${shown}; ... (${items.length - limit} more)` : shown;
}

const histogram = (counts: Map<string | number, number>): Record<string, number> =>
  Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const bump = (counts: Map<string | number, number>, key: string | number): void =>
  void counts.set(key, (counts.get(key) ?? 0) + 1);

/** Rounds for a snapshot; the + 0 turns -0 into 0. */
const round4 = (v: number): number => Number(v.toFixed(4)) + 0;

const NORMAL_TOLERANCE = 1e-2;

/** Normals whose length is not within NORMAL_TOLERANCE of 1. */
function nonUnitNormals(o: GmObject): number {
  let n = 0;
  for (let i = 0; i < o.normals.length; i += 3) {
    const length = Math.hypot(o.normals[i], o.normals[i + 1], o.normals[i + 2]);
    if (!(Math.abs(length - 1) <= NORMAL_TOLERANCE)) n++;
  }
  return n;
}

/** What the whole-corpus checks need from every model; the models themselves are not kept. */
interface Scan {
  count: number;
  failures: { path: string; error: unknown }[];
  versions: Map<number, number>;
  /** Files whose stored name is not their own (Neuz refuses them), as `file: stored name`. */
  nameMismatches: string[];
  withLod: number;
  withCollision: number;
  withBones: number;
  withMotion: number;
  withFrames: number;
  /** Version 21+ files: how many store frame attributes, and how many end where the attribute count would start. */
  withFrameAttributes: number;
  endBeforeAttributeCount: number;
  /** Version 21+ files that do neither. */
  otherAttributeEnds: string[];
  kinds: Map<string, number>;
  /** Skin objects by where their palette is mapped from: an object list, block lists, or no list (skeleton). */
  skinPalettes: Map<string, number>;
  skinVertices: number;
  /** Skin vertices whose first joint is not the bone the exporter recorded in the physique for the vertex. */
  physiqueDisagrees: string[];
  /** Skin objects without a physique. */
  skinWithoutPhysique: string[];
  /** Skin objects with vertices that blend a NO_BONE joint with a weight above 0, as `object: vertex count`. */
  noBoneVertices: string[];
  /** Vertex normals of all objects, and how many are not of length 1 within NORMAL_TOLERANCE. */
  normals: number;
  nonUnitNormals: number;
  emptyTextures: number;
}

let scan: Scan | undefined;

function scanModels(): Scan {
  if (scan) return scan;
  const s: Scan = {
    count: 0,
    failures: [],
    versions: new Map(),
    nameMismatches: [],
    withLod: 0,
    withCollision: 0,
    withBones: 0,
    withMotion: 0,
    withFrames: 0,
    withFrameAttributes: 0,
    endBeforeAttributeCount: 0,
    otherAttributeEnds: [],
    kinds: new Map(),
    skinPalettes: new Map(),
    skinVertices: 0,
    physiqueDisagrees: [],
    skinWithoutPhysique: [],
    noBoneVertices: [],
    normals: 0,
    nonUnitNormals: 0,
    emptyTextures: 0,
  };
  const result = forEachClientFile(
    'Model',
    /\.o3d$/i,
    (bytes, file) => {
      const m = readO3d(bytes, file);
      const parent = path.basename(path.dirname(file));
      const name = parent === 'Model' ? path.basename(file) : `${parent}/${path.basename(file)}`;
      bump(s.versions, m.version);
      if (!m.nameMatches) s.nameMismatches.push(`${name}: ${m.internalName}`);
      if (m.lods.length === 3) s.withLod++;
      if (m.collision) s.withCollision++;
      if (m.baseBones) s.withBones++;
      if (m.motion) s.withMotion++;
      if (m.frameCount > 0) s.withFrames++;
      if (m.frameAttributes) s.withFrameAttributes++;
      else if (m.version >= 21) {
        // With the count written out as the 0 the C++ is left with, the file must still read to its end.
        if (endsBeforeAttributeCount(bytes, file)) s.endBeforeAttributeCount++;
        else s.otherAttributeEnds.push(name);
      }
      m.lods.forEach((group, g) => {
        group.forEach((o, i) => {
          const where = `${name} LOD ${g} object ${i}`;
          bump(s.kinds, o.kind);
          s.normals += o.normals.length / 3;
          s.nonUnitNormals += nonUnitNormals(o);
          s.emptyTextures += o.materials.filter((mt) => mt.texture === '').length;
          if (o.kind !== 'skin') return;
          const blockLists = o.blocks.some((b) => b.usedBones.length > 0);
          const objectList = o.usedBones.length > 0;
          bump(s.skinPalettes, objectList ? (blockLists ? 'both' : 'object') : blockLists ? 'blocks' : 'none');
          const joints = o.skinJoints!;
          const weights = o.skinWeights!;
          s.skinVertices += joints.length / 2;
          let noBone = 0;
          for (let v = 0; v < joints.length / 2; v++) {
            const weighted = (k: number): boolean => joints[2 * v + k] === NO_BONE && weights[2 * v + k] !== 0;
            if (weighted(0) || weighted(1)) noBone++;
          }
          if (noBone > 0) s.noBoneVertices.push(`${where}: ${noBone}`);
          if (!o.physique) {
            s.skinWithoutPhysique.push(where);
            return;
          }
          for (let v = 0; v < o.vertexListIndices.length; v++) {
            const recorded = o.physique[o.vertexListIndices[v]];
            if (joints[2 * v] !== (recorded === -1 ? NO_BONE : recorded)) {
              s.physiqueDisagrees.push(`${where} vertex ${v}: joint ${joints[2 * v]}, physique ${recorded}`);
            }
          }
        });
      });
    },
    { recursive: true },
  );
  s.count = result.count;
  s.failures = result.failures;
  scan = s;
  return s;
}

/** Whether `bytes` ends where the attribute count would start: it reads as well with a stored count of 0 appended. */
function endsBeforeAttributeCount(bytes: Uint8Array, file: string): boolean {
  const padded = new Uint8Array(bytes.length + 4);
  padded.set(bytes);
  try {
    readO3d(padded, file);
    return true;
  } catch {
    return false;
  }
}

/** The objects of a model as `kind vertices/indices`, LOD group by LOD group. */
const objectSummary = (m: O3dModel): string[][] =>
  m.lods.map((group) => group.map((o) => `${o.kind} ${o.positions.length / 3} vertices / ${o.indices.length} indices`));

describeClient('models (.o3d)', () => {
  it('reads Part_mVag01Upper.o3d: skinned to mvr_male.chr, indices in range, unit normals, texture files', () => {
    const skeleton = readModelFile('mvr_male.chr', readChr);
    const m = readModelFile('Part_mVag01Upper.o3d', readO3d);
    const objects = m.lods.flat();
    expect(objects.some((o) => o.kind === 'skin')).toBe(true);
    for (const o of objects) {
      const vertexCount = o.positions.length / 3;
      for (const i of o.indices) expect(i).toBeLessThan(vertexCount);
      for (const j of o.skinJoints ?? []) expect(j).toBeLessThan(skeleton.bones.length);
      expect(nonUnitNormals(o)).toBe(0);
      for (const mt of o.materials) expect(mt.texture).toMatch(/\.(dds|tga|bmp)$/i);
    }
  });

  it('reads Obj_ AzriaThicket01.o3d (a space in the file name) and reports whether its stored name matches', () => {
    const m = readModelFile('Obj_ AzriaThicket01.o3d', readO3d);
    console.log(`Obj_ AzriaThicket01.o3d: stored name "${m.internalName}", nameMatches ${m.nameMatches}`);
    expect(m.lods[0].length).toBeGreaterThan(0);
  });

  it('every .o3d under Client/Model reads to its last byte, except two files in a layout Neuz refuses', () => {
    // Part_femaleHead.o3d and Part_maleHead.o3d start with the int 16, apparently the version of an older layout
    // without the stored name. LoadObject reads the 16 as a name length; that name does not match, so it refuses the
    // file. Past the name, the version reads as 0, older than VER_MESH, which this reader refuses. Neuz never asks for
    // these two: heads are Part_maleHead%02d.o3d / Part_femaleHead%02d.o3d (MoverEquip.cpp:74).
    const s = scanModels();
    expect(s.count).toBe(4205);
    const failures = s.failures.map((f) => ({
      file: path.basename(f.path),
      error: f.error instanceof FormatError ? f.error.message.replace(/^.*: /, '') : String(f.error),
    }));
    expect(failures).toEqual([
      { file: 'Part_femaleHead.o3d', error: 'version 0 is older than the oldest the client reads (20)' },
      { file: 'Part_maleHead.o3d', error: 'version 0 is older than the oldest the client reads (20)' },
    ]);
  });

  it('eight files store another name than their own, so Neuz refuses them', () => {
    const s = scanModels();
    console.log(`models whose stored name differs from the file name: ${s.nameMismatches.length}`);
    expect(s.nameMismatches.sort()).toEqual([
      'Mvr_PetManaUnicorn01.o3d: Mvr_PetUnicorn01.o3d',
      'Part_fCloSailor01Hat.o3d: Part_fAss01Cap.o3d',
      'Part_fCloSailor02Hat.o3d: Part_fAss01Cap.o3d',
      'Part_fCloSailor03Hat.o3d: Part_fAss01Cap.o3d',
      'Part_fCloSailor04Hat.o3d: Part_fAss01Cap.o3d',
      'Part_mCloKorean01Hat.o3d: Part_mAss01Cap.o3d',
      'TextureMid/item_GenFooCola.o3d: itm_GenFooCola.o3d',
      'region_Path.o3d: region_begin.o3d',
    ]);
  });

  it('version 21+ files store frame attributes or end where their count would start', () => {
    const s = scanModels();
    expect(s.otherAttributeEnds).toEqual([]);
    expect([s.withFrameAttributes, s.endBeforeAttributeCount]).toEqual([16, 2810]);
  });

  it("every skin vertex's first joint is the bone its physique records", () => {
    // The physique (one bone per vertex-list entry) is what CObject3D::IntersectRayTri skins with, "ignoring the
    // second link". It agrees with the palette mapping for every vertex, including the objects with no list at all,
    // whose palette slots are skeleton bones, and the vertices whose list entry and physique are both -1 (NO_BONE).
    const s = scanModels();
    expect(s.skinVertices).toBeGreaterThan(1000000);
    expect(summarize(s.skinWithoutPhysique)).toBe('');
    expect(summarize(s.physiqueDisagrees)).toBe('');
  });

  it('every skin joint with a weight is a bone, except 13 vertices of one low LOD whose used-bone list says -1', () => {
    // "Bone refs exist", narrowed to the known offenders. Slot 0 of that object's list is -1: the exporter had no bone
    // for it (the physique of the 9 vertices that blend it first is -1 too; 4 more blend it second), and the client
    // skins them with whatever lies before its bone matrices.
    expect(scanModels().noBoneVertices).toEqual(['Part_mJstSet03Upper.o3d LOD 2 object 0: 13']);
  });

  it('scan summary', () => {
    const s = scanModels();
    expect(s.failures).toHaveLength(2); // the two files of the test above
    expect({
      count: s.count,
      versions: histogram(s.versions),
      withLod: s.withLod,
      withCollision: s.withCollision,
      withBones: s.withBones,
      withMotion: s.withMotion,
      withFrames: s.withFrames,
      withFrameAttributes: s.withFrameAttributes,
      endBeforeAttributeCount: s.endBeforeAttributeCount,
      kinds: histogram(s.kinds),
      skinPalettes: histogram(s.skinPalettes),
      skinVertices: s.skinVertices,
      normals: s.normals,
      nonUnitNormals: s.nonUnitNormals,
      emptyTextures: s.emptyTextures,
    }).toMatchSnapshot();
  });

  it('Part_mVag01Upper.o3d summary', () => {
    expect(modelSummary(readModelFile('Part_mVag01Upper.o3d', readO3d))).toMatchSnapshot();
  });

  it('Obj_ AzriaThicket01.o3d summary', () => {
    expect(modelSummary(readModelFile('Obj_ AzriaThicket01.o3d', readO3d))).toMatchSnapshot();
  });
});

function modelSummary(m: O3dModel) {
  return {
    internalName: m.internalName,
    nameMatches: m.nameMatches,
    version: m.version,
    lodCount: m.lods.length,
    objects: objectSummary(m),
    textures: m.lods.map((group) => group.map((o) => o.materials.map((mt) => mt.texture))),
    bbMin: m.bbMin.map(round4),
    bbMax: m.bbMax.map(round4),
  };
}
