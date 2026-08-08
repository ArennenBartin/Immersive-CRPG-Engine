import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import {
  GamePackageSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import {
  BUNDLED_PLAYER_GUITAR_ANIMATION_OVERRIDE,
  BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM,
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP,
  BUNDLED_PLAYER_MODEL_SCALE,
  BUNDLED_PLAYER_IDLE_MODEL,
  PLAYER_COLLISION_HEIGHT,
  PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  PLAYER_GUITAR_ATTACK_CLIP_ID,
  PLAYER_GUITAR_ATTACK_CLIP_NAME,
  PLAYER_IDLE_FBX_CLIP,
  PLAYER_IDLE_FBX_MODEL_ID,
  PLAYER_STEALTH_WALK_FBX_CLIP,
  PLAYER_WALK_FBX_CLIP,
  getPlayerModelOptions,
  resolvePlayerElectricGuitarObject,
  resolvePlayerLocomotionClip,
  resolvePlayerModelObject,
  shouldHoldPlayerLocomotionPose,
  withBundledPlayerElectricGuitarObject,
  withBundledPlayerGuitarContent,
} from "../src/data/playerModelAssets";
import {
  BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL,
  PLAYER_ELECTRIC_GUITAR_GRIP_POINT,
} from "../src/data/playerGuitarAssets";
import {
  RILEY_BUNDLED_ASSET_REVISION,
  RILEY_RIGGED_MODEL,
  RILEY_SEATED_IDLE_CLIP,
} from "../src/data/rileyAssets";
import {
  loadModelFromAssetDataUrl,
  parseFbxAssetSource,
} from "../src/utils/gltfModelIO";
import {
  compileAuthoredAnimationClip,
} from "../src/utils/modelAnimation";
import {
  ASSET_ADDITIVE_REFERENCE_FADE_SECONDS,
  PLAYER_GUITAR_DRAW_LATCH_CLIP_PROGRESS,
  PLAYER_GUITAR_DRAW_LATCH_PROGRESS,
  PLAYER_GUITAR_STOW_LATCH_CLIP_PROGRESS,
  PLAYER_GUITAR_STOW_LATCH_PROGRESS,
  PERFORMANCE_FOLIAGE_INSTANCE_CHUNK_SIZE,
  chunkStaticAssetModelInstances,
  resolveAssetAttachmentActiveBoneName,
  resolveAssetAttachmentPathOffset,
  resolvePlayerGuitarAttachmentLatchAtClipProgress,
  resolvePlayerGuitarAttachmentLatchAtProgress,
} from "../src/components/ObjectRenderers";

class TestImage {
  addEventListener() {}
  removeEventListener() {}
  set src(_value: string) {}
}

const testUrl = {
  createObjectURL: () => "blob:model-animation-contract",
  revokeObjectURL: () => undefined,
};

Object.assign(globalThis, {
  document: {
    createElementNS: () => new TestImage(),
  },
  self: { URL: testUrl },
  window: { URL: testUrl },
});

const modelPath = resolve(
  process.cwd(),
  "public/models/player/Idle.fbx",
);
const walkingPath = resolve(
  process.cwd(),
  "public/models/player/Walking.fbx",
);
const stealthWalkingPath = resolve(
  process.cwd(),
  "public/models/player/Crouched Walking.fbx",
);
const guitarPath = resolve(
  process.cwd(),
  "public/models/player/electric-guitar.glb",
);
const file = readFileSync(modelPath);
const walkingFile = readFileSync(walkingPath);
const stealthWalkingFile = readFileSync(stealthWalkingPath);
const guitarFile = readFileSync(guitarPath);
const rileyPath = resolve(
  process.cwd(),
  "public/models/entities/riley-rigged.glb",
);
const rileyFile = readFileSync(rileyPath);

const staticAssetChunks = chunkStaticAssetModelInstances([
  { key: "west", position: [-10.1, 0, 1], rotationY: 0 },
  { key: "center", position: [0, 0, 0], rotationY: 0 },
  { key: "east", position: [10.1, 0, -1], rotationY: 0 },
  { key: "same-east", position: [11.4, 0, -2], rotationY: 0 },
]);
assert.equal(
  staticAssetChunks.length,
  3,
  "static assets must split into spatially bounded instance chunks",
);
assert.deepEqual(
  staticAssetChunks
    .flatMap((chunk) => chunk.instances.map((instance) => instance.key))
    .sort(),
  ["center", "east", "same-east", "west"],
  "chunking must conserve every authored static asset instance exactly once",
);
assert.ok(
  PERFORMANCE_FOLIAGE_INSTANCE_CHUNK_SIZE > 2 * 10,
  "foliage batches must be large enough to avoid excessive forest draw calls",
);

const parseGlbJson = (buffer: Buffer) => {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, "guitar must be a GLB");
  assert.equal(buffer.readUInt32LE(4), 2, "guitar must use glTF 2.0");
  assert.equal(
    buffer.readUInt32LE(8),
    buffer.byteLength,
    "guitar GLB header must match its file length",
  );
  let offset = 12;
  while (offset < buffer.byteLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
    if (type === 0x4e4f534a) {
      return JSON.parse(chunk.toString("utf8").replace(/[\0\s]+$/u, ""));
    }
  }
  throw new Error("guitar GLB has no JSON chunk");
};

const guitarJson = parseGlbJson(guitarFile);
const rileyJson = parseGlbJson(rileyFile);
const rileyAnimation = rileyJson.animations?.find(
  (animation: { name?: string }) => animation.name === RILEY_SEATED_IDLE_CLIP,
);
const rileyAnimatedNodes = new Set(
  (rileyAnimation?.channels || []).map(
    (channel: { target: { node: number } }) =>
      rileyJson.nodes[channel.target.node]?.name,
  ),
);
assert.equal(
  rileyFile.byteLength,
  RILEY_RIGGED_MODEL.asset?.stats?.bytes,
  "Riley metadata must match the shipped seated-idle GLB",
);
assert.ok(
  RILEY_RIGGED_MODEL.tags.includes(RILEY_BUNDLED_ASSET_REVISION),
  "Riley's bundled revision must invalidate persisted pre-fix metadata",
);
assert.equal(
  rileyAnimation?.channels.length,
  80,
  "Riley's supplied seated idle must export its complete authored pose",
);
assert.equal(
  (rileyAnimation?.channels || []).some(
    (channel: { target: { path: string } }) => channel.target.path === "scale",
  ),
  false,
  "Riley's seated idle must not retain redundant scale animation",
);
assert.equal(
  (rileyAnimation?.samplers || []).every(
    (sampler: { interpolation?: string }) =>
      (sampler.interpolation || "LINEAR") === "LINEAR",
  ),
  true,
  "Riley's densely keyed seated idle must remain linear to prevent cubic joint twitch",
);
for (const boneName of [
  "mixamorig:Hips",
  "mixamorig:LeftUpLeg",
  "mixamorig:LeftLeg",
  "mixamorig:RightUpLeg",
  "mixamorig:RightLeg",
  "mixamorig:LeftArm",
  "mixamorig:LeftForeArm",
  "mixamorig:RightArm",
  "mixamorig:RightForeArm",
]) {
  assert.ok(
    rileyAnimatedNodes.has(boneName),
    `Riley's seated idle must animate ${boneName}`,
  );
}
assert.equal(
  guitarFile.byteLength,
  BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL.asset?.stats?.bytes,
  "bundled guitar metadata must match the optimized GLB",
);
assert.ok(statSync(guitarPath).isFile(), "the bundled guitar GLB must exist");
assert.equal(guitarJson.nodes.length, 1, "guitar must remain one scene node");
assert.equal(guitarJson.meshes.length, 1, "guitar must remain one mesh");
assert.equal(
  guitarJson.meshes[0].primitives.length,
  1,
  "guitar must remain one render primitive",
);
assert.equal(
  guitarJson.accessors[0].count,
  BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL.asset?.stats?.vertices,
  "guitar metadata must match its position accessor",
);
assert.equal(
  guitarJson.accessors[3].count / 3,
  BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL.asset?.stats?.triangles,
  "guitar metadata must match its triangle index accessor",
);
assert.deepEqual(
  guitarJson.accessors[2].min,
  [0.000732421875, 0.067626953125],
  "optimized GLB must repair the source's incorrect UV minimum",
);
assert.equal(
  guitarJson.extensionsUsed,
  undefined,
  "optimized GLB must omit unused exporter extensions",
);
assert.ok(
  guitarJson.bufferViews[guitarJson.images[0].bufferView].byteLength < 150_000,
  "the embedded 1K guitar texture must stay within its optimization budget",
);

assert.equal(
  file.byteLength,
  BUNDLED_PLAYER_IDLE_MODEL.asset?.stats?.bytes,
  "bundled FBX metadata must match the shipped file",
);
assert.ok(statSync(modelPath).isFile(), "the bundled player FBX must exist");

const source = file.buffer.slice(
  file.byteOffset,
  file.byteOffset + file.byteLength,
);
const loaded = parseFbxAssetSource(source);
const walkingSource = walkingFile.buffer.slice(
  walkingFile.byteOffset,
  walkingFile.byteOffset + walkingFile.byteLength,
);
const loadedWalking = parseFbxAssetSource(walkingSource);
const stealthWalkingSource = stealthWalkingFile.buffer.slice(
  stealthWalkingFile.byteOffset,
  stealthWalkingFile.byteOffset + stealthWalkingFile.byteLength,
);
const loadedStealthWalking = parseFbxAssetSource(stealthWalkingSource);
const clip = loaded.animations.find(
  (candidate) => candidate.name === PLAYER_IDLE_FBX_CLIP,
);
let skinnedMeshes = 0;
let bones = 0;
const idleBoneNames: string[] = [];
const walkingBoneNames: string[] = [];
const stealthWalkingBoneNames: string[] = [];
loaded.scene.traverse((node) => {
  if ((node as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshes += 1;
  if ((node as { isBone?: boolean }).isBone) {
    bones += 1;
    idleBoneNames.push(node.name);
  }
});
loadedWalking.scene.traverse((node) => {
  if ((node as { isBone?: boolean }).isBone) {
    walkingBoneNames.push(node.name);
  }
});
loadedStealthWalking.scene.traverse((node) => {
  if ((node as { isBone?: boolean }).isBone) {
    stealthWalkingBoneNames.push(node.name);
  }
});

assert.ok(skinnedMeshes > 0, "the FBX must retain a skinned player mesh");
assert.ok(bones > 0, "the FBX must retain its bone rig");
assert.ok(clip, "the authored idle animation clip must be present");
assert.ok(
  (clip?.duration || 0) > 4 && (clip?.duration || 0) < 4.2,
  "the authored idle duration must remain intact",
);
assert.equal(
  clip?.tracks.length,
  BUNDLED_PLAYER_IDLE_MODEL.asset?.animation_clips?.[0]?.tracks,
  "the bundled clip metadata must match the parsed animation",
);
assert.deepEqual(
  walkingBoneNames,
  idleBoneNames,
  "the walking animation must target the exact player skeleton",
);
assert.deepEqual(
  stealthWalkingBoneNames,
  idleBoneNames,
  "the crouched walking animation must target the exact player skeleton",
);
assert.equal(
  loadedStealthWalking.animations[0]?.duration,
  BUNDLED_PLAYER_IDLE_MODEL.asset?.animation_clips?.find(
    (candidate) => candidate.name === PLAYER_STEALTH_WALK_FBX_CLIP,
  )?.duration,
  "the crouched walking duration metadata must match the supplied FBX",
);
assert.equal(
  loadedStealthWalking.animations[0]?.tracks.length,
  BUNDLED_PLAYER_IDLE_MODEL.asset?.animation_clips?.find(
    (candidate) => candidate.name === PLAYER_STEALTH_WALK_FBX_CLIP,
  )?.tracks,
  "the crouched walking track metadata must match the supplied FBX",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.id,
  PLAYER_GUITAR_ATTACK_CLIP_ID,
  "guitar attack clip must retain its deterministic ID",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.name,
  PLAYER_GUITAR_ATTACK_CLIP_NAME,
  "guitar attack clip must retain its authored name",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.tracks.length,
  11,
  "guitar attack must animate the upper torso and both arm chains",
);
BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.tracks.forEach((track) => {
  assert.ok(
    idleBoneNames.includes(track.target_node),
    `guitar attack track must target a real player bone: ${track.target_node}`,
  );
  assert.deepEqual(
    track.keyframes.map((keyframe) => keyframe.frame),
    [0, 2, 4, 5, 9, 13, 16, 18, 20],
    `guitar attack track must preserve its action phase frames: ${track.id}`,
  );
  assert.deepEqual(
    track.keyframes[0]?.value,
    [0, 0, 0, 1],
    `guitar attack must begin from the additive identity pose: ${track.id}`,
  );
  assert.deepEqual(
    track.keyframes.at(-1)?.value,
    [0, 0, 0, 1],
    `guitar attack must return to the additive identity pose: ${track.id}`,
  );
  track.keyframes.forEach((keyframe) => {
    const magnitude = Math.hypot(...keyframe.value);
    assert.ok(
      Math.abs(magnitude - 1) < 0.000001,
      `guitar attack quaternion must remain normalized: ${track.id}`,
    );
  });
});
const compiledGuitarClip = compileAuthoredAnimationClip(
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP,
);
compiledGuitarClip.tracks.forEach((track) => {
  if (!(track instanceof THREE.QuaternionKeyframeTrack)) return;
  const values = Array.from(track.values);
  for (let offset = 4; offset < values.length; offset += 4) {
    const dot =
      values[offset - 4] * values[offset] +
      values[offset - 3] * values[offset + 1] +
      values[offset - 2] * values[offset + 2] +
      values[offset - 1] * values[offset + 3];
    assert.ok(
      dot >= 0,
      `compiled guitar quaternions must retain hemisphere continuity: ${track.name}`,
    );
  }
});
const guitarLeftHandTrack = BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.tracks.find(
  (track) => track.target_node === "mixamorigLeftHand",
);
assert.notDeepEqual(
  guitarLeftHandTrack?.keyframes[1]?.value,
  [0, 0, 0, 1],
  "the left hand must visibly reach the guitar neck by frame 2",
);
assert.notDeepEqual(
  guitarLeftHandTrack?.keyframes[1]?.value,
  guitarLeftHandTrack?.keyframes[2]?.value,
  "the left hand must carry the guitar around an exterior shoulder pole",
);
assert.notDeepEqual(
  guitarLeftHandTrack?.keyframes[3]?.value,
  guitarLeftHandTrack?.keyframes[4]?.value,
  "the UAL2-derived strike must move out of the over-shoulder ready pose",
);
assert.notDeepEqual(
  guitarLeftHandTrack?.keyframes[7]?.value,
  guitarLeftHandTrack?.keyframes[1]?.value,
  "the frame-18 latch must be solved against its own changing idle base",
);
const guitarRightArmTrack = BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.tracks.find(
  (track) => track.target_node === "mixamorigRightArm",
);
assert.deepEqual(
  guitarRightArmTrack?.keyframes[2]?.value,
  [0, 0, 0, 1],
  "the right hand must stay free while the left hand draws the guitar",
);
assert.notDeepEqual(
  guitarRightArmTrack?.keyframes[3]?.value,
  [0, 0, 0, 1],
  "the right hand must join the two-handed ready pose by frame 5",
);
const guitarRightHandTrack = BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.tracks.find(
  (track) => track.target_node === "mixamorigRightHand",
);
assert.notDeepEqual(
  guitarRightHandTrack?.keyframes[4]?.value,
  [0, 0, 0, 1],
  "the support hand must retain its guitar-relative grip orientation at impact",
);
assert.notDeepEqual(
  guitarRightHandTrack?.keyframes[4]?.value,
  guitarRightHandTrack?.keyframes[5]?.value,
  "the support wrist must follow the guitar through the strike",
);
const guitarSpine2Track = BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.tracks.find(
  (track) => track.target_node === "mixamorigSpine2",
);
assert.notDeepEqual(
  guitarSpine2Track?.keyframes[3]?.value,
  guitarSpine2Track?.keyframes[4]?.value,
  "the sword-library torso sweep must reach a distinct frame-9 impact pose",
);
assert.notDeepEqual(
  guitarSpine2Track?.keyframes[4]?.value,
  guitarSpine2Track?.keyframes[5]?.value,
  "the sword-library motion must retain its follow-through through frame 13",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE.id,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  "guitar animation profile must retain its deterministic ID",
);
assert.deepEqual(
  BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE.action_bindings[0]?.phase_markers,
  {
    windup_end_frame: 9,
    impact_frame: 9,
    active_end_frame: 13,
  },
  "guitar animation phases must stay synchronized with combat timing",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE.action_bindings[0]?.crossfade_ms,
  0,
  "the identity-starting action must reach full weight before the frame-2 latch",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ANIMATION_OVERRIDE.profile_id,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  "bundled player override must select the guitar profile",
);
assert.equal(
  loadedWalking.animations[0]?.tracks.length,
  53,
  "the walking animation must retain every authored track",
);
assert.ok(
  Math.abs(
    (BUNDLED_PLAYER_IDLE_MODEL.asset?.source_bounds?.[1] || 0) *
      BUNDLED_PLAYER_MODEL_SCALE -
      PLAYER_COLLISION_HEIGHT,
  ) < 0.000001,
  "the bundled player model must scale to the player collision height",
);
assert.ok(
  Math.abs(
    BUNDLED_PLAYER_IDLE_MODEL.bounds[1] - PLAYER_COLLISION_HEIGHT,
  ) < 0.000001,
  "the bundled player bounds must match the player collision height",
);

const runtimeAsset = structuredClone(BUNDLED_PLAYER_IDLE_MODEL.asset);
assert.ok(runtimeAsset, "the bundled player must have an asset");
runtimeAsset.data_url = `data:application/octet-stream;base64,${file.toString("base64")}`;
assert.ok(
  runtimeAsset.animation_sources?.[0],
  "the player asset must declare its walking source",
);
runtimeAsset.animation_sources[0].data_url =
  `data:application/octet-stream;base64,${walkingFile.toString("base64")}`;
const runtimeStealthWalkSource = runtimeAsset.animation_sources.find(
  (candidate) => candidate.clip_name === PLAYER_STEALTH_WALK_FBX_CLIP,
);
assert.ok(
  runtimeStealthWalkSource,
  "the player asset must declare its crouched walking source",
);
runtimeStealthWalkSource.data_url =
  `data:application/octet-stream;base64,${stealthWalkingFile.toString("base64")}`;
const runtimeLoaded = await loadModelFromAssetDataUrl(runtimeAsset);
assert.ok(
  runtimeLoaded.animations.some(
    (candidate) => candidate.name === PLAYER_WALK_FBX_CLIP,
  ),
  "external FBX clips must merge into the runtime model",
);
assert.ok(
  runtimeLoaded.animations.some(
    (candidate) => candidate.name === PLAYER_STEALTH_WALK_FBX_CLIP,
  ),
  "the crouched walking FBX must merge into the runtime player model",
);
assert.equal(
  resolvePlayerLocomotionClip(false),
  PLAYER_IDLE_FBX_CLIP,
  "a stationary player must use idle",
);
assert.equal(
  resolvePlayerLocomotionClip(true),
  PLAYER_WALK_FBX_CLIP,
  "a sliding player must use walk",
);
assert.equal(
  resolvePlayerLocomotionClip(true, true),
  PLAYER_STEALTH_WALK_FBX_CLIP,
  "a moving stealth player must use the supplied crouched walk",
);
assert.equal(
  resolvePlayerLocomotionClip(false, true),
  PLAYER_STEALTH_WALK_FBX_CLIP,
  "a stationary stealth player must retain the crouched animation",
);
assert.equal(
  shouldHoldPlayerLocomotionPose(false, true),
  true,
  "stealth entered at rest must hold the crouched clip's first frame",
);
assert.equal(
  shouldHoldPlayerLocomotionPose(true, true),
  false,
  "moving in stealth must advance the crouched clip",
);
assert.equal(
  shouldHoldPlayerLocomotionPose(false, false),
  false,
  "ordinary idle playback must remain animated normally",
);

const freshPackage = createEmptyGamePackage();
assert.equal(
  freshPackage.settings?.player_model_id,
  PLAYER_IDLE_FBX_MODEL_ID,
  "new projects must select the bundled animated player",
);
assert.equal(
  freshPackage.settings.player_animation_override?.profile_id,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  "new bundled-player projects must select the guitar action profile",
);
assert.ok(
  freshPackage.settings.player_visual_attachments?.some(
    (attachment) => attachment.id === BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.id,
  ),
  "new bundled-player projects must attach Steve's signature guitar",
);
assert.equal(
  resolvePlayerModelObject(freshPackage)?.id,
  PLAYER_IDLE_FBX_MODEL_ID,
  "the configured player model must resolve",
);
assert.ok(
  freshPackage.object_library.some(
    (object) => object.id === PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  ),
  "new projects must include the bundled guitar object",
);
assert.equal(
  resolvePlayerElectricGuitarObject(freshPackage).id,
  PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  "the configured player guitar must resolve",
);
assert.ok(
  !getPlayerModelOptions(freshPackage).some(
    (object) => object.id === PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  ),
  "the guitar attachment must not appear as a player body option",
);
const guitarTransform = BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM;
const scaledGrip = PLAYER_ELECTRIC_GUITAR_GRIP_POINT.map(
  (value, index) => value * guitarTransform.scale[index],
) as [number, number, number];
const [rotationX] = guitarTransform.rotation;
const transformedGrip: [number, number, number] = [
  guitarTransform.position[0] + scaledGrip[0],
  guitarTransform.position[1] +
    scaledGrip[1] * Math.cos(rotationX) -
    scaledGrip[2] * Math.sin(rotationX),
  guitarTransform.position[2] +
    scaledGrip[1] * Math.sin(rotationX) +
    scaledGrip[2] * Math.cos(rotationX),
];
assert.ok(
  transformedGrip.every((value) => Math.abs(value) < 0.000001),
  "the guitar attachment transform must place its grip at the hand origin",
);
assert.ok(
  Math.abs(guitarTransform.scale[0] * BUNDLED_PLAYER_MODEL_SCALE - 1) <
    0.000001,
  "the guitar attachment must cancel the inherited player scale",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket.bone_name,
  "mixamorigLeftHand",
  "the guitar neck must attach to the hand on its stowed shoulder",
);
assert.deepEqual(
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket.position,
  guitarTransform.position,
  "the active left-hand socket must keep the authored neck grip at the hand origin",
);
assert.deepEqual(
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket.quaternion,
  [Math.sin(rotationX / 2), 0, 0, Math.cos(rotationX / 2)],
  "the active left-hand socket must use the same neck-grip orientation as the pose generator",
);
const attachmentSocketMatrix = (
  socket: typeof BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket,
) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...socket.position),
    new THREE.Quaternion(...socket.quaternion),
    new THREE.Vector3(...socket.scale),
  );
const measureGuitarLatch = (frame: number) => {
  const evaluation = parseFbxAssetSource(source);
  const mixer = new THREE.AnimationMixer(evaluation.scene);
  const idleAction = mixer.clipAction(evaluation.animations[0]);
  idleAction.setLoop(THREE.LoopRepeat, Infinity).play();
  const guitarAction = mixer.clipAction(
    compileAuthoredAnimationClip(BUNDLED_PLAYER_GUITAR_ATTACK_CLIP),
  );
  guitarAction.setLoop(THREE.LoopOnce, 1).play();
  mixer.setTime(frame / BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.fps);
  evaluation.scene.updateMatrixWorld(true);
  const stowedWorld = evaluation.scene
    .getObjectByName(
      BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket.bone_name,
    )!
    .matrixWorld.clone()
    .multiply(
      attachmentSocketMatrix(
        BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket,
      ),
    );
  const activeWorld = evaluation.scene
    .getObjectByName(
      BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket.bone_name,
    )!
    .matrixWorld.clone()
    .multiply(
      attachmentSocketMatrix(
        BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket,
      ),
    );
  const stowedPosition = new THREE.Vector3();
  const activePosition = new THREE.Vector3();
  const stowedRotation = new THREE.Quaternion();
  const activeRotation = new THREE.Quaternion();
  stowedWorld.decompose(stowedPosition, stowedRotation, new THREE.Vector3());
  activeWorld.decompose(activePosition, activeRotation, new THREE.Vector3());
  return {
    positionError: stowedPosition.distanceTo(activePosition),
    angleError: stowedRotation.angleTo(activeRotation),
  };
};
[2, 18].forEach((frame) => {
  const latch = measureGuitarLatch(frame);
  assert.ok(
    latch.positionError < 0.00001,
    `frame ${frame} hand/back guitar sockets must coincide before relatching (${latch.positionError})`,
  );
  assert.ok(
    latch.angleError < 0.0001,
    `frame ${frame} hand/back guitar rotations must coincide before relatching (${latch.angleError})`,
  );
});
assert.equal(
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket.bone_name,
  "mixamorigSpine2",
  "stowed guitar must attach to the upper back",
);
const stowedSocket =
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket;
const [stowedQx, stowedQy, stowedQz, stowedQw] = stowedSocket.quaternion;
const stowedNeckDirection: [number, number, number] = [
  2 * (stowedQx * stowedQy - stowedQw * stowedQz),
  1 - 2 * (stowedQx * stowedQx + stowedQz * stowedQz),
  2 * (stowedQy * stowedQz + stowedQw * stowedQx),
];
assert.ok(
  stowedSocket.position[0] < 0 &&
    stowedSocket.position[1] > -0.3 &&
    stowedNeckDirection[0] > 0.69 &&
    stowedNeckDirection[1] > 0.69,
  "stowed guitar body must sit lower-right while its neck rises over Steve's left shoulder",
);
assert.ok(
  Math.abs(Math.hypot(...stowedSocket.quaternion) - 1) < 0.000001,
  "stowed guitar socket quaternion must be normalized",
);
assert.equal(
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.render_xray,
  true,
  "guitar must be present in the synchronized player x-ray pass",
);
assert.deepEqual(
  resolveAssetAttachmentPathOffset(
    0,
    PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  ),
  [0, 0, 0],
  "the guitar draw arc must begin exactly on its back socket",
);
const guitarMidDrawArc = resolveAssetAttachmentPathOffset(
  0.5,
  PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
);
assert.deepEqual(
  guitarMidDrawArc,
  [0, 0, 0],
  "the hand-latched guitar must not receive the obsolete right-shoulder arc",
);
assert.deepEqual(
  resolveAssetAttachmentPathOffset(
    1,
    PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  ).map((value) => Math.round(value * 1e12) / 1e12),
  [0, 0, 0],
  "the guitar draw arc must finish exactly on its hand socket",
);
assert.equal(
  resolveAssetAttachmentActiveBoneName(
    BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE,
  ),
  "mixamorigLeftHand",
  "the built-in guitar must remain latched to the animated neck-grip hand",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtProgress(
    PLAYER_GUITAR_DRAW_LATCH_PROGRESS - 0.000001,
  ),
  0,
  "the guitar must remain on Steve's back until the left hand reaches it",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtProgress(
    PLAYER_GUITAR_DRAW_LATCH_PROGRESS,
  ),
  1,
  "the guitar must latch at authored frame 2 without a torso-crossing blend",
);
assert.ok(
  ASSET_ADDITIVE_REFERENCE_FADE_SECONDS <
    (170 / 1000) * (2 / 9),
  "the idle upper-body reference must settle before a moving attack reaches its frame-2 latch",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtProgress(0.5),
  1,
  "the left hand must own the guitar throughout the swing",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtProgress(
    PLAYER_GUITAR_STOW_LATCH_PROGRESS - 0.000001,
  ),
  1,
  "the guitar must stay hand-latched until the return grip reaches its back",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtProgress(
    PLAYER_GUITAR_STOW_LATCH_PROGRESS,
  ),
  0,
  "the guitar must relatch to its stowed socket at authored frame 18",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtClipProgress(
    PLAYER_GUITAR_DRAW_LATCH_CLIP_PROGRESS,
  ),
  1,
  "Animation Studio preview must latch on its uniform frame-2 timeline",
);
assert.equal(
  resolvePlayerGuitarAttachmentLatchAtClipProgress(
    PLAYER_GUITAR_STOW_LATCH_CLIP_PROGRESS,
  ),
  0,
  "Animation Studio preview must stow on its uniform frame-18 timeline",
);
assert.equal(
  resolveAssetAttachmentActiveBoneName({
    id: "generic_attachment_contract",
    stowed_socket: { bone_name: "Spine" },
    active_socket: { bone_name: "RightHand" },
  }),
  "RightHand",
  "generic attachments must retain their authored active socket",
);
assert.ok(
  Math.abs(
    Math.hypot(
      ...BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket.quaternion,
    ) - 1,
  ) < 0.000001,
  "active guitar socket quaternion must be normalized",
);
const legacyScalePackage = structuredClone(freshPackage);
const legacyScalePlayer = legacyScalePackage.object_library.find(
  (object) => object.id === PLAYER_IDLE_FBX_MODEL_ID,
);
assert.ok(legacyScalePlayer?.asset, "the bundled player asset must exist");
legacyScalePlayer.asset.scale = [1, 1, 1];
legacyScalePlayer.bounds = [...legacyScalePlayer.asset.source_bounds];
const upgradedLegacyScalePlayer =
  resolvePlayerModelObject(legacyScalePackage);
assert.deepEqual(
  upgradedLegacyScalePlayer?.asset?.scale,
  [
    BUNDLED_PLAYER_MODEL_SCALE,
    BUNDLED_PLAYER_MODEL_SCALE,
    BUNDLED_PLAYER_MODEL_SCALE,
  ],
  "existing authored copies of the bundled player must gain the collision-matched scale",
);
const legacyLocomotionPackage = structuredClone(freshPackage);
const legacyLocomotionPlayer = legacyLocomotionPackage.object_library.find(
  (object) => object.id === PLAYER_IDLE_FBX_MODEL_ID,
);
assert.ok(legacyLocomotionPlayer?.asset, "the bundled player asset must exist");
legacyLocomotionPlayer.asset.animation_sources =
  legacyLocomotionPlayer.asset.animation_sources?.filter(
    (source) => source.clip_name !== PLAYER_STEALTH_WALK_FBX_CLIP,
  );
legacyLocomotionPlayer.asset.animation_clips =
  legacyLocomotionPlayer.asset.animation_clips?.filter(
    (clip) => clip.name !== PLAYER_STEALTH_WALK_FBX_CLIP,
  );
const upgradedLegacyLocomotionPlayer = resolvePlayerModelObject(
  legacyLocomotionPackage,
);
assert.ok(
  upgradedLegacyLocomotionPlayer?.asset?.animation_sources?.some(
    (source) => source.clip_name === PLAYER_STEALTH_WALK_FBX_CLIP,
  ),
  "existing bundled Steve models must gain the crouched walk source",
);
assert.ok(
  upgradedLegacyLocomotionPlayer?.asset?.animation_clips?.some(
    (clip) => clip.name === PLAYER_STEALTH_WALK_FBX_CLIP,
  ),
  "existing bundled Steve models must gain crouched walk metadata",
);
assert.ok(
  Math.abs(
    (upgradedLegacyScalePlayer?.bounds[1] || 0) - PLAYER_COLLISION_HEIGHT,
  ) < 0.000001,
  "existing authored copies must gain collision-matched bounds",
);
const legacyGuitarRevisionPackage = structuredClone(freshPackage);
const legacyGuitarPlayer = legacyGuitarRevisionPackage.object_library.find(
  (object) => object.id === PLAYER_IDLE_FBX_MODEL_ID,
);
assert.ok(legacyGuitarPlayer?.asset, "the bundled player asset must exist");
const legacyGuitarClip =
  legacyGuitarPlayer.asset.authored_animation_clips?.find(
    (candidate) => candidate.id === PLAYER_GUITAR_ATTACK_CLIP_ID,
  );
assert.ok(legacyGuitarClip, "the bundled guitar clip must exist");
legacyGuitarClip.revision = 4;
const legacyAttackBinding =
  legacyGuitarPlayer.asset.animation_profile?.action_bindings.find(
    (binding) => binding.action === "attack",
  );
assert.ok(legacyAttackBinding, "the bundled attack binding must exist");
legacyAttackBinding.phase_markers = {
  windup_end_frame: 5,
  impact_frame: 5,
  active_end_frame: 13,
};
const upgradedLegacyGuitarPlayer = resolvePlayerModelObject(
  legacyGuitarRevisionPackage,
);
const upgradedLegacyGuitarClip =
  upgradedLegacyGuitarPlayer?.asset?.authored_animation_clips?.find(
    (candidate) => candidate.id === PLAYER_GUITAR_ATTACK_CLIP_ID,
  );
assert.equal(
  upgradedLegacyGuitarClip?.revision,
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.revision,
  "older engine-owned guitar clips must upgrade to the current hit timing",
);
assert.deepEqual(
  upgradedLegacyGuitarClip?.tracks[0]?.keyframes.map(
    (keyframe) => keyframe.frame,
  ),
  [0, 2, 4, 5, 9, 13, 16, 18, 20],
  "the bundled guitar migration must restore the staged left-hand draw and strike",
);
assert.equal(
  upgradedLegacyGuitarPlayer?.asset?.animation_profile?.action_bindings.find(
    (binding) => binding.action === "attack",
  )?.phase_markers?.impact_frame,
  9,
  "the bundled guitar binding must migrate with its engine-owned clip",
);
const legacyAttachmentPackage = structuredClone(freshPackage);
const legacyAttachment =
  legacyAttachmentPackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.ok(legacyAttachment, "the bundled guitar attachment must exist");
delete legacyAttachment.revision;
legacyAttachment.stowed_socket.position[0] = 0;
legacyAttachment.stowed_socket.position[1] -= 0.12;
legacyAttachment.stowed_socket.quaternion = [0, 1, 0, 0];
const upgradedAttachmentPackage = withBundledPlayerGuitarContent(
  legacyAttachmentPackage,
);
const upgradedAttachment =
  upgradedAttachmentPackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.equal(
  upgradedAttachment?.revision,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.revision,
  "older engine-owned guitar sockets must upgrade to the current back pose",
);
assert.deepEqual(
  upgradedAttachment?.stowed_socket,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket,
  "the bundled guitar migration must put the neck over Steve's left shoulder",
);
const revisionTwoAttachmentPackage = structuredClone(freshPackage);
const revisionTwoAttachment =
  revisionTwoAttachmentPackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.ok(revisionTwoAttachment, "the revision-two attachment copy must exist");
revisionTwoAttachment.revision = 2;
revisionTwoAttachment.stowed_socket.position = [
  -0.18,
  revisionTwoAttachment.stowed_socket.position[1] - 0.12,
  -0.12,
];
revisionTwoAttachment.stowed_socket.quaternion = [
  0.27563736,
  0.9612617,
  0,
  0,
];
const upgradedRevisionTwoAttachment = withBundledPlayerGuitarContent(
  revisionTwoAttachmentPackage,
).settings.player_visual_attachments?.find(
  (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
);
assert.deepEqual(
  upgradedRevisionTwoAttachment?.stowed_socket,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket,
  "the former 32-degree built-in mount must migrate to the raised 45-degree pose",
);
const revisionFourAttachmentPackage = structuredClone(freshPackage);
const revisionFourAttachment =
  revisionFourAttachmentPackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.ok(revisionFourAttachment, "the revision-four attachment copy must exist");
revisionFourAttachment.revision = 4;
revisionFourAttachment.active_socket = {
  bone_name: "mixamorigLeftHand",
  position: [0.00768759, -0.14495355, -0.18254102],
  quaternion: [0.09221219, 0.87288314, 0.42364765, 0.22381826],
  scale: [...BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket.scale],
};
revisionFourAttachment.transition = {
  draw_start: 0.1,
  draw_end: 0.125,
  return_start: 0.845,
  return_end: 0.875,
};
const upgradedRevisionFourAttachment = withBundledPlayerGuitarContent(
  revisionFourAttachmentPackage,
).settings.player_visual_attachments?.find(
  (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
);
assert.deepEqual(
  upgradedRevisionFourAttachment?.active_socket,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket,
  "the former left-hand corrective socket must migrate to the exact neck grip",
);
assert.deepEqual(
  upgradedRevisionFourAttachment?.transition,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition,
  "the former attachment timing must migrate to the frame-2/frame-18 latches",
);
const interimRevisionFivePackage = structuredClone(revisionFourAttachmentPackage);
const interimRevisionFiveAttachment =
  interimRevisionFivePackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.ok(interimRevisionFiveAttachment, "the interim revision-five copy must exist");
interimRevisionFiveAttachment.revision = 5;
interimRevisionFiveAttachment.transition = structuredClone(
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition,
);
const upgradedInterimRevisionFive = withBundledPlayerGuitarContent(
  interimRevisionFivePackage,
).settings.player_visual_attachments?.find(
  (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
);
assert.deepEqual(
  upgradedInterimRevisionFive?.active_socket,
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket,
  "the interim built-in left-hand socket must migrate even when its latch timing was already updated",
);
const customRevisionFourPackage = structuredClone(revisionFourAttachmentPackage);
const customRevisionFourAttachment =
  customRevisionFourPackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.ok(customRevisionFourAttachment, "the custom revision-four copy must exist");
customRevisionFourAttachment.active_socket.position[0] += 0.025;
const preservedCustomRevisionFour = withBundledPlayerGuitarContent(
  customRevisionFourPackage,
).settings.player_visual_attachments?.find(
  (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
);
assert.deepEqual(
  preservedCustomRevisionFour?.active_socket,
  customRevisionFourAttachment.active_socket,
  "authored revision-four hand offsets must not be replaced by the bundled migration",
);
const customAttachmentPackage = structuredClone(legacyAttachmentPackage);
const customAttachment =
  customAttachmentPackage.settings.player_visual_attachments?.find(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
assert.ok(customAttachment, "the custom attachment copy must exist");
customAttachment.stowed_socket.position[0] = 0.125;
const preservedCustomAttachment = withBundledPlayerGuitarContent(
  customAttachmentPackage,
).settings.player_visual_attachments?.find(
  (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
);
assert.equal(
  preservedCustomAttachment?.stowed_socket.position[0],
  0.125,
  "authored guitar socket offsets must not be replaced by the bundled migration",
);
assert.doesNotThrow(
  () => GamePackageSchema.parse(freshPackage),
  "FBX assets and animation playback data must pass package validation",
);

const legacyPackage = structuredClone(freshPackage);
delete legacyPackage.settings.player_model_id;
legacyPackage.object_library = legacyPackage.object_library.filter(
  (object) => object.id !== PLAYER_IDLE_FBX_MODEL_ID,
);
assert.equal(
  resolvePlayerModelObject(legacyPackage)?.id,
  PLAYER_IDLE_FBX_MODEL_ID,
  "existing bundled workspaces must gain the player model non-destructively",
);
legacyPackage.object_library = legacyPackage.object_library.filter(
  (object) => object.id !== PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
);
const guitarBackfill = withBundledPlayerElectricGuitarObject(legacyPackage);
assert.equal(
  guitarBackfill.object_library.at(-1)?.id,
  PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  "legacy projects must gain the bundled guitar without changing prior objects",
);
assert.equal(
  withBundledPlayerElectricGuitarObject(guitarBackfill),
  guitarBackfill,
  "guitar object backfill must be idempotent",
);
const bundledContentBackfill = withBundledPlayerGuitarContent(legacyPackage);
assert.equal(
  bundledContentBackfill.settings.player_animation_override?.profile_id,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  "legacy bundled-player projects must gain the guitar animation profile",
);
assert.ok(
  bundledContentBackfill.settings.player_visual_attachments?.some(
    (attachment) =>
      attachment.id === BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.id,
  ),
  "legacy bundled-player projects must gain the guitar attachment",
);
assert.equal(
  withBundledPlayerGuitarContent(bundledContentBackfill),
  bundledContentBackfill,
  "bundled guitar content backfill must be idempotent",
);

const spriteOnlyPackage = structuredClone(freshPackage);
spriteOnlyPackage.settings.player_model_id = null;
assert.equal(
  resolvePlayerModelObject(spriteOnlyPackage),
  undefined,
  "authors must be able to select the sprite fallback explicitly",
);

console.log(
  `Model animation contract passed (${skinnedMeshes} skinned mesh, ${bones} bones, idle + walk + stealth-walk clips).`,
);
