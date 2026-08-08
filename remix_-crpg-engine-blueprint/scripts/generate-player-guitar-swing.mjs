import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

// FBXLoader only needs an inert image element while this script reads Steve's
// embedded texture. Animation and skeleton data are entirely local.
globalThis.window = {
  URL: {
    createObjectURL: () => "",
    revokeObjectURL: () => {},
  },
};
globalThis.document = {
  createElementNS: () => ({
    addEventListener(type, callback) {
      if (type === "load") this.onLoad = callback;
    },
    removeEventListener() {},
    set src(_value) {
      queueMicrotask(() => this.onLoad?.());
    },
  }),
};

const playerPath = path.resolve("public/models/player/Idle.fbx");
const swordLibraryPath = path.resolve(
  "Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb",
);
const playerBytes = fs.readFileSync(playerPath);
const freshPlayer = () =>
  new FBXLoader().parse(
    playerBytes.buffer.slice(
      playerBytes.byteOffset,
      playerBytes.byteOffset + playerBytes.byteLength,
    ),
    `${path.dirname(playerPath)}/`,
  );

const libraryBytes = fs.readFileSync(swordLibraryPath);
const library = await new GLTFLoader().parseAsync(
  libraryBytes.buffer.slice(
    libraryBytes.byteOffset,
    libraryBytes.byteOffset + libraryBytes.byteLength,
  ),
  `${path.dirname(swordLibraryPath)}/`,
);
const swordClip = library.animations.find(
  (clip) => clip.name === "Sword_Regular_B",
);
if (!swordClip) throw new Error("UAL2 Sword_Regular_B is missing.");

const PLAYER_SCALE = 1.80352265;
const GUITAR_SCALE = 1 / PLAYER_SCALE;
const GUITAR_SOURCE_CENTER = new THREE.Vector3(0, 0.4990234375, 0);
const ACTIVE_SOCKET = new THREE.Matrix4().compose(
  new THREE.Vector3(0.003 * GUITAR_SCALE, -0.022 * GUITAR_SCALE, 0.7 * GUITAR_SCALE),
  new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2,
  ),
  new THREE.Vector3(GUITAR_SCALE, GUITAR_SCALE, GUITAR_SCALE),
);
const ACTIVE_SOCKET_INVERSE = ACTIVE_SOCKET.clone().invert();
const STOWED_SOCKET = new THREE.Matrix4().compose(
  new THREE.Vector3(
    -0.18,
    0.04 - 0.4990234375 / PLAYER_SCALE,
    -0.12,
  ),
  new THREE.Quaternion(0.38268343, 0.92387953, 0, 0),
  new THREE.Vector3(GUITAR_SCALE, GUITAR_SCALE, GUITAR_SCALE),
);

// Stable composition reference from the contact-safe v4 ready frame, flipped
// around the guitar center so the +Y neck points toward Steve's left hand.
const READY_CENTER = new THREE.Vector3(0.1, 0.75, 0.12);
const SWING_ROTATION = new THREE.Quaternion(
  -0.3958328477259333,
  -0.4476780418104576,
  0.6029565475444641,
  -0.5285301642563176,
).normalize();
const READY_ROTATION = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * 0.3)
  .multiply(SWING_ROTATION)
  .normalize();
const READY_TORSO_DELTAS = {
  mixamorigSpine: new THREE.Quaternion(0, 0, 0, 1),
  mixamorigSpine1: new THREE.Quaternion(
    -0.00060908,
    0.03489418,
    -0.01744177,
    0.99923862,
  ),
  mixamorigSpine2: new THREE.Quaternion(
    -0.00243447,
    0.06971398,
    -0.03481448,
    0.99695636,
  ),
};

const TRACK_BONES = [
  "mixamorigSpine",
  "mixamorigSpine1",
  "mixamorigSpine2",
  "mixamorigRightShoulder",
  "mixamorigRightArm",
  "mixamorigRightForeArm",
  "mixamorigRightHand",
  "mixamorigLeftShoulder",
  "mixamorigLeftArm",
  "mixamorigLeftForeArm",
  "mixamorigLeftHand",
];

const sourceScene = cloneSkeleton(library.scene);
const sourceMixer = new THREE.AnimationMixer(sourceScene);
sourceMixer.clipAction(swordClip).play();
const sampleSword = (frame) => {
  sourceMixer.setTime(frame / 30);
  sourceScene.updateMatrixWorld(true);
  const handPosition = new THREE.Vector3();
  const handRotation = new THREE.Quaternion();
  const leftHandPosition = new THREE.Vector3();
  sourceScene.getObjectByName("hand_r").getWorldPosition(handPosition);
  sourceScene.getObjectByName("hand_r").getWorldQuaternion(handRotation);
  sourceScene.getObjectByName("hand_l").getWorldPosition(leftHandPosition);
  return {
    handPosition,
    handRotation,
    leftHandPosition,
    jointRotations: Object.fromEntries(
      ["spine_02", "spine_03"].map((boneName) => [
        boneName,
        sourceScene.getObjectByName(boneName).quaternion.clone(),
      ]),
    ),
  };
};
const swordStart = sampleSword(0);
const swordMiddle = sampleSword(8);
const swordFollowThrough = sampleSword(16);

const createBasePose = (frame) => {
  const scene = freshPlayer();
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(scene.animations[0]).play();
  mixer.setTime(frame / 30);
  scene.updateMatrixWorld(true);
  return {
    scene,
    baseRotations: Object.fromEntries(
      TRACK_BONES.map((boneName) => [
        boneName,
        scene.getObjectByName(boneName).quaternion.clone(),
      ]),
    ),
  };
};

const applyAdditivePose = (scene, baseRotations, deltas) => {
  Object.entries(deltas).forEach(([boneName, delta]) => {
    const quaternion = Array.isArray(delta)
      ? new THREE.Quaternion(...delta)
      : delta;
    scene
      .getObjectByName(boneName)
      .quaternion.copy(baseRotations[boneName])
      .multiply(quaternion)
      .normalize();
  });
  scene.updateMatrixWorld(true);
};

const solveHandPosition = (scene, side, target) => {
  const chain = ["Shoulder", "Arm", "ForeArm", "Hand"].map((segment) =>
    scene.getObjectByName(`mixamorig${side}${segment}`),
  );
  const hand = chain[3];
  const jointPosition = new THREE.Vector3();
  const handPosition = new THREE.Vector3();
  const toHand = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const worldDelta = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const localDelta = new THREE.Quaternion();
  for (let iteration = 0; iteration < 80; iteration += 1) {
    for (let index = 2; index >= 0; index -= 1) {
      scene.updateMatrixWorld(true);
      chain[index].getWorldPosition(jointPosition);
      hand.getWorldPosition(handPosition);
      toHand.subVectors(handPosition, jointPosition);
      toTarget.subVectors(target, jointPosition);
      if (toHand.lengthSq() < 0.000001 || toTarget.lengthSq() < 0.000001) {
        continue;
      }
      worldDelta.setFromUnitVectors(toHand.normalize(), toTarget.normalize());
      chain[index].parent.getWorldQuaternion(parentWorld);
      localDelta
        .copy(parentWorld)
        .invert()
        .multiply(worldDelta)
        .multiply(parentWorld);
      chain[index].quaternion.premultiply(localDelta).normalize();
    }
  }
  scene.updateMatrixWorld(true);
  hand.getWorldPosition(handPosition);
  return handPosition.distanceTo(target);
};

const setWorldRotation = (scene, boneName, worldRotation) => {
  const bone = scene.getObjectByName(boneName);
  const parentWorld = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorld);
  bone.quaternion
    .copy(parentWorld.invert().multiply(worldRotation))
    .normalize();
  scene.updateMatrixWorld(true);
};

const extractAdditivePose = (scene, baseRotations) =>
  Object.fromEntries(
    TRACK_BONES.map((boneName) => {
      let quaternion = baseRotations[boneName]
        .clone()
        .invert()
        .multiply(scene.getObjectByName(boneName).quaternion)
        .normalize();
      if (quaternion.w < 0) {
        quaternion = new THREE.Quaternion(
          -quaternion.x,
          -quaternion.y,
          -quaternion.z,
          -quaternion.w,
        );
      }
      return [
        boneName,
        quaternion.toArray().map((value) => Number(value.toFixed(8))),
      ];
    }),
  );

const guitarOriginForCenter = (center, rotation) =>
  center
    .clone()
    .sub(
      GUITAR_SOURCE_CENTER.clone()
        .multiplyScalar(GUITAR_SCALE)
        .applyQuaternion(rotation),
    );

const guitarMatrix = (center, rotation) =>
  new THREE.Matrix4().compose(
    guitarOriginForCenter(center, rotation),
    rotation,
    new THREE.Vector3(GUITAR_SCALE, GUITAR_SCALE, GUITAR_SCALE),
  );

const readyGuitar = guitarMatrix(READY_CENTER, READY_ROTATION);
const guitarMotionFromSword = (sample, followThrough = false) => {
  const sourceTranslation = sample.handPosition
    .clone()
    .sub(swordStart.handPosition);
  const center = READY_CENTER.clone().add(
    new THREE.Vector3(
      // Retain the sword clip's broad right-to-left hand travel while keeping
      // Steve's root gameplay-authoritative. Moving the prop and arms through
      // this arc reads as a real horizontal strike instead of a torso twist.
      sourceTranslation.x * 0.17,
      sourceTranslation.y * 0.1,
      sourceTranslation.z * 0.1,
    ),
  );
  const spineDelta = swordStart.jointRotations.spine_03
    .clone()
    .invert()
    .multiply(sample.jointRotations.spine_03);
  const sourceYaw = new THREE.Euler().setFromQuaternion(
    spineDelta,
    "YXZ",
  ).y;
  const strikePlane = new THREE.Quaternion()
    .setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      followThrough ? -Math.PI * 0.14 : 0,
    )
    .multiply(SWING_ROTATION)
    .normalize();
  const rotation = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), sourceYaw * 0.55)
    .multiply(strikePlane)
    .normalize();
  return guitarMatrix(center, rotation);
};

const retargetTorsoMotion = (scene, sourceSample) => {
  const mappings = [
    ["spine_02", "mixamorigSpine1"],
    ["spine_03", "mixamorigSpine2"],
  ];
  for (const [sourceName, targetName] of mappings) {
    const sourceDelta = swordStart.jointRotations[sourceName]
      .clone()
      .invert()
      .multiply(sourceSample.jointRotations[sourceName]);
    const weightedDelta = new THREE.Quaternion().slerp(sourceDelta, 0.62);
    sourceMixer.setTime(0);
    sourceScene.updateMatrixWorld(true);
    const sourceBasis = new THREE.Quaternion();
    sourceScene.getObjectByName(sourceName).getWorldQuaternion(sourceBasis);
    scene.updateMatrixWorld(true);
    const targetBone = scene.getObjectByName(targetName);
    const targetBasis = new THREE.Quaternion();
    targetBone.getWorldQuaternion(targetBasis);
    const targetDelta = targetBasis
      .clone()
      .invert()
      .multiply(sourceBasis)
      .multiply(weightedDelta)
      .multiply(sourceBasis.clone().invert())
      .multiply(targetBasis)
      .normalize();
    targetBone.quaternion.multiply(targetDelta).normalize();
    scene.updateMatrixWorld(true);
  }
};

const solveTwoHandedFrame = (
  frame,
  guitar,
  initialPose,
  swordSample,
  rightHandGripRotation = null,
) => {
  const { scene, baseRotations } = createBasePose(frame);
  applyAdditivePose(scene, baseRotations, initialPose);
  if (swordSample) retargetTorsoMotion(scene, swordSample);

  const leftHandMatrix = guitar.clone().multiply(ACTIVE_SOCKET_INVERSE);
  const leftPosition = new THREE.Vector3();
  const leftRotation = new THREE.Quaternion();
  leftHandMatrix.decompose(
    leftPosition,
    leftRotation,
    new THREE.Vector3(),
  );
  const leftError = solveHandPosition(scene, "Left", leftPosition);
  setWorldRotation(scene, "mixamorigLeftHand", leftRotation);

  const rightPosition = new THREE.Vector3(-0.003, 0.48, 0.022).applyMatrix4(
    guitar,
  );
  const rightError = solveHandPosition(scene, "Right", rightPosition);
  const guitarRotation = new THREE.Quaternion();
  guitar.decompose(
    new THREE.Vector3(),
    guitarRotation,
    new THREE.Vector3(),
  );
  if (rightHandGripRotation) {
    setWorldRotation(
      scene,
      "mixamorigRightHand",
      guitarRotation.clone().multiply(rightHandGripRotation),
    );
  }
  const rightActual = new THREE.Vector3();
  const rightActualRotation = new THREE.Quaternion();
  const rightShoulder = new THREE.Vector3();
  scene.getObjectByName("mixamorigRightHand").getWorldPosition(rightActual);
  scene
    .getObjectByName("mixamorigRightHand")
    .getWorldQuaternion(rightActualRotation);
  scene
    .getObjectByName("mixamorigRightShoulder")
    .getWorldPosition(rightShoulder);
  return {
    pose: extractAdditivePose(scene, baseRotations),
    leftError,
    rightError,
    guitar,
    rightPosition,
    rightActual,
    rightGripRotation: guitarRotation
      .clone()
      .invert()
      .multiply(rightActualRotation)
      .normalize(),
    rightShoulder,
  };
};

const solveLeftPoleFrame = (frame, handDelta) => {
  const { scene, baseRotations } = createBasePose(frame);
  const leftPosition = new THREE.Vector3();
  scene
    .getObjectByName("mixamorigLeftShoulder")
    .getWorldPosition(leftPosition);
  leftPosition.add(
    new THREE.Vector3(0.16, 0.04, -0.015),
  );
  const leftError = solveHandPosition(scene, "Left", leftPosition);
  scene
    .getObjectByName("mixamorigLeftHand")
    .quaternion.copy(baseRotations.mixamorigLeftHand)
    .multiply(handDelta)
    .normalize();
  scene.updateMatrixWorld(true);
  const leftHandMatrix = scene
    .getObjectByName("mixamorigLeftHand")
    .matrixWorld.clone();
  return {
    pose: extractAdditivePose(scene, baseRotations),
    leftError,
    rightError: 0,
    leftHandMatrix,
    guitar: leftHandMatrix.clone().multiply(ACTIVE_SOCKET),
  };
};

const solveStowedLatchFrame = (frame) => {
  const { scene, baseRotations } = createBasePose(frame);
  const stowedGuitar = scene
    .getObjectByName("mixamorigSpine2")
    .matrixWorld.clone()
    .multiply(STOWED_SOCKET);
  const leftHandMatrix = stowedGuitar.clone().multiply(ACTIVE_SOCKET_INVERSE);
  const leftPosition = new THREE.Vector3();
  const leftRotation = new THREE.Quaternion();
  leftHandMatrix.decompose(
    leftPosition,
    leftRotation,
    new THREE.Vector3(),
  );
  const leftError = solveHandPosition(scene, "Left", leftPosition);
  setWorldRotation(scene, "mixamorigLeftHand", leftRotation);
  return {
    pose: extractAdditivePose(scene, baseRotations),
    leftError,
    rightError: 0,
    leftHandMatrix,
    guitar: stowedGuitar,
  };
};
const frame2 = solveStowedLatchFrame(2);
const frame5Seed = solveTwoHandedFrame(
  5,
  readyGuitar,
  READY_TORSO_DELTAS,
  null,
);
const rightHandGripRotation = frame5Seed.rightGripRotation;
const frame5 = solveTwoHandedFrame(
  5,
  readyGuitar,
  READY_TORSO_DELTAS,
  null,
  rightHandGripRotation,
);
const frame4HandDelta = new THREE.Quaternion(
  ...frame2.pose.mixamorigLeftHand,
).slerp(
  new THREE.Quaternion(...frame5.pose.mixamorigLeftHand),
  0.68,
);
const frame4 = solveLeftPoleFrame(4, frame4HandDelta);
const frame9 = solveTwoHandedFrame(
  9,
  guitarMotionFromSword(swordMiddle),
  frame5.pose,
  swordMiddle,
  rightHandGripRotation,
);
const frame13 = solveTwoHandedFrame(
  13,
  guitarMotionFromSword(swordFollowThrough, true),
  frame5.pose,
  swordFollowThrough,
  rightHandGripRotation,
);
const frame16HandDelta = new THREE.Quaternion(
  ...frame13.pose.mixamorigLeftHand,
).slerp(new THREE.Quaternion(), 0.62);
const frame16 = solveLeftPoleFrame(16, frame16HandDelta);
const frame18 = solveStowedLatchFrame(18);

const handPositionForGuitar = (matrix) => {
  const handMatrix = matrix.clone().multiply(ACTIVE_SOCKET_INVERSE);
  return new THREE.Vector3().setFromMatrixPosition(handMatrix);
};
const drawPath = [
  handPositionForGuitar(frame2.guitar),
  handPositionForGuitar(frame4.guitar),
  handPositionForGuitar(readyGuitar),
];
const minimumPathRadius = (pathPoints) => {
  let minimumRadius = Number.POSITIVE_INFINITY;
  for (let segment = 0; segment < pathPoints.length - 1; segment += 1) {
    for (let step = 0; step <= 20; step += 1) {
      const point = pathPoints[segment]
        .clone()
        .lerp(pathPoints[segment + 1], step / 20);
      minimumRadius = Math.min(
        minimumRadius,
        Math.hypot(point.x, point.z),
      );
    }
  }
  return minimumRadius;
};
const minimumDrawRadius = minimumPathRadius(drawPath);
const recoveryPath = [
  handPositionForGuitar(frame13.guitar),
  handPositionForGuitar(frame16.guitar),
  handPositionForGuitar(frame18.guitar),
];
const minimumRecoveryRadius = minimumPathRadius(recoveryPath);
if (minimumDrawRadius < 0.12 || minimumRecoveryRadius < 0.12) {
  throw new Error(
    `Left-hand attachment path entered torso clearance: ${JSON.stringify({ minimumDrawRadius, minimumRecoveryRadius, drawPath: drawPath.map((point) => point.toArray()), recoveryPath: recoveryPath.map((point) => point.toArray()) })}`,
  );
}

console.error(
  JSON.stringify({
    source: swordClip.name,
    errors: {
      frame2: [frame2.leftError, frame2.rightError],
      frame4: [frame4.leftError, frame4.rightError],
      frame5: [frame5.leftError, frame5.rightError],
      frame9: [frame9.leftError, frame9.rightError],
      frame13: [frame13.leftError, frame13.rightError],
      frame16: [frame16.leftError, frame16.rightError],
      frame18: [frame18.leftError, frame18.rightError],
    },
    minimumDrawRadius,
    minimumRecoveryRadius,
    frame9Right: {
      target: frame9.rightPosition.toArray(),
      actual: frame9.rightActual.toArray(),
      shoulder: frame9.rightShoulder.toArray(),
      shoulderDistance: frame9.rightShoulder.distanceTo(frame9.rightPosition),
    },
    libraryHandMotion: [swordStart, swordMiddle, swordFollowThrough].map(
      (sample) => ({
        rightPosition: sample.handPosition.toArray(),
        rightRotation: sample.handRotation.toArray(),
        leftPosition: sample.leftHandPosition.toArray(),
      }),
    ),
  }),
);
for (const boneName of TRACK_BONES) {
  const poses = [
    frame2.pose[boneName],
    frame4.pose[boneName],
    frame5.pose[boneName],
    frame9.pose[boneName],
    frame13.pose[boneName],
    frame16.pose[boneName],
    frame18.pose[boneName],
  ];
  for (let index = 1; index < poses.length; index += 1) {
    const dot = poses[index].reduce(
      (total, component, componentIndex) =>
        total + component * poses[index - 1][componentIndex],
      0,
    );
    if (dot < 0) poses[index] = poses[index].map((component) => -component);
  }
  console.log(
    `${boneName}: ${JSON.stringify(poses)},`,
  );
}
