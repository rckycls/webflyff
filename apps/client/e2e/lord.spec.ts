// 2026-11-11: the Lord system (docs/superpowers/specs/2026-11-11-lord-research.md), played against a scripted world server on
// the desktop (clicks, the L key, a drag to the task bar) and on the phone (taps): the Lord Manager's Bid sends the total and
// the server's ELECTION_ADD_DEPOSIT answers with the box; at the vote the candidate writes a pledge and another is voted
// for; the vote ends with Webby as Lord, whose Lord info, Lord event and Lord Skill (onto the bar, then used) follow.
// Each step leaves a picture in the test's output folder.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ElectionState, LordPacket, NULL_ID, PacketType } from '@flyffweb/protocol';
import type { AddedMover } from '@flyffweb/protocol';
import {
  STOCK_ELECTION_PROPERTY, createWorldScript, lordElection, newVagrantOwn, writeAddNpc, writeAddSelf, writeElectionAddDeposit,
  writeElectionBeginVote, writeElectionEndVote, writeElectionIncVote, writeElectionSetPledge, writeLord, writeLordEventCreate,
  writeQueryPlayerData,
} from '@flyffweb/testkit';
import { NPC_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, MADRIGAL, enterFlaris, julia, playGateway, self, sentOf, tapMover, targetsOf } from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(180_000);

const OWN = SELF_PLAYER.playerId; // 500, Webby
const AIBATT = 501;
const webby: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, own: newVagrantOwn() } };
const lordManager: AddedMover = { ...julia, objectId: NPC_ID, npc: { ...julia.npc!, characterKey: 'MaFl_KINGAIDE' } };
const record = (job: number, level: number) => ({ job, level, sex: 0, version: 1, login: 1 });

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const box = (page: Page) => page.locator('.hud-message:visible .hud-message-text');
const press = async (target: Locator): Promise<void> => { if (isPhone()) await target.tap(); else await target.click(); };
async function closeBox(page: Page): Promise<void> {
  await press(page.locator('.hud-message:visible [data-button="ok"]'));
  await expect(page.locator('.hud-message:visible')).toHaveCount(0);
}

/** The Lord Manager's menu entry `entry` (on the phone a first tap may only select the NPC). */
async function chooseEntry(page: Page, gateway: Gateway, entry: number): Promise<void> {
  await tapMover(page, NPC_ID);
  const menu = page.locator('.hud-mover-menu');
  if (isPhone()) {
    await expect.poll(() => targetsOf(gateway).some(([t]) => t === NPC_ID), ON_FRAMES).toBe(true);
    if (!await menu.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) await tapMover(page, NPC_ID);
  }
  const item = page.locator(`.hud-mover-menu [data-menu-entry="${entry}"]`);
  await expect(item).toBeEnabled(ON_FRAMES);
  await press(item);
}

/** The phone's rules for a window: words 14 px or more, buttons 40 px tall, the window inside the screen. */
async function phoneChecks(page: Page, window: Locator): Promise<void> {
  if (!isPhone()) return;
  for (const words of await window.locator('.hud-res-text-body, .hud-res-static-text, .hud-window-title, [role="option"]').all()) {
    if (!await words.isVisible()) continue;
    expect(await words.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  }
  for (const button of await window.locator('.hud-picture-button').all()) {
    if (await button.isVisible()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  }
  const view = page.viewportSize()!, at = (await window.boundingBox())!;
  expect(at.x >= 0 && at.y >= 0 && at.x + at.width <= view.width && at.y + at.height <= view.height).toBe(true);
}

test('the election: bid, pledge and vote; then the Lord\'s info, event and skill', async ({ page }, info) => {
  const now = Math.floor(Date.now() / 1000);
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby),
    others: [
      writeAddNpc(NPC_ID, lordManager),
      writeQueryPlayerData(NULL_ID, OWN, 'Webby', record(8, 120)),
      writeQueryPlayerData(NULL_ID, AIBATT, 'Aibatt', record(9, 90)),
      writeLord({
        election: lordElection({
          id: 3, state: ElectionState.CANDIDACY, begin: now - 3600, property: STOCK_ELECTION_PROPERTY,
          candidates: [{ playerId: AIBATT, deposit: 300_000_000, votes: 0, created: now - 3000, pledge: 'Buffs for all' }],
        }),
      }),
    ],
  });
  // the world server's answers: the bid, the pledge, the vote, the event (DPDatabaseClient.cpp:3303-3437 through User.cpp:8253-8288)
  script.on('electionAddDepositRequest', (p) => (p.type === 'electionAddDepositRequest' ? [writeElectionAddDeposit(OWN, p.total, now - 60)] : []));
  script.on('electionSetPledgeRequest', (p) => (p.type === 'electionSetPledgeRequest' ? [writeElectionSetPledge(OWN, p.pledge)] : []));
  script.on('electionIncVoteRequest', (p) => (p.type === 'electionIncVoteRequest' ? [writeElectionIncVote(p.playerId, OWN)] : []));
  script.on('lordEventCreateRequest', (p) => (p.type === 'lordEventCreateRequest'
    ? [writeLordEventCreate({ tick: 60, playerId: OWN, expFactor: p.expRow * 0.05, dropFactor: p.dropRow * 0.05 })] : []));
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });

  // Bid: 200,000,000; the server's ELECTION_ADD_DEPOSIT gives the box and Webby's line
  await chooseEntry(page, gateway, 92);
  const tender = page.locator('.hud-lord-tender');
  await expect(tender.locator('.hud-window-title')).toHaveText('Bid');
  await expect(tender).toContainText('Minimum bid is 100,000,000 Penya');
  await phoneChecks(page, tender);
  await tender.getByLabel('Current application fee').fill('200000000');
  await press(tender.getByRole('button', { name: 'Accept' }));
  await expect.poll(() => sentOf(gateway, LordPacket.ELECTION_ADD_DEPOSIT).map((s) => Number(s.body.readBigInt64LE(8)))).toEqual([200_000_000]);
  await expect(box(page)).toContainText('200000000');
  await shot('bid');
  await closeBox(page);
  await expect(tender.locator('[data-control="WIDC_TEXT2"]')).toContainText('Webby');
  await press(tender.getByRole('button', { name: 'Close' }));

  // the vote begins: Webby, a candidate, hears it; the pledge, written on the own line
  gateway.pushCache(script.later([writeElectionBeginVote(0)]));
  await expect(box(page)).toBeVisible(ON_FRAMES);
  await closeBox(page);
  await chooseEntry(page, gateway, 91);
  const state = page.locator('.hud-lord-state');
  const rows = state.locator('[role="option"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Aibatt');
  await expect(state.locator('[data-control="WIDC_LIVE"]')).toHaveText('Satisfied');
  await phoneChecks(page, state);
  await shot('candidates');
  await press(rows.nth(1));
  const pledge = page.locator('.hud-lord-pledge');
  await expect(pledge).toBeVisible();
  const text = pledge.locator('[data-control="WIDC_TEXT1"]');
  if (isPhone()) await text.tap(); else await text.dblclick();
  await pledge.getByLabel('Pledge').fill('Peace and buffs');
  await press(pledge.getByRole('button', { name: 'OK' }));
  await expect.poll(() => sentOf(gateway, LordPacket.ELECTION_SET_PLEDGE).length).toBe(1);
  await expect(pledge).toBeHidden();
  await press(state.getByRole('button', { name: 'OK' }));

  // Vote: for Aibatt (typed on the desktop, a tap on the line on the phone); the count closes the window with a box
  await chooseEntry(page, gateway, 93);
  const vote = page.locator('.hud-lord-vote');
  await expect(vote.locator('[role="option"]')).toHaveCount(2);
  if (isPhone()) await vote.locator('[role="option"]', { hasText: 'Aibatt' }).tap();
  else await vote.getByLabel('Name').fill('Aibatt');
  await expect(vote.getByLabel('Name')).toHaveValue('Aibatt');
  await phoneChecks(page, vote);
  await press(vote.getByRole('button', { name: 'OK' }));
  await expect.poll(() => sentOf(gateway, LordPacket.ELECTION_INC_VOTE).map((s) => s.body.readUInt32LE(8))).toEqual([AIBATT]);
  await expect(vote).toBeHidden();
  await expect(box(page)).toHaveText('You have voted for Aibatt.');
  await closeBox(page);

  // the vote ends: Webby is Lord
  gateway.pushCache(script.later([writeElectionEndVote(OWN)]));
  await expect(page.locator('.hud-caption')).toContainText('Webby', ON_FRAMES);
  await chooseEntry(page, gateway, 101);
  const lordInfo = page.locator('.hud-lord-info');
  await expect(lordInfo.locator('[data-control="WIDC_STATIC5"]')).toHaveText('Webby');
  await expect(lordInfo.locator('[data-control="WIDC_STATIC6"]')).toContainText('Day(s)');
  await phoneChecks(page, lordInfo);
  await shot('lord-info');
  await press(lordInfo.getByRole('button', { name: 'OK', exact: true }));

  // a Lord event: EXP 10 %, drop 0 %: 200,000,000 penya; the server's L_EVENT_CREATE puts its icon after the buffs
  await chooseEntry(page, gateway, 94);
  const event = page.locator('.hud-lord-event');
  await press(event.locator('[data-control="WIDC_BUTTON2"]'));
  await press(event.locator('[data-control="WIDC_BUTTON2"]'));
  await expect(event.locator('[data-control="WIDC_TEXT3"]')).toHaveText('200,000,000');
  await phoneChecks(page, event);
  await press(event.getByRole('button', { name: 'Start' }));
  await expect.poll(() => sentOf(gateway, LordPacket.L_EVENT_CREATE).map((s) => [s.body.readInt32LE(8), s.body.readInt32LE(12)])).toEqual([[2, 0]]);
  await expect(page.locator('.hud-lord-event-icon')).toHaveCount(1, ON_FRAMES);
  await shot('lord-event');
  await press(event.locator('.hud-window-close'));

  // the Lord Skill window: L on the desktop, the info window's button on the phone; Lord's Cheer onto slot 0, then used
  if (isPhone()) {
    await chooseEntry(page, gateway, 101);
    await lordInfo.getByRole('button', { name: 'Lord Skill' }).tap();
    await expect(lordInfo).toBeHidden();
  } else {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('l');
  }
  const skills = page.locator('.hud-lord-skill');
  await expect(skills).toBeVisible(ON_FRAMES);
  const icons = skills.locator('.hud-lord-skill-icon');
  await expect(icons).toHaveCount(8);
  await expect(icons.nth(0)).toHaveAttribute('aria-label', "Lord's Cheer");
  await phoneChecks(page, skills);
  await shot('lord-skill');
  const slot = page.locator('.hud-slot[data-row="item"][data-slot="0"]');
  if (isPhone()) {
    await icons.nth(0).tap();
  } else {
    const from = (await icons.nth(0).boundingBox())!, to = (await slot.boundingBox())!;
    await page.mouse.move(from.x + 16, from.y + 16);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await expect(slot).toHaveAttribute('data-kind', 'skill', ON_FRAMES);
  await expect.poll(() => sentOf(gateway, PacketType.ADDITEMTASKBAR).length).toBeGreaterThan(0);
  await press(skills.locator('.hud-window-close'));
  const useSlot = async () => { if (isPhone()) await slot.tap(); else await page.keyboard.press('F1'); };
  // the Lord Manager is still the focus, not a player: nothing is sent (WndManager.cpp:2908-2916)
  await useSlot();
  await page.waitForTimeout(500);
  expect(sentOf(gateway, LordPacket.LORD_SKILL_USE)).toHaveLength(0);
  // no focus (Escape clears it): the skill goes to the Lord, by name
  await page.keyboard.press('Escape');
  await useSlot();
  await expect.poll(() => sentOf(gateway, LordPacket.LORD_SKILL_USE).map((s) => {
    const length = s.body.readInt32LE(12);
    return [s.body.readInt32LE(8), s.body.subarray(16, 16 + length).toString('latin1')];
  })).toEqual([[0, 'Webby']]);
  await shot('lord-skill-used');
});
