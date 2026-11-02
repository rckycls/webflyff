import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CharacterDef, ItemProp, MoverProp } from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { buildAudio } from '../src/data/audioCatalog';
import type { AudioEnv } from '../src/data/audioCatalog';
import { makeTempDir, writeFakeClient } from './helpers/fakeClient';

const script = (...lines: string[]): string => lines.join('\r\n') + '\r\n';

// The two Flaris rows of WdMadrigal.rgn (:748, :796), and an inn row; a .wld that says `bgm 6`, as DuFlMas.wld does.
const RGN = script(
  'region3 6 10 6962.002441 100.000000 3215.141602 0x410 2 0 "" "" 0 4096.000000 0.000000 1024.000000 6870 3184 7073 3285 "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0',
  'title 0', 'desc 0',
  'region3 6 10 6858.477051 100.000000 3266.560059 0x0 2 1 "" "" 0 0.000000 0.000000 0.000000 6848 3172 7261 3385 "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0',
  'title 0', 'desc 0',
  'region3 6 10 0 0 0 0x80 0 0 "" "" 0 0 0 0 1 2 3 4 "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0',
  'title 0', 'desc 0',
);
const WLD = script('size 1, 1', 'bgm 6');

const DEFINES = new Map([
  ['SND_INF_CLICK', 1], ['SND_GONE', 9], ['BGM_TITLE', 1], ['BGM_TO_FLARIS', 2], ['BGM_TH_RETURN', 10],
  ['BGM_FI_SAINTMORNING', 121],
]);

/** An ItemProp with only what the catalog reads set; the rest is irrelevant to it. */
const prop = (id: number, fields: Partial<ItemProp>): ItemProp =>
  ({ id, name: '', sndAttack1: -1, subDefine: -1, ...fields }) as ItemProp;

describe('the audio catalog', () => {
  let root: string;
  const warnings: string[] = [];

  beforeEach(async () => {
    root = await makeTempDir('flyffweb-audiocat-');
    warnings.length = 0;
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function build(over: Partial<AudioEnv> = {}, loose: Record<string, string> = {}, keys?: Set<string>) {
    await writeFakeClient(root, {
      loose: {
        'Client/sound.inc': script('SND_INF_CLICK "InfClick.wav"', 'SND_GONE "Gone.wav"'),
        'Sound/InfClick.wav': 'RIFF',
        'Sound/PcCure.wav': 'RIFF',
        'Music/default.bgm': script('BGM_TITLE "music\\BgmDu1Mystery.ogg"', 'BGM_TO_FLARIS "music\\BgmTo1Flaris.ogg"',
          'BGM_TH_RETURN "music\\BgmTh3Return.ogg"', 'BGM_FI_SAINTMORNING "music\\BgmTh3Return.ogg"'),
        'Music/BgmDu1Mystery.ogg': 'OggS',
        'Music/BgmTo1Flaris.ogg': 'OggS',
        'Music/Bgmth3Return.ogg': 'OggS',
        'World/WdMadrigal/WdMadrigal.rgn': RGN,
        'World/WdMadrigal/WdMadrigal.wld': script('size 1, 1', 'bgm 0'),
        'World/DuFlMas/DuFlMas.wld': WLD,
        ...loose,
      },
    });
    const written = keys ?? new Set([
      'sound/infclick.wav', 'sound/pccure.wav', 'music/bgmdu1mystery.ogg', 'music/bgmdu1mystery.mp3',
      'music/bgmto1flaris.ogg', 'music/bgmth3return.ogg', 'music/bgmth3return.mp3',
    ]);
    const env: AudioEnv = {
      client: await ClientFs.open(root),
      defines: DEFINES,
      effectParts: new Map([[62, 'PcCure.wav'], [63, 'Gone.wav']]),
      worlds: [{ id: 1, fileName: 'WdMadrigal' }, { id: 3, fileName: 'DuFlMas' }, { id: 4, fileName: 'DuNowhere' }],
      items: [prop(505, { sndAttack1: 115, sndAttack2: 119, subDefine: 39 }), prop(506, {})],
      skills: [prop(1, { sndAttack1: 140 }), prop(2, {})],
      movers: [{ index: 20, sndIdle1: 32 } as MoverProp, { index: 21 } as MoverProp],
      characters: [{ key: 'MaFl_Benku', name: 'Benku', music: 206 }, { key: 'MaFl_Mikyel', name: 'Mikyel' }] as CharacterDef[],
      has: (key) => written.has(key),
      warn: (source, message) => warnings.push(`${source}: ${message}`),
      ...over,
    };
    return buildAudio(env);
  }

  it('reads the region rows and the world music of each world folder', async () => {
    const audio = (await build())!;
    expect(audio.worlds[1]!.bgm).toBe(0);
    expect(audio.worlds[1]!.regions).toEqual([
      { rect: [6870, 3184, 7073, 3285], music: 2, direct: false, inn: false },
      { rect: [6848, 3172, 7261, 3385], music: 2, direct: true, inn: false },
      { rect: [1, 2, 3, 4], music: 0, direct: false, inn: true },
    ]);
    expect(audio.worlds[3]).toEqual({ bgm: 6, regions: [] });
    expect(audio.worlds[4]).toBeUndefined();
  });

  it('lists only the files of the index, two ids of one track sharing its keys', async () => {
    const audio = (await build())!;
    expect(audio.sounds).toEqual({ 1: 'sound/infclick.wav' });
    expect(audio.effects).toEqual({ 62: 'sound/pccure.wav' });
    expect(audio.music[1]).toEqual({ ogg: 'music/bgmdu1mystery.ogg', mp3: 'music/bgmdu1mystery.mp3' });
    expect(audio.music[2]).toEqual({ ogg: 'music/bgmto1flaris.ogg', mp3: null });
    expect(audio.music[10]).toEqual(audio.music[121]);
    expect(audio.music[10]!.ogg).toBe('music/bgmth3return.ogg');
  });

  it('keeps the sound columns of the props and the NPC music that name one', async () => {
    const audio = (await build())!;
    expect(audio.items).toEqual({ 505: { attack1: 115, attack2: 119, drop: 39 } });
    expect(audio.skills).toEqual({ 1: 140 });
    expect(audio.movers).toEqual({ 20: 32 });
    expect(audio.npcMusic).toEqual({ mafl_benku: 206 });
  });

  it('is null, with one warning, without sound.inc', async () => {
    await build();
    warnings.length = 0;
    await fs.rm(`${root}/Client/sound.inc`);
    const env = { client: await ClientFs.open(root) };
    expect(await build(env, {}, new Set())).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('sound.inc');
  });

  it('warns when the index has none of the sounds, as before an audio run', async () => {
    const audio = await build({}, {}, new Set());
    expect(audio!.sounds).toEqual({});
    expect(warnings.some((w) => w.includes('--only audio,data'))).toBe(true);
  });
});
