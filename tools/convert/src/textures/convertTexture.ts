// Converts the client's model and terrain textures into hashed `.ktx2` files.
//
// Neuz loads both kinds through LoadTextureFromRes (Source/_Common/vutil.cpp:192, which calls
// D3DXCreateTextureFromFileInMemoryEx): model textures from Model\TextureMid by CTextureManager::AddMaterial
// (Source/_Common/Material.cpp:125) and terrain textures from World\TextureMid by CTerrainMng::LoadTexture
// (Source/_Common/TerrainMng.cpp:63). Both calls pass ColorKey 0 (Material.cpp:128 `0x00000000`, TerrainMng.cpp:66
// `0`), which D3DX reads as "no colour key", so the pixels are encoded exactly as decoded: no colour is turned
// transparent here.
//
// Pipeline for one file: decode (formats package) -> optional box-filter downscale -> temporary PNG -> `ktx create`
// (ETC1S, or UASTC for names listed in uastc-overrides.json) -> AssetWriter, which hashes the name and writes it
// atomically.

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeImage, webName } from '@flyffweb/formats';
import type { RgbaImage } from '@flyffweb/formats';
import { PNG } from 'pngjs';
import type { AssetWriter } from '../output/AssetWriter';
import type { Report } from '../output/Report';
import type { Stage } from '../run';
import { matchesOnly, runLimited } from '../util';
import { buildKtxArgs, ktxAvailable, runKtx } from './ktx';
import type { KtxMode, KtxTool } from './ktx';

/** What a missing `ktx` reports, once per run. */
export const MISSING_KTX_MESSAGE =
  'KTX-Software ≥ 4.3 not found: install it from github.com/KhronosGroup/KTX-Software/releases, then re-run';

/** The textures the converter reads: the formats `decodeImage` knows. */
const IMAGE_FILE = /\.(dds|tga|bmp)$/i;

/** The two texture folders, both `TextureMid` as the client reads them (path.h DIR_MODELTEX, DIR_WORLDTEXMID). */
const TEXTURE_FOLDERS = [
  { kind: 'model', dir: 'Model/TextureMid' },
  { kind: 'terrain', dir: 'World/TextureMid' },
] as const;

type TextureKind = (typeof TEXTURE_FOLDERS)[number]['kind'];

/** Where uastc-overrides.json sits: FlyffWeb/tools/convert/, two levels above this file. */
const DEFAULT_OVERRIDES_FILE = fileURLToPath(new URL('../../uastc-overrides.json', import.meta.url));

/**
 * The logical key of a texture: the web name of its file name, extension included (so `Face.dds` and `Face.tga` stay
 * apart), under `textures/` for model textures and `textures/terrain/` for terrain textures. `fileName` is a bare
 * name such as the one a material or a terrain script gives.
 */
export function textureKey(kind: TextureKind, fileName: string): string {
  return `textures/${kind === 'terrain' ? 'terrain/' : ''}${webName(fileName)}.ktx2`;
}

/**
 * The texture file names (with extension, any case) that get UASTC instead of ETC1S, as a set of web names. UASTC is
 * larger but keeps sharp detail, such as text or fine patterns, that ETC1S smears.
 */
export function parseUastcOverrides(text: string, source: string): ReadonlySet<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((name) => typeof name === 'string')) {
    throw new Error(`${source} must be a list of texture file names (strings), such as ["Part_mVag01Upper.dds"]`);
  }
  return new Set((parsed as string[]).map(webName));
}

export async function loadUastcOverrides(file: string = DEFAULT_OVERRIDES_FILE): Promise<ReadonlySet<string>> {
  return parseUastcOverrides(await fs.readFile(file, 'utf8'), file);
}

/** `uastc` for a file name listed in the overrides (compared by web name), else `etc1s`. */
export function textureMode(fileName: string, overrides: ReadonlySet<string>): KtxMode {
  return overrides.has(webName(fileName)) ? 'uastc' : 'etc1s';
}

/** One step of the box filter: every 2x2 block becomes a pixel; an odd last column or row is kept as it is. */
function halve(image: RgbaImage): RgbaImage {
  const { width, height, data } = image;
  const outWidth = (width + 1) >> 1;
  const outHeight = (height + 1) >> 1;
  const out = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let count = 0;
      let alphaSum = 0;
      const weighted = [0, 0, 0]; // colour weighted by alpha, so a transparent neighbour does not darken the result
      const plain = [0, 0, 0];
      for (let sy = y * 2; sy < Math.min(y * 2 + 2, height); sy++) {
        for (let sx = x * 2; sx < Math.min(x * 2 + 2, width); sx++) {
          const i = (sy * width + sx) * 4;
          const alpha = data[i + 3]!;
          for (let c = 0; c < 3; c++) {
            weighted[c]! += data[i + c]! * alpha;
            plain[c]! += data[i + c]!;
          }
          alphaSum += alpha;
          count++;
        }
      }
      const o = (y * outWidth + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(alphaSum > 0 ? weighted[c]! / alphaSum : plain[c]! / count);
      out[o + 3] = Math.round(alphaSum / count);
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

/**
 * Halves the image (box filter, in the stored colour space) until neither side is larger than `maxSize`. Returns
 * `image` itself when there is no cap or it already fits.
 */
export function downscaleToFit(image: RgbaImage, maxSize: number | undefined): RgbaImage {
  if (maxSize === undefined) return image;
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new RangeError(`maxSize must be a positive integer, got ${maxSize}`);
  }
  let current = image;
  while (Math.max(current.width, current.height) > maxSize) current = halve(current);
  return current;
}

/** A PNG for `ktx create`. It only lives a moment, so it is written fast rather than small. */
function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 1, filterType: 0 });
}

export interface TextureContext {
  writer: AssetWriter;
  report: Report;
  /** The `ktx` to run (`KtxTool.path`). */
  ktxPath: string;
  /** An existing folder for the temporary files; each call removes what it made. */
  tempDir: string;
  /** The `--max-texture-size` cap in pixels, if any. */
  maxTextureSize?: number;
  /** From `parseUastcOverrides`. */
  uastcOverrides: ReadonlySet<string>;
}

/**
 * Converts the client texture `src` and writes it under `logicalKey` (see `textureKey`). The client path is the
 * writer's collision source. Throws when the file cannot be decoded, `ktx` fails or the key is taken by another
 * file; on success it counts the file as ok in the report.
 */
export async function convertTexture(src: string, logicalKey: string, ctx: TextureContext): Promise<void> {
  const bytes = new Uint8Array(await fs.readFile(src));
  const image = downscaleToFit(decodeImage(bytes, src), ctx.maxTextureSize);
  const mode = textureMode(path.basename(src), ctx.uastcOverrides);

  const id = randomUUID();
  const pngFile = path.join(ctx.tempDir, `${id}.png`);
  const ktx2File = path.join(ctx.tempDir, `${id}.ktx2`);
  try {
    await fs.writeFile(pngFile, encodePng(image));
    await runKtx(ctx.ktxPath, buildKtxArgs(pngFile, ktx2File, mode));
    const converted = new Uint8Array(await fs.readFile(ktx2File));
    await ctx.writer.write(logicalKey, converted, src);
    ctx.report.ok('textures', src, bytes.length, converted.length);
  } finally {
    await Promise.all([pngFile, ktx2File].map((file) => fs.rm(file, { force: true }).catch(() => {})));
  }
}

/**
 * The `textures` stage: every `.dds`, `.tga` and `.bmp` in `Model/TextureMid` and `World/TextureMid` that `--only`
 * lets through. `findKtx` is for tests. A texture that fails is reported (kind `textures`, its client path) and the
 * run goes on; a missing `ktx` is reported once, before any texture is touched, and only when there is something
 * to convert.
 */
export function createTexturesStage(options: { findKtx?: () => Promise<KtxTool | null> } = {}): Stage {
  const findKtx = options.findKtx ?? (() => ktxAvailable());
  return {
    name: 'textures',
    async run(ctx) {
      const todo: { src: string; logicalKey: string }[] = [];
      for (const { kind, dir } of TEXTURE_FOLDERS) {
        for (const src of ctx.client.list(dir, IMAGE_FILE)) {
          const fileName = path.basename(src);
          if (matchesOnly(fileName, ctx.only)) todo.push({ src, logicalKey: textureKey(kind, fileName) });
        }
      }
      if (todo.length === 0) return;

      const tool = await findKtx();
      if (tool === null) {
        ctx.report.fail('textures', 'KTX-Software', new Error(MISSING_KTX_MESSAGE));
        return;
      }
      const uastcOverrides = await loadUastcOverrides();

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flyffweb-ktx-'));
      try {
        const textureCtx: TextureContext = {
          writer: ctx.writer,
          report: ctx.report,
          ktxPath: tool.path,
          tempDir,
          maxTextureSize: ctx.maxTextureSize,
          uastcOverrides,
        };
        await runLimited(todo, ctx.jobs, async ({ src, logicalKey }) => {
          try {
            await convertTexture(src, logicalKey, textureCtx);
          } catch (error) {
            ctx.report.fail('textures', src, error);
          }
        });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}

export const texturesStage: Stage = createTexturesStage();
