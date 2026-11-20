// FlyffWeb's own Start-menu icons (owner 2026-11-17: "create icons that matches the other windows"), for the three windows
// V15 has no icon for: Siege Ranking, Auto Play and the Pet Filter. They are drawn in Client/Icon's look by
// scripts/drawWindowIcons.ts and shipped with the build (src/icons/), as no game file holds them and the converter cannot
// make them. The HUD's art finds them under the keys the converter would give them (WorldScreen.startHud): framed
// `ui/<web name>.png` (`themeKey`) for the Start menu and the task bar, frameless `ui/bare/<web name>.png` (`bareIconKey`)
// for the phone's shortcuts and the desktop's Siege Ranking button.
// 2026-11-17 (owner): also the VIP1-VIP4 stars beside a VIP player's name (render/nameTags.ts `vipKey`) and the weekly
// champion's and MVP's crests over the name (`badgeKey`), which the name tags find the same way (WorldScreen's NameTagLayer).
// 2026-11-20 (owner, "make one for Teleporter window and Awaken window"): the Teleport and Awaken windows' icons too, in
// the place of the Blinkwing's and the Scroll of Awakening's item icons.

// custom (owner 2026-11-20): the Quick Job Change window's icon (the same draw script) and its 24 job portraits, drawn
// ahead from the game's own models by scripts/renderJobPortraits.ts (src/icons/jobs/job<N>_<m|f>.png).

import autoPlay from '../../icons/icon_autoplay.png';
import awaken from '../../icons/icon_awaken.png';
import jobChange from '../../icons/icon_jobchange.png';
import jobChangeBare from '../../icons/bare/icon_jobchange.png';
import petFilter from '../../icons/icon_petfilter.png';
import siegeRanking from '../../icons/icon_siegeranking.png';
import teleport from '../../icons/icon_teleport.png';
import autoPlayBare from '../../icons/bare/icon_autoplay.png';
import awakenBare from '../../icons/bare/icon_awaken.png';
import petFilterBare from '../../icons/bare/icon_petfilter.png';
import siegeRankingBare from '../../icons/bare/icon_siegeranking.png';
import teleportBare from '../../icons/bare/icon_teleport.png';
import vipStar1 from '../../icons/vipstar1.png';
import vipStar2 from '../../icons/vipstar2.png';
import vipStar3 from '../../icons/vipstar3.png';
import vipStar4 from '../../icons/vipstar4.png';
import weeklyChampion from '../../icons/weeklychampion.png';
import weeklyMvp from '../../icons/weeklymvp.png';

/** The applets' icon names in `APPLETS` (applets.ts) of the own icons. */
export const OWN_ICON_FILES = {
  siegeRanking: 'Icon_SiegeRanking.png',
  autoPlay: 'Icon_AutoPlay.png',
  petFilter: 'Icon_PetFilter.png',
  awaken: 'Icon_Awaken.png',
  teleport: 'Icon_Teleport.png',
  jobChange: 'Icon_JobChange.png',
} as const;

/** The job portraits' URLs (the build's), by file name (`job6_m.png`). */
const JOB_PORTRAITS = Object.entries(import.meta.glob<string>('../../icons/jobs/*.png', { eager: true, import: 'default' }))
  .map(([file, url]): [string, string] => [`ui/jobs/${file.slice(file.lastIndexOf('/') + 1)}`, url]);

/**
 * The UI key of the Quick Job Change window's picture of `job` for `sex` (0 male, 1 female): a Master (16-23) and a Hero
 * (24-31) use their second job's (6-13), with the Master or Hero mark over it (jobs/quickJobChangeWindow.ts).
 */
export function jobPortraitKey(job: number, sex: number): string {
  const drawn = job >= 24 ? job - 18 : job >= 16 ? job - 10 : job;
  return `ui/jobs/job${drawn}_${sex === 1 ? 'f' : 'm'}.png`;
}

/** The own icons' URLs (the build's), by their UI keys. */
export const OWN_ICONS: ReadonlyMap<string, string> = new Map([
  ['ui/icon_siegeranking.png', siegeRanking],
  ['ui/bare/icon_siegeranking.png', siegeRankingBare],
  ['ui/icon_autoplay.png', autoPlay],
  ['ui/bare/icon_autoplay.png', autoPlayBare],
  ['ui/icon_petfilter.png', petFilter],
  ['ui/bare/icon_petfilter.png', petFilterBare],
  ['ui/icon_awaken.png', awaken],
  ['ui/bare/icon_awaken.png', awakenBare],
  ['ui/icon_teleport.png', teleport],
  ['ui/bare/icon_teleport.png', teleportBare],
  ['ui/vipstar1.png', vipStar1],
  ['ui/vipstar2.png', vipStar2],
  ['ui/vipstar3.png', vipStar3],
  ['ui/vipstar4.png', vipStar4],
  ['ui/weeklychampion.png', weeklyChampion],
  ['ui/weeklymvp.png', weeklyMvp],
  ['ui/icon_jobchange.png', jobChange],
  ['ui/bare/icon_jobchange.png', jobChangeBare],
  ...JOB_PORTRAITS,
]);
