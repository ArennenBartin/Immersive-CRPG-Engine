# ALDERAMONTICO — THE STATE SYSTEM
### Foundational Systems Contract v1 · physical + emotional axes, one engine

This is the spine the immersive sim hangs on. It is paper design, independent of what the engine currently does — it defines the *target*. Everything else (verbs, combat, the Grid, attending, AI-generated content) is built against this contract.

**The one idea:** every entity carries two parallel layers of state — **physical** and **emotional** — each modeled as values on a small set of **axes**, not as a list of discrete states. Named "states" (burning, scared, grieving, frozen) are just *regions* in axis-space. Interactions are *rules over axes*, so the combinatorial space of states is vast but the code is small, and AI can generate content as axis-values that are guaranteed to interact. The two layers stay separate in the model and **resolve into one legible Condition** at the read-out, with the emotional layer **partially hidden until attended.**

## Current implementation grounding

First implementation slice is now live at headless/runtime-schema scope:

- `src/engine-core/chemistry.ts` and `src/engine-core/chemistryRuntime.ts` provide the current physical-axis foothold for tiles/cells: numeric chemistry axes are authoritative, and fire/water/ice/electricity/scorch/foam tokens are derived projections.
- `src/engine-core/alderamonticoState.ts` provides the first emotional-axis foothold for actors: Valence, Arousal, Grief-load, Reverence, and Attachment axes; derived emotional regions/named states; physical-to-emotional crosstalk from actor physical states; Attend-gated Condition read-outs; the Grid's dominant-philosophy-axis amplification; and Glass accretion at sustained emotional extremes.
- `PlaySave.alderamontico_state` persists per-actor emotional state and Attend memory, and v2 save migration preserves it.
- `PlayMode.tsx` now exposes the first player-facing Attend slice: a faced-actor **Attend** button beside Act/Wait, a compact left-HUD read-out for the attended actor's emotional summary, behavior, reliability, emotional axes, physical labels, and Glass residue, and log/audio feedback when attending succeeds or no target is faced.
- Phase 3's first Grid/lens region slice is live: map regions can author `alderamontico_grid` metadata, `advanceAlderamonticoGridRegionsForSave` applies dominant-axis Grid amplification to actors standing in those regions, nearby lens entities multiply the magnitude, Play Mode advances the operator on player step/clock changes, the HUD surfaces regional Grid pressure, and attended actors expose recent Grid pressure in their condition read-out.
- Phase 4's emotional verbs/skills are live: `SkillData.emotional_impulse` lets an authored skill push a target's emotional axes (signed deltas) the same way `element`/`payloads` push physical ones. `resolveSkillCast` applies the impulse to living targets after the physical payloads (seeding from authored entity axes first) and reports an `"emotional"` `SkillCastHit`; Play Mode's `presentSkillOutcome` surfaces the axis shift and any resulting behavior in the combat log. Built-in player-facing emotional verbs now also exist: `ALDERAMONTICO_EMOTIONAL_VERBS` defines **Yell** (range 4; arousal/fear spike; audible — it emits a real `emit_sound` disturbance perception can investigate) and **Console** (adjacent; lowers grief, lifts valence, settles arousal). Both ride the Play command wheel, target a living actor's cell, and report before→after behavior in the log ("they break and run", "Resisted"). Binding extremes (grief/reverence/attachment ≥ 90) resist Yell — the transfixed watcher cannot be startled awake — while Console is exempt as the counter-tool; `applyAlderamonticoEmotionalVerbToSave` is the headless operator.
- Phase 5's AI behavior consumption is live in **both contexts**: `resolveEnemyTurn` reads `resolveAlderamonticoBehavior` before acting in combat, and the exploration energy pump reads the same behavior out of combat. A `paralyzed`/`fade` actor skips its turn and holds still (hostile or friendly — schedules pause too), a `flee` actor moves away (cowering if cornered — it never turns to fight), and a baseline-bound `defend_attachment` actor holds ground and only strikes what comes adjacent. Grid-inflated attachment alone does not create a guard anchor, so ordinary combat-alerted enemies still chase. A `calm`/`attack` actor keeps its historical melee-and-chase or schedule AI. Behavior seeds from authored `entity.emotional_axes` when an actor has no record yet, so default enemies are unchanged. Exploration behavior changes are narrated once per state change ("bolts in terror", "stands transfixed").
- Contract §4A decay is live: every actor record stores `baseline_axes` (its authored disposition at first seed), and `advanceAlderamonticoEmotionalDecayForSave` relaxes live axes toward that baseline each clock tick in Play Mode — a scare wears off, and Grid amplification still outpaces decay inside a region.
- Actor/tile physical-axis unification is live at chemistry scope: every actor standing on a chemistry cell (player *and* NPCs) reads the cell's axes into `actor_physical_states`, takes matching statuses (burn/slow/stun), and crosstalks into the emotional layer — so a creature left standing in fire panics into `flee` behavior, and leaving the cause decays the body state until the record drops. `npm run test:chemistry` proves the loop end to end (burn verb → NPC On Fire → burn status → arousal up → flee → decay after escape).
- Phase 6's Studio authoring is live: the Entity editor authors starting `emotional_axes` (0–100 sliders that seed an entity's runtime state), the Skill editor authors an `emotional_impulse` (signed axis deltas), and the Map editor's **Grid** paint tool assigns `region_id` to cells while a floating panel creates regions and configures each region's `alderamontico_grid` operator (enabled, magnitude, lens entity, lens radius, lens multiplier). All three surface the fields to their AI-generation schemas too.
- `entity.emotional_axes` reaches the runtime through `entityEmotionalSeed` + `ensureAlderamonticoActorState`, which seed an actor's record from authored axes the first time the Grid, a verb, Attend, or the AI touches it.
- `npm run test:state` proves regions/named states, physical panic crosstalk, Attend reveal, Grid amplification, authored Grid-region/lens amplification, Glass accrual, authored-entity-axis seeding, emotional skill-cast impulses, emotion-driven enemy AI (calm attacks / transfixed skips / frightened never attacks), and v2 preservation.

This contract did not arrive with numbered phases, so implementation now follows these derived phases:

1. **Model/save substrate — done:** numeric chemistry foothold, emotional axes, derived regions, Attend memory, save/v2 preservation, and headless tests.
2. **Attend/read-out surfacing — MVP live:** Play Mode can attend a faced actor and show the hidden emotional layer through a compact condition panel.
3. **Grid/lens regions — MVP live:** authored region/lens records call the existing Grid amplification operator, and the systems test map makes lens multipliers spatially testable.
4. **Emotional verbs/skills — done:** `SkillData.emotional_impulse` is a data-only operator on emotional axes, applied on skill cast and surfaced in the log; built-in **Yell** and **Console** verbs are live on the Play command wheel with binding-extreme resistance and before→after behavior feedback.
5. **AI behavior consumption — done:** both `resolveEnemyTurn` (combat) and the exploration energy pump read the emotional layer via `resolveAlderamonticoBehavior` (flee/paralyzed/fade/defend), preserving the default calm melee/schedule AI.
6. **Studio inspection/authoring — done:** Entity, Skill, and Map editors author emotional axes, emotional impulses, and Grid/lens regions respectively.
7. **Decay + actor/tile unification — done at chemistry scope:** emotional axes decay toward per-actor baselines each tick, and chemistry cells write actor physical states/statuses/emotional crosstalk for every actor standing in them.

Still pending: richer region/lens authoring tools (in-viewport region tinting/overlays and per-region cell highlighting), a held sixth emotional axis, and unifying the *remaining* immersive-sim tile-layer exposure path with the chemistry-axis substrate so a single physical model feeds the crosstalk everywhere.

---

## 1. Why axes, not a list of states

A list of N discrete states needs ~N² hand-authored interactions and cannot be reasoned about by a generator. Axes invert this: a handful of dimensions generate thousands of expressible states as *combinations*, and interactions are a few rules over the axes. "Burning" is not a flag — it is `temperature ≥ ignition` while `flammable`. "Frozen" is `temperature ≤ freezing`. New states cost zero code; they are new regions. This is the BotW-chemistry / Dwarf-Fortress-material lesson applied to *both* a physical and an emotional layer.

**Rule of the contract:** nothing in the game is ever a bespoke state-flag if it can be a region on an axis. If you find yourself adding `isPanicking` as a boolean, stop — panicking is `arousal high + valence low + fear high`, computed, not stored.

---

## 2. The physical layer

Generic, the sim's body. 4 core axes + 1 optional. Each entity has a value per axis and per-axis **thresholds** that define its regions (a torch ignites low; a person ignites high; stone never does).

| Axis | Low pole ↔ High pole | Example regions (computed) | Gates / drives |
|---|---|---|---|
| **Temperature** | frozen ↔ burning | frozen, cold, warm, hot, aflame | ignition, cold-damage, melts ice/saturation |
| **Saturation** | dry ↔ soaked | dry, damp, wet, soaked | **suppresses Temperature ignition**, enables Charge conduction |
| **Integrity** | broken ↔ whole | shattered, bleeding, wounded, sound | death/destruction, structural collapse |
| **Toxicity** | clean ↔ poisoned | clean, tainted, poisoned, rotting | damage-over-time, drives emotional disgust/anguish |
| **Charge** *(optional, cut for jam if needed)* | grounded ↔ electrified | grounded, charged, arcing | conducts through soaked entities/tiles, stuns |

**Per-entity data needed:** a value per axis, thresholds per axis, and a few booleans the axes read (`flammable`, `conductive`, `fragile`). That is the entire physical definition of a torch, a person, a water tile, a corpse. **This is the schema AI generates content into.**

**Tiles carry the same axes.** A tile is just an entity with no agency: a tile can have Temperature (a fire tile), Saturation (water), Toxicity (a poison cloud). Verbs and reactions act on tiles and actors identically. This is what unifies exploration and combat — a barrel, a puddle, and a person are the same kind of thing.

---

## 3. The emotional layer — one axis per philosophy + two universals

Same machinery, different dimensions. Two universal axes (every creature has emotions positioned by these) plus three **philosophy axes** that are load-bearing for Alderamontico — each is the emotion a faction runs on, the emotion the Grid amplifies in that faction's region, and the axis a philosophy's virtue and failure both live on.

| Axis | Low pole ↔ High pole | Owned by | Computed regions | Virtue / failure-when-amplified |
|---|---|---|---|---|
| **Valence** | anguish ↔ joy | universal | despairing, low, content, elated | — |
| **Arousal** | numb ↔ frantic | universal | numb, calm, alert, frantic | — |
| **Grief-load** | unburdened ↔ crushed | **Church / Consolation** | light, carrying, heavy, drowning | comfort the grieving / control them, Complete them |
| **Reverence** | defiant ↔ reverent | **Old world / Attention** | restless, attending, devout, transfixed | hold the answer open / never act, sit unto death |
| **Attachment** | severed ↔ bound | **Crimson Ledger / Consent** | detached, fond, devoted, enthralled | love and consent / enthrall (high) or fade to nothing (low) |

**Named emotions are regions, e.g.:**
- **scared** = arousal high + valence low + (situational fear)
- **grieving** = grief-load high + valence low + arousal low
- **manic** = arousal high + valence high
- **despairing** = valence low + arousal numb + grief-load high
- **enthralled** = attachment maxed + arousal low (the contentment of capture)
- **paralyzed-reverent** = reverence maxed + arousal numb (the Watchfold's drowning)
- **fading** = attachment near-zero + valence numb + grief-load low (the Ledger's ascetic fade — the will to nothingness)

You can name "way, way more" of these without writing code; each is a query over the five axes. A generator can invent new emotion-words by labeling new regions.

**Held slot:** a sixth emotional axis is left open (candidates: **Shame ↔ Pride**, or a Pan-flavored **Rootedness ↔ Flight**). Pan/exit and the Uncounted are deliberately *not* their own axis — Pan = high defiance (low reverence) + low attachment, the *absence* of the binding emotions, which is exactly right thematically (the exit is defined by what it refuses to feel-bound-by). Don't give absence its own axis unless play proves it needs one.

---

## 4. Cross-talk: the three couplings that make it a sim

The layers are separate engines but they **talk**, and the cross-talk is where emergence lives. Three coupling rules:

**A. Physical → Emotional.** Physical conditions push emotional axes.
- Burning / wounded / poisoned → arousal up, valence down, fear up. (Being on fire is frightening.)
- Cold → valence down, arousal down (misery, torpor).
- Healed / warmed / fed → valence up, arousal toward calm.
- This is why dousing a burning creature *also* calms it over time — remove the physical cause and the emotional effect decays.

**B. Emotional → Behavior.** An actor's emotional region selects its AI behavior. This is the entire enemy/NPC AI, expressed as state, not scripts.
- fear high → **flee** (away from the source).
- arousal high + valence low + attachment-to-foe low → **attack**.
- reverence maxed + arousal numb → **will not move** (the paralyzed watcher; cannot be made to act).
- attachment-to-X maxed → **will not leave X**, will defend X, cannot refuse X (enthrallment as behavior).
- grief-load drowning → **paralysis / unresponsive** (the hollowed parishioner).
- valence floored + attachment severed → **fade** (stops self-preserving; the release-rite behavior).
- This means you fight, scare, calm, or break an enemy by moving its emotional axes — *yelling to scare a small thing away* is `yell → +arousal +fear` crossing the creature's flee threshold. Same verb fails on a high-courage or reverence-maxed target, and that failure is *legible and fair*.

**C. Emotional → Physical (weak, setting-specific).** Mostly one-way (A dominates), but Alderamontico needs one reverse coupling: **sustained extreme emotion crystallizes Glass.** An entity held at an amplified emotional extreme long enough begins to accrete Glass (a Toxicity-like physical residue) — which is *the Grid's residue forming where feeling is most concentrated.* This is the only emotional→physical rule, and it's the lore made mechanical: Glass grows where emotion drowns.

---

## 5. Verbs are operators on axes

A verb does not produce an outcome; it **pushes one or more axes by a magnitude**, and outcomes fall out of what the target's values and thresholds then do. This is the difference between a list and a sim, and it's the rule the whole "unique solutions" pillar depends on.

| Verb | Pushes | Emergent uses (all from one definition) |
|---|---|---|
| **Throw (object)** | target Integrity (impact), + delivers the object's own state | break a window; knock prone; deliver a lit torch (→Temperature) or a poison vial (→Toxicity) |
| **Push / Pull** | position (forced movement) | shove into fire/water/pit; pull a guard off a ledge; reposition a barrel |
| **Burn** | Temperature + | ignite oil, dry reeds, a rope bridge, a person; melt ice; dry a wet tile; (cross-talk) terrify |
| **Douse / Wet** | Saturation + | extinguish fire; enable conduction; (cross-talk) shock-prep; calm-adjacent |
| **Yell** | target Arousal +, Fear + (emotional) | scare a small/low-courage creature into fleeing; draw a guard's attention (raises *their* arousal/alertness); fail on the transfixed |
| **Strike** | Integrity − | the blunt instrument; works on everything, optimal on little |
| **Comfort / Console** | Grief-load −, Valence + (emotional) | lower a grieving NPC out of paralysis; *honest* console lowers grief without zeroing it; the parish's weapon and its mercy |
| **Ask / Press** | reads emotional layer; can raise/lower Attachment, Resolve | negotiate; read whether a yes is free (attachment vs free arousal); the consent verb |
| **Attend** | *reads* the emotional layer (see §7) | the core game verb; reveals the hidden axis-values under the physical surface |

**Skills hold verbs.** Per your model, a skill is a packaged verb (or verb-combo) with an AP/MP cost and parameters. "Warcry" = Yell at an area. A class is a starting verb-set. Crucially: because verbs are axis-operators, **a new skill is new data, not new code** — it specifies which axes it pushes, by how much, at what cost, in what shape. AI can generate skills.

---

## 6. The Grid is one operator on the emotional layer

This is the payoff — the entire metaphysics as a single rule.

> **The Grid finds the highest emotional axis in a region and amplifies it, pouring it back through Glass, feeding on the increase.**

- A region whose dominant emotion is **grief-load** → grief amplified → the Combe's drowning (compassion→control, mass Completion).
- A region whose dominant emotion is **reverence** → reverence amplified → the Watchfold's drowning (attention→paralysis, the long vigil).
- A region whose dominant emotion is **attachment** → attachment amplified → the Marrowhouse's drowning (consent→enthrallment / fade, the release rite).

The three faction crises are not three authored systems. **They are the same operator hitting three different dominant axes.** The girl is the **lens** that focuses this operator (she raises the amplification magnitude near her — a multiplier on the Grid operator centered on her position). The "voice" is the operator addressing the entity whose dominant emotion is the rare, clean ache the protagonist carries. Attending is reading the layer the Grid writes to. **Once the axes exist, the Grid is ~20 lines, not a subsystem.**

This also makes the shallow/true loop systemic: a **shallow** resolution forces an emotional axis to an extreme (declares the answer → reverence spikes; mass-Completes → grief forcibly zeroed) which *feeds the lens* (more amplification, more Glass). A **true** resolution moves the axis toward a sustainable middle without an extreme, starving the operator. The `attention` integer can be derived from / interact with this rather than being hand-set.

---

## 7. The read-out: three things visible, the emotional layer attention-gated

Resolve at **presentation, never at model.** The two layers stay separate engines; the player sees:

1. **Physical state** — always fully visible. The surface: burning, wet, bleeding, frozen.
2. **Emotional state** — **partially hidden by default; revealed by Attend.** Without attending, you see only what the physical surface and behavior *imply* (and the Grid can make that misleading — a body that *looks* at peace). Attending exposes the true axis-values beneath.
3. **The Condition** — the single emergent read-out combining both, in plain language: *"a burning animal, panicking"* · *"a grieving man begging to stop being"* · *"a girl who looks at peace"* (surface) which, attended, becomes *"a girl drowning in borrowed reverence, afraid."*

**This interface *is* the game's thesis.** The Grid's deception is the gap between the surface read-out and the attended truth. The attend mechanic is the act of closing that gap. A creature you haven't attended shows you its physical state and a *guessed* emotional state; the guess can be wrong, especially where the Grid is strong. Growing `attention` widens how much of the emotional layer you can read and how reliably — low attention shows a blurred/Grid-flattered emotional read, high attention shows true axis-values. The unsolvable Marrowhouse node (Reni) is the case where *even full attention* returns ambiguity on the Attachment-vs-free-Arousal question — the one place the read-out honestly displays "indeterminate," which is the consent philosophy rendered as a UI state.

---

## 8. What this contract commits the build to

- **Entities = axis-values + thresholds + a few booleans.** Two layers. Nothing is a bespoke state-flag.
- **Tiles = entities without agency,** carrying the same physical axes. One world model for explore and combat.
- **Verbs/skills = axis-operators (data, not code).** New content is new data.
- **AI behavior = a function of emotional region.** No behavior scripts; behavior is read off the emotional axes.
- **The Grid = one amplify-the-dominant-axis operator,** the girl a lens (magnitude multiplier), the voice a targeted address, attending a read.
- **Glass = emotional→physical residue** accreting at sustained emotional extremes.
- **The UI shows physical + emotional + combined Condition,** the emotional layer gated by Attend, the gap between surface and truth being the Grid's lie and the game's theme.

## 9. Minimum viable version (for the jam, if the full contract is too much)

If the engine audit shows the physical layer is real but thin, ship this reduced set and it still holds:
- Physical axes: **Temperature, Saturation, Integrity** (drop Toxicity, Charge).
- Emotional axes: **Valence, Arousal, + the three philosophy axes** (Grief, Reverence, Attachment) — these are non-negotiable; they're the setting.
- Cross-talk: keep **A (physical→emotional)** and **B (emotional→behavior)**; defer C (Glass crystallization) to a scripted approximation if needed.
- Read-out: physical visible, emotional attend-gated, combined Condition string. Non-negotiable — it's the game.
- The Grid operator and the lens: non-negotiable — it's the plot, expressed as a rule.

Everything cuttable is physical. Nothing emotional is cuttable, because the emotional layer is what makes this Alderamontico and not a generic sim.

---

## 10. Open questions for after the engine audit
1. Does the current engine model state as values/axes already, or as discrete status flags? (Decides whether this is a refactor or a fresh layer.)
2. Is there an existing AI/behavior system, and can it be driven by emotional-region queries instead of its current logic?
3. Does "Glass gives an emotional-state effect" (already conceived) write to these emotional axes? If so, the emotional layer is partly already begun.
4. How are tiles represented — can they hold axis-values, or only terrain types? (Decides how much of §2's tile-unification is real.)
5. Can the existing skill/command system express a skill as "push axes X,Y by magnitude M in shape S," or is each skill currently bespoke? (Decides whether verbs-as-operators is a refactor or a rewrite.)
