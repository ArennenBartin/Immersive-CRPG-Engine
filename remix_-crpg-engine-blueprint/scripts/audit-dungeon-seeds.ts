import { performance } from "node:perf_hooks";
import { stableContentHash } from "../src/generation-facing";
import {
  auditEmbeddedDungeon,
  canonicalDungeonGraph,
  canonicalEmbeddedDungeon,
  createDungeonSeedContext,
  embedDungeon,
  generateDungeon,
  generateDungeonGraph,
  simulateDungeonProgression,
  type DungeonDiagnostic,
  type DungeonGenerationResult,
  type DungeonGraph,
  type DungeonRecipeDef,
  type DungeonSpatialResult,
} from "../src/dungeonGen";
import { INSTITUTIONAL_RUIN_RECIPE_ID } from "../src/dungeonGen/presets/institutionalRuin";
import { DungeonRecipeSchema } from "../src/dungeonGen/schema";
import {
  blockingDungeonDiagnostics,
  dungeonAuditRowsToCsv,
  emitDungeonAuditOutput,
  parseDungeonSeedAuditArgs,
  percentile,
  type DungeonSeedAuditRow,
} from "./dungeon-audit-support";
import {
  createInstitutionalDungeonFixture,
  evaluateDungeonAcceptance,
  type DungeonFixture,
} from "./dungeon-generation-test-support";

const options = parseDungeonSeedAuditArgs(process.argv.slice(2), INSTITUTIONAL_RUIN_RECIPE_ID);
const baseFixture = createInstitutionalDungeonFixture("dungeon-seed-audit-template");
const availableRecipes = new Map(baseFixture.gamePackage.dungeon_recipes.map((recipe) => [recipe.id, recipe]));
const selected = availableRecipes.get(options.recipeId);
if (!selected) {
  throw new Error(`Unknown recipe ${options.recipeId}. Available: ${[...availableRecipes.keys()].sort().join(", ")}`);
}

const seedFor = (index: number) =>
  `${options.recipeId}:audit:${String(index).padStart(6, "0")}`;

const recipeFor = (index: number): DungeonRecipeDef => DungeonRecipeSchema.parse({
  ...selected,
  seed: seedFor(index),
});

const contextFor = (recipe: DungeonRecipeDef, attemptIndex = 0) =>
  createDungeonSeedContext({
    generatorVersion: recipe.generatorVersion,
    recipeId: recipe.id,
    seed: recipe.seed,
    stageSalts: recipe.stageSalts,
    attemptIndex,
  });

const rangeCodes = (graph: DungeonGraph, recipe: DungeonRecipeDef) => {
  const failures: string[] = [];
  const check = (name: string, value: number, range: { min: number; max: number }) => {
    if (value < range.min || value > range.max) failures.push(`AUDIT_${name.toUpperCase()}_RANGE`);
  };
  check("room", graph.metrics.nodeCount, recipe.scale.roomCount);
  check("critical_path", graph.metrics.criticalPathLength, recipe.topology.criticalPathLength);
  check("branch", graph.metrics.branchCount, recipe.topology.branchCount);
  check("loop", graph.metrics.loopCount, recipe.topology.loopCount);
  check("secret", graph.metrics.secretCount, recipe.topology.secretCount);
  check("gate", graph.gates.length, recipe.topology.lockCount);
  return failures;
};

interface StageRun {
  accepted: boolean;
  hash: string;
  graph?: DungeonGraph;
  spatial?: DungeonSpatialResult;
  result?: DungeonGenerationResult;
  diagnostics: DungeonDiagnostic[];
  blockingCodes: string[];
  attemptCount: number;
  roomCount: number;
  mapCount: number;
  failureMessages: string[];
  retryCodes: string[];
}

const topologyRun = (recipe: DungeonRecipeDef): StageRun => {
  const retryCodes: string[] = [];
  let finalDiagnostics: DungeonDiagnostic[] = [];
  let finalBlockingCodes: string[] = [];
  for (let attemptIndex = 0; attemptIndex < recipe.constraints.maxGenerationAttempts; attemptIndex += 1) {
    const output = generateDungeonGraph({
      recipe,
      archetypes: baseFixture.gamePackage.dungeon_room_archetypes,
      seedContext: contextFor(recipe, attemptIndex),
      keyItemIds: baseFixture.gamePackage.items.map((item) => item.id),
    });
    const graph = output.value;
    const progression = graph
      ? simulateDungeonProgression(graph, recipe.topology.requireReturnPath)
      : undefined;
    const extraCodes = graph ? rangeCodes(graph, recipe) : [];
    if (progression && !progression.solvable) extraCodes.push("AUDIT_PROGRESSION_UNSOLVED");
    const diagnostics = [
      ...output.diagnostics,
      ...(progression?.diagnostics ?? []),
    ];
    const diagnosticCodes = blockingDungeonDiagnostics(diagnostics).map((entry) => entry.code);
    const blockingCodes = [...new Set([...diagnosticCodes, ...extraCodes])].sort();
    finalDiagnostics = diagnostics;
    finalBlockingCodes = blockingCodes;
    if (graph && blockingCodes.length === 0) {
      return {
        accepted: true,
        hash: stableContentHash(canonicalDungeonGraph(graph)),
        graph,
        diagnostics,
        blockingCodes: [],
        attemptCount: attemptIndex + 1,
        roomCount: graph.nodes.length,
        mapCount: 0,
        failureMessages: [],
        retryCodes: [...retryCodes].sort(),
      };
    }
    retryCodes.push(...blockingCodes);
  }
  return {
    accepted: false,
    hash: "",
    diagnostics: finalDiagnostics,
    blockingCodes: [...new Set([
      ...finalBlockingCodes,
      "AUDIT_TOPOLOGY_ATTEMPTS_EXHAUSTED",
    ])].sort(),
    attemptCount: recipe.constraints.maxGenerationAttempts,
    roomCount: 0,
    mapCount: 0,
    failureMessages: [
      ...finalDiagnostics
        .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
        .map((entry) => `${entry.code}: ${entry.message}`),
      "Topology attempts exhausted.",
    ],
    retryCodes: [...retryCodes].sort(),
  };
};

const embeddingRun = (recipe: DungeonRecipeDef): StageRun => {
  const topology = topologyRun(recipe);
  if (!topology.graph || !topology.accepted) return topology;
  let lastDiagnostics: DungeonDiagnostic[] = [];
  const embeddingRetryCodes: string[] = [];
  for (let attemptIndex = 0; attemptIndex < recipe.constraints.maxGenerationAttempts; attemptIndex += 1) {
    const output = embedDungeon({
      recipe,
      graph: topology.graph,
      archetypes: baseFixture.gamePackage.dungeon_room_archetypes,
      templates: baseFixture.gamePackage.dungeon_room_templates,
      seedContext: contextFor(recipe, attemptIndex),
    });
    lastDiagnostics = output.diagnostics;
    if (!output.value) {
      embeddingRetryCodes.push(...blockingDungeonDiagnostics(output.diagnostics).map((entry) => entry.code));
      continue;
    }
    const spatial = output.value;
    const diagnostics = [
      ...topology.diagnostics,
      ...output.diagnostics,
      ...auditEmbeddedDungeon(spatial.graph, spatial.embedded),
    ];
    const blockingCodes = [...new Set([
      ...blockingDungeonDiagnostics(diagnostics).map((entry) => entry.code),
      ...(spatial.embedded.maps.length < recipe.scale.floorCount.min ||
      spatial.embedded.maps.length > recipe.scale.floorCount.max
        ? ["AUDIT_FLOOR_RANGE"]
        : []),
    ])].sort();
    return {
      accepted: blockingCodes.length === 0,
      hash: stableContentHash({
        graph: canonicalDungeonGraph(spatial.graph),
        embedded: canonicalEmbeddedDungeon(spatial.embedded),
      }),
      graph: spatial.graph,
      spatial,
      diagnostics,
      blockingCodes,
      attemptCount: attemptIndex + 1,
      roomCount: spatial.graph.nodes.length,
      mapCount: spatial.embedded.maps.length,
      failureMessages: diagnostics
        .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
        .map((entry) => `${entry.code}: ${entry.message}`),
      retryCodes: [
        ...topology.retryCodes,
        ...embeddingRetryCodes,
      ],
    };
  }
  const blockingCodes = [...new Set([
    ...topology.blockingCodes,
    ...blockingDungeonDiagnostics(lastDiagnostics).map((entry) => entry.code),
    "AUDIT_EMBEDDING_ATTEMPTS_EXHAUSTED",
  ])].sort();
  return {
    ...topology,
    accepted: false,
    diagnostics: [...topology.diagnostics, ...lastDiagnostics],
    blockingCodes,
    attemptCount: recipe.constraints.maxGenerationAttempts,
    failureMessages: [
      ...topology.failureMessages,
      ...lastDiagnostics
        .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
        .map((entry) => `${entry.code}: ${entry.message}`),
      "Embedding attempts exhausted.",
    ],
    retryCodes: [
      ...topology.retryCodes,
      ...embeddingRetryCodes,
    ],
  };
};

const fullRun = (fixture: DungeonFixture): StageRun => {
  const result = generateDungeon({
    recipe: fixture.recipe,
    gamePackage: fixture.gamePackage,
    generatedAt: "2026-07-13T12:00:00.000Z",
  });
  const acceptance = evaluateDungeonAcceptance(fixture, result);
  const acceptanceCodes = acceptance.issues.map((_, index) => `AUDIT_ACCEPTANCE_${String(index + 1).padStart(2, "0")}`);
  const blockingCodes = [...new Set([
    ...blockingDungeonDiagnostics(result.diagnostics as DungeonDiagnostic[]).map((entry) => entry.code),
    ...acceptanceCodes,
  ])].sort();
  return {
    accepted: result.success && acceptance.accepted && blockingCodes.length === 0,
    hash: result.canonicalResultHash ?? "",
    graph: result.graph,
    result,
    diagnostics: result.diagnostics,
    blockingCodes,
    attemptCount: result.attemptCount,
    roomCount: result.graph?.nodes.length ?? 0,
    mapCount: result.maps.length,
    failureMessages: [
      ...result.diagnostics
        .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
        .map((entry) => `${entry.code}: ${entry.message}`),
      ...acceptance.issues,
    ],
    retryCodes: Object.entries(result.metrics.rejectionCodes as Record<string, number>).flatMap(([code, count]) =>
      Array.from({ length: count }, () => code)),
  };
};

const runStage = (recipe: DungeonRecipeDef): StageRun => {
  if (options.stage === "topology") return topologyRun(recipe);
  if (options.stage === "embedding") return embeddingRun(recipe);
  return fullRun({ gamePackage: baseFixture.gamePackage, recipe });
};

const rows: DungeonSeedAuditRow[] = [];
const rejections: Record<string, number> = {};
const retries: Record<string, number> = {};
const started = performance.now();
const progressInterval = options.count >= 10_000 ? 1_000 : options.count >= 1_000 ? 100 : 25;

for (let index = 0; index < options.count; index += 1) {
  const recipe = recipeFor(index);
  const seedStarted = performance.now();
  const first = runStage(recipe);
  const repeated = runStage(recipe);
  const deterministic = first.hash === repeated.hash &&
    first.accepted === repeated.accepted &&
    first.attemptCount === repeated.attemptCount &&
    stableContentHash(first.retryCodes) === stableContentHash(repeated.retryCodes) &&
    stableContentHash(first.graph ?? null) === stableContentHash(repeated.graph ?? null) &&
    (options.stage !== "full" || stableContentHash(first.result?.maps ?? []) === stableContentHash(repeated.result?.maps ?? []));
  const blockingCodes = [...new Set([
    ...first.blockingCodes,
    ...(!deterministic ? ["AUDIT_NONDETERMINISTIC"] : []),
  ])].sort();
  for (const code of blockingCodes) rejections[code] = (rejections[code] ?? 0) + 1;
  for (const code of first.retryCodes) retries[code] = (retries[code] ?? 0) + 1;
  rows.push({
    index,
    seed: recipe.seed,
    accepted: first.accepted && deterministic,
    deterministic,
    durationMs: Number((performance.now() - seedStarted).toFixed(3)),
    attemptCount: first.attemptCount,
    roomCount: first.roomCount,
    mapCount: first.mapCount,
    branchCount: first.graph?.metrics.branchCount ?? 0,
    loopCount: first.graph?.metrics.loopCount ?? 0,
    secretCount: first.graph?.metrics.secretCount ?? 0,
    gateCount: first.graph?.gates.length ?? 0,
    canonicalHash: first.hash,
    retryCodes: [...first.retryCodes].sort(),
    blockingCodes,
    failureMessages: [
      ...first.failureMessages,
      ...(!deterministic ? ["Repeated generation did not produce the same accepted state and canonical output."] : []),
    ],
  });
  if ((index + 1) % progressInterval === 0 && index + 1 < options.count) {
    console.error(`dungeon seed audit: ${index + 1}/${options.count}`);
  }
}

const durations = rows.map((row) => row.durationMs);
const failures = rows.filter((row) => !row.accepted);
const summary = {
  audit: "dungeon_seed_audit_v1",
  recipeId: options.recipeId,
  stage: options.stage,
  requestedSeeds: options.count,
  acceptedSeeds: rows.length - failures.length,
  rejectedSeeds: failures.length,
  deterministicSeeds: rows.filter((row) => row.deterministic).length,
  durationMs: Number((performance.now() - started).toFixed(3)),
  perSeedDurationMs: {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    max: Math.max(0, ...durations),
  },
  rejectionCodes: Object.fromEntries(Object.entries(rejections).sort(([left], [right]) => left.localeCompare(right))),
  retryCodes: Object.fromEntries(Object.entries(retries).sort(([left], [right]) => left.localeCompare(right))),
  sampleFailures: failures.slice(0, 25),
};

const json = JSON.stringify({ ...summary, rows }, null, 2) + "\n";
const csv = dungeonAuditRowsToCsv(rows);
await emitDungeonAuditOutput(json, options.json);
await emitDungeonAuditOutput(csv, options.csv);
if (!options.json && !options.csv) console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exitCode = 1;
