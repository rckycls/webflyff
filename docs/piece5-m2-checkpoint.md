# Piece 5 milestone 2 — items checkpoint

Owner accepted Milestone 2 on 2026-10-30. Milestone 3 is unblocked. Run the client from the existing Piece 5 worktree against the gateway in the Hyper-V VM; no additional C++ server patch is required for these native item requests.

Automated verification: 263 focused tests across nine files passed; repository typecheck passed; the items browser flow passed in desktop Chromium and landscape phone. The final phone rerun also checks actual touch scrolling; its full-screen layout was inspected from a screenshot. A fresh review found a native secondary-equipment-slot issue, fixed with regression coverage. Full-suite and VM/device acceptance remain owner-run below.

Classic-inventory follow-up: the V15 `WndInventory3D.tga` panel, native equipment rectangles and a dressed full-body preview replace the initial layout. Desktop uses the original 240 × 464 panel; mobile places equipment and the scrolling bag side by side in a nearly full-screen window. Ground icons shrink with distance, with a separate invisible touch target. The follow-up passed 293 focused tests, typecheck and the desktop/phone items browser flow; both inventory screenshots were inspected.

The two inventory theme textures were converted into this worktree's `dist/assets`. When publishing to the VM, include the updated asset index and hashed inventory PNGs alongside the client build. To reproduce only this conversion: `npm run convert -- --client <your-client-folder> --only "WndInventory3D,WndInventoryGarbage"`.

Inventory interaction follow-up: desktop hover shows item details beside the item and leaving hides them; double-click uses/equips/unequips. Drag bag items to other cells, matching equipment slots, an item shortcut, or the game canvas (quantity confirmation before dropping). Mobile equipped items offer only Unequip; bag items offer Equip for gear, Use for food/potions, and Drop. Equipment comes from the native container's equipment positions and icons are checked against slot types. The right-side nearby-items window lists drops within five metres, with individual selection and Pick up all. Ground icons are slightly larger while still shrinking with distance. The preceding interaction pass verified 267 focused tests, typecheck and desktop/phone item flows.

Hover/grid/background follow-up: the tooltip includes the native item description. Both layouts align 32 px item cells with the original panel artwork; mobile reuses a cropped section of that artwork. Wheel events move one row, touch scrolling snaps to rows, and inventory updates retain the scrolled row. Reconvert `--only data` to include native descriptions in existing asset catalogs. Gameplay and animation hit frames now advance from a worker-driven clock independently of visible rendering. Jumping waits for the current swing, preserves toggled attack and resumes swings after landing. Blurring releases held controls without disabling combat. Browser/OS freezing, discarding or device sleep can still suspend execution; this does not move combat authority to the server or guarantee progress while frozen. See [page lifecycle limits](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

Verification for this follow-up: 229 focused tests across seven files, repository typecheck and the production client build passed. The worker is emitted as its own build asset. Desktop and phone browser flows passed for inventory interactions, jump/auto-attack continuity, combat without rendering, existing combat through a kill/level-up, and existing camera/joystick controls. Desktop and phone inventory/details screenshots were inspected. The data-only conversion completed without failures. Full-suite and live VM/device acceptance remain owner-run.

Scroll-speed adjustment: wheel/trackpad bursts advance at most one row per 200 ms; changing direction responds immediately. Touch dragging moves the bag at half the finger's travel, accounting for the mobile panel scale, and settles on a complete row on release. Tapping items still opens their mobile actions.

Mobile reference-layout follow-up (2026-10-31): the inventory now uses the owner's horizontal reference proportions, fills the available height and sits at the right edge. Equipment/character occupy the left half; the right half displays six native grid rows, an Item strip and the penya footer. Both halves share one scale and sit together without the previous empty margins. Native artwork supplies the grid rows and footer; the actual character, items and money remain live. The accepted slower scrolling and mobile context actions are retained.

## Character setup

Use a living Vagrant in Flaris with room in the bag and these catalog items supplied through your existing GM/database setup:

- Lollipop (2800), Biscuit (2801), and a stack of a known Refresher and Vital Drink. Put the same food in two stacks to check merging. Lower HP/MP/FP before testing recovery.
- Wooden Sword (21), a spare starter suit/gauntlets/boots appropriate to the character, and Resurrection Scroll (10431).
- A nearby ground drop owned by the test character, another player's protected drop, and a full-bag case.
- A little penya for the next milestone's shop checks; milestone 2 does not spend penya.

## Owner checks

- Run `npm test` and `npm run typecheck` from the worktree.
- Run `npm run test:e2e:client -- items` in Chromium desktop and landscape phone. Browser executable configuration may be needed locally; the development run used installed Chrome and port 5175, preserving the owner's port 5174 server.
- Desktop: I or Start → Inventory opens the classic movable V15 panel. Hover shows the name, description and known properties beside the item; moving off hides them. Double-click uses/equips, or unequips an equipped item. Phone: Bag opens its two halves side by side, with only the applicable action buttons on selection. Rotate and reopen it. Check icons align with the native grid, the mouse wheel moves one row, and touch scrolling settles on row boundaries.
- Inspect the 42 bag positions and equipment. On desktop, drag between bag cells to swap/merge; drag equipment only to a compatible slot. Confirm swaps and partial/full stack merges against the native inventory after reconnecting. There is no fabricated split packet; drop quantity supports partial stacks.
- Use food, Refresher and Vital Drink from the bag and an F1–F9 shortcut. Check HP/MP/FP and remaining quantities against server responses. Rapid repeat use during server cooldown must not grant extra recovery or consume rejected requests locally.
- On desktop, drag an item to F1–F9 to set a shortcut. On phone, use the character's saved shortcuts. Consume a stack, then check rebinding to another stack and clearing after the last stack. Reconnect to check saved shortcuts.
- Equip and unequip starter gear. Check appearance, combat stats and another player's view. Rejected level/job/sex requirements leave the bag unchanged. Riding equipment is outside this milestone.
- Desktop: drag a bag item onto the world. Mobile: select a bag item and press Drop. Choose a quantity and confirm. A refused drop keeps its count; a successful drop appears in the world. Tapping its world icon or its row in the nearby-items window approaches it and asks the server to collect it. Pick up all processes drops within five metres in sequence; protected/full-bag refusals remain server-controlled. Movement cancels the pickup queue.
- Die with Resurrection Scroll (10431): Revive Here is enabled. It sends native REVIVAL and waits for the server to restore HP and consume the scroll. Without the scroll it is disabled. Lodestar still works.
- Toggle attack, jump, land and confirm attacking resumes. Switch to another tab/window while fighting; confirm the live server continues receiving attacks before returning and inventory reflects server updates. Repeat on the actual phone/browser: OS freezing and device sleep remain platform limitations. Close inventory and confirm accepted camera, joystick and jump behavior remains usable.

Ground drops currently use catalog icons anchored to their 3D positions. Unknown item catalog IDs and invalid/out-of-world positions are skipped. Item counts, equipment and revival are never predicted locally. The server enforces cooldowns, ownership, bag capacity and item restrictions.
