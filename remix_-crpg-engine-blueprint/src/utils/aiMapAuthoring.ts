import type { CellData, MapData } from "../schema/game";

type Vec2 = [number, number];

export interface AiMapAuthoringResult {
  updates: Partial<MapData>;
  summary: string;
  operations: string[];
}

interface SettlementOptions {
  includeRuins?: boolean;
}

interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface RectBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface MapDraft {
  bounds: MapBounds;
  cellsByKey: Map<string, CellData>;
  putCell: (x: number, z: number, updates: Partial<CellData>) => void;
  fillRect: (ax: number, az: number, bx: number, bz: number, updates: Partial<CellData>) => void;
  paintRoadRect: (ax: number, az: number, bx: number, bz: number, tag: string) => void;
  paintStoneRect: (ax: number, az: number, bx: number, bz: number, tag: string) => void;
}

const cellKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`;

export function applyAiMapEditPrompt(map: MapData, prompt: string): AiMapAuthoringResult {
  const lower = prompt.toLowerCase();
  const wantsTown =
    !lower.trim() ||
    /town|settlement|village|parish|building|buildings|door|doors|street|path|paths|quarter|corner/.test(lower);
  const wantsCleanTown =
    /clean|remove|unnecessary|simplify|close|finished|finish|entrance|only entrance/.test(lower);
  const wantsRuins = /ruin|ruins|dungeon|dungeon-y|crypt|vault|barrow|scatter|scattered/.test(lower);

  if (wantsTown || wantsCleanTown) {
    return {
      updates: buildNorthwestCornerSettlement(map, { includeRuins: wantsRuins || !lower.trim() }),
      summary: wantsRuins
        ? "Cleaned the corner settlement and scattered dungeon ruins across the wider map."
        : "Cleaned the corner settlement, simplified town paths, and closed town buildings to door-only entrances.",
      operations: [
        "corner_settlement",
        "simplify_town_paths",
        "close_town_buildings",
        ...(wantsRuins ? ["scatter_dungeon_ruins"] : []),
      ],
    };
  }

  if (wantsRuins) {
    return {
      updates: scatterDungeonRuins(map),
      summary: "Scattered dungeon-like ruins across the wider map while leaving the town quarter alone.",
      operations: ["scatter_dungeon_ruins"],
    };
  }

  return {
    updates: buildNorthwestCornerSettlement(map, { includeRuins: true }),
    summary: "Applied the default AI authoring pass: cleaned town quarter plus scattered ruins.",
    operations: ["corner_settlement", "scatter_dungeon_ruins"],
  };
}

export function buildNorthwestCornerSettlement(
  map: MapData,
  options: SettlementOptions = {},
): Partial<MapData> {
  const bounds = getMapBounds(map);
  const settlement = getNorthwestSettlementBounds(map, bounds);
  const inSettlement = (x: number, z: number) => inRect(x, z, settlement);
  const draft = createDraft(map, (cell) => inSettlement(cell.x, cell.z));
  const doors: MapData["custom_object_placements"] = [];
  const { x0, z0, x1, z1 } = settlement;
  const { minX, maxX, minZ, maxZ } = bounds;

  draft.fillRect(x0, z0, x1, z1, {
    object_id: "obj_jam_ground",
    terrain: "grass",
    walkable: true,
    blocks_los: false,
    visual_height: 0,
    tag: "settlement_clean_ground",
  });

  const roadZ = z0 + Math.floor((z1 - z0) * 0.56);
  const roadX = x0 + Math.floor((x1 - x0) * 0.46);
  draft.paintRoadRect(x0, roadZ - 2, Math.min(maxX, x1 + 18), roadZ + 2, "settlement_main_road");
  draft.paintStoneRect(roadX - 10, roadZ - 8, roadX + 10, roadZ + 8, "settlement_market_cross");

  const addDoor = (x: number, z: number, facing: Vec2) => {
    draft.putCell(x, z, {
      object_id: "obj_jam_stone",
      terrain: "stone",
      walkable: true,
      blocks_los: false,
      visual_height: 0,
      tag: "settlement_door_sill",
    });
    doors.push({ object_id: "obj_jam_door", cell: [x, z], facing });
  };

  const ringBuilding = (
    id: string,
    ax: number,
    az: number,
    width: number,
    height: number,
    door: { edge: "north" | "south" | "east" | "west"; offset?: number },
  ) => {
    const bx = Math.min(x1 - 3, ax + width - 1);
    const bz = Math.min(z1 - 3, az + height - 1);
    const cx = Math.floor((ax + bx) / 2);
    const cz = Math.floor((az + bz) / 2);
    const doorX =
      door.edge === "west" ? ax :
      door.edge === "east" ? bx :
      Math.max(ax + 1, Math.min(bx - 1, ax + (door.offset ?? Math.floor((bx - ax) / 2))));
    const doorZ =
      door.edge === "north" ? az :
      door.edge === "south" ? bz :
      Math.max(az + 1, Math.min(bz - 1, az + (door.offset ?? Math.floor((bz - az) / 2))));
    const facing: Vec2 =
      door.edge === "north" ? [0, -1] :
      door.edge === "south" ? [0, 1] :
      door.edge === "east" ? [1, 0] :
      [-1, 0];

    draft.paintStoneRect(ax, az, bx, bz, `settlement_${id}_floor`);
    for (let x = ax; x <= bx; x += 1) {
      putWall(draft, x, az, `settlement_${id}_wall`);
      putWall(draft, x, bz, `settlement_${id}_wall`);
    }
    for (let z = az + 1; z <= bz - 1; z += 1) {
      putWall(draft, ax, z, `settlement_${id}_wall`);
      putWall(draft, bx, z, `settlement_${id}_wall`);
    }
    addDoor(doorX, doorZ, facing);
    draft.paintStoneRect(cx - 2, cz - 2, cx + 2, cz + 2, `settlement_${id}_hearth`);
    return {
      outside: [doorX + facing[0], doorZ + facing[1]] as Vec2,
    };
  };

  const connectPath = (from: Vec2, to: Vec2, tag: string) => {
    draft.paintRoadRect(Math.min(from[0], to[0]), from[1] - 1, Math.max(from[0], to[0]), from[1] + 1, tag);
    draft.paintRoadRect(to[0] - 1, Math.min(from[1], to[1]), to[0] + 1, Math.max(from[1], to[1]), tag);
  };

  const commonHall = ringBuilding("common_hall", x0 + 20, roadZ - 38, 38, 25, { edge: "south" });
  connectPath(commonHall.outside, [commonHall.outside[0], roadZ - 3], "settlement_common_hall_path");
  const chapel = ringBuilding("chapel", roadX + 14, z0 + 34, 27, 34, { edge: "south" });
  connectPath(chapel.outside, [chapel.outside[0], roadZ - 3], "settlement_chapel_path");
  const workshop = ringBuilding("workshop", x0 + 28, roadZ + 14, 32, 23, { edge: "north" });
  connectPath(workshop.outside, [workshop.outside[0], roadZ + 3], "settlement_workshop_path");
  const storehouse = ringBuilding("storehouse", roadX + 14, roadZ + 16, 28, 22, { edge: "north" });
  connectPath(storehouse.outside, [storehouse.outside[0], roadZ + 3], "settlement_storehouse_path");
  const laneHouse = ringBuilding("lane_house", x1 - 38, roadZ - 28, 28, 23, { edge: "south" });
  connectPath(laneHouse.outside, [laneHouse.outside[0], roadZ - 3], "settlement_lane_house_path");

  draft.paintStoneRect(roadX - 4, roadZ - 4, roadX + 4, roadZ + 4, "settlement_market_paving");
  draft.paintStoneRect(x0 + 82, roadZ + 18, x0 + 102, roadZ + 28, "settlement_work_yard");
  draft.fillRect(x0 + 84, roadZ + 20, x0 + 88, roadZ + 24, {
    object_id: "obj_jam_wall",
    terrain: "stone",
    walkable: false,
    blocks_los: true,
    visual_height: 3.6,
    tag: "settlement_finished_yard_wall",
  });

  if (options.includeRuins !== false) {
    drawDefaultDungeonRuins(draft, map, (x, z) => inSettlement(x, z));
  }

  const filteredPlacements = (map.custom_object_placements || []).filter((placement) =>
    !inSettlement(placement.cell[0], placement.cell[1]),
  );
  const nextSpawns = map.spawns.length
    ? map.spawns.map((spawn, index) =>
        index === 0 ? { ...spawn, cell: [roadX, roadZ] as Vec2, facing: [1, 0] as Vec2 } : spawn,
      )
    : [{ id: "spawn_corner_settlement", cell: [roadX, roadZ] as Vec2, facing: [1, 0] as Vec2 }];

  return {
    cells: finishCells(draft),
    custom_object_placements: [...filteredPlacements, ...doors],
    entity_placements: (map.entity_placements || []).filter((placement) => !inSettlement(placement.cell[0], placement.cell[1])),
    item_placements: (map.item_placements || []).filter((placement) => !inSettlement(placement.cell[0], placement.cell[1])),
    container_placements: (map.container_placements || []).filter((placement) => !inSettlement(placement.cell[0], placement.cell[1])),
    triggers: (map.triggers || []).filter((trigger) => !trigger.cell || !inSettlement(trigger.cell[0], trigger.cell[1])),
    spawns: nextSpawns,
  };
}

export function scatterDungeonRuins(map: MapData): Partial<MapData> {
  const bounds = getMapBounds(map);
  const settlement = getNorthwestSettlementBounds(map, bounds);
  const draft = createDraft(map);
  drawDefaultDungeonRuins(draft, map, (x, z) => inRect(x, z, settlement));
  return {
    cells: finishCells(draft),
  };
}

function drawDefaultDungeonRuins(
  draft: MapDraft,
  map: MapData,
  isForbidden: (x: number, z: number) => boolean,
) {
  const { minX, minZ } = draft.bounds;
  const ruins = [
    { id: "north_crypt", nx: 0.64, nz: 0.16, width: 25, height: 19 },
    { id: "roadside_vault", nx: 0.83, nz: 0.27, width: 22, height: 24 },
    { id: "sunken_cellar", nx: 0.61, nz: 0.48, width: 29, height: 18 },
    { id: "east_barrow", nx: 0.88, nz: 0.55, width: 24, height: 22 },
    { id: "south_warren", nx: 0.56, nz: 0.78, width: 31, height: 20 },
    { id: "threshold_remnant", nx: 0.78, nz: 0.82, width: 26, height: 26 },
    { id: "lower_crypt", nx: 0.34, nz: 0.72, width: 21, height: 20 },
    { id: "old_foundation", nx: 0.18, nz: 0.84, width: 28, height: 17 },
  ];
  for (const ruin of ruins) {
    drawDungeonRuin(
      draft,
      ruin.id,
      minX + Math.floor(map.width * ruin.nx),
      minZ + Math.floor(map.height * ruin.nz),
      ruin.width,
      ruin.height,
      isForbidden,
    );
  }
}

function drawDungeonRuin(
  draft: MapDraft,
  id: string,
  cx: number,
  cz: number,
  width: number,
  height: number,
  isForbidden: (x: number, z: number) => boolean,
) {
  const { minX, maxX, minZ, maxZ } = draft.bounds;
  const ax = Math.max(minX + 4, Math.floor(cx - width / 2));
  const bx = Math.min(maxX - 4, ax + width - 1);
  const az = Math.max(minZ + 4, Math.floor(cz - height / 2));
  const bz = Math.min(maxZ - 4, az + height - 1);
  if (bx <= ax + 4 || bz <= az + 4) return;
  if (isForbidden(ax, az) || isForbidden(bx, bz)) return;

  draft.paintStoneRect(ax + 1, az + 1, bx - 1, bz - 1, `dungeon_ruin_${id}_floor`);
  for (let x = ax; x <= bx; x += 1) {
    if ((x + az) % 5 !== 0) putWall(draft, x, az, `dungeon_ruin_${id}_broken_wall`);
    if ((x + bz) % 4 !== 0) putWall(draft, x, bz, `dungeon_ruin_${id}_broken_wall`);
  }
  for (let z = az + 1; z <= bz - 1; z += 1) {
    if ((z + ax) % 4 !== 0) putWall(draft, ax, z, `dungeon_ruin_${id}_broken_wall`);
    if ((z + bx) % 5 !== 0) putWall(draft, bx, z, `dungeon_ruin_${id}_broken_wall`);
  }

  const midX = Math.floor((ax + bx) / 2);
  const midZ = Math.floor((az + bz) / 2);
  for (let x = ax + 3; x <= bx - 3; x += 1) {
    if (x < midX - 2 || x > midX + 2) putWall(draft, x, midZ, `dungeon_ruin_${id}_interior_wall`);
  }
  for (let z = az + 3; z <= bz - 3; z += 1) {
    if (z < midZ - 2 || z > midZ + 2) putWall(draft, midX, z, `dungeon_ruin_${id}_interior_wall`);
  }
  draft.fillRect(midX - 2, midZ - 2, midX + 2, midZ + 2, {
    object_id: "obj_jam_scar",
    terrain: "scar",
    walkable: true,
    blocks_los: false,
    visual_height: 0.08,
    tag: `dungeon_ruin_${id}_pit`,
  });
  draft.paintStoneRect(ax + 2, bz - 3, ax + 5, bz - 1, `dungeon_ruin_${id}_collapsed_steps`);
}

function createDraft(map: MapData, omitCell?: (cell: CellData) => boolean): MapDraft {
  const bounds = getMapBounds(map);
  const cellsByKey = new Map<string, CellData>();
  for (const cell of map.cells) {
    if (omitCell?.(cell)) continue;
    cellsByKey.set(cellKey(cell.x, cell.y || 0, cell.z), cell);
  }

  const putCell = (x: number, z: number, updates: Partial<CellData>) => {
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return;
    cellsByKey.set(cellKey(x, 0, z), {
      x,
      y: 0,
      z,
      active: true,
      walkable: true,
      blocks_los: false,
      height: 0,
      visual_height: 0,
      terrain: "grass",
      object_id: "obj_jam_ground",
      surface_tag: "none",
      ...updates,
    });
  };

  const fillRect = (ax: number, az: number, bx: number, bz: number, updates: Partial<CellData>) => {
    const startX = Math.max(bounds.minX, Math.min(ax, bx));
    const endX = Math.min(bounds.maxX, Math.max(ax, bx));
    const startZ = Math.max(bounds.minZ, Math.min(az, bz));
    const endZ = Math.min(bounds.maxZ, Math.max(az, bz));
    for (let x = startX; x <= endX; x += 1) {
      for (let z = startZ; z <= endZ; z += 1) {
        putCell(x, z, updates);
      }
    }
  };

  return {
    bounds,
    cellsByKey,
    putCell,
    fillRect,
    paintRoadRect: (ax, az, bx, bz, tag) => {
      fillRect(ax, az, bx, bz, {
        object_id: "obj_jam_path",
        terrain: "road",
        walkable: true,
        blocks_los: false,
        visual_height: 0,
        tag,
      });
    },
    paintStoneRect: (ax, az, bx, bz, tag) => {
      fillRect(ax, az, bx, bz, {
        object_id: "obj_jam_stone",
        terrain: "stone",
        walkable: true,
        blocks_los: false,
        visual_height: 0,
        tag,
      });
    },
  };
}

function putWall(draft: MapDraft, x: number, z: number, tag: string) {
  draft.putCell(x, z, {
    object_id: "obj_jam_wall",
    terrain: "stone",
    walkable: false,
    blocks_los: true,
    visual_height: 3.6,
    tag,
  });
}

function finishCells(draft: MapDraft) {
  return Array.from(draft.cellsByKey.values()).sort((a, b) => (a.z - b.z) || (a.x - b.x) || ((a.y || 0) - (b.y || 0)));
}

function getMapBounds(map: MapData): MapBounds {
  return {
    minX: -Math.floor(map.width / 2),
    maxX: Math.floor((map.width - 1) / 2),
    minZ: -Math.floor(map.height / 2),
    maxZ: Math.floor((map.height - 1) / 2),
  };
}

function getNorthwestSettlementBounds(map: MapData, bounds = getMapBounds(map)): RectBounds {
  return {
    x0: bounds.minX,
    z0: bounds.minZ,
    x1: Math.min(bounds.maxX, bounds.minX + Math.max(48, Math.floor(map.width / 2)) - 1),
    z1: Math.min(bounds.maxZ, bounds.minZ + Math.max(48, Math.floor(map.height / 2)) - 1),
  };
}

function inRect(x: number, z: number, rect: RectBounds) {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}
