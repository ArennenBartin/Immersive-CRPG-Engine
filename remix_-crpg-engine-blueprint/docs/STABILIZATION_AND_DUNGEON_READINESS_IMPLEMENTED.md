# Stabilization and Dungeon Readiness — Implementation Record

Status: implemented and verified  
Plan implemented: CRPG_ENGINE_STABILIZATION_AND_DUNGEON_READINESS_v1.md  
Completion date: 2026-07-13

This is the concise change record for stabilization milestones S0–S7. The
canonical feature reference is ENGINE_SYSTEMS_REFERENCE_3D_STABILIZED.md.

## Outcome

The engine now enforces the plan’s final contract:

> A map is safe, ordinary, serializable world state. It may be painted by a
> person or proposed by a generator, but the same engine validates it, renders
> it, simulates it, saves it, and remembers what happened there.

The full release gate passes:

    npm run verify:dungeon-readiness

The readiness approach, lower floor, and upper floor each audit with zero errors
and zero warnings. Their package-wide reference audit also reports zero errors
and zero warnings. Default/QA reference audits report only runtime-created or
dynamic switch IDs as REF_SWITCH_UNDECLARED warnings.

## S0 — Safety baseline

Implemented:

- Captured the pre-stabilization state in
  docs/stabilization/BASELINE_2026-07-13.md.
- Recorded baseline commands and the already-removed state of the continent
  generator.
- Preserved package/save contract examples in deterministic test factories and
  round-trip fixtures.
- Kept the explicit QA suite separate from empty package creation.

Environment limitation:

- The supplied workspace is not a Git repository, so an in-place safety branch,
  baseline tag, or final readiness tag could not be created. The baseline
  document and deterministic fixtures are the reproducible artifacts available
  in this workspace.

## S1 — Non-destructive package operations

Implemented contracts:

- createEmptyGamePackage returns a base authoring package, not the QA suite.
- After schema parsing, ordinary normalization/import is observational and
  preserves authored content and metadata.
- Import does not refresh art, backfill blueprints/materials, rewrite elevations,
  repair start metadata, install QA content, or delete maps.
- Invalid start-map/start-spawn references are reported as warnings and are not
  silently corrected.
- QA installation is an explicit Home-screen operation.
- QA merge preserves existing IDs and reports collisions.
- QA replacement is an explicit destructive operation.
- All destructive candidates require confirmation.
- Confirmed destructive operations produce a pre-operation V2 JSON backup.
- Unconfirmed migrations are asserted to preserve every input map ID.

Common result contract:

- package
- warnings
- changes
- destructiveChanges
- applied
- requiresConfirmation
- proposedPackage
- backup and backupJson

Verification:

- Package round-trip covers 25 arbitrary authored maps.
- A V2 export/import/re-export is stable.
- Invalid start-map and start-spawn metadata remains authored rather than being
  silently repaired.
- Destructive QA replacement is rejected without confirmation and backed up when
  confirmed.

Primary files:

- src/store/engineStore.ts
- src/store/packageMigration.ts
- src/schema/game.ts
- src/data/qaSuiteInstaller.ts
- scripts/test-package-roundtrip.ts

## S2 — Continent retirement and strict type gate

Implemented contracts:

- The user-removed procedural-continent/procedural-region source is absent from
  active code.
- Its panel, AppShell mode, package settings, tests, and aggregate scripts are
  absent.
- archive/procedural-continent-2026-07/README.md marks the retirement boundary.
- The legacy-import audit rejects active imports of removed paths and guards
  against their return.
- GameRenderer2D, Tile Maker, and Command Wheel are marked and treated as legacy.
- New engine work is documented as 3D-only.

Build contract:

    typecheck -> client build -> server build

The build script can no longer bundle around TypeScript failures. The release
gate separately runs both typecheck and lint before the strict build.

Authored overworld maps/assets remain supported content and are not treated as
the removed generator.

Primary files:

- archive/procedural-continent-2026-07/README.md
- scripts/audit-legacy-imports.ts
- package.json

## S3 — Ordinary map contract, deterministic identity, and references

Implemented contracts:

- Authored and generated output share one MapData schema and runtime.
- Generated output crosses the pure buildMap boundary.
- Generated maps require stable IDs for all persistent placements and records.
- Generated IDs are namespaced under dg:<normalized-map-id>:.
- Deterministic ID streams isolate topology from optional decoration.
- Semantic IDs are idempotent and reserved collisions are rejected.
- Collections are canonically ordered before hashing.
- Stable JSON and FNV-1a 64-bit hashing define the output hash.
- Map-output hashing excludes generation provenance itself.

Generation metadata:

- generatorId and generatorVersion
- recipeId and recipeVersion
- seed
- outputHash
- generatedAt
- manuallyModified
- optional sourceSnapshotHash

Regeneration and editing:

- The baked ordinary map is authoritative.
- Generator versions never trigger regeneration during load.
- Automatic regeneration is allowed only for generated, unmodified maps.
- An edit marks generation metadata manuallyModified.
- Generated-map duplication remaps its namespace and local self-references.

Reference integrity:

- The package audit checks duplicate IDs, cross-collection references, start
  metadata, map cells/bounds, exits/spawns, schedules, keys, generated ownership,
  recipe provenance, archived system keys, and unsupported cutscenes.
- Issues have stable codes, exact paths, and severities.

Generation diagnostics:

- crpg_generation_diagnostics_v1 records recipe snapshot, seed, RNG streams,
  abstract graph, spatial layout, validation report, baked map, timing, retry
  count, deterministic attempt ID, and output hash.
- Diagnostics reject stale output hashes and serialize canonically.
- The artifact is for replay/debugging; it is not an alternate map or save
  authority.

Primary files:

- src/generation-facing/mapContract.ts
- src/generation-facing/deterministicIds.ts
- src/generation-facing/stableHash.ts
- src/generation-facing/referenceAudit.ts
- src/generation-facing/generationDiagnostics.ts
- scripts/test-map-contract.ts
- scripts/audit-references.ts

## S4 — Ordinary-map validator and budgets

Implemented contracts:

- validateOrdinaryMap is pure and has no React, Zustand, or generator dependency.
- It accepts the same ordinary MapData used by Studio and Play.
- Results include validity, stable issues, metrics, reachable regions, and
  progression analysis.

Validation coverage:

- schema and structural integrity
- dimensions, finite values, bounds, coordinates, and duplicate IDs
- start footprints and flood-fill reachability
- object/entity/item/container references and footprints
- schedules and interactable clearance
- exits, required cells, regions, and return routes
- elevation connectors and stair landings
- key-before-lock progression for doors and containers
- safe starts, hazards, lethal routes, and key risk
- generation-facing performance budgets

Default budgets:

| Metric | Soft | Hard |
| --- | ---: | ---: |
| Macro cells | 20,000 | 65,536 |
| Fine cells | 180,000 | 589,824 |
| Rooms | 24 | 40 |
| Entities | 80 | 160 |
| Objects | 600 | 1,200 |
| Chemistry seed cells | 250 | 1,000 |
| Triggers plus exits | 100 | 250 |
| Animated-GIF actors | 12 | 24 |
| Serialized map bytes | 2 MiB | 8 MiB |

Verification:

- The valid fixture is accepted.
- Deliberate structural, reachability, placement, elevation, progression,
  hazard, and budget failures return their expected stable issue codes.
- The map-validator audit uses the same fixture contract.

Primary files:

- src/engine-core/mapReadinessValidator.ts
- scripts/test-map-validator.ts
- scripts/audit-map-validator.ts

## S5 — Honest Studio/runtime support and encounter placement

Implemented trigger contract:

- step, interact, on_load, and switch_change all dispatch through the same
  runtime path.
- switch_change fires on a false-to-true eligibility edge.
- Ungated switch-change triggers watch meaningful story changes.
- Internal trigger-run flags are ignored.
- Trigger runs queue behind active cutscenes and honor once.

Implemented authoring/runtime alignment:

- Skill damage, heal, and status payloads are supported.
- Summon payloads are disabled and rejected.
- Status payload authoring matches runtime status support.
- Item stat/resource effects are supported; item damage is disabled.
- Supported cutscene actions have one explicit allowlist.
- start_combat and custom cutscene actions are disabled and rejected.
- Runtime stops/logs unsupported cutscene data rather than silently skipping it.
- Studio import and export both enforce the support contract.
- The placeholder Encounter Editor mode was removed.

Minimal encounter contract:

- Encounter definitions resolve deterministically into ordinary entity
  placements.
- Resolution checks area, difficulty, references, cells, reachability,
  collision, hazards, cover, elevation, room, line of sight, capacity, and role
  rules.
- Frontline, ranged, support, ambush, and patrol roles affect placement scoring.
- Supported NPC patrols become ordinary schedules.
- Normal behavior and combat systems own actors after placement.
- Reinforcement data is validated but timed waves are explicitly deferred.

Primary files:

- src/engine-core/story.ts
- src/engine-core/studioRuntimeSupport.ts
- src/generation-facing/encounterContract.ts
- scripts/test-studio-runtime-support.ts
- scripts/test-encounter-contract.ts
- scripts/audit-studio-runtime-support.ts

## S6 — Readiness dungeon and persistence proof

Implemented fixture:

- One approach map and a two-floor dungeon using ordinary MapData.
- Fourteen room IDs across the two dungeon floors.
- A critical path, loop, and optional branch.
- A key, locked door, locked cache, stairs, exits, dialogue, Attend interaction,
  a document, switch-change/step/interact triggers, combat, chemistry, pushable
  and breakable objects.

Locked-door runtime and persistence:

- Opening without the required key is rejected.
- A valid key unlocks and opens the placement.
- consumeKey removes the key only when authored.
- door_unlocked and door_opened events are emitted in order.
- unlocked_doors and opened_doors persist by stable placement ID.

Headless journey:

1. Enter the approach and dungeon.
2. Run dialogue, story switches, switch-change trigger, and Attend.
3. Reject locked access before the key.
4. Take the key, unlock/open the door, and preserve both states.
5. Push an object and preserve its origin delta.
6. Run triggers, read the document, and loot the locked cache.
7. Resolve combat and preserve entity state.
8. Transition to the upper floor and break an object.
9. Change chemistry and drop an item.
10. Return, exit, re-enter, and preserve map state.
11. Progress the quest.
12. Serialize/deserialize V2 package, save, and explicit save-slot payloads.

The test also covers chemistry, entity/party state, map deltas, inventory layout,
containers, fog/exploration, story, Alder/emotional state, simulation state,
combat, generated provenance, manual edits, generator-version independence, and
fine-grid materialization.

Primary files:

- scripts/fixtures/readinessDungeonFixture.ts
- scripts/test-save-roundtrip.ts
- src/schema/save.ts
- src/engine-core/v1Runtime.ts

## S7 — Contract freeze and release gate

Implemented:

- Replaced the outdated engine reference with a pointer to the canonical
  stabilized reference.
- Added docs/ENGINE_SYSTEMS_REFERENCE_3D_STABILIZED.md.
- Added this milestone and verification record.
- Recorded removed, legacy, import-only, disabled, and deferred support states.
- Added a generic release command and a descriptive dungeon-readiness alias.

Release command:

    npm run verify

Alias target:

    npm run verify:dungeon-readiness

It runs:

- strict typecheck
- lint
- type-first client/server build
- all retained and new tests
- all aggregate audits
- fog/LOS profile
- save-size profile

Result on 2026-07-13: pass end to end. The Vite build retains a non-fatal
large-chunk advisory.

The workspace cannot receive the plan’s requested Git readiness tag because it
is not a Git repository. This limitation does not weaken the runtime, data, or
test contracts, but a repository owner should tag the imported commit after
placing these changes under version control.

## Acceptance checklist

### Safety

- [x] Import cannot erase authored maps.
- [x] QA suite installation is explicit.
- [x] Destructive migrations require confirmation and backup.
- [x] Regeneration cannot overwrite manually edited maps.

### Architecture

- [x] Continent generator is absent from active code.
- [x] New engine work uses the 3D renderer.
- [x] Generated and authored maps share one schema/runtime path.
- [x] Generation metadata is optional and stable.

### Correctness

- [x] Typecheck passes.
- [x] Lint passes.
- [x] Client and server builds pass.
- [x] Retained tests and audits pass.
- [x] Reference audit passes its readiness fixture.
- [x] Validator accepts its valid fixture and rejects deliberate failures with
  stable codes.

### Persistence

- [x] Package export/import round trip passes.
- [x] Multi-floor map state survives save/load.
- [x] Save loading never reruns generation.
- [x] Generation metadata survives import/export.
- [x] Door unlock/open and optional key consumption persist.

### Authoring honesty

- [x] Unsupported actions and payloads are rejected.
- [x] Status authoring matches runtime.
- [x] Encounter Editor placeholder is absent.
- [x] Legacy discovery paths are isolated and audited.

### Readiness proof

- [x] The complete hand-authored dungeon journey passes headlessly.
- [x] The same placeholder seed produces the same map hash.
- [x] Placeholder output is ordinary Studio/Play-compatible MapData.
- [x] verify:dungeon-readiness passes.

## Commands and coverage

| Command | Contract |
| --- | --- |
| npm run test:package-roundtrip | Safe arbitrary-package import/export and destructive-operation safeguards |
| npm run test:map-contract | Builder, IDs, provenance, hashing, edits, duplication, and diagnostics |
| npm run test:map-validator | Valid and deliberate-failure dungeon fixtures |
| npm run test:save-roundtrip | Complete readiness journey and persisted state |
| npm run test:studio-runtime-support | Authoring/runtime support allowlist |
| npm run test:encounter-contract | Deterministic ordinary entity placement |
| npm run audit:references | Package-wide stable reference issues |
| npm run audit:map-validator | Validator fixture at audit boundary |
| npm run audit:legacy-imports | Removed and legacy discovery paths |
| npm run audit:studio-runtime-support | Unsupported authored data |
| npm run verify | Generic full release gate |
| npm run verify:dungeon-readiness | Descriptive full release gate and verify alias target |

## Deferred backlog

The following work is intentionally outside this stabilization gate:

- production dungeon geometry generation and recipe library
- visual dungeon-generator authoring UI
- runtime infinite-dungeon generation
- procedural quests or generated narrative
- continent or settlement generation
- complete equipment/equipment-slot gameplay
- summon skill payload execution
- damaging consumables
- cloud saves and account systems
- multi-user Studio collaboration
- universal migration to the object/Parts kernel
- full regional LOD exposure in Play
- reaction-rule authoring UI
- polished encounter authoring and timed reinforcement waves
- full PlayMode decomposition
- complete animated-asset optimization
- complete door-lock editor workflow
- complete active hack and mimic loops

No production generator geometry was started during stabilization. Future
generation work must use buildMap, deterministic IDs, generation provenance,
generation diagnostics, the package reference audit, validateOrdinaryMap, and
the readiness gate. It must not restore the retired continent contract.
