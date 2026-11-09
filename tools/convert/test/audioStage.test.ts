import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientFs } from '../src/ClientFs';
import { MISSING_FFMPEG_MESSAGE } from '../src/audio/ffmpeg';
import { createAudioStage } from '../src/audio/audioStage';
import type { AudioStageOptions } from '../src/audio/audioStage';
import { AssetWriter } from '../src/output/AssetWriter';
import { Report } from '../src/output/Report';
import type { StageContext } from '../src/run';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';
import type { ReportJson, Run } from './helpers/worldRun';

const text = (s: string): number[] => Array.from(Buffer.from(s, 'latin1'));
const script = (...lines: string[]): string => lines.join('\r\n') + '\r\n';

const DEFINES = script(
  '#define SND_INF_CLICK 1',
  '#define SND_INF_TRADE 4',
  '#define SND_GONE 9',
  '#define BGM_TITLE 1',
  '#define BGM_TH_RETURN 10',
  '#define BGM_FI_SAINTMORNING 121',
  '#define BGM_GONE 70',
  '#define MODELTYPE_SFX 4',
  '#define MD_MID 2',
  '#define ATEX_NONE 0',
  '#define XI_GEN_CURE01 62',
  '#define XI_GEN_PLAIN 63',
);
const MDL_DYNA = script(
  '"sfx" 3',
  '{',
  '  "sfx_cure01" XI_GEN_CURE01 MODELTYPE_SFX "PcCure.wav" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1',
  '  "sfx_plain" XI_GEN_PLAIN MODELTYPE_SFX "" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1',
  '}',
);
// sound.inc names a WAV the folder lacks; default.bgm names one track in another case (as BgmTh3Return.ogg is), twice,
// and one track the folder lacks (as Bgm4DuDarkon.ogg is).
const SOUND_INC = script('SND_INF_CLICK "InfClick.wav"', 'SND_INF_TRADE "InfTrade.wav"', 'SND_GONE "Gone.wav"');
const DEFAULT_BGM = script(
  'BGM_TITLE "music\\BgmDu1Mystery.ogg"',
  'BGM_TH_RETURN "music\\BgmTh3Return.ogg"',
  'BGM_FI_SAINTMORNING "music\\BgmTh3Return.ogg"',
  'BGM_GONE "music\\Gone.ogg"',
);

describe('the audio stage on a small hand-made client', () => {
  let root: string;
  let out: string;
  let mp3s: string[];
  const fakeFfmpeg: AudioStageOptions = {
    findFfmpeg: async () => 'ffmpeg-fake',
    toMp3: async (_ffmpeg, ogg) => { mp3s.push(path.basename(ogg)); return new Uint8Array([0xff, 0xfb, mp3s.length]); },
  };

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-audio-client-');
    out = await makeTempDir('flyffweb-audio-out-');
    mp3s = [];
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(out, { recursive: true, force: true });
  });

  async function runAudio(options: AudioStageOptions = fakeFfmpeg, only?: string): Promise<Run> {
    await writeFakeClient(root, {
      packed: [
        { name: 'defineSound.h', data: text(DEFINES) },
        { name: 'mdlObj.inc', data: text(script('"obj" 0', '{', '}')) },
        { name: 'mdlDyna.inc', data: text(MDL_DYNA) },
      ],
      loose: {
        'Client/sound.inc': SOUND_INC,
        'Sound/InfClick.wav': 'RIFF click',
        'Sound/InfTrade.wav': 'RIFF trade',
        'Sound/PcCure.wav': 'RIFF cure',
        'Sound/Unnamed.wav': 'RIFF named by nothing',
        // played by file name (NAMED_SOUNDS, 2026-11-09); ItemGnCollector.wav is left out
        'Sound/PCSkillCastCheer.wav': 'RIFF cheer',
        'Music/default.bgm': DEFAULT_BGM,
        'Music/BgmDu1Mystery.ogg': 'OggS title',
        'Music/Bgmth3Return.ogg': 'OggS return',
        'Music/BgmExtra01.ogg': 'OggS named by nothing',
      },
    });
    const writer = new AssetWriter(out);
    const report = new Report();
    const ctx: StageContext = { client: await ClientFs.open(root), writer, report, only, jobs: 2, outDir: out };
    await createAudioStage(options).run(ctx);
    await report.write(out);
    return { writer, report: JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8')) as ReportJson, out };
  }

  it('writes the WAVs that sound.inc, mdlDyna.inc and NAMED_SOUNDS name, and each track as Ogg and MP3', async () => {
    const run = await runAudio();
    for (const key of ['sound/infclick.wav', 'sound/inftrade.wav', 'sound/pccure.wav', 'sound/pcskillcastcheer.wav',
      'music/bgmdu1mystery.ogg', 'music/bgmth3return.ogg', 'music/bgmdu1mystery.mp3', 'music/bgmth3return.mp3']) {
      expect(run.writer.pathOf(key), key).toBeDefined();
    }
    expect(run.writer.pathOf('sound/unnamed.wav')).toBeUndefined();
    expect(run.writer.pathOf('music/bgmextra01.ogg')).toBeUndefined();
    const ogg = run.writer.pathOf('music/bgmth3return.ogg')!;
    expect(await fs.readFile(path.join(out, ...ogg.split('/')), 'latin1')).toBe('OggS return');
    // the two ids of BgmTh3Return.ogg are one file, copied and encoded once
    expect(run.report.kinds.music).toMatchObject({ ok: 2, failed: 0 });
    expect(run.report.kinds.musicMp3).toMatchObject({ ok: 2, failed: 0 });
    expect(run.report.kinds.sound).toMatchObject({ ok: 4, failed: 0 });
    expect(mp3s.sort()).toEqual(['BgmDu1Mystery.ogg', 'Bgmth3Return.ogg']);
    expect(run.report.failures).toEqual([]);
  });

  it('warns once per script about the files it names that the folder lacks', async () => {
    const run = await runAudio();
    const sound = run.report.warnings.filter((w) => w.kind === 'sound');
    const music = run.report.warnings.filter((w) => w.kind === 'music');
    expect(sound).toHaveLength(1);
    expect(sound[0]!.message).toContain('Gone.wav');
    expect(sound[0]!.message).toContain('ItemGnCollector.wav');
    expect(music).toHaveLength(1);
    expect(music[0]!.message).toContain('Gone.ogg');
  });

  it('without FFmpeg records one failure and still copies the WAVs and the Oggs', async () => {
    const run = await runAudio({ findFfmpeg: async () => null });
    expect(run.report.failures).toEqual([
      expect.objectContaining({ kind: 'audio', source: 'FFmpeg', message: MISSING_FFMPEG_MESSAGE }),
    ]);
    expect(run.writer.pathOf('music/bgmth3return.ogg')).toBeDefined();
    expect(run.writer.pathOf('sound/infclick.wav')).toBeDefined();
    expect(run.writer.pathOf('music/bgmth3return.mp3')).toBeUndefined();
  });

  it('runs only when --only lets the audio stage through', async () => {
    const skipped = await runAudio(fakeFfmpeg, 'ui,data');
    expect(skipped.writer.pathOf('sound/infclick.wav')).toBeUndefined();
    expect(mp3s).toEqual([]);
    const run = await runAudio(fakeFfmpeg, 'audio');
    expect(run.writer.pathOf('sound/infclick.wav')).toBeDefined();
  });
});
