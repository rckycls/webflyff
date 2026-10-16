import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetIndex, RgbaImage } from '@flyffweb/formats';
import { run } from '../src/run';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import { buildKtxArgs, ktxAvailable, ktxCandidates, parseKtxVersion } from '../src/textures/ktx';
import type { KtxTool } from '../src/textures/ktx';
import {
  MISSING_KTX_MESSAGE,
  convertTexture,
  createTexturesStage,
  downscaleToFit,
  loadUastcOverrides,
  parseUastcOverrides,
  textureKey,
  textureMode,
} from '../src/textures/convertTexture';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

/** First 12 bytes of every KTX2 file: «KTX 20»\r\n\x1A\n */
const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** A DDS file holding one A8R8G8B8 image; `pixels` are [r, g, b, a] in reading order. */
function dds(width: number, height: number, pixels: number[][]): Uint8Array {
  const out = new Uint8Array(128 + width * height * 4);
  const view = new DataView(out.buffer);
  const u32 = (offset: number, value: number): void => view.setUint32(offset, value, true);
  u32(0, 0x20534444); // "DDS "
  u32(4, 124);
  u32(8, 0x100f); // DDSD_CAPS | HEIGHT | WIDTH | PIXELFORMAT
  u32(12, height);
  u32(16, width);
  u32(20, width * 4);
  u32(76, 32); // DDS_PIXELFORMAT.size
  u32(80, 0x41); // DDPF_RGB | DDPF_ALPHAPIXELS
  u32(88, 32);
  u32(92, 0x00ff0000);
  u32(96, 0x0000ff00);
  u32(100, 0x000000ff);
  u32(104, 0xff000000);
  u32(108, 0x1000); // DDSCAPS_TEXTURE
  pixels.forEach(([r, g, b, a], i) => out.set([b!, g!, r!, a!], 128 + i * 4));
  return out;
}

const solid = (width: number, height: number, rgba: number[]): Uint8Array =>
  dds(width, height, Array.from({ length: width * height }, () => rgba));

function rgbaImage(width: number, height: number, pixel: (x: number, y: number) => number[]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

/** What the KTX2 header at the start of `bytes` says (https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html). */
function ktx2Header(bytes: Uint8Array): {
  identifier: number[];
  vkFormat: number;
  width: number;
  height: number;
  levels: number;
  supercompression: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    identifier: Array.from(bytes.subarray(0, 12)),
    vkFormat: view.getUint32(12, true),
    width: view.getUint32(20, true),
    height: view.getUint32(24, true),
    levels: view.getUint32(40, true),
    supercompression: view.getUint32(44, true),
  };
}

const ktx = await ktxAvailable();

describe('buildKtxArgs', () => {
  it('builds the uastc command line exactly', () => {
    expect(buildKtxArgs('in.png', 'out.ktx2', 'uastc')).toEqual([
      'create',
      '--format',
      'R8G8B8A8_SRGB',
      '--encode',
      'uastc',
      '--generate-mipmap',
      'in.png',
      'out.ktx2',
    ]);
  });

  it('encodes etc1s with basis-lz', () => {
    expect(buildKtxArgs('in.png', 'out.ktx2', 'etc1s')).toEqual([
      'create',
      '--format',
      'R8G8B8A8_SRGB',
      '--encode',
      'basis-lz',
      '--generate-mipmap',
      'in.png',
      'out.ktx2',
    ]);
  });
});

describe('textureKey', () => {
  it('keeps the source extension and puts model and terrain textures in different folders', () => {
    expect(textureKey('model', 'Part_mVag01Upper.dds')).toBe('textures/part_mvag01upper.dds.ktx2');
    expect(textureKey('terrain', 'Bahara_Rockwall01.dds')).toBe('textures/terrain/bahara_rockwall01.dds.ktx2');
  });

  it('turns spaces and odd characters into dashes and lower-cases the extension', () => {
    expect(textureKey('model', 'Obj_ Foo.DDS')).toBe('textures/obj_-foo.dds.ktx2');
    expect(textureKey('terrain', 'Grass #1.TGA')).toBe('textures/terrain/grass--1.tga.ktx2');
  });

  it('keeps different extensions of one stem apart', () => {
    expect(textureKey('model', 'Face.dds')).not.toBe(textureKey('model', 'Face.tga'));
  });
});

describe('uastc overrides', () => {
  it('gives a listed name uastc and every other name etc1s', () => {
    const overrides = parseUastcOverrides('["Part_mVag01Upper.dds"]', 'overrides.json');
    expect(textureMode('Part_mVag01Upper.dds', overrides)).toBe('uastc');
    expect(textureMode('Part_mVag01Foot.dds', overrides)).toBe('etc1s');
  });

  it('compares names the way output names are formed: case and odd characters do not matter', () => {
    const overrides = parseUastcOverrides('["Obj_ Foo.DDS"]', 'overrides.json');
    expect(textureMode('obj_-foo.dds', overrides)).toBe('uastc');
    expect(textureMode('Obj_ Foo.tga', overrides)).toBe('etc1s');
  });

  it('refuses a file that is not a list of names', () => {
    const notAList = /overrides\.json.*list of texture file names/;
    expect(() => parseUastcOverrides('{"a":1}', 'overrides.json')).toThrow(notAList);
    expect(() => parseUastcOverrides('[1]', 'overrides.json')).toThrow(notAList);
    expect(() => parseUastcOverrides('[', 'overrides.json')).toThrow(/overrides\.json/);
  });

  it('ships an empty list', async () => {
    expect((await loadUastcOverrides()).size).toBe(0);
  });
});

describe('downscaleToFit', () => {
  it('halves 2048x1024 with a cap of 1024 into 1024x512', () => {
    const image = rgbaImage(2048, 1024, () => [10, 20, 30, 255]);
    const small = downscaleToFit(image, 1024);
    expect([small.width, small.height]).toEqual([1024, 512]);
    expect(small.data.length).toBe(1024 * 512 * 4);
    expect(Array.from(small.data.subarray(0, 4))).toEqual([10, 20, 30, 255]);
  });

  it('keeps halving until the larger side fits', () => {
    const small = downscaleToFit(rgbaImage(4096, 2048, () => [0, 0, 0, 255]), 512);
    expect([small.width, small.height]).toEqual([512, 256]);
  });

  it('returns the image itself when it already fits, or when there is no cap', () => {
    const image = rgbaImage(8, 4, () => [1, 2, 3, 4]);
    expect(downscaleToFit(image, 8)).toBe(image);
    expect(downscaleToFit(image, undefined)).toBe(image);
  });

  it('averages every 2x2 block of source pixels', () => {
    const image = rgbaImage(2, 2, (x, y) => [x * 100, y * 100, 40, 255]);
    const small = downscaleToFit(image, 1);
    expect([small.width, small.height]).toEqual([1, 1]);
    expect(Array.from(small.data)).toEqual([50, 50, 40, 255]);
  });

  it('weights colours by alpha so transparent pixels do not darken their neighbours', () => {
    const image = rgbaImage(2, 1, (x) => (x === 0 ? [200, 100, 50, 255] : [0, 0, 0, 0]));
    const small = downscaleToFit(image, 1);
    expect(Array.from(small.data)).toEqual([200, 100, 50, 128]);
  });

  it('averages the colours of a fully transparent block plainly', () => {
    const image = rgbaImage(2, 1, (x) => (x === 0 ? [10, 20, 30, 0] : [30, 40, 50, 0]));
    expect(Array.from(downscaleToFit(image, 1).data)).toEqual([20, 30, 40, 0]);
  });

  it('rounds an odd side up and lets the last column or row stand alone', () => {
    const image = rgbaImage(5, 3, (x) => [x * 10, 0, 0, 255]);
    const small = downscaleToFit(image, 4);
    expect([small.width, small.height]).toEqual([3, 2]);
    expect(Array.from(small.data.subarray(0, 12))).toEqual([5, 0, 0, 255, 25, 0, 0, 255, 40, 0, 0, 255]);
  });

  it('never shrinks a side below one pixel', () => {
    const small = downscaleToFit(rgbaImage(1, 8, () => [9, 9, 9, 255]), 2);
    expect([small.width, small.height]).toEqual([1, 2]);
  });
});

describe('ktx executable lookup', () => {
  it('reads the version out of ktx --version output and rejects anything older than 4.3', () => {
    expect(parseKtxVersion('ktx version: v4.4.2\n')).toBe('4.4.2');
    expect(parseKtxVersion('ktx version: v4.3.0')).toBe('4.3.0');
    expect(parseKtxVersion('ktx version: v5.0.1-beta')).toBe('5.0.1');
    expect(parseKtxVersion('ktx version: v4.2.9')).toBeNull();
    expect(parseKtxVersion('not a version')).toBeNull();
  });

  it('tries KTX_BIN, then ktx on the PATH, then the default install folder', () => {
    expect(ktxCandidates({ KTX_BIN: 'D:\\tools\\ktx.exe' })).toEqual([
      'D:\\tools\\ktx.exe',
      'ktx',
      'C:\\Program Files\\KTX-Software\\bin\\ktx.exe',
    ]);
    expect(ktxCandidates({})).toEqual(['ktx', 'C:\\Program Files\\KTX-Software\\bin\\ktx.exe']);
    expect(ktxCandidates({ KTX_BIN: '' })).toEqual(['ktx', 'C:\\Program Files\\KTX-Software\\bin\\ktx.exe']);
  });

  it('returns the first candidate that answers, with its version', async () => {
    const asked: string[] = [];
    const probe = async (candidate: string): Promise<string | null> => {
      asked.push(candidate);
      return candidate === 'b' ? '4.4.2' : candidate === 'c' ? '4.3.1' : null;
    };
    expect(await ktxAvailable(['a', 'b', 'c'], probe)).toEqual({ path: 'b', version: '4.4.2' });
    expect(asked).toEqual(['a', 'b']);
  });

  it('returns null when no candidate answers', async () => {
    expect(await ktxAvailable(['a', 'b'], async () => null)).toBeNull();
  });

  it('skips a KTX_BIN that does not exist and falls back to the next candidate', async () => {
    const missing = path.join(os.tmpdir(), 'flyffweb-no-such-dir', 'ktx.exe');
    const found = await ktxAvailable(ktxCandidates({ KTX_BIN: missing }));
    if (found !== null) expect(found.path).not.toBe(missing);
  });

  it.skipIf(ktx === null)('reports the path and a plain version number of the ktx it found', () => {
    expect(ktx!.path).not.toBe('');
    expect(ktx!.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe.skipIf(ktx === null)('texture conversion with the real ktx', () => {
  let work: string;
  let tool: KtxTool;

  beforeEach(async () => {
    work = await makeTempDir('flyffweb-textures-test-');
    tool = ktx!;
  });

  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  const names = async (dir: string): Promise<string[]> =>
    (await fs.readdir(dir, { recursive: true })).map((n) => n.replaceAll('\\', '/')).sort();

  /** The bytes the writer put under `logicalKey` in the `out` folder. */
  const readWritten = async (writer: AssetWriter, logicalKey: string): Promise<Uint8Array> =>
    new Uint8Array(await fs.readFile(path.join(work, 'out', ...writer.pathOf(logicalKey)!.split('/'))));

  it('converts a 4x4 red DDS into a KTX2 file', async () => {
    const source = path.join(work, 'Red.DDS');
    await fs.writeFile(source, solid(4, 4, [255, 0, 0, 255]));
    const outDir = path.join(work, 'out');
    const writer = new AssetWriter(outDir);
    const report = new Report();
    const tempDir = path.join(work, 'tmp');
    await fs.mkdir(tempDir);

    await convertTexture(source, 'textures/red.dds.ktx2', {
      writer,
      report,
      ktxPath: tool.path,
      tempDir,
      uastcOverrides: new Set(),
    });

    expect(writer.pathOf('textures/red.dds.ktx2')).toMatch(/^textures\/red\.dds\.[0-9a-f]{10}\.ktx2$/);
    const bytes = await readWritten(writer, 'textures/red.dds.ktx2');
    expect(Array.from(bytes.subarray(0, 12))).toEqual(KTX2_IDENTIFIER);
    expect(ktx2Header(bytes)).toMatchObject({ vkFormat: 0, width: 4, height: 4, supercompression: 1 });
    expect(report.summary()).toContain('textures: 1 ok, 0 warn, 0 failed');
    expect(await names(tempDir)).toEqual([]); // the temp PNG and KTX2 are gone
  });

  it('encodes a listed texture as uastc, which has no supercompression', async () => {
    const source = path.join(work, 'Sharp.dds');
    await fs.writeFile(source, solid(8, 8, [0, 255, 0, 255]));
    const writer = new AssetWriter(path.join(work, 'out'));

    await convertTexture(source, 'textures/sharp.dds.ktx2', {
      writer,
      report: new Report(),
      ktxPath: tool.path,
      tempDir: work,
      uastcOverrides: new Set(['sharp.dds']),
    });

    const bytes = await readWritten(writer, 'textures/sharp.dds.ktx2');
    expect(ktx2Header(bytes)).toMatchObject({ width: 8, height: 8, supercompression: 0 });
  });

  it('shrinks a texture that is larger than the cap before encoding it', async () => {
    const source = path.join(work, 'Big.dds');
    await fs.writeFile(source, solid(16, 8, [0, 0, 255, 255]));
    const writer = new AssetWriter(path.join(work, 'out'));

    await convertTexture(source, 'textures/big.dds.ktx2', {
      writer,
      report: new Report(),
      ktxPath: tool.path,
      tempDir: work,
      maxTextureSize: 8,
      uastcOverrides: new Set(),
    });

    const bytes = await readWritten(writer, 'textures/big.dds.ktx2');
    expect(ktx2Header(bytes)).toMatchObject({ width: 8, height: 4 });
  });

  it('removes the temp files and throws when ktx fails', async () => {
    const source = path.join(work, 'Red.dds');
    await fs.writeFile(source, solid(4, 4, [255, 0, 0, 255]));
    const tempDir = path.join(work, 'tmp');
    await fs.mkdir(tempDir);

    await expect(
      convertTexture(source, 'textures/red.dds.ktx2', {
        writer: new AssetWriter(path.join(work, 'out')),
        report: new Report(),
        ktxPath: path.join(work, 'no-such-ktx.exe'),
        tempDir,
        uastcOverrides: new Set(),
      }),
    ).rejects.toThrow(/ktx/);
    expect(await names(tempDir)).toEqual([]);
  });

  describe('the textures stage', () => {
    const clientDir = (): string => path.join(work, 'client');
    const outDir = (): string => path.join(work, 'out');
    const lines: string[] = [];
    const runStage = (options: { only?: string; jobs?: number; maxTextureSize?: number } = {}): Promise<number> =>
      run({
        client: clientDir(),
        out: outDir(),
        stages: [createTexturesStage()],
        jobs: options.jobs ?? 2,
        only: options.only,
        maxTextureSize: options.maxTextureSize,
        log: (line) => lines.push(line),
      });
    const readIndex = async (): Promise<AssetIndex> =>
      JSON.parse(await fs.readFile(path.join(outDir(), 'index.json'), 'utf8')) as AssetIndex;
    const readOutput = async (hashed: string): Promise<Uint8Array> =>
      new Uint8Array(await fs.readFile(path.join(outDir(), ...hashed.split('/'))));
    const readReport = async (): Promise<{ failures: { kind: string; source: string; message: string }[] }> =>
      JSON.parse(await fs.readFile(path.join(outDir(), 'report.json'), 'utf8'));
    const ktxTempDirs = async (): Promise<string[]> =>
      (await fs.readdir(os.tmpdir())).filter((n) => n.startsWith('flyffweb-ktx-')).sort();

    beforeEach(() => {
      lines.length = 0;
    });

    it('converts model and terrain textures under their own keys, from the client paths', async () => {
      await writeFakeClient(clientDir(), {
        loose: {
          'Model/TextureMid/Part_mVag01Upper.dds': solid(8, 8, [255, 0, 0, 255]),
          'Model/TextureMid/Obj_ Foo.DDS': solid(4, 4, [0, 255, 0, 128]),
          'World/TextureMid/Bahara_Rockwall01.dds': solid(8, 4, [0, 0, 255, 255]),
          'Model/TextureMid/readme.txt': 'not a texture',
          'Model/TextureMid/Sub/Nested.dds': solid(4, 4, [1, 1, 1, 255]),
        },
      });
      const before = await ktxTempDirs();

      expect(await runStage()).toBe(0);

      const index = await readIndex();
      expect(Object.keys(index.files)).toEqual([
        'textures/obj_-foo.dds.ktx2',
        'textures/part_mvag01upper.dds.ktx2',
        'textures/terrain/bahara_rockwall01.dds.ktx2',
      ]);
      for (const hashed of Object.values(index.files)) {
        expect(Array.from((await readOutput(hashed)).subarray(0, 12))).toEqual(KTX2_IDENTIFIER);
      }
      const terrain = await readOutput(index.files['textures/terrain/bahara_rockwall01.dds.ktx2']!);
      expect(ktx2Header(terrain)).toMatchObject({ width: 8, height: 4 });
      expect(lines.join('\n')).toContain('textures: 3 ok, 0 warn, 0 failed');
      expect(await ktxTempDirs()).toEqual(before); // the run's temp folder is gone
    });

    it('converts only the textures that --only matches', async () => {
      await writeFakeClient(clientDir(), {
        loose: {
          'Model/TextureMid/Part_mVag01Upper.dds': solid(4, 4, [255, 0, 0, 255]),
          'Model/TextureMid/Part_mVag01Foot.dds': solid(4, 4, [255, 0, 0, 255]),
          'Model/TextureMid/Part_fHair01.dds': solid(4, 4, [255, 0, 0, 255]),
          'World/TextureMid/Part_mVag01Terrain.dds': solid(4, 4, [255, 0, 0, 255]),
        },
      });

      expect(await runStage({ only: 'part_mvag01*' })).toBe(0);

      expect(Object.keys((await readIndex()).files)).toEqual([
        'textures/part_mvag01foot.dds.ktx2',
        'textures/part_mvag01upper.dds.ktx2',
        'textures/terrain/part_mvag01terrain.dds.ktx2',
      ]);
    });

    it('honours --max-texture-size', async () => {
      await writeFakeClient(clientDir(), { loose: { 'Model/TextureMid/Wide.dds': solid(16, 8, [9, 9, 9, 255]) } });

      expect(await runStage({ maxTextureSize: 4 })).toBe(0);

      const bytes = await readOutput((await readIndex()).files['textures/wide.dds.ktx2']!);
      expect(ktx2Header(bytes)).toMatchObject({ width: 4, height: 2 });
    });

    it('reports a damaged texture as a failure of its client path and goes on with the others', async () => {
      await writeFakeClient(clientDir(), {
        loose: {
          'Model/TextureMid/Bad.dds': new Uint8Array([1, 2, 3]),
          'Model/TextureMid/Good.dds': solid(4, 4, [255, 0, 0, 255]),
        },
      });

      expect(await runStage()).toBe(1);

      expect(Object.keys((await readIndex()).files)).toEqual(['textures/good.dds.ktx2']);
      const { failures } = await readReport();
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ kind: 'textures' });
      expect(failures[0]!.source.replaceAll('\\', '/')).toMatch(/client\/Model\/TextureMid\/Bad\.dds$/);
    });

    it('reports two client files that share an output name instead of overwriting one with the other', async () => {
      await writeFakeClient(clientDir(), {
        loose: {
          'Model/TextureMid/Obj_ Foo.dds': solid(4, 4, [255, 0, 0, 255]),
          'Model/TextureMid/Obj_-Foo.dds': solid(4, 4, [0, 255, 0, 255]),
        },
      });

      expect(await runStage({ jobs: 1 })).toBe(1);

      expect(Object.keys((await readIndex()).files)).toEqual(['textures/obj_-foo.dds.ktx2']);
      const { failures } = await readReport();
      expect(failures).toHaveLength(1);
      expect(failures[0]!.message).toContain('name collision on "textures/obj_-foo.dds.ktx2"');
    });
  });
});

describe('the textures stage without ktx', () => {
  let work: string;

  beforeEach(async () => {
    work = await makeTempDir('flyffweb-textures-test-');
  });

  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  const runWithoutKtx = async (loose: Record<string, Uint8Array>): Promise<number> => {
    await writeFakeClient(path.join(work, 'client'), { loose });
    return run({
      client: path.join(work, 'client'),
      out: path.join(work, 'out'),
      stages: [createTexturesStage({ findKtx: async () => null })],
      jobs: 2,
      log: () => {},
    });
  };

  it('fails once with the install instructions instead of once per texture', async () => {
    const code = await runWithoutKtx({
      'Model/TextureMid/A.dds': solid(4, 4, [1, 2, 3, 255]),
      'Model/TextureMid/B.dds': solid(4, 4, [1, 2, 3, 255]),
      'World/TextureMid/C.dds': solid(4, 4, [1, 2, 3, 255]),
    });

    expect(code).toBe(1);
    const report = JSON.parse(await fs.readFile(path.join(work, 'out', 'report.json'), 'utf8')) as {
      failures: { kind: string; message: string }[];
    };
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({ kind: 'textures', message: MISSING_KTX_MESSAGE });
    expect(MISSING_KTX_MESSAGE).toBe(
      'KTX-Software ≥ 4.3 not found: install it from github.com/KhronosGroup/KTX-Software/releases, then re-run',
    );
  });

  it('does not need ktx when no texture matches', async () => {
    const code = await runWithoutKtx({});
    expect(code).toBe(0);
  });
});
