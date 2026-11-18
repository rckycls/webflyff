# Awaken window (CUSTOM, 2026-11-19)

The owner's window: "Something like the piercing window but I enter the item, scroll of awakening and scroll of reversion
and two buttons of Awaken and Cancel". Design: `docs/superpowers/specs/2026-11-19-awaken-window-design.md`; plan:
`docs/superpowers/plans/2026-11-19-awaken-window.md`. The server half is the outer repo's branch `awaken-window`
(`patches/2026-11-19-awaken-window.patch`, a new `Program\7. World.exe`, `docs/2026-11-19-awaken-window-deploy.md`).

## What players get

- **Start menu → Awaken** (desktop and phone; no hotkey). The bag opens with it.
- The V15 Piercing look: rows **Item**, **Awakening**, **Reversion ->**, the penya bag (50,000 once an item is in),
  **Awaken** and **Cancel**. At the right (on a phone: under the slots) the **Awakening** panel lists the item's current
  awakening in the tooltip's blue, or "Not awakened".
- Items go in by a drag, a double-click or a phone tap on a bag item; each goes to the slot of its kind. A right click
  (phone: a tap) on a slot takes it out.
- **Awaken**: a Yes/No box first, with a **Don't ask again** check box (unchecked every time the window opens).
  - not awakened: 1 Scroll of Awakening + 50,000 Penya;
  - awakened: 1 Scroll of Reversion + 1 Scroll of Awakening + 50,000 Penya, the old awakening replaced.
- Missing pieces are said in the chat and nothing is sent. The window stays open for the next roll; a used-up scroll stack
  leaves its slot.
- The World server checks it all again (see the outer deploy doc). An old World ignores the packet.

## For the build

- New packet `AWAKEN_WINDOW` `0x8fff0102` (`encodeAwakenWindow`, `packages/protocol/src/world/upgrade.ts`).
- `apps/client/src/world/items/awakenWindow.ts`, layouts `AWAKEN` / `AWAKEN_CONFIRM` in `itemWindowLayouts.ts`.
- Start menu: applet `9004` (`AppId.AWAKEN`), the top level's 19th line (`MENU_MAX_LINES`): the next new window must go in
  a folder.
- `themeKey` now keeps an asset key (`ui/...png`): the line shows the Scroll of Awakening's own icon.
- Shared with others: `drawIcon` and `takeDrops` are exported from `upgradeNpcWindows.ts`; `awakeningLines`,
  `isAwakened`, `isAwakenable` from `itemTooltip.ts`; Auto Play's `.auto-word` / `.auto-check` CSS also styles this window.
- **No convert, no gear sync**: every picture already exists.

## Checks run here

- `npm run typecheck`: clean.
- `npx vitest run packages/protocol/test/upgrade.test.ts packages/testkit/test/world.test.ts apps/client/test/itemTooltip.test.ts apps/client/test/awakenWindow.test.ts apps/client/test/upgradeNpcWindows.test.ts apps/client/test/hud.test.ts`:
  all pass.
- From `apps/client`, port 5197: `npx playwright test e2e/awakenWindow.spec.ts e2e/startMenu.spec.ts --project=chromium --project=phone`:
  6 passed, 4 skipped (sizes of the other project).

## Full suites for the owner (in the FlyffWeb worktree or after the merge)

```powershell
npm run typecheck
npm test
npm run test:e2e:client
```

Pass: no type errors; vitest all green (the known `pageAssets` / `vipImages` timeouts under load pass when run alone);
the client e2e with no new failures (`dist` must be copied from main first).

## VPS order

1. The World exe from the outer branch (its deploy doc has the steps and the hash).
2. The FlyffWeb update made after the merge: `deploy\0-Make-Package.ps1 -FlyffWebOnly -NoAssets`, then
   `run.bat Update-FlyffWeb -From ...` on the VPS.

## In the game

See the outer `docs/2026-11-19-awaken-window-deploy.md`, "In-game checks".

## Final review (one fresh reviewer)

- Fixed: the server counted a waiting protected roll (which the web client cannot see) as "awakened", so an item with no
  options left was refused on every press until relog. Only options and the protection flag count now (World exe
  `A2088164…`).
- Left as they are (minor, for the owner to pick):
  1. a scroll put in before the item is ignored without a message (Piercing does the same);
  2. the server's quiet refusals (trading, own shop open, item held) send no message: the button just works again after 2 s;
  3. the server log line reads `GetWorld()->GetID()` without a null check (as V15's own scroll code does);
  4. each scroll's item log records the whole stack count (as V15's `OnDoUseItemTarget` does), not 1;
  5. the Awaken word button can take keyboard focus (harmless today: the window's key handlers stop Space and Enter).
