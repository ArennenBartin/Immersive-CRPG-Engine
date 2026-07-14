# CRPG Engine Systems Reference — 3D Stabilized

Status: canonical current-source reference  
Applies to: the stabilized 3D engine after retirement of the continent generator  
Last audited: 2026-07-13

This document describes the engine that is present in source now. It replaces the
older design-oriented systems reference, which mixed implemented behavior with
planned work and pre-stabilization assumptions.

The source code, schemas, automated audits, and tests remain authoritative when
they disagree with prose. See
`STABILIZATION_AND_DUNGEON_READINESS_IMPLEMENTED.md` for the S0–S7 stabilization
history and `DUNGEON_GENERATOR_IMPLEMENTED.md` for the current DG0–DG10
generator record, limitations, and detailed source map.

## 1. Status vocabulary

Every capability in this document uses one of these meanings:

| Status | Meaning |
| --- | --- |
| Implemented | Used by the active runtime, authoring workflow, or both, and covered by a concrete source path. |
| Core | Implemented in engine-core, but not necessarily surfaced by every active editor or gameplay screen. |
| Import/source-authored | Accepted and used by runtime or schemas, but not fully authorable in the current Studio UI. |
| Disabled | Kept in a schema or compatibility surface, but deliberately rejected or not dispatched. |
| Legacy | Retained for compatibility or reference and excluded from active 3D paths. |
| Deferred | Intentionally not implemented in this stabilization pass. |

## 2. Product shape and architecture

The application is a single-package React/Vite Studio and game runtime backed by
a headless TypeScript engine. The active presentation layer is Three.js through
React Three Fiber.

The main data and execution flow is:

    Game package schemas and Studio stores
                    |
                    v
       Authored macro-grid map data
                    |
                    v
       Fine-grid runtime projection (3 x 3)
                    |
                    v
        PlayMode orchestration and save state
                    |
                    v
      Headless command validation and effects
                    |
                    v
       V1GridWorld adapter and engine kernel
                    |
                    v
        Structured events and PlaySave deltas
                    |
                    v
          GameRenderer3D presentation

This is a hybrid architecture, not a pure ECS:

- Zod schemas define package and save contracts.
- Zustand stores own authoring and persisted client state.
- PlayMode coordinates runtime, presentation, input, story, and combat.
- engine-core owns deterministic commands, validation, effects, simulation
  primitives, and structured events.
- V1GridWorld adapts package/save data to the headless engine interfaces.
- GameRenderer3D presents the active world without becoming the authority for
  logical coordinates or game state.

### Active application modes

AppShell exposes:

- Home/package management
- Play
- Game editor
- Map editor
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

Persisted invalid or removed mode identifiers are reset to Home.

The encounter editor, Tile Maker, and model gallery modes are not active.

## 3. Coordinate and spatial contracts

### 3.1 Authored macro grid

Maps are authored in macro cells. Map width and height describe a centered
coordinate domain:

- minimum x is negative floor(width / 2)
- minimum z is negative floor(height / 2)
- the maximum is derived from the dimension and minimum

Authoring coordinates use x, y, z, with y representing elevation. Older data may
refer to the second horizontal axis as y; runtime normalization treats the
horizontal plane consistently as x/z.

### 3.2 Fine runtime grid

One authored macro cell becomes a 3 x 3 fine-cell block:

- FINE_PER_MACRO = 3
- macro point to fine center: x * 3 + 1, z * 3 + 1
- an actor occupies a centered 3 x 3 fine footprint
- authored ranges and distances are multiplied by three
- one macro movement unit is 1000 energy
- one fine movement step is 333 energy

The fine projection expands cells and all spatially meaningful references,
including placements, schedules, triggers, exits, cutscene action cells,
workstations, and skill ranges. Expanded data is marked to prevent accidental
double expansion.

### 3.3 Large-map materialization

Authored maps above 65,536 macro cells use windowed fine-grid materialization:

- sector size: 32 macro cells
- halo: 1 sector
- materialized-sector cache: 16

This protects runtime memory without changing the ordinary map contract.

### 3.4 Render coordinates

Logical fine coordinates and Three.js world coordinates are deliberately
separate. The renderer adapter normalizes fine positions back to macro-world
scale. Game rules must read logical coordinates, not rendered transforms.

## 4. Package and save contracts

### 4.1 Package envelope

The current export envelope is crpg_engine_game_package_v2. It contains runtime
coordinate and feature metadata plus a content payload matching the v1 package
schema.

The package contains:

- maps and start-map/start-spawn references
- object definitions and object blueprints
- sprites and entities
- dialogue graphs, quests, cutscenes, and documents
- switches, items, abilities, shops, barks, factions, and endings
- typed encounter definitions
- simulation materials, processes, and workstations
- dungeon recipes, themes, room archetypes/templates, encounter profiles,
  hazard profiles, reward profiles, and narrative profiles
- validation and authoring metadata

createEmptyGamePackage creates a true empty/base package. It does not inject QA
maps or silently remove user maps.

### 4.2 Save envelope

The current export envelope is crpg_engine_save_v2. Save state covers:

- player position, facing, sprite, stats, and progression
- inventory instances, grid layout, currency, skills, and party
- entity and party runtime state
- map deltas, opened and unlocked doors, moved/broken objects
- world items, dropped items, containers, and their contents
- switches, quests, dialogue/story facts, documents, and end state
- clock, faction reputation, fog, explored cells, and bark cooldowns
- chemistry, simulation economy, region state, scheduler, and tile layers
- statuses, physical conditions, emotional/Alder state
- combat session state

### 4.3 Storage

- The Studio workspace uses IndexedDB under crpg_engine_package_store_v2.
- Play autosave uses Zustand persistence.
- Three explicit save slots use localStorage keys shaped as
  crpg-save-slot-<slot>; each stored payload uses the
  crpg_engine_save_slot_v2 schema.
- Hydration failures are handled defensively rather than replacing the package.

### 4.4 Safe import, migration, and replacement

After schema parsing, ordinary package normalization/import is observational and
non-destructive. It does not:

- backfill or refresh art, render defaults, blueprints, or simulation materials
- rewrite JAM/elevation data
- repair start-map or start-spawn metadata
- install the QA suite
- delete or replace maps

Invalid start references and packages with no maps are warnings. Their authored
content and metadata remain unchanged. Zod may fill defaults declared by the
schema while parsing; no broader content migration is hidden behind import.

Package migration reports expose:

- warnings
- ordinary changes
- destructive changes
- whether changes were applied
- whether confirmation is required
- a proposed package
- a JSON backup for confirmed destructive replacement

Map removal is detected automatically. A destructive replacement without
confirmation leaves the current package intact. The Home screen provides
separate explicit actions for:

- merging the QA suite while preserving existing IDs and reporting collisions
- replacing the package after confirmation and downloading a backup

Import and export both assert the Studio runtime-support contract before
mutation or serialization.

## 5. Ordinary map contract

There is one runtime map type. Authored, imported, hand-built, fixture, and
generated maps all use MapData.

### 5.1 Map contents

A map can contain:

- dimensions, display name, and start spawns
- active/walkable cells with authored and visual heights
- terrain, object, region, room, tag, hazard, infection, portal, and surface data
- optional ordinary initial chemistry on cells
- custom object and entity placements
- world items and containers
- regions and schedules
- step, interaction, load, and switch-change triggers
- exits to target map/spawn pairs, with optional paired transition identity/kind
- optional generation provenance

Cell coordinates must be finite and in bounds. Stable placement IDs are the
identity contract for persistent state.

### 5.2 Persistent placement identity

Stable IDs are used for:

- object and entity placement state
- door open and unlock state
- moved and broken object origins
- world items and containers
- triggers, exits, regions, and generated ownership

Legacy data may omit an object or entity placement ID; compatibility fallbacks
derive a composite/index identity. New maps and all generated output must use
stable IDs.

### 5.3 Doors and locks

Door placements support:

- locked
- key item ID
- consume key

Attempting to open a locked door validates inventory first. A valid key unlocks
and opens the door, optionally consumes the key, and emits door_unlocked followed
by door_opened. Both states are saved by stable placement ID.

Door locks are implemented at runtime and supported by source-authored/imported
maps. The current map editor does not expose a complete dedicated door-lock
authoring workflow.

### 5.4 Containers

Containers support stable IDs, locks, key requirements, optional key
consumption, contents, and simulation state. Open, search, take, and stow
operations persist per container. Container locks are supported in the active
editor and runtime.

## 6. Generated-map contract

The former continent generator has been removed. The remaining generation work
is deliberately generic and dungeon-facing.

### 6.1 Pure builder boundary

buildMap is the only supported generated-map assembly boundary. It:

- parses the ordinary map schema
- rejects non-positive or non-integral dimensions
- requires stable IDs on generated spawns, objects, entities, items, containers,
  triggers, exits, and regions
- canonicalizes collection order
- computes a deterministic output hash
- validates the generated ID namespace

Generated IDs use the prefix:

    dg:<normalized-map-id>:

Generated maps do not gain a special runtime subtype or code path.

### 6.2 Generation provenance

Optional generation metadata records:

- generatorId and generatorVersion
- recipeId and recipeVersion
- seed
- outputHash
- generatedAt
- manuallyModified
- optional sourceSnapshotHash
- optional stage salts, content-library hash, and canonical result hash
- optional bundle ID, floor index/count, and attempt index

The baked MapData is always authoritative. Loading a save or opening a package
never reruns a generator merely because generator versions changed.

Automatic regeneration is allowed only when metadata exists and
manuallyModified is false. Any ordinary map edit marks generated content as
manually modified. Duplicating a generated map remaps its namespace and local
self-references and defaults the copy to manually modified.

### 6.3 Deterministic IDs and hashes

DeterministicIdAllocator provides:

- stable namespace ownership
- independent ID streams
- semantic/idempotent IDs
- collision rejection for reserved IDs
- decoration streams that cannot renumber topology

Canonical stable JSON plus FNV-1a 64-bit hashing produces outputHash. Generation
metadata itself is excluded from the map-output hash.

### 6.4 Current dungeon generator

`dungeon_v1` is an active bake-time authoring system for built architectural
dungeons. It resolves a saved recipe and package libraries, builds and audits an
abstract topology, partitions one to three floors, embeds procedural/template
rooms, routes corridors, realizes paired transitions, populates ordinary
infrastructure/actors/items/hazards/narrative traces, and constructs ordinary
`MapData`.

The deterministic inputs are generator version, recipe/version, visible seed,
per-stage salts, attempt index, and the relevant content-library hash. Named RNG
streams isolate topology, archetypes, gates, floor partition, room shapes,
embedding, corridors, infrastructure, encounters, hazards, rewards, dressing,
and secrets. Canonical graph, embedding, bundle, and ordinary map hashes make
replay identity inspectable.

The package owns eight validated dungeon libraries:

- recipes
- themes
- room archetypes
- room templates
- encounter profiles
- hazard profiles
- reward profiles
- narrative profiles

The optional Institutional Ruin starter is a non-destructive installer and the
default validation recipe. It targets two 64 x 64 macro floors, 16–20 rooms, a
loop, secrets, one key lock, encounter situations, systemic hazards, rewards,
and authored story traces. Existing package records win on ID collisions; the
installer does not replace maps.

See `DUNGEON_GENERATOR_IMPLEMENTED.md` for the exact algorithm, audits, Studio
workflow, and honest v1 limitations.

### 6.5 Generation diagnostics artifact

crpg_generation_diagnostics_v1 is a generator-agnostic replay/debug artifact. It
captures:

- generator and recipe IDs/versions plus the complete recipe snapshot
- the seed and named RNG stream snapshots or derivation keys
- the abstract graph and spatial layout
- the ordinary-map validation report
- the baked ordinary output map
- start/finish timestamps, duration, retry count, and output hash

The artifact computes a deterministic attempt ID from replay identity and rejects
stale map-output hashes. The dungeon generator additionally returns structured
stage diagnostics and metrics with its graph, embedding, and ordinary maps.
These are serializable diagnostics, not package authority and not alternate
runtime map types.

## 7. Reference integrity and validation

### 7.1 Package-wide reference audit

auditGamePackageReferences reports exact data paths, stable issue codes, and
severity. It checks:

- duplicate IDs within and across collections
- start map and spawn
- object, entity, sprite, item, ability, dialogue, quest, cutscene, shop,
  faction, document, sound, and music references
- exits, cells, bounds, regions, schedules, keys, and generated ownership
- recipe/provenance consistency and orphaned generated records
- archived continent-era keys
- unsupported cutscene actions

Unknown generator recipes are reported as unverifiable rather than treated as
proof that the baked map is invalid. Archived continent settings are errors.

### 7.2 Ordinary-map validator

validateOrdinaryMap is pure and independent of React, Zustand, and any generator.
It validates the same MapData used everywhere else.

The validator covers:

- schema, dimension, finite-number, coordinate, and duplicate-ID failures
- cell and authored/visual height consistency
- spawn footprint and reachability
- object/entity references and footprints
- schedules, items, containers, and key references
- key-before-lock progression and unavailable/blocked keys
- triggers, cutscenes, exits, required cells, required regions, and exit reachability
- door facing and approach space
- interactable access
- elevation connectors, stair landings, and required return routes
- safe starts, lethal routes, hazard exposure, and key-risk placement
- soft and hard complexity budgets

Reports contain valid, issues, metrics, reachableRegions, and progression.
Callers may specify a package, start spawn, required cells/regions/exits, a
return-route requirement, initial items, safe radius, lethal tags, and budget
overrides.

### 7.3 Default validator budgets

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

Hard-budget violations invalidate the map. Soft-budget violations warn.

## 8. Headless command and object systems

### 8.1 Command pipeline

The engine-core pattern is:

    command -> validation -> effect -> structured event

EventBus publishes the resulting events. V1GridWorld bridges package/save state
into the command interfaces.

Implemented command families include:

- movement and waiting
- inventory take/drop and item use
- doors and map transitions
- trigger dispatch
- object push, pull, drag, carry, and break
- surfaces, fire, environment, and sound
- NPC tasks, processes, and region simulation
- containers
- story-state mutations and dialogue choices
- commerce
- melee, abilities, combat sessions, turns, and enemy pulses

### 8.2 Object kernel

The core object model includes holders for world, inventory, containers,
equipment, hands, shops, caches, and destroyed objects. It uses stable instances,
transfers, transactions, and capped world facts.

Blueprint inheritance begins with:

    Object
      PhysicalObject
        Item
        Container
        Door

Parts can listen to, veto, emit, and cascade operations across inventories,
containers, equipment, hands, and components. This kernel is implemented core
infrastructure, but not every active gameplay screen has migrated to it.

## 9. Simulation, chemistry, and immersive systems

### 9.1 Physical simulation

Simulation snapshots can describe:

- material and object condition
- occupants and surfaces
- environmental fields
- manipulation affordances
- debug overlay data

Material properties include density, hardness, flammability, and related physical
attributes. Runtime systems cover surface traces, fire, smoke, light, sound,
environment fields, tasks, processes, workstations, and region simulation at
exact, nearby, aggregate, and dormant fidelity.

### 9.2 Chemistry

The chemistry field uses authoritative numeric axes:

- temperature
- saturation
- charge
- integrity
- foam
- fuel
- stability
- scorch
- frozen
- liquid volume
- vapor

Derived conditions are computed from these axes. Storage uses a sparse active
frontier with point values and run-length encoded runs.

Covered reactions and behaviors include fire spread, melting ice, water
dousing/scorch interactions, electricity through wet areas, foam, overlapping
states, authored seeds, height/viscosity flow, and actor exposure.

An ordinary map cell may provide `initial_chemistry` with material/liquid IDs
and bounded axis values. The runtime seeds that data through the same chemistry
path for hand-authored and dungeon-generated maps. It is not generation-only
state and persists through the normal chemistry/save contracts.

### 9.3 Immersive simulation

Core systems provide:

- a simulation scheduler
- layered tile state
- reaction rules
- perception and alerts
- global verbs
- tactical snapshots
- spatial inventory and world-state gates

The global verb catalog includes push, pull, throw, drop, stack, climb, burn,
douse, freeze, break, hack, wet, electrify, foam, and mimic.

The active built-in ability bar surfaces attack, shove, overwatch, wait, Attend,
Yell, Console, and most physical verbs. Hack and mimic remain core/catalog
capabilities rather than complete active gameplay loops.

## 10. Actors, behavior, perception, and combat

### 10.1 Behavior arbitration

NPC intent priority is:

1. incapacitated
2. survival
3. emotional
4. reactive
5. scheduled
6. idle

The arbiter manages commitments, consumes world signals, and records intent in
entity state.

### 10.2 Perception

Stimuli and alerts move actors through:

- oblivious
- suspicious
- searching
- combat

Perception can create tasks and feed reactive behavior.

### 10.3 Combat

The active initiative model queues the player and allied party members. Enemies
respond through enemy pulses when an ally acts; they are not ordinary active-turn
entries in the normal queue.

Combat supports:

- melee and authored abilities
- single, line, cone, cross, and block targeting
- range, facing, cover, elevation, critical, and condition modifiers
- forced movement and overwatch
- status application
- XP, levels, and pending level choices

Built-in statuses include poison, bleed, burn, regeneration, weaken, guard,
haste, slow, and stun.

Skill payload support:

| Payload | Status |
| --- | --- |
| Damage | Implemented in runtime and editor |
| Heal | Implemented in runtime and editor |
| Status | Implemented in runtime and editor |
| Summon | Disabled |
| Target tags | Schema-level/import legacy surface; nonempty unsupported values are rejected by current Studio support audit |
| Emotional impulse | Implemented where consumed by emotional systems |

## 11. Inventory, items, equipment, and economy

The active inventory is an 8 x 6 grid with drag, rotation, authored shape bounds,
bulk-derived fallback sizing, saved layout, weight, and encumbrance.

Supported item categories are consumable, weapon, armor, and key. Active item
effects can change:

- HP and MP
- energy and survival resources
- maximum HP
- attack, defense, and speed

Item damage payloads are disabled. World items, dropped items, containers, and
contents persist.

Shops support conditional stock and price modifiers. Final price is the rounded,
nonnegative result of base price times a multiplier plus a delta. Buy and sell
flows are implemented. Simulation processes can also influence stock and
shortage.

Equipment holders and transfers exist in core, but a complete universal
equipment gameplay/editor loop is deferred.

## 12. Story, dialogue, quests, triggers, and cutscenes

### 12.1 Conditions

General conditions support:

- switch values
- quest state
- item/count requirements
- party membership
- faction-reputation ranges
- time phase and hour ranges
- not, all, and any composition

Predicate lists use AND semantics.

### 12.2 Triggers

Implemented trigger types are:

- step
- interact
- on_load
- switch_change

switch_change is edge-driven. A gated trigger fires when its eligibility changes
from false to true. An ungated trigger watches any meaningful story-flag change.
Internal trigger-run flags are ignored, triggers queue while a cutscene is
active, and once behavior is honored. All trigger types use the same dispatch
path.

### 12.3 Dialogue and quests

Dialogue uses graphs and conditional options and can:

- set switches
- update quests
- launch a cutscene
- expose Attend tags and readings

Quests support authored objective types and persisted state. Barks support
speaker pairs, proximity, cooldowns, and state conditions.

### 12.4 Cutscene support

The runtime-support contract accepts:

- wait
- show_dialogue
- move_player
- move_entity
- set_switch
- teleport_player
- give_item
- remove_item
- set_player_sprite
- read_document
- heal_player
- restore_party
- open_shop
- give_currency
- remove_currency
- add_party_member
- remove_party_member
- label
- branch
- play_music
- play_sound
- screen_fade
- camera_pan
- adjust_faction_rep
- open_save_menu
- advance_clock
- modify_player_stats
- learn_skill
- set_entity_hidden
- chem_spill
- game_end

start_combat and custom remain schema scaffolds but are disabled. Imports and
exports reject them. If unsupported data reaches runtime, cutscene execution
stops and logs the failure instead of silently skipping it.

## 13. Alder emotional systems

Alder models five 0–100 axes:

- valence
- arousal
- grief
- reverence
- attachment

Actors have baselines and decay behavior. Axis combinations derive named
emotions and behavior signals and can cross-talk with physical state.

Grid regions can amplify grief, reverence, or attachment. A lens targets an
actor, radius, and multiplier. Save state stores actor emotional projection and
Alder summaries.

Glass and Attend provide attention/readout interactions with false, true, and
partial readings, composure, timeouts, effects, statuses, and switches. Attend,
Yell, and Console are active interaction surfaces.

## 14. Encounter contract

Encounter definitions are typed data, not a separate combat runtime. Resolution
produces ordinary EntityPlacementData and then hands ownership to normal NPC and
combat systems.

The resolver:

- uses deterministic placement IDs, counts, and facing
- validates area, difficulty, referenced entities, and capacity
- checks cells, reachability, collisions, hazards, cover, elevation, room, and
  line of sight
- scores roles such as frontline, ranged, support, ambush, and patrol
- maps supported NPC patrol data to schedules

Reinforcement records are validated, but timed reinforcement waves are deferred.
The encounter editor is disabled; definitions are currently source-authored or
imported under the support contract.

## 15. 3D renderer and presentation

### 15.1 Active renderer

Play and Map Editor both use GameRenderer3D. GameRenderer2D is legacy and must
not be imported by active paths.

Play uses:

- a perspective/isometric camera
- explore, tactical, and story camera profiles
- quarter-turn rotation
- adaptive device-pixel ratio
- performance-oriented Canvas settings
- fog and the dynamic Black Star light rig

The Map Editor supports perspective 3D and top-down orthographic views, grid
overlays, and validation overlays.

### 15.2 World presentation

The renderer handles:

- instanced cells and runtime geometry
- render/chunk radius management and occlusion fades
- models, primitives, meshes, hybrids, and imported assets
- sprites, billboards, animated GIF workers/caches/atlases
- actors, props, barks, popups, readouts, and intent indicators
- macro/fine fog and explored state
- chemistry/environment overlays
- targeting, range, denied-action, overwatch, and intent overlays

### 15.3 Screen effects

ScreenFX includes:

- ambient occlusion
- audio-reactive warp, glare, and motes
- brightness/contrast and hue/saturation
- chromatic aberration
- scanline, vignette, and noise

These effects are cosmetic and isolated behind an error fallback.

## 16. Studio authoring systems

### 16.1 Game editor

The Game editor covers identity, start location, time, player stats, appearance,
skills, party, music, portraits, switches, factions, barks, endings, and custom
chemistry setup.

### 16.2 Map editor

The active map editor provides:

- floor, wall, height, object, and entity tools
- dialogue and trigger placement
- stamps, regions, and brush controls
- spawns and exits
- items and containers
- schedules
- 3D/top-down modes
- ordinary-map lint overlays

Generated maps are edited with these same tools. Editing one marks its generation
metadata manuallyModified.

### 16.3 Content editors

Dedicated editors exist for dialogue, quests, entities, cutscenes, items,
documents, shops, and skills. Their visible controls are bounded by the runtime
support matrix rather than by every permissive schema field.

### 16.4 Visual asset tools

Model Maker supports parts, meshes, hybrid objects, GLB/GLTF import, materials,
decals, reference images, collision, and simulation properties. Procedural
starters in Model Maker are object-modeling tools and are unrelated to the
retired continent generator.

Sprite Creator supports pixel creation, import, AI-assisted assets, and animated
GIF workflows.

### 16.5 Simulation inspector

The Simulation mode is a diagnostic/read-only snapshot and overlay inspector,
not a general simulation-authoring editor.

### 16.6 Dungeon generator

The active Dungeons mode provides recipe, graph, floor-plan, 3D preview,
population, audit, and bake tabs. Authors can create/save/duplicate/delete
recipes, edit all main recipe constraint groups, install the Institutional Ruin
starter explicitly, generate with progress/cancel, select graph/room/floor
context, inspect structured diagnostics and ordinary-map reports, and bake an
audited bundle.

Named stage salts support topology/geometry/population rerolls and locks. A
bounded seed history and comparison surface lasts for the current Studio
session; it is not persisted package data. The preview uses the active 3D map
renderer. There is no separate dungeon renderer or pre-bake Play Mode.

Bake collision policy is explicit: cancel, create new IDs, or confirmed
replacement. Create-new remaps generated namespaces and cross-floor exits.
Replacement requires a typed confirmation, a separate acknowledgement for
manually edited generated maps, and produces the standard package backup. One
store transaction and one global Undo cover the full bundle; successful commit
opens the first floor in the normal Map Editor.

## 17. Studio/runtime support matrix

| Capability | Runtime | Editor | Import/export | Status |
| --- | --- | --- | --- | --- |
| Skill damage/heal/status | Yes | Yes | Yes | Implemented |
| Skill summon | No | No | Rejected | Disabled |
| Nonempty skill target tags | No complete support | No | Rejected | Disabled compatibility surface |
| Item stat/resource effects | Yes | Yes | Yes | Implemented |
| Item damage payload | No | No | Rejected | Disabled |
| All four trigger types | Yes | Yes | Yes | Implemented |
| Listed cutscene actions | Yes | Yes where applicable | Yes | Implemented |
| start_combat/custom cutscenes | No | No | Rejected | Disabled |
| Container locks | Yes | Yes | Yes | Implemented |
| Door locks | Yes | Partial/no dedicated workflow | Yes | Import/source-authored |
| Typed encounter resolution | Yes | No dedicated editor | Yes | Import/source-authored |
| Dungeon recipes and bake-time generation | Baked maps use ordinary runtime | Yes | Yes | Implemented |
| Runtime roguelike generation | No | No | No | Deferred |
| Summoned units/waves | No | No | No | Deferred |
| Equipment kernel | Core | No complete loop | Partial | Core |

## 18. QA suite and dungeon-readiness fixture

### 18.1 Explicit QA suite

The QA suite is installed explicitly; it is never an implicit package default.
Version 2.2.2 contains one hub plus exactly nine labs:

- four chemistry labs
- story lab
- combat lab
- emotion lab
- world lab
- movement lab

### 18.2 Readiness dungeon

The readiness fixture is a deterministic three-map ordinary-map journey:

- approach
- lower floor
- upper floor

The two dungeon floors contain 14 room IDs, a loop, an optional branch, a key,
a locked door, a locked cache, stairs/exits, dialogue and Attend content,
document/switch-change/step/interact triggers, hostile encounters, oil/water/fire
chemistry, a pushable crate, and a breakable crate.

The headless journey verifies:

- entry, transitions, return, exit, and re-entry
- dialogue, story switches, switch-change triggers, Attend, documents, and quests
- rejected lock access without a key
- key acquisition, unlock/open, optional key consumption, and persistence
- container loot and world/drop inventory state
- object push and break deltas
- combat and entity death state
- chemistry changes
- fog/explored-state serialization
- package/save V2 round-trip and explicit slot round-trip
- generated provenance, manual-modification behavior, and generator-version
  independence
- fine-grid materialization

The automated test seeds explored cells to verify persistence. A manual visual
smoke pass is still appropriate for final renderer/UI acceptance.

This fixture remains a hand-assembled readiness oracle. It is separate from the
active recipe-driven generator and is useful for proving runtime/save contracts
independently of generation algorithms.

## 19. Verification commands

The generic release gate is:

    npm run verify

It aliases the descriptive command:

    npm run verify:dungeon-readiness

It runs:

1. type checking
2. linting
3. strict client and server builds
4. all automated test suites
5. all aggregate audits
6. fog and save profiles

Useful focused commands include:

    npm run typecheck
    npm run build
    npm run verify
    npm run test:dungeon
    npm run audit:dungeon
    npm run audit:dungeon-seeds -- --count N --recipe ID --stage topology|embedding|full
    npm run profile:dungeon
    npm run test:map-contract
    npm run test:map-validator
    npm run test:save-roundtrip
    npm run test:encounter-contract
    npm run test:studio-runtime-support
    npm run audit:references
    npm run audit:legacy-imports
    npm run audit:studio-runtime-support
    npm run audit:map-validator

`test:dungeon` is the focused deterministic generator suite. `audit:dungeon`
runs one default Institutional Ruin acceptance audit. `audit:dungeon-seeds`
runs a configurable topology/embedding/full seed corpus and can emit JSON/CSV.
`profile:dungeon` records three default full runs against bounded-search,
structural, and estimated-save budgets. Command descriptions are not embedded
pass claims; run them on the current checkout for current evidence.

The build order is typecheck, client build, then server build. A successful
bundle may still report a non-fatal chunk-size warning.

## 20. Legacy, removed, and deferred systems

### Removed

- continent/procedural-region generator source
- continent generator UI and package settings
- continent-specific tests and aggregate scripts
- encounter editor mode

The archive marker is archive/procedural-continent-2026-07/README.md. It records
the retirement boundary without restoring the old runtime contract.

### Legacy

- GameRenderer2D
- Tile Maker
- Command Wheel
- supported compatibility parsing for older package/save shapes

Legacy source is retained only where compatibility or reference requires it.
The legacy-import audit prevents active code from reintroducing removed paths.

### Authored overworld content

Authored overworld maps, assets, and validation scripts remain valid content.
They are not the removed continent generator. The aggregate gate includes the
overworld-assets audit; the broader overworld audit remains a focused standalone
command.

### Deferred

- runtime roguelike/run-seed generation and procedural run saves
- natural cave, settlement/world, streaming megadungeon, and continent-scale
  procedural generation
- a dedicated visual room-template editor and selective map reconciliation
- persistent seed favorites and semantic geometry diffing
- timed reinforcement waves
- summon payload execution
- complete equipment gameplay/editor loop
- complete editor workflow for door locks
- active hack and mimic gameplay loops
- reintroduction of any continent-scale procedural system

Future generation work must build ordinary MapData through buildMap, pass the
ordinary-map validator, preserve deterministic IDs and provenance, and prove
save/load behavior. Runtime DGR work must save baked output or preserve exact
version/content/hash replay compatibility. It must not revive the retired
continent contract.

## 21. Authoritative source map

| Area | Primary source |
| --- | --- |
| Package and map schemas | src/schema/game.ts and src/schema/v2.ts |
| Package creation/normalization | src/schema/game.ts, src/store/engineStore.ts, and src/store/packageMigration.ts |
| Save schema and migration | src/schema/save.ts and save/store utilities |
| Coordinate projection | src/engine-core/gridCoordinates.ts, src/engine-core/fineWorld.ts, and src/engine-core/runtimeMapGrid.ts |
| Large-map materialization | src/engine-core/runtimeMapGrid.ts |
| 3D play renderer | src/components/GameRenderer3D.tsx, src/components/WorldOverlays3D.tsx, and src/components/ScreenFX.tsx |
| Map editor | src/components/MapEditor.tsx |
| Play orchestration | src/components/PlayMode.tsx |
| Headless engine | src/engine-core |
| World adapter | src/engine-core/v1Runtime.ts |
| Generated-map builder and diagnostics | src/generation-facing |
| Dungeon schemas, orchestration, algorithms, and presets | src/dungeonGen |
| Dungeon package bake | src/dungeonGen/packageBake.ts and src/store/engineStore.ts |
| Dungeon Studio and worker | src/components/DungeonGeneratorPanel.tsx and src/components/dungeon |
| Dungeon implementation record | docs/DUNGEON_GENERATOR_IMPLEMENTED.md |
| Ordinary-map validation | src/engine-core/mapReadinessValidator.ts and scripts/test-map-validator.ts |
| Reference audit | src/generation-facing/referenceAudit.ts and scripts/audit-references.ts |
| Studio support contract | src/engine-core/studioRuntimeSupport.ts and its test/audit scripts |
| Encounter resolution | src/generation-facing/encounterContract.ts and scripts/test-encounter-contract.ts |
| QA suite | src/data/testingMapSuite.ts, src/data/qaSuite, and src/data/qaSuiteInstaller.ts |
| Readiness dungeon | scripts/fixtures/readinessDungeonFixture.ts |
| Dungeon tests, audit, seed corpus, and profile | scripts dungeon entries and package.json |
| Release command | package.json |

Paths in the last table are navigation aids, not a substitute for searching
exports after refactors. The package scripts and TypeScript compiler are the
final integration authority.
