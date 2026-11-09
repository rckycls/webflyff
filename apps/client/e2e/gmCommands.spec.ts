// 2026-11-10: the game masters' commands and what a game master, and a player, see of one
// (docs/superpowers/specs/2026-11-10-gm-commands-research.md).
//
//   ParsingCommand   _Interface/FuncTextCmd.cpp:5549-5602   a command the account may use goes as the chat line
//                                                          (TCM_SERVER) or runs here (TCM_CLIENT); a refused one goes
//                                                          nowhere, with no message
//   OnModifyMode     Neuz/DPClient.cpp:12278-12356          the mode set; the own game master's line of its modes
//   CMover::Render   _Common/MoverRender.cpp:517-531        an invisible body: the own one faint, another faint for a
//                                                          game master, not drawn for a player
//   CWorld::Render   _Common/World3D.cpp:1282               no name over an invisible player (the own one excepted here,
//                                                          the owner's request)

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ArReader, ArWriter, NULL_ID } from '@flyffweb/protocol';
import type { AddedMover } from '@flyffweb/protocol';
import { createWorldScript, writeAddPlayer, writeAddSelf } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris, groundAt, playGateway, self, sentOf } from './worldHarness';

test.setTimeout(120_000);

const ADMIN = 0x50; // 'P', AUTH_ADMINISTRATOR
const GM = 0x4c; // 'L', AUTH_GAMEMASTER
const PLAYER = 0x46; // 'F', AUTH_GENERAL
const MATCHLESS = 0x1, TRANSPARENT = 0x2; // _Common/authorization.h:106-107
const WATCHER = 9301, GUIDE = 9302;
const CHAT = 0xff0000; // PACKETTYPE_CHAT

const modifyMode = (objectId: number, mode: number): ScriptMessage =>
  ({ objectId, type: 0x00d3, fields: new ArWriter().u32(mode).toBytes() });

function other(objectId: number, name: string, authorization: number, mode: number, dx: number): AddedMover {
  return {
    ...BASE, index: MI_MALE, pos: [SQUARE[0] + dx, groundAt(SQUARE[0] + dx, SQUARE[2] - 2), SQUARE[2] - 2], angle: 180, objectId,
    isPlayer: true, player: {
      ...SELF_PLAYER, self: false, name, playerId: objectId - 8000, authorization, mode, equipmentObjectIds: [],
      worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
    },
  };
}

/** Webby (`authorization`, `mode`) on the square, with an invisible game master (Watcher) and a visible one (Guide). */
function scriptOf(authorization: number, mode: number) {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, authorization, mode } }),
    others: [
      writeAddPlayer(WATCHER, other(WATCHER, 'Watcher', GM, TRANSPARENT, -2)),
      writeAddPlayer(GUIDE, other(GUIDE, 'Guide', GM, 0, 2)),
    ],
  });
}

const tagOf = async (page: Page, objectId: number) =>
  (await page.evaluate(() => window.__client!.tags())).find((t) => t.objectId === objectId);

async function openChat(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Chat', exact: true }).tap(); else await page.keyboard.press('Enter');
  const chat = page.locator(isMobile ? '.hud-chat' : '.hud-neuz-chat');
  const input = chat.getByRole('textbox', { name: 'Chat message' });
  if (isMobile) await input.tap();
  const say = async (line: string): Promise<void> => {
    if (!(await input.isVisible()) || !(await input.evaluate((el) => el === document.activeElement))) {
      if (isMobile) await input.tap(); else await page.keyboard.press('Enter');
    }
    await input.fill(line);
    if (isMobile) await chat.getByRole('button', { name: 'Send', exact: true }).click(); else await input.press('Enter');
  };
  // a game line: the desktop's System window (PutString's default style), the phone's one log
  const gameLog = isMobile ? chat.getByRole('log').first() : page.locator('.hud-neuz-chat-log .neuz-chat-text');
  return { say, gameLog, chatLog: chat.getByRole('log').first() };
}

const sentLines = (gateway: Awaited<ReturnType<typeof playGateway>>): string[] => sentOf(gateway, CHAT).map((s) => {
  const r = new ArReader(s.body); r.bytes(8); return r.string(1024);
});

test('a game master: its own name and modes, and its commands sent as Neuz sends them', async ({ page, isMobile }) => {
  // the administrator logged out invisible and undying: its m_dwMode comes back with it (DPDatabaseClient.cpp:1024-1031)
  const script = scriptOf(ADMIN, MATCHLESS | TRANSPARENT);
  const gateway = await playGateway(page, script); await enterFlaris(page);
  // its own name and mark are shown; its body is faint; it sees the invisible game master faint, with no name
  await expect.poll(async () => (await tagOf(page, SELF_ID))?.text).toBe('Webby [Admin]');
  expect((await tagOf(page, SELF_ID))!.alpha).toBeCloseTo(80 / 255);
  expect(await tagOf(page, WATCHER)).toMatchObject({ text: null });
  expect((await tagOf(page, WATCHER))!.alpha).toBeCloseTo(80 / 255);
  expect(await tagOf(page, GUIDE)).toMatchObject({ text: 'Guide [GM]', alpha: 1 });

  const { say, gameLog, chatLog } = await openChat(page, isMobile);
  // TCM_SERVER: the line as typed
  await say('/noinvisible');
  await expect.poll(() => sentLines(gateway)).toEqual(['/noinvisible']);
  gateway.pushCache(script.later([modifyMode(SELF_ID, MATCHLESS)]));
  await expect(gameLog).toContainText('Undying1Status');
  await expect.poll(async () => (await tagOf(page, SELF_ID))?.alpha).toBe(1);
  await say('/noundying');
  await expect.poll(() => sentLines(gateway).at(-1)).toBe('/noundying');
  gateway.pushCache(script.later([modifyMode(SELF_ID, 0)]));
  await expect(gameLog).toContainText('Normal');
  await say('/teleport Rocky');
  await expect.poll(() => sentLines(gateway).at(-1)).toBe('/teleport Rocky');
  // TCM_CLIENT: run here, nothing sent
  const count = sentLines(gateway).length;
  await say('/position');
  await expect(gameLog).toContainText('Position : x =');
  expect(sentLines(gateway)).toHaveLength(count);
  // a client half: /jobname prints; /createitem with no words opens Neuz's window (not in the web) and sends nothing
  await say('/jn');
  await expect(gameLog).toContainText('Expert Level : 16 ~ 60');
  await say('/ci');
  await say('/ci 2800 5');
  await expect.poll(() => sentLines(gateway).at(-1)).toBe('/ci 2800 5');
  expect(sentLines(gateway)).toHaveLength(count + 1);
  // the server's answers: a green line (AddText, with its state byte), the core's player count (in the chat), a notice
  gateway.pushCache(script.later([{ objectId: NULL_ID, type: 0x00a0, fields: new ArWriter().u8(1).string('Players online: 3').toBytes() }]));
  await expect(gameLog).toContainText('Players online: 3');
  gateway.pushCache(new ArWriter().u32(0x00ff00e8).u16(7).toBytes());
  await expect(chatLog).toContainText('[World CCU] 7');
  gateway.pushCache(new ArWriter().u32(0x00ff00ea).string('Restart in 5 minutes').toBytes());
  await expect(chatLog).toContainText('Restart in 5 minutes');
  // the invisible game master is seen again: its name comes back
  gateway.pushCache(script.later([modifyMode(WATCHER, 0)]));
  await expect.poll(async () => (await tagOf(page, WATCHER))?.text).toBe('Watcher [GM]');
});

test("a player: a game master's command goes nowhere, and a game master is seen as Neuz shows one", async ({ page, isMobile }) => {
  const script = scriptOf(PLAYER, 0);
  const gateway = await playGateway(page, script); await enterFlaris(page);
  await expect.poll(async () => (await tagOf(page, SELF_ID))?.text).toBe('Webby');
  // the invisible game master: no body, no name; the visible one: its name and mark, as Neuz writes them
  expect(await tagOf(page, WATCHER)).toMatchObject({ text: null, alpha: 0 });
  expect(await tagOf(page, GUIDE)).toMatchObject({ text: 'Guide [GM]', alpha: 1 });

  const { say, gameLog } = await openChat(page, isMobile);
  // not the account's: nothing sent, and nothing said (ParsingCommand's break, FuncTextCmd.cpp:5591-5592)
  await say('/teleport Rocky');
  await say('/invisible');
  await say('Hello');
  await expect.poll(() => sentLines(gateway)).toEqual(['Hello']);
  await expect(gameLog).not.toContainText('teleport');
  // the visible game master goes invisible: gone from sight; the invisible one comes back
  gateway.pushCache(script.later([modifyMode(GUIDE, TRANSPARENT), modifyMode(WATCHER, 0)]));
  await expect.poll(async () => (await tagOf(page, GUIDE))?.alpha).toBe(0);
  expect((await tagOf(page, GUIDE))!.text).toBeNull();
  await expect.poll(async () => (await tagOf(page, WATCHER))?.text).toBe('Watcher [GM]');
});
