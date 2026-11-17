// `npx tsx apps/client/scripts/drawWindowIcons.ts`: draws FlyffWeb's own Start-menu icons (hud/ownIcons.ts) for the three
// windows V15 has no icon for (owner 2026-11-17): Siege Ranking (a castle with a flag), Auto Play (a gear with a play
// sign) and the Pet Filter (a paw over a funnel). They copy Client/Icon's look (Icon_Status.dds, Icon_Housing.dds and the
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

/** A five-pointed star's outline round (cx, cy): points `outer` out, notches `inner` in, one point up. */
function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const points = [...Array(10)].map((_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((i * 36 - 90) * Math.PI) / 180;
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

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 32, height: 32 }, deviceScaleFactor: 1 });
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
} finally {
  await browser.close();
}
