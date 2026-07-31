import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  GamePackageSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import {
  BUNDLED_PLAYER_MODEL_SCALE,
  BUNDLED_PLAYER_IDLE_MODEL,
  PLAYER_COLLISION_HEIGHT,
  PLAYER_IDLE_FBX_CLIP,
  PLAYER_IDLE_FBX_MODEL_ID,
  PLAYER_WALK_FBX_CLIP,
  resolvePlayerLocomotionClip,
  resolvePlayerModelObject,
} from "../src/data/playerModelAssets";
import {
  loadModelFromAssetDataUrl,
  parseFbxAssetSource,
} from "../src/utils/gltfModelIO";

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
const file = readFileSync(modelPath);
const walkingFile = readFileSync(walkingPath);

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
const clip = loaded.animations.find(
  (candidate) => candidate.name === PLAYER_IDLE_FBX_CLIP,
);
let skinnedMeshes = 0;
let bones = 0;
const idleBoneNames: string[] = [];
const walkingBoneNames: string[] = [];
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
const runtimeLoaded = await loadModelFromAssetDataUrl(runtimeAsset);
assert.ok(
  runtimeLoaded.animations.some(
    (candidate) => candidate.name === PLAYER_WALK_FBX_CLIP,
  ),
  "external FBX clips must merge into the runtime model",
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

const freshPackage = createEmptyGamePackage();
assert.equal(
  freshPackage.settings?.player_model_id,
  PLAYER_IDLE_FBX_MODEL_ID,
  "new projects must select the bundled animated player",
);
assert.equal(
  resolvePlayerModelObject(freshPackage)?.id,
  PLAYER_IDLE_FBX_MODEL_ID,
  "the configured player model must resolve",
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
assert.ok(
  Math.abs(
    (upgradedLegacyScalePlayer?.bounds[1] || 0) - PLAYER_COLLISION_HEIGHT,
  ) < 0.000001,
  "existing authored copies must gain collision-matched bounds",
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

const spriteOnlyPackage = structuredClone(freshPackage);
spriteOnlyPackage.settings.player_model_id = null;
assert.equal(
  resolvePlayerModelObject(spriteOnlyPackage),
  undefined,
  "authors must be able to select the sprite fallback explicitly",
);

console.log(
  `Model animation contract passed (${skinnedMeshes} skinned mesh, ${bones} bones, idle + walk clips).`,
);
