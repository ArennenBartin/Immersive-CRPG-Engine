import {
  FINE_HALF_EXTENT,
  FINE_PER_MACRO,
  actorFootprintCells,
  fineCoord,
  footprintsOverlap,
  type FineCoord,
  type GridCoord,
} from "./gridCoordinates";

// Pure Phase-1 realtime-combat contracts. This module deliberately has no
// browser, React, store, or V1 runtime dependency: PlayMode can keep the live
// controller in a ref and pass cached structural/occupancy queries into it.

export type HorrorCombatMode = "pulse" | "horror_realtime";

export type HorrorPrimaryCommand =
  | "confirm_target"
  | "act"
  | "attack"
  | "none";

export interface HorrorPrimaryInput {
  key: string;
  inputBlocked: boolean;
  targeting: boolean;
  contextualActAvailable: boolean;
}

/**
 * Routes the realtime profile through the engine's existing contextual Act
 * system. Space remains a convenient attack key in empty space, but a nearby
 * door, person, item, container, workstation, or manipulable object wins so
 * authored interactions do not disappear merely because a map uses horror
 * combat. `1` is the unambiguous attack fallback.
 */
export const resolveHorrorPrimaryCommand = ({
  key,
  inputBlocked,
  targeting,
  contextualActAvailable,
}: HorrorPrimaryInput): HorrorPrimaryCommand => {
  if (inputBlocked) return "none";
  if (targeting) {
    return key === " " || key === "enter" ? "confirm_target" : "none";
  }
  if (key === "1") return "attack";
  if (key === "enter") return contextualActAvailable ? "act" : "none";
  if (key === " ") return contextualActAvailable ? "act" : "attack";
  return "none";
};

export interface HorrorCombatModeSource {
  combat_mode?: unknown;
}

const authoredCombatMode = (
  source: HorrorCombatMode | HorrorCombatModeSource | null | undefined,
): HorrorCombatMode | undefined => {
  const value = typeof source === "string" ? source : source?.combat_mode;
  return value === "pulse" || value === "horror_realtime" ? value : undefined;
};

/** Map authoring wins over package settings; unrecognized/missing values are pulse. */
export const resolveHorrorCombatMode = (
  mapOverride?: HorrorCombatMode | HorrorCombatModeSource | null,
  settings?: HorrorCombatMode | HorrorCombatModeSource | null,
): HorrorCombatMode =>
  authoredCombatMode(mapOverride) ?? authoredCombatMode(settings) ?? "pulse";

export type HorrorCombatPhase = "idle" | "windup" | "active" | "recovery";
export type HorrorDirection = readonly [number, number];

export interface HorrorActionProfile {
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
}

export interface HorrorActionState {
  phase: HorrorCombatPhase;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  direction: HorrorDirection;
  hitTargetIds: readonly string[];
}

export interface HorrorPhaseTransition {
  from: HorrorCombatPhase;
  to: HorrorCombatPhase;
  /** Milliseconds consumed by this call before the transition occurred. */
  atElapsedMs: number;
}

export interface HorrorActionAdvance {
  state: HorrorActionState;
  transitions: readonly HorrorPhaseTransition[];
}

export const DEFAULT_HORROR_PLAYER_ATTACK_PROFILE: Readonly<HorrorActionProfile> = {
  windupMs: 160,
  activeMs: 120,
  recoveryMs: 650,
};

const EPSILON = 0.000001;
const TAU = Math.PI * 2;

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const sameCell = (a: GridCoord, b: GridCoord): boolean =>
  a[0] === b[0] && a[1] === b[1];

const isZeroDirection = (direction: GridCoord | undefined): boolean =>
  !direction || (direction[0] === 0 && direction[1] === 0);

/** Quantizes any vector to the engine's deterministic eight-way facing ring. */
export const normalizeHorrorDirection = (
  direction: GridCoord,
  fallback: GridCoord = [0, 1],
): HorrorDirection => {
  const x = Math.sign(direction[0]);
  const z = Math.sign(direction[1]);
  if (x !== 0 || z !== 0) return [x, z];
  const fallbackX = Math.sign(fallback[0]);
  const fallbackZ = Math.sign(fallback[1]);
  return fallbackX !== 0 || fallbackZ !== 0
    ? [fallbackX, fallbackZ]
    : [0, 1];
};

export const oppositeHorrorDirection = (direction: GridCoord): HorrorDirection => {
  const normalized = normalizeHorrorDirection(direction);
  return [
    normalized[0] === 0 ? 0 : -normalized[0],
    normalized[1] === 0 ? 0 : -normalized[1],
  ];
};

export const horrorDirectionToward = (
  from: GridCoord,
  to: GridCoord,
  fallback: GridCoord = [0, 1],
): HorrorDirection =>
  normalizeHorrorDirection([to[0] - from[0], to[1] - from[1]], fallback);

/**
 * Quantizes an aim vector to its nearest 45-degree attack heading. Movement
 * deliberately keeps sign-based diagonals, but melee must not turn a shallow
 * off-axis target into a diagonal miss.
 */
export const horrorAttackDirectionToward = (
  from: GridCoord,
  to: GridCoord,
  fallback: GridCoord = [0, 1],
): HorrorDirection => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (dx === 0 && dz === 0) return normalizeHorrorDirection(fallback);
  const octant = (Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8;
  return (
    [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ] as const
  )[octant]!;
};

export const createIdleHorrorAction = (
  direction: GridCoord = [0, 1],
): HorrorActionState => ({
  phase: "idle",
  phaseElapsedMs: 0,
  phaseRemainingMs: 0,
  direction: normalizeHorrorDirection(direction),
  hitTargetIds: [],
});

/** Commits immediately; target acquisition is intentionally not a prerequisite. */
export const commitHorrorAction = (
  profile: HorrorActionProfile,
  direction: GridCoord,
): HorrorActionState => ({
  phase: "windup",
  phaseElapsedMs: 0,
  phaseRemainingMs: finiteNonNegative(profile.windupMs),
  direction: normalizeHorrorDirection(direction),
  hitTargetIds: [],
});

const nextHorrorPhase = (phase: HorrorCombatPhase): HorrorCombatPhase => {
  if (phase === "windup") return "active";
  if (phase === "active") return "recovery";
  return "idle";
};

const durationForPhase = (
  phase: HorrorCombatPhase,
  profile: HorrorActionProfile,
): number => {
  if (phase === "windup") return finiteNonNegative(profile.windupMs);
  if (phase === "active") return finiteNonNegative(profile.activeMs);
  if (phase === "recovery") return finiteNonNegative(profile.recoveryMs);
  return 0;
};

/**
 * Advances through as many action boundaries as the supplied duration crosses.
 * Durations are relative, making the state safe for deterministic stepping and
 * later persistence without browser timestamps.
 */
export const advanceHorrorAction = (
  initialState: HorrorActionState,
  elapsedMs: number,
  profile: HorrorActionProfile,
): HorrorActionAdvance => {
  let state: HorrorActionState = { ...initialState };
  let remaining = finiteNonNegative(elapsedMs);
  let consumed = 0;
  const transitions: HorrorPhaseTransition[] = [];

  for (let guard = 0; guard < 8 && state.phase !== "idle"; guard += 1) {
    const phaseRemaining = finiteNonNegative(state.phaseRemainingMs);
    const slice = Math.min(remaining, phaseRemaining);
    state = {
      ...state,
      phaseElapsedMs: state.phaseElapsedMs + slice,
      phaseRemainingMs: Math.max(0, phaseRemaining - slice),
    };
    remaining -= slice;
    consumed += slice;

    if (state.phaseRemainingMs > EPSILON) break;

    const from = state.phase;
    const to = nextHorrorPhase(from);
    transitions.push({ from, to, atElapsedMs: consumed });
    state = {
      ...state,
      phase: to,
      phaseElapsedMs: 0,
      phaseRemainingMs: durationForPhase(to, profile),
    };

    if (remaining <= EPSILON && state.phaseRemainingMs > EPSILON) break;
  }

  return { state, transitions };
};

export const recordHorrorActionHits = (
  state: HorrorActionState,
  targetIds: readonly string[],
): HorrorActionState => ({
  ...state,
  hitTargetIds: [...new Set([...state.hitTargetIds, ...targetIds])].sort(),
});

export const horrorActionPhaseProgress = (
  state: HorrorActionState,
  profile: HorrorActionProfile,
): number => {
  const duration = durationForPhase(state.phase, profile);
  return duration <= EPSILON ? (state.phase === "idle" ? 0 : 1) :
    Math.min(1, Math.max(0, state.phaseElapsedMs / duration));
};

export interface HorrorStaminaRules {
  maximum: number;
  regenerationDelayMs: number;
  regenerationPerSecond: number;
}

export interface HorrorStaminaState {
  current: number;
  millisecondsSinceSpend: number;
}

export interface HorrorStaminaSpend {
  state: HorrorStaminaState;
  spent: boolean;
}

export const DEFAULT_HORROR_STAMINA_RULES: Readonly<HorrorStaminaRules> = {
  maximum: 100,
  regenerationDelayMs: 650,
  regenerationPerSecond: 25,
};

export const createHorrorStaminaState = (
  current = DEFAULT_HORROR_STAMINA_RULES.maximum,
  rules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorStaminaState => ({
  current: Math.min(finiteNonNegative(rules.maximum), finiteNonNegative(current)),
  millisecondsSinceSpend: finiteNonNegative(rules.regenerationDelayMs),
});

export const spendHorrorStamina = (
  state: HorrorStaminaState,
  cost: number,
  rules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorStaminaSpend => {
  const normalizedCost = finiteNonNegative(cost);
  if (state.current + EPSILON < normalizedCost) return { state, spent: false };
  return {
    spent: true,
    state: {
      current: Math.min(
        finiteNonNegative(rules.maximum),
        Math.max(0, state.current - normalizedCost),
      ),
      millisecondsSinceSpend: 0,
    },
  };
};

/** Regeneration accounts exactly for a frame that crosses the delay boundary. */
export const advanceHorrorStamina = (
  state: HorrorStaminaState,
  elapsedMs: number,
  rules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorStaminaState => {
  const elapsed = finiteNonNegative(elapsedMs);
  const previousSinceSpend = finiteNonNegative(state.millisecondsSinceSpend);
  const nextSinceSpend = previousSinceSpend + elapsed;
  const delay = finiteNonNegative(rules.regenerationDelayMs);
  const regeneratingDuration =
    Math.max(0, nextSinceSpend - delay) - Math.max(0, previousSinceSpend - delay);
  const regenerated =
    finiteNonNegative(rules.regenerationPerSecond) * regeneratingDuration / 1000;
  return {
    current: Math.min(
      finiteNonNegative(rules.maximum),
      Math.max(0, state.current + regenerated),
    ),
    millisecondsSinceSpend: nextSinceSpend,
  };
};

export interface HorrorContactLatch {
  hostileId?: string;
  direction?: HorrorDirection;
}

export interface HorrorContactAttempt {
  forwardHeld: boolean;
  direction: GridCoord;
  /** Undefined means separation has been restored. */
  blockedByHostileId?: string;
}

export interface HorrorContactResolution {
  latch: HorrorContactLatch;
  movementBlocked: boolean;
  emitCosmeticRecoil: boolean;
  /** Contact can never be promoted into an attack in this profile. */
  attackRequested: false;
}

export const createHorrorContactLatch = (): HorrorContactLatch => ({});

/**
 * Held-forward contact emits one response. Releasing forward, changing the
 * attempted direction, or restoring separation resets the latch.
 */
export const resolveHorrorContact = (
  latch: HorrorContactLatch,
  attempt: HorrorContactAttempt,
): HorrorContactResolution => {
  if (!attempt.forwardHeld || !attempt.blockedByHostileId) {
    return {
      latch: {},
      movementBlocked: false,
      emitCosmeticRecoil: false,
      attackRequested: false,
    };
  }

  const direction = normalizeHorrorDirection(attempt.direction);
  const alreadyLatched =
    latch.hostileId === attempt.blockedByHostileId &&
    Boolean(latch.direction) &&
    sameCell(latch.direction!, direction);
  return {
    latch: { hostileId: attempt.blockedByHostileId, direction },
    movementBlocked: true,
    emitCosmeticRecoil: !alreadyLatched,
    attackRequested: false,
  };
};

export type HorrorCellBlocker = (cell: GridCoord) => boolean;

export const createHorrorCellBlocker = (
  cells: Iterable<GridCoord>,
): HorrorCellBlocker => {
  const keys = new Set(Array.from(cells, (cell) => `${cell[0]}:${cell[1]}`));
  return (cell) => keys.has(`${cell[0]}:${cell[1]}`);
};

/**
 * Supercover traversal excludes `from` and includes `to`. Exact corner
 * crossings include both side cells, matching collision-safe corner rules.
 */
export const traceHorrorFineLine = (
  from: GridCoord,
  to: GridCoord,
): readonly FineCoord[] => {
  let x = Math.round(from[0]);
  let z = Math.round(from[1]);
  const targetX = Math.round(to[0]);
  const targetZ = Math.round(to[1]);
  const nx = Math.abs(targetX - x);
  const nz = Math.abs(targetZ - z);
  const stepX = Math.sign(targetX - x);
  const stepZ = Math.sign(targetZ - z);
  let ix = 0;
  let iz = 0;
  const result: FineCoord[] = [];
  const seen = new Set<string>();
  const push = (cellX: number, cellZ: number) => {
    if (cellX === Math.round(from[0]) && cellZ === Math.round(from[1])) return;
    const key = `${cellX}:${cellZ}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(fineCoord(cellX, cellZ));
  };

  while (ix < nx || iz < nz) {
    const xDecision = (1 + ix * 2) * nz;
    const zDecision = (1 + iz * 2) * nx;
    if (xDecision === zDecision) {
      if (ix < nx) push(x + stepX, z);
      if (iz < nz) push(x, z + stepZ);
      if (ix < nx) {
        x += stepX;
        ix += 1;
      }
      if (iz < nz) {
        z += stepZ;
        iz += 1;
      }
      push(x, z);
    } else if (xDecision < zDecision) {
      x += stepX;
      ix += 1;
      push(x, z);
    } else {
      z += stepZ;
      iz += 1;
      push(x, z);
    }
  }
  return result;
};

export const hasHorrorStructuralLine = (
  from: GridCoord,
  to: GridCoord,
  isBlocked: HorrorCellBlocker,
): boolean => !traceHorrorFineLine(from, to).some(isBlocked);

const vectorAngle = (direction: GridCoord): number =>
  Math.atan2(direction[1], direction[0]);

const wrapSignedRadians = (radians: number): number => {
  let wrapped = (radians + Math.PI) % TAU;
  if (wrapped < 0) wrapped += TAU;
  return wrapped - Math.PI;
};

const absoluteAngleFromFacing = (
  facing: GridCoord,
  from: GridCoord,
  to: GridCoord,
): number => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (dx === 0 && dz === 0) return 0;
  return Math.abs(wrapSignedRadians(Math.atan2(dz, dx) - vectorAngle(facing)));
};

const distanceBetween = (a: GridCoord, b: GridCoord): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

export interface HorrorTargetCandidate {
  id: string;
  cell: GridCoord;
  eligible?: boolean;
}

export interface HorrorStickyTargetState {
  targetId?: string;
  obstructedForMs: number;
}

export interface HorrorStickyTargetConfig {
  acquireHalfAngleDegrees: number;
  retainHalfAngleDegrees: number;
  acquireReachFine: number;
  retainReachFine: number;
  obstructionGraceMs: number;
}

export interface HorrorStickyTargetRequest {
  origin: GridCoord;
  facing: GridCoord;
  candidates: readonly HorrorTargetCandidate[];
  isBlocked: HorrorCellBlocker;
  elapsedMs: number;
}

export interface HorrorStickyTargetResolution {
  state: HorrorStickyTargetState;
  target?: HorrorTargetCandidate;
}

export const DEFAULT_HORROR_STICKY_TARGET_CONFIG: Readonly<HorrorStickyTargetConfig> = {
  acquireHalfAngleDegrees: 35,
  retainHalfAngleDegrees: 50,
  acquireReachFine: FINE_PER_MACRO,
  retainReachFine: FINE_PER_MACRO + 1,
  obstructionGraceMs: 120,
};

export const createHorrorStickyTargetState = (): HorrorStickyTargetState => ({
  obstructedForMs: 0,
});

const candidateWithinTargetingBounds = (
  candidate: HorrorTargetCandidate,
  request: HorrorStickyTargetRequest,
  halfAngleDegrees: number,
  reachFine: number,
): boolean =>
  candidate.eligible !== false &&
  distanceBetween(request.origin, candidate.cell) <= reachFine + EPSILON &&
  absoluteAngleFromFacing(request.facing, request.origin, candidate.cell) <=
    halfAngleDegrees * Math.PI / 180 + EPSILON;

/** Angle, then distance, then entity ID determines acquisition order. */
export const resolveStickyHorrorTarget = (
  previous: HorrorStickyTargetState,
  request: HorrorStickyTargetRequest,
  config: HorrorStickyTargetConfig = DEFAULT_HORROR_STICKY_TARGET_CONFIG,
): HorrorStickyTargetResolution => {
  const current = previous.targetId
    ? request.candidates.find((candidate) => candidate.id === previous.targetId)
    : undefined;
  if (
    current &&
    candidateWithinTargetingBounds(
      current,
      request,
      config.retainHalfAngleDegrees,
      config.retainReachFine,
    )
  ) {
    const clear = hasHorrorStructuralLine(request.origin, current.cell, request.isBlocked);
    const obstructedForMs = clear
      ? 0
      : previous.obstructedForMs + finiteNonNegative(request.elapsedMs);
    if (clear || obstructedForMs <= config.obstructionGraceMs + EPSILON) {
      return {
        state: { targetId: current.id, obstructedForMs },
        target: current,
      };
    }
  }

  const candidates = request.candidates
    .filter((candidate) =>
      candidateWithinTargetingBounds(
        candidate,
        request,
        config.acquireHalfAngleDegrees,
        config.acquireReachFine,
      ),
    )
    .filter((candidate) =>
      hasHorrorStructuralLine(request.origin, candidate.cell, request.isBlocked),
    )
    .sort((a, b) => {
      const angleDifference =
        absoluteAngleFromFacing(request.facing, request.origin, a.cell) -
        absoluteAngleFromFacing(request.facing, request.origin, b.cell);
      if (Math.abs(angleDifference) > EPSILON) return angleDifference;
      const distanceDifference =
        distanceBetween(request.origin, a.cell) -
        distanceBetween(request.origin, b.cell);
      if (Math.abs(distanceDifference) > EPSILON) return distanceDifference;
      return a.id.localeCompare(b.id);
    });
  const target = candidates[0];
  return target
    ? { state: { targetId: target.id, obstructedForMs: 0 }, target }
    : { state: { obstructedForMs: 0 } };
};

const angularDistanceToSweep = (
  angle: number,
  startAngle: number,
  endAngle: number,
): number => {
  const sweep = wrapSignedRadians(endAngle - startAngle);
  const relative = wrapSignedRadians(angle - startAngle);
  const liesOnArc = sweep >= 0
    ? relative >= -EPSILON && relative <= sweep + EPSILON
    : relative <= EPSILON && relative >= sweep - EPSILON;
  if (liesOnArc) return 0;
  return Math.min(
    Math.abs(wrapSignedRadians(angle - startAngle)),
    Math.abs(wrapSignedRadians(angle - endAngle)),
  );
};

export interface HorrorMeleeTarget {
  id: string;
  cell: GridCoord;
  footprintCells?: readonly GridCoord[];
  eligible?: boolean;
}

export interface HorrorMeleeSweepRequest {
  origin: GridCoord;
  startDirection: GridCoord;
  endDirection: GridCoord;
  /** Radius from the actor center to its body edge; reach begins there. */
  originFootprintRadiusFine?: number;
  reachFine: number;
  halfWidthDegrees?: number;
  innerReachFine?: number;
  targets: readonly HorrorMeleeTarget[];
  alreadyHitTargetIds?: readonly string[];
  isBlocked: HorrorCellBlocker;
}

export interface HorrorMeleeHit {
  targetId: string;
  contactCell: FineCoord;
  distanceFine: number;
}

export interface HorrorMeleeSweepResolution {
  sweptCells: readonly FineCoord[];
  hits: readonly HorrorMeleeHit[];
  newlyHitTargetIds: readonly string[];
  allHitTargetIds: readonly string[];
}

/**
 * Builds the visible fine-cell sector swept between two weapon directions.
 * Every candidate cell is ray-clipped by structural blockers before target
 * footprints are intersected, so stats never decide whether visible contact
 * occurred.
 */
export const resolveHorrorSweptMelee = (
  request: HorrorMeleeSweepRequest,
): HorrorMeleeSweepResolution => {
  const reach =
    finiteNonNegative(request.reachFine) +
    finiteNonNegative(request.originFootprintRadiusFine ?? 0);
  const innerReach = Math.min(reach, finiteNonNegative(request.innerReachFine ?? 0));
  const halfWidth = finiteNonNegative(request.halfWidthDegrees ?? 0) * Math.PI / 180;
  const startAngle = vectorAngle(
    isZeroDirection(request.startDirection) ? [1, 0] : request.startDirection,
  );
  const endAngle = vectorAngle(
    isZeroDirection(request.endDirection) ? [1, 0] : request.endDirection,
  );
  const radius = Math.ceil(reach);
  const sweptCells: FineCoord[] = [];

  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      const distance = Math.hypot(dx, dz);
      if (distance > reach + EPSILON || distance + EPSILON < innerReach) continue;
      const angle = Math.atan2(dz, dx);
      if (angularDistanceToSweep(angle, startAngle, endAngle) > halfWidth + EPSILON) {
        continue;
      }
      const cell = fineCoord(request.origin[0] + dx, request.origin[1] + dz);
      if (!hasHorrorStructuralLine(request.origin, cell, request.isBlocked)) continue;
      sweptCells.push(cell);
    }
  }

  sweptCells.sort((a, b) => {
    const distanceDifference =
      distanceBetween(request.origin, a) - distanceBetween(request.origin, b);
    return Math.abs(distanceDifference) > EPSILON
      ? distanceDifference
      : a[0] - b[0] || a[1] - b[1];
  });
  const sweptByKey = new Map(sweptCells.map((cell) => [`${cell[0]}:${cell[1]}`, cell]));
  const priorHits = new Set(request.alreadyHitTargetIds ?? []);
  const hits: HorrorMeleeHit[] = [];

  for (const target of [...request.targets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (target.eligible === false || priorHits.has(target.id)) continue;
    const footprint = target.footprintCells ?? actorFootprintCells(target.cell);
    let bestCell: FineCoord | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const footprintCell of footprint) {
      const swept = sweptByKey.get(`${footprintCell[0]}:${footprintCell[1]}`);
      if (!swept) continue;
      const distance = distanceBetween(request.origin, swept);
      if (distance < bestDistance) {
        bestCell = swept;
        bestDistance = distance;
      }
    }
    if (bestCell) {
      hits.push({ targetId: target.id, contactCell: bestCell, distanceFine: bestDistance });
    }
  }

  const newlyHitTargetIds = hits.map((hit) => hit.targetId);
  return {
    sweptCells,
    hits,
    newlyHitTargetIds,
    allHitTargetIds: [...new Set([...priorHits, ...newlyHitTargetIds])].sort(),
  };
};

export interface HorrorOccupiedActor {
  id: string;
  cell: GridCoord;
}

export type HorrorMovementBlockReason = "structure" | "actor" | "diagonal";

export interface HorrorMovementPathRequest {
  actorId: string;
  origin: GridCoord;
  direction: GridCoord;
  maximumSteps: number;
  isBlocked: HorrorCellBlocker;
  occupiedActors?: readonly HorrorOccupiedActor[];
}

export interface HorrorMovementPathResolution {
  end: FineCoord;
  path: readonly FineCoord[];
  stepsTravelled: number;
  blocked: boolean;
  blockedAt?: FineCoord;
  blockReason?: HorrorMovementBlockReason;
}

const occupancyBlockReason = (
  actorId: string,
  center: GridCoord,
  isBlocked: HorrorCellBlocker,
  occupiedActors: readonly HorrorOccupiedActor[],
): Exclude<HorrorMovementBlockReason, "diagonal"> | undefined => {
  if (actorFootprintCells(center).some(isBlocked)) return "structure";
  return occupiedActors.some(
    (actor) => actor.id !== actorId && footprintsOverlap(center, actor.cell),
  )
    ? "actor"
    : undefined;
};

export const canOccupyHorrorActor = (
  actorId: string,
  center: GridCoord,
  isBlocked: HorrorCellBlocker,
  occupiedActors: readonly HorrorOccupiedActor[] = [],
): boolean => !occupancyBlockReason(actorId, center, isBlocked, occupiedActors);

/** Collision-safe fine-cell traversal shared by evade and enemy lunge. */
export const resolveHorrorMovementPath = (
  request: HorrorMovementPathRequest,
): HorrorMovementPathResolution => {
  const direction = isZeroDirection(request.direction)
    ? [0, 0] as const
    : normalizeHorrorDirection(request.direction);
  const maximumSteps = Math.max(0, Math.floor(finiteNonNegative(request.maximumSteps)));
  const occupiedActors = request.occupiedActors ?? [];
  let current = fineCoord(request.origin[0], request.origin[1]);
  const path: FineCoord[] = [];

  if (direction[0] === 0 && direction[1] === 0) {
    return { end: current, path, stepsTravelled: 0, blocked: false };
  }

  for (let step = 0; step < maximumSteps; step += 1) {
    const candidate = fineCoord(current[0] + direction[0], current[1] + direction[1]);
    if (direction[0] !== 0 && direction[1] !== 0) {
      const sideX = fineCoord(current[0] + direction[0], current[1]);
      const sideZ = fineCoord(current[0], current[1] + direction[1]);
      if (
        occupancyBlockReason(request.actorId, sideX, request.isBlocked, occupiedActors) ||
        occupancyBlockReason(request.actorId, sideZ, request.isBlocked, occupiedActors)
      ) {
        return {
          end: current,
          path,
          stepsTravelled: path.length,
          blocked: true,
          blockedAt: candidate,
          blockReason: "diagonal",
        };
      }
    }
    const blockReason = occupancyBlockReason(
      request.actorId,
      candidate,
      request.isBlocked,
      occupiedActors,
    );
    if (blockReason) {
      return {
        end: current,
        path,
        stepsTravelled: path.length,
        blocked: true,
        blockedAt: candidate,
        blockReason,
      };
    }
    current = candidate;
    path.push(current);
  }

  return {
    end: current,
    path,
    stepsTravelled: path.length,
    blocked: false,
  };
};

export interface HorrorEvadeProfile {
  staminaCost: number;
  recoveryMs: number;
  contactGraceMs: number;
  maximumFineCells: number;
  offensiveRecoveryUnlockFraction: number;
}

export const DEFAULT_HORROR_EVADE_PROFILE: Readonly<HorrorEvadeProfile> = {
  staminaCost: 30,
  recoveryMs: 850,
  contactGraceMs: 120,
  maximumFineCells: 2,
  offensiveRecoveryUnlockFraction: 0.5,
};

export const resolveHorrorEvadeDirection = (
  heldDirection: GridCoord | undefined,
  facing: GridCoord,
): HorrorDirection =>
  !isZeroDirection(heldDirection)
    ? normalizeHorrorDirection(heldDirection!)
    : oppositeHorrorDirection(facing);

export const resolveHorrorEvadePath = (
  request: Omit<HorrorMovementPathRequest, "maximumSteps"> & { maximumSteps?: number },
): HorrorMovementPathResolution =>
  resolveHorrorMovementPath({
    ...request,
    maximumSteps: Math.min(2, Math.max(0, request.maximumSteps ?? 2)),
  });

export interface HorrorPlayerCombatState {
  attack: HorrorActionState;
  stamina: HorrorStaminaState;
  evadeRecoveryRemainingMs: number;
  contactGraceRemainingMs: number;
}

export const createHorrorPlayerCombatState = (
  facing: GridCoord = [0, 1],
  staminaRules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorPlayerCombatState => ({
  attack: createIdleHorrorAction(facing),
  stamina: createHorrorStaminaState(staminaRules.maximum, staminaRules),
  evadeRecoveryRemainingMs: 0,
  contactGraceRemainingMs: 0,
});

export type HorrorCommitDenial =
  | "busy"
  | "insufficient_stamina"
  | "evade_recovery"
  | "offensive_commitment";

export interface HorrorPlayerAttackCommit {
  state: HorrorPlayerCombatState;
  committed: boolean;
  deniedBy?: HorrorCommitDenial;
}

export const commitHorrorPlayerAttack = (
  state: HorrorPlayerCombatState,
  direction: GridCoord,
  profile: HorrorActionProfile = DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  staminaCost = 20,
  staminaRules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorPlayerAttackCommit => {
  if (state.attack.phase !== "idle") {
    return { state, committed: false, deniedBy: "busy" };
  }
  if (state.evadeRecoveryRemainingMs > EPSILON) {
    return { state, committed: false, deniedBy: "evade_recovery" };
  }
  const spend = spendHorrorStamina(state.stamina, staminaCost, staminaRules);
  if (!spend.spent) {
    return { state, committed: false, deniedBy: "insufficient_stamina" };
  }
  return {
    committed: true,
    state: {
      ...state,
      attack: commitHorrorAction(profile, direction),
      stamina: spend.state,
    },
  };
};

export interface HorrorPlayerEvadeRequest {
  actorId: string;
  origin: GridCoord;
  facing: GridCoord;
  heldDirection?: GridCoord;
  isBlocked: HorrorCellBlocker;
  occupiedActors?: readonly HorrorOccupiedActor[];
}

export interface HorrorPlayerEvadeCommit extends HorrorMovementPathResolution {
  state: HorrorPlayerCombatState;
  committed: boolean;
  deniedBy?: HorrorCommitDenial;
  direction: HorrorDirection;
}

export const commitHorrorPlayerEvade = (
  state: HorrorPlayerCombatState,
  request: HorrorPlayerEvadeRequest,
  evadeProfile: HorrorEvadeProfile = DEFAULT_HORROR_EVADE_PROFILE,
  attackProfile: HorrorActionProfile = DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  staminaRules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorPlayerEvadeCommit => {
  const direction = resolveHorrorEvadeDirection(request.heldDirection, request.facing);
  const stationary: HorrorMovementPathResolution = {
    end: fineCoord(request.origin[0], request.origin[1]),
    path: [],
    stepsTravelled: 0,
    blocked: false,
  };
  if (state.evadeRecoveryRemainingMs > EPSILON) {
    return { ...stationary, direction, state, committed: false, deniedBy: "evade_recovery" };
  }
  if (state.attack.phase === "windup" || state.attack.phase === "active") {
    return { ...stationary, direction, state, committed: false, deniedBy: "offensive_commitment" };
  }
  if (
    state.attack.phase === "recovery" &&
    horrorActionPhaseProgress(state.attack, attackProfile) + EPSILON <
      evadeProfile.offensiveRecoveryUnlockFraction
  ) {
    return { ...stationary, direction, state, committed: false, deniedBy: "offensive_commitment" };
  }
  const spend = spendHorrorStamina(
    state.stamina,
    evadeProfile.staminaCost,
    staminaRules,
  );
  if (!spend.spent) {
    return { ...stationary, direction, state, committed: false, deniedBy: "insufficient_stamina" };
  }
  const movement = resolveHorrorEvadePath({
    actorId: request.actorId,
    origin: request.origin,
    direction,
    maximumSteps: evadeProfile.maximumFineCells,
    isBlocked: request.isBlocked,
    occupiedActors: request.occupiedActors,
  });
  return {
    ...movement,
    direction,
    committed: true,
    state: {
      ...state,
      // Deliberately preserve the current offensive recovery.
      stamina: spend.state,
      evadeRecoveryRemainingMs: finiteNonNegative(evadeProfile.recoveryMs),
      contactGraceRemainingMs: finiteNonNegative(evadeProfile.contactGraceMs),
    },
  };
};

export interface HorrorPlayerAdvance {
  state: HorrorPlayerCombatState;
  transitions: readonly HorrorPhaseTransition[];
}

export const advanceHorrorPlayerCombat = (
  state: HorrorPlayerCombatState,
  elapsedMs: number,
  attackProfile: HorrorActionProfile = DEFAULT_HORROR_PLAYER_ATTACK_PROFILE,
  staminaRules: HorrorStaminaRules = DEFAULT_HORROR_STAMINA_RULES,
): HorrorPlayerAdvance => {
  const elapsed = finiteNonNegative(elapsedMs);
  const action = advanceHorrorAction(state.attack, elapsed, attackProfile);
  return {
    state: {
      attack: action.state,
      stamina: advanceHorrorStamina(state.stamina, elapsed, staminaRules),
      evadeRecoveryRemainingMs: Math.max(0, state.evadeRecoveryRemainingMs - elapsed),
      contactGraceRemainingMs: Math.max(0, state.contactGraceRemainingMs - elapsed),
    },
    transitions: action.transitions,
  };
};

export interface ParasiteHorrorProfile {
  pursuitIntervalMs: number;
  pursuitStepsPerPulse: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  directionLockFraction: number;
  windupRangeFine: number;
  lungeFineCells: number;
  attackReachFine: number;
  attackHalfAngleDegrees: number;
}

export const DEFAULT_PARASITE_HORROR_PROFILE: Readonly<ParasiteHorrorProfile> = {
  pursuitIntervalMs: 180,
  pursuitStepsPerPulse: 2,
  windupMs: 500,
  activeMs: 120,
  recoveryMs: 850,
  directionLockFraction: 0.6,
  windupRangeFine: FINE_PER_MACRO + 2,
  lungeFineCells: 2,
  attackReachFine: FINE_PER_MACRO,
  attackHalfAngleDegrees: 35,
};

const parasiteActionProfile = (
  profile: ParasiteHorrorProfile,
): HorrorActionProfile => ({
  windupMs: profile.windupMs,
  activeMs: profile.activeMs,
  recoveryMs: profile.recoveryMs,
});

export interface ParasiteHorrorState {
  id: string;
  cell: FineCoord;
  facing: HorrorDirection;
  action: HorrorActionState;
  pursuitAccumulatorMs: number;
  directionLocked: boolean;
  lockedDirection?: HorrorDirection;
  lungeStepsTaken: number;
  lungeBlocked: boolean;
}

export type ParasiteHorrorEvent =
  | { kind: "pursuit_step"; from: FineCoord; to: FineCoord }
  | { kind: "windup_started"; direction: HorrorDirection }
  | { kind: "windup_cancelled" }
  | { kind: "direction_locked"; direction: HorrorDirection }
  | { kind: "active_started" }
  | { kind: "lunge_step"; from: FineCoord; to: FineCoord }
  | { kind: "lunge_blocked"; at: FineCoord }
  | { kind: "attack_hit"; targetId: string }
  | { kind: "attack_missed" }
  | { kind: "recovery_started" }
  | { kind: "recovery_finished" };

export interface ParasiteHorrorContext {
  player: HorrorOccupiedActor;
  /** False before direction lock cancels windup; after lock it cannot cancel. */
  targetTrackable: boolean;
  canPursue?: boolean;
  isBlocked: HorrorCellBlocker;
  occupiedActors?: readonly HorrorOccupiedActor[];
  /** Return an eight-way movement direction; omit to use direct pursuit. */
  choosePursuitDirection?: (
    from: GridCoord,
    target: GridCoord,
  ) => GridCoord | undefined;
}

export interface ParasiteHorrorAdvance {
  state: ParasiteHorrorState;
  events: readonly ParasiteHorrorEvent[];
}

export const createParasiteHorrorState = (
  id: string,
  cell: GridCoord,
  facing: GridCoord = [0, 1],
): ParasiteHorrorState => ({
  id,
  cell: fineCoord(cell[0], cell[1]),
  facing: normalizeHorrorDirection(facing),
  action: createIdleHorrorAction(facing),
  pursuitAccumulatorMs: 0,
  directionLocked: false,
  lungeStepsTaken: 0,
  lungeBlocked: false,
});

const parasiteCanStartWindup = (
  state: ParasiteHorrorState,
  context: ParasiteHorrorContext,
  profile: ParasiteHorrorProfile,
): boolean =>
  context.targetTrackable &&
  distanceBetween(state.cell, context.player.cell) <= profile.windupRangeFine + EPSILON &&
  hasHorrorStructuralLine(state.cell, context.player.cell, context.isBlocked);

const parasiteOccupiedActors = (
  context: ParasiteHorrorContext,
): readonly HorrorOccupiedActor[] => {
  const supplied = context.occupiedActors ?? [];
  return supplied.some((actor) => actor.id === context.player.id)
    ? supplied
    : [...supplied, context.player];
};

/**
 * Advances one Parasite using relative durations. Call it from the fixed-step
 * reducer; pathfinding can be injected while collision and commitment remain
 * authoritative here.
 */
export const advanceParasiteHorror = (
  initialState: ParasiteHorrorState,
  elapsedMs: number,
  context: ParasiteHorrorContext,
  profile: ParasiteHorrorProfile = DEFAULT_PARASITE_HORROR_PROFILE,
): ParasiteHorrorAdvance => {
  let state: ParasiteHorrorState = {
    ...initialState,
    action: { ...initialState.action },
  };
  let remaining = finiteNonNegative(elapsedMs);
  const events: ParasiteHorrorEvent[] = [];
  const actionProfile = parasiteActionProfile(profile);
  const occupants = parasiteOccupiedActors(context);

  for (let guard = 0; remaining > EPSILON && guard < 128; guard += 1) {
    if (state.action.phase === "idle") {
      if (parasiteCanStartWindup(state, context, profile)) {
        const direction = horrorAttackDirectionToward(
          state.cell,
          context.player.cell,
          state.facing,
        );
        state = {
          ...state,
          facing: direction,
          action: commitHorrorAction(actionProfile, direction),
          directionLocked: false,
          lockedDirection: undefined,
          lungeStepsTaken: 0,
          lungeBlocked: false,
        };
        events.push({ kind: "windup_started", direction });
        continue;
      }

      if (context.canPursue === false || !context.targetTrackable) break;
      const interval = Math.max(EPSILON, finiteNonNegative(profile.pursuitIntervalMs));
      const timeToPulse = Math.max(0, interval - state.pursuitAccumulatorMs);
      const slice = Math.min(remaining, timeToPulse);
      state = { ...state, pursuitAccumulatorMs: state.pursuitAccumulatorMs + slice };
      remaining -= slice;
      if (state.pursuitAccumulatorMs + EPSILON < interval) continue;
      state = {
        ...state,
        pursuitAccumulatorMs: Math.max(0, state.pursuitAccumulatorMs - interval),
      };

      const pursuitSteps = Math.max(
        0,
        Math.floor(finiteNonNegative(profile.pursuitStepsPerPulse)),
      );
      for (let step = 0; step < pursuitSteps; step += 1) {
        if (parasiteCanStartWindup(state, context, profile)) break;
        const chosen = context.choosePursuitDirection?.(state.cell, context.player.cell);
        const direction = chosen && !isZeroDirection(chosen)
          ? normalizeHorrorDirection(chosen, state.facing)
          : horrorDirectionToward(state.cell, context.player.cell, state.facing);
        const movement = resolveHorrorMovementPath({
          actorId: state.id,
          origin: state.cell,
          direction,
          maximumSteps: 1,
          isBlocked: context.isBlocked,
          occupiedActors: occupants,
        });
        state = { ...state, facing: direction };
        if (movement.stepsTravelled === 0) break;
        const from = state.cell;
        state = { ...state, cell: movement.end };
        events.push({ kind: "pursuit_step", from, to: movement.end });
      }
      continue;
    }

    if (state.action.phase === "windup") {
      if (!state.directionLocked && !context.targetTrackable) {
        state = {
          ...state,
          action: createIdleHorrorAction(state.facing),
          directionLocked: false,
          lockedDirection: undefined,
        };
        events.push({ kind: "windup_cancelled" });
        continue;
      }

      if (!state.directionLocked) {
        const tracked = horrorAttackDirectionToward(
          state.cell,
          context.player.cell,
          state.facing,
        );
        state = { ...state, facing: tracked, action: { ...state.action, direction: tracked } };
      }
      const lockAt =
        finiteNonNegative(profile.windupMs) *
        Math.min(1, Math.max(0, profile.directionLockFraction));
      const untilLock = state.directionLocked
        ? Number.POSITIVE_INFINITY
        : Math.max(0, lockAt - state.action.phaseElapsedMs);
      if (!state.directionLocked && untilLock <= EPSILON) {
        const lockedDirection = normalizeHorrorDirection(state.action.direction, state.facing);
        state = { ...state, directionLocked: true, lockedDirection };
        events.push({ kind: "direction_locked", direction: lockedDirection });
        continue;
      }

      const slice = Math.min(remaining, state.action.phaseRemainingMs, untilLock);
      const advanced = advanceHorrorAction(state.action, slice, actionProfile);
      state = { ...state, action: advanced.state };
      remaining -= slice;
      if (
        !state.directionLocked &&
        (state.action.phase !== "windup" || state.action.phaseElapsedMs + EPSILON >= lockAt)
      ) {
        const lockedDirection = normalizeHorrorDirection(state.action.direction, state.facing);
        state = {
          ...state,
          directionLocked: true,
          lockedDirection,
          facing: lockedDirection,
          action: { ...state.action, direction: lockedDirection },
        };
        events.push({ kind: "direction_locked", direction: lockedDirection });
      }
      if (advanced.transitions.some((transition) => transition.to === "active")) {
        state = { ...state, lungeStepsTaken: 0, lungeBlocked: false };
        events.push({ kind: "active_started" });
      }
      continue;
    }

    if (state.action.phase === "active") {
      const slice = Math.min(remaining, state.action.phaseRemainingMs);
      const nextActiveElapsed = state.action.phaseElapsedMs + slice;
      const lungeCells = Math.max(0, Math.floor(finiteNonNegative(profile.lungeFineCells)));
      const activeDuration = Math.max(EPSILON, finiteNonNegative(profile.activeMs));
      const lungeSpacing = activeDuration / Math.max(1, lungeCells);
      const desiredLungeSteps = nextActiveElapsed <= EPSILON || lungeCells === 0
        ? 0
        : Math.min(
            lungeCells,
            1 + Math.floor((nextActiveElapsed + EPSILON) / lungeSpacing),
          );
      const lockedDirection = state.lockedDirection ?? state.action.direction;
      while (!state.lungeBlocked && state.lungeStepsTaken < desiredLungeSteps) {
        const movement = resolveHorrorMovementPath({
          actorId: state.id,
          origin: state.cell,
          direction: lockedDirection,
          maximumSteps: 1,
          isBlocked: context.isBlocked,
          occupiedActors: occupants,
        });
        if (movement.stepsTravelled === 0) {
          state = {
            ...state,
            lungeBlocked: true,
            lungeStepsTaken: lungeCells,
          };
          events.push({
            kind: "lunge_blocked",
            at: movement.blockedAt ?? state.cell,
          });
          break;
        }
        const from = state.cell;
        state = {
          ...state,
          cell: movement.end,
          lungeStepsTaken: state.lungeStepsTaken + 1,
        };
        events.push({ kind: "lunge_step", from, to: movement.end });
      }

      const sweep = resolveHorrorSweptMelee({
        origin: state.cell,
        startDirection: lockedDirection,
        endDirection: lockedDirection,
        originFootprintRadiusFine: FINE_HALF_EXTENT,
        reachFine: profile.attackReachFine,
        halfWidthDegrees: profile.attackHalfAngleDegrees,
        targets: [context.player],
        alreadyHitTargetIds: state.action.hitTargetIds,
        isBlocked: context.isBlocked,
      });
      if (sweep.newlyHitTargetIds.length > 0) {
        state = {
          ...state,
          action: recordHorrorActionHits(state.action, sweep.newlyHitTargetIds),
        };
        for (const targetId of sweep.newlyHitTargetIds) {
          events.push({ kind: "attack_hit", targetId });
        }
      }

      const advanced = advanceHorrorAction(state.action, slice, actionProfile);
      const wasHit = state.action.hitTargetIds.length > 0;
      state = { ...state, action: advanced.state };
      remaining -= slice;
      if (advanced.transitions.some((transition) => transition.to === "recovery")) {
        if (!wasHit) events.push({ kind: "attack_missed" });
        events.push({ kind: "recovery_started" });
      }
      continue;
    }

    const slice = Math.min(remaining, state.action.phaseRemainingMs);
    const advanced = advanceHorrorAction(state.action, slice, actionProfile);
    state = { ...state, action: advanced.state };
    remaining -= slice;
    if (advanced.transitions.some((transition) => transition.to === "idle")) {
      state = {
        ...state,
        directionLocked: false,
        lockedDirection: undefined,
        lungeStepsTaken: 0,
        lungeBlocked: false,
      };
      events.push({ kind: "recovery_finished" });
    }
  }

  return { state, events };
};

export const HORROR_FIXED_STEP_MS = 10;

export interface HorrorFixedStepClock {
  stepMs: number;
  accumulatorMs: number;
  tick: number;
}

export interface HorrorFixedStepOptions {
  maximumFrameMs?: number;
  maximumSteps?: number;
}

export interface HorrorFixedStepReduction<State, Event> {
  state: State;
  events?: readonly Event[];
}

export interface HorrorFixedStepAdvance<State, Event> {
  state: State;
  clock: HorrorFixedStepClock;
  events: readonly Event[];
  steps: number;
  droppedMs: number;
}

export const createHorrorFixedStepClock = (
  stepMs = HORROR_FIXED_STEP_MS,
): HorrorFixedStepClock => ({
  stepMs: Math.max(EPSILON, finiteNonNegative(stepMs)),
  accumulatorMs: 0,
  tick: 0,
});

/**
 * Deterministic accumulator for the one realtime scheduler. Normal 20/30/60Hz
 * frames produce the same fixed ticks; large/background frames are bounded.
 */
export const advanceHorrorFixedSteps = <State, Event = never>(
  initialClock: HorrorFixedStepClock,
  initialState: State,
  frameElapsedMs: number,
  reducer: (
    state: State,
    stepMs: number,
    tick: number,
  ) => HorrorFixedStepReduction<State, Event>,
  options: HorrorFixedStepOptions = {},
): HorrorFixedStepAdvance<State, Event> => {
  const stepMs = Math.max(EPSILON, finiteNonNegative(initialClock.stepMs));
  const maximumFrameMs = finiteNonNegative(options.maximumFrameMs ?? 250);
  const maximumSteps = Math.max(
    1,
    Math.floor(finiteNonNegative(options.maximumSteps ?? Math.ceil(maximumFrameMs / stepMs))),
  );
  const suppliedFrame = finiteNonNegative(frameElapsedMs);
  const acceptedFrame = Math.min(suppliedFrame, maximumFrameMs);
  let accumulator = finiteNonNegative(initialClock.accumulatorMs) + acceptedFrame;
  let state = initialState;
  let tick = Math.max(0, Math.floor(initialClock.tick));
  let steps = 0;
  const events: Event[] = [];

  while (accumulator + EPSILON >= stepMs && steps < maximumSteps) {
    const reduction = reducer(state, stepMs, tick + 1);
    state = reduction.state;
    if (reduction.events) events.push(...reduction.events);
    accumulator -= stepMs;
    if (Math.abs(accumulator) <= EPSILON) accumulator = 0;
    tick += 1;
    steps += 1;
  }

  let droppedMs = Math.max(0, suppliedFrame - acceptedFrame);
  if (accumulator + EPSILON >= stepMs) {
    const wholeUnprocessedSteps = Math.floor((accumulator + EPSILON) / stepMs);
    const unprocessed = wholeUnprocessedSteps * stepMs;
    accumulator -= unprocessed;
    droppedMs += unprocessed;
  }

  return {
    state,
    clock: { stepMs, accumulatorMs: Math.max(0, accumulator), tick },
    events,
    steps,
    droppedMs,
  };
};
