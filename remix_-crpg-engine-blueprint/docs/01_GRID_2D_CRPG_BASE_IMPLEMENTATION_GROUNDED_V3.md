# Grid-Based 2D CRPG Base Systems - Implementation-Grounded Specification v3.0

**Status:** Target foundation rewritten from the currently implemented 2D codebase; imported into this repo and refreshed against the current fog-of-war, status-effect runtime, and `engine-core` command foothold.  
**Supersedes:** Earlier clean-room base-system specifications.  
**Depends on:** current `crpg_engine_game_package_v1` and `crpg_engine_save_v1` as migration input.  
**Feeds:** Systemic Interaction Kernel v3, Philosophical Semantics v4, Systems Simulation v4, CRPG Maker Studio v3.

## 0. Purpose

This document defines the new base runtime for a systematic grid-based 2D CRPG engine, but it does so from the reality of the current codebase rather than from an idealized blank slate.

The current engine already has meaningful shipped systems: a React and TypeScript studio, a 2D canvas renderer, package and save schemas, maps, movement, dialogue, quests, cutscenes, items, shops, skills, same-map tactical combat, a map editor, tile maker, sprite creator, and several content editors. The redesign should preserve this value while replacing the brittle architecture underneath it.

The base engine's job is to make a shippable CRPG before the advanced philosophical and simulation layers are installed.

The base engine must support:

- orthogonal top-down 2D presentation;
- authoritative square-grid world state;
- real-time exploration with active pause;
- same-map tactical combat using action points;
- party movement and turn control for up to six characters;
- maps, entities, items, containers, shops, dialogue, quests, documents, cutscenes, events, triggers, audio, FX, save/load, import/export, and validation;
- desktop web, mobile web, PWA, and wrapper deployment;
- a Maker Studio developed alongside the runtime;
- a deterministic command -> action -> effect -> event architecture that later layers can extend.

The base should not attempt to implement philosophical semantics, detailed object simulation, or immersive-sim material propagation. It must, however, expose stable hooks so those layers can be built without rewriting the engine again.

## 1. Current implemented baseline

The current codebase after the 3D-to-2D conversion has the following factual state.

### 1.1 Tech stack

- Frontend: React 19, TypeScript, Vite.
- Styling: Tailwind CSS v4.
- Icons: `lucide-react`.
- State: Zustand stores.
- Validation: Zod schemas in `src/schema/`.
- Rendering: flat top-down 2D drawn to an HTML5 canvas through `GameRenderer2D`.
- Server: `server.ts`, Express serving the Vite app via `tsx` during development.
- Optional AI authoring: `@google/genai`, gated behind `GEMINI_API_KEY`.
- Legacy/dead 3D dependencies still exist in package dependencies and dead code, but the active play/edit path is 2D.

### 1.2 Active entry points and shell

- `index.html` -> `src/main.tsx` -> `src/App.tsx`.
- `App.tsx` mounts `AppShell`.
- `AppShell.tsx` provides the studio shell, left navigation, undo/redo, import/export, and active mode panels.
- Current modes include home, map editor, play, tile maker, sprite creator, dialogue editor, quest editor, entity editor, cutscene/event editor, item editor, document editor, shop editor, and skill editor.

### 1.3 Current stores

- `engineStore.ts`: authoring/editor state, active `GamePackage`, selection IDs, undo/redo, IndexedDB persistence, import/export, package normalization, and default 2D tile backfill.
- `playStore.ts`: runtime save, map deltas, and save slots.
- `fxStore.ts`: transient combat feedback such as damage popups, barks, hit flashes, hurt vignette, and screen pulse.
- `visualSettingsStore.ts`: renderer quality, device-pixel-ratio preferences, and the persisted Play Mode fog-of-war toggle.

### 1.4 Current package schema

`GamePackageSchema` is the current content contract with schema literal `crpg_engine_game_package_v1`.

Libraries include metadata, settings, maps, object library, sprite library, entities, dialogue, documents, quests, cutscenes, switches, items, abilities, shops, barks, factions, endings, encounters, and validators. Factions, endings, and encounters exist but are lightly used or mostly schema stubs.

### 1.5 Current map model

Maps have width, height, spawns, cells, custom object placements, entity placements, item placements, container placements, triggers, and exits.

Cells include `x`, `y`, `z`, active, walkable, blocks line of sight, height, visual height, terrain, object id, region id, room id, hazard, infection, portal id, and surface tag. In the current 2D implementation, movement keys off walkability, LOS keys off blocks LOS, and height/visual height are mostly cosmetic.

### 1.6 Current rendering

`GameRenderer2D` is used by both Play Mode and the Map Editor. It draws floor and wall tiles, surface tints, combat highlights, editor grid, objects, containers, items, entities, followers, player, the optional Play Mode fog veil, hover outlines, editor markers, and FX.

The renderer supports smooth slide interpolation, turn rings, HP bars, pan, zoom, fit, pointer-to-cell mapping, cached rasterization of pixel sprites or data URLs, and a renderer-local explored-cell cache for fog of war.

### 1.7 Current movement and exploration

`PlayMode.tsx` implements direct movement through keyboard and an on-screen virtual joystick. It supports eight-direction movement, facing, collision against cells, objects, entities, and large visual-height steps, adjacency/facing-based interactions, doors, containers, ground item pickup, documents, terminal interactions, cutscene triggers, world clock advancement, map exits, an overworld map, and a HUD toggle for tactical fog of war. Successful movement, ground-item pickup, door opening, map changing, eligible trigger firing, container unlock/open state, container item transfer, dialogue option switch/quest effects, talk/kill objective completion, melee attacks, and skill casts now pass through the v1 engine-core adapter, commit its produced save, and emit structured events including successful action costs where relevant.

### 1.8 Current story systems

Dialogue graphs, barks, quests, journals, documents, cutscenes, triggers, conditions, switches, and cutscene effects are all present. The condition system supports switches, quests, item possession/counts, party membership, faction reputation, time of day, hours, and logical combinations.

Cutscenes already provide many verbs, including movement, dialogue, switches, waits, teleportation, audio, start combat, give/remove item, currency, sprites, document reading, heal, restore party, shop opening, party add/remove, labels and branches, screen fade, camera pan, faction reputation adjustment, save menu, clock advancement, stat modification, learn skill, hide entity, game end, and custom actions.

### 1.9 Current combat

Combat is turn-queue tactical combat on the same map. Hostiles engage based on threat radius, chase based on chase radius, initiative is ordered by speed, actors can move one cell and take one action per turn, enemies chase and attack, skills support targeting patterns, damage/healing feedback is displayed, XP is awarded on defeat, and entity death/hidden state persists. Combat randomness, session start/end/reinforcement, initiative/turn advancement, controlled actor snapshots, targeting pattern/range cells, melee attack resolution, skill damage/heal/status payloads, enemy chase/attack turns, opportunity attacks, combat XP payout, kill-objective completion, and player skill resource spending now run through `engine-core`; PlayMode remains the presentation/input shell for HUD, targeting cursor, audio, logs, and FX.

### 1.10 Current authoring suite

The studio currently includes a 2D Map Editor, Tile Maker, Sprite Creator, Dialogue Editor, Quest Editor, Entity Editor, Event/Cutscene Editor, Item Editor, Document Editor, Shop Editor, Skill Editor, and Condition Editor.

### 1.11 Current limitations

The major architectural limitations are:

- the `engine-core` runtime now owns a broad command set, but the live loop in `PlayMode.tsx` is not yet fully core-authoritative (movement legality, exploration verbs, save-changing cutscene/story effects, dialogue choice transitions/effects, shop buy/sell transactions, bark cooldowns, endings, objective completion, combat sessions, initiative, turn advancement, melee attacks, skill casts, targeting validation, enemy turns, and opportunity attacks route through the core; input gestures, HUD/modals, audio, camera/fade timing, scene launch, logs, and cutscene pacing still live in `PlayMode`);
- gameplay state lives in Zustand stores and `PlayMode.tsx`;
- no ECS runtime;
- the command/effect/event pipeline now covers exploration/grid, kernel object transactions, simulation/environment/process commands, expanded story/cutscene state mutation, dialogue choice, shop transaction, and combat commands, with v1 dispatch adapters and event emission;
- current maps are effectively single-plane grids;
- no full actor-specific belief/knowledge model (tactical fog of war is save-backed via `PlaySave.explored_cells`, and Stage 4 alertness/perception now has Play Mode HUD/badge surfacing);
- limited regions-with-behavior beyond the current Stage 7 test-map gates, Play HUD/banner/gating surfacing, and field-ration restoration loop;
- no tileset autotiling;
- the status-effect runtime now covers apply/tick/modifiers/HUD **plus enforced stun turn-skip and damage-over-time kill XP**; broader authored-status content coverage is the remaining gap;
- opportunity attacks and Stage 6 cover/flank/overwatch/height combat now exist at MVP scope; broader player-set reactions and authored-status coverage remain thin;
- no equipment slots;
- no loot tables;
- no crafting;
- stealth/perception exists at Stage 4 MVP scope with a Play Mode visibility gem, NPC alert badges, alert barks/audio/popups/logs, and a systems test stealth-watcher lane, but broader authored stealth encounters and tuning remain thin;
- no full authored lighting model beyond tile light fields, static light normalization, and reaction-driven fire/light fields;
- no localization system;
- no plugin/mod system;
- no deterministic replay;
- no robust runtime/debug inspector beyond the current engine-events overlay.

## 2. Governing promise

A systematic CRPG is a large, agentic world where the player can explore, question, and manipulate a world that is not their own. The player should be able to create consequences that were not explicitly scripted while still receiving authored narrative response.

The base engine promise is:

> The player acts on an authoritative grid world; the runtime resolves commands deterministically; the world persists what changed; and authored systems can react through events, conditions, quests, dialogue, combat, cutscenes, and later expansion modules.

The base engine is not yet the philosophical engine or the immersive simulation engine. It is the stable, deterministic CRPG substrate they require.

## 3. Build-order position

The full stack is:

1. Grid-Based 2D CRPG Base.
2. Systemic Interaction Kernel.
3. Philosophical Semantic Layer.
4. Systems-Heavy Grid Simulation Layer.
5. CRPG Maker Studio, built alongside every runtime milestone.

The Studio is documented separately but developed with the base. A base runtime feature is not considered finished until it is authorable, testable in Play Mode, validatable, and inspectable in the Studio.

## 4. Architectural target

### 4.1 Headless deterministic core

The base runtime must be separated from React, canvas rendering, and editor UI. The future codebase should expand the current headless `src/engine-core/` foothold into a package that owns:

- package loading;
- save loading;
- runtime world state;
- command validation;
- deterministic action resolution;
- effect application;
- event emission;
- time advancement;
- combat turns;
- AI decisions;
- condition evaluation;
- replay;
- tests.

React components should become clients of the core rather than the owners of game logic.

Current foothold: `src/engine-core/` already provides deterministic RNG, a structured event stream, registries, a command/effect/event dispatch pipeline, a reference in-memory grid world, built-in movement/pickup/open-door/change-map/fire-trigger/container unlock/container open/container transfer commands, state mutation commands, quest-objective completion, melee attack and skill cast commands, a v1 package/save grid adapter with successful action costs, a status-effect runtime, a story read service for conditions/dialogue option gates/shop stock/bark selection, and a smoke test. `PlayMode.tsx`, `playStore.ts`, `engineStore.ts`, `combat.ts`, `leveling.ts`, and schema files still contain most logic to extract. The migration should not rewrite all gameplay at once; it should carve it out behind compatibility adapters.

### 4.2 Runtime/editor separation

The package in `engineStore` remains authoring state. Runtime saves in `playStore` remain play state. The target architecture formalizes this as:

- `GamePackage`: immutable loaded content for a runtime session;
- `RuntimeState`: mutable state for a play session;
- `EditorProject`: draft content plus editor-only metadata;
- `PlaytestSession`: a runtime state created from an editor project snapshot.

### 4.3 Command pipeline

All player, AI, cutscene, trigger, and debug operations must ultimately resolve through commands.

Canonical flow:

```text
Input or script intent
  -> Command
  -> validation
  -> Action instance
  -> Effect list
  -> State mutation
  -> Event stream
  -> Rendering/UI/audio/quests/dialogue/combat react
```

Current cutscene actions should migrate into this pipeline rather than remaining special imperative branches inside `PlayMode.tsx`.

### 4.4 Core registries

The base runtime introduces versioned registries for:

- commands;
- actions;
- effects;
- conditions;
- events;
- components;
- stats;
- resource pools;
- targeting patterns;
- encounter objectives;
- AI behaviors;
- editor extensions.

Later layers register additional types into the same registries. They do not patch the core monolith.

## 5. Authoritative grid model

### 5.1 Grid type

The engine uses an authoritative square grid with eight-direction adjacency. Movement, targeting, collision, interaction reach, occupancy, AI planning, line of sight, fog of war, stealth, combat, placement, and simulation all derive from this grid.

### 5.2 Visual presentation

Presentation is orthogonal top-down. Visual movement may interpolate smoothly, but authoritative occupancy is always cell-based.

### 5.3 Coordinates

The current map schema uses `x`, `y`, `z`. The target naming should be explicit:

- `x`: horizontal cell coordinate;
- `y`: vertical cell coordinate;
- `plane_id`: named spatial plane;
- `elevation`: discrete height value within a plane;
- `visual_offset`: optional presentation-only offset.

The old `z` field should migrate to `plane_id` or `elevation` depending on current content use. A compatibility adapter can interpret v1 `z` as default plane plus elevation until schema migration is complete.

### 5.4 Planes and elevation

The base supports both named planes and discrete elevation.

Named planes represent layered spaces such as ground, balcony, roof, interior, basement, underpass, bridge, and sewer. A cell may exist at the same x/y on different planes. Portals, stairs, ladders, doors, hatches, ramps, and elevators connect planes.

Elevation is discrete and affects line of sight, range, cover, movement cost, fall checks, and tactical modifiers.

### 5.5 Cells, edges, and regions

The base distinguishes:

- cells: occupancy, terrain, walkability, surface, elevation, light, region membership;
- edges: doors, fences, railings, windows, ledges, walls between cells, line-of-sight blocking;
- regions: rooms, zones, acoustic areas, legal areas, encounter areas, music areas, AI schedule areas, stealth zones, and trigger zones.

Current object-based doors should continue to work but migrate toward edge objects where appropriate.

### 5.6 Fog of war and knowledge

The base layer implements fog of war as player-map knowledge:

- unseen;
- seen previously;
- currently visible;
- visible to party member;
- visible through authored reveal.

The base does not yet represent actor-specific philosophical knowledge. It only supports tactical/exploration visibility.

## 6. Input and control

### 6.1 Supported input

The engine supports:

- keyboard directional input;
- WASD/arrow movement;
- mouse click-to-move;
- mouse/touch selection;
- controller input;
- mobile touch-origin virtual joystick;
- active pause controls;
- command hotbar;
- context action button;
- radial/context menus for touch devices.

### 6.2 Touch-origin joystick

On mobile and tablet, pressing the screen summons an on-screen joystick at the touch origin. Dragging controls movement direction; releasing dismisses or fades the joystick. It must support eight-direction movement, dead zones, diagonal normalization, and UI-safe areas.

### 6.3 Click-to-move

Click-to-move issues a pathing command. The engine validates path availability using current navigation state. During exploration, the actor moves smoothly cell-to-cell; during combat, path preview and AP cost are shown before confirmation.

### 6.4 Active pause

Exploration is real-time but supports active pause. While paused, players can inspect entities, queue certain commands, examine combat ranges, navigate UI, and review logs. Authors may specify whether urgent cutscenes, live dialogue, hazards, and scripted events continue during pause.

## 7. Entities and components

### 7.1 Entity model

Every runtime actor, item, object, placement, trigger, visual marker, cutscene puppet, hazard source, and future simulated object should be an entity or entity-backed instance.

The base introduces an ECS-style model while preserving compatibility with existing schema libraries.

Base components include:

- identity;
- transform/grid position;
- renderable sprite;
- collision/occupancy;
- actor stats;
- faction/allegiance;
- dialogue link;
- schedule;
- inventory holder;
- item stack;
- container;
- interactable;
- trigger;
- combatant;
- party member;
- save persistence;
- audio emitter;
- map transition;
- cutscene target.

The current `entities`, `entity_placements`, `items`, `item_placements`, `container_placements`, and `custom_object_placements` become authored templates and instance records feeding this runtime entity model.

### 7.2 Party

The base supports up to six directly controlled characters. Party movement uses formations with the ability to detach members. In combat, each controlled party member occupies cells and acts in initiative using the same action system as NPCs.

### 7.3 NPCs and schedules

The base keeps the current hour-based schedule system and expands toward region, activity, and condition-based schedules. Schedules remain simple in the base; deeper needs, tasks, cleanup, and investigation belong to the simulation layer.

## 8. Movement, navigation, and collision

### 8.1 Exploration movement

Exploration movement is real-time, grid-authoritative, and smooth-rendered. Movement commands validate against:

- cell walkability;
- blocking edges;
- actor occupancy;
- object footprints;
- container footprints;
- hazard restrictions;
- plane/elevation transitions;
- party formation constraints.

### 8.2 Combat movement

Combat movement uses action points. Path previews show reachable cells, AP cost, danger zones, opportunity attacks, cover, concealment, and occupied footprints.

### 8.3 Collision types

Base collision supports:

- passable;
- blocking;
- transparent blocking;
- line-of-sight blocking;
- cover-providing;
- edge-blocking;
- walkable support;
- destructible obstruction;
- temporarily occupied;
- hostile zone of control;
- multi-cell footprint.

## 9. Perception, visibility, and stealth foundation

### 9.1 Base perception

The base includes robust tactical perception:

- line of sight;
- fog of war;
- vision range;
- facing-sensitive vision;
- light/darkness modifiers;
- concealment;
- sound events at coarse radius/region level;
- recognition of known actors;
- recognition of obviously carried objects;
- memory of obvious changes;
- communication between alerted NPCs.

### 9.2 Stealth

Stealth is a first-class base playstyle, though the full sensory simulation is deferred.

Base stealth includes:

- crouch/stealth stance;
- visibility score;
- noise score;
- cover/concealment;
- suspicion states;
- investigation targets;
- alert propagation;
- search behavior;
- disguise and access hooks.

Simulation later replaces coarse sound/light/scent estimates with field propagation.

## 10. Story systems

### 10.1 Dialogue

The current dialogue graph system remains. The base formalizes dialogue as authored conversation graphs with nodes, options, conditions, effects, portraits, scene images, and cutscene handoffs.

The philosophical layer later extends this with dialogue acts, evidence presentation, consent requests, and actor-specific belief changes. The base still supports conventional dialogue and can ship without semantic dialogue.

### 10.2 Quests and journal

The base quest system continues to support objectives such as talk, kill, collect, explore, interact, and custom. It should add objective IDs, event bindings, clearer progress sources, branching states, and author-defined journal text.

Philosophical Cases are not a replacement for base quests. They are an advanced semantic structure layered on top.

### 10.3 Documents and codex

Documents are readable text entries tracked per save. The base should support document collections, images, tags, authoring metadata, read conditions, and codex categorization.

### 10.4 Barks

Ambient barks remain a base system. Barks should become event-reactive and schedule-aware while still supporting simple proximity exchanges.

## 11. Cutscenes, events, and triggers

### 11.1 Cutscenes as sequences

Current cutscene actions become sequence commands. A sequence can:

- run on a normal map;
- move actors;
- show dialogue;
- branch on conditions;
- call registered effects;
- manipulate camera and screen FX;
- start encounters;
- open UI panels;
- advance time;
- end the game;
- yield to player choice;
- optionally be skipped with authoritative outcomes preserved.

### 11.2 Triggers

Triggers support step, interact, load, switch change, event-driven, region-enter, region-exit, line-of-sight, combat-start, combat-end, schedule-arrival, and future semantic/simulation triggers. The base implements a conservative subset but provides the registry.

### 11.3 Event stream

The base event stream records authoritative gameplay events such as movement, interaction, dialogue node visited, quest update, combat hit, damage, item transfer, door opened, map changed, cutscene action completed, and save loaded.

The kernel later introduces world facts for meaningful interactions. The base event stream must be structured enough for that layer to consume.

## 12. Combat base

### 12.1 Encounter model

Combat occurs on the same map by default, but dedicated encounter maps are supported. Actors enter initiative when they perceive or are drawn into the threat. Unaware actors may remain outside combat until alerted.

### 12.2 Action economy

Combat uses action points. Movement, attacks, skills, item use, waiting, guarding, reloading, object interactions, and later semantic/simulation actions spend AP.

### 12.3 Tactical features

Base combat supports:

- initiative;
- AP costs;
- party turns;
- enemy AI;
- line of sight;
- fog of war;
- facing;
- back attacks;
- opportunity attacks;
- configurable zones of control;
- cover;
- destructible cover;
- concealment and darkness;
- multi-cell enemies;
- directional and area targeting;
- friendly fire configuration;
- nonlethal defeat;
- surrender hooks;
- encounter objectives;
- XP and rewards.

### 12.4 Skills and statuses

Current skills support damage, healing, status, and summon payloads in schema, but runtime currently applies only damage/healing reliably. The base must implement the full status runtime:

- status definition;
- duration;
- stacking;
- periodic effects;
- stat modifiers;
- tags;
- immunity/resistance;
- dispel rules;
- triggers on apply, tick, damage, movement, action, turn start, turn end, and removal.

### 12.5 Reactions

Base reactions include opportunity attacks, overwatch/guard, counterattacks, intercepts, defensive reactions, and scripted reactions. Reactions are registered actions with trigger rules and AP/resource costs.

## 13. Items, equipment, economy, and progression

### 13.1 Inventory

The current stacked inventory remains a base mode. The base adds equipment slots, item instances where required, loot tables, container transfers, and future hooks for physical inventory.

### 13.2 Equipment

Support weapon, armor, accessory, quick-slot, tool, and custom slots. Equipment can modify stats, unlock actions, alter targeting, affect animation, and serve as requirements for abilities.

### 13.3 Economy and shops

The current shop schema remains. Expand it with stock limits, restocking, buy/sell rules, faction modifiers, item conditions, and service entries.

### 13.4 Progression

The base supports hybrid class plus freely learned skills. It should allow class packages, skill trees, attributes, use-based hooks, level rewards, stat choices, learned abilities, and game-specific progression schemas.

## 14. Audio, FX, UI, and accessibility

### 14.1 Audio

The base retains music and sound tables, map music, cutscene audio effects, and positional player reference. Expand toward ambience zones, combat stingers, UI sound profiles, and mobile audio unlock handling.

### 14.2 FX

The current `fxStore` capabilities become part of a presentation subsystem driven by runtime events. FX should never be authoritative state.

### 14.3 UI

Base UI includes HUD, party panel, inventory, character sheet, journal, map, codex, dialogue, shop, combat action bar, targeting preview, save/load, settings, accessibility options, and mobile controls.

### 14.4 Accessibility

Base accessibility includes remappable controls, touch controls, text scaling, high-contrast modes, color-blind targeting indicators, reduced motion, screen flash reduction, subtitles, captions for important audio cues, font choices, and input-mode parity.

## 15. Package and save migration

### 15.1 Package versions

Current package literal: `crpg_engine_game_package_v1`. Target package literal: `grid_crpg_game_package_v2` or a similarly explicit new literal.

The migration process should:

- preserve metadata and settings;
- migrate maps and cells;
- migrate object `tile_sprite_id` values;
- migrate sprites;
- migrate entities and placements;
- migrate dialogue, quests, documents, cutscenes, items, skills, shops, barks, switches;
- convert current single-plane maps to default plane;
- eventually convert current container placements to kernel-compatible containers while preserving the current v1 unlock/open command adapter;
- preserve current cutscene actions via compatibility command wrappers.

### 15.2 Save migration

Current save literal: `crpg_engine_save_v1`. Target save literal: `grid_crpg_save_v2`.

Save migration should preserve:

- current map;
- player position/facing/sprite;
- stats, level, XP, skills;
- flags;
- quest states;
- inventory, money;
- entity states;
- party members;
- map deltas;
- clock;
- faction reputation;
- read documents;
- combat state where possible.

The initial release may choose not to migrate active combat saves. It should clearly mark such saves as requiring safe-location reload.

## 16. Implementation roadmap

### Phase 0 - preserve current 2D functionality

- Freeze a branch/tag of the current Zustand/PlayMode implementation.
- Add regression tests for current movement, dialogue, quests, cutscenes, combat, save/load, and editor import/export.
- Record sample packages and saves as migration fixtures.

### Phase 1 - headless grid core skeleton — DONE

- Expand the existing `engine-core` package into the authoritative runtime skeleton.
- Extend the v1 adapter beyond movement/pickup/open-door/map-change/fire-trigger/container unlock-open/transfer save mutation and action costs into package loading, runtime state, grid maps, entities, event emission, deterministic time, and the next interaction commands.
- Continue wrapping current UI around the new core for successful exploration verbs, then extract NPC/dialogue services and residual story/shop/cutscene side effects.

### Phase 2 - command/effect/event pipeline — DONE

- Done: exploration verbs (move/wait/door/item/map-change/trigger/container), cutscene/story state effects (`set_switch`, `set_quest`, `give_item`, `remove_item`, `give_currency`, `remove_currency`, `adjust_faction_rep`, `read_document`, `learn_skill`), dialogue option switch/quest effects, quest-objective completion, melee attacks, and skill casts are commandized, emit structured events, and are wired into the live runtime with legacy fallback where the surrounding UI still needs it.
- Keep compatibility wrappers for current action names.

### Phase 3 - combat extraction — DONE

- Done: combat session start/end/reinforcement, initiative queue construction, AP/turn ownership, controlled actor snapshots, combat turn advancement, melee attack resolution, skill cast resolution, targeting pattern/range validation, enemy chase/attack turns, opportunity-attack reactions, combat XP payout, kill-objective completion, status turn-skip/damage-over-time cleanup, and save-backed fog now run through core services or core commands. PlayMode presents the results through HUD/audio/log/FX and keeps the targeting cursor as UI state.
- Follow-up polish: broaden player-set reactions beyond opportunity attacks, tune Stage 6 cover/overwatch numbers in authored encounters, and expose richer fog/perception authoring/debug views when the Studio moves onto schema v2.

### Phase 4 - story extraction — DONE

- Done: switch/quest/item/currency/faction-rep/document/skill/objective effects, absolute player/entity positioning, teleport, player sprite swaps, healing/restoration, party add/remove, clock jumps, player stat deltas, entity visibility, dialogue choice resolution, shop buy/sell transactions, bark cooldown recording, and endings are behind core commands and emit structured events. Condition evaluation now lives in `engine-core/story.ts`; Play Mode trigger gates, map-exit gates, cutscene branches, dialogue option visibility/choice transitions, shop stock/pricing, bark selection, and ending resolution use core story/runtime services, with headless regression coverage.
- Follow-up polish: PlayMode still owns UI presentation, audio, camera/fade timing, modal opening, logs, and high-level orchestration. Those are presentation concerns rather than save mutations, but a later runtime shell can still move them behind a cleaner scene/event presenter.

### Phase 5 - schema v2 and migration — DONE

- Done: `src/schema/v2.ts` defines `crpg_engine_game_package_v2` and `crpg_engine_save_v2` wrappers, package/save runtime summaries, v1 -> v2 migration helpers, v1/v2 normalization helpers, and v2 -> v1 unwrap helpers for the current runtime compatibility path.
- Done: headless tests migrate the authored v1 demo package/save fixtures and prove v2 preservation of grid runtime metadata, fog exploration, bark cooldowns, ending state, combat state, and v1 compatibility unwraps.
- Done: Studio package export now defaults to package v2, package import accepts v1 or v2 through normalization, IndexedDB package persistence stores the v2 wrapper, save slots write save v2 payloads, and save-slot loading still accepts legacy v1 saves by unwrapping them for the current runtime.
- Follow-up: the live runtime still consumes v1-compatible content/save objects after normalization; a later package-runtime slice can make native v2 the internal runtime format.

### Phase 6 - base acceptance slice — DONE

A small test map must prove:

- keyboard, click-to-move, and mobile joystick movement;
- map transition;
- dialogue with conditions;
- quest objective update;
- document reading;
- container loot;
- shop transaction;
- cutscene with branch;
- same-map combat;
- status effect;
- opportunity attack;
- fog of war;
- save/load;
- editor Play Mode from current map.

Done: click-to-move maps playfield clicks to one core-dispatched step toward the clicked cell while preserving skill-target clicks; keyboard movement and the existing mobile joystick route through the same movement gate. Headless acceptance checks now cover movement, map transition, dialogue quest/switch updates, document reading, container unlock/open/loot, shop purchase, cutscene branch gating/label lookup, same-map combat start/attack, status-effect application, opportunity attacks, fog-of-war save/load preservation, active combat save/load preservation through v2 save slots, and editor Play Mode map resolution from the current map. A browser smoke pass on `http://localhost:5003/` verifies Map Editor -> Play map -> New Game loads `map_demo_ground`, renders the Play canvas/HUD, applies the demo-tour dialogue/quest update, accepts a playfield click, and reports no console errors.

## 17. Non-goals of the base

The base does not decide philosophical meaning, track consent, simulate fluids, model individual object mass, propagate scent, or run complex economies. Those belong to later layers. The base only guarantees that their required hooks exist.

## 18. Base completion criteria

The base is complete when:

- the current 2D feature demo can run on the new core;
- the Studio can author the same content classes as the current AppShell;
- the runtime can be driven headlessly in tests;
- command replay is deterministic;
- package/save migration works for representative v1 content;
- every current gameplay path has either a migrated implementation or a documented compatibility adapter;
- the kernel can subscribe to interaction events without patching PlayMode;
- the philosophy and simulation layers can register new data, actions, effects, and inspectors without modifying base internals.
