import assert from "node:assert/strict";
import {
  validateOrdinaryMap,
  validationIssueCodes,
  type MapValidationOptions,
} from "../src/engine-core/mapReadinessValidator";
import type { MapData } from "../src/schema/game";
import {
  READINESS_DUNGEON_KEY_ITEM_ID,
  READINESS_DUNGEON_LOCKED_CONTAINER_ID,
  READINESS_DUNGEON_LOWER_MAP_ID,
  cloneReadinessDungeonMap,
  createReadinessDungeonPackage,
  readinessDungeonValidationOptions,
} from "./fixtures/readinessDungeonFixture";

const fixturePackage = createReadinessDungeonPackage();
const lowerBaseline = fixturePackage.maps.find((map) => map.id === READINESS_DUNGEON_LOWER_MAP_ID)!;

const optionsFor = (
  map: MapData,
  overrides: Partial<MapValidationOptions> = {},
): MapValidationOptions => ({
  ...readinessDungeonValidationOptions(fixturePackage, map.id),
  ...overrides,
});

const expectCodes = (
  name: string,
  map: unknown,
  expectedCodes: string[],
  options: MapValidationOptions = optionsFor(lowerBaseline),
) => {
  const report = validateOrdinaryMap(map, options);
  const codes = validationIssueCodes(report);
  for (const code of expectedCodes) {
    assert.ok(codes.has(code), `${name}: expected ${code}; got ${[...codes].join(", ") || "no issues"}`);
  }
  assert.equal(report.valid, false, `${name}: invalid variant must fail validation`);
  return report;
};

console.log("map validator: valid ordinary two-floor readiness fixture");
for (const map of fixturePackage.maps) {
  const report = validateOrdinaryMap(map, readinessDungeonValidationOptions(fixturePackage, map.id));
  assert.equal(
    report.valid,
    true,
    `${map.id} should be valid: ${report.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n")}`,
  );
  assert.equal(report.issues.length, 0, `${map.id} should have no warnings or errors`);
  assert.equal(report.metrics.fineCells, report.metrics.macroCells * 9);
  assert.equal(report.reachableRegions.unreachableCells, 0);
  assert.equal(report.reachableRegions.connectedComponents, 1);
  assert.ok(report.reachableRegions.regions.every((region) => region.reachable));
}
const lowerReport = validateOrdinaryMap(lowerBaseline, optionsFor(lowerBaseline));
assert.ok(lowerReport.progression?.unlockedContainerIds.includes(READINESS_DUNGEON_LOCKED_CONTAINER_ID));
assert.ok(lowerReport.progression?.availableItemIds.includes(READINESS_DUNGEON_KEY_ITEM_ID));
assert.equal(lowerReport.progression?.lockedDoors, 1);
assert.ok(lowerReport.progression?.unlockedDoorIds.includes("readiness_lower_locked_door"));

console.log("map validator: deliberate gameplay failures return stable issue codes");
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  Object.assign(map.cells.find((cell) => cell.x === 4 && cell.z === 1)!, {
    walkable: false,
    blocks_los: true,
    object_id: "readiness_wall",
    visual_height: 3.6,
  });
  expectCodes("blocked objective", map, ["REQUIRED_CELL_UNREACHABLE"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.item_placements = [];
  const cache = map.container_placements.find((entry) => entry.id === READINESS_DUNGEON_LOCKED_CONTAINER_ID)!;
  cache.items.push({ item_id: READINESS_DUNGEON_KEY_ITEM_ID, count: 1 });
  expectCodes("key behind own lock", map, ["PROGRESSION_KEY_BEHIND_LOCK"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.item_placements[0].cell = [3, 0];
  expectCodes("door key behind its own gate", map, [
    "PROGRESSION_KEY_BEHIND_LOCK",
    "PROGRESSION_REQUIRED_TARGET_BLOCKED",
  ]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  Object.assign(map.cells.find((cell) => cell.x === 5 && cell.z === 0)!, {
    walkable: false,
    blocks_los: true,
    object_id: "readiness_wall",
  });
  expectCodes("stair into wall", map, ["STAIR_LANDING_BLOCKED", "EXIT_UNREACHABLE"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  Object.assign(map.cells.find((cell) => cell.x === 1 && cell.z === 0)!, {
    walkable: false,
    blocks_los: true,
    object_id: "readiness_wall",
  });
  expectCodes("door without approach space", map, ["DOOR_APPROACH_BLOCKED"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  for (const [x, z] of [[3, 2], [5, 2], [4, 1]] as [number, number][]) {
    Object.assign(map.cells.find((cell) => cell.x === x && cell.z === z)!, {
      walkable: false,
      blocks_los: true,
      object_id: "readiness_wall",
      visual_height: 3.6,
    });
  }
  expectCodes("inaccessible container", map, ["CONTAINER_INACCESSIBLE"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.entity_placements[1].cell = [...map.entity_placements[0].cell];
  expectCodes("overlapping entity footprints", map, ["ENTITY_FOOTPRINT_OVERLAP"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  Object.assign(map.cells.find((cell) => cell.x === 1 && cell.z === 0)!, {
    surface_tag: "water",
    hazard: "electrified_flood",
  });
  expectCodes("lethal flooded and electrified critical route", map, ["HAZARD_CRITICAL_ROUTE_LETHAL"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  Object.assign(map.cells.find((cell) => cell.x === -5 && cell.z === 0)!, {
    surface_tag: "firehazard",
    hazard: "lethal_start_fire",
  });
  expectCodes("unsafe player start", map, ["HAZARD_SAFE_START_VIOLATION"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  const cache = map.container_placements.find((entry) => entry.id === READINESS_DUNGEON_LOCKED_CONTAINER_ID)!;
  cache.key_item_id = undefined;
  expectCodes("lock without key declaration", map, ["LOCK_KEY_MISSING"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.exits[0].target_map_id = "missing_floor";
  expectCodes("invalid exit target", map, ["EXIT_TARGET_MAP_MISSING"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.item_placements.push({
    ...structuredClone(map.item_placements[0]),
    item_id: "readiness_reward",
    cell: [-4, 1],
  });
  expectCodes("duplicate placement identity", map, ["PLACEMENT_ID_DUPLICATE"]);
}

console.log("map validator: structural, reference, connector, and budget coverage");
expectCodes("schema", { id: "bad_map" }, ["MAP_SCHEMA_INVALID"], {});
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.width = 0;
  expectCodes("illegal dimensions", map, ["MAP_DIMENSIONS_INVALID"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.cells[0].x = Number.POSITIVE_INFINITY;
  expectCodes("non-finite coordinate", map, ["MAP_NON_FINITE_NUMBER", "MAP_SCHEMA_INVALID"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.custom_object_placements.push({
    object_id: "readiness_chest",
    cell: [99, 99],
    facing: [0, 1],
  });
  expectCodes("out-of-bounds object", map, ["OBJECT_PLACEMENT_OUT_OF_BOUNDS"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.item_placements[0].item_id = "missing_item";
  expectCodes("missing item definition", map, ["ITEM_REFERENCE_MISSING"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.entity_placements[0].entity_id = "missing_entity";
  expectCodes("missing entity definition", map, ["ENTITY_REFERENCE_MISSING"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.custom_object_placements[0].object_id = "missing_door_object";
  expectCodes("missing object definition", map, ["OBJECT_REFERENCE_MISSING"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  map.cells.find((cell) => cell.x === -4 && cell.z === 0)!.portal_id = "orphan_portal";
  expectCodes("unmatched portal", map, ["CONNECTOR_ENDPOINT_MISSING"]);
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  const report = validateOrdinaryMap(
    map,
    optionsFor(map, { budgets: { macroCells: { soft: 50, hard: 100 } } }),
  );
  assert.ok(
    validationIssueCodes(report).has("PERFORMANCE_MACRO_CELLS_SOFT_LIMIT"),
    "soft performance target should emit its stable warning code",
  );
  assert.equal(report.valid, true, "soft budget warnings do not invalidate a map");
  assert.equal(report.issues.find((issue) => issue.code === "PERFORMANCE_MACRO_CELLS_SOFT_LIMIT")?.severity, "warning");
}
{
  const map = cloneReadinessDungeonMap(lowerBaseline);
  const report = expectCodes(
    "hard performance target",
    map,
    ["PERFORMANCE_MACRO_CELLS_HARD_LIMIT"],
    optionsFor(map, { budgets: { macroCells: { soft: 50, hard: 80 } } }),
  );
  assert.equal(report.issues.find((issue) => issue.code === "PERFORMANCE_MACRO_CELLS_HARD_LIMIT")?.severity, "error");
}

const allReports = fixturePackage.maps.map((map) =>
  validateOrdinaryMap(map, readinessDungeonValidationOptions(fixturePackage, map.id)),
);
for (const report of allReports) {
  for (const issue of report.issues) {
    assert.ok(issue.code.length > 0);
    assert.ok(issue.mapId.length > 0);
    assert.ok(issue.message.length > 0);
  }
}

console.log("map validator: all assertions passed");
