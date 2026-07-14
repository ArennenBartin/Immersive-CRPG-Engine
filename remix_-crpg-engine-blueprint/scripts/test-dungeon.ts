import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import {
  buildDeterministicPlaceholderMap,
  generatedIdNamespace,
  hashMapOutput,
} from "../src/generation-facing";
import { stableContentHash } from "../src/generation-facing/stableHash";
import {
  createEmptyGamePackage,
  GamePackageSchema,
  type MapData,
} from "../src/schema/game";
import { canonicalDungeonGraph } from "../src/dungeonGen/canonical";
import { generateDungeon } from "../src/dungeonGen";
import { DungeonOccupancy } from "../src/dungeonGen/embedding/occupancy";
import {
  centeredMacroBounds,
  macroCellKey,
  routeCorridor,
  widenCorridor,
} from "../src/dungeonGen/embedding/gridSearch";
import {
  createInstitutionalRuinRecipe,
  INSTITUTIONAL_RUIN_ROOM_TEMPLATES,
  installInstitutionalRuinGeneratorContent,
} from "../src/dungeonGen/presets/institutionalRuin";
import {
  applyDungeonPackageBake,
  planDungeonPackageBake,
} from "../src/dungeonGen/packageBake";
import { DungeonRecipeSchema } from "../src/dungeonGen/schema";
import {
  createDungeonSeedContext,
  type DungeonRandom,
} from "../src/dungeonGen/seedContext";
import {
  auditDungeonRoomTemplate,
  instantiateDungeonRoomTemplate,
  rotateTemplateCell,
  rotateTemplateFacing,
  rotatedTemplateBounds,
} from "../src/dungeonGen/templates";
import {
  auditDungeonGraph,
  generateDungeonGraph,
  simulateDungeonProgression,
} from "../src/dungeonGen/topology";
import type { DungeonRecipeDef } from "../src/dungeonGen/types";
import { DUNGEON_REGRESSION_SEEDS } from "./fixtures/dungeon-regression-corpus";
import {
  createInstitutionalDungeonFixture,
  createSingleFloorDungeonFixture,
  evaluateDungeonAcceptance,
  runDungeonGeneration,
} from "./dungeon-generation-test-support";

const blocking = (values: readonly { severity: string }[]) =>
  values.filter((entry) => entry.severity === "fatal" || entry.severity === "error");

const fixturePackage = installInstitutionalRuinGeneratorContent(createEmptyGamePackage());
const archetypes = fixturePackage.dungeon_room_archetypes;

const contextFor = (recipe: DungeonRecipeDef, attemptIndex = 0) =>
  createDungeonSeedContext({
    generatorVersion: recipe.generatorVersion,
    recipeId: recipe.id,
    seed: recipe.seed,
    stageSalts: recipe.stageSalts,
    attemptIndex,
    debug: true,
  });

const draw = (stream: DungeonRandom, count = 8) =>
  Array.from({ length: count }, () => stream.next());

console.log("dungeon: default content library exercises encounter and hazard variety");
{
  const recipe = createInstitutionalRuinRecipe("content-library-check");
  const encounters = fixturePackage.dungeon_encounter_profiles.find((profile) =>
    profile.id === recipe.population.encounterProfileId);
  const hazards = fixturePackage.dungeon_hazard_profiles.find((profile) =>
    profile.id === recipe.population.hazardProfileId);
  assert.ok(encounters && encounters.situations.length >= 3);
  assert.ok(new Set(encounters.situations.map((entry) => entry.id)).size >= 3);
  assert.ok(hazards && hazards.patterns.length >= 3);
  assert.ok(new Set(hazards.patterns.map((entry) => entry.kind)).size >= 3);
}

console.log("dungeon: recipe validation returns structured failures");
{
  const valid = createInstitutionalRuinRecipe("invalid-recipe-check");
  const invalid = {
    ...valid,
    scale: {
      ...valid.scale,
      floorCount: { min: 2, max: 4 },
      roomCount: { min: 20, max: 12 },
    },
  } as unknown as DungeonRecipeDef;
  const parsed = DungeonRecipeSchema.safeParse(invalid);
  assert.equal(parsed.success, false, "invalid recipe ranges must be rejected by the schema");
  const generated = generateDungeonGraph({
    recipe: invalid,
    archetypes,
    seedContext: contextFor(valid),
  });
  assert.equal(generated.value, undefined);
  assert.ok(generated.diagnostics.length >= 2);
  assert.ok(generated.diagnostics.every((entry) => entry.code === "DNG_RECIPE_SCHEMA_INVALID"));
  assert.ok(generated.diagnostics.every((entry) => entry.stage === "recipe" && entry.severity === "fatal"));
}

console.log("dungeon: named RNG streams are deterministic and stage-isolated");
{
  const recipe = createInstitutionalRuinRecipe("rng-contract-001");
  const first = contextFor(recipe);
  const second = contextFor(recipe);
  assert.deepEqual(draw(first.stream("topology")), draw(second.stream("topology")));

  const topologySalted = {
    ...recipe,
    stageSalts: { ...recipe.stageSalts, topology: "reroll-1" },
  };
  const baselineTopology = contextFor(recipe).stream("topology");
  const changedTopology = contextFor(topologySalted).stream("topology");
  assert.notEqual(
    baselineTopology.snapshot().initialSeed,
    changedTopology.snapshot().initialSeed,
    "a topology salt must derive a different topology stream",
  );
  assert.deepEqual(
    draw(contextFor(recipe).stream("hazards")),
    draw(contextFor(topologySalted).stream("hazards")),
    "rerolling topology must not perturb the hazards stream",
  );
  assert.notEqual(
    contextFor(recipe, 0).stream("embedding").snapshot().initialSeed,
    contextFor(recipe, 1).stream("embedding").snapshot().initialSeed,
    "bounded retry attempts must use deterministic but distinct streams",
  );
}

console.log("dungeon: weighted choices are canonical, traced, and honor weights");
{
  const recipe = createInstitutionalRuinRecipe("weighted-choice-001");
  const values = [
    { id: "low", weight: 1, value: "low" },
    { id: "high", weight: 9, value: "high" },
    { id: "never", weight: 0, value: "never" },
  ];
  const ordered = contextFor(recipe).stream("rewards");
  const reversed = contextFor(recipe).stream("rewards");
  assert.equal(
    ordered.weighted(values, "canonical-order"),
    reversed.weighted([...values].reverse(), "canonical-order"),
  );
  const distribution = contextFor(recipe).stream("encounters");
  const samples = Array.from({ length: 500 }, () =>
    distribution.weighted(values, "distribution"));
  assert.equal(samples.includes("never"), false);
  assert.ok(
    samples.filter((value) => value === "high").length > 400,
    "a 9:1 table should strongly prefer the high-weight entry over a stable sample",
  );
  assert.throws(
    () => contextFor(recipe).stream("rewards").weighted([
      { id: "duplicate", weight: 1, value: 1 },
      { id: "duplicate", weight: 1, value: 2 },
    ], "duplicate-ids"),
    /duplicate ID/,
  );
}

console.log("dungeon: regression graphs satisfy declared topology and progression contracts");
for (const seed of DUNGEON_REGRESSION_SEEDS) {
  const recipe = createInstitutionalRuinRecipe(seed);
  const first = generateDungeonGraph({
    recipe,
    archetypes,
    seedContext: contextFor(recipe),
    keyItemIds: fixturePackage.items.map((item) => item.id),
  });
  assert.ok(first.value, `${seed}: graph generation failed: ${JSON.stringify(first.diagnostics)}`);
  assert.deepEqual(blocking(first.diagnostics), [], `${seed}: accepted graph has blocking diagnostics`);
  const graph = first.value!;
  assert.ok(graph.metrics.nodeCount >= recipe.scale.roomCount.min && graph.metrics.nodeCount <= recipe.scale.roomCount.max);
  assert.ok(graph.metrics.criticalPathLength >= recipe.topology.criticalPathLength.min);
  assert.ok(graph.metrics.criticalPathLength <= recipe.topology.criticalPathLength.max);
  assert.ok(graph.metrics.branchCount >= recipe.topology.branchCount.min);
  assert.ok(graph.metrics.branchCount <= recipe.topology.branchCount.max);
  assert.ok(graph.metrics.loopCount >= recipe.topology.loopCount.min);
  assert.ok(graph.metrics.loopCount <= recipe.topology.loopCount.max);
  assert.ok(graph.metrics.secretCount >= recipe.topology.secretCount.min);
  assert.ok(graph.metrics.secretCount <= recipe.topology.secretCount.max);
  assert.ok(graph.gates.length >= recipe.topology.lockCount.min);
  assert.ok(graph.gates.length <= recipe.topology.lockCount.max);
  assert.notEqual(graph.entranceNodeId, graph.objectiveNodeId);
  assert.ok(graph.nodes.some((node) => node.id === graph.entranceNodeId && node.tags.includes("entrance")));
  assert.ok(graph.nodes.some((node) => node.id === graph.objectiveNodeId && node.tags.includes("objective")));
  assert.deepEqual(blocking(auditDungeonGraph(graph, recipe)), []);
  const progression = simulateDungeonProgression(graph, recipe.topology.requireReturnPath);
  assert.equal(progression.solvable, true);
  assert.equal(progression.objectiveReachable, true);
  assert.equal(progression.returnReachable, true);
  assert.ok(graph.gates.every((gate) => progression.openedGateIds.includes(gate.id)));

  const repeated = generateDungeonGraph({
    recipe,
    archetypes,
    seedContext: contextFor(recipe),
    keyItemIds: fixturePackage.items.map((item) => item.id),
  });
  assert.deepEqual(repeated.value, graph, `${seed}: canonical graph must be deterministic`);
  assert.equal(
    stableContentHash(canonicalDungeonGraph(repeated.value!)),
    stableContentHash(canonicalDungeonGraph(graph)),
  );
}

console.log("dungeon: template rotation, sockets, reserved paths, and references are legal");
{
  const template = INSTITUTIONAL_RUIN_ROOM_TEMPLATES[0];
  assert.ok(template);
  assert.deepEqual(
    blocking(auditDungeonRoomTemplate(template, {
      objectIds: new Set(fixturePackage.object_library.map((entry) => entry.id)),
      materialIds: new Set([
        ...fixturePackage.simulation_materials.map((entry) => entry.id),
        "stone",
      ]),
    })),
    [],
  );
  const blockedSocketTemplate = structuredClone(template);
  blockedSocketTemplate.connectionSockets[0].cell = [0, 0];
  const blockedSocketDiagnostics = auditDungeonRoomTemplate(blockedSocketTemplate);
  assert.ok(blockedSocketDiagnostics.some((entry) => entry.code === "DNG_TEMPLATE_SOCKET_BLOCKED"));
  const bounds = { width: 3, depth: 5 };
  assert.deepEqual(rotatedTemplateBounds(bounds, 90), { width: 5, depth: 3 });
  assert.deepEqual(rotateTemplateCell([1, 4], bounds, 90), [0, 1]);
  assert.deepEqual(rotateTemplateCell([1, 4], bounds, 180), [1, 0]);
  assert.deepEqual(rotateTemplateFacing([0, -1], 90), [1, 0]);
  assert.deepEqual(rotateTemplateFacing([1, 0], 270), [0, -1]);

  for (const rotation of template.rotationModes) {
    const instance = instantiateDungeonRoomTemplate(template, {
      nodeId: `rotation-${rotation}`,
      mapId: "rotation-map",
      origin: [10, -7],
      rotation,
    });
    assert.equal(instance.room.sockets.length, template.connectionSockets.length);
    assert.equal(instance.reservedPaths.length, template.reservedPaths.length);
    assert.ok(instance.room.sockets.every((socket) => Math.abs(socket.facing[0]) + Math.abs(socket.facing[1]) === 1));
    assert.ok(instance.cells.every((entry) =>
      entry.cell[0] >= instance.room.bounds.x &&
      entry.cell[0] < instance.room.bounds.x + instance.room.bounds.width &&
      entry.cell[1] >= instance.room.bounds.z &&
      entry.cell[1] < instance.room.bounds.z + instance.room.bounds.depth));
  }
}

console.log("dungeon: occupancy and deterministic A* reject overlap and route around blockers");
{
  const bounds = centeredMacroBounds(9, 9);
  const occupancy = new DungeonOccupancy(bounds);
  assert.equal(occupancy.claim([0, 0], { ownerId: "room-a", kind: "room" }), true);
  assert.equal(occupancy.claim([0, 0], { ownerId: "room-b", kind: "room" }), false);
  assert.equal(occupancy.claim([0, 0], { ownerId: "room-a", kind: "reserved" }), true);
  assert.equal(occupancy.claim([99, 99], { ownerId: "room-c", kind: "room" }), false);
  const clone = occupancy.clone();
  assert.equal(clone.claim([1, 0], { ownerId: "room-b", kind: "room" }), true);
  assert.equal(occupancy.at([1, 0]), undefined, "occupancy clones must not alias mutable claims");

  const blocked = new Set<string>();
  for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
    if (z !== 2) blocked.add(macroCellKey([0, z]));
  }
  const options = { start: [-3, 0] as [number, number], goal: [3, 0] as [number, number], bounds, blocked };
  const route = routeCorridor(options);
  const repeated = routeCorridor(options);
  assert.equal(route.success, true);
  assert.deepEqual(repeated, route, "corridor A* tie-breaking must be stable");
  assert.ok(route.cells.some(([x, z]) => x === 0 && z === 2), "the route must use the only wall opening");
  assert.ok(route.cells.every((cell) => !blocked.has(macroCellKey(cell))));
  const widened = widenCorridor(route.cells, 3, bounds);
  assert.ok(widened.length > route.cells.length);
  assert.equal(new Set(widened.map(macroCellKey)).size, widened.length);
  assert.equal(routeCorridor({ ...options, start: [0, 0] }).reason, "blocked_endpoint");
}

console.log("dungeon: package bake collision policies preserve maps and protect manual edits");
{
  const makeLinkedPlaceholder = (mapId: string, otherMapId: string, floorIndex: number): MapData => {
    const map = buildDeterministicPlaceholderMap({
      mapId,
      seed: "package-bake-contract",
      name: `Bake Contract Floor ${floorIndex + 1}`,
      generatedAt: "2026-07-13T12:00:00.000Z",
    });
    const namespace = generatedIdNamespace(mapId);
    map.exits = [{
      id: `${namespace}:exit:paired-floor`,
      cell: [0, -2],
      target_map_id: otherMapId,
      target_spawn_id: `${generatedIdNamespace(otherMapId)}:spawn:start`,
      transition_id: `${namespace}:transition:paired-floor`,
      paired_exit_id: `${generatedIdNamespace(otherMapId)}:exit:paired-floor`,
      transition_kind: "stairs",
    }];
    map.generation = {
      ...map.generation!,
      bundleId: "bake-contract-bundle",
      floorIndex,
      floorCount: 2,
      outputHash: "pending",
    };
    map.generation.outputHash = hashMapOutput(map);
    return map;
  };
  const incoming = [
    makeLinkedPlaceholder("dng_bake_contract_f0", "dng_bake_contract_f1", 0),
    makeLinkedPlaceholder("dng_bake_contract_f1", "dng_bake_contract_f0", 1),
  ];
  const unrelatedIds = fixturePackage.maps.map((map) => map.id);
  const addPlan = planDungeonPackageBake(fixturePackage, incoming);
  assert.equal(addPlan.collisions.length, 0);
  const added = applyDungeonPackageBake(addPlan, { policy: "replace" });
  assert.equal(added.applied, true);
  assert.equal(added.requiresConfirmation, false);
  assert.deepEqual(added.package.maps.slice(0, unrelatedIds.length).map((map) => map.id), unrelatedIds);
  assert.ok(incoming.every((map) => added.package.maps.some((candidate) => candidate.id === map.id)));

  const collidingPackage = structuredClone(added.package);
  const edited = collidingPackage.maps.find((map) => map.id === incoming[0].id)!;
  edited.generation = { ...edited.generation!, manuallyModified: true };
  edited.display_name += " — Hand Edited";
  const collisionPlan = planDungeonPackageBake(collidingPackage, incoming);
  assert.equal(collisionPlan.collisions.length, 2);
  assert.equal(collisionPlan.collisions.some((collision) => collision.manuallyModified), true);

  const canceled = applyDungeonPackageBake(collisionPlan, { policy: "cancel" });
  assert.equal(canceled.applied, false);
  assert.equal(
    isDeepStrictEqual(canceled.package, collidingPackage),
    true,
    "cancel must preserve the source package byte-for-byte",
  );

  const unconfirmed = applyDungeonPackageBake(collisionPlan, { policy: "replace" });
  assert.equal(unconfirmed.applied, false);
  assert.equal(unconfirmed.requiresConfirmation, true);
  assert.equal(
    isDeepStrictEqual(unconfirmed.package, collidingPackage),
    true,
    "unconfirmed replace must preserve the source package byte-for-byte",
  );

  const unacknowledged = applyDungeonPackageBake(collisionPlan, {
    policy: "replace",
    confirmReplace: true,
  });
  assert.equal(unacknowledged.applied, false);
  assert.equal(unacknowledged.requiresConfirmation, true);
  assert.ok(unacknowledged.warnings.some((warning) =>
    warning.code === "dungeon_manual_edit_acknowledgement_required"));

  const replaced = applyDungeonPackageBake(collisionPlan, {
    policy: "replace",
    confirmReplace: true,
    acknowledgeManualEdits: true,
    now: new Date("2026-07-13T13:14:15.000Z"),
  });
  assert.equal(replaced.applied, true);
  assert.ok(replaced.backup);
  assert.ok(replaced.backupJson?.includes("Hand Edited"));
  assert.equal(
    replaced.package.maps.find((map) => map.id === incoming[0].id)?.display_name,
    incoming[0].display_name,
  );
  assert.deepEqual(replaced.package.maps.slice(0, unrelatedIds.length).map((map) => map.id), unrelatedIds);

  const duplicated = applyDungeonPackageBake(collisionPlan, { policy: "create_new_ids" });
  assert.equal(duplicated.applied, true);
  assert.equal(duplicated.requiresConfirmation, false);
  assert.ok(Object.values(duplicated.idMap).every((id) => id.endsWith("_2")));
  const duplicatedMaps = duplicated.bakedMapIds.map((id) =>
    duplicated.package.maps.find((map) => map.id === id)!);
  assert.equal(new Set(duplicated.package.maps.map((map) => map.id)).size, duplicated.package.maps.length);
  for (const map of duplicatedMaps) {
    assert.equal(map.generation?.manuallyModified, false);
    assert.equal(map.generation?.outputHash, hashMapOutput(map));
    assert.ok(map.exits.every((exit) => duplicated.bakedMapIds.includes(exit.target_map_id)));
    assert.ok(map.spawns.every((spawn) => spawn.id.startsWith(`${generatedIdNamespace(map.id)}:`)));
  }

  const roundTripped = GamePackageSchema.parse(JSON.parse(JSON.stringify(duplicated.package)));
  assert.equal(
    JSON.stringify(roundTripped),
    JSON.stringify(duplicated.package),
    "baked packages must survive JSON/schema round-trip",
  );
}

console.log("dungeon: full default generation is deterministic and passes v1 acceptance");
{
  const fixture = createInstitutionalDungeonFixture("institutional-ruin-full-acceptance-001");
  const first = runDungeonGeneration(fixture);
  const acceptance = evaluateDungeonAcceptance(fixture, first);
  assert.equal(
    acceptance.accepted,
    true,
    `default Institutional Ruin failed acceptance:\n${acceptance.issues.join("\n")}`,
  );
  assert.equal(first.maps.length, 2, "the default Institutional Ruin must bake two floor maps");
  assert.ok(first.graph && first.graph.metrics.nodeCount >= 16 && first.graph.metrics.nodeCount <= 20);
  assert.ok(first.graph && first.graph.metrics.loopCount >= 1);
  assert.ok(first.graph && first.graph.metrics.secretCount >= 1);
  assert.ok(first.graph && first.graph.gates.length >= 1);
  const objectiveNeighbors = first.graph?.edges.flatMap((edge) =>
    edge.fromNodeId === first.graph?.objectiveNodeId
      ? [edge.toNodeId]
      : edge.toNodeId === first.graph?.objectiveNodeId
        ? [edge.fromNodeId]
        : []) ?? [];
  assert.ok(first.graph?.nodes.some((node) => {
    if (!objectiveNeighbors.includes(node.id)) return false;
    const definition = fixture.gamePackage.dungeon_room_archetypes.find((entry) => entry.id === node.archetypeId);
    const tags = new Set([...node.tags, ...(definition?.tags ?? [])]);
    return tags.has("rest") || tags.has("staging") || tags.has("quiet");
  }), "the default recipe must stage a safe/quiet room immediately before the objective");
  assert.ok(first.maps.some((map) => map.custom_object_placements.some((placement) =>
    placement.locked && Boolean(placement.key_item_id))), "the baked dungeon must contain an ordinary keyed door");
  assert.ok(first.maps.some((map) => map.item_placements.some((placement) =>
    first.graph?.gates.some((gate) => gate.requiredId === placement.item_id))),
  "the baked dungeon must place the gate key through the ordinary item system");
  const authoredChemistry = first.maps.flatMap((map) =>
    map.cells.flatMap((cell) => cell.initial_chemistry ? [cell.initial_chemistry] : []));
  assert.ok(authoredChemistry.some((chemistry) =>
    (chemistry.liquid_volume ?? 0) > 0 || (chemistry.saturation ?? 0) > 0),
  "the default recipe must author a flooded/wet hazard pattern");
  assert.ok(authoredChemistry.some((chemistry) => (chemistry.charge ?? 0) > 0),
    "the default recipe must author an electrical hazard source");
  assert.ok(authoredChemistry.some((chemistry) => (chemistry.fuel ?? 0) > 0),
    "the default recipe must author a flammable-debris hazard pattern");
  const theme = fixture.gamePackage.dungeon_themes.find((entry) => entry.id === fixture.recipe.themeId)!;
  assert.ok(first.maps.some((map) => map.custom_object_placements.some((placement) =>
    placement.object_id === theme.architecture.pushableObjectId && placement.collision_mode !== "none")),
  "the default recipe must place a normal pushable manipulation object");
  assert.ok(first.maps.reduce((count, map) => count + map.container_placements.length, 0) >= 2,
    "the default recipe must populate two resource containers");
  const narrativeProfile = fixture.gamePackage.dungeon_narrative_profiles.find((profile) =>
    profile.id === fixture.recipe.population.narrativeProfileId)!;
  const placedNarrativeTraces = new Set(narrativeProfile.traces.flatMap((trace) => {
    const present = first.maps.some((map) =>
      map.custom_object_placements.some((placement) => placement.id?.includes(trace.id)) ||
      map.entity_placements.some((placement) => placement.id?.includes(trace.id)) ||
      map.triggers.some((trigger) => trigger.id.includes(trace.id)));
    return present ? [trace.id] : [];
  }));
  assert.ok(placedNarrativeTraces.size >= narrativeProfile.minTraceRooms,
    "the default recipe must materialize its story-trace chain through ordinary interactions");
  const encounterRooms = new Set(first.maps.flatMap((map) =>
    map.entity_placements.map((placement) => {
      const cell = map.cells.find((candidate) =>
        candidate.x === placement.cell[0] && candidate.z === placement.cell[1]);
      return `${map.id}:${cell?.room_id ?? `${placement.cell[0]}:${placement.cell[1]}`}`;
    })));
  assert.ok(first.metrics.actorCount > 0 && encounterRooms.size < first.metrics.roomCount,
    "encounters must exist without populating every room");

  const repeated = runDungeonGeneration(fixture);
  assert.equal(repeated.canonicalResultHash, first.canonicalResultHash);
  assert.deepEqual(repeated.graph, first.graph);
  assert.deepEqual(repeated.embedded, first.embedded);
  assert.deepEqual(repeated.maps, first.maps);

  const hazardRerollFixture = createInstitutionalDungeonFixture(
    fixture.recipe.seed,
    (recipe) => ({
      ...recipe,
      stageSalts: { ...recipe.stageSalts, hazards: "hazard-reroll-001" },
    }),
  );
  const hazardReroll = runDungeonGeneration(hazardRerollFixture);
  assert.equal(hazardReroll.success, true);
  assert.deepEqual(hazardReroll.graph, first.graph, "hazard reroll must not perturb topology");
  assert.deepEqual(hazardReroll.embedded, first.embedded, "hazard reroll must not perturb embedding");
  assert.notEqual(hazardReroll.canonicalResultHash, first.canonicalResultHash);
}

console.log("dungeon: single-floor generation uses the same ordinary-map pipeline");
{
  const fixture = createSingleFloorDungeonFixture("institutional-ruin-single-floor-001");
  const result = runDungeonGeneration(fixture);
  const acceptance = evaluateDungeonAcceptance(fixture, result);
  assert.equal(
    acceptance.accepted,
    true,
    `single-floor generation failed acceptance:\n${acceptance.issues.join("\n")}`,
  );
  assert.equal(result.maps.length, 1);
  assert.equal(result.embedded?.maps.length, 1);
  assert.equal(result.embedded?.transitions.length, 0);
  assert.equal(result.maps[0].exits.length, 0);
}

console.log("dungeon: cancellation is deterministic and never yields a bakeable partial result");
{
  const fixture = createInstitutionalDungeonFixture("institutional-ruin-cancel-001");
  const cancel = () => true;
  const first = generateDungeon({
    recipe: fixture.recipe,
    gamePackage: fixture.gamePackage,
    generatedAt: "2026-07-13T12:00:00.000Z",
    shouldCancel: cancel,
  });
  const second = generateDungeon({
    recipe: fixture.recipe,
    gamePackage: fixture.gamePackage,
    generatedAt: "2026-07-13T12:00:00.000Z",
    shouldCancel: cancel,
  });
  assert.equal(first.success, false);
  assert.equal(first.maps.length, 0);
  assert.equal(first.canonicalResultHash, undefined);
  assert.ok(first.diagnostics.some((entry) => entry.code === "DNG_GENERATION_CANCELED"));
  assert.equal(second.success, first.success);
  assert.deepEqual(second.graph, first.graph);
  assert.deepEqual(second.embedded, first.embedded);
  assert.deepEqual(second.maps, first.maps);
  assert.deepEqual(
    second.diagnostics.map((entry) => [entry.severity, entry.stage, entry.code]),
    first.diagnostics.map((entry) => [entry.severity, entry.stage, entry.code]),
  );
}

console.log("dungeon generator tests passed");
