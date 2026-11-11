# Lord system: checkpoint (2026-11-11)

Research: `docs/superpowers/specs/2026-11-11-lord-research.md`. Server side: outer repo branch `lord`
(`Blouflash-worktrees/lord`, 3450d23): `BB_LordSystem.sql` + `BB_LordSystem.ps1` and `docs/lord/deploy.md`. No Source
patch and no build: `__LORD` is a dead label (all Lord code is `#if __VER >= 12`); the one real fault is
`uspElectionBeginVote` returning no row while `tblElection` is empty, so the vote never began.

## Built (this branch)

- **protocol** `world/lord.ts`: the 12 snapshot readers (0x8F00-0x8F0D, LORD with the election, property, candidates,
  events and skill ticks) and the 5 encoders (bid total as `__int64`, pledge with line breaks up to 254 bytes, vote,
  event rows, skill + target name); `readLordRequestPacket` for the pretend servers. testkit `lord.ts` writes them all.
- **model** `world/lord/lordBook.ts`: `CCLord` (deposit and vote sorts with the tCreate tie-break, top 10 at the vote,
  `PrepareNext` + 14 days, event ticks, skill cool downs) returning the captions, chat lines and boxes Neuz shows.
  `lordData.ts`: `lordskill.txt`, `lordevent.inc`, the three `lord*.inc` help texts.
- **windows** `world/lord/lordHud.ts`, layouts `world/hud/lord/lordLayouts.ts`: Lord info, Bid, Candidates + Pledge
  (change asks with the 1,000,000 penya box), Vote, Lord event, Lord Skill, Call/Teleport name. The Lord Manager's 5
  entries enabled (`moverMenu.ts`); `L` (APP_LORD_SKILL 728) opens the Lord Skill window; the event icons sit after the
  buffs (`.hud-lord-events`, top centre).
- **task bar**: `SHORTCUT_LORDSKILL` 11: icon, cool-down sweep, drag from the Lord Skill window, tap-to-place on a phone,
  use as `WndManager.cpp:2882-2920` (Call/Teleport open the name window), all removed when another player is elected.
- **effects**: `WorldState` plays the skill's src/dst sfx on LORD_SKILL_USE.
- **phone** (`style.css`, end): each window a panel, 14 px text, 40 px lines and buttons as words; tap in place of a drag
  (skill icon → first empty slot) and of a double click (own pledge); a vote line's tap fills the name; the info window
  has a Lord Skill button (no L key on a phone).

## Departures from Neuz (all small)

- Vote: Neuz only takes a typed name (its list click is commented out); on a phone a tap on the line fills the name.
- Lord Skill on a phone: a tap places the skill on the bar; the info window has a Lord Skill button.
- The skill's use plays the effects but not `MTI_ATK1` (Neuz turns and animates the *viewer's* own player, a bug).
- The event icons are at the top centre (below the phone's top icons), not in the movable buff display.
- The Lord state lives on the world screen (`WorldScreen.lordBook`), as the guild book does: the LORD snapshot comes in
  the JOIN bundle, before the HUD exists.

## Tests

- `npm run typecheck`: clean. `npx vitest run`: 4526 passed, 5 failed = main's known ones (looks x3, inventoryWindow x2).
  New: `packages/protocol/test/lord.test.ts` (7), `apps/client/test/lordBook.test.ts` (10), `lordHud.test.ts` (9).
- e2e `apps/client/e2e/lord.spec.ts`, Chromium desktop + landscape phone: **2 passed** (about 23 s). It plays the whole
  flow against a scripted server: bid (box), vote start, own pledge, vote (box), end with Webby as Lord, Lord info, Lord
  event (icon), Lord Skill onto F1, used with an NPC focused (nothing sent) and with no focus (sent to Webby). On the phone
  it also checks text >= 14 px, buttons >= 40 px and each window inside the screen.
  Run: `cd apps/client`, then `E2E_CLIENT_PORT=5192 npx playwright test e2e/lord.spec.ts --project chromium --project phone`.
  Pass: `2 passed`.

## Not done / left

- Picking the "Lord" honour title needs the Honour window (`CWndHonor`), which FlyffWeb does not have; a title already
  set shows in the name tag today.
- Refund info window (`APP_LORD_INFO2`, MMI 102) is not in the NPC menu (commented out in `character.inc`), so not built.
- No convert is needed for the main folder: every picture and text is already in `dist/assets`.
