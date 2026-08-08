import type { EntityData, GamePackage, ObjectData } from "../schema/game";
import { peopleHorrorSpriteId } from "./animatedSprites";

export const RILEY_ENTITY_ID = "ent_riley";
export const RILEY_MODEL_OBJECT_ID = "obj_riley_rigged_model";
export const RILEY_DIALOGUE_ID = "dlg_riley_arrival";
export const RILEY_SEATED_IDLE_CLIP = "AN_Riley_SeatedIdle";
export const RILEY_BUNDLED_ASSET_REVISION = "riley_sitting_idle_source_v3";
export const RILEY_SOFA_PLACEMENT_ID = "riley_seated_on_sofa";
export const RILEY_SOFA_OBJECT_PLACEMENT_ID =
  "lonely_street_interior_sofa";
export const RILEY_SOFA_ANCHOR_REVISION = "riley_sofa_seat_anchor_v3";
// Offset Riley to the center of the left cushion. The supplied sitting clip
// was authored for a lower chair, so the presentation lift puts her pelvis
// into the cushion's soft top while her lower legs clear the couch shell.
// Keep Riley's authoritative/interactive anchor on the walkable floor in
// front of the sofa. Only the rendered model is offset back onto the seat;
// entities must never occupy the sofa's blocked collision footprint.
export const RILEY_SOFA_SEATED_CELL: [number, number] = [-2, 1];
export const RILEY_SOFA_SEATED_PRESENTATION_OFFSET: [number, number] = [
  -0.57, -0.9,
];
// Headless skinned-mesh measurement places the cushion top at Y=0.6402 and
// Riley's seated contact surface 0.16284 above her root. Rounded to the nearest
// centimetre, the free-standing fallback root therefore belongs at Y=0.48.
export const RILEY_SOFA_SEATED_HEIGHT_OFFSET = 0.48;
// The sofa model is grounded with the renderer's 0.01 m prop clearance, so its
// local anchor is 0.47 m high to resolve to the same measured 0.48 m world Y.
export const RILEY_SOFA_SEATED_LOCAL_POSITION: [number, number, number] = [
  -0.57, 0.47, 0.1,
];
// Face out from the sofa into the room. This stays furniture-relative so
// proximity/dialogue bookkeeping cannot rotate Riley's entire seated pose.
export const RILEY_SOFA_SEATED_LOCAL_FACING: [number, number] = [0, 1];

const SOURCE_BOUNDS: [number, number, number] = [0.557534, 0.74, 0.189707];
const MODEL_SCALE = 2.2;

/**
 * Riley stays skinned to her 49-bone Mixamo rig. The bundled seated idle is
 * ordinary FK animation, so later head turns, gestures, standing, and walking
 * clips can target the same skeleton without replacing the model asset.
 */
export const RILEY_RIGGED_MODEL: ObjectData = {
  id: RILEY_MODEL_OBJECT_ID,
  display_name: "Riley (Rigged)",
  category: "characters",
  tags: [
    "character",
    "npc",
    "riley",
    "rigged",
    "skinned",
    "animated",
    "mixamo",
    "glb",
    "engine_builtin",
    RILEY_BUNDLED_ASSET_REVISION,
  ],
  origin: "center_floor",
  bounds: SOURCE_BOUNDS.map((axis) => axis * MODEL_SCALE) as [
    number,
    number,
    number,
  ],
  materials: ["tripo_node_568365fb_f19b_42c2_ae19_084753cafd3f_materialmat"],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: "/models/entities/riley-rigged.glb",
    filename: "riley-rigged.glb",
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [MODEL_SCALE, MODEL_SCALE, MODEL_SCALE],
    source_min: [-0.278767, 0, -0.094853],
    source_center: [0, 0.37, 0],
    source_bounds: SOURCE_BOUNDS,
    material_names: [
      "tripo_node_568365fb_f19b_42c2_ae19_084753cafd3f_materialmat",
    ],
    animation: {
      clip_name: RILEY_SEATED_IDLE_CLIP,
      autoplay: true,
      // The supplied Sitting Idle performance drives Riley's complete seated
      // pose, including grounded feet, bent knees, relaxed arms, and breathing.
      loop: "repeat",
      time_scale: 1,
    },
    animation_clips: [
      {
        name: RILEY_SEATED_IDLE_CLIP,
        duration: 4.033333333333333,
        tracks: 80,
      },
    ],
    animation_profile: {
      id: "riley_seated_profile",
      display_name: "Riley seated",
      root_node_name: "mixamorig:Hips",
      default_clip_id: RILEY_SEATED_IDLE_CLIP,
      action_bindings: [],
    },
    stats: {
      meshes: 1,
      vertices: 2410,
      triangles: 4807,
      materials: 1,
      textures: 1,
      bytes: 3497764,
    },
  },
  collision: {
    profile: "none",
    footprint: [[0, 0]],
  },
};

export const RILEY_ENTITY: EntityData = {
  id: RILEY_ENTITY_ID,
  display_name: "Riley",
  sprite_id: peopleHorrorSpriteId(2, 1),
  dialogue_id: RILEY_DIALOGUE_ID,
  is_npc: true,
  max_hp: 24,
  max_mp: 8,
  attack: 3,
  defense: 1,
  speed: 8,
  skills: [],
  model_object_id: RILEY_MODEL_OBJECT_ID,
  // A soft, non-shadow-casting bounce keeps a friendly story NPC readable
  // even when the sofa blocks the room's practical lamps. Backrooms enemies
  // do not opt into this presentation light.
  presentation_fill_light: {
    color: "#ffd1ad",
    intensity: 2.35,
    radius: 3.2,
    position: [0.38, 1.02, 0.72],
  },
  // Riley's impossible calm while fully engulfed is a deliberate story beat.
  // The emitter begins below the sofa-rooted model so the flames cover her
  // hanging feet, torso, hair, and the space above her head.
  presentation_fire: {
    hot_color: "#fff3a0",
    mid_color: "#ff7412",
    edge_color: "#c91e04",
    light_color: "#ff6410",
    light_intensity: 5.4,
    light_radius: 4.1,
    width: 0.84,
    height: 1.68,
    position: [0, -0.12, 0.02],
    spark_count: 20,
  },
};

export const RILEY_ARRIVAL_DIALOGUE: GamePackage["dialogue"][number] = {
  id: RILEY_DIALOGUE_ID,
  display_name: "Riley",
  format: "tree_v1",
  nodes: [
    {
      id: "start",
      speaker: "Riley",
      text: "Hey, Steve. You made it.",
      options: [{ text: "Yeah. Sorry it took me so long." }],
    },
  ],
};
