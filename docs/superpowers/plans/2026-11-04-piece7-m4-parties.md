# Piece 7 M4 — Full Parties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser players form parties with each other and with Windows players as in Neuz V15: invite from a
player's menu, the invite box, leave, kick and hand over the lead; the party window, the quick view, the members on the
Navigator and the world map, their names and HP bars; party chat; shared EXP shown from the server; the advanced party
with its name; the party skills on the skills tab and the task bar, with their modes, icons and effects. Every packet is
byte for byte Neuz's.

**Architecture:** In two parts, built in order on one branch.
- **Part A, the party and its windows (Tasks 1-12).** The protocol learns every party message, the player data and the
  direct packets (Task 1) and every party packet the client sends (Task 2). The converter adds the party catalog and the
  party pictures (Task 3). A DOM-free `PartyState` copies `g_Party`, with the player data and the party rules (Task 4).
  The HUD gains a message box and a radio button (Task 5), the player's menu and the invite box (Task 6), the party
  window (Tasks 7-8) and the quick view (Task 9). Party chat, names and HP bars (Task 10), the Navigator and the world map
  (Task 11). Task 12 wires Part A into the world and adds `party.spec.ts`.
- **Part B, the party skills (Tasks 13-15).** The skill tab, the task bar's party skills, their use and the mode icons
  (Task 13). The effects, the music and Part B's wiring (Task 14). The checklist and the checkpoint (Task 15).

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for DOM tests), Playwright (Chromium), Three.js, the FlyffWeb converter.

**Spec:** `docs/superpowers/specs/2026-11-03-piece7-design.md` §3.5 (M4), §4, §5 (M4 row), §7 (M4). Research (cited as
`[R §n]`): `docs/superpowers/specs/2026-11-04-piece7-m4-parties-research.md`. C++ paths are relative to `Blouflash VS22
V15/Source/`.

## Global Constraints

- No server or gateway change: every packet is one Neuz sends, with Neuz's bytes [R §2].
- Each new module opens with the C++ it copies as a `Function  File:lines  what` table, as `hud/logOutBox.ts:1-23` does.
- Server and catalog text goes into the page with `textContent`, never as markup.
- Strings come from the texts catalog (`data.texts`, keyed by TID name), with the English of [R] as the fallback.
- The phone rule is `(max-width: 1000px) and (pointer: coarse)`; phone window text stays at least 14 px.
- Custom server features (`CUSTOM_FEATURES.md`) are out of scope. So are party duels, party quests, guilds, trade,
  the messenger and emotes.
- No new dependency.
- Builders run `npx vitest run <the task's test files>`, `npm run typecheck`, and at most the one browser spec their task
  changes, through `.superpowers/sdd/e2e-5176.config.ts` (Setup). The owner's `dev:client` holds 5174 and M3's builder
  5175: never stop either.
- **M3 runs at the same time** in `FlyffWeb-worktrees/piece7` and touches `WorldScreen.ts`, `WorldSession.ts`,
  `packages/protocol/src/world/readers.ts`, `types.ts`, `constants.ts`, `messages/world.ts`, the task bar
  (`hud/taskBar.ts`, `skills/skillUse.ts`), `style.css` and `docs/device-testing.md`. M4's logic goes in its own modules
  (`apps/client/src/world/party/`, `hud/party/`, `packages/protocol/src/world/party.ts`). In those shared files M4 adds
  lines and changes as few existing ones as it can, so that the rebase onto M3 stays small.
- **The wand fix** (branch `piece7-m2-wandfix`, 1e7d6e3) may reach `main` first. It changes `TapToWalk` (a let-go
  callback), `AttackButton` and `WorldScreen.step`'s let-go; a rebase onto it keeps both.

## Review Focus

1. **A party that changes under an open window.** A member leaves, the party ends or the leader is swapped while the
   party window, the quick view or a box is open: the rows follow the party, a selected member who left is no longer
   selected, the quick view closes below 2 members, and nothing throws. Test: Task 7 Step 1, "the rows follow a leave and
   the end of the party; the selection goes with its member"; Task 9 Step 1, "the quick view closes below 2".
2. **A world change or a log-out mid-party.** `g_Party` is global in Neuz: the party stays through a world change and is
   matched to the new world's movers by player id; a log-out (and Piece 6's reconnect) clears it, and the log-in
   PARTYMEMBER rebuilds it. Test: Task 12 Step 1, "the party stays through a world change; a log-out clears it".
3. **Members out of view with no player data yet.** The windows draw every frame, but each player id is queried once
   (QUERY_PLAYER_DATA), never once a frame: the gateway closes a connection at 100 packets a second. The row shows level 1
   and an empty name until the answer. Test: Task 4 Step 1, "a player is queried once however often it is read".
4. **Unexpected party messages.** A party block of more than 15 members, a PARTYMAPINFO index out of range,
   ADDPARTYCHANGELEADER or SET_PARTY_MEMBER_PARAM for a player not in the party: bounded or ignored, nothing throws, and
   the bundle reads to its end. Test: Task 1 Step 1, "a bundle with every party message is read to its end"; Task 4 Step
   1, "out-of-range and unknown members change nothing".
5. **Taps that repeat.** A mode radio sends only when its value differs from the party's (Neuz); the menu's Invite sends
   one MEMBERREQUEST per choice; the invite box answers once; a party skill sends one PARTYSKILLUSE per tap. Test: Task 8
   Step 1, "a radio sends once, only when it differs"; Task 6 Step 1, "the box answers once".

---

## Setup (once, before Task 1)

The worktree `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece7-m4` (branch `piece7-m4`, from `main` 827c7a0)
already has:
- `npm ci`;
- `dist\assets` copied from `FlyffWeb-worktrees\piece7-m2\dist\assets` (M1's and M2's conversions included);
- `.superpowers\sdd\e2e-5176.config.ts` (git-ignored, port 5176).

One spec runs as `npx playwright test -c .superpowers/sdd/e2e-5176.config.ts <spec> --project=chromium --project=phone`.
Corpus tests need `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'`.

---

# Part A — the party and its windows

### Task 1: The protocol: the party messages, the player data and the direct packets

**Files:**
- Create: `packages/protocol/src/world/party.ts` (the readers), `packages/protocol/src/world/playerData.ts`
- Modify: `packages/protocol/src/world/readers.ts` (the entries), `types.ts` (the messages), `constants.ts`
  (`MessageType`), `chat.ts` (`readSocial`: a party name buffer of 42, [R §9.1]), `packages/protocol/src/messages/world.ts`
  (`decodeWorldPacket`: four direct packets), `apps/client/src/world/WorldSession.ts` (`onCachePacket` hands them on as
  `messages`, as it does the direct chat packets, `:418-423`), `packages/protocol/src/index.ts`,
  `packages/protocol/test/world.test.ts` (the new constants against `MsgHdr.h`)
- Test: `packages/protocol/test/party.test.ts`, `packages/protocol/test/playerData.test.ts` (create)

**Interfaces:**
- Produces: `MessageType` ADDPARTYNAME 0x0068, ADDPARTYCHANGELEADER 0x0079, ERRORPARTY 0x0081, PARTYMEMBER 0x0082,
  PARTYREQEST 0x0083, PARTYREQESTCANCEL 0x0084, PARTYEXP 0x0085, PARTYCHANGETROUP 0x0088, PARTYCHANGENAME 0x0089,
  PARTYSKILL_CALL 0x008a, PARTYSKILL_BLITZ 0x008b, PARTYSKILL_RETREAT 0x008c, SETPARTYMODE 0x008d,
  PARTYSKILL_SPHERECIRCLE 0x008e, PARTYCHANGEITEMMODE 0x008f, PARTYCHANGEEXPMODE 0x0090, SET_PARTY_MEMBER_PARAM 0x0091,
  PARTYMAPINFO 0x003c, QUERY_PLAYER_DATA 0x0141; and the direct types `ERRORPARTY_PACKET` 0xffffff10,
  `UPDATE_PLAYER_DATA` 0xf000f808, `LOGOUT` 0x7000000b, `BLOCK` 0xffffff5a.
- Produces, in `WorldMessage`:

```ts
interface PartyBlock {
  partyId: number; kind: number; level: number; exp: number; point: number; expMode: number; itemMode: number;
  duelPartyId: number; modeTime: number[]; name: string; members: Array<{ playerId: number; removed: boolean }>;
}
interface PartyRequestSide { id: number; level: number; job: number; sex: number }
interface PlayerDataRecord { job: number; level: number; sex: number; version: number; login: number }

| { type: 'partyMember'; playerId: number; leaderName: string; memberName: string; party: PartyBlock | null }
| { type: 'partyRequest'; leader: PartyRequestSide; member: PartyRequestSide; leaderName: string; troup: number }
| { type: 'partyRequestCancel'; leaderId: number; memberId: number; mode: number }
| { type: 'partyExp'; exp: number; level: number; point: number }
| { type: 'partyChangeLeader'; leaderId: number }
| { type: 'partyChangeTroup'; name: string }
| { type: 'partyChangeName'; name: string }
| { type: 'myPartyName'; name: string }
| { type: 'partyItemMode'; mode: number }
| { type: 'partyExpMode'; mode: number }
| { type: 'setPartyMode'; mode: number; skillTime: number; on: boolean; point: number | null }
| { type: 'setPartyMemberParam'; playerId: number; param: number; value: number }
| { type: 'partyMapInfo'; index: number; pos: Vec3 }
| { type: 'partySkillCall'; pos: Vec3 }          // the envelope's objectId is the receiver
| { type: 'partySkillBlitz'; targetId: number }
| { type: 'partySkillRetreat' }
| { type: 'partySkillSphereCircle' }              // the envelope's objectId is the leader's target
| { type: 'errorParty'; code: number; skill: number | null }
| { type: 'playerData'; playerId: number; name: string; data: PlayerDataRecord }
| { type: 'updatePlayerData'; playerId: number; data: PlayerDataRecord }
| { type: 'playerLogout'; playerId: number }
| { type: 'block'; gu: number; name: string }
```

- [ ] **Step 1: Write the failing tests.**
  - `party.test.ts`:
    - `'PARTYMEMBER reads its party block, the name only for an advanced party'`: a normal party of 2 (kind 0, level 3,
      exp 120, point 15, modes `[0,0,0,0,0]`, members `[{ 70001, false }, { 70002, true }]`) and an advanced one (kind 1,
      name `'Webbies'`); each followed by `u32 0xdeadbeef`, read back.
    - `'PARTYMEMBER with a size of 0 has no block'`: `party: null`.
    - `'reads the request, its cancel, the EXP in exp-level-point order, the modes and the errors'`: PARTYREQEST with the
      sexes as `u8`; SETPARTYMODE on reads its points and off does not; ERRORPARTY 207 reads the skill, 201 does not.
    - `'reads the leader, the troup, the names, the member param, the map info and the four party skills'`.
    - `'a bundle with every party message is read to its end'`: `readBundle` of all of them (a party block of 16
      members among them), then a MOVERMOVED, gives every message and the MOVERMOVED.
    - `'party chat reads a speaker name of 41 bytes'` (str(42), [R §9.1]).
  - `playerData.test.ts`:
    - `'QUERY_PLAYER_DATA reads the name and the 12-byte record'`: job @0, level @1, sex @2, version @4, login @8.
    - `'decodeWorldPacket reads the direct ERRORPARTY, UPDATE_PLAYER_DATA, LOGOUT and BLOCK'`, and `WorldSession` hands
      each on as a message (in `apps/client/test/worldSession.test.ts`).
- [ ] **Step 2: Run them to see them fail.** `npx vitest run packages/protocol/test/party.test.ts
  packages/protocol/test/playerData.test.ts apps/client/test/worldSession.test.ts` — FAIL.
- [ ] **Step 3: Implement** following [R §1] and [R §4]. Strings with `ArReader.string(n)` at the buffers of [R §1.1]
  (42, 33, the ADDPARTYNAME 32, the chat text 260). The block's members are read as the size says; bounding them at 15
  is the state's (Task 4). The direct BLOCK's name is a string of 64.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`. The client's `switch`es over `WorldMessage` take
  the new types in their `default`.
- [ ] **Step 5: Commit** `feat(protocol): the party messages, the player data and the core's direct packets`.

### Task 2: The protocol: the party packets the client sends

**Files:**
- Modify: `packages/protocol/src/world/party.ts`, `playerData.ts` (the encoders), `constants.ts` (`PacketType`),
  `packages/protocol/src/messages/world.ts` (`WorldPacket` and `decodeClientPacket`, `:238-265`, `:327-417`, so that the
  pretend servers read them), `apps/client/src/world/WorldSession.ts` (the senders, with the own player id the session
  already holds, `:169`)
- Test: `packages/protocol/test/party.test.ts`, `apps/client/test/worldSession.test.ts`

**Interfaces:**
- Produces: `PacketType` MEMBERREQUEST 0xffffff17, MEMBERREQUESTCANCLE 0xffffff18, ADDPARTYMEMBER 0xffffff11,
  REMOVEPARTYMEMBER 0xffffff12, CHANGETROUP 0xffffff19, PARTYCHANGELEADER 0xffffff2f, PARTYCHANGEITEMMODE 0xffffff20,
  PARTYCHANGEEXPMODE 0xffffff21, PARTYSKILLUSE 0xffffff1b, BLOCK 0xffffff5a, QUERY_PLAYER_DATA 0xf000f802.
- Produces, each a `Uint8Array`: `encodePartyMemberRequest(ownId, targetId)`, `encodePartyMemberCancel(leaderId,
  memberId, mode)`, `encodeAddPartyMember(leader: PartyRequestSide, member: PartyRequestSide)`,
  `encodeRemovePartyMember(ownId, leaveId)`, `encodeChangeTroup(ownId, name)`, `encodePartyChangeLeader(ownId,
  newLeaderId)`, `encodePartyItemMode(ownId, mode)`, `encodePartyExpMode(ownId, mode)`, `encodePartySkillUse(ownId,
  skill)`, `encodeBlock(gu, ownName, inviterName)`, `encodeQueryPlayerData(playerId, version = 0)`.
- Produces: `WorldSession.sendPartyMemberRequest(targetId)`, `sendPartyMemberCancel(leaderId, memberId, mode)`,
  `sendAddPartyMember(request)`, `sendRemovePartyMember(leaveId)`, `sendChangeTroup(name)`,
  `sendPartyChangeLeader(newLeaderId)`, `sendPartyItemMode(mode)`, `sendPartyExpMode(mode)`, `sendPartySkillUse(skill)`,
  `sendBlock(ownName, inviterName)` (gu 7), `sendQueryPlayerData(playerId)`.
- Produces, in `WorldPacket`: one `kind` per packet above, with its fields by the names of the encoders' parameters.

- [ ] **Step 1: Write the failing tests:**
  - `'encodes the party packets as Neuz does'`, after the header of each type [R §2]:
    - `encodePartyMemberRequest(70001, 70002)` gives `u32 70001, 70002, i32 0`;
    - `encodeAddPartyMember({ id: 70002, level: 20, job: 1, sex: 0 }, { id: 70001, level: 15, job: 4, sex: 1 })` gives
      `70002, 20, 1, u32 0, 70001, 15, 4, u32 1` (the sexes widened to 4 bytes);
    - `encodeChangeTroup(70001, 'Webbies')` gives `70001, i32 1, i32 7, 'Webbies'`;
    - `encodeBlock(7, 'Webby', 'Lead')` gives `u8 7`, then the two names as chat strings (`i32 len`, bytes);
    - `encodeQueryPlayerData(70002)` gives `70002, i32 0`.
  - `'decodeClientPacket reads every party packet back'`.
  - `worldSession.test.ts`: `'the party senders write the own player id first'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Names go out as windows-1252 bytes the way chat text does (`chat.ts:24`, `:38`), not
  `ArWriter.string`, which takes ASCII only. The CHANGETROUP name is always one the name rules passed (Task 8).
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(protocol): the party packets the client sends`.

### Task 3: The party catalog and the pictures

**Files:**
- Create: `packages/formats/src/web/party.ts` (`PARTY_KEY = 'data/party.json'`, `WebParty`, `WebPartySkill`),
  `tools/convert/src/data/partyCatalog.ts`
- Modify: `packages/formats/src/inc/expTable.ts` (`readExpTable(text, file, block = 'expCharacter')`),
  `tools/convert/src/data/gameDataStage.ts` (`data/party.json` as an optional catalog, as the quests are, `:585-603`),
  `tools/convert/src/ui/uiStage.ts` (`THEME_FILES`), `apps/client/src/world/gameData.ts` (`party?: WebParty`, loaded as
  the quests are, `:133`, `:151`)
- Test: `packages/formats/test/expTable.test.ts`, `tools/convert/test/partyCatalog.test.ts` (create; a corpus case)

**Interfaces:**
- Produces:

```ts
interface WebPartySkill {
  id: number; name: string; description: string; icon: string;   // icon: the file under Icon/
  level: number;            // dwReqDisLV
  points: number;           // dwExp
  skillTime: number | null; // ms, null for '='
  sfx: number | null; sfx2: number | null;   // dwSfxObj, dwSfxObj2
}
interface WebParty {
  skills: WebPartySkill[];                    // the 8 rows, by id
  exp: Array<{ exp: number; point: number }>; // expParty rows 0..9
  invalidNames: string[];                     // InvalidName_ENG.inc, lower-case
  letters: string;                            // Letter_ENG.inc's characters
}
```

- [ ] **Step 1: Write the failing tests:**
  - `expTable.test.ts`: `'reads the expParty block: 10 rows, 200 to 500 EXP and 15 points'` (row 0 is 0, 0).
  - `partyCatalog.test.ts`:
    - `'reads a troupe skill row as LoadPropItem does'`: a two-row fixture in `propTroupeSkill.txt`'s columns (70, 79,
      80, 86, 107, 120, 123), `=` read as null;
    - `'reads the invalid names and the letters'`: a UTF-16 fixture with a BOM, lower-cased;
    - corpus: `'the real files give the 8 party skills of [R §8.1], 10 party EXP rows, 127 invalid names and A-Za-z0-9'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** `readPropItem` (`packages/formats/src/inc/propItem.ts:254`) reads the rows, as
  `skillsCatalog.ts:65` does for `propSkill.txt`; the names and descriptions come from `propTroupeSkill.txt.txt`
  (already merged, `formats/src/inc/strings.ts:127`), trimmed. Add to `THEME_FILES`: `ButtLeave.bmp`, `ButtChange.bmp`,
  `ButtTransper.bmp`, `ButtRadio.bmp`, `GauFillSmall.bmp`, `ImgMapArrowParty.bmp`, `GauPartyHpBG.TGA`, `GauPartyHp.TGA`.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`, then convert in this worktree:
  `npm run convert -- --only "ButtLeave*,ButtChange*,ButtTransper*,ButtRadio*,GauFillSmall*,ImgMapArrowParty*,GauPartyHp*,data"`.
  Pass: 0 failed, and `dist/assets/data/party.json` holds 8 skills.
- [ ] **Step 5: Commit** `feat(convert): the party catalog, the party EXP table and the party pictures`.

### Task 4: The party state, the player data and the party rules

**Files:**
- Create: `apps/client/src/world/party/partyState.ts` (`g_Party` and its handlers), `party/playerData.ts`
  (`CPlayerDataCenter`'s client part), `party/partyRules.ts` (the pure rules)
- Test: `apps/client/test/partyState.test.ts`, `playerData.test.ts`, `partyRules.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's messages; Task 3's `WebParty`.
- Produces:

```ts
type PartyEvent =
  | { kind: 'line'; tid: string; args: string[]; color: number | null }  // a chat line; null: the TID's own colour
  | { kind: 'box'; tid: string }                                          // a message box
  | { kind: 'music'; id: number }                                         // BGM_IN_FITUP 25
  | { kind: 'invited'; request: MessageOf<'partyRequest'> }
  | { kind: 'nameBox' }                                                   // the leader's name box again
  | { kind: 'modeOn'; mode: number; skill: number; skillTime: number }
  | { kind: 'modeOff'; mode: number; skill: number }
  | { kind: 'iconsCleared' }
  | { kind: 'changed' };                                                  // members or leader changed

interface PartyContext {
  ownPlayerId(): number;
  inView(playerId: number): boolean;           // prj.GetUserByID
  nameInView(playerId: number): string | null; // for PARTYREQESTCANCEL's lines
}

class PartyState {
  constructor(context: PartyContext);
  apply(message: WorldMessage): PartyEvent[];
  readonly members: ReadonlyArray<{ playerId: number; removed: boolean; pos: Vec3 }>;  // slot 0 the leader
  partyId: number; kind: number; level: number; exp: number; point: number; expMode: number; itemMode: number;
  name: string; savedName: string;          // m_sParty; m_szPartyName from ADDPARTYNAME
  size(): number; isMember(playerId: number): boolean; isLeader(playerId: number): boolean;
  modeOn(mode: number): boolean; reset(): void;
}

class PlayerDataCenter {
  constructor(query: (playerId: number) => void);
  get(playerId: number): { name: string; job: number; level: number; sex: number; version: number; login: number };
  apply(message: WorldMessage): void;
  reset(): void;
}
```

- Produces in `partyRules.ts`: `partyExpNeed(level, table)` and `partyExpText(exp, level, table)` (`"%.2f %%"`), the
  mode-to-skill map `PARTY_MODE_SKILL = [5, 6, 7, 8]`, `fullPartyTid(level)`, `memberBoxColor(member)` and
  `memberTextColor(isLeader)` [R §7.2], `cutName(name, bytes)` (`"..."` after `bytes` bytes), and the job-mark suffix
  `levelMark(job)` (`-M`, `-H`).

- [ ] **Step 1: Write the failing tests:**
  - `partyState.test.ts`, the lines and states of [R §1.1] and [R §3.3]:
    - `'a new party of two: the leader gets "Party has been created." and the member's join; the member gets the
      leader's join; music 25'`;
    - `'a third member joins; one leaves; the own player is kicked: "You have left the party." and the state is empty'`;
    - `'the log-in PARTYMEMBER prints its lines with an empty name'` (Decisions 6);
    - `'SET_PARTY_MEMBER_PARAM marks a member offline; the leader offline swaps slot 0 with the first online member and
      clears the icons'`;
    - `'ADDPARTYCHANGELEADER swaps slot 0 with the new leader'`;
    - `'PARTYEXP stores exp and points; a higher level prints "Party level increased." or, at 10, "...to 10."'`;
    - `'PARTYCHANGETROUP makes it advanced with music 25; PARTYCHANGENAME stores a name, and an empty one gives the
      leader the name box'`;
    - `'SETPARTYMODE on gives modeOn with its skill and the "has been used" line; off the "about to end" line'`;
    - `'ERRORPARTY gives each code's line or box; FULLPARTY by the party level'` (the table of [R §1.3]);
    - `'PARTYREQESTCANCEL's five modes, the name from the invitee in view or empty'`;
    - `'PARTYMAPINFO stores the position of a member out of view only'`;
    - `'out-of-range and unknown members change nothing'`: a block of 16 keeps 15; PARTYMAPINFO index 20; a leader or
      member param for a player not in the party (Review Focus 4).
  - `playerData.test.ts`:
    - `'a player is queried once however often it is read; an empty entry reads level 1 and no name'` (Review Focus 3);
    - `'an answer or an update replaces the entry only when its version is newer; LOGOUT sets login 0'`.
  - `partyRules.test.ts`: `'the EXP needed: the table below 10, ((50 + L) * L / 13) * 10 from 10'` (10 → 460, 20 →
    1070, 40 → 2760); `'the EXP text'` (`120` of 250 at level 3 → `"48.00 %"`); `'the box colours'` (blue, red at 0
    HP, yellow below 10 %, grey out of view, black offline); `'names are cut to 8 bytes plus "..."'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** following [R §1], [R §3], [R §4] and [R §8.3]. The state outlives a world (it goes on the
  screen, Task 12). The lines carry TID names and arguments; the screen turns them into text.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party state, the player data and the party rules`.

### Task 5: A message box and a radio button

**Files:**
- Create: `apps/client/src/world/hud/messageBox.ts` (`CWndMessageBox` MB_OK), `apps/client/src/world/hud/radio.ts`
- Modify: `apps/client/src/style.css`
- Test: `apps/client/test/messageBox.test.ts`, `apps/client/test/radio.test.ts` (create)

**Interfaces:**
- Produces: `class MessageBox { readonly element: HTMLElement; open(text: string, layerWidth: number, layerHeight:
  number): void; close(): void; readonly isOpen: boolean }`: [R §1.3]'s box, modal (`ModalBackdrop`, as
  `logOutBox.ts`), centred; a new `open` replaces the text; OK and Enter close it.
- Produces: `radioButton(doc, art, label: string, rect: ControlRect): { element: HTMLButtonElement; checked: boolean;
  disabled: boolean }` — `ButtRadio.bmp`, six 14 x 14 frames, the label at x 16 centred in height
  (`CTheme::RenderWndButtonRadio`, `ITheme.cpp:1561-1575`). The frame (`RenderWndButton_6Texture`, :1418-1535): enabled
  and neither checked nor pressed, 0 lit (the pointer over it) or 1; enabled and checked or pressed, 2 lit or 3; disabled,
  4, or 5 when checked.

- [ ] **Step 1: Write the failing tests:** `'the box shows its text, replaces it on a second open, and closes on OK and
  Enter'`; `'a radio shows the state of checked, disabled and the press'` (the background offset of each state).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the message box and the radio button`.

### Task 6: The player's menu, the invite and the invite box

**Files:**
- Create: `apps/client/src/world/party/playerMenu.ts`, `apps/client/src/world/hud/party/partyConfirm.ts`
- Modify: `apps/client/src/world/controls.ts` (`WorldPress.alt`; a right press let go at the same point on a mover:
  `onMenuPress`), `apps/client/src/world/hud/moverMenu.ts` (the player entries' labels and fallbacks),
  `apps/client/src/world/party/partyRules.ts` (`inviteCheck`), `apps/client/src/style.css`
- Test: `apps/client/test/playerMenu.test.ts`, `apps/client/test/partyConfirm.test.ts` (create),
  `apps/client/test/controls.test.ts`

**Interfaces:**
- Produces: `playerMenuEntries(): MenuEntry[]` in Neuz's order [R §5.1]: Trade, Add to my list, Invite to join party,
  Follow, View equipment, Cheer, Request Mentor-Pupil Bond; only `MMI_INVITE_PARTY` (6) enabled (Decisions 4).
- Produces: `menuInReach(own: Vec3, target: Vec3): boolean` (`< 20 m`, [R §5.1]).
- Produces: `inviteCheck(party, ownPlayerId): { send: true } | { box: 'TID_DIAG_0007' } | { line: 'TID_GAME_FULLPARTY3' }`.
- Produces: `class PartyConfirm { readonly frame: WindowFrame; readonly isOpen: boolean; open(request, text: string):
  void; onYes: (request) => void; onNo: (request) => void }` — `APP_PARTY_CONFIRM` [R §5.4].
- Produces: a new last parameter of `TapToWalk`, `onMenuPress?: (mover: number) => void`, and `WorldPress.alt: boolean`
  (the Alt key held as the press went down).

- [ ] **Step 1: Write the failing tests:**
  - `playerMenu.test.ts`: `'the entries in Neuz's order, Invite alone enabled'`; `'the menu is in reach under 20 m'`;
    `'the invite checks: not the leader gives the box, 8 members the line, else send'`.
  - `partyConfirm.test.ts`: `'shows "<leader> invites you to join the party. Do you accept?"'`; `'Yes calls onYes with
    the request, No and the close button onNo'`; `'the box answers once'`: Yes then a click on No calls only onYes
    (Review Focus 5).
  - `controls.test.ts`: `'a right press let go at its point on a mover is a menu press; moved, it is not'`; `'a press
    with Alt held says so'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** following [R §5]. The right press is the V15 `OnRButtonUp` rule (`point ==
  m_ptMouseSpot`): the same client point, no 8 px slack. The camera's right drag stays as it is.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the player's menu, the invite checks and the invite box`.

### Task 7: The party window: its upper half and the member list

**Files:**
- Create: `apps/client/src/world/hud/party/partyWindow.ts`, `apps/client/src/world/hud/party/memberList.ts`
- Modify: `apps/client/src/style.css` (the window; on phones a full-screen panel, as the inventory, `style.css:1644-1664`)
- Test: `apps/client/test/partyWindow.test.ts` (create)

**Interfaces:**
- Consumes: Task 4's `PartyState`, `PlayerDataCenter`, the rules; Task 5's radio.
- Produces:

```ts
interface MemberView {
  playerId: number; inView: boolean; removed: boolean; level: number; job: number; jobName: string; name: string;
  hp: number; maxHp: number;
}
interface PartyView { party: PartyState; ownPlayerId: number; members: MemberView[]; exp: WebParty['exp'] }
function memberRows(view: PartyView, selected: number | null): MemberRow[]   // [R §7.2]'s row
class PartyWindow {
  readonly frame: WindowFrame;
  update(view: PartyView): void;           // every frame while open, as OnDraw
  selected: number | null;                 // a player id
  onSelect: (playerId: number | null) => void;   // the screen sets the focus
}
```

- [ ] **Step 1: Write the failing tests:**
  - `'the upper half: "Party" or the party's name, the level, the EXP text, the points'`;
  - `'a row per member in slot order: the box colour, the leader green with "L", the job's name, the cut name, the HP
    bar in view only'` (110 px at full HP, 55 at half);
  - `'a click selects a row; another member in view becomes the target, the own row clears it, a far member leaves
    it'`;
  - `'the rows follow a leave and the end of the party; the selection goes with its member'` (Review Focus 1).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** the layout of [R §7.2] (the rectangles as constants with their `resdata.inc` lines). The
  panels sit in the tab control's client area less its 18 px strip; the "Information" tab is the list, "Skill" is Task
  13's.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party window and its member list`.

### Task 8: The party window's buttons, radios and boxes

**Files:**
- Create: `apps/client/src/world/hud/party/partyBoxes.ts` (`CWndPartyLeaveConfirm`, `CWndPartyChangeTroup`,
  `CWndPartyChangeName`)
- Modify: `partyWindow.ts`, `party/partyRules.ts` (`leaveTarget`, `handOverCheck`, `troupNameCheck`, `modeChoice`)
- Test: `apps/client/test/partyWindow.test.ts`, `apps/client/test/partyBoxes.test.ts` (create),
  `apps/client/test/partyRules.test.ts`

**Interfaces:**
- Produces in `partyRules.ts`:
  - `leaveTarget(party, ownId, selected: number | null): number` — the selected member for a leader, else the own id;
  - `handOverCheck(party, ownId, selected): { send: number } | { line: string }` [R §6.2];
  - `troupNameCheck(name: string, catalog: WebParty): { send: string } | { box: string } | { stay: true }` [R §6.4];
  - `modeChoice(party, ownId, kind: 'item' | 'exp', value: number): { send: true } | { box: 'TID_DIAG_0008' } | null`
    (null: nothing to send).
- Produces: `PartyWindow` callbacks `onLeave(leaveId)`, `onHandOver(playerId)`, `onChangeTroup()`, `onQuick()`,
  `onItemMode(mode)`, `onExpMode(mode)`; `class PartyBoxes { leave(id, isKick): void; changeTroup(): void;
  changeName(prefill: string): void; onLeaveYes: (id) => void; onName: (name) => void }`.

- [ ] **Step 1: Write the failing tests:**
  - `partyRules.test.ts`: `'leave: the leader kicks the selected, a member always leaves'`; `'hand over: not the
    leader, offline and the own row each give their line'`; `'the name rules in order'` (`'  Ab1 '` too short, `'1abc'`
    a digit first, `'ab cd'` a space, a banned word, `'Advance Party'` stays, `'Webbies'` sends);
    `'a radio sends once, only when it differs; EXP only in an advanced party; a member gets TID_DIAG_0008'` (Review
    Focus 5).
  - `partyWindow.test.ts`: `'Leave, Hand Over and the quick button need 2 members; Change a leader at level 10'`.
  - `partyBoxes.test.ts`: `'the leave box asks TID_DIAG_0084 or 0085; Yes calls onLeaveYes'`; `'the convert box opens
    the name box, filled with the saved name or "Advance Party"'`; `'a refused name keeps the box open with its
    message'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** following [R §6] and the layouts of [R §6.1] and [R §6.4]. The radios are set from the
  party at every `update`, so an unconfirmed click snaps back. The tab switch gives no box (Decisions 8).
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party window's buttons, modes and boxes`.

### Task 9: The quick view and the P key

**Files:**
- Create: `apps/client/src/world/hud/party/partyQuick.ts`
- Modify: `party/partyRules.ts` (`partyToggle`), `apps/client/src/world/hud/taskBar.ts` (`TaskBarWindow`, `WINDOWS`,
  `MENU`: Party, `:55`, `:64`, `:91`), `apps/client/src/style.css` (the phone place, Decisions 10)
- Test: `apps/client/test/partyQuick.test.ts` (create), `partyRules.test.ts`, `apps/client/test/taskBar.test.ts`

**Interfaces:**
- Produces: `partyToggle(windowOpen: boolean, quickOpen: boolean, size: number): { window: boolean; quick: boolean }`
  [R §7.1].
- Produces: `class PartyQuick { readonly frame: WindowFrame; update(view: PartyView): void; onSelect: (playerId) =>
  void; onDetail: () => void }` [R §7.3]: `60 + 34n` tall, opened at (30, screen height / 4) on the PC.
- Produces: the Start menu's Party and the P key open `'party'` through `actions.open`.

- [ ] **Step 1: Write the failing tests:**
  - `partyRules.test.ts`: `'P opens the window (and the quick view with 2 members), closes both, or the one open'`.
  - `partyQuick.test.ts`: `'a row per member: "level. name", cut to 13 bytes; the leader green after the HP tests; the
    HP bar 108 px wide'`; `'only the clicked member is lit'` (Decisions 9); `'the quick view closes below 2'` (Review
    Focus 1).
  - `taskBar.test.ts`: `'P and Start → Party open the party window'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party quick view and the P key`.

### Task 10: Party chat, the party's names and the HP bars over members

**Files:**
- Create: `apps/client/src/world/render/PartyHpBars.ts`
- Modify: `apps/client/src/world/hud/chatWindow.ts` (the Party view sends to the party while in one, `:88`),
  `apps/client/src/world/render/nameTags.ts` (`playerColor` with the party, `:87`), `render/NameTagLayer.ts` (a
  recolour of the tags in place)
- Test: `apps/client/test/chatWindow.test.ts`, `apps/client/test/nameTags.test.ts`, `apps/client/test/partyHpBars.test.ts`
  (create)

**Interfaces:**
- Produces: `ChatWindow.setParty(inParty: boolean)`: with the Party view chosen and a party, a typed line goes out as
  `send('party', text)` (`/partychat`, Neuz's `/p` channel, [R §9.1]).
- Produces: `playerColor(…, inParty: boolean)`: `COLOR_PARTY` `0xff70f070` for a party member whose colour is the
  general one, the own player included [R §9.2]; `NameTagLayer.recolor(movers, tagOf)`: every tag's colour again.
- Produces: `class PartyHpBars { readonly element: HTMLDivElement; update(camera, members: Array<{ objectId: number;
  head: Vec3; hp: number; maxHp: number }>, heightPx: number): void; dispose(): void }` [R §9.3], as `ChargeGauge.ts`
  places its gauge, but 34 px up.

- [ ] **Step 1: Write the failing tests:**
  - `chatWindow.test.ts`: `'in a party, the Party view sends to the party; out of one, it sends nearby'`.
  - `nameTags.test.ts`: `'a party member's name is 0xff70f070 unless another colour came first'`; `'recolor changes
    the tags in place'`.
  - `partyHpBars.test.ts`: `'a bar per member in view and in front, none for the own player; the fill 112 × HP / max
    texture px at 0.8 × 0.55'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** The party chat's bubble is the existing bubble (Decisions 11).
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): party chat, the party's name colour and the HP bars over members`.

### Task 11: The members on the Navigator and the world map

**Files:**
- Create: `apps/client/src/world/party/partyMarks.ts` (`navigatorKind`, `partyMapMarks`)
- Modify: `apps/client/src/world/hud/worldMap.ts` (`update` draws the party's arrows and names, `:235`),
  `apps/client/src/world/worldMapRules.ts` (`partyArrowAngle`)
- Test: `apps/client/test/partyMarks.test.ts` (create), `apps/client/test/worldMap.test.ts`

**Interfaces:**
- Produces: `navigatorKind(mover: Mover, party: PartyState): NavigatorKind` — `'party'` for a member in view, after the
  NPC and monster kinds [R §9.4] (no guild data: Decisions 12).
- Produces: `partyMapMarks(party, ownPlayerId, inViewPos: (playerId) => Vec3 | null, names: PlayerDataCenter):
  Array<{ pos: Vec3; name: string }>` — each member not offline and not oneself, at its mover's position in view, else
  its stored one [R §9.5].
- Produces: `WorldMap.update(..., party: Array<{ pos: Vec3; name: string }>)`: `ImgMapArrowParty.bmp` turned by
  `partyArrowAngle(pos)` (`WorldMap.cpp:595-598`), the name in `0xffffff7f`.

- [ ] **Step 1: Write the failing tests:** `'a member in view is a party dot, another player a player dot'`; `'the map
  marks: in view from the mover, far from PARTYMAPINFO, none offline, none for oneself'`; `'the world map draws a party
  arrow with its yellow name'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party on the Navigator and the world map`.

### Task 12: Wiring Part A into the world, and `party.spec.ts`

**Files:**
- Modify: `apps/client/src/world/WorldScreen.ts` (the state, the windows, the routing, the presses, the events),
  `apps/client/src/world/WorldState.ts` (`moverByPlayerId(playerId)`), `packages/testkit/src/world.ts` and
  `packages/testkit/src/index.ts` (the writers), `apps/client/e2e/worldHarness.ts` (helpers if needed)
- Create: `apps/client/e2e/party.spec.ts`
- Test: the e2e spec, and the unit tests of the files touched

**Interfaces:**
- Consumes: Tasks 1-11.
- Produces in the screen:
  - `PartyState` and `PlayerDataCenter` on `WorldScreen`, made once and kept through `enter` (a world change), reset
    by a log-out and a reconnect; party messages go to them before `world.apply`;
  - their events: lines through the HUD's lines with the TID colours of [R], boxes through `MessageBox`, music through
    the sounds, `invited` to the invite rule (a box open → `sendBlock`), `changed` to `NameTagLayer.recolor`;
  - the presses (the `TapToWalk` callback, `WorldScreen.ts:995-1002`): a player with Alt, a right press let go on a
    player, or on a phone a tap on the focused player opens the player's menu in reach (`menuInReach`), else the walk
    to it, as `pressNpc` does for an NPC;
  - `drawHud`: the party window and the quick view `update`d while open, `PartyHpBars`, the Navigator kinds, the world
    map's party marks, `ChatWindow.setParty`.
- Produces in the testkit: `writePartyMember`, `writePartyRequest`, `writePartyRequestCancel`, `writePartyExp`,
  `writePartyChangeLeader`, `writePartyChangeTroup`, `writePartyChangeName`, `writeMyPartyName`, `writePartyItemMode`,
  `writePartyExpMode`, `writeSetPartyMode`, `writeSetPartyMemberParam`, `writePartyMapInfo`, `writePartyChat`,
  `writePartySkillCall`, `writePartySkillBlitz`, `writePartySkillRetreat`, `writePartySkillSphereCircle`,
  `writeErrorParty`, `writeQueryPlayerData` (each a `ScriptMessage`, as `writeSetSkillState`, `world.ts:208`); and the
  direct packets as raw bytes for `gateway.pushCache`: `directErrorParty(code)`, `directUpdatePlayerData(id, record)`,
  `directLogout(id)`, `directBlock(gu, name)`.

- [ ] **Step 1: Write the failing tests** in `party.spec.ts` (Chromium desktop and phone), with Webby (player 70001)
  and a second player in view (Lead, player 70002):
  1. `'invite from the player menu: MEMBERREQUEST; the new party fills the window and the chat'`: the desktop opens the
     menu with a right click on Lead, the phone with a second tap; Invite sends `[70001, 70002, 0]`; the script's
     PARTYMEMBER (a new party of two) gives "Party has been created." and "Lead has joined the party."; P opens the
     party window: two rows, Webby's with "L", Lead's HP bar 110 px at full HP; the quick view shows two rows.
  2. `'an invite received: the box, Yes sends ADDPARTYMEMBER with the request's values, a second invite meanwhile sends
     BLOCK'`.
  3. `'party chat: the Party view sends /partychat; a PARTYCHAT shows its line'`.
  4. `'the leader's item radio sends PARTYCHANGEITEMMODE once; the echo checks it'`.
  5. `'a member out of view is queried once; the answer names its row'`.
  6. `'the party stays through a world change; a log-out clears it'` (Review Focus 2): a REPLACE to another world keeps
     the window's rows; after a log-out and a new entry, the window is empty until the log-in PARTYMEMBER.
- [ ] **Step 2: Run it to see it fail.** `npx playwright test -c .superpowers/sdd/e2e-5176.config.ts
  apps/client/e2e/party.spec.ts --project=chromium --project=phone` — FAIL.
- [ ] **Step 3: Implement** the wiring and the writers.
- [ ] **Step 4: Run it to see it pass**, with the unit tests of the files touched and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): parties in the world, and party.spec.ts`.

# Part B — the party skills

### Task 13: The party skills: the skill tab, the task bar, their use and the mode icons

**Files:**
- Create: `apps/client/src/world/hud/party/partySkillTab.ts`, `apps/client/src/world/hud/party/partyBuffRow.ts`
- Modify: `party/partyRules.ts` (`partySkillCheck`), `partyWindow.ts` (the Skill tab), `skills/skillUse.ts` (a type-2
  shortcut goes to `onPartySkill`, `:89-90`, `:215-222`), `hud/taskBar.ts` (a type-2 slot's icon and tooltip, `:630-635`,
  `:946`), `hud/taskBarEdits.ts` (a type-2 shortcut may be dropped, `:189-194`), `WorldScreen.ts` (the use, the icon row)
- Test: `apps/client/test/partySkillTab.test.ts`, `apps/client/test/partyBuffRow.test.ts` (create),
  `partyRules.test.ts`, `apps/client/test/skillUse.test.ts`, `apps/client/test/taskBar.test.ts`

**Interfaces:**
- Produces: `partySkillCheck(party, ownId, skill: WebPartySkill, iconRunning: boolean): { send: true } | { box: string
  } | { line: 'TID_GAME_NOT_TIME'; args: [string] } | null` [R §8.2] (null: nothing, no message).
- Produces: `class PartySkillTab { readonly element: HTMLElement; update(party, catalog): void; onUse: (skill) => void;
  onDrag: (skill) => void }` [R §7.2]: the 3 x 3 grid, red names and dim icons when not usable, the tooltip.
- Produces: `class PartyBuffRow { readonly element: HTMLElement; update(buffs: MoverBuffs, catalog, shown: boolean,
  now: number): void }` [R §8.4]: from x = width/2 − 100, y 10, 37 px to the left each, `blink` and `buffTooltip` of
  `hud/buffStatus.ts`; `shown` while mode 4 is on or the leader is in view. The icons are a `MoverBuffs` (M2's,
  `buffs.ts:34`) fed by `modeOn` (`add(BUFF_SKILL, skill, 1, skillTime, now)`) and cleared by `iconsCleared`.
- Produces: `SkillUse.onPartySkill: (skill: number) => void`, which the screen sets.

- [ ] **Step 1: Write the failing tests:**
  - `partyRules.test.ts`: `'party skill use: not advanced or under 2 nothing; not the leader TID_DIAG_0047; the level
    TID_DIAG_0019; a mode still on TID_GAME_NOT_TIME (none for Call, Blitz, Retreat); else send'`.
  - `partySkillTab.test.ts`: `'8 skills in a 3 x 3 grid, the 9th empty; red and dim below the level or in a normal
    party'`; `'a double click uses, a drag makes a type-2 shortcut'`.
  - `partyBuffRow.test.ts`: `'a mode on adds its icon with its time; it blinks in its last 20 s and goes at its end;
    hidden while the leader is out of view'`.
  - `skillUse.test.ts`: `'a type-2 shortcut goes to onPartySkill, one call per tap'` (Review Focus 5).
  - `taskBar.test.ts`: `'a type-2 slot shows its party skill's icon; a party skill may be dropped on the applet and
    item rows'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** The screen's `onPartySkill` runs `partySkillCheck` and sends `sendPartySkillUse`.
- [ ] **Step 4: Run them to see them pass**, then `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party skills on the skill tab and the task bar, and the mode icons`.

### Task 14: The party skills' effects, the music, and Part B in the world

**Files:**
- Create: `apps/client/src/world/fx/partyEffects.ts`
- Modify: `apps/client/src/world/fx/EffectManager.ts` (`EffectRequest.angle?: number`, a heading of its own, `:29-32`,
  `:135-179`), `apps/client/src/world/WorldScreen.ts` (the party skill messages and the mode events to the effects, the
  music), `apps/client/e2e/party.spec.ts`
- Test: `apps/client/test/partyEffects.test.ts` (create), `apps/client/test/effectManager.test.ts`

**Interfaces:**
- Produces: `partyEffects(message, context): EffectRequest[]` for PARTYSKILL_CALL, BLITZ, RETREAT, SPHERECIRCLE and
  `modeOn` [R §8.4], [R §8.5]: Call's XI 1501 on the leader and XI 1500 on oneself at scale 1.1 with the heading to the
  leader; Blitz's XI 1502 on the target at `maxY × scale.y − 0.7 × scale.y`; Retreat's XI 1503 on each member in view;
  Precision's XI 1504 on the leader; the modes' XI on the leader at 0.8, 0.7 and 1.0; Resting's XI 1507 on each sitting
  member in view, then XI 1508 looping while it sits and the mode is on.
- Produces: the music `BGM_IN_FITUP` (25, `audio/soundIds.ts`) on a new party and the change to an advanced party.

- [ ] **Step 1: Write the failing tests:**
  - `partyEffects.test.ts`, one per message of [R §8.5] and per mode, with the XI, the mover, the scale and, for Call,
    the heading (leader 10 m east → 90°); `'Resting's loop ends when its mover stands or the mode goes off'`.
  - `effectManager.test.ts`: `'an effect with an angle keeps that heading while it follows its mover'`.
  - `party.spec.ts`, two more:
    7. `'an advanced party at level 20: the Skill tab, and a task bar party skill sends PARTYSKILLUSE'` (the own
       TASKBAR has Linked Attack, type 2, id 5).
    8. `'SETPARTYMODE on: the icon at the top, the chat line, the effect on the leader; off: the line'`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** The effect files are converted already [R §8.5].
- [ ] **Step 4: Run them to see them pass**, with the unit tests touched and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(client): the party skills' effects and the party music`.

### Task 15: The owner's checklist and the checkpoint

**Files:**
- Modify: `docs/device-testing.md` (a "Piece 7, milestone 4: parties" section), `README.md` (one line on what M4 adds)
- Create: `docs/piece7-m4-checkpoint.md`

- [ ] **Step 1:** In `device-testing.md`, add steps on the PC and a landscape phone, each with its pass mark. Two
  browser characters (two accounts) in Flaris, near each other; a GM on one of them for `/partylevel <level> [points]`
  (`/plv`, [R §8.3]):
  1. **Forming:** A opens B's menu (PC: right click; phone: a second tap) and invites; B's box, Yes; both see "Party has
     been created." / the join lines, the green names, the HP bars over the other.
  2. **The windows:** P (and Start → Party): the window and the quick view; on the phone the window full screen and the
     quick view under the status window; a tap on a row selects the other as the target; Assist's heal on it (M2).
  3. **EXP:** a kill near each other: PARTYEXP's EXP and points change in the window.
  4. **Chat:** the Party chat view sends; the other gets the line and the bubble.
  5. **Lead and leave:** hand over the lead; the other leaves; a kick; the end of the party.
  6. **Advanced:** `/plv 10`, Change, a name (a refused one first); the window's name; `/plv 20 100`: the Skill tab;
     Call and Linked Attack from the task bar: their effects, the icon at the top, the chat lines.
  7. **Far:** walk apart past view: the row turns grey, the world map shows the other's arrow (within 10 s).
  8. **A Windows player in the party:** part of M6's live session.
- [ ] **Step 2:** Write `docs/piece7-m4-checkpoint.md`: what was built with each task's commits; the decisions below
  and the ledger's rulings; the owner's commands with what "pass" means (`npm test`, `npm run typecheck`, `npm run
  test:corpus` with `FLYFF_CLIENT`, `npm run test:e2e:client` about 10 min); the conversion command of Task 3 Step 4.
- [ ] **Step 3: Commit** `docs(piece7): M4 checklist and checkpoint`.

---

## Decisions this plan makes

1. **Execution:** the Native route, as M0-M2, with one fresh review of the whole branch at the end (the owner values
   speed). The owner confirms at the plan review.
2. **Two parts, one checkpoint.** Part A (the party, its windows and its marks) and Part B (the party skills) are built
   in order; the owner checks both at the end.
3. **The party lives on the world screen.** `g_Party` is a global in Neuz, so the state survives a world change and is
   cleared by a log-out or a reconnect; members are matched to movers by player id.
4. **The player's menu** lists Neuz's entries in its order with only "Invite to join party" enabled (the rest greyed, as
   M0's NPC menu does). The guild invite and the duels are left out: no guild data, duels out of scope.
5. **Opening it:** on the PC a right click on a player (V15) or Alt + a click; on a phone a tap on the player already
   selected, since a phone has no right button. Farther than 20 m the player walks to it instead, as Neuz.
6. **The log-in lines are Neuz's**, empty names included ("Party has been created." / " has joined the party." when the
   party is sent at log-in), as Windows players see them.
7. **The "accept party invites" option** (`g_Option.m_bParty`, on by default) has no switch in the browser: invites are
   always shown, so mode 3 is never sent.
8. **No box for a member who switches the party window's tab.** Neuz's catch-all `else` shows TID_DIAG_0008 on the tab
   change too; the browser shows it for the radios only.
9. **The quick view lights only the clicked member.** Neuz lights every member out of view while no member in view is
   clicked (two NULL pointers equal); the browser does not copy that.
10. **Phones:** the party window is a full-screen panel; the quick view sits under the status window at the status
    window's phone scale, and M2's buff row moves to the right of the status window to make room.
11. **Party chat's bubble** uses the existing bubble; Neuz's party frame (`texDialogBoxParty`) is not converted. The
    chat line keeps Piece 5's style.
12. **The Navigator** shows party members in view; a guild member shows as a party dot (no guild data).
13. **The HP bars over members** use `GauPartyHp.TGA` only; the debuff picture is left out (the browser does not
    follow the stun and poison states after ADD_OBJ).
14. **The world map's member arrows** turn by Neuz's rule (their position, not a heading), so they match the Windows
    client.
15. **Resting's auto-sit is not copied:** the browser's player cannot sit yet (emotes are out of scope). Resting's effect
    still shows on sitting members in view.
16. **The FULLPARTY texts** are Neuz's, with their wrong member counts.
17. **The party catalog is optional** (`data/party.json`): without it the party works and the party skills are
    unavailable.
18. **Unknown or malformed party messages** are read as the readers read any message; a value out of range is ignored by
    the state.
19. **The invite box has no timeout and cannot be withdrawn**, as in Neuz ([R §5.4]: no timer, and no packet withdraws
    an invite). The spec's "cancelled when the inviter withdraws or it times out" was written before the research. A
    timeout could only send No's packet, which the inviter's client reads as "has refused to join the party".
