// ── Engine QA Testing Map Suite ──────────────────────────────────────────────
// Assembly shell for the QA suite (docs/QA_SUITE_REBUILD_PLAN_V1.md). The
// authored content lives in src/data/qaSuite/* wing modules; this file merges
// them into a package for the explicit builders in qaSuiteInstaller.ts.
//
// The suite is the engine's living acceptance test: a hub and nine labs that
// prove the fine-grid movement rebuild, the flowing chemistry (button-released
// floods, a viscosity race, fire with a wet moat, dissipating gas), the
// emotional layer, dialogue/cutscene/quest/story systems, combat, world
// simulation, and persistence. Everything is authored in MACRO tiles — the
// fineWorld expansion produces the fine world at load.

import type { GamePackage } from "../schema/game";
import { peopleHorrorSpriteId } from "./animatedSprites";
import { DEFAULT_UNLOCKED_ABILITY_IDS, mergeDefaultAbilities } from "./defaultAbilities";
import {
  QA_START_MAP_ID,
  QA_START_SPAWN_ID,
  animatedSpriteForEntity,
  mergeById,
  mergeSprites,
  mergeWings,
} from "./qaSuite/shared";
import { hubWing } from "./qaSuite/hub";
import { chemistryWing } from "./qaSuite/chemistryWing";
import { storyWing } from "./qaSuite/storyWing";
import { combatWing } from "./qaSuite/combatWing";
import { worldWing } from "./qaSuite/worldWing";

export const TEST_SUITE_START_MAP_ID = QA_START_MAP_ID;
export const TEST_SUITE_START_SPAWN_ID = QA_START_SPAWN_ID;
export const TEST_SUITE_PLAYER_SPRITE_ID = peopleHorrorSpriteId(1, 1);
// Bump on any suite-content change: persisted packages refresh their qa_*
// content when this differs (engineStore hydration), and stale play saves
// rebuild against the new version.
export const TEST_SUITE_VERSION = "2.2.2";

const wings = mergeWings([hubWing, chemistryWing, storyWing, combatWing, worldWing]);
export const TEST_SUITE_MAP_IDS = wings.maps.map((map) => map.id);
const TEST_SUITE_MAP_ID_SET = new Set(TEST_SUITE_MAP_IDS);

/**
 * Low-level QA content assembler. It intentionally replaces the map collection
 * and must only be called by explicit QA builders/installers, never package
 * normalization, import, setGamePackage, or hydration.
 */
export const withTestingMapSuite = (
  pkg: GamePackage,
  options: { preserveStart?: boolean } = {},
): GamePackage => {
  const preserveStart = Boolean(
    options.preserveStart && TEST_SUITE_MAP_ID_SET.has(pkg.metadata.start_map_id),
  );
  const mergedEntities = mergeById(pkg.entities, wings.entities).map((entity) => ({
    ...entity,
    sprite_id: animatedSpriteForEntity(entity),
  }));

  return {
    ...pkg,
    metadata: {
      ...pkg.metadata,
      title: "CRPG Engine Feature Test Suite",
      version: TEST_SUITE_VERSION,
      start_map_id: preserveStart ? pkg.metadata.start_map_id : TEST_SUITE_START_MAP_ID,
      start_spawn_id: preserveStart ? pkg.metadata.start_spawn_id : TEST_SUITE_START_SPAWN_ID,
    },
    settings: {
      ...pkg.settings,
      player_sprite_id: TEST_SUITE_PLAYER_SPRITE_ID,
      initial_known_skills: [
        ...new Set([
          ...(pkg.settings?.initial_known_skills || []),
          ...DEFAULT_UNLOCKED_ABILITY_IDS,
          ...wings.skills.map((skill) => skill.id),
        ]),
      ],
      clock_start_hour: 9,
      end_title: "QA SUITE COMPLETE",
    },
    sprite_library: mergeSprites(pkg.sprite_library),
    // The bundled game is the QA suite itself. Do not retain legacy worlds,
    // generated regions, or author-added maps when installing the suite.
    maps: [...wings.maps],
    entities: mergedEntities,
    dialogue: mergeById(pkg.dialogue, wings.dialogue),
    documents: mergeById(pkg.documents, wings.documents),
    quests: mergeById(pkg.quests, wings.quests),
    cutscenes: mergeById(pkg.cutscenes, wings.cutscenes),
    switches: { ...(pkg.switches || {}), ...wings.switches },
    items: mergeById(pkg.items, wings.items),
    abilities: mergeById(mergeDefaultAbilities(pkg.abilities), wings.skills),
    shops: mergeById(pkg.shops || [], wings.shops),
    factions: mergeById(
      (pkg.factions || []) as Array<{ id: string }>,
      wings.factions,
    ) as GamePackage["factions"],
    endings: mergeById(
      (pkg.endings || []) as Array<{ id: string }>,
      wings.endings,
    ) as GamePackage["endings"],
    barks: mergeById(pkg.barks || [], wings.barks),
    // QA replacement swaps the entire map collection, so map-bound simulation
    // records from the replaced package cannot remain as dangling references.
    simulation_processes: [...wings.processes],
    simulation_workstations: [...wings.workstations],
  };
};
