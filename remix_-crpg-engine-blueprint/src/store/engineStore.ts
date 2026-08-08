import { create } from "zustand";
import {
  GamePackage,
  GamePackageSchema,
  EntityData,
  MapData,
  ObjectData,
} from "../schema/game";
import {
  migrateGamePackageV1ToV2,
  normalizeGamePackageToV2,
  unwrapGamePackageV1,
} from "../schema/v2";
import {
  createQaSuitePackage,
  installQaSuite as applyQaSuiteInstall,
  type QaSuiteInstallOptions,
} from "../data/qaSuiteInstaller";
import {
  createPhase11IntegratedArchitectureFixture,
  PHASE_11_HUB_MAP_ID,
  PHASE_11_HUB_SPAWN_ID,
} from "../data/qaSuite/integratedArchitectureScenario";
import {
  assertUnconfirmedMapPreservation,
  finalizePackageMigration,
  type MigrationChange,
  type MigrationWarning,
  type PackageMigrationResult,
} from "./packageMigration";
import { markMapManuallyModified } from "../generation-facing/mapContract";
import { assertStudioRuntimeSupport } from "../engine-core/studioRuntimeSupport";
import type { DungeonPackageBakeResult } from "../dungeonGen/packageBake";
import { usePlayStore } from "./playStore";
import {
  restoreStandardDialogueTrees,
  validateKeywordDialoguePackage,
} from "../engine-core/keywordDialogue";
import {
  BACKROOMS_PARASITE_ENTITY,
  BACKROOMS_PARASITE_ENTITY_ID,
  BACKROOMS_PARASITE_MODEL,
  BACKROOMS_PARASITE_MODEL_OBJECT_ID,
} from "../data/backroomsEntityAssets";
import {
  RILEY_ARRIVAL_DIALOGUE,
  RILEY_BUNDLED_ASSET_REVISION,
  RILEY_DIALOGUE_ID,
  RILEY_ENTITY,
  RILEY_ENTITY_ID,
  RILEY_MODEL_OBJECT_ID,
  RILEY_RIGGED_MODEL,
  RILEY_SOFA_ANCHOR_REVISION,
  RILEY_SOFA_OBJECT_PLACEMENT_ID,
  RILEY_SOFA_PLACEMENT_ID,
  RILEY_SOFA_SEATED_CELL,
  RILEY_SOFA_SEATED_LOCAL_POSITION,
  RILEY_SOFA_SEATED_LOCAL_FACING,
} from "../data/rileyAssets";
import { withBundledPlayerGuitarContent } from "../data/playerModelAssets";
import { BACKROOMS_LEVEL_ZERO_MICRO_WALL_OVERRIDES } from "../data/qaSuite/backroomsWing";
import { QA_START_MAP_ID, QA_START_SPAWN_ID } from "../data/qaSuite/shared";
import {
  LONELY_STREET_DOORWAY_CELL,
  LONELY_STREET_BASEMENT_MAP,
  LONELY_STREET_BASEMENT_MAP_ID,
  LONELY_STREET_BASEMENT_SPAWN_ID,
  LONELY_STREET_HOUSE_CELL,
  LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
  LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
  LONELY_STREET_HOUSE_INTERIOR_MAP,
  LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  LONELY_STREET_INTERIOR_CELL,
  LONELY_STREET_MAP,
  LONELY_STREET_MAP_ID,
  LONELY_STREET_OBJECT_IDS,
  LONELY_STREET_PORCH_CELL,
  LONELY_STREET_RETURN_SPAWN_ID,
  LONELY_STREET_SPAWN_ID,
} from "../data/qaSuite/lonelyStreetWing";
import {
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  LONELY_STREET_TREE_OBJECT_ID,
  objectLibraryPresets,
} from "../schema/presets";
import {
  LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
  LONELY_STREET_BASEMENT_OBJECT_IDS,
  LONELY_STREET_BASEMENT_SHELL_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
} from "../data/lonelyStreetBasementAssets";
import {
  LONELY_STREET_HOUSE_INTERIOR_OBJECT_IDS,
  LONELY_STREET_INTERIOR_COLLISION_REVISION,
} from "../data/lonelyStreetHouseInteriorAssets";
import {
  HOUSE_ARRIVAL_CUTSCENE,
  HOUSE_ARRIVAL_DIALOGUES,
  HOUSE_ARRIVAL_TRIGGER,
  HOUSE_ARRIVAL_TRIGGER_ID,
} from "../data/lonelyStreetHouseArrivalScene";
import {
  BUNDLED_OPENING_MUSIC_ID,
  BUNDLED_OPENING_MUSIC_URL,
  BUNDLED_TITLE_MUSIC_URL,
} from "../data/bundledMusic";
import {
  BASEMENT_BEER_ACQUIRED_SWITCH_ID,
  BASEMENT_BEER_CUTSCENE,
  BASEMENT_BEER_CUTSCENE_ID,
  BASEMENT_BEER_DIALOGUE,
  BASEMENT_BEER_DIALOGUE_ID,
  BASEMENT_BEER_INTERACT_TRIGGER_ID,
  BASEMENT_BEER_ITEM,
  BASEMENT_BEER_ITEM_ID,
  BASEMENT_BEER_LOCKED_HINT_CUTSCENE,
  BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
  BASEMENT_BEER_LOCKED_HINT_DIALOGUE,
  BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
  BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
  BASEMENT_ENTRY_SILENCE_CUTSCENE,
  BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
  BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
  MOON_GOD_ASSET_REVISION,
  MOON_GOD_DIALOGUE,
  MOON_GOD_DIALOGUE_ID,
  MOON_GOD_ENCOUNTERED_SWITCH_ID,
  MOON_GOD_ENTITY,
  MOON_GOD_ENTITY_ID,
  MOON_GOD_INTERACT_TRIGGER_ID,
  MOON_GOD_MODEL,
  MOON_GOD_MODEL_OBJECT_ID,
  MOON_GOD_PLACEMENT_ID,
  MOON_GOD_STATIC_ANCHOR_REVISION,
  MOON_GOD_VANISH_CUTSCENE,
  MOON_GOD_VANISH_CUTSCENE_ID,
} from "../data/moonGodAssets";
export type {
  MigrationChange,
  MigrationWarning,
  PackageBackupArtifact,
  PackageMigrationResult,
} from "./packageMigration";

export type PackageImportResult =
  | {
      ok: true;
      message: string;
      imported: GamePackage;
      migration: PackageMigrationResult;
    }
  | {
      ok: false;
      message: string;
      issues: string[];
    };

export type EditorMode =
  | "home"
  | "play"
  | "game_editor"
  | "map_editor"
  | "dungeon_generator"
  | "model_maker"
  | "animation_maker"
  | "sprite_creator"
  | "dialogue_editor"
  | "quest_editor"
  | "entity_editor"
  | "cutscene_editor"
  | "item_editor"
  | "document_editor"
  | "shop_editor"
  | "skill_editor"
  | "simulation_editor";

const ACTIVE_EDITOR_MODES = new Set<EditorMode>([
  "home",
  "play",
  "game_editor",
  "map_editor",
  "dungeon_generator",
  "model_maker",
  "animation_maker",
  "sprite_creator",
  "dialogue_editor",
  "quest_editor",
  "entity_editor",
  "cutscene_editor",
  "item_editor",
  "document_editor",
  "shop_editor",
  "skill_editor",
  "simulation_editor",
]);

const isEditorMode = (value: unknown): value is EditorMode =>
  typeof value === "string" && ACTIVE_EDITOR_MODES.has(value as EditorMode);

// Current writes use v3. Reads fall back to v2 so a namespace bump cannot make
// an authored browser workspace appear to disappear.
const ENGINE_PACKAGE_DB = "crpg_engine_package_store_v3";
const LEGACY_ENGINE_PACKAGE_DBS = ["crpg_engine_package_store_v2"] as const;
const ENGINE_PACKAGE_STORE = "active";
const ENGINE_PACKAGE_KEY = "workspace";

interface PersistedEngineState {
  schema: "crpg_engine_persisted_state_v1";
  gamePackage: GamePackage;
  selectedMapId: string | null;
  mode: EditorMode;
  savedAt: string;
}

interface RawPersistedEngineState {
  schema?: unknown;
  gamePackage?: unknown;
  selectedMapId?: unknown;
  mode?: unknown;
  savedAt?: unknown;
}

interface PersistedEngineStorageState {
  schema: "crpg_engine_persisted_state_v1";
  gamePackage: unknown;
  selectedMapId: string | null;
  mode: EditorMode;
  savedAt: string;
}

interface EditorState {
  // Global Editor State
  storageHydrated: boolean;
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;

  // The active game package being edited
  gamePackage: GamePackage;
  setGamePackage: (pkg: GamePackage) => void;

  // State specific to Author Mode
  selectedMapId: string | null;
  setSelectedMapId: (id: string | null) => void;

  // Utilities
  exportPackage: () => string;
  importPackage: (jsonString: string) => PackageImportResult;
  installQaSuite: (options: QaSuiteInstallOptions) => PackageMigrationResult;
  commitDungeonBake: (result: DungeonPackageBakeResult) => boolean;
  updateMap: (mapId: string, updates: Partial<MapData>) => void;
  addMap: (mapData: MapData) => void;
  deleteMap: (mapId: string) => boolean;
  addObject: (objData: any) => void;
  updateObject: (objId: string, updates: any) => void;
  replaceObject: (objData: any) => void;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  selectedAnimationClipId: string | null;
  setSelectedAnimationClipId: (id: string | null) => void;
  selectedSpriteId: string | null;
  setSelectedSpriteId: (id: string | null) => void;
  addSprite: (spriteData: any) => void;
  updateSprite: (spriteId: string, updates: any) => void;
  updateSettings: (updates: any) => void;
  addDialogue: (dialogueData: any) => void;
  updateDialogue: (dialogueId: string, updates: any) => void;
  addQuest: (questData: any) => void;
  updateQuest: (questId: string, updates: any) => void;
  selectedDialogueId: string | null;
  setSelectedDialogueId: (id: string | null) => void;
  selectedQuestId: string | null;
  setSelectedQuestId: (id: string | null) => void;
  selectedEntityId: string | null;
  setSelectedEntityId: (id: string | null) => void;
  addEntity: (entityData: any) => void;
  updateEntity: (entityId: string, updates: any) => void;
  deleteEntity: (entityId: string) => void;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  addItem: (itemData: any) => void;
  updateItem: (itemId: string, updates: any) => void;
  selectedDocumentId: string | null;
  setSelectedDocumentId: (id: string | null) => void;
  addDocument: (docData: any) => void;
  updateDocument: (docId: string, updates: any) => void;
  selectedShopId: string | null;
  setSelectedShopId: (id: string | null) => void;
  addShop: (shopData: any) => void;
  updateShop: (shopId: string, updates: any) => void;
  selectedSkillId: string | null;
  setSelectedSkillId: (id: string | null) => void;
  addSkill: (skillData: any) => void;
  updateSkill: (skillId: string, updates: any) => void;
  undoStack: GamePackage[];
  redoStack: GamePackage[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

const formatPackageIssue = (issue: {
  path: PropertyKey[];
  message: string;
}) => {
  const path = issue.path.length ? issue.path.map(String).join(".") : "package";
  return `${path}: ${issue.message}`;
};

const keepExistingId = <T extends { id: string }>(
  items: T[],
  currentId: string | null,
) =>
  currentId && items.some((item) => item.id === currentId) ? currentId : null;

const pickSelectedMapId = (pkg: GamePackage, currentId: string | null) => {
  if (currentId && pkg.maps.some((map) => map.id === currentId))
    return currentId;
  if (pkg.maps.some((map) => map.id === pkg.metadata.start_map_id))
    return pkg.metadata.start_map_id;
  return pkg.maps[0]?.id || null;
};

const normalizeImportedPackage = (pkg: GamePackage): PackageMigrationResult => {
  const warnings: MigrationWarning[] = [];
  const changes: MigrationChange[] = [];
  // Ordinary import remains observational so projects authored against the
  // compatibility keyword format can still be inspected and converted in the
  // Dialogue editor. The bundled Backrooms workspace is standardized at its
  // own creation/hydration boundary instead.
  const candidate = pkg;
  validateKeywordDialoguePackage(candidate)
    .filter((issue) => issue.severity === "warning")
    .forEach((issue) =>
      warnings.push({
        code: issue.code.toLowerCase(),
        path: issue.path,
        message: issue.message,
      }),
    );
  const startMap = candidate.maps.find(
    (map) => map.id === candidate.metadata.start_map_id,
  );
  if (startMap) {
    if (
      !startMap.spawns.some(
        (spawn) => spawn.id === candidate.metadata.start_spawn_id,
      )
    ) {
      warnings.push({
        code: "invalid_start_spawn",
        path: "metadata",
        message: `Start spawn ${candidate.metadata.start_spawn_id} does not exist on ${startMap.id}; package content was preserved unchanged.`,
      });
    }
  } else if (candidate.maps.length) {
    warnings.push({
      code: "invalid_start_map",
      path: "metadata.start_map_id",
      message: `Start map ${candidate.metadata.start_map_id} does not exist; package content was preserved unchanged.`,
    });
  } else {
    warnings.push({
      code: "package_has_no_maps",
      path: "maps",
      message:
        "The package has no maps; its start location could not be validated.",
    });
  }

  // Schema parsing above may fill defaults for fields declared by Zod. Beyond
  // that, ordinary import is deliberately observational: it reports bad
  // references but never refreshes art, rewrites maps, or repairs metadata.
  const result = finalizePackageMigration(pkg, candidate, {
    warnings,
    changes,
  });
  assertUnconfirmedMapPreservation(pkg, result);
  return result;
};

export const normalizePackageImportPayloadWithReport = (
  input: unknown,
): PackageMigrationResult => {
  const parsed = unwrapGamePackageV1(normalizeGamePackageToV2(input));
  return normalizeImportedPackage(parsed);
};

export const normalizePackageImportPayload = (input: unknown): GamePackage =>
  normalizePackageImportPayloadWithReport(input).package;

let bundledDefaultPackage: GamePackage | undefined;

/**
 * The repository-owned workspace every fresh browser profile starts from.
 *
 * The fixed-seed build is cached because dungeon generation is deterministic
 * but intentionally substantial. Callers receive a clone so a Studio edit can
 * never mutate the repository-owned template for a later reset or test.
 */
export const createDefaultEnginePackage = (): GamePackage => {
  if (!bundledDefaultPackage) {
    const integratedPackage = normalizeImportedPackage(
      createPhase11IntegratedArchitectureFixture(createQaSuitePackage())
        .gamePackage,
    ).package;
    bundledDefaultPackage = withBundledPlayerGuitarContent({
      ...integratedPackage,
      metadata: {
        ...integratedPackage.metadata,
        start_map_id: LONELY_STREET_MAP_ID,
        start_spawn_id: LONELY_STREET_SPAWN_ID,
      },
      settings: {
        ...integratedPackage.settings,
        title_music_url: BUNDLED_TITLE_MUSIC_URL,
        opening_music_url: BUNDLED_OPENING_MUSIC_URL,
        music_tracks: {
          ...((integratedPackage.settings?.music_tracks || {}) as Record<
            string,
            string
          >),
          [BUNDLED_OPENING_MUSIC_ID]: BUNDLED_OPENING_MUSIC_URL,
        },
        map_music: {
          ...((integratedPackage.settings?.map_music || {}) as Record<
            string,
            string
          >),
          [LONELY_STREET_MAP_ID]: BUNDLED_OPENING_MUSIC_ID,
        },
      },
    });
  }
  return structuredClone(bundledDefaultPackage);
};

const BACKROOMS_LEVEL_ZERO_MAP_ID = "qa_backrooms_level_zero";
const LONELY_STREET_OBJECT_ID_SET = new Set<string>(LONELY_STREET_OBJECT_IDS);
const LONELY_STREET_BASEMENT_OBJECT_ID_SET = new Set<string>(
  LONELY_STREET_BASEMENT_OBJECT_IDS,
);
const LONELY_STREET_HOUSE_INTERIOR_OBJECT_ID_SET = new Set<string>(
  LONELY_STREET_HOUSE_INTERIOR_OBJECT_IDS,
);
const BUNDLED_LONELY_STREET_OBJECTS = objectLibraryPresets.filter((object) =>
  LONELY_STREET_OBJECT_ID_SET.has(object.id),
);
const BUNDLED_LONELY_STREET_HOUSE_OBJECT = BUNDLED_LONELY_STREET_OBJECTS.find(
  (object) => object.id === "obj_lonely_street_house",
);
const BUNDLED_LONELY_STREET_TREE_OBJECT = BUNDLED_LONELY_STREET_OBJECTS.find(
  (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
);
const BUNDLED_LONELY_STREET_LIGHT_OBJECTS = new Map(
  BUNDLED_LONELY_STREET_OBJECTS.filter(
    (object) => object.light_source?.source_height_offset !== undefined,
  ).map((object) => [object.id, object]),
);
const BUNDLED_LONELY_STREET_BASEMENT_LIGHT_OBJECTS = new Map(
  BUNDLED_LONELY_STREET_OBJECTS.filter((object) =>
    [
      LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
      LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
    ].includes(object.id),
  ).map((object) => [object.id, object]),
);
const isLegacyBundledLonelyStreetBasementLight = (object: ObjectData) => {
  const current = object.light_source;
  if (!current || !object.tags.includes("lonely_street_basement")) return false;
  if (
    object.id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID &&
    ((current.intensity === 0.78 && current.radius === 9) ||
      (current.intensity === 0.9 && current.radius === 10)) &&
    current.color === "#e2ae68"
  ) {
    return true;
  }
  return (
    object.id === LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID &&
    ((current.intensity === 0.28 && current.radius === 5) ||
      (current.intensity === 0.48 && current.radius === 6) ||
      (current.intensity === 0.55 && current.radius === 7)) &&
    current.color === "#f3bd78"
  );
};
// Every house-interior prop now carries collision fitted to its measured model
// box, plus the render scale/offset that keeps the mesh on top of it. Upgrading
// on the revision tag replaces enumerating each superseded footprint: any saved
// package holding a pre-revision copy takes the bundled geometry wholesale.
const BUNDLED_LONELY_STREET_INTERIOR_FITTED_COLLISION_OBJECTS = new Map(
  BUNDLED_LONELY_STREET_OBJECTS.filter((object) =>
    LONELY_STREET_HOUSE_INTERIOR_OBJECT_ID_SET.has(object.id),
  ).map((object) => [object.id, object]),
);
const isLegacyBundledLonelyStreetInteriorFurnitureCollision = (
  object: ObjectData,
) =>
  BUNDLED_LONELY_STREET_INTERIOR_FITTED_COLLISION_OBJECTS.has(object.id) &&
  !object.tags?.includes(LONELY_STREET_INTERIOR_COLLISION_REVISION);
// A saved workspace whose Moon God model predates a scale/calibration change
// keeps its OLD (e.g. smaller) bounds forever otherwise: object_library merge
// elsewhere only appends objects that are entirely MISSING by id, never
// upgrades one that already exists.
const isLegacyBundledMoonGodModel = (object: ObjectData) =>
  object.id === MOON_GOD_MODEL_OBJECT_ID &&
  !object.tags?.includes(MOON_GOD_ASSET_REVISION);
const isLegacyBundledLonelyStreetLightSource = (object: ObjectData) => {
  const bundled = BUNDLED_LONELY_STREET_LIGHT_OBJECTS.get(object.id);
  const current = object.light_source;
  const expected = bundled?.light_source;
  return Boolean(
    bundled &&
    current &&
    expected &&
    current.source_height_offset === undefined &&
    current.intensity === expected.intensity &&
    current.radius === expected.radius &&
    current.color === expected.color &&
    object.asset?.filename === bundled.asset?.filename,
  );
};
const LEGACY_LONELY_STREET_TREE_PART_NAMES = new Set([
  "trunk",
  "lower_needles",
  "middle_needles",
  "upper_needles",
]);
const PREVIOUS_LONELY_STREET_TREE_PARTS = [
  {
    name: "trunk",
    shape: "cylinder",
    position: [0.14, 1.05, 0.18],
    size: [0.24, 2.1, 0.24],
  },
  {
    name: "low_skirt",
    shape: "cone",
    position: [0.14, 1.48, 0.18],
    size: [1.5, 1.62, 1.5],
  },
  {
    name: "lower_needles",
    shape: "cone",
    position: [0.1, 2.08, 0.2],
    size: [1.34, 1.82, 1.34],
  },
  {
    name: "middle_needles",
    shape: "cone",
    position: [0.18, 2.88, 0.14],
    size: [1.04, 1.6, 1.04],
  },
  {
    name: "upper_needles",
    shape: "cone",
    position: [0.08, 3.64, 0.2],
    size: [0.68, 1.34, 0.68],
  },
] as const;
const tupleMatches = (
  actual: readonly unknown[],
  expected: readonly number[],
) =>
  actual.length === expected.length &&
  actual.every((value, index) => Number(value) === expected[index]);
const isPreviousBundledLonelyStreetTree = (object: ObjectData) =>
  object.id === BUNDLED_LONELY_STREET_TREE_OBJECT?.id &&
  object.model_kind !== "asset" &&
  tupleMatches(object.bounds, [1.7, 4.35, 1.7]) &&
  object.parts.length === PREVIOUS_LONELY_STREET_TREE_PARTS.length &&
  PREVIOUS_LONELY_STREET_TREE_PARTS.every((expected) => {
    const part = object.parts.find(
      (candidate) => candidate.name === expected.name,
    );
    return (
      part?.shape === expected.shape &&
      tupleMatches(part.position, expected.position) &&
      tupleMatches(part.size, expected.size)
    );
  });
const isLegacyBundledLonelyStreetTree = (object: ObjectData) =>
  isPreviousBundledLonelyStreetTree(object) ||
  (object.id === BUNDLED_LONELY_STREET_TREE_OBJECT?.id &&
    object.model_kind !== "asset" &&
    object.bounds[0] === 1.2 &&
    object.bounds[1] === 4.35 &&
    object.bounds[2] === 1.2 &&
    object.parts.length === 4 &&
    object.parts.every(
      (part) =>
        LEGACY_LONELY_STREET_TREE_PART_NAMES.has(part.name) &&
        (part.name === "trunk"
          ? part.shape === "cylinder"
          : part.shape === "cone"),
    ) &&
    !object.parts.some((part) => part.name === "low_skirt"));
const hasLonelyStreetFootprintCell = (
  object: ObjectData,
  x: number,
  z: number,
) =>
  object.collision?.footprint.some((cell) => cell[0] === x && cell[1] === z) ===
  true;
const isLegacyLonelyStreetRoof = (object: ObjectData) => {
  if (object.id !== BUNDLED_LONELY_STREET_HOUSE_OBJECT?.id) return false;
  const leftSlope = object.parts.find(
    (part) => part.name === "left_roof_slope",
  );
  const rightSlope = object.parts.find(
    (part) => part.name === "right_roof_slope",
  );
  return (
    Number(leftSlope?.rotation[2]) < 0 && Number(rightSlope?.rotation[2]) > 0
  );
};
const isSolidBundledLonelyStreetHouse = (object: ObjectData) =>
  object.id === BUNDLED_LONELY_STREET_HOUSE_OBJECT?.id &&
  object.parts.some((part) => part.name === "house_body") &&
  !object.parts.some((part) => part.name === "back_wall") &&
  object.collision?.profile === "custom_footprint" &&
  object.collision.footprint.length === 15 &&
  hasLonelyStreetFootprintCell(object, 0, 0) &&
  hasLonelyStreetFootprintCell(object, 0, 1);
const isLegacyBundledLonelyStreetOpenDoor = (object: ObjectData) =>
  object.id === BUNDLED_LONELY_STREET_HOUSE_OBJECT?.id &&
  object.parts.some((part) => part.name === "open_front_door");
const isOutdatedBundledLonelyStreetHouse = (object: ObjectData) =>
  isLegacyLonelyStreetRoof(object) ||
  isSolidBundledLonelyStreetHouse(object) ||
  isLegacyBundledLonelyStreetOpenDoor(object);
const isPreviousLongBundledLonelyStreetLayout = (map: MapData) => {
  if (map.id !== LONELY_STREET_MAP_ID) return false;
  const house = map.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_last_house",
  );
  return (
    map.width === LONELY_STREET_MAP.width &&
    map.height === LONELY_STREET_MAP.height &&
    map.cells.length === LONELY_STREET_MAP.cells.length &&
    house?.cell[0] === 5 &&
    house.cell[1] === -75 &&
    house.facing[0] === -1 &&
    house.facing[1] === 0
  );
};
const isOutdatedBundledLonelyStreetLayout = (map: MapData) => {
  if (map.id !== LONELY_STREET_MAP_ID) return false;
  const house = map.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_last_house",
  );
  if (map.width !== 17 || map.height !== 55 || map.cells.length !== 935) {
    return false;
  }
  const originalEndHouse =
    house?.cell[0] === 0 &&
    house.cell[1] === -23 &&
    house.facing[0] === 0 &&
    house.facing[1] === 1;
  const firstRoadsideHouse =
    house?.cell[0] === 5 &&
    house.cell[1] === -20 &&
    house.facing[0] === -1 &&
    house.facing[1] === 0;
  return originalEndHouse || firstRoadsideHouse;
};
const lonelyStreetCellAt = (map: MapData, x: number, z: number) =>
  map.cells.find((cell) => cell.x === x && cell.z === z);
const LONELY_STREET_PORCH_SURFACE_CELLS = [
  [LONELY_STREET_PORCH_CELL[0], LONELY_STREET_PORCH_CELL[1] - 1],
  [LONELY_STREET_PORCH_CELL[0], LONELY_STREET_PORCH_CELL[1]],
  [LONELY_STREET_PORCH_CELL[0], LONELY_STREET_PORCH_CELL[1] + 1],
] as const;
const isLegacyBundledLonelyStreetTraversal = (map: MapData) => {
  if (
    map.id !== LONELY_STREET_MAP_ID ||
    map.width !== LONELY_STREET_MAP.width ||
    map.height !== LONELY_STREET_MAP.height ||
    map.cells.length !== LONELY_STREET_MAP.cells.length
  ) {
    return false;
  }
  const house = map.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_last_house",
  );
  const porch = lonelyStreetCellAt(map, ...LONELY_STREET_PORCH_CELL);
  const sidePorchSurfaces = LONELY_STREET_PORCH_SURFACE_CELLS.filter(
    ([x, z]) =>
      x !== LONELY_STREET_PORCH_CELL[0] || z !== LONELY_STREET_PORCH_CELL[1],
  ).map(([x, z]) => lonelyStreetCellAt(map, x, z));
  const doorway = lonelyStreetCellAt(map, ...LONELY_STREET_DOORWAY_CELL);
  const interior = lonelyStreetCellAt(map, ...LONELY_STREET_INTERIOR_CELL);
  const hasBundledHouseAnchor =
    house?.cell[0] === LONELY_STREET_HOUSE_CELL[0] &&
    house.cell[1] === LONELY_STREET_HOUSE_CELL[1] &&
    house.facing[0] === -1 &&
    house.facing[1] === 0;
  const isSolidThresholdRevision =
    porch?.walkable === true &&
    Number(porch.visual_height || 0) === 0 &&
    doorway?.walkable === false &&
    doorway.blocks_los === true &&
    interior?.walkable === false &&
    interior.blocks_los === true;
  const isRaisedCenterOnlyRevision =
    porch?.walkable === true &&
    Number(porch.visual_height || 0) === 0.76 &&
    sidePorchSurfaces.every(
      (cell) =>
        cell?.walkable === true && Number(cell.visual_height || 0) === 0,
    ) &&
    doorway?.walkable === true &&
    doorway.blocks_los === false &&
    Number(doorway.visual_height || 0) === 0.52 &&
    interior?.walkable === true &&
    interior.blocks_los === false &&
    Number(interior.visual_height || 0) === 0.52 &&
    Number(house.height_offset || 0) === 0;
  return (
    hasBundledHouseAnchor &&
    (isSolidThresholdRevision || isRaisedCenterOnlyRevision)
  );
};
const LONELY_STREET_TRAVERSAL_CELL_KEYS = new Set([
  ...LONELY_STREET_PORCH_SURFACE_CELLS.map(([x, z]) => `${x}:${z}`),
  `${LONELY_STREET_DOORWAY_CELL[0]}:${LONELY_STREET_DOORWAY_CELL[1]}`,
  `${LONELY_STREET_INTERIOR_CELL[0]}:${LONELY_STREET_INTERIOR_CELL[1]}`,
]);
const BUNDLED_LONELY_STREET_TRAVERSAL_CELLS = new Map(
  LONELY_STREET_MAP.cells
    .filter((cell) =>
      LONELY_STREET_TRAVERSAL_CELL_KEYS.has(`${cell.x}:${cell.z}`),
    )
    .map((cell) => [`${cell.x}:${cell.z}`, cell]),
);
const isBundledLonelyStreetPlacement = (
  placement: MapData["custom_object_placements"][number],
) =>
  placement.id === "lonely_street_last_house" ||
  placement.id === "lonely_street_front_door" ||
  placement.id?.startsWith("lonely_street_tree_") ||
  placement.id?.startsWith("lonely_street_center_mark_");
const isLonelyStreetHouseMigrationCell = (x: number, z: number) =>
  x >= 4 && x <= 8 && z >= -78 && z <= -72;
const BUNDLED_LONELY_STREET_CELL_BY_KEY = new Map(
  LONELY_STREET_MAP.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]),
);
const BUNDLED_LONELY_STREET_PLACEMENT_BY_ID = new Map(
  LONELY_STREET_MAP.custom_object_placements.map((placement) => [
    placement.id,
    placement,
  ]),
);
const LONELY_STREET_TREE_FACINGS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;
const isDeprecatedDenseLonelyStreetTreePlacement = (
  placement: MapData["custom_object_placements"][number],
) => {
  if (
    placement.object_id !== LONELY_STREET_TREE_OBJECT_ID ||
    placement.collision_mode !== "inherit" ||
    BUNDLED_LONELY_STREET_PLACEMENT_BY_ID.has(placement.id)
  ) {
    return false;
  }
  const match = /^lonely_street_tree_(-?\d+)_(-?\d+)$/.exec(placement.id);
  if (!match) return false;
  const x = Number(match[1]);
  const z = Number(match[2]);
  const bundledCell = BUNDLED_LONELY_STREET_CELL_BY_KEY.get(`${x}:${z}`);
  if (
    !bundledCell ||
    bundledCell.walkable ||
    !bundledCell.blocks_los ||
    placement.cell[0] !== x ||
    placement.cell[1] !== z
  ) {
    return false;
  }
  const facingIndex = (((x * 17 + z * 11) % 4) + 4) % 4;
  const expectedFacing = LONELY_STREET_TREE_FACINGS[facingIndex];
  return (
    placement.facing[0] === expectedFacing[0] &&
    placement.facing[1] === expectedFacing[1]
  );
};
const BUNDLED_LONELY_STREET_FRONT_DOOR =
  BUNDLED_LONELY_STREET_PLACEMENT_BY_ID.get("lonely_street_front_door");
const BUNDLED_LONELY_STREET_HOUSE_EXIT = LONELY_STREET_MAP.exits[0];
const BUNDLED_LONELY_STREET_RETURN_SPAWN = LONELY_STREET_MAP.spawns.find(
  (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
);
const BUNDLED_LONELY_STREET_INTERIOR_SPAWN =
  LONELY_STREET_HOUSE_INTERIOR_MAP.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
const BUNDLED_LONELY_STREET_INTERIOR_RETURN_EXIT =
  LONELY_STREET_HOUSE_INTERIOR_MAP.exits.find(
    (mapExit) => mapExit.target_map_id === LONELY_STREET_MAP_ID,
  );
const BUNDLED_LONELY_STREET_INTERIOR_FRONT_DOOR =
  LONELY_STREET_HOUSE_INTERIOR_MAP.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_interior_front_door",
  );
const BUNDLED_LONELY_STREET_INTERIOR_SHELL =
  LONELY_STREET_HOUSE_INTERIOR_MAP.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_interior_shell",
  );
const BUNDLED_LONELY_STREET_HOUSE_BASEMENT_EXIT =
  LONELY_STREET_HOUSE_INTERIOR_MAP.exits.find(
    (mapExit) => mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID,
  );
const BUNDLED_LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN =
  LONELY_STREET_HOUSE_INTERIOR_MAP.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
  );
const BUNDLED_LONELY_STREET_HOUSE_BASEMENT_DOOR =
  LONELY_STREET_HOUSE_INTERIOR_MAP.custom_object_placements.find(
    (placement) =>
      placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
  );
const BUNDLED_LONELY_STREET_BASEMENT_SHELL =
  LONELY_STREET_BASEMENT_MAP.custom_object_placements.find(
    (placement) => placement.id === "lonely_basement_shell",
  );
const BUNDLED_LONELY_STREET_BASEMENT_ENTRY_SPAWN =
  LONELY_STREET_BASEMENT_MAP.spawns[0];
const BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT =
  LONELY_STREET_BASEMENT_MAP.exits.find(
    (mapExit) =>
      mapExit.target_map_id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
const BUNDLED_LONELY_STREET_BASEMENT_MOON_GOD_PLACEMENT =
  LONELY_STREET_BASEMENT_MAP.entity_placements.find(
    (placement) => placement.id === MOON_GOD_PLACEMENT_ID,
  );
const BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGER_IDS = new Set([
  BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
  MOON_GOD_INTERACT_TRIGGER_ID,
  BASEMENT_BEER_INTERACT_TRIGGER_ID,
  BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
]);
const BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGERS =
  LONELY_STREET_BASEMENT_MAP.triggers.filter((trigger) =>
    BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGER_IDS.has(trigger.id),
  );
const BUNDLED_LONELY_STREET_BASEMENT_DIALOGUE_IDS = new Set([
  MOON_GOD_DIALOGUE_ID,
  BASEMENT_BEER_DIALOGUE_ID,
  BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
]);
const BUNDLED_LONELY_STREET_BASEMENT_CUTSCENE_IDS = new Set([
  BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
  MOON_GOD_VANISH_CUTSCENE_ID,
  BASEMENT_BEER_CUTSCENE_ID,
  BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
]);

const upsertBundledSpawn = (
  spawns: MapData["spawns"],
  bundled: MapData["spawns"][number] | undefined,
  recognizedLegacyPoses: ReadonlySet<string> = new Set(),
) => {
  if (!bundled) return spawns;
  const index = spawns.findIndex((spawn) => spawn.id === bundled.id);
  if (index < 0) return [...spawns, structuredClone(bundled)];
  const existing = spawns[index];
  if (
    existing &&
    recognizedLegacyPoses.has(
      `${existing.cell[0]}:${existing.cell[1]}:${existing.facing[0]}:${existing.facing[1]}`,
    )
  ) {
    return spawns.map((spawn, spawnIndex) =>
      spawnIndex === index ? structuredClone(bundled) : spawn,
    );
  }
  // An existing named spawn is authored content. The migration only supplies
  // a missing arrival or upgrades one exact known bundled draft pose; it must
  // never move a door that an author deliberately repositioned while retaining
  // the stable bundled ID.
  return spawns;
};

const upsertBundledExit = (
  exits: MapData["exits"],
  bundled: MapData["exits"][number] | undefined,
  legacyTargetSpawnIds: ReadonlySet<string | undefined>,
  appendWhenMissing: boolean,
) => {
  if (!bundled) return exits;
  const index = exits.findIndex(
    (mapExit) =>
      mapExit.id === bundled.id ||
      (mapExit.target_map_id === bundled.target_map_id &&
        mapExit.cell[0] === bundled.cell[0] &&
        mapExit.cell[1] === bundled.cell[1]),
  );
  if (index < 0) {
    return appendWhenMissing ? [...exits, structuredClone(bundled)] : exits;
  }
  return exits.map((mapExit, exitIndex) =>
    exitIndex === index &&
    mapExit.cell[0] === bundled.cell[0] &&
    mapExit.cell[1] === bundled.cell[1] &&
    mapExit.target_map_id === bundled.target_map_id &&
    legacyTargetSpawnIds.has(mapExit.target_spawn_id)
      ? {
          ...mapExit,
          target_spawn_id: bundled.target_spawn_id,
        }
      : mapExit,
  );
};

const hasBundledDoorAnchor = (
  map: MapData,
  bundled: MapData["custom_object_placements"][number] | undefined,
) =>
  Boolean(
    bundled &&
    map.custom_object_placements.some(
      (placement) =>
        placement.id === bundled.id &&
        placement.object_id === bundled.object_id &&
        placement.cell[0] === bundled.cell[0] &&
        placement.cell[1] === bundled.cell[1],
    ),
  );

const LEGACY_STREET_HOUSE_TARGET_SPAWN_IDS = new Set<string | undefined>([
  undefined,
  "",
]);
const LEGACY_INTERIOR_RETURN_TARGET_SPAWN_IDS = new Set<string | undefined>([
  undefined,
  "",
  LONELY_STREET_SPAWN_ID,
]);
const LEGACY_INTERIOR_ENTRY_SPAWN_POSES = new Set([
  "-2:-1:1:0",
  "-3:1:1:0",
  // Previous bundled arrival: trapped between the closed door and Riley.
  "-3:1:-1:0",
]);

const findBundledRoute = (
  map: MapData,
  bundled: MapData["exits"][number] | undefined,
) =>
  bundled
    ? map.exits.find(
        (mapExit) =>
          mapExit.cell[0] === bundled.cell[0] &&
          mapExit.cell[1] === bundled.cell[1] &&
          mapExit.target_map_id === bundled.target_map_id,
      )
    : undefined;

const hasBundledBasementAnchor = (map: MapData) =>
  map.id === LONELY_STREET_BASEMENT_MAP_ID &&
  map.width === LONELY_STREET_BASEMENT_MAP.width &&
  map.height === LONELY_STREET_BASEMENT_MAP.height &&
  Boolean(
    BUNDLED_LONELY_STREET_BASEMENT_SHELL &&
      BUNDLED_LONELY_STREET_BASEMENT_ENTRY_SPAWN &&
      BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT &&
      map.custom_object_placements.some(
        (placement) =>
          placement.id === BUNDLED_LONELY_STREET_BASEMENT_SHELL.id &&
          placement.object_id === LONELY_STREET_BASEMENT_SHELL_OBJECT_ID &&
          placement.cell[0] === BUNDLED_LONELY_STREET_BASEMENT_SHELL.cell[0] &&
          placement.cell[1] === BUNDLED_LONELY_STREET_BASEMENT_SHELL.cell[1],
      ) &&
      map.spawns.some(
        (spawn) =>
          spawn.id === BUNDLED_LONELY_STREET_BASEMENT_ENTRY_SPAWN.id,
      ) &&
      map.exits.some(
        (mapExit) =>
          mapExit.id === BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT.id &&
          mapExit.cell[0] ===
            BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT.cell[0] &&
          mapExit.cell[1] ===
            BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT.cell[1] &&
          mapExit.target_map_id ===
            BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT.target_map_id &&
          mapExit.target_spawn_id ===
            BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT.target_spawn_id,
      ),
  );

// A placement missing its schedule, or an anchor that isn't locked to the
// current revision, lets ordinary exploration AI nudge the apparition off its
// post — and once its cell no longer matches its authored cell, the render
// path also drops the fixed anchor pose (see resolveEntityPresentationPose's
// `remainsAtAuthoredCell` fallback), so it visibly steps and turns instead of
// staying put. A schedule that always targets the placement's OWN cell is a
// self-contained "never leaves home" guarantee, so this checks that
// relationship rather than depending on an imported cell constant.
const moonGodPlacementIsCurrent = (map: MapData) => {
  const placement = map.entity_placements.find(
    (candidate) =>
      candidate.id === MOON_GOD_PLACEMENT_ID &&
      candidate.entity_id === MOON_GOD_ENTITY_ID,
  );
  if (!placement) return false;
  const anchor = placement.presentation_anchor;
  const pinnedToOwnCell = (placement.schedule || []).every(
    (entry) =>
      entry.cell[0] === placement.cell[0] &&
      entry.cell[1] === placement.cell[1],
  );
  return Boolean(
    placement.schedule?.length &&
      pinnedToOwnCell &&
      anchor?.lock_to_anchor === true &&
      anchor.revision === MOON_GOD_STATIC_ANCHOR_REVISION,
  );
};

const hasBundledBasementEncounter = (pkg: GamePackage) => {
  const basement = pkg.maps.find(
    (map) =>
      map.id === LONELY_STREET_BASEMENT_MAP_ID &&
      hasBundledBasementAnchor(map),
  );
  if (
    !basement ||
    !moonGodPlacementIsCurrent(basement) ||
    !pkg.object_library.some(
      (object) => object.id === MOON_GOD_MODEL_OBJECT_ID,
    ) ||
    !pkg.entities.some((entity) => entity.id === MOON_GOD_ENTITY_ID) ||
    ![
      MOON_GOD_DIALOGUE_ID,
      BASEMENT_BEER_DIALOGUE_ID,
      BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
    ].every((id) => pkg.dialogue.some((dialogue) => dialogue.id === id)) ||
    ![
      BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
      MOON_GOD_VANISH_CUTSCENE_ID,
      BASEMENT_BEER_CUTSCENE_ID,
      BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
    ].every((id) => pkg.cutscenes.some((cutscene) => cutscene.id === id)) ||
    !pkg.items.some((item) => item.id === BASEMENT_BEER_ITEM_ID) ||
    !Object.prototype.hasOwnProperty.call(
      pkg.switches,
      BASEMENT_BEER_ACQUIRED_SWITCH_ID,
    ) ||
    !Object.prototype.hasOwnProperty.call(
      pkg.switches,
      MOON_GOD_ENCOUNTERED_SWITCH_ID,
    )
  ) {
    return false;
  }
  const returnExit = basement.exits.find(
    (mapExit) => mapExit.id === BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT?.id,
  );
  return (
    basement.entity_placements.some(
      (placement) =>
        placement.id === MOON_GOD_PLACEMENT_ID &&
        placement.entity_id === MOON_GOD_ENTITY_ID,
    ) &&
    [...BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGER_IDS].every((id) =>
      basement.triggers.some((trigger) => trigger.id === id),
    ) &&
    returnExit?.condition?.switch === BASEMENT_BEER_ACQUIRED_SWITCH_ID &&
    returnExit.condition.switch_value === true
  );
};

const installBundledBasementEncounterOnMap = (map: MapData): MapData => {
  // A short-lived development draft placed these reserved encounter IDs on
  // the street. Scrub only those engine-owned IDs while preserving authored
  // content around them.
  if (map.id === LONELY_STREET_MAP_ID) {
    return {
      ...map,
      entity_placements: map.entity_placements.filter(
        (placement) =>
          placement.id !== MOON_GOD_PLACEMENT_ID &&
          placement.entity_id !== MOON_GOD_ENTITY_ID,
      ),
      triggers: map.triggers.filter(
        (trigger) =>
          !BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGER_IDS.has(
            trigger.id,
          ),
      ),
    };
  }
  if (!hasBundledBasementAnchor(map)) return map;

  const placement = BUNDLED_LONELY_STREET_BASEMENT_MOON_GOD_PLACEMENT;
  const entityPlacements = placement
    ? [
        ...map.entity_placements.filter(
          (candidate) =>
            candidate.id !== MOON_GOD_PLACEMENT_ID &&
            candidate.entity_id !== MOON_GOD_ENTITY_ID,
        ),
        structuredClone(placement),
      ]
    : map.entity_placements;
  const encounterTriggers = new Map(
    BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGERS.map((trigger) => [
      trigger.id,
      trigger,
    ]),
  );
  const triggers = map.triggers
    .filter(
      (trigger) =>
        !BUNDLED_LONELY_STREET_BASEMENT_ENCOUNTER_TRIGGER_IDS.has(trigger.id),
    )
    .concat(
      [...encounterTriggers.values()].map((trigger) =>
        structuredClone(trigger),
      ),
    );
  const exits = map.exits.map((mapExit) =>
    mapExit.id === BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT?.id
      ? {
          ...mapExit,
          condition: structuredClone(
            BUNDLED_LONELY_STREET_BASEMENT_RETURN_EXIT.condition,
          ),
        }
      : mapExit,
  );

  return { ...map, entity_placements: entityPlacements, triggers, exits };
};

const isBundledHouseBasementArchitecture = (map: MapData) => {
  if (
    map.id !== LONELY_STREET_HOUSE_INTERIOR_MAP_ID ||
    map.width !== LONELY_STREET_HOUSE_INTERIOR_MAP.width ||
    map.height !== LONELY_STREET_HOUSE_INTERIOR_MAP.height ||
    !hasBundledDoorAnchor(map, BUNDLED_LONELY_STREET_INTERIOR_FRONT_DOOR) ||
    !BUNDLED_LONELY_STREET_INTERIOR_SHELL ||
    !map.custom_object_placements.some(
      (placement) =>
        placement.id === BUNDLED_LONELY_STREET_INTERIOR_SHELL.id &&
        placement.object_id === BUNDLED_LONELY_STREET_INTERIOR_SHELL.object_id &&
        placement.cell[0] === BUNDLED_LONELY_STREET_INTERIOR_SHELL.cell[0] &&
        placement.cell[1] === BUNDLED_LONELY_STREET_INTERIOR_SHELL.cell[1],
    )
  ) {
    return false;
  }
  const bundledExit = BUNDLED_LONELY_STREET_HOUSE_BASEMENT_EXIT;
  return Boolean(
    bundledExit &&
      map.cells.some(
        (cell) =>
          cell.x === bundledExit.cell[0] &&
          cell.z === bundledExit.cell[1] &&
          cell.active !== false &&
          cell.walkable,
      ),
  );
};

type HouseBasementRouteStatus =
  | "current"
  | "repairable"
  | "missing"
  | "authored_conflict";

const houseBasementRouteStatus = (
  map: MapData | undefined,
): HouseBasementRouteStatus => {
  if (!map || !BUNDLED_LONELY_STREET_HOUSE_BASEMENT_EXIT) return "missing";
  const bundled = BUNDLED_LONELY_STREET_HOUSE_BASEMENT_EXIT;
  const canonicalRoute = findBundledRoute(map, bundled);
  if (
    canonicalRoute?.target_spawn_id === bundled.target_spawn_id &&
    map.spawns.some(
      (spawn) =>
        spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
    )
  ) {
    return "current";
  }

  if (!isBundledHouseBasementArchitecture(map)) return "authored_conflict";

  if (canonicalRoute?.target_spawn_id === bundled.target_spawn_id) {
    return "repairable";
  }

  // An author may already have claimed the stairs cell or the stable bundled
  // id. Treat that as a deliberate conflict: never stack a second transition
  // onto the same cell or overwrite their route just to satisfy an upgrade.
  return map.exits.some(
    (mapExit) =>
      mapExit.id === bundled.id ||
      (mapExit.cell[0] === bundled.cell[0] &&
        mapExit.cell[1] === bundled.cell[1]),
  )
    ? "authored_conflict"
    : "missing";
};

type HouseBasementMarkerStatus =
  | "current"
  | "missing"
  | "authored_conflict";

const houseBasementMarkerStatus = (
  map: MapData | undefined,
): HouseBasementMarkerStatus => {
  if (!map || !BUNDLED_LONELY_STREET_HOUSE_BASEMENT_DOOR) return "missing";
  const bundled = BUNDLED_LONELY_STREET_HOUSE_BASEMENT_DOOR;
  const sameId = map.custom_object_placements.find(
    (placement) => placement.id === bundled.id,
  );
  if (sameId) {
    return sameId.object_id === bundled.object_id &&
      sameId.cell[0] === bundled.cell[0] &&
      sameId.cell[1] === bundled.cell[1]
      ? "current"
      : "authored_conflict";
  }
  if (!isBundledHouseBasementArchitecture(map)) return "authored_conflict";

  // Never place the bundled door over an authored prop that already claims
  // the landing. The route migration remains independent, but its visual
  // marker is additive only when the stair cell is genuinely empty.
  return map.custom_object_placements.some(
    (placement) =>
      placement.cell[0] === bundled.cell[0] &&
      placement.cell[1] === bundled.cell[1],
  )
    ? "authored_conflict"
    : "missing";
};

const withoutBundledHouseBasementLink = (map: MapData): MapData => ({
  ...map,
  spawns: map.spawns.filter(
    (spawn) => spawn.id !== LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
  ),
  exits: map.exits.filter(
    (mapExit) => mapExit.target_map_id !== LONELY_STREET_BASEMENT_MAP_ID,
  ),
  custom_object_placements: map.custom_object_placements.filter(
    (placement) =>
      placement.id !== LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
  ),
});

const isOutdatedBundledLonelyStreetArrival = (map: MapData) => {
  if (map.id === LONELY_STREET_MAP_ID) {
    if (!hasBundledDoorAnchor(map, BUNDLED_LONELY_STREET_FRONT_DOOR)) {
      return false;
    }
    const returnSpawn = map.spawns.find(
      (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
    );
    const houseExit = findBundledRoute(map, BUNDLED_LONELY_STREET_HOUSE_EXIT);
    return (
      (houseExit?.target_spawn_id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID &&
        !returnSpawn) ||
      Boolean(
        houseExit &&
        LEGACY_STREET_HOUSE_TARGET_SPAWN_IDS.has(houseExit.target_spawn_id),
      )
    );
  }
  if (map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID) {
    if (!hasBundledDoorAnchor(map, BUNDLED_LONELY_STREET_INTERIOR_FRONT_DOOR)) {
      return false;
    }
    const entrySpawn = map.spawns.find(
      (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
    );
    const returnExit = findBundledRoute(
      map,
      BUNDLED_LONELY_STREET_INTERIOR_RETURN_EXIT,
    );
    return (
      Boolean(
        entrySpawn &&
        LEGACY_INTERIOR_ENTRY_SPAWN_POSES.has(
          `${entrySpawn.cell[0]}:${entrySpawn.cell[1]}:${entrySpawn.facing[0]}:${entrySpawn.facing[1]}`,
        ),
      ) ||
      (returnExit?.target_spawn_id === LONELY_STREET_RETURN_SPAWN_ID &&
        !entrySpawn) ||
      Boolean(
        returnExit &&
        LEGACY_INTERIOR_RETURN_TARGET_SPAWN_IDS.has(returnExit.target_spawn_id),
      )
    );
  }
  return false;
};

const migrateBundledLonelyStreetArrival = (map: MapData): MapData => {
  if (map.id === LONELY_STREET_MAP_ID) {
    if (!hasBundledDoorAnchor(map, BUNDLED_LONELY_STREET_FRONT_DOOR)) {
      return map;
    }
    const exits = upsertBundledExit(
      map.exits,
      BUNDLED_LONELY_STREET_HOUSE_EXIT,
      LEGACY_STREET_HOUSE_TARGET_SPAWN_IDS,
      map.exits.length === 0,
    );
    const canonicalRoute = findBundledRoute(
      { ...map, exits },
      BUNDLED_LONELY_STREET_HOUSE_EXIT,
    );
    return {
      ...map,
      spawns:
        canonicalRoute?.target_spawn_id ===
        LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID
          ? upsertBundledSpawn(map.spawns, BUNDLED_LONELY_STREET_RETURN_SPAWN)
          : map.spawns,
      exits,
    };
  }
  if (map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID) {
    if (!hasBundledDoorAnchor(map, BUNDLED_LONELY_STREET_INTERIOR_FRONT_DOOR)) {
      return map;
    }
    const exits = upsertBundledExit(
      map.exits,
      BUNDLED_LONELY_STREET_INTERIOR_RETURN_EXIT,
      LEGACY_INTERIOR_RETURN_TARGET_SPAWN_IDS,
      map.exits.length === 0,
    );
    const canonicalRoute = findBundledRoute(
      { ...map, exits },
      BUNDLED_LONELY_STREET_INTERIOR_RETURN_EXIT,
    );
    return {
      ...map,
      ambient_light:
        Number(map.ambient_light ?? 0) === 0.1
          ? LONELY_STREET_HOUSE_INTERIOR_MAP.ambient_light
          : map.ambient_light,
      spawns:
        canonicalRoute?.target_spawn_id === LONELY_STREET_RETURN_SPAWN_ID
          ? upsertBundledSpawn(
              map.spawns,
              BUNDLED_LONELY_STREET_INTERIOR_SPAWN,
              LEGACY_INTERIOR_ENTRY_SPAWN_POSES,
            )
          : map.spawns,
      exits,
    };
  }
  return map;
};

const hasLegacyBundledLonelyStreetInteriorLighting = (map: MapData) =>
  map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
  Number(map.ambient_light ?? 0) === 0.1;
const isLegacyBundledLonelyStreetBasementLighting = (map: MapData) =>
  hasBundledBasementAnchor(map) &&
  [0.12, 0.22, 0.32].includes(Number(map.ambient_light ?? 0));
const isLegacyBundledLonelyStreetBasementPresentationFill = (map: MapData) =>
  hasBundledBasementAnchor(map) &&
  map.presentation_ambient_light === undefined &&
  [0.12, 0.22, 0.32, 0.36].includes(Number(map.ambient_light ?? 0));
const LEGACY_LONELY_STREET_BASEMENT_ENTRY_SPAWN_POSES = new Set([
  "2:3:-1:0",
  "2:3:1:0",
]);
const isLegacyBundledLonelyStreetBasementArrival = (map: MapData) => {
  if (!hasBundledBasementAnchor(map)) return false;
  const spawn = map.spawns.find(
    (candidate) => candidate.id === LONELY_STREET_BASEMENT_SPAWN_ID,
  );
  return Boolean(
    spawn &&
      LEGACY_LONELY_STREET_BASEMENT_ENTRY_SPAWN_POSES.has(
        `${spawn.cell[0]}:${spawn.cell[1]}:${spawn.facing[0]}:${spawn.facing[1]}`,
      ),
  );
};
const mapNeedsHouseArrivalTrigger = (map: MapData) =>
  map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
  !(map.triggers || []).some(
    (trigger) => trigger.id === HOUSE_ARRIVAL_TRIGGER_ID,
  );

// The scene is a map trigger plus the cutscene and dialogue it points at. All
// three have to land together or the trigger fires into a dangling id.
//
// Installing only what is MISSING is not enough: a workspace that captured an
// earlier version of this cutscene keeps it forever, so later edits to the
// staging — a camera angle, a beat, a switch — never reach the saved game. The
// scene is engine-authored, not user content, so a stale copy is replaced
// outright.
// Compare staging, not the raw actions: a stored package has been through the
// schema and carries parser defaults the authored constant does not, so deep
// equality would call every workspace stale forever. Cells are deliberately
// excluded — a fine-expanded runtime copy holds converted coordinates and is
// not out of date.
const houseArrivalSceneIsStale = (pkg: GamePackage) => {
  const stored = pkg.cutscenes.find(
    (cutscene) => cutscene.id === HOUSE_ARRIVAL_CUTSCENE.id,
  );
  if (!stored) return true;
  if (stored.actions.length !== HOUSE_ARRIVAL_CUTSCENE.actions.length) {
    return true;
  }
  return HOUSE_ARRIVAL_CUTSCENE.actions.some((expected, index) => {
    const actual = stored.actions[index];
    return (
      actual?.type !== expected.type ||
      // A pan without a facing is the pre-cinematic-camera version.
      Boolean(actual?.facing) !== Boolean(expected.facing)
    );
  });
};

const HOUSE_ARRIVAL_DIALOGUE_IDS = new Set(
  HOUSE_ARRIVAL_DIALOGUES.map((dialogue) => dialogue.id),
);

const houseArrivalDialogueIsStale = (
  pkg: GamePackage,
  expected: GamePackage["dialogue"][number],
) => {
  const stored = pkg.dialogue.find((dialogue) => dialogue.id === expected.id);
  if (!stored || stored.nodes.length !== expected.nodes.length) return true;
  return expected.nodes.some((expectedNode, nodeIndex) => {
    const actualNode = stored.nodes[nodeIndex];
    if (
      !actualNode ||
      actualNode.id !== expectedNode.id ||
      actualNode.speaker !== expectedNode.speaker ||
      actualNode.text !== expectedNode.text ||
      actualNode.options.length !== expectedNode.options.length
    ) {
      return true;
    }
    return expectedNode.options.some((expectedOption, optionIndex) => {
      const actualOption = actualNode.options[optionIndex];
      return (
        !actualOption ||
        actualOption.text !== expectedOption.text ||
        actualOption.next_node_id !== expectedOption.next_node_id
      );
    });
  });
};

const packageNeedsHouseArrivalScene = (pkg: GamePackage) =>
  pkg.maps.some(mapNeedsHouseArrivalTrigger) ||
  houseArrivalSceneIsStale(pkg) ||
  HOUSE_ARRIVAL_DIALOGUES.some((dialogue) =>
    houseArrivalDialogueIsStale(pkg, dialogue),
  );

const isLegacyBundledLonelyStreetInteriorLayout = (map: MapData) => {
  return (
    map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
    map.width === 9 &&
    map.height === 7 &&
    !map.cells.some((mapCell) => mapCell.x === -5)
  );
};
const migrateLegacyBundledLonelyStreetInteriorLayout = (
  map: MapData,
): MapData => ({
  ...map,
  width: LONELY_STREET_HOUSE_INTERIOR_MAP.width,
  // Preserve every authored room cell and placement. The only addition is the
  // hidden clearance row required outside the hinged front door.
  cells: [
    ...map.cells,
    ...structuredClone(
      LONELY_STREET_HOUSE_INTERIOR_MAP.cells.filter(
        (mapCell) => mapCell.x === -5,
      ),
    ),
  ],
});
const LONELY_STREET_INTERIOR_LAMP_PLACEMENT_IDS = new Set([
  "lonely_street_interior_side_table",
  "lonely_street_interior_table_lamp",
]);
const BUNDLED_LONELY_STREET_INTERIOR_PLACEMENT_BY_ID = new Map(
  LONELY_STREET_HOUSE_INTERIOR_MAP.custom_object_placements.map((placement) => [
    placement.id,
    placement,
  ]),
);
const isLegacyBundledLonelyStreetInteriorLampPlacement = (map: MapData) =>
  map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
  map.custom_object_placements.some(
    (placement) =>
      LONELY_STREET_INTERIOR_LAMP_PLACEMENT_IDS.has(placement.id) &&
      placement.cell[0] === -3 &&
      placement.cell[1] === 0,
  );
const migrateLegacyBundledLonelyStreetInteriorLampPlacement = (
  map: MapData,
): MapData => {
  if (!isLegacyBundledLonelyStreetInteriorLampPlacement(map)) return map;
  return {
    ...map,
    custom_object_placements: map.custom_object_placements.map((placement) => {
      if (
        !LONELY_STREET_INTERIOR_LAMP_PLACEMENT_IDS.has(placement.id) ||
        placement.cell[0] !== -3 ||
        placement.cell[1] !== 0
      ) {
        return placement;
      }
      const bundled = BUNDLED_LONELY_STREET_INTERIOR_PLACEMENT_BY_ID.get(
        placement.id,
      );
      return bundled
        ? { ...placement, cell: structuredClone(bundled.cell) }
        : placement;
    }),
  };
};
const LONELY_STREET_INTERIOR_COFFEE_TABLE_PLACEMENT_ID =
  "lonely_street_interior_coffee_table";
const isMisalignedBundledLonelyStreetInteriorCoffeeTablePlacement = (
  map: MapData,
) =>
  map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
  map.custom_object_placements.some(
    (placement) =>
      placement.id === LONELY_STREET_INTERIOR_COFFEE_TABLE_PLACEMENT_ID &&
      placement.cell[0] === 0 &&
      (placement.cell[1] === 1 || placement.cell[1] === 2) &&
      placement.fine_offset === undefined,
  );
const migrateMisalignedBundledLonelyStreetInteriorCoffeeTablePlacement = (
  map: MapData,
): MapData => {
  if (!isMisalignedBundledLonelyStreetInteriorCoffeeTablePlacement(map)) {
    return map;
  }
  const bundled = BUNDLED_LONELY_STREET_INTERIOR_PLACEMENT_BY_ID.get(
    LONELY_STREET_INTERIOR_COFFEE_TABLE_PLACEMENT_ID,
  );
  if (!bundled) return map;
  return {
    ...map,
    custom_object_placements: map.custom_object_placements.map((placement) =>
      placement.id === LONELY_STREET_INTERIOR_COFFEE_TABLE_PLACEMENT_ID &&
      placement.cell[0] === 0 &&
      (placement.cell[1] === 1 || placement.cell[1] === 2) &&
      placement.fine_offset === undefined
        ? {
            ...placement,
            cell: structuredClone(bundled.cell),
            fine_offset: structuredClone(bundled.fine_offset),
          }
        : placement,
    ),
  };
};
const isLegacyBundledLonelyStreetRoute = (map: MapData) => {
  if (map.id !== LONELY_STREET_MAP_ID) return false;
  const frontDoor = map.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_front_door",
  );
  const hasKnownLegacyDoor =
    !frontDoor ||
    (frontDoor.object_id === "obj_p_door" &&
      frontDoor.cell[0] === LONELY_STREET_DOORWAY_CELL[0] &&
      frontDoor.cell[1] === LONELY_STREET_DOORWAY_CELL[1] &&
      frontDoor.facing[0] === -1 &&
      frontDoor.facing[1] === 0 &&
      frontDoor.collision_mode === "inherit" &&
      Number(frontDoor.height_offset || 0) === 0);
  if (hasKnownLegacyDoor) return true;
  // A current bundled door with no route is the final known pre-interior
  // revision. Any non-empty route on a current/custom door is authored data;
  // the narrower arrival migration below may repair a recognized old spawn ID
  // without replacing the exit or deleting additional destinations.
  return (
    hasBundledDoorAnchor(map, BUNDLED_LONELY_STREET_FRONT_DOOR) &&
    map.exits.length === 0
  );
};
const isLegacyBundledBackroomsQaRoute = (map: MapData) =>
  map.id === BACKROOMS_LEVEL_ZERO_MAP_ID &&
  (map.exits.length > 0 ||
    map.cells.some(
      (cell) => cell.z === 16 && Math.abs(cell.x) <= 1 && cell.walkable,
    ));
const isLegacyBundledLonelyStreetTreeFacing = (
  placement: MapData["custom_object_placements"][number],
) => {
  if (!placement.id?.startsWith("lonely_street_tree_")) return false;
  const [x, z] = placement.cell;
  const legacyFacing =
    Math.abs(x * 17 + z * 11) % 2 === 0 ? ([0, 1] as const) : ([1, 0] as const);
  return (
    placement.facing[0] === legacyFacing[0] &&
    placement.facing[1] === legacyFacing[1]
  );
};
const migratePreviousLongLonelyStreetLayout = (map: MapData): MapData => {
  const cells = map.cells.map((cell) => {
    if (!isLonelyStreetHouseMigrationCell(cell.x, cell.z)) return cell;
    const bundled = BUNDLED_LONELY_STREET_CELL_BY_KEY.get(
      `${cell.x}:${cell.z}`,
    );
    return bundled
      ? {
          ...cell,
          walkable: bundled.walkable,
          blocks_los: bundled.blocks_los,
          height: bundled.height,
          visual_height: bundled.visual_height,
          terrain: bundled.terrain,
          object_id: bundled.object_id,
        }
      : cell;
  });
  const preservedPlacements = map.custom_object_placements
    .filter((placement) => {
      if (placement.id === "lonely_street_last_house") return false;
      return !(
        placement.id?.startsWith("lonely_street_tree_") &&
        isLonelyStreetHouseMigrationCell(placement.cell[0], placement.cell[1])
      );
    })
    .map((placement) => {
      if (!isLegacyBundledLonelyStreetTreeFacing(placement)) return placement;
      const bundled = BUNDLED_LONELY_STREET_PLACEMENT_BY_ID.get(placement.id);
      return bundled
        ? { ...placement, facing: structuredClone(bundled.facing) }
        : placement;
    });
  const replacementPlacements = LONELY_STREET_MAP.custom_object_placements
    .filter(
      (placement) =>
        placement.id === "lonely_street_last_house" ||
        (placement.id?.startsWith("lonely_street_tree_") &&
          isLonelyStreetHouseMigrationCell(
            placement.cell[0],
            placement.cell[1],
          )),
    )
    .map((placement) => structuredClone(placement));
  return {
    ...map,
    environment: "exterior",
    cells,
    custom_object_placements: [
      ...preservedPlacements,
      ...replacementPlacements,
    ],
  };
};
const BUNDLED_PROJECT_TITLES = new Set([
  "CRPG Engine Feature Test Suite",
  "Fracture Crawl — Integrated Architecture Scenario",
]);

/**
 * Persisted browser workspaces remain authored projects: existing records are
 * never overwritten. Repository-owned additions may be appended narrowly to
 * recognizable bundled projects so a new built-in encounter becomes available
 * without asking the user to replace their edited package.
 */
const isLegacyBundledRileySofaPlacement = (
  placement: MapData["entity_placements"][number],
) =>
  placement.entity_id === RILEY_ENTITY_ID &&
  ((placement.presentation_anchor?.object_placement_id ===
    RILEY_SOFA_OBJECT_PLACEMENT_ID &&
    (placement.presentation_anchor.lock_to_anchor !== true ||
      placement.presentation_anchor.revision !==
        RILEY_SOFA_ANCHOR_REVISION)) ||
    (Math.abs(placement.cell[0] - -2.12) < 0.0001 &&
    Math.abs(placement.cell[1] - 0.28) < 0.0001 &&
    ((placement.presentation_offset === undefined ||
      (placement.presentation_offset[0] === 0 &&
        placement.presentation_offset[1] === 0)) &&
      placement.height_offset === 0.06)) ||
    (placement.cell[0] === -2 &&
    placement.cell[1] === 0 &&
    ((placement.presentation_offset === undefined &&
      placement.height_offset === undefined) ||
      (placement.presentation_offset?.[0] === -0.12 &&
        placement.presentation_offset?.[1] === 0.28 &&
        placement.height_offset === 0.06) ||
      (placement.presentation_offset?.[0] === -0.12 &&
        placement.presentation_offset?.[1] === 0.48 &&
        placement.height_offset === 0.13))) ||
    (placement.cell[0] === -2 &&
      placement.cell[1] === 1 &&
      ((placement.presentation_offset?.[0] === 1.03 &&
        placement.presentation_offset?.[1] === -1.48 &&
        placement.height_offset === 0.13) ||
        (placement.presentation_offset?.[0] === -0.57 &&
          placement.presentation_offset?.[1] === -0.48 &&
          placement.height_offset === 0.035) ||
        (placement.presentation_offset?.[0] === -0.57 &&
          placement.presentation_offset?.[1] === -0.9 &&
          placement.height_offset === 0.39))));

const isLegacyBundledRileyModel = (object: ObjectData) =>
  object.id === RILEY_MODEL_OBJECT_ID &&
  object.asset?.data_url === RILEY_RIGGED_MODEL.asset?.data_url &&
  object.asset?.animation?.clip_name === "Animation" &&
  (object.asset.stats?.bytes === 3385256 ||
    object.asset.stats?.bytes === 3388940);

const isOutdatedBundledRileyModel = (object: ObjectData) =>
  object.id === RILEY_MODEL_OBJECT_ID &&
  object.asset?.data_url === RILEY_RIGGED_MODEL.asset?.data_url &&
  !object.tags.includes(RILEY_BUNDLED_ASSET_REVISION);

const hasLegacyBundledRileyFire = (entity: EntityData) =>
  entity.id === RILEY_ENTITY_ID &&
  entity.model_object_id === RILEY_MODEL_OBJECT_ID &&
  entity.presentation_fire?.width === 1.18 &&
  entity.presentation_fire.height === 2.35 &&
  entity.presentation_fire.spark_count === 26;

const correctedBundledRileySofaPlacement = () => ({
  id: RILEY_SOFA_PLACEMENT_ID,
  entity_id: RILEY_ENTITY_ID,
  cell: structuredClone(RILEY_SOFA_SEATED_CELL),
  facing: [0, 1] as [number, number],
  collision_mode: "none" as const,
  presentation_anchor: {
    object_placement_id: RILEY_SOFA_OBJECT_PLACEMENT_ID,
    local_position: structuredClone(RILEY_SOFA_SEATED_LOCAL_POSITION),
    local_facing: structuredClone(RILEY_SOFA_SEATED_LOCAL_FACING),
    lock_to_anchor: true,
    revision: RILEY_SOFA_ANCHOR_REVISION,
  },
});

export const refreshBundledEnginePackage = (pkg: GamePackage): GamePackage => {
  const packageWithPlayerContent = withBundledPlayerGuitarContent(pkg);
  const mapIndex = packageWithPlayerContent.maps.findIndex(
    (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
  );
  if (
    mapIndex < 0 ||
    !BUNDLED_PROJECT_TITLES.has(packageWithPlayerContent.metadata.title)
  ) {
    return packageWithPlayerContent;
  }

  pkg = packageWithPlayerContent;

  const hasModel = pkg.object_library.some(
    (object) => object.id === BACKROOMS_PARASITE_MODEL_OBJECT_ID,
  );
  const hasEntity = pkg.entities.some(
    (entity) => entity.id === BACKROOMS_PARASITE_ENTITY_ID,
  );
  const hasRileyModel = pkg.object_library.some(
    (object) => object.id === RILEY_MODEL_OBJECT_ID,
  );
  const hasRileyEntity = pkg.entities.some(
    (entity) => entity.id === RILEY_ENTITY_ID,
  );
  const hasRileyDialogue = pkg.dialogue.some(
    (dialogue) => dialogue.id === RILEY_DIALOGUE_ID,
  );
  const hasRileyPlacement = pkg.maps.some(
    (map) =>
      map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      map.entity_placements.some(
        (placement) => placement.entity_id === RILEY_ENTITY_ID,
      ),
  );
  const hasLegacyRileySofaPlacement = pkg.maps.some(
    (map) =>
      map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      map.entity_placements.some(isLegacyBundledRileySofaPlacement),
  );
  const hasLegacyRileyModel = pkg.object_library.some(
    isLegacyBundledRileyModel,
  );
  const hasOutdatedRileyModel = pkg.object_library.some(
    isOutdatedBundledRileyModel,
  );
  const hasLegacyRileyPresentation = pkg.entities.some(
    (entity) =>
      entity.id === RILEY_ENTITY_ID &&
      entity.model_object_id === RILEY_MODEL_OBJECT_ID &&
      (entity.presentation_fill_light === undefined ||
        entity.presentation_fire === undefined ||
        hasLegacyBundledRileyFire(entity)),
  );
  const needsLonelyStreetStartMigration =
    (pkg.metadata.start_map_id === QA_START_MAP_ID &&
      pkg.metadata.start_spawn_id === QA_START_SPAWN_ID) ||
    (pkg.metadata.start_map_id === PHASE_11_HUB_MAP_ID &&
      pkg.metadata.start_spawn_id === PHASE_11_HUB_SPAWN_ID);
  const currentMapMusic = (pkg.settings?.map_music || {}) as Record<
    string,
    string
  >;
  const currentMusicTracks = (pkg.settings?.music_tracks || {}) as Record<
    string,
    string
  >;
  const lonelyStreetMusic = currentMapMusic[LONELY_STREET_MAP_ID];
  const needsBundledStoryMusic =
    (!pkg.settings?.title_music_url && !pkg.settings?.title_music_id) ||
    !pkg.settings?.opening_music_url ||
    currentMusicTracks[BUNDLED_OPENING_MUSIC_ID] !==
      BUNDLED_OPENING_MUSIC_URL ||
    !Object.prototype.hasOwnProperty.call(
      currentMapMusic,
      LONELY_STREET_MAP_ID,
    ) ||
    lonelyStreetMusic === BUNDLED_OPENING_MUSIC_URL;
  const parasiteHasCurrentHunterProfile = pkg.entities.some((entity) => {
    if (
      entity.id !== BACKROOMS_PARASITE_ENTITY_ID ||
      entity.independent_movement?.enabled !== true ||
      entity.independent_movement.interval_ms !==
        BACKROOMS_PARASITE_ENTITY.independent_movement?.interval_ms ||
      entity.independent_movement.activation_radius !==
        BACKROOMS_PARASITE_ENTITY.independent_movement?.activation_radius ||
      entity.independent_movement.steps_per_pulse !==
        BACKROOMS_PARASITE_ENTITY.independent_movement?.steps_per_pulse ||
      entity.horror_combat?.windup_ms !==
        BACKROOMS_PARASITE_ENTITY.horror_combat?.windup_ms ||
      entity.horror_combat?.active_ms !==
        BACKROOMS_PARASITE_ENTITY.horror_combat?.active_ms ||
      entity.horror_combat?.recovery_ms !==
        BACKROOMS_PARASITE_ENTITY.horror_combat?.recovery_ms ||
      entity.horror_combat?.reach_fine_cells !==
        BACKROOMS_PARASITE_ENTITY.horror_combat?.reach_fine_cells ||
      entity.horror_combat?.lunge_fine_cells !==
        BACKROOMS_PARASITE_ENTITY.horror_combat?.lunge_fine_cells ||
      entity.horror_combat?.direction_lock_fraction !==
        BACKROOMS_PARASITE_ENTITY.horror_combat?.direction_lock_fraction ||
      entity.sensory_profile?.id !==
        BACKROOMS_PARASITE_ENTITY.sensory_profile?.id ||
      entity.sensory_profile.memory_ticks !==
        BACKROOMS_PARASITE_ENTITY.sensory_profile?.memory_ticks ||
      entity.sensory_profile.search_ticks !==
        BACKROOMS_PARASITE_ENTITY.sensory_profile?.search_ticks
    ) {
      return false;
    }
    const currentSight = entity.sensory_profile.channels.find((channel) =>
      channel.stimulus_kinds.includes("visible_player"),
    );
    const expectedSight =
      BACKROOMS_PARASITE_ENTITY.sensory_profile?.channels.find((channel) =>
        channel.stimulus_kinds.includes("visible_player"),
      );
    const currentHearing = entity.sensory_profile.channels.find((channel) =>
      channel.stimulus_kinds.includes("sound"),
    );
    const expectedHearing =
      BACKROOMS_PARASITE_ENTITY.sensory_profile?.channels.find((channel) =>
        channel.stimulus_kinds.includes("sound"),
      );
    return (
      currentSight?.range === expectedSight?.range &&
      currentSight?.requires_los === true &&
      currentSight?.tracks_live_target === true &&
      currentSight?.requires_illumination === false &&
      currentHearing?.range === expectedHearing?.range &&
      currentHearing?.requires_los === false &&
      currentHearing?.tracks_live_target === false &&
      currentHearing?.barrier_response === expectedHearing?.barrier_response
    );
  });
  const hasPlacement = pkg.maps[mapIndex].entity_placements.some(
    (placement) => placement.entity_id === BACKROOMS_PARASITE_ENTITY_ID,
  );
  const hasBackroomsRealtimeMode =
    pkg.maps[mapIndex].combat_mode === "horror_realtime";
  const hasBackroomsMicroWalls =
    (pkg.maps[mapIndex].fine_cell_overrides?.length || 0) > 0;
  const hasBackroomsHearingTuning =
    Number(pkg.settings?.movement_hearing?.normal_movement_loudness || 0) >=
      6.5 &&
    Number(
      pkg.settings?.movement_hearing?.stealth_noise_multiplier ??
        Number.POSITIVE_INFINITY,
    ) <= 0.1;
  const existingLonelyStreetInteriorMap = pkg.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const existingLonelyStreetBasementMap = pkg.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  const hasLonelyStreetMap = pkg.maps.some(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const hasLonelyStreetInteriorMap = Boolean(existingLonelyStreetInteriorMap);
  const hasLonelyStreetBasementMap = Boolean(existingLonelyStreetBasementMap);
  const basementRouteStatus = houseBasementRouteStatus(
    existingLonelyStreetInteriorMap,
  );
  const basementMarkerStatus = houseBasementMarkerStatus(
    existingLonelyStreetInteriorMap,
  );
  const canInstallBundledBasement =
    !existingLonelyStreetInteriorMap ||
    (basementRouteStatus !== "authored_conflict" &&
      basementMarkerStatus !== "authored_conflict");
  const shouldInstallBundledBasement =
    !hasLonelyStreetBasementMap && canInstallBundledBasement;
  const hasCompatibleBundledBasement = Boolean(
    existingLonelyStreetBasementMap &&
      hasBundledBasementAnchor(existingLonelyStreetBasementMap),
  );
  const shouldProvisionBundledBasementAssets =
    shouldInstallBundledBasement || hasCompatibleBundledBasement;
  const basementEncounterResolved =
    !shouldProvisionBundledBasementAssets || hasBundledBasementEncounter(pkg);
  const shouldAppendHouseWithoutBasementLink =
    !hasLonelyStreetInteriorMap &&
    hasLonelyStreetBasementMap &&
    !hasCompatibleBundledBasement;
  const basementContentResolved =
    hasLonelyStreetBasementMap || !shouldInstallBundledBasement;
  const basementHouseRouteResolved =
    !hasCompatibleBundledBasement ||
    basementRouteStatus === "current" ||
    basementRouteStatus === "authored_conflict";
  const shouldInstallHouseBasementRoute =
    Boolean(existingLonelyStreetInteriorMap) &&
    (basementRouteStatus === "missing" ||
      basementRouteStatus === "repairable") &&
    basementMarkerStatus !== "authored_conflict" &&
    (shouldInstallBundledBasement || hasCompatibleBundledBasement);
  const shouldInstallHouseBasementMarker =
    Boolean(BUNDLED_LONELY_STREET_HOUSE_BASEMENT_DOOR) &&
    Boolean(existingLonelyStreetInteriorMap) &&
    basementMarkerStatus === "missing" &&
    basementRouteStatus !== "authored_conflict" &&
    (shouldInstallBundledBasement || hasCompatibleBundledBasement);
  const hasSafeRoutePulseCombatModes = pkg.maps
    .filter(
      (map) =>
        map.id === LONELY_STREET_MAP_ID ||
        map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    )
    .every((map) => map.combat_mode === "pulse");
  const hasLegacyLonelyStreetInteriorLayout = pkg.maps.some(
    isLegacyBundledLonelyStreetInteriorLayout,
  );
  const hasLegacyLonelyStreetInteriorLampPlacement = pkg.maps.some(
    isLegacyBundledLonelyStreetInteriorLampPlacement,
  );
  const hasMisalignedLonelyStreetInteriorCoffeeTablePlacement = pkg.maps.some(
    isMisalignedBundledLonelyStreetInteriorCoffeeTablePlacement,
  );
  const hasLegacyLonelyStreetInteriorLighting = pkg.maps.some(
    hasLegacyBundledLonelyStreetInteriorLighting,
  );
  const hasLegacyLonelyStreetBasementLighting = pkg.maps.some(
    isLegacyBundledLonelyStreetBasementLighting,
  );
  const hasLegacyLonelyStreetBasementPresentationFill = pkg.maps.some(
    isLegacyBundledLonelyStreetBasementPresentationFill,
  );
  const hasLegacyLonelyStreetBasementArrival = pkg.maps.some(
    isLegacyBundledLonelyStreetBasementArrival,
  );
  const hasOutdatedLonelyStreetArrival = pkg.maps.some(
    isOutdatedBundledLonelyStreetArrival,
  );
  const hasOutdatedLonelyStreetLayout = pkg.maps.some(
    isOutdatedBundledLonelyStreetLayout,
  );
  const hasPreviousLongLonelyStreetLayout = pkg.maps.some(
    isPreviousLongBundledLonelyStreetLayout,
  );
  const hasLegacyLonelyStreetTraversal = pkg.maps.some(
    isLegacyBundledLonelyStreetTraversal,
  );
  const hasLegacyLonelyStreetRoute = pkg.maps.some(
    isLegacyBundledLonelyStreetRoute,
  );
  const hasDeprecatedDenseLonelyStreetTrees = pkg.maps.some(
    (map) =>
      map.id === LONELY_STREET_MAP_ID &&
      map.custom_object_placements.some(
        isDeprecatedDenseLonelyStreetTreePlacement,
      ),
  );
  const hasLegacyBackroomsQaRoute = pkg.maps.some(
    isLegacyBundledBackroomsQaRoute,
  );
  const hasOutdatedLonelyStreetHouse = pkg.object_library.some(
    isOutdatedBundledLonelyStreetHouse,
  );
  const hasLegacyLonelyStreetTree = pkg.object_library.some(
    isLegacyBundledLonelyStreetTree,
  );
  const hasLegacyLonelyStreetLightSource = pkg.object_library.some(
    isLegacyBundledLonelyStreetLightSource,
  );
  const hasLegacyLonelyStreetBasementLight = pkg.object_library.some(
    isLegacyBundledLonelyStreetBasementLight,
  );
  const hasLegacyLonelyStreetInteriorFurnitureCollision =
    pkg.object_library.some(
      isLegacyBundledLonelyStreetInteriorFurnitureCollision,
    );
  // object_library merge elsewhere only APPENDS objects missing by id, so an
  // existing Moon God model — at whatever scale it was saved with — is never
  // otherwise revisited. Gate the early "nothing to do" return on this too, or
  // a scale bump authored here never reaches an existing save.
  const hasLegacyMoonGodModel = pkg.object_library.some(
    isLegacyBundledMoonGodModel,
  );
  const needsHouseArrivalScene = packageNeedsHouseArrivalScene(pkg);
  const existingObjectIds = new Set(
    pkg.object_library.map((object) => object.id),
  );
  const missingLonelyStreetObjects = BUNDLED_LONELY_STREET_OBJECTS.filter(
    (object) =>
      !existingObjectIds.has(object.id) &&
      (shouldProvisionBundledBasementAssets ||
        !LONELY_STREET_BASEMENT_OBJECT_ID_SET.has(object.id)),
  );
  if (
    hasModel &&
    hasEntity &&
    hasRileyModel &&
    hasRileyEntity &&
    hasRileyDialogue &&
    hasRileyPlacement &&
    !hasLegacyRileySofaPlacement &&
    !hasLegacyRileyModel &&
    !hasOutdatedRileyModel &&
    !hasLegacyRileyPresentation &&
    !needsLonelyStreetStartMigration &&
    !needsBundledStoryMusic &&
    hasPlacement &&
    parasiteHasCurrentHunterProfile &&
    hasBackroomsRealtimeMode &&
    hasBackroomsMicroWalls &&
    hasBackroomsHearingTuning &&
    hasLonelyStreetMap &&
    hasLonelyStreetInteriorMap &&
    basementContentResolved &&
    basementHouseRouteResolved &&
    basementEncounterResolved &&
    !shouldInstallHouseBasementMarker &&
    hasSafeRoutePulseCombatModes &&
    !hasLegacyLonelyStreetInteriorLayout &&
    !hasLegacyLonelyStreetInteriorLampPlacement &&
    !hasMisalignedLonelyStreetInteriorCoffeeTablePlacement &&
    !hasLegacyLonelyStreetInteriorLighting &&
    !hasLegacyLonelyStreetBasementLighting &&
    !hasLegacyLonelyStreetBasementPresentationFill &&
    !hasLegacyLonelyStreetBasementArrival &&
    !hasOutdatedLonelyStreetArrival &&
    !hasOutdatedLonelyStreetLayout &&
    !hasPreviousLongLonelyStreetLayout &&
    !hasLegacyLonelyStreetTraversal &&
    !hasLegacyLonelyStreetRoute &&
    !hasDeprecatedDenseLonelyStreetTrees &&
    !hasLegacyBackroomsQaRoute &&
    !hasOutdatedLonelyStreetHouse &&
    !hasLegacyLonelyStreetTree &&
    !hasLegacyLonelyStreetLightSource &&
    !hasLegacyLonelyStreetBasementLight &&
    !hasLegacyLonelyStreetInteriorFurnitureCollision &&
    !hasLegacyMoonGodModel &&
    !needsHouseArrivalScene &&
    missingLonelyStreetObjects.length === 0
  ) {
    return pkg;
  }

  const objectLibraryWithParasite = hasModel
    ? pkg.object_library
    : [...pkg.object_library, structuredClone(BACKROOMS_PARASITE_MODEL)];
  const objectLibraryWithRiley = hasRileyModel
    ? objectLibraryWithParasite.map((object) =>
        isLegacyBundledRileyModel(object) || isOutdatedBundledRileyModel(object)
          ? structuredClone(RILEY_RIGGED_MODEL)
          : object,
      )
    : [...objectLibraryWithParasite, structuredClone(RILEY_RIGGED_MODEL)];
  const objectLibraryWithStreetFix = objectLibraryWithRiley.map((object) => {
    let upgradedObject = object;
    if (isLegacyBundledLonelyStreetLightSource(object)) {
      const bundled = BUNDLED_LONELY_STREET_LIGHT_OBJECTS.get(object.id);
      upgradedObject = {
        ...object,
        light_source: {
          ...object.light_source!,
          source_height_offset: bundled!.light_source!.source_height_offset,
        },
      };
    }
    if (isLegacyBundledMoonGodModel(upgradedObject)) {
      // Wholesale replace: scale, bounds, and asset transform all move
      // together, and there is nothing authored on this object worth
      // preserving from an older revision.
      upgradedObject = structuredClone(MOON_GOD_MODEL);
    }
    if (isLegacyBundledLonelyStreetBasementLight(upgradedObject)) {
      const bundled = BUNDLED_LONELY_STREET_BASEMENT_LIGHT_OBJECTS.get(
        upgradedObject.id,
      );
      if (bundled?.light_source) {
        upgradedObject = {
          ...upgradedObject,
          light_source: structuredClone(bundled.light_source),
        };
      }
    }
    if (isLegacyBundledLonelyStreetInteriorFurnitureCollision(upgradedObject)) {
      const bundled =
        BUNDLED_LONELY_STREET_INTERIOR_FITTED_COLLISION_OBJECTS.get(
          upgradedObject.id,
        );
      if (bundled) {
        // Collision is fitted to the RENDERED model, so the render transform
        // has to travel with it or the upgraded collider lands off the mesh.
        upgradedObject = {
          ...upgradedObject,
          tags: upgradedObject.tags?.includes(
            LONELY_STREET_INTERIOR_COLLISION_REVISION,
          )
            ? upgradedObject.tags
            : [
                ...(upgradedObject.tags || []),
                LONELY_STREET_INTERIOR_COLLISION_REVISION,
              ],
          bounds: structuredClone(bundled.bounds),
          collision: structuredClone(bundled.collision),
          asset:
            upgradedObject.asset && bundled.asset
              ? {
                  ...upgradedObject.asset,
                  offset: structuredClone(bundled.asset.offset),
                  scale: structuredClone(bundled.asset.scale),
                  source_bounds: structuredClone(bundled.asset.source_bounds),
                  source_min: structuredClone(bundled.asset.source_min),
                  source_center: structuredClone(bundled.asset.source_center),
                }
              : upgradedObject.asset,
        };
      }
    }
    if (
      isLegacyBundledLonelyStreetTree(upgradedObject) &&
      BUNDLED_LONELY_STREET_TREE_OBJECT
    ) {
      upgradedObject = structuredClone(BUNDLED_LONELY_STREET_TREE_OBJECT);
    } else if (
      isSolidBundledLonelyStreetHouse(upgradedObject) &&
      BUNDLED_LONELY_STREET_HOUSE_OBJECT
    ) {
      upgradedObject = {
        ...object,
        bounds: structuredClone(BUNDLED_LONELY_STREET_HOUSE_OBJECT.bounds),
        parts: structuredClone(BUNDLED_LONELY_STREET_HOUSE_OBJECT.parts),
        collision: structuredClone(
          BUNDLED_LONELY_STREET_HOUSE_OBJECT.collision,
        ),
      };
    } else if (
      isLegacyLonelyStreetRoof(upgradedObject) &&
      BUNDLED_LONELY_STREET_HOUSE_OBJECT
    ) {
      upgradedObject = {
        ...object,
        parts: object.parts.map((part) => {
          const bundledPart = BUNDLED_LONELY_STREET_HOUSE_OBJECT.parts.find(
            (candidate) => candidate.name === part.name,
          );
          return bundledPart &&
            (part.name === "left_roof_slope" ||
              part.name === "right_roof_slope")
            ? { ...part, rotation: structuredClone(bundledPart.rotation) }
            : part;
        }),
      };
    }

    return isLegacyBundledLonelyStreetOpenDoor(upgradedObject)
      ? {
          ...upgradedObject,
          parts: upgradedObject.parts.filter(
            (part) => part.name !== "open_front_door",
          ),
        }
      : upgradedObject;
  });
  const upgradedMaps = pkg.maps.map((map, index) => {
    const interiorLayoutUpgradedMap = isLegacyBundledLonelyStreetInteriorLayout(
      map,
    )
      ? migrateLegacyBundledLonelyStreetInteriorLayout(map)
      : map;
    // A workspace saved before the arrival scene existed still holds the
    // interior map with no triggers on it. New authored content is not reachable
    // through the object/collision upgrades above, so reinstall the trigger here
    // or the cutscene simply never fires for that save.
    const arrivalTriggerUpgradedMap = mapNeedsHouseArrivalTrigger(
      interiorLayoutUpgradedMap,
    )
      ? {
          ...interiorLayoutUpgradedMap,
          triggers: [
            ...(interiorLayoutUpgradedMap.triggers || []),
            structuredClone(HOUSE_ARRIVAL_TRIGGER),
          ],
        }
      : interiorLayoutUpgradedMap;
    const interiorPresentationUpgradedMap =
      migrateMisalignedBundledLonelyStreetInteriorCoffeeTablePlacement(
        migrateLegacyBundledLonelyStreetInteriorLampPlacement(
          arrivalTriggerUpgradedMap,
        ),
      );
    const parasiteUpgradedMap =
      index === mapIndex
        ? {
            ...interiorPresentationUpgradedMap,
            combat_mode: "horror_realtime" as const,
            fine_cell_overrides: hasBackroomsMicroWalls
              ? interiorPresentationUpgradedMap.fine_cell_overrides
              : structuredClone(BACKROOMS_LEVEL_ZERO_MICRO_WALL_OVERRIDES),
            entity_placements: hasPlacement
              ? interiorPresentationUpgradedMap.entity_placements
              : [
                  ...interiorPresentationUpgradedMap.entity_placements,
                  {
                    entity_id: BACKROOMS_PARASITE_ENTITY_ID,
                    cell: [7, 13] as [number, number],
                    facing: [-1, 0] as [number, number],
                  },
                ],
          }
        : interiorPresentationUpgradedMap;
    const basementLightingUpgradedMap =
      isLegacyBundledLonelyStreetBasementLighting(parasiteUpgradedMap)
        ? {
            ...parasiteUpgradedMap,
            ambient_light: LONELY_STREET_BASEMENT_MAP.ambient_light,
          }
        : parasiteUpgradedMap;
    const basementPresentationFillUpgradedMap =
      isLegacyBundledLonelyStreetBasementPresentationFill(
        basementLightingUpgradedMap,
      )
        ? {
            ...basementLightingUpgradedMap,
            presentation_ambient_light:
              LONELY_STREET_BASEMENT_MAP.presentation_ambient_light,
          }
        : basementLightingUpgradedMap;
    const basementArrivalUpgradedMap =
      isLegacyBundledLonelyStreetBasementArrival(
        basementPresentationFillUpgradedMap,
      )
        ? {
            ...basementPresentationFillUpgradedMap,
            spawns: upsertBundledSpawn(
              basementPresentationFillUpgradedMap.spawns,
              BUNDLED_LONELY_STREET_BASEMENT_ENTRY_SPAWN,
              LEGACY_LONELY_STREET_BASEMENT_ENTRY_SPAWN_POSES,
            ),
          }
        : basementPresentationFillUpgradedMap;
    let routeUpgradedMap =
      basementArrivalUpgradedMap.id === LONELY_STREET_MAP_ID ||
      basementArrivalUpgradedMap.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID
        ? {
            ...basementArrivalUpgradedMap,
            combat_mode: "pulse" as const,
          }
        : basementArrivalUpgradedMap;
    if (
      isLegacyBundledLonelyStreetRoute(routeUpgradedMap) &&
      BUNDLED_LONELY_STREET_FRONT_DOOR &&
      BUNDLED_LONELY_STREET_HOUSE_EXIT
    ) {
      routeUpgradedMap = {
        ...routeUpgradedMap,
        custom_object_placements: [
          ...routeUpgradedMap.custom_object_placements.filter(
            (placement) => placement.id !== "lonely_street_front_door",
          ),
          structuredClone(BUNDLED_LONELY_STREET_FRONT_DOOR),
        ],
        exits: [structuredClone(BUNDLED_LONELY_STREET_HOUSE_EXIT)],
      };
    }
    routeUpgradedMap = migrateBundledLonelyStreetArrival(routeUpgradedMap);
    if (
      shouldInstallHouseBasementRoute &&
      routeUpgradedMap.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID
    ) {
      const exits = upsertBundledExit(
        routeUpgradedMap.exits,
        BUNDLED_LONELY_STREET_HOUSE_BASEMENT_EXIT,
        new Set<string | undefined>(),
        true,
      );
      const canonicalRoute = findBundledRoute(
        { ...routeUpgradedMap, exits },
        BUNDLED_LONELY_STREET_HOUSE_BASEMENT_EXIT,
      );
      routeUpgradedMap = {
        ...routeUpgradedMap,
        spawns: canonicalRoute
          ? upsertBundledSpawn(
              routeUpgradedMap.spawns,
              BUNDLED_LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN,
            )
          : routeUpgradedMap.spawns,
        exits,
      };
    }
    if (
      shouldInstallHouseBasementMarker &&
      BUNDLED_LONELY_STREET_HOUSE_BASEMENT_DOOR &&
      routeUpgradedMap.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID
    ) {
      routeUpgradedMap = {
        ...routeUpgradedMap,
        custom_object_placements: [
          ...routeUpgradedMap.custom_object_placements,
          structuredClone(BUNDLED_LONELY_STREET_HOUSE_BASEMENT_DOOR),
        ],
      };
    }
    if (
      routeUpgradedMap.id === LONELY_STREET_MAP_ID &&
      routeUpgradedMap.custom_object_placements.some(
        isDeprecatedDenseLonelyStreetTreePlacement,
      )
    ) {
      routeUpgradedMap = {
        ...routeUpgradedMap,
        custom_object_placements:
          routeUpgradedMap.custom_object_placements.filter(
            (placement) =>
              !isDeprecatedDenseLonelyStreetTreePlacement(placement),
          ),
      };
    }
    if (isLegacyBundledBackroomsQaRoute(routeUpgradedMap)) {
      routeUpgradedMap = {
        ...routeUpgradedMap,
        cells: routeUpgradedMap.cells.map((cell) =>
          cell.z === 16 && Math.abs(cell.x) <= 1
            ? {
                ...cell,
                walkable: false,
                blocks_los: true,
                height: 1,
                visual_height: 1.5,
                object_id: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
              }
            : cell,
        ),
        exits: [],
      };
    }
    if (routeUpgradedMap.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID) {
      const hasRiley = routeUpgradedMap.entity_placements.some(
        (placement) => placement.entity_id === RILEY_ENTITY_ID,
      );
      routeUpgradedMap = {
        ...routeUpgradedMap,
        entity_placements: hasRiley
          ? routeUpgradedMap.entity_placements.map((placement) =>
              isLegacyBundledRileySofaPlacement(placement)
                ? correctedBundledRileySofaPlacement()
                : placement,
            )
          : [
              ...routeUpgradedMap.entity_placements,
              correctedBundledRileySofaPlacement(),
            ],
      };
    }
    routeUpgradedMap = installBundledBasementEncounterOnMap(routeUpgradedMap);
    if (isPreviousLongBundledLonelyStreetLayout(routeUpgradedMap)) {
      return migratePreviousLongLonelyStreetLayout(routeUpgradedMap);
    }
    if (isLegacyBundledLonelyStreetTraversal(routeUpgradedMap)) {
      return {
        ...routeUpgradedMap,
        cells: routeUpgradedMap.cells.map((cell) => {
          const bundledCell = BUNDLED_LONELY_STREET_TRAVERSAL_CELLS.get(
            `${cell.x}:${cell.z}`,
          );
          return bundledCell
            ? {
                ...cell,
                walkable: bundledCell.walkable,
                blocks_los: bundledCell.blocks_los,
                height: bundledCell.height,
                visual_height: bundledCell.visual_height,
              }
            : cell;
        }),
        custom_object_placements: routeUpgradedMap.custom_object_placements.map(
          (placement) => {
            if (
              placement.id !== "lonely_street_last_house" &&
              placement.id !== "lonely_street_front_door"
            ) {
              return placement;
            }
            const bundledPlacement = BUNDLED_LONELY_STREET_PLACEMENT_BY_ID.get(
              placement.id,
            );
            return bundledPlacement
              ? structuredClone(bundledPlacement)
              : placement;
          },
        ),
      };
    }
    if (!isOutdatedBundledLonelyStreetLayout(routeUpgradedMap)) {
      return routeUpgradedMap;
    }
    const preservedPlacements =
      routeUpgradedMap.custom_object_placements.filter(
        (placement) => !isBundledLonelyStreetPlacement(placement),
      );
    return {
      ...routeUpgradedMap,
      environment: "exterior" as const,
      width: LONELY_STREET_MAP.width,
      height: LONELY_STREET_MAP.height,
      cells: structuredClone(LONELY_STREET_MAP.cells),
      custom_object_placements: [
        ...preservedPlacements,
        ...structuredClone(LONELY_STREET_MAP.custom_object_placements),
      ],
    };
  });

  const entitiesWithParasite = hasEntity
    ? pkg.entities.map((entity) =>
        entity.id === BACKROOMS_PARASITE_ENTITY_ID
          ? {
              ...entity,
              independent_movement: structuredClone(
                BACKROOMS_PARASITE_ENTITY.independent_movement,
              ),
              horror_combat: structuredClone(
                BACKROOMS_PARASITE_ENTITY.horror_combat,
              ),
              sensory_profile: structuredClone(
                BACKROOMS_PARASITE_ENTITY.sensory_profile,
              ),
            }
          : entity,
      )
    : [...pkg.entities, structuredClone(BACKROOMS_PARASITE_ENTITY)];
  const entitiesWithRiley = hasRileyEntity
    ? entitiesWithParasite.map((entity) =>
        entity.id === RILEY_ENTITY_ID &&
        entity.model_object_id === RILEY_MODEL_OBJECT_ID
          ? {
              ...entity,
              ...(entity.presentation_fill_light === undefined
                ? {
                    presentation_fill_light: structuredClone(
                      RILEY_ENTITY.presentation_fill_light,
                    ),
                  }
                : {}),
              ...(entity.presentation_fire === undefined ||
              hasLegacyBundledRileyFire(entity)
                ? {
                    presentation_fire: structuredClone(
                      RILEY_ENTITY.presentation_fire,
                    ),
                  }
                : {}),
            }
          : entity,
      )
    : [...entitiesWithParasite, structuredClone(RILEY_ENTITY)];
  const entitiesWithMoonGod = shouldProvisionBundledBasementAssets
    ? [
        ...entitiesWithRiley.filter(
          (entity) => entity.id !== MOON_GOD_ENTITY_ID,
        ),
        structuredClone(MOON_GOD_ENTITY),
      ]
    : entitiesWithRiley;
  const dialoguesWithRiley = hasRileyDialogue
    ? pkg.dialogue
    : [...pkg.dialogue, structuredClone(RILEY_ARRIVAL_DIALOGUE)];
  const cutscenesWithHouseArrival = pkg.cutscenes.some(
    (cutscene) => cutscene.id === HOUSE_ARRIVAL_CUTSCENE.id,
  )
    ? pkg.cutscenes.map((cutscene) =>
        cutscene.id === HOUSE_ARRIVAL_CUTSCENE.id
          ? structuredClone(HOUSE_ARRIVAL_CUTSCENE)
          : cutscene,
      )
    : [...pkg.cutscenes, structuredClone(HOUSE_ARRIVAL_CUTSCENE)];

  return {
    ...pkg,
    metadata: needsLonelyStreetStartMigration
      ? {
          ...pkg.metadata,
          start_map_id: LONELY_STREET_MAP_ID,
          start_spawn_id: LONELY_STREET_SPAWN_ID,
        }
      : pkg.metadata,
    settings: {
      ...pkg.settings,
      ...(!pkg.settings?.title_music_url && !pkg.settings?.title_music_id
        ? { title_music_url: BUNDLED_TITLE_MUSIC_URL }
        : {}),
      ...(!pkg.settings?.opening_music_url
        ? { opening_music_url: BUNDLED_OPENING_MUSIC_URL }
        : {}),
      music_tracks: {
        ...currentMusicTracks,
        [BUNDLED_OPENING_MUSIC_ID]: BUNDLED_OPENING_MUSIC_URL,
      },
      map_music: {
        ...currentMapMusic,
        ...(!Object.prototype.hasOwnProperty.call(currentMapMusic, LONELY_STREET_MAP_ID) ||
        lonelyStreetMusic === BUNDLED_OPENING_MUSIC_URL
          ? { [LONELY_STREET_MAP_ID]: BUNDLED_OPENING_MUSIC_ID }
          : {}),
      },
      movement_hearing: {
        ...(pkg.settings?.movement_hearing || {}),
        normal_movement_loudness: 6.5,
        stealth_noise_multiplier: 0.1,
      },
    },
    object_library: [
      ...objectLibraryWithStreetFix,
      ...missingLonelyStreetObjects.map((object) => structuredClone(object)),
    ],
    entities: entitiesWithMoonGod,
    dialogue: [
      ...dialoguesWithRiley.filter(
        (dialogue) =>
          !HOUSE_ARRIVAL_DIALOGUE_IDS.has(dialogue.id) &&
          (!shouldProvisionBundledBasementAssets ||
            !BUNDLED_LONELY_STREET_BASEMENT_DIALOGUE_IDS.has(dialogue.id)),
      ),
      // These dialogues are part of the engine-authored arrival scene. Replace
      // stale saved copies together so cutscene actions never point at missing
      // or previous-draft nodes.
      ...HOUSE_ARRIVAL_DIALOGUES.map((dialogue) => structuredClone(dialogue)),
      ...(shouldProvisionBundledBasementAssets
        ? [
            structuredClone(MOON_GOD_DIALOGUE),
            structuredClone(BASEMENT_BEER_DIALOGUE),
            structuredClone(BASEMENT_BEER_LOCKED_HINT_DIALOGUE),
          ]
        : []),
    ],
    cutscenes: [
      ...cutscenesWithHouseArrival.filter(
        (cutscene) =>
          !shouldProvisionBundledBasementAssets ||
          !BUNDLED_LONELY_STREET_BASEMENT_CUTSCENE_IDS.has(cutscene.id),
      ),
      ...(shouldProvisionBundledBasementAssets
        ? [
            structuredClone(BASEMENT_ENTRY_SILENCE_CUTSCENE),
            structuredClone(MOON_GOD_VANISH_CUTSCENE),
            structuredClone(BASEMENT_BEER_CUTSCENE),
            structuredClone(BASEMENT_BEER_LOCKED_HINT_CUTSCENE),
          ]
        : []),
    ],
    items: shouldProvisionBundledBasementAssets
      ? [
          ...pkg.items.filter((item) => item.id !== BASEMENT_BEER_ITEM_ID),
          structuredClone(BASEMENT_BEER_ITEM),
        ]
      : pkg.items,
    switches: shouldProvisionBundledBasementAssets
      ? {
          [BASEMENT_BEER_ACQUIRED_SWITCH_ID]: false,
          [MOON_GOD_ENCOUNTERED_SWITCH_ID]: false,
          ...pkg.switches,
        }
      : pkg.switches,
    maps: [
      ...(hasLonelyStreetMap
        ? upgradedMaps
        : [...upgradedMaps, structuredClone(LONELY_STREET_MAP)]),
      ...(hasLonelyStreetInteriorMap
        ? []
        : [
            structuredClone(
              shouldAppendHouseWithoutBasementLink
                ? withoutBundledHouseBasementLink(
                    LONELY_STREET_HOUSE_INTERIOR_MAP,
                  )
                : LONELY_STREET_HOUSE_INTERIOR_MAP,
            ),
          ]),
      ...(shouldInstallBundledBasement
        ? [structuredClone(LONELY_STREET_BASEMENT_MAP)]
        : []),
    ],
  };
};

export const serializePackageForExport = (pkg: GamePackage): string => {
  const result = GamePackageSchema.safeParse(pkg);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map(formatPackageIssue)
      .join("; ");
    throw new Error(`Current package is not exportable: ${issues}`);
  }
  assertStudioRuntimeSupport(result.data);
  return JSON.stringify(migrateGamePackageV1ToV2(result.data), null, 2);
};

const canUseIndexedDb = () =>
  typeof window !== "undefined" && "indexedDB" in window;

const openPackageDb = (databaseName = ENGINE_PACKAGE_DB) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = window.indexedDB.open(databaseName, 1);
    let settled = false;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(error);
    };
    const timeout = window.setTimeout(
      () =>
        finishReject(
          new Error(`Timed out opening engine package storage (${databaseName}).`),
        ),
      2500,
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENGINE_PACKAGE_STORE)) {
        db.createObjectStore(ENGINE_PACKAGE_STORE);
      }
    };
    request.onerror = () =>
      finishReject(
        request.error || new Error("Could not open engine package storage."),
      );
    request.onblocked = () =>
      finishReject(
        new Error(`Engine package storage is blocked (${databaseName}).`),
      );
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve(request.result);
    };
  });

const readPersistedEngineStateFromDb = async (
  databaseName: string,
): Promise<PersistedEngineState | null> => {
  if (!canUseIndexedDb()) return null;
  try {
    const db = await openPackageDb(databaseName);
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(ENGINE_PACKAGE_STORE, "readonly");
      const store = transaction.objectStore(ENGINE_PACKAGE_STORE);
      const request = store.get(ENGINE_PACKAGE_KEY);
      request.onerror = () =>
        reject(
          request.error || new Error("Could not read engine package storage."),
        );
      request.onsuccess = () => {
        const value = request.result as RawPersistedEngineState | undefined;
        if (value?.schema !== "crpg_engine_persisted_state_v1") {
          resolve(null);
          return;
        }
        let gamePackage: GamePackage;
        try {
          gamePackage = refreshBundledEnginePackage(
            normalizePackageImportPayload(value.gamePackage),
          );
        } catch {
          resolve(null);
          return;
        }
        resolve({
          schema: "crpg_engine_persisted_state_v1",
          gamePackage,
          selectedMapId:
            typeof value.selectedMapId === "string"
              ? value.selectedMapId
              : null,
          mode: isEditorMode(value.mode) ? value.mode : "home",
          savedAt:
            typeof value.savedAt === "string"
              ? value.savedAt
              : new Date().toISOString(),
        });
      };
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    });
  } catch (error) {
    console.warn("Could not load persisted engine package.", error);
    return null;
  }
};

const readPersistedEngineState =
  async (): Promise<PersistedEngineState | null> => {
    const current = await readPersistedEngineStateFromDb(ENGINE_PACKAGE_DB);
    if (current) return current;
    for (const databaseName of LEGACY_ENGINE_PACKAGE_DBS) {
      const legacy = await readPersistedEngineStateFromDb(databaseName);
      if (legacy) return legacy;
    }
    return null;
  };

const writePersistedEngineState = async (
  state: PersistedEngineStorageState,
) => {
  if (!canUseIndexedDb()) return;
  const db = await openPackageDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ENGINE_PACKAGE_STORE, "readwrite");
    const store = transaction.objectStore(ENGINE_PACKAGE_STORE);
    const request = store.put(state, ENGINE_PACKAGE_KEY);
    request.onerror = () =>
      reject(
        request.error || new Error("Could not save engine package storage."),
      );
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ||
          new Error("Could not complete engine package storage write."),
      );
    };
  });
};

let packageStorageHydrated = typeof window === "undefined";
let packageStorageMutatedBeforeHydration = false;
let packageStorageTimer: number | undefined;

export const useEngineStore = create<EditorState>((set, get) => ({
  storageHydrated: packageStorageHydrated,
  mode: "home",
  setMode: (mode) => set({ mode }),

  gamePackage: createDefaultEnginePackage(),
  setGamePackage: (pkg) =>
    set((state) => ({
      undoStack: [...state.undoStack, state.gamePackage].slice(-50),
      redoStack: [],
      gamePackage: normalizeImportedPackage(pkg).package,
      selectedAnimationClipId: null,
    })),

  undoStack: [],
  redoStack: [],
  pushHistory: () =>
    set((state) => ({
      undoStack: [...state.undoStack, state.gamePackage].slice(-50),
      redoStack: [],
    })),
  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        gamePackage: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [state.gamePackage, ...state.redoStack].slice(0, 50),
      };
    }),
  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[0];
      return {
        gamePackage: next,
        undoStack: [...state.undoStack, state.gamePackage].slice(-50),
        redoStack: state.redoStack.slice(1),
      };
    }),

  selectedMapId: null,
  setSelectedMapId: (id) => set({ selectedMapId: id }),

  selectedObjectId: null,
  setSelectedObjectId: (id) =>
    set((state) => ({
      selectedObjectId: id,
      selectedAnimationClipId:
        id === state.selectedObjectId ? state.selectedAnimationClipId : null,
    })),

  selectedAnimationClipId: null,
  setSelectedAnimationClipId: (id) => set({ selectedAnimationClipId: id }),

  selectedSpriteId: null,
  setSelectedSpriteId: (id) => set({ selectedSpriteId: id }),

  selectedDialogueId: null,
  setSelectedDialogueId: (id) => set({ selectedDialogueId: id }),

  selectedQuestId: null,
  setSelectedQuestId: (id) => set({ selectedQuestId: id }),

  selectedEntityId: null,
  setSelectedEntityId: (id) => set({ selectedEntityId: id }),

  selectedItemId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  selectedDocumentId: null,
  setSelectedDocumentId: (id) => set({ selectedDocumentId: id }),
  selectedShopId: null,
  setSelectedShopId: (id) => set({ selectedShopId: id }),
  selectedSkillId: null,
  setSelectedSkillId: (id) => set({ selectedSkillId: id }),

  exportPackage: () => {
    return serializePackageForExport(get().gamePackage);
  },
  importPackage: (jsonString) => {
    const previous = get().gamePackage;
    const trimmed = jsonString.trim();
    if (!trimmed) {
      return {
        ok: false,
        message: "Import failed: no JSON was provided.",
        issues: ["The import payload is empty."],
      };
    }

    try {
      const parsed = JSON.parse(trimmed);
      const migration = normalizePackageImportPayloadWithReport(parsed);
      if (migration.requiresConfirmation) {
        return {
          ok: false,
          message:
            "Import was not applied because it contains destructive migration changes.",
          issues: migration.destructiveChanges.map((change) => change.message),
        };
      }
      const imported = migration.package;
      assertStudioRuntimeSupport(imported);
      // Runtime saves belong to the previously loaded project. Package version
      // strings are not globally unique, so retaining the run across import can
      // apply stale deltas to an unrelated package with overlapping map IDs.
      usePlayStore.getState().resetRun();
      set((state) => ({
        undoStack: [...state.undoStack, previous].slice(-50),
        redoStack: [],
        gamePackage: imported,
        selectedMapId: pickSelectedMapId(imported, state.selectedMapId),
        selectedObjectId: keepExistingId(
          imported.object_library,
          state.selectedObjectId,
        ),
        selectedAnimationClipId: null,
        selectedSpriteId: keepExistingId(
          imported.sprite_library,
          state.selectedSpriteId,
        ),
        selectedDialogueId: keepExistingId(
          imported.dialogue,
          state.selectedDialogueId,
        ),
        selectedQuestId: keepExistingId(imported.quests, state.selectedQuestId),
        selectedEntityId: keepExistingId(
          imported.entities,
          state.selectedEntityId,
        ),
        selectedItemId: keepExistingId(imported.items, state.selectedItemId),
        selectedDocumentId: keepExistingId(
          imported.documents,
          state.selectedDocumentId,
        ),
        selectedShopId: keepExistingId(
          imported.shops || [],
          state.selectedShopId,
        ),
        selectedSkillId: keepExistingId(
          imported.abilities || [],
          state.selectedSkillId,
        ),
      }));
      return {
        ok: true,
        message: `Imported ${imported.metadata.title} (${imported.maps.length} maps, ${imported.object_library.length} objects).`,
        imported,
        migration,
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof SyntaxError
            ? "Import failed: invalid JSON."
            : "Import failed: unsupported package schema.",
        issues: [
          err instanceof Error
            ? err.message
            : "The file could not be parsed as a supported package.",
        ],
      };
    }
  },
  installQaSuite: (options) => {
    const previous = get().gamePackage;
    const migration = applyQaSuiteInstall(previous, options);
    if (!migration.applied) return migration;
    const installed = migration.package;
    if (options.mode === "replace") usePlayStore.getState().resetRun();
    set((state) => ({
      undoStack: [...state.undoStack, previous].slice(-50),
      redoStack: [],
      gamePackage: installed,
      selectedMapId: pickSelectedMapId(installed, state.selectedMapId),
      selectedObjectId: keepExistingId(
        installed.object_library,
        state.selectedObjectId,
      ),
      selectedAnimationClipId: null,
      selectedSpriteId: keepExistingId(
        installed.sprite_library,
        state.selectedSpriteId,
      ),
      selectedDialogueId: keepExistingId(
        installed.dialogue,
        state.selectedDialogueId,
      ),
      selectedQuestId: keepExistingId(installed.quests, state.selectedQuestId),
      selectedEntityId: keepExistingId(
        installed.entities,
        state.selectedEntityId,
      ),
      selectedItemId: keepExistingId(installed.items, state.selectedItemId),
      selectedDocumentId: keepExistingId(
        installed.documents,
        state.selectedDocumentId,
      ),
      selectedShopId: keepExistingId(installed.shops, state.selectedShopId),
      selectedSkillId: keepExistingId(
        installed.abilities,
        state.selectedSkillId,
      ),
    }));
    return migration;
  },
  commitDungeonBake: (result) => {
    if (!result.applied || result.bakedMapIds.length === 0) return false;
    const bakedPackage = GamePackageSchema.parse(result.package);
    assertStudioRuntimeSupport(bakedPackage);
    const firstMapId = result.bakedMapIds[0];
    if (!bakedPackage.maps.some((map) => map.id === firstMapId)) {
      throw new Error(
        `Dungeon bake did not contain its declared first map: ${firstMapId}`,
      );
    }
    set((state) => ({
      undoStack: [...state.undoStack, state.gamePackage].slice(-50),
      redoStack: [],
      gamePackage: bakedPackage,
      selectedMapId: firstMapId,
      mode: "map_editor",
    }));
    return true;
  },
  updateMap: (mapId, updates) => {
    get().pushHistory();
    // Map IDs are package identity and save-delta keys. Renaming requires an
    // explicit reference-remap operation; ordinary edits may never mutate it.
    const { id: _requestedId, ...safeUpdates } = updates;
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        maps: state.gamePackage.maps.map((map) =>
          map.id === mapId
            ? markMapManuallyModified({ ...map, ...safeUpdates, id: map.id })
            : map,
        ),
      },
    }));
  },
  addMap: (mapData) => {
    if (get().gamePackage.maps.some((map) => map.id === mapData.id)) {
      throw new Error(`A map with ID ${mapData.id} already exists.`);
    }
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        maps: [...state.gamePackage.maps, mapData],
      },
    }));
  },
  deleteMap: (mapId) => {
    const current = get();
    if (current.gamePackage.maps.length <= 1) return false;
    if (current.gamePackage.metadata.start_map_id === mapId) return false;
    if (!current.gamePackage.maps.some((map) => map.id === mapId)) return false;

    current.pushHistory();
    set((state) => {
      const remainingMaps = state.gamePackage.maps
        .filter((map) => map.id !== mapId)
        .map((map) => ({
          ...map,
          exits: map.exits.filter((exit) => exit.target_map_id !== mapId),
        }));
      const mapMusic = {
        ...((state.gamePackage.settings?.map_music || {}) as Record<
          string,
          string
        >),
      };
      delete mapMusic[mapId];
      return {
        gamePackage: {
          ...state.gamePackage,
          maps: remainingMaps,
          settings: {
            ...state.gamePackage.settings,
            map_music: mapMusic,
          },
        },
        selectedMapId: pickSelectedMapId(
          { ...state.gamePackage, maps: remainingMaps },
          state.selectedMapId === mapId ? null : state.selectedMapId,
        ),
      };
    });
    return true;
  },
  addObject: (objData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        object_library: [...state.gamePackage.object_library, objData],
      },
    }));
  },
  updateObject: (objId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        object_library: state.gamePackage.object_library.map((o) =>
          o.id === objId ? { ...o, ...updates } : o,
        ),
      },
    }));
  },
  replaceObject: (objData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        object_library: state.gamePackage.object_library.map((o) =>
          o.id === objData.id ? objData : o,
        ),
      },
    }));
  },
  addSprite: (spriteData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        sprite_library: [...state.gamePackage.sprite_library, spriteData],
      },
    }));
  },
  updateSprite: (spriteId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        sprite_library: state.gamePackage.sprite_library.map((s) =>
          s.id === spriteId ? { ...s, ...updates } : s,
        ),
      },
    }));
  },
  updateSettings: (updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        settings: { ...state.gamePackage.settings, ...updates },
      },
    }));
  },
  addDialogue: (dialogueData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        dialogue: [...state.gamePackage.dialogue, dialogueData],
      },
    }));
  },
  updateDialogue: (dialogueId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        dialogue: state.gamePackage.dialogue.map((d) =>
          d.id === dialogueId ? { ...d, ...updates } : d,
        ),
      },
    }));
  },
  addQuest: (questData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        quests: [...state.gamePackage.quests, questData],
      },
    }));
  },
  updateQuest: (questId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        quests: state.gamePackage.quests.map((q) =>
          q.id === questId ? { ...q, ...updates } : q,
        ),
      },
    }));
  },
  addEntity: (entityData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        entities: [...state.gamePackage.entities, entityData],
      },
    }));
  },
  updateEntity: (entityId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        entities: state.gamePackage.entities.map((e) =>
          e.id === entityId ? { ...e, ...updates } : e,
        ),
      },
    }));
  },
  deleteEntity: (entityId) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        entities: state.gamePackage.entities.filter((e) => e.id !== entityId),
        // Remove the entity's map placements so no map points at a ghost.
        maps: state.gamePackage.maps.map((map) => ({
          ...map,
          entity_placements: (map.entity_placements || []).filter(
            (p) => p.entity_id !== entityId,
          ),
        })),
      },
    }));
  },
  addItem: (itemData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        items: [...state.gamePackage.items, itemData],
      },
    }));
  },
  updateItem: (itemId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        items: state.gamePackage.items.map((i) =>
          i.id === itemId ? { ...i, ...updates } : i,
        ),
      },
    }));
  },
  addDocument: (docData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        documents: [...(state.gamePackage.documents || []), docData],
      },
    }));
  },
  updateDocument: (docId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        documents: (state.gamePackage.documents || []).map((d) =>
          d.id === docId ? { ...d, ...updates } : d,
        ),
      },
    }));
  },
  addShop: (shopData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        shops: [...(state.gamePackage.shops || []), shopData],
      },
    }));
  },
  updateShop: (shopId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        shops: (state.gamePackage.shops || []).map((s) =>
          s.id === shopId ? { ...s, ...updates } : s,
        ),
      },
    }));
  },
  addSkill: (skillData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        abilities: [...(state.gamePackage.abilities || []), skillData],
      },
    }));
  },
  updateSkill: (skillId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        abilities: (state.gamePackage.abilities || []).map((a) =>
          a.id === skillId ? { ...a, ...updates } : a,
        ),
      },
    }));
  },
}));

export const persistEngineWorkspaceNow = async () => {
  if (typeof window === "undefined") return;
  if (packageStorageTimer !== undefined) {
    window.clearTimeout(packageStorageTimer);
    packageStorageTimer = undefined;
  }
  const state = useEngineStore.getState();
  await writePersistedEngineState({
    schema: "crpg_engine_persisted_state_v1",
    gamePackage: migrateGamePackageV1ToV2(state.gamePackage),
    selectedMapId: state.selectedMapId,
    mode: state.mode,
    savedAt: new Date().toISOString(),
  });
};

if (typeof window !== "undefined") {
  const schedulePersist = (state: EditorState) => {
    if (!packageStorageHydrated) return;
    if (packageStorageTimer !== undefined)
      window.clearTimeout(packageStorageTimer);
    packageStorageTimer = window.setTimeout(() => {
      packageStorageTimer = undefined;
      writePersistedEngineState({
        schema: "crpg_engine_persisted_state_v1",
        gamePackage: migrateGamePackageV1ToV2(state.gamePackage),
        selectedMapId: state.selectedMapId,
        mode: state.mode,
        savedAt: new Date().toISOString(),
      }).catch((error) => {
        console.warn("Could not persist engine package.", error);
      });
    }, 500);
  };

  useEngineStore.subscribe((state, previousState) => {
    if (
      state.gamePackage !== previousState.gamePackage ||
      state.selectedMapId !== previousState.selectedMapId ||
      state.mode !== previousState.mode
    ) {
      if (!packageStorageHydrated) packageStorageMutatedBeforeHydration = true;
      schedulePersist(state);
    }
  });

  readPersistedEngineState().then((persisted) => {
    const preserveCurrentWorkspace = packageStorageMutatedBeforeHydration;
    packageStorageHydrated = true;
    // AppShell blocks normal editing while storage loads. This second guard
    // also protects programmatic imports or edits made during that window:
    // stale IndexedDB state may never overwrite a newer in-memory mutation.
    if (!persisted || preserveCurrentWorkspace) {
      useEngineStore.setState({ storageHydrated: true });
      schedulePersist(useEngineStore.getState());
      return;
    }
    const restoredPackage = restoreStandardDialogueTrees(persisted.gamePackage);
    useEngineStore.setState((state) => ({
      gamePackage: restoredPackage,
      selectedMapId: pickSelectedMapId(
        restoredPackage,
        persisted.selectedMapId || state.selectedMapId,
      ),
      selectedObjectId: keepExistingId(
        restoredPackage.object_library,
        state.selectedObjectId,
      ),
      selectedAnimationClipId: null,
      selectedSpriteId: keepExistingId(
        restoredPackage.sprite_library,
        state.selectedSpriteId,
      ),
      selectedDialogueId: keepExistingId(
        restoredPackage.dialogue,
        state.selectedDialogueId,
      ),
      selectedQuestId: keepExistingId(
        restoredPackage.quests,
        state.selectedQuestId,
      ),
      selectedEntityId: keepExistingId(
        restoredPackage.entities,
        state.selectedEntityId,
      ),
      selectedItemId: keepExistingId(
        restoredPackage.items,
        state.selectedItemId,
      ),
      selectedDocumentId: keepExistingId(
        restoredPackage.documents,
        state.selectedDocumentId,
      ),
      selectedShopId: keepExistingId(
        restoredPackage.shops || [],
        state.selectedShopId,
      ),
      selectedSkillId: keepExistingId(
        restoredPackage.abilities || [],
        state.selectedSkillId,
      ),
      mode: persisted.mode === "play" ? "map_editor" : persisted.mode,
      storageHydrated: true,
    }));
  });
}
