import {
  auditGamePackageReferences,
  hashMapOutput,
} from "../src/generation-facing";
import {
  validateOrdinaryMap,
  type MapValidationReport,
} from "../src/engine-core/mapReadinessValidator";
import {
  createEmptyGamePackage,
  GamePackageSchema,
  MapDataSchema,
  type GamePackage,
} from "../src/schema/game";
import {
  auditEmbeddedDungeon,
  generateDungeon,
  hashCanonicalDungeonBundle,
  simulateDungeonProgression,
  type DungeonGenerationResult,
  type DungeonRecipeDef,
} from "../src/dungeonGen";
import {
  createInstitutionalRuinRecipe,
  createInstitutionalRuinSingleMapRecipe,
  INSTITUTIONAL_RUIN_RECIPE_ID,
  INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID,
  installInstitutionalRuinGeneratorContent,
} from "../src/dungeonGen/presets/institutionalRuin";
import { DungeonRecipeSchema } from "../src/dungeonGen/schema";
import { blockingDungeonDiagnostics } from "./dungeon-audit-support";

export interface DungeonFixture {
  gamePackage: GamePackage;
  recipe: DungeonRecipeDef;
}

export const createInstitutionalDungeonFixture = (
  seed: string,
  transform?: (recipe: DungeonRecipeDef) => DungeonRecipeDef,
): DungeonFixture => {
  const installed = installInstitutionalRuinGeneratorContent(createEmptyGamePackage());
  const baseRecipe = createInstitutionalRuinRecipe(seed);
  const recipe = DungeonRecipeSchema.parse(transform ? transform(baseRecipe) : baseRecipe);
  const remaining = installed.dungeon_recipes.filter((candidate) =>
    candidate.id !== INSTITUTIONAL_RUIN_RECIPE_ID && candidate.id !== recipe.id);
  return {
    recipe,
    gamePackage: GamePackageSchema.parse({
      ...installed,
      dungeon_recipes: [...remaining, recipe],
    }),
  };
};

export const createSingleFloorDungeonFixture = (seed: string): DungeonFixture =>
  createInstitutionalDungeonFixture(seed, (recipe) => ({
    ...recipe,
    id: "institutional_ruin_single_floor_test_v1",
    name: "Institutional Ruin — Single Floor Test",
    outputMode: "single_map",
    scale: {
      ...recipe.scale,
      floorCount: { min: 1, max: 1 },
      roomCount: { min: 12, max: 14 },
    },
    topology: {
      ...recipe.topology,
      criticalPathLength: { min: 8, max: 9 },
      branchCount: { min: 2, max: 2 },
      branchLength: { min: 2, max: 3 },
      loopCount: { min: 1, max: 1 },
      secretCount: { min: 1, max: 1 },
      lockCount: { min: 1, max: 1 },
    },
  }));

/** The selected rule-definition default; legacy fixture helpers remain v1. */
export const createInstitutionalSingleMapDungeonFixture = (
  seed: string,
): DungeonFixture => {
  const installed = installInstitutionalRuinGeneratorContent(createEmptyGamePackage());
  const recipe = createInstitutionalRuinSingleMapRecipe(seed);
  return {
    recipe,
    gamePackage: GamePackageSchema.parse({
      ...installed,
      dungeon_recipes: [
        ...installed.dungeon_recipes.filter((candidate) =>
          candidate.id !== INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID),
        recipe,
      ],
    }),
  };
};

export const runDungeonGeneration = (
  fixture: DungeonFixture,
  generatedAt = "2026-07-13T12:00:00.000Z",
): DungeonGenerationResult => generateDungeon({
  recipe: fixture.recipe,
  gamePackage: fixture.gamePackage,
  generatedAt,
  debug: true,
});

const inRange = (value: number, range: { min: number; max: number }) =>
  value >= range.min && value <= range.max;

const pairedTransitionIssues = (result: DungeonGenerationResult) => {
  if (!result.embedded) return ["embedded dungeon is missing"];
  const byId = new Map(result.embedded.transitions.map((transition) => [transition.id, transition]));
  const issues: string[] = [];
  for (const transition of result.embedded.transitions) {
    const pair = byId.get(transition.pairedTransitionId);
    if (!pair) issues.push(`transition ${transition.id} has no pair`);
    else if (
      pair.pairedTransitionId !== transition.id ||
      pair.fromMapId !== transition.toMapId ||
      pair.toMapId !== transition.fromMapId ||
      pair.fromCell[0] !== transition.toCell[0] ||
      pair.fromCell[1] !== transition.toCell[1] ||
      pair.toCell[0] !== transition.fromCell[0] ||
      pair.toCell[1] !== transition.fromCell[1]
    ) issues.push(`transition ${transition.id} is not reciprocal with ${pair.id}`);
  }
  return issues;
};

export interface DungeonAcceptanceEvaluation {
  accepted: boolean;
  issues: string[];
  mapReports: MapValidationReport[];
  referenceErrorCodes: string[];
}

/** Headless acceptance contract shared by tests, audits, and profiling. */
export const evaluateDungeonAcceptance = (
  fixture: DungeonFixture,
  result: DungeonGenerationResult,
): DungeonAcceptanceEvaluation => {
  const { recipe } = fixture;
  const issues: string[] = [];
  const add = (condition: unknown, message: string) => {
    if (!condition) issues.push(message);
  };
  const blocking = blockingDungeonDiagnostics(result.diagnostics);
  add(result.success, "generation result is not successful");
  add(blocking.length === 0, `blocking diagnostics: ${blocking.map((entry) => entry.code).join(", ")}`);
  add(result.graph, "graph is missing");
  add(result.embedded, "embedded dungeon is missing");
  add(result.maps.length > 0, "ordinary baked maps are missing");
  add(Boolean(result.canonicalResultHash), "canonical result hash is missing");
  add(result.attemptCount >= 1 && result.attemptCount <= recipe.constraints.maxGenerationAttempts,
    "attempt count exceeds the recipe's bounded retry contract");

  if (result.graph) {
    const graph = result.graph;
    add(inRange(graph.metrics.nodeCount, recipe.scale.roomCount), "room count is outside recipe range");
    add(inRange(graph.metrics.criticalPathLength, recipe.topology.criticalPathLength), "critical path is outside recipe range");
    add(inRange(graph.metrics.branchCount, recipe.topology.branchCount), "branch count is outside recipe range");
    add(inRange(graph.metrics.loopCount, recipe.topology.loopCount), "loop count is outside recipe range");
    add(inRange(graph.metrics.secretCount, recipe.topology.secretCount), "secret count is outside recipe range");
    add(inRange(graph.gates.length, recipe.topology.lockCount), "gate count is outside recipe range");
    add(graph.nodes.some((node) => node.id === graph.entranceNodeId && node.tags.includes("entrance")),
      "entrance node is missing or untagged");
    add(graph.nodes.some((node) => node.id === graph.objectiveNodeId && node.tags.includes("objective")),
      "objective node is missing or untagged");
    add(graph.nodes.some((node) => !node.mandatory), "optional branch content is missing");
    const progression = simulateDungeonProgression(graph, recipe.topology.requireReturnPath);
    add(progression.solvable && progression.objectiveReachable, "progression simulation cannot reach the objective");
    add(!recipe.topology.requireReturnPath || progression.returnReachable, "progression simulation cannot return");
    add(graph.gates.every((gate) => progression.openedGateIds.includes(gate.id)), "a declared gate cannot be opened");
  }

  if (result.graph && result.embedded) {
    add(blockingDungeonDiagnostics(auditEmbeddedDungeon(result.graph, result.embedded)).length === 0,
      "spatial audit reports overlap, bounds, or missing-edge failures");
    add(result.embedded.rooms.length === result.graph.nodes.length, "not every graph node has one room");
    add(result.embedded.maps.length === result.maps.length, "embedded and ordinary map counts differ");
    add(inRange(result.embedded.maps.length, recipe.scale.floorCount), "floor count is outside recipe range");
    if (result.embedded.maps.length > 1) {
      add(result.embedded.transitions.length >= (result.embedded.maps.length - 1) * 2,
        "multi-floor result is missing paired vertical transitions");
    }
    issues.push(...pairedTransitionIssues(result));
    add(
      result.canonicalResultHash === hashCanonicalDungeonBundle({
        recipeId: recipe.id,
        generatorVersion: recipe.generatorVersion,
        seed: recipe.seed,
        stageSalts: recipe.stageSalts,
        contentLibraryHash: result.contentLibraryHash,
        graph: result.graph,
        embedded: result.embedded,
        maps: result.maps,
      }),
      "canonical result hash does not match the canonical graph/embedding/map bundle",
    );
  }

  const mapIds = result.maps.map((map) => map.id);
  add(new Set(mapIds).size === mapIds.length, "baked map IDs are not unique");
  const packageWithMaps = GamePackageSchema.parse({
    ...fixture.gamePackage,
    maps: [
      ...fixture.gamePackage.maps.filter((map) => !mapIds.includes(map.id)),
      ...result.maps,
    ],
  });
  const mapReports = result.maps.map((map) => {
    const parsed = MapDataSchema.safeParse(map);
    add(parsed.success, `${map.id} does not satisfy ordinary MapData schema`);
    add(map.spawns.length > 0, `${map.id} has no spawn`);
    add(map.generation?.generatorId === "dungeon", `${map.id} lacks dungeon provenance`);
    add(map.generation?.recipeId === recipe.id, `${map.id} has the wrong recipe provenance`);
    add(map.generation?.manuallyModified === false, `${map.id} begins as manually modified`);
    add(map.generation?.outputHash === hashMapOutput(map), `${map.id} output hash is stale`);
    add(map.generation?.canonicalResultHash === result.canonicalResultHash,
      `${map.id} does not retain the bundle canonical result hash`);
    add(JSON.stringify(map.generation?.stageSalts ?? {}) === JSON.stringify(recipe.stageSalts),
      `${map.id} does not retain stage salts for reproducible rerolls`);
    for (const exit of map.exits) {
      add(mapIds.includes(exit.target_map_id), `${map.id} exit targets a map outside the generated bundle`);
      const target = result.maps.find((candidate) => candidate.id === exit.target_map_id);
      add(target?.spawns.some((spawn) => spawn.id === exit.target_spawn_id), `${map.id} exit target spawn is missing`);
      if (exit.paired_exit_id) {
        add(target?.exits.some((candidate) => candidate.id === exit.paired_exit_id), `${map.id} paired exit is missing`);
      }
    }
    const report = validateOrdinaryMap(map, { package: packageWithMaps });
    const mapErrors = report.issues.filter((entry) => entry.severity === "error");
    add(mapErrors.length === 0, `${map.id} ordinary-map audit errors: ${mapErrors.map((entry) => entry.code).join(", ")}`);
    add(report.reachableRegions.unreachableCells === 0, `${map.id} has unreachable traversable cells`);
    return report;
  });
  add(result.validationReports?.length === result.maps.length,
    "generation result did not retain one ordinary-map validation report per floor");
  add(result.validationReports?.every((report) =>
    report.valid && report.issues.every((issue) => issue.severity !== "error")),
  "retained navigation/package validation reports contain errors");

  const authoredChemistry = result.maps.reduce((count, map) =>
    count + map.cells.filter((cell) => Boolean(cell.initial_chemistry)).length, 0);
  add(authoredChemistry > 0, "default systemic recipe produced no authored initial chemistry");
  add(authoredChemistry === result.metrics.initialActiveChemistryCells,
    "authored chemistry count differs from recorded generation metrics");
  add(result.metrics.estimatedFineCellCount === result.metrics.macroCellCount * 9,
    "fine-cell estimate must use the current 3x3 runtime expansion");
  add(result.metrics.mapCount === result.maps.length, "map metric differs from baked map count");
  add(result.metrics.roomCount === result.graph?.nodes.length, "room metric differs from graph node count");
  add(result.metrics.embeddingBacktracks <= recipe.constraints.maxEmbeddingBacktracks,
    "embedding backtracks exceed recipe bound");
  add(Object.values(result.metrics.stageDurationMs).every((value) => Number.isFinite(value) && value >= 0),
    "stage timings contain an invalid duration");

  const referenceReport = auditGamePackageReferences(packageWithMaps);
  const referenceErrors = referenceReport.issues.filter((entry) => entry.severity === "error");
  add(referenceErrors.length === 0,
    `package reference errors: ${referenceErrors.map((entry) => entry.code).join(", ")}`);

  return {
    accepted: issues.length === 0,
    issues,
    mapReports,
    referenceErrorCodes: [...new Set(referenceErrors.map((entry) => entry.code))].sort(),
  };
};
