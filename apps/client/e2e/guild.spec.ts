// 2026-11-10: the guild (docs/superpowers/specs/2026-11-10-guild-research.md), played against a scripted world server on
// the desktop (mouse, right click) and on the phone (taps): the guild at log-in (ALL_GUILDS, GUILD), the guild line above
// the heads, the guild window from the Start menu with its tabs, a member's menu, the notice, the rights, the Messenger's
// Guild tab, the player menu's invite; and on the other side the invite window, YES and the join. Webby is player 500 (the
// harness's character list); Lead, player 70002, stands in view.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ArReader, GuildPacket } from '@flyffweb/protocol';
import type { AddedMover, PlayerDataRecord, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, directGuild, directGuildChat, directGuildMemberLevel, guildMember, guildWhole, writeAddPlayer, writeAddSelf,
  writeAllGuilds, writeGuild, writeGuildAuthority, writeGuildInvite, writeGuildNotice, writeQueryPlayerData, writeSetGuild,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  BASE, MADRIGAL, MI_MALE, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, hudTexts, playGateway, recordHudTexts, self,
  sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(120_000);

const WEBBY = 500;
const LEAD = 70002;
const LEAD_ID = 9300;
const GUILD = 77;
const LEAD_AT: Vec3 = [6967, groundAt(6967, 3323), 3323];
const knight = (level: number, login: number): PlayerDataRecord => ({ job: 6, level, sex: 0, version: 1, login });

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const guildWindow = (page: Page) => page.locator('.hud-guild');
const page_ = (page: Page, name: string) => guildWindow(page).locator(`.hud-guild-page[data-page="${name}"]`);
const members = (page: Page) => page_(page, 'member').locator('.hud-guild-member');

/** A sent packet's fields after DPID_UNKNOWN and the type, read as `n` u32s. */
function fieldsOf(gateway: Gateway, type: number, n: number, i = 0): number[] {
  const r = new ArReader(sentOf(gateway, type)[i]!.body);
  r.bytes(8);
  return Array.from({ length: n }, () => r.u32());
}

function leadOf(guildId: number): AddedMover {
  return {
    ...BASE, hitPoint: 80, index: MI_MALE, pos: LEAD_AT, angle: 180, objectId: LEAD_ID, isPlayer: true,
    player: { ...SELF_PLAYER, self: false, name: 'Lead', playerId: LEAD, level: 1, job: 0, equipmentObjectIds: [], ...(guildId !== 0 ? { guildId } : {}) },
  };
}

/** Webby (in the guild or not) and Lead in view (in the guild). */
function scriptOf(webbyInGuild: boolean): WorldScript {
  const own = webbyInGuild ? { ...self, player: { ...self.player!, guildId: GUILD } } : self;
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, own), others: [writeAddPlayer(LEAD_ID, leadOf(GUILD))],
  });
}

/** Start → Guild (CWndTaskMenu's APP_GUILD line). */
async function openGuild(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Guild', exact: true }).click();
  await expect(guildWindow(page)).toBeVisible();
}

async function showTab(page: Page, tab: number): Promise<void> {
  await guildWindow(page).locator(`.hud-guild-tab[data-tab="${tab}"]`).click();
  await expect(guildWindow(page).locator(`.hud-guild-tab[data-tab="${tab}"]`)).toHaveAttribute('aria-pressed', 'true');
}

/** A member's menu: a right click on the desktop, a tap on the phone. */
async function memberMenu(page: Page, index: number): Promise<void> {
  const row = members(page).nth(index);
  if (isPhone()) await row.tap();
  else await row.click({ button: 'right' });
  await expect(page.locator('.hud-guild-menu')).toBeVisible();
}

/** Lead's menu: a right click on the desktop; a tap to select, a second to open, on the phone. */
async function openLeadMenu(page: Page, gateway: Gateway): Promise<void> {
  if (isPhone()) {
    await tapMover(page, LEAD_ID);
    await expect.poll(() => targetsOf(gateway).some(([target]) => target === LEAD_ID)).toBe(true);
    await tapMover(page, LEAD_ID);
  } else {
    const at = (await page.evaluate((id) => window.__client!.screenOf(id), LEAD_ID))!;
    const view = (await page.locator('.world-view canvas').boundingBox())!;
    await page.mouse.click(view.x + view.width * at[0], view.y + view.height * at[1], { button: 'right' });
  }
  await expect(page.locator('.hud-mover-menu')).toBeVisible();
}

const tagGuild = async (page: Page, objectId: number): Promise<string | null | undefined> =>
  (await page.evaluate(() => window.__client!.tags())).find((tag) => tag.objectId === objectId)?.guild;

test('the master: the guild at log-in, the line above heads, the window and its tabs, the menu, the notice, the rights', async ({ page }) => {
  const script = scriptOf(true);
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  const bakers = guildWhole(GUILD, WEBBY, 'Bakers', [guildMember(WEBBY, 0), guildMember(LEAD, 4, { alias: 'Bread' })], { level: 3, notice: 'Welcome!' });
  // CUser::Open's ALL_GUILDS and GUILD (User.cpp:312-348)
  gateway.pushCache(script.later([writeAllGuilds(SELF_ID, [bakers]), writeGuild(SELF_ID, bakers)]));
  // OnGuild: one QUERY_PLAYER_DATA2 for every member (DPClient.cpp:12662-12684)
  await expect.poll(() => sentOf(gateway, GuildPacket.QUERY_PLAYER_DATA2).length).toBe(1);
  expect(fieldsOf(gateway, GuildPacket.QUERY_PLAYER_DATA2, 1)).toEqual([2]);
  gateway.pushCache(script.later([writeQueryPlayerData(SELF_ID, WEBBY, 'Webby', knight(40, 1)), writeQueryPlayerData(SELF_ID, LEAD, 'Lead', knight(60, 1))]));

  // the guild line above the heads: white for Lead, the master's light yellow for Webby (MoverRender.cpp:1586-1588)
  await expect.poll(() => tagGuild(page, LEAD_ID)).toBe('Bakers|ffffffff|');
  await expect.poll(() => tagGuild(page, SELF_ID)).toBe('Bakers|ffffff99|');

  // the master may invite: Lead's menu has "Invite to join guild" (MMI_INVITE_COMPANY 7): GUILD_INVITE with Lead's object
  await openLeadMenu(page, gateway);
  await page.locator('.hud-mover-menu [data-menu-entry="7"]').click();
  await expect.poll(() => sentOf(gateway, GuildPacket.GUILD_INVITE).length).toBe(1);
  expect(fieldsOf(gateway, GuildPacket.GUILD_INVITE, 1)).toEqual([LEAD_ID]);

  // Start → Guild: the Information tab
  await openGuild(page);
  const info = page_(page, 'info');
  await expect(info.locator('[data-control="WIDC_GUILDNAME"]')).toHaveText('Bakers');
  await expect(info.locator('[data-control="WIDC_GUILDLEVEL"]')).toHaveText('3');
  await expect(info.locator('[data-control="WIDC_GUILDNUMBER"]')).toHaveText('2 / 32');
  await expect(info.locator('[data-control="WIDC_GUILDMASTER"]')).toHaveText('Webby');
  await expect(info.locator('[data-control="WIDC_TEXT1"]')).toContainText('Welcome!');

  // the Member tab: the master first, a right click (a tap) on Lead, Promote Member: GUILD_MEMBER_LEVEL ( 500, 70002, 3 )
  await showTab(page, 1);
  await expect(members(page)).toHaveCount(2);
  await expect(members(page).nth(0).locator('[data-column="name"]')).toHaveText('Webby');
  await expect(members(page).nth(1).locator('[data-column="alias"]')).toHaveText('Bread');
  await memberMenu(page, 1);
  await page.locator('.hud-guild-menu').getByText('Promote Member', { exact: true }).click();
  await expect.poll(() => sentOf(gateway, GuildPacket.GUILD_MEMBER_LEVEL).length).toBe(1);
  expect(fieldsOf(gateway, GuildPacket.GUILD_MEMBER_LEVEL, 3)).toEqual([WEBBY, LEAD, 3]);
  gateway.pushCache(directGuildMemberLevel(LEAD, 3));
  await expect(members(page).nth(1).locator('[data-part="rank"]').first()).toHaveAttribute('data-frame', '47');

  // the notice: Setup Notice, typed, Open Notice; NW_GUILDNOTICE, then the members' GUILD_NOTICE and its line
  await showTab(page, 0);
  await info.locator('[data-control="WIDC_BUTTON1"]').click();
  const notice = page.locator('.hud-guild-notice');
  await expect(notice).toBeVisible();
  await notice.locator('textarea').fill('Raid at nine');
  await notice.locator('[data-control="WIDC_BUTTON2"]').click();
  await expect(notice).toBeHidden();
  await expect.poll(() => sentOf(gateway, GuildPacket.NW_GUILDNOTICE).length).toBe(1);
  gateway.pushCache(script.later([writeGuildNotice(SELF_ID, GUILD, 'Raid at nine')]));
  await expect(info.locator('[data-control="WIDC_TEXT1"]')).toContainText('Raid at nine');
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('A new Guild Notice has been posted. Please check it in the guild window.');

  // the Title tab: the Kingpin's Join, Apply Settings: GUILD_AUTHORITY with the five DWORDs
  await showTab(page, 2);
  const join = page_(page, 'title').locator('[data-rank="1"][data-bit="4"]');
  await expect(join).toBeEnabled();
  await join.click();
  await expect(join).toHaveAttribute('aria-checked', 'true');
  await page_(page, 'title').locator('[data-control="WIDC_OK"]').click();
  await expect.poll(() => sentOf(gateway, GuildPacket.GUILD_AUTHORITY).length).toBe(1);
  expect(fieldsOf(gateway, GuildPacket.GUILD_AUTHORITY, 7)).toEqual([WEBBY, GUILD, 0xff, 4, 0, 0, 0]);
  gateway.pushCache(script.later([writeGuildAuthority(SELF_ID, [0xff, 4, 0, 0, 0])]));
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('Authority for each title has been changed.');

  // the phone: every word of the window 14 px at least, the joystick hidden
  if (isPhone()) {
    for (const tab of [0, 1, 2]) {
      await showTab(page, tab);
      const small = await guildWindow(page).evaluate((root) => [...root.querySelectorAll<HTMLElement>('*')]
        .filter((el) => el.offsetParent !== null && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== ''))
        .map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((size) => size < 14));
      expect(small).toEqual([]);
    }
    await expect(page.locator('.joystick')).toBeHidden();
  }

  // the guild chat's line in the chat (OnGuildChat: "[name] text")
  gateway.pushCache(directGuildChat(LEAD_ID, 'Lead', 'hello guild'));
  await expect(page.getByText('hello guild').first()).toBeAttached();

  // the Messenger's Guild tab: the two members
  await guildWindow(page).locator('.hud-window-close').click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Messenger', exact: true }).click();
  await page.locator('.hud-messenger .hud-messenger-tab[data-tab="1"]').click();
  await expect(page.locator('.hud-messenger .hud-messenger-list[data-tab="1"] .hud-messenger-row')).toHaveCount(2);
});

test('the player menu invites; the invited side: the invite window, YES, the guild and the join', async ({ page }) => {
  const script = scriptOf(false);
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  await recordHudTexts(page);
  const bakers = guildWhole(GUILD, LEAD, 'Bakers', [guildMember(LEAD, 0)], { power: [0xff, 0, 0, 0, 0] });
  gateway.pushCache(script.later([writeAllGuilds(SELF_ID, [bakers])]));
  await expect.poll(() => tagGuild(page, LEAD_ID)).toBe('Bakers|ffffff99|');

  // out of a guild, Lead's menu has no invite line
  await openLeadMenu(page, gateway);
  await expect(page.locator('.hud-mover-menu [data-menu-entry="7"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Lead invites Webby: the invite window with the guild's name
  gateway.pushCache(script.later([writeGuildInvite(SELF_ID, GUILD, LEAD)]));
  const invite = page.locator('.hud-guild-invite');
  await expect(invite).toBeVisible();
  await expect(invite.locator('[data-control="WIDC_STATIC3"]')).toHaveText('Bakers');
  await invite.locator('[data-control="WIDC_OK"]').click();
  await expect(invite).toBeHidden();
  // ADD_GUILD_MEMBER ( inviter, GUILD_MEMBER_INFO{ own id, 100 } )
  await expect.poll(() => sentOf(gateway, GuildPacket.ADD_GUILD_MEMBER).length).toBe(1);
  expect(fieldsOf(gateway, GuildPacket.ADD_GUILD_MEMBER, 2)).toEqual([LEAD, WEBBY]);

  // the core's GUILD, then the world's SET_GUILD on Webby: the join's line and the guild line over Webby
  gateway.pushCache(directGuild({ ...bakers, members: [guildMember(LEAD, 0), guildMember(WEBBY, 4)] }));
  gateway.pushCache(script.later([writeSetGuild(SELF_ID, GUILD)]));
  await expect.poll(async () => (await hudTexts(page))?.lines ?? []).toContain('You have joined the Bakers guild.');
  await expect.poll(() => tagGuild(page, SELF_ID)).toBe('Bakers|ffffffff|');

  // a Rookie without the Join right: no invite line; the guild window shows the guild
  await openGuild(page);
  await expect(page_(page, 'info').locator('[data-control="WIDC_GUILDNAME"]')).toHaveText('Bakers');
});
