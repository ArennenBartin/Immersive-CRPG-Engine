import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
} from "../schema/presets";
import { DungeonRoomTemplateSchema } from "../dungeonGen/schema";
import type { DungeonRoomTemplateDef } from "../dungeonGen/types";

export const BACKROOMS_LEVEL0_TEMPLATE_IDS = {
  entryLobby: "backrooms_level0_entry_lobby_v1",
  openOffice: "backrooms_level0_open_office_v1",
  longCorridor: "backrooms_level0_long_corridor_v1",
  pillarField: "backrooms_level0_pillar_field_v1",
  serviceNook: "backrooms_level0_service_nook_v1",
  landmark: "backrooms_level0_landmark_v1",
  storyReserved: "backrooms_level0_story_reserved_v1",
} as const;

export const BACKROOMS_LEVEL0_ROOM_TAGS = {
  openOffice: "backrooms_open_office",
  longCorridor: "backrooms_long_corridor",
  pillarField: "backrooms_pillar_field",
  serviceNook: "backrooms_service_nook",
  deadEnd: "backrooms_dead_end",
  landmark: "backrooms_landmark",
  storyReserved: "backrooms_story_reserved",
  encounterReserved: "backrooms_encounter_reserved",
} as const;

const OPENING_WIDTH = 3;
const WALL_HEIGHT = 1;
const WALL_VISUAL_HEIGHT = 1.5;

interface RoomShellOptions {
  width: number;
  depth: number;
  interiorTag: string;
  pillars?: ReadonlyArray<readonly [number, number]>;
}

const roomShellCells = ({
  width,
  depth,
  interiorTag,
  pillars = [],
}: RoomShellOptions): DungeonRoomTemplateDef["cells"] => {
  const centerX = Math.floor(width / 2);
  const centerZ = Math.floor(depth / 2);
  const halfOpening = Math.floor(OPENING_WIDTH / 2);
  const pillarKeys = new Set(pillars.map(([x, z]) => `${x}:${z}`));
  const cells: DungeonRoomTemplateDef["cells"] = [];

  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const boundary = x === 0 || x === width - 1 || z === 0 || z === depth - 1;
      const opening =
        (z === 0 && Math.abs(x - centerX) <= halfOpening) ||
        (z === depth - 1 && Math.abs(x - centerX) <= halfOpening) ||
        (x === 0 && Math.abs(z - centerZ) <= halfOpening) ||
        (x === width - 1 && Math.abs(z - centerZ) <= halfOpening);
      const walkable = opening || (!boundary && !pillarKeys.has(`${x}:${z}`));
      cells.push({
        cell: [x, z],
        walkable,
        height: walkable ? 0 : WALL_HEIGHT,
        visualHeight: walkable ? 0 : WALL_VISUAL_HEIGHT,
        terrain: walkable ? "soft" : "stone_wall",
        objectId: walkable
          ? BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID
          : BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
        tag: opening ? "connection" : walkable ? interiorTag : "boundary",
        surfaceTag: "none",
      });
    }
  }
  return cells;
};

const shellSockets = (
  width: number,
  depth: number,
): DungeonRoomTemplateDef["connectionSockets"] => {
  const centerX = Math.floor(width / 2);
  const centerZ = Math.floor(depth / 2);
  const socket = (
    id: string,
    cell: [number, number],
    facing: [number, number],
  ): DungeonRoomTemplateDef["connectionSockets"][number] => ({
    id,
    cell,
    facing,
    width: OPENING_WIDTH,
    elevation: 0,
    connectionTypes: ["open"],
    requiredClearance: 1,
    tags: ["backrooms_open"],
    allowDoor: false,
    required: false,
  });
  return [
    socket("north", [centerX, 0], [0, -1]),
    socket("east", [width - 1, centerZ], [1, 0]),
    socket("south", [centerX, depth - 1], [0, 1]),
    socket("west", [0, centerZ], [-1, 0]),
  ];
};

const template = (
  id: string,
  name: string,
  width: number,
  depth: number,
  tag: string,
  pillars: ReadonlyArray<readonly [number, number]> = [],
): DungeonRoomTemplateDef => DungeonRoomTemplateSchema.parse({
  id,
  name,
  description: `${name}; an ordinary rotatable Level 0 room template with broad open connections.`,
  // Phase 5 reuses the established dungeon template contract. Room tags are
  // carried as archetype IDs and theme tags instead of introducing a second
  // Backrooms-only template format.
  archetypeIds: [tag],
  themeTags: ["backrooms", "level_zero", tag],
  bounds: { width, depth },
  rotationModes: [0, 90, 180, 270],
  cells: roomShellCells({ width, depth, interiorTag: tag, pillars }),
  connectionSockets: shellSockets(width, depth),
  populationSockets: [],
  reservedPaths: [],
  requiredObjectRefs: [
    BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
    BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  ],
  requiredMaterialRefs: [],
});

export const BACKROOMS_LEVEL0_ROOM_TEMPLATES: readonly DungeonRoomTemplateDef[] = [
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.entryLobby,
    "Level 0 Entry Lobby",
    9,
    9,
    "backrooms_entry",
  ),
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.openOffice,
    "Level 0 Open Office",
    11,
    11,
    BACKROOMS_LEVEL0_ROOM_TAGS.openOffice,
    [[3, 3], [3, 7], [7, 3], [7, 7]],
  ),
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.longCorridor,
    "Level 0 Long Corridor",
    7,
    13,
    BACKROOMS_LEVEL0_ROOM_TAGS.longCorridor,
  ),
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.pillarField,
    "Level 0 Pillar Field",
    13,
    11,
    BACKROOMS_LEVEL0_ROOM_TAGS.pillarField,
    [[3, 3], [3, 7], [6, 3], [6, 7], [9, 3], [9, 7]],
  ),
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.serviceNook,
    "Level 0 Service Nook",
    7,
    7,
    BACKROOMS_LEVEL0_ROOM_TAGS.serviceNook,
  ),
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.landmark,
    "Level 0 Landmark Room",
    11,
    9,
    BACKROOMS_LEVEL0_ROOM_TAGS.landmark,
    [[5, 4]],
  ),
  template(
    BACKROOMS_LEVEL0_TEMPLATE_IDS.storyReserved,
    "Level 0 Story-Reserved Room",
    13,
    13,
    BACKROOMS_LEVEL0_ROOM_TAGS.storyReserved,
  ),
];

export const backroomsLevel0TemplateById = new Map(
  BACKROOMS_LEVEL0_ROOM_TEMPLATES.map((entry) => [entry.id, entry]),
);
