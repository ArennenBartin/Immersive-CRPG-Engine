import assert from "node:assert/strict";
import {
  communeWithPersistentGhost,
  consumeGlassFuel,
  getArtifactRecords,
  getDeathBundles,
  getGlassBurden,
  getPersistentGhosts,
  getRecoverableGlassValue,
  normalizeFractureCrawlCampaign,
  recordArtifactPickup,
  recordGlassHarvest,
  recoverCarriedArtifactsToHub,
  recoverDeathBundle,
  transitionFractureCrawlOnDeath,
} from "../src/engine-core/fractureCrawlLegacy";
import { resolveImmersiveLightSources } from "../src/engine-core/visibility";
import {
  dispatchV1DropItem,
  dispatchV1GiveItem,
  dispatchV1SellInventoryItem,
  dispatchV1StowInContainer,
  dispatchV1TakeItem,
} from "../src/engine-core/v1Runtime";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import { auditGamePackageReferences } from "../src/generation-facing/referenceAudit";
import {
  QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  QA_PERSISTENCE_MAP_ID,
} from "../src/data/qaSuite/persistenceWing";
import type { GamePackage } from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";
import {
  migratePlaySaveV1ToV2,
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";

const ARTIFACT_ID = "artifact:qa:violet_archive_seal";
const ARTIFACT_ITEM_ID = "qa_persistence_artifact";
const GLASS_ITEM_ID = "qa_persistence_glass";
const LAMP_ITEM_ID = "qa_persistence_emergency_lamp";
const GLASS_PLACEMENT_ID = "qa_persistence_glass_placement";
const LAMP_PLACEMENT_ID = "qa_persistence_emergency_lamp_placement";
const FIRST_SIGNATURE = "qa_skill_line_bolt";
const SECOND_SIGNATURE = "qa_skill_first_aid";

const jsonRoundTrip = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const assertNear = (actual: number, expected: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`,
  );
};

const countInventory = (save: PlaySave, itemId: string) =>
  save.inventory.find((entry) => entry.id === itemId)?.count || 0;

const addInventory = (
  save: PlaySave,
  additions: Array<{ id: string; count: number }>,
): PlaySave => {
  const inventory = new Map(save.inventory.map((entry) => [entry.id, entry.count]));
  additions.forEach((entry) => {
    inventory.set(entry.id, (inventory.get(entry.id) || 0) + entry.count);
  });
  return {
    ...save,
    inventory: [...inventory.entries()].map(([id, count]) => ({ id, count })),
  };
};

const markPlacementsTaken = (save: PlaySave, placementIds: string[]): PlaySave => {
  const delta = save.map_deltas?.[QA_PERSISTENCE_MAP_ID] || {};
  return {
    ...save,
    map_deltas: {
      ...(save.map_deltas || {}),
      [QA_PERSISTENCE_MAP_ID]: {
        ...delta,
        taken_items: Array.from(
          new Set([...(delta.taken_items || []), ...placementIds]),
        ),
      },
    },
  };
};

const makeSave = (gamePackage: GamePackage): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: QA_PERSISTENCE_MAP_ID,
  player: {
    cell: [2, 5],
    facing: [0, -1],
    sprite_id: String(gamePackage.settings?.player_sprite_id || "qa_contract_player"),
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
  known_skills: [FIRST_SIGNATURE],
  flags: { ...(gamePackage.switches || {}) },
  quests: {},
  inventory: [],
  money: 0,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 10,
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
});

const assertReachableMarker = (
  gamePackage: GamePackage,
  mapId: string,
  cell: [number, number],
  label: string,
) => {
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  assert.ok(map, `${label}: marker map must exist`);
  const authoredCell = map.cells.find(
    (candidate) => candidate.x === cell[0] && candidate.z === cell[1],
  );
  assert.ok(authoredCell?.active && authoredCell.walkable, `${label}: marker must use a walkable cell`);
};

const gamePackage = createQaSuitePackage();
const lab = gamePackage.maps.find((map) => map.id === QA_PERSISTENCE_MAP_ID);
assert.ok(lab, "Phase 6-8 QA persistence lab must exist");
assert.ok(
  lab.item_placements.some((placement) => placement.id === GLASS_PLACEMENT_ID),
  "QA lab must expose harvestable Raw Glass",
);
assert.ok(
  lab.item_placements.some((placement) => placement.id === LAMP_PLACEMENT_ID),
  "QA lab must expose the Glass emergency lamp",
);
assert.equal(
  auditGamePackageReferences(gamePackage).valid,
  true,
  "the authored Phase 6-8 QA package must pass reference validation",
);
const missingArtifactOrigin = structuredClone(gamePackage);
const missingOriginLab = missingArtifactOrigin.maps.find(
  (map) => map.id === QA_PERSISTENCE_MAP_ID,
);
assert.ok(missingOriginLab);
missingOriginLab.item_placements = missingOriginLab.item_placements.filter(
  (placement) => placement.id !== QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
);
assert.ok(
  auditGamePackageReferences(missingArtifactOrigin).issues.some(
    (issue) => issue.code === "REF_ARTIFACT_ORIGIN_MISSING",
  ),
  "map editing that breaks a registered origin must produce a diagnostic",
);
const invalidGlassFuel = structuredClone(gamePackage);
const invalidLamp = invalidGlassFuel.items.find((item) => item.id === LAMP_ITEM_ID);
assert.ok(invalidLamp?.glass_fuel);
invalidLamp.glass_fuel.resource_item_id = "qa_persistence_supplies";
assert.ok(
  auditGamePackageReferences(invalidGlassFuel).issues.some(
    (issue) => issue.code === "REF_GLASS_FUEL_RESOURCE_INVALID",
  ),
  "Glass-fuel authoring must reject a resource that is not tracked Glass",
);

console.log("phases 7-8: engine item commands enter or respect the campaign lifecycle");
const artifactPlacement = lab.item_placements.find(
  (placement) => placement.id === QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
);
assert.ok(artifactPlacement);
const commandPickup = dispatchV1TakeItem({
  gamePackage,
  save: makeSave(gamePackage),
  mapId: QA_PERSISTENCE_MAP_ID,
  x: artifactPlacement.cell[0],
  y: artifactPlacement.cell[1],
});
assert.equal(commandPickup.ok, true);
assert.equal(getArtifactRecords(commandPickup.save)[0]?.state, "Carried");
assert.equal(countInventory(commandPickup.save, ARTIFACT_ITEM_ID), 1);
assert.equal(
  dispatchV1DropItem({
    gamePackage,
    save: commandPickup.save,
    itemId: ARTIFACT_ITEM_ID,
    cell: [artifactPlacement.cell[0] ?? 0, artifactPlacement.cell[1] ?? 0],
  }).ok,
  false,
  "generic drop cannot bypass the registered-artifact state machine",
);
assert.equal(
  dispatchV1StowInContainer({
    gamePackage,
    save: commandPickup.save,
    containerId: "irrelevant:guard_runs_first",
    itemId: ARTIFACT_ITEM_ID,
  }).ok,
  false,
  "generic container stow cannot hide a registered artifact from its lifecycle",
);
assert.equal(
  dispatchV1SellInventoryItem({
    gamePackage,
    save: commandPickup.save,
    itemId: ARTIFACT_ITEM_ID,
  }).ok,
  false,
  "generic sale cannot destroy a registered artifact",
);
assert.equal(
  dispatchV1GiveItem({
    gamePackage,
    save: commandPickup.save,
    itemId: GLASS_ITEM_ID,
    count: 1,
  }).ok,
  false,
  "tracked Glass must enter through a harvest rather than an unledgered grant",
);

console.log("phases 6-8: normalize the campaign registry and collect the conserved resources");
let save = normalizeFractureCrawlCampaign(gamePackage, makeSave(gamePackage));
assert.ok(save.intercessor_campaign, "normalization must initialize Intercessor succession");
assert.ok(save.fracture_crawl_campaign, "normalization must initialize the Phase 6-8 registry");
assert.strictEqual(
  normalizeFractureCrawlCampaign(gamePackage, save),
  save,
  "canonical Phase 6-8 normalization must be referentially idempotent",
);
assert.equal(getArtifactRecords(save).length, 1, "QA suite must register exactly one artifact");
assert.equal(getArtifactRecords(save)[0].id, ARTIFACT_ID);
assert.equal(getArtifactRecords(save)[0].state, "AtOrigin");

save = markPlacementsTaken(
  addInventory(save, [
    { id: ARTIFACT_ITEM_ID, count: 1 },
    { id: GLASS_ITEM_ID, count: 6 },
    { id: LAMP_ITEM_ID, count: 1 },
  ]),
  [GLASS_PLACEMENT_ID, LAMP_PLACEMENT_ID],
);
const artifactPickup = recordArtifactPickup(gamePackage, save, {
  mapId: QA_PERSISTENCE_MAP_ID,
  placementId: QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  itemId: ARTIFACT_ITEM_ID,
});
assert.deepEqual(artifactPickup.artifactIds, [ARTIFACT_ID]);
save = artifactPickup.save;
assert.equal(getArtifactRecords(save)[0].state, "Carried");
assert.ok(
  save.map_deltas?.[QA_PERSISTENCE_MAP_ID]?.taken_items?.includes(
    QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  ),
  "artifact pickup must remove the unique authored origin",
);
const duplicatePickup = recordArtifactPickup(gamePackage, save, {
  mapId: QA_PERSISTENCE_MAP_ID,
  placementId: QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
});
assert.deepEqual(duplicatePickup.artifactIds, []);
assert.equal(countInventory(duplicatePickup.save, ARTIFACT_ITEM_ID), 1);

const harvest = recordGlassHarvest(gamePackage, save, {
  itemId: GLASS_ITEM_ID,
  itemCount: 6,
  sourceId: `${QA_PERSISTENCE_MAP_ID}:${GLASS_PLACEMENT_ID}`,
});
assert.equal(harvest.outcome, "recorded");
assert.equal(harvest.units, 6);
assertNear(harvest.recoverableValue, 72, "six Raw Glass must expose its recovery value");
assertNear(harvest.burden, 1.2, "six Raw Glass must expose its carried burden");
save = harvest.save;
assertNear(getRecoverableGlassValue(save), 72, "Glass getter must match the ledger");
assertNear(getGlassBurden(save), 1.2, "burden getter must match carried Glass");
const repeatedHarvest = recordGlassHarvest(gamePackage, save, {
  itemId: GLASS_ITEM_ID,
  itemCount: 6,
  sourceId: `${QA_PERSISTENCE_MAP_ID}:${GLASS_PLACEMENT_ID}`,
});
assert.equal(repeatedHarvest.outcome, "already_recorded");
assert.equal(repeatedHarvest.changed, false);
assertNear(repeatedHarvest.recoverableValue, 72, "replaying a harvest cannot mint value");

const ignition = consumeGlassFuel(gamePackage, save, {
  lightItemId: LAMP_ITEM_ID,
  currentTick: 10,
  eventId: "qa:fuel:first-ignition",
});
assert.equal(ignition.outcome, "ignited");
assert.equal(ignition.itemCountConsumed, 1);
assert.equal(ignition.unitsConsumed, 1);
assert.equal(ignition.expiresAtTick, 250);
assert.equal(countInventory(ignition.save, GLASS_ITEM_ID), 5);
assertNear(ignition.recoverableValue, 60, "burning one Glass must reduce recovery value");
assertNear(ignition.burden, 1, "burning one Glass must reduce carried burden");
save = ignition.save;
const activeLamp = resolveImmersiveLightSources(
  gamePackage,
  save,
  QA_PERSISTENCE_MAP_ID,
).find((source) => source.definition_key === `item:${LAMP_ITEM_ID}`);
assert.equal(activeLamp?.source_kind, "carried_item");
assert.equal(activeLamp?.expires_at_tick, 250);
assert.ok(activeLamp?.stimulus_tags.includes("light"));
assert.ok(activeLamp?.stimulus_tags.includes("glass"));

const repeatedIgnition = consumeGlassFuel(gamePackage, save, {
  lightItemId: LAMP_ITEM_ID,
  currentTick: 10,
  eventId: "qa:fuel:first-ignition",
});
assert.equal(repeatedIgnition.outcome, "already_consumed");
assert.equal(repeatedIgnition.changed, false);
assert.equal(countInventory(repeatedIgnition.save, GLASS_ITEM_ID), 5);
assertNear(repeatedIgnition.recoverableValue, 60, "replaying ignition cannot consume twice");
const expiredLampSave: PlaySave = { ...save, clock_minutes: 250 };
assert.equal(
  resolveImmersiveLightSources(
    gamePackage,
    expiredLampSave,
    QA_PERSISTENCE_MAP_ID,
  ).some((source) => source.definition_key === `item:${LAMP_ITEM_ID}`),
  false,
  "Glass-fueled light must disappear from authoritative lighting at expiry",
);

console.log("phase 6: death materializes a persistent ghost and an independent bundle");
const lethalSave: PlaySave = {
  ...save,
  playerStats: { ...save.playerStats, hp: 0 },
};
const firstDeath = transitionFractureCrawlOnDeath(gamePackage, lethalSave, {
  cause: "Phase 6-8 contract",
});
assert.equal(firstDeath.changed, true);
assert.ok(firstDeath.deceasedIntercessorId);
assert.ok(firstDeath.successorIntercessorId);
assert.ok(firstDeath.ghostId);
assert.ok(firstDeath.deathBundleId);
assert.notEqual(firstDeath.deceasedIntercessorId, firstDeath.successorIntercessorId);
const firstGhost = getPersistentGhosts(firstDeath.save).find(
  (ghost) => ghost.id === firstDeath.ghostId,
);
const firstBundle = getDeathBundles(firstDeath.save).find(
  (bundle) => bundle.id === firstDeath.deathBundleId,
);
assert.ok(firstGhost, "death must physically materialize the deceased ghost");
assert.ok(firstBundle, "death must physically materialize the deceased inventory bundle");
assert.equal(firstGhost.status, "present");
assert.equal(firstGhost.signature_skill_id, FIRST_SIGNATURE);
assert.equal(firstBundle.status, "available");
assert.notDeepEqual(firstGhost.cell, firstBundle.cell, "ghost and bundle need independent footprints");
assertReachableMarker(gamePackage, firstGhost.map_id, firstGhost.cell, "first ghost");
assertReachableMarker(gamePackage, firstBundle.map_id, firstBundle.cell, "first bundle");
assert.equal(getArtifactRecords(firstDeath.save)[0].state, "InDeathBundle");
assert.equal(getArtifactRecords(firstDeath.save)[0].death_bundle_id, firstBundle.id);
assert.deepEqual(firstBundle.artifact_ids, [ARTIFACT_ID]);
assert.equal(countInventory(firstDeath.save, ARTIFACT_ITEM_ID), 0);
assert.equal(
  firstDeath.save.intercessor_campaign?.ghost_requests[firstGhost.request_id]?.status,
  "materialized",
);
assert.equal(
  firstDeath.save.intercessor_campaign?.bundle_requests[firstBundle.request_id]?.status,
  "materialized",
);

const repeatedDeath = transitionFractureCrawlOnDeath(gamePackage, firstDeath.save, {
  cause: "duplicate callback",
});
assert.equal(getPersistentGhosts(repeatedDeath.save).length, 1);
assert.equal(getDeathBundles(repeatedDeath.save).length, 1);
assert.deepEqual(
  repeatedDeath.save.intercessor_campaign?.death_events,
  firstDeath.save.intercessor_campaign?.death_events,
  "a repeated callback cannot create another death transition",
);

console.log("phase 7: bundle recovery, hub recovery, and origin fallback conserve one artifact");
const recoveredBundle = recoverDeathBundle(
  gamePackage,
  firstDeath.save,
  firstBundle.id,
);
assert.equal(recoveredBundle.outcome, "recovered");
assert.deepEqual(recoveredBundle.artifactIds, [ARTIFACT_ID]);
assert.equal(countInventory(recoveredBundle.save, ARTIFACT_ITEM_ID), 1);
assert.equal(countInventory(recoveredBundle.save, GLASS_ITEM_ID), 5);
assert.equal(countInventory(recoveredBundle.save, LAMP_ITEM_ID), 1);
assert.equal(getArtifactRecords(recoveredBundle.save)[0].state, "Carried");
assert.equal(
  getArtifactRecords(recoveredBundle.save)[0].carrier_intercessor_id,
  firstDeath.successorIntercessorId,
);
const duplicateRecovery = recoverDeathBundle(
  gamePackage,
  recoveredBundle.save,
  firstBundle.id,
);
assert.equal(duplicateRecovery.outcome, "unavailable");
assert.equal(duplicateRecovery.changed, false);
assert.equal(countInventory(duplicateRecovery.save, ARTIFACT_ITEM_ID), 1);

const hubRecovery = recoverCarriedArtifactsToHub(gamePackage, recoveredBundle.save);
assert.deepEqual(hubRecovery.artifactIds, [ARTIFACT_ID]);
assert.equal(getArtifactRecords(hubRecovery.save)[0].state, "RecoveredToHub");
assert.equal(countInventory(hubRecovery.save, ARTIFACT_ITEM_ID), 0);
assert.equal(countInventory(hubRecovery.save, GLASS_ITEM_ID), 5);
assert.equal(countInventory(hubRecovery.save, LAMP_ITEM_ID), 1);
const duplicateHubRecovery = recoverCarriedArtifactsToHub(
  gamePackage,
  hubRecovery.save,
);
assert.deepEqual(duplicateHubRecovery.artifactIds, []);
assert.equal(duplicateHubRecovery.changed, false);

// Fork at the first death: the successor dies without recovering the first
// bundle, so that bundle must relinquish the unique artifact back to origin.
const secondLife: PlaySave = {
  ...firstDeath.save,
  current_map_id: QA_PERSISTENCE_MAP_ID,
  player: {
    ...firstDeath.save.player,
    cell: [4, 5],
    facing: [-1, 0],
  },
  known_skills: [SECOND_SIGNATURE],
  playerStats: { ...firstDeath.save.playerStats, hp: 0 },
  clock_minutes: 20,
};
const secondDeath = transitionFractureCrawlOnDeath(gamePackage, secondLife, {
  cause: "Successor died before bundle recovery",
});
assert.deepEqual(secondDeath.returnedArtifactIds, [ARTIFACT_ID]);
assert.equal(getArtifactRecords(secondDeath.save)[0].state, "AtOrigin");
assert.equal(countInventory(secondDeath.save, ARTIFACT_ITEM_ID), 0);
assert.equal(
  secondDeath.save.map_deltas?.[QA_PERSISTENCE_MAP_ID]?.taken_items?.includes(
    QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  ) || false,
  false,
  "fallback must restore the authored artifact origin marker",
);
const firstBundleAfterFallback = getDeathBundles(secondDeath.save).find(
  (bundle) => bundle.id === firstBundle.id,
);
assert.ok(firstBundleAfterFallback);
assert.deepEqual(firstBundleAfterFallback.artifact_ids, []);
assert.ok(firstBundleAfterFallback.returned_artifact_ids.includes(ARTIFACT_ID));

console.log("phase 6: multiple ghosts persist and transfer distinct signatures once each");
const ghosts = getPersistentGhosts(secondDeath.save);
const bundles = getDeathBundles(secondDeath.save);
assert.equal(ghosts.length, 2, "two deaths must leave two coexisting ghosts");
assert.equal(bundles.length, 2, "each death must retain its own physical bundle record");
assert.equal(new Set(ghosts.map((ghost) => ghost.id)).size, 2);
assert.equal(new Set(bundles.map((bundle) => bundle.id)).size, 2);
const secondGhost = ghosts.find((ghost) => ghost.id === secondDeath.ghostId);
assert.ok(secondGhost);
assert.equal(secondGhost.signature_skill_id, SECOND_SIGNATURE);
assertReachableMarker(gamePackage, secondGhost.map_id, secondGhost.cell, "second ghost");
assert.deepEqual(
  new Set(ghosts.map((ghost) => ghost.signature_skill_id)),
  new Set([FIRST_SIGNATURE, SECOND_SIGNATURE]),
  "signature selection must preserve a deterministic, diverse ghost archive",
);

const firstCommunion = communeWithPersistentGhost(
  gamePackage,
  secondDeath.save,
  firstGhost.id,
);
assert.equal(firstCommunion.outcome, "inherited");
assert.equal(firstCommunion.skillId, FIRST_SIGNATURE);
assert.ok(firstCommunion.save.known_skills.includes(FIRST_SIGNATURE));
const repeatedCommunion = communeWithPersistentGhost(
  gamePackage,
  firstCommunion.save,
  firstGhost.id,
);
assert.equal(repeatedCommunion.outcome, "already_inherited");
assert.equal(
  repeatedCommunion.save.known_skills.filter((skill) => skill === FIRST_SIGNATURE).length,
  1,
  "one ghost cannot duplicate its signature skill",
);
assert.equal(
  repeatedCommunion.save.fracture_crawl_campaign?.ghosts[firstGhost.id]
    .interaction_order.length,
  1,
  "one successor receives at most one inheritance record per ghost",
);
const secondCommunion = communeWithPersistentGhost(
  gamePackage,
  repeatedCommunion.save,
  secondGhost.id,
);
assert.equal(secondCommunion.outcome, "inherited");
assert.equal(secondCommunion.skillId, SECOND_SIGNATURE);
assert.deepEqual(
  new Set(secondCommunion.save.known_skills),
  new Set([FIRST_SIGNATURE, SECOND_SIGNATURE]),
);

console.log("phases 6-8: v1/v2 JSON persistence preserves the complete campaign projection");
const expectedCampaign = jsonRoundTrip(secondCommunion.save.fracture_crawl_campaign);
const v1RoundTrip = jsonRoundTrip(secondCommunion.save);
assert.deepEqual(v1RoundTrip.fracture_crawl_campaign, expectedCampaign);
assert.equal(getPersistentGhosts(v1RoundTrip).length, 2);
assert.equal(getDeathBundles(v1RoundTrip).length, 2);

const migrated = migratePlaySaveV1ToV2(v1RoundTrip);
const v2RoundTrip = normalizePlaySaveToV2(jsonRoundTrip(migrated));
assert.deepEqual(
  v2RoundTrip.runtime.lifecycle.fracture_crawl_campaign,
  expectedCampaign,
  "v2 lifecycle projection must preserve ghosts, bundles, artifacts, and Glass",
);
const unwrapped = unwrapPlaySaveV1(v2RoundTrip);
assert.deepEqual(unwrapped.fracture_crawl_campaign, expectedCampaign);
assert.equal(getPersistentGhosts(unwrapped).length, 2);
assert.equal(getDeathBundles(unwrapped).length, 2);
assertNear(getRecoverableGlassValue(unwrapped), 60, "Glass value must survive v2 round-trip");
assertNear(getGlassBurden(unwrapped), 0, "unrecovered bundle Glass has no carried burden");

console.log("Phase 6-8 Fracture Crawl lifecycle contract passed.");
