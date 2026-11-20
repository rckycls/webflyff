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

import autoPlay from '../../icons/icon_autoplay.png';
import awaken from '../../icons/icon_awaken.png';
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
} as const;

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
]);
