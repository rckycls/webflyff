// Where the skill window draws each skill (Piece 7 M2, [R §11]), and the four first jobs' panels:
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

/** `nExpertGapX`, `nExpertGapY` (:7140-7141), WIDC_STATIC5's top left (`resdata.inc:6711`), and the 2 px of `OnDraw` (:7821). */
const EXPERT_GAP = { x: 9, y: 90 } as const;
const STATIC5 = { x: 6, y: 168 } as const;
const DRAWN_UP = 2;

const PLACES: ReadonlyMap<number, SkillPlace> = new Map<number, SkillPlace>([
  ...VAGRANT.map(([id, x, y]): [number, SkillPlace] => [id, { x, y: y + 1 - DRAWN_UP }]),
  ...EXPERT.map(([id, x, y]): [number, SkillPlace] => [
    id, { x: x - EXPERT_GAP.x + STATIC5.x, y: y - EXPERT_GAP.y + STATIC5.y - DRAWN_UP },
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
