// FlyffWeb's own Start-menu icons (owner 2026-11-17: "create icons that matches the other windows"), for the three windows
// V15 has no icon for: Siege Ranking, Auto Play and the Pet Filter. They are drawn in Client/Icon's look by
// scripts/drawWindowIcons.ts and shipped with the build (src/icons/), as no game file holds them and the converter cannot
// make them. The HUD's art finds them under the keys the converter would give them (WorldScreen.startHud): framed
// `ui/<web name>.png` (`themeKey`) for the Start menu and the task bar, frameless `ui/bare/<web name>.png` (`bareIconKey`)
// for the phone's shortcuts and the desktop's Siege Ranking button.

import autoPlay from '../../icons/icon_autoplay.png';
import petFilter from '../../icons/icon_petfilter.png';
import siegeRanking from '../../icons/icon_siegeranking.png';
import autoPlayBare from '../../icons/bare/icon_autoplay.png';
import petFilterBare from '../../icons/bare/icon_petfilter.png';
import siegeRankingBare from '../../icons/bare/icon_siegeranking.png';

/** The applets' icon names in `APPLETS` (applets.ts) of the own icons. */
export const OWN_ICON_FILES = {
  siegeRanking: 'Icon_SiegeRanking.png',
  autoPlay: 'Icon_AutoPlay.png',
  petFilter: 'Icon_PetFilter.png',
} as const;

/** The own icons' URLs (the build's), by their UI keys. */
export const OWN_ICONS: ReadonlyMap<string, string> = new Map([
  ['ui/icon_siegeranking.png', siegeRanking],
  ['ui/bare/icon_siegeranking.png', siegeRankingBare],
  ['ui/icon_autoplay.png', autoPlay],
  ['ui/bare/icon_autoplay.png', autoPlayBare],
  ['ui/icon_petfilter.png', petFilter],
  ['ui/bare/icon_petfilter.png', petFilterBare],
]);
