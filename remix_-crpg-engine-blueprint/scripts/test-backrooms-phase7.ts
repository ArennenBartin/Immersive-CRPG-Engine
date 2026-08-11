import assert from "node:assert/strict";

import {
  BACKROOMS_LEVEL0_TEMPLATE_IDS,
  BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  BACKROOMS_PHASE7_ANOMALY_ASSET_SPECS,
  BackroomsAnomalyDressingPlanSchema,
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
  createLevel0CmtBackroomsRecipe,
  dressBackroomsAnomalies,
  generateBackroomsMap,
  installLevel0CmtPhase6Content,
  shortestBackroomsPath,
} from "../src/backroomsGen";
import {
  BACKROOMS_ANOMALY_OBJECTS,
  BACKROOMS_BACKWARDS_DESK_OBJECT_ID,
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
  BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID,
  BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID,
  BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID,
  BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID,
  BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID,
  BACKROOMS_WRONG_CLOCK_OBJECT_ID,
  BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID,
} from "../src/data/backroomsAnomalyAssets";
import { macroCellKey } from "../src/dungeonGen/embedding/gridSearch";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
} from "../src/engine-core/gridCoordinates";
import {
  RuntimeMapGrid,
  isLargeAuthoredMap,
} from "../src/engine-core/runtimeMapGrid";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { stableContentHash } from "../src/generation-facing/stableHash";
import {
  GamePackageSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import { placementHasCollision } from "../src/utils/objectFootprint";

const inRange = (value: number, min: number, max: number) =>
  value >= min - Number.EPSILON && value <= max + Number.EPSILON;

console.log("backrooms phase 7: validated sparse-wrongness profile");
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.ordinary.min, 0.75);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.ordinary.max, 0.85);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.lowIntensity.min, 0.1);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.lowIntensity.max, 0.18);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.recursive.min, 0.03);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.recursive.max, 0.06);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.hero.max, 0.02);
assert.equal(LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.hero.min, 0.01);
const phase7ProfileObjectIds = new Set(
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.anomalies.flatMap((entry) => entry.assetIds),
);
const phase7AssetSpecById = new Map(
  BACKROOMS_PHASE7_ANOMALY_ASSET_SPECS.map((entry) => [entry.objectId, entry]),
);
for (const objectId of [
  BACKROOMS_WRONG_CLOCK_OBJECT_ID,
  BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID,
  BACKROOMS_BACKWARDS_DESK_OBJECT_ID,
  BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID,
  BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID,
  BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID,
  BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID,
  BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID,
]) {
  assert.ok(phase7ProfileObjectIds.has(objectId), `${objectId} is missing from the Phase 7 profile`);
}
assert.equal(BACKROOMS_PHASE7_ANOMALY_ASSET_SPECS.length, BACKROOMS_ANOMALY_OBJECTS.length);
assert.ok(BACKROOMS_ANOMALY_OBJECTS.every((object) =>
  object.model_kind === "asset" &&
  object.asset?.stats.triangles && object.asset.stats.triangles > 0 &&
  object.asset.stats.materials <= 4));
assert.equal(
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE.anomalyProfileId,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.id,
);

console.log("backrooms phase 7: exact seed replay and transform-bearing plan hash");
const recipe = createLevel0CmtBackroomsRecipe("phase7-determinism");
const first = generateBackroomsMap({
  recipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
});
const repeated = generateBackroomsMap({
  recipe,
  requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS].reverse(),
});
assert.equal(first.success, true, JSON.stringify(first.diagnostics));
assert.equal(repeated.success, true, JSON.stringify(repeated.diagnostics));
assert.ok(first.map && first.graph && first.embedded && first.pacing && first.anomalies);
assert.deepEqual(first.anomalies, repeated.anomalies);
assert.deepEqual(first.map, repeated.map);
assert.equal(BackroomsAnomalyDressingPlanSchema.safeParse(first.anomalies).success, true);
assert.equal(first.anomalies.rejections.length, 0);
assert.equal(
  first.diagnostics.filter((entry) => entry.code === "BRG_ANOMALY_PLACED").length,
  first.anomalies.placements.length,
);
assert.equal(
  first.diagnostics.some((entry) => entry.code === "BRG_ANOMALY_DRESSING_SUMMARY"),
  true,
);

const anomalyPlacementIds = new Set(
  first.anomalies.placements.flatMap((log) => log.placementIds),
);
const anomalyPlacements = first.map.custom_object_placements.filter((placement) =>
  placement.id ? anomalyPlacementIds.has(placement.id) : false);
assert.ok(anomalyPlacements.length > first.anomalies.placements.length);
assert.ok(anomalyPlacements.every((placement) => placement.collision_mode === "none"));
for (const log of first.anomalies.placements) {
  const loggedPlacements = anomalyPlacements.filter((placement) =>
    placement.id ? log.placementIds.includes(placement.id) : false);
  assert.equal(
    log.placementHash,
    stableContentHash(loggedPlacements),
    `${log.id} must hash complete placement transforms, not IDs alone`,
  );
}

assert.ok(inRange(
  first.anomalies.ratios.ordinary,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.ordinary.min,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.ordinary.max,
));
assert.ok(inRange(
  first.anomalies.ratios.lowIntensity,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.lowIntensity.min,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.lowIntensity.max,
));
assert.ok(inRange(
  first.anomalies.ratios.recursive,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.recursive.min,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density.recursive.max,
));
assert.ok(inRange(first.anomalies.ratios.hero, 0.01, 0.02));
assert.equal(first.anomalies.realizedCounts.hero, 1);

const protectedRooms = new Set([
  first.graph.startNodeId,
  first.graph.culminationNodeId,
  first.graph.transitionNodeId,
  ...first.graph.requiredAnchorNodeIds,
  ...first.pacing.protectedNodeIds,
  ...first.pacing.recurrence.map((entry) => entry.nodeId),
]);
assert.ok(first.anomalies.placements.every((log) => !protectedRooms.has(log.roomId)));
const sightlineRooms = new Set(first.embedded.rooms
  .filter((room) =>
    room.templateId === BACKROOMS_LEVEL0_TEMPLATE_IDS.longCorridor ||
    room.templateId === BACKROOMS_LEVEL0_TEMPLATE_IDS.storyReserved ||
    first.graph!.nodes.find((node) => node.id === room.nodeId)?.tags.some((tag) =>
      ["long_sightline", "parasite_reveal", "story_reserved"].includes(tag)))
  .map((room) => room.nodeId));
assert.ok(first.anomalies.placements.every((log) => !sightlineRooms.has(log.roomId)));

console.log("backrooms phase 7: clipped backing, recursive transforms, and safe runtime expansion");
const cellByKey = new Map(first.map.cells.map((cell) => [macroCellKey([cell.x, cell.z]), cell]));
const placementById = new Map(first.map.custom_object_placements.map((placement) => [placement.id, placement]));
const clippedLogs = first.anomalies.placements.filter((log) =>
  log.anomalyId === "anomaly.filing_cabinet.wall_clip");
assert.ok(clippedLogs.length > 0, "the deterministic proof seed needs a clipped module");
for (const log of clippedLogs) {
  const placement = placementById.get(log.placementIds[0])!;
  assert.equal(placement.object_id, BACKROOMS_WALL_CLIPPED_FILING_CABINET_OBJECT_ID);
  assert.equal(placement.collision_mode, "none");
  assert.ok(placement.plan_offset);
  const [offsetX, offsetZ] = placement.plan_offset;
  const penetration = Math.max(Math.abs(offsetX), Math.abs(offsetZ));
  assert.ok(inRange(penetration, 0.38, 0.52));
  assert.ok(penetration > 0.05, "clipped decor must penetrate instead of z-fighting");
  const towardWall: [number, number] = Math.abs(offsetX) >= Math.abs(offsetZ)
    ? [Math.sign(offsetX), 0]
    : [0, Math.sign(offsetZ)];
  const standing = cellByKey.get(macroCellKey([
    Math.round(placement.cell[0]),
    Math.round(placement.cell[1]),
  ]));
  const backing = cellByKey.get(macroCellKey([
    Math.round(placement.cell[0]) + towardWall[0],
    Math.round(placement.cell[1]) + towardWall[1],
  ]));
  assert.ok(standing?.walkable, "the visible cabinet half stands on room floor");
  assert.ok(
    backing?.walkable === false && backing.blocks_los === true,
    "every wall clip needs the map's opaque backing contract",
  );
}

const partitionBisectLogs = first.anomalies.placements.filter((log) =>
  log.anomalyId === "anomaly.desk.partition_bisect");
assert.ok(partitionBisectLogs.length > 0, "the proof seed needs a composite half-wall module");
for (const log of partitionBisectLogs) {
  const placement = placementById.get(log.placementIds[0])!;
  assert.equal(placement.object_id, BACKROOMS_HALF_WALL_BISECTED_DESK_OBJECT_ID);
  assert.equal(placement.collision_mode, "none");
  assert.equal(placement.plan_offset, undefined, "the composite module owns its true bisect geometry");
  assert.ok(cellByKey.get(macroCellKey([
    Math.round(placement.cell[0]),
    Math.round(placement.cell[1]),
  ]))?.walkable);
}

const wallInstallHeights = new Map([
  [BACKROOMS_WRONG_CLOCK_OBJECT_ID, 1.42],
  [BACKROOMS_VERTICAL_FLUORESCENT_OBJECT_ID, 0.92],
  [BACKROOMS_WRONG_EXIT_SIGN_OBJECT_ID, 1.72],
]);
for (const placement of anomalyPlacements) {
  const expectedHeight = wallInstallHeights.get(placement.object_id);
  if (expectedHeight !== undefined) assert.equal(placement.height_offset, expectedHeight);
}

const heroLogs = first.anomalies.placements.filter((log) => log.class === "hero");
assert.equal(heroLogs.length, 1);
assert.equal(heroLogs[0].objectId, BACKROOMS_IMPOSSIBLE_FILING_CABINET_OBJECT_ID);
assert.equal(placementById.get(heroLogs[0].placementIds[0])?.collision_mode, "none");

const recursiveLogs = first.anomalies.placements.filter((log) => log.kind === "recursive_chain");
assert.ok(recursiveLogs.length > 0);
for (const log of recursiveLogs) {
  const chain = log.placementIds.map((id) => placementById.get(id)!);
  assert.ok(chain.length >= 4 && chain.length <= 6);
  assert.ok(chain.every((placement) => placement.object_id === BACKROOMS_RECURSIVE_CHAIR_OBJECT_ID));
  assert.ok(chain.every((placement) => placement.collision_mode === "none"));
  for (let index = 1; index < chain.length; index += 1) {
    assert.ok(chain[index].scale![0] < chain[index - 1].scale![0]);
    assert.ok(chain[index].rotation_offset![1] > chain[index - 1].rotation_offset![1]);
  }
}

assert.equal(isLargeAuthoredMap(first.map), true);
const firstClip = placementById.get(clippedLogs[0].placementIds[0])!;
const runtimeWindow = new RuntimeMapGrid(first.map).materializeFineWindow(
  fineCenterOfMacro([
    Math.round(firstClip.cell[0]),
    Math.round(firstClip.cell[1]),
  ]),
  0,
);
const runtimeClip = runtimeWindow.custom_object_placements.find((placement) =>
  placement.id === firstClip.id)!;
assert.deepEqual(runtimeClip.plan_offset, [
  firstClip.plan_offset![0] * FINE_PER_MACRO,
  firstClip.plan_offset![1] * FINE_PER_MACRO,
]);
assert.deepEqual(runtimeClip.rotation_offset, firstClip.rotation_offset);

console.log("backrooms phase 7: package install, Phase 6 upgrade, and ordinary-map readiness");
let installed = installLevel0CmtPhase6Content(createEmptyGamePackage(), {
  mapId: first.map.id,
  recipe,
});
for (const object of BACKROOMS_ANOMALY_OBJECTS) {
  assert.ok(installed.object_library.some((candidate) => candidate.id === object.id));
}
assert.ok(installed.backrooms_anomaly_profiles.some((profile) =>
  profile.id === LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.id));
assert.equal(
  installed.backrooms_level_profiles.find((profile) =>
    profile.id === LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE.id)?.anomalyProfileId,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.id,
);
const installedAgain = installLevel0CmtPhase6Content(installed, {
  mapId: first.map.id,
  recipe,
});
assert.deepEqual(installedAgain, installed, "Phase 7 content install must be idempotent");

const { anomalyProfileId: _phase7ProfileId, ...legacyLevelProfile } =
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE;
const legacyPartialAnomalyProfile = {
  ...LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
  density: {
    ...LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.density,
    hero: { min: 0, max: 0.02 },
  },
  anomalies: [
    LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.anomalies.find((entry) =>
      entry.id === "anomaly.filing_cabinet.wall_clip")!,
    {
      ...LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.anomalies.find((entry) =>
        entry.id === "anomaly.desk.backwards")!,
      assetIds: [BACKROOMS_DESK_OBJECT_ID],
    },
    {
      ...LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.anomalies.find((entry) =>
        entry.id === "anomaly.chair.recursive_chain")!,
      id: "anomaly.desk.recursive_chain",
      assetIds: [BACKROOMS_DESK_OBJECT_ID],
    },
  ],
};
const legacyPackage = GamePackageSchema.parse({
  ...createEmptyGamePackage(),
  backrooms_level_profiles: [legacyLevelProfile],
  backrooms_anomaly_profiles: [legacyPartialAnomalyProfile],
});
const upgradedPackage = installLevel0CmtPhase6Content(legacyPackage, {
  mapId: first.map.id,
  recipe,
});
assert.equal(
  upgradedPackage.backrooms_level_profiles.find((profile) =>
    profile.id === LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE.id)?.anomalyProfileId,
  LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.id,
  "recognized untouched Phase 6 profiles must upgrade instead of throwing",
);
assert.equal(
  upgradedPackage.backrooms_anomaly_profiles.find((profile) =>
    profile.id === LEVEL0_CMT_PHASE7_ANOMALY_PROFILE.id)?.density.hero.min,
  0.01,
  "recognized partial Phase 7 profiles must upgrade to the complete hero-capable kit",
);

const legacyDesk = structuredClone(
  BACKROOMS_ANOMALY_OBJECTS.find((object) =>
    object.id === BACKROOMS_FILING_CABINET_OBJECT_ID)!,
);
legacyDesk.asset!.stats.bytes -= 1;
const legacyObjectPackage = GamePackageSchema.parse({
  ...createEmptyGamePackage(),
  object_library: [legacyDesk],
});
const upgradedObjectPackage = installLevel0CmtPhase6Content(legacyObjectPackage, {
  mapId: first.map.id,
});
assert.equal(
  upgradedObjectPackage.object_library.find((object) =>
    object.id === legacyDesk.id)?.asset?.stats.bytes,
  BACKROOMS_ANOMALY_OBJECTS.find((object) =>
    object.id === legacyDesk.id)?.asset?.stats.bytes,
  "recognized Phase 2 GLB metadata must upgrade instead of throwing",
);

installed = GamePackageSchema.parse({
  ...installed,
  metadata: {
    ...installed.metadata,
    start_map_id: first.map.id,
    start_spawn_id: first.map.spawns[0].id,
  },
  maps: [...installed.maps, first.map],
});
const validation = validateOrdinaryMap(first.map, {
  package: installed,
  budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
});
assert.equal(
  validation.valid,
  true,
  JSON.stringify(validation.issues.filter((issue) => issue.severity === "error")),
);
assert.equal(validation.reachableRegions.unreachableCells, 0);
const objectById = new Map(installed.object_library.map((object) => [object.id, object]));
assert.ok(anomalyPlacements.every((placement) =>
  !placementHasCollision(placement, objectById.get(placement.object_id))));
const installedRoundTrip = GamePackageSchema.parse(JSON.parse(JSON.stringify(installed)));
assert.deepEqual(
  installedRoundTrip.maps.find((map) => map.id === first.map!.id),
  JSON.parse(JSON.stringify(first.map)),
  "transform-bearing anomaly maps must survive an ordinary package round-trip",
);

console.log("backrooms phase 7: unsupported/invalid recipes fall back without topology damage");
const invalidFallback = dressBackroomsAnomalies({
  recipe,
  graph: first.graph,
  embedded: first.embedded,
  pacingPlan: first.pacing,
  profile: {
    ...LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
    maxAnomaliesPerMap: -1,
  } as typeof LEVEL0_CMT_PHASE7_ANOMALY_PROFILE,
  cells: cellByKey,
});
assert.deepEqual(invalidFallback.placements, []);
assert.equal(invalidFallback.plan, undefined);
assert.ok(invalidFallback.diagnostics.some((entry) =>
  entry.code === "BRG_ANOMALY_PROFILE_REJECTED"));

const exhaustedFallback = dressBackroomsAnomalies({
  recipe,
  graph: first.graph,
  embedded: first.embedded,
  pacingPlan: first.pacing,
  profile: {
    id: "anomalies.level0.exhausted",
    name: "Valid but unsupported floor-sink fallback",
    density: {
      ordinary: { min: 0.75, max: 0.85 },
      lowIntensity: { min: 0.15, max: 0.25 },
      recursive: { min: 0, max: 0 },
      hero: { min: 0, max: 0 },
    },
    neverAdjacentHero: true,
    maxAnomaliesPerMap: 16,
    anomalies: [{
      id: "anomaly.unsupported.floor_sink",
      class: "low_intensity",
      kind: "partial_embed",
      weight: 1,
      assetIds: [BACKROOMS_FILING_CABINET_OBJECT_ID],
      collisionPolicy: "none",
      requiredAnchor: "floor",
      minSpacingRooms: 0,
      partialEmbed: {
        anchor: "floor",
        mode: "floor_sink",
        penetrationRatio: { min: 0.1, max: 0.2 },
        rotationJitterDegrees: 0,
        collisionPolicy: "none",
        requireOpaqueBacking: false,
        keepClearanceCells: 1,
      },
    }],
  },
  cells: cellByKey,
});
assert.deepEqual(exhaustedFallback.placements, []);
assert.ok(exhaustedFallback.plan?.rejections.length);
assert.ok(exhaustedFallback.diagnostics.some((entry) =>
  entry.code === "BRG_ANOMALY_REJECTED"));

const salted = generateBackroomsMap({
  recipe: {
    ...recipe,
    stageSalts: { ...recipe.stageSalts, anomalies: "alternate-wrongness" },
  },
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
});
assert.equal(salted.success, true, JSON.stringify(salted.diagnostics));
assert.deepEqual(salted.graph, first.graph);
assert.deepEqual(salted.embedded, first.embedded);
assert.deepEqual(salted.pacing, first.pacing);
assert.notEqual(salted.anomalies?.canonicalHash, first.anomalies.canonicalHash);

console.log("backrooms phase 7: 32-seed density and zero-critical-blocker corpus");
const anomalyHashes = new Set<string>();
const corpusObjectIds = new Set<string>();
for (let index = 0; index < 32; index += 1) {
  const seed = `backrooms-phase7-corpus-${String(index).padStart(2, "0")}`;
  const result = generateBackroomsMap({
    recipe: createLevel0CmtBackroomsRecipe(seed),
    requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  });
  const replay = generateBackroomsMap({
    recipe: createLevel0CmtBackroomsRecipe(seed),
    requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS].reverse(),
  });
  assert.equal(result.success, true, `${seed}: ${JSON.stringify(result.diagnostics)}`);
  assert.ok(result.map && result.graph && result.pacing && result.anomalies);
  assert.deepEqual(replay.anomalies, result.anomalies, `${seed}: anomaly replay drifted`);
  assert.equal(result.anomalies.rejections.length, 0, `${seed}: safe anchors exhausted`);
  assert.ok(inRange(result.anomalies.ratios.ordinary, 0.75, 0.85));
  assert.ok(inRange(result.anomalies.ratios.lowIntensity, 0.1, 0.18));
  assert.ok(inRange(result.anomalies.ratios.recursive, 0.03, 0.06));
  assert.ok(inRange(result.anomalies.ratios.hero, 0, 0.02));
  assert.ok(inRange(result.anomalies.ratios.hero, 0.01, 0.02));
  anomalyHashes.add(result.anomalies.canonicalHash);

  const ids = new Set(result.anomalies.placements.flatMap((log) => log.placementIds));
  const generatedAnomalies = result.map.custom_object_placements.filter((placement) =>
    placement.id ? ids.has(placement.id) : false);
  generatedAnomalies.forEach((placement) => corpusObjectIds.add(placement.object_id));
  for (const placement of generatedAnomalies) {
    const spec = phase7AssetSpecById.get(placement.object_id);
    if (spec?.anchor === "wall") {
      assert.equal(
        placement.height_offset ?? 0,
        spec.heightOffset,
        `${seed}: ${placement.object_id} used the wrong wall installation height`,
      );
    }
  }
  assert.ok(generatedAnomalies.every((placement) => placement.collision_mode === "none"));
  const criticalRoomIds = new Set(shortestBackroomsPath(
    result.graph,
    result.graph.startNodeId,
    result.graph.transitionNodeId,
  ) ?? []);
  const resultCells = new Map(result.map.cells.map((cell) => [macroCellKey([cell.x, cell.z]), cell]));
  assert.ok(generatedAnomalies
    .filter((placement) => criticalRoomIds.has(
      resultCells.get(macroCellKey([
        Math.round(placement.cell[0]),
        Math.round(placement.cell[1]),
      ]))?.room_id ?? "",
    ))
    .every((placement) => placement.collision_mode === "none"),
  `${seed}: an anomaly blocks the critical route`);

  const seedValidation = validateOrdinaryMap(result.map, {
    package: installed,
    budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  });
  assert.equal(
    seedValidation.valid,
    true,
    `${seed}: ${JSON.stringify(seedValidation.issues.filter((issue) => issue.severity === "error"))}`,
  );
  assert.equal(
    seedValidation.reachableRegions.unreachableCells,
    0,
    `${seed}: anomaly dressing broke reachability`,
  );

  const heroRooms = result.anomalies.placements
    .filter((log) => log.class === "hero")
    .map((log) => log.roomId);
  for (let left = 0; left < heroRooms.length; left += 1) {
    for (let right = left + 1; right < heroRooms.length; right += 1) {
      const path = shortestBackroomsPath(result.graph, heroRooms[left], heroRooms[right]);
      assert.ok(!path || path.length - 1 >= 2, `${seed}: adjacent hero anomalies`);
    }
  }
}
assert.ok(anomalyHashes.size >= 28, `expected anomaly variety, received ${anomalyHashes.size}`);
for (const objectId of phase7ProfileObjectIds) {
  assert.ok(corpusObjectIds.has(objectId), `${objectId} never appeared in the 32-seed corpus`);
}

console.log("Backrooms Phase 7 deterministic anomaly dressing passed.");
