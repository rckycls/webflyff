// Runs the Khronos `ktx` command line tool (KTX-Software 4.3 or newer; `ktx create` appeared in 4.3). It is a child
// process started with execFile, never through a shell, so file names are never parsed by one.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Where the Windows installer of KTX-Software puts it. */
const DEFAULT_WINDOWS_PATH = 'C:\\Program Files\\KTX-Software\\bin\\ktx.exe';

/** `ktx create` does not exist before this version. */
const MIN_VERSION: readonly [major: number, minor: number] = [4, 3];

const PROBE_TIMEOUT_MS = 15_000;
/** A single texture takes well under a second to a few seconds; this only stops a hung child from stalling a run. */
const RUN_TIMEOUT_MS = 5 * 60_000;

export interface KtxTool {
  /** What to hand to execFile: the file in KTX_BIN, `ktx` (found on the PATH) or the default install path. */
  path: string;
  /** Such as `4.4.2`. */
  version: string;
}

export type KtxMode = 'etc1s' | 'uastc';

/**
 * The command line (without the executable) that turns a PNG into a KTX2 file: sRGB 8-bit RGBA in, mip chain
 * generated, ETC1S (`basis-lz`, small) or UASTC (larger, better quality) out. Both transcode to the compressed
 * formats of phone and PC GPUs in the browser.
 */
export function buildKtxArgs(input: string, output: string, mode: KtxMode): string[] {
  return [
    'create',
    '--format',
    'R8G8B8A8_SRGB',
    '--encode',
    mode === 'etc1s' ? 'basis-lz' : 'uastc',
    '--generate-mipmap',
    input,
    output,
  ];
}

/** The executables to try, best first: `KTX_BIN` (when not empty), `ktx` on the PATH, the default install folder. */
export function ktxCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = env.KTX_BIN !== undefined && env.KTX_BIN !== '' ? [env.KTX_BIN] : [];
  return [...fromEnv, 'ktx', DEFAULT_WINDOWS_PATH];
}

/** The `x.y.z` in `ktx --version` output (`ktx version: v4.4.2`), or null when there is none or it is below 4.3. */
export function parseKtxVersion(output: string): string | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  if (match === null) return null;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  const [minMajor, minMinor] = MIN_VERSION;
  const recent = major > minMajor || (major === minMajor && minor >= minMinor);
  return recent ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/** Runs `<candidate> --version`; the version it prints, or null when it is not there, fails or is too old. */
async function probeKtx(candidate: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true });
    return parseKtxVersion(stdout);
  } catch {
    return null;
  }
}

/**
 * The first usable `ktx`: `KTX_BIN`, then `ktx` on the PATH, then `C:\Program Files\KTX-Software\bin\ktx.exe`.
 * A candidate that is missing, fails to run or is older than 4.3 is skipped. Null when none is usable.
 */
export async function ktxAvailable(
  candidates: readonly string[] = ktxCandidates(),
  probe: (candidate: string) => Promise<string | null> = probeKtx,
): Promise<KtxTool | null> {
  for (const candidate of candidates) {
    const version = await probe(candidate);
    if (version !== null) return { path: candidate, version };
  }
  return null;
}

/** Runs `ktx` with `args`. Rejects with ktx's own error text when it fails to start, exits non-zero or times out. */
export async function runKtx(ktxPath: string, args: string[]): Promise<void> {
  try {
    await execFileAsync(ktxPath, args, { timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const detail = typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : (error as Error).message;
    throw new Error(`ktx ${args[0] ?? ''} failed: ${detail}`, { cause: error });
  }
}
