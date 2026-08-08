import type { EntityData, GamePackage, ObjectData } from "../schema/game";

export const MOON_GOD_MODEL_OBJECT_ID = "obj_lonely_street_moon_god";
export const MOON_GOD_ENTITY_ID = "ent_lonely_street_moon_god";
export const MOON_GOD_PLACEMENT_ID = "lonely_basement_moon_god";
export const MOON_GOD_FRIDGE_ANCHOR_PLACEMENT_ID =
  "lonely_basement_fridge";
// Bumped whenever the placement's calibration changes at all — anchor
// position/facing/lock, or (as of v4) collision_mode — so a workspace holding
// an older placement is detected as stale and reinstalled wholesale (see
// hasBundledBasementEncounter/installBundledBasementEncounterOnMap in
// engineStore.ts). Without that check the apparition can drift off its post
// via ordinary idle-wander AI and then render at its raw (unlocked) pose
// instead of the fixed anchor pose, which reads as "it takes a step and
// turns" on an otherwise-static NPC. The same wholesale replace is what lets
// a save predating the v4 solid collision pick it up on load.
export const MOON_GOD_STATIC_ANCHOR_REVISION =
  "moon_god_fridge_anchor_v4";
export const MOON_GOD_DIALOGUE_ID = "dlg_lonely_basement_moon_god";
export const MOON_GOD_VANISH_CUTSCENE_ID =
  "cut_lonely_basement_moon_god_vanish";
export const MOON_GOD_INTERACT_TRIGGER_ID =
  "trg_lonely_basement_moon_god";
// Set once Steve has interacted with the Moon God (the vanish cutscene has
// played). The fridge's beer trigger gates on this so the beer cannot be
// grabbed by walking straight past the apparition.
export const MOON_GOD_ENCOUNTERED_SWITCH_ID =
  "lonely_basement_moon_god_encountered";

export const BASEMENT_BEER_ITEM_ID = "item_lonely_street_15_pack_beer";
export const BASEMENT_BEER_ACQUIRED_SWITCH_ID =
  "lonely_basement_beer_acquired";
export const BASEMENT_BEER_DIALOGUE_ID = "dlg_lonely_basement_beer_acquired";
export const BASEMENT_BEER_CUTSCENE_ID = "cut_lonely_basement_beer_acquired";
export const BASEMENT_BEER_INTERACT_TRIGGER_ID =
  "trg_lonely_basement_fridge_beer";
// A second interact trigger on the SAME fridge cell, eligible only while the
// Moon God hasn't been dealt with yet. Trigger conditions are evaluated in
// authored order and the first eligible one wins (see PlayMode's interact
// dispatch), so this and the real beer trigger above are mutually exclusive
// by their switch conditions and never both fire for the same press.
export const BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID =
  "trg_lonely_basement_fridge_beer_locked";
export const BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID =
  "dlg_lonely_basement_beer_locked";
export const BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID =
  "cut_lonely_basement_beer_locked";

export const BASEMENT_ENTRY_SILENCE_CUTSCENE_ID =
  "cut_lonely_basement_entry_silence";
export const BASEMENT_ENTRY_SILENCE_TRIGGER_ID =
  "trg_lonely_basement_entry_silence";

// Bumped alongside MODEL_SCALE below. A workspace whose object_library still
// carries an older revision tag gets the current MOON_GOD_MODEL reinstalled
// wholesale (see isLegacyBundledMoonGodModel in engineStore.ts) — otherwise a
// scale increase authored here would never reach an existing save.
export const MOON_GOD_ASSET_REVISION = "moon_god_dark_robe_v3";

const SOURCE_MIN: [number, number, number] = [
  -0.4990234375, 0, -0.4150390625,
];
const SOURCE_BOUNDS: [number, number, number] = [
  0.998046875, 0.732421875, 0.830078125,
];
const SOURCE_CENTER: [number, number, number] = [
  0, 0.3662109375, 0,
];
// The supplied Tripo export is normalized to a one-metre maximum dimension.
// The apparition must loom over Steve without poking through the basement
// ceiling. The room's flat concrete ceiling — measured directly from
// basement-shell.glb's "Concrete_Weathered" mesh, not the model's overall
// bounding box — sits at world Y = 2.74 m (its own local Y max of 2.60 m,
// plus the 0.14 m the shell placement's height_offset grounds the floor by).
// A taller bounding-box reading of ~4.6 m exists in the same file, but that
// comes from the SEPARATE stairwell shaft mesh ("Wood_Charred"), not the
// room proper, and using it here is what let the previous scale poke through
// the actual ceiling. This scale gives the robe a 2.40 m silhouette — ~1.33x
// PLAYER_COLLISION_HEIGHT (1.8 m), clearly taller than Steve — with 0.34 m of
// headroom to spare. Width/depth (2.50 m / 2.08 m) keep it clear of the stair
// post and refrigerator. The floor-contact pivot and embedded texture stay
// intact.
const MODEL_SCALE: [number, number, number] = [2.5, 3.28, 2.5];

export const MOON_GOD_MODEL: ObjectData = {
  id: MOON_GOD_MODEL_OBJECT_ID,
  display_name: "Moon God",
  category: "characters",
  tags: [
    "character",
    "npc",
    "moon_god",
    "dark_robe",
    "glb",
    "engine_builtin",
    MOON_GOD_ASSET_REVISION,
  ],
  origin: "center_floor",
  bounds: SOURCE_BOUNDS.map((axis, index) => axis * MODEL_SCALE[index]!) as [
    number,
    number,
    number,
  ],
  materials: ["tripo_node_8153c68a-bcfb-4b54-bad6-1de87f6aacb8_material"],
  material_settings: [],
  model_kind: "asset",
  parts: [],
  decals: [],
  reference_images: [],
  asset: {
    data_url: "/models/entities/moon-god.glb",
    filename: "moon-god.glb",
    source_type: "glb",
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: MODEL_SCALE,
    source_min: SOURCE_MIN,
    source_center: SOURCE_CENTER,
    source_bounds: SOURCE_BOUNDS,
    material_names: [
      "tripo_node_8153c68a-bcfb-4b54-bad6-1de87f6aacb8_material",
    ],
    stats: {
      meshes: 1,
      vertices: 5642,
      triangles: 4285,
      materials: 1,
      textures: 1,
      bytes: 6562332,
    },
  },
  collision: {
    profile: "none",
    footprint: [[0, 0]],
  },
};

export const MOON_GOD_ENTITY: EntityData = {
  id: MOON_GOD_ENTITY_ID,
  display_name: "Moon God",
  is_npc: true,
  max_hp: 1,
  max_mp: 0,
  attack: 0,
  defense: 0,
  speed: 0,
  skills: [],
  model_object_id: MOON_GOD_MODEL_OBJECT_ID,
  // A restrained lunar lift keeps the black robe legible against the unlit
  // refrigerator wall without turning the apparition into a room light.
  presentation_fill_light: {
    color: "#b9c8ff",
    intensity: 1.45,
    radius: 2.8,
    position: [0, 1.05, 0.25],
  },
};

export const MOON_GOD_DIALOGUE: GamePackage["dialogue"][number] = {
  id: MOON_GOD_DIALOGUE_ID,
  display_name: "Moon God",
  format: "tree_v1",
  nodes: [
    {
      id: "start",
      speaker: "Steve",
      text: "Moon God...",
      options: [],
    },
  ],
};

export const BASEMENT_BEER_DIALOGUE: GamePackage["dialogue"][number] = {
  id: BASEMENT_BEER_DIALOGUE_ID,
  display_name: "Basement Refrigerator",
  format: "tree_v1",
  nodes: [
    {
      id: "start",
      speaker: "Steve",
      text: "Beer acquired",
      options: [],
    },
  ],
};

export const BASEMENT_BEER_LOCKED_HINT_DIALOGUE: GamePackage["dialogue"][number] = {
  id: BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
  display_name: "Basement Refrigerator (blocked)",
  format: "tree_v1",
  nodes: [
    {
      id: "start",
      speaker: "Steve",
      text: "Not while that's still standing there.",
      options: [],
    },
  ],
};

export const MOON_GOD_VANISH_CUTSCENE: GamePackage["cutscenes"][number] = {
  id: MOON_GOD_VANISH_CUTSCENE_ID,
  display_name: "Moon God",
  is_blocking: true,
  actions: [
    {
      type: "show_dialogue",
      dialogue_id: MOON_GOD_DIALOGUE_ID,
      node_id: "start",
    },
    { type: "set_entity_hidden", entity_id: MOON_GOD_ENTITY_ID, hidden: true },
    // Unblocks the beer: see BASEMENT_BEER_INTERACT_TRIGGER_ID's conditions.
    {
      type: "set_switch",
      switch_id: MOON_GOD_ENCOUNTERED_SWITCH_ID,
      switch_value: true,
    },
  ],
};

export const BASEMENT_BEER_CUTSCENE: GamePackage["cutscenes"][number] = {
  id: BASEMENT_BEER_CUTSCENE_ID,
  display_name: "Beer acquired",
  is_blocking: true,
  actions: [
    {
      type: "show_dialogue",
      dialogue_id: BASEMENT_BEER_DIALOGUE_ID,
      node_id: "start",
    },
    { type: "give_item", item_id: BASEMENT_BEER_ITEM_ID, amount: 1 },
    {
      type: "set_switch",
      switch_id: BASEMENT_BEER_ACQUIRED_SWITCH_ID,
      switch_value: true,
    },
  ],
};

export const BASEMENT_BEER_LOCKED_HINT_CUTSCENE: GamePackage["cutscenes"][number] = {
  id: BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
  display_name: "Beer blocked",
  is_blocking: true,
  actions: [
    {
      type: "show_dialogue",
      dialogue_id: BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
      node_id: "start",
    },
  ],
};

export const BASEMENT_ENTRY_SILENCE_CUTSCENE: GamePackage["cutscenes"][number] = {
  id: BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
  display_name: "Basement silence",
  is_blocking: false,
  // Omitting music_id/music_url is the authored Stop Music verb.
  actions: [{ type: "play_music" }],
};

export const BASEMENT_BEER_ITEM: GamePackage["items"][number] = {
  id: BASEMENT_BEER_ITEM_ID,
  display_name: "15-Pack of Beer",
  description: "Fifteen basement-cold beers in a damp cardboard case.",
  icon: "15",
  category: "consumable",
  spatial: {
    shape: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    weight_kg: 6.5,
    bulk: 6,
    stack_limit: 1,
  },
};
