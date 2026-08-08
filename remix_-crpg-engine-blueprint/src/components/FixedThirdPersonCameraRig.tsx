import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND,
  clampThirdPersonPitch,
  facingToThirdPersonYaw,
} from "../utils/thirdPersonControls";
import {
  THIRD_PERSON_CAMERA_PROFILES,
  THIRD_PERSON_OPEN_EXPLORE_PROFILE,
  clampThirdPersonPeek,
  createThirdPersonCameraStepState,
  resolveThirdPersonTargetPose,
  stepThirdPersonCamera,
  wrapThirdPersonCameraYaw,
  type ThirdPersonCameraProfileName,
  type ThirdPersonCameraStepState,
  type ThirdPersonCameraVec3,
} from "../utils/thirdPersonCamera";

export {
  THIRD_PERSON_CAMERA_PROFILES,
  advanceThirdPersonShoulderSelection,
  advanceThirdPersonSpatialState,
  createThirdPersonCameraStepState,
  createThirdPersonShoulderSelectionState,
  createThirdPersonSpatialState,
  resolveThirdPersonCameraProfile,
  resolveThirdPersonTargetPose,
  stepThirdPersonCamera,
} from "../utils/thirdPersonCamera";
export type {
  ThirdPersonCameraProfile,
  ThirdPersonCameraProfileName,
  ThirdPersonCameraStepInput,
  ThirdPersonCameraStepState,
  ThirdPersonCameraShoulder,
  ThirdPersonCameraVec3,
  ThirdPersonShoulderSelectionMeasurements,
  ThirdPersonShoulderSelectionState,
  ThirdPersonSpatialMeasurements,
  ThirdPersonSpatialMode,
  ThirdPersonSpatialState,
  ThirdPersonTargetPose,
} from "../utils/thirdPersonCamera";

export const THIRD_PERSON_FOV = THIRD_PERSON_OPEN_EXPLORE_PROFILE.fov;
export const THIRD_PERSON_DEFAULT_PITCH = 0;
export const THIRD_PERSON_CAMERA_RADIUS = 0.16;
export const THIRD_PERSON_COLLISION_CLEARANCE = 0.1;
export const THIRD_PERSON_CAMERA_COLLISION_PADDING =
  THIRD_PERSON_CAMERA_RADIUS + THIRD_PERSON_COLLISION_CLEARANCE;
export const THIRD_PERSON_MANUAL_RECENTER_DELAY_MS = 300;
export const THIRD_PERSON_TELEPORT_SNAP_DISTANCE = 12;

const THIRD_PERSON_COLLISION_RELEASE_DAMPING = 3.5;
const THIRD_PERSON_RECENTER_DAMPING = Math.log(10) / 0.65;
const THIRD_PERSON_COLLISION_EPSILON = 0.002;
const THIRD_PERSON_TRANSFORM_EPSILON_SQ = 0.00000001;
// Shoulder centering. The authored right-shoulder offset is a composition
// preference, not a guarantee: in tight corridors keeping camera distance
// matters more than keeping the offset, so the rig probes progressively
// smaller offsets and glides toward the widest one that still leaves a
// useful boom. Scale 0 centers the camera directly behind the subject.
const THIRD_PERSON_SHOULDER_PROBE_SCALES = [1, 0.66, 0.33] as const;
const THIRD_PERSON_SHOULDER_MIN_CLEAR = 2.2;
const THIRD_PERSON_SHOULDER_CLEAR_MARGIN = 0.05;
const THIRD_PERSON_SHOULDER_SCALE_DAMPING = 5;

/**
 * A static structural blocker expressed as a world-space AABB. Omitted
 * vertical bounds intentionally make a blocker infinitely tall.
 */
export type ThirdPersonCameraBlocker = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}>;

export type ThirdPersonLookInputSnapshot = {
  /** Presentation-only offset from authoritative facing. */
  yawOffset: number;
  /** Presentation-only pitch offset. */
  pitch: number;
  /** Held Q/E pressure in the inclusive -1..1 range. */
  pitchInput: number;
  /** Latest damped authoritative tether yaw. */
  visualYaw: number;
  /** Latest presentation pitch. */
  visualPitch: number;
  /** Recenter remains suspended until this timestamp. */
  manualLookUntilMs: number;
  ready: boolean;
  resetToken: number;
};

export const thirdPersonLookRef: ThirdPersonLookInputSnapshot = {
  yawOffset: 0,
  pitch: THIRD_PERSON_DEFAULT_PITCH,
  pitchInput: 0,
  visualYaw: 0,
  visualPitch: THIRD_PERSON_DEFAULT_PITCH,
  manualLookUntilMs: 0,
  ready: false,
  resetToken: 0,
};

const thirdPersonInputNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export const markThirdPersonManualLookActivity = (
  nowMs = thirdPersonInputNow(),
) => {
  thirdPersonLookRef.manualLookUntilMs =
    nowMs + THIRD_PERSON_MANUAL_RECENTER_DELAY_MS;
};

/** Compatibility helper for non-React input producers. Deltas are radians. */
export const queueThirdPersonLookDelta = (
  yawDelta: number,
  pitchDelta: number,
) => {
  const safeYawDelta = Number.isFinite(yawDelta) ? yawDelta : 0;
  const safePitchDelta = Number.isFinite(pitchDelta) ? pitchDelta : 0;
  const peek = clampThirdPersonPeek(
    "open",
    thirdPersonLookRef.yawOffset + safeYawDelta,
    thirdPersonLookRef.pitch + safePitchDelta,
  );
  thirdPersonLookRef.yawOffset = peek.yawOffset;
  thirdPersonLookRef.pitch = peek.pitchOffset;
  if (safeYawDelta !== 0 || safePitchDelta !== 0) {
    markThirdPersonManualLookActivity();
  }
};

export const setThirdPersonPitchInput = (pitchInput: number) => {
  thirdPersonLookRef.pitchInput = THREE.MathUtils.clamp(
    Number.isFinite(pitchInput) ? pitchInput : 0,
    -1,
    1,
  );
  if (Math.abs(thirdPersonLookRef.pitchInput) > 0.0001) {
    markThirdPersonManualLookActivity();
  }
};

export const requestThirdPersonLookReset = () => {
  thirdPersonLookRef.yawOffset = 0;
  thirdPersonLookRef.pitch = THIRD_PERSON_DEFAULT_PITCH;
  thirdPersonLookRef.pitchInput = 0;
  thirdPersonLookRef.manualLookUntilMs = 0;
  thirdPersonLookRef.resetToken += 1;
};

type MutableVec3 = [number, number, number];
type SweepNormal = readonly [number, number, number];

export type ThirdPersonCameraSweepResult = Readonly<{
  safeEye: ThirdPersonCameraVec3;
  hit: boolean;
  fraction: number;
  normal: SweepNormal;
}>;

type RawSweepHit = Readonly<{
  fraction: number;
  normal: SweepNormal;
}>;

const pointInsideExpandedBlocker = (
  point: ThirdPersonCameraVec3,
  blocker: ThirdPersonCameraBlocker,
  padding: number,
) => {
  const minY =
    blocker.minY === undefined
      ? Number.NEGATIVE_INFINITY
      : Math.min(blocker.minY, blocker.maxY ?? blocker.minY) - padding;
  const maxY =
    blocker.maxY === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(blocker.minY ?? blocker.maxY, blocker.maxY) + padding;
  return (
    point[0] >= Math.min(blocker.minX, blocker.maxX) - padding &&
    point[0] <= Math.max(blocker.minX, blocker.maxX) + padding &&
    point[1] >= minY &&
    point[1] <= maxY &&
    point[2] >= Math.min(blocker.minZ, blocker.maxZ) - padding &&
    point[2] <= Math.max(blocker.minZ, blocker.maxZ) + padding
  );
};

const nearestExitNormal = (
  point: ThirdPersonCameraVec3,
  blocker: ThirdPersonCameraBlocker,
  padding: number,
): SweepNormal => {
  const minX = Math.min(blocker.minX, blocker.maxX) - padding;
  const maxX = Math.max(blocker.minX, blocker.maxX) + padding;
  const minZ = Math.min(blocker.minZ, blocker.maxZ) - padding;
  const maxZ = Math.max(blocker.minZ, blocker.maxZ) + padding;
  const candidates: Array<readonly [number, SweepNormal]> = [
    [Math.abs(point[0] - minX), [-1, 0, 0]],
    [Math.abs(maxX - point[0]), [1, 0, 0]],
    [Math.abs(point[2] - minZ), [0, 0, -1]],
    [Math.abs(maxZ - point[2]), [0, 0, 1]],
  ];
  if (blocker.minY !== undefined) {
    const minY =
      Math.min(blocker.minY, blocker.maxY ?? blocker.minY) - padding;
    candidates.push([Math.abs(point[1] - minY), [0, -1, 0]]);
  }
  if (blocker.maxY !== undefined) {
    const maxY =
      Math.max(blocker.minY ?? blocker.maxY, blocker.maxY) + padding;
    candidates.push([Math.abs(maxY - point[1]), [0, 1, 0]]);
  }
  candidates.sort((left, right) => left[0] - right[0]);
  return candidates[0]?.[1] ?? [0, 0, 0];
};

const sweepExpandedBlocker = (
  start: ThirdPersonCameraVec3,
  end: ThirdPersonCameraVec3,
  blocker: ThirdPersonCameraBlocker,
  padding: number,
): RawSweepHit | null => {
  const min: MutableVec3 = [
    Math.min(blocker.minX, blocker.maxX) - padding,
    blocker.minY === undefined
      ? Number.NEGATIVE_INFINITY
      : Math.min(blocker.minY, blocker.maxY ?? blocker.minY) - padding,
    Math.min(blocker.minZ, blocker.maxZ) - padding,
  ];
  const max: MutableVec3 = [
    Math.max(blocker.minX, blocker.maxX) + padding,
    blocker.maxY === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(blocker.minY ?? blocker.maxY, blocker.maxY) + padding,
    Math.max(blocker.minZ, blocker.maxZ) + padding,
  ];
  const direction: MutableVec3 = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ];

  if (pointInsideExpandedBlocker(start, blocker, padding)) {
    const normal = nearestExitNormal(start, blocker, padding);
    const outwardMotion =
      direction[0] * normal[0] +
      direction[1] * normal[1] +
      direction[2] * normal[2];
    if (outwardMotion > 0.000001) return null;
    return { fraction: 0, normal };
  }

  let enter = 0;
  let exit = 1;
  let enterNormal: SweepNormal = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = start[axis];
    const delta = direction[axis];
    if (Math.abs(delta) < 0.000001) {
      if (origin < min[axis] || origin > max[axis]) return null;
      continue;
    }
    let near = (min[axis] - origin) / delta;
    let far = (max[axis] - origin) / delta;
    let normal: MutableVec3 = [0, 0, 0];
    normal[axis] = delta > 0 ? -1 : 1;
    if (near > far) {
      [near, far] = [far, near];
    }
    if (near > enter) {
      enter = near;
      enterNormal = normal;
    }
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  if (exit < 0 || enter > 1) return null;
  return {
    fraction: THREE.MathUtils.clamp(enter, 0, 1),
    normal: enterNormal,
  };
};

const findThirdPersonCameraSweepHit = (
  start: ThirdPersonCameraVec3,
  end: ThirdPersonCameraVec3,
  blockers: readonly ThirdPersonCameraBlocker[],
  padding: number,
): RawSweepHit | null => {
  let closest: RawSweepHit | null = null;
  for (const blocker of blockers) {
    const hit = sweepExpandedBlocker(start, end, blocker, padding);
    if (hit && (!closest || hit.fraction < closest.fraction)) {
      closest = hit;
    }
  }
  return closest;
};

export const resolveThirdPersonCameraCollisionFraction = (
  start: ThirdPersonCameraVec3,
  end: ThirdPersonCameraVec3,
  blockers: readonly ThirdPersonCameraBlocker[],
  padding = THIRD_PERSON_CAMERA_COLLISION_PADDING,
): number =>
  findThirdPersonCameraSweepHit(start, end, blockers, padding)?.fraction ?? 1;

export const resolveThirdPersonCameraSweep = ({
  start,
  desiredEye,
  blockers,
  padding = THIRD_PERSON_CAMERA_COLLISION_PADDING,
}: {
  start: ThirdPersonCameraVec3;
  desiredEye: ThirdPersonCameraVec3;
  blockers: readonly ThirdPersonCameraBlocker[];
  padding?: number;
}): ThirdPersonCameraSweepResult => {
  const hit = findThirdPersonCameraSweepHit(
    start,
    desiredEye,
    blockers,
    Math.max(0, padding),
  );
  if (!hit) {
    return {
      safeEye: [...desiredEye],
      hit: false,
      fraction: 1,
      normal: [0, 0, 0],
    };
  }
  const distance = Math.hypot(
    desiredEye[0] - start[0],
    desiredEye[1] - start[1],
    desiredEye[2] - start[2],
  );
  const safeFraction =
    distance > 0.000001
      ? Math.max(0, hit.fraction - THIRD_PERSON_COLLISION_EPSILON / distance)
      : 0;
  return {
    safeEye: [
      start[0] + (desiredEye[0] - start[0]) * safeFraction,
      start[1] + (desiredEye[1] - start[1]) * safeFraction,
      start[2] + (desiredEye[2] - start[2]) * safeFraction,
    ],
    hit: true,
    fraction: hit.fraction,
    normal: hit.normal,
  };
};

const vecDistance = (
  left: ThirdPersonCameraVec3,
  right: ThirdPersonCameraVec3,
) =>
  Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );

const damp = (current: number, target: number, damping: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-damping * delta));

const boomStartForEye = (
  subject: ThirdPersonCameraVec3,
  eye: ThirdPersonCameraVec3,
): ThirdPersonCameraVec3 => [subject[0], eye[1], subject[2]];

const measureBoomClearance = (
  subject: ThirdPersonCameraVec3,
  eye: ThirdPersonCameraVec3,
  blockers: readonly ThirdPersonCameraBlocker[],
) => {
  const start = boomStartForEye(subject, eye);
  const fraction = resolveThirdPersonCameraCollisionFraction(
    start,
    eye,
    blockers,
  );
  return vecDistance(start, eye) * fraction;
};

export const getInitialThirdPersonCameraPosition = (
  subjectPos: readonly [number, number],
  subjectFacing: readonly [number, number],
  subjectWorldY = 0,
  pitch = THIRD_PERSON_DEFAULT_PITCH,
): [number, number, number] => {
  const pose = resolveThirdPersonTargetPose({
    subject: [subjectPos[0], subjectWorldY, subjectPos[1]],
    floorY: subjectWorldY,
    facingYaw: facingToThirdPersonYaw(subjectFacing),
    cameraProfile: THIRD_PERSON_OPEN_EXPLORE_PROFILE,
    spatialMode: "open",
    yawOffset: 0,
    pitchOffset: clampThirdPersonPitch(pitch),
  });
  return [...pose.eye];
};

export function ThirdPersonCameraRig({
  subjectPos,
  subjectFacing,
  subjectWorldY = 0,
  blockers = [],
  profile = "explore",
  onVisualYawChange,
  onStreamDirectionChange,
}: {
  subjectPos: readonly [number, number];
  subjectFacing: readonly [number, number];
  subjectWorldY?: number;
  blockers?: readonly ThirdPersonCameraBlocker[];
  profile?: ThirdPersonCameraProfileName;
  /**
   * Publishes only the damped authoritative tether yaw. Presentation peeking
   * never rotates Steve or changes simulation facing.
   */
  onVisualYawChange?: (visualYaw: number) => void;
  /**
   * Publishes the continuous horizontal view direction for asymmetric world
   * streaming. A small angular threshold avoids a React update every frame
   * without forcing the camera-facing render field into eight sectors.
   */
  onStreamDirectionChange?: (direction: readonly [number, number]) => void;
}) {
  const { camera, invalidate } = useThree();
  const cameraStateRef = useRef<ThirdPersonCameraStepState | null>(null);
  const shoulderScaleRef = useRef(1);
  const lastAuthoritativeSubjectRef = useRef<ThirdPersonCameraVec3 | null>(
    null,
  );
  const resetTokenRef = useRef(thirdPersonLookRef.resetToken);
  const collisionDistanceRef = useRef(Number.POSITIVE_INFINITY);
  const lastLookRef = useRef(new THREE.Vector3());
  const lastPublishedYawRef = useRef(Number.NaN);
  const lastPublishedStreamYawRef = useRef(Number.NaN);

  useEffect(() => {
    thirdPersonLookRef.ready = true;
    invalidate();
    return () => {
      thirdPersonLookRef.ready = false;
    };
  }, [invalidate]);

  useFrame((_state, frameDelta) => {
    const delta = Math.min(
      0.05,
      Number.isFinite(frameDelta) ? Math.max(0, frameDelta) : 0,
    );
    const authoritativeSubject: ThirdPersonCameraVec3 = [
      subjectPos[0],
      subjectWorldY,
      subjectPos[1],
    ];
    const authoritativeYaw = facingToThirdPersonYaw(subjectFacing);
    const previousSubject = lastAuthoritativeSubjectRef.current;
    const resetRequested =
      resetTokenRef.current !== thirdPersonLookRef.resetToken;
    const teleported =
      previousSubject !== null &&
      vecDistance(previousSubject, authoritativeSubject) >
        THIRD_PERSON_TELEPORT_SNAP_DISTANCE;
    const snap =
      cameraStateRef.current === null || resetRequested || teleported;

    if (resetRequested) {
      resetTokenRef.current = thirdPersonLookRef.resetToken;
      thirdPersonLookRef.yawOffset = 0;
      thirdPersonLookRef.pitch = THIRD_PERSON_DEFAULT_PITCH;
      thirdPersonLookRef.manualLookUntilMs = 0;
    }
    lastAuthoritativeSubjectRef.current = authoritativeSubject;

    thirdPersonLookRef.pitch = clampThirdPersonPitch(
      thirdPersonLookRef.pitch +
        thirdPersonLookRef.pitchInput *
          THIRD_PERSON_KEY_PITCH_RATE_RADIANS_PER_SECOND *
          delta,
    );
    if (
      thirdPersonInputNow() >= thirdPersonLookRef.manualLookUntilMs &&
      delta > 0
    ) {
      thirdPersonLookRef.yawOffset = damp(
        thirdPersonLookRef.yawOffset,
        0,
        THIRD_PERSON_RECENTER_DAMPING,
        delta,
      );
      thirdPersonLookRef.pitch = damp(
        thirdPersonLookRef.pitch,
        THIRD_PERSON_DEFAULT_PITCH,
        THIRD_PERSON_RECENTER_DAMPING,
        delta,
      );
    }
    const peek = clampThirdPersonPeek(
      "open",
      thirdPersonLookRef.yawOffset,
      thirdPersonLookRef.pitch,
    );
    thirdPersonLookRef.yawOffset = peek.yawOffset;
    thirdPersonLookRef.pitch = peek.pitchOffset;

    // One authored composition per camera mode. Walls and corridors are
    // handled continuously below (shoulder centering plus the boom clamp)
    // instead of by discrete spatial/corner/shoulder state machines, which
    // used to fight each other and produce visible camera churn.
    const cameraProfile = THIRD_PERSON_CAMERA_PROFILES[profile].open;

    // Probe the widest shoulder offset that still leaves a useful boom. The
    // probe uses the damped tether yaw so mid-turn frames do not flap the
    // target; the applied scale glides, so composition shifts stay gentle.
    const probeYaw = cameraStateRef.current?.tetherYaw ?? authoritativeYaw;
    const probePose = (rightOffsetScale: number) =>
      resolveThirdPersonTargetPose({
        subject: authoritativeSubject,
        floorY: subjectWorldY,
        facingYaw: probeYaw,
        cameraProfile,
        spatialMode: "open",
        rightOffsetScale,
        shoulder: 1,
      });
    const centeredClearance = measureBoomClearance(
      authoritativeSubject,
      probePose(0).eye,
      blockers,
    );
    const requiredClearance = Math.min(
      centeredClearance - THIRD_PERSON_SHOULDER_CLEAR_MARGIN,
      THIRD_PERSON_SHOULDER_MIN_CLEAR,
    );
    let targetShoulderScale = 0;
    for (const scale of THIRD_PERSON_SHOULDER_PROBE_SCALES) {
      if (
        measureBoomClearance(
          authoritativeSubject,
          probePose(scale).eye,
          blockers,
        ) >= requiredClearance
      ) {
        targetShoulderScale = scale;
        break;
      }
    }
    shoulderScaleRef.current = snap
      ? targetShoulderScale
      : damp(
          shoulderScaleRef.current,
          targetShoulderScale,
          THIRD_PERSON_SHOULDER_SCALE_DAMPING,
          delta,
        );

    const stepInput = {
      subject: authoritativeSubject,
      floorY: subjectWorldY,
      facingYaw: authoritativeYaw,
      cameraProfile,
      spatialMode: "open",
      yawOffset: peek.yawOffset,
      pitchOffset: peek.pitchOffset,
      shoulder: 1,
      rightOffsetScale: shoulderScaleRef.current,
      snap,
    } as const;
    const stepped = cameraStateRef.current
      ? stepThirdPersonCamera(cameraStateRef.current, stepInput, delta)
      : createThirdPersonCameraStepState(stepInput);
    cameraStateRef.current = stepped;

    // The eye always sits on the boom between the subject's head and the
    // authored pose: blocked booms shorten instantly (never clip through a
    // wall) and re-extend on a damped release. Because the eye is derived
    // from smoothed inputs alone, there is no feedback through the previous
    // camera transform and therefore nothing to oscillate against.
    const boomStart = boomStartForEye(stepped.subject, stepped.eye);
    const boomSweep = resolveThirdPersonCameraSweep({
      start: boomStart,
      desiredEye: stepped.eye,
      blockers,
    });
    const fullBoomDistance = vecDistance(boomStart, stepped.eye);
    const safeBoomDistance = vecDistance(boomStart, boomSweep.safeEye);
    if (
      snap ||
      !Number.isFinite(collisionDistanceRef.current) ||
      safeBoomDistance < collisionDistanceRef.current
    ) {
      collisionDistanceRef.current = safeBoomDistance;
    } else {
      collisionDistanceRef.current = damp(
        collisionDistanceRef.current,
        safeBoomDistance,
        THIRD_PERSON_COLLISION_RELEASE_DAMPING,
        delta,
      );
    }
    const allowedFraction =
      fullBoomDistance > 0.000001
        ? THREE.MathUtils.clamp(
            collisionDistanceRef.current / fullBoomDistance,
            0,
            boomSweep.fraction,
          )
        : 0;
    const finalEye: ThirdPersonCameraVec3 = [
      boomStart[0] + (stepped.eye[0] - boomStart[0]) * allowedFraction,
      boomStart[1] + (stepped.eye[1] - boomStart[1]) * allowedFraction,
      boomStart[2] + (stepped.eye[2] - boomStart[2]) * allowedFraction,
    ];

    const previousX = camera.position.x;
    const previousY = camera.position.y;
    const previousZ = camera.position.z;
    camera.position.set(finalEye[0], finalEye[1], finalEye[2]);
    lastLookRef.current.set(stepped.look[0], stepped.look[1], stepped.look[2]);
    camera.lookAt(lastLookRef.current);
    const viewX = stepped.look[0] - finalEye[0];
    const viewZ = stepped.look[2] - finalEye[2];
    if (viewX * viewX + viewZ * viewZ > 0.000001) {
      const viewYaw = Math.atan2(viewX, viewZ);
      const lastViewYaw = lastPublishedStreamYawRef.current;
      if (
        !Number.isFinite(lastViewYaw) ||
        Math.abs(wrapThirdPersonCameraYaw(viewYaw - lastViewYaw)) >=
          THREE.MathUtils.degToRad(3)
      ) {
        lastPublishedStreamYawRef.current = viewYaw;
        onStreamDirectionChange?.([
          Math.sin(viewYaw),
          Math.cos(viewYaw),
        ]);
      }
    }
    if (
      camera instanceof THREE.PerspectiveCamera &&
      Math.abs(camera.fov - stepped.fov) > 0.001
    ) {
      camera.fov = stepped.fov;
      camera.updateProjectionMatrix();
    }
    thirdPersonLookRef.visualYaw = stepped.tetherYaw;
    thirdPersonLookRef.visualPitch = peek.pitchOffset;
    thirdPersonLookRef.ready = true;
    if (
      !Number.isFinite(lastPublishedYawRef.current) ||
      Math.abs(
        wrapThirdPersonCameraYaw(
          stepped.tetherYaw - lastPublishedYawRef.current,
        ),
      ) > 0.0001
    ) {
      lastPublishedYawRef.current = stepped.tetherYaw;
      onVisualYawChange?.(stepped.tetherYaw);
    }

    if (
      (camera.position.x - previousX) ** 2 +
        (camera.position.y - previousY) ** 2 +
        (camera.position.z - previousZ) ** 2 >
      THIRD_PERSON_TRANSFORM_EPSILON_SQ
    ) {
      invalidate();
    }
  });

  return null;
}
