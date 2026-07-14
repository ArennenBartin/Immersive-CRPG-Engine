import { GamePackageSchema, MapDataSchema, type GamePackage } from "../schema/game";
import { DungeonRecipeSchema } from "./schema";
import type {
  DungeonDiagnostic,
  DungeonGenerationMetrics,
  DungeonGenerationResult,
  DungeonRecipeDef,
  DungeonStageId,
} from "./types";
import { hashCanonicalDungeonBundle, hashDungeonContentLibrary } from "./canonical";
import { dungeonDiagnostic, sortDungeonDiagnostics } from "./diagnostics";
import { createDungeonSeedContext } from "./seedContext";
import { generateDungeonGraph } from "./topology";
import { embedDungeon } from "./embedding";
import { populateDungeon } from "./population";
import { bakeDungeonMaps } from "./bake";
import { auditDungeonRecipeReferences, validateDungeonBake } from "./validation";

export interface DungeonGenerationProgress {
  stage: DungeonStageId;
  attempt: number;
  completedStages: number;
  totalStages: number;
  message: string;
}

export interface GenerateDungeonOptions {
  recipe: DungeonRecipeDef;
  gamePackage: GamePackage;
  generatedAt?: string;
  debug?: boolean;
  shouldCancel?: () => boolean;
  onProgress?: (progress: DungeonGenerationProgress) => void;
}

const now = () => typeof performance !== "undefined" && typeof performance.now === "function"
  ? performance.now()
  : Date.now();

const incrementCodes = (target: Record<string, number>, diagnostics: readonly DungeonDiagnostic[]) => {
  diagnostics.filter((entry) => entry.severity === "fatal" || entry.severity === "error")
    .forEach((entry) => { target[entry.code] = (target[entry.code] ?? 0) + 1; });
};

const weightedChoiceDiagnostics = (
  seedContext: ReturnType<typeof createDungeonSeedContext>,
): DungeonDiagnostic[] => seedContext.choiceTraces.map((trace) => dungeonDiagnostic(
  "info",
  trace.stage,
  "DNG_WEIGHTED_CHOICE",
  `${trace.purpose} selected ${trace.chosenId} from ${trace.sourceIds.length} canonical candidate${trace.sourceIds.length === 1 ? "" : "s"}.`,
  { relatedIds: [trace.chosenId, ...trace.sourceIds.filter((id) => id !== trace.chosenId)] },
));

const emptyMetrics = (attemptCount: number, totalDurationMs: number, rejectionCodes: Record<string, number>): DungeonGenerationMetrics => ({
  attemptCount: Math.max(1, attemptCount),
  stageDurationMs: {},
  totalDurationMs,
  embeddingBacktracks: 0,
  rejectionCodes,
  mapCount: 0,
  macroCellCount: 0,
  estimatedFineCellCount: 0,
  roomCount: 0,
  actorCount: 0,
  objectCount: 0,
  initialActiveChemistryCells: 0,
  estimatedSaveBytes: 0,
});

const failedResult = (
  recipe: DungeonRecipeDef,
  contentLibraryHash: string,
  diagnostics: DungeonDiagnostic[],
  attemptCount: number,
  startedAt: number,
  rejectionCodes: Record<string, number>,
  partial: Partial<Pick<DungeonGenerationResult, "graph" | "embedded">> = {},
): DungeonGenerationResult => ({
  success: false,
  recipeId: recipe.id,
  recipeVersion: recipe.version,
  seed: recipe.seed,
  generatorVersion: recipe.generatorVersion,
  contentLibraryHash,
  ...partial,
  bakedMapIds: [],
  maps: [],
  diagnostics: sortDungeonDiagnostics(diagnostics),
  attemptCount: Math.max(1, attemptCount),
  metrics: emptyMetrics(attemptCount, Math.max(0, now() - startedAt), rejectionCodes),
});

export const generateDungeon = (options: GenerateDungeonOptions): DungeonGenerationResult => {
  const startedAt = now();
  const parsedRecipe = DungeonRecipeSchema.safeParse(options.recipe);
  const parsedPackage = GamePackageSchema.safeParse(options.gamePackage);
  const fallbackRecipe = parsedRecipe.success ? parsedRecipe.data : options.recipe;
  const contentLibraryHash = parsedPackage.success ? hashDungeonContentLibrary(parsedPackage.data) : "invalid-content-library";
  if (!parsedRecipe.success || !parsedPackage.success) {
    const diagnostics: DungeonDiagnostic[] = [
      ...(parsedRecipe.success ? [] : parsedRecipe.error.issues.map((issue) => dungeonDiagnostic(
        "fatal", "recipe", "DNG_RECIPE_SCHEMA_INVALID", `${issue.path.join(".") || "recipe"}: ${issue.message}`,
      ))),
      ...(parsedPackage.success ? [] : parsedPackage.error.issues.map((issue) => dungeonDiagnostic(
        "fatal", "recipe", "DNG_PACKAGE_SCHEMA_INVALID", `${issue.path.join(".") || "package"}: ${issue.message}`,
      ))),
    ];
    return failedResult(fallbackRecipe, contentLibraryHash, diagnostics, 1, startedAt, {});
  }
  const recipe = parsedRecipe.data;
  const gamePackage = parsedPackage.data;
  const referenceAudit = auditDungeonRecipeReferences(recipe, gamePackage);
  if (!referenceAudit.valid) return failedResult(recipe, contentLibraryHash, referenceAudit.diagnostics, 1, startedAt, {});

  const theme = gamePackage.dungeon_themes.find((entry) => entry.id === recipe.themeId)!;
  const encounterProfile = gamePackage.dungeon_encounter_profiles.find((entry) => entry.id === recipe.population.encounterProfileId);
  const hazardProfile = gamePackage.dungeon_hazard_profiles.find((entry) => entry.id === recipe.population.hazardProfileId);
  const rewardProfile = gamePackage.dungeon_reward_profiles.find((entry) => entry.id === recipe.population.rewardProfileId);
  const narrativeProfile = gamePackage.dungeon_narrative_profiles.find((entry) => entry.id === recipe.population.narrativeProfileId);
  const generatedAt = options.generatedAt ?? "1970-01-01T00:00:00.000Z";
  const stageDurationMs: Record<string, number> = {};
  const rejectionCodes: Record<string, number> = {};
  const rejectedAttempts: DungeonDiagnostic[] = [];
  // Topology, embedding, population, ordinary-map bake, and acceptance audit.
  // Keep this count aligned with the progress reports below so Studio reaches
  // a real 100% rather than jumping from 4/6 to 6/6 at completion.
  const totalStages = 5;
  let lastDiagnostics: DungeonDiagnostic[] = [];
  let partialGraph: DungeonGenerationResult["graph"];
  let partialEmbedded: DungeonGenerationResult["embedded"];
  const report = (stage: DungeonStageId, attempt: number, completedStages: number, message: string) =>
    options.onProgress?.({ stage, attempt, completedStages, totalStages, message });
  const timed = <T>(stage: string, operation: () => T): T => {
    const start = now();
    try { return operation(); }
    finally { stageDurationMs[stage] = (stageDurationMs[stage] ?? 0) + Math.max(0, now() - start); }
  };

  for (let attemptIndex = 0; attemptIndex < recipe.constraints.maxGenerationAttempts; attemptIndex += 1) {
    const attempt = attemptIndex + 1;
    if (options.shouldCancel?.()) return failedResult(recipe, contentLibraryHash, [dungeonDiagnostic(
      "fatal", "audit", "DNG_GENERATION_CANCELED", "Dungeon generation was canceled.",
    )], attempt, startedAt, rejectionCodes, { graph: partialGraph, embedded: partialEmbedded });
    const seedContext = createDungeonSeedContext({
      generatorVersion: recipe.generatorVersion,
      recipeId: recipe.id,
      seed: recipe.seed,
      stageSalts: recipe.stageSalts,
      attemptIndex,
      debug: options.debug,
    });
    report("topology", attempt, 0, `Generating topology (attempt ${attempt}/${recipe.constraints.maxGenerationAttempts})`);
    const topology = timed("topology", () => generateDungeonGraph({
      recipe,
      archetypes: gamePackage.dungeon_room_archetypes,
      seedContext,
      keyItemIds: rewardProfile?.keyItemPool.map((entry) => entry.id) ?? theme.keyItemPool.map((entry) => entry.id),
    }));
    lastDiagnostics = topology.diagnostics;
    if (!topology.value) {
      incrementCodes(rejectionCodes, topology.diagnostics);
      rejectedAttempts.push(dungeonDiagnostic("info", "topology", "DNG_ATTEMPT_REJECTED", `Attempt ${attempt} was rejected during topology.`));
      continue;
    }
    partialGraph = topology.value;
    report("embedding", attempt, 1, "Embedding rooms and corridors");
    const embedding = timed("embedding", () => embedDungeon({
      recipe,
      graph: topology.value!,
      archetypes: gamePackage.dungeon_room_archetypes,
      templates: gamePackage.dungeon_room_templates,
      seedContext,
      shouldCancel: options.shouldCancel,
    }));
    lastDiagnostics = [...topology.diagnostics, ...embedding.diagnostics];
    if (!embedding.value) {
      if (embedding.diagnostics.some((entry) => entry.code === "DNG_GENERATION_CANCELED")) return failedResult(
        recipe, contentLibraryHash, lastDiagnostics, attempt, startedAt, rejectionCodes, { graph: partialGraph },
      );
      incrementCodes(rejectionCodes, embedding.diagnostics);
      rejectedAttempts.push(dungeonDiagnostic("info", "embedding", "DNG_ATTEMPT_REJECTED", `Attempt ${attempt} was rejected during embedding.`));
      continue;
    }
    partialGraph = embedding.value.graph;
    partialEmbedded = embedding.value.embedded;
    report("population", attempt, 2, "Populating hazards, rewards, narrative, and encounters");
    const population = timed("population", () => populateDungeon({
      recipe,
      spatial: embedding.value!,
      gamePackage,
      theme,
      archetypes: gamePackage.dungeon_room_archetypes,
      encounterProfile,
      hazardProfile,
      rewardProfile,
      narrativeProfile,
      seedContext,
      shouldCancel: options.shouldCancel,
    }));
    lastDiagnostics = [...topology.diagnostics, ...embedding.diagnostics, ...population.diagnostics];
    if (!population.value) {
      if (population.diagnostics.some((entry) => entry.code === "DNG_GENERATION_CANCELED")) return failedResult(
        recipe, contentLibraryHash, lastDiagnostics, attempt, startedAt, rejectionCodes,
        { graph: partialGraph, embedded: partialEmbedded },
      );
      incrementCodes(rejectionCodes, population.diagnostics);
      rejectedAttempts.push(dungeonDiagnostic("info", "population", "DNG_ATTEMPT_REJECTED", `Attempt ${attempt} was rejected during population.`));
      continue;
    }
    report("bake", attempt, 3, "Baking ordinary engine maps");
    const bake = timed("bake", () => bakeDungeonMaps({
      recipe,
      spatial: embedding.value!,
      population: population.value!,
      theme,
      contentLibraryHash,
      generatedAt,
      attemptIndex,
      shouldCancel: options.shouldCancel,
    }));
    lastDiagnostics = [...lastDiagnostics, ...bake.diagnostics];
    if (!bake.value) {
      if (bake.diagnostics.some((entry) => entry.code === "DNG_GENERATION_CANCELED")) return failedResult(
        recipe, contentLibraryHash, lastDiagnostics, attempt, startedAt, rejectionCodes,
        { graph: partialGraph, embedded: partialEmbedded },
      );
      incrementCodes(rejectionCodes, bake.diagnostics);
      rejectedAttempts.push(dungeonDiagnostic("info", "bake", "DNG_ATTEMPT_REJECTED", `Attempt ${attempt} was rejected during ordinary-map bake.`));
      continue;
    }
    report("audit", attempt, 4, "Auditing ordinary maps and references");
    const validation = timed("audit", () => validateDungeonBake({ recipe, gamePackage, bake: bake.value! }));
    lastDiagnostics = [...lastDiagnostics, ...validation.diagnostics];
    if (!validation.value) {
      incrementCodes(rejectionCodes, validation.diagnostics);
      rejectedAttempts.push(dungeonDiagnostic("info", "audit", "DNG_ATTEMPT_REJECTED", `Attempt ${attempt} was rejected during acceptance audit.`));
      continue;
    }
    let maps = bake.value.maps;
    const canonicalResultHash = hashCanonicalDungeonBundle({
      recipeId: recipe.id,
      generatorVersion: recipe.generatorVersion,
      seed: recipe.seed,
      stageSalts: recipe.stageSalts,
      contentLibraryHash,
      graph: embedding.value.graph,
      embedded: embedding.value.embedded,
      maps,
    });
    maps = maps.map((map) => MapDataSchema.parse({
      ...map,
      generation: map.generation ? { ...map.generation, canonicalResultHash } : undefined,
    }));
    const macroCellCount = maps.reduce((sum, map) => sum + map.cells.length, 0);
    const actorCount = maps.reduce((sum, map) => sum + map.entity_placements.length, 0);
    const objectCount = maps.reduce((sum, map) => sum + map.custom_object_placements.length + map.container_placements.length, 0);
    const initialActiveChemistryCells = maps.reduce((sum, map) =>
      sum + map.cells.filter((cell) => Boolean(cell.initial_chemistry)).length, 0);
    const metrics: DungeonGenerationMetrics = {
      attemptCount: attempt,
      stageDurationMs,
      totalDurationMs: Math.max(0, now() - startedAt),
      embeddingBacktracks: embedding.value.embeddingBacktracks,
      rejectionCodes,
      mapCount: maps.length,
      macroCellCount,
      estimatedFineCellCount: macroCellCount * 9,
      roomCount: embedding.value.graph.nodes.length,
      actorCount,
      objectCount,
      initialActiveChemistryCells,
      estimatedSaveBytes: new TextEncoder().encode(JSON.stringify(maps)).byteLength,
    };
    report("audit", attempt, totalStages, "Dungeon generation complete");
    return {
      success: true,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      seed: recipe.seed,
      generatorVersion: recipe.generatorVersion,
      contentLibraryHash,
      canonicalResultHash,
      graph: embedding.value.graph,
      embedded: embedding.value.embedded,
      bakedMapIds: maps.map((map) => map.id),
      maps,
      validationReports: validation.value.reports,
      diagnostics: sortDungeonDiagnostics([
        ...rejectedAttempts,
        ...lastDiagnostics,
        ...weightedChoiceDiagnostics(seedContext),
      ]),
      attemptCount: attempt,
      metrics,
    };
  }
  const exhausted = dungeonDiagnostic(
    "fatal", "audit", "DNG_GENERATION_ATTEMPTS_EXHAUSTED",
    `Dungeon generation exhausted ${recipe.constraints.maxGenerationAttempts} bounded attempts.`,
  );
  return failedResult(recipe, contentLibraryHash, [...rejectedAttempts, ...lastDiagnostics, exhausted],
    recipe.constraints.maxGenerationAttempts, startedAt, rejectionCodes, { graph: partialGraph, embedded: partialEmbedded });
};
