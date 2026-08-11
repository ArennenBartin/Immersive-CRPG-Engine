// ── Engine QA Testing Map Suite ──────────────────────────────────────────────
// Assembly shell for the QA suite (docs/QA_SUITE_REBUILD_PLAN_V1.md). The
// authored content lives in src/data/qaSuite/* wing modules; this file merges
// them into a package for the explicit builders in qaSuiteInstaller.ts.
//
// The suite is the engine's living acceptance test: a hub, eleven labs, and a
// reusable Level Zero and outdoor street environments that prove the fine-grid movement rebuild,
// flowing chemistry, emotional layer, dialogue/cutscene/quest/story systems,
// combat, world simulation, persistence, and authored corridor traversal.
// Everything is authored in MACRO tiles — fineWorld expands it at load.

import type { GamePackage } from "../schema/game";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
  objectLibraryPresets,
} from "../schema/presets";
import { peopleHorrorSpriteId } from "./animatedSprites";
import { BACKROOMS_PARASITE_MODEL_OBJECT_ID } from "./backroomsEntityAssets";
import {
  DEFAULT_UNLOCKED_ABILITY_IDS,
  mergeDefaultAbilities,
} from "./defaultAbilities";
import {
  QA_START_MAP_ID,
  QA_START_SPAWN_ID,
  animatedSpriteForEntity,
  mergeById,
  mergeSprites,
  mergeWings,
} from "./qaSuite/shared";
import { hubWing } from "./qaSuite/hub";
import { backroomsWing } from "./qaSuite/backroomsWing";
import {
  GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID,
  GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
  generatedBackroomsPhase6Wing,
} from "./qaSuite/generatedBackroomsPhase6Wing";
import {
  LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
  LEVEL0_CMT_PHASE6_AMBIENCE,
  LEVEL0_CMT_PHASE6_AUDIO,
  LEVEL0_CMT_PHASE6_EVENT_PROFILE,
  LEVEL0_CMT_PHASE6_MOTIF,
  LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
} from "../backroomsGen/presets/level0Cmt";
import {
  LONELY_STREET_MAP_ID,
  LONELY_STREET_OBJECT_IDS,
  LONELY_STREET_SPAWN_ID,
  lonelyStreetWing,
} from "./qaSuite/lonelyStreetWing";
import { chemistryWing } from "./qaSuite/chemistryWing";
import { storyWing } from "./qaSuite/storyWing";
import { combatWing } from "./qaSuite/combatWing";
import { worldWing } from "./qaSuite/worldWing";
import { perceptionWing } from "./qaSuite/perceptionWing";
import {
  QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  QA_PERSISTENCE_MAP_ID,
  QA_PERSISTENCE_SHORTCUT_ID,
  persistenceWing,
} from "./qaSuite/persistenceWing";

export const TEST_SUITE_START_MAP_ID = QA_START_MAP_ID;
export const TEST_SUITE_START_SPAWN_ID = QA_START_SPAWN_ID;
export const BUNDLED_GAME_START_MAP_ID = LONELY_STREET_MAP_ID;
export const BUNDLED_GAME_START_SPAWN_ID = LONELY_STREET_SPAWN_ID;
export const TEST_SUITE_PLAYER_SPRITE_ID = peopleHorrorSpriteId(1, 1);
// Bump on any suite-content change: persisted packages refresh their qa_*
// content when this differs (engineStore hydration), and stale play saves
// rebuild against the new version.
export const TEST_SUITE_VERSION = "3.14.0";

const wings = mergeWings([
  hubWing,
  backroomsWing,
  generatedBackroomsPhase6Wing,
  lonelyStreetWing,
  chemistryWing,
  storyWing,
  combatWing,
  worldWing,
  perceptionWing,
  persistenceWing,
]);
export const TEST_SUITE_MAP_IDS = wings.maps.map((map) => map.id);
const TEST_SUITE_MAP_ID_SET = new Set(TEST_SUITE_MAP_IDS);
const QA_ARCHITECTURE_OBJECT_IDS = new Set([
  INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_PARASITE_MODEL_OBJECT_ID,
  ...LONELY_STREET_OBJECT_IDS,
]);
const qaArchitectureObjects = objectLibraryPresets.filter((object) =>
  QA_ARCHITECTURE_OBJECT_IDS.has(object.id),
);

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
    options.preserveStart &&
    TEST_SUITE_MAP_ID_SET.has(pkg.metadata.start_map_id),
  );
  const mergedEntities = mergeById(pkg.entities, wings.entities).map(
    (entity) => ({
      ...entity,
      sprite_id: animatedSpriteForEntity(entity),
    }),
  );

  return {
    ...pkg,
    metadata: {
      ...pkg.metadata,
      title: "CRPG Engine Feature Test Suite",
      version: TEST_SUITE_VERSION,
      start_map_id: preserveStart
        ? pkg.metadata.start_map_id
        : BUNDLED_GAME_START_MAP_ID,
      start_spawn_id: preserveStart
        ? pkg.metadata.start_spawn_id
        : BUNDLED_GAME_START_SPAWN_ID,
    },
    settings: {
      ...pkg.settings,
      music_tracks: {
        ...((pkg.settings?.music_tracks ?? {}) as Record<string, string>),
        [LEVEL0_CMT_PHASE6_AUDIO.humMusicId]:
          LEVEL0_CMT_PHASE6_AUDIO.humUrl,
      },
      sound_effects: {
        ...((pkg.settings?.sound_effects ?? {}) as Record<string, string>),
        [LEVEL0_CMT_PHASE6_AUDIO.electricalPopId]:
          LEVEL0_CMT_PHASE6_AUDIO.electricalPopUrl,
        [LEVEL0_CMT_PHASE6_AUDIO.distantImpactId]:
          LEVEL0_CMT_PHASE6_AUDIO.distantImpactUrl,
      },
      map_music: {
        ...((pkg.settings?.map_music ?? {}) as Record<string, string>),
        [GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP_ID]:
          LEVEL0_CMT_PHASE6_AUDIO.humMusicId,
      },
      backrooms_ambience_profiles: {
        ...((pkg.settings?.backrooms_ambience_profiles ?? {}) as Record<
          string,
          unknown
        >),
        [LEVEL0_CMT_PHASE6_AMBIENCE.id]: LEVEL0_CMT_PHASE6_AMBIENCE,
      },
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
      movement_hearing: {
        ...(pkg.settings?.movement_hearing || {}),
        // Backrooms carpet muffles a footstep's rendered sound, but the
        // Parasite should still hear purposeful movement through nearby
        // corners and adjoining rooms. Sneaking stays meaningfully quieter
        // even against that more aggressive normal-movement baseline.
        normal_movement_loudness: 6.5,
        stealth_noise_multiplier: 0.1,
      },
      world_state_policy: {
        campaign_switch_ids: ["qa_persistence_major"],
        expedition_switch_ids: ["qa_persistence_hazard"],
        persistent_door_ids: {
          [QA_PERSISTENCE_MAP_ID]: [QA_PERSISTENCE_SHORTCUT_ID],
        },
        persistent_item_ids: {
          [QA_PERSISTENCE_MAP_ID]: [QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID],
        },
      },
      intercessor_succession: {
        enabled: true,
        hub_map_id: TEST_SUITE_START_MAP_ID,
        hub_spawn_id: TEST_SUITE_START_SPAWN_ID,
        name_prefixes: ["Al", "Bren", "Mara", "Sola"],
        name_roots: ["der", "mont", "vale", "rin"],
        name_suffixes: ["a", "en", "ic", "o"],
        banned_names: ["Null", "Test"],
        reserved_names: ["Mara Vale", "Sable North"],
        duplicate_name_policy: "avoid",
        history_keyword_id: "qa_topic_past_intercessor",
        // Successors begin without an assigned signature. The QA lesson in
        // the persistence lab gives the second life a distinct skill so two
        // physical ghosts can prove deterministic, once-only inheritance.
        base_known_skills: [],
      },
      campaign_debug: true,
    },
    sprite_library: mergeSprites(pkg.sprite_library),
    // The bundled game is the QA suite itself. Do not retain legacy worlds,
    // generated regions, or author-added maps when installing the suite.
    maps: [...wings.maps],
    object_library: mergeById(pkg.object_library, [
      ...qaArchitectureObjects,
      // Objects a wing brings with it, for placements the shared preset
      // library has no definition for.
      ...wings.objects,
    ]),
    entities: mergedEntities,
    keywords: mergeById(pkg.keywords, wings.keywords),
    dynamic_topics: mergeById(pkg.dynamic_topics, wings.dynamicTopics),
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
    backrooms_recipes: mergeById(pkg.backrooms_recipes, [
      GENERATED_BACKROOMS_PHASE6_PREVIEW_RECIPE,
    ]),
    backrooms_level_profiles: mergeById(pkg.backrooms_level_profiles, [
      LEVEL0_CMT_BACKROOMS_LEVEL_PROFILE,
    ]),
    backrooms_motifs: mergeById(pkg.backrooms_motifs, [
      LEVEL0_CMT_PHASE6_MOTIF,
    ]),
    backrooms_event_profiles: mergeById(pkg.backrooms_event_profiles, [
      LEVEL0_CMT_PHASE6_EVENT_PROFILE,
    ]),
    backrooms_anomaly_profiles: mergeById(pkg.backrooms_anomaly_profiles, [
      LEVEL0_CMT_PHASE8_ANOMALY_PROFILE,
    ]),
    // QA replacement swaps the entire map collection, so map-bound simulation
    // records from the replaced package cannot remain as dangling references.
    simulation_processes: [...wings.processes],
    simulation_workstations: [...wings.workstations],
  };
};
