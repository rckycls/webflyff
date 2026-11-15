# Post-merge leftovers: checkpoint, 2026-11-15

Branch `post-merge-leftovers` (worktree `FlyffWeb-worktrees/post-merge-leftovers`), from main 1ca4341. Not merged, not
pushed. Each fix is copied from the V15 Neuz source (outer repo `Source\`).

## What changed

1. **Beauty shop + duel:** pressing Yes on a duel question closes the face and hair windows, each with the bag
   (`WndDuelConfirm.cpp:153-175`).
2. **Duel:**
   - Party duel blocks (`m_nDuel == 2`): party window Leave gives "You cannot leave the party during party PvP."
     (`WndParty.cpp:309-313`); Hand Over gives "Unable to change the party leader during a party duel." (`:365-366`);
     Invite gives "You cannot invite another character to join the party during party PvP." (`WndWorld.cpp:11233-11237`).
   - Any duel: your own personal shop window does not open (`WndVendor.cpp:209-212`).
   - The duel flag is not drawn while the player has Dark Illusion or is a GM in /invisible; it comes back when that ends
     (`CSfxDuelParty::Render`, `Sfx.cpp:2860-2870`).
   - The /ctd Duel Zone is cleared on every teleport, also inside the same world. In V15 `OnReplace` reopens the world and
     its regions (`worldmng.cpp:261-298`).
3. **Housing and guild house:**
   - Players and NPCs can't walk through placed furniture and can stand on it (`ProcessCollision`'s and
     `ProcessUnderCollision`'s `OT_CTRL` loops, `WorldIntersect.cpp:515-556`, `:1249-1281`). This applies in the personal
     room and the guild houses only. Each piece uses its collision mesh (`furniture/ctrlCollision.ts`). Every room and
     guild furniture model already has one in `dist/assets`.
   - Leaving the guild clears the guild house furniture list (`GuildHouse->Clear()`, `DPClient.cpp:12672-12674`).
   - Indoor light (`CWorld::SetLight`, `World3D.cpp:1837-1893`) for the personal room and the guild houses. The room is
     lit fully (its .wld ambient is white). The small guild house gets its indoor ambient and keeps the outdoor sun,
     because its `lightDir` is 0 0 0, which D3D refuses. The middle and large guild houses are outdoor worlds, so nothing
     changes there.

## Convert (main folder, after the merge)

Only the indoor light needs one. It writes `diffuse` and `lightDir` into the indoor worlds' manifests:

```
npm run convert -- --only "WdMiniroom,WdGuildhouse*"
```

No `--only data`, so no gear sync. Without the convert, rooms keep the noon light and the rest still works.

## Owner test steps (VM, characters A and B)

1. **Duel closes the beauty windows:** A and B stand in the /ctd Duel Zone (Madrigal x 3787-4000, z 3843-4064; a GM runs
   `/ctd` there). A uses a hair coupon (GM `/ci 26410`) and presses Yes: the Hair Shop and the bag open. B right-clicks A >
   "Duel - 1 vs 1". A presses Yes: the Hair Shop and the bag close, then the 3-2-1 count starts.
2. **Party duel blocks:** two parties in the zone. The leaders start "Duel - Party vs Party". During the fight, the
   leader opens the party window (P):
   - Leave shows the "cannot leave" line.
   - Choose a member, Hand Over: the "Unable to change the party leader" line.
   - Right-click a player > Invite to party: the "cannot invite" line.
   - The personal shop (Start > Private Shop) does not open.
3. **Flag hidden:** during a 1:1 duel, B casts Dark Illusion (Acrobat): A no longer sees B's flag; it comes back when the
   buff ends. A GM duelling with `/invisible`: the other side sees no flag.
4. **Duel Zone cleared:** after `/ctd`, A uses a Blinkwing or a teleport and comes back: the duel menu lines are gone until
   a GM runs `/ctd` again.
5. **Furniture collision:** in your room, place a bed. Walk into it: you stop or slide along it, not through it. Jump on
   it: you stand on top. Same with a guild house piece. Phone: the same with the joystick.
6. **Guild house cleared:** a guild member with the Furniture Storage (R) open inside the guild house leaves the guild:
   the storage list empties.
7. **Room light (after the convert):** Charlie > Enter House. The room walls and floor show their textures at full
   brightness, with no sun shading. Before the convert, the walls were shaded by the noon sun.

## Checks run here

- Typechecks clean: apps/client, apps/client/tsconfig.node.json, apps/viewer, packages/protocol (+ tsconfig.test.json),
  packages/formats, packages/scene (+ tsconfig.node.json), packages/testkit, tools/convert.
- `npx vitest run apps/client packages/protocol packages/formats tools/convert packages/scene`: 325 files, 4705 passed
  (9 skipped). After the last edit, `apps/client` again: 208 files, 2844 passed.
- `npm run check:public-build`: ok.
- No e2e run (quick checks only). Desktop and phone share every changed path (no new window or layout).

## Left, the owner's call

- **Other indoor worlds** (dungeons, Clockworks, Volcano, the 1:1 guild arena) also use the indoor light in V15. Here they
  keep the noon light. Several of them have `lightDir 0 0 0`, so in V15 they keep the light of the last outdoor world.
  Turning it on for them is a one-line change in `WorldScreen.openStage`, plus a full world convert.
- Outside the housing worlds, V15 movers also collide with other controls (dungeon chests, doors). They still walk through
  them here.
- The hair light keeps the noon value in rooms (`moverModels.ts`), so hair can look a little brighter than in V15.
