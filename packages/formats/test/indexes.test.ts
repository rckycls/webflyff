import { describe, expect, it } from 'vitest';
import { ResPacks, loadDefines, modelFileName, readModelIndex, readTerrainIndex, readWld } from '../src/index';
import type { ModelElem } from '../src/index';
import { buildPack } from './helpers/packs';
import { thrown } from './helpers/thrown';

/** Script text with the CRLF line ends the shipped files use. */
function script(...lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

const bytes = (text: string): number[] => Array.from(new TextEncoder().encode(text));

describe('loadDefines', () => {
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
          // CP949: the first line is a comment holding the two bytes b0 a1 of one Korean character
          { name: 'define.h', data: [...bytes('// '), 0xb0, 0xa1, ...bytes(script('', '#define A 1', '#define B 2'))] },
          { name: 'language.h', data: bytes(script('#define NOT_A_DEFINE_HEADER 9')) },
          { name: 'Lang.H', data: bytes(script('#define LANG_X 5')) },
          { name: 'Terrain.inc', data: bytes(script('#define NOT_A_HEADER_EITHER 9')) },
          { name: 'defineFlash', data: bytes(script('#define NOT_A_HEADER_NO_DOT_H 9')) },
        ],
      }),
    },
    {
      file: 'dataSub1.res',
      bytes: buildPack({
        key: 9,
        encrypted: false,
        files: [
          { name: 'defineItem.h', data: bytes(script('#define B 3', '#define II_X A')) },
          { name: 'DEFINEWORLD.H', data: utf16(script('#define WI_ONE 1')) },
          { name: 'definequest.h', data: bytes(script('#define QUEST_X (A | 4)')) },
          { name: 'ResData.h', data: bytes(script('#define APP_X 6')) },
          { name: 'wndstyle.h', data: bytes(script('#define WND_X 7')) },
        ],
      }),
    },
  ]);

  it('merges every define*.h of the packs, and lang.h, ResData.h and WndStyle.h, in pack order, and nothing else', () => {
    expect(Object.fromEntries(loadDefines(packs))).toEqual({
      A: 1,
      B: 2, // the first definition wins, as in CScript's map::insert
      II_X: 1, // resolved through a define of an earlier header
      WI_ONE: 1, // a header is decoded by its own encoding
      QUEST_X: 5,
      LANG_X: 5, // CProject::LoadDefines also loads these three (ProjectCmn.cpp:708-734)
      APP_X: 6,
      WND_X: 7,
    });
  });
});

describe('readWld', () => {
  // WdMadrigal.wld, as shipped.
  const MADRIGAL = script(
    '// World script',
    '',
    'size 30, 30',
    'indoor 0',
    'ambient 0x808080',
    'bgColor 0xffe0e0ff',
    'fly 1',
    'camera 5063.999 240.888 4095.910  0.393  0.191 ',
    'revival 0 "" ',
    'diffuse 0x0',
    'lightDir  0.000  0.000  0.000 ',
    'fogSetting 70.000 400.000  0.000 ',
    'bgm 0 ',
    'pkmode 4194304 ',
    'MPU 4 ',
    'sky default default default',
    'cloud default default default',
    'sun default',
    'moon default',
  );

  it('reads every field of a world header', () => {
    const w = readWld(MADRIGAL);
    expect(w.size).toEqual([30, 30]);
    expect(w.mpu).toBe(4);
    expect(w.indoor).toBe(false);
    expect(w.fly).toBe(true);
    expect(w.ambient).toBe(0x808080);
    expect(w.bgColor).toBe(0xffe0e0ff); // unsigned: the high byte is not a sign
    expect(w.diffuse).toBe(0);
    expect(w.lightDir).toEqual([0, 0, 0]);
    expect(w.fog).toEqual({ start: 70, end: 400, density: 0 });
    expect(w.camera.position[0]).toBeCloseTo(5063.999, 3);
    expect(w.camera.position[1]).toBeCloseTo(240.888, 3);
    expect(w.camera.position[2]).toBeCloseTo(4095.91, 3);
    expect(w.camera.angle).toBeCloseTo(0.393, 3);
    expect(w.camera.angleX).toBeCloseTo(0.191, 3);
    expect(w.bgm).toBe(0);
    expect(w.pkMode).toBe(4194304);
  });

  it('reads the other kinds of value: signed floats, 32-bit hex, non-zero flags', () => {
    const w = readWld(
      script('indoor 1', 'fly 0', 'ambient 0xff808080', 'diffuse 0xfffa6400', 'lightDir -0.5 0.25 -1', 'bgm 12'),
    );
    expect(w.indoor).toBe(true);
    expect(w.fly).toBe(false);
    expect(w.ambient).toBe(0xff808080);
    expect(w.diffuse).toBe(0xfffa6400);
    expect(w.lightDir).toEqual([-0.5, 0.25, -1]);
    expect(w.bgm).toBe(12);
  });

  // CWorld's constructor (World.cpp:75) and OpenWorld supply these when a keyword is missing.
  it('gives a file with no keywords the C++ defaults', () => {
    const w = readWld(script('// World script'));
    expect(w.size).toEqual([0, 0]);
    expect(w.mpu).toBe(4); // OLD_MPU
    expect(w.indoor).toBe(false);
    expect(w.fly).toBe(true);
    expect(w.ambient).toBe(0xff808080);
    expect(w.diffuse).toBe(0);
    expect(w.lightDir).toEqual([0, 0, 0]);
    expect(w.fog).toEqual({ start: 70, end: 400, density: 0 });
    expect(w.bgm).toBe(0);
    expect(w.pkMode).toBe(0);
  });

  // The do { GetToken } while loop looks at one token at a time, so a word it does not know costs one token.
  it('skips tokens it does not know one at a time, even when they sit before a keyword', () => {
    const w = readWld('mystery 1 2 fly 0 indoor 1');
    expect(w.fly).toBe(false); // "mystery", "1" and "2" are each skipped alone; the keyword after them still counts
    expect(w.indoor).toBe(true);
  });

  it('matches keywords case-sensitively, like CString ==', () => {
    const w = readWld('Fly 0 SIZE 9, 9');
    expect(w.fly).toBe(true);
    expect(w.size).toEqual([0, 0]);
  });

  it('lets a later keyword replace an earlier one', () => {
    expect(readWld('fly 1 fly 0').fly).toBe(false);
  });

  it('reads the separator after the width as one token of any kind, like GetToken in OpenWorld', () => {
    expect(readWld('size 5, 6').size).toEqual([5, 6]);
    expect(readWld('size 5 : 6').size).toEqual([5, 6]);
  });

  // revival, sky, cloud, sun, moon, use24light and seacloud are read by OpenWorld but are not in WorldInfo.
  // They are consumed exactly as the C++ does, so what follows them is still read.
  it('consumes the keywords WorldInfo leaves out, taking their arguments as the C++ does', () => {
    const w = readWld(
      script(
        'revival 208 "fly"',
        'sky a fly 1',
        'cloud indoor 1 b',
        'sun fly',
        'moon fly',
        'use24light 1',
        'seacloud fly',
        'size 3, 3',
      ),
    );
    expect(w.size).toEqual([3, 3]);
    expect(w.fly).toBe(true); // every "fly" above was an argument, not a keyword
    expect(w.indoor).toBe(false);
  });

  it('reads bgColor and camera, which the editor writes and OpenWorld skips', () => {
    const w = readWld('bgColor 0xff112233 camera 1 2 3 0.5 0.25');
    expect(w.bgColor).toBe(0xff112233);
    expect(w.camera).toEqual({ position: [1, 2, 3], angle: 0.5, angleX: 0.25 });
  });

  it('throws a FormatError naming the file and the token when a value is missing or malformed', () => {
    const e1 = thrown(() => readWld('fly 1\r\nambient oops', 'Broken.wld'));
    expect(e1.file).toBe('Broken.wld');
    expect(e1.line).toBe(2);
    expect(e1.unit).toBe('char');
    thrown(() => readWld('size 30', 'Short.wld')); // the height is missing
    thrown(() => readWld('fogSetting 70 400', 'Short.wld')); // the density is missing
    thrown(() => readWld('lightDir 0 0 x', 'Bad.wld'));
    thrown(() => readWld('camera 1 2 3', 'Short.wld'));
    thrown(() => readWld('revival 1', 'Short.wld')); // the key is missing
    thrown(() => readWld('revival 1 "unterminated', 'Bad.wld'));
  });
});

describe('readTerrainIndex', () => {
  const TERRAIN = script(
    '// Terrain Script',
    '',
    '"DarkRartesia" 0',
    '{',
    '  259 0 "DarkRartesiaBossTile_02.dds" 0 ""',
    '  258 0 "DarkRartesiaBossTile_01.dds" 1 "step.wav"',
    '}',
    '"water" 2',
    '{',
    '  "w1" 3',
    '  {',
    '    20 0 "a.dds" 0 ""',
    '    21 0 "b.dds" 0 ""',
    '    22 0 "c.dds" 0 ""',
    '  }',
    '  "w2" 2',
    '  {',
    '    30 0 "d.dds" 0 ""',
    '    31 0 "e.dds" 0 ""',
    '  }',
    '  11 0 "f.dds" 0 ""',
    '}',
    '"brick" 0',
    '{',
    '  1 0 "brick_MaSa01.dds" 0 ""',
    '}',
    '0 0 "default.dds" 0 ""',
  );

  it('reads ids and file names from folders, water lists and the entry after the last folder', () => {
    const { textures } = readTerrainIndex(TERRAIN, new Map());
    expect([...textures.keys()].sort((a, b) => a - b)).toEqual([0, 1, 11, 20, 21, 22, 30, 31, 258, 259]);
    expect(textures.get(259)).toEqual({ id: 259, file: 'DarkRartesiaBossTile_02.dds' });
    expect(textures.get(258)).toEqual({ id: 258, file: 'DarkRartesiaBossTile_01.dds' }); // block and sound are not kept
    expect(textures.get(22)).toEqual({ id: 22, file: 'c.dds' });
    expect(textures.get(11)).toEqual({ id: 11, file: 'f.dds' });
    expect(textures.get(0)).toEqual({ id: 0, file: 'default.dds' });
  });

  it('takes waterFrames from the count on the folder header, and 0 when no folder has one', () => {
    expect(readTerrainIndex(TERRAIN, new Map()).waterFrames).toBe(2);
    expect(readTerrainIndex(script('"rock" 0', '{', '  3 0 "r.dds" 0 ""', '}'), new Map()).waterFrames).toBe(0);
  });

  it('keeps a non-zero count on an entry as frames', () => {
    const text = script('"x" 0', '{', '  7 3 "w.dds" 0 ""', '  8 0 "v.dds" 0 ""', '}');
    const { textures } = readTerrainIndex(text, new Map());
    expect(textures.get(7)).toEqual({ id: 7, file: 'w.dds', frames: 3 });
    expect(textures.get(8)).toEqual({ id: 8, file: 'v.dds' });
  });

  it('lets a later entry with the same id replace the earlier one, like m_aTerrain[i]', () => {
    const text = script('"x" 0', '{', '  5 0 "a.dds" 0 ""', '  5 0 "b.dds" 0 ""', '}');
    const { textures } = readTerrainIndex(text, new Map());
    expect(textures.get(5)?.file).toBe('b.dds');
  });

  it('accepts empty folders, folder names in any script, and a file with nothing but a comment', () => {
    const text = script('"empty" 0', '{', '}', '"물1" 0', '{', '  4 0 "k.dds" 0 ""', '}', '"also empty" 0', '{', '}');
    expect([...readTerrainIndex(text, new Map()).textures.keys()]).toEqual([4]);
    const none = readTerrainIndex(script('// Terrain Script'), new Map());
    expect(none.textures.size).toBe(0);
    expect(none.waterFrames).toBe(0);
  });

  it('resolves a define used as an id', () => {
    const text = script('"x" 0', '{', '  TERRAIN_SAND 0 "s.dds" 0 ""', '}');
    const { textures } = readTerrainIndex(text, new Map([['TERRAIN_SAND', 77]]));
    expect(textures.get(77)?.file).toBe('s.dds');
  });

  it('throws a FormatError, naming the file, when the text is cut short or does not fit the layout', () => {
    const bad = (text: string) => thrown(() => readTerrainIndex(text, new Map(), 'Terrain.inc'));
    expect(bad(script('"x" 0', '{', '  1 0 "a.dds" 0')).file).toBe('Terrain.inc'); // sound missing
    bad(script('"x" 0', '{', '  1 0 "a.dds" 0 ""')); // no closing brace
    bad(script('"x" 0', '{')); // no closing brace
    bad(script('"x" 0')); // no opening brace
    bad(script('}')); // stray closing brace
    bad(script('"x" 0', '{', '  1 0 "a.dds" 0 ""', '}', '}')); // one closing brace too many
    bad(script('"x" 0', '{', '  1 0 a.dds 0 ""', '}')); // the file name is not a string
    // a header inside a water list is a fourth level
    const deeper = ['"x" 0', '{', '  "w" 1', '  {', '    "deeper" 1', '    {', '      1 0 "a.dds" 0 ""', '    }', '  }', '}'];
    bad(script(...deeper));
    bad(script('"x" 0', '{', '  1 0 "a.dds" 0 "', '}')); // unterminated string
  });

  it('throws when a water list does not hold as many entries as its header says', () => {
    const text = script(
      '"water" 1',
      '{',
      '  "w1" 3',
      '  {',
      '    20 0 "a.dds" 0 ""',
      '    21 0 "b.dds" 0 ""',
      '  }',
      '}',
    );
    const err = thrown(() => readTerrainIndex(text, new Map(), 'Terrain.inc'));
    expect(err.message).toContain('3');
    expect(err.line).toBe(3);
  });
});

describe('readModelIndex', () => {
  const DEFINES = new Map([
    ['MODELTYPE_MESH', 1],
    ['MODELTYPE_ANIMATED_MESH', 2],
    ['MODELTYPE_BILLBOARD', 3],
    ['MODELTYPE_SFX', 4],
    ['MD_NEAR', 1],
    ['MD_MID', 2],
    ['MD_FAR', 3],
    ['ATEX_NONE', 0],
    ['CI_CHEST01', 1100],
    ['II_ARM_M_KIN_HELMET_SET_34', 4034],
    ['MI_INFO_PENG', 5001],
    ['MI_MAFL_MARCHE', 5002],
    ['MTI_IDLE1', 1],
    ['MTI_STAND', 8],
  ]);

  // The shape of mdlObj.inc: one type block, whose entries are grouped in named folders.
  it('reads a type block with folders, as mdlObj.inc lays it out', () => {
    const text = script(
      '// Model Script',
      '"obj" 0',
      '{',
      '  "Rustia"',
      '  {',
      '    "RustiaGate02" 1215 MODELTYPE_MESH "" 0 0 0 1.000000 0 0 0 1',
      '    "RustiaHut02" 1194 MODELTYPE_ANIMATED_MESH "" 0 0 0 1.000000 0 0 0 1',
      '  }',
      '  "EveXmasTree"',
      '  {',
      '    "EveXmasTree2" 1182 MODELTYPE_MESH "" 1 2 3 0.5 4 5 6 7',
      '  }',
      '}',
    );
    const none = { part: '', motions: [] };
    expect(readModelIndex(text, DEFINES)).toEqual([
      { type: 0, id: 1215, name: 'RustiaGate02', modelType: 1, extra: [0, 0, 0, 1, 0, 0, 0, 1], ...none },
      { type: 0, id: 1194, name: 'RustiaHut02', modelType: 2, extra: [0, 0, 0, 1, 0, 0, 0, 1], ...none },
      // extra is bFly, dwDistant, bPick, fScale, bTrans, bShadow, nTextureEx, bRenderFlag
      { type: 0, id: 1182, name: 'EveXmasTree2', modelType: 1, extra: [1, 2, 3, 0.5, 4, 5, 6, 7], ...none },
    ]);
  });

  // The shape of mdlDyna.inc: several type blocks; ids, distances and flags written as define names; floats
  // like 1.0f; comments; and a part name that is a bare word instead of a quoted string.
  it('reads several type blocks, defined names, 1.0f floats, comments and a bare-word part', () => {
    const text = script(
      '/* header',
      '   comment */',
      '"ctrl" 2',
      '{',
      '  "rain"   18 MODELTYPE_BILLBOARD "" 0  MD_NEAR 0  1.0f 0 1 ATEX_NONE 1',
      '  //"star"   23 MODELTYPE_BILLBOARD "" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '  "Chest"   CI_CHEST01 MODELTYPE_ANIMATED_MESH "" 0 MD_FAR 0 1.5f 0 1 ATEX_NONE 1',
      '}',
      '"item" 4',
      '{',
      '  "GenMatSuitbox" II_ARM_M_KIN_HELMET_SET_34 MODELTYPE_MESH mKinSet06Cap 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '}',
    );
    const none = { part: '', motions: [] };
    expect(readModelIndex(text, DEFINES)).toEqual([
      { type: 2, id: 18, name: 'rain', modelType: 3, extra: [0, 1, 0, 1, 0, 1, 0, 1], ...none },
      { type: 2, id: 1100, name: 'Chest', modelType: 2, extra: [0, 3, 0, 1.5, 0, 1, 0, 1], ...none },
      { type: 4, id: 4034, name: 'GenMatSuitbox', modelType: 1, part: 'mKinSet06Cap', extra: [0, 1, 0, 1, 0, 1, 0, 1], motions: [] },
    ]);
  });

  it('skips a motion list after an element and goes on reading', () => {
    const text = script(
      '"mvr" 5',
      '{',
      '  "NPC"',
      '  {',
      '    "InfoPeng" MI_INFO_PENG MODELTYPE_ANIMATED_MESH "" 0 MD_MID 0 2.0f 0 1 ATEX_NONE 1',
      '    {',
      '      "idle1"  MTI_IDLE1',
      '      "stand"  MTI_STAND',
      '    }',
      '    "MaFlMarche" MI_MAFL_MARCHE MODELTYPE_ANIMATED_MESH "" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1',
      '    {',
      '      "stand"  MTI_STAND',
      '    }',
      '  }',
      '  "Plain" 9 MODELTYPE_MESH "" 0 MD_MID 0 1.0f 0 1 ATEX_NONE 1',
      '}',
    );
    const elems = readModelIndex(text, DEFINES);
    expect(elems.map((e) => [e.type, e.id, e.name])).toEqual([
      [5, 5001, 'InfoPeng'],
      [5, 5002, 'MaFlMarche'],
      [5, 9, 'Plain'],
    ]);
    expect(elems[0].extra[3]).toBe(2);
  });

  it('reads entries beside a folder in the same block, and empty folders', () => {
    const text = script(
      '"item" 4',
      '{',
      '  "A" 1 MODELTYPE_MESH "" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '  "Folder"',
      '  {',
      '    "B" 2 MODELTYPE_MESH "" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '  }',
      '  "Empty"',
      '  {',
      '  }',
      '  "C" 3 MODELTYPE_MESH "" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '}',
      '"region" 6',
      '{',
      '  "D" 4 MODELTYPE_MESH "" 0 MD_NEAR 0 1.0f 0 1 ATEX_NONE 1',
      '}',
    );
    expect(readModelIndex(text, DEFINES).map((e) => [e.type, e.id, e.name])).toEqual([
      [4, 1, 'A'],
      [4, 2, 'B'],
      [4, 3, 'C'],
      [6, 4, 'D'],
    ]);
  });

  it('returns nothing for a script with no type blocks, and keeps duplicate ids in file order', () => {
    expect(readModelIndex(script('// Model Script'), DEFINES)).toEqual([]);
    const dup = script(
      '"obj" 0',
      '{',
      '  "First" 5 MODELTYPE_MESH "" 0 0 0 1.0 0 0 0 1',
      '  "Second" 5 MODELTYPE_MESH "" 0 0 0 1.0 0 0 0 1',
      '}',
    );
    // the C++ lets the later one replace the earlier
    expect(readModelIndex(dup, DEFINES).map((e) => e.name)).toEqual(['First', 'Second']);
  });

  it('throws a FormatError for object id 0, which the C++ rejects', () => {
    const text = script('"obj" 0', '{', '  "Zero" 0 MODELTYPE_MESH "" 0 0 0 1.0 0 0 0 1', '}');
    const err = thrown(() => readModelIndex(text, DEFINES, 'mdlObj.inc'));
    expect(err.file).toBe('mdlObj.inc');
    expect(err.line).toBe(3);
    expect(err.message).toContain('Zero');
    expect(err.message).toContain('id 0');
  });

  it('throws a FormatError for a type outside 0..8, a name that is not defined, or text that stops early', () => {
    const entry = '  "E" 1 MODELTYPE_MESH "" 0 0 0 1.0 0 0 0 1';
    const bad = (...lines: string[]) => thrown(() => readModelIndex(script(...lines), DEFINES, 'mdlDyna.inc'));
    expect(bad('"obj" 9', '{', entry, '}').file).toBe('mdlDyna.inc');
    bad('"obj" -1', '{', entry, '}');
    bad('"obj" 0', '{', '  "E" 1 MODELTYPE_MISSING "" 0 0 0 1.0 0 0 0 1', '}');
    bad('"obj" 0', '{', entry); // no closing brace
    bad('"obj" 0', '{', '  "E" 1 MODELTYPE_MESH "" 0 0 0'); // entry cut short
    bad('"obj" 0'); // no opening brace
    // a motion list that never closes
    bad('"obj" 0', '{', '  "E" 2 MODELTYPE_MESH "" 0 0 0 1.0 0 0 0 1', '  {', '    "idle" MTI_IDLE1');
    bad('"obj" 0', '{', '  "E" -3 MODELTYPE_MESH "" 0 0 0 1.0 0 0 0 1', '}'); // negative id
  });
});

describe('modelFileName', () => {
  function elem(type: number, name: string, modelType: number): ModelElem {
    return { type, id: 1, name, modelType, part: '', extra: [], motions: [] };
  }

  // CModelMng::MakeModelName (ModelMng.cpp:63); g_szRoot (ModelMng.cpp:5); MODELTYPE_* are Model.h:10-15.
  it('prefixes the type root and appends .o3d', () => {
    expect(modelFileName(elem(0, 'AzriaThicket01', 0))).toBe('obj_AzriaThicket01.o3d');
    expect(modelFileName(elem(5, 'Aibatt', 2))).toBe('mvr_Aibatt.o3d');
  });

  it('uses the right root for every object type', () => {
    const roots = ['obj', 'ani', 'ctrl', 'sfx', 'item', 'mvr', 'region', 'obj', 'path'];
    roots.forEach((root, type) => {
      expect(modelFileName(elem(type, 'Name', 1))).toBe(`${root}_Name.o3d`);
    });
  });

  it('keeps an sfx name that already has an underscore, and prefixes one that has none', () => {
    expect(modelFileName(elem(3, 'sfx_Fire', 1))).toBe('sfx_Fire.o3d');
    expect(modelFileName(elem(3, 'Fire', 1))).toBe('sfx_Fire.o3d');
  });

  it('adds no .o3d to a MODELTYPE_SFX (4) model', () => {
    expect(modelFileName(elem(3, 'sfx_Fire', 4))).toBe('sfx_Fire');
    expect(modelFileName(elem(3, 'Fire', 4))).toBe('sfx_Fire');
    // the .o3d rule looks at the model type, not the object type
    expect(modelFileName(elem(2, 'Odd', 4))).toBe('ctrl_Odd');
  });

  it('returns a MODELTYPE_BILLBOARD (3) name bare, whatever the object type', () => {
    expect(modelFileName(elem(2, 'rain', 3))).toBe('rain');
    expect(modelFileName(elem(3, 'Fire', 3))).toBe('Fire');
  });

  it('throws a FormatError for an object type with no root', () => {
    thrown(() => modelFileName(elem(9, 'X', 1)));
    thrown(() => modelFileName(elem(-1, 'X', 1)));
  });
});
