// The Character and Skill windows on a desktop and a landscape phone: what the 2026-11-04 audit found broken, kept fixed.
// The Skill window's first-job panel sat at the window's top on a desktop; on a phone a new job's skills were invisible, a
// picked skill blinked nearly away and nothing marked the skill + changes; the boxes that ask first were off centre on a
// phone, their text out of its box.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { AddedMover, OwnCharacter, SkillSlot } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddSelf, writeSetJobSkill } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import { MADRIGAL, MALE_VAGRANT, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, playGateway, self } from './worldHarness';

test.setTimeout(120_000);

/** `JOB_MAGICIAN` and `SI_MAG_MAG_MENTALSTRIKE` (`Resource/defineJob.h`, `defineSkill.h:64`). */
const JOB_MAGICIAN = 4;
const MENTAL_STRIKE = 121;
/** `SI_VAG_ONE_CLEANHIT`. */
const CLEAN_HIT = 1;

const isTouch = (): boolean => test.info().project.use.hasTouch === true;
const press = (target: Locator): Promise<void> => (isTouch() ? target.tap() : target.click());

/** Webby at level 15 with Clean Hit at 1, `skillPoint` skill points and `remainGP` stat points. */
function scriptOf(skillPoint: number, remainGP: number): { script: WorldScript; own: OwnCharacter } {
  const fresh = newVagrantOwn();
  const own = { ...fresh, skills: fresh.skills.map((slot, i) => (i === 0 ? { ...slot, level: 1 } : slot)), skillPoint, remainGP };
  const webby: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, level: 15, sta: own.sta, dex: own.dex, own } };
  return {
    own,
    script: createWorldScript({ playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby), others: [] }),
  };
}

async function open(page: Page, item: string): Promise<void> {
  await press(page.getByRole('button', { name: 'Start' }));
  await press(page.getByRole('menuitem', { name: item }));
}

test('a first job\'s Skill window: the panel in the job section on a desktop; on a phone every skill shown, grey until learnt', async ({ page }) => {
  const { script, own } = scriptOf(5, 0);
  const gateway = await playGateway(page, script, { listed: { level: 15, equipment: MALE_VAGRANT } });
  await enterFlaris(page);
  const skills: SkillSlot[] = own.skills.map((slot, i) => (i === 3 ? { skill: MENTAL_STRIKE, level: 0 } : slot));
  gateway.pushCache(script.later([writeSetJobSkill(SELF_ID, JOB_MAGICIAN, skills)]));
  await open(page, 'Skills');
  const tree = page.locator('.hud-skills');
  await expect(tree).toBeVisible();
  const mental = tree.locator(`.hud-skill[data-skill="${MENTAL_STRIKE}"]`);
  await expect(mental).toBeVisible();
  if (!isTouch()) {
    // the panel is placed (AfterSkinTexture, WIDC_STATIC5 + 2), below the window's controls, not over them
    const panel = tree.locator('.hud-skills-job-panel');
    await expect(panel).toHaveAttribute('src', /back_ma/);
    await expect(panel).toHaveCSS('position', 'absolute');
    const finish = (await tree.locator('[data-button="finish"]').boundingBox())!;
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(finish.y + finish.height);
  } else {
    // no panel and no hover: Mental Strike at level 0 is drawn, grey
    await expect(mental).toHaveAttribute('data-dim', '');
    await expect(mental.locator('.hud-skill-icon')).toHaveCSS('background-image', /url/);
    await expect(mental.locator('.hud-skill-icon')).toHaveCSS('filter', /grayscale/);
  }
});

test('a phone: a picked skill stays visible, and the skill + changes keeps a mark', async ({ page }) => {
  test.skip(!isTouch(), 'the phone project');
  const { script } = scriptOf(5, 0);
  await playGateway(page, script, { listed: { level: 15, equipment: MALE_VAGRANT } });
  await enterFlaris(page);
  await open(page, 'Skills');
  const clean = page.locator(`.hud-skills .hud-skill[data-skill="${CLEAN_HIT}"]`);
  await clean.tap();
  await expect(clean).toHaveAttribute('data-picked', '');
  // the pick pulses its outline: the skill itself stays whole (it faded to about 0.3)
  const opacities: number[] = [];
  for (let i = 0; i < 6; i++) {
    opacities.push(Number(await clean.evaluate((el) => getComputedStyle(el).opacity)));
    await page.waitForTimeout(80);
  }
  expect(Math.min(...opacities)).toBe(1);
  await page.locator('.hud-skills [data-button="plus"]').tap();
  await expect(clean).toHaveAttribute('data-chosen', '');
  await expect(clean).toHaveAttribute('data-level', '2');
});

test('the stat points\' box is centred, and its text stays in its box', async ({ page }) => {
  const { script } = scriptOf(0, 4);
  await playGateway(page, script, { listed: { level: 15, equipment: MALE_VAGRANT } });
  await enterFlaris(page);
  await open(page, 'Character');
  const character = page.locator('.hud-character');
  await expect(character).toBeVisible();
  await press(character.locator('[data-button="str-plus"]'));
  await press(character.locator('[data-button="apply"]'));
  const box = page.getByRole('group', { name: 'Change State' });
  await expect(box).toBeVisible();
  const placed = await box.evaluate((el) => {
    const frame = el.getBoundingClientRect(), layer = el.parentElement!.getBoundingClientRect();
    const text = el.querySelector<HTMLElement>('.hud-confirm-text')!;
    return {
      dx: frame.x + frame.width / 2 - (layer.x + layer.width / 2),
      dy: frame.y + frame.height / 2 - (layer.y + layer.height / 2),
      overflow: text.scrollHeight - text.clientHeight,
    };
  });
  expect(Math.abs(placed.dx)).toBeLessThanOrEqual(4);
  expect(Math.abs(placed.dy)).toBeLessThanOrEqual(60); // the layer's bottom holds the task bar: centred in what is left
  expect(placed.overflow).toBeLessThanOrEqual(1);
});
