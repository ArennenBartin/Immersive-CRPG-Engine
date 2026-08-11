import assert from "node:assert/strict";
import {
  applyBackroomsPackageBake,
  BACKROOMS_LEVEL0_ROOM_TAGS,
  BACKROOMS_LEVEL0_ROOM_TEMPLATES,
  BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  BackroomsEmbeddedMapSchema,
  LEVEL0_CMT_PHASE4_ANCHORS,
  createLevel0CmtBackroomsRecipe,
  generateBackroomsMap,
  planBackroomsPackageBake,
} from "../src/backroomsGen";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { generatedIdNamespace, hashMapOutput } from "../src/generation-facing";
import { GamePackageSchema, MapDataSchema, createEmptyGamePackage } from "../src/schema/game";
import { markMapManuallyModified } from "../src/generation-facing/mapContract";
import { macroCellKey } from "../src/dungeonGen/embedding/gridSearch";
import {
  BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  isBackroomsLevelZeroDamaskThinWallObjectId,
  isBackroomsLevelZeroThinWallObjectId,
  readBackroomsLevelZeroPartitionWall,
  readBackroomsLevelZeroThinWallFaceMask,
} from "../src/schema/presets";

console.log("backrooms phase 5: shared rotatable room-template kit");
const suggestedTags = new Set<string>(Object.values(BACKROOMS_LEVEL0_ROOM_TAGS));
const cellKey = (cell: readonly unknown[]) =>
  macroCellKey([Number(cell[0]), Number(cell[1])]);
assert.ok(BACKROOMS_LEVEL0_ROOM_TEMPLATES.length >= 7);
assert.ok(BACKROOMS_LEVEL0_ROOM_TEMPLATES.every((template) =>
  template.rotationModes.length === 4 &&
  template.connectionSockets.every((socket) => socket.width >= 3 && !socket.allowDoor)));
assert.ok(BACKROOMS_LEVEL0_ROOM_TEMPLATES.some((template) =>
  template.themeTags.some((tag) => suggestedTags.has(tag))));

console.log("backrooms phase 5: deterministic graph embedding and ordinary map bake");
const recipe = createLevel0CmtBackroomsRecipe("phase5-determinism");
const first = generateBackroomsMap({
  recipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  includePacing: false,
});
const repeated = generateBackroomsMap({
  recipe,
  requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS].reverse(),
  includePacing: false,
});
assert.equal(first.success, true, JSON.stringify(first.diagnostics));
assert.equal(repeated.success, true, JSON.stringify(repeated.diagnostics));
assert.ok(first.graph && first.embedded && first.map);
assert.deepEqual(first.graph, repeated.graph);
assert.deepEqual(first.embedded, repeated.embedded);
assert.deepEqual(first.map, repeated.map);
assert.equal(BackroomsEmbeddedMapSchema.safeParse(first.embedded).success, true);
assert.equal(MapDataSchema.safeParse(first.map).success, true);
assert.equal(first.map.generation?.generatorId, "backrooms");
assert.equal(first.map.generation?.outputHash, hashMapOutput(first.map));
assert.equal(first.map.generation?.manuallyModified, false);
assert.equal(first.map.generation?.canonicalResultHash, first.canonicalResultHash);
assert.equal("runtime_backrooms_map" in first.map, false, "bake must not create a runtime map subtype");

const namespace = `${generatedIdNamespace(first.map.id)}:`;
const generatedIds = [
  ...first.map.spawns.map((entry) => entry.id),
  ...first.map.custom_object_placements.map((entry) => entry.id),
  ...(first.map.generation_sockets ?? []).map((entry) => entry.id),
];
assert.ok(generatedIds.every((id) => id?.startsWith(namespace)));

console.log("backrooms phase 5: no room overlaps and every semantic edge realized");
const occupiedRoomCells = new Map<string, string>();
for (const room of first.embedded.rooms) {
  for (let z = room.bounds.z; z < room.bounds.z + room.bounds.depth; z += 1) {
    for (let x = room.bounds.x; x < room.bounds.x + room.bounds.width; x += 1) {
      const key = macroCellKey([x, z]);
      assert.equal(occupiedRoomCells.has(key), false, `${room.nodeId} overlaps ${occupiedRoomCells.get(key)} at ${key}`);
      occupiedRoomCells.set(key, room.nodeId);
    }
  }
}
assert.equal(first.embedded.rooms.length, first.graph.nodes.length);
assert.equal(first.embedded.connections.length, first.graph.edges.length);
assert.equal(first.embedded.corridors.length, first.graph.edges.length);
assert.deepEqual(
  first.embedded.connections.map((entry) => entry.edgeId).sort(),
  first.graph.edges.map((entry) => entry.id).sort(),
);
const allowedRoomCorridorCells = new Set(first.embedded.connections.flatMap((connection) => [
  cellKey(connection.fromCell),
  cellKey(connection.toCell),
]));
for (const corridor of first.embedded.corridors) {
  assert.equal(corridor.width, 3);
  const connection = first.embedded.connections.find((entry) => entry.corridorId === corridor.id)!;
  const corridorKeys = new Set(corridor.cells.map(cellKey));
  assert.ok(corridorKeys.has(cellKey(connection.fromCell)));
  assert.ok(corridorKeys.has(cellKey(connection.toCell)));
  for (const cell of corridor.cells) {
    const key = macroCellKey(cell);
    assert.ok(!occupiedRoomCells.has(key) || allowedRoomCorridorCells.has(key), `${corridor.id} cuts through room ${occupiedRoomCells.get(key)}`);
  }
}

console.log("backrooms phase 5: sealed corridors and restored thin-wall presentation");
const bakedCellsByKey = new Map(
  first.map.cells.map((cell) => [macroCellKey([cell.x, cell.z]), cell]),
);
const cardinalFaces = [
  { dx: 0, dz: -1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.north },
  { dx: 1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.east },
  { dx: 0, dz: 1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.south },
  { dx: -1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.west },
] as const;
for (const corridor of first.embedded.corridors) {
  for (const [x, z] of corridor.cells) {
    for (const { dx, dz } of cardinalFaces) {
      assert.ok(
        bakedCellsByKey.has(macroCellKey([x + dx, z + dz])),
        `${corridor.id} opens into void beside ${x},${z}`,
      );
    }
  }
}
const bakedWallCells = first.map.cells.filter((cell) =>
  !cell.walkable && cell.blocks_los);
assert.ok(bakedWallCells.length > 0);
assert.equal(
  bakedWallCells.some((cell) => cell.object_id === BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID),
  false,
  "base block walls must be converted to thin visible faces",
);
assert.ok(bakedWallCells.some((cell) =>
  isBackroomsLevelZeroThinWallObjectId(cell.object_id)));
assert.ok(bakedWallCells.some((cell) =>
  isBackroomsLevelZeroDamaskThinWallObjectId(cell.object_id)));
for (const wallCell of bakedWallCells) {
  if (!isBackroomsLevelZeroThinWallObjectId(wallCell.object_id)) continue;
  const expectedMask = cardinalFaces.reduce((mask, face) => {
    const neighbor = bakedCellsByKey.get(macroCellKey([
      wallCell.x + face.dx,
      wallCell.z + face.dz,
    ]));
    return neighbor?.walkable ? mask | face.bit : mask;
  }, 0);
  assert.equal(
    readBackroomsLevelZeroThinWallFaceMask(wallCell.object_id),
    expectedMask,
    `wall face mask is incorrect at ${wallCell.x},${wallCell.z}`,
  );
}
const partitionContracts = (first.map.fine_cell_overrides ?? [])
  .map((entry) => readBackroomsLevelZeroPartitionWall(entry.overrides.object_id))
  .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
assert.ok(partitionContracts.length > 0, "expected protruding thin-wall partitions");
assert.deepEqual(
  [...new Set(partitionContracts.map((entry) => entry.style))].sort(),
  [...BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES].sort(),
);
assert.deepEqual(
  [...new Set(partitionContracts.map((entry) => entry.finish))].sort(),
  ["aged", "damask"],
);

console.log("backrooms phase 5: ordinary validator, reachability, and package round-trip");
const basePackage = createEmptyGamePackage();
const packageWithMap = GamePackageSchema.parse({
  ...basePackage,
  metadata: {
    ...basePackage.metadata,
    start_map_id: first.map.id,
    start_spawn_id: first.map.spawns[0].id,
  },
  maps: [first.map],
});
const validation = validateOrdinaryMap(first.map, {
  package: packageWithMap,
  budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
});
assert.equal(
  validation.valid,
  true,
  JSON.stringify(validation.issues.filter((issue) => issue.severity === "error")),
);
assert.equal(validation.reachableRegions.unreachableCells, 0);
assert.equal(validation.reachableRegions.connectedComponents, 1);
const roundTripped = GamePackageSchema.parse(JSON.parse(JSON.stringify(packageWithMap)));
assert.deepEqual(roundTripped.maps[0], JSON.parse(JSON.stringify(first.map)));

console.log("backrooms phase 5: guarded package bake and manual-edit protection");
const addPlan = planBackroomsPackageBake(basePackage, [first.map]);
assert.equal(addPlan.collisions.length, 0);
const added = applyBackroomsPackageBake(addPlan, { policy: "replace" });
assert.equal(added.applied, true);
assert.ok(added.package.maps.some((map) => map.id === first.map!.id));

const manualMap = markMapManuallyModified(first.map);
const manualPackage = GamePackageSchema.parse({
  ...basePackage,
  maps: [...basePackage.maps, manualMap],
});
const protectedPlan = planBackroomsPackageBake(manualPackage, [first.map]);
assert.equal(protectedPlan.collisions.length, 1);
assert.equal(protectedPlan.collisions[0].manuallyModified, true);
const protectedResult = applyBackroomsPackageBake(protectedPlan, {
  policy: "replace",
  confirmReplace: true,
});
assert.equal(protectedResult.applied, false, "manual edits must require explicit acknowledgement");
const acknowledged = applyBackroomsPackageBake(protectedPlan, {
  policy: "replace",
  confirmReplace: true,
  acknowledgeManualEdits: true,
});
assert.equal(acknowledged.applied, true);
assert.equal(
  acknowledged.package.maps.find((map) => map.id === first.map!.id)?.generation?.manuallyModified,
  false,
);

console.log("backrooms phase 5: multi-seed spatial acceptance corpus");
for (let index = 0; index < 8; index += 1) {
  const seed = `backrooms-phase5-corpus-${String(index).padStart(2, "0")}`;
  const result = generateBackroomsMap({
    recipe: createLevel0CmtBackroomsRecipe(seed),
    requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
    includePacing: false,
  });
  assert.equal(result.success, true, `${seed}: ${JSON.stringify(result.diagnostics)}`);
  assert.ok(result.graph && result.embedded && result.map);
  assert.equal(result.embedded.rooms.length, result.graph.nodes.length);
  assert.equal(result.embedded.connections.length, result.graph.edges.length);
  assert.equal(result.embedded.corridors.length, result.graph.edges.length);
  const testPackage = GamePackageSchema.parse({
    ...basePackage,
    metadata: {
      ...basePackage.metadata,
      start_map_id: result.map.id,
      start_spawn_id: result.map.spawns[0].id,
    },
    maps: [result.map],
  });
  const report = validateOrdinaryMap(result.map, {
    package: testPackage,
    budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  });
  assert.equal(report.valid, true, `${seed}: ${JSON.stringify(report.issues.filter((issue) => issue.severity === "error"))}`);
  assert.equal(report.reachableRegions.unreachableCells, 0, `${seed}: unreachable authored floor cells`);
}

console.log("Backrooms Phase 5 embedding, ordinary map bake, and guarded package acceptance passed.");
