import { describe, expect, it } from 'vitest';
import {
  ResPacks,
  loadStrings,
  readCharacterInc,
  readHonorTitles,
  readModelIndex,
  readPkSetting,
  readPropItem,
  readPropMover,
  readStringTable,
} from '../src/index';
import { buildPack } from './helpers/packs';
import { thrown } from './helpers/thrown';

/** Script text with the CRLF line ends the shipped files use. */
function script(...lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

/** A property table row: the shipped files separate the columns with tabs, the tests write spaces. */
const row = (columns: string): string => columns.split(' ').join('\t');

describe('readModelIndex: part and motions', () => {
  const DEFINES = new Map([
    ['MODELTYPE_MESH', 1],
    ['MODELTYPE_ANIMATED_MESH', 2],
    ['MD_NEAR', 1],
    ['MD_MID', 2],
    ['ATEX_NONE', 0],
    ['II_ARM_M_VAG_SUIT01', 502],
    ['MI_MALE', 11],
    ['MTI_STAND', 8],
    ['MTI_WALK', 3],
    ['MTI_RUN', 4],
  ]);

  it('keeps the part text of each entry, with the "/" of a two-sex part, and the motion list in file order', () => {
    const text = script(
      '"item" 4',
      '{',
      '  "GenMatSuitbox" II_ARM_M_VAG_SUIT01 MODELTYPE_MESH "mvag01upper/fvag01upper" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '  "GenMatSuitbox" 503 MODELTYPE_MESH mVag02Upper 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '  "Plain" 504 MODELTYPE_MESH "" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '}',
      '"mvr" 5',
      '{',
      '  "male" MI_MALE MODELTYPE_ANIMATED_MESH "" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1',
      '  {',
      '    "GenStand"  MTI_STAND',
      '    "GenWalk"   MTI_WALK',
      '    "GenWalk"   MTI_RUN',
      '  }',
      '  "after" 12 MODELTYPE_MESH "" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1',
      '}',
    );
    const elems = readModelIndex(text, DEFINES);
    expect(elems.map((e) => [e.name, e.id, e.part])).toEqual([
      ['GenMatSuitbox', 502, 'mvag01upper/fvag01upper'],
      ['GenMatSuitbox', 503, 'mVag02Upper'], // a bare word is the part's text as well
      ['Plain', 504, ''], // "" is no part
      ['male', 11, ''],
      ['after', 12, ''],
    ]);
    expect(elems.map((e) => e.motions)).toEqual([
      [],
      [],
      [],
      [
        { id: 8, name: 'GenStand' },
        { id: 3, name: 'GenWalk' },
        { id: 4, name: 'GenWalk' }, // the same name under two ids: both are kept
      ],
      [],
    ]);
  });
});

describe('readStringTable', () => {
  it('reads "IDS_KEY<tab>text" lines: the rest of the line, trimmed, empty text allowed', () => {
    const text = script(
      'IDS_PROPMOVER_TXT_000000\tDefault',
      'IDS_PROPMOVER_TXT_000001\t',
      'IDS_PROPMOVER_TXT_000002\t  Male   ',
      '// a comment line between entries',
      'IDS_PROPMOVER_TXT_000003 spaces only between key and text',
      'IDS_X_000004\tTab\tinside',
    );
    expect([...readStringTable(text, 'propMover.txt.txt')]).toEqual([
      ['IDS_PROPMOVER_TXT_000000', 'Default'],
      ['IDS_PROPMOVER_TXT_000001', ''],
      ['IDS_PROPMOVER_TXT_000002', 'Male'],
      ['IDS_PROPMOVER_TXT_000003', 'spaces only between key and text'],
      ['IDS_X_000004', 'Tab\tinside'],
    ]);
  });

  it('does not read the text as script: quotes, // and /* inside it are just characters', () => {
    const text = script(
      'IDS_A_000001\tSee http://example.com/a for "details',
      'IDS_A_000002\tOpens a /* comment',
      'IDS_A_000003\tafter it',
    );
    expect([...readStringTable(text)]).toEqual([
      ['IDS_A_000001', 'See http://example.com/a for "details'],
      ['IDS_A_000002', 'Opens a /* comment'],
      ['IDS_A_000003', 'after it'],
    ]);
  });

  it('keeps the first of a repeated key, as map::insert does', () => {
    const table = readStringTable(script('IDS_A_000001\tfirst', 'IDS_A_000001\tsecond', 'IDS_A_000002\tthird'));
    expect([...table]).toEqual([
      ['IDS_A_000001', 'first'],
      ['IDS_A_000002', 'third'],
    ]);
  });

  it('also ends a line at a bare LF (the C++ looks for CR only; the shipped files are CRLF)', () => {
    expect([...readStringTable('IDS_A_000001\tone\nIDS_A_000002\ttwo\n')]).toEqual([
      ['IDS_A_000001', 'one'],
      ['IDS_A_000002', 'two'],
    ]);
  });

  it('returns an empty table for a file with nothing but comments', () => {
    expect(readStringTable(script('// nothing here', '/* or here */')).size).toBe(0);
    expect(readStringTable('').size).toBe(0);
  });

  it('throws a FormatError, with the file and line, for a line that does not start with an IDS key', () => {
    const err = thrown(() => readStringTable(script('IDS_A_000001\tone', 'Default\tfoo'), 'etc.txt.txt'));
    expect(err.file).toBe('etc.txt.txt');
    expect(err.line).toBe(2);
    expect(err.message).toContain('Default');
  });
});

describe('loadStrings', () => {
  const bytes = (text: string): number[] => Array.from(new TextEncoder().encode(text));
  const utf16 = (text: string): number[] => [
    0xff,
    0xfe,
    ...Array.from(text, (c) => c.charCodeAt(0)).flatMap((u) => [u & 0xff, u >> 8]),
  ];
  const packs = ResPacks.fromBuffers([
    {
      file: 'data.res',
      bytes: buildPack({
        key: 87,
        encrypted: true,
        files: [
          { name: 'propMover.txt.txt', data: bytes(script('IDS_PROPMOVER_TXT_000002\tMale', 'IDS_SHARED_000001\tmover')) },
          { name: 'honorList.txt.txt', data: bytes(script('IDS_TITLE_TXT_0001\tMaster Collector')) },
          // UTF-16LE, and read before propMover.txt.txt, as CProject::LoadStrings lists it first (the name's case
          // does not matter to the packs)
          { name: 'Character.txt.txt', data: utf16(script('IDS_CHARACTER_INC_000001\tMikyel', 'IDS_SHARED_000001\tchar')) },
          // a table CProject::LoadStrings does not list
          { name: 'unlisted.txt.txt', data: bytes(script('IDS_UNLISTED_000001\tnot read')) },
        ],
      }),
    },
  ]);

  it('merges the tables LoadStrings lists that the packs hold, in its order, each key keeping its first text', () => {
    expect([...loadStrings(packs)]).toEqual([
      ['IDS_CHARACTER_INC_000001', 'Mikyel'],
      ['IDS_SHARED_000001', 'char'],
      ['IDS_PROPMOVER_TXT_000002', 'Male'],
      ['IDS_TITLE_TXT_0001', 'Master Collector'],
    ]);
  });
});

describe('readPropMover', () => {
  const DEFINES = new Map([
    ['MI_DEFAULT', 10],
    ['MI_MALE', 11],
    ['MI_AIBATT1', 20],
    ['AII_MOVER', 1],
    ['AII_MONSTER', 2],
    ['BELLI_PEACEFUL', 1],
    ['BELLI_MELEE2X', 11],
    ['RANK_LOW', 1],
    ['II_WEA_HAN_HAND', 11],
    ['II_WEA_MOB_AIBATT1_ATK1', 9000],
    ['II_WEA_MOB_AIBATT1_ATK2', 9001],
    ['II_WEA_MOB_AIBATT1_ATK3', 9002],
    ['VT_ITEM', 1],
    ['SND_ITEM_ANIMAL', 32],
    ['SND_PC_DMGWANB', 124],
  ]);
  const STRINGS = new Map([
    ['IDS_PROPMOVER_TXT_000000', 'Default'],
    ['IDS_PROPMOVER_TXT_000001', ''],
    ['IDS_PROPMOVER_TXT_000002', 'Male'],
    ['IDS_PROPMOVER_TXT_000003', ''],
    ['IDS_PROPMOVER_TXT_000006', 'Small Aibatt'],
    ['IDS_PROPMOVER_TXT_000007', ''],
  ]);

  // Three rows of propMover.txt as shipped (tab-separated; "=" is an empty cell).
  const DEFAULT = row(
    'MI_DEFAULT IDS_PROPMOVER_TXT_000000 AII_MOVER 10 10 10 10 10 10 = BELLI_PEACEFUL = = = = = 0 = = = = = = = = = = = = = = = = = = = = 0 = = = 0 0 = 0.1 = 0 = = = 0 0 0 0 0 0 = = = = = = 0 0 = = 0 II_WEA_HAN_HAND VT_ITEM = = = = = = = = SND_ITEM_ANIMAL SND_PC_DMGWANB = = = IDS_PROPMOVER_TXT_000001',
  );
  const MALE = row(
    'MI_MALE IDS_PROPMOVER_TXT_000002 AII_MOVER 10 10 10 10 10 10 = BELLI_PEACEFUL = = 65 = = 1 = = = = = = = = = = = = = = = = = = = = 0 130 0 = 0 0 = 0.1 = 0 = = = 0 0 0 0 0 0 = = = = = = 0 0 = = 0 II_WEA_HAN_HAND VT_ITEM = = = = = = = = SND_ITEM_ANIMAL SND_PC_DMGWANB = = = IDS_PROPMOVER_TXT_000003',
  );
  const AIBATT1 = row(
    'MI_AIBATT1 IDS_PROPMOVER_TXT_000006 AII_MONSTER 15 20 15 13 40 3 = BELLI_MELEE2X = 1 = = RANK_LOW 0 = 1 = 15 16 II_WEA_MOB_AIBATT1_ATK1 II_WEA_MOB_AIBATT1_ATK2 II_WEA_MOB_AIBATT1_ATK3 = = = = = = = = 1000 6000 120 100 3 130 0 = 4 1 = 0.075 = 0 = = = 1 0 -0.3 0 0 0.3 8 = = = = 25 2 0 = = 1 II_WEA_HAN_HAND VT_ITEM = = = = = = = = SND_ITEM_ANIMAL SND_PC_DMGWANB = = = IDS_PROPMOVER_TXT_000007',
  );
  const HEADER = script('//dwID\tszName\tdwAI\tdwStr', '//\t\t\t\t');

  it('reads the id, the name (through the string table), the AI and the speed of each row', () => {
    const text = script(DEFAULT, MALE, AIBATT1);
    expect(readPropMover(HEADER + text, DEFINES, STRINGS, 'propMover.txt')).toEqual([
      { index: 10, name: 'Default', speed: 0.1, ai: 1 },
      { index: 11, name: 'Male', speed: 0.1, ai: 1 },
      { index: 20, name: 'Small Aibatt', speed: 0.075, ai: 2 },
    ]);
  });

  it('takes a name that is not an IDS key as it is, and an id written as a number', () => {
    const text = script(AIBATT1.replace('MI_AIBATT1', '77').replace('IDS_PROPMOVER_TXT_000006', '"Plain Name"'));
    expect(readPropMover(text, DEFINES, STRINGS)).toEqual([{ index: 77, name: 'Plain Name', speed: 0.075, ai: 2 }]);
  });

  it('skips a stray 0 between rows, as the C++ does', () => {
    const text = script(DEFAULT, '0', MALE);
    expect(readPropMover(text, DEFINES, STRINGS).map((m) => m.index)).toEqual([10, 11]);
  });

  it('returns nothing for a file of comments', () => {
    expect(readPropMover(HEADER, DEFINES, STRINGS)).toEqual([]);
  });

  it('throws a FormatError for a repeated id, naming the file, the line and the earlier name', () => {
    const err = thrown(() => readPropMover(script(DEFAULT, MALE, MALE), DEFINES, STRINGS, 'propMover.txt'));
    expect(err.file).toBe('propMover.txt');
    expect(err.line).toBe(3);
    expect(err.message).toContain('11');
    expect(err.message).toContain('duplicated');
    expect(err.message).toContain('Male'); // "Last read", as in the C++ message
  });

  it('throws for an id outside 0..1999, a negative id, a name that is not defined, or a row that stops early', () => {
    thrown(() => readPropMover(script('2000 ' + AIBATT1.slice(AIBATT1.indexOf('\t') + 1)), DEFINES, STRINGS));
    thrown(() => readPropMover(script('-5 ' + AIBATT1.slice(AIBATT1.indexOf('\t') + 1)), DEFINES, STRINGS));
    thrown(() => readPropMover(script(AIBATT1.replace('RANK_LOW', 'RANK_MISSING')), DEFINES, STRINGS));
    const cut = thrown(() => readPropMover(script(AIBATT1.split('\t').slice(0, 30).join('\t')), DEFINES, STRINGS));
    expect(cut.message).toContain('end of the script');
  });

  it('says which column an undefined name was found in', () => {
    const err = thrown(() => readPropMover(script(AIBATT1.replace('BELLI_MELEE2X', 'BELLI_MISSING')), DEFINES, STRINGS));
    expect(err.message).toContain('BELLI_MISSING');
    expect(err.message).toContain('dwBelligerence');
  });
});

describe('readPropItem', () => {
  const DEFINES = new Map([
    ['II_DEFAULT', 10],
    ['II_ARM_M_VAG_SUIT01', 502],
    ['II_WEA_SWO_SUHOUM', 22368],
    ['IK1_SYSTEM', 5],
    ['IK1_ARMOR', 2],
    ['IK1_WEAPON', 1],
    ['IK2_ARMOR', 7],
    ['IK2_WEAPON_DIRECT', 2],
    ['IK2_WEAPON_MAGIC', 3],
    ['IK3_SUIT', 18],
    ['IK3_SWD', 2],
    ['_NONE', 0],
    ['JOB_VAGRANT', 0],
    ['JOB_MERCENARY', 1],
    ['TRUE', 1],
    ['SEX_MALE', 0],
    ['PARTS_UPPER_BODY', 2],
    ['PARTS_LOWER_BODY', 3],
    ['PARTS_RWEAPON', 10],
    ['HD_ONE', 1],
    ['WT_MELEE_SWD', 1],
    ['AS_HORIZONTAL', 0],
    ['AS_VERTICAL', 1],
    ['AS_DIAGONAL', 2],
    ['AS_THRUST', 3],
    ['AR_SHORT', 1],
    ['DST_DEX', 2],
    ['DST_STA', 4],
    ['XI_HIT_SWORD01', 20],
    ['WEAPON_ULTIMATE', 2],
    ['SND_ITEM_DROPDING1', 39],
    ['SND_PC_DMGSWDM', 117],
    ['SND_PC_DMGSWDC', 119],
  ]);
  const STRINGS = new Map([
    ['IDS_PROPITEM_TXT_000000', ''],
    ['IDS_PROPITEM_TXT_000001', ''],
    ['IDS_PROPITEM_TXT_000790', 'Cotton Suit'],
    ['IDS_PROPITEM_TXT_000791', 'A suit of cotton.'],
    ['IDS_PROPITEM_TXT_008534', 'Ultimate Guardian Sword @'],
    ['IDS_PROPITEM_TXT_008535', ''],
  ]);

  // Three rows of propItem.txt as shipped. The icon cell `"""name"""` is three tokens: "", "name", "".
  const DEFAULT = row(
    '6 II_DEFAULT IDS_PROPITEM_TXT_000000 1 1 IK1_SYSTEM = = = = = = 1 = = = = = = = 0 = = = = = = = = = = = _NONE 0 0 0 = = = = = = = = = = = = = 0.07 = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 0 0 0 0 0 = = = = = = = = = = = = = = = = = """""" 0 """""" IDS_PROPITEM_TXT_000001',
  );
  const SUIT = row(
    '6 II_ARM_M_VAG_SUIT01 IDS_PROPITEM_TXT_000790 1 1 IK1_ARMOR IK2_ARMOR IK3_SUIT JOB_VAGRANT TRUE = SEX_MALE 12 9000000 100 180 = = PARTS_UPPER_BODY = 1 PARTS_LOWER_BODY = 1 2 1 1 = = = 8 10 _NONE 0 0 0 = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = 0 0 0 0 0 0 = = = = = = = = = = = = 1 = = = """itm_mVag01Upper.dds""" 0 """""" IDS_PROPITEM_TXT_000791',
  );
  const SWORD = row(
    '8 II_WEA_SWO_SUHOUM IDS_PROPITEM_TXT_008534 1 1 IK1_WEAPON IK2_WEAPON_DIRECT IK3_SWD JOB_MERCENARY TRUE = = 200000 7200000 100 180 HD_ONE = PARTS_RWEAPON = 0 = = 200 200 = 1 = = = 350 357 _NONE 0 0 0 0 0 = WT_MELEE_SWD AS_HORIZONTAL AS_DIAGONAL AS_VERTICAL AS_THRUST = = = = = 0.085 = AR_SHORT = DST_STA DST_DEX = 5 5 = = = = = = = = = = = = = = = = = = = = = = = XI_HIT_SWORD01 = = = = = = = = = WEAPON_ULTIMATE = = = = = = 0 0 0 0 0 0 = = SND_ITEM_DROPDING1 = = = = = = = = = 60 = SND_PC_DMGSWDM SND_PC_DMGSWDC """Itm_WeaSwoSuho.dds""" 0 """""" IDS_PROPITEM_TXT_008535',
  );
  const HEADER = script('//ver6\t//dwID\tszName', '//\t\t');

  it('reads the id, the name (through the string table) and the body slot (dwParts) of each row', () => {
    const items = readPropItem(HEADER + script(DEFAULT, SUIT, SWORD), DEFINES, STRINGS, 'propItem.txt');
    expect(items).toEqual([
      { id: 10, name: '', parts: -1 }, // "=" is NULL_ID: the item is worn nowhere
      { id: 502, name: 'Cotton Suit', parts: 2 }, // PARTS_UPPER_BODY
      { id: 22368, name: 'Ultimate Guardian Sword', parts: 10 }, // PARTS_RWEAPON; the " @" of an ultimate is dropped
    ]);
  });

  it('drops the " @" mark only from the names of ultimate weapons', () => {
    // the same row with another reference stat (so IsUltimate is false) keeps the mark
    const plain = SWORD.replace('WEAPON_ULTIMATE', '=');
    expect(readPropItem(script(plain), DEFINES, STRINGS)[0].name).toBe('Ultimate Guardian Sword @');
    // IK2_WEAPON_MAGIC counts as well
    const magic = SWORD.replace('IK2_WEAPON_DIRECT', 'IK2_WEAPON_MAGIC');
    expect(readPropItem(script(magic), DEFINES, STRINGS)[0].name).toBe('Ultimate Guardian Sword');
  });

  it('reads past a row of a version newer than the client (15) without returning it', () => {
    const newer = SUIT.replace(/^6/, '16').replace('II_ARM_M_VAG_SUIT01', 'II_DEFAULT');
    expect(readPropItem(script(DEFAULT, newer, SWORD), DEFINES, STRINGS).map((i) => i.id)).toEqual([10, 22368]);
    const current = SUIT.replace(/^6/, '15');
    expect(readPropItem(script(current), DEFINES, STRINGS).map((i) => i.id)).toEqual([502]);
  });

  it('returns a repeated id each time, in file order (the C++ keeps the last)', () => {
    const again = SUIT.replace('IDS_PROPITEM_TXT_000790', 'IDS_PROPITEM_TXT_000000');
    expect(readPropItem(script(SUIT, again), DEFINES, STRINGS).map((i) => [i.id, i.name])).toEqual([
      [502, 'Cotton Suit'],
      [502, ''],
    ]);
  });

  it('returns nothing for a file of comments', () => {
    expect(readPropItem(HEADER, DEFINES, STRINGS)).toEqual([]);
  });

  it('throws a FormatError for item id 0, an undefined name, or a row that stops early', () => {
    const zero = thrown(() => readPropItem(script(SUIT.replace('II_ARM_M_VAG_SUIT01', '0')), DEFINES, STRINGS, 'p.txt'));
    expect(zero.file).toBe('p.txt');
    expect(zero.line).toBe(1);
    const unknown = thrown(() => readPropItem(script(SUIT.replace('JOB_VAGRANT', 'JOB_MISSING')), DEFINES, STRINGS));
    expect(unknown.message).toContain('JOB_MISSING');
    expect(unknown.message).toContain('dwItemJob');
    thrown(() => readPropItem(script(SUIT.split('\t').slice(0, 60).join('\t')), DEFINES, STRINGS));
  });
});

describe('readCharacterInc', () => {
  const DEFINES = new Map([
    ['MMI_DIALOG', 0],
    ['MMI_TELEPORTER', 146],
    ['SRT_QUESTOFFICE', 10],
    ['BGM_NPC_HORROR2', 201],
    ['MI_FEMALE', 12],
    ['II_ARM_F_CLO_KOREAN01HAT', 10345],
    ['II_WEA_SWO_OUTLAW', 22001],
    ['IK3_SWD', 2],
    ['JOB_VAGRANT', 0],
    ['LANG_JAP', 2],
    ['SI_GEN_EVE_QUICKSTEP', 317],
  ]);
  const STRINGS = new Map([
    ['IDS_CHARACTER_INC_000000', 'char_Agent.tga'],
    ['IDS_CHARACTER_INC_000001', 'Mikyel'],
    ['IDS_CHARACTER_INC_000002', 'Weapons'],
    ['IDS_CHARACTER_INC_000003', ''],
    ['IDS_CHARACTER_INC_000004', 'Luda'],
    ['IDS_CHARACTER_INC_000005', 'Bobo'],
  ]);

  // An NPC as character.inc lays it out: a key, a `setting` block, then SetName.
  const MIKYEL = [
    'MaFl_Mikyel',
    '{',
    '\tsetting',
    '\t{',
    '\t\tAddMenu( MMI_DIALOG );',
    '\t\tm_nStructure= SRT_QUESTOFFICE;',
    '\t\t//SetMusic( BGM_NPC_SOLEMN );',
    '\t\tSetImage',
    '\t\t(',
    '\t\tIDS_CHARACTER_INC_000000',
    '\t\t);',
    '\t\tm_szDialog= "MaFl_Mikyel.txt";',
    '\t}',
    '',
    '\tSetName',
    '\t(',
    '\tIDS_CHARACTER_INC_000001',
    '\t);',
    '}',
  ];

  it('reads the key and the SetName text (through the string table) of each character, in file order', () => {
    const player = [
      'MaFl_Player // a player-looking NPC',
      '{',
      '\tsetting',
      '\t{',
      '\t\tAddMenu( MMI_DIALOG );',
      '\t\tSetEquip( II_ARM_F_CLO_KOREAN01HAT, II_WEA_SWO_OUTLAW );',
      '\t\tSetFigure( MI_FEMALE, 0, 0xffff0000, 0 );',
      '\t\tSetMusic( BGM_NPC_HORROR2 );',
      '\t\tSetImage ( IDS_CHARACTER_INC_000000 );',
      '\t}',
      '\tSetName ( IDS_CHARACTER_INC_000004 );',
      '}',
    ];
    const text = script('//header comment', '/* block', 'comment */', ...MIKYEL, '', ...player);
    expect(readCharacterInc(text, DEFINES, STRINGS, 'character.inc')).toEqual([
      { key: 'MaFl_Mikyel', name: 'Mikyel' },
      { key: 'MaFl_Player', name: 'Luda' },
    ]);
  });

  it('follows the other statements token for token: vendors, teleports, buffs, languages, nested blocks', () => {
    const vendor = [
      'MaFl_Vendor',
      '{',
      '\tsetting',
      '\t{',
      '\t\tSetLang( LANG_JAP );',
      '\t\tSetLang( LANG_JAP, 1 );',
      '\t\tSetOutput( FALSE );',
      '\t\tAddMenu( MMI_TELEPORTER );',
      '\t\tAddMenuLang( LANG_JAP, 0, MMI_DIALOG );',
      '\t\tAddVendorSlot( 0, IDS_CHARACTER_INC_000002 );',
      '\t\tAddVendorSlotLang( LANG_JAP, 0, 1, IDS_CHARACTER_INC_000002 );',
      '\t\tAddVendorItem( 0, IK3_SWD, JOB_VAGRANT, 1, 10, 10 );',
      '\t\tAddVendorItemLang( LANG_JAP, 0, 0, IK3_SWD, JOB_VAGRANT, 1, 10, 10 );',
      '\t\tAddVenderItem( 0, IK3_SWD, JOB_VAGRANT, 1, 10, 10 );',
      '\t\tAddVendorItem2( 0, 1234 );',
      '\t\tSetVenderType( 1 );',
      '\t\tAddTeleport( 7161, 3264 ); //somewhere',
      '\t\tSetBuffSkill( SI_GEN_EVE_QUICKSTEP, 2, 1, 30, 3600000 );',
      '\t\tm_szDlgQuest= "SetName";', // a string that spells a statement is a value here
      '\t\trandomItem { 1 ; 2 ; }',
      '\t\tinner { more { deeper } }',
      '\t}',
      '\tSetName ( IDS_CHARACTER_INC_000005 );',
      '}',
    ];
    const text = script(...vendor, ...MIKYEL);
    expect(readCharacterInc(text, DEFINES, STRINGS)).toEqual([
      { key: 'MaFl_Vendor', name: 'Bobo' },
      { key: 'MaFl_Mikyel', name: 'Mikyel' },
    ]);
  });

  it('reads m_szName = "text", and gives a character with no name an empty one', () => {
    const text = script(
      'Quoted',
      '{',
      '\tm_szName = "A Quoted Name";',
      '}',
      'Nameless',
      '{',
      '\tAddMenu( MMI_DIALOG );',
      '}',
    );
    expect(readCharacterInc(text, DEFINES, STRINGS)).toEqual([
      { key: 'Quoted', name: 'A Quoted Name' },
      { key: 'Nameless', name: '' },
    ]);
  });

  it('gives SetName with an empty text a single space, as CProject::GetLangScript does', () => {
    const text = script('Blank', '{', '\tSetName ( IDS_CHARACTER_INC_000003 );', '}');
    expect(readCharacterInc(text, DEFINES, STRINGS)).toEqual([{ key: 'Blank', name: ' ' }]);
  });

  it('keeps the key as written, and lets a later SetName in the same block win', () => {
    const text = script('MixedCase_Key', '{', 'SetName ( IDS_CHARACTER_INC_000001 );', 'SetName ( IDS_CHARACTER_INC_000004 );', '}');
    expect(readCharacterInc(text, DEFINES, STRINGS)).toEqual([{ key: 'MixedCase_Key', name: 'Luda' }]);
  });

  it('returns nothing for a file of comments, and repeats a key that appears twice', () => {
    expect(readCharacterInc(script('// nothing'), DEFINES, STRINGS)).toEqual([]);
    const text = script(...MIKYEL, ...MIKYEL);
    expect(readCharacterInc(text, DEFINES, STRINGS).map((c) => c.key)).toEqual(['MaFl_Mikyel', 'MaFl_Mikyel']);
  });

  it('throws a FormatError for a block that is never closed, or a name that is not defined', () => {
    const open = thrown(() => readCharacterInc(script('Open', '{', '\tAddMenu( MMI_DIALOG );'), DEFINES, STRINGS, 'c.inc'));
    expect(open.file).toBe('c.inc');
    const unknown = thrown(() => readCharacterInc(script('Bad', '{', '\tAddMenu( MMI_MISSING );', '}'), DEFINES, STRINGS));
    expect(unknown.message).toContain('MMI_MISSING');
    expect(unknown.line).toBe(3);
  });
});

describe('readPkSetting', () => {
  const DEFINES = new Map<string, number>();

  // PKSetting.inc as shipped: a long comment that repeats the keywords, then the values.
  const PK = script(
    '/*////////////////////////////////////////////////////////////////',
    'GENERAL_COLOR \t\t// general',
    'CHAO_COLOR\t\t// chaotic',
    '////////////////////////////////////////////////////////////////*/',
    '',
    'GENERAL_COLOR\t0xffffffff',
    'READY_COLOR\t0xffffc0cb',
    'CHAO_COLOR\t0xffff0000',
    'GENERAL_ATTACK_TIME\t16',
    'READY_ATTACK_TIME\t8',
    'LIMITE_LEVEL\t\t20',
    'DIE_PROPENSITY_MIN\t300',
    'DIE_PROPENSITY_MAX\t500',
    '',
    'PROPENSITY_PENALTY',
    '{',
    '\tADDPENALTY\t1\t1\t850\t0\t0\t0\t0\t0\t0\t0\t0\t0\t',
    '\tADDPENALTY\t2\t851\t6000\t0\t1\t2\t4\t0\t0\t0\t0\t0\t',
    '}',
    '',
    'LEVEL_EXP',
    '{',
    '\tADDEXP\t21\t62',
    '\tADDEXP\t22\t69',
    '}',
  );

  it('reads the three name colours as unsigned ARGB values', () => {
    expect(readPkSetting(PK, DEFINES, 'PKSetting.inc')).toEqual({
      general: 0xffffffff,
      chaotic: 0xffff0000,
      ready: 0xffffc0cb,
    });
  });

  it('finds the colours after the blocks, and gives 0 to a colour the file does not set', () => {
    const text = script(
      'PROPENSITY_PENALTY',
      '{',
      '\tADDPENALTY\t1\t1\t850\t0\t0\t0\t0\t0\t0\t0\t0\t0',
      '}',
      'LEVEL_EXP',
      '{',
      '\tADDEXP\t21\t62',
      '}',
      'READY_COLOR\t0xffffc0cb',
    );
    expect(readPkSetting(text, DEFINES)).toEqual({ general: 0, chaotic: 0, ready: 0xffffc0cb });
  });

  it('resolves a colour written as a define, and a file with no colours is all zero', () => {
    expect(readPkSetting(script('CHAO_COLOR PK_RED'), new Map([['PK_RED', 0xff0000]]))).toEqual({
      general: 0,
      chaotic: 0xff0000,
      ready: 0,
    });
    expect(readPkSetting(script('// nothing'), DEFINES)).toEqual({ general: 0, chaotic: 0, ready: 0 });
  });

  // The way CScript reads a number (the other readers rely on it too): a sign is a token of its own, `=` is NULL_ID,
  // a define with a negative value is that value, and a decimal is cut at its point.
  it('reads numbers as CScanner::GetNumber does', () => {
    const colors = (text: string, defines = DEFINES) => readPkSetting(script(text), defines);
    expect(colors('GENERAL_COLOR - 1').general).toBe(0xffffffff); // -1, as a DWORD
    expect(colors('GENERAL_COLOR + 7').general).toBe(7);
    expect(colors('GENERAL_COLOR =').general).toBe(0xffffffff); // NULL_ID
    expect(colors('GENERAL_COLOR 12.9').general).toBe(12); // atoi
    expect(colors('GENERAL_COLOR PK_NEG', new Map([['PK_NEG', -2]])).general).toBe(0xfffffffe);
    expect(colors('GENERAL_COLOR - PK_FIVE', new Map([['PK_FIVE', 5]])).general).toBe(0xfffffffb);
    expect(colors('GENERAL_COLOR 0x10').general).toBe(16);
    // a word of CScript's keyword table is never replaced by a define, so it reads as 0 (atoi of "default")
    expect(colors('GENERAL_COLOR default', new Map([['default', 9]])).general).toBe(0);
  });

  it('throws a FormatError for a colour that is missing its value, or an undefined name', () => {
    thrown(() => readPkSetting(script('GENERAL_COLOR'), DEFINES, 'PKSetting.inc'));
    const err = thrown(() => readPkSetting(script('GENERAL_COLOR PK_MISSING'), DEFINES, 'PKSetting.inc'));
    expect(err.message).toContain('PK_MISSING');
    expect(err.file).toBe('PKSetting.inc');
  });
});

describe('readHonorTitles', () => {
  const DEFINES = new Map([
    ['HI_ELASPED_TIME', 1],
    ['HI_COUNT_CHECK', 2],
    ['HI_EARN_TITLE', 3],
    ['HI_HUNT_MONSTER', 4],
    ['HI_USE_ITEM', 5],
    ['HS_COLLECT', 51],
    ['HS_STR', 65],
    ['JOB_KNIGHT_MASTER', 16],
    ['MI_TAIGA02', 1012],
    ['MI_DORIAN02', 1013],
    ['MI_AIBATT1', 20],
    ['II_ARM_M_VAG_SUIT01', 502],
    ['II_WEA_SWO_SUHOUM', 22368],
    ['II_DEFAULT', 10],
    ['MONSTER_TITLE_MAX', 2],
  ]);
  const STRINGS = new Map([
    ['IDS_TITLE_TXT_0001', 'Master Collector'],
    ['IDS_TITLE_TXT_0002', 'Strongman'],
    ['IDS_TITLE_TXT_0003', 'Knight Master'],
    ['IDS_TITLE_TXT_0004', 'Taiga Hunter'],
    ['IDS_TITLE_TXT_0005', 'Dorian Hunter'],
  ]);

  // honorList.txt as shipped: comment lines, then `id big small need title // comment`.
  const HONOR = script(
    '//\t!! the list',
    '// id\tbig\tsmall\tneed\ttitle',
    row('0 HI_ELASPED_TIME HS_COLLECT 1440 IDS_TITLE_TXT_0001\t//collection'),
    row('1 HI_COUNT_CHECK HS_STR 253 IDS_TITLE_TXT_0002\t// strength'),
    row('2 HI_EARN_TITLE JOB_KNIGHT_MASTER 1 IDS_TITLE_TXT_0003'),
    row('3 HI_HUNT_MONSTER MI_TAIGA02 15000 IDS_TITLE_TXT_0004 // hunt'),
  );

  it('maps each honour id to its title text (through the string table), whatever the group', () => {
    expect([...readHonorTitles(HONOR, DEFINES, STRINGS, 'honorList.txt')]).toEqual([
      [0, 'Master Collector'],
      [1, 'Strongman'],
      [2, 'Knight Master'],
      [3, 'Taiga Hunter'],
    ]);
  });

  it('keeps the first title of a repeated id, as map::insert does, and leaves out id -1 (GetTitle gives NULL)', () => {
    const text = script(
      row('7 HI_COUNT_CHECK HS_STR 1 IDS_TITLE_TXT_0002'),
      row('7 HI_COUNT_CHECK HS_STR 1 IDS_TITLE_TXT_0001'),
      row('= HI_COUNT_CHECK HS_STR 1 IDS_TITLE_TXT_0003'),
    );
    expect([...readHonorTitles(text, DEFINES, STRINGS)]).toEqual([[7, 'Strongman']]);
  });

  it('takes a title that is not an IDS key as it is', () => {
    const text = script(row('4 HI_COUNT_CHECK HS_STR 1 "Plain-Title"'));
    expect(readHonorTitles(text, DEFINES, STRINGS).get(4)).toBe('Plain-Title');
  });

  it('returns an empty map for a file of comments', () => {
    expect(readHonorTitles(script('// nothing'), DEFINES, STRINGS).size).toBe(0);
  });

  it('counts a second title of the same monster once against MONSTER_TITLE_MAX, and throws past it', () => {
    const hunt = (id: number, monster: string) => row(`${id} HI_HUNT_MONSTER ${monster} 1 IDS_TITLE_TXT_0004`);
    // MONSTER_TITLE_MAX is 2 here: ids 0 and 1 hunt the same monster, so three titles fit
    const ok = script(hunt(0, 'MI_TAIGA02'), hunt(1, 'MI_TAIGA02'), hunt(2, 'MI_DORIAN02'));
    expect(readHonorTitles(ok, DEFINES, STRINGS).size).toBe(3);
    // a third distinct monster is one too many (the C++ logs "Too many title about monster!" and stops loading)
    const tooMany = script(hunt(0, 'MI_TAIGA02'), hunt(1, 'MI_DORIAN02'), hunt(2, 'MI_AIBATT1'));
    const err = thrown(() => readHonorTitles(tooMany, DEFINES, STRINGS, 'honorList.txt'));
    expect(err.file).toBe('honorList.txt');
    expect(err.line).toBe(3);
    expect(err.message).toContain('monster');
  });

  it('keeps a separate count for titles of item use, against the same limit', () => {
    const use = (id: number, item: string) => row(`${id} HI_USE_ITEM ${item} 1 IDS_TITLE_TXT_0005`);
    const ok = script(use(0, 'II_ARM_M_VAG_SUIT01'), use(1, 'II_ARM_M_VAG_SUIT01'), use(2, 'II_DEFAULT'));
    expect(readHonorTitles(ok, DEFINES, STRINGS).size).toBe(3);
    // the monster count does not use up the item count
    const mixed = script(
      row('0 HI_HUNT_MONSTER MI_TAIGA02 1 IDS_TITLE_TXT_0004'),
      row('1 HI_HUNT_MONSTER MI_DORIAN02 1 IDS_TITLE_TXT_0004'),
      use(2, 'II_DEFAULT'),
    );
    expect(readHonorTitles(mixed, DEFINES, STRINGS).size).toBe(3);
    const tooMany = script(use(0, 'II_DEFAULT'), use(1, 'II_ARM_M_VAG_SUIT01'), use(2, 'II_WEA_SWO_SUHOUM'));
    expect(thrown(() => readHonorTitles(tooMany, DEFINES, STRINGS)).message).toContain('item');
  });

  it('throws a FormatError for an undefined group name or a row that stops early', () => {
    thrown(() => readHonorTitles(script(row('0 HI_MISSING HS_STR 1 IDS_TITLE_TXT_0001')), DEFINES, STRINGS));
    thrown(() => readHonorTitles(script(row('0 HI_COUNT_CHECK HS_STR')), DEFINES, STRINGS));
  });
});
