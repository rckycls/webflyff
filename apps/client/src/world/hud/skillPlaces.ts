// Where the skill window draws each skill (Piece 7 M2, [R §11]), and the jobs' panels; the second jobs (2026-11-05) too:
//
//   CWndSkillTreeEx::GetSkillPoint   _Interface/WndField.cpp:6978-7393   a skill's rect, by its SI_* id
//   CWndSkillTreeEx::InitItem        WndField.cpp:6767-6908              the expert panel picture of each first job
//   CWndSkillTreeEx::OnDraw          WndField.cpp:7816-7823              drawn and pressed 2 px up, 27 x 27
//
// The Vagrant's three are WIDC_CUSTOM2-4 (62 / 112 / 164, 104) with `rect.top += 1` (:7172-7194). An expert skill is
// `( nRectX - nExpertGapX, nRectY - nExpertGapY )` (9 and 90, :7140-7141, :7375-7376) plus WIDC_STATIC5's top left (6, 168,
// `Resource/resdata.inc:6711`; :7153, :7392): `( nRectX + 3 - 6 ... )`, that is `( nRectX - 3, nRectY + 78 )`, then 2 px up.

/** The window's client pixels of a skill's icon (its top left, 2 px up as drawn). */
export interface SkillPlace { x: number; y: number }

/** The Vagrant's three: `SI_VAG_ONE_CLEANHIT`, `BRANDISH`, `OVERCUTTER` (`Resource/defineSkill.h:19-21`). */
const VAGRANT: ReadonlyArray<readonly [number, number, number]> = [[1, 62, 104], [2, 112, 104], [3, 164, 104]];

/**
 * The expert skills' `nRectX, nRectY` (`GetSkillPoint`), by skill id, each with the line of `WndField.cpp` it is on: the
 * Mercenary's (:7197-7211), the Assist's (:7232-7248), the Magician's (:7269-7285) and the Acrobat's (:7317-7332).
 */
const EXPERT: ReadonlyArray<readonly [id: number, x: number, y: number, line: number]> = [
  [4, 34, 109, 7197], // SI_MER_ONE_SPLMASH
  [9, 34, 161, 7198], // SI_MER_SHIELD_PROTECTION
  [5, 84, 97, 7199], // SI_MER_ONE_KEENWHEEL
  [112, 84, 123, 7200], // SI_MER_ONE_BLOODYSTRIKE
  [10, 84, 149, 7201], // SI_MER_SHIELD_PANBARRIER
  [111, 84, 175, 7202], // SI_MER_SUP_IMPOWERWEAPON
  [6, 134, 97, 7203], // SI_MER_ONE_BLINDSIDE
  [14, 134, 123, 7204], // SI_MER_ONE_REFLEXHIT
  [13, 134, 149, 7205], // SI_MER_ONE_SNEAKER
  [109, 134, 175, 7206], // SI_MER_SUP_SMITEAXE
  [108, 134, 201, 7207], // SI_MER_SUP_BLAZINGSWORD
  [11, 184, 97, 7208], // SI_MER_ONE_SPECIALHIT
  [12, 184, 123, 7209], // SI_MER_ONE_GUILOTINE
  [8, 184, 175, 7210], // SI_MER_SUP_AXEMASTER
  [7, 184, 201, 7211], // SI_MER_SUP_SWORDMASTER
  [44, 18, 135, 7232], // SI_ASS_HEAL_HEALING
  [46, 64, 109, 7233], // SI_ASS_HEAL_PATIENCE
  [114, 64, 135, 7234], // SI_ASS_CHEER_QUICKSTEP
  [52, 64, 161, 7235], // SI_ASS_CHEER_MENTALSIGN
  [104, 64, 187, 7236], // SI_ASS_KNU_TAMPINGHOLE
  [45, 110, 109, 7237], // SI_ASS_HEAL_RESURRECTION
  [20, 110, 135, 7238], // SI_ASS_CHEER_HASTE
  [49, 110, 161, 7239], // SI_ASS_CHEER_HEAPUP
  [113, 110, 187, 7240], // SI_ASS_CHEER_STONEHAND
  [51, 156, 109, 7241], // SI_ASS_CHEER_CIRCLEHEALING
  [115, 156, 135, 7242], // SI_ASS_CHEER_CATSREFLEX
  [53, 156, 161, 7243], // SI_ASS_CHEER_BEEFUP
  [105, 156, 187, 7244], // SI_ASS_KNU_BURSTCRACK
  [48, 202, 109, 7245], // SI_ASS_HEAL_PREVENTION
  [50, 202, 135, 7246], // SI_ASS_CHEER_CANNONBALL
  [116, 202, 161, 7247], // SI_ASS_CHEER_ACCURACY
  [117, 202, 187, 7248], // SI_ASS_KNU_POWERFIST
  [121, 34, 96, 7269], // SI_MAG_MAG_MENTALSTRIKE
  [107, 34, 148, 7270], // SI_MAG_MAG_BLINKPOOL
  [64, 84, 96, 7271], // SI_MAG_FIRE_BOOMERANG
  [69, 84, 122, 7272], // SI_MAG_WIND_SWORDWIND
  [118, 84, 148, 7273], // SI_MAG_WATER_ICEMISSILE
  [119, 84, 174, 7274], // SI_MAG_ELECTRICITY_LIGHTINGBALL
  [120, 84, 200, 7275], // SI_MAG_EARTH_SPIKESTONE
  [65, 134, 96, 7276], // SI_MAG_FIRE_HOTAIR
  [70, 134, 122, 7277], // SI_MAG_WIND_STRONGWIND
  [32, 134, 148, 7278], // SI_MAG_WATER_WATERBALL
  [34, 134, 174, 7279], // SI_MAG_ELECTRICITY_LIGHTINGPARM
  [36, 134, 200, 7280], // SI_MAG_EARTH_ROCKCRASH
  [30, 184, 96, 7281], // SI_MAG_FIRE_FIRESTRIKE
  [31, 184, 122, 7282], // SI_MAG_WIND_WINDCUTTER
  [33, 184, 148, 7283], // SI_MAG_WATER_SPRINGWATER
  [35, 184, 174, 7284], // SI_MAG_ELECTRICITY_LIGHTINGSHOCK
  [37, 184, 200, 7285], // SI_MAG_EARTH_LOOTING
  [206, 34, 97, 7317], // SI_ACR_YOYO_PULLING
  [197, 34, 123, 7318], // SI_ACR_SUP_SLOWSTEP
  [194, 34, 175, 7319], // SI_ACR_BOW_JUNKBOW
  [195, 84, 96, 7320], // SI_ACR_SUP_FASTWALKER
  [191, 84, 122, 7321], // SI_ACR_SUP_YOYOMASTER
  [192, 84, 174, 7322], // SI_ACR_SUP_BOWMASTER
  [193, 134, 96, 7323], // SI_ACR_SUP_DARKILLUSION
  [203, 134, 122, 7324], // SI_ACR_YOYO_SNITCH
  [201, 134, 149, 7325], // SI_ACR_YOYO_CROSSLINE
  [198, 134, 174, 7326], // SI_ACR_BOW_SILENTSHOT
  [196, 134, 200, 7327], // SI_ACR_BOW_AIMEDSHOT
  [199, 184, 96, 7328], // SI_ACR_YOYO_ABSOLUTEBLOCK
  [205, 184, 122, 7329], // SI_ACR_YOYO_DEADLYSWING
  [204, 184, 149, 7330], // SI_ACR_YOYO_COUNTER
  [202, 184, 174, 7331], // SI_ACR_BOW_AUTOSHOT
  [200, 184, 200, 7332], // SI_ACR_BOW_ARROWRAIN
];

/**
 * The second jobs' skills' `nRectX, nRectY` (`GetSkillPoint`, `nJobKind = MAX_PROFESSIONAL`), by skill id, each with its
 * line of `WndField.cpp`: the Knight's, Blade's, Billposter's, Ringmaster's, Elementor's, Psykeeper's, Jester's and
 * Ranger's (:7213-7350). Read from the C++ and `defineSkill.h`, all 75.
 */
const PROFESSIONAL: ReadonlyArray<readonly [id: number, x: number, y: number, line: number]> = [
  [133, 34, 260, 7213], // SI_KNT_TWOSW_CHARGE
  [134, 34, 286, 7214], // SI_KNT_TWOAX_PAINDEALER
  [128, 34, 312, 7215], // SI_KNT_SUP_GUARD
  [132, 84, 260, 7216], // SI_KNT_TWOSW_EARTHDIVIDER
  [135, 84, 286, 7217], // SI_KNT_TWOAX_POWERSTUMP
  [130, 84, 312, 7218], // SI_KNT_SUP_RAGE
  [131, 134, 272, 7219], // SI_KNT_TWO_POWERSWING
  [129, 134, 312, 7220], // SI_KNT_SUP_PAINREFLECTION
  [138, 34, 260, 7222], // SI_BLD_DOUBLESW_SILENTSTRIKE
  [140, 34, 286, 7223], // SI_BLD_DOUBLEAX_SPRINGATTACK
  [137, 34, 312, 7224], // SI_BLD_DOUBLE_ARMORPENETRATE
  [139, 84, 260, 7225], // SI_BLD_DOUBLESW_BLADEDANCE
  [141, 84, 286, 7226], // SI_BLD_DOUBLEAX_HAWKATTACK
  [143, 84, 312, 7227], // SI_BLD_SUP_BERSERK
  [136, 134, 272, 7228], // SI_BLD_DOUBLE_CROSSSTRIKE
  [142, 134, 312, 7229], // SI_BLD_DOUBLE_SONICBLADE
  [146, 34, 260, 7250], // SI_RIN_SUP_PROTECT
  [145, 34, 286, 7251], // SI_RIN_SUP_HOLYCROSS
  [149, 34, 312, 7252], // SI_RIN_HEAL_GVURTIALLA
  [147, 84, 260, 7253], // SI_RIN_SUP_HOLYGUARD
  [148, 84, 286, 7254], // SI_RIN_SUP_SPIRITUREFORTUNE
  [144, 84, 312, 7255], // SI_RIN_HEAL_HEALRAIN
  [150, 134, 272, 7256], // SI_RIN_SQU_GEBURAHTIPHRETH
  [151, 134, 312, 7257], // SI_RIN_SUP_MERKABAHANZELRUSHA
  [152, 34, 260, 7259], // SI_BIL_KNU_BELIALSMESHING
  [156, 34, 286, 7260], // SI_BIL_PST_ASMODEUS
  [154, 84, 260, 7261], // SI_BIL_KNU_BLOODFIST
  [157, 84, 286, 7262], // SI_BIL_PST_BARAQIJALESNA
  [153, 134, 260, 7263], // SI_BIL_KNU_PIERCINGSERPENT
  [158, 134, 286, 7264], // SI_BIL_PST_BGVURTIALBOLD
  [155, 184, 272, 7265], // SI_BIL_KNU_SONICHAND
  [159, 184, 312, 7266], // SI_BIL_PST_ASALRAALAIKUM
  [168, 34, 234, 7287], // SI_ELE_FIRE_FIREBIRD
  [174, 34, 260, 7288], // SI_ELE_EARTH_STONESPEAR
  [180, 34, 286, 7289], // SI_ELE_WIND_VOID
  [171, 34, 312, 7290], // SI_ELE_ELECTRICITY_THUNDERSTRIKE
  [177, 34, 338, 7291], // SI_ELE_WATER_ICESHARK
  [170, 84, 234, 7292], // SI_ELE_FIRE_BURINGFIELD
  [176, 84, 260, 7293], // SI_ELE_EARTH_EARTHQUAKE
  [182, 84, 286, 7294], // SI_ELE_WIND_WINDFIELD
  [173, 84, 312, 7295], // SI_ELE_ELECTRICITY_ELETRICSHOCK
  [179, 84, 338, 7296], // SI_ELE_WATER_POISONCLOUD
  [183, 134, 246, 7297], // SI_ELE_MULTY_METEOSHOWER
  [185, 134, 272, 7298], // SI_ELE_MULTY_SANDSTORM
  [184, 134, 298, 7299], // SI_ELE_MULTY_LIGHTINGSTORM
  [186, 134, 338, 7300], // SI_ELE_MULTY_AVALANCHE
  [169, 184, 234, 7301], // SI_ELE_FIRE_FIREMASTER
  [175, 184, 260, 7302], // SI_ELE_EARTH_EARTHMASTER
  [181, 184, 286, 7303], // SI_ELE_WIND_WINDMASTER
  [172, 184, 312, 7304], // SI_ELE_ELECTRICITY_LIGHTINGMASTER
  [178, 184, 338, 7305], // SI_ELE_WATER_WATERMASTER
  [160, 34, 260, 7307], // SI_PSY_NLG_DEMONOLGY
  [162, 34, 286, 7308], // SI_PSY_PSY_PSYCHICBOMB
  [165, 34, 312, 7309], // SI_PSY_NLG_CRUCIOSPELL
  [161, 84, 260, 7310], // SI_PSY_NLG_SATANOLGY
  [164, 84, 286, 7311], // SI_PSY_PSY_SPRITBOMB
  [166, 84, 312, 7312], // SI_PSY_PSY_MAXIMUMCRISIS
  [163, 134, 272, 7313], // SI_PSY_PSY_PSYCHICWALL
  [167, 134, 312, 7314], // SI_PSY_PSY_PSYCHICSQUARE
  [208, 34, 260, 7334], // SI_JST_SUP_POISON
  [209, 34, 286, 7335], // SI_JST_SUP_BLEEDING
  [213, 34, 312, 7336], // SI_JST_YOYO_ESCAPE
  [207, 84, 260, 7337], // SI_JST_YOYO_CRITICALSWING
  [211, 84, 286, 7338], // SI_JST_YOYO_BACKSTAB
  [210, 84, 312, 7339], // SI_JST_SUP_ABSORB
  [214, 134, 272, 7340], // SI_JST_YOYO_VATALSTAB
  [212, 134, 312, 7341], // SI_JST_YOYO_HITOFPENYA
  [216, 34, 260, 7343], // SI_RAG_BOW_ICEARROW
  [217, 34, 286, 7344], // SI_RAG_BOW_FLAMEARROW
  [219, 34, 312, 7345], // SI_RAG_BOW_POISONARROW
  [215, 84, 260, 7346], // SI_RAG_SUP_FASTATTACK
  [218, 84, 286, 7347], // SI_RAG_BOW_PIRCINGARROW
  [221, 84, 312, 7348], // SI_RAG_SUP_NATURE
  [222, 134, 272, 7349], // SI_RAG_BOW_TRIPLESHOT
  [220, 134, 312, 7350], // SI_RAG_BOW_SILENTARROW
];

/** `nExpertGapX`, `nExpertGapY` (:7140-7141), WIDC_STATIC5's top left (`resdata.inc:6711`), and the 2 px of `OnDraw` (:7821). */
const EXPERT_GAP = { x: 9, y: 90 } as const;
const STATIC5 = { x: 6, y: 168 } as const;
const DRAWN_UP = 2;
/** `nProGapX`, `nProGapY` (:7143-7144) and WIDC_STATIC7's top left (`resdata.inc:6720`): the second job's section. */
const PRO_GAP = { x: 8, y: 228 } as const;
const STATIC7 = { x: 6, y: 346 } as const;

const PLACES: ReadonlyMap<number, SkillPlace> = new Map<number, SkillPlace>([
  ...VAGRANT.map(([id, x, y]): [number, SkillPlace] => [id, { x, y: y + 1 - DRAWN_UP }]),
  ...EXPERT.map(([id, x, y]): [number, SkillPlace] => [
    id, { x: x - EXPERT_GAP.x + STATIC5.x, y: y - EXPERT_GAP.y + STATIC5.y - DRAWN_UP },
  ]),
  ...PROFESSIONAL.map(([id, x, y]): [number, SkillPlace] => [
    id, { x: x - PRO_GAP.x + STATIC7.x, y: y - PRO_GAP.y + STATIC7.y - DRAWN_UP },
  ]),
]);

/** Where `GetSkillPoint` draws the skill `skillId`, or undefined for one it has no place for (it returns FALSE). */
export function skillPlaceOf(skillId: number): SkillPlace | undefined {
  return PLACES.get(skillId);
}

/**
 * The expert section's panel of each first job, a theme picture (`m_atexJobPannel[0]`, `strTex[0]`): the Mercenary's
 * `Back_Me.TGA` (:6803), the Acrobat's `Back_Acr.tga` (:6875), the Assist's `Back_As.TGA` (:6835), the Magician's
 * `Back_Ma.TGA` (:6867). Painted at WIDC_STATIC5's top left, 2 px down (`AfterSkinTexture`, :8395-8418).
 */
export const JOB_PANELS: Readonly<Record<number, string>> = {
  1: 'Back_Me.TGA', 2: 'Back_Acr.tga', 3: 'Back_As.TGA', 4: 'Back_Ma.TGA',
};
/** Where the panel is painted: WIDC_STATIC5's top left, 2 px down (`AfterSkinTexture`, :8408-8411). */
export const PANEL_AT = { x: STATIC5.x, y: STATIC5.y + 2 } as const;

/**
 * The second section's panel of each second job (`m_atexJobPannel[1]`, `strTex[1]`, `InitItem` :6780-6905): the Knight's
 * `Back_Night.TGA`, the Blade's `Back_Blade.TGA`, the Jester's `Back_Jst.TGA`, the Ranger's `Back_Rag.TGA`, the Ringmaster's
 * `Back_Ring.TGA`, the Billposter's `Back_Bill.TGA`, the Psykeeper's `Back_Psy.TGA`, the Elementor's `Back_Ele.TGA`.
 * Painted at WIDC_STATIC7's top left, 2 px down (`AfterSkinTexture`, :8413-8420).
 */
export const PRO_PANELS: Readonly<Record<number, string>> = {
  6: 'Back_Night.TGA', 7: 'Back_Blade.TGA', 8: 'Back_Jst.TGA', 9: 'Back_Rag.TGA',
  10: 'Back_Ring.TGA', 11: 'Back_Bill.TGA', 12: 'Back_Psy.TGA', 13: 'Back_Ele.TGA',
};
export const PRO_PANEL_AT = { x: STATIC7.x, y: STATIC7.y + 2 } as const;

/** Each second job's first job (`JOB_KNIGHT` 6 to `JOB_ELEMENTOR` 13, `defineJob.h:53-60`). */
const FIRST_OF: Readonly<Record<number, number>> = { 6: 1, 7: 1, 8: 2, 9: 2, 10: 3, 11: 3, 12: 4, 13: 4 };

/**
 * A job's line, as `InitItem` reads it (:6767-6905): its first job and its second job, each or null. A Master (16-23) and
 * a Hero (24-31) are their second job's (`JOB_KNIGHT_MASTER` is `JOB_KNIGHT` + 10, `JOB_KNIGHT_HERO` + 18).
 */
export function jobLineOf(job: number): { first: number | null; second: number | null } {
  const second = job >= 24 && job <= 31 ? job - 18 : job >= 16 && job <= 23 ? job - 10 : job >= 6 && job <= 13 ? job : null;
  if (second !== null) return { first: FIRST_OF[second]!, second };
  return { first: job >= 1 && job <= 4 ? job : null, second: null };
}

/** The section a placed skill is drawn in: 0 the Vagrant's, 1 the first job's, 2 the second job's. */
export function sectionOf(skillId: number): 0 | 1 | 2 | undefined {
  if (VAGRANT.some(([id]) => id === skillId)) return 0;
  if (PROFESSIONAL.some(([id]) => id === skillId)) return 2;
  return PLACES.has(skillId) ? 1 : undefined;
}
