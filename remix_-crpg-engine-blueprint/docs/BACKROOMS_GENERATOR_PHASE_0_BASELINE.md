# Backrooms Generator — Phase 0 Baseline

Status: **complete**. No generator code exists yet, and none was added.

This document records the contracts a future `src/backroomsGen/` pipeline must
build on, as read from current source rather than from older prose. Where the
implementation plan and the source disagree, the source wins and the
disagreement is recorded in [§7](#7-where-the-plan-and-the-source-disagree).

---

## 1. What Phase 0 delivered

| Deliverable | Result |
| --- | --- |
| Contract audit | This document |
| Level 0 QA map | **Already existed** — `qa_backrooms_level_zero`, no new map authored |
| Baseline fixture test | `scripts/test-backrooms-baseline.ts`, wired as `npm run test:backrooms-baseline` |
| Baseline repair | One pre-existing failure fixed in `src/schema/v2.ts` (see [§6](#6-baseline-command-results)) |
| Generator code | **None**, as required |

---

## 2. Exact file map

### Map / object / placement contracts

| Concern | File | Notes |
| --- | --- | --- |
| Map schema | `src/schema/game.ts:1256` | `MapDataSchema` — the runtime boundary |
| Cell schema | `src/schema/game.ts:493` | `CellSchema` |
| Fine overrides | `src/schema/game.ts:521` | `FineCellOverrideSchema` |
| **Placement schema** | `src/schema/game.ts:530` | `ObjectPlacementSchema` — see [§4](#4-per-placement-transform-contract) |
| Object schema | `src/schema/game.ts:1504` | `ObjectSchema`, incl. `collision.profile` |
| Object asset schema | `src/schema/game.ts:1351` | `ObjectAssetSchema` — **owns `rotation` and `scale`** |
| Generation provenance | `src/schema/game.ts:1212` | `MapGenerationMetadataSchema` |
| Generation sockets | `src/schema/game.ts:1236` | `MapGenerationSocketSchema` |
| Save schema / v2 | `src/schema/save.ts`, `src/schema/v2.ts` | |
| Level 0 presets | `src/schema/presets.ts:41-45` | floor / wall / light object IDs + materials |

### Generation infrastructure to reuse

| Concern | File |
| --- | --- |
| Entry point | `src/dungeonGen/generateDungeon.ts` |
| Deterministic seeds | `src/dungeonGen/seedContext.ts` |
| Canonical hashing | `src/dungeonGen/canonical.ts` |
| Topology | `src/dungeonGen/topology/` |
| Templates | `src/dungeonGen/templates/` |
| Embedding / occupancy | `src/dungeonGen/embedding/` |
| Population | `src/dungeonGen/population/` |
| Map bake | `src/dungeonGen/bake/` |
| Guarded package bake | `src/dungeonGen/packageBake.ts` |
| Quality report | `src/dungeonGen/quality.ts` |
| Only preset today | `src/dungeonGen/presets/institutionalRuin.ts` |

### Runtime / rendering

| Concern | File |
| --- | --- |
| Placement → world transform | `src/components/GameRenderer3D.tsx:5134-5166` |
| Collision boundary | `src/utils/objectFootprint.ts:141` (`placementHasCollision`) |
| Kernel collision | `src/engine-core/kernel.ts:415` |
| Fine-grid expansion | `src/engine-core/fineWorld.ts` |
| Grid constants | `src/engine-core/gridCoordinates.ts:23` (`FINE_PER_MACRO = 3`) |
| First-person controls | `src/utils/firstPersonControls.ts` |
| Large-map windowing | `src/engine-core/runtimeMapGrid.ts` |

### Studio surface (pattern to mirror)

`src/components/dungeon/` — `DungeonRecipeEditor.tsx`, `DungeonFloorPlan.tsx`,
`DungeonGraphView.tsx`, `DungeonPreview3D.tsx`, `DungeonAuditPanel.tsx`,
`DungeonBakeDialog.tsx`, plus the worker trio
(`dungeonGenerator.worker.ts`, `dungeonGeneratorWorkerCore.ts`,
`dungeonGeneratorWorkerProtocol.ts`).

### Existing Backrooms content

| Item | File |
| --- | --- |
| Level 0 QA map | `src/data/qaSuite/backroomsWing.ts` |
| Parasite entity | `src/data/backroomsEntityAssets.ts` |
| Theme | `src/utils/backroomsTheme.ts` |
| Floor/wall/light objects + materials | `src/schema/presets.ts` |
| Bundled-package refresh hook | `src/store/engineStore.ts:1751` |

---

## 3. The Level 0 QA map as it exists today

`qa_backrooms_level_zero` (`src/data/qaSuite/backroomsWing.ts`), registered
through `src/data/testingMapSuite.ts` and reachable from `src/data/qaSuite/hub.ts`.

- 33×33 macro cells, `MAP_MIN = -16` … `MAP_MAX = 16`.
- Four divider lines at `-10, -3, 4, 11` produce a 5×5 zone lattice.
- Every connecting opening is **three macro cells wide**, so no fine-grid
  corridor depends on a single-cell squeeze.
- `ambient_light: 0.05`, `combat_mode: "horror_realtime"`, no `environment`
  key — i.e. it renders as an enclosed interior with a derived ceiling.
- Spawn `spawn_backrooms_entry` at `[0, 14]` facing `[1, 0]`.
- Ceiling fluorescents are placed at zone centers with `collision_mode: "none"`.
- `exits: []` — deliberately no diegetic route into the QA suite.
- One hostile: `BACKROOMS_PARASITE_ENTITY` at `[7, 13]`.

It is **ordinary `MapData`** and carries **no** `generation` metadata, which is
what makes it a valid Phase 0 reference: it proves the target output shape is
reachable without a parallel runtime map type.

Its header comment describes it as authored for **third-person** play, and
`GameRenderer3D.tsx:8251` has a third-person-specific branch keyed to this map.
That is the intended Backrooms play mode; **first person is out of scope for this
generator** and the Phase 0 fixture does not assert it.

---

## 4. Per-placement transform contract

This is the most important section for Phase 2. `ObjectPlacementSchema`
(`src/schema/game.ts:530`) supports:

| Field | Type | Granularity |
| --- | --- | --- |
| `cell` | `[number, number]` | macro cell |
| `facing` | `[number, number]` | **continuous** — yaw is `Math.atan2(facing[0], facing[1])` |
| `fine_offset` | `[int, int]` | **quantized to 1/3 macro cell** |
| `height_offset` | `number` | **continuous** |
| `collision_mode` | `"inherit" \| "none"` | per placement |
| `id`, `stack_index`, `stack_root_key`, `blueprint_id`, `dialogue_id`, `locked`, `key_item_id`, `consume_key` | | |

### What this means for the anomaly system

**Arbitrary yaw already works.** The renderer computes
`rotationY = Math.atan2(facing[0], facing[1])`, so writing
`facing: [sin θ, cos θ]` expresses any angle. A chain rotating 1.5° per copy
needs no schema change. The plan treated this as unproven; it is proven.

**Vertical embedding already works.** `height_offset` is continuous, so
`floor_sink` and `ceiling_intrusion` anomalies are expressible today.

**Non-blocking decor already works.** `collision_mode: "none"` is a per-placement
opt-out, so the *same* object can be solid in one room and non-blocking where it
is embedded. `placementHasCollision` (`src/utils/objectFootprint.ts:141`) is the
single shared boundary enforcing this, which is exactly what prevents a buried
mesh from becoming an invisible collider.

**Per-placement scale does not exist.** Scale lives on `ObjectAssetSchema.scale`
— the *shared object definition* — so every placement of an object renders at
the same size. Horizontal sub-cell offset is likewise limited to 1/3-cell steps.
See [§7](#7-where-the-plan-and-the-source-disagree).

---

## 5. Determinism contract

`src/dungeonGen/seedContext.ts` provides `DungeonSeedContext`, whose `stream(stage)`
returns a fresh per-stage RNG salted by `stageSalts[stage]`, so one stage's extra
draw cannot perturb another. That is the property the Backrooms plan wants.

However `DUNGEON_RNG_STREAMS` is a **locked 13-entry list** typed as
`DungeonStageId`:

```
topology, archetypes, gates, floor_partition, room_shapes, embedding,
corridors, infrastructure, encounters, hazards, rewards, dressing, secrets
```

The Backrooms plan proposes a different 9-stage set (`sectors`, `anchors`,
`recurrence`, `anomalies`, `transitions`, …). These are incompatible unions, so
Backrooms needs its **own** stage list and seed context. This independently
confirms the plan's "separate generator, do not branch `generateDungeon`"
decision — Phase 3 should not try to widen `DungeonStageId`.

---

## 6. Baseline command results

Run at Phase 0 on branch `codex/first-person-xray-fix`, Node **v26.3.0**.

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:map-validator` | pass |
| `npm run test:package-roundtrip` | pass — 25 authored maps, 16 QA maps |
| `npm run test:save-roundtrip` | **failed, then fixed — see below** |
| `npm run test:studio-play` | pass |
| `npm run test:first-person` | pass |
| `npm run test:dungeon` | pass |
| `npm run test:dungeon-quality` | pass — incl. 32-seed corpus |
| `npm run test:suite` | pass — 141 checks |
| `npm run build` | pass |
| `npm run test:backrooms-baseline` | pass (new) |

Every script name the plan's verification gate lists exists in `package.json`
under exactly that name. No aliases needed remapping.

### The pre-existing save-roundtrip failure

`npm run test:save-roundtrip` failed on a clean tree before any Phase 0 change:

```
actual:   { cell: [-14, 1], facing: [-1, 0], fine_position: undefined }
expected: { cell: [-14, 1], facing: [-1, 0] }
```

`cloneSaveV1` and `buildSaveRuntimeV2` in `src/schema/v2.ts` wrote
`fine_position: undefined` explicitly when a save had no free-movement position.
That creates an *own key holding undefined*, which `JSON.stringify` drops — so
the clone did not equal its own serialized form. Node 26 tightened
`assert.deepEqual` to distinguish an own-undefined key from an absent one, which
is why this surfaced now rather than earlier.

Fixed by conditional spread, so an absent position stays absent. This is a
correctness fix to the save layer, not generator work, and it was required
because Phase 0's acceptance criterion is a green baseline.

### Caveat on "launches in play mode"

The fixture verifies third-person *launch preconditions* statically: authored
view-mode resolution, camera activation, free-movement activation in both
exploration and horror-realtime combat, spawn presence, spawn facing on the
8-direction grid ring, continuous camera yaw resolution, and every fine cell
under the player's 3×3 footprint at the spawn being walkable. There is no
headless harness in this repo that boots an actual third-person camera, so this
is a static check, not a runtime launch. An in-browser walkthrough remains a
manual step.

---

## 7. Where the plan and the source disagree

### 7.1 Per-placement scale is not expressible — blocks Phase 2 as written

The plan's Phase 2 and its "recommended first real proof" both require a
six-desk chain where **each copy is `0.84×` the previous scale**. Placements
carry no scale field; scale is a property of the shared object definition. As
written, that proof cannot be built.

Three options, in the order I'd recommend them:

1. **Add an optional per-placement `scale`** to `ObjectPlacementSchema`
   (`.optional()`, so old packages and saves round-trip unchanged), and read it
   in `GameRenderer3D`'s placement transform. Smallest change that makes the
   whole anomaly class work, and it also unlocks class D (scale/proportion
   errors), which is otherwise equally blocked.
2. **Emit one object definition per chain step.** No schema change, but it
   inflates the object library by every distinct scale and makes recurrence
   motifs expensive.
3. **Drop non-uniform scaling from v1** and build recursive chains from rotation
   and spacing alone. Cheapest, but noticeably weaker as an effect.

This is a decision for Phase 2 and needs an explicit call before that phase
starts, since option 1 touches a schema the plan's global constraints tell us to
treat carefully.

### 7.2 The 40% wall embed is not exactly expressible horizontally

`fine_offset` is integer fine cells — 1/3 of a macro cell — so horizontal
penetration quantizes to 0%, 33%, 67%. A literal 40% embed needs either the
per-placement offset to become continuous, or the penetration to be baked into a
cluster GLB (which the plan already contemplates in §8 for exactly this reason).
Vertical embedding has no such limit; `height_offset` is continuous.

Recommendation: for Phase 2, either state the target as "one fine cell ≈ 33%" or
bake the clipped cabinet as a wall+cabinet cluster GLB.

### 7.3 The Level 0 QA map already exists

Phase 0's work order says to *create* one. `qa_backrooms_level_zero` already
ships in the QA suite and satisfies the requirement, so Phase 0 audited and
pinned it instead of authoring a duplicate.

### 7.4 The play mode is third person, and it is free-movement

The plan's Phase 1 and Phase 0 acceptance criteria are written against
first-person traversal. **The Backrooms game mode is third person.** First person
is explicitly out of scope; read every "first-person traversal" criterion in the
plan as third-person.

What that changes, from `src/utils/thirdPersonControls.ts` and
`src/utils/thirdPersonCamera.ts`:

- `view_mode: "third_person"` is a **package-level** setting resolved by the
  shared `resolveAuthoredViewMode`.
- Movement is **continuous free movement**, not grid stepping
  (`isThirdPersonFreeMovementActive`). It stays active during combat only while
  the map is `horror_realtime` — which Level 0 authors, so an encounter never
  drops the player back to tactical stepping.
- Camera yaw is **continuous** (`facingToThirdPersonYaw` follows the exact
  heading). The 8-direction ring still governs *grid* identity — saves,
  perception cones, model facing — via `quantizeYawToFacing`, so the camera and
  the grid intentionally disagree in resolution.
- Three camera profiles matter for generated geometry:
  `open` (boom 3.65m, 58° fov), `corridor` (boom 2.3m, 62° fov), and
  `wall_backed` (boom 0.15m). **The camera tucks in as space narrows**, which
  means corridor width is a camera-framing decision in this mode, not only a
  navigation one. Generated Backrooms corridors should be sized deliberately
  against these three profiles rather than tuned only for pathing.

The existing `npm run test:first-person` stays in the verification gate — it
guards a shipped mode this work must not break — but no Backrooms acceptance
criterion depends on it.

### 7.5 Minor: the Blender manifest carries a stale reference path

`public/models/environment/lonely-street-basement/manifest.json` has
`"reference"` pointing at a `/var/folders/.../codex-clipboard-*.png` temp file
that no longer exists. Harmless today, but the anomaly kit's build script should
not copy that pattern.

---

## 8. Blender pipeline contract (for Phase 7)

Verified against `lonely-street-basement`, which is the most complete example.

- Sources in `assets/blender/<kit>/`, exports in
  `public/models/environment/<kit>/`.
- Build and validate scripts in `tools/blender/` — `build_*.py` and
  `validate_*_exports.py`.
- Per kit: modular `.glb` per asset, one `*-staged.glb` review scene, one
  `*-preview.png`, `manifest.json`, `export-validation.json`.
- `manifest.json` keys: `kit_id`, `version`, `units` (`"meters"`),
  `grid_snap_m` (`0.5`), `reference`, `assets[]`, `staged_scene`, `validation`,
  `collision_policy`.
- Each `assets[]` entry: `id`, `filename`, `url`, `category`,
  `scene_location_blender`, `scene_cell_engine`, `triangles`, `mesh_count`,
  `materials[]`, `bounds`, `bytes`.
- `validation` records `status`, counts, `triangle_budget` (75,000 for the
  basement), and empty-on-pass lists for default names, unapplied scale, and
  invalid mesh/material names.
- `collision_policy` is currently **free text**, not structured. The anomaly kit
  will want a machine-readable policy per asset, since Phase 7 acceptance
  depends on asserting collision behavior automatically.

---

## 9. What Phase 1 inherits

- A green baseline across the full verification gate.
- `npm run test:backrooms-baseline` guarding the four contracts above.
- Confirmed reusable infrastructure: seed context, embedding/occupancy, worker
  protocol, guarded package bake, quality report, ordinary `MapData` output.
- One open decision: **per-placement scale** ([§7.1](#71-per-placement-scale-is-not-expressible--blocks-phase-2-as-written)).

Phase 1 adds a disposable `level0_proof` preset alongside
`src/dungeonGen/presets/institutionalRuin.ts` and must not alter it.
