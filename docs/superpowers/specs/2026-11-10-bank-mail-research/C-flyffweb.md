# C. FlyffWeb map for the bank (Custody) and the mail (Post)

Research only (2026-11-10). Repo: `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\bank-mail` (branch `bank-mail`,
at `df57fb7 Merge branch 'guild'`, clean). Main now has trade, personal shop, jewels and guild merged. All paths are
relative to that root unless they start with `Source/` (the C++ at
`C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source`).

The worktree's `dist/assets` is a real folder (`dir` shows `<DIR>`, not `<JUNCTION>`; 765 files in `ui/`), so a
`--out` into it is safe. Earlier map reused: `guild-research/D-flyffweb.md` (checked again against the current code;
line numbers below are today's).

## 0. Summary

Nothing of the bank or the mail exists in the browser. The own ADD_OBJ's bank data is **read and thrown away**
(`packages/protocol/src/world/own.ts:142-144` `m_nSlot`, `m_dwGoldBank[3]`, `m_idPlayerBank[3]`; :58-79 the three
42-slot banks). The NPC menu shows "Deposit" (MMI 9) and "Mailbox" (MMI 25) **greyed** (`hud/moverMenu.ts:79-80`
whitelist; `MaFl_InstantBank` `[9]` and `MaFl_Postbox` `[25]` are one-entry NPCs). `MODE_MAILBOX` is known
(`gmModes.ts:27`) and prints `TID_MAIL_RECEIVE` on MODIFYMODE (`WorldScreen.ts:3449-3463`); no icon. All bank and mail
TIDs are in the converted `texts.json`. Pictures: frames, edits, OK/Cancel/Yes/No, ButtSend/Delete/Close/Money/Change,
WndChgElemItem, WndEditTile200, WndMail are converted; **WndCommonBank, WndCommonBankNotUse, ButtReply, WndPostTable are
not**. Reusable as is: `ResWindow`/`WindowFrame`, `TradeGoldWindow` (Neuz's bank uses the same CWndTradeGold,
`WndBank.cpp:235, :261`), the container helpers of `trade/itemContainer.ts`, `OwnState.addGold`, the bag's drag types
and its phone tap hook, `GuildNoticeWindow`'s textarea pattern, the shop's walk-away close (`canTalk`). The e2e private
config is already in `.superpowers/` (port 5185).

---------------------------------------------------------------------------------------------------------------------

## 1. Window system

### 1.1 The two building blocks

**`WindowFrame`** (`apps/client/src/world/hud/frame.ts:198`) = Neuz's `CWndNeuz` frame.
- `new WindowFrame(title, art, layout: FrameLayout, doc)` (:244). `FrameLayout` (:39-72): `width, height, mobileScale?`
  (default 0.7), `fitWhole?`, `texture?` (one picture; none = the 12 tiles `WndTile00-11.tga`), `closeButton?`,
  `caption?`, `tiles?` (tile prefix, default `WndTile`), `insets?`, `resize?`.
- DOM: `.hud-window` > `.hud-window-frame` (tiles or picture, :265-269), `.hud-window-title` (20 px, the drag bar,
  :271-274), `.hud-window-close` (`ButtWndExit.tga`, 15 x 14, 7 px from the right, :276-286), `.hud-window-body` = client
  area (4 px in, 22 px down, :288-295). Put content in `frame.body`.
- Drag: pointerdown on the title bar -> `startDrag` (:308, :547-556); kept on the layer, clings within 10 px (`moveTo`
  :608-630); the bottom room above the task bar from `setLayoutBottom` (:166).
- Z-order: one stack per document (`stacks`, :156); `open` pushes and `raise()`s (:386-404); any pointerdown raises
  (:304-307); `restack` sets `z-index = 1 + index` (:531-535).
- Escape: closes the top window whose `escapeCloses` is true (:208, :642-661).
- API: `open('center' | {x,y})` :386, `close()` :407 (calls `onClose`), `isOpen` :372, `setTitle` :377, `raise` :520,
  `setHeight` :512, `setSize` :355, `position`, `scaledSize`, `onClose`, `onPlaced`, `movable`.
- Phone: `fit()` (:457-478) uses `matchMedia('(max-width: 1000px) and (pointer: coarse)')` -> `transform: scale(mobileScale)`
  and the attribute `data-mobile-window` (:466); `fitWhole` shrinks further to fit the layer (:460-463); a window taller
  than the room is cut and gets `data-scrolls` (:467-477).

**`ResWindow`** (`apps/client/src/world/hud/resWindow.ts:101`) = a window from a hand-copied resdata.inc entry.
- `ResLayout` (:62-73): `{ title, width, height, texture?, modal?, controls: ResControl[], frame?: Partial<FrameLayout> }`.
- `ResControl` (:39-59): `static` (text / group / picture), `text` (tiled box, optional `scroll`), `button` (picture of 4
  states, `quarter` px each, `label` = aria-label), `edit` (text field, `maxLength`, `readOnly`), `combo`, `custom` (an
  empty area you fill), `list` (rows). Each has `id` (its WIDC_ name) and `rect: [left, top, right, bottom]` as in
  resdata.inc. Every control's box gets `data-control=<id>` (:207).
- Frame defaults `mobileScale: 1, fitWhole: true` (:111-113), class `hud-res-window` (:114). `modal: true` wraps it in a
  `ModalBackdrop` (:122; `hud/modal.ts:35`, `show/hide`, `onChange`).
- API: `control(id)` :135 (throws on a typo), `button(id)` :141, `input(id)` :145, `setText` :150, `setContent` :156,
  `setChoices` :162, `open(at='center')` :181, `close` :187, `dispose` :191, `element` (backdrop or frame) :126,
  `frame`, `onClose`. Edit fields stop key propagation so the game hears no keys (:316-326).
- Helpers: `pictureButton(doc, art, picture, rect, quarter, onPress)` (`hud/button.ts:31`), `place(el, rect)`
  (`button.ts:19`), `editTiles(doc, art, cols, rows, tile?)` (`hud/tiles.ts:30`), tab strips `tabStripTiles` /
  `chosenTabTiles` / `TAB_TILE` (`tiles.ts:17-87`), `textScrollBar(doc, art, textEl, rect)` (`resWindow.ts:341`),
  `themeUrl(art, 'File.tga')` (`hud/art.ts:28`), `cssRgb(argb)` (`art.ts:33`).
- **No converted resdata.inc**: each window file carries its layout as a TS constant, with the resdata.inc line numbers in a
  comment (e.g. `hud/trade/tradeWindows.ts:35-83`, `hud/guild/guildDialogs.ts:22-93`, `hud/vendor/vendorLayouts.ts`).
  The bank/mail layouts must be copied the same way from `Blouflash VS22 V15\Resource\resdata.inc`.

### 1.2 Examples to copy

- Trade (`hud/trade/tradeWindows.ts`): `TradeWindow` (:102-229) = ResWindow + `custom` controls filled with 25 cells of
  32 px (`grid()`, :146-164), drop target (:124-137), `draw(state)` (:167-183), `setLocked` (:223-228).
  `ConfirmTradeWindow` (:232-267, OK/Cancel, `dismiss()` closes with no answer), `TradeConfirmWindow` (:270-316, Yes/No),
  `TradeGoldWindow` (:319-378, see §3). Owner: `trade/tradeHud.ts` (`TradeHud`, :77) with a `TradeHudScreen` interface of
  callbacks (:43-70) and `elements` (:128-130) for the layer.
- Guild (`hud/guild/guildDialogs.ts`): small ResWindows; `phoneWords(window)` (:106-112) puts a short word in each
  button's `data-word` for the phone; `GuildFieldWindow` (:159-200) a one-field window (text, or `numeric`);
  `GuildNoticeWindow` (:218-253) a **multi-line textarea** in a `custom` control (the model for a mail body).
  `hud/guild/guildWindow.ts:218` the big tab window = `WindowFrame(..., { mobileScale: 1, fitWhole: true })`.
- Personal shop (`hud/vendor/vendorWindows.ts`): `isPhone(doc)` (:52) picks a desktop ResWindow (:95) or a separate phone
  DOM in a plain `WindowFrame` (:126-153); module-private helpers `textButton` (:58), `valueBox` (:396), `numpad` (:438).
- Jewels (`items/jewelWindows.ts`): item slots that take a bag drop (:122-130), and the phone tap hook (§2.3).

### 1.3 Where windows are made and opened (`apps/client/src/world/WorldScreen.ts`, 3991 lines)

- Fields: `tradeHud` :497, `guildHud` :506, `personalShop` :512 (plus screen-level state `guildBook`, `messenger`).
- Built inside `showWorld` (the HUD build): `FriendHud` :1685-1717, `GuildHud` :1719-1732 (`send: (bytes) =>
  session.sendGuild(bytes)`, `say`, ...), `TradeHud` :1734-1762, the phone bag hook :1764-1772.
- Modals registered so input is held: :1803-1808 (`tradeHud.gold.window.modal!, ...guildHud.modals`, each
  `modal.onChange = () => this.modalChanged()`). Note `modalChanged()` (:3074-3083) only checks a fixed list for the
  `world-modal` class; the newer feature modals call it but are not in that list.
- Elements appended to the window layer `this.hud!.element` :1809-1821 (`...tradeHud.elements, ...guildHud.elements`).
- Start menu / hotkey: `openWindow(window: TaskBarWindow)` :2850 (`if (window === 'guild') { this.guildHud?.toggle(); return; }`
  :2865, vendor :2868).
- NPC menu: `chooseNpcEntry(id, entry)` :3565 (§5). Player menu: `choosePlayerEntry` (:3284-3302).
- Per frame: `this.guildHud?.update()` :2818; on the own move `this.jewels?.dismiss()` :2778.
- Teardown on leaving a world: :3857-3892 (`jewels.close()`, `personalShop.reset()` + remove its elements,
  `guildHud.dispose()`, `tradeHud.reset()`).

### 1.4 Phone detection and layout

- No global flag. The rule `(max-width: 1000px) and (pointer: coarse)` is read at build/fit time:
  `frame.ts:458` (scale), `hud/vendor/vendorWindows.ts:49-52` (`export const isPhone = (doc) => ...`, the reusable
  helper), `WorldScreen.ts:1605` (`phone` picks `ChatWindow` vs `NeuzChat`). Plain `(pointer: coarse)` = any touch screen
  (16 px inputs: `style.css:2350`, `:2536` `.hud-res-edit input { font-size: 16px; }`).
- CSS phone blocks in `apps/client/src/style.css` (3012 lines). The newest: trade :2749-2795, personal shop :2885-2897,
  jewels :2909-2957, guild :2996-3011. Common pieces:
  - hide the joystick etc. while open:
    `.world:has(.hud-X:not([hidden])) :is(.hud-mobile-tools, .joystick, .hud-jump, .hud-attack) { visibility: hidden; }`;
  - **a panel beside the bag** (trade :2753-2758, jewels :2912-2917, vendor :2886): `left: 8px; top: 8px; transform: none;
    z-index: 60; width: calc(100% - var(--bag-window-width, 60%) - 28px); height: calc(100% - var(--hud-taskbar-height,
    48px) - 16px)`, the frame picture hidden (`> .hud-window-frame { display: none; }`), a CSS title bar, the body a CSS
    grid; `--bag-window-width` is set by the bag (`inventoryWindow.ts:105-108`), `--hud-taskbar-height` by the task bar;
  - picture buttons as words: `.hud-picture-button::after { content: attr(aria-label); }` (trade :2787) or
    `content: attr(data-word)` (guild :3006), 30-36 px tall, 14 px text;
  - every text >= 14 px; inputs 16 px (no zoom on focus); request/confirm boxes `z-index: 70` over the bag (trade :2752).
- Owner rule (plans): phone window text >= 14 px (e2e checks the computed `font-size`).

### 1.5 Recipe for a new window (desktop + phone)

1. Copy the resdata.inc entry into a `ResLayout` constant (title from `resData.txt.txt`'s English), with a comment giving
   the resdata.inc lines and the C++ class/file.
2. `new ResWindow(LAYOUT, art, doc)`; add a class to `window.frame.element` (`hud-bank`, `hud-post` ...); wire
   `window.button(id)` clicks; fill `custom` controls with cells (copy `TradeWindow.grid`).
3. A `XxxHud` class owning the windows + rules, taking a `XxxHudScreen` interface of callbacks (`say`, `box`, `send`,
   `ownItems`, `ownGold`, `prop`, `reserve`, `openInventory` ...), exposing `elements`, `modals`, `handle(message)`, `reset()`.
4. WorldScreen: a field; build it in `showWorld` next to `TradeHud`; add `elements` to the `append` (:1809) and its modals
   to the list (:1803); route messages in `apply` (§6.4); teardown (:3857-3892); the NPC menu entry in `chooseNpcEntry` (§5).
5. Phone: the same DOM fitted whole (ResWindow default `mobileScale 1, fitWhole`) plus a 14 px CSS override, or a panel
   beside the bag (trade/jewels CSS), or a separate phone DOM (`isPhone(doc)`, vendor). Hide the joystick while open.
   Picture buttons get words (`aria-label` or `data-word`). Taps replace drags (the bag hook, §2.3).
6. CSS: append a block at the end of `style.css` (desktop rules, then one `@media (max-width: 1000px) and (pointer: coarse)`).

---------------------------------------------------------------------------------------------------------------------

## 2. Inventory (`apps/client/src/world/hud/inventoryWindow.ts`, 448 lines)

### 2.1 Drag out of the bag (desktop)

- A bag cell is `draggable` when it has an item, is not held, not on a phone, no NPC-shop pick (:211). `dragstart` sets
  `this.dragged` and `dataTransfer.setData('application/x-flyff-inventory', String(objectId))`, `effectAllowed = 'move'`
  (:212-218). Worn items refuse the drag (:213).
- The penya sack `.inventory-money` (`CWndGold`) is draggable on the desktop: `setData('application/x-flyff-penya',
  String(own.gold))` (:269-276). On a phone a tap calls `this.trade.tapPenya()` when the hook is active (:277).
- The bag's own `drop` is a **document** listener (:78-79, :422-442): it handles only its own `this.dragged`: onto a bag
  slot (move), an equipment slot (equip), a shortcut slot, or the world canvas (drop dialog). A drop elsewhere does nothing.
- Constants: `BAG_DRAG` / `PENYA_DRAG` exported from `hud/trade/tradeWindows.ts:91-92` (re-declared in
  `buffPetStatusWindow.ts:40`; literals in vendor, jewels, upgrade, pets).

### 2.2 How a window accepts a dropped bag item

Pattern (trade `tradeWindows.ts:124-137`; jewels `items/jewelWindows.ts:122-130`; vendor `vendorWindows.ts:111-118`):
```ts
el.addEventListener('dragover', (e) => { const t = e.dataTransfer?.types ?? []; if (t.includes(BAG_DRAG) || t.includes(PENYA_DRAG)) e.preventDefault(); });
el.addEventListener('drop', (e) => {
  const cell = (e.target as Element | null)?.closest?.<HTMLElement>('[data-trade-slot]'); if (!cell || !e.dataTransfer) return;
  e.preventDefault();
  if (e.dataTransfer.types.includes(PENYA_DRAG)) onDrop(slot, { gold: true });
  else if (e.dataTransfer.types.includes(BAG_DRAG)) onDrop(slot, { objectId: Number(e.dataTransfer.getData(BAG_DRAG)) });
});
```
The element's listener runs before the bag's document listener (which then finds no bag target and does nothing).

### 2.3 Phone: the tap hook (shared by trade and jewels)

- `InventoryWindow.trade?: { active(): boolean; tapItem(id): void; tapPenya(): void }` (:54-58). A tap on a bag item while
  `active()` calls `tapItem(id)` (unless held) in place of the details (:199); a tap on the penya calls `tapPenya()` (:277).
- Set once in `WorldScreen.ts:1764-1772`:
  `active: () => tradeHud.windowOpen || this.jewels?.isOpen === true`; `tapItem` (the trade wins, else jewels, else the
  refusal line `TID_SBEVE_NOTUSEITEM`); `tapPenya: () => tradeHud.tapPenya()`.
  The bank (and the mail's "attach item / penya") would extend these three lambdas (`|| this.bankHud?.isOpen`), or the
  hook could become a list of takers.
- The NPC shop uses a different hook, `inventoryWindow.shopSelect` (:52, :198; set in `WorldScreen.ts:1654`).
- The bag has no "take out of a window" gesture; windows handle their own taps (jewels: a tap on a filled slot takes it out).

### 2.4 Held / reserved items

- `InventoryActions.held?(id)` (:37): drawn faded (`is-in-use`, :183-184), not draggable, not used. `reservedCount?(id)`
  (:41): the count shown is `item.count - reservedCount` (:194). `inUse?` (:39).
- WorldScreen wiring (:1507, :1512): `held: (id) => this.bagHeld(id) || (this.tradeHud?.extraOf(id) ?? 0) > 0`,
  `reservedCount: (id) => (bagDieFlag ? bagReserved : 0) + this.tradeExtraShown(id)`.
- `reserveItem(objectId, on)` (`WorldScreen.ts:2101-2106`): a counter map `bagReserved` (:439), redraws the bag. Handed to
  feature windows as `reserve: (id, on) => this.reserveItem(id, on)` (:1338, :1357, :1557, :1574, personal shop :3342).
  `bagHeld` :1982-1986. Cleared on world leave (:3861-3862).
- `tradeLimit()` (:2071-2075): the bag's use/equip/move refused with `TID_GAME_TRADELIMITUSING` while trading (:1490, :1525).
- `takeIntoUpgradeWindow(objectId)` (:2021-2028): a double-click on a bag item feeds the open upgrade/jewel window (the
  desktop's "double-click puts it in" path; a bank window could hook here too if Neuz does that).

### 2.5 Drag out of a non-inventory window

Only one exists: the buff pet's vis slots (`hud/buffPetStatusWindow.ts:256-281`): `cell.draggable`, `dragstart` sets
`application/x-flyff-vis-slot`; the drop is taken by the same window's cells (swap) or the world canvas (`onWorld`, :286).
**Nothing today drops a foreign drag onto the bag**: the bag's `onDrop` (:423-442) ignores drags it did not start. The
bank's "bank -> bag" drag needs a `dragover`/`drop` listener on the bag frame (or grid) for a new type (e.g.
`application/x-flyff-bank`) calling a new `InventoryActions` hook. On a phone: a tap on a bank slot (as jewels/vendor do).

---------------------------------------------------------------------------------------------------------------------

## 3. Quantity and penya windows

### 3.1 `TradeGoldWindow` (the CWndTradeGold port) - reusable as is

- File `apps/client/src/world/hud/trade/tradeWindows.ts:319-378`; layout `TRADE_GOLD` :73-83 (APP_TRADE_GOLD,
  resdata.inc:11228-11278, `WndTile09.tga` 240 x 128, **modal**; controls WIDC_STATIC question, WIDC_EDIT maxLength 10,
  WIDC_OK, WIDC_CANCEL, WIDC_CONTROL1 label).
- API: `new TradeGoldWindow(art, doc)`; `open(title, question, label, preset)` (:358-366: sets the frame title, the two
  texts, the field to `min(preset, 0x7fffffff)`, opens centred, focuses and selects the field); `onOk: (text) => void`
  (:322, OK or Enter, then the box closes: :373-377); `close()`; `isOpen`; `element` (the modal backdrop, for the layer);
  `window.modal` (register with `modalChanged`); `window.onClose` (the trade uses it to forget its target, tradeHud.ts:124).
- Phone: the field has `inputMode='numeric'`, `pattern='[0-9]*'`, `enterKeyHint='done'` (:329-333): the phone's own
  number keyboard. CSS `.hud-trade-gold` in the trade's phone block (`style.css:2783-2795`: word buttons, 14 px, input 16 px).
- How the trade calls it (`trade/tradeHud.ts:284-293`):
  `this.gold.open('Item', texts TID_GAME_MOVECOUNT || 'Move how many items?', TID_GAME_NUMCOUNT || 'Number:', count)` and
  `this.gold.open('Penya', TID_GAME_MOVEPENYA || 'How many do you want to move?', TID_GAME_PENYACOUNT || 'Penya:', gold)`;
  OK parses with `quantityOf(text, max)` (`trade/tradeState.ts`, exported) (:310-322).
- **Reuse for the bank**: in Neuz the bank's item/penya moves also go through `CWndTradeGold`: `CWndBank` sets
  `g_WndMng.m_pWndTradeGold->m_nIdWndTo = APP_BANK` (`Source/_Interface/WndBank.cpp:235, :261`; the C++ research has the
  rest). A bank HUD can own its **own instance**
  (`new TradeGoldWindow(art, doc)`), add its own class (`.hud-trade-gold` already styled for the phone; add `hud-bank-gold`
  if the bank needs a different z-index over its panel), and keep its own target. No change to the class is needed.
  The same instance fits the mail's "how much penya to attach" if Neuz uses a plain edit there (APP_POST_SEND has an edit
  for the penya, so probably not needed).

### 3.2 The personal shop's keypads (CWndRegVend / CWndVendorBuy) - not a fit

- State: `apps/client/src/world/vendor/vendorKeypad.ts`: `PadKey` (:11-13), `SellPad(stack)` (:24, `values`, `focus`,
  `press(key)`, `result()` -> `{count, cost} | null`), `BuyPad(max, cost)` (:125, `press`, `count`, `total`).
- Windows: `hud/vendor/vendorWindows.ts` `SellPadWindow` (:466-568), `BuyPadWindow` (:571-658). Desktop = ResWindow of
  `SELL`/`BUY` (`vendorLayouts.ts`); phone = a `WindowFrame` sheet with `valueBox` outputs and an in-game `numpad`
  (`numpad(doc, keys, columns, press)` :438-453, keys `SELL_KEYS` / `BUY_KEYS` :416-430; owner decision 2026-11-10: "the
  phone's sheet has the keypad as an in-game numpad, and no text field", :499-500). `dropTyping` (:456-460) blurs inputs.
- They are shop-specific (price, total cost, calculator keys) and the helpers `numpad`, `valueBox`, `textButton`, `keyOf`
  are module-private (not exported). `BuyPad(max, 0)` alone would work as a "1..max" counter if the owner wants the
  in-game numpad on the phone for the bank too; that needs `numpad`/`valueBox` exported (or moved to a shared file).
- Decision for the owner/plan: the bank's count box on the phone = `TradeGoldWindow` with the phone's number keyboard
  (as the trade does today), or the vendor-style in-game numpad (consistent with the newest owner request for the shop).

---------------------------------------------------------------------------------------------------------------------

## 4. Text entry on the phone

There is no in-game text keyboard: every text field is a real `<input>`/`<textarea>` and the phone's own keyboard comes
up on focus. Rules used:
- **16 px font on a coarse pointer** so the page does not zoom on focus: `style.css:2536`
  `@media (pointer: coarse) { .hud-res-edit input { font-size: 16px; } }` (every ResWindow `edit`), `:2350` (message box),
  `.hud-trade-gold .hud-res-edit input` (:2795), guild `:is(.hud-guild-dialog) input, .hud-guild-notice-text { font-size:
  16px; }` (:3003), vendor `.vendor-chat-line input` (:2883).
- `enterKeyHint`: `'done'` for one-line fields (guild `answerOnEnter`, `hud/guild/guildDialogs.ts:123-128`; vendor name
  `vendorWindows.ts:138`), `'send'` (vendor chat :713), `'enter'` for a multi-line textarea (guild notice :229).
- Keys must not reach the game: ResWindow edits stop `keydown`/`keyup` propagation (`resWindow.ts:322-323`); a hand-made
  textarea does the same (`guildDialogs.ts:230-231`); the task bar also ignores typing targets (`taskBar.ts` `typing()`).
- Examples:
  - Guild name / nickname / pay: `GuildFieldWindow` (`guildDialogs.ts:159-200`): ResWindow `edit` WIDC_EDIT1, Enter and
    OK both answer, `numeric` option adds `inputMode='numeric'`.
  - Guild notice: `GuildNoticeWindow` (:218-253): a `<textarea>` (maxLength 127) put inside a `custom` control,
    `.hud-guild-notice-text` CSS (`style.css:2985-2988`) fills the tiled box. **Model for the mail body.**
  - Friends: `AddFriendWindow` input (`hud/friends/friendWindows.ts:63-84`, maxLength 64, focus on open); the private
    message window `MessageWindow` uses a `<textarea>` with Enter = send (`friendWindows.ts:155-161`).
  - Chat: desktop `NeuzChat` input (`hud/neuzChat.ts:309-313`, maxLength 259); phone `ChatWindow` form input
    (`hud/chatWindow.ts:68-70`) which is **not focused automatically on a phone** (`if (!this.mobile) this.input.focus()`,
    :125, :187) so the keyboard does not pop up uninvited.
  - One-field question: `MessageBox.prompt(text, { input: { maxLength } }, ({ value }) => ..., onCancel)`
    (`hud/messageBox.ts:118-143`): used by the rename scroll and the friend summon.
- Bank password (4 digits): a ResWindow `edit` with `inputMode='numeric'`, `pattern='[0-9]*'`, and
  `input.type = 'password'` (the lobby's Bank PIN field does this: `apps/client/src/lobby/views/createView.ts:43-46` `pinInput`
  "digits only on a phone's keyboard, and shown as dots"). Note: the lobby's "Bank PIN" is the 2nd-password used for
  character delete (`lobby/validation.ts:20-28`), **not** the in-game bank password; only its field style is reusable.

---------------------------------------------------------------------------------------------------------------------

## 5. NPC menu (`apps/client/src/world/hud/moverMenu.ts`, 178 lines)

- `MMI` ids the browser acts on (:22-29): DIALOG 0, TRADE 2, **GUILDBANKING 15**, PIERCING 23, ... TELEPORTER 146,
  SMELT_JEWEL 52, SMELT_EXTRACTION 53. **Not present: `MMI_BANKING` 9 and `MMI_POST` 25** (`Resource/defineNeuz.h:101`,
  `:117`; also MMI_REPAIR 14, MMI_BEAUTYSHOP 13).
- Labels: `TID_MMI_DIALOG + id` (`TID_MMI_BASE = 7000`, :57): converted texts have `TID_MMI_BANKING` 7009 "Deposit",
  `TID_MMI_GUILDBANKING` 7015 "Guild Warehouse", `TID_MMI_POST` 7025 "Mailbox".
- `npcMenuEntries(npc, texts, ownIsBaseJob)` (:69-82): ascending ids; **filters out MMI_GUILDBANKING** (:74, comment
  "the browser has no guild", stale since the guild merge but still true for the guild bank); `enabled` (:79-80) is a
  whitelist: DIALOG, TRADE (not a vendor-type NPC), NPC_BUFF, `UPGRADE_ENTRIES` (:49-53), TELEPORTER (with teleports),
  `PET_ENTRIES` (:36), `TAMER_ENTRIES` (:45-47). Everything else is shown **greyed** (decision: entries the browser cannot
  open are greyed, header :14-15). To enable the bank and post: add `BANKING: 9, POST: 25` to `MMI` and to the `enabled`
  test (e.g. a `BANK_ENTRIES` set).
- `soleEntry(npc, entries)` (:89-94): an NPC with one menu entry runs it at once (if enabled). `MaFl_InstantBank`
  "Banker Pang" `menus: [9]` and `MaFl_Postbox` "Post Box" `menus: [25]` are such NPCs: once enabled, a press opens the
  bank / the post directly. Unit test to update: `apps/client/test/moverMenu.test.ts:69`
  (`sole(MaFl_InstantBank [9])` is `null` today) and :20 (`enabled(JULIA)` = `[DIALOG, TRADE]`; Julia's menus are
  `[0, 9, 15, 16, 17, 18, 2, 137]`).
- NPCs with the entries (converted `dist/assets/data/npcs.*.json`): MMI 9 = MaFl_Juria (Julia), MaSa_Helena, MaDa_Ollien,
  MaFl_Jeffo (`[9, 137]`), MaFl_InstantBank (`[9]`); MMI 25 = MaFl_Postbox (`[25]`, image `ui/char/char_question.png`);
  MMI 15 = Julia, Helena, Ollien.
- The menu: `MoverMenu.open(entries, at, choose, npcId)` (:121-150), buttons `.hud-mover-menu-item` with
  `data-menu-entry="<id>"` (:128; e2e hook `.hud-mover-menu [data-menu-entry="9"]`), disabled when not enabled (:130).
- The press: `WorldScreen.pressNpc(id)` (`WorldScreen.ts:3240-3263`): within `MENU_RANGE` 20 (:3246-3250, else walks
  there), stops the player, `soleEntry` or opens the menu with `(entry) => this.chooseNpcEntry(id, entry)`.
- Dispatch: `chooseNpcEntry(id, entry)` (`WorldScreen.ts:3565-3612`): an `if / else if` chain on `entry` (DIALOG,
  TRADE with `canTalk`, TELEPORTER, NPC_BUFF, PIERCING, SMELT_*, pets). Add
  `else if (entry === MMI.BANKING) this.bankHud?.request(id)` and `else if (entry === MMI.POST) this.postHud?.open(id)`.
  (Neuz's OnCommand checks for MMI_BANKING/MMI_POST, e.g. trading -> TID_GAME_BANKNOTRADE / TID_GAME_TRADENOTPOST, are the
  C++ research's.)

### 5.1 Closing an NPC window when the player walks away (patterns that exist)

- NPC shop: `ShopWindow` gets `valid = (id) => this.canTalk(id)` (`WorldScreen.ts:1646`); each frame `shopWindow.update()`
  (:2801) runs `check()` (`hud/shopWindow.ts:60-64`), which closes the window when `!valid(id)`. `canTalk(id)`
  (`WorldScreen.ts:3672-3677`): the NPC exists, both alive, squared distance <= 1024 (32 units, MAX_LEN_MOVER_MENU).
  Teleporter the same (`:1667`, `teleporter.update()` :2807).
- Dialogue and the NPC menu: each frame (`WorldScreen.ts:2796-2800`) closed when `!dialogueStays(npc, self)`
  (`hud/dialogue/dialogueStays.ts:21-23`: NPC gone/dead, or the player not standing / walking back).
- Upgrade/jewel windows: closed on **any own move** (`WorldScreen.ts:2771-2779`, `(state & ObjSta.MOVE_ALL) !== STAND` ->
  `jewels.dismiss()`, `upgradeNpc.piercing.dismiss()`).
- The trade: closes on the partner's DEL_OBJ (`tradeHud.removed(objectId)`, `WorldScreen.ts:1002`).
- For the bank: `CWndBank`'s destructor sends CLOSEBANKWND (`Source/_Interface/WndBank.cpp:20-22`); no distance check was
  found in WndBank.cpp itself (whether Neuz closes it on a walk-away elsewhere is the C++ research's to state). The other
  NPC entries check for an open bank/post (`Source/_Interface/WndWorld.cpp:4534-4558, :4815-4842, :5253-5278`). The
  cheapest browser copy is the shop's (`valid` + per-frame `update()`), or the jewels' (`dismiss()` on move); every close
  must send the close packet (as `TradeHud`'s `onClose` sends TRADECANCEL, `trade/tradeHud.ts:102-106`).

---------------------------------------------------------------------------------------------------------------------

## 6. Protocol package (`packages/protocol`)

### 6.1 Existing bank / mail / post bits (grep -i bank|mail|post|custody|MODE_MAILBOX across apps, packages, tools)

- **Own character's bank data is read and dropped** (`packages/protocol/src/world/own.ts`):
  - `skipBeforeInventory` (:139-151): `r.u8()` `m_nSlot` (:142), `r.bytes(4 * 3)` **`m_dwGoldBank[3]`** (:143),
    `r.bytes(4 * 3)` **`m_idPlayerBank[3]`** (:144).
  - `readPetSlot` (:58-79): the **three banks `m_Bank[k]`** read past: per bank `m_apIndex` 42 DWORDs (:61), the count
    (:63), each `slot` + `readInventoryItem(r, slot)` (:65-70, the item is read and thrown away), `adwObjIndex` 42 DWORDs
    (:71); then `dwPetId` (:73). `MAX_BANK = 42` (:25). A `ProtocolError` in the banks only loses the pet slot (:75-78).
  - `readOwnAfterEquipment` (:36-49) calls it after the inventory, then `skipRest()` (:44).
  - So keeping the bank = return `banks: Array<{ slots: number[]; items: InventoryItem[] }>`, `goldBank: number[3]`,
    `playerBank: number[3]` (and `bankSlot`) from these two functions into `OwnCharacter` (`world/types.ts:409-`).
- `ModifyMode`'s `MODE_MAILBOX` 0x00008000 is known: `apps/client/src/world/gmModes.ts:27`; `WorldScreen.onModifyMode`
  (`WorldScreen.ts:3449-3463`) prints `TID_MAIL_RECEIVE` to the chat's system lines when the own mode has it (the
  instant message window "left out", comment :3452). The mode itself is on the mover (`added.player.mode`, ADD_OBJ and
  MODIFYMODE, `value.type === 'modifyMode'` routed at :1015). **This is the hook for a "new mail" HUD icon.**
- `hud/friends/messengerWindow.ts:17`: "The note button and the mail icon wait for the memos and the post" (Neuz's
  Messenger draws `WndMail.dds` flashing at WIDC_CUSTOM1 while `IsMode(MODE_MAILBOX)`: `Source/_Interface/
  WndMessenger.cpp:487-490`, tooltip TID_MAIL_RECEIVE :640-653). `ui/wndmail.png` is already converted
  (`tools/convert/src/ui/uiStage.ts:232`).
- Comments only: `trade/tradeHud.ts:155` ("the bank, mail, ... windows of the checks are not the browser's"), :218;
  `vendor/personalShop.ts:69, :323`; `WorldSession.ts:262` (BLOCK gu 8 = "a bank open").
- `items/premiumItems.ts:51`: Custody 15083 (the item that opens the bank) listed as not handled; tests
  `apps/client/test/inventoryWindow.test.ts:186` ("the Custody scroll opens the bank, which the browser lacks: no Use") and
  `apps/client/test/itemUse.test.ts:169`. **These tests change** if the Custody item gets a Use.
- Lobby "Bank PIN" (`apps/client/src/lobby/*`, e2e `lobby.spec.ts`, `landscape.spec.ts:158`): the 2nd password of
  character create/delete; unrelated to the in-game bank password.
- No `BANK`/`MAIL`/`POST` snapshot types or packet ids in `packages/protocol/src/constants.ts` or any world module.
  Today's bank/post snapshots (if a server sends them) are **skipped** by the bundle's table of contents
  (`server-patches/world-snapshot-index.patch`; counted in `WorldSession.stats.skipped`) and unknown direct packets warn
  once (`WorldSession.ts:686-689`).

### 6.2 Item readers

- `readInventoryItem(r, slotId?)` (`world/own.ts:188-230`) is the `CItemElem::Serialize` reader (there is no function
  named `readItemElem`). With `slotId` it reads and drops the repeated u32 id (:189-190); **without** it, the first u32
  is the object id (`m_dwObjId`, as in a CREATEITEM or a bank PUTITEMBANK `CItemElem`). Returns `InventoryItem`
  (`world/types.ts:369-401`: objectId, itemId, count, flag, charged, abilityOption, resist, resistOption, piercing,
  ultimate, randomOption, keepTime, pet, visKeepTimes, transformVisPet). Drops serial number, item text, `m_idGuild`
  (:200), repair fields.
- `readItemContainer(r)` (`own.ts:129-136`): a whole **73-slot** inventory container (`m_apIndex` 73 + items + 73 indexes),
  used by TRADE. **Not for a bank**: a bank container is 42 slots (`m_apIndex` 42). A bank reader needs a size parameter
  (generalise `readItemContainer(r, size = 73)` and `readInventory`'s bound, `own.ts:160-182`, which uses
  `INVENTORY_SLOTS` 73), or reuse the loop in `readPetSlot`.
- `world/items.ts`: `readCreateItem` (:15, CREATEITEM: type, CItemElem, stacks), `readUpdateItem` (:35), `readMoveItem`
  (:39, positions), encoders `encodeMoveItem` (:82), `encodeDropItem` (:87).

### 6.3 How messages are decoded and routed (feature module pattern: trade, vendor, guild)

1. **Snapshots** (world server, `SNAPSHOTTYPE_*`, inside JOIN/SNAPSHOT bundles; the bank and post replies are of this kind
   in Neuz: `case SNAPSHOTTYPE_POSTMAIL: OnPostMail( ar )`, `Source/Neuz/DPClient.cpp:681`):
   - per feature: a `XxxMessageType` const of ids, a `XxxMessage` union, readers, a table
     (`TRADE_READERS` `world/trade.ts:97-110`; `GUILD_READERS` `world/guild.ts:394-409`), `isXxxMessage(message)`
     (`trade.ts:113`, `guild.ts:419-421`, with a `Set` of type names `guild.ts:411-416`);
   - registered in `world/readers.ts:68-221` `WORLD_READERS` (`...TRADE_READERS` :218, `...GUILD_READERS` :220; friends and
     vendor list entries one by one :167-182);
   - union: `world/types.ts:19-20` `export type WorldMessage = ChatMessage | ... | TradeMessage | VendorMessage |
     GuildMessage | GuildDirectMessage | ...`;
   - export: `packages/protocol/src/index.ts:52-68` (`export * from './world/trade'` :67, guild :68).
2. **Direct packets** (whole packets from the core, u32 packet type): `decodeWorldPacket` (`messages/world.ts:361-436`);
   features hook into `default:` (:425-435: `readFriendPacket`, `readGuildPacket`); the result union `WorldPacket`
   (:251-344). In `WorldSession.onCachePacket` (`apps/client/src/world/WorldSession.ts:596-691`) each direct type needs a
   `case` that notifies `{ type: 'messages', messages: [{ objectId: NULL_ID, type: <id>, value }] }`, only while
   `phase === 'playing'` (guild :648-665 with `guildPacketTypeOf`). (Bank/post are world-server snapshots, so probably
   none needed; the C++ research decides.)
3. **The browser's packets**: `clientPacket(type)` (`world/packet.ts:9`: `DPID_UNKNOWN` then the u32 type) + `ArWriter`
   (`.u8 .u16 .i16 .u32 .i32 .i64 .f32 .vec3 .string(s) .bytes`), e.g. `encodeTradePutGold` (`trade.ts:148`),
   `guildString` for code-page text with a length check (`guild.ts:497-509`, windows-1252 map :491). For the pretend
   servers: a `XxxRequestPacket` union + `readXxxRequestPacket(packetType, r)` (`trade.ts:155-191`, `guild.ts:594-668`),
   chained in `decodeClientPacket`'s `default:` (`messages/world.ts:678-692`) and added to `WorldPacket` (:338-343).
   Without it, testkit's `script.on('<type>', ...)` and e2e `sentOf` decoding cannot see the packet.
4. The gateway relays everything (no change needed).

### 6.4 Client side of a message

- `WorldSession` sending (`apps/client/src/world/WorldSession.ts`): one-liners over `this.playingCache()?.send(bytes)`
  (`playingCache` :558-560: only while playing), e.g. trade `sendTradePutGold` :260. The generic style:
  `sendVendor(bytes)` :265 and `sendGuild(bytes)` :267 (the HUD calls the encoders). A `sendBank(bytes)` /
  `sendPost(bytes)` (or one `sendRaw`) keeps WorldSession small. `ownPlayerId()` :268.
- `WorldScreen.apply(messages, joining)` (`WorldScreen.ts:836-1022`, loop from :838): player data and party first
  (:841-845), messenger (:847-851), guild `isGuildMessage` -> `guildBook.apply` then `continue` (:853-858),
  `if (isTradeMessage(value)) { this.tradeHud?.handle(objectId, value); continue; }` :862, BLOCK to trade :863,
  `ultimate` -> jewels :877, `VENDOR_MESSAGES.has(value.type)` -> `personalShop.apply` + `continue` :905 (set at :232),
  DEL_OBJ -> `tradeHud.removed` :1002, then **`world.apply(objectId, value, joining)` :1007**, `modifyMode` :1015.
- **Where `OwnState` hears a message**: `world.apply` -> `WorldState.toOwn` (`WorldState.ts:964-970`) ->
  `this.numbers.apply(message, objectId)` (`OwnState.apply`). A message that a feature takes with `continue` before :1007
  never reaches `OwnState`. So for the bank: either route its messages to the HUD **without** `continue` and teach
  `OwnState.apply` the bag/penya part (bag item in/out, `m_dwGoldBank`), or let the HUD call `this.own` methods through its
  screen interface (as the trade does with `addOwnGold` and `consent`, `WorldScreen.ts:1757-1758`). The second keeps
  OwnState simple and matches the trade.

### 6.5 Testkit (`packages/testkit/src`)

- `index.ts` re-exports per feature (`trade.ts`, `vendor.ts`, `guild.ts`, `friends.ts`, `ultimate.ts`, `world.ts`).
- `world.ts`: `encodeBundle(packetType, playerObjectId, messages, { index? })` :30-56; `writeItemElem(w, item)` :754-780
  (CItemElem storing side: objectId first); `writeItemContainer(w, items, worn?)` :745-747 (73-slot inventory form);
  `writeBanks(w, banks)` :791-803 (private: 3 x 42-slot containers); `writeAddSelf(objectId, p, { banks? })`
  :820-874 writes `m_nSlot` 0, **`m_dwGoldBank` 0 x3 and `m_idPlayerBank` 0 x3 hard-coded** (:862-864), and the banks
  + `dwPetId` only with `own.petSlot` or `options.banks` (:869-872). To test a bank read: add `goldBank` /
  `playerBank` options there.
- **`writeItemElem` and `writeItemContainer` are not re-exported from `packages/testkit/src/index.ts`** (only used inside
  testkit: `trade.ts:6`, `vendor.ts:7`). A new `testkit/src/bank.ts` / `post.ts` can import them from `./world`; a test
  outside testkit cannot unless `index.ts` exports them.
- Snapshot writer shape (`testkit/src/trade.ts:9-10`): `const scripted = (objectId, type, w = new ArWriter()) =>
  ({ objectId, type, fields: w.toBytes() })`, e.g. `writeTradePutGold`. Direct packet shape (`friends.ts`, `guild.ts`):
  `new ArWriter().u32(Packet.X)...toBytes()` for `gateway.pushCache(bytes)`.
- `worldScript.ts`: `createWorldScript({ playerObjectId, worldId, pos, self: writeAddSelf(...), others })` (:76),
  `later(messages)` -> a SNAPSHOT bundle (:33), `on('<WorldPacket type>', (p) => [replies], { until? })` (:46).
- `newVagrant.ts` `newVagrantOwn()`: a level-1 own character with a bag.

---------------------------------------------------------------------------------------------------------------------

## 7. OwnState (`apps/client/src/world/OwnState.ts`, 1113 lines)

- Fields: `gold` (:216, from the own ADD_OBJ `own.gold`, :296), `inventory: Map<objectId, InventoryItem> | null` (:206),
  `inventorySlots: number[]` (:207, 73 positions -> object ids: 42 bag + 31 parts), `equipmentObjectIds` (:208),
  `inventoryRevision` (:210, **bump it on every bag change**: the bag window redraws on it, `inventoryWindow.ts:122`).
- `addGold(delta)` (:345-349): clamps to 0..0x7fffffff, bumps the revision. Used by the trade
  (`addOwnGold: (delta) => this.own?.addGold(delta)`, `WorldScreen.ts:1757`). The server's own penya comes as
  `setPointParam` DST_GOLD 10000 (`setPointParam` :863-868 sets `gold` and bumps).
- `tradeConsent(mine, theirs, partner, gold)` (:355-366): the model for a client-side container move.
- `apply(message, objectId)` (:587-750; called from `WorldState.toOwn`, `WorldState.ts:964-970`): own-object messages: `createItem` (:633-647: set/delete per stack, bump),
  `updateItem` (:648-669: param 0/8 = count, <= 0 deletes), `updateItemEx`, `moveItem` (:680-682 -> `moveInventory`
  :811-828, positions < 42 only), `equipItem`, `setPointParam` (gold). Unknown types return `[]`.
- Container helpers to reuse (`apps/client/src/world/trade/itemContainer.ts`): `ItemContainer { items, slots, positions }`
  (:26-30), `freshContainer(size)` (:36), `containerIsFull(container, item, count, packMax)` (:56), `containerAdd(container,
  item, packMax)` (:77, CItemContainer::Add: onto stacks first, then the first empty position), `containerRemove(container,
  objectId)` (:108); `BAG_POSITIONS` 42 (:16). The bag as a container:
  `{ items: own.inventory, slots: own.inventorySlots, positions: BAG_POSITIONS }` (`OwnState.ts:361`). A bank is
  `freshContainer(42)` filled from the ADD_OBJ. Neuz's client-side bank handlers (`OnPutItemBank`, `OnGetItemBank`
  ...) do `m_Bank[nSlot].Add` / `m_Inventory.Add` themselves, so these helpers fit (the C++ research has the handlers).
- Suggested additions: `banks: ItemContainer[3]`, `goldBank: number[3]`, `bankRevision`, and methods
  `bankPut(slot, item)`, `bankTake(slot, objectId, count)`, `bankGold(slot, delta)`, plus `bagAdd(item)` (containerAdd on the
  bag + `keepVisEnds` + bump). Keep the bank across world changes like `profileStats` (`keepServerStats` :255-257) only
  if the server does not resend it (it does: every own ADD_OBJ carries the banks).

---------------------------------------------------------------------------------------------------------------------

## 8. Texts (TID strings)

- Loaded by `loadGameData` (`apps/client/src/world/gameData.ts:142-173`) from `data/texts.json` (the converter's
  `readTextClient(textClient.inc)`, `tools/convert/src/data/gameDataStage.ts:13, :478-483`): **every** text of
  textClient.inc, keyed by TID name: `{ "TID_X": { text, color, textId } }`. In the client: `this.data.texts: Texts =
  ReadonlyMap<string, ClientText>` (`gameData.ts:33-38`, built :173-175), `ClientText = { id, text, color (0xAARRGGBB),
  textId? }`.
- Lookup: `texts.get('TID_X')?.text ?? 'English fallback'`; colour `texts.get(tid)?.color`. printf args:
  `formatText(format, args)` (`hud/format.ts:10`). Server DEFINEDTEXT by number: `formatDefinedText(texts, textId, args)`
  (`hud/messages.ts:68`). Menu labels `menuLabel(id, texts, fallback)` (`hud/moverMenu.ts:63-66`). Feature helper:
  `TradeHud.line(tid, args?, colorTid?)` (`trade/tradeHud.ts:147-151`) = `screen.say(formatText(...), color)`.
  Neuz's "\n" is kept as two characters in the catalog: `.replace(/\\n/g, '\n')` (`WorldScreen.ts:1547`).
- Unit tests build a small `Texts` map by hand (`apps/client/test/tradeHud.test.ts:12-23`).
- **Converted and present** in this worktree's `dist/assets/data/texts.0438eda73a.json` (2949 texts; the robocopy of
  the assets finished: `FlyffWeb-worktrees/bank-mail-robocopy.log` "Ended 3:36:13 PM", 32654 files):
  - Menu: `TID_MMI_BANKING` 7009 "Deposit", `TID_MMI_GUILDBANKING` 7015 "Guild Warehouse", `TID_MMI_POST` 7025 "Mailbox".
  - Bank: `TID_GAME_BANKUSEITEM` 660, `TID_GAME_BANKDROPITEM` 661, `TID_GAME_BANKOVERPENYA` 662 "Bank has insufficient Penya.",
    `TID_GAME_BANKTRADEOTHER` 663, `TID_GAME_BANKTRADESELF` 664, `TID_GAME_BANKSTILLUSING` 968, `TID_GAME_TRADENOBANK` 970,
    `TID_GAME_BANKNOTRADE` 971, `TID_GAME_REPAIR_TAKEBANK` 1133, `TID_GMAE_CHAOTIC_NOT_BANK` 3132 (sic), `TID_GAME_SLOTFULL`
    998 "Your inventory is full.", `TID_GAME_BLESSING_WARNING` 3405, `TID_GAME_SEALCHAR_NO_CLEANBANK` 3487.
  - Bank password candidates (the C++ research names the exact ones): `TID_DIAG_0022` 2021 (new and confirmed differ),
    `TID_DIAG_0025` 2024 "Password should have 4 digits.", `TID_DIAG_0028` 2027 "Wrong password.", `TID_APP_OPTION_PASSWORD`
    53 "Change Password", `TID_SYS_ALERTGGRADE_NONPK` 3319 (bank password notice). The `TID_2ND_PASSWORD_*` 4293-4299
    ("Bank PIN") are the login's 2nd password (APP_2ND_PASSWORD_NUMBERPAD), not the in-game bank.
  - Quantity box (trade's): `TID_GAME_MOVECOUNT`, `TID_GAME_NUMCOUNT`, `TID_GAME_MOVEPENYA`, `TID_GAME_PENYACOUNT` (used by
    `tradeHud.ts:286-292`).
  - Mail: `TID_APP_POST_SEND` 165 "Send Mail", `TID_APP_POST_RECEIVE` 166 "Inbox", `TID_MAIL_RECEIVE` 2737 "New mail has
    arrived", `TID_MAIL_SEND_CONFIRM` 2738 ("Would you like to send mail?\n Received mail will be deleted after %d days."),
    `TID_MAIL_DELETE_CONFIRM` 2739, `TID_MAIL_UNKNOW` 2740 "Unknown user", `TID_MAIL_SEND_OK` 2741, `TID_MAIL_OTHERWORK` 2742,
    `TID_GAME_MAIL_RECEIVE_DATE` 2747, `TID_GAME_CANNOT_POST` 2756, `TID_GAME_POST_ERROR` 2757, `TID_GAME_MAILBOX_FULL` 3016,
    `TID_GAME_MAILBOX_KEEP_PAY` 3019, `TID_GAME_MAILBOX_TEXT_MAX` 3022, `TID_GAME_MAILBOX_TITLE_MAX` 3023,
    `TID_GAME_CANNOTPOST_PETITEM` 3072, `TID_GAME_TRADENOTPOST` 3130 "You cannot use the Mailbox while trading.",
    `TID_GAME_MINIGAME_ITEM_POST` 3179 ...; the server-made mails' titles/bodies (election, rainbow race, couple, event).
  - Guild bank (for later): `TID_GAME_GUILDBANKFULL` 1276, `TID_GAME_GUILDMAXBANKGOLD` 1261, `TID_GAME_GUILD_BANK_*` 3472-3482,
    `TID_GAME_CANNOTPUTGUILDBANK_PETITEM` 3071.
  - Not checked here: TIDs the C++ uses for the post windows' column heads / tooltips; grep the C++ list against the JSON
    with the one-liner below.
- Check command (run in the worktree):
  `node -e "const d=require('./dist/assets/data/texts.0438eda73a.json');for(const k of process.argv.slice(1))console.log(k,d[k]?.text)" TID_X TID_Y`
- Window titles (resdata.inc's `IDS_RESDATA_INC_*` -> `Resource/resData.txt.txt`) are **not converted**: each window
  types its English title in its layout constant (e.g. `'Move Items'` for APP_TRADE_GOLD, `tradeWindows.ts:75`).

---------------------------------------------------------------------------------------------------------------------

## 9. Converter UI stage (`tools/convert/src/ui/uiStage.ts`, 530 lines)

- **What is picked**: everything in `Client/Icon`, `Client/Item`, `Client/Char` (dds/tga/bmp) is converted without a list
  (`PICTURE_FOLDERS` :55-59); `Client/Theme/Default` pictures **must be listed** in `THEME_FILES` (:71-260), a flat array
  of file names grouped by feature with a dated comment (trade :234-236, personal shop :237-244, jewels :245-248, guild
  :249-259). `CURSOR_FILES` :269, `BARE_ICONS` :305. The guild logos (JPEG) are copied raw to `ui/logo/` (:262-267).
- **`--only`**: `matchesOnly(STAGE, ctx.only)` for the whole stage ("ui"), else per file `matchesOnly(path.basename(file),
  ctx.only)` (:422-423): comma-separated globs on the source file name (case-insensitive glob, e.g. `WndCommonBank*`).
- **Output**: key `ui/<webName(stem)>.png` (`tools/convert/src/output/keys.ts:20` `iconKeyOf`; webName lowercases),
  hashed on disk, listed in `dist/assets/index.json` (`files["ui/wndtrade.png"] = "ui/wndtrade.<hash>.png"`). Magenta
  0xffff00ff is keyed out. Client side: `themeKey(file)` / `themeUrl(art, file)` (`apps/client/src/world/hud/art.ts:23-30`);
  `art.url(key)` is '' when missing (a missing picture just draws nothing).
- **Window layouts**: the converter emits **no** resdata/window layout JSON; the client reads none. Layouts are typed by hand
  per window (§1.1). (The `data/uiSheets.json` is the glyph sheets: damage digits, target corners, emoticons, `SHEETS` :272-277.)
- **CLI** (`tools/convert/src/cli.ts`): `--client <dir>` (default `$FLYFF_CLIENT`, else `<FlyffWeb>/../Client`, :92; under
  FlyffWeb-worktrees that folder does not exist, so always name it), `--out <dir>` (default `<FlyffWeb>/dist/assets`, :97),
  `--only <globs>`, `--jobs`, `--max-texture-size`. npm script `convert = tsx tools/convert/src/cli.ts`.
- Command for this worktree (as the jewels/personal-shop sessions ran it, `FlyffWeb-worktrees/jewels-convert.log`):
  ```
  npm run convert -- --client "C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client" --out "C:/Users/silec/Desktop/FlyFF/Bakbak/FlyffWeb-worktrees/bank-mail/dist/assets" --only "WndCommonBank*,ButtReply*,WndPostTable*"
  ```
  (only after adding those names to `THEME_FILES`; the owner's main folder later needs the same `--only`, put it in the
  checkpoint.)
- **Bank/mail pictures today** (checked against `dist/assets/index.json`; all exist in `Blouflash VS22 V15/Client/Theme/Default`):

  | picture | used by | converted? |
  | --- | --- | --- |
  | `WndCommonBank.tga` | APP_COMMON_BANK 528 x 256 (resdata.inc:10679-10798), the window `CWndBank` really opens (`Source/_Interface/WndBank.cpp:62-72, :166`: three item controls, `m_Bank[0..2]`) | **no** |
  | `WndCommonBankNotUse.tga` | `CWndBank` over an unused bank slot (`WndBank.cpp:122`, code, not resdata) | **no** |
  | `ButtReply.tga` | APP_POST_READ (:25539-25649) | **no** |
  | `WndPostTable.tga` | the post's receive list (`Source/_Interface/WndField.cpp:15378`, code) | **no** |
  | `WndShop.tga` | APP_BANK 208 x 352 (:21255-21329); `CWndBank` uses APP_COMMON_BANK instead, so probably not needed | no |
  | `ButtPasClear.bmp`, `ButtPasEnter.bmp` | APP_2ND_PASSWORD_NUMBERPAD (:4208-4345; the login PIN pad, not the bank) | no |
  | `ButtDelete.tga`, `ButtClose.tga`, `ButtMoney.tga`, `ButtChange.bmp`, `WndChgElemItem.bmp`, `ButtSend.bmp` | APP_POST_READ, APP_POST_SEND, APP_CONFIRM_BANK | yes |
  | `WndTile00/06/08/09.tga`, `WndEditTile00.tga`, `WndEditTile200.tga`, `ButtOk/Cancel/Yes/No.tga`, `WndTabTile*` | frames, edits, tabs | yes |
  | `WndMail.dds` (`ui/wndmail.png`) | the Messenger's mail mark (`uiStage.ts:232`) | yes |
  | `WndGuildBank.tga` | APP_GUILD_BANK (later) | no |

  Client/Icon has no mail or bank icon. The resdata entries found (`Resource/resdata.inc`, ASCII): APP_POST_DELETE_CONFIRM
  :2429, APP_2ND_PASSWORD_NUMBERPAD :4208, APP_GUILD_BANK :7058, APP_COMMON_BANK :10679, APP_TRADE_GOLD :11228,
  APP_GUILD_BANK_LOG :13304, APP_BANK :21255, APP_POST_READ :25539, APP_POST_RECEIVE :25848 (no controls: drawn in code),
  APP_OPTION_PASSWORD :26229, APP_BANK_PASSWORD :26835 (272 x 208, 3 edits, OK, Cancel), APP_POST_SEND :26928 (287 x 320,
  edits, a combo, Send), APP_POST :27030 (320 x 368, the tab host WIDC_TABCTRL1), APP_CONFIRM_BANK :28095 (272 x 160, edit,
  OK, Change Password, Cancel).

---------------------------------------------------------------------------------------------------------------------

## 10. HUD: a "new mail" icon, and the task bar

- **What Neuz V15 does** (for fidelity): no HUD icon. On `MODIFYMODE` with `MODE_MAILBOX` it prints `TID_MAIL_RECEIVE`
  and opens an instant message window "Mail" for 1 minute (`Source/Neuz/DPClient.cpp:12358-12376`); the Messenger
  (`CWndMessengerEx::OnDraw`) draws `WndMail.dds` flashing at WIDC_CUSTOM1 while the mode is on, tooltip TID_MAIL_RECEIVE
  (`Source/_Interface/WndMessenger.cpp:487-490, :640-653`). The browser already prints the line
  (`WorldScreen.onModifyMode`, `WorldScreen.ts:3449-3463`) and has `ui/wndmail.png`; the Messenger's mail spot is a
  to-do (`hud/friends/messengerWindow.ts:17`).
- **The flag to read**: the own mover's mode, `this.world?.self()?.added.player?.mode & Mode.MAILBOX` (`gmModes.ts:27`),
  set by ADD_OBJ and kept current by MODIFYMODE (routed `WorldScreen.ts:1015`). Check it per frame or in `onModifyMode`.
- **Where an owner-requested HUD icon could go**:
  - Phone: the top-right shortcut row `MobileTools` (`hud/mobileTools.ts:47-90`; built `WorldScreen.ts:1459-1467` with
    Skill, Bag, Character, Stats; CSS `.hud-mobile-tools` `style.css:1542`, phone `:1573-1579`, `top: 0`, flex row). A
    `MobileTool { label, applet, run }` with no applet shows its text; an icon needs an applet id or a small change to accept
    a picture key (e.g. `ui/wndmail.png`). Hidden/shown by toggling the button's `hidden`. (Round 2 of the top-right icons,
    `MOBILE_SHORTCUTS`, is **not** in main.)
  - Desktop: under or beside the navigator (minimap `hud/minimap.ts:23`, frame class `hud-navigator`, `style.css:2147-2161`),
    or as an extra element in the buff layer. Buff icons are drawn by `BuffStatus` (`hud/buffStatus.ts:225-`, element
    `.hud-buffs` absolutely placed, `style.css:2304`, phone `:2339-2340`) - a DOM `div` with `<img>` children; a mail mark
    can copy that (an `<img>` of `ui/wndmail.png`, `title`/`aria-label` = TID_MAIL_RECEIVE, click = open the post if near a
    Post Box, or nothing).
  - Simplest fidelity-first option: the Messenger's mail spot (WIDC_CUSTOM1 of APP_MESSENGER_EX) + the existing chat line,
    plus a small HUD mark for the phone where the Messenger is rarely open.
- **Task bar / Start menu** (`hud/taskBar.ts`): `TaskBarWindow` union (:57-58), applet ids (:59-72), `WINDOWS` map
  (:78-92, also builds the hotkeys :98-102), `MENU` lines (:109-136, 14 lines, a line is enabled when `WINDOWS.has(id)`),
  `openWindow(window)` in `WorldScreen.ts:2850-2868`. **V15 has no bank or post applet** (`hud/applets.ts:43-90` lists
  none; the bank/post open from an NPC or the Custody item), so nothing to add to the Start menu for fidelity. If the
  owner wants one anyway: a `TaskBarWindow` value, an id, a `WINDOWS` entry, a `MENU` line, and update `hud.test.ts` (menu
  height 50 + 22 x lines + 26, `taskMenu.ts:73-74`) and the e2e `landscape.spec.ts` count.

---------------------------------------------------------------------------------------------------------------------

## 11. Tests

### 11.1 Unit (vitest)

- Root `vitest.config.ts`: `environment: 'node'`, `include: ['**/*.test.ts']`, excludes `*.corpus.test.ts`,
  `*.live.test.ts`, `e2e/`, `node_modules`, `dist`. DOM tests start with `// @vitest-environment jsdom`.
- Places: `packages/protocol/test/<feature>.test.ts`, `packages/testkit/test/`, `apps/client/test/<feature>.test.ts`
  (flat, 156 files; newest: `trade.test.ts`, `tradeHud.test.ts`, `guildBook.test.ts`, `guildHud.test.ts`,
  `jewelWindows.test.ts`, `personalShop.test.ts`).
- Window/HUD test shape (`apps/client/test/tradeHud.test.ts:1-60`): `art = { url: (key) => '/assets/' + key, sheets: null }`;
  a hand-made `Texts` map; a `session` of recorder closures (`record('put')` pushes `[name, ...args]`); a `screen`
  object implementing the HUD's screen interface with fakes (`ownItems: () => bag`, `addOwnGold: (d) => { gold += d }`);
  `document.body.append(...hud.elements)`; then `hud.handle(id, message)` and `element.click()`; assert `sent`, `lines`, DOM.
- Protocol test shape (`packages/protocol/test/trade.test.ts`): `readBundle(encodeBundle(0xffffff00, SELF, [writeX(...)]),
  WORLD_READERS)` and `expect(result.mismatched).toEqual([])`; client packets via `decodeWorldPacket(encodeX(...))`.
- Baseline in this worktree (`FlyffWeb-worktrees/bank-mail-vitest-base.log`): 5 failed | 4224 passed | 9 skipped, the
  known ones: `looks.test.ts` heldModels x3, `inventoryWindow.test.ts` x2. `npm run typecheck` passes
  (`bank-mail-typecheck.log`).
- Quick runs: `npx vitest run packages/protocol/test/bank.test.ts apps/client/test/bank*.test.ts`; full `npx vitest run`.

### 11.2 End-to-end (Playwright, Chromium only)

- `apps/client/playwright.config.ts`: dev server `npm run dev:client -- --port ${E2E_CLIENT_PORT ?? 5174} --strictPort`
  with `VITE_GATEWAY_URL: 'ws://127.0.0.1:9'`, `GATEWAY_PROXY: ''`; projects `chromium` (Desktop Chrome) and `phone`
  (Pixel 7 landscape), both skipping `@picture|@soak|@prod|@perf`; `workers: 4`; timeout 30 s (feature specs
  `test.setTimeout(120_000-150_000)`). The dev server serves the worktree's `dist/assets` (`ASSETS`, `worldHarness.ts:21`).
- The pretend world lives in the page: `playGateway(page, script)` (`e2e/worldHarness.ts:206`) routes the WebSocket and
  plays login + cache from a testkit `WorldScript`; returns `Gateway { sent, pushCache(bytes), ... }` (:183).
  Helpers: `enterFlaris(page)`, `SELF_ID` 9000 (:80), `NPC_ID` 9002 (:82), `NPC_AT` (:78), `julia` (an NPC mover, :98),
  `self`, `SELF_PLAYER`, `SQUARE`, `MADRIGAL`, `ON_FRAMES` (:28), `sentOf(gateway, type)` (the browser's packets of a type;
  `body` = DPID_UNKNOWN + type + fields), `targetsOf`, `tapMover(page, id)`.
- **NPC window example** `apps/client/e2e/jewels.spec.ts`: `scriptOf()` (:29-41) = `newVagrantOwn()` + inventory, an NPC
  made from `julia` with another `characterKey` (`MaFl_Peach`), `createWorldScript({ playerObjectId, worldId, pos,
  self: writeAddSelf(SELF_ID, ...), others: [writeAddNpc(NPC_ID, peach)] })`; `chooseEntry(page, gateway, entry)` (:56-67:
  tap the NPC, on the phone wait for SETTARGET and tap again, then click `.hud-mover-menu [data-menu-entry="<id>"]`);
  `putIn` (:70-73: desktop `dblclick`, phone `tap`); drag on the desktop `bagCell.dragTo(target)` (:106); server answers
  `gateway.pushCache(script.later([writeUltimate(...)]))` (:88); sent bytes `sentOf(gateway, MAKEGEM)` (:86);
  `isPhone = () => test.info().project.use.hasTouch === true` (:43). For the bank: an NPC with `characterKey:
  'MaFl_Juria'` (menu has 9) or `'MaFl_InstantBank'` (sole entry 9: one tap opens it); the post: `'MaFl_Postbox'`.
  The bank's own items at login: `writeAddSelf(SELF_ID, ..., { banks: [[...items], [], []] })` (testkit `world.ts:820`).
- Phone checks to copy: text >= 14 px (`e2e/trade.spec.ts:209-229`, `e2e/guild.spec.ts:169`), joystick hidden.
- Test hooks `window.__client` (`apps/client/src/testHooks.ts`): `own()` gives only `{ hp, level, actionPoint }` (:71-75);
  a bank e2e that wants the penya/bank state must read the DOM or extend `ClientOwn`.
- **Private config already in place for this worktree**: `.superpowers/playwright.bankmail.config.ts` and
  `.superpowers/port.ts` (port **5185**; `.superpowers/` is in `.gitignore:8`). Content (same as guild's/jewels', which use
  5183/5184):
  ```ts
  // .superpowers/playwright.bankmail.config.ts
  // bank-mail's Playwright config: the client's, on port 5185 (not committed: .superpowers/ is ignored).
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import './port';
  import config from '../apps/client/playwright.config';

  const here = path.dirname(fileURLToPath(import.meta.url));
  export default { ...config, testDir: path.resolve(here, '../apps/client/e2e') };

  // .superpowers/port.ts
  // bank-mail's own e2e port (the owner's dev server holds 5174): set before the client's config reads it.
  process.env.E2E_CLIENT_PORT = '5185';
  ```
  Run: `npx playwright test -c .superpowers/playwright.bankmail.config.ts bank.spec.ts post.spec.ts --project chromium --project phone`.
  Ports in use elsewhere: owner 5174, friends 5178, gm 5179, trade 5180, shop 5181, topright 5182, guild 5183, jewels 5184.
- Known e2e failure on main (not this work): `landscape.spec.ts` "nine Start menu entries" (phone).

---------------------------------------------------------------------------------------------------------------------

## Builder recipe (bank, then mail)

Message ids, field orders, window rules and NPC checks come from the C++ research (A/B); this is the FlyffWeb side.

**Protocol (`packages/protocol`)**
1. `world/own.ts`: keep the bank. `skipBeforeInventory` (:139-151) returns `bankSlot` (`m_nSlot`), `goldBank[3]`,
   `playerBank[3]`; `readPetSlot` (:58-79) returns the three banks as `{ slots: number[42]; items: InventoryItem[] }`
   (keep `m_apIndex`, keep each `readInventoryItem(r, slot)`) before `dwPetId`. Add the fields to `OwnCharacter`
   (`world/types.ts:409-`), optional, so old tests still type.
2. New `world/bank.ts` (and `world/post.ts`): `BankMessageType` ids, `BankMessage` union, readers (use
   `readInventoryItem(r)` for a `CItemElem` with its object id), `BANK_READERS`, `isBankMessage`; encoders
   `encodePutItemBank(...)`, `encodeGetItemBank(...)`, `encodePutGoldBank`, `encodeGetGoldBank`, the password ones, the
   post's send/query/remove/get-item/get-gold/read; `BankRequestPacket` + `readBankRequestPacket` for the pretend servers.
   Text fields (mail title/body, receiver name) through a code-page writer like `guildString` (`world/guild.ts:497-509`).
   A 42-slot container reader: generalise `readItemContainer` (`own.ts:129-136`) with a size.
3. Wire: `world/readers.ts` (`...BANK_READERS` beside :218-220), `world/types.ts:19-20` (`| BankMessage | PostMessage`),
   `messages/world.ts` `decodeClientPacket` default (:678-692) and the `WorldPacket` union (:338-343), `index.ts`
   (`export * from './world/bank'`). Direct packets only if the C++ says some come from the core.
4. Tests `packages/protocol/test/bank.test.ts`, `post.test.ts` (readBundle round-trips; `decodeWorldPacket(encodeX())`).

**Testkit (`packages/testkit`)**
5. `src/bank.ts`, `src/post.ts` writers (import `writeItemElem` from `./world`); export from `src/index.ts`. Extend
   `writeAddSelf` (`world.ts:820-874`) with `goldBank` / `playerBank` / `bankSlot` options (today hard-coded 0, :862-864).

**Client model**
6. `OwnState` (`apps/client/src/world/OwnState.ts`): `banks: ItemContainer[]` (from `freshContainer(42)` +
   the ADD_OBJ), `goldBank: number[]`, `bankRevision`; small methods for the client-side moves (`containerAdd` /
   `containerRemove` from `trade/itemContainer.ts`, `addGold`, bump `inventoryRevision`). Decide (see §6.4) whether bank
   messages reach `OwnState.apply` (no `continue`) or the HUD calls these methods (the trade's way).
7. Rules file `apps/client/src/world/bank/bankRules.ts` (pure: drop actions, refusals by TID), tests first.

**Client windows**
8. `apps/client/src/world/hud/bank/bankWindows.ts`: the bank window from APP_COMMON_BANK (resdata.inc:10679-10798, texture
   `WndCommonBank.tga` 528 x 256: three item areas WIDC_BANK_0 / _1 / _3 (tab-control rects 12,10-172,190 /
   184,10-344,190 / 354,10-514,190, each holding a `CWndItemCtrl` of `m_Bank[k]`, `WndBank.cpp:62-72`), three gold statics
   WIDC_BANKGOLD_0-2 (70,198-152,214 ...), three penya spots WIDC_BANKGO_0-2 (42,196-63,217 ...), and WIDC_CUSTOM4-6
   (12,2-156,216 ...) where the not-used cover `WndCommonBankNotUse.tga` goes, `WndBank.cpp:122`); the password windows APP_BANK_PASSWORD
   (:26835) and APP_CONFIRM_BANK (:28095) as ResWindows, fields `type='password'`, `inputMode='numeric'`,
   `pattern='[0-9]*'`, `maxLength=4`, `enterKeyHint='done'`. Cells like `TradeWindow.grid` (32 px, `data-bank-slot`),
   desktop drop of `BAG_DRAG`/`PENYA_DRAG` (§2.2), `dragstart` of a new `application/x-flyff-bank` type.
9. `apps/client/src/world/bank/bankHud.ts`: `BankHud(art, texts, screen: BankHudScreen, doc)` owning the windows, its own
   `TradeGoldWindow` (count / penya), `elements`, `modals`, `handle(objectId, message)`, `request(npcId)`, `reset()`,
   `isOpen`, `tapItem(id)`, `tapPenya()`. Screen callbacks: `send(bytes)`, `say`, `box`, `ownItems`, `ownGold`, `prop`,
   `openInventory`, `reserve`, own-state movers, `canTalk(npcId)`.
10. The bag: accept the bank's drag (a `dragover`/`drop` listener for `application/x-flyff-bank` on `.hud-inventory`, or
    on the bag cells) calling a new `InventoryActions` hook; extend the phone tap hook (`WorldScreen.ts:1764-1772`) with
    `|| bankHud.isOpen` (trade first, then jewels, then bank).
11. Mail: `apps/client/src/world/hud/post/postWindows.ts` - APP_POST (:27030, tab host 320 x 368, `WndTile00.tga`) with
    two tabs (tab strip from `hud/tiles.ts` as `messengerWindow.ts:186-213` / `guildWindow.ts` do): APP_POST_SEND
    (:26928, receiver combo, title edit, body = a textarea in a `custom` control as `GuildNoticeWindow`, item slot
    `WndChgElemItem.bmp`, penya edit, Send) and APP_POST_RECEIVE (:25848, a list drawn in code with `WndPostTable.tga`
    rows); APP_POST_READ (:25539, `ButtReply.tga`, `ButtDelete.tga`, `ButtMoney.tga`, `ButtClose.tga`) and
    APP_POST_DELETE_CONFIRM (:2429). `post/postHud.ts` like the bank's. Send confirm = `MessageBox.open(text, 'okCancel',
    ...)` with `TID_MAIL_SEND_CONFIRM`.
12. New-mail mark: read `self.added.player.mode & Mode.MAILBOX` (or keep a flag set in `onModifyMode`,
    `WorldScreen.ts:3454-3463`); draw `ui/wndmail.png` in the Messenger's WIDC_CUSTOM1 (Neuz's place) and, for the owner's
    HUD icon, a small element (phone: a `MobileTools` button or a badge in `.hud-mobile-tools`; desktop: beside the
    navigator) with `aria-label` = `TID_MAIL_RECEIVE`.

**WorldScreen (`apps/client/src/world/WorldScreen.ts`)**
13. Fields beside `tradeHud` (:497); build in `showWorld` after `TradeHud` (:1734-1762); add to modals (:1803-1808) and
    elements (:1809-1821); route `isBankMessage` / `isPostMessage` in `apply` (:838-1007, beside :862, mind §6.4);
    `MMI.BANKING` / `MMI.POST` in `chooseNpcEntry` (:3565-3612); per-frame walk-away close like the NPC shop
    (`canTalk` :3672-3677, `update()` :2801); teardown (:3857-3892).
14. Cross-checks the other features already comment on: `TradeHud.requestTrade` (`trade/tradeHud.ts:155-159`) and its
    `opened` case (:216-225, `npcShopOpen()`), the personal shop's `busy` (`WorldScreen.ts:3352`), the bag's
    `tradeLimit`-style refusals (bank use/drop TIDs 660/661), BLOCK gu 8 (bank open) in the trade's refusals.
15. `hud/moverMenu.ts`: `MMI.BANKING: 9, POST: 25` and enable them (:79-80); keep MMI 15 (guild bank) filtered for now;
    update `apps/client/test/moverMenu.test.ts:20, :69`.
16. The Custody item 15083: drop it from `WINDOW_IDS` (`items/premiumItems.ts:56-58`) once its use opens the bank, and
    update `apps/client/test/inventoryWindow.test.ts:186` and `itemUse.test.ts:169`.

**Pictures, CSS, tests**
17. `THEME_FILES` (`tools/convert/src/ui/uiStage.ts`, after the guild group :249-259): a dated group with
    `'WndCommonBank.tga', 'WndCommonBankNotUse.tga', 'ButtReply.tga', 'WndPostTable.tga'`; convert with the §9 command;
    the checkpoint lists the same `--only` for the owner's main folder.
18. `style.css`: a bank block and a post block at the end: desktop (`hud-bank`, `hud-post`, Verdana 12 px), and one
    phone block each: joystick hidden while open, the bank as a panel beside the bag (copy trade `:2753-2758`), the post
    fitted whole, words >= 14 px, inputs/textarea 16 px, picture buttons as words (`aria-label`/`data-word`).
19. Unit tests (`apps/client/test/bank*.test.ts`, `post*.test.ts`) in the `tradeHud.test.ts` shape; e2e
    `apps/client/e2e/bank.spec.ts`, `post.spec.ts` in the `jewels.spec.ts` shape (NPC `MaFl_InstantBank` / `MaFl_Juria`,
    `MaFl_Postbox`); run with `.superpowers/playwright.bankmail.config.ts` (port 5185), both projects. Builders run the
    quick tests only; the full suites go to the owner (memory rule).

---------------------------------------------------------------------------------------------------------------------

## Gaps (what is missing today)

1. **Protocol**: no bank or post message ids, readers, encoders or request decoders; the own ADD_OBJ's bank (3 x 42 items,
   `m_dwGoldBank`, `m_idPlayerBank`, `m_nSlot`) is read and dropped (`own.ts:58-79, :142-144`); `OwnCharacter` has no bank
   field; `readItemContainer` is fixed at 73 slots.
2. **Testkit**: no bank/post writers; `writeAddSelf` writes `m_dwGoldBank`/`m_idPlayerBank` as zeros (`world.ts:862-864`);
   `writeItemElem`/`writeItemContainer` are not exported from the package index.
3. **OwnState**: no bank containers, no bank penya, no "add to bag" method outside the trade's consent.
4. **Bag**: takes no drop from another window (`inventoryWindow.ts:423-442` handles only its own drag); the phone tap hook
   is a single object shared by trade and jewels (needs a third taker or a list).
5. **NPC menu**: MMI 9 and 25 missing from `MMI` and greyed; MMI 15 (guild bank) filtered out.
6. **Windows**: no bank, bank password, post, post read, post delete windows; no layouts copied; no multi-tab helper
   beyond the hand-made tab strips (Messenger, guild).
7. **Pictures not converted**: `WndCommonBank.tga`, `WndCommonBankNotUse.tga`, `ButtReply.tga`, `WndPostTable.tga`
   (all present in the client's Theme folder).
8. **Texts**: all needed TIDs found in `texts.json`; window titles (resData.txt) are not converted (typed by hand). Which
   TIDs the bank password windows use is for the C++ research to confirm.
9. **New-mail mark**: only the chat line exists; the Messenger's mail spot is a to-do (`messengerWindow.ts:17`); no HUD icon,
   no place reserved for one (phone row is full-ish: 4 buttons; round 2's 8-icon row is not in main).
10. **Phone number entry**: two styles exist (trade's numeric keyboard field vs the shop's in-game numpad, module-private
    helpers in `vendorWindows.ts`); the owner should pick one for the bank's quantity/penya box.
11. **Test hooks**: `window.__client.own()` exposes no gold or bank (`testHooks.ts:71-75`); e2e must read the DOM or the
    hook must grow.
12. **Cross-feature checks**: the trade, the personal shop and the NPC shop do not know of a bank or post window (comments
    at `tradeHud.ts:155, :218`, `personalShop.ts:69, :323`; `busy` at `WorldScreen.ts:3352`).
13. **Custody item** 15083 is listed as "opens a window the browser lacks" (`premiumItems.ts:56-58`), with tests that expect
    no Use.
14. **Guild bank** (APP_GUILD_BANK, `WndGuildBank.tga`, MMI 15) is out of scope here but shares the bank windows' parts.
