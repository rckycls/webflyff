# Piece 4 research notes

Read-only research into the C++ source and the game files, made on 2026-10-24 for the Piece 4 spec
(`../2026-10-24-piece4-combat-skills-design.md`). Every fact cites `file:line`. Paths without a prefix are relative to
`Blouflash VS22 V15/Source`.

| File | Covers |
| --- | --- |
| [combat.md](combat.md) | selecting, `PickObject_Fast`, the melee attack loop and combo, what the server sends for a hit, a kill, a monster's attack, death and the lodestar revive, the target bar |
| [stats.md](stats.md) | what the server sends and what Neuz computes: max HP/MP/FP, EXP and the EXP table, the Character window's values, stat points (Apply, MODIFY_STATUS, SETSTATE), level up |
| [effects.md](effects.md) | the `.sfx` format and how Neuz plays it, the hard-coded effect classes, which effect plays for a hit, a critical, a miss, level up and each Vagrant skill, damage numbers, the target corners |
| [skills.md](skills.md) | the Vagrant skills and their per-level table, the skill array in ADD_OBJ, raising a skill (DOUSESKILLPOINT), using a skill (USESKILL), the action slot, the task bar (TASKBAR and its edits), skill icons |

The spec says which facts it relies on. Where these notes and the spec disagree, the spec wins. Points marked "derived"
or listed under "Open questions" in a note are not confirmed. The plan's tasks check them against the C++ code
before using them.
