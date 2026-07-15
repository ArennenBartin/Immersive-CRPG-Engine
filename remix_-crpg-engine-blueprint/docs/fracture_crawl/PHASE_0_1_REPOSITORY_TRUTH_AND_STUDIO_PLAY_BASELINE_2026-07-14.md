# Fracture Crawl — Batch 1 Repository Truth and Studio/Play Baseline

**Batch:** 1  
**Build-plan phases:** Phase 0 — Repository Truth and Safety Baseline; Phase 1 — Studio/Play Contract and Editor Diagnostics  
**Date:** 2026-07-14  
**Runtime acceptance environment:** Browser  
**Product boundary:** One browser application with distinct Studio and Play modes  
**Authority:** `08_ALDERAMONTICO_FRACTURE_CRAWL_CODEX_ENGINE_BUILD_PLAN_V1.md`, the canonical Fracture Crawl GDD, and current executable source  
**Report status:** Implementation, full automated verification, and a non-destructive browser smoke test passed; user acceptance remains the handoff gate

This report is the Phase 0 machine-readable Markdown baseline required by the
canonical engine build plan and the Phase 1 acceptance handoff. Source code,
schemas, tests, and audits are authoritative if they disagree with this report.

## 1. Batch outcome

Batch 1 establishes a safe base for the remaining Fracture Crawl phases:

- Studio and Play are active modes inside one React application.
- The authored `GamePackage` and runtime `PlaySave` have separate Zustand
  stores and explicit keep/discard behavior.
- A selected Studio map can be launched directly in Play without writing
  runtime deltas back into the authored map.
- Studio exposes project-wide reference and ordinary-map validation with stable
  codes, severities, paths, map links, cells, and suggested fixes.
- Ordinary package import is observational after schema parsing and cannot
  silently inject the QA suite or refresh a QA-shaped authored workspace.
- Successful project import and explicit QA replacement discard the previous
  project's active runtime state.
- The IndexedDB hydration path blocks authoring until storage is resolved,
  protects a newer in-memory edit from a stale read, and falls back to the
  previous v2 database namespace.
- Package round-trip, repeated import, duplicate-ID diagnostics, and the
  Studio/Play authored-runtime boundary have focused automated coverage.
- The already implemented dungeon workspace remains available as a normal
  Studio mode; its committed output is ordinary editable `MapData`.

This does **not** claim that later Fracture Crawl systems are complete. In
particular, authoritative darkness/perception, sensory profiles, campaign state
layers, Intercessor succession, ghosts, artifact lifecycle, and Glass expedition
rules remain later-phase work.

## 2. Repository truth

### 2.1 Application and server entry points

| Layer | Active entry point | Responsibility |
| --- | --- | --- |
| Browser document | `index.html` | Mounts `#root` and loads `/src/main.tsx`. |
| React boot | `src/main.tsx` | Installs the asset base, enables React strict mode, and mounts `App`. |
| Application boundary | `src/App.tsx` | Wraps the application in a visible error boundary and renders `AppShell`. |
| Mode router | `src/components/AppShell.tsx` | Owns Studio navigation, Home/package tools, the Play surface, and editor-mode routing. |
| Development/production server | `server.ts` | Express server, development Vite middleware, production static serving, and `/api/generate`. |
| Vite configuration | `vite.config.ts` | React/Tailwind build, configurable HTTP/HMR ports, and sub-path base support. |
| Headless engine | `src/engine-core/` | Commands, validation/effects, simulation, story, behavior, events, world adapter, and deterministic utilities. |
| Active 3D presentation | `src/components/GameRenderer3D.tsx` and `src/components/PlayScene3D.tsx` | Three.js/React Three Fiber presentation for authored and runtime maps. |

The browser route is an Express-hosted Vite SPA, not a separate editor and game
build. `AppShell` is the single top-level mode boundary.

### 2.2 Active Studio modes

`AppShell` currently exposes:

- Home / package management
- Map editor
- Play
- Game editor
- Dungeons
- Model Maker
- Sprite Creator
- Dialogue editor
- Quest editor
- Entity editor
- Cutscene editor
- Item editor
- Document editor
- Shop editor
- Skill editor
- Simulation inspector

Persisted removed/invalid modes are normalized back to Home. The active Play and
Map editor paths both use the 3D renderer. `GameRenderer2D`, Tile Maker, and
Command Wheel remain legacy source and are excluded from active imports.

### 2.3 Studio/Play ownership boundary

The active ownership model is:

```text
GamePackage (useEngineStore / IndexedDB)
    authored maps, libraries, settings, recipes, provenance
                        |
                        | explicit Play entry
                        v
PlaySave (usePlayStore / autosave + optional slots)
    player, map deltas, inventory, story, simulation, combat
                        |
                        | never writes back automatically
                        v
Studio return: keep runtime session OR explicitly discard it
```

Operational rules after Batch 1:

1. `useEngineStore` is the authored project authority.
2. `usePlayStore` is the active runtime authority.
3. “Play map” selects the active authored map, confirms before replacing an
   existing run, clears the old run, and enters Play.
4. Returning through “Studio — keep run” preserves the runtime save while
   exposing the authored map unchanged.
5. “Discard run” requires confirmation and clears runtime state without
   changing authored project data.
6. A successful package import is a project boundary and clears the prior
   active runtime save.
7. An existing compatible runtime save takes precedence when re-entering Play;
   a selected Studio map is used when no resumable save exists.

### 2.4 Package schema

The active authoring payload is `GamePackageSchema` in `src/schema/game.ts`:

- source schema: `crpg_engine_game_package_v1`;
- export envelope: `crpg_engine_game_package_v2` from `src/schema/v2.ts`;
- metadata: title, version, start map ID, and start spawn ID;
- settings;
- ordinary maps;
- object, sprite, entity, dialogue, document, quest, cutscene, item, ability,
  encounter, shop, faction, ending, bark, and object-blueprint libraries;
- simulation material/process/workstation libraries;
- eight dungeon authoring libraries;
- validators/authoring metadata.

V2 is an envelope around the V1 content payload plus runtime coordinate and
feature metadata. Import accepts the supported V1 or V2 form, unwraps it to the
single active authored payload, parses it with Zod, and reports migration
information.

### 2.5 Ordinary map schema and stable IDs

There is one active map type: `MapDataSchema`. Hand-authored, imported, QA,
fixture, and dungeon-generated maps all use it. A map contains:

- stable map ID, display name, width, and height;
- spawn records;
- macro cells with walkability, LOS, terrain, height, and optional initial
  chemistry;
- props and custom object, entity, item, and container placements;
- optional regions;
- triggers;
- exits and target map/spawn references;
- optional generation provenance.

Persistent runtime deltas address maps and placements by stable ID. Ordinary map
editing therefore treats the map ID as immutable; map renaming requires an
explicit reference-remap operation. `addMap` rejects an ID already present in
the package.

Generated records use the namespace `dg:<normalized-map-id>:`. `buildMap` is a
pure generator-facing boundary that requires stable IDs, checks namespace
ownership and duplicates, canonicalizes collection order, and verifies the map
output hash. Duplicating a generated map through Studio remaps its generated
namespace and local self-references rather than copying colliding persistent
identities.

The package reference audit reports duplicate global and map-local IDs with
stable codes. The permissive package schema itself does not enforce uniqueness
across arrays; audit/validation and authoring guards are therefore part of the
contract.

### 2.6 Save schema and browser storage

The active runtime payload is `PlaySave` in `src/schema/save.ts`:

- source schema: `crpg_engine_save_v1`;
- export/storage envelope: `crpg_engine_save_v2`;
- package version and current map;
- player location, facing, sprite, stats, progression, and skills;
- flags, quests, inventory/layout, money, party, and entity state;
- per-map deltas for items, doors, containers, moved/broken/carried objects,
  simulation conditions, fields, tasks, and processes;
- clock, faction reputation, documents, fog/explored cells, and bark cooldowns;
- chemistry and active-frontier data;
- statuses, physical and emotional/Alder state;
- world facts, simulation economy/regions/scheduler/tile layers;
- combat state.

Storage surfaces are intentionally separate:

| Data | Storage | Contract |
| --- | --- | --- |
| Active authored Studio workspace | IndexedDB `crpg_engine_package_store_v3`, store `active`, key `workspace` | Falls back to `crpg_engine_package_store_v2` when v3 has no valid workspace. |
| Active runtime/autosave | Zustand persistence key `crpg-run-save` | Runtime state only. |
| Explicit runtime slots | `localStorage` keys `crpg-save-slot-1` through `-3` | `crpg_engine_save_slot_v2` metadata plus V2 save payload. |

The Studio workspace is not exposed for editing until IndexedDB hydration
finishes. A programmatic edit made during hydration wins over stale storage and
is persisted after hydration.

## 3. Existing engine-system inventory

The following is the actual starting point for later Fracture Crawl phases.
“Implemented” means executable source exists now; it does not imply that the
later plan's full browser acceptance behavior has been proven.

| System | Current executable capability | Fracture Crawl implication |
| --- | --- | --- |
| Light and environment fields | Simulation records support light, smoke, fire, sound, radius, intensity, occlusion, visibility modifiers, source, and decay. The 3D renderer has a dynamic Black Star light rig. | Adapt in Phase 2 into one authoritative illumination query shared by sight, enemies, fog, and debug feedback. Current renderer light alone is not proof of reciprocal darkness. |
| Fog and LOS | Save-backed explored cells, current fog presentation, LOS helpers, occluding geometry, and fog/LOS profiling exist. | Adapt in Phase 2 so discovered/currently visible/illuminated/sensed states agree and actors are not leaked through fog. |
| Sound | Core command/event and simulation-field support exists; actions and cutscenes can emit/play sound. | Extend in Phase 3 with a typed stimulus contract and data-driven hearing/search behavior across the required creature profiles. |
| Perception and behavior | Alert states (`oblivious`, `suspicious`, `searching`, `combat`), NPC tasks, behavior arbitration, reactive signals, and entity-state intent exist. | Adapt in Phases 2–3 to remove omniscient tracking, retain last-known evidence, and expose detection causes. |
| Chemistry and physical simulation | Numeric chemistry axes, sparse active frontier, run encoding, fire/water/electricity/foam/reactions, actor exposure, surfaces, traces, tasks, workstations, regional fidelity, and persistent deltas are implemented. | Reuse for smoke/obscurance, environmental consequences, hazards, and later Glass-light interactions. |
| Combat | Melee, authored abilities, targeting shapes, cover/elevation/condition modifiers, forced movement, overwatch, statuses, XP, and allied initiative/enemy pulses are active. | Preserve; later acceptance creatures should use ordinary entity/combat contracts. |
| Entities and objects | Entity definitions/placements, schedules, stable state, ordinary object blueprints, manipulation, doors, containers, world facts, and persistent map deltas exist. | Reuse for Intercessors, ghosts, bundles, artifacts, light objects, and generator placements. |
| Story, dialogue, and quests | Conditions, four trigger types, dialogue graphs, quest state, supported cutscene commands, documents, switches, factions, shops, and endings exist. | Reuse for archive/hub interactions and acceptance scenarios. Unsupported `start_combat` and `custom` cutscene commands remain deliberately rejected. |
| Inventory and economy | 8 x 6 spatial inventory, shape/rotation/layout, weight/encumbrance, world/drop/container persistence, currency, and shops exist. | Extend in Phases 6–8 with artifact conservation, death bundles, and Glass value/burden/fuel rules. |
| Persistent runtime state | Maps, items, doors, objects, fog, chemistry, story, actors, simulation, and combat round-trip through V2 saves. | Split explicitly into authored baseline, persistent campaign delta, and tactical expedition state in Phase 4. |
| Validation | Package reference audit and pure ordinary-map validator provide stable issue codes, severities, paths, reachability/progression results, and budgets. | Already surfaced in Studio in Phase 1; extend with later artifact/ghost/campaign invariants. |
| 3D presentation | Play and Map Editor share the active Three.js renderer; overlays cover fog, chemistry, targeting, denied actions, overwatch, intents, and readouts. | Reuse for every browser acceptance chamber. |

## 4. Existing dungeon generator

The repository already contains substantially more than a placeholder dungeon
workspace. The active editor-time generator is under `src/dungeonGen/`, its
Studio surface is `src/components/DungeonGeneratorPanel.tsx`, and its worker is
under `src/components/dungeon/`.

Current workflow:

```text
Saved recipe + package libraries + seed
    -> deterministic topology
    -> bounded spatial embedding
    -> infrastructure and population
    -> ordinary MapData construction
    -> dungeon + ordinary-map audits
    -> explicit atomic package bake
    -> normal Map Editor / normal 3D Play
```

Implemented capabilities include:

- typed recipes, themes, archetypes, room templates, and encounter/hazard/
  reward/narrative profiles;
- named deterministic RNG streams and canonical hashes;
- critical spine, branches, loops, secrets, locks, progression search, and
  graph audits;
- one-to-three-floor embedding, corridors, templates, and paired transitions;
- deterministic ordinary placement IDs and generation provenance;
- encounter, reward, narrative, hazard, and sparse chemistry population;
- recipe CRUD, graph/floor/3D/population/audit/bake views;
- worker progress and cancellation;
- stage-specific salts, rerolls, locks, and current-session comparison;
- collision policy: cancel, create new IDs, or confirmed replacement;
- replacement protection for manually modified generated maps;
- pre-operation backup, one atomic store transaction, and one global Undo;
- automatic opening of the first baked floor in the ordinary Map Editor.

Important boundary: this is an editor-time bake system. It does not create a
special runtime dungeon map, and maps are never regenerated on load. Runtime
per-save procedural generation remains deferred.

The later generator batch should begin by testing and adapting this existing
workflow against the exact Fracture Crawl sockets, critical-route, loop,
landmark, extraction, artifact-origin, encounter, bake, and browser acceptance
requirements rather than replacing it wholesale.

## 5. Continent/region retirement boundary

The procedural continent/region generator is intentionally removed:

- no active `src/proceduralRegion` or `src/procedural-continent` directory;
- no continent generator mode in `AppShell`;
- no `test:region` or `audit:region` package script;
- no active production import may reference the removed modules or `archive/`;
- the reference audit treats archived continent settings/provenance as errors;
- `scripts/audit-legacy-imports.ts` prevents the paths from returning;
- `archive/procedural-continent-2026-07/README.md` records the retirement
  decision without restoring obsolete code.

Authored overworld maps, map assets, and their audits remain supported ordinary
content. They are not the retired procedural-continent architecture. Fracture
work must continue through ordinary `MapData` and the local dungeon builder; it
must not revive a continent runtime contract.

## 6. Phase 0 safety investigation and repairs

### 6.1 Destructive-risk ledger

| Finding | Pre-repair risk | Batch 1 result |
| --- | --- | --- |
| QA-shaped hydration refresh | A persisted project containing canonical QA map IDs and an older/different version could be recognized as bundled content and silently replaced, erasing authored edits such as a renamed map. | `refreshBundledEnginePackage` is now observational identity. QA content changes only through explicit merge or guarded replacement. A hydration sentinel test covers this path. |
| Ordinary import normalization | Hidden fixture injection, art refresh, elevation rewrite, start-reference repair, or map deletion could alter authored work. | After supported-envelope parsing, normal import reports issues but does not perform those migrations. Round-trip tests cover 25 arbitrary authored maps, invalid start metadata, repeat import, and export/import/re-export stability. |
| IndexedDB hydration race | The default QA workspace rendered before storage resolved; an early edit/import could later be overwritten by stale IndexedDB data. | `storageHydrated` gates the complete Studio shell. A mutation observed during hydration takes precedence and is persisted. |
| IndexedDB namespace bump | Current writes moved to v3 while v2-only reading would make an existing authored workspace appear missing. | Read v3 first, then fall back to v2; a valid legacy workspace is restored and subsequently persisted by the active store. |
| Active runtime surviving project import | Same-version projects with overlapping map IDs could receive stale runtime deltas from the previous package. | Successful package import resets the active runtime. The Studio asks for confirmation when a run exists. Explicit QA replacement also resets runtime. |
| Duplicate map authoring | `addMap` previously appended a colliding map ID. | `addMap` now rejects duplicate IDs. Project validation also reports duplicate IDs already present in imported/schema-valid arrays. |
| Destructive QA replacement | Replacement can remove every authored map. | Replacement requires explicit confirmation, creates a V2 pre-operation JSON backup, resets runtime, and reports destructive changes. Merge remains the non-destructive option and preserves existing IDs. |
| Generated-map duplication/replacement | Copied persistent IDs or silent regeneration could corrupt deltas and references. | Studio duplication remaps the namespace; edits set `manuallyModified`; load never regenerates; dungeon replacement is explicit, backed up, and separately acknowledges manual modifications. |

### 6.2 Import and normalization contract

Normal package import now follows this sequence:

1. Parse JSON.
2. Normalize supported V1/V2 envelope shape.
3. Parse the V1 content with `GamePackageSchema`.
4. Report invalid start references without repairing them.
5. Enforce the Studio/runtime support contract.
6. Reset the previous active runtime on success.
7. Commit one authored-project state transition and update surviving selections.

Repeated normal import does not append maps or accumulate duplicate IDs. Import
errors are returned as visible UI diagnostics rather than crashing Studio.

Schema caveat: Zod defaults for declared fields may be materialized during
parse, and unknown extension keys outside the supported schema are not part of
the preservation guarantee. The round-trip promise applies to supported
package/map fields. Adding campaign extension records in later phases must
therefore update the schema before those records are imported.

### 6.3 Known safety gaps carried forward

These are non-blocking for the Phase 0/1 contract but must remain visible:

- `finalizePackageMigration` automatically detects removed map IDs; a generic
  same-ID content replacement is not inferred solely from the ID set. Existing
  QA and dungeon replacement callers explicitly declare/protect their
  destructive behavior, but the reusable migration helper should be hardened
  if new replacement callers are added.
- Manual runtime slots are presently compatibility-checked by package version,
  not by a stable project identity. Successful import clears the active
  autosave, but previously written explicit slots remain in `localStorage`.
  Stable project/save ownership belongs in the Phase 4 save-contract work.
- The package schema accepts duplicate IDs structurally; audit/validation is
  the enforcement layer for imported data. Authors must resolve every
  `REF_DUPLICATE_ID` before Play acceptance.
- Existing default/QA package audits report undeclared dynamic/runtime switch
  references as warnings. These are not current build errors, but the warning
  list should not be allowed to grow without review.

## 7. Phase 1 Studio/Play and diagnostics implementation

### 7.1 Visible editor controls

The one-app workflow now provides:

- Home: import JSON file, paste/import JSON, export V2 package, explicit QA
  merge, guarded QA replace, and project validation;
- Map Editor: choose/open a map, create a map, duplicate a map, edit ordinary
  map data, toggle lint/validation overlays, and launch the active map in Play;
- Play: start/continue a run, use autosave and three explicit slots, return to
  Studio while preserving the run, or confirm discard;
- Dungeons: open the integrated recipe/generation/validation/bake workspace.

### 7.2 Project diagnostics

`src/utils/studioValidation.ts` is the browser-safe aggregation boundary. It
combines:

- `auditGamePackageReferences(gamePackage)` for package identity and reference
  integrity; and
- `validateOrdinaryMap(map, { package: gamePackage })` for every map.

Studio results include:

- stable severity: `error`, `warning`, or `info`;
- stable issue code;
- exact package path;
- source (`package` or `map`);
- blocking status;
- map ID and an “Open map” action when applicable;
- relevant cell coordinates;
- suggested fix where supplied by the map validator;
- error/warning/info counts and number of maps checked.

The validation button displays a busy state and yields one browser task before
running, so the user receives immediate status instead of an apparently dead
control. Dungeon generation already provides worker progress and cancellation.

### 7.3 Destructive-operation feedback

The following high-impact operations have visible confirmation boundaries:

- import a different project while a runtime session exists;
- replace the package with the QA suite;
- replace manually modified generated maps during dungeon bake;
- start a clean selected-map test while a runtime exists;
- discard the current Play session;
- begin a New Game over an autosaved run;
- overwrite or delete an explicit save slot;
- Game Editor deletion paths for named settings/library content.

Confirmed package replacements produce a backup where the migration contract
supports one. Ordinary authored edits remain covered by the existing global
Undo/Redo history.

### 7.4 Automated Phase 1 contract

`scripts/test-studio-play-contract.ts` checks that:

- Play-map resolution chooses the selected Studio map when there is no save;
- runtime movement and flags do not mutate the authored package;
- keep-run Studio/Play transitions preserve runtime state;
- project validation accepts a valid package;
- a missing start map and duplicate IDs produce stable blocking diagnostics;
- `addMap` rejects a duplicate map ID;
- importing another project clears the previous runtime.

The package aggregate command includes this suite as `test:studio-play`.

## 8. Capability disposition for future batches

### 8.1 Implemented and preserved

- Single browser application with Studio and Play modes.
- V1 content plus V2 package/save envelope migration.
- Ordinary authored/generated map contract.
- 3D Map Editor and 3D Play renderer.
- Separate authored-project and runtime-save stores.
- Non-destructive normal import and explicit export.
- Explicit QA merge/replacement boundary and replacement backup.
- Reference audit and ordinary-map validator.
- Project diagnostics in Studio.
- Immediate selected-map Play testing.
- Deterministic editor-time dungeon generator and audited bake workflow.
- Headless commands, object manipulation, chemistry, combat, story, inventory,
  fog persistence, and runtime map deltas.
- Strict type-first build and aggregate test/audit commands.

### 8.2 Adaptations required

- Unify simulation light, renderer light, fog, LOS, and perception behind an
  authoritative Phase 2 illumination/detection contract.
- Extend current perception alerts/tasks into typed sensory profiles and
  last-known-position search in Phase 3.
- Divide the broad current save into authored, persistent campaign, and tactical
  layers in Phase 4 while retaining V2 compatibility/migration.
- Add stable project identity to explicit save ownership.
- Adapt entity, inventory, world-delta, and story systems for Intercessor lives,
  ghosts, deterministic skill inheritance, artifacts, bundles, hub recovery,
  and Glass.
- Test the existing dungeon generator specifically against Fracture Crawl
  sockets, extraction, artifact origins, landmark needs, and browser workflow.

### 8.3 New features required

- Phase 2 reciprocal darkness and detection-cause UI.
- Phase 3 hearing/light-sensitive sensory profiles and non-omniscient search.
- Phase 4 explicit campaign-state layers and reset policy.
- Phase 5 Intercessor succession and life history.
- Phase 6 persistent ghosts and deterministic signature-skill inheritance.
- Phase 7 legal artifact state machine and death-bundle conservation rules.
- Phase 8 Glass harvesting, burden/value, emergency light, and stimulus behavior.
- Phase 11 integrated expedition acceptance scenario.
- Phase 12 complete authoring/readiness pass for all new records.
- Phase 13 migrations, malformed-save recovery, profiling, and final hardening.

### 8.4 Removed, legacy, and deferred

| Disposition | Systems |
| --- | --- |
| Removed | Procedural continent/region generator, its UI/settings/scripts, and the inactive Encounter Editor mode. |
| Legacy | `GameRenderer2D`, Tile Maker, Command Wheel, and supported compatibility parsing for older package/save forms. |
| Deferred by current engine baseline | Runtime roguelike generation, runtime procedural run saves, continent-scale generation, timed reinforcement waves, summon execution, complete equipment loop, and complete hack/mimic loops. |
| Deferred by the Fracture Crawl plan | Campaign persistence layers, succession, ghosts, artifacts/bundles, Glass, integrated scenario, and release hardening, in their scheduled phases. |

## 9. Automated commands and baseline evidence

### 9.1 One documented complete command

The complete existing release gate is:

```bash
npm run verify
```

It aliases `npm run verify:dungeon-readiness` and executes typecheck, lint, the
type-first client/server build, all tests, all aggregate audits, fog/LOS
profiling, and save-size profiling.

Focused Batch 1 commands are:

```bash
npm run typecheck
npm run build
npm run test:package-roundtrip
npm run test:studio-play
npm run test:all
npm run audit:all
```

### 9.2 Baseline before Batch 1 changes

These measurements describe the checkout immediately before the Batch 1
repairs and are retained only as a comparison point:

| Command | Baseline result | Observed wall time / notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | 7.08 seconds. |
| `npm run build` | Pass | 12.85 seconds; Vite transformed 2,469 modules. Main client JavaScript was approximately 3.05 MB / 854 KB gzip and emitted the existing non-fatal chunk-size advisory. |
| `npm run test:all` | Pass | 12.68 seconds; 12 chained suites before `test:studio-play` was added. |
| `npm run audit:all` | Pass | 5.31 seconds; no audit errors. Default and QA reference audits retained warning-only undeclared-switch diagnostics (14 and 10 respectively); the dungeon audit was good. |
| Bare `npm run dev` | Environment conflict | macOS AirTunes already owned port 5000. This is not an engine compile/runtime failure. |
| `PORT=5003 HMR_PORT=5004 npm run dev` | Pass | HTTP 200 and the expected application title were observed before the test server was stopped. |

The preceding stabilization baseline also recorded passing fog/LOS and save-size
profiles, but did not preserve numeric timings in its Markdown record. The
ordinary-map validator's current performance budgets remain the enforced
structural limits, including a hard 65,536 macro-cell / 589,824 fine-cell limit
and an 8 MiB serialized-map hard limit.

### 9.3 Final verification after Batch 1

Final verification was run after the last source change:

| Gate | Final result | Evidence |
| --- | --- | --- |
| `npm run verify` | **Pass** | Complete aggregate gate exited 0 in approximately 39.4 seconds. |
| Typecheck and lint | **Pass** | Both TypeScript passes completed without errors; `lint` is presently the repository's second `tsc --noEmit` gate. |
| Client/server build | **Pass** | Vite transformed 2,470 modules in 4.76 seconds; esbuild completed the server bundle in 6 ms. |
| `test:all` | **Pass** | All 13 chained suites passed, including the new `test:studio-play` contract. |
| `audit:all` | **Pass** | Zero audit errors. The existing undeclared-switch diagnostics remain warning-only: 14 for the default package and 10 for the QA suite. |
| Dungeon acceptance | **Pass** | The default two-floor Institutional Ruin audit was accepted in one attempt; package bake round-trip passed and total generation/audit time was approximately 276.1 ms. |
| `profile:fog` | **Pass** | Fine-grid LOS p95 was 0.615 ms against the 8 ms threshold; macro p95 was 0.136 ms. |
| `profile:save` | **Pass** | Run-encoded flood plus full macro fog was 166.4 KB JSON / 36.8 KB gzip, below the 2 MB JSON budget. |
| Bundled Studio validation | **Pass** | Final pure validation reports 0 errors, 10 warnings, and 0 info diagnostics for the ten-map QA workspace. |
| `git diff --check` | **Pass** | No whitespace errors. |

Non-fatal build observations remain visible: Node reports the existing
`module.register()` deprecation, and Vite reports the existing large-client-
chunk advisory (approximately 3.06 MB / 857 KB gzip).

The verified browser route loaded the hydration gate and then the ten-map
Project Dashboard. Browser smoke testing confirmed:

- Home project validation renders stable counts, codes, paths, messages, and
  map navigation without crashing. The smoke run exposed one missing local
  keycard in the QA world lab; that fixture was repaired, and final validation
  now has zero blocking errors.
- Map Editor renders map selection, create, duplicate, lint, and **Play map**
  controls.
- **Play map** started `qa_suite_hub`; a runtime save was created; **Studio —
  keep run** returned to Map Editor; re-entering Play enabled **Continue Game**;
  and Continue resumed `qa_suite_hub`.
- The confirmed discard path returned to Map Editor and cleaned up the test
  runtime.
- Dungeons opened inside the same application with Recipe, Graph, Floor Plan,
  3D Preview, Population, Audit, and Bake surfaces.
- Browser console error count was zero.

The browser smoke deliberately did not mutate authored project content through
duplicate/edit/import or run a generator bake. Those state-changing workflows
remain in the user checklist below so the user can verify them against their
own workspace intentionally.

## 10. Known-good browser route

Port 5000 is the repository default, but on the Batch 1 machine macOS AirTunes
already owns it. Use the verified alternate route:

```bash
cd "/Users/brennenarotin/Downloads/Crpg-Engine-7-main 2 copy 5/remix_-crpg-engine-blueprint"
npm install
PORT=5003 HMR_PORT=5004 npm run dev
```

Open:

```text
http://localhost:5003
```

Expected first state: a brief “Loading Studio workspace…” gate may appear while
IndexedDB hydrates, followed by the Project Dashboard. A loading gate that never
resolves, a blank page, or replacement of an authored workspace is a blocking
failure.

## 11. User browser acceptance checklist

Phase 0/1 does not pass on automated evidence alone. Perform this checklist in
the browser and record every discrepancy.

### 11.1 Launch and project safety

- [ ] Launch on `http://localhost:5003` and reach the Project Dashboard.
- [ ] Confirm the main navigation exposes Home, Map, Play, and Dungeons in the
  same application.
- [ ] Open Map and select a known authored map.
- [ ] Change a visible, harmless authored property such as the map display name.
- [ ] Return Home, export the package, and confirm a JSON file is produced.
- [ ] Import that exported JSON.
- [ ] Confirm the edited authored map still exists with the same ID and edited
  property.
- [ ] Refresh the browser and confirm the workspace survives IndexedDB
  hydration without briefly becoming editable default content.

### 11.2 Validation and diagnostics

- [ ] On Home, press **Validate Project**.
- [ ] Confirm the button displays a validating/busy state.
- [ ] Confirm the result shows maps checked and error/warning/info counts.
- [ ] If diagnostics exist, confirm they show severity, stable code, readable
  message, path, and map/cell context where relevant.
- [ ] Use **Open map** on a map diagnostic and confirm it navigates to that map.
- [ ] Confirm a validation error does not crash or blank Studio.

### 11.3 Create, duplicate, and edit

- [ ] In Map Editor, create a new test map and confirm it opens immediately.
- [ ] Duplicate the test map and confirm the duplicate has a unique map ID and
  “Copy” display name.
- [ ] Edit a visible property or cell on the duplicate.
- [ ] Toggle the lint overlay and confirm Studio remains responsive.
- [ ] Undo and redo a normal authored edit.

### 11.4 Studio-to-Play contract

- [ ] With the edited duplicate selected, press **Play map**.
- [ ] Confirm Play starts on the selected map, not silently on a different
  project entry map.
- [ ] Move the player or perform one runtime action.
- [ ] Choose **Studio — keep run**.
- [ ] Confirm the authored map edit remains intact and no runtime position or
  flag appears as an authored map mutation.
- [ ] Re-enter Play from the main Play navigation and confirm the compatible
  runtime session resumes.
- [ ] Return through **Discard run**, accept the warning, and confirm the next
  Play session no longer resumes that discarded state.

### 11.5 Runtime and destructive confirmations

- [ ] Start a run, then press **Play map** from Studio; confirm the clean-run
  replacement warning appears.
- [ ] On the title screen, use **New Game** while a save exists; confirm the
  autosave-discard warning appears.
- [ ] Save into an explicit slot, then save again; confirm overwrite requires
  approval.
- [ ] Delete a populated slot; confirm deletion requires approval.
- [ ] With a runtime active, begin importing a project; confirm the runtime
  discard warning appears.
- [ ] Cancel the warning and confirm both project and run remain intact.
- [ ] Accept an import and confirm the old runtime is no longer resumable.
- [ ] Press **Replace with QA…**, cancel, and confirm the authored package is
  unchanged.
- [ ] Do not accept QA replacement unless intentionally testing the downloaded
  pre-operation backup and full replacement behavior.

### 11.6 Dungeon workspace presence

- [ ] Open **Dungeons** from Studio.
- [ ] Confirm recipe and preview/audit/bake controls render in the same app.
- [ ] Start a generation and confirm progress is visible.
- [ ] Cancel one run and confirm the UI returns to a usable state.
- [ ] Do not bake over authored maps during this Batch 1 smoke test unless the
  collision/backup flow is being tested deliberately.

## 12. Expected engine capability after Batch 1

After this batch, the engine is expected to be a reliable browser authoring and
test harness for every later phase. The user should be able to:

1. launch one application;
2. author, create, duplicate, validate, import, and export ordinary maps;
3. see actionable errors rather than a crashed Studio;
4. test the selected map immediately in Play;
5. return while preserving the run or explicitly discard it;
6. continue editing the unchanged authored baseline;
7. reload the browser without losing the IndexedDB workspace;
8. use explicit, guarded fixture and generated-map replacement operations; and
9. enter the existing dungeon-generation workspace without crossing into a
   separate application or runtime map type.

Batch 1 does not yet promise Fracture Crawl's final stealth, sensory,
persistence, succession, ghost, artifact, bundle, Glass, or integrated expedition
behavior.

## 13. Phase gate

The code-level Phase 0 exit condition is satisfied: final verification confirms
that normal import, normalization, hydration, and fixture handling do not erase
the authored sentinel map. Phase 1's automated contract and non-destructive
browser smoke also pass. The remaining gate is the user's acceptance run of the
state-changing checklist, especially edit → Play → Studio → continue editing
and export/import preservation.

Do not begin the next major batch while a blocking item in Sections 9–11 is
failing. Non-blocking findings should be added to Section 6.3 with an owner phase.

## 14. Primary source map

| Area | Primary source |
| --- | --- |
| React entry and application boundary | `src/main.tsx`, `src/App.tsx`, `src/components/AppShell.tsx` |
| Server and browser ports | `server.ts`, `vite.config.ts` |
| Package/map schema and empty package | `src/schema/game.ts` |
| V2 package/save envelopes | `src/schema/v2.ts` |
| Runtime save contract | `src/schema/save.ts` |
| Authored project store/import/storage | `src/store/engineStore.ts` |
| Runtime store, autosave, and slots | `src/store/playStore.ts` |
| Destructive migration/backup contract | `src/store/packageMigration.ts` |
| QA installation | `src/data/qaSuiteInstaller.ts` |
| Play map selection | `src/utils/playModeMap.ts` |
| Studio validation aggregation | `src/utils/studioValidation.ts` |
| Map authoring and direct Play entry | `src/components/MapEditor.tsx` |
| Play UI and runtime orchestration | `src/components/PlayMode.tsx` |
| Package references | `src/generation-facing/referenceAudit.ts` |
| Ordinary-map validation | `src/engine-core/mapReadinessValidator.ts` |
| Generated map identity/builder | `src/generation-facing/mapContract.ts` |
| Dungeon generator | `src/dungeonGen/`, `src/components/DungeonGeneratorPanel.tsx`, `src/components/dungeon/` |
| Package safety tests | `scripts/test-package-roundtrip.ts`, `scripts/test-map-suite.ts` |
| Studio/Play tests | `scripts/test-studio-play-contract.ts` |
| Save/runtime journey | `scripts/test-save-roundtrip.ts`, `scripts/fixtures/readinessDungeonFixture.ts` |
| Legacy retirement guard | `scripts/audit-legacy-imports.ts`, `archive/procedural-continent-2026-07/README.md` |
