# Lord system: checkpoint (2026-11-11)

Stopped early: the usage limit was reached. Research is done; the client code is not started.

## Done

- Research: `docs/superpowers/specs/2026-11-11-lord-research.md` (this branch, 387d5a4).
- Server (outer repo, branch `lord`, worktree `Blouflash-worktrees/lord`, 3450d23):
  - `BB_LordSystem.sql` + `BB_LordSystem.ps1`: create missing Lord objects; fix `uspElectionBeginVote` (the vote never
    began while `tblElection` was empty). Report by default, `-Apply` backs up and fixes.
  - `docs/lord/deploy.md`: the VM steps.
  - No Source patch and no build: `__LORD` is a dead label; the Lord code is built in by `__VER >= 12`.

## Left (FlyffWeb), in order

1. `packages/protocol/src/world/lord.ts`: the 12 snapshot readers (0x8F00-0x8F0D, research §3.2, register in
   `world/readers.ts` and the `WorldMessage` union in `world/types.ts`, an `isLordMessage`), the 5 encoders (§3.1), a
   `readLordRequestPacket` for `decodeClientPacket` (`messages/world.ts`), testkit writers (`packages/testkit/src/lord.ts`).
   Pattern: `world/bank.ts`.
2. `apps/client/src/world/lord/lordState.ts`: CCLord in TS (sorts by deposit / votes then tCreate; 10 kept at vote).
3. Windows (`hud/lord/`), layouts in research §6, `ResWindow` like `hud/heavenTowerWindow.ts`; enable MMI 91-94, 101 in
   `hud/moverMenu.ts` and `WorldScreen.chooseNpcEntry`; route messages in `WorldScreen.apply` (~line 930).
4. HUD: event icon after buffs, captions and chat lines, Lord-skill shortcut (SHORTCUT 11) and the `L` applet (728).
5. Phone panels (guild/bank pattern), vitest, Playwright spec on port 5192, `npm run typecheck`, `npx vitest run`.
6. `docs/lord/deploy.md` mentions a phone Lord Skill button in the Lord info window: build it, or change the line.

No convert is needed: every picture and text is already in `dist/assets`.
