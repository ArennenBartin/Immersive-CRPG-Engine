import assert from "node:assert/strict";
import type { GamePackage } from "../src/schema/game";
import {
  createDefaultEnginePackage,
  serializePackageForExport,
  useEngineStore,
} from "../src/store/engineStore";
import { usePlayStore } from "../src/store/playStore";
import { resolvePlayModeMap } from "../src/utils/playModeMap";
import {
  PLAYTEST_ASPECT_HEIGHT,
  PLAYTEST_ASPECT_WIDTH,
  PLAYTEST_MAX_HEIGHT,
  PLAYTEST_MAX_WIDTH,
  PLAYTEST_WINDOW_NAME,
  buildPlaytestUrl,
  openPlaytestWindow,
  readPlaytestRequest,
  shouldEnterRequestedPlaytestMap,
} from "../src/utils/playtestWindow";
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

const resolvedNewGame = resolvePlayModeMap({
  gamePackage: project,
  selectedMapId: selectedMap.id,
  saveData: null,
  didInitialMapLoad: true,
});
assert.equal(
  resolvedNewGame.map?.id,
  sourceMap.id,
  "New Game must use the authored start map after a one-off selected-map playtest",
);

const playtestUrl = buildPlaytestUrl(
  "https://example.test/tools/engine?existing=kept#studio",
  selectedMap.id,
);
const playtestRequest = readPlaytestRequest(playtestUrl);
assert.equal(playtestRequest.enabled, true, "the dedicated playtest URL must select playtest mode");
assert.equal(playtestRequest.mapId, selectedMap.id, "the playtest URL must preserve the selected map handoff");
assert.equal(
  shouldEnterRequestedPlaytestMap(playtestUrl),
  true,
  "a Play Map URL must enter the requested map without discarding it at the title screen",
);
assert.equal(
  shouldEnterRequestedPlaytestMap("https://example.test/?playtest=1"),
  false,
  "a normal playtest without a map handoff must retain the title and New Game flow",
);
assert.equal(new URL(playtestUrl).searchParams.get("existing"), "kept");
assert.equal(new URL(playtestUrl).hash, "", "the playtest URL must not retain Studio-only fragments");
assert.equal(PLAYTEST_ASPECT_WIDTH / PLAYTEST_ASPECT_HEIGHT, 16 / 9);
assert.equal(PLAYTEST_MAX_WIDTH, 1280);
assert.equal(PLAYTEST_MAX_HEIGHT, 720);
assert.equal(
  await openPlaytestWindow({ mapId: selectedMap.id }),
  false,
  "server-side contracts must not attempt to open a browser window",
);

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const openedPlaytestTargets: string[] = [];
const replacedPlaytestUrls: string[] = [];
let prepareCalls = 0;
const reusedPlaytestWindow = {
  opener: null,
  document: {
    title: "",
    body: {
      style: {} as Record<string, string>,
      textContent: "",
    },
  },
  location: {
    replace: (url: string) => replacedPlaytestUrls.push(url),
  },
  close: () => undefined,
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: { href: "https://example.test/tools/engine?existing=kept" },
    open: (_url: string, target: string) => {
      openedPlaytestTargets.push(target);
      return reusedPlaytestWindow;
    },
  },
});

try {
  assert.equal(
    await openPlaytestWindow({
      mapId: selectedMap.id,
      prepare: () => {
        prepareCalls += 1;
      },
    }),
    true,
  );
  assert.equal(
    await openPlaytestWindow({
      mapId: sourceMap.id,
      prepare: () => {
        prepareCalls += 1;
      },
    }),
    true,
  );
} finally {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
}

assert.equal(prepareCalls, 2, "each playtest launch must persist Studio before navigation");
assert.deepEqual(
  openedPlaytestTargets,
  [PLAYTEST_WINDOW_NAME, PLAYTEST_WINDOW_NAME],
  "repeated Play clicks must reuse one stable named browser window",
);
assert.deepEqual(
  replacedPlaytestUrls.map((url) => readPlaytestRequest(url).mapId),
  [selectedMap.id, sourceMap.id],
  "the reused playtest window must navigate to the map requested by each launch",
);

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

// Autosave resumes durable world progress, never a half-mounted panel. A stale
// dialogue/shop/container ID used to restore an invisible input lock in a new
// playtest tab.
usePlayStore.setState({
  activeDialogueId: "stale_dialogue",
  activeDialogueNodeId: null,
  activeShopId: "stale_shop",
  activeContainerId: "stale_container",
});
const playPersistOptions = usePlayStore.persist.getOptions();
const autosaveSnapshot = playPersistOptions.partialize?.(
  usePlayStore.getState(),
) as Record<string, unknown>;
assert.equal("activeDialogueId" in autosaveSnapshot, false);
assert.equal("activeShopId" in autosaveSnapshot, false);
assert.equal("activeContainerId" in autosaveSnapshot, false);
const resumedPlayState = playPersistOptions.merge?.(
  {
    saveData: usePlayStore.getState().saveData,
    logMessages: [],
    activeDialogueId: "legacy_stale_dialogue",
    activeShopId: "legacy_stale_shop",
    activeContainerId: "legacy_stale_container",
  },
  usePlayStore.getState(),
) as ReturnType<typeof usePlayStore.getState>;
assert.equal(resumedPlayState.activeDialogueId, null);
assert.equal(resumedPlayState.activeDialogueNodeId, null);
assert.equal(resumedPlayState.activeShopId, null);
assert.equal(resumedPlayState.activeContainerId, null);
usePlayStore.setState(resumedPlayState);

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
  "Studio/Play contract passed: selected-map 16:9 tab launch, authored/runtime isolation, keep/discard boundary, stable diagnostics, duplicate-ID guard, and import reset.",
);
