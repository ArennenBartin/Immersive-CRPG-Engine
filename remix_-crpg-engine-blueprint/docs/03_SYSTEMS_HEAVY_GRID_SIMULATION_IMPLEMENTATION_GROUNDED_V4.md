# Systems-Heavy Grid Simulation and Immersion - Implementation-Grounded Specification v4.0

**Status:** Advanced physical/world simulation layer rewritten to fit the current 2D grid engine, Base v3, Kernel v3, and the neutral semantic-adapter boundary.  
**Depends on:** Grid-Based 2D CRPG Base v3 and Systemic Grid Interaction Kernel v3.  
**Optional adapter to:** none active; the semantic adapter is a neutral compatibility command, not a content-producing path.  
**Consumes current footholds:** map cells, surface tags, hazards, infection, object footprints, containers, items, collision, renderer overlays, NPC schedules, barks, combat grid, and map deltas.  
**Does not introduce:** freeform continuous physics as authoritative simulation.

## Current Implementation Status

As of the current repo state, this document has been added to the implementation-grounded docs, and Phases S0-S8 are implemented at MVP scope. `src/engine-core/simulation.ts` now builds a deterministic, exact-cell `SimulationMapSnapshot` from current v1 package/save data: authored cell walkability, line-of-sight blocking, terrain, height, `surface_tag`, hazard, infection, object footprints, open/closed doors, containers, authored items, dropped save-delta items, entity placements, map deltas, material profiles, physical condition records, manipulation affordances, runtime surface/trace/residue layers, runtime fire/smoke/light/sound fields, queued NPC tasks, active simulation processes, regional aggregate records, regional LOD tier counts, and S8 neutral semantic counters. It also emits debug overlay data for surfaces, hazards, infection, traces, residue transfers, cleaned traces, fire, smoke, light, sound, NPC tasks, simulation processes, movement blockers, line-of-sight blockers, object footprints, containers, items, and changed physical conditions.

`GamePackageSchema` now includes default simulation material profiles, optional authored simulation profiles on cells/objects/items/containers, and S6 process/workstation authoring records. Physical profiles include S2 affordance fields and S3 trace profiles. `PlaySave.map_deltas` can persist `simulation_conditions`, carried objects, runtime `surface_layers`, S4 `environment_fields`, S5 `npc_tasks`, and S6 `simulation_processes`; top-level save state can also persist S6 `simulation_economy` stock/shortage records and S7 `simulation_regions`. Door open/close, container unlock/open/search, object push/pull/drag/carry, and object break interactions write save-backed condition records. Movement records footprint traces, transfers authored/runtime residues into derived trace layers, and emits propagated footstep sound. S4 includes deterministic fire/smoke/light/sound propagation and consequences. S5 adds `advance_npc_tasks`: schedules expand into tasks, queued tasks activate, NPCs path one grid step per advancement, and investigate/cleanup/repair/restock/flee/report tasks resolve into same-system side effects and world facts. S6 now includes authored process/workstation definitions, `start_process`, `advance_processes`, `interrupt_process`, actor/workstation occupation checks, input consumption, output/waste drops, heat/sound emissions, process failure facts, local shop stock/shortage/price effects, and v2 save persistence for simulation economy. S7 now includes `advance_simulation_regions`, deterministic exact/nearby/aggregate/dormant regional records, tier tick rates, promotion/demotion ticks, nearby/aggregate off-map environment advancement, off-map process completion/output drops, aggregate NPC task completion, aggregate-to-exact field reconciliation, and v2 save persistence for regional state. S8 keeps `adapt_simulation_semantics` as a neutral command surface that emits `simulation_semantics_adapted` with zero created interpretation records. `SimulationEditor.tsx` exposes material profile counts, changed condition counts, movable/cooperative object counts, max push cost, trace cells, residue cells, cleaned traces, surface layer counts, fire/smoke/light/sound counts, NPC task counts, process counts, regional aggregate counts, exact/nearby/aggregate/dormant region counts, semantic observation counts, evidence-link counts, and the condition/trace/residue/environment/task/process overlays in Studio. Headless coverage in `scripts/test-engine-core.ts` proves surface/hazard/infection normalization, material defaults, save-aware overlay generation, S1 condition writes, S2 push/pull/drag/carry/cooperation behavior, S3 footprint traces, residue transfer, cleaning, cleaned-trace facts, decay, S4 fire/smoke/light/sound propagation and consequences, S5 NPC task queueing/execution, S6 process/economy lifecycle, S7 regional LOD advancement/reconciliation, S7 regional aggregate snapshot exposure, and S8 neutral semantic-adapter no-op behavior.

The rest of this document remains future work: repair-specific player-facing verbs, deeper material response rules, richer NPC task authoring, crafting UI, deeper economy/ecology resource flow, richer Studio LOD authoring controls, and deeper game-specific semantic authoring on top of the S8 adapter.

## 0. Purpose

The current 2D engine already has the seeds of simulation: cells, walkability, line-of-sight blocking, terrain, surface tags, hazards, infection values, object footprints, door states, containers, NPC schedules, combat ranges, and a shared renderer. The simulation layer deepens these into a systemic world where physical conditions matter, objects persist, NPCs notice and respond, and emergent consequences arise.

The simulation layer is not the base engine. It should not be built before the base and kernel. It expands them.

The simulation promise is:

> The world is made of persistent materials, fields, objects, bodies, traces, routines, and processes that interact through the authoritative grid and produce inspectable consequences.

## 1. Relationship to other layers

### 1.1 Base

The base owns maps, cells, planes, movement, combat, events, UI, save/load, rendering, and authoring foundations.

### 1.2 Kernel

The kernel owns persistent object identity, placements, holders, interactions, ownership, custody, permission, world facts, and baseline exposure.

### 1.3 Simulation

The simulation layer adds deeper physical and ecological causality:

- mass;
- bulk;
- grip;
- leverage;
- material;
- condition;
- support;
- stability;
- fire;
- fluids;
- smoke;
- light;
- sound;
- scent;
- weather;
- decay;
- traces;
- routines;
- tasks;
- maintenance;
- production;
- economy;
- ecology.

### 1.4 Philosophy adapter

Simulation can expose traces and conditions to the philosophical layer. The adapter must preserve the distinction between physical trace and interpretation.

A bloody footprint is a physical trace. It is not automatically proof of guilt.

## 2. Grid-authoritative simulation

### 2.1 No freeform authority

All authoritative simulation resolves through cells, edges, planes, elevations, holders, containers, and footprints. Presentation may interpolate or animate freely, but saved state remains grid-authoritative.

### 2.2 Resolution tiers

Simulation supports multiple resolutions:

- exact cell state;
- region aggregate;
- map aggregate;
- off-map abstract state;
- paused/dormant state;
- authored override.

Promotion/demotion between tiers must be deterministic.

## 3. Materials and condition

### 3.1 Material profile

Objects, terrain, walls, doors, items, bodies, liquids, and residues may have material profiles.

Fields:

- material id;
- density/mass factor;
- hardness;
- flammability;
- ignition temperature;
- burn behavior;
- absorbency;
- permeability;
- conductivity;
- fragility;
- wetness capacity;
- scent retention;
- cleaning difficulty;
- decay behavior;
- sound response;
- light response;
- tags.

### 3.2 Condition

Physical condition can track:

- intact;
- worn;
- cracked;
- damaged;
- broken;
- burned;
- wet;
- frozen;
- stained;
- contaminated;
- rotten;
- repaired;
- reinforced;
- unstable.

Condition modifies base/kernel behavior but does not replace it.

## 4. Mass, bulk, carrying, and manipulation

### 4.1 Physical profile

Objects may define:

- mass class;
- bulk class;
- awkwardness;
- grip points;
- center of mass;
- required hands;
- required strength/tool;
- carry posture;
- movement penalty;
- combat restriction;
- throwability;
- push/pull/drag difficulty.

### 4.2 Current migration

The current engine has simple inventory stacks and object footprints. The first simulation step adds physical profiles without immediately replacing inventory. Only oversized/world objects require physical carry representation at first.

### 4.3 Oversized carrying

Large objects remain visible when carried. They may occupy cells around the actor, block doors, limit facing, prevent attacks, or require both hands.

### 4.4 Cooperative movement

Some objects require multiple actors. Cooperative movement uses reservations over actor positions, object footprint, target path, and timing.

## 5. Support, stacking, barricades, and structure

### 5.1 Support graph

The simulation maintains a support graph for objects stacked on objects, objects fastened to walls, roofs supported by beams, and furniture blocking routes.

### 5.2 Stability

Stacks may be stable, unstable, collapsing, or supported. Stability depends on footprint, mass, contact area, material, slope/elevation, and disturbance.

### 5.3 Barricades

Barricades are kernel placements with simulation modifiers:

- barrier strength;
- coverage of edge/cells;
- push resistance;
- burnability;
- break difficulty;
- line-of-sight effect;
- sound produced when attacked;
- ability to hold against actor force.

### 5.4 Destructible cover

Cover has material, hit points/condition, coverage arc, collapse behavior, debris creation, and repair state.

## 6. Surfaces and residues

### 6.1 Current foothold

Current cells already have `surface_tag` values such as water, oil, blood, poison, firehazard, and ice. Simulation turns this into a field system.

### 6.2 Surface field

Cells may contain layered surface states:

- water;
- oil;
- blood;
- poison;
- ash;
- mud;
- dust;
- glass powder;
- sacred residue;
- slime;
- soot;
- cleaning agent;
- custom game fields.

Each surface has amount, age, spread behavior, cleaning difficulty, flammability, slipperiness, visibility, scent, and trace potential.

### 6.3 Transfer

Residues can transfer between cell, object, item, actor feet, hands, clothing, carried objects, and containers.

Transfer creates traces that the semantic layer may later interpret.

## 7. Fluids

Fluids are optional advanced simulation.

Fluid properties:

- volume;
- viscosity;
- spread rate;
- evaporation;
- absorption;
- freezing;
- mixing;
- contamination;
- flammability;
- conductivity;
- buoyancy tag;
- hazard effects.

Fluids use grid-based flow, not continuous particle physics. Regional aggregation may replace exact flow off-screen.

## 8. Heat, fire, smoke, and air

### 8.1 Fire

Fire has ignition, fuel, intensity, spread, smoke production, oxygen/ventilation, material interaction, extinguishing, and damage/hazard outputs.

### 8.2 Smoke

Smoke affects visibility, breathing, scent, AI behavior, alarm state, and fire spread. It propagates through regions, doors, windows, vents, and openings.

### 8.3 Air quality

Air fields can include smoke, spores, poison gas, dust, fragrance, and magical or game-specific vapors.

## 9. Light and darkness

### 9.1 Base foothold

The base already needs line of sight, darkness, concealment, fog of war, and targeting. Simulation adds dynamic light fields.

### 9.2 Light sources

Light sources may be:

- static;
- carried;
- fueled;
- flickering;
- occluded;
- colored;
- magical;
- fire-generated;
- electric/technical.

### 9.3 Gameplay effects

Light affects:

- vision range;
- stealth;
- concealment;
- morale;
- hazards;
- plant/fungal systems;
- NPC investigation;
- encounter difficulty;
- screenshots and presentation.

## 10. Sound and acoustics

### 10.1 Base foothold

The base provides coarse auditory exposure. Simulation deepens it.

### 10.2 Sound events

Sound events have source, loudness, frequency tag, material tag, duration, cells/regions propagated to, occlusion, and decay.

Examples:

- footsteps;
- door creak;
- lockpick failure;
- furniture scrape;
- glass break;
- weapon impact;
- spell cast;
- scream;
- falling body;
- thrown object.

### 10.3 NPC response

NPCs may investigate sound sources, call allies, remember disturbance locations, or revise routine state.

## 11. Scent and environmental traces

Scent is an advanced optional module but should be planned.

Scent tracks:

- source;
- intensity;
- age;
- diffusion;
- material retention;
- transfer;
- masking;
- air movement;
- actor sensitivity.

Scent can support monsters, trackers, animals, supernatural senses, and forensic gameplay.

## 12. Weather, time, and exterior conditions

The current clock supports phases and scheduled NPCs. Simulation expands time into:

- weather;
- rain;
- wind;
- temperature;
- snow;
- fog;
- mud;
- wetness;
- seasonal conditions;
- daylight curves;
- long-term decay;
- maintenance schedules.

Weather affects cells, surfaces, fire, visibility, sound, travel, NPC routines, and economy.

## 13. Decay, cleaning, maintenance, and repair

### 13.1 Decay

Objects and traces can decay over time. Bodies rot, blood dries, fire consumes fuel, food spoils, water evaporates, footprints fade, doors degrade, and machinery fails.

### 13.2 Cleaning

Cleaning removes, reduces, or transforms residues and traces. It may create new facts: a cleaned stain can be as suspicious as a stain.

### 13.3 Maintenance

NPCs may clean, repair, restock, relight lamps, close doors, remove debris, harvest resources, and reset public spaces.

## 14. NPC routines and tasks

The base schedule system advances friendly NPCs by hour and cell. Simulation creates task-based routines.

NPC tasks include:

- travel to work;
- open shop;
- eat;
- sleep;
- patrol;
- investigate;
- clean;
- repair;
- carry object;
- restock container;
- fetch tool;
- extinguish fire;
- treat injured actor;
- remove body;
- report crime;
- flee danger;
- join combat;
- return to routine.

Tasks use the same kernel interactions as the player. NPCs do not teleport objects through special scripts unless authored as abstraction.

## 15. Workstations, processes, crafting, and production

Simulation supports processes as time-based transformations.

Examples:

- cooking;
- brewing;
- smithing;
- glassworking;
- alchemy;
- ritual preparation;
- medical treatment;
- corpse preparation;
- farming;
- hauling;
- repair;
- manufacturing.

A process consumes inputs, uses tools/stations, occupies actors or machines, emits heat/sound/smell/traces, produces outputs/waste, and may fail or be interrupted.

The base can ship with simple crafting; simulation gives it world presence.

## 16. Economy and ecology

### 16.1 Local economy

Simulation can track local stock, production, consumption, restocking, supply routes, prices, theft, shortages, and faction control.

### 16.2 Ecology

Optional ecology supports creatures, plants, growth, predation, migration, territory, food needs, infestation, and environmental response.

These are aggregate systems by default, promoted to exact simulation only near active maps.

## 17. Combat integration

Simulation makes combat more systemic through:

- dynamic cover;
- breaking furniture;
- moving barricades;
- fire spread;
- smoke concealment;
- oil ignition;
- wetness and ice;
- sound drawing reinforcements;
- darkness and light tactics;
- thrown objects;
- improvised weapons;
- body blocking;
- morale;
- surrender;
- post-combat scene cleanup.

Combat still uses the base action-point and encounter systems.

## 18. Simulation semantic adapter

When the philosophical layer is installed, simulation outputs become potential observations and evidence.

The adapter emits:

- trace exposure;
- suspicious change exposure;
- physical possibility evidence;
- contradiction evidence;
- opportunity evidence;
- environmental testimony;
- body condition observation;
- object provenance observation.

It never declares final meaning.

## 19. Studio tools

The Studio must provide editors for:

- materials;
- physical profiles;
- surface fields;
- fluid profiles;
- fire profiles;
- light sources;
- sound profiles;
- scent profiles;
- weather profiles;
- decay profiles;
- trace profiles;
- NPC task routines;
- workstations and processes;
- economies;
- ecology;
- simulation LOD settings;
- simulation sandbox.

Debug overlays should show light, sound, scent, heat, fire, smoke, fluid, trace age, NPC tasks, reservations, support graphs, and regional aggregate states.

## 20. Implementation roadmap

### Phase S0 - prepare current fields

- Normalize current `surface_tag`, hazard, infection, walkability, LOS, object footprint, and container data for simulation consumption.
- Add debug overlays for current state.

### Phase S1 - material and condition

- Implemented at MVP scope: default material profiles, optional authored simulation profiles, save-backed condition records, Studio condition overlays, and open/close/unlock/search/break condition writes.
- Remaining S1 depth: repair verbs and material-specific behavior rules.

### Phase S2 - mass and manipulation

- Implemented at MVP scope: authored mass/bulk/awkwardness/push/carry/cooperation fields, snapshot manipulation affordances, deterministic push/pull/drag/carry effort, push/pull/drag/carry condition writes, carried-object hand-holder state, kernel fact affordance details, and cooperation-required manipulation with helper actor ids.
- Remaining depth is polish rather than phase blocker: direct Studio authoring controls for physical affordances and richer live Play Mode gestures for pull/drag/carry.

### Phase S3 - surfaces and traces

- Implemented at MVP scope: `surface_layers` map deltas, authored trace profiles, movement-created footprint traces, residue transfer from authored/runtime surfaces into actor traces, layered surface normalization in `SimulationMapSnapshot`, trace/residue/cleaned overlays, cleaning that removes runtime residue while preserving a cleaned trace and stained condition record, kernel facts for cleaned traces, deterministic trace decay processing, and trace/layer/residue Studio metrics.
- Remaining depth is polish rather than phase blocker: residue transfer onto held objects, object/item/container surface cleanup verbs, and richer authored tooling for surface profile authoring.

### Phase S4 - fire, smoke, light, and sound

- Implemented at MVP scope: `environment_fields` map deltas, runtime fire/smoke/light/sound field records, `ignite_fire`, `extinguish_fire`, `advance_environment`, `emit_sound`, movement-created footstep sound propagation, fire-created smoke/light, deterministic flammable-cell fire spread, burned/wet cell condition writes, fire damage and burn status application, dense-smoke vision blocking in snapshots, authored static light-source normalization, acoustic material response/occlusion, NPC investigation/report task hooks, and Studio overlays/metrics for fire, smoke, light, and sound.
- Remaining depth is polish rather than phase blocker: richer fire fuel/oxygen rules, fire damage tuning, carried light-source equipment integration, and presentation-side visibility/audio consumption.

### Phase S5 - NPC tasks

- Implemented at MVP scope: save-backed `npc_tasks`, task overlays/metrics in `SimulationMapSnapshot`, sound-generated investigation tasks, fire-generated report/investigation tasks for nearby friendly NPCs, schedule-to-task expansion, one-action-per-NPC task advancement, active task execution/pathing, cleanup through surface cleaning, repair condition writes, container restock, flee/report/investigate completion, and durable world facts for NPC memory.
- Remaining depth is polish rather than phase blocker: richer task interruption, multi-step reservations, task authoring UI, tool fetching, body removal/treatment, combat joins, and deeper non-dialogue interpretation design.

### Phase S6 - processes and economies

- Implemented at MVP scope: authored process/workstation definitions, save-backed `simulation_processes`, `start_process`, `advance_processes`, `interrupt_process`, input item consumption, output/waste drops, heat/sound emissions, process completion/failure world facts, actor/workstation occupation checks, local shop stock records, shortage flags, shortage price effects, v2 save persistence for simulation economy, and Studio process overlays/metrics.
- Remaining depth is polish rather than phase blocker: crafting UI, richer recipe authoring, machine occupation, process quality/failure tuning, broader resource-flow simulation, and ecology coupling.

### Phase S7 - LOD and regional simulation

- Implemented at MVP scope: `advance_simulation_regions` writes save-backed regional records for exact current-map regions, nearby connected maps, aggregate active off-map regions, and dormant inactive regions. Records include cell counts, active process counts, queued task counts, environment-field counts, fire/smoke/sound aggregate intensity, tier tick rates, deterministic promotion/demotion ticks, completed process/task counts, and reconciled field counts. Nearby and aggregate maps can now advance environment fields, complete off-map processes into output drops/economy updates, complete aggregate NPC tasks, and reconcile aggregate fire/smoke/sound intensity back into exact fields when a region is promoted.
- Remaining depth is polish rather than phase blocker: richer Studio LOD authoring controls, finer aggregate ecology/economy rules, authored override tiers, and deeper reconciliation of complex multi-cell fluids/traces.

### Phase S8 - neutral semantic adapter

- Current implementation: `adapt_simulation_semantics` remains accepted for command compatibility, but it no longer creates interpretation records. It emits a neutral `simulation_semantics_adapted` event with zero created-record counts.
- Remaining depth is a future design question: if simulation interpretation returns, it should feed existing dialogue, quest, journal, and event systems rather than resurrecting a second casework layer.

## 21. Acceptance slice

A test scene must prove:

- a lamp ignites oil;
- fire spreads to wooden furniture;
- smoke reduces visibility;
- NPCs hear noise and investigate;
- player drags furniture to barricade a door;
- barricade alters combat pathing;
- blood/ash footprints persist;
- an NPC later notices the trace;
- cleaning removes but records the trace;
- save/load preserves all active and decaying states;
- the semantic adapter command stays compatible without creating interpretation records; any future interpretation should surface through normal story systems.

## 22. Non-goals

The simulation layer is not a physics sandbox, not a second combat system, not a second inventory system, not a moral interpreter, and not an AI narrative generator. It is a deterministic grid-based material causality system that deepens the world the base and kernel already define.
