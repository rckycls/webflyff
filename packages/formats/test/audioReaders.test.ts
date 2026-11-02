import { describe, expect, it } from 'vitest';
import { readIdFileScript, readRegions } from '../src/index';

// Cut from Client/Client/sound.inc (:1-5, :997-998) and Resource/defineSound.h (:4-6, :1117-1118), with one name that is
// not a define, which CScanner::GetNumber reads as 0 ("Not Found").
const SOUND_INC = `BGM_NONE                     ""

SND_NONE                     "InfClick.wav"

SND_INF_CLICK                "InfClick.wav"
SND_NPC_KERNIDLE1            "NpcKernIdle1.wav"
SND_NPC_WORMVEDUQUEATK1      "NpcWormveduqueAtk1.wav"
SND_NOT_DEFINED              "Nothing.wav"
`;
const SOUND_DEFINES = new Map([
  ['BGM_NONE', 0], ['SND_NONE', 0], ['SND_INF_CLICK', 1], ['SND_NPC_KERNIDLE1', 2042], ['SND_NPC_WORMVEDUQUEATK1', 2042],
]);

// Cut from Client/Music/default.bgm (:1-5), with its comments.
const DEFAULT_BGM = `BGM_TITLE      "music\\BgmDu1Mystery.ogg" // "music\\BgmTitle.ogg"

BGM_TO_FLARIS        "music\\BgmTo1Flaris.ogg" // "music\\BgmTo1Flaris.ogg"
BGM_TO_SAINTMORNING  "music\\BgmTo2Music.ogg" // saintmonring
/* BGM_TO_DARKON        "music\\BgmFi4Darkon2.ogg" */
`;
const MUSIC_DEFINES = new Map([['BGM_TITLE', 1], ['BGM_TO_FLARIS', 2], ['BGM_TO_SAINTMORNING', 3], ['BGM_TO_DARKON', 4]]);

// Cut from Client/World/WdMadrigal/WdMadrigal.rgn: a respawn row (:3), the RI_REVIVAL row (:745), Central Flarine (:748)
// and Flarine (:796), with their title and desc lines; and an old-format `region` row, whose description comes straight
// after the target key (WorldFile.cpp:479-492).
const RGN = `// Region Script File

respawn7 5 651 3016.812256 71.095688 2479.061768 12 55 1 2964 2422 3045 2539 1 30 1 24 1 1 2 0.000000 -1 0 0
region3 6 13 6968.384766 100.000000 3328.863037 0x0 0 0 "" "" 0 4096.000000 0.000000 1024.000000 6960 3320 6976 3336 "flaris" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0
title 0
desc 0
region3 6 10 6962.002441 100.000000 3215.141602 0x410 2 0 "" "" 0 4096.000000 0.000000 1024.000000 6870 3184 7073 3285 "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0
title 1
{
IDS_WORLD_WDMADRIGAL_WDMADRIGAL_RGN_000004
}
desc 0
region3 6 10 6858.477051 100.000000 3266.560059 0x0 2 1 "" "" 0 0.000000 0.000000 0.000000 6848 3172 7261 3385 "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0
title 0
desc 0
region 6 10 100 0 100 0x80 120 1 "" "" 0 0 0 0 1 2 3 4 "" 0 1
{
IDS_SOME_DESC
}
`;

describe('readIdFileScript (CSoundManager::LoadScript, CMusicMng::LoadScript)', () => {
  it('maps the ids of sound.inc to their file names, the last entry of an id winning', () => {
    const sounds = readIdFileScript(SOUND_INC, SOUND_DEFINES, 'sound.inc');
    expect(sounds.get(1)).toBe('InfClick.wav');
    expect(sounds.get(2042)).toBe('NpcWormveduqueAtk1.wav');
    expect(sounds.has(0)).toBe(false);
    expect([...sounds.keys()].sort((a, b) => a - b)).toEqual([1, 2042]);
  });

  it('reads default.bgm with its comments, keeping each path as written', () => {
    const music = readIdFileScript(DEFAULT_BGM, MUSIC_DEFINES, 'default.bgm');
    expect(music).toEqual(new Map([
      [1, 'music\\BgmDu1Mystery.ogg'], [2, 'music\\BgmTo1Flaris.ogg'], [3, 'music\\BgmTo2Music.ogg'],
    ]));
  });
});

describe('readRegions (CWorld::LoadRegion, ReadRegion)', () => {
  it('keeps the region rows in file order, leaving out RI_REVIVAL and the respawn rows', () => {
    const rows = readRegions(RGN, 'WdMadrigal.rgn');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ index: 10, attribute: 0x410, music: 2, direct: false, rect: [6870, 3184, 7073, 3285] });
    expect(rows[1]).toEqual({ index: 10, attribute: 0, music: 2, direct: true, rect: [6848, 3172, 7261, 3385] });
  });

  it('reads an old-format region row with its description block', () => {
    const rows = readRegions(RGN, 'WdMadrigal.rgn');
    expect(rows[2]).toEqual({ index: 10, attribute: 0x80, music: 120, direct: true, rect: [1, 2, 3, 4] });
  });

  it('keeps at most 256 rows, as m_aRegion holds', () => {
    const row = 'region3 6 10 0 0 0 0x0 0 0 "" "" 0 0 0 0 0 0 1 1 "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0\ntitle 0\ndesc 0\n';
    expect(readRegions(row.repeat(300), 'many.rgn')).toHaveLength(256);
  });
});
