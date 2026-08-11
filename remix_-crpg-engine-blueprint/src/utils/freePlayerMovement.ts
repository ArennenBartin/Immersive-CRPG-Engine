export type FreePlayerPosition = readonly [number, number];

export interface FreePlayerCollisionBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const BACKROOMS_FREE_TURN_RATE_RADIANS_PER_SECOND =
  (150 * Math.PI) / 180;
export const BACKROOMS_FREE_COLLISION_RADIUS_FINE = 1.08;
export const BACKROOMS_FREE_MAX_FRAME_SECONDS = 0.05;
export const BACKROOMS_FREE_MAX_SWEEP_STEP_FINE = 0.2;
// The live third-person pose already drives Steve and the camera directly on
// every RAF. This is only a crash/reload safety checkpoint for sub-cell turns
// and positions; gameplay cell crossings, input release, interactions, blur,
// and panels all force an exact commit separately. Keeping the safety pulse at
// 5 Hz avoids republishing the complete save/Play tree 30 times per second.
export const FREE_PLAYER_DURABLE_POSE_HZ = 5;
export const FREE_PLAYER_DURABLE_POSE_INTERVAL_MS =
  1000 / FREE_PLAYER_DURABLE_POSE_HZ;

/** Keeps render-only pose integration off the durable save's hot path. */
export const shouldCommitFreePlayerDurablePose = (options: {
  dirty: boolean;
  force?: boolean;
  nowMs: number;
  lastCommitAtMs: number;
}) =>
  options.dirty &&
  (Boolean(options.force) ||
    options.nowMs - options.lastCommitAtMs >=
      FREE_PLAYER_DURABLE_POSE_INTERVAL_MS);

/**
 * Settles the player-only exploration energy clock without constructing the
 * NPC scheduler. Generated Level Zero maps commonly contain no active entity
 * placements, so this is the hot path for every fine-cell crossing there.
 */
export const resolveEntityFreeExplorationSettlement = (options: {
  energy: number;
  speed: number;
  actionThreshold?: number;
}): Readonly<{ energy: number; elapsedTicks: number }> => {
  const actionThreshold = options.actionThreshold ?? 1000;
  const speed = Math.max(1, options.speed || 10);
  if (options.energy >= actionThreshold) {
    return { energy: options.energy, elapsedTicks: 0 };
  }
  const elapsedTicks = Math.max(
    1,
    Math.ceil((actionThreshold - options.energy) / speed),
  );
  return {
    energy: options.energy + speed * elapsedTicks,
    elapsedTicks,
  };
};

const EPSILON = 1e-6;

export const normalizeFreeFacing = (
  facing: FreePlayerPosition | null | undefined,
): [number, number] => {
  const x = Number(facing?.[0] ?? 0);
  const z = Number(facing?.[1] ?? -1);
  const length = Math.hypot(x, z);
  if (!Number.isFinite(length) || length <= EPSILON) return [0, -1];
  return [x / length, z / length];
};

export const rotateFreeFacing = (
  facing: FreePlayerPosition,
  turnInput: number,
  deltaSeconds: number,
  radiansPerSecond = BACKROOMS_FREE_TURN_RATE_RADIANS_PER_SECOND,
): [number, number] => {
  const [x, z] = normalizeFreeFacing(facing);
  const radians =
    Math.max(-1, Math.min(1, turnInput)) *
    Math.max(0, deltaSeconds) *
    radiansPerSecond;
  if (Math.abs(radians) <= EPSILON) return [x, z];
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return normalizeFreeFacing([
    x * cosine - z * sine,
    x * sine + z * cosine,
  ]);
};

export const quantizeFreePlayerPosition = (
  position: FreePlayerPosition,
): [number, number] => {
  const x = Math.round(position[0]);
  const z = Math.round(position[1]);
  return [Object.is(x, -0) ? 0 : x, Object.is(z, -0) ? 0 : z];
};

export const isFreePlayerPositionValid = (
  position: unknown,
): position is [number, number] =>
  Array.isArray(position) &&
  position.length === 2 &&
  Number.isFinite(position[0]) &&
  Number.isFinite(position[1]);

export const resolveFreePlayerStart = (
  cell: FreePlayerPosition,
  position: unknown,
): [number, number] => {
  if (!isFreePlayerPositionValid(position)) return [cell[0], cell[1]];
  // Teleports and map changes are allowed to replace the authoritative cell.
  // A stale sub-cell coordinate must never drag Steve back toward the old map.
  if (Math.hypot(position[0] - cell[0], position[1] - cell[1]) > 1) {
    return [cell[0], cell[1]];
  }
  return [position[0], position[1]];
};

export const resolveFreeInteractionStep = (
  facing: FreePlayerPosition | null | undefined,
): [number, number] => {
  const [x, z] = normalizeFreeFacing(facing);
  const octant = Math.round(Math.atan2(z, x) / (Math.PI / 4));
  const angle = octant * (Math.PI / 4);
  const stepX = Math.round(Math.cos(angle));
  const stepZ = Math.round(Math.sin(angle));
  return [
    Object.is(stepX, -0) ? 0 : stepX,
    Object.is(stepZ, -0) ? 0 : stepZ,
  ];
};

/**
 * Resolves the first integer fine cell beyond the actor's square footprint.
 * The square-edge scale preserves the legacy diagonal reach while allowing a
 * continuous facing to select ordinary grid-backed interactions reliably.
 */
export const resolveFacedInteractionProbe = (
  origin: FreePlayerPosition,
  facing: FreePlayerPosition | null | undefined,
  edgeReach = 2,
): [number, number] => {
  const [x, z] = normalizeFreeFacing(facing);
  const edgeScale = Math.max(0, edgeReach) / Math.max(Math.abs(x), Math.abs(z));
  return quantizeFreePlayerPosition([
    origin[0] + x * edgeScale,
    origin[1] + z * edgeScale,
  ]);
};

export const resolveFreeInteractionPose = (options: {
  cell: FreePlayerPosition;
  position?: unknown;
  facing: FreePlayerPosition | null | undefined;
  useContinuousPosition: boolean;
  edgeReach?: number;
}) => {
  const origin = options.useContinuousPosition
    ? resolveFreePlayerStart(options.cell, options.position)
    : ([options.cell[0], options.cell[1]] as [number, number]);
  const facing = normalizeFreeFacing(options.facing);
  return {
    origin,
    facing,
    step: resolveFreeInteractionStep(facing),
    probe: resolveFacedInteractionProbe(origin, facing, options.edgeReach),
  };
};

/** Entity anchors may legitimately lead their continuous pose by one path step. */
export const resolveFreeActorStart = (
  cell: FreePlayerPosition,
  position: unknown,
): [number, number] =>
  isFreePlayerPositionValid(position)
    ? [position[0], position[1]]
    : [cell[0], cell[1]];

export const advanceFreeActorToward = (options: {
  position: FreePlayerPosition;
  target: FreePlayerPosition;
  maximumDistance: number;
  isBlockedCell: (x: number, z: number) => boolean;
  radius?: number;
}): [number, number] => {
  const dx = options.target[0] - options.position[0];
  const dz = options.target[1] - options.position[1];
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance <= EPSILON) {
    return [options.target[0], options.target[1]];
  }
  const travel = Math.min(distance, Math.max(0, options.maximumDistance));
  if (travel <= EPSILON) return [options.position[0], options.position[1]];
  return resolveFreePlayerMovement({
    position: options.position,
    delta: [(dx / distance) * travel, (dz / distance) * travel],
    isBlockedCell: options.isBlockedCell,
    radius: options.radius,
  });
};

export const freePlayerPositionIntersectsBlockedCell = (
  position: FreePlayerPosition,
  radius: number,
  isBlockedCell: (x: number, z: number) => boolean,
) => {
  const safeRadius = Math.max(0, radius);
  const minX = Math.floor(position[0] - safeRadius - 0.5);
  const maxX = Math.ceil(position[0] + safeRadius + 0.5);
  const minZ = Math.floor(position[1] - safeRadius - 0.5);
  const maxZ = Math.ceil(position[1] + safeRadius + 0.5);

  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      if (!isBlockedCell(x, z)) continue;
      const closestX = Math.max(x - 0.5, Math.min(position[0], x + 0.5));
      const closestZ = Math.max(z - 0.5, Math.min(position[1], z + 0.5));
      const dx = position[0] - closestX;
      const dz = position[1] - closestZ;
      if (dx * dx + dz * dz < safeRadius * safeRadius - EPSILON) {
        return true;
      }
    }
  }
  return false;
};

export const freePlayerPositionIntersectsBounds = (
  position: FreePlayerPosition,
  radius: number,
  bounds: FreePlayerCollisionBounds2D,
): boolean => {
  const safeRadius = Math.max(0, radius);
  const closestX = Math.max(bounds.minX, Math.min(position[0], bounds.maxX));
  const closestZ = Math.max(bounds.minZ, Math.min(position[1], bounds.maxZ));
  const dx = position[0] - closestX;
  const dz = position[1] - closestZ;
  return dx * dx + dz * dz < safeRadius * safeRadius - EPSILON;
};

/**
 * Repairs a persisted/transition pose that landed inside newly fitted
 * collision. Continuous movement cannot escape an overlap by itself because
 * every partial sweep still intersects the obstacle, so select the nearest
 * legal integer fine-cell center before accepting input.
 */
export const resolveNearestFreePlayerPosition = (options: {
  position: FreePlayerPosition;
  isBlockedCell: (x: number, z: number) => boolean;
  intersectsBlockedPosition?: (
    position: FreePlayerPosition,
    radius: number,
  ) => boolean;
  radius?: number;
  maxSearchRadius?: number;
}): [number, number] | null => {
  const radius = options.radius ?? BACKROOMS_FREE_COLLISION_RADIUS_FINE;
  const isInvalid = (position: FreePlayerPosition) =>
    freePlayerPositionIntersectsBlockedCell(
      position,
      radius,
      options.isBlockedCell,
    ) || Boolean(options.intersectsBlockedPosition?.(position, radius));

  if (!isInvalid(options.position)) {
    return [options.position[0], options.position[1]];
  }

  const center = quantizeFreePlayerPosition(options.position);
  const maxSearchRadius = Math.max(
    1,
    Math.floor(options.maxSearchRadius ?? 24),
  );
  for (let ring = 0; ring <= maxSearchRadius; ring += 1) {
    const candidates: [number, number][] = [];
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        candidates.push([center[0] + dx, center[1] + dz]);
      }
    }
    candidates.sort(
      (a, b) =>
        Math.hypot(
          a[0] - options.position[0],
          a[1] - options.position[1],
        ) -
        Math.hypot(
          b[0] - options.position[0],
          b[1] - options.position[1],
        ),
    );
    const valid = candidates.find((candidate) => !isInvalid(candidate));
    if (valid) return valid;
  }
  return null;
};

export const resolveFreePlayerMovement = (options: {
  position: FreePlayerPosition;
  delta: FreePlayerPosition;
  isBlockedCell: (x: number, z: number) => boolean;
  intersectsBlockedPosition?: (
    position: FreePlayerPosition,
    radius: number,
  ) => boolean;
  radius?: number;
  maxSweepStep?: number;
}): [number, number] => {
  const radius =
    options.radius ?? BACKROOMS_FREE_COLLISION_RADIUS_FINE;
  const maxSweepStep = Math.max(
    0.02,
    options.maxSweepStep ?? BACKROOMS_FREE_MAX_SWEEP_STEP_FINE,
  );
  const distance = Math.hypot(options.delta[0], options.delta[1]);
  if (!Number.isFinite(distance) || distance <= EPSILON) {
    return [options.position[0], options.position[1]];
  }

  const steps = Math.max(1, Math.ceil(distance / maxSweepStep));
  const stepX = options.delta[0] / steps;
  const stepZ = options.delta[1] / steps;
  let x = options.position[0];
  let z = options.position[1];
  const intersectsBlockedPosition = (position: FreePlayerPosition) =>
    freePlayerPositionIntersectsBlockedCell(
      position,
      radius,
      options.isBlockedCell,
    ) || Boolean(options.intersectsBlockedPosition?.(position, radius));

  for (let step = 0; step < steps; step += 1) {
    const full: [number, number] = [x + stepX, z + stepZ];
    if (!intersectsBlockedPosition(full)) {
      [x, z] = full;
      continue;
    }

    // One tangent slide keeps movement flowing past a wall or corner without
    // ever allowing the swept circle to tunnel through either surface.
    const xOnly: [number, number] = [x + stepX, z];
    const zOnly: [number, number] = [x, z + stepZ];
    const xClear = !intersectsBlockedPosition(xOnly);
    const zClear = !intersectsBlockedPosition(zOnly);
    if (xClear && (!zClear || Math.abs(stepX) >= Math.abs(stepZ))) {
      [x, z] = xOnly;
    } else if (zClear) {
      [x, z] = zOnly;
    }
  }

  return [x, z];
};
