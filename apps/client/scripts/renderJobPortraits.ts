// `npx tsx apps/client/scripts/renderJobPortraits.ts`: draws the Quick Job Change window's 24 job portraits (custom, owner
// 2026-11-20: "V15 3D characters", pictures made ahead) from the game's own models, with the client's own renderer, on
// e2e/jobPortraitHarness.html. It needs the dev server with the converter's dist/assets on E2E_CLIENT_PORT (default 5187;
// the owner's own dev server holds 5174): `npm run dev:client -- --port 5187 --strictPort`.
//
// Each picture is the Select Character slot (158 x 238, standing) cut to head to knees, weapons in (CROP), scaled to 176 x 216 (2x the
// window's 88 x 108 picture area), with a clear background. The PNGs go to src/icons/jobs/, where the build takes them
// from (hud/ownIcons.ts `jobPortraitKey`); run this again after changing the gear (e2e/jobPortraitHarness.ts) or the crop.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/icons/jobs');
const port = process.env.E2E_CLIENT_PORT ?? '5187';
const JOBS = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13];
/** The part of the 158 x 238 slot kept, head to knees so the weapons show: x, y, width, height (88:108, the window's picture area). */
const CROP = { x: 2, y: 0, width: 154, height: 189 } as const;
const SIZE = { width: 176, height: 216 } as const;

const browser = await chromium.launch({
  args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  await mkdir(out, { recursive: true });
  // drawn at 3x so that the cut-out stays sharp at 176 x 216
  const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 3 });
  page.on('console', (message) => { if (message.type() === 'warning' || message.type() === 'error') console.log(`  page: ${message.text()}`); });
  for (const job of JOBS) {
    for (const sex of [0, 1]) {
      await page.goto(`http://localhost:${port}/e2e/jobPortraitHarness.html?job=${job}&sex=${sex}`);
      await page.waitForSelector('body[data-ready="1"]', { timeout: 120_000 });
      const dataUrl = await page.evaluate(({ crop, size }) => {
        const source = document.querySelector('canvas')!;
        const target = document.createElement('canvas');
        target.width = size.width;
        target.height = size.height;
        const context = target.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        // the slot's canvas is in device pixels: scale the crop by its ratio to the CSS box
        const ratio = source.width / 158;
        context.drawImage(source, crop.x * ratio, crop.y * ratio, crop.width * ratio, crop.height * ratio, 0, 0, size.width, size.height);
        return target.toDataURL('image/png');
      }, { crop: CROP, size: SIZE });
      const file = path.join(out, `job${job}_${sex === 1 ? 'f' : 'm'}.png`);
      await writeFile(file, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  }
} finally {
  await browser.close();
}
