# Cheers, Couple, Follow and Duel: checkpoint, 2026-11-15

Branch `social` (worktree `FlyffWeb-worktrees/social`), from main 357a1ea. Not merged, not pushed. Research:
`docs/2026-11-15-social-research.md`.

## Commits
- 68ce5b6 research note
- d07d30c M1 Cheers: the player menu's Cheer
- b6d2a4b M2 Couple: proposal box, couple window (F, Start > Couple), break-up, couple buffs' tooltip
- 10f2250 M3 Follow: player menu Follow, Z + click, ControlGround's 4 m re-walk and stops
- 2594734 M4 Duel: 1:1 and party, menu in a /ctd Duel Zone, question, count, fight, result
- (this commit) e2e spec `apps/client/e2e/social.spec.ts`, this checkpoint

## What works (desktop and phone)
- **Cheer:** player menu > Cheer sends CHEERING (not flying). The server does the rest; FlyffWeb already plays the lines,
  effects, motions and the Cheer buff icon. V15 shows cheer points only in the Motion window's tooltip (on main), not in
  the character window.
- **Couple** (one system; V15 has no marriage): proposal box (OK = COUPLE, Cancel or close = REFUSE), "You and %s are now
  a couple!", the Couple window (partner name, job, level, master/hero mark, couple level, EXP gauge, Break Up; skills tab
  with the three skill icons lit by level and the help text), break-up box (OK = DECOUPLE), level-up line. Couple skills
  are server buffs: they show in the buff row; their tooltip has no time, as V15.
  Phone: Start > Couple; the window is fitted whole to the screen.
- **Follow:** player menu > Follow, or hold Z and click a player (desktop). Walks again when more than 4 m away. Stops on
  a move key or the joystick, a press on the world, a shop window, either death, the player leaving view. Paused in the air.
- **Duel:** "Duel - 1 vs 1" and (party leader) "Duel - Party vs Party" in the player menu, **only inside a GM's /ctd Duel
  Zone** (V15's rule: EVE_18 and both in an RA_FIGHT region; no map region has RA_FIGHT). The question (Yes closes the
  dialogue, trade, shop, bank, post first, as V15), 3-2-1-Fight count (CountFight.dds), "Duel with %s started!", the
  opponent wears the PvP flag and can be attacked (melee and skills), the result window (OK plays the win/lose motion),
  cancel lines, the party duel's start/leave/win/lose/cancel lines.

## Convert (main folder)
```
npm run convert -- --only "ButtBreakUp*,GauFillNormal*,Bg_Couple_Skill*,CountFight*"
```
No `--only data`, so no gear sync.

## Shared files touched (small)
`WorldScreen.ts`, `WorldSession.ts` (sendSocial), `combat/attackLoop.ts` (followTo, DuelRule), `party/playerMenu.ts`,
`hud/taskBar.ts` (Couple line: 16 Start menu lines), `hud/buffStatus.ts`, `hud/gauge.ts`, `style.css` (two blocks at the
end), protocol `addObj.ts` (keeps m_idparty, m_idDuelParty, m_nDuel), `types.ts`, `readers.ts`, `index.ts`,
`messages/world.ts`, converter `uiStage.ts`, testkit `index.ts`. Tests: `hud.test.ts`, `landscape.spec.ts` (16 lines),
`addObj.test.ts`. **Merge note:** housing also adds a Start menu line (16 on its branch); after both, 17 lines: the menu
tests need the other's line too.

## Checks
All typechecks (client, client node, protocol, protocol test, gateway, testkit, convert); `vitest apps/client` 2627
passed; protocol tests pass; converter UI stage 34 passed; `check:public-build` ok. e2e `social.spec.ts`: 6/6 passed here
(chromium + phone, port 5193).

```
npx playwright test -c apps/client/playwright.config.ts apps/client/e2e/social.spec.ts --project chromium --project phone
```

## Owner test steps (VM, two characters A and B, opposite sex, both past the 1st job, same channel)
1. **Cheer:** cheer points start at 0 at every login and come back 1 an hour. Right after login, A right-clicks B > Cheer:
   A reads "Unable to send cheer message. Please try again after N minutes." After an hour: B reads "A sent you a cheer
   message of love!", both effects play, B gets the Cheer buff (10 min).
2. **Couple:** A targets B, Motion window (O) > Propose > OK. B gets "A has proposed to you..." > OK. Both read "You and ...
   are now a couple!". Press F (phone: Start > Couple): partner, job, level, couple level 1. A GM's `/ncl` raises the couple
   level: at 6 the Power of Love buff shows in the buff row and its icon lights in Couple Skills. Break Up > OK: "Your
   couple has broken up." (A new proposal from the same proposer waits 24 h: server rule.)
3. **Follow:** A right-clicks B > Follow (or holds Z and clicks B). B walks away: A follows and stops about 2 m behind.
   A presses W (phone: the joystick): the follow ends.
4. **Duel:** both stand inside the Duel Zone: Madrigal x 3787-4000, z 3843-4064 (QUEST_WARMON_LV1's rect, the Clockworks
   area). A GM runs `/ctd` there (the zone is sent only to players inside it then, and lasts until a relog). A right-clicks
   B > "Duel - 1 vs 1". B: "A challenges you to a duel. Do you accept?" > Yes. 3-2-1-Fight, "Duel with ... started!", B
   wears the flag. Fight until one would die: the result window ("... loses/wins the Duel!"), fame lines. Party duel: two
   parties, the leaders do the same with "Duel - Party vs Party".

## Left
- The duel menu shows only in a /ctd Duel Zone, as V15 on our data. Duels everywhere would change V15: the owner's call.
- Done on branch `post-merge-leftovers` (docs/2026-11-15-post-merge-leftovers.md): the party duel's client blocks, the
  flag hidden under Dark Illusion or a transparent GM, the /ctd zone cleared on a teleport.
