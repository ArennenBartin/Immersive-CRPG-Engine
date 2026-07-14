import {
  GamePackageSchema,
  type CellData,
  type GamePackage,
  type MapData,
} from "../../src/schema/game";
import type { MapValidationOptions } from "../../src/engine-core/mapReadinessValidator";

export const READINESS_DUNGEON_LOWER_MAP_ID = "readiness_dungeon_lower";
export const READINESS_DUNGEON_UPPER_MAP_ID = "readiness_dungeon_upper";
export const READINESS_DUNGEON_APPROACH_MAP_ID = "readiness_dungeon_approach";
export const READINESS_DUNGEON_KEY_ITEM_ID = "readiness_iron_key";
export const READINESS_DUNGEON_LOCKED_CONTAINER_ID = "readiness_lower_cache";
export const READINESS_DUNGEON_LOCKED_DOOR_ID = "readiness_lower_locked_door";
export const READINESS_DUNGEON_PUSHABLE_ID = "readiness_lower_pushable_crate";

const WIDTH = 13;
const HEIGHT = 7;

const inEntryRoom = (x: number, z: number) => x >= -5 && x <= -3 && z >= -1 && z <= 1;
const inPassage = (x: number, z: number) => x >= -2 && x <= 2 && z === 0;
const inObjectiveRoom = (x: number, z: number) => x >= 3 && x <= 5 && z >= -2 && z <= 2;
// A second post-lock route reconnects with the objective wing. This makes the
// dungeon graph cyclic without allowing the keyed door to be bypassed.
const inLoopGallery = (x: number, z: number) =>
  (x === 1 && z >= -2 && z <= -1) || (z === -2 && x >= 1 && x <= 3);

const roomIdFor = (floor: "lower" | "upper", x: number, z: number) => {
  if (inEntryRoom(x, z)) return `${floor}_entry_room`;
  if (x >= -2 && x <= -1 && z === 0) return `${floor}_west_passage`;
  if (x >= 0 && x <= 1 && z === 0) return `${floor}_door_hall`;
  if (x === 2 && z === 0) return `${floor}_east_landing`;
  if (inLoopGallery(x, z)) return `${floor}_loop_gallery`;
  if (inObjectiveRoom(x, z) && z > 0) return `${floor}_side_chamber`;
  if (inObjectiveRoom(x, z)) return `${floor}_objective_room`;
  return undefined;
};

const regionIdFor = (floor: "lower" | "upper", x: number, z: number) => {
  if (inEntryRoom(x, z)) return `${floor}_entry`;
  if (inPassage(x, z)) return `${floor}_passage`;
  if (inObjectiveRoom(x, z)) return `${floor}_objective_wing`;
  return undefined;
};

const makeCells = (floor: "lower" | "upper"): CellData[] => {
  const cells: CellData[] = [];
  for (let z = -3; z <= 3; z += 1) {
    for (let x = -6; x <= 6; x += 1) {
      const walkable =
        inEntryRoom(x, z) || inPassage(x, z) || inObjectiveRoom(x, z) || inLoopGallery(x, z);
      const stairStep = walkable && x === 4 && z === 0;
      const stairLanding = walkable && x === 5 && z === 0;
      const visualHeight = stairLanding ? 1 : stairStep ? 0.5 : 0;
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable,
        blocks_los: !walkable,
        height: stairLanding ? 2 : stairStep ? 1 : walkable ? 0 : 3,
        visual_height: walkable ? visualHeight : 3.6,
        terrain: stairLanding || stairStep ? "stone_stair" : walkable ? "stone_floor" : "stone_wall",
        object_id: walkable ? undefined : "readiness_wall",
        region_id: regionIdFor(floor, x, z),
        room_id: roomIdFor(floor, x, z),
        surface_tag:
          floor === "upper" && x === 1 && z === -1
            ? "oil"
            : floor === "upper" && x === 2 && z === -2
              ? "water"
              : "none",
      });
    }
  }
  return cells;
};

const makeLowerMap = (): MapData =>
  MapDataFromRaw({
    id: READINESS_DUNGEON_LOWER_MAP_ID,
    display_name: "Readiness Dungeon — Lower Floor",
    width: WIDTH,
    height: HEIGHT,
    spawns: [
      { id: "lower_entrance", cell: [-5, 0], facing: [1, 0] },
      { id: "lower_stair_return", cell: [5, 0], facing: [-1, 0] },
    ],
    cells: makeCells("lower"),
    props: [],
    custom_object_placements: [
      {
        id: READINESS_DUNGEON_LOCKED_DOOR_ID,
        object_id: "obj_p_door",
        cell: [0, 0],
        facing: [1, 0],
        locked: true,
        key_item_id: READINESS_DUNGEON_KEY_ITEM_ID,
        consume_key: false,
      },
      {
        id: READINESS_DUNGEON_PUSHABLE_ID,
        object_id: "readiness_crate",
        cell: [-4, -1],
        facing: [1, 0],
      },
    ],
    entity_placements: [
      { id: "readiness_lower_sentry_spawn", entity_id: "readiness_lower_sentry", cell: [3, -1], facing: [-1, 0] },
      { id: "readiness_lower_scholar_spawn", entity_id: "readiness_lower_scholar", cell: [5, -1], facing: [0, 1] },
    ],
    item_placements: [
      { id: "readiness_key_pickup", item_id: READINESS_DUNGEON_KEY_ITEM_ID, cell: [-3, 1], count: 1 },
    ],
    container_placements: [
      {
        id: READINESS_DUNGEON_LOCKED_CONTAINER_ID,
        object_id: "readiness_chest",
        cell: [4, 2],
        facing: [0, -1],
        display_name: "Ironbound Readiness Cache",
        locked: true,
        key_item_id: READINESS_DUNGEON_KEY_ITEM_ID,
        consume_key: false,
        items: [{ item_id: "readiness_reward", count: 1 }],
      },
    ],
    regions: [
      { id: "lower_entry", display_name: "Lower Entry", neutral: true, passive_checks: [] },
      { id: "lower_passage", display_name: "Lower Passage", neutral: true, passive_checks: [] },
      { id: "lower_objective_wing", display_name: "Lower Objective Wing", neutral: true, passive_checks: [] },
    ],
    triggers: [
      {
        id: "readiness_lower_objective_trigger",
        cell: [3, 1],
        type: "step",
        conditions: [],
        cutscene_id: "readiness_lower_objective_cutscene",
        once: true,
      },
      {
        id: "readiness_scholar_switch_trigger",
        type: "switch_change",
        conditions: [{ switch_id: "readiness_scholar_heard", expected_value: true }],
        cutscene_id: "readiness_scholar_switch_cutscene",
        once: true,
      },
    ],
    exits: [
      {
        id: "readiness_lower_exit_to_approach",
        cell: [-5, 1],
        target_map_id: READINESS_DUNGEON_APPROACH_MAP_ID,
        target_spawn_id: "approach_return",
        facing: [-1, 0],
      },
      {
        id: "readiness_stairs_up",
        cell: [5, 0],
        target_map_id: READINESS_DUNGEON_UPPER_MAP_ID,
        target_spawn_id: "upper_arrival",
        facing: [-1, 0],
      },
    ],
  });

const makeUpperMap = (): MapData =>
  MapDataFromRaw({
    id: READINESS_DUNGEON_UPPER_MAP_ID,
    display_name: "Readiness Dungeon — Upper Floor",
    width: WIDTH,
    height: HEIGHT,
    spawns: [
      { id: "upper_arrival", cell: [-5, 0], facing: [1, 0] },
      { id: "upper_stair_return", cell: [5, 0], facing: [-1, 0] },
    ],
    cells: makeCells("upper"),
    props: [],
    custom_object_placements: [
      { id: "readiness_upper_door", object_id: "obj_p_door", cell: [0, 0], facing: [1, 0] },
      { id: "readiness_upper_breakable_crate", object_id: "readiness_crate", cell: [-4, -1], facing: [1, 0] },
    ],
    entity_placements: [
      { id: "readiness_upper_guard_spawn", entity_id: "readiness_upper_guard", cell: [3, -1], facing: [-1, 0] },
    ],
    item_placements: [],
    container_placements: [
      {
        id: "readiness_upper_supplies",
        object_id: "readiness_chest",
        cell: [4, 2],
        facing: [0, -1],
        display_name: "Upper Supplies",
        locked: false,
        consume_key: false,
        items: [{ item_id: "readiness_tonic", count: 1 }],
      },
    ],
    regions: [
      { id: "upper_entry", display_name: "Upper Entry", neutral: true, passive_checks: [] },
      { id: "upper_passage", display_name: "Upper Passage", neutral: true, passive_checks: [] },
      { id: "upper_objective_wing", display_name: "Upper Objective Wing", neutral: true, passive_checks: [] },
    ],
    triggers: [
      {
        id: "readiness_upper_objective_trigger",
        cell: [3, 1],
        type: "step",
        conditions: [],
        cutscene_id: "readiness_upper_objective_cutscene",
        once: true,
      },
      {
        id: "readiness_upper_chemistry_trigger",
        cell: [1, -1],
        type: "interact",
        conditions: [],
        cutscene_id: "readiness_chemistry_cutscene",
        once: true,
      },
    ],
    exits: [
      {
        id: "readiness_stairs_down",
        cell: [5, 0],
        target_map_id: READINESS_DUNGEON_LOWER_MAP_ID,
        target_spawn_id: "lower_stair_return",
        facing: [-1, 0],
      },
    ],
  });

const makeApproachMap = (): MapData => {
  const cells: CellData[] = [];
  for (let z = -2; z <= 2; z += 1) {
    for (let x = -2; x <= 2; x += 1) {
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable: true,
        blocks_los: false,
        height: 0,
        visual_height: 0,
        terrain: "weathered_stone",
        room_id: "readiness_approach_courtyard",
        region_id: "approach_courtyard",
        surface_tag: "none",
      });
    }
  }
  return MapDataFromRaw({
    id: READINESS_DUNGEON_APPROACH_MAP_ID,
    display_name: "Readiness Dungeon — Approach",
    width: 5,
    height: 5,
    spawns: [
      { id: "approach_start", cell: [-1, 0], facing: [1, 0] },
      { id: "approach_return", cell: [0, 0], facing: [1, 0] },
    ],
    cells,
    props: [],
    custom_object_placements: [],
    entity_placements: [],
    item_placements: [],
    container_placements: [],
    regions: [
      { id: "approach_courtyard", display_name: "Weathered Courtyard", neutral: true, passive_checks: [] },
    ],
    triggers: [],
    exits: [
      {
        id: "readiness_approach_enter",
        cell: [1, 0],
        target_map_id: READINESS_DUNGEON_LOWER_MAP_ID,
        target_spawn_id: "lower_entrance",
        facing: [1, 0],
      },
    ],
  });
};

// Parsing the small raw object fills the same Zod defaults used by imported
// and hand-authored content. It is intentionally not a generator-only type.
const MapDataFromRaw = (raw: unknown): MapData => {
  const packageWithMap = GamePackageSchema.parse({
    schema: "crpg_engine_game_package_v1",
    metadata: {
      title: "Readiness fixture parser",
      version: "1",
      start_map_id: "fixture",
      start_spawn_id: "fixture",
    },
    maps: [raw],
  });
  return packageWithMap.maps[0];
};

/**
 * A compact, valid, ordinary two-map dungeon fixture. It uses only the active
 * package/map schema: there is no procedural subtype or special runtime path.
 */
export function createReadinessDungeonPackage(): GamePackage {
  return GamePackageSchema.parse({
    schema: "crpg_engine_game_package_v1",
    metadata: {
      title: "CRPG Dungeon Readiness Fixture",
      version: "1.0.0",
      start_map_id: READINESS_DUNGEON_APPROACH_MAP_ID,
      start_spawn_id: "approach_start",
    },
    settings: {},
    maps: [makeApproachMap(), makeLowerMap(), makeUpperMap()],
    object_library: [
      {
        id: "readiness_wall",
        display_name: "Readiness Stone Wall",
        category: "wall",
        bounds: [1, 3.6, 1],
        collision: { profile: "single", footprint: [[0, 0]] },
      },
      {
        id: "obj_p_door",
        display_name: "Readiness Door",
        category: "door",
        bounds: [1, 2.2, 0.2],
        collision: { profile: "single", footprint: [[0, 0]] },
      },
      {
        id: "readiness_chest",
        display_name: "Readiness Chest",
        category: "container",
        bounds: [1, 0.8, 1],
        collision: { profile: "single", footprint: [[0, 0]] },
      },
      {
        id: "readiness_crate",
        display_name: "Movable Ashwood Crate",
        category: "prop",
        tags: ["pushable", "breakable", "crate"],
        chem_material_id: "readiness_ashwood",
        bounds: [0.8, 0.8, 0.8],
        collision: { profile: "single", footprint: [[0, 0]] },
        simulation: {
          material_id: "readiness_ashwood",
          condition: "intact",
          integrity: 1,
          mass_kg: 24,
          bulk: 1,
          awkwardness: 0.2,
          push_difficulty: 2,
          carry_size: "armful",
          requires_cooperation: false,
          condition_tags: [],
        },
      },
    ],
    entities: [
      { id: "readiness_lower_sentry", display_name: "Lower Sentry", is_npc: false, max_hp: 10, attack: 2, defense: 1, speed: 10, xp_reward: 5 },
      {
        id: "readiness_lower_scholar",
        display_name: "Lower Scholar",
        dialogue_id: "readiness_scholar_dialogue",
        is_npc: true,
        max_hp: 8,
        attack: 1,
        defense: 1,
        speed: 8,
        emotional_axes: { valence: 42, arousal: 34, grief: 58, reverence: 63, attachment: 48 },
        attend_node: {
          id: "readiness_scholar_attend",
          target: "readiness_lower_scholar",
          composure: 3,
          glassPressure: { grief: 3, reverence: 2 },
          readings: [
            {
              id: "readiness_scholar_true_reading",
              text: "The scholar fears the lock less than what remembers opening it.",
              truth: "true",
              requiresAttention: 0,
              effect: {
                set_switch: "readiness_scholar_attended",
                set_switch_value: true,
                attention_delta: 1,
                emotional_impulse: { reverence: 2 },
              },
            },
          ],
        },
      },
      { id: "readiness_upper_guard", display_name: "Upper Guard", is_npc: false, max_hp: 12, attack: 3, defense: 2, speed: 9, xp_reward: 7 },
    ],
    dialogue: [
      {
        id: "readiness_scholar_dialogue",
        display_name: "The Scholar at the Stair",
        nodes: [
          {
            id: "readiness_scholar_intro",
            speaker: "Lower Scholar",
            text: "The iron key opens more than the door. Bring back what the upper gallery remembers.",
            options: [
              {
                text: "I will test the lock and return.",
                set_switch: "readiness_scholar_heard",
                set_switch_value: true,
                attend_kind: "true",
              },
            ],
          },
        ],
      },
    ],
    documents: [
      {
        id: "readiness_field_notes",
        display_name: "Readiness Field Notes",
        content: "Oil carries flame. Water interrupts it. A changed dungeon must remain changed after the world is closed.",
      },
    ],
    items: [
      { id: READINESS_DUNGEON_KEY_ITEM_ID, display_name: "Readiness Iron Key", category: "key" },
      { id: "readiness_reward", display_name: "Readiness Relic", category: "consumable" },
      { id: "readiness_tonic", display_name: "Readiness Tonic", category: "consumable", effects: { heal: 4 } },
    ],
    encounters: [
      {
        id: "readiness_guard_encounter",
        tags: ["dungeon", "readiness", "guard"],
        difficulty: 2,
        minArea: 6,
        maxArea: 24,
        slots: [
          { entityId: "readiness_lower_sentry", role: "frontline", minCount: 1, maxCount: 1 },
          { entityId: "readiness_upper_guard", role: "patrol", minCount: 1, maxCount: 1 },
        ],
        rewardBudget: 3,
      },
    ],
    switches: {
      readiness_scholar_heard: false,
      readiness_scholar_acknowledged: false,
      readiness_scholar_attended: false,
      readiness_lower_objective_seen: false,
      readiness_chemistry_triggered: false,
    },
    simulation_materials: [
      {
        id: "readiness_ashwood",
        label: "Dry Ashwood",
        density: 0.65,
        hardness: 0.35,
        flammability: 0.9,
        ignition_temperature: 260,
        burn_behavior: "chars",
        absorbency: 0.45,
        permeability: 0.25,
        conductivity: 0.05,
        fragility: 0.55,
        wetness_capacity: 0.7,
        scent_retention: 0.5,
        cleaning_difficulty: 1,
        decay_behavior: "organic",
        sound_response: "hollow",
        light_response: "matte",
        tags: ["wood", "flammable", "pushable"],
      },
    ],
    cutscenes: [
      {
        id: "readiness_lower_objective_cutscene",
        display_name: "Lower Objective",
        is_blocking: true,
        actions: [
          { type: "read_document", document_id: "readiness_field_notes" },
          { type: "set_switch", switch_id: "readiness_lower_objective_seen", switch_value: true },
        ],
      },
      {
        id: "readiness_upper_objective_cutscene",
        display_name: "Upper Objective",
        is_blocking: true,
        actions: [{ type: "set_switch", switch_id: "readiness_lower_objective_seen", switch_value: true }],
      },
      {
        id: "readiness_scholar_switch_cutscene",
        display_name: "The Scholar Hears the Choice",
        is_blocking: true,
        actions: [{ type: "set_switch", switch_id: "readiness_scholar_acknowledged", switch_value: true }],
      },
      {
        id: "readiness_chemistry_cutscene",
        display_name: "Oil, Water, and Flame",
        is_blocking: true,
        actions: [
          { type: "chem_spill", cell: [1, -1], liquid_id: "oil", amount: 65 },
          { type: "chem_spill", cell: [2, -2], liquid_id: "water", amount: 55 },
          { type: "chem_spill", cell: [1, -1], liquid_id: "fire", amount: 35 },
          { type: "set_switch", switch_id: "readiness_chemistry_triggered", switch_value: true },
        ],
      },
    ],
  });
}

export const readinessDungeonValidationOptions = (
  gamePackage: GamePackage,
  mapId: string,
): MapValidationOptions =>
  mapId === READINESS_DUNGEON_LOWER_MAP_ID
    ? {
        package: gamePackage,
        primarySpawnId: "lower_entrance",
        requiredCells: [{ id: "lower_objective", cell: [4, 1] }],
        requiredRegionIds: ["lower_objective_wing"],
        requiredExitIds: ["readiness_stairs_up"],
        returnRouteRequired: true,
        safeStartRadius: 1,
      }
    : mapId === READINESS_DUNGEON_UPPER_MAP_ID
      ? {
        package: gamePackage,
        primarySpawnId: "upper_arrival",
        requiredCells: [{ id: "upper_objective", cell: [4, 1] }],
        requiredRegionIds: ["upper_objective_wing"],
        requiredExitIds: ["readiness_stairs_down"],
        returnRouteRequired: true,
        safeStartRadius: 1,
      }
      : {
          package: gamePackage,
          primarySpawnId: "approach_start",
          requiredExitIds: ["readiness_approach_enter"],
          returnRouteRequired: false,
          safeStartRadius: 1,
        };

export const cloneReadinessDungeonMap = (map: MapData): MapData => structuredClone(map);
