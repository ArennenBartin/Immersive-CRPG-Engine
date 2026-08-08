// ── Backrooms Level Zero environment ────────────────────────────────────────
// A deterministic traversal map for authored third-person play. Its repeated
// rooms, three-cell doorways, loops, and alternating turns exercise corridor
// navigation, with one standard hostile proving model-backed encounters.

import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} from "../../schema/presets";
import {
  BACKROOMS_PARASITE_ENTITY,
  BACKROOMS_PARASITE_ENTITY_ID,
} from "../backroomsEntityAssets";
import {
  type CellOverrides,
  type MapData,
  type ObjectPlacementData,
  type QaWing,
  cell,
  entityPlacement,
  key,
  oneMicrotileWallOverrides,
  stampCells,
  stampRect,
} from "./shared";

export const BACKROOMS_LEVEL_ZERO_MAP_ID = "qa_backrooms_level_zero";
export const BACKROOMS_LEVEL_ZERO_SPAWN_ID = "spawn_backrooms_entry";

const MAP_MIN = -16;
const MAP_MAX = 16;

const BACKROOMS_FLOOR = {
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  terrain: "soft",
  surface_tag: "none",
  object_id: BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
} as const;

const BACKROOMS_WALL = {
  walkable: false,
  blocks_los: true,
  height: 1,
  visual_height: 1.5,
  object_id: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} as const;

// Four repeating divider lines create five rows and columns. Every connecting
// opening is three macro cells wide, so the expanded fine-grid corridors never
// rely on a single-cell squeeze.
const DIVIDERS = [-10, -3, 4, 11] as const;
const ZONES = [
  [-15, -11],
  [-9, -4],
  [-2, 3],
  [5, 10],
  [12, 15],
] as const;
const ZONE_CENTERS = [-13, -7, 0, 7, 13] as const;

const horizontalLine = (z: number, minX: number, maxX: number) =>
  Array.from(
    { length: maxX - minX + 1 },
    (_, index) => [minX + index, z] as const,
  );

const verticalLine = (x: number, minZ: number, maxZ: number) =>
  Array.from(
    { length: maxZ - minZ + 1 },
    (_, index) => [x, minZ + index] as const,
  );

// Selected interior partitions use the smallest collision/rendering unit: one
// fine (micro) tile. Divider intersections, the outer shell, and the remaining
// partitions stay a full macro tile thick, preserving strong structural beats.
const oneMicrotilePartitions = [
  { orientation: "horizontal" as const, cells: horizontalLine(-10, -2, 3) },
  { orientation: "horizontal" as const, cells: horizontalLine(-3, -9, -4) },
  { orientation: "horizontal" as const, cells: horizontalLine(4, -2, 3) },
  { orientation: "horizontal" as const, cells: horizontalLine(11, 12, 15) },
  { orientation: "vertical" as const, cells: verticalLine(-10, -12, -11) },
  { orientation: "vertical" as const, cells: verticalLine(4, 1, 3) },
  { orientation: "vertical" as const, cells: verticalLine(11, 5, 6) },
];

export const BACKROOMS_LEVEL_ZERO_MICRO_WALL_OVERRIDES =
  oneMicrotilePartitions.flatMap((partition) =>
    oneMicrotileWallOverrides(
      partition.cells,
      partition.orientation,
      BACKROOMS_WALL,
      BACKROOMS_FLOOR,
    ),
  );

const openingCenter = (zone: number, variation: number) => {
  const [zoneMin, zoneMax] = ZONES[zone];
  const firstValidCenter = zoneMin + 1;
  const validCenterCount = zoneMax - zoneMin - 1;
  return firstValidCenter + (variation % validCenterCount);
};

const carveThreeCellOpening = (
  overrides: CellOverrides,
  fixed: number,
  center: number,
  vertical: boolean,
) => {
  const cells: [number, number][] = [-1, 0, 1].map((offset) =>
    vertical
      ? [fixed, center + offset]
      : [center + offset, fixed],
  );
  stampCells(overrides, cells, BACKROOMS_FLOOR);
};

const backroomsCells = (() => {
  const overrides: CellOverrides = {};

  // Begin with a repeated room grid. Later openings turn it into one connected
  // labyrinth instead of a collection of sealed chambers.
  for (const x of DIVIDERS) {
    stampRect(overrides, x, MAP_MIN + 1, x, MAP_MAX - 1, BACKROOMS_WALL);
  }
  for (const z of DIVIDERS) {
    stampRect(overrides, MAP_MIN + 1, z, MAP_MAX - 1, z, BACKROOMS_WALL);
  }

  // Every row connects left-to-right. Door placement moves within each bay,
  // producing repeated lateral turns while guaranteeing complete reachability.
  for (let row = 0; row < ZONES.length; row += 1) {
    DIVIDERS.forEach((dividerX, dividerIndex) => {
      carveThreeCellOpening(
        overrides,
        dividerX,
        openingCenter(row, row + dividerIndex),
        true,
      );
    });
  }

  // Alternating end connections make a long serpentine route. The additional
  // interior connections create misleading loops and multiple valid returns.
  const verticalConnections = [
    { dividerZ: DIVIDERS[0], columns: [1, 4] },
    { dividerZ: DIVIDERS[1], columns: [0, 3] },
    { dividerZ: DIVIDERS[2], columns: [1, 4] },
    { dividerZ: DIVIDERS[3], columns: [0, 3] },
  ] as const;
  verticalConnections.forEach((connection, dividerIndex) => {
    for (const column of connection.columns) {
      carveThreeCellOpening(
        overrides,
        connection.dividerZ,
        openingCenter(column, dividerIndex + column + 1),
        false,
      );
    }
  });

  // Two missing divider sections break the rhythm into recognizably larger
  // open rooms without removing the surrounding corridor loops.
  stampRect(
    overrides,
    DIVIDERS[2],
    ZONES[2][0],
    DIVIDERS[2],
    ZONES[2][1],
    BACKROOMS_FLOOR,
  );
  stampRect(
    overrides,
    DIVIDERS[0],
    ZONES[4][0],
    DIVIDERS[0],
    ZONES[4][1],
    BACKROOMS_FLOOR,
  );

  const cells: MapData["cells"] = [];
  for (let z = MAP_MIN; z <= MAP_MAX; z += 1) {
    for (let x = MAP_MIN; x <= MAP_MAX; x += 1) {
      const edge =
        x === MAP_MIN || x === MAP_MAX || z === MAP_MIN || z === MAP_MAX;
      cells.push(
        cell(x, z, {
          ...BACKROOMS_FLOOR,
          ...(edge ? BACKROOMS_WALL : {}),
          ...(overrides[key(x, z)] || {}),
        }),
      );
    }
  }
  return cells;
})();

// Explicit anchors keep the fluorescent grid deterministic as topology and
// generic QA lighting heuristics evolve. Fixtures are environmental only:
// they have no collision, trigger, item, or simulation identity.
const ceilingLights: ObjectPlacementData[] = ZONE_CENTERS.flatMap(
  (z, row) =>
    ZONE_CENTERS.map((x, column) => ({
      id: `qa_backrooms_light_${row}_${column}`,
      object_id: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
      cell: [x, z] as [number, number],
      facing: [(row + column) % 2 === 0 ? 1 : 0, (row + column) % 2 === 0 ? 0 : 1] as [
        number,
        number,
      ],
      collision_mode: "none" as const,
    })),
);

const backroomsMap: MapData = {
  id: BACKROOMS_LEVEL_ZERO_MAP_ID,
  display_name: "Backrooms — Level Zero",
  width: MAP_MAX - MAP_MIN + 1,
  height: MAP_MAX - MAP_MIN + 1,
  ambient_light: 0.05,
  combat_mode: "horror_realtime",
  spawns: [
    {
      id: BACKROOMS_LEVEL_ZERO_SPAWN_ID,
      cell: [0, 14],
      facing: [1, 0],
    },
  ],
  cells: backroomsCells,
  fine_cell_overrides: BACKROOMS_LEVEL_ZERO_MICRO_WALL_OVERRIDES,
  props: [],
  custom_object_placements: ceilingLights,
  entity_placements: [
    entityPlacement(BACKROOMS_PARASITE_ENTITY_ID, [7, 13], [-1, 0]),
  ],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [],
  // Level Zero has no diegetic route into the developer-only QA suite.
  exits: [],
};

export const backroomsWing: QaWing = {
  maps: [backroomsMap],
  entities: [BACKROOMS_PARASITE_ENTITY],
};
