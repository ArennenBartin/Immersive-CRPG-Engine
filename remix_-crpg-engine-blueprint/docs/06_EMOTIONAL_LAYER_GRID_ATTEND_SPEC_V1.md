# 06 — EMOTIONAL LAYER, GRID OPERATOR & ATTEND — IMPLEMENTATION-GROUNDED SPEC V1

**Status:** Target spec for the next engine increment. Written to sit alongside `03_SYSTEMS_HEAVY_GRID_SIMULATION`, `04_GRID_IMMERSIVE_SIM_ENGINE_ROADMAP`, and `05_ALDERAMONTICO_STATE_SYSTEM_CONTRACT`. This is the "make the distinctive layer real and visible" spec.
**Premise:** The physical layer is built and *wired into Play* (chemistry axes authoritative, actor/tile unification, physical→emotional crosstalk to arousal, flee-on-panic, decay-on-escape — all proven in `test-chemistry.ts`). This spec completes the **emotional half** on the identical pattern, adds the **Grid operator** and **lens**, the **three-part read-out**, and the **attend-node** (the one genuinely new interaction). It deliberately adds *no* new physical axes and *no* new verbs — depth now comes from consuming what exists.

**Non-goals (explicitly out of scope):** the ECS/authoritative-runtime rewrite (PlayMode keeps orchestration); additional physical axes; a per-tile overworld emotional field (emotional state is **zone- and actor-designated**, not an ambient traversal field — see §7). The "voice" is narrative content delivered through dialogue/story, **not** an engine mechanic; nothing here models it.

---

## Current implementation grounding

This spec is installed after `05_ALDERAMONTICO_STATE_SYSTEM_CONTRACT_V1.md` as a completion spec, not as a second emotional system. The current runtime already implements the core actor emotional axes, derived emotional labels, Attend-gated Condition read-outs, Grid/lens region amplification, Glass accrual, emotional verbs/skills, baseline decay, combat/exploration behavior consumption, chemistry actor/tile physical-state crosstalk, Studio authoring for entity axes/skill impulses/Grid regions, and v2 preservation through `src/engine-core/alderamonticoState.ts`, `PlaySave.alderamontico_state`, `PlayMode.tsx`, and `scripts/test-alderamontico-state.ts`.

The first doc-06 implementation slice therefore treats `actor_emotional_states` as a compatibility projection of the existing canonical `alderamontico_state.actors` records rather than a duplicate store. The second slice adds the headless attend-node command/data model: `EntityData.attend_node` and `DialogueNodeData.attend_node` can now author readings, truth categories, attention requirements, composure, Glass pressure, reading effects, and timeout consequences; `dispatchAlderamonticoAttendNode` / `dispatchV1AttendNode` open, select, and tick active attend nodes while persisting `alderamontico_state.active_attend`.

The completion slice wires the Attend node into Play Mode: faced actors with authored nodes open a compact reading picker, attention/composure/hidden-reading pressure is visible, selection resolves effects, timeout auto-selects the false reading and applies Glass residue, and the default Training Bot ships a false/true/partial test node. Attention is canonical in `alderamontico_state.attention` on the runtime's existing 0..100 axis scale; Play displays it as a compact 0..9 read-out, and authored `requiresAttention` values in the 0..9 design scale are normalized by the command helper. The read-out now explicitly supports the Grid lie ("at peace" on the surface) versus the attended truth ("transfixed, drowning in borrowed reverence"). Zone designation is also implemented: regions can author `emotional_profile.baseline_axis_offsets`, the Map editor exposes those offsets in the Grid region panel, Grid advancement uses the offsets when seeding actor baselines, and `alderamontico_state.grid.fed` / `fed_by_region` track accumulated feed.

Doc-06 functional scope is implemented at engine/test-map MVP level. Remaining work is content production and tuning: author more real game Attend nodes, tune thresholds and copy, and broaden bespoke scene feedback where authored content asks for it.

---

## 1. What exists to build on (do not rebuild)

- **Numeric-axis chemistry** (`chemistry.ts`, `chemistryRuntime.ts`): per-cell axes authoritative; derived conditions are readings; verbs push axes; ticks evolve; `PlaySave.chemistry` persists. **This is the exact pattern the emotional layer copies.**
- **Actor/tile unification** (`chemActorPhysicalStateFromCell`, `decayActorPhysicalStateRecord`, `actor_physical_states`): actors read the cell's axes into a body record, take statuses, and **already feed physical→emotional crosstalk into arousal**, producing flee behavior; escaping decays the record. The crosstalk hook is live — this spec extends its target from "arousal only" to the full emotional axis set and adds behavior beyond flee.
- **Status runtime** (`statuses.ts`): apply/tick/modifiers/turn-skip. Emotional extremes will apply statuses here (no new status system).
- **Command/effect/event pipeline** + `v1Runtime` dispatch: the attend-node and Grid tick are new commands on this surface.
- **Perception/alertness** (Stage 4): the read-out's "what an unattended observer can infer" reuses this; behavior selection reads it.

---

## 2. The emotional layer — actor axes (mirror of the physical layer)

Add an authoritative **emotional axis record per actor**, persisted in `PlaySave` beside `actor_physical_states` (proposed `actor_emotional_states`, keyed by actor id). Same rule as chemistry: **axes are authoritative; named emotions are derived readings, never stored flags.**

### 2.1 Axes (final set — 5)
Two universal, three philosophy-owned. Each a signed or 0..1 scalar with per-actor baselines and thresholds (baselines let a stoic and a zealot differ without new code).

| Axis | Range | Poles | Owner |
|---|---|---|---|
| `valence` | −1..+1 | anguish ↔ joy | universal |
| `arousal` | 0..1 | numb ↔ frantic | universal (already the crosstalk target) |
| `grief` | 0..1 | unburdened ↔ crushed | Church / Consolation |
| `reverence` | −1..+1 | defiant ↔ transfixed | Old world / Attention |
| `attachment` | −1..+1 | severed ↔ bound(-to-target) | Ledger / Consent |

`attachment` is **relational** where it matters: an actor may hold a general scalar plus optional per-target attachment (`attachment_to: {entityId: value}`) so enthrallment (bound to a specific patron) and the fade (attachment collapsing to severed) are expressible. Keep the general scalar for cheap cases; add per-target only where authored.

### 2.2 Derived emotions (readings, computed — never stored)
A pure `emotionLabelsFromAxes(record)` returns labels for the read-out and behavior, e.g.:
- `scared` = arousal high ∧ valence low
- `grieving` = grief high ∧ valence low ∧ arousal low
- `manic` = arousal high ∧ valence high
- `despairing` = valence floored ∧ arousal numb ∧ grief high
- `transfixed` = reverence maxed ∧ arousal numb
- `enthralled` = attachment(to X) maxed ∧ arousal low
- `fading` = attachment near severed ∧ valence numb ∧ grief low

New emotions cost zero code — they are new label regions. AI-authored content may define new labels as axis-predicates in data.

### 2.3 Persistence & decay
`actor_emotional_states` persists per save. Emotional axes **decay toward the actor's baseline** each tick (like the physical body record decaying after escape), at per-axis rates — grief and reverence decay slowly (they linger), arousal fast. Reuse the `decayActorPhysicalStateRecord` shape; add `decayActorEmotionalStateRecord`.

---

## 3. Crosstalk (extend the live hook, add two directions)

Three couplings; **A already exists to arousal** — generalize it and add B and C.

**A. Physical → Emotional (extend existing).** The live crosstalk that writes arousal from the body record now also writes the other axes: burning/wounded/poisoned → arousal↑, valence↓; cold → valence↓, arousal↓; healed/warmed → valence↑, arousal→calm. Implement as a table `PHYS_TO_EMO` mapping physical labels/axis-bands → emotional axis deltas, applied where `chemActorPhysicalStateFromCell` currently nudges arousal. **This is the smallest change with the biggest payoff and it reuses the proven path.**

**B. Emotional → Behavior (new; the big one).** Behavior selection reads the emotional region *before* falling through to authored AI. A pure `behaviorIntentFromEmotion(record, perception)` returns an intent that overrides/short-circuits the actor's default:
- fear (arousal high ∧ valence low) → **flee** from the perceived threat (already the case for fire-panic; generalize the trigger from "on fire" to "fear region").
- rage (arousal high ∧ valence low ∧ low/negative attachment-to-threat) → **attack**.
- `transfixed` → **inert**: will not move, cannot be tasked, ignores most stimuli (the paralyzed watcher).
- `enthralled(to X)` → **will not leave X**, defends X, cannot accept a task that separates from X.
- `grieving` (grief drowning) → **unresponsive/paralyzed**.
- `fading` → **stops self-preserving** (won't flee, won't defend).
- else → fall through to existing authored behavior.

This **closes the standing gap** noted in the implemented-systems doc ("authored NPC behavior trees do not yet consume awareness"): behavior becomes a function of emotional region + perception, and awareness feeds emotion. Authored trees still run for actors in neutral regions.

**C. Emotional → Physical (new; setting-specific, one rule).** Sustained emotional extreme **crystallizes Glass**: an actor (or zone cell — see §7) held past a threshold on any single emotional axis for N ticks accretes a slow `glass` accumulation (model as a new physical axis *or* as `integrity`-adjacent residue; prefer a dedicated `glass` cell/actor scalar for clarity). This is the only emotional→physical coupling; it is the lore made mechanical (Glass grows where feeling drowns) and it gives the Grid something to feed on visibly.

---

## 4. The Grid operator (the metaphysics as ~one function)

A per-zone tick (`advanceGridForZone`, run on the same scheduler cadence as chemistry ticks, gated to zones flagged Grid-active):

1. **Scan** the zone's actors (and designated zone cells) for the **dominant emotional axis** — the axis furthest above baseline in aggregate.
2. **Amplify** it: push that axis further from baseline on the actors in range, by a magnitude `M`.
3. **Feed**: accrue the "excess" (the amount amplified) to a zone `grid_fed` accumulator — the number the shallow/true content loop reads.
4. **Crystallize**: amplification raises local `glass` (coupling C), so worked places grow Glass.

**The lens (the girl).** A designated lens actor multiplies `M` in a radius around its position: `M_effective = M_base * lensFactor(distanceToLens)`. This is the entire "the girl drowns the March through amplification" mechanic — a magnitude multiplier centered on an actor. Removing/relocating a lens is out of scope for this game (she is fixed), but the field is written so a lens is just data.

**Determinism:** the operator runs through the deterministic pipeline (RNG stream if any jitter is desired), emits a structured `grid_amplified` event per tick for the debug inspector, and writes to save. Keep `M` and `lensFactor` in package data so content/AI tunes without code.

**Scope guard:** Grid-active zones are **authored, not global** (answer 8). The open wilds do not run this. This keeps the emotional field where it's meaningful and cheap.

---

## 5. The three-part read-out (UI = the game's thesis)

For any actor the player inspects (and the player-self), Play surfaces three things:

1. **Physical state** — always fully visible. From `actor_physical_states` + derived chemistry conditions. (Already have the tokens.)
2. **Emotional state** — **hidden by default; revealed by Attend (§6).** Until attended, Play shows only what an ordinary observer could *infer* — a guess derived from **perception + physical surface + current behavior**, routed through the existing Stage 4 inference, and **the Grid can make this guess wrong** (a transfixed, drowning actor may read on the surface as "calm/at peace"). Store an `emotional_read_confidence` per observed actor that Attend raises.
3. **The Condition** — one plain-language line combining both layers, generated from the labels: *"burning — panicking"*, *"unharmed — grieving, begging to stop"*, *"unharmed — at peace"* (surface) which, attended, becomes *"unharmed — transfixed, drowning in borrowed reverence."*

**The gap between the surface Condition and the attended Condition is the Grid's lie rendered as UI.** This is the single most important thing to ship visibly in the first ten minutes: the player must *see* a creature burn, panic, and flee (physical→emotional→behavior), and separately *see* a calm-looking actor whose attended truth differs. Build a minimal inspector/HUD affordance for the Condition line even before the full attend-node.

---

## 6. The attend-node (the one new interaction)

A new interaction/command (`attend`) plus a dialogue-node subtype. Version B from design: **dialogue readings + composure timer + attention-gated visibility + Glass emotional-state pressure.**

### 6.1 Data
An attend-node authored on a target (an actor, or the special lens/key objects) carries:
- `target`: entity ref.
- `readings[]`: each `{ text, truth: "false"|"true"|"partial", requiresAttention: int, effect? }`. False readings are the Grid's flattering certainties; true readings are the smaller, harder note; `partial` is for the deliberately-unsolvable node (see below).
- `composure`: starting timer value.
- `glassPressure`: emotional deltas applied to the *player* while the node is open (the borrowed feeling — e.g. push player valence/reverence toward the target's amplified axis), reusing the actor emotional-state system on the player.
- `onTimeout`: which false reading auto-selects + the Glass-residue status applied.

### 6.2 Runtime (`dispatchAttend` on the command surface)
1. On open: apply `glassPressure` to the player's emotional record; start `composure` countdown on the tick scheduler.
2. Show `readings` whose `requiresAttention <= attention`. Readings above the player's `attention` are **hidden** (not greyed — hidden, per design).
3. Player selects a visible reading → resolve its `effect` (may set flags, adjust `attention`, mark a POI truth); close node; decay glassPressure.
4. On `composure` reaching 0 → auto-select the configured false reading, apply the minor Glass-residue status, close.
5. **Floor tick:** the *first* attend on a given target (and the first ever) grants `attention += 1` regardless of selection — guarantees perception can grow and never soft-locks.

### 6.3 The `attention` integer
One save-level integer, currently stored as `alderamontico_state.attention` so it stays inside the existing Alderamontico save envelope and v2 preservation path. Internally it uses the runtime's 0..100 axis scale; UI and authored design copy may present it as 0..9. `requiresAttention` values authored from 0..9 are normalized to 0..100 by the attend command helper, so both `2` and `20` can express the same gate. Attention rises via attend floor-ticks, true-reading selection, and true-path POI resolution; it is **starved (not lowered)** by shallow paths. Read by: attend-node visibility, the read-out's confidence/reliability cap, the Grid/lens content gates, and endings. **Mark every read/write site** so a later split into `perception` / `fed` is mechanical. (Design note: this is the game's spine as one number.)

### 6.4 The unsolvable node
Support a node config where **no reading is `true`** — all `false` or `partial` — and the *honest* option (`partial`, "I can't tell, so I can't accept it") carries the **highest** `requiresAttention`. Perceiving that one cannot perceive is the deepest attention. This is the Marrowhouse/Reni consent node and, in gentler form, the read-out's confidence ceiling: even max attention returns ambiguity on a genuinely indeterminate emotional question. No special code — it is data on the existing node.

---

## 7. Zone designation (scope discipline)

Emotional/Grid behavior is **per-zone authored**, matching the content plan:
- A zone package carries an optional `emotional_profile`: baseline axis offsets applied to zone actors (the Combe's surrounds bias `grief` up; the Watchfold `reverence`; the Marrowhouse `attachment`), a `grid_active` flag, `M_base`, and optional `lens` ref.
- **Open wilds carry no profile** and run no Grid tick — sparse ambient content only.
- This is what makes zones feel like distinct amplified places without a continuous world-field, and it's cheap: the operator only runs where authored.

---

## 8. Build order (small, ordered, each shippable)

1. **`actor_emotional_states` + decay** — the axis record and baseline decay. (Copy chemistry pattern.) Test like `test-chemistry.ts` → `test-state.ts` already exists; extend it.
2. **Extend crosstalk A** to write all axes (not just arousal) via `PHYS_TO_EMO`. Immediately makes existing fire-panic richer.
3. **Crosstalk B (behavior-from-emotion)** — the flee generalization + transfixed/enthralled/grieving/fading intents. Biggest gameplay payoff; closes the awareness-consumption gap.
4. **The Condition read-out** (§5) — even a minimal inspector line. Ship the surface-vs-attended *gap* early; it's the identity.
5. **Attend-node** (§6) — the new command + node subtype + `attention` integer.
6. **Grid operator + lens** (§4) and **zone profiles** (§7) — the metaphysics, gated to authored zones.
7. **Crosstalk C (Glass crystallization)** — last; can ship as a scripted approximation if time-poor.

Steps 1–4 alone already deliver a visible two-layer sim. 5–7 deliver the Alderamontico-specific game.

---

## 9. What this refuses to do (guardrails)

- No new physical axes; no new verbs. Depth is consumption.
- No ECS rewrite; PlayMode keeps orchestration. The emotional layer rides the existing save/tick/command surface exactly as chemistry does.
- No engine model of "the voice." Narrative only.
- No global emotional field. Zone-designated.
- Nothing is a stored emotional flag. Axes authoritative, emotions derived — same discipline that made the physical layer clean.
