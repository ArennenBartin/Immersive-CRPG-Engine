import type {
  ActorAnimationOverrideData,
  GamePackage,
  ObjectData,
  VisualAttachmentProfileData,
} from "../schema/game";
import {
  BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE,
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP,
  createPlayerElectricGuitarAttachmentTransform,
  PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  PLAYER_ELECTRIC_GUITAR_SOURCE_CENTER,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  PLAYER_GUITAR_ATTACK_CLIP_ID,
  withBundledPlayerElectricGuitarObject,
} from "./playerGuitarAssets";

export {
  BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL,
  BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE,
  BUNDLED_PLAYER_GUITAR_ATTACK_CLIP,
  PLAYER_ELECTRIC_GUITAR_ASSET_URL,
  PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  PLAYER_ELECTRIC_GUITAR_GRIP_POINT,
  PLAYER_ELECTRIC_GUITAR_HAND_BONE,
  PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  PLAYER_GUITAR_ATTACK_CLIP_ID,
  PLAYER_GUITAR_ATTACK_CLIP_NAME,
  resolvePlayerElectricGuitarObject,
  withBundledPlayerElectricGuitarObject,
} from "./playerGuitarAssets";

export const PLAYER_IDLE_FBX_MODEL_ID = "obj_player_intercessor_idle_fbx";
export const PLAYER_IDLE_FBX_CLIP = "mixamo.com";
export const PLAYER_WALK_FBX_CLIP = "walk";
export const PLAYER_STEALTH_WALK_FBX_CLIP = "stealth_walk";
export const PLAYER_SEATED_FBX_CLIP = "seated";
export const PLAYER_COLLISION_HEIGHT = 1.8;

const BUNDLED_PLAYER_WALK_ANIMATION_SOURCE = {
  data_url: "/models/player/Walking.fbx",
  filename: "Walking.fbx",
  source_type: "fbx" as const,
  source_clip_name: "mixamo.com",
  clip_name: PLAYER_WALK_FBX_CLIP,
};
const BUNDLED_PLAYER_STEALTH_WALK_ANIMATION_SOURCE = {
  data_url: "/models/player/Crouched%20Walking.fbx",
  filename: "Crouched Walking.fbx",
  source_type: "fbx" as const,
  source_clip_name: "mixamo.com",
  clip_name: PLAYER_STEALTH_WALK_FBX_CLIP,
};
const BUNDLED_PLAYER_STEALTH_WALK_CLIP_METADATA = {
  name: PLAYER_STEALTH_WALK_FBX_CLIP,
  duration: 1.2000000476837158,
  tracks: 53,
};
// Mixamo "Male Sitting Pose": one frame on Steve's own 65-bone rig, so it
// retargets exactly like the walk clips. It is a POSE, not a loop — hold it
// rather than playing it (see shouldHoldPlayerLocomotionPose).
const BUNDLED_PLAYER_SEATED_ANIMATION_SOURCE = {
  data_url: "/models/player/Male%20Sitting%20Pose.fbx",
  filename: "Male Sitting Pose.fbx",
  source_type: "fbx" as const,
  source_clip_name: "mixamo.com",
  clip_name: PLAYER_SEATED_FBX_CLIP,
};
const BUNDLED_PLAYER_SEATED_CLIP_METADATA = {
  name: PLAYER_SEATED_FBX_CLIP,
  duration: 0.03333333507180214,
  tracks: 53,
};

const BUNDLED_PLAYER_SOURCE_BOUNDS: [number, number, number] = [
  0.8027343809808369,
  0.9980468153953554,
  0.23242190653400055,
];
export const BUNDLED_PLAYER_MODEL_SCALE =
  PLAYER_COLLISION_HEIGHT / BUNDLED_PLAYER_SOURCE_BOUNDS[1];
export const BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM =
  createPlayerElectricGuitarAttachmentTransform(BUNDLED_PLAYER_MODEL_SCALE);
const BUNDLED_PLAYER_GUITAR_ATTACHMENT_SCALE =
  BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM.scale;
const BUNDLED_PLAYER_GUITAR_LEGACY_STOWED_Y =
  -0.08 -
  PLAYER_ELECTRIC_GUITAR_SOURCE_CENTER[1] / BUNDLED_PLAYER_MODEL_SCALE;
const BUNDLED_PLAYER_GUITAR_STOWED_Y =
  0.04 -
  PLAYER_ELECTRIC_GUITAR_SOURCE_CENTER[1] / BUNDLED_PLAYER_MODEL_SCALE;
const BUNDLED_PLAYER_GUITAR_STOWED_SCALE = [
  ...BUNDLED_PLAYER_GUITAR_ATTACHMENT_SCALE,
] as [number, number, number];

export const BUNDLED_PLAYER_GUITAR_ANIMATION_OVERRIDE: ActorAnimationOverrideData = {
  profile_id: PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  action_bindings: [],
};

export const BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE: VisualAttachmentProfileData = {
  id: PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  revision: 6,
  display_name: "Player Electric Guitar",
  object_id: PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  action: "attack",
  stowed_socket: {
    bone_name: "mixamorigSpine2",
    position: [
      -0.18,
      BUNDLED_PLAYER_GUITAR_STOWED_Y,
      -0.12,
    ],
    // Roll the guitar 45 degrees across Steve's back. Raising the mount keeps
    // its body low on his right while the local +Y neck clears his left
    // shoulder instead of ending behind the upper torso.
    quaternion: [0.38268343, 0.92387953, 0, 0],
    scale: [...BUNDLED_PLAYER_GUITAR_STOWED_SCALE],
  },
  active_socket: {
    // The neck already clears Steve's left shoulder while stowed, so the left
    // hand is the natural pickup hand. Keep the transform centered on the
    // authored neck grip point; the baked hand rotations carry and orient the
    // prop rather than hiding a corrective offset in the socket.
    bone_name: "mixamorigLeftHand",
    position: [...BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM.position],
    quaternion: [
      Math.sin(BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM.rotation[0] / 2),
      0,
      0,
      Math.cos(BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM.rotation[0] / 2),
    ],
    scale: [...BUNDLED_PLAYER_GUITAR_ATTACHMENT_SCALE],
  },
  transition: {
    // Steve reaches the neck first. The prop changes parents only once that
    // animated left-hand socket meets the back socket, then stays in his hand
    // until the reverse contact late in recovery. The hand animation—not a
    // socket lerp through his torso—carries the guitar over his shoulder.
    draw_start: 0.055,
    draw_end: 0.065,
    return_start: 0.845,
    return_end: 0.875,
  },
  render_xray: true,
};
const BUNDLED_PLAYER_RENDER_BOUNDS: [number, number, number] = [
  BUNDLED_PLAYER_SOURCE_BOUNDS[0] * BUNDLED_PLAYER_MODEL_SCALE,
  BUNDLED_PLAYER_SOURCE_BOUNDS[1] * BUNDLED_PLAYER_MODEL_SCALE,
  BUNDLED_PLAYER_SOURCE_BOUNDS[2] * BUNDLED_PLAYER_MODEL_SCALE,
];

export const resolvePlayerLocomotionClip = (
  moving: boolean,
  stealthActive = false,
  seated = false,
) => {
  // A staged pose outranks locomotion: a seated actor is not walking, and the
  // cutscene owns the body until it releases it.
  if (seated) return PLAYER_SEATED_FBX_CLIP;
  if (stealthActive) return PLAYER_STEALTH_WALK_FBX_CLIP;
  return moving ? PLAYER_WALK_FBX_CLIP : PLAYER_IDLE_FBX_CLIP;
};

export const shouldHoldPlayerLocomotionPose = (
  moving: boolean,
  stealthActive = false,
  seated = false,
) => seated || (stealthActive && !moving);

export const BUNDLED_PLAYER_IDLE_MODEL: ObjectData = {
  id: PLAYER_IDLE_FBX_MODEL_ID,
  display_name: "Intercessor Idle (FBX)",
  category: "characters",
  tags: [
    "character",
    "player",
    "animated",
    "skinned",
    "fbx",
    "engine_builtin",
  ],
  origin: "center_floor",
  bounds: BUNDLED_PLAYER_RENDER_BOUNDS,
  materials: ["tripo_node_287b615a_3eb4_445c_9a3a_ad5581ae6fd8_materialmat"],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: "/models/player/Idle.fbx",
    filename: "Idle.fbx",
    source_type: "fbx",
    offset: [8.971255627265862e-9, 0, 2.5975171874526026e-9],
    rotation: [0, 0, 0],
    scale: [
      BUNDLED_PLAYER_MODEL_SCALE,
      BUNDLED_PLAYER_MODEL_SCALE,
      BUNDLED_PLAYER_MODEL_SCALE,
    ],
    source_min: [
      -0.4013671994616741,
      -1.7170168733740808e-16,
      -0.11621095586451746,
    ],
    source_center: [
      -8.971255627265862e-9,
      0.4990234076976775,
      -2.5975171874526026e-9,
    ],
    source_bounds: BUNDLED_PLAYER_SOURCE_BOUNDS,
    material_names: [
      "tripo_node_287b615a_3eb4_445c_9a3a_ad5581ae6fd8_materialmat",
    ],
    animation: {
      clip_name: PLAYER_IDLE_FBX_CLIP,
      autoplay: true,
      loop: "repeat",
      time_scale: 1,
    },
    animation_sources: [
      BUNDLED_PLAYER_WALK_ANIMATION_SOURCE,
      BUNDLED_PLAYER_STEALTH_WALK_ANIMATION_SOURCE,
      BUNDLED_PLAYER_SEATED_ANIMATION_SOURCE,
    ],
    animation_clips: [
      {
        name: PLAYER_IDLE_FBX_CLIP,
        duration: 4.166666507720947,
        tracks: 53,
      },
      {
        name: PLAYER_WALK_FBX_CLIP,
        duration: 1.2999999523162842,
        tracks: 53,
      },
      BUNDLED_PLAYER_STEALTH_WALK_CLIP_METADATA,
      BUNDLED_PLAYER_SEATED_CLIP_METADATA,
    ],
    authored_animation_clips: [BUNDLED_PLAYER_GUITAR_ATTACK_CLIP],
    animation_profile: BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE,
    stats: {
      meshes: 1,
      vertices: 13404,
      triangles: 4468,
      materials: 1,
      textures: 1,
      bytes: 5594256,
    },
  },
  collision: {
    profile: "none",
    footprint: [[0, 0]],
  },
};

const isLegacyBundledWorkspace = (gamePackage: GamePackage) => {
  const title = gamePackage.metadata.title || "";
  const playerSpriteId = gamePackage.settings?.player_sprite_id;
  return (
    (title.includes("Fracture Crawl") ||
      title.includes("CRPG Engine Feature")) &&
    (!playerSpriteId ||
      playerSpriteId === "generated_player_intercessor_south_idle")
  );
};

const isLegacyBundledPlayerScale = (object: ObjectData): boolean => {
  if (object.id !== PLAYER_IDLE_FBX_MODEL_ID || !object.asset) return false;
  const scale = object.asset.scale as [number, number, number];
  const sourceBounds = object.asset.source_bounds as [number, number, number];
  const bounds = object.bounds as [number, number, number];
  if (!scale || !sourceBounds) return false;
  const nearlyEqual = (left: number, right: number) =>
    Math.abs(left - right) < 0.000001;
  return (
    scale.every((value) => nearlyEqual(value, 1)) &&
    bounds.every((value, index) =>
      nearlyEqual(value, sourceBounds[index]),
    )
  );
};

const upgradeBundledPlayerModel = (object: ObjectData): ObjectData => {
  if (object.id !== PLAYER_IDLE_FBX_MODEL_ID || !object.asset) return object;

  const needsScaleUpgrade = isLegacyBundledPlayerScale(object);
  const authoredAnimationClips = object.asset.authored_animation_clips || [];
  const existingAttackClip = authoredAnimationClips.find(
    (clip) => clip.id === PLAYER_GUITAR_ATTACK_CLIP_ID,
  );
  const needsAttackClip = !existingAttackClip;
  const needsAttackClipUpgrade =
    Boolean(existingAttackClip) &&
    (existingAttackClip?.revision || 0) <
      BUNDLED_PLAYER_GUITAR_ATTACK_CLIP.revision;
  const needsAnimationProfile = !object.asset.animation_profile;
  const needsAnimationProfileUpgrade =
    needsAttackClipUpgrade &&
    object.asset.animation_profile?.id ===
      BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE.id;
  const animationSources = object.asset.animation_sources || [];
  const needsStealthWalkSource = !animationSources.some(
    (source) => source.clip_name === PLAYER_STEALTH_WALK_FBX_CLIP,
  );
  const needsSeatedSource = !animationSources.some(
    (source) => source.clip_name === PLAYER_SEATED_FBX_CLIP,
  );
  const animationClips = object.asset.animation_clips || [];
  const needsStealthWalkClipMetadata = !animationClips.some(
    (clip) => clip.name === PLAYER_STEALTH_WALK_FBX_CLIP,
  );
  const needsSeatedClipMetadata = !animationClips.some(
    (clip) => clip.name === PLAYER_SEATED_FBX_CLIP,
  );
  if (
    !needsScaleUpgrade &&
    !needsAttackClip &&
    !needsAttackClipUpgrade &&
    !needsAnimationProfile &&
    !needsAnimationProfileUpgrade &&
    !needsStealthWalkSource &&
    !needsStealthWalkClipMetadata &&
    !needsSeatedSource &&
    !needsSeatedClipMetadata
  ) {
    return object;
  }

  const upgradedAnimationProfile = needsAnimationProfileUpgrade
    ? {
        ...object.asset.animation_profile!,
        action_bindings: [
          ...(object.asset.animation_profile?.action_bindings || []).filter(
            (binding) =>
              binding.action !== "attack" ||
              binding.clip_id !== PLAYER_GUITAR_ATTACK_CLIP_ID,
          ),
          structuredClone(
            BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE.action_bindings[0],
          ),
        ],
      }
    : object.asset.animation_profile;

  return {
    ...object,
    bounds: needsScaleUpgrade
      ? [...BUNDLED_PLAYER_RENDER_BOUNDS]
      : object.bounds,
    asset: {
      ...object.asset,
      scale: needsScaleUpgrade
        ? [
            BUNDLED_PLAYER_MODEL_SCALE,
            BUNDLED_PLAYER_MODEL_SCALE,
            BUNDLED_PLAYER_MODEL_SCALE,
          ]
        : object.asset.scale,
      authored_animation_clips: needsAttackClip
        ? [
            ...authoredAnimationClips,
            structuredClone(BUNDLED_PLAYER_GUITAR_ATTACK_CLIP),
          ]
        : needsAttackClipUpgrade
          ? authoredAnimationClips.map((clip) =>
              clip.id === PLAYER_GUITAR_ATTACK_CLIP_ID
                ? structuredClone(BUNDLED_PLAYER_GUITAR_ATTACK_CLIP)
                : clip,
            )
        : authoredAnimationClips,
      animation_profile: needsAnimationProfile
        ? structuredClone(BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE)
        : upgradedAnimationProfile,
      animation_sources: [
        ...animationSources,
        ...(needsStealthWalkSource
          ? [structuredClone(BUNDLED_PLAYER_STEALTH_WALK_ANIMATION_SOURCE)]
          : []),
        ...(needsSeatedSource
          ? [structuredClone(BUNDLED_PLAYER_SEATED_ANIMATION_SOURCE)]
          : []),
      ],
      animation_clips: [
        ...animationClips,
        ...(needsStealthWalkClipMetadata
          ? [structuredClone(BUNDLED_PLAYER_STEALTH_WALK_CLIP_METADATA)]
          : []),
        ...(needsSeatedClipMetadata
          ? [structuredClone(BUNDLED_PLAYER_SEATED_CLIP_METADATA)]
          : []),
      ],
    },
  };
};

export const getPlayerModelOptions = (
  gamePackage: GamePackage,
): ObjectData[] => {
  const candidates = gamePackage.object_library.filter(
    (object) =>
      object.id !== PLAYER_ELECTRIC_GUITAR_OBJECT_ID &&
      object.model_kind === "asset" &&
      Boolean(object.asset),
  );
  if (candidates.some((object) => object.id === PLAYER_IDLE_FBX_MODEL_ID)) {
    return candidates.map(upgradeBundledPlayerModel);
  }
  return [BUNDLED_PLAYER_IDLE_MODEL, ...candidates];
};

export const resolvePlayerModelObject = (
  gamePackage: GamePackage,
): ObjectData | undefined => {
  const settings = gamePackage.settings || {};
  const hasExplicitSelection = Object.prototype.hasOwnProperty.call(
    settings,
    "player_model_id",
  );
  const configuredId =
    typeof settings.player_model_id === "string"
      ? settings.player_model_id.trim()
      : "";

  if (hasExplicitSelection && !configuredId) return undefined;
  if (!configuredId && !isLegacyBundledWorkspace(gamePackage)) {
    return undefined;
  }

  const modelId = configuredId || PLAYER_IDLE_FBX_MODEL_ID;
  const authored = gamePackage.object_library.find(
    (object) => object.id === modelId,
  );
  if (authored?.model_kind === "asset" && authored.asset) {
    return upgradeBundledPlayerModel(authored);
  }
  return modelId === PLAYER_IDLE_FBX_MODEL_ID
    ? BUNDLED_PLAYER_IDLE_MODEL
    : undefined;
};

const usesBundledPlayerModel = (gamePackage: GamePackage): boolean => {
  const settings = gamePackage.settings || {};
  const hasExplicitSelection = Object.prototype.hasOwnProperty.call(
    settings,
    "player_model_id",
  );
  const configuredId =
    typeof settings.player_model_id === "string"
      ? settings.player_model_id.trim()
      : "";
  if (hasExplicitSelection) return configuredId === PLAYER_IDLE_FBX_MODEL_ID;
  return isLegacyBundledWorkspace(gamePackage);
};

const isLegacyBundledGuitarAttachment = (
  attachment: VisualAttachmentProfileData,
): boolean => {
  const revision = attachment.revision || 1;
  const nearlyEqual = (left: number, right: number) =>
    Math.abs(left - right) < 0.000001;
  const legacyPose = revision === 1
    ? {
        position: [
          0,
          BUNDLED_PLAYER_GUITAR_LEGACY_STOWED_Y,
          -0.12,
        ] as const,
        quaternion: [0, 1, 0, 0] as const,
      }
    : revision === 2
      ? {
          position: [
            -0.18,
            BUNDLED_PLAYER_GUITAR_LEGACY_STOWED_Y,
            -0.12,
          ] as const,
          quaternion: [0.27563736, 0.9612617, 0, 0] as const,
        }
      : revision === 3 || revision === 4 || revision === 5
        ? {
            position: [
              -0.18,
              BUNDLED_PLAYER_GUITAR_STOWED_Y,
              -0.12,
            ] as const,
            quaternion: [0.38268343, 0.92387953, 0, 0] as const,
          }
        : undefined;
  if (!legacyPose) return false;
  // Revisions 3–5 are recent enough that users may have edited their hand
  // socket or timing in the Animation Studio. Only migrate them when those
  // fields still match the former engine-owned setup exactly.
  if (revision === 3 || revision === 4 || revision === 5) {
    const legacyRotationX = BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM.rotation[0];
    const legacyQuaternion = [
      Math.sin(legacyRotationX / 2),
      0,
      0,
      Math.cos(legacyRotationX / 2),
    ];
    const transition = attachment.transition;
    const legacyActiveSocket = revision === 3
      ? attachment.active_socket.bone_name === "mixamorigRightHand" &&
        attachment.active_socket.position.every((value, index) =>
          nearlyEqual(
            value,
            BUNDLED_PLAYER_GUITAR_ATTACHMENT_TRANSFORM.position[index],
          ),
        ) &&
        attachment.active_socket.quaternion.every((value, index) =>
          nearlyEqual(value, legacyQuaternion[index]),
        ) &&
        attachment.active_socket.scale.every((value, index) =>
          nearlyEqual(value, BUNDLED_PLAYER_GUITAR_STOWED_SCALE[index]),
        )
      : attachment.active_socket.bone_name === "mixamorigLeftHand" &&
        attachment.active_socket.position.every((value, index) =>
          nearlyEqual(
            value,
            [0.00768759, -0.14495355, -0.18254102][index],
          ),
        ) &&
        attachment.active_socket.quaternion.every((value, index) =>
          nearlyEqual(
            value,
            [0.09221219, 0.87288314, 0.42364765, 0.22381826][index],
          ),
        ) &&
        attachment.active_socket.scale.every((value, index) =>
          nearlyEqual(value, BUNDLED_PLAYER_GUITAR_STOWED_SCALE[index]),
        );
    const legacyRightHandTransition =
      nearlyEqual(transition.draw_start, 0) &&
      nearlyEqual(transition.draw_end, 0.25) &&
      nearlyEqual(transition.return_start, 0.68) &&
      nearlyEqual(transition.return_end, 1);
    const legacyLeftHandTransition =
      nearlyEqual(transition.draw_start, 0.1) &&
      nearlyEqual(transition.draw_end, 0.125) &&
      nearlyEqual(transition.return_start, 0.845) &&
      nearlyEqual(transition.return_end, 0.875);
    const interimLeftHandTransition =
      nearlyEqual(
        transition.draw_start,
        BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition.draw_start,
      ) &&
      nearlyEqual(
        transition.draw_end,
        BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition.draw_end,
      ) &&
      nearlyEqual(
        transition.return_start,
        BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition.return_start,
      ) &&
      nearlyEqual(
        transition.return_end,
        BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition.return_end,
      );
    const legacyTransition = revision === 3
      ? legacyRightHandTransition
      : legacyLeftHandTransition || interimLeftHandTransition;
    if (!legacyActiveSocket || !legacyTransition) return false;
  }
  return (
    attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID &&
    attachment.object_id === PLAYER_ELECTRIC_GUITAR_OBJECT_ID &&
    attachment.stowed_socket.bone_name === "mixamorigSpine2" &&
    attachment.stowed_socket.position.every((value, index) =>
      nearlyEqual(value, legacyPose.position[index]),
    ) &&
    attachment.stowed_socket.quaternion.every((value, index) =>
      nearlyEqual(value, legacyPose.quaternion[index]),
    ) &&
    attachment.stowed_socket.scale.every((value, index) =>
      nearlyEqual(value, BUNDLED_PLAYER_GUITAR_STOWED_SCALE[index]),
    )
  );
};

const upgradeBundledGuitarAttachment = (
  attachment: VisualAttachmentProfileData,
): VisualAttachmentProfileData =>
  isLegacyBundledGuitarAttachment(attachment)
    ? {
        ...attachment,
        revision: BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.revision,
        stowed_socket: structuredClone(
          BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.stowed_socket,
        ),
        active_socket: structuredClone(
          BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.active_socket,
        ),
        transition: structuredClone(
          BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE.transition,
        ),
      }
    : attachment;

/**
 * Adds the built-in Steve guitar content without replacing authored objects,
 * animation overrides, or attachments. Import normalization can call this for
 * legacy workspaces; calling it repeatedly returns the same package reference.
 */
export const withBundledPlayerGuitarContent = (
  gamePackage: GamePackage,
): GamePackage => {
  if (!usesBundledPlayerModel(gamePackage)) return gamePackage;

  const withGuitar = withBundledPlayerElectricGuitarObject(gamePackage);
  let upgradedPlayer = false;
  const objectLibrary = withGuitar.object_library.map((object) => {
    const upgraded = upgradeBundledPlayerModel(object);
    if (upgraded !== object) upgradedPlayer = true;
    return upgraded;
  });
  const attachments = withGuitar.settings.player_visual_attachments || [];
  const hasAttachment = attachments.some(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  );
  const upgradedAttachments = attachments.map(upgradeBundledGuitarAttachment);
  const upgradedAttachment = upgradedAttachments.some(
    (attachment, index) => attachment !== attachments[index],
  );
  const needsAnimationOverride =
    !withGuitar.settings.player_animation_override;
  const needsAttachment = !hasAttachment;
  if (
    withGuitar === gamePackage &&
    !upgradedPlayer &&
    !needsAnimationOverride &&
    !needsAttachment &&
    !upgradedAttachment
  ) {
    return gamePackage;
  }

  return {
    ...withGuitar,
    settings: {
      ...withGuitar.settings,
      player_animation_override: needsAnimationOverride
        ? structuredClone(BUNDLED_PLAYER_GUITAR_ANIMATION_OVERRIDE)
        : withGuitar.settings.player_animation_override,
      player_visual_attachments: needsAttachment
        ? [
            ...upgradedAttachments,
            structuredClone(BUNDLED_PLAYER_GUITAR_ATTACHMENT_PROFILE),
          ]
        : upgradedAttachment
          ? upgradedAttachments
          : withGuitar.settings.player_visual_attachments,
    },
    object_library: upgradedPlayer
      ? objectLibrary
      : withGuitar.object_library,
  };
};
