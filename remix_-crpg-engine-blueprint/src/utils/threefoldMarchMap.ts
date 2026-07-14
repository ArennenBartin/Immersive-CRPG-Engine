import type { CellData, MapData, ObjectPlacementData } from "../schema/game";

type Vec2 = [number, number];
type CardinalSide = "north" | "south" | "east" | "west";
type ConnectionSide = CardinalSide | "center";
type TerrainObjectId =
  | "obj_world_plains"
  | "obj_world_marsh"
  | "obj_world_water"
  | "obj_world_coast"
  | "obj_world_forest"
  | "obj_world_hills"
  | "obj_world_scar"
  | "obj_world_road"
  | "obj_floor_stone"
  | "obj_floor_dirt";

export type MarchAreaRole = "seat_approach" | "wild" | "crossing" | "basin" | "fracture_mouth";

export type MarchAreaDefinition = {
  id: string;
  displayName: string;
  role: MarchAreaRole;
  size: [number, number];
  terrainMood: string;
  holds: string[];
  connections: string[];
};

type AreaSpec = MarchAreaDefinition & {
  seed: number;
  baseTerrain: TerrainObjectId;
  alternateTerrain: TerrainObjectId;
};

type MarchConnection = {
  from: string;
  fromSide: ConnectionSide;
  to: string;
  toSide: ConnectionSide;
};

type DirectedConnection = {
  targetId: string;
  side: ConnectionSide;
  targetSide: ConnectionSide;
};

export const THREEFOLD_MARCH_GREYBOX_VERSION = "v2_cohesive_terrain";

const key = (x: number, z: number) => `${x}:${z}`;
const cloneCell = ([x, z]: Vec2): Vec2 => [x, z];

const areaSlug = (mapId: string) => mapId.replace(/^map_march_/, "");
const titleId = (id: string) => id.replace(/_/g, " ");

export const THREEFOLD_MARCH_CONNECTIONS: MarchConnection[] = [
  { from: "map_march_watchfold", fromSide: "east", to: "map_march_reedmire", toSide: "west" },
  { from: "map_march_reedmire", fromSide: "east", to: "map_march_hallowdown", toSide: "west" },
  { from: "map_march_hallowdown", fromSide: "east", to: "map_march_marrowhouse", toSide: "west" },
  { from: "map_march_reedmire", fromSide: "north", to: "map_march_gallowsreach", toSide: "south" },
  { from: "map_march_reedmire", fromSide: "south", to: "map_march_thornmarch", toSide: "west" },
  { from: "map_march_hallowdown", fromSide: "south", to: "map_march_thornmarch", toSide: "east" },
  { from: "map_march_thornmarch", fromSide: "south", to: "map_march_convening", toSide: "north" },
  { from: "map_march_convening", fromSide: "south", to: "map_march_combe", toSide: "north" },
  { from: "map_march_convening", fromSide: "center", to: "map_march_under_convening", toSide: "north" },
];

export const THREEFOLD_MARCH_AREA_DEFINITIONS: MarchAreaDefinition[] = [
  {
    id: "map_march_watchfold",
    displayName: "The Watchfold",
    role: "seat_approach",
    size: [48, 48],
    terrainMood: "Grave-roads, cairns, fen-reed, standing water; still and dusk-lit.",
    holds: ["Watchfold hamlet footprint", "Wenna/Ode/Maren anchors", "fen fracture-mouth placeholder"],
    connections: ["map_march_reedmire"],
  },
  {
    id: "map_march_reedmire",
    displayName: "The Reedmire",
    role: "wild",
    size: [96, 96],
    terrainMood: "Flooded fen, reed-islands, fog, and hidden fords.",
    holds: ["water soft-gate placeholders", "reeds/fire/water set-piece anchor", "fracture-mouth"],
    connections: ["map_march_watchfold", "map_march_hallowdown", "map_march_gallowsreach", "map_march_thornmarch"],
  },
  {
    id: "map_march_combe",
    displayName: "The Combe",
    role: "seat_approach",
    size: [48, 48],
    terrainMood: "Tilled fields in a green hollow, cobbles, and churchyard grief.",
    holds: ["Combe parish footprint", "Cael/Linnet/Doran anchors", "churchyard fracture-mouth"],
    connections: ["map_march_convening"],
  },
  {
    id: "map_march_hallowdown",
    displayName: "Hallowdown",
    role: "wild",
    size: [120, 120],
    terrainMood: "Open downs, forest stands, cliffs, old field-walls, and long exploratory distance.",
    holds: ["forest-fire anchor", "height/climb shortcut anchor", "fracture-mouth"],
    connections: ["map_march_reedmire", "map_march_marrowhouse", "map_march_thornmarch"],
  },
  {
    id: "map_march_marrowhouse",
    displayName: "The Marrowhouse",
    role: "seat_approach",
    size: [48, 48],
    terrainMood: "Dark gardens, flagstone, estate under old trees; cold and courteous.",
    holds: ["Marrowhouse estate footprint", "Ister/Orla/Reni anchors", "witness-Glass placeholder"],
    connections: ["map_march_hallowdown"],
  },
  {
    id: "map_march_thornmarch",
    displayName: "The Thornmarch",
    role: "crossing",
    size: [48, 64],
    terrainMood: "A chokepoint of thornwall, ruin, and old road between seats and center.",
    holds: ["thornwall burn soft-gate", "cover/height combat anchor", "basin approach"],
    connections: ["map_march_reedmire", "map_march_hallowdown", "map_march_convening"],
  },
  {
    id: "map_march_gallowsreach",
    displayName: "Gallowsreach",
    role: "wild",
    size: [96, 96],
    terrainMood: "High scree, wind, exposed rock, few trees; harsh northern transit country.",
    holds: ["gap/climb soft-gate", "shortcut discovery anchor", "fracture-mouth"],
    connections: ["map_march_reedmire"],
  },
  {
    id: "map_march_convening",
    displayName: "The Convening",
    role: "basin",
    size: [64, 64],
    terrainMood: "A low bowl, the Stone at center, faint dark-light bleeding from below.",
    holds: ["the Stone", "the girl lens anchor", "mandatory descent"],
    connections: ["map_march_thornmarch", "map_march_combe", "map_march_under_convening"],
  },
  {
    id: "map_march_under_convening",
    displayName: "The Under-Convening",
    role: "fracture_mouth",
    size: [32, 48],
    terrainMood: "The descent beneath the basin: tight scarred passages and bright dark-light.",
    holds: ["Glass key placeholder", "fracture descent template anchor"],
    connections: ["map_march_convening"],
  },
];

const AREA_SPECS: AreaSpec[] = THREEFOLD_MARCH_AREA_DEFINITIONS.map((area, index) => {
  const terrainByArea: Record<string, Pick<AreaSpec, "baseTerrain" | "alternateTerrain">> = {
    map_march_watchfold: { baseTerrain: "obj_world_marsh", alternateTerrain: "obj_world_coast" },
    map_march_reedmire: { baseTerrain: "obj_world_marsh", alternateTerrain: "obj_world_water" },
    map_march_combe: { baseTerrain: "obj_world_plains", alternateTerrain: "obj_floor_dirt" },
    map_march_hallowdown: { baseTerrain: "obj_world_plains", alternateTerrain: "obj_world_forest" },
    map_march_marrowhouse: { baseTerrain: "obj_world_plains", alternateTerrain: "obj_world_forest" },
    map_march_thornmarch: { baseTerrain: "obj_world_coast", alternateTerrain: "obj_world_scar" },
    map_march_gallowsreach: { baseTerrain: "obj_world_hills", alternateTerrain: "obj_world_scar" },
    map_march_convening: { baseTerrain: "obj_world_plains", alternateTerrain: "obj_world_scar" },
    map_march_under_convening: { baseTerrain: "obj_world_scar", alternateTerrain: "obj_world_hills" },
  };
  return {
    ...area,
    ...terrainByArea[area.id],
    seed: 1701 + index * 97,
  };
});

const specById = new Map(AREA_SPECS.map((area) => [area.id, area]));

const getBounds = (width: number, height: number) => {
  const minX = -Math.floor(width / 2);
  const minZ = -Math.floor(height / 2);
  return {
    minX,
    maxX: minX + width - 1,
    minZ,
    maxZ: minZ + height - 1,
  };
};

const outwardFacing = (side: ConnectionSide): Vec2 => {
  switch (side) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    case "west":
      return [-1, 0];
    case "center":
      return [0, 1];
  }
};

const inwardFacing = (side: ConnectionSide): Vec2 => {
  const [x, z] = outwardFacing(side);
  return [-x, -z];
};

const sideExitCell = (spec: AreaSpec, side: ConnectionSide): Vec2 => {
  const { minX, maxX, minZ, maxZ } = getBounds(spec.size[0], spec.size[1]);
  switch (side) {
    case "north":
      return [0, minZ + 2];
    case "south":
      return [0, maxZ - 2];
    case "east":
      return [maxX - 2, 0];
    case "west":
      return [minX + 2, 0];
    case "center":
      return [0, 2];
  }
};

const sideSpawnCell = (spec: AreaSpec, side: ConnectionSide): Vec2 => {
  const { minX, maxX, minZ, maxZ } = getBounds(spec.size[0], spec.size[1]);
  switch (side) {
    case "north":
      return [0, minZ + 4];
    case "south":
      return [0, maxZ - 4];
    case "east":
      return [maxX - 4, 0];
    case "west":
      return [minX + 4, 0];
    case "center":
      return [0, 5];
  }
};

const directedConnectionsFor = (mapId: string): DirectedConnection[] => {
  const result: DirectedConnection[] = [];
  for (const connection of THREEFOLD_MARCH_CONNECTIONS) {
    if (connection.from === mapId) {
      result.push({ targetId: connection.to, side: connection.fromSide, targetSide: connection.toSide });
    } else if (connection.to === mapId) {
      result.push({ targetId: connection.from, side: connection.toSide, targetSide: connection.fromSide });
    }
  }
  return result;
};

const addDisc = (set: Set<string>, center: Vec2, radius: number) => {
  const [cx, cz] = center;
  for (let z = cz - radius; z <= cz + radius; z += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= radius * radius) {
        set.add(key(x, z));
      }
    }
  }
};

const paintRoute = (route: Set<string>, from: Vec2, to: Vec2, radius = 1) => {
  const [x0, z0] = from;
  const [x1, z1] = to;
  const xStep = x0 <= x1 ? 1 : -1;
  for (let x = x0; x !== x1 + xStep; x += xStep) addDisc(route, [x, z0], radius);
  const zStep = z0 <= z1 ? 1 : -1;
  for (let z = z0; z !== z1 + zStep; z += zStep) addDisc(route, [x1, z], radius);
};

const setTerrainDisc = (terrain: Map<string, TerrainObjectId>, center: Vec2, radius: number, objectId: TerrainObjectId) => {
  const cells = new Set<string>();
  addDisc(cells, center, radius);
  cells.forEach((cellKey) => terrain.set(cellKey, objectId));
};

const paintTerrainRoute = (
  terrain: Map<string, TerrainObjectId>,
  from: Vec2,
  to: Vec2,
  radius: number,
  objectId: TerrainObjectId,
) => {
  const cells = new Set<string>();
  paintRoute(cells, from, to, radius);
  cells.forEach((cellKey) => terrain.set(cellKey, objectId));
};

const setTerrainRect = (
  terrain: Map<string, TerrainObjectId>,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  objectId: TerrainObjectId,
) => {
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) terrain.set(key(x, z), objectId);
  }
};

const addBuilding = (
  terrain: Map<string, TerrainObjectId>,
  blockers: Map<string, string>,
  placements: ObjectPlacementData[],
  bounds: { x0: number; z0: number; x1: number; z1: number },
  opts: { wall?: string; floor?: TerrainObjectId; door?: { cell: Vec2; facing: Vec2 } } = {},
) => {
  const wall = opts.wall || "obj_wall_stone";
  const floor = opts.floor || "obj_floor_stone";
  const doorKey = opts.door ? key(opts.door.cell[0], opts.door.cell[1]) : "";
  for (let z = bounds.z0; z <= bounds.z1; z += 1) {
    for (let x = bounds.x0; x <= bounds.x1; x += 1) {
      const cellKey = key(x, z);
      const edge = x === bounds.x0 || x === bounds.x1 || z === bounds.z0 || z === bounds.z1;
      if (edge && cellKey !== doorKey) blockers.set(cellKey, wall);
      else terrain.set(cellKey, floor);
    }
  }
  if (opts.door) {
    terrain.set(doorKey, floor);
    placements.push({ object_id: "obj_p_door", cell: cloneCell(opts.door.cell), facing: cloneCell(opts.door.facing) });
  }
};

const addPlacement = (
  placements: ObjectPlacementData[],
  object_id: string,
  cell: Vec2,
  facing: Vec2 = [0, 1],
) => {
  placements.push({ object_id, cell: cloneCell(cell), facing: cloneCell(facing) });
};

const terrainForArea = (spec: AreaSpec, x: number, z: number): TerrainObjectId => {
  switch (spec.id) {
    case "map_march_watchfold":
      return z > 7 ? "obj_world_marsh" : "obj_world_plains";
    case "map_march_reedmire":
      return "obj_world_marsh";
    case "map_march_combe":
      return "obj_world_plains";
    case "map_march_hallowdown":
      return "obj_world_plains";
    case "map_march_marrowhouse":
      if (Math.abs(x) < 10 && Math.abs(z) < 10) return "obj_floor_stone";
      return "obj_world_plains";
    case "map_march_thornmarch":
      return "obj_world_coast";
    case "map_march_gallowsreach":
      return "obj_world_hills";
    case "map_march_convening":
      if (Math.abs(x) + Math.abs(z) < 10) return "obj_world_scar";
      return "obj_world_plains";
    case "map_march_under_convening":
      return "obj_world_scar";
    default:
      return spec.baseTerrain;
  }
};

const applyTerrainPatches = (spec: AreaSpec, terrain: Map<string, TerrainObjectId>) => {
  switch (spec.id) {
    case "map_march_watchfold": {
      setTerrainRect(terrain, -22, 7, 22, 20, "obj_world_marsh");
      setTerrainDisc(terrain, [-15, 14], 5, "obj_world_water");
      setTerrainDisc(terrain, [9, 16], 4, "obj_world_water");
      setTerrainRect(terrain, -18, -14, 16, -9, "obj_world_coast");
      break;
    }
    case "map_march_reedmire": {
      setTerrainDisc(terrain, [-24, 15], 12, "obj_world_water");
      setTerrainDisc(terrain, [18, -18], 10, "obj_world_water");
      setTerrainDisc(terrain, [28, 23], 6, "obj_world_water");
      setTerrainDisc(terrain, [-8, -8], 9, "obj_world_coast");
      setTerrainDisc(terrain, [11, 13], 8, "obj_world_coast");
      break;
    }
    case "map_march_combe": {
      setTerrainRect(terrain, -20, 2, -5, 16, "obj_floor_dirt");
      setTerrainRect(terrain, 6, 3, 21, 17, "obj_floor_dirt");
      setTerrainRect(terrain, -18, -17, 18, -12, "obj_world_coast");
      break;
    }
    case "map_march_hallowdown": {
      setTerrainDisc(terrain, [-28, -12], 13, "obj_world_forest");
      setTerrainDisc(terrain, [25, 19], 14, "obj_world_forest");
      setTerrainDisc(terrain, [34, -23], 12, "obj_world_hills");
      setTerrainDisc(terrain, [-36, 30], 8, "obj_world_scar");
      paintTerrainRoute(terrain, [-54, -42], [50, -42], 2, "obj_world_hills");
      break;
    }
    case "map_march_marrowhouse": {
      setTerrainDisc(terrain, [-16, -13], 10, "obj_world_forest");
      setTerrainDisc(terrain, [16, -12], 10, "obj_world_forest");
      setTerrainDisc(terrain, [-17, 14], 8, "obj_world_forest");
      setTerrainDisc(terrain, [15, 13], 7, "obj_world_scar");
      setTerrainRect(terrain, -13, -11, 13, 7, "obj_floor_stone");
      break;
    }
    case "map_march_thornmarch": {
      setTerrainRect(terrain, -22, -7, 22, 1, "obj_world_scar");
      setTerrainRect(terrain, -22, 10, 22, 18, "obj_world_hills");
      paintTerrainRoute(terrain, [-20, 0], [20, 0], 2, "obj_world_road");
      break;
    }
    case "map_march_gallowsreach": {
      paintTerrainRoute(terrain, [-36, -24], [34, -24], 4, "obj_world_scar");
      paintTerrainRoute(terrain, [-31, 24], [30, 24], 3, "obj_world_coast");
      setTerrainDisc(terrain, [18, -20], 8, "obj_world_scar");
      setTerrainDisc(terrain, [-20, 12], 11, "obj_world_hills");
      break;
    }
    case "map_march_convening": {
      setTerrainDisc(terrain, [0, 0], 10, "obj_world_scar");
      setTerrainDisc(terrain, [-18, -9], 8, "obj_world_hills");
      setTerrainDisc(terrain, [19, 10], 8, "obj_world_hills");
      break;
    }
    case "map_march_under_convening": {
      setTerrainRect(terrain, -14, -22, -7, 22, "obj_world_hills");
      setTerrainRect(terrain, 7, -22, 14, 22, "obj_world_hills");
      paintTerrainRoute(terrain, [0, -22], [0, 22], 3, "obj_world_scar");
      break;
    }
  }
};

const applyLandmarks = (
  spec: AreaSpec,
  route: Set<string>,
  terrain: Map<string, TerrainObjectId>,
  blockers: Map<string, string>,
  placements: ObjectPlacementData[],
) => {
  switch (spec.id) {
    case "map_march_watchfold": {
      addBuilding(terrain, blockers, placements, { x0: -12, z0: -8, x1: -5, z1: -2 }, {
        floor: "obj_floor_dirt",
        door: { cell: [-8, -2], facing: [0, 1] },
      });
      addBuilding(terrain, blockers, placements, { x0: 5, z0: -7, x1: 12, z1: -1 }, {
        floor: "obj_floor_dirt",
        door: { cell: [8, -1], facing: [0, 1] },
      });
      [-14, -10, 10, 14].forEach((x) => addPlacement(placements, "obj_grave_cairn_marker", [x, 5]));
      setTerrainDisc(terrain, [15, 13], 4, "obj_world_scar");
      addPlacement(placements, "obj_grief_glass", [15, 13]);
      paintRoute(route, [0, 0], [15, 13], 1);
      break;
    }
    case "map_march_reedmire": {
      setTerrainDisc(terrain, [-22, 15], 10, "obj_world_water");
      setTerrainDisc(terrain, [18, -18], 8, "obj_world_water");
      setTerrainDisc(terrain, [24, 20], 5, "obj_world_scar");
      addPlacement(placements, "obj_reed_clump", [-8, 8]);
      addPlacement(placements, "obj_reed_clump", [12, -9]);
      addPlacement(placements, "obj_rain_barrel", [7, 12]);
      addPlacement(placements, "obj_bell_keeper_glass", [24, 20]);
      paintRoute(route, [0, 0], [24, 20], 1);
      break;
    }
    case "map_march_combe": {
      addBuilding(terrain, blockers, placements, { x0: -7, z0: -10, x1: 7, z1: -2 }, {
        wall: "obj_wall_stone",
        floor: "obj_floor_stone",
        door: { cell: [0, -2], facing: [0, 1] },
      });
      addPlacement(placements, "obj_stone_altar", [0, -6]);
      setTerrainRect(terrain, -14, 4, 14, 10, "obj_floor_dirt");
      [-12, -8, -4, 4, 8, 12].forEach((x) => addPlacement(placements, "obj_grave_cairn_marker", [x, 7]));
      setTerrainDisc(terrain, [16, 12], 4, "obj_world_scar");
      addPlacement(placements, "obj_broken_statue", [16, 12]);
      paintRoute(route, [0, 0], [16, 12], 1);
      break;
    }
    case "map_march_hallowdown": {
      for (const cell of [[-28, -10], [-24, -14], [-20, -8], [18, 16], [24, 20], [30, 14]] as Vec2[]) {
        addPlacement(placements, "obj_wind_bent_tree", cell);
      }
      for (let x = 10; x <= 20; x += 2) blockers.set(key(x, -18), "obj_mossy_boulders");
      blockers.delete(key(15, -18));
      addPlacement(placements, "obj_ladder", [15, -17]);
      setTerrainDisc(terrain, [-34, 28], 5, "obj_world_scar");
      addPlacement(placements, "obj_grief_glass", [-34, 28]);
      addPlacement(placements, "obj_fallen_log", [-10, 18]);
      paintRoute(route, [0, 0], [-34, 28], 1);
      break;
    }
    case "map_march_marrowhouse": {
      addBuilding(terrain, blockers, placements, { x0: -10, z0: -9, x1: 10, z1: 5 }, {
        wall: "obj_wall_block",
        floor: "obj_floor_stone",
        door: { cell: [0, 5], facing: [0, 1] },
      });
      addPlacement(placements, "obj_stone_altar", [0, -3]);
      addPlacement(placements, "obj_bookshelf", [-6, 0]);
      addPlacement(placements, "obj_cupboard", [6, 0]);
      setTerrainDisc(terrain, [13, 12], 4, "obj_world_scar");
      addPlacement(placements, "obj_bell_keeper_glass", [13, 12]);
      paintRoute(route, [0, 0], [13, 12], 1);
      break;
    }
    case "map_march_thornmarch": {
      for (let x = -20; x <= 20; x += 1) {
        if (Math.abs(x) <= 2) continue;
        blockers.set(key(x, -4), "obj_thorn_bramble");
      }
      [-10, 10].forEach((x) => addPlacement(placements, "obj_broken_field_fence", [x, 4]));
      addPlacement(placements, "obj_rubble_pile", [-6, -9]);
      addPlacement(placements, "obj_mossy_boulders", [7, -10]);
      setTerrainDisc(terrain, [0, -4], 5, "obj_world_scar");
      paintRoute(route, [0, 0], [0, -8], 1);
      break;
    }
    case "map_march_gallowsreach": {
      for (let x = -14; x <= 14; x += 2) blockers.set(key(x, 8), "obj_mossy_boulders");
      blockers.delete(key(0, 8));
      addPlacement(placements, "obj_ladder", [0, 7]);
      addPlacement(placements, "obj_dead_tree", [-15, -15]);
      setTerrainDisc(terrain, [18, -20], 5, "obj_world_scar");
      addPlacement(placements, "obj_grief_glass", [18, -20]);
      paintRoute(route, [0, 0], [18, -20], 1);
      break;
    }
    case "map_march_convening": {
      setTerrainDisc(terrain, [0, 0], 8, "obj_world_scar");
      addPlacement(placements, "obj_stone_altar", [0, 0]);
      addPlacement(placements, "obj_floor_hatch", [0, 2]);
      addPlacement(placements, "obj_bell_keeper_glass", [-3, 2]);
      addPlacement(placements, "obj_grief_glass", [3, 2]);
      paintRoute(route, [0, 0], [0, 2], 2);
      paintRoute(route, [-16, 0], [16, 0], 1);
      break;
    }
    case "map_march_under_convening": {
      setTerrainRect(terrain, -4, -18, 4, 18, "obj_world_scar");
      for (let x = -13; x <= 13; x += 1) {
        if (Math.abs(x) <= 3) continue;
        blockers.set(key(x, -8), "obj_mossy_boulders");
      }
      addPlacement(placements, "obj_bell_keeper_glass", [0, 12]);
      addPlacement(placements, "obj_grief_glass", [0, 16]);
      addPlacement(placements, "obj_floor_hatch", [0, -20]);
      paintRoute(route, [0, -20], [0, 18], 1);
      break;
    }
  }
};

const isActiveIslandCell = (spec: AreaSpec, x: number, z: number) => {
  const { minX, maxX, minZ, maxZ } = getBounds(spec.size[0], spec.size[1]);
  if (x <= minX + 1 || x >= maxX - 1 || z <= minZ + 1 || z >= maxZ - 1) return false;
  const cornerInset = spec.role === "wild" ? 9 : spec.role === "basin" ? 6 : 4;
  const nearCorner =
    (x < minX + cornerInset || x > maxX - cornerInset) &&
    (z < minZ + cornerInset || z > maxZ - cornerInset);
  return !nearCorner;
};

const terrainLabel = (objectId: string) =>
  objectId.replace(/^obj_/, "").replace(/^world_/, "").replace(/^floor_/, "");

const visualHeightFor = (objectId: string, blocked: boolean) => {
  if (blocked) return 1.35;
  if (objectId === "obj_world_hills") return 0.35;
  if (objectId === "obj_world_forest") return 0.16;
  if (objectId === "obj_world_water") return 0.01;
  if (objectId === "obj_world_road") return 0.06;
  return 0.04;
};

const createCells = (
  spec: AreaSpec,
  route: Set<string>,
  terrainOverrides: Map<string, TerrainObjectId>,
  blockers: Map<string, string>,
): CellData[] => {
  const { minX, maxX, minZ, maxZ } = getBounds(spec.size[0], spec.size[1]);
  const cells: CellData[] = [];
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cellKey = key(x, z);
      const active = isActiveIslandCell(spec, x, z) || route.has(cellKey);
      if (!active) {
        cells.push({
          x,
          y: 0,
          z,
          active: false,
          walkable: false,
          blocks_los: false,
          height: 0,
          visual_height: 0,
          terrain: "void",
          object_id: undefined,
          region_id: areaSlug(spec.id),
          room_id: `${areaSlug(spec.id)}_void`,
          tag: "void",
          surface_tag: "none",
        });
        continue;
      }

      const blockingObject = blockers.get(cellKey);
      const routeCell = route.has(cellKey);
      const object_id = blockingObject || (routeCell ? "obj_world_road" : terrainOverrides.get(cellKey) || terrainForArea(spec, x, z));
      const water = object_id === "obj_world_water";
      const marsh = object_id === "obj_world_marsh";
      const scar = object_id === "obj_world_scar";
      const blocked = Boolean(blockingObject);
      cells.push({
        x,
        y: 0,
        z,
        active: true,
        walkable: !blocked && !water,
        blocks_los: blocked,
        height: object_id === "obj_world_hills" ? 1 : 0,
        visual_height: visualHeightFor(object_id, blocked),
        terrain: terrainLabel(object_id),
        object_id,
        region_id: areaSlug(spec.id),
        room_id: `${areaSlug(spec.id)}_greybox`,
        tag: blocked ? "greybox_blocker" : routeCell ? "march_route" : scar ? "fracture_scar" : "march_ground",
        hazard: water || marsh ? "water" : undefined,
        surface_tag: water || marsh ? "water" : "none",
      });
    }
  }
  return cells;
};

const createMarchMap = (spec: AreaSpec): MapData => {
  const connections = directedConnectionsFor(spec.id);
  const route = new Set<string>();
  const terrainOverrides = new Map<string, TerrainObjectId>();
  const blockers = new Map<string, string>();
  const placements: ObjectPlacementData[] = [];
  const center: Vec2 = spec.id === "map_march_under_convening" ? [0, -2] : [0, 0];

  connections.forEach((connection) => {
    paintRoute(route, sideExitCell(spec, connection.side), center, spec.role === "wild" ? 2 : 1);
    paintRoute(route, sideSpawnCell(spec, connection.side), center, 1);
  });
  addDisc(route, center, spec.role === "basin" ? 3 : 2);

  applyTerrainPatches(spec, terrainOverrides);
  applyLandmarks(spec, route, terrainOverrides, blockers, placements);

  const spawns = [
    {
      id: "spawn_start",
      cell: spec.id === "map_march_convening" ? ([0, 6] as Vec2) : cloneCell(center),
      facing: [0, -1] as Vec2,
    },
    ...connections.map((connection) => ({
      id: `spawn_from_${areaSlug(connection.targetId)}`,
      cell: sideSpawnCell(spec, connection.side),
      facing: inwardFacing(connection.side),
    })),
  ];

  const exits: MapData["exits"] = connections.map((connection) => ({
    id: `exit_to_${areaSlug(connection.targetId)}`,
    cell: sideExitCell(spec, connection.side),
    target_map_id: connection.targetId,
    target_spawn_id: `spawn_from_${areaSlug(spec.id)}`,
    facing: inwardFacing(connection.targetSide),
  }));

  return {
    id: spec.id,
    display_name: spec.displayName,
    width: spec.size[0],
    height: spec.size[1],
    spawns,
    cells: createCells(spec, route, terrainOverrides, blockers),
    props: [],
    custom_object_placements: placements,
    entity_placements: [],
    item_placements: [],
    container_placements: [],
    triggers: [],
    exits,
    regions: [
      {
        id: areaSlug(spec.id),
        display_name: `${spec.displayName} Greybox ${THREEFOLD_MARCH_GREYBOX_VERSION}`,
        neutral: spec.role !== "crossing",
        survival_delta:
          spec.role === "wild"
            ? { fatigue: 0.5, exposure: 0.25 }
            : spec.role === "fracture_mouth"
              ? { fatigue: 0.75, exposure: 0.75 }
              : { fatigue: 0.25 },
        passive_checks: [],
      },
    ],
  };
};

export const createThreefoldMarchMaps = (): MapData[] => AREA_SPECS.map(createMarchMap);

export const isThreefoldMarchMapId = (mapId: string) => specById.has(mapId);

export const getThreefoldMarchArea = (mapId: string) => specById.get(mapId);

export const describeThreefoldMarchConnection = (connection: MarchConnection) =>
  `${titleId(areaSlug(connection.from))} ${connection.fromSide} -> ${titleId(areaSlug(connection.to))} ${connection.toSide}`;
