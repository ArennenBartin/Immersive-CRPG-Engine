import type { EntityData, ObjectData } from "../schema/game";

export const BACKROOMS_PARASITE_ENTITY_ID = "ent_backrooms_parasite";
export const BACKROOMS_PARASITE_MODEL_OBJECT_ID =
  "obj_backrooms_parasite_model";

const SOURCE_BOUNDS: [number, number, number] = [
  0.998046875,
  0.798828125,
  0.9902343153953552,
];
const MODEL_SCALE = 1.8;

export const BACKROOMS_PARASITE_MODEL: ObjectData = {
  id: BACKROOMS_PARASITE_MODEL_OBJECT_ID,
  display_name: "Backrooms Parasite",
  category: "characters",
  tags: [
    "character",
    "enemy",
    "backrooms",
    "parasite",
    "glb",
    "engine_builtin",
  ],
  origin: "center_floor",
  bounds: SOURCE_BOUNDS.map((axis) => axis * MODEL_SCALE) as [
    number,
    number,
    number,
  ],
  materials: [
    "tripo_node_7e0f4f15-85f7-4791-97ea-aac0e5088da3_material",
  ],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: "/models/entities/parasite1.glb",
    filename: "parasite1.glb",
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [MODEL_SCALE, MODEL_SCALE, MODEL_SCALE],
    source_min: [-0.4990234375, 0, -0.4951171576976776],
    source_center: [0, 0.3994140625, 0],
    source_bounds: SOURCE_BOUNDS,
    material_names: [
      "tripo_node_7e0f4f15-85f7-4791-97ea-aac0e5088da3_material",
    ],
    stats: {
      meshes: 1,
      vertices: 8603,
      triangles: 4981,
      materials: 1,
      textures: 1,
      bytes: 6913632,
    },
  },
  collision: {
    profile: "none",
    footprint: [[0, 0]],
  },
};

export const BACKROOMS_PARASITE_ENTITY: EntityData = {
  id: BACKROOMS_PARASITE_ENTITY_ID,
  display_name: "Parasite",
  is_npc: false,
  max_hp: 18,
  max_mp: 0,
  attack: 4,
  defense: 1,
  speed: 9,
  xp_reward: 12,
  skills: [],
  independent_movement: {
    enabled: true,
    interval_ms: 180,
    activation_radius: 60,
    steps_per_pulse: 2,
  },
  horror_combat: {
    windup_ms: 500,
    active_ms: 120,
    recovery_ms: 850,
    reach_fine_cells: 2,
    lunge_fine_cells: 2,
    direction_lock_fraction: 0.6,
  },
  sensory_profile: {
    id: "backrooms_predator",
    // Once geometry breaks sight, the Parasite goes to the last confirmed
    // position and checks only a couple of nearby branches. Quiet movement can
    // therefore break a chase; ordinary footsteps keep supplying fresh clues.
    memory_ticks: 300,
    search_ticks: 240,
    search_steps: 2,
    channels: [
      {
        id: "predator_sight",
        stimulus_kinds: ["visible_player"],
        ignored_stimulus_tags: [],
        stimulus_tag_multipliers: {},
        // Sensory ranges resolve in the active fine grid. 120 fine cells cover
        // the full 33-macro-cell Level Zero sightline without granting vision
        // through structural blockers.
        range: 120,
        threshold: 0.025,
        sensitivity: 1.5,
        repeated_sound_gain: 0,
        positional_uncertainty: 0,
        barrier_response: "normal",
        requires_los: true,
        requires_view_cone: true,
        view_cone_degrees: 210,
        // The Parasite navigates the Backrooms in darkness. Geometry still
        // owns acquisition, so walls block it even when low light does not.
        requires_illumination: false,
        tracks_live_target: true,
        source_tracking: "none",
      },
      {
        id: "predator_hearing",
        stimulus_kinds: ["sound"],
        ignored_stimulus_tags: [],
        stimulus_tag_multipliers: {
          footstep: 1.65,
          movement: 1.25,
          impact: 1.8,
          object_push: 1.5,
        },
        range: 24,
        threshold: 0.05,
        sensitivity: 2,
        repeated_sound_gain: 0.35,
        positional_uncertainty: 0.5,
        barrier_response: "reduced",
        requires_los: false,
        requires_view_cone: false,
        view_cone_degrees: 360,
        requires_illumination: false,
        tracks_live_target: false,
        source_tracking: "none",
      },
    ],
  },
  model_object_id: BACKROOMS_PARASITE_MODEL_OBJECT_ID,
};
