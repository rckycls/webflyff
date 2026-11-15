# Pet loot filter (2026-11-16)

Owner: "plan and implement pet loot filter". A pick-up pet picks up only the kinds of item the player chooses.

## What V15 does

- **No filter anywhere.** Neuz has no loot or pickup option (the only "filter" in Source is the chat word filter,
  `APP_CHAT_FILTER`). So this is a **custom feature** the owner chose.
- **The World server picks the items, not the client.** The pick-up pet is a server NPC with `CAIPet`
  (`_AIInterface/AIPet.cpp`). Once a second `SubItemLoot` (:105-170) takes the nearest ground item within 15 m that the
  owner may loot (`IsLoot( item, TRUE )`), walks there, and on arrival (`AIMSG_ARRIVAL`, :288-324) calls the owner's
  `DoLoot`. The client sends nothing for a pet pickup, so **a client-only filter cannot stop the pet**: the World server
  needs a small patch.

## The filter

Eight kinds, from what V15 monsters drop (`DropItem`/`DropKind` in `Resource/propMoverEx.inc`), read from the item's
three kinds (`Resource/defineItemkind.h`). First rule that fits wins:

| Bit | Kind | Rule | Examples |
|---|---|---|---|
| 1 | Penya | `IK1_GOLD` | penya |
| 2 | Potions and food | `IK2_REFRESHER`, `IK2_POTION`, `IK2_FOOD`, `IK3_PILL` | refreshers, vital drinks, food, pills |
| 4 | Weapons | `IK1_WEAPON` | swords, wands, bows |
| 8 | Armour | `IK1_ARMOR` | suits, helmets, gauntlets, boots, shields |
| 16 | Jewellery | `IK2_JEWELRY` | rings, necklaces, earrings |
| 32 | Upgrade materials | `IK2_MATERIAL` | cards, moonstones, sunstones, jewels |
| 64 | Quest items | `IK2_GEM`, `IK3_GEM`, `IK3_QUEST` | monster parts (Twinkle Stone ...), quest rubies |
| 128 | Other | everything else | scrolls, keys, boxes, eggs |

All on by default (= V15). The rules live in `apps/client/src/world/items/lootFilter.ts` and, bit for bit the same, in the
server patch's `_Common/PetLootFilter.h`.

## Where it lives and how it is saved

- Per character, in the browser: Auto Play's settings (`flyffweb.autoPlay.<playerId>` in localStorage), field `loot.mask`.
  An older store reads as "everything".
- The client sends the mask to the World server when the character enters the world and after each change. World
  keeps it in memory on `CUser` (no database change). Until a client sends one, the pet takes everything (V15).

## Window, desktop and phone

- A fourth tab, **Loot**, in the Auto Play window (Start menu line 19 "Auto Play" or the AUTO button). No new Start menu
  line. Header "Your pick-up pet and Auto Play pick up:", the 8 boxes in two columns, then **All** and **None**.
- Same frame, tab strip and buttons as the other Auto Play tabs; on the phone the same compact window with bigger
  boxes (28 px rows, 18 px boxes). No text or amounts, so no keyboard or number pad.

## Auto Play

Cheap, so done: the farm bot's looting skips drops whose kind is unchecked (the drop never joins its loot list).
Auto Play's own "Pick up drops" box on the Farm tab stays as it is.

## Server change (World only)

- New client packet `PACKETTYPE_PET_LOOT_FILTER` `0x8FFF0100`: one `DWORD` mask. The Cache server forwards it to World as
  any other client packet.
- `CUser::m_dwPetLootFilter` (start: all bits), set by `CDPSrvr::OnPetLootFilter` (masked to 8 bits).
- `CAIPet::SubItemLoot` skips an item whose kind is unchecked; the arrival check skips it too (the filter changed while
  the pet walked there).
- Shipped as `patches/2026-11-16-pet-loot-filter.patch` in the outer repo (branch `pet-loot-filter`), CP949 + CRLF.
  Only `7. World.exe` changes.

## Steps

1. `lootFilter.ts` + tests; `loot.mask` in Auto Play's settings; the Loot tab; Auto Play skips unchecked drops. (done)
2. Protocol: `encodePetLootFilter`; WorldScreen sends it on entry and on change.
3. Server patch, build World Release|Win32, save the patch.
4. Quick checks: typechecks, vitest on touched files, `check:public-build`, a Playwright look at the tab (desktop +
   landscape phone, Chromium).
