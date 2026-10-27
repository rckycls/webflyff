// The `effects` stage: every `.sfx` effect file that the model indexes name (the OT_SFX entries of mdlDyna.inc with
// MODELTYPE_SFX, which the XI_* ids stand for), as a web effect file, and the textures those effects use:
//
//   effects/<web name>.json              the effect (WebEffect, formats/web/effect.ts): the parts of the file with their
//                                        textures, texture-animation frames and mesh models named by logical key
//   textures/sfx/<web name>.ktx2         one per texture an effect names, and per frame of a texture animation
//
// The file is Client/SFX/<name>.sfx, as CSfxBase::Load finds it (sfxbase.cpp:1719); the name is the one CModelMng::
// MakeModelName builds (modelFileName). An entry that names a `.sfx` the client lacks (17 in the shipped index) is left out
// without a word: the data stage's effects index still lists it and the player treats a key the asset index lacks as "no
// effect". The textures are Client/SFX/Texture/<name> (DIR_SFXTEX, path.h:37, which CSfxTexture::AddTex loads,
// sfxbase.cpp:3146); only the ones an effect names are converted, whether or not the part is drawn (`using`).
//
// A texture name that has no file in the folder is warned about once, however many effects name it, and its parts get
// `texture: null` (Neuz draws them untextured: AddTex returns NULL, :3157); so does a texture that fails to convert, which is a
// failure of its own. A mesh part's `.o3d` is named by the key the models stage wrote it under; one that was not
// converted gets `model: null` and a warning. Mesh parts are counted in the report under `effectMeshParts` (the player
// skips them in Piece 4).
//
// The effects are read first and the textures converted before any effect file is written, so a missing `ktx` stops the
// stage with one failure before it writes a file that names textures nobody converted.
//
// `--only` filters on the file name of the `.sfx` (a glob, or a comma-separated list of globs); the stage name `effects`
// matches every effect, as `data` does for the catalogs.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OT, loadDefines, modelFileName, readSfx, sfxTextureName } from '@flyffweb/formats';
import type { SfxFile, SfxPart, WebEffect, WebEffectPart } from '@flyffweb/formats';
import { readModelIndexes } from '../data/modelIndexes';
import { effectKeyOf, modelKeyOf } from '../output/keys';
import type { Stage, StageContext } from '../run';
import {
  MISSING_KTX_MESSAGE,
  convertTexture,
  loadUastcOverrides,
  textureKey,
} from '../textures/convertTexture';
import type { TextureContext } from '../textures/convertTexture';
import { ktxAvailable } from '../textures/ktx';
import type { KtxTool } from '../textures/ktx';
import { listed, matchesOnly, plural, runLimited } from '../util';

const STAGE = 'effects';
/** The report kinds: the effect files, the textures they name, and the mesh parts kept in them. */
const KIND = 'effects';
const TEXTURE_KIND = 'sfxTextures';
const MESH_KIND = 'effectMeshParts';

const SFX_DIR = 'SFX';
/** DIR_SFXTEX (path.h:37). */
const TEXTURE_DIR = 'SFX/Texture';

/** MODELTYPE_SFX (Source/_Common/Model.h:14): an entry that names a `.sfx` script. */
const MODELTYPE_SFX = 4;
/** SFXPARTTYPE_MESH (sfxbase.h:17-22): the part's `m_strTex` is a model file name. */
const PART_MESH = 3;

/** The texture file names a part draws with: its name, or one per frame of its texture animation (GetTextureName). */
function textureNamesOf(part: SfxPart): string[] {
  if (part.type === PART_MESH || part.texture === '') return [];
  if (part.texFrame <= 1) return [part.texture];
  return Array.from({ length: part.texFrame }, (_, i) => sfxTextureName(part.texture, i));
}

interface EffectFile {
  src: string;
  /** The name of the `.sfx` without its extension, as the model index gives it. */
  stem: string;
}

interface ParsedEffect extends EffectFile {
  bytes: number;
  sfx: SfxFile;
}

/** One texture file an effect names, found by the key it is written under. */
interface TextureJob {
  name: string;
  key: string;
  /** The client file, or null when the folder has none. */
  src: string | null;
  /** The effects that name it. */
  users: Set<string>;
}

export interface EffectsStageOptions {
  /** For tests: the `ktx` to use. */
  findKtx?: () => Promise<KtxTool | null>;
  /** For tests: the texture converter, `convertTexture` by default. */
  convert?: (src: string, logicalKey: string, ctx: TextureContext) => Promise<void>;
}

export function createEffectsStage(options: EffectsStageOptions = {}): Stage {
  const findKtx = options.findKtx ?? (() => ktxAvailable());
  const convert = options.convert ?? convertTexture;

  return {
    name: STAGE,
    async run(ctx: StageContext) {
      const effectFiles = listEffectFiles(ctx);
      if (effectFiles.length === 0) return;

      // 1. read the effects
      const parsed: ParsedEffect[] = [];
      await runLimited(effectFiles, ctx.jobs, async (file) => {
        try {
          const bytes = new Uint8Array(await fs.readFile(file.src));
          parsed.push({ ...file, bytes: bytes.length, sfx: readSfx(bytes, file.src) });
        } catch (error) {
          ctx.report.fail(KIND, file.src, error);
        }
      });
      parsed.sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0));

      // 2. the textures they name, converted once each
      const textures = new Map<string, TextureJob>();
      for (const effect of parsed) {
        for (const part of effect.sfx.parts) {
          for (const name of textureNamesOf(part)) {
            const key = textureKey('sfx', name);
            let job = textures.get(key);
            if (job === undefined) {
              job = { name, key, src: ctx.client.find(TEXTURE_DIR, name), users: new Set() };
              textures.set(key, job);
            }
            job.users.add(effect.stem);
          }
        }
      }
      const failedKeys = new Set<string>();
      if (!(await convertTextures(ctx, [...textures.values()], failedKeys, findKtx, convert))) return;

      for (const job of textures.values()) {
        if (job.src !== null) continue;
        ctx.report.warn(
          KIND,
          `${TEXTURE_DIR}/${job.name}`,
          `texture ${job.name} is not in Client/${TEXTURE_DIR}, so the parts that name it have no texture ` +
            `(named by ${plural(job.users.size, 'effect')}: ${listed(job.users)})`,
        );
      }

      // 3. the effect files
      const missingModels = new Map<string, Set<string>>(); // model key -> the stems of the effects that name it
      const textureOf = (name: string): string | null => {
        const key = textureKey('sfx', name);
        return failedKeys.has(key) || ctx.writer.pathOf(key) === undefined ? null : key;
      };
      const modelOf = (file: string, effect: string): string | null => {
        if (file === '') return null;
        const key = modelKeyOf(file);
        if (ctx.writer.pathOf(key) !== undefined) return key;
        missingModels.set(key, (missingModels.get(key) ?? new Set()).add(effect));
        return null;
      };

      for (const effect of parsed) {
        try {
          const parts = effect.sfx.parts.map((part): WebEffectPart => {
            const { texture, ...rest } = part;
            if (part.type === PART_MESH) return { ...rest, texture: null, frames: [], model: modelOf(texture, effect.stem) };
            if (texture === '') return { ...rest, texture: null, frames: [], model: null };
            if (part.texFrame > 1) {
              const frames = textureNamesOf(part).map(textureOf);
              return { ...rest, texture: frames[0] ?? null, frames, model: null };
            }
            return { ...rest, texture: textureOf(texture), frames: [], model: null };
          });
          const json = new TextEncoder().encode(JSON.stringify({ parts } satisfies WebEffect));
          await ctx.writer.write(effectKeyOf(effect.stem), json, effect.src);
          ctx.report.ok(KIND, effect.src, effect.bytes, json.length);
          for (const part of parts) if (part.type === PART_MESH) ctx.report.ok(MESH_KIND, effect.src, 0, 0);
        } catch (error) {
          ctx.report.fail(KIND, effect.src, error);
        }
      }

      for (const [key, users] of missingModels) {
        ctx.report.warn(
          KIND,
          `${SFX_DIR}/${[...users][0]}.sfx`,
          `mesh part model ${key} was not converted (no such .o3d in Client/Model, rejected, failed, or left out), so the ` +
            `mesh parts that name it have no model (named by ${plural(users.size, 'effect')}: ${listed(users)})`,
        );
      }
    },
  };
}

/** The `.sfx` files of the model index that the client has and `--only` lets through, one per file, in name order. */
function listEffectFiles(ctx: StageContext): EffectFile[] {
  const all = matchesOnly(STAGE, ctx.only);
  const index = readModelIndexes(ctx.client.packs, loadDefines(ctx.client.packs));
  const files = new Map<string, EffectFile>();
  for (const elem of index.entries.values()) {
    if (elem.type !== OT.SFX || elem.modelType !== MODELTYPE_SFX) continue;
    const stem = modelFileName(elem);
    if (!all && !matchesOnly(stem, ctx.only)) continue;
    const src = ctx.client.find(SFX_DIR, `${stem}.sfx`);
    if (src !== null && !files.has(src)) files.set(src, { src, stem });
  }
  return [...files.values()].sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0));
}

/**
 * Converts the textures that are in the folder, with at most `ctx.jobs` at once, into the `textures/sfx/` keys. A texture
 * that fails is reported (kind `sfxTextures`, its client path) and its key added to `failedKeys`. Returns false, after
 * one failure for the missing `ktx`, when there was something to convert and no `ktx` to do it with.
 */
async function convertTextures(
  ctx: StageContext,
  textures: TextureJob[],
  failedKeys: Set<string>,
  findKtx: () => Promise<KtxTool | null>,
  convert: NonNullable<EffectsStageOptions['convert']>,
): Promise<boolean> {
  const todo = textures.filter((job) => job.src !== null);
  if (todo.length === 0) return true;

  const tool = await findKtx();
  if (tool === null) {
    ctx.report.fail(TEXTURE_KIND, 'KTX-Software', new Error(MISSING_KTX_MESSAGE));
    return false;
  }
  const uastcOverrides = await loadUastcOverrides();

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flyffweb-sfx-ktx-'));
  try {
    const textureCtx: TextureContext = {
      writer: ctx.writer,
      report: ctx.report,
      reportKind: TEXTURE_KIND,
      ktxPath: tool.path,
      tempDir,
      maxTextureSize: ctx.maxTextureSize,
      uastcOverrides,
    };
    await runLimited(todo, ctx.jobs, async (job) => {
      try {
        await convert(job.src!, job.key, textureCtx);
      } catch (error) {
        failedKeys.add(job.key);
        ctx.report.fail(TEXTURE_KIND, job.src!, error);
      }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  return true;
}

export const effectsStage: Stage = createEffectsStage();
