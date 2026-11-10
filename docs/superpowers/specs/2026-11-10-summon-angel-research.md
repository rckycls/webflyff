# Summon Angel: research (2026-11-10)

The owner asked: "research on v15 original client on how the summon angel works and implement it on the web".

Sources: the Neuz and server C++ in `Blouflash VS22 V15/Source` (CP949, read with `iconv -f cp949 -t utf-8`; line numbers
are of that text), the owner's `Resource` and `Client` folders, and the web (§10). The code wins where they disagree.
Longer notes: the shared notes folder's `summon-angel-research/A-server.md` (server) and `D-online.md` (web).

## 0. In one paragraph

Summon Angel is part of the **PK redemption** loop, not a reward. A chaotic player takes the "Confession" quest from the
**Priest of Confession** (`MaMa_PKNPC01`), opens "Summon Angel" in his menu, puts 3 to 20 Sunstones and Moonstones into the
**Angel Window**, and presses START: the server rolls a Red, Blue, Green or White **angel item**. Used on a PK server, the
angel becomes a buff: a small winged angel model that follows the player, sparkles, and takes **half of every EXP gain**
until it holds 100/60/30/10 % of a level's EXP. Then a press on its buff icon turns it into a "… Angel 100%" item, which the
priest takes with 1,000,000 penya to lower the PK value by 1 to 5.

## 1. Is it compiled on?

Yes.
- Neuz and WorldServer are `__VER 15` (`Source/Neuz/VersionCommon.h:4`, `Source/WORLDSERVER/VersionCommon.h:4`).
- Every Summon Angel block is `#if __VER >= 8 //__CSC_VER8_5` (e.g. `_Interface/WndSummonAngel.h:1`,
  `_Interface/WndWorld.cpp:4782`, `Neuz/DPClient.cpp:11278`), so it is on although the named define is commented out.
- `__PKSERVER_USE_ANGEL` is on in both (`Neuz/VersionCommon.h:55`, `WORLDSERVER/VersionCommon.h:68`).
- `__ANGEL_EXPERIENCE` is commented out (`WORLDSERVER/VersionCommon.h:181`), but the EXP code tests `#if __VER >= 14`
  (`_Common/MoverParam.cpp:1092`), so the V14 EXP path runs. `__ANGEL_NODIE` is off, but the death removal tests
  `#if __VER < 12`, so the angel **survives death** (A-server §3.6).

**The owner's server is not a PK server by the repo's config**: `Program/WorldServer.ini:13` is `//PK`
(`WorldServer.cpp:545-548` sets `EVE_PK` from it). There, summoning works (the stones are eaten, an angel item made) but
using the angel fails silently and an angel buff is removed at login (`DPDatabaseClient.cpp:981-984`). The VM's own ini
was not checked. The client does what Neuz does either way; §9 says what the owner sees.

## 2. How it opens

- Only from the NPC menu: `MMI_SUMMON_ANGEL` = 43 (`Resource/defineNeuz.h:136`), "Summon Angel" (`TID_MMI_SUMMON_ANGEL`
  7043). The NPC is `MaMa_PKNPC01`, "Priest of Confession", with `MMI_DIALOG` and `MMI_SUMMON_ANGEL`
  (`Resource/character.inc:5672-5690`), placed in WdMadrigal, WdVolcane and WdIvilisTemple. No item or Start-menu entry.
- `CWndWorld::OnCommand`, `case MMI_SUMMON_ANGEL` (`WndWorld.cpp:4783-4872`):
  - refused with `TID_GAME_TRADENOTSUMMONANGEL` ("You cannot summon an Angel while trading.", red) while any of these is
    open: APP_TRADE, APP_REPAIR, APP_SHOP_, APP_BEAUTY_SHOP_EX, APP_BEAUTY_SHOP_SKIN, APP_COMMON_BANK, APP_POST,
    APP_CONFIRM_BANK, APP_GUILD_BANK, APP_BANK_PASSWORD (:4785-4847);
  - refused with `TID_GAME_SUMMONANGELUSING` ("You have summoned an Angel.") when it is already open (:4848-4853);
  - else the bag opens (`CreateApplet( APP_INVENTORY )`, :4855), the window opens (APP_SUMMON_ANGEL 607) and its text is
    `Client/summonAngelQuest.inc` (:4861-4869).
- `OnInitialUpdate` (`WndSummonAngel.cpp:124-190`): the rate statics, the 20 slots, the texts (§3), the bag's die flag on
  (`SetDieFlag( TRUE )`: a stack shows its count less what the window holds), and the window placed beside the bag: to its
  left when the bag's left edge is past half the window's width, else to its right (:179-189).

## 3. The window (APP_SUMMON_ANGEL, `Resource/resdata.inc:4628-4945`)

"Angel Window" (IDS_RESDATA_INC_004060), 464 x 464, tiled `WndTile00.tga`. Controls (client rects):

| Control | Rect | What |
|---|---|---|
| WIDC_TEXT1 | 12,8 - 444,182 | `WndEditTile00.tga`, scrolling: summonAngelQuest.inc (#b #c codes) |
| WIDC_STATIC11..15 | 78/116/154/192/230, 198 (32 x 32) | Sunstone slots 0-4, `WndChgElemItem.bmp` |
| WIDC_STATIC16..20 | same x, 236 | Sunstone slots 5-9 |
| WIDC_STATIC21..25 | same x, 286 | Moonstone slots 10-14 |
| WIDC_STATIC26..30 | same x, 324 | Moonstone slots 15-19 |
| (drawn) | 30,218 and 30,306 | the Sunstone's and the Moonstone's icon (`OnDraw`, :64-78) |
| WIDC_STATIC2 | 286,188 - 442,366 | the rates' tiled box |
| WIDC_STATIC3/4/5 | 298,204/228/252 (132 x 16) | `TID_GAME_REDANGEL_RATE` "Red Angel", BLUE, GREEN (:152-157) |
| WIDC_STATIC_RED/BLUE/GREEN | 380,204/228/252 (32 x 16) | the rates, `"%0.1f"` (:510-519) |
| (drawn) | 415, 206/230/254 | "%" in 0xff2e70a9, the text font (:112-121) |
| WIDC_STATIC6/1/7 | 298,302/322/340 | `TID_GAME_WHITEANGEL_INFO1..3`: "With a white Angel," / "it depends mostly on" / "how many characters you have killed." |
| WIDC_RESET | 28,388 - 100,408 | `reset.bmp` |
| WIDC_CANCEL | 266,388 - 338,408 | `ButCancel2.bmp` |
| WIDC_START | 358,388 - 430,408 | `ButtVoteStart.BMP` (`ButOk2.bmp` in French only, :166-169) |

Slots 0-9 take `II_GEN_MAT_ORICHALCUM01` (2035, "Sunstone") or `_01_1` (2082, "Event Sunstone"); 10-19 take
`II_GEN_MAT_MOONSTONE` (2036) or `_1` (2083) (`OnDropIcon`, :250-292).

- **Drop** on an empty slot of the right row (`OnDropIcon`): a stack with a free piece goes in (`SetDie`); a stack whose
  pieces are all in already: box `TID_GAME_SUMMONANGEL_ERROR1` "Too many Gems."; anything else: nothing (:272-290). While an
  item is carried, the slot under it is filled 0x60ffff00 (:80-93).
- **Shift + drop** fills every empty slot of that row with free pieces (`SetDie`, :312-338).
- **The bag's double-click** (`CWndInventory::OnChildNotify`, `WndField.cpp:2146-2160`): a stone with a free piece goes in
  the first empty slot of its row (`SetDie`'s else, :358-389); a full row takes nothing. Any other item, or a stone with no
  free piece, falls to the use path, refused with `TID_GAME_TRADELIMITUSING` (:2549-2552).
- **Double-click a slot**: its piece comes out (:229-244).
- **Rates** (`SummonRateRefresh`, :503-520), n = the stones in: green = n, white = n/10, blue = 2n, red = 100 - (green + blue).
  The server's red also takes white off (100 - 3.1n, `DPSrvr.cpp:7287-7290`); Neuz shows 100 - 3n.
- **START** (:429-479): fewer than 3 stones in all: box `TID_GAME_SUMMONANGEL_ERROR2` ("You need at least 3 Sunstones and
  3 Moonstones …", though the check is the total). Else, once (`m_nowStarting`), each stack's object id and count as
  `"%dD%dDD"` in one string, `SendCreateAngel`, then everything is let go (`ReFreshAll( TRUE )`).
- **RESET** lets everything go; **CANCEL** closes (`OnChildNotify`, :425-485); closing lets go and turns the die flag off
  (`OnDestroy`, :39-51).
- It closes, with the bag, when the player moves (`CWndWorld::Process`, `WndWorld.cpp:8154-8165`), and when the bag
  closes (`CWndInventory::OnDestroy`, `WndField.cpp:1022-1026`).

## 4. What the server decides

`CDPSrvr::OnCreateAngel` (`WORLDSERVER/DPSrvr.cpp:7193-7359`; A-server §1):
- It parses the pairs into `itemset[20]` (`:7219-7256`; a 21st overflows it, so at most 20 are sent).
- Silent refusals: a slot that is not in the bag (:7265-7284); an item held by a trade or a shop (`IsUsableItem`,
  :7312-7317). A full bag: the literal "Inventory is full. Please make room and try again.." as a diag text (:7319-7323).
- The roll: `xRandom(1000) / 10` against red, red+blue, … (:7287-7306). Result: one `II_SYS_SYS_QUE_ANGEL_RED/BLUE/GREEN/
  WHITE` (30035-30038). The stones go (UPDATE_ITEM), the angel comes (CREATEITEM); **no result packet and no text**.
- It checks no minimum, no item kind, no NPC distance: the client's 3-stone rule and slot rules are the only guard.

## 5. Packets

| Direction | Packet | Fields | C++ |
|---|---|---|---|
| out | PACKETTYPE_CREATEANGEL 0x00fff000 | `WriteString( "%dD%dDD"… )` | `DPClient.cpp:11279-11284`, `MsgHdr.h:254` |
| out | PACKETTYPE_ANGELBUFF 0x00fff002 | none | `DPClient.cpp:11285-11289`, `MsgHdr.h:256` |
| in | SNAPSHOTTYPE_ANGEL 0x00b1 | BYTE state; ANGEL_INFO (1): __int64 exp, LONG level, BOOL complete | `DPClient.cpp:11303-11354`, `User.cpp:6444-6455` |
| in | SNAPSHOTTYPE_FLYFF_EVENT 0x00b2 | 1024 BYTEs, `g_eLocal` (EVE_PK = 11) | `DPClient.cpp:6183-6199`, `flyffevent.cpp:24-34` |
| in | SNAPSHOTTYPE_SET_LOCAL_EVENT 0x00b3 | short id, BYTE state | `DPClient.cpp:6260-6265` |
| in | own ADD_OBJ | `m_nAngelExp`, `m_nAngelLevel` before the inventory | `ObjSerializeOpt.cpp:581-584` |

FlyffWeb read none of the three snapshots before: an ANGEL after a kill ended its bundle, and FLYFF_EVENT ended the join
bundle.

## 6. The angel item and what follows

Item rows (`Resource/propItem.txt:4129-4137`): Red/Blue/Green/White Angel, `IK2_BUFF`/`IK3_ANGEL_BUFF` (95), stack 99,
`nAdjParamVal1` 100/60/30/10 (the EXP target %), `dwSkillTime` 999999999, `dwSfxElemental` ELEMENTAL_ANGEL_RED/BLUE/
GREEN/WHITE, `szTextFile` `Mvr_AngelRed/Blue/Green/White`, no stat. The "… Angel 100%" items are 30039-30042.

- **Use** (`CMover::DoUseItem`, `MoverSkill.cpp:1419-1447`; `IsDoUseBuff`, :2844-3016, server only): already an angel:
  `TID_GAME_LIMITED_USE`; on a PK server: PK value 0: `TID_GAME_PKVALUE_NOT_ANGEL`; no Confession quest:
  `TID_GAME_NOT_QUEST_ANGEL`; a 100% angel in the bag: `TID_GAME_NOT_COMPLETE_ANGEL`; not a PK server: nothing at all. On
  success: the buff (BUFF_ITEM, the item's id), `m_nAngelExp = 0`, `m_nAngelLevel = level + 1`, ANGEL_INFO.
- **EXP** (`CMover::AddExperience`, `MoverParam.cpp:1107-1170`): while below its target, every EXP gain is halved and the
  half added to the angel; the target is `m_aExpCharacter[m_nAngelLevel].nExp1 / 100 * nAdjParamVal1`; on passing it,
  ANGEL_INFO with complete set (Neuz: `TID_GAME_COMPLETE_ANGEL` "Your Angel has reached full Exp.", :11351-11352).
- **The model** (`CMover::Process`, `_Common/Mover.cpp:3560-3627`): a player with an `IK3_ANGEL_BUFF` buff gets
  `szTextFile.chr/.o3d/_stand01.ani` at scale 0.2, the player's turn, 1 to the +x side and 1 up. `AngelMoveProcess`
  (:3972-4021): beyond 100 units (a teleport) it is made again at the player; beyond 1 unit it moves toward the player by
  `GetSpeed( m_fSpeed ) * dist² / 10` a frame; every frame `CreateAngelParticle` (:10765-10798) makes 2 particles of kind
  `m_dwAngelKind + xRandom( 3 )` (blue 13, red 16, white 19, green 22; `_Common/ParticleMng.cpp:580-600`, the pets' kinds)
  1.1 up, flying back from the player. Drawn after the player (`MoverRender.cpp:721-727`). On death Neuz drops the model
  (`DPClient.cpp:1980-1987`), and makes it again next frame since the buff stays.
- **The gauge** (`CMover::RenderAngelStatus`, `MoverRender.cpp:1907-1979`, from `RenderHP`, :1840-1843): 40 px wide over
  the angel (1.4 up), `GauAngelExpBG.tga` then `GauAngelExp.tga` cut to exp / target, at 0.4 x 0.55 and alpha 200.
- **The buff icon** (`CWndWorld::RenderBuffIcon`, `WndWorld.cpp:9247-9277`, :9357-9370): its tooltip adds `"   %d%%"` in
  RGB(100,100,255) bold; at 100% it blinks and a box says `TID_GAME_ANGELEXP_END` "Please click the Angle buff icon." once
  (`m_bAngelFinish`). A press on it on a PK server (`g_eLocal.GetState( EVE_PK )`) sends ANGELBUFF (`OnLButtonDown`,
  :6769-6794; `MenuException`, :11539-11564).
- **ANGELBUFF** (`CDPSrvr::OnAngleBuff`, `DPSrvr.cpp:7361-7430`): when full, the 100% item, the buff removed, "You received
  %s."; a full bag: `TID_GAME_NOT_INVEN_ANGEL`.

## 7. Every refusal while the window is open

| Where | What | C++ |
|---|---|---|
| NPC menu MMI_TRADE (a shop or a player trade) | `TID_GAME_SUMMONANGELUSING` | `WndWorld.cpp:5305-5312` |
| NPC menu MMI_REPAIR, MMI_BANKING, MMI_POST, beauty shops | `TID_GAME_SUMMONANGELUSING` | :4597-4604, :4650, :4737, :5426, :5515, :5600 |
| APP_VENDOR_REVISION (personal shop) | `TID_GAME_SUMMONANGELUSING` | `WndManager.cpp:2685-2695` |
| A trade asked by another player | BLOCK 8 back | `DPClient.cpp:2589-2595` |
| An item used from the bag | `TID_GAME_TRADELIMITUSING` | `WndField.cpp:2548-2552` |
| An item dropped from the bag on the world | `TID_GAME_TRADELIMITITEM` | `WndWorld.cpp:7786-7795` |

## 8. Resources

- Pictures (Client/Theme/Default): `reset.bmp`, `ButtVoteStart.BMP`, `GauAngelExpBG.tga`, `GauAngelExp.tga` (new in the UI
  stage); `ButCancel2.bmp`, `WndChgElemItem.bmp`, `WndEditTile00.tga`, `WndTile00.tga` were already converted.
- Text: `Client/Client/summonAngelQuest.inc`, now in `data/ultimate.json`'s `descriptions.summonAngel`.
- Models: `models/mvr_angel{red,blue,green,white}.glb`, `skeletons/mvr_angel*.glb`, `motions/mvr_angel*/…_stand01.glb`
  are already converted. Particles `etc_particle11-14` too (the pets').
- Texts: all TIDs above are in `data/texts.json` (A-server §7).

## 9. What FlyffWeb had, and what is missing

Had: the NPC menu (`hud/moverMenu.ts`; MMI 43 greyed), slot windows to copy (`items/jewelWindows.ts`,
`items/upgradeNpcWindows.ts`: `ResWindow`, drop and phone tap, `reserve` + die flag), buffs per mover
(`buffs.ts`), the buff icons (`hud/buffStatus.ts`), the pets' particles (`pets/petParticles.ts`, kinds 13-24, the angel's
too), mover models and motions (`render/moverModels.ts`). Trade (`trade/tradeHud.ts:155`) and the personal shop
(`WorldScreen.ts:2866`) left notes that their "Summon Angel window open" refusal had nothing to check.

Missing, built on this branch: the three snapshots and two packets; the window (desktop + phone); MMI 43; the refusals of
§7 the browser has windows for; the angel's model, follow, particles and gauge; the buff icon's percent, blink, box and
press. Left (no window in the browser yet, or another session's): the bank, post, repair and beauty-shop refusals.

## 10. Online (`D-online.md`)

The English wiki (a gPotato mirror, "complete as of version 13": https://flyff-wiki.gpotato.com.br/wiki/Angels.html,
…/Confession.html, …/Priest_of_Confession.html) agrees with the code: the Priest of Confession on each continent, the
Confession quest, "Angel Window" with two rows of 10, Red/Blue/Green rates of 100-3n/2n/n, White about 0.1n, the angels'
100/60/30/10 % of a level's EXP, the buff-icon press, and 1,000,000 penya for PK -1..5. It calls Orichalcum "Sunstone". It
says the angel is lost when a player kills you; the owner's build keeps it (§1).
