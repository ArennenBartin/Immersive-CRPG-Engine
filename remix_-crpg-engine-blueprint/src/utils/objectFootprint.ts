import type { ObjectData, ObjectPlacementData } from "../schema/game";
import {
  FINE_HALF_EXTENT,
  FINE_PER_MACRO,
  fineCoordKey,
} from "../engine-core/gridCoordinates";

type FootprintOffset = [number, number];

export interface PlacementCollisionBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

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

  const fineFootprint = objectDef?.collision?.fine_footprint;
  if (fineFootprint?.length) {
    for (const offset of fineFootprint) {
      const [rx, rz] = rotateOffset(
        [Number(offset[0] || 0), Number(offset[1] || 0)],
        facing,
      );
      const cell: FootprintOffset = [
        placement.cell[0] + rx,
        placement.cell[1] + rz,
      ];
      const key = fineCoordKey(cell[0], cell[1]);
      if (!seen.has(key)) {
        seen.add(key);
        cells.push(cell);
      }
    }
    return cells;
  }

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

/**
 * Returns a continuous, model-sized collider for fitted furniture.
 *
 * Fine footprints remain useful for discrete pathfinding, interaction probes,
 * and authored collision previews. Free third-person movement should not turn
 * every touched fine cell into a full solid square, though: doing so adds up to
 * half a fine cell of invisible bulk on every edge and can seal a narrow aisle
 * where two pieces of furniture approach one another. Objects that opt into a
 * fine footprint therefore use their real X/Z bounds for swept player motion.
 */
export const getPlacementContinuousCollisionBounds = (
  placement: ObjectPlacementData,
  objectDef?: ObjectData,
): PlacementCollisionBounds2D | null => {
  if (!placementHasCollision(placement, objectDef)) return null;
  if (!objectDef?.collision?.fine_footprint?.length) return null;

  const facingX = Number(placement.facing?.[0] ?? 0);
  const facingZ = Number(placement.facing?.[1] ?? 1);
  const rotateQuarterTurn = Math.abs(facingX) > Math.abs(facingZ);
  const authoredWidth = Math.max(0, Number(objectDef.bounds?.[0] || 0));
  const authoredDepth = Math.max(0, Number(objectDef.bounds?.[2] || 0));
  const widthFine =
    (rotateQuarterTurn ? authoredDepth : authoredWidth) * FINE_PER_MACRO;
  const depthFine =
    (rotateQuarterTurn ? authoredWidth : authoredDepth) * FINE_PER_MACRO;
  if (widthFine <= 0 || depthFine <= 0) return null;

  const centerX = Number(placement.cell[0] || 0);
  const centerZ = Number(placement.cell[1] || 0);
  return {
    minX: centerX - widthFine * 0.5,
    maxX: centerX + widthFine * 0.5,
    minZ: centerZ - depthFine * 0.5,
    maxZ: centerZ + depthFine * 0.5,
  };
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
): boolean => {
  const tags = new Set(objectDef?.tags || []);
  // Ceiling fixtures and other room-light presentation objects live in the
  // same placement collection as ordinary props, but they are scenery rather
  // than floor-level obstacles. Keep that invariant here at the shared
  // collision boundary so stale maps cannot turn a light into an invisible
  // wall merely because their placement predates collision_mode="none".
  if (tags.has("light_ceiling") || tags.has("presentation_room_light")) {
    return false;
  }
  return (
    placement.collision_mode !== "none" &&
    Boolean(objectDef && objectDef.collision?.profile !== "none")
  );
};

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
  moved_objects?: Record<string, {
    cell: [number, number];
    facing: [number, number];
    height_offset?: number;
    stack_index?: number;
    stack_root_key?: string;
  }>;
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
    result.push(
      moved
        ? {
            ...placement,
            cell: moved.cell,
            facing: moved.facing,
            height_offset: moved.height_offset,
            stack_index: moved.stack_index,
            stack_root_key: moved.stack_root_key,
          }
        : placement,
    );
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
