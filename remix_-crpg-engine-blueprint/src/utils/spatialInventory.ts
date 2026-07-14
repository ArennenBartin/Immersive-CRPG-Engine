// ── Spatial (grid) inventory logic ───────────────────────────────────────────
// Pure, framework-agnostic helpers for the organizable grid inventory surfaced
// in Play Mode. Each inventory *stack* occupies one rectangular footprint (the
// bounding box of its authored/derived shape, rotated in 90° steps). Using the
// bounding box for both collision and rendering guarantees what the player sees
// always matches what actually collides.
//
// This is the live, player-facing layer. The headless `immersiveSim`
// spatial-inventory snapshot (Stage 7) remains a separate auto-packer used by
// the simulation/debug tooling; this module is what backs real drag-and-drop.

import type { GamePackage } from "../schema/game";
import type { InventoryLayoutEntry, PlaySave } from "../schema/save";

type ItemDef = GamePackage["items"][number];

// Grid dimensions for the carried inventory. Columns × rows.
export const INVENTORY_GRID_COLS = 8;
export const INVENTORY_GRID_ROWS = 6;

export interface GridSize {
  w: number;
  h: number;
}

export interface GridCell {
  x: number;
  y: number;
}

const cellKey = (x: number, y: number): string => `${x}:${y}`;

// Weight in kg, mirroring `immersiveSim.inventoryItemWeight` so the live
// encumbrance readout matches the headless model.
export function itemWeightKg(item: ItemDef | undefined): number {
  if (item?.spatial?.weight_kg !== undefined) return Math.max(0, Number(item.spatial.weight_kg || 0));
  if (item?.simulation?.mass_kg !== undefined) return Math.max(0, Number(item.simulation.mass_kg || 0));
  if (item?.category === "weapon") return 3;
  if (item?.category === "armor") return 5;
  if (item?.category === "key") return 0.1;
  return 0.4;
}

function itemBulk(item: ItemDef | undefined): number {
  if (item?.spatial?.bulk !== undefined) return Math.max(0.1, Number(item.spatial.bulk || 0.1));
  if (item?.simulation?.bulk !== undefined) return Math.max(0.1, Number(item.simulation.bulk || 0.1));
  if (item?.category === "weapon") return 2;
  if (item?.category === "armor") return 3;
  if (item?.category === "key") return 0.2;
  return 0.5;
}

// Footprint when no explicit shape is authored: derive a compact rectangle from
// the item's bulk so heavier/bulkier items naturally take more room.
function sizeFromBulk(item: ItemDef | undefined): GridSize {
  const slots = Math.max(1, Math.ceil(itemBulk(item)));
  if (slots <= 1) return { w: 1, h: 1 };
  if (slots <= 2) return { w: 2, h: 1 };
  if (slots <= 4) return { w: 2, h: 2 };
  if (slots <= 6) return { w: 3, h: 2 };
  return { w: 3, h: 3 };
}

// Un-rotated footprint size, from the authored shape's bounding box if present.
export function itemBaseSize(item: ItemDef | undefined): GridSize {
  const shape = item?.spatial?.shape;
  if (shape && shape.length) {
    const xs = shape.map((cell) => cell[0]);
    const ys = shape.map((cell) => cell[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    const h = Math.max(...ys) - Math.min(...ys) + 1;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }
  return sizeFromBulk(item);
}

// Footprint size after `rotation` 90° clockwise steps. Odd rotations swap w/h.
export function itemSize(item: ItemDef | undefined, rotation: number): GridSize {
  const base = itemBaseSize(item);
  return Math.abs(rotation) % 2 === 0 ? { ...base } : { w: base.h, h: base.w };
}

// The cells a placement occupies. Anchor is the top-left cell.
export function placementCells(size: GridSize, x: number, y: number): GridCell[] {
  const cells: GridCell[] = [];
  for (let dy = 0; dy < size.h; dy += 1) {
    for (let dx = 0; dx < size.w; dx += 1) {
      cells.push({ x: x + dx, y: y + dy });
    }
  }
  return cells;
}

// Does a `size` footprint anchored at (x,y) fit on the grid without overlapping
// any already-`occupied` cell?
export function placementFits(
  size: GridSize,
  x: number,
  y: number,
  cols: number,
  rows: number,
  occupied: Set<string>,
): boolean {
  if (x < 0 || y < 0 || x + size.w > cols || y + size.h > rows) return false;
  for (let dy = 0; dy < size.h; dy += 1) {
    for (let dx = 0; dx < size.w; dx += 1) {
      if (occupied.has(cellKey(x + dx, y + dy))) return false;
    }
  }
  return true;
}

// First free anchor (row-major) where `size` fits, or null if the grid is full.
function firstFreeSpot(
  size: GridSize,
  cols: number,
  rows: number,
  occupied: Set<string>,
): GridCell | null {
  for (let y = 0; y <= rows - size.h; y += 1) {
    for (let x = 0; x <= cols - size.w; x += 1) {
      if (placementFits(size, x, y, cols, rows, occupied)) return { x, y };
    }
  }
  return null;
}

export interface ReconciledLayout {
  // Stable placement per present inventory stack, keyed by item id.
  placed: Map<string, InventoryLayoutEntry>;
  // Item ids that are in the inventory but couldn't fit on the grid.
  unplaced: string[];
}

// Build a complete, collision-free layout for the current inventory:
//  1. honour existing player placements that still fit, in order;
//  2. auto-place any remaining present stacks into the first free slot;
//  3. report anything that still won't fit as `unplaced`.
// Deterministic, so repeated calls on unchanged state are stable.
export function reconcileLayout(
  gamePackage: GamePackage,
  inventory: PlaySave["inventory"],
  layout: InventoryLayoutEntry[] | undefined,
  cols: number = INVENTORY_GRID_COLS,
  rows: number = INVENTORY_GRID_ROWS,
): ReconciledLayout {
  const present = (inventory || []).filter((entry) => entry.count > 0).map((entry) => entry.id);
  const presentSet = new Set(present);
  const itemById = new Map(gamePackage.items.map((item) => [item.id, item] as const));
  const occupied = new Set<string>();
  const placed = new Map<string, InventoryLayoutEntry>();

  const occupy = (size: GridSize, x: number, y: number) => {
    placementCells(size, x, y).forEach((cell) => occupied.add(cellKey(cell.x, cell.y)));
  };

  for (const entry of layout || []) {
    if (!presentSet.has(entry.item_id) || placed.has(entry.item_id)) continue;
    const item = itemById.get(entry.item_id);
    const rotation = ((Math.floor(entry.rotation) % 4) + 4) % 4;
    const size = itemSize(item, rotation);
    if (placementFits(size, entry.x, entry.y, cols, rows, occupied)) {
      occupy(size, entry.x, entry.y);
      placed.set(entry.item_id, { item_id: entry.item_id, x: entry.x, y: entry.y, rotation });
    }
  }

  const unplaced: string[] = [];
  for (const id of present) {
    if (placed.has(id)) continue;
    const item = itemById.get(id);
    const size = itemSize(item, 0);
    const spot = firstFreeSpot(size, cols, rows, occupied);
    if (spot) {
      occupy(size, spot.x, spot.y);
      placed.set(id, { item_id: id, x: spot.x, y: spot.y, rotation: 0 });
    } else {
      unplaced.push(id);
    }
  }

  return { placed, unplaced };
}

// The set of occupied cell keys for a layout, excluding one item (used while
// validating a drag of that item).
export function occupiedCellsExcept(
  gamePackage: GamePackage,
  placed: Map<string, InventoryLayoutEntry>,
  excludeItemId: string,
): Set<string> {
  const itemById = new Map(gamePackage.items.map((item) => [item.id, item] as const));
  const occupied = new Set<string>();
  placed.forEach((entry) => {
    if (entry.item_id === excludeItemId) return;
    const size = itemSize(itemById.get(entry.item_id), entry.rotation);
    placementCells(size, entry.x, entry.y).forEach((cell) => occupied.add(cellKey(cell.x, cell.y)));
  });
  return occupied;
}
