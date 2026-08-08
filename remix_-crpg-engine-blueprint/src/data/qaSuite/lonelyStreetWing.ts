// ── The Lonely Street exterior ───────────────────────────────────────────────
// A deliberately simple outdoor destination: one long road, one continuous
// sidewalk, dense tree walls, and a single house waiting at the far end.

import {
  LONELY_STREET_ASPHALT_OBJECT_ID,
  LONELY_STREET_GRASS_OBJECT_ID,
  LONELY_STREET_FRONT_DOOR_OBJECT_ID,
  LONELY_STREET_HOUSE_OBJECT_ID,
  LONELY_STREET_ROAD_MARKER_OBJECT_ID,
  LONELY_STREET_SIDEWALK_OBJECT_ID,
  LONELY_STREET_TREE_OBJECT_ID,
} from "../../schema/presets";
import {
  type MapData,
  type ObjectPlacementData,
  type QaWing,
  cell,
  entityPlacement,
  exit,
} from "./shared";
import {
  RILEY_ARRIVAL_DIALOGUE,
  RILEY_ENTITY,
  RILEY_ENTITY_ID,
  RILEY_MODEL_OBJECT_ID,
  RILEY_SOFA_PLACEMENT_ID,
  RILEY_SOFA_ANCHOR_REVISION,
  RILEY_SOFA_OBJECT_PLACEMENT_ID,
  RILEY_SOFA_SEATED_CELL,
  RILEY_SOFA_SEATED_LOCAL_POSITION,
  RILEY_SOFA_SEATED_LOCAL_FACING,
} from "../rileyAssets";
import {
  HOUSE_ARRIVAL_CUTSCENE,
  HOUSE_ARRIVAL_CUTSCENE_ID,
  HOUSE_ARRIVAL_DIALOGUES,
  HOUSE_ARRIVAL_TRIGGER_ID,
} from "../lonelyStreetHouseArrivalScene";
import {
  LONELY_STREET_HOUSE_INTERIOR_OBJECT_IDS,
  LONELY_STREET_INTERIOR_BOOKCASE_OBJECT_ID,
  LONELY_STREET_INTERIOR_CABINETS_OBJECT_ID,
  LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
  LONELY_STREET_INTERIOR_CLUTTER_OBJECT_ID,
  LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID,
  LONELY_STREET_INTERIOR_DOORWAY_FACING,
  LONELY_STREET_INTERIOR_DOOR_FRAME_OBJECT_ID,
  LONELY_STREET_INTERIOR_DOOR_OBJECT_ID,
  LONELY_STREET_INTERIOR_DRESSER_OBJECT_ID,
  LONELY_STREET_INTERIOR_FLOOR_OBJECT_ID,
  LONELY_STREET_INTERIOR_FRIDGE_OBJECT_ID,
  LONELY_STREET_INTERIOR_RUG_OBJECT_ID,
  LONELY_STREET_INTERIOR_SHELL_OBJECT_ID,
  LONELY_STREET_INTERIOR_SIDE_TABLE_OBJECT_ID,
  LONELY_STREET_INTERIOR_SOFA_OBJECT_ID,
  LONELY_STREET_INTERIOR_STOVE_OBJECT_ID,
  LONELY_STREET_INTERIOR_TABLE_LAMP_OBJECT_ID,
  LONELY_STREET_INTERIOR_TASK_LIGHT_OBJECT_ID,
  LONELY_STREET_INTERIOR_WINDOW_FACING,
  LONELY_STREET_INTERIOR_WINDOW_OBJECT_ID,
} from "../lonelyStreetHouseInteriorAssets";
import {
  LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
  LONELY_STREET_BASEMENT_BOX_STACK_OBJECT_ID,
  LONELY_STREET_BASEMENT_DETERGENTS_OBJECT_ID,
  LONELY_STREET_BASEMENT_DRUM_KIT_OBJECT_ID,
  LONELY_STREET_BASEMENT_DRUM_STOOL_OBJECT_ID,
  LONELY_STREET_BASEMENT_DRYER_OBJECT_ID,
  LONELY_STREET_BASEMENT_FLOOR_DEBRIS_OBJECT_ID,
  LONELY_STREET_BASEMENT_FLOOR_OBJECT_ID,
  LONELY_STREET_BASEMENT_FRIDGE_OBJECT_ID,
  LONELY_STREET_BASEMENT_LAUNDRY_BASKET_OBJECT_ID,
  LONELY_STREET_BASEMENT_OBJECT_IDS,
  LONELY_STREET_BASEMENT_PAINT_CANS_OBJECT_ID,
  LONELY_STREET_BASEMENT_PIPES_OBJECT_ID,
  LONELY_STREET_BASEMENT_POSTER_OBJECT_ID,
  LONELY_STREET_BASEMENT_SHELL_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
  LONELY_STREET_BASEMENT_STORAGE_SHELF_OBJECT_ID,
  LONELY_STREET_BASEMENT_WASHER_OBJECT_ID,
} from "../lonelyStreetBasementAssets";
import {
  BASEMENT_BEER_ACQUIRED_SWITCH_ID,
  BASEMENT_BEER_CUTSCENE,
  BASEMENT_BEER_CUTSCENE_ID,
  BASEMENT_BEER_DIALOGUE,
  BASEMENT_BEER_INTERACT_TRIGGER_ID,
  BASEMENT_BEER_ITEM,
  BASEMENT_BEER_LOCKED_HINT_CUTSCENE,
  BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
  BASEMENT_BEER_LOCKED_HINT_DIALOGUE,
  BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
  BASEMENT_ENTRY_SILENCE_CUTSCENE,
  BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
  BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
  MOON_GOD_DIALOGUE,
  MOON_GOD_ENCOUNTERED_SWITCH_ID,
  MOON_GOD_ENTITY,
  MOON_GOD_ENTITY_ID,
  MOON_GOD_FRIDGE_ANCHOR_PLACEMENT_ID,
  MOON_GOD_INTERACT_TRIGGER_ID,
  MOON_GOD_MODEL_OBJECT_ID,
  MOON_GOD_PLACEMENT_ID,
  MOON_GOD_STATIC_ANCHOR_REVISION,
  MOON_GOD_VANISH_CUTSCENE,
  MOON_GOD_VANISH_CUTSCENE_ID,
} from "../moonGodAssets";

export const LONELY_STREET_MAP_ID = "qa_lonely_street";
export const LONELY_STREET_SPAWN_ID = "spawn_lonely_street_entry";
export const LONELY_STREET_RETURN_SPAWN_ID = "spawn_lonely_street_house_return";
export const LONELY_STREET_HOUSE_INTERIOR_MAP_ID =
  "qa_lonely_street_house_interior";
export const LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID =
  "spawn_lonely_street_house_entry";
export const LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID =
  "spawn_lonely_street_house_from_basement";
export const LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID =
  "lonely_street_house_basement_door";
export const LONELY_STREET_BASEMENT_MAP_ID =
  "qa_lonely_street_house_basement";
export const LONELY_STREET_BASEMENT_SPAWN_ID =
  "spawn_lonely_street_basement_entry";
export const LONELY_STREET_BASEMENT_EXIT_CELL = [4, 3] as const;
export const LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL = [2, -2] as const;
export const LONELY_STREET_BASEMENT_TRANSITION_ID =
  "transition_lonely_street_basement_stairs";
export const LONELY_STREET_BASEMENT_MOON_GOD_CELL = [1, -2] as const;
export const LONELY_STREET_BASEMENT_FRIDGE_CELL = [1, -3] as const;

export const LONELY_STREET_OBJECT_IDS = [
  LONELY_STREET_ASPHALT_OBJECT_ID,
  LONELY_STREET_SIDEWALK_OBJECT_ID,
  LONELY_STREET_GRASS_OBJECT_ID,
  LONELY_STREET_TREE_OBJECT_ID,
  LONELY_STREET_ROAD_MARKER_OBJECT_ID,
  LONELY_STREET_HOUSE_OBJECT_ID,
  LONELY_STREET_FRONT_DOOR_OBJECT_ID,
  RILEY_MODEL_OBJECT_ID,
  MOON_GOD_MODEL_OBJECT_ID,
  ...LONELY_STREET_HOUSE_INTERIOR_OBJECT_IDS,
  ...LONELY_STREET_BASEMENT_OBJECT_IDS,
] as const;

const MIN_X = -8;
const MAX_X = 8;
// Preserve the original near end and extend the road away from spawn. This
// makes the authored street exactly twice as long without moving its entrance.
const MIN_Z = -82;
const MAX_Z = 27;
const ROAD_MIN_X = -3;
const ROAD_MAX_X = 2;
const ROAD_END_Z = -78;
const SIDEWALK_MIN_X = 3;
const SIDEWALK_MAX_X = 4;
const SIDEWALK_END_Z = -78;
export const LONELY_STREET_HOUSE_CELL = [7, -75] as const;
export const LONELY_STREET_PORCH_CELL = [5, -75] as const;
export const LONELY_STREET_DOORWAY_CELL = [6, -75] as const;
export const LONELY_STREET_INTERIOR_CELL = [7, -75] as const;
const HOUSE_CELL = LONELY_STREET_HOUSE_CELL;
const HOUSE_ENTRY_Z = HOUSE_CELL[1];

// The front porch and the first two cells inside the doorway are standing
// surfaces, not walls. Their authored heights match the actual porch slab and
// foundation tops, allowing the shared half-cell step solver to lift/lower
// Steve naturally while the rest of the house remains solid.
const isHouseEntryLane = (x: number, z: number) =>
  z === HOUSE_ENTRY_Z && x >= 6 && x <= 7;

const isPorchSurface = (x: number, z: number) =>
  x === LONELY_STREET_PORCH_CELL[0] && Math.abs(z - HOUSE_ENTRY_Z) <= 1;

const standingSurfaceVisualHeight = (x: number, z: number) => {
  if (isPorchSurface(x, z)) return 0.76; // 0.38 world cells: porch slab top.
  if (z !== HOUSE_ENTRY_Z) return 0;
  if (x === 6 || x === 7) return 0.52; // 0.26: interior foundation top.
  return 0;
};

const isHouseFootprint = (x: number, z: number) =>
  x >= 6 && x <= 8 && z >= -77 && z <= -73 && !isHouseEntryLane(x, z);

const isHouseClearing = (x: number, z: number) =>
  x >= 5 && x <= 8 && z >= -78 && z <= -72;

const isRoad = (x: number, z: number) =>
  x >= ROAD_MIN_X && x <= ROAD_MAX_X && z >= ROAD_END_Z && z <= MAX_Z;

const isSidewalk = (x: number, z: number) =>
  (x >= SIDEWALK_MIN_X &&
    x <= SIDEWALK_MAX_X &&
    z >= SIDEWALK_END_Z &&
    z <= MAX_Z) ||
  (z === HOUSE_ENTRY_Z && x >= SIDEWALK_MIN_X && x <= 5) ||
  isPorchSurface(x, z);

const TREE_FACINGS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

const isTreeCell = (x: number, z: number) => {
  if (isHouseClearing(x, z)) return false;

  const sideForest = x <= -6 || x >= 6;
  const irregularInnerTree =
    (x === -5 || x === 5) &&
    z < MAX_Z - 2 &&
    z > MIN_Z + 1 &&
    Math.abs(z + x * 2) % 9 === 0;
  const farForest = z <= MIN_Z + 1 || (z === MIN_Z + 2 && Math.abs(x) >= 4);
  return sideForest || irregularInnerTree || farForest;
};

// The inner tree rows remain continuous so the street always reads as a dense,
// impassable forest. Models in the two outer blocked rows are hidden behind
// that wall and only add GPU work, so omit them entirely. Keep the far end fully
// planted to close the horizon and retain a sparse irregular inner silhouette.
const shouldPlaceTreeModel = (x: number, z: number) => {
  if (!isTreeCell(x, z)) return false;
  if (z <= MIN_Z + 2) return true;
  return Math.abs(x) <= 6;
};

const streetCells: MapData["cells"] = [];
const treePlacements: ObjectPlacementData[] = [];

for (let z = MIN_Z; z <= MAX_Z; z += 1) {
  for (let x = MIN_X; x <= MAX_X; x += 1) {
    const tree = isTreeCell(x, z);
    const house = isHouseFootprint(x, z);
    const sidewalk = isSidewalk(x, z);
    const road = isRoad(x, z) && !sidewalk;

    streetCells.push(
      cell(x, z, {
        walkable: !tree && !house,
        blocks_los: tree || house,
        visual_height: standingSurfaceVisualHeight(x, z),
        terrain: road ? "road" : sidewalk ? "stone" : "grass",
        object_id: road
          ? LONELY_STREET_ASPHALT_OBJECT_ID
          : sidewalk
            ? LONELY_STREET_SIDEWALK_OBJECT_ID
            : LONELY_STREET_GRASS_OBJECT_ID,
      }),
    );

    if (shouldPlaceTreeModel(x, z)) {
      const facingIndex = (((x * 17 + z * 11) % 4) + 4) % 4;
      treePlacements.push({
        id: `lonely_street_tree_${x}_${z}`,
        object_id: LONELY_STREET_TREE_OBJECT_ID,
        cell: [x, z],
        facing: [...TREE_FACINGS[facingIndex]],
        collision_mode: "inherit",
      });
    }
  }
}

const roadMarkers: ObjectPlacementData[] = [];
for (let z = ROAD_END_Z + 3; z <= 25; z += 5) {
  roadMarkers.push({
    id: `lonely_street_center_mark_${z}`,
    object_id: LONELY_STREET_ROAD_MARKER_OBJECT_ID,
    cell: [0, z],
    facing: [0, 1],
    collision_mode: "none",
  });
}

// Keep one hidden authored approach cell outside the hinged front door. Door
// validation and interaction both require legal clearance on each face, while
// the visible room shell itself still begins at X=-4.
const INTERIOR_MIN_X = -5;
const INTERIOR_MAX_X = 4;
const INTERIOR_MIN_Z = -3;
const INTERIOR_MAX_Z = 3;
const INTERIOR_DOOR_CELL = [-4, 1] as const;
const interiorCells: MapData["cells"] = [];

for (let z = INTERIOR_MIN_Z; z <= INTERIOR_MAX_Z; z += 1) {
  for (let x = INTERIOR_MIN_X; x <= INTERIOR_MAX_X; x += 1) {
    const shellBoundary =
      x === -4 ||
      x === INTERIOR_MAX_X ||
      z === INTERIOR_MIN_Z ||
      z === INTERIOR_MAX_Z;
    const doorway = x === INTERIOR_DOOR_CELL[0] && z === INTERIOR_DOOR_CELL[1];
    const exteriorDoorApproach =
      x === INTERIOR_MIN_X && z === INTERIOR_DOOR_CELL[1];
    const walkable =
      (!shellBoundary && x > INTERIOR_MIN_X) || doorway || exteriorDoorApproach;
    interiorCells.push(
      cell(x, z, {
        active: walkable,
        walkable,
        blocks_los: !walkable,
        height: 0,
        visual_height: 0,
        terrain: "wood",
        object_id: LONELY_STREET_INTERIOR_FLOOR_OBJECT_ID,
      }),
    );
  }
}

const BASEMENT_MIN_X = -5;
const BASEMENT_MAX_X = 5;
const BASEMENT_MIN_Z = -4;
const BASEMENT_MAX_Z = 4;
const basementCells: MapData["cells"] = [];

for (let z = BASEMENT_MIN_Z; z <= BASEMENT_MAX_Z; z += 1) {
  for (let x = BASEMENT_MIN_X; x <= BASEMENT_MAX_X; x += 1) {
    const shellBoundary =
      x === BASEMENT_MIN_X ||
      x === BASEMENT_MAX_X ||
      z === BASEMENT_MIN_Z ||
      z === BASEMENT_MAX_Z;
    basementCells.push(
      cell(x, z, {
        active: !shellBoundary,
        walkable: !shellBoundary,
        blocks_los: shellBoundary,
        height: 0,
        visual_height: 0,
        terrain: "stone",
        object_id: LONELY_STREET_BASEMENT_FLOOR_OBJECT_ID,
      }),
    );
  }
}

export const LONELY_STREET_MAP: MapData = {
  id: LONELY_STREET_MAP_ID,
  display_name: "The Lonely Street",
  width: MAX_X - MIN_X + 1,
  // Map bounds are centered on zero. The authored street intentionally runs
  // much farther north than south, so declare the symmetric extent required
  // to contain its most distant cell instead of only counting authored rows.
  height: Math.max(Math.abs(MIN_Z), Math.abs(MAX_Z)) * 2 + 1,
  environment: "exterior",
  ambient_light: 0.28,
  // Breezy Street is story-space. Combat begins only after Steve reaches the
  // Backrooms; explicit pulse mode prevents a package-level realtime default
  // from accidentally exposing Attack/Evade here.
  combat_mode: "pulse",
  spawns: [
    {
      id: LONELY_STREET_SPAWN_ID,
      cell: [3, 24],
      facing: [0, -1],
    },
    {
      id: LONELY_STREET_RETURN_SPAWN_ID,
      cell: [LONELY_STREET_PORCH_CELL[0], LONELY_STREET_PORCH_CELL[1]],
      facing: [-1, 0],
    },
  ],
  cells: streetCells,
  props: [],
  custom_object_placements: [
    ...treePlacements,
    ...roadMarkers,
    {
      id: "lonely_street_last_house",
      object_id: LONELY_STREET_HOUSE_OBJECT_ID,
      cell: [HOUSE_CELL[0], HOUSE_CELL[1]],
      facing: [-1, 0],
      collision_mode: "inherit",
      // The placement cell is the raised interior foundation. Neutralize that
      // cell's 0.26-world-unit standing height so the house itself remains
      // grounded and its porch slab top matches the authored walking surface.
      height_offset: -0.26,
    },
    {
      id: "lonely_street_front_door",
      object_id: LONELY_STREET_FRONT_DOOR_OBJECT_ID,
      cell: [LONELY_STREET_DOORWAY_CELL[0], LONELY_STREET_DOORWAY_CELL[1]],
      facing: [-1, 0],
      collision_mode: "inherit",
      // Bring the door bottom from the foundation surface up to the frame's
      // lower edge. Horizontal alignment is authored inside the door model so
      // its collision remains centered on the doorway cell.
      height_offset: 0.03,
    },
  ],
  entity_placements: [],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [],
  // The street is part of the authored horror route, not a QA lobby. Its only
  // transition is the closed house door into the separately authored house.
  exits: [
    exit(
      [LONELY_STREET_DOORWAY_CELL[0], LONELY_STREET_DOORWAY_CELL[1]],
      LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
      LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
    ),
  ],
};

export const LONELY_STREET_HOUSE_INTERIOR_MAP: MapData = {
  id: LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  display_name: "Lonely Street House",
  width: INTERIOR_MAX_X - INTERIOR_MIN_X + 1,
  height: INTERIOR_MAX_Z - INTERIOR_MIN_Z + 1,
  environment: "interior",
  // Keep the house oppressive and warm without making navigation depend on
  // standing directly beneath one of its practical bulbs.
  ambient_light: 0.24,
  combat_mode: "pulse",
  spawns: [
    {
      id: LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
      // Arrive one full tile clear of both the closed entrance and Riley's
      // sofa-side interaction footprint. The previous [-3, 1] arrival put the
      // door directly ahead and Riley directly behind Steve; backing up opened
      // dialogue and correctly blocked input, which looked like a frozen game.
      cell: [-3, 2],
      facing: [1, 0],
    },
    {
      id: LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      cell: [2, -1],
      facing: [0, 1],
    },
  ],
  cells: interiorCells,
  props: [],
  custom_object_placements: [
    {
      id: "lonely_street_interior_shell",
      object_id: LONELY_STREET_INTERIOR_SHELL_OBJECT_ID,
      cell: [0, 0],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_door_frame",
      object_id: LONELY_STREET_INTERIOR_DOOR_FRAME_OBJECT_ID,
      cell: [INTERIOR_DOOR_CELL[0], INTERIOR_DOOR_CELL[1]],
      // These three wall props carry a mesh offset computed against this exact
      // facing (see meshCenteringOffset), so the facing lives with the asset.
      facing: [...LONELY_STREET_INTERIOR_DOORWAY_FACING],
      collision_mode: "none",
    },
    {
      id: "lonely_street_interior_front_door",
      object_id: LONELY_STREET_INTERIOR_DOOR_OBJECT_ID,
      cell: [INTERIOR_DOOR_CELL[0], INTERIOR_DOOR_CELL[1]],
      facing: [...LONELY_STREET_INTERIOR_DOORWAY_FACING],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_window",
      object_id: LONELY_STREET_INTERIOR_WINDOW_OBJECT_ID,
      cell: [-4, -1],
      facing: [...LONELY_STREET_INTERIOR_WINDOW_FACING],
      collision_mode: "none",
    },
    {
      id: "lonely_street_interior_sofa",
      object_id: LONELY_STREET_INTERIOR_SOFA_OBJECT_ID,
      cell: [-2, 0],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_rug",
      object_id: LONELY_STREET_INTERIOR_RUG_OBJECT_ID,
      cell: [0, 0],
      facing: [0, 1],
      collision_mode: "none",
    },
    {
      id: "lonely_street_interior_coffee_table",
      object_id: LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID,
      // The room-wide clutter asset was composed around this table anchor.
      // Keep them together; fitted furniture collision provides the aisle.
      cell: [0, 1],
      // One runtime fine cell toward the sofa lines the tabletop back up with
      // the bottles, plate, and paper baked into the room clutter asset.
      fine_offset: [0, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_side_table",
      object_id: LONELY_STREET_INTERIOR_SIDE_TABLE_OBJECT_ID,
      cell: [-3, -1],
      facing: [0, 1],
      // Keep the table beside the sofa without collapsing the Blender scene's
      // depth separation and pushing the lamp through the couch cushions.
      collision_mode: "none",
    },
    {
      id: "lonely_street_interior_fridge",
      object_id: LONELY_STREET_INTERIOR_FRIDGE_OBJECT_ID,
      cell: [-2, -2],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_stove",
      object_id: LONELY_STREET_INTERIOR_STOVE_OBJECT_ID,
      cell: [-1, -2],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_cabinets",
      object_id: LONELY_STREET_INTERIOR_CABINETS_OBJECT_ID,
      cell: [0, -2],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_bookcase",
      object_id: LONELY_STREET_INTERIOR_BOOKCASE_OBJECT_ID,
      cell: [3, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_dresser",
      object_id: LONELY_STREET_INTERIOR_DRESSER_OBJECT_ID,
      cell: [3, -2],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_interior_clutter",
      object_id: LONELY_STREET_INTERIOR_CLUTTER_OBJECT_ID,
      cell: [0, 0],
      facing: [0, 1],
      collision_mode: "none",
    },
    {
      id: "lonely_street_interior_table_lamp",
      object_id: LONELY_STREET_INTERIOR_TABLE_LAMP_OBJECT_ID,
      cell: [-3, -1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 0.56,
    },
    {
      id: "lonely_street_interior_ceiling_bulb",
      object_id: LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
      cell: [0, 0],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 2.85,
    },
    {
      id: "lonely_street_interior_task_light",
      object_id: LONELY_STREET_INTERIOR_TASK_LIGHT_OBJECT_ID,
      cell: [-1, -2],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 1.4,
    },
    {
      // Reuse the modular stair-door asset at the top landing so the story
      // objective has a readable destination instead of an invisible exit tile.
      id: LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      object_id: LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
      cell: [
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[0],
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[1],
      ],
      fine_offset: [0, -1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 0.02,
    },
  ],
  entity_placements: [
    entityPlacement(RILEY_ENTITY_ID, RILEY_SOFA_SEATED_CELL, [0, 1], {
      id: RILEY_SOFA_PLACEMENT_ID,
      presentation_anchor: {
        object_placement_id: RILEY_SOFA_OBJECT_PLACEMENT_ID,
        local_position: RILEY_SOFA_SEATED_LOCAL_POSITION,
        local_facing: RILEY_SOFA_SEATED_LOCAL_FACING,
        lock_to_anchor: true,
        revision: RILEY_SOFA_ANCHOR_REVISION,
      },
      collision_mode: "none",
    }),
  ],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [
    {
      id: HOUSE_ARRIVAL_TRIGGER_ID,
      type: "on_load",
      cutscene_id: HOUSE_ARRIVAL_CUTSCENE_ID,
      once: true,
      conditions: [],
    },
  ],
  exits: [
    exit(
      [INTERIOR_DOOR_CELL[0], INTERIOR_DOOR_CELL[1]],
      LONELY_STREET_MAP_ID,
      LONELY_STREET_RETURN_SPAWN_ID,
    ),
    {
      id: "exit_lonely_street_house_to_basement",
      cell: [
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[0],
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[1],
      ],
      target_map_id: LONELY_STREET_BASEMENT_MAP_ID,
      target_spawn_id: LONELY_STREET_BASEMENT_SPAWN_ID,
      transition_id: LONELY_STREET_BASEMENT_TRANSITION_ID,
      paired_exit_id: "exit_lonely_street_basement_to_house",
      transition_kind: "stairs",
    },
  ],
};

export const LONELY_STREET_BASEMENT_MAP: MapData = {
  id: LONELY_STREET_BASEMENT_MAP_ID,
  display_name: "Riley's Basement",
  width: BASEMENT_MAX_X - BASEMENT_MIN_X + 1,
  height: BASEMENT_MAX_Z - BASEMENT_MIN_Z + 1,
  environment: "interior",
  // This room carries its own Blender-matched practicals; generic QA
  // fluorescent bars would destroy the warm, low-key reference lighting.
  auto_ceiling_lights: false,
  // The reference is low-key, but the floor, instruments, and stair silhouette
  // must remain readable between the two practical-light pools in gameplay.
  ambient_light: 0.36,
  presentation_ambient_light: 0.5,
  combat_mode: "pulse",
  spawns: [
    {
      id: LONELY_STREET_BASEMENT_SPAWN_ID,
      // Clear the fitted stair/rail volume so entering the basement never
      // materializes Steve inside the right-hand stringer. Face into the stair
      // run so the chase camera remains in the open room instead of spawning
      // inside the railing behind him.
      // Arrive beside the foot of the stairs with a full open-room runway in
      // front of Steve. The previous [2,3] pose sat in the staircase collider's
      // rounded corner clearance and continuous movement could feel pinned.
      cell: [1, 2],
      facing: [1, 0],
    },
  ],
  cells: basementCells,
  props: [],
  custom_object_placements: [
    {
      id: "lonely_basement_shell",
      object_id: LONELY_STREET_BASEMENT_SHELL_OBJECT_ID,
      cell: [0, 0],
      facing: [0, 1],
      collision_mode: "inherit",
      height_offset: -0.14,
    },
    {
      id: "lonely_basement_staircase",
      object_id: LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID,
      cell: [4, 0],
      fine_offset: [-1, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_basement_stair_door",
      object_id: LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
      cell: [4, -4],
      fine_offset: [-1, 1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 2.51,
    },
    {
      id: "lonely_basement_drum_kit",
      object_id: LONELY_STREET_BASEMENT_DRUM_KIT_OBJECT_ID,
      cell: [-3, 1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_basement_drum_stool",
      object_id: LONELY_STREET_BASEMENT_DRUM_STOOL_OBJECT_ID,
      cell: [-1, 2],
      fine_offset: [-1, -1],
      facing: [0, 1],
      collision_mode: "inherit",
      height_offset: 0.06,
    },
    {
      id: "lonely_basement_washer",
      object_id: LONELY_STREET_BASEMENT_WASHER_OBJECT_ID,
      cell: [-2, -3],
      fine_offset: [1, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_basement_dryer",
      object_id: LONELY_STREET_BASEMENT_DRYER_OBJECT_ID,
      cell: [-1, -3],
      fine_offset: [1, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_basement_fridge",
      object_id: LONELY_STREET_BASEMENT_FRIDGE_OBJECT_ID,
      cell: [1, -3],
      fine_offset: [0, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_basement_storage_shelf",
      object_id: LONELY_STREET_BASEMENT_STORAGE_SHELF_OBJECT_ID,
      cell: [-4, -3],
      fine_offset: [0, -1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
    {
      id: "lonely_basement_laundry_basket",
      object_id: LONELY_STREET_BASEMENT_LAUNDRY_BASKET_OBJECT_ID,
      cell: [-1, -3],
      fine_offset: [-1, 0],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 0.98,
    },
    {
      id: "lonely_basement_detergents",
      object_id: LONELY_STREET_BASEMENT_DETERGENTS_OBJECT_ID,
      cell: [-1, -3],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 1.02,
    },
    {
      id: "lonely_basement_box_stack",
      object_id: LONELY_STREET_BASEMENT_BOX_STACK_OBJECT_ID,
      cell: [1, -3],
      fine_offset: [1, -1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 2,
    },
    {
      id: "lonely_basement_paint_cans",
      object_id: LONELY_STREET_BASEMENT_PAINT_CANS_OBJECT_ID,
      cell: [4, 2],
      facing: [0, 1],
      collision_mode: "none",
    },
    {
      id: "lonely_basement_pipes",
      object_id: LONELY_STREET_BASEMENT_PIPES_OBJECT_ID,
      cell: [-4, -1],
      fine_offset: [-1, -1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 0.1,
    },
    {
      id: "lonely_basement_bad_luck_poster",
      object_id: LONELY_STREET_BASEMENT_POSTER_OBJECT_ID,
      cell: [-5, -1],
      fine_offset: [0, 1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 0.35,
    },
    {
      id: "lonely_basement_floor_debris",
      object_id: LONELY_STREET_BASEMENT_FLOOR_DEBRIS_OBJECT_ID,
      cell: [0, 1],
      fine_offset: [1, 0],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 0.007,
    },
    {
      id: "lonely_basement_bare_bulb",
      object_id: LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
      cell: [-1, 0],
      fine_offset: [-1, -1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 1.98,
    },
    {
      id: "lonely_basement_stair_sconce",
      object_id: LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
      cell: [4, -4],
      fine_offset: [-1, 1],
      facing: [0, 1],
      collision_mode: "none",
      height_offset: 4.15,
    },
  ],
  entity_placements: [
    entityPlacement(
      MOON_GOD_ENTITY_ID,
      [
        LONELY_STREET_BASEMENT_MOON_GOD_CELL[0],
        LONELY_STREET_BASEMENT_MOON_GOD_CELL[1],
      ],
      [-1, 0],
      {
        id: MOON_GOD_PLACEMENT_ID,
        // Solid: Steve must go around, not through — and must therefore
        // interact with it (see MOON_GOD_INTERACT_TRIGGER_ID) rather than
        // simply walk past it to the fridge. Hiding it on vanish (see
        // MOON_GOD_VANISH_CUTSCENE) also clears this collision automatically,
        // since a hidden entity is skipped by movement blocking.
        collision_mode: "solid",
        // A locked refrigerator-relative anchor freezes the apparition's
        // rendered pose even if generic NPC bookkeeping publishes a transient
        // runtime cell. Its all-day one-point schedule also prevents ordinary
        // exploration AI from choosing an idle wander action.
        presentation_anchor: {
          object_placement_id: MOON_GOD_FRIDGE_ANCHOR_PLACEMENT_ID,
          local_position: [0, 0, 4 / 3],
          // The fridge's own placement faces [0, 1] (rotationY = 0), so this
          // local vector IS the world vector: [0, 1] points from the fridge
          // (against the near/south wall) straight at the far/north wall —
          // directly away from the fridge, not sideways toward the stairs.
          local_facing: [0, 1],
          lock_to_anchor: true,
          revision: MOON_GOD_STATIC_ANCHOR_REVISION,
        },
        schedule: [
          {
            hour: 0,
            cell: [
              LONELY_STREET_BASEMENT_MOON_GOD_CELL[0],
              LONELY_STREET_BASEMENT_MOON_GOD_CELL[1],
            ],
          },
        ],
      },
    ),
  ],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [
    {
      id: BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
      type: "on_load",
      conditions: [],
      cutscene_id: BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
      once: false,
    },
    {
      id: MOON_GOD_INTERACT_TRIGGER_ID,
      cell: [
        LONELY_STREET_BASEMENT_MOON_GOD_CELL[0],
        LONELY_STREET_BASEMENT_MOON_GOD_CELL[1],
      ],
      type: "interact",
      conditions: [],
      cutscene_id: MOON_GOD_VANISH_CUTSCENE_ID,
      once: true,
    },
    {
      // Same fridge cell as the real beer trigger below, gated on the
      // opposite value of MOON_GOD_ENCOUNTERED_SWITCH_ID. Interact-trigger
      // lookup takes the first eligible match in array order (PlayMode's
      // interact dispatch), so exactly one of this pair ever fires for a
      // given press — never both, and never neither once the beer itself
      // hasn't been collected yet.
      id: BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
      cell: [
        LONELY_STREET_BASEMENT_FRIDGE_CELL[0],
        LONELY_STREET_BASEMENT_FRIDGE_CELL[1],
      ],
      type: "interact",
      conditions: [
        {
          switch_id: BASEMENT_BEER_ACQUIRED_SWITCH_ID,
          expected_value: false,
        },
        {
          switch_id: MOON_GOD_ENCOUNTERED_SWITCH_ID,
          expected_value: false,
        },
      ],
      cutscene_id: BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
      once: false,
    },
    {
      id: BASEMENT_BEER_INTERACT_TRIGGER_ID,
      cell: [
        LONELY_STREET_BASEMENT_FRIDGE_CELL[0],
        LONELY_STREET_BASEMENT_FRIDGE_CELL[1],
      ],
      type: "interact",
      conditions: [
        {
          switch_id: BASEMENT_BEER_ACQUIRED_SWITCH_ID,
          expected_value: false,
        },
        {
          switch_id: MOON_GOD_ENCOUNTERED_SWITCH_ID,
          expected_value: true,
        },
      ],
      cutscene_id: BASEMENT_BEER_CUTSCENE_ID,
      once: true,
    },
  ],
  exits: [
    {
      id: "exit_lonely_street_basement_to_house",
      cell: [
        LONELY_STREET_BASEMENT_EXIT_CELL[0],
        LONELY_STREET_BASEMENT_EXIT_CELL[1],
      ],
      target_map_id: LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
      target_spawn_id: LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      transition_id: LONELY_STREET_BASEMENT_TRANSITION_ID,
      paired_exit_id: "exit_lonely_street_house_to_basement",
      transition_kind: "stairs",
      condition: {
        switch: BASEMENT_BEER_ACQUIRED_SWITCH_ID,
        switch_value: true,
      },
    },
  ],
};

export const lonelyStreetWing: QaWing = {
  maps: [
    LONELY_STREET_MAP,
    LONELY_STREET_HOUSE_INTERIOR_MAP,
    LONELY_STREET_BASEMENT_MAP,
  ],
  entities: [RILEY_ENTITY, MOON_GOD_ENTITY],
  dialogue: [
    RILEY_ARRIVAL_DIALOGUE,
    MOON_GOD_DIALOGUE,
    BASEMENT_BEER_DIALOGUE,
    BASEMENT_BEER_LOCKED_HINT_DIALOGUE,
    ...HOUSE_ARRIVAL_DIALOGUES,
  ],
  cutscenes: [
    HOUSE_ARRIVAL_CUTSCENE,
    BASEMENT_ENTRY_SILENCE_CUTSCENE,
    MOON_GOD_VANISH_CUTSCENE,
    BASEMENT_BEER_CUTSCENE,
    BASEMENT_BEER_LOCKED_HINT_CUTSCENE,
  ],
  items: [BASEMENT_BEER_ITEM],
  switches: {
    [BASEMENT_BEER_ACQUIRED_SWITCH_ID]: false,
    [MOON_GOD_ENCOUNTERED_SWITCH_ID]: false,
  },
};
