import {
  EncounterDefinitionSchema,
  MapDataSchema,
  createEmptyGamePackage,
} from "../src/schema/game";
import {
  DeterministicIdAllocator,
  MapBuildError,
  auditGamePackageReferences,
  buildDeterministicPlaceholderMap,
  buildMap,
  canAutomaticallyRegenerateMap,
  createGenerationDiagnostics,
  markMapManuallyModified,
  remapGeneratedMapNamespace,
  serializeGenerationDiagnostics,
  stableJsonStringify,
} from "../src/generation-facing";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { createReadinessDungeonPackage } from "./fixtures/readinessDungeonFixture";

let passed = 0;
const check = (label: string, condition: unknown) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
};

console.log("map contract: deterministic placeholder");
const first = buildDeterministicPlaceholderMap({ mapId: "placeholder_a", seed: "seed-a" });
const second = buildDeterministicPlaceholderMap({ mapId: "placeholder_a", seed: "seed-a" });
const different = buildDeterministicPlaceholderMap({ mapId: "placeholder_a", seed: "seed-b" });
check("same input produces byte-identical canonical map", stableJsonStringify(first) === stableJsonStringify(second));
check("same input produces same output hash", first.generation?.outputHash === second.generation?.outputHash);
check("seed affects baked placeholder output", first.generation?.outputHash !== different.generation?.outputHash);
check("placeholder is an ordinary valid MapData", MapDataSchema.safeParse(first).success);

const diagnosticsInput = {
  generatorId: "dungeon-readiness-placeholder",
  generatorVersion: "1.0.0",
  recipeId: "placeholder-room-v1",
  recipeVersion: "1.0.0",
  recipeSnapshot: { id: "placeholder-room-v1", bounds: [7, 7] },
  seed: "seed-a",
  rngStreams: { topology: "seed-a/topology", decoration: "seed-a/decoration" },
  abstractGraph: { nodes: [{ id: "room:start" }], edges: [] },
  spatialLayout: { rooms: [{ id: "room:start", center: [0, 0] }] },
  validationReport: validateOrdinaryMap(first),
  outputMap: first,
  timing: {
    startedAt: "2026-07-13T12:00:00.000Z",
    finishedAt: "2026-07-13T12:00:00.005Z",
    durationMs: 5,
    retryCount: 0,
  },
};
const diagnostics = createGenerationDiagnostics(diagnosticsInput);
const repeatedDiagnostics = createGenerationDiagnostics(diagnosticsInput);
check("diagnostics capture the baked output hash", diagnostics.outputHash === first.generation?.outputHash);
check("diagnostic replay identity is deterministic", diagnostics.attemptId === repeatedDiagnostics.attemptId);
check("diagnostic serialization is canonical", serializeGenerationDiagnostics(diagnostics) === serializeGenerationDiagnostics(repeatedDiagnostics));
let staleDiagnosticRejected = false;
try {
  createGenerationDiagnostics({
    ...diagnosticsInput,
    outputMap: { ...first, generation: { ...first.generation!, outputHash: "stale" } },
  });
} catch {
  staleDiagnosticRejected = true;
}
check("diagnostics reject stale output hashes", staleDiagnosticRejected);

console.log("map contract: independent and semantic IDs");
const withDecoration = new DeterministicIdAllocator({ mapId: "map_ids" });
const topology0 = withDecoration.next("topology");
withDecoration.next("decoration");
withDecoration.next("decoration");
const topology1 = withDecoration.next("topology");
const topologyOnly = new DeterministicIdAllocator({ mapId: "map_ids" });
check("topology stream begins deterministically", topology0 === topologyOnly.next("topology"));
check("decoration does not renumber topology", topology1 === topologyOnly.next("topology"));
check("semantic ID is idempotent", withDecoration.semantic("door", "room-1-north") === withDecoration.semantic("door", "room-1-north"));
let collisionRejected = false;
try {
  const reserved = new DeterministicIdAllocator({
    mapId: "map_ids",
    reservedIds: ["dg:map_ids:topology:0000"],
  });
  reserved.next("topology");
} catch {
  collisionRejected = true;
}
check("reserved ID collision is rejected", collisionRejected);

console.log("map contract: builder, remap, and manual-edit guard");
const ids = new DeterministicIdAllocator({ mapId: "generated_floor_1" });
const generated = buildMap({
  id: "generated_floor_1",
  name: "Generated Floor 1",
  bounds: { width: 3, height: 3 },
  cells: [
    { x: 1, y: 0, z: 0, active: true, walkable: true, blocks_los: false, height: 0, visual_height: 0, surface_tag: "none" },
    { x: 0, y: 0, z: 0, active: true, walkable: true, blocks_los: false, height: 0, visual_height: 0, surface_tag: "none" },
  ],
  spawns: [{ id: ids.semantic("spawn", "start"), cell: [0, 0], facing: [0, 1] }],
  placements: {
    objects: [{ id: ids.semantic("object", "crate"), object_id: "obj_crate", cell: [1, 0], facing: [0, 1] }],
    entities: [{ id: ids.semantic("entity", "guard"), entity_id: "ent_training_bot", cell: [0, 0] }],
  },
  exits: [{
    id: ids.semantic("exit", "self"),
    cell: [0, 0],
    target_map_id: "generated_floor_1",
    target_spawn_id: ids.semantic("spawn", "start"),
  }],
  metadata: {
    generatorId: "contract-test",
    generatorVersion: "1.0.0",
    recipeId: "contract-test-recipe",
    recipeVersion: "1.0.0",
    seed: "contract-seed",
    generatedAt: "2026-07-13T12:00:00.000Z",
    manuallyModified: false,
  },
});
check("builder canonicalizes cell ordering", generated.cells[0].x === 0);
check("generated object placement ID survives schema parsing", MapDataSchema.parse(generated).custom_object_placements[0].id === "dg:generated_floor_1:object:crate");
check("unmodified generated map may regenerate", canAutomaticallyRegenerateMap(generated).allowed);
const edited = markMapManuallyModified(generated);
check("manual edit marker blocks automatic regeneration", !canAutomaticallyRegenerateMap(edited).allowed && edited.generation?.manuallyModified);
const duplicated = remapGeneratedMapNamespace(generated, "generated_floor_copy");
check("namespace remap changes map identity", duplicated.id === "generated_floor_copy");
check("namespace remap rewrites placement IDs", duplicated.custom_object_placements[0].id === "dg:generated_floor_copy:object:crate");
check("namespace remap rewrites local target references", duplicated.exits[0].target_map_id === "generated_floor_copy" && duplicated.exits[0].target_spawn_id === "dg:generated_floor_copy:spawn:start");
check("duplicated generated map is protected as modified", duplicated.generation?.manuallyModified);

let duplicateRejected = false;
try {
  buildMap({
    id: "bad_ids",
    name: "Bad IDs",
    bounds: { width: 1, height: 1 },
    cells: [{ x: 0, y: 0, z: 0, active: true, walkable: true, blocks_los: false, height: 0, visual_height: 0, surface_tag: "none" }],
    spawns: [{ id: "same", cell: [0, 0], facing: [0, 1] }],
    placements: { objects: [{ id: "same", object_id: "obj_crate", cell: [0, 0], facing: [0, 1] }] },
  });
} catch (error) {
  duplicateRejected = error instanceof MapBuildError && error.issues.some((issue) => issue.code === "MAP_ID_DUPLICATE");
}
check("builder rejects duplicate stable IDs", duplicateRejected);

console.log("map contract: encounter compatibility and reference audit");
const legacyEncounter = EncounterDefinitionSchema.parse({
  id: "enc_old",
  tags: ["test"],
  faction_id: "f_guild",
  difficulty: 2,
  min_area: 4,
  slots: [{ entity_id: "ent_training_bot", min_count: 1, max_count: 2 }],
});
check("encounter schema canonicalizes legacy snake_case aliases", legacyEncounter.factionId === "f_guild" && legacyEncounter.slots[0].entityId === "ent_training_bot");

const packageBaseline = createEmptyGamePackage();
const baselineAudit = auditGamePackageReferences(packageBaseline);
check("default package reference audit has no errors", baselineAudit.valid);
check("QA package reference audit has no errors", auditGamePackageReferences(createQaSuitePackage()).valid);
check("readiness fixture reference audit has no errors", auditGamePackageReferences(createReadinessDungeonPackage()).valid);
const broken = structuredClone(packageBaseline);
broken.maps[0].entity_placements.push({ entity_id: "missing_entity", cell: [0, 0] });
const brokenAudit = auditGamePackageReferences(broken);
check("missing entity emits stable issue code and exact path", brokenAudit.issues.some((issue) => issue.code === "REF_ENTITY_MISSING" && issue.path.includes("entity_placements")));

console.log(`map contract: ${passed} checks passed`);
