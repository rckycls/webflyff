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
import { readGlb } from './helpers/glbChecks';

// Converts every model, skeleton and motion directly in Client/Model (as the models stage does, without writing) and
// runs the Khronos glTF validator on every glb.

interface ValidatorReport {
  issues: { messages: { code: string; message: string; severity: number; pointer?: string }[] };
}

const stem = (file: string): string => file.replace(/\.[^.]*$/, '');

/** The extras of the default scene of a glb, read from its JSON chunk without loading the rest. */
function sceneExtrasOf(glb: Uint8Array): unknown {
  const jsonLength = new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as {
    scene?: number;
    scenes: { extras?: unknown }[];
  };
  return json.scenes[json.scene ?? 0]!.extras;
}

interface Sweep {
  converted: Record<'skeletons' | 'motions' | 'models', number>;
  /** Skeleton and model glbs whose scene extras were compared with their source file, and the ones that differ. */
  extrasChecked: Record<'skeletons' | 'models', number>;
  extrasMismatches: string[];
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
    extrasChecked: { skeletons: 0, models: 0 },
    extrasMismatches: [],
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

  /** Counts the glb as checked, and as a mismatch unless its scene extras are `expected`. */
  const checkExtras = (kind: 'skeletons' | 'models', name: string, glb: Uint8Array, expected: unknown): void => {
    s.extrasChecked[kind]++;
    if (JSON.stringify(sceneExtrasOf(glb)) !== JSON.stringify(expected)) s.extrasMismatches.push(name);
  };

  const skeletons = new Map<string, Skeleton>();
  for (const name of names.filter((n) => /\.chr$/i.test(n))) {
    try {
      const skel = readChr(bytesOf(name), name);
      skeletons.set(stem(name).toLowerCase(), skel);
      const glb = await buildSkeletonGlb(skel);
      await validate(name, glb);
      checkExtras('skeletons', name, glb, {
        grips: {
          rHand: skel.rHandIdx,
          lHand: skel.lHandIdx,
          rArm: skel.rArmIdx,
          lArm: skel.lArmIdx,
          localRH: Array.from(skel.localRH),
          localLH: Array.from(skel.localLH),
          localShield: Array.from(skel.localShield),
          localKnuckle: Array.from(skel.localKnuckle),
        },
      });
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
      const glb = await buildModelGlb(model, skeleton, (texture) => `textures/${texture.toLowerCase()}.ktx2`);
      await validate(name, glb);
      checkExtras('models', name, glb, { bbMin: Array.from(model.bbMin), bbMax: Array.from(model.bbMax) });
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
  it('converts every skeleton, motion and model Neuz loads; the validator finds no errors or warnings', async () => {
    const s = await runSweep();
    console.log(
      `converted ${JSON.stringify(s.converted)}, ${(s.bytesOut / 1048576).toFixed(1)} MB of glb, ` +
        `${s.seconds.toFixed(0)} s; validator warnings ${JSON.stringify(Object.fromEntries(s.warnings))}`,
    );
    expect(s.failures).toEqual([]);
    expect(Object.fromEntries(s.errors)).toEqual({});
    expect(Object.fromEntries(s.warnings)).toEqual({});
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

// The frames the client's motions mark, measured with readAni on Client/Model and cross-checked with the notes
// ([combat §2.5] attacks, [skills §1.6] skills).
describeClient('motion events in the converted motions', () => {
  /** [motion file, hit frames, sound frames and ids, quake frames, frame count]; every perSlerp is 0.5. */
  const MOTIONS: [string, number[], [number, number][], number[], number][] = [
    ['Mvr_male_AtkAtk1-01', [12], [[8, 140]], [], 17],
    ['Mvr_male_AtkAtk2-01', [11], [[7, 141]], [], 17],
    ['Mvr_male_AtkAtk3-01', [10], [[7, 142]], [], 17],
    ['Mvr_male_AtkAtk4-01', [8], [[3, 143]], [], 17],
    ['Mvr_female_AtkAtk1-01', [12], [[8, 140]], [], 17],
    ['Mvr_AiBatt_atk1', [21], [[0, 1308]], [], 52],
    ['Mvr_male_SklVagCleanHit', [27], [[20, 211]], [], 51],
    [
      'Mvr_male_SklVagBrandish',
      [7, 23, 39],
      [[11, 212], [19, 212], [27, 212], [35, 212], [43, 212]],
      [],
      61,
    ],
    ['Mvr_male_SklVagOverCutter', [23], [[17, 213]], [], 51],
    // a blow and a sound-and-quake frame on one frame (attr 6)
    ['Mvr_male_Atkatk1-14', [17], [[6, 172]], [6], 24],
    // a damaged motion and a death have no blow
    ['Mvr_male_AtkDmg1-01', [], [[0, 102]], [], 26],
    ['Mvr_male_AtkDie1-01', [], [[0, 103]], [], 46],
    // a sound frame between two frames (the client keeps the exact frame in m_fFrame)
    ['mvr_Frinker_die1', [], [[0, 2324], [20.5, 0]], [], 51],
  ];

  const dir = (): string => path.join(clientRoot()!, 'Model');
  const bytesOf = (file: string): Uint8Array => new Uint8Array(readFileSync(path.join(dir(), file)));
  const fileOf = (name: string): string => {
    const found = readdirSync(dir()).find((f) => f.toLowerCase() === `${name.toLowerCase()}.ani`);
    if (found === undefined) throw new Error(`Client/Model/${name}.ani not found`);
    return found;
  };

  it.each(MOTIONS)('%s: the glb names its hit, sound and quake frames', async (name, hit, sound, quake, frames) => {
    const chrs = readdirSync(dir()).filter((f) => /\.chr$/i.test(f));
    const chr = skeletonOfMotion(name, chrs.map((f) => stem(f).toLowerCase()));
    const file = fileOf(name);
    const skeleton = readChr(bytesOf(chrs.find((f) => stem(f).toLowerCase() === chr)!), chr!);
    const glb = await buildMotionGlb(skeleton, readAni(bytesOf(file), file), stem(file));

    const [animation] = (await readGlb(glb)).getRoot().listAnimations();
    expect(animation!.getExtras().events).toEqual({ hit, sound, quake, frames, perSlerp: 0.5 });
  });
});

// The model boxes and the skeleton hand grips (the values measured with readO3d and readChr on Client/Model).
describeClient('model boxes and skeleton grips in the converted files', () => {
  it('every skeleton glb carries the grips of its .chr and every model glb the box of its file', async () => {
    const s = await runSweep();
    expect(s.extrasMismatches).toEqual([]);
    expect(s.extrasChecked).toEqual({ skeletons: 303, models: 4192 });
  });

  const dir = (): string => path.join(clientRoot()!, 'Model');
  const fileOf = (name: string, ext: string): string => {
    const found = readdirSync(dir()).find((f) => f.toLowerCase() === `${name.toLowerCase()}.${ext}`);
    if (found === undefined) throw new Error(`Client/Model/${name}.${ext} not found`);
    return found;
  };
  const bytesOf = (file: string): Uint8Array => new Uint8Array(readFileSync(path.join(dir(), file)));

  it('mvr_male and mvr_female: hands are bones 17 (R) and 13 (L), forearms 16 (R) and 12 (L), the grips the file\'s', async () => {
    // [skeleton, translation row (_41, _42, _43) of localRH, localLH, localShield and localKnuckle], as the file stores them
    for (const [name, localRH, localLH, localShield, localKnuckle] of [
      [
        'mvr_male',
        [0.10551, -0.01573, -0.00455],
        [0.10593, 0.01581, -0.00508],
        [0.08033, 0.05767, -0.0294],
        [0.11212, 0.0083, 0],
      ],
      [
        'mvr_female',
        [0.10589, -0.01984, -0.00211],
        [0.10485, 0.01964, -0.00077],
        [0.079, 0.07433, -0.02024],
        [0.14325, 0.00275, 0.00669],
      ],
    ] as const) {
      const doc = await readGlb(await buildSkeletonGlb(readChr(bytesOf(fileOf(name, 'chr')), name)));
      const { grips } = doc.getRoot().listScenes()[0]!.getExtras() as { grips: Record<string, number | number[]> };
      expect([grips.rHand, grips.lHand, grips.rArm, grips.lArm]).toEqual([17, 13, 16, 12]);
      const rows = { localRH, localLH, localShield, localKnuckle };
      for (const [matrix, row] of Object.entries(rows)) {
        expect(grips[matrix]).toHaveLength(16);
        (grips[matrix] as number[]).slice(12, 15).forEach((v, i) => expect(v).toBeCloseTo(row[i]!, 5));
      }
    }
  });

  it.each([
    ['Mvr_Bang', [-1.975, -0.002, -1.083], [2.268, 3.329, 0.622]],
    ['Mvr_AiBatt', [-0.534, 0.549, -0.23], [0.489, 1.215, 0.715]],
  ] as const)('%s (a monster): its glb carries the box of its file, y up and z not negated', async (name, min, max) => {
    const file = fileOf(name, 'o3d');
    const model = readO3d(bytesOf(file), file);
    const chrFiles = readdirSync(dir()).filter((f) => /\.chr$/i.test(f));
    const chrs = new Map(chrFiles.map((f) => [stem(f).toLowerCase(), f]));
    const choice = skeletonFor(stem(file), model, (chr) => chrs.has(chr));
    const skeleton = choice.kind === 'chr' ? readChr(bytesOf(chrs.get(choice.chr)!), choice.chr) : null;
    const glb = await buildModelGlb(model, skeleton, () => null);
    const extras = (await readGlb(glb)).getRoot().listScenes()[0]!.getExtras() as { bbMin: number[]; bbMax: number[] };
    min.forEach((v, i) => expect(extras.bbMin[i]).toBeCloseTo(v, 3));
    max.forEach((v, i) => expect(extras.bbMax[i]).toBeCloseTo(v, 3));
  });
});
