import assert from "node:assert/strict";
import type { GamePackage } from "../src/schema/game";
import {
  createDefaultEnginePackage,
  serializePackageForExport,
  useEngineStore,
} from "../src/store/engineStore";
import { usePlayStore } from "../src/store/playStore";
import { resolvePlayModeMap } from "../src/utils/playModeMap";
import { validateStudioProject } from "../src/utils/studioValidation";
import { createReadinessDungeonPackage } from "./fixtures/readinessDungeonFixture";

const base = createReadinessDungeonPackage();
const sourceMap = base.maps[0];
assert.ok(sourceMap, "the base package must include an authoring map");

const selectedMap = {
  ...structuredClone(sourceMap),
  id: "studio_play_selected_map",
  display_name: "Studio Play Selected Map",
  exits: [],
  triggers: [],
};
const project: GamePackage = {
  ...base,
  metadata: {
    ...base.metadata,
    title: "Studio Play Contract Fixture",
    start_map_id: sourceMap.id,
    start_spawn_id: sourceMap.spawns[0]?.id || base.metadata.start_spawn_id,
  },
  maps: [sourceMap, selectedMap],
};

useEngineStore.getState().setGamePackage(project);
useEngineStore.getState().setSelectedMapId(selectedMap.id);
useEngineStore.getState().setMode("map_editor");
usePlayStore.getState().resetRun();

const resolved = resolvePlayModeMap({
  gamePackage: project,
  selectedMapId: selectedMap.id,
  saveData: null,
  didInitialMapLoad: false,
});
assert.equal(resolved.map?.id, selectedMap.id, "Play Map must prefer the selected Studio map");

const authoredBeforePlay = structuredClone(useEngineStore.getState().gamePackage);
const spawn = selectedMap.spawns[0] || { cell: [0, 0] as [number, number], facing: [0, 1] as [number, number] };
usePlayStore.getState().initSave(
  selectedMap.id,
  [spawn.cell[0], spawn.cell[1]],
  [spawn.facing[0], spawn.facing[1]],
  project.metadata.version,
);
usePlayStore.getState().setFlag("runtime_only_flag", true);
usePlayStore.getState().movePlayer([1, 1], [1, 0], -10);

assert.deepEqual(
  useEngineStore.getState().gamePackage,
  authoredBeforePlay,
  "runtime mutations must not change authored project data",
);

useEngineStore.getState().setMode("play");
useEngineStore.getState().setMode("map_editor");
assert.ok(
  usePlayStore.getState().saveData?.flags.runtime_only_flag,
  "returning to Studio with keep-run semantics must preserve runtime state",
);
assert.deepEqual(useEngineStore.getState().gamePackage, authoredBeforePlay);

const validation = validateStudioProject(base);
assert.equal(validation.counts.errors, 0, "the base authoring package must have no blocking diagnostics");
assert.equal(validation.valid, true);

const defaultStudioValidation = validateStudioProject(createDefaultEnginePackage());
assert.equal(
  defaultStudioValidation.counts.errors,
  0,
  `the bundled Studio workspace must not open with blocking diagnostics: ${defaultStudioValidation.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.code)
    .join(", ")}`,
);

const invalidProject: GamePackage = {
  ...project,
  metadata: { ...project.metadata, start_map_id: "missing_map" },
  maps: [...project.maps, structuredClone(selectedMap)],
};
const invalidReport = validateStudioProject(invalidProject);
assert.equal(invalidReport.valid, false);
assert.ok(
  invalidReport.issues.some(
    (issue) =>
      issue.code === "REF_START_MAP_MISSING" &&
      issue.severity === "error" &&
      issue.blocking &&
      issue.path === "$.metadata.start_map_id",
  ),
  "invalid references must produce stable, blocking Studio diagnostics",
);
assert.ok(
  invalidReport.issues.some(
    (issue) => issue.code === "REF_DUPLICATE_ID" && issue.severity === "error",
  ),
  "duplicate stable IDs must be presented without crashing validation",
);

assert.throws(
  () => useEngineStore.getState().addMap(structuredClone(sourceMap)),
  /already exists/,
  "Studio map creation must reject duplicate map IDs",
);

// Project import is an explicit project boundary. A successful import clears
// the old runtime so same-version packages cannot inherit stale map deltas.
assert.ok(usePlayStore.getState().saveData, "fixture runtime should exist before import");
const importResult = useEngineStore.getState().importPackage(serializePackageForExport(base));
assert.equal(importResult.ok, true);
assert.equal(
  usePlayStore.getState().saveData,
  null,
  "successful project import must discard runtime state from the previous project",
);

console.log(
  "Studio/Play contract passed: selected-map play, authored/runtime isolation, keep/discard boundary, stable diagnostics, duplicate-ID guard, and import reset.",
);
