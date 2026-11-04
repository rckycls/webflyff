// The item tooltip, line by line as Neuz writes it (2026-11-05): `CWndMgr::MakeToolTipText`
// (Source/_Interface/WndManager.cpp:6550-6746) and its helpers. The reference is
// `docs/superpowers/specs/2026-11-05-item-tooltip-research.md`; the line numbers below are WndManager.cpp's unless a file
// is named.
//
// Every line but the first starts with "\n" in the C++; here `put` splits a text on "\n" the same way, so a helper that
// pushes "\n" and prints nothing leaves an empty line, as PutItemMinMax does for gear without min/max.
//
// Not shown, for want of the data (the rulings of the 2026-11-05 work): the pets' and vis lines (PutPetKind's hatched
// pets, PutPetInfo, PutPetFeedPocket, PutVisPetInfo, PutNeededVis), the cooldown (PutCoolTime), an item's own time left
// (PutKeepTime's second half), the guild cloak's guild name, the couple ring's name, the sealed character, the Ultimate
// gems (PutAddedOpt), the "Before tax price" line, red-chip prices, and the player's own DST_ABILITY_MIN/MAX in min~max.

import type { WebItemEtc, WebItemProp, WebPiercingAvail, WebSetItem } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { Texts } from '../gameData';

/** A piece of a line: its text, its colour (0xRRGGBB) and its style (`ESSTY_BOLD`, `ESSTY_STRIKETHROUGH`). */
export interface TooltipRun {
  text: string;
  color: number;
  bold?: true;
  strike?: true;
}

export type TooltipLine = TooltipRun[];

/** The window that asks (the C++ `flag`): the inventory (`APP_INVENTORY`), the NPC shop (`APP_SHOP_`), or another (0). */
export type TooltipFlag = 'inventory' | 'shop' | 'other';

/** The player the "can you use it" colours are judged for (`pMover`, :6563-6569). */
export interface TooltipViewer {
  sex: number;
  job: number;
  level: number;
}

export interface TooltipContext {
  flag: TooltipFlag;
  viewer: TooltipViewer | null;
  /** The item the viewer wears on part `part` (`PARTS_*`), for the set lines and the set +N bonus. */
  worn?: (part: number) => InventoryItem | undefined;
  /** The item is worn (`m_Inventory.IsEquip`): with the inventory flag, its set +N bonus shows (PutEnchantOpt). */
  isWorn?: boolean;
  /** With the inventory flag: an NPC shop is open, so the selling price shows (PutItemGold). */
  shopOpen?: boolean;
}

/** The sets, socket cards and accessories (`data/itemEtc.json`), as the tooltip looks them up. */
export interface ItemEtc {
  /** The set an item is a piece of (`CSetItemFinder::GetSetItemByItemId`: the first set that names it). */
  setOf: ReadonlyMap<number, WebSetItem>;
  /** What a socket card gives (`CPiercingAvail::GetPiercingAvail`). */
  piercing: ReadonlyMap<number, WebPiercingAvail['params']>;
  /** An accessory's stats by refine level (`CAccessoryProperty::GetDst`). */
  accessories: ReadonlyMap<number, ReadonlyArray<ReadonlyArray<{ dst: number; adj: number }>>>;
}

/** `data/itemEtc.json` as lookups: an item's set is the first set that names it (`CSetItemFinder::AddSetItem`'s insert). */
export function itemEtcOf(web: WebItemEtc): ItemEtc {
  const setOf = new Map<number, WebSetItem>();
  for (const set of web.sets) for (const elem of set.elems) if (!setOf.has(elem.itemId)) setOf.set(elem.itemId, set);
  return {
    setOf,
    piercing: new Map(web.piercing.map((card) => [card.itemId, card.params])),
    accessories: new Map((web.accessories ?? []).map((accessory) => [accessory.itemId, accessory.levels])),
  };
}

export interface TooltipData {
  texts: Texts;
  itemProps: ReadonlyMap<number, WebItemProp>;
  itemEtc?: ItemEtc;
}

// ---- colours (dwItemColor[FIRST_TC], :533-595) ---------------------------------------------------------------------

const NAME0 = 0x2e70a9;
const NAME1 = 0x005d00;
const NAME3 = 0x7f00ff;
const GENERAL = 0x000000;
const PIERCING = 0xb200ff;
const TIME = 0x00c800;
const NOT_USE = 0xff4200;
const AWAKENING = 0x0000ff;
const BLESSING = 0x0000ff;
const RED = 0xff0000;
const SET_ITEM0 = 0xb2b2b2;
const SET_ITEM1 = 0x0000cc;
const SET_EFFECT = 0xff9d00;
/** dwEffective0..3: the min~max numbers by the refine multiplier (:5047-5056). */
const EFFECTIVE = [0x000000, 0x00ff00, 0xff0000, 0x808080] as const;

// ---- the DST names (g_DstString, :4338-4451, without __NEWWPN1024) and IsDst_Rate (:4453-4518) --------------------

/** [dst, TID, rate]: generated from the C++ tables; a DST listed twice keeps its first entry, as FindDstString does. */
const DST_TABLE: ReadonlyArray<readonly [number, string, boolean]> = [
  [1, 'TID_TOOLTIP_STR', false], [2, 'TID_TOOLTIP_DEX', false], [3, 'TID_TOOLTIP_INT', false], [4, 'TID_TOOLTIP_STA', false],
  [11, 'TID_TOOLTIP_SPEED', true], [12, 'TID_TOOLTIP_ABILITYMIN', false], [13, 'TID_TOOLTIP_ABILITYMAX', false],
  [24, 'TID_TOOLTIP_ATKSPEED', true], [26, 'TID_TOOLTIP_DEFENCE', false], [27, 'TID_TOOLTIP_DEFMAGIC', false],
  [28, 'TID_TOOLTIP_DEFELECTRICITY', false], [10002, 'TID_TOOLTIP_DEFALLELEMETAL', false], [30, 'TID_TOOLTIP_DEFFIFE', false],
  [31, 'TID_TOOLTIP_DEFWIND', false], [32, 'TID_TOOLTIP_DEFWATER', false], [33, 'TID_TOOLTIP_DEFEARTH', false],
  [35, 'TID_TOOLTIP_MAXHP', false], [36, 'TID_TOOLTIP_MAXMP', false], [37, 'TID_TOOLTIP_MAXFP', false],
  [38, 'TID_TOOLTIP_HP', false], [39, 'TID_TOOLTIP_MP', false], [40, 'TID_TOOLTIP_FP', false],
  [41, 'TID_TOOLTIP_HPRECOVERY', false], [42, 'TID_TOOLTIP_MPRECOVERY', false], [43, 'TID_TOOLTIP_FPRECOVERY', false],
  [10007, 'TID_TOOLTIP_HPRECOVERYRATE', true], [10008, 'TID_TOOLTIP_MPRECOVERYRATE', true],
  [10009, 'TID_TOOLTIP_FPRECOVERYRATE', true], [10012, 'TID_TOOLTIP_ALL_RECOVERY', false],
  [10013, 'TID_TOOLTIP_ALL_RECOVERY_RATE', true], [44, 'TID_TOOLTIP_KILL_HP', false], [45, 'TID_TOOLTIP_KILL_MP', false],
  [46, 'TID_TOOLTIP_KILL_FP', false], [10014, 'TID_TOOLTIP_KILL_ALL', false], [10015, 'TID_TOOLTIP_KILL_HP_RATE', true],
  [10016, 'TID_TOOLTIP_KILL_MP_RATE', true], [10017, 'TID_TOOLTIP_KILL_FP_RATE', true],
  [10018, 'TID_TOOLTIP_KILL_ALL_RATE', true], [10019, 'TID_TOOLTIP_ALL_DEC_RATE', true], [47, 'TID_TOOLTIP_HITRATE', true],
  [63, 'TID_TOOLTIP_CHRDMG', false], [64, 'TID_TOOLTIP_CHRSTATE', false], [65, 'TID_TOOLTIP_PARRY', false],
  [66, 'TID_TOOLTIP_ATKPOWER', true], [68, 'TID_TOOLTIP_JUMPING', false], [14, 'TID_GAME_TOOLTIP_BLOCK', true],
  [8, 'TID_GAME_TOOLTIP_BLOCKRANGE', true], [10003, 'TID_GAME_TOOLTIPALLSTAT', false],
  [52, 'TID_TOOLTIP_DST_HP_MAX_RATE', true], [62, 'TID_GAME_TOOLTIPCONDITIONRATE', false],
  [72, 'TID_TOOLTIP_DST_ADJDEF_RATE', true], [53, 'TID_TOOLTIP_DST_MP_MAX_RATE', true], [54, 'TID_TOOLTIP_DST_FP_RATE', true],
  [9, 'TID_TOOLTIP_DST_CRITICAL_RATE', true], [55, 'TID_TOOLTIP_DST_CHR_WEAEATKCHANGE', false],
  [15, 'TID_TOOLTIP_DST_MASTRY_EARTH', true], [17, 'TID_TOOLTIP_DST_MASTRY_FIRE', true],
  [18, 'TID_TOOLTIP_DST_MASTRY_WATER', true], [19, 'TID_TOOLTIP_DST_MASTRY_ELECTRICITY', true],
  [20, 'TID_TOOLTIP_DST_MASTRY_WIND', true], [29, 'TID_TOOLTIP_DST_REFLECT_DAMAGE', true],
  [73, 'TID_TOOLTIP_DST_MP_DEC_RATE', true], [74, 'TID_TOOLTIP_DST_FP_DEC_RATE', true],
  [75, 'TID_TOOLTIP_DST_SPELL_RATE', true], [76, 'TID_TOOLTIP_DST_CAST_CRITICAL_RATE', true],
  [77, 'TID_TOOLTIP_DST_CRITICAL_BONUS', true], [5, 'TID_TOOLTIP_DST_YOY_DMG', false], [6, 'TID_TOOLTIP_DST_BOW_DMG', false],
  [21, 'TID_TOOLTIP_DST_KNUCKLE_DMG', false], [25, 'TID_TOOLTIP_DST_SWD_DMG', false], [34, 'TID_TOOLTIP_DST_AXE_DMG', false],
  [51, 'TID_TOOLTIP_ATTACKSPEED_RATE', true], [56, 'TID_TOOLTIP_DST_DMG_GET', true], [22, 'TID_TOOLTIP_DST_DMG_GET', false],
  [67, 'TID_TOOLTIP_DST_EXPERIENCE', true], [81, 'TID_TOOLTIP_DST_MELEE_STEALHP', false],
  [79, 'TID_TOOLTIP_DST_MONSTER_DMG', true], [80, 'TID_TOOLTIP_DST_PVP_DMG', true], [82, 'TID_TOOLTIP_DST_HEAL', false],
  [83, 'TID_TOOLTIP_ATKPOWER_VALUE', false], [85, 'TID_TOOLTIP_DST_ONEHANDMASTER_DMG', false],
  [86, 'TID_TOOLTIP_DST_TWOHANDMASTER_DMG', false], [87, 'TID_TOOLTIP_DST_YOYOMASTER_DMG', false],
  [88, 'TID_TOOLTIP_DST_BOWMASTER_DMG', false], [89, 'TID_TOOLTIP_DST_KNUCKLEMASTER_DMG', false],
  [90, 'TID_TOOLTIP_DST_HAWKEYE', true], [91, 'TID_TOOLTIP_DEFMAGIC_RATE', true], [92, 'TID_TOOLTIP_DST_GIFTBOX', false],
  [10004, 'TID_TOOLTIP_DST_HPDMG_UP', false], [10005, 'TID_TOOLTIP_DST_DEFHITRATE_DOWN', true],
  [93, 'TID_TOOLTIP_RESTPOINT_RATE', true], [7, 'TID_GAME_TOOLTIP_ATTACKRANGE4', false],
  [16, 'TID_GAME_TOOLTIP_MOVEMENT1', false], [61, 'TID_GAME_TOOLTIP_IMMUNITY1', false],
];
const DST_NAMES = new Map<number, string>();
for (const [dst, tid] of DST_TABLE) if (!DST_NAMES.has(dst)) DST_NAMES.set(dst, tid);
const DST_RATES: ReadonlySet<number> = new Set(DST_TABLE.filter(([, , rate]) => rate).map(([dst]) => dst));

const DST_STR = 1;
const DST_DEX = 2;
const DST_INT = 3;
const DST_STA = 4;
const DST_ATTACKSPEED = 24;
const DST_STAT_ALLUP = 10003;

/** `IsDst_Rate`: the DST's value is a percentage. */
export const isDstRate = (dst: number): boolean => DST_RATES.has(dst);

// ---- item kinds and the rest of the constants -------------------------------------------------------------------------

const IK1_WEAPON = 1;
const IK1_ARMOR = 2;
const IK2_WEAPON_DIRECT = 2;
const IK2_WEAPON_MAGIC = 3;
const IK2_JEWELRY = 13;
const IK2_SYSTEM = 19;
const IK3_SHIELD = 16;
const IK3_ELECARD = 37;
const IK3_PET = 100;
const IK3_EGG = 120;
const IK3_VIS = 138;
const GEAR_KINDS: ReadonlySet<number> = new Set([2, 3, 7, 8, 9, 10, 22]); // WEAPON_*, ARMOR, ARMORETC, CLOTH, CLOTHETC, BLINKWING
const MEDICINE_KINDS: ReadonlySet<number> = new Set([11, 12, 14]); // REFRESHER, POTION, FOOD
/** `ExpUpItem`'s column (Project.cpp:5163-5201): the weapons, then helmet, suit, gauntlet, boots, shield. */
const EXP_UP_COLUMN = new Map<number, number>([
  [2, 0], [4, 0], [6, 0], [3, 0], [5, 0], [7, 0], [11, 0], [12, 0], [36, 0], // SWD CHEERSTICK WAND AXE KNUCKLE STAFF YOYO BOW COLLECTER
  [17, 1], [18, 2], [19, 3], [20, 4], [16, 5], // HELMET SUIT GAUNTLET BOOTS SHIELD
]);
/** `expUpitem` of expTable.inc (lines 557-571): the percent a refine of +0 to +10 adds to min~max, by column. */
const EXP_UP_ITEM: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 2, 4, 6, 8, 10, 13, 16, 19, 21, 24],
  [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
];
/** `Setitem` of expTable.inc (lines 818-831): the set +N bonus, hit %, block %, max HP %, add magic, all stats. */
const SET_ENCHANT: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [25, 15, 0, 15, 0], [50, 15, 0, 20, 0], [50, 15, 25, 25, 5],
  [100, 30, 25, 30, 5], [100, 30, 25, 35, 5], [150, 50, 50, 40, 10], [150, 50, 50, 45, 10], [225, 75, 100, 50, 15],
];
/** The four parts whose lowest refine is the set +N (`GetSetItemClient`, Mover.cpp:8732-8748): suit, hands, feet, cap. */
const SET_ENCHANT_PARTS = [2, 4, 5, 6] as const;
/** `GetRandomOptionKind` (randomoption.cpp:112-149): the parts awakened, and the fashion parts blessed. */
const AWAKENING_PARTS: ReadonlySet<number> = new Set([2, 10, 11, 4, 5, 6]);
const BLESSING_PARTS: ReadonlySet<number> = new Set([27, 8, 26, 28, 29]);
/** `m_byFlag`: `expired` 0x01, `binds` 0x02. */
const FLAG_EXPIRED = 0x01;
const FLAG_BINDS = 0x02;
/** `IP_FLAG_EQUIP_BIND` (prop.dwFlag): soul-linked once worn. */
const IP_FLAG_EQUIP_BIND = 0x04;
/** The two materials the "binds" prefix skips (II_GEN_MAT_ORICHALCUM01_1, II_GEN_MAT_MOONSTONE_1). */
const BIND_PREFIX_SKIPPED: ReadonlySet<number> = new Set([2082, 2083]);
/** II_SYS_SYS_SCR_SEALCHARACTER: no socket count on its name line. */
const SEAL_CHARACTER = 26476;
/** `m_bItemResist` (SAI79): the element names. */
const ELEMENTS = new Map<number, string>([
  [1, 'TID_UPGRADE_FIRE'], [2, 'TID_UPGRADE_WATER'], [3, 'TID_UPGRADE_ELECTRICITY'], [4, 'TID_UPGRADE_WIND'], [5, 'TID_UPGRADE_EARTH'],
]);
/** PutBaseResist's lines, in its order (electricity, fire, water, wind, earth), as `resists` holds them. */
const RESIST_TEXTS = [
  'TID_GAME_TOOLTIP_ELEC_RES', 'TID_GAME_TOOLTIP_FIRE_RES', 'TID_GAME_TOOLTIP_WATER_RES', 'TID_GAME_TOOLTIP_WIND_RES',
  'TID_GAME_TOOLTIP_EARTH_RES',
] as const;
/** PutJob's texts: jobs 0-15, then the masters 16-23 and the heroes 24-31. */
const JOB_TEXTS = [
  'TID_GAME_TOOLTIP_REGVANG', 'TID_GAME_TOOLTIP_REGMERSER', 'TID_GAME_TOOLTIP_ACRO', 'TID_GAME_TOOLTIP_ASSIST',
  'TID_GAME_TOOLTIP_MAG', 'TID_GAME_TOOLTIP_PUPPET', 'TID_GAME_TOOLTIP_KNIGHT', 'TID_GAME_TOOLTIP_BLADE',
  'TID_GAME_TOOLTIP_JASTER', 'TID_GAME_TOOLTIP_RANGER', 'TID_GAME_TOOLTIP_RINGMAS', 'TID_GAME_TOOLTIP_BILLPOS',
  'TID_GAME_TOOLTIP_PSYCHIKEEPER', 'TID_GAME_TOOLTIP_ELEMENTOR', 'TID_GAME_TOOLTIP_GATE', 'TID_GAME_TOOLTIP_DOPPLER',
  ...['KNIGHT', 'BLADE', 'JESTER', 'RANGER', 'RINGMASTER', 'BILLPOSTER', 'PSYCHIKEEPER', 'ELEMENTOR'].map((job) => `TID_GAME_TOOLTIP_${job}_MASTER`),
  ...['KNIGHT', 'BLADE', 'JESTER', 'RANGER', 'RINGMASTER', 'BILLPOSTER', 'PSYCHIKEEPER', 'ELEMENTOR'].map((job) => `TID_GAME_TOOLTIP_${job}_HERO`),
];

// ---- the awakening (m_iRandomOptItemId, randomoption.cpp) -------------------------------------------------------------

const AWAKE_SAFE_FLAG = 1n << 61n;
const LEVEL_DOWN_5 = 1n << 62n;
const LEVEL_DOWN_10 = 1n << 63n;
const MAX_RANDOM_OPTION = 3;

const unsigned = (raw: bigint): bigint => BigInt.asUintN(64, raw);

/** The options counted from the first, up to the first empty one; the safe flag is not cleared (GetViewRandomOptionSize). */
function viewOptionCount(raw: bigint): number {
  const bits = unsigned(raw);
  let n = 0;
  while (n < MAX_RANDOM_OPTION && ((bits >> BigInt(8 + 18 * n)) & 0x3ffffn) !== 0n) n++;
  return n;
}

/** `GetRandomOptionSize` (:171-197): 0 when the safe flag is set. */
function optionCount(raw: bigint): number {
  return (unsigned(raw) & AWAKE_SAFE_FLAG) !== 0n ? 0 : viewOptionCount(raw);
}

/** `GetParam` (:151-169): option `i`'s DST (7 bits) and value, or null when its DST is 0. */
export function awakeningOption(raw: bigint, i: number): { dst: number; adj: number } | null {
  const n = Number(BigInt.asIntN(32, BigInt.asIntN(64, raw) >> BigInt(8 + 18 * i)));
  let adj = n & 0x1ff;
  if ((n & 0x200) !== 0) adj = -adj;
  const dst = (n >> 10) & 0x7f;
  return dst > 0 ? { dst, adj } : null;
}

/** `CItemElem::GetLevelDown` (Item.cpp:645-663): -10, -5 or 0, from bits 63 and 62 (63 first). */
export function levelDown(raw: bigint | undefined): number {
  if (raw === undefined) return 0;
  const bits = unsigned(raw);
  if ((bits & LEVEL_DOWN_10) !== 0n) return -10;
  if ((bits & LEVEL_DOWN_5) !== 0n) return -5;
  return 0;
}

// ---- jobs (CMover::IsInteriorityJob, MoverParam.cpp:409-458; JTYPE_*) --------------------------------------------------

const MAX_EXPERT = 6;
const MAX_PROFESSIONAL = 16;
const MAX_MASTER = 24;
/** `GetJobType`: JTYPE_BASE 0, EXPERT 1, PRO 2, MASTER 5, HERO 6. */
function jobType(job: number): number {
  if (job <= 0) return 0;
  if (job < MAX_EXPERT) return 1;
  if (job < MAX_PROFESSIONAL) return 2;
  if (job < MAX_MASTER) return 5;
  return 6;
}

/** The viewer can wear an item for `job`. */
function isInteriorityJob(viewerJob: number, job: number): boolean {
  if (job === 0 || job === viewerJob) return true;
  const type = jobType(viewerJob);
  if (type === 2 && job > 0 && job < MAX_EXPERT && (job * 2 + 4 === viewerJob || job * 2 + 5 === viewerJob)) return true;
  if (type === 5) {
    if (job < MAX_EXPERT) return job * 2 + 14 === viewerJob || job * 2 + 15 === viewerJob;
    if (job < MAX_PROFESSIONAL) return job + 10 === viewerJob;
  }
  if (type === 6) {
    if (job < MAX_EXPERT) return job * 2 + 22 === viewerJob || job * 2 + 23 === viewerJob;
    if (job < MAX_PROFESSIONAL) return job + 18 === viewerJob;
    if (job < MAX_MASTER) return job + 8 === viewerJob;
  }
  return false;
}

// ---- formatting --------------------------------------------------------------------------------------------------------

/** C's `%+d`. */
const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

/** `GetNumberFormatEx` (xUtil.cpp:396-410): a comma every three digits. */
const withCommas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A value as the rate formats print it: ATTACKSPEED's is `adj / 2 / 10` (C integer division). */
const rateValue = (dst: number, adj: number): number => (dst === DST_ATTACKSPEED ? Math.trunc(Math.trunc(adj / 2) / 10) : adj);

/** `CItemBase::GetCost` (Item.cpp:123-145): -1 without a cost; a refined item's goes up, in float32. */
function itemCost(prop: WebItemProp, option: number): number {
  if (prop.cost === undefined) return -1;
  if (option <= 0) return prop.cost;
  // (int)( dwCost + dwCost * ( 0.1f + opt * opt / 18.0f ) ), each step a float
  const cost = Math.fround(prop.cost);
  const rise = Math.fround(Math.fround(0.1) + Math.fround((option * option) / 18));
  return Math.trunc(Math.fround(cost + Math.fround(cost * rise)));
}

// ---- the builder --------------------------------------------------------------------------------------------------------

/** The lines of `item`'s tooltip (`MakeToolTipText`). `prop` is its row of propItem.txt. */
export function itemTooltip(item: InventoryItem, prop: WebItemProp, data: TooltipData, ctx: TooltipContext): TooltipLine[] {
  const lines: TooltipLine[] = [[]];
  const text = (tid: string): string => data.texts.get(tid)?.text ?? '';
  /** `CEditString::AddString`: a "\n" starts a new line. */
  const put = (value: string, color: number, style: { bold?: boolean; strike?: boolean } = {}): void => {
    value.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== '') lines.at(-1)!.push({ text: part, color, ...(style.bold ? { bold: true } : {}), ...(style.strike ? { strike: true } : {}) });
    });
  };
  const format = (tid: string, ...values: Array<string | number>): string => {
    let at = 0;
    return text(tid).replace(/%(?:\.\d+)?[ds]/g, () => String(values[at++] ?? ''));
  };
  const dstName = (dst: number): string => text(DST_NAMES.get(dst) ?? '');
  const option = item.abilityOption ?? 0;
  const flag = item.flag ?? 0;
  const viewer = ctx.viewer;

  // 1-2. PutItemName and PutItemAbilityPiercing (:4538-4640)
  const nameColor = prop.referStat1 === 2 ? NAME3 : prop.referStat1 === 1 || prop.referStat1 === 3 ? NAME1 : NAME0;
  let name = prop.name;
  if ((flag & FLAG_BINDS) !== 0 && !BIND_PREFIX_SKIPPED.has(prop.id) && prop.flag !== IP_FLAG_EQUIP_BIND) {
    name = `${text('TID_GAME_TOOLTIP_ITEM_BINDS')} ${name}`;
  }
  put(name, nameColor, { bold: true });
  if (option !== 0) put(` ${signed(option)}`, nameColor, { bold: true });
  const sockets = item.piercing ?? [];
  if (sockets.length > 0 && prop.id !== SEAL_CHARACTER) {
    put(`    (${sockets.filter((card) => card !== 0).length}/${sockets.length})`, PIERCING);
  }

  // 3. PutPetKind (:7611-7638): a hatched raised pet's data is not kept, so an egg is always one
  if (prop.kind3 === IK3_PET) put(`\n${text(prop.referStat1 === 1 ? 'TID_TOOLTIP_PET_BUFF' : 'TID_TOOLTIP_PET_PICKUP')}`, GENERAL);
  else if (prop.kind3 === IK3_EGG) put(`\n${text('TID_TOOLTIP_PET_REAR')}`, GENERAL);

  // 4. the equip-bind line (:6586-6595), in the TID's colour
  if (((prop.flag ?? 0) & IP_FLAG_EQUIP_BIND) !== 0) {
    put(`\n${text((flag & FLAG_BINDS) !== 0 ? 'TID_TOOLTIP_EQUIPBIND_AFTER' : 'TID_TOOLTIP_EQUIPBIND_BEFORE')}`, RED);
  }

  // 5. PutWeapon (:6151-6170)
  if (prop.kind3 !== IK3_SHIELD && prop.handed !== -1) {
    put(`\n${prop.handed === 1 ? text('TID_GAME_TOOLTIP_ONEHANDWEAPON') : prop.handed === 2 ? text('TID_GAME_TOOLTIP_TWOHANDWEAPON') : ''}`, GENERAL);
  }

  // 6. PutSex (:5984-5999)
  if (prop.sex !== undefined) {
    const color = viewer === null || viewer.sex === prop.sex ? GENERAL : NOT_USE;
    put(`\n${text(prop.sex === 0 ? 'TID_GAME_TOOLTIP_SEXMALE' : 'TID_GAME_TOOLTIP_SEXFEMALE')}`, color);
  }

  // 7. by dwItemKind2 (:6599-6693)
  const putDst = (dst: number, adj: number, color: number, literalPlus: boolean): void => {
    if (isDstRate(dst)) put(`\n${dstName(dst)}${signed(rateValue(dst, adj))}%`, color);
    else put(`\n${dstName(dst)}${literalPlus ? `+${adj}` : signed(adj)}`, color);
  };
  const baseItemOpt = (): void => {
    // PutBaseItemOpt (:5100-5179): the prop's three stats, then an accessory's of its refine
    const stats = prop.destParams.map((dst, i) => ({ dst, adj: prop.adjParams[i] ?? 0 }));
    const accessory = data.itemEtc?.accessories.get(prop.id)?.[option] ?? [];
    for (const { dst, adj } of [...stats, ...accessory]) {
      if (dst === -1) continue;
      if (dst === DST_STAT_ALLUP) {
        for (const each of [DST_STR, DST_DEX, DST_INT, DST_STA]) put(`\n${dstName(each)}${signed(adj)}`, GENERAL);
      } else {
        putDst(dst, adj, GENERAL, false);
      }
    }
  };
  if (GEAR_KINDS.has(prop.kind2)) {
    putMinMax();
    // PutItemSpeed (:4704-4716)
    if ((prop.kind2 === IK2_WEAPON_DIRECT || prop.kind2 === IK2_WEAPON_MAGIC) && prop.attackSpeed !== -1) {
      put('\n', GENERAL);
      put(format('TID_GAME_TOOLTIP_ATTACKSPEED', text(attackSpeedText(prop.attackSpeed))), GENERAL);
    }
    // PutItemResist (:4642-4702)
    if (prop.kind3 === IK3_ELECARD || ((item.resistOption ?? 0) !== 0 && (prop.kind1 === IK1_WEAPON || prop.kind1 === IK1_ARMOR))) {
      const element = text(ELEMENTS.get(item.resist ?? 0) ?? '');
      if (prop.kind1 === IK1_WEAPON || prop.kind1 === IK1_ARMOR) {
        if (element !== '') put(`\n${element}${signed(item.resistOption ?? 0)}`, GENERAL);
      } else {
        put(`\n${element} Lv${prop.itemLevel ?? -1}`, GENERAL);
      }
    }
    // PutBaseResist (:5641-5674)
    (prop.resists ?? []).forEach((value, i) => {
      if (value !== 0) put(`\n${format(RESIST_TEXTS[i]!, value)}`, GENERAL);
    });
    baseItemOpt();
    putEnchantOpt();
  } else if (MEDICINE_KINDS.has(prop.kind2)) {
    putMedicine(prop.destParams[0] ?? -1, prop.adjParams[0] ?? -1);
    putMedicine(prop.destParams[1] ?? -1, prop.adjParams[1] ?? -1);
  } else if (prop.kind2 === IK2_JEWELRY) {
    baseItemOpt();
  } else if (prop.kind2 === IK2_SYSTEM && prop.kind3 === IK3_VIS) {
    baseItemOpt();
  }

  // 12. PutKeepTime's duration (:5846-5869); the item's own time left is not kept
  if (prop.circleTime !== undefined) {
    put('\n', TIME);
    if (prop.circleTime === 1) {
      put(text('TID_GAME_COND_USE'), TIME);
    } else {
      const s = prop.circleTime;
      put(`${text('TID_TOOLTIP_ITEMTIME')} : `, TIME);
      put(format('TID_TOOLTIP_DATE', Math.trunc(s / 86400), Math.trunc((s % 86400) / 3600), Math.trunc((s % 3600) / 60), s % 60), TIME);
    }
  }

  // 13. PutJob (:6001-6116)
  if (prop.job !== undefined) {
    const color = viewer === null || isInteriorityJob(viewer.job, prop.job) ? GENERAL : NOT_USE;
    put(`\n${prop.job >= 0 && prop.job < JOB_TEXTS.length ? text(JOB_TEXTS[prop.job]!) : ''}`, color);
  }

  // 14. PutLevel (:6118-6149), with the awakening's level-down
  if (prop.limitLevel !== undefined) {
    const down = levelDown(item.randomOption);
    let usable = true;
    if (viewer !== null) {
      const own = jobType(viewer.job);
      const above = own >= 5 && own > jobType(prop.job ?? viewer.job);
      usable = above || viewer.level >= Math.max(0, prop.limitLevel + down);
    }
    put(`\n${format('TID_GAME_TOOLTIP_REQLEVEL', prop.limitLevel)}`, usable ? GENERAL : NOT_USE);
    if (down !== 0) put(`(${down})`, NOT_USE);
  }

  // 15. PutCommand (:6172-6213)
  if (prop.description) put(`\n${format('TID_ITEM_INFO', prop.description)}`, GENERAL);

  // 16. PutItemGold (:5676-5824): m_fShopCost, m_fShopBuyRate and m_fShopSellRate are 1.0 until the server says
  const cost = itemCost(prop, option);
  if (ctx.flag === 'shop' && cost !== -1) {
    put(`\n${format('TID_GAME_TOOLTIP_COST2', withCommas(Math.max(1, cost)))}`, GENERAL);
  } else if (ctx.flag === 'inventory' && ctx.shopOpen === true && cost !== -1) {
    put(`\n${format('TID_GAME_TOOLTIP_SHELLCOST2', withCommas(Math.max(1, Math.trunc((cost >>> 0) / 4))))}`, GENERAL);
  }

  // 17. PutSetItemOpt (:4941-4993)
  const set = data.itemEtc?.setOf.get(prop.id);
  if (set !== undefined) {
    const wornPiece = (elem: { itemId: number; part: number }): boolean => {
      const worn = ctx.worn?.(elem.part);
      return worn !== undefined && worn.itemId === elem.itemId && ((worn.flag ?? 0) & FLAG_EXPIRED) === 0;
    };
    const count = set.elems.filter(wornPiece).length;
    put(`\n\n${set.name} (${count}/${set.elems.length})`, GENERAL);
    for (const elem of set.elems) put(`\n   ${data.itemProps.get(elem.itemId)?.name ?? ''}`, wornPiece(elem) ? SET_ITEM1 : SET_ITEM0);
    // GetItemAvail( &a, nEquiped, TRUE ): every row the pieces worn reach, added up by DST in first-seen order
    const sums = new Map<number, number>();
    for (const row of set.avail) {
      if (row.count > count) break;
      sums.set(row.dst, (sums.get(row.dst) ?? 0) + row.adj);
    }
    for (const [dst, adj] of sums) {
      const label = `\n${text('TID_TOOLTIP_SET')}: ${dstName(dst)}`;
      put(isDstRate(dst) ? `${label}${signed(rateValue(dst, adj))}%` : `${label} +${adj}`, SET_EFFECT);
    }
  }

  // 20. PutPiercingOpt (:4862-4887): the cards' stats added up by DST, in first-seen order
  if (data.itemEtc !== undefined && sockets.length > 0) {
    const sums = new Map<number, number>();
    for (const card of sockets) {
      for (const { dst, adj } of data.itemEtc.piercing.get(card) ?? []) sums.set(dst, (sums.get(dst) ?? 0) + adj);
    }
    for (const [dst, adj] of sums) putDst(dst, adj, PIERCING, true);
  }

  // 21. PutAwakeningBlessing (:4719-4830)
  putAwakening();

  return lines;

  function putMinMax(): void {
    // PutItemMinMax (:4995-5062): GetItemMultiplier (MoverAttack.cpp:2069-2097) and pow( opt, 1.5 ), in float32
    put('\n', GENERAL);
    if (prop.abilityMin === -1 || prop.abilityMax === -1 || prop.endurance === undefined) return;
    const ultimate = prop.referStat1 === 2 && (prop.kind2 === IK2_WEAPON_DIRECT || prop.kind2 === IK2_WEAPON_MAGIC);
    const upOption = ultimate ? 10 : option;
    const column = EXP_UP_COLUMN.get(prop.kind3);
    const up = column === undefined || upOption <= 0 || upOption > 10 ? 0 : EXP_UP_ITEM[Math.min(column, 1)]![upOption]!;
    const f = (flag & FLAG_EXPIRED) !== 0 ? 0 : Math.fround(Math.fround(100 + up) / 100);
    const bonus = option > 0 ? Math.trunc(Math.pow(option, 1.5)) : 0;
    const min = Math.trunc(Math.fround(prop.abilityMin * f)) + bonus;
    const max = Math.trunc(Math.fround(prop.abilityMax * f)) + bonus;
    const weapon = prop.kind2 === IK2_WEAPON_DIRECT || prop.kind2 === IK2_WEAPON_MAGIC;
    put(text(weapon ? 'TID_GAME_TOOLTIP_ATTACKRANGE2' : 'TID_GAME_TOOLTIP_DEFENSE_B'), GENERAL);
    const color = f >= 1 ? EFFECTIVE[0] : f >= 0.8 ? EFFECTIVE[1] : f >= 0.6 ? EFFECTIVE[2] : EFFECTIVE[3];
    put(` ${min} ~ ${max}`, color);
  }

  function putEnchantOpt(): void {
    // PutEnchantOpt (:4889-4939): the lowest refine of the four worn parts, shown on a worn one of them
    if (ctx.flag !== 'inventory' || ctx.isWorn !== true || !(SET_ENCHANT_PARTS as readonly number[]).includes(prop.part)) return;
    let n = Infinity;
    for (const part of SET_ENCHANT_PARTS) n = Math.min(n, ctx.worn?.(part)?.abilityOption ?? 0);
    if (!(n > 0 && n <= 10)) return;
    const [hit, block, hp, magic, stats] = SET_ENCHANT[n - 1]!;
    if (hit > 0) put(`\n${text('TID_TOOLTIP_HITRATE')}+${hit}%`, GENERAL);
    if (block > 0) put(`\n${text('TID_GAME_TOOLTIPBLOCKRATE')}+${block}%`, GENERAL);
    if (hp > 0) put(`\n${text('TID_TOOLTIP_DST_HP_MAX_RATE')}+${hp}%`, GENERAL);
    if (magic > 0) put(`\n${text('TID_GAME_TOOLTIPCONDITIONRATE')}+${magic}`, GENERAL);
    if (stats > 0) put(`\n${text('TID_GAME_TOOLTIPALLSTAT')}+${stats}`, GENERAL);
  }

  function putMedicine(dst: number, adj: number): void {
    // PutMedicine (:5064-5098)
    if (dst === -1) return;
    if (adj !== -1) {
      put('\n', GENERAL);
      if (dst === 39) put(format('TID_GAME_TOOLTIP_RECOVMP', adj), GENERAL);
      else if (dst === 38) put(format('TID_GAME_TOOLTIP_RECOVHP', adj), GENERAL);
      else if (dst === 40) put(format('TID_GAME_TOOLTIP_RECOVFP', adj), GENERAL);
    }
    if (prop.abilityMin !== -1) put(`\n${format('TID_GAME_TOOLTIP_MAXRECOVER', prop.abilityMin)}`, GENERAL);
  }

  function putAwakening(): void {
    const kind = AWAKENING_PARTS.has(prop.part) ? 0 : BLESSING_PARTS.has(prop.part) ? 1 : prop.kind3 === IK3_PET ? 3 : -1;
    if (kind < 0) return;
    const raw = item.randomOption ?? 0n;
    const safe = (unsigned(raw) & AWAKE_SAFE_FLAG) !== 0n;
    const size = safe ? viewOptionCount(raw) : optionCount(raw);
    if (kind === 0 && size === 0) put(`\n"${text('TID_GAME_AWAKENING')}"`, AWAKENING);
    if (kind === 1 && size > 0) put(`\n${text('TID_GAME_BLESSING_CAPTION')}`, BLESSING);
    if (kind === 3 && size === 0) put(`\n"${text('TID_GAME_AWAKENNIG_PET_00')}"`, BLESSING);
    for (let i = 0; i < size; i++) {
      const opt = awakeningOption(raw, i);
      if (opt === null) continue;
      const sign = opt.adj > 0 ? '+' : '-';
      const line = isDstRate(opt.dst)
        ? `\n${dstName(opt.dst)} ${sign}${Math.abs(rateValue(opt.dst, opt.adj))}%${opt.dst === DST_ATTACKSPEED ? ' ' : ''}`
        : `\n${dstName(opt.dst)} ${sign}${Math.abs(opt.adj)}`;
      put(line, kind === 0 ? AWAKENING : BLESSING, { strike: kind === 0 && safe });
    }
    if (kind === 1 && size > 0) put(`\n${text('TID_GAME_BLESSING_WARNING')}`, RED);
  }
}

/** `GetATKSpeedString` (:107-121), the TID of the attack speed's word. */
function attackSpeedText(speed: number): string {
  if (speed < 0.035) return 'TID_GAME_VERYSLOW';
  if (speed < 0.05) return 'TID_GAME_SLOW';
  if (speed < 0.07) return 'TID_GAME_NORMALS';
  if (speed < 0.08) return 'TID_GAME_FAST';
  if (speed < 0.17) return 'TID_GAME_VERYFAST';
  return 'TID_GAME_FASTEST';
}
