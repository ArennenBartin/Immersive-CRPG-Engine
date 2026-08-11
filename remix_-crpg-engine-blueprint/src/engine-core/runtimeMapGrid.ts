import type { CellData, MapData, ObjectPlacementData } from "../schema/game";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
  fineOfMacro,
  macroOfFine,
  scaleMacroDistanceToFine,
  type GridCoord,
} from "./gridCoordinates";

export const LARGE_MAP_CELL_THRESHOLD = 65_536;
// A 20-macro sector guarantees a 60-fine-cell near-simulation guard at the
// least-favourable edge of the 3x3 window. Far-field architecture renders
// independently from this grid, so the previous 32-macro sectors kept
// substantially more live cells without improving visual coverage.
export const RUNTIME_SECTOR_SIZE = 20;
export const RUNTIME_SECTOR_HALO = 1;
// Crossing one sector boundary changes three members of a 3x3 window. Twelve
// cached sectors therefore retain both adjacent windows and make immediate
// backtracking cache-hot. At the smaller 20-macro sector size this hard cap is
// still only 43,200 dense fine cells, about half the old 32x32x9 (82,944)
// ceiling at the current three-fine-cells-per-macro ratio.
export const RUNTIME_SECTOR_CACHE_LIMIT = 12;

const key = (x: number, z: number) => `${x}:${z}`;
const sectorKey = (x: number, z: number) => `${x}:${z}`;

export interface RuntimeGridBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface RuntimeMapGridStats {
  authoredCells: number;
  indexedSectors: number;
  cachedSectors: number;
  cachedFineCells: number;
  cacheLimit: number;
  sectorBuilds: number;
  sectorCacheHits: number;
}

/**
 * Whether a map is expensive enough at RUNTIME to need sector windowing.
 *
 * The threshold counts runtime cells, but an authored map is measured in macro
 * cells and every one of them becomes FINE_PER_MACRO² cells at load. Comparing
 * the authored count directly therefore understated the real cost by that
 * factor, and a map could sit an order of magnitude over the budget while still
 * reporting itself small — which is how a generated level ended up fully
 * expanded and re-rendered instead of windowed.
 *
 * The declared-area term stays in authored units: it guards maps that declare
 * enormous bounds with a sparsely populated cell array, where the cell count is
 * not yet representative of anything.
 */
export const isLargeAuthoredMap = (map: MapData): boolean =>
  map.cells.length * FINE_PER_MACRO * FINE_PER_MACRO >= LARGE_MAP_CELL_THRESHOLD ||
  map.width * map.height >= LARGE_MAP_CELL_THRESHOLD;

const pointInBounds = (cell: readonly unknown[], bounds: RuntimeGridBounds) => {
  const x = Number(cell[0] || 0);
  const z = Number(cell[1] || 0);
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
};

const fineCenter = (cell: readonly unknown[]): [number, number] => {
  const result = fineCenterOfMacro([Number(cell[0] || 0), Number(cell[1] || 0)] as GridCoord);
  return [result[0], result[1]];
};

const finePlacementCenter = (
  cell: readonly unknown[],
  fineOffset?: readonly unknown[],
): [number, number] => {
  const center = fineCenter(cell);
  return [
    center[0] + Number(fineOffset?.[0] || 0),
    center[1] + Number(fineOffset?.[1] || 0),
  ];
};

export class RuntimeMapGrid {
  readonly map: MapData;
  readonly bounds: RuntimeGridBounds;
  readonly cellsByCoord = new Map<string, CellData[]>();
  readonly sectors = new Map<string, CellData[]>();
  readonly placementsBySector = new Map<string, ObjectPlacementData[]>();
  private sectorBounds = new Map<string, RuntimeGridBounds>();
  private placementOrder = new Map<ObjectPlacementData, number>();
  private fineOverridesByCoord = new Map<
    string,
    NonNullable<MapData["fine_cell_overrides"]>
  >();
  private fineSectorCache = new Map<string, CellData[]>();
  private sectorBuilds = 0;
  private sectorCacheHits = 0;

  constructor(map: MapData) {
    this.map = map;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const cell of map.cells) {
      minX = Math.min(minX, cell.x);
      minZ = Math.min(minZ, cell.z);
      maxX = Math.max(maxX, cell.x);
      maxZ = Math.max(maxZ, cell.z);
      const coord = key(cell.x, cell.z);
      const stack = this.cellsByCoord.get(coord) || [];
      stack.push(cell);
      this.cellsByCoord.set(coord, stack);
    }
    this.bounds = Number.isFinite(minX)
      ? { minX, minZ, maxX, maxZ }
      : { minX: 0, minZ: 0, maxX: map.width - 1, maxZ: map.height - 1 };
    for (const cell of map.cells) {
      const sector = this.sectorOfMacro(cell.x, cell.z);
      const id = sectorKey(sector[0], sector[1]);
      const sectorCells = this.sectors.get(id) || [];
      sectorCells.push(cell);
      this.sectors.set(id, sectorCells);
      const bounds = this.sectorBounds.get(id) || {
        minX: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxZ: -Infinity,
      };
      bounds.minX = Math.min(bounds.minX, cell.x);
      bounds.minZ = Math.min(bounds.minZ, cell.z);
      bounds.maxX = Math.max(bounds.maxX, cell.x);
      bounds.maxZ = Math.max(bounds.maxZ, cell.z);
      this.sectorBounds.set(id, bounds);
    }
    for (const [index, placement] of (map.custom_object_placements || []).entries()) {
      const sector = this.sectorOfMacro(placement.cell[0], placement.cell[1]);
      const list = this.placementsBySector.get(sectorKey(sector[0], sector[1])) || [];
      list.push(placement);
      this.placementsBySector.set(sectorKey(sector[0], sector[1]), list);
      this.placementOrder.set(placement, index);
    }
    for (const override of map.fine_cell_overrides || []) {
      const [offsetX, offsetZ] = override.fine_offset;
      if (offsetX >= FINE_PER_MACRO || offsetZ >= FINE_PER_MACRO) continue;
      const origin = fineOfMacro([
        Number(override.macro_cell[0] || 0),
        Number(override.macro_cell[1] || 0),
      ] as GridCoord);
      const coord = key(origin[0] + offsetX, origin[1] + offsetZ);
      const list = this.fineOverridesByCoord.get(coord) || [];
      list.push(override);
      this.fineOverridesByCoord.set(coord, list);
    }
  }

  private applyFineOverrides(source: CellData, x: number, z: number): CellData {
    return (this.fineOverridesByCoord.get(key(x, z)) || []).reduce(
      (cell, override) => ({ ...cell, ...override.overrides, x, z }),
      { ...source, x, z },
    );
  }

  sectorOfMacro(x: number, z: number): [number, number] {
    return [
      Math.floor((x - this.bounds.minX) / RUNTIME_SECTOR_SIZE),
      Math.floor((z - this.bounds.minZ) / RUNTIME_SECTOR_SIZE),
    ];
  }

  sectorOfFine(x: number, z: number): [number, number] {
    const macro = macroOfFine([x, z]);
    return this.sectorOfMacro(macro[0], macro[1]);
  }

  getMacroCell(x: number, z: number, y = 0): CellData | undefined {
    const stack = this.cellsByCoord.get(key(x, z));
    return stack?.find((cell) => (cell.y || 0) === y) || stack?.[0];
  }

  getFineCell(x: number, z: number): CellData | undefined {
    const macro = macroOfFine([x, z]);
    const source = this.getMacroCell(macro[0], macro[1]);
    return source ? this.applyFineOverrides(source, x, z) : undefined;
  }

  isWalkableFineCell(x: number, z: number): boolean {
    const cell = this.getFineCell(x, z);
    return Boolean(
      cell &&
      cell.active !== false &&
      cell.walkable !== false,
    );
  }

  /**
   * Resolve a stale or invalid runtime coordinate back onto authored floor.
   *
   * Large-map windows are selected from the durable save coordinate. A save
   * can outlive a generated bake with the same public map id, or contain a
   * coordinate from an interrupted/free-movement handoff. In either case an
   * out-of-range coordinate has no active sector and would otherwise
   * materialize a completely empty map. This path is only used after the
   * ordinary O(1) validity check fails, so the exhaustive fine-cell scan does
   * not add work to normal movement.
   */
  nearestWalkableFineCell(centerFine: readonly number[]): [number, number] | undefined {
    const centerX = Number(centerFine[0]);
    const centerZ = Number(centerFine[1]);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) return undefined;

    const requested: [number, number] = [Math.round(centerX), Math.round(centerZ)];
    if (this.isWalkableFineCell(requested[0], requested[1])) return requested;

    let nearest: [number, number] | undefined;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    const consider = (x: number, z: number) => {
      if (!this.isWalkableFineCell(x, z)) return;
      const distanceSquared =
        (x - centerX) * (x - centerX) +
        (z - centerZ) * (z - centerZ);
      if (
        distanceSquared < nearestDistanceSquared ||
        (distanceSquared === nearestDistanceSquared &&
          (!nearest || z < nearest[1] || (z === nearest[1] && x < nearest[0])))
      ) {
        nearest = [x, z];
        nearestDistanceSquared = distanceSquared;
      }
    };
    for (const coord of this.cellsByCoord.keys()) {
      const separator = coord.indexOf(":");
      const macroX = Number(coord.slice(0, separator));
      const macroZ = Number(coord.slice(separator + 1));
      const source = this.getMacroCell(macroX, macroZ);
      if (!source || source.active === false || source.walkable === false) continue;
      const origin = fineOfMacro([macroX, macroZ]);
      const candidateX = Math.max(
        origin[0],
        Math.min(origin[0] + FINE_PER_MACRO - 1, Math.round(centerX)),
      );
      const candidateZ = Math.max(
        origin[1],
        Math.min(origin[1] + FINE_PER_MACRO - 1, Math.round(centerZ)),
      );
      if (this.isWalkableFineCell(candidateX, candidateZ)) {
        consider(candidateX, candidateZ);
      } else {
        // A fine override can block only the closest point in an otherwise
        // walkable macro tile. Inspect that tile's remaining tiny footprint
        // instead of expanding every authored cell during recovery.
        for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
          for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
            consider(origin[0] + dx, origin[1] + dz);
          }
        }
      }
    }
    // A fine override may deliberately open one point in a macro cell whose
    // authored base is blocked. Include those exceptional candidates too.
    for (const coord of this.fineOverridesByCoord.keys()) {
      const separator = coord.indexOf(":");
      consider(
        Number(coord.slice(0, separator)),
        Number(coord.slice(separator + 1)),
      );
    }
    return nearest;
  }

  queryMacroCells(bounds: RuntimeGridBounds): CellData[] {
    const result: CellData[] = [];
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const stack = this.cellsByCoord.get(key(x, z));
        if (stack) result.push(...stack);
      }
    }
    return result;
  }

  queryPlacements(bounds: RuntimeGridBounds): ObjectPlacementData[] {
    const [minSectorX, minSectorZ] = this.sectorOfMacro(bounds.minX, bounds.minZ);
    const [maxSectorX, maxSectorZ] = this.sectorOfMacro(bounds.maxX, bounds.maxZ);
    const result: ObjectPlacementData[] = [];
    for (let sectorZ = minSectorZ; sectorZ <= maxSectorZ; sectorZ += 1) {
      for (let sectorX = minSectorX; sectorX <= maxSectorX; sectorX += 1) {
        for (const placement of this.placementsBySector.get(sectorKey(sectorX, sectorZ)) || []) {
          if (pointInBounds(placement.cell, bounds)) result.push(placement);
        }
      }
    }
    return result.sort(
      (left, right) =>
        (this.placementOrder.get(left) || 0) -
        (this.placementOrder.get(right) || 0),
    );
  }

  activeSectorKeys(centerFine: readonly number[], halo = RUNTIME_SECTOR_HALO): Set<string> {
    const [sx, sz] = this.sectorOfFine(centerFine[0], centerFine[1]);
    const result = new Set<string>();
    for (let dz = -halo; dz <= halo; dz += 1) {
      for (let dx = -halo; dx <= halo; dx += 1) {
        const next = sectorKey(sx + dx, sz + dz);
        if (this.sectors.has(next)) result.add(next);
      }
    }
    return result;
  }

  private materializeSector(id: string): CellData[] {
    const cached = this.fineSectorCache.get(id);
    if (cached) {
      this.sectorCacheHits += 1;
      this.fineSectorCache.delete(id);
      this.fineSectorCache.set(id, cached);
      return cached;
    }
    this.sectorBuilds += 1;
    const fine: CellData[] = [];
    for (const cell of this.sectors.get(id) || []) {
      const origin = fineOfMacro([cell.x, cell.z]);
      for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
        for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
          const x = origin[0] + dx;
          const z = origin[1] + dz;
          fine.push(this.applyFineOverrides(cell, x, z));
        }
      }
    }
    this.fineSectorCache.set(id, fine);
    while (this.fineSectorCache.size > RUNTIME_SECTOR_CACHE_LIMIT) {
      const oldest = this.fineSectorCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.fineSectorCache.delete(oldest);
    }
    return fine;
  }

  materializeFineWindow(centerFine: readonly number[], halo = RUNTIME_SECTOR_HALO): MapData {
    const active = this.activeSectorKeys(centerFine, halo);
    const cells = [...active].flatMap((id) => this.materializeSector(id));
    const macroBounds = [...active].reduce<RuntimeGridBounds>((bounds, id) => {
      const sector = this.sectorBounds.get(id);
      if (!sector) return bounds;
      bounds.minX = Math.min(bounds.minX, sector.minX);
      bounds.minZ = Math.min(bounds.minZ, sector.minZ);
      bounds.maxX = Math.max(bounds.maxX, sector.maxX);
      bounds.maxZ = Math.max(bounds.maxZ, sector.maxZ);
      return bounds;
    }, { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
    const inActiveBounds = (cell: readonly unknown[]) => pointInBounds(cell, macroBounds);
    const activeObjectPlacements = Number.isFinite(macroBounds.minX)
      ? this.queryPlacements(macroBounds)
      : [];
    return {
      ...this.map,
      width: this.map.width * FINE_PER_MACRO,
      height: this.map.height * FINE_PER_MACRO,
      cells,
      // `regions` is optional in authored map data, but runtime simulation
      // treats collection fields as arrays. Eager expansion receives the
      // normalized PlayMode package; sector windows can also be materialized
      // directly from the raw authored map, so normalize this boundary too.
      regions: this.map.regions || [],
      fine_cell_overrides: [],
      spawns: this.map.spawns.map((spawn) => ({ ...spawn, cell: fineCenter(spawn.cell) })),
      custom_object_placements: activeObjectPlacements
        .filter((placement) => inActiveBounds(placement.cell))
        .map((placement) => ({
          ...placement,
          cell: finePlacementCenter(placement.cell, placement.fine_offset),
          // Match eager expansion: continuous anomaly penetration is authored
          // in macro-cell units and must retain the same relative depth when a
          // large map is materialized through the sector window.
          ...(placement.plan_offset
            ? {
                plan_offset: [
                  scaleMacroDistanceToFine(placement.plan_offset[0]),
                  scaleMacroDistanceToFine(placement.plan_offset[1]),
                ] as [number, number],
              }
            : {}),
        })),
      entity_placements: (this.map.entity_placements || [])
        .filter((placement) => inActiveBounds(placement.cell))
        .map((placement) => ({
          ...placement,
          cell: fineCenter(placement.cell),
          schedule: placement.schedule?.map((entry) => ({ ...entry, cell: fineCenter(entry.cell) })),
        })),
      item_placements: (this.map.item_placements || [])
        .filter((placement) => inActiveBounds(placement.cell))
        .map((placement) => ({ ...placement, cell: fineCenter(placement.cell) })),
      container_placements: (this.map.container_placements || [])
        .filter((placement) => inActiveBounds(placement.cell))
        .map((placement) => ({ ...placement, cell: fineCenter(placement.cell) })),
      triggers: (this.map.triggers || [])
        .filter((trigger) => !trigger.cell || inActiveBounds(trigger.cell))
        .map((trigger) => trigger.cell ? { ...trigger, cell: fineCenter(trigger.cell) } : trigger),
      exits: (this.map.exits || [])
        .filter((exit) => inActiveBounds(exit.cell))
        .map((exit) => ({ ...exit, cell: fineCenter(exit.cell) })),
    };
  }

  stats(): RuntimeMapGridStats {
    return {
      authoredCells: this.map.cells.length,
      indexedSectors: this.sectors.size,
      cachedSectors: this.fineSectorCache.size,
      cachedFineCells: [...this.fineSectorCache.values()].reduce((sum, cells) => sum + cells.length, 0),
      cacheLimit: RUNTIME_SECTOR_CACHE_LIMIT,
      sectorBuilds: this.sectorBuilds,
      sectorCacheHits: this.sectorCacheHits,
    };
  }
}

const grids = new WeakMap<MapData, RuntimeMapGrid>();

export const getRuntimeMapGrid = (map: MapData): RuntimeMapGrid => {
  const existing = grids.get(map);
  if (existing) return existing;
  const grid = new RuntimeMapGrid(map);
  grids.set(map, grid);
  return grid;
};

export const materializeLargeMapWindow = (map: MapData, centerFine?: readonly number[]): MapData => {
  const center = centerFine || fineCenter(map.spawns[0]?.cell || [0, 0]);
  return getRuntimeMapGrid(map).materializeFineWindow(center);
};

export const resolveNearestRuntimeWalkableFineCell = (
  map: MapData,
  centerFine: readonly number[],
): [number, number] | undefined =>
  getRuntimeMapGrid(map).nearestWalkableFineCell(centerFine);
