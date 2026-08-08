import type {
  AuthoredAnimationClipData,
  GamePackage,
  ModelAnimationProfileData,
  ObjectData,
} from "../schema/game";

export const PLAYER_ELECTRIC_GUITAR_OBJECT_ID =
  "obj_player_electric_guitar";
export const PLAYER_ELECTRIC_GUITAR_ASSET_URL =
  "/models/player/electric-guitar.glb";
export const PLAYER_GUITAR_ATTACK_CLIP_ID =
  "anim_player_guitar_side_swing";
export const PLAYER_GUITAR_ATTACK_CLIP_NAME = "guitar_side_swing";
export const PLAYER_GUITAR_ANIMATION_PROFILE_ID =
  "profile_player_guitar_default";
export const PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID =
  "attach_player_electric_guitar";
export const PLAYER_ELECTRIC_GUITAR_HAND_BONE = "mixamorigLeftHand";

export const PLAYER_ELECTRIC_GUITAR_SOURCE_MIN: [number, number, number] = [
  -0.1943359375,
  0,
  -0.057617202401161194,
];
export const PLAYER_ELECTRIC_GUITAR_SOURCE_CENTER: [number, number, number] = [
  0,
  0.4990234375,
  0,
];
export const PLAYER_ELECTRIC_GUITAR_SOURCE_BOUNDS: [number, number, number] = [
  0.388671875,
  0.998046875,
  0.11523440480232239,
];

// The source origin is the bottom strap button. This point sits inside the
// upper neck and makes a stable one-handed melee grip.
export const PLAYER_ELECTRIC_GUITAR_GRIP_POINT: [number, number, number] = [
  -0.003,
  0.7,
  0.022,
];

const SWING_KEYFRAME_FRAMES = [0, 2, 4, 5, 9, 13, 16, 18, 20] as const;
const IDENTITY_QUATERNION = [0, 0, 0, 1] as const;
type SwingQuaternion = readonly [number, number, number, number];

const guitarSwingTrack = (
  targetNode: string,
  poses: readonly [
    SwingQuaternion,
    SwingQuaternion,
    SwingQuaternion,
    SwingQuaternion,
    SwingQuaternion,
    SwingQuaternion,
    SwingQuaternion,
  ],
) => ({
  id: `track_${PLAYER_GUITAR_ATTACK_CLIP_NAME}_${targetNode.replace(
    /^mixamorig/u,
    "",
  ).toLowerCase()}`,
  target_node: targetNode,
  property: "quaternion" as const,
  interpolation: "linear" as const,
  keyframes: [
    IDENTITY_QUATERNION,
    poses[0],
    poses[1],
    poses[2],
    poses[3],
    poses[4],
    poses[5],
    poses[6],
    IDENTITY_QUATERNION,
  ].map((pose, index) => ({
    frame: SWING_KEYFRAME_FRAMES[index],
    value: [...pose] as [number, number, number, number],
  })),
});

export const BUNDLED_PLAYER_GUITAR_ATTACK_CLIP: AuthoredAnimationClipData = {
  id: PLAYER_GUITAR_ATTACK_CLIP_ID,
  name: PLAYER_GUITAR_ATTACK_CLIP_NAME,
  display_name: "Guitar Side Swing",
  kind: "gameplay_action",
  value_mode: "additive",
  fps: 30,
  duration_frames: 20,
  // Revision 6 bakes a left-hand pickup and exterior shoulder draw around
  // Steve, then uses the CC0 UAL2 Sword_Regular_B torso/yaw motion for the
  // broad horizontal strike. The right hand joins with a fixed grip only after
  // the guitar reaches its ready pose, and frame 18 is separately solved
  // against its own idle base before the neck relatches to Steve's back.
  revision: 6,
  loop: "once",
  tracks: [
    guitarSwingTrack("mixamorigSpine", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigSpine1", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [-0.00060908, 0.03489418, -0.01744177, 0.99923861],
      [0.00245434, 0.01748241, -0.09310173, 0.99550008],
      [0.02307378, -0.01279542, -0.0876502, 0.99580185],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigSpine2", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [-0.00243447, 0.06971398, -0.03481448, 0.99695636],
      [-0.00926677, -0.17153602, -0.09640949, 0.98040539],
      [0.00934701, -0.2683491, -0.08024906, 0.95992785],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigRightShoulder", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0.11000856, 0.00000001, -0.33783823, 0.93475315],
      [0.11593147, 0.01832515, -0.51173806, 0.8510865],
      [0.10806063, -0.00140128, -0.31994919, 0.941251],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigRightArm", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [-0.00002599, 0.016559, -0.44654007, 0.8946104],
      [-0.31962404, 0.22427489, -0.13386776, 0.91083515],
      [0.04002977, -0.00326518, -0.42181628, 0.90579136],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigRightForeArm", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [-0.14571465, 0.30548356, -0.36965599, 0.86533316],
      [-0.15969916, 0.66003636, 0.0943853, 0.7279695],
      [-0.3546828, 0.28554994, -0.55435191, 0.69667447],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigRightHand", [
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0.35610647, -0.43853473, 0.27877799, 0.77663267],
      [0.11735113, -0.21563255, 0.70797359, 0.66219688],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]),
    guitarSwingTrack("mixamorigLeftShoulder", [
      [0.02134536, 0, -0.16950903, 0.98529745],
      [-0.13123784, 0, -0.07481769, 0.98852362],
      [-0.1957639, 0, 0.18159503, 0.96369069],
      [-0.17175833, 0.02965242, 0.30529748, 0.93616946],
      [-0.20634709, -0.00672602, 0.15830191, 0.96556519],
      [-0.13162539, 0, -0.07405525, 0.9885295],
      [0.02105316, 0, -0.16982091, 0.98525003],
    ]),
    guitarSwingTrack("mixamorigLeftArm", [
      [0.1769294, -0.00035284, -0.26453745, 0.94800622],
      [-0.24406769, -0.00567261, -0.31597811, 0.91681875],
      [-0.41833986, -0.00789092, 0.29497125, 0.85902355],
      [-0.36255384, -0.00407826, 0.25589717, 0.89613321],
      [-0.59117923, -0.00285277, 0.42751748, 0.68390627],
      [-0.25040294, -0.0056653, -0.31085043, 0.91686329],
      [0.17508594, -0.00038393, -0.26779342, 0.94743414],
    ]),
    guitarSwingTrack("mixamorigLeftForeArm", [
      [0.38085901, 0.14503852, -0.68445257, 0.60451214],
      [-0.55872301, 0.087613, -0.60932107, 0.55577009],
      [-0.53850696, -0.31436856, 0.28302673, 0.72875135],
      [-0.03288588, -0.26476085, -0.14352967, 0.95300548],
      [-0.3194091, -0.55317456, -0.76369767, 0.09349652],
      [-0.57130133, 0.08408858, -0.59837883, 0.55541577],
      [0.37479513, 0.14598452, -0.69010417, 0.60164222],
    ]),
    guitarSwingTrack("mixamorigLeftHand", [
      [0.08665207, -0.41741952, 0.55633318, 0.71326416],
      [-0.06768031, -0.5373445, 0.84020023, -0.02727338],
      [-0.13060087, -0.46507885, 0.77704686, -0.40353842],
      [0.01145727, 0.00805063, 0.48695355, -0.87331561],
      [-0.01888452, -0.83673895, 0.25340932, -0.48507217],
      [-0.00849809, -0.37653522, 0.11403501, -0.91931769],
      [-0.08961362, 0.41815383, -0.5554705, -0.71314044],
    ]),
  ],
};

export const BUNDLED_PLAYER_GUITAR_ANIMATION_PROFILE: ModelAnimationProfileData = {
  id: PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  display_name: "Player Guitar Combat",
  root_node_name: "mixamorigHips",
  action_bindings: [
    {
      action: "attack",
      clip_id: PLAYER_GUITAR_ATTACK_CLIP_ID,
      crossfade_ms: 0,
      playback_rate: 1,
      sync: "action_phase",
      layer: "upper_body",
      bone_mask_root: "mixamorigSpine",
      blend_mode: "additive",
      frame_range: { start_frame: 0, end_frame: 20 },
      phase_markers: {
        windup_end_frame: 9,
        impact_frame: 9,
        active_end_frame: 13,
      },
    },
  ],
};

const GUITAR_HANG_ROTATION_X = -Math.PI / 2;

/**
 * Produces a hand-local transform that hangs the guitar body below the hand,
 * presents its decorated front outward, and cancels an inherited character
 * scale. The position is derived from the grip point after rotation and scale,
 * so the chosen point remains exactly at the bone origin.
 */
export const createPlayerElectricGuitarAttachmentTransform = (
  inheritedCharacterScale: number,
) => {
  const uniformScale = 1 / inheritedCharacterScale;
  const [gripX, gripY, gripZ] = PLAYER_ELECTRIC_GUITAR_GRIP_POINT;
  const sine = Math.sin(GUITAR_HANG_ROTATION_X);
  const cosine = Math.cos(GUITAR_HANG_ROTATION_X);
  const rotatedGripX = gripX * uniformScale;
  const rotatedGripY =
    (gripY * cosine - gripZ * sine) * uniformScale;
  const rotatedGripZ =
    (gripY * sine + gripZ * cosine) * uniformScale;

  return {
    position: [
      -rotatedGripX,
      -rotatedGripY,
      -rotatedGripZ,
    ] as [number, number, number],
    rotation: [GUITAR_HANG_ROTATION_X, 0, 0] as [number, number, number],
    scale: [uniformScale, uniformScale, uniformScale] as [
      number,
      number,
      number,
    ],
  };
};

export const BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL: ObjectData = {
  id: PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  display_name: "Player Electric Guitar",
  category: "weapons",
  tags: [
    "weapon",
    "melee",
    "guitar",
    "player",
    "player_attachment",
    "glb",
    "engine_builtin",
  ],
  origin: "center_floor",
  bounds: [...PLAYER_ELECTRIC_GUITAR_SOURCE_BOUNDS],
  materials: ["player_electric_guitar_material"],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: PLAYER_ELECTRIC_GUITAR_ASSET_URL,
    filename: "electric-guitar.glb",
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    source_min: [...PLAYER_ELECTRIC_GUITAR_SOURCE_MIN],
    source_center: [...PLAYER_ELECTRIC_GUITAR_SOURCE_CENTER],
    source_bounds: [...PLAYER_ELECTRIC_GUITAR_SOURCE_BOUNDS],
    material_names: ["player_electric_guitar_material"],
    stats: {
      meshes: 1,
      vertices: 6490,
      triangles: 4279,
      materials: 1,
      textures: 1,
      bytes: 399880,
    },
  },
  collision: {
    profile: "none",
    footprint: [[0, 0]],
  },
};

export const resolvePlayerElectricGuitarObject = (
  gamePackage: GamePackage,
): ObjectData =>
  gamePackage.object_library.find(
    (object) => object.id === PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  ) || BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL;

/** Add the built-in guitar without replacing an authored object with the ID. */
export const withBundledPlayerElectricGuitarObject = (
  gamePackage: GamePackage,
): GamePackage => {
  if (
    gamePackage.object_library.some(
      (object) => object.id === PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
    )
  ) {
    return gamePackage;
  }
  return {
    ...gamePackage,
    object_library: [
      ...gamePackage.object_library,
      structuredClone(BUNDLED_PLAYER_ELECTRIC_GUITAR_MODEL),
    ],
  };
};
