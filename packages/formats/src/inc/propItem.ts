// Item properties (`propItem.txt`), copying CProject::LoadPropItem (Source/_Common/ProjectCmn.cpp:300). A
// tab-separated table read token by token like propMover.txt (CScript: `IDS_*` names give string-table text, the
// `II_*`, `IK*_`, `PARTS_*` ... words are #defines, `=` is an empty cell). Each row is
//
//   version  dwID  szName  dwNum dwPackMax ... dwParts ...  (the columns are listed in ITEM_COLUMNS)  icon  quest ...
//
// Of the 124 columns this keeps the id (`II_*`), the name and `dwParts`, the body slot a worn item takes
// (`PARTS_*` of defineNeuz.h: PARTS_UPPER_BODY, PARTS_RWEAPON ...); the rest are read and dropped. Build flags of
// the client: `__PROP_0827` (three dest params), `__CLIENT`, `__VER` 15, all on in Neuz/VersionCommon.h.

import { ScriptReader } from '../script/cscript';

export interface ItemProp {
  /** The item id: the `II_*` define of the second column (`ItemProp::dwID`). */
  id: number;
  /**
   * `szName`: the string-table text of the name column, trimmed. The " @" the data puts after the names of
   * ultimate weapons is removed, as the client does when it loads the table (ProjectCmn.cpp:519-533).
   */
  name: string;
  /**
   * `dwParts`: the body slot the item takes when worn, a `PARTS_*` number (PARTS_HEAD 0, PARTS_UPPER_BODY 2,
   * PARTS_RWEAPON 10 ... defineNeuz.h:24-41). -1 (NULL_ID, written `=`) for an item that is not worn.
   */
  parts: number;
}

const READER = 'readPropItem';
const CPP_REF = 'Source/_Common/ProjectCmn.cpp:300 CProject::LoadPropItem';

/** `__VER` of the client (Neuz/VersionCommon.h:4): rows of a newer version are read and dropped. */
const CLIENT_VER = 15;

type Kind = 'int' | 'float';
type Column = readonly [name: string, kind: Kind];

const ints = (...names: string[]): Column[] => names.map((name) => [name, 'int']);
const floats = (...names: string[]): Column[] => names.map((name) => [name, 'float']);

/** The columns after szName, in the order LoadPropItem reads them (ProjectCmn.cpp:334-457, `__PROP_0827` on). */
const ITEM_COLUMNS: readonly Column[] = [
  ...ints('dwNum', 'dwPackMax', 'dwItemKind1', 'dwItemKind2', 'dwItemKind3', 'dwItemJob', 'bPermanence'),
  ...ints('dwUseable', 'dwItemSex', 'dwCost', 'dwEndurance', 'nAbrasion', 'nMaxRepair', 'dwHanded', 'dwFlag'),
  ...ints('dwParts', 'dwPartsub', 'bPartsFile', 'dwExclusive', 'dwBasePartsIgnore', 'dwItemLV', 'dwItemRare'),
  ...ints('dwShopAble', 'nLog', 'bCharged', 'dwLinkKindBullet', 'dwLinkKind', 'dwAbilityMin', 'dwAbilityMax'),
  ...ints('eItemType', 'wItemEatk', 'dwParry', 'dwblockRating', 'nAddSkillMin', 'nAddSkillMax', 'dwAtkStyle'),
  ...ints('dwWeaponType', 'dwItemAtkOrder1', 'dwItemAtkOrder2', 'dwItemAtkOrder3', 'dwItemAtkOrder4'),
  ...ints('tmContinuousPain', 'nShellQuantity', 'dwRecoil', 'dwLoadingTime', 'nAdjHitRate'),
  ...floats('fAttackSpeed'),
  ...ints('dwDmgShift', 'dwAttackRange', 'nProbability'),
  ...ints('dwDestParam0', 'dwDestParam1', 'dwDestParam2', 'nAdjParamVal0', 'nAdjParamVal1', 'nAdjParamVal2'),
  ...ints('dwChgParamVal0', 'dwChgParamVal1', 'dwChgParamVal2', 'nDestData10', 'nDestData11', 'nDestData12'),
  ...ints('dwActiveSkill', 'dwActiveSkillLv', 'dwActiveSkillRate', 'dwReqMp', 'dwReqFp', 'dwReqDisLV'),
  ...ints('dwReSkill1', 'dwReSkillLevel1', 'dwReSkill2', 'dwReSkillLevel2', 'dwSkillReadyType', 'dwSkillReady'),
  ...ints('_dwSkillRange', 'dwSfxElemental', 'dwSfxObj', 'dwSfxObj2', 'dwSfxObj3', 'dwSfxObj4', 'dwSfxObj5'),
  ...ints('dwUseMotion', 'dwCircleTime', 'dwSkillTime', 'dwExeTarget', 'dwUseChance', 'dwSpellRegion'),
  ...ints('dwSpellType', 'dwReferStat1', 'dwReferStat2', 'dwReferTarget1', 'dwReferTarget2'),
  ...ints('dwReferValue1', 'dwReferValue2', 'dwSkillType'),
  ...floats('fItemResistElecricity', 'fItemResistFire', 'fItemResistWind', 'fItemResistWater', 'fItemResistEarth'),
  ...ints('nEvildoing', 'dwExpertLV', 'dwExpertMax', 'dwSubDefine', 'dwExp', 'dwComboStyle'),
  ...floats('fFlightSpeed', 'fFlightLRAngle', 'fFlightTBAngle'),
  ...ints('dwFlightLimit', 'dwFFuelReMax', 'dwAFuelReMax', 'dwFuelRe', 'dwLimitLevel1', 'nReflect'),
  ...ints('dwSndAttack1', 'dwSndAttack2'),
];

/** Removes trailing white space, the characters C `isspace` accepts (CString::TrimRight, ProjectCmn.cpp:331). */
const trimRight = (s: string): string => s.replace(/[ \t\n\v\f\r]+$/, '');

/**
 * Reads the text of `propItem.txt` (see `decodeScript`), items in file order. `strings` is the merged string
 * table (see `readStringTable`) that turns the `IDS_*` name of a row into text; `defines` has to hold
 * IK2_WEAPON_DIRECT, IK2_WEAPON_MAGIC and WEAPON_ULTIMATE when a name carries an "@".
 *
 * Rows with a version above 15 are read and not returned. A repeated id is returned again; the C++ keeps the
 * last (CFixedArray::SetAtGrow), so fill a lookup in file order. An id that is 0 or negative fails the load in
 * the C++ (it logs and returns FALSE); here it throws a FormatError, as does a name that is not defined and a
 * row that stops early (the C++ logs "Not Found" and reads 0).
 */
export function readPropItem(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'propItem.txt',
): ItemProp[] {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  const items: ItemProp[] = [];

  // ItemProp::IsUltimate (ProjectCmn.h:368): a direct or magic weapon whose dwReferStat1 is WEAPON_ULTIMATE
  const define = (name: string): number => {
    const value = defines.get(name);
    return value === undefined ? r.fail(`${name} is not defined, so IsUltimate cannot be decided`) : value;
  };
  const isUltimate = (kind2: number, referStat1: number): boolean =>
    (kind2 === define('IK2_WEAPON_DIRECT') || kind2 === define('IK2_WEAPON_MAGIC')) &&
    referStat1 === define('WEAPON_ULTIMATE');

  let version = r.numberOrEnd('the version'); // nVer; tok == FINISHED ends the table
  while (version !== undefined) {
    const id = r.number('dwID');
    if (id <= 0) r.fail(`item id ${id} is not allowed: ids start at 1`);
    let name = trimRight(r.token('szName').text);

    let parts = 0;
    let kind2 = 0;
    let referStat1 = 0;
    for (const [column, kind] of ITEM_COLUMNS) {
      if (kind === 'float') {
        r.float(column);
        continue;
      }
      const value = r.number(column);
      if (column === 'dwParts') parts = value;
      else if (column === 'dwItemKind2') kind2 = value;
      else if (column === 'dwReferStat1') referStat1 = value;
    }
    // szIcon is written `"""name"""`, which reads as three tokens ("", name, ""); then dwQuestId, the same three
    // tokens for szTextFileName, and szCommand
    for (let i = 0; i < 3; i++) r.token('szIcon');
    r.number('dwQuestId');
    for (let i = 0; i < 3; i++) r.token('szTextFileName');
    r.token('szCommand');

    if (version <= CLIENT_VER) {
      // __CLIENT, __VER >= 9: the name of an ultimate weapon ends in " @", which the client takes off
      const at = name.indexOf('@');
      if (at >= 0 && isUltimate(kind2, referStat1)) {
        const from = Math.max(0, at - 1); // CString::Delete(nFind - 1, 2)
        name = name.slice(0, from) + name.slice(from + 2);
      }
      items.push({ id, name, parts });
    }
    version = r.numberOrEnd('the version');
  }

  return items;
}
