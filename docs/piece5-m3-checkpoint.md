# Piece 5 milestone 3 — talking checkpoint

Implemented; owner acceptance pending. Milestones 1 and 2 are accepted. Continue using the Piece 5 worktree on the PC with the existing Hyper-V gateway proxy. No C++ server change or VM deployment was performed.

Nearby, whisper and shout use native CHAT command routing. The session-local transcript keeps the latest 150 lines, labels channels/senders, displays server refusals, and safely renders text. Enter or the Chat button opens the composer; Escape closes it. Typing releases held controls and does not activate movement, camera or taskbar hotkeys. Unsupported text characters produce a visible error rather than silent replacement.

Tapping a peaceful NPC selects it and opens its supported Talk/Shop menu. Dialogue uses SCRIPTDLG/RUNSCRIPTFUNC; native replies are addressed to the receiving player and applied only to an active, requested dialogue. Dialogue and shops close when their NPC disappears or leaves the native 32-metre interaction range. Quest progression and special-currency vendors remain outside this milestone.

Shops load all four native stock containers. Select stock to buy, or an unequipped bag item to sell, then choose a quantity. Inventory and penya change only on server updates. Prices shown are base estimates; server event rates, taxes and upgraded-item values can differ. Empty positions, full bags, changed stock/items, quantities and server refusals are handled without local item or money prediction. Closing a shop sends CLOSESHOPWND.

## Checks already run

- 167 focused protocol, session, NPC, shop, chat and converter tests passed across eight files; repository typecheck passed.
- The talking browser flow in installed Chrome, desktop and landscape phone: input isolation, all three channels, whisper refusal, native dialogue reply routing, confirmed buy/sell mutations and closing after NPC removal.
- A final phone check asserts the shop, quantity controls and feedback fit inside the viewport. Inventory-space validation also covers native empty positions whose indexes are retained.
- Data-only conversion completed with 12 outputs, 82 existing asset warnings and no failures. Include the refreshed asset index and NPC/item catalogs if distributing a built client.

## Owner checks

Run from `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece5-items-chat` on the PC:

```powershell
npm test
npm run typecheck
```

Allow a few minutes; pass means zero failed tests and a successful typecheck. For the normal browser setup, run `npm run test:e2e:client -- talking`. If port 5174 is already running or Playwright's bundled browser is unavailable, the local verification configuration uses installed Chrome on port 5175:

```powershell
npx playwright test -c .superpowers/sdd/2026-10-29-piece5-m3-talking/playwright.config.ts talking.spec.ts --workers=1
```

This focused browser flow typically takes one to two minutes. Pass means both desktop and phone tests pass. If it fails, send the failed assertion and its `test-results` screenshot/error context.

On the existing VM and actual devices:

- Provision two online accounts. Use a character of at least level 20 for successful English-server shouts, plus a lower-level character to check the shout refusal. Supply about 100,000 penya, spare unequipped starter equipment, food, and free bag positions through the existing GM/database setup.
- Stand together in Flaris. Check nearby chat in both directions, then whispers by character name. Check a missing name and self-whisper refusal. Check shout delivery and the low-level refusal. While typing W/A/S/D, arrows, Space, I and F keys, the character and camera must stay still and game hotkeys must not fire. Close the composer and confirm normal controls return.
- Speak to starting-area NPCs. Check returned text and ordinary dialogue choices, close/reopen, move beyond interaction range, and select a different NPC. Selecting or holding a peaceful NPC must never start melee combat. Quest-related choices may be unavailable here.
- Open Luda's equipment shop and Losha's food shop. Check tabs, quantity limits, buy one item and a stack, then sell spare unequipped items. Verify exact inventory and penya against the server, including insufficient funds, a full bag, rejected items and any taxes/event pricing. Reconnect to confirm persistence. Equipped items must not appear as sale candidates.
- Repeat on desktop and a landscape phone. Verify shop controls and feedback remain visible, lists can scroll, dialogue buttons are usable, and the mobile keyboard does not trigger game actions. iPhone/iPad checks remain manual.

Milestone 4 travel/minimap has not started.


## Classic chat update — 2026-10-31

The chat now uses a translucent transcript, classic peach controls and pale composer, with Chat, Whisper, Shout, Party, Guild, System and Announcement views. Chat includes all retained messages; System includes GM messages, ordinary system feedback and announcements. The Announcement view selects event notices using their native event-text identifiers, plus native TEXT notices. NPC movers and separate NPC dialogue replies are excluded. Party and guild messages use native receive handlers and /partychat and /GuildChat commands. The server still controls membership and delivery.

Drag the rail background or dotted grip to move the panel; Lock prevents dragging. Filter is visible and disabled pending specified behavior. The minus control minimizes the panel.

Verification: 71 focused chat/protocol/session tests passed; client and protocol-test TypeScript checks passed. The talking browser flow passed on desktop and landscape phone. An initial phone run was interrupted by a Vite reload during editing; the clean phone rerun passed. Actual GM/event delivery and party/guild membership should be checked against the owner's live server.

## Mobile chat refinement — 2026-10-31

Mobile chat controls and transcript heights are halved. The transcript remains visible with the composer closed or minimized, has no idle background, fades at its top, and supports vertical scrolling; hovering reveals the background. The composer sits directly under the tab rail, and chat is anchored against the measured taskbar height without a bottom gap.

The channel selector and separate recipient field are removed on both layouts. Tabs filter received messages; users type native slash commands in the message field. Research: Source/_Interface/FuncTextCmd.cpp registers /s and /shout, /w and /whisper, /p and /partychat, and /g and /GuildChat. The server-side handlers consume the recipient and message, so typed commands pass unchanged through CHAT rather than being rewritten by the browser.

Verification: seven focused chat/protocol tests and the client TypeScript check passed. The updated talking browser flow passed on desktop and landscape phone, exercising /w and /s. The phone screenshot was visually checked for reduced heights, transparent transcript, top fade, and contiguous controls.

## Fixed chat controls — 2026-10-31

Compact control sizing now applies on both desktop and mobile: message input and Send are 17px high, all tab/control buttons are 14px high, and rail/composer padding is reduced. Chat uses fixed screen positioning with the taskbar's measured left edge, rendered width, height and bottom inset. It stays flush above the taskbar across resizing. Fixed positioning supersedes dragging; Lock is shown as locked and disabled.

On mobile, opening Chat or switching tabs reveals the composer without focusing its message field. Tapping the field opens the keyboard. Submitting blurs the field and Send button, including validation failures, and never refocuses the input. Escape blurs without removing the composer.

Verification: four chat tests and client typecheck passed. Desktop and landscape-phone talking browser flows passed, including assertions for exact taskbar edge alignment, compact heights, mobile tab opening without input focus, and loss of input focus after sending. Actual device keyboard animation remains a manual device check.

## Nearby speech bubbles — 2026-10-31

Server-echoed nearby player messages now show a pale speech bubble with a pointer above the sender's name, including the local player. Text wraps within a bounded six-line box. New messages replace the same speaker's prior bubble. Bubbles follow the rendered character head, fade during the final second of a five-second lifetime, and release their sprite/material/texture on expiry, mover removal or screen disposal. Invisible players are excluded through the existing name-tag visibility rules. Whisper, shout, party, guild, system and NPC-dialogue messages do not create these nearby bubbles.

Native reference: Source/_Common/DialogMsg.cpp sets the message timer to 5000ms; Source/Neuz/DPClient.cpp handles CHAT with its sender object ID. The browser waits for that authoritative echo rather than adding a bubble optimistically on Send.

Verification: five focused speech-bubble/chat tests and the client TypeScript check passed. The desktop and landscape-phone talking browser run completed with status passed and no failed tests. Both chat screenshots were visually inspected and showed the nearby speech bubble above the player.

## Classic shop and paired inventory — 2026-10-31

The NPC shop now uses a six-column icon grid, classic frame and blue centered caption, Awaken/search/price footer, quantity and Buy/Sell controls. Item-name search works. Level, gender and awakening filters remain visibly unavailable because those fields are not present in the decoded NPC stock/catalog. Native stock tabs remain accessible when later containers contain items; an unused tab rail is hidden for first-container-only vendors. Base price display follows selection and survives authoritative refreshes.

Opening a shop always opens/refreshes inventory and its character preview. Desktop uses two vertical panels aligned at their top on the right. Mobile uses shop on the left and horizontal equipment/bag inventory on the right, fitted above the taskbar. Closing inventory closes the shop; closing the shop leaves inventory available. A bag click selects an item to sell through the shop. Equipped/empty cells cannot sell a previously selected item, and equipment double-click actions are blocked while shopping. Native buy/sell validation and authoritative inventory/penya updates are retained.

Verification: 11 focused shop/inventory tests and client TypeScript checks passed. The updated talking browser flow passed on desktop and landscape phone, including automatic inventory opening, non-overlap, matching top alignment, buying and selling through inventory, authoritative counts/money, and controls inside the phone shop bounds. Desktop and mobile screenshots were visually checked. The phone flow was rerun after fixing the mobile frame and expanding the item-grid space; it passed. Subsequent stock-tab reachability and refreshed-price corrections passed their added focused regression test.

## Resource tabs, normal Bag reuse and NPC context menu — 2026-10-31

This revision supersedes the earlier resized mobile inventory pairing and Search/placeholder filter footer. Mobile now keeps the existing Bag element, normal dimensions, artwork, title and internal layout. The shop alone takes the remaining space beside it; the inventory publishes its normal measured width for that placement. Desktop retains paired vertical panels.

Shop tabs use the selected NPC's resource-derived vendorTabs (character.inc AddVendorSlot entries), matching CWndShop::OnInitialUpdate in Source/_Interface/WndShop.cpp. The named tab strip sits below the item grid; the numeric top tabs, Awaken placeholders, Search and level/gender filter controls are removed. Existing native containers and tab indexes remain authoritative. Labels verified against Luda's converted resources: Weapons, Armors, Shields and a blank slot.

Tab and edit controls use the existing WndTabTile and WndEditTile assets. Buy/Sell buttons reproduce the default CTheme::RenderWndButton frame, gradient, text shadow and pressed colours from Source/_Interface/ITheme.cpp. Number-input browser spinners are removed.

NPC interaction now renders as a compact white context menu beside the NPC's projected head, following camera/mover changes and clamped within the viewport. The full NPC caption/frame is hidden. Available choices come from the NPC AddMenu entries, with labels resolved from native TID_MMI_DIALOG + menu ID (as WndWorld.cpp does). Dialog and Trade retain their native request paths; unsupported actions remain disabled. Script replies/choices stay scoped to the active NPC interaction. Outside press, Escape, range loss and removal dismiss the menu.

Verification: 14 focused shop/inventory/NPC tests passed, and client typecheck passed. Desktop and landscape-phone talking browser flows passed, covering resource labels, compact NPC menu, named tabs below the grid, removed Search, classic skin background states, automatic inventory opening, normal-versus-paired mobile Bag dimension equality, and server-confirmed buying/selling. Desktop and phone shop/NPC screenshots were visually inspected after the final skin correction.

### 2026-10-31 — Preserve Bag layout and shop hover details

- Shop opens beside the existing Bag on desktop and mobile; opening the shop preserves the Bag's normal size and position.
- Shop stock uses the shared Inventory item-details formatter for desktop hover and keyboard focus. Cards are removed on leave, blur, close, and disposal.
- Removed descriptions below the shop buttons and the duplicate shop balance. Validation errors remain above the controls and are hidden when empty.
- Verified: client TypeScript check; 13 focused shop/inventory tests; desktop and phone Playwright talking/shop flows (2 passed). Reviewed desktop hover and mobile shop screenshots.

### 2026-10-31 — Classic mobile Character and Skill Tree windows

- Mobile Character now follows the supplied wide reference: Base and Detail on the left, stat allocation and Apply/Reset on the right, with native Character/Fame-Master tabs below.
- Mobile Skill Tree uses three side-by-side native panels, a top Skill Point/+/- row, and native Reset/Finish buttons. Existing skill selection, spending, digits and tooltips remain connected.
- Both layouts scale as complete windows within the available area above the taskbar. Mobile shortcuts and movement controls hide while these windows are open to prevent covering their controls. Desktop layouts remain unchanged.
- Verified: client TypeScript check; all 107 HUD tests; desktop and phone stat/skill allocation browser flows (4 passed). Reviewed final mobile screenshots for both windows.

### 2026-10-31 — Close shop while walking; desktop chat width

- Shop closes through its normal close handler as soon as the player's position changes horizontally during simulation, covering keyboard, joystick, and destination walking. The existing Bag stays open.
- Desktop chat now takes half the taskbar width; compact touch layouts retain the full taskbar width.
- Verified: client TypeScript check and desktop/phone talking browser flows (2 passed), including actual movement, one close packet, Bag retention, shop reopening, NPC removal closure, and platform-specific chat widths.

### 2026-10-31 — Compact mobile chat and taskbar reference

- Mobile composer and channel controls share one row: blank message input, paper-plane Send, channel icons, and lock/filter/minimize icons. Accessible button names and existing channel behavior are retained; desktop keeps text buttons.
- Removed the message placeholder on all devices.
- Mobile taskbar removes the empty applet region, placing F1–F9 directly after Start, followed by the page arrows and action slots. Native taskbar art is sliced to match the compact layout; actual slot coordinates and touch-menu sizing use the new 620px layout.
- Verified: 111 chat/HUD tests, client TypeScript check, desktop and mobile talking/shop flows (2 passed), and an additional phone pass asserting native background alignment. Visually reviewed the cropped mobile taskbar against the reference.

### 2026-10-31 — Center mobile windows and stabilize chat while typing

- Character and Skill Tree open centered within the available HUD area above the taskbar, using their fitted dimensions. Desktop launch positions are preserved.
- Reproduced the chat shift in the browser: keyboard/compatibility mouse input changed the transient touch mode, causing the phone taskbar to switch to desktop dimensions. Compact taskbar selection now retains the phone layout for coarse-pointer devices.
- Mobile chat is anchored within the same HUD layer as the taskbar, including its safe-area offset.
- Verified: 112 chat/HUD tests and client TypeScript check; mobile stat/skill flows assert horizontal and vertical centering. Mobile talking/shop flow passes with stable input bounds before focus and after sending, plus attachment to the taskbar during simulated keyboard viewport resizing.
