# Craft Card (CUSTOM, 2026-11-19): notes for the owner

Card crafting at Bozman in Saint Morning, a general crafting item (the Craft Stone), and a VIP bulk craft. Design:
`docs/superpowers/specs/2026-11-19-craft-card-design.md`; plan: `docs/superpowers/plans/2026-11-19-craft-card.md`. The
server half is on the outer repo's branch `craft-card` (`docs/2026-11-19-craft-card-deploy.md` there has the VPS steps).

## What players get

- Bozman's menu: Dialog, Trade, **Craft Card**. The window opens with the bag.
- Left: a Craft Stone slot and five card slots, the chance and what it makes. Right (under them on a phone): the Result.
- Odds: 2% or D = 5 points, 3% or C = 10, 4% or B = 20; +5 for each card after the first; never above 90%.

| Cards put in | Chance of a random 7% (or A) |
|---|---|
| one 2% | 5% |
| one 3% | 10% |
| one 4% | 20% |
| 4% + 3% | 35% |
| two 3% | 25% |
| three 2% | 25% |
| five 2% | 45% |
| three 3% | 40% |
| two 4% | 45% |
| three 4% | 70% |
| five 3% | 70% |
| four 4% | 90% (the top) |

- Suit and weapon cards never mix; 7% and A cards cannot go in. A fail uses up the stone and every card.
- Craft asks Yes/No first. VIP1-VIP4 (and GMs) also get a repeat button: up to 5 / 10 / 15 / 20 tries (cut to what the
  stacks in the window pay for), with "Stop at first success".
- The Craft Stone (item 20280) drops from every monster of level 1-150, about 1 in 4,900 kills near the player's level.

## What changed here (FlyffWeb)

- `packages/protocol/src/world/craftCard.ts`: CRAFT_CARD 0x8fff0110 and its answer 0x9a01.
- `apps/client/src/world/items/craftCardRules.ts`: the odds (a copy of the World's), the VIP tries, the Craft Stone item
  (added to the catalog in code: no convert, no gear sync).
- `apps/client/src/world/items/craftCardWindow.ts`, `style.css`: the window, desktop and phone.
- `hud/moverMenu.ts`: the "Craft Card" line for `MaSa_Bozman` (in code: character.inc is not changed).
- `items/itemNpcWindows.ts`, `WorldScreen.ts`, `WorldSession.ts`: the wiring.

## Tests to run (on this PC, in the FlyffWeb folder after the merge)

```bash
npm run typecheck
```

```bash
npx vitest run
```

```bash
npx vitest run packages/protocol/test/craftCard.test.ts apps/client/test/craftCardRules.test.ts apps/client/test/craftCardWindow.test.ts apps/client/test/itemNpcWindows.test.ts apps/client/test/moverMenu.test.ts
```

```bash
cd apps/client && npx playwright test e2e/craftCard.spec.ts --project=chromium --project=phone
```

Pass: no type errors; all unit tests pass; the e2e says `2 passed`. (Your dev server holds 5174; to run beside it, set
`E2E_CLIENT_PORT=5199` first.)

## Merge and deploy

- No convert and no gear sync: the client adds the Craft Stone and Bozman's line itself.
- The World exe and five Resource files come from the outer branch `craft-card`; follow its deploy doc. Make the website
  package with `deploy\0-Make-Package.ps1 -FlyffWebOnly -NoAssets`.
- An old World ignores the packet: the window then unlocks after 3 s and nothing is spent.
