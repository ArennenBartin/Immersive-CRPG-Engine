// Pure fixed-shoulder camera math for authored third-person play.
//
// This module deliberately has no React or Three.js dependency. The render
// layer owns structural collision queries and supplies the resulting clearance
// measurements; these helpers own profile selection, state hysteresis, target
// composition, and the single presentation integrator.

export type ThirdPersonCameraProfileName = "explore" | "combat";
export type ThirdPersonSpatialMode = "open" | "corridor" | "wall_backed";
export type ThirdPersonCameraShoulder = 1 | -1;
export type ThirdPersonCameraVec3 = readonly [
  x: number,
  y: number,
  z: number,
];

export interface ThirdPersonCameraProfile {
  /** Horizontal distance behind the subject, in world cells. */
  readonly back: number;
  /** Horizontal distance to the subject's right, in world cells. */
  readonly right: number;
  /** Eye height above the local floor, in world cells. */
  readonly eyeHeight: number;
  /** Horizontal distance that the camera looks ahead of the subject. */
  readonly lookAhead: number;
  /** Base look height above the local floor, in world cells. */
  readonly lookHeight: number;
  /** Perspective field of view, in degrees. */
  readonly fov: number;
}

export const THIRD_PERSON_OPEN_EXPLORE_PROFILE: ThirdPersonCameraProfile = {
  back: 3.65,
  right: 0.65,
  eyeHeight: 1.64,
  lookAhead: 1.3,
  lookHeight: 1.3,
  fov: 58,
};

export const THIRD_PERSON_CORRIDOR_PROFILE: ThirdPersonCameraProfile = {
  back: 2.3,
  right: 0.75,
  eyeHeight: 1.6,
  lookAhead: 1.15,
  lookHeight: 1.28,
  fov: 62,
};

export const THIRD_PERSON_WALL_BACKED_PROFILE: ThirdPersonCameraProfile = {
  back: 0.15,
  right: 0.95,
  eyeHeight: 1.6,
  lookAhead: 1.25,
  lookHeight: 1.3,
  fov: 68,
};

export const THIRD_PERSON_OPEN_COMBAT_PROFILE: ThirdPersonCameraProfile = {
  back: 4.4,
  right: 0.45,
  eyeHeight: 2.35,
  lookAhead: 1.4,
  lookHeight: 0.65,
  fov: 58,
};

// Combat keeps its deliberate elevated composition in a corridor, but uses
// the corridor's safe boom and shoulder dimensions. The shallower elevation
// remains a behind-the-actor view rather than becoming an overhead fallback.
export const THIRD_PERSON_CORRIDOR_COMBAT_PROFILE: ThirdPersonCameraProfile = {
  ...THIRD_PERSON_CORRIDOR_PROFILE,
  eyeHeight: 1.95,
  lookAhead: 1.25,
  lookHeight: 1.05,
};

// Geometry wins at a wall. There is no elevated wall-backed combat variant,
// because lifting this very short boom would turn it into an overhead camera.
export const THIRD_PERSON_WALL_BACKED_COMBAT_PROFILE =
  THIRD_PERSON_WALL_BACKED_PROFILE;

export const THIRD_PERSON_CAMERA_PROFILES: Readonly<
  Record<
    ThirdPersonCameraProfileName,
    Readonly<Record<ThirdPersonSpatialMode, ThirdPersonCameraProfile>>
  >
> = {
  explore: {
    open: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    corridor: THIRD_PERSON_CORRIDOR_PROFILE,
    wall_backed: THIRD_PERSON_WALL_BACKED_PROFILE,
  },
  combat: {
    open: THIRD_PERSON_OPEN_COMBAT_PROFILE,
    corridor: THIRD_PERSON_CORRIDOR_COMBAT_PROFILE,
    wall_backed: THIRD_PERSON_WALL_BACKED_COMBAT_PROFILE,
  },
};

export const resolveThirdPersonCameraProfile = (
  profileName: ThirdPersonCameraProfileName,
  spatialMode: ThirdPersonSpatialMode,
): ThirdPersonCameraProfile =>
  THIRD_PERSON_CAMERA_PROFILES[profileName][spatialMode];

export const THIRD_PERSON_SHOULDER_FALLBACK_ADVANTAGE = 0.25;
export const THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS = 250;
export const THIRD_PERSON_SHOULDER_MIN_HOLD_MS = 900;
export const THIRD_PERSON_SHOULDER_RETURN_ADVANTAGE = 0.45;
export const THIRD_PERSON_SHOULDER_RETURN_SWITCH_MS = 700;

export interface ThirdPersonShoulderSelectionState {
  readonly shoulder: ThirdPersonCameraShoulder;
  readonly challenger: ThirdPersonCameraShoulder | null;
  readonly challengerMs: number;
  readonly holdRemainingMs: number;
}

export interface ThirdPersonShoulderSelectionMeasurements {
  readonly rightClearance: number;
  readonly leftClearance: number;
  readonly rightValid: boolean;
  readonly leftValid: boolean;
  readonly spatialMode: ThirdPersonSpatialMode;
}

export const createThirdPersonShoulderSelectionState = (
  shoulder: ThirdPersonCameraShoulder = 1,
): ThirdPersonShoulderSelectionState => ({
  shoulder: shoulder === -1 ? -1 : 1,
  challenger: null,
  challengerMs: 0,
  holdRemainingMs: 0,
});

/**
 * Advances the discrete, latched shoulder choice.
 *
 * Invalid current poses may always escape to a valid opposite side after the
 * short fallback delay, including during a hold. Preference-only changes must
 * respect the hold. A wall-backed shot never swaps merely for an advantage;
 * it keeps its established side until that side is actually invalid.
 */
export const advanceThirdPersonShoulderSelection = (
  state: ThirdPersonShoulderSelectionState,
  measurements: ThirdPersonShoulderSelectionMeasurements,
  deltaMs: number,
): ThirdPersonShoulderSelectionState => {
  const safeDeltaMs =
    Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const shoulder: ThirdPersonCameraShoulder =
    state.shoulder === -1 ? -1 : 1;
  const rightClearance = Number.isFinite(measurements.rightClearance)
    ? Math.max(0, measurements.rightClearance)
    : 0;
  const leftClearance = Number.isFinite(measurements.leftClearance)
    ? Math.max(0, measurements.leftClearance)
    : 0;
  const rightValid = measurements.rightValid === true;
  const leftValid = measurements.leftValid === true;
  const currentValid = shoulder === 1 ? rightValid : leftValid;
  const oppositeValid = shoulder === 1 ? leftValid : rightValid;
  const opposite: ThirdPersonCameraShoulder = shoulder === 1 ? -1 : 1;
  const previousHold = Number.isFinite(state.holdRemainingMs)
    ? Math.max(0, state.holdRemainingMs)
    : 0;
  const holdRemainingMs = Math.max(0, previousHold - safeDeltaMs);
  let challenger: ThirdPersonCameraShoulder | null = null;
  let requiredMs = 0;
  let challengerDeltaMs = safeDeltaMs;

  if (!currentValid && oppositeValid) {
    challenger = opposite;
    requiredMs = THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS;
  } else if (
    holdRemainingMs === 0 &&
    measurements.spatialMode !== "wall_backed"
  ) {
    if (
      shoulder === 1 &&
      leftValid &&
      rightValid &&
      leftClearance >=
        rightClearance + THIRD_PERSON_SHOULDER_FALLBACK_ADVANTAGE
    ) {
      challenger = -1;
      requiredMs = THIRD_PERSON_SHOULDER_FALLBACK_SWITCH_MS;
      challengerDeltaMs = Math.max(0, safeDeltaMs - previousHold);
    } else if (
      shoulder === -1 &&
      rightValid &&
      leftValid &&
      rightClearance >=
        leftClearance + THIRD_PERSON_SHOULDER_RETURN_ADVANTAGE
    ) {
      challenger = 1;
      requiredMs = THIRD_PERSON_SHOULDER_RETURN_SWITCH_MS;
      challengerDeltaMs = Math.max(0, safeDeltaMs - previousHold);
    }
  }

  const previousChallengerMs = Number.isFinite(state.challengerMs)
    ? Math.max(0, state.challengerMs)
    : 0;
  const challengerMs =
    challenger === null
      ? 0
      : state.challenger === challenger
        ? previousChallengerMs + challengerDeltaMs
        : challengerDeltaMs;

  if (
    challenger !== null &&
    requiredMs > 0 &&
    challengerMs >= requiredMs
  ) {
    return {
      shoulder: challenger,
      challenger: null,
      challengerMs: 0,
      holdRemainingMs: THIRD_PERSON_SHOULDER_MIN_HOLD_MS,
    };
  }

  return {
    shoulder,
    challenger,
    challengerMs,
    holdRemainingMs,
  };
};

export const THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE = 2.65;
export const THIRD_PERSON_CORRIDOR_EXIT_CLEARANCE = 3.25;
export const THIRD_PERSON_CORRIDOR_ENTER_MS = 180;
export const THIRD_PERSON_CORRIDOR_EXIT_MS = 600;
export const THIRD_PERSON_WALL_ENTER_CLEARANCE = 0.75;
export const THIRD_PERSON_WALL_EXIT_CLEARANCE = 1.25;
export const THIRD_PERSON_WALL_ENTER_MS = 120;
export const THIRD_PERSON_WALL_EXIT_MS = 500;

export interface ThirdPersonSpatialState {
  readonly mode: ThirdPersonSpatialMode;
  readonly corridorEnterMs: number;
  readonly corridorExitMs: number;
  readonly wallEnterMs: number;
  readonly wallExitMs: number;
}

export interface ThirdPersonSpatialMeasurements {
  /** Collision-padded clearance along the fixed-right open boom. */
  readonly boomClearance: number;
  /** Collision-padded clearance directly behind the authoritative subject. */
  readonly rearClearance: number;
  /** Whether the corridor pose remains outside Steve's exclusion capsule. */
  readonly corridorClearsSteve: boolean;
}

export const createThirdPersonSpatialState = (
  mode: ThirdPersonSpatialMode = "open",
): ThirdPersonSpatialState => ({
  mode,
  corridorEnterMs: 0,
  corridorExitMs: 0,
  wallEnterMs: 0,
  wallExitMs: 0,
});

const safeClearance = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : Number.POSITIVE_INFINITY;

const accumulatedMs = (
  previousMs: number,
  condition: boolean,
  deltaMs: number,
): number =>
  condition
    ? (Number.isFinite(previousMs) ? Math.max(0, previousMs) : 0) + deltaMs
    : 0;

/**
 * Advances the latched open/corridor/wall-backed state.
 *
 * Wall-backed conditions have priority over corridor conditions. Timers are
 * retained across the wall-backed state, allowing a genuinely open area to
 * return directly to `open` once both wall and corridor exit hysteresis have
 * elapsed.
 */
export const advanceThirdPersonSpatialState = (
  state: ThirdPersonSpatialState,
  measurements: ThirdPersonSpatialMeasurements,
  deltaMs: number,
): ThirdPersonSpatialState => {
  const safeDeltaMs =
    Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const boomClearance = safeClearance(measurements.boomClearance);
  const rearClearance = safeClearance(measurements.rearClearance);
  const corridorSafe = measurements.corridorClearsSteve === true;

  let corridorEnterMs = accumulatedMs(
    state.corridorEnterMs,
    boomClearance < THIRD_PERSON_CORRIDOR_ENTER_CLEARANCE,
    safeDeltaMs,
  );
  let corridorExitMs = accumulatedMs(
    state.corridorExitMs,
    boomClearance >= THIRD_PERSON_CORRIDOR_EXIT_CLEARANCE,
    safeDeltaMs,
  );
  let wallEnterMs = accumulatedMs(
    state.wallEnterMs,
    rearClearance < THIRD_PERSON_WALL_ENTER_CLEARANCE || !corridorSafe,
    safeDeltaMs,
  );
  let wallExitMs = accumulatedMs(
    state.wallExitMs,
    rearClearance >= THIRD_PERSON_WALL_EXIT_CLEARANCE && corridorSafe,
    safeDeltaMs,
  );
  let mode = state.mode;

  if (mode === "wall_backed") {
    wallEnterMs = 0;
    if (wallExitMs >= THIRD_PERSON_WALL_EXIT_MS) {
      mode =
        corridorExitMs >= THIRD_PERSON_CORRIDOR_EXIT_MS
          ? "open"
          : "corridor";
      wallExitMs = 0;
      if (mode === "open") corridorExitMs = 0;
    }
  } else if (wallEnterMs >= THIRD_PERSON_WALL_ENTER_MS) {
    mode = "wall_backed";
    wallEnterMs = 0;
    wallExitMs = 0;
  } else if (
    mode === "open" &&
    corridorEnterMs >= THIRD_PERSON_CORRIDOR_ENTER_MS
  ) {
    mode = "corridor";
    corridorEnterMs = 0;
    corridorExitMs = 0;
  } else if (
    mode === "corridor" &&
    corridorExitMs >= THIRD_PERSON_CORRIDOR_EXIT_MS
  ) {
    mode = "open";
    corridorEnterMs = 0;
    corridorExitMs = 0;
  }

  return {
    mode,
    corridorEnterMs,
    corridorExitMs,
    wallEnterMs,
    wallExitMs,
  };
};

const TWO_PI = Math.PI * 2;
const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR = 2.59;
export const THIRD_PERSON_OPEN_PEEK_YAW_LIMIT = degreesToRadians(32);
export const THIRD_PERSON_CORRIDOR_PEEK_YAW_LIMIT = degreesToRadians(22);
export const THIRD_PERSON_WALL_BACKED_PEEK_YAW_LIMIT =
  degreesToRadians(10);
export const THIRD_PERSON_MIN_PEEK_PITCH = degreesToRadians(-14);
export const THIRD_PERSON_MAX_PEEK_PITCH = degreesToRadians(20);

export const clampThirdPersonCameraValue = (
  value: number,
  minimum: number,
  maximum: number,
): number => {
  const safeMinimum = Number.isFinite(minimum) ? minimum : 0;
  const safeMaximum = Number.isFinite(maximum) ? maximum : safeMinimum;
  const low = Math.min(safeMinimum, safeMaximum);
  const high = Math.max(safeMinimum, safeMaximum);
  const safeValue = Number.isFinite(value) ? value : low;
  return Math.max(low, Math.min(high, safeValue));
};

export const wrapThirdPersonCameraYaw = (yaw: number): number => {
  if (!Number.isFinite(yaw)) return 0;
  const wrapped = ((yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
};

export interface ThirdPersonPeek {
  readonly yawOffset: number;
  readonly pitchOffset: number;
}

export const clampThirdPersonPeek = (
  spatialMode: ThirdPersonSpatialMode,
  yawOffset: number,
  pitchOffset: number,
): ThirdPersonPeek => {
  const yawLimit =
    spatialMode === "wall_backed"
      ? THIRD_PERSON_WALL_BACKED_PEEK_YAW_LIMIT
      : spatialMode === "corridor"
        ? THIRD_PERSON_CORRIDOR_PEEK_YAW_LIMIT
        : THIRD_PERSON_OPEN_PEEK_YAW_LIMIT;
  return {
    yawOffset: clampThirdPersonCameraValue(
      yawOffset,
      -yawLimit,
      yawLimit,
    ),
    pitchOffset: clampThirdPersonCameraValue(
      pitchOffset,
      THIRD_PERSON_MIN_PEEK_PITCH,
      THIRD_PERSON_MAX_PEEK_PITCH,
    ),
  };
};

export interface ResolveThirdPersonTargetPoseInput {
  /** Authoritative render position; X/Z are the subject anchor. */
  readonly subject: ThirdPersonCameraVec3;
  /** Engine yaw convention: forward is (sin(yaw), 0, cos(yaw)). */
  readonly facingYaw: number;
  readonly cameraProfile: ThirdPersonCameraProfile;
  readonly spatialMode: ThirdPersonSpatialMode;
  /** Presentation-only look offset; it never moves the physical eye. */
  readonly yawOffset?: number;
  /** Presentation-only pitch offset; positive values look upward. */
  readonly pitchOffset?: number;
  /** Local floor height. Defaults to the authoritative subject Y. */
  readonly floorY?: number;
  /**
   * Collision may reduce the authored shoulder offset toward center.
   * Values are clamped to 0..1; `shoulder` selects its signed side.
   */
  readonly rightOffsetScale?: number;
  /** Right by default; -1 permits an explicitly selected left fallback. */
  readonly shoulder?: ThirdPersonCameraShoulder;
  /**
   * Optional continuous presentation blend used while gliding between the
   * selected shoulders. Defaults to `shoulder` and clamps to -1..1.
   */
  readonly shoulderBlend?: number;
}

export interface ThirdPersonTargetPose {
  readonly eye: ThirdPersonCameraVec3;
  readonly look: ThirdPersonCameraVec3;
  readonly fov: number;
  readonly tetherYaw: number;
  readonly lookYaw: number;
  readonly yawOffset: number;
  readonly pitchOffset: number;
  readonly shoulder: ThirdPersonCameraShoulder;
  readonly shoulderBlend: number;
  /** Signed lateral offset: positive is right and negative is left. */
  readonly rightOffset: number;
}

/**
 * Resolves a fixed-shoulder camera pose.
 *
 * The eye uses only the authoritative tether yaw. Manual yaw and pitch alter
 * the look vector, so right-drag/touch peeking cannot orbit the camera into a
 * wall or change the subject's simulation-facing direction.
 */
export const resolveThirdPersonTargetPose = (
  input: ResolveThirdPersonTargetPoseInput,
): ThirdPersonTargetPose => {
  const subjectX = Number.isFinite(input.subject[0]) ? input.subject[0] : 0;
  const subjectY = Number.isFinite(input.subject[1]) ? input.subject[1] : 0;
  const subjectZ = Number.isFinite(input.subject[2]) ? input.subject[2] : 0;
  const floorY = Number.isFinite(input.floorY)
    ? (input.floorY as number)
    : subjectY;
  const tetherYaw = wrapThirdPersonCameraYaw(input.facingYaw);
  const peek = clampThirdPersonPeek(
    input.spatialMode,
    input.yawOffset ?? 0,
    input.pitchOffset ?? 0,
  );
  const lookYaw = wrapThirdPersonCameraYaw(
    tetherYaw + peek.yawOffset,
  );
  const rightScale = clampThirdPersonCameraValue(
    input.rightOffsetScale ?? 1,
    0,
    1,
  );
  const shoulder: ThirdPersonCameraShoulder =
    input.shoulder === -1 ? -1 : 1;
  const shoulderBlend = clampThirdPersonCameraValue(
    input.shoulderBlend ?? shoulder,
    -1,
    1,
  );
  const rightOffset =
    Math.max(0, input.cameraProfile.right) * rightScale * shoulderBlend;
  const back = Math.max(0, input.cameraProfile.back);

  const forwardX = Math.sin(tetherYaw);
  const forwardZ = Math.cos(tetherYaw);
  const rightX = Math.cos(tetherYaw);
  const rightZ = -Math.sin(tetherYaw);
  const eyeY = Math.min(
    floorY + THIRD_PERSON_MAX_EYE_HEIGHT_ABOVE_FLOOR,
    floorY + Math.max(0, input.cameraProfile.eyeHeight),
  );

  const lookDistance = Math.max(0, input.cameraProfile.lookAhead);
  const horizontalLookDistance =
    Math.cos(peek.pitchOffset) * lookDistance;
  const lookY =
    floorY +
    input.cameraProfile.lookHeight +
    Math.sin(peek.pitchOffset) * lookDistance;

  return {
    eye: [
      subjectX - forwardX * back + rightX * rightOffset,
      eyeY,
      subjectZ - forwardZ * back + rightZ * rightOffset,
    ],
    look: [
      subjectX + Math.sin(lookYaw) * horizontalLookDistance,
      lookY,
      subjectZ + Math.cos(lookYaw) * horizontalLookDistance,
    ],
    fov: input.cameraProfile.fov,
    tetherYaw,
    lookYaw,
    yawOffset: peek.yawOffset,
    pitchOffset: peek.pitchOffset,
    shoulder,
    shoulderBlend,
    rightOffset,
  };
};

export const THIRD_PERSON_SUBJECT_DAMPING = 12;
// Second smoothing stage for the subject. Authoritative movement arrives as
// discrete fine-cell steps (a ~5.5 Hz staircase while a key is held); one
// exponential stage follows that staircase with a strong velocity ripple.
// Cascading two stages keeps the camera's speed nearly constant between steps.
export const THIRD_PERSON_SUBJECT_GLIDE_DAMPING = 14;
// Emergency catch-up only. This must stay comfortably above one diagonal fine
// step (sqrt(2)/3 ~= 0.47 cells): clamping below the step size converts every
// held-key step into an instantaneous camera jump, which reads as constant
// stutter. Genuine teleports snap through the rig's snap path instead.
export const THIRD_PERSON_SUBJECT_MAX_LAG = 0.75;
export const THIRD_PERSON_TETHER_YAW_DAMPING = 8;
export const THIRD_PERSON_LOOK_DAMPING = 10;
export const THIRD_PERSON_PROFILE_DAMPING = 5.5;
export const THIRD_PERSON_MAX_TETHER_YAW_RATE = Math.PI;

export interface ThirdPersonCameraStepState {
  readonly subject: ThirdPersonCameraVec3;
  /** First-stage smoothed subject; `subject` damps toward this stage. */
  readonly subjectGlide: ThirdPersonCameraVec3;
  readonly tetherYaw: number;
  readonly cameraProfile: ThirdPersonCameraProfile;
  readonly eye: ThirdPersonCameraVec3;
  readonly look: ThirdPersonCameraVec3;
  readonly fov: number;
}

export interface ThirdPersonCameraStepInput
  extends Omit<
    ResolveThirdPersonTargetPoseInput,
    "subject" | "facingYaw" | "cameraProfile"
  > {
  readonly subject: ThirdPersonCameraVec3;
  readonly facingYaw: number;
  readonly cameraProfile: ThirdPersonCameraProfile;
  /** Mounts, map changes, ownership transfers, and teleports may snap. */
  readonly snap?: boolean;
}

const dampingAlpha = (damping: number, deltaSeconds: number): number =>
  1 - Math.exp(-Math.max(0, damping) * Math.max(0, deltaSeconds));

const dampScalar = (
  current: number,
  target: number,
  damping: number,
  deltaSeconds: number,
): number =>
  current + (target - current) * dampingAlpha(damping, deltaSeconds);

const dampVec3 = (
  current: ThirdPersonCameraVec3,
  target: ThirdPersonCameraVec3,
  damping: number,
  deltaSeconds: number,
): ThirdPersonCameraVec3 => [
  dampScalar(current[0], target[0], damping, deltaSeconds),
  dampScalar(current[1], target[1], damping, deltaSeconds),
  dampScalar(current[2], target[2], damping, deltaSeconds),
];

const constrainSubjectLag = (
  subject: ThirdPersonCameraVec3,
  target: ThirdPersonCameraVec3,
): ThirdPersonCameraVec3 => {
  const dx = subject[0] - target[0];
  const dy = subject[1] - target[1];
  const dz = subject[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= THIRD_PERSON_SUBJECT_MAX_LAG || distance === 0) {
    return subject;
  }
  const scale = THIRD_PERSON_SUBJECT_MAX_LAG / distance;
  return [
    target[0] + dx * scale,
    target[1] + dy * scale,
    target[2] + dz * scale,
  ];
};

const dampProfile = (
  current: ThirdPersonCameraProfile,
  target: ThirdPersonCameraProfile,
  deltaSeconds: number,
): ThirdPersonCameraProfile => ({
  back: dampScalar(
    current.back,
    target.back,
    THIRD_PERSON_PROFILE_DAMPING,
    deltaSeconds,
  ),
  right: Math.max(
    0,
    dampScalar(
      current.right,
      target.right,
      THIRD_PERSON_PROFILE_DAMPING,
      deltaSeconds,
    ),
  ),
  eyeHeight: dampScalar(
    current.eyeHeight,
    target.eyeHeight,
    THIRD_PERSON_PROFILE_DAMPING,
    deltaSeconds,
  ),
  lookAhead: dampScalar(
    current.lookAhead,
    target.lookAhead,
    THIRD_PERSON_PROFILE_DAMPING,
    deltaSeconds,
  ),
  lookHeight: dampScalar(
    current.lookHeight,
    target.lookHeight,
    THIRD_PERSON_PROFILE_DAMPING,
    deltaSeconds,
  ),
  fov: dampScalar(
    current.fov,
    target.fov,
    THIRD_PERSON_PROFILE_DAMPING,
    deltaSeconds,
  ),
});

const stepTetherYaw = (
  currentYaw: number,
  targetYaw: number,
  deltaSeconds: number,
): number => {
  const angularDifference = wrapThirdPersonCameraYaw(targetYaw - currentYaw);
  const dampedStep =
    angularDifference *
    dampingAlpha(THIRD_PERSON_TETHER_YAW_DAMPING, deltaSeconds);
  const maximumStep =
    THIRD_PERSON_MAX_TETHER_YAW_RATE * Math.max(0, deltaSeconds);
  return wrapThirdPersonCameraYaw(
    currentYaw +
      clampThirdPersonCameraValue(
        dampedStep,
        -maximumStep,
        maximumStep,
      ),
  );
};

export const createThirdPersonCameraStepState = (
  input: ThirdPersonCameraStepInput,
): ThirdPersonCameraStepState => {
  const pose = resolveThirdPersonTargetPose(input);
  return {
    subject: [...input.subject],
    subjectGlide: [...input.subject],
    tetherYaw: pose.tetherYaw,
    cameraProfile: { ...input.cameraProfile },
    eye: pose.eye,
    look: pose.look,
    fov: pose.fov,
  };
};

/**
 * Advances the presentation with one integrator and no Cartesian eye damper.
 *
 * The subject, tether yaw, and profile scalars produce the eye directly. Only
 * the look point has its own damping channel. This prevents the stacked
 * follow/path/position damping that previously let the camera drag behind and
 * oscillate at corners.
 */
export const stepThirdPersonCamera = (
  state: ThirdPersonCameraStepState,
  input: ThirdPersonCameraStepInput,
  deltaSeconds: number,
): ThirdPersonCameraStepState => {
  const safeDelta =
    Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  if (input.snap) return createThirdPersonCameraStepState(input);

  const targetSubject: ThirdPersonCameraVec3 = [
    Number.isFinite(input.subject[0]) ? input.subject[0] : state.subject[0],
    Number.isFinite(input.subject[1]) ? input.subject[1] : state.subject[1],
    Number.isFinite(input.subject[2]) ? input.subject[2] : state.subject[2],
  ];
  const subjectGlide = dampVec3(
    state.subjectGlide ?? state.subject,
    targetSubject,
    THIRD_PERSON_SUBJECT_GLIDE_DAMPING,
    safeDelta,
  );
  const dampedSubject = constrainSubjectLag(
    dampVec3(
      state.subject,
      subjectGlide,
      THIRD_PERSON_SUBJECT_DAMPING,
      safeDelta,
    ),
    targetSubject,
  );
  const tetherYaw = stepTetherYaw(
    state.tetherYaw,
    input.facingYaw,
    safeDelta,
  );
  const cameraProfile = dampProfile(
    state.cameraProfile,
    input.cameraProfile,
    safeDelta,
  );
  const rawPose = resolveThirdPersonTargetPose({
    ...input,
    subject: dampedSubject,
    facingYaw: tetherYaw,
    floorY: input.floorY ?? targetSubject[1],
    cameraProfile,
  });
  const look = dampVec3(
    state.look,
    rawPose.look,
    THIRD_PERSON_LOOK_DAMPING,
    safeDelta,
  );

  return {
    subject: dampedSubject,
    subjectGlide,
    tetherYaw,
    cameraProfile,
    eye: rawPose.eye,
    look,
    fov: cameraProfile.fov,
  };
};
