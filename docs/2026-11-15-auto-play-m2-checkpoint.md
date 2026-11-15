# Auto Play M2 checkpoint: farm bot (2026-11-15)

Branch `auto-play`. Custom feature (owner 2026-11-15). Not merged.

## What is in
- Farm tab: Radius [-] 15 m [+] (5-30 m), Pick up drops, Stop after [-] off [+] (1-12 h), Start / Stop, status and
  counts (time, kills, EXP, items, potions).
- AUTO button (desktop: right end above the task bar): click starts or stops; right-click opens the window. Gold while
  running, "!" after a stop (the reason in its tip).
- The bot: the nearest monster inside the radius around where you pressed Start; never bosses or giants unless they hit
  you; skips monsters another player is fighting; fights back anything that hits you; re-engages after each kill;
  gives up a monster it cannot reach in 10 s; walks back to the start point when idle or too far.
- Loot: the items that appear within 5 m of its kill in the 3 s after it; a refused or slow pickup is skipped. Bag full:
  stops looting, keeps fighting.
- Stops (orange chat line, a short sound, the AUTO "!", and "(!) Stopped" in the tab title when the tab is hidden):
  death, HP under 20 % with no HP potion left, a player's hit, any whisper, a GM talking near you, a duel request or
  start, a teleport, a world change, a disconnect, your own move/click, flying, the time limit, a blocked world.

## Builder's checks (done)
`npx vitest run apps/client` (all pass), `npx tsc --noEmit -p apps/client`, `npm run check:public-build` (ok).

## Owner's test (game in the browser, servers in the VM)
1. In Flaris fields, open Auto Play (Start menu). Farm tab: Start. **Pass:** it attacks the nearest monster, then the
   next after each kill, and picks up its drops.
2. Let it run 30 minutes in a background tab (switch to another tab). **Pass:** when you come back it is still farming
   (kills went up).
3. From a second account: whisper the bot. **Pass:** it stops, the line says "Auto Play stopped: message from <name>."
4. Second account: ask for a duel. **Pass:** it stops ("duel").
5. Teleport (scroll or GM). **Pass:** it stops ("left the area").
6. Press a move key while it runs. **Pass:** it stops ("you took control").
7. Press Start in the Arena. **Pass:** refused, "not allowed here".

Send back: which step failed and what you saw.
