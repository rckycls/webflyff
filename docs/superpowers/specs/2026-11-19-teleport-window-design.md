# Teleport window (CUSTOM) — design

Owner, 2026-11-19: "create the teleporter window. something like this but for v15 theme and make it responsive for
mobile as well", with a screenshot from another server (layout only; none of its names or branding are copied). Then:
"Make only flaris, darkon and sm for regular players add the other for VIP1-VIP4".

## Why

Players get a quick paid way around Madrigal from anywhere. VIP1-VIP4 get the dungeons and far areas too, which gives
the cheap VIP tiers something players can see (the VIP perks work's reason: players saw no reason to buy).

## Owner's answers

- Opens from the **Start menu** and works **anywhere a Blinkwing works**; refused while dead, fighting, flying,
  trading, in a shop, in a duel, or in siege / arena / events.
- **10,000 penya** per teleport, plus a **10-second wait** between teleports.
- **V15's 14 teleporter places** (`MaFl_TELEPORTER_3VETERAN`, `Resource/character.inc` 7956-7975), no level limits.
  Regular players: **Flaris, Saint Morning, Darkon** only. **VIP1-VIP4** (and GMs): all 14.
- Preview pictures: **V15's region maps** (`WORLD_*.dds`, already converted: no convert).

## Approaches

1. **Chosen: a custom packet with only the place number.** A World patch holds the list, the VIP rule, the price, the
   wait and every check, then moves the player with `REPLACE`.
2. V15's own NPC teleport packet (`PACKETTYPE_TELEPORTER` 0x88100100, `OnTeleporterReq`): rejected. The server takes it
   only next to a guild-house teleporter NPC (`IsCloseNpc`) and charges nothing.
3. A Blinkwing-like scroll per place: rejected. It is not the window the owner asked for.

## The places (index = the packet's number; the client and the server keep the same order)

| # | Name | x, z (Madrigal, y = ground) | Who | Map picture |
|---|---|---|---|---|
| 0 | Flaris | 7161, 3264 | everyone | WORLD_Flaris |
| 1 | Saint Morning | 8321, 3720 | everyone | WORLD_Saint |
| 2 | Darkon | 3896, 4378 | everyone | WORLD_Darkon12 |
| 3 | Darkon 1 | 5593, 3920 | VIP | WORLD_Darkon12 |
| 4 | Darkon 3 | 3221, 3416 | VIP | WORLD_Darkon3 |
| 5 | Shaduwar | 5933, 5393 | VIP | WORLD_harmonin |
| 6 | Garden of Rhisis | 9273, 3720 | VIP | WORLD_Ricis |
| 7 | Mars Dungeon | 7593, 4246 | VIP | WORLD_Flaris |
| 8 | Dekane Mine | 5076, 3958 | VIP | WORLD_Darkon12 |
| 9 | Ivillis Temple | 8629, 2178 | VIP | WORLD_Saint |
| 10 | Dead Wilderness | 3846, 3264 | VIP | WORLD_Darkon3 |
| 11 | Volcane | 3341, 1886 | VIP | WORLD_Darkon3 |
| 12 | Aminus Dungeon | 6644, 6450 | VIP | WORLD_harmonin |
| 13 | Aminus Dungeon (Hero) | 6781, 6062 | VIP | WORLD_harmonin |

The points are V15's own `AddTeleport( x, z )` lines (y 0: `CWorld::_replace` finds the ground). "Darkon" is the city
(the teleporter's Darkon 2 point, where the V15 Darkon Blinkwing lands). Names come from V15's English texts
(`world.txt.txt`, the Blinkwing's "Shaduwar"); "Dead Wilderness" is the desert the Darkon map labels.

## Window

Title "Teleport", V15 tiled frame (`ResWindow`), about 440 x 330 on desktop.

```
+------------------------ Teleport -----------------------[x]+
| +-------------+  [ Flaris                                 ]  |
| | Flaris    ▲ |  +----------------------------------------+  |
| | Saint Morn. |  |   region map, the landing spot marked  |  |
| | Darkon      |  |                                        |  |
| | Darkon 1 ★  |  +----------------------------------------+  |
| | ...       ▼ |  +----------------------------------------+  |
| +-------------+  | one or two lines about the place       |  |
|  10,000 Penya    +----------------------------------------+  |
|   [ Apply ]                                                  |
+--------------------------------------------------------------+
```

- Left: the 14 places in a V15 list box; the chosen row highlighted. VIP places carry the VIP star (`ui/vipstar1.png`).
- Right: the name over the region map (4:3), a small marker at the landing point (`mapPoint` with the picture's world
  bounds, as `worldMapRules.ts`), and a text box with a short line about the place. A VIP place shown to a non-VIP adds
  "VIP only".
- Under the list: the price and Apply.
- **Phone (landscape):** the same two columns in a compact centred panel over the open bag (`overBag`); rows tall
  enough for a finger, the picture shrinks to fit; the list scrolls.

## Behaviour

- Start menu: a new folder **"Extras"** (V15 folder look) holding Pet Filter and Teleport, so the top level keeps its 18
  lines (Awaken can join the folder when it merges). Built call: Auto Play stays at the top level (the most used, and
  moving it would have resized the whole menu). The phone's Auto Play and Pet Filter icons stay; U still opens the Pet
  Filter. No hotkey for Teleport.
- The window opens on the last place picked this session (Flaris the first time).
- Apply: the client refuses at once a VIP place for a non-VIP ("Only VIP players can teleport there.") and too little
  penya (V15's "not enough Penya"); otherwise it sends the number and closes the window. Every other refusal comes
  from the server as a chat line.
- No Yes/No box: the price is on the window.

## Server (outer repo, World only)

New `PACKETTYPE_TELEPORT_WINDOW` **0x8FFF0120** (free on every branch: 0x0100-0x0103 and 0x0110 are taken), one
`int` place number. `CDPSrvr::OnTeleportWindow`, placed by `OnTeleporterReq` (far from the lines the pet filter,
awaken, VIP-perks and craft-card patches touch), checks in this order and changes nothing on a refusal:

1. a valid player; the number is 0-13;
2. VIP place and not VIP1-VIP4 (`IsAuthVip`) nor a GM → "Only VIP players can teleport there.";
3. the 10-second wait (`CUser` in-memory tick, 0 at login) → "You can teleport again in N seconds.";
4. `GetSummonState()`: trade/bank, dead, shop, fighting, flying, duel → V15's own messages (`TID_GAME_STATE_NOTUSE`
   with the state's text, as the party summon does);
5. chaotic or PK-pink, sitting, casting an item, frozen by a GM, turned to stone, or due a rename (the Blinkwing's own
   refusals) → "You cannot teleport now.";
6. the Blinkwing's places: guild siege world, 1v1 guild war, secret room, rainbow race, quiz, housing (mini room),
   Azria (Kebaras), and the arena → "You cannot teleport from here.";
7. under 10,000 penya → `TID_GAME_LACKMONEY`;
8. `REPLACE( WI_WORLD_MADRIGAL, point, REPLACE_NORMAL, nDefaultLayer )`; only if it is queued: take 10,000 penya,
   start the wait, and write a penya log.

The table lives in a small header (`_Common/TeleportWindow.h`); the client's table says to keep both the same.

The patch goes after the 13 already on main `Source` and must stack with the unmerged awaken-window, vip-perks and
craft-card patches in any order (`git apply --check`). A rebuilt `7. World.exe` (VS 2022, Release|Win32) holds main
`Source` + this patch only; whichever World patch merges last rebuilds the World from all of them.

## Non-goals

- No level limits, no per-place prices, no new pictures, no convert.
- No change to V15's guild-house teleporter NPC (`TeleporterWindow`).
- No hotkey; no phone top-right icon (the 2 x 5 rows are full).

## Left to the builder

- The exact rects, the list's row pitch and the phone CSS grid.
- The short line about each place.
- How the Start menu folder and the e2e tests that open Auto Play / Pet Filter from Start are updated.
