# Auto Play M4 checkpoint: phone and AFK (2026-11-15)

Branch `auto-play`. Custom feature (owner 2026-11-15). Not merged.

## What is in
- Phone: the Start menu in two columns of 10 and 9; the Auto Play window with larger [-]/[+] and slots; the AUTO button
  above the quick slot over Attack (tap: start/stop; long press 0.5 s: the window). The AUTO button hides under a phone
  window, as Attack does.
- Keep the screen on (Wake Lock) while the farm bot runs; asked again each time the page is seen again. First start on a
  phone: "Keep the game open and the screen on. Locking the phone stops Auto Play."
- Battery saver: a black screen with dim text (time, kills, EXP, items, potions, HP/MP/FP bars, what it is doing). The
  world is not drawn while it shows; the game keeps running. Opens from the Farm tab's "Battery saver" button, and by
  itself on a phone after 2 minutes with no touch. A tap closes it; a stop closes it.
- Desktop background tab: farming goes on (the rules run from the worker clock; pinned by a unit test).

## Builder's checks (done)
`npx vitest run apps/client` (all pass), `npx tsc --noEmit -p apps/client`, `npm run check:public-build` (ok).

## Owner's test
1. iPhone, landscape, in a field: tap AUTO. **Pass:** it starts; the tip line shows once; the screen does not dim or lock.
2. Leave it 2 minutes. **Pass:** the black battery saver opens by itself; the numbers go up while it shows. Tap: the game
   is back.
3. Long-press AUTO. **Pass:** the Auto Play window opens; it fits the screen.
4. Start menu on the phone. **Pass:** two columns, 10 and 9 lines, all above the task bar.
5. Lock the phone for 2 minutes, unlock. **Pass:** the game shows the disconnect (expected: a web page cannot run while
   the phone is locked).
6. Desktop: run 30 minutes in a background tab. **Pass:** still farming when you come back.

Send back: which step failed and what you saw (a screenshot for 3 and 4).
