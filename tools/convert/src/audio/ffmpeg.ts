// Runs FFmpeg to make the MP3 copy of a track, for the browsers that play no Ogg (Safari before 18.4, Piece 6 design
// §3.3). Found and run as `ktx` is (textures/ktx.ts): a child process started with execFile, never through a shell.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Where the Windows builds of FFmpeg are usually unpacked. */
const DEFAULT_WINDOWS_PATH = 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe';

const PROBE_TIMEOUT_MS = 15_000;
/** A track takes a few seconds; this only stops a hung child from stalling a run. */
const RUN_TIMEOUT_MS = 5 * 60_000;

/** What a missing FFmpeg reports, once per run. */
export const MISSING_FFMPEG_MESSAGE =
  'FFmpeg not found: install it (winget install --id Gyan.FFmpeg -e, or set FFMPEG_BIN to ffmpeg.exe), then re-run';

/**
 * The command line (without the executable) that turns an Ogg track into a 128 kbit/s MP3: no video, no metadata and
 * no encoder tag, so the same input gives the same bytes and the same hashed name.
 */
export function buildMp3Args(input: string, output: string): string[] {
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-map_metadata', '-1',
    '-fflags', '+bitexact', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', output,
  ];
}

/** The executables to try, best first: `FFMPEG_BIN` (when not empty), `ffmpeg` on the PATH, the default folder. */
export function ffmpegCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = env.FFMPEG_BIN !== undefined && env.FFMPEG_BIN !== '' ? [env.FFMPEG_BIN] : [];
  return [...fromEnv, 'ffmpeg', DEFAULT_WINDOWS_PATH];
}

/** Runs `<candidate> -version`: true when it starts and says it is FFmpeg. */
async function probeFfmpeg(candidate: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(candidate, ['-version'], { timeout: PROBE_TIMEOUT_MS, windowsHide: true });
    return /^ffmpeg version/m.test(stdout);
  } catch {
    return false;
  }
}

/** The first FFmpeg that runs, or null when none does. */
export async function findFfmpeg(
  candidates: readonly string[] = ffmpegCandidates(),
  probe: (candidate: string) => Promise<boolean> = probeFfmpeg,
): Promise<string | null> {
  for (const candidate of candidates) if (await probe(candidate)) return candidate;
  return null;
}

/** The MP3 copy of the Ogg file `oggPath`. Rejects with FFmpeg's own error text when it fails. */
export async function toMp3(ffmpeg: string, oggPath: string): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'flyffweb-mp3-'));
  try {
    const output = path.join(dir, 'track.mp3');
    try {
      await execFileAsync(ffmpeg, buildMp3Args(oggPath, output), { timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      const detail = typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : (error as Error).message;
      throw new Error(`ffmpeg failed: ${detail}`, { cause: error });
    }
    return new Uint8Array(await fs.readFile(output));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
