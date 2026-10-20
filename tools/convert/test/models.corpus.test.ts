import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { validateBytes } from 'gltf-validator';
import { FormatError, readAni, readChr, readO3d } from '@flyffweb/formats';
import type { Skeleton } from '@flyffweb/formats';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';
import { buildModelGlb } from '../src/models/modelGlb';
import { buildMotionGlb } from '../src/models/motionGlb';
import { skeletonFor, skeletonOfMotion } from '../src/models/skeletonFor';
import { buildSkeletonGlb } from '../src/models/skeletonGlb';

// Converts every model, skeleton and motion directly in Client/Model (as the models stage does, without writing) and
// runs the Khronos glTF validator on every glb.

interface ValidatorReport {
  issues: { messages: { code: string; message: string; severity: number; pointer?: string }[] };
}

const stem = (file: string): string => file.replace(/\.[^.]*$/, '');

interface Sweep {
  converted: Record<'skeletons' | 'motions' | 'models', number>;
  bytesOut: number;
  skipped: string[];
  failures: string[];
  /** Validator errors by code, with the first file that had each. */
  errors: Map<string, { count: number; first: string }>;
  /** Validator warnings by code (reported, not asserted). */
  warnings: Map<string, number>;
  seconds: number;
}

let sweep: Sweep | undefined;

async function runSweep(): Promise<Sweep> {
  if (sweep !== undefined) return sweep;
  const started = Date.now();
  const dir = path.join(clientRoot()!, 'Model');
  const names = readdirSync(dir).sort();
  const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(dir, name)));
  const s: Sweep = {
    converted: { skeletons: 0, motions: 0, models: 0 },
    bytesOut: 0,
    skipped: [],
    failures: [],
    errors: new Map(),
    warnings: new Map(),
    seconds: 0,
  };

  const validate = async (name: string, glb: Uint8Array): Promise<void> => {
    s.bytesOut += glb.length;
    const report = (await validateBytes(glb, { maxIssues: 0 })) as ValidatorReport;
    for (const m of report.issues.messages) {
      if (m.severity === 0) {
        const entry = s.errors.get(m.code) ?? { count: 0, first: `${name} ${m.pointer ?? ''}: ${m.message}` };
        entry.count++;
        s.errors.set(m.code, entry);
      } else if (m.severity === 1) {
        s.warnings.set(m.code, (s.warnings.get(m.code) ?? 0) + 1);
      }
    }
  };

  const skeletons = new Map<string, Skeleton>();
  for (const name of names.filter((n) => /\.chr$/i.test(n))) {
    try {
      const skel = readChr(bytesOf(name), name);
      skeletons.set(stem(name).toLowerCase(), skel);
      await validate(name, await buildSkeletonGlb(skel));
      s.converted.skeletons++;
    } catch (error) {
      s.failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const name of names.filter((n) => /\.ani$/i.test(n))) {
    const chr = skeletonOfMotion(stem(name), skeletons.keys());
    if (chr === null) {
      s.skipped.push(`${name}: no skeleton`);
      continue;
    }
    try {
      await validate(name, await buildMotionGlb(skeletons.get(chr)!, readAni(bytesOf(name), name), stem(name)));
      s.converted.motions++;
    } catch (error) {
      s.failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const name of names.filter((n) => /\.o3d$/i.test(n))) {
    try {
      let model;
      try {
        model = readO3d(bytesOf(name), name);
      } catch (error) {
        if (error instanceof FormatError && /older than the oldest the client reads/.test(error.message)) {
          s.skipped.push(`${name}: version Neuz refuses`);
          continue;
        }
        throw error;
      }
      if (!model.nameMatches) {
        s.skipped.push(`${name}: stored name differs`);
        continue;
      }
      const choice = skeletonFor(stem(name), model, (chr) => skeletons.has(chr));
      const skeleton = choice.kind === 'chr' ? skeletons.get(choice.chr)! : null;
      await validate(name, await buildModelGlb(model, skeleton, (texture) => `textures/${texture.toLowerCase()}.ktx2`));
      s.converted.models++;
    } catch (error) {
      s.failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  s.seconds = (Date.now() - started) / 1000;
  sweep = s;
  return s;
}

describeClient('models stage over every file of Client/Model', () => {
  it('converts every skeleton, motion and model Neuz loads, and the validator finds no errors', async () => {
    const s = await runSweep();
    console.log(
      `converted ${JSON.stringify(s.converted)}, ${(s.bytesOut / 1048576).toFixed(1)} MB of glb, ` +
        `${s.seconds.toFixed(0)} s; validator warnings ${JSON.stringify(Object.fromEntries(s.warnings))}`,
    );
    expect(s.failures).toEqual([]);
    expect(Object.fromEntries(s.errors)).toEqual({});
    expect(s.converted).toEqual({ skeletons: 303, motions: 2928, models: 4192 });
  });

  it('skips three motions without a skeleton and nine models Neuz refuses', async () => {
    const s = await runSweep();
    expect(s.skipped).toEqual([
      'Mvr_BangBig_walk.ani: no skeleton',
      'Mvr_DwarpetDust_Walk.ani: no skeleton',
      'mvr_RockMuscleBig_walk.ani: no skeleton',
      'Mvr_PetManaUnicorn01.o3d: stored name differs',
      'Part_fCloSailor01Hat.o3d: stored name differs',
      'Part_fCloSailor02Hat.o3d: stored name differs',
      'Part_fCloSailor03Hat.o3d: stored name differs',
      'Part_fCloSailor04Hat.o3d: stored name differs',
      'Part_femaleHead.o3d: version Neuz refuses',
      'Part_mCloKorean01Hat.o3d: stored name differs',
      'Part_maleHead.o3d: version Neuz refuses',
      'region_Path.o3d: stored name differs',
    ]);
  });
});
