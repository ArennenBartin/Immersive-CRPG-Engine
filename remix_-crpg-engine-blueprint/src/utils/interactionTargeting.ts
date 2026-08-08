import type { ObjectData, ObjectPlacementData } from "../schema/game";
import { isBuildingDoorPlacement } from "./doorPlacement";
import { placementOccupiesCell } from "./objectFootprint";

export type DirectionalInteractionCandidate<T> = {
  value: T;
  position: readonly [number, number];
  /** Half-size of the candidate's square gameplay footprint. */
  halfExtent?: number;
};

export type DirectionalInteractionOptions = {
  /** Maximum distance from the actor to the nearest point on the target. */
  maxSurfaceDistance?: number;
  /** Minimum normalized facing dot for a target that is not overlapping. */
  minimumFacingDot?: number;
  /** Overlap tolerance. Overlapping targets remain usable at any heading. */
  overlapPadding?: number;
};

/**
 * Select the nearest entity that an ordinary contextual Act can address.
 *
 * A single rounded probe cell is too brittle for continuous third-person
 * movement: a few degrees of yaw can make the probe jump to the next cell.
 * Furniture-anchored NPCs also deliberately keep a non-blocking gameplay
 * footprint in front of their seat, so Steve can be standing inside that
 * footprint while looking at the rendered character. This resolver handles
 * both cases with a small directional reach and an overlap fallback.
 */
export const selectDirectionalInteractionCandidate = <T>(
  candidates: readonly DirectionalInteractionCandidate<T>[],
  origin: readonly [number, number],
  facing: readonly [number, number],
  options: DirectionalInteractionOptions = {},
): T | undefined => {
  const maxSurfaceDistance = Math.max(0, options.maxSurfaceDistance ?? 2.35);
  const minimumFacingDot = Math.max(
    -1,
    Math.min(1, options.minimumFacingDot ?? 0.1),
  );
  const overlapPadding = Math.max(0, options.overlapPadding ?? 0.2);
  const facingLength = Math.hypot(facing[0], facing[1]);
  const facingX = facingLength > 1e-6 ? facing[0] / facingLength : 0;
  const facingZ = facingLength > 1e-6 ? facing[1] / facingLength : 1;

  let selected: T | undefined;
  let selectedScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    const halfExtent = Math.max(0, candidate.halfExtent ?? 0);
    const deltaX = candidate.position[0] - origin[0];
    const deltaZ = candidate.position[1] - origin[1];
    const closestX =
      Math.abs(deltaX) <= halfExtent
        ? 0
        : deltaX - Math.sign(deltaX) * halfExtent;
    const closestZ =
      Math.abs(deltaZ) <= halfExtent
        ? 0
        : deltaZ - Math.sign(deltaZ) * halfExtent;
    const surfaceDistance = Math.hypot(closestX, closestZ);
    const overlaps = surfaceDistance <= overlapPadding;
    if (!overlaps && surfaceDistance > maxSurfaceDistance) return;

    let facingDot = 1;
    if (!overlaps && surfaceDistance > 1e-6) {
      facingDot =
        (closestX / surfaceDistance) * facingX +
        (closestZ / surfaceDistance) * facingZ;
      if (facingDot < minimumFacingDot) return;
    }

    // Overlap is intentionally favored. Otherwise prefer the nearest target,
    // then the one most directly in front without introducing angle snapping.
    const score =
      surfaceDistance + (1 - facingDot) * 0.75 - (overlaps ? 1 : 0);
    if (score < selectedScore) {
      selected = candidate.value;
      selectedScore = score;
    }
  });

  return selected;
};

/**
 * Resolve the authored object an ordinary Act interaction should address.
 *
 * Decorative trim is allowed to share a cell with a functional door. In that
 * case the door must win regardless of authoring order; otherwise a frame can
 * hide the real interaction and its map threshold from Play mode.
 */
export const selectInteractionPlacementAtCell = (
  placements: readonly ObjectPlacementData[],
  objectById: ReadonlyMap<string, ObjectData>,
  x: number,
  z: number,
): ObjectPlacementData | undefined => {
  const matches = placements.filter((placement) =>
    placementOccupiesCell(
      placement,
      objectById.get(placement.object_id),
      x,
      z,
    ),
  );

  return matches.find(isBuildingDoorPlacement) || matches[0];
};
