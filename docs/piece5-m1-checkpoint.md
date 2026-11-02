# Piece 5 milestone 1 — owner checkpoint

**Accepted by the owner on 2026-10-30:** “Milestone 1 pass.” The Milestone 2 prerequisite is cleared. The checklist below is retained as a reference for testing.

The converted assets were copied from the Piece 4 worktree into this Piece 5 worktree.

Owner feedback fixes (2026-10-29): mouse/keyboard use hides touch controls, joystick capture survives transfer from the canvas, windows can reach the left edge, and Attack/Jump use new vector icons. Reload the game page before checking these fixes; asset conversion is not needed.

Latest controls: WASD moves the character; arrows rotate the camera. Both camera drag axes and the matching arrow directions are reversed from the first M1 build. Jump responds on touch-down so a second finger can jump while the joystick remains held. Browser zoom gestures/shortcuts and default double-click actions are blocked in the game; game double-tap targeting still works.

## Start the correct client

Use the Piece 5 worktree on the PC:

```powershell
Set-Location -LiteralPath 'C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece5-items-chat'
$env:GATEWAY_PROXY = 'ws://<VM-IP>:8090'
npm run dev:client
```

Replace `<VM-IP>` with the VM's current address. If port 5174 is occupied by your old client, stop that old dev server in its terminal first. Open `http://<PC-IP>:5174` on your phone and `http://localhost:5174` on the PC. Server/gateway setup follows [servers-in-a-vm.md](servers-in-a-vm.md).

Use a disposable Vagrant with a melee weapon in Flaris. A second logged-in browser account is needed to check how other players see jumping. No special items or penya are needed for this milestone.

## Device checks

Use an iPhone in landscape, an Android phone in landscape, and the PC. Also do a short Firefox check on the PC.

- **Attack spam:** select an Aibatt, then rapidly press Attack for five seconds. The fight continues and the connection stays open. There is no “Too much data was sent” message. Repeat using repeated clicks on the selected target.
- **Tap and camera:** tap different ground points. The character moves there while the view keeps its direction. Turn the PC view with right-button drag or the arrow keys; both use the reversed camera direction. Arrows leave the character standing; WASD still moves. A camera drag neither walks nor selects a target. Browser context menus, page zoom and default double-click behavior do not interrupt the game.
- **Two fingers:** touch the left part of the play area to show the floating joystick. Forward moves toward the view. While holding it, tap an NPC/player/mob with another finger; it selects without rotating the camera. Drag with that finger to turn the camera; horizontal motion is stronger and vertical motion gentler. Letting go stops the joystick. Returning from another tab/app does not leave a held input behind. On PC, moving the mouse or using the keyboard hides these touch controls.
- **Jump:** Space on PC and the smaller button above Attack on the phone jump once per press. Keep the joystick held and press Jump with a second finger. Change joystick direction while rising and falling to adjust the landing spot; releasing it stops horizontal travel. Also start a standing jump, then move the joystick while airborne. On desktop, jump while moving forward and use A/D to change direction; releasing A/D stops the turn. Check a wall/low ceiling and normal movement after landing. The second browser sees the player jump, change direction and land.
- **Window shortcuts:** mobile has Skill, Character and Stats buttons at top right. Each opens/closes its existing window or panel. These shortcuts are hidden on desktop. Fullscreen is removed.
- **Relocation:** die and use the lodestar. The camera settles into the relocated view over about half a second and keeps the chosen direction.
- **Phone layout:** windows occupy about half their PC area; the HP/MP/FP status window is another 10% smaller in width and height. Status/Character/Skills text stays readable and controls can still be pressed. Windows can be dragged to the left screen edge. The taskbar stays centered on the full screen, even with an asymmetric notch, with equal side gutters and no gap under it at the game viewport bottom. The taskbar cancels the HUD's bottom safe-area inset; other fixed controls retain their spacing. The debug overlay starts folded behind top-right Stats. Open it to inspect errors, then fold it again. There is no stray J above the bar.
- **Combat gait:** toggle walking with X, select a monster, and start attacking through another target press or Attack. The character switches to running to approach it. Stopping the attack keeps run mode until you change it again.
- **Background session:** after updating and restarting the gateway, enter the world and leave the tab/window unfocused for several minutes. Return to the same session, with released controls. Closing the tab releases its session. A browser-discarded tab, network loss, server shutdown or explicit logout can still disconnect.
- **Input isolation:** open and close the revive/stat/skill confirmation windows. Their controls work, and held movement/camera input does not survive opening a modal. The normal context menu remains available in login text boxes for pasting.

Pass means every item works, with no disconnect or newly reported missing model/motion file. Send back the device/browser, the failed bullet, and a screenshot or Stats error text when one fails.

## Automated and VM checks

The implementation already passed unit tests, typecheck and the focused controls browser spec. The browser run used installed Chrome on temporary port 5175 because the default Playwright browser was not installed and port 5174 was occupied. You do not need to repeat that focused run.

At the milestone checkpoint, run the broader checks on the PC in the Piece 5 folder:

```powershell
$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'
npm run test:corpus
npm run test:e2e
npm run test:e2e:client
```

Playwright needs its matching Chromium build before these broader browser runs: `npx playwright install chromium`. Corpus normally takes minutes; full software-WebGL browser suites can take tens of minutes. Pass means no failed test. If one fails, send the test name and final error section; do not repeat the whole suite.

Copy the updated FlyffWeb code and converted assets to the VM using the existing guide, preserving the VM's local gateway/live configuration files. In that VM copy run:

```powershell
npm run test:live:world
```

Pass means configured live legs pass (a skipped leg does not prove that behavior). Then complete the two-browser jump and attack-spam checks above against those servers. Neuz is not required.
