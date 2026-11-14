# Red Chip merchant: research (2026-11-15)

Owner: "make red chips merchant work". Paths below: `Source/` and `Resource/` are the outer V15 repo.

## V15

**The NPC.** One chip shop in V15: `MaFl_Waforu`, "[Red Chip Merchant]Wafor", Flarine (placed in
`Client/World/WdMadrigal/WdMadrigal.dyo`). `Resource/character.inc:6383-6440`: `AddMenu( MMI_DIALOG )`,
`AddMenu( MMI_TRADE )`, `SetVenderType(1)`, sixteen `AddVenderItem2( tab, II_SYS_SYS_SCR_BX*120SET )` (four tabs:
Mercenary, Assist, Acrobat, Magician; `AddVendorSlot` names them). No other NPC has `SetVenderType`: there is no other
chip or item-currency shop.

**The data.** `Project.cpp:2947` sets `m_nVenderType = 0` for each NPC; `:3164-3179` read `AddVenderItem2` into
`m_venderItemAry2` and `SetVenderType`. The price is the item's `dwReferValue1`: `CItemBase::GetChipCost`
(`Item.cpp:147-158`), -1 for `=`. Each 120 set box is 10000 chips (`propItem.txt` column 96). The Red Chip is
`II_CHP_RED` 26460 (`defineItem.h:4888`), packMax 9999.

**The stock.** The server fills a chip vendor's shop from `m_venderItemAry2`, a full stack (`dwPackMax`) of each, and skips
an item whose chip cost is below 1 (`CMover::ProcessRegenItem`, `Mover.cpp:1354-1374`). It is sent like any shop
(OPENSHOPWND).

**The window.** The same `CWndShop`. With vendor type 1:
- the price box shows `GetChipCost()` (`CWndShop::OnDraw`, `WndShop.cpp:722-736`);
- the item tooltip says `Price : 10,000 Red Chip` (`TID_GAME_TOOLTIP_COST2` + `" "` + `TID_GAME_REDCHIP`;
  `CWndMgr::PutItemGold`, `WndManager.cpp:5679-5728`); the tax line is for penya vendors only (`:5733-5736`);
- the shop shows no chip count: the bag's Red Chip stack is the count.

**Buying.** Dragging to the bag needs at least one item's chips, else a message box `TID_GAME_CANNT_BY_REDCHIP`
(`WndField.cpp:1770-1782`). The buy box's OK needs `count * GetChipCost() <= GetAtItemNum( II_CHP_RED )`, else a message
box `TID_GAME_CANNTBUY_REDCHIP` "More Red Chips are needed." (`WndShop.cpp:561-576`). Then
`SendBuyChipItem( cTab, nId, nNum, dwItemId )` (`WndShop.cpp:649-650`, `DPClient.cpp:9770-9776`):
`PACKETTYPE_BUYCHIPITEM` 0x00ff00b6 (`MsgHdr.h:181`), the same body as BUYITEM (CHAR tab, BYTE id, short count, DWORD
item id).

**Selling.** Unchanged: the sell price is penya (`GetCost() / 4`, `WndManager.cpp:5750-5780`) and `OnSellItem` has no
vendor-type check (`DPSrvr.cpp:12239-12260`).

**Server.** `CDPSrvr::OnBuyChipItem` (`DPSrvr.cpp:12112-12240`, registered at `:226-228`), compiled in our build
(`__VER 15` in `WORLDSERVER/VersionCommon.h:4`; the code is `__VER >= 11`):
- refuses silently unless the vendor is type 1, an NPC, near (`IsCloseNpc( MMI_TRADE )`), and the item and id match;
- clamps the count to the stock's;
- fewer chips than `GetChipCost() * nNum` (bag total, `GetAtItemNum`) -> DEFINEDTEXT `TID_GAME_LACKCHIP`;
- a full bag -> `TID_GAME_LACKSPACE`, unless the chips paid free a slot (cost below 9999 and the first chip stack is
  used up; at 9999 or more it goes on, since a whole stack goes);
- removes the chips (in 0x7fff steps), creates the item, logs it.

`OnBuyItem` returns silently for any vendor whose type is not 0 (`DPSrvr.cpp:11988-11991`): the penya packet does nothing
at Waforu.

## FlyffWeb before this branch

- The NPC data was right: `npcs.json` has Waforu with `vendorType: 1` and his four tabs; the texts are converted.
- The menu greyed Trade for him on purpose (`moverMenu.ts:103`, `WorldScreen.chooseNpcEntry`'s `!data?.vendorType`),
  because the shop only sent BUYITEM, which the server ignores there.
- No BUYCHIPITEM encoder in `packages/protocol` (the gateway passes world packets as they are: no change there).
- No chip price in the data: `itemProps.json` has no `dwReferValue1`.

## What the branch changes

- Data: the propItem reader keeps `dwReferValue1`; the converter writes it as `WebItemProp.referValue1` where the row
  gives one (154 items; the client's `data.res` and the server's `Resource/propItem.txt` agree on 10000 per box).
- Packet: `encodeBuyChipItem` (0xff00b6), `WorldSession.sendBuyChipItem`. The gateway is unchanged.
- Client: `hud/chipShop.ts` holds the rules (`opensShop`, `isChipVendor`, `chipCost`, `chipsHeld`, `chipsFreeSlot`).
  The menu's Trade opens type 0 and type 1 vendors. At a chip vendor the shop window shows the chip price, its tooltip says
  "Price : 10,000 Red Chip", a buy needs count x price chips in the bag (else the message box "More Red Chips are
  needed.", TID_GAME_CANNTBUY_REDCHIP) and sends BUYCHIPITEM; no penya is needed. A full bag is refused unless the chips
  paid free a slot, as the server rules. The server's TID_GAME_LACKCHIP shows in the shop line and the chat. The phone uses
  the same window (tap tooltip, number pad); no CSS changed.
- Left as before: the shop's own penya rules (no shop buy/sell rate or tax), the drag-to-bag buy (FlyffWeb buys with the
  Buy button), the 99 cap of CWndConfirmBuy (FlyffWeb caps at the stack, 99 for these boxes).
