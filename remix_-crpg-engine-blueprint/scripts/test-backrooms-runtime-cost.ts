// Backrooms generator — runtime cost guards.
// Run: npm run test:backrooms-runtime-cost
//
// A generated Level 0 is roughly an order of magnitude larger than any
// authored QA map, which made two long-standing assumptions expensive enough
// to be felt as lag:
//
//   1. a map was classified "large" by its AUTHORED cell count, while the cost
//      it actually pays is the runtime count — FINE_PER_MACRO² times bigger —
//      so a level well over the windowing budget still reported itself small
//      and was fully expanded and re-rendered;
//   2. every viewer visibility query rebuilt whole-map structures to answer a
//      question about the few hundred cells around one viewer.
//
// These guards pin both. They are budget tests, so they assert generous
// bounds: the point is to catch a return to whole-map work, not to freeze a
// particular number.

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { generateBackroomsMap } from "../src/backroomsGen";
import {
  createLevel0CmtBackroomsRecipe,
  LEVEL0_CMT_PHASE4_ANCHORS,
} from "../src/backroomsGen/presets/level0Cmt";
import {
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP,
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID,
} from "../src/data/qaSuite/generatedBackroomsPhase6Wing";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  advanceImmersiveWorldStateForSave,
  createImmersiveViewerVisibilityFromV1,
  expandGamePackageToFine,
} from "../src/engine-core";
import { expandMapToFine } from "../src/engine-core/fineWorld";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
} from "../src/engine-core/gridCoordinates";
import {
  getRuntimeMapGrid,
  isLargeAuthoredMap,
  LARGE_MAP_CELL_THRESHOLD,
  RUNTIME_SECTOR_CACHE_LIMIT,
  RUNTIME_SECTOR_HALO,
  RUNTIME_SECTOR_SIZE,
  RuntimeMapGrid,
  resolveNearestRuntimeWalkableFineCell,
} from "../src/engine-core/runtimeMapGrid";
import { GamePackageSchema, type GamePackage, type MapData } from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";

// ── 1. "Large" is measured in runtime cells, not authored cells ────────────

console.log("runtime cost: map size classification counts runtime cells");

// A map just over the budget once expanded must be windowed, even though its
// authored count is comfortably under it.
const justOverOnceExpanded = Math.ceil(
  LARGE_MAP_CELL_THRESHOLD / (FINE_PER_MACRO * FINE_PER_MACRO),
) + 1;
const syntheticLarge = {
  id: "synthetic_large",
  display_name: "Synthetic",
  width: 200,
  height: 200,
  spawns: [],
  cells: Array.from({ length: justOverOnceExpanded }, (_, index) => ({
    x: index % 200,
    z: Math.floor(index / 200),
  })),
  props: [],
  custom_object_placements: [],
  entity_placements: [],
  item_placements: [],
  container_placements: [],
  triggers: [],
  exits: [],
} as unknown as MapData;

assert.ok(
  syntheticLarge.cells.length < LARGE_MAP_CELL_THRESHOLD,
  "the fixture's authored count must sit under the raw threshold",
);
assert.ok(
  isLargeAuthoredMap(syntheticLarge),
  "a map over budget once expanded must be treated as large",
);

// Small authored maps stay eager — windowing a tiny room would be pure cost.
const syntheticSmall = {
  ...syntheticLarge,
  width: 20,
  height: 20,
  cells: syntheticLarge.cells.slice(0, 400),
} as unknown as MapData;
assert.equal(
  isLargeAuthoredMap(syntheticSmall),
  false,
  "ordinary authored maps must not start paying for windowing",
);

// Every authored QA map must stay eager, so this classification change cannot
// silently alter how shipped content loads.
const qaPackage = createQaSuitePackage();
for (const map of qaPackage.maps) {
  if (map.id.startsWith("brg_")) continue; // generated Backrooms bakes may window
  assert.equal(
    isLargeAuthoredMap(map),
    false,
    `authored QA map ${map.id} must keep loading eagerly`,
  );
}

// ── 2. A generated Level 0 is windowed, and windowing actually pays ────────

console.log("runtime cost: a generated Level 0 windows instead of expanding");

const generated = generateBackroomsMap({
  recipe: createLevel0CmtBackroomsRecipe("runtime-cost-001"),
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  generatedAt: "2026-08-09T12:00:00.000Z",
  includePacing: true,
});
assert.ok(generated.success && generated.map, "the probe map must generate");
const map = generated.map!;

assert.ok(
  isLargeAuthoredMap(map),
  "a full-scale generated Level 0 must qualify for windowing",
);

const eagerCellCount = map.cells.length * FINE_PER_MACRO * FINE_PER_MACRO;
const runtimeCellCount = expandMapToFine(map).cells.length;
assert.ok(
  runtimeCellCount < eagerCellCount / 2,
  `windowing must materially reduce runtime cells (${runtimeCellCount} vs ${eagerCellCount} eager)`,
);
assert.ok(
  runtimeCellCount <= LARGE_MAP_CELL_THRESHOLD,
  `a windowed map must fit the runtime budget, got ${runtimeCellCount}`,
);

// A 3x3 stream window only needs to own near simulation. Far-field visual
// architecture is sourced from the authored map and has its own lightweight
// coverage path, so keeping the old 32-macro sectors here spent CPU and memory
// without preventing a visible edge. Pin both the guaranteed near guard and
// the actual worst sector of the bundled Phase 7 topology.
assert.equal(RUNTIME_SECTOR_HALO, 1);
assert.equal(
  RUNTIME_SECTOR_SIZE * FINE_PER_MACRO,
  60,
  "the least-favourable stream edge must retain a 60-fine-cell near guard",
);

const coverageSize = RUNTIME_SECTOR_SIZE * 4;
const denseCoverageMap = {
  ...syntheticLarge,
  id: "runtime_stream_coverage_probe",
  width: coverageSize,
  height: coverageSize,
  cells: Array.from(
    { length: coverageSize * coverageSize },
    (_, index) => ({
      x: index % coverageSize,
      z: Math.floor(index / coverageSize),
      walkable: true,
      blocks_los: false,
    }),
  ),
} as unknown as MapData;
const coverageGrid = new RuntimeMapGrid(denseCoverageMap);
for (const playerMacro of [RUNTIME_SECTOR_SIZE, RUNTIME_SECTOR_SIZE * 2 - 1]) {
  const center = fineCenterOfMacro([playerMacro, playerMacro]);
  const active = coverageGrid.activeSectorKeys(center);
  for (const [dx, dz] of [
    [-RUNTIME_SECTOR_SIZE, 0],
    [RUNTIME_SECTOR_SIZE, 0],
    [0, -RUNTIME_SECTOR_SIZE],
    [0, RUNTIME_SECTOR_SIZE],
  ] as const) {
    const targetSector = coverageGrid.sectorOfMacro(
      playerMacro + dx,
      playerMacro + dz,
    );
    assert.ok(
      active.has(`${targetSector[0]}:${targetSector[1]}`),
      `stream edge ${playerMacro} must retain the ${dx}:${dz} guard sector`,
    );
  }
}

const sectorProbeGrid = new RuntimeMapGrid(map);
const measuredSectors = new Set<string>();
const windowCellCounts: number[] = [];
const windowBuildTimes: number[] = [];
for (const cell of map.cells) {
  const sector = sectorProbeGrid.sectorOfMacro(cell.x, cell.z);
  const id = `${sector[0]}:${sector[1]}`;
  if (measuredSectors.has(id)) continue;
  measuredSectors.add(id);
  const started = performance.now();
  const window = sectorProbeGrid.materializeFineWindow(
    fineCenterOfMacro([cell.x, cell.z]),
  );
  windowBuildTimes.push(performance.now() - started);
  windowCellCounts.push(window.cells.length);
}
windowCellCounts.sort((left, right) => left - right);
windowBuildTimes.sort((left, right) => left - right);
const medianWindowCells =
  windowCellCounts[Math.floor(windowCellCounts.length / 2)]!;
const worstWindowCells = windowCellCounts[windowCellCounts.length - 1]!;
const medianWindowBuildMs =
  windowBuildTimes[Math.floor(windowBuildTimes.length / 2)]!;
const worstWindowBuildMs = windowBuildTimes[windowBuildTimes.length - 1]!;
assert.ok(
  worstWindowCells <= 33_000,
  `the worst Phase 7 sector must stay below 33k fine cells, got ${worstWindowCells}`,
);

// Crossing a boundary needs three new sectors. Keeping the union of adjacent
// 3x3 windows means a one-step backtrack performs zero sector rebuilds instead
// of recreating and collecting tens of thousands of cell objects.
const cellByCoord = new Map(
  map.cells.map((cell) => [`${cell.x}:${cell.z}`, cell] as const),
);
const boundaryGrid = new RuntimeMapGrid(map);
const boundaryPair = map.cells
  .filter((cell) => cell.walkable)
  .map((cell) => ({
    left: cell,
    right: cellByCoord.get(`${cell.x + 1}:${cell.z}`),
  }))
  .find(({ left, right }) => {
    if (!right?.walkable) return false;
    const leftCenter = fineCenterOfMacro([left.x, left.z]);
    const rightCenter = fineCenterOfMacro([right.x, right.z]);
    const leftSector = boundaryGrid.sectorOfFine(leftCenter[0], leftCenter[1]);
    const rightSector = boundaryGrid.sectorOfFine(rightCenter[0], rightCenter[1]);
    return (
      leftSector[0] !== rightSector[0] &&
      boundaryGrid.activeSectorKeys(leftCenter).size === 9 &&
      boundaryGrid.activeSectorKeys(rightCenter).size === 9
    );
  });
assert.ok(boundaryPair?.right, "the Phase 7 map needs a walkable interior stream boundary probe");
const leftCenter = fineCenterOfMacro([
  boundaryPair!.left.x,
  boundaryPair!.left.z,
]);
const rightCenter = fineCenterOfMacro([
  boundaryPair!.right!.x,
  boundaryPair!.right!.z,
]);
const materializeTimed = (center: readonly number[]) => {
  const started = performance.now();
  const window = boundaryGrid.materializeFineWindow(center);
  return { window, ms: performance.now() - started };
};
const coldBoundary = materializeTimed(leftCenter);
const crossedBoundary = materializeTimed(rightCenter);
const buildsAfterCrossing = boundaryGrid.stats().sectorBuilds;
const backtrackedBoundary = materializeTimed(leftCenter);
const buildsAfterBacktrack = boundaryGrid.stats().sectorBuilds;
const crossedAgainBoundary = materializeTimed(rightCenter);
assert.equal(
  buildsAfterBacktrack,
  buildsAfterCrossing,
  "an immediate boundary backtrack must reuse every previously active sector",
);
assert.equal(
  boundaryGrid.stats().sectorBuilds,
  buildsAfterCrossing,
  "re-crossing an adjacent boundary must remain sector-cache hot",
);
for (const { window, center } of [
  { window: coldBoundary.window, center: leftCenter },
  { window: crossedBoundary.window, center: rightCenter },
  { window: backtrackedBoundary.window, center: leftCenter },
  { window: crossedAgainBoundary.window, center: rightCenter },
]) {
  assert.ok(
    window.cells.some((cell) => cell.x === center[0] && cell.z === center[1]),
    "both sides of a stream boundary must retain the player's current cell",
  );
}

// Walking the whole level must not quietly retain almost every expanded
// sector. One active window is at most 3x3 sectors, so the cache can preserve
// all of it without holding old windows indefinitely.
const runtimeGrid = getRuntimeMapGrid(map);
const visitedSectors = new Set<string>();
for (const cell of map.cells) {
  const sector = runtimeGrid.sectorOfMacro(cell.x, cell.z);
  const sectorId = `${sector[0]}:${sector[1]}`;
  if (visitedSectors.has(sectorId)) continue;
  visitedSectors.add(sectorId);
  runtimeGrid.materializeFineWindow([
    cell.x * FINE_PER_MACRO + Math.floor(FINE_PER_MACRO / 2),
    cell.z * FINE_PER_MACRO + Math.floor(FINE_PER_MACRO / 2),
  ]);
}
const traversedGridStats = runtimeGrid.stats();
assert.ok(
  traversedGridStats.cachedSectors <= RUNTIME_SECTOR_CACHE_LIMIT,
  `streaming must retain at most ${RUNTIME_SECTOR_CACHE_LIMIT} expanded sectors`,
);
assert.ok(
  traversedGridStats.cachedFineCells < eagerCellCount * 0.8,
  `a full traversal must not retain nearly the eager map (${traversedGridStats.cachedFineCells} cached vs ${eagerCellCount} eager)`,
);

// ── 3. Invalid durable coordinates cannot install an empty window ─────────

console.log("runtime cost: stale fine coordinates recover before rebucketing");

const previewMap = GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP;
assert.equal(
  previewMap.id,
  "brg_level0_e04ce4ec20429e7a_f0",
  "the stale-coordinate regression must exercise the reported bundled map",
);
assert.equal(previewMap.id, GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID);
const previewGrid = new RuntimeMapGrid(previewMap);

// Every real sector center is already valid and must remain exactly where it
// is. Recovery is not allowed to turn ordinary streaming into teleportation.
const previewSectorSamples = new Map<string, [number, number]>();
for (const cell of previewMap.cells) {
  if (cell.active === false || cell.walkable === false) continue;
  const center = fineCenterOfMacro([cell.x, cell.z]);
  const sector = previewGrid.sectorOfFine(center[0], center[1]);
  const sectorId = `${sector[0]}:${sector[1]}`;
  if (!previewSectorSamples.has(sectorId)) {
    previewSectorSamples.set(sectorId, [center[0], center[1]]);
  }
}
assert.equal(
  previewSectorSamples.size,
  previewGrid.sectors.size,
  "every indexed sector in the bundled map needs a walkable recovery probe",
);
for (const [sectorId, center] of previewSectorSamples) {
  assert.deepEqual(
    resolveNearestRuntimeWalkableFineCell(previewMap, center),
    center,
    `valid sector ${sectorId} must not move during recovery validation`,
  );
  const window = previewGrid.materializeFineWindow(center);
  assert.ok(
    window.cells.some((cell) => cell.x === center[0] && cell.z === center[1]),
    `sector ${sectorId} must retain its player cell`,
  );
}

// A coordinate far past any corner selects no sector at all: this is the
// exact empty-map state that presented as persistent black void. The safe
// resolver must return authored floor whose new window includes the player.
const invalidMacroPadding = RUNTIME_SECTOR_SIZE * (RUNTIME_SECTOR_HALO + 3);
const invalidFineProbes: [number, number][] = [
  [
    (previewGrid.bounds.minX - invalidMacroPadding) * FINE_PER_MACRO,
    (previewGrid.bounds.minZ - invalidMacroPadding) * FINE_PER_MACRO,
  ],
  [
    (previewGrid.bounds.maxX + invalidMacroPadding) * FINE_PER_MACRO,
    (previewGrid.bounds.maxZ + invalidMacroPadding) * FINE_PER_MACRO,
  ],
  [
    (previewGrid.bounds.minX - invalidMacroPadding) * FINE_PER_MACRO,
    (previewGrid.bounds.maxZ + invalidMacroPadding) * FINE_PER_MACRO,
  ],
  [
    (previewGrid.bounds.maxX + invalidMacroPadding) * FINE_PER_MACRO,
    (previewGrid.bounds.minZ - invalidMacroPadding) * FINE_PER_MACRO,
  ],
];
const staleRecoveryTimes: number[] = [];
for (const invalid of invalidFineProbes) {
  assert.equal(
    previewGrid.materializeFineWindow(invalid).cells.length,
    0,
    "the regression probe must reproduce an empty runtime window",
  );
  const started = performance.now();
  const recovered = resolveNearestRuntimeWalkableFineCell(previewMap, invalid);
  staleRecoveryTimes.push(performance.now() - started);
  assert.ok(recovered, `invalid coordinate ${invalid.join(":")} must recover`);
  assert.ok(
    previewGrid.isWalkableFineCell(recovered![0], recovered![1]),
    `recovered coordinate ${recovered!.join(":")} must be authored floor`,
  );
  const recoveredWindow = previewGrid.materializeFineWindow(recovered!);
  assert.ok(recoveredWindow.cells.length > 0, "recovery must restore fine geometry");
  assert.ok(
    recoveredWindow.cells.some(
      (cell) => cell.x === recovered![0] && cell.z === recovered![1],
    ),
    "the recovered window must contain the repaired durable coordinate",
  );
}

const blockedPreviewCell = previewMap.cells.find(
  (cell) => cell.active === false || cell.walkable === false,
);
assert.ok(blockedPreviewCell, "the bundled map needs a blocked recovery probe");
const blockedPreviewCenter = fineCenterOfMacro([
  blockedPreviewCell!.x,
  blockedPreviewCell!.z,
]);
const repairedBlockedCell = resolveNearestRuntimeWalkableFineCell(
  previewMap,
  blockedPreviewCenter,
);
assert.ok(repairedBlockedCell, "a saved wall coordinate must recover to nearby floor");
assert.notDeepEqual(
  repairedBlockedCell,
  blockedPreviewCenter,
  "a saved wall coordinate must not survive validation",
);
assert.ok(
  previewGrid.isWalkableFineCell(repairedBlockedCell![0], repairedBlockedCell![1]),
);

// ── 4. Viewer visibility does not scale with map size ──────────────────────

console.log("runtime cost: repeat visibility queries stay cheap");

const basePackage = createQaSuitePackage();
const probePackage: GamePackage = GamePackageSchema.parse({
  ...basePackage,
  maps: [...basePackage.maps.filter((entry) => entry.id !== map.id), map],
});
const finePackage = expandGamePackageToFine(probePackage);
const fineMap = finePackage.maps.find((entry) => entry.id === map.id)!;
const spawn = fineMap.spawns[0];

assert.equal(
  map.regions,
  undefined,
  "the generated fixture should exercise a valid map with no authored regions",
);
assert.deepEqual(
  fineMap.regions,
  [],
  "sector materialization must normalize optional runtime collections",
);

const save = {
  schema: "crpg_engine_save_v1",
  package_version: "1",
  fine_ratio: FINE_PER_MACRO,
  current_map_id: map.id,
  player: { cell: [...spawn.cell], facing: [...spawn.facing] },
  playerStats: {},
  level: 1,
  experience: 0,
  pending_level_ups: 0,
  known_skills: [],
  flags: {},
  quests: {},
  inventory: [],
  explored_cells: {},
  map_deltas: {},
  entity_states: {},
} as unknown as PlaySave;

assert.doesNotThrow(
  () => advanceImmersiveWorldStateForSave(finePackage, save, { mapId: map.id }),
  "world-state advancement must accept a generated map with no authored regions",
);

// First call builds the structural snapshot and its derived indexes.
const firstSnapshot = createImmersiveViewerVisibilityFromV1(finePackage, save, map.id);
assert.ok(
  firstSnapshot.illumination.cells.length > 0,
  "the viewer must resolve some illuminated cells",
);

// Subsequent calls are what the player pays for on every step. They must reuse
// the cached structure rather than rebuilding whole-map data.
const samples: number[] = [];
for (let index = 0; index < 12; index += 1) {
  const started = performance.now();
  createImmersiveViewerVisibilityFromV1(finePackage, save, map.id);
  samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);
const median = samples[Math.floor(samples.length / 2)];

// Generous: the pre-fix cost on this map was ~55ms per query. Anything near
// that means whole-map work has returned.
assert.ok(
  median < 20,
  `repeat visibility must not rebuild whole-map structures (median ${median.toFixed(1)}ms)`,
);

// The viewer's result stays range-bounded rather than growing with the level.
assert.ok(
  firstSnapshot.illumination.cells.length < runtimeCellCount / 4,
  "viewer illumination must stay range-bounded, not whole-map",
);

console.log(
  `Backrooms runtime cost guards passed (median visibility ${median.toFixed(1)}ms, ` +
    `${runtimeCellCount} spawn-window cells vs ${eagerCellCount} eager; ` +
    `Phase 7 window median/worst ${medianWindowCells}/${worstWindowCells} cells, ` +
    `median/worst sampled build ${medianWindowBuildMs.toFixed(1)}/${worstWindowBuildMs.toFixed(1)}ms; ` +
    `${previewSectorSamples.size} bundled sectors valid; stale recovery worst ` +
    `${Math.max(...staleRecoveryTimes).toFixed(1)}ms; ` +
    `boundary cold/cross/back ${coldBoundary.ms.toFixed(1)}/${crossedBoundary.ms.toFixed(1)}/${backtrackedBoundary.ms.toFixed(1)}ms).`,
);
