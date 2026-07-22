import { GamePackageSchema } from "../src/schema/game";
import {
  applyDungeonPackageBake,
  planDungeonPackageBake,
} from "../src/dungeonGen/packageBake";
import { evaluateDungeonQuality } from "../src/dungeonGen/quality";
import {
  createInstitutionalSingleMapDungeonFixture,
  evaluateDungeonAcceptance,
  runDungeonGeneration,
} from "./dungeon-generation-test-support";

const fixture = createInstitutionalSingleMapDungeonFixture("institutional-ruin-single-map-audit-001");
const result = runDungeonGeneration(fixture);
const acceptance = evaluateDungeonAcceptance(fixture, result);
const quality = evaluateDungeonQuality({
  recipe: fixture.recipe,
  gamePackage: fixture.gamePackage,
  result,
});

const plan = planDungeonPackageBake(fixture.gamePackage, result.maps);
const bake = applyDungeonPackageBake(plan, { policy: "replace" });
let roundTrip = false;
if (bake.applied) {
  const parsed = GamePackageSchema.parse(JSON.parse(JSON.stringify(bake.package)));
  roundTrip = result.maps.every((map) => parsed.maps.some((candidate) => candidate.id === map.id));
}

const diagnosticCounts = result.diagnostics.reduce<Record<string, number>>((counts, diagnostic) => {
  counts[diagnostic.severity] = (counts[diagnostic.severity] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  audit: "dungeon_v2_single_map_default_acceptance",
  accepted: acceptance.accepted && quality.ready && bake.applied && roundTrip,
  recipeId: fixture.recipe.id,
  seed: fixture.recipe.seed,
  canonicalResultHash: result.canonicalResultHash,
  attempts: result.attemptCount,
  graph: result.graph?.metrics,
  metrics: result.metrics,
  quality,
  maps: result.maps.map((map, index) => ({
    id: map.id,
    floorIndex: index,
    cells: map.cells.length,
    actors: map.entity_placements.length,
    objects: map.custom_object_placements.length + map.container_placements.length,
    exits: map.exits.length,
    authoredChemistryCells: map.cells.filter((cell) => Boolean(cell.initial_chemistry)).length,
    mapAuditErrors: acceptance.mapReports[index]?.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code) ?? [],
  })),
  diagnostics: diagnosticCounts,
  referenceErrorCodes: acceptance.referenceErrorCodes,
  packageBake: {
    applied: bake.applied,
    collisionCount: plan.collisions.length,
    unrelatedMapCountBefore: fixture.gamePackage.maps.length,
    unrelatedMapCountAfter: bake.package.maps.filter((map) =>
      !result.maps.some((generated) => generated.id === map.id)).length,
    roundTrip,
  },
  issues: [
    ...acceptance.issues,
    ...quality.checks.filter((check) => !check.passed).map((check) =>
      `${check.code}: found ${check.actual}; expected ${check.expected}`),
    ...(!bake.applied ? ["ordinary package bake did not apply"] : []),
    ...(!roundTrip ? ["baked maps did not survive package JSON/schema round-trip"] : []),
  ],
}, null, 2));

if (!acceptance.accepted || !quality.ready || !bake.applied || !roundTrip) process.exitCode = 1;
