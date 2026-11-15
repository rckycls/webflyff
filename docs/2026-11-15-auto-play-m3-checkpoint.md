# Auto Play M3 checkpoint: auto skills and buffs (2026-11-15)

Branch `auto-play`. Custom feature (owner 2026-11-15). Not merged.

## What is in
- Skills tab: "Use Action Slot" box; Ready skills (4 slots) and Buffs (8 slots): tap a slot, pick a learned skill
  (buffs: or a buff item from the bag); × clears; a skill or item the character no longer has is greyed and skipped.
- While fighting: a ready skill whose cooldown is over (and MP/FP enough) first, else the V15 Action Slot (as C), else
  auto attack. After each cast the bot waits for the server's answer, then 1 s. A wand is held for full-charge shots and
  let go before any skill.
- Between fights, standing: the first buff that is missing or has under 10 s left is cast; the bot stands until the
  server answers. A buff already on you from anyone (a party assist) counts.

## Builder's checks (done)
`npx vitest run apps/client` (all pass), `npx tsc --noEmit -p apps/client`.

## Owner's test
1. Put 2-3 skills in the V15 Action Slot. Skills tab: Use Action Slot on. Farm. **Pass:** the chain is used on each
   monster, auto attack in between.
2. Add a cooldown skill to Ready skills. **Pass:** it is cast whenever its cooldown is over.
3. Add a self-buff skill to Buffs. **Pass:** it is cast between fights when missing, and again shortly before it ends.
4. Magician with a wand, no skills: **Pass:** charged wand shots (not weak ones).

Send back: which step failed and what you saw.
