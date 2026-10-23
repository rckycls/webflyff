// Honour titles (`honorList.txt`), copying CTitleManager::LoadTitle (Source/_Common/honor.cpp:34) and
// CTitleManager::GetTitle (:264). CProject::Load reads it as "honorList.txt" (Project.cpp:739, `__VER >= 13`).
// A table read token by token (CScript), one title per row:
//
//   id  group  subgroup  need  title        // comment
//   3   HI_HUNT_MONSTER  MI_TAIGA02  15000  IDS_TITLE_TXT_0004
//
// `group` is an `HI_*` define (defineHonor.h), `subgroup` an `HS_*`, `MI_*`, `II_*` or `JOB_*` define, `title` an
// `IDS_*` key of the string table (`honorList.txt.txt`). Players carry the id of the title they show; their name
// tag prints `GetTitle(id)`.

import { ScriptReader } from '../script/cscript';

const READER = 'readHonorTitles';
const CPP_REF = 'Source/_Common/honor.cpp:34 CTitleManager::LoadTitle';

/**
 * Reads the text of `honorList.txt` (see `decodeScript`) into honour id -> title text, the lookup
 * `CTitleManager::GetTitle` does in m_mapAll. `strings` is the merged string table (see `readStringTable`) that
 * turns the `IDS_*` title into text. `defines` has to hold HI_HUNT_MONSTER, HI_USE_ITEM and MONSTER_TITLE_MAX
 * (defineHonor.h).
 *
 * A repeated id keeps its first title (map::insert), and id -1 is left out (GetTitle(-1) is NULL). The C++ allows
 * MONSTER_TITLE_MAX (70) different subgroups among the monster titles, and the same number among the item titles,
 * and past that it logs "Too many title about monster!" and stops loading; here that throws a FormatError. So do
 * an undefined name and a row that stops early (the C++ logs "Not Found" and reads 0).
 */
export function readHonorTitles(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'honorList.txt',
): Map<number, string> {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  const define = (name: string): number => {
    const value = defines.get(name);
    return value === undefined ? r.fail(`${name} is not defined (defineHonor.h)`) : value;
  };
  const huntMonster = define('HI_HUNT_MONSTER');
  const useItem = define('HI_USE_ITEM');
  const maxTitles = define('MONSTER_TITLE_MAX');

  const titles = new Map<number, string>(); // m_mapAll
  const monsters = new Set<number>(); // the subgroups in m_mapMonster
  const items = new Set<number>(); // the subgroups in m_mapItem

  let id = r.numberOrEnd('the honour id'); // TempData.nID = script.GetNumber()
  while (id !== undefined) {
    const group = r.number('the group'); // nLGrouping
    const subgroup = r.number('the subgroup'); // nSGrouping
    r.number('the need'); // nNeed
    const title = r.token('the title').text; // strTitle

    if (group === huntMonster) {
      if (monsters.size >= maxTitles) r.fail('Too many title about monster!');
      monsters.add(subgroup);
    } else if (group === useItem) {
      if (items.size >= maxTitles) r.fail('Too many title about item!');
      items.add(subgroup);
    }
    if (id !== -1 && !titles.has(id)) titles.set(id, title);

    id = r.numberOrEnd('the honour id');
  }

  return titles;
}
