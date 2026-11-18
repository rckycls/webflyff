# VIP perks: design (2026-11-19)

Spans the game server (outer repo `Blouflash VS22 V15`, `Source` changes as a patch) and FlyffWeb (website, panel, client).

## Why

The owner says players don't see a reason to buy VIP at all, so the cheap tiers ($2 and $4 a month) need something that
feels worth it every time the player logs in.

Today VIP gives only two things:
- the star by the name (bronze, silver, gold or purple);
- more Auto Play time each week: 14 h free, then 24/36/48 h, and no limit for VIP4.

Prices are $2/$4/$6/$10 a month, or pesos in the Philippines. Payments are manual: a QR code and a receipt that the
owner approves in the panel.

## What VIP gets (owner's picks)

| | VIP1 $2 | VIP2 $4 | VIP3 $6 | VIP4 $10 |
|---|---|---|---|---|
| Star (exists) | bronze | silver | gold | purple |
| Auto Play a week (exists) | 24 h | 36 h | 48 h | no limit |
| Monthly gift box, by in-game mail (new) | small | medium | large | biggest |
| NPC shops (new) | 5% off | 10% off | 15% off | 20% off |
| EXP lost on death (new) | half | half | none | none |

Repairs were part of the owner's "Cheaper NPCs" pick, but they are dropped: in V15 repairs cost no penya and gear never
wears down (`OnRepairItem` takes penya only `#if __VER < 11`), so a repair discount would be worth nothing.

## Goals

- Add the three new perks to each tier, as in the table.
- The website keeps the in-game VIP letter in step with the payments list (`ACCOUNT_DBF.dbo.WEB_VIP`). The owner first
  said "Game reads it", then "Website keeps it"; the later answer stands. Approving a payment then also gives the star,
  and the star goes away when VIP runs out.
- Gift boxes go out by themselves. The owner sets what is in them.

## Non-goals

- No extra EXP or drops for VIP. The owner chose "comfort only".
- No VIP-only channel. It is parked until there are more players.
- No stat bonuses, VIP gear or VIP-only maps.
- No VIP name colour. The owner decided this earlier: the stars only.

## Anti-goals (failures even if the rest works)

- A VIP must never win a fight that a free player with the same level and gear would lose.
- No one may make penya by buying from an NPC at the VIP price and selling the item back. Perin is the obvious case: it
  is bought for 100,000,000 penya.
- A GM, admin or observer letter must never be changed or lost.
- If the VIP table is missing or its lookup fails, players must still enter the game, as free players.
- A gift must never be sent twice for the same paid month, and never to a character on another account.
- No one may gain EXP by dying.

## Facts the design rests on

- **Authority letters:** VIP1-4 are `A`, `B`, `C`, `E` (vip-auth patch, 2026-11-17). `F` is a normal player, and
  everything above `F` is staff. VIP letters are titles only: for commands they count as `F`.
- **Where the letter is read:** at character entry, `CHARACTER_STR 'S8'` returns `m_chLoginAuthority` (account) and
  `m_chAuthority` (character). `Source/_Database/DbManagerJoin.cpp` around line 237 combines them: for an `F` or VIP
  account, the character's own letter wins unless it is `F`. The client gets the result when it joins, and draws the star
  from it (`apps/client/src/world/render/nameTags.ts`).
- **The VIP list:** `WEB_VIP` has `account`, `level` (1-4) and `endsAt` (UTC). VIP is live while `endsAt` is later than
  now. Approving a request (`apps/web/sql/vip.sql`) writes only this table today. The table exists only once the
  website's VIP section has been installed (`Install-Vip.ps1`).
- **In-game mail:** `__GETMAILREALTIME` is on in the Database server. It polls `MAIL_STR_REALTIME 'S1'` and puts each
  new mail, with its item, straight into the player's in-game mailbox, with no restart
  (`Source/_Database/DbManager.cpp`, `QueryGetMailRealTime`). A mail carries one item stack.
- **Shops:** NPC shop buying is `CDPSrvr::OnBuyItem` and chip shops are `OnBuyChipItem`, both in
  `Source/WORLDSERVER/DPSrvr.cpp`. `OnBuyItem` works out the item's price (shop rate, any existing discount, Perin fixed
  at `PERIN_VALUE`, at least 1), then adds the territory purchase tax on that price. The tax goes to the Lord's guild.
- **Death:** the EXP lost on death is set around `Source/_Common/Mover.cpp:7265` (`m_nDeathExp`), and the client is told
  through `AddSetExperience`. `GetDieDecExpRate` (Mover.cpp around 7190) already treats chaotic (PK) players more harshly,
  and `CreateExpBox` gives back part (30%) of the EXP lost. PK is off on this server (`//PK` in `WorldServer.ini`).
- **VIP months:** approving a request adds one calendar month (`usp_AdminVipApprove`, `DATEADD(month, 1, …)`), from the
  current end if the level is the same and VIP is live, else from now. One request is one month.
- **How server changes ship:** `Source` is git-ignored, so server changes ship as `patches/*.patch` in the outer repo,
  after the 13 that are already applied. The main `Source` gets the new patch only once the owner says merge.
- **Public repo:** the FlyffWeb repo (webflyff) is public, so no secrets go in it.

## Approaches considered

1. **The website keeps the star in step. Chosen by the owner.** Approving a payment (or Give VIP) writes the letter,
   and a job every few minutes puts right any letter that no longer matches the VIP list. It needs no server code beyond
   the World change. The cost: while the website is down, letters and gifts wait, and a letter change only counts from
   the player's next entry.
2. **The game reads the VIP list at entry.** The star and the perks are always right at entry. Not chosen: it needs more
   server code (the entry query or a new `Database.exe`), and the gifts need the website job anyway.
3. **Hand-managed letters, as today.** Dropped: it costs the owner time and causes mistakes.

## The design

### 1. Who is VIP, in the game (the website keeps it)

- **The right letter:** for an account with live VIP it is the level's letter (1→`A`, 2→`B`, 3→`C`, 4→`E`); for one
  without, it is `F`.
- **Right away:** approving a request and Give VIP set the account's letter (`ACCOUNT_TBL_DETAIL.m_chLoginAuthority`) in
  the same transaction that writes `WEB_VIP`.
- **The job:** every 5 minutes (the same job as the gifts), it sets the right letter on every account whose letter is
  `F` or a VIP letter but does not match the VIP list. That also clears the letter once VIP has ended.
- **Characters:** on those same accounts, any character whose own letter is a VIP letter goes back to `F`. Old hand-set
  ones would otherwise win over the account's letter at entry (`DbManagerJoin.cpp` around line 237).
- **Never touched:** any account or character whose letter is not `F` or a VIP letter (staff, observer `D`, anything
  else).
- **Taking effect:** the game reads the letter at each entry, so a change counts from the player's next entry (relog or
  change channel). **My call:** a player who is online when VIP ends keeps the star and the perks until they next enter.
- **When the job can't run:** if `WEB_VIP` does not exist (VIP section off), the job does nothing. If the website is
  down, changes wait until it is back.
- **Rankings:** stored letters now really become `A`/`B`/`C`/`E`. The SQL that filtered rankings on `'F'` was already
  fixed to accept VIP letters (`BB_VipAuth.ps1`, 2026-11-17). The builder checks that nothing else that filters on `'F'`
  drops VIP players.
- **Logging:** every letter change gets a row in the panel's audit log.
- **Stars set by hand before this update (my call):** the panel has offered VIP letters since 2026-11-17. When the job
  finds an account or character with a VIP letter and no `WEB_VIP` row at all (never paid or given), it does not clear
  it. It turns it into a 30-day VIP at that level (no gift box), logged in the audit log, so nobody silently loses a star
  the owner gave. An account whose `WEB_VIP` row has ended is cleared as normal. The owner can then extend or end those
  with Give VIP.

### 2. Cheaper NPC shops (World server)

- The penya price of an item bought from an NPC shop (`OnBuyItem`) gets 5%, 10%, 15% or 20% off by VIP letter.
- **The tax (my call):** the territory purchase tax is still worked out on the price before the VIP discount, so the
  Lord's guild earns the same. The player pays the discounted price plus that tax.
- These are unchanged:
  - repairs (free in V15, see the table);
  - selling to NPCs;
  - chip shops (`OnBuyChipItem`, the Red Chip merchant);
  - personal shops;
  - upgrades, the beauty shop, the guild house and housing.
- **Never discounted:** any item that an NPC buys back for as much as or more than its discounted price. That means
  Perin, plus whatever else the builder finds by checking the item list. This is the money-making hole in the anti-goals.
- Rounding: the builder's call, but an item that costs penya never becomes free.
- **Client (FlyffWeb):** the shop window shows the VIP price for the own player, worked out from the player's own
  letter. This keeps the shown price, the "not enough penya" check and the charged price the same.

### 3. Less EXP lost on death (World server)

- Wherever V15 already takes EXP on death, VIP1-2 lose half of that amount and VIP3-4 lose none.
- VIP3-4 never drop a level from dying. VIP1-2 follow the normal rules with half the loss.
- Deaths where V15 takes no EXP (duels, arena, siege, and any others it already exempts) stay as they are.
- **Chaotic players (my call):** a chaotic (PK) player gets no VIP reduction. Paying must not soften the PK penalty. PK
  is off on this server today, so this only matters if it is turned on later.
- **The EXP box and resurrection:** whatever gives back part of the lost EXP (`CreateExpBox`, resurrection) works on the
  EXP actually lost after the VIP rule, so nobody can gain EXP by dying. A VIP3-4 who lost nothing gets no EXP box.

### 4. Monthly gift box (website, `apps/web`)

- **One box per paid month (my call):** each approved request is one month of VIP, so each approval creates one gift,
  at the request's level, in the same transaction as the approval. Three months bought means three boxes, one at each
  approval. This replaces "every 30 days", which gave a second box near the end of a 31-day month and treated a rebuy
  after a gap unevenly.
- **Give VIP:** has a "Send the gift box" tick, on by default, so a short grant for a tester can go without one.
- **Sending:** a job runs every 5 minutes while the VIP section is on and sends every gift not sent yet. So the box
  arrives within minutes of approval.
- **Who gets it:** the account's character on server `01` that is online now, or else the one with the most play time
  (`TotalPlayTime`). Ties go to the lowest `m_idPlayer`. Deleted characters never count. With no character, the gift
  waits.
  - This was "most recently played", changed while planning: `CHARACTER_TBL` has no last-login time.
- **How it is sent:** through the real-time mail path, one mail per item stack. The title is like "VIP3 gift" and the
  text is a short thank-you. The sender is the system.
- **Never twice:** each gift is a row in a new table, `WEB_VIP_GIFT` (account, level, the request or grant it came
  from, character, items, created, sent). Marking it sent happens in the same transaction as writing the mail rows, so a
  crash cannot send a gift twice.
- **Contents:** set per tier in the panel's VIP tab (item and count), next to the prices.
  - Starting lists: potions, Blinkwings and revival scrolls, bigger for each tier.
  - The builder picks the V15 item ids, and the owner tunes them.

### 5. Panel (`apps/web` admin)

- **VIP tab:**
  - "Give VIP" (account, level 1-4, number of days, "Send the gift box" tick, with an audit row). It starts or extends
    `WEB_VIP` like an approved request, without a payment. This is how the owner gives VIP to testers or prize winners
    now that hand-set letters no longer count.
  - The gift contents for each tier.
  - A gift log: account, character, level, items and time.
- **Account and character level pickers:** the VIP1-4 choices go. **My call:** the panel says "VIP comes from the VIP
  tab" instead.

### 6. The VIP page (`/vip/`)

- Each tier card lists all five perks in plain words: the star, the Auto Play hours, the gift box, the NPC shop
  discount and the death rule. **My call:** this is what gives players a reason to buy.
- A logged-in VIP also sees whether their gift box for the latest month has been sent, and to which character.

## What ships

- **Server:** a new `7. World.exe` (patch 14: the discount and death changes). No new `Database.exe`.
- **SQL:** the website's VIP install script adds `WEB_VIP_GIFT`, the gift contents and the letter procedures.
- **FlyffWeb:** a normal code update (website, panel, client). No convert and no gear sync.

## Left to the builder

- Rounding of the discount.
- How the client and the server share the tier percentages.
- The exact mail table and columns behind `MAIL_STR_REALTIME`.
- The item ids in the starting gift lists.
- The full list of items that are never discounted.

## Owner checks after building

1. Approve a VIP1 request for a test account and log in: the star shows, and within 5 minutes the gift mail arrives.
2. In an NPC shop, the price shows 5% off and the same amount is charged. Perin is not discounted.
3. Die to a monster: about half the usual EXP is lost. As VIP3, none is lost.
4. Set `endsAt` in the past and log in again: no star, full prices, normal death loss.
5. A GM account keeps its GM letter whether or not it has VIP.
6. Give VIP for 3 days with the gift tick off: the star shows and no gift is sent.
