import { performance } from "node:perf_hooks";
import { generateDungeon } from "../src/dungeonGen";
import {
  createInstitutionalDungeonFixture,
  evaluateDungeonAcceptance,
} from "./dungeon-generation-test-support";
import { percentile } from "./dungeon-audit-support";
import { DUNGEON_PROFILE_SEEDS } from "./fixtures/dungeon-regression-corpus";

interface ProfileRow {
  seed: string;
  accepted: boolean;
  wallDurationMs: number;
  attempts: number;
  backtracks: number;
  rooms: number;
  maps: number;
  macroCells: number;
  fineCells: number;
  actors: number;
  objects: number;
  activeChemistryCells: number;
  estimatedSaveBytes: number;
  progressEvents: number;
  stageDurationMs: Record<string, number>;
  issues: string[];
}

const rows: ProfileRow[] = [];
for (const seed of DUNGEON_PROFILE_SEEDS) {
  const fixture = createInstitutionalDungeonFixture(seed);
  const progress: Array<{ completedStages: number; totalStages: number; attempt: number }> = [];
  const started = performance.now();
  const result = generateDungeon({
    recipe: fixture.recipe,
    gamePackage: fixture.gamePackage,
    generatedAt: "2026-07-13T12:00:00.000Z",
    onProgress: (event) => progress.push({
      completedStages: event.completedStages,
      totalStages: event.totalStages,
      attempt: event.attempt,
    }),
  });
  const wallDurationMs = performance.now() - started;
  const acceptance = evaluateDungeonAcceptance(fixture, result);
  const issues = [...acceptance.issues];
  const check = (condition: unknown, message: string) => {
    if (!condition) issues.push(message);
  };
  const hazardProfile = fixture.gamePackage.dungeon_hazard_profiles.find((profile) =>
    profile.id === fixture.recipe.population.hazardProfileId);
  check(result.metrics.roomCount >= 12 && result.metrics.roomCount <= 24,
    "v1 profile target requires 12–24 rooms");
  check(result.metrics.mapCount >= 1 && result.metrics.mapCount <= 3,
    "v1 profile target requires 1–3 maps");
  check(result.metrics.attemptCount <= fixture.recipe.constraints.maxGenerationAttempts,
    "generation exceeded its declared attempt bound");
  check(result.metrics.embeddingBacktracks <= fixture.recipe.constraints.maxEmbeddingBacktracks,
    "generation exceeded its declared embedding backtrack bound");
  check(!hazardProfile || result.metrics.initialActiveChemistryCells <= hazardProfile.maxInitialActiveCells,
    "initial active chemistry exceeds the selected profile budget");
  check(result.metrics.estimatedFineCellCount === result.metrics.macroCellCount * 9,
    "fine-grid estimate does not use current 3x3 runtime expansion");
  check(result.metrics.estimatedSaveBytes <= result.maps.length * 8 * 1024 * 1024,
    "estimated save contribution exceeds ordinary-map hard budgets");
  check(progress.length > 0, "generation emitted no progress events");
  check(progress.every((event, index) =>
    event.totalStages > 0 &&
    event.completedStages >= 0 &&
    event.completedStages <= event.totalStages &&
    (index === 0 || event.attempt >= progress[index - 1].attempt)),
  "generation progress is invalid or attempts move backwards");
  // This is a guard against accidentally unbounded search, not a benchmark
  // threshold. Structural budgets above are the stable performance contract.
  check(wallDurationMs < 120_000, "one bounded v1 dungeon generation exceeded two minutes");
  rows.push({
    seed,
    accepted: issues.length === 0,
    wallDurationMs: Number(wallDurationMs.toFixed(3)),
    attempts: result.metrics.attemptCount,
    backtracks: result.metrics.embeddingBacktracks,
    rooms: result.metrics.roomCount,
    maps: result.metrics.mapCount,
    macroCells: result.metrics.macroCellCount,
    fineCells: result.metrics.estimatedFineCellCount,
    actors: result.metrics.actorCount,
    objects: result.metrics.objectCount,
    activeChemistryCells: result.metrics.initialActiveChemistryCells,
    estimatedSaveBytes: result.metrics.estimatedSaveBytes,
    progressEvents: progress.length,
    stageDurationMs: result.metrics.stageDurationMs,
    issues,
  });
}

const durations = rows.map((row) => row.wallDurationMs);
const summary = {
  profile: "dungeon_v1",
  accepted: rows.every((row) => row.accepted),
  samples: rows.length,
  wallDurationMs: {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    max: Math.max(...durations),
  },
  maximumAttempts: Math.max(...rows.map((row) => row.attempts)),
  maximumBacktracks: Math.max(...rows.map((row) => row.backtracks)),
  maximumActiveChemistryCells: Math.max(...rows.map((row) => row.activeChemistryCells)),
  maximumEstimatedSaveBytes: Math.max(...rows.map((row) => row.estimatedSaveBytes)),
  rows,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.accepted) process.exitCode = 1;

