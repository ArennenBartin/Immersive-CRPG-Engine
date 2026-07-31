// Locked third-person crawler support for the fine ("micro") grid.
//
// Third person is an authored presentation mode, not a new simulation mode.
// It keeps the existing movement legality, AP/energy use, combat, LOS,
// perception, stealth, and hearing rules. Unlike authored first person, the
// chase camera stays active for exploration, tactical, and story camera
// states. Input is deliberately strict tank control: W/S move along the
// authoritative eight-way facing, A/D turn that facing by 45 degrees, Q/E
// adjust presentation-only pitch, and no modifier enables strafing.

import {
  FIRST_PERSON_FACING_RING,
  normalizeFirstPersonFacing,
  rotateFacing45,
  type AuthoredViewMode,
} from "./firstPersonControls";

export type ThirdPersonCameraMode = "explore" | "tactical" | "story";

// The locked chase camera never yields to tactical or story profiles. Keeping
// cameraMode in the helper's contract makes that invariant explicit at every
// existing camera-mode call site.
export const isThirdPersonCameraActive = (
  viewMode: AuthoredViewMode,
  cameraMode: ThirdPersonCameraMode,
): boolean => {
  void cameraMode;
  return viewMode === "third_person";
};

// Reuse the authoritative first-person eight-way ring so saves, simulation,
// model facing, perception cones, and both immersive cameras agree exactly.
export const THIRD_PERSON_FACING_RING = FIRST_PERSON_FACING_RING;
export const normalizeThirdPersonFacing = normalizeFirstPersonFacing;
export const rotateThirdPersonFacing45 = rotateFacing45;

export interface HeldThirdPersonIntent {
  /** +1 step toward facing, -1 backstep, 0 none. */
  forward: number;
  /** +1 turn clockwise/right, -1 counterclockwise/left, 0 none. */
  turn: number;
  /**
   * Presentation-only pitch pressure: +1 raises the view, -1 lowers it.
   * This never changes LOS, visibility, perception, or authoritative facing.
   */
  pitch: number;
  wait: boolean;
}

// Arrow keys mirror WASD so the existing virtual joystick can drive tank
// controls without a touch-only movement path. Shift is intentionally ignored:
// third-person tank movement never exposes a strafe command.
export const resolveHeldThirdPersonIntent = (
  heldKeys: ReadonlySet<string>,
  consumedKeys: ReadonlySet<string>,
): HeldThirdPersonIntent => {
  const held = (key: string) => heldKeys.has(key) && !consumedKeys.has(key);
  let forward = 0;
  let turn = 0;
  let pitch = 0;
  if (held("arrowup") || held("w")) forward += 1;
  if (held("arrowdown") || held("s")) forward -= 1;
  if (held("arrowleft") || held("a")) turn -= 1;
  if (held("arrowright") || held("d")) turn += 1;
  if (held("q")) pitch += 1;
  if (held("e")) pitch -= 1;
  return {
    forward,
    turn,
    pitch,
    wait: held("z") || held("."),
  };
};

const NO_CONSUMED_LIVE_THIRD_PERSON_KEYS: ReadonlySet<string> = new Set();

export const resolveLiveHeldThirdPersonIntent = (
  heldKeys: ReadonlySet<string>,
): HeldThirdPersonIntent =>
  resolveHeldThirdPersonIntent(
    heldKeys,
    NO_CONSUMED_LIVE_THIRD_PERSON_KEYS,
  );

// Tank motion only has a longitudinal component. A diagonal facing still
// advances by one fine cell on each axis, matching the engine's existing
// eight-way grid movement.
export const thirdPersonStepVector = (
  facing: readonly [number, number],
  forward: number,
): [number, number] => {
  const normalized = normalizeThirdPersonFacing(facing);
  const pressure = Number.isFinite(forward)
    ? Math.max(-1, Math.min(1, forward))
    : 0;
  const canonicalCell = (value: number) => (value === 0 ? 0 : value);
  return [
    canonicalCell(normalized[0] * pressure),
    canonicalCell(normalized[1] * pressure),
  ];
};

const TWO_PI = Math.PI * 2;
const EIGHTH_TURN = Math.PI / 4;

export const wrapThirdPersonYaw = (yaw: number): number => {
  if (!Number.isFinite(yaw)) return Math.PI;
  const wrapped = ((yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  // Preserve the north-facing positive-PI convention used by atan2(0, -1).
  return wrapped === -Math.PI ? Math.PI : wrapped;
};

// Engine yaw convention: a forward vector is (sin(yaw), cos(yaw)).
// Consequently [0, -1] (north) is PI and [0, 1] (south) is zero.
export const facingToThirdPersonYaw = (
  facing: readonly [number, number],
): number => {
  const normalized = normalizeThirdPersonFacing(facing);
  return Math.atan2(normalized[0], normalized[1]);
};

// Continuous camera/drag yaw becomes authoritative only through this
// quantizer. It returns one of the exact saved/perception facing vectors and
// therefore cannot leak arbitrary camera angles into grid simulation.
export const quantizeYawToFacing = (yaw: number): [number, number] => {
  const wrapped = wrapThirdPersonYaw(yaw);
  const yawStep = Math.round(wrapped / EIGHTH_TURN);
  const ringIndex = ((4 - yawStep) % 8 + 8) % 8;
  const facing = THIRD_PERSON_FACING_RING[ringIndex];
  return [facing[0], facing[1]];
};

// When a wall shortens the chase boom, the lens tucks in close behind Steve
// instead of swinging sideways. Fading his material out over this range keeps
// the forward view readable while the camera is that close.
export const THIRD_PERSON_PLAYER_FADE_START_DISTANCE = 0.95;
export const THIRD_PERSON_PLAYER_FADE_END_DISTANCE = 0.3;
export const THIRD_PERSON_PLAYER_MIN_OPACITY = 0.08;

export const resolveThirdPersonCameraBodyDistance = (
  camera: readonly [number, number, number],
  subject: readonly [number, number, number],
  bodyHeight: number,
): number => {
  if (
    !camera.every(Number.isFinite) ||
    !subject.every(Number.isFinite) ||
    !Number.isFinite(bodyHeight)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const safeHeight = Math.max(0, bodyHeight);
  const closestY = Math.max(
    subject[1],
    Math.min(subject[1] + safeHeight, camera[1]),
  );
  return Math.hypot(
    camera[0] - subject[0],
    camera[1] - closestY,
    camera[2] - subject[2],
  );
};

export const resolveThirdPersonPlayerCameraOpacity = (
  cameraBodyDistance: number,
): number => {
  if (!Number.isFinite(cameraBodyDistance)) return 1;
  const normalized = Math.max(
    0,
    Math.min(
      1,
      (cameraBodyDistance - THIRD_PERSON_PLAYER_FADE_END_DISTANCE) /
        (THIRD_PERSON_PLAYER_FADE_START_DISTANCE -
          THIRD_PERSON_PLAYER_FADE_END_DISTANCE),
    ),
  );
  const eased = normalized * normalized * (3 - 2 * normalized);
  return (
    THIRD_PERSON_PLAYER_MIN_OPACITY +
    (1 - THIRD_PERSON_PLAYER_MIN_OPACITY) * eased
  );
};

// Chase-camera collision follows visual structure, not pathfinding. A flat
// non-walkable floor cell (pit, liquid, void, hazard) must not become an
// invisible wall merely because actors cannot stand on it.
export const isThirdPersonStructuralCameraCell = (
  blocksLineOfSight: boolean,
  visualHeight: number,
): boolean =>
  blocksLineOfSight ||
  (Number.isFinite(visualHeight) && visualHeight >= 1);

// Right-drag deltas are measured in CSS pixels. Dragging right turns right
// (decreasing yaw in the engine convention); dragging upward raises pitch.
export const THIRD_PERSON_YAW_DRAG_SENSITIVITY = 0.0045;
export const THIRD_PERSON_PITCH_DRAG_SENSITIVITY = 0.0035;
export const THIRD_PERSON_TOUCH_YAW_SENSITIVITY = 0.0055;
export const THIRD_PERSON_TOUCH_PITCH_SENSITIVITY = 0.0045;

// Pitch is presentation-only and intentionally stops short of vertical so a
// locked camera cannot invert or become an accidental overhead tactical view.
export const THIRD_PERSON_MIN_PITCH_RADIANS = (-14 * Math.PI) / 180;
export const THIRD_PERSON_MAX_PITCH_RADIANS = (20 * Math.PI) / 180;
export const THIRD_PERSON_MAX_YAW_OFFSET_RADIANS = (32 * Math.PI) / 180;
export const THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND =
  (42 * Math.PI) / 180;

export const clampThirdPersonYawOffset = (yawOffset: number): number => {
  if (!Number.isFinite(yawOffset)) return 0;
  return Math.max(
    -THIRD_PERSON_MAX_YAW_OFFSET_RADIANS,
    Math.min(THIRD_PERSON_MAX_YAW_OFFSET_RADIANS, yawOffset),
  );
};

export const clampThirdPersonPitch = (pitch: number): number => {
  if (!Number.isFinite(pitch)) return 0;
  return Math.max(
    THIRD_PERSON_MIN_PITCH_RADIANS,
    Math.min(THIRD_PERSON_MAX_PITCH_RADIANS, pitch),
  );
};

export interface ThirdPersonLookState {
  yawOffset: number;
  pitch: number;
}

// Pure presentation-only right-drag resolver shared by mouse and touch look
// input. The returned yaw is a bounded offset from authoritative actor facing;
// it must never be persisted as actor facing or simulation state.
export const applyThirdPersonLookDelta = (
  yawOffset: number,
  pitch: number,
  deltaX: number,
  deltaY: number,
  yawSensitivity = THIRD_PERSON_YAW_DRAG_SENSITIVITY,
  pitchSensitivity = THIRD_PERSON_PITCH_DRAG_SENSITIVITY,
): ThirdPersonLookState => {
  const safeDeltaX = Number.isFinite(deltaX) ? deltaX : 0;
  const safeDeltaY = Number.isFinite(deltaY) ? deltaY : 0;
  const safeYawSensitivity = Number.isFinite(yawSensitivity)
    ? Math.max(0, yawSensitivity)
    : THIRD_PERSON_YAW_DRAG_SENSITIVITY;
  const safePitchSensitivity = Number.isFinite(pitchSensitivity)
    ? Math.max(0, pitchSensitivity)
    : THIRD_PERSON_PITCH_DRAG_SENSITIVITY;
  const nextYawOffset = clampThirdPersonYawOffset(
    yawOffset - safeDeltaX * safeYawSensitivity,
  );
  const nextPitch = clampThirdPersonPitch(
    pitch - safeDeltaY * safePitchSensitivity,
  );
  return {
    yawOffset: nextYawOffset,
    pitch: nextPitch,
  };
};

export const applyThirdPersonKeyboardPitch = (
  pitch: number,
  pitchInput: number,
  deltaSeconds: number,
): number => {
  const safeInput = Number.isFinite(pitchInput)
    ? Math.max(-1, Math.min(1, pitchInput))
    : 0;
  const safeDelta = Number.isFinite(deltaSeconds)
    ? Math.max(0, deltaSeconds)
    : 0;
  return clampThirdPersonPitch(
    pitch +
      safeInput *
        THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND *
        safeDelta,
  );
};

// Discrete turning uses a deliberate hold cadence so an ordinary keypress
// commits exactly one 45-degree turn rather than overshooting.
export const THIRD_PERSON_TURN_HOLD_START_MS = 340;
export const THIRD_PERSON_TURN_REPEAT_MS = 210;

export type ThirdPersonCameraSubject = Readonly<{
  key: string;
  cell: [number, number];
  facing: [number, number];
}>;

/**
 * Player-side actor turns may temporarily transfer camera ownership to a
 * commanded companion. Enemy/no-control turns always fall back to the
 * protagonist; the chase rig never follows a hostile simulation actor.
 */
export const resolveThirdPersonCameraSubject = (
  player: ThirdPersonCameraSubject,
  controlledActor: ThirdPersonCameraSubject | null | undefined,
): ThirdPersonCameraSubject =>
  controlledActor
    ? controlledActor
    : player;
