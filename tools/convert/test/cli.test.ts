import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetIndex } from '@flyffweb/formats';
import { main, parseCli, USAGE } from '../src/cli';
import { ClientFs } from '../src/ClientFs';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import { run } from '../src/run';
import type { Stage, StageContext } from '../src/run';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

// This file is FlyffWeb/tools/convert/test/cli.test.ts.
const FLYFFWEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('parseCli', () => {
  it('defaults: <FlyffWeb>/../Client, <FlyffWeb>/dist/assets, one job fewer than the CPUs, no cap', () => {
    const parsed = parseCli([], {});
    expect(parsed).toEqual({
      kind: 'run',
      options: {
        client: path.resolve(FLYFFWEB, '../Client'),
        out: path.join(FLYFFWEB, 'dist', 'assets'),
        only: undefined,
        allowFailures: false,
        jobs: Math.max(1, os.availableParallelism() - 1),
        maxTextureSize: undefined,
      },
    });
  });

  it('takes the client folder from FLYFF_CLIENT, and --client wins over it', () => {
    const envClient = path.join(os.tmpdir(), 'env-client');
    expect(parseCli([], { FLYFF_CLIENT: envClient })).toMatchObject({ kind: 'run', options: { client: envClient } });
    expect(parseCli(['--client', 'some/where'], { FLYFF_CLIENT: envClient })).toMatchObject({
      kind: 'run',
      options: { client: path.resolve('some/where') },
    });
  });

  it('reads every flag', () => {
    const parsed = parseCli(
      ['--client', 'c', '--out', 'o', '--only', 'wd*', '--allow-failures', '--jobs', '3', '--max-texture-size', '1024'],
      {},
    );
    expect(parsed).toEqual({
      kind: 'run',
      options: {
        client: path.resolve('c'),
        out: path.resolve('o'),
        only: 'wd*',
        allowFailures: true,
        jobs: 3,
        maxTextureSize: 1024,
      },
    });
  });

  it('asks for the usage text with --help or -h, whatever else is on the line', () => {
    expect(parseCli(['--help'], {})).toEqual({ kind: 'help' });
    expect(parseCli(['-h'], {})).toEqual({ kind: 'help' });
    expect(parseCli(['--jobs', 'nope', '--help'], {})).toEqual({ kind: 'help' });
  });

  it.each([
    [['--bogus']],
    [['stray']],
    [['--jobs']],
    [['--jobs', '0']],
    [['--jobs', '-2']],
    [['--jobs', '1.5']],
    [['--jobs', 'many']],
    [['--max-texture-size', '0']],
    [['--max-texture-size', '12px']],
    [['--only', '']],
    [['--client', '']],
    [['--out', '']],
  ])('rejects %j with a message', (argv) => {
    const parsed = parseCli(argv, {});
    expect(parsed.kind).toBe('error');
    expect((parsed as { message: string }).message.length).toBeGreaterThan(5);
  });
});

describe('main', () => {
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
  }

  it('prints the usage and returns 0 for --help', async () => {
    const { out, err, io } = capture();
    expect(await main(['--help'], {}, io)).toBe(0);
    expect(out.join('\n')).toBe(USAGE);
    expect(err).toEqual([]);
  });

  it('prints the problem and the usage to stderr and returns 2 for a bad command line', async () => {
    const { out, err, io } = capture();
    expect(await main(['--jobs', '0'], {}, io)).toBe(2);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('--jobs');
    expect(err.join('\n')).toContain(USAGE);
  });

  it('names every option in the usage text', () => {
    for (const flag of ['--client', '--out', '--only', '--allow-failures', '--jobs', '--max-texture-size', '--help']) {
      expect(USAGE).toContain(flag);
    }
    expect(USAGE).toContain('FLYFF_CLIENT');
  });

  it('returns 2 and writes nothing when the client folder is missing', async () => {
    const dir = await makeTempDir('flyffweb-out-');
    try {
      const { err, io } = capture();
      const missing = path.join(dir, 'no-client');
      expect(await main(['--client', missing, '--out', path.join(dir, 'assets')], {}, io)).toBe(2);
      expect(err.join('\n')).toContain(missing);
      expect(await fs.readdir(dir)).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('is what `npm run convert -- --help` runs: usage on stdout, exit code 0', () => {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', 'tools/convert/src/cli.ts', '--help'], {
      cwd: FLYFFWEB,
      encoding: 'utf8',
    });
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('--allow-failures');
  });
});

describe('run', () => {
  let clientDir: string;
  let outDir: string;
  let logged: string[];
  const log = (line: string): void => void logged.push(line);

  beforeEach(async () => {
    clientDir = await makeTempDir('flyffweb-client-');
    outDir = await makeTempDir('flyffweb-out-');
    logged = [];
    await writeFakeClient(clientDir, { packed: [{ name: 'a.txt', data: [1] }] });
  });

  afterEach(async () => {
    await fs.rm(clientDir, { recursive: true, force: true });
    await fs.rm(outDir, { recursive: true, force: true });
  });

  const failingStage: Stage = {
    name: 'textures',
    async run({ report }) {
      report.fail('textures', 'Item/Bad.dds', new Error('cannot decode'));
    },
  };

  it('returns 1 when a stage reports a failure, and says "1 failed"', async () => {
    const code = await run({ client: clientDir, out: outDir, jobs: 1, stages: [failingStage], log });
    expect(code).toBe(1);
    expect(logged.join('\n')).toContain('1 failed');
  });

  it('returns 0 for the same failure with allowFailures', async () => {
    const code = await run({ client: clientDir, out: outDir, jobs: 1, allowFailures: true, stages: [failingStage], log });
    expect(code).toBe(0);
    expect(logged.join('\n')).toContain('1 failed');
  });

  it('returns 0 when nothing fails, and with no stages registered', async () => {
    const quiet: Stage = {
      name: 'models',
      async run({ report }) {
        report.ok('models', 'Model/x.o3d', 10, 5);
      },
    };
    expect(await run({ client: clientDir, out: outDir, jobs: 1, stages: [quiet], log })).toBe(0);
    expect(await run({ client: clientDir, out: outDir, jobs: 1, log })).toBe(0);
    expect(logged.join('\n')).toContain('0 failed');
  });

  it('runs the stages in the order given, each with the same context', async () => {
    const seen: { name: string; ctx: StageContext }[] = [];
    const stage = (name: string): Stage => ({
      name,
      async run(ctx) {
        seen.push({ name, ctx });
      },
    });
    await run({
      client: clientDir,
      out: outDir,
      only: 'wd*',
      jobs: 5,
      maxTextureSize: 2048,
      stages: [stage('textures'), stage('models'), stage('worlds')],
      log,
    });
    expect(seen.map((s) => s.name)).toEqual(['textures', 'models', 'worlds']);
    const ctx = seen[0]!.ctx;
    expect(ctx.client).toBeInstanceOf(ClientFs);
    expect(ctx.writer).toBeInstanceOf(AssetWriter);
    expect(ctx.report).toBeInstanceOf(Report);
    expect(ctx).toMatchObject({ only: 'wd*', jobs: 5, maxTextureSize: 2048, outDir });
    expect(seen[1]!.ctx).toBe(ctx);
    expect(seen[2]!.ctx).toBe(ctx);
  });

  it('records a stage that throws as a failure, and still runs the next stage', async () => {
    const ran: string[] = [];
    const crashing: Stage = {
      name: 'models',
      async run() {
        throw new TypeError('stage bug');
      },
    };
    const next: Stage = {
      name: 'worlds',
      async run() {
        ran.push('worlds');
      },
    };
    const code = await run({ client: clientDir, out: outDir, jobs: 1, stages: [crashing, next], log });
    expect(code).toBe(1);
    expect(ran).toEqual(['worlds']);

    const report = JSON.parse(await fs.readFile(path.join(outDir, 'report.json'), 'utf8'));
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({ kind: 'stage', source: 'models', message: 'stage bug', error: 'TypeError' });
  });

  it('writes index.json and report.json to the output folder after the stages', async () => {
    const stage: Stage = {
      name: 'models',
      async run({ writer, report }) {
        const hashed = await writer.write('models/a.glb', new Uint8Array([1, 2, 3]), 'Model/A.o3d');
        report.ok('models', 'Model/A.o3d', 3, 3);
        expect(hashed).toBe('models/a.039058c6f2.glb');
      },
    };
    await run({ client: clientDir, out: outDir, jobs: 1, stages: [stage], log });

    const index = JSON.parse(await fs.readFile(path.join(outDir, 'index.json'), 'utf8')) as AssetIndex;
    expect(index).toEqual({ version: 1, files: { 'models/a.glb': 'models/a.039058c6f2.glb' } });
    const report = JSON.parse(await fs.readFile(path.join(outDir, 'report.json'), 'utf8'));
    expect(report.totals).toMatchObject({ ok: 1, failed: 0 });
  });

  it('refuses to write into the client folder', async () => {
    const before = await fs.readdir(clientDir);
    await expect(run({ client: clientDir, out: path.join(clientDir, 'dist'), jobs: 1, log })).rejects.toThrow(
      /inside the client/,
    );
    await expect(run({ client: clientDir, out: clientDir, jobs: 1, log })).rejects.toThrow(/inside the client/);
    expect(await fs.readdir(clientDir)).toEqual(before);
  });

  it('rejects when the client folder is unusable', async () => {
    await expect(run({ client: path.join(clientDir, 'nope'), out: outDir, jobs: 1, log })).rejects.toThrow(/nope/);
  });
});
