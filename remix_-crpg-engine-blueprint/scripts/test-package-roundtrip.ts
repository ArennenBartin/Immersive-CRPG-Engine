import assert from "node:assert/strict";
import { createEmptyGamePackage, type GamePackage, type MapData } from "../src/schema/game";
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

const editedQaShapedPackage: GamePackage = {
  ...qaPackage,
  metadata: { ...qaPackage.metadata, version: "author-controlled-version" },
  maps: qaPackage.maps.map((map, index) =>
    index === 0 ? { ...map, display_name: "Authored hydration sentinel" } : map,
  ),
};
assert.equal(
  refreshBundledEnginePackage(editedQaShapedPackage),
  editedQaShapedPackage,
  "browser hydration must never replace a QA-shaped authored workspace",
);
assert.equal(
  refreshBundledEnginePackage(editedQaShapedPackage).maps[0]?.display_name,
  "Authored hydration sentinel",
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
