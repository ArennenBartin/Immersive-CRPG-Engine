# Unsurfaced Systems → Play Mode Surfacing Plan

**Status:** Working analysis, updated after Play Mode surfacing through build-order Phase 7 completion. Grounded in the actual code, not just the spec docs.
**Method:** For each headless capability the engine already implements, I checked whether `PlayMode.tsx` ever calls it. Anything the engine can do but the player can't trigger is an "unsurfaced system."

The spatial **grid inventory** (Stage 7) was the first of these to be surfaced — it now has a real drag-and-drop grid in Play Mode (`SpatialInventoryGrid.tsx` + `inventory_layout` on the save). The immersive command wheel is surfaced through build-order **Phase 3**: Phase 1 `drop`, Phase 2 elemental verbs (`burn`/`douse`/`freeze`/`wet`/`electrify`/`foam`), and Phase 3 non-hack movement/traversal verbs (`push`/`pull`/`throw`/`stack`/`climb`/`break`) are enabled in Play Mode via `PLAYMODE_COMMAND_WHEEL_VERBS`. Elemental verbs now resolve through `applyChemistryVerbToSave`; non-elemental drop/movement/traversal verbs resolve through `applyImmersiveGlobalVerbToSave`. **Phase 4 is complete at Play MVP scope:** combat exposes **Shove**, standard in-combat melee routes through `applyImmersiveCombatAttackToSave`, cover/flank/height modifiers are previewed in the combat HUD and echoed through popups/logs, and the renderer paints overwatch zones, hostile intent target cells, actor-following hostile intent tethers, and alert badges while leaving cover edges as combat data/readouts instead of a map-wide canvas overlay. **Phase 5 is complete at Play MVP scope:** Stage 4 perception advances in Play Mode and surfaces through a stealth gem, per-NPC alert badges, escalation/decay barks, popups, audio, logs, and an authored lit stealth-watcher lane in the systems test map. **Phase 6 is complete at Play MVP scope:** Stage 7 world-state advancement runs in Play Mode, the Condition HUD surfaces survival/load pressure, the top-right banner surfaces region/world-state gates, and denial gates now block movement into barred cells plus non-drop command-wheel verbs with popup/audio/log feedback. **Phase 7 is complete at Play MVP scope:** authored S6 workstations are reachable in Play through a compact contextual prompt with multi-process selection, Start/Work/Cancel actions, output collection, action-energy costs, and an authored systems-map alchemy bench that can produce both health tonics and survival-restoring field rations. Elemental verbs feed back through visible world deltas, player/NPC body-state badges, and a player Body HUD with temperature/wetness/heat/chill/charge/coating/toxicity axes.

---

## How the gap was measured

- `src/engine-core/` exports **62** `dispatchV1*` command wrappers. `PlayMode.tsx` calls **44** of them. The other **18** are implemented + tested but unreachable by the player.
- The **immersive-sim layer** is now partially imported by `PlayMode.tsx`: the command wheel uses `applyChemistryVerbToSave` for the six elemental verbs and `applyImmersiveGlobalVerbToSave` for `drop` plus six non-hack movement/traversal verbs. Combat uses `applyImmersiveCombatForcedMovementToSave` for Shove, `applyImmersiveCombatAttackToSave` for in-combat melee, and `createImmersiveCombatTacticalSnapshotFromV1` for hostile-intent data, cover/overwatch math, faced-target attack readouts, and renderer-visible overwatch/intent overlays. Perception uses `advanceImmersivePerceptionForSave` plus `createImmersivePerceptionSnapshotFromV1` for a stealth HUD, NPC alert badges, alert barks/audio/popups/logs, and authored stealth test content. Survival/world-state evaluation is consumed by Play Mode through `advanceImmersiveWorldStateForSave` and `evaluateImmersiveWorldStateForSave`; it now drives Condition HUD meters, region-gate banners, and denial gating for movement/verbs. S6 workstations are now player-reachable through `dispatchV1StartProcess`, `dispatchV1AdvanceProcesses`, and `dispatchV1InterruptProcess`, with process start/advance spending shared action energy.

So "unsurfaced" now splits into narrower buckets: **(A)** engine-core v1 verbs with no input binding, and **(B)** remaining immersive-sim depth that has headless support but no Play Mode affordance yet, especially `mimic`, richer form/identity verbs, and broader authored encounter/status content.

---

## 1. Player-invokable verbs that need a home (the command-wheel candidates)

These are real *actions a player would choose*. They have full headless implementations and commit to the save, but nothing in Play Mode can fire them.

### 1a. Stage 5 global verbs — command wheel + chemistry/global-verb runtime
The canonical 15-verb registry still exists, but live Play now splits resolution by verb family. **Build-order Phases 1-3 are reachable in Play, except `hack`, which was intentionally removed from the player-facing wheel for now.** `burn`, `douse`, `freeze`, `wet`, `electrify`, and `foam` resolve through `applyChemistryVerbToSave`; `drop`, `push`, `pull`, `throw`, `stack`, `climb`, and `break` resolve through `applyImmersiveGlobalVerbToSave`. The wheel additionally carries the two built-in **emotional verbs** (`yell`, `console`) from the Alderamontico state system, resolving through `applyAlderamonticoEmotionalVerbToSave` against a targeted living actor (Yell also emits a real sound disturbance through `dispatchV1EmitSound`). `mimic` remains visible-but-disabled until a later form/identity slice.

| Verb | What it does (headless, already built) |
|---|---|
| `push` / `pull` | move an object/actor one+ cells along a direction |
| `throw` | hurl an item to a target cell (then reacts on landing) |
| `drop` | move an inventory item into world placement at a cell |
| `stack` / `climb` | create/use traversal-support height |
| `burn` / `douse` / `freeze` | write fire / water / cold onto a cell, then resolve reactions |
| `wet` / `electrify` | write liquid / charge, chains through wet cells |
| `foam` | signature tool: douses fire + occludes + leaves climbable support |
| `break` | remove an object placement |
| `mimic` | record an actor-form change |

The API already takes everything a wheel needs: `{ verb, cell, actorId, targetCell, direction, itemId, count, intensity }` → `{ ok, reason, save, … }`. Wiring is "pick verb → pick target cell → call → commit."

### 1b. Kernel / sim object-manipulation verbs (engine-core v1, no input binding)
Implemented `dispatchV1*` wrappers never called from Play:

- `dispatchV1PullObject`, `dispatchV1DragObject`, `dispatchV1CarryObject` — pushing is wired (Act-into-prop), but **pull/drag/carry are not**.
- `dispatchV1BreakObject`, `dispatchV1CloseDoor`, `dispatchV1SearchContainer` — the legacy v1 dispatch wrappers are still not directly bound to the Act path. Player-facing **Break** is available through the Stage 5 global-verb command wheel; close-door/search-container still need a deliberate interaction cleanup slice if they should become player-facing verbs.
- `dispatchV1IgniteFire`, `dispatchV1ExtinguishFire`, `dispatchV1CleanSurface`, `dispatchV1EmitSound` — fire/clean/noise verbs with no input.

> **Architectural note / redundancy:** these older per-verb v1 sim commands overlap with the Stage 5 global verbs (`ignite_fire` vs `burn`, `extinguish_fire` vs `douse`, `clean_surface` vs surface writes). Per the manifest's "do not create a second engine" rule, the command wheel should route through the **single canonical `IMMERSIVE_GLOBAL_VERBS` registry**, and the older v1 sim verbs should be treated as internal/compat rather than given a second player-facing surface.

### 1c. Workstation / process verbs (S6 economy)
- **Phase 7 complete at Play MVP scope:** `dispatchV1StartProcess`, `dispatchV1AdvanceProcesses`, and `dispatchV1InterruptProcess` now have a Play UI when the player stands on or faces an authored workstation. The compact contextual prompt supports multi-process selection, starts authored processes, advances active process ticks, cancels active processes, shows completion/output readiness, and collects produced drops before starting another run. Start/Work/Collect spend shared action energy through the v1 adapter. The systems test map includes a visible alchemy bench wired to `sim_proc_brew_tonic` and `sim_proc_pack_field_ration`.

---

## 2. Combat affordances that need a combat-HUD surface (Stage 6)

The Stage 6 tactical layer is now exposed at Play MVP scope. These belong on the **combat action bar**, not the explore wheel:

- **Forced movement / knockback** — **surfaced at MVP scope**: the combat tactics bar has a Shove button that moves the faced hostile through `applyImmersiveCombatForcedMovementToSave`, commits hazards/reactions/overwatch facts, shows popups/log feedback, and spends the combat turn.
- **Cover / flanking / height / facing** — **surfaced at MVP scope**: `createImmersiveCombatTacticalSnapshotFromV1` computes directional cover edges, flank state, and height/facing modifiers; `applyImmersiveCombatAttackToSave` now owns in-combat melee; the HUD previews the faced target's base damage, estimated hit, cover reduction, flank bonus, and height bonus; popups/logs echo the same modifiers after the attack resolves.
- **Overwatch zones** — **surfaced**: reactive zones are computed, counted in the tactical strip, painted on the canvas, and resolved by Shove/forced movement. The player can now spend a combat turn on the **Overwatch** action (tactics bar, armed state shown); ordinary enemy movement through the zone resolves the same reaction rule via `applyImmersiveOverwatchToMovementSave`, with popups/logs and XP on kills, and the stance disarms when combat ends.
- **Telegraphed enemy intent** — hostile intents are shown as compact labels under the initiative strip, faint target-cell overlays on the canvas, and actor-following intent tethers that source from the moving hostile's current screen position.

---

## 3. Status/feedback systems that need an indicator (no new verbs, just HUD)

These aren't verbs — they're world state the player currently can't see:

- **Stealth / perception (Stage 4)** — **Phase 5 complete at Play MVP scope:** `advanceImmersivePerceptionForSave` runs in Play Mode outside combat, writes NPC `alertness`, `investigation_target_cell`, and `flags.immersive_stealth_feedback`, plus durable alert/give-up facts. The HUD renders a Thief-style visibility gem with seeing/alerted counts and top alert rows, the canvas renders per-NPC alert badges, alert escalation/decay produces barks, popups, warning audio, and log lines, and the systems test map now includes a lit stealth-watcher lane.
- **Survival attrition (Stage 7)** — **Phase 7 complete at Play MVP scope:** `advanceImmersiveWorldStateForSave` advances `flags.survival_hunger / _thirst / _fatigue / _exposure` in Play Mode and the Condition HUD shows hunger/thirst/fatigue/exposure meters plus load/AP pressure. Survival crisis denials now block movement and non-drop command-wheel verbs with popup/audio/log feedback. The authored field ration item restores survival axes through the existing inventory consumable flow, and the workstation can produce it from a token.
- **Region / world-state gates (Stage 7)** — **Phase 6 complete at Play MVP scope:** `evaluateImmersiveWorldStateForSave` produces permit/deny/warning gates from reputation, survival, inventory load, and passive checks; Play Mode shows the strongest denial/warning as a top-right region pressure banner; movement into denied cells and non-drop global verbs into denied cells are blocked. The systems test map authors initial regions and a gated Systems Lab; richer world-state content remains future work.
- **Kernel world facts / simulation S0–S8** — only visible in the debug Events overlay and the Simulation editor. These are inspectors, not player features; leave as-is unless a "journal of consequences" is wanted later.

---

## 4. Do **not** surface as player commands (engine plumbing)

These `dispatchV1*` verbs are schedulers/ticks, not player choices. They should be driven by the turn loop, never put on a wheel:

`dispatchV1AdvanceEnvironment`, `dispatchV1AdvanceNpcTasks`, `dispatchV1AdvanceSimulationRegions`, `dispatchV1DecaySurfaces`, `dispatchV1AdaptSimulationSemantics` (neutral no-op). `dispatchV1AdvanceProcesses` is the exception: it is not a standalone wheel command, but it is now driven by the contextual workstation Work action. `dispatchV1EmitSound` is borderline — internal for footsteps/impacts, but could double as an optional player "distract" verb.

---

## 5. Recommended UI

**A radial command wheel for the explore-mode global verbs (§1a–1c).** Rationale: 15+ verbs is too many for fixed buttons, and every verb resolves the same way — *choose verb → choose target cell → resolve*.

Proposed interaction:
1. Open with a hold/keypress (e.g. hold `Q`) or a HUD button next to Act.
2. Wheel shows verbs valid **right now**, filtered by context: only show `burn` if the player has a flame source / `climb` if there's support, etc. (the verb API already returns `ok:false, reason` — pre-flight each verb against the facing cell to enable/disable wedges).
3. Select a verb → enter a **target-cell cursor** (reuse the existing combat target-cursor: directional keys + canvas hover already exist in `PlayMode`).
4. Confirm → call `applyImmersiveGlobalVerbToSave(...)` → `commitRuntimeSave(result.save)` + `pushEngineEvents(result.events)` (same commit path the 44 wired verbs already use).
5. Resolution is automatic: the verb writes a property, Stage 3 reactions fire, facts/statuses commit — so emergent outcomes "just work."

**Cost/turn integration:** each verb spends action energy through the shared scheduler (`advanceImmersiveStage2Save`), exactly like forced movement already does — so the wheel respects the AP/energy economy for free.

**Combat (§2)** stays on the existing combat action bar: **Shove**, **Overwatch**, cover/flank/height readouts, hostile intent labels, and the overwatch/intent canvas overlays now live there. Don't put combat verbs on the explore wheel — keep the "one sim, two contexts" separation visible to the player.

**Indicators (§3)** are passive HUD: a stealth gem + NPC alert icons (canvas), survival meters (HUD corner), and a region-denial banner. No wheel involvement.

---

## 6. Suggested build order

1. **Done:** Command wheel shell + target-cell cursor reuse, wired to **one** safe verb end-to-end (`drop`, since it already round-trips inventory ↔ world).
2. **Done:** Add the **elemental verbs** (`burn`/`douse`/`freeze`/`wet`/`electrify`/`foam`) — highest emergent payoff, all share reaction resolution.
3. **Done:** Add **non-hack movement/traversal verbs** (`push`/`pull`/`throw`/`stack`/`climb`/`break`). `hack` stays headless/engine-level for now.
4. **Done:** **Combat: Shove**, **Overwatch**, Stage 6 in-combat melee, faced-target cover/flank/height readout, combat popups/logs, hostile intent labels, overwatch-zone canvas overlays, hostile intent target cells, and actor-following intent tethers. Cover edges remain in the tactical snapshot/HUD math rather than being painted as a map-wide canvas overlay.
5. **Done:** **Stealth gem + NPC alert** indicators, alert barks/audio/popups/logs, and an authored lit stealth-watcher lane in the systems test map.
6. **Done:** **Survival meters + region-denial** banner, warning feedback, and MVP movement/verb denial gates.
7. **Done:** Workstation **Use** can select between authored S6 processes, start, advance, interrupt, surface completion/output readiness, collect produced drops, spend action energy, and produce both health tonics and survival-restoring field rations from the contextual Play Mode prompt.

Each step is independently shippable and uses the existing `commitRuntimeSave` / `pushEngineEvents` plumbing, so none of it requires touching the headless engine.
