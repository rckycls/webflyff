import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  decodeScript,
  loadDefines,
  loadStrings,
  readCharacterInc,
  readDds,
  readExpTable,
  readHonorTitles,
  readModelIndex,
  readPkSetting,
  readPropItem,
  readPropJob,
  readPropMover,
  readStringTable,
  readTextClient,
  readTexturePack,
  readWorldInc,
} from '../src/index';
import { clientRoot, describeClient, loadClientPacks } from './helpers/client';

/** The script with its `//` and block comments blanked (lines kept), for counting with a plain regex. */
function withoutComments(text: string): string {
  return text.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, ' '));
}

/** The data rows of a tab-separated property table: not blank, not a `//` comment line, split at the tabs. */
function tableRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('//'))
    .map((line) => line.split('\t').map((cell) => cell.trim()));
}

describeClient('game data readers on the client packs', () => {
  const packs = loadClientPacks();
  const defines = loadDefines(packs);
  const strings = loadStrings(packs);
  const scriptText = (name: string): string => decodeScript(packs.read(name));

  /** What CScript::GetToken makes of a cell: a string-table text, a #define value, or the cell as it is. */
  const resolve = (cell: string): string => strings.get(cell) ?? cell;
  /** What GetNumber makes of a cell: `=` is NULL_ID (-1), a define its value, otherwise the integer part. */
  const asNumber = (cell: string): number => (cell === '=' ? -1 : (defines.get(cell) ?? parseInt(cell, 10)));
  /** What GetInt64 makes of a cell: `=` is NULL_ID as an unsigned value, otherwise the whole number. */
  const asInt64 = (cell: string): number => (cell === '=' ? 0xffffffff : Number(cell));
  /** What GetFloat makes of a cell, stored in a C float: `=` is -1. */
  const asFloat = (cell: string): number => (cell === '=' ? -1 : Math.fround(parseFloat(cell)));

  it('loadDefines holds the LANG_* of lang.h that character.inc reads', () => {
    expect(defines.get('LANG_KOR')).toBe(0);
    expect(defines.get('LANG_JAP')).toBe(2);
    expect(defines.get('HI_HUNT_MONSTER')).toBe(4);
    expect(defines.get('MONSTER_TITLE_MAX')).toBe(70);
  });

  it('reads every *.txt.txt string table in the packs without error; loadStrings merges the listed ones', () => {
    const names = packs.list().filter((name) => /\.txt\.txt$/i.test(name));
    expect(names.length).toBeGreaterThanOrEqual(20);
    let keys = 0;
    for (const name of names) {
      const text = scriptText(name);
      const table = readStringTable(text, name);
      // an independent reading: the lines that start with IDS, split at the first white space
      const expected = new Map<string, string>();
      for (const line of text.split(/\r?\n/)) {
        const m = /^(IDS\S*)\s*(.*?)\s*$/.exec(line);
        if (m !== null && !expected.has(m[1])) expected.set(m[1], m[2]);
      }
      expect(table.size, name).toBeGreaterThan(0);
      expect([...table], name).toEqual([...expected]);
      keys += table.size;
    }
    console.log(`string tables: ${names.length} files, ${keys} keys; loadStrings merged ${strings.size}`);
    expect(strings.size).toBeGreaterThan(30000);
    expect(strings.get('IDS_PROPMOVER_TXT_000002')).toBe('Male'); // propMover.txt.txt
    expect(strings.get('IDS_CHARACTER_INC_000001')).toBe('Mikyel'); // character.txt.txt is UTF-16LE
    expect(strings.get('IDS_TITLE_TXT_0001')).toBe('Master Collector'); // honorList.txt.txt
  });

  it('propMover.txt: every row is read, ids are unique, MI_MALE and MI_FEMALE have a speed', () => {
    const text = scriptText('propMover.txt');
    const movers = readPropMover(text, defines, strings, 'propMover.txt');
    const rows = tableRows(text);
    expect(movers).toHaveLength(rows.length);
    expect(new Set(movers.map((m) => m.index)).size).toBe(movers.length);

    // the same rows split at the tabs, with the columns found from the header (//dwID szName dwAI ... fSpeed ...)
    const header = text.split(/\r?\n/).find((line) => line.startsWith('//dwID'))!.slice(2).split('\t');
    const col = (name: string): number => header.findIndex((cell) => cell.trim() === name);
    expect(col('szName')).toBe(1);
    expect(col('dwAI')).toBe(2);
    expect(col('fSpeed')).toBe(44);
    expect(col('bFlying')).toBe(46); // the file's name for MoverProp::dwFlying
    rows.forEach((cells, i) => {
      const mover = movers[i];
      expect(cells.length, cells[0]).toBe(rows[0].length); // every row has the same number of columns
      expect(mover.index, cells[0]).toBe(defines.get(cells[0]));
      expect(mover.name, cells[0]).toBe(resolve(cells[1]));
      expect(mover.ai, cells[0]).toBe(defines.get(cells[2]));
      expect(mover.speed, cells[0]).toBeCloseTo(parseFloat(cells[44]) || 0, 6);
      expect(mover.flying, cells[0]).toBe(parseInt(cells[46], 10) === 1);
    });

    // the columns the fight reads, from the same cells; the mismatches are collected so a failure lists them all
    const fightCols = {
      level: col('dwLevel'),
      addHp: col('dwAddHp'),
      expValue: col('dwExpValue'),
      rank: col('dwClass'),
      belligerence: col('dwBelligerence'),
      killable: col('bKillable'),
      hideLevel: col('dwHideLevel'),
      element: col('eElementType'),
      atk1: col('dwAtk1'),
    };
    expect(fightCols).toEqual({
      level: 12,
      addHp: 35,
      expValue: 62,
      rank: 15,
      belligerence: 10,
      killable: 66,
      hideLevel: 43,
      element: 41,
      atk1: 22,
    });
    const wrong: string[] = [];
    rows.forEach((cells, i) => {
      const mover = movers[i];
      for (const key of ['level', 'addHp', 'rank', 'belligerence', 'killable', 'hideLevel', 'element', 'atk1'] as const) {
        if (mover[key] !== asNumber(cells[fightCols[key]])) wrong.push(`${cells[0]}.${key}=${mover[key]} (${cells[fightCols[key]]})`);
      }
      if (mover.expValue !== asInt64(cells[fightCols.expValue])) wrong.push(`${cells[0]}.expValue=${mover.expValue}`);
    });
    expect(wrong).toEqual([]);
    expect(movers.every((m) => Number.isSafeInteger(m.expValue))).toBe(true); // a double holds every EXP value exactly

    // the first monster, MI_AIBATT1: level 1, 120 HP, 2 EXP
    expect(movers.find((m) => m.index === defines.get('MI_AIBATT1'))).toMatchObject({
      name: 'Small Aibatt',
      level: 1,
      addHp: 120,
      expValue: 2,
      rank: defines.get('RANK_LOW'),
      belligerence: defines.get('BELLI_MELEE2X'),
      killable: 1,
    });

    const byIndex = new Map(movers.map((m) => [m.index, m]));
    const male = byIndex.get(defines.get('MI_MALE')!);
    const female = byIndex.get(defines.get('MI_FEMALE')!);
    expect(male?.name).toBe('Male');
    expect(female?.name).toBe('Female');
    expect(male!.speed).toBeGreaterThan(0);
    expect(female!.speed).toBeGreaterThan(0);
    expect(male!.ai).toBe(defines.get('AII_MOVER'));
    // the flying monsters (dwFlying 1), which Neuz moves with the flying rules: the Mothbees among them
    const flying = movers.filter((m) => m.flying).map((m) => m.name);
    expect(flying).toContain('Mothbee');
    expect(flying).not.toContain('Male');
    const withSpeed = movers.filter((m) => m.speed > 0).length;
    console.log(`propMover.txt: ${movers.length} movers (${withSpeed} with a speed above 0, ${flying.length} flying); male speed ${male!.speed}`);
  });

  it('propItem.txt: every row up to version 15 is read, with its id, name and body slot', () => {
    const text = scriptText('propItem.txt');
    const items = readPropItem(text, defines, strings, 'propItem.txt');
    const rows = tableRows(text).filter((cells) => parseInt(cells[0], 10) <= 15);
    expect(items).toHaveLength(rows.length);

    // the same rows split at the tabs: version, id, name, then dwParts is the 16th column after the name
    const header = text.split(/\r?\n/).find((line) => line.startsWith('//ver'))!.slice(2).split('\t');
    const itemCol = (name: string): number => header.findIndex((cell) => cell.replace(/^\/\//, '').trim() === name);
    expect(itemCol('dwID')).toBe(1);
    expect(itemCol('szName')).toBe(2);
    expect(itemCol('dwParts')).toBe(18);
    expect(itemCol('dwExclusive')).toBe(21);
    expect(itemCol('dwBasePartsIgnore')).toBe(22);
    const partsValues = new Set([...defines].filter(([name]) => name.startsWith('PARTS_')).map(([, value]) => value));
    rows.forEach((cells, i) => {
      const item = items[i];
      expect(item.id, cells[1]).toBe(defines.get(cells[1]));
      expect(item.parts, cells[1]).toBe(asNumber(cells[18]));
      expect(item.exclusive, cells[1]).toBe(asNumber(cells[21]));
      expect(item.baseIgnore, cells[1]).toBe(asNumber(cells[22]));
      // the name is the string-table text, trimmed, without the " @" of an ultimate weapon
      const named = resolve(cells[2]).trimEnd();
      expect(item.name === named || item.name === named.replace(/ @$/, ''), cells[1]).toBe(true);
      expect(item.name, cells[1]).not.toMatch(/ @$/);
      expect(item.parts === -1 || partsValues.has(item.parts), `${cells[1]} parts ${item.parts}`).toBe(true);
    });

    // the columns the fight reads, from the same cells; the mismatches are collected so a failure lists them all
    const numberCols = {
      kind1: 'dwItemKind1',
      kind2: 'dwItemKind2',
      kind3: 'dwItemKind3',
      handed: 'dwHanded',
      abilityMin: 'dwAbilityMin',
      abilityMax: 'dwAbilityMax',
      weaponType: 'dwWeaponType',
      attackRange: 'dwAttackRange',
      sfxObj3: 'dwSfxObj3',
      sfxObj5: 'dwSfxObj5',
      sndAttack1: 'dwSndAttack1',
    } as const;
    const columnOf = (name: string): number => {
      const at = itemCol(name);
      expect(at, name).toBeGreaterThan(0);
      return at;
    };
    const cols = Object.fromEntries(Object.entries(numberCols).map(([key, name]) => [key, columnOf(name)])) as Record<
      keyof typeof numberCols,
      number
    >;
    const speedCol = columnOf('dwAttackSpeed'); // the file's name for fAttackSpeed
    const destCols = ['dwDestParam1', 'dwDestParam2', 'dwDestParam3'].map(columnOf);
    const adjCols = ['nAdjParamVal1', 'nAdjParamVal2', 'nAdjParamVal3'].map(columnOf);
    const iconCol = columnOf('szIcon');
    const textFileCol = columnOf('szTextFile');
    const commandCol = columnOf('szComment');
    expect([speedCol, iconCol, textFileCol, commandCol]).toEqual([49, 120, 122, 123]);
    const unquoted = (cell: string): string => cell.replace(/"/g, ''); // """name""" reads as "", name, ""
    const wrong: string[] = [];
    rows.forEach((cells, i) => {
      const item = items[i];
      for (const key of Object.keys(numberCols) as (keyof typeof numberCols)[]) {
        if (item[key] !== asNumber(cells[cols[key]])) wrong.push(`${cells[1]}.${key}=${item[key]} (${cells[cols[key]]})`);
      }
      if (item.attackSpeed !== asFloat(cells[speedCol]) || item.attackSpeedText !== cells[speedCol]) {
        wrong.push(`${cells[1]}.attackSpeed=${item.attackSpeed} "${item.attackSpeedText}" (${cells[speedCol]})`);
      }
      if (item.destParams.some((value, k) => value !== asNumber(cells[destCols[k]]))) wrong.push(`${cells[1]}.destParams`);
      if (item.adjParams.some((value, k) => value !== asNumber(cells[adjCols[k]]))) wrong.push(`${cells[1]}.adjParams`);
      if (item.icon !== unquoted(cells[iconCol])) wrong.push(`${cells[1]}.icon=${item.icon} (${cells[iconCol]})`);
      if (item.textFileName !== unquoted(cells[textFileCol])) wrong.push(`${cells[1]}.textFileName=${item.textFileName}`);
      if (item.command !== resolve(cells[commandCol])) wrong.push(`${cells[1]}.command=${item.command}`);
    });
    expect(wrong).toEqual([]);

    // a lookup keeps the last of a repeated id (CFixedArray::SetAtGrow)
    const byId = new Map(items.map((item) => [item.id, item]));
    const named = (id: string) => byId.get(defines.get(id)!)!;
    expect(named('II_ARM_M_VAG_SUIT01')).toMatchObject({
      id: 502,
      name: 'Cotton Suit',
      parts: defines.get('PARTS_UPPER_BODY'),
      exclusive: defines.get('PARTS_LOWER_BODY'),
      baseIgnore: -1,
      abilityMin: 8, // the defence of the suit
      abilityMax: 10,
    });
    expect(named('II_WEA_SWO_SUHOUM')).toMatchObject({
      id: 22368,
      name: 'Ultimate Guardian Sword',
      parts: defines.get('PARTS_RWEAPON'),
      exclusive: -1,
      baseIgnore: -1,
    });

    // the reference table's starter weapons: the Wooden Sword and the fists (the item a bare hand holds)
    expect(named('II_WEA_SWO_WOODEN')).toMatchObject({
      name: 'Wooden Sword',
      handed: defines.get('HD_ONE'),
      parts: defines.get('PARTS_RWEAPON'),
      abilityMin: 3,
      abilityMax: 4,
      weaponType: defines.get('WT_MELEE_SWD'),
      attackSpeed: Math.fround(0.085),
      attackSpeedText: '0.085',
      attackRange: defines.get('AR_SHORT'),
      sfxObj3: defines.get('XI_HIT_SWORD01'),
      icon: 'itm_WeaSwoWooden.dds',
    });
    expect(named('II_WEA_HAN_HAND')).toMatchObject({
      parts: defines.get('PARTS_RWEAPON'),
      abilityMin: 1,
      abilityMax: 2,
      weaponType: defines.get('WT_MELEE_STAFF'),
      attackSpeed: Math.fround(0.07),
      attackSpeedText: '0.07',
      attackRange: defines.get('AR_SHORT'),
      sfxObj3: -1,
    });
    // the server compares the float exactly: 0.085 is not a float, and the text gives the float back
    expect(named('II_WEA_SWO_WOODEN').attackSpeed).not.toBe(0.085);
    const worn = items.filter((i) => i.parts !== -1);
    const repeated = items.length - new Set(items.map((i) => i.id)).size;
    console.log(`propItem.txt: ${items.length} items (${worn.length} with a body slot, ${repeated} repeated ids)`);
    expect(worn.length).toBeGreaterThan(1000);
  });

  it('character.inc, character-etc.inc and character-school.inc: every block is read, with its SetName', () => {
    let total = 0;
    for (const name of ['character.inc', 'character-etc.inc', 'character-school.inc']) {
      const text = scriptText(name);
      const characters = readCharacterInc(text, defines, strings, name);
      // an independent reading: a key is a word at the start of a line, followed by the `{` of its block or, in a
      // few blocks (NPC_Door ...), by `setting`: the C++ takes whatever follows the key for the brace
      const plain = withoutComments(text);
      const keys = [...plain.matchAll(/^([A-Za-z_]\w*)[ \t]*\r?\n\s*(?:\{|setting\b)/gm)];
      expect(characters.map((c) => c.key), name).toEqual(keys.map((m) => m[1]));
      keys.forEach((m, i) => {
        const end = i + 1 < keys.length ? keys[i + 1].index! : plain.length;
        const names = [...plain.slice(m.index!, end).matchAll(/SetName\s*\(\s*(\w+)\s*\)/g)];
        const expected = names.length === 0 ? '' : resolve(names[names.length - 1][1]) || ' ';
        expect(characters[i].name, `${name} ${m[1]}`).toBe(expected);
      });
      total += characters.length;
      console.log(`${name}: ${characters.length} characters, ${characters.filter((c) => c.name.trim() === '').length} with no name`);
    }
    const all = readCharacterInc(scriptText('character.inc'), defines, strings, 'character.inc');
    expect(all.find((c) => c.key === 'MaFl_Mikyel')?.name).toBe('Mikyel');
    expect(total).toBeGreaterThan(400);
  });

  it('PKSetting.inc: the three name colours', () => {
    const text = scriptText('PKSetting.inc');
    const colors = readPkSetting(text, defines, 'PKSetting.inc');
    // an independent reading: `KEYWORD 0xAARRGGBB` outside the comment block
    const plain = withoutComments(text);
    const color = (keyword: string): number => Number(/^\s*KEYWORD\s+(0x[0-9a-fA-F]+)/m.exec(plain.replace(new RegExp(keyword, 'g'), 'KEYWORD'))![1]);
    expect(colors.general).toBe(color('GENERAL_COLOR'));
    expect(colors.ready).toBe(color('READY_COLOR'));
    expect(colors.chaotic).toBe(color('CHAO_COLOR'));
    expect(colors).toEqual({ general: 0xffffffff, ready: 0xffffc0cb, chaotic: 0xffff0000 });
  });

  it('honorList.txt: every title is read through honorList.txt.txt', () => {
    const text = scriptText('honorList.txt');
    const titles = readHonorTitles(text, defines, strings, 'honorList.txt');
    const rows = tableRows(text);
    expect(titles.size).toBe(rows.length);
    for (const cells of rows) {
      const id = asNumber(cells[0]);
      expect(titles.get(id), `title ${id}`).toBe(resolve(cells[4].replace(/\s*\/\/.*$/, '')));
    }
    expect(titles.get(0)).toBe('Master Collector');
    expect(titles.get(-1)).toBeUndefined(); // GetTitle(-1) is NULL
    expect([...titles.values()].every((title) => title !== '' && !title.startsWith('IDS'))).toBe(true);
    console.log(`honorList.txt: ${titles.size} titles`);
  });

  it('World.inc: every world line is read, through the WI_* ids of defineWorld.h', () => {
    const text = scriptText('World.inc');
    const worlds = readWorldInc(text, defines, 'World.inc');
    // an independent reading: outside the comments, a line `WI_NAME "folder"` is a world, a `WI_NAME SetTitle` block is not
    const lines = [...withoutComments(text).matchAll(/^[ \t]*(\w+)[ \t]+"([^"]*)"/gm)];
    expect(lines.length).toBeGreaterThan(50);
    expect(worlds).toEqual(lines.map((line) => ({ id: defines.get(line[1])!, fileName: line[2] })));
    expect(worlds.every((world) => Number.isInteger(world.id) && world.id >= 0 && world.fileName !== '')).toBe(true);
    expect(new Set(worlds.map((world) => world.id)).size).toBe(worlds.length); // no id is defined twice

    expect(defines.get('WI_WORLD_MADRIGAL')).toBe(1);
    expect(worlds.find((world) => world.id === 1)).toEqual({ id: 1, fileName: 'WdMadrigal' });
    // WI_DUNGEON_SECRET_1 to _16 share a folder
    const secret = worlds.filter((world) => world.fileName === 'WdHeaven06_1');
    expect(secret.length).toBe(16);
    console.log(`World.inc: ${worlds.length} worlds, ids ${Math.min(...worlds.map((w) => w.id))}..${Math.max(...worlds.map((w) => w.id))}`);
  });

  it('mdlDyna.inc keeps the part text and the motion list of every entry', () => {
    const text = scriptText('mdlDyna.inc');
    const elems = readModelIndex(text, defines, 'mdlDyna.inc');
    // an independent count: every motion is a `"name" MTI_*` line
    const motionLines = withoutComments(text).match(/"[^"]*"\s+MTI_\w+/g) ?? [];
    const motions = elems.reduce((sum, e) => sum + e.motions.length, 0);
    expect(motions).toBe(motionLines.length);
    expect(motions).toBeGreaterThan(1000);

    const OT_ITEM = 4;
    const OT_MOVER = 5;
    const find = (type: number, id: number) => elems.find((e) => e.type === type && e.id === id);
    const suit = find(OT_ITEM, defines.get('II_ARM_M_VAG_SUIT01')!);
    expect(suit?.part).toBe('mVag01Upper');
    expect(suit?.motions).toEqual([]);
    const male = find(OT_MOVER, defines.get('MI_MALE')!);
    expect(male?.name).toBe('male');
    expect(male?.motions.length).toBeGreaterThan(20);
    expect(male?.motions).toContainEqual({ id: defines.get('MTI_STAND')!, name: 'GenStand' });
    expect(find(OT_MOVER, defines.get('MI_FEMALE')!)?.motions.length).toBeGreaterThan(20);

    // a two-sex part is `male/female`, both halves non-empty
    const twoSex = elems.filter((e) => e.part.includes('/'));
    expect(twoSex.length).toBeGreaterThan(0);
    for (const e of twoSex) expect(e.part.split('/').filter((half) => half !== ''), e.part).toHaveLength(2);
    const withPart = elems.filter((e) => e.part !== '').length;
    console.log(`mdlDyna.inc: ${elems.length} entries, ${withPart} with a part (${twoSex.length} two-sex), ${motions} motions`);
  });

  it('propJob.inc: a row per job in JOB_* order, 17 floats each, the Vagrant row as the reference table has it', () => {
    const text = scriptText('propJob.inc');
    const jobs = readPropJob(text, 'propJob.inc', defines); // checks every name against its row
    // an independent reading: outside the comments, a row is the job name and 17 numbers
    const rows = withoutComments(text)
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim().split(/\s+/));
    expect(jobs).toHaveLength(rows.length);
    expect(jobs).toHaveLength(32);
    const fields = [
      'attackSpeed',
      'factorMaxHP',
      'factorMaxMP',
      'factorMaxFP',
      'factorDef',
      'factorHPRecovery',
      'factorMPRecovery',
      'factorFPRecovery',
      'meleeSWD',
      'meleeAXE',
      'meleeSTAFF',
      'meleeSTICK',
      'meleeKNUCKLE',
      'magicWAND',
      'blocking',
      'meleeYOYO',
      'critical',
    ] as const;
    rows.forEach((cells, index) => {
      expect(cells, cells[0]).toHaveLength(18);
      expect(jobs[index].name).toBe(cells[0]);
      expect(defines.get(cells[0]), cells[0]).toBe(index); // the C++ indexes by the define
      fields.forEach((field, k) => expect(jobs[index][field], `${cells[0]}.${field}`).toBe(Math.fround(parseFloat(cells[k + 1]))));
    });

    // the Vagrant row: JOB_VAGRANT is 0
    expect(jobs[defines.get('JOB_VAGRANT')!]).toEqual({
      name: 'JOB_VAGRANT',
      attackSpeed: 75.0,
      factorMaxHP: Math.fround(0.9),
      factorMaxMP: Math.fround(0.3),
      factorMaxFP: Math.fround(0.3),
      factorDef: 1.0,
      factorHPRecovery: Math.fround(1.2),
      factorMPRecovery: 0.5,
      factorFPRecovery: 0.5,
      meleeSWD: 4.5,
      meleeAXE: 5.5,
      meleeSTAFF: Math.fround(0.8),
      meleeSTICK: 3.0,
      meleeKNUCKLE: 5.0,
      magicWAND: 6.0,
      blocking: Math.fround(0.2),
      meleeYOYO: Math.fround(4.2),
      critical: 1.0,
    });
    expect(jobs[defines.get('JOB_MERCENARY')!]).toMatchObject({ attackSpeed: 80, factorMaxHP: Math.fround(1.5), blocking: Math.fround(0.8) });
  });

  it('ExpTable.inc: the 200 rows of expCharacter, row 2 is 14 EXP and 2 points, row 16 is 2340', () => {
    const text = scriptText('ExpTable.inc');
    const rows = readExpTable(text, 'ExpTable.inc');
    expect(rows).toHaveLength(200); // MAX_EXPCHARACTER

    // an independent reading: the number lines between "expCharacter" and its closing brace
    const start = text.indexOf('expCharacter');
    const block = text.slice(text.indexOf('{', start) + 1, text.indexOf('}', start));
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => line !== '')
      .map((line) => line.split(/\s+/));
    expect(lines).toHaveLength(200);
    lines.forEach((cells, level) => {
      expect(cells, `row ${level}`).toHaveLength(4);
      expect(rows[level], `row ${level}`).toEqual({
        exp1: BigInt(cells[0]),
        exp2: BigInt(cells[1]),
        lpPoint: parseInt(cells[2], 10),
        limitExp: BigInt(cells[3]),
      });
    });

    expect(rows[0]).toEqual({ exp1: 0n, exp2: 0n, lpPoint: 0, limitExp: 0n }); // not used
    expect(rows[2]).toMatchObject({ exp1: 14n, lpPoint: 2 }); // the EXP to leave level 1 and the points for level 2
    expect(rows[16].exp1).toBe(2340n);
    // the reference table: the EXP of rows 1..16, the points and the one-kill caps
    expect(rows.slice(1, 17).map((row) => Number(row.exp1))).toEqual([
      0, 14, 20, 36, 90, 152, 250, 352, 480, 591, 743, 973, 1290, 1632, 1928, 2340,
    ]);
    expect(rows.slice(1, 17).map((row) => row.lpPoint)).toEqual([0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(rows.slice(1, 17).map((row) => Number(row.limitExp))).toEqual([
      16, 18, 21, 25, 30, 35, 42, 49, 58, 69, 84, 102, 123, 145, 170, 195,
    ]);
    // the top rows pass 32 bits, which is why they are bigint
    expect(rows[199].exp1).toBe(369857717768n);
    expect(rows[199].limitExp).toBe(10187103688n);
  });

  it('textClient.inc: every block with a text is read, with its colour; TID_GAME_DEATH is 0xff00ffff', () => {
    const inc = scriptText('textClient.inc');
    const texts = readTextClient(inc, strings, 'textClient.inc');

    // an independent reading of what is outside the comments (a few blocks sit in one): `TID_NAME 0xAARRGGBB { IDS_KEY }`.
    // A colour is a DWORD, so a literal of more than 8 digits (the file has a few) keeps its low 32 bits.
    const plain = withoutComments(inc);
    const blocks = [...plain.matchAll(/^(TID_\w+)[ \t]+(0x[0-9a-fA-F]+)[ \t]*\r?\n\{\s*(\w+)\s*\}/gm)];
    expect(blocks.length).toBe((plain.match(/^TID_\w+/gm) ?? []).length); // every block has that shape
    const expected = new Map<string, { id: string; text: string; color: number }>();
    for (const [, id, color, key] of blocks) {
      const text = (strings.get(key) ?? key).replace(/"/g, '');
      if (text !== '') expected.set(id, { id, text, color: Number(BigInt(color) & 0xffffffffn) });
    }
    expect([...texts.values()]).toEqual([...expected.values()]);
    expect(texts.size).toBeGreaterThan(2000);

    // the names are the ones defineText.h numbers
    const unknown = [...texts.keys()].filter((id) => !defines.has(id));
    expect(unknown).toEqual([]);

    const death = texts.get('TID_GAME_DEATH')!;
    expect(death.color).toBe(0xff00ffff);
    expect(death.text).not.toBe('');
    expect(death.text).toBe(strings.get('IDS_TEXTCLIENT_INC_000156'));
    expect(texts.get('TID_GAME_LEVELUP')).toEqual({
      id: 'TID_GAME_LEVELUP',
      text: 'Level up! You can increase your stats in your character window.',
      color: 0xffccffcc,
    });
    expect(texts.get('TID_GAME_LEVELUP_CAPTION')).toMatchObject({ text: 'Congratulations! Level up!', color: 0xffffffff });
    console.log(`textClient.inc: ${texts.size} texts of ${blocks.length} TIDs; TID_GAME_DEATH "${death.text}"`);
  });

  /** A loose file of the client folder (not in the packs), decoded as a script. */
  const looseScript = (...segments: string[]): string =>
    decodeScript(new Uint8Array(readFileSync(path.join(clientRoot()!, ...segments))));

  it('DmgEffect.inc: the 28 frames of the damage-number sheet, digits then words, twice', () => {
    const text = looseScript('SFX', 'DmgEffect.inc');
    const pack = readTexturePack(text, 'DmgEffect.inc');
    expect(pack.texture).toBe('sfx\\DmgEffect.dds');
    expect(pack.colorKey).toBe(0);
    expect(pack.frames).toHaveLength(28);
    expect(pack.frames[0]).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(pack.frames[14]).toEqual({ x: 0, y: 128, w: 50, h: 50 });
    for (let digit = 0; digit < 10; digit++) {
      expect(pack.frames[digit]).toEqual({ x: digit * 50, y: 0, w: 50, h: 50 });
      expect(pack.frames[14 + digit]).toEqual({ x: digit * 50, y: 128, w: 50, h: 50 });
    }
    // MISS!, NICE!, COMBO!, YEAH! twice: the second row of words is 178 high, as the file says
    expect(pack.frames.slice(10, 14)).toEqual([
      { x: 0, y: 50, w: 200, h: 50 },
      { x: 200, y: 50, w: 200, h: 50 },
      { x: 400, y: 50, w: 300, h: 50 },
      { x: 700, y: 50, w: 250, h: 50 },
    ]);
    expect(pack.frames.slice(24)).toEqual([
      { x: 0, y: 178, w: 200, h: 178 },
      { x: 200, y: 178, w: 200, h: 178 },
      { x: 400, y: 178, w: 300, h: 178 },
      { x: 700, y: 178, w: 250, h: 178 },
    ]);

    // the sheet is 1024 x 256, wide enough for a row of ten glyphs: the texture size changes nothing here
    const sheet = readDds(new Uint8Array(readFileSync(path.join(clientRoot()!, 'SFX', 'DmgEffect.dds'))), 'DmgEffect.dds').image;
    expect([sheet.width, sheet.height]).toEqual([1024, 256]);
    expect(readTexturePack(text, 'DmgEffect.inc', sheet).frames).toEqual(pack.frames);
  });

  it('icon_target.inc: four cells of 32 x 32, each as normal, mirrored across, mirrored down, and both', () => {
    const text = looseScript('Icon', 'icon_target.inc');
    const pack = readTexturePack(text, 'icon_target.inc');
    expect(pack.texture).toBe('icon\\icon_target.dds');
    expect(pack.colorKey).toBe(0xffff00ff); // magenta
    expect(pack.frames).toHaveLength(16);
    const cells = [
      [0, 0],
      [32, 0],
      [0, 32],
      [32, 32],
    ];
    cells.forEach(([x, y], cell) => {
      const [normal, across, down, both] = pack.frames.slice(cell * 4, cell * 4 + 4);
      expect(normal).toEqual({ x, y, w: 32, h: 32 });
      expect(across).toEqual({ x, y, w: 32, h: 32, flip: 'h' });
      expect(down).toEqual({ x, y, w: 32, h: 32, flip: 'v' });
      expect(both).toEqual({ x, y, w: 32, h: 32, flip: 'hv' });
    });
    // the white corner is cell (0, 0), the red one cell (0, 32): frames 0..3 and 8..11
    expect(pack.frames[8]).toEqual({ x: 0, y: 32, w: 32, h: 32 });
    const sheet = readDds(new Uint8Array(readFileSync(path.join(clientRoot()!, 'Icon', 'icon_target.dds'))), 'icon_target.dds').image;
    expect([sheet.width, sheet.height]).toEqual([64, 64]);
  });

  it('every texture-pack script of Icon/ and SFX/ reads, with a picture, a colour key and frames', () => {
    const read: string[] = [];
    for (const dir of ['Icon', 'SFX']) {
      for (const name of readdirSync(path.join(clientRoot()!, dir)).filter((file) => /\.inc$/i.test(file))) {
        const text = looseScript(dir, name);
        if (!/^\s*number\b/m.test(withoutComments(text))) continue; // not a texture pack
        const pack = readTexturePack(text, `${dir}/${name}`);
        expect(pack.texture, name).toMatch(/\.(dds|tga|bmp)$/i);
        expect(pack.frames.length, name).toBeGreaterThan(0);
        for (const frame of pack.frames) {
          expect([frame.x, frame.y, frame.w, frame.h].every((n) => Number.isInteger(n) && n >= 0), name).toBe(true);
        }
        read.push(`${name}:${pack.frames.length}`);
      }
    }
    console.log(`texture packs: ${read.join(' ')}`);
    expect(read.length).toBeGreaterThanOrEqual(10);
  });
});
