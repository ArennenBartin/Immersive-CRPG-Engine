import assert from "node:assert/strict";
import {
  BACKROOMS_STAGE_IDS,
  BackroomsDefinitionLibrarySchema,
  BackroomsRecipeSchema,
  createBackroomsSeedContext,
  type BackroomsDefinitionLibrary,
  type BackroomsSeedContextOptions,
} from "../src/backroomsGen";
import { createDungeonSeedContext } from "../src/dungeonGen/seedContext";
import { createEmptyGamePackage, GamePackageSchema } from "../src/schema/game";

const validLibraryInput = {
  backrooms_recipes: [
    {
      id: "recipe.level0.cmt",
      name: "CMT Level 0",
      seed: "level-zero-seed-001",
      stageSalts: { anomalies: "sparse-wrongness-v1" },
      levelProfileId: "level.level0.cmt",
      scale: {
        roomCount: { min: 48, max: 72 },
        mapWidth: 128,
        mapDepth: 128,
        targetTraversalMinutes: { min: 4, max: 8 },
      },
      navigation: {
        incidentalDeadEndRatio: { min: 0.08, max: 0.16 },
        loopDensity: { min: 0.22, max: 0.34 },
        landmarkSpacingRooms: { min: 7, max: 12 },
        anchorSpacingRooms: { min: 10, max: 18 },
      },
      pacing: {
        maxQuietRoomsBeforeNoveltyBoost: 8,
        setPieceCount: { min: 1, max: 2 },
        hostileEncounterRatio: { min: 0, max: 0.04 },
      },
      constraints: {
        maxGenerationAttempts: 8,
        maxEmbeddingBacktracks: 2_000,
      },
    },
  ],
  backrooms_level_profiles: [
    {
      id: "level.level0.cmt",
      name: "Level 0",
      roomTags: ["office", "quiet"],
      wallObjectIds: ["obj_backrooms_level_zero_wall"],
      floorObjectIds: ["obj_backrooms_level_zero_floor"],
      lightObjectIds: ["obj_backrooms_level_zero_ceiling_light"],
      ordinaryDressingObjectIds: ["obj_backrooms_office_desk"],
      transitionRuleIds: ["transition.level0.to.level1"],
      motifIds: ["motif.office_corner.03"],
      eventProfileIds: ["events.level0.quiet"],
      anomalyProfileId: "anomalies.level0.cmt",
    },
    {
      id: "level.level1.cmt",
      name: "Level 1",
    },
  ],
  backrooms_transition_rules: [
    {
      id: "transition.level0.to.level1",
      name: "Level 0 Threshold",
      fromLevelProfileId: "level.level0.cmt",
      toLevelProfileId: "level.level1.cmt",
      kind: "threshold",
      minGraphDistance: 30,
      eventProfileId: "events.level0.quiet",
    },
  ],
  backrooms_motifs: [
    {
      id: "motif.office_corner.03",
      name: "Office Corner 03",
      minSpacingRooms: 9,
      maxOccurrences: 3,
      stages: [
        {
          id: "ordinary",
          description: "An ordinary desk corner.",
          objectIds: ["obj_backrooms_office_desk"],
        },
        {
          id: "changed",
          description: "The same corner, but the drawers face the wall.",
          objectIds: ["obj_backrooms_office_desk"],
          anomalyProfileId: "anomalies.level0.cmt",
        },
      ],
    },
  ],
  backrooms_event_profiles: [
    {
      id: "events.level0.quiet",
      name: "Level 0 Quiet Events",
      maxEventsPerMap: 4,
      minSpacingRooms: 7,
      events: [
        {
          id: "event.light.hum.shift",
          kind: "environmental",
          weight: 1,
          roomTags: ["quiet"],
        },
      ],
    },
  ],
  backrooms_anomaly_profiles: [
    {
      id: "anomalies.level0.cmt",
      name: "Level 0 Sparse Wrongness",
      density: {
        ordinary: { min: 0.75, max: 0.85 },
        lowIntensity: { min: 0.1, max: 0.18 },
        recursive: { min: 0.03, max: 0.06 },
        hero: { min: 0.01, max: 0.02 },
      },
      neverAdjacentHero: true,
      maxAnomaliesPerMap: 10,
      anomalies: [
        {
          id: "anomaly.filing_cabinet.wall_clip",
          class: "low_intensity",
          kind: "partial_embed",
          weight: 3,
          assetIds: ["obj_backrooms_anomaly_filing_cabinet"],
          requiredAnchor: "wall",
          collisionPolicy: "none",
          minSpacingRooms: 5,
        },
        {
          id: "anomaly.desk.recursive_chain",
          class: "recursive",
          kind: "recursive_chain",
          weight: 1,
          assetIds: ["obj_backrooms_anomaly_office_desk"],
          requiredAnchor: "floor",
          collisionPolicy: "first_only",
          minSpacingRooms: 12,
        },
      ],
    },
  ],
};

console.log("backrooms phase 3: schemas and cross-reference gate");
const library = BackroomsDefinitionLibrarySchema.parse(validLibraryInput);
assert.equal(library.backrooms_recipes[0]?.generatorId, "backrooms");
assert.equal(library.backrooms_recipes[0]?.generatorVersion, "backrooms_v1");
assert.deepEqual(BACKROOMS_STAGE_IDS, [
  "topology",
  "sectors",
  "anchors",
  "embedding",
  "recurrence",
  "ordinary_dressing",
  "anomalies",
  "transitions",
  "events",
]);

const missingReference = structuredClone(library);
missingReference.backrooms_recipes[0]!.levelProfileId = "level.missing";
const invalidReference = BackroomsDefinitionLibrarySchema.safeParse(missingReference);
assert.equal(invalidReference.success, false, "missing definition references must be rejected");
if (!invalidReference.success) {
  assert.ok(
    invalidReference.error.issues.some(
      (issue) => issue.path.join(".") === "backrooms_recipes.0.levelProfileId",
    ),
  );
}

const invalidRange = structuredClone(library.backrooms_recipes[0]!);
invalidRange.scale.roomCount = { min: 80, max: 40 };
assert.equal(BackroomsRecipeSchema.safeParse(invalidRange).success, false);
const invalidSalt = structuredClone(library.backrooms_recipes[0]!);
invalidSalt.stageSalts = { combat: "not-a-backrooms-stage" };
assert.equal(BackroomsRecipeSchema.safeParse(invalidSalt).success, false);

console.log("backrooms phase 3: legacy packages default all new arrays");
const legacyPackage = structuredClone(createEmptyGamePackage()) as Record<string, unknown>;
for (const key of [
  "backrooms_recipes",
  "backrooms_level_profiles",
  "backrooms_transition_rules",
  "transition_presentation_profiles",
  "backrooms_motifs",
  "backrooms_event_profiles",
  "backrooms_anomaly_profiles",
]) {
  delete legacyPackage[key];
}
const normalizedLegacy = GamePackageSchema.parse(legacyPackage);
assert.deepEqual(normalizedLegacy.backrooms_recipes, []);
assert.deepEqual(normalizedLegacy.backrooms_level_profiles, []);
assert.deepEqual(normalizedLegacy.backrooms_transition_rules, []);
assert.deepEqual(normalizedLegacy.transition_presentation_profiles, []);
assert.deepEqual(normalizedLegacy.backrooms_motifs, []);
assert.deepEqual(normalizedLegacy.backrooms_event_profiles, []);
assert.deepEqual(normalizedLegacy.backrooms_anomaly_profiles, []);

const packageWithDefinitions = GamePackageSchema.parse({
  ...normalizedLegacy,
  ...library,
});
const reparsedLibrary: BackroomsDefinitionLibrary =
  BackroomsDefinitionLibrarySchema.parse(packageWithDefinitions);
assert.deepEqual(reparsedLibrary, library);

console.log("backrooms phase 3: deterministic independent stage streams");
const recipe = library.backrooms_recipes[0]!;
const seedOptions: BackroomsSeedContextOptions = {
  generatorVersion: recipe.generatorVersion,
  recipeId: recipe.id,
  seed: recipe.seed,
  stageSalts: recipe.stageSalts,
  debug: true,
};
const anomalyChoices = [
  { id: "filing-cabinet", weight: 3, value: "filing-cabinet" },
  { id: "recursive-desks", weight: 1, value: "recursive-desks" },
  { id: "wrong-clock", weight: 2, value: "wrong-clock" },
];

const first = createBackroomsSeedContext(seedOptions);
const second = createBackroomsSeedContext(seedOptions);
first.stream("topology").weighted(anomalyChoices, "topology-shape");
first.stream("anomalies").weighted(anomalyChoices, "anomaly-kind");
second.stream("topology").weighted([...anomalyChoices].reverse(), "topology-shape");
second.stream("anomalies").weighted([anomalyChoices[1]!, anomalyChoices[2]!, anomalyChoices[0]!], "anomaly-kind");
assert.deepEqual(first.choiceTraces, second.choiceTraces);

const baselineAnomalies = createBackroomsSeedContext(seedOptions).stream("anomalies");
const topologyHeavyContext = createBackroomsSeedContext(seedOptions);
const topology = topologyHeavyContext.stream("topology");
Array.from({ length: 100 }, () => topology.next());
const topologyHeavyAnomalies = topologyHeavyContext.stream("anomalies");
assert.deepEqual(
  Array.from({ length: 12 }, () => baselineAnomalies.next()),
  Array.from({ length: 12 }, () => topologyHeavyAnomalies.next()),
  "extra topology draws must not perturb the anomaly stream",
);

const topologySalted = createBackroomsSeedContext({
  ...seedOptions,
  stageSalts: { ...seedOptions.stageSalts, topology: "topology-reroll-1" },
});
assert.notEqual(
  createBackroomsSeedContext(seedOptions).stream("topology").snapshot().initialSeed,
  topologySalted.stream("topology").snapshot().initialSeed,
);
assert.equal(
  createBackroomsSeedContext(seedOptions).stream("events").snapshot().initialSeed,
  topologySalted.stream("events").snapshot().initialSeed,
);

console.log("backrooms phase 3: dungeon seed API regression vector");
const dungeonStream = createDungeonSeedContext({
  generatorVersion: "dungeon_v1",
  recipeId: "dungeon.regression.vector",
  seed: "phase3-preserve-dungeon-api",
  stageSalts: { topology: "locked" },
}).stream("topology");
assert.deepEqual(
  Array.from({ length: 4 }, () => dungeonStream.next()),
  [0.05914445617236197, 0.4791422509588301, 0.195882081752643, 0.7572697838768363],
);

console.log("backrooms phase 3: all schema, reference, package, and seed checks passed");
