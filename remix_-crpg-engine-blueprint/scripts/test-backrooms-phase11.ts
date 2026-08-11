import assert from "node:assert/strict";

import {
  BACKROOMS_STAGE_IDS,
  BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
  LEVEL0_CMT_PHASE4_ANCHORS,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  applyBackroomsPackageBake,
  buildBackroomsStudioReport,
  createLevel0CmtBackroomsRecipe,
  generateBackroomsMap,
  installLevel0CmtPhase6Content,
  planBackroomsPackageBake,
} from "../src/backroomsGen";
import {
  LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE,
} from "../src/backroomsGen/presets/level1Cmt";
import {
  GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP,
  GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE,
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP,
  GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
  generatedBackroomsPhase6Wing,
  installGeneratedBackroomsPhase6Preview,
} from "../src/data/qaSuite/generatedBackroomsPhase6Wing";
import { withTestingMapSuite } from "../src/data/testingMapSuite";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { stableContentHash } from "../src/generation-facing/stableHash";
import {
  GamePackageSchema,
  createEmptyGamePackage,
} from "../src/schema/game";

console.log("backrooms phase 11: Level 0-only bundled demo boundary");
assert.deepEqual(
  generatedBackroomsPhase6Wing.maps.map((map) => map.id),
  [GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP.id],
);
assert.equal(
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP.exits.some((exit) =>
    exit.target_map_id === GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.id),
  false,
  "the bundled Level 0 demo must not expose a Level 1 exit",
);

const level0OnlyContent = installLevel0CmtPhase6Content(createEmptyGamePackage(), {
  mapId: GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP.id,
  recipe: GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
});
assert.equal(
  level0OnlyContent.backrooms_level_profiles.some((profile) =>
    profile.id === LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE.id),
  false,
);
assert.equal(level0OnlyContent.backrooms_transition_rules.length, 0);
assert.equal(level0OnlyContent.transition_presentation_profiles.length, 0);

const authoredCrossLevelContent = installLevel0CmtPhase6Content(
  createEmptyGamePackage(),
  {
    mapId: GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP.id,
    recipe: GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
    includeCrossLevelContent: true,
  },
);
assert.equal(
  authoredCrossLevelContent.backrooms_level_profiles.some((profile) =>
    profile.id === LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE.id),
  true,
  "generic cross-level authoring support must remain available",
);
assert.equal(authoredCrossLevelContent.backrooms_transition_rules.length, 2);
assert.equal(authoredCrossLevelContent.transition_presentation_profiles.length, 2);

const freshSuite = withTestingMapSuite(createEmptyGamePackage());
assert.equal(
  freshSuite.maps.some((map) =>
    map.generation?.levelProfileId === LEVEL1_CMT_BACKROOMS_LEVEL_PROFILE.id),
  false,
);
assert.equal(
  freshSuite.backrooms_recipes.some((recipe) =>
    recipe.id === GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE.id),
  false,
);

const legacyPhase10Package = GamePackageSchema.parse({
  ...authoredCrossLevelContent,
  maps: [
    GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP,
    GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP,
  ],
  backrooms_recipes: [
    ...authoredCrossLevelContent.backrooms_recipes,
    GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE,
  ],
  settings: {
    ...(authoredCrossLevelContent.settings ?? {}),
    map_music: {
      ...((authoredCrossLevelContent.settings?.map_music ?? {}) as Record<string, string>),
      [GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.id]: "music.legacy.level1",
    },
  },
});
const migratedLevel0OnlyPackage = installGeneratedBackroomsPhase6Preview(
  legacyPhase10Package,
);
assert.equal(
  migratedLevel0OnlyPackage.maps.some((map) =>
    map.id === GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.id),
  false,
  "the exact untouched legacy Level 1 proof should be retired",
);
assert.equal(
  migratedLevel0OnlyPackage.backrooms_recipes.some((recipe) =>
    recipe.id === GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_RECIPE.id),
  false,
);

const authoredLevel1 = {
  ...GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP,
  display_name: "My retained authored Level 1",
  generation: {
    ...GENERATED_BACKROOMS_PHASE10_LEVEL1_PREVIEW_MAP.generation!,
    manuallyModified: true,
  },
};
const authoredLegacyPackage = GamePackageSchema.parse({
  ...legacyPhase10Package,
  maps: [GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP, authoredLevel1],
});
assert.equal(
  installGeneratedBackroomsPhase6Preview(authoredLegacyPackage).maps.some((map) =>
    map.id === authoredLevel1.id && map.display_name === authoredLevel1.display_name),
  true,
  "the migration must preserve user-authored Level 1 content",
);

console.log("backrooms phase 11: deterministic authoring report and profiling gate");
const recipe = createLevel0CmtBackroomsRecipe("phase11-studio-proof");
const generate = () => generateBackroomsMap({
  recipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  generatedAt: "2026-08-10T22:00:00.000Z",
  debug: true,
});
const result = generate();
const replay = generate();
assert.equal(result.success, true, JSON.stringify(result.diagnostics));
assert.deepEqual(replay, result, "editor generation must replay exactly for one recipe and seed");
assert.ok(result.map && result.graph && result.embedded && result.quality);

const studioContent = installLevel0CmtPhase6Content(createEmptyGamePackage(), {
  mapId: result.map.id,
  recipe,
});
const packageWithMap = GamePackageSchema.parse({
  ...studioContent,
  maps: [result.map],
});
const beforeReportHash = stableContentHash({
  map: result.map,
  package: packageWithMap,
});
const buildReport = () => buildBackroomsStudioReport({
  recipe,
  map: result.map!,
  graph: result.graph!,
  embedded: result.embedded!,
  quality: result.quality,
  pacing: result.pacing,
  anomalies: result.anomalies,
  anomalyProfile: LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
  diagnostics: result.diagnostics,
  packageData: packageWithMap,
});
const report = buildReport();
assert.deepEqual(buildReport(), report, "the Phase 11 report must be deterministic");
assert.equal(
  stableContentHash({ map: result.map, package: packageWithMap }),
  beforeReportHash,
  "reporting must never mutate the generated map or package",
);
assert.equal(report.ready, true);
assert.equal(report.rooms.length, result.graph.nodes.length);
assert.equal(new Set(report.rooms.map((room) => room.id)).size, report.rooms.length);
assert.equal(report.stageSeeds.length, BACKROOMS_STAGE_IDS.length);
assert.equal(new Set(report.stageSeeds.map((entry) => entry.stage)).size, BACKROOMS_STAGE_IDS.length);
assert.ok(report.rooms.every((room) => room.templateId && room.bounds));
assert.ok(report.ordinaryRoomRatio >= 0.75);
assert.ok(report.anomalies.every((entry) => entry.clearance === "pass"));
assert.ok(report.anomalies.some((entry) => entry.transform.includes("rotation")));
assert.ok(report.provenance.length > 0);
assert.ok(report.provenance.every((entry) => entry.source && entry.license));
assert.equal(report.performance.withinBudget, true);
assert.ok(report.performance.maximumActiveCells <= 6_000);
assert.ok(report.performance.estimatedDrawCalls <= 70);
assert.ok(report.performance.estimatedTriangles <= 550_000);
assert.ok(report.performance.eagerFineCellsAvoided > 100_000);

const readiness = validateOrdinaryMap(result.map, {
  package: packageWithMap,
  returnRouteRequired: false,
  budgets: BACKROOMS_LEVEL0_VALIDATION_BUDGETS,
});
assert.equal(readiness.valid, true, JSON.stringify(readiness));

console.log("backrooms phase 11: guarded ordinary-map bake");
const collisionPlan = planBackroomsPackageBake(packageWithMap, [result.map]);
assert.equal(collisionPlan.collisions.length, 1);
const unconfirmedReplace = applyBackroomsPackageBake(collisionPlan, {
  policy: "replace",
  confirmReplace: false,
});
assert.equal(unconfirmedReplace.applied, false);
assert.equal(unconfirmedReplace.requiresConfirmation, true);
assert.deepEqual(unconfirmedReplace.package, collisionPlan.sourcePackage);

const createNew = applyBackroomsPackageBake(collisionPlan, {
  policy: "create_new_ids",
});
assert.equal(createNew.applied, true);
assert.equal(createNew.bakedMapIds.length, 1);
assert.notEqual(createNew.bakedMapIds[0], result.map.id);
assert.equal(
  createNew.package.maps.some((map) => map.id === result.map!.id),
  true,
  "create-new bake must retain the original map",
);

const manuallyEditedMap = {
  ...result.map,
  generation: { ...result.map.generation!, manuallyModified: true },
};
const manualPackage = GamePackageSchema.parse({
  ...packageWithMap,
  maps: [manuallyEditedMap],
});
const manualPlan = planBackroomsPackageBake(manualPackage, [result.map]);
const manualReplace = applyBackroomsPackageBake(manualPlan, {
  policy: "replace",
  confirmReplace: true,
  acknowledgeManualEdits: false,
});
assert.equal(manualReplace.applied, false);
assert.equal(manualReplace.requiresConfirmation, true);

console.log("Backrooms Phase 11 Level 0 authoring studio passed.");
