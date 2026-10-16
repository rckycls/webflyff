import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FormatError } from '@flyffweb/formats';
import { Report } from '../src/output/Report';

let outDir: string;

beforeEach(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flyffweb-report-'));
});

afterEach(async () => {
  await fs.rm(outDir, { recursive: true, force: true });
});

async function readReport(): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(outDir, 'report.json'), 'utf8'));
}

describe('Report', () => {
  it('counts ok, warn and failed per kind and in total', () => {
    const report = new Report();
    report.ok('textures', 'a.dds', 100, 40);
    report.ok('textures', 'b.dds', 200, 60);
    report.warn('textures', 'b.dds', 'clamped to 2048');
    report.fail('textures', 'c.dds', new Error('bad'));
    report.ok('models', 'm.o3d', 10, 5);
    expect(report.failed).toBe(1);

    const lines = report.summary().split('\n');
    expect(lines).toContain('textures: 2 ok, 1 warn, 1 failed');
    expect(lines).toContain('models: 1 ok, 0 warn, 0 failed');
    expect(lines.at(-1)).toBe('Total: 3 ok, 1 warn, 1 failed');
  });

  it('prints thousands separators and the total bytes read and written', () => {
    const report = new Report();
    for (let i = 0; i < 5674; i++) report.ok('textures', `t${i}.dds`, 1024 * 1024, 512 * 1024);
    const summary = report.summary();
    expect(summary).toContain('textures: 5,674 ok, 0 warn, 0 failed');
    expect(summary).toContain('Bytes: 5.54 GB in, 2.77 GB out');
    expect(summary.split('\n').at(-1)).toBe('Total: 5,674 ok, 0 warn, 0 failed');
  });

  it('reports "0 failed" for a clean run, and for a run that did nothing', () => {
    expect(new Report().summary().split('\n').at(-1)).toBe('Total: 0 ok, 0 warn, 0 failed');
    expect(new Report().failed).toBe(0);
  });

  it('lists kinds in the order they first appear', () => {
    const report = new Report();
    report.ok('worlds', 'w', 1, 1);
    report.ok('textures', 't', 1, 1);
    report.ok('worlds', 'w2', 1, 1);
    const kindLines = report
      .summary()
      .split('\n')
      .filter((l) => /^(worlds|textures):/.test(l));
    expect(kindLines.map((l) => l.split(':')[0])).toEqual(['worlds', 'textures']);
  });

  it('writes FormatError details verbatim into report.json', async () => {
    const report = new Report();
    const error = new FormatError('magic is wrong', {
      file: 'Model/Part_x.o3d',
      offset: 12,
      reader: 'readO3d',
      cppRef: 'Source/_Common/Object3D.cpp:123 CObject3D::LoadObject',
    });
    report.fail('models', 'Model/Part_x.o3d', error);
    const scriptError = new FormatError('unexpected token', {
      file: 'World/WdX/WdX.lnd',
      offset: 40,
      unit: 'char',
      line: 7,
      reader: 'parseDefines',
      cppRef: 'Source/_Common/scanner.cpp:1 CScanner',
    });
    report.fail('worlds', 'World/WdX', scriptError);
    await report.write(outDir);

    const json = await readReport();
    expect(json.failures).toEqual([
      {
        kind: 'models',
        source: 'Model/Part_x.o3d',
        message: error.message,
        error: 'FormatError',
        file: 'Model/Part_x.o3d',
        offset: 12,
        unit: 'byte',
        reader: 'readO3d',
        cppRef: 'Source/_Common/Object3D.cpp:123 CObject3D::LoadObject',
      },
      {
        kind: 'worlds',
        source: 'World/WdX',
        message: scriptError.message,
        error: 'FormatError',
        file: 'World/WdX/WdX.lnd',
        offset: 40,
        unit: 'char',
        line: 7,
        reader: 'parseDefines',
        cppRef: 'Source/_Common/scanner.cpp:1 CScanner',
      },
    ]);
  });

  it('keeps the source path and the message of an error that is not a FormatError', async () => {
    const report = new Report();
    report.fail('textures', 'Item/Big.dds', new RangeError('texture is 5000 wide, the limit is 4096'));
    report.fail('stage', 'worlds', 'plain string');
    await report.write(outDir);

    const [first, second] = (await readReport()).failures;
    expect(first).toMatchObject({
      kind: 'textures',
      source: 'Item/Big.dds',
      message: 'texture is 5000 wide, the limit is 4096',
      error: 'RangeError',
    });
    expect(first.stack).toContain('RangeError');
    expect(first.file).toBeUndefined();
    expect(second).toEqual({ kind: 'stage', source: 'worlds', message: 'plain string' });
  });

  it('writes counts, bytes, warnings and failures to report.json', async () => {
    const report = new Report();
    report.ok('textures', 'a.dds', 100, 40);
    report.warn('textures', 'a.dds', 'resized');
    report.fail('textures', 'b.dds', new Error('boom'));
    await report.write(outDir);

    const json = await readReport();
    expect(json.version).toBe(1);
    expect(json.totals).toEqual({ ok: 1, warn: 1, failed: 1, bytesIn: 100, bytesOut: 40 });
    expect(json.kinds).toEqual({ textures: { ok: 1, warn: 1, failed: 1, bytesIn: 100, bytesOut: 40 } });
    expect(json.warnings).toEqual([{ kind: 'textures', source: 'a.dds', message: 'resized' }]);
    expect(json.failures).toHaveLength(1);
    expect(await fs.access(path.join(outDir, 'report.json.tmp')).then(() => true, () => false)).toBe(false);
  });

  it('creates the output folder when it does not exist yet', async () => {
    const nested = path.join(outDir, 'a', 'b');
    await new Report().write(nested);
    expect((await fs.stat(path.join(nested, 'report.json'))).isFile()).toBe(true);
  });
});
