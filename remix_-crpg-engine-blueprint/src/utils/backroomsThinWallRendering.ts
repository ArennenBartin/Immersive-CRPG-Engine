import {
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS,
  backroomsLevelZeroDamaskThinWallObjectId,
  backroomsLevelZeroThinWallObjectId,
  isBackroomsLevelZeroDamaskThinWallObjectId,
  readBackroomsLevelZeroThinWallFaceMask,
} from "../schema/presets";

const BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_ORDER = [
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.north,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.east,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.south,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.west,
] as const;

/**
 * Resolves a composite Level 0 thin-wall object into its existing one-face
 * definitions. Rendering the returned definitions at the owning cell's same
 * transform is geometrically identical to rendering the composite object, but
 * lets every visible wall share one of only four instance buckets per finish.
 *
 * Non-thin-wall IDs return undefined so callers can preserve their normal
 * rendering path. Mask zero intentionally returns an empty list: it owns the
 * solid navigation cell but has no visible faces.
 */
export const decomposeBackroomsLevelZeroThinWallObjectId = (
  objectId: string | null | undefined,
): string[] | undefined => {
  const faceMask = readBackroomsLevelZeroThinWallFaceMask(objectId);
  if (faceMask === undefined) return undefined;

  const objectIdForFace = isBackroomsLevelZeroDamaskThinWallObjectId(objectId)
    ? backroomsLevelZeroDamaskThinWallObjectId
    : backroomsLevelZeroThinWallObjectId;

  return BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_ORDER.filter(
    (faceBit) => (faceMask & faceBit) !== 0,
  ).map(objectIdForFace);
};
