import type { CellData, MapData, ObjectPlacementData } from "../schema/game";

type SurfaceTag = CellData["surface_tag"];

const SYSTEM_TEST_WIDTH = 21;
const SYSTEM_TEST_HEIGHT = 21;
const SYSTEM_TEST_MIN = -10;
const SYSTEM_TEST_MAX = 10;

const key = (x: number, z: number) => `${x}:${z}`;

const walls = new Set<string>([
  // Outer readability frame, with open approach gaps.
  ...Array.from({ length: SYSTEM_TEST_WIDTH }, (_, index) => key(SYSTEM_TEST_MIN + index, SYSTEM_TEST_MIN)),
  ...Array.from({ length: SYSTEM_TEST_WIDTH }, (_, index) => key(SYSTEM_TEST_MIN + index, SYSTEM_TEST_MAX)),
  ...Array.from({ length: SYSTEM_TEST_HEIGHT }, (_, index) => key(SYSTEM_TEST_MIN, SYSTEM_TEST_MIN + index)),
  ...Array.from({ length: SYSTEM_TEST_HEIGHT }, (_, index) => key(SYSTEM_TEST_MAX, SYSTEM_TEST_MIN + index)),
  // Interior collision and LOS test walls.
  key(-5, 2),
  key(-5, 1),
  key(-5, 0),
  key(-5, -1),
  key(-5, -2),
  key(-4, -2),
  key(-3, -2),
  key(-2, -2),
  key(2, 2),
  key(3, 2),
  key(4, 2),
  key(5, 2),
  key(2, 1),
  key(2, 0),
  key(2, -1),
]);

const roadCells = new Set<string>([
  ...Array.from({ length: 17 }, (_, index) => key(-8 + index, 6)),
  ...Array.from({ length: 15 }, (_, index) => key(0, -8 + index)),
  ...Array.from({ length: 9 }, (_, index) => key(-8 + index, 0)),
  ...Array.from({ length: 9 }, (_, index) => key(index, 0)),
]);

const surfaceCells = new Map<string, SurfaceTag>([
  [key(-8, -6), "water"],
  [key(-7, -6), "oil"],
  [key(-6, -6), "blood"],
  [key(-5, -6), "poison"],
  [key(-4, -6), "firehazard"],
  [key(-3, -6), "ice"],
]);

const highGround = new Set<string>([
  key(5, -6),
  key(6, -6),
  key(5, -5),
  key(6, -5),
  key(7, -5),
]);

const waterBand = new Set<string>([
  key(-9, -6),
  key(-8, -7),
  key(-8, -6),
  key(-8, -5),
  key(-7, -7),
]);

const hazardBand = new Set<string>([
  key(-7, -6),
  key(-6, -6),
  key(-5, -6),
  key(-4, -6),
  key(-3, -6),
]);

// Elemental interaction lab: walkable oil and water puddles in the open part of
// the interaction wing, so the command-wheel elemental verbs (burn/douse/
// freeze/wet/electrify/foam) have real surfaces to react with. Fire spreads
// across the oil patch and into the adjacent crate; water can be frozen to ice
// or electrified to conduct.
const oilPuddle = new Set<string>([
  key(-8, -1),
  key(-7, -1),
  key(-8, -2),
  key(-7, -2),
]);

const waterPuddle = new Set<string>([
  key(-8, 1),
  key(-7, 1),
  key(-8, 2),
]);

const stealthLightCells = new Set<string>([
  key(0, 6),
  key(0, 7),
]);

const cell = (x: number, z: number): CellData => {
  const blocked = walls.has(key(x, z));
  const water = waterBand.has(key(x, z));
  const oily = oilPuddle.has(key(x, z));
  const wet = waterPuddle.has(key(x, z));
  const lit = stealthLightCells.has(key(x, z));
  const road = roadCells.has(key(x, z));
  const elevated = highGround.has(key(x, z));
  const hazard = hazardBand.has(key(x, z));
  const surface =
    surfaceCells.get(key(x, z)) || (oily ? "oil" : wet ? "water" : water ? "water" : "none");
  const terrain = water
    ? "water"
    : oily
      ? "oil_slick"
      : wet
        ? "shallow_water"
        : elevated
          ? "hills"
          : hazard
            ? "hazard_lab"
            : road
              ? "road"
              : "plains";

  return {
    x,
    y: 0,
    z,
    active: true,
    walkable: !blocked && !water,
    blocks_los: blocked,
    height: elevated ? 1 : 0,
    visual_height: blocked ? 1.5 : elevated ? 0.35 : hazard ? 0.08 : 0.03,
    terrain,
    object_id: blocked
      ? "obj_wall_block"
      : road
        ? "obj_world_road"
        : water
          ? "obj_world_water"
          : elevated
            ? "obj_world_hills"
            : "obj_world_plains",
    region_id: z >= 4 ? "hub" : z <= -4 ? "systems_lab" : x < 0 ? "interaction_wing" : "combat_wing",
    room_id:
      z >= 4
        ? "start_hub"
        : z <= -4
          ? "surface_and_height_lab"
          : x < 0
            ? "interaction_lab"
            : "combat_lab",
    tag: lit
      ? "stealth_light"
      : blocked
        ? "los_blocker"
        : hazard
          ? "surface_test"
          : elevated
            ? "height_test"
            : road
              ? "main_route"
              : "test_floor",
    hazard: hazard ? surface : undefined,
    infection: key(x, z) === key(-5, -5) ? "demo_spores" : undefined,
    portal_id: key(x, z) === key(8, 6) ? "portal_demo_ground" : undefined,
    surface_tag: surface,
  };
};

const cells = (): CellData[] => {
  const result: CellData[] = [];
  for (let z = SYSTEM_TEST_MIN; z <= SYSTEM_TEST_MAX; z += 1) {
    for (let x = SYSTEM_TEST_MIN; x <= SYSTEM_TEST_MAX; x += 1) {
      result.push(cell(x, z));
    }
  }
  return result;
};

const placements: ObjectPlacementData[] = [
  { object_id: "obj_world_city", cell: [0, 6], facing: [0, -1] },
  { object_id: "obj_terminal", cell: [0, 4], facing: [0, -1], dialogue_id: "dia_demo_terminal" },
  { object_id: "obj_training_beacon", cell: [-2, 5], facing: [0, -1] },
  { object_id: "obj_p_door", cell: [-5, 3], facing: [0, -1], dialogue_id: "dia_demo_door" },
  { object_id: "obj_crate", cell: [-7, 2], facing: [1, 0] },
  { object_id: "obj_crate", cell: [4, 1], facing: [0, 1] },
  // Flammable crate beside the oil puddle — burn the oil and watch it catch.
  { object_id: "obj_crate", cell: [-6, -1], facing: [1, 0] },
  { object_id: "obj_training_beacon", cell: [6, -6], facing: [0, 1] },
  { object_id: "obj_world_town", cell: [-7, 6], facing: [0, 1] },
  { object_id: "obj_world_estate", cell: [-4, 6], facing: [0, 1] },
  { object_id: "obj_world_fracture", cell: [-5, -6], facing: [0, 1] },
  { object_id: "obj_world_spire", cell: [5, -6], facing: [0, 1] },
];

export const createOverworldMap = (): MapData => ({
  id: "map_overworld",
  display_name: "Engine Systems Test Map",
  width: SYSTEM_TEST_WIDTH,
  height: SYSTEM_TEST_HEIGHT,
  spawns: [
    { id: "spawn_world_start", cell: [0, 6], facing: [0, -1] },
    { id: "spawn_dialogue_shop", cell: [-7, 6], facing: [1, 0] },
    { id: "spawn_interactions", cell: [-6, 2], facing: [1, 0] },
    { id: "spawn_surfaces", cell: [-7, -5], facing: [1, 0] },
    { id: "spawn_combat", cell: [5, -5], facing: [0, 1] },
    { id: "spawn_exit_return", cell: [8, 6], facing: [-1, 0] },
  ],
  cells: cells(),
  props: [],
  custom_object_placements: placements,
  entity_placements: [
    { entity_id: "ent_guide", cell: [-8, 6], schedule: [{ hour: 9, cell: [-8, 6] }, { hour: 18, cell: [-6, 6] }] },
    { entity_id: "ent_companion", cell: [-6, 5] },
    { entity_id: "ent_bark_scout", cell: [2, 6] },
    { entity_id: "ent_bark_scribe", cell: [3, 6] },
    { entity_id: "ent_stealth_watcher", cell: [0, 8] },
    { entity_id: "ent_training_bot", cell: [5, -4], facing: [0, -1] },
  ],
  item_placements: [
    { id: "world_drop_training_token", item_id: "itm_training_token", cell: [-3, 5], count: 1 },
    { id: "world_drop_practice_key", item_id: "itm_practice_key", cell: [-6, 3], count: 1 },
    { id: "world_drop_health_tonic", item_id: "itm_health_tonic", cell: [3, -5], count: 1 },
  ],
  container_placements: [
    {
      id: "world_locked_chest",
      object_id: "obj_chest",
      cell: [-4, 3],
      facing: [0, -1],
      display_name: "World Systems Chest",
      locked: true,
      key_item_id: "itm_practice_key",
      consume_key: false,
      items: [
        { item_id: "itm_health_tonic", count: 2 },
        { item_id: "itm_training_token", count: 1 },
      ],
    },
    {
      id: "world_open_cache",
      object_id: "obj_chest",
      cell: [1, 5],
      facing: [0, -1],
      display_name: "Unlocked Transfer Cache",
      locked: false,
      consume_key: false,
      items: [{ item_id: "itm_health_tonic", count: 1 }],
    },
  ],
  triggers: [
    { id: "trg_world_intro", type: "on_load", conditions: [], cutscene_id: "cut_demo_intro", once: true },
    { id: "trg_world_terminal", cell: [0, 4], type: "interact", conditions: [], cutscene_id: "cut_read_demo_note", once: false },
    { id: "trg_world_surface_strip", cell: [-6, -5], type: "step", conditions: [], cutscene_id: "cut_world_surface_probe", once: true },
    {
      id: "trg_world_switch_probe",
      type: "switch_change",
      conditions: [{ switch_id: "demo_note_read", expected_value: true }],
      cutscene_id: "cut_world_switch_probe",
      once: true,
    },
  ],
  exits: [
    {
      id: "exit_to_demo_ground",
      cell: [8, 6],
      target_map_id: "map_demo_ground",
      target_spawn_id: "spawn_start",
      facing: [-1, 0],
    },
    {
      id: "exit_training_lane",
      cell: [7, -5],
      target_map_id: "map_demo_ground",
      target_spawn_id: "spawn_training",
      facing: [-1, 0],
      condition: { switch: "demo_tour_started" },
    },
  ],
  regions: [
    {
      id: "hub",
      display_name: "Lit Hub",
      neutral: true,
      survival_delta: { fatigue: 0.25 },
      passive_checks: [],
      alderamontico_grid: {
        enabled: true,
        magnitude: 1.25,
        lens_entity_id: "ent_stealth_watcher",
        lens_radius: 3,
        lens_multiplier: 2,
      },
      emotional_profile: {
        baseline_axis_offsets: { reverence: 8 },
      },
    },
    {
      id: "interaction_wing",
      display_name: "Interaction Wing",
      neutral: true,
      survival_delta: { hunger: 0.5, thirst: 0.5 },
      passive_checks: [],
      alderamontico_grid: {
        enabled: true,
        magnitude: 1.5,
      },
      emotional_profile: {
        baseline_axis_offsets: { attachment: 8 },
      },
    },
    {
      id: "combat_wing",
      display_name: "Combat Wing",
      faction_id: "f_guild",
      reputation_threshold: 0,
      neutral: false,
      survival_delta: { fatigue: 0.5, exposure: 0.25 },
      passive_checks: [],
      alderamontico_grid: {
        enabled: true,
        magnitude: 2,
        lens_entity_id: "ent_training_bot",
        lens_radius: 4,
        lens_multiplier: 1.75,
      },
      emotional_profile: {
        baseline_axis_offsets: { arousal: 6, attachment: -5 },
      },
    },
    {
      id: "systems_lab",
      display_name: "Systems Lab",
      neutral: true,
      irreversible_denial_flag: "systems_lab_requires_tour",
      survival_delta: { hunger: 1, thirst: 1, fatigue: 1, exposure: 1 },
      alderamontico_grid: {
        enabled: true,
        magnitude: 2.5,
        lens_entity_id: "ent_training_bot",
        lens_radius: 5,
        lens_multiplier: 2,
      },
      emotional_profile: {
        baseline_axis_offsets: { grief: 10, reverence: 6 },
      },
      passive_checks: [
        {
          id: "systems_lab_orientation",
          stat: "flag",
          flag_id: "demo_tour_started",
          difficulty: 7,
          denial: true,
        },
      ],
    },
  ],
});
