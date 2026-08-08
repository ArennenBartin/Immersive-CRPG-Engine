import assert from "node:assert/strict";
import {
  GamePackageSchema,
  createEmptyGamePackage,
  type GamePackage,
  type MapData,
} from "../src/schema/game";
import { GAME_PACKAGE_V2_SCHEMA } from "../src/schema/v2";
import {
  createQaSuitePackage,
  installQaSuiteIntoEmptyPackage,
  mergeQaSuiteIntoPackage,
  replaceWithQaSuite,
} from "../src/data/qaSuiteInstaller";
import {
  normalizePackageImportPayload,
  normalizePackageImportPayloadWithReport,
  refreshBundledEnginePackage,
  serializePackageForExport,
  useEngineStore,
} from "../src/store/engineStore";
import { TEST_SUITE_MAP_IDS } from "../src/data/testingMapSuite";
import {
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
} from "../src/schema/presets";
import {
  PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
} from "../src/data/playerModelAssets";

const base = createEmptyGamePackage();
const template = base.maps[0];
assert.ok(template, "the base authoring package must provide a valid map template");

const authoredMaps: MapData[] = Array.from({ length: 25 }, (_, index) => ({
  ...structuredClone(template),
  id: `author_map_${String(index + 1).padStart(2, "0")}`,
  display_name: `Authored Map ${index + 1}`,
  exits: [],
  triggers: [],
}));
const authoredPackage: GamePackage = {
  ...base,
  metadata: {
    ...base.metadata,
    title: "Twenty Five Authored Maps",
    start_map_id: authoredMaps[0].id,
    start_spawn_id: authoredMaps[0].spawns[0]?.id || base.metadata.start_spawn_id,
  },
  maps: authoredMaps,
};

const beforeMapsById = new Map(authoredPackage.maps.map((map) => [map.id, structuredClone(map)]));
const normalizedReport = normalizePackageImportPayloadWithReport(authoredPackage);
assert.equal(normalizedReport.requiresConfirmation, false);
assert.equal(normalizedReport.destructiveChanges.length, 0);
assert.deepEqual(
  normalizedReport.package,
  authoredPackage,
  "ordinary normalization must preserve every authored package collection and metadata field",
);
assert.deepEqual(
  normalizedReport.package.maps.map((map) => map.id),
  authoredPackage.maps.map((map) => map.id),
  "normalization must preserve every authored map ID and its order",
);
for (const map of normalizedReport.package.maps) {
  assert.deepEqual(
    map,
    beforeMapsById.get(map.id),
    `normalization unexpectedly rewrote authored map ${map.id}`,
  );
}

const invalidStartPackage: GamePackage = {
  ...authoredPackage,
  metadata: {
    ...authoredPackage.metadata,
    start_map_id: "missing_start_map",
    start_spawn_id: "missing_start_spawn",
  },
};
const invalidStartReport = normalizePackageImportPayloadWithReport(invalidStartPackage);
assert.deepEqual(
  invalidStartReport.package.metadata,
  invalidStartPackage.metadata,
  "invalid start references must be reported without silently rewriting metadata",
);
assert.ok(invalidStartReport.warnings.some((warning) => warning.code === "invalid_start_map"));

useEngineStore.getState().setGamePackage(authoredPackage);
assert.deepEqual(
  useEngineStore.getState().gamePackage.maps,
  authoredPackage.maps,
  "setGamePackage must preserve arbitrary authored maps",
);
useEngineStore.getState().updateMap(authoredMaps[0].id, { id: "forbidden_inline_rename" });
assert.ok(
  useEngineStore.getState().gamePackage.maps.some((map) => map.id === authoredMaps[0].id) &&
    !useEngineStore.getState().gamePackage.maps.some((map) => map.id === "forbidden_inline_rename"),
  "ordinary map updates must preserve immutable map IDs",
);
useEngineStore.getState().setGamePackage(authoredPackage);

const firstExport = serializePackageForExport(normalizedReport.package);
const imported = normalizePackageImportPayload(JSON.parse(firstExport));
const importedTwice = normalizePackageImportPayload(imported);
const secondExport = serializePackageForExport(imported);
assert.deepEqual(
  importedTwice,
  imported,
  "importing an already-normalized package twice must not accumulate content or IDs",
);
assert.deepEqual(
  JSON.parse(secondExport),
  JSON.parse(firstExport),
  "export/import/re-export must be semantically equivalent after canonicalization",
);

const qaPackage = createQaSuitePackage();
assert.deepEqual(
  qaPackage.maps.map((map) => map.id),
  TEST_SUITE_MAP_IDS,
  "the explicit QA builder must create the canonical suite",
);
const qaBackroomsMap = qaPackage.maps.find(
  (map) => map.id === "qa_backrooms_level_zero",
);
const qaLonelyStreetMap = qaPackage.maps.find(
  (map) => map.id === "qa_lonely_street",
);
const qaParasite = qaPackage.entities.find(
  (entity) => entity.id === "ent_backrooms_parasite",
);
assert.equal(
  qaBackroomsMap?.combat_mode,
  "horror_realtime",
  "Level Zero alone must opt into realtime horror combat",
);
assert.ok(
  qaPackage.maps
    .filter(
      (map) =>
        ![
          "qa_backrooms_level_zero",
          "qa_lonely_street",
          "qa_lonely_street_house_interior",
          "qa_lonely_street_house_basement",
        ].includes(map.id),
    )
    .every((map) => map.combat_mode === undefined),
  "the remaining developer QA maps must retain legacy pulse combat by omission",
);
assert.ok(
  qaPackage.maps
    .filter((map) =>
      [
        "qa_lonely_street",
        "qa_lonely_street_house_interior",
        "qa_lonely_street_house_basement",
      ].includes(map.id),
    )
    .every((map) => map.combat_mode === "pulse"),
  "the bundled Lonely Street story maps must explicitly preserve pulse combat",
);
assert.equal(
  qaLonelyStreetMap?.environment,
  "exterior",
  "the Lonely Street must opt out of automatic indoor architecture",
);
assert.deepEqual(qaParasite?.horror_combat, {
  windup_ms: 500,
  active_ms: 120,
  recovery_ms: 850,
  reach_fine_cells: 2,
  lunge_fine_cells: 2,
  direction_lock_fraction: 0.6,
});

const qaCombatRoundTrip = normalizePackageImportPayload(
  JSON.parse(serializePackageForExport(qaPackage)),
);
assert.equal(
  qaCombatRoundTrip.maps.find((map) => map.id === "qa_backrooms_level_zero")
    ?.combat_mode,
  "horror_realtime",
  "package V1/V2 round-trip must preserve the map combat mode",
);
assert.equal(
  qaCombatRoundTrip.maps.find((map) => map.id === "qa_lonely_street")
    ?.environment,
  "exterior",
  "package V1/V2 round-trip must preserve the exterior environment mode",
);
assert.deepEqual(
  qaCombatRoundTrip.entities.find(
    (entity) => entity.id === "ent_backrooms_parasite",
  )?.horror_combat,
  qaParasite?.horror_combat,
  "package V1/V2 round-trip must preserve the Parasite realtime profile",
);
const mixedCombatExport = JSON.parse(
  serializePackageForExport(qaPackage),
) as { runtime: { feature_flags: { turn_queue_combat: boolean } } };
assert.equal(
  mixedCombatExport.runtime.feature_flags.turn_queue_combat,
  true,
  "a mixed package must continue to advertise its pulse-combat maps",
);

const realtimeOnlyPackage = GamePackageSchema.parse({
  ...base,
  settings: { ...base.settings, combat_mode: "horror_realtime" },
  maps: base.maps.map((map) => {
    const inheritedMap = { ...map };
    delete inheritedMap.combat_mode;
    return inheritedMap;
  }),
});
assert.ok(
  realtimeOnlyPackage.maps.every((map) => map.combat_mode === undefined),
  "the realtime-only round-trip fixture must exercise package-setting inheritance",
);
const realtimeOnlyExport = JSON.parse(
  serializePackageForExport(realtimeOnlyPackage),
) as { runtime: { feature_flags: { turn_queue_combat: boolean } } };
assert.equal(
  realtimeOnlyExport.runtime.feature_flags.turn_queue_combat,
  false,
  "an all-realtime package must not advertise turn-queue combat",
);
assert.throws(
  () =>
    GamePackageSchema.parse({
      ...base,
      settings: { ...base.settings, combat_mode: "invalid_realtime_mode" },
    }),
  "package settings must reject unknown combat modes",
);

const editedQaShapedPackage: GamePackage = {
  ...qaPackage,
  metadata: { ...qaPackage.metadata, version: "author-controlled-version" },
  maps: qaPackage.maps.map((map, index) =>
    index === 0 ? { ...map, display_name: "Authored hydration sentinel" } : map,
  ),
};
const refreshedAuthoredQaPackage = refreshBundledEnginePackage(
  editedQaShapedPackage,
);
assert.equal(
  refreshedAuthoredQaPackage.maps[0]?.display_name,
  "Authored hydration sentinel",
  "browser hydration must preserve authored maps while adding bundled Steve content",
);
assert.equal(
  refreshedAuthoredQaPackage.settings.player_animation_override?.profile_id,
  PLAYER_GUITAR_ANIMATION_PROFILE_ID,
  "bundled Steve workspaces must gain the default guitar animation profile",
);
assert.ok(
  refreshedAuthoredQaPackage.settings.player_visual_attachments?.some(
    (attachment) => attachment.id === PLAYER_ELECTRIC_GUITAR_ATTACHMENT_ID,
  ),
  "bundled Steve workspaces must gain the guitar attachment non-destructively",
);
assert.ok(
  refreshedAuthoredQaPackage.object_library.some(
    (object) => object.id === PLAYER_ELECTRIC_GUITAR_OBJECT_ID,
  ),
  "bundled Steve workspaces must gain the collisionless guitar asset",
);
assert.equal(
  refreshBundledEnginePackage(refreshedAuthoredQaPackage),
  refreshedAuthoredQaPackage,
  "bundled player-content refresh must be idempotent",
);

const maplessPackage: GamePackage = { ...base, maps: [] };
const emptyInstall = installQaSuiteIntoEmptyPackage(maplessPackage);
assert.equal(emptyInstall.applied, true);
assert.deepEqual(emptyInstall.package.maps.map((map) => map.id), TEST_SUITE_MAP_IDS);

const refusedEmptyInstall = installQaSuiteIntoEmptyPackage(authoredPackage);
assert.equal(refusedEmptyInstall.applied, false);
assert.equal(refusedEmptyInstall.requiresConfirmation, true);
assert.deepEqual(
  refusedEmptyInstall.package.maps.map((map) => map.id),
  authoredPackage.maps.map((map) => map.id),
  "empty-mode QA installation must not touch a non-empty package",
);

const merged = mergeQaSuiteIntoPackage(authoredPackage);
assert.equal(merged.applied, true);
assert.equal(merged.destructiveChanges.length, 0);
for (const map of authoredPackage.maps) {
  assert.deepEqual(
    merged.package.maps.find((candidate) => candidate.id === map.id),
    map,
    `QA merge overwrote authored map ${map.id}`,
  );
}
for (const qaMapId of TEST_SUITE_MAP_IDS) {
  assert.ok(merged.package.maps.some((map) => map.id === qaMapId), `QA merge omitted ${qaMapId}`);
}

const legacyQaPackage: GamePackage = {
  ...qaPackage,
  maps: qaPackage.maps.map((map, index) => ({
    ...map,
    display_name:
      index === 0 ? "Authored QA Hub Name" : map.display_name,
    custom_object_placements: map.custom_object_placements.filter(
      (placement) =>
        placement.object_id !== INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID &&
        placement.object_id !== BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
    ),
  })),
};
const backfilledQaPackage = mergeQaSuiteIntoPackage(legacyQaPackage);
assert.equal(backfilledQaPackage.applied, true);
assert.equal(
  backfilledQaPackage.package.maps.length,
  legacyQaPackage.maps.length,
  "ceiling backfill must not duplicate existing QA maps",
);
assert.equal(
  backfilledQaPackage.package.maps[0]?.display_name,
  "Authored QA Hub Name",
  "ceiling backfill must preserve authored QA map edits",
);
assert.ok(
  backfilledQaPackage.package.maps
    .filter(
      (map) =>
        map.environment !== "exterior" && map.auto_ceiling_lights !== false,
    )
    .every((map) =>
      map.custom_object_placements.some(
        (placement) =>
          placement.object_id === INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID &&
          placement.collision_mode === "none",
      ),
    ),
  "merging the QA suite must backfill collision-free ceiling lights into auto-lit indoor QA maps",
);

const proposedReplace = replaceWithQaSuite(authoredPackage);
assert.equal(proposedReplace.applied, false);
assert.equal(proposedReplace.requiresConfirmation, true);
assert.equal(proposedReplace.backup, undefined);
assert.deepEqual(
  proposedReplace.package.maps.map((map) => map.id),
  authoredPackage.maps.map((map) => map.id),
  "unconfirmed replacement must leave the safe package untouched",
);

const confirmedReplace = replaceWithQaSuite(authoredPackage, {
  confirmDestructive: true,
  now: new Date("2026-07-13T12:00:00.000Z"),
});
assert.equal(confirmedReplace.applied, true);
assert.ok(confirmedReplace.backup, "confirmed destructive replacement must create a backup");
assert.equal(confirmedReplace.backupJson, confirmedReplace.backup!.json);
assert.deepEqual(confirmedReplace.package.maps.map((map) => map.id), TEST_SUITE_MAP_IDS);
const backupPayload = JSON.parse(confirmedReplace.backup!.json);
assert.equal(backupPayload.schema, GAME_PACKAGE_V2_SCHEMA);
assert.deepEqual(
  backupPayload.content.maps.map((map: MapData) => map.id),
  authoredPackage.maps.map((map) => map.id),
  "the pre-operation backup must contain every authored map",
);

useEngineStore.getState().setGamePackage(authoredPackage);
const refusedStoreReplace = useEngineStore.getState().installQaSuite({ mode: "replace" });
assert.equal(refusedStoreReplace.applied, false);
assert.deepEqual(
  useEngineStore.getState().gamePackage.maps.map((map) => map.id),
  authoredPackage.maps.map((map) => map.id),
  "the Studio action must not apply an unconfirmed replacement",
);
const confirmedStoreReplace = useEngineStore.getState().installQaSuite({
  mode: "replace",
  confirmDestructive: true,
  now: new Date("2026-07-13T12:00:00.000Z"),
});
assert.ok(confirmedStoreReplace.backupJson, "the Studio action must create its backup before replacement");
assert.deepEqual(
  useEngineStore.getState().gamePackage.maps.map((map) => map.id),
  TEST_SUITE_MAP_IDS,
  "the confirmed Studio action must install the canonical QA package",
);

console.log(
  `Package round-trip passed: ${authoredMaps.length} authored maps preserved; ${TEST_SUITE_MAP_IDS.length} QA maps installed explicitly; destructive replace backed up.`,
);
