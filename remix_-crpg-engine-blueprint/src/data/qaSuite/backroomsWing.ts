// ── Backrooms Level Zero environment ────────────────────────────────────────
// A deterministic traversal map for authored third-person play. Its repeated
// rooms, three-cell doorways, loops, and alternating turns exercise corridor
// navigation. The Phase 2 anomaly arrival bay deliberately has no hostile or
// event cue, so its transform, clipping, and clear-lane checks stay inspectable.

import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} from "../../schema/presets";
import {
  BACKROOMS_PARASITE_ENTITY,
} from "../backroomsEntityAssets";
import {
  BACKROOMS_ANOMALY_OBJECTS,
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
  buildRecursiveChainPlacements,
  buildWallClippedPlacement,
} from "../backroomsAnomalyAssets";
import {
  type CellOverrides,
  type MapData,
  type ObjectPlacementData,
  type QaWing,
  cell,
  key,
  oneMicrotileWallOverrides,
  stampCells,
  stampRect,
} from "./shared";

export const BACKROOMS_LEVEL_ZERO_MAP_ID = "qa_backrooms_level_zero";
export const BACKROOMS_LEVEL_ZERO_SPAWN_ID = "spawn_backrooms_entry";
export const BACKROOMS_LEVEL_ZERO_CLIPPED_CABINET_PLACEMENT_ID =
  "qa_backrooms_clipped_cabinet";
export const BACKROOMS_LEVEL_ZERO_CABINET_PENETRATION_RATIO = 0.55;

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

// The clipped cabinet sits near the edge of the ordinary five-cell light
// lattice. A dedicated, non-blocking fixture makes its wall intersection a QA
// surface instead of a black silhouette; it carries no event or gameplay cue.
const PHASE2_CABINET_QA_LIGHT: ObjectPlacementData = {
  id: "qa_backrooms_clipped_cabinet_light",
  object_id: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  cell: [3, 14],
  facing: [0, 1],
  collision_mode: "none",
};

// ── Anomalies in the arrival bay ────────────────────────────────────────────
// Both sit in the spawn bay (x -2..3, z 12..15) so the transform contract can
// be seen immediately rather than hunted for.
//
// The chain runs the full width of the bay along its north row. Six desks,
// each 84% the size of the last, yawed 7° farther, tilted 4° farther, and sunk
// another 2.8cm into the carpet, imply a corridor collapsing into itself. Only
// the first desk collides.
const RECURSIVE_DESK_CHAIN: ObjectPlacementData[] = buildRecursiveChainPlacements({
  idPrefix: "qa_backrooms_desk_chain",
  objectId: BACKROOMS_DESK_OBJECT_ID,
  originCell: [-2, 12],
  step: [1, 0],
  facing: [0, 1],
  count: 6,
  scaleFalloff: 0.84,
  rotationStepDegrees: 7,
  tiltStepDegrees: 4,
  sinkStep: 0.028,
});

// [4, 15] is solid divider wall — the three-cell opening in that divider sits
// at z 12..14 — so the cabinet has real geometry to sink into rather than a
// surface to z-fight against. It stands in walkable [3, 15] and never collides.
const WALL_CLIPPED_CABINET: ObjectPlacementData = buildWallClippedPlacement({
  id: BACKROOMS_LEVEL_ZERO_CLIPPED_CABINET_PLACEMENT_ID,
  objectId: BACKROOMS_FILING_CABINET_OBJECT_ID,
  cell: [3, 15],
  towardWall: [1, 0],
  // 55% of a cell makes the impossibility unmistakable while leaving the
  // drawers and enough cabinet body visible to read at third-person distance.
  penetrationRatio: BACKROOMS_LEVEL_ZERO_CABINET_PENETRATION_RATIO,
});

// Export the complete authored Phase 2 placement slice so persisted bundled
// QA maps can receive the kit without replacing any unrelated map edits.
export const BACKROOMS_LEVEL_ZERO_PHASE2_PLACEMENTS: ObjectPlacementData[] = [
  PHASE2_CABINET_QA_LIGHT,
  ...RECURSIVE_DESK_CHAIN,
  WALL_CLIPPED_CABINET,
];

export const BACKROOMS_LEVEL_ZERO_MAP: MapData = {
  id: BACKROOMS_LEVEL_ZERO_MAP_ID,
  display_name: "Backrooms — Level Zero",
  width: MAP_MAX - MAP_MIN + 1,
  height: MAP_MAX - MAP_MIN + 1,
  ambient_light: 0.05,
  combat_mode: "horror_realtime",
  spawns: [
    {
      id: BACKROOMS_LEVEL_ZERO_SPAWN_ID,
      cell: [0, 13],
      facing: [1, 0],
    },
  ],
  cells: backroomsCells,
  fine_cell_overrides: BACKROOMS_LEVEL_ZERO_MICRO_WALL_OVERRIDES,
  props: [],
  custom_object_placements: [
    ...ceilingLights,
    ...BACKROOMS_LEVEL_ZERO_PHASE2_PLACEMENTS,
  ],
  entity_placements: [],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [],
  // Level Zero has no diegetic route into the developer-only QA suite.
  exits: [],
};

export const backroomsWing: QaWing = {
  maps: [BACKROOMS_LEVEL_ZERO_MAP],
  entities: [BACKROOMS_PARASITE_ENTITY],
  objects: BACKROOMS_ANOMALY_OBJECTS,
};
