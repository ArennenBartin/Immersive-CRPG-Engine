# Phases 6–8 — Ghosts, Artifact Recovery, and Glass Fuel

Date: 2026-07-18

Status: implemented for the Phase 6–8 batch

## Outcome

The pending ghost and death-bundle requests created by Phases 4–5 now become
physical, save-backed campaign landmarks. Expedition artifacts have one legal
location at a time, and Raw Glass creates a visible choice between recovery
value and emergency illumination.

The reusable implementation lives in
`src/engine-core/fractureCrawlLegacy.ts`. It extends the existing lifecycle
rather than replacing the authored/campaign/expedition state boundary.

## Phase 6 — Persistent ghosts and signature skills

Every completed Intercessor death now materializes one stable ghost record.
The record retains:

- its source Intercessor and expedition;
- the requested death map and cell;
- the final valid map and cell;
- whether safe-placement fallback was needed, and why;
- visual marker configuration;
- deterministic signature skill;
- degraded-memory, testimony, and archive references;
- one interaction record per successor;
- persistent presence after communion.

Placement is deterministic. The engine validates against the reachable
walkable component, collision-bearing objects, containers, and already
reserved ghost or bundle footprints. An invalid or occupied death cell moves
to the nearest legal cell and records the fallback instead of silently placing
the landmark outside navigable space.

Facing or standing on a ghost and using **Act** communes with it. The active
Intercessor receives the recorded signature skill once. Repeating the same
communion cannot duplicate either the skill or the interaction record, and the
ghost remains in the world.

Multiple ghosts and their interactions survive slots, browser refresh, V1
saves, V2 saves, and Studio/Play runtime cloning.

## Phase 7 — Artifact registry and death bundles

An artifact item now authors a stable `artifact_id`, recovery value, and
burden. Reference validation requires exactly one authored world-item origin
with a count of one. Duplicate IDs, missing origins, multiple origins, and
invalid origin counts are errors.

The campaign registry enforces these states:

- `AtOrigin`
- `Carried`
- `InDeathBundle`
- `RecoveredToHub`

The implemented transitions are:

- origin pickup moves `AtOrigin → Carried`;
- death moves `Carried → InDeathBundle`;
- recovering the bundle moves `InDeathBundle → Carried`;
- returning to the configured hub moves `Carried → RecoveredToHub`;
- a successor dying before recovery moves the predecessor's unresolved
  artifact `InDeathBundle → AtOrigin`.

Every death bundle has an identity and footprint independent of its ghost. It
records the owner, requested and final placement, ordinary inventory contents,
protected artifact IDs, recovery status, and any artifacts returned to origin.
Recovering it twice cannot duplicate contents.

Generic engine item commands fail closed for registered artifacts and tracked
Glass. They cannot be silently granted, removed, dropped, sold, bought, or
stowed outside their lifecycle operations. World pickup enters the artifact or
Glass ledger automatically, so non-Play engine callers receive the same
conservation guarantees as the Play interface.

## Phase 8 — Glass harvesting and emergency light

Item authoring now supports:

- a Glass resource profile with units per item, value per unit, and burden per
  unit;
- a Glass-fueled light profile with resource identity, ignition cost, and
  duration;
- ordinary light-source intensity, radius, color, mobility, exposure, and
  stimulus tags.

Harvest events use stable expedition-scoped identities. Replaying one event
does not mint more Glass value. The campaign ledger stores harvested and burned
units, while current carried inventory determines burden.

Igniting a compatible lamp:

1. verifies that the configured Glass exists;
2. consumes a whole authored inventory quantity exactly once;
3. reduces recoverable value and carried burden;
4. activates the existing authoritative light source;
5. writes an expiry tick used by visibility and perception;
6. retains configured `light` and `glass` stimulus tags.

Repeated activation cannot spend the same event twice, and an already active
lamp does not consume another unit. At expiry it stops contributing to the
authoritative light-source set.

## Studio authoring and Play presentation

The Studio item editor exposes **Artifact**, **Glass Resource**, and **Glass
Fuel** sections. The Campaign panel exposes successor baseline skills, ghost
and bundle marker icons, and automatic hub artifact recovery.

Play renders ghosts and available bundles through the lightweight world-marker
path. Current fog and visibility still gate them, so remembered geometry does
not leak current bundle state. The Journal lists:

- persistent ghosts and their signatures;
- bundle availability and contents;
- every artifact's current lifecycle state;
- current recoverable Glass value and carried burden.

## Browser acceptance route

Install or reset to the QA suite, then enter **QA Persistence & Succession
Lab** from the hub curator.

### Ghost and bundle proof

1. Read the instruction shelf.
2. Learn or retain a first signature skill.
3. Pick up the Violet Archive Seal.
4. Use the **SUCCESSION** terminal.
5. Continue as the generated successor and return to the lab.
6. Confirm the ghost and bundle occupy separate reachable cells.
7. Face or stand on the ghost and use **Act**; confirm its skill is inherited.
8. Use **Act** on the bundle; confirm its inventory and Seal are recovered.
9. Use the **SIGNATURE** terminal to learn the distinct successor skill.
10. Use **SUCCESSION** again, return, and confirm both ghosts still exist.
11. Commune with both; repeat communion and confirm neither skill duplicates.
12. Save and refresh; confirm both ghosts, both skills, and bundle states remain.

### Artifact matrix

Use separate fresh runs where needed:

1. Origin → carry → return through the south hub exit → `RecoveredToHub`.
2. Origin → carry → death bundle → recover → hub.
3. Origin → carry → death bundle → successor dies before recovery → origin.
4. Origin → carry → bundle recovery → successor death → new bundle.

The Journal exposes the state after every step.

### Glass tradeoff

1. Pick up the six **Raw Glass** and the **Glass Emergency Lamp** in the south
   room.
2. Open the Journal and confirm recoverable value `72` and burden `1.2`.
3. Use the lamp from inventory.
4. Confirm the dark area is illuminated and the lamp exposes normal `light`
   and `glass` stimuli.
5. Reopen the Journal and confirm value `60` and burden `1.0`.
6. Try to activate the already-burning lamp; no second unit is consumed.
7. Save and refresh; confirm the remaining Glass, ledger, and active duration
   restore correctly.

For a zero-ambient perception proof, take the fueled lamp into **QA Perception
Lab** and observe the authored Glass-sensitive watcher.

## Automated contract

`npm run test:fracture-crawl-legacy` behavior-tests:

- stable registry initialization;
- valid, distinct ghost and bundle placement;
- two persistent ghosts with deterministic distinct signatures;
- once-only communion;
- the artifact recovery and origin-fallback matrix;
- generic command conservation guards;
- Glass harvest and ignition idempotence;
- value, burden, light expiry, and stimulus tags;
- broken artifact and Glass-fuel authoring diagnostics;
- V1 JSON and V2 wrapped/unwrapped persistence.

The contract is included in `npm run test:all`.

## Deliberate boundary

Ghost testimony uses stable memory and testimony references; a future content
phase may attach richer authored conversations to them. This batch does not
redesign dialogue, AI, combat, fog, or the renderer. The next canonical work is
Phase 9: deterministic editor-time dungeon graph and draft generation.

## Governing rule

A death leaves history in the world. An artifact has one legal location. Glass
can be carried home or burned to survive, but never counted twice.
