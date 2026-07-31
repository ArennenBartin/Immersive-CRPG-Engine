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
} from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  createDefaultEnginePackage,
  refreshBundledEnginePackage,
} from "../src/store/engineStore";
import type { PlaySave } from "../src/schema/save";
import {
  TEST_SUITE_MAP_IDS,
  TEST_SUITE_PLAYER_SPRITE_ID,
  TEST_SUITE_START_MAP_ID,
  TEST_SUITE_START_SPAWN_ID,
} from "../src/data/testingMapSuite";
import { withQaRoomCeilingArchitecture } from "../src/data/qaSuite/shared";
import {
  PHASE_11_HUB_MAP_ID,
  PHASE_11_HUB_SPAWN_ID,
} from "../src/data/qaSuite/integratedArchitectureScenario";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
} from "../src/schema/presets";
import {
  BACKROOMS_LEVEL_ZERO_MAP_ID,
  BACKROOMS_LEVEL_ZERO_SPAWN_ID,
} from "../src/data/qaSuite/backroomsWing";
import {
  BACKROOMS_PARASITE_ENTITY_ID,
  BACKROOMS_PARASITE_MODEL_OBJECT_ID,
} from "../src/data/backroomsEntityAssets";
import { placementHasCollision } from "../src/utils/objectFootprint";
import {
  FINE_PER_MACRO,
  advanceChemistryForSave,
  applyChemistrySpillToSave,
  expandGamePackageToFine,
  fineCenterOfMacro,
  readChemistryGridForSave,
} from "../src/engine-core";
import { cellChemKey, type ChemCell } from "../src/engine-core/chemistry";

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
    "fresh Studio workspace is the canonical Phase 11 scenario",
    defaultPackage.metadata.title ===
      "Fracture Crawl — Integrated Architecture Scenario" &&
      defaultPackage.metadata.version === "phase11.1.0" &&
      defaultPackage.metadata.start_map_id === PHASE_11_HUB_MAP_ID &&
      defaultPackage.metadata.start_spawn_id === PHASE_11_HUB_SPAWN_ID &&
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
  ok(
    "fresh Studio workspace uses the animated GIF player",
    defaultPackage.settings.player_sprite_id === TEST_SUITE_PLAYER_SPRITE_ID &&
      defaultSpriteById.get(TEST_SUITE_PLAYER_SPRITE_ID)?.animated === true &&
      defaultSpriteById.get(TEST_SUITE_PLAYER_SPRITE_ID)?.data_url?.endsWith(".gif") === true,
  );
  ok(
    "every placed QA entity resolves to an animated GIF",
    placedEntities.length > 0 &&
      placedEntities.every((entity) => {
        const sprite = entity.sprite_id
          ? defaultSpriteById.get(entity.sprite_id)
          : undefined;
        return sprite?.animated === true && sprite.data_url?.endsWith(".gif") === true;
      }),
  );
  const weakDialogueLabels = defaultPackage.keywords
    .filter((topic) => /^(?:it|this|that|them|him|her|here|there|review topic \d+)$/i.test(topic.display_label.trim()))
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
          entity.sensory_profile?.id === "backrooms_predator",
      ) &&
      backfilledParasiteWorkspace.maps
        .find((map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID)
        ?.entity_placements.some(
          (placement) =>
            placement.entity_id === BACKROOMS_PARASITE_ENTITY_ID,
        ) === true,
  );
  const staleHunterPackage = {
    ...editedQaPackage,
    entities: editedQaPackage.entities.map((entity) =>
      entity.id === BACKROOMS_PARASITE_ENTITY_ID
        ? {
            ...entity,
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
      refreshedHunter.sensory_profile?.channels.some(
        (channel) =>
          channel.stimulus_kinds.includes("visible_player") &&
          channel.range >= 100,
      ) === true,
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
  const factionIds = new Set((authored.factions as Array<{ id: string }>).map((f) => f.id));
  const endingIds = new Set((authored.endings as Array<{ id: string }>).map((e) => e.id));

  const problems: string[] = [];
  const qaMaps = authored.maps.filter((map) => map.id.startsWith("qa_"));
  const expectedMapIds = new Set(TEST_SUITE_MAP_IDS);

  ok("suite start map exists", mapById.has(authored.metadata.start_map_id));
  ok(
    "suite contains exactly the hub, eleven labs, and Level Zero",
    authored.maps.length === 13 &&
      qaMaps.length === 13 &&
      authored.maps.every((map) => expectedMapIds.has(map.id)),
    `maps: ${authored.maps.map((m) => m.id).join(", ")}`,
  );
  const qaCeilingFixtureIds = new Set([
    INSTITUTIONAL_CEILING_LIGHT_OBJECT_ID,
    BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  ]);
  const qaCeilingFixtures = authored.object_library.filter((object) =>
    qaCeilingFixtureIds.has(object.id),
  );
  const qaMapsMissingCeilingLights = authored.maps
    .filter((map) => {
      const fixtures = map.custom_object_placements.filter((placement) =>
        qaCeilingFixtureIds.has(placement.object_id),
      );
      return (
        fixtures.length === 0 ||
        fixtures.some(
          (placement) =>
            placement.collision_mode !== "none",
        )
      );
    })
    .map((map) => map.id);
  ok(
    "every fluorescent fixture in every QA room is explicitly collision-free",
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
  const normalizedFixtureMap =
    withQaRoomCeilingArchitecture(staleFixtureMap);
  ok(
    "QA architecture upgrades normalize every stale ceiling fixture",
    normalizedFixtureMap.custom_object_placements
      .filter(
        (placement) => qaCeilingFixtureIds.has(placement.object_id),
      )
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

  const backroomsMap = mapById.get(BACKROOMS_LEVEL_ZERO_MAP_ID);
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
      (placement) =>
        placement.entity_id === BACKROOMS_PARASITE_ENTITY_ID,
    ) || [];
  const backroomsLightDiffuser = backroomsLight?.material_settings?.find(
    (material) => material.id === "mat_backrooms_level_zero_diffuser",
  );
  const backroomsLightBacker = backroomsLight?.material_settings?.find(
    (material) =>
      material.id === "mat_backrooms_level_zero_ceiling_tile",
  );
  const backroomsLightHousing = backroomsLight?.material_settings?.find(
    (material) =>
      material.id === "mat_backrooms_level_zero_fixture_metal",
  );
  const backroomsLightTubes = backroomsLight?.material_settings?.find(
    (material) =>
      material.id === "mat_backrooms_level_zero_fluorescent_tube",
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
      (backroomsLightDiffuser?.emissive_intensity ?? Number.POSITIVE_INFINITY) <=
        0.5 &&
      (backroomsLightTubes?.emissive_intensity ?? 0) >
        (backroomsLightDiffuser?.emissive_intensity ?? 0) &&
      (backroomsLightTubes?.emissive_intensity ??
        Number.POSITIVE_INFINITY) <= 1,
  );
  ok(
    "Level Zero fixture backer and housing retain shaded detail inside the halo",
    (backroomsLightBacker?.emissive_intensity ?? 0) > 0 &&
      (backroomsLightBacker?.emissive_intensity ??
        Number.POSITIVE_INFINITY) <= 0.25 &&
      (backroomsLightHousing?.emissive_intensity ?? 0) > 0 &&
      (backroomsLightHousing?.emissive_intensity ??
        Number.POSITIVE_INFINITY) <= 0.25 &&
      (backroomsLightHousing?.metalness ?? Number.POSITIVE_INFINITY) <=
        0.2,
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
      backroomsParasite?.independent_movement?.enabled === true &&
      backroomsParasite?.independent_movement?.interval_ms === 180 &&
      backroomsParasite?.independent_movement?.steps_per_pulse === 2 &&
      (backroomsParasite?.independent_movement?.activation_radius ?? 0) >= 48 &&
      Number(
        authored.settings?.movement_hearing?.normal_movement_loudness || 0,
      ) >= 6.5 &&
      Number(
        authored.settings?.movement_hearing?.stealth_noise_multiplier ??
          Number.POSITIVE_INFINITY,
      ) <= 0.1 &&
      (backroomsParasite?.sensory_profile?.memory_ticks ?? 0) >= 240 &&
      (backroomsParasite?.sensory_profile?.search_ticks ?? 0) >= 180 &&
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
  const backroomsReturnExit = backroomsMap?.exits.find(
    (mapExit) =>
      mapExit.target_map_id === TEST_SUITE_START_MAP_ID &&
      mapExit.target_spawn_id === TEST_SUITE_START_SPAWN_ID,
  );
  ok(
    "Level Zero has a walkable spawn, return exit, and reciprocal hub entrance",
    Boolean(backroomsSpawn) &&
      walkableBackroomsKeys.has(
        backroomsCellKey([
          backroomsSpawn?.cell[0] ?? Number.NaN,
          backroomsSpawn?.cell[1] ?? Number.NaN,
        ]),
      ) &&
      Boolean(backroomsReturnExit) &&
      walkableBackroomsKeys.has(
        backroomsCellKey([
          backroomsReturnExit?.cell[0] ?? Number.NaN,
          backroomsReturnExit?.cell[1] ?? Number.NaN,
        ]),
      ) &&
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
  const portableLamp = authored.items.find((item) => item.id === "qa_portable_lamp");
  const darkArtifact = authored.items.find((item) => item.id === "qa_dark_artifact");
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
    perceptionEntities.every((entity) => Boolean(entity?.sensory_profile?.channels.length)) &&
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
      (cell) => cell.blocks_los && Math.abs(cell.x) < 10 && Math.abs(cell.z) < 10,
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
        (placement) => placement.id === "qa_noise_crate" && placement.object_id === "obj_crate",
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
  const worldStatePolicy = authored.settings.world_state_policy as {
    campaign_switch_ids?: string[];
    expedition_switch_ids?: string[];
    persistent_door_ids?: Record<string, string[]>;
    persistent_item_ids?: Record<string, string[]>;
  } | undefined;
  const succession = authored.settings.intercessor_succession as {
    enabled?: boolean;
    hub_map_id?: string;
    hub_spawn_id?: string;
    name_prefixes?: string[];
    name_roots?: string[];
    name_suffixes?: string[];
    duplicate_name_policy?: string;
    history_keyword_id?: string;
    base_known_skills?: string[];
  } | undefined;
  const historyKeyword = authored.keywords.find(
    (keyword) => keyword.id === succession?.history_keyword_id,
  );

  ok(
    "persistence lab has a wall-divided annex and stable shortcut door",
    persistenceMap?.cells
      .filter((cell) => cell.z === 0 && cell.x >= -7 && cell.x <= 7 && cell.x !== 0)
      .every((cell) => cell.blocks_los && !cell.walkable) === true &&
      persistenceMap.cells.some(
        (cell) => cell.x === 0 && cell.z === 0 && cell.walkable && !cell.blocks_los,
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
        (placement) => placement.object_id === "obj_crate" && placement.cell[1] > 0,
      ),
  );
  ok(
    "persistence lab provides campaign, hazard, signature, and lethal succession terminals",
    [
      "qa_trig_persistence_campaign",
      "qa_trig_persistence_hazard",
      "qa_trig_persistence_signature",
      "qa_trig_persistence_succession",
    ].every((id) => persistenceMap?.triggers.some((trigger) => trigger.id === id)) &&
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
    worldStatePolicy?.campaign_switch_ids?.includes("qa_persistence_major") === true &&
      worldStatePolicy.expedition_switch_ids?.includes("qa_persistence_hazard") === true &&
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
    .forEach((cutscene) => checkActions(`cutscene ${cutscene.id}`, cutscene.actions));

  for (const map of qaMaps) {
    const spawnIds = new Set(map.spawns.map((spawn) => spawn.id));
    void spawnIds;
    for (const mapExit of map.exits || []) {
      const target = mapById.get(mapExit.target_map_id);
      if (!target) {
        problems.push(`map ${map.id}: exit to missing map ${mapExit.target_map_id}`);
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
        problems.push(`map ${map.id}: trigger ${trigger.id} missing cutscene ${trigger.cutscene_id}`);
    }
    for (const placement of map.entity_placements || []) {
      if (!entityIds.has(placement.entity_id))
        problems.push(`map ${map.id}: placement of missing entity ${placement.entity_id}`);
    }
    for (const placement of map.item_placements || []) {
      if (!itemIds.has(placement.item_id))
        problems.push(`map ${map.id}: placement of missing item ${placement.item_id}`);
    }
    for (const placement of map.custom_object_placements || []) {
      if (placement.dialogue_id && !dialogueIds.has(placement.dialogue_id))
        problems.push(`map ${map.id}: object with missing dialogue ${placement.dialogue_id}`);
    }
    for (const container of map.container_placements || []) {
      for (const stack of container.items || []) {
        if (!itemIds.has(stack.item_id))
          problems.push(`map ${map.id}: container with missing item ${stack.item_id}`);
      }
      if (container.key_item_id && !itemIds.has(container.key_item_id))
        problems.push(`map ${map.id}: container with missing key ${container.key_item_id}`);
    }
  }
  for (const entity of authored.entities.filter((e) => e.id.startsWith("qa_"))) {
    if (entity.dialogue_id && !dialogueIds.has(entity.dialogue_id))
      problems.push(`entity ${entity.id}: missing dialogue ${entity.dialogue_id}`);
    for (const skillId of entity.skills || []) {
      if (!skillIds.has(skillId)) problems.push(`entity ${entity.id}: missing skill ${skillId}`);
    }
  }
  for (const station of authored.simulation_workstations.filter((w) => w.id.startsWith("qa_"))) {
    if (!mapById.has(station.map_id))
      problems.push(`workstation ${station.id}: missing map ${station.map_id}`);
    for (const processId of station.process_ids) {
      if (!authored.simulation_processes.some((proc) => proc.id === processId))
        problems.push(`workstation ${station.id}: missing process ${processId}`);
    }
  }
  const dialogueCutsceneRefs = authored.dialogue
    .filter((d) => d.id.startsWith("qa_"))
    .flatMap((d) => d.nodes.flatMap((n) => n.options.map((o) => o.trigger_cutscene).filter(Boolean)));
  for (const ref of dialogueCutsceneRefs) {
    if (ref && !cutsceneIds.has(ref)) problems.push(`dialogue option: missing cutscene ${ref}`);
  }

  ok("all suite references resolve", problems.length === 0, problems.slice(0, 8).join(" | "));
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
    playerStats: { hp: 20, max_hp: 20, mp: 5, max_mp: 5, attack: 3, defense: 1, speed: 10, energy: 1000 },
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

// Execute a lever cutscene's chem_spill actions (cells arrive fine-expanded
// in the expanded package, exactly as the runtime would apply them).
const runSpills = (save: PlaySave, mapId: string, cutsceneId: string): PlaySave => {
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

const gridFor = (save: PlaySave, mapId: string) => readChemistryGridForSave(fine, save, mapId);

const cellAtMacro = (
  cells: Map<string, ChemCell>,
  macro: [number, number],
): ChemCell | undefined => {
  const center = fineCenterOfMacro(macro);
  return cells.get(cellChemKey(center[0], center[1]));
};

const wetCellCount = (cells: Map<string, ChemCell>) => {
  let count = 0;
  for (const cell of cells.values()) if (cell.axes.liquid_volume > 0) count += 1;
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
    (basinCenter?.axes.liquid_volume ?? 0) > 0 && (basinEdge?.axes.liquid_volume ?? 0) > 0,
    `center=${basinCenter?.axes.liquid_volume}, edge=${basinEdge?.axes.liquid_volume}`,
  );

  const walkwayWest = cellAtMacro(settled.cells, [-6, 0]);
  const walkwaySouth = cellAtMacro(settled.cells, [0, 6]);
  ok(
    "the raised walkway stays dry",
    (walkwayWest?.axes.liquid_volume ?? 0) === 0 && (walkwaySouth?.axes.liquid_volume ?? 0) === 0,
    `west=${walkwayWest?.axes.liquid_volume}, south=${walkwaySouth?.axes.liquid_volume}`,
  );

  // Keep ticking: a settled pool goes dormant and costs nothing.
  for (let tick = 0; tick < 60; tick += 1) {
    save = advanceChemistryForSave(fine, save, mapId, 1, 30 + tick).save;
  }
  const dormantActive = save.chemistry_active?.[mapId]?.length ?? 0;
  ok("the settled flood goes dormant (active set drains)", dormantActive === 0, `active=${dormantActive}`);
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
  ok("both liquids left the gate", waterFront > -Infinity && honeyFront > -Infinity);
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
      trailCaught = (trailEnd?.axes.scorch ?? 0) > 0 || (trailEnd?.axes.temperature ?? 0) > 60;
    }
  }
  const grid = gridFor(save, mapId);
  ok("fire runs the oil trail to the crate stockpile", trailCaught);

  let scorchedCells = 0;
  for (const cell of grid.cells.values()) if (cell.axes.scorch > 0) scorchedCells += 1;
  ok("the burn leaves a scorch footprint", scorchedCells >= 8, `scorched=${scorchedCells}`);

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
