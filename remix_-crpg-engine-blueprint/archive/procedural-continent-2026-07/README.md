# Procedural continent archive marker

The procedural-continent subsystem was removed before the dungeon-readiness stabilization pass in July 2026. Its v3 district/hub types and the older town/dungeon/river/lake implementation had diverged, which made the feature non-type-safe and non-reproducible.

No implementation is retained here because the removed code has no supported compatibility role. This directory records the architectural decision only:

- it is not an active source of truth;
- production code must not import from `archive/` or a continent module;
- dungeon generation writes ordinary `GameMap` data through the active typed builder;
- generic RNG, grid, routing, flood-fill, and coordinate utilities remain in their neutral engine modules only where independently used and tested.

See `docs/ENGINE_SYSTEMS_REFERENCE_3D_STABILIZED.md` and
`docs/STABILIZATION_AND_DUNGEON_READINESS_IMPLEMENTED.md` for the active
contracts.
