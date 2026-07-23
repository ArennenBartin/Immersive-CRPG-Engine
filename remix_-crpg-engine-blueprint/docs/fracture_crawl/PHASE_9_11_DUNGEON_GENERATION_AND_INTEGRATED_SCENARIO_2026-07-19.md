# Fracture Crawl Phases 9–11 — Deterministic Dungeons and Integrated Architecture

Status: implemented for browser acceptance  
Date: 2026-07-19  
Source plan: Phases 9–11 of `08_ALDERAMONTICO_FRACTURE_CRAWL_CODEX_ENGINE_BUILD_PLAN_V1.md`

## Delivered capability

The dungeon pipeline now has a Fracture-specific, non-destructive boundary over the established generator:

1. **Generate Draft** creates a frozen topology draft from a profile and seed.
2. **Generate Geometry** embeds and populates that exact draft into disposable ordinary-map previews.
3. **Bake to Project** remains the only operation that changes authored project maps.

The same generator version, profile, content library, stage salts, and seed reproduce the same topology hash. A stale draft is rejected if its profile, topology, or generator content changes before geometry is baked.

Draft, Geometry, and Full generation all execute through the generation worker. Studio can terminate an active worker without committing partial maps, while the environment-neutral worker core preserves identical deterministic results in automated tests.

Draft validation covers:

- entrance and reachable culmination;
- every branch reachable from the entrance;
- a meaningful loop;
- solvable gate dependencies and return route where required;
- unique graph, gate, and opportunity IDs;
- required entrance, culmination, landmark, artifact-origin, and extraction opportunities.

## Default single-map rule-definition preset

`institutional_ruin_single_map_v2` is now the selected starter preset. It generates one 72×72 fracture map with:

- 16–20 rooms;
- an 8–10-room south-to-north critical route;
- two or three lateral branches of two or three rooms;
- one compact open loop;
- three-cell open corridors;
- no doors, locks, keys, secrets, or vertical transitions;
- rectangular, L-shaped, and junction/alcove silhouettes;
- a safe entrance and first two critical rooms;
- a quiet staging room before the culmination;
- one active, portable, extinguishable **Expedition Lantern** within two cells of the primary spawn.

The legacy `institutional_ruin_v1` multi-floor, keyed-door recipe remains unchanged and selectable for compatibility and regression coverage. Installing starter content only adds missing records and never overwrites an edited recipe.

Studio reports map, room, edge, door, exit, lantern, route, corridor, loop, silhouette, landmark, fine-cell, actor, and chemistry metrics. The v2 bake is blocked unless it has exactly one map, open-only topology, one nearby lantern, at least 30 macro steps from entrance to culmination, corridors no longer than 28 macro cells, at least three silhouettes, and no more than 15,000 estimated fine cells.

## Typed generation sockets

Generated opportunities are stored on ordinary maps as `generation_sockets`, not as opaque runtime data or loose props. A socket records:

- stable map-local ID;
- stable source opportunity ID;
- kind;
- map cell;
- source graph node;
- required status;
- authoring tags.

Kinds currently include entrance, culmination, landmark, artifact origin, extraction, encounter, light control, and darkness.

Sockets participate in:

- schema validation;
- deterministic map hashes;
- package import/export and browser persistence;
- generated namespace remapping;
- duplicate-ID and bounds audits;
- walkability validation;
- Map Studio editing;
- dungeon floor-plan inspection.

Moving a socket through Studio marks generated provenance as manually edited and refreshes the ordinary map hash. Regeneration and replacement remain explicit and use the existing collision, confirmation, backup, and undo boundaries.

## Integrated Phase 11 scenario

The Project Dashboard provides **Install Phase 11 Scenario…**. This explicit destructive action first downloads a JSON backup, clears the prior Play run, builds the fixed-seed scenario, and opens Play at its dedicated hub.

The scenario combines one generated single-map fracture with authored content for:

- sight, hearing, and Glass/light-sensitive creatures;
- carried, placeable, throwable, and Glass-fueled light;
- smoke obscurance;
- harvestable Glass and its recovery-value tradeoff;
- a conserved artifact;
- one persistent pushable/breakable rubble obstruction on the optional loop;
- culmination, signature, death, and extraction interactions;
- Intercessor succession, persistent ghost, signature inheritance, death bundle recovery, and hub artifact recovery.

It is a systems proof, not final Fracture Crawl campaign canon.

## Browser acceptance route

1. On Home, select **Install Phase 11 Scenario…** and confirm the backup/replacement prompt.
2. Inspect the hub, then enter the north fracture threshold.
3. Pick up the generated Expedition Lantern beside the safe spawn, then test the placeable beacon, throwable flare, and Glass burner.
4. Traverse the sensory rooms; use sound distraction and the smoke area.
5. Harvest Glass and decide whether to consume one unit for emergency light.
6. Reach the culmination without changing dungeon maps, collect the Resonance Index, and move or break the loop rubble.
7. Use the succession/death interaction, continue as the next Intercessor, commune with the prior ghost, and recover the death bundle.
8. Extract to the hub and verify artifact recovery.
9. Save, refresh/reload, and verify the persistent campaign state remains.

For direct generator authoring, open **Dungeons**, generate a topology draft, generate geometry, inspect Graph/Floor Plan/3D/Audit, and use the existing guarded Bake tab only when ready to commit ordinary maps.

## Automated evidence

Focused commands:

```bash
npm run test:fracture-dungeon
npm run test:phase11
npm run test:dungeon
npm run test:dungeon-quality
npm run typecheck
```

`test:fracture-dungeon` proves deterministic frozen drafts, topology validation, non-mutation, exact-draft geometry, typed reachable sockets, provenance, manual socket relocation, and create-new-ID remapping.

`test:phase11` executes the full deterministic architecture route through generation, authoritative light sources, sound, Glass consumption, artifact state, shortcut state, death/succession, ghost communion, signature inheritance, bundle recovery, extraction, hub recovery, and v2 JSON save/reload.

`test:dungeon-quality` runs Draft, Geometry, and Full through the shared worker core and then generates every seed in a 32-seed v2 corpus twice. It requires matching hashes, one open map, no gates/keys/secrets/exits/transitions, one reachable entrance lantern, two or three branches, one loop, a three-room safe opening, all three procedural silhouettes, correct north/south progression, and every blocking quality threshold to pass.

The topology corpus audit accepted and reproduced all 32 requested seeds in the Phase 9 verification run (0 rejected; approximately 319 ms total on the development machine).

## Capability after this batch

The engine can now produce a reproducible, coherent single-map fracture, turn it into validated editable ordinary maps without silently touching authored work, and prove the campaign architecture on one complete browser-testable vertical slice. Legacy multi-map generation remains available when a package explicitly selects it.

The next sequential batch begins with Phase 12: editor completion and authoring readiness.
