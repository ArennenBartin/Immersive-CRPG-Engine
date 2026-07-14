# Threefold March Geography And Greybox V1

Status: Doc 07 Phase 2 is fixed in code, and Doc 07 Phase 3 has a first traversable greybox pass. The current greybox visual version is `v2_cohesive_terrain`, which replaces the original per-cell terrain-noise sampler with broad authored terrain patches.

Primary implementation: `src/utils/threefoldMarchMap.ts`

Audit gates:

```bash
npm run audit:maps
npm run audit:overworld
```

## Installed Areas

| Map id | Area | Role | Size | Exits |
|---|---|---|---:|---:|
| `map_march_watchfold` | The Watchfold | seat_approach | 48x48 | 1 |
| `map_march_reedmire` | The Reedmire | wild | 96x96 | 4 |
| `map_march_combe` | The Combe | seat_approach | 48x48 | 1 |
| `map_march_hallowdown` | Hallowdown | wild | 120x120 | 3 |
| `map_march_marrowhouse` | The Marrowhouse | seat_approach | 48x48 | 1 |
| `map_march_thornmarch` | The Thornmarch | crossing | 48x64 | 3 |
| `map_march_gallowsreach` | Gallowsreach | wild | 96x96 | 1 |
| `map_march_convening` | The Convening | basin | 64x64 | 3 |
| `map_march_under_convening` | The Under-Convening | fracture_mouth | 32x48 | 1 |

## Graph

```text
Gallowsreach
    |
Watchfold -- Reedmire -- Hallowdown -- Marrowhouse
                 \          /
                  Thornmarch
                      |
                 The Convening -- down --> Under-Convening
                      |
                   The Combe
```

## Current Greybox Contract

- The default package now starts at `map_march_convening#spawn_start`.
- The old `map_overworld` engine systems test map remains installed for test-lab work.
- Persisted packages backfill missing `map_march_*` maps on load and refresh stale March greyboxes that are not marked `v2_cohesive_terrain`.
- Each March map has fixed size, active playable island, void margins, route skeletons, spawns, exits, and placeholder landmarks.
- Terrain is intentionally low-frequency: large fields, pools, ridges, groves, scar bands, and roads. Do not reintroduce per-cell random terrain selection; generated oblique textures become visually noisy when every cell changes material.
- Towns and seats are built from floor/wall/door/prop tiles rather than single-tile town/city icons.
- Fracture-mouths are blocked out as scar terrain plus Glass/story props rather than single-tile fracture symbols.
- The Convening contains the Stone placeholder and hatch descent to the Under-Convening.
- `audit:maps` now checks exit walkability and spawn-to-exit reachability.
- `audit:overworld` checks the Phase 2/3 March contract: nine areas, graph edges, installed maps, current greybox version, wild discovery hooks, and mandatory descent.

## Still Pending

- Phase 4 population: systemic set-pieces, sparse ambient fill, soft-gates with multiple solutions, discoveries, enemies, loot, and sidequest hooks.
- Phase 5 wiring: day/night schedules, seat/basin emotional profiles, the girl as lens actor, companion/story beats, and Attend nodes.
- Later audit expansion: set-piece solution validation, soft-gate bypass validation, combat-set-piece validation, and first-ten-minutes distinctive-sim verification.
