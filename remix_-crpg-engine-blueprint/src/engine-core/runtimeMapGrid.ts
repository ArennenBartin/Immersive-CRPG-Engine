import type { CellData, MapData, ObjectPlacementData } from "../schema/game";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
  fineOfMacro,
  macroOfFine,
  type GridCoord,
} from "./gridCoordinates";

export const LARGE_MAP_CELL_THRESHOLD = 65_536;
export const RUNTIME_SECTOR_SIZE = 32;
export const RUNTIME_SECTOR_HALO = 1;
export const RUNTIME_SECTOR_CACHE_LIMIT = 16;

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
}

export const isLargeAuthoredMap = (map: MapData): boolean =>
  map.cells.length >= LARGE_MAP_CELL_THRESHOLD || map.width * map.height >= LARGE_MAP_CELL_THRESHOLD;

const pointInBounds = (cell: readonly unknown[], bounds: RuntimeGridBounds) => {
  const x = Number(cell[0] || 0);
  const z = Number(cell[1] || 0);
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
};

const fineCenter = (cell: readonly unknown[]): [number, number] => {
  const result = fineCenterOfMacro([Number(cell[0] || 0), Number(cell[1] || 0)] as GridCoord);
  return [result[0], result[1]];
};

export class RuntimeMapGrid {
  readonly map: MapData;
  readonly bounds: RuntimeGridBounds;
  readonly cellsByCoord = new Map<string, CellData[]>();
  readonly sectors = new Map<string, CellData[]>();
  readonly placementsBySector = new Map<string, ObjectPlacementData[]>();
  private fineSectorCache = new Map<string, CellData[]>();

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
      const sectorCells = this.sectors.get(sectorKey(sector[0], sector[1])) || [];
      sectorCells.push(cell);
      this.sectors.set(sectorKey(sector[0], sector[1]), sectorCells);
    }
    for (const placement of map.custom_object_placements || []) {
      const sector = this.sectorOfMacro(placement.cell[0], placement.cell[1]);
      const list = this.placementsBySector.get(sectorKey(sector[0], sector[1])) || [];
      list.push(placement);
      this.placementsBySector.set(sectorKey(sector[0], sector[1]), list);
    }
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
    return source ? { ...source, x, z } : undefined;
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
    return (this.map.custom_object_placements || []).filter((placement) => pointInBounds(placement.cell, bounds));
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
      this.fineSectorCache.delete(id);
      this.fineSectorCache.set(id, cached);
      return cached;
    }
    const fine: CellData[] = [];
    for (const cell of this.sectors.get(id) || []) {
      const origin = fineOfMacro([cell.x, cell.z]);
      for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
        for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
          fine.push({ ...cell, x: origin[0] + dx, z: origin[1] + dz });
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
      for (const cell of this.sectors.get(id) || []) {
        bounds.minX = Math.min(bounds.minX, cell.x);
        bounds.minZ = Math.min(bounds.minZ, cell.z);
        bounds.maxX = Math.max(bounds.maxX, cell.x);
        bounds.maxZ = Math.max(bounds.maxZ, cell.z);
      }
      return bounds;
    }, { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
    const inActiveBounds = (cell: readonly unknown[]) => pointInBounds(cell, macroBounds);
    return {
      ...this.map,
      width: this.map.width * FINE_PER_MACRO,
      height: this.map.height * FINE_PER_MACRO,
      cells,
      spawns: this.map.spawns.map((spawn) => ({ ...spawn, cell: fineCenter(spawn.cell) })),
      custom_object_placements: (this.map.custom_object_placements || [])
        .filter((placement) => inActiveBounds(placement.cell))
        .map((placement) => ({ ...placement, cell: fineCenter(placement.cell) })),
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
