# Item windows and the upgrade cursor: V15 research (2026-11-05)

The items the premium research (`2026-11-05-buffs-premium-research.md`) left out, read from Neuz and the world server
at V15. Paths are under `Source/`. Built so far: the upgrade cursor (§1), the quick boxes (§2), the element stones'
timers and the cool-down sweep, then the windows of §3 (rulings in §5). What is left is §4, with what each needs.

## 1. The upgrade cursor (built)

- **Start:** a double-click in the bag on IK3_ELECARD 37, IK3_ENCHANT 119 (Sunstone 2035/2082, the Ultimate gem 2034),
  IK3_PIERDICE 61 (Moonstone 2036/2083, the dice), IK3_SOCKETCARD 62/63, IK3_RANDOM_SCROLL 101, or `dwExeTarget` EXT_ITEM
  21 (the awakening, blessedness, level-down and awake-cancel scrolls) (`_Interface/WndField.cpp:2351-2398`). Effect
  XI_INT_INCHANT 1716 on the player; TID_MMI_NOTUPGRADE during a wait.
- **Target:** the next bag item (`CWndItemCtrl::OnLButtonDown`, `WndItemCtrl.cpp:723-922`); first the smelt safety box
  (TID_GAME_SMELT_SAFETY_CONFIRM_NORMAL / _HIGHEST / _ACCESSARY, from +3 without SMELPROT / 3 / 4 on), then RunUpgrade
  (`WndField.cpp:13284-13572`): the mode ends; refusals TID_GAME_NOTEQUALITEM, TID_PIERCING_POSSIBLE_ITEM,
  TID_PIERCING_ERROR_NOPIERCING, TID_UPGRADE_ERROR_TWOELEMENT, TID_UPGRADE_ERROR_WRONGUPLEVEL (only FLAME, RIVER,
  GENERATOR, DESERT, CYCLON are taken), TID_GAME_RANDOMSCROLL_ERROR.
- **4 s later** (`CWndInventory::Process`, `WndField.cpp:1664-1745`): ENCHANT 0xf000b024 (target, material), PIERCING
  0xf000b025 (target, card), RANDOMSCROLL 0xf000d00d (target, scroll; after TID_GAME_RANDOMSCROLL_CONFIRM(1)),
  DO_USE_ITEM_TARGET 0x70000004 (material, target), ULTIMATE_ENCHANTWEAPON 0xf000f113 (weapon, gem).
- **Ends:** a right click on the bag, the player moving (`WndWorld.cpp:8050-8097`), the bag closing, a world change, a
  refusal. A cancel ends the mode only, not a wait already begun (`BaseMouseCursor`, `WndField.cpp:13574-13583`).
- **Answers:** UPDATE_ITEM UI_AO, UI_RAO, UI_IR, UI_PIERCING(_SIZE), UI_RANDOMOPTITEMID (the low byte, `SetRandomOpt`),
  UI_NUM; UPDATE_ITEM_EX; DEFINEDTEXT(1); PLAYSOUND; CREATESFXOBJ; ULTIMATE 0x0100 (`BYTE state, int result`).
- **Left out:** the hammer cursor and the `Icon_ImgIncAni` frames (not converted: a crosshair and a CSS pulse here).

## 2. The quick boxes (built)

- Batteries 26453 (TID_GAME_BETTERY_DESC) and 26454, 26455, 26560 (TID_GAME_CACHE_BETTERY_DESC): CWndCommItemDlg, OK
  sends DOUSEITEM whose second field is the battery's own item id (`DPClient.cpp:10652-10662`).
- The Funny Coin, IK2_TOCASH: CWndFunnyCoinConfirm TID_GAME_FUNNYCOIN_ASKUSE "%s", YES sends DOUSEITEM with NULL_ID.
- Awakening Protection 26961: `CheckConfirm`'s box TID_GAME_REGARDLESS_USE01, OK sends DOUSEITEM naming the player.
- The maps 4801, 4802: the bag's double-click toggles the world map (`CWndMap`, `WndMap.cpp:41-53`) and DOUSEITEM goes too.

## 3. Small to medium windows (built: the message box's prompts, `items/itemWindowFlows.ts`)

| Item | Window | Packet | Server answer |
|---|---|---|---|
| Name change 10424 | APP_CHANGENAME: an edit box; 4-16 bytes, no leading digit, letters and digits, the InvalidName list | QUERYSETPLAYERNAME 0x00000012: DWORD MAKELONG(objid, 0), string | top-level packet 0x12 to every client: u_long idPlayer, string; or DEFINEDTEXT TID_DIAG_0034 |
| Party summon 26202 | APP_SUMMON_PARTY (leader only, TID_GAME_TROUPECREATE otherwise) | SUMMON_PARTY 0xf000e003: DWORD dwData | SUMMON 0x00ed to members (BYTE 0x10, OBJID leader, DWORD, string world); a member double-clicks the buff, APP_SUMMON_PARTY_USE, SUMMON_PARTY_CONFIRM 0xf000e004 (OBJID, DWORD) |
| Tickets IK3_TICKET 26529, 26530, 26558 (Kebaras), 26681, 26682 (CIsland) | in its world: the box TID_GAME_TICKET_DESC; elsewhere APP_SELECT_CHANNEL with nExpand + 1 rows (`ticket.inc`, `layer.inc`) | DO_USE_ITEM_INPUT 0x8FFFFF00: DWORD MAKELONG(0, objid), string "0" / "-row" | REPLACE to the world; UI_KEEPTIME |
| Sex change 10220 | APP_CHANGESEX: the other sex's model, faces 0-4 | DOUSEITEM with nPart = the face | SEX_CHANGE 0x00dc (u_short MI_MALE/MI_FEMALE), CHANGEFACE 0x004d (u_long idPlayer, DWORD face) |
| Attribute change 20037 | APP_CHANGE_ATTRIBUTE: a weapon with an element, one of 5 elements | CHANGE_ATTRIBUTE 0xf000d00e: OBJID target, OBJID scroll, int attr | UPDATE_ITEM UI_IR, sound, sfx |
| Item transmute 26204 / 26218 | APP_ITEM_TRANSY: an unequipped armour piece; its twin by `GetTransyItem` (`Mover.cpp:2971-3020`, needs the sets) | ITEMTRANSY 0xf000d00c: OBJID target, OBJID scroll, DWORD newItemId, BOOL 1 | remove and create item, a text, sound, sfx |
| Monster summon IK3_CREATE_MONSTER | a cursor (XI_CHR_CURSOR1); a click within 15 m in Madrigal, not in a safe area | CREATEMONSTER 0x0000002a: DWORD MAKELONG(0, objid), vec3 | TID_GAME_CREATEMON_S / _LIMIT |
| Friend summon 26201 / 26217 | DOUSEITEM, then SUMMON (0x00) opens APP_SUMMON_FRIEND: a friend's name | SUMMON_FRIEND 0xf000e001: DWORD, string; the friend's CONFIRM 0xf000e002 / CANCEL 0xf000e005 | SUMMON (0x01) to the friend; the move |

## 4. Whole systems (not built)

- **Custody 15083, the bank:** OPENBANKWND 0xffffff40, the password windows (CONFIRMBANK 0xffffff48, CHANGEBANKPASS
  0xffffff47), the bank's three 42-slot grids and gold, PUT/GETITEMBACK, PUT/GETGOLDBACK, PUTBACKTOBANK, CLOSEBANKWND;
  answers BANKWINDOW 0x56, CHANGEBANKPASS 0x57, CONFIRMBANKPASS 0x58, PUTITEMBANK 0x50, GETITEMBANK 0x51, PUTGOLDBANK
  0x52, UPDATE_BANKITEM 0x54, BANKISFULL 0x55. The contents come in the own ADD_OBJ already.
- **Hair 26410 and face 26411 coupons, the beauty shop:** CWndBeautyShop / CWndFaceShop with 3D previews; SET_HAIR
  0x00ff00af (BYTE hair, r, g, b, BOOL coupon), CHANGEFACE 0x00ff00ee; answers SET_HAIR 0x48, CHANGEFACE 0x4d.
- **The character seal 26475 / 26476:** SEALCHAR_REQ, SEALCHARCONM_REQ, SEALCHARGET_REQ; the server kicks the player.
- **Pets:** the pet in the item data, PET_CALL 0x110 .. PET_MILL 0x117, the pet status window, `pet.inc`; the pet items
  (naming, tamer's scrolls, hatch, life, food, mill) need an active pet.
- **Guild name 10463:** needs a guild. **Housing:** needs the housing rooms.
- **Class change 10425:** the server's handler is commented out (`CDPSrvr::OnChangeJob`, `WORLDSERVER/DPSrvr.cpp:2480-2560`),
  so it does nothing on this server.

## 5. Rulings of the windows' round

> Superseded on 2026-11-05 by `2026-11-05-ui-fixes-research.md` §2-§3: each window is now Neuz's own window, the
> sex change has its 3D preview, and items go in by a drop or a click.

- The windows are the message box with a text field or a row of choices (`MessageBox.prompt`), not Neuz's own window
  pictures; the sex change has no 3D preview (faces 1 to 5), the transmute shows "piece → twin" in a box.
- The element change and the transmute take their item from the bag the way the upgrade cursor does (a click on it),
  where Neuz drops the item into the window.
- The name change's InvalidName list is not converted; the database still refuses a name in use (TID_DIAG_0034).
- The monster summon's cursor effect is a crosshair over the world and a line saying where to click; the safe regions are
  the server's to refuse (the browser has no region data).
- World titles for the party summon's box: Madrigal, Azria, Coral Island (World.inc's titles are not converted).
