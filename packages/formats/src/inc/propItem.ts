// Item properties (`propItem.txt`), copying CProject::LoadPropItem (Source/_Common/ProjectCmn.cpp:300). A
// tab-separated table read token by token like propMover.txt (CScript: `IDS_*` names give string-table text, the
// `II_*`, `IK*_`, `PARTS_*` ... words are #defines, `=` is an empty cell). Each row is
//
//   version  dwID  szName  dwNum dwPackMax ... dwParts ...  (the columns are listed in ITEM_COLUMNS)  icon  quest ...
//
// Of the 124 columns this keeps the id (`II_*`), the name, `dwPackMax`, the three kinds and the hands, `dwParts` (the
// body slot a worn item takes: `PARTS_*` of defineNeuz.h, PARTS_UPPER_BODY, PARTS_RWEAPON ...), the two columns that say which
// other parts a worn item hides (`dwExclusive` and `dwBasePartsIgnore`), the ability range, the weapon type, the
// attack speed and range, the dest and adjust params, three effect and sound ids, and the string columns at the end
// (the icon, the text file and the description); the rest are read and dropped. Build flags of the client:
// `__PROP_0827` (three dest params), `__CLIENT`, `__VER` 15, all on in Neuz/VersionCommon.h.
//
// `propSkill.txt` has the same 124 columns: CProject::LoadSkill reads it with this loader (`LoadPropItem( "propSkill.txt",
// &m_aPropSkill )`, Project.cpp:377), so this reads it too, and also keeps the columns a skill row uses (the kinds are the
// job type `JTYPE_*` and the job `JOB_*`): the level it needs and the skills it needs first, the motion, the target and
// approach rules, the kind of skill, the evil-doing flag, the maximum level, the first row of its levels in
// `propSkillAdd.csv`, the combo style and the cool-down a level without one falls back on.

import { ScriptReader } from '../script/cscript';

export interface ItemProp {
  /** Positive nReflect enables the native reflection pass. */
  reflect?: number;
  cost?: number;
  /** The item id: the `II_*` define of the second column (`ItemProp::dwID`). */
  id: number;
  /**
   * `szName`: the string-table text of the name column, trimmed. The " @" the data puts after the names of
   * ultimate weapons is removed, as the client does when it loads the table (ProjectCmn.cpp:519-533).
   */
  name: string;
  /**
   * `dwPackMax`: how many of the item one inventory slot holds (99 for the starter food, 1 for a sword). Above 1 the item
   * stacks, and the task bar counts it (`CWndTaskBar::OnDraw`, WndTaskBar.cpp:836-847).
   */
  packMax: number;
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
  /** `dwSfxObj`, `dwSfxObj2`, `dwSfxObj4` (Piece 7 M2): a skill's cast effect, a missile, a skill's lasting effect. -1 for none. */
  sfxObj: number;
  sfxObj2: number;
  sfxObj4: number;
  /** Piece 7 M3: `dwSkillReadyType` of an item, its cast in ms (a Blinkwing's 10000; `IsItemRedyTime`, Mover.cpp:8582-8627). Absent for `=`. */
  skillReadyType?: number;
  /** `dwLinkKind` and `dwLinkKindBullet` (Piece 7 M2): the weapon a skill needs, the bullets a bow or a bow skill needs. */
  linkKind: number;
  linkKindBullet: number;
  /** `dwAtkStyle`, `dwDmgShift` and `tmContinuousPain` (Piece 7 M2): `AS_BACK`, Strong Wind's push, a hit that repeats. */
  atkStyle: number;
  dmgShift: number;
  continuousPain: number;
  /** `dwSfxObj5`: the effect shown at the user. */
  sfxObj5: number;
  /** `dwSndAttack1`: the sound of a hit (`SND_*`). */
  sndAttack1: number;
  /** `dwSndAttack2`: the sound of a critical hit (`DPClient.cpp:1903-1907`), when it names one. */
  sndAttack2?: number;
  /**
   * `dwReqDisLV`: of a skill, the character level that unlocks it. `CMover::CheckSkill` refuses a skill when
   * `!IsMaster() && !IsHero() && GetLevel() < (int)dwReqDisLV` (MoverParam.cpp:124, the `__VER >= 10` branch): a Master or
   * Hero skips the level test. -1 for `=`, which the C++ keeps as 0xFFFFFFFF: no level is below `(int)` of it, and
   * LoadSkill sorts such a skill last (SortJobSkill, Project.cpp:364-373).
   */
  reqLevel: number;
  /**
   * `dwReSkill1` and `dwReSkill2`: the skills (`SI_*` ids, not slots of the player's array) that have to be at least at
   * `reSkillLevels` before this one can be raised. -1 for `=`: no prerequisite (CheckSkill compares with 0xffffffff).
   */
  reSkills: [number, number];
  /** `dwReSkillLevel1` and `dwReSkillLevel2`: the level each prerequisite has to be at. */
  reSkillLevels: [number, number];
  /**
   * `dwSkillReady`: of a skill, the cool-down a level of `propSkillAdd.csv` that gives none falls back on
   * (LoadPropAddSkill, Project.cpp:2587-2596). -1 for `=`.
   */
  skillReady: number;
  /** `dwUseMotion`: of a skill, the motion it plays, an `MTI_*` id (`MTI_VAG_ONE_CLEANHIT` 1000). -1 for none. */
  useMotion: number;
  /** `dwExeTarget`: of a skill, how its target is found, an `EXT_*` value (EXT_MELEEATK 17). */
  exeTarget: number;
  /** `dwUseChance`: of a skill, what it needs to be used, a `WUI_*` value (WUI_TARGETINGOBJ 4: a selected target). */
  useChance: number;
  /** `dwSkillType`: of a skill, `KT_SKILL` (2, a melee skill that costs FP) or `KT_MAGIC` (1). */
  skillType: number;
  /** `nEvildoing`: of a skill, negative for a harmful one, which needs a target that can be attacked. */
  evildoing: number;
  /** `dwExpertMax`: of a skill, the highest level it can be raised to. */
  expertMax: number;
  /**
   * `dwSubDefine`: of a skill, the row of its first level in `propSkillAdd.csv`: `CProject::GetAddSkillProp`
   * (Project.cpp:879-896) takes the row `dwSubDefine + level - 1`.
   */
  subDefine: number;
  /** `dwComboStyle`: of a skill, where it can be put on the task bar and in the action slot, a `CT_*` value. */
  comboStyle: number;
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
  'dwCost',
  'dwPackMax',
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
  // Piece 7 M2: the missiles, the bullets, a skill's effects, style, push and pain
  'dwSfxObj',
  'dwSfxObj2',
  'dwSfxObj4',
  'dwLinkKind',
  'dwLinkKindBullet',
  'dwAtkStyle',
  'dwDmgShift',
  'tmContinuousPain',
  'nReflect',
  'dwSfxObj5',
  'dwSndAttack1',
  'dwSndAttack2',
  'dwReferStat1',
  // Piece 7 M3: an item's cast
  'dwSkillReadyType',
  // the columns of a skill row
  'dwReqDisLV',
  'dwReSkill1',
  'dwReSkillLevel1',
  'dwReSkill2',
  'dwReSkillLevel2',
  'dwSkillReady',
  'dwUseMotion',
  'dwExeTarget',
  'dwUseChance',
  'dwSkillType',
  'nEvildoing',
  'dwExpertMax',
  'dwSubDefine',
  'dwComboStyle',
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
        ...(kept.nReflect > 0 ? { reflect: kept.nReflect } : {}),
        name,
        ...(kept.dwCost > 0 ? { cost: kept.dwCost } : {}),
        packMax: kept.dwPackMax,
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
        sfxObj: kept.dwSfxObj,
        sfxObj2: kept.dwSfxObj2,
        sfxObj4: kept.dwSfxObj4,
        ...(kept.dwSkillReadyType > 0 ? { skillReadyType: kept.dwSkillReadyType } : {}),
        linkKind: kept.dwLinkKind,
        linkKindBullet: kept.dwLinkKindBullet,
        atkStyle: kept.dwAtkStyle,
        dmgShift: kept.dwDmgShift,
        continuousPain: kept.tmContinuousPain,
        sfxObj5: kept.dwSfxObj5,
        sndAttack1: kept.dwSndAttack1,
        ...(kept.dwSndAttack2 > 0 ? { sndAttack2: kept.dwSndAttack2 } : {}),
        reqLevel: kept.dwReqDisLV,
        reSkills: [kept.dwReSkill1, kept.dwReSkill2],
        reSkillLevels: [kept.dwReSkillLevel1, kept.dwReSkillLevel2],
        skillReady: kept.dwSkillReady,
        useMotion: kept.dwUseMotion,
        exeTarget: kept.dwExeTarget,
        useChance: kept.dwUseChance,
        skillType: kept.dwSkillType,
        evildoing: kept.nEvildoing,
        expertMax: kept.dwExpertMax,
        subDefine: kept.dwSubDefine,
        comboStyle: kept.dwComboStyle,
        icon,
        textFileName,
        command,
      });
    }
    version = r.numberOrEnd('the version');
  }

  return items;
}
