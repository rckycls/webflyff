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

// 2026-11-17 (owner, "the icon for weekly champs and mvp should be a longer icon on top of the name", then a few rounds,
// "like a warrior something, no skies", their pick "A: Shield & swords", "wider, a little more details", "make the shield
// subtle and go heavy on crown and star", then "the crown looks awful and they are not centered, make another take"): the
// weekly crests over the name (render/NameTagLayer.ts `BANNER_SIZE`, `bannerPlace`), with no words. Everything is centred
// on one point (CREST_MIDDLE): two long swords crossed flat there, a small dark heater shield centred on it, and on the
// shield the crest's emblem, large:
// - champion: a gold crown: five points, each in a light and a dark half like a cut gem, gold balls on their tips, a ruby
//   on the middle one, a dark inside between them; a beveled band (a light lip, the face, a dark lip) set with a large cut
//   ruby, two sapphires and two small diamonds;
// - MVP: a gold star over a silver-blue eight-point burst: faceted points, an engraved inner bevel, lines from the centre
//   to the points, a round cut sapphire in a gold bezel.
// White glints on both. All outlined thick and dark. Drawn at twice their size (BANNER_SCALE), so that a phone's tag, drawn
// at a pixel ratio of 2, keeps them sharp.

/** The crests' size (`BANNER_SIZE` in NameTagLayer.ts) and scale. */
const BANNER_WIDTH = 88;
const BANNER_HEIGHT = 36;
const BANNER_SCALE = 2;
/** Where the swords cross and the shield and the emblem are centred. */
const CREST_MIDDLE: readonly [number, number] = [BANNER_WIDTH / 2, 18];
interface Crest {
  /** The shield's field, lighter to darker (kept dark: the emblem is the crest). */
  field: [string, string];
  /** The gem in the swords' guards and pommels; the tassels' colour. */
  gem: 'sapphire' | 'ruby';
  tassel: string;
  emblem: 'crown' | 'star';
}
const BANNERS: Record<string, Crest> = {
  weeklychampion: { field: ['#5a1a24', '#24080e'], gem: 'sapphire', tassel: '#a8202e', emblem: 'crown' },
  weeklymvp: { field: ['#1e2a5a', '#0a0e26'], gem: 'ruby', tassel: '#2450b8', emblem: 'star' },
};

/** A crest's SVG, BANNER_WIDTH x BANNER_HEIGHT drawn at BANNER_SCALE. */
function banner({ field, gem, tassel, emblem }: Crest): string {
  const ink = '#160a1e';
  const [cx, cy] = CREST_MIDDLE;
  const p2 = (n: number): string => n.toFixed(2);
  const poly = (points: ReadonlyArray<readonly [number, number]>): string => `M${points.map(([x, y]) => `${p2(x)} ${p2(y)}`).join(' L')} Z`;
  const jewel = (x: number, y: number, r: number, fill = `url(#${gem})`): string =>
    `<path d="M${p2(x)} ${p2(y - r)} L${p2(x + r * 0.8)} ${p2(y)} L${p2(x)} ${p2(y + r)} L${p2(x - r * 0.8)} ${p2(y)} Z" fill="${fill}" stroke="${ink}" stroke-width=".45"/>
<path d="M${p2(x)} ${p2(y - r)} L${p2(x + r * 0.8)} ${p2(y)} L${p2(x)} ${p2(y)} Z" fill="#fff" opacity=".4"/>`;
  const glint = (x: number, y: number, r: number): string => `<path d="${starPath(x, y, r, r * 0.22, 4)}" fill="#fff"/>`;
  // a sword along +x from its guard at the origin: a 36-unit blade, a curved guard, a wrapped grip, a pommel
  const sword = `
<path d="M0 -1.7 L33 -1.7 L37.6 0 L33 1.7 L0 1.7 Z" fill="url(#steel)" stroke="${ink}" stroke-width=".7" stroke-linejoin="round"/>
<path d="M1.6 0 L32 0" stroke="#7a86a0" stroke-width=".7"/><path d="M1 -1.1 L33 -1.1" stroke="#fff" stroke-width=".45" opacity=".85"/>
<path d="M-1.2 -5.6 C1.2 -5.4 2 -4 2 -2.2 L1.2 -1.2 L1.2 1.2 L2 2.2 C2 4 1.2 5.4 -1.2 5.6 C-.4 3.6 -.6 2.2 -1.3 1.2 V-1.2 C-.6 -2.2 -.4 -3.6 -1.2 -5.6 Z" fill="url(#gold)" stroke="${ink}" stroke-width=".6" stroke-linejoin="round"/>
${jewel(0.2, 0, 1)}
<rect x="-7.4" y="-1.15" width="6.1" height="2.3" fill="url(#wood)" stroke="${ink}" stroke-width=".5"/>
<path d="M-6.6 -1.1 L-5.8 1.1 M-5 -1.1 L-4.2 1.1 M-3.4 -1.1 L-2.6 1.1" stroke="#2a1006" stroke-width=".4"/>
<circle cx="-8.8" cy="0" r="1.7" fill="url(#gold)" stroke="${ink}" stroke-width=".6"/>
${jewel(-8.8, 0, 0.8)}`;
  // two of them crossed at the middle, 13 degrees from the horizontal, each 14 units past its guard there, 1.45 times
  // bigger; from each pommel a tassel hangs straight down
  const scale = 1.45, mid = 14;
  const swords: string[] = [];
  const tassels: string[] = [];
  for (const deg of [-13, 193]) {
    const a = (deg * Math.PI) / 180, gx = cx - mid * scale * Math.cos(a), gy = cy - mid * scale * Math.sin(a);
    swords.push(`<g transform="translate(${p2(gx)} ${p2(gy)}) rotate(${deg}) scale(${scale})">${sword}</g>`);
    const px = gx - 10.4 * scale * Math.cos(a), py = gy - 10.4 * scale * Math.sin(a);
    const cord = `M${p2(px)} ${p2(py)} C${p2(px - 0.6)} ${p2(py + 1.4)} ${p2(px + 0.6)} ${p2(py + 2)} ${p2(px)} ${p2(py + 2.8)}`;
    tassels.push(`<path d="${cord}" stroke="${ink}" stroke-width="1.1" fill="none"/><path d="${cord}" stroke="#ffd860" stroke-width=".5" fill="none"/>
<path d="M${p2(px - 1.1)} ${p2(py + 3)} H${p2(px + 1.1)} L${p2(px + 1.6)} ${p2(py + 6.4)} H${p2(px - 1.6)} Z" fill="${tassel}" stroke="${ink}" stroke-width=".55" stroke-linejoin="round"/>
<rect x="${p2(px - 1.4)}" y="${p2(py + 2.5)}" width="2.8" height="1.2" rx=".4" fill="url(#gold)" stroke="${ink}" stroke-width=".45"/>`);
  }
  // the small dark shield, centred on the middle: x and y below are from it
  const at = (d: string): string => d.replace(/X(-?[\d.]+) Y(-?[\d.]+)/g, (_, dx: string, dy: string) => `${p2(cx + Number(dx))} ${p2(cy + Number(dy))}`);
  const shield = at('MX-10 Y-13.4 LX10 Y-13.4 LX10 Y-2 CX10 Y6.6 X5.2 Y12 X0 Y15.6 CX-5.2 Y12 X-10 Y6.6 X-10 Y-2 Z');
  const fieldPath = at('MX-8.8 Y-12.2 LX8.8 Y-12.2 LX8.8 Y-2 CX8.8 Y6 X4.6 Y11 X0 Y14.2 CX-4.6 Y11 X-8.8 Y6 X-8.8 Y-2 Z');
  const shieldSvg = `<path d="${shield}" fill="url(#rimDark)" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
<path d="${fieldPath}" fill="url(#field)" stroke="${ink}" stroke-width=".4"/>
<path d="M${p2(cx)} ${p2(cy - 12)} V${p2(cy + 14)}" stroke="#000" stroke-opacity=".3" stroke-width="2.2"/>`;
  // the crown, 26 wide and 22 tall, centred on the middle: its band from y + 2.6 to y + 9.6, its points up to y - 10.4
  const bandTop = cy + 3, base = cy + 3.4;
  const tips: ReadonlyArray<readonly [number, number]> = [[cx - 12.4, cy - 5.4], [cx - 6.4, cy - 8], [cx, cy - 10.4], [cx + 6.4, cy - 8], [cx + 12.4, cy - 5.4]];
  const valleys: ReadonlyArray<readonly [number, number]> = [[cx - 13, base], [cx - 9, cy], [cx - 3, cy - 0.6], [cx + 3, cy - 0.6], [cx + 9, cy], [cx + 13, base]];
  const outline = poly([valleys[0]!, ...tips.flatMap((t, i) => (i < 4 ? [t, valleys[i + 1]!] : [t])), valleys[5]!]);
  const facets = tips.map((t, i) => {
    const l = valleys[i]!, r = valleys[i + 1]!;
    return `<path d="${poly([[l[0], base], l, t, [t[0], base]])}" fill="url(#facetLight)"/><path d="${poly([[t[0], base], t, r, [r[0], base]])}" fill="url(#facetDark)"/>`;
  }).join('');
  const band = `M${p2(cx - 13.4)} ${p2(bandTop)} Q${p2(cx)} ${p2(bandTop + 2)} ${p2(cx + 13.4)} ${p2(bandTop)} L${p2(cx + 13.4)} ${p2(cy + 9.4)} Q${p2(cx)} ${p2(cy + 11.6)} ${p2(cx - 13.4)} ${p2(cy + 9.4)} Z`;
  const lip = (y0: number, y1: number, fill: string): string =>
    `<path d="M${p2(cx - 13.4)} ${p2(y0)} Q${p2(cx)} ${p2(y0 + 2)} ${p2(cx + 13.4)} ${p2(y0)} L${p2(cx + 13.4)} ${p2(y1)} Q${p2(cx)} ${p2(y1 + 2)} ${p2(cx - 13.4)} ${p2(y1)} Z" fill="${fill}"/>`;
  const cutGem = (x: number, y: number, w: number, h: number, fill: string): string => {
    const pts = [[x - w, y - h * 0.4], [x - w * 0.55, y - h], [x + w * 0.55, y - h], [x + w, y - h * 0.4], [x + w, y + h * 0.4], [x + w * 0.55, y + h], [x - w * 0.55, y + h], [x - w, y + h * 0.4]] as const;
    return `<path d="${poly([[x - w - 0.6, y - h * 0.45], [x - w * 0.55 - 0.3, y - h - 0.6], [x + w * 0.55 + 0.3, y - h - 0.6], [x + w + 0.6, y - h * 0.45], [x + w + 0.6, y + h * 0.45], [x + w * 0.55 + 0.3, y + h + 0.6], [x - w * 0.55 - 0.3, y + h + 0.6], [x - w - 0.6, y + h * 0.45]])}" fill="url(#goldDeep)" stroke="${ink}" stroke-width=".45"/>
<path d="${poly(pts)}" fill="url(#${fill})" stroke="${ink}" stroke-width=".35"/>
<path d="${poly([[x - w * 0.5, y - h * 0.45], [x + w * 0.5, y - h * 0.45], [x + w * 0.5, y + h * 0.45], [x - w * 0.5, y + h * 0.45]])}" fill="#fff" opacity=".18"/>
<path d="M${p2(x - w)} ${p2(y - h * 0.4)} L${p2(x - w * 0.5)} ${p2(y - h * 0.45)} M${p2(x + w)} ${p2(y - h * 0.4)} L${p2(x + w * 0.5)} ${p2(y - h * 0.45)} M${p2(x - w)} ${p2(y + h * 0.4)} L${p2(x - w * 0.5)} ${p2(y + h * 0.45)} M${p2(x + w)} ${p2(y + h * 0.4)} L${p2(x + w * 0.5)} ${p2(y + h * 0.45)}" stroke="#fff" stroke-width=".25" opacity=".5"/>
<path d="${poly([[x - w * 0.55, y - h], [x - w * 0.1, y - h], [x - w * 0.5, y - h * 0.45], [x - w, y - h * 0.4]])}" fill="#fff" opacity=".55"/>`;
  };
  const crown = `
<path d="M${p2(cx - 12)} ${p2(base)} Q${p2(cx)} ${p2(cy - 6)} ${p2(cx + 12)} ${p2(base)} Z" fill="#4a0a14"/>
<path d="${outline}" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>
${facets}
<path d="${outline}" fill="none" stroke="#8a4a04" stroke-width=".5" stroke-linejoin="round"/>
${tips.map(([x, y], i) => `<circle cx="${p2(x)}" cy="${p2(y - (i === 2 ? 1.5 : 1.1))}" r="${i === 2 ? 1.75 : 1.3}" fill="url(#ball)" stroke="${ink}" stroke-width=".55"/>
<circle cx="${p2(x - 0.45)}" cy="${p2(y - (i === 2 ? 2.1 : 1.6))}" r="${i === 2 ? 0.55 : 0.4}" fill="#fff"/>`).join('')}
${jewel(cx, cy - 3.6, 1.7, 'url(#ruby)')}${jewel(cx - 6.4, cy - 2.2, 1.2, 'url(#sapphire)')}${jewel(cx + 6.4, cy - 2.2, 1.2, 'url(#sapphire)')}
<path d="${band}" fill="url(#bandFace)" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>
${lip(bandTop + 0.4, bandTop + 1.6, '#fff4b8')}${lip(cy + 8.2, cy + 9, '#8a4a04')}
<path d="M${p2(cx - 13)} ${p2(cy + 5.6)} Q${p2(cx)} ${p2(cy + 7.6)} ${p2(cx + 13)} ${p2(cy + 5.6)}" stroke="#b86a08" stroke-width=".35" fill="none" opacity=".6"/>
${cutGem(cx, cy + 6.2, 2.6, 2.2, 'ruby')}${cutGem(cx - 7, cy + 5.9, 1.5, 1.5, 'sapphire')}${cutGem(cx + 7, cy + 5.9, 1.5, 1.5, 'sapphire')}
${[-11.2, 11.2].map((dx) => `<circle cx="${p2(cx + dx)}" cy="${p2(cy + 5.6)}" r=".9" fill="url(#diamond)" stroke="${ink}" stroke-width=".35"/>`).join('')}
${glint(cx - 1, cy + 5, 1.2)}${glint(cx - 6.8, cy - 9.4, 1.1)}${glint(cx + 12.6, cy + 2.6, 0.9)}`;
  // the star, 12.2 out from the middle, over a burst of eight
  const starTips = [...Array(10)].map((_, i) => {
    const r = i % 2 === 0 ? 12.2 : 5.2, a = ((i * 36 - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  const starFacets = starTips.map((p, i) => `<path d="${poly([[cx, cy], p, starTips[(i + 1) % 10]!])}" fill="url(#${i % 2 === 0 ? 'facetLight' : 'facetDark'})"/>`).join('');
  const starOutline = starPath(cx, cy, 12.2, 5.2);
  const inner = starPath(cx, cy, 8.2, 3.5);
  const burst = starPath(cx, cy, 13.6, 5.6, 8);
  const gemFacets = [...Array(8)].map((_, i) => {
    const a = (i * 45 * Math.PI) / 180, b = ((i + 1) * 45 * Math.PI) / 180, r = 2.9;
    return `<path d="${poly([[cx, cy], [cx + r * Math.cos(a), cy + r * Math.sin(a)], [cx + r * Math.cos(b), cy + r * Math.sin(b)]])}" fill="${['#7ae0ff', '#1a6ad8', '#3aa8ff', '#0a3a9a'][i % 4]}"/>`;
  }).join('');
  const rays = starTips.filter((_, i) => i % 2 === 0).map(([x, y]) => `M${p2(cx)} ${p2(cy)} L${p2(x)} ${p2(y)}`).join(' ');
  const star = `
<path d="${burst}" transform="rotate(22.5 ${cx} ${cy})" fill="url(#burst)" stroke="${ink}" stroke-width=".6" stroke-linejoin="round"/>
<path d="${starPath(cx, cy, 11.8, 5.6, 8)}" transform="rotate(22.5 ${cx} ${cy})" fill="none" stroke="#fff" stroke-width=".35" opacity=".6"/>
<path d="${starOutline}" transform="translate(.8 .9)" fill="${ink}" opacity=".45"/>
${starFacets}
<path d="${rays}" stroke="#8a4a04" stroke-width=".35" opacity=".5"/>
<path d="${inner}" fill="none" stroke="#8a4a04" stroke-width=".55" stroke-linejoin="round"/>
<path d="${inner}" transform="translate(.35 .35)" fill="none" stroke="#fff6c0" stroke-width=".35" stroke-linejoin="round" opacity=".8"/>
<path d="${starOutline}" fill="none" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/>
<circle cx="${cx}" cy="${cy}" r="3.7" fill="url(#goldDeep)" stroke="${ink}" stroke-width=".5"/>
${gemFacets}
<circle cx="${cx}" cy="${cy}" r="2.9" fill="none" stroke="${ink}" stroke-width=".4"/>
<circle cx="${p2(cx - 0.9)}" cy="${p2(cy - 0.9)}" r=".7" fill="#fff" opacity=".9"/>
${glint(cx - 6.2, cy - 4.8, 1.5)}${glint(cx + 10.6, cy - 2.8, 1.2)}${glint(cx, cy - 11, 1)}${glint(cx + 4.6, cy + 8.4, 0.9)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_WIDTH * BANNER_SCALE}" height="${BANNER_HEIGHT * BANNER_SCALE}" viewBox="0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}">
<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffde0"/><stop offset=".35" stop-color="#ffe066"/><stop offset=".7" stop-color="#f0a818"/><stop offset="1" stop-color="#a85e06"/></linearGradient>
  <linearGradient id="goldDeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd860"/><stop offset="1" stop-color="#a85e06"/></linearGradient>
  <linearGradient id="facetLight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffde8"/><stop offset="1" stop-color="#ffd84a"/></linearGradient>
  <linearGradient id="facetDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6b424"/><stop offset="1" stop-color="#9a5604"/></linearGradient>
  <linearGradient id="bandFace" x1="0" y1="${cy + 3}" x2="0" y2="${cy + 11}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe680"/><stop offset=".5" stop-color="#f0a818"/><stop offset="1" stop-color="#b8700a"/></linearGradient>
  <radialGradient id="ball" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffde8"/><stop offset=".5" stop-color="#ffd24a"/><stop offset="1" stop-color="#9a5604"/></radialGradient>
  <linearGradient id="burst" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4faff"/><stop offset=".5" stop-color="#8ab4e8"/><stop offset="1" stop-color="#2a4a8a"/></linearGradient>
  <linearGradient id="rimDark" x1="0" y1="4" x2="0" y2="34" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c8a050"/><stop offset="1" stop-color="#5a3a10"/></linearGradient>
  <linearGradient id="field" x1="0" y1="5" x2="0" y2="33" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${field[0]}"/><stop offset="1" stop-color="${field[1]}"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#c8d2e2"/><stop offset="1" stop-color="#5a6680"/></linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b87a44"/><stop offset="1" stop-color="#5a2e12"/></linearGradient>
  <radialGradient id="ruby" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#ffd0d8"/><stop offset=".4" stop-color="#ff2a4a"/><stop offset="1" stop-color="#7a0018"/></radialGradient>
  <radialGradient id="sapphire" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#d8f6ff"/><stop offset=".4" stop-color="#2ab0ff"/><stop offset="1" stop-color="#0a3a8a"/></radialGradient>
  <radialGradient id="diamond" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#e0f4ff"/><stop offset="1" stop-color="#8ab0d0"/></radialGradient>
</defs>
${tassels.join('')}
${swords.join('')}
${shieldSvg}
${emblem === 'crown' ? crown : star}
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
