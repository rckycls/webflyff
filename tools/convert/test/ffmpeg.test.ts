import { describe, expect, it } from 'vitest';
import { buildMp3Args, ffmpegCandidates, findFfmpeg } from '../src/audio/ffmpeg';

describe('FFmpeg', () => {
  it('encodes a track to a 128 kbit/s MP3 with no metadata and no encoder tag', () => {
    expect(buildMp3Args('in.ogg', 'out.mp3')).toEqual([
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', 'in.ogg', '-vn', '-map_metadata', '-1',
      '-fflags', '+bitexact', '-codec:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'out.mp3',
    ]);
  });

  it('tries FFMPEG_BIN, then ffmpeg on the PATH, then the default install folder', () => {
    expect(ffmpegCandidates({ FFMPEG_BIN: 'D:\\tools\\ffmpeg.exe' })).toEqual([
      'D:\\tools\\ffmpeg.exe', 'ffmpeg', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    ]);
    expect(ffmpegCandidates({ FFMPEG_BIN: '' })).toEqual(['ffmpeg', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe']);
  });

  it('takes the first candidate that runs, or null', async () => {
    const tried: string[] = [];
    const probe = async (candidate: string): Promise<boolean> => { tried.push(candidate); return candidate === 'b'; };
    expect(await findFfmpeg(['a', 'b', 'c'], probe)).toBe('b');
    expect(tried).toEqual(['a', 'b']);
    expect(await findFfmpeg(['a'], async () => false)).toBeNull();
  });
});
