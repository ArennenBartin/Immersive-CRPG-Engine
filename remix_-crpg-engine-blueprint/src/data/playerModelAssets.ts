import type { GamePackage, ObjectData } from "../schema/game";

export const PLAYER_IDLE_FBX_MODEL_ID = "obj_player_intercessor_idle_fbx";
export const PLAYER_IDLE_FBX_CLIP = "mixamo.com";
export const PLAYER_WALK_FBX_CLIP = "walk";

export const resolvePlayerLocomotionClip = (moving: boolean) =>
  moving ? PLAYER_WALK_FBX_CLIP : PLAYER_IDLE_FBX_CLIP;

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
  bounds: [0.8027343809808369, 0.9980468153953554, 0.23242190653400055],
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
    scale: [1, 1, 1],
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
    source_bounds: [
      0.8027343809808369,
      0.9980468153953554,
      0.23242190653400055,
    ],
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
      {
        data_url: "/models/player/Walking.fbx",
        filename: "Walking.fbx",
        source_type: "fbx",
        source_clip_name: "mixamo.com",
        clip_name: PLAYER_WALK_FBX_CLIP,
      },
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
    ],
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

export const getPlayerModelOptions = (
  gamePackage: GamePackage,
): ObjectData[] => {
  const candidates = gamePackage.object_library.filter(
    (object) => object.model_kind === "asset" && Boolean(object.asset),
  );
  if (candidates.some((object) => object.id === PLAYER_IDLE_FBX_MODEL_ID)) {
    return candidates;
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
  if (authored?.model_kind === "asset" && authored.asset) return authored;
  return modelId === PLAYER_IDLE_FBX_MODEL_ID
    ? BUNDLED_PLAYER_IDLE_MODEL
    : undefined;
};
