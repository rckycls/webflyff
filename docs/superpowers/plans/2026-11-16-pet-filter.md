# Pet Filter, Wakazaki style (2026-11-16)

Owner: "Do something like this", pointing at RaGEZONE's "Fully working pet filter Wakazaki Style" (2011). It replaces the
Loot tab built earlier the same day (`2026-11-16-pet-loot-filter.md`).

## What the post does

- A window of its own, **Petfilter** (`APP_PETFILTER`), opened from the Start menu or with **U**.
- **19 checks in five groups.** A checked box is a kind the pet does **not** pick up. The bottom line reads "Choose the
  items you DO NOT want to pick up".
- **Apply** saves the setting (Neuz.ini, so it is one setting for every character), sends it to the World server
  (`PACKETTYPE_PETFILTER`, one DWORD) and closes the window. Closing it any other way drops the changes.
- The client sends the setting again whenever a character connects.
- World keeps it on the player (`m_dwPetfilter`). `CAIPet::SubItemLoot` skips an item when any checked rule matches it.
- Penya and anything outside the 19 rules are always picked up.

| Group | Checks (bit) | Rule |
|---|---|---|
| Food | HP Food (1), MP Food (2), FP Food (4) | IK2_FOOD; IK3_REFRESHER; IK2_POTION or IK3_DRINK |
| Equipment | Blue Weapons (8), Green Weapons (16) | a weapon with dwReferStat1 WEAPON_GENERAL; WEAPON_UNIQUE |
| | Blue Set Items (32), Green Set Items (64) | a suit, helmet, gauntlets or boots that is not ARMOR_SET, and not a shield; ARMOR_SET |
| Accessories | Necklace (128), Earring (256), Ring (512) | IK3_NECKLACE, IK3_EARRING, IK3_RING |
| Misc. | Egg (1024), Sunstone (2048), Moonstone (4096), Quest Items (8192) | II_PET_EGG; the sunstones and their piece; the moonstones and their piece; IK2_GEM or IK3_QUEST |
| Cards | Element Card (16384), 4% Cards (32768), 7% Cards (65536), B Cards (131072), A Cards (262144) | IK3_ELECARD; the five "(4%)"; the five "(7%)"; the five "(B)"; the five "(A)" |

The post has a few bugs, fixed here:

- FP Food compared `dwItemKind1` with IK3_DRINK, and Quest Items compared `dwItemKind2` with IK3_GEM. Neither could ever
  match.
- The weapon checks read only `dwReferStat1`, so Green Weapons would also have left buff pets (PET_VIS 1) behind.
- Blue Set Items took in fashion items too.

Quest Items uses IK3_QUEST, not IK3_GEM, because IK3_GEM also covers gift boxes. The 2% and 3% cards and the C and D
cards stay outside every check, as in the post.

## What is built

- **Rules:** `apps/client/src/world/items/petFilter.ts`, and the same rules in the World patch's
  `_Common/PetFilter.h`, bit for bit.
- **Window:** `apps/client/src/world/hud/petFilterWindow.ts`, laid out from the post's resdata entry with the same rects.
  - 396 x 240: the entry says 432, but its controls end at 376, and the post's picture shows it 396 wide.
  - Group bars on WndEditTile200, ButtCheck.bmp checks, Apply on ButtCharApply.tga.
- **Phone:** the same window at full size, which fits a landscape phone above the task bar.
  - A pale backing behind the words, as on the other phone panels.
  - Each check takes a press anywhere on its row.
  - Apply is a silver button.
  - No text fields or amounts, so no keyboard or number pad.
- **Opening it:**
  - A Start menu line "Pet Filter" after Auto Play, so the menu has 20 lines; the phone shows them in two columns of 10.
    After the 2026-11-17 merge with main's Backpack line it has 21 (540 px), and the phone shows 11 and 10.
  - Hotkey U, free since the Teleporter went.
  - The applet id is 9003, because the post's 2022 is APP_MAP_EX in this ResData.h.
- **Saved setting:** `localStorage['flyffweb.petFilter']`, one per browser for every character, as Neuz.ini was.
- **Auto Play:** its looting skips the same items. The Loot tab, its 8 kinds and Auto Play's `loot.mask` are removed.
  After the merge with Auto Play round 2 (2026-11-17), its tabs are Farm, Potions, Skills and Support, in the round-2 look.
- **Packet:** `PET_FILTER` 0x8fff0101, one DWORD.
  - Sent on world entry when the setting is not empty, and after an Apply that changes it.
  - It replaces 0x8fff0100. A World server without the new patch ignores the new packet, so the pet takes everything.

## Server

`patches/2026-11-16-pet-filter.patch` in the outer repo replaces `2026-11-16-pet-loot-filter.patch`. It applies to main's
`Source` as it is, or after the five 2026-11-15 patches. It adds:

- `_Common/PetFilter.h`;
- `PACKETTYPE_PETFILTER` in `MsgHdr.h`;
- `CUser::m_dwPetfilter`, set to 0 in Init;
- `CDPSrvr::OnSetPetfilter`;
- two checks in `CAIPet::SubItemLoot`: when choosing an item, and again on arrival.

The deploy steps are in the outer branch's `docs/2026-11-16-pet-filter-deploy.md`.

## Checks

- Typecheck.
- vitest: `petFilter`, `petFilterWindow`, `autoPlayWindow`, `autoPlaySettings`, `hud`, `mobileTools`, `resWindow`, and
  the protocol's `pets`.
- e2e, Chromium desktop and landscape phone: `petFilter.spec.ts`, `autoPlay.spec.ts`, and the phone Start menu test in
  `landscape.spec.ts`.
