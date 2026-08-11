import assert from "node:assert/strict";

import {
  BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  BackroomsAnomalyDressingPlanSchema,
  BackroomsAnomalyProfileSchema,
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION,
  createLevel0CmtBackroomsRecipe,
  generateBackroomsMap,
  installLevel0CmtPhase6Content,
  planBackroomsWrongnessProgression,
  shortestBackroomsPath,
  type BackroomsMapGenerationResult,
  type BackroomsSemanticGraph,
} from "../src/backroomsGen";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { stableContentHash } from "../src/generation-facing/stableHash";
import {
  GamePackageSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import { placementHasCollision } from "../src/utils/objectFootprint";

const inRange = (value: number, min: number, max: number) =>
  value >= min - Number.EPSILON && value <= max + Number.EPSILON;

const mean = (values: readonly number[]) => {
  assert.ok(values.length > 0, "cannot average an empty progression sample");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const progressionTierRank = {
  early_safe: 0,
  low_intensity: 1,
  recursive: 2,
  hero: 3,
} as const;

const graphDistancesFromStart = (graph: BackroomsSemanticGraph) => {
  const neighbors = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    neighbors.get(edge.fromNodeId)?.push(edge.toNodeId);
    neighbors.get(edge.toNodeId)?.push(edge.fromNodeId);
  }
  const distances = new Map<string, number>([[graph.startNodeId, 0]]);
  const queue = [graph.startNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const roomId = queue[cursor];
    const nextDistance = distances.get(roomId)! + 1;
    for (const neighbor of neighbors.get(roomId) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }
  assert.equal(distances.size, graph.nodes.length, "progression graph must stay connected");
  return distances;
};

const requireCompleteResult = (result: BackroomsMapGenerationResult, label: string) => {
  assert.equal(result.success, true, `${label}: ${JSON.stringify(result.diagnostics)}`);
  if (!result.map || !result.graph || !result.embedded || !result.pacing || !result.anomalies) {
    throw new Error(`${label}: successful generation omitted a Phase 8 artifact`);
  }
  return {
    map: result.map,
    graph: result.graph,
    embedded: result.embedded,
    pacing: result.pacing,
    anomalies: result.anomalies,
  };
};

const assertProgressionContract = (
  result: BackroomsMapGenerationResult,
  label: string,
) => {
  const complete = requireCompleteResult(result, label);
  const { graph, anomalies } = complete;
  assert.equal(BackroomsAnomalyDressingPlanSchema.safeParse(anomalies).success, true);
  assert.ok(anomalies.progression, `${label}: progression summary is missing`);
  assert.equal(anomalies.progression.enabled, true);
  assert.equal(
    anomalies.progression.configHash,
    stableContentHash(LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION),
    `${label}: progression config hash drifted`,
  );

  const expectedDistances = graphDistancesFromStart(graph);
  assert.equal(anomalies.assignments.length, graph.nodes.length);
  assert.equal(
    anomalies.progression.maxGraphDistance,
    Math.max(...expectedDistances.values()),
    `${label}: maximum graph distance is not inspectable accurately`,
  );

  const tierCounts = {
    earlySafe: 0,
    lowIntensity: 0,
    recursive: 0,
    hero: 0,
  };
  const wrongnessValues: number[] = [];
  for (const assignment of anomalies.assignments) {
    const expectedDistance = expectedDistances.get(assignment.roomId);
    assert.notEqual(expectedDistance, undefined, `${label}: assignment references an unknown room`);
    assert.equal(
      assignment.graphDistanceFromStart,
      expectedDistance,
      `${label}: ${assignment.roomId} reports the wrong distance from start`,
    );
    assert.notEqual(assignment.wrongness, undefined);
    assert.ok(assignment.progressionTier);
    wrongnessValues.push(assignment.wrongness!);
    if (assignment.progressionTier === "early_safe") tierCounts.earlySafe += 1;
    if (assignment.progressionTier === "low_intensity") tierCounts.lowIntensity += 1;
    if (assignment.progressionTier === "recursive") tierCounts.recursive += 1;
    if (assignment.progressionTier === "hero") tierCounts.hero += 1;

    if (expectedDistance! <= LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.earlySafeThrough) {
      assert.equal(assignment.progressionTier, "early_safe");
      assert.equal(assignment.wrongness, 0);
      assert.equal(
        assignment.class,
        "ordinary",
        `${label}: the first ${LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.earlySafeThrough} steps must read as normal Level 0`,
      );
    }

    if (assignment.class !== "ordinary") {
      const requiredTier = assignment.class === "low_intensity"
        ? "low_intensity"
        : assignment.class;
      assert.ok(
        progressionTierRank[assignment.progressionTier!] >= progressionTierRank[requiredTier],
        `${label}: ${assignment.class} wrongness leaked into an earlier tier`,
      );
    }
  }
  assert.deepEqual(anomalies.progression.tierCounts, tierCounts);
  assert.ok(
    Math.abs(anomalies.progression.averageWrongness - mean(wrongnessValues)) < 1e-12,
    `${label}: average wrongness summary drifted`,
  );
  assert.equal(anomalies.progression.maximumWrongness, Math.max(...wrongnessValues));

  const startAssignment = anomalies.assignments.find((entry) =>
    entry.roomId === graph.startNodeId);
  assert.ok(startAssignment);
  assert.equal(startAssignment.class, "ordinary");
  assert.equal(startAssignment.progressionTier, "early_safe");
  assert.equal(startAssignment.graphDistanceFromStart, 0);

  const anomalousCount = anomalies.roomCount - anomalies.realizedCounts.ordinary;
  assert.ok(
    anomalies.realizedCounts.ordinary > anomalousCount,
    `${label}: ordinary rooms must remain a strict majority`,
  );
  assert.ok(
    anomalies.ratios.ordinary >= LEVEL0_CMT_PHASE8_ANOMALY_PROFILE.density.ordinary.min,
    `${label}: progressed wrongness stopped being sparse`,
  );
  assert.equal(
    anomalies.assignments.some((entry) =>
      entry.class === "hero" &&
      (entry.graphDistanceFromStart ?? 0) <=
        LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.earlySafeThrough),
    false,
    `${label}: a hero anomaly leaked into early traversal`,
  );

  const anomalousByClass = {
    lowIntensity: anomalies.assignments.filter((entry) => entry.class === "low_intensity"),
    recursive: anomalies.assignments.filter((entry) => entry.class === "recursive"),
    hero: anomalies.assignments.filter((entry) => entry.class === "hero"),
  };
  if (anomalousByClass.lowIntensity.length && anomalousByClass.recursive.length) {
    assert.ok(
      Math.min(...anomalousByClass.lowIntensity.map((entry) => entry.wrongness!)) <
        Math.min(...anomalousByClass.recursive.map((entry) => entry.wrongness!)),
      `${label}: recursive wrongness appeared before the low-intensity band`,
    );
  }
  if (anomalousByClass.recursive.length && anomalousByClass.hero.length) {
    assert.ok(
      Math.min(...anomalousByClass.recursive.map((entry) => entry.wrongness!)) <
        Math.min(...anomalousByClass.hero.map((entry) => entry.wrongness!)),
      `${label}: hero wrongness appeared before the recursive band`,
    );
  }
  return complete;
};

console.log("backrooms phase 8: deterministic progression and convincing opening");
assert.equal(LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.enabled, true);
assert.equal(LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.earlySafeThrough, 3);
assert.equal(LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.recursiveFrom, 10);
assert.equal(LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.heroFrom, 16);

const proofRecipe = createLevel0CmtBackroomsRecipe("backrooms-phase8-determinism");
const proofResult = generateBackroomsMap({
  recipe: proofRecipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
});
const replayResult = generateBackroomsMap({
  recipe: proofRecipe,
  requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS].reverse(),
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
});
const proof = assertProgressionContract(proofResult, "proof seed");
assert.deepEqual(replayResult.anomalies, proofResult.anomalies);
assert.deepEqual(replayResult.map, proofResult.map);
assert.equal(replayResult.canonicalResultHash, proofResult.canonicalResultHash);
assert.ok(proof.anomalies.realizedCounts.lowIntensity > 0);
assert.ok(proof.anomalies.realizedCounts.recursive > 0);
assert.ok(proof.anomalies.realizedCounts.hero > 0);

const proofLow = proof.anomalies.assignments.filter((entry) => entry.class === "low_intensity");
const proofRecursive = proof.anomalies.assignments.filter((entry) => entry.class === "recursive");
const proofHero = proof.anomalies.assignments.filter((entry) => entry.class === "hero");
assert.ok(
  Math.min(...proofLow.map((entry) => entry.graphDistanceFromStart!)) <
    Math.min(...proofRecursive.map((entry) => entry.graphDistanceFromStart!)),
  "low-intensity wrongness must precede recursive anomalies",
);
assert.ok(
  Math.min(...proofRecursive.map((entry) => entry.graphDistanceFromStart!)) <
    Math.min(...proofHero.map((entry) => entry.graphDistanceFromStart!)),
  "recursive wrongness must precede the rare hero rupture",
);

console.log("backrooms phase 8: authored zones and absolute early-safe precedence");
const proofDistances = graphDistancesFromStart(proof.graph);
const promotableRoom = proof.graph.nodes.find((node) => {
  const distance = proofDistances.get(node.id)!;
  return distance > LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.earlySafeThrough &&
    distance < LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.recursiveFrom &&
    !node.tags.includes("story_reserved");
});
const distantRoom = proof.graph.nodes.find((node) =>
  proofDistances.get(node.id)! >= LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.heroFrom);
assert.ok(promotableRoom && distantRoom);
const authoredGraph = structuredClone(proof.graph);
authoredGraph.nodes.find((node) => node.id === authoredGraph.startNodeId)!.tags.push("wrongness_hero");
authoredGraph.nodes.find((node) => node.id === promotableRoom.id)!.tags.push("wrongness_hero");
authoredGraph.nodes.find((node) => node.id === distantRoom.id)!.tags.push("story_reserved");
const authoredProgression = planBackroomsWrongnessProgression({
  graph: authoredGraph,
  progression: LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION,
});
assert.equal(authoredProgression.byRoomId.get(authoredGraph.startNodeId)?.progressionTier, "early_safe");
assert.equal(authoredProgression.byRoomId.get(promotableRoom.id)?.progressionTier, "hero");
assert.equal(authoredProgression.byRoomId.get(distantRoom.id)?.progressionTier, "early_safe");

console.log("backrooms phase 8: profile disable replays the Phase 7 distribution exactly");
const disabledProfile = BackroomsAnomalyProfileSchema.parse({
  ...LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  progression: {
    ...LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION,
    enabled: false,
  },
});
const disabledRecipe = createLevel0CmtBackroomsRecipe("backrooms-phase8-disabled");
const phase7Result = generateBackroomsMap({
  recipe: disabledRecipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  anomalyProfile: LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
});
const disabledResult = generateBackroomsMap({
  recipe: disabledRecipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  anomalyProfile: disabledProfile,
});
const phase7 = requireCompleteResult(phase7Result, "Phase 7 replay");
const disabled = requireCompleteResult(disabledResult, "disabled Phase 8 replay");
assert.deepEqual(disabled.anomalies, phase7.anomalies);
assert.equal(disabled.anomalies.progression, undefined);
assert.deepEqual(disabled.map.cells, phase7.map.cells);
assert.deepEqual(disabled.map.custom_object_placements, phase7.map.custom_object_placements);
assert.ok(inRange(disabled.anomalies.ratios.ordinary, 0.75, 0.85));
assert.ok(inRange(disabled.anomalies.ratios.lowIntensity, 0.1, 0.18));
assert.ok(inRange(disabled.anomalies.ratios.recursive, 0.03, 0.06));
assert.ok(inRange(disabled.anomalies.ratios.hero, 0.01, 0.02));

console.log("backrooms phase 8: canonical profile migration and package/map round-trip");
const legacyPackage = GamePackageSchema.parse({
  ...createEmptyGamePackage(),
  backrooms_anomaly_profiles: [LEVEL0_CMT_PHASE7_ANOMALY_PROFILE],
});
const migratedPackage = installLevel0CmtPhase6Content(legacyPackage, {
  mapId: proof.map.id,
  recipe: proofRecipe,
});
assert.deepEqual(
  migratedPackage.backrooms_anomaly_profiles.find((profile) =>
    profile.id === LEVEL0_CMT_PHASE8_ANOMALY_PROFILE.id),
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
);
assert.deepEqual(
  installLevel0CmtPhase6Content(migratedPackage, {
    mapId: proof.map.id,
    recipe: proofRecipe,
  }),
  migratedPackage,
  "Phase 8 content installation must be idempotent",
);

const disabledLegacyPackage = GamePackageSchema.parse({
  ...createEmptyGamePackage(),
  backrooms_anomaly_profiles: [disabledProfile],
});
assert.deepEqual(
  installLevel0CmtPhase6Content(disabledLegacyPackage, {
    mapId: proof.map.id,
    recipe: proofRecipe,
  }).backrooms_anomaly_profiles.find((profile) =>
    profile.id === LEVEL0_CMT_PHASE8_ANOMALY_PROFILE.id),
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  "the canonical default-disabled profile must migrate narrowly",
);

const conflictingProfile = BackroomsAnomalyProfileSchema.parse({
  ...LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  progression: {
    ...LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION,
    recursiveFrom: LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION.recursiveFrom + 1,
  },
});
const conflictingPackage = GamePackageSchema.parse({
  ...createEmptyGamePackage(),
  backrooms_anomaly_profiles: [conflictingProfile],
});
assert.throws(
  () => installLevel0CmtPhase6Content(conflictingPackage, {
    mapId: proof.map.id,
    recipe: proofRecipe,
  }),
  /already belongs to different authored content/,
  "a custom same-ID profile must never be overwritten as a migration",
);

const installedPackage = GamePackageSchema.parse({
  ...migratedPackage,
  metadata: {
    ...migratedPackage.metadata,
    start_map_id: proof.map.id,
    start_spawn_id: proof.map.spawns[0].id,
  },
  maps: [...migratedPackage.maps, proof.map],
});
const roundTrippedPackage = GamePackageSchema.parse(
  JSON.parse(JSON.stringify(installedPackage)),
);
assert.deepEqual(
  roundTrippedPackage.maps.find((map) => map.id === proof.map.id),
  JSON.parse(JSON.stringify(proof.map)),
  "the progressed map must survive an ordinary package round-trip",
);
assert.deepEqual(
  roundTrippedPackage.backrooms_anomaly_profiles.find((profile) =>
    profile.id === LEVEL0_CMT_PHASE8_ANOMALY_PROFILE.id)?.progression,
  LEVEL0_CMT_PHASE8_WRONGNESS_PROGRESSION,
  "progression authoring data must survive package serialization",
);

console.log("backrooms phase 8: 32-seed sparse growth and zero-critical-blocker corpus");
const objectById = new Map(installedPackage.object_library.map((object) => [object.id, object]));
const corpusDistances = {
  lowIntensity: [] as number[],
  recursive: [] as number[],
  hero: [] as number[],
};
const corpusWrongness = {
  lowIntensity: [] as number[],
  recursive: [] as number[],
  hero: [] as number[],
};
let corpusOrdinaryRooms = 0;
let corpusAnomalousRooms = 0;
for (let index = 0; index < 32; index += 1) {
  const seed = `backrooms-phase8-corpus-${String(index).padStart(2, "0")}`;
  const result = generateBackroomsMap({
    recipe: createLevel0CmtBackroomsRecipe(seed),
    requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
    anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  });
  const complete = assertProgressionContract(result, seed);
  corpusOrdinaryRooms += complete.anomalies.realizedCounts.ordinary;
  corpusAnomalousRooms += complete.anomalies.roomCount -
    complete.anomalies.realizedCounts.ordinary;

  for (const assignment of complete.anomalies.assignments) {
    if (assignment.class === "ordinary") continue;
    corpusDistances[assignment.class === "low_intensity" ? "lowIntensity" : assignment.class]
      .push(assignment.graphDistanceFromStart!);
    corpusWrongness[assignment.class === "low_intensity" ? "lowIntensity" : assignment.class]
      .push(assignment.wrongness!);
  }

  const placementById = new Map(complete.map.custom_object_placements.map((placement) =>
    [placement.id, placement]));
  const criticalRooms = new Set(shortestBackroomsPath(
    complete.graph,
    complete.graph.startNodeId,
    complete.graph.transitionNodeId,
  ) ?? []);
  for (const log of complete.anomalies.placements) {
    for (const placementId of log.placementIds) {
      const placement = placementById.get(placementId);
      assert.ok(placement, `${seed}: missing baked anomaly placement ${placementId}`);
      assert.equal(
        placementHasCollision(placement, objectById.get(placement.object_id)),
        false,
        `${seed}: ${placementId} became a critical blocker`,
      );
      if (criticalRooms.has(log.roomId)) {
        assert.equal(placement.collision_mode, "none", `${seed}: critical-route anomaly blocks traversal`);
      }
    }
  }

  assert.ok(shortestBackroomsPath(
    complete.graph,
    complete.graph.startNodeId,
    complete.graph.transitionNodeId,
  ));
  for (const anchorRoomId of complete.graph.requiredAnchorNodeIds) {
    assert.ok(
      shortestBackroomsPath(complete.graph, complete.graph.startNodeId, anchorRoomId),
      `${seed}: required anchor ${anchorRoomId} became unreachable`,
    );
  }
  const readiness = validateOrdinaryMap(complete.map, {
    package: installedPackage,
    budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  });
  assert.equal(
    readiness.valid,
    true,
    `${seed}: ${JSON.stringify(readiness.issues.filter((issue) => issue.severity === "error"))}`,
  );
  assert.equal(
    readiness.reachableRegions.unreachableCells,
    0,
    `${seed}: wrongness progression damaged map reachability`,
  );
}

assert.ok(corpusOrdinaryRooms > corpusAnomalousRooms, "ordinary rooms must dominate the corpus");
assert.ok(corpusDistances.lowIntensity.length > corpusDistances.recursive.length);
assert.ok(corpusDistances.recursive.length >= corpusDistances.hero.length);
assert.ok(corpusDistances.hero.length > 0);
assert.ok(
  Math.min(...corpusDistances.lowIntensity) < Math.min(...corpusDistances.recursive) &&
    Math.min(...corpusDistances.recursive) < Math.min(...corpusDistances.hero),
  "wrongness intensity must visibly grow with distance",
);
assert.ok(
  Math.min(...corpusWrongness.lowIntensity) < Math.min(...corpusWrongness.recursive) &&
    Math.min(...corpusWrongness.recursive) < Math.min(...corpusWrongness.hero),
  "low-intensity, recursive, and hero bands must remain ordered",
);

console.log("Backrooms Phase 8 controlled wrongness progression passed.");
