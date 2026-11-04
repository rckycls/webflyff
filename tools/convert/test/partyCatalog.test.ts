// The party catalog (Piece 7 M4, [R §8.1]): the troupe skills read as LoadPropItem reads them, the party's EXP rows, the
// banned words and the allowed letters; and, on the real client (a corpus case), the 8 skills of the research note.

import { describe, expect, it } from 'vitest';
import { decodeScript, loadDefines, loadStrings } from '@flyffweb/formats';
import { describeClient, loadClientPacks } from '../../../packages/formats/test/helpers/client';
import { buildParty } from '../src/data/partyCatalog';
import type { PartyEnv } from '../src/data/partyCatalog';

/** A property table row: the shipped files separate the columns with tabs, the tests write spaces. */
const tabs = (columns: string): string => columns.split(' ').join('\t');
/**
 * A propItem.txt-shaped row (gameDataStage.test.ts's Clean Hit row), with a troupe skill's columns put in: the id and its
 * names, `dwReqDisLV` 70, `dwSfxObj` 79, `dwSfxObj2` 80, `dwSkillTime` 86, `dwExp` 107, `dwComboStyle` 108, `szIcon` 120.
 */
function row(cells: Record<number, string>): string {
  const base = tabs(
    '6 SI_VAG_ONE_CLEANHIT IDS_PROPSKILL_TXT_000000 1 1 JTYPE_BASE JOB_VAGRANT DIS_VAGRANT JOB_VAGRANT = = = = = = = HD_ONE = = = = = = = = = = = = = 0 0 _NONE 0 0 0 = = AS_DIAGONAL WT_EQUIP = = = = = = = = = = = AR_SHORT = = = = = = = = = = = = = = = = = 0 3 = = = = = = = = = = XI_SKILL_VAG_ONE_CLEANHIT01 = = MTI_VAG_ONE_CLEANHIT = = EXT_MELEEATK WUI_TARGETINGOBJ SRO_DIRECT = DST_STR = RT_ATTACK = 5 = KT_SKILL 0 0 0 0 0 = 1 10 5 1 CT_STEP = = = = = = = = = SND_PC_DMGSWD = """skill_VagOneCleanh.dds""" 0 """""" IDS_PROPSKILL_TXT_000001',
  ).split('\t');
  for (const [i, text] of Object.entries(cells)) base[Number(i)] = text;
  return base.join('\t');
}

const DEFINES = new Map<string, number>([
  ['SI_VAG_ONE_CLEANHIT', 1], ['ST_CALL', 1], ['ST_LINKATTACK', 5], ['JTYPE_BASE', 1], ['JOB_VAGRANT', 0], ['DIS_VAGRANT', 0],
  ['HD_ONE', 1], ['_NONE', 0], ['AS_DIAGONAL', 1], ['WT_EQUIP', 0], ['AR_SHORT', 1], ['MTI_VAG_ONE_CLEANHIT', 100],
  ['XI_SKILL_VAG_ONE_CLEANHIT01', 300], ['XI_SKILL_TRO_CALL01', 1500], ['XI_SKILL_TRO_CALL02', 1501],
  ['XI_SKILL_TRO_LINKATTACK', 1505], ['EXT_MELEEATK', 1], ['WUI_TARGETINGOBJ', 4], ['SRO_DIRECT', 0], ['DST_STR', 1],
  ['RT_ATTACK', 1], ['KT_SKILL', 2], ['CT_STEP', 0], ['CT_GENERAL', 4], ['SND_PC_DMGSWD', 1],
]);
const STRINGS = new Map([
  ['IDS_PROPTROUPESKILL_TXT_000000', 'Call'], ['IDS_PROPTROUPESKILL_TXT_000001', 'Informs all party members. [Required points : 0]'],
  ['IDS_PROPTROUPESKILL_TXT_000002', 'Linked Attack'], ['IDS_PROPTROUPESKILL_TXT_000003', 'More damage. [Required points : 1]'],
  ['IDS_PROPSKILL_TXT_000000', 'x'], ['IDS_PROPSKILL_TXT_000001', 'x'],
]);

const FILES: Record<string, string> = {
  'propTroupeSkill.txt': [
    row({ 1: 'ST_CALL', 2: 'IDS_PROPTROUPESKILL_TXT_000000', 70: '10', 79: 'XI_SKILL_TRO_CALL01', 80: 'XI_SKILL_TRO_CALL02', 86: '=', 107: '0', 108: 'CT_GENERAL', 120: '"""skill_TroCall.dds"""', 123: 'IDS_PROPTROUPESKILL_TXT_000001' }),
    row({ 1: 'ST_LINKATTACK', 2: 'IDS_PROPTROUPESKILL_TXT_000002', 70: '20', 79: 'XI_SKILL_TRO_LINKATTACK', 80: '=', 86: '20000', 107: '1', 108: 'CT_GENERAL', 120: '"""skill_TroLinkattack.dds"""', 123: 'IDS_PROPTROUPESKILL_TXT_000003' }),
  ].join('\n'),
  'ExpTable.inc': 'expCharacter\n{\n0 0 0 0\n}\nexpParty\n{\n0\t0\n200\t15\n}\n',
  'InvalidName_ENG.inc': 'Shade\r\nGM\r\n',
  'Letter_ENG.inc': 'A\r\nb\r\n7\r\n',
};

const env = (warnings: string[] = []): PartyEnv => ({
  defines: DEFINES, strings: STRINGS,
  iconKey: (file) => (file === 'skill_TroCall.dds' ? 'icon/skill_trocall.dds' : null),
  warn: (_source, message) => warnings.push(message),
});
const read = { text: (name: string) => FILES[name]! };

describe('the party catalog (Piece 7 M4)', () => {
  it('reads a troupe skill row as LoadPropItem does', () => {
    const warnings: string[] = [];
    const party = buildParty(env(warnings), read);
    expect(party.skills).toEqual([
      { id: 1, name: 'Call', description: 'Informs all party members. [Required points : 0]', icon: 'icon/skill_trocall.dds',
        level: 10, points: 0, skillTime: null, sfx: 1500, sfx2: 1501 },
      { id: 5, name: 'Linked Attack', description: 'More damage. [Required points : 1]', icon: null,
        level: 20, points: 1, skillTime: 20000, sfx: 1505, sfx2: null },
    ]);
    // one warning names the skill whose picture is not in the client
    expect(warnings).toEqual([expect.stringContaining('Linked Attack')]);
  });

  it('reads the party EXP rows, the invalid names and the letters', () => {
    const party = buildParty(env(), read);
    expect(party.exp).toEqual([{ exp: 0, point: 0 }, { exp: 200, point: 15 }]);
    expect(party.invalidNames).toEqual(['shade', 'gm']);
    expect(party.letters).toBe('Ab7');
  });
});

describeClient('the party catalog on the real client (Piece 7 M4)', () => {
  it('the real files give the 8 party skills of [R §8.1], 10 party EXP rows, 127 invalid names and A-Za-z0-9', () => {
    const packs = loadClientPacks();
    const party = buildParty(
      { defines: loadDefines(packs), strings: loadStrings(packs), iconKey: (file) => file.toLowerCase(), warn: () => {} },
      { text: (name) => decodeScript(packs.read(name)) },
    );
    expect(party.skills.map((s) => [s.id, s.name.trim(), s.level, s.points, s.skillTime, s.sfx, s.sfx2])).toEqual([
      [1, 'Call', 10, 0, null, 1500, 1501], [2, 'Blitz', 10, 0, null, 1502, null], [3, 'Retreat', 10, 0, null, 1503, null],
      [4, 'Precision', 17, 1, 60000, 1504, null], [5, 'Linked Attack', 20, 1, 20000, 1505, null],
      [6, 'Lucky Drop', 25, 5, 300000, 1506, null], [7, 'Resting', 30, 2, 120000, 1507, 1508],
      [8, 'Gift Box', 40, 8, 300000, 1509, null],
    ]);
    expect(party.exp.map((r) => r.exp)).toEqual([0, 200, 200, 250, 300, 350, 400, 450, 500, 500]);
    expect(party.invalidNames).toHaveLength(127);
    expect([...party.letters].sort().join('')).toBe('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
  });
});
