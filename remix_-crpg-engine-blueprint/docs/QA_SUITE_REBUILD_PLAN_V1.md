# QA TESTING MAP SUITE REBUILD — PLAN V1
### One playable package that proves every implemented engine feature, old and new.

**Status:** Implemented through Phase 6 (verification harness at `scripts/test-map-suite.ts`, `npm run test:suite`). Suite content lives in `src/data/qaSuite/*` with `src/data/testingMapSuite.ts` as the assembly shell. Replaces the previous suite (kept entry path, rebuilt substance).
**Why:** The prior suite predates the grid-subdivision & chemistry rebuild — it proves none of the new spatial/fluid systems, its rooms are shallow, and several of its interactions are silently broken at `FINE_PER_MACRO = 3`. The new suite is the engine's living acceptance test: if a feature works, there is a room where you can watch it work.

---

## 0. FEATURE MATRIX (what "all of it" means)

Every row gets at least one authored, playable proof. Rows marked ★ are new since the subdivision/chemistry rebuild and had no coverage before.

| Domain | Features to prove |
|---|---|
| ★ Fine grid / movement | 3× fine stepping + held-to-move at legacy world speed; 3×3 footprints (1-macro corridors passable, sub-macro gaps not); height steps (walkable ≤1, blocked >1); macro-entry step triggers; exits; doors; energy/pump economy |
| ★ Chemistry: liquid flow | Button releases a water tank → room floods over multiple player moves (visible ooze), runs down height steps, pools in a basin, walkways stay dry, settles to a dormant (zero-cost) pool |
| ★ Chemistry: viscosity | Side-by-side race: one button releases water and honey into twin sloped channels; water frontier visibly outruns honey ~3×; honey holds a thick blob on the slope |
| ★ Chemistry: fire | Brazier button ignites an oil trail; fire runs the trail, spreads through grass, consumes wood crates, is stopped by a wet moat, leaves scorch; douse/foam verbs counter it; steam at the water's edge |
| ★ Chemistry: gas | Valve button releases miasma; vapor diffuses around interior walls to fill the chamber, reads "Toxic" on actors standing in it, dissipates back to nothing over moves |
| ★ Combat re-expression | Melee adjacency at footprint scale; authored AoE shapes (line/cone/cross/block) rasterized macro→fine against crate clusters; enemy 3-step turns; shove knockback dragging a hostile across a fine fire strip; overwatch zones; opportunity attacks |
| Combat (legacy) | Threat/chase radii, initiative queue, bump attack, skills w/ MP + status payloads, XP/level-up, party followers in combat, combat music/tint/popups |
| Emotional layer | Authored `emotional_axes`; Attend nodes (true/false readings, composure); `yell`/`console` verbs; behavior deviations (flee / paralyzed / defend-attachment); physical→emotional crosstalk (a burning creature panics); Alderamontico grid region + lens |
| Dialogue | Graphs w/ gated options (switch / quest / item / faction rep / time-of-day), option side effects, party talk, barks (proximity two-speaker) |
| Cutscenes & triggers | on_load / step / interact / switch_change triggers; label/branch control flow; screen_fade, camera_pan, teleport, give/remove item & currency, set_entity_hidden, advance_clock, modify_player_stats, learn_skill, game_end; ★ new `chem_spill` action |
| Quests & documents | Multi-objective quest (talk / kill / interact / custom), journal, document reader, `read_documents` conditions |
| Items & economy | Ground pickup, keyed/locked containers, shop buy/sell w/ conditional stock, currency, spatial inventory sizes, drop verb |
| World systems | Survival deltas by region, region reputation gates, workstation processes (start/work/collect/cancel), NPC hourly schedules, pushables (★ fine-cell nudging across a wet strip), stealth/perception watcher lane, save-backed fog, save menu |
| Persistence | Save/load mid-flood (chemistry sparse persistence + active-set resume), explored fog persistence, once-triggers, door/container deltas |

---

## 1. LOCKED DESIGN DECISIONS

- **Entry point unchanged:** `src/data/testingMapSuite.ts` keeps its exports (`withTestingMapSuite`, `TEST_SUITE_*`) so `schema/game.ts` and `engineStore.ts` wiring is untouched. Its content is rebuilt and split into `src/data/qaSuite/*` modules it re-exports from.
- **Author in macro.** All suite maps are authored at today's tile resolution; the fineWorld expansion does the 3× work. No fine coordinates appear in authored content.
- **Hub-and-spoke layout.** One hub, themed labs, every lab exits back to the hub. A grand-tour quest strings one proof per wing together and unlocks a `game_end` terminal.
- **Buttons are interact triggers + cutscenes.** The flood/race/fire/gas releases are authored as levers (object placement + interact trigger) firing cutscenes that use the new `chem_spill` action — fully editor-authorable, no bespoke code paths per room.
- **Chemistry proofs are physical, not scripted.** Buttons only *inject* volume/vapor/heat; the flooding, racing, burning, and dissipating are the real simulation ticking on player moves.
- **Every room narrates itself.** Signs/NPC dialogue in each lab state what should happen ("press the valve, then walk — the water should reach the far drain in ~15 steps"), so a failed feature is visible as a broken promise.

---

## 2. BUILD PHASES

### Phase 1 — Engine hooks the suite needs (small, surgical)
1. **`chem_spill` cutscene action** (`EventActionSchema` + PlayMode executor + CutsceneEditor field row):
   `{ type: "chem_spill", cell, liquid_id: "water"|"honey"|"oil"|"miasma"|"fire", amount }` →
   new `applyChemistrySpillToSave` in `chemistryRuntime.ts`: liquids add `liquid_volume` (+`liquidId`), `miasma` adds `vapor`, `fire` applies a burn impulse; wakes the active set; runs settle ticks; persists + projects.
2. **Vapor → toxicity:** `chemActorPhysicalStateFromCell` reads `vapor ≥ 25` into the `toxicity` axis so miasma shows the Toxic badge and feeds the physical→emotional crosstalk.
3. **Act/interact fine-grid fix:** `handleAct`'s probe is still `cell + facing` (one *fine* cell — inside the actor's own footprint) with exact-equality matching. Change to the footprint-edge probe (`facedProbeCell`) and macro-tile / footprint matching for: interact triggers, entities (combat strike + talk), containers, world items, workstations. Push dispatch direction uses facing, not probe delta. Without this, no button in the suite is pressable.
4. **Acceptance:** `tsc` clean; a scratch map with a lever cutscene spills water in Play Mode; standing in miasma shows Toxic.

### Phase 2 — Suite scaffold + hub
- `src/data/qaSuite/shared.ts`: cell/room builders (walled rooms, height plateaus, channels, basins), lever/sign/exit helpers, npc/hostile factories + animated-sprite pools (salvaged from the old suite), id conventions (`qa_*`).
- `src/data/qaSuite/hub.ts`: Engine QA Hub — spawn, curator (intro cutscene: fade + pan + dialogue), scribe (feature-matrix document), bark pair, grand-tour quest giver, keyed cache + keycard, save-menu terminal, gated `game_end` terminal, labeled exits to all wings.
- Assembly in `testingMapSuite.ts` (merge maps/entities/dialogue/cutscenes/quests/items/skills/shops/factions/endings/barks/processes/workstations).
- **Acceptance:** suite loads, hub playable, all exits land on real spawns.

### Phase 3 — Chemistry wing (the showpiece)
- `qa_flood_lab` — Flood Chamber: raised tank alcove (h2), stepped spillway (h2→h1→h0), sunken basin with a dry raised walkway ring; lever → `chem_spill` water ×~350. Watch it ooze per step, cascade the steps, fill the basin, stop at the walkway, settle dormant.
- `qa_visc_lab` — Viscosity Race: twin walled channels on a shared slope, one lever spills water (left) + honey (right) simultaneously; finish-line signs; honey blob proof on the slope.
- `qa_fire_lab` — Burn Gallery: oil trail snaking through a grass field into a wood-crate stockpile; wet moat guarding a "safe vault" corner; brazier lever (`chem_spill` fire); rain-barrel sign prompting douse/foam counters; scorch remains after extinguishing.
- `qa_gas_lab` — Miasma Vault: baffled chamber, valve lever (`chem_spill` miasma ×95), gas snakes around baffles, Toxic badge on entry, fully dissipates after ~20 moves; a caged NPC panics as gas reaches it (crosstalk bonus proof).
- **Acceptance:** all four behaviors observable in play; still rooms cost ~0 (active set empty when settled).

### Phase 4 — Story, combat & emotion wings
- `qa_story_lab`: dialogue-gate gauntlet (switch/quest/item/rep/time-of-day options on one NPC), switch operator + `switch_change` trigger proof, shopkeeper w/ conditional stock, party candidate (recruit/dismiss + party dialogue), archivist documents, faction-rep console, control-flow cutscene (label/branch loop), clock advancer.
- `qa_combat_lab`: melee/bruiser/status/overwatch hostiles staged in an arena; AoE target dummies in line/cone/cross/block formations; a shove lane where the hostile stands beside a burning oil strip (knockback-through-hazard proof); stealth watcher lane; trainer NPC grants the skill kit.
- `qa_emotion_lab`: attend-node subject (true/false readings), grieving NPC (console calms), skittish NPC (yell → flee), enthralled guardian (defend-attachment — holds its shrine), crosstalk dummy on an authored firehazard cell, Alderamontico grid region + lens entity.
- **Acceptance:** each proof playable; quest objectives tick.

### Phase 5 — World systems + movement wings
- `qa_world_lab`: survival-drain region + supper table (restore), workstation bench (2 processes), locked/keyed/plain containers, pushable crates across a wet strip (fine nudging + wet trails), schedule runner with hourly posts, reputation-gated annex.
- `qa_move_lab`: footprint slalom (1-macro corridors, dead-end sub-macro gap illusion), height staircase vs cliff, LOS/fog wall garden, step-plate row (macro-entry semantics), door row, portal pair, energy sprint track.
- **Acceptance:** every geometry proof behaves as narrated.

### Phase 6 — Headless verification + audits
- `scripts/test-map-suite.ts` (`npm run test:suite`):
  1. Reference integrity — every exit/spawn/dialogue/cutscene/quest/item/skill/shop/faction/document/trigger id resolves; fine expansion of every suite map succeeds; audit-maps-style reachability of exits from spawns.
  2. Chemistry acceptance, headlessly, on the *authored rooms*: flood oozes over successive move-ticks and pools in basin cells while walkway cells stay dry and the active set drains; water frontier > honey frontier at equal tick counts; fire crosses the oil trail but never the moat-protected cells, scorch persists after douse; miasma reaches the far baffle then decays to ~0.
- Run `test:engine`, `test:chemistry`, `audit:maps`, `tsc`; fix fallout.
- **Acceptance:** all green; doc updated with the final room map.

---

## 3. SUITE LAYOUT (hub compass)

```
                [qa_flood_lab]   [qa_visc_lab]
                       N               NE
[qa_move_lab] W   ── QA HUB ──   E [qa_combat_lab]
                       │
        SW [qa_gas_lab]│[qa_fire_lab] SE
                       S
   [qa_story_lab] (S exit) · [qa_emotion_lab] (NW) · [qa_world_lab] (far E annex via combat lab)
```
(Exact exit cells authored per map; each lab has a single return exit to the hub.)

## 4. GUARDRAILS

- Never hard-code fine coordinates in authored content; if a proof needs sub-tile precision, it is a *simulation* outcome, not an authored input.
- Chemistry rooms must prove behavior with **no scripted animation** — if the button directly paints water everywhere, the test is lying.
- Keep the suite loadable as the default package (same `withTestingMapSuite` path) and green under `npm run test:suite` before calling any phase done.
- One file per wing; `testingMapSuite.ts` stays an assembly shell.
