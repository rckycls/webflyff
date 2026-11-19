// `npx tsx apps/client/scripts/drawWindowIcons.ts`: draws FlyffWeb's own Start-menu icons (hud/ownIcons.ts) for the three
// windows V15 has no icon for (owner 2026-11-17): Siege Ranking (a castle with a flag), Auto Play (a gear with a play
// sign) and the Pet Filter (a paw over a funnel); 2026-11-20 the Teleport window (a blue portal) and the Awaken window (a
// sword in a violet glow). They copy Client/Icon's look (Icon_Status.dds, Icon_Housing.dds and the
// rest): 32 x 32, a white panel (2..29, 3..29) in a peach and red rim, an orange orb (centre 15.5, 16.2, radius 12.9) and
// the picture over it, outlined in a dark shade of its own colour. Each is also written frameless (`ui/bare/`, as the
// converter's `stripIconFrame` makes the phone shortcuts' icons): the orb and the picture alone.
//
// Chromium draws the SVG at 32 x 32 (its edges smoothed, as the game's downscaled pictures are); the rim is whole pixels.
// The PNGs go to src/icons/ and src/icons/bare/, where the build takes them from; run this again after changing a picture.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const icons = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/icons');

/** Client/Icon's rim, pixel by pixel (Icon_Applet.dds): light on the top and left, dark on the right and bottom. */
const RIM = `
<g shape-rendering="crispEdges">
  <rect x="2" y="1" width="28" height="1" fill="#ffa58c"/><rect x="1" y="2" width="28" height="1" fill="#ffa58c"/>
  <rect x="2" y="2" width="1" height="1" fill="#ffceb5"/><rect x="29" y="2" width="1" height="1" fill="#f77363"/>
  <rect x="30" y="2" width="1" height="1" fill="#f74a39"/><rect x="1" y="3" width="1" height="27" fill="#ffa58c"/>
  <rect x="30" y="3" width="1" height="26" fill="#c63931"/><rect x="30" y="29" width="1" height="1" fill="#f74a39"/>
  <rect x="2" y="30" width="28" height="1" fill="#c63931"/><rect x="2" y="30" width="1" height="1" fill="#f74a39"/>
  <rect x="29" y="30" width="1" height="1" fill="#f74a39"/>
  <rect x="2" y="3" width="28" height="27" fill="#fff"/>
</g>`;

/** The orange orb behind the picture: pale at the centre and the top, an orange ring, a pink edge. */
const ORB = `
<defs>
  <radialGradient id="orb" cx="15.5" cy="16.2" r="12.9" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff9f4"/><stop offset=".48" stop-color="#ffe9d8"/><stop offset=".68" stop-color="#ffc79e"/>
    <stop offset=".84" stop-color="#ff9c5c"/><stop offset=".94" stop-color="#ff9452"/><stop offset="1" stop-color="#ffa48a"/>
  </radialGradient>
  <linearGradient id="orbTop" x1="0" y1="3" x2="0" y2="16" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffd2d6" stop-opacity=".95"/><stop offset=".55" stop-color="#ffe8dc" stop-opacity=".5"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
</defs>
<circle cx="15.5" cy="16.2" r="12.9" fill="url(#orb)"/>
<circle cx="15.5" cy="16.2" r="12.9" fill="url(#orbTop)"/>
<circle cx="15.5" cy="16.2" r="12.5" fill="none" stroke="#ffadad" stroke-width=".8" opacity=".55"/>`;

/** A gear's outline: `teeth` teeth from radius `r0` to `r1` around (cx, cy). */
function gearPath(cx: number, cy: number, r0: number, r1: number, teeth: number): string {
  const step = 360 / teeth;
  const at = (r: number, degrees: number): string => {
    const a = ((degrees - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  };
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    points.push(at(r0, a - step * 0.3), at(r1, a - step * 0.17), at(r1, a + step * 0.17), at(r0, a + step * 0.3), at(r0, a + step * 0.5));
  }
  return `M${points.join('L')}Z`;
}

/** `arms` spiral arms round (cx, cy), from radius `r` in to the middle, each turning 200 degrees, the first from `start`. */
function spiralArms(cx: number, cy: number, r: number, arms: number, start: number): string {
  return [...Array(arms)].map((_, arm) => {
    const points = [...Array(13)].map((_, i) => {
      const t = i / 12;
      const a = ((start + arm * (360 / arms) + t * 200) * Math.PI) / 180;
      const radius = r * (1 - t) + 1.2 * t;
      return `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`;
    });
    return `M${points.join('L')}`;
  }).join(' ');
}

/** The pictures, by the icons' web names (`themeKey('Icon_SiegeRanking.png')` is `ui/icon_siegeranking.png`). */
const PICTURES: Record<string, string> = {
  // Siege Ranking: a castle of pale blue stone, its gate, a red flag on the keep
  icon_siegeranking: `
<defs>
  <linearGradient id="stone" x1="5" y1="0" x2="26" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#f4f5fb"/><stop offset=".45" stop-color="#c9cee3"/><stop offset="1" stop-color="#8189ab"/>
  </linearGradient>
  <linearGradient id="keep" x1="10" y1="0" x2="21" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#d3d8ec"/><stop offset="1" stop-color="#8e96b8"/>
  </linearGradient>
  <linearGradient id="flag" x1="16" y1="3" x2="22" y2="7" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff8a6e"/><stop offset=".5" stop-color="#ec3d33"/><stop offset="1" stop-color="#b8231d"/>
  </linearGradient>
  <linearGradient id="gate" x1="0" y1="19" x2="0" y2="27" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#8a4a2a"/><stop offset="1" stop-color="#4a2210"/>
  </linearGradient>
</defs>
<line x1="15.5" y1="3.2" x2="15.5" y2="8.5" stroke="#5b3a1e" stroke-width="1.2"/>
<path d="M16 3.4 L22.4 5.2 L16 7.2 Z" fill="url(#flag)" stroke="#7d1712" stroke-width=".8" stroke-linejoin="round"/>
<path d="M5 26.6 V11.4 H6.8 V13 H8.4 V11.4 H10 V13 H10.6 V8.4 H12.4 V10 H14.2 V8.4 H16.8 V10 H18.6 V8.4 H20.4 V13 H21 V11.4 H22.6 V13 H24.2 V11.4 H26 V26.6 Z"
  fill="url(#stone)" stroke="#424a72" stroke-width="1" stroke-linejoin="round"/>
<path d="M10.6 26.6 V8.4 H12.4 V10 H14.2 V8.4 H16.8 V10 H18.6 V8.4 H20.4 V26.6 Z" fill="url(#keep)" stroke="#424a72" stroke-width="1" stroke-linejoin="round"/>
<path d="M12.9 26.6 V21.6 A2.6 2.6 0 0 1 18.1 21.6 V26.6 Z" fill="url(#gate)" stroke="#3a1a0c" stroke-width=".9"/>
<rect x="14.8" y="13.2" width="1.4" height="3" fill="#3d4466"/>
<rect x="7.2" y="16" width="1.2" height="2.6" fill="#4b5378"/>
<rect x="22.6" y="16" width="1.2" height="2.6" fill="#3d4466"/>
<path d="M5.6 20.5 H10.4 M20.6 20.5 H25.4 M10.9 18 H20.1" stroke="#9aa1c0" stroke-width=".6" opacity=".7"/>`,

  // Auto Play: a steel gear, a green play sign on its hub
  icon_autoplay: `
<defs>
  <linearGradient id="steel" x1="6" y1="6" x2="25" y2="27" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#c3cddb"/><stop offset="1" stop-color="#6e7c93"/>
  </linearGradient>
  <radialGradient id="hub" cx="14.2" cy="14.6" r="7.5" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d4dbe6"/>
  </radialGradient>
  <linearGradient id="play" x1="13" y1="12" x2="20" y2="21" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#9ef59a"/><stop offset=".5" stop-color="#34c04e"/><stop offset="1" stop-color="#1b8a35"/>
  </linearGradient>
</defs>
<path d="${gearPath(15.5, 16.2, 9, 11.6, 8)}" fill="url(#steel)" stroke="#36425a" stroke-width="1" stroke-linejoin="round"/>
<circle cx="15.5" cy="16.2" r="6.2" fill="url(#hub)" stroke="#5c6a82" stroke-width=".9"/>
<path d="M13.4 12.4 L20.2 16.2 L13.4 20 Z" fill="url(#play)" stroke="#11602a" stroke-width=".9" stroke-linejoin="round"/>`,

  // Pet Filter: a brown paw print over a blue funnel
  icon_petfilter: `
<defs>
  <linearGradient id="glass" x1="7" y1="0" x2="24" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#bfe4ff"/><stop offset=".45" stop-color="#5aa4ec"/><stop offset="1" stop-color="#2a5fb0"/>
  </linearGradient>
  <linearGradient id="mouth" x1="0" y1="13" x2="0" y2="17" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1d4a90"/><stop offset="1" stop-color="#3c7fd0"/>
  </linearGradient>
  <linearGradient id="paw" x1="9" y1="3" x2="22" y2="15" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#d9946a"/><stop offset=".55" stop-color="#a45c3a"/><stop offset="1" stop-color="#743a22"/>
  </linearGradient>
</defs>
<path d="M7.6 17.2 Q15.5 19.8 23.4 17.2 L17.3 23.2 V27.6 H13.7 V23.2 Z" fill="url(#glass)" stroke="#1a3878" stroke-width="1" stroke-linejoin="round"/>
<ellipse cx="15.5" cy="17.2" rx="7.9" ry="2.1" fill="url(#mouth)" stroke="#1a3878" stroke-width="1"/>
<g fill="url(#paw)" stroke="#4a2214" stroke-width=".9">
  <path d="M15.5 9.6 C20.4 9.6 22 14.6 20.2 16 C18.8 17 17.2 15.9 15.5 15.9 C13.8 15.9 12.2 17 10.8 16 C9 14.6 10.6 9.6 15.5 9.6 Z"/>
  <ellipse cx="8.3" cy="9.8" rx="1.9" ry="2.4" transform="rotate(-30 8.3 9.8)"/>
  <ellipse cx="12.3" cy="5.9" rx="1.9" ry="2.5" transform="rotate(-12 12.3 5.9)"/>
  <ellipse cx="18.7" cy="5.9" rx="1.9" ry="2.5" transform="rotate(12 18.7 5.9)"/>
  <ellipse cx="22.7" cy="9.8" rx="1.9" ry="2.4" transform="rotate(30 22.7 9.8)"/>
</g>
<g fill="#f2bc96" opacity=".7"><ellipse cx="14" cy="11.8" rx="1.6" ry=".9"/><ellipse cx="11.8" cy="5" rx=".5" ry=".7"/><ellipse cx="7.9" cy="9" rx=".5" ry=".7"/></g>
<path d="M9.8 18.6 L13 21.8" stroke="#e8f6ff" stroke-width=".9" opacity=".8"/>`,

  // 2026-11-20 (owner, "make one for Teleporter window and Awaken window"):
  // Teleport: a blue portal swirling in to a white-hot middle, two sparkles
  icon_teleport: `
<defs>
  <radialGradient id="warp" cx="15.5" cy="16.2" r="9.6" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset=".22" stop-color="#c8f6ff"/><stop offset=".5" stop-color="#4ab8ff"/>
    <stop offset=".8" stop-color="#3a52dc"/><stop offset="1" stop-color="#2c1c8e"/>
  </radialGradient>
</defs>
<circle cx="15.5" cy="16.2" r="9.4" fill="url(#warp)" stroke="#1c1a6a" stroke-width="1"/>
<path d="${spiralArms(15.5, 16.2, 8.8, 4, 0)}" fill="none" stroke="#2434a8" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
<path d="${spiralArms(15.5, 16.2, 8.8, 4, 45)}" fill="none" stroke="#f0fcff" stroke-width=".9" stroke-linecap="round" opacity=".9"/>
<circle cx="15.5" cy="16.2" r="2" fill="#fff"/>
<path d="${starPath(24.6, 6.6, 2.6, 0.6, 4)}" fill="#fff" stroke="#2a3ab8" stroke-width=".5" stroke-linejoin="round"/>
<path d="${starPath(6.6, 25, 1.9, 0.45, 4)}" fill="#fff" stroke="#2a3ab8" stroke-width=".45" stroke-linejoin="round"/>`,

  // Awaken: a steel sword, hilt down at the left, in a violet glow, a gold burst on its blade, sparkles
  icon_awaken: `
<defs>
  <radialGradient id="aura" cx="15.5" cy="15.2" r="11" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#d8b4ff" stop-opacity=".95"/><stop offset=".6" stop-color="#a86aff" stop-opacity=".45"/>
    <stop offset="1" stop-color="#a86aff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="blade" x1="0" y1="-1.7" x2="0" y2="1.7" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#c8d2e6"/><stop offset="1" stop-color="#6a7896"/>
  </linearGradient>
  <linearGradient id="hilt" x1="0" y1="-4" x2="0" y2="4" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#f4b42a"/><stop offset="1" stop-color="#a8640a"/>
  </linearGradient>
</defs>
<ellipse cx="15.5" cy="15.2" rx="12" ry="6.2" transform="rotate(-45 15.5 15.2)" fill="url(#aura)"/>
<g transform="translate(9.4 22.4) rotate(-45)">
  <path d="M1.4 -1.7 H17.6 L20.4 0 L17.6 1.7 H1.4 Z" fill="url(#blade)" stroke="#2c2a4a" stroke-width=".9" stroke-linejoin="round"/>
  <path d="M2.4 0 H17.8" stroke="#8a96b4" stroke-width=".6"/>
  <path d="M2 -1 H17.4" stroke="#fff" stroke-width=".5" opacity=".9"/>
  <path d="M-.4 -4.2 H1.4 V4.2 H-.4 Z" fill="url(#hilt)" stroke="#5a3006" stroke-width=".8" stroke-linejoin="round"/>
  <rect x="-4.6" y="-.95" width="4.2" height="1.9" fill="#7a3e1a" stroke="#3a1a08" stroke-width=".7"/>
  <circle cx="-5.6" cy="0" r="1.35" fill="url(#hilt)" stroke="#5a3006" stroke-width=".7"/>
</g>
<path d="${starPath(18.4, 13.2, 5, 1.1, 4)}" fill="#fffbe0" stroke="#c87a08" stroke-width=".6" stroke-linejoin="round"/>
<circle cx="18.4" cy="13.2" r="1.2" fill="#fff"/>
<path d="${starPath(24.6, 21.4, 2, 0.5, 4)}" fill="#f4e6ff" stroke="#7a3ad8" stroke-width=".45" stroke-linejoin="round"/>
<path d="${starPath(8.4, 8.4, 1.7, 0.42, 4)}" fill="#f4e6ff" stroke="#7a3ad8" stroke-width=".45" stroke-linejoin="round"/>`,
};

/** An SVG of 32 x 32: the rim and panel (framed only), then the orb and the picture, kept inside the panel. */
const svg = (picture: string, framed: boolean): string => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
${framed ? RIM : ''}<clipPath id="panel"><rect x="2" y="3" width="28" height="27"/></clipPath><g clip-path="url(#panel)">${ORB}${picture}</g></svg>`;

// 2026-11-17 (owner, "4 icons that is like the mvp medal but smaller ... for VIP1 to VIP4", then "make it a star", then
// "remove the border for VIP just the star"): the VIP stars beside a VIP player's name (render/nameTags.ts `vipKey`), at
// MEDAL_SIZE, with the siege MVP medal's (Theme/Default/TexGuildCombatBest.bmp, 25 x 25) shading and dark drop shadow 1 px
// right and down, without its gold frame. Each tier has its metal and its number on the star: VIP1 bronze, VIP2 silver,
// VIP3 gold, VIP4 purple.

/** The pictures' size: smaller than the MVP medal's 25. */
const MEDAL_SIZE = 18;

/** The numbers on the stars, 3 x 5 pixels. */
const DIGITS: Record<number, readonly string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
};

/** A tier's colours: the star's light, middle and dark metal, its outline and its number. */
interface StarColors { metal: [string, string, string]; outline: string; digit: string }
const STARS: Record<number, StarColors> = {
  1: { metal: ['#ffe2c2', '#dd9058', '#8a4a22'], outline: '#5a2a10', digit: '#4a1e08' },
  2: { metal: ['#ffffff', '#cdd5e2', '#7c879a'], outline: '#3e4658', digit: '#262c3a' },
  3: { metal: ['#fffbb0', '#ffc644', '#c07a20'], outline: '#79472a', digit: '#5a2a08' },
  4: { metal: ['#ffffff', '#d9b8ff', '#8a52d8'], outline: '#4a1a80', digit: '#34105e' },
};

/** A star's outline round (cx, cy): `n` points (five by default) `outer` out, notches `inner` in, one point up. */
function starPath(cx: number, cy: number, outer: number, inner: number, n = 5): string {
  const points = [...Array(2 * n)].map((_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((i * (180 / n) - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${points.join('L')}Z`;
}

/** A VIP star of 18 x 18: its shadow, the star and its number (x 7..9, y 7..11). */
function medal(tier: number): string {
  const { metal: [light, middle, deep], outline, digit } = STARS[tier]!;
  const star = starPath(8.5, 9.2, 8, 3.9);
  const number = DIGITS[tier]!.flatMap((row, y) => [...row].map((c, x) => c === '#' ? `<rect x="${7 + x}" y="${7 + y}" width="1" height="1" fill="${digit}"/>` : '')).join('');
  return `<defs><radialGradient id="metal" cx="7" cy="6.5" r="9" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${middle}"/><stop offset="1" stop-color="${deep}"/></radialGradient></defs>
<path d="${star}" transform="translate(1 1)" fill="#483a17"/>
<path d="${star}" fill="url(#metal)" stroke="${outline}" stroke-width=".8" stroke-linejoin="round"/>
<g shape-rendering="crispEdges">${number}</g>`;
}

// 2026-11-17/18 (owner, "the icon for weekly champs and mvp should be a longer icon on top of the name", a few rounds of
// crests, then "let's just go back to these [the winged CHAMP / MVP crests] but instead of text in the middle just use
// aibatt eyes", "make the eye fiery with lots of details", "lessen the full circle to consistent edges, a little more
// artistic"): the weekly crests over the name (render/NameTagLayer.ts `BANNER_SIZE`, `bannerPlace`), with no words.
// A soft glow and rays behind; two bat wings each side (a big front one with its bones, a darker one under it); on top the
// emblem (champion: a jewelled gold crown; MVP: a faceted gold star); in the middle a gold-rimmed plaque (red for the
// champion, blue for the MVP) holding Aibatt (Mvr_Aibatt-01.dds: a purple ball, one big eye) with its eye on fire: one
// mirrored flame rising from behind the ball in bands of even width, the eye bloodshot with a ring of fire for an iris
// (details below). Sapphires on the plaque's sides, a ruby at its point, confetti and sparkles round it. All outlined dark. Drawn at
// twice their size (BANNER_SCALE), so that a phone's tag, drawn at a pixel ratio of 2, keeps them sharp.

/** The crests' size (`BANNER_SIZE` in NameTagLayer.ts) and scale. */
const BANNER_WIDTH = 72;
const BANNER_HEIGHT = 36;
const BANNER_SCALE = 2;
/** The crests' middle line, where the wings mirror. */
const CREST_X = BANNER_WIDTH / 2;
interface Crest {
  emblem: 'crown' | 'star';
  /** The front wings' colours from the tip to the shoulder; the back wings' from the tip in. */
  wing: [string, string, string, string, string];
  wingBack: [string, string, string];
  /** The plaque, lighter to darker; the glow behind; the confetti. */
  plaque: [string, string, string];
  glow: string;
  confetti: [string, string, string, string];
}
const BANNERS: Record<string, Crest> = {
  weeklychampion: {
    emblem: 'crown',
    wing: ['#fff7b0', '#ffd23a', '#ff8a2a', '#ff3a5a', '#a81c78'], wingBack: ['#ffb04a', '#c8284a', '#5a0c3a'],
    plaque: ['#ff5a6a', '#c8183a', '#5a0620'], glow: '#ffe08a', confetti: ['#ffd23a', '#ff4a6a', '#3ad0ff', '#ffffff'],
  },
  weeklymvp: {
    emblem: 'star',
    wing: ['#e6fdff', '#6ad8ff', '#3a8cff', '#7a4af0', '#b03ad8'], wingBack: ['#4ac0ff', '#4a3ad0', '#24105a'],
    plaque: ['#7a9aff', '#2a3ad0', '#140a5a'], glow: '#a8ecff', confetti: ['#ffd23a', '#6ad8ff', '#c87aff', '#ffffff'],
  },
};

/** A crest's SVG, BANNER_WIDTH x BANNER_HEIGHT drawn at BANNER_SCALE. */
function banner({ emblem, wing, wingBack, plaque, glow, confetti }: Crest): string {
  const ink = '#1a0a28';
  const cx = CREST_X;
  const p2 = (n: number): string => n.toFixed(2);
  const mirror = `transform="translate(${BANNER_WIDTH} 0) scale(-1 1)"`;
  const rays = [...Array(12)].map((_, i) => {
    const a = ((i * 30 + 15) * Math.PI) / 180, b = a + 0.12, r = 30;
    return `M${cx} 19 L${p2(cx + r * Math.cos(a))} ${p2(19 + r * Math.sin(a) * 0.6)} L${p2(cx + r * Math.cos(b))} ${p2(19 + r * Math.sin(b) * 0.6)}Z`;
  }).join('');
  // the left wings (the right ones mirrored): the front one from behind the plaque up to the top corner, its lower edge
  // in five fingers; a back one, lower and darker
  const front = 'M27 23 C24 12 15 4.4 1.4 1.6 C3.4 4.6 4 7.6 3.2 10.8 C6.2 10 8.4 11 9.4 13.6 C11.8 12.8 14 13.8 15 16.4 C17.4 16 19.4 17.2 20.4 19.8 C22.4 19.8 24 21 24.6 23.6 Z';
  const membrane = 'M25.6 22.4 C22 14 15 8.6 3.6 4.4 C4.6 7 4.8 8.6 4.4 10.2 C7.2 9.8 9.2 10.8 10.2 12.8 C12.4 12.2 14.4 13.2 15.4 15.4 C17.6 15.2 19.6 16.4 20.6 18.6 C22.2 18.8 23.8 20 24.6 22 Z';
  const back = 'M27 25 C22 18 14 14.6 4.6 15 C6.4 16.6 7 18.2 6.6 20 C9 19.6 11 20.4 12 22.4 C14.4 21.8 16.6 22.8 17.6 25 C20.6 24.4 23.4 25.4 24.6 27.4 Z';
  const bones = 'M26 22.4 C22.6 12.8 14.6 6 2.2 2.2 M7.6 5 L9.4 13.4 M12.6 7.6 L15 16.2 M17.2 11 L20.4 19.6';
  const plaqueRim = 'M21 16.4 H51 L55.4 22.4 L51 28.8 L36 33.8 L21 28.8 L16.6 22.4 Z';
  const plaqueFace = 'M22.2 18 H49.8 L53.2 22.4 L49.8 27.6 L36 32.2 L22.2 27.6 L18.8 22.4 Z';
  const crown = `
<path d="M27.4 14.6 L26 6.2 L30.2 9.6 L33.4 4.4 L36 8.6 L38.6 4.4 L41.8 9.6 L46 6.2 L44.6 14.6 Z" fill="url(#gold)" stroke="${ink}" stroke-width=".9" stroke-linejoin="round"/>
<path d="M28.2 13.4 L27.4 8.4 L30.4 10.8 L33.4 6.4 L36 10.2 L38.6 6.4 L41.6 10.8 L44.6 8.4 L43.8 13.4 Z" fill="#c84a1a" opacity=".35"/>
<rect x="27.2" y="12.4" width="17.6" height="2.8" rx=".6" fill="url(#goldDeep)" stroke="${ink}" stroke-width=".7"/>
${[[26, 6.2], [33.4, 4.4], [38.6, 4.4], [46, 6.2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="url(#pearl)" stroke="${ink}" stroke-width=".4"/>`).join('')}
<path d="M36 6.4 L37.4 8.8 L36 11.2 L34.6 8.8 Z" fill="url(#ruby)" stroke="${ink}" stroke-width=".4"/>
<ellipse cx="31" cy="13.8" rx="1.2" ry=".8" fill="url(#sapphire)"/><ellipse cx="36" cy="13.8" rx="1.3" ry=".9" fill="url(#ruby)"/><ellipse cx="41" cy="13.8" rx="1.2" ry=".8" fill="url(#sapphire)"/>
<path d="M29.2 9 L30.2 12.2 M42.8 9 L41.8 12.2" stroke="#fff" stroke-width=".5" opacity=".7"/>`;
  // the star: each point in a light and a dark half
  const starTips = [...Array(10)].map((_, i) => {
    const r = i % 2 === 0 ? 7.4 : 3.1, a = ((i * 36 - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), 10 + r * Math.sin(a)] as const;
  });
  const facets = starTips.map(([x, y], i) => {
    const [x2, y2] = starTips[(i + 1) % 10]!;
    return `<path d="M${cx} 10 L${p2(x)} ${p2(y)} L${p2(x2)} ${p2(y2)} Z" fill="${i % 2 === 0 ? '#fff6b0' : '#e09a14'}"/>`;
  }).join('');
  const star = `
<circle cx="${cx}" cy="10" r="8.6" fill="url(#halo)"/>
<path d="${starPath(cx, 10, 7.4, 3.1)}" fill="url(#gold)" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/>
${facets}
<path d="${starPath(cx, 10, 7.4, 3.1)}" fill="none" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/>
<circle cx="${cx}" cy="10" r="1.1" fill="#fff"/>`;
  // Aibatt in the plaque, its eye on fire: a hot glow, one flame rising from behind its purple ball (mirrored: a long
  // tongue sweeping out to each side, a shorter one above it, a tall tip in the middle; three layers, one even outline),
  // embers; the eye (radius r) warm-lit and bloodshot, its iris a ring of fire (white-hot at the pupil, through yellow and
  // orange to a dark red rim) streaked with wisps of flame, a hot ring round the pupil, its purple lid lowered to a frown
  const ey = 24.6, r = 5.4, ir = r * 0.6, pr = r * 0.24;
  /**
   * A flame tongue from (x, y) towards `deg` (0 right, 90 down), `len` long, `wid` either side at the base, bending
   * `bend` to its left (negative: to its right) as it goes, so that its tip curls.
   */
  const tongue = (x: number, y: number, deg: number, len: number, wid: number, bend: number): string => {
    const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const pt = (t: number, s: number): string => {
      const side = s + bend * t * t;
      return `${p2(x + ux * len * t + nx * side)} ${p2(y + uy * len * t + ny * side)}`;
    };
    return `M${pt(0, wid)} C${pt(0.4, wid * 1.15)} ${pt(0.78, wid * 0.45)} ${pt(1, 0)} C${pt(0.72, -wid * 0.25)} ${pt(0.38, -wid)} ${pt(0, -wid)} Z`;
  };
  /**
   * The flame's left half from the eye's middle, as curves (two controls and an end): from under the ball out along the
   * long side tongue to its tip, back in, up the upper tongue, in again, and up to the middle tip.
   */
  type Point = readonly [number, number];
  const FLAME_LEFT: ReadonlyArray<readonly [Point, Point, Point]> = [
    [[-4.4, 6.6], [-9.6, 4.4], [-12.2, -2.8]],
    [[-10.6, -0.8], [-9.4, 0.2], [-7.8, -0.4]],
    [[-9.2, -3], [-9.4, -5.6], [-8.2, -8]],
    [[-7.2, -6.6], [-5.8, -6.2], [-4.2, -6.6]],
    [[-4, -8], [-1.4, -8.2], [0, -9.8]],
  ];
  const FLAME_START: Point = [0, 6.2];
  /** The whole flame: the left half, then the same curves backwards and mirrored. */
  const flamePath = ((): string => {
    const at = ([x, y]: Point): string => `${p2(cx + x)} ${p2(ey + y)}`;
    const mirrored = ([x, y]: Point): Point => [-x, y];
    const starts = [FLAME_START, ...FLAME_LEFT.map((curve) => curve[2])];
    const left = FLAME_LEFT.map(([a, b, end]) => `C${at(a)} ${at(b)} ${at(end)}`);
    const right = FLAME_LEFT.map(([a, b], i) => `C${at(mirrored(b))} ${at(mirrored(a))} ${at(mirrored(starts[i]!))}`).reverse();
    return `M${at(FLAME_START)} ${left.join(' ')} ${right.join(' ')} Z`;
  })();
  /**
   * The flame in bands of even width all along its edge: a yellow core, then an orange band and a red rim drawn as
   * strokes kept inside it, then its dark outline; a light line just inside the rim.
   */
  const band = (width: number, colour: string, extra = ''): string =>
    `<path d="${flamePath}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round"${extra}/>`;
  const flame = `<path d="${flamePath}" fill="url(#flameCore)"/>
<g clip-path="url(#flameInside)">${band(3.6, '#ff8a1a')}${band(2.6, '#ffd060', ' opacity=".6"')}${band(1.8, '#d01e0c')}</g>
${band(0.6, ink)}`;
  const embers = ([[-11, -7.6, 0.45], [11.2, -7.2, 0.45], [-14.2, 1.2, 0.4], [14.4, 0.8, 0.4], [-6.6, -9.8, 0.35], [6.8, -9.6, 0.35]] as const)
    .map(([x, y, s]) => `<circle cx="${p2(cx + x)}" cy="${p2(ey + y)}" r="${s}" fill="#fff2a0" stroke="#ff6a1a" stroke-width=".3"/>`).join('');
  // red veins from the eyeball's sides and bottom towards the iris, each with a twig
  const veins = [160, 195, 125, 20, 345, 55, 92].map((deg, i) => {
    const a = (deg * Math.PI) / 180, b = a + (i % 2 ? 0.35 : -0.35);
    const [x0, y0] = [cx + Math.cos(a) * r, ey + Math.sin(a) * r], [x1, y1] = [cx + Math.cos(b) * (ir + 0.5), ey + 0.3 + Math.sin(b) * (ir + 0.5)];
    const [mx, my] = [(x0 + x1) / 2 + Math.sin(a) * 0.5, (y0 + y1) / 2 - Math.cos(a) * 0.5];
    return `M${p2(x0)} ${p2(y0)} Q${p2(mx)} ${p2(my)} ${p2(x1)} ${p2(y1)} M${p2(mx)} ${p2(my)} L${p2(mx + Math.cos(a + 1.2) * 0.9)} ${p2(my + Math.sin(a + 1.2) * 0.9)}`;
  }).join(' ');
  // flame streaks in the iris, from the pupil out: light and dark by turns
  const streaks = [...Array(18)].map((_, i) => {
    const deg = i * 20 + (i % 2) * 7;
    const a = (deg * Math.PI) / 180;
    const d = tongue(cx + Math.cos(a) * pr * 1.1, ey + 0.3 + Math.sin(a) * pr * 1.1, deg, (ir - pr) * (i % 2 ? 0.8 : 1), 0.3, i % 3 === 0 ? 0.4 : -0.4);
    return `<path d="${d}" fill="${i % 2 ? '#8a0a04' : '#fff0a0'}" opacity="${i % 2 ? 0.6 : 0.85}"/>`;
  }).join('');
  const lidSide = ey - r * 0.86, lidMiddle = ey - r * 0.24;
  const lidEdge = `M${p2(cx - r - 1)} ${p2(lidSide)} Q${p2(cx - r * 0.5)} ${p2(lidSide + r * 0.1)} ${cx} ${p2(lidMiddle)} Q${p2(cx + r * 0.5)} ${p2(lidSide + r * 0.1)} ${p2(cx + r + 1)} ${p2(lidSide)}`;
  const rimLight = (from: number, to: number, radius: number): string => {
    const [a, b] = [(from * Math.PI) / 180, (to * Math.PI) / 180];
    return `M${p2(cx + Math.cos(a) * radius)} ${p2(ey + Math.sin(a) * radius)} A${radius} ${radius} 0 0 1 ${p2(cx + Math.cos(b) * radius)} ${p2(ey + Math.sin(b) * radius)}`;
  };
  const aibatt = `
<circle cx="${cx}" cy="${ey}" r="12" fill="url(#heat)"/>
${flame}
${embers}
<circle cx="${cx}" cy="${ey}" r="${p2(r + 1.1)}" fill="url(#body)" stroke="${ink}" stroke-width=".8"/>
<path d="${rimLight(200, 285, r + 1)}" stroke="#d8d0ff" stroke-width=".6" fill="none" opacity=".8" stroke-linecap="round"/>
<path d="${rimLight(5, 115, r + 1.15)}" stroke="#ff9a3a" stroke-width=".7" fill="none" opacity=".85" stroke-linecap="round"/>
<circle cx="${p2(cx + 0.4)}" cy="${p2(ey + 0.6)}" r="${r}" fill="${ink}" opacity=".55"/>
<g clip-path="url(#eyeball)">
  <circle cx="${cx}" cy="${ey}" r="${r}" fill="url(#sclera)"/>
  <path d="${veins}" stroke="#d01e1e" stroke-width=".22" fill="none" opacity=".75" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${p2(ey + 0.3)}" r="${p2(ir + 0.45)}" fill="none" stroke="#ffcf6a" stroke-width=".35" opacity=".6"/>
  <circle cx="${cx}" cy="${p2(ey + 0.3)}" r="${p2(ir)}" fill="url(#iris)"/>
  ${streaks}
  <circle cx="${cx}" cy="${p2(ey + 0.3)}" r="${p2(ir)}" fill="none" stroke="#4a0604" stroke-width=".55"/>
  <circle cx="${cx}" cy="${p2(ey + 0.3)}" r="${p2(pr + 0.3)}" fill="none" stroke="#fff6c0" stroke-width=".4" opacity=".9"/>
  <circle cx="${cx}" cy="${p2(ey + 0.3)}" r="${p2(pr)}" fill="#160202"/>
  <ellipse cx="${p2(cx - ir * 0.45)}" cy="${p2(ey - ir * 0.05)}" rx="${p2(ir * 0.28)}" ry="${p2(ir * 0.2)}" fill="#fff" opacity=".95"/>
  <circle cx="${p2(cx + ir * 0.45)}" cy="${p2(ey + ir * 0.6)}" r="${p2(ir * 0.12)}" fill="#fff" opacity=".8"/>
  <path d="${lidEdge}" transform="translate(0 .55)" stroke="${ink}" stroke-width="1.1" fill="none" opacity=".35"/>
  <path d="M${p2(cx - r - 1)} ${p2(ey - r - 1)} H${p2(cx + r + 1)} V${p2(lidSide)} Q${p2(cx + r * 0.5)} ${p2(lidSide + r * 0.1)} ${cx} ${p2(lidMiddle)} Q${p2(cx - r * 0.5)} ${p2(lidSide + r * 0.1)} ${p2(cx - r - 1)} ${p2(lidSide)} Z" fill="url(#lid)"/>
  <path d="${lidEdge}" stroke="${ink}" stroke-width=".8" fill="none"/>
  <path d="M${p2(cx - r * 0.75)} ${p2(ey - r * 0.86)} Q${cx} ${p2(ey - r * 1.04)} ${p2(cx + r * 0.55)} ${p2(ey - r * 0.9)}" stroke="#e8e0ff" stroke-width=".5" fill="none" opacity=".75" stroke-linecap="round"/>
</g>
<circle cx="${cx}" cy="${ey}" r="${r}" fill="none" stroke="${ink}" stroke-width=".9"/>`;
  const sparkle = (x: number, y: number, s: number): string => `<path d="${starPath(x, y, s, s * 0.26, 4)}" fill="#fffbe0" stroke="${ink}" stroke-width=".3"/>`;
  const bits = ([[6, 30, 20, 0], [64, 31, -25, 1], [12, 34, 40, 2], [59, 4, 10, 3], [14, 1.6, -30, 1], [67, 21, 35, 0], [3, 22, -15, 2]] as const)
    .map(([x, y, deg, c]) => `<rect x="${x}" y="${y}" width="2" height="1.1" rx=".3" fill="${confetti[c]}" stroke="${ink}" stroke-width=".25" transform="rotate(${deg} ${x + 1} ${y + 0.5})"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_WIDTH * BANNER_SCALE}" height="${BANNER_HEIGHT * BANNER_SCALE}" viewBox="0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}">
<defs>
  <radialGradient id="glow" cx="${cx}" cy="19" r="26" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow}" stop-opacity=".9"/><stop offset=".55" stop-color="${glow}" stop-opacity=".35"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
  <linearGradient id="wing" x1="2" y1="1" x2="25" y2="23" gradientUnits="userSpaceOnUse">${wing.map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join('')}</linearGradient>
  <linearGradient id="membrane" x1="0" y1="4" x2="0" y2="23" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="${ink}" stop-opacity=".35"/></linearGradient>
  <linearGradient id="wingBack" x1="4" y1="15" x2="26" y2="27" gradientUnits="userSpaceOnUse">${wingBack.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join('')}</linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffde0"/><stop offset=".35" stop-color="#ffe066"/><stop offset=".7" stop-color="#f0a818"/><stop offset="1" stop-color="#a85e06"/></linearGradient>
  <linearGradient id="goldDeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#b86a08"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="16" x2="0" y2="34" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6c0"/><stop offset=".4" stop-color="#ffc83a"/><stop offset="1" stop-color="#9a5404"/></linearGradient>
  <linearGradient id="plaque" x1="0" y1="18" x2="0" y2="32" gradientUnits="userSpaceOnUse">${plaque.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join('')}</linearGradient>
  <linearGradient id="gloss" x1="0" y1="18" x2="0" y2="23" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="ruby" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#ffd0d8"/><stop offset=".4" stop-color="#ff2a4a"/><stop offset="1" stop-color="#7a0018"/></radialGradient>
  <radialGradient id="sapphire" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#d8f6ff"/><stop offset=".4" stop-color="#2ab0ff"/><stop offset="1" stop-color="#0a3a8a"/></radialGradient>
  <radialGradient id="pearl" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e0b84a"/></radialGradient>
  <radialGradient id="halo" cx="${cx}" cy="10" r="8.6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
  <radialGradient id="sclera" cx=".42" cy=".42" r=".62"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff6e0"/><stop offset=".82" stop-color="#ffc890"/><stop offset="1" stop-color="#c8603a"/></radialGradient>
  <radialGradient id="iris" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe0"/><stop offset=".3" stop-color="#ffe24a"/><stop offset=".55" stop-color="#ff8a1a"/><stop offset=".78" stop-color="#c8180a"/><stop offset="1" stop-color="#3a0402"/></radialGradient>
  <radialGradient id="heat" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb04a" stop-opacity=".9"/><stop offset=".6" stop-color="#ff6a1a" stop-opacity=".45"/><stop offset="1" stop-color="#ff4a0a" stop-opacity="0"/></radialGradient>
  <radialGradient id="flameCore" cx="${cx}" cy="${ey + 2}" r="12" gradientUnits="userSpaceOnUse"><stop offset=".4" stop-color="#fffbd0"/><stop offset="1" stop-color="#ffd23a"/></radialGradient>
  <linearGradient id="lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b0a4f0"/><stop offset=".6" stop-color="#7a6ac8"/><stop offset="1" stop-color="#4a3a8a"/></linearGradient>
  <radialGradient id="body" cx=".38" cy=".32" r=".7"><stop offset="0" stop-color="#c4baff"/><stop offset=".5" stop-color="#7a6ac8"/><stop offset="1" stop-color="#3a2a6a"/></radialGradient>
  <clipPath id="flameInside"><path d="${flamePath}"/></clipPath>
  <clipPath id="eyeball"><circle cx="${cx}" cy="${ey}" r="${r}"/></clipPath>
</defs>
<ellipse cx="${cx}" cy="19" rx="30" ry="17" fill="url(#glow)"/>
<path d="${rays}" fill="#fff" opacity=".35"/>
<g stroke="${ink}" stroke-width=".9" stroke-linejoin="round"><path d="${back}" fill="url(#wingBack)"/><path d="${back}" fill="url(#wingBack)" ${mirror}/></g>
<g stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"><path d="${front}" fill="url(#wing)"/><path d="${front}" fill="url(#wing)" ${mirror}/></g>
<path d="${membrane}" fill="url(#membrane)"/><path d="${membrane}" fill="url(#membrane)" ${mirror}/>
<g stroke="#fff" stroke-opacity=".6" stroke-width=".45" fill="none" stroke-linecap="round"><path d="${bones}"/><path d="${bones}" ${mirror}/></g>
<g stroke="#fff" stroke-opacity=".85" stroke-width=".6" fill="none" stroke-linecap="round"><path d="M24.6 13.4 C21.4 8.6 14 4.4 4.4 2.6"/><path d="M24.6 13.4 C21.4 8.6 14 4.4 4.4 2.6" ${mirror}/></g>
${emblem === 'crown' ? crown : star}
<path d="${plaqueRim}" fill="url(#rim)" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="${plaqueFace}" fill="url(#plaque)" stroke="#5a2a04" stroke-width=".5" stroke-linejoin="round"/>
<path d="M22.2 18 H49.8 L52.2 21.2 C45 22.6 27 22.6 19.8 21.2 Z" fill="url(#gloss)"/>
<path d="M17.4 22.4 L18.8 20.6 L20.2 22.4 L18.8 24.2 Z M54.6 22.4 L53.2 20.6 L51.8 22.4 L53.2 24.2 Z" fill="url(#sapphire)" stroke="${ink}" stroke-width=".4"/>
<path d="M36 30.6 L37.2 32 L36 33.4 L34.8 32 Z" fill="url(#ruby)" stroke="${ink}" stroke-width=".35"/>
${aibatt}
${bits}
${sparkle(8, 26, 2.2)}${sparkle(63.6, 26.6, 2.6)}${sparkle(53.4, 6.4, 1.8)}${sparkle(19.4, 5.6, 1.3)}${sparkle(66, 12, 1.2)}
</svg>`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 100 }, deviceScaleFactor: 1 });
  await mkdir(path.join(icons, 'bare'), { recursive: true });
  for (const [name, picture] of Object.entries(PICTURES)) {
    for (const framed of [true, false]) {
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg(picture, framed)}</body></html>`);
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 32, height: 32 } });
      const file = path.join(icons, framed ? '' : 'bare', `${name}.png`);
      await writeFile(file, png);
      console.log(path.relative(process.cwd(), file));
    }
  }
  for (const tier of [1, 2, 3, 4]) {
    const n = MEDAL_SIZE;
    await page.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 ${n} ${n}">${medal(tier)}</svg></body></html>`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } });
    const file = path.join(icons, `vipstar${tier}.png`);
    await writeFile(file, png);
    console.log(path.relative(process.cwd(), file));
  }
  for (const [name, spec] of Object.entries(BANNERS)) {
    await page.setContent(`<html><body style="margin:0;background:transparent">${banner(spec)}</body></html>`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: BANNER_WIDTH * BANNER_SCALE, height: BANNER_HEIGHT * BANNER_SCALE } });
    const file = path.join(icons, `${name}.png`);
    await writeFile(file, png);
    console.log(path.relative(process.cwd(), file));
  }
} finally {
  await browser.close();
}
