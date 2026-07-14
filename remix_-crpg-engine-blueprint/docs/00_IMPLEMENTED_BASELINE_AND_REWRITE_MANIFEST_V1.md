# Implemented Baseline and Rewrite Manifest v1

**Status:** Coordination document for the final implementation-grounded rewrite; imported into this repo and updated to match the current fog-of-war and `engine-core` foothold.  
**Starting point:** The current 2D codebase after the 3D-to-2D conversion, with package schema literal `crpg_engine_game_package_v1` and save schema literal `crpg_engine_save_v1`.  
**Purpose:** Keep the specification stack honest by grounding every target document in what currently exists.

## 1. What currently exists

The current codebase is a React 19 + TypeScript + Vite application using Zustand stores, Zod validation, Tailwind CSS, and a flat top-down canvas renderer. The active play and edit paths are 2D. Three.js-era dependencies and files remain as dead code or inactive imports, but the current renderer is `GameRenderer2D`.

The application mounts `AppShell` through `App.tsx`. The studio currently supports Home, Map Editor, Play, Tile Maker, Sprite Creator, Dialogue Editor, Quest Editor, Entity Editor, Event/Cutscene Editor, Item Editor, Document Editor, Shop Editor, Skill Editor, and a Simulation S0-S8 overlay page.

The main stores are:

- `engineStore.ts` for authoring state, package import/export, undo/redo, IndexedDB persistence, and package normalization;
- `playStore.ts` for runtime save state, map deltas, and save slots;
- `fxStore.ts` for transient feedback;
- `visualSettingsStore.ts` for renderer quality and the persisted Play Mode fog-of-war toggle.

The package schema already contains metadata, settings, maps, object library, sprite library, entities, dialogue, documents, quests, cutscenes, switches, items, abilities, shops, barks, factions, endings, encounters, validators, and simulation authoring records. Factions/endings/encounters remain lighter extension points.

Maps already contain cells, spawns, object placements, entity placements, item placements, container placements, triggers, and exits. Cells already track walkability, line-of-sight blocking, height/visual height, terrain, region, room, hazard, infection, portal id, and surface tag. Movement and LOS already consume some of this data.

Runtime already supports direct movement, a virtual joystick, facing, adjacency interaction, doors, containers, ground items, map travel, world clock, dialogue, barks, quests, documents, cutscenes, triggers, conditions, same-map tactical combat, skill targeting shapes, items, inventory, shops, entities, party members, schedules, faction reputation, progression, audio, FX, Play Mode fog of war, and a Studio authoring suite.

A small `src/engine-core/` foothold now exists with deterministic RNG, a structured event bus, registries, a command/effect/event dispatch pipeline, a reference in-memory grid world, a v1 package/save grid adapter, story services, core combat services, package/save v2 migration helpers, a numeric-axis grid chemistry core, the doc 02 systemic interaction-kernel milestone, the doc 03 Systems-Heavy Grid Simulation S0-S8 MVP, the doc 04 Stage 1 object/Part/event MVP, the doc 04 Stage 2 tile-layer/scheduler MVP, the doc 04 Stage 3 reaction MVP, the doc 04 Stage 4 perception MVP, the doc 04 Stage 5 global-verb MVP, the doc 04 Stage 6 tactical combat MVP, and the doc 04 Stage 7 spatial-inventory/world-state MVP. `PlayMode.tsx` and Zustand still own presentation and high-level orchestration, but live movement, item transfer, doors, containers, object manipulation, dialogue, shops, barks, endings, quest-objective completion, combat sessions/turns/enemy turns/opportunity attacks/melee/skills, kernel world facts, save-backed fog, chemistry elemental verbs/ticks, simulation material/condition/trace/field/task/process/regional records, simulation debug overlays, resolved object/Part snapshots, object Part consequences, Stage 2 tile/scheduler state, Stage 3 reaction consequences, Stage 4 perception alerts/stealth HUD/barks/audio/popups, Stage 5 global verbs, Stage 6 forced-movement/cover/flank/overwatch/telegraph combat surfaces, Stage 7 inventory/survival/world-state HUD/gating/restoration surfacing, and S6 workstation process prompts now commit through or derive from the adapter where implemented.

The former Praxis casework layer was removed after proving too close to a second dialogue system: its standalone design doc, schema registries, NPC profile fields, save state, engine module, Studio page, Play Mode wheel, Casebook overlay, dialogue claim-presentation UI, condition gates, default content, package normalization backfills, and public engine exports are gone. `adapt_simulation_semantics` remains only as a neutral simulation command that emits `simulation_semantics_adapted` without creating interpretation records.

`04_GRID_IMMERSIVE_SIM_ENGINE_ROADMAP_V1.md` is now the next implementation roadmap, after the simulation doc. It turns the current base/kernel/simulation footholds toward a grid immersive-sim architecture: data-driven object Parts, one global event bus, layered tile properties, a unified AP/energy scheduler, deterministic material reactions, systemic light/sound perception, global verbs, same-simulation tactical combat, spatial inventory, and persistent world-state consequences.

`05_ALDERAMONTICO_STATE_SYSTEM_CONTRACT_V1.md` is installed as the game-specific state-system contract layered after the neutral engine roadmaps. Its physical-axis target is now partially grounded by `src/engine-core/chemistry.ts` and `src/engine-core/chemistryRuntime.ts`: per-cell numeric axes persist in `PlaySave.chemistry`, elemental verbs push axes, derived physical conditions project back into renderer-visible surface/environment tokens, chemistry advances over turns, and `scripts/test-chemistry.ts` proves fire spread, ice melt, dousing/scorch, wet conduction, foam smothering, overlapping states, and surface seeding. Its first emotional/Grid implementation slices now exist in `src/engine-core/alderamonticoState.ts`: per-actor Valence/Arousal/Grief/Reverence/Attachment axes, derived emotional regions/named states, physical-to-emotional crosstalk, Attend-gated Condition read-outs, the Grid's dominant-philosophy-axis amplification, authored Grid-region advancement, lens multipliers, Glass accretion at sustained extremes, `PlaySave.alderamontico_state`, v2 save preservation, and `scripts/test-alderamontico-state.ts`. Play Mode now has MVP Attend/read-out and Grid-pressure surfaces: a faced-actor Attend button, condition panel, emotional axis bars, reliability, behavior, physical labels, Glass readout, current-region Grid chip, attended-actor Grid-pressure readout, and log/audio feedback. Emotional verbs/skills now exist end to end (authored `emotional_impulse` skills plus built-in Yell/Console wheel verbs with binding-extreme resistance), combat and exploration AI both read emotional behavior modes, emotional axes decay toward per-actor baselines, and chemistry cells unify actor/tile physical axes (NPCs standing in fire read as On Fire, take statuses, and panic). Richer region/lens authoring overlays and unifying the older tile-layer exposure path remain target work.

`06_EMOTIONAL_LAYER_GRID_ATTEND_SPEC_V1.md` is implemented at engine/test-map MVP scope. Doc-06 `actor_emotional_states` is a compatibility/projection over the current `alderamontico_state.actors` runtime. The Attend-node data/command path is live through authored `attend_node` data, `alderamontico_state.active_attend`, `alderamontico_state.attention`, and `dispatchAlderamonticoAttendNode` / `dispatchV1AttendNode`; Play Mode now opens a compact reading picker for authored targets, surfaces attention/composure/hidden-reading pressure, resolves selected readings, and applies Glass residue on timeout. Attention remains on the runtime's 0..100 axis scale internally while Play and authored design gates can present it as 0..9. The default Training Bot ships a false/true/partial Attend test node. Surface-vs-attended Condition deception is explicit in the read-out, Grid feed accumulates in `alderamontico_state.grid.fed` / `fed_by_region`, and authored region emotional profiles are live through `emotional_profile.baseline_axis_offsets` plus Map editor controls. It explicitly refuses a new physical-axis system, global emotional field, voice mechanic, or ECS rewrite.

`07_OVERWORLD_DEVELOPMENT_PLAN_V2.md` is installed as the next game-content production plan, not as an already implemented runtime layer. It defines the phased build for the Threefold March overworld after doc 06: active generated square-faced oblique terrain/structure/barrier/prop skins, the existing 16x16 pixel library as fallback/entity/overlay source, a complete overworld asset manifest, nine named March areas, stitched greybox traversal, systemic population rules, day/night and emotional-profile wiring, and `audit-overworld` integration. It supersedes the earlier overworld v1 population outline by folding it into Phase 4. Phase 0-1 is now grounded by `src/data/overworldAssets.ts`, `src/data/obliqueTerrainAssets.ts`, `src/data/obliqueStructureAssets.ts`, `src/data/obliqueBarrierAssets.ts`, `src/data/obliquePropAssets.ts`, `src/data/generatedPlayerAssets.ts`, `scripts/extract-oblique-terrain-atlas.ts`, `scripts/extract-oblique-structure-atlas.ts`, `scripts/extract-oblique-barrier-atlas.ts`, `scripts/extract-oblique-prop-atlas.ts`, `scripts/extract-intercessor-player-atlas.ts`, and `npm run audit:overworld-assets`: the repo has a locked 32-color fallback palette, 43 pixel terrain tiles, 38 interactive/object sprites, 38 actor/entity definitions with directional frames and emotional baselines, player state overlays, generated palette/manifest JSON, a style reference sheet, a full pixel contact sheet, 16 cropped/loop-conditioned `oblique_tile_*` terrain PNGs under `/public/overworld/generated/oblique/terrain`, 16 square-faced `oblique_structure_*` wall/door PNGs under `/public/overworld/generated/oblique/structure`, 16 `oblique_barrier_*` fence/gate/window/hedge/screen/grate/barricade/Glass PNGs under `/public/overworld/generated/oblique/barrier`, 48 chroma-keyed `oblique_prop_*` object cutouts under `/public/overworld/generated/oblique/prop`, `/public/overworld/generated/oblique/prop_objects`, and `/public/overworld/generated/oblique/prop_exterior`, and 8 square-padded `generated_player_intercessor_*` directional idle/step player frames under `/public/overworld/generated/player/intercessor`. The playable preset object library now includes 32 new placeable object definitions for the object-pass and exterior-pass art: bed, bedroll, chair, table, bookshelf, oil lamp, well, rubble pile, ladder, shop counter, mechanism workbench, altar, cupboard, stove, broken statue, floor hatch, wind-bent tree, fallen log, mossy boulders, thorn bramble, reed clump, firewood pile, hay bales, rain barrel, broken field fence, plank pile, roof tile debris, chimney bricks, boarded window frame, broken door boards, grave cairn marker, and roadside shrine. The Intercessor player design reference is staged at `/public/sprites/player-pilgrim.png`; the first generated directional idle/step pass is wired as the default player sprite, and persisted packages/runs backfill legacy player sprite ids to `generated_player_intercessor_south_idle`. Phase 2 and the first Phase 3 greybox pass are now grounded by `src/utils/threefoldMarchMap.ts`, `docs/overworld/THREEFOLD_MARCH_GEOGRAPHY_V1.md`, `scripts/audit-overworld.ts`, and strengthened `scripts/audit-maps.ts`: all nine `map_march_*` zones exist with fixed sizes, edge spawns/exits, route skeletons, void margins, landmark placeholders, a Convening Stone/descent, persisted-package map backfills, and a default start at `map_march_convening#spawn_start`. The current March greybox visual version is `v2_cohesive_terrain`, replacing the original per-cell terrain sampler with broad readable terrain patches and refreshing stale March maps on load. The prior angled/isometric structure atlas is preserved only under `/public/overworld/generated/oblique/rejected/` and is not wired. Phase 4 population, Phase 5 wiring, and later expanded overworld audits remain to be built.

Game-specific canon and content documents live outside the numbered implementation stack. `docs/canon/alderamontico_world_bible_v1.md` is installed as the authoritative world reference for Alderamontico's cosmology, the Grid, Glass, peoples, philosophies-as-factions, and the Anchor. `docs/third_voice/the_third_voice_treatment_v2.md` and `docs/third_voice/the_third_voice_npc_scene_dialogue_writing_bible_v1.md` are installed as the Third Voice adventure/writing references: the treatment defines the Threefold March trial, its points of interest, the girl at the Stone, faction crises, convergence structure, and ending architecture; the writing bible defines the dialogue, bark, scene, NPC, faction-voice, and future AI-authoring standard for The Third Voice.

## 2. What is not yet true

The current system does not yet have:

- a fully adopted headless deterministic runtime core;
- a gameplay-wide command -> action -> effect -> event pipeline;
- ECS-style runtime entities;
- native v2 runtime consumption after import/export and save-slot normalization;
- named planes and true elevation mechanics;
- full actor-specific fog/belief maps beyond the Stage 4 alertness MVP;
- broad tuned/authored stealth encounters beyond the current systems test stealth-watcher lane;
- broader reaction types and broader authored-status content coverage (player-set overwatch now exists);
- full Alderamontico state-system surfacing: the headless emotional-axis/read-out substrate, doc-06 actor-emotional projection, Attend-node command/data path and Play Mode reading picker, Grid/lens region MVP, region emotional profile authoring, built-in Yell/Console emotional verbs, emotional decay toward per-actor baselines, combat + exploration AI driven by emotional-region queries, and chemistry-scope actor/tile physical-axis unification now exist, but broader authored content, final threshold tuning, and unification of the older tile-layer exposure path remain;
- equipment slots;
- loot tables;
- crafting;
- localization;
- plugin/mod system;
- deterministic replay;
- the later semantic/simulation expansions on top of the systemic interaction kernel: authored ownership/access rules, rich object-history Studio views, live equipment/hand gameplay, pull/drag/rotate/repair/barricade-specific verbs, and NPC behavior trees that consume awareness facts;
- actor-specific beliefs, relationship interpretation, and account/rumor propagation;
- full Play adoption of data-driven GameObject/Part blueprints across every interaction path, plus broader equipment/hand-slot cascade content;
- full Play adoption of the continuous AP/energy scheduler by exploration, combat, statuses, AI, and tile simulation;
- package-authored reaction tables beyond the current fixed Stage 3 rule table;
- full authored stealth AI behavior that consumes graduated alertness beyond the current perception/HUD/bark foothold.
- the authored Threefold March overworld from doc 07 beyond Phase 0-1: nine stitched areas, populated systemic set-pieces, seat/basin emotional-profile wiring, story hooks, expanded oblique object/entity art, and the new `audit-overworld` map-content gate.

The rewrite stack must not pretend these exist. It must define how to reach them from the current implementation.

## 3. Final document stack

The final implementation-grounded stack is:

1. **Grid-Based 2D CRPG Base Systems v3** - extracts and replaces the PlayMode/Zustand monolith with a deterministic headless grid runtime while preserving current 2D functionality.
2. **Systemic Grid Interaction Kernel v3** - turns current interactions into persistent object identity, grid-aware transactions, world facts, ownership/access, exposure, and object history.
3. **Systems-Heavy Grid Simulation v4** - current S0-S8 MVP foothold for material causality, physical condition, fields, traces, fire, fluids, light, sound, scent, routines, processes, economy, ecology, and deterministic simulation LOD.
4. **Grid Immersive-Sim Engine Roadmap v1** - the next implementation target: object/Part/event architecture, one scheduler, tile property layers, reactions, perception, global verbs, same-simulation combat, spatial inventory, and consequence systems.
5. **Alderamontico State System Contract v1** - the game-specific target for physical + emotional axes, Attend-gated Condition read-outs, Grid amplification, Glass residue, and emotion-driven behavior.
6. **Emotional Layer, Grid Operator & Attend v1** - the concrete completion spec for doc 05's distinctive layer: emotional-state persistence, Grid/lens operation, Condition read-outs, and attend nodes.
7. **Overworld Development Plan v2** - the phased content-production plan for the Threefold March: art standard, asset manifest, named geography, greybox traversal, population, wiring, and overworld audits.

Game/canon references live alongside the numbered implementation stack: `docs/canon/` for setting canon and `docs/third_voice/` for The Third Voice treatment and writing references. Studio v3 remains a companion target developed alongside every stage, not the current doc-07 slot.

## 4. Correct dependency order

```text
Current 2D codebase
  -> Base v3
  -> Kernel v3
  -> Simulation v4 MVP foothold
  -> Grid Immersive-Sim Engine Roadmap v1
  -> Alderamontico State System Contract v1
  -> Emotional Layer, Grid Operator & Attend v1
  -> Game-specific canon/content docs
  -> Overworld Development Plan v2

Studio v3 is developed alongside every stage and registers editors for installed modules.
```

The simulation layer now functions on base + kernel alone. Its semantic adapter is a neutral compatibility command that emits only simulation adapter counts. Kernel depends on base grid, entities, and command/effect/event registries.

## 5. Compatibility rules

- Do not create a second engine inside the Studio.
- Do not reintroduce a second dialogue/casework layer through simulation semantics; route player-facing interpretation through the normal dialogue, quest, journal, and event systems.
- Do not let simulation interpret meaning directly.
- Do not let kernel decide morality.
- Do not let base contain game-specific philosophical concepts.
- Do not let runtime-only features exist without authoring and validation plans.
- Preserve current content through migration adapters where feasible.
- Use exact schema version literals for compatibility boundaries.

## 6. Current-system-to-target map

| Current feature | Target owner | Migration direction |
|---|---|---|
| `GameRenderer2D` | Base + Studio | Preserve as initial renderer, later separate runtime camera/render API. |
| Play Mode fog of war | Base | Keep the renderer-local version, then migrate visibility/exploration memory into runtime state and saves. |
| `src/engine-core` | Base | Expand the existing RNG/event/registry/pipeline/v1-adapter foothold into the authoritative package/load/save runtime. |
| `PlayMode.tsx` | Base | Continue extracting into headless core + Play UI; movement, ground-item pickup, door opening, map changing, eligible trigger firing, container unlock/open state, container item transfer, dialogue option state effects, objective completion, combat sessions, initiative/turn advancement, targeting, enemy turns, opportunity attacks, melee attacks, skill casts, their save mutation, and their successful action costs where relevant are now bridged through the v1 adapter. |
| `engineStore.ts` | Studio | Preserve authoring store, migrate to project model. |
| `playStore.ts` | Base | Preserve save logic, migrate to runtime state service. |
| `ConditionEditor` and conditions | Base, later Kernel/Simulation extensions | Predicate evaluation is now a core story service; retired casework predicate controls were removed. |
| Cutscene actions | Base | Migrate to sequence commands/effects. |
| Doors/containers/items | Kernel | Convert to persistent object instances and transactions. |
| Map deltas | Kernel/Base | Migrate to object instance state and world facts. |
| Faction reputation | Base | Keep numeric rep as coarse access; add relationships later through normal dialogue/quest systems. |
| Surface tags/hazards/infection | Simulation | Use as seeds for fields/residues/conditions. |
| Grid chemistry axes | Simulation + Alderamontico state contract | Preserve the new numeric-axis chemistry core as the physical-state substrate; fold actor/entity physical axes into the same contract before adding emotional axes. |
| Sprite Creator/Tile Maker | Studio | Preserve and expand to asset studio. |

## 7. Rewrite quality bar

The rewritten docs must be implementation-grounded. Each major target system should answer:

- what exists now;
- what remains useful;
- what must be extracted or replaced;
- which layer owns the final system;
- what intermediate compatibility adapter is allowed;
- what acceptance slice proves the feature works.

## 8. Final implementation boundary

The next broad engineering step is now the Grid Immersive-Sim Engine Roadmap while continuing to close the base runtime extraction. The first implementation slice has established the data-driven object/Part + event core on top of the existing `engine-core`, kernel, and simulation footholds:

- data-driven GameObject/Part blueprint schema and resolver with inheritance from a root Object;
- object-local event dispatch through Parts, including veto-by-data and cascade dispatch for contained inventory, with equipment/hand-slot cascade resolution scaffolded;
- mapping current v1 items, containers, doors, object placements, material profiles, and kernel object instances into the new object/Part representation;
- initial deterministic typed event records reusing the current RNG/event/command spine;
- acceptance fixture: an interactive flammable crate can be authored in data, inherits physical Parts, reacts through Parts, commits save-backed world/simulation consequences, cascades fire into contained items, and supports a data-authored veto without a bespoke PlayMode branch;
- Studio bridge: the Simulation editor now surfaces object/Part, Stage 2 tile/scheduler, Stage 3 reaction, Stage 4 perception, Stage 5 global-verb, Stage 6 tactical-combat, and Stage 7 spatial-inventory/world-state summaries;
- Stage 2 MVP: `src/engine-core/immersiveSim.ts` derives and persists tile property layers from S0-S8 simulation snapshots and advances a serializable shared energy scheduler with `EndAction`, `EndSegment`, and `EndTurn` records;
- Stage 3 MVP: deterministic reaction rules now resolve oil+fire, water+fire into steam, electricity+water into conductive water, poison+fire into toxic gas/smoke, cold+water into ice, and acid+material into corrosion consequences; fire/electricity/gas propagation, actor status bridges, and Studio reaction inspection are implemented;
- Stage 4 MVP: light/sound/fire/gas/player-visibility stimuli can produce NPC alertness, investigation/report tasks, durable perception facts, LOS/viewcone/facing checks, scheduler-driven perception advancement, give-up facts, stealth feedback state, Play Mode stealth-gem/NPC-alert surfacing, escalation/decay barks, warning audio, popups, logs, and an authored stealth-watcher test lane;
- Stage 5 MVP: `IMMERSIVE_GLOBAL_VERBS` exposes the canonical verb registry; `push`, `pull`, `throw`, `drop`, `stack`, `climb`, `burn`, `douse`, `freeze`, `break`, `hack`, `wet`, `electrify`, `foam`, and `mimic` global verbs write object, item, access, traversal, actor-form, surface, and field properties, then resolve through the Stage 3 reaction/fact pipeline;
- Stage 6 MVP: same-simulation forced movement, directional cover edges, flanking, overwatch zones, perfect-information hostile intent, height/facing attack modifiers, reaction/status/hazard bridges, durable combat facts, and Play Mode surfacing for Shove, Overwatch, Stage 6 melee damage, combat readouts, overwatch/intent canvas overlays, and actor-following hostile intent tethers; cover edges remain combat data/readouts rather than a map-wide renderer overlay;
- Stage 7 MVP: item spatial profiles and map region rules can be authored; spatial inventory snapshots pack item stacks into a slot grid using authored/fallback shapes, project inventory as actor-held world objects, compute load-to-AP penalties, evaluate region reputation/survival/passive-check gates, persist denial/survival/irreversible consequence flags, emit durable world-state evaluation facts, and now surface survival/condition meters, region denial/pressure feedback, movement/non-drop verb denial gates, and survival-restoring field rations in Play Mode; S6 workstation processes have a contextual multi-process Start/Work/Cancel/Collect Play prompt with action-energy costs;
- continued cleanup of presentation-owned orchestration: scene launch, cutscene pacing, modal opening, logs, audio, FX, camera/fade timing, and legacy fallback cleanup.
