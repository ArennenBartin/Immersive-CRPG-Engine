// ── Fine-world conversion layer ──────────────────────────────────────────────
// The single place macro-authored content becomes the fine-cell world the
// runtime simulates (rebuild spec §3). Authored packages stay macro forever —
// maps, triggers, ranges, quest coordinates are all written and stored in
// today's tile units. At load, PlayMode routes its package through
// expandGamePackageToFine():
//
//   • every authored cell expands to its FINE_PER_MACRO² fine block, copying
//     terrain/walkable/blocks_los/height/surface (macro-uniform per tile);
//   • every authored point coordinate (spawns, entities, items, containers,
//     object placements, triggers, exits, schedules, cutscene teleports,
//     workstations) lands on its macro tile's CENTER fine cell;
//   • authored skill ranges multiply by FINE_PER_MACRO so combat resolves the
//     same reach in fine cells (§5.2).
//
// At FINE_PER_MACRO = 1 the expansion is the identity, which is how Phase A
// proved the seam. Never feed an expanded package back into the editor or
// export path — it is a runtime artifact only.

import type {
  CellData,
  EventActionData,
  GamePackage,
  MapData,
} from "../schema/game";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
  fineOfMacro,
  scaleMacroDistanceToFine,
  type GridCoord,
} from "./gridCoordinates";
import { isLargeAuthoredMap, materializeLargeMapWindow } from "./runtimeMapGrid";

type CellTuple = [number, number];

const toFineCenter = (cell: readonly unknown[] | undefined): CellTuple | undefined => {
  if (!cell) return undefined;
  const fine = fineCenterOfMacro([Number(cell[0] || 0), Number(cell[1] || 0)] as GridCoord);
  return [fine[0], fine[1]];
};

const mustFineCenter = (cell: readonly unknown[]): CellTuple => toFineCenter(cell)!;

const expandCells = (cells: CellData[]): CellData[] => {
  if (FINE_PER_MACRO === 1) return cells;
  const fine: CellData[] = [];
  for (const cell of cells) {
    const origin = fineOfMacro([cell.x, cell.z]);
    for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
      for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
        fine.push({ ...cell, x: origin[0] + dx, z: origin[1] + dz });
      }
    }
  }
  return fine;
};

const expandEventAction = (action: EventActionData): EventActionData =>
  action.cell ? { ...action, cell: mustFineCenter(action.cell) } : action;

// Exported for callers that synthesize a single authored map outside a
// package (e.g. PlayMode's built-in fallback test map).
export const expandMapToFine = (map: MapData): MapData =>
  FINE_PER_MACRO === 1 ? map : expandMap(map);

const expandMapEager = (map: MapData): MapData => ({
  ...map,
  width: map.width * FINE_PER_MACRO,
  height: map.height * FINE_PER_MACRO,
  cells: expandCells(map.cells),
  spawns: map.spawns.map((spawn) => ({ ...spawn, cell: mustFineCenter(spawn.cell) })),
  custom_object_placements: (map.custom_object_placements || []).map((placement) => ({
    ...placement,
    cell: mustFineCenter(placement.cell),
  })),
  entity_placements: (map.entity_placements || []).map((placement) => ({
    ...placement,
    cell: mustFineCenter(placement.cell),
    schedule: placement.schedule?.map((entry) => ({
      ...entry,
      cell: mustFineCenter(entry.cell),
    })),
  })),
  item_placements: (map.item_placements || []).map((placement) => ({
    ...placement,
    cell: mustFineCenter(placement.cell),
  })),
  container_placements: (map.container_placements || []).map((placement) => ({
    ...placement,
    cell: mustFineCenter(placement.cell),
  })),
  triggers: (map.triggers || []).map((trigger) =>
    trigger.cell ? { ...trigger, cell: mustFineCenter(trigger.cell) } : trigger,
  ),
  exits: (map.exits || []).map((exit) => ({ ...exit, cell: mustFineCenter(exit.cell) })),
});

const expandMap = (map: MapData): MapData =>
  isLargeAuthoredMap(map) ? materializeLargeMapWindow(map) : expandMapEager(map);

// Runtime marker so a package is never expanded twice (the expansion is not
// idempotent — centers would drift by another ratio factor).
const EXPANDED_FLAG = "__fine_expanded";

export const isFineExpandedPackage = (gamePackage: GamePackage): boolean =>
  Boolean((gamePackage as Record<string, unknown>)[EXPANDED_FLAG]);

export const expandGamePackageToFine = (gamePackage: GamePackage): GamePackage => {
  if (FINE_PER_MACRO === 1 || isFineExpandedPackage(gamePackage)) return gamePackage;
  const expanded: GamePackage = {
    ...gamePackage,
    maps: gamePackage.maps.map(expandMap),
    abilities: gamePackage.abilities.map((skill) => ({
      ...skill,
      range: scaleMacroDistanceToFine(skill.range ?? 1),
    })),
    cutscenes: gamePackage.cutscenes.map((cutscene) => ({
      ...cutscene,
      actions: (cutscene.actions || []).map(expandEventAction),
    })),
    simulation_workstations: (gamePackage.simulation_workstations || []).map((station) => ({
      ...station,
      cell: mustFineCenter(station.cell),
    })),
  };
  (expanded as Record<string, unknown>)[EXPANDED_FLAG] = true;
  return expanded;
};

// Memoized expansion keyed by source package identity, so the per-frame /
// per-dispatch getRuntimeGamePackage() path never re-expands an unchanged
// package.
let lastSource: GamePackage | undefined;
let lastExpanded: GamePackage | undefined;

export const getFineGamePackage = (gamePackage: GamePackage): GamePackage => {
  if (lastSource === gamePackage && lastExpanded) return lastExpanded;
  lastSource = gamePackage;
  lastExpanded = expandGamePackageToFine(gamePackage);
  return lastExpanded;
};
