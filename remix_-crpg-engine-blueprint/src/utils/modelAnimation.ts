import * as THREE from "three";
import {
  AnimationActionBindingSchema,
  AuthoredAnimationClipSchema,
  AuthoredAnimationTrackSchema,
  type ActorAnimationOverrideData,
  type AnimationActionBindingData,
  type AnimationQuaternionData,
  type AnimationSemanticAction,
  type AuthoredAnimationClipData,
  type AuthoredAnimationTrackData,
  type ModelAnimationProfileData,
  type ObjectAssetData,
} from "../schema/game";

const IDENTITY_QUATERNION: AnimationQuaternionData = [0, 0, 0, 1];

const finiteNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const slugIdPart = (value: string, fallback: string) => {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
};

const fnv1a32 = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/** Stable bridge for imported clips that predate authored animation IDs. */
export const legacyModelAnimationClipId = (
  modelId: string,
  clipName: string,
) => {
  const identity = `${modelId}\u0000${clipName}`;
  return [
    "anim_legacy",
    slugIdPart(modelId, "model"),
    slugIdPart(clipName, "clip"),
    fnv1a32(identity),
  ].join("_");
};

export const resolveModelAnimationClipId = (
  modelId: string,
  clip: { id?: string; name: string },
) => clip.id?.trim() || legacyModelAnimationClipId(modelId, clip.name);

export const normalizeAnimationQuaternion = (
  input: readonly number[] | undefined,
): AnimationQuaternionData => {
  if (!input || input.length < 4) return [...IDENTITY_QUATERNION];
  const x = finiteNumber(input[0]);
  const y = finiteNumber(input[1]);
  const z = finiteNumber(input[2]);
  const w = finiteNumber(input[3]);
  const length = Math.hypot(x, y, z, w);
  if (length < 0.0000001) return [...IDENTITY_QUATERNION];
  return [x / length, y / length, z / length, w / length];
};

// Concise alias for editor/math call sites that already establish animation
// context in their surrounding names.
export const normalizeQuaternion = normalizeAnimationQuaternion;

const cloneTrack = (
  track: AuthoredAnimationTrackData,
): AuthoredAnimationTrackData => ({
  ...track,
  keyframes: track.keyframes.map((keyframe) => ({
    frame: keyframe.frame,
    value: [...keyframe.value] as typeof keyframe.value,
  })),
}) as AuthoredAnimationTrackData;

const cloneClip = (clip: AuthoredAnimationClipData): AuthoredAnimationClipData => ({
  ...clip,
  tracks: clip.tracks.map(cloneTrack),
});

const normalizedFrame = (frame: number, durationFrames: number) =>
  Math.max(0, Math.min(durationFrames, Math.round(finiteNumber(frame))));

const normalizeTrack = (
  track: AuthoredAnimationTrackData,
  durationFrames: number,
): AuthoredAnimationTrackData => {
  const byFrame = new Map<number, AuthoredAnimationTrackData["keyframes"][number]>();
  track.keyframes.forEach((keyframe) => {
    const frame = normalizedFrame(keyframe.frame, durationFrames);
    const value =
      track.property === "quaternion"
        ? normalizeAnimationQuaternion(keyframe.value)
        : [
            finiteNumber(keyframe.value[0]),
            finiteNumber(keyframe.value[1]),
            finiteNumber(keyframe.value[2]),
          ];
    byFrame.set(frame, { frame, value } as AuthoredAnimationTrackData["keyframes"][number]);
  });
  return AuthoredAnimationTrackSchema.parse({
    ...track,
    keyframes: Array.from(byFrame.values()).sort(
      (left, right) => left.frame - right.frame,
    ),
  });
};

const normalizeClip = (
  clip: AuthoredAnimationClipData,
): AuthoredAnimationClipData => {
  const parsed = AuthoredAnimationClipSchema.parse(clip);
  const tracksById = new Map<string, AuthoredAnimationTrackData>();
  parsed.tracks.forEach((track) => {
    tracksById.set(
      track.id,
      normalizeTrack(track, parsed.duration_frames),
    );
  });
  return {
    ...parsed,
    tracks: Array.from(tracksById.values()),
  };
};

export type CreateAuthoredAnimationClipInput = Pick<
  AuthoredAnimationClipData,
  "id"
> &
  Partial<Omit<AuthoredAnimationClipData, "id" | "revision">> & {
    revision?: number;
  };

export const createAuthoredAnimationClip = (
  input: CreateAuthoredAnimationClipInput,
): AuthoredAnimationClipData => {
  const name = input.name?.trim() || input.id;
  return normalizeClip(
    AuthoredAnimationClipSchema.parse({
      ...input,
      name,
      display_name: input.display_name?.trim() || name,
      revision: input.revision ?? 1,
      tracks: input.tracks ?? [],
    }),
  );
};

export const duplicateAuthoredAnimationClip = (
  source: AuthoredAnimationClipData,
  options: {
    id: string;
    name?: string;
    display_name?: string;
  },
): AuthoredAnimationClipData =>
  createAuthoredAnimationClip({
    ...cloneClip(source),
    id: options.id,
    name: options.name || `${source.name}_copy`,
    display_name: options.display_name || `${source.display_name} Copy`,
    revision: 1,
  });

export type AuthoredAnimationClipPatch = Partial<
  Omit<AuthoredAnimationClipData, "id" | "revision" | "tracks">
> & {
  tracks?: AuthoredAnimationTrackData[];
};

export const updateAuthoredAnimationClip = (
  source: AuthoredAnimationClipData,
  patch: AuthoredAnimationClipPatch,
): AuthoredAnimationClipData =>
  normalizeClip({
    ...cloneClip(source),
    ...patch,
    id: source.id,
    revision: source.revision + 1,
    tracks: patch.tracks?.map(cloneTrack) ?? source.tracks.map(cloneTrack),
  });

export const upsertAuthoredAnimationTrack = (
  source: AuthoredAnimationClipData,
  track: AuthoredAnimationTrackData,
): AuthoredAnimationClipData => {
  const normalized = normalizeTrack(track, source.duration_frames);
  const found = source.tracks.some((candidate) => candidate.id === track.id);
  return updateAuthoredAnimationClip(source, {
    tracks: found
      ? source.tracks.map((candidate) =>
          candidate.id === track.id ? normalized : cloneTrack(candidate),
        )
      : [...source.tracks.map(cloneTrack), normalized],
  });
};

export const removeAuthoredAnimationTrack = (
  source: AuthoredAnimationClipData,
  trackId: string,
): AuthoredAnimationClipData => {
  if (!source.tracks.some((track) => track.id === trackId)) return source;
  return updateAuthoredAnimationClip(source, {
    tracks: source.tracks
      .filter((track) => track.id !== trackId)
      .map(cloneTrack),
  });
};

export const upsertAuthoredAnimationKeyframe = (
  source: AuthoredAnimationClipData,
  trackId: string,
  keyframe: { frame: number; value: readonly number[] },
): AuthoredAnimationClipData => {
  const track = source.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`Animation track ${trackId} does not exist.`);
  const frame = normalizedFrame(keyframe.frame, source.duration_frames);
  const value =
    track.property === "quaternion"
      ? normalizeAnimationQuaternion(keyframe.value)
      : [
          finiteNumber(keyframe.value[0]),
          finiteNumber(keyframe.value[1]),
          finiteNumber(keyframe.value[2]),
        ];
  return upsertAuthoredAnimationTrack(source, {
    ...track,
    keyframes: [
      ...track.keyframes.filter((candidate) => candidate.frame !== frame),
      { frame, value },
    ],
  } as AuthoredAnimationTrackData);
};

export const removeAuthoredAnimationKeyframe = (
  source: AuthoredAnimationClipData,
  trackId: string,
  frame: number,
): AuthoredAnimationClipData => {
  const track = source.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return source;
  const normalized = normalizedFrame(frame, source.duration_frames);
  if (!track.keyframes.some((candidate) => candidate.frame === normalized)) {
    return source;
  }
  return upsertAuthoredAnimationTrack(source, {
    ...track,
    keyframes: track.keyframes.filter(
      (candidate) => candidate.frame !== normalized,
    ),
  } as AuthoredAnimationTrackData);
};

/**
 * Keeps the root's authored starting x/z while preserving vertical motion.
 * Additive clips use zero because their values are identity-relative deltas.
 */
export const stripHorizontalRootTranslation = (
  source: AuthoredAnimationClipData,
  rootNodeName = "mixamorigHips",
): AuthoredAnimationClipData => {
  const clip = cloneClip(source);
  clip.tracks = clip.tracks.map((track) => {
    if (
      track.target_node !== rootNodeName ||
      track.property !== "position" ||
      track.keyframes.length === 0
    ) {
      return track;
    }
    const anchorX = clip.value_mode === "additive"
      ? 0
      : track.keyframes[0].value[0];
    const anchorZ = clip.value_mode === "additive"
      ? 0
      : track.keyframes[0].value[2];
    return {
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({
        frame: keyframe.frame,
        value: [anchorX, keyframe.value[1], anchorZ],
      })),
    };
  });
  return clip;
};

const threeInterpolation = (
  interpolation: AuthoredAnimationTrackData["interpolation"],
) => {
  if (interpolation === "step") return THREE.InterpolateDiscrete;
  if (interpolation === "smooth") return THREE.InterpolateSmooth;
  return THREE.InterpolateLinear;
};

const continuousQuaternionValues = (
  values: readonly AnimationQuaternionData[],
) => {
  const result: number[] = [];
  let previous: AnimationQuaternionData | undefined;
  values.forEach((source) => {
    let value = normalizeAnimationQuaternion(source);
    if (
      previous &&
      previous[0] * value[0] +
        previous[1] * value[1] +
        previous[2] * value[2] +
        previous[3] * value[3] <
        0
    ) {
      value = [-value[0], -value[1], -value[2], -value[3]];
    }
    result.push(...value);
    previous = value;
  });
  return result;
};

export const compileAuthoredAnimationClip = (
  source: AuthoredAnimationClipData,
  options: { rootNodeName?: string } = {},
): THREE.AnimationClip => {
  const normalized = normalizeClip(source);
  const clip = normalized.kind === "gameplay_action"
    ? stripHorizontalRootTranslation(
        normalized,
        options.rootNodeName || "mixamorigHips",
      )
    : normalized;
  const tracks: THREE.KeyframeTrack[] = [];

  clip.tracks.forEach((track) => {
    if (track.keyframes.length === 0) return;
    const times = track.keyframes.map(
      (keyframe) => keyframe.frame / clip.fps,
    );
    const interpolation = threeInterpolation(track.interpolation);
    const path = `${track.target_node}.${track.property}`;
    if (track.property === "quaternion") {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          path,
          times,
          continuousQuaternionValues(
            track.keyframes.map((keyframe) => keyframe.value),
          ),
          interpolation,
        ),
      );
      return;
    }
    tracks.push(
      new THREE.VectorKeyframeTrack(
        path,
        times,
        track.keyframes.flatMap((keyframe) => keyframe.value),
        interpolation,
      ),
    );
  });

  const result = new THREE.AnimationClip(
    clip.id,
    clip.duration_frames / clip.fps,
    tracks,
  );
  result.blendMode = clip.value_mode === "additive"
    ? THREE.AdditiveAnimationBlendMode
    : THREE.NormalAnimationBlendMode;
  return result;
};

export interface ResolvedModelAnimationProfile {
  profile_id: string;
  root_node_name: string;
  default_clip_id?: string;
  action_bindings: AnimationActionBindingData[];
}

const bindingForAction = (
  bindings: readonly AnimationActionBindingData[] | undefined,
  action: AnimationSemanticAction,
) => {
  for (let index = (bindings?.length || 0) - 1; index >= 0; index -= 1) {
    if (bindings?.[index]?.action === action) return bindings[index];
  }
  return undefined;
};

export const resolveAnimationActionBinding = (
  action: AnimationSemanticAction,
  profile: ModelAnimationProfileData | undefined,
  override: ActorAnimationOverrideData | undefined,
): AnimationActionBindingData | undefined => {
  const explicit =
    bindingForAction(override?.action_bindings, action) ||
    bindingForAction(profile?.action_bindings, action);
  if (explicit) return AnimationActionBindingSchema.parse(explicit);
  const clipId = override?.default_clip_id || profile?.default_clip_id;
  return clipId
    ? AnimationActionBindingSchema.parse({ action, clip_id: clipId })
    : undefined;
};

/** Merge model defaults with the selected actor's sparse semantic overrides. */
export const resolveModelAnimationProfile = (
  profile: ModelAnimationProfileData | undefined,
  override: ActorAnimationOverrideData | undefined,
): ResolvedModelAnimationProfile | undefined => {
  if (!profile && !override) return undefined;
  const actions = new Set<AnimationSemanticAction>();
  profile?.action_bindings.forEach((binding) => actions.add(binding.action));
  override?.action_bindings.forEach((binding) => actions.add(binding.action));
  const actionBindings = Array.from(actions).flatMap((action) => {
    const binding = resolveAnimationActionBinding(action, profile, override);
    return binding ? [binding] : [];
  });
  return {
    profile_id: override?.profile_id || profile?.id || "profile_actor_override",
    root_node_name: profile?.root_node_name || "mixamorigHips",
    default_clip_id: override?.default_clip_id || profile?.default_clip_id,
    action_bindings: actionBindings,
  };
};

export const resolveAssetAnimationProfile = (
  asset: Pick<ObjectAssetData, "animation_profile"> | undefined,
  override: ActorAnimationOverrideData | undefined,
) => resolveModelAnimationProfile(asset?.animation_profile, override);

/** Resolve either a compiled authored clip ID or its imported source name. */
export const resolveAnimationClipRuntimeName = (
  modelId: string,
  asset: Pick<
    ObjectAssetData,
    "authored_animation_clips" | "animation_clips"
  >,
  clipId: string,
): string | undefined => {
  if (asset.authored_animation_clips?.some((clip) => clip.id === clipId)) {
    return clipId;
  }
  return asset.animation_clips?.find(
    (clip) => legacyModelAnimationClipId(modelId, clip.name) === clipId,
  )?.name;
};

