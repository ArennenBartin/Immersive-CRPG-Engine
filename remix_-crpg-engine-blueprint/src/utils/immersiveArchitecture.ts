import type { AuthoredViewMode } from "./firstPersonControls";

export const IMMERSIVE_WALL_HEIGHT_SCALE = 1.5;
export const IMMERSIVE_CEILING_HEIGHT = 2.85;

export const isImmersiveCeilingView = (
  viewMode: AuthoredViewMode,
): boolean => viewMode === "first_person" || viewMode === "third_person";

export const resolveImmersiveWallHeight = (
  authoredHeight: number,
  wall: boolean,
): number => {
  const safeHeight = Number.isFinite(authoredHeight)
    ? Math.max(0, authoredHeight)
    : 0;
  return wall ? safeHeight * IMMERSIVE_WALL_HEIGHT_SCALE : safeHeight;
};

export const resolveRuntimeObjectPlacementYOffset = ({
  baseHeight,
  surfaceOffset,
  minY,
  heightOffset = 0,
  ceilingAnchored = false,
}: {
  baseHeight: number;
  surfaceOffset: number;
  minY: number;
  heightOffset?: number;
  ceilingAnchored?: boolean;
}): number =>
  baseHeight +
  surfaceOffset +
  heightOffset +
  (ceilingAnchored ? 0 : -minY + 0.01);

// Level Zero is 33 cells wide. The default 10-cell balanced core plus this
// extension can therefore keep the opposite wall authored and textured from
// edge to edge, while the side/rear budget remains unchanged.
export const IMMERSIVE_DETAIL_FORWARD_BONUS = 32;
export const IMMERSIVE_ARCHITECTURE_FORWARD_BONUS = 28;
export const IMMERSIVE_STREAM_SECTOR_COUNT = 16;
export const IMMERSIVE_STREAM_SECTOR_SIZE =
  (Math.PI * 2) / IMMERSIVE_STREAM_SECTOR_COUNT;
export const IMMERSIVE_STREAM_SECTOR_HYSTERESIS_RADIANS =
  (3 * Math.PI) / 180;
const IMMERSIVE_DIRECTIONAL_BASE_LATERAL_SCALE = 0.62;
const IMMERSIVE_DIRECTIONAL_FORWARD_LATERAL_SCALE = 0.22;

const wrapImmersiveYaw = (yaw: number) =>
  Math.atan2(Math.sin(yaw), Math.cos(yaw));

const canonicalizeImmersiveStreamSector = (sector: number) =>
  ((sector % IMMERSIVE_STREAM_SECTOR_COUNT) +
    IMMERSIVE_STREAM_SECTOR_COUNT) %
  IMMERSIVE_STREAM_SECTOR_COUNT;

export const resolveImmersiveStreamSector = (
  viewYaw: number,
  currentSector = Number.NaN,
): number => {
  const candidate = canonicalizeImmersiveStreamSector(
    Math.round(
      wrapImmersiveYaw(viewYaw) / IMMERSIVE_STREAM_SECTOR_SIZE,
    ),
  );
  if (!Number.isFinite(currentSector)) return candidate;

  const current = canonicalizeImmersiveStreamSector(currentSector);
  const offsetFromCurrent = Math.abs(
    wrapImmersiveYaw(
      viewYaw - current * IMMERSIVE_STREAM_SECTOR_SIZE,
    ),
  );
  return offsetFromCurrent <=
    IMMERSIVE_STREAM_SECTOR_SIZE / 2 +
      IMMERSIVE_STREAM_SECTOR_HYSTERESIS_RADIANS
    ? current
    : candidate;
};

export const resolveImmersiveDirectionalWindowOuterRadius = ({
  radius,
  forwardBonus = 0,
}: {
  radius: number;
  forwardBonus?: number;
}): number => {
  const safeRadius = Math.max(0, radius);
  const safeBonus = Math.max(0, forwardBonus);
  if (safeBonus === 0) return safeRadius;
  return Math.hypot(
    safeRadius + safeBonus,
    safeRadius * IMMERSIVE_DIRECTIONAL_BASE_LATERAL_SCALE +
      safeBonus * IMMERSIVE_DIRECTIONAL_FORWARD_LATERAL_SCALE,
  );
};

// Immersive play keeps a complete circular safety field around the actor, then
// adds a camera-facing corridor beyond it. This spends additional cells where
// the player can actually see them instead of doubling the cost in every
// direction. The corridor widens gradually like a perspective frustum.
export const isWithinImmersiveDirectionalWindow = ({
  cell,
  center,
  forward,
  radius,
  forwardBonus = 0,
}: {
  cell: readonly [number, number];
  center: readonly [number, number];
  forward?: readonly [number, number] | null;
  radius: number;
  forwardBonus?: number;
}): boolean => {
  const safeRadius = Math.max(0, radius);
  const dx = cell[0] - center[0];
  const dz = cell[1] - center[1];
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq <= safeRadius * safeRadius) return true;

  const bonus = Math.max(0, forwardBonus);
  const forwardLength = forward
    ? Math.hypot(forward[0], forward[1])
    : 0;
  if (bonus <= 0 || forwardLength <= 0.0001 || !forward) return false;

  const fx = forward[0] / forwardLength;
  const fz = forward[1] / forwardLength;
  const forwardDistance = dx * fx + dz * fz;
  if (
    forwardDistance <= safeRadius ||
    forwardDistance > safeRadius + bonus
  ) {
    return false;
  }

  const lateralDistance = Math.abs(dx * -fz + dz * fx);
  const distanceBeyondCircle = forwardDistance - safeRadius;
  const lateralLimit =
    safeRadius * IMMERSIVE_DIRECTIONAL_BASE_LATERAL_SCALE +
    distanceBeyondCircle * IMMERSIVE_DIRECTIONAL_FORWARD_LATERAL_SCALE;
  return lateralDistance <= lateralLimit;
};

export const isWithinDistantArchitectureBand = ({
  cell,
  center,
  detailRadius,
  architectureRadius,
  forward,
  detailForwardBonus = 0,
  architectureForwardBonus = 0,
}: {
  cell: readonly [number, number];
  center: readonly [number, number];
  detailRadius: number;
  architectureRadius: number;
  forward?: readonly [number, number] | null;
  detailForwardBonus?: number;
  architectureForwardBonus?: number;
}): boolean => {
  return (
    !isWithinImmersiveDirectionalWindow({
      cell,
      center,
      forward,
      radius: detailRadius,
      forwardBonus: detailForwardBonus,
    }) &&
    isWithinImmersiveDirectionalWindow({
      cell,
      center,
      forward,
      radius: architectureRadius,
      forwardBonus: architectureForwardBonus,
    })
  );
};
