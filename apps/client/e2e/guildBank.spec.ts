// 2026-11-15: the guild bank (housing-research/research-note.md §1), played against a scripted world server on the desktop
// (drags) and on the phone (taps and the number pad): Webby, master of Bakers, at Julia's Guild Warehouse; a stack put in with
// its count, an item taken out, penya taken out, Contribute Guild's penya, the log's first list, the close box. Each step
// leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ENABLE_GUILD_INVENTORY, GuildBankPacket, GuildPacket, NULL_ID, decodeWorldPacket } from '@flyffweb/protocol';
import {
  createWorldScript, guildMember, guildWhole, newVagrantOwn, writeAddNpc, writeAddSelf, writeAllGuilds, writeFlyffEvent,
  writeGetGoldGuildBank, writeGetItemGuildBank, writeGuild, writeGuildBankLog, writeGuildBankWindow, writePutItemGuildBank,
  writeUpdateItem,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const WEBBY = 500;
const GUILD = 77;
const RUBY = 2032;
const DIAMOND = 2029;
const WOODEN_SWORD = 21;

/** Webby (player 500) in guild 77 with 5 Rubies (object 5) and a Wooden Sword (6) in the bag, 5,000 penya; Julia in view. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.gold = 5000;
  own.inventory = [{ objectId: 5, itemId: RUBY, count: 5 }, { objectId: 6, itemId: WOODEN_SWORD, count: 1 }];
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, guildId: GUILD, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddNpc(NPC_ID, julia)],
  });
}

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const bagCell = (page: Page, slot: number) => page.locator(`.hud-inventory [data-bag-slot="${slot}"]`);
const lastOf = (gateway: Gateway, type: number) => {
  const all = sentOf(gateway, type);
  return decodeWorldPacket(new Uint8Array(all[all.length - 1]!.body));
};

/** Julia's menu entry: a click on the desktop; on the phone a tap to select and a second to open the menu. */
async function menuEntry(page: Page, gateway: Gateway, entry: number): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone() && !(await menu.isVisible())) {
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === NPC_ID), ON_FRAMES).toBe(true);
    if (!(await menu.isVisible())) await tapMover(page, NPC_ID);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await item.click();
}

/** The count box: the desktop's field typed, or the phone's number pad tapped; then OK. */
async function amount(page: Page, value: string): Promise<void> {
  if (isPhone()) {
    const sheet = page.locator('.hud-amount-box:visible');
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-pad-key="escape"]').click();
    for (const key of value) await sheet.locator(`[data-pad-key="${key}"]`).click();
    await sheet.locator('[data-button="ok"]').click();
  } else {
    const gold = page.locator('.hud-trade-gold:visible');
    await expect(gold).toBeVisible();
    await gold.locator('input').fill(value);
    await gold.locator('[data-control="WIDC_OK"]').click();
  }
}

test('the guild bank: Guild Warehouse, a stack in, an item and penya out, a contribution, the log', async ({ page }, info) => {
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // the guild at log-in (ALL_GUILDS, GUILD), the server's GUILDBANK switch (FLYFF_EVENT's ENABLE_GUILD_INVENTORY)
  const bakers = guildWhole(GUILD, WEBBY, 'Bakers', [guildMember(WEBBY, 0)], { level: 4, logo: 3, gold: 70_000 });
  gateway.pushCache(script.later([
    writeFlyffEvent(SELF_ID, { [ENABLE_GUILD_INVENTORY]: 1 }), writeAllGuilds(SELF_ID, [bakers]), writeGuild(SELF_ID, bakers),
  ]));
  await expect.poll(() => sentOf(gateway, GuildPacket.QUERY_PLAYER_DATA2).length).toBe(1);

  // Julia's Guild Warehouse (MMI_GUILDBANKING 15): GUILD_BANK_WND; the bag and the Guild Safebox open
  await menuEntry(page, gateway, 15);
  await expect.poll(() => sentOf(gateway, GuildBankPacket.GUILD_BANK_WND).length).toBe(1);
  gateway.pushCache(script.later([writeGuildBankWindow(SELF_ID, 70_000, [{ objectId: 0, itemId: DIAMOND, count: 1 }])]));
  const bank = page.locator('.hud-guild-bank');
  await expect(bank).toBeVisible();
  await expect(page.locator('.hud-inventory')).toBeVisible();
  await expect(bank.locator('.hud-window-title')).toHaveText('Guild Safebox');
  const grid = bank.locator('.hud-guild-bank-grid');
  await expect(grid.locator('[data-object-id]')).toHaveCount(1);
  await expect(bank.locator('.hud-guild-bank-gold')).toContainText('70,000');
  await shot('guild-bank-open');

  // a stack of 5 Rubies: the count box, 2 of them
  if (isPhone()) await bagCell(page, 5).tap();
  else await bagCell(page, 5).dragTo(bank.locator('.hud-guild-bank-tab'));
  await amount(page, '2');
  await expect.poll(() => sentOf(gateway, GuildBankPacket.PUTITEMGUILDBANK).length).toBe(1);
  expect(lastOf(gateway, GuildBankPacket.PUTITEMGUILDBANK)).toEqual({ type: 'putItemGuildBankRequest', objectId: 5, count: 2, mode: 1 });
  gateway.pushCache(script.later([writeUpdateItem(SELF_ID, 5, 0, 3), writePutItemGuildBank(SELF_ID, { objectId: 5, itemId: RUBY, count: 2 })]));
  await expect(grid.locator('[data-object-id]')).toHaveCount(2);
  await expect(grid.locator(`[data-item-id="${RUBY}"] span`)).toHaveText('2');
  await shot('guild-bank-stack-in');

  // the Diamond out: one, at once
  const diamond = grid.locator(`[data-item-id="${DIAMOND}"]`);
  if (isPhone()) await diamond.tap();
  else await diamond.dragTo(bagCell(page, 10));
  await expect.poll(() => sentOf(gateway, GuildBankPacket.GETITEMGUILDBANK).length).toBe(1);
  expect(lastOf(gateway, GuildBankPacket.GETITEMGUILDBANK)).toEqual({ type: 'getItemGuildBankRequest', objectId: 0, count: 1, mode: 1 });
  gateway.pushCache(script.later([writeGetItemGuildBank(SELF_ID, { objectId: 0, itemId: DIAMOND, count: 1 })]));
  await expect(grid.locator('[data-object-id]')).toHaveCount(1);
  await expect(page.locator('.hud-inventory [aria-label^="Diamond"]')).toHaveCount(1);

  // 500 penya out: the coin dragged to the bag (the penya tapped on the phone), the count box
  if (isPhone()) await bank.locator('.hud-guild-bank-gold').tap();
  else await bank.locator('.hud-guild-bank-coin').dragTo(bagCell(page, 11));
  await amount(page, '500');
  await expect.poll(() => sentOf(gateway, GuildBankPacket.GETITEMGUILDBANK).length).toBe(2);
  expect(lastOf(gateway, GuildBankPacket.GETITEMGUILDBANK)).toEqual({ type: 'getItemGuildBankRequest', objectId: 0, count: 500, mode: 0 });
  gateway.pushCache(script.later([writeGetGoldGuildBank(SELF_ID, 500, WEBBY)]));
  await expect(bank.locator('.hud-guild-bank-gold')).toContainText('69,500');
  await expect(page.locator('.hud-inventory .inventory-money')).toContainText('5,500');
  await shot('guild-bank-penya-out');

  if (isPhone()) {
    // the phone (2026-11-15, consistency scan): the bank's compact V15 panel: the tiled frame, Neuz's 12 px words and title,
    // 34 px cells, the bag beside it its items alone
    for (const target of [bank.locator('.hud-guild-bank-gold .hud-res-static-text'), bank.locator('.hud-window-title'),
      bank.locator('[data-control="WIDC_BUTTON1"]')]) {
      expect(await target.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(12);
    }
    await expect(bank.locator('.hud-window-frame')).toHaveCSS('display', 'grid');
    expect((await grid.locator('.hud-bank-cell').first().boundingBox())!.width).toBeGreaterThanOrEqual(32);
    expect((await bank.locator('[data-control="WIDC_BUTTON1"]').boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await expect(page.locator('.hud-inventory')).toHaveClass(/inventory-items-only/);
  }

  // Contribute Guild: 1,000 penya, YES: NW_GUILDCONTRIBUTION ( 0, 1000, 0 ) and "You have Contributed to the guild."
  await bank.locator('[data-control="WIDC_BUTTON1"]').click();
  const merit = page.locator('.hud-guild-merit');
  await expect(merit).toBeVisible();
  await merit.locator('input').fill('1000');
  await shot('guild-bank-contribute');
  await merit.locator('[data-control="WIDC_BUTTON1"]').dispatchEvent('click');
  await expect.poll(() => sentOf(gateway, GuildPacket.NW_GUILDCONTRIBUTION).length).toBe(1);
  expect(lastOf(gateway, GuildPacket.NW_GUILDCONTRIBUTION)).toEqual({ type: 'guildContributionRequest', pxpCount: 0, gold: 1000, itemFlag: 0 });
  await expect(merit).toBeHidden();

  // the log, the master's: Add Item asked first, its line shown
  await bank.locator('[data-control="WIDC_LOG"]').click();
  const log = page.locator('.hud-guild-bank-log');
  await expect(log).toBeVisible();
  await expect.poll(() => sentOf(gateway, GuildBankPacket.GUILDLOG_VIEW).length).toBe(1);
  expect(lastOf(gateway, GuildBankPacket.GUILDLOG_VIEW)).toEqual({ type: 'guildBankLogViewRequest', logType: 1 });
  gateway.pushCache(script.later([writeGuildBankLog(SELF_ID, 1, [{ name: 'Webby', date: 1_763_100_000, value: RUBY, option: 0, count: 2 }])]));
  await expect(log.locator('.hud-guild-bank-log-line')).toHaveCount(1);
  await expect(log.locator('.hud-guild-bank-log-line')).toContainText('Webby');
  await shot('guild-bank-log');
  await log.locator('[data-control="WIDC_OK"]').dispatchEvent('click');
  await expect(log).toBeHidden();

  // closed by its close box: GUILD_BANK_WND_CLOSE
  await bank.locator('.hud-window-close').click();
  await expect(bank).toBeHidden();
  await expect.poll(() => sentOf(gateway, GuildBankPacket.GUILD_BANK_WND_CLOSE).length).toBe(1);
});
