# Piece 4 research: Neuz visual effects (.sfx, hit effects, damage numbers, level up, death, Vagrant skills)

Read-only research, 2026-10-24. Nothing in the repos was changed.

**Conventions**
- C++ paths are relative to `...\Blouflash VS22 V15\Source` (so `_Common/sfxbase.cpp:1719`). Files are CP949; line numbers are the original ones.
- Build flags checked in `Neuz/VersionCommon.h` (top + `__MAINSERVER` section only): `__VER` 15 (:4), `__SFX_OPT` ON (:104). **Not on for this build:** `__BS_EFFECT_LUA` (:401 is in `__INTERNALSERVER`, :465 commented), `__BS_DEATH_ACTION` (:400 internal, :464 test), `__YSMOOTH_OBJ` (defined nowhere), `__AI_0509`, `__YENV`. `__CLIENT` is on (`Neuz/StdAfx.h:12,39`). So the Lua effect system (`sfxbase.cpp:3280-end`, `CSfxModelMng`) is dead code here.
- Game files are under `...\Blouflash VS22 V15\Client` (`Client/SFX/...`); web project is `...\FlyffWeb-worktrees\piece3-world` (cited as `web:`).
- **Validation done:** I wrote a throwaway Node parser that mirrors `CSfxBase::Load` and ran it over every `.sfx` in `Client/SFX`: 731 files, 0 errors, 0 trailing bytes in any file. So the layout tables below are exact for the shipped corpus. I also parsed `propItem.txt`/`propSkill.txt`/`mdlDyna.inc` with the web project's own readers to resolve ids. Numbers marked "corpus" come from these scripts.

---

## 1. The .sfx file format

### 1.1 Where it is loaded from
- `CSfxBase::Load` (`_Common/sfxbase.cpp:1719-1799`); `CSfxBase::LoadMerge` (`:1641-1717`) is a copy of the same logic (editor merge; nothing in the game calls it). Name -> file: `MakePath( DIR_SFX, name + ".sfx" )` (`:1724`), `DIR_SFX` = `"Sfx\\"` (`_Common/path.h:36`), so `Client/SFX/<name>.sfx`. Lookup is by name and cached forever (`CSfxMng::GetSfxBase`, `:1819-1839`; the cache compare is case-sensitive, the file open is not).
- `CResFile::Open` tries the loose file first, then the `.res` packs (`_Common/file.cpp:273-334`). The three packs contain **no** `.sfx`, textures or models (only `.inc/.h/.txt/.csv/.prj`), checked by listing them. **All sfx data is loose files.**
- The sfx name comes from the model index: `mdlDyna.inc` OT_SFX entries (`XI_*` id -> name, `MODELTYPE_SFX` 4). `CModelMng::MakeModelName` (`_Common/ModelMng.cpp:63-94`): name gets prefix `sfx_` unless it already contains `_`, and no `.o3d`; `LoadModel` makes `new CSfxModel` + `SetSfx(name)` (`ModelMng.cpp:190-197`, `sfxbase.cpp:1977-2015`). Web already has this: `web:packages/formats/src/inc/modelIndex.ts:165 modelFileName`.

### 1.2 Binary layout
All little-endian, packed, no padding (raw struct writes). `BOOL` and the three enums are 4 bytes. `D3DXVECTOR3` = 3 x f32 = 12 bytes. A "str" is `i32 length` + `length` raw bytes, no terminator (`strTemp[255]`, e.g. `sfxbase.cpp:426-427`). Texture/mesh names in the corpus are all ASCII; the v0.2+ "name" label (editor only) is CP949 and is Korean in 140 parts (skip it, do not decode it).

**File header**

| offset | type | meaning | cite |
|---|---|---|---|
| 0 | char[8] | magic `"SFX0.1  "`, `"SFX0.2  "` or `"SFX0.3  "` (6 letters + 2 spaces). Only the first 6 chars are compared. | `sfxbase.cpp:1729-1731,1732,1745,1759` |
| 8 | i32 | `nPart` | `:1734,1748,1762` |
| ... | part[nPart] | each: `i32 type` (1 BILL, 2 PARTICLE, 3 MESH, 4 CUSTOMMESH; `sfxbase.h:17-22`) then the type's payload | `:1737-1741` |

**Old files (no magic):** the first i32 is `nPart` (the loader seeks back to 0): `:1776-1789`. 37 corpus files are old format.

**Part payload, the common head.** Which fields exist depends on the version:

| field | type | old (no magic) | v0.1 | v0.2, v0.3 (non-particle), v0.2 particle | v0.3 particle |
|---|---|---|---|---|---|
| name | str | one str, used as name AND texture | one str (same) | `str name` (editor label only) | same |
| tex | str | (the same str) | (the same str) | `str tex` | same |
| texFrame | u16 | absent (=1) | present | present | present |
| texLoop | u16 | absent (=1) | present | present | present |
| using | i32 BOOL | absent (=TRUE) | absent (=TRUE) | present | present |
| billType | i32 | SFXPARTBILLTYPE | same | same | same |
| alphaType | i32 | SFXPARTALPHATYPE | same | same | same |

Cites: Bill `Load` `:421-455` (v0.1), `Load2` `:456-495` (v0.2/0.3), `OldLoad` `:496-525`; Particle `Load` `:670-738`, `Load2` `:739-812`, `Load3` `:813-886`, `OldLoad` `:887-951`; Mesh `Load` `:963-997`, `Load2` `:998-1037`, `OldLoad` `:1040-1069` (no `Load3`, inline empty at `sfxbase.h:206`); CustomMesh `Load` `:1192-1227`, `Load2` `:1228-1267`, `OldLoad` `:1268-1298`.

**Then, by part type:**

| part type | rest of payload |
|---|---|
| 1 BILL, 3 MESH | `i32 nKey`, `key[nKey]` |
| 4 CUSTOMMESH | `i32 nKey`, `key[nKey]`, then `i32 nPoints` (`:1226,1266,1297`) |
| 2 PARTICLE | the particle block below, then `i32 nKey`, `key[nKey]` |

**Key frame, 54 bytes** (`sfxbase.h:53-61`, read at e.g. `:443-454`):

| type | field |
|---|---|
| u16 | `nFrame` |
| vec3 | `vPos` |
| vec3 | `vPosRotate` (degrees, rotates `vPos` about the local origin; for CUSTOMMESH it is reused as UV parameters, see 2.4) |
| vec3 | `vScale` (for CUSTOMMESH: x top radius, y height, z bottom radius, `:1401`) |
| vec3 | `vRotate` (degrees) |
| i32 | `nAlpha` (0-255) |

**Particle block** (read in `CSfxPartParticle::Load*`, struct `sfxbase.h:142-183`):

| type | field | in version |
|---|---|---|
| u16 | `create` (emit interval in frames; 0 = one burst at the first key's frame) | all |
| u16 | `createNum` (particles per emission) | all |
| u16 | `appear`, `keep`, `disappear` (particle life stages, frames) | all |
| f32 | `startPosVar` (XZ radius), `startPosVarY` | all |
| f32 | `yLow`, `yHigh` (vertical speed range), `xzLow`, `xzHigh` (horizontal speed range) | all |
| vec3 | `accel` (added to speed each frame), `scale` (start scale), `scaleSpeed` | all |
| vec3 | `rotation`, `rotationLow`, `rotationHigh` | v0.2+ (else zeros) |
| i32 | `repeatScal` (ping-pong scale) | v0.2+ (else 0) |
| i32 | `repeat` (sustain loop, see 2.5 step 4) | **v0.3 only** (else 0) |
| f32 x6 | `scalSpeedXLow, XHigh, YLow, YHigh, ZLow, ZHigh` | v0.2+ |
| vec3 | `scaleSpeed2`, `scaleEnd` | v0.2+ |

At run time `rotation` (the base one) and `scaleSpeed2` are **never read** (checked: only the loaders touch them, `sfxbase.cpp:553,709,783,857,922`); `scaleEnd` only matters with `repeatScal`.

**Enums** (`sfxbase.h:17-32`): `billType`: 1 BILL (camera-facing), 2 BOTTOM (lying flat), 3 POLE (treated like BILL), 4 NORMAL (rotates like a 3D object). `alphaType`: 1 BLEND (src alpha / inv src alpha), 2 GLOW (additive). `nPoints` default 20 (`:1185`).

### 1.3 Version branches in the loader (all of them)
1. `SFX0.1`: every part `Load` (`:1732-1743`).
2. `SFX0.2`: every part `Load2` (`:1745-1757`).
3. `SFX0.3`: particle parts `Load3`, all other part types `Load2` (`:1759-1774`).
4. anything else (no magic): `Seek(0)`, every part `OldLoad` (`:1775-1789`).
5. File missing: `Load` logs and returns FALSE (`:1791-1796`); `SetSfx` then leaves `m_pSfxBase` NULL and the object draws nothing (Render checks `if(m_pSfxBase)`, `:2431`).
- Key load detail: `AddKeyFrame` inserts in sorted order, then `AdjustKeyFrame` overwrites the key at that frame (`:44-87,145-153`), so unsorted files are sorted and a duplicated frame keeps the **last** data. Corpus: 0 unsorted, 1 part with a duplicate frame.
- Particle loaders read the frame into an `int` but only 2 bytes (`:727-728`); harmless (it is passed on as WORD).

### 1.4 Corpus statistics (Client/SFX)
- 733 `.sfx` files: 731 in `Client/SFX/` + 2 stray copies in `Client/SFX/Texture/` (`sfx_genref01.sfx`, `sfx_sklragbowrain.sfx`; unreachable by name). Versions: 37 old, 75 v0.1, 421 v0.2, 198 v0.3.
- Parts: 4458 total; 1792 BILL, 1543 PARTICLE, 128 MESH, 995 CUSTOMMESH. Max 41 parts in a file, mean 6.1. Longest key frame 1400.
- Alpha type: 4288 GLOW (96%), 170 BLEND. billType by part type: BILL parts 1118 camera-facing (BILL) / 402 BOTTOM / 270 NORMAL / 2 POLE; PARTICLE parts 1296 BILL / 57 BOTTOM / 124 POLE / 66 NORMAL; CUSTOMMESH parts 947 NORMAL / 39 BOTTOM / 9 BILL; MESH parts 120 BILL / 5 BOTTOM / 3 NORMAL.
- 647 parts have `using = FALSE` (skipped when drawing). 330 parts use texture animation (`texFrame > 1`): 140 BILL, 99 PARTICLE, 81 CUSTOMMESH, 10 MESH (mesh ignores it). 138 particle parts have `repeat`, 96 have `repeatScal`.
- Particle emission: 1479 continuous (`create > 0`), 62 one-burst (`create = 0`), of which 17 start at frame 0 (see quirks, 2.8).
- 22 parts have zero keys (never drawn). 12 keys have `nAlpha > 255`.

---

## 2. Playing an effect (how Neuz does it)

### 2.1 Time base
- One sfx "frame" = one game tick. `CSfxModel::Process` does `m_nCurFrame++` first (`_Common/sfxbase.cpp:2705`); `CSfx` converts seconds as `m_nSec * 60` (`_Common/SfxObj.cpp:155`).
- The game loop is fixed-step: `FRAME_PER_SEC 60` (`_Common/timer.h:133`); `SetFST()` waits until `m_lTime >= 1000 / FRAME_PER_SEC` and subtracts it (`_Common/timer.cpp:516-524`). With integer division that is **16 ms = ~62.5 ticks/s**, nominally 60. Render is skipped, not logic, when behind (`IsDrawTiming`, `timer.cpp:504-514`; loop `_DirectX/d3dapp.cpp:1634-1685`). `FrameMove` (all `Process` calls, `Neuz/Neuz.cpp:1007-1100`) runs every loop; `CWorld::Process` calls each object's `Process()` once per tick, but only objects within half the far plane of the camera (`_Common/World.cpp:786-841`).
- Web should use 60 Hz ticks with a fixed-step accumulator (frame numbers are integers; keyframes interpolate per tick).

### 2.2 Object, attachment, end of life (`CSfx`, `_Common/SfxObj.cpp`)
- `CreateSfx( dev, XI, vPosSrc, idSrc, vPosDest, idDest, nSec )` (`_Common/CreateObj.cpp:33-377`): picks a C++ class by `XI` (table in 3.1), `SetSfx` (`SfxObj.cpp:77-102`) sets `m_idSrc/m_idDest/m_vPosDest/m_nSec`, `vPosSrc.y += 0.01` ("avoid z-fighting", `:85`), loads the model elem (`SetTypeIndex(..., bInitProp = TRUE)` -> `ResetScale()` so **the effect's scale = the `fScale` column of its mdlDyna entry**, `_Common/Obj.cpp:390-424`; 581 of 652 entries are 1.0, others 0.1-4). Then it **plays the sound named in the model entry's `part` column** (`CreateObj.cpp:328-329`; 217 of 652 entries have one) and adds the object to the world (`:369`).
- `CSfx::Process` (`SfxObj.cpp:134-238`): `m_nSec == 0` plays once and `Delete()`s when `CSfxModel::Process()` returns TRUE (`:143-147`); otherwise it loops (`m_nCurFrame = 0` when finished, `:151-152`) and, if `m_nSec != -1`, deletes after `m_nSec * 60` ticks (`:153-157`); -1 = until removed from outside. For mesh parts it also calls `FrameMove()` on the **shared** mesh model each tick (`:160-176`).
- Follow rules in the base class (`:178-237`): if `m_idDest` is set, position = that mover's position every tick; else if `m_idSrc` is set, position = the source's position (and the effect is deleted when the source is gone). Both use the mover's **foot position** (`GetPos()`), not a bone. Neither follows the mover's heading; rotation is the object's own `m_fAngle` (default 0) unless a subclass sets it.
- Render (`CSfx::Render`, `:241-260`): `vPos = GetPos() + (0, 0.2, 0)`, `m_vRotate.y = GetAngle()`, `m_vScale = GetScale()`, then `CSfxModel::Render`. Some subclasses skip the +0.2 (`CSfxGenNormalDmg01::Render`, `Sfx.cpp:62-68`; `CSfxFixed::Render`, `:2113-2119`).
- Heading convention: `SetAngle(-mover->GetAngle())` aligns an effect with the mover (movers rotate by `YawPitchRoll(-angle)`, `Obj.cpp:126-137`; effect parts rotate by `+m_vRotate.y`). Mover forward vector for angle a (deg) is `(sin a, 0, -cos a)` (`_Common/xUtil3D.h:37-43`).
- Attached to a hand: `CSfxPartsLink::Process` (`Sfx.cpp:3703-3731`) sets position each tick from `CModelObject::GetHandPos( PARTS_RWEAPON / PARTS_LWEAPON, mover world matrix )`; `CSfxRotate`/`CSfxCollect` use `GetEventPos(0)` / `GetForcePos`; `CSfxLinkMover` uses the mover's origin (`:4032-4081`). Everything else is "position only".
- Effects with an `idSrc` are skipped for players when `g_Option.m_nSfxLevel <= 0` and the effect is not a skill effect; all skipped when `m_bSFXRenderOff` (`_Common/World3D.cpp:1195-1212`). Options only; not needed for parity.

### 2.3 Key interpolation (all part types)
- `GetPrevKey(f)` = last key with `nFrame <= f`; `GetNextKey(f)` = first key with `nFrame >= f` (`sfxbase.cpp:107-143`). If either is NULL (f before the first key or after the last) the part is **not drawn** (e.g. `:210,327`).
- Between them: `pos, posRotate, rotate, scale` linear in float with t = `(f - prev.nFrame) / dFrame`; `nAlpha += (next.a - prev.a) * (f - prev.f) / dFrame` in **integer** math (`:215-222`). `dFrame == 0` (f is exactly a key) takes the previous key as is.
- Alpha reaches the GPU as `TEXTUREFACTOR = nAlpha << 24 | 0x404040` (`:306,414,1128`); only the alpha byte is used (the colour stage ignores it, see 2.7). `nAlpha > 255` wraps in the byte (12 corpus keys).

### 2.4 Per part type (the game path is `CSfxModel::Render`, `:2429-2505`, with the float angle = `m_vRotate.y`; `Render2` (`:2063-2141`, full 3-axis angle) is used only by projectiles and move/rain marks, not by the effects in scope)
Order: parts are drawn in file order, skipping `using == FALSE` (`:2448-2451`). There is no per-part sorting.

**Quad geometry (BILL and PARTICLE):** unit quad of half-size `m_fScale = 0.5` (`sfxbase.h:259`), corners (-.5,.5) (.5,.5) (.5,-.5) (-.5,-.5), UV (0,0) (1,0) (1,1) (0,1), drawn as a triangle fan, no culling (`:1845-1869`, `:416`).

**BILL part** (`CSfxPartBill::Render`, `:314-418`; scale = effectScale * key.vScale per axis, `:344-347`; the quad's local transform is `M = S * R * T`, D3D row-vector order):
- billType 1 BILL: `S * Rz(key.rotate.z) * invView` (camera-facing, full camera orientation incl. pitch/roll: `g_matInvView` is the inverse view matrix with translation zeroed, `_Common/Camera.cpp:66-68`) (`:351-359`).
- billType 3 POLE: identical to BILL ("not done yet", `:368-376`).
- billType 2 BOTTOM: `S * Rz(key.rotate.z - angleY) * Rx(90 deg)` (a flat disc facing up; `:360-367`).
- billType 4 NORMAL: `S * YawPitchRoll(yaw = key.rotate.y + angleY, pitch = key.rotate.x, roll = key.rotate.z)` (`:377-384`).
- Translation: `vPos + Rot(key.vPos) * effectScale` where `Rot` = `YawPitchRoll(key.posRotate + (0, angleY, 0))` (yaw = y, pitch = x, roll = z, degrees) (`:386-394`).
- Texture: if `texFrame > 1`: index = `(texFrame * (frame - firstKey.nFrame) / texLoop) % texFrame` (integer), file name from `GetTextureName` (`:316-322`); nothing is drawn before the first key's frame.
- Texture animation file names: `GetTextureName(name, i)` (`:21-33`) takes the two characters before the 4-char extension as a number, adds `i`, prints `%02d`, so `x-5.dds` +4 is `x-1.dds`, +5 is `x00.dds`... Every animated name in the corpus resolves to an existing file.

**CUSTOMMESH part** (`CSfxPartCustomMesh::Render`, `:1303-1442`): a procedural open cylinder / cone / ring built per draw, `m_nPoints*2 + 1` vertex pairs (default 20):
- Pair `i` (angle = `(360 / (nPoints*2)) * i` degrees, **integer division** in the C++, `:1405`): top vertex `(sin a * key.scale.x, key.scale.y, cos a * key.scale.x)`, bottom `(sin a * key.scale.z, 0, cos a * key.scale.z)`, then multiplied component-wise by the effect scale (`:1405-1412`). Triangle strip, drawn twice (CW then CCW culling) so it is double sided (`:1436-1439`).
- UVs come from `key.posRotate` (not a rotation here): `v_top = posRotate.y + 0.02`, `v_bottom = posRotate.z`; `u = posRotate.x * i / (nPoints*2)` when `posRotate.x != 0`, else alternating 0 / 1 per pair (`:1414-1430`). So `posRotate.x` is the U repeat count around the ring (sample: genlevelup 9 -> texture repeats 9 times around), with wrap addressing.
- Orientation: BILL `Rz(rotate.z - angleY) * invView`... (`:1331-1357`), BOTTOM `Rz(rotate.z) * Rx(90)`, NORMAL `YawPitchRoll(rotate + (0, angleY, 0))`; position = `key.vPos` rotated by Y(angleY) only, times effect scale (`:1372-1385`; `posRotate` is NOT used for position here).
- The same cone geometry is recomputed each frame from the interpolated key: a web version can build one unit mesh and scale it per frame, or rebuild.

**MESH part** (`CSfxPartMesh::Render`, `:1072-1178`): `part.tex` is a **model file name** (an `.o3d` in `Client/Model/`, 52 distinct, all present; 128 parts in 72 sfx files), loaded through `CSfxMeshMng` -> `CModelObject::LoadModel` (`:3196-3211`). World = `S(effectScale * key.scale) * YawPitchRoll(key.rotate + (0, angleY, 0)) * T(...)` (`:1094-1114`). GLOW: `m_nNoEffect = 1`; BLEND: `m_nNoEffect = 0` + alpha test on (`:1150-1156`). It renders with the model's own materials; how `nAlpha` applies is inside `CModelObject::Render` (not traced). Its animation is stepped by `CSfx::Process` (`SfxObj.cpp:160-176`).

**PARTICLE part** (`CSfxModel::RenderParticles`, `:2507-2697`, with `__SFX_OPT` branches that only change texture-switch caching): uses the **part's key at the current frame** (interpolated like above; `key.vScale` is never used for particles, the particle's own scale is, `:2526-2529,2649`) as the emitter transform, and draws every live particle as a quad:
- Emitter offset `vTemp = Rot(key.vPos)` with `Rot = YawPitchRoll(key.posRotate + (0, angleY, 0))` (`:2581-2583`).
- Per particle: `p = vTemp + Rot2(particle.vPos) * effectScale + vPos`, `Rot2 = YawPitchRoll(key.rotate + key.posRotate + (0, angleY, 0))` (`:2640-2647`); the particles are therefore in **effect-local space** and move with the effect.
- Quad scale = `particle.vScale.xy * effectScale` (z = effectScale.z) (`:2649`). Orientation = billType matrix (BILL/POLE `Rz(key.rotate.z) * invView`; BOTTOM `Rz(key.rotate.z - angleY) * Rx(90)`; NORMAL `YawPitchRoll(key.rotate + (0,angleY,0))`, `:2536-2566`) and an extra per-particle rotation `matRot = YawPitchRoll( lerp(0, particle.vRotation, t) )` with `t = (frame - prev.nFrame) / dFrame` of the **key segment**, not the particle age (`:2653-2665`). Final: `matRot * matScale * matTemp * matTrans` (`:2665`).
- Particle alpha (integers, `:2679-2693`): age < appear: `age * keyAlpha / appear`; age > keep: `keyAlpha - keyAlpha * (age - keep) / (disappear - keep)`; else `keyAlpha`.
- Texture animation uses the particle's own age: `(texFrame * age / texLoop) % texFrame` (`:2597-2600`).
- `repeatScal` ping-pong is done **in render**, one step per draw call per particle: if `|scale| >= |scaleEnd|` direction = shrink; elif `|scale| <= |scaleStart|` direction = grow; `scale +/-= scaleSpeed` (`:2625-2638`). (Process skips the normal `scale += scaleSpeed` for these parts, `:2729-2730`.)

### 2.5 Particle simulation (`CSfxModel::Process`, `:2699-2975`)
Each tick, for every particle part that is `using` (`:2708-2716`):
1. Advance live particles: `pos += speed; speed += accel; scale += scaleSpeed` (unless `repeatScal`); `age++`; remove when `age >= disappear` (`:2723-2740`). New particles skip this step on the tick they are born.
2. Emit when `m_nCurFrame` is in `[firstKey.nFrame, lastKey.nFrame - disappear]` (`:2741-2748`): `create == 0`: only when `m_nCurFrame == firstKey.nFrame`; else when `(m_nCurFrame - firstKey.nFrame) % create == 0`; `createNum` particles each (`:2755-2847`).
3. New particle (with `__SFX_OPT`, which is on, `:2750-2847`): three randoms `r1,r2,r3 = (rand()%50000)/50000` drawn **once per tick** and shared by all `createNum` particles of that tick; each particle only gets its own angle `a = RANDF * 360` (used directly as radians in sin/cos, so effectively random):
   - `pos = (sin a * startPosVar, r1 * startPosVarY, cos a * startPosVar)`
   - `f = xzLow + r2 * (xzHigh - xzLow)`; `speed = (sin a * f, yLow + r2 * (yHigh - yLow), cos a * f)`
   - `scale = part.scale`; `rotation = (lowX + r1*(highX-lowX), lowY + r3*(...), lowZ + r2*(...))`
   - `scaleSpeed = (sxLow + r3*(sxHigh-sxLow), syLow + r2*(...), szLow + r1*(...))`; `scaleStart = scale`, `scaleEnd = part.scaleEnd`.
   So a burst of N is N particles on a ring with identical speed/height: the visual is a ring or a puff, not a random cloud. (The non-`__SFX_OPT` branch `:2848-2942` draws fresh randoms per particle; it is not compiled.)
4. If `part.repeat`: when `m_nCurFrame / lastKey.nFrame >= 0.65` the whole effect's `m_nCurFrame` jumps back to `int(lastKey.nFrame * 0.6)` (`:2950-2965`). That is an endless sustain loop of the tail (buff-style effects); only objects with `m_nSec` or an external `Delete` end it. 138 corpus parts.

### 2.6 End of the effect (return value of `Process`, `:2699-2975`)
`ret` starts TRUE (done). It becomes FALSE (not done) when: any live particle exists (`:2944`); `m_nCurFrame < firstKey.nFrame` of a particle part (`:2947`); in the non-burst branch, on a tick that is not an emission tick (`:2845-2846`); or, for every **non-particle** part, whenever that part still has a key at frame `>= m_nCurFrame` (`GetNextKey`, `:2968-2972`). Notes: a non-particle part counts even if `using == FALSE` (only particle parts check `using`, `:2715`); parts with zero keys never count.
Practical rule: the effect lives until the last key frame of any non-particle part has passed AND all particles are dead.

### 2.7 Render state (`CSfxModel::Render`, `:2433-2446`, per-part blend `:396-407`)
- Lighting off, fog off (`World3D.cpp:1185`), culling none, depth test on, **depth write off** for BILL/PARTICLE/CUSTOMMESH (MESH writes depth).
- Stage 0 colour = **texture RGB only** (`SELECTARG1 TEXTURE`); alpha = **texture alpha x TFACTOR alpha** (`MODULATE`). Blend `SRCBLEND = SRCALPHA`; `DESTBLEND = ONE` for GLOW (additive: `rgb * alpha + dest`) or `INVSRCALPHA` for BLEND. So key `nAlpha` is the additive/blend intensity; there is **no tint colour** in an sfx.
- Drawn after all opaque objects, water and tail effects, sorted far to near by distance to the camera (`World3D.cpp:1179-1215`).
- Sampler: linear min/mag; U address mode 1 = wrap (`World3D.cpp:117-119,199-201`); mip filter NONE or POINT (`:141,156,223,238,298`); not confirmed which is in force for sfx (see open questions). Textures get a full mip chain on load but are likely sampled without mips.
- **Texture format:** `AddTex` loads every sfx texture with `D3DFMT_A1R5G5B5` and no colour key (`sfxbase.cpp:3146-3161`, `_Common/vutil.cpp:192-232` -> `D3DXCreateTextureFromFileInMemoryEx`): **5-5-5 colour and 1-bit alpha** on the GPU, whatever the file holds. Checked with the web decoder: of the 1976 sfx textures **1855 are fully opaque** (alpha 255 everywhere; the glow look comes from RGB intensity x key alpha), only 121 have any alpha < 255. For the M1+M2 sets only **4 of 63** textures carry alpha: `sfx_hitCritical01-1.dds`, `sfx_hitMiss01-1.dds`, `sfx_hitParry01-2.dds`, `sfx_Block01.dds` (all BLEND-type banner parts); the three Vagrant effects use none. So the 1-bit-alpha question touches only those four banners (exact D3DX rounding unknown, see open questions); 5-5-5 colour is a quantisation (banding) only.

### 2.8 Quirks worth knowing before re-implementing
- First tick sees frame 1 (`m_nCurFrame++` before use): a burst particle part whose first key is at frame 0 **never emits** (17 corpus parts). Continuous emitters with first key 0 first emit at tick `create`.
- `Key.nAlpha` is an int; alpha 0 parts are still "alive" for the end-of-life rule.
- The effect is not drawn on a frame where either neighbour key is missing: a part's first key is its start, the last its end (no hold).
- Scale asymmetry: for BILL parts the offset `key.vPos` is multiplied by the effect scale (`:386-394`); for PARTICLE parts the emitter offset `key.vPos` is **not** scaled, only the per-particle offsets and quad sizes are (`:2644-2649`).
- `CSfxModel::SetSfx` bounding box is a fixed 2x1x2 box (`:1966-1975`), used by culling of the CSfx; big effects can pop out near screen edges. Not worth replicating.

---

## 3. Hard-coded effect classes

### 3.1 Dispatch: `CreateSfx` is a switch on the `XI_*` id (`_Common/CreateObj.cpp:33-377`)
`default` (`:311`) is the **plain `CSfx`**: play the .sfx once (or `nSec` seconds) at the given position, following `idSrc`/`idDest` if given. Only ids that need special behaviour are listed. (`XI_*` values: `Resource/defineObj.h`; sfx names: mdlDyna.inc; all resolved by web `loadDefines` + `readModelIndex`.)

| class (`_Common/Sfx.h` / `Sfx.cpp`) | created for | beyond "play the file" |
|---|---|---|
| `CSfx` (`SfxObj.cpp`) | default; `XI_HIT_CRITICAL01` (:183), `XI_HIT_MISS01` (:184), `XI_GEN_CURE01`, `XI_GEN_REF01` (these two also play `SND_GEN_LEVELUP`, :180-181), **`XI_GEN_LEVEL_UP01`**, `XI_GEN_MONSTER_SPAWN01`, `XI_HIT_KNUCKLE01`, `XI_HIT_PARRY01`, `XI_HIT_HITBLOCK01`, buff ids | plain; follows src/dest; +0.2 y |
| `CSfxGenNormalDmg01` (`Sfx.h:197`, `Sfx.cpp:47-68`) | `XI_HIT_SWORD01/02`, `XI_HIT_STICK01/02` (`CreateObj.cpp:61-64`) | plain play-once; no +0.2 y; pooled |
| `CSfxFixed` (`Sfx.h:1017`, `Sfx.cpp:2080-2119`) | **`XI_SKILL_VAG_ONE_OVERCUTTER01 / CLEANHIT01 / BRANDISH01`** and a dozen other melee skill hits (`CreateObj.cpp:94-114`, angle `-caster.angle`), `XI_HIT_YOY01`, `XI_HIT_BOW01`, and arrow/yoyo hit ids (`:128-153`, angle `180 - caster.angle`), `XI_SKILL_BIL_KNU_SONICHAND02`/`ASALRAALAIKUM02` (`:115-124`, `-angle + 180`) | stays at `m_vPosDest` (position fixed at creation); `m_nSec == 0` plays once else loops; `Render` sets `m_vRotate.y = GetAngle()` (`Sfx.cpp:2086-2119`) |
| `CSfxGenMoveMark` (`Sfx.cpp:479-502`) | `XI_GEN_MOVEMARK01` (click-to-move marker, `_Interface/WndWorldControlPlayer.cpp:345`, `_Common/MoverMove.cpp:124`) | `Render2`, +0.05 y; one global instance `g_pMoveMark` (`:485-494`) |
| `CSfxGenWaterCircle/RainCircle/WaterCrown` | walking in water (`Mover.cpp:3188-3192`), rain (`SkyBox.cpp:206,216`) | `Render2`; pooled; crown also plays `SND_GEN_WATER` (`CreateObj.cpp:82`) |
| `CSfxGenRestoration01/Login/Warp/PcDie` | `XI_GEN_RESTORATION01`, `LOGIN01`, `WARP01`, `PC_DIE01` | follow `idSrc` each tick, rotation = own angle (`Sfx.cpp:146-163,385-451`). **`XI_GEN_PC_DIE01` (55) has no mdlDyna entry, so the death effect does not exist in this data** |
| `CSfxPartsLinkBlade/Jst`, `CSfxAllowPartsLink`, `CSfxPartsLinkShoulder` | skill "ready" effects on the right/left hand (blade, jester, arrow, knuckle), set-item shoulder effect | position = `GetHandPos(...)` of a weapon part each tick (`Sfx.cpp:3703-3825`). **Bug:** the Jester cases fall through into `CSfxPartsLinkBlade` (`CreateObj.cpp:278-293`, no `break`) |
| `CSfxLinkMover` | buff pets | origin of mover, loops (`Sfx.cpp:4032-4081`) |
| `CSfxRotate`, `CSfxCollect`, `CSfxReady`, `CSfxCursor`, `CSfxDuelParty`, `CSfxSetItem` | wing, gathering, item cast, pet cursor, PVP flag, set bonus | follow a mover (back/hand bone), loop for a time or until a state ends (`Sfx.cpp:2806-2965,3373-3432,3826-4025`) |
| `CSfxShoot` (+ `CSfxItemWandAtk1-4`, `CSfxItemWandAtkAir`, `CSfxMagicMiAtk1`, `CSfxItemRangeAtk1` family, `JunkBow`, `AtkStraight`, `ShootWave`, `CSfxItemYoyoAtk`) | wands, bows, yoyos, mage skills (`XI_SKILL_MAG_*`), boss shots | **projectiles**: move toward the target each tick (e.g. 0.2/tick for Shoot `Sfx.cpp:3487`, 0.7/tick arrows `:987`), homing, tail ribbons, call `DamageToTarget()` (-> `g_DPlay.SendSfxHit`, `SfxObj.cpp:107-133`) at 0.2-0.4 distance, spawn a hit sfx (`m_dwSfxHit`) and play `m_dwSndHit` on impact; use `Render2` (3-axis rotation from a quaternion) |
| `CSfxSkill*` (Mer, Mag, Ass, Tro) | Mercenary/Magician/Assist/Troupe skills | casting effects, projectiles or timed overlays; a few spawn a second sfx (`m_SfxObj2`) after N frames (e.g. `CSfxSkillMerSplmash` after 85 ticks, `Sfx.cpp:2173-2212`) |
| `CSfxClockWorks*`, `CSfxMushmootCharge`, `CSfxNpcDirSteam` | bosses | charge/cannon animations tied to bone positions |

**Classes declared but never created in this build** (`grep "new CSfx..."`): `CSfxSkillVagOverCutter/CleanHit/Brandish` (`Sfx.cpp:2020-2148`; the Vagrant skills use `CSfxFixed`), `CSfxGenLevelUp` (`:216-242`), `CSfxGenCure`, `CSfxGenIncrease01`, `CSfxGenSuperDmg01`, `CSfxGenSkillDmg01`, `CSfxGenMonsterDmg01`, `CSfxGenMonsterSpawn`, `CSfxSkillMerPanBarrier/Protection` (created elsewhere or not at all).

### 3.2 What is created for each Piece 4 event

**Melee hit (basic attack).** Client-predicted at the attacker's hit frame, before the server's damage reply:
1. The attack motion reaches a frame with the MA_HIT attribute -> `ProcessStateAttack` -> `CMover::OnAttackMelee` (`_AIInterface/ActionMoverState.cpp:1080-1090`, `_Common/MoverActEvent.cpp:1592-1726`) -> `CMover::OnDamage` -> victim `SendDamage(AF_GENERIC, attackerId)` (`MoverActEvent.cpp:1503-1588`) -> `CActionMover::OnDamageMsgC` (`_AIInterface/ActionMoverDmg.cpp:54-122`, reached from `ActionMoverMsg.cpp:828`).
2. `OnDamageMsgC`, if `AF_GENERIC`: weapon = attacker's active hand item. Position: yoyo -> victim pos + (0,1,0); everything else -> victim pos + attacker-forward unit vector (`AngleToVectorXZ(attackerAngle, 1.0)`) + (0,1,0) (`:75-90`). `CreateSfx( weapon.dwSfxObj3, vLocal )` (`:92-93`) and, if set, `CreateSfx( weapon.dwSfxObj5, attacker pos )` (`:96-100`). Also `victim.m_nDmgCnt = 10` (shake) and `SetDamagedMotion` (`:118-120`).
3. Which effect: `dwSfxObj3` of the item (`propItem.txt`, loader `_Common/ProjectCmn.cpp:416-421`). Corpus (767 weapons): swords + axes `XI_HIT_SWORD01` (`sfx_HitSword01`), sticks/staffs `XI_HIT_STICK01`, knuckles `XI_HIT_KNUCKLE01`, bows `XI_HIT_BOW01`, yoyos `XI_HIT_YOY01` (scale 2 from mdlDyna), wands `XI_FIR_WAND01` (projectile), the bare-hand row ("Hand", `IK3_HAND`) and most monster weapons (`IK3_VIRTUAL`, 208 rows): none; `dwSfxObj5` is NULL for every player weapon. `XI_HIT_SWORD02`/`XI_HIT_STICK02` point at **missing** files.
4. Sound: `PLAYSND( weapon.dwSndAttack1 )` at the attacker (`MoverActEvent.cpp:1690`); crit extra `dwSndAttack2` (`DPClient.cpp:1903-1908`).

**Critical / miss / parry / block / damage numbers** (server `OnDamage` snapshot, `Neuz/DPClient.cpp:1758-1934`; see 5): `XI_HIT_CRITICAL01` at victim + (0,1.5,0), scale 3 (`:1886-1893`); `XI_HIT_MISS01` scale 2 (`:1875-1883`); `XI_HIT_PARRY01` scale 2 (`:1852-1859`); `XI_HIT_HITBLOCK01` scale 2 (`:1843-1850`). Created with no `idSrc`, so they sit at a fixed world point (they do not follow the mover). Crit = `sfx_HitCritical01` (70 frames, 4 parts); miss = `sfx_HitMiss01` (70 frames, 3 parts).

**Level up.** `CreateSfx( XI_GEN_LEVEL_UP01, mover pos, mover id )` -> plain `CSfx` (nSec 0 => plays once, follows the mover's position, angle not followed). Sites: `CMover::SetExperience` when `nLevel > m_nLevel` (`_Common/MoverParam.cpp:1716-1740`, with `MTI_LEVELUP` motion if standing, `BGM_IN_LEVELUP`, chat line `TID_GAME_LEVELUP`, big caption `TID_GAME_LEVELUP_CAPTION`), `AddExperience` (`MoverParam.cpp:1479-1484`), `OnSetLevel` (`DPClient.cpp:3339-3352`), and again when skill points rose (`DPClient.cpp:3398-3400`, which uses `g_pPlayer` as position: a level up can spawn the effect twice). File: `XI_GEN_LEVEL_UP01` = id 42 = `sfx_GenLevelUp01.sfx`, v0.1, 9 parts: a ground disc (BOTTOM quad), 3 upright light-beam quads (NORMAL), 4 custom-mesh cylinders/rings, 1 particle part (9 texture frames), up to frame 410 = **~6.8 s**. No sound in the sfx entry; the music is `PlayMusic(BGM_IN_LEVELUP)`.

**Death.** There is **no sfx** for dying in this data (`XI_GEN_PC_DIE01` has no model entry). What happens (`Neuz/DPClient.cpp:1936-2090`, `_AIInterface/ActionMoverMsg.cpp:842-1002`): `OnMoverDeath` zeroes HP, deselects, shows a damage number with the **remaining HP** if the local player is involved (`:2006-2007`), then `SendActMsg(OBJMSG_DIE)`: `MTI_DIE1` motion held on its last frame (`ANILOOP_CONT`, `:964-967`), or for a strong-hit kill (`OBJMSG_DAMAGE_FORCE`) the knock-back flight `MTI_DMGFLY` + `DoDamageFly( attackerAngle, 145, 0.25 )` then lands dead (`:953-961`, `ActionMoverState.cpp:504-521`). `__BS_DEATH_ACTION` randomised launch is not compiled. Motion attribute MA_QUAKE during a NPC's death shakes the camera (`SetQuake(15)`, `ActionMoverState.cpp:561-569`). The corpse is removed by a server delete (`ActionMoverState.cpp:531-557`: 3 s server timer for monsters; the client only waits for it). Player death also opens the revival window and plays `BGM_IN_DEATH` (`DPClient.cpp:2034,2062-2071`).

**Monster spawn.** `XI_GEN_MONSTER_SPAWN01` (`sfx_GenMonSpawn01`, 95 frames, dust ring) at the monster, when within 32 m (XZ) of the player (`DPClient.cpp:1136-1138,1226`). The `m_bSmooth` fade-in code is not compiled.

**Vagrant skills** (job 0; there are exactly three; `Resource/defineSkill.h:19-21`; names from `propSkill.txt`: Clean Hit, **Flurry** (= `SI_VAG_ONE_BRANDISH`), Over Cut):
- Data (`propSkill.txt`, same loader as items, web `readPropItem` columns): all three have `dwSfxObj3` = `XI_SKILL_VAG_ONE_CLEANHIT01` (201) / `BRANDISH01` (202) / `OVERCUTTER01` (203); `dwSfxObj`, `2`, `4`, `5` NULL; `dwExeTarget` 17 = `EXT_MELEEATK` (`Resource/define.h:55`); `dwSndAttack1` 115; `dwUseMotion` 1000/1001/1002; no skill duration (`propSkillAdd.csv`: `dwSkillTime` = `=`).
- Trigger: skill motion reaches its MA_HIT frame -> `ProcessStateMeleeSkill` (`ActionMoverState.cpp:638-654`) -> `CMover::OnMeleeSkill` (`MoverActEvent.cpp:72-164`) -> `DoApplySkill` -> `CCtrl::CreateSkillSfx` (`_Common/Ctrl.cpp:878-997`, called at `:1662`). Also `pModel->m_nPause = 4` (hit stop, client only, `ActionMoverState.cpp:656-658`) and the attacker's spark flash (6.x).
- Branch for "no duration + melee" (`Ctrl.cpp:942-961`): position `vLocal` = caster pos + forward (`AngleToVectorXZ(casterAngle, 1.3)`) + (0,1,0); `CreateSfx( sfx3, vLocal, casterId, vLocal, targetId, 0 )` -> **`CSfxFixed`** with `SetAngle(-casterAngle)` (`CreateObj.cpp:94-111`). It stays at that fixed point, plays once. Then `PLAYSND( dwSndAttack1 )` at the caster (`Ctrl.cpp:982-986`).
- Files (all v0.1): `sfx_sklvagcleanhit01` 7 parts (3 NORMAL + 3 BILL quads, 1 particle) ~30 frames; `sfx_sklvagbrandish01` 7 parts (3 custom-mesh cones using `sfx_sklmaghotair02-1.dds`, 3 BILL, 1 particle) ~65 frames; `sfx_sklvagovercutter01` 9 parts (3 NORMAL quads, 3 custom meshes, 2 BILL, 1 particle) ~40 frames. Together: 3 files, 23 parts (14 quad, 6 custom mesh, 3 particle), 16 textures (347 KB DDS). No mesh parts, no texture animation, no `repeat`.

**Durations of the effects in scope** (ticks of 1/60 s; last key frame of any part, particle tails included; parts / version):

| file (XI) | ticks | s | parts | version |
|---|---|---|---|---|
| `sfx_HitSword01` (`XI_HIT_SWORD01`) | 19 | 0.32 | 4 | 0.3 |
| `sfx_HitStick01` | 24 | 0.40 | 4 | 0.1 |
| `sfx_HitKnuckle01` | 25 | 0.42 | 7 | 0.1 |
| `sfx_hitbow01` | 35 | 0.58 | 5 | 0.2 |
| `sfx_hityoy01` | 20 | 0.33 | 3 | 0.2 |
| `sfx_HitCritical01` | 70 | 1.17 | 4 | 0.1 |
| `sfx_HitMiss01` | 70 | 1.17 | 3 | 0.1 |
| `sfx_HITPARRY01` / `sfx_HITBLOCK01` | 70 | 1.17 | 3 each | 0.2 |
| `sfx_GenLevelUp01` | 410 | 6.8 | 9 | 0.1 |
| `sfx_GenMonSpawn01` | 95 | 1.6 | 5 | 0.1 |
| `sfx_movemark` | 120 | 2.0 | 4 | 0.2 |
| `sfx_sklvagcleanhit01` (Clean Hit) | 30 | 0.5 | 7 | 0.1 |
| `sfx_sklvagbrandish01` (Flurry) | 65 | 1.1 | 7 | 0.1 |
| `sfx_sklvagovercutter01` (Over Cut) | 40 | 0.67 | 9 | 0.1 |

---

## 4. Where the effect files live

| what | where | count | notes |
|---|---|---|---|
| `.sfx` | `Client/SFX/*.sfx` (loose) | 731 (+2 stray in `SFX/Texture/`) | 652 are named by mdlDyna OT_SFX entries (621 distinct files; 17 entries name a file that does not exist, e.g. `sfx_HitSword02`, `sfx_HitStick02`, `sfx_sklbillsonichand01`); 127 files are not in mdlDyna (several are loaded by C++ name: `sfx_HitWand01` `Sfx.cpp:583,718,838,1820,1884,1948`, `sfx_sklpsypsychicwall02/03/04`). Name rule: 3.1 / 1.1 |
| sfx textures | `Client/SFX/Texture/` (`DIR_SFXTEX`, `path.h:37`) | 1979 files = 1976 real DDS (one has an upper-case `.DDS`), 2 stray `.sfx`, and 1 sfx file misnamed `sfx_SklAcrBowAutoShot01.dds` | 128x128 x1436, 256x256 x305, 64x64 x179, 32x32 x46, 512x512 x10. Formats: DXT1 1463, DXT3 451, 16-bit uncompressed 60, DXT5 2. 41 MB raw. 1623 distinct names are referenced by sfx parts (1616 present); 363 files are unused. |
| texture references | in `.sfx`: 4306 `.dds`, 1 `.bmp` (`cure1.bmp`, missing), 23 empty names | | 7 names missing: `magician_fire_casting.dds`, `magician_wind_casting.dds`, `cure1.bmp`, `test.dds`/`test2.dds` (118 files, mostly unused parts), `sfx_sklblddswsilent12.dds`, `sfx_sklmerweasupport07.dds`. Empty name = `SetTexture(NULL)`: the quad is drawn untextured (white) in 23 parts |
| stray | `Client/SFX/*.dds` (25 files, e.g. `respawn1-3.dds`, `sfx_Skl*.dds`) | 25 | not referenced by any sfx; ignore |
| mesh parts | `Client/Model/*.o3d` | 52 distinct, all present | 72 sfx files; textures are in `Client/Model/TextureMid/` (already converted by the web texture stage) |
| damage digits | `Client/SFX/DmgEffect.dds` (1024x256) + `DmgEffect.inc` | 1 | section 5 |
| hit sparks (point sprites) | `Client/Model/TextureMid/` | `Sfx_ItemPatical01.dds`, `Sfx_ItemPatical06-01..05.dds`, `etc_Particle2.bmp`, `etc_Particle11.bmp`, `etc_ParticleCloud01.bmp` | section 6 |
| sound for an effect | model entry `part` column (a `.wav` name in `Client/Sound`) | 217 of 652 entries | out of scope here |

Web side for the same: `web:tools/convert/src/ClientFs.ts` lists `Client/` case-insensitively (`list('SFX', /\.sfx$/i)`).

Sizes for the planned milestones (corpus):
- **M1 set** (12 files: `sfx_HitSword01, HitStick01, HitKnuckle01, hitbow01, hityoy01, HitCritical01, HitMiss01, HITPARRY01, HITBLOCK01, GenLevelUp01, GenMonSpawn01, movemark`): 54 parts (41 BILL, 3 particle, 10 custom mesh), 47 distinct textures, 1.1 MB DDS, longest 410 frames (level up).
- **M2 set** (3 Vagrant files): 23 parts, 16 textures, 347 KB.
- Whole corpus: 731 files, 4458 parts, ~1620 textures (41 MB DDS).

---

## 5. Damage numbers

- Classes: `CDamageNum` / `CDamageNumMng` (`_Common/2DRender.h:317-370`, `2DRender.cpp:1850-2071`); one global `g_DamageNumMng` (`Neuz/Neuz.cpp:57`); `Process()` in `FrameMove` (`Neuz.cpp:1084`), `Render()` in the world window (`_Interface/WndWorld.cpp:1092`) with the camera's view/projection and the viewport copied just before (`:1079-1081`).
- **Texture + glyph layout:** `Client/SFX/DmgEffect.dds` (1024x256, DXT3, with alpha), described by `Client/SFX/DmgEffect.inc`, read by `CTexturePack::LoadScript` (`2DRender.cpp:1559-1766`; loaded at `Neuz.cpp:1601`, path `MakePath(DIR_SFX, "DmgEffect.inc")` `2DRender.cpp:2004-2007`). Active block of the .inc: `number 28`, texture `"sfx\DmgEffect.dds"`, colour key 0:
  - `serialize 10 50 50 0 0 0 0` -> glyph indices 0-9 = digits 0-9, each 50x50 px, row at y=0, x = 0,50,...,450.
  - `pos 200 50 0 50`, `pos 200 50 200 50`, `pos 300 50 400 50`, `pos 250 50 700 50` -> indices 10-13 = word sprites at y=50: "MISS!" (200x50), "NICE!" (200x50), "COMBO!" (300x50), "YEAH!" (250x50).
  - `serialize 10 50 50 0 128 0 0` -> indices 14-23 = digits again at y=128; `pos` x4 at y=178 -> indices 24-27 = the same four words.
  - (`serialize` walks left to right then down in steps of the tile size, `:1731-1761`; `pos` y-down pixel coords, UV = pixel / texture size.) The earlier blocks in the .inc are inside a `/* */` comment and are not read.
- **Colours = which row.** Row 1 (y 0-100) is pink/red digits and red words; row 2 (y 128-228) is cyan/blue digits and dark-blue words (viewed the actual texture). The code picks the row with `m_nAttribute * 14`: **attribute 0 = victim is the local player (red), attribute 1 = anyone else (blue)** (`DPClient.cpp:1872,1895,2007`: `IsActiveMover() ? 0 : 1`). Attributes 4-7 (miss/good/nice/yeah word sprites) exist in `Render` (`2DRender.cpp:1976-1998`) but nothing calls them (the only call is commented out, `DPClient.cpp:1882`). There is **no separate critical style**: a crit shows the same digits plus the `XI_HIT_CRITICAL01` effect.
- **What triggers it:** `OnDamage` snapshot (`DPClient.cpp:1758-1934`): reads `attackerId, dwHit, dwAtkFlags` (+ position/angle if `AF_FLYING`). Number is shown only if the victim or the attacker is the local player (or the "show all damage" option within 30 m): `:1816-1833`. Flag logic (`:1843-1896`): BLOCKING -> hit-block sfx (then continues); PARRY -> parry sfx, **no number**; RESIST -> `dwHit == 0` ? miss sfx : number; MISS -> miss sfx, **no number**; else (normal/critical) -> crit sfx if `AF_CRITICAL` + number. Flags: `AF_MISS 0x2`, `AF_CRITICAL 0xC0`, `AF_PARRY 0x200`, `AF_RESIST 0x400`, `AF_BLOCKING 0x1000`, `AF_FLYING 0x10000000` (`_AIInterface/ActionMover.h:27-44`). Also a final number on death: `OnMoverDeath` shows the victim's **remaining HP** (`:2006-2007`).
- **Position:** world point = victim `GetPos()` at the moment of the event (not following the mover afterwards). `x` = screen x of `pos + (0,1,0)` re-projected **every draw** (`:1925-1927`); `y` = screen y of the same point captured **once** at the first tick (`:1859-1866`), so the sprite stays at its screen height if the camera moves. Not drawn when the point is behind the camera (`:1921-1922`, which also skips the frame counter).
- **Size / layout:** each glyph is drawn at `scale 0.5` (`fScale 2.0 / 4`, `:1937-1950`) = 25x25 px for the 50x50 tile, top-left anchored (tile centre = 0,0), standard alpha blend (`RenderTexture`, `:828-877`). Glyph advance is `50 * 0.5 * 0.5` = **12.5 px** (digits overlap by half); the whole string is centred on x using `25 * (1 + 0.5 (n-1)) / 2` (`:1957-1972`).
- **Motion (per tick, if drawn every tick) and lifetime** (`CDamageNum::Process`, `:1855-1910`; deleted when the counter `m_nFrame >= 100`, `:2049`; **`m_nFrame` is incremented by both `Process` and `Render`**, `:1909,2000`, so with one draw per tick the life is 50 ticks, about 0.8 s; derived by simulating the state machine):

| ticks | state | screen motion | alpha | scale |
|---|---|---|---|---|
| 1-8 | rise | up 10 px/tick (80 px total) | 255 | 0.5 |
| 9-18 | shake | y alternates +-3 px by `g_nRenderCnt & 1` | 255 | 0.5 |
| 19-34 | hold | none | 255 | 0.5 |
| 35-50 | fade | up 2 px/tick | `75 - 2*cnt` (73 -> ~45, then it is deleted, so it ends abruptly) | `(3 + 0.05*cnt)/4` (0.75 -> 0.93) |

- Several hits create independent numbers at the same place (no stacking offset).
- Cost/format: no font, no text; a web version needs only the 28 glyph rects above.

---

## 6. Other combat visuals

- **Target selection marker:** there is **no ground circle**. The selected target (focus object, `pWorld->GetObjFocus()`) gets four screen-space corner marks around its projected bounding rect (`WndWorld.cpp:3004-3025`, `RenderFocusObj` `:3079-3165`, rect from `GetBoundRect`): texture `Client/Icon/icon_target.dds` (64x64, four 32x32 cells) via `Client/Icon/icon_target.inc` (`:3511`). Cell (0,0) is the white/blue corner arrow (indices 0-3 = it flipped n/h/v/hv for the 4 corners), cell (0,32) the red one (indices 8-11); the red set is used when the player is attacking (`m_bSelectTarget || m_bAutoAttack || skill cmd`) a hostile or a player; white otherwise (`:3109-3128,3159-3162`). Corners sit at `rect.left-32 / rect.right`, `rect.top-32 / rect.bottom` (`:3096-3099`). Flying uses `icon_FlightTargetB.inc` (`:3512`). Colour key 0xffff00ff.
- **Target bar** (`CWndWorld::RenderSelectObj`, `WndWorld.cpp:2716-2934`): top-centre, x centred, y = 30 from the window top, 200 px wide (`:2760-2774`); back rect `ARGB(200,255,255,255)`, red fill `ARGB(128,255,15,15)` scaled by `HP/MaxHP` (`:2768-2784`), both `GauEmptyNormal.bmp` (`Client/Theme/Default/GauEmptyNormal.bmp`, 12x12, colour key 0xffff00ff, loaded `:3531`). Text: `"<name> <Lvl N>"` (`:2823-2870`; players show `??` if 20+ levels above you; monsters red `0xffff0000` when `m_bActiveAttack`), at `point.x + 50, point.y - 18`; level-difference arrow `LvUp.bmp / LvUp2.bmp / LvDn.bmp / LvDn2.bmp` (16x16, `Theme/Default`, `:3533-3536`, drawn `:2879-2902`; up if the monster is higher, down if 2+ lower, double above 5); element icon `icon\Icon_MonElemantkind.inc` (`:3696,2904-2912`); buff icons (`RenderMoverBuff`). Shown for non-peaceful movers or players only (`:2729`). No bar is drawn for NPCs.
- **Mouse-over highlight:** the hovered object (`CObj::m_pObjHighlight`) is drawn a second time additively (`SRCBLEND ONE, DESTBLEND ONE`) over itself (`MoverRender.cpp:558-579`), plus a cursor change (`WndWorld.cpp:2562-2626`: attack cursor over hostiles).
- **Hit flash ("spark"):** `_SPARKINFO` on the model: `color (2,2,2)`, `lerp 1.0`, direction vector (`Model.h:99`). Set on the **victim** in `CMover::OnDamage` (`MoverActEvent.cpp:1522-1540`, dir = attacker -> victim), on the **attacker** at melee/skill/magic hits (`:94-113, 650-663, 1703-1718`). While active, the model is rendered with the light direction replaced by the spark direction and the diffuse light = `lerp(0, color, lerp)` (`ModelObject.cpp:342-349,1194-1201`), i.e. a bright directional highlight. Decay: after the first tick `lerp -= 0.05` per tick until < 0 (about 20 ticks) (`Mover.cpp:3248-3262`).
- **Hit shake:** `m_nDmgCnt = 10` on every generic hit (`ActionMoverDmg.cpp:118`), `--` per tick (`Mover.cpp:3526-3527`); while > 0 a **NPC** (not `RANK_SUPER` bosses, never players) is drawn with a random XZ offset of -0.25..+0.24 m each frame (`MoverRender.cpp:286-296`).
- **Hit stop:** attacker's animation pauses: 5 ticks after a basic melee hit by a player (`MoverActEvent.cpp:1693-1701`; monsters 0), 4 ticks after a melee-skill hit (`ActionMoverState.cpp:656-658`), 5 in the in-air variant (`ActionMoverState2.cpp:591-598`). Sounds and quake attributes do not fire while paused (`ModelObject.cpp:1595,1612`).
- **Weapon spark particles** (point sprites, `CParticleMng`, `_Common/ParticleMng.cpp`): during the hit stop a player's melee hit spawns 1 particle 1 m in front of the attacker at +0.7 y with gravity (`ActionMoverState.cpp:953-1026`, only within 32 m of the local player and if SFX are on). Type from the weapon's refine level: +0..3 -> type 0 (`Sfx_ItemPatical01.dds`, size 0.3), +4..6 -> 1, +7 -> 2, +8 -> 3, +9 -> 4, +10 -> types 5-10 random (`ParticleMng.cpp:564-600`). Additive (`ONE, ONE`), fades 0.015/tick (~67 ticks), killed on ground contact (`:171-215,354-355`). Optional polish.
- **Camera quake:** `MA_QUAKE` frame attribute -> `SetQuake(15)` etc. (`ModelObject.cpp:1588-1700`, `ActionMoverState.cpp:563-569,1092-1100`); mostly big monsters and NPC footsteps.
- **Level-up caption** (`g_Caption1`) and chat line, and `MTI_LEVELUP` motion: see 3.2.
- **Damage-motion / flinch** (`SetDamagedMotion`) and the fly-back: movement, not an effect (combat research file).

---

## 7. What the web converter already has, and what is missing

Already there (`web:`):
- **Packs:** `packages/formats/src/res/res.ts` (`readResIndex`, `readResFile`, the byte cipher) and `ResPacks.ts` (name -> bytes, lower-cased keys), opened by `tools/convert/src/ClientFs.ts:7-75` for `data.res`, `dataSub1.res`, `dataSub2.res`. Everything the effects need from the packs is already readable: `mdlDyna.inc` (652 sfx entries), `propItem.txt`, `propSkill.txt`, `defineObj.h`, `defineSkill.h`, `define.h`, string tables.
- **Index:** `readModelIndex` + `modelFileName` (sfx entries come out with `modelType 4`, `name`, and `part` = sound file); `loadDefines` resolves `XI_*`, `SI_*`, `SND_*`, `MTI_*`, `II_*`, `IK3_*` (verified by running them). The `AF_*` attack flags are in no define header (they are in `_AIInterface/ActionMover.h:27-44`).
- **Items:** `readPropItem` (`packages/formats/src/inc/propItem.ts`) already tokenises every column including `dwSfxObj` .. `dwSfxObj5` and `dwSndAttack1/2` (`:67,75`) but **keeps only id/name/parts/exclusive/baseIgnore** (`:146`). The same column list reads `propSkill.txt` unchanged (I did exactly that: 190 skills read cleanly), but no stage reads it yet.
- **Textures:** `decodeImage` (dds DXT1/3/5 + 16-bit, tga, bmp; `packages/formats/src/image/`; I ran it over all of `Client/SFX/Texture`: 1976 of 1976 real DDS decode, the one failure is the misnamed sfx file), box-filter downscale, PNG -> `ktx create` (ETC1S, UASTC overrides) -> hashed `.ktx2` (`tools/convert/src/textures/convertTexture.ts`), loaded in the browser by `KTX2Loader` (`packages/scene/src/assets/loaders.ts`). Key naming `textures/<webName>.ktx2` (`convertTexture.ts:52`).
- **Models:** `.o3d` -> GLB with textures by logical key (`modelsStage.ts`, `readO3d`), loaded by `GLTFLoader`; the 52 effect meshes are `.o3d` in `Client/Model`, so they are covered by the existing models stage (their textures are in `Model/TextureMid`, also already converted).
- **Motions:** `.ani` reader exposes `frameAttributes` (MA_HIT 1 / MA_SOUND 2 / MA_QUAKE 4 per frame, `packages/formats/src/model/ani.ts:72-77,124-129`) and `motionFps`.
- **Assets index:** hashed files + `index.json` (`AssetStore.ts`), `AssetWriter`.

Missing for Piece 4's effects:
1. **No `.sfx` reader** (nothing in `packages/formats`, no sfx stage) and no web sfx format. The loader above is small (4 part types, 4 version branches) and every field is verified.
2. **SFX textures are not converted:** `TEXTURE_FOLDERS` is only `Model/TextureMid` and `World/TextureMid` (`convertTexture.ts:37-40,184-185`). `Client/SFX/Texture/` (1976 dds, 41 MB raw) needs its own folder and key namespace (e.g. `textures/sfx/`); the damage-digit sheet `Client/SFX/DmgEffect.dds`, `Client/Icon/icon_target.dds` and `Client/Theme/Default/GauEmptyNormal.bmp`/`LvUp*.bmp` are also outside it. ETC1S carries alpha; whether to threshold the alpha of the 4 banner textures like A1R5G5B5 does (2.7) is a small decision.
3. **Game data not kept:** per-item `dwSfxObj3/5`, `dwSndAttack1/2`, per-skill `dwSfxObj..5`, `dwExeTarget`, `dwUseMotion`, plus a table `XI id -> {sfx name, fScale, sound}` from mdlDyna OT_SFX; the `data/` catalogs have none of it (`WebItemModel` etc. in `web:packages/formats/src/web/gameData.ts`).
4. **Motion hit/quake/sound frames are not exported:** `frameAttributes` is read but nothing in `tools/convert/src` writes it (grep: no references; `motionGlb.ts` has no extras), so the browser does not know the hit frame of an attack or skill motion. Needed to time the hit effect and the hit stop.
5. **No effect player:** a Three.js version of 2.2-2.7 (fixed 60 Hz tick, additive quads, camera-facing/flat/normal parts, procedural cone, CPU particle pool with shared per-tick randoms, sustain loop, end-of-life rule), plus an effect manager (spawn by `XI`, follow id, 0.01/0.2 y offsets, heading `-angle`), plus the small HUD pieces (damage digits, target brackets, target bar).
6. World maps contain placed SFX objects (`OT_SFX` records in `.lnd`); `convertWorld.ts:368-379` counts them as "out of scope". The same player would render them later (not Piece 4).

---

## 8. Open questions / uncertain

1. **A1R5G5B5 quantisation:** exactly how D3DX converts DXT3 alpha to 1 bit (threshold 128?) and whether the device really used A1R5G5B5 (it may substitute a format). Only matters for 4 banner textures in M1 (crit, miss, parry, block). Not verified against a real Neuz screenshot (no side-by-side possible).
2. **Sampler mip filter / address mode for sfx draws** (`D3DSAMP_MIPFILTER` NONE vs POINT; V address): set in several world passes (`World3D.cpp:117-301`), not traced to the sfx pass. Custom-mesh U repeats need WRAP (default).
3. **Mesh parts** (128 parts, 72 files, none in the M1/M2 sets): how `Key.nAlpha` and GLOW/BLEND modify `CModelObject::Render` when `m_nNoEffect` is 0/1; whether the .o3d meshes carry object animation that `FrameMove` drives. Not needed for M1/M2.
4. **Particle emission at frame 0** (quirk 2.8): relies on the first `Process` seeing frame 1; I did not confirm whether a draw can happen at frame 0 first (it can show the frame-0 state for at most one render).
5. **Damage-number life** depends on one `Render` per `Process`; with frame skipping it can last up to 100 ticks. The table assumes one draw per tick. Whether `g_nRenderCnt` (the shake parity) increments per render or per tick was not traced.
6. **Tick rate 62.5 vs 60 Hz:** derived from integer division in `SetFST`; the real loop also runs `FrameMove` before draw each time. If the web uses exact 60 Hz effects last 4% longer than in Neuz.
7. **Level-up effect may spawn twice** for the local player (`SetExperience` + the skill-point branch of `OnSetExperience`, and `OnSetLevel` for others). Which snapshots the custom server actually sends was not checked.
8. **Sounds:** I only noted where they are named (`part` column, `dwSndAttack1/2`); the sound id -> file mapping (`defineSound.h` / `SND_*`) and `PLAYSND` were not read.
9. **`m_nSfxLevel` / `m_bSFXRenderOff`** options (hide some effects): not relevant unless the web client gets an effects setting.
10. **`nAlpha > 255`** in 12 keys wraps in the texture-factor byte (`<< 24`); not traced to which effects. Probably invisible.
11. **Monster melee hit effects:** monster "virtual weapon" rows mostly have no `dwSfxObj3`; a few bosses use hard-coded `OnAttackMelee_*` handlers (`MoverActEvent.cpp:1601-1636`) that are not in scope (Flaris to level 15).
12. **Where `AF_*` constants live for the web:** `_AIInterface/ActionMover.h:27-44` (not a define header); the web protocol/combat code will need its own copy.
13. **Skill effect for a skill used on a moving target:** `CSfxFixed` stays at the creation point (1.3 m in front of the caster), it does not track the target; confirmed from `Sfx.cpp:2086-2111` but not seen in motion.
