import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ActorAnimationOverrideSchema,
  AuthoredAnimationClipSchema,
  GamePackageSchema,
  ModelAnimationProfileSchema,
  ObjectSchema,
  VisualAttachmentProfileSchema,
  createEmptyGamePackage,
  type AuthoredAnimationClipData,
} from "../src/schema/game";
import {
  migrateGamePackageV1ToV2,
  normalizeGamePackageToV2,
  unwrapGamePackageV1,
} from "../src/schema/v2";
import {
  compileAuthoredAnimationClip,
  createAuthoredAnimationClip,
  duplicateAuthoredAnimationClip,
  legacyModelAnimationClipId,
  normalizeAnimationQuaternion,
  removeAuthoredAnimationKeyframe,
  removeAuthoredAnimationTrack,
  resolveAnimationActionBinding,
  resolveAnimationClipRuntimeName,
  resolveModelAnimationClipId,
  resolveModelAnimationProfile,
  stripHorizontalRootTranslation,
  updateAuthoredAnimationClip,
  upsertAuthoredAnimationKeyframe,
  upsertAuthoredAnimationTrack,
} from "../src/utils/modelAnimation";

const closeTo = (actual: number, expected: number, epsilon = 0.000001) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

const keyframesFor = (
  clip: AuthoredAnimationClipData,
  trackId: string,
) => {
  const track = clip.tracks.find((candidate) => candidate.id === trackId);
  assert.ok(track, `missing authored animation track ${trackId}`);
  return track.keyframes;
};

// Legacy source clips never stored IDs. Their inferred identity must remain
// deterministic across reloads and distinct across either model or clip name.
const idleLegacyId = legacyModelAnimationClipId("obj/Steve", "Idle Take");
assert.equal(idleLegacyId, "anim_legacy_obj_steve_idle_take_5b7c3803");
assert.equal(
  legacyModelAnimationClipId("obj/Steve", "Idle Take"),
  idleLegacyId,
  "legacy animation IDs must be deterministic",
);
assert.notEqual(
  legacyModelAnimationClipId("obj/Steve", "Walk Take"),
  idleLegacyId,
  "different imported clips must not share an inferred ID",
);
assert.notEqual(
  legacyModelAnimationClipId("obj/Other", "Idle Take"),
  idleLegacyId,
  "the owning model must participate in imported clip identity",
);
assert.equal(
  resolveModelAnimationClipId("obj/Steve", {
    id: "anim_explicit",
    name: "Idle Take",
  }),
  "anim_explicit",
  "explicit stable IDs must take precedence over legacy inference",
);

const authored = createAuthoredAnimationClip({
  id: "anim_contract_attack",
  name: "contract_attack",
  display_name: "Contract Attack",
  kind: "gameplay_action",
  value_mode: "absolute",
  fps: 30,
  duration_frames: 30,
  revision: 4,
  loop: "once",
  tracks: [
    {
      id: "track_hips_position",
      target_node: "mixamorigHips",
      property: "position",
      interpolation: "linear",
      keyframes: [
        { frame: 0, value: [1, 0, 2] },
        { frame: 10, value: [4, 1, 5] },
        { frame: 30, value: [9, 3, 7] },
      ],
    },
    {
      id: "track_spine_quaternion",
      target_node: "mixamorigSpine",
      property: "quaternion",
      interpolation: "linear",
      keyframes: [
        { frame: 0, value: [0, 0, 0, 2] },
        { frame: 30, value: [0, 0, 0, -3] },
      ],
    },
    {
      id: "track_hand_scale",
      target_node: "mixamorigRightHand",
      property: "scale",
      interpolation: "smooth",
      keyframes: [
        { frame: 0, value: [1, 1, 1] },
        { frame: 30, value: [1.1, 1.1, 1.1] },
      ],
    },
    {
      id: "track_left_hand_position",
      target_node: "mixamorigLeftHand",
      property: "position",
      interpolation: "step",
      keyframes: [
        { frame: 0, value: [0, 0, 0] },
        { frame: 30, value: [0.1, 0, 0] },
      ],
    },
  ],
});

// Schema JSON round-trip keeps the complete authored payload and legacy model
// payloads remain valid when every new field is absent.
assert.deepEqual(
  AuthoredAnimationClipSchema.parse(JSON.parse(JSON.stringify(authored))),
  authored,
  "authored clip schema must round-trip without losing track data",
);
const legacyPackageInput = structuredClone(createEmptyGamePackage());
delete legacyPackageInput.settings.player_animation_override;
delete legacyPackageInput.settings.player_visual_attachments;
legacyPackageInput.object_library = [
  ObjectSchema.parse({
    id: "obj_legacy_animated_model",
    display_name: "Legacy animated model",
    category: "models",
    bounds: [1, 2, 1],
    model_kind: "asset",
    collision: { profile: "none", footprint: [] },
    asset: {
      data_url: "data:model/gltf-binary;base64,AA==",
      filename: "legacy.glb",
      source_type: "glb",
      animation_clips: [{ name: "Idle Take", duration: 1, tracks: 1 }],
    },
  }),
];
const loadedLegacyPackage = GamePackageSchema.parse(
  JSON.parse(JSON.stringify(legacyPackageInput)),
);
assert.equal(
  loadedLegacyPackage.object_library[0]?.asset?.authored_animation_clips,
  undefined,
  "legacy model assets must not gain authored clips merely by loading",
);
assert.equal(
  loadedLegacyPackage.object_library[0]?.asset?.animation_profile,
  undefined,
  "legacy model assets must remain valid without an animation profile",
);
assert.equal(
  loadedLegacyPackage.settings.player_animation_override,
  undefined,
  "legacy settings must remain valid without actor animation overrides",
);

// Quaternion input is normalized defensively, including invalid and degenerate
// values, before it can enter an editable clip.
assert.deepEqual(normalizeAnimationQuaternion(undefined), [0, 0, 0, 1]);
assert.deepEqual(normalizeAnimationQuaternion([0, 0, 0, 0]), [0, 0, 0, 1]);
const normalizedQuaternion = normalizeAnimationQuaternion([2, 0, 0, 2]);
closeTo(Math.hypot(...normalizedQuaternion), 1);
closeTo(normalizedQuaternion[0], Math.SQRT1_2);
closeTo(normalizedQuaternion[3], Math.SQRT1_2);
for (const keyframe of keyframesFor(authored, "track_spine_quaternion")) {
  closeTo(Math.hypot(...keyframe.value), 1);
}

// Every edit operation returns a new clip and leaves its input untouched.
const authoredSnapshot = structuredClone(authored);
const inserted = upsertAuthoredAnimationKeyframe(
  authored,
  "track_spine_quaternion",
  { frame: 7, value: [0, 2, 0, 0] },
);
assert.deepEqual(authored, authoredSnapshot, "key insertion mutated its source clip");
assert.notEqual(inserted, authored);
assert.equal(inserted.revision, authored.revision + 1);
assert.deepEqual(
  keyframesFor(inserted, "track_spine_quaternion").map((keyframe) => keyframe.frame),
  [0, 7, 30],
);
closeTo(
  Math.hypot(...keyframesFor(inserted, "track_spine_quaternion")[1].value),
  1,
);

const replaced = upsertAuthoredAnimationKeyframe(
  inserted,
  "track_spine_quaternion",
  { frame: 7, value: [2, 0, 0, 0] },
);
assert.equal(
  keyframesFor(replaced, "track_spine_quaternion").length,
  3,
  "inserting at an occupied frame must replace rather than duplicate",
);
assert.deepEqual(
  keyframesFor(replaced, "track_spine_quaternion")[1].value,
  [1, 0, 0, 0],
);
const deletedKey = removeAuthoredAnimationKeyframe(
  replaced,
  "track_spine_quaternion",
  7,
);
assert.deepEqual(
  keyframesFor(deletedKey, "track_spine_quaternion").map((keyframe) => keyframe.frame),
  [0, 30],
);
assert.equal(
  removeAuthoredAnimationKeyframe(deletedKey, "track_spine_quaternion", 19),
  deletedKey,
  "deleting a missing keyframe should be a no-op",
);

const addedTrack = upsertAuthoredAnimationTrack(deletedKey, {
  id: "track_head_position",
  target_node: "mixamorigHead",
  property: "position",
  interpolation: "linear",
  keyframes: [{ frame: 4, value: [0, 0.1, 0] }],
});
assert.equal(addedTrack.tracks.length, deletedKey.tracks.length + 1);
assert.equal(deletedKey.tracks.some((track) => track.id === "track_head_position"), false);
const removedTrack = removeAuthoredAnimationTrack(addedTrack, "track_head_position");
assert.equal(removedTrack.tracks.length, deletedKey.tracks.length);
assert.equal(
  removeAuthoredAnimationTrack(removedTrack, "track_missing"),
  removedTrack,
  "deleting a missing track should be a no-op",
);

const duplicate = duplicateAuthoredAnimationClip(authored, {
  id: "anim_contract_attack_copy",
});
assert.equal(duplicate.id, "anim_contract_attack_copy");
assert.equal(duplicate.revision, 1);
assert.notEqual(duplicate.tracks, authored.tracks);
assert.notEqual(duplicate.tracks[0]?.keyframes, authored.tracks[0]?.keyframes);
assert.deepEqual(authored, authoredSnapshot, "clip duplication mutated its source");

// Shortening duration clamps/deduplicates out-of-range keys at the new end.
const trimmed = updateAuthoredAnimationClip(authored, { duration_frames: 8 });
assert.equal(trimmed.duration_frames, 8);
assert.deepEqual(
  keyframesFor(trimmed, "track_hips_position").map((keyframe) => keyframe.frame),
  [0, 8],
);
assert.deepEqual(
  keyframesFor(trimmed, "track_hips_position")[1].value,
  [9, 3, 7],
  "the last authored out-of-range pose should own the trimmed endpoint",
);
assert.deepEqual(authored, authoredSnapshot, "duration trimming mutated its source clip");

// Compiled interpolation modes must match the authored tracks. Three's
// QuaternionKeyframeTrack uses its quaternion interpolant (slerp), and adjacent
// normalized keys are kept in one hemisphere to avoid long-path rotations.
const compiled = compileAuthoredAnimationClip(authored);
assert.equal(compiled.name, authored.id);
assert.equal(compiled.duration, 1);
const compiledQuaternion = compiled.tracks.find(
  (track) => track.name === "mixamorigSpine.quaternion",
);
assert.ok(compiledQuaternion instanceof THREE.QuaternionKeyframeTrack);
assert.equal(compiledQuaternion.getInterpolation(), THREE.InterpolateLinear);
const compiledQuaternionValues = Array.from(compiledQuaternion.values);
const firstCompiledQuaternion = compiledQuaternionValues.slice(0, 4);
const secondCompiledQuaternion = compiledQuaternionValues.slice(4, 8);
const compiledQuaternionDot = firstCompiledQuaternion.reduce(
  (sum, value, index) => sum + value * secondCompiledQuaternion[index],
  0,
);
assert.ok(
  compiledQuaternionDot >= 0,
  "compiled quaternion keys must remain in one hemisphere for shortest-path slerp",
);
const compiledSmooth = compiled.tracks.find(
  (track) => track.name === "mixamorigRightHand.scale",
);
assert.ok(compiledSmooth instanceof THREE.VectorKeyframeTrack);
assert.equal(compiledSmooth.getInterpolation(), THREE.InterpolateSmooth);
const compiledStep = compiled.tracks.find(
  (track) => track.name === "mixamorigLeftHand.position",
);
assert.ok(compiledStep instanceof THREE.VectorKeyframeTrack);
assert.equal(compiledStep.getInterpolation(), THREE.InterpolateDiscrete);

// Gameplay action compilation suppresses horizontal root motion while keeping
// vertical animation, and the pure helper leaves the authored source intact.
const rootSuppressed = stripHorizontalRootTranslation(authored);
assert.deepEqual(authored, authoredSnapshot, "root-motion stripping mutated its source");
assert.deepEqual(
  keyframesFor(rootSuppressed, "track_hips_position").map((keyframe) => keyframe.value),
  [
    [1, 0, 2],
    [1, 1, 2],
    [1, 3, 2],
  ],
);
const compiledRoot = compiled.tracks.find(
  (track) => track.name === "mixamorigHips.position",
);
assert.ok(compiledRoot instanceof THREE.VectorKeyframeTrack);
assert.deepEqual(Array.from(compiledRoot.values), [1, 0, 2, 1, 1, 2, 1, 3, 2]);
const additiveRootClip = createAuthoredAnimationClip({
  id: "anim_additive_root",
  name: "additive_root",
  display_name: "Additive root",
  kind: "gameplay_action",
  value_mode: "additive",
  tracks: [
    {
      id: "track_additive_root",
      target_node: "mixamorigHips",
      property: "position",
      interpolation: "linear",
      keyframes: [
        { frame: 0, value: [2, 0, 3] },
        { frame: 30, value: [8, 1, 9] },
      ],
    },
  ],
});
assert.deepEqual(
  keyframesFor(
    stripHorizontalRootTranslation(additiveRootClip),
    "track_additive_root",
  ).map((keyframe) => keyframe.value),
  [
    [0, 0, 0],
    [0, 1, 0],
  ],
);

// Imported metadata resolves through its inferred ID, while authored clips use
// their stable engine-owned ID and can be duplicated independently for edits.
const importedAsset = {
  animation_clips: [{ name: "Idle Take", duration: 1, tracks: 3 }],
  authored_animation_clips: [authored],
};
assert.equal(
  resolveAnimationClipRuntimeName("obj/Steve", importedAsset, idleLegacyId),
  "Idle Take",
);
assert.equal(
  resolveAnimationClipRuntimeName("obj/Steve", importedAsset, authored.id),
  authored.id,
);
assert.equal(
  resolveAnimationClipRuntimeName("obj/Steve", importedAsset, "anim_missing"),
  undefined,
);
const duplicatedImportedMaterialization = duplicateAuthoredAnimationClip(
  createAuthoredAnimationClip({
    id: idleLegacyId,
    name: "idle_take_editable",
    display_name: "Idle Take editable",
    tracks: [],
  }),
  { id: "anim_idle_take_copy", display_name: "Idle Take Copy" },
);
assert.equal(duplicatedImportedMaterialization.id, "anim_idle_take_copy");
assert.equal(duplicatedImportedMaterialization.display_name, "Idle Take Copy");
assert.notEqual(duplicatedImportedMaterialization.id, idleLegacyId);

// Bad authored values are rejected at the schema boundary rather than reaching
// playback. Missing rig targets remain harmless data and compile without a rig.
assert.equal(
  AuthoredAnimationClipSchema.safeParse({
    id: "anim_bad",
    name: "bad",
    display_name: "Bad",
    duration_frames: 0,
    value_mode: "absolute",
    tracks: [],
  }).success,
  false,
  "zero-duration clips must be rejected",
);
assert.equal(
  AuthoredAnimationClipSchema.safeParse({
    id: "anim_bad_quaternion",
    name: "bad_quaternion",
    display_name: "Bad quaternion",
    value_mode: "absolute",
    tracks: [
      {
        id: "track_bad_quaternion",
        target_node: "Bone",
        property: "quaternion",
        keyframes: [{ frame: 0, value: [0, 0, 1] }],
      },
    ],
  }).success,
  false,
  "malformed quaternion keys must be rejected",
);
assert.doesNotThrow(() =>
  compileAuthoredAnimationClip(
    createAuthoredAnimationClip({
      id: "anim_missing_bone",
      name: "missing_bone",
      display_name: "Missing bone",
      tracks: [
        {
          id: "track_missing_bone",
          target_node: "BoneThatTheRigDoesNotHave",
          property: "position",
          interpolation: "linear",
          keyframes: [{ frame: 0, value: [0, 0, 0] }],
        },
      ],
    }),
  ),
);

// Sparse actor bindings override only matching model actions. Other semantic
// bindings continue to resolve from the model profile.
const modelProfile = ModelAnimationProfileSchema.parse({
  id: "profile_contract",
  display_name: "Contract profile",
  root_node_name: "Root",
  default_clip_id: "anim_default",
  action_bindings: [
    { action: "walk", clip_id: "anim_model_walk" },
    {
      action: "attack",
      clip_id: "anim_model_attack",
      layer: "upper_body",
      bone_mask_root: "Spine",
    },
  ],
});
const actorOverride = ActorAnimationOverrideSchema.parse({
  profile_id: "profile_actor",
  default_clip_id: "anim_actor_default",
  action_bindings: [
    {
      action: "attack",
      clip_id: "anim_actor_attack",
      crossfade_ms: 40,
      blend_mode: "additive",
    },
  ],
});
assert.equal(
  resolveAnimationActionBinding("attack", modelProfile, actorOverride)?.clip_id,
  "anim_actor_attack",
);
assert.equal(
  resolveAnimationActionBinding("walk", modelProfile, actorOverride)?.clip_id,
  "anim_model_walk",
);
assert.equal(
  resolveAnimationActionBinding("hurt", modelProfile, actorOverride)?.clip_id,
  "anim_actor_default",
  "the actor default must take precedence over the model default",
);
assert.deepEqual(resolveModelAnimationProfile(modelProfile, actorOverride), {
  profile_id: "profile_actor",
  root_node_name: "Root",
  default_clip_id: "anim_actor_default",
  action_bindings: [
    resolveAnimationActionBinding("walk", modelProfile, actorOverride),
    resolveAnimationActionBinding("attack", modelProfile, actorOverride),
  ],
});

const validAttachment = VisualAttachmentProfileSchema.parse({
  id: "attachment_contract_guitar",
  display_name: "Contract guitar",
  object_id: "obj_contract_guitar",
  action: "attack",
  stowed_socket: { bone_name: "mixamorigSpine2" },
  active_socket: {
    bone_name: "mixamorigRightHand",
    position: [0, 0.5, 0],
    quaternion: [0, 0, 0, 1],
    scale: [0.55, 0.55, 0.55],
  },
  transition: {
    draw_start: 0,
    draw_end: 0.26,
    return_start: 0.5,
    return_end: 1,
  },
  render_xray: true,
});
assert.equal(validAttachment.render_xray, true);
assert.equal(
  VisualAttachmentProfileSchema.safeParse({
    ...validAttachment,
    transition: {
      draw_start: 0,
      draw_end: 0.6,
      return_start: 0.4,
      return_end: 1,
    },
  }).success,
  false,
  "attachment transitions must reject non-monotonic fractions",
);

// V1 -> V2 -> JSON -> V1 package round-trip preserves every new optional
// model, actor, binding, phase, mask, and attachment field.
const basePackage = createEmptyGamePackage();
const sourceEntity = basePackage.entities[0];
assert.ok(sourceEntity, "animation package fixture needs one entity seed");
const modelObject = ObjectSchema.parse({
  id: "obj_animation_contract_model",
  display_name: "Animation contract model",
  category: "models",
  bounds: [1, 2, 1],
  model_kind: "asset",
  collision: { profile: "none", footprint: [] },
  asset: {
    data_url: "data:model/gltf-binary;base64,AA==",
    filename: "contract.glb",
    source_type: "glb",
    animation_clips: [{ name: "Idle Take", duration: 1, tracks: 3 }],
    authored_animation_clips: [authored],
    animation_profile: {
      ...modelProfile,
      action_bindings: [
        ...modelProfile.action_bindings,
        {
          action: "evade",
          clip_id: authored.id,
          sync: "action_phase",
          layer: "full_body",
          blend_mode: "override",
          frame_range: { start_frame: 2, end_frame: 20 },
          phase_markers: {
            windup_end_frame: 5,
            impact_frame: 8,
            active_end_frame: 12,
          },
        },
      ],
    },
  },
});
const packageWithAnimationData = GamePackageSchema.parse({
  ...basePackage,
  settings: {
    ...basePackage.settings,
    player_animation_override: actorOverride,
    player_visual_attachments: [validAttachment],
  },
  object_library: [
    ...basePackage.object_library.filter(
      (object) => object.id !== modelObject.id,
    ),
    modelObject,
  ],
  entities: [
    ...basePackage.entities,
    {
      ...sourceEntity,
      id: "ent_animation_contract",
      animation_override: actorOverride,
      visual_attachments: [validAttachment],
    },
  ],
});
const v2Json = JSON.parse(
  JSON.stringify(migrateGamePackageV1ToV2(packageWithAnimationData)),
);
const roundTrippedPackage = unwrapGamePackageV1(
  normalizeGamePackageToV2(v2Json),
);
const roundTrippedModel = roundTrippedPackage.object_library.find(
  (object) => object.id === modelObject.id,
);
const roundTrippedEntity = roundTrippedPackage.entities.find(
  (entity) => entity.id === "ent_animation_contract",
);
assert.deepEqual(
  roundTrippedModel?.asset?.authored_animation_clips,
  modelObject.asset?.authored_animation_clips,
);
assert.deepEqual(
  roundTrippedModel?.asset?.animation_profile,
  modelObject.asset?.animation_profile,
);
assert.deepEqual(
  roundTrippedPackage.settings.player_animation_override,
  actorOverride,
);
assert.deepEqual(
  roundTrippedPackage.settings.player_visual_attachments,
  [validAttachment],
);
assert.deepEqual(roundTrippedEntity?.animation_override, actorOverride);
assert.deepEqual(roundTrippedEntity?.visual_attachments, [validAttachment]);

console.log("Animation authoring contract checks passed.");
