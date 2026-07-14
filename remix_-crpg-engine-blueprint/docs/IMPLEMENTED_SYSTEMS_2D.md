# CRPG Engine — Implemented Systems (2D)

**Status:** Description of what currently exists in this codebase after the 3D→2D conversion, updated for the local implementation-grounded spec stack.
**Scope:** A factual inventory of shipped runtime systems, data schemas, and authoring tools. This is a "what is here" reference, not a target spec. For the aspirational re-architecture, see `docs/00_IMPLEMENTED_BASELINE_AND_REWRITE_MANIFEST_V1.md`, `docs/01_GRID_2D_CRPG_BASE_IMPLEMENTATION_GROUNDED_V3.md`, `docs/02_SYSTEMIC_GRID_INTERACTION_KERNEL_IMPLEMENTATION_GROUNDED_V3.md`, `docs/03_SYSTEMS_HEAVY_GRID_SIMULATION_IMPLEMENTATION_GROUNDED_V4.md`, `docs/04_GRID_IMMERSIVE_SIM_ENGINE_ROADMAP_V1.md`, and `docs/05_ALDERAMONTICO_STATE_SYSTEM_CONTRACT_V1.md`; for a gap analysis between current code and the target stack, this document is the "implemented" side.

Package schema literal: `crpg_engine_game_package_v1` · Save schema literal: `crpg_engine_save_v1`.

---

## 1. Overview & tech stack

- **Frontend:** React 19 + TypeScript, built with Vite. Tailwind CSS v4 for styling, `lucide-react` for icons.
- **State:** Zustand stores hold most gameplay state (`PlayMode.tsx` still owns the live loop). A headless deterministic spine — `src/engine-core/` — now exists (see "Engine-core foothold" below) and is adopted incrementally; combat randomness already runs through it.
- **Validation:** Zod schemas in `src/schema/`.
- **Rendering:** Flat top-down 2D drawn to an HTML5 `<canvas>` (`GameRenderer2D`). *(Three.js / react-three-fiber remain as `package.json` deps and dead code in `PlayMode.tsx`, but nothing in the play/edit path renders 3D.)*
- **Server:** `server.ts` — Express serving the Vite app (`npm run dev` via `tsx`).
- **AI authoring (optional):** `@google/genai`, gated behind `GEMINI_API_KEY`.

### Scripts (`package.json`)
- `dev` — run the app; `build` — Vite client + esbuild server bundle; `preview`; `start`.
- `lint` — `tsc --noEmit`.
- `test:engine` — headless `engine-core` smoke/regression checks.
- `test:chemistry` — headless numeric-axis grid-chemistry checks.
- `test:state` — headless Alderamontico physical/emotional axis-state checks.
- `audit:maps`, `audit:combat` — content audits.

---

## 2. Entry points & app structure

- `index.html` → `src/main.tsx` → `src/App.tsx`.
- `App.tsx` mounts **`AppShell`**, the studio and Play Mode host.
- `AppShell.tsx` is the studio shell: left nav + a single active mode panel. Modes: `home`, `map_editor`, `play`, `tile_maker`, `sprite_creator`, `dialogue_editor`, `quest_editor`, `entity_editor`, `cutscene_editor` (Events), `item_editor`, `document_editor`, `shop_editor`, `skill_editor`. Undo/redo + package import/export live here.

### Stores (`src/store/`)
- `engineStore.ts` — authoring/editor state: the active `GamePackage`, selection IDs, undo/redo stack, IndexedDB persistence, import/export + `normalizeImportedPackage` (which also backfills default 2D tiles).
- `playStore.ts` — the runtime save (`PlaySave`), map deltas, save slots.
- `fxStore.ts` — transient combat feedback (damage popups, barks, hit flashes, hurt vignette, screen pulse).
- `visualSettingsStore.ts` — renderer quality/DPR preferences and the persisted Play Mode fog-of-war toggle.

### Engine-core foothold (`src/engine-core/`)
- A small framework-agnostic runtime spine now exists: deterministic `RNG`/`RngStreams`, structured `EventBus`, generic `Registry`, a command/effect/event `Engine`, and `InMemoryGridWorld` for tests. The built-in command surface now spans exploration, kernel object transactions, simulation/environment/process commands, story state, dialogue/shop transactions, and combat:
  - **exploration/grid:** `move_entity`, `wait`, `take_item`, `open_door`, `change_map`, `fire_trigger`;
  - **containers:** `unlock_container`, `open_container`, `take_from_container`, `take_all_from_container`, `stow_in_container`;
  - **state mutation (story / cutscene / dialogue effects):** `set_switch`, `set_quest`, `give_item`, `remove_item`, `give_currency`, `remove_currency`, `adjust_faction_rep`, `read_document`, `learn_skill`, `complete_quest_objective`, `set_player_position`, `teleport_player`, `set_entity_position`, `set_player_sprite`, `heal_player`, `restore_party`, `add_party_member`, `remove_party_member`, `advance_clock`, `modify_player_stats`, `set_entity_hidden`, `record_bark`, `game_end`. These are built from shared state-command plumbing where possible and each emits a structured event;
  - **story transactions:** `choose_dialogue_option`, `buy_shop_item`, `sell_inventory_item`, emitting dialogue transition/effect and shop transaction payloads;
  - **combat:** `melee_attack`, `cast_skill`, `update_combat_session`, `advance_combat_turn`, `enemy_turn`, emitting `melee_attack_resolved`, `skill_cast_resolved`, `combat_started`, `combat_reinforced`, `combat_ended`, `combat_turn_advanced`, `enemy_turn_resolved`, and `opportunity_attack_resolved` payloads.
- `v1Runtime.ts` adapts the current `crpg_engine_game_package_v1` + `crpg_engine_save_v1` pair into a headless `V1GridWorld` (implements `InteractiveGridWorld`): current-map loading, player/entity runtime positions, object footprints, closed/open doors, containers, cell walkability, ground items, inventory mutation (`giveItem`/`removeItem`), explicit item drop, map transition mutation, trigger once-flag mutation, door open/close state, container locked/opened/searched state, optional key consumption, container item transfer, push/break object deltas, flag/quest/money/faction-rep/document/skill/objective mutation, dialogue choice effects, shop buy/sell transactions, save-backed bark cooldowns, terminal ending state, deterministic melee/skill damage, combat session start/end/reinforcement, initiative queues, turn advancement, controlled-actor snapshots, core targeting range/pattern cells, enemy chase/attack turns, opportunity attacks, skill resource spending, XP awards, kill-objective completion, deterministic time advancement, and successful-action resource costs. A `dispatchV1*` function exists for every command and returns `{ ok, reason, events, save }` plus command-specific outcomes where useful. Read helpers expose nearby hostiles, controlled combatants, combatant snapshots, skill target cells, and skill range cells.
- `statuses.ts` is a framework-agnostic **status-effect runtime**: a built-in library (poison, bleed, burn, regen, weaken, guard, haste, slow, stun) plus pure `applyStatus` / `tickStatuses` / `statModifiers` (duration, periodic hp/mp, flat stat modifiers, turn-skip).
- `chemistry.ts` and `chemistryRuntime.ts` are a framework-agnostic **numeric-axis grid chemistry runtime**. Per-cell axes (`temperature`, `saturation`, `charge`, `integrity`, `foam`, `fuel`, `stability`, `scorch`, `frozen`) are the authoritative state; derived conditions such as burning, wet, frozen, scorched, charged, foamed, and damaged are readings, not stored flags. `PlaySave.chemistry` persists the per-map `"x:z"` records. Elemental command-wheel verbs (`burn`, `douse`, `freeze`, `wet`, `electrify`, `foam`) push axes through `applyChemistryVerbToSave`; chemistry ticks through `advanceChemistryForSave`; and the runtime projects derived conditions into existing `surface_layers` / `environment_fields` so the renderer, perception, and feedback layers still see fire, smoke, water, ice, electricity, foam, oil, and scorch tokens. **Actor/tile axis unification:** every actor standing on a chemistry cell — the player *and* NPCs — reads the cell's axes into `actor_physical_states` (heat/chill/wetness/charge/coating + labels), takes matching statuses (burn/slow/stun), and feeds the Alderamontico physical→emotional crosstalk, so a creature left in fire panics into flee behavior; leaving the cause decays the body record until it drops (`chemActorPhysicalStateFromCell` / `decayActorPhysicalStateRecord`, with `ChemActorExposure` results reporting newly-gained labels for feedback). Play Mode surfaces chemistry evolution loudly: notable tick transitions (ignited/spread/extinguished/froze/melted/arc) produce cell popups, one aggregated log line, and sfx, and actor exposure changes produce "X catches fire!" callouts. `scripts/test-chemistry.ts` proves fire spread over wood, ice melting, dousing with scorch residue, wet conduction, foam smothering, overlapping burning+charged state, authoring-surface seeding, and the full actor-unification loop (burn → NPC On Fire → burn status → arousal up → flee → decay after escape).
- `alderamonticoState.ts` is the headless **Alderamontico state-system** layer from doc 05. It defines emotional axes (`valence`, `arousal`, `grief`, `reverence`, `attachment`), derives named emotional regions/states from axis-space, infers behavior modes, applies physical-to-emotional crosstalk from actor physical states, supports the Grid's dominant-philosophy-axis amplification, advances authored Grid regions with optional lens multipliers, accrues Glass during sustained emotional extremes, records Attend memory, and builds Attend-gated Condition read-outs that hide exact emotional axes until attended. Actor records store `baseline_axes` (the authored disposition at first seed), and `advanceAlderamonticoEmotionalDecayForSave` relaxes live axes toward that baseline each clock tick (contract §4A: remove the cause and the feeling decays). Built-in emotional verbs live in `ALDERAMONTICO_EMOTIONAL_VERBS` / `applyAlderamonticoEmotionalVerbToSave`: **Yell** (range 4, arousal/fear spike, resisted at ×0.15 by grief/reverence/attachment ≥ 90, emits a real sound disturbance) and **Console** (adjacent, lowers grief/settles arousal, never resisted), each reporting before→after behavior for feedback. `PlaySave.alderamontico_state` persists this per-actor emotional layer and v2 save migration preserves it. Play Mode exposes Attend/Grid surfaces (faced-actor **Attend** button, condition panel, axis bars, Grid-pressure HUD), carries `yell`/`console` on the command wheel with popups/log narration ("they break and run", "Resisted"), and both combat AI (`resolveEnemyTurn`) and the exploration energy pump read `resolveAlderamonticoBehavior` — paralyzed/fade actors hold still (schedules pause), flee actors run from the player with a one-time "bolts in terror!" note, and baseline-bound enthralled actors guard without chasing while Grid-inflated default hostiles still pursue. `scripts/test-alderamontico-state.ts` proves regions/named states, physical panic crosstalk, Attend reveal, Grid amplification, authored Grid-region/lens amplification, Glass accrual, authored-axis seeding, skill impulses, emotion-driven enemy AI, built-in verb pushes/resistance, baseline decay convergence, and save-v2 preservation.
- `story.ts` is a framework-agnostic story service for condition contexts/evaluation, trigger and map-exit gates, cutscene branch label lookup, dialogue option visibility and choice resolution, shop stock/pricing, ambient bark selection, and ending lookup. `src/utils/conditions.ts` remains as a compatibility barrel.
- `src/schema/v2.ts` defines `crpg_engine_game_package_v2` and `crpg_engine_save_v2` wrappers, v1 -> v2 migration helpers, v1/v2 normalization helpers, and v2 -> v1 unwrap helpers so current v1 content can keep running while the package/save format evolves. Studio package export now defaults to package v2, package import accepts v1/v2 through normalization, IndexedDB package persistence stores v2 wrappers, save slots write save v2 payloads, and save-slot loading accepts legacy v1 saves. The v2 save runtime summary includes `kernel.world_facts`, simulation economy/regions, and combat state.
- `kernel.ts` is the first framework-agnostic **Systemic Grid Interaction Kernel** milestone. It derives stable runtime object instances from v1 authored item placements, dropped items, containers, container contents, doors, and object placements; applies move/remove deltas while preserving authored object identity; attaches instances to deterministic world-cell, actor-inventory, container-inventory, equipment-slot, hand-slot, shop-stock, hidden-cache, and destroyed holders; translates current interaction events into durable `world_facts`; annotates item movement facts with `from_holder_id` / `to_holder_id`; derives snapshot-level transfer records from persisted facts; derives committed transaction records for door open/close, container unlock/open/search, object push/move, and object break/remove; records baseline actor-specific visual/auditory/direct exposure for physical facts; derives simple `npc_noticed_world_fact` awareness records for exposed obvious changes; exposes optional kernel fact adapters for future simulation layers; appends facts to `PlaySave.world_facts`; and keeps v2 save migration/export aware of them. This is not the full future semantics/simulation stack, but doc 02's implementation-grounded kernel milestone is covered.
- The former casework layer has been fully removed because it behaved like a second dialogue/casework system. Its standalone design doc, schema registries, save state, engine module, Studio page, Play Mode wheel, Casebook overlay, dialogue claim-presentation UI, condition gates, default content, package normalization backfills, and public engine exports are gone.
- The **Systems-Heavy Grid Simulation** doc 03 is installed, and Phases S0-S8 are implemented at MVP scope. `src/engine-core/simulation.ts` builds a deterministic exact-cell simulation snapshot from current package/save data: cell walkability, LOS, height, terrain, `surface_tag`, hazard, infection, object footprints, open/closed doors, containers, authored/dropped items, entity placements, map deltas, inferred/authored material ids, physical condition records, manipulation affordances, runtime surface/trace/residue layers, runtime fire/smoke/light/sound fields, queued NPC tasks, active simulation processes, regional aggregate records, and regional LOD tier counts. S6 includes authored process/workstation definitions, process start/advance/interruption, actor/workstation occupation checks, local shop stock records, shortage flags, and shortage price effects. S7 includes save-backed exact/nearby/aggregate/dormant regional records, deterministic promotion/demotion ticks, tier tick rates, off-map environment/process/task advancement, aggregate-to-exact field reconciliation, and Studio exact/nearby/aggregate/dormant region counts. S8 keeps `adapt_simulation_semantics` as a neutral command surface that emits `simulation_semantics_adapted` counts without creating interpretation records. `SimulationEditor.tsx` shows S0-S8 overlays plus material profiles, condition counts, movable/cooperative object counts, max push cost, trace cells, residue cells, cleaned traces, surface layer counts, fire/smoke/light/sound cells, environment-field counts, NPC task counts, process counts, regional aggregate counts, LOD tier counts, semantic observation counts, evidence-link counts, and changed-condition/trace/residue/environment/task/process overlay cells for the selected map.
- `04_GRID_IMMERSIVE_SIM_ENGINE_ROADMAP_V1.md` is installed as the current immersive-sim roadmap. Stage 1 is implemented at MVP scope in `src/schema/game.ts` and `src/engine-core/objectModel.ts`: package data can declare inherited GameObject blueprints with data-driven Parts, normalization backfills the root object/physical/item/container/door blueprints, current v1 objects/items/kernel instances are mapped into resolved object runtimes, object-local Part dispatch supports listened events/vetoes/emissions, cascade dispatch reaches contained inventory, and Part emissions can commit durable world facts plus save-backed simulation condition/environment records. Stage 2 is implemented at headless MVP scope in `src/engine-core/immersiveSim.ts`: existing simulation snapshots normalize into tile property layers for temperature, liquid, gas, light, sound, occlusion, and movement/vision blocking; dynamic tile layers persist in `PlaySave.immersive_tile_layers`; and a serializable shared energy scheduler persists in `PlaySave.immersive_scheduler` while emitting `EndAction`, `EndSegment`, and `EndTurn` events. Stage 3 is MVP-complete for the current architecture: `IMMERSIVE_REACTION_RULES` exposes fixed-priority rules for oil+fire, water+fire->steam, fire+ice->meltwater/steam, electricity+water, poison+fire, cold+water, and acid+material; fire spreads to adjacent flammables, electricity chains through wet cells, smoke/poison gas diffuses to neighboring open cells, consumed source fire/water/ice deltas are removed from the save, and reactions commit environment fields, surface residue, cell conditions, tile-layer state, durable world facts, actor statuses, and multi-axis actor physical states. Stage 4 is MVP-complete and surfaced at Play MVP scope: perception snapshots derive light/sound/fire/gas/player-visibility stimuli; visual perception uses LOS, viewcone, and facing checks; save advancement runs outside combat, writes NPC alertness/investigation targets, queues investigation/report tasks, emits durable alert/give-up facts, decays stale alerts, stores `flags.immersive_stealth_feedback`, and surfaces through a stealth gem, seeing/alerted counts, alert rows, per-NPC canvas badges, alert barks, warning audio, popups, and logs. Stage 5 is MVP-complete at headless scope: `IMMERSIVE_GLOBAL_VERBS` exposes the canonical verb registry, and `applyImmersiveGlobalVerbToSave` supports `push`, `pull`, `throw`, `drop`, `stack`, `climb`, `burn`, `douse`, `freeze`, `break`, `hack`, `wet`, `electrify`, `foam`, and `mimic` as the headless/fallback verb surface. In live Play Mode, elemental verbs now resolve first through `applyChemistryVerbToSave`, while non-elemental drop/movement/traversal verbs continue through `applyImmersiveGlobalVerbToSave`. Stage 6 is MVP-complete at headless scope and Play MVP scope: `createImmersiveCombatTacticalSnapshotFromV1` derives actors, teams, facing, height, statuses, directional cover edges, overwatch zones, and telegraphed hostile intents; `applyImmersiveCombatForcedMovementToSave` resolves scheduler-backed knockback through reactions/statuses/hazards and overwatch; and `applyImmersiveCombatAttackToSave` resolves LOS, cover mitigation, flanking, height/facing modifiers, HP/death writes, and combat facts. Play Mode surfaces Shove and Overwatch, routes in-combat melee through the Stage 6 attack resolver, previews faced-target cover/flank/height modifiers in the combat HUD, echoes modifiers through popups/logs, and paints overwatch zones, hostile intent target cells, actor-following hostile intent tethers, and alert badges on the canvas; cover edges remain tactical data/readouts rather than a map-wide canvas overlay. Stage 7 is MVP-complete at headless scope and Play MVP scope: items can author `spatial` profiles with shape/weight/bulk/stack-limit hints; maps can author `regions` with faction thresholds, survival deltas, passive checks, and irreversible denial flags; `createImmersiveSpatialInventorySnapshotFromSave` packs item stacks into a slot grid using authored/fallback shapes, computes load-to-AP penalties, and projects inventory as actor-held world objects; `evaluateImmersiveWorldStateForSave` reads authored region rules, reputation, survival flags, inventory load, and passive checks; and `advanceImmersiveWorldStateForSave` persists survival/denial/inventory/consequence flags plus world-state facts. Play Mode advances/evaluates that world state for a Condition HUD, load/AP pressure display, warning audio/log feedback, a top-right region denial/pressure banner, movement/verb denial gates, field-ration survival restoration, and a completed S6 workstation prompt: multi-process selection, costed Start/Work actions, Cancel, completion/output readiness, and Collect for produced drops. The systems map includes a visible alchemy bench wired to health-tonic and field-ration processes. `SimulationEditor.tsx` exposes object/Part summaries, Stage 2 tile/scheduler summaries, Stage 3 reaction rules/facts, Stage 4 stimuli/alerts, Stage 5 global verb registry/facts, Stage 6 tactical actors/cover/overwatch/intents, and Stage 7 spatial inventory/world-state gates/consequences. Later roadmap work still remains: richer authored encounters/tuning, broader world-state consequence content, and full core-authoritative runtime extraction.
- `05_ALDERAMONTICO_STATE_SYSTEM_CONTRACT_V1.md` is installed as a game-specific target contract. The physical half is grounded by the numeric-axis chemistry core, and the first emotional/Grid implementation is live in `alderamonticoState.ts` plus Play Mode: emotional axes, derived named states, physical-to-emotional crosstalk, Attend-gated read-outs, Grid dominant-axis amplification, authored Grid-region/lens advancement, Glass accrual, save persistence, v2 preservation, faced-actor Attend input, compact condition readout HUD, current-region Grid-pressure HUD, emotional `yell`/`console` verbs, authored skill emotional impulses, emotion-driven combat/exploration AI behavior, baseline emotional decay, Studio authoring for entity axes/skill impulses/Grid regions, and chemistry-scope actor/tile physical-axis unification. Remaining doc 05 work is narrower: richer region/lens authoring overlays, a held sixth emotional axis, and unifying the remaining immersive-sim tile-layer exposure path with the chemistry-axis substrate.
- `scripts/test-engine-core.ts` proves deterministic RNG, command acceptance/rejection, the v1 package/save adapter, kernel facts, story and shop services, combat/status systems, package/save v2 migration, removed-layer field stripping, Simulation S0-S8 behavior, the completed Phase 6 headless acceptance slice, and v1 validation against authored demo-map fixtures.
- **Live adoption (partial but real):** `PlayMode.tsx` still owns the loop, but the authoritative exploration verbs and most cutscene/story effects now route through the core and commit the core-produced `PlaySave` via `playStore.commitRuntimeSave`:
  - **movement** — keyboard, virtual joystick, and click-to-move one-step movement route through `dispatchV1MoveEntity` as the legality gate, apply the moved save, and spend successful non-combat player movement energy in the adapter;
  - **item pickup** — `handleAct` resolves ground items through `dispatchV1TakeItem`, including the successful pickup energy cost (legacy mutators kept as fallback);
  - **door opening** — `handleAct` opens doors through `dispatchV1OpenDoor`, including the successful open-door energy cost; dialogue-linked doors remain open after their dialogue ends because the persisted opened-door delta stays authoritative;
  - **map transition** — walk-on exits resolve the target map/spawn through `dispatchV1ChangeMap` and commit the core-produced save; exit condition gates read through `engine-core/story.ts`, while combat flee cleanup, audio, and logs remain in `PlayMode`;
  - **trigger firing** — eligible `on_load`, `step`, and `interact` triggers persist once-only run flags through `dispatchV1FireTrigger`; trigger condition gates read through `engine-core/story.ts`, while cutscene launch remains in `PlayMode`;
  - **container locking/opening** — `handleAct` unlocks and opens containers through `dispatchV1UnlockContainer` / `dispatchV1OpenContainer`, including key checks, optional key consumption, container deltas, and successful energy costs;
  - **container item transfer** — the container modal takes one stack, takes all, and stows one inventory item through `dispatchV1TakeFromContainer`, `dispatchV1TakeAllFromContainer`, and `dispatchV1StowInContainer`; the modal UI, audio, and logs remain in `PlayMode`.
  - **wait / pass turn** — an out-of-combat wait routes through `dispatchV1Wait` as the authoritative turn/energy gate (HP/MP regen, sfx, and log remain presentation side effects; legacy energy mutator kept as fallback);
  - **cutscene / story effects** — the cutscene runner routes authored save-changing verbs through `dispatchV1*` commands: switch/quest/item/currency/faction/document/skill/objective effects, absolute player/entity positioning, teleports, player sprite swaps, healing/restoration, party add/remove, clock jumps, stat deltas, entity visibility, bark cooldown recording, and endings. Legacy store mutators remain as fallback; audio/UI/camera/fade/log presentation stays in `PlayMode`.
  - **dialogue graph choices / objectives** — dialogue option visibility reads through `story.ts`, option selection routes through `dispatchV1ChooseDialogueOption` (applying switches/quests and returning next-node/cutscene outcomes), and talking to a matching NPC/party member completes talk objectives through `dispatchV1CompleteQuestObjective`;
  - **shop transactions** — the shop panel reads stock/pricing through `story.ts` and buys/sells through `dispatchV1BuyShopItem` / `dispatchV1SellInventoryItem`, committing core-produced money/inventory changes and transaction events;
  - **ambient barks / endings** — bark selection reads through `story.ts`; fired barks record save-backed cooldowns through `dispatchV1RecordBark`, and `game_end` cutscene actions route through `dispatchV1GameEnd` before the end-screen presenter opens;
  - **combat orchestration** — combat start/end/reinforcement, initiative queues, turn advancement, controlled actor snapshots, targeting cells/range overlays, enemy turns, targeted skill casts, queued combat XP payout, and opportunity attacks now route through `dispatchV1UpdateCombatSession`, `dispatchV1AdvanceCombatTurn`, `dispatchV1EnemyTurn`, `dispatchV1CastSkill`, and the V1 combat read helpers; out-of-combat melee still uses `dispatchV1MeleeAttack`, while in-combat basic attacks now route through `applyImmersiveCombatAttackToSave` so cover/flanking/height/facing affect real damage. PlayMode still owns input gestures, HUD layout, targeting cursor state, audio, logs, and FX presentation.
- **Event stream + inspector:** each dispatch's structured events (`entity_moved`, `waited`, `item_acquired`, `door_opened`, `map_changed`, `trigger_fired`, `container_unlocked`, `container_opened`, `container_item_taken`, `container_items_taken`, `container_item_stowed`, `switch_set`, `quest_updated`, `item_granted`, `item_removed`, `currency_changed`, `faction_rep_changed`, `document_read`, `skill_learned`, `quest_objective_completed`, `melee_attack_resolved`, `skill_cast_resolved`, `combat_started`, `combat_reinforced`, `combat_ended`, `combat_turn_advanced`, `enemy_turn_resolved`, `opportunity_attack_resolved`, `resource_spent`, `command_accepted`, ...) are captured into `playStore.engineEvents` (capped, re-stamped with unique ids, not persisted) via `pushEngineEvents`, and surfaced live by a Play-mode **Events** debug overlay (toggled next to the **Fog** control). This is the first runtime/debug inspector. The same overlay now also shows a **Kernel world facts** section reading `PlaySave.world_facts` — the durable interaction facts (`object_taken`, `door_opened`, `container_*`, `object_pushed`, …) that the v1 dispatchers append to the committed save via `buildV1DispatchResult`. Verified live: picking up the demo token records `object_taken · player` facts in the panel.
- **Command wheel surfacing:** `CommandWheel.tsx` exposes the immersive global-verb Play surface. Build-order Phase 1 (`drop`), Phase 2 elemental verbs (`burn`, `douse`, `freeze`, `wet`, `electrify`, `foam`), Phase 3 non-hack movement/traversal verbs (`push`, `pull`, `throw`, `stack`, `climb`, `break`), and the two Alderamontico emotional verbs (`yell`, `console`) are enabled through `PLAYMODE_COMMAND_WHEEL_VERBS` with highlighted nearby target cells/objects/actors. Elemental verbs resolve through `applyChemistryVerbToSave`; non-elemental drop/movement/traversal verbs resolve through the canonical `applyImmersiveGlobalVerbToSave` pipeline; emotional verbs resolve through `applyAlderamonticoEmotionalVerbToSave` against the actor standing on the targeted cell. Elemental results now surface through renderer-visible world deltas, player/NPC body-state badges, and a player Body HUD with temperature/wetness/heat/chill/charge/coating/toxicity axes. `hack` is intentionally omitted from the player-facing wheel for now, and `mimic` remains visible-but-disabled for a later form/identity slice.
- **Chemistry command wheel override:** elemental command-wheel verbs now take the newer `applyChemistryVerbToSave` path before the older global-verb fallback. The chemistry path stores numeric axes in `PlaySave.chemistry`, advances several settle ticks per elemental command, projects derived surface/environment tokens back to map deltas, and advances one chemistry tick on movement/clock changes so fires can continue spreading and ice can melt after the initial command.
- **Combat surfacing:** Phase 4 is complete at Play MVP scope. The combat tactics bar exposes **Shove**, which moves the faced hostile with `applyImmersiveCombatForcedMovementToSave`, commits hazards/reactions/overwatch facts, shows popups/logs, and advances the combat turn, and **Overwatch**, which spends the turn arming the player's reactive zone through `applyImmersivePlayerOverwatchToSave` (armed button state, zone painted on canvas); ordinary enemy movement then resolves the zone through `applyImmersiveOverwatchToMovementSave` with reaction popups, logs, hit flashes, and XP when the reaction hit drops the mover, and the stance disarms when combat ends. In-combat melee uses `applyImmersiveCombatAttackToSave`, so LOS, directional cover, flanking, and height/facing modifiers affect actual damage. The initiative HUD reads `createImmersiveCombatTacticalSnapshotFromV1` to show hostile intent labels, overwatch/cover totals, and a faced-target base/hit/modifier readout; `GameRenderer2D` paints overwatch zones, intent target cells, actor-following hostile intent tethers, and alert badges. Cover edges remain in the tactical snapshot/HUD math and are no longer painted as a map-wide canvas overlay.
- **Stealth/perception surfacing:** Phase 5 is complete at Play MVP scope. Outside combat, Play Mode advances `advanceImmersivePerceptionForSave`; the left HUD shows a compact visibility gem with seeing/alerted counts and the top alert sources; `GameRenderer2D` paints NPC alert badges for suspicious/searching/combat states; alert escalation/decay emits barks, warning audio, popups, logs, investigation targets, and durable alert/give-up facts. The systems test map includes a lit stealth-watcher lane that exercises this path.
- **Survival/world-state surfacing:** Phase 6 is complete at Play MVP scope. Outside combat, Play Mode advances/evaluates `advanceImmersiveWorldStateForSave` and `evaluateImmersiveWorldStateForSave`; the right HUD shows a Condition panel with hunger, thirst, fatigue, exposure, and load/AP pressure; the top-right region banner surfaces the strongest denial/warning gate with warning audio and log feedback; and denied movement/non-drop verb targets are blocked with popups/logs. The systems test map authors initial regions, survival deltas, and a gated Systems Lab rule.
- **Workstation surfacing:** Phase 7 is complete at Play MVP scope. Standing on or facing an authored S6 workstation shows a compact prompt with multi-process selection, Start/Work/Cancel, progress, output readiness, and Collect for produced drops. It routes process start through `dispatchV1StartProcess`, process ticks through `dispatchV1AdvanceProcesses`, and cancellation through `dispatchV1InterruptProcess`; Start/Work/Collect spend shared action energy. The systems test map includes a visible alchemy bench wired to `sim_proc_brew_tonic` and `sim_proc_pack_field_ration`.
- **Status effects in combat:** skills with a `status` payload now apply real statuses (stored in `PlaySave.actor_statuses` for the player and `entity_states[key].statuses` for entities). They tick at the start of each combat turn (periodic damage/heal + duration, via a dedicated effect), fold flat stat modifiers into melee `attack`/`defense`, and show as chips beneath the player vitality HUD. The integration is a strict **no-op for statusless content**. **Stun turn-skip is now enforced** for every actor (a `skipTurn` status advances the turn; the enemy-AI effect's `active_turn_id` guard makes a stunned enemy stand down), and **damage-over-time kills now award XP** (a poison/bleed/burn that drops a hostile queues the same end-of-combat XP as a melee kill). The remaining follow-up is broader authored-status content coverage.
- **Save-backed fog of war:** explored cells now persist. `PlaySave.explored_cells` (per-map `"x:z"` keys) is seeded into `GameRenderer2D` on load and the renderer reports newly-seen cells back through an `onExplore` callback that merges them via `playStore.markCellsExplored`, so fog survives reloads and map changes (no-op when nothing new is revealed). Fog line-of-sight treats closed door placements as walls and stops treating them as blockers once their `opened_doors` delta is present.

---

## 3. Data model — game package (`src/schema/game.ts`)

`GamePackageSchema` is the authoritative content contract. Top-level libraries:

| Library | Contents |
|---|---|
| `metadata` | title, version, start map/spawn |
| `settings` | clock start/min-per-turn, player sprite, starting skills/party, base player stats, music/sound tables, map music, dialogue portraits, end title |
| `maps` | grid maps (see §5) |
| `object_library` | objects/tiles (now with `tile_sprite_id` for 2D) |
| `sprite_library` | pixel-art sprites (`pixels[]` or `data_url`) |
| `entities` | NPC/creature definitions |
| `dialogue` | dialogue graphs |
| `documents` | readable in-world text |
| `quests` | quests + objectives |
| `cutscenes` | event-action sequences |
| `switches` | boolean story flags |
| `items` | item definitions |
| `abilities` | skills (combat/heal) |
| `shops` | shop stock + pricing |
| `barks` | ambient NPC-to-NPC lines |
| `factions`, `endings`, `encounters`, `validators` | present; factions/endings/encounters are lightly used or schema stubs |

### Maps (`MapDataSchema`)
- `width/height`, `spawns`, `cells[]`, `custom_object_placements[]`, `entity_placements[]` (with optional NPC `schedule`), `item_placements[]` (ground loot), `container_placements[]` (lockable chests), `triggers[]`, `exits[]` (walk-on map transitions).
- **Cells** (`CellSchema`): `x,y,z`, `active`, `walkable`, `blocks_los`, `height`, `visual_height`, `terrain`, `object_id` (floor/wall tile), `region_id`, `room_id`, `hazard`, `infection`, `portal_id`, and a `surface_tag` (`water|oil|blood|poison|firehazard|ice`). Movement keys off `walkable`; LOS off `blocks_los`; `y/height/visual_height` are cosmetic in 2D.

### Objects (`ObjectSchema`)
- `category`, `tags`, `bounds`, `collision` (profile + footprint), legacy 3D model data (`parts`/`mesh`/`asset`/materials), and **`tile_sprite_id`** — the top-down 2D tile drawn by the renderer. Default tiles for all preset objects are generated in `src/utils/defaultTiles.ts` and bound on package load.

---

## 4. Save & persistence (`src/schema/save.ts`, `playStore.ts`)

- `PlaySave` (`crpg_engine_save_v1`): player cell/facing/sprite, `playerStats` (hp/max_hp/mp/max_mp/attack/defense/speed/energy), level/experience/pending level-ups, `known_skills`, `flags`, `quests`, `inventory`, optional `inventory_layout`, optional `chemistry` per-map numeric cell axes, `money`, `entity_states`, `party_members`, `map_deltas`, `clock_minutes`, `faction_rep`, `read_documents`, optional `actor_physical_states`, optional `alderamontico_state`, optional `world_facts`, simulation economy/regions, and turn-queue combat fields (`in_combat`, `combat_queue`, `active_turn_id`, `combat_xp_pool`).
- **Map deltas** (`MapDelta`): `taken_items`, `opened_doors`, `dropped_items`, per-container state. Composed as *authored map + save delta = current map*.
- **Save slots** with read/write/delete; the studio persists the working package to IndexedDB.
- **Fog note:** the fog toggle is persisted as a visual setting, and per-map explored cells are now **save-backed** — `PlaySave.explored_cells` (per-map `"x:z"` keys) is seeded into the renderer on load and grown via `playStore.markCellsExplored` as the player sees new cells, so fog survives reloads.

---

## 5. 2D rendering (`src/components/GameRenderer2D.tsx`, `src/utils/tileRendering.ts`)

The single renderer used by **both Play and the Map editor** (drop-in replacement for the old 3D `GameRenderer`). Flat top-down ("early-Ultima") look on a `<canvas>` via `requestAnimationFrame`.

Draw order per frame: floor/wall tiles (`cell.object_id` → `tile_sprite_id`, else flat color) + surface tints → combat range/target highlights → grid (editor) → object placements (props/doors/containers, doors rotate when open) → ground items → entities → party followers → player (all with smooth tile-to-tile slide + turn rings + HP bars) → Play Mode fog veil → hovered-cell outline → editor markers (triggers/spawns/lint/brush) → FX (damage popups, barks, hurt vignette, combat border).

- **Camera:** smooth-follow on `renderCenter`/player in play; pan (middle/right-drag) + wheel-zoom + "Fit" in the editor.
- **Input:** canvas pointer → cell, forwarded as `onCellClick`/`onCellHover` (combat targeting in play; paint/drag-paint in the editor).
- **Tiles/sprites:** `tileRendering.ts` rasterizes `SpriteData` (pixel arrays or data-URLs) to cached offscreen canvases; placeholder colors derive from object material/category when no tile is set.
- **Fog of war:** optional in Play Mode. The renderer computes a radius-limited Bresenham LOS field from the player, treats `blocks_los` cells as occluders, blacks out never-seen cells, and dims explored-but-not-currently-visible cells.

---

## 6. Movement, interaction & exploration (`PlayMode.tsx`)

- **Direct movement:** WASD/arrow keys + an on-screen **virtual joystick** (8-direction). Single key = orthogonal, two keys = diagonal. Input maps straight to world grid deltas (flat top-down; no camera rotation).
- **Collision:** target cell must be `walkable`, not blocked by an object collision profile or an entity placement; large `visual_height` steps block. Movement legality, the successful position/facing save mutation, and successful non-combat player movement energy now run through `dispatchV1MoveEntity` in `src/engine-core/v1Runtime.ts`; `PlayMode` still applies its legacy interaction and side-effect branches.
- **Interaction:** "Act" resolves the best target by facing/adjacency — talk to NPCs, open doors (persisted), loot containers (with key/lock checks), pick up ground items, read terminals, trigger interact-cutscenes, and push a faced movable object. Ground-item pickup, door opening, container unlock/open/transfer, and push run through engine-core v1 dispatchers (`dispatchV1TakeItem`, `dispatchV1OpenDoor`, `dispatchV1UnlockContainer`, `dispatchV1OpenContainer`, `dispatchV1TakeFromContainer`, `dispatchV1TakeAllFromContainer`, `dispatchV1StowInContainer`, `dispatchV1PushObject`), committing the core-produced save and emitting structured events plus successful `resource_spent` events where relevant. Item drop and object break are player-facing through the command wheel/global-verb path (`drop` / `break`) rather than Act-path v1 dispatchers. The legacy `dispatchV1CloseDoor`, `dispatchV1SearchContainer`, and `dispatchV1BreakObject` wrappers exist and are tested headlessly, but are not currently bound as direct Act actions.
- **World time:** turns advance the clock (`minutes_per_turn`); clock phases (late_night/night/dawn/day/dusk) gate conditions and map ambience.
- **Map travel:** walk onto an `exit` cell -> transition to another map/spawn (conditions supported). The save mutation (`current_map_id`, player spawn cell/facing) now runs through `dispatchV1ChangeMap`; exit condition gates now read through the core story service, while presentation side effects remain local. The default `map_overworld` is now an authored **Engine Systems Test Map** with routes for movement/collision/LOS, surfaces/heights, triggers/cutscenes, items, containers, NPC dialogue, shop/party, ambient barks, combat, and exits into the demo ground map. Package normalization replaces the old generated/imported overworld and refreshes stale persisted systems-map packages so required test NPCs/barks surface.
- **Visibility:** a HUD `Fog` control toggles tactical fog of war in Play Mode. Closed doors block fog line-of-sight like walls until opened. Fog itself remains a player-facing renderer feature; the save-backed stealth/perception foothold now lives in the doc 04 Stage 4 immersive-sim layer.

---

## 7. Dialogue & barks (`DialogueEditor.tsx`, `PlayMode.tsx`, `fxStore.ts`)

- **Dialogue graphs:** nodes with speaker, text, optional scene image, and options. Options support gates (`required_quest/_state`, `required_switch`, general `condition`), and side effects (`trigger_quest`, `set_switch(es)`, `trigger_cutscene`, branch via `next_node_id`).
- **Party talk:** entities can have a separate `party_dialogue_id` used when recruited.
- **Barks:** authored two-speaker ambient exchanges that fire when both speakers are near each other and the player is in earshot, gated by `condition` + cooldown; rendered as floating canvas text. The systems test map includes a dedicated bark pair near the start route.

---

## 8. Quests, journal & documents

- **Quests** (`QuestSchema`): objectives of type `talk|kill|collect|explore|interact|custom` with counts/targets. Progress is driven by gameplay events and dialogue/cutscene effects; quest state stored per save.
- **Documents** (`DocumentSchema`): titled text shown in a reader; `read_documents` tracked for conditions/journal.
- In-game journal/quest log + document reader UI in `PlayMode`.

---

## 9. Cutscenes, events, triggers & conditions

- **Cutscenes** (`CutsceneSchema`): ordered `EventAction[]`, blocking or not. **~35 action verbs**, including: `move_player/entity`, `show_dialogue`, `set_switch`, `wait`, `teleport_player`, `play_sound/music`, `start_combat`, `give/remove_item`, `give/remove_currency`, `set_player_sprite`, `read_document`, `heal_player`, `restore_party`, `open_shop`, `add/remove_party_member`, `label`/`branch` (conditional control flow), `screen_fade`, `camera_pan`, `adjust_faction_rep`, `open_save_menu`, `advance_clock`, `modify_player_stats`, `learn_skill`, `set_entity_hidden`, `game_end`, `custom`.
- **Triggers** (`TriggerSchema`): types `step | interact | on_load | switch_change`, with legacy switch conditions + a general `condition`, `once` flag, and a `cutscene_id` to run. Eligible live `on_load`, `step`, and `interact` triggers now fire through `dispatchV1FireTrigger`, emitting `trigger_fired` and persisting `trig_run_*` flags for once-only triggers.
- **Conditions** (`src/engine-core/story.ts`, compatibility export at `src/utils/conditions.ts`, `ConditionData`): composable predicates — `switch`/`switch_value`, `quest`/`quest_state`, `has_item`/`item_count`, `party_contains`, faction `rep_gte/lte`, `time_of_day`, `hour_gte/lt` (wrapping), combined with `all`/`any`/`not`. Trigger gates, map-exit gates, cutscene branch tests, dialogue option visibility, shop stock/pricing, and bark selection now call this core story service. Authored via `ConditionEditor.tsx`.

---

## 10. Combat (`PlayMode.tsx`, `src/utils/combat.ts`)

- **Turn-queue tactical combat on the same map.** Engages when a hostile is within `THREAT_RADIUS` (6); hostiles chase within `CHASE_RADIUS` (8).
- **Initiative** ordered by `speed`; queue holds `"player"`, party entity ids, and enemy state keys; `active_turn_id` marks the actor. Session start/end/reinforcement and `advance_combat_turn` now run through engine-core.
- **Per turn:** move one cell, basic Act attack, use a skill, or Wait. Party followers take turns; enemies use core-owned chase + attack AI via `enemy_turn`.
- **Damage model:** melee attacks and skill damage now resolve in `engine-core` (`attack - defense`, min 1 for melee; payload + half attack - defense for skills; 10% crit at 1.5x), using the deterministic combat RNG stream rather than ambient `Math.random`.
- **Resources/reactions:** AP-style one-action turns + MP for skills; energy gates exploration actions. Successful movement, ground-item pickup, door opening, container unlock/open, out-of-combat melee attacks, and out-of-combat player skill casts spend energy through the v1 core adapter. Combat movement away from an adjacent hostile can trigger a core opportunity attack.
- **Feedback:** floating damage/heal numbers, hit flashes, threat rings, active-turn rings, HP bars, danger HUD, combat music/screen tint (all via `fxStore` + `GameRenderer2D`).
- **Outcome:** XP awarded on enemy defeat, level-up prompts, persistent death/hidden state.

---

## 11. Skills / abilities (`SkillEditor.tsx`, `SkillSchema`)

- Abilities with `ap_cost`, `mp_cost`, `element` (none/fire/shock/water/cold/poison/physical), `range`, and **targeting shapes**: `single | line | cone | cross | block`.
- **Payloads:** `damage | heal | status | summon` (value, optional `target_tags`, `status_effect` id, summon `entity_id`). `damage`/`heal` and now `status` are applied at runtime (status payloads add a real status via the engine-core status runtime — see "Engine-core foothold" above); `summon` remains schema-only.
- Targeting in play shows a range field + target pattern on the canvas; directional keys move the target cursor. Known skills tracked per save; learned via `learn_skill`.

---

## 12. Items, inventory, containers, shops & economy

- **Items** (`ItemSchema`): `category` (consumable/weapon/armor/key), `icon`/`sprite_id`, and `effects` (heal, mp/energy restore, max-hp bonus, damage, attack/defense/speed bonus). Items are **used** to apply effects (no dedicated equipment-slot system).
- **Inventory:** a single stacked list + `money`; pick up, use, drop (drops persist).
- **Containers** (`ContainerPlacementSchema`): rendered from an object, lockable with a `key_item_id` (optionally consumed), authored contents, per-save locked/opened state. Act-driven unlock/open and modal item transfer now run through core commands; the modal remains local UI/presentation.
- **Shops** (`ShopSchema`): stock with base price, visibility `condition`, and ordered `price_modifiers` (multiplier + delta gated by conditions). Buy/sell UI in play.
- **Currency:** single abstract `money` value; `give/remove_currency` effects.

---

## 13. Entities, party, AI & schedules

- **Entities** (`EntitySchema`): sprite, dialogue (+ party dialogue), `is_npc`, stats (hp/mp/attack/defense/speed), `xp_reward`, and a `skills` list (cast on their combat turns).
- **Placements** carry an optional **schedule** (`ScheduleEntry`: hour → cell). Friendly NPCs walk their daily routine; hostiles use chase AI.
- **Party:** recruit/dismiss via effects; followers trail the player in formation and act in combat; party member dialogue.

---

## 14. Factions, reputation & time

- **Faction reputation:** numeric `faction_rep` per save; `adjust_faction_rep` effect; conditions gate on `rep_gte/lte`. (Faction *definitions* are a light/stub library.)
- **World clock:** `clock_minutes`, phase ids, `advance_clock`; drives schedules, time-gated conditions, and per-map time-of-day music.

---

## 15. Progression (`src/utils/leveling.ts`)

- **Levels + XP** with a rising curve (`30 + (n−2)*15` per level). On level-up, the player picks one stat boost: **Vitality** (+5 max HP), **Aether** (+3 max MP), **Might** (+1 atk), **Guard** (+1 def), **Speed** (+1). `modify_player_stats` and `learn_skill` effects also drive growth.

---

## 16. Audio & FX

- **Audio** (`src/utils/audioManager.ts`): music tracks, sound effects, and per-map music defined in `settings`; `play_music`/`play_sound`/`stop` via cutscene actions; positional player ref retained for ambience.
- **FX** (`fxStore.ts` + `GameRenderer2D`): damage/heal popups, ambient bark bubbles, hit flashes, player-hurt vignette, screen pulse, and `screen_fade` (DOM overlay).

---

## 17. Authoring suite (the studio)

All editors operate on the live `GamePackage` in `engineStore` with global undo/redo and import/export.

- **Map editor** (`MapEditor.tsx`): flat top-down 2D viewport (`GameRenderer2D`); tools — `walkable`, `blocked`, `height_up/down`, `spawn`, `object`, `tile`, `interact` (assign dialogue), `enemy`, `trigger`, `stamp`; brush sizes, layer (Y) selector, lint overlay, map resize, coordinate-indexed large-map painting, and "Play map" test.
- **Tile Maker** (`TileMaker.tsx`): pixel-grid tile editor (brush/eraser/fill + palette) that authors top-down tile sprites and binds them to objects via `tile_sprite_id`; object list with tile thumbnails; create new tile-objects. *(Replaces the former 3D Model Maker.)*
- **Sprite Creator** (`SpriteCreator.tsx`): pixel-art editor for character/item sprites (+ image import, AI generation).
- **Dialogue / Quest / Entity / Event (cutscene) / Item / Document / Shop / Skill editors** — form/graph editors for each library, with a shared `ConditionEditor` and `AIGenerationModal`.

---

## 18. Validation, audits & utilities

- **Schema validation:** Zod parse on import; references checked on load.
- **Headless core test:** `test-engine-core.ts` covers deterministic RNG, the command/effect/event pipeline, invalid-command rejection, v1 package/save fixtures for movement, item pickup/drop, push/pull/drag/carry-object, break-object, clean-surface, decay-surfaces, ignite-fire, extinguish-fire, advance-environment, emit-sound, advance-npc-tasks, start-process, interrupt-process, advance-processes, advance-simulation-regions, adapt-simulation-semantics, door open/close, map transitions, trigger firing, containers, kernel object instance/holder/fact/transfer/transaction/exposure/awareness/adapter derivation, expanded state/story commands, dialogue choice transitions/effects, shop buy/sell transactions, bark cooldowns, endings, story read services, explicit quest-objective completion, combat session/turn/enemy services, core targeting cells, opportunity attacks, melee attack resolution, skill damage/heal/status payloads, combat XP/objective completion, successful-only resource costs (`resource_spent`), package/save v2 migration/import/export/save-slot normalization, legacy/stale overworld replacement, Simulation S0-S8 coverage, doc 04 Stage 2 scheduler/tile-layer persistence, doc 04 Stage 3 reaction rules/propagation/statuses, doc 04 Stage 4 perception LOS/viewcones/decay, doc 04 Stage 5 global verbs, doc 04 Stage 6 forced movement/cover/flanking/overwatch/telegraphs/height/facing combat, doc 04 Stage 7 spatial inventory/world-state gates, systems-test-map stealth watcher/region-gate/workstation authoring, save v2 persistence, the completed Phase 6 headless acceptance slice, and the status-effect runtime.
- **Browser Phase 6 smoke:** the local app at `http://localhost:5003/` was smoke-tested through Map Editor -> Play map -> New Game. The selected demo map loaded into Play, the canvas/HUD rendered, the demo-tour dialogue option updated the quest log, a playfield click completed without breaking the run, and no console errors were captured.
- **Audits (`scripts/`):** `audit-maps.ts` (reachability, placement, spawn checks), `audit-combat.ts`, `audit-region.ts` (continuous continent invariants), plus `mapValidator.ts`.
- **Authoring utils (`src/utils/`):** `mapAuthoring.ts`, `proceduralStarters.ts`, `basicStamps.ts`, `basicTheme.ts`, `overworldMap.ts`, `objectFootprint.ts`, `doorPlacement.ts`, `entityState.ts`, `aiMapAuthoring.ts`, `mapPrinter.ts`.

---

## 19. File map (current, active)

```
src/
  App.tsx, main.tsx, index.css
  components/
    AppShell.tsx              # studio shell + nav
    PlayMode.tsx              # runtime: game loop, combat, UI (uses GameRenderer2D)
    GameRenderer2D.tsx        # 2D top-down canvas renderer (play + editor)
    MapEditor.tsx             # 2D tile/map editor
    TileMaker.tsx             # 2D tile authoring
    SpriteCreator.tsx         # pixel sprite editor
    DialogueEditor / QuestEditor / EntityEditor / CutsceneEditor /
    ItemEditor / DocumentEditor / ShopEditor / SkillEditor / ConditionEditor
  store/      engineStore, playStore, fxStore, visualSettingsStore
  engine-core/
              rng.ts, events.ts, registry.ts, pipeline.ts, world.ts,
              kernel.ts,
              statuses.ts, v1Runtime.ts
  schema/     game.ts, presets.ts, save.ts
  utils/      tileRendering.ts, defaultTiles.ts, conditions.ts, combat.ts,
              leveling.ts, doorPlacement.ts, entityState.ts, playModeMap.ts,
              audioManager.ts,
              mapAuthoring.ts, mapValidator.ts, overworldMap.ts, ...
scripts/      audit-maps.ts, audit-combat.ts, test-engine-core.ts,
server.ts, vite.config.ts
```

**Dead/unwired (kept on disk, not in the 2D path):** `GameRenderer.tsx`, `ObjectRenderers.tsx`, `ScreenFX.tsx`, `ModelMaker.tsx`, `ModelGallery.tsx`, `ObjectPreviewHelpers.tsx`, and the 3D mesh utils (`meshModel.ts`, `modelGenerators.ts`, `gltfModelIO.ts`, `objectMaterials.ts`). Three.js still ships in the bundle via dead imports in `PlayMode.tsx`.

---

## 20. Known limitations (pointers, not detail)

State still mostly lives in Zustand + the `PlayMode.tsx` monolith. A tested `engine-core` foothold and v1 package/save grid adapter exist, and a broad command surface now runs through the command/effect/event pipeline, commits the core-produced save, spends successful action costs through the adapter where relevant, and publishes structured events into a basic Play-mode debug inspector. Core story services now own condition evaluation, dialogue choice transitions/effects, shop stock/pricing/transactions, bark selection/cooldowns, trigger/exit/branch gates, and ending lookup; core combat services now own session transitions, initiative/turn advancement, targeting cells, enemy turns, and opportunity attacks. The doc 02 systemic interaction kernel milestone is now implemented for the current v1 runtime: holder/transfer coverage includes world cells, actor inventory, containers, shop transactions, drops, and system grant/remove item commands; transaction coverage includes door open/close, container unlock/open/search, object push/move, and object break/remove; collision/navigation/rendering read move/remove deltas through `applyPlacementDeltas`; K4-K6 have actor-specific baseline exposure, obvious-change awareness records, and optional adapter hooks. Remaining work belongs to later base/gameplay/semantics/simulation layers: authored NPC behavior trees do not yet consume awareness records, equipment and hand holders do not yet have a live equipment runtime, ownership/access authoring is thin, rotate/repair/barricade-specific transactions are future verbs, and object-history Studio views are still basic. The core is **not yet** the authoritative package/load/save runtime or ECS model, and PlayMode still owns presentation/orchestration: input gestures, HUD/modals, audio, logs, camera/fade timing, scene launch, and cutscene pacing. `src/schema/v2.ts` now backs Studio import/export and save-slot normalization, but the live runtime still unwraps to v1-compatible content internally. Maps are single-plane `x/z` grids with no named planes, full region behavior, or tileset autotiling. Fog of war is save-backed, while Stage 4 perception/stealth now has save-backed alertness and Play HUD/bark surfacing. A status-effect runtime is wired into combat with apply/tick/modifiers/HUD, stun turn-skip, damage-over-time XP cleanup, and Stage 3 reaction status bridges, and Stage 6 has headless cover/flanking/overwatch/telegraph/height/facing combat coverage, but broader authored-status content and live UI integration are still thin. Stage 7 survival/world-state and S6 workstation surfacing are now Play MVP-complete, but broader authored world-state consequence content remains thin. Loot tables, equipment slots, crafting, localization, asset pipeline, and plugin/mod system remain unimplemented. These are the main divergences from the larger Base Systems specification.
