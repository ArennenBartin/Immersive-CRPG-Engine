import { create } from "zustand";
import {
  GamePackage,
  GamePackageSchema,
  MapData,
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
  addObject: (objData: any) => void;
  updateObject: (objId: string, updates: any) => void;
  replaceObject: (objData: any) => void;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
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

const formatPackageIssue = (issue: { path: PropertyKey[]; message: string }) => {
  const path = issue.path.length ? issue.path.map(String).join(".") : "package";
  return `${path}: ${issue.message}`;
};

const keepExistingId = <T extends { id: string }>(items: T[], currentId: string | null) =>
  currentId && items.some((item) => item.id === currentId) ? currentId : null;

const pickSelectedMapId = (pkg: GamePackage, currentId: string | null) => {
  if (currentId && pkg.maps.some((map) => map.id === currentId)) return currentId;
  if (pkg.maps.some((map) => map.id === pkg.metadata.start_map_id)) return pkg.metadata.start_map_id;
  return pkg.maps[0]?.id || null;
};

const normalizeImportedPackage = (pkg: GamePackage): PackageMigrationResult => {
  const warnings: MigrationWarning[] = [];
  const changes: MigrationChange[] = [];
  const startMap = pkg.maps.find((map) => map.id === pkg.metadata.start_map_id);
  if (startMap) {
    if (!startMap.spawns.some((spawn) => spawn.id === pkg.metadata.start_spawn_id)) {
      warnings.push({
        code: "invalid_start_spawn",
        path: "metadata",
        message: `Start spawn ${pkg.metadata.start_spawn_id} does not exist on ${startMap.id}; package content was preserved unchanged.`,
      });
    }
  } else if (pkg.maps.length) {
    warnings.push({
      code: "invalid_start_map",
      path: "metadata.start_map_id",
      message: `Start map ${pkg.metadata.start_map_id} does not exist; package content was preserved unchanged.`,
    });
  } else {
    warnings.push({
      code: "package_has_no_maps",
      path: "maps",
      message: "The package has no maps; its start location could not be validated.",
    });
  }

  // Schema parsing above may fill defaults for fields declared by Zod. Beyond
  // that, ordinary import is deliberately observational: it reports bad
  // references but never refreshes art, rewrites maps, or repairs metadata.
  const result = finalizePackageMigration(pkg, pkg, { warnings, changes });
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

/** The repository-owned workspace every fresh browser profile starts from. */
export const createDefaultEnginePackage = (): GamePackage =>
  normalizeImportedPackage(createQaSuitePackage()).package;

/**
 * Persisted browser workspaces are authored projects, even when they began as
 * the bundled QA suite. Hydration must therefore be observational and may not
 * refresh content by recognizing map IDs or package versions. Users can merge
 * or explicitly replace QA content through the guarded Studio actions.
 */
export const refreshBundledEnginePackage = (pkg: GamePackage): GamePackage =>
  pkg;

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

const canUseIndexedDb = () => typeof window !== "undefined" && "indexedDB" in window;

const openPackageDb = (databaseName = ENGINE_PACKAGE_DB) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENGINE_PACKAGE_STORE)) {
        db.createObjectStore(ENGINE_PACKAGE_STORE);
      }
    };
    request.onerror = () => reject(request.error || new Error("Could not open engine package storage."));
    request.onsuccess = () => resolve(request.result);
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
      request.onerror = () => reject(request.error || new Error("Could not read engine package storage."));
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
          selectedMapId: typeof value.selectedMapId === "string" ? value.selectedMapId : null,
          mode: isEditorMode(value.mode) ? value.mode : "home",
          savedAt: typeof value.savedAt === "string" ? value.savedAt : new Date().toISOString(),
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

const readPersistedEngineState = async (): Promise<PersistedEngineState | null> => {
  const current = await readPersistedEngineStateFromDb(ENGINE_PACKAGE_DB);
  if (current) return current;
  for (const databaseName of LEGACY_ENGINE_PACKAGE_DBS) {
    const legacy = await readPersistedEngineStateFromDb(databaseName);
    if (legacy) return legacy;
  }
  return null;
};

const writePersistedEngineState = async (state: PersistedEngineStorageState) => {
  if (!canUseIndexedDb()) return;
  const db = await openPackageDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ENGINE_PACKAGE_STORE, "readwrite");
    const store = transaction.objectStore(ENGINE_PACKAGE_STORE);
    const request = store.put(state, ENGINE_PACKAGE_KEY);
    request.onerror = () => reject(request.error || new Error("Could not save engine package storage."));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Could not complete engine package storage write."));
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
  setGamePackage: (pkg) => set((state) => ({ 
    undoStack: [...state.undoStack, state.gamePackage].slice(-50),
    redoStack: [],
    gamePackage: normalizeImportedPackage(pkg).package,
  })),

  undoStack: [],
  redoStack: [],
  pushHistory: () => set((state) => ({
    undoStack: [...state.undoStack, state.gamePackage].slice(-50),
    redoStack: []
  })),
  undo: () => set((state) => {
    if (state.undoStack.length === 0) return state;
    const previous = state.undoStack[state.undoStack.length - 1];
    return {
      gamePackage: previous,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [state.gamePackage, ...state.redoStack].slice(0, 50)
    };
  }),
  redo: () => set((state) => {
    if (state.redoStack.length === 0) return state;
    const next = state.redoStack[0];
    return {
      gamePackage: next,
      undoStack: [...state.undoStack, state.gamePackage].slice(-50),
      redoStack: state.redoStack.slice(1)
    };
  }),

  selectedMapId: null,
  setSelectedMapId: (id) => set({ selectedMapId: id }),

  selectedObjectId: null,
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),

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
          message: "Import was not applied because it contains destructive migration changes.",
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
        selectedObjectId: keepExistingId(imported.object_library, state.selectedObjectId),
        selectedSpriteId: keepExistingId(imported.sprite_library, state.selectedSpriteId),
        selectedDialogueId: keepExistingId(imported.dialogue, state.selectedDialogueId),
        selectedQuestId: keepExistingId(imported.quests, state.selectedQuestId),
        selectedEntityId: keepExistingId(imported.entities, state.selectedEntityId),
        selectedItemId: keepExistingId(imported.items, state.selectedItemId),
        selectedDocumentId: keepExistingId(imported.documents, state.selectedDocumentId),
        selectedShopId: keepExistingId(imported.shops || [], state.selectedShopId),
        selectedSkillId: keepExistingId(imported.abilities || [], state.selectedSkillId),
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
        message: err instanceof SyntaxError ? "Import failed: invalid JSON." : "Import failed: unsupported package schema.",
        issues: [err instanceof Error ? err.message : "The file could not be parsed as a supported package."],
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
      selectedObjectId: keepExistingId(installed.object_library, state.selectedObjectId),
      selectedSpriteId: keepExistingId(installed.sprite_library, state.selectedSpriteId),
      selectedDialogueId: keepExistingId(installed.dialogue, state.selectedDialogueId),
      selectedQuestId: keepExistingId(installed.quests, state.selectedQuestId),
      selectedEntityId: keepExistingId(installed.entities, state.selectedEntityId),
      selectedItemId: keepExistingId(installed.items, state.selectedItemId),
      selectedDocumentId: keepExistingId(installed.documents, state.selectedDocumentId),
      selectedShopId: keepExistingId(installed.shops, state.selectedShopId),
      selectedSkillId: keepExistingId(installed.abilities, state.selectedSkillId),
    }));
    return migration;
  },
  commitDungeonBake: (result) => {
    if (!result.applied || result.bakedMapIds.length === 0) return false;
    const bakedPackage = GamePackageSchema.parse(result.package);
    assertStudioRuntimeSupport(bakedPackage);
    const firstMapId = result.bakedMapIds[0];
    if (!bakedPackage.maps.some((map) => map.id === firstMapId)) {
      throw new Error(`Dungeon bake did not contain its declared first map: ${firstMapId}`);
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
        )
      }
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
        maps: [...state.gamePackage.maps, mapData]
      }
    }));
  },
  addObject: (objData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        object_library: [...state.gamePackage.object_library, objData]
      }
    }));
  },
  updateObject: (objId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        object_library: state.gamePackage.object_library.map(o => o.id === objId ? { ...o, ...updates } : o)
      }
    }));
  },
  replaceObject: (objData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        object_library: state.gamePackage.object_library.map(o => o.id === objData.id ? objData : o)
      }
    }));
  },
  addSprite: (spriteData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        sprite_library: [...state.gamePackage.sprite_library, spriteData]
      }
    }));
  },
  updateSprite: (spriteId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        sprite_library: state.gamePackage.sprite_library.map(s => s.id === spriteId ? { ...s, ...updates } : s)
      }
    }));
  },
  updateSettings: (updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        settings: { ...state.gamePackage.settings, ...updates }
      }
    }));
  },
  addDialogue: (dialogueData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        dialogue: [...state.gamePackage.dialogue, dialogueData]
      }
    }));
  },
  updateDialogue: (dialogueId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        dialogue: state.gamePackage.dialogue.map(d => d.id === dialogueId ? { ...d, ...updates } : d)
      }
    }));
  },
  addQuest: (questData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        quests: [...state.gamePackage.quests, questData]
      }
    }));
  },
  updateQuest: (questId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        quests: state.gamePackage.quests.map(q => q.id === questId ? { ...q, ...updates } : q)
      }
    }));
  },
  addEntity: (entityData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        entities: [...state.gamePackage.entities, entityData]
      }
    }));
  },
  updateEntity: (entityId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        entities: state.gamePackage.entities.map(e => e.id === entityId ? { ...e, ...updates } : e)
      }
    }));
  },
  deleteEntity: (entityId) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        entities: state.gamePackage.entities.filter(e => e.id !== entityId),
        // Remove the entity's map placements so no map points at a ghost.
        maps: state.gamePackage.maps.map(map => ({
          ...map,
          entity_placements: (map.entity_placements || []).filter(p => p.entity_id !== entityId),
        })),
      }
    }));
  },
  addItem: (itemData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        items: [...state.gamePackage.items, itemData]
      }
    }));
  },
  updateItem: (itemId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        items: state.gamePackage.items.map(i => i.id === itemId ? { ...i, ...updates } : i)
      }
    }));
  },
  addDocument: (docData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        documents: [...(state.gamePackage.documents || []), docData]
      }
    }));
  },
  updateDocument: (docId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        documents: (state.gamePackage.documents || []).map(d => d.id === docId ? { ...d, ...updates } : d)
      }
    }));
  },
  addShop: (shopData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        shops: [...(state.gamePackage.shops || []), shopData]
      }
    }));
  },
  updateShop: (shopId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        shops: (state.gamePackage.shops || []).map(s => s.id === shopId ? { ...s, ...updates } : s)
      }
    }));
  },
  addSkill: (skillData) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        abilities: [...(state.gamePackage.abilities || []), skillData]
      }
    }));
  },
  updateSkill: (skillId, updates) => {
    get().pushHistory();
    set((state) => ({
      gamePackage: {
        ...state.gamePackage,
        abilities: (state.gamePackage.abilities || []).map(a => a.id === skillId ? { ...a, ...updates } : a)
      }
    }));
  }
}));

if (typeof window !== "undefined") {
  const schedulePersist = (state: EditorState) => {
    if (!packageStorageHydrated) return;
    if (packageStorageTimer !== undefined) window.clearTimeout(packageStorageTimer);
    packageStorageTimer = window.setTimeout(() => {
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
    useEngineStore.setState((state) => ({
      gamePackage: persisted.gamePackage,
      selectedMapId: pickSelectedMapId(persisted.gamePackage, persisted.selectedMapId || state.selectedMapId),
      selectedObjectId: keepExistingId(persisted.gamePackage.object_library, state.selectedObjectId),
      selectedSpriteId: keepExistingId(persisted.gamePackage.sprite_library, state.selectedSpriteId),
      selectedDialogueId: keepExistingId(persisted.gamePackage.dialogue, state.selectedDialogueId),
      selectedQuestId: keepExistingId(persisted.gamePackage.quests, state.selectedQuestId),
      selectedEntityId: keepExistingId(persisted.gamePackage.entities, state.selectedEntityId),
      selectedItemId: keepExistingId(persisted.gamePackage.items, state.selectedItemId),
      selectedDocumentId: keepExistingId(persisted.gamePackage.documents, state.selectedDocumentId),
      selectedShopId: keepExistingId(persisted.gamePackage.shops || [], state.selectedShopId),
      selectedSkillId: keepExistingId(persisted.gamePackage.abilities || [], state.selectedSkillId),
      mode:
        persisted.mode === "play"
          ? "map_editor"
          : persisted.mode,
      storageHydrated: true,
    }));
  });
}
