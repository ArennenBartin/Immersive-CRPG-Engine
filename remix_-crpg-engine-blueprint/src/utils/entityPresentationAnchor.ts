import type { EntityPlacementData } from "../schema/game";

export type EntityPresentationAnchorWorldPose = {
  position: [number, number, number];
  rotationY: number;
};

export type ResolvedEntityPresentationPose = {
  cell: [number, number];
  facing: [number, number] | undefined;
  y: number;
  anchored: boolean;
};

/**
 * Furniture-anchored actors normally rely on their prop for physical
 * collision. An explicit mode always wins; legacy revisioned/locked anchors
 * default to non-blocking so already-running bundled playtests upgrade safely.
 */
export function entityPlacementBlocksMovement(
  placement: EntityPlacementData,
): boolean {
  if (placement.collision_mode === "solid") return true;
  if (placement.collision_mode === "none") return false;

  const anchor = placement.presentation_anchor;
  if (anchor?.lock_to_anchor === true) return false;
  if (anchor?.lock_to_anchor !== false && anchor?.revision !== undefined) {
    return false;
  }

  return true;
}

/**
 * Resolves visual placement without changing the entity's authoritative cell.
 * Furniture anchoring normally remains active only while the entity stays at
 * its authored cell, so scheduled or AI-driven NPCs can walk away. Explicitly
 * locked anchors are reserved for stationary furniture poses and ignore
 * transient runtime-cell changes caused by interaction/proximity bookkeeping.
 */
export function resolveEntityPresentationPose({
  placement,
  currentCell,
  currentFacing,
  standingY,
  anchorWorldPose,
  planarUnitScale = 1,
}: {
  placement: EntityPlacementData;
  currentCell: [number, number];
  currentFacing: [number, number] | undefined;
  standingY: number;
  anchorWorldPose?: EntityPresentationAnchorWorldPose;
  /**
   * Converts authored world-space X/Z presentation offsets into the caller's
   * planar coordinate system. Render callers already operate in world units;
   * fine-grid gameplay callers use FINE_PER_MACRO.
   */
  planarUnitScale?: number;
}): ResolvedEntityPresentationPose {
  const safePlanarUnitScale =
    Number.isFinite(planarUnitScale) && planarUnitScale > 0
      ? planarUnitScale
      : 1;
  const anchor = placement.presentation_anchor;
  const remainsAtAuthoredCell =
    currentCell[0] === placement.cell[0] &&
    currentCell[1] === placement.cell[1];
  // Revisioned anchors are engine-calibrated furniture poses. Treat older
  // persisted revisions as locked too, so an already-running playtest cannot
  // drop the actor before package hydration upgrades the new explicit flag.
  const keepsFurnitureContact =
    anchor?.lock_to_anchor === true ||
    (anchor?.lock_to_anchor !== false && anchor?.revision !== undefined);

  if (
    anchor &&
    anchorWorldPose &&
    (keepsFurnitureContact || remainsAtAuthoredCell)
  ) {
    const [authoredLocalX, localY, authoredLocalZ] = anchor.local_position;
    const localX = authoredLocalX * safePlanarUnitScale;
    const localZ = authoredLocalZ * safePlanarUnitScale;
    const cosine = Math.cos(anchorWorldPose.rotationY);
    const sine = Math.sin(anchorWorldPose.rotationY);
    const worldX =
      anchorWorldPose.position[0] + cosine * localX + sine * localZ;
    const worldZ =
      anchorWorldPose.position[2] - sine * localX + cosine * localZ;
    const localFacing = anchor.local_facing;
    const facing = localFacing
      ? ([
          cosine * localFacing[0] + sine * localFacing[1],
          -sine * localFacing[0] + cosine * localFacing[1],
        ] as [number, number])
      : currentFacing;

    return {
      cell: [worldX, worldZ],
      facing,
      y: anchorWorldPose.position[1] + localY,
      anchored: true,
    };
  }

  return {
    cell: [
      currentCell[0] +
        (placement.presentation_offset?.[0] ?? 0) * safePlanarUnitScale,
      currentCell[1] +
        (placement.presentation_offset?.[1] ?? 0) * safePlanarUnitScale,
    ],
    facing: currentFacing,
    y: standingY + (placement.height_offset ?? 0),
    anchored: false,
  };
}
