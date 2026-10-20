// The `models` stage: every `.chr` skeleton, `.ani` motion and `.o3d` model directly in `Client/Model` (R3: not the
// copies in Model/TextureMid) that `--only` lets through, as hashed `.glb` files:
//
//   skeletons/<web name>.glb              the joint hierarchy (skeletonGlb.ts)
//   motions/<skeleton web name>/<web name>.glb   the joints plus one animation (motionGlb.ts)
//   models/<web name>.glb                 meshes, materials, skin and object animations (modelGlb.ts)
//
// A model needs its skeleton's `.chr` even when `--only` leaves that file out; skeletons are read on demand, once.
// It runs after the textures stage: a material names its texture's logical key only when that texture was written in
// this run (R2), else null with a warning.
//
// Skipped with a warning, as Neuz refuses them too: models whose stored name is not their own (Object3D.cpp:951,
// R21/R22) and the two models in a version older than VER_MESH (Object3D.cpp:959, R21); motions with no skeleton
// to bind to.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FormatError, readAni, readChr, readO3d, webName } from '@flyffweb/formats';
import type { Motion, O3dModel, Skeleton } from '@flyffweb/formats';
import type { AssetWriter } from '../output/AssetWriter';
import type { Report } from '../output/Report';
import type { Stage } from '../run';
import { textureKey } from '../textures/convertTexture';
import { matchesOnly, runLimited } from '../util';
import { buildModelGlb } from './modelGlb';
import { buildMotionGlb } from './motionGlb';
import { skeletonFor, skeletonOfMotion } from './skeletonFor';
import { buildSkeletonGlb } from './skeletonGlb';

export const NAME_MISMATCH_WARNING = 'Neuz also rejects this file (Object3D.cpp:951)';

const MODEL_DIR = 'Model';

/** `Model/Mvr_male_GenStand.ani` -> `Mvr_male_GenStand`. */
const stem = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '');

const readBytes = async (file: string): Promise<Uint8Array> => new Uint8Array(await fs.readFile(file));

/** The `.chr` files of Client/Model by lower-case base name; each is read once, when first asked for. */
export class SkeletonFiles {
  private readonly files: Map<string, string>;
  private readonly loaded = new Map<string, Promise<Skeleton>>();

  constructor(chrFiles: string[]) {
    this.files = new Map(chrFiles.map((file) => [stem(file).toLowerCase(), file]));
  }

  has = (base: string): boolean => this.files.has(base.toLowerCase());

  bases(): Iterable<string> {
    return this.files.keys();
  }

  get(base: string): Promise<Skeleton> {
    const key = base.toLowerCase();
    let skeleton = this.loaded.get(key);
    if (skeleton === undefined) {
      const file = this.files.get(key);
      skeleton =
        file === undefined
          ? Promise.reject(new Error(`skeleton ${MODEL_DIR}/${base}.chr not found`))
          : readBytes(file).then((bytes) => readChr(bytes, file));
      this.loaded.set(key, skeleton);
    }
    return skeleton;
  }
}

export interface ModelsContext {
  writer: AssetWriter;
  report: Report;
  skeletons: SkeletonFiles;
}

export async function convertSkeleton(src: string, ctx: ModelsContext): Promise<void> {
  const bytes = await readBytes(src);
  const glb = await buildSkeletonGlb(readChr(bytes, src));
  await ctx.writer.write(`skeletons/${webName(stem(src))}.glb`, glb, src);
  ctx.report.ok('skeletons', src, bytes.length, glb.length);
}

/** Bone indices where the motion's own hierarchy differs from its skeleton's. */
function hierarchyDifferences(motion: Motion, skel: Skeleton): number[] {
  return motion.tracks.flatMap((track, i) => (track.parent !== skel.bones[i]?.parent ? [i] : []));
}

export async function convertMotion(src: string, ctx: ModelsContext): Promise<void> {
  const name = stem(src);
  const chr = skeletonOfMotion(name, ctx.skeletons.bases());
  if (chr === null) {
    ctx.report.warn('motions', src, `no skeleton: no ${MODEL_DIR}/<name>.chr fits ${name} as <name>_<motion>.ani`);
    return;
  }
  const bytes = await readBytes(src);
  const motion = readAni(bytes, src);
  const skel = await ctx.skeletons.get(chr);
  if (motion.tracks.length < skel.bones.length) {
    ctx.report.warn(
      'motions',
      src,
      `${motion.tracks.length} bone tracks for the ${skel.bones.length} bones of ${chr}.chr (Neuz logs this too, ` +
        'ModelObject.cpp:584); the bones without a track keep their rest pose',
    );
  }
  const different = hierarchyDifferences(motion, skel);
  if (different.length > 0) {
    ctx.report.warn(
      'motions',
      src,
      `the motion's bone parents differ from ${chr}.chr at bones ${different.join(', ')}; ` +
        "the skeleton's hierarchy is used",
    );
  }
  const glb = await buildMotionGlb(skel, motion, webName(name));
  await ctx.writer.write(`motions/${webName(chr)}/${webName(name)}.glb`, glb, src);
  ctx.report.ok('motions', src, bytes.length, glb.length);
}

/** The reason when readO3d refused `error`'s file for a version Neuz refuses too (R21), else null. */
function clientRejection(error: unknown): string | null {
  if (!(error instanceof FormatError) || error.reader !== 'readO3d') return null;
  const match = /: (version -?\d+ is older than the oldest the client reads \(\d+\))$/.exec(error.message);
  return match === null ? null : match[1]!;
}

export async function convertModel(src: string, ctx: ModelsContext): Promise<void> {
  const bytes = await readBytes(src);
  let model: O3dModel;
  try {
    model = readO3d(bytes, src);
  } catch (error) {
    const reason = clientRejection(error);
    if (reason === null) throw error;
    ctx.report.warn('models', src, `Neuz also rejects this file (Object3D.cpp:959): ${reason}`);
    return;
  }
  if (!model.nameMatches) {
    ctx.report.warn('models', src, NAME_MISMATCH_WARNING);
    return;
  }

  const base = stem(src);
  const choice = skeletonFor(base, model, ctx.skeletons.has);
  const skeleton = choice.kind === 'chr' ? await ctx.skeletons.get(choice.chr) : null;
  const missing = new Set<string>();
  const glb = await buildModelGlb(model, skeleton, (texture) => {
    const key = textureKey('model', texture);
    if (ctx.writer.pathOf(key) !== undefined) return key;
    missing.add(texture);
    return null;
  });
  for (const texture of missing) {
    ctx.report.warn(
      'models',
      src,
      `texture ${texture} was not converted in this run (not in ${MODEL_DIR}/TextureMid, failed, or left out by ` +
        '--only), so its material names no texture',
    );
  }
  await ctx.writer.write(`models/${webName(base)}.glb`, glb, src);
  ctx.report.ok('models', src, bytes.length, glb.length);
}

export const modelsStage: Stage = {
  name: 'models',
  async run(ctx) {
    const only = (file: string): boolean => matchesOnly(path.basename(file), ctx.only);
    const chrFiles = ctx.client.list(MODEL_DIR, /\.chr$/i);
    const models: ModelsContext = { writer: ctx.writer, report: ctx.report, skeletons: new SkeletonFiles(chrFiles) };
    const passes = [
      { kind: 'skeletons', files: chrFiles, convert: convertSkeleton },
      { kind: 'motions', files: ctx.client.list(MODEL_DIR, /\.ani$/i), convert: convertMotion },
      { kind: 'models', files: ctx.client.list(MODEL_DIR, /\.o3d$/i), convert: convertModel },
    ];
    for (const { kind, files, convert } of passes) {
      await runLimited(files.filter(only), ctx.jobs, async (src) => {
        try {
          await convert(src, models);
        } catch (error) {
          ctx.report.fail(kind, src, error);
        }
      });
    }
  },
};
