# View Equipment and the game options (2026-11-17)

Owner's request: "lets create the view equipment window and option. Also if we can make the other necessary options to set
like reject messenger and view equipment etc".

## What V15 has

### View Equipment (`CWndQueryEquip`, APP_QUERYEQUIP)

- **Opened from:** the player menu's "View equipment" (MMI_QUERYEQUIP 24, `WndWorld.cpp:5248-5255`, :6612). A seller's
  menu has only this line (:6544-6547).
- **Packets:**
  - The client sends QUERYEQUIP 0xf000d009 with the player's object ID (`DPClient.cpp:15690`).
  - The World server (`DPSrvr.cpp:4917-4937`) answers with TID_DIAG_0088, "Permission to view equipment denied.", when
    the player has EQUIP_DENIAL_MODE and the asker is not a GM.
  - Otherwise it sends snapshot QUERYEQUIP 0x00ac (`User.cpp:2860-2891`): per worn part the awakening, the piercing,
    the element and its upgrade.
  - The item ids, flags and upgrades come from ADD_OBJ's `m_aEquipInfo`.
- **The window** (`WndField.cpp:511-969`, resdata.inc:24102):
  - "WndQueryEquip.tga", 236 x 284, titled "View" (no name or level), centred.
  - The bag's 19 slots, and the model in WIDC_CUSTOM20 (54,32-174,206), turnable with the mouse.
  - Item tooltips as APP_QUERYEQUIP: the shown player judges the colours, its own set pieces count, its set +N shows.
  - It closes when the player leaves view (no distance check in V15).

### The Option window's Game / Audio tab (`CWndOptionGame`, APP_OPTEX_GAME12)

| Option | Kept where | What it does |
|---|---|---|
| Trading Allow/Refuse | `g_Option.m_bTrade`, neuz.ini | Refuse: a trade request gets BLOCK 3 (`DPClient.cpp:2508`); /ta /tr |
| Whispers & Messages | `m_bSay` | Refuse: whispers and /say get BLOCK 1; /wa /wr (already in FlyffWeb) |
| Friend Invites | `m_bMessenger` | Refuse: friend requests get BLOCK 2; /ma /mr (already in FlyffWeb) |
| Duel Requests ON/OFF | server: PVPCONFIRM_MODE in `m_dwMode` (saved in the DB) | sent as MODE 0xffffff7b (PVPCONFIRM_MODE, 3 on / 2 off); the server answers duel requests TID_PK_MODE_REJECT |
| Party Invites | `m_bParty` | Refuse: an invite gets PARTYMEMBERCANCEL mode 3 (`DPClient.cpp:4526`); /ga /gr |
| Automatic Attack | `m_bAutoAttack` | Off: a skill or a second click on the target does not start the auto-attack (a double click still does) |
| Allow Inventory View | server: EQUIP_DENIAL_MODE in `m_dwMode` (saved in the DB) | sent as QUERYEQUIPSETTING 0xf000d00a (BOOL) |
| Message Alarm | `m_bMessengerJoin` | a friend's log-in notice; /ca /cr (already in FlyffWeb) |
| Help Option: Beginner Guide, Info Pang | `m_nInstantHelp`, `m_pGuide` | the instant help lines and the guide character |
| Window Effects: Translucency | `m_nWindowAlpha` 128/255 | window pictures at alpha 128 |
| Sound Option: BGM, Sound Effect | volumes | already in FlyffWeb |
| Battle Music | `m_bBattleBGM` (off by default) | a battle track plays when the own player attacks (`MoverMove.cpp:31-61`) |

- "Automatic P.K Mode" is hidden in V15 (`__CSC_VER9_REMOVE_PKSETTING`). Shout has no control in this tab.
- The Video tab (field detail, shadows, gamma, ...) is graphics only.
- **No server change is needed:** the V15 World server handles QUERYEQUIP, QUERYEQUIPSETTING and MODE already.

## What FlyffWeb now does

- **View equipment** in the player menu is enabled; it sends QUERYEQUIP.
  - The answer opens `hud/queryEquipWindow.ts`, with V15's picture, slots, icon sizes, expired tint, two-handed fade,
    model picture and tooltips. Desktop: the mouse over a slot. Phone: a tap, with a close button.
  - A refusal shows TID_DIAG_0088 in the chat.
- **The Option window** (`hud/optionWindow.ts`) is now V15's two-tab window, with the whole Game / Audio page.
  - The phone shows the same controls in four columns.
  - The browser options (Trading, Party Invites, Automatic Attack, Translucency, Battle Music) are kept in
    `localStorage['flyffweb.gameOptions']`.
  - The three friend options stay in `flyffweb.friendOptions`.
  - Duel Requests and Allow Inventory View are sent to the World server and shown from the own `m_dwMode`.
- **Chat commands:** /ta /tr /ga /gr now work too.

## Left out

- **Video tab:** shown greyed; FlyffWeb's renderer has its own settings.
- **Beginner Guide and Info Pang:** shown greyed. FlyffWeb has no instant help (and InstantHelp.inc is not in our
  Resource) and no guide system.
- **The model does not turn with the mouse.** It is drawn once, as the bag's is.

## Convert on main after a merge

`npm run convert -- --only "WndQueryEquip*"` (without it the View window has no background picture).
