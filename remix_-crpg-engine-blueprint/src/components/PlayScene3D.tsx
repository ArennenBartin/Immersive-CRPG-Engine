import React, { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { playerStateRef } from "./GameRenderer3D";
import {
  FIRST_PERSON_ATMOSPHERE,
  FIRST_PERSON_EYE_HEIGHT,
  FIRST_PERSON_FOV,
  ISOMETRIC_ATMOSPHERE,
  type PlayAtmosphereProfile,
} from "../utils/firstPersonControls";

export const ISO_CAMERA_BASE_AZIMUTH = Math.PI / 4;

export type PlayCameraMode = "explore" | "tactical" | "story";

type PlayCameraProfile = {
  height: number;
  horizontalDistance: number;
  fov: number;
  focusYOffset: number;
  lookAhead: number;
  followDamping: number;
  profileDamping: number;
};

export const PLAY_CAMERA_PROFILES: Record<PlayCameraMode, PlayCameraProfile> = {
  explore: {
    height: 18,
    horizontalDistance: 31.5,
    fov: 24.5,
    focusYOffset: 0.9,
    lookAhead: 0.65,
    followDamping: 7.2,
    profileDamping: 3.2,
  },
  tactical: {
    height: 30,
    horizontalDistance: Math.sqrt(30 * 30 + 30 * 30),
    fov: 23,
    focusYOffset: 0.22,
    lookAhead: 0.12,
    followDamping: 10,
    profileDamping: 4.8,
  },
  story: {
    height: 20,
    horizontalDistance: 32,
    fov: 27,
    focusYOffset: 0.8,
    lookAhead: 0.45,
    followDamping: 5.6,
    profileDamping: 2.8,
  },
};

const CAMERA_ROTATION_DAMPING = 7.5;
const CAMERA_FOLLOW_SNAP_DISTANCE = 6;
const CAMERA_FOV_UPDATE_EPSILON = 0.001;
const CAMERA_TRANSFORM_UPDATE_EPSILON_SQ = 0.00000001;
const TWO_PI = Math.PI * 2;
const targetVec = new THREE.Vector3();
const lookAtVec = new THREE.Vector3();
const savedTargetVec = new THREE.Vector3();

const wrapRadians = (angle: number) =>
  THREE.MathUtils.euclideanModulo(angle + Math.PI, TWO_PI) - Math.PI;

const cameraPosition = (
  focus: readonly [number, number],
  azimuth: number,
  profile: PlayCameraProfile,
  focusY = profile.focusYOffset,
): [number, number, number] => [
  focus[0] + Math.cos(azimuth) * profile.horizontalDistance,
  focusY + profile.height,
  focus[1] + Math.sin(azimuth) * profile.horizontalDistance,
];

const dampProfile = (
  current: PlayCameraProfile,
  target: PlayCameraProfile,
  delta: number,
) => {
  const damping = target.profileDamping;
  current.height = THREE.MathUtils.damp(current.height, target.height, damping, delta);
  current.horizontalDistance = THREE.MathUtils.damp(
    current.horizontalDistance,
    target.horizontalDistance,
    damping,
    delta,
  );
  current.fov = THREE.MathUtils.damp(current.fov, target.fov, damping, delta);
  current.focusYOffset = THREE.MathUtils.damp(
    current.focusYOffset,
    target.focusYOffset,
    damping,
    delta,
  );
  current.lookAhead = THREE.MathUtils.damp(
    current.lookAhead,
    target.lookAhead,
    damping,
    delta,
  );
  current.followDamping = THREE.MathUtils.damp(
    current.followDamping,
    target.followDamping,
    damping,
    delta,
  );
  current.profileDamping = damping;
};

export const getInitialPlayCameraPosition = (
  focus: readonly [number, number],
  azimuth: number,
  mode: PlayCameraMode,
) => cameraPosition(focus, azimuth, PLAY_CAMERA_PROFILES[mode]);

export function IsometricCameraRig({
  playerPos,
  playerFacing,
  azimuth,
  mode,
  focusOverride,
  glide,
}: {
  playerPos: [number, number];
  playerFacing: [number, number];
  azimuth: number;
  mode: PlayCameraMode;
  focusOverride?: [number, number] | null;
  glide?: boolean;
}) {
  const { camera } = useThree();
  const initialProfile = PLAY_CAMERA_PROFILES[mode];
  const focusRef = useRef(
    new THREE.Vector3(playerPos[0], initialProfile.focusYOffset, playerPos[1]),
  );
  const azimuthRef = useRef(azimuth);
  const profileRef = useRef<PlayCameraProfile>({ ...initialProfile });
  const appliedFocusRef = useRef(new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN));

  useEffect(() => {
    const focus = focusRef.current;
    const position = cameraPosition(
      [focus.x, focus.z],
      azimuthRef.current,
      profileRef.current,
      focus.y,
    );
    camera.position.set(...position);
    camera.lookAt(focus.x, focus.y, focus.z);
    appliedFocusRef.current.copy(focus);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = profileRef.current.fov;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05);
    const profile = profileRef.current;
    dampProfile(profile, PLAY_CAMERA_PROFILES[mode], delta);
    const focus = focusRef.current;
    let baseFocus: THREE.Vector3;

    if (focusOverride) {
      baseFocus = targetVec.set(focusOverride[0], 0, focusOverride[1]);
    } else {
      baseFocus = playerStateRef.ready
        ? targetVec.set(playerStateRef.px, playerStateRef.py, playerStateRef.pz)
        : targetVec.set(playerPos[0], 0, playerPos[1]);
      if (
        baseFocus.distanceTo(
          savedTargetVec.set(playerPos[0], baseFocus.y, playerPos[1]),
        ) > CAMERA_FOLLOW_SNAP_DISTANCE
      ) {
        baseFocus.copy(savedTargetVec);
      }
    }

    const lookAhead = focusOverride ? 0 : profile.lookAhead;
    const targetFocus = lookAtVec.set(
      baseFocus.x + playerFacing[0] * lookAhead,
      baseFocus.y + profile.focusYOffset,
      baseFocus.z + playerFacing[1] * lookAhead,
    );
    if (!glide && focus.distanceTo(targetFocus) > CAMERA_FOLLOW_SNAP_DISTANCE) {
      focus.copy(targetFocus);
    } else {
      focus.x = THREE.MathUtils.damp(focus.x, targetFocus.x, profile.followDamping, delta);
      focus.y = THREE.MathUtils.damp(focus.y, targetFocus.y, profile.followDamping, delta);
      focus.z = THREE.MathUtils.damp(focus.z, targetFocus.z, profile.followDamping, delta);
    }

    const angleAmount = 1 - Math.exp(-CAMERA_ROTATION_DAMPING * delta);
    const nextAzimuth =
      azimuthRef.current + wrapRadians(azimuth - azimuthRef.current) * angleAmount;
    azimuthRef.current =
      Math.abs(wrapRadians(azimuth - nextAzimuth)) < 0.0005
        ? azimuth
        : nextAzimuth;

    // Avoid allocating a coordinate tuple and rebuilding the camera matrices
    // after the damped follow has settled. Demand frames still advance GIFs
    // and feedback, but a stationary camera no longer performs lookAt work on
    // every Balanced-mode tick.
    const cameraX =
      focus.x + Math.cos(azimuthRef.current) * profile.horizontalDistance;
    const cameraY = focus.y + profile.height;
    const cameraZ =
      focus.z + Math.sin(azimuthRef.current) * profile.horizontalDistance;
    const cameraDx = camera.position.x - cameraX;
    const cameraDy = camera.position.y - cameraY;
    const cameraDz = camera.position.z - cameraZ;
    const cameraMoved =
      cameraDx * cameraDx + cameraDy * cameraDy + cameraDz * cameraDz >
      CAMERA_TRANSFORM_UPDATE_EPSILON_SQ;
    const focusMoved =
      appliedFocusRef.current.distanceToSquared(focus) >
      CAMERA_TRANSFORM_UPDATE_EPSILON_SQ;
    if (cameraMoved) camera.position.set(cameraX, cameraY, cameraZ);
    if (cameraMoved || focusMoved) {
      camera.lookAt(focus.x, focus.y, focus.z);
      appliedFocusRef.current.copy(focus);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const nextFov = THREE.MathUtils.damp(camera.fov, profile.fov, 8, delta);
      if (Math.abs(nextFov - camera.fov) >= CAMERA_FOV_UPDATE_EPSILON) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

// ── First person ────────────────────────────────────────────────────────────
// One rig owns the camera for a first_person-authored game across every play
// camera mode. Exploration puts the eye at the interpolated player position
// with a damped 45°-stepped yaw from the 8-direction facing; tactical/story
// modes blend the same camera back out to the isometric profiles so combat,
// targeting, and story panels keep the top-down view their UI expects. The
// blend is one damped scalar over both eye and look target, which turns the
// mode switch into a single continuous glide instead of a rig swap.

const FIRST_PERSON_YAW_DAMPING = 11;
const FIRST_PERSON_BLEND_DAMPING = 3.4;
const FIRST_PERSON_LOOK_DISTANCE = 6;

const fpEyeVec = new THREE.Vector3();
const fpLookVec = new THREE.Vector3();
const isoEyeVec = new THREE.Vector3();
const isoLookVec = new THREE.Vector3();

const facingYaw = (facing: readonly [number, number]): number =>
  Math.atan2(facing[0], facing[1]);

export function FirstPersonCameraRig({
  playerPos,
  playerFacing,
  azimuth,
  mode,
  focusOverride,
}: {
  playerPos: [number, number];
  playerFacing: [number, number];
  azimuth: number;
  mode: PlayCameraMode;
  focusOverride?: [number, number] | null;
}) {
  const { camera } = useThree();
  const yawRef = useRef(facingYaw(playerFacing));
  const blendRef = useRef(mode === "explore" ? 0 : 1);
  const isoFocusRef = useRef(
    new THREE.Vector3(
      playerPos[0],
      PLAY_CAMERA_PROFILES[mode].focusYOffset,
      playerPos[1],
    ),
  );
  const isoAzimuthRef = useRef(azimuth);
  const isoProfileRef = useRef<PlayCameraProfile>({
    ...PLAY_CAMERA_PROFILES[mode],
  });
  const appliedEyeRef = useRef(new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN));
  const appliedLookRef = useRef(new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN));

  const composePose = (delta: number) => {
    // First-person pose: the eye rides the same interpolated position the
    // player marker slides on, so steps read as walking, not teleporting.
    const eyeX = playerStateRef.ready ? playerStateRef.px : playerPos[0];
    const eyeY = (playerStateRef.ready ? playerStateRef.py : 0) + FIRST_PERSON_EYE_HEIGHT;
    const eyeZ = playerStateRef.ready ? playerStateRef.pz : playerPos[1];
    const targetYaw = facingYaw(playerFacing);
    const yawAmount = 1 - Math.exp(-FIRST_PERSON_YAW_DAMPING * delta);
    const nextYaw = yawRef.current + wrapRadians(targetYaw - yawRef.current) * yawAmount;
    yawRef.current =
      Math.abs(wrapRadians(targetYaw - nextYaw)) < 0.0004 ? targetYaw : nextYaw;
    fpEyeVec.set(eyeX, eyeY, eyeZ);
    fpLookVec.set(
      eyeX + Math.sin(yawRef.current) * FIRST_PERSON_LOOK_DISTANCE,
      eyeY,
      eyeZ + Math.cos(yawRef.current) * FIRST_PERSON_LOOK_DISTANCE,
    );

    // Isometric pose: the same follow/focus math the isometric rig uses,
    // kept live even while fully first-person so a combat entry starts its
    // glide from a sane tactical target.
    const profile = isoProfileRef.current;
    dampProfile(profile, PLAY_CAMERA_PROFILES[mode], delta);
    const focus = isoFocusRef.current;
    const baseFocus = focusOverride
      ? targetVec.set(focusOverride[0], 0, focusOverride[1])
      : playerStateRef.ready
        ? targetVec.set(playerStateRef.px, playerStateRef.py, playerStateRef.pz)
        : targetVec.set(playerPos[0], 0, playerPos[1]);
    const isoTargetFocus = lookAtVec.set(
      baseFocus.x,
      baseFocus.y + profile.focusYOffset,
      baseFocus.z,
    );
    if (focus.distanceTo(isoTargetFocus) > CAMERA_FOLLOW_SNAP_DISTANCE) {
      focus.copy(isoTargetFocus);
    } else {
      focus.x = THREE.MathUtils.damp(focus.x, isoTargetFocus.x, profile.followDamping, delta);
      focus.y = THREE.MathUtils.damp(focus.y, isoTargetFocus.y, profile.followDamping, delta);
      focus.z = THREE.MathUtils.damp(focus.z, isoTargetFocus.z, profile.followDamping, delta);
    }
    const angleAmount = 1 - Math.exp(-CAMERA_ROTATION_DAMPING * delta);
    isoAzimuthRef.current += wrapRadians(azimuth - isoAzimuthRef.current) * angleAmount;
    isoEyeVec.set(
      focus.x + Math.cos(isoAzimuthRef.current) * profile.horizontalDistance,
      focus.y + profile.height,
      focus.z + Math.sin(isoAzimuthRef.current) * profile.horizontalDistance,
    );
    isoLookVec.copy(focus);

    const blendTarget = mode === "explore" ? 0 : 1;
    blendRef.current = THREE.MathUtils.damp(
      blendRef.current,
      blendTarget,
      FIRST_PERSON_BLEND_DAMPING,
      delta,
    );
    if (Math.abs(blendRef.current - blendTarget) < 0.001) {
      blendRef.current = blendTarget;
    }
    const blend = blendRef.current;
    return {
      eye: fpEyeVec.clone().lerp(isoEyeVec, blend),
      look: fpLookVec.clone().lerp(isoLookVec, blend),
      fov: THREE.MathUtils.lerp(FIRST_PERSON_FOV, profile.fov, blend),
    };
  };

  useEffect(() => {
    // Snap once on mount; afterwards every change glides through the frame
    // loop below.
    const pose = composePose(1000);
    camera.position.copy(pose.eye);
    camera.lookAt(pose.look);
    appliedEyeRef.current.copy(pose.eye);
    appliedLookRef.current.copy(pose.look);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05);
    const pose = composePose(delta);
    const eyeMoved =
      appliedEyeRef.current.distanceToSquared(pose.eye) >
      CAMERA_TRANSFORM_UPDATE_EPSILON_SQ;
    const lookMoved =
      appliedLookRef.current.distanceToSquared(pose.look) >
      CAMERA_TRANSFORM_UPDATE_EPSILON_SQ;
    if (eyeMoved) camera.position.copy(pose.eye);
    if (eyeMoved || lookMoved) {
      camera.lookAt(pose.look);
      appliedEyeRef.current.copy(pose.eye);
      appliedLookRef.current.copy(pose.look);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(pose.fov - camera.fov) >= CAMERA_FOV_UPDATE_EPSILON) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

const ATMOSPHERE_DAMPING = 3.2;
const atmosphereColorScratch = new THREE.Color();

// Damps the shared scene fog and background between the isometric and
// first-person presets. The isometric fog band sits far outside the playfield
// (the top-down camera is ~36 units away); at eye height the first-person band
// hugs the 8-unit authoritative sight radius so unseen space dissolves into
// atmosphere instead of ending at a black wall. Runs on the scene's existing
// <fog>/<color> instances, so the declarative Canvas setup stays untouched.
export function PlayAtmosphereRig({ firstPerson }: { firstPerson: boolean }) {
  const { scene } = useThree();
  const settledRef = useRef(false);

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05);
    const target: PlayAtmosphereProfile = firstPerson
      ? FIRST_PERSON_ATMOSPHERE
      : ISOMETRIC_ATMOSPHERE;
    const fog = scene.fog;
    if (!(fog instanceof THREE.Fog)) return;

    const nearGap = Math.abs(fog.near - target.fogNear);
    const farGap = Math.abs(fog.far - target.fogFar);
    if (settledRef.current && nearGap < 0.01 && farGap < 0.01) return;

    fog.near = THREE.MathUtils.damp(fog.near, target.fogNear, ATMOSPHERE_DAMPING, delta);
    fog.far = THREE.MathUtils.damp(fog.far, target.fogFar, ATMOSPHERE_DAMPING, delta);
    const colorAmount = 1 - Math.exp(-ATMOSPHERE_DAMPING * delta);
    fog.color.lerp(atmosphereColorScratch.set(target.fogColor), colorAmount);
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(
        atmosphereColorScratch.set(target.background),
        colorAmount,
      );
    }
    if (nearGap < 0.02 && farGap < 0.02) {
      fog.near = target.fogNear;
      fog.far = target.fogFar;
      fog.color.set(target.fogColor);
      if (scene.background instanceof THREE.Color) {
        scene.background.set(target.background);
      }
      settledRef.current = true;
    } else {
      settledRef.current = false;
    }
  });

  return null;
}

export function BlackStarLightRig({
  ambientLight = 0.08,
  shadowsEnabled = true,
}: {
  playerPos: [number, number];
  ambientLight?: number;
  shadowsEnabled?: boolean;
}) {
  // This is a deliberately weak readability fill. Mechanical sources are
  // rendered by the world layer; the old player-following point light made
  // authored darkness visually impossible and contradicted perception.
  const ambient = THREE.MathUtils.clamp(ambientLight, 0, 1);
  return (
    <>
      <hemisphereLight color="#8FA5F2" groundColor="#171522" intensity={0.04 + ambient * 0.62} />
      <ambientLight color="#665F91" intensity={0.015 + ambient * 0.42} />
      <directionalLight
        position={[-9, 20, -7]}
        color="#C2CCFF"
        intensity={0.08 + ambient * 0.9}
        castShadow={shadowsEnabled}
      />
      <directionalLight
        position={[10, 10, 8]}
        color="#A05E9C"
        intensity={0.02 + ambient * 0.34}
      />
    </>
  );
}

export function AdaptiveQualityProbe({
  dpr,
  minDpr,
  maxDpr,
  setDpr,
  frameBudgetMs = 1000 / 60,
}: {
  dpr: number;
  minDpr: number;
  maxDpr: number;
  setDpr: React.Dispatch<React.SetStateAction<number>>;
  frameBudgetMs?: number;
}) {
  const samplesRef = useRef<number[]>([]);
  const lastFrameMsRef = useRef<number | null>(null);
  const lastCheckMsRef = useRef(0);
  const stableChecksRef = useRef(0);
  const dprUpdateQueuedRef = useRef(false);

  const queueDprUpdate = (direction: "lower" | "raise") => {
    if (dprUpdateQueuedRef.current) return;
    dprUpdateQueuedRef.current = true;
    queueMicrotask(() => {
      dprUpdateQueuedRef.current = false;
      setDpr((current) =>
        direction === "lower"
          ? Math.max(minDpr, Number((current - 0.08).toFixed(2)))
          : Math.min(maxDpr, Number((current + 0.04).toFixed(2))),
      );
    });
  };

  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    if (lastFrameMsRef.current !== null) {
      const frameMs = now - lastFrameMsRef.current;
      if (frameMs > 0 && frameMs < 1000) samplesRef.current.push(frameMs);
    }
    lastFrameMsRef.current = now;
    if (now - lastCheckMsRef.current < 1500 || samplesRef.current.length < 12) return;

    const samples = samplesRef.current;
    const avg = samples.reduce((sum, frameMs) => sum + frameMs, 0) / samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const max = sorted[sorted.length - 1];
    // Compare against the renderer's intended bounded cadence instead of the
    // physical display refresh rate. This keeps adaptive DPR from chasing a
    // ProMotion panel or repeatedly rebuilding the play tree at a stable cap.
    const overloadAverageMs = frameBudgetMs * 1.23;
    const overloadP95Ms = frameBudgetMs * 1.44;
    const recoveryAverageMs = frameBudgetMs * 1.12;
    const recoveryP95Ms = frameBudgetMs * 1.2;
    // Close this sampling window before requesting a React update. The R3F
    // frame callback must never re-enter PlayEngine with the same over-budget
    // sample batch still live.
    samplesRef.current = [];
    lastCheckMsRef.current = now;
    if (
      (avg > overloadAverageMs || p95 > overloadP95Ms || max > 95) &&
      dpr > minDpr
    ) {
      stableChecksRef.current = 0;
      queueDprUpdate("lower");
    } else if (
      avg < recoveryAverageMs &&
      p95 < recoveryP95Ms &&
      max < 48 &&
      dpr < maxDpr
    ) {
      stableChecksRef.current += 1;
      if (stableChecksRef.current >= 4) {
        stableChecksRef.current = 0;
        queueDprUpdate("raise");
      }
    } else {
      stableChecksRef.current = 0;
    }
  });

  return null;
}
