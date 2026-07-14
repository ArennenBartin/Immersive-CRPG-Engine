export type MacroCell = [number, number];

export interface MacroGridBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const centeredMacroBounds = (width: number, depth: number): MacroGridBounds => {
  if (!Number.isInteger(width) || !Number.isInteger(depth) || width <= 0 || depth <= 0) {
    throw new RangeError("Grid bounds require positive integer width and depth");
  }
  const minX = -Math.floor(width / 2);
  const minZ = -Math.floor(depth / 2);
  return { minX, minZ, maxX: minX + width - 1, maxZ: minZ + depth - 1 };
};

export const macroCellKey = (cell: readonly number[]): string => `${cell[0]}:${cell[1]}`;

export const compareMacroCells = (left: readonly number[], right: readonly number[]) =>
  Number(left[1]) - Number(right[1]) || Number(left[0]) - Number(right[0]);

export const macroCellInBounds = (cell: readonly number[], bounds: MacroGridBounds) =>
  cell[0] >= bounds.minX && cell[0] <= bounds.maxX && cell[1] >= bounds.minZ && cell[1] <= bounds.maxZ;

const DIRECTIONS: readonly MacroCell[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

interface SearchNode {
  cell: MacroCell;
  direction: number;
  g: number;
  f: number;
  key: string;
  parent?: string;
}

class StableMinHeap {
  private values: SearchNode[] = [];

  private compare(left: SearchNode, right: SearchNode) {
    return left.f - right.f || left.g - right.g ||
      compareMacroCells(left.cell, right.cell) || left.direction - right.direction ||
      left.key.localeCompare(right.key);
  }

  push(value: SearchNode) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): SearchNode | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const best = right < this.values.length && this.compare(this.values[right], this.values[left]) < 0
        ? right
        : left;
      if (this.compare(last, this.values[best]) <= 0) break;
      this.values[index] = this.values[best];
      index = best;
    }
    this.values[index] = last;
    return first;
  }

  get size() {
    return this.values.length;
  }
}

export interface CorridorRouteOptions {
  start: MacroCell;
  goal: MacroCell;
  bounds: MacroGridBounds;
  blocked?: ReadonlySet<string>;
  baseStepCost?: number;
  turnPenalty?: number;
  boundaryPenalty?: number;
  maxVisited?: number;
  /** Additional finite, non-negative cost for entering a cell. */
  cellCost?: (cell: MacroCell) => number;
}

export interface CorridorRouteResult {
  success: boolean;
  cells: MacroCell[];
  cost: number;
  visited: number;
  reason?: "out_of_bounds" | "blocked_endpoint" | "search_limit" | "no_route";
}

const stateKey = (cell: MacroCell, direction: number) => `${cell[0]}:${cell[1]}:${direction}`;
const manhattan = (left: MacroCell, right: MacroCell) =>
  Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]);

/** Deterministic cardinal A* whose state carries direction for real turn cost. */
export const routeCorridor = (options: CorridorRouteOptions): CorridorRouteResult => {
  const baseStepCost = options.baseStepCost ?? 10;
  const turnPenalty = options.turnPenalty ?? 4;
  const boundaryPenalty = options.boundaryPenalty ?? 2;
  const maxVisited = options.maxVisited ?? 100_000;
  if (![baseStepCost, turnPenalty, boundaryPenalty].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new RangeError("A* costs must be finite and non-negative");
  }
  if (!macroCellInBounds(options.start, options.bounds) || !macroCellInBounds(options.goal, options.bounds)) {
    return { success: false, cells: [], cost: 0, visited: 0, reason: "out_of_bounds" };
  }
  const blocked = options.blocked ?? new Set<string>();
  if (blocked.has(macroCellKey(options.start)) || blocked.has(macroCellKey(options.goal))) {
    return { success: false, cells: [], cost: 0, visited: 0, reason: "blocked_endpoint" };
  }

  const open = new StableMinHeap();
  const startKey = stateKey(options.start, -1);
  open.push({
    cell: [...options.start],
    direction: -1,
    g: 0,
    f: manhattan(options.start, options.goal) * baseStepCost,
    key: startKey,
  });
  const best = new Map<string, number>([[startKey, 0]]);
  const closed = new Map<string, SearchNode>();
  let visited = 0;
  let terminal: SearchNode | undefined;

  while (open.size > 0) {
    const current = open.pop()!;
    if (closed.has(current.key)) continue;
    closed.set(current.key, current);
    visited += 1;
    if (visited > maxVisited) {
      return { success: false, cells: [], cost: 0, visited, reason: "search_limit" };
    }
    if (current.cell[0] === options.goal[0] && current.cell[1] === options.goal[1]) {
      terminal = current;
      break;
    }

    DIRECTIONS.forEach(([dx, dz], direction) => {
      const cell: MacroCell = [current.cell[0] + dx, current.cell[1] + dz];
      if (!macroCellInBounds(cell, options.bounds) || blocked.has(macroCellKey(cell))) return;
      const extra = options.cellCost?.(cell) ?? 0;
      if (!Number.isFinite(extra) || extra < 0) throw new RangeError("A* cell cost must be finite and non-negative");
      const onBoundary = cell[0] === options.bounds.minX || cell[0] === options.bounds.maxX ||
        cell[1] === options.bounds.minZ || cell[1] === options.bounds.maxZ;
      const g = current.g + baseStepCost + extra +
        (current.direction >= 0 && current.direction !== direction ? turnPenalty : 0) +
        (onBoundary ? boundaryPenalty : 0);
      const key = stateKey(cell, direction);
      if (g >= (best.get(key) ?? Number.POSITIVE_INFINITY)) return;
      best.set(key, g);
      open.push({
        cell,
        direction,
        g,
        f: g + manhattan(cell, options.goal) * baseStepCost,
        key,
        parent: current.key,
      });
    });
  }

  if (!terminal) return { success: false, cells: [], cost: 0, visited, reason: "no_route" };
  const cells: MacroCell[] = [];
  let cursor: SearchNode | undefined = terminal;
  while (cursor) {
    cells.push([...cursor.cell]);
    cursor = cursor.parent ? closed.get(cursor.parent) : undefined;
  }
  cells.reverse();
  return { success: true, cells, cost: terminal.g, visited };
};

export const widenCorridor = (
  centerLine: readonly MacroCell[],
  width: number,
  bounds: MacroGridBounds,
): MacroCell[] => {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError("Corridor width must be a positive integer");
  const before = Math.floor((width - 1) / 2);
  const after = width - before - 1;
  const cells = new Map<string, MacroCell>();
  centerLine.forEach((cell, index) => {
    const previous = centerLine[Math.max(0, index - 1)];
    const next = centerLine[Math.min(centerLine.length - 1, index + 1)];
    const horizontal = Math.abs(next[0] - previous[0]) >= Math.abs(next[1] - previous[1]);
    for (let offset = -before; offset <= after; offset += 1) {
      const candidate: MacroCell = horizontal
        ? [cell[0], cell[1] + offset]
        : [cell[0] + offset, cell[1]];
      if (macroCellInBounds(candidate, bounds)) cells.set(macroCellKey(candidate), candidate);
    }
  });
  return [...cells.values()].sort(compareMacroCells);
};

