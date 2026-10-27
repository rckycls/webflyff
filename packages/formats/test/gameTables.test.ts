import { describe, expect, it } from 'vitest';
import { readEtcJobs, readExpTable, readPropJob, readPropSkillAdd, readTextClient, readTexturePack } from '../src/index';
import { thrown } from './helpers/thrown';

/** Script text with the CRLF line ends the shipped files use. */
function script(...lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

describe('readEtcJobs', () => {
  // etc.inc as shipped: comment lines, the job block (job, name, base job, job type), then the structure and Guild blocks
  const DEFINES = new Map([
    ['JOB_VAGRANT', 0], ['JOB_MERCENARY', 1], ['JOB_KNIGHT', 6], ['JTYPE_BASE', 0], ['JTYPE_EXPERT', 1], ['JTYPE_PRO', 2],
    ['STRUCTURE_A', 0],
  ]);
  const STRINGS = new Map([
    ['IDS_ETC_INC_000000', 'Vagrant'], ['IDS_ETC_INC_000001', 'Mercenary'], ['IDS_ETC_INC_000006', 'Knight'],
    ['IDS_ETC_INC_000020', 'Hall'],
  ]);
  const ETC = script(
    '// a comment',
    'job',
    '{',
    '\tJOB_VAGRANT\t\tIDS_ETC_INC_000000\t\tJOB_VAGRANT\tJTYPE_BASE',
    '',
    '\tJOB_MERCENARY\t\tIDS_ETC_INC_000001\t\tJOB_VAGRANT\tJTYPE_EXPERT',
    '\tJOB_KNIGHT\t\tIDS_ETC_INC_000006\t\tJOB_MERCENARY\tJTYPE_PRO',
    '}',
    'structure',
    '{',
    '\tSTRUCTURE_A\tIDS_ETC_INC_000020',
    '}',
  );

  it('gives each job its name from the string table, its base job and its type, by job (CProject::LoadEtc)', () => {
    const jobs = readEtcJobs(ETC, DEFINES, STRINGS, 'etc.inc');
    expect([...jobs]).toEqual([
      [0, { name: 'Vagrant', base: 0, type: 0 }],
      [1, { name: 'Mercenary', base: 0, type: 1 }],
      [6, { name: 'Knight', base: 1, type: 2 }],
    ]);
  });

  it('keeps a name the string table lacks as written, as CScript leaves the token', () => {
    const jobs = readEtcJobs(script('job', '{', 'JOB_VAGRANT IDS_ETC_INC_000099 JOB_VAGRANT JTYPE_BASE', '}'), DEFINES, STRINGS);
    expect(jobs.get(0)!.name).toBe('IDS_ETC_INC_000099');
  });

  it('reads nothing from a file with no job block, and throws for a job row that stops early', () => {
    expect(readEtcJobs(script('// nothing'), DEFINES, STRINGS).size).toBe(0);
    const cut = thrown(() => readEtcJobs(script('job', '{', 'JOB_VAGRANT IDS_ETC_INC_000000'), DEFINES, STRINGS, 'etc.inc'));
    expect(cut.file).toBe('etc.inc');
    expect(cut.message).toContain('end of the script');
  });
});

describe('readPropJob', () => {
  // propJob.inc as shipped: two comment lines, then one row per job in JOB_* order
  const HEADER = script('// comment line', '//\t\tMaxHP\tMaxMP');
  const VAGRANT = 'JOB_VAGRANT       75.0   0.9   0.3   0.3   1.0   1.2   0.5   0.5   4.5   5.5   0.8   3.0   5.0   6.0   0.2   4.2   1.0';
  const MERCENARY = 'JOB_MERCENARY     80.0   1.5   0.5   0.7   1.35   1.6   0.5   1.0   4.5   5.5   0.8   3.0   5.0   6.0   0.8   4.2   1.0';

  it('reads the job name and the 17 floats of each row, in the order of JobProp', () => {
    const jobs = readPropJob(HEADER + script(VAGRANT, MERCENARY), 'propJob.inc');
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      name: 'JOB_VAGRANT',
      attackSpeed: 75,
      factorMaxHP: Math.fround(0.9),
      factorMaxMP: Math.fround(0.3),
      factorMaxFP: Math.fround(0.3),
      factorDef: 1,
      factorHPRecovery: Math.fround(1.2),
      factorMPRecovery: 0.5,
      factorFPRecovery: 0.5,
      meleeSWD: 4.5,
      meleeAXE: 5.5,
      meleeSTAFF: Math.fround(0.8),
      meleeSTICK: 3,
      meleeKNUCKLE: 5,
      magicWAND: 6,
      blocking: Math.fround(0.2),
      meleeYOYO: Math.fround(4.2),
      critical: 1,
    });
    expect(jobs[1]).toMatchObject({ name: 'JOB_MERCENARY', attackSpeed: 80, factorDef: Math.fround(1.35), blocking: Math.fround(0.8) });
  });

  it('stores the floats as C floats: 0.9 is the float nearest to it, not the double', () => {
    const [vagrant] = readPropJob(script(VAGRANT));
    expect(vagrant!.factorMaxHP).toBe(Math.fround(0.9));
    expect(vagrant!.factorMaxHP).not.toBe(0.9);
  });

  it('indexes the jobs by row, and checks the names against the defines when it is given them', () => {
    const defines = new Map([
      ['JOB_VAGRANT', 0],
      ['JOB_MERCENARY', 1],
    ]);
    expect(readPropJob(script(VAGRANT, MERCENARY), 'propJob.inc', defines).map((j) => j.name)).toEqual([
      'JOB_VAGRANT',
      'JOB_MERCENARY',
    ]);
    // the C++ indexes by the value of the define; a row out of order would land in another slot
    const swapped = thrown(() => readPropJob(script(MERCENARY, VAGRANT), 'propJob.inc', defines));
    expect(swapped.message).toContain('JOB_MERCENARY');
    expect(swapped.line).toBe(1);
    const unknown = thrown(() => readPropJob(script(VAGRANT.replace('JOB_VAGRANT', 'JOB_MISSING')), 'propJob.inc', defines));
    expect(unknown.message).toContain('JOB_MISSING');
  });

  it('accepts a job written as its number when the number is the row', () => {
    const jobs = readPropJob(script(VAGRANT.replace('JOB_VAGRANT', '0'), MERCENARY.replace('JOB_MERCENARY', '1')));
    expect(jobs.map((j) => j.name)).toEqual(['0', '1']);
    thrown(() => readPropJob(script(MERCENARY.replace('JOB_MERCENARY', '1'))));
  });

  it('returns nothing for a file of comments', () => {
    expect(readPropJob(HEADER)).toEqual([]);
    expect(readPropJob('')).toEqual([]);
  });

  it('throws a FormatError for a row that stops early or holds a word where a float goes', () => {
    const cut = thrown(() => readPropJob(script(VAGRANT.split(/\s+/).slice(0, 10).join(' ')), 'propJob.inc'));
    expect(cut.file).toBe('propJob.inc');
    expect(cut.message).toContain('end of the script');
    const word = thrown(() => readPropJob(script(VAGRANT.replace('0.9', 'ninety'))));
    expect(word.message).toContain('ninety');
    thrown(() => readPropJob(script(VAGRANT.replace('JOB_VAGRANT', '='))));
  });
});

describe('readExpTable', () => {
  // ExpTable.inc as shipped: the expCharacter block (row = level, `nExp1 nExp2 dwLPPoint nLimitExp`), then other blocks
  const EXP = script(
    'expCharacter // 1 based',
    '{',
    '//\tEXP\tPXP\tGP\tLim EXP\tlevel',
    '\t0 \t0\t0\t0 \t  //0 - not used',
    '\t0 \t1\t0\t16 \t  //1',
    '\t14 \t1\t2\t18 \t  //2',
    '\t20 \t2\t2\t21 \t  //3',
    '\t369857717768 \t6520498\t2\t10187103688 \t  //199',
    '}',
    '',
    'expLPPoint // 0 based',
    '{',
    '0     //  1',
    '1     //  2',
    '}',
  );

  it('reads the rows of the expCharacter block, row index = level, the 64-bit columns as bigint', () => {
    const rows = readExpTable(EXP, 'ExpTable.inc');
    expect(rows).toEqual([
      { exp1: 0n, exp2: 0n, lpPoint: 0, limitExp: 0n },
      { exp1: 0n, exp2: 1n, lpPoint: 0, limitExp: 16n },
      { exp1: 14n, exp2: 1n, lpPoint: 2, limitExp: 18n },
      { exp1: 20n, exp2: 2n, lpPoint: 2, limitExp: 21n },
      // past 2^32: the 64-bit columns (EXPINTEGER) hold it
      { exp1: 369857717768n, exp2: 6520498n, lpPoint: 2, limitExp: 10187103688n },
    ]);
  });

  it('finds the block after others, and leaves the blocks after it alone', () => {
    const text = script('expFlight', '{', '1 2 3', '}', 'expJobLevel', '{', '1 15', '}', EXP);
    expect(readExpTable(text)).toHaveLength(5);
    // the other blocks' numbers are not rows
    expect(readExpTable(script('expLPPoint', '{', '0', '1', '}', 'expCharacter', '{', '5 6 7 8', '}'))).toEqual([
      { exp1: 5n, exp2: 6n, lpPoint: 7, limitExp: 8n },
    ]);
  });

  it('gives an empty table for an empty block', () => {
    expect(readExpTable(script('expCharacter', '{', '}'))).toEqual([]);
  });

  it('throws a FormatError for a file without an expCharacter block, a row that stops early, or too many rows', () => {
    const none = thrown(() => readExpTable(script('expLPPoint', '{', '0', '}'), 'ExpTable.inc'));
    expect(none.file).toBe('ExpTable.inc');
    expect(none.message).toContain('expCharacter');
    thrown(() => readExpTable(script('expCharacter', '{', '1 2 3', '}')));
    thrown(() => readExpTable(script('expCharacter', '{', '1 2 3 4')));
    const rows = Array.from({ length: 201 }, () => '1 1 1 1');
    const many = thrown(() => readExpTable(script('expCharacter', '{', ...rows, '}')));
    expect(many.message).toContain('200'); // MAX_EXPCHARACTER
  });

  it('reads "=" as NULL_ID, as the C++ does (unsigned in the 64-bit columns)', () => {
    expect(readExpTable(script('expCharacter', '{', '= = = =', '}'))).toEqual([
      { exp1: 4294967295n, exp2: 4294967295n, lpPoint: -1, limitExp: 4294967295n },
    ]);
  });
});

describe('readTextClient', () => {
  const INC = script(
    '// textClient.inc : Multi language text',
    '',
    'TID_BLANK 0xffffffff',
    '{',
    '\tIDS_TEXTCLIENT_INC_000000',
    '}',
    '',
    'TID_GAME_LEVELUP 0xffccffcc',
    '{',
    '\tIDS_TEXTCLIENT_INC_000155',
    '}',
    'TID_GAME_DEATH\t0xff00ffff',
    '{',
    '\tIDS_TEXTCLIENT_INC_000156',
    '}',
  );
  const STRINGS = new Map([
    ['IDS_TEXTCLIENT_INC_000000', ''],
    ['IDS_TEXTCLIENT_INC_000155', 'Level up! You can increase your stats in your character window.'],
    ['IDS_TEXTCLIENT_INC_000156', 'You have died.'],
  ]);

  it('reads TID name -> text (through the string table) and ARGB colour, unsigned, in file order', () => {
    const texts = readTextClient(INC, STRINGS, 'textClient.inc');
    expect([...texts.keys()]).toEqual(['TID_GAME_LEVELUP', 'TID_GAME_DEATH']);
    expect(texts.get('TID_GAME_DEATH')).toEqual({ id: 'TID_GAME_DEATH', text: 'You have died.', color: 0xff00ffff });
    expect(texts.get('TID_GAME_LEVELUP')).toEqual({
      id: 'TID_GAME_LEVELUP',
      text: 'Level up! You can increase your stats in your character window.',
      color: 0xffccffcc,
    });
    expect(texts.get('TID_GAME_DEATH')!.color).toBe(4278255615); // not the signed -16711681 GetNumber returns
  });

  it('leaves out a text that is empty, as the C++ does (GetText gives "" and GetTextColor 0 for it)', () => {
    expect(readTextClient(INC, STRINGS).has('TID_BLANK')).toBe(false);
  });

  it('takes the double quotes out of a text, and reads a quoted text as it is', () => {
    const strings = new Map([['IDS_Q', 'Say "hello" now']]);
    const inc = script('TID_A 0xffffffff', '{', 'IDS_Q', '}', 'TID_B 0xff0000ff', '{', '"Plain text"', '}');
    const texts = readTextClient(inc, strings);
    expect(texts.get('TID_A')!.text).toBe('Say hello now');
    expect(texts.get('TID_B')).toEqual({ id: 'TID_B', text: 'Plain text', color: 0xff0000ff });
  });

  it('keeps the last of a repeated TID name', () => {
    const inc = script('TID_A 0xffffffff', '{', '"first"', '}', 'TID_A 0xff000000', '{', '"second"', '}');
    expect(readTextClient(inc, new Map()).get('TID_A')).toEqual({ id: 'TID_A', text: 'second', color: 0xff000000 });
  });

  it('returns nothing for a file of comments', () => {
    expect(readTextClient(script('// nothing'), STRINGS).size).toBe(0);
  });

  it('throws a FormatError, with the file and line, for a missing brace, text or colour, or a string key the table lacks', () => {
    const brace = thrown(() => readTextClient(script('TID_A 0xffffffff', 'IDS_TEXTCLIENT_INC_000155'), STRINGS, 'textClient.inc'));
    expect(brace.file).toBe('textClient.inc');
    expect(brace.message).toContain('TID_A');
    thrown(() => readTextClient(script('TID_A 0xffffffff', '{'), STRINGS));
    thrown(() => readTextClient(script('TID_A', '{', '"x"', '}'), STRINGS));
    // a string key the table lacks: the C++ would show the key as the text
    const missing = thrown(() => readTextClient(script('TID_A 0xffffffff', '{', 'IDS_TEXTCLIENT_INC_999999', '}'), STRINGS));
    expect(missing.message).toContain('IDS_TEXTCLIENT_INC_999999');
    expect(missing.line).toBe(3);
  });
});

describe('readTexturePack', () => {
  // DmgEffect.inc as shipped: a long comment holding the older blocks, then the active one
  const DMG = script(
    '// number comment',
    '// serialize comment',
    '/*',
    'number 41',
    'texture "sfx\\DmgEffect.tga" 0x00000000',
    'serialize 10 32 32 0  0 0 0',
    'pos 96 32 0 128',
    '*/',
    'number 28',
    'texture "sfx\\DmgEffect.dds" 0x00000000',
    'serialize 10 50 50 0  0 0 0',
    'pos 200 50 0   50 n',
    'pos 200 50 200 50 n',
    'pos 300 50 400 50 n',
    'pos 250 50 700 50 n',
    'serialize 10 50 50 0 128 0 0',
    'pos 200 178 0   178 n',
    'pos 200 178 200 178 n',
    'pos 300 178 400 178 n',
    'pos 250 178 700 178 n',
  );

  it('reads the texture, its colour key and the frames: serialize rows, then pos rectangles, in order', () => {
    const pack = readTexturePack(DMG, 'DmgEffect.inc');
    expect(pack.texture).toBe('sfx\\DmgEffect.dds'); // as written
    expect(pack.colorKey).toBe(0);
    expect(pack.frames).toHaveLength(28);
    expect(pack.frames[0]).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(pack.frames[9]).toEqual({ x: 450, y: 0, w: 50, h: 50 });
    expect(pack.frames[10]).toEqual({ x: 0, y: 50, w: 200, h: 50 }); // pos w h x y
    expect(pack.frames[13]).toEqual({ x: 700, y: 50, w: 250, h: 50 });
    expect(pack.frames[14]).toEqual({ x: 0, y: 128, w: 50, h: 50 });
    expect(pack.frames[23]).toEqual({ x: 450, y: 128, w: 50, h: 50 });
    expect(pack.frames[24]).toEqual({ x: 0, y: 178, w: 200, h: 178 });
  });

  // icon_target.inc: the colour key is magenta, the cells flip with n, h, v, hv
  const TARGET = script(
    'number 4',
    'texture "icon\\icon_target.dds" 0xffff00ff',
    '',
    'pos 32 32 0 0 n ',
    'pos 32 32 0 0 h ',
    'pos 32 32 32 0 v ',
    'pos 32 32 32 32 hv',
  );

  it('keeps the flip a pos block asks for (h, v, hv), and nothing for n', () => {
    const pack = readTexturePack(TARGET, 'icon_target.inc');
    expect(pack.texture).toBe('icon\\icon_target.dds');
    expect(pack.colorKey).toBe(0xffff00ff);
    expect(pack.frames).toEqual([
      { x: 0, y: 0, w: 32, h: 32 },
      { x: 0, y: 0, w: 32, h: 32, flip: 'h' },
      { x: 32, y: 0, w: 32, h: 32, flip: 'v' },
      { x: 32, y: 32, w: 32, h: 32, flip: 'hv' },
    ]);
  });

  it('takes the token after a pos block for its flip whatever it is (a pos without one loses the next word)', () => {
    // CTexturePack::LoadScript calls GetToken after y and does not put it back
    const pack = readTexturePack(script('number 2', 'texture "a.dds" 0x0', 'pos 4 4 0 0', 'pos 4 4 8 0 n', 'pos 4 4 16 0'));
    expect(pack.frames).toEqual([
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 16, y: 0, w: 4, h: 4 },
    ]);
  });

  it('lays a serialize block out left to right, then down, in the width of the texture when it is given', () => {
    const text = script('number 7', 'texture "a.dds" 0x0', 'serialize 7 40 30 10 5 0 0');
    // 100 x 100: x = 10, 50, 90 on the rows y = 5, 35, 65
    expect(readTexturePack(text, 'a.inc', { width: 100, height: 100 }).frames).toEqual([
      { x: 10, y: 5, w: 40, h: 30 },
      { x: 50, y: 5, w: 40, h: 30 },
      { x: 90, y: 5, w: 40, h: 30 },
      { x: 10, y: 35, w: 40, h: 30 },
      { x: 50, y: 35, w: 40, h: 30 },
      { x: 90, y: 35, w: 40, h: 30 },
      { x: 10, y: 65, w: 40, h: 30 },
    ]);
    // without a size the texture is taken wide enough: one row
    expect(readTexturePack(text).frames.map((f) => [f.x, f.y])).toEqual([
      [10, 5],
      [50, 5],
      [90, 5],
      [130, 5],
      [170, 5],
      [210, 5],
      [250, 5],
    ]);
  });

  it('stops a serialize block at the bottom of the texture', () => {
    const text = script('number 9', 'texture "a.dds" 0x0', 'serialize 9 50 50 0 0 0 0');
    expect(readTexturePack(text, 'a.inc', { width: 100, height: 100 }).frames).toHaveLength(4);
  });

  it('skips a word it does not know and the comments, and returns no frames for a script without any', () => {
    expect(readTexturePack(script('// nothing', 'number 0', 'texture "a.dds" 0x1')).frames).toEqual([]);
    expect(readTexturePack(script('MULTI_LANGUAGE', 'number 1', 'texture "a.dds" 0x1', 'what', 'pos 1 2 3 4 n')).frames).toEqual([
      { x: 3, y: 4, w: 1, h: 2 },
    ]);
    expect(readTexturePack('').texture).toBe('');
  });

  it('throws a FormatError for more frames than number, a frame before number, or a block it does not read', () => {
    const over = thrown(() => readTexturePack(script('number 1', 'texture "a.dds" 0x0', 'pos 1 1 0 0 n', 'pos 1 1 1 0 n'), 'x.inc'));
    expect(over.file).toBe('x.inc');
    expect(over.line).toBe(4);
    expect(over.message).toContain('number');
    thrown(() => readTexturePack(script('number 2', 'texture "a.dds" 0x0', 'serialize 3 4 4 0 0 0 0')));
    thrown(() => readTexturePack(script('texture "a.dds" 0x0', 'pos 1 1 0 0 n')));
    const data = thrown(() => readTexturePack(script('number 1', 'texture "a.dds" 0x0', 'data 8 8 0 0 8 0 0 8 8 8')));
    expect(data.message).toContain('data');
    thrown(() => readTexturePack(script('number 1', 'texture "a.dds" 0x0', 'datauv 8 8 0 0 1 0 0 1 1 1')));
    thrown(() => readTexturePack(script('number 1', 'texture "a.dds" 0x0', 'pos 1 1 0')));
  });

  it('throws for a serialize block whose tiles have no size (the C++ would never leave the loop)', () => {
    thrown(() => readTexturePack(script('number 1', 'texture "a.dds" 0x0', 'serialize 1 0 4 0 0 0 0'), 'x.inc', { width: 8, height: 8 }));
  });
});

describe('readPropSkillAdd', () => {
  // propSkillAdd.csv as shipped: two comment lines (the column names), then one comma-separated row per skill level, CRLF.
  // The first rows are Clean Hit's; the last two are other skills with a cost in MP and a cool-down of their own.
  const COMMENTS = ['//id,name,level,...', '//dwID,dwName,dwSkillLvl,dwAbilityMin,...'];
  const CLEAN_HIT_1 = 'SA_CLEANHIT_L01,SI_VAG_ONE_CLEANHIT,1,10,11,=,=,150,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,5,=,=,=,=,=,=,=,4,0,600';
  const CLEAN_HIT_5 = 'SA_CLEANHIT_L05,SI_VAG_ONE_CLEANHIT,5,12,13,=,=,150,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,8,=,=,=,=,=,=,=,3,0,600';
  const PREVENTION_1 = 'SA_PREVENTION_L01,SI_ASS_HEAL_PREVENTION,1,=,=,=,=,=,=,=,=,=,DST_AUTOHP,=,10,=,15,=,=,=,=,=,=,=,35,=,480000,1000,=,=,=,600000,=,1,1,600';
  const SONICHAND_1 = 'SA_SONICHAND_L01,SI_BIL_KNU_SONICHAND,1,116,117,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,=,60,=,2000,=,=,=,=,7,1,25,600';
  const DEFINES = new Map([
    ['SA_CLEANHIT_L01', 5], ['SA_CLEANHIT_L05', 9], ['SA_PREVENTION_L01', 4000], ['SA_SONICHAND_L01', 3000],
    ['SI_VAG_ONE_CLEANHIT', 1], ['SI_ASS_HEAL_PREVENTION', 70], ['SI_BIL_KNU_SONICHAND', 200], ['DST_AUTOHP', 111],
  ]);
  const FILE = script(...COMMENTS, CLEAN_HIT_1, CLEAN_HIT_5, PREVENTION_1, SONICHAND_1);

  it('reads the row id and skill through the defines, the level, the MP and FP cost, the cool-down and the hit count, in file order', () => {
    const rows = readPropSkillAdd(FILE, DEFINES, new Map(), 'propSkillAdd.csv');
    expect(rows).toEqual([
      { id: 5, skill: 1, level: 1, reqMp: -1, reqFp: 5, cooldown: -1, skillCount: -1 },
      { id: 9, skill: 1, level: 5, reqMp: -1, reqFp: 8, cooldown: -1, skillCount: -1 },
      { id: 4000, skill: 70, level: 1, reqMp: 35, reqFp: -1, cooldown: 480000, skillCount: -1 },
      { id: 3000, skill: 200, level: 1, reqMp: -1, reqFp: 60, cooldown: -1, skillCount: 7 },
    ]);
  });

  it('gives a level with no cool-down the dwSkillReady of its skill (LoadPropAddSkill, Project.cpp:2587-2596), and leaves the others', () => {
    const skills = new Map([[1, { skillReady: 3000 }], [70, { skillReady: 1 }]]);
    const rows = readPropSkillAdd(FILE, DEFINES, skills);
    // Clean Hit has a skillReady and no cool-down of its own; Prevention has its own; the skill the table does not have none
    expect(rows.map((row) => row.cooldown)).toEqual([3000, 3000, 480000, -1]);
    // a skill whose own dwSkillReady is `=` passes that on
    expect(readPropSkillAdd(FILE, DEFINES, new Map([[1, { skillReady: -1 }]]))[0]!.cooldown).toBe(-1);
  });

  it('reads the text as CScanner does in comma mode: cells split at commas and the end of a line, white space trimmed, comments skipped', () => {
    const spaced = CLEAN_HIT_1.replace('SA_CLEANHIT_L01,SI_VAG_ONE_CLEANHIT,1,', ' SA_CLEANHIT_L01 , SI_VAG_ONE_CLEANHIT ,  1  ,');
    const text = [
      '// a comment',
      '/* a block',
      'comment */',
      spaced,
      '',
      '// another comment between rows',
      CLEAN_HIT_5,
      '   ',
    ].join('\r\n');
    const rows = readPropSkillAdd(text, DEFINES, new Map());
    expect(rows.map((row) => [row.id, row.level, row.reqFp])).toEqual([[5, 1, 5], [9, 5, 8]]);
    // the last row needs no line end
    expect(readPropSkillAdd(CLEAN_HIT_1, DEFINES, new Map()).map((row) => row.id)).toEqual([5]);
  });

  it('reads a number as GetNumber( TRUE ) does: = is NULL_ID, a minus sign belongs to the number, an empty cell is 0', () => {
    const negative = CLEAN_HIT_1.replace(',=,5,=,=,', ',-3,5,=,=,'); // nReqMp -3
    expect(readPropSkillAdd(negative, DEFINES, new Map())[0]!.reqMp).toBe(-3);
    const cells = CLEAN_HIT_1.split(',');
    cells[24] = ' '; // nReqMp: a cell with nothing in it, which the scanner reads as 0
    cells[25] = '+7'; // nReqFp: a plus sign is read as the number's
    const odd = readPropSkillAdd(cells.join(','), DEFINES, new Map())[0]!;
    expect([odd.reqMp, odd.reqFp]).toEqual([0, 7]);
  });

  it('keeps a repeated id each time, in file order (CFixedArray::SetAtGrow keeps the last)', () => {
    const rows = readPropSkillAdd(script(CLEAN_HIT_1, CLEAN_HIT_1.replace(',5,=,=,', ',6,=,=,')), DEFINES, new Map());
    expect(rows.map((row) => [row.id, row.reqFp])).toEqual([[5, 5], [5, 6]]);
  });

  it('returns nothing for a file of comments or an empty one', () => {
    expect(readPropSkillAdd(script(...COMMENTS), DEFINES, new Map())).toEqual([]);
    expect(readPropSkillAdd('', DEFINES, new Map())).toEqual([]);
  });

  it('throws a FormatError for a name that is not defined, a row that stops early, and a row id of 0 before the end', () => {
    const unknown = thrown(() => readPropSkillAdd(script(...COMMENTS, CLEAN_HIT_1.replace('SI_VAG_ONE_CLEANHIT', 'SI_NOT_THERE')), DEFINES, new Map(), 'propSkillAdd.csv'));
    expect(unknown.file).toBe('propSkillAdd.csv');
    expect(unknown.line).toBe(3);
    expect(unknown.message).toContain('SI_NOT_THERE');
    expect(unknown.message).toContain('dwName');

    const cut = thrown(() => readPropSkillAdd(CLEAN_HIT_1.split(',').slice(0, 30).join(','), DEFINES, new Map(), 'propSkillAdd.csv'));
    expect(cut.message).toContain('end of the script');

    // the C++ stops reading at a row whose id is 0 and ignores the rest of the file: here that is an error
    const zero = thrown(() => readPropSkillAdd(script(CLEAN_HIT_1, '0,0,0', CLEAN_HIT_5), DEFINES, new Map(), 'propSkillAdd.csv'));
    expect(zero.line).toBe(2);
    expect(zero.message).toContain('0');
  });
});
