// 2026-11-17 (owner: the weekly champion's and MVP's marks "a longer icon on top of the name", then "like a warrior
// something", ..., 2026-11-18 "go back to these [winged] but ... aibatt eyes"): the website's weekly answer (`/api/siege/weekly`) puts the
// champion guild's crest over its members' names and the MVP's crest over the MVP's (render/NameTagLayer.ts `bannerPlace`).

import { expect, test } from '@playwright/test';
import { createWorldScript, writeAddPlayer, writeAddSelf } from '@flyffweb/testkit';
import { BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

const CHAMPION_GUILD = 77;
/** Bronzy (VIP1) of the champion guild, Plain the MVP, Other nothing. */
const OTHERS = [['Bronzy', 'A', CHAMPION_GUILD], ['Plain', 'F', 0], ['Other', 'F', 0]].map(([name, auth, guildId], i) => {
  const x = SQUARE[0] - 3 + 3 * i, z = SQUARE[2] - 3;
  return {
    ...BASE, index: MI_MALE, pos: [x, groundAt(x, z), z] as [number, number, number], angle: 0, objectId: 9401 + i, isPlayer: true,
    player: {
      ...SELF_PLAYER, self: false, name: name as string, playerId: 801 + i, authorization: (auth as string).charCodeAt(0),
      ...(guildId !== 0 ? { guildId: guildId as number } : {}), equipmentObjectIds: [],
      worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
    },
  };
});

test('weekly crests: the champion guild member and the MVP show their crest over the name; the others none', async ({ page }, info) => {
  await page.route('**/api/siege/weekly*', (route) => route.fulfill({
    json: { champion: { guildId: CHAMPION_GUILD, name: 'Alpha' }, mvp: { playerId: 802, name: 'Plain' }, endedAt: null, expiresAt: null },
  }));
  const crests = new Set<string>();
  page.on('response', (response) => {
    const crest = /\/(weeklychampion|weeklymvp)\.png/.exec(response.url())?.[1];
    if (crest !== undefined && response.ok()) crests.add(crest);
  });
  await playGateway(page, createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self),
    others: OTHERS.map((other) => writeAddPlayer(other.objectId, other)),
  }));
  await enterFlaris(page);
  await expect.poll(async () => (await page.evaluate(() => window.__client!.tags())).map((tag) => tag.text).sort())
    .toEqual(['Bronzy', 'Other', 'Plain', 'Webby']);
  await expect.poll(() => [...crests].sort()).toEqual(['weeklychampion', 'weeklymvp']);
  // the pictures are drawn into the tags as they load, and shown from the next frame on: a moment, then a few frames
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
  await page.evaluate(() => window.__client!.pause());
  await page.screenshot({ path: info.outputPath('weekly-crests.png') });
});
