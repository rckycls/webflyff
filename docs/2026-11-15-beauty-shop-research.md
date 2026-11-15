# Beauty Shop (hair and face): research, 2026-11-15

What V15 does, from the outer repo's `Source\` and `Resource\`, what FlyffWeb had, and what was missing.
Build flags that matter: Neuz and World are built with `__MAINSERVER`, so `__NEWYEARDAY_EVENT_COUPON` and
`__Y_BEAUTY_SHOP_CHARGE` are on, and `__Y_HAIR_BUG_FIX` is **off** (it is only in the `__INTERNALSERVER` block,
`Neuz/VersionCommon.h:304`, `WORLDSERVER/VersionCommon.h:260`). `__Y_BEAUTY_SHOP_CHARGE` only changes Taiwan/HK, so the
normal paid path is used.

## 1. NPCs and menus

| NPC key | Name | Menu | Text | Where |
|---|---|---|---|---|
| `MaFl_HairShop` | Hair Designer | `MMI_BEAUTYSHOP` 13 | "Beauty Shop" (`TID_MMI_BEAUTY_SHOP`, 7013) | Flaris (`WdMadrigal.dyo`) |
| `MaFl_FaceOff` | Makeup Artist | `MMI_BEAUTYSHOP_SKIN` 42 | "Cosmetic Upgrades" (`TID_MMI_BEAUTYSHOP_SKIN`, 7042) | Flaris |

`Resource/character.inc:570-600`. Each NPC has one entry, so a click runs it at once (`soleEntry`).

`CWndWorld::OnCommand` (`_Interface/WndWorld.cpp:4619-4786`), in order:

- **Hair (`MMI_BEAUTYSHOP`)**: trade window open → `TID_GAME_TRADENOTBEAUTYSHOP`; repair window → `TID_GAME_REPAIR_NOACTION`;
  NPC shop → `TID_GAME_TRADENOTBEAUTYSHOP`; face window open → `TID_GAME_FACESHOPUSING`; hair window open →
  `TID_GAME_BEAUTYSHOPUSING`; Summon Angel open → `TID_GAME_SUMMONANGELUSING`; anything worn in `PARTS_HAT` (26) or
  `PARTS_CAP` (6) → `TID_GAME_NOTREADY_USESHOP`. Then the bag opens and the window opens beside it.
- **Face (`MMI_BEAUTYSHOP_SKIN`)**: trade, repair or NPC shop → `TID_GAME_TRADENOTFACESHOP`; hair window →
  `TID_GAME_BEAUTYSHOPUSING`; face window or Summon Angel → `TID_GAME_FACESHOPUSING`; hat or cap worn →
  `TID_GAME_NOTREADY_USESHOP`. Then the bag and the window.
- The coupon question at the NPC is commented out in V15 (`:4676-4689`, `:4760-4773`).

Other NPC entries refuse while a beauty window is open: Mailbox, Trade (face `TID_GAME_FACESHOPUSING`, hair
`TID_GAME_BEAUTYSHOPUSING`), Repair (face `TID_GAME_FACESHOPUSING`, hair `TID_GAME_REPAIR_TAKEBEAUTY`), Deposit (both
`TID_GAME_BEAUTYSHOPUSING`), Summon Angel (`TID_GAME_TRADENOTSUMMONANGEL`), and the Upgrade Specialist's piercing and
upgrade entries (silently). Using or wearing a hat or cap item while one is open says `TID_GAME_DONOTUSE_SHOP`
(`DPClient.cpp:9274-9282`, `:10241-10250`). Moving does not close them. A duel start closes them and the bag
(`WndDuelConfirm.cpp:150-175`).

## 2. Coupons

`II_SYS_SYS_SCR_HAIRCHANGE` 26410 (hair) and `II_SYS_SYS_SCR_FACEOFFFREE` 26411 (face), IK3_SCROLL, stack 99. They come
from couple rewards, `Exchange_Script.txt` and `propPackItem.inc`.

Using one (`SendDoUseItem`, `DPClient.cpp:10440-10458`) sends no DOUSEITEM. It opens `CWndUseCouponConfirm` (flag 0):
title "Use Coupon" (`TID_GAME_USE_CHANGE_COUPON`), text `TID_GAME_ASKUSE_COUPON1`. Yes opens the bag and the hair (or
face) window **anywhere, with no NPC and none of the checks above**, with the coupon on: the title gets
"  Using the Free Coupon." (`TID_GAME_NOWUSING_COUPON`) and every price shows 0. No or the close button does nothing.

## 3. Windows (`_Interface/WndShop.cpp:965-3093`, layouts `Resource/resdata.inc`)

Both windows: 464 x 464, one picture each (not tiled), opened beside the bag (left of it when the bag's left edge is
past half the window's width, else right).

**APP_BEAUTY_SHOP_EX "Hair Shop"** (`WndBeautyShop_EX.tga`, `resdata.inc:6125`):
- `WIDC_CUSTOM5` (28,54)-(180,174): the current look, still. `WIDC_CUSTOM6` (274,54)-(426,174): the chosen hair and
  colour, turning (`RotationY( g_tmCurrent / 1000 )`, one radian a second). Both: scale 4.5, lowered 5.6 (male) or 5.2
  (female), unlit, first frame of MTI_STAND2.
- `WIDC_CUSTOM1..4` (52,202)-(126,276), (144..218), (236..310), (326..400): four hair styles from `m_dwHairMesh` on
  (wrapping 1..10, `MAX_HAIR` 10), each a head close-up (viewport 72 x 72, scale 6, male (0.05,-8,-1), female (0,-7.5,-1))
  in the player's **current** colour. The chosen one gets a 0x60ffff00 cover. `WIDC_HAIRSTYLE_LEFT/RIGHT`
  (`ButtLeftH.tga`, `ButtRightH.tga`) move the row by one. A click on a box chooses that style.
- Colour bars `WIDC_CUSTOM_R/G/B` (44,294)-(164,310), (44,316)-(164,332), (44,336)-(164,352) (the bars are in the
  picture). The knob `yellowbuttten.tga` is drawn centred on x, top at the bar's top; when moved, a faded copy (alpha
  160) stays at the original place. Edits `WIDC_EDIT1..3` (198,292)-(227,308) etc. hold 0..255.
- Without `__Y_HAIR_BUG_FIX` a channel is 0.3..1.0: edit = `(int)((c - 0.3) / 0.7 * 255 + 0.5)`; typed value clamped to
  0..254, `c = n / 255 * 0.7 + 0.3`; a drag gives `c = 0.3 + p * 0.698` (p 0..1 across the bar, right end clamped).
- Prices (`WSS_MONEY`, with commas): `WIDC_STATIC1` style (336,288), `WIDC_STATIC2` colour (336,318), `WIDC_COST` total
  (336,348). Labels "Style Price :", "Color Price :", "Total :", "Hair Style" (60,182), "Hair Color" (78,366).
- Prices: style `HAIR_COST` **2,000,000** if the style differs; colour `HAIRCOLOR_COST` **4,000,000** if any channel's
  byte `(BYTE)(c * 255)` differs. With a coupon both are 0 (`Resource/defineNeuz.h:1131-1133`).
- Buttons: Reset `WIDC_BUTTON1` (reset.bmp, 22,390) back to the current look; OK `WIDC_OK` (ButOk2.bmp, 146,390);
  Cancel `WIDC_CANCEL` (ButCancel2.bmp, 242,390) closes.

**APP_BEAUTY_SHOP_SKIN "Plastic Surgery"** (`WndBeautyShopSkin_EX.tga`, `resdata.inc:6362`):
- `WIDC_CUSTOM5` / `WIDC_CUSTOM6` big models as above (CUSTOM6 at 272..424), CUSTOM6 with the chosen face, turning.
- "Friendly Face" row `WIDC_CUSTOM1..4` (54,214)-(128,288) ... faces 1..5 (`MAX_DEFAULT_HEAD` 5), arrows
  `WIDC_FRIENDSHIPFACE_LEFT/RIGHT`. "New Face" row `WIDC_CUSTOM7..10` (54,314)-(128,388) ... faces 6..11 (`MAX_HEAD` 11),
  arrows `WIDC_NEWFACE_LEFT/RIGHT`. Face close-ups: scale 7.5, male (0.05,-10,-1), female (0,-9.5,-1), 72 x 72.
  The current face's row starts at it.
- Price `CHANGE_FACE_COST` **1,000,000** when the chosen face differs (0 with a coupon). No price shown in the window.
- Reset `WIDC_BTN_RESET`, OK `WIDC_BTN_OK`, Cancel `WIDC_BTN_CANCEL` (y 398).

**OK** (both): no change and no coupon → the window closes. Coupon and a change → `CWndUseCouponConfirm` flag 1 ("Do you
want to use your Free Coupon now?" + "Once used, the coupon is gone forever." in red). A price → `CWndBeautyShopConfirm`
(APP_BEAUTY_SHOP_EX_CONFIRM, 288 x 128, tiled, title "Confirm Purchase", `WIDC_TEXT1` (10,12)-(270,64), Yes (56,70),
No (152,70)): "Selected Change your Hair Price is 6,000,000 Penya. Do you want to change your hair?" (`%s %s %s %s %s %s`
of TID_GAME_SHOP_CHOICE, TID_GAME_CHANGE_HAIR / _FACE, TID_GAME_SHOP_COST, the number, TID_GAME_SHOP_PENYA,
TID_GAME_CHANGE_HAIR_QUESTION / _FACE_QUESTION). Yes sends and closes the window. **There is no client gold check.**

Before sending, a disguise (`HasBuffByIk3( IK3_TEXT_DISGUISE )`) says `TID_GAME_ERROR_BEAUTYSHOP_DISGUISE` and sends
nothing; the window still closes.

## 4. Packets

| Direction | Name | Id | Body |
|---|---|---|---|
| C → S | `PACKETTYPE_SET_HAIR` | 0x00ff00af | `BYTE hair` (0-based) `BYTE r g b` (`(BYTE)(c * 255)`) `BOOL useCoupon` (4 bytes) |
| C → S | `PACKETTYPE_CHANGEFACE` | 0x00ff00ee | `u_long idPlayer` `DWORD face` (0-based) `int cost` `BOOL useCoupon` |
| S → C | `SNAPSHOTTYPE_SET_HAIR` | 0x0048 | on the player's object: `BYTE hair r g b`; to everyone in range |
| S → C | `SNAPSHOTTYPE_CHANGEFACE` | 0x004d | on NULL_ID: `u_long idPlayer` `DWORD face`; to every player on the server |

Server (`WORLDSERVER/DPSrvr.cpp:2214-2263`, `:2608-2663`):
- Hair: price from `CMover::GetHairCost` (`_Common/Mover.cpp:639-660`, same rule as the window). No coupon: gold <
  price → `TID_GAME_LACKMONEY`, else gold taken. Coupon: one 26410 used (`UI_NUM`), none → `TID_GAME_WARNNING_COUPON`.
  Then `SetHair`, `SetHairColor` (each channel < 0.3 raised to 0.3; pure white means the style's default colour) and
  SET_HAIR to the player and those near.
- Face: the client's cost is ignored (`cost = CHANGE_FACE_COST`). Gold or coupon 26411 as above. `SetHead( face )`
  (only below 11), then CHANGEFACE to all.
- No answer besides these (and the gold/bag updates). Neuz's `OnSetHair` / `OnChangeFace` re-dress the mover and the
  bag's model; no message.

Server notes (V15 as is, no change made): neither handler checks an NPC is near, nor the hair/face index (an out-of-range
one is still charged), and CHANGEFACE is broadcast with the client's `idPlayer`. Not needed for this feature.

## 5. FlyffWeb before this branch

- Had: CHANGEFACE reader (`readChangeFace`) and its use (`WorldScreen.changeLook`, from the sex/face scroll work); ADD_OBJ
  hair mesh, hair colour, head mesh; `looks.ts` dressing with V15's white-hair rule; `renderPreview` / `drawPicture`
  for window pictures; `ResWindow` for resdata layouts; the NPCs and their menus in the data.
- Missing: the two windows, the confirm and coupon boxes, `encodeSetHair` / `encodeChangeFace`, the SET_HAIR reader,
  the menu entries (greyed), the coupon use (26410/26411 were listed as "window the browser lacks"), the refusals in the
  other NPC entries, and the five pictures `WndBeautyShop_EX.tga`, `WndBeautyShopSkin_EX.tga`, `ButtLeftH.tga`,
  `ButtRightH.tga`, `yellowbuttten.tga` (not converted).

## 6. Decisions

None needed: everything is copied from V15. Not copied: the duel-start close (the duel is on the unmerged `social`
branch); Taiwan/HK rules.
