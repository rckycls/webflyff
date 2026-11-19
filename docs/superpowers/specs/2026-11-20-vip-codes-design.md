# Redeem codes (CUSTOM, 2026-11-20): design

Owner's request: "redeemable codes for free VIP Tiers i can send with expiration". Then:
- "Codes can be redeemable by everyone or exclusive to some."
- "Codes can either be items, boxes, vip subscriptions."
- "Codes shouldn't replace any higher tier current subscription."
- Picked **refuse** for a lower-tier code while a higher VIP runs.
- "I would like this to be an ingame window. They can redeem a code inside the game whether its desktop browser or
  mobile browsers. If its an item it checks if you have slot before redeem. If its a VIP it tells you to relogin to see
  changes. We have to make sure the error handling is taken care really carefully here."
- Picked **mail, then into the bag** for how items arrive.
- "I'm thinking of different gift boxes that is not associated with VIPs. Like i can make a code and associate an item
  to it which will be received by the redeemer. It can be a giftbox or a single item." Then: boxes **already in the
  game** (no new box items).

## Why

The owner wants to hand out free VIP and items without the Support / VIP payment queue: one code shared with
everyone (a Discord post, say) or codes only some players can use. (The "why" past that is our reading: giveaways,
events, rewards.)

## Goals

- The owner makes codes in the admin panel. A code gives a VIP tier for some days, up to 6 item stacks, or both.
  An item is anything in the game's item list: a single item, or one of the game's own box items the player opens in
  the bag.
- Every code has an end date and time; after it, the code stops working.
- Three kinds of code:
  - **Everyone:** one code; each account can use it once; an optional cap on total uses ("first 100").
  - **Only these accounts:** one code that works only for the accounts the owner lists.
  - **One-use codes:** a batch of N different codes, each usable once, by anyone, for the owner to send privately.
- Players redeem in an **in-game window**, on desktop and phone browsers.
- Items come by in-game mail and the game moves them into the bag. The window checks bag room before redeeming.
- VIP from a code tells the player to log out and in again to see it.
- Careful error handling: every failure has a clear message, and nothing is given twice or lost.

## Non-goals

- No code box on the website's VIP page (owner: in-game window).
- No change to the game server (World, Database exes). Everything is FlyffWeb and its SQL.
- No penya codes, no start date (a code works from when it is made), no editing what a code gives after it is made.
- No VIP gift box from codes (the panel's per-tier boxes stay for paid VIP and Give VIP only): a code's boxes are the
  game's own box items, added as items. No new box items (that would be a data job of its own).

## Anti-goals (a failure even if it works)

- A free code that takes days from a higher VIP a player has (owner's rule).
- Items given twice, or lost after the code was used.
- Codes someone can find by trying, or one-use codes printed in logs.
- A player left not knowing whether the code worked.

## Constraints

- The website cannot put items into a bag while the player is in the game: the World server holds the bag. Mail
  written into `CHARACTER_01_DBF` (as the VIP gift boxes do, `MAIL_STR 'A1'` into server index 51) is the only path
  without a server change. The Database server picks it up within a minute (`DatabaseServer.cpp`, the
  `__GETMAILREALTIME` query on the 1-minute `TIMER_ID_EVENT_GENERIC`). The game deletes mail 15 days after it is sent.
- The game already opens the website's player session at login (`world/autoplay/usageLimit.ts`: the lobby logs into
  `/api/account/login` with the typed account and password, then forgets them). That session is in memory: 60 minutes
  idle, 12 hours at most, and gone when the web service restarts.
- The site, the panel and the VIP job run in one node process, with two SQL logins: `flyffweb_site` (public routes) and
  `flyffweb_admin` (panel and VIP job). Today only `flyffweb_admin` can write mails; keep it that way.
- New SQL goes in `apps/web/sql/vip.sql`, so `Install-Vip.ps1` (run by `deploy\Update-FlyffWeb.ps1`) installs it.
- VIP rules already in `vip.sql`: same tier while it runs adds days; letters A B C E for VIP1-4, set only over a player
  or VIP letter (staff keep theirs); the 5-minute VIP job keeps letters in step.
- The game reads the VIP letter when a character enters the world: VIP shows from the next login.

## Approaches (how items reach the bag)

1. **Mail, then into the bag (picked).** The website uses the code and writes the items as mail in one go, so the
   two cannot come apart. The game then takes the items from those mails into the bag. If the bag filled up, they wait
   in the mailbox. No game server change. Up to about a minute's delay.
2. **Mailbox only.** Same as 1, but the player takes the items from Post themself. Simplest; no bag check needed.
3. **Straight into the bag.** The World server checks the code and adds the items at once. Needs new World and
   Database exes and patches; a server crash right after the code is used can lose the items.

The owner picked 1: it is the only one with both "nothing can be lost" and "items land in the bag".

## How it works

### A player redeems

```
+ Redeem Code ------------------------------+
| Code  [ABCD-EFGH-JKMN-PQRS     ] [Paste]  |
|                              [Check]      |
|-------------------------------------------|
| This code gives:                          |
|  (star) VIP2 for 7 days                   |
|  [icon] Remantis Laccotte x10             |
|  [icon] Town Blinkwing x5                 |
| Needs 2 free bag slots (you have 14).     |
|                                           |
|           [Redeem]   [Cancel]             |
+-------------------------------------------+
```

1. Start menu → Extras → **Redeem Code** opens the window (desktop; the phone gets the same as a compact panel, like
   the Teleport window).
2. The player types or pastes the code. Spaces and dashes are ignored; letters are not case-sensitive. The game's
   floating keyboard works in the box; a **Paste** button reads the clipboard (phones: copy from Discord, paste here).
3. **Check** asks the website what the code gives, and shows it with item icons and names. It also shows the bag
   slots needed: one empty main-bag slot per item stack, against the empty slots the
   player has now.
4. **Redeem** is enabled only when the bag has room. When the code's VIP is higher than the player's live VIP, the
   window warns first: "This ends your VIP1 (20 days left) and gives VIP4 for 7 days." and Redeem asks again before
   sending.
5. On success:
   - "Done! Your items arrive in your bag within about a minute. If your bag is full by then, they wait in your
     mailbox (Post) for 15 days."
   - With VIP: "You have VIP2 until 27 Nov 2026. Log out and in again to see it."
6. When the code's mails arrive, the game takes their items into the bag by itself: only system mails (sender 0)
   whose title is `Code reward #<use id>` for a use made while this page is open (the ids are kept in memory until the
   page closes, so they survive the log out and in that VIP asks for). If the bag is full or the World refuses (a trade
   open, say), the mail stays, and the chat says once: "Your code items are waiting in your mailbox (Post)." The World
   lets a mail item be taken anywhere, with one empty bag slot (`CDPSrvr::OnQueryGetMailItem`, DPSrvr.cpp:5208), and
   real-time mail is not held back by the 50-mail limit (`QueryGetMailRealTime`, DbManager.cpp:7306).
7. While the player is in the world, the game touches its website session every 30 minutes, so the session does not
   run out after 60 idle minutes (today only Auto Play's ticks keep it alive). The bag room check is the game's only:
   the website cannot see a live bag; skipping it only means the items wait in Post.

### The rules (checked by the website, in SQL, in one transaction)

- The code must exist, be on, and not be past its end time.
- **One use per account per code**, whatever character or key.
- Everyone code with a cap: refused once the cap is reached. One-use key: refused once used. Only-these-accounts code:
  refused for an account not on the list.
- **VIP part** (none when the code gives no VIP):
  - no live VIP: the code's tier starts now, for its days;
  - the same tier: its days are added to the end;
  - **a lower tier than the live one: the whole code is refused** (items too), so the player can use it after their
    VIP ends. The message gives both dates: "You have VIP4 until 30 Nov. This code gives VIP1 and works until 15 Dec.
    Use it after your VIP ends." (owner's pick: refuse);
  - a higher tier: only with the player's confirm (above); the old tier ends now. The use log keeps the old tier and
    its end.
  - The account's letter is set as Give VIP sets it (staff keep theirs).
- The items are written into the use, then sent as mail to the redeeming character (checked to be the account's, server 01, not deleted).

### What can go wrong, and what the player sees

| Case | Message | Used? |
|---|---|---|
| Bad format (not 4-32 letters/digits) | "Check the code: letters and numbers only." | no, no try counted |
| No such code | "This code doesn't exist." | no, 1 try |
| Too many wrong tries | "Too many tries. Try again in an hour." | no |
| Past its end time | "This code has expired." | no |
| Turned off by the owner | "This code is no longer active." | no |
| Cap reached / one-use key used | "This code has been fully claimed." / "This code was already used." | no |
| Already used by this account | "You already used this code." | no |
| Not on the list | "This code isn't for your account." | no |
| Lower VIP than the live one | (the two dates, above) | no |
| Not enough bag room | "Make room in your bag: this code needs 3 free slots (you have 1)." | no |
| Character not found | "Couldn't find your character. Log in again and retry." | no |
| Website session gone (12 h, restart) | a password row: "Type your password to use codes." | no |
| Codes off (no `vip`/`admin` section) | "Codes are not available right now." | no |
| Website not reachable, or no answer in 15 s | "Can't reach the code service. Try again in a minute." | no* |
| Website error | "Something went wrong. Nothing was used. Try again." | no |
| Mail writing failed after the use | success as usual; the VIP job sends it within 5 minutes | yes |

\* If the answer was lost after the website used the code, Redeem again sends the same request id and gets the first
answer back, never "already used". The request id is stored with the use in SQL (unique per account), not in the
session's in-memory `claimRequest`, which would answer 409 `repeat` instead.

Tries: 10 wrong codes an hour per account and 30 per address (in memory, like the login limits); "no such code" and
"not for your account" count. Redeems: at most 30 an hour per account.

### Delivery (mail)

- The site login (`flyffweb_site`) uses the code (ACCOUNT_DBF) and stores the use with its items. It cannot write mail.
- Right after, the same process writes the mails with the panel's login (`flyffweb_admin`), as the gift boxes are
  sent: one mail per item stack, title `Code reward #<use id>`, text naming the code's label and the 15-day limit,
  into server index 51, idempotent through a `WEB_CODE_SENT` table in CHARACTER_01_DBF (like `WEB_VIP_GIFT_SENT`), then
  the use is marked delivered.
- If that fails, the VIP job's new step retries the undelivered uses every 5 minutes. If the character was deleted in
  between, the gift boxes' rule picks the character (online, else most play time); with none, it waits.

### The panel (VIP tab, new view "Codes")

- **Make a code:** label; VIP (none, 1-4) and days (1-366); up to 6 item stacks (at least a VIP or an item) with the Send tab's item search and the gift box editor's stack-size checks (a mail with
  an item the server does not know, or a count over its stack size, is never delivered); kind (Everyone with optional cap / Only these accounts with a
  list, each checked to exist / One-use codes with how many, 1-500); code: random (default) or the owner's own word
  (Everyone and Only-these only); end date and time (required, at most a year ahead; typed and shown in the
  browser's local time like the rest of the panel, stored as UTC).
- Random codes: 16 characters from an alphabet without 0 O 1 I L, shown as `XXXX-XXXX-XXXX-XXXX`.
- **The list:** label, code (or "N one-use codes"), what it gives, uses (and cap), end time, state (on, off, expired,
  used up). Turn off / on, change the label or end time. No delete (turn off instead), no changing what it gives.
- **Codes are kept as they are** (not hashed), so the panel can show and copy them later, and one-use batches have
  "Copy unused" and "Download .txt". The panel is behind its own login and 2FA, and anyone with database access could
  give VIP directly anyway.
- **Uses:** per code: account, character, when, what it gave, old VIP replaced, delivered or waiting.
- Every change is in the Log tab (`runAudited`).

### Logs

One line per check and redeem: `code <address> <account> <code id or -> <result>`. Never the code text itself.

## Calls made without the owner (say if any is wrong)

- One-use codes and the owner's own word are both offered; codes are kept as they are, not hashed (panel above).
- A refused code is refused whole, items included.
- A higher-tier code asks the player to confirm before it ends their lower VIP.
- No delete and no editing what a code gives: turn it off instead.
- The game keeps its website session alive while in the world; the password row is for 12 h or a website restart.
- The try limits: 10 wrong codes an hour per account, 30 per address, 30 redeems an hour per account.

## Left to the builder

- Table and procedure names and shapes (suggested: `WEB_CODE`, `WEB_CODE_ITEM`, `WEB_CODE_KEY`, `WEB_CODE_ACCOUNT`,
  `WEB_CODE_USE` in ACCOUNT_DBF; `WEB_CODE_SENT` in CHARACTER_01_DBF), and grants per login as `vip.sql` does.
- Route names (suggested: `POST /api/codes/check`, `POST /api/codes/redeem`, both with session, Origin and CSRF checks
  like `/api/vip/requests`).
- How the game finds the code mails (the mail notice, then the mailbox list) and counts empty main-bag slots.
- The window's exact layout in V15's look, its icon in the Extras folder, the phone panel.
- Whether "Check" and "Redeem" share one route with a flag.

## Checks

- Quick (builder): vitest for the routes (every row of the table above, the limits, the request id retry), the SQL
  text, the panel actions, the window's states; typecheck.
- Owner (given as commands): Playwright Chromium desktop + phone for the window and the panel view; VM checks: an
  Everyone code, a one-use batch, an Only-these code, a lower-VIP refusal, a higher-VIP confirm, a full bag, items
  arriving in the bag within a minute, VIP after a relog.

## VPS

Code-only FlyffWeb update: `Update-FlyffWeb` runs `Install-Vip.ps1`, which makes the new tables. No exes, no convert.
