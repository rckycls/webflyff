// 2026-11-17 (owner, "4 icons that is like the mvp medal but smaller that goes on the side of the character for VIP1 to
// VIP4", then "make it a star"): a VIP player's name tag shows the star of its tier (render/nameTags.ts `vipKey`), the own
// one's too; an ordinary player's shows none.

import { expect, test } from '@playwright/test';
import { createWorldScript, writeAddPlayer, writeAddSelf } from '@flyffweb/testkit';
import { BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

const letter = (c: string): number => c.charCodeAt(0);
/** VIP1, VIP2 and VIP4 beside Webby (VIP3), and an ordinary player. */
const OTHERS = [['Bronzy', 'A'], ['Silvery', 'B'], ['Purply', 'E'], ['Plain', 'F']].map(([name, auth], i) => {
  const x = SQUARE[0] - 3 + 2.4 * i, z = SQUARE[2] - 3;
  return {
    ...BASE, index: MI_MALE, pos: [x, groundAt(x, z), z] as [number, number, number], angle: 0, objectId: 9301 + i, isPlayer: true,
    player: {
      ...SELF_PLAYER, self: false, name: name!, playerId: 701 + i, authorization: letter(auth!), equipmentObjectIds: [],
      worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
    },
  };
});

test('VIP stars: each VIP name tag loads its tier star, the own one included; an ordinary player has none', async ({ page }, info) => {
  const stars = new Set<string>();
  page.on('response', (response) => {
    const star = /\/vipstar(\d)\.png/.exec(response.url())?.[1];
    if (star !== undefined && response.ok()) stars.add(star);
  });
  await playGateway(page, createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, authorization: letter('C') } }),
    others: OTHERS.map((other) => writeAddPlayer(other.objectId, other)),
  }));
  await enterFlaris(page);
  // every tag is up, and the four stars came in: VIP1, VIP2, VIP4 and the own VIP3; the plain player asked for none
  await expect.poll(async () => (await page.evaluate(() => window.__client!.tags())).map((tag) => tag.text).sort())
    .toEqual(['Bronzy', 'Plain', 'Purply', 'Silvery', 'Webby']);
  await expect.poll(() => [...stars].sort()).toEqual(['1', '2', '3', '4']);
  await page.evaluate(() => window.__client!.pause());
  await page.screenshot({ path: info.outputPath('vip-stars.png') });
});
