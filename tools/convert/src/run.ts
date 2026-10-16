import os from 'node:os';
import path from 'node:path';
import { ClientFs } from './ClientFs';
import { AssetWriter } from './output/AssetWriter';
import { Report } from './output/Report';
import { UserError } from './util';

/** Everything a stage needs. `only` and `jobs` are for the stage to apply (`matchesOnly`, `runLimited`). */
export interface StageContext {
  client: ClientFs;
  writer: AssetWriter;
  report: Report;
  /** The `--only` glob, if any. */
  only?: string;
  jobs: number;
  /** The `--max-texture-size` cap in pixels, if any. */
  maxTextureSize?: number;
  /** Absolute output folder. */
  outDir: string;
}

export interface Stage {
  name: string;
  run(ctx: StageContext): Promise<void>;
}

/**
 * The stages a normal run executes, in this order: textures, then models, then worlds. Each of tasks 11 to 13 adds
 * its stage here.
 */
export const DEFAULT_STAGES: readonly Stage[] = [];

export interface RunOptions {
  /** The client folder (read-only). */
  client: string;
  /** The output folder. Must not be inside the client folder. */
  out: string;
  only?: string;
  allowFailures?: boolean;
  jobs?: number;
  maxTextureSize?: number;
  stages?: readonly Stage[];
  /** Progress and summary lines; defaults to the console. */
  log?: (line: string) => void;
}

export function defaultJobs(): number {
  return Math.max(1, os.availableParallelism() - 1);
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Runs the stages one after the other, then writes `index.json` and `report.json`. A stage that throws is recorded as a
 * failure of kind `stage` and the run goes on with the next one. Returns the exit code: 1 if anything failed (unless
 * `allowFailures`), else 0. Throws if the client or output folder is unusable.
 */
export async function run(opts: RunOptions): Promise<number> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const outDir = path.resolve(opts.out);
  if (isInside(path.resolve(opts.client), outDir)) {
    throw new UserError(`the output folder ${outDir} is inside the client folder; the client folder is read-only`);
  }

  const client = await ClientFs.open(opts.client);
  const report = new Report();
  const indexPath = path.join(outDir, 'index.json');
  const writer = new AssetWriter(outDir, undefined, (message) => report.warn('index', indexPath, message));
  const ctx: StageContext = {
    client,
    writer,
    report,
    only: opts.only,
    jobs: opts.jobs ?? defaultJobs(),
    maxTextureSize: opts.maxTextureSize,
    outDir,
  };

  log(`Converting ${client.root} to ${outDir}`);
  for (const stage of opts.stages ?? DEFAULT_STAGES) {
    const started = Date.now();
    log(`[${stage.name}] started`);
    try {
      await stage.run(ctx);
    } catch (error) {
      report.fail('stage', stage.name, error);
    }
    log(`[${stage.name}] finished in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }

  await writer.finish();
  await report.write(outDir);
  log(report.summary());
  if (report.failed > 0) log(`Failures are listed in ${path.join(outDir, 'report.json')}`);
  return report.failed > 0 && !opts.allowFailures ? 1 : 0;
}
