import assert from "node:assert/strict";

import {
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  advanceBackroomsRuntimeObservation,
  backroomsRoomIdAtFineCell,
  collectBackroomsPortalEndpoints,
  createLevel0CmtBackroomsRecipe,
  generateBackroomsMap,
  leaveBackroomsRuntimeLevel,
  reachableBackroomsNodes,
  resolveBackroomsPortalTraversal,
} from "../src/backroomsGen";
import { fineCenterOfMacro } from "../src/engine-core/gridCoordinates";
import {
  GamePackageSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";
import {
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";

const generated = generateBackroomsMap({
  recipe: createLevel0CmtBackroomsRecipe("backrooms-phase9-persistence"),
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
});
assert.equal(generated.success, true, JSON.stringify(generated.diagnostics));
assert.ok(generated.map && generated.graph && generated.pacing);
const map = generated.map;
const graph = generated.graph;

const makeSave = (): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: "phase9-test",
  current_map_id: map.id,
  player: {
    cell: [map.spawns[0].cell[0], map.spawns[0].cell[1]],
    facing: [0, 1],
  },
  playerStats: {
    hp: 20,
    max_hp: 20,
    mp: 10,
    max_mp: 10,
    attack: 5,
    defense: 2,
    speed: 10,
    energy: 1000,
  },
  level: 1,
  experience: 0,
  pending_level_ups: 0,
  known_skills: [],
  flags: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 8 * 60,
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
});

console.log("backrooms phase 9: immutable backbone and authored deceptive thresholds");
const mutableEdges = graph.edges.filter((edge) => edge.mutableCandidate);
const endpoints = collectBackroomsPortalEndpoints(map);
assert.ok(mutableEdges.length >= 2, "proof seed needs at least two shiftable loops");
assert.equal(endpoints.length, mutableEdges.length * 2);
for (const edge of graph.edges) {
  const edgeEndpoints = endpoints.filter((endpoint) => endpoint.edgeId === edge.id);
  assert.equal(
    edgeEndpoints.length,
    edge.mutableCandidate ? 2 : 0,
    `${edge.id} received the wrong number of threshold endpoints`,
  );
  if (edge.mutableCandidate) {
    assert.equal(edge.immutable, false);
    assert.ok(edge.tags.includes("deceptive_candidate"));
  }
}
const immutableEdges = graph.edges.filter((edge) => edge.immutable);
const immutableReach = reachableBackroomsNodes(
  graph,
  graph.startNodeId,
  immutableEdges,
);
assert.ok(graph.requiredAnchorNodeIds.every((roomId) => immutableReach.has(roomId)));
assert.ok(immutableReach.has(graph.transitionNodeId));

const byPortal = new Map<string, typeof endpoints>();
for (const endpoint of endpoints) {
  const group = byPortal.get(endpoint.portalId) || [];
  group.push(endpoint);
  byPortal.set(endpoint.portalId, group);
}
assert.ok([...byPortal.values()].every((group) => group.length === 2));

const emptyPackage = createEmptyGamePackage();
const packageRoundTrip = GamePackageSchema.parse(JSON.parse(JSON.stringify({
  ...emptyPackage,
  metadata: {
    ...emptyPackage.metadata,
    start_map_id: map.id,
    start_spawn_id: map.spawns[0].id,
  },
  maps: [map],
})));
assert.equal(
  collectBackroomsPortalEndpoints(packageRoundTrip.maps[0]).length,
  endpoints.length,
  "ordinary package round-trip lost Phase 9 threshold cells",
);

// Portal detection is part of continuous movement. The first lookup may build
// its authored index; every ordinary step after that must avoid touching the
// 13k-cell source array and must preserve the exact save reference.
let authoredCellReads = 0;
const measuredCells = new Proxy(map.cells, {
  get(target, property, receiver) {
    if (property === "length" || typeof property === "string" && /^\d+$/.test(property)) {
      authoredCellReads += 1;
    }
    return Reflect.get(target, property, receiver);
  },
});
const measuredMap = { ...map, cells: measuredCells };
const ordinaryMacro = map.cells.find((cell) => cell.walkable && !cell.portal_id)!;
const ordinaryFine = fineCenterOfMacro([ordinaryMacro.x, ordinaryMacro.z]);
const ordinarySave = makeSave();
resolveBackroomsPortalTraversal(ordinarySave, measuredMap, ordinaryFine);
assert.ok(authoredCellReads > 0, "cold portal lookup did not build its index");
authoredCellReads = 0;
for (let step = 0; step < 1_000; step += 1) {
  assert.equal(
    resolveBackroomsPortalTraversal(ordinarySave, measuredMap, ordinaryFine).save,
    ordinarySave,
  );
}
assert.equal(authoredCellReads, 0, "warm movement rescanned authored cells");

console.log("backrooms phase 9: observation pins and deterministic peripheral shift");
const roomSequence = graph.nodes
  .map((node) => node.id)
  .filter((roomId) => roomId !== graph.startNodeId);
const allEndpointRooms = [...new Set(endpoints.map((endpoint) => endpoint.roomId))];

let pinnedSave = makeSave();
const pinnedInitial = advanceBackroomsRuntimeObservation(
  pinnedSave,
  map,
  { currentRoomId: graph.startNodeId, visibleRoomIds: allEndpointRooms },
);
pinnedSave = pinnedInitial.save;
const initialTargets = structuredClone(pinnedSave.backrooms_runtime!.portalTargets);
for (const roomId of roomSequence.slice(0, 2)) {
  const advanced = advanceBackroomsRuntimeObservation(
    pinnedSave,
    map,
    { currentRoomId: roomId, visibleRoomIds: allEndpointRooms },
  );
  assert.equal(advanced.shift, undefined);
  pinnedSave = advanced.save;
}
assert.deepEqual(pinnedSave.backrooms_runtime!.portalTargets, initialTargets);

const driveUntilShift = (seedSave: PlaySave) => {
  let working = seedSave;
  let shift: NonNullable<ReturnType<typeof advanceBackroomsRuntimeObservation>["shift"]> | undefined;
  for (const roomId of roomSequence) {
    const advanced = advanceBackroomsRuntimeObservation(
      working,
      map,
      { currentRoomId: roomId, visibleRoomIds: [roomId] },
    );
    working = advanced.save;
    if (advanced.shift) {
      shift = advanced.shift;
      break;
    }
  }
  assert.ok(shift, "proof traversal never produced a remote optional-edge shift");
  return { save: working, shift };
};

const firstShift = driveUntilShift(makeSave());
const replayShift = driveUntilShift(makeSave());
assert.deepEqual(replayShift, firstShift, "same seed + observations must replay exactly");
assert.equal(firstShift.save.backrooms_runtime!.observedShiftViolationCount, 0);
const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
for (const endpointId of firstShift.shift!.endpointIds) {
  const endpoint = endpointById.get(endpointId);
  assert.ok(endpoint);
  assert.equal(
    firstShift.shift!.pinnedRoomIds.includes(endpoint.roomId),
    false,
    "a visible or recent room shifted",
  );
}
assert.notDeepEqual(firstShift.save.backrooms_runtime!.portalTargets, initialTargets);
const leftLevel = leaveBackroomsRuntimeLevel(firstShift.save);
assert.equal(leftLevel.backrooms_runtime?.currentLevelId, undefined);
const returnedLevel = advanceBackroomsRuntimeObservation(
  leftLevel,
  map,
  { currentRoomId: graph.startNodeId, visibleRoomIds: [graph.startNodeId] },
).save;
assert.equal(returnedLevel.backrooms_runtime?.levelVisits[map.id], 2);

console.log("backrooms phase 9: recurrence memory, portal traversal, and save/load");
const recurrenceSocket = map.generation_sockets?.find((socket) =>
  socket.tags.includes("recurrence") &&
  socket.tags.some((tag) => tag.startsWith("motif:")));
assert.ok(recurrenceSocket?.node_id);
const motifId = recurrenceSocket.tags
  .find((tag) => tag.startsWith("motif:"))!
  .slice("motif:".length);
const motifStage = Number(
  recurrenceSocket.tags
    .find((tag) => tag.startsWith("motif_stage:"))!
    .slice("motif_stage:".length),
);
const motifAdvance = advanceBackroomsRuntimeObservation(
  firstShift.save,
  map,
  {
    currentRoomId: recurrenceSocket.node_id,
    visibleRoomIds: [recurrenceSocket.node_id],
  },
);
const motifRecord = motifAdvance.save.backrooms_runtime!.motifs[motifId];
assert.equal(motifRecord.seenCount, 1);
assert.equal(motifRecord.mutationStage, motifStage);
assert.equal(motifRecord.lastRoomId, recurrenceSocket.node_id);
const motifRepeat = advanceBackroomsRuntimeObservation(
  motifAdvance.save,
  map,
  {
    currentRoomId: recurrenceSocket.node_id,
    visibleRoomIds: [recurrenceSocket.node_id],
  },
);
assert.equal(motifRepeat.save.backrooms_runtime!.motifs[motifId].seenCount, 1);
assert.equal(
  motifRepeat.save,
  motifAdvance.save,
  "an unchanged room observation should preserve the save reference",
);

const source = endpoints[0];
const targetId = motifRepeat.save.backrooms_runtime!.portalTargets[source.id];
const target = endpointById.get(targetId);
assert.ok(target);
const sourceFine = fineCenterOfMacro(source.cell);
const traversal = resolveBackroomsPortalTraversal(
  {
    ...motifRepeat.save,
    player: {
      ...motifRepeat.save.player,
      cell: [sourceFine[0], sourceFine[1]],
      fine_position: [sourceFine[0], sourceFine[1]],
    },
  },
  map,
  [sourceFine[0], sourceFine[1]],
);
assert.equal(traversal.traversed, true);
assert.equal(traversal.targetEndpointId, target.id);
assert.ok(traversal.destinationCell);
assert.equal(
  backroomsRoomIdAtFineCell(map, traversal.destinationCell!),
  target.roomId,
);
assert.deepEqual(
  traversal.save.backrooms_runtime!.recentPortalEndpointIds[map.id].slice(0, 2),
  [source.id, target.id],
);
const latched = resolveBackroomsPortalTraversal(
  traversal.save,
  map,
  [sourceFine[0], sourceFine[1]],
);
assert.equal(latched.traversed, false, "one threshold entry may fire only once");
const latchCleared = resolveBackroomsPortalTraversal(
  traversal.save,
  map,
  traversal.destinationCell!,
);
assert.equal(latchCleared.save.backrooms_runtime?.portalTraversalLatch, undefined);

const restored = unwrapPlaySaveV1(normalizePlaySaveToV2(
  JSON.parse(JSON.stringify(latchCleared.save)),
));
assert.deepEqual(restored.backrooms_runtime, latchCleared.save.backrooms_runtime);
assert.equal(restored.backrooms_runtime?.observedShiftViolationCount, 0);
assert.deepEqual(restored.backrooms_runtime?.portalTargets, latchCleared.save.backrooms_runtime?.portalTargets);
assert.deepEqual(restored.backrooms_runtime?.motifs, latchCleared.save.backrooms_runtime?.motifs);

console.log("Backrooms Phase 9 persistent recurrence and safe peripheral shift passed.");
