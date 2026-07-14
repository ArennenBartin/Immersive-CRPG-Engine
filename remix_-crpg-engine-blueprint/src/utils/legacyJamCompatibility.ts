import type { CellData, GamePackage, MapData } from "../schema/game";
import { JAM_OBJECT_IDS, JAM_OBJECT_LIBRARY } from "./legacyJamObjects";

const JAM_VISUAL_HEIGHT_CEILING = 100;

type JamHeightCell = Pick<CellData, "visual_height"> &
  Partial<Pick<CellData, "object_id" | "tag" | "walkable" | "blocks_los">>;

export const JAM_ENGINE_WALKABLE_VISUAL_HEIGHT_CEILING = 0.9;
export const JAM_ENGINE_BLOCKER_VISUAL_HEIGHT_CEILING = 1.2;
export const JAM_ENGINE_SPIRE_PLINTH_HEIGHT = 1.1;
export const JAM_ENGINE_WALL_VISUAL_HEIGHT = 3.6;

const MODEL_CARRIES_HEIGHT_OBJECTS = new Set([
  "obj_jam_cliff",
  "obj_jam_spire",
  "obj_jam_tree",
]);

const flatJamObjectHeightCeilings: Record<string, number> = {
  obj_jam_ground: 0.2,
  obj_jam_path: 0.08,
  obj_jam_scar: 0.25,
  obj_jam_stone: JAM_ENGINE_WALKABLE_VISUAL_HEIGHT_CEILING,
  obj_jam_water: 0,
};

export const isJamObjectId = (objectId?: string) =>
  Boolean(objectId?.startsWith("obj_jam_"));

export const isJamMap = (map: MapData) =>
  map.cells.some((cell) => isJamObjectId(cell.object_id)) ||
  (map.custom_object_placements || []).some((placement) =>
    isJamObjectId(placement.object_id),
  );

export function getJamEngineVisualHeight(
  cell: JamHeightCell | null | undefined,
) {
  if (!cell) return 0;
  const raw = clampFinite(cell.visual_height || 0, 0, JAM_VISUAL_HEIGHT_CEILING);
  if (!isJamObjectId(cell.object_id)) return raw;
  if (isJamWallLikeCell(cell)) return JAM_ENGINE_WALL_VISUAL_HEIGHT;
  if (raw <= 0) return 0;

  const tag = cell.tag || "";
  if (MODEL_CARRIES_HEIGHT_OBJECTS.has(cell.object_id || "")) return 0;
  if (tag.includes("spire")) {
    return Math.min(raw, JAM_ENGINE_SPIRE_PLINTH_HEIGHT);
  }
  if (tag.startsWith("parish_transition")) return Math.min(raw, 0.12);

  const objectCeiling = flatJamObjectHeightCeilings[cell.object_id || ""];
  if (objectCeiling !== undefined) return Math.min(raw, objectCeiling);

  if (cell.walkable === false) {
    return Math.min(raw, JAM_ENGINE_BLOCKER_VISUAL_HEIGHT_CEILING);
  }
  return Math.min(raw, JAM_ENGINE_WALKABLE_VISUAL_HEIGHT_CEILING);
}

export function normalizeJamMapElevations(map: MapData): MapData {
  if (!isJamMap(map)) return map;
  let changed = false;
  const cells = map.cells.map((cell) => {
    const visualHeight = getJamEngineVisualHeight(cell);
    if (isJamWallLikeCell(cell)) {
      if (
        cell.object_id === "obj_jam_wall" &&
        cell.walkable === false &&
        cell.blocks_los === true &&
        cell.visual_height === JAM_ENGINE_WALL_VISUAL_HEIGHT
      ) {
        return cell;
      }
      changed = true;
      return {
        ...cell,
        object_id: "obj_jam_wall",
        terrain: "stone",
        walkable: false,
        blocks_los: true,
        visual_height: JAM_ENGINE_WALL_VISUAL_HEIGHT,
      };
    }
    if (visualHeight === cell.visual_height) return cell;
    changed = true;
    return {
      ...cell,
      visual_height: visualHeight,
    };
  });
  return changed ? { ...map, cells } : map;
}

export function normalizeJamPackageElevations(pkg: GamePackage): GamePackage {
  let changed = false;
  const maps = pkg.maps.map((map) => {
    const normalized = normalizeJamMapElevations(map);
    if (normalized !== map) changed = true;
    return normalized;
  });
  const usedJamObjectIds = collectUsedJamObjectIds(maps);
  const objectLibrary = normalizeJamObjectLibrary(pkg, usedJamObjectIds);
  if (objectLibrary !== pkg.object_library) changed = true;

  return changed ? { ...pkg, maps, object_library: objectLibrary } : pkg;
}

function clampFinite(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function isJamWallLikeCell(cell: JamHeightCell | null | undefined) {
  if (!cell || !isJamObjectId(cell.object_id)) return false;
  if (cell.object_id === "obj_jam_wall") return true;
  if (cell.object_id !== "obj_jam_stone") return false;
  const tag = (cell.tag || "").toLowerCase();
  if (!tag) return false;
  if (
    tag.includes("shadow") ||
    tag.includes("trace") ||
    tag.includes("memory") ||
    tag.includes("mark") ||
    tag.includes("ring") ||
    tag.includes("floor") ||
    tag.includes("door")
  ) {
    return false;
  }
  return (
    tag.includes("wall") ||
    tag.includes("gate") ||
    tag.includes("shelf") ||
    tag.includes("rack") ||
    tag.includes("rail") ||
    tag.includes("loft_edge")
  );
}

function collectUsedJamObjectIds(maps: MapData[]) {
  const ids = new Set<string>();
  for (const map of maps) {
    for (const cell of map.cells) {
      if (isJamObjectId(cell.object_id)) ids.add(cell.object_id);
    }
    for (const placement of map.custom_object_placements || []) {
      if (isJamObjectId(placement.object_id)) ids.add(placement.object_id);
    }
  }
  return ids;
}

function normalizeJamObjectLibrary(
  pkg: GamePackage,
  usedJamObjectIds: Set<string>,
) {
  if (usedJamObjectIds.size === 0) return pkg.object_library;

  const canonicalById = new Map(JAM_OBJECT_LIBRARY.map((objectDef) => [objectDef.id, objectDef]));
  const existingIds = new Set(pkg.object_library.map((objectDef) => objectDef.id));
  let changed = false;

  const objectLibrary = pkg.object_library.map((objectDef) => {
    if (
      objectDef.id === "obj_jam_wall" &&
      usedJamObjectIds.has(objectDef.id) &&
      (objectDef.bounds?.[1] || 0) < 3
    ) {
      changed = true;
      return canonicalById.get(objectDef.id) || objectDef;
    }
    return objectDef;
  });

  for (const objectId of usedJamObjectIds) {
    if (!JAM_OBJECT_IDS.has(objectId) || existingIds.has(objectId)) continue;
    const objectDef = canonicalById.get(objectId);
    if (!objectDef) continue;
    objectLibrary.push(objectDef);
    changed = true;
  }

  return changed ? objectLibrary : pkg.object_library;
}
