import { createEmptyGamePackage } from "../src/schema/game";
import {
  THREEFOLD_MARCH_GREYBOX_VERSION,
  THREEFOLD_MARCH_AREA_DEFINITIONS,
  THREEFOLD_MARCH_CONNECTIONS,
  createThreefoldMarchMaps,
} from "../src/utils/threefoldMarchMap";

type Severity = "error" | "warning";

type Issue = {
  severity: Severity;
  scope: string;
  code: string;
  message: string;
};

const issues: Issue[] = [];

const addIssue = (severity: Severity, scope: string, code: string, message: string) => {
  issues.push({ severity, scope, code, message });
};

const cellKey = (cell: readonly unknown[]) => `${Number(cell[0])},${Number(cell[1])}`;
const areaIds = new Set(THREEFOLD_MARCH_AREA_DEFINITIONS.map((area) => area.id));
const generatedMaps = createThreefoldMarchMaps();
const generatedMapIds = new Set(generatedMaps.map((map) => map.id));
const defaultPackage = createEmptyGamePackage();
const packageMapById = new Map(defaultPackage.maps.map((map) => [map.id, map]));

if (THREEFOLD_MARCH_AREA_DEFINITIONS.length !== 9) {
  addIssue("error", "phase2", "wrong_area_count", `Expected 9 March areas, got ${THREEFOLD_MARCH_AREA_DEFINITIONS.length}`);
}

for (const area of THREEFOLD_MARCH_AREA_DEFINITIONS) {
  if (!area.size[0] || !area.size[1]) {
    addIssue("error", area.id, "missing_size", "Area has no fixed size");
  }
  if (!area.terrainMood.trim()) {
    addIssue("error", area.id, "missing_terrain_mood", "Area has no terrain/mood description");
  }
  if (area.connections.length === 0) {
    addIssue("error", area.id, "isolated_area", "Area has no graph connections");
  }
  for (const targetId of area.connections) {
    if (!areaIds.has(targetId)) {
      addIssue("error", area.id, "unknown_connection", targetId);
    }
  }
  if (area.role === "wild") {
    const hasDiscoveryHook = area.holds.some((entry) => /fracture|sidequest|discovery/i.test(entry));
    if (!hasDiscoveryHook) {
      addIssue("error", area.id, "wild_without_discovery", "Wild area needs a fracture-mouth, sidequest, or discovery hook");
    }
  }
  if (!generatedMapIds.has(area.id)) {
    addIssue("error", area.id, "missing_generated_map", "Area has no generated greybox map");
  }
  if (!packageMapById.has(area.id)) {
    addIssue("error", area.id, "missing_package_map", "Area is not installed in the default package");
  }
}

for (const connection of THREEFOLD_MARCH_CONNECTIONS) {
  if (!areaIds.has(connection.from)) addIssue("error", "graph", "unknown_from", connection.from);
  if (!areaIds.has(connection.to)) addIssue("error", "graph", "unknown_to", connection.to);

  const fromMap = packageMapById.get(connection.from);
  const toMap = packageMapById.get(connection.to);
  if (!fromMap || !toMap) continue;

  const forward = fromMap.exits.find((exit) => exit.target_map_id === connection.to);
  const backward = toMap.exits.find((exit) => exit.target_map_id === connection.from);
  if (!forward) addIssue("error", connection.from, "missing_forward_exit", `No exit to ${connection.to}`);
  if (!backward) addIssue("error", connection.to, "missing_backward_exit", `No exit to ${connection.from}`);

  if (forward?.target_spawn_id && !toMap.spawns.some((spawn) => spawn.id === forward.target_spawn_id)) {
    addIssue("error", connection.from, "forward_missing_spawn", `${connection.to}#${forward.target_spawn_id}`);
  }
  if (backward?.target_spawn_id && !fromMap.spawns.some((spawn) => spawn.id === backward.target_spawn_id)) {
    addIssue("error", connection.to, "backward_missing_spawn", `${connection.from}#${backward.target_spawn_id}`);
  }
}

for (const map of generatedMaps) {
  const activeCells = map.cells.filter((cell) => cell.active);
  const walkableCells = activeCells.filter((cell) => cell.walkable);
  const exitCells = new Set(map.exits.map((exit) => cellKey(exit.cell)));
  const spawnCells = new Set(map.spawns.map((spawn) => cellKey(spawn.cell)));
  if (activeCells.length === 0) addIssue("error", map.id, "empty_active_area", "Map has no active cells");
  if (walkableCells.length === 0) addIssue("error", map.id, "empty_walkable_area", "Map has no walkable cells");
  if (
    !(map.regions || []).some((region) =>
      String(region.display_name || "").includes(THREEFOLD_MARCH_GREYBOX_VERSION),
    )
  ) {
    addIssue("error", map.id, "stale_greybox_version", `Map is not marked ${THREEFOLD_MARCH_GREYBOX_VERSION}`);
  }
  for (const exitKey of exitCells) {
    if (!walkableCells.some((cell) => cellKey([cell.x, cell.z]) === exitKey)) {
      addIssue("error", map.id, "exit_not_walkable", exitKey);
    }
  }
  for (const spawnKey of spawnCells) {
    if (!walkableCells.some((cell) => cellKey([cell.x, cell.z]) === spawnKey)) {
      addIssue("error", map.id, "spawn_not_walkable", spawnKey);
    }
  }
}

const convening = packageMapById.get("map_march_convening");
if (!convening) {
  addIssue("error", "map_march_convening", "missing_basin", "Convening map missing");
} else {
  if (!convening.exits.some((exit) => exit.target_map_id === "map_march_under_convening")) {
    addIssue("error", convening.id, "missing_mandatory_descent", "No descent exit to the Under-Convening");
  }
  if (!convening.custom_object_placements.some((placement) => placement.object_id === "obj_stone_altar")) {
    addIssue("error", convening.id, "missing_stone_placeholder", "No Stone placeholder object");
  }
  if (!convening.custom_object_placements.some((placement) => placement.object_id === "obj_floor_hatch")) {
    addIssue("error", convening.id, "missing_descent_placeholder", "No descent hatch placeholder");
  }
}

for (const issue of issues) {
  console.log(`[${issue.severity}] ${issue.scope} ${issue.code}: ${issue.message}`);
}

const errorCount = issues.filter((issue) => issue.severity === "error").length;
const warningCount = issues.filter((issue) => issue.severity === "warning").length;
console.log(`Overworld audit complete: ${errorCount} error(s), ${warningCount} warning(s).`);

if (errorCount > 0) process.exit(1);
