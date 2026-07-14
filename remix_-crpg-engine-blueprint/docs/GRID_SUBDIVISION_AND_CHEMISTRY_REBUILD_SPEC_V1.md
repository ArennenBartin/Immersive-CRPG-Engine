# CRPG Engine - Grid Subdivision & Chemistry Rebuild Spec v1

This is the active rebuild direction for the spatial layer. The engine is moving from one overloaded cell concept to two explicit resolutions:

- **Macro tiles**: authored maps, art/readable coordinates, triggers, quest locations, dialogue coordinates, regions, rooms, and authored skill numbers.
- **Fine cells**: movement steps, collision, actor footprints, combat resolution, LOS/perception sampling, and chemistry fields.

Locked decisions:

- `FINE_PER_MACRO` is the single source of truth.
- Phase A keeps `FINE_PER_MACRO = 1` and must preserve behavior.
- The target ratio is 3x linear, or 9x area.
- Existing authored content stays macro and is expanded by the engine.
- Characters eventually occupy 3x3 fine-cell footprints.
- Movement follows Option A: one player step is one fine cell, with held-to-move making that feel like walking.
- Combat ranges, AoE, adjacency, and forced movement stay authored in macro and resolve in fine.
- Chemistry stays scalar-axis based, then gains height-aware viscous flow, active-set ticking, and sparse persistence.
- Fluids should ooze visibly over multiple player moves instead of instantly settling.
- Fog/LOS remains resolution-swappable until profiling decides whether fine fog is affordable.

Build order:

1. **Phase A - Coordinate abstraction at ratio 1.** Introduce macro/fine coordinate helpers and route spatial code through them without behavior changes.
2. **Phase B - Flip ratio to 3.** Expand authored macro maps to fine cells, implement 3x3 actor footprints, fine stepping, held-to-move, and world-speed animation.
3. **Phase C - Combat re-expression.** Convert authored macro ranges/shapes to fine resolution, keep combat movement cost macro-distance based, and update adjacency/knockback helpers.
4. **Phase D - Chemistry rebuild.** Add flow archetypes, viscosity, height-aware liquid flow, multi-iteration ooze, active sets, sparse persistence, and fine projection.
5. **Phase E - LOS/fog decision.** Profile fine fog/LOS and choose fine or macro fog behind the same abstraction.
6. **Phase F - Audits/tests/save-size polish.** Update audits and tests, measure large-map save growth, and tune movement/chemistry feel.

Guardrails:

- Author in macro, simulate in fine.
- Never hard-code the target ratio outside the coordinate module.
- Do not expose fine coordinates to designers unless a later explicit fine-editing tool exists.
- If chemistry iterates the whole map in the final 3x version, that is a performance bug.
- Held movement quality is part of the feature, not polish.
- Keep perception resolution swappable.

## Implementation Notes

Current status:

- Phase D is implemented at the engine-runtime level:
  - chemistry has scalar `liquid_volume` and `vapor` axes;
  - material profiles include `flowArchetype`, `flowRate`, `slopeHold`, and `dissipation`;
  - liquid flow is height-aware and viscosity-gated;
  - water, oil, honey, and miasma have distinct flow behavior;
  - chemistry uses an active-set frontier instead of whole-map ticking in runtime;
  - `save.chemistry` is sparse and stores only cells that differ from the authored/expanded baseline;
  - `save.chemistry_runs` stores row-run chemistry deltas when that is smaller than point records;
  - `save.chemistry_active` persists the live frontier;
  - fine-cell surface/environment projection remains renderer-facing.
- Phase E is complete and profile-backed:
  - `GameRenderer2D` supports `fogResolution: "macro" | "fine"`;
  - The default package sets `settings.fog_los_resolution = "macro"`;
  - macro fog stores explored state at authored-tile scale while sampling fine blockers;
  - `npm run profile:fog` profiles macro vs fine fog/LOS on a 120x120 macro / 360x360 fine map;
  - Fork B is the default: macro fog keeps save growth and AI-facing memory flat, while fine fog remains available for experiments.
- Phase F is implemented for the engine foundation:
  - engine tests now assert macro/fine helpers against the configured `FINE_PER_MACRO = 3` ratio;
  - v1 runtime, simulation, perception, combat, object footprint, and NPC path helpers use package-aware macro/fine adapters so legacy macro packages keep old behavior;
  - NPC movement now has a bounded path search before falling back to greedy stepping;
  - `npm run profile:save` measures large-map fog and chemistry save growth;
  - run-encoded chemistry keeps large uniform spills below the current 2 MB JSON budget in the synthetic large-map profile.

Latest local fog profile:

- fine fog: average `0.746ms`, p95 `1.342ms`
- macro fog: average `0.097ms`, p95 `0.177ms`
- decision: fine is below the 8ms p95 threshold, but macro remains the default because it is cheaper and keeps fog saves small; fine is available as an explicit setting for experiments.

Latest local save-size profile:

- base save: `0.6 KB` JSON, `0.4 KB` gzip
- macro fog full map: `115.5 KB` JSON, `33.8 KB` gzip
- fine fog full map: `1.16 MB` JSON, `237.6 KB` gzip
- point flood plus macro fog: `7.10 MB` JSON, `127.6 KB` gzip
- run flood plus macro fog: `166.4 KB` JSON, `36.8 KB` gzip
- decision: macro fog remains default; run-encoded chemistry keeps large uniform spills under budget.
