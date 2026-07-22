import assert from "node:assert/strict";
import { runDungeonGeneratorWorkerRequest } from "../src/components/dungeon/dungeonGeneratorWorkerCore";
import { evaluateDungeonQuality } from "../src/dungeonGen/quality";
import {
  createInstitutionalRuinRecipe,
  createInstitutionalRuinSingleMapRecipe,
  installInstitutionalRuinGeneratorContent,
} from "../src/dungeonGen/presets/institutionalRuin";
import { createEmptyGamePackage } from "../src/schema/game";

const generatedAt = "2026-07-19T12:00:00.000Z";
const gamePackage = installInstitutionalRuinGeneratorContent(createEmptyGamePackage());
const recipe = createInstitutionalRuinSingleMapRecipe("quality-worker-001");

console.log("dungeon worker: Draft runs in the shared deterministic worker core");
const draftProgress: string[] = [];
const draftResponse = runDungeonGeneratorWorkerRequest({
  type: "generate",
  stage: "draft",
  requestId: "draft-1",
  recipe,
  gamePackage,
  debug: true,
}, { onProgress: (progress) => draftProgress.push(progress.stage) });
assert.equal(draftResponse.stage, "draft");
assert.equal(draftResponse.result.success, true, JSON.stringify(draftResponse.result.diagnostics));
assert.ok(draftResponse.result.draft);
assert.deepEqual(draftProgress, ["topology"]);
const repeatedDraft = runDungeonGeneratorWorkerRequest({
  type: "generate",
  stage: "draft",
  requestId: "draft-2",
  recipe,
  gamePackage,
  debug: true,
});
assert.equal(repeatedDraft.stage, "draft");
assert.deepEqual(repeatedDraft.result, draftResponse.result);

console.log("dungeon worker: Geometry runs off the UI path without changing the frozen topology");
const draft = draftResponse.result.draft;
const geometryProgress: string[] = [];
let clock = 10;
const geometryResponse = runDungeonGeneratorWorkerRequest({
  type: "generate",
  stage: "geometry",
  requestId: "geometry-1",
  draft,
  gamePackage,
  generatedAt,
  debug: true,
}, {
  onProgress: (progress) => geometryProgress.push(progress.stage),
  now: () => { clock += 5; return clock; },
});
assert.equal(geometryResponse.stage, "geometry");
assert.equal(geometryResponse.result.success, true, JSON.stringify(geometryResponse.result.diagnostics));
assert.equal(geometryResponse.result.maps.length, 1);
assert.equal(geometryResponse.durationMs, 5);
assert.deepEqual(geometryProgress, ["geometry"]);
const repeatedGeometry = runDungeonGeneratorWorkerRequest({
  type: "generate",
  stage: "geometry",
  requestId: "geometry-2",
  draft,
  gamePackage,
  generatedAt,
  debug: true,
}, { now: (() => { let value = 0; return () => ++value; })() });
assert.equal(repeatedGeometry.stage, "geometry");
assert.equal(repeatedGeometry.result.outputHash, geometryResponse.result.outputHash);
assert.deepEqual(repeatedGeometry.result.maps, geometryResponse.result.maps);

console.log("dungeon worker: Full remains compatible and reports all deterministic stages");
const fullProgress: string[] = [];
const fullResponse = runDungeonGeneratorWorkerRequest({
  type: "generate",
  stage: "full",
  requestId: "full-1",
  recipe,
  gamePackage,
  generatedAt,
  debug: true,
}, { onProgress: (progress) => fullProgress.push(progress.stage) });
assert.equal(fullResponse.stage, "full");
assert.equal(fullResponse.result.success, true, JSON.stringify(fullResponse.result.diagnostics));
assert.equal(fullResponse.result.maps.length, 1);
assert.ok(fullProgress.includes("topology"));
assert.ok(fullProgress.includes("embedding"));
assert.ok(fullProgress.includes("population"));
assert.ok(fullProgress.includes("bake"));
assert.ok(fullProgress.includes("audit"));

console.log("dungeon quality: v2 exposes and enforces the complete Studio report");
const quality = evaluateDungeonQuality({ recipe, gamePackage, result: fullResponse.result });
assert.equal(quality.thresholdsEnforced, true);
assert.equal(quality.ready, true, JSON.stringify(quality.checks.filter((entry) => !entry.passed)));
assert.equal(quality.metrics.mapCount, 1);
assert.ok(quality.metrics.roomCount >= 16 && quality.metrics.roomCount <= 20);
assert.ok(quality.metrics.edgeCount >= quality.metrics.roomCount - 1);
assert.equal(quality.metrics.doorCount, 0);
assert.equal(quality.metrics.nonOpenEdgeCount, 0);
assert.equal(quality.metrics.exitCount, 0);
assert.equal(quality.metrics.transitionCount, 0);
assert.equal(quality.metrics.lanternCount, 1);
assert.ok(quality.metrics.lanternDistanceFromSpawn !== null && quality.metrics.lanternDistanceFromSpawn <= 2);
assert.ok(quality.metrics.entranceToCulminationPathLength !== null && quality.metrics.entranceToCulminationPathLength >= 30);
assert.ok(quality.metrics.maximumCorridorLength <= 28);
assert.ok(quality.metrics.loopLength > 0);
assert.ok(quality.metrics.silhouetteVariety >= 3);
assert.ok(quality.metrics.estimatedFineCellCount <= 15_000);
assert.ok(quality.metrics.minimumLandmarkSeparation !== null && quality.metrics.minimumLandmarkSeparation > 0);
assert.ok(Number.isInteger(quality.metrics.maximumCorridorTurns));
assert.ok(Number.isInteger(quality.metrics.actorCount));
assert.ok(Number.isInteger(quality.metrics.initialActiveChemistryCellCount));

console.log("dungeon quality: each v2 blocker is explicit while legacy metrics stay informational");
const missingLanternResult = structuredClone(fullResponse.result);
missingLanternResult.maps.forEach((map) => { map.item_placements = []; });
const missingLantern = evaluateDungeonQuality({ recipe, gamePackage, result: missingLanternResult });
assert.equal(missingLantern.ready, false);
assert.equal(missingLantern.checks.find((entry) => entry.code === "DNG_QUALITY_STARTING_LANTERN")?.passed, false);
const nonOpenResult = structuredClone(fullResponse.result);
assert.ok(nonOpenResult.graph);
nonOpenResult.graph.edges[0].kind = "door";
const nonOpen = evaluateDungeonQuality({ recipe, gamePackage, result: nonOpenResult });
assert.equal(nonOpen.ready, false);
assert.equal(nonOpen.checks.find((entry) => entry.code === "DNG_QUALITY_OPEN_CONNECTIONS")?.passed, false);
const legacyRecipe = createInstitutionalRuinRecipe("legacy-quality-info");
const legacyReport = evaluateDungeonQuality({ recipe: legacyRecipe, gamePackage, result: fullResponse.result });
assert.equal(legacyReport.thresholdsEnforced, false);
assert.equal(legacyReport.ready, true);
assert.deepEqual(legacyReport.checks, []);

console.log("dungeon quality: blocking failures reject headless generation, not only Studio bake");
const insufficientSilhouettes = createInstitutionalRuinSingleMapRecipe("quality-blocking-silhouettes");
insufficientSilhouettes.architecture.proceduralRoomBuilderPool = [{ id: "rectangular_room_v1", weight: 1 }];
insufficientSilhouettes.constraints.maxGenerationAttempts = 1;
const blockedGeneration = runDungeonGeneratorWorkerRequest({
  type: "generate",
  stage: "full",
  requestId: "quality-blocking-silhouettes",
  recipe: insufficientSilhouettes,
  gamePackage,
  generatedAt,
  debug: false,
});
assert.equal(blockedGeneration.stage, "full");
assert.equal(blockedGeneration.result.success, false);
assert.ok(blockedGeneration.result.diagnostics.some((entry) => entry.code === "DNG_QUALITY_SILHOUETTES"));
assert.equal(blockedGeneration.result.metrics.rejectionCodes.DNG_QUALITY_SILHOUETTES, 1);

console.log("dungeon quality: deterministic 32-seed v2 acceptance corpus");
for (let index = 0; index < 32; index += 1) {
  const seed = `quality-corpus-${String(index).padStart(2, "0")}`;
  const corpusRecipe = createInstitutionalRuinSingleMapRecipe(seed);
  const request = {
    type: "generate" as const,
    stage: "full" as const,
    requestId: `corpus-${index}`,
    recipe: corpusRecipe,
    gamePackage,
    generatedAt,
    debug: false,
  };
  const first = runDungeonGeneratorWorkerRequest(request);
  const repeated = runDungeonGeneratorWorkerRequest({ ...request, requestId: `corpus-repeat-${index}` });
  assert.equal(first.stage, "full");
  assert.equal(repeated.stage, "full");
  assert.equal(first.result.success, true, `${seed}: ${JSON.stringify(first.result.diagnostics)}`);
  assert.equal(repeated.result.success, true, `${seed} repeat: ${JSON.stringify(repeated.result.diagnostics)}`);
  assert.equal(repeated.result.canonicalResultHash, first.result.canonicalResultHash, `${seed}: canonical hash drifted`);
  const report = evaluateDungeonQuality({ recipe: corpusRecipe, gamePackage, result: first.result });
  assert.equal(report.ready, true, `${seed}: ${JSON.stringify(report.checks.filter((entry) => !entry.passed))}`);
  assert.equal(report.metrics.mapCount, 1, `${seed}: expected one map`);
  assert.equal(report.metrics.doorCount, 0, `${seed}: physical door leaked into the map`);
  assert.equal(report.metrics.nonOpenEdgeCount, 0, `${seed}: non-open graph edge leaked into v2`);
  assert.equal(report.metrics.exitCount, 0, `${seed}: generated dungeon should have no internal exits`);
  assert.equal(report.metrics.transitionCount, 0, `${seed}: vertical transition leaked into v2`);
  assert.equal(report.metrics.lanternCount, 1, `${seed}: expected one starting lantern`);
  assert.ok(report.metrics.lanternDistanceFromSpawn !== null && report.metrics.lanternDistanceFromSpawn <= 2,
    `${seed}: starting lantern is not adjacent to spawn`);
  assert.ok(report.metrics.minimumLandmarkSeparation !== null && report.metrics.minimumLandmarkSeparation > 0,
    `${seed}: landmark separation could not be measured`);
  const graph = first.result.graph;
  assert.ok(graph, `${seed}: missing graph`);
  const embedded = first.result.embedded;
  assert.ok(embedded, `${seed}: missing embedded geometry`);
  const entranceRoom = embedded.rooms.find((room) => room.nodeId === graph.entranceNodeId);
  const objectiveRoom = embedded.rooms.find((room) => room.nodeId === graph.objectiveNodeId);
  assert.ok(entranceRoom && objectiveRoom, `${seed}: missing entrance/objective room geometry`);
  const entranceCenterZ = entranceRoom.bounds.z + Math.floor(entranceRoom.bounds.depth / 2);
  const objectiveCenterZ = objectiveRoom.bounds.z + Math.floor(objectiveRoom.bounds.depth / 2);
  assert.ok(entranceCenterZ > objectiveCenterZ,
    `${seed}: directional crawl must place entrance south of culmination (${entranceCenterZ} <= ${objectiveCenterZ})`);
  const builderIds = new Set(embedded.rooms.flatMap((room) => room.builderId ? [room.builderId] : []));
  for (const requiredBuilder of ["rectangular_room_v1", "l_room_v1", "junction_room_v1"]) {
    assert.ok(builderIds.has(requiredBuilder), `${seed}: missing procedural silhouette ${requiredBuilder}`);
  }
  for (const room of embedded.rooms.filter((candidate) => Boolean(candidate.builderId))) {
    const map = first.result.maps.find((candidate) => candidate.id === room.mapId);
    assert.ok(map, `${seed}: missing baked map ${room.mapId}`);
    for (const socket of room.sockets) {
      const bakedCell = map.cells.find((cell) => cell.x === socket.cell[0] && cell.z === socket.cell[1]);
      assert.ok(bakedCell?.walkable, `${seed}: socket ${socket.id} is not baked onto a walkable cell`);
      assert.ok(bakedCell.room_id === room.nodeId || bakedCell.tag === "corridor",
        `${seed}: socket ${socket.id} does not belong to its room or attached corridor`);
    }
    if (room.builderId === "l_room_v1" || room.builderId === "junction_room_v1") {
      const bakedRoomFootprint = map.cells.filter((cell) => cell.walkable && cell.room_id === room.nodeId).length;
      assert.ok(bakedRoomFootprint < room.bounds.width * room.bounds.depth,
        `${seed}: ${room.builderId} collapsed to a full rectangle`);
    }
  }
  assert.ok(graph.metrics.branchCount >= 2 && graph.metrics.branchCount <= 3, `${seed}: branch count ${graph.metrics.branchCount}`);
  assert.equal(graph.metrics.loopCount, 1, `${seed}: expected one loop`);
  assert.equal(graph.gates.length, 0, `${seed}: gates are forbidden in the single-map preset`);
  assert.equal(graph.nodes.some((node) => node.archetypeId === "dng_arch_vertical_room"), false,
    `${seed}: vertical room archetype leaked into the single-map preset`);
  assert.equal(graph.nodes.some((node) => node.secret), false, `${seed}: secret node leaked into the single-map preset`);
  assert.equal(graph.edges.some((edge) => edge.kind === "secret" || edge.tags.includes("secret")), false,
    `${seed}: secret edge leaked into the single-map preset`);
  const earlyRoomIds = new Set(graph.nodes.filter((node) => node.mandatory)
    .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id))
    .slice(0, 3).map((node) => node.id));
  for (const map of first.result.maps) {
    assert.equal(map.item_placements.some((placement) => placement.item_id === "itm_practice_key"), false,
      `${seed}: generated practice-key placement leaked into the doorless dungeon`);
    const roomAtCell = new Map(map.cells.map((cell) => [`${cell.x}:${cell.z}`, cell.room_id]));
    for (const container of map.container_placements) {
      assert.equal(earlyRoomIds.has(roomAtCell.get(`${container.cell[0]}:${container.cell[1]}`) ?? ""), false,
        `${seed}: blocking container ${container.id} entered an early safe room`);
    }
    for (const placement of map.custom_object_placements) {
      const roomId = roomAtCell.get(`${placement.cell[0]}:${placement.cell[1]}`) ?? "";
      const definition = gamePackage.object_library.find((candidate) => candidate.id === placement.object_id);
      const blocksMovement = placement.collision_mode !== "none" && definition?.collision.profile !== "none";
      assert.equal(earlyRoomIds.has(roomId) && blocksMovement, false,
        `${seed}: blocking object ${placement.id} entered an early safe room`);
    }
    for (const placement of map.entity_placements) {
      assert.equal(earlyRoomIds.has(roomAtCell.get(`${placement.cell[0]}:${placement.cell[1]}`) ?? ""), false,
        `${seed}: entity ${placement.entity_id} entered an early safe room`);
    }
    for (const cell of map.cells.filter((candidate) => earlyRoomIds.has(candidate.room_id ?? ""))) {
      assert.equal(Boolean(cell.initial_chemistry), false,
        `${seed}: initial chemistry entered early safe room ${cell.room_id ?? "unknown"}`);
      assert.equal(Boolean(cell.hazard), false,
        `${seed}: hazard ${cell.hazard ?? "unknown"} entered early safe room ${cell.room_id ?? "unknown"}`);
    }
  }
}

console.log("Dungeon worker and quality-report tests passed.");
