# Dungeon Generator — Implemented Systems Record

Status: current-source implementation record  
Applies to: bake-time `dungeon_v1` generation in the stabilized 3D engine  
Last audited: 2026-07-13

This document records the dungeon generator that is implemented in the current
repository. It is intentionally narrower than
`DUNGEON_GENERATOR_IMPLEMENTATION_SPEC_v1.md`: the specification remains useful
design context, while this record states the executable contracts, current
authoring surface, and known limitations.

The source, Zod schemas, package scripts, tests, and audits are authoritative if
they disagree with this prose. A command being listed here describes what it is
intended to run; it is not a claim that a particular invocation passed.

## 1. Locked integration boundaries

The implementation preserves five non-negotiable engine contracts:

1. The continent generator remains retired. The active generator produces
   local built dungeons; it has no continent, district, hub, or procedural-region
   runtime contract.
2. Generated floors are ordinary `MapData`. There is no procedural-dungeon map
   subtype and no dungeon-only Play Mode path.
3. Generation works at the authored macro-grid level. The existing runtime owns
   3 x 3 fine-grid projection, collision, simulation, rendering, and saves.
4. Generation is a bake-time authoring operation. Baked maps are package
   content, fully editable in the normal Map Editor, and never regenerated on
   load.
5. Validation is part of generation. A result with fatal/error dungeon
   diagnostics or a failing ordinary-map report is not eligible for the normal
   Studio bake action.

The top-level flow is:

    saved recipe + package libraries + seed
                    |
                    v
       deterministic abstract graph
                    |
                    v
        floor partition + embedding
                    |
                    v
       infrastructure and population
                    |
                    v
         ordinary MapData construction
                    |
                    v
      dungeon audits + ordinary-map audit
                    |
                    v
       explicit atomic package bake
                    |
                    v
          Map Editor / 3D Play Mode

Generation-core modules are independent of React, Zustand, DOM state, the QA
suite, and Play Mode. The Studio supplies snapshots and consumes results.

## 2. DG0–DG10 implementation ledger

This table distinguishes implemented capability from corpus-scale acceptance
evidence. The commands in section 19 are the executable evidence surface.

| Milestone | Current implementation |
| --- | --- |
| DG0 — safety and cleanup | Continent generation is absent from active routes and contracts; ordinary package import is non-destructive; the QA suite is explicit; Dungeons is an active Studio mode. |
| DG1 — schemas and deterministic seed context | Recipe, theme, archetype, template, profile, graph, embedding, result, diagnostic, and metrics schemas are package-integrated. Named RNG streams and canonical hashes are implemented. |
| DG2 — topology laboratory | Critical spine, branches, loops, secrets, constrained archetype assignment, gates, exact progression search, graph metrics/audits, and deterministic graph preview are implemented. |
| DG3 — spatial embedding | Centered occupancy grids, procedural rectangles, authored templates, bounded room-placement backtracking, corridor routing, widened corridor occupancy, and spatial audits are implemented. |
| DG4 — ordinary-map bake | Dungeon geometry is converted through the ordinary generated-map boundary with stable IDs, a start spawn, provenance, and ordinary package/map validation. |
| DG5 — authored templates | Rotatable template cells, connection sockets, population sockets, reserved paths, reference audits, and template instantiation are implemented. Template authoring is data/import based rather than a dedicated visual template editor. |
| DG6 — floors and transitions | Recipes generate one to three linked map floors. Cross-floor graph edges become paired transition records and paired ordinary exits. |
| DG7 — infrastructure, locks, rewards | Doors/gates, key sources, containers, rewards, secrets, and return-path information use ordinary runtime records and deterministic placement IDs. |
| DG8 — encounter population | Encounter profiles describe situations and actor roles; population uses ordinary entity placements and bounded threat/room budgets. This is not a replacement for the inactive Encounter Editor. |
| DG9 — hazards and chemistry | Hazard profiles author sparse ordinary `initial_chemistry`, source/response objects, and active-cell budgets. Runtime chemistry remains the existing chemistry system. |
| DG10 — Studio and bake workflow | Recipe CRUD, graph/floor/3D/population/audit/bake views, stage salts, locks/rerolls, session history/compare, worker progress/cancel, collision handling, backup-aware replacement, and one-step undo are implemented. |

The ledger does not claim that every aspirational experience in the design
specification is automatically produced by every recipe or seed. In particular,
the default recipe and seed/audit commands are the acceptance target; generator
schemas also permit smaller or differently populated recipes.

## 3. Data and package contracts

### 3.1 Eight authoring libraries

`GamePackageSchema` owns eight dungeon collections:

- `dungeon_recipes`
- `dungeon_themes`
- `dungeon_room_archetypes`
- `dungeon_room_templates`
- `dungeon_encounter_profiles`
- `dungeon_hazard_profiles`
- `dungeon_reward_profiles`
- `dungeon_narrative_profiles`

They are normal package data: they persist in the Studio workspace and package
JSON, receive Zod defaults when absent from compatible input, and are not a
second package envelope. Recipes reference these libraries by stable ID.

The Institutional Ruin installer appends missing records only. Existing records
win on ID collisions, and the installer does not replace maps or unrelated
content.

### 3.2 Recipe contract

A `DungeonRecipeDef` stores:

- identity: ID, name, description, recipe version, `generatorId: "dungeon"`,
  `generatorVersion: "dungeon_v1"`, seed, and per-stage salts;
- output: single map or linked floor maps plus a theme ID;
- scale: one to three floors, room-count and room-size ranges, macro-map bounds,
  and optional floor-height step;
- topology: critical-path, branch, branch-length, loop, secret, lock, optional
  objective, and return-path constraints;
- architecture: weighted archetype/template/procedural-builder pools, corridor
  width, room padding, diagonal policy, vertical transition types, and boundary
  style;
- population: optional infrastructure, ecology, encounter, hazard, reward, and
  narrative profile references;
- difficulty budgets: threat, depth growth, optional-branch multiplier,
  resources, hazards, and complexity;
- constraints: required archetypes/tags, forbidden adjacency, permitted verbs
  and materials, maximum attempts, and maximum embedding backtracks.

Schema refinements reject reversed or non-positive ranges, more than three
floors, multi-floor values in single-map mode, missing room sources, and
multi-floor recipes with vertical transitions disabled.

### 3.3 Graph and spatial result

The graph is coordinate-free. Nodes carry archetype, normalized depth, branch,
mandatory/secret flags, optional floor hint, tags, reward tier, and pressure
tier. Edges carry endpoints, kind, optional gate, one-way state, and tags. Gates
record type, required ordinary content ID, optional source node, mandatory state,
and key consumption.

The embedded result remains an intermediate generator artifact. It records
floor declarations, placed rooms, placed sockets, reserved cells, corridors,
and paired transitions. It is useful for previews and diagnostics, but it is not
accepted by Play Mode or persisted as a second runtime map type.

### 3.4 Result, diagnostics, and metrics

`DungeonGenerationResult` contains result metadata plus ordinary `maps` and
optional ordinary-map validation reports. Metadata includes success, recipe and
generator versions, seed, content-library hash, canonical result hash, graph,
embedding, baked IDs, structured diagnostics, attempt count, and metrics.

Diagnostics have `fatal`, `error`, `warning`, or `info` severity and a stage,
stable code, message, and optional node/room/map/cell/related-ID context.
Generation metrics can record stage and total duration, attempts, embedding
backtracks, rejection-code counts, map/room/actor/object counts, macro and
estimated fine cells, initial active chemistry cells, and estimated save bytes.

## 4. Determinism and canonical identity

### 4.1 Named RNG streams

`DungeonSeedContext` derives independent streams for:

- topology
- archetypes
- gates
- floor partition
- room shapes
- embedding
- corridors
- infrastructure
- encounters
- hazards
- rewards
- dressing
- secrets

A stream seed is derived from generator version, recipe ID, visible seed, stage,
stage salt, and attempt index. Requesting a stream always creates a fresh stream;
preview or audit consumption cannot leak into a later run.

Weighted choices sort candidates by ID before drawing, reject duplicate IDs and
invalid weights, and optionally emit choice traces. Shuffles start from a
canonical ID order. This prevents package array ordering from becoming hidden
random input.

### 4.2 Stage-specific rerolls

The Studio groups streams into topology, geometry, and population controls.
Locking a group preserves its current salts. Rerolling increments only the
unlocked streams in that group and persists those salts on the recipe. A stage
salt changes reproducibility identity; it does not mutate RNG state
imperatively.

The grouping is a UI convenience. It does not promise dependency-free partial
recomputation: generation still runs the pipeline from a recipe snapshot, and a
changed upstream stage can legitimately change downstream placement.

### 4.3 Content and result hashes

The dungeon content-library hash covers ordinary object, blueprint, entity,
item, encounter, ability, dialogue, document, cutscene, and simulation-material
libraries plus dungeon theme/archetype/template/encounter/hazard/reward/narrative
libraries. Mutable maps, package metadata, recipes, and saves are excluded.

The canonical bundle hash includes recipe identity, generator version, seed,
sorted stage salts, content-library hash, canonical graph, canonical embedding,
and each ordinary map output hash. Timestamps and diagnostics are excluded.

Each baked map also receives the existing ordinary generated-map `outputHash`.
These two hashes answer different questions: map output identity versus complete
dungeon-bundle reproducibility.

## 5. Topology and progression

Topology is generated before geometry:

1. Build the critical entrance-to-objective spine.
2. Add bounded optional branches.
3. Add requested loops between legal existing nodes.
4. Add secret nodes/routes.
5. Assign required and weighted room archetypes under eligibility, degree,
   uniqueness, critical-path, secret, objective, and adjacency constraints.
6. Place gates on critical edges where they cannot be bypassed, and place gate
   sources on reachable pre-gate nodes.
7. Run exact progression-state search and graph audits before accepting.

The topology audit checks requested counts/ranges, connectivity of required
nodes, entrance/objective identity, degree and archetype rules, forbidden
adjacency, one-way return behavior, gate consistency, and solvability.

Progression search tracks the player node, collected sources, key multiset and
consumption, objective completion, and required return. Its state exploration is
bounded rather than unbounded. Archetype assignment and topology feasibility
sampling also use explicit caps. Exhaustion produces diagnostics/rejection; it
does not silently remove required gates or mutate the seed.

Graph metrics include node/edge counts, critical path, branches, loops, secrets,
degree values, entrance-to-objective distance, longest optional route, gate
depths, backtracking distance, critical-path ratio, and pressure/reward curves.

## 6. Floors and map identity

V1 emits one to three ordinary maps. Floor partitioning assigns every graph node
to a meaningful floor and rewrites cross-floor edges as vertical connections.
Single-map recipes require exactly one floor; multi-map recipes require legal
vertical transition types.

Generated map IDs follow:

    dng_<normalized-recipe-id>_<seed-hash>_f<floor-index>

Floor identity is deterministic for the recipe/seed input. Collision resolution
during package bake may remap those IDs explicitly; remapping also updates all
generated namespaces and cross-floor exit targets.

Every vertical graph connection produces two paired transition records carrying
the same edge identity, opposite map/cell endpoints, and reciprocal paired IDs.
The map bake turns those records into ordinary cross-map exits/spawns so the
existing travel, save, and reference systems remain authoritative.

## 7. Spatial embedding and corridors

### 7.1 Occupancy and room placement

Each floor has centered macro bounds and a discrete occupancy grid. Its claim
model can distinguish room, padding, wall, socket, corridor, and reserved
ownership. Current recursive room placement claims room rectangles and padding;
corridor routing subsequently builds a deterministic blocked-cell set from the
placed rooms. A claim is accepted only when bounds and compatibility rules
permit it.

Room placement uses a deterministic graph-informed order and bounded recursive
backtracking. Candidate origins are derived around already placed neighbors,
with recipe room padding and archetype/template dimensions. The attempt stops at
`maxEmbeddingBacktracks`; failure is reported and can trigger the bounded outer
attempt strategy.

### 7.2 Procedural rectangles and templates

The `rectangular_room_v1` builder produces a simple built room footprint within
recipe/archetype size bounds. A weighted room-template pool can replace eligible
rectangles with authored geometry. A dungeon can therefore mix repeatable
landmark rooms with procedural connective architecture.

Template rotations are limited to 0, 90, 180, and 270 degrees. Rotation
transforms cells, connection sockets, population sockets, facing, bounds, and
reserved paths together.

Template audit checks schema legality, unique/in-bounds cells and sockets,
outward-facing boundary sockets, walkable connection locations, connected and
walkable reserved paths, and referenced ordinary objects/materials.

### 7.3 Corridor routing

Same-floor graph edges select placed connection geometry and route a cardinal
path with deterministic grid search. Routing respects room occupancy and bounds,
applies a turn cost, and widens the route to the selected recipe width. The
stored `corridor.cells` are the canonical widened occupied cells, not only a
visual centerline.

Spatial audit checks floor and room coverage, bounds, room overlap, corridor
bounds, and realization of graph edges. Failed routing is rejected rather than
cutting through arbitrary room interiors.

## 8. Ordinary-map construction and infrastructure

The bake stage converts each embedded floor into authored macro cells and
ordinary placements. The resulting map passes through `buildMap`, which:

- parses `MapDataSchema`;
- requires positive integral dimensions;
- requires stable generated IDs for spawns, object/entity/item/container
  placements, triggers, exits, and regions;
- enforces the `dg:<normalized-map-id>:` generated namespace;
- canonicalizes collection order; and
- calculates/verifies the ordinary map output hash.

Built geometry uses active macro cells, walkable floors, blocking boundaries
around walkable geometry, room IDs, terrain and object references from the
selected theme, corridor cells, doors/gates, a deterministic entrance spawn,
and paired transitions. Generated doors, keys, containers, items, actors,
narrative objects/triggers, and exits use their ordinary package schemas and
runtime behavior.

Map generation metadata records generator/recipe versions, seed, output hash,
generation timestamp, manual-modification state, stage salts, content-library and
canonical-result hashes, bundle/floor identity, attempt index, and optional
source snapshot hash. The baked map is authoritative even if generator code
changes later.

## 9. Population, encounters, and ecology

Population is profile-driven and consumes its own deterministic streams after
topology/geometry. Current generic placement selects legal walkable room
interiors, excludes reserved paths and already occupied cells, and filters rooms
by graph/archetype tags. Template population sockets are transformed and
retained by the template system, but the generic v1 encounter/reward/hazard/
narrative passes do not consistently prioritize every socket kind.

Encounter profiles describe situations rather than a single undifferentiated
enemy table. A situation can reference an ordinary encounter or explicit
ordinary entity-role slots, and can require entry count, cover, elevation,
hazards, pushables, patrol/reinforcement potential, room tags, pressure, and a
threat cost. Profile ratios cap combat-room density and reserve quiet rooms.

Placed actors are ordinary `entity_placements`. The generator does not own a
new AI controller, combat system, faction model, schedule format, or encounter
runtime. Existing engine behavior and combat audits remain authoritative.

The recipe includes an ecology profile slot for forward compatibility. V1 does
not implement an autonomous persistent ecology simulation or restocking model;
its current population output is the initial ordinary map state.

## 10. Hazards, chemistry, and physical situations

### 10.1 Ordinary initial chemistry

`CellSchema.initial_chemistry` is an ordinary authored map field, not a
generator-only payload. It can specify material/liquid references and bounded
temperature, saturation, charge, integrity, foam, fuel, stability, scorch,
frozen state, liquid volume, and vapor. Runtime map initialization consumes the
same field for hand-authored and generated maps.

Hazard profiles convert camel-case generator values to this ordinary snake-case
map contract. The existing package reference audit validates material and liquid
IDs.

### 10.2 Hazard profiles

Hazard patterns define kind, tags and room eligibility, weight, budget cost,
active-cell count, initial chemistry, source and response objects, required
verbs, critical-path policy, and optional alternate-route requirement. V1 kinds
include flood, electrified water, flammable debris, fire, gas, ice, foam, and
unstable structure.

Current placement excludes entrance-tagged rooms and enforces room ratio, hazard
budget, required-verb availability, tag/critical-path eligibility, and maximum
initially active cells. `safeStartRadius` and `requiresAlternateRoute` remain
profile intent; the normal safe-start/reachability audit is the current global
safety backstop rather than a complete pattern-specific geometric proof. The
generator creates an initial systemic situation; subsequent liquid, fire, gas,
electricity, freezing, foam, damage, actor exposure, and save deltas are owned by
the existing simulation runtime.

The generator does not guarantee that every supported hazard kind appears in
every result. Profile eligibility, budget, references, geometry, seed, and audit
constraints determine which patterns can be placed.

## 11. Rewards, secrets, and narrative dressing

Reward profiles provide depth ranges, weighted ordinary item pools, item-count
ranges, resource costs, key items, container objects, and guaranteed resource
room counts. Generated items and containers use stable placement IDs and the
ordinary inventory/container/save systems.

Secret graph nodes and edges are part of topology, not visual-only decoration.
The generator records them in graph/embedding diagnostics and realizes their
geometry through the same occupancy and corridor contracts. Discovery behavior
is limited to ordinary doors, objects, tags, triggers, and authored runtime
capabilities; there is no hidden procedural runtime subsystem.

Narrative profiles select authored traces. A trace can reference an ordinary
document, object, entity, dialogue, or cutscene and constrain room/placement
tags. V1 does not generate prose, dialogue graphs, or quests with an AI model.
It deterministically dresses a dungeon with existing package content.

Alderamontico-specific records can be selected by a theme/profile, but the core
generator is setting-neutral and does not require emotional, Grid, Glass, or
Attend state.

## 12. Audit boundary and bake eligibility

Generation produces structured stage diagnostics throughout recipe resolution,
topology, progression, floor partition, embedding, corridors, infrastructure,
population, simulation, navigation, and bake.

The Studio then runs `validateOrdinaryMap` on every produced `MapData`, using a
preview package that contains the generated bundle and the recipe return-path
requirement. Normal bake is enabled only when:

- `result.success` is true;
- at least one ordinary map exists;
- no dungeon diagnostic has fatal/error severity; and
- every ordinary-map report is valid.

Warnings and informational diagnostics remain visible. They do not become
silent repair instructions.

The audits cover the implemented surfaces, including schema and reference
resolution, graph counts/connectivity/progression, bounds/overlap/edge
realization, paired transitions, stable IDs and generated namespaces, placement
legality, budgets, initial chemistry limits, and ordinary-map reachability.

This boundary deliberately reuses the normal map validator. A generator-specific
preview cannot declare a map playable while the ordinary runtime contract
rejects it.

## 13. Retry, repair, cancellation, and failure

Generation is bounded by `maxGenerationAttempts` and
`maxEmbeddingBacktracks`. Attempt index is part of RNG derivation, so a retry is
deterministic and replayable rather than an unrecorded mutation.

Stage failures reject the current attempt. The current orchestrator then starts
a new complete topology-to-audit attempt with the next deterministic attempt
index; it does not cache a successful upstream stage for a stage-local retry.
Embedding still performs local backtracking, and corridor routing searches
alternate legal paths within an attempt. The implementation does not clip rooms,
ignore blocked paths, delete required gates, or place required content in
inaccessible cells as an invisible repair.

When bounds are exhausted, generation returns/throws a structured failure that
identifies stages and rejection codes. A partial graph/embedding may be useful
for diagnostics, but failure does not become bake-eligible.

Studio generation normally runs in a Vite module Web Worker. Progress messages
report stage, attempt, completed/total stages, and text. Cancel terminates the
worker. A main-thread fallback exists only when the browser cannot construct the
worker; cancellation is checked through the core callback in that path.

Cancellation is not part of canonical identity. Wall-clock timing appears only
in metrics and does not influence random choices or hashes.

## 14. Studio authoring surface

AppShell exposes the active `Dungeons` mode. Its seven views are:

- Recipe — create, select, edit, validate, save, duplicate, and delete recipes;
- Graph — deterministic node/edge/gate preview with linked room selection;
- Floor Plan — floor selection, room footprints, widened corridor cells, and
  transitions;
- 3D Preview — generated ordinary maps rendered through `GameRenderer3D`;
- Population — inspection of generated actors, objects, items, containers,
  hazards, and narrative records;
- Audit — dungeon diagnostics, metrics, and ordinary-map reports;
- Bake — package collision planning and the explicit commit action.

The recipe editor covers identity, output, scale, topology, architecture pools,
profile selection, difficulty budgets, and constraints. It validates through the
same Zod schema used by package parsing.

The generator offers a non-destructive `Institutional Ruin` starter-content
installer. It does not silently seed every empty package and does not install or
replace the QA suite.

### 14.1 History and comparison

Successful/failed generation results can be retained in a bounded session
history for comparison and restoration. Comparison exposes reproducibility
identity and metrics; restoring uses the saved recipe snapshot.

History is intentionally session-only. It is not a package favorites library and
does not survive a page reload. Saved recipes and baked maps do survive through
their normal package paths.

### 14.2 Preview authority

Graph, plan, population, and 3D views are previews. They do not mutate package
maps. The 3D view renders the generated ordinary-map snapshot through the active
renderer; it is not a second renderer or a Play Mode fork.

There is no special pre-bake gameplay session. After baking, the ordinary Map
Editor and Play Mode are the gameplay test surface.

## 15. Package bake and collision safety

Package bake is a two-step pure plan/apply operation followed by one store
commit. Planning parses the source package and generated maps, rejects duplicate
incoming IDs, reports collisions and provenance/manual-edit state, and suggests
collision-free IDs.

The collision policies are:

- Cancel — leave the package unchanged; selected by default when collisions
  exist.
- Create new IDs — recommended; retain existing maps, remap the full generated
  namespace and cross-floor targets, rehash provenance, and append the bundle.
- Replace — replace only colliding IDs after an explicit checkbox and typed
  phrase. Manually edited generated maps require a second acknowledgement.

Confirmed destructive replacement uses the standard package-migration JSON
backup. An unconfirmed replacement returns without applying the proposed
package.

The store commit parses the final package, asserts the active Studio runtime
support contract, pushes exactly one global undo snapshot, clears redo, selects
the first baked floor, and opens the normal Map Editor. One Undo reverts the
whole multi-floor bake.

Baking never installs QA content, deletes unrelated maps, or changes the
start-map reference implicitly.

## 16. Editing, provenance, and regeneration

Every generated map uses the existing `MapGenerationMetadata`:

- generator ID/version;
- recipe ID/version;
- seed;
- ordinary map output hash;
- generation timestamp;
- `manuallyModified`; and
- optional source snapshot hash;
- optional stage salts, content-library hash, and canonical bundle hash; and
- optional bundle ID, floor index/count, and attempt index.

Ordinary Map Editor updates mark generated maps manually modified. Automatic
regeneration is disallowed for non-generated or manually modified maps. The
Studio collision dialog additionally protects replacement with explicit
confirmation and backup.

Generated provenance is descriptive and protective, not runtime authority.
Opening a map, loading a save, importing a package, or changing generator code
never triggers generation.

## 17. Save and runtime behavior

After bake, existing systems own all state:

- maps and floor transitions use normal map travel;
- actors use normal entity state, behavior, combat, and placement identity;
- doors/keys/containers/items use ordinary persistent stable IDs;
- chemistry uses normal initial seeding and save deltas;
- triggers, dialogue, documents, cutscenes, switches, quests, and factions use
  their existing contracts;
- fog, explored cells, moved/broken objects, inventory, and map deltas use the
  normal save envelope.

No second dungeon save format exists. Saves do not need a recipe to reload a
baked dungeon. Existing saves can contain deltas keyed to map and placement IDs,
which is why replacing an already played map bundle is explicitly destructive.

Runtime roguelike generation is not implemented. If introduced later, it must
either save the baked bundle or retain exact generator-version/content-hash
replay compatibility; current bake-time provenance is not by itself permission
to recreate old runs with new algorithms.

## 18. Default preset: Institutional Ruin

The optional starter preset installs:

- one two-floor recipe with 16–20 rooms, 8–10 critical nodes, 2–3 branches of
  length 2–3, one loop, 1–2 secrets, one key lock, 64 x 64 macro floors, and
  5–10-cell rooms;
- sixteen built-room archetypes covering entrance, connectors, landmark,
  combat, hazard, manipulation, resource, rest, archive, secret, vertical,
  story, objective, shortcut, and service roles;
- one rotatable authored 7 x 7 entrance/landmark template plus the procedural
  rectangular builder;
- one theme mapped to ordinary floor, wall, door, container, crate, ladder, and
  terminal objects;
- three encounter situations;
- flood, electrified-water, flammable-debris, gas, and foam hazard patterns;
- depth-tiered ordinary items, a key pool, and containers; and
- three authored narrative traces.

The recipe seed defaults to `institutional-ruin-001`; authors can change it. Its
stage salts begin empty. The preset exercises built architecture and existing
engine assets. It does not install missing ordinary assets by magic: package
reference/audit failures remain visible if the referenced base content is not
present.

## 19. Validation and profiling commands

The dungeon-specific command surface is:

    npm run test:dungeon
    npm run audit:dungeon
    npm run audit:dungeon-seeds -- --count N --recipe ID --stage topology|embedding|full
    npm run profile:dungeon

`test:dungeon` is the focused deterministic unit/integration suite for schemas,
RNG, topology, progression, templates, embedding, full generation, and package
bake.

`audit:dungeon` performs one default Institutional Ruin end-to-end generation
and package/ordinary-map acceptance audit.

`audit:dungeon-seeds` runs a configurable seed corpus. It accepts a count,
recipe ID, and topology/embedding/full stage. Optional `--json [file]` and
`--csv [file]` outputs record the corpus summary. Rejected, blocking, or
nondeterministic accepted results make the command nonzero.

`profile:dungeon` profiles three default full generations and checks recorded
bounded-search, structural, and estimated-save budgets.

The focused commands complement, rather than replace, the repository gates:

    npm run typecheck
    npm run lint
    npm run build
    npm run test:all
    npm run audit:all
    npm run verify

No pass/fail transcript is embedded in this document. Run the commands on the
current checkout for current evidence.

## 20. Honest v1 limitations and future DGR boundary

Current limitations are explicit:

- The generator targets built/excavated architecture. Natural cave erosion,
  settlement/world generation, infinite streaming, and megadungeon sectors are
  not implemented.
- V1 topology generation emits key gates. Switch, breakable, verb, and soft gate
  types exist in the data model/progression contract but are not selected by the
  current graph generator.
- Room and corridor geometry is flat (`y = 0`) within each map. Verticality is
  represented by linked floors and paired exits; recipe `floorHeightStep` and
  themed stair-object dressing do not currently create stacked/elevated room
  geometry.
- Generation is bake-time only. There is no runtime run seed, permadeath loop,
  procedural run save, or live regeneration.
- The template system is schema/data driven. There is no complete dedicated
  visual room-template editor.
- The population tab inspects output; it is not a standalone graphical encounter
  or ecology editor.
- Session history/favorites do not persist across reload, and comparison is
  hashes/metrics/preview rather than a semantic geometry diff/reconcile tool.
- Reroll controls change named stage salts, but do not preserve hand-edited
  portions of a previously baked map. Selective regeneration/reconciliation is
  not implemented.
- There is no selected-room-only regeneration, automatic repair over manual
  edits, or pre-bake Play Mode.
- Narrative population selects authored records; it does not generate prose,
  dialogue, quests, or assets.
- Ecology is initial population, not a persistent restocking/faction ecosystem.
- Encounter profiles do not implement timed reinforcement waves or summon
  payload execution that the ordinary runtime itself does not support.
- Schemas support multiple hazard families, but any particular recipe/result is
  constrained by available ordinary content, budget, room eligibility, and
  audit legality.
- Template population socket kinds, hazard `safeStartRadius`, and per-pattern
  alternate-route intent are not yet exhaustively enforced by every population
  pass; ordinary placement/reachability audits remain the safety boundary.
- Several recipe fields are validated/persisted design surface rather than active
  algorithm knobs: diagonal routing remains cardinal, `boundaryStyle` does not
  select a separate wall builder, infrastructure/ecology profile IDs have no v1
  profile libraries, and required tags/permitted materials/complexity and
  optional-branch multipliers are not all consumed as independent generation
  constraints.
- Corpus acceptance and performance are command results, not guarantees inferred
  from the presence of code.

Future DGR work may add runtime roguelike generation only after the bake-time
pipeline is stable. It must preserve exact version/content/hash identity or save
the baked output, keep ordinary `MapData` as runtime content, and must not revive
the continent generator.

## 21. Source map

| Area | Primary source |
| --- | --- |
| Package, map, chemistry, provenance schemas | `src/schema/game.ts` |
| Dungeon schemas and public types | `src/dungeonGen/schema.ts`, `src/dungeonGen/types.ts` |
| Named deterministic streams | `src/dungeonGen/seedContext.ts` |
| Canonical graph/embedding/content/bundle hashes | `src/dungeonGen/canonical.ts` |
| Structured diagnostics | `src/dungeonGen/diagnostics.ts` |
| Topology, archetypes, gates, graph audit | `src/dungeonGen/topology/index.ts` |
| Exact progression search | `src/dungeonGen/topology/progressionAudit.ts` |
| Floor partition, room placement, corridor realization | `src/dungeonGen/embedding/index.ts` |
| Occupancy and deterministic grid search | `src/dungeonGen/embedding/occupancy.ts`, `src/dungeonGen/embedding/gridSearch.ts` |
| Template validation and rotation | `src/dungeonGen/templates/index.ts` |
| Encounter, reward, narrative, and chemistry population | `src/dungeonGen/population/index.ts` |
| Ordinary map geometry, doors, spawns, and paired exits | `src/dungeonGen/bake/index.ts` |
| Recipe/reference and ordinary-map/package validation | `src/dungeonGen/validation/index.ts` |
| Institutional Ruin content | `src/dungeonGen/presets/institutionalRuin.ts` |
| Bounded generation orchestration | `src/dungeonGen/generateDungeon.ts` |
| Public generator exports | `src/dungeonGen/index.ts` |
| Pure package-bake collision handling | `src/dungeonGen/packageBake.ts` |
| Ordinary generated-map boundary | `src/generation-facing/mapContract.ts` |
| Generated IDs and map hashes | `src/generation-facing/deterministicIds.ts` |
| Ordinary-map validator | `src/engine-core/mapReadinessValidator.ts` |
| Reference audit | `src/generation-facing/referenceAudit.ts` |
| Runtime chemistry seeding | `src/engine-core/v1Runtime.ts` and chemistry/grid adapters |
| Studio mode and orchestration | `src/components/AppShell.tsx`, `src/components/DungeonGeneratorPanel.tsx` |
| Recipe/graph/floor/3D/population/audit/bake views | `src/components/dungeon/` |
| Generation worker | `src/components/dungeon/dungeonGenerator.worker.ts` |
| Atomic package commit/manual-edit marking | `src/store/engineStore.ts` |
| Dungeon tests and audit/profile harnesses | `scripts/` dungeon test/audit/profile entries and `package.json` |

Paths are navigation aids. Search current exports after refactors and use the
compiler plus executable commands as the final integration authority.
