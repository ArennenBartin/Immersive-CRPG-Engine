import {
  createEmptyGamePackage,
  type GamePackage,
} from "../schema/game";
import {
  finalizePackageMigration,
  type MigrationWarning,
  type PackageMigrationResult,
} from "../store/packageMigration";
import { withTestingMapSuite } from "./testingMapSuite";
import { migrateLegacyDialoguePackage } from "../engine-core/keywordDialogue";

export type QaSuiteInstallMode = "empty" | "merge" | "replace";

export interface QaSuiteInstallOptions {
  mode: QaSuiteInstallMode;
  /** Required only for replace mode. */
  confirmDestructive?: boolean;
  /** Test hook; callers normally omit this. */
  now?: Date;
}

/** Builds the canonical QA package without consulting or mutating the Studio workspace. */
export const createQaSuitePackage = (): GamePackage =>
  migrateLegacyDialoguePackage(withTestingMapSuite(createEmptyGamePackage())).package;

const appendMissingById = <T extends { id: string }>(current: T[], additions: T[]): T[] => {
  const currentIds = new Set(current.map((entry) => entry.id));
  const missing = additions.filter((entry) => !currentIds.has(entry.id));
  return missing.length ? [...current, ...missing] : current;
};

const differingCollisionIds = <T extends { id: string }>(current: T[], additions: T[]) => {
  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  return additions
    .filter((entry) => {
      const existing = currentById.get(entry.id);
      return existing !== undefined && JSON.stringify(existing) !== JSON.stringify(entry);
    })
    .map((entry) => entry.id);
};

type IdCollection = { label: string; current: Array<{ id: string }>; qa: Array<{ id: string }> };

/**
 * Installs the complete suite only when the target has no maps. A non-empty
 * target is deliberately left unchanged and must be retried with merge or
 * replace semantics.
 */
export const installQaSuiteIntoEmptyPackage = (
  source: GamePackage,
): PackageMigrationResult => {
  const candidate = migrateLegacyDialoguePackage(withTestingMapSuite(source)).package;
  if (source.maps.length) {
    return finalizePackageMigration(source, candidate, {
      warnings: [
        {
          code: "qa_suite_target_not_empty",
          path: "maps",
          message: "QA installation in empty mode was refused. Choose merge or replace for a package that already contains maps.",
        },
      ],
      changes: [
        {
          code: "qa_suite_install_proposed",
          message: "Install the canonical QA suite as the active package.",
        },
      ],
    });
  }

  return finalizePackageMigration(source, candidate, {
    changes: [
      {
        code: "qa_suite_installed_into_empty_package",
        path: "maps",
        message: `Installed ${candidate.maps.length} canonical QA maps into an empty package.`,
        affectedIds: candidate.maps.map((map) => map.id),
      },
    ],
  });
};

/**
 * Adds missing QA content while preserving every existing item on ID
 * collisions. Studio metadata, start location, and existing settings win.
 */
export const mergeQaSuiteIntoPackage = (source: GamePackage): PackageMigrationResult => {
  const qa = createQaSuitePackage();
  const collections: IdCollection[] = [
    { label: "map", current: source.maps, qa: qa.maps },
    { label: "object", current: source.object_library, qa: qa.object_library },
    { label: "sprite", current: source.sprite_library, qa: qa.sprite_library },
    { label: "entity", current: source.entities, qa: qa.entities },
    { label: "keyword", current: source.keywords, qa: qa.keywords },
    { label: "dynamic topic", current: source.dynamic_topics, qa: qa.dynamic_topics },
    { label: "dialogue", current: source.dialogue, qa: qa.dialogue },
    { label: "document", current: source.documents, qa: qa.documents },
    { label: "quest", current: source.quests, qa: qa.quests },
    { label: "cutscene", current: source.cutscenes, qa: qa.cutscenes },
    { label: "item", current: source.items, qa: qa.items },
    { label: "ability", current: source.abilities, qa: qa.abilities },
    { label: "encounter", current: source.encounters, qa: qa.encounters },
    { label: "shop", current: source.shops, qa: qa.shops },
    { label: "faction", current: source.factions as Array<{ id: string }>, qa: qa.factions as Array<{ id: string }> },
    { label: "ending", current: source.endings as Array<{ id: string }>, qa: qa.endings as Array<{ id: string }> },
    { label: "bark", current: source.barks, qa: qa.barks },
    { label: "object blueprint", current: source.object_blueprints, qa: qa.object_blueprints },
    { label: "simulation material", current: source.simulation_materials, qa: qa.simulation_materials },
    { label: "simulation process", current: source.simulation_processes, qa: qa.simulation_processes },
    { label: "simulation workstation", current: source.simulation_workstations, qa: qa.simulation_workstations },
  ];
  const warnings: MigrationWarning[] = collections.flatMap(({ label, current, qa: additions }) => {
    const collisions = differingCollisionIds(current, additions);
    return collisions.length
      ? [{
          code: "qa_suite_id_collision",
          message: `Preserved ${collisions.length} existing ${label} entr${collisions.length === 1 ? "y" : "ies"} whose IDs collide with QA content.`,
          path: label === "map" ? "maps" : undefined,
        }]
      : [];
  });
  const addedMapIds = qa.maps
    .filter((map) => !source.maps.some((existing) => existing.id === map.id))
    .map((map) => map.id);
  const initialSkills = [
    ...new Set([
      ...(source.settings.initial_known_skills || []),
      ...(qa.settings.initial_known_skills || []),
    ]),
  ];
  const candidate: GamePackage = {
    ...source,
    settings: {
      ...source.settings,
      initial_known_skills: initialSkills,
    },
    maps: appendMissingById(source.maps, qa.maps),
    object_library: appendMissingById(source.object_library, qa.object_library),
    sprite_library: appendMissingById(source.sprite_library, qa.sprite_library),
    entities: appendMissingById(source.entities, qa.entities),
    keywords: appendMissingById(source.keywords, qa.keywords),
    dynamic_topics: appendMissingById(source.dynamic_topics, qa.dynamic_topics),
    dialogue: appendMissingById(source.dialogue, qa.dialogue),
    documents: appendMissingById(source.documents, qa.documents),
    quests: appendMissingById(source.quests, qa.quests),
    cutscenes: appendMissingById(source.cutscenes, qa.cutscenes),
    switches: { ...qa.switches, ...source.switches },
    items: appendMissingById(source.items, qa.items),
    abilities: appendMissingById(source.abilities, qa.abilities),
    encounters: appendMissingById(source.encounters, qa.encounters),
    shops: appendMissingById(source.shops, qa.shops),
    factions: appendMissingById(
      source.factions as Array<{ id: string }>,
      qa.factions as Array<{ id: string }>,
    ) as GamePackage["factions"],
    endings: appendMissingById(
      source.endings as Array<{ id: string }>,
      qa.endings as Array<{ id: string }>,
    ) as GamePackage["endings"],
    barks: appendMissingById(source.barks, qa.barks),
    object_blueprints: appendMissingById(source.object_blueprints, qa.object_blueprints),
    simulation_materials: appendMissingById(source.simulation_materials, qa.simulation_materials),
    simulation_processes: appendMissingById(source.simulation_processes, qa.simulation_processes),
    simulation_workstations: appendMissingById(source.simulation_workstations, qa.simulation_workstations),
  };

  return finalizePackageMigration(source, candidate, {
    warnings,
    changes: [
      {
        code: "qa_suite_merged",
        path: "maps",
        message: `Merged QA content while preserving all existing IDs; added ${addedMapIds.length} QA map${addedMapIds.length === 1 ? "" : "s"}.`,
        affectedIds: addedMapIds,
      },
    ],
  });
};

/** Replaces the whole package only after an explicit destructive confirmation. */
export const replaceWithQaSuite = (
  source: GamePackage,
  options: { confirmDestructive?: boolean; now?: Date } = {},
): PackageMigrationResult => {
  const candidate = createQaSuitePackage();
  return finalizePackageMigration(source, candidate, {
    confirmDestructive: options.confirmDestructive,
    now: options.now,
    backupReason: "before-qa-suite-replace",
    changes: [
      {
        code: "qa_suite_replaced_package",
        message: "Replace the active package with the canonical QA suite.",
      },
    ],
    destructiveChanges: [
      {
        code: "replace_entire_package",
        message: "All active package content will be replaced by the canonical QA suite.",
      },
    ],
  });
};

export const installQaSuite = (
  source: GamePackage,
  options: QaSuiteInstallOptions,
): PackageMigrationResult => {
  if (options.mode === "empty") return installQaSuiteIntoEmptyPackage(source);
  if (options.mode === "merge") return mergeQaSuiteIntoPackage(source);
  return replaceWithQaSuite(source, {
    confirmDestructive: options.confirmDestructive,
    now: options.now,
  });
};
