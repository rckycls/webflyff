# Auto Play round 2 checkpoint (2026-11-17)

Branch `auto-play-2` (FlyffWeb worktree `FlyffWeb-worktrees/auto-play`), from local main 5e576f3. Custom feature (owner).
Not merged, not pushed. No convert (every picture used is already converted), no server change.

## Owner's asks
1. "Make the whole auto play window follow the v15 theme."
2. "Make the auto farm smarter by avoiding obstacle or if it hasn't attack for 5 seconds then change target."
3. "Add more options like, avoid giants, select specific monster on the said radius and only attack that mob."

## What was built
- **V15 look** (all four tabs, desktop and phone): Neuz's tiled frame around pale group boxes, Neuz's 12 px Verdana words with
  the statics' blue captions, check boxes on ButtCheck.bmp's frames (no browser check box left), the silver word buttons
  of the other V15 windows, item and skill slots on Neuz's slot picture, the V15 tab strip.
- **5 s rule:** 5 s with no attack of ours on the target (a hit, a swing or a skill) → another target, also mid-fight. It
  was 10 s with no step closer.
- **Obstacles:**
  - a monster with a clear straight line comes before one behind a wall, tree or rock (the client's own line test);
  - blocked on the way (farther than 4 m, no step and no attack for 1.5 s): it steps 4 m to the side, then goes at it
    again (one side, then the other, twice at most);
  - still nothing: the 5 s rule takes another target.
- **Farm tab options:**
  - "Avoid giants and bosses" (on by default; off lets the bot take them);
  - "Monsters": All, or Choose → the monster kinds inside the radius (name, level, how many); tick one or more and the
    bot fights only those. A ticked kind no longer near stays in the list to be unticked. "All kinds" clears the choice.
  - A monster hitting you is always fought back, whatever the options.
- The window is 290 px high (was 250) for the new lines; on a phone the page scrolls.

## Builder's checks (done)
- Unit tests: all Auto Play tests pass. A full client run had 2 `pageAssets` timeouts (that test passes alone and was not
  touched; it times out under load).
- Typechecks clean. Auto Play e2e (`autoPlay.spec.ts`): 6 of 6 on chromium and phone.
- Pictures of the four tabs on desktop and phone were checked by eye.

## Owner's test
1. Open Auto Play: each tab in the V15 look, desktop and phone. Send a yes/no on the look.
2. Farm near walls or trees. **Pass:** it prefers monsters it can reach and steps around an obstacle; a monster it cannot
   hit for 5 s is dropped for another.
3. Farm tab → Monsters → Choose, tick one kind, Start. **Pass:** it fights only that kind (and anything that hits you).
4. Untick "Avoid giants and bosses" near a giant. **Pass:** the giant can be chosen.

## Note for merging
The unmerged `pet-filter` branch replaces the Loot tab. This branch changed the Loot tab's check boxes, so merging both
will need the Loot part of `autoPlayWindow.ts` resolved by hand (keep pet-filter's removal).

## Round 2b: Support mode (2026-11-17, owner)
Asked: "is the skills tab applicable to all jobs? can we add another tab solely for buffers (Ringmaster)? Someone who
follows another player and just heals/buffs it whenever". Owner's answers: **any player you target**; **fields and
dungeons**; **heal and buff only** (no attack).

- The Skills tab works for every job (it lists the character's learned skills), but its ready skills go on the monster
  and its buffs on yourself; so a fifth tab, **Support**:
  - **Partner:** target a player, press "Use target" (Clear empties it).
  - **Heals:** 2 heal skills; "Heal partner" below 70 %, "Heal me" below 50 % (steps of 5).
  - **Partner buffs:** 8 skills, recast on the partner when missing or under 10 s.
  - **Resurrect partner:** on by default (needs Resurrection learned).
  - **Start/Stop** for Support. The AUTO button starts the mode last started (farm or Support).
- In Support mode the bot never attacks. Its order: raise the dead partner, heal them, heal yourself, your own buffs (Skills
  tab), the partner's buffs, then follow within 4 m (V15's walk to a mover). One cast at a time, each waiting for the
  server's answer.
- Allowed in the fields and in instance dungeons and secret rooms; off in the Arena, siege, 1:1 guild war and duels.
- Stops as the farm bot does (a player's hit, a GM in view, a teleport, your own move...), plus the partner out of sight
  for 10 s ("partner gone"). A whisper from the partner does not stop it; anyone else's does.
- The partner's HP percent uses the client's estimate of their maximum (as the target bar), so it may be a little off.

Owner's test (two accounts, one an Assist/Ringmaster):
1. On the buffer, target the other player, Support tab → Use target; put Heal in Heals and a buff in Partner buffs; Start.
2. Walk the other player around. **Pass:** the buffer follows, keeps the buff on them, heals them under 70 %.
3. Let the other player die (with Resurrection learned). **Pass:** the buffer raises them.
4. Whisper the buffer from the other player: it keeps going. From a third account: it stops.
