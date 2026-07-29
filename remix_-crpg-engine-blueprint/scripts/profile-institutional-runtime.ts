import { performance } from "node:perf_hooks";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  createPhase11IntegratedArchitectureFixture,
} from "../src/data/qaSuite/integratedArchitectureScenario";
import {
  createImmersiveCombatTacticalSnapshotFromV1,
  createImmersivePerceptionSnapshotFromV1,
  createImmersiveViewerVisibilityFromV1,
  dispatchV1EnemyPulse,
  expandGamePackageToFine,
  fineCenterOfMacro,
  getV1NearbyHostiles,
} from "../src/engine-core";
import type { PlaySave } from "../src/schema/save";
import { entityPlacementStateKey } from "../src/utils/entityState";
import {
  createInstitutionalSingleMapDungeonFixture,
  runDungeonGeneration,
} from "./dungeon-generation-test-support";

const fixture = createPhase11IntegratedArchitectureFixture(
  createQaSuitePackage(),
);
const { ids, cells } = fixture;
const gamePackage = expandGamePackageToFine(fixture.gamePackage);
const map = gamePackage.maps.find(
  (candidate) => candidate.id === ids.entranceMapId,
);
if (!map) throw new Error("Institutional runtime profile map is missing");

const entityStates = Object.fromEntries(
  map.entity_placements.map((placement, index) => {
    const entity = gamePackage.entities.find(
      (candidate) => candidate.id === placement.entity_id,
    );
    return [
      entityPlacementStateKey(map.id, placement, index),
      {
        cell: [...placement.cell],
        facing: [
          placement.facing?.[0] ?? 0,
          placement.facing?.[1] ?? -1,
        ] as [number, number],
        hp: entity?.max_hp || 12,
        dead: false,
        hidden: false,
      },
    ];
  }),
);
const combatQueue = [
  "player",
  ...Object.keys(entityStates),
];
const playerCell = fineCenterOfMacro(cells.carriedLight);
const save: PlaySave = {
  schema: "crpg_engine_save_v1",
  package_version: gamePackage.metadata.version,
  current_map_id: map.id,
  player: {
    cell: [playerCell[0], playerCell[1]],
    facing: [0, -1],
    sprite_id: String(gamePackage.settings.player_sprite_id || ""),
  },
  playerStats: {
    hp: 24,
    max_hp: 24,
    mp: 12,
    max_mp: 12,
    attack: 5,
    defense: 2,
    speed: 10,
    energy: 1000,
  },
  level: 1,
  experience: 0,
  pending_level_ups: 0,
  known_skills: [],
  flags: { ...(gamePackage.switches || {}) },
  variables: {},
  relationships: {},
  quests: {},
  inventory: [],
  money: 0,
  entity_states: entityStates,
  party_members: [],
  map_deltas: {},
  clock_minutes: 20,
  in_combat: true,
  combat_queue: combatQueue,
  active_turn_id: "player",
  combat_xp_pool: 0,
};

const summarizeDurations = (durations: number[]) => {
  const sorted = [...durations].sort((left, right) => left - right);
  const percentile = (value: number) =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * value) - 1),
      )
    ] || 0;
  return {
    average_ms: Number(
      (
        durations.reduce((total, duration) => total + duration, 0) /
        Math.max(1, durations.length)
      ).toFixed(3),
    ),
    p50_ms: Number(percentile(0.5).toFixed(3)),
    p95_ms: Number(percentile(0.95).toFixed(3)),
    max_ms: Number(Math.max(...durations, 0).toFixed(3)),
  };
};

const sample = <T>(iterations: number, callback: (index: number) => T) => {
  const durations: number[] = [];
  let result: T | undefined;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    result = callback(index);
    durations.push(performance.now() - started);
  }
  return {
    result: result!,
    durations_ms: durations.map((duration) => Number(duration.toFixed(3))),
    ...summarizeDurations(durations),
  };
};

const saveAtTick = (tick: number): PlaySave => ({
  ...save,
  clock_minutes: tick,
});

// A new clock value forces a physical-world rebuild. These samples expose the
// actual large-map cost rather than reporting only a warmed cache hit.
const coldVisibility = sample(15, (index) =>
  createImmersiveViewerVisibilityFromV1(
    gamePackage,
    saveAtTick(1_000 + index),
    map.id,
  ),
);
const coldTactical = sample(15, (index) =>
  createImmersiveCombatTacticalSnapshotFromV1(
    gamePackage,
    saveAtTick(2_000 + index),
    map.id,
  ),
);
// This is the important runtime path: visibility builds the physical world,
// then tactical combat and perception reuse that exact semantic snapshot.
const sharedUpdate = sample(15, (index) => {
  const updateSave = saveAtTick(3_000 + index);
  const visibility = createImmersiveViewerVisibilityFromV1(
    gamePackage,
    updateSave,
    map.id,
  );
  const tactical = createImmersiveCombatTacticalSnapshotFromV1(
    gamePackage,
    updateSave,
    map.id,
  );
  const perception = createImmersivePerceptionSnapshotFromV1(
    gamePackage,
    updateSave,
    map.id,
  );
  return { visibility, tactical, perception };
});
const warmedVisibility = sample(15, () =>
  createImmersiveViewerVisibilityFromV1(gamePackage, save, map.id),
);
const warmedTactical = sample(15, () =>
  createImmersiveCombatTacticalSnapshotFromV1(gamePackage, save, map.id),
);

const generatedFixture = createInstitutionalSingleMapDungeonFixture(
  "institutional-combat-runtime-profile",
);
const generatedResult = runDungeonGeneration(generatedFixture);
const generatedMacroMap = generatedResult.maps[0];
if (!generatedResult.success || !generatedMacroMap) {
  throw new Error(
    `Institutional combat profile generation failed: ${generatedResult.diagnostics
      .map((diagnostic) => diagnostic.code)
      .join(", ")}`,
  );
}
const generatedPackage = expandGamePackageToFine({
  ...generatedFixture.gamePackage,
  maps: [generatedMacroMap],
});
const generatedMap = generatedPackage.maps[0];
const generatedSpawn = generatedMap.spawns[0]?.cell;
if (!generatedMap || !generatedSpawn) {
  throw new Error("Institutional combat profile map has no spawn");
}
const generatedEntityStates = Object.fromEntries(
  generatedMap.entity_placements.map((placement, index) => {
    const entity = generatedPackage.entities.find(
      (candidate) => candidate.id === placement.entity_id,
    );
    return [
      entityPlacementStateKey(generatedMap.id, placement, index),
      {
        cell: [...placement.cell],
        facing: [
          placement.facing?.[0] ?? 0,
          placement.facing?.[1] ?? -1,
        ] as [number, number],
        hp: entity?.max_hp || 12,
        dead: false,
        hidden: false,
        alertness: "combat",
        alert_score: 1,
      },
    ];
  }),
);
const generatedHostileIds = generatedMap.entity_placements.flatMap(
  (placement, index) => {
    const entity = generatedPackage.entities.find(
      (candidate) => candidate.id === placement.entity_id,
    );
    return entity && !entity.is_npc
      ? [entityPlacementStateKey(generatedMap.id, placement, index)]
      : [];
  },
);
const generatedSave: PlaySave = {
  ...save,
  package_version: generatedPackage.metadata.version,
  current_map_id: generatedMap.id,
  player: {
    ...save.player,
    cell: [...generatedSpawn] as [number, number],
  },
  entity_states: generatedEntityStates,
  combat_queue: ["player"],
  active_turn_id: "player",
  map_deltas: {},
  flags: {},
  clock_minutes: 20,
};
const generatedEnemyPulse = sample(20, (index) =>
  dispatchV1EnemyPulse({
    gamePackage: generatedPackage,
    save: {
      ...generatedSave,
      clock_minutes: 4_000 + index,
    },
    mapId: generatedMap.id,
    actorIds: generatedHostileIds,
    movementSteps: 1,
    allowAttack: true,
  }),
);
const generatedCombatFrame = sample(20, () => {
  const pulse = dispatchV1EnemyPulse({
    gamePackage: generatedPackage,
    save: generatedSave,
    mapId: generatedMap.id,
    actorIds: generatedHostileIds,
    movementSteps: 1,
    allowAttack: true,
  });
  const tactical = createImmersiveCombatTacticalSnapshotFromV1(
    generatedPackage,
    pulse.save,
    generatedMap.id,
  );
  return { pulse, tactical };
});
const generatedNearbyHostiles = sample(20, () =>
  getV1NearbyHostiles({
    gamePackage: generatedPackage,
    save: generatedSave,
    mapId: generatedMap.id,
    radius: 999,
  }),
);
const generatedFullCombatPulse = sample(20, () => {
  const hostiles = getV1NearbyHostiles({
    gamePackage: generatedPackage,
    save: generatedSave,
    mapId: generatedMap.id,
    radius: 999,
  });
  const pulse = dispatchV1EnemyPulse({
    gamePackage: generatedPackage,
    save: generatedSave,
    mapId: generatedMap.id,
    actorIds: hostiles.map((hostile) => hostile.id),
    movementSteps: 1,
    allowAttack: true,
  });
  const tactical = createImmersiveCombatTacticalSnapshotFromV1(
    generatedPackage,
    pulse.save,
    generatedMap.id,
  );
  return { hostiles, pulse, tactical };
});

console.log(JSON.stringify({
  profile: "institutional_ruin_runtime",
  map_id: map.id,
  map_cells: map.cells.length,
  actors: map.entity_placements.length + 1,
  cold_visibility: {
    average_ms: coldVisibility.average_ms,
    p50_ms: coldVisibility.p50_ms,
    p95_ms: coldVisibility.p95_ms,
    max_ms: coldVisibility.max_ms,
    terrain_visible: coldVisibility.result.terrain_visible.length,
    illumination_cells: coldVisibility.result.illumination.cells.length,
  },
  cold_tactical: {
    average_ms: coldTactical.average_ms,
    p50_ms: coldTactical.p50_ms,
    p95_ms: coldTactical.p95_ms,
    max_ms: coldTactical.max_ms,
    cover_edges: coldTactical.result.cover_edges.length,
    intents: coldTactical.result.intents.length,
  },
  shared_visibility_tactical_perception: {
    average_ms: sharedUpdate.average_ms,
    p50_ms: sharedUpdate.p50_ms,
    p95_ms: sharedUpdate.p95_ms,
    max_ms: sharedUpdate.max_ms,
    alerts: sharedUpdate.result.perception.alerts.length,
  },
  warmed_visibility: {
    average_ms: warmedVisibility.average_ms,
    p95_ms: warmedVisibility.p95_ms,
  },
  warmed_tactical: {
    average_ms: warmedTactical.average_ms,
    p95_ms: warmedTactical.p95_ms,
  },
  generated_enemy_pulse: {
    map_id: generatedMap.id,
    map_cells: generatedMap.cells.length,
    actors: generatedMap.entity_placements.length + 1,
    hostiles: generatedHostileIds.length,
    average_ms: generatedEnemyPulse.average_ms,
    p50_ms: generatedEnemyPulse.p50_ms,
    p95_ms: generatedEnemyPulse.p95_ms,
    max_ms: generatedEnemyPulse.max_ms,
    events: generatedEnemyPulse.result.events.length,
  },
  generated_enemy_pulse_and_tactical_refresh: {
    average_ms: generatedCombatFrame.average_ms,
    p50_ms: generatedCombatFrame.p50_ms,
    p95_ms: generatedCombatFrame.p95_ms,
    max_ms: generatedCombatFrame.max_ms,
    intents: generatedCombatFrame.result.tactical.intents.length,
  },
  generated_nearby_hostile_scan: {
    average_ms: generatedNearbyHostiles.average_ms,
    p50_ms: generatedNearbyHostiles.p50_ms,
    p95_ms: generatedNearbyHostiles.p95_ms,
    max_ms: generatedNearbyHostiles.max_ms,
    hostiles: generatedNearbyHostiles.result.length,
  },
  generated_full_combat_pulse: {
    average_ms: generatedFullCombatPulse.average_ms,
    p50_ms: generatedFullCombatPulse.p50_ms,
    p95_ms: generatedFullCombatPulse.p95_ms,
    max_ms: generatedFullCombatPulse.max_ms,
    acting_hostiles: generatedFullCombatPulse.result.hostiles.length,
  },
}, null, 2));
