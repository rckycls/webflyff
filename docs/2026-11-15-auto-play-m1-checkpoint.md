# Auto Play M1 checkpoint: auto pots (2026-11-15)

Branch `auto-play` (FlyffWeb worktree `FlyffWeb-worktrees/auto-play`). Custom feature (owner 2026-11-15). Not merged.

## What is in
- Start menu: a 19th line "Auto Play" after Siege Ranking (phone menu now 10 + 9).
- Auto Play window: tabs Farm, Potions, Skills (Farm and Skills greyed until M2/M3).
- Potions tab: "Auto pots" box; rows HP / MP / FP: tap the slot to pick a potion, refresher, food or pill from the bag;
  "below" [-] 50% [+] (10-90 %, steps of 5); on box; × clears. Saved per character.
- Auto pots work while you fight by hand. Off in the Arena, the siege map, 1:1 guild war and during a duel, and while
  dead. One item per gauge at most every 500 ms, then only after the gauge moved or 800 ms passed. Food and pills keep
  their V15 cooldown. When a set item runs out: "Auto pots: no HP items left." once.

## Builder's checks (done)
`npx vitest run apps/client` (all pass), `npx tsc --noEmit -p apps/client`, `npm run check:public-build` (ok).

## Owner's test (game in the browser, servers in the VM)
1. Start menu → Auto Play → Potions. Tick "Auto pots". Tap the HP slot, pick a red potion. Leave "below" at 50%.
2. Fight monsters by hand. **Pass:** a potion is used each time HP drops under half, and the count goes down.
3. Close and reopen the game with the same character. **Pass:** the settings are still there. Another character has its
   own (empty) settings.
4. Use up the last potion. **Pass:** one orange line "Auto pots: no HP items left.", not repeated.
5. Enter the Arena. **Pass:** no potion is used there by itself.

Send back: which step failed and what you saw.
