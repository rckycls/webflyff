# Piece 7 M5: Flying Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a level-20 character takes off on a board or broom, flies, fights and lands on the PC and on a phone, within
the gateway's limit, and others see it flying, all by Neuz's rules.

**Architecture:**
- Task 1: the protocol learns the five flight packets the client sends and the six snapshots it reads, and the item
  packets carry the ride's float.
- Task 2: the converter keeps the rides' flight columns and the worlds without flight.
- Tasks 3 and 4: Neuz's flight rules as DOM-free code with fixtures from the C++ numbers.
- Task 5: wires the rules into `ActionMover` and `WorldState`, for the own player, other players and flying monsters.
- Task 6: mounting and landing through the items.
- Tasks 7 and 8: the PC's and the phone's controls, and what they send.
- Task 9: the flight camera.
- Task 10: the ride and the flight motions drawn, and the turbo gauge.
- Task 11: combat in the air.
- Task 12: wiring and `flight.spec.ts`.
- Task 13: the docs.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom for DOM tests), Playwright (Chromium), the FlyffWeb converter.

**Spec:** `docs/superpowers/specs/2026-11-03-piece7-design.md` §3.6 (M5), §4 (M5), §5 (M5 row), §7 (M5) and §9 (the
risk row: "M5's research transcribes the C++ numbers into fixtures before any flight code"). The research, cited as
`[R §n]`, is `docs/superpowers/specs/2026-11-04-piece7-m5-flying-research.md`. C++ paths are relative to
`Blouflash VS22 V15/Source/`.

## Global Constraints

- **No server or gateway change.** Every packet is one Neuz sends, with Neuz's bytes [R §5].
- **The gateway's limit is binding:** 100 client messages in any 1 s. The browser keeps to the traffic test's 50 in
  any 60 rules steps (`apps/client/test/helpers/traffic.ts`, `TRAFFIC_BUDGET`).
- **Physics:** each rule is copied as Neuz writes it, in `Math.fround` arithmetic where Neuz uses `float`. Its test
  pins the C++ number (the research's values).
- **C++ table.** Each new module opens with the C++ it copies as a `Function  File:lines  what` table.
- **Strings** come from `data.texts` by TID name, with the research's English as the fallback.
- **The phone rule** is `(max-width: 1000px) and (pointer: coarse)`. Phone text is at least 14 px.
- **Out of scope:**
  - custom server features;
  - wings' spine attachment (`IK3_WING` draws as a board would; no wing is sold);
  - the board's tail and particles;
  - the Ladolf extra model;
  - the flying monsters' figure-8 (SETMOVEPATTERN).
- No new dependency.
- **Builders run:**
  - `npx vitest run <the task's test files>`;
  - `npm run typecheck`;
  - at most the one browser spec their task changes, through `.superpowers/sdd/e2e-5175.config.ts` (chromium and phone).
- **Ports:** the owner's `dev:client` holds 5174, so never stop it. The M2/M4 session uses 5176.
- **Corpus tests** run with `FLYFF_CLIENT=C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client`.

## Decisions

1. **Neuz's LOOKUP bug is not copied.**
   - In Neuz, `OBJMSG_LOOKUP` calls `SetTurnState`. Going from W straight to S then leaves the look bits at 0xC00: the
     pitch freezes, and PLAYERMOVED2 goes out every tick (60 a second, past the traffic budget).
   - The browser's LOOKUP replaces the look bits, as LOOKDOWN does.
   - Cost: a W-to-S switch climbs at once, where Neuz froze.
2. **The other Neuz quirks are copied,** as they cost no traffic:
   - letting go of Space during a turn keeps the thrust;
   - PLAYERCORR2 carries `turnAngle` in the `angleX` field;
   - PresupposePos2's 1° look and ×1.5 turbo.
3. **The PC's keys are Neuz's:**
   - Space toggles the acceleration, X the turbo;
   - W dives (only above the ground), S climbs;
   - A and D turn;
   - Z tracks the focus, Tab cycles the targets in the air;
   - holding the left button, or Insert, attacks;
   - the mouse steers while the right button is held (Neuz's mode 0). The mode 1 of a right double-click is left out.
   - In flight, the right-button drag steers instead of turning the camera. The arrows still turn the camera.
4. **The phone** (the owner's choice, spec §3.6):
   - the joystick's sideways axis turns (LTURN/RTURN);
   - forward dives (LOOKDOWN, as W), back climbs (LOOKUP, as S);
   - Jump becomes **Accelerate while held**: ACC_START on the press, ACC_STOP on the let-go;
   - a **Turbo** button toggles as X does;
   - a **Land** button uses the worn ride;
   - Attack stays: it attacks the focus as the left button does.
5. **Choosing a target in the air.** Neuz selects no monster by a click while flying (Tab only), which leaves a phone no
   way to aim. In the browser, a click or tap on a killable **flying** monster selects it in the air; Tab and tracking
   stay on the PC. Cost: a PC player can click a flying target where Neuz needed Tab.
6. **Flying monsters** are stepped by Neuz's rules for an `OBJTYPE_FLYING` mover [R §10]:
   - the ground states, with FMOVE as `AngleToVector( angle, -angleX, speed )`;
   - TURNMOVE's `angleX` from `GetDegreeX`;
   - no gravity, and the flight collision.

   Their figure-8 (SETMOVEPATTERN) is left out: they hover at their destination.
7. **The turbo gauge** over the own head copies `RenderTurboGauge`: `GauAccelBG`/`GauAccelInner` (converted in M3), 112 ×
   `tmAccFuel` / 12000, and the white flicker with turbo on. The speed (`|v| × 1080`) shows as a plain number beside it;
   the digital font sheet is not converted.
8. **The camera's flight mode** copies `CBackCamera` in flight [R §4]:
   - it follows the heading and adds `angleX` to its pitch, up to 80°;
   - it smooths by 1/10 a tick;
   - the field of view goes from 45° up to 90° with the turbo, and snaps 2 m behind at 90°;
   - the roll effect is off (Neuz's default).

   On landing the camera keeps its last heading, as the browser's ground camera does.
9. **Others' drawn movement** keeps the browser's interpolation and adds the pitch. Neuz's yaw interpolation bug (an
   overshoot) is not copied. Cost: none visible.
10. **Fuel:**
    - `m_nFuel` is shown nowhere, as in Neuz;
    - Accelor Fuel (IK2_AIRFUEL) can be used from the bag and the task bar while flying;
    - the turbo needs `accFuel > 0` (SETFUEL).
11. **The worlds without flight** are a small optional catalog, `data/worldNoFly.json` (the world ids whose `.wld` says
    `fly 0`), written by the game-data stage. No world is re-converted. With no catalog, every world allows flight.
12. **Item packets carry the float.** DOUSEITEM and DOEQUIP always end with the item's `fFlightSpeed` as an `f32`, −1
    for an item without one, exactly as Neuz sends them. The exact float comes from the catalog's written text.

## Review Focus

1. **S held right after W.** No flood: PLAYERMOVED2 stays inside the traffic budget, and the climb goes on (Decision 1).

   Test: Task 7 Step 1, "W then S at once stays in the budget".
2. **A character entering already flying** (a relog on a ride, a reconnect in the air): it starts in the air on its
   ride, not frozen, and the own player sends PLAYERBEHAVIOR2 once.

   Test: Task 5 Step 1, "an own ADD_OBJ with FLY and a ride enters flying"; Task 12 Step 4, "entering on a ride".
3. **Flying into NOFLY land or a world without flight.** The step is taken back, the ride comes off, and the character
   falls with JUMP3 and lands with JUMP4. It never sticks in the air.

   Test: Task 4 Step 1, "NOFLY land takes the step back and unequips"; Task 5 Step 1, "a forced landing falls to the
   ground".
4. **Landing from 150 m, or over a cliff.** The landing is refused over NOFLY, NOWALK and NOMOVE land. Otherwise the
   ride comes off, the fall ends on the ground, and the own player stands.

   Test: Task 6 Step 1, "landing is refused over NOWALK land"; Task 12 Step 4, "land".
5. **A phone at 750 × 342 in the air.** Accelerate held with one finger while the other steers. Turbo, Land and Attack
   do not cover the joystick, and every flight button can be tapped.

   Test: Task 12 Step 4 (`flight.spec.ts`, phone project).

---

### Task 1: Protocol: the flight packets, the snapshots, and the ride's float

**Files:**
- Modify:
  - `packages/protocol/src/constants.ts`
  - `packages/protocol/src/world/items.ts` (`encodeUseItem`, `encodeEquipItem`)
  - `packages/protocol/src/world/addObj.ts:105-106` (keep the fuel)
  - `packages/protocol/src/world/types.ts`
  - `packages/protocol/src/world/readers.ts`
  - `packages/protocol/src/messages/world.ts` (`WorldPacket`, `decodeClientPacket`)
  - `packages/protocol/src/index.ts`
  - `apps/client/src/world/WorldSession.ts`
  - `packages/testkit/src/world.ts`
  - `packages/testkit/src/index.ts`
- Create: `packages/protocol/src/world/flight.ts`
- Test:
  - `packages/protocol/test/flight.test.ts` (new)
  - `packages/protocol/test/world.test.ts`
  - `packages/protocol/test/worldItems.test.ts`
  - `packages/protocol/test/addObj.test.ts`
  - `packages/testkit/test/world.test.ts`
  - `apps/client/test/worldSession.test.ts`

**Interfaces:**
- Produces:
  - **`PacketType`:**
    - `PLAYERMOVED2 0xffffff03`, `PLAYERBEHAVIOR2 0xffffff04`, `PLAYERCORR2 0xffffff06`, `PLAYERANGLE 0xffffff29`;
    - `MELEE_ATTACK2 0x00ff0014`;
    - `DOEQUIP 0x00ff000b`, if missing.
  - **`MessageType`:** `MOVERMOVED2 0x00cc`, `MOVERBEHAVIOR2 0x00cd`, `MOVERCORR2 0x00c9`, `SETFUEL 0x004b`,
    `MELEE_ATTACK2 0x00e4`, `SENDACTMSG 0x005c`.
  - **`interface FlightReport extends MoveReport { angleX: number; accPower: number; turnAngle: number }`.**
  - **Encoders:**
    - `encodePlayerMoved2(r: FlightReport, frames: number): Uint8Array`: the 73-byte body, `u8 nFrame` last.
    - `encodePlayerBehavior2(r: FlightReport): Uint8Array`: 72 bytes.
    - `encodePlayerCorr2(r: FlightReport): Uint8Array`: 72 bytes, with `turnAngle` written in the `angleX` slot
      (`DPClient.cpp:10911`, Decision 2).
    - `encodePlayerAngle(r: Pick<FlightReport, 'pos' | 'delta' | 'angle' | 'angleX' | 'accPower' | 'turnAngle' | 'tick'>): Uint8Array`: 48 bytes.
    - `encodeMeleeAttack2(message: number, targetId: number): Uint8Array`: `u32 msg, u32 target, i32 0, i32 0`.
    - `encodeUseItem(objectId: number, flightSpeed = -1)` and `encodeEquipItem(objectId: number, part = -1, flightSpeed = -1)`:
      both end with `f32 flightSpeed` (Decision 12).
  - **`WorldMessage` gains:**
    - `{ type: 'moverMoved2'; move: FlightReport; frames: number }`;
    - `{ type: 'moverBehavior2'; move: FlightReport }`;
    - `{ type: 'moverCorr2'; move: FlightReport }`;
    - `{ type: 'setFuel'; fuel: number; accFuel: number }`;
    - `{ type: 'meleeAttack2'; message: number; targetId: number; param2: number; param3: number }`;
    - `{ type: 'sendActMsg'; message: number; fly: boolean; param1: number; param2: number; param3: number }`.
  - **`AddedPlayer` gains** `fuel?: number` and `accFuel?: number`, set only when not the defaults −1 and 0.
  - **`WorldPacket` gains** `'playerMoved2' | 'playerBehavior2' | 'playerCorr2' | 'playerAngle' | 'meleeAttack2'`, with
    their fields. `'useItem'` and `'equipItem'` gain `flightSpeed`.
  - **`WorldSession` gains** `sendMoved2(r, frames)`, `sendBehavior2(r)`, `sendCorr2(r)`, `sendAngle(r)` and
    `sendMeleeAttack2(message, targetId)`. `sendUseItem` and `sendEquipItem` gain the `flightSpeed` parameter.
  - **The testkit gains** `writeMoverMoved2(objectId, move, frames)`, `writeMoverBehavior2`, `writeMoverCorr2`,
    `writeSetFuel(objectId, fuel, accFuel)`, `writeMeleeAttack2(objectId, message, targetId)` and
    `writeSendActMsg(objectId, message, fly, p1, p2, p3)`. The ADD_OBJ writers write `fuel ?? -1` and `accFuel ?? 0`.

- [ ] **Step 1: Write the failing tests.**
  - `flight.test.ts`:
    - "PLAYERMOVED2 is Neuz's 73 bytes, nFrame last": the fields read back in `DPClient.cpp:10150-10175`'s order.
    - "PLAYERCORR2 carries turnAngle where angleX goes".
    - "PLAYERANGLE is 48 bytes".
    - "MELEE_ATTACK2 has no float".
    - Each snapshot reads to its end (`expectEnd`); SETFUEL reads `i32`, `i32`.
    - "decodeClientPacket names the five flight packets".
  - `worldItems.test.ts`: "DOUSEITEM and DOEQUIP end with the ride's float, −1 without one".
  - `addObj.test.ts`: "a player's fuel is kept when it is not the default".
  - `world.test.ts`: the constants against MsgHdr.h.
  - The testkit: every writer decodes to what it was given.
  - `worldSession.test.ts`: the five senders send only while playing.
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run packages/protocol/test/flight.test.ts packages/protocol/test/worldItems.test.ts packages/protocol/test/addObj.test.ts packages/protocol/test/world.test.ts packages/testkit/test/world.test.ts apps/client/test/worldSession.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement**, citing `DPClient.cpp:10150-10219`, `:10903-10927`, `:9839-9844`, `:8726-8989`, `:4026-4040`,
  `:14935-14951`, `:3823-3837` and `User.cpp:4937-5035, 4845-4857, 2440-2450`.
- [ ] **Step 4: Run the Step 2 command, then `npm run typecheck`.**
  - Expected: PASS, exit 0.
- [ ] **Step 5: Commit.**
  - `feat(protocol): the flight packets and snapshots, and the ride's float in the item packets`

### Task 2: The catalog: the rides' flight columns and the worlds without flight

**Files:**
- Modify:
  - `packages/formats/src/inc/propItem.ts` (`KEPT`, the floats, `ItemProp`)
  - `packages/formats/src/web/gameData.ts` (`WebItemProp`, `GAME_DATA_KEYS`-adjacent optional key)
  - `tools/convert/src/data/gameDataStage.ts`
  - `apps/client/src/world/gameData.ts` (load the optional catalog)
- Test:
  - `tools/convert/test/gameDataStage.test.ts`
  - `tools/convert/test/gameData.corpus.test.ts`
  - `apps/client/test/gameData.test.ts`

**Interfaces:**
- Produces:
  - **`WebItemProp.flight?`**, for an `IK1_RIDE` (kind1 4) row only:
    `{ speed: number; speedText: string; turn: number; pitch: number; limit: number; fuelMax: number; accelFuelMax: number; motion: number }`.
    These are `fFlightSpeed` (`Math.fround`, with its written text), `fFlightLRAngle`, `fFlightTBAngle`,
    `dwFlightLimit` (`=` meaning 1), `dwFFuelReMax`, `dwAFuelReMax` and `dwUseMotion` (an MTI id).
  - **`data/worldNoFly.json`** (optional): `number[]`, the world ids whose `.wld` has `fly 0`.
  - **`GameData.noFlyWorlds: ReadonlySet<number>`**, empty without the catalog.

- [ ] **Step 1: Write the failing tests.**
  - `gameDataStage.test.ts`:
    - "a ride keeps its flight columns, the speed's text exact": a fixture row 5000 gives
      `{ speed: Math.fround(0.0023), speedText: '0.0023', turn: Math.fround(0.6), pitch: 1, limit: 1, fuelMax: 1200, accelFuelMax: 12, motion: 31 }`.
    - "a non-ride has no flight".
    - "worldNoFly lists the fly 0 worlds".
  - The corpus test, "the rides and the worlds":
    - 5000 `flight.speedText` is `'0.0023'`, `motion` 31 (`MTI_FSTAND1_A`);
    - 5101 has `motion` 61;
    - 5104 has speed 0.0035 and turn 0.76;
    - `worldNoFly` holds 203 and none of 1, 2 and 3.
  - The client: "without worldNoFly every world allows flight".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run tools/convert/test/gameDataStage.test.ts apps/client/test/gameData.test.ts`, then the corpus
    test with `FLYFF_CLIENT` and `--config vitest.corpus.config.ts`.
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The floats are read as `fAttackSpeed` is, keeping the text.
  - `worldNoFly` comes from each converted world's `.wld` (`packages/formats/src/world/wld.ts` already parses `fly`).
- [ ] **Step 4: Run the tests and convert.**
  - Run the Step 2 commands, then `npm run convert -- --client "<Client>" --only "data"`.
  - Expected: PASS, and 0 failed.
- [ ] **Step 5: Commit.**
  - `feat(formats,convert): the rides' flight columns and the worlds without flight`

### Task 3: The flight rules: the messages, the states and the move (fixtures first)

**Files:**
- Create: `apps/client/src/world/sim/flight.ts`
- Modify: `apps/client/src/world/sim/constants.ts`
- Test: `apps/client/test/sim/flight.test.ts`

**Interfaces:**
- Consumes `WebItemProp.flight` (Task 2).
- Produces the constants:
  - `ObjSta.LOOKUP 0x400`, `LOOKDOWN 0x800`;
  - `ObjStaF.ACC 0x10`, `ACCTURN 0x40`, `TURBO 0x80`;
  - `ActMsg.MODE_FLY 22`, `MODE_GROUND 23`, `MODE_TURBO_ON 24`, `MODE_TURBO_OFF 25`, `ACC_START 27`, `ACC_STOP 28`,
    `LOOKUP 43`, `LOOKDOWN 44`, `STOP_LOOK 45`;
  - `Mta = { FSTAND1: 0, FIDLE1: 1, FIDLE2: 2, FLTURN1: 3, FLTURN2: 4, FRTURN1: 5, FRTURN2: 6, FRUNNING1: 7, FRUNNING2: 8, FDMG1: 9, FATK1: 10, FATK2: 11, FATK3: 12 }`;
  - `PARTS_RIDE = 13`, `MAX_CORR_SIZE_150 = 37`.
- Produces `interface FlightRide { speed: number; turn: number; pitch: number; motion: number }`.
- Produces `interface FlightState`, the mover's part these rules change:
  `pos: Vec3; delta: Vec3; deltaE: Vec3; angle: number; angleX: number; accPower: number; turnAngle: number; state: number; stateFlag: number; motion: number; motionOption: number; loop: number; accFuel: number; ride: FlightRide`.
- Produces the functions:
  - `flightActMsg(s: FlightState, message: number, p1 = 0, p2 = 0, p3 = 0): number`: `ProcessActMsg2` for STAND,
    FORWARD, LTURN, RTURN, STOP_TURN, LOOKUP, LOOKDOWN, STOP_LOOK, ACC_START, ACC_STOP, MODE_TURBO_ON, MODE_TURBO_OFF
    and TURNMOVE (`ActionMoverMsg2.cpp:30-344`). It returns Neuz's 1, 0, −2 and −3. LOOKUP follows Decision 1.
  - `flightStates(s: FlightState): void`: `ProcessState2` for the MOVE, TURN and LOOK bits (`ActionMoverState2.cpp:452-552`).
  - `flyMove(s: FlightState, tracking?: { yawTo: number; pitchTo: number } | null): { speedShown: number; drift: boolean }`:
    `ProcessFlyMove` (`:343-445`), with `FRIC_AIR` 0.011, the drift test 0.633319 and the cap 0.3 (×1.1 with
    turbo). `speedShown = (int)((int)(|v|·216000)/200)`.
  - `presupposeFlight(s: FlightState, frames: number): Pick<FlightReport, 'pos' | 'delta' | 'angle' | 'angleX' | 'accPower'>`:
    `PresupposePos2` (`:34-147`), with Decision 2's 1° look and ×1.5 turbo, and y capped at 270.
  - `setAngle(a: number): number`: Neuz's quantised wrap, `(360/65536)·((int)(a·65536/360) & 65535)` (`Obj.cpp:662-664`).

- [ ] **Step 1: Write the failing tests** in `flight.test.ts`, from the research's numbers. `MAGIC_BROOM` is
  `{ speed: f32(0.0023), turn: f32(0.6), pitch: 1, motion: 31 }`.
  - "FMOVE's thrust is the ride's speed × 0.75": `accPower` is `f32(f32(0.0023) * 0.75)`.
  - "level flight from a stop follows (v + a)·0.989": after 1, 2 and 600 steps facing angle 0, `|delta|` equals the
    f32 recurrence, and stays under the terminal `a·0.989/0.011` (0.155). Angle 0 moves along −Z.
  - "the cap binds only beyond 0.3": a delta of 0.31 along the heading gets no thrust that step.
  - "a turn is 2.5 times the ride's turn without ACC, once with it".
  - "LOOKDOWN adds the ride's pitch until 45, and may pass it once"; "LOOKUP replaces the look bits (Decision 1)".
  - "turbo needs accFuel, and multiplies the thrust by 1.2 with ACC".
  - "drift: thrust over 70° from the move doubles it and slows the move by 0.985".
  - "stopped: no thrust and |v| under 0.0002 zeroes the move and drops ACC".
  - "the speed shown is |v| × 1080, truncated twice".
  - "PresupposePos2 looks 1° a tick and caps y at 270".
  - "setAngle wraps and quantises": −1 gives `(360/65536)·65535`-ish; 360 gives 0.
  - "TURNMOVE: f = 2·dist/(0.10·n²) and the y term's extra cos".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/sim/flight.test.ts`
  - Expected: FAIL, the module is missing.
- [ ] **Step 3: Implement**, with the C++ table.
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): Neuz's flight rules: ProcessActMsg2, ProcessState2, ProcessFlyMove, PresupposePos2`

### Task 4: The flight rules: collision, forced sets and the ghost

**Files:**
- Create: `apps/client/src/world/sim/flightCollision.ts`
- Test: `apps/client/test/sim/flightCollision.test.ts`

**Interfaces:**
- Consumes `FlightState` (Task 3), and `Ground` (`packages/scene/src/world/ground.ts`, with `landAttr` and the objects).
- Produces:
  - `collideFly(s: FlightState, deltaAccu: Vec3, ground: Ground, worldFly: boolean, objects: boolean): { collided: boolean; unequip: boolean; died: boolean }`:
    `ProcessCollisionFly` (`ActionMoverCollision.cpp:21-121`).
    - Hovering (no thrust and no move) does nothing.
    - The objects reflect, up to 3 bounces, `×0.7`.
    - x then z, with the NOMOVE take-back.
    - NOFLY, or a world without flight: the whole step back and `unequip`.
    - The ceiling 200; the minimum 85 over cloud water only; the floor at `GetFullHeight`.
  - `forcedSet2(s: FlightState, r: FlightReport, flying: boolean): boolean`: refused when `r.stateFlag`'s FLY differs
    from `flying` (`ActionMoverMsg.cpp:56-75`).
  - `halfForcedSet(s: FlightState, r: FlightReport): void`: `HalfForceSet` (`ActionMoverMsg.cpp:82`).
  - `approachFlight(s: FlightState, dest: Vec3, remnant: number): void`: one tick of the ghost's chase
    (`MoverMove.cpp:428-439`): `m_fDistance`, then TURNMOVE(`GetDegree`, `GetDegreeX`).

- [ ] **Step 1: Write the failing tests** in `flightCollision.test.ts`.
  - "a hovering mover is not clamped".
  - "the ceiling is 200".
  - "below the land it stands on the land, and delta.y is kept".
  - "NOFLY land takes the step back and unequips" (Review Focus 3).
  - "a world without flight unequips anywhere".
  - "a wall reflects the move at 0.7".
  - "ForcedSet2 refuses a FLY flip".
  - "the ghost chases with TURNMOVE toward the destination": `GetDegreeX` is negative for a target above.
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/sim/flightCollision.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the flight collision, ForcedSet2, HalfForceSet and the ghost's chase`

### Task 5: Flight in the world: `ActionMover`, `WorldState`, flying monsters and others flying

**Files:**
- Modify:
  - `apps/client/src/world/sim/ActionMover.ts` (the `IsFly()` dispatch, MODE_FLY and MODE_GROUND, the flying
    monster's FMOVE, TURNMOVE and gravity)
  - `apps/client/src/world/sim/moverRules.ts` (fliers no longer skipped; MOVERMOVED2, MOVERBEHAVIOR2, MOVERANGLE and
    MOVERCORR2 applied)
  - `apps/client/src/world/WorldState.ts` (step fliers; DOEQUIP part 13; ADD_OBJ flying; SETFUEL; SENDACTMSG;
    MELEE_ATTACK2; SETPOS's ACC_STOP)
- Test:
  - `apps/client/test/worldState.test.ts`
  - `apps/client/test/sim/moverRules.test.ts`
  - `apps/client/test/sim/actionMover.test.ts`

**Interfaces:**
- Consumes Tasks 1, 3 and 4.
- **`ActionMover`:**
  - It gains the `FlightState` fields (`angleX`, `accPower`, `turnAngle`, `accFuel`, `fuel`, `ride: FlightRide | null`)
    and `rideItemId: number | null`.
  - `sendActMsg` routes to `flightActMsg` while `stateFlag & FLY`.
  - `step` runs `flightStates`, `flyMove` and `collideFly` while flying, with no gravity.
  - An `OBJTYPE_FLYING` mover (`flying: true`) keeps the ground states, but its FMOVE is
    `AngleToVector( angle, -angleX, speed )`, TURNMOVE sets `angleX`, it has no gravity, and it uses `collideFly`
    (Decision 6).
- **`ActionMover.modeFly(rideItemId: number, ride: FlightRide, fuelMax: number): void`** (`ActionMoverMsg.cpp:1044-1104`):
  adds FLY; fuel −1 becomes `fuelMax`; `ClearState`.
- **`ActionMover.modeGround(): void`** (`ActionMoverMsg2.cpp:271-307`): removes FLY and ACC; `ClearState`; angleX 0;
  keeps `delta.y`.
- **`WorldState`:**
  - DOEQUIP part 13 runs `modeFly` or `modeGround`, own and others.
  - A player's ADD_OBJ with FLY and worn part 13 runs `modeFly`.
  - The `unequip` from `collideFly` runs `modeGround` locally (`UnequipRide`).
  - `CombatEvent` gains `{ kind: 'flight'; moverId: number; flying: boolean }`.
  - `OwnEvent` gains `{ kind: 'speed'; shown: number }`, once a step for the own flier.

- [ ] **Step 1: Write the failing tests.**
  - `worldState.test.ts`:
    - "DOEQUIP of the ride makes the own mover fly, and landing falls": FLY set; then `fEquip` 0 clears it, `delta.y`
      is kept, and the mover falls with JUMP3 and stands after JUMP4.
    - "a forced landing falls to the ground" (Review Focus 3).
    - "an own ADD_OBJ with FLY and a ride enters flying" (Review Focus 2).
    - "another player's MOVERMOVED2 moves it in the air": a late one (`delay >= frames`) snaps.
    - "MOVERANGLE turns it".
    - "SETFUEL sets accFuel, and fuel 0 stops the acceleration".
    - "SENDACTMSG TURBO_OFF turns the turbo off".
    - "SETPOS stops the acceleration".
  - `moverRules.test.ts`: "a flying monster moves in 3-D toward its destination and does not fall"; "a flier is no
    longer skipped".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/worldState.test.ts apps/client/test/sim/moverRules.test.ts apps/client/test/sim/actionMover.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The old tests "a flier is placed but not stepped" and "MOVERANGLE changes nothing on the ground" change to the new
    behaviour. Ledger that as a ruling.
- [ ] **Step 4: Run the Step 2 command, then `npm run typecheck`.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): flight in the world: the own flier, others flying, flying monsters`

### Task 6: Mounting and landing through the items, and the fuel

**Files:**
- Create: `apps/client/src/world/items/rideItems.ts`
- Modify:
  - `apps/client/src/world/items/itemUse.ts`
  - `apps/client/src/world/items/travelItems.ts` (`usableFromBag`)
  - `apps/client/src/world/items/itemActions.ts:15-21` (part 13)
  - `apps/client/src/world/hud/inventoryWindow.ts:142`, `:245`
- Test:
  - `apps/client/test/rideItems.test.ts`
  - `apps/client/test/itemUse.test.ts`
  - `apps/client/test/inventoryWindow.test.ts`

**Interfaces:**
- Consumes `WebItemProp.flight` and `GameData.noFlyWorlds` (Task 2), `encodeUseItem`/`encodeEquipItem` with the float
  (Task 1), and M3's `useRefusal` and `castFill`.
- Produces:
  - `IK1_RIDE = 4`, `IK2_AIRFUEL = 23`.
  - `isRide(prop): boolean`.
  - `rideRefusal(check: { prop: WebItemProp; level: number; worldFly: boolean; landAttr: number; disguised: boolean; worn: boolean }): Refusal | null`
    (`IsUseItemReadyTime`, `Mover.cpp:2767-2826`):
    - worn: null (landing skips the checks);
    - `flight.limit` 1 and level under 20: `TID_GAME_USEAIRCRAFT`;
    - no flight in the world, or NOFLY land: `TID_ERROR_NOFLY`;
    - disguised: `TID_QUEST_DISQUISE_NOTFLY`.
  - `landRefusal(check: { sitting: boolean; landAttr: number }): boolean`: `IsUnEquipAble`, silent; true over NOFLY,
    NOWALK or NOMOVE land.
  - **`ItemUse.use` for a ride:**
    - rideRefusal, then M3's cast refusals, then `sendUseItem(objectId, flightSpeed)`;
    - the `nPart` is 13, worn or not;
    - a worn ride first checks `landRefusal`.
  - **Accelor Fuel** (IK2_AIRFUEL) is usable only while flying; otherwise silent.
  - **The inventory:**
    - a ride's double-click and the phone's **Use** go to `ItemUse`;
    - the ride's equipment cell's double-click lands through `sendEquipItem(objectId, 13, flightSpeed)`.
- `usableFromBag` takes rides and IK2_AIRFUEL.

- [ ] **Step 1: Write the failing tests.**
  - `rideItems.test.ts`:
    - "level 19 is refused with the aircraft text, 20 is not";
    - "the Beginner's broom has no limit" (`limit` 0);
    - "no flight here: the world, or NOFLY land";
    - "landing is refused over NOWALK land" (Review Focus 4).
  - `itemUse.test.ts`:
    - "a ride is used with part 13 and its exact float": `Math.fround(0.0023)` from `speedText` '0.0023';
    - "Accelor Fuel only while flying".
  - The inventory test: "a ride shows Use on the phone, and its equipment cell lands it".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/rideItems.test.ts apps/client/test/itemUse.test.ts apps/client/test/inventoryWindow.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): mounting and landing through the items (IsUseItemReadyTime, IsUnEquipAble), and the fuel`

### Task 7: The PC's flight controls and what they send

**Files:**
- Create: `apps/client/src/world/flightControl.ts`
- Modify:
  - `packages/scene/src/input/keyboard.ts` (held keys for flight)
  - `apps/client/src/world/cameraControls.ts` (the right drag steers in flight)
- Test:
  - `apps/client/test/flightControl.test.ts`, with the traffic cases through `test/helpers/traffic.ts`'s `busiestSecond`

**Interfaces:**
- Consumes Tasks 1, 3 and 5.
- Produces `interface FlightInput { dive: boolean; climb: boolean; left: boolean; right: boolean; accelerateToggle: boolean; accelerateHeld?: boolean; turboToggle: boolean; trackToggle: boolean; nextTarget: boolean; attack: boolean; mouse: { dx: number; dy: number } | null }`.
  Phones fill `accelerateHeld` (Task 8).
- Produces `class FlightControl` (`ControlFlying`, `WndWorldControlPlayer.cpp:666-947`, plus `FlushPlayerAngle`
  `DPClient.cpp:14485-14517`):
  - `constructor(session: Pick<WorldSession, 'sendMoved2' | 'sendAngle' | 'sendCorr2' | 'sendBehavior2'>, clock: { tick(): bigint })`;
  - `control(own: Mover, input: FlightInput, ground: Ground): void`, one rules step:
    - FORWARD while ACC, else STAND;
    - Space's toggle;
    - X;
    - W only above the ground, S, neither: STOP_LOOK;
    - A and D with `(int)(turn·100)` and the roll ±1 (to 45, back by 2);
    - the mouse: `angle -= dx/2`, `angleX += dy/4` to ±45, queuing a PLAYERANGLE;
    - any message returning 1 sends PLAYERMOVED2 with `presupposeFlight(…, 37)` and `nFrame` 37;
  - `flushAngle(own: Mover): void`, every rules step: a queued angle goes out at most every 30th step;
  - `collided(own: Mover): void`: PLAYERCORR2 while `nCorr` runs;
  - `entered(own: Mover): void`: PLAYERBEHAVIOR2 once.
  - `get roll(): number`, for the camera's optional roll (off).
- `KeyboardInput` gains `held(code: string): boolean` and `takePressed(code: string): boolean`.

- [ ] **Step 1: Write the failing tests** in `flightControl.test.ts`, against a fake session.
  - "Space toggles ACC and sends one PLAYERMOVED2 each time".
  - "holding D sends one RTURN, not one a step".
  - "W does nothing on the ground, dives above it".
  - "mouse steering queues PLAYERANGLE, at most one every 30 steps".
  - "W then S at once stays in the budget" (Review Focus 1): ten seconds of alternating and held W/S/A/D/Space and the
    mouse; `busiestSecond` ≤ 50.
  - "a collision within 37 steps sends PLAYERCORR2".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/flightControl.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the PC's flight controls (ControlFlying) and the flight packets they send`

### Task 8: The phone's flight controls

**Files:**
- Modify:
  - `apps/client/src/world/controls.ts` (the stick's raw axes in flight)
  - `apps/client/src/world/hud/attackButton.ts` (none expected)
  - `apps/client/src/style.css`
- Create: `apps/client/src/world/hud/flightButtons.ts`
- Test: `apps/client/test/flightButtons.test.ts`, `apps/client/test/controls.test.ts`

**Interfaces:**
- Consumes `FlightInput` (Task 7) and `AttackButton`.
- Produces:
  - `flightStick(stick: MoveIntent): Pick<FlightInput, 'dive' | 'climb' | 'left' | 'right'>`: forward dives, back
    climbs, sideways turns, past the stick's `AXIS_ON` 0.4 and `AXIS_OFF` 0.3 (Decision 4).
  - `class FlightButtons`:
    - `constructor(doc: Document, actions: { accelerate(held: boolean): void; turbo(): void; land(): void })`;
    - `element`;
    - `update(flying: boolean, turboAvailable: boolean): void`;
    - `dispose()`.
    - It holds **Accelerate** (the Jump button's place, a hold: press and let-go), **Turbo** (a toggle) and **Land**.
    - They show only while flying on a touch screen; the ground Jump hides then.

- [ ] **Step 1: Write the failing tests.**
  - `controls.test.ts`: "the stick forward dives, back climbs, sideways turns".
  - `flightButtons.test.ts`:
    - "Accelerate reports held on press and let-go";
    - "Turbo and Land run their actions";
    - "they show only while flying".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/flightButtons.test.ts apps/client/test/controls.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.** The CSS goes beside `.hud-jump` and `.hud-attack`, with the short-landscape sizes, and the
  modal hide rules gain the three buttons.
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the phone's flight controls: the stick, Accelerate, Turbo and Land`

### Task 9: The flight camera

**Files:**
- Modify: `apps/client/src/world/backCamera.ts`, `packages/scene/src/world/player.ts` (field of view)
- Test: `apps/client/test/backCamera.test.ts`

**Interfaces:**
- Produces `BackCamera.followFlight(at: Vec3, angle: number, angleX: number, accelerating: boolean, turbo: boolean, ground: Ground): ChaseView & { fov: number }`
  (`CBackCamera::Process` in flight, `Camera.cpp:184-446`; `CWorld::Projection`, `World3D.cpp:58-109`):
  - **yaw** = the heading;
  - **pitch** = `m_fRoty + zoom·4 + angleX`, at most 80;
  - **offset** `(0, 0, −4 − zoom·2)` (16 m at zoom 6), smoothed by 1/10 a step;
  - **look-at** `pos + (0, 1.3, 0)`;
  - **field of view** `π/fDiv`, with fDiv −0.2 a step to 2 under ACC and turbo, and +0.05 a step to 4 under ACC alone;
    the camera at 2 m behind when fDiv is 2;
  - CheckBound as on the ground.

- [ ] **Step 1: Write the failing tests** in `backCamera.test.ts`.
  - "in flight the camera follows the heading".
  - "angleX lifts the pitch, up to 80".
  - "the offset eases a tenth a step".
  - "turbo widens the view to 90° and brings the camera to 2 m".
  - "back on the ground the camera keeps its heading" (Decision 8).
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/backCamera.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the flight camera (CBackCamera in flight, the turbo's field of view)`

### Task 10: The ride, the flight motions, the tilt and the turbo gauge

**Files:**
- Modify:
  - `apps/client/src/world/render/MoverViews.ts` (the ride model, the pitch, the flight motions)
  - `apps/client/src/world/sim/ActionMover.ts` (`motionFor` with `MOP_FIXED` flight ids)
- Create: `apps/client/src/world/render/TurboGauge.ts`
- Test:
  - `apps/client/test/moverViews.test.ts`
  - `apps/client/test/turboGauge.test.ts`

**Interfaces:**
- Consumes `ActionMover.ride`, `rideItemId` and `angleX` (Task 5), and `itemProps[id].model` (converted rides).
- **The views:**
  - load `itemProps[rideItemId].model` into the mover's holder while flying, and drop it on landing;
  - raise a broom (`kind3 41`) by its root bone's y (`MoverRender.cpp:584-605`);
  - turn the holder by `YawPitchRoll(−angle, −angleX, 0)`;
  - play the motion `ride.motion + Mta.*`. A motion the skeleton lacks (43, 72, 103) falls back to the stand, as
    today.
- Produces `class TurboGauge` (`RenderTurboGauge`, `MoverRender.cpp:990-1089`, `WndWorld.cpp:1001-1007`):
  - `constructor(art: UiArt, doc?)`;
  - `update(accFuel: number | null, turbo: boolean, speedShown: number, frame: number, head: Vec3 | null, camera: Camera, width: number, height: number): void`.
  - **Layout:** 43 px over the head; width `112 × accFuel / 12000`; with turbo, a white bar of `(96·v/max)·0.8` on odd
    frames; the speed as a number beside it (Decision 7); `null` hides it.

- [ ] **Step 1: Write the failing tests.**
  - The views test:
    - "a flier shows its ride's model and drops it on landing";
    - "the holder pitches by angleX";
    - "a flying stand plays ride.motion + FSTAND1".
  - `turboGauge.test.ts`:
    - "the gauge sits 43 px over the head";
    - "12000 ms fills it";
    - "turbo flickers white on odd frames";
    - "the speed shows beside it".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/moverViews.test.ts apps/client/test/turboGauge.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): the ride drawn, the flight motions and tilt, and the turbo gauge`

### Task 11: Combat in the air

**Files:**
- Modify:
  - `apps/client/src/world/combat/attackLoop.ts`
  - `apps/client/src/world/skills/skillUse.ts` (refused in flight)
  - `apps/client/src/world/sim/flight.ts` (`ATK1`, `ATK_MAGIC1` in the air)
- Test: `apps/client/test/attackLoop.test.ts`, `apps/client/test/skillUse.test.ts`, `apps/client/test/sim/flight.test.ts`

**Interfaces:**
- Consumes `sendMeleeAttack2` (Task 1) and the flight rules (Tasks 3 and 5).
- **`attackAble(target, moverProps, ownFlying)`** follows `IsAttackAbleNPC` (`Mover.cpp:6615-6618`): a flier hits only
  flying monsters, a walker only grounded ones.
- **In the air:**
  - the attack sends ATK1 through `flightActMsg`;
  - in range `IsRangeObj(target, 3.0)`, MELEE_ATTACK2 goes out (no float), and the motion is `ride.motion + FATK1`;
  - a wand needs `dot ≥ 0.5` to the 3-D heading and `IsRangeObj(target, 64)`, then MAGIC_ATTACK with power 0
    (`WndWorldControlPlayer.cpp:798-833`);
  - `AttackLoop.nextFlyTarget(cameraForward: Vec3): void` (Tab, `FlightInput.nextTarget`) cycles the killable flying movers within 15° of the camera's forward (`MoverRender.cpp:739-756`);
  - a click or tap on a killable flying monster selects it (Decision 5);
  - tracking (Z) turns 2.5° and 1.5° a step toward the focus (`ProcessFlyTracking`).
- **`SkillUse.cmdSetUseSkill`** refuses silently while flying (`MoverMsg.cpp:176`).

- [ ] **Step 1: Write the failing tests.**
  - `attackLoop.test.ts`:
    - "in the air a walker's monster cannot be attacked, a flying one can";
    - "the in-air attack sends MELEE_ATTACK2 within 3 m";
    - "a wand fires in the air only inside 60° and 64 m";
    - "Tab cycles the flying targets ahead".
  - `skillUse.test.ts`: "no skill in the air".
- [ ] **Step 2: Run them.**
  - Run: `npx vitest run apps/client/test/attackLoop.test.ts apps/client/test/skillUse.test.ts apps/client/test/sim/flight.test.ts`
  - Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Step 2 command.**
  - Expected: PASS.
- [ ] **Step 5: Commit.**
  - `feat(client): combat in the air (MELEE_ATTACK2, the wand's cone, the flying targets)`

### Task 12: Wiring, and `flight.spec.ts`

**Files:**
- Modify:
  - `apps/client/src/world/WorldScreen.ts`
  - `apps/client/src/testHooks.ts` (`ClientMover` gains `angle`, `stateFlag`, `angleX`)
  - `apps/client/e2e/worldHarness.ts` (offsets for PLAYERMOVED2)
  - `apps/client/src/world/sound/worldSounds.ts` (`BGM_TH_FLYING` the first time, then `BGM_EV_LIGHTWING`)
- Create: `apps/client/e2e/flight.spec.ts`

**Interfaces:**
- Consumes everything above.
- **`WorldScreen.step` while the own mover flies:**
  - `FlightControl.control` runs instead of `ownMover.control`, with the keyboard, the mouse and the phone's
    `flightStick` and `FlightButtons`;
  - then `flushAngle`;
  - `followFlight` replaces `follow`.
- `TurboGauge` sits beside `CastGauge`.
- **Landing:** the Land button and the ride's item use lead to `ItemUse`.
- **`useCheck().flying`** reads the own FLY flag, so M3's TID_PK_FLIGHT_NOUSE refusal goes live.

- [ ] **Step 1: Write the wiring.**
  - Run: `npm run typecheck`
  - Expected: exit 0.
- [ ] **Step 2: Run the whole unit suite.**
  - Run: `npm test`
  - Expected: PASS.
- [ ] **Step 3: Write `flight.spec.ts`** against the pretend world server. Webby is level 20 with a Magic Broom (5000) at
  object id 3 and a Small Mothbee (304) near.
  - **"take off":**
    1. The Magic Broom from the task bar sends DOUSEITEM with part 13 and the float `Math.fround(0.0023)`.
    2. The script answers STATEMODE ON, then OFF, then DOEQUIP `fEquip` 1, part −1.
    3. Webby's `stateFlag` has FLY, and the broom's model is in the scene.
  - **"fly and turn":**
    1. Space sends PLAYERMOVED2 (`stateFlag` has ACC, `nFrame` 37).
    2. After 2 s Webby has moved along −Z from its heading.
    3. Holding D turns it (the angle falls), and sends one RTURN PLAYERMOVED2, not one a step.
  - **"fight in the air":** select the Mothbee and attack; MELEE_ATTACK2 is sent once it is within 3 m.
  - **"land":**
    1. The broom from the bag again sends DOUSEITEM with part 13.
    2. The script answers DOEQUIP `fEquip` 0, part 13.
    3. Webby falls and stands on the ground (Review Focus 4).
  - **"another player flying":** an ADD_OBJ with FLY and a worn Hover Board (5101), then MOVERMOVED2; it moves in the
    air on its board.
  - **"entering on a ride":** a JOIN whose own ADD_OBJ has FLY and part 13 enters in the air, and sends PLAYERBEHAVIOR2
    once (Review Focus 2).
  - **The phone project:**
    1. Accelerate held while the stick turns.
    2. Turbo needs the SETFUEL's accFuel.
    3. Land lands.
    4. No flight button covers the joystick or Attack (Review Focus 5).
- [ ] **Step 4: Run the spec.**
  - Run: `npx playwright test -c .superpowers/sdd/e2e-5175.config.ts --project=chromium --project=phone apps/client/e2e/flight.spec.ts`
  - Expected: all pass.
- [ ] **Step 5: Commit.**
  - `feat(client): flying in the world, and flight.spec.ts`

### Task 13: The checklist, the README and the checkpoint

**Files:**
- Modify: `docs/device-testing.md`, `README.md`
- Create: `docs/piece7-m5-checkpoint.md`

- [ ] **Step 1: The checklist.** Add "Piece 7, milestone 5: flying" in M3's form. The steps:
  1. A level-20 character buys a Magic Broom and Accelor Fuel from Dior (Flaris).
  2. Take off from the task bar.
  3. Fly with Space, W/S and A/D, and with the mouse while the right button is held.
  4. Turbo after using Accelor Fuel.
  5. Fight a Small Mothbee in the air.
  6. Fly into a no-flight place to be put down.
  7. Land from the bag.
  8. A second account watches the first fly.
  9. Do all of it on the phone: the stick, Accelerate held, Turbo, Land.
- [ ] **Step 2: The README.** Add the milestone 5 sentence.
- [ ] **Step 3: The checkpoint.** Write `docs/piece7-m5-checkpoint.md`: what changed, the Decisions, every ruling, the
  evidence, the owner's commands and the convert command.
- [ ] **Step 4: Commit.**
  - `docs(piece7): M5 checklist and checkpoint`
