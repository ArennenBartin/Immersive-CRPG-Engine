import type { ObjectData, ObjectPlacementData } from "../schema/game";
import {
  FINE_HALF_EXTENT,
  FINE_PER_MACRO,
  fineCoordKey,
} from "../engine-core/gridCoordinates";

type FootprintOffset = [number, number];

const rotateOffset = (
  [x, z]: FootprintOffset,
  facing: [number, number] = [0, 1],
): FootprintOffset => {
  const [fx, fz] = facing;

  if (Math.abs(fx) > Math.abs(fz)) {
    return fx > 0 ? [z, -x] : [-z, x];
  }

  return fz < 0 ? [-x, -z] : [x, z];
};

export const getObjectFootprint = (
  objectDef?: ObjectData,
): FootprintOffset[] => {
  const footprint = objectDef?.collision?.footprint;
  if (!footprint || footprint.length === 0) return [[0, 0]];

  return footprint.map((offset) => [
    Number(offset[0] || 0),
    Number(offset[1] || 0),
  ]);
};

export const getPlacementFootprint = (
  placement: ObjectPlacementData,
  objectDef?: ObjectData,
): FootprintOffset[] => {
  const seen = new Set<string>();
  const cells: FootprintOffset[] = [];
  const facing: FootprintOffset = [
    Number(placement.facing?.[0] ?? 0),
    Number(placement.facing?.[1] ?? 1),
  ];

  // Footprint offsets are authored in MACRO tiles; the placement cell is the
  // macro-center fine cell (fineWorld expansion). Each authored offset scales
  // by FINE_PER_MACRO and rasterizes to its full fine block so an object
  // occupies whole macro tiles on the fine grid.
  for (const offset of getObjectFootprint(objectDef)) {
    const [rx, rz] = rotateOffset(offset, facing);
    const centerX = placement.cell[0] + rx * FINE_PER_MACRO;
    const centerZ = placement.cell[1] + rz * FINE_PER_MACRO;
    for (let dx = -FINE_HALF_EXTENT; dx <= FINE_HALF_EXTENT; dx += 1) {
      for (let dz = -FINE_HALF_EXTENT; dz <= FINE_HALF_EXTENT; dz += 1) {
        const cell: FootprintOffset = [centerX + dx, centerZ + dz];
        const key = fineCoordKey(cell[0], cell[1]);
        if (!seen.has(key)) {
          seen.add(key);
          cells.push(cell);
        }
      }
    }
  }

  return cells;
};

export const placementOccupiesCell = (
  placement: ObjectPlacementData,
  objectDef: ObjectData | undefined,
  x: number,
  z: number,
) => getPlacementFootprint(placement, objectDef).some(([cx, cz]) => cx === x && cz === z);

export const placementHasCollision = (
  placement: Pick<ObjectPlacementData, "collision_mode">,
  objectDef: ObjectData | undefined,
): boolean =>
  placement.collision_mode !== "none" &&
  Boolean(objectDef && objectDef.collision?.profile !== "none");

export const placementBlocksCell = (
  placement: ObjectPlacementData,
  objectDef: ObjectData | undefined,
  x: number,
  z: number,
) => {
  if (!placementHasCollision(placement, objectDef)) return false;
  return placementOccupiesCell(placement, objectDef, x, z);
};

// ── Macro-space variants (editor / authored maps) ────────────────────────────
// The MapEditor works on the AUTHORED macro map, where a placement cell is a
// macro tile and footprint offsets apply unscaled. Runtime code must use the
// fine variants above.
export const getMacroPlacementFootprint = (
  placement: ObjectPlacementData,
  objectDef?: ObjectData,
): FootprintOffset[] => {
  const seen = new Set<string>();
  const cells: FootprintOffset[] = [];
  const facing: FootprintOffset = [
    Number(placement.facing?.[0] ?? 0),
    Number(placement.facing?.[1] ?? 1),
  ];
  for (const offset of getObjectFootprint(objectDef)) {
    const [rx, rz] = rotateOffset(offset, facing);
    const cell: FootprintOffset = [placement.cell[0] + rx, placement.cell[1] + rz];
    const key = fineCoordKey(cell[0], cell[1]);
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
};

export const placementOccupiesCellMacro = (
  placement: ObjectPlacementData,
  objectDef: ObjectData | undefined,
  x: number,
  z: number,
) => getMacroPlacementFootprint(placement, objectDef).some(([cx, cz]) => cx === x && cz === z);

export const placementBlocksCellMacro = (
  placement: ObjectPlacementData,
  objectDef: ObjectData | undefined,
  x: number,
  z: number,
) => {
  if (!placementHasCollision(placement, objectDef)) return false;
  return placementOccupiesCellMacro(placement, objectDef, x, z);
};

// ── Kernel grid manipulation (K3) ────────────────────────────────────────────
// Generated/new placements carry an explicit stable ID. Legacy authored maps
// fall back to their object/origin/facing composite so existing saves remain
// compatible. Used to key push/remove deltas after an object moves.
export const placementOriginKey = (placement: ObjectPlacementData): string =>
  placement.id ||
  `${placement.object_id}|${placement.cell[0]}|${placement.cell[1]}|${placement.facing?.[0] ?? 0}|${placement.facing?.[1] ?? 1}`;

export interface PlacementDelta {
  moved_objects?: Record<string, { cell: [number, number]; facing: [number, number] }>;
  removed_objects?: string[];
  carried_objects?: Record<string, unknown>;
}

// Apply move/remove overrides to authored placements, returning each placement
// at its current (possibly pushed) position. Removed placements are dropped.
export const applyPlacementDeltas = (
  placements: ObjectPlacementData[] | undefined,
  delta?: PlacementDelta,
): ObjectPlacementData[] => {
  const list = placements || [];
  if (!delta || (!delta.moved_objects && !delta.removed_objects && !delta.carried_objects)) return list;
  const removed = new Set(delta.removed_objects || []);
  const carried = new Set(Object.keys(delta.carried_objects || {}));
  const result: ObjectPlacementData[] = [];
  for (const placement of list) {
    const key = placementOriginKey(placement);
    if (removed.has(key) || carried.has(key)) continue;
    const moved = delta.moved_objects?.[key];
    result.push(moved ? { ...placement, cell: moved.cell, facing: moved.facing } : placement);
  }
  return result;
};

// Object is pushable if it physically blocks and is a movable prop (tagged
// "pushable" or an ordinary prop with a single-cell collision footprint).
export const isPushableObject = (objectDef: ObjectData | undefined): boolean => {
  if (!objectDef) return false;
  const profile = objectDef.collision?.profile;
  if (!profile || profile === "none") return false;
  if (objectDef.tags?.includes("pushable")) return true;
  return objectDef.category === "prop" && profile === "single";
};
