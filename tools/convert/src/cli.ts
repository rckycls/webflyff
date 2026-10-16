import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FormatError } from '@flyffweb/formats';
import { defaultJobs, run } from './run';
import type { RunOptions } from './run';
import { UserError } from './util';

/** This file is FlyffWeb/tools/convert/src/cli.ts, so FlyffWeb is three levels up. */
const FLYFFWEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const USAGE = [
  'Usage: npm run convert -- [options]',
  '',
  'Converts the FlyFF client folder (read-only) into hashed web assets.',
  '',
  'Options:',
  '  --client <dir>           FlyFF client folder (default: $FLYFF_CLIENT, else <repo>/Client)',
  '  --out <dir>              Output folder (default: FlyffWeb/dist/assets)',
  '  --only <glob>            Convert only the world folders and model/texture base names that match',
  '                           (case-insensitive, * is a wildcard), e.g. --only WdMadrigal or --only "part_m*"',
  '  --jobs <n>               Files converted in parallel (default: CPU count - 1, at least 1)',
  '  --max-texture-size <n>   Largest texture width or height in pixels (default: no limit)',
  '  --allow-failures         Exit 0 even when some files failed (report.json always lists them)',
  '  -h, --help               Show this help',
  '',
  'Exit code: 0 done, 1 some files failed, 2 bad command line or unusable folder.',
].join('\n');

export type CliOptions = Required<Pick<RunOptions, 'client' | 'out' | 'allowFailures' | 'jobs'>> &
  Pick<RunOptions, 'only' | 'maxTextureSize'>;

export type ParsedCli =
  | { kind: 'help' }
  | { kind: 'run'; options: CliOptions }
  | { kind: 'error'; message: string };

/** A positive whole number written in digits, or undefined. */
function positiveInteger(text: string): number | undefined {
  return /^[1-9]\d*$/.test(text) ? Number(text) : undefined;
}

/** Reads the command line. `env.FLYFF_CLIENT` is the default client folder. Relative paths resolve against the cwd. */
export function parseCli(argv: string[], env: NodeJS.ProcessEnv): ParsedCli {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        client: { type: 'string' },
        out: { type: 'string' },
        only: { type: 'string' },
        jobs: { type: 'string' },
        'max-texture-size': { type: 'string' },
        'allow-failures': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  if (values.help) return { kind: 'help' };

  for (const name of ['client', 'out', 'only'] as const) {
    if (values[name] === '') return { kind: 'error', message: `--${name} needs a value` };
  }
  let jobs = defaultJobs();
  if (values.jobs !== undefined) {
    const parsed = positiveInteger(values.jobs);
    if (parsed === undefined) {
      return { kind: 'error', message: `--jobs must be a positive whole number, got "${values.jobs}"` };
    }
    jobs = parsed;
  }
  let maxTextureSize: number | undefined;
  if (values['max-texture-size'] !== undefined) {
    maxTextureSize = positiveInteger(values['max-texture-size']);
    if (maxTextureSize === undefined) {
      const got = values['max-texture-size'];
      return { kind: 'error', message: `--max-texture-size must be a positive whole number, got "${got}"` };
    }
  }

  const client = values.client ?? (env.FLYFF_CLIENT ? env.FLYFF_CLIENT : path.join(FLYFFWEB_ROOT, '..', 'Client'));
  return {
    kind: 'run',
    options: {
      client: path.resolve(client),
      out: path.resolve(values.out ?? path.join(FLYFFWEB_ROOT, 'dist', 'assets')),
      only: values.only,
      allowFailures: values['allow-failures'] ?? false,
      jobs,
      maxTextureSize,
    },
  };
}

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

const consoleIo: CliIo = { stdout: (text) => console.log(text), stderr: (text) => console.error(text) };

/** Runs the converter for a command line and returns the exit code. */
export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = consoleIo,
): Promise<number> {
  const parsed = parseCli(argv, env);
  if (parsed.kind === 'help') {
    io.stdout(USAGE);
    return 0;
  }
  if (parsed.kind === 'error') {
    io.stderr(`convert: ${parsed.message}\n\n${USAGE}`);
    return 2;
  }
  try {
    return await run({ ...parsed.options, log: io.stdout });
  } catch (error) {
    // A wrong folder or a damaged pack is the user's to fix; anything else is a bug and keeps its stack trace.
    const plain = error instanceof UserError || error instanceof FormatError;
    const text = error instanceof Error ? (plain ? error.message : (error.stack ?? error.message)) : String(error);
    io.stderr(`convert: ${text}`);
    return 2;
  }
}

/** True when this file was started as the script (`tsx tools/convert/src/cli.ts`), not imported by a test. */
function isEntryPoint(): boolean {
  try {
    const script = process.argv[1];
    return script !== undefined && realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = await main(process.argv.slice(2));
}
