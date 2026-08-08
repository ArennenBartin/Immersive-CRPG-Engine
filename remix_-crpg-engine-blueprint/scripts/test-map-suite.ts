// Headless acceptance test for the Engine QA Suite
// (docs/QA_SUITE_REBUILD_PLAN_V1.md, Phase 6). Run: npm run test:suite
//
// Part 1 — reference integrity: every id the suite content points at resolves
// (maps, spawns, dialogue, cutscenes, quests, items, skills, shops, factions,
// documents, triggers, workstations), and the fine expansion succeeds.
//
// Part 2 — chemistry acceptance on the AUTHORED rooms, by literally executing
// each lever cutscene's chem_spill actions against the expanded package:
//   flood — water oozes over successive move-ticks, pools in the basin,
//           leaves the raised walkway dry, and the active set drains;
//   race  — the water frontier outruns the honey frontier;
//   fire  — burn crosses the oil trail but never the moat-guarded vault;
//   gas   — miasma reaches distant cells, then dissipates to nothing.

import {
  type EventActionData,
  type GamePackage,
  type MapData,
  type ObjectData,
} from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  createDefaultEnginePackage,
  refreshBundledEnginePackage,
} from "../src/store/engineStore";
import {
  BUNDLED_OPENING_MUSIC_ID,
  BUNDLED_OPENING_MUSIC_URL,
  BUNDLED_TITLE_MUSIC_URL,
} from "../src/data/bundledMusic";
import type { PlaySave } from "../src/schema/save";
import {
  BUNDLED_GAME_START_MAP_ID,
  BUNDLED_GAME_START_SPAWN_ID,
  TEST_SUITE_MAP_IDS,
  TEST_SUITE_PLAYER_SPRITE_ID,
  TEST_SUITE_START_MAP_ID,
  TEST_SUITE_START_SPAWN_ID,
} from "../src/data/testingMapSuite";
import { withQaRoomCeilingArchitecture } from "../src/data/qaSuite/shared";
import { resolveDerivedCeilingOpeningCellKeys } from "../src/utils/immersiveArchitecture";
import {
  PHASE_11_HUB_MAP_ID,
  PHASE_11_HUB_SPAWN_ID,
} from "../src/data/qaSuite/integratedArchitectureScenario";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
  LONELY_STREET_ASPHALT_OBJECT_ID,
  LONELY_STREET_FRONT_DOOR_OBJECT_ID,
  LONELY_STREET_HOUSE_OBJECT_ID,
  LONELY_STREET_SIDEWALK_OBJECT_ID,
  LONELY_STREET_TREE_OBJECT_ID,
} from "../src/schema/presets";
import {
  BACKROOMS_LEVEL_ZERO_MAP_ID,
  BACKROOMS_LEVEL_ZERO_SPAWN_ID,
} from "../src/data/qaSuite/backroomsWing";
import {
  LONELY_STREET_BASEMENT_EXIT_CELL,
  LONELY_STREET_BASEMENT_MAP,
  LONELY_STREET_BASEMENT_MAP_ID,
  LONELY_STREET_BASEMENT_MOON_GOD_CELL,
  LONELY_STREET_BASEMENT_SPAWN_ID,
  LONELY_STREET_BASEMENT_TRANSITION_ID,
  LONELY_STREET_DOORWAY_CELL,
  LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
  LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
  LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL,
  LONELY_STREET_HOUSE_CELL,
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
} from "../src/data/qaSuite/lonelyStreetWing";
import {
  LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
  LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID,
  LONELY_STREET_INTERIOR_COLLISION_REVISION,
  LONELY_STREET_INTERIOR_DOOR_OBJECT_ID,
  LONELY_STREET_INTERIOR_SHELL_OBJECT_ID,
  LONELY_STREET_INTERIOR_SOFA_OBJECT_ID,
  LONELY_STREET_INTERIOR_TABLE_LAMP_OBJECT_ID,
  LONELY_STREET_INTERIOR_TASK_LIGHT_OBJECT_ID,
} from "../src/data/lonelyStreetHouseInteriorAssets";
import {
  LONELY_STREET_BASEMENT_ASSET_REVISION,
  LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
  LONELY_STREET_BASEMENT_OBJECT_IDS,
  LONELY_STREET_BASEMENT_SHELL_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
  LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
} from "../src/data/lonelyStreetBasementAssets";
import {
  BACKROOMS_PARASITE_ENTITY_ID,
  BACKROOMS_PARASITE_MODEL_OBJECT_ID,
} from "../src/data/backroomsEntityAssets";
import {
  RILEY_BUNDLED_ASSET_REVISION,
  RILEY_DIALOGUE_ID,
  RILEY_ENTITY_ID,
  RILEY_MODEL_OBJECT_ID,
  RILEY_SEATED_IDLE_CLIP,
  RILEY_SOFA_ANCHOR_REVISION,
  RILEY_SOFA_OBJECT_PLACEMENT_ID,
  RILEY_SOFA_PLACEMENT_ID,
  RILEY_SOFA_SEATED_CELL,
  RILEY_SOFA_SEATED_LOCAL_POSITION,
  RILEY_SOFA_SEATED_LOCAL_FACING,
} from "../src/data/rileyAssets";
import {
  HOUSE_ARRIVAL_COUCH_DIALOGUE,
  HOUSE_ARRIVAL_CUTSCENE,
  HOUSE_ARRIVAL_SEATED_SWITCH,
  HOUSE_ARRIVAL_SONG_DIALOGUE,
  HOUSE_ARRIVAL_SONG_URL,
  STEVE_SOFA_SEATED_LOCAL_POSITION,
  STEVE_SOFA_STANDING_CELL,
} from "../src/data/lonelyStreetHouseArrivalScene";
import {
  getMacroPlacementFootprint,
  getPlacementContinuousCollisionBounds,
  getPlacementFootprint,
  placementHasCollision,
} from "../src/utils/objectFootprint";
import {
  entityPlacementBlocksMovement,
  resolveEntityPresentationPose,
} from "../src/utils/entityPresentationAnchor";
import {
  FINE_HALF_EXTENT,
  FINE_PER_MACRO,
  advanceChemistryForSave,
  applyChemistrySpillToSave,
  buildConditionContext,
  dispatchV1ChangeMap,
  dispatchV1MoveEntity,
  dispatchV1OpenDoor,
  expandGamePackageToFine,
  fineCenterOfMacro,
  materializeLargeMapWindow,
  isMapExitEligible,
  readChemistryGridForSave,
  resolveImmersiveLightSources,
} from "../src/engine-core";
import { cellChemKey, type ChemCell } from "../src/engine-core/chemistry";
import { canAutomaticallyStepBetween } from "../src/utils/traversal";
import {
  freePlayerPositionIntersectsBlockedCell,
  freePlayerPositionIntersectsBounds,
  resolveFreeInteractionPose,
  resolveFreePlayerMovement,
  resolveNearestFreePlayerPosition,
} from "../src/utils/freePlayerMovement";
import { selectInteractionPlacementAtCell } from "../src/utils/interactionTargeting";
import { auditGamePackageReferences } from "../src/generation-facing/referenceAudit";
import {
  BASEMENT_BEER_ACQUIRED_SWITCH_ID,
  BASEMENT_BEER_CUTSCENE_ID,
  BASEMENT_BEER_DIALOGUE_ID,
  BASEMENT_BEER_INTERACT_TRIGGER_ID,
  BASEMENT_BEER_ITEM_ID,
  BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
  BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
  BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
  BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
  BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
  MOON_GOD_ASSET_REVISION,
  MOON_GOD_DIALOGUE_ID,
  MOON_GOD_ENCOUNTERED_SWITCH_ID,
  MOON_GOD_ENTITY_ID,
  MOON_GOD_FRIDGE_ANCHOR_PLACEMENT_ID,
  MOON_GOD_INTERACT_TRIGGER_ID,
  MOON_GOD_MODEL_OBJECT_ID,
  MOON_GOD_PLACEMENT_ID,
  MOON_GOD_STATIC_ANCHOR_REVISION,
  MOON_GOD_VANISH_CUTSCENE_ID,
} from "../src/data/moonGodAssets";

let passed = 0;
let failed = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const authored = createQaSuitePackage();
const fine = expandGamePackageToFine(authored);

// ── Part 1: reference integrity ──────────────────────────────────────────────
console.log("suite: reference integrity");
{
  const defaultPackage = createDefaultEnginePackage();
  const defaultSpriteById = new Map(
    defaultPackage.sprite_library.map((sprite) => [sprite.id, sprite]),
  );
  const placedEntityIds = new Set(
    defaultPackage.maps.flatMap((map) =>
      (map.entity_placements || []).map((placement) => placement.entity_id),
    ),
  );
  const placedEntities = defaultPackage.entities.filter((entity) =>
    placedEntityIds.has(entity.id),
  );

  ok(
    "fresh Studio workspace keeps the Phase 11 world but starts the campaign on Lonely Street",
    defaultPackage.metadata.title ===
      "Fracture Crawl — Integrated Architecture Scenario" &&
      defaultPackage.metadata.version === "phase11.1.0" &&
      defaultPackage.metadata.start_map_id === LONELY_STREET_MAP_ID &&
      defaultPackage.metadata.start_spawn_id === LONELY_STREET_SPAWN_ID &&
      defaultPackage.maps.length === TEST_SUITE_MAP_IDS.length + 2 &&
      TEST_SUITE_MAP_IDS.every((id) =>
        defaultPackage.maps.some((map) => map.id === id),
      ) &&
      defaultPackage.maps.some((map) => map.id === PHASE_11_HUB_MAP_ID) &&
      defaultPackage.maps.filter(
        (map) =>
          !TEST_SUITE_MAP_IDS.includes(map.id) &&
          map.id !== PHASE_11_HUB_MAP_ID,
      ).length === 1,
  );
  const defaultMapMusic = (defaultPackage.settings.map_music || {}) as Record<
    string,
    string
  >;
  ok(
    "fresh campaigns score the title, prologue, and Lonely Street approach with the bundled masters",
    defaultPackage.settings.title_music_url === BUNDLED_TITLE_MUSIC_URL &&
      defaultPackage.settings.opening_music_url === BUNDLED_OPENING_MUSIC_URL &&
      defaultMapMusic[LONELY_STREET_MAP_ID] === BUNDLED_OPENING_MUSIC_ID &&
      (defaultPackage.settings.music_tracks as Record<string, string>)[
        BUNDLED_OPENING_MUSIC_ID
      ] === BUNDLED_OPENING_MUSIC_URL,
  );
  const legacyPackageWithoutStoryMusic = structuredClone(defaultPackage);
  delete legacyPackageWithoutStoryMusic.settings.title_music_url;
  delete legacyPackageWithoutStoryMusic.settings.title_music_id;
  delete legacyPackageWithoutStoryMusic.settings.opening_music_url;
  delete (legacyPackageWithoutStoryMusic.settings.music_tracks as Record<
    string,
    string
  >)[BUNDLED_OPENING_MUSIC_ID];
  delete (legacyPackageWithoutStoryMusic.settings.map_music as Record<
    string,
    string
  >)[LONELY_STREET_MAP_ID];
  const refreshedStoryMusic = refreshBundledEnginePackage(
    legacyPackageWithoutStoryMusic,
  );
  ok(
    "hydration backfills the bundled story score into older workspaces",
    refreshedStoryMusic.settings.title_music_url === BUNDLED_TITLE_MUSIC_URL &&
      refreshedStoryMusic.settings.opening_music_url ===
        BUNDLED_OPENING_MUSIC_URL &&
      (
        refreshedStoryMusic.settings.map_music as Record<string, string>
      )[LONELY_STREET_MAP_ID] === BUNDLED_OPENING_MUSIC_ID &&
      (refreshedStoryMusic.settings.music_tracks as Record<string, string>)[
        BUNDLED_OPENING_MUSIC_ID
      ] === BUNDLED_OPENING_MUSIC_URL,
  );
  const legacyPhaseHubStart = structuredClone(defaultPackage);
  legacyPhaseHubStart.metadata.start_map_id = PHASE_11_HUB_MAP_ID;
  legacyPhaseHubStart.metadata.start_spawn_id = PHASE_11_HUB_SPAWN_ID;
  const migratedPhaseHubStart = refreshBundledEnginePackage(
    legacyPhaseHubStart,
  );
  ok(
    "hydration moves older Phase 11 starts to Lonely Street",
    migratedPhaseHubStart.metadata.start_map_id === LONELY_STREET_MAP_ID &&
      migratedPhaseHubStart.metadata.start_spawn_id === LONELY_STREET_SPAWN_ID,
  );
  ok(
    "fresh Studio workspace uses the animated GIF player",
    defaultPackage.settings.player_sprite_id === TEST_SUITE_PLAYER_SPRITE_ID &&
      defaultSpriteById.get(TEST_SUITE_PLAYER_SPRITE_ID)?.animated === true &&
      defaultSpriteById
        .get(TEST_SUITE_PLAYER_SPRITE_ID)
        ?.data_url?.endsWith(".gif") === true,
  );
  ok(
    "every placed QA entity resolves to an animated GIF",
    placedEntities.length > 0 &&
      placedEntities.every((entity) => {
        const sprite = entity.sprite_id
          ? defaultSpriteById.get(entity.sprite_id)
          : undefined;
        return (
          sprite?.animated === true &&
          sprite.data_url?.endsWith(".gif") === true
        );
      }),
  );
  const weakDialogueLabels = defaultPackage.keywords
    .filter((topic) =>
      /^(?:it|this|that|them|him|her|here|there|review topic \d+)$/i.test(
        topic.display_label.trim(),
      ),
    )
    .map((topic) => `${topic.id}=${topic.display_label}`);
  ok(
    "canonical QA dialogue exposes no pronoun-only or placeholder topic labels",
    weakDialogueLabels.length === 0,
    weakDialogueLabels.join(", "),
  );

  const editedQaPackage = {
    ...defaultPackage,
    metadata: { ...defaultPackage.metadata, version: "stale-qa-version" },
    maps: defaultPackage.maps.map((map, index) =>
      index === 0 ? { ...map, display_name: "Hand-edited QA sentinel" } : map,
    ),
  };
  const hydratedQaPackage = refreshBundledEnginePackage(editedQaPackage);
  ok(
    "QA-shaped persisted workspaces are never refreshed during hydration",
    hydratedQaPackage === editedQaPackage &&
      hydratedQaPackage.metadata.version === "stale-qa-version" &&
      hydratedQaPackage.maps[0]?.display_name === "Hand-edited QA sentinel",
  );
  const preParasiteWorkspace = {
    ...editedQaPackage,
    object_library: editedQaPackage.object_library.filter(
      (object) => object.id !== BACKROOMS_PARASITE_MODEL_OBJECT_ID,
    ),
    entities: editedQaPackage.entities.filter(
      (entity) => entity.id !== BACKROOMS_PARASITE_ENTITY_ID,
    ),
    maps: editedQaPackage.maps.map((map) =>
      map.id === BACKROOMS_LEVEL_ZERO_MAP_ID
        ? {
            ...map,
            entity_placements: map.entity_placements.filter(
              (placement) =>
                placement.entity_id !== BACKROOMS_PARASITE_ENTITY_ID,
            ),
          }
        : map,
    ),
  };
  const backfilledParasiteWorkspace =
    refreshBundledEnginePackage(preParasiteWorkspace);
  ok(
    "hydration appends the built-in parasite without overwriting authored QA edits",
    backfilledParasiteWorkspace.metadata.version === "stale-qa-version" &&
      backfilledParasiteWorkspace.maps[0]?.display_name ===
        "Hand-edited QA sentinel" &&
      backfilledParasiteWorkspace.object_library.some(
        (object) => object.id === BACKROOMS_PARASITE_MODEL_OBJECT_ID,
      ) &&
      backfilledParasiteWorkspace.entities.some(
        (entity) =>
          entity.id === BACKROOMS_PARASITE_ENTITY_ID &&
          entity.independent_movement?.enabled === true &&
          entity.horror_combat?.windup_ms === 500 &&
          entity.horror_combat?.active_ms === 120 &&
          entity.horror_combat?.recovery_ms === 850 &&
          entity.sensory_profile?.id === "backrooms_predator",
      ) &&
      backfilledParasiteWorkspace.maps.find(
        (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
      )?.combat_mode === "horror_realtime" &&
      backfilledParasiteWorkspace.maps
        .find((map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID)
        ?.entity_placements.some(
          (placement) => placement.entity_id === BACKROOMS_PARASITE_ENTITY_ID,
        ) === true,
  );
  const lonelyStreetObjectIds = new Set<string>(LONELY_STREET_OBJECT_IDS);
  const preLonelyStreetWorkspace = {
    ...editedQaPackage,
    object_library: editedQaPackage.object_library.filter(
      (object) => !lonelyStreetObjectIds.has(object.id),
    ),
    maps: editedQaPackage.maps.filter((map) => map.id !== LONELY_STREET_MAP_ID),
  };
  const backfilledLonelyStreetWorkspace = refreshBundledEnginePackage(
    preLonelyStreetWorkspace,
  );
  ok(
    "hydration appends the bundled Lonely Street without overwriting authored QA edits",
    backfilledLonelyStreetWorkspace.metadata.version === "stale-qa-version" &&
      backfilledLonelyStreetWorkspace.maps[0]?.display_name ===
        "Hand-edited QA sentinel" &&
      backfilledLonelyStreetWorkspace.maps.length ===
        preLonelyStreetWorkspace.maps.length + 1 &&
      backfilledLonelyStreetWorkspace.maps.some(
        (map) =>
          map.id === LONELY_STREET_MAP_ID &&
          map.display_name === LONELY_STREET_MAP.display_name,
      ) &&
      LONELY_STREET_OBJECT_IDS.every((objectId) =>
        backfilledLonelyStreetWorkspace.object_library.some(
          (object) => object.id === objectId,
        ),
      ),
  );
  const bundledLonelyStreet = backfilledLonelyStreetWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const legacyBasementWorkspace = structuredClone(defaultPackage);
  legacyBasementWorkspace.maps = legacyBasementWorkspace.maps.filter(
    (map) => map.id !== LONELY_STREET_BASEMENT_MAP_ID,
  );
  legacyBasementWorkspace.object_library =
    legacyBasementWorkspace.object_library.filter(
      (object) => !LONELY_STREET_BASEMENT_OBJECT_IDS.includes(object.id),
    );
  const legacyBasementInterior = legacyBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (legacyBasementInterior) {
    legacyBasementInterior.display_name = "Authored house sentinel";
    legacyBasementInterior.custom_object_placements =
      legacyBasementInterior.custom_object_placements.filter(
        (placement) =>
          placement.id !== LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      );
    legacyBasementInterior.spawns = legacyBasementInterior.spawns.filter(
      (spawn) =>
        spawn.id !== LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
    );
    legacyBasementInterior.exits = legacyBasementInterior.exits.filter(
      (mapExit) => mapExit.target_map_id !== LONELY_STREET_BASEMENT_MAP_ID,
    );
  }
  const hydratedBasementWorkspace = refreshBundledEnginePackage(
    legacyBasementWorkspace,
  );
  const hydratedBasement = hydratedBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  const hydratedBasementInterior = hydratedBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const hydratedBasementReferences = auditGamePackageReferences(
    hydratedBasementWorkspace,
  );
  const hydratedHouseBasementDoor =
    hydratedBasementInterior?.custom_object_placements.find(
      (placement) =>
        placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
    );
  ok(
    "hydration appends the modular basement and stairs route without replacing house edits",
    hydratedBasement?.display_name === LONELY_STREET_BASEMENT_MAP.display_name &&
      hydratedBasementInterior?.display_name === "Authored house sentinel" &&
      LONELY_STREET_BASEMENT_OBJECT_IDS.every((objectId) =>
        hydratedBasementWorkspace.object_library.some(
          (object) => object.id === objectId,
        ),
      ) &&
      hydratedBasementInterior?.spawns.some(
        (spawn) =>
          spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      ) === true &&
      hydratedBasementInterior.exits.some(
        (mapExit) =>
          mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID &&
          mapExit.target_spawn_id === LONELY_STREET_BASEMENT_SPAWN_ID,
      ) === true &&
      hydratedBasementWorkspace.maps.filter(
        (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
      ).length === 1 &&
      LONELY_STREET_BASEMENT_OBJECT_IDS.every(
        (objectId) =>
          hydratedBasementWorkspace.object_library.filter(
            (object) => object.id === objectId,
          ).length === 1,
      ) &&
      hydratedBasementInterior.spawns.filter(
        (spawn) =>
          spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      ).length === 1 &&
      hydratedBasementInterior.exits.filter(
        (mapExit) => mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID,
      ).length === 1 &&
      hydratedHouseBasementDoor?.object_id ===
        LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID &&
      hydratedHouseBasementDoor.cell[0] ===
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[0] &&
      hydratedHouseBasementDoor.cell[1] ===
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[1] &&
      hydratedHouseBasementDoor.collision_mode === "none" &&
      hydratedBasementInterior.custom_object_placements.filter(
        (placement) =>
          placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      ).length === 1 &&
      hydratedBasementReferences.valid,
    hydratedBasementReferences.issues.map((issue) => issue.code).join(", "),
  );
  ok(
    "basement hydration is idempotent once the map, assets, and route are installed",
    refreshBundledEnginePackage(hydratedBasementWorkspace) ===
      hydratedBasementWorkspace,
  );
  const preMoonGodWorkspace = structuredClone(defaultPackage);
  preMoonGodWorkspace.object_library = preMoonGodWorkspace.object_library.filter(
    (object) => object.id !== MOON_GOD_MODEL_OBJECT_ID,
  );
  preMoonGodWorkspace.entities = preMoonGodWorkspace.entities.filter(
    (entity) => entity.id !== MOON_GOD_ENTITY_ID,
  );
  preMoonGodWorkspace.dialogue = preMoonGodWorkspace.dialogue.filter(
    (dialogue) =>
      dialogue.id !== MOON_GOD_DIALOGUE_ID &&
      dialogue.id !== BASEMENT_BEER_DIALOGUE_ID &&
      dialogue.id !== BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
  );
  preMoonGodWorkspace.cutscenes = preMoonGodWorkspace.cutscenes.filter(
    (cutscene) =>
      cutscene.id !== BASEMENT_ENTRY_SILENCE_CUTSCENE_ID &&
      cutscene.id !== MOON_GOD_VANISH_CUTSCENE_ID &&
      cutscene.id !== BASEMENT_BEER_CUTSCENE_ID &&
      cutscene.id !== BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
  );
  preMoonGodWorkspace.items = preMoonGodWorkspace.items.filter(
    (item) => item.id !== BASEMENT_BEER_ITEM_ID,
  );
  delete preMoonGodWorkspace.switches[BASEMENT_BEER_ACQUIRED_SWITCH_ID];
  delete preMoonGodWorkspace.switches[MOON_GOD_ENCOUNTERED_SWITCH_ID];
  const preMoonGodBasement = preMoonGodWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  if (preMoonGodBasement) {
    preMoonGodBasement.entity_placements =
      preMoonGodBasement.entity_placements.filter(
        (placement) => placement.id !== MOON_GOD_PLACEMENT_ID,
      );
    preMoonGodBasement.triggers = preMoonGodBasement.triggers.filter(
      (trigger) =>
        ![
          BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
          MOON_GOD_INTERACT_TRIGGER_ID,
          BASEMENT_BEER_INTERACT_TRIGGER_ID,
          BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
        ].includes(trigger.id),
    );
    preMoonGodBasement.exits = preMoonGodBasement.exits.map((mapExit) =>
      mapExit.target_map_id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID
        ? { ...mapExit, condition: undefined }
        : mapExit,
    );
  }
  const hydratedMoonGodWorkspace = refreshBundledEnginePackage(
    preMoonGodWorkspace,
  );
  const hydratedMoonGodBasement = hydratedMoonGodWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  const hydratedMoonGodReturnExit = hydratedMoonGodBasement?.exits.find(
    (mapExit) => mapExit.target_map_id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  ok(
    "hydration installs the Moon God, silent entry, beer objective, and locked return into older workspaces",
    hydratedMoonGodWorkspace.object_library.some(
      (object) => object.id === MOON_GOD_MODEL_OBJECT_ID,
    ) &&
      hydratedMoonGodWorkspace.entities.some(
        (entity) => entity.id === MOON_GOD_ENTITY_ID,
      ) &&
      [
        MOON_GOD_DIALOGUE_ID,
        BASEMENT_BEER_DIALOGUE_ID,
        BASEMENT_BEER_LOCKED_HINT_DIALOGUE_ID,
      ].every((id) =>
        hydratedMoonGodWorkspace.dialogue.some(
          (dialogue) => dialogue.id === id,
        ),
      ) &&
      [
        BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
        MOON_GOD_VANISH_CUTSCENE_ID,
        BASEMENT_BEER_CUTSCENE_ID,
        BASEMENT_BEER_LOCKED_HINT_CUTSCENE_ID,
      ].every((id) =>
        hydratedMoonGodWorkspace.cutscenes.some(
          (cutscene) => cutscene.id === id,
        ),
      ) &&
      hydratedMoonGodWorkspace.items.some(
        (item) => item.id === BASEMENT_BEER_ITEM_ID,
      ) &&
      Object.prototype.hasOwnProperty.call(
        hydratedMoonGodWorkspace.switches,
        BASEMENT_BEER_ACQUIRED_SWITCH_ID,
      ) &&
      Object.prototype.hasOwnProperty.call(
        hydratedMoonGodWorkspace.switches,
        MOON_GOD_ENCOUNTERED_SWITCH_ID,
      ) &&
      hydratedMoonGodBasement?.entity_placements.some(
        (placement) =>
          placement.id === MOON_GOD_PLACEMENT_ID &&
          placement.entity_id === MOON_GOD_ENTITY_ID &&
          placement.collision_mode === "solid",
      ) === true &&
      [
        BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
        MOON_GOD_INTERACT_TRIGGER_ID,
        BASEMENT_BEER_INTERACT_TRIGGER_ID,
        BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
      ].every((id) =>
        hydratedMoonGodBasement?.triggers.some(
          (trigger) => trigger.id === id,
        ),
      ) &&
      hydratedMoonGodReturnExit?.condition?.switch ===
        BASEMENT_BEER_ACQUIRED_SWITCH_ID &&
      hydratedMoonGodReturnExit.condition.switch_value === true &&
      refreshBundledEnginePackage(hydratedMoonGodWorkspace) ===
        hydratedMoonGodWorkspace,
  );
  // The Moon God must be dealt with before the beer: Steve cannot simply walk
  // past a "none"-collision apparition to the fridge behind it. Verify both
  // halves of that gate — the entity physically blocks the tile, and the
  // fridge's two interact triggers are wired so exactly one is eligible at a
  // time depending on whether the encounter switch has fired yet.
  {
    const hintTrigger = hydratedMoonGodBasement?.triggers.find(
      (trigger) => trigger.id === BASEMENT_BEER_LOCKED_HINT_TRIGGER_ID,
    );
    const beerTrigger = hydratedMoonGodBasement?.triggers.find(
      (trigger) => trigger.id === BASEMENT_BEER_INTERACT_TRIGGER_ID,
    );
    const moonGodVanish = hydratedMoonGodWorkspace.cutscenes.find(
      (cutscene) => cutscene.id === MOON_GOD_VANISH_CUTSCENE_ID,
    );
    ok(
      "the Moon God blocks its own tile and the fridge's two interact triggers gate on encountering it",
      hintTrigger?.cell?.[0] === beerTrigger?.cell?.[0] &&
        hintTrigger?.cell?.[1] === beerTrigger?.cell?.[1] &&
        hintTrigger?.conditions?.some(
          (condition) =>
            condition.switch_id === MOON_GOD_ENCOUNTERED_SWITCH_ID &&
            condition.expected_value === false,
        ) === true &&
        beerTrigger?.conditions?.some(
          (condition) =>
            condition.switch_id === MOON_GOD_ENCOUNTERED_SWITCH_ID &&
            condition.expected_value === true,
        ) === true &&
        moonGodVanish?.actions.some(
          (action) =>
            action.type === "set_switch" &&
            action.switch_id === MOON_GOD_ENCOUNTERED_SWITCH_ID &&
            action.switch_value === true,
        ) === true,
    );
  }
  // A DRAFT placement — same id/entity_id, but authored before `schedule` and
  // `presentation_anchor.lock_to_anchor`/`revision` existed — passes every
  // "is this content present" check above yet still lets ordinary exploration
  // AI nudge the apparition off its post (idle-wander has nothing pinning it
  // home), and once its cell drifts the render path also drops the fixed
  // anchor pose. Reported symptom: it visibly takes a step and turns to face
  // wherever it walked. This must be detected and repaired on its own.
  const draftMoonGodWorkspace = structuredClone(defaultPackage);
  const draftMoonGodBasement = draftMoonGodWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  draftMoonGodBasement!.entity_placements =
    draftMoonGodBasement!.entity_placements.map((placement) => {
      if (placement.id !== MOON_GOD_PLACEMENT_ID) return placement;
      const { schedule: _schedule, ...rest } = placement;
      return {
        ...rest,
        presentation_anchor: {
          object_placement_id:
            placement.presentation_anchor!.object_placement_id,
          local_position: placement.presentation_anchor!.local_position,
          local_facing: placement.presentation_anchor!.local_facing,
          // No lock_to_anchor, no revision: an old draft anchor.
        },
      };
    });
  const repairedDraftMoonGodWorkspace = refreshBundledEnginePackage(
    draftMoonGodWorkspace,
  );
  const repairedDraftMoonGodPlacement = repairedDraftMoonGodWorkspace.maps
    .find((map) => map.id === LONELY_STREET_BASEMENT_MAP_ID)
    ?.entity_placements.find(
      (placement) => placement.id === MOON_GOD_PLACEMENT_ID,
    );
  ok(
    "hydration repairs a Moon God placement that predates its schedule and locked anchor",
    repairedDraftMoonGodPlacement?.schedule?.length === 1 &&
      repairedDraftMoonGodPlacement.schedule[0]?.cell[0] ===
        repairedDraftMoonGodPlacement.cell[0] &&
      repairedDraftMoonGodPlacement.schedule[0].cell[1] ===
        repairedDraftMoonGodPlacement.cell[1] &&
      repairedDraftMoonGodPlacement.presentation_anchor?.lock_to_anchor ===
        true &&
      repairedDraftMoonGodPlacement.presentation_anchor.revision ===
        MOON_GOD_STATIC_ANCHOR_REVISION &&
      refreshBundledEnginePackage(repairedDraftMoonGodWorkspace) ===
        repairedDraftMoonGodWorkspace,
  );
  // A model that already exists by id is never touched by the "append only
  // what's missing" object_library merge, so a size/scale change never
  // reaches an existing save unless it is detected by its own revision tag.
  const shrunkenMoonGodWorkspace = structuredClone(defaultPackage);
  shrunkenMoonGodWorkspace.object_library =
    shrunkenMoonGodWorkspace.object_library.map((object) => {
      if (object.id !== MOON_GOD_MODEL_OBJECT_ID) return object;
      return {
        ...object,
        tags: object.tags.filter(
          (tag) => tag !== MOON_GOD_ASSET_REVISION,
        ),
        bounds: [0.5, 0.5, 0.5],
        asset: object.asset ? { ...object.asset, scale: [1, 1, 1] } : object.asset,
      };
    });
  const repairedMoonGodModelWorkspace = refreshBundledEnginePackage(
    shrunkenMoonGodWorkspace,
  );
  const repairedMoonGodModel = repairedMoonGodModelWorkspace.object_library.find(
    (object) => object.id === MOON_GOD_MODEL_OBJECT_ID,
  );
  ok(
    "hydration replaces a Moon God model that predates its current scale",
    repairedMoonGodModel?.tags.includes(MOON_GOD_ASSET_REVISION) === true &&
      repairedMoonGodModel.asset?.scale[0] === 2.5 &&
      repairedMoonGodModel.asset.scale[1] === 3.28 &&
      repairedMoonGodModel.asset.scale[2] === 2.5 &&
      // Taller than Steve (1.8m) but still clearing the real ~2.74m ceiling.
      repairedMoonGodModel.bounds[1] > 2.0 &&
      repairedMoonGodModel.bounds[1] < 2.74 &&
      refreshBundledEnginePackage(repairedMoonGodModelWorkspace) ===
        repairedMoonGodModelWorkspace,
  );
  const markerOnlyBasementWorkspace = structuredClone(defaultPackage);
  const markerOnlyBasementInterior = markerOnlyBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (markerOnlyBasementInterior) {
    markerOnlyBasementInterior.custom_object_placements =
      markerOnlyBasementInterior.custom_object_placements.filter(
        (placement) =>
          placement.id !== LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      );
  }
  const repairedMarkerOnlyBasementWorkspace = refreshBundledEnginePackage(
    markerOnlyBasementWorkspace,
  );
  const repairedMarkerOnlyBasementInterior =
    repairedMarkerOnlyBasementWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  ok(
    "hydration backfills exactly one visible door when only the bundled basement marker is missing",
    repairedMarkerOnlyBasementInterior?.custom_object_placements.filter(
      (placement) =>
        placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID &&
        placement.object_id === LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
    ).length === 1 &&
      refreshBundledEnginePackage(repairedMarkerOnlyBasementWorkspace) ===
        repairedMarkerOnlyBasementWorkspace,
  );
  const repairableBasementRouteWorkspace = structuredClone(defaultPackage);
  const repairableBasementRouteInterior =
    repairableBasementRouteWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  if (repairableBasementRouteInterior) {
    repairableBasementRouteInterior.spawns =
      repairableBasementRouteInterior.spawns.filter(
        (spawn) =>
          spawn.id !== LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      );
    repairableBasementRouteInterior.custom_object_placements =
      repairableBasementRouteInterior.custom_object_placements.filter(
        (placement) =>
          placement.id !== LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      );
  }
  const repairedBasementRouteWorkspace = refreshBundledEnginePackage(
    repairableBasementRouteWorkspace,
  );
  const repairedBasementRouteInterior =
    repairedBasementRouteWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  ok(
    "hydration repairs one missing house return spawn when the canonical basement route already exists",
    repairedBasementRouteInterior?.spawns.filter(
      (spawn) =>
        spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
    ).length === 1 &&
      repairedBasementRouteInterior.exits.filter(
        (mapExit) =>
          mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID &&
          mapExit.target_spawn_id === LONELY_STREET_BASEMENT_SPAWN_ID,
      ).length === 1 &&
      repairedBasementRouteInterior.custom_object_placements.filter(
        (placement) =>
          placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID &&
          placement.object_id === LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID,
      ).length === 1,
  );

  const legacyBasementLightingWorkspace = structuredClone(defaultPackage);
  const legacyBasementLightingMap = legacyBasementLightingWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  const legacyBasementBulb =
    legacyBasementLightingWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
    );
  const legacyBasementSconce =
    legacyBasementLightingWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
    );
  if (legacyBasementLightingMap) {
    legacyBasementLightingMap.ambient_light = 0.12;
    delete legacyBasementLightingMap.presentation_ambient_light;
    const legacyEntrySpawn = legacyBasementLightingMap.spawns.find(
      (spawn) => spawn.id === LONELY_STREET_BASEMENT_SPAWN_ID,
    );
    if (legacyEntrySpawn) {
      // Latest persisted pose before the arrival-clearance fix: Steve faced
      // into the room, but the stair collider still pinned his right shoulder.
      legacyEntrySpawn.cell = [2, 3];
      legacyEntrySpawn.facing = [1, 0];
    }
  }
  if (legacyBasementBulb?.light_source) {
    legacyBasementBulb.light_source.intensity = 0.78;
    legacyBasementBulb.light_source.radius = 9;
  }
  if (legacyBasementSconce?.light_source) {
    // Latest shipped profile before the landing readability pass.
    legacyBasementSconce.light_source.intensity = 0.55;
    legacyBasementSconce.light_source.radius = 7;
  }
  const upgradedBasementLightingWorkspace = refreshBundledEnginePackage(
    legacyBasementLightingWorkspace,
  );
  const upgradedBasementLightingMap =
    upgradedBasementLightingWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
    );
  const upgradedBasementBulb =
    upgradedBasementLightingWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
    );
  const upgradedBasementSconce =
    upgradedBasementLightingWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
    );
  const upgradedBasementEntrySpawn = upgradedBasementLightingMap?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_BASEMENT_SPAWN_ID,
  );
  ok(
    "hydration lifts only the original unreadable basement lighting revision",
    upgradedBasementLightingMap?.ambient_light ===
      LONELY_STREET_BASEMENT_MAP.ambient_light &&
      upgradedBasementLightingMap.presentation_ambient_light ===
        LONELY_STREET_BASEMENT_MAP.presentation_ambient_light &&
      upgradedBasementBulb?.light_source?.intensity === 0.95 &&
      upgradedBasementBulb.light_source.radius === 11,
  );
  ok(
    "hydration moves the latest saved basement spawn clear of the stair collider",
    upgradedBasementEntrySpawn?.cell[0] === 1 &&
      upgradedBasementEntrySpawn.cell[1] === 2 &&
      upgradedBasementEntrySpawn.facing[0] === 1 &&
      upgradedBasementEntrySpawn.facing[1] === 0,
    JSON.stringify(upgradedBasementEntrySpawn),
  );
  ok(
    "hydration upgrades the latest saved basement stair-sconce profile",
    upgradedBasementSconce?.light_source?.intensity === 0.75 &&
      upgradedBasementSconce.light_source.radius === 9,
    JSON.stringify(upgradedBasementSconce?.light_source),
  );

  const authoredBasementLightingWorkspace = structuredClone(defaultPackage);
  const authoredBasementLightingMap =
    authoredBasementLightingWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
    );
  const authoredBasementBulb =
    authoredBasementLightingWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
    );
  if (authoredBasementLightingMap) {
    authoredBasementLightingMap.ambient_light = 0.19;
    authoredBasementLightingMap.presentation_ambient_light = 0.27;
  }
  if (authoredBasementBulb?.light_source) {
    authoredBasementBulb.light_source.intensity = 0.37;
    authoredBasementBulb.light_source.radius = 4;
  }
  const preservedAuthoredBasementLighting = refreshBundledEnginePackage(
    authoredBasementLightingWorkspace,
  );
  const preservedAuthoredBasementLightingMap =
    preservedAuthoredBasementLighting.maps.find(
      (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
    );
  const preservedAuthoredBasementBulb =
    preservedAuthoredBasementLighting.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
    );
  ok(
    "hydration preserves authored basement lighting values",
    preservedAuthoredBasementLightingMap?.ambient_light === 0.19 &&
      preservedAuthoredBasementLightingMap.presentation_ambient_light ===
        0.27 &&
      preservedAuthoredBasementBulb?.light_source?.intensity === 0.37 &&
      preservedAuthoredBasementBulb.light_source.radius === 4,
  );

  const authoredBasementWorkspace = structuredClone(defaultPackage);
  const authoredBasement = authoredBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  if (authoredBasement) {
    authoredBasement.display_name = "Authored basement sentinel";
    authoredBasement.ambient_light = 0.41;
    authoredBasement.combat_mode = "horror_realtime";
    authoredBasement.spawns[0].facing = [0, 1];
    authoredBasement.custom_object_placements[0] = {
      ...authoredBasement.custom_object_placements[0],
      height_offset: 0.37,
    };
    authoredBasement.exits[0] = {
      ...authoredBasement.exits[0],
      transition_kind: "ladder",
    };
  }
  const authoredBasementSnapshot = structuredClone(authoredBasement);
  const preservedAuthoredBasementWorkspace = refreshBundledEnginePackage(
    authoredBasementWorkspace,
  );
  const preservedAuthoredBasement =
    preservedAuthoredBasementWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
    );
  ok(
    "hydration preserves an existing authored basement map byte-for-byte",
    JSON.stringify(preservedAuthoredBasement) ===
      JSON.stringify(authoredBasementSnapshot),
  );

  const customBasementObjectWorkspace = structuredClone(defaultPackage);
  const customBasementObject =
    customBasementObjectWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID,
    );
  if (customBasementObject) {
    customBasementObject.display_name = "Authored staircase sentinel";
    customBasementObject.bounds = [7, 8, 9];
  }
  const preservedCustomBasementObjectWorkspace = refreshBundledEnginePackage(
    customBasementObjectWorkspace,
  );
  const preservedCustomBasementObject =
    preservedCustomBasementObjectWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_BASEMENT_STAIRCASE_OBJECT_ID,
    );
  ok(
    "hydration never replaces an existing same-id custom basement object",
    preservedCustomBasementObject?.display_name ===
      "Authored staircase sentinel" &&
      preservedCustomBasementObject.bounds[0] === 7 &&
      preservedCustomBasementObject.bounds[1] === 8 &&
      preservedCustomBasementObject.bounds[2] === 9,
  );

  const incompatibleBasementWorkspace = structuredClone(defaultPackage);
  const incompatibleBasement = incompatibleBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  const incompatibleBasementInterior = incompatibleBasementWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (incompatibleBasement) {
    incompatibleBasement.spawns = incompatibleBasement.spawns.filter(
      (spawn) => spawn.id !== LONELY_STREET_BASEMENT_SPAWN_ID,
    );
  }
  if (incompatibleBasementInterior) {
    incompatibleBasementInterior.spawns =
      incompatibleBasementInterior.spawns.filter(
        (spawn) =>
          spawn.id !== LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      );
    incompatibleBasementInterior.exits =
      incompatibleBasementInterior.exits.filter(
        (mapExit) => mapExit.target_map_id !== LONELY_STREET_BASEMENT_MAP_ID,
      );
  }
  const preservedIncompatibleBasementWorkspace = refreshBundledEnginePackage(
    incompatibleBasementWorkspace,
  );
  const preservedIncompatibleBasementInterior =
    preservedIncompatibleBasementWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  ok(
    "hydration never creates a dangling house route when an authored basement is missing its entry spawn",
    preservedIncompatibleBasementInterior?.exits.some(
      (mapExit) => mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID,
    ) === false &&
      preservedIncompatibleBasementInterior.spawns.some(
        (spawn) =>
          spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      ) === false,
  );

  const rebuiltHouseWorkspace = structuredClone(legacyBasementWorkspace);
  const rebuiltHouse = rebuiltHouseWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (rebuiltHouse) {
    rebuiltHouse.width = 42;
  }
  const preservedRebuiltHouseWorkspace = refreshBundledEnginePackage(
    rebuiltHouseWorkspace,
  );
  const preservedRebuiltHouse = preservedRebuiltHouseWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  ok(
    "hydration never injects the bundled stairs route into a rebuilt house interior",
    preservedRebuiltHouse?.width === 42 &&
      preservedRebuiltHouse.exits.some(
        (mapExit) => mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID,
      ) === false &&
      preservedRebuiltHouse.spawns.some(
        (spawn) =>
          spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      ) === false &&
      preservedRebuiltHouseWorkspace.maps.some(
        (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
      ) === false,
  );
  const basementRouteConflictWorkspace = structuredClone(
    legacyBasementWorkspace,
  );
  const conflictInterior = basementRouteConflictWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (conflictInterior) {
    conflictInterior.exits.push({
      id: "authored_house_secret_stairs",
      cell: [...LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL],
      target_map_id: LONELY_STREET_MAP_ID,
      target_spawn_id: LONELY_STREET_RETURN_SPAWN_ID,
    });
  }
  const preservedBasementRouteConflict = refreshBundledEnginePackage(
    basementRouteConflictWorkspace,
  );
  const preservedConflictInterior = preservedBasementRouteConflict.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const preservedConflictReferences = auditGamePackageReferences(
    preservedBasementRouteConflict,
  );
  ok(
    "hydration never stacks the basement transition over an authored stairs route",
    preservedConflictInterior?.exits.some(
      (mapExit) => mapExit.id === "authored_house_secret_stairs",
    ) === true &&
      preservedConflictInterior.exits.filter(
        (mapExit) =>
          mapExit.cell[0] === LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[0] &&
          mapExit.cell[1] === LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[1],
      ).length === 1 &&
      preservedConflictInterior.spawns.some(
        (spawn) =>
          spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      ) === false &&
      preservedConflictInterior.custom_object_placements.some(
        (placement) =>
          placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      ) === false &&
      preservedBasementRouteConflict.maps.some(
        (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
      ) === false &&
      preservedBasementRouteConflict.object_library.some((object) =>
        LONELY_STREET_BASEMENT_OBJECT_IDS.includes(object.id),
      ) === false &&
      preservedConflictReferences.valid &&
      refreshBundledEnginePackage(preservedBasementRouteConflict) ===
        preservedBasementRouteConflict,
    preservedConflictReferences.issues.map((issue) => issue.code).join(", "),
  );
  const claimedBasementLandingWorkspace = structuredClone(
    legacyBasementWorkspace,
  );
  const claimedBasementLandingInterior =
    claimedBasementLandingWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  claimedBasementLandingInterior?.custom_object_placements.push({
    id: "authored_basement_landing_prop",
    object_id: LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID,
    cell: [...LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL],
    facing: [0, 1],
    collision_mode: "inherit",
  });
  const preservedClaimedBasementLanding = refreshBundledEnginePackage(
    claimedBasementLandingWorkspace,
  );
  const preservedClaimedBasementLandingInterior =
    preservedClaimedBasementLanding.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  ok(
    "hydration never installs the basement route or marker over an authored landing prop",
    preservedClaimedBasementLandingInterior?.custom_object_placements.some(
      (placement) => placement.id === "authored_basement_landing_prop",
    ) === true &&
      preservedClaimedBasementLandingInterior.custom_object_placements.some(
        (placement) =>
          placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      ) === false &&
      preservedClaimedBasementLandingInterior.exits.some(
        (mapExit) => mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID,
      ) === false &&
      preservedClaimedBasementLanding.maps.some(
        (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
      ) === false &&
      preservedClaimedBasementLanding.object_library.some((object) =>
        LONELY_STREET_BASEMENT_OBJECT_IDS.includes(object.id),
      ) === false,
  );
  const missingHouseWithCustomBasementWorkspace = structuredClone(
    defaultPackage,
  );
  missingHouseWithCustomBasementWorkspace.maps =
    missingHouseWithCustomBasementWorkspace.maps
      .filter((map) => map.id !== LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
      .map((map) =>
        map.id === LONELY_STREET_BASEMENT_MAP_ID
          ? {
              ...structuredClone(LONELY_STREET_MAP),
              id: LONELY_STREET_BASEMENT_MAP_ID,
              display_name: "Authored basement sentinel",
              exits: [],
            }
          : map,
      );
  missingHouseWithCustomBasementWorkspace.object_library =
    missingHouseWithCustomBasementWorkspace.object_library.filter(
      (object) => !LONELY_STREET_BASEMENT_OBJECT_IDS.includes(object.id),
    );
  const preservedCustomBasementWithoutHouse = refreshBundledEnginePackage(
    missingHouseWithCustomBasementWorkspace,
  );
  const appendedHouseBesideCustomBasement =
    preservedCustomBasementWithoutHouse.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    );
  const preservedCustomBasementWithoutHouseReferences =
    auditGamePackageReferences(preservedCustomBasementWithoutHouse);
  ok(
    "hydration keeps a newly appended house independent from an incompatible same-id basement",
    preservedCustomBasementWithoutHouse.maps.find(
      (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
    )?.display_name === "Authored basement sentinel" &&
      appendedHouseBesideCustomBasement?.custom_object_placements.some(
        (placement) =>
          placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
      ) === false &&
      appendedHouseBesideCustomBasement?.exits.some(
        (mapExit) => mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID,
      ) === false &&
      appendedHouseBesideCustomBasement?.spawns.some(
        (spawn) =>
          spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
      ) === false &&
      preservedCustomBasementWithoutHouse.object_library.some((object) =>
        LONELY_STREET_BASEMENT_OBJECT_IDS.includes(object.id),
      ) === false &&
      preservedCustomBasementWithoutHouseReferences.valid,
    preservedCustomBasementWithoutHouseReferences.issues
      .map((issue) => issue.code)
      .join(", "),
  );
  const staleArrivalWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const staleArrivalStreet = staleArrivalWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const staleArrivalInterior = staleArrivalWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (staleArrivalStreet) {
    staleArrivalStreet.spawns = [
      ...staleArrivalStreet.spawns.filter(
        (spawn) => spawn.id !== LONELY_STREET_RETURN_SPAWN_ID,
      ),
      {
        id: "custom_street_spawn",
        cell: [0, 0],
        facing: [0, 1],
      },
    ];
    staleArrivalStreet.exits = staleArrivalStreet.exits.map((mapExit) => ({
      ...mapExit,
      target_spawn_id: undefined,
    }));
  }
  if (staleArrivalInterior) {
    staleArrivalInterior.ambient_light = 0.1;
    const legacyInteriorSpawn = staleArrivalInterior.spawns.find(
      (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
    );
    if (legacyInteriorSpawn) {
      legacyInteriorSpawn.cell = [-2, -1];
      legacyInteriorSpawn.facing = [1, 0];
    }
    staleArrivalInterior.exits = staleArrivalInterior.exits.map((mapExit) => ({
      ...mapExit,
      target_spawn_id: LONELY_STREET_SPAWN_ID,
    }));
  }
  const repairedArrivalWorkspace = refreshBundledEnginePackage(
    staleArrivalWorkspace,
  );
  const repairedArrivalStreet = repairedArrivalWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const repairedArrivalInterior = repairedArrivalWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const repairedReturnSpawn = repairedArrivalStreet?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
  );
  const repairedInteriorSpawn = repairedArrivalInterior?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
  ok(
    "hydration restores door-relative house arrivals without deleting custom spawns",
    repairedReturnSpawn?.cell[0] === LONELY_STREET_PORCH_CELL[0] &&
      repairedReturnSpawn.cell[1] === LONELY_STREET_PORCH_CELL[1] &&
      repairedReturnSpawn.facing[0] === -1 &&
      repairedReturnSpawn.facing[1] === 0 &&
      repairedInteriorSpawn?.cell[0] === -3 &&
      repairedInteriorSpawn.cell[1] === 2 &&
      repairedInteriorSpawn.facing[0] === 1 &&
      repairedInteriorSpawn.facing[1] === 0 &&
      repairedArrivalStreet?.spawns.some(
        (spawn) => spawn.id === "custom_street_spawn",
      ) === true &&
      repairedArrivalStreet.exits[0]?.target_spawn_id ===
        LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID &&
      repairedArrivalInterior?.exits[0]?.target_spawn_id ===
        LONELY_STREET_RETURN_SPAWN_ID &&
      repairedArrivalInterior.ambient_light ===
        LONELY_STREET_HOUSE_INTERIOR_MAP.ambient_light,
  );
  const customizedArrivalWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const customizedArrivalStreet = customizedArrivalWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const customizedArrivalInterior = customizedArrivalWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const customizedReturnSpawn = customizedArrivalStreet?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
  );
  const customizedInteriorSpawn = customizedArrivalInterior?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
  if (customizedReturnSpawn) {
    customizedReturnSpawn.cell = [2, -70];
    customizedReturnSpawn.facing = [0, 1];
  }
  if (customizedInteriorSpawn) {
    customizedInteriorSpawn.cell = [-2, 1];
    customizedInteriorSpawn.facing = [0, -1];
  }
  if (customizedArrivalStreet?.exits[0]) {
    customizedArrivalStreet.exits[0].target_spawn_id = "custom_house_arrival";
  }
  if (customizedArrivalInterior?.exits[0]) {
    customizedArrivalInterior.exits[0].target_spawn_id =
      "custom_street_arrival";
    customizedArrivalInterior.ambient_light = 0;
  }
  const preservedCustomizedArrivals = refreshBundledEnginePackage(
    customizedArrivalWorkspace,
  );
  const preservedCustomizedStreet = preservedCustomizedArrivals.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const preservedCustomizedInterior = preservedCustomizedArrivals.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const preservedReturnSpawn = preservedCustomizedStreet?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
  );
  const preservedInteriorSpawn = preservedCustomizedInterior?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
  ok(
    "hydration preserves author-moved door arrivals, custom routes, and intentional darkness",
    preservedReturnSpawn?.cell[0] === 2 &&
      preservedReturnSpawn.cell[1] === -70 &&
      preservedReturnSpawn.facing[0] === 0 &&
      preservedReturnSpawn.facing[1] === 1 &&
      preservedInteriorSpawn?.cell[0] === -2 &&
      preservedInteriorSpawn.cell[1] === 1 &&
      preservedCustomizedStreet?.exits[0]?.target_spawn_id ===
        "custom_house_arrival" &&
      preservedCustomizedInterior?.exits[0]?.target_spawn_id ===
        "custom_street_arrival" &&
      preservedCustomizedInterior.ambient_light === 0,
  );
  const legacyInteriorLightsWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const interiorLightOffsets = new Map<string, number>([
    [LONELY_STREET_INTERIOR_TABLE_LAMP_OBJECT_ID, 0.54],
    [LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID, -0.25],
    [LONELY_STREET_INTERIOR_TASK_LIGHT_OBJECT_ID, 0],
  ]);
  legacyInteriorLightsWorkspace.object_library.forEach((object) => {
    if (!interiorLightOffsets.has(object.id) || !object.light_source) return;
    object.light_source.source_height_offset = undefined;
  });
  const repairedInteriorLightsWorkspace = refreshBundledEnginePackage(
    legacyInteriorLightsWorkspace,
  );
  ok(
    "hydration aligns legacy bundled house emitters with their visible fixtures",
    [...interiorLightOffsets].every(([objectId, expectedOffset]) => {
      const object = repairedInteriorLightsWorkspace.object_library.find(
        (candidate) => candidate.id === objectId,
      );
      return object?.light_source?.source_height_offset === expectedOffset;
    }),
  );
  const customInteriorLightWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const customInteriorLight = customInteriorLightWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
  );
  if (customInteriorLight?.light_source) {
    customInteriorLight.light_source.intensity = 0.33;
    customInteriorLight.light_source.source_height_offset = undefined;
  }
  const preservedCustomInteriorLightWorkspace = refreshBundledEnginePackage(
    customInteriorLightWorkspace,
  );
  const preservedCustomInteriorLight =
    preservedCustomInteriorLightWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
    );
  ok(
    "hydration preserves a customized house-light profile",
    preservedCustomInteriorLight?.light_source?.intensity === 0.33 &&
      preservedCustomInteriorLight.light_source.source_height_offset ===
        undefined,
  );
  const legacyInteriorWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const legacyInteriorIndex = legacyInteriorWorkspace.maps.findIndex(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (legacyInteriorIndex >= 0) {
    const legacyInterior = structuredClone(LONELY_STREET_HOUSE_INTERIOR_MAP);
    legacyInterior.width = 9;
    legacyInterior.cells = legacyInterior.cells.filter(
      (mapCell) => mapCell.x >= -4,
    );
    legacyInteriorWorkspace.maps[legacyInteriorIndex] = legacyInterior;
  }
  const refreshedInteriorWorkspace = refreshBundledEnginePackage(
    legacyInteriorWorkspace,
  );
  const refreshedInteriorMap = refreshedInteriorWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  ok(
    "hydration upgrades the untouched nine-cell house draft with exterior door clearance",
    refreshedInteriorMap?.width === LONELY_STREET_HOUSE_INTERIOR_MAP.width &&
      refreshedInteriorMap.cells.length ===
        LONELY_STREET_HOUSE_INTERIOR_MAP.cells.length &&
      refreshedInteriorMap.cells.some(
        (mapCell) => mapCell.x === -5 && mapCell.z === 1 && mapCell.walkable,
      ),
  );
  const legacyLampWorkspace = structuredClone(backfilledLonelyStreetWorkspace);
  const legacyLampInterior = legacyLampWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (legacyLampInterior) {
    legacyLampInterior.custom_object_placements =
      legacyLampInterior.custom_object_placements.map((placement) =>
        placement.id === "lonely_street_interior_side_table" ||
        placement.id === "lonely_street_interior_table_lamp"
          ? { ...placement, cell: [-3, 0] }
          : placement,
      );
  }
  const refreshedLampWorkspace =
    refreshBundledEnginePackage(legacyLampWorkspace);
  const refreshedLampInterior = refreshedLampWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  ok(
    "hydration separates the legacy table lamp grouping from the sofa",
    [
      "lonely_street_interior_side_table",
      "lonely_street_interior_table_lamp",
    ].every((placementId) => {
      const placement = refreshedLampInterior?.custom_object_placements.find(
        (candidate) => candidate.id === placementId,
      );
      return placement?.cell[0] === -3 && placement.cell[1] === -1;
    }),
  );
  const displacedCoffeeTableWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const displacedCoffeeTableInterior = displacedCoffeeTableWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const displacedCoffeeTablePlacement =
    displacedCoffeeTableInterior?.custom_object_placements.find(
      (placement) =>
        placement.id === "lonely_street_interior_coffee_table",
    );
  if (displacedCoffeeTablePlacement) {
    displacedCoffeeTablePlacement.cell = [0, 2];
    delete displacedCoffeeTablePlacement.fine_offset;
  }
  const refreshedCoffeeTableWorkspace = refreshBundledEnginePackage(
    displacedCoffeeTableWorkspace,
  );
  const refreshedCoffeeTablePlacement = refreshedCoffeeTableWorkspace.maps
    .find((map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
    ?.custom_object_placements.find(
      (placement) =>
        placement.id === "lonely_street_interior_coffee_table",
    );
  ok(
    "hydration reunites the displaced coffee table with its authored clutter",
    refreshedCoffeeTablePlacement?.cell[0] === 0 &&
      refreshedCoffeeTablePlacement.cell[1] === 1 &&
      refreshedCoffeeTablePlacement.fine_offset?.[0] === 0 &&
      refreshedCoffeeTablePlacement.fine_offset?.[1] === -1,
  );
  // A package saved before the fitted-collision revision: strip the revision
  // tag and the fitted shapes it marks, exactly as an older workspace holds it.
  const legacyFurnitureCollisionWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  for (const object of legacyFurnitureCollisionWorkspace.object_library) {
    if (!object.tags?.includes(LONELY_STREET_INTERIOR_COLLISION_REVISION)) {
      continue;
    }
    object.tags = object.tags.filter(
      (tag) => tag !== LONELY_STREET_INTERIOR_COLLISION_REVISION,
    );
    if (
      object.id === LONELY_STREET_INTERIOR_SOFA_OBJECT_ID ||
      object.id === LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID
    ) {
      delete object.collision?.fine_footprint;
    }
    if (object.id === LONELY_STREET_INTERIOR_SHELL_OBJECT_ID && object.asset) {
      object.asset.scale = [1, 1, 1];
    }
  }
  const refreshedFurnitureCollisionWorkspace = refreshBundledEnginePackage(
    legacyFurnitureCollisionWorkspace,
  );
  const refreshedInteriorObject = (id: string) =>
    refreshedFurnitureCollisionWorkspace.object_library.find(
      (object) => object.id === id,
    );
  ok(
    "hydration replaces the sofa's oversized macro collision with a fitted footprint",
    // 2.56 x 1.03 m -> 7 x 3 fine cells.
    refreshedInteriorObject(LONELY_STREET_INTERIOR_SOFA_OBJECT_ID)?.collision
      ?.fine_footprint?.length === 21,
  );
  ok(
    "hydration replaces the coffee table's oversized macro collision with a fitted footprint",
    // 1.55 x 0.72 m -> 5 x 3 fine cells, centred on the placement cell. The
    // superseded 5x2 shape had no centre row and sat 0.17 m south of the model.
    refreshedInteriorObject(LONELY_STREET_INTERIOR_COFFEE_TABLE_OBJECT_ID)
      ?.collision?.fine_footprint?.length === 15,
  );
  ok(
    "hydration restores the shell scale that puts its walls on the walkable grid",
    refreshedInteriorObject(LONELY_STREET_INTERIOR_SHELL_OBJECT_ID)?.asset
      ?.scale?.[0] === 0.875,
  );
  const customizedLegacyInteriorWorkspace = structuredClone(
    legacyInteriorWorkspace,
  );
  const customizedLegacyInterior = customizedLegacyInteriorWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  if (customizedLegacyInterior) {
    customizedLegacyInterior.display_name = "My Customized House";
  }
  const preservedLegacyInteriorWorkspace = refreshBundledEnginePackage(
    customizedLegacyInteriorWorkspace,
  );
  ok(
    "hydration preserves a user-customized legacy-shaped house interior",
    preservedLegacyInteriorWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    )?.display_name === "My Customized House",
  );
  const bundledStreetTrees =
    bundledLonelyStreet?.custom_object_placements.filter((placement) =>
      placement.id.startsWith("lonely_street_tree_"),
    ) || [];
  ok(
    "Lonely Street keeps a continuous inner forest wall while omitting hidden outer rows",
    bundledStreetTrees.length >= 240 &&
      bundledStreetTrees.length <= 300 &&
      bundledStreetTrees.some(
        (placement) => placement.cell[0] === -6 && placement.cell[1] === 0,
      ) &&
      bundledStreetTrees.some(
        (placement) => placement.cell[0] === 6 && placement.cell[1] === 0,
      ) &&
      !bundledStreetTrees.some(
        (placement) => placement.id === "lonely_street_tree_-8_1",
      ) &&
      !bundledStreetTrees.some(
        (placement) =>
          Math.abs(placement.cell[0]) >= 7 && placement.cell[1] > -80,
      ),
  );
  const denseStreetWorkspace = structuredClone(backfilledLonelyStreetWorkspace);
  const denseStreetMap = denseStreetWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  denseStreetMap?.custom_object_placements.push(
    {
      id: "lonely_street_tree_-8_1",
      object_id: LONELY_STREET_TREE_OBJECT_ID,
      cell: [-8, 1],
      facing: [-1, 0],
      collision_mode: "inherit",
    },
    {
      id: "lonely_street_tree_8_1",
      object_id: LONELY_STREET_TREE_OBJECT_ID,
      cell: [8, 1],
      facing: [0, 1],
      collision_mode: "inherit",
    },
  );
  const thinnedStreetWorkspace =
    refreshBundledEnginePackage(denseStreetWorkspace);
  const thinnedStreetPlacements =
    thinnedStreetWorkspace.maps.find((map) => map.id === LONELY_STREET_MAP_ID)
      ?.custom_object_placements || [];
  ok(
    "hydration prunes deprecated bundled outer trees but preserves customized placements",
    !thinnedStreetPlacements.some(
      (placement) => placement.id === "lonely_street_tree_-8_1",
    ) &&
      thinnedStreetPlacements.some(
        (placement) => placement.id === "lonely_street_tree_8_1",
      ),
  );
  const installPreviousProceduralStreetTree = (tree: ObjectData) => {
    tree.display_name = "Lonely Street Pine";
    tree.model_kind = "parts";
    tree.bounds = [1.7, 4.35, 1.7];
    tree.materials = ["#49382b", "#0d291f", "#102f24", "#173d2c", "#1d4932"];
    tree.parts = [
      {
        shape: "cylinder",
        name: "trunk",
        position: [0.14, 1.05, 0.18],
        rotation: [0, 0, 0],
        size: [0.24, 2.1, 0.24],
        material: "#49382b",
      },
      {
        shape: "cone",
        name: "low_skirt",
        position: [0.14, 1.48, 0.18],
        rotation: [0, 0, 0],
        size: [1.5, 1.62, 1.5],
        material: "#0d291f",
      },
      {
        shape: "cone",
        name: "lower_needles",
        position: [0.1, 2.08, 0.2],
        rotation: [0, 0, 0],
        size: [1.34, 1.82, 1.34],
        material: "#102f24",
      },
      {
        shape: "cone",
        name: "middle_needles",
        position: [0.18, 2.88, 0.14],
        rotation: [0, 0, 0],
        size: [1.04, 1.6, 1.04],
        material: "#173d2c",
      },
      {
        shape: "cone",
        name: "upper_needles",
        position: [0.08, 3.64, 0.2],
        rotation: [0, 0, 0],
        size: [0.68, 1.34, 0.68],
        material: "#1d4932",
      },
    ];
    delete tree.asset;
  };
  const previousStreetTreeWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const previousStreetTree = previousStreetTreeWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
  );
  if (previousStreetTree)
    installPreviousProceduralStreetTree(previousStreetTree);
  const refreshedPreviousStreetTree = refreshBundledEnginePackage(
    previousStreetTreeWorkspace,
  ).object_library.find((object) => object.id === LONELY_STREET_TREE_OBJECT_ID);
  ok(
    "hydration upgrades the previous five-part street pine to the autumn GLB",
    refreshedPreviousStreetTree?.model_kind === "asset" &&
      refreshedPreviousStreetTree.asset?.data_url ===
        "/models/environment/autumn-tree.glb" &&
      refreshedPreviousStreetTree.tags.includes("static_asset_instance") &&
      refreshedPreviousStreetTree.parts.length === 0,
  );
  const legacyStreetTreeWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const legacyStreetTree = legacyStreetTreeWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
  );
  if (legacyStreetTree) {
    installPreviousProceduralStreetTree(legacyStreetTree);
    legacyStreetTree.bounds = [1.2, 4.35, 1.2];
    legacyStreetTree.parts = legacyStreetTree.parts
      .filter((part) => part.name !== "low_skirt")
      .map((part, index) => ({
        ...part,
        position:
          index === 2
            ? [0.02, part.position[1], -0.02]
            : index === 3
              ? [-0.02, part.position[1], 0.01]
              : [0, part.position[1], 0],
      }));
    legacyStreetTree.materials = legacyStreetTree.parts.map(
      (part) => part.material,
    );
  }
  const refreshedStreetTreeWorkspace = refreshBundledEnginePackage(
    legacyStreetTreeWorkspace,
  );
  const refreshedStreetTree = refreshedStreetTreeWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
  );
  ok(
    "hydration refreshes only the legacy centered four-part street pine",
    refreshedStreetTree?.model_kind === "asset" &&
      refreshedStreetTree.asset?.data_url ===
        "/models/environment/autumn-tree.glb" &&
      refreshedStreetTree.tags.includes("static_asset_instance") &&
      refreshedStreetTree.parts.length === 0,
  );
  const customizedStreetTreeWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const customizedStreetTree =
    customizedStreetTreeWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
    );
  if (customizedStreetTree) {
    installPreviousProceduralStreetTree(customizedStreetTree);
    customizedStreetTree.bounds = [1.71, 4.35, 1.7];
    customizedStreetTree.parts[0]!.position = [0.15, 1.05, 0.18];
  }
  const preservedCustomStreetTreeWorkspace = refreshBundledEnginePackage(
    customizedStreetTreeWorkspace,
  );
  const preservedCustomStreetTree =
    preservedCustomStreetTreeWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
    );
  ok(
    "hydration preserves a user-resized street pine instead of treating it as bundled",
    preservedCustomStreetTree?.model_kind === "parts" &&
      preservedCustomStreetTree.parts.length === 5 &&
      preservedCustomStreetTree.bounds[0] === 1.71 &&
      preservedCustomStreetTree.parts.some(
        (part) => Number(part.position[0]) === 0.15,
      ) === true &&
      preservedCustomStreetTree.asset === undefined,
  );
  const legacyStreetWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const legacyStreetMap = legacyStreetWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const legacyStreetHousePlacement =
    legacyStreetMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  if (legacyStreetMap && legacyStreetHousePlacement) {
    legacyStreetMap.display_name = "User-named Lonely Street";
    legacyStreetMap.width = 17;
    legacyStreetMap.height = 55;
    legacyStreetMap.cells = legacyStreetMap.cells.filter(
      (mapCell) => mapCell.z >= -27,
    );
    legacyStreetHousePlacement.cell = [0, -23];
    legacyStreetHousePlacement.facing = [0, 1];
    legacyStreetMap.custom_object_placements.push({
      id: "street_custom_sentinel",
      object_id: LONELY_STREET_ASPHALT_OBJECT_ID,
      cell: [0, 0],
      facing: [0, 1],
      collision_mode: "none",
    });
  }
  const legacyStreetHouseObject = legacyStreetWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
  );
  legacyStreetHouseObject?.parts.forEach((part) => {
    if (part.name === "left_roof_slope") part.rotation = [0, 0, -0.48];
    if (part.name === "right_roof_slope") part.rotation = [0, 0, 0.48];
  });
  const correctedStreetWorkspace = refreshBundledEnginePackage(
    legacyStreetWorkspace,
  );
  const correctedStreetMap = correctedStreetWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const correctedStreetHouse =
    correctedStreetMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  const correctedStreetHouseObject =
    correctedStreetWorkspace.object_library.find(
      (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
    );
  ok(
    "hydration lengthens and rotates the legacy bundled street while preserving user additions",
    correctedStreetMap?.display_name === "User-named Lonely Street" &&
      correctedStreetMap.width === 17 &&
      correctedStreetMap.height === LONELY_STREET_MAP.height &&
      correctedStreetMap.cells.length === 1870 &&
      correctedStreetHouse?.cell[0] === LONELY_STREET_HOUSE_CELL[0] &&
      correctedStreetHouse.cell[1] === LONELY_STREET_HOUSE_CELL[1] &&
      correctedStreetHouse.facing[0] === -1 &&
      correctedStreetHouse.facing[1] === 0 &&
      correctedStreetMap.custom_object_placements.some(
        (placement) => placement.id === "street_custom_sentinel",
      ),
  );
  ok(
    "hydration repairs the inverted roof on the legacy bundled house",
    Number(
      correctedStreetHouseObject?.parts.find(
        (part) => part.name === "left_roof_slope",
      )?.rotation[2],
    ) > 0 &&
      Number(
        correctedStreetHouseObject?.parts.find(
          (part) => part.name === "right_roof_slope",
        )?.rotation[2],
      ) < 0,
  );
  const shortRoadsideWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const shortRoadsideMap = shortRoadsideWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const shortRoadsideHouse = shortRoadsideMap?.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_last_house",
  );
  if (shortRoadsideMap && shortRoadsideHouse) {
    shortRoadsideMap.width = 17;
    shortRoadsideMap.height = 55;
    shortRoadsideMap.cells = shortRoadsideMap.cells.filter(
      (mapCell) => mapCell.z >= -27,
    );
    shortRoadsideHouse.cell = [5, -20];
    shortRoadsideHouse.facing = [-1, 0];
  }
  const lengthenedRoadsideWorkspace = refreshBundledEnginePackage(
    shortRoadsideWorkspace,
  );
  const lengthenedRoadsideMap = lengthenedRoadsideWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const lengthenedRoadsideHouse =
    lengthenedRoadsideMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  ok(
    "hydration lengthens the first roadside revision and moves its house toward the new end",
    lengthenedRoadsideMap?.height === LONELY_STREET_MAP.height &&
      lengthenedRoadsideMap.cells.length === 1870 &&
      lengthenedRoadsideHouse?.cell[0] === LONELY_STREET_HOUSE_CELL[0] &&
      lengthenedRoadsideHouse.cell[1] === LONELY_STREET_HOUSE_CELL[1] &&
      lengthenedRoadsideHouse.facing[0] === -1 &&
      lengthenedRoadsideHouse.facing[1] === 0,
  );
  const previousLongStreetWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const previousLongStreetMap = previousLongStreetWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const previousLongStreetHouse =
    previousLongStreetMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  if (previousLongStreetMap && previousLongStreetHouse) {
    previousLongStreetHouse.cell = [5, -75];
    const userEditedCell = previousLongStreetMap.cells.find(
      (mapCell) => mapCell.x === 0 && mapCell.z === -50,
    );
    if (userEditedCell) {
      userEditedCell.tag = "user_cell_sentinel";
      userEditedCell.visual_height = 0.33;
    }
    previousLongStreetMap.custom_object_placements.push({
      id: "street_long_custom_sentinel",
      object_id: LONELY_STREET_ASPHALT_OBJECT_ID,
      cell: [1, -50],
      facing: [0, 1],
      collision_mode: "none",
    });
  }
  const movedLongStreetWorkspace = refreshBundledEnginePackage(
    previousLongStreetWorkspace,
  );
  const movedLongStreetMap = movedLongStreetWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const movedLongStreetHouse =
    movedLongStreetMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  ok(
    "hydration moves the previous long-street house two cells into the trees",
    movedLongStreetHouse?.cell[0] === LONELY_STREET_HOUSE_CELL[0] &&
      movedLongStreetHouse.cell[1] === LONELY_STREET_HOUSE_CELL[1] &&
      movedLongStreetMap?.cells.some(
        (mapCell) =>
          mapCell.x === 0 &&
          mapCell.z === -50 &&
          mapCell.tag === "user_cell_sentinel" &&
          mapCell.visual_height === 0.33,
      ) === true &&
      movedLongStreetMap?.custom_object_placements.some(
        (placement) => placement.id === "street_long_custom_sentinel",
      ) === true,
  );
  const solidHouseWorkspace = structuredClone(backfilledLonelyStreetWorkspace);
  const solidHouseMap = solidHouseWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  for (const mapCell of solidHouseMap?.cells || []) {
    if (
      mapCell.z === LONELY_STREET_PORCH_CELL[1] &&
      mapCell.x === LONELY_STREET_PORCH_CELL[0]
    ) {
      mapCell.visual_height = 0;
    }
    if (
      mapCell.z === LONELY_STREET_DOORWAY_CELL[1] &&
      (mapCell.x === LONELY_STREET_DOORWAY_CELL[0] ||
        mapCell.x === LONELY_STREET_INTERIOR_CELL[0])
    ) {
      mapCell.walkable = false;
      mapCell.blocks_los = true;
      mapCell.visual_height = 0;
    }
  }
  const solidHouseObject = solidHouseWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
  );
  if (solidHouseObject) {
    const foundation = solidHouseObject.parts.find(
      (part) => part.name === "foundation",
    );
    solidHouseObject.parts = [
      ...(foundation
        ? [
            {
              ...foundation,
              name: "house_body",
              position: [0, 1.52, 0] as [number, number, number],
              size: [4.8, 2.8, 3.25] as [number, number, number],
            },
          ]
        : []),
      ...solidHouseObject.parts.filter(
        (part) =>
          part.name === "left_roof_slope" || part.name === "right_roof_slope",
      ),
    ];
    solidHouseObject.collision = {
      profile: "custom_footprint",
      footprint: [
        [-2, -1],
        [-1, -1],
        [0, -1],
        [1, -1],
        [2, -1],
        [-2, 0],
        [-1, 0],
        [0, 0],
        [1, 0],
        [2, 0],
        [-2, 1],
        [-1, 1],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    };
  }
  const traversableHouseWorkspace =
    refreshBundledEnginePackage(solidHouseWorkspace);
  const traversableHouseMap = traversableHouseWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const traversableHouseObject = traversableHouseWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
  );
  const traversableCellAt = (x: number, z: number) =>
    traversableHouseMap?.cells.find(
      (mapCell) => mapCell.x === x && mapCell.z === z,
    );
  ok(
    "hydration replaces the legacy solid house with its walkable stepped doorway",
    traversableCellAt(...LONELY_STREET_PORCH_CELL)?.visual_height === 0.76 &&
      traversableCellAt(...LONELY_STREET_DOORWAY_CELL)?.walkable === true &&
      traversableCellAt(...LONELY_STREET_DOORWAY_CELL)?.blocks_los === false &&
      traversableCellAt(...LONELY_STREET_DOORWAY_CELL)?.visual_height ===
        0.52 &&
      traversableCellAt(...LONELY_STREET_INTERIOR_CELL)?.walkable === true &&
      traversableCellAt(...LONELY_STREET_INTERIOR_CELL)?.blocks_los === false &&
      traversableHouseObject?.parts.some(
        (part) => part.name === "back_wall",
      ) === true &&
      !traversableHouseObject?.parts.some(
        (part) => part.name === "house_body",
      ) &&
      traversableHouseObject?.collision?.footprint.length === 13,
  );
  const centerOnlyPorchWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const centerOnlyPorchMap = centerOnlyPorchWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const centerOnlyPorchHouse =
    centerOnlyPorchMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  const centerOnlyPorchDoor = centerOnlyPorchMap?.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_front_door",
  );
  if (centerOnlyPorchMap && centerOnlyPorchHouse && centerOnlyPorchDoor) {
    delete centerOnlyPorchHouse.height_offset;
    centerOnlyPorchDoor.object_id = "obj_p_door";
    delete centerOnlyPorchDoor.height_offset;
    for (const z of [-76, -74]) {
      const sideSurface = centerOnlyPorchMap.cells.find(
        (mapCell) =>
          mapCell.x === LONELY_STREET_PORCH_CELL[0] && mapCell.z === z,
      );
      if (sideSurface) {
        sideSurface.walkable = true;
        sideSurface.visual_height = 0;
      }
    }
    const userCell = centerOnlyPorchMap.cells.find(
      (mapCell) => mapCell.x === 0 && mapCell.z === -50,
    );
    if (userCell) userCell.tag = "porch_revision_user_cell";
    centerOnlyPorchMap.custom_object_placements.push({
      id: "porch_revision_user_placement",
      object_id: LONELY_STREET_ASPHALT_OBJECT_ID,
      cell: [1, -50],
      facing: [0, 1],
      collision_mode: "none",
    });
  }
  centerOnlyPorchWorkspace.object_library =
    centerOnlyPorchWorkspace.object_library.filter(
      (object) => object.id !== LONELY_STREET_FRONT_DOOR_OBJECT_ID,
    );
  const repairedCenterOnlyPorchWorkspace = refreshBundledEnginePackage(
    centerOnlyPorchWorkspace,
  );
  const repairedCenterOnlyPorchMap = repairedCenterOnlyPorchWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const repairedCenterOnlyCellAt = (x: number, z: number) =>
    repairedCenterOnlyPorchMap?.cells.find(
      (mapCell) => mapCell.x === x && mapCell.z === z,
    );
  const repairedCenterOnlyHouse =
    repairedCenterOnlyPorchMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  const repairedCenterOnlyDoor =
    repairedCenterOnlyPorchMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_front_door",
    );
  ok(
    "hydration repairs the center-only porch revision without replacing unrelated authored content",
    [-76, -75, -74].every(
      (z) =>
        repairedCenterOnlyCellAt(LONELY_STREET_PORCH_CELL[0], z)?.walkable ===
          true &&
        repairedCenterOnlyCellAt(LONELY_STREET_PORCH_CELL[0], z)
          ?.visual_height === 0.76,
    ) &&
      repairedCenterOnlyHouse?.height_offset === -0.26 &&
      repairedCenterOnlyDoor?.object_id ===
        LONELY_STREET_FRONT_DOOR_OBJECT_ID &&
      repairedCenterOnlyDoor.height_offset === 0.03 &&
      repairedCenterOnlyPorchWorkspace.object_library.some(
        (object) => object.id === LONELY_STREET_FRONT_DOOR_OBJECT_ID,
      ) &&
      repairedCenterOnlyCellAt(0, -50)?.tag === "porch_revision_user_cell" &&
      repairedCenterOnlyPorchMap?.custom_object_placements.some(
        (placement) => placement.id === "porch_revision_user_placement",
      ) === true,
  );
  const customizedPorchWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const customizedPorchMap = customizedPorchWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const customizedPorchHouse =
    customizedPorchMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    );
  const customizedSideSurface = customizedPorchMap?.cells.find(
    (mapCell) => mapCell.x === LONELY_STREET_PORCH_CELL[0] && mapCell.z === -76,
  );
  if (customizedPorchHouse && customizedSideSurface) {
    customizedPorchHouse.height_offset = -0.11;
    customizedSideSurface.visual_height = 0.22;
    customizedSideSurface.tag = "authored_custom_porch";
  }
  const preservedCustomizedPorchWorkspace = refreshBundledEnginePackage(
    customizedPorchWorkspace,
  );
  const preservedCustomizedPorchMap =
    preservedCustomizedPorchWorkspace.maps.find(
      (map) => map.id === LONELY_STREET_MAP_ID,
    );
  ok(
    "hydration leaves an authored custom porch revision untouched",
    preservedCustomizedPorchMap?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    )?.height_offset === -0.11 &&
      preservedCustomizedPorchMap?.cells.find(
        (mapCell) =>
          mapCell.x === LONELY_STREET_PORCH_CELL[0] && mapCell.z === -76,
      )?.visual_height === 0.22 &&
      preservedCustomizedPorchMap?.cells.find(
        (mapCell) =>
          mapCell.x === LONELY_STREET_PORCH_CELL[0] && mapCell.z === -76,
      )?.tag === "authored_custom_porch",
  );
  const externalProjectPorchWorkspace = structuredClone(
    centerOnlyPorchWorkspace,
  );
  externalProjectPorchWorkspace.metadata.title = "Player-authored street";
  const preservedExternalProject = refreshBundledEnginePackage(
    externalProjectPorchWorkspace,
  );
  const preservedExternalStreet = preservedExternalProject.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  ok(
    "hydration never backfills the porch or door into a non-bundled project",
    preservedExternalStreet?.custom_object_placements.find(
      (placement) => placement.id === "lonely_street_last_house",
    )?.height_offset === undefined &&
      preservedExternalStreet?.custom_object_placements.find(
        (placement) => placement.id === "lonely_street_front_door",
      )?.object_id === "obj_p_door" &&
      preservedExternalStreet?.cells.find(
        (mapCell) =>
          mapCell.x === LONELY_STREET_PORCH_CELL[0] && mapCell.z === -76,
      )?.visual_height === 0,
  );
  const legacyDoorRouteWorkspace = structuredClone(
    backfilledLonelyStreetWorkspace,
  );
  const legacyDoorRouteStreet = legacyDoorRouteWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const legacyDoorRouteBackrooms = legacyDoorRouteWorkspace.maps.find(
    (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
  );
  const legacyDoorRouteHouse = legacyDoorRouteWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
  );
  if (legacyDoorRouteStreet) {
    legacyDoorRouteStreet.custom_object_placements =
      legacyDoorRouteStreet.custom_object_placements.filter(
        (placement) => placement.id !== "lonely_street_front_door",
      );
    legacyDoorRouteStreet.exits = legacyDoorRouteStreet.exits.map(
      (mapExit) => ({
        ...mapExit,
        target_map_id: PHASE_11_HUB_MAP_ID,
        target_spawn_id: PHASE_11_HUB_SPAWN_ID,
      }),
    );
  }
  if (legacyDoorRouteBackrooms && legacyDoorRouteStreet?.exits[0]) {
    legacyDoorRouteBackrooms.exits = [
      {
        ...legacyDoorRouteStreet.exits[0],
        id: "legacy_backrooms_to_qa",
        cell: [0, 16],
        target_map_id: PHASE_11_HUB_MAP_ID,
        target_spawn_id: PHASE_11_HUB_SPAWN_ID,
      },
    ];
    for (const mapCell of legacyDoorRouteBackrooms.cells) {
      if (mapCell.z === 16 && Math.abs(mapCell.x) <= 1) {
        mapCell.walkable = true;
        mapCell.blocks_los = false;
        mapCell.height = 0;
        mapCell.visual_height = 0;
        mapCell.object_id = BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID;
      }
    }
  }
  if (legacyDoorRouteHouse?.parts[0]) {
    legacyDoorRouteHouse.parts.push({
      ...structuredClone(legacyDoorRouteHouse.parts[0]),
      name: "open_front_door",
    });
  }
  const repairedDoorRouteWorkspace = refreshBundledEnginePackage(
    legacyDoorRouteWorkspace,
  );
  const repairedDoorRouteStreet = repairedDoorRouteWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const repairedDoorRouteBackrooms = repairedDoorRouteWorkspace.maps.find(
    (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
  );
  const repairedDoorRouteInterior = repairedDoorRouteWorkspace.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const repairedDoorRouteHouse = repairedDoorRouteWorkspace.object_library.find(
    (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
  );
  ok(
    "hydration closes the legacy street door, installs the house interior route, and removes the old Backrooms QA threshold",
    repairedDoorRouteStreet?.custom_object_placements.some(
      (placement) =>
        placement.id === "lonely_street_front_door" &&
        placement.object_id === LONELY_STREET_FRONT_DOOR_OBJECT_ID &&
        placement.cell[0] === LONELY_STREET_DOORWAY_CELL[0] &&
        placement.cell[1] === LONELY_STREET_DOORWAY_CELL[1],
    ) === true &&
      repairedDoorRouteStreet.exits.length === 1 &&
      repairedDoorRouteStreet.exits[0]?.target_map_id ===
        LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      repairedDoorRouteStreet.exits[0]?.target_spawn_id ===
        LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID &&
      repairedDoorRouteInterior?.exits.some(
        (mapExit) =>
          mapExit.target_map_id === LONELY_STREET_MAP_ID &&
          mapExit.target_spawn_id === LONELY_STREET_RETURN_SPAWN_ID,
      ) === true &&
      !repairedDoorRouteHouse?.parts.some(
        (part) => part.name === "open_front_door",
      ) &&
      repairedDoorRouteBackrooms?.exits.some(
        (mapExit) => mapExit.target_map_id === PHASE_11_HUB_MAP_ID,
      ) === false &&
      repairedDoorRouteBackrooms?.cells
        .filter((mapCell) => mapCell.z === 16 && Math.abs(mapCell.x) <= 1)
        .every(
          (mapCell) =>
            !mapCell.walkable &&
            mapCell.blocks_los &&
            mapCell.object_id === BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
        ) === true,
    JSON.stringify({
      door: repairedDoorRouteStreet?.custom_object_placements.filter(
        (placement) => placement.id === "lonely_street_front_door",
      ),
      streetExits: repairedDoorRouteStreet?.exits,
      interiorExits: repairedDoorRouteInterior?.exits,
      hasOpenDoorPart: repairedDoorRouteHouse?.parts.some(
        (part) => part.name === "open_front_door",
      ),
      backroomsExits: repairedDoorRouteBackrooms?.exits,
      boundary: repairedDoorRouteBackrooms?.cells
        .filter((mapCell) => mapCell.z === 16 && Math.abs(mapCell.x) <= 1)
        .map((mapCell) => ({
          x: mapCell.x,
          walkable: mapCell.walkable,
          blocks_los: mapCell.blocks_los,
          object_id: mapCell.object_id,
        })),
    }),
  );
  const staleHunterPackage = {
    ...editedQaPackage,
    maps: editedQaPackage.maps.map((map) =>
      map.id === BACKROOMS_LEVEL_ZERO_MAP_ID
        ? {
            ...map,
            combat_mode: undefined,
            fine_cell_overrides: undefined,
          }
        : map,
    ),
    entities: editedQaPackage.entities.map((entity) =>
      entity.id === BACKROOMS_PARASITE_ENTITY_ID
        ? {
            ...entity,
            horror_combat: undefined,
            independent_movement: {
              ...entity.independent_movement!,
              interval_ms: 650,
            },
            sensory_profile: {
              ...entity.sensory_profile!,
              channels: entity.sensory_profile!.channels.map((channel) =>
                channel.stimulus_kinds.includes("visible_player")
                  ? { ...channel, range: 8 }
                  : channel,
              ),
            },
          }
        : entity,
    ),
  };
  const refreshedHunterWorkspace =
    refreshBundledEnginePackage(staleHunterPackage);
  const refreshedHunter = refreshedHunterWorkspace.entities.find(
    (entity) => entity.id === BACKROOMS_PARASITE_ENTITY_ID,
  );
  ok(
    "hydration upgrades an older named Parasite profile to the current real-time hunter",
    refreshedHunter?.independent_movement?.interval_ms === 180 &&
      refreshedHunter.horror_combat?.windup_ms === 500 &&
      refreshedHunter.horror_combat?.active_ms === 120 &&
      refreshedHunter.horror_combat?.recovery_ms === 850 &&
      refreshedHunter.horror_combat?.reach_fine_cells === 2 &&
      refreshedHunter.horror_combat?.lunge_fine_cells === 2 &&
      refreshedHunter.horror_combat?.direction_lock_fraction === 0.6 &&
      refreshedHunter.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("visible_player") &&
          channel.range >= 100,
      ) === true &&
      refreshedHunterWorkspace.maps.find(
        (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
      )?.combat_mode === "horror_realtime" &&
      (refreshedHunterWorkspace.maps.find(
        (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
      )?.fine_cell_overrides?.length || 0) > 0,
  );

  const legacyRileyWorkspace = structuredClone(authored);
  const legacyRileyModel = legacyRileyWorkspace.object_library.find(
    (object) => object.id === RILEY_MODEL_OBJECT_ID,
  );
  const legacyRileyPlacement = legacyRileyWorkspace.maps
    .find((map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
    ?.entity_placements.find(
      (placement) => placement.id === "riley_seated_on_sofa",
    );
  if (legacyRileyModel?.asset) {
    legacyRileyModel.tags = legacyRileyModel.tags.filter(
      (tag) => tag !== RILEY_BUNDLED_ASSET_REVISION,
    );
    legacyRileyModel.asset.animation = {
      clip_name: "Animation",
      autoplay: true,
      loop: "once",
      time_scale: 1,
    };
    legacyRileyModel.asset.animation_clips = [
      { name: "Animation", duration: 0.033, tracks: 147 },
    ];
    legacyRileyModel.asset.stats = {
      ...legacyRileyModel.asset.stats!,
      bytes: 3385256,
    };
  }
  if (legacyRileyPlacement) {
    // Older persisted workspaces predate stable placement IDs. The known
    // bundled sofa pose should still migrate even when its ID was regenerated.
    legacyRileyPlacement.id = "legacy_riley_sofa_placement";
    legacyRileyPlacement.cell = [-2, 1];
    legacyRileyPlacement.presentation_anchor = undefined;
    legacyRileyPlacement.presentation_offset = [-0.57, -0.9];
    legacyRileyPlacement.height_offset = 0.39;
  }
  const legacyRileyEntity = legacyRileyWorkspace.entities.find(
    (entity) => entity.id === RILEY_ENTITY_ID,
  );
  if (legacyRileyEntity) {
    legacyRileyEntity.presentation_fire = undefined;
  }
  const refreshedRileyWorkspace =
    refreshBundledEnginePackage(legacyRileyWorkspace);
  const refreshedRileyModel = refreshedRileyWorkspace.object_library.find(
    (object) => object.id === RILEY_MODEL_OBJECT_ID,
  );
  const refreshedRileyPlacement = refreshedRileyWorkspace.maps
    .find((map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
    ?.entity_placements.find(
      (placement) => placement.id === "riley_seated_on_sofa",
    );
  ok(
    "hydration upgrades the bundled Riley and sunken sofa offset to the contact-locked seated idle",
    refreshedRileyModel?.asset?.animation?.clip_name ===
      RILEY_SEATED_IDLE_CLIP &&
      refreshedRileyModel.asset.animation.loop === "repeat" &&
      refreshedRileyModel.asset.animation_clips?.some(
        (clip) => clip.name === RILEY_SEATED_IDLE_CLIP && clip.tracks === 80,
      ) === true &&
      refreshedRileyModel.tags.includes(RILEY_BUNDLED_ASSET_REVISION) &&
      refreshedRileyModel.asset.scale?.[0] === 2.2 &&
      refreshedRileyModel.asset.stats?.bytes === 3497764 &&
      refreshedRileyPlacement?.cell[0] === RILEY_SOFA_SEATED_CELL[0] &&
      refreshedRileyPlacement?.cell[1] === RILEY_SOFA_SEATED_CELL[1] &&
      refreshedRileyPlacement.presentation_anchor?.object_placement_id ===
        RILEY_SOFA_OBJECT_PLACEMENT_ID &&
      refreshedRileyPlacement.presentation_anchor.local_position.every(
        (value, index) => value === RILEY_SOFA_SEATED_LOCAL_POSITION[index],
      ) &&
      refreshedRileyPlacement.presentation_anchor.local_facing?.every(
        (value, index) => value === RILEY_SOFA_SEATED_LOCAL_FACING[index],
      ) === true &&
      refreshedRileyPlacement.presentation_anchor.lock_to_anchor === true &&
      refreshedRileyPlacement.presentation_anchor.revision ===
        RILEY_SOFA_ANCHOR_REVISION &&
      refreshedRileyPlacement.collision_mode === "none" &&
      refreshedRileyWorkspace.entities.find(
        (entity) => entity.id === RILEY_ENTITY_ID,
      )?.presentation_fire?.light_intensity === 5.4,
  );

  const continuousRileyWorkspace = structuredClone(authored);
  const continuousRileyPlacement = continuousRileyWorkspace.maps
    .find((map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
    ?.entity_placements.find(
      (placement) => placement.entity_id === RILEY_ENTITY_ID,
    );
  if (continuousRileyPlacement) {
    continuousRileyPlacement.id = "free_movement_riley_placement";
    continuousRileyPlacement.cell = [-2.12, 0.28];
    continuousRileyPlacement.presentation_anchor = undefined;
    continuousRileyPlacement.presentation_offset = [0, 0];
    continuousRileyPlacement.height_offset = 0.06;
  }
  const refreshedContinuousRiley = refreshBundledEnginePackage(
    continuousRileyWorkspace,
  )
    .maps.find((map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
    ?.entity_placements.find(
      (placement) => placement.entity_id === RILEY_ENTITY_ID,
    );
  ok(
    "hydration attaches the continuous-movement Riley draft to the sofa anchor",
    refreshedContinuousRiley?.id === RILEY_SOFA_PLACEMENT_ID &&
      refreshedContinuousRiley.presentation_anchor?.object_placement_id ===
        RILEY_SOFA_OBJECT_PLACEMENT_ID &&
      refreshedContinuousRiley.presentation_anchor.local_facing?.every(
        (value, index) => value === RILEY_SOFA_SEATED_LOCAL_FACING[index],
      ) === true &&
      refreshedContinuousRiley.presentation_anchor.lock_to_anchor === true &&
      refreshedContinuousRiley.presentation_anchor.revision ===
        RILEY_SOFA_ANCHOR_REVISION &&
      refreshedContinuousRiley.collision_mode === "none",
  );

  const customPackage = {
    ...defaultPackage,
    metadata: { ...defaultPackage.metadata, version: "custom-version" },
    maps: defaultPackage.maps.slice(0, 1),
  };
  ok(
    "custom workspaces are preserved during hydration",
    refreshBundledEnginePackage(customPackage) === customPackage,
  );

  const mapById = new Map(authored.maps.map((map) => [map.id, map]));
  const dialogueIds = new Set(authored.dialogue.map((d) => d.id));
  const cutsceneIds = new Set(authored.cutscenes.map((c) => c.id));
  const itemIds = new Set(authored.items.map((i) => i.id));
  const skillIds = new Set(authored.abilities.map((s) => s.id));
  const shopIds = new Set(authored.shops.map((s) => s.id));
  const documentIds = new Set(authored.documents.map((d) => d.id));
  const entityIds = new Set(authored.entities.map((e) => e.id));
  const factionIds = new Set(
    (authored.factions as Array<{ id: string }>).map((f) => f.id),
  );
  const endingIds = new Set(
    (authored.endings as Array<{ id: string }>).map((e) => e.id),
  );

  const problems: string[] = [];
  const qaMaps = authored.maps.filter((map) => map.id.startsWith("qa_"));
  const expectedMapIds = new Set(TEST_SUITE_MAP_IDS);

  ok(
    "new games begin at the far end of Breezy Street",
    authored.metadata.start_map_id === BUNDLED_GAME_START_MAP_ID &&
      authored.metadata.start_spawn_id === BUNDLED_GAME_START_SPAWN_ID &&
      mapById.has(authored.metadata.start_map_id),
  );
  const rileyModel = authored.object_library.find(
    (object) => object.id === RILEY_MODEL_OBJECT_ID,
  );
  const rileyEntity = authored.entities.find(
    (entity) => entity.id === RILEY_ENTITY_ID,
  );
  const rileyPlacement = authored.maps
    .find((map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID)
    ?.entity_placements.find(
      (placement) => placement.entity_id === RILEY_ENTITY_ID,
    );
  ok(
    "Riley is a rigged animated NPC seated on the house sofa",
    rileyModel?.asset?.source_type === "glb" &&
      rileyModel.asset.animation?.clip_name === RILEY_SEATED_IDLE_CLIP &&
      rileyModel.asset.animation?.autoplay === true &&
      rileyModel.asset.animation?.loop === "repeat" &&
      rileyModel.asset.animation_clips?.some(
        (clip) => clip.name === RILEY_SEATED_IDLE_CLIP && clip.tracks === 80,
      ) === true &&
      rileyModel.tags.includes(RILEY_BUNDLED_ASSET_REVISION) &&
      rileyModel.asset.scale?.[0] === 2.2 &&
      rileyEntity?.model_object_id === RILEY_MODEL_OBJECT_ID &&
      rileyEntity.dialogue_id === RILEY_DIALOGUE_ID &&
      rileyPlacement?.id === "riley_seated_on_sofa" &&
      rileyPlacement.cell[0] === RILEY_SOFA_SEATED_CELL[0] &&
      rileyPlacement.cell[1] === RILEY_SOFA_SEATED_CELL[1] &&
      rileyPlacement.presentation_anchor?.object_placement_id ===
        RILEY_SOFA_OBJECT_PLACEMENT_ID &&
      rileyPlacement.presentation_anchor.local_position.every(
        (value, index) => value === RILEY_SOFA_SEATED_LOCAL_POSITION[index],
      ) &&
      rileyPlacement.presentation_anchor.local_facing?.every(
        (value, index) => value === RILEY_SOFA_SEATED_LOCAL_FACING[index],
      ) === true &&
      rileyPlacement.presentation_anchor.lock_to_anchor === true &&
      rileyPlacement.presentation_anchor.revision ===
        RILEY_SOFA_ANCHOR_REVISION &&
      rileyPlacement.collision_mode === "none" &&
      entityPlacementBlocksMovement(rileyPlacement) === false &&
      rileyEntity.presentation_fill_light?.intensity === 2.35 &&
      rileyEntity.presentation_fill_light.radius === 3.2 &&
      rileyEntity.presentation_fire?.height === 1.68 &&
      rileyEntity.presentation_fire.width === 0.84 &&
      rileyEntity.presentation_fire.spark_count === 20,
  );
  const resolvedRileySeatPose = rileyPlacement
    ? resolveEntityPresentationPose({
        placement: rileyPlacement,
        currentCell: RILEY_SOFA_SEATED_CELL,
        currentFacing: [0, 1],
        standingY: 0,
        anchorWorldPose: { position: [-2, 0.01, 0], rotationY: 0 },
      })
    : undefined;
  ok(
    "furniture-relative entity anchors resolve Riley onto the measured cushion contact",
    resolvedRileySeatPose?.anchored === true &&
      Math.abs(resolvedRileySeatPose.cell[0] - -2.57) < 0.0001 &&
      Math.abs(resolvedRileySeatPose.cell[1] - 0.1) < 0.0001 &&
      Math.abs(resolvedRileySeatPose.y - 0.48) < 0.0001,
  );
  const resolvedRileySeatPoseDuringRuntimeCellRefresh = rileyPlacement
    ? resolveEntityPresentationPose({
        placement: rileyPlacement,
        currentCell: [-1.999, 0.999],
        currentFacing: [1, 0],
        standingY: 0,
        anchorWorldPose: { position: [-2, 0.01, 0], rotationY: 0 },
      })
    : undefined;
  ok(
    "locked furniture anchors keep Riley seated during proximity runtime-cell refreshes",
    resolvedRileySeatPoseDuringRuntimeCellRefresh?.anchored === true &&
      resolvedRileySeatPoseDuringRuntimeCellRefresh.facing?.[0] === 0 &&
      resolvedRileySeatPoseDuringRuntimeCellRefresh.facing?.[1] === 1 &&
      Math.abs(resolvedRileySeatPoseDuringRuntimeCellRefresh.cell[0] - -2.57) <
        0.0001 &&
      Math.abs(resolvedRileySeatPoseDuringRuntimeCellRefresh.cell[1] - 0.1) <
        0.0001 &&
      Math.abs(resolvedRileySeatPoseDuringRuntimeCellRefresh.y - 0.48) < 0.0001,
  );
  const dialogueChainIsComplete = (
    dialogue: GamePackage["dialogue"][number],
  ) =>
    dialogue.nodes.every((node, index) =>
      index === dialogue.nodes.length - 1
        ? !node.options[0]?.next_node_id
        : node.options[0]?.next_node_id === dialogue.nodes[index + 1]?.id,
    );
  ok(
    "Steve's staged couch pose clears the pillow and rests on the front cushion edge",
    STEVE_SOFA_SEATED_LOCAL_POSITION[0] === 0.57 &&
      STEVE_SOFA_SEATED_LOCAL_POSITION[1] === 0.22 &&
      STEVE_SOFA_SEATED_LOCAL_POSITION[2] === 0.5,
  );
  ok(
    "the couch conversation carries every pre-aux and post-song beat in order",
    HOUSE_ARRIVAL_COUCH_DIALOGUE.nodes.length === 10 &&
      dialogueChainIsComplete(HOUSE_ARRIVAL_COUCH_DIALOGUE) &&
      HOUSE_ARRIVAL_COUCH_DIALOGUE.nodes.at(-1)?.text ===
        "*Steve plugs into the aux*" &&
      HOUSE_ARRIVAL_SONG_DIALOGUE.nodes.length === 10 &&
      dialogueChainIsComplete(HOUSE_ARRIVAL_SONG_DIALOGUE) &&
      HOUSE_ARRIVAL_SONG_DIALOGUE.nodes.some(
        (node) => node.text === "I don't know what I sound like anymore.",
      ) &&
      HOUSE_ARRIVAL_SONG_DIALOGUE.nodes.at(-1)?.text === "Hell yeah, Riley",
  );
  const arrivalMusicIndex = HOUSE_ARRIVAL_CUTSCENE.actions.findIndex(
    (action) =>
      action.type === "play_music" &&
      action.music_url === HOUSE_ARRIVAL_SONG_URL,
  );
  const arrivalSongDialogueIndex = HOUSE_ARRIVAL_CUTSCENE.actions.findIndex(
    (action) =>
      action.type === "show_dialogue" &&
      action.dialogue_id === HOUSE_ARRIVAL_SONG_DIALOGUE.id,
  );
  const arrivalTail = HOUSE_ARRIVAL_CUTSCENE.actions.slice(-3);
  ok(
    "crossing into Riley's house stops the Lonely Street opening score",
    HOUSE_ARRIVAL_CUTSCENE.actions[0]?.type === "play_music" &&
      !HOUSE_ARRIVAL_CUTSCENE.actions[0].music_id &&
      !HOUSE_ARRIVAL_CUTSCENE.actions[0].music_url,
  );
  ok(
    "the aux cue plays before the second dialogue and the scene stands and faces Steve before releasing the camera",
    arrivalMusicIndex >= 0 &&
      arrivalSongDialogueIndex === arrivalMusicIndex + 1 &&
      arrivalTail[0]?.type === "set_switch" &&
      arrivalTail[0].switch_id === HOUSE_ARRIVAL_SEATED_SWITCH &&
      arrivalTail[0].switch_value === false &&
      arrivalTail[1]?.type === "move_player" &&
      arrivalTail[1].cell?.[0] === STEVE_SOFA_STANDING_CELL[0] &&
      arrivalTail[1].cell?.[1] === STEVE_SOFA_STANDING_CELL[1] &&
      arrivalTail[1].facing?.[0] === 0 &&
      arrivalTail[1].facing?.[1] === -1 &&
      arrivalTail[2]?.type === "camera_pan" &&
      arrivalTail[2].cell === undefined,
  );
  ok(
    "suite contains exactly the hub, eleven labs, and three authored environments",
    authored.maps.length === expectedMapIds.size &&
      qaMaps.length === expectedMapIds.size &&
      authored.maps.every((map) => expectedMapIds.has(map.id)),
    `maps: ${authored.maps.map((m) => m.id).join(", ")}`,
  );
  const qaCeilingFixtureIds = new Set([
    INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
    BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
    LONELY_STREET_INTERIOR_CEILING_BULB_OBJECT_ID,
  ]);
  const qaCeilingFixtures = authored.object_library.filter((object) =>
    qaCeilingFixtureIds.has(object.id),
  );
  const qaMapsMissingCeilingLights = authored.maps
    .filter(
      (map) =>
        map.environment !== "exterior" && map.auto_ceiling_lights !== false,
    )
    .filter((map) => {
      const fixtures = map.custom_object_placements.filter((placement) =>
        qaCeilingFixtureIds.has(placement.object_id),
      );
      return (
        fixtures.length === 0 ||
        fixtures.some((placement) => placement.collision_mode !== "none")
      );
    })
    .map((map) => map.id);
  ok(
    "every auto-lit indoor QA room has explicit collision-free ceiling fixtures",
    qaMapsMissingCeilingLights.length === 0 &&
      qaCeilingFixtures.length === qaCeilingFixtureIds.size &&
      qaCeilingFixtures.every(
        (fixture) =>
          fixture.tags.includes("presentation_room_light") &&
          fixture.tags.includes("light_ceiling") &&
          fixture.collision?.profile === "none",
      ),
    qaMapsMissingCeilingLights.join(", "),
  );
  ok(
    "presentation lights remain non-blocking even in stale placement data",
    qaCeilingFixtures.length === qaCeilingFixtureIds.size &&
      qaCeilingFixtures.every(
        (fixture) =>
          placementHasCollision(
            { collision_mode: "inherit" },
            {
              ...fixture,
              collision: { profile: "single", footprint: [[0, 0]] },
            },
          ) === false,
      ),
  );
  const staleFixtureMap = {
    ...authored.maps[0],
    custom_object_placements: authored.maps[0].custom_object_placements.map(
      (placement) =>
        qaCeilingFixtureIds.has(placement.object_id)
          ? { ...placement, collision_mode: "inherit" as const }
          : placement,
    ),
  };
  const normalizedFixtureMap = withQaRoomCeilingArchitecture(staleFixtureMap);
  ok(
    "QA architecture upgrades normalize every stale ceiling fixture",
    normalizedFixtureMap.custom_object_placements
      .filter((placement) => qaCeilingFixtureIds.has(placement.object_id))
      .every((placement) => placement.collision_mode === "none"),
  );
  const phase11Hub = defaultPackage.maps.find(
    (map) => map.id === PHASE_11_HUB_MAP_ID,
  );
  ok(
    "the Phase 11 QA hub shares the ceiling-light architecture",
    phase11Hub?.custom_object_placements.some(
      (placement) =>
        qaCeilingFixtureIds.has(placement.object_id) &&
        placement.collision_mode === "none",
    ) === true,
  );

  const lonelyStreetMap = mapById.get(LONELY_STREET_MAP_ID);
  const lonelyStreetCellByKey = new Map(
    (lonelyStreetMap?.cells || []).map((mapCell) => [
      `${mapCell.x}:${mapCell.z}`,
      mapCell,
    ]),
  );
  const lonelyStreetCellAt = (x: number, z: number) =>
    lonelyStreetCellByKey.get(`${x}:${z}`);
  const lonelyStreetTrees =
    lonelyStreetMap?.custom_object_placements.filter(
      (placement) => placement.object_id === LONELY_STREET_TREE_OBJECT_ID,
    ) || [];
  const lonelyStreetHouses =
    lonelyStreetMap?.custom_object_placements.filter(
      (placement) => placement.object_id === LONELY_STREET_HOUSE_OBJECT_ID,
    ) || [];
  const lonelyStreetFrontDoor = lonelyStreetMap?.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_front_door",
  );
  const lonelyStreetTreeObject = authored.object_library.find(
    (object) => object.id === LONELY_STREET_TREE_OBJECT_ID,
  );
  const lonelyStreetHouseObject = authored.object_library.find(
    (object) => object.id === LONELY_STREET_HOUSE_OBJECT_ID,
  );
  const lonelyStreetFrontDoorObject = authored.object_library.find(
    (object) => object.id === LONELY_STREET_FRONT_DOOR_OBJECT_ID,
  );
  const lonelyStreetSpawn = lonelyStreetMap?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_SPAWN_ID,
  );
  const lonelyStreetQaReturnExit = lonelyStreetMap?.exits.find(
    (mapExit) =>
      mapExit.target_map_id === TEST_SUITE_START_MAP_ID &&
      mapExit.target_spawn_id === TEST_SUITE_START_SPAWN_ID,
  );
  const lonelyStreetHouseExit = lonelyStreetMap?.exits.find(
    (mapExit) =>
      mapExit.target_map_id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      mapExit.target_spawn_id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
  const lonelyStreetInteriorMap = mapById.get(
    LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const lonelyStreetInteriorCellByKey = new Map(
    (lonelyStreetInteriorMap?.cells || []).map((mapCell) => [
      `${mapCell.x}:${mapCell.z}`,
      mapCell,
    ]),
  );
  const lonelyStreetInteriorCellAt = (x: number, z: number) =>
    lonelyStreetInteriorCellByKey.get(`${x}:${z}`);
  const lonelyStreetInteriorSpawn = lonelyStreetInteriorMap?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
  const lonelyStreetInteriorReturnExit = lonelyStreetInteriorMap?.exits.find(
    (mapExit) =>
      mapExit.target_map_id === LONELY_STREET_MAP_ID &&
      mapExit.target_spawn_id === LONELY_STREET_RETURN_SPAWN_ID,
  );
  const lonelyStreetInteriorDoor =
    lonelyStreetInteriorMap?.custom_object_placements.find(
      (placement) =>
        placement.object_id === LONELY_STREET_INTERIOR_DOOR_OBJECT_ID,
    );
  const lonelyStreetBasementMap = mapById.get(
    LONELY_STREET_BASEMENT_MAP_ID,
  );
  const lonelyStreetBasementCellByKey = new Map(
    (lonelyStreetBasementMap?.cells || []).map((mapCell) => [
      `${mapCell.x}:${mapCell.z}`,
      mapCell,
    ]),
  );
  const lonelyStreetBasementCellAt = (x: number, z: number) =>
    lonelyStreetBasementCellByKey.get(`${x}:${z}`);
  const lonelyStreetBasementSpawn = lonelyStreetBasementMap?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_BASEMENT_SPAWN_ID,
  );
  const lonelyStreetBasementExit = lonelyStreetBasementMap?.exits.find(
    (mapExit) =>
      mapExit.target_map_id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      mapExit.target_spawn_id ===
        LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
  );
  const moonGodObject = authored.object_library.find(
    (object) => object.id === MOON_GOD_MODEL_OBJECT_ID,
  );
  const moonGodEntity = authored.entities.find(
    (entity) => entity.id === MOON_GOD_ENTITY_ID,
  );
  const moonGodPlacement = lonelyStreetBasementMap?.entity_placements.find(
    (placement) => placement.id === MOON_GOD_PLACEMENT_ID,
  );
  const moonGodTrigger = lonelyStreetBasementMap?.triggers.find(
    (trigger) => trigger.id === MOON_GOD_INTERACT_TRIGGER_ID,
  );
  const basementSilenceTrigger = lonelyStreetBasementMap?.triggers.find(
    (trigger) => trigger.id === BASEMENT_ENTRY_SILENCE_TRIGGER_ID,
  );
  const basementBeerTrigger = lonelyStreetBasementMap?.triggers.find(
    (trigger) => trigger.id === BASEMENT_BEER_INTERACT_TRIGGER_ID,
  );
  const basementFridge = lonelyStreetBasementMap?.custom_object_placements.find(
    (placement) => placement.id === "lonely_basement_fridge",
  );
  const moonGodDialogue = authored.dialogue.find(
    (dialogue) => dialogue.id === MOON_GOD_DIALOGUE_ID,
  );
  const beerDialogue = authored.dialogue.find(
    (dialogue) => dialogue.id === BASEMENT_BEER_DIALOGUE_ID,
  );
  const moonGodCutscene = authored.cutscenes.find(
    (cutscene) => cutscene.id === MOON_GOD_VANISH_CUTSCENE_ID,
  );
  const basementBeerCutscene = authored.cutscenes.find(
    (cutscene) => cutscene.id === BASEMENT_BEER_CUTSCENE_ID,
  );
  const basementSilenceCutscene = authored.cutscenes.find(
    (cutscene) => cutscene.id === BASEMENT_ENTRY_SILENCE_CUTSCENE_ID,
  );
  const basementBeerItem = authored.items.find(
    (item) => item.id === BASEMENT_BEER_ITEM_ID,
  );
  const lonelyStreetHouseBasementExit = lonelyStreetInteriorMap?.exits.find(
    (mapExit) =>
      mapExit.target_map_id === LONELY_STREET_BASEMENT_MAP_ID &&
      mapExit.target_spawn_id === LONELY_STREET_BASEMENT_SPAWN_ID,
  );
  const lonelyStreetHouseBasementDoor =
    lonelyStreetInteriorMap?.custom_object_placements.find(
      (placement) =>
        placement.id === LONELY_STREET_HOUSE_BASEMENT_DOOR_PLACEMENT_ID,
    );
  const lonelyStreetHouseBasementReturnSpawn =
    lonelyStreetInteriorMap?.spawns.find(
      (spawn) =>
        spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
    );
  const basementObjectIdSet = new Set<string>(
    LONELY_STREET_BASEMENT_OBJECT_IDS,
  );
  const lonelyStreetBasementObjects = authored.object_library.filter(
    (object) => basementObjectIdSet.has(object.id),
  );
  const lonelyStreetBasementModelObjects =
    lonelyStreetBasementObjects.filter((object) => Boolean(object.asset));
  const lonelyStreetBasementBareBulb =
    lonelyStreetBasementMap?.custom_object_placements.find(
      (placement) =>
        placement.object_id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
    );
  const lonelyStreetBasementStairSconce =
    lonelyStreetBasementMap?.custom_object_placements.find(
      (placement) =>
        placement.object_id === LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
    );
  const lonelyStreetBasementBareBulbObject = authored.object_library.find(
    (object) => object.id === LONELY_STREET_BASEMENT_BARE_BULB_OBJECT_ID,
  );
  const lonelyStreetBasementStairSconceObject = authored.object_library.find(
    (object) => object.id === LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID,
  );
  const basementPresentationSave = {
    schema: "crpg_engine_save_v1",
    package_version: authored.metadata.version,
    fine_ratio: FINE_PER_MACRO,
    current_map_id: LONELY_STREET_BASEMENT_MAP_ID,
    player: {
      cell: [
        Number(lonelyStreetBasementSpawn?.cell[0] ?? 0),
        Number(lonelyStreetBasementSpawn?.cell[1] ?? 0),
      ],
      facing: [
        Number(lonelyStreetBasementSpawn?.facing[0] ?? 1),
        Number(lonelyStreetBasementSpawn?.facing[1] ?? 0),
      ],
    },
    playerStats: {
      hp: 20,
      max_hp: 20,
      mp: 5,
      max_mp: 5,
      attack: 3,
      defense: 1,
      speed: 10,
      energy: 1000,
    },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as PlaySave;
  const resolvedBasementStairSconce = resolveImmersiveLightSources(
    authored,
    basementPresentationSave,
    LONELY_STREET_BASEMENT_MAP_ID,
  ).find(
    (source) =>
      source.definition_key ===
      `object:${LONELY_STREET_BASEMENT_STAIR_SCONCE_OBJECT_ID}`,
  );
  const lonelyStreetBasementWalkableKeys = new Set(
    (lonelyStreetBasementMap?.cells || [])
      .filter((cell) => cell.active !== false && cell.walkable)
      .map((cell) => `${cell.x}:${cell.z}`),
  );
  const lonelyStreetBasementReachableKeys = new Set<string>();
  const lonelyStreetBasementQueue: [number, number][] =
    lonelyStreetBasementSpawn
      ? [[lonelyStreetBasementSpawn.cell[0], lonelyStreetBasementSpawn.cell[1]]]
      : [];
  for (let index = 0; index < lonelyStreetBasementQueue.length; index += 1) {
    const current = lonelyStreetBasementQueue[index];
    const currentKey = `${current[0]}:${current[1]}`;
    if (
      lonelyStreetBasementReachableKeys.has(currentKey) ||
      !lonelyStreetBasementWalkableKeys.has(currentKey)
    ) {
      continue;
    }
    lonelyStreetBasementReachableKeys.add(currentKey);
    (
      [
        [current[0] + 1, current[1]],
        [current[0] - 1, current[1]],
        [current[0], current[1] + 1],
        [current[0], current[1] - 1],
      ] as [number, number][]
    ).forEach((neighbor) => {
      const neighborKey = `${neighbor[0]}:${neighbor[1]}`;
      if (
        lonelyStreetBasementWalkableKeys.has(neighborKey) &&
        !lonelyStreetBasementReachableKeys.has(neighborKey)
      ) {
        lonelyStreetBasementQueue.push(neighbor);
      }
    });
  }
  const hasContinuousStreetMaterial = (
    objectId: string,
    cells: Array<readonly [number, number]>,
  ) =>
    cells.every(([x, z]) => {
      const mapCell = lonelyStreetCellAt(x, z);
      return mapCell?.walkable === true && mapCell.object_id === objectId;
    });

  ok(
    "Lonely Street declares centered bounds for its doubled authored road",
    lonelyStreetMap?.environment === "exterior" &&
      lonelyStreetMap.width === 17 &&
      lonelyStreetMap.height === 165 &&
      lonelyStreetMap.cells.length === 1870,
    `size=${lonelyStreetMap?.width}x${lonelyStreetMap?.height}, cells=${lonelyStreetMap?.cells.length}`,
  );
  const longRoadCells = Array.from({ length: 106 }, (_, zOffset) =>
    Array.from(
      { length: 6 },
      (_, xOffset) => [-3 + xOffset, -78 + zOffset] as const,
    ),
  ).flat();
  const longSidewalkCells = Array.from(
    { length: 106 },
    (_, zOffset) => [3, -78 + zOffset] as const,
  );
  ok(
    "Lonely Street has a continuous long road and sidewalk-to-porch approach",
    hasContinuousStreetMaterial(
      LONELY_STREET_ASPHALT_OBJECT_ID,
      longRoadCells,
    ) &&
      hasContinuousStreetMaterial(
        LONELY_STREET_SIDEWALK_OBJECT_ID,
        longSidewalkCells,
      ) &&
      lonelyStreetCellAt(...LONELY_STREET_PORCH_CELL)?.object_id ===
        LONELY_STREET_SIDEWALK_OBJECT_ID &&
      lonelyStreetHouses[0]?.cell[0] === LONELY_STREET_HOUSE_CELL[0] &&
      lonelyStreetHouses[0]?.cell[1] === LONELY_STREET_HOUSE_CELL[1] &&
      lonelyStreetHouses[0]?.facing[0] === -1 &&
      lonelyStreetHouses[0]?.facing[1] === 0,
  );
  const leftStreetTrees = lonelyStreetTrees.filter(
    (placement) => placement.cell[0] <= -6,
  );
  const rightStreetTrees = lonelyStreetTrees.filter(
    (placement) => placement.cell[0] >= 6,
  );
  ok(
    "Lonely Street remains visually enclosed by blocking LOS trees on both sides",
    lonelyStreetTrees.length >= 240 &&
      leftStreetTrees.length >= 100 &&
      rightStreetTrees.length >= 100 &&
      lonelyStreetTreeObject?.model_kind === "asset" &&
      lonelyStreetTreeObject.asset?.data_url ===
        "/models/environment/autumn-tree.glb" &&
      lonelyStreetTreeObject.asset.stats.meshes === 1 &&
      lonelyStreetTreeObject.asset.stats.vertices === 2180 &&
      lonelyStreetTreeObject.asset.stats.triangles === 1008 &&
      lonelyStreetTreeObject.asset.stats.bytes === 144596 &&
      lonelyStreetTreeObject.tags.includes("static_asset_instance") &&
      lonelyStreetTreeObject.tags.includes("performance_foliage") &&
      lonelyStreetTreeObject?.collision?.profile === "single" &&
      lonelyStreetTreeObject.collision.footprint.length === 1 &&
      lonelyStreetTreeObject?.tags.includes("blocks_move") === true &&
      lonelyStreetTreeObject?.tags.includes("blocks_los") === true &&
      lonelyStreetTrees.every((placement) => {
        const mapCell = lonelyStreetCellAt(
          placement.cell[0],
          placement.cell[1],
        );
        return (
          placement.collision_mode === "inherit" &&
          mapCell?.walkable === false &&
          mapCell.blocks_los === true
        );
      }) &&
      new Set(
        lonelyStreetTrees.map(
          (placement) => `${placement.facing[0]}:${placement.facing[1]}`,
        ),
      ).size === 4,
    `trees=${lonelyStreetTrees.length}, left=${leftStreetTrees.length}, right=${rightStreetTrees.length}`,
  );
  const lonelyStreetHouseFootprint =
    lonelyStreetHouses[0] && lonelyStreetHouseObject
      ? getMacroPlacementFootprint(
          lonelyStreetHouses[0],
          lonelyStreetHouseObject,
        )
      : [];
  ok(
    "Lonely Street contains one house with a real closed front door facing the road",
    lonelyStreetHouses.length === 1 &&
      lonelyStreetHouses[0]?.collision_mode === "inherit" &&
      lonelyStreetHouseObject?.collision?.profile === "custom_footprint" &&
      lonelyStreetHouseObject.collision.footprint.length === 13 &&
      placementHasCollision(lonelyStreetHouses[0], lonelyStreetHouseObject) &&
      lonelyStreetHouseFootprint.every(
        ([x, z]) => x >= 6 && x <= 8 && z >= -77 && z <= -73,
      ) &&
      !lonelyStreetHouseFootprint.some(
        ([x, z]) =>
          x === LONELY_STREET_DOORWAY_CELL[0] &&
          z === LONELY_STREET_DOORWAY_CELL[1],
      ) &&
      !lonelyStreetHouseFootprint.some(
        ([x, z]) =>
          x === LONELY_STREET_INTERIOR_CELL[0] &&
          z === LONELY_STREET_INTERIOR_CELL[1],
      ) &&
      lonelyStreetHouseFootprint.some(([x, z]) => x === 8 && z === -75) &&
      lonelyStreetHouses[0]?.height_offset === -0.26 &&
      !lonelyStreetHouseObject.parts.some(
        (part) => part.name === "open_front_door",
      ) &&
      lonelyStreetFrontDoor?.object_id === LONELY_STREET_FRONT_DOOR_OBJECT_ID &&
      lonelyStreetFrontDoor.cell[0] === LONELY_STREET_DOORWAY_CELL[0] &&
      lonelyStreetFrontDoor.cell[1] === LONELY_STREET_DOORWAY_CELL[1] &&
      lonelyStreetFrontDoor.facing[0] === -1 &&
      lonelyStreetFrontDoor.facing[1] === 0 &&
      lonelyStreetFrontDoor.height_offset === 0.03 &&
      lonelyStreetFrontDoor.collision_mode === "inherit" &&
      !lonelyStreetHouseObject.parts.some((part) => part.name === "house_body"),
  );
  const frontDoorSlab = lonelyStreetFrontDoorObject?.parts.find(
    (part) => part.name === "door",
  );
  ok(
    "the street door is a full-height interactive slab aligned inside the frame",
    lonelyStreetFrontDoorObject?.tags.includes("door") === true &&
      lonelyStreetFrontDoorObject.tags.includes("interactable") === true &&
      lonelyStreetFrontDoorObject.collision?.profile === "single" &&
      lonelyStreetFrontDoorObject.collision.footprint.length === 1 &&
      lonelyStreetFrontDoorObject.collision.footprint[0]?.[0] === 0 &&
      lonelyStreetFrontDoorObject.collision.footprint[0]?.[1] === 0 &&
      lonelyStreetFrontDoorObject.bounds[1] === 2.06 &&
      frontDoorSlab?.position[2] === 0.64 &&
      frontDoorSlab.size[0] === 0.88 &&
      frontDoorSlab.size[1] === 2.06 &&
      frontDoorSlab.size[2] === 0.14,
  );
  const sidewalkApproach = lonelyStreetCellAt(4, -75);
  const porchSurface = lonelyStreetCellAt(...LONELY_STREET_PORCH_CELL);
  const porchSideSurfaces = [-76, -74].map((z) =>
    lonelyStreetCellAt(LONELY_STREET_PORCH_CELL[0], z),
  );
  const doorwaySurface = lonelyStreetCellAt(...LONELY_STREET_DOORWAY_CELL);
  const interiorSurface = lonelyStreetCellAt(...LONELY_STREET_INTERIOR_CELL);
  ok(
    "the house approach, porch, doorway, and interior form realistic automatic steps",
    porchSurface?.walkable === true &&
      porchSideSurfaces.every(
        (surface) =>
          surface?.walkable === true && surface.visual_height === 0.76,
      ) &&
      doorwaySurface?.walkable === true &&
      interiorSurface?.walkable === true &&
      porchSurface.visual_height === 0.76 &&
      doorwaySurface.visual_height === 0.52 &&
      interiorSurface.visual_height === 0.52 &&
      canAutomaticallyStepBetween(sidewalkApproach, porchSurface) &&
      canAutomaticallyStepBetween(porchSurface, doorwaySurface) &&
      canAutomaticallyStepBetween(doorwaySurface, interiorSurface) &&
      canAutomaticallyStepBetween(interiorSurface, doorwaySurface) &&
      canAutomaticallyStepBetween(doorwaySurface, porchSurface) &&
      canAutomaticallyStepBetween(porchSurface, sidewalkApproach),
  );
  const sidewalkFine = fineCenterOfMacro([4, -75]);
  const expandedLonelyStreet = fine.maps.find(
    (map) => map.id === LONELY_STREET_MAP_ID,
  );
  const expandedFrontDoor = expandedLonelyStreet?.custom_object_placements.find(
    (placement) => placement.id === "lonely_street_front_door",
  );
  const expandedLonelyStreetInterior = fine.maps.find(
    (map) => map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  const expandedInteriorDoor =
    expandedLonelyStreetInterior?.custom_object_placements.find(
      (placement) =>
        placement.object_id === LONELY_STREET_INTERIOR_DOOR_OBJECT_ID,
    );
  const expandedInteriorSpawn = expandedLonelyStreetInterior?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_HOUSE_INTERIOR_SPAWN_ID,
  );
  const expandedStreetReturnSpawn = expandedLonelyStreet?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
  );
  const expandedLonelyStreetBasement = fine.maps.find(
    (map) => map.id === LONELY_STREET_BASEMENT_MAP_ID,
  );
  const expandedBasementSpawn = expandedLonelyStreetBasement?.spawns.find(
    (spawn) => spawn.id === LONELY_STREET_BASEMENT_SPAWN_ID,
  );
  const fineObjectById = new Map(
    fine.object_library.map((object) => [object.id, object]),
  );
  const basementFreeMovementWalkable = new Set(
    (expandedLonelyStreetBasement?.cells || [])
      .filter((mapCell) => {
        if (mapCell.walkable === false) return false;
        const cellObject = mapCell.object_id
          ? fineObjectById.get(mapCell.object_id)
          : undefined;
        return !cellObject || cellObject.collision?.profile === "none";
      })
      .map((mapCell) => `${mapCell.x}:${mapCell.z}`),
  );
  const basementPreciseCollisionBounds = (
    expandedLonelyStreetBasement?.custom_object_placements || []
  ).flatMap((placement) => {
    const object = fineObjectById.get(placement.object_id);
    if (!placementHasCollision(placement, object)) return [];
    const bounds = getPlacementContinuousCollisionBounds(placement, object);
    if (bounds) return [bounds];
    getPlacementFootprint(placement, object).forEach(([x, z]) => {
      basementFreeMovementWalkable.delete(`${x}:${z}`);
    });
    return [];
  });
  const basementMovementFromSpawn = expandedBasementSpawn
    ? resolveFreePlayerMovement({
        position: expandedBasementSpawn.cell as [number, number],
        delta: [3, 0],
        isBlockedCell: (x, z) =>
          !basementFreeMovementWalkable.has(`${x}:${z}`),
        intersectsBlockedPosition: (position, radius) =>
          basementPreciseCollisionBounds.some((bounds) =>
            freePlayerPositionIntersectsBounds(position, radius, bounds),
          ),
      })
    : null;
  const expandedHouseBasementReturnSpawn =
    expandedLonelyStreetInterior?.spawns.find(
      (spawn) =>
        spawn.id === LONELY_STREET_HOUSE_BASEMENT_RETURN_SPAWN_ID,
    );
  const interiorDoorProbe = expandedInteriorDoor
    ? resolveFreeInteractionPose({
        cell: [
          Number(expandedInteriorDoor.cell[0] ?? 0) + FINE_HALF_EXTENT + 1,
          Number(expandedInteriorDoor.cell[1] ?? 0),
        ],
        facing: [-1, 0],
        useContinuousPosition: false,
        edgeReach: FINE_HALF_EXTENT + 1,
      }).probe
    : null;
  const targetedInteriorPlacement =
    expandedLonelyStreetInterior && interiorDoorProbe
      ? selectInteractionPlacementAtCell(
          expandedLonelyStreetInterior.custom_object_placements,
          new Map(fine.object_library.map((object) => [object.id, object])),
          interiorDoorProbe[0],
          interiorDoorProbe[1],
        )
      : undefined;
  ok(
    "the interior entry interaction targets the real door instead of its colocated frame",
    targetedInteriorPlacement?.id === "lonely_street_interior_front_door",
    JSON.stringify({
      probe: interiorDoorProbe,
      target: targetedInteriorPlacement?.id,
    }),
  );
  let traversalSave = {
    schema: "crpg_engine_save_v1",
    package_version: fine.metadata.version,
    fine_ratio: FINE_PER_MACRO,
    current_map_id: LONELY_STREET_MAP_ID,
    player: { cell: [...sidewalkFine], facing: [1, 0] },
    playerStats: {
      hp: 20,
      max_hp: 20,
      mp: 5,
      max_mp: 5,
      attack: 3,
      defense: 1,
      speed: 10,
      energy: 1000,
    },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as PlaySave;
  let traversalFailure = "";
  const stepsIntoHouse = (LONELY_STREET_INTERIOR_CELL[0] - 4) * FINE_PER_MACRO;
  for (let step = 0; step < stepsIntoHouse; step += 1) {
    const moved = dispatchV1MoveEntity({
      gamePackage: fine,
      save: traversalSave,
      dx: 1,
      dy: 0,
      facingOverride: [1, 0],
    });
    if (!moved.ok) {
      traversalFailure = `inbound step ${step + 1}: ${moved.reason}`;
      break;
    }
    traversalSave = moved.save;
  }
  const stoppedAtClosedDoor = Boolean(traversalFailure);
  const openedDoor = expandedFrontDoor
    ? dispatchV1OpenDoor({
        gamePackage: fine,
        save: traversalSave,
        x: expandedFrontDoor.cell[0],
        y: expandedFrontDoor.cell[1],
      })
    : null;
  const enteredHouse =
    openedDoor?.ok && lonelyStreetHouseExit
      ? dispatchV1ChangeMap({
          gamePackage: fine,
          save: openedDoor.save,
          targetMapId: lonelyStreetHouseExit.target_map_id,
          targetSpawnId: lonelyStreetHouseExit.target_spawn_id,
          exitId: lonelyStreetHouseExit.id,
        })
      : null;
  const openedInteriorDoor =
    enteredHouse?.ok && expandedInteriorDoor
      ? dispatchV1OpenDoor({
          gamePackage: fine,
          save: enteredHouse.save,
          x: expandedInteriorDoor.cell[0],
          y: expandedInteriorDoor.cell[1],
        })
      : null;
  const returnedToStreet =
    openedInteriorDoor?.ok && lonelyStreetInteriorReturnExit
      ? dispatchV1ChangeMap({
          gamePackage: fine,
          save: openedInteriorDoor.save,
          targetMapId: lonelyStreetInteriorReturnExit.target_map_id,
          targetSpawnId: lonelyStreetInteriorReturnExit.target_spawn_id,
          exitId: lonelyStreetInteriorReturnExit.id,
        })
      : null;
  ok(
    "the closed house door blocks entry, then the two door thresholds route into the house and back to its porch",
    stoppedAtClosedDoor &&
      openedDoor?.ok === true &&
      enteredHouse?.ok === true &&
      enteredHouse.save.current_map_id ===
        LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      openedInteriorDoor?.ok === true &&
      returnedToStreet?.ok === true &&
      returnedToStreet.save.current_map_id === LONELY_STREET_MAP_ID,
    traversalFailure || `ended=${traversalSave.player.cell.join(",")}`,
  );
  ok(
    "both Lonely Street doors place Steve at their named door-relative arrival",
    enteredHouse?.ok === true &&
      expandedInteriorSpawn !== undefined &&
      enteredHouse.save.player.cell[0] === expandedInteriorSpawn.cell[0] &&
      enteredHouse.save.player.cell[1] === expandedInteriorSpawn.cell[1] &&
      returnedToStreet?.ok === true &&
      expandedStreetReturnSpawn !== undefined &&
      returnedToStreet.save.player.cell[0] ===
        expandedStreetReturnSpawn.cell[0] &&
      returnedToStreet.save.player.cell[1] ===
        expandedStreetReturnSpawn.cell[1],
    JSON.stringify({
      entered: enteredHouse?.ok ? enteredHouse.save.player.cell : null,
      expectedInterior: expandedInteriorSpawn?.cell,
      returned: returnedToStreet?.ok ? returnedToStreet.save.player.cell : null,
      expectedStreet: expandedStreetReturnSpawn?.cell,
    }),
  );
  const enteredBasement =
    enteredHouse?.ok && lonelyStreetHouseBasementExit
      ? dispatchV1ChangeMap({
          gamePackage: fine,
          save: enteredHouse.save,
          targetMapId: lonelyStreetHouseBasementExit.target_map_id,
          targetSpawnId: lonelyStreetHouseBasementExit.target_spawn_id,
          exitId: lonelyStreetHouseBasementExit.id,
        })
      : null;
  const basementExitEligibleBeforeObjective =
    enteredBasement?.ok && lonelyStreetBasementExit
      ? isMapExitEligible(
          lonelyStreetBasementExit,
          buildConditionContext(enteredBasement.save),
        )
      : null;
  const basementObjectiveSave = enteredBasement?.ok
    ? {
        ...enteredBasement.save,
        flags: {
          ...(enteredBasement.save.flags || {}),
          [BASEMENT_BEER_ACQUIRED_SWITCH_ID]: true,
        },
        inventory: [
          ...(enteredBasement.save.inventory || []),
          { id: BASEMENT_BEER_ITEM_ID, count: 1 },
        ],
      }
    : null;
  const returnedFromBasement =
    basementObjectiveSave &&
    lonelyStreetBasementExit &&
    isMapExitEligible(
      lonelyStreetBasementExit,
      buildConditionContext(basementObjectiveSave),
    )
      ? dispatchV1ChangeMap({
          gamePackage: fine,
          save: basementObjectiveSave,
          targetMapId: lonelyStreetBasementExit.target_map_id,
          targetSpawnId: lonelyStreetBasementExit.target_spawn_id,
          exitId: lonelyStreetBasementExit.id,
        })
      : null;
  ok(
    "the basement stairs lock on entry and return Steve beside the house stairs only after the beer objective",
    enteredBasement?.ok === true &&
      enteredBasement.save.current_map_id === LONELY_STREET_BASEMENT_MAP_ID &&
      expandedBasementSpawn !== undefined &&
      enteredBasement.save.player.cell[0] === expandedBasementSpawn.cell[0] &&
      enteredBasement.save.player.cell[1] === expandedBasementSpawn.cell[1] &&
      basementExitEligibleBeforeObjective === false &&
      returnedFromBasement?.ok === true &&
      returnedFromBasement.save.current_map_id ===
        LONELY_STREET_HOUSE_INTERIOR_MAP_ID &&
      expandedHouseBasementReturnSpawn !== undefined &&
      returnedFromBasement.save.player.cell[0] ===
        expandedHouseBasementReturnSpawn.cell[0] &&
      returnedFromBasement.save.player.cell[1] ===
        expandedHouseBasementReturnSpawn.cell[1],
    JSON.stringify({
      entered: enteredBasement?.ok ? enteredBasement.save.player.cell : null,
      expectedBasement: expandedBasementSpawn?.cell,
      returned: returnedFromBasement?.ok
        ? returnedFromBasement.save.player.cell
        : null,
      eligibleBeforeObjective: basementExitEligibleBeforeObjective,
      expectedHouse: expandedHouseBasementReturnSpawn?.cell,
    }),
  );
  ok(
    "continuous movement advances three fine cells along +X from the basement spawn",
    Boolean(expandedBasementSpawn && basementMovementFromSpawn) &&
      Number(basementMovementFromSpawn?.[0]) >=
        Number(expandedBasementSpawn?.cell[0]) + 2.999 &&
      Math.abs(
        Number(basementMovementFromSpawn?.[1]) -
          Number(expandedBasementSpawn?.cell[1]),
      ) < 0.001,
    JSON.stringify({
      spawn: expandedBasementSpawn?.cell,
      moved: basementMovementFromSpawn,
    }),
  );
  const fittedBasementObstacle = basementPreciseCollisionBounds[0];
  const embeddedBasementPosition: [number, number] | null =
    fittedBasementObstacle
      ? [
          (fittedBasementObstacle.minX + fittedBasementObstacle.maxX) / 2,
          (fittedBasementObstacle.minZ + fittedBasementObstacle.maxZ) / 2,
        ]
      : null;
  const repairedEmbeddedBasementPosition = embeddedBasementPosition
    ? resolveNearestFreePlayerPosition({
        position: embeddedBasementPosition,
        isBlockedCell: (x, z) =>
          !basementFreeMovementWalkable.has(`${x}:${z}`),
        intersectsBlockedPosition: (position, radius) =>
          basementPreciseCollisionBounds.some((bounds) =>
            freePlayerPositionIntersectsBounds(position, radius, bounds),
          ),
      })
    : null;
  ok(
    "a persisted basement pose embedded in fitted furniture is moved to the nearest legal floor position",
    Boolean(embeddedBasementPosition && repairedEmbeddedBasementPosition) &&
      !freePlayerPositionIntersectsBlockedCell(
        repairedEmbeddedBasementPosition!,
        1.08,
        (x, z) => !basementFreeMovementWalkable.has(`${x}:${z}`),
      ) &&
      basementPreciseCollisionBounds.every(
        (bounds) =>
          !freePlayerPositionIntersectsBounds(
            repairedEmbeddedBasementPosition!,
            1.08,
            bounds,
          ),
      ),
    JSON.stringify({
      embedded: embeddedBasementPosition,
      repaired: repairedEmbeddedBasementPosition,
    }),
  );
  const streetReturnWindow = expandedStreetReturnSpawn
    ? materializeLargeMapWindow(LONELY_STREET_MAP, [
        Number(expandedStreetReturnSpawn.cell[0] ?? 0),
        Number(expandedStreetReturnSpawn.cell[1] ?? 0),
      ])
    : null;
  const returnWindowPackage = streetReturnWindow
    ? {
        ...fine,
        maps: fine.maps.map((map) =>
          map.id === LONELY_STREET_MAP_ID ? streetReturnWindow : map,
        ),
      }
    : null;
  const movedAfterReturn =
    returnWindowPackage && returnedToStreet?.ok
      ? dispatchV1MoveEntity({
          gamePackage: returnWindowPackage,
          save: returnedToStreet.save,
          dx: -1,
          dy: 0,
          facingOverride: [-1, 0],
        })
      : null;
  ok(
    "a large-map return window contains the porch and permits movement immediately after transition",
    streetReturnWindow?.cells.some(
      (mapCell) =>
        mapCell.x === expandedStreetReturnSpawn?.cell[0] &&
        mapCell.z === expandedStreetReturnSpawn?.cell[1],
    ) === true &&
      movedAfterReturn?.ok === true &&
      movedAfterReturn.save.player.cell[0] ===
        Number(expandedStreetReturnSpawn?.cell[0]) - 1,
    movedAfterReturn?.reason ||
      JSON.stringify({
        returnSpawn: expandedStreetReturnSpawn?.cell,
        moved: movedAfterReturn?.save.player.cell,
      }),
  );
  const leftRoofSlope = lonelyStreetHouseObject?.parts.find(
    (part) => part.name === "left_roof_slope",
  );
  const rightRoofSlope = lonelyStreetHouseObject?.parts.find(
    (part) => part.name === "right_roof_slope",
  );
  ok(
    "The Lonely Street house roof slopes upward toward its center ridge",
    Number(leftRoofSlope?.rotation[2]) > 0 &&
      Number(rightRoofSlope?.rotation[2]) < 0 &&
      Number(leftRoofSlope?.position[0]) < 0 &&
      Number(rightRoofSlope?.position[0]) > 0,
  );
  const lonelyStreetCeilingFixtures =
    lonelyStreetMap?.custom_object_placements.filter((placement) =>
      qaCeilingFixtureIds.has(placement.object_id),
    ) || [];
  ok(
    "Lonely Street remains open-air with no indoor ceiling fixtures",
    lonelyStreetCeilingFixtures.length === 0 &&
      Boolean(lonelyStreetMap) &&
      withQaRoomCeilingArchitecture(lonelyStreetMap!) === lonelyStreetMap,
  );
  ok(
    "Lonely Street has valid entry/return spawns, one house door exit, and no QA return",
    Boolean(lonelyStreetSpawn) &&
      lonelyStreetCellAt(
        lonelyStreetSpawn?.cell[0] ?? Number.NaN,
        lonelyStreetSpawn?.cell[1] ?? Number.NaN,
      )?.walkable === true &&
      lonelyStreetSpawn?.facing[0] === 0 &&
      lonelyStreetSpawn.facing[1] === -1 &&
      lonelyStreetMap?.spawns.some(
        (spawn) => spawn.id === LONELY_STREET_RETURN_SPAWN_ID,
      ) === true &&
      lonelyStreetMap?.exits.length === 1 &&
      !lonelyStreetQaReturnExit &&
      Boolean(lonelyStreetHouseExit) &&
      lonelyStreetCellAt(
        lonelyStreetHouseExit?.cell[0] ?? Number.NaN,
        lonelyStreetHouseExit?.cell[1] ?? Number.NaN,
      )?.walkable === true,
  );
  ok(
    "the Lonely Street house is a distinct furnished interior map with front-door and basement routes",
    lonelyStreetInteriorMap?.environment === "interior" &&
      lonelyStreetInteriorMap.width === 10 &&
      lonelyStreetInteriorMap.height === 7 &&
      lonelyStreetInteriorMap.cells.length === 70 &&
      lonelyStreetInteriorMap.custom_object_placements.length >= 17 &&
      lonelyStreetInteriorMap.custom_object_placements.some(
        (placement) => placement.id === "lonely_street_interior_shell",
      ) === true &&
      lonelyStreetInteriorDoor?.cell[0] === -4 &&
      lonelyStreetInteriorDoor.cell[1] === 1 &&
      lonelyStreetInteriorDoor.collision_mode === "inherit" &&
      Boolean(lonelyStreetInteriorSpawn) &&
      lonelyStreetInteriorCellAt(
        lonelyStreetInteriorSpawn?.cell[0] ?? Number.NaN,
        lonelyStreetInteriorSpawn?.cell[1] ?? Number.NaN,
      )?.walkable === true &&
      lonelyStreetInteriorMap.exits.length === 2 &&
      Boolean(lonelyStreetInteriorReturnExit) &&
      lonelyStreetInteriorCellAt(
        lonelyStreetInteriorReturnExit?.cell[0] ?? Number.NaN,
        lonelyStreetInteriorReturnExit?.cell[1] ?? Number.NaN,
      )?.walkable === true &&
      lonelyStreetHouseBasementDoor?.object_id ===
        LONELY_STREET_BASEMENT_STAIR_DOOR_OBJECT_ID &&
      lonelyStreetHouseBasementDoor.cell[0] ===
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[0] &&
      lonelyStreetHouseBasementDoor.cell[1] ===
        LONELY_STREET_HOUSE_BASEMENT_STAIR_CELL[1] &&
      lonelyStreetHouseBasementDoor.collision_mode === "none" &&
      LONELY_STREET_HOUSE_INTERIOR_MAP.id ===
        LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
  );
  ok(
    "Riley's basement is a modular Blender-authored interior with a complete connected floor",
    lonelyStreetBasementMap?.environment === "interior" &&
      lonelyStreetBasementMap.width === 11 &&
      lonelyStreetBasementMap.height === 9 &&
      lonelyStreetBasementMap.cells.length === 99 &&
      lonelyStreetBasementMap.custom_object_placements.length === 18 &&
      lonelyStreetBasementObjects.length === 19 &&
      lonelyStreetBasementModelObjects.length === 18 &&
      lonelyStreetBasementWalkableKeys.size === 63 &&
      lonelyStreetBasementReachableKeys.size ===
        lonelyStreetBasementWalkableKeys.size &&
      lonelyStreetBasementModelObjects.every(
        (object) =>
          object.asset?.data_url.startsWith(
            "/models/environment/lonely-street-basement/",
          ) === true &&
          object.asset.data_url.endsWith("-staged.glb") === false &&
          object.tags.includes(LONELY_STREET_BASEMENT_ASSET_REVISION),
      ) &&
      new Set(
        lonelyStreetBasementModelObjects.map(
          (object) => object.asset?.data_url,
        ),
      ).size === 18,
  );
  ok(
    "the supplied Moon God GLB is a large, self-contained, game-budget apparition frozen directly in front of the refrigerator",
    moonGodObject?.model_kind === "asset" &&
      moonGodObject.asset?.data_url === "/models/entities/moon-god.glb" &&
      moonGodObject.asset.stats.meshes === 1 &&
      moonGodObject.asset.stats.vertices === 5642 &&
      moonGodObject.asset.stats.triangles === 4285 &&
      moonGodObject.asset.stats.materials === 1 &&
      moonGodObject.asset.stats.textures === 1 &&
      moonGodObject.asset.stats.bytes === 6562332 &&
      moonGodObject.asset.scale[0] === 2.5 &&
      moonGodObject.asset.scale[1] === 3.28 &&
      moonGodObject.asset.scale[2] === 2.5 &&
      // ~1.33x PLAYER_COLLISION_HEIGHT (1.8m): taller than Steve while
      // clearing the basement's real 2.74m flat ceiling (not the ~4.6m
      // overall bounding box, which is inflated by the separate stairwell
      // shaft mesh) with room to spare.
      Math.abs(moonGodObject.bounds[1] - 2.40234375) < 0.000001 &&
      moonGodObject.collision?.profile === "none" &&
      moonGodEntity?.model_object_id === MOON_GOD_MODEL_OBJECT_ID &&
      moonGodPlacement?.entity_id === MOON_GOD_ENTITY_ID &&
      moonGodPlacement.cell[0] === 1 &&
      moonGodPlacement.cell[1] === -2 &&
      // Solid: Steve must interact with it rather than walk past it to the
      // fridge (see the dedicated gating test below).
      moonGodPlacement.collision_mode === "solid" &&
      moonGodPlacement.presentation_anchor?.object_placement_id ===
        MOON_GOD_FRIDGE_ANCHOR_PLACEMENT_ID &&
      moonGodPlacement.presentation_anchor.lock_to_anchor === true &&
      moonGodPlacement.presentation_anchor.revision ===
        MOON_GOD_STATIC_ANCHOR_REVISION &&
      moonGodPlacement.presentation_anchor.local_facing?.[0] === 0 &&
      moonGodPlacement.presentation_anchor.local_facing?.[1] === 1 &&
      Math.abs(
        moonGodPlacement.presentation_anchor.local_position[2] - 4 / 3,
      ) < 0.000001 &&
      moonGodPlacement.schedule?.length === 1 &&
      moonGodPlacement.schedule[0]?.hour === 0 &&
      moonGodPlacement.schedule[0].cell[0] === 1 &&
      moonGodPlacement.schedule[0].cell[1] === -2 &&
      basementFridge?.cell[0] === 1 &&
      basementFridge.cell[1] === -3,
    JSON.stringify({
      asset: moonGodObject?.asset,
      moonGodBounds: moonGodObject?.bounds,
      moonGod: moonGodPlacement?.cell,
      fridge: basementFridge?.cell,
    }),
  );
  // The basement shell's overall bounding-box height (~4.6m) belongs to its
  // separate stairwell-shaft mesh, not the room. The real flat ceiling —
  // measured directly from basement-shell.glb's "Concrete_Weathered" mesh —
  // sits at local Y 2.60m, and the shell placement's -0.14m height_offset
  // grounds the floor at world Y 0, so the room's true clearance is 2.74m.
  // A previous revision scaled the Moon God against the taller bounding box
  // by mistake and it visibly poked through the ceiling in play. Guard the
  // real number here so a future size change can't repeat that.
  const BASEMENT_MEASURED_CEILING_WORLD_Y = 2.6 - -0.14;
  ok(
    "the Moon God clears the basement's real flat ceiling, not its stairwell-inflated bounding box",
    Boolean(
      moonGodObject &&
        moonGodObject.bounds[1] > 0 &&
        moonGodObject.bounds[1] < BASEMENT_MEASURED_CEILING_WORLD_Y,
    ),
    `moon god height ${moonGodObject?.bounds[1]} vs ceiling ${BASEMENT_MEASURED_CEILING_WORLD_Y}`,
  );
  ok(
    "basement entry explicitly stops music and Moon God says Steve's line before being erased",
    basementSilenceTrigger?.type === "on_load" &&
      basementSilenceTrigger.cutscene_id ===
        BASEMENT_ENTRY_SILENCE_CUTSCENE_ID &&
      basementSilenceCutscene?.actions.length === 1 &&
      basementSilenceCutscene.actions[0]?.type === "play_music" &&
      !Object.prototype.hasOwnProperty.call(
        basementSilenceCutscene.actions[0],
        "music_id",
      ) &&
      moonGodTrigger?.type === "interact" &&
      moonGodTrigger.once === true &&
      moonGodTrigger.cutscene_id === MOON_GOD_VANISH_CUTSCENE_ID &&
      moonGodDialogue?.nodes[0]?.speaker === "Steve" &&
      moonGodDialogue.nodes[0].text === "Moon God..." &&
      moonGodCutscene?.actions[0]?.type === "show_dialogue" &&
      moonGodCutscene.actions[0].dialogue_id === MOON_GOD_DIALOGUE_ID &&
      moonGodCutscene.actions[1]?.type === "set_entity_hidden" &&
      moonGodCutscene.actions[1].entity_id === MOON_GOD_ENTITY_ID &&
      moonGodCutscene.actions[1].hidden === true,
  );
  ok(
    "the refrigerator grants one 15-pack, marks the objective complete, and unlocks the return stairs",
    basementBeerTrigger?.type === "interact" &&
      basementBeerTrigger.once === true &&
      basementBeerTrigger.cutscene_id === BASEMENT_BEER_CUTSCENE_ID &&
      basementBeerTrigger.conditions.some(
        (condition) =>
          condition.switch_id === BASEMENT_BEER_ACQUIRED_SWITCH_ID &&
          condition.expected_value === false,
      ) &&
      beerDialogue?.nodes[0]?.speaker === "Steve" &&
      beerDialogue.nodes[0].text === "Beer acquired" &&
      basementBeerCutscene?.actions.some(
        (action) =>
          action.type === "give_item" &&
          action.item_id === BASEMENT_BEER_ITEM_ID &&
          action.amount === 1,
      ) === true &&
      basementBeerCutscene.actions.some(
        (action) =>
          action.type === "set_switch" &&
          action.switch_id === BASEMENT_BEER_ACQUIRED_SWITCH_ID &&
          action.switch_value === true,
      ) &&
      basementBeerItem?.display_name === "15-Pack of Beer" &&
      basementBeerItem.spatial?.stack_limit === 1 &&
      lonelyStreetBasementExit?.condition?.switch ===
        BASEMENT_BEER_ACQUIRED_SWITCH_ID &&
      lonelyStreetBasementExit.condition.switch_value === true,
  );
  ok(
    "the canonical basement spawn starts clear of the stair collider",
    lonelyStreetBasementSpawn?.cell[0] === 1 &&
      lonelyStreetBasementSpawn.cell[1] === 2 &&
      lonelyStreetBasementSpawn.facing[0] === 1 &&
      lonelyStreetBasementSpawn.facing[1] === 0,
    JSON.stringify(lonelyStreetBasementSpawn),
  );
  const basementCeilingOpeningCellKeys = expandedLonelyStreetBasement
    ? resolveDerivedCeilingOpeningCellKeys(
        expandedLonelyStreetBasement.custom_object_placements,
        fineObjectById,
      )
    : new Set<string>();
  ok(
    "derived ceilings preserve the fitted basement stairwell opening",
    basementCeilingOpeningCellKeys.size > 0 &&
      basementCeilingOpeningCellKeys.has("12:0") &&
      !basementCeilingOpeningCellKeys.has("0:0"),
    `openings=${basementCeilingOpeningCellKeys.size}`,
  );
  ok(
    "the basement uses only its authored warm practical lights",
    lonelyStreetBasementMap?.auto_ceiling_lights === false &&
      lonelyStreetBasementMap.presentation_ambient_light === 0.5 &&
      withQaRoomCeilingArchitecture(lonelyStreetBasementMap) ===
        lonelyStreetBasementMap &&
      lonelyStreetBasementMap.custom_object_placements.every(
        (placement) => !qaCeilingFixtureIds.has(placement.object_id),
      ) &&
      lonelyStreetBasementBareBulb?.collision_mode === "none" &&
      lonelyStreetBasementStairSconce?.collision_mode === "none" &&
      lonelyStreetBasementBareBulbObject?.light_source?.mobility === "fixed" &&
      lonelyStreetBasementStairSconceObject?.light_source?.mobility === "fixed" &&
      lonelyStreetBasementBareBulbObject.light_source.active_by_default ===
        true &&
      lonelyStreetBasementStairSconceObject.light_source.active_by_default ===
        true,
  );
  ok(
    "the stair sconce resolves at its authoritative visible-fixture height",
    resolvedBasementStairSconce?.intensity === 0.75 &&
      resolvedBasementStairSconce.radius === 9 &&
      Math.abs(Number(resolvedBasementStairSconce.render_height) - 4.29) <
        0.001,
    JSON.stringify(resolvedBasementStairSconce),
  );
  ok(
    "the house and basement stairs form a reciprocal paired transition on walkable cells",
    Boolean(lonelyStreetHouseBasementExit) &&
      Boolean(lonelyStreetBasementExit) &&
      Boolean(lonelyStreetHouseBasementReturnSpawn) &&
      Boolean(lonelyStreetBasementSpawn) &&
      lonelyStreetHouseBasementExit?.paired_exit_id ===
        lonelyStreetBasementExit?.id &&
      lonelyStreetBasementExit?.paired_exit_id ===
        lonelyStreetHouseBasementExit?.id &&
      lonelyStreetHouseBasementExit?.transition_id ===
        LONELY_STREET_BASEMENT_TRANSITION_ID &&
      lonelyStreetBasementExit?.transition_id ===
        LONELY_STREET_BASEMENT_TRANSITION_ID &&
      lonelyStreetHouseBasementExit?.transition_kind === "stairs" &&
      lonelyStreetBasementExit?.transition_kind === "stairs" &&
      lonelyStreetInteriorCellAt(
        lonelyStreetHouseBasementExit?.cell[0] ?? Number.NaN,
        lonelyStreetHouseBasementExit?.cell[1] ?? Number.NaN,
      )?.walkable === true &&
      lonelyStreetInteriorCellAt(
        lonelyStreetHouseBasementReturnSpawn?.cell[0] ?? Number.NaN,
        lonelyStreetHouseBasementReturnSpawn?.cell[1] ?? Number.NaN,
      )?.walkable === true &&
      lonelyStreetBasementCellAt(
        lonelyStreetBasementSpawn?.cell[0] ?? Number.NaN,
        lonelyStreetBasementSpawn?.cell[1] ?? Number.NaN,
      )?.walkable === true &&
      lonelyStreetBasementCellAt(
        lonelyStreetBasementExit?.cell[0] ?? Number.NaN,
        lonelyStreetBasementExit?.cell[1] ?? Number.NaN,
      )?.walkable === true,
  );

  const backroomsMap = mapById.get(BACKROOMS_LEVEL_ZERO_MAP_ID);
  ok(
    "Level Zero has no exit into the developer QA suite",
    backroomsMap?.exits.some(
      (mapExit) => mapExit.target_map_id === TEST_SUITE_START_MAP_ID,
    ) === false,
  );
  const backroomsFloor = authored.object_library.find(
    (object) => object.id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  );
  const backroomsWall = authored.object_library.find(
    (object) => object.id === BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  );
  const backroomsLight = authored.object_library.find(
    (object) => object.id === BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  );
  const backroomsParasite = authored.entities.find(
    (entity) => entity.id === BACKROOMS_PARASITE_ENTITY_ID,
  );
  const backroomsParasiteModel = authored.object_library.find(
    (object) => object.id === BACKROOMS_PARASITE_MODEL_OBJECT_ID,
  );
  const backroomsParasitePlacements =
    backroomsMap?.entity_placements.filter(
      (placement) => placement.entity_id === BACKROOMS_PARASITE_ENTITY_ID,
    ) || [];
  const backroomsLightDiffuser = backroomsLight?.material_settings?.find(
    (material) => material.id === "mat_backrooms_level_zero_diffuser",
  );
  const backroomsLightBacker = backroomsLight?.material_settings?.find(
    (material) => material.id === "mat_backrooms_level_zero_ceiling_tile",
  );
  const backroomsLightHousing = backroomsLight?.material_settings?.find(
    (material) => material.id === "mat_backrooms_level_zero_fixture_metal",
  );
  const backroomsLightTubes = backroomsLight?.material_settings?.find(
    (material) => material.id === "mat_backrooms_level_zero_fluorescent_tube",
  );
  const backroomsWalkableCells =
    backroomsMap?.cells.filter(
      (cell) => cell.active !== false && cell.walkable,
    ) || [];
  const backroomsWallCells =
    backroomsMap?.cells.filter(
      (cell) => cell.object_id === BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
    ) || [];
  const backroomsLights =
    backroomsMap?.custom_object_placements.filter(
      (placement) =>
        placement.object_id === BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
    ) || [];
  const backroomsCellKey = (cell: readonly [number, number]) =>
    `${cell[0]}:${cell[1]}`;
  const walkableBackroomsKeys = new Set(
    backroomsWalkableCells.map((cell) => backroomsCellKey([cell.x, cell.z])),
  );
  const backroomsSpawn = backroomsMap?.spawns.find(
    (spawn) => spawn.id === BACKROOMS_LEVEL_ZERO_SPAWN_ID,
  );
  const reachableBackroomsKeys = new Set<string>();
  const connectivityQueue: [number, number][] = backroomsSpawn
    ? [[backroomsSpawn.cell[0], backroomsSpawn.cell[1]]]
    : [];
  for (let index = 0; index < connectivityQueue.length; index += 1) {
    const current = connectivityQueue[index];
    const currentKey = backroomsCellKey(current);
    if (
      reachableBackroomsKeys.has(currentKey) ||
      !walkableBackroomsKeys.has(currentKey)
    ) {
      continue;
    }
    reachableBackroomsKeys.add(currentKey);
    (
      [
        [current[0] + 1, current[1]],
        [current[0] - 1, current[1]],
        [current[0], current[1] + 1],
        [current[0], current[1] - 1],
      ] as [number, number][]
    ).forEach((neighbor) => {
      if (
        walkableBackroomsKeys.has(backroomsCellKey(neighbor)) &&
        !reachableBackroomsKeys.has(backroomsCellKey(neighbor))
      ) {
        connectivityQueue.push(neighbor);
      }
    });
  }

  ok(
    "Level Zero reuses its authored carpet and wallpaper objects across the map",
    backroomsFloor?.tags.includes("backrooms") === true &&
      backroomsFloor.tags.includes("floor") &&
      backroomsFloor.collision?.profile === "none" &&
      backroomsWall?.tags.includes("backrooms") === true &&
      backroomsWall.tags.includes("wall") &&
      backroomsWall.collision?.profile !== "none" &&
      backroomsWalkableCells.every(
        (cell) => cell.object_id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      ) &&
      backroomsWallCells.every((cell) => !cell.walkable && cell.blocks_los),
  );
  const fineBackroomsMap = fine.maps.find(
    (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
  );
  const fineBackroomsCellAt = (x: number, z: number) =>
    fineBackroomsMap?.cells.find((entry) => entry.x === x && entry.z === z);
  const thinWallOrigin = [-2 * FINE_PER_MACRO, -10 * FINE_PER_MACRO] as const;
  const thinWallCenterZ = thinWallOrigin[1] + Math.floor(FINE_PER_MACRO / 2);
  ok(
    "Level Zero supports real one-microtile partitions with floor on both sides",
    (backroomsMap?.fine_cell_overrides?.length || 0) > 0 &&
      Array.from({ length: FINE_PER_MACRO }, (_, offsetX) => {
        const x = thinWallOrigin[0] + offsetX;
        const wall = fineBackroomsCellAt(x, thinWallCenterZ);
        const nearFloor = fineBackroomsCellAt(x, thinWallOrigin[1]);
        const farFloor = fineBackroomsCellAt(
          x,
          thinWallOrigin[1] + FINE_PER_MACRO - 1,
        );
        return (
          wall?.object_id === BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID &&
          wall.walkable === false &&
          wall.blocks_los === true &&
          nearFloor?.object_id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID &&
          nearFloor.walkable === true &&
          nearFloor.blocks_los === false &&
          farFloor?.object_id === BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID &&
          farFloor.walkable === true &&
          farFloor.blocks_los === false
        );
      }).every(Boolean),
  );
  ok(
    "Level Zero fluorescent fixtures are environmental and collision-free",
    backroomsLight?.tags.includes("presentation_room_light") === true &&
      backroomsLight.tags.includes("light_ceiling") &&
      backroomsLight.collision?.profile === "none" &&
      backroomsLights.every(
        (placement) =>
          placement.collision_mode === "none" &&
          placementHasCollision(placement, backroomsLight) === false,
      ),
  );
  ok(
    "Level Zero fixture emission preserves diffuser and tube detail instead of clipping white",
    (backroomsLightDiffuser?.emissive_intensity ?? 0) > 0 &&
      (backroomsLightDiffuser?.emissive_intensity ??
        Number.POSITIVE_INFINITY) <= 0.5 &&
      (backroomsLightTubes?.emissive_intensity ?? 0) >
        (backroomsLightDiffuser?.emissive_intensity ?? 0) &&
      (backroomsLightTubes?.emissive_intensity ?? Number.POSITIVE_INFINITY) <=
        1,
  );
  ok(
    "Level Zero fixture backer and housing retain shaded detail inside the halo",
    (backroomsLightBacker?.emissive_intensity ?? 0) > 0 &&
      (backroomsLightBacker?.emissive_intensity ?? Number.POSITIVE_INFINITY) <=
        0.25 &&
      (backroomsLightHousing?.emissive_intensity ?? 0) > 0 &&
      (backroomsLightHousing?.emissive_intensity ?? Number.POSITIVE_INFINITY) <=
        0.25 &&
      (backroomsLightHousing?.metalness ?? Number.POSITIVE_INFINITY) <= 0.2,
  );
  ok(
    "Level Zero contains one standard model-backed parasite and no loose loot",
    backroomsMap?.entity_placements.length === 1 &&
      backroomsParasitePlacements.length === 1 &&
      Boolean(
        backroomsParasitePlacements[0] &&
        walkableBackroomsKeys.has(
          backroomsCellKey(
            backroomsParasitePlacements[0].cell as [number, number],
          ),
        ),
      ) &&
      backroomsParasite?.is_npc === false &&
      backroomsMap?.combat_mode === "horror_realtime" &&
      backroomsParasite?.independent_movement?.enabled === true &&
      backroomsParasite?.independent_movement?.interval_ms === 180 &&
      backroomsParasite?.independent_movement?.steps_per_pulse === 2 &&
      (backroomsParasite?.independent_movement?.activation_radius ?? 0) >= 48 &&
      backroomsParasite?.horror_combat?.windup_ms === 500 &&
      backroomsParasite.horror_combat.active_ms === 120 &&
      backroomsParasite.horror_combat.recovery_ms === 850 &&
      backroomsParasite.horror_combat.reach_fine_cells === 2 &&
      backroomsParasite.horror_combat.lunge_fine_cells === 2 &&
      backroomsParasite.horror_combat.direction_lock_fraction === 0.6 &&
      Number(
        authored.settings?.movement_hearing?.normal_movement_loudness || 0,
      ) >= 6.5 &&
      Number(
        authored.settings?.movement_hearing?.stealth_noise_multiplier ??
          Number.POSITIVE_INFINITY,
      ) <= 0.1 &&
      (backroomsParasite?.sensory_profile?.memory_ticks ?? 0) >= 240 &&
      (backroomsParasite?.sensory_profile?.search_ticks ?? 0) >= 180 &&
      backroomsParasite?.sensory_profile?.search_steps === 2 &&
      backroomsParasite?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("visible_player") &&
          channel.range >= 100 &&
          channel.requires_los &&
          channel.requires_view_cone &&
          channel.tracks_live_target &&
          !channel.requires_illumination,
      ) === true &&
      backroomsParasite?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("sound") &&
          channel.range >= 20 &&
          !channel.requires_los &&
          channel.barrier_response === "reduced" &&
          !channel.tracks_live_target,
      ) === true &&
      backroomsParasite?.model_object_id ===
        BACKROOMS_PARASITE_MODEL_OBJECT_ID &&
      backroomsParasiteModel?.model_kind === "asset" &&
      backroomsParasiteModel.asset?.data_url ===
        "/models/entities/parasite1.glb" &&
      backroomsParasiteModel.asset.animation_clips === undefined &&
      backroomsMap.item_placements.length === 0 &&
      backroomsMap.container_placements.length === 0,
  );
  ok(
    "Level Zero has a walkable spawn and a sealed boundary with no QA return",
    Boolean(backroomsSpawn) &&
      walkableBackroomsKeys.has(
        backroomsCellKey([
          backroomsSpawn?.cell[0] ?? Number.NaN,
          backroomsSpawn?.cell[1] ?? Number.NaN,
        ]),
      ) &&
      backroomsMap?.exits.length === 0 &&
      mapById
        .get(TEST_SUITE_START_MAP_ID)
        ?.exits.some(
          (mapExit) =>
            mapExit.target_map_id === BACKROOMS_LEVEL_ZERO_MAP_ID &&
            mapExit.target_spawn_id === BACKROOMS_LEVEL_ZERO_SPAWN_ID,
        ) === true,
  );
  ok(
    "every Level Zero walkable cell is connected to its spawn",
    backroomsWalkableCells.length > 0 &&
      reachableBackroomsKeys.size === backroomsWalkableCells.length,
    `reachable=${reachableBackroomsKeys.size}/${backroomsWalkableCells.length}`,
  );
  ok(
    "Level Zero has sufficient labyrinth and fluorescent-fixture scale",
    (backroomsMap?.width || 0) >= 33 &&
      (backroomsMap?.height || 0) >= 33 &&
      backroomsWalkableCells.length >= 800 &&
      backroomsWallCells.length >= 250 &&
      backroomsLights.length >= 25,
    `size=${backroomsMap?.width}x${backroomsMap?.height}, walkable=${backroomsWalkableCells.length}, walls=${backroomsWallCells.length}, fixtures=${backroomsLights.length}`,
  );

  const perceptionMap = mapById.get("qa_perception_lab");
  const portableLamp = authored.items.find(
    (item) => item.id === "qa_portable_lamp",
  );
  const darkArtifact = authored.items.find(
    (item) => item.id === "qa_dark_artifact",
  );
  const perceptionEntities = [
    "qa_sight_watcher",
    "qa_sound_hunter",
    "qa_light_glass_watcher",
  ].map((id) => authored.entities.find((entity) => entity.id === id));

  ok(
    "perception lab authors true zero ambient light",
    perceptionMap?.ambient_light === 0,
    `ambient=${perceptionMap?.ambient_light}`,
  );
  ok(
    "portable QA lamp is a persistent radius-14 throwable light that exposes its carrier",
    portableLamp?.light_source?.mobility === "throwable" &&
      portableLamp.light_source.persistent === true &&
      portableLamp.light_source.exposes_carrier === true &&
      portableLamp.light_source.intensity > 0 &&
      portableLamp.light_source.radius === 14 &&
      portableLamp.light_source.stimulus_tags.includes("glass") &&
      perceptionMap?.item_placements.some(
        (placement) => placement.item_id === portableLamp.id,
      ) === true,
  );

  const [sightWatcher, soundHunter, glassWatcher] = perceptionEntities;
  const sensoryProfileIds = perceptionEntities
    .map((entity) => entity?.sensory_profile?.id)
    .filter((id): id is string => Boolean(id));
  ok(
    "perception lab has three distinct, channel-authored sensory profiles",
    perceptionEntities.every((entity) =>
      Boolean(entity?.sensory_profile?.channels.length),
    ) &&
      new Set(sensoryProfileIds).size === 3 &&
      sightWatcher?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("visible_player") &&
          channel.requires_los &&
          channel.requires_view_cone &&
          channel.requires_illumination,
      ) === true &&
      soundHunter?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("sound") &&
          !channel.requires_los &&
          !channel.requires_illumination,
      ) === true &&
      glassWatcher?.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("light") &&
          channel.stimulus_tags?.includes("glass"),
      ) === true,
  );
  ok(
    "perception lab includes interior LOS occlusion and tagged smoke",
    perceptionMap?.cells.some(
      (cell) =>
        cell.blocks_los && Math.abs(cell.x) < 10 && Math.abs(cell.z) < 10,
    ) === true &&
      perceptionMap.cells.some(
        (cell) => cell.hazard === "smoke" && cell.tag === "smoke_obscurance",
      ),
  );
  ok(
    "dark artifact is placed as a non-emissive control",
    Boolean(darkArtifact) &&
      !darkArtifact?.light_source &&
      perceptionMap?.item_placements.some(
        (placement) => placement.item_id === darkArtifact?.id,
      ) === true,
  );
  ok(
    "perception lab has fixed/noise props and a return to the canonical hub spawn",
    perceptionMap?.custom_object_placements.some(
      (placement) =>
        placement.id === "qa_fixed_environment_lamp" &&
        placement.object_id === "obj_oil_lamp",
    ) === true &&
      perceptionMap.custom_object_placements.some(
        (placement) =>
          placement.id === "qa_noise_crate" &&
          placement.object_id === "obj_crate",
      ) &&
      perceptionMap.exits.some(
        (mapExit) =>
          mapExit.target_map_id === TEST_SUITE_START_MAP_ID &&
          mapExit.target_spawn_id === TEST_SUITE_START_SPAWN_ID,
      ),
  );

  const persistenceMap = mapById.get("qa_persistence_lab");
  const persistenceDoor = persistenceMap?.custom_object_placements.find(
    (placement) => placement.id === "qa_persistence_shortcut",
  );
  const persistenceHostile = persistenceMap?.entity_placements.find(
    (placement) => placement.id === "qa_persistence_hostile_placement",
  );
  const persistenceArtifact = authored.items.find(
    (item) => item.id === "qa_persistence_artifact",
  );
  const persistenceGlass = authored.items.find(
    (item) => item.id === "qa_persistence_glass",
  );
  const persistenceLamp = authored.items.find(
    (item) => item.id === "qa_persistence_emergency_lamp",
  );
  const worldStatePolicy = authored.settings.world_state_policy as
    | {
        campaign_switch_ids?: string[];
        expedition_switch_ids?: string[];
        persistent_door_ids?: Record<string, string[]>;
        persistent_item_ids?: Record<string, string[]>;
      }
    | undefined;
  const succession = authored.settings.intercessor_succession as
    | {
        enabled?: boolean;
        hub_map_id?: string;
        hub_spawn_id?: string;
        name_prefixes?: string[];
        name_roots?: string[];
        name_suffixes?: string[];
        duplicate_name_policy?: string;
        history_keyword_id?: string;
        base_known_skills?: string[];
      }
    | undefined;
  const historyKeyword = authored.keywords.find(
    (keyword) => keyword.id === succession?.history_keyword_id,
  );

  ok(
    "persistence lab has a wall-divided annex and stable shortcut door",
    persistenceMap?.cells
      .filter(
        (cell) => cell.z === 0 && cell.x >= -7 && cell.x <= 7 && cell.x !== 0,
      )
      .every((cell) => cell.blocks_los && !cell.walkable) === true &&
      persistenceMap.cells.some(
        (cell) =>
          cell.x === 0 && cell.z === 0 && cell.walkable && !cell.blocks_los,
      ) &&
      persistenceDoor?.object_id === "obj_p_door",
  );
  ok(
    "persistence lab authors resettable and campaign-scoped world fixtures",
    persistenceMap?.item_placements.some(
      (placement) => placement.id === "qa_persistence_artifact_placement",
    ) === true &&
      persistenceMap.item_placements.some(
        (placement) => placement.id === "qa_persistence_ordinary_placement",
      ) &&
      persistenceHostile?.entity_id === "qa_persistence_hostile" &&
      persistenceMap.custom_object_placements.some(
        (placement) =>
          placement.object_id === "obj_crate" && placement.cell[1] > 0,
      ),
  );
  ok(
    "persistence lab provides campaign, hazard, signature, and lethal succession terminals",
    [
      "qa_trig_persistence_campaign",
      "qa_trig_persistence_hazard",
      "qa_trig_persistence_signature",
      "qa_trig_persistence_succession",
    ].every((id) =>
      persistenceMap?.triggers.some((trigger) => trigger.id === id),
    ) &&
      authored.cutscenes.some(
        (cutscene) =>
          cutscene.id === "qa_cut_persistence_campaign" &&
          cutscene.actions.some(
            (action) =>
              action.type === "set_switch" &&
              action.switch_id === "qa_persistence_major",
          ),
      ) &&
      authored.cutscenes.some(
        (cutscene) =>
          cutscene.id === "qa_cut_persistence_hazard" &&
          cutscene.actions.some((action) => action.type === "chem_spill") &&
          cutscene.actions.some(
            (action) =>
              action.type === "set_switch" &&
              action.switch_id === "qa_persistence_hazard",
          ),
      ) &&
      authored.cutscenes.some(
        (cutscene) =>
          cutscene.id === "qa_cut_persistence_signature" &&
          cutscene.actions.some(
            (action) =>
              action.type === "learn_skill" &&
              action.skill_id === "qa_skill_first_aid",
          ),
      ) &&
      authored.cutscenes.some(
        (cutscene) =>
          cutscene.id === "qa_cut_persistence_succession" &&
          cutscene.actions.some(
            (action) =>
              action.type === "modify_player_stats" &&
              (action.stats?.hp || 0) < 0,
          ),
      ),
  );
  ok(
    "persistence lab authors the Phase 6-8 artifact and Glass tradeoff fixtures",
    persistenceArtifact?.artifact?.artifact_id ===
      "artifact:qa:violet_archive_seal" &&
      persistenceArtifact.artifact.recovery_value === 90 &&
      persistenceMap?.item_placements.some(
        (placement) =>
          placement.id === "qa_persistence_glass_placement" &&
          placement.item_id === persistenceGlass?.id &&
          placement.count === 6,
      ) === true &&
      persistenceGlass?.glass_resource?.recovery_value_per_unit === 12 &&
      persistenceGlass.glass_resource.burden_per_unit === 0.2 &&
      persistenceMap.item_placements.some(
        (placement) =>
          placement.id === "qa_persistence_emergency_lamp_placement" &&
          placement.item_id === persistenceLamp?.id,
      ) &&
      persistenceLamp?.glass_fuel?.resource_item_id === persistenceGlass?.id &&
      persistenceLamp.glass_fuel.units_per_ignition === 1 &&
      persistenceLamp.light_source?.active_by_default === false &&
      persistenceLamp.light_source.stimulus_tags.includes("light") &&
      persistenceLamp.light_source.stimulus_tags.includes("glass"),
  );
  ok(
    "persistence lab returns to the canonical hub and is curator-accessible",
    persistenceMap?.exits.some(
      (mapExit) =>
        mapExit.target_map_id === TEST_SUITE_START_MAP_ID &&
        mapExit.target_spawn_id === TEST_SUITE_START_SPAWN_ID,
    ) === true &&
      authored.cutscenes.some(
        (cutscene) =>
          cutscene.id === "qa_cut_to_persistence" &&
          cutscene.actions.some(
            (action) =>
              action.type === "teleport_player" &&
              action.map_id === "qa_persistence_lab",
          ),
      ),
  );
  ok(
    "QA world-state policy distinguishes campaign and expedition fixtures",
    worldStatePolicy?.campaign_switch_ids?.includes("qa_persistence_major") ===
      true &&
      worldStatePolicy.expedition_switch_ids?.includes(
        "qa_persistence_hazard",
      ) === true &&
      worldStatePolicy.persistent_door_ids?.qa_persistence_lab?.includes(
        "qa_persistence_shortcut",
      ) === true &&
      worldStatePolicy.persistent_item_ids?.qa_persistence_lab?.includes(
        "qa_persistence_artifact_placement",
      ) === true,
  );
  ok(
    "QA succession policy names a valid hub and dynamic history topic",
    succession?.enabled === true &&
      succession.hub_map_id === TEST_SUITE_START_MAP_ID &&
      succession.hub_spawn_id === TEST_SUITE_START_SPAWN_ID &&
      Boolean(succession.name_prefixes?.length) &&
      Boolean(succession.name_roots?.length) &&
      Boolean(succession.name_suffixes?.length) &&
      succession.duplicate_name_policy === "avoid" &&
      succession.base_known_skills?.length === 0 &&
      historyKeyword?.dynamic_capable === true &&
      historyKeyword.category === "intercessors",
  );

  const checkActions = (owner: string, actions: EventActionData[]) => {
    for (const action of actions) {
      if (action.dialogue_id && !dialogueIds.has(action.dialogue_id))
        problems.push(`${owner}: missing dialogue ${action.dialogue_id}`);
      if (action.map_id && !mapById.has(action.map_id))
        problems.push(`${owner}: missing map ${action.map_id}`);
      if (action.item_id && !itemIds.has(action.item_id))
        problems.push(`${owner}: missing item ${action.item_id}`);
      if (action.skill_id && !skillIds.has(action.skill_id))
        problems.push(`${owner}: missing skill ${action.skill_id}`);
      if (action.shop_id && !shopIds.has(action.shop_id))
        problems.push(`${owner}: missing shop ${action.shop_id}`);
      if (action.document_id && !documentIds.has(action.document_id))
        problems.push(`${owner}: missing document ${action.document_id}`);
      if (action.entity_id && !entityIds.has(action.entity_id))
        problems.push(`${owner}: missing entity ${action.entity_id}`);
      if (action.faction_id && !factionIds.has(action.faction_id))
        problems.push(`${owner}: missing faction ${action.faction_id}`);
      if (action.ending_id && !endingIds.has(action.ending_id))
        problems.push(`${owner}: missing ending ${action.ending_id}`);
      if (action.type === "chem_spill" && !action.cell)
        problems.push(`${owner}: chem_spill without a cell`);
    }
  };
  authored.cutscenes
    .filter((cutscene) => cutscene.id.startsWith("qa_"))
    .forEach((cutscene) =>
      checkActions(`cutscene ${cutscene.id}`, cutscene.actions),
    );

  for (const map of qaMaps) {
    const spawnIds = new Set(map.spawns.map((spawn) => spawn.id));
    void spawnIds;
    for (const mapExit of map.exits || []) {
      const target = mapById.get(mapExit.target_map_id);
      if (!target) {
        problems.push(
          `map ${map.id}: exit to missing map ${mapExit.target_map_id}`,
        );
        continue;
      }
      if (
        mapExit.target_spawn_id &&
        !target.spawns.some((spawn) => spawn.id === mapExit.target_spawn_id)
      )
        problems.push(
          `map ${map.id}: exit to ${mapExit.target_map_id} missing spawn ${mapExit.target_spawn_id}`,
        );
    }
    for (const trigger of map.triggers || []) {
      if (!cutsceneIds.has(trigger.cutscene_id))
        problems.push(
          `map ${map.id}: trigger ${trigger.id} missing cutscene ${trigger.cutscene_id}`,
        );
    }
    for (const placement of map.entity_placements || []) {
      if (!entityIds.has(placement.entity_id))
        problems.push(
          `map ${map.id}: placement of missing entity ${placement.entity_id}`,
        );
    }
    for (const placement of map.item_placements || []) {
      if (!itemIds.has(placement.item_id))
        problems.push(
          `map ${map.id}: placement of missing item ${placement.item_id}`,
        );
    }
    for (const placement of map.custom_object_placements || []) {
      if (placement.dialogue_id && !dialogueIds.has(placement.dialogue_id))
        problems.push(
          `map ${map.id}: object with missing dialogue ${placement.dialogue_id}`,
        );
    }
    for (const container of map.container_placements || []) {
      for (const stack of container.items || []) {
        if (!itemIds.has(stack.item_id))
          problems.push(
            `map ${map.id}: container with missing item ${stack.item_id}`,
          );
      }
      if (container.key_item_id && !itemIds.has(container.key_item_id))
        problems.push(
          `map ${map.id}: container with missing key ${container.key_item_id}`,
        );
    }
  }
  for (const entity of authored.entities.filter((e) =>
    e.id.startsWith("qa_"),
  )) {
    if (entity.dialogue_id && !dialogueIds.has(entity.dialogue_id))
      problems.push(
        `entity ${entity.id}: missing dialogue ${entity.dialogue_id}`,
      );
    for (const skillId of entity.skills || []) {
      if (!skillIds.has(skillId))
        problems.push(`entity ${entity.id}: missing skill ${skillId}`);
    }
  }
  for (const station of authored.simulation_workstations.filter((w) =>
    w.id.startsWith("qa_"),
  )) {
    if (!mapById.has(station.map_id))
      problems.push(`workstation ${station.id}: missing map ${station.map_id}`);
    for (const processId of station.process_ids) {
      if (!authored.simulation_processes.some((proc) => proc.id === processId))
        problems.push(
          `workstation ${station.id}: missing process ${processId}`,
        );
    }
  }
  const dialogueCutsceneRefs = authored.dialogue
    .filter((d) => d.id.startsWith("qa_"))
    .flatMap((d) =>
      d.nodes.flatMap((n) =>
        n.options.map((o) => o.trigger_cutscene).filter(Boolean),
      ),
    );
  for (const ref of dialogueCutsceneRefs) {
    if (ref && !cutsceneIds.has(ref))
      problems.push(`dialogue option: missing cutscene ${ref}`);
  }

  ok(
    "all suite references resolve",
    problems.length === 0,
    problems.slice(0, 8).join(" | "),
  );
  ok(
    "fine expansion multiplies map dimensions",
    fine.maps.every((map) => {
      const source = mapById.get(map.id);
      return !source || map.width === source.width * FINE_PER_MACRO;
    }),
  );
}

// ── Part 2: chemistry acceptance on the authored rooms ───────────────────────
const makeSave = (mapId: string, playerMacro: [number, number]): PlaySave => {
  const playerFine = fineCenterOfMacro(playerMacro);
  return {
    schema: "crpg_engine_save_v1",
    package_version: fine.metadata.version,
    fine_ratio: FINE_PER_MACRO,
    current_map_id: mapId,
    player: { cell: [playerFine[0], playerFine[1]], facing: [0, -1] },
    playerStats: {
      hp: 20,
      max_hp: 20,
      mp: 5,
      max_mp: 5,
      attack: 3,
      defense: 1,
      speed: 10,
      energy: 1000,
    },
    known_skills: [],
    flags: {},
    quests: {},
    inventory: [],
    money: 0,
    entity_states: {},
    party_members: [],
    clock_minutes: 1,
  } as unknown as PlaySave;
};

{
  const standingSave = makeSave(
    LONELY_STREET_HOUSE_INTERIOR_MAP_ID,
    STEVE_SOFA_STANDING_CELL,
  );
  const forwardAfterArrival = dispatchV1MoveEntity({
    gamePackage: fine,
    save: {
      ...standingSave,
      player: { ...standingSave.player, facing: [0, -1] },
    },
    dx: 0,
    dy: -1,
    facingOverride: [0, -1],
  });
  ok(
    "Steve can walk forward as soon as the couch cutscene releases control",
    forwardAfterArrival.ok &&
      forwardAfterArrival.save.player.cell[0] === standingSave.player.cell[0] &&
      forwardAfterArrival.save.player.cell[1] ===
        standingSave.player.cell[1] - 1,
    forwardAfterArrival.reason,
  );
}

// ── Furniture-anchored actors must not hold grid space ──────────────────────
// Riley is posed on the sofa, but her authoritative cell is the walkable floor
// in FRONT of it. The v1 core's occupancy rule ignored collision_mode, so her
// 3x3 footprint became an invisible 1.67 m square in the middle of the room:
// turning worked, every translation into it reported "occupied".
{
  const rileyFine = fineCenterOfMacro(RILEY_SOFA_SEATED_CELL);
  // One step short of Riley's cell, inside the footprint overlap she used to
  // veto, stepping toward the sofa.
  const approach: [number, number] = [rileyFine[0] + 2, rileyFine[1] + 2];
  const destination: [number, number] = [approach[0], approach[1] - 1];
  const baseSave = makeSave(LONELY_STREET_HOUSE_INTERIOR_MAP_ID, [0, 0]);
  const standing: PlaySave = {
    ...baseSave,
    player: { ...baseSave.player, cell: [approach[0], approach[1]] },
  };

  const pastAnchor = dispatchV1MoveEntity({
    gamePackage: fine,
    save: standing,
    dx: 0,
    dy: -1,
  });
  ok(
    "a sofa-anchored NPC leaves the floor in front of the sofa walkable",
    pastAnchor.ok &&
      pastAnchor.save.player.cell[0] === destination[0] &&
      pastAnchor.save.player.cell[1] === destination[1],
    pastAnchor.reason,
  );

  // The exemption must be driven by collision_mode, not by disabling actor
  // collision outright.
  const solidAnchorPackage: GamePackage = {
    ...fine,
    maps: fine.maps.map((map) =>
      map.id === LONELY_STREET_HOUSE_INTERIOR_MAP_ID
        ? {
            ...map,
            entity_placements: (map.entity_placements || []).map((placement) =>
              placement.id === RILEY_SOFA_PLACEMENT_ID
                ? { ...placement, collision_mode: "solid" as const }
                : placement,
            ),
          }
        : map,
    ),
  };
  const intoSolidActor = dispatchV1MoveEntity({
    gamePackage: solidAnchorPackage,
    save: standing,
    dx: 0,
    dy: -1,
  });
  ok(
    "an explicitly solid NPC placement still blocks that same step",
    !intoSolidActor.ok,
  );
}

// ── The Moon God physically blocks its tile ─────────────────────────────────
// Unlike Riley, the Moon God has no floor-anchored authoritative cell to fall
// back on: its placement cell IS the apparition's standing spot, and Steve
// must not be able to stand inside it or step past it to the fridge. Exercise
// the real engine-core move dispatch, not just the authored data shape.
{
  const moonGodApproach: [number, number] = [
    LONELY_STREET_BASEMENT_MOON_GOD_CELL[0],
    LONELY_STREET_BASEMENT_MOON_GOD_CELL[1] + 1,
  ];
  const moonGodApproachSave = makeSave(
    LONELY_STREET_BASEMENT_MAP_ID,
    moonGodApproach,
  );
  const standingBeforeMoonGod: PlaySave = {
    ...moonGodApproachSave,
    player: { ...moonGodApproachSave.player, facing: [0, -1] },
  };
  const intoMoonGod = dispatchV1MoveEntity({
    gamePackage: fine,
    save: standingBeforeMoonGod,
    dx: 0,
    dy: -1,
  });
  ok(
    "Steve cannot step onto the Moon God's tile",
    !intoMoonGod.ok,
    intoMoonGod.ok ? "" : intoMoonGod.reason,
  );

  // Once the vanish cutscene has hidden it, the same step must succeed —
  // solid collision must not outlive the apparition's presence.
  const moonGodKey = `ent_${LONELY_STREET_BASEMENT_MAP_ID}_placement_${MOON_GOD_PLACEMENT_ID}`;
  const afterVanish: PlaySave = {
    ...standingBeforeMoonGod,
    entity_states: {
      ...standingBeforeMoonGod.entity_states,
      [moonGodKey]: { hidden: true },
    },
  };
  const pastVanishedMoonGod = dispatchV1MoveEntity({
    gamePackage: fine,
    save: afterVanish,
    dx: 0,
    dy: -1,
  });
  ok(
    "a hidden (vanished) Moon God no longer blocks its tile",
    pastVanishedMoonGod.ok,
    pastVanishedMoonGod.ok ? "" : pastVanishedMoonGod.reason,
  );
}

// Execute a lever cutscene's chem_spill actions (cells arrive fine-expanded
// in the expanded package, exactly as the runtime would apply them).
const runSpills = (
  save: PlaySave,
  mapId: string,
  cutsceneId: string,
): PlaySave => {
  const cutscene = fine.cutscenes.find((entry) => entry.id === cutsceneId);
  if (!cutscene) throw new Error(`missing cutscene ${cutsceneId}`);
  let next = save;
  for (const action of cutscene.actions) {
    if (action.type !== "chem_spill" || !action.cell) continue;
    const spilled = applyChemistrySpillToSave(fine, next, {
      cell: [action.cell[0], action.cell[1]],
      liquid: action.liquid_id,
      amount: action.amount,
      mapId,
    });
    if (!spilled.ok) throw new Error(`spill failed: ${spilled.reason}`);
    next = spilled.save;
  }
  return next;
};

const gridFor = (save: PlaySave, mapId: string) =>
  readChemistryGridForSave(fine, save, mapId);

const cellAtMacro = (
  cells: Map<string, ChemCell>,
  macro: [number, number],
): ChemCell | undefined => {
  const center = fineCenterOfMacro(macro);
  return cells.get(cellChemKey(center[0], center[1]));
};

const wetCellCount = (cells: Map<string, ChemCell>) => {
  let count = 0;
  for (const cell of cells.values())
    if (cell.axes.liquid_volume > 0) count += 1;
  return count;
};

console.log("suite: flood chamber (button → oozing basin flood)");
{
  const mapId = "qa_flood_lab";
  let save = makeSave(mapId, [0, 6]);
  save = runSpills(save, mapId, "qa_cut_flood_release");

  const after0 = gridFor(save, mapId);
  const initialWet = wetCellCount(after0.cells);
  ok("the release wets the spillway", initialWet > 0, `wet=${initialWet}`);

  // Walk: each move-tick advances the ooze a few fine cells.
  let midWet = 0;
  for (let tick = 0; tick < 24; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
    if (tick === 1) midWet = wetCellCount(gridFor(save, mapId).cells);
  }
  const settled = gridFor(save, mapId);
  const finalWet = wetCellCount(settled.cells);
  ok(
    "the flood front advances over successive moves (ooze)",
    midWet > initialWet && finalWet > midWet,
    `wet ${initialWet} → ${midWet} → ${finalWet}`,
  );

  const basinCenter = cellAtMacro(settled.cells, [0, -1]);
  const basinEdge = cellAtMacro(settled.cells, [-2, 0]);
  ok(
    "water pools in the sunken basin",
    (basinCenter?.axes.liquid_volume ?? 0) > 0 &&
      (basinEdge?.axes.liquid_volume ?? 0) > 0,
    `center=${basinCenter?.axes.liquid_volume}, edge=${basinEdge?.axes.liquid_volume}`,
  );

  const walkwayWest = cellAtMacro(settled.cells, [-6, 0]);
  const walkwaySouth = cellAtMacro(settled.cells, [0, 6]);
  ok(
    "the raised walkway stays dry",
    (walkwayWest?.axes.liquid_volume ?? 0) === 0 &&
      (walkwaySouth?.axes.liquid_volume ?? 0) === 0,
    `west=${walkwayWest?.axes.liquid_volume}, south=${walkwaySouth?.axes.liquid_volume}`,
  );

  // Keep ticking: a settled pool goes dormant and costs nothing.
  for (let tick = 0; tick < 60; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 30 + tick).save;
  }
  const dormantActive = save.chemistry_active?.[mapId]?.length ?? 0;
  ok(
    "the settled flood goes dormant (active set drains)",
    dormantActive === 0,
    `active=${dormantActive}`,
  );
}

console.log("suite: viscosity race (water outruns honey)");
{
  const mapId = "qa_visc_lab";
  let save = makeSave(mapId, [0, 7]);
  save = runSpills(save, mapId, "qa_cut_race_release");

  for (let tick = 0; tick < 6; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
  }
  const grid = gridFor(save, mapId);
  // Frontier: the furthest z (fine) each liquid has reached down its channel.
  let waterFront = -Infinity;
  let honeyFront = -Infinity;
  for (const cell of grid.cells.values()) {
    if (cell.axes.liquid_volume <= 0) continue;
    if (cell.liquidId === "water") waterFront = Math.max(waterFront, cell.z);
    if (cell.liquidId === "honey") honeyFront = Math.max(honeyFront, cell.z);
  }
  ok(
    "both liquids left the gate",
    waterFront > -Infinity && honeyFront > -Infinity,
  );
  ok(
    "the water frontier is well ahead of the honey crawl",
    waterFront >= honeyFront + FINE_PER_MACRO,
    `water z=${waterFront}, honey z=${honeyFront}`,
  );
}

console.log("suite: burn gallery (oil trail spreads, moat holds)");
{
  const mapId = "qa_fire_lab";
  let save = makeSave(mapId, [0, 7]);
  save = runSpills(save, mapId, "qa_cut_fire_ignite");

  let trailCaught = false;
  for (let tick = 0; tick < 30; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
    if (tick === 10) {
      const grid = gridFor(save, mapId);
      // The far end of the oil trail (macro [4,-4]) should have scorched or be hot.
      const trailEnd = cellAtMacro(grid.cells, [4, -4]);
      trailCaught =
        (trailEnd?.axes.scorch ?? 0) > 0 ||
        (trailEnd?.axes.temperature ?? 0) > 60;
    }
  }
  const grid = gridFor(save, mapId);
  ok("fire runs the oil trail to the crate stockpile", trailCaught);

  let scorchedCells = 0;
  for (const cell of grid.cells.values())
    if (cell.axes.scorch > 0) scorchedCells += 1;
  ok(
    "the burn leaves a scorch footprint",
    scorchedCells >= 8,
    `scorched=${scorchedCells}`,
  );

  const vault = cellAtMacro(grid.cells, [6, 4]);
  const vaultApproach = cellAtMacro(grid.cells, [6, 2]);
  ok(
    "the moat-guarded vault never burns",
    (vault?.axes.scorch ?? 0) === 0 && (vaultApproach?.axes.scorch ?? 0) === 0,
    `vault scorch=${vault?.axes.scorch}, approach=${vaultApproach?.axes.scorch}`,
  );
}

console.log("suite: miasma vault (gas fills, poisons, dissipates)");
{
  const mapId = "qa_gas_lab";
  let save = makeSave(mapId, [0, 7]);
  save = runSpills(save, mapId, "qa_cut_gas_release");

  // The vent engulfs the canary's tile at Toxic density (vapor ≥ 25 drives
  // the toxicity body axis), and the cloud must then DIFFUSE well beyond the
  // ~45 burst cells before dissipation wins.
  let engulfedCanary = false;
  let peakVapor = 0;
  let peakExtent = 0;
  for (let tick = 0; tick < 50; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 2 + tick).save;
    const grid = gridFor(save, mapId);
    let total = 0;
    let extent = 0;
    for (const cell of grid.cells.values()) {
      total += cell.axes.vapor;
      if (cell.axes.vapor > 0) extent += 1;
    }
    peakVapor = Math.max(peakVapor, total);
    peakExtent = Math.max(peakExtent, extent);
    const canaryCell = cellAtMacro(grid.cells, [-5, -4]);
    if ((canaryCell?.axes.vapor ?? 0) >= 25) engulfedCanary = true;
    if (total === 0 && tick > 4) break;
  }
  ok("the vent engulfs the canary at Toxic density", engulfedCanary);
  ok(
    "the cloud diffuses far beyond the burst cells",
    peakExtent >= 120,
    `peak extent=${peakExtent} cells`,
  );

  const grid = gridFor(save, mapId);
  let residual = 0;
  for (const cell of grid.cells.values()) residual += cell.axes.vapor;
  ok(
    "the cloud dissipates back to clean air",
    residual === 0 && peakVapor > 0,
    `peak=${peakVapor.toFixed(0)}, residual=${residual.toFixed(1)}`,
  );
}

console.log(
  failed === 0
    ? `\nsuite: all ${passed} checks passed`
    : `\nsuite: ${failed} of ${passed + failed} checks FAILED`,
);
if (failed > 0) process.exit(1);
