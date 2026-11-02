// The audio stage (Piece 6 M2): the game's sound effects and music, copied as they are, plus an MP3 copy of each track
// made with FFmpeg for the browsers that play no Ogg.
//
//   sound/<web name>.wav    each WAV that sound.inc or a mdlDyna.inc effect names and the folder has (mono 16-bit PCM,
//                           which every browser decodes: docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md §1)
//   music/<web name>.ogg    each track default.bgm names and the folder has, once however many ids name it
//   music/<web name>.mp3    its MP3 copy; none when FFmpeg is missing, which is one failure of the run
//
// The 179 WAVs and 4 tracks no script names are not copied. A name the folder lacks is warned about once per kind,
// in one list. The data stage, which runs after this one, lists in data/audio.json only what this stage wrote.
//
// `--only audio` runs the stage; a glob that does not match its name runs it for the files whose base name matches.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDefines } from '@flyffweb/formats';
import { readModelIndexes } from '../data/modelIndexes';
import { musicKeyOf, soundKeyOf, stem } from '../output/keys';
import type { Stage, StageContext } from '../run';
import { listed, matchesOnly, plural, runLimited } from '../util';
import { audioSources, effectSoundParts } from './audioSources';
import { MISSING_FFMPEG_MESSAGE, findFfmpeg, toMp3 } from './ffmpeg';

const STAGE = 'audio';
const SOUND_KIND = 'sound';
const MUSIC_KIND = 'music';
const MP3_KIND = 'musicMp3';
/** How many names a missing-files warning lists before it gives only the count. */
const LISTED = 10;

export interface AudioStageOptions {
  /** For tests: the FFmpeg to use, or null for none. */
  findFfmpeg?: () => Promise<string | null>;
  /** For tests: the MP3 encoder, `toMp3` by default. */
  toMp3?: (ffmpeg: string, oggPath: string) => Promise<Uint8Array>;
}

/** "a, b, c and 12 more" of the first LISTED names. */
const someOf = (names: readonly string[]): string =>
  names.length <= LISTED ? listed(names) : `${listed(names.slice(0, LISTED))} and ${names.length - LISTED} more`;

export function createAudioStage(options: AudioStageOptions = {}): Stage {
  const find = options.findFfmpeg ?? (() => findFfmpeg());
  const encode = options.toMp3 ?? toMp3;

  return {
    name: STAGE,
    async run(ctx: StageContext) {
      const all = matchesOnly(STAGE, ctx.only);
      const wanted = (file: string): boolean => all || matchesOnly(stem(path.basename(file)), ctx.only);

      const defines = loadDefines(ctx.client.packs);
      let parts = new Map<number, string>();
      try {
        parts = effectSoundParts(readModelIndexes(ctx.client.packs, defines));
      } catch (error) {
        ctx.report.warn(SOUND_KIND, 'mdlDyna.inc', `not read, so no effect sound is copied: ${(error as Error).message}`);
      }
      const sources = audioSources(ctx.client, defines, parts);
      if (!all && ![...sources.sounds.values(), ...sources.effects.values(), ...sources.music.values()].some(wanted)) return;

      for (const script of sources.absent) ctx.report.warn(STAGE, script, 'not in the client folder');
      if (sources.missingSounds.length > 0) {
        ctx.report.warn(SOUND_KIND, 'Client/sound.inc, mdlDyna.inc',
          `${plural(sources.missingSounds.length, 'file')} not in Sound/, so their ids play nothing: ${someOf(sources.missingSounds)}`);
      }
      if (sources.missingMusic.length > 0) {
        ctx.report.warn(MUSIC_KIND, 'Music/default.bgm',
          `${plural(sources.missingMusic.length, 'track')} not in the folder, so their ids play nothing: ${someOf(sources.missingMusic)}`);
      }

      const wavs = [...new Set([...sources.sounds.values(), ...sources.effects.values()])].filter(wanted).sort();
      const oggs = [...new Set(sources.music.values())].filter(wanted).sort();
      const copy = async (kind: string, key: string, file: string): Promise<void> => {
        try {
          const bytes = new Uint8Array(await fs.readFile(file));
          await ctx.writer.write(key, bytes, file);
          ctx.report.ok(kind, file, bytes.length, bytes.length);
        } catch (error) {
          ctx.report.fail(kind, file, error);
        }
      };
      await runLimited(wavs, ctx.jobs, (file) => copy(SOUND_KIND, soundKeyOf(file), file));
      await runLimited(oggs, ctx.jobs, (file) => copy(MUSIC_KIND, musicKeyOf(file, 'ogg'), file));

      if (oggs.length === 0) return;
      const ffmpeg = await find();
      if (ffmpeg === null) {
        ctx.report.fail(STAGE, 'FFmpeg', new Error(MISSING_FFMPEG_MESSAGE));
        return;
      }
      await runLimited(oggs, ctx.jobs, async (file) => {
        try {
          const bytes = await encode(ffmpeg, file);
          await ctx.writer.write(musicKeyOf(file, 'mp3'), bytes, `${file} (mp3)`);
          ctx.report.ok(MP3_KIND, file, (await fs.stat(file)).size, bytes.length);
        } catch (error) {
          ctx.report.fail(MP3_KIND, file, error);
        }
      });
    },
  };
}

export const audioStage: Stage = createAudioStage();
