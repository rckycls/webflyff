# Ground item rendering (piece6, 2026-11-02)

## Native evidence

Read-only references are in `../../Blouflash VS22 V15/`, the available customized v15 client/source distribution. These establish its behavior directly; they are not a claim that every private-server v15 distribution is identical.

| Reference | Finding |
| --- | --- |
| `Source/_Common/ModelMng.cpp:37-45,63-95` | OT_ITEM uses `item_<entry name>.o3d`. Missing entries substitute II_ARM_M_VAG_HELMET02 (500). |
| `Resource/mdlDyna.inc:945` | Item entries specify ground models; `part` specifies the separate worn body model. Armor entries use GenMatSuitbox. Gold uses GolGolSeed1 through GolGolSeed4. |
| `Resource/propItem.txt` | Item properties supply names/icons and gameplay properties; inventory icons are not the world models. |
| `Source/Neuz/DPClient.cpp:1412-1452` | At ADD_OBJ, sample GetItemHeight from received y + 1.5. Landing height is surface + abs(model height)/2 + 0.12. Only if abs(landing height - received y) < 1, start at received y + 1.5 with vertical velocity 0.15. Otherwise retain received position. |
| `Source/_Common/WorldIntersect.cpp:323-352` | GetItemHeight uses a 3-unit downward segment, highest static object intersection, else terrain height. |
| `Source/_Common/Model.h:194` | Model height is bbMax.y - bbMin.y. Packet scale is not included in this height calculation. |
| `Source/_Common/Item.cpp:515-550` | Each 60 Hz tick adds 0.5 degrees, subtracts 0.0075 from vertical velocity above the floor, then applies velocity. Clamp on the following tick and stop; no periodic bob or bounce. |
| `Source/_Common/Item.cpp:558-571` | Draw the world model; nReflect > 0 requests XE_REFLECT; each render has a 1/50 chance of XI_GEN_ITEM_SHINE01. |
| `Source/_Common/Obj.cpp:128-132`, `ObjSerialize.cpp`, `Resource/defineObj.h:154` | Use object angle/scale from serialization, reflected to web coordinates; shine effect ID is 64. |

## Implementation

`WebItemProp.dropModel` is separate from the held `model`, so armor boxes are available without changing equipment. Conversion resolves missing mdlDyna entries through item 500 and only names converted assets. Existing catalogs fall back to their held model, or the generic suit box; rebuilding data provides the full ground mapping.

`GroundModels` loads textured lod0 models using shared asset services. It owns only visual state, uses the world collision helpers for surface sampling, and ages rotation/throw using the existing simulation tick counter. No packet position, item count, pickup packet, pickup range, or movement destination is changed. Scene nodes and textures/geometries/materials are released on deletion and disposal; downloads completing afterward are released too. Missing assets leave the inventory-icon fallback and accessible pickup button available.

Display scale is serialized scale times 1 on desktop and 0.5 when `(max-width: 1000px) and (pointer: coarse)` matches, matching the HUD's compact-touch definition. It is reevaluated each frame, including rotation/resizing. This does not reduce the 32px pickup target or alter the native throw path. The target tracks the displayed model. Shine uses the existing effect manager and source position.

Rendering uses lod0, the existing web lighting, and the model's embedded TM/bone animation clips looped with the scene's native-loop helper. Rig nodes remain attached. Positive `nReflect` is retained from propItem and applies `etc_reflect.tga` through the native camera-normal UV transform and ADDSIGNED2X blend, implemented in the web material shader. The texture is ref-counted with the item's other textures. This adapts the native reflection pass to web lighting; it does not promise pixel-identical D3D lighting or native distance LOD selection. Missing converted models retain the icon fallback.

## Verification

- Converter regression checked failing before implementation, then passing: ground model survives armor's worn-part entry while the held model stays null.
- Unit tests cover box selection, reflection catalog data, animation time, throw/settle, rotation, mobile/desktop scaling, authoritative state preservation, high-position spawn condition, and deletion/disposal during pending downloads.
- Full suite: 144 files passed; 2,963 tests passed, 8 skipped.
- Typecheck passed. Client production build passed with Vite's >1000 kB chunk warning. No lint script is defined; `git diff --check` passed.
- Real client data conversion: 13 outputs, 82 warnings, zero failures. Outputs stay in piece6/dist/assets. Warnings concern incomplete existing converted assets/catalog references; see dist/assets/report.json.
- Focused browser drop tests passed on desktop Chromium and Pixel 7 landscape: real textured GLB loading, hiding the fallback icon, pickup packet and DEL_OBJ cleanup. The reflection path is explicitly exercised and checked for shader compilation errors. Default port 5174 was occupied; tests use a temporary config on 5194 and a browser installed inside piece6.
- The broader existing inventory/item flow failed before reaching drop pickup: desktop could not find `.inventory-preview canvas`; its phone run was interrupted after stalling. These are not reported as passes. The focused test avoids inventory preview and verifies the requested drop behavior directly.

## Changed files (relative to piece6)

- `apps/client/src/world/items/groundModels.ts`: model loading, animation, reflection, native throw, scene and asset lifetime.
- `apps/client/src/world/items/groundItems.ts`: model integration, viewport scale choice, anchored pickup targets and icon fallback.
- `apps/client/src/world/WorldScreen.ts`: asset/ground/effect wiring and simulation tick source.
- `apps/client/src/style.css`: hide the icon once the model is loaded.
- `packages/formats/src/inc/propItem.ts`: retain nReflect.
- `packages/formats/src/web/gameData.ts`: optional dropModel and reflect catalog fields.
- `tools/convert/src/data/gameDataStage.ts`: ground-model resolution and reflection catalog output.
- `tools/convert/test/gameDataStage.test.ts`: armor/weapon ground mapping and reflection regressions.
- `apps/client/test/groundModels.test.ts`: visual state, scale, animation timing, and asset lifetime checks.
- `apps/client/e2e/items.spec.ts`: real desktop/phone model loading, reflection shader, pickup and deletion checks.
- `docs/research/2026-11-02-ground-item-models.md`: this report.

The generated catalogs/build and browser screenshots are ignored artifacts within piece6. Temporary `.playwright-drops/` and `apps/client/playwright.drops.config.ts` remain because automatic approval review rejected their cleanup with “blocked by policy.” No files in another worktree or the native source/client were edited.
