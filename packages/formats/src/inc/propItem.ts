// Item properties (`propItem.txt`), copying CProject::LoadPropItem (Source/_Common/ProjectCmn.cpp:300). A
// tab-separated table read token by token like propMover.txt (CScript: `IDS_*` names give string-table text, the
// `II_*`, `IK*_`, `PARTS_*` ... words are #defines, `=` is an empty cell). Each row is
//
//   version  dwID  szName  dwNum dwPackMax ... dwParts ...  (the columns are listed in ITEM_COLUMNS)  icon  quest ...
//
// Of the 124 columns this keeps the id (`II_*`), the name, the three kinds and the hands, `dwParts` (the body slot a
// worn item takes: `PARTS_*` of defineNeuz.h, PARTS_UPPER_BODY, PARTS_RWEAPON ...), the two columns that say which
// other parts a worn item hides (`dwExclusive` and `dwBasePartsIgnore`), the ability range, the weapon type, the
// attack speed and range, the dest and adjust params, three effect and sound ids, and the string columns at the end
// (the icon, the text file and the description); the rest are read and dropped. Build flags of the client:
// `__PROP_0827` (three dest params), `__CLIENT`, `__VER` 15, all on in Neuz/VersionCommon.h.

import { ScriptReader } from '../script/cscript';

export interface ItemProp {
  /** The item id: the `II_*` define of the second column (`ItemProp::dwID`). */
  id: number;
  /**
   * `szName`: the string-table text of the name column, trimmed. The " @" the data puts after the names of
   * ultimate weapons is removed, as the client does when it loads the table (ProjectCmn.cpp:519-533).
   */
  name: string;
  /** `dwItemKind1`: the first kind, an `IK1_*` value (IK1_WEAPON, IK1_ARMOR ...). -1 (written `=`) for none. */
  kind1: number;
  /** `dwItemKind2`: the second kind, an `IK2_*` value (IK2_WEAPON_DIRECT, IK2_ARMOR ...). */
  kind2: number;
  /** `dwItemKind3`: the third kind, an `IK3_*` value (IK3_SWD, IK3_SUIT ...). */
  kind3: number;
  /** `dwHanded`: how the item is held, an `HD_*` value (HD_ONE, HD_TWO ...). -1 for an item that is not held. */
  handed: number;
  /**
   * `dwParts`: the body slot the item takes when worn, a `PARTS_*` number (PARTS_HEAD 0, PARTS_UPPER_BODY 2,
   * PARTS_RWEAPON 10 ... defineNeuz.h:24-41). -1 (NULL_ID, written `=`) for an item that is not worn.
   */
  parts: number;
  /**
   * `dwExclusive`: the body slot whose bare default this item takes off when worn (`CMover::UpdateParts`,
   * `MoverEquip.cpp:300-333`), a `PARTS_*` number: PARTS_LOWER_BODY for a suit or a fashion body, PARTS_LWEAPON for a
   * two-hander. -1 (NULL_ID, written `=`) for none.
   */
  exclusive: number;
  /**
   * `dwBasePartsIgnore`: the base part this item hides while it is worn (`CMover::Render`, `MoverRender.cpp:400-505`):
   * PARTS_HAIR for a helmet or a hat that covers the hair, PARTS_HEAD for one that covers the head too. -1 for none.
   */
  baseIgnore: number;
  /** `dwAbilityMin`: the lowest attack of a weapon, or defence of an armour. -1 (written `=`) for none. */
  abilityMin: number;
  /** `dwAbilityMax`: the highest. */
  abilityMax: number;
  /** `dwWeaponType`: the weapon type, a `WT_*` value (WT_MELEE_SWD, WT_MELEE_STAFF ...). -1 for none. */
  weaponType: number;
  /**
   * `fAttackSpeed`, as the C `float` it is stored in (`GetFloat`; -1 for `=`). The attack speed formula uses it
   * (`CMover::GetAttackSpeed`, MoverAttack.cpp:159) and MELEE_ATTACK carries it as an f32.
   */
  attackSpeed: number;
  /**
   * The `fAttackSpeed` column as written (`0.085`; `=` when it is empty). The server compares the float it gets
   * exactly, and a number the table writes in a few digits is not a float, so the text gives the float back:
   * `Math.fround(parseFloat(attackSpeedText))`.
   */
  attackSpeedText: string;
  /** `dwAttackRange`: the reach of the weapon, an `AR_*` value (AR_SHORT 1 ...). -1 for none. */
  attackRange: number;
  /** `dwDestParam[0..2]`: what the item changes, `DST_*` values (`__PROP_0827` has three). -1 for none. */
  destParams: [number, number, number];
  /** `nAdjParamVal[0..2]`: by how much, one for each of `destParams`. */
  adjParams: [number, number, number];
  /** `dwSfxObj3`: the effect shown at the target when the item hits (an `XI_*` id: XI_HIT_SWORD01 for a sword). -1 for none. */
  sfxObj3: number;
  /** `dwSfxObj5`: the effect shown at the user. */
  sfxObj5: number;
  /** `dwSndAttack1`: the sound of a hit (`SND_*`). */
  sndAttack1: number;
  /** `szIcon`: the icon file (`itm_WeaSwoWooden.dds`); '' for none. */
  icon: string;
  /** `szTextFileName`: the text file of the item's GM command; '' for none. */
  textFileName: string;
  /** `szCommand`: the description, through the string table (the file calls the column szComment). */
  command: string;
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

/** The integer columns the rows keep (by their C++ names), and dwReferStat1, which IsUltimate asks for. */
const KEPT: ReadonlySet<string> = new Set([
  'dwItemKind1',
  'dwItemKind2',
  'dwItemKind3',
  'dwHanded',
  'dwParts',
  'dwExclusive',
  'dwBasePartsIgnore',
  'dwAbilityMin',
  'dwAbilityMax',
  'dwWeaponType',
  'dwAttackRange',
  'dwDestParam0',
  'dwDestParam1',
  'dwDestParam2',
  'nAdjParamVal0',
  'nAdjParamVal1',
  'nAdjParamVal2',
  'dwSfxObj3',
  'dwSfxObj5',
  'dwSndAttack1',
  'dwReferStat1',
]);

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

    const kept: Record<string, number> = {};
    let attackSpeed = -1;
    let attackSpeedText = '=';
    for (const [column, kind] of ITEM_COLUMNS) {
      if (kind === 'float') {
        const value = r.float(column);
        if (column === 'fAttackSpeed') {
          attackSpeed = Math.fround(value); // prop.fAttackSpeed is a float
          // the token as written; a sign is a token of its own, which GetFloat folds into the number
          const written = r.lastToken()!.text;
          attackSpeedText = value < 0 && written !== '=' ? `-${written}` : written;
        }
        continue;
      }
      const value = r.number(column);
      if (KEPT.has(column)) kept[column] = value;
    }
    // szIcon is written `"""name"""`, which reads as three tokens ("", name, ""): the client copies the second
    // (ProjectCmn.cpp:459-472); then dwQuestId, the same three tokens for szTextFileName (:477-481), and szCommand
    r.token('szIcon');
    const icon = r.token('szIcon').text;
    r.token('szIcon');
    r.number('dwQuestId');
    r.token('szTextFileName');
    const textFileName = r.token('szTextFileName').text;
    r.token('szTextFileName');
    const command = r.token('szCommand').text;

    if (version <= CLIENT_VER) {
      // __CLIENT, __VER >= 9: the name of an ultimate weapon ends in " @", which the client takes off
      const at = name.indexOf('@');
      if (at >= 0 && isUltimate(kept.dwItemKind2, kept.dwReferStat1)) {
        const from = Math.max(0, at - 1); // CString::Delete(nFind - 1, 2)
        name = name.slice(0, from) + name.slice(from + 2);
      }
      items.push({
        id,
        name,
        kind1: kept.dwItemKind1,
        kind2: kept.dwItemKind2,
        kind3: kept.dwItemKind3,
        handed: kept.dwHanded,
        parts: kept.dwParts,
        exclusive: kept.dwExclusive,
        baseIgnore: kept.dwBasePartsIgnore,
        abilityMin: kept.dwAbilityMin,
        abilityMax: kept.dwAbilityMax,
        weaponType: kept.dwWeaponType,
        attackSpeed,
        attackSpeedText,
        attackRange: kept.dwAttackRange,
        destParams: [kept.dwDestParam0, kept.dwDestParam1, kept.dwDestParam2],
        adjParams: [kept.nAdjParamVal0, kept.nAdjParamVal1, kept.nAdjParamVal2],
        sfxObj3: kept.dwSfxObj3,
        sfxObj5: kept.dwSfxObj5,
        sndAttack1: kept.dwSndAttack1,
        icon,
        textFileName,
        command,
      });
    }
    version = r.numberOrEnd('the version');
  }

  return items;
}
