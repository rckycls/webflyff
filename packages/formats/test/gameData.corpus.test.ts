import { expect, it } from 'vitest';
import {
  decodeScript,
  loadDefines,
  loadStrings,
  readCharacterInc,
  readHonorTitles,
  readModelIndex,
  readPkSetting,
  readPropItem,
  readPropMover,
  readStringTable,
  readWorldInc,
} from '../src/index';
import { describeClient, loadClientPacks } from './helpers/client';

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
    rows.forEach((cells, i) => {
      const mover = movers[i];
      expect(cells.length, cells[0]).toBe(rows[0].length); // every row has the same number of columns
      expect(mover.index, cells[0]).toBe(defines.get(cells[0]));
      expect(mover.name, cells[0]).toBe(resolve(cells[1]));
      expect(mover.ai, cells[0]).toBe(defines.get(cells[2]));
      expect(mover.speed, cells[0]).toBeCloseTo(parseFloat(cells[44]) || 0, 6);
    });

    const byIndex = new Map(movers.map((m) => [m.index, m]));
    const male = byIndex.get(defines.get('MI_MALE')!);
    const female = byIndex.get(defines.get('MI_FEMALE')!);
    expect(male?.name).toBe('Male');
    expect(female?.name).toBe('Female');
    expect(male!.speed).toBeGreaterThan(0);
    expect(female!.speed).toBeGreaterThan(0);
    expect(male!.ai).toBe(defines.get('AII_MOVER'));
    const withSpeed = movers.filter((m) => m.speed > 0).length;
    console.log(`propMover.txt: ${movers.length} movers (${withSpeed} with a speed above 0); male speed ${male!.speed}`);
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

    const suit = items.find((i) => i.id === defines.get('II_ARM_M_VAG_SUIT01'));
    expect(suit).toEqual({
      id: 502,
      name: 'Cotton Suit',
      parts: defines.get('PARTS_UPPER_BODY'),
      exclusive: defines.get('PARTS_LOWER_BODY'),
      baseIgnore: -1,
    });
    expect(items.find((i) => i.id === defines.get('II_WEA_SWO_SUHOUM'))).toEqual({
      id: 22368,
      name: 'Ultimate Guardian Sword',
      parts: defines.get('PARTS_RWEAPON'),
      exclusive: -1,
      baseIgnore: -1,
    });
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
});
