// Backrooms Phase 8 — exhaustive deep-traversal streaming regression.
//
// Invariant: for every playable runtime sector, the active 3x3 window contains
// every effective authored fine cell in those sectors. Crossing into an
// adjacent sector, traversing far enough to evict its cache entry, and
// backtracking must reproduce byte-equivalent geometry. The renderer's near
// detail plus authored architecture shell must also cover every real topology
// coordinate in the requested camera-facing field. Any failure reports the
// sector, representative player coordinate, and first missing geometry cell —
// the actionable form of the in-game "black void" regression.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP } from
  "../src/data/qaSuite/generatedBackroomsPhase6Wing";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
  fineOfMacro,
} from "../src/engine-core/gridCoordinates";
import {
  RUNTIME_SECTOR_CACHE_LIMIT,
  RUNTIME_SECTOR_HALO,
  RUNTIME_SECTOR_SIZE,
  RuntimeMapGrid,
} from "../src/engine-core/runtimeMapGrid";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  objectLibraryPresets,
} from "../src/schema/presets";
import type { CellData, MapData } from "../src/schema/game";
import {
  IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
  IMMERSIVE_DETAIL_FORWARD_BONUS,
  IMMERSIVE_STREAM_SECTOR_COUNT,
  IMMERSIVE_STREAM_SECTOR_SIZE,
  buildAuthoredArchitectureBoundaryFillers,
  isWithinImmersiveDirectionalWindow,
  selectDistantArchitectureCells,
} from "../src/utils/immersiveArchitecture";
import {
  BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION,
  resolveBackroomsLevelZeroDetailSurfaceEmission,
} from "../src/utils/lightRendering";
import {
  resolvePlayArchitectureRadiusMacro,
  resolvePlayRenderRadiusMacro,
} from "../src/utils/playInput";
import { resolveObjectMaterial } from "../src/utils/objectMaterials";
import {
  dedupeFineTerrainCellsFor3D,
  worldPointToWorldMacroCell,
} from "../src/utils/renderSpace";

const map = GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP;
const grid = new RuntimeMapGrid(map);
const fineKey = (x: number, z: number) => `${x}:${z}`;
const macroKey = fineKey;
const sectorKey = (sector: readonly [number, number]) =>
  `${sector[0]}:${sector[1]}`;

type SectorRepresentative = {
  key: string;
  sector: [number, number];
  macro: [number, number];
  fine: [number, number];
};

type SectorCrossing = {
  fromSector: string;
  toSector: string;
  fromFine: [number, number];
  toFine: [number, number];
};

const cellGeometrySignature = (cell: CellData) => [
  cell.x,
  cell.z,
  cell.y ?? 0,
  cell.active !== false ? 1 : 0,
  cell.walkable ? 1 : 0,
  cell.blocks_los ? 1 : 0,
  cell.height ?? 0,
  cell.visual_height ?? 0,
  cell.object_id ?? "",
  cell.terrain ?? "",
  cell.room_id ?? "",
  cell.region_id ?? "",
  cell.tag ?? "",
].join(",");

const geometryFingerprint = (window: MapData) => {
  const hash = createHash("sha256");
  window.cells.forEach((cell) => {
    hash.update(cellGeometrySignature(cell));
    hash.update("\n");
  });
  (window.custom_object_placements ?? []).forEach((placement) => {
    hash.update([
      placement.id ?? "",
      placement.object_id,
      placement.cell[0],
      placement.cell[1],
      placement.plan_offset?.join(",") ?? "",
      placement.rotation_offset?.join(",") ?? "",
      placement.scale?.join(",") ?? "",
      placement.collision_mode ?? "",
    ].join("|"));
    hash.update("\n");
  });
  return hash.digest("hex");
};

/** Independently expands the authored cell/override contract into coordinate
 * sets. RuntimeMapGrid itself is not used to derive the expected coverage. */
const buildExpectedFineCoverage = () => {
  const overridesByFine = new Map<
    string,
    NonNullable<MapData["fine_cell_overrides"]>
  >();
  for (const override of map.fine_cell_overrides ?? []) {
    const [offsetX, offsetZ] = override.fine_offset;
    if (offsetX >= FINE_PER_MACRO || offsetZ >= FINE_PER_MACRO) continue;
    const origin = fineOfMacro([
      Number(override.macro_cell[0] || 0),
      Number(override.macro_cell[1] || 0),
    ]);
    const key = fineKey(origin[0] + offsetX, origin[1] + offsetZ);
    const values = overridesByFine.get(key) ?? [];
    values.push(override);
    overridesByFine.set(key, values);
  }

  const coordinateSector = new Map<string, string>();
  const activeCoordinates = new Set<string>();
  const walkableCoordinates = new Set<string>();
  for (const source of map.cells) {
    const origin = fineOfMacro([source.x, source.z]);
    const sourceSector = sectorKey(grid.sectorOfMacro(source.x, source.z));
    for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
      for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
        const x = origin[0] + dx;
        const z = origin[1] + dz;
        const key = fineKey(x, z);
        const effective = (overridesByFine.get(key) ?? []).reduce<CellData>(
          (cell, override) => ({ ...cell, ...override.overrides, x, z }),
          { ...source, x, z },
        );
        coordinateSector.set(key, sourceSector);
        if (effective.active === false) continue;
        activeCoordinates.add(key);
        if (effective.walkable) walkableCoordinates.add(key);
      }
    }
  }
  return { coordinateSector, activeCoordinates, walkableCoordinates };
};

const expectedFine = buildExpectedFineCoverage();
const authoredCellsBySector = new Map<string, CellData[]>();
for (const cell of map.cells) {
  const key = sectorKey(grid.sectorOfMacro(cell.x, cell.z));
  const cells = authoredCellsBySector.get(key) ?? [];
  cells.push(cell);
  authoredCellsBySector.set(key, cells);
}

const windowWalkableSet = (window: MapData) => new Set(
  window.cells
    .filter((cell) => cell.active !== false && cell.walkable)
    .map((cell) => fineKey(cell.x, cell.z)),
);

const representatives = [...authoredCellsBySector.entries()]
  .map(([key, cells]): SectorRepresentative => {
    const sector = key.split(":").map(Number) as [number, number];
    const targetX = grid.bounds.minX + sector[0] * RUNTIME_SECTOR_SIZE +
      (RUNTIME_SECTOR_SIZE - 1) / 2;
    const targetZ = grid.bounds.minZ + sector[1] * RUNTIME_SECTOR_SIZE +
      (RUNTIME_SECTOR_SIZE - 1) / 2;
    const ordered = cells
      .filter((cell) => cell.active !== false && cell.walkable)
      .slice()
      .sort((left, right) =>
        Math.hypot(left.x - targetX, left.z - targetZ) -
          Math.hypot(right.x - targetX, right.z - targetZ) ||
        left.x - right.x ||
        left.z - right.z);
    const representative = ordered.find((cell) => {
      const center = fineCenterOfMacro([cell.x, cell.z]);
      return expectedFine.walkableCoordinates.has(fineKey(center[0], center[1]));
    });
    assert.ok(representative, `sector ${key} has no effective-walkable representative`);
    const fineCenter = fineCenterOfMacro([representative.x, representative.z]);
    return {
      key,
      sector,
      macro: [representative.x, representative.z],
      fine: [fineCenter[0], fineCenter[1]],
    };
  })
  .sort((left, right) =>
    left.sector[1] - right.sector[1] || left.sector[0] - right.sector[0]);

const assertWindowCoverage = (
  representative: SectorRepresentative,
  window: MapData,
) => {
  const activeSectors = grid.activeSectorKeys(
    representative.fine,
    RUNTIME_SECTOR_HALO,
  );
  const actualActive = new Set(
    window.cells
      .filter((cell) => cell.active !== false)
      .map((cell) => fineKey(cell.x, cell.z)),
  );
  const actualWalkable = windowWalkableSet(window);
  const expectedActive = new Set<string>();
  const expectedWalkable = new Set<string>();
  expectedFine.coordinateSector.forEach((sourceSector, coordinate) => {
    if (!activeSectors.has(sourceSector)) return;
    if (expectedFine.activeCoordinates.has(coordinate)) expectedActive.add(coordinate);
    if (expectedFine.walkableCoordinates.has(coordinate)) expectedWalkable.add(coordinate);
  });

  const missingActive = [...expectedActive].find((key) => !actualActive.has(key));
  const missingWalkable = [...expectedWalkable].find((key) => !actualWalkable.has(key));
  const unexpectedActive = [...actualActive].find((key) => !expectedActive.has(key));
  assert.equal(
    missingActive,
    undefined,
    `sector ${representative.key} at fine ${representative.fine.join(",")} omitted active geometry ${missingActive}`,
  );
  assert.equal(
    missingWalkable,
    undefined,
    `sector ${representative.key} at fine ${representative.fine.join(",")} opens black void under walkable cell ${missingWalkable}`,
  );
  assert.equal(
    unexpectedActive,
    undefined,
    `sector ${representative.key} materialized geometry ${unexpectedActive} outside its active 3x3 window`,
  );
  assert.ok(
    actualWalkable.has(fineKey(representative.fine[0], representative.fine[1])),
    `sector ${representative.key} omitted the player's representative floor ${representative.fine.join(",")}`,
  );
  assert.ok(
    window.cells.some((cell) =>
      cell.object_id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID),
    `sector ${representative.key} loses Level Zero theme detection and its authored far shell`,
  );
};

console.log("deep traversal: every Phase 8 sector owns complete active geometry");
assert.equal(representatives.length, grid.stats().indexedSectors);
assert.ok(representatives.length > RUNTIME_SECTOR_CACHE_LIMIT);
const expectedFingerprintBySector = new Map<string, string>();
for (const representative of representatives) {
  const window = grid.materializeFineWindow(representative.fine);
  assertWindowCoverage(representative, window);
  expectedFingerprintBySector.set(
    representative.key,
    geometryFingerprint(window),
  );
}

// Visiting in reverse guarantees early sectors were evicted before comparison.
for (const representative of [...representatives].reverse()) {
  grid.materializeFineWindow(representative.fine);
}
for (const representative of representatives) {
  const revisited = grid.materializeFineWindow(representative.fine);
  assert.equal(
    geometryFingerprint(revisited),
    expectedFingerprintBySector.get(representative.key),
    `sector ${representative.key} changed after deep traversal/cache eviction at ${representative.fine.join(",")}`,
  );
}

console.log("deep traversal: real crossings and deep backtracking preserve windows");
const authoredMacroCoordinates = new Set(
  map.cells
    .filter((cell) => cell.active !== false)
    .map((cell) => macroKey(cell.x, cell.z)),
);
const crossingBySectorPair = new Map<string, SectorCrossing>();
const findFineCrossing = (
  left: readonly [number, number],
  right: readonly [number, number],
): [[number, number], [number, number]] | undefined => {
  const leftOrigin = fineOfMacro(left);
  const rightOrigin = fineOfMacro(right);
  const horizontal = right[0] !== left[0];
  for (let offset = 0; offset < FINE_PER_MACRO; offset += 1) {
    const leftFine: [number, number] = horizontal
      ? [leftOrigin[0] + FINE_PER_MACRO - 1, leftOrigin[1] + offset]
      : [leftOrigin[0] + offset, leftOrigin[1] + FINE_PER_MACRO - 1];
    const rightFine: [number, number] = horizontal
      ? [rightOrigin[0], rightOrigin[1] + offset]
      : [rightOrigin[0] + offset, rightOrigin[1]];
    if (
      expectedFine.walkableCoordinates.has(fineKey(leftFine[0], leftFine[1])) &&
      expectedFine.walkableCoordinates.has(fineKey(rightFine[0], rightFine[1]))
    ) {
      return [leftFine, rightFine];
    }
  }
  return undefined;
};

for (const key of authoredMacroCoordinates) {
  const [x, z] = key.split(":").map(Number);
  for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
    const neighbor: [number, number] = [x + dx, z + dz];
    if (!authoredMacroCoordinates.has(macroKey(neighbor[0], neighbor[1]))) continue;
    const fromSector = sectorKey(grid.sectorOfMacro(x, z));
    const toSector = sectorKey(grid.sectorOfMacro(neighbor[0], neighbor[1]));
    if (fromSector === toSector) continue;
    const crossing = findFineCrossing([x, z], neighbor);
    if (!crossing) continue;
    const pairKey = `${fromSector}>${toSector}`;
    if (!crossingBySectorPair.has(pairKey)) {
      crossingBySectorPair.set(pairKey, {
        fromSector,
        toSector,
        fromFine: crossing[0],
        toFine: crossing[1],
      });
    }
  }
}

const sectorNeighbors = new Map<string, SectorCrossing[]>();
for (const crossing of crossingBySectorPair.values()) {
  const forward = sectorNeighbors.get(crossing.fromSector) ?? [];
  forward.push(crossing);
  sectorNeighbors.set(crossing.fromSector, forward);
  const reverse = sectorNeighbors.get(crossing.toSector) ?? [];
  reverse.push({
    fromSector: crossing.toSector,
    toSector: crossing.fromSector,
    fromFine: crossing.toFine,
    toFine: crossing.fromFine,
  });
  sectorNeighbors.set(crossing.toSector, reverse);
}
for (const neighbors of sectorNeighbors.values()) {
  neighbors.sort((left, right) => left.toSector.localeCompare(right.toSector));
}

const spawnMacro: [number, number] = [
  Number(map.spawns[0].cell[0] ?? 0),
  Number(map.spawns[0].cell[1] ?? 0),
];
const spawnFine = fineCenterOfMacro(spawnMacro);
const spawnSector = sectorKey(grid.sectorOfFine(spawnFine[0], spawnFine[1]));
const parentCrossing = new Map<string, SectorCrossing | null>([[spawnSector, null]]);
const sectorDepth = new Map<string, number>([[spawnSector, 0]]);
const queue = [spawnSector];
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  for (const crossing of sectorNeighbors.get(queue[cursor]) ?? []) {
    if (parentCrossing.has(crossing.toSector)) continue;
    parentCrossing.set(crossing.toSector, crossing);
    sectorDepth.set(crossing.toSector, sectorDepth.get(queue[cursor])! + 1);
    queue.push(crossing.toSector);
  }
}
assert.equal(
  parentCrossing.size,
  representatives.length,
  `walkable sector graph reaches ${parentCrossing.size}/${representatives.length} sectors from spawn ${spawnSector}`,
);

const childrenBySector = new Map<string, SectorCrossing[]>();
for (const [child, crossing] of parentCrossing) {
  if (!crossing) continue;
  assert.equal(crossing.toSector, child);
  const children = childrenBySector.get(crossing.fromSector) ?? [];
  children.push(crossing);
  childrenBySector.set(crossing.fromSector, children);
}
for (const children of childrenBySector.values()) {
  children.sort((left, right) => left.toSector.localeCompare(right.toSector));
}

let traversedCrossings = 0;
const assertSectorWindowAt = (sector: string, fine: [number, number], action: string) => {
  assert.equal(
    sectorKey(grid.sectorOfFine(fine[0], fine[1])),
    sector,
    `${action}: fine coordinate ${fine.join(",")} is not in expected sector ${sector}`,
  );
  const window = grid.materializeFineWindow(fine);
  assert.ok(
    windowWalkableSet(window).has(fineKey(fine[0], fine[1])),
    `${action}: player crossing cell ${fine.join(",")} vanished in sector ${sector}`,
  );
  assert.equal(
    geometryFingerprint(window),
    expectedFingerprintBySector.get(sector),
    `${action}: sector ${sector} changed at crossing ${fine.join(",")}`,
  );
};

const traverseSectorTree = (sector: string) => {
  for (const crossing of childrenBySector.get(sector) ?? []) {
    assertSectorWindowAt(sector, crossing.fromFine, "approach");
    assertSectorWindowAt(crossing.toSector, crossing.toFine, "cross");
    traversedCrossings += 1;
    traverseSectorTree(crossing.toSector);
    // This return happens after the entire child subtree, not just one step,
    // so it also covers cache eviction during a genuinely deep excursion.
    assertSectorWindowAt(sector, crossing.fromFine, "backtrack");
  }
};
traverseSectorTree(spawnSector);
assert.equal(traversedCrossings, representatives.length - 1);

// The reported void was not absent topology: the authored carpet is
// deliberately zero-emissive, so deep detailed foreground could shade to
// exact black and occlude the intact warm shell. Pin the renderer's material
// floor at the deepest deterministic sector as part of this traversal audit.
const deepestRepresentative = representatives
  .slice()
  .sort((left, right) =>
    (sectorDepth.get(right.key) ?? -1) - (sectorDepth.get(left.key) ?? -1) ||
    left.key.localeCompare(right.key))[0];
assert.ok(deepestRepresentative);
const deepestFloorCell = map.cells.find((cell) =>
  cell.x === deepestRepresentative.macro[0] &&
  cell.z === deepestRepresentative.macro[1] &&
  cell.walkable &&
  cell.object_id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID);
assert.ok(
  deepestFloorCell,
  `deepest sector ${deepestRepresentative.key} lacks authored carpet at ${deepestRepresentative.macro.join(",")}`,
);
const floorObject = objectLibraryPresets.find((object) =>
  object.id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID);
assert.ok(floorObject);
const authoredFloorMaterial = resolveObjectMaterial(floorObject);
assert.equal(
  authoredFloorMaterial.emissiveIntensity,
  0,
  "fixture must retain the zero-emissive authored carpet that reproduced the black void",
);
const resolvedDeepFloorEmission = resolveBackroomsLevelZeroDetailSurfaceEmission(
  "floor",
  authoredFloorMaterial.emissive,
  authoredFloorMaterial.emissiveIntensity,
);
assert.deepEqual(
  resolvedDeepFloorEmission,
  BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.floor,
  `deepest sector ${deepestRepresentative.key} floor ${deepestRepresentative.macro.join(",")} can shade to renderer-black`,
);
assert.deepEqual(
  resolveBackroomsLevelZeroDetailSurfaceEmission("ceiling", "#000000", 0.012),
  BACKROOMS_LEVEL_ZERO_DETAIL_SURFACE_EMISSION.ceiling,
  `deepest sector ${deepestRepresentative.key} ceiling can shade to overhead black void`,
);
assert.notEqual(resolvedDeepFloorEmission.emissive, "#000000");
assert.ok(resolvedDeepFloorEmission.emissiveIntensity > 0);

console.log("deep traversal: near detail and authored far shell have no directional holes");
const activeAuthoredCells = map.cells.filter((cell) => cell.active !== false);
const activeAuthoredMacroKeys = new Set(
  activeAuthoredCells.map((cell) => macroKey(cell.x, cell.z)),
);
let directionalCases = 0;
let requestedDetailCellsFilledByFarShell = 0;
for (const representative of representatives) {
  const window = grid.materializeFineWindow(representative.fine);
  const renderRadius = resolvePlayRenderRadiusMacro("balanced", window.cells.length);
  const architectureRadius = Math.max(
    renderRadius + 4,
    resolvePlayArchitectureRadiusMacro("balanced", window.cells.length),
  );
  const chunkCenter: [number, number] = [
    Math.round(representative.macro[0] / 12) * 12,
    Math.round(representative.macro[1] / 12) * 12,
  ];
  const visualWindowCells = dedupeFineTerrainCellsFor3D(
    window.cells,
    FINE_PER_MACRO,
  );
  const activeRuntimeSectors = grid.activeSectorKeys(representative.fine);

  for (let direction = 0; direction < IMMERSIVE_STREAM_SECTOR_COUNT; direction += 1) {
    const yaw = direction * IMMERSIVE_STREAM_SECTOR_SIZE;
    const forward: [number, number] = [Math.cos(yaw), Math.sin(yaw)];
    const detailedCells = visualWindowCells.filter((cell) =>
      cell.active !== false &&
      isWithinImmersiveDirectionalWindow({
        cell: [cell.x, cell.z],
        center: chunkCenter,
        forward,
        radius: renderRadius + 2,
        forwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
      }));
    const exactDetailedKeys = new Set(
      detailedCells.map((cell) => macroKey(cell.x, cell.z)),
    );
    const detailedMacroKeys = new Set(
      detailedCells.map((cell) => {
        const macro = worldPointToWorldMacroCell(
          cell.x,
          cell.z,
          "fine",
          FINE_PER_MACRO,
        );
        return macroKey(macro[0], macro[1]);
      }),
    );
    const farCells = selectDistantArchitectureCells({
      cells: activeAuthoredCells,
      center: chunkCenter,
      detailRadius: renderRadius + 2,
      architectureRadius,
      forward,
      detailForwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
      architectureForwardBonus: IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
      detailedCellKeys: exactDetailedKeys,
    });
    const farKeys = new Set(farCells.map((cell) => macroKey(cell.x, cell.z)));
    const requestedArchitecture = activeAuthoredCells.filter((cell) =>
      isWithinImmersiveDirectionalWindow({
        cell: [cell.x, cell.z],
        center: chunkCenter,
        forward,
        radius: architectureRadius,
        forwardBonus: IMMERSIVE_ARCHITECTURE_FORWARD_BONUS,
      }));
    const missing = requestedArchitecture.find((cell) => {
      const key = macroKey(cell.x, cell.z);
      return !detailedMacroKeys.has(key) && !farKeys.has(key);
    });
    assert.equal(
      missing,
      undefined,
      `sector ${representative.key} at macro ${representative.macro.join(",")} yaw-sector ${direction} leaves authored cell ${missing ? `${missing.x}:${missing.z}` : "unknown"} as black void`,
    );

    const playerMacroKey = macroKey(
      representative.macro[0],
      representative.macro[1],
    );
    assert.ok(
      detailedMacroKeys.has(playerMacroKey),
      `sector ${representative.key} yaw-sector ${direction} omitted floor under player ${playerMacroKey}`,
    );

    for (const cell of requestedArchitecture) {
      const key = macroKey(cell.x, cell.z);
      const sourceSector = sectorKey(grid.sectorOfMacro(cell.x, cell.z));
      const insideRequestedDetail = isWithinImmersiveDirectionalWindow({
        cell: [cell.x, cell.z],
        center: chunkCenter,
        forward,
        radius: renderRadius + 2,
        forwardBonus: IMMERSIVE_DETAIL_FORWARD_BONUS,
      });
      if (
        insideRequestedDetail &&
        !activeRuntimeSectors.has(sourceSector) &&
        !detailedMacroKeys.has(key)
      ) {
        assert.ok(
          farKeys.has(key),
          `sector ${representative.key} yaw-sector ${direction} requests detail outside its active window but authored LOD omitted ${key}`,
        );
        requestedDetailCellsFilledByFarShell += 1;
      }
    }
    directionalCases += 1;
  }
}
assert.equal(
  directionalCases,
  representatives.length * IMMERSIVE_STREAM_SECTOR_COUNT,
);
assert.ok(
  requestedDetailCellsFilledByFarShell > 0,
  "fixture never exercised a camera-facing detail request beyond the runtime window",
);

const boundaryFillers = buildAuthoredArchitectureBoundaryFillers(activeAuthoredCells);
const fillerKeys = new Set(
  boundaryFillers.map((filler) => macroKey(filler.position[0], filler.position[1])),
);
for (const cell of activeAuthoredCells) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const neighbor = macroKey(cell.x + dx, cell.z + dz);
    if (activeAuthoredMacroKeys.has(neighbor)) continue;
    assert.ok(
      fillerKeys.has(neighbor),
      `authored perimeter beside ${cell.x}:${cell.z} is not sealed at ${neighbor}`,
    );
  }
}
assert.ok(
  [...fillerKeys].every((key) => !activeAuthoredMacroKeys.has(key)),
  "a render-only boundary filler overlaps playable topology",
);

console.log(
  `Backrooms deep traversal passed: ${representatives.length} sectors, ` +
  `${traversedCrossings} deep crossings/backtracks, ${directionalCases} directional shell cases, ` +
  `${requestedDetailCellsFilledByFarShell} out-of-window detail coordinates covered by authored LOD, ` +
  `${boundaryFillers.length} perimeter seals; deepest material probe ` +
  `${deepestRepresentative.key}@${deepestRepresentative.macro.join(",")}.`,
);
