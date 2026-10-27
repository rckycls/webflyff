# Piece 4 research: skills (FlyFF v15 C++ source)

Read-only research for the browser client. Nothing outside this file was modified.

Path shorthand used below (all line numbers are the original file's; Korean comments were read with `iconv -f CP949 -t UTF-8`):

| Prefix | Folder |
| --- | --- |
| `S/` | `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source\` |
| `R/` | `...\Blouflash VS22 V15\Resource\` (game data; `propSkill.txt`, `propSkillAdd.csv`, `define*.h`) |
| `C/` | `...\Blouflash VS22 V15\Client\` (loose `Icon\`, `Model\`, `SFX\`; packs `data.res`, `dataSub1.res`, `dataSub2.res`) |
| `W/` | `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece3-world\` (the browser client, read-only) |

Byte-order and types: everything on the wire is little-endian; `CAr << int/LONG/DWORD/float` = 4 bytes, `short/WORD` = 2, `BYTE` = 1, `BOOL` (= `int`) = 4, `__int64` = 8, `D3DXVECTOR3` = 3 floats, a string = `i32` length + bytes (`S/_Network/Misc/Src/ar.cpp:81-86`, `Misc/Include/ar.h:47-70`). A client packet starts `u32 DPID_UNKNOWN (0xffffffff)`, `u32 PACKETTYPE_*` (`BEFORESENDSOLE`, `S/_Network/Net/Include/dpmng.h:32`; the browser's `clientPacket` in `W/packages/protocol/src/messages/world.ts:10` does the same). A server snapshot message is `u32 objid`, `u16 SNAPSHOTTYPE_*`, then fields.

---

## 0. Which build branch is live

- `__VER` is 15 and `__MAINSERVER` is defined: `S/Neuz/VersionCommon.h:3-4`, `S/WORLDSERVER/VersionCommon.h:3-4`. Counting sections: Neuz top = lines 14-260, `__INTERNALSERVER` 261-405 (dead), `__TESTSERVER` 406-470 (dead), `__MAINSERVER` 471-482; WorldServer top = 14-237, internal 238-338 (dead), test 339-400 (dead), main 401-422.
- Flags that decide skill behaviour, all **off** in the live build because they sit only in the dead INTERNAL section or are commented out:
  - `__SKILL0517` (`S/Neuz/VersionCommon.h:274`, `S/WORLDSERVER/VersionCommon.h:244`): the `#else` branches run, so a skill's level is `pSkill->dwLevel` itself (no `GetSkillLevel` bonus).
  - `__S_NEW_SKILL_2` (commented: Neuz :278, World :245, DB :131): skills are **not** saved to the database right after a level-up or a skill-point spend; they are saved with the normal player save.
  - `__IAOBJ0622` (Neuz :270, World :243): no `objidIAObj` in the client's DESTPOS.
  - `__Y_INTERFACE_VER3` (commented, Neuz :276): the quick-slot keys are **F1-F10** (see 5.6), not 1-0.
- Flags that are **on** from the top section: `__BUFF_1107` (Neuz :153, World :162), `__IMPROVE_SYSTEM_VER15`, `__PETVIS`, `__BS_ADJUST_SYNC`, `__S_SERVER_UNIFY`. The `// __NAME` comments after `#if __VER >= N` are not macros; the version test alone decides (so `__LEGEND`, `__CSC_VER9_1`, `__CSC_VER11_5`, `__SKILL_0706`, `__S8_PK` are all live: `MAX_SKILL_JOB` = 45, skill window `APP_SKILL3`, 8 item-slot bars, `dwCooldown`/`dwCastingTime` columns, `bControl` in USESKILL).
- The client packs and `R/` are byte-identical for `propSkill.txt`, `propSkillAdd.csv`, `propSkill.txt.txt`, `textClient.inc`, `textClient.txt.txt`, `defineSkill.h`, `defineNeuz.h`, `defineJob.h`, `define.h`, `defineAttribute.h`, `defineObj.h`, `defineSound.h`, `mdlDyna.inc`, `propMotion.txt`, `Constant.inc`, `propJob.inc` (MD5 compared through the browser's `ResPacks`). Whether the VM's server `Resource` folder equals `R/` is not checkable here.

---

## 1. The Vagrant skills

### 1.1 IDs and names

Loaded by `CProject::LoadSkill` -> `LoadPropItem( "propSkill.txt", &m_aPropSkill )` (`S/_Common/Project.cpp:375-377`; project file `R/Masquerade.prj:102` `propSkill "propSkill.txt"`, `:110` `propSkillAdd "propSkillAdd.csv"`). `propSkill.txt` is UTF-16LE with a BOM, tab separated, 124 columns, row 1-2 headers, data from line 3.

| Skill ID | Symbol (`R/defineSkill.h:19-21`) | `propSkill.txt` line | Name (en, `R/propSkill.txt.txt:1,3,5`) | Description (`:2,4,6`) |
| --- | --- | --- | --- | --- |
| 1 | `SI_VAG_ONE_CLEANHIT` | 3 | Clean Hit (`IDS_PROPSKILL_TXT_000000`) | A powerful, downward strike. |
| 2 | `SI_VAG_ONE_BRANDISH` | 4 | Flurry (`..._000002`) | Rapid, stabbing attack. |
| 3 | `SI_VAG_ONE_OVERCUTTER` | 5 | Over Cut (`..._000004`) | Powerful, upward, finishing move. |

- The description is the last column `szComment` (`IDS_PROPSKILL_TXT_000001/3/5`); the loader stores it in `ItemProp::szCommand` (`S/_Common/ProjectCmn.cpp:483-487`) and the tooltip prints it (`S/_Interface/WndManager.cpp:4267-4271`).
- The vagrant job is `JOB_VAGRANT` = 0 (`R/defineJob.h:41`); `MAX_JOB_SKILL` = 3 base slots (`:12`); `MAX_JOB_LEVEL` = 15 (`:19`). **The "levels 1-15" are character/job levels (Vagrant is levels 1-15); each Vagrant skill's own maximum level is 10** (`dwExpertMax`, column 105, = 10 for all three).
- Rows with `dwItemKind1 == JTYPE_COMMON` (4, `R/defineJob.h:8`) are not job skills (`S/_Common/Project.cpp:385-390`); `propSkill.txt` has 26 such rows also marked `JOB_VAGRANT` (`SI_GEN_*`, `SI_MOB_BLEEDING`, `SI_KRRR_*`, `SI_MUSHMOOT_*`, ... lines 159-196), they are effects of items/monsters/buffs, never in the skill window. Lines that start with `//` (16 of them, e.g. lines 6, 22, 31) are comment rows between the groups; the C++ scanner skips them as comments.
- **Seven rows count as the Vagrant list**: the three above plus `SI_GEN_EVE_QUICKSTEP/HASTE/HEAPUP/ACCURACY` (`propSkill.txt` lines 207-210, `ver 11`, `JTYPE_BASE`, `JOB_VAGRANT`, `dwReqDisLV` = `=`, max level 5). `LoadSkill` sorts the list by `dwReqDisLV` as an unsigned `DWORD` (`S/_Common/Project.cpp:364-373,394-399`; `qsort` is not stable, so the order of the four equal `=` entries is not guaranteed), so `=` (0xFFFFFFFF) goes last: array order is Clean Hit, Flurry, Over Cut, then the four event buff skills. Neuz shows only the three: `CWndSkillTreeEx::InitItem` sets `m_nCount = 3` for `JOB_VAGRANT` (`S/_Interface/WndField.cpp:6769-6776`) and draws a skill only if `GetSkillPoint()` has a rectangle for it (`:7172-7194`: only `SI_VAG_ONE_*`; the `SI_GEN_EVE_*` have none).

### 1.2 Requirements, maximum level, cost

| Skill | Character level needed (`dwReqDisLV`, col 70) | Prerequisite (`dwReSkill1`/`Level1`, col 71-72) | Max level (`dwExpertMax`, col 105) | SP per level |
| --- | --- | --- | --- | --- |
| Clean Hit | 3 | none (`=`) | 10 | 1 |
| Flurry | 5 | Clean Hit Lv 3 | 10 | 1 |
| Over Cut | 10 | Flurry Lv 3 | 10 | 1 |

- SP per level: `CProject::GetSkillPoint` returns `m_dwVagSP` for `JTYPE_BASE` (`S/_Common/Project.cpp:5143-5153`); `m_dwVagSP = 1`, `m_dwExpertSP = 2`, `m_dwProSP = 3` are the static defaults (`:127-129`). The server also reads them from `R/Constant.inc:36-38` (`LoadConstant`, World only: `Project.cpp:571-572`, `:846-876`, `ReadConstant :802-844`); Neuz keeps the defaults. Both give 1.
- SP earned: on each level-up above the previous record level the server adds `((newLevel - 1) / 20) + 2` points (`S/_Common/MoverParam.cpp:1431-1442`; `if( m_nDeathLevel < m_nLevel )` :1432), i.e. 2 per level for levels 2-20, **28 SP by level 15**; the three skills cost 30 in total. `CMover::AddSkillPoint` adds to both `m_nSkillPoint` and `m_nSkillLevel` (`S/_Common/Mover.cpp:9201-9224`, cap 1280 for non-pro jobs). Quests can also give SP (`m_nEndRewardSkillPoint`, `S/_Common/ScriptHelper.cpp:374-378`).
- Who checks the requirements: `CMover::CheckSkill` (`S/_Common/MoverParam.cpp:117-156`: `GetLevel() >= dwReqDisLV`, and each prerequisite's level `>= dwReSkillLevel`) is used by the client for the skill window (`CWndSkillTreeEx::CheckSkill`, `WndField.cpp:6649-6703`, against the window's local levels) and for dropping onto the bar (`WndTaskBar.cpp:1920-1928`). The server checks the level and prerequisites again in `DoUseSkill` (`S/_Common/MoverSkill.cpp:628-672`), **but not in `OnDoUseSkillPoint`** (3.2).

### 1.3 How the three skills are used (all `propSkill.txt` columns, 0-based)

Identical for the three unless noted:

| Col | Field | Clean Hit | Flurry | Over Cut | Meaning / use |
| --- | --- | --- | --- | --- | --- |
| 16 | `dwHanded` | `HD_ONE` (1) | same | same | The equipped weapon's `dwHanded` must equal this, **server only** (`MoverSkill.cpp:601-622`, `TID_GAME_WRONGITEM` "You need to equip the correct weapon or item to use that skill."). Bare hands are the item `II_WEA_HAN_HAND` whose `dwHanded` is `=` (`R/propItem.txt` line 382), so they fail. |
| 29 | `dwLinkKind` | `=` | | | No weapon-kind requirement beyond `dwHanded`. |
| 38 | `dwAtkStyle` | `AS_DIAGONAL` (2) | `AS_DIAGONAL` | `AS_VERTICAL` (1) | Only `AS_BACK` (8) matters to code (`S/_Common/MoverMove.cpp:130`); not for these. |
| 39 | `dwWeaponType` | `WT_EQUIP` (13) | | | Damage uses the equipped weapon. |
| 51 | `dwAttackRange` | `AR_SHORT` (1) | | | Walk to within **2.0 m** of the target (`CMover::GetAttackRange`, `MoverMsg.cpp:140-155`; `DST_HAWKEYE_RATE` can scale it, :156-163). |
| 70-74 | req. level / prerequisites | see 1.2 | | | |
| 76 | `dwSkillReady` | `=` | | | See cooldown. |
| 81 | `dwSfxObj3` | `XI_SKILL_VAG_ONE_CLEANHIT01` (201) | `..._BRANDISH01` (202) | `..._OVERCUTTER01` (203) | `R/defineObj.h:201-203`. `dwSfxObj`, `2`, `4`, `5` and `dwSfxElemental` are `=`. |
| 84 | `dwUseMotion` | `MTI_VAG_ONE_CLEANHIT` (1000) | `..._BRANDISH` (1001) | `..._OVERCUTTER` (1002) | `R/defineNeuz.h:936-938`. |
| 85/86 | `dwCircleTime`/`dwSkillTime` | `=` | | | No duration. |
| 87 | `dwExeTarget` | `EXT_MELEEATK` (17) | | | `R/define.h:55`. |
| 88 | `dwUseChance` | `WUI_TARGETINGOBJ` (4) | | | Needs a selected target (`R/define.h:13`). |
| 89 | `dwSpellRegion` | `SRO_DIRECT` (1) | | | One target (`R/defineAttribute.h:120`). |
| 91, 93, 95 | `dwReferStat1`, `dwReferTarget1`, `dwReferValue1` | `DST_STR`, `RT_ATTACK`, 5 | 8 | 10 | Damage inputs, server only (1.5). |
| 97 | `dwSkillType` | `KT_SKILL` (2) | | | Melee skill: costs FP, cast time is "1" (`MoverSkill.cpp:270-275,708-770`). `KT_MAGIC` = 1 (`defineAttribute.h:130-131`). |
| 103 | `nEvildoing` | `=` (-1) | | | Harmful skill; `IsAttackAble(target)` is required (`MoverMsg.cpp:373-375`). |
| 104/105/106 | `dwExpertLV`, `dwExpertMax`, `dwSubDefine` | 1, 10, **5** | 1, 10, **15** | 1, 10, **25** | `dwSubDefine` = index of level 1 in `propSkillAdd.csv` (1.4). |
| 108 | `dwComboStyle` | `CT_STEP` (1) | `CT_CIRCLE` (2) | `CT_FINISH` (3) | Decides where the skill may sit on the bar and in the action slot (5.4). `R/defineAttribute.h:16-19`. |
| 118 | `dwSndAttack1` | `SND_PC_DMGSWD` (115) | | | Hit sound (`R/defineSound.h:61`). |
| 120 | `szIcon` | `"""skill_VagOneCleanh.dds"""` | `skill_VagOneBrandi.dds` | `skill_VagOneOvercu.dds` | 6. |

- **Range**: 2.0 m arrival range (AR_SHORT). `dwSkillRange` of the add-skill rows is `=`.
- **Cooldown**: none. The add-skill `dwCooldown` is `=` (0xFFFFFFFF), the loader then copies `propSkill.dwSkillReady`, also `=` (`S/_Common/Project.cpp:2587-2596`), and `OnMeleeSkill` skips `SetCoolTime` when it is `0xFFFFFFFF` (`S/_Common/MoverActEvent.cpp:154-160`). `dwCooldown` > 0 would also forbid the action slot (5.4).
- **Casting time**: none. Melee skills send `nCastingTime = 1` (`MoverSkill.cpp:272-274`); the motion is played as is (the "+2" in `:830-831` is skipped because `nCastingTime != 0`).
- **MP/FP**: MP cost `=` (-1, treated as none: `(int)nReqMp > 0` at `MoverSkill.cpp:738,856-857`); FP cost per level below. FP is taken **when the skill starts** (`IncFatiguePoint`, `MoverSkill.cpp:850-860`), before the USESKILL snapshot, and reaches the client as SETPOINTPARAM `DST_FP` (4.7). Real cost = `nReqFp - nReqFp * DST_FP_DEC_RATE / 100` (`S/_Common/MoverAttack.cpp:2134-2140`).
- **Animation timing**: skill motions play at 1.0x speed (`ProcessAniSpeed` lists no melee-skill state: `Mover.cpp:3084-3119`); a `.ani` runs at `perSlerp * 60` frames/s = 30 fps; the state ends early at 65% of the frames (`ActionMoverState.cpp:614-619`).

### 1.4 Per-level table (`R/propSkillAdd.csv`, lines 3-32)

Comma separated, `//` header lines 1-2, 36 columns, read with `script.GetNumber( TRUE )` (comma mode) by `CProject::LoadPropAddSkill` (`S/_Common/Project.cpp:2522-2611`); `=` is `NULL_ID` (`S/_Common/scanner.cpp:878-880`). Struct: `AddSkillProp` (`S/_Common/ProjectCmn.h:99-161`). Index = the row's `dwID` (`SA_*` define, e.g. `SA_CLEANHIT_L01` = 5 ... `R/defineSkill.h:393-422`; stored with `SetAtGrow( i, ... )`, :2604); lookup `GetAddSkillProp( dwSubDefine, level )` = `m_aPropAddSkill[ dwSubDefine + level - 1 ]` (`Project.cpp:879-896`; an index below 5 is bumped by 5, not relevant here).

Columns in file order (0-based): 0 `dwID` (SA_*), 1 `dwName` (the SI_* it belongs to), 2 `dwSkillLvl`, 3 `dwAbilityMin`, 4 `dwAbilityMax`, 5-6 `dwAbilityMinPVP/MaxPVP`, 7 `dwAttackSpeed`, 8 `dwDmgShift`, 9 `nProbability`, 10 `nProbabilityPVP`, 11 `dwTaunt`, 12-13 `dwDestParam1/2`, 14-15 `nAdjParamVal1/2`, 16-17 `dwChgParamVal1/2`, 18-20 `nDestData1[0..2]`, 21 `dwActiveSkill`, 22 `dwActiveSkillRate`, 23 `dwActiveSkillRatePVP`, 24 `nReqMp`, 25 `nReqFp`, 26 `dwCooldown`, 27 `dwCastingTime`, 28 `dwSkillRange`, 29 `dwCircleTime`, 30 `dwPainTime`, 31 `dwSkillTime`, 32 `nSkillCount`, 33 `dwSkillExp`, 34 `dwExp`, 35 `dwComboSkillTime` (`Project.cpp:2528-2579`). For all 30 Vagrant rows columns 8-23 and 26-32 are `=`, 7 is 150, 33-35 are legacy (`dwSkillExp`, `dwExp`, `dwComboSkillTime` are not read at run time).

Ability min-max and FP cost per level (`nReqMp` always `=`):

| Lv | Clean Hit (SA ids 5-14) min-max / FP | Flurry (15-24) | Over Cut (25-34) |
| --- | --- | --- | --- |
| 1 | 10-11 / 5 | 5-6 / 10 | 20-21 / 15 |
| 2 | 10-11 / 5 | 5-6 / 10 | 20-21 / 15 |
| 3 | 10-11 / 5 | 5-6 / 10 | 20-21 / 15 |
| 4 | 10-11 / 5 | 5-6 / 12 | 21-22 / 18 |
| 5 | 12-13 / 8 | 6-7 / 12 | 21-22 / 18 |
| 6 | 12-13 / 8 | 6-7 / 12 | 21-22 / 18 |
| 7 | 12-13 / 8 | 6-7 / 15 | 22-23 / 20 |
| 8 | 12-13 / 8 | 6-7 / 15 | 22-23 / 20 |
| 9 | 12-13 / 10 | 6-7 / 15 | 22-23 / 22 |
| 10 | 13-13 / 10 | 7-8 / 15 | 23-24 / 22 |

### 1.5 Damage (server only; the client only displays the result)

`CMover::GetMeleeSkillPower` (`S/_Common/MoverAttack.cpp:1462-1542`), called from `CAttackArbiter::CalcATK` (`S/WORLDSERVER/AttackArbiter.cpp:318-319`):
- `refer = (int)( (ReferValue1/10.0) * STR + skillLevel * (STR/50.0) )` for `RT_ATTACK` (:1499-1501; `ReferStat2` is `=` for these skills).
- With a weapon: `powerMin = (weaponMin + (abilityMin + weapon.nAddSkillMin) * 5 + refer - 20) * (16 + skillLevel) / 13`, and the same with Max (:1520-1524); `GetItemATKPower` gives weaponMin/Max (:1481).
- Then `+ DST_CHR_DMG + GetPlusWeaponATK(weaponType)` (:1531-1534), a random value between min and max (:1536-1541), `* GetATKMultiplier`, `+ DST_ATKPOWER` (`AttackArbiter.cpp:332-338`), then defense, parry and critical (`ApplyDPC`, `MoverAttack.cpp:1572-1613`: critical x2.3, x2.6 on the 4th combo hit, `AF_FLYING` knock-back chance).
- PvP uses `dwAbilityMinPVP/MaxPVP` (equal to the normal ones here: `Project.cpp:2582-2586`).
- A generic web client needs none of this: the final number arrives in DAMAGE (4.8).

### 1.6 Motions, hit frames, sound frames (read with the browser's `readAni`)

Files `C/Model/Mvr_male_SklVag*.ani` and `Mvr_female_...` (same numbers for both sexes). Motion names come from the `male` block of `R/mdlDyna.inc` (`"male" MI_MALE` at :24753; `"SklVagCleanHit" MTI_VAG_ONE_CLEANHIT` etc. at :24895-24897) and the `female` block (:25550; names :25683-25685). They are already converted: `dist/assets/data/movers.*.json` `Male`/`Female` `motions["1000".."1002"]` -> `motions/mvr_male/mvr_male_sklvagcleanhit.glb` etc. (checked).

| MTI | File | Frames | Speed | `MA_HIT` frame(s) (`attr` 1) | `MA_SOUND` frame(s) (`attr` 2, `soundId`) | Cut at 65% |
| --- | --- | --- | --- | --- | --- | --- |
| 1000 | `..._SklVagCleanHit.ani` | 51 | 30 fps | 27 | 20 -> 211 `SND_PC_SKILLD_CLEANHIT` | frame 33.15 |
| 1001 | `..._SklVagBrandish.ani` | 61 | 30 fps | 7, 23, 39 | 11, 19, 27, 35, 43 -> 212 `SND_PC_SKILLD_BRANDISH` | frame 39.65 |
| 1002 | `..._SklVagOverCutter.ani` | 51 | 30 fps | 23 | 17 -> 213 `SND_PC_SKILLD_OVERCUTTER` | frame 33.15 |

(`R/defineSound.h:162-164`.) Skills play the motion with `MOP_SWDFORCE | MOP_NO_TRANS | MOP_FIXED` (`ActionMoverMsg.cpp:766`): `MOP_FIXED` = no weapon-based motion offset (the normal `SetMotion` adds +200/+500/+800 ... per weapon type, `S/_Common/Mover.cpp:4822-4902`), `MOP_NO_TRANS` = no blending, `MOP_SWDFORCE` = sword trail (`:4931-4966`). Hit detection: `CMotion::IsAttrHit( fOldFrame, fCurFrame )` is true when the current frame carries `MA_HIT` and its exact frame number lies in `(old, current]` (`S/_Common/Bone.h:162-170`). **The converted `.glb` motions carry no hit or sound frame data** (checked: no `extras`; `W/tools/convert/src/models/motionGlb.ts` has no attribute handling), although `readAni` returns them (`W/packages/formats/src/model/ani.ts:71-90`).

### 1.7 Which `propSkill.txt` columns a generic client needs

Loader order and field names: `S/_Common/ProjectCmn.cpp:300-487` (identical to the browser's `ITEM_COLUMNS`, `W/packages/formats/src/inc/propItem.ts:53-76`). Quoted fields (`szIcon`, `szTextFile`) are `"""x"""` = three tokens. Row version filter: `nVer <= 15` (`ProjectCmn.cpp:516`).

| Col | Field | Needed by the client for |
| --- | --- | --- |
| 0 | `nVer` | filter (`<= 15`) |
| 1 | `dwID` | the skill id (`SI_*`) |
| 2 | `szName` | name (string table, `propSkill.txt.txt`) |
| 5 | `dwItemKind1` (JTYPE) | job-skill list membership (not `JTYPE_COMMON`), SP cost (`GetSkillPoint`), section (Base/Expert/Pro/Master/Hero) |
| 6 | `dwItemKind2` (JOB) | which job's list |
| 28, 29 | `dwLinkKindBullet`, `dwLinkKind` | bow/arrow requirement (`IsBullet`) and weapon-kind requirement (server) |
| 16 | `dwHanded` | server weapon check (client may pre-check) |
| 38 | `dwAtkStyle` | `AS_BACK` rule (`MoverMove.cpp:130`) |
| 51 | `dwAttackRange` | arrival range (`AR_*` -> metres, `MoverMsg.cpp:140-166`) |
| 70-74 | `dwReqDisLV`, `dwReSkill1/Level1/2/Level2` | window enable rules, tooltip lines |
| 76 | `dwSkillReady` | fallback for add-skill `dwCooldown` |
| 79-83 | `dwSfxObj`..`dwSfxObj5` | effects (4.9) |
| 84 | `dwUseMotion` | motion id (`MTI_*`) |
| 85, 86 | `dwCircleTime`, `dwSkillTime` | (only for buffs) |
| 87, 88, 89 | `dwExeTarget`, `dwUseChance`, `dwSpellRegion` | how the target is found, approach rule, area |
| 97 | `dwSkillType` | `KT_SKILL` / `KT_MAGIC` -> message type and cost |
| 103 | `nEvildoing` | harmful skill rule; negative = needs an attackable target |
| 104-106 | `dwExpertLV`, `dwExpertMax`, `dwSubDefine` | max level, add-skill index |
| 108 | `dwComboStyle` | bar / action-slot rules |
| 118 | `dwSndAttack1` | hit sound |
| 120 | `szIcon` | icon file |
| 123 | `szComment` (-> `szCommand`) | description text |
| 44, 50, 53-67, 91-96 | `tmContinuousPain`, `dwDmgShift`, dest params, active skill, `dwRefer*` | server only (effects, damage, knock-back) |

Add-skill (`propSkillAdd.csv`) fields a client needs: `dwSkillLvl`, `nReqMp`/`nReqFp` (tooltip: `PutToolTip_Skill`, `WndManager.cpp:4207-4216`), `dwCooldown` (cooldown spinner `WndTaskBar.cpp:2848-2871`, action-slot rule :1818-1830, `SetCoolTime` `MoverActEvent.cpp:451-469`), `dwSkillTime` (> 0 chooses the effect branch, `Ctrl.cpp:885`), `dwSkillRange`, `nSkillCount` (extra hits, `ActionMoverState.cpp:672-676`), `dwCircleTime` (COMMONSKILL, `DPClient.cpp:15257`). Server-only: ability, PvP, probability, dest params, `dwCastingTime` (sent in USESKILL), pain time.

---

## 2. Skill data the player has

### 2.1 The array and the JOIN bundle

- Per-player skills: `SKILL m_aJobSkill[ MAX_SKILL_JOB ]` (`S/_Common/Mover.h:524`), `SKILL` = `{ DWORD dwSkill; DWORD dwLevel; }`, 8 bytes (`S/_Common/Item.h:309-314`; same on the DB side `S/_Network/Objects/Obj.h:247-252`). `MAX_SKILL_JOB = MAX_JOB_SKILL + MAX_EXPERT_SKILL + MAX_PRO_SKILL + MAX_MASTER_SKILL + MAX_HERO_SKILL` = 3 + 20 + 20 + 1 + 1 = **45** (`Mover.h:95-100`, `__VER >= 10` branch; `R/defineJob.h:12-17`).
- Slots: [0..2] base (Vagrant), [3..22] expert (from `SetExpert`/`AddChangeJob`: `MoverParam.cpp:466-476,1624`), [23..42] pro (`MoverParam.cpp:1638`), [43] master, [44] hero. **The index into this array is what every shortcut and every USESKILL/queue entry calls the skill id**, not the `SI_*` value.
- Empty slot: `dwSkill = NULL_ID` (0xFFFFFFFF), `dwLevel = 0` (`Mover.cpp:1482-1485`). Initial fill: `prj.m_aJobSkill[ m_nJob ]` sorted by required level, from index 0 for a Vagrant (`Mover.cpp:1487-1498`; DB side `S/_Network/Objects/Obj.cpp:306-324`), then each row of the database skill table overwrites its `SkillPosition` (`S/_Database/DbManagerFun.cpp:1211-1234`; saved by `SaveSkill`, `DbManagerSave.cpp:681-700`). (Corrected in Task 18: for a **new** character the join runs the DB server's `CMover::InitProp` while `m_nJob` is still -1 (`_Network/Objects/Obj.cpp:163`, the job-skill fill is under `if( m_nJob != -1 )` at `:314-324`), so only the three `tblSkillPoint` rows land: skills 1-3 at level 0 (`Database.sql:10678-10683`), the other 42 slots empty. The paragraph below describes the fill once a job is set.) With the shipped data a Vagrant array therefore holds **7 filled slots**: [0..2] the real skills (level 0 until points are spent), [3..6] the four `SI_GEN_EVE_*` placeholders (level 0; they are overwritten when the first job is taken, `AddChangeJob` writes from index 3). Not verified against a live JOIN (the database content is in SQL tables not in this tree).
- The player's own ADD_OBJ (`METHOD_NONE`, first real message of JOIN after the environment/world-info ones: `CUser::Open`, `S/WORLDSERVER/User.cpp:308-349`) is written by `CMover::Serialize` (`S/_Common/ObjSerializeOpt.cpp:97`, storing :198-277, loading :509-640):

Wire order of the `METHOD_NONE` block (storing `ObjSerializeOpt.cpp:198-277`, loading :509-640); the skill-related parts:

| Position | Field | Type | Source |
| --- | --- | --- | --- |
| after `m_nExp1` (i64) | `m_nSkillLevel` (skill points earned in total) | i32 | written :212, read :534 |
| next | `m_nSkillPoint` (unspent) | i32 | written :213, read :535 |
| ... quests, `m_idMurderer`, `m_nRemainGP` + unused short, then the 31 `m_aEquipInfo[i].dwId` (u32 each) | | | :217-236 / :538-559 |
| **right after the 31 equipment ids** | **`m_aJobSkill[45]`**: 45 x { `dwSkill` u32, `dwLevel` u32 } | 360 bytes | written :237, read :561 (a raw `Write( m_aJobSkill, sizeof(SKILL) * MAX_SKILL_JOB )`) |
| next | `(BYTE)m_nCheerPoint`, `DWORD m_dwTickCheer - GetTickCount()` | u8, u32 | :239, :569-570 |
| then | `m_nSlot`, bank gold/ids, `m_nPlusMaxHitPoint`, attack/defense resists, angel exp/level, inventory, banks, pet, pocket, mute, honor titles, campus | ... | :241-276, still skipped by the browser |

  **The browser reads `m_nSkillLevel`/`m_nSkillPoint` and drops them (`W/packages/protocol/src/world/addObj.ts:162-163`), reads the 31 equipment ids (:175-177), then `skipRest()` (addObj.ts:78) leaves the skill array and everything after unread.** Piece 4 extends `readOwnEquipment` by 45 pairs and keeps SP and the array.
- Other players (METHOD_EXCLUDE_ITEM) carry no skills; their skill use is learned from USESKILL (4.5).
- Current FP/MP of the own character: `m_nManaPoint`, `m_nFatiguePoint` as u16 at the start of the same block (:200-201, read :518-519; the browser reads and drops, addObj.ts:156-157). Max FP is `GetMaxFatiguePoint()` from stats (`MoverParam.cpp:2825-2839`), not on the wire.

### 2.2 Messages that change skill state later (all SNAPSHOT bundle messages; dispatch in `CDPClient::OnSnapshot`, `S/Neuz/DPClient.cpp:366`+)

| Type | Msg objid | Fields | Sent when | Client handler |
| --- | --- | --- | --- | --- |
| `SETEXPERIENCE` 0x0012 (`MsgHdr.h:901`) | own | `i64 nExp1`, `u16 wLevel`, `i32 nSkillLevel`, `i32 nSkillPoint`, `i64 nDeathExp`, `u16 wDeathLevel` | every exp/level change (`CUser::AddSetExperience`, `User.cpp:1139-1149`; defaults -1 / 0xffff) | `OnSetExperience` `DPClient.cpp:3376-3430` (SP up -> level-up sfx, music, "New Skill Points are now available.", skill window `InitItem`) |
| `DOUSESKILLPOINT` 0x007d (:1031) | own | 45 x { `u32 dwSkill`, `u32 dwLevel` }, then `i32 nSkillPoint` | the answer to a successful skill-point spend; also master/hero level-ups (`MoverSkill.cpp:88`) | `OnDoUseSkillPoint` `DPClient.cpp:14730-14748` (sets levels by skill id via `GetSkill( dwSkill )`, then `m_nSkillPoint`) |
| `INITSKILLPOINT` 0x007c (:1030) | own | `i32 nSkillPoint` | the "Recurrence" scroll `II_SYS_SYS_SCR_RECCURENCE` (`MoverSkill.cpp:2211-2217`) or the GM command | `OnInitSkillPoint` `DPClient.cpp:14687-14728`: SP = value, every non-master/hero skill level := 0, skill window refreshed, message "...skill points have been reset..." The server (`InitSkillExp`, `Mover.cpp:1855-1900`) refunds `level x cost`, clears all `SHORTCUT_SKILL` shortcuts and re-sends TASKBAR (:1896-1897). |
| `SETSKILLLEVEL` 0x0026 | other player | `u32 dwSkill`, `u32 dwLevel` | `AddSetSkillLevel` (`User.cpp:4725-4738`) | `OnSetSkillLevel` reads and ignores (`DPClient.cpp:3444-3448`) |
| `SET_JOB_SKILL` 0x00a7 (:1076) | own | `i32 nJob`, 45 x {u32, u32}, `32 x u32 dwJobLv` (unused) | job change (`AddSetChangeJob`, `User.cpp:1181-1196`; `AddChangeJob`, `MoverParam.cpp:1611-1680`) | `OnSetChangeJob` `DPClient.cpp:3600-3654`. `SET_NEAR_JOB_SKILL` 0x00a8 is the version for others (`User.cpp:5111-5133`). Out of the Vagrant scope. |
| `COMMONSKILL` 0x00dd (:1133) | own | `u32 dwSkill`, `u32 dwLevel` | only `SI_GEN_FLASH` (`Ctrl.cpp:1280-1283`) | `OnCommonSkill` `DPClient.cpp:15239-15259` (flash timer) |
| `TASKBAR` 0x0097 (:1058) | own | see 5.2 | JOIN, job change, skill reset | `OnTaskBar` `DPClient.cpp:4285-4288` |

No "new skill learned" message exists: a skill is "learned" when its level becomes > 0 (DOUSESKILLPOINT) or when the character level reaches `dwReqDisLV` (client-only text, `CMover::PutLvUpSkillName_1/2`, `MoverParam.cpp:160-309`, string `TID_GAME_REAPSKILL` "You've learned %s. You can now allocate skill points to this ability.").

---

## 3. Raising a skill level

### 3.1 The skill window (`CWndSkillTreeEx`, `APP_SKILL3` = 622, hotkey K, icon `Icon_Skill.dds`: `S/_Interface/FuncApplet.cpp:214`, `R/ResData.h:527`)

- `InitItem`: if `m_nSkillPoint > 0` it takes a **copy** of the 45 skills (`m_apSkill`) and `m_nCurrSkillPoint = m_nSkillPoint`; otherwise it works on the live array and the buttons are inert (`S/_Interface/WndField.cpp:6736-6751`, :8049). `InitItem` is called again from `OnSetExperience` (SP changed), `OnDoUseSkillPoint`, `OnInitSkillPoint`, `OnSetChangeJob`.
- Active skill = `CheckSkill( i )` against the window's local copy (level >= `dwReqDisLV` and prerequisite levels, :6649-6703). Click selects it (`OnLButtonDown` :8251-8311).
- "+" (`WIDC_BUTTON1`): if the skill's cost <= `m_nCurrSkillPoint` and local level < `dwExpertMax`: `m_nCurrSkillPoint -= cost; ++level` (:8057-8072). "-" (`WIDC_BUTTON2`): only if the local level is above the player's real level (`IsDownPoint`, :6531-6545): refunds and, through `SubSkillPointDown`, resets dependent skills whose prerequisite drops below its requirement (:6547-6591, recursive). Reset (`WIDC_BUTTON3`): reload from the player (:8083-8089). **Finish** (`WIDC_BUTTON4`): if anything changed, opens the confirmation `CWndReSkillWarning` ("Confirm changes to skill points?", `TID_GAME_SKILLLEVEL_CHANGE`) (:8090-8098); **Yes** sends `SendDoUseSkillPoint( pSkillTree->GetSkill() )` (`WndField.cpp:13728-13741`). Closing the window with unsaved changes asks the same question (:8104-8117; also when toggling it from the bar, `WndManager.cpp:2579-2600`).
- Display: icon 27x27 at the position of the layout control (`GetSkillPoint` rects; Vagrant = controls `WIDC_CUSTOM2/3/4`, `WndField.cpp:7172-7194`), the level digit from `C/Icon/icon_IconSkillLevel.tga` (index `level - 1`; `+20` for a level changed but not yet saved; `19` for the max level) (:7816-7832), points left in `WIDC_STATIC9` (:7847-7850). Selected skill details in `WIDC_CUSTOM1` (:7866-7881). A skill that is active but still at level 0 gets its icon drawn only while the mouse is over it (:7834-7843); what the unlearned slots look like otherwise comes from the window layout art, which was not examined.
- Double-click an active skill: puts it in the action slot (`SetSkillQueue`) if no queue is running (:8318-8393). Drag: creates the global shortcut `{ SHORTCUT_SKILL, type 0, id = array index, index = skill id, data 0, string = name }` for dropping on the bar (`OnMouseMove`, :7438-7463).

### 3.2 DOUSESKILLPOINT (client -> server) and the server's checks

`CDPClient::SendDoUseSkillPoint` (`S/Neuz/DPClient.cpp:9710-9728`): packet `u32 DPID_UNKNOWN`, `u32 0x000f0003` (`PACKETTYPE_DOUSESKILLPOINT`, `MsgHdr.h:120`), then **45 x { u32 dwSkill, u32 dwLevel }** (the whole local copy, slot by slot, `NULL_ID` for empty slots). Total 8 + 360 bytes.

`CDPSrvr::OnDoUseSkillPoint` (`S/WORLDSERVER/DPSrvr.cpp:1104-1167`, registered :175), for every slot i with `dwSkill != NULL_ID` and a valid prop:
1. error `TID_RESKILLPOINT_ERROR` ("There was a problem during skill redistribution. Please try again.") and stop if the new level is **below the player's current level in slot i** or above `dwExpertMax` (:1123-1127);
2. points to pay = sum over slots of `(newLevel - oldLevel) * prj.GetSkillPoint( prop of the *sent* dwSkill )` (:1128-1129);
3. nothing changed -> return **without any reply** (:1132-1133); points > `m_nSkillPoint` -> same error (:1134-1138);
4. else `m_nSkillPoint -= cost`, set each slot's level to the sent level, log (:1141-1160), broadcast `CREATESFXOBJ` `XI_SYS_EXCHAN01` (108) at the player (:1161), reply DOUSESKILLPOINT with **the array the client sent** and the new SP (`CUser::AddDoUseSkillPoint`, `User.cpp:6566-6582`).
- **Not checked by the server**: the character level, the prerequisite skills, that the sent `dwSkill` of slot i is the player's own `dwSkill` of slot i (only the level is applied to the server's slot). A faithful client sends the player's own skill ids with its edited levels, and must itself apply the rules of 3.1.
- Saved to the database only with the next normal save (`__S_NEW_SKILL_2` off).

---

## 4. Using a skill in Neuz (Clean Hit as the example)

### 4.1 Pressing a slot -> `CMD_SetUseSkill`

1. Trigger: click on a bar slot (`CWndTaskBar::OnLButtonUp` `WndTaskBar.cpp:2178-2188`; queue slots are not clickable, `m_dwData != 2`), or F1-F10 in `CWndTaskBar::Process` (:2395-2427). Both call `CWndMgr::ObjectExecutor( shortcut )`; a skill shortcut ends in `UseSkillShortCut( type, index )` (`WndManager.cpp:2778-2782,2876-2879`; refused while the player runs a private shop; `m_dwType == 2` party skills take the branch at :2782-2875 instead).
2. `CWndMgr::UseSkillShortCut` (`WndManager.cpp:6820-6864`): `lpSkill = g_pPlayer->GetSkill( 0, index )` (`m_aJobSkill[index]`); target = the focused object (`GetObjFocus`, any type except `OT_OBJ`); runs only if the action slot is idle (`m_nExecute == 0`) **and the target is a mover or none** (:6832); `IsBullet` (arrow) check (:6838); `CMD_SetUseSkill( objid, index )`; success clears `m_dwNextSkill`; failure while the player is in an attack action reserves the skill (`SetNextSkill( index )`), repeated every frame by `CWndWorld::Process` (`WndWorld.cpp:8503-8513`, left click cancels it, :6976).
3. `CMover::CMD_SetUseSkill` (`S/_Common/MoverMsg.cpp:172-423`) returns 0 (nothing happens) when: flying (:176), in an attack action (:177), jumping (:178), in `OBJSTA_DMG_FLY` (:179), dead (:180), skill slot empty or no prop (:182-194), during a base-motion cast `STATE_BASEMOTION_MODE` (also sends `StateModeCancel`, :196-202), harmful skill on a non-attackable target (:373-375), target dead (:383-385), no target for the default target kinds (:413). `WUI_TARGETINGOBJ` re-reads the focus (:213-224). Otherwise `SetDestObj( idTarget, GetAttackRange( dwAttackRange ) )` (:414; 2.0 m) and `SetCmd( OBJACT_USESKILL, index, idTarget, sutType )` (:419). `SetDestObj` sends **PLAYERSETDESTOBJ** when the destination changes (`MoverMsg.cpp:53-65`; 4.4).
4. Client does **not** check MP/FP, cooldown, level or weapon here (the cooldown spinner is drawn only).
5. The player walks to the target. On arrival `CMover::ProcessMoveArrival` (`S/_Common/MoverMove.cpp:73-184`, `OBJACT_USESKILL` branch): needs `m_SkillTimerStop || m_SkillTimer.TimeOut()` (1 s throttle set in `Mover.cpp:509`, restarted after each send at `MoverMove.cpp:181-182`; `m_SkillTimerStop` is set TRUE by a key-up and FALSE by a key-down, `WndWorld.cpp:7734,7756`, so a fresh key press is never throttled but a held key repeats once a second), a clear line of sight `IntersectObjLine` at +0.5 m (else "This action has been blocked by an obstacle..", cancels, :83-92), `AS_BACK` rule (`fDir >= 0.3` or "You cannot use the skill.", :130-153), and for chaotic targets Ctrl (:157-166); then **`SendUseSkill( 0, index, idTarget, sutType, bControl )`** (:170-171), sets `m_dwReqFlag |= REQ_USESKILL` (:176), `ClearDestObj`, `OBJMSG_STOP` (:179-180). The client does **not** start the motion itself: it waits for the server.
6. While `REQ_USESKILL` is set, sit/stand/pickup/jump/other actions are refused (`ActionMoverMsg.cpp:164,182,198,512`; the browser omits this, `W/apps/client/src/world/sim/ActionMover.ts:351`).

### 4.2 USESKILL (client -> server)

`CDPClient::SendUseSkill` (`DPClient.cpp:9855-9867`), packet type `PACKETTYPE_USESKILL` = 0x00ff0020 (`MsgHdr.h:148`), registered `DPSrvr.cpp:237`:

| Field | Type | Value |
| --- | --- | --- |
| (header) | u32 + u32 | `0xffffffff`, `0x00ff0020` |
| `wType` | u16 | 0 (server forces 0, `DPSrvrLux.cpp:49`) |
| `wId` | u16 | index into `m_aJobSkill` (0..44) |
| `objid` | u32 | target object id (the own id for self-target skills) |
| `nUseType` | i32 | `SKILLUSETYPE`: `SUT_NORMAL` 0 (bar slot), `SUT_QUEUESTART` 1 (action slot, first skill), `SUT_QUEUEING` 2 (server-driven chain) (`Mover.h:134-139`). The client sends 0 or 1 only. |
| `bControl` | i32 (BOOL) | 1 if Ctrl was down (`GetAsyncKeyState( VK_CONTROL )`, `MoverMove.cpp:170`); only matters for PK; 0 is fine |

Total 24 bytes.

### 4.3 Server handler `CDPSrvr::OnUseSkill` (`S/WORLDSERVER/DPSrvrLux.cpp:32-99`)

Silent returns (no reply; the client's `REQ_USESKILL` would stay set): `wId >= 45` (:46), the user is a private-shop vendor (:53), `m_bAllAction` false (:57), no skill in the slot or `dwSkill == NULL_ID` (:62-65), no prop (:66-68), **level 0 or above `dwExpertMax`** (:74-75). Otherwise `pUser->DoUseSkill( 0, idx, objid, nUseType, bControl )`; on `FALSE` it sends **CLEAR_USESKILL** to that user (`AddHdr( GETID( pUser ), SNAPSHOTTYPE_CLEAR_USESKILL )`, :93-97). On `TRUE` with `SUT_QUEUESTART` it sets `m_playTaskBar.m_nUsedSkillQueue = 0` (:84-87).

`CMover::DoUseSkill( int nType, int nIdx, ... )` (`MoverSkill.cpp:163-283`) then the full `DoUseSkill( dwSkill, nLevel, ... )` (:287-1063) on the server returns FALSE (with a `TID_*` text in most cases) when: dead (:293), flying (:294), `MVRF_NOATTACK` (:295), guild-war spectator (:303-315), `NO_ATTACK_MODE` (:317), invalid target (:336-338), `SI_BLD_SUP_BERSERK` buff (:373), peaceful NPC target (:420), stealing someone else's monster (:423-428), PK-region rule (:347-372), wrong weapon (`dwLinkKind`/`dwHanded`, "You need to equip the correct weapon...", :490-622), character level below `dwReqDisLV` (:628-636), prerequisite skill level (:638-672, texts "SkillLevel1 "/"SkillLevel2 "), cooldown remaining ("Please wait.", :685-697), not enough FP (`TID_GAME_REQFP` "Not enough FP.", :730-735), MP for KT_SKILL with MP cost (:738-746); `SendActMsg( OBJMSG_MELEESKILL )` returns -2 when an action is already running (`IsAction()` or `OBJSTA_ATK_ALL` set, `ActionMoverMsg.cpp:738-745`) -> FALSE (:890-893).

On success (`nRet == 1`, :840): `SetActParam( OBJACT_USESKILL, dwSkill, idTarget )`, `m_nAParam[3] = level`; **FP is deducted now** (`IncFatiguePoint`, :850-860 -> SETPOINTPARAM `DST_FP` to all who see the player), harmful skills mark the target (`SetJJim`, :880-884), then `g_UserMng.AddUseSkill( this, dwSkill, nLevel, idFocusObj, sutType, nCastingTime )` (:887). The target is turned to face (`SetAngle( GetDegree( target, this ) )` :450).

### 4.4 Other client -> server packets the use of a skill needs

| Packet | Type | Fields | Why |
| --- | --- | --- | --- |
| `PLAYERSETDESTOBJ` | 0xffffff07 (`MsgHdr.h:266`, `DPSrvr.cpp:190`) | `u32 objid`, `f32 fRange` | sent by `SetDestObj` when the approach target changes (`DPClient.cpp:10923-10932`); the server sets the destination and broadcasts MOVERSETDESTOBJ (`DPSrvr.cpp:12794-12820`) |
| `SETTARGET` | 0x00ff0023 (`MsgHdr.h:151`, `DPSrvr.cpp:238`) | `u32 idTarget`, `u8 bClear` | on every focus change: `(old, 1)` to release, `(new, 2)` to focus, `(0xffffffff, 2)` to clear (`S/_Common/World.cpp:300-344`). The server remembers `bClear == 2` as `m_idSetTarget` (`DPSrvr.cpp:2183-2223`) and uses it as the target of `WUI_TARGETINGOBJ` skills of the action-slot chain (`MoverMsg.cpp:220-222`) |
| `ENDSKILLQUEUE` | 0x00ff00d5 (`MsgHdr.h:195`, `DPSrvr.cpp:317`) | none | left click while the queue runs (`WndWorld.cpp:6978-6983`, `DPClient.cpp:15819-15822`) |

### 4.5 USESKILL (server -> clients) and how Neuz plays it

`CUserMng::AddUseSkill` (`S/WORLDSERVER/User.cpp:4540-4552`) sends to everyone who sees the caster, **the caster included** (the caster is in its own `m_2pc`, `User.cpp:314`): message objid = caster, type `SNAPSHOTTYPE_USESKILL` 0x0019 (`MsgHdr.h:908`); fields: `u32 dwSkill` (the real `SI_*` id), `u32 dwLevel`, `u32 objid` (target), `i32 nUseType`, `i32 nCastingTime` (1 for KT_SKILL; for KT_MAGIC the cast time in 1/15 s ticks).

`CDPClient::OnUseSkill( objid, ar )` (`DPClient.cpp:3894-3950`): clears `REQ_USESKILL` on the caster, calls `pMover->DoUseSkill( 0, -1, id, nUseType, FALSE, nCastingTime, dwSkill, dwLevel )` (`nIdx -1` = use the skill/level of the packet, no array lookup: `MoverSkill.cpp:163-232`), then the client-variant `DoUseSkill( dwSkill, nLevel, ... )` (`MoverSkill.cpp:287-1063`) does, for KT_SKILL:
- repeats the target and state checks that are not `#ifdef __WORLDSERVER` (dead/flying/no-attack, target valid) (:293-338), faces the target (:450), `SendActMsg( OBJMSG_STOP ); ClearDest();` (:701-702);
- `dwMsg = OBJMSG_MELEESKILL` (37 in the `OBJMSG` enum, `S/_Common/MoverMsg.h:144`), motion = `dwUseMotion` (no +2 since `nCastingTime = 1`), `SendActMsg( dwMsg, nMotion, idFocusObj, nCastingTime, dwSkill )` (:835). The action mover (`ActionMoverMsg.cpp:736-772`) clears the old state, sets `OBJSTA_ATK_MELEESKILL` (0x00090000, `MoverMsg.h:58`) and `SetMotion( nMotion, ANILOOP_1PLAY, MOP_SWDFORCE | MOP_NO_TRANS | MOP_FIXED )`; hit counter `m_nMotionHitCount = 0`.
- own mover: `m_nExecute` 1 -> 2 (action slot running) (:896-903); cast-start effect `dwSfxObj` at the caster if set (:993-996; none for Vagrant skills); for non-melee targets that are players a text line (:997-1016).
- `OnUseSkill` afterwards, for the own mover with the option "auto attack" on: sets `m_bAutoAttack` when the held weapon is not staff/cheer stick/wand and `dwExeTarget != EXT_SELFCHGPARAMET` (`DPClient.cpp:3912-3943`).

For another player the path is identical (`IsActiveMover()` false): its motion starts when this message arrives.

### 4.6 CLEAR_USESKILL / end of queue

- `CLEAR_USESKILL` 0x001a (`MsgHdr.h:909`), no fields (objid = player): `OnClearUseSkill` (`DPClient.cpp:3952-3964`): clears `REQ_USESKILL`; for the own player also `m_nExecute = 0` and cancels the reserved skill.
- `ENDSKILLQUEUE` 0x00e5 (`MsgHdr.h:1140`), no fields: `OnEndSkillQueue` -> `OnCancelSkill` (`DPClient.cpp:15791-15795`, `WndTaskBar.cpp:2438-2447`: `m_nExecute = 0`, `ClearDestObj`, no reserved skill; ignored while `REQ_USESKILL` is set).
- `SETACTIONPOINT` 0x00c5 (`MsgHdr.h:1115`; message objid `0xffffffff`): `i32 nAP` -> `m_pWndTaskBar->m_nActionPoint` (`DPClient.cpp:15798-15805`, `UserLux.cpp:206-214`).

### 4.7 The hit (client side) and FP/MP changes

- Per frame the action mover runs `ProcessStateMeleeSkill` (`S/_AIInterface/ActionMoverState.cpp:593-679`): ends the state at 65% of the frames (:614-619); when `IsAttrHit()` is true calls `CMover::OnMeleeSkill( 0, hitCount )` (:653), counts the hit, and **on the client freezes the model for 4 frames** (`m_nPause = 4`, :656-658); extra shots if `nSkillCount > 0`.
- `CMover::OnMeleeSkill` (`MoverActEvent.cpp:72-164`): needs `m_oaAct == OBJACT_USESKILL` and a valid target; white "spark" highlight on the caster model (:94-113); for non-projectile skills `DoApplySkill( target, ... )`; first hit only: cooldown (:147-161). `DoApplySkill` -> `DoApplySkillEx` (`S/_Common/Ctrl.cpp:1449-1677`): for `SRO_DIRECT` `pTarget->ApplySkill` (:1580-1584) which calls `ApplyDamage` -> `SendDamage( AF_MELEESKILL, ..., (skillId << 16) | level )` (`Ctrl.cpp:1001-1030`; `CT_FINISH` skills use `SendDamageForce`, i.e. Over Cut can knock down, :1022); on the client that makes the victim flinch (`OnDamageMsgC`, `ActionMoverDmg.cpp:54-122`: stand, `SetDamagedMotion`, `m_nDmgCnt = 10`, remembers the attacker) but does **not** change HP; and `CreateSkillSfx` (4.9).
- The authoritative result is the server's DAMAGE message (4.8). Server and client each run the animation, so the server applies one hit per `MA_HIT` frame: Flurry sends **three** DAMAGE messages.
- FP/MP: `SETPOINTPARAM` 0x001e (`MsgHdr.h:914`, `User.cpp:4663-4677`): `i32 dstParam` (`DST_HP` 38, `DST_MP` 39, `DST_FP` 40: `R/defineAttribute.h:286-288`), `i32 value`; `OnSetPointParam` -> `SetPointParam` (`DPClient.cpp:3303-3313`). Order for one Vagrant skill use: SETPOINTPARAM(FP), USESKILL, then DAMAGE per hit frame.

### 4.8 DAMAGE (server -> clients; this is what "damage shows")

`CUserMng::AddDamage` (`User.cpp:4474-4492`), type 0x0013 (`MsgHdr.h:902`), message objid = victim: `u32 objidAttacker`, `u32 dwHit`, `u32 dwAtkFlags`, and only if `dwAtkFlags & AF_FLYING` (0x10000000): `vec3 pos`, `f32 angle`. Flags (`S/_AIInterface/ActionMover.h:27-44`): `AF_GENERIC` 1, `AF_MISS` 2, `AF_MAGIC` 8, `AF_MELEESKILL` 0x10, `AF_MAGICSKILL` 0x20, `AF_CRITICAL1` 0x40, `AF_CRITICAL2` 0x80, `AF_PUSH` 0x100, `AF_PARRY` 0x200, `AF_RESIST` 0x400, `AF_STUN` 0x800, `AF_BLOCKING` 0x1000, `AF_FORCE` 0x2000, `AF_RANGE` 0x4000, `AF_FLYING` 0x10000000.

`OnDamage` (`DPClient.cpp:1758-1934`): victim HP `-= dwHit` (to at least 1); if flying, set position/angle first; only when the victim **or** the attacker is the own player (or the option "show all damage" and within 30 m): `AF_BLOCKING` -> `XI_HIT_HITBLOCK01` sfx (scale 2), `AF_PARRY` -> `XI_HIT_PARRY01`, `AF_RESIST` with 0 damage -> `XI_HIT_MISS01` else a number, `AF_MISS` -> `XI_HIT_MISS01`; otherwise `AF_CRITICAL` -> `XI_HIT_CRITICAL01` (scale 3) and the number: `g_DamageNumMng.AddNumber( victimPos, dwHit, victimIsSelf ? 0 : 1 )`. A flying hit plays `MTI_DMGFLY` and a push (:1910-1922). Sfx ids `R/defineObj.h:100-105`. The number animation (`CDamageNum`, `S/_Common/2DRender.cpp:1855-2002`): digits from `C/SFX/DmgEffect.dds` via `DmgEffect.inc`, attribute 0 (own damage) / 1 (others) pick the colour set (14 frames each); 8 frames rising at 10 px/frame from 1 m above the victim, 10 frames of +-3 px shake, 15 frames still, then grows and fades (alpha 75 - 2 per frame) until frame 100; scale 2.0/4 = 0.5 of the sprite.

### 4.9 Effects a Vagrant skill references and when they play

- `dwSfxObj3` = `XI_SKILL_VAG_ONE_CLEANHIT01` 201 / `BRANDISH01` 202 / `OVERCUTTER01` 203 (`R/defineObj.h:201-203`, files `C/SFX/sfx_sklvagcleanhit01.sfx` etc., `R/mdlDyna.inc:211-213`). Created **once per applied hit** inside `DoApplySkillEx` (`Ctrl.cpp:1662` -> `CreateSkillSfx`, :878-997), i.e. at each `MA_HIT` frame (Flurry: three times). Branch for "no duration" (`(int)dwSkillTime > 0` is false) and `EXT_MELEEATK`: `CreateSfx( dwSfxObj3, pos = caster + 1.3 m forward (caster angle) + 1.0 m up, ..., target id )` (:942-961). `dwSfxObj5` (self, none here) and `dwSfxObj2` (server-side `AddCreateSfxObj` for area skills, `Ctrl.cpp:1124-1125,1304-1308`; `=` here) do not apply. When the sfx exists the hit sound `dwSndAttack1` (`SND_PC_DMGSWD` 115) plays at the caster (:982-986).
- Motion sounds: the `MA_SOUND` frames of the `.ani` (1.6): sounds 211/212/213 at the listed frames, played by the model's frame update (`S/_Common/ModelObject.cpp:1594-1700`).
- Generic effects: level-up `XI_GEN_LEVEL_UP01` 42 (`DPClient.cpp:3398-3401`, `OnSetLevel :3339-3359` also plays the `MTI_LEVELUP` motion); on a successful skill-point spend `XI_SYS_EXCHAN01` 108 via CREATESFXOBJ (3.2). `CREATESFXOBJ` 0x000f: `u32 sfxId`, `f32 x`, `f32 y`, `f32 z`, `i32 bFlag` (objid = anchor; when x/y/z are not all 0 the position is absolute) (`User.cpp:5016-5029`, `OnCreateSfxObj` `DPClient.cpp:4038-4067`).
- Sword trail (`MakeSWDForce`) during the motion, colour by weapon refine level (`Mover.cpp:4931-4966`).

### 4.10 Error texts the server sends (`DEFINEDTEXT`)

- `DEFINEDTEXT1` 0x0094: `i32 TID` (`CUser::AddDefinedText( TID )`, `User.cpp:2264-2274`); `DEFINEDTEXT` 0x0095: `i32 TID`, `string` (printf-formatted text, `User.cpp:2218-2239`). `OnDefinedText1` prints `GETTEXT( TID )` in the colour of `textClient.inc` (`DPClient.cpp:4230-4239`). The `TID_*` numbers are in `R/defineText.h`; `TID_*` -> `IDS_TEXTCLIENT_INC_*` -> text is `R/textClient.inc` + `R/textClient.txt.txt`. Skill-related texts (English): `TID_GAME_REQFP` "Not enough FP.", `TID_GAME_REQMP` "Not enough MP.", `TID_GAME_WRONGITEM` "You need to equip the correct weapon or item to use that skill.", `TID_GAME_SKILLWAITTIME` "Please wait.", `TID_GAME_NEVERKILLSTOP` "You cannot use the skill.", `TID_GAME_BLOCKTARGETING` "This action has been blocked by an obstacle..", `TID_RESKILLPOINT_ERROR` "There was a problem during skill redistribution. Please try again.", `TID_GAME_SKILLLNOTUSE` "%s skill cannot be registered in the action slot.", `TID_GAME_SKILLPOINT_UP` "New Skill Points are now available.", `TID_GAME_SKILLLEVEL_CHANGE` "Confirm changes to skill points?", `TID_GAME_BASESKILLLEVEL` "Character Level: %d", `TID_GAME_SKILLDIS` "%s Skill level %d is needed.", `TID_TOOLTIP_COOLTIME` "Waiting Time for reuse: %.2d:%.2d", `TID_GAME_SKILLSHORTCUT` "Use skills in the Action Slot (Hotkey: C)".
- The browser reads neither `textClient.inc` (the `TID_*` -> `IDS_*` + colour table; `W/packages/formats/src/inc/strings.ts` loads only `textClient.txt.txt`) nor these two messages.

### 4.11 The action slot ("skill queue") in v15

- 5 slots (`MAX_SLOT_QUEUE`, `S/_Common/ProjectCmn.h:902`), drawn right of the item bar, with the function button (icon `C/Icon/icon_ActionSkill.dds`, `SHORTCUT_SKILLFUN`) at its left; clicking that button (`ObjectExecutor` -> `m_pWndWorld->UseSkill()`, `WndManager.cpp:3150-3153`, `WndWorld.cpp:9139-9157`) or pressing **C** (default interface `m_nInterface == 1`; code `nChar == 'C'` in `OnKeyUp`, `WndWorld.cpp:7712-7729`, the comment says X; with interface 0 a right click does it, :7184-7199) reserves `NEXTSKILL_ACTIONSLOT`; `CWndWorld::Process` then calls `UseSkillToFocusObj( focus )` (`WndWorld.cpp:8506-8508`, :6268-6298) -> `CWndTaskBar::UseSkillQueue` (`WndTaskBar.cpp:2214-2272`).
- `UseSkillQueue` returns FALSE if the queue is already executing (`m_nExecute == 2`), the player is attacking, jumping or flying, or the target is not a mover; takes the target (or none), `m_nExecute = 1`, `CMD_SetUseSkill( target, slot[0].m_dwId, SUT_QUEUESTART )`; on failure `OnCancelSkill`. Only the **first** skill is requested by the client (USESKILL with `nUseType = 1`). The rest is driven by the **server**: after a melee/magic skill motion ends (`OnActEndMeleeSkill`/`OnActEndMagicSkill`, `MoverActEvent.cpp:2056-2086`) the server calls `CUserTaskBar::SetNextSkill` (`S/_Interface/UserTaskBar.cpp:198-237`): index += 1, the action points must cover the step (`m_nActionPoint`, cost by step index: 1 -> 6, 2 -> 8, 3 -> 11, 4 -> 30; step 0 is free; free with the `SM_ACTPOINT` buff, :202-213), tells the client with SETACTIONPOINT (:225), and `CMD_SetUseSkill( m_idSetTarget, slot.m_dwId, SUT_QUEUEING )`; an empty slot, no AP, or the end of the queue ends it with `ENDSKILLQUEUE` (`OnEndSkillQueue`, :190-196). Each chained skill produces a USESKILL broadcast (`nUseType = 2`).
- Action points: +2 per 3 s up to 100 on both sides (`CMover::ProcessActionPoint`, `Mover.cpp:3407-3443`), +1 for the 2nd hit of a normal combo / each wand charge (`MoverActEvent.cpp:1665-1677`, `MoverSkill.cpp:3255-3264`).
- What may be placed in the queue (client rules): `SetSkillQueue` (`WndTaskBar.cpp:1787-1872`) refuses level-0 skills, **skills whose add-skill `dwCooldown` is > 0** ("%s skill cannot be registered in the action slot"), more than 5, and anything `CheckAddSkill` (:1668-1786) rejects: first slot only `CT_STEP` or `CT_GENERAL`; `CT_STEP` nowhere else; nothing after a `CT_FINISH`; `CT_CIRCLE`/`CT_FINISH` not after `CT_GENERAL`; `CT_GENERAL` only after `CT_GENERAL`; a `CT_FINISH` cannot replace/precede a `CT_CIRCLE`/`CT_FINISH` slot. For the Vagrant: Clean Hit (STEP) first, then Flurry (CIRCLE, repeatable), then Over Cut (FINISH) last.
- **Quick-bar rule for skills**: only `CT_STEP` or `CT_GENERAL` skills may be dropped on the applet or item bars (`WndTaskBar.cpp:1962-1976,2026-2041`; the loader also empties such an applet-slot entry, :340-343). **For a Vagrant only Clean Hit can sit on the bar; Flurry and Over Cut can be used only through the action slot.**
- Removing from the queue: right click on a queue slot or dragging it out (`RemoveSkillQueue`, `WndTaskBar.cpp:1446-1472`: shifts the rest left, repeats while the new arrangement is illegal); every change sends SKILLTASKBAR (5.3). Not allowed while `m_nExecute != 0` (:1448).

---

## 5. The task bar / shortcut bar

### 5.1 Layout

`S/_Common/ProjectCmn.h:899-948`:

| Item | Count | Const |
| --- | --- | --- |
| Applet slots (top-left row, menus/windows, also items/skills/motions) | **18** | `MAX_SLOT_APPLET` (the window shows 5 / 10 / 18 depending on a game width of 800 / 1024 / >= 1280: `WndTaskBar.cpp:1264-1306`) |
| Item bars | **8** (`__VER >= 11`) | `MAX_SLOT_ITEM_COUNT` |
| Slots per item bar | **9** | `MAX_SLOT_ITEM` (the header comment says "1 ~ 0(10)", the constant is 9) |
| Action slot (skill queue) | **5** | `MAX_SLOT_QUEUE` |
| Shortcut string | 128 | `MAX_SHORTCUT_STRING` (`S/_Common/DefineCommon.h:10`) |

Shortcut record `SHORTCUT` (client adds pointers first; the wire/server part is `DWORD m_dwShortcut, m_dwId, m_dwType, m_dwIndex, m_dwUserId, m_dwData; TCHAR m_szString[128]`; `IsEmpty()` = `m_dwShortcut == 0`): `ProjectCmn.h:930-948`.

`m_dwShortcut` kinds (`ProjectCmn.h:910-923`): 0 NONE, 1 ETC, 2 APPLET (`m_dwId` = `APP_*` window id from `R/ResData.h`, icon/hotkey from `CWndMgr::AddAllApplet`, `FuncApplet.cpp:178-260`), 3 MOTION (`m_dwId` = `MOT_*`), 4 SCRIPT, 5 ITEM (`m_dwId` = the inventory object id), 6 **SKILL**, 7 OBJECT, 8 CHAT (+ string), 9 SKILLFUN (the action-slot button, never stored), 10 EMOTICON, 11 LORDSKILL.

How a **skill** shortcut is filled (`CWndTaskBar::SetShortcut`, `WndTaskBar.cpp:1514-1667`; queue: `SetSkillQueue`, :1862-1868): `m_dwShortcut = 6`, `m_dwType = 0` (own job skill; 2 = party/troupe skill, `prj.GetPartySkill`), `m_dwId` = **index into `m_aJobSkill`**, `m_dwIndex` = the slot position (the client overwrites it again when loading, :327, :381, :392), `m_dwUserId = 0`, `m_dwData` = where: 0 applet row, 1 item bar, 2 action slot.

### 5.2 TASKBAR (server -> client, in the JOIN bundle and after job change / skill reset)

`CUser::AddTaskBar` (`S/WORLDSERVER/User.cpp:1232-1241`): objid = player, type `SNAPSHOTTYPE_TASKBAR` 0x0097 (`MsgHdr.h:1058`), then `CUserTaskBar::Serialize` storing (`S/_Interface/UserTaskBar.cpp:63-125`; the client reads the same layout, `CWndTaskBar::Serialize`, `WndTaskBar.cpp:315-400`, via `OnTaskBar`, `DPClient.cpp:4285`). JOIN order: environment, world-info, own ADD_OBJ, game timer, **TASKBAR**, environment, player data, friends, party, game join, guilds, events, lord, couple (`User.cpp:308-349`). TASKBAR comes after ADD_OBJ (the client needs `g_pPlayer`, `GetSkill` and the inventory to build icons).

| # | Field | Type |
| --- | --- | --- |
| 1 | applet count | i32 |
| 2 | per applet entry (only non-empty ones): slot index `i` (0..17) | i32 |
|   | `m_dwShortcut`, `m_dwId`, `m_dwType`, `m_dwIndex`, `m_dwUserId`, `m_dwData` | 6 x u32 |
|   | only if `m_dwShortcut == 8`: `m_szString` | string (i32 length + bytes; the reader's buffer is 128) |
| 3 | item entry count | i32 |
| 4 | per item entry (non-empty only): bar `i` (0..7), slot `j` (0..8) | i32, i32 |
|   | the same 6 x u32 (+ string if chat) | |
| 5 | queue entry count | i32 |
| 6 | per queue entry (non-empty only): index `i` (0..4), the same 6 x u32 (no string) | i32 + 6 x u32 |
| 7 | `m_nActionPoint` | i32 (after the queue entries; the queue count is patched in front of them) |

Reading rules to copy: counts are of entries present, indexes are explicit; the client starts from an empty bar (`InitTaskBar`), for a skill in the applet row it empties the entry unless the skill is `CT_STEP`/`CT_GENERAL` (:330-343), `m_nCurQueueNum = nCount` (:399), so the queue entries must be 0..n-1 contiguous. Where the player has no `ITEM` yet (the inventory is Piece 5) an item shortcut cannot show its icon (`SetTaskBarTexture :418-424`).

Defaults of a new character: **not found** in this source tree (created by the SQL procedure `CHARACTER_STR 'I1'`, `S/_Database/DbManager.cpp:198`; stored as text in the columns `m_aSlotApplet`, `m_aSlotItem`, `m_aSlotQueue`, `ActionPoint`, `DbManagerFun.cpp:965-1020`, `DbManagerSave.cpp:973-990`). A hard-coded applet with `m_dwId == 400` in slot 0 cannot be removed on the main server build (`WndTaskBar.cpp:1482-1485,2151-2154`).

### 5.3 Client -> server edits

Registered at `S/WORLDSERVER/DPSrvr.cpp:240-244`; handlers `:12363-12494`. Nothing is validated except the index ranges; there is no reply.

| Packet | Type | Fields (after `u32 0xffffffff`, `u32 type`) | Handler |
| --- | --- | --- | --- |
| `ADDAPPLETTASKBAR` | 0xffffff0b | `u8 index (<18)`, 6 x u32 (`shortcut, id, type, index, userId, data`), `string` if `shortcut == 8` | `OnAddAppletTaskBar` :12388 |
| `REMOVEAPPLETTASKBAR` | 0xffffff0a | `u8 index` | :12409 |
| `ADDITEMTASKBAR` | 0xffffff0c | `u8 bar (<8)`, `u8 slot (<9)`, 6 x u32 (same order), `string` if `shortcut == 8` | :12428 (sender `DPClient.cpp:11014-11025`) |
| `REMOVEITEMTASKBAR` | 0xffffff0d | `u8 bar`, `u8 slot` | :12477 |
| `SKILLTASKBAR` | 0xffffff0e | `i32 count` (must be <= 5; Neuz always sends **5**), then per entry `u8 index (<5)`, 6 x u32 (same order, no string) | :12363-12386; **it only overwrites the sent entries, so removing a skill means sending all 5 slots with the emptied/shifted ones** (`SendSkillTaskBar`, `DPClient.cpp:10972-10989`) |

Triggers: dropping a shortcut (`CWndTaskBar::OnDropIcon`, `WndTaskBar.cpp:1874-2093` -> `SetShortcut`/`SetSkillQueue`), moving/removing: dragging out of the bar or right click (`OnRButtonUp`, :1473-1512) -> REMOVE...; changing the stack item behind an item shortcut re-sends ADD (`:866-880,1118-1128`). Moving a shortcut inside the bar = ADD at the target then REMOVE of the old (:2074-2090).

### 5.4 Rules for skills on the bar (client side)

- Item bars and applet row: only `CT_STEP`/`CT_GENERAL` skills with level > 0 that pass `CMover::CheckSkill` (`WndTaskBar.cpp:1920-1928,1962-1976,2026-2041`). Party skills (`m_dwType == 2`) are not accepted from the skill window.
- Action slot: 4.11.
- Dragging from the skill window: `CWndSkillTreeEx::OnMouseMove` (`WndField.cpp:7438-7463`); the bar highlights the legal drop areas (`WndTaskBar.cpp:769-819`).
- Cooldown clock on the icon: `RenderCollTime` (:2848-2871): `RenderRadar( cooldown - remaining, cooldown )` with `GetReuseDelay( index )` (`MoverSkill.cpp:3913-3922`), `m_tmReUseDelay[ index ]` set when the first hit lands (`MoverActEvent.cpp:451-469`, client for the active mover only, :150-153). Vagrant skills never show one.
- Tooltip: `PutToolTip_Skill( dwSkill, dwLevel )` (`WndManager.cpp:4175-4291`): name and "Lv n" (bold green `ff2fbe6d`), "MP : x" if `nReqMp != -1`, "FP : x" if `nReqFp != -1` (with the DST decrease rate), prerequisite lines (red if unmet), "Character Level: n" (red if too low), the description, and the remaining cool-down.

### 5.5 Bars and switching

- `m_nSlotIndex` (0..7) = the visible item bar, client-only, starts at 0 on every entry (`WndTaskBar.cpp:489-511`). Up/down buttons (`WIDC_UP`/`WIDC_DOWN`) cycle with wrap (:1371-1380); the bar number is drawn at the up button (:1085-1088). Keys **1-8** switch to bar 1-8 (`CWndMgr::Process`, `WndManager.cpp:3541-3582`; `1` is consumed there before the help shortcut), `0` is a screenshot, `9` writes the position.
- The applet row, bars and queue are one window `APP_TASKBAR800/1024/1280...` (`R/ResData.h:841-843`); icons are 32x32 (applet and item slots) and 28x28 (action slot) (`WndTaskBar.cpp:183-184`).

### 5.6 Keys

- **F1..F10** (`VK_F1 0x70`..`VK_F10 0x79`) fire slot 1..10 of the current bar (`WndTaskBar.cpp:2395-2427`, the non-`__Y_INTERFACE_VER3` array `dwHotkey1`). The bar has only 9 slots, so **F10 reads `m_paSlotItem[9]`, which is slot 0 of the next bar** (and past the array on bar 8): a quirk, not worth copying. Digits are not slot keys in this build.
- A fired item-bar entry goes through `ObjectExecutor( shortcut )` like a click; `g_bSlotSwitchAboutEquipItem[i]` blocks key repeat for equipment items until key-up (`Neuz.cpp:1377-1381`).
- **C** = action slot (4.11). Keys are ignored while a drag is in progress (:2331-2338).

---

## 6. Skill icons

- Source: `propSkill.txt` column 120 `szIcon` (the file name; also `skill_VagOneCleanh.dds`, `skill_VagOneBrandi.dds`, `skill_VagOneOvercu.dds`), loaded by the client with `MakePath( DIR_ICON, szIcon )` (`DIR_ICON` = `Icon\`, `S/_Common/path.h:31`; `WndField.cpp:7420-7437`, `WndTaskBar.cpp:396,437`).
- Folder: `C:\...\Client\Icon\` (loose files, not in the `.res` packs; 518 files). File names are case-insensitive on Windows (`Skill_VagOneCleanh.dds` on disk); a web lookup must lower-case.
- Format: all 159 distinct skill icons exist and are **32x32 DDS, 16 bits per pixel A1R5G5B5** (pixel masks `7c00 03e0 001f 8000`, DDPF flags 65, no mipmaps, 2176 bytes = 128 header + 2048). 16 rows of `propSkill.txt` have no icon (non-skill rows). The browser's DDS reader supports A1R5G5B5 (`W/packages/formats/src/image/dds.ts:106-108`).
- **Transparency is a colour key, not alpha**: Neuz calls `AddTexture( device, path, 0xffff00ff )` (magenta key; `S/_Common/2DRender.h:313`, `2DRender.cpp:1815-1831`; the DDS branch of `CTexture::LoadTexture`, `2DRender.cpp:1206-1225`, loads as `D3DFMT_A1R5G5B5` and passes the key to D3DX as its colour key). In the three Vagrant icons every pixel has the alpha bit set and 234 / 252 / 270 of 1024 pixels are pure magenta (`0x7c1f`), i.e. the converter must turn magenta into transparent.
- (If a bar shortcut is created with no texture, `SetShortcut` would look in `Item` instead of `Icon`: `WndTaskBar.cpp:1625`; the skill window and the loader always give the `Icon` texture, so `Icon` is the one that matters.)
- Drawn 27x27 in the skill window (`Render( p2DRender, pos, CPoint( 27, 27 ) )`, `WndField.cpp:7823`) and 32x32 on the bar; the action slot uses the same texture at 28x28.
- Level numbers: `C/Icon/icon_IconSkillLevel.tga` (32-bit TGA 560x56) + `icon_IconSkillLevel.inc` (`number 40`; two rows of 20 frames, 28x28 each, at y = 1 and y = 29): frame `level - 1` (max level uses 19), `+20` for the "changed, not saved" colour (`WndField.cpp:7826-7831`).
- Other art: bar function button `C/Icon/icon_ActionSkill.dds`; the skill window's job backgrounds `C/Theme/Default/Back_*.TGA` (not needed for Vagrant: its strings are empty, `WndField.cpp:6769-6772`); damage digits `C/SFX/DmgEffect.dds` + `.inc`; applet icons `Icon_Skill.dds` etc.
- Not yet converted: the converter's texture stage only reads `Model/TextureMid` and `World/TextureMid` (`W/tools/convert/src/textures/convertTexture.ts:36-40`); no stage touches `Icon/`.

---

## 7. What the browser already decodes vs. what Piece 4 must add

Checked in `W/packages/protocol/src`, `W/packages/formats/src`, `W/tools/convert/src`, `W/apps/client/src/world`.

| Thing | Today | Piece 4 must add |
| --- | --- | --- |
| Own ADD_OBJ skill block | Reads `m_nSkillLevel`/`m_nSkillPoint` and drops them (`addObj.ts:162-163`), then `skipRest()` (`:78`); the 45-skill array is not read. | 45 x {u32, u32} after the 31 equipment ids; keep SP and the array. |
| JOIN/SNAPSHOT messages | `WORLD_READERS` (`world/readers.ts:16-33`) has ADD_OBJ, MOVERMOVED/BEHAVIOR/CORR/ANGLE, DESTPOS, DESTANGLE, MOVERSETDESTOBJ, MOTION, SETPOS, SETPOSANGLE, DEL_OBJ, WORLD_READINFO, REPLACE, ENVIRONMENTALL. None of: TASKBAR 0x97, USESKILL 0x19, CLEAR_USESKILL 0x1a, DAMAGE 0x13, SETEXPERIENCE 0x12, DOUSESKILLPOINT 0x7d, INITSKILLPOINT 0x7c, SETPOINTPARAM 0x1e, SETACTIONPOINT 0xc5, ENDSKILLQUEUE 0xe5, CREATESFXOBJ 0x0f, DEFINEDTEXT 0x95/DEFINEDTEXT1 0x94, SETLEVEL 0x11, COMMONSKILL 0xdd, SET_JOB_SKILL 0xa7. Also absent from `MessageType` (`constants.ts:58-76`). With the table-of-contents patch these are skipped harmlessly (`bundle.ts` `readIndexed`); **without it the bundle read stops at the first unknown type** (`bundle.ts` `readInOrder`, `stoppedAt`). TASKBAR is in the JOIN bundle (after the own ADD_OBJ); the rest arrive in later SNAPSHOT bundles. (SETLEVEL goes to other players only; the own level arrives in SETEXPERIENCE.) |
| Client packets | `encodeJoin`, `encodeWorldKeepAlive`, `encodePlayerMoved/Behavior/Corr`, `encodeDestPos` (`messages/world.ts`). `PacketType` (`constants.ts:6-39`) lacks USESKILL 0x00ff0020, DOUSESKILLPOINT 0x000f0003, SETTARGET 0x00ff0023, PLAYERSETDESTOBJ 0xffffff07, ENDSKILLQUEUE 0x00ff00d5, SKILLTASKBAR 0xffffff0e, ADD/REMOVE APPLET/ITEM TASKBAR 0xffffff0b/0a/0c/0d. | Encoders for those (layouts in 3.2, 4.2, 4.4, 5.3). They are top-level packets (type right after `DPID_UNKNOWN`), not messages inside a SNAPSHOT like `encodeDestPos`. |
| Game data | `readPropItem` (`formats/src/inc/propItem.ts`) already parses `propSkill.txt` rows (same 124-column loader; the `II_`-specific "@" rule only affects weapons) but keeps only `id`, `name`, `parts`, `exclusive`, `baseIgnore` (`:14-38`); no reader for `propSkillAdd.csv`; `loadDefines` already loads every `define*.h` plus `ResData.h` (`script/defines.ts:125-145`), so `SI_/SA_/MTI_/XI_/EXT_/WUI_/KT_/CT_/AR_/DST_/JOB_/JTYPE_` resolve; `loadStrings` includes `propSkill.txt.txt` and `textClient.txt.txt` (`inc/strings.ts:110-134`); `textClient.inc` is not read. The data stage writes movers, items, npcs, nameColors, honorTitles, worlds only (`data/gameDataStage.ts:1-14`). | A skill catalog (skills + add-skills + `Constant.inc` SP costs + prerequisite/job lists + texts) in the data stage; `textClient.inc` reader for server texts. |
| Motions | The three Vagrant motion files for both sexes are converted and indexed under `movers[11|12].motions["1000".."1002"]`; `readAni` returns `frameAttributes` (`MA_HIT`/`MA_SOUND`) (`ani.ts:71-90,124-130`). The `.glb` carries none of it (no `extras`). | Hit/sound frame table per motion (from the `.ani`) into the data stage or the glb; play at 30 fps, cut at 65% frames. |
| Icons | Not converted (6). | Icons stage for `Icon/` (magenta key, A1R5G5B5) and the level-digit sheet + `DmgEffect`. |
| Simulation | Move/arrive/destination rules exist (`world/sim/moverRules.ts`: `setDestObj`, follow until `isRangeObj`, `processMoveArrival` default branch only: `:318-345,499-506`); `ObjSta` has only the `ATK_ALL` mask (`sim/constants.ts:26`); no `OBJMSG_MELEESKILL`, no `OBJSTA_ATK_MELEESKILL`, no `REQ_USESKILL` (`ActionMover.ts:351`), no damage state, no `OBJACT_USESKILL` command. The browser sends no SETTARGET / PLAYERSETDESTOBJ yet. | Skill command + arrival branch (4.1), melee-skill state with hit detection, damage flinch, SETTARGET and PLAYERSETDESTOBJ on target changes. |

Also needed from other pieces (not skill code): the equipped weapon (server needs a one-handed weapon, `dwHanded == HD_ONE`; Neuz's own player learns it from the inventory, Piece 5), the own FP/MP maxima (HUD), the target focus UI.

---

## 8. Open questions / uncertain

1. **Default taskbar and initial skill rows of a new character** are produced by SQL (`CHARACTER_STR 'I1'`, `uspLoadCharacterSkill`), not in this tree. Answered from the source in Task 18: a new character has 3 filled slots (skills 1-3 at level 0), because the DB server runs `InitProp` before the job is read (`Obj.cpp:163, 314-324`); still worth confirming with one recorded JOIN (`tools/capture`).
2. Whether the server VM's `Resource` folder equals `R/` (the client packs do, byte for byte).
3. **Silent server paths**: a request that changes nothing gets no reply (3.2), and a USESKILL rejected before `DoUseSkill` (level 0, bad index, vendor) gets no CLEAR_USESKILL (4.3). The web client must guard (only send for level > 0, and time out its own "waiting for the server" flag) or it will deadlock the way Neuz would.
4. The server accepts a DOUSESKILLPOINT with any levels for the skills the character already has, ignoring prerequisites and character level (3.2); this is a server weakness; a faithful client just follows the window rules.
5. `F10`/slot index 9 reads the next bar's slot 0; `MAX_SLOT_ITEM` is 9 although comments say 10 (5.6). Which behaviour the owner wants (9 keys F1-F9) is a design choice.
6. `m_nInterface` default is 1, where the action slot key is **C** (the code comment says X); the other interface modes (0: right click) exist (`HwOption.cpp:178`).
7. The exact in-world distance semantics of "within 2.0 m" for a target with a radius (`IsRangeObj`) and whether the browser's existing `isRangeObj` already matches; not checked beyond the call in `moverRules.ts:410`.
8. `SetDamagedMotion` (victim flinch/knock-back details) and `MoverRender` highlight effects were not read in depth; only the entry points are cited. Same for the `.sfx` content (researched separately).
9. Damage numbers' exact on-screen size/colour table (`DmgEffect.inc` sections) was not decoded.
10. `SNAPSHOT` bundles flush periodically (messages of one skill use may arrive in different bundles); order inside a user's stream is the order of the calls (FP, USESKILL, DAMAGE...), which is relied on above but not asserted by any packet.
11. Vagrant motion hit counts (Flurry: 3) assume the server's animation has the same `MA_HIT` frames; the world server loads its own `.ani` files from its `Model` folder, whose contents are not in this tree.
