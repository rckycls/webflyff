# Craft Card (CUSTOM, 2026-11-19): design

Owner's request: "card crafting option added to Bozman in Saint Morning (Name of menu item, Craft Card) ... a general item
like a craft stone (Useable for all craft things in the future) ... a window where there is a split screen where first
window they add the required items and second window is where the item result will show after crafting. The chance for
card crafting depends on how many and how rare the card they are adding. They cannot mix Suit cards and Weapon cards ...
The chance gets bigger the more they add cards." With three examples: 1 stone + one 3% card = 10% for a random 7% card;
one 4% = 20%; a 4% + a 3% = 35%.

Settled with the owner in the planning talk (2026-11-19): the odds table below; the stone drops from monsters at a very
low chance; a failed craft uses up the stone and every card; build way A (new window + one new World packet); weapon
cards work like suit cards (D, C, B in place of 2%, 3%, 4%).

Added by the owner the same day: "an icon button for bulk ... repeat this combination for a n number of times ... only
for VIP1-VIP4. VIP1: MAX 5 repeats, VIP2: MAX 10, VIP3: MAX 15, VIP4: MAX 20." See "Bulk craft (VIP)" below.

V15 has nothing like it. V15's Card Master (`MaFl_CardMaster`, `Exchange_Script.txt` MMI_EXCHANGE_ARMORCARD/WEAPONCARD)
trades 10 cards of one kind for a chance at the next tier of that kind (4% to 7% is a 4% chance). It stays as it is.

## Why

Players pile up low piercing cards. Crafting turns them into the top cards, which on this server are big (the owner's
high-rate profile, `Resource/propItemEtc.inc`: a "7%" suit card gives +35%, an A weapon card +35 to its stat). The stone
gates how often anyone can roll and is meant to be the one crafting material for later crafting features too.

## The cards

Suit cards (`IK3_SOCKETCARD`), five families, four tiers (`II_GEN_MAT_ELE_*`):

| family | 2% | 3% | 4% | 7% (result only) |
|---|---|---|---|---|
| Volcano (Max HP) | CANDLE 3204 | VOLCANO3 3255 | MAGMA 3207 | VOLCANO 3208 |
| Ocean (Max MP) | RAIN 3209 | OCEAN3 3256 | FLOOD 3212 | OCEAN 3213 |
| Lightning (attack) | SPARK 3214 | LIGHTING3 3258 | THUNDER 3217 | LIGHTING 3218 |
| Earthquake (defence) | SAND 3219 | EARTHQUAKE3 3259 | MOUNTAIN 3222 | EARTHQUAKE 3223 |
| Vacuum (Max FP) | BREEZE 3224 | VACCUM3 3257 | STORM 3227 | VACCUM 3228 |

Weapon cards (`IK3_SOCKETCARD2`), five families, grades D, C, B and A (A is result only): Fire 26594-26597, Water
26598-26601, Wind 26602-26605, Electric 26606-26609, Land 26610-26613 (D, C, B, A in that order).

The odd "seghope" cards 3237-3254 and 3500-3532 (also `IK3_SOCKETCARD`, nothing drops them) are not taken.

## The odds (owner-approved)

- Each card adds points: 2% or D = 5, 3% or C = 10, 4% or B = 20.
- Every card after the first adds 5 more.
- 1 to 5 cards per craft. The chance never goes above 90%.
- The result is always one random top card of the same kind: a 7% suit card or an A weapon card, each of the five
  families equally likely.
- 7% and A cards cannot be put in.

`chance = min(90, sum(points) + 5 * (cards - 1))`, in whole percent. Examples: one 3% = 10; one 4% = 20; 4% + 3% = 35;
three 2% = 25; five 2% = 45; three 3% = 40; two 4% = 45; three 4% = 70; four 4% = 90 (capped from 95).

- On a fail: the stone and every card are used up (owner). Nothing comes back.
- No penya cost (my call: the stone is the price).

## The Craft Stone

- New item `II_GEN_MAT_CRAFTSTONE` 20280 (the next free custom id after the mount's 20270), name "Craft Stone".
- Description: "A stone used for crafting. Bozman in Saint Morning uses it to craft piercing cards."
- A general material: stacks to 99, can be traded, dropped and sold to NPC shops; using it does nothing.
- Drop (owner: monsters, very low chance): one global line in `Resource/propDropEvent.inc`,
  `DropItem(II_GEN_MAT_CRAFTSTONE, 8000, 0, -1, 1, 150);` for every monster of level 1-150, bosses and giants
  included. With the x77 item rate that is about 1 in 4,900 kills of monsters near the player's level; the V15 level-gap
  cut still applies (monsters 8+ levels below drop it a tenth as often). One number to change later.
- The web client adds the item to its catalog in code when the converted catalog lacks it (as the Grey Wolf Mount does,
  `groundMount.ts`), so no convert is needed.

## What the player sees

```
+ Craft Card -----------------------------------------------+------------------- +
|  Craft Stone  [  ]                                        |  Result            |
|                                                           |                    |
|  Cards  [  ] [  ] [  ] [  ] [  ]                          |       [    ]       |
|                                                           |  Lightning Card(7%)|
|  Chance: 35%                                              |  Success!          |
|  Makes: one random 7% suit card                           |                    |
|                                                           |                    |
|              [Craft]   [Cancel]                           |                    |
+-----------------------------------------------------------+--------------------+
```

- **Opening:** Bozman's menu becomes Dialog, Trade, Craft Card. The web client adds the line itself for the NPC key
  `MaSa_Bozman` (no change to `character.inc`, no convert). The bag opens with the window, as Piercing does.
- **Look:** V15 window tiles, V15 slot pictures (as Create Jewels), the result as the right part of the same window
  ("split screen", owner), titled "Result". Cancel is V15's Cancel picture; Craft is a word button (V15 has no Craft
  picture).
- **Putting things in:** drag from the bag onto a slot, or double-click a bag item (phone: tap). The stone goes to the
  stone slot, a card to the first empty card slot. One stack can fill several slots while it has pieces left (four 4%
  cards from a stack of ten). Items in the window are held in the bag (shown faded), as in Create Jewels. A right-click
  (phone: tap) on a slot empties it.
- **Slot rules (client, for quick messages; the server checks again):**
  - Stone slot: only a Craft Stone.
  - Card slots: only the 2/3/4% suit cards and D/C/B weapon cards above. A 7% or A card: "7% and A cards cannot be
    crafted." Anything else: "Cannot be done."
  - The first card sets the kind. A suit card in means only suit cards; a weapon card in means only weapon cards:
    "Suit and weapon cards cannot be mixed." Emptying every card slot frees the kind again.
- **Chance line:** shows the chance live as cards go in and out, and what it makes ("one random 7% suit card" or "one
  random A weapon card"). Empty card slots: "Chance: 0%".
- **Craft press:**
  - Missing pieces are said in the chat and nothing is sent: no stone, or no card.
  - Otherwise a Yes/No box asks first (my call, since a fail loses everything): "Craft with a 35% chance? On a fail the
    Craft Stone and all cards are lost." Yes sends; No sends nothing.
  - Craft is locked until the server answers, or 3 s pass, so a double press cannot craft twice.
- **After the answer:**
  - Success: the result part shows the new card's picture and name and "Success!"; the chat says "You crafted
    Lightning Card(7%)!"; the V15 success sound.
  - Fail: the result part shows an empty slot and "Failed"; the chat says "Crafting failed. The Craft Stone and the
    cards are gone."; the V15 fail sound.
  - Either way every slot empties (as Create Jewels does), the window stays open, and the result stays shown until the
    next item goes in.
  - Refused by the server: the chat says why ("You are too far from Bozman.", "Not enough space in the inventory.",
    or "Cannot be done." for anything else), the slots stay, Craft unlocks.
- **Closing:** Cancel, the X, closing the bag, or walking out of Bozman's menu range (as the other NPC windows).

## Bulk craft (VIP)

The same combination, rolled again and again in one press. Owner's limits, by the character's VIP letter
(`_Common/authorization.h`): VIP1 'A' up to 5 tries, VIP2 'B' 10, VIP3 'C' 15, VIP4 'E' 20. Everyone else: 1 (no bulk).
My call: game masters (letter 'L' and up) get 20 too, so the owner can test it with a GM character.

```
|  Chance: 35%    Makes: one random 7% suit card    |  Result               |
|                                                 |  10 tries: 3 made     |
|      [Craft]  [(x)]  [Cancel]                   |  [ ] Lightning 7% x2  |
|                                                 |  [ ] Ocean 7% x1      |
```

- **The button:** a small icon button beside Craft (a repeat icon), shown only to VIP characters (and GMs). Hidden for
  everyone else, as the VIP bag buttons are.
- **Press:** a box asks "Repeat how many times?" with the number (desktop: typed; phone: the number pad), from 2 up to
  the most allowed: the VIP limit, cut down to what the stone and card stacks in the window can pay for (a stack used in
  two slots pays half as many tries). A tick box "Stop at the first success", unticked by default (my call: a player
  who only wants one card does not lose the rest).
- **Then the Yes/No box,** naming the total: "Craft 10 times with a 35% chance each? It uses up to 10 Craft Stones and
  30 cards. Every fail loses its stone and cards."
- **The server runs the tries one by one,** each one exactly a single craft (same checks, same take-then-roll). It stops
  early when a stone or card runs out, the bag has no room for a success, or (if ticked) after the first success. Tries
  not run cost nothing.
- **The answer** lists every try's result. The Result part shows "10 tries: 3 made" and each card made with its count;
  the chat says the same in one line. One success sound if any try succeeded, else the fail sound.
- **After it:** the slots empty, as after a single craft.
- **Phone (landscape):** the same window; the result part sits under the slots instead of beside them, as the Awaken
  window does. Taps instead of drags.

## Server (World only, one patch)

- New packet `PACKETTYPE_CRAFT_CARD` `0x8FFF0110`, web client to World. (0x8FFF0102/0103 are taken by the unmerged
  vip-perks branch, and awaken-window also uses 0x8FFF0102: that clash is theirs to settle; 0x8FFF0110 keeps clear of
  both.) Body: eight DWORDs and a BYTE: Bozman's object id, the stone's item object id, five card item object ids
  (`NULL_ID` for an empty slot), the number of tries (1-20), and "stop at the first success" (0 or 1). The Cache
  server passes it on unchanged, as it does the Pet Filter's 0x8FFF0101.
- New snapshot `SNAPSHOTTYPE_CRAFT_CARD` `0x9A01`, World to web client (after the layered boss HP's 0x9A00): a BYTE
  code (0 ran, 2 refused: not near Bozman, 3 refused: bag full, 4 refused: anything else), a BYTE number of tries run
  (0 when refused), then one DWORD per try run: the item id made, 0 for a fail.
- Tries allowed: 1 for everyone; up to 5 / 10 / 15 / 20 for the VIP letters 'A' / 'B' / 'C' / 'E', and 20 for game
  masters ('L' and up), read from the character's letter at the press. More than allowed: refused (4), nothing spent.
- `CDPSrvr::OnCraftCard` never trusts the client. It refuses (answer 2-4, nothing spent) when:
  - the player is dead, trading, or has a personal shop open;
  - the NPC id is not a mover with key `MaSa_Bozman` in the player's world and layer within `MAX_LEN_MOVER_MENU` (as
    the vendor check of server-security-2 L8);
  - the stone is missing, unusable or not item 20280;
  - there are no cards, or a card is missing, unusable, not in the input table, or of the other kind;
  - one item object id is used more times than its stack holds (stone included);
  - a success would not fit in the bag (checked before anything is taken).
- Then, for each try (one try for a single craft), in one step each:
  1. check the stone and cards are still there and a success still fits (else stop: later tries cost nothing);
  2. work out the chance from the server's own table (the client's number is never sent);
  3. take 1 stone and 1 of each card (grouped per stack), with item logs;
  4. roll `xRandom(100) < chance`;
  5. success: make one random top card of the kind (5 families, equal), put it in the bag, log it; stop here if "stop
     at the first success" is set.
- After the tries: the success sound and effect if any try succeeded, else the fail ones; then the answer snapshot.
- The input table, points, the +5, the cap 90 and the stone id are constants in one place in the patch, so later
  crafting can reuse the stone id.
- Patch `patches/2026-11-19-craft-card.patch` goes after the 13 patches already on main `Source` (last
  `2026-11-18-rates-x77`). It must apply cleanly next to the unmerged vip-perks and awaken-window patches in any
  order; whichever lands last rebuilds the World exe from all of them.

## Resource changes (outer repo)

`defineItem.h`, `propItem.txt`, `propItem.txt.txt` (name, description), `mdlDyna.inc` (the dropped-item model),
`propDropEvent.inc` (the drop line). Each keeps its file encoding. `CUSTOM_FEATURES.md` gets a Craft Card entry.

## Approaches

1. **New window plus one new World packet (chosen, owner).** The World checks, rolls, takes and gives in one step. The
   odds live in the World, with a copy in the client only to show the chance.
2. Same, with the odds in a Resource text file the World reads at start. Rejected: more code, and the client's shown
   chance would still need a website update to match.
3. V15's exchange script (the Card Master's system). Rejected: fixed recipes only; it cannot do points, the
   suit/weapon rule or the split window.

## Not in scope

- The Neuz (exe) client: FlyffWeb only.
- Other uses of the Craft Stone (later features).
- Putting 7% or A cards in (no family re-roll).
- Changes to the Card Master.
- A shop or GM-only source for the stone (GMs can still make it with /ci).

## Left to the builder

- The stone's picture and dropped-item model: existing game files, not the Moonstone's or Sunstone's look-alikes.
- The menu line's id in the client (any id no MMI uses) and its sound.
- The window's exact size and slot positions, on desktop and phone, checked to fit.
- The stone's `propItem.txt` row details (copy a general material row such as the Moonstone's: cost, level, rarity).
- The exact V15 sound and effect ids for success and fail (as Piercing's).
- The bulk button's icon (an own picture in `src/icons`, as the window icons are) and the number box's look.
