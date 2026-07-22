import assert from "node:assert/strict";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  PHASE_11_DEATH_CUTSCENE_ID,
  PHASE_11_SIGNATURE_CUTSCENE_ID,
  createPhase11IntegratedArchitectureFixture,
} from "../src/data/qaSuite/integratedArchitectureScenario";
import {
  auditGamePackageReferences,
  hashMapOutput,
} from "../src/generation-facing";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import {
  communeWithPersistentGhost,
  consumeGlassFuel,
  getArtifactRecords,
  getDeathBundles,
  getGlassBurden,
  getPersistentGhosts,
  getRecoverableGlassValue,
  normalizeFractureCrawlCampaign,
  recoverCarriedArtifactsToHub,
  recoverDeathBundle,
  transitionFractureCrawlOnDeath,
} from "../src/engine-core/fractureCrawlLegacy";
import {
  dispatchV1DropItem,
  dispatchV1EmitSound,
  dispatchV1PushObject,
  dispatchV1TakeItem,
} from "../src/engine-core/v1Runtime";
import { resolveImmersiveLightSources } from "../src/engine-core/visibility";
import type { SimulationEnvironmentFieldRecord, PlaySave } from "../src/schema/save";
import {
  migratePlaySaveV1ToV2,
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";

type Cell = [number, number];

const jsonRoundTrip = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const setLocation = (
  save: PlaySave,
  mapId: string,
  cell: Cell,
): PlaySave => ({
  ...save,
  current_map_id: mapId,
  player: {
    ...save.player,
    cell: [...cell],
    facing: [0, -1],
  },
});

const countInventory = (save: PlaySave, itemId: string) =>
  save.inventory.find((entry) => entry.id === itemId)?.count || 0;

const allFields = (
  save: PlaySave,
  mapId: string,
): SimulationEnvironmentFieldRecord[] =>
  Object.values(save.map_deltas?.[mapId]?.environment_fields || {}).flat();

const basePackage = createQaSuitePackage();
const fixture = createPhase11IntegratedArchitectureFixture(basePackage);
const repeatedFixture = createPhase11IntegratedArchitectureFixture(basePackage);
const { gamePackage, generation, ids, cells } = fixture;

console.log("phase 11: fixed-seed generated fracture is committed and deterministic");
assert.equal(generation.success, true);
assert.ok(generation.graph && generation.embedded);
assert.equal(generation.maps.length, 1);
assert.equal(generation.embedded?.transitions.length, 0);
assert.ok(generation.graph?.edges.every((edge) => edge.kind === "open"));
assert.equal(
  repeatedFixture.generation.canonicalResultHash,
  generation.canonicalResultHash,
  "same package, seed, recipe, and generator must reproduce one canonical fracture",
);
assert.deepEqual(
  repeatedFixture.generation.maps.map((map) => map.id),
  generation.maps.map((map) => map.id),
);
assert.deepEqual(repeatedFixture.cells, cells);
assert.equal(gamePackage.metadata.start_map_id, ids.hubMapId);
assert.equal(gamePackage.metadata.start_spawn_id, ids.hubSpawnId);
assert.ok(gamePackage.maps.some((map) => map.id === ids.hubMapId));

for (const generated of generation.maps) {
  const committed = gamePackage.maps.find((map) => map.id === generated.id);
  assert.ok(committed, `${generated.id} must be an ordinary committed map`);
  assert.equal(committed.generation?.generatorId, "dungeon");
  assert.equal(committed.generation?.seed, generation.seed);
  assert.equal(
    committed.generation?.manuallyModified,
    true,
    "scenario placements must be an explicit manual layer over the bake",
  );
  assert.equal(committed.generation?.outputHash, hashMapOutput(committed));
  const report = validateOrdinaryMap(committed, { package: gamePackage });
  assert.equal(
    report.valid,
    true,
    `${committed.id}: ${report.issues.map((issue) => issue.code).join(", ")}`,
  );
}
assert.equal(
  validateOrdinaryMap(
    gamePackage.maps.find((map) => map.id === ids.hubMapId)!,
    { package: gamePackage },
  ).valid,
  true,
);
assert.equal(
  auditGamePackageReferences(gamePackage).valid,
  true,
  "integrated package must retain all map/item/entity/cutscene references",
);

console.log("phase 11: one authored scenario exposes every required architecture socket");
const generatedMaps = gamePackage.maps.filter((map) =>
  generation.maps.some((generated) => generated.id === map.id),
);
const generatedEntities = generatedMaps.flatMap((map) => map.entity_placements);
assert.deepEqual(
  new Set(generatedEntities.map((placement) => placement.entity_id)),
  new Set(["qa_sight_watcher", "qa_sound_hunter", "qa_light_glass_watcher"]),
);
const sensoryProfiles = [
  "qa_sight_watcher",
  "qa_sound_hunter",
  "qa_light_glass_watcher",
].map((id) => gamePackage.entities.find((entity) => entity.id === id)?.sensory_profile);
assert.ok(
  sensoryProfiles[0]?.channels.some(
    (channel) =>
      channel.stimulus_kinds.includes("visible_player") &&
      channel.requires_los &&
      channel.requires_illumination,
  ),
);
assert.ok(
  sensoryProfiles[1]?.channels.some(
    (channel) => channel.stimulus_kinds.includes("sound") && !channel.requires_los,
  ),
);
assert.ok(
  sensoryProfiles[2]?.channels.some(
    (channel) =>
      channel.stimulus_kinds.includes("light") &&
      channel.stimulus_tags?.includes("glass"),
  ),
);
assert.equal(
  generatedMaps.flatMap((map) => map.cells).filter((cell) => cell.tag === "smoke_obscurance").length,
  4,
);

const carriedLight = gamePackage.items.find((item) => item.id === ids.carriedLightItemId);
const placeableLight = gamePackage.items.find((item) => item.id === ids.placeableLightItemId);
const throwableLight = gamePackage.items.find((item) => item.id === ids.throwableLightItemId);
const glassBurner = gamePackage.items.find((item) => item.id === ids.glassBurnerItemId);
assert.equal(carriedLight?.light_source?.mobility, "portable");
assert.equal(carriedLight?.light_source?.radius, 14);
assert.equal(carriedLight?.light_source?.active_by_default, true);
const entranceGeneratedMap = generatedMaps.find((map) => map.id === ids.entranceMapId)!;
const generatedLanternPlacements = entranceGeneratedMap.item_placements.filter(
  (placement) => placement.item_id === ids.carriedLightItemId,
);
assert.equal(generatedLanternPlacements.length, 1);
const generatedEntranceSpawn = entranceGeneratedMap.spawns.find(
  (spawn) => spawn.id === ids.entranceSpawnId,
)!;
assert.ok(
  Math.abs(generatedLanternPlacements[0].cell[0] - generatedEntranceSpawn.cell[0]) +
    Math.abs(generatedLanternPlacements[0].cell[1] - generatedEntranceSpawn.cell[1]) <=
    2,
  "the generated Expedition Lantern must begin within two cells of the safe spawn",
);
assert.equal(placeableLight?.light_source?.mobility, "portable");
assert.ok(placeableLight?.light_source?.stimulus_tags.includes("placeable_light"));
assert.equal(throwableLight?.light_source?.mobility, "throwable");
assert.ok(throwableLight?.light_source?.duration_ticks);
assert.equal(glassBurner?.glass_fuel?.resource_item_id, ids.glassItemId);
assert.ok(
  gamePackage.maps
    .find((map) => map.id === ids.shortcutMapId)
    ?.custom_object_placements.some(
      (placement) =>
        placement.id === ids.shortcutObjectId &&
        placement.object_id === "qa_phase11_loop_rubble",
    ),
);
const rubbleDefinition = gamePackage.object_library.find(
  (object) => object.id === "qa_phase11_loop_rubble",
);
assert.ok(rubbleDefinition?.tags.includes("pushable"));
assert.ok(rubbleDefinition?.tags.includes("breakable"));
assert.equal(
  generatedMaps.flatMap((map) => map.custom_object_placements)
    .filter((placement) => placement.object_id === "obj_p_door").length,
  0,
);
assert.ok(
  gamePackage.maps
    .find((map) => map.id === ids.objectiveMapId)
    ?.exits.some((entry) => entry.id === ids.extractionId && entry.target_map_id === ids.hubMapId),
);
assert.ok(gamePackage.cutscenes.some((cutscene) => cutscene.id === PHASE_11_DEATH_CUTSCENE_ID));
assert.ok(gamePackage.cutscenes.some((cutscene) => cutscene.id === PHASE_11_SIGNATURE_CUTSCENE_ID));

const hubSpawn = gamePackage.maps
  .find((map) => map.id === ids.hubMapId)!
  .spawns.find((spawn) => spawn.id === ids.hubSpawnId)!;
const makeSave = (): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: ids.hubMapId,
  player: {
    cell: [Number(hubSpawn.cell[0] ?? 0), Number(hubSpawn.cell[1] ?? 0)],
    facing: [Number(hubSpawn.facing[0] ?? 0), Number(hubSpawn.facing[1] ?? -1)],
    sprite_id: String(gamePackage.settings.player_sprite_id || "qa_phase11_player"),
  },
  playerStats: {
    hp: 24,
    max_hp: 24,
    mp: 12,
    max_mp: 12,
    attack: 5,
    defense: 2,
    speed: 10,
    energy: 1000,
  },
  level: 1,
  experience: 0,
  pending_level_ups: 0,
  known_skills: [ids.signatureSkillId],
  flags: { ...(gamePackage.switches || {}) },
  variables: {},
  relationships: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 20,
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
});

console.log("phase 11: enter the fracture with a deterministic generated Intercessor");
let save = normalizeFractureCrawlCampaign(gamePackage, makeSave());
const firstIntercessorId = save.intercessor_campaign?.current_intercessor_id;
const firstIntercessor = firstIntercessorId
  ? save.intercessor_campaign?.records[firstIntercessorId]
  : undefined;
assert.ok(firstIntercessorId && firstIntercessor?.display_name);
assert.equal(getArtifactRecords(save).find((artifact) => artifact.id === ids.artifactId)?.state, "AtOrigin");

save = setLocation(save, ids.entranceMapId, cells.carriedLight);
assert.ok(
  resolveImmersiveLightSources(gamePackage, save, ids.entranceMapId).some(
    (source) =>
      source.source_kind === "authored_item" &&
      source.definition_key === `item:${ids.carriedLightItemId}`,
  ),
  "the generated Expedition Lantern must illuminate the entrance while grounded",
);
for (const cell of [
  cells.carriedLight,
  cells.placeableLight,
  cells.throwableLight,
  cells.glassBurner,
]) {
  const pickup = dispatchV1TakeItem({
    gamePackage,
    save: setLocation(save, ids.entranceMapId, cell),
    mapId: ids.entranceMapId,
    x: cell[0],
    y: cell[1],
  });
  assert.equal(pickup.ok, true);
  save = pickup.save;
}
assert.equal(countInventory(save, ids.carriedLightItemId), 1);
assert.equal(countInventory(save, ids.placeableLightItemId), 1);
assert.equal(countInventory(save, ids.throwableLightItemId), 1);
assert.equal(countInventory(save, ids.glassBurnerItemId), 1);
assert.ok(
  resolveImmersiveLightSources(gamePackage, save, ids.entranceMapId).some(
    (source) =>
      source.source_kind === "carried_item" &&
      source.definition_key === `item:${ids.carriedLightItemId}`,
  ),
  "carried light must become an authoritative mobile source",
);
const lanternRefreshRoundTrip = unwrapPlaySaveV1(
  normalizePlaySaveToV2(jsonRoundTrip(migratePlaySaveV1ToV2(save))),
);
assert.equal(countInventory(lanternRefreshRoundTrip, ids.carriedLightItemId), 1);
assert.ok(
  resolveImmersiveLightSources(gamePackage, lanternRefreshRoundTrip, ids.entranceMapId).some(
    (source) =>
      source.source_kind === "carried_item" &&
      source.definition_key === `item:${ids.carriedLightItemId}`,
  ),
  "the carried Expedition Lantern must remain illuminated after save/load and browser-style JSON refresh",
);

const placed = dispatchV1DropItem({
  gamePackage,
  save,
  mapId: ids.entranceMapId,
  itemId: ids.placeableLightItemId,
  count: 1,
  cell: cells.placeableLight,
});
assert.equal(placed.ok, true);
save = placed.save;
const thrown = dispatchV1DropItem({
  gamePackage,
  save,
  mapId: ids.entranceMapId,
  itemId: ids.throwableLightItemId,
  count: 1,
  cell: cells.throwableLight,
});
assert.equal(thrown.ok, true);
save = thrown.save;
const deployedSources = resolveImmersiveLightSources(gamePackage, save, ids.entranceMapId);
assert.ok(
  deployedSources.some(
    (source) =>
      source.source_kind === "dropped_item" &&
      source.definition_key === `item:${ids.placeableLightItemId}`,
  ),
);
assert.ok(
  deployedSources.some(
    (source) =>
      source.source_kind === "dropped_item" &&
      source.definition_key === `item:${ids.throwableLightItemId}`,
  ),
);

console.log("phase 11: sound, obscurance, Glass harvest, and the value-for-light choice agree");
const soundMap = generatedMaps.find((map) =>
  map.entity_placements.some((placement) => placement.id === "qa_phase11_sound_creature"),
)!;
const sounded = dispatchV1EmitSound({
  gamePackage,
  save: setLocation(save, soundMap.id, cells.soundDistraction),
  mapId: soundMap.id,
  actorId: "player",
  cell: cells.soundDistraction,
  loudness: 10,
  tag: "phase11_distraction",
  materialTag: "stone",
  sourceCategory: "object_interaction",
  sourceAction: "push",
  revealsIdentity: false,
  durationTicks: 30,
  tags: ["sound", "impact", "distraction"],
  compactPropagation: true,
});
assert.equal(sounded.ok, true);
save = sounded.save;
assert.ok(
  allFields(save, soundMap.id).some(
    (field) =>
      field.kind === "sound" &&
      field.frequency_tag === "phase11_distraction" &&
      field.reveals_identity === false,
  ),
);

const glassMap = generatedMaps.find((map) =>
  map.item_placements.some((placement) => placement.id === ids.glassPlacementId),
)!;
const glassPickup = dispatchV1TakeItem({
  gamePackage,
  save: setLocation(save, glassMap.id, cells.glass),
  mapId: glassMap.id,
  x: cells.glass[0],
  y: cells.glass[1],
});
assert.equal(glassPickup.ok, true);
save = glassPickup.save;
assert.equal(countInventory(save, ids.glassItemId), 4);
assert.equal(getRecoverableGlassValue(save), 60);
assert.equal(getGlassBurden(save), 1);
const burned = consumeGlassFuel(gamePackage, save, {
  lightItemId: ids.glassBurnerItemId,
  currentTick: 100,
  eventId: "phase11:glass-choice",
});
assert.equal(burned.outcome, "ignited");
assert.equal(burned.unitsConsumed, 1);
assert.equal(burned.expiresAtTick, 340);
save = burned.save;
assert.equal(countInventory(save, ids.glassItemId), 3);
assert.equal(getRecoverableGlassValue(save), 45);
assert.equal(getGlassBurden(save), 0.75);
assert.ok(
  resolveImmersiveLightSources(gamePackage, save, glassMap.id).some(
    (source) =>
      source.definition_key === `item:${ids.glassBurnerItemId}` &&
      source.expires_at_tick === 340 &&
      source.stimulus_tags.includes("glass"),
  ),
);

console.log("phase 11: artifact, shortcut, death, ghost, signature, and bundle form one route");
const artifactPickup = dispatchV1TakeItem({
  gamePackage,
  save: setLocation(save, ids.objectiveMapId, cells.artifact),
  mapId: ids.objectiveMapId,
  x: cells.artifact[0],
  y: cells.artifact[1],
});
assert.equal(artifactPickup.ok, true);
save = artifactPickup.save;
assert.equal(countInventory(save, ids.artifactItemId), 1);
assert.equal(
  getArtifactRecords(save).find((artifact) => artifact.id === ids.artifactId)?.state,
  "Carried",
);

const movedShortcut = dispatchV1PushObject({
  gamePackage,
  save: setLocation(save, ids.shortcutMapId, cells.shortcut),
  mapId: ids.shortcutMapId,
  x: cells.shortcut[0],
  y: cells.shortcut[1],
  dx: cells.shortcutPush[0],
  dy: cells.shortcutPush[1],
});
assert.equal(movedShortcut.ok, true, movedShortcut.reason);
save = movedShortcut.save;
assert.ok(save.map_deltas?.[ids.shortcutMapId]?.moved_objects?.[ids.shortcutObjectId]);

save = setLocation(save, ids.objectiveMapId, cells.artifact);
save = {
  ...save,
  playerStats: { ...save.playerStats, hp: 0 },
  clock_minutes: 73,
};
const death = transitionFractureCrawlOnDeath(gamePackage, save, {
  cause: "Phase 11 architecture proof",
});
assert.equal(death.changed, true);
assert.equal(death.deceasedIntercessorId, firstIntercessorId);
assert.ok(death.successorIntercessorId && death.successorIntercessorId !== firstIntercessorId);
assert.equal(death.save.current_map_id, ids.hubMapId);
save = death.save;
assert.ok(
  save.map_deltas?.[ids.shortcutMapId]?.moved_objects?.[ids.shortcutObjectId],
  "the authored loop rubble must survive the expedition reset",
);
const ghost = getPersistentGhosts(save).find((entry) => entry.id === death.ghostId);
const bundle = getDeathBundles(save).find((entry) => entry.id === death.deathBundleId);
assert.ok(ghost && bundle);
assert.equal(ghost.map_id, ids.objectiveMapId);
assert.equal(bundle.map_id, ids.objectiveMapId);
assert.ok(bundle.artifact_ids.includes(ids.artifactId));
assert.equal(
  getArtifactRecords(save).find((artifact) => artifact.id === ids.artifactId)?.state,
  "InDeathBundle",
);

save = setLocation(save, ghost.map_id, ghost.cell);
const communion = communeWithPersistentGhost(gamePackage, save, ghost.id);
assert.equal(communion.outcome, "inherited");
assert.equal(communion.skillId, ids.signatureSkillId);
assert.ok(communion.save.known_skills.includes(ids.signatureSkillId));
save = communion.save;
const repeatedCommunion = communeWithPersistentGhost(gamePackage, save, ghost.id);
assert.equal(repeatedCommunion.outcome, "already_inherited");
assert.equal(
  repeatedCommunion.ghost?.interaction_order.length,
  1,
  "repeat communion must not create a second inheritance interaction",
);
assert.equal(
  repeatedCommunion.save.known_skills.filter((skillId) => skillId === ids.signatureSkillId).length,
  1,
  "repeat communion must not duplicate the signature skill",
);

const bundleRecovery = recoverDeathBundle(gamePackage, save, bundle.id);
assert.equal(bundleRecovery.outcome, "recovered");
assert.ok(bundleRecovery.artifactIds.includes(ids.artifactId));
save = bundleRecovery.save;
assert.equal(countInventory(save, ids.artifactItemId), 1);
assert.equal(
  getArtifactRecords(save).find((artifact) => artifact.id === ids.artifactId)?.state,
  "Carried",
);

console.log("phase 11: extraction archives the artifact and survives save/reload");
const extraction = gamePackage.maps
  .find((map) => map.id === ids.objectiveMapId)!
  .exits.find((entry) => entry.id === ids.extractionId)!;
assert.equal(extraction.target_map_id, ids.hubMapId);
save = setLocation(save, ids.hubMapId, hubSpawn.cell as Cell);
const archived = recoverCarriedArtifactsToHub(gamePackage, save);
assert.deepEqual(archived.artifactIds, [ids.artifactId]);
save = archived.save;
assert.equal(countInventory(save, ids.artifactItemId), 0);
assert.equal(
  getArtifactRecords(save).find((artifact) => artifact.id === ids.artifactId)?.state,
  "RecoveredToHub",
);
assert.equal(getRecoverableGlassValue(save), 45);
assert.equal(getGlassBurden(save), 0.75);

const v2 = migratePlaySaveV1ToV2(save);
const restored = unwrapPlaySaveV1(
  normalizePlaySaveToV2(jsonRoundTrip(v2)),
);
assert.equal(restored.current_map_id, ids.hubMapId);
assert.ok(restored.map_deltas?.[ids.shortcutMapId]?.moved_objects?.[ids.shortcutObjectId]);
assert.equal(
  getArtifactRecords(restored).find((artifact) => artifact.id === ids.artifactId)?.state,
  "RecoveredToHub",
);
assert.equal(getPersistentGhosts(restored).length, getPersistentGhosts(save).length);
assert.equal(getDeathBundles(restored).find((entry) => entry.id === bundle.id)?.status, "recovered");
assert.equal(getRecoverableGlassValue(restored), 45);
assert.equal(
  getPersistentGhosts(restored)
    .find((entry) => entry.id === ghost.id)
    ?.interaction_order.length,
  1,
);

console.log("Phase 11 integrated architecture scenario: all assertions passed.");
