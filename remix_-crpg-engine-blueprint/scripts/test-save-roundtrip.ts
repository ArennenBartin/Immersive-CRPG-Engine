import assert from "node:assert/strict";
import {
  dispatchV1AttendNode,
  dispatchV1BreakObject,
  dispatchV1ChangeMap,
  dispatchV1ChooseDialogueOption,
  dispatchV1DropItem,
  dispatchV1FireTrigger,
  dispatchV1IgniteFire,
  dispatchV1MeleeAttack,
  dispatchV1OpenContainer,
  dispatchV1OpenDoor,
  dispatchV1PushObject,
  dispatchV1ReadDocument,
  dispatchV1SetPlayerPosition,
  dispatchV1SetQuest,
  dispatchV1SetSwitch,
  dispatchV1TakeAllFromContainer,
  dispatchV1TakeItem,
  dispatchV1UnlockContainer,
  dispatchV1UpdateCombatSession,
} from "../src/engine-core/v1Runtime";
import { expandGamePackageToFine } from "../src/engine-core/fineWorld";
import { FINE_PER_MACRO, fineCenterOfMacro } from "../src/engine-core/gridCoordinates";
import { findEligibleSwitchChangeTriggers, type ConditionContext } from "../src/engine-core/story";
import { validateOrdinaryMap } from "../src/engine-core/mapReadinessValidator";
import {
  buildDeterministicPlaceholderMap,
  markMapManuallyModified,
} from "../src/generation-facing";
import type { PlaySave } from "../src/schema/save";
import {
  migratePlaySaveV1ToV2,
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";
import {
  normalizePackageImportPayload,
  serializePackageForExport,
} from "../src/store/engineStore";
import { buildSaveSlotPayload, normalizeSaveSlotPayload } from "../src/store/playStore";
import { entityPlacementStateKey } from "../src/utils/entityState";
import {
  READINESS_DUNGEON_APPROACH_MAP_ID,
  READINESS_DUNGEON_KEY_ITEM_ID,
  READINESS_DUNGEON_LOCKED_CONTAINER_ID,
  READINESS_DUNGEON_LOCKED_DOOR_ID,
  READINESS_DUNGEON_LOWER_MAP_ID,
  READINESS_DUNGEON_PUSHABLE_ID,
  READINESS_DUNGEON_UPPER_MAP_ID,
  createReadinessDungeonPackage,
  readinessDungeonValidationOptions,
} from "./fixtures/readinessDungeonFixture";

type DispatchResult = { ok: boolean; reason?: string; save: PlaySave };

const accept = <T extends DispatchResult>(label: string, result: T): T => {
  assert.equal(result.ok, true, `${label}: ${result.reason || "command rejected"}`);
  return result;
};

const jsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const conditionContext = (save: PlaySave): ConditionContext => ({
  flags: save.flags,
  quests: save.quests,
  inventory: save.inventory,
  party: save.party_members,
  clockMinutes: save.clock_minutes || 0,
  factionRep: save.faction_rep || {},
});

const authoredPackage = createReadinessDungeonPackage();
const lowerAuthored = authoredPackage.maps.find((map) => map.id === READINESS_DUNGEON_LOWER_MAP_ID)!;
const upperAuthored = authoredPackage.maps.find((map) => map.id === READINESS_DUNGEON_UPPER_MAP_ID)!;
const dungeonRoomIds = new Set(
  [...lowerAuthored.cells, ...upperAuthored.cells]
    .map((cell) => cell.room_id)
    .filter((id): id is string => Boolean(id)),
);
assert.equal(dungeonRoomIds.size, 14, "readiness dungeon must contain 10–14 rooms across two floors");
assert.ok(
  lowerAuthored.cells.some((cell) => cell.room_id === "lower_loop_gallery") &&
    upperAuthored.cells.some((cell) => cell.room_id === "upper_side_chamber"),
  "readiness dungeon must include a loop and an optional branch",
);

for (const map of authoredPackage.maps) {
  const report = validateOrdinaryMap(map, readinessDungeonValidationOptions(authoredPackage, map.id));
  assert.equal(report.valid, true, `${map.id} failed readiness validation`);
}

// Play Mode consumes the fine-grid runtime projection used by the active 3D
// renderer. Every command below therefore addresses real 3×3 runtime cells.
const gamePackage = expandGamePackageToFine(authoredPackage);
const approach = gamePackage.maps.find((map) => map.id === READINESS_DUNGEON_APPROACH_MAP_ID)!;
const lower = gamePackage.maps.find((map) => map.id === READINESS_DUNGEON_LOWER_MAP_ID)!;
const upper = gamePackage.maps.find((map) => map.id === READINESS_DUNGEON_UPPER_MAP_ID)!;
const approachSpawn = approach.spawns.find((spawn) => spawn.id === "approach_start")!;

let save: PlaySave = {
  schema: "crpg_engine_save_v1",
  package_version: authoredPackage.metadata.version,
  fine_ratio: FINE_PER_MACRO,
  current_map_id: approach.id,
  player: {
    cell: [approachSpawn.cell[0], approachSpawn.cell[1]],
    facing: [approachSpawn.facing[0], approachSpawn.facing[1]],
  },
  playerStats: {
    hp: 36,
    max_hp: 36,
    mp: 16,
    max_mp: 16,
    attack: 80,
    defense: 8,
    speed: 12,
    energy: 20_000,
  },
  level: 3,
  experience: 20,
  pending_level_ups: 0,
  known_skills: [],
  flags: { ...authoredPackage.switches },
  quests: {},
  inventory: [],
  money: 12,
  entity_states: {},
  party_members: [],
  map_deltas: {},
  clock_minutes: 8 * 60,
  faction_rep: {},
  read_documents: [],
  explored_cells: {},
  in_combat: false,
  combat_queue: [],
  active_turn_id: "player",
  combat_xp_pool: 0,
};

console.log("readiness journey: enter, converse/Attend, key, lock, manipulation, combat, chemistry, floors");
save = accept(
  "enter dungeon",
  dispatchV1ChangeMap({
    gamePackage,
    save,
    targetMapId: lower.id,
    targetSpawnId: "lower_entrance",
    exitId: "readiness_approach_enter",
  }),
).save;
assert.equal(save.current_map_id, lower.id);

const scholar = authoredPackage.entities.find((entity) => entity.id === "readiness_lower_scholar")!;
const beforeDialogue = structuredClone(save);
save = accept(
  "choose scholar dialogue",
  dispatchV1ChooseDialogueOption({
    gamePackage,
    save,
    dialogueId: "readiness_scholar_dialogue",
    nodeId: "readiness_scholar_intro",
    optionIndex: 0,
  }),
).save;
const switchTriggers = findEligibleSwitchChangeTriggers(
  lower.triggers,
  conditionContext(beforeDialogue),
  conditionContext(save),
);
assert.deepEqual(switchTriggers.map((trigger) => trigger.id), ["readiness_scholar_switch_trigger"]);
save = accept(
  "fire switch-change trigger",
  dispatchV1FireTrigger({ gamePackage, save, triggerId: switchTriggers[0].id }),
).save;
save = accept(
  "apply switch-trigger cutscene effect",
  dispatchV1SetSwitch({ gamePackage, save, switchId: "readiness_scholar_acknowledged", value: true }),
).save;

const openedAttend = dispatchV1AttendNode({
  gamePackage,
  save,
  node: scholar.attend_node!,
  action: "open",
  targetActorId: scholar.id,
  tick: save.clock_minutes,
});
assert.equal(openedAttend.ok, true, openedAttend.reason);
const selectedAttend = dispatchV1AttendNode({
  gamePackage,
  save: openedAttend.save,
  node: scholar.attend_node!,
  action: "select",
  readingId: "readiness_scholar_true_reading",
  targetActorId: scholar.id,
  tick: (save.clock_minutes || 0) + 1,
});
assert.equal(selectedAttend.ok, true, selectedAttend.reason);
save = selectedAttend.save;
assert.equal(save.flags.readiness_scholar_attended, true);

const lockedDoor = lower.custom_object_placements.find(
  (placement) => placement.id === READINESS_DUNGEON_LOCKED_DOOR_ID,
)!;
const refusedDoor = dispatchV1OpenDoor({
  gamePackage,
  save,
  x: lockedDoor.cell[0],
  y: lockedDoor.cell[1],
});
assert.equal(refusedDoor.ok, false);
assert.equal(refusedDoor.reason, "missing key");
assert.deepEqual(refusedDoor.save.map_deltas?.[lower.id]?.opened_doors || [], []);

const keyPlacement = lower.item_placements.find((placement) => placement.item_id === READINESS_DUNGEON_KEY_ITEM_ID)!;
save = accept(
  "acquire key",
  dispatchV1TakeItem({ gamePackage, save, x: keyPlacement.cell[0], y: keyPlacement.cell[1] }),
).save;
assert.ok(save.inventory.some((item) => item.id === READINESS_DUNGEON_KEY_ITEM_ID));
const openedDoor = accept(
  "unlock and open persistent door",
  dispatchV1OpenDoor({ gamePackage, save, x: lockedDoor.cell[0], y: lockedDoor.cell[1] }),
);
save = openedDoor.save;
assert.ok(openedDoor.events.some((event) => event.type === "door_unlocked"));
assert.ok(save.map_deltas?.[lower.id]?.unlocked_doors?.includes(READINESS_DUNGEON_LOCKED_DOOR_ID));
assert.ok(save.map_deltas?.[lower.id]?.opened_doors?.includes(READINESS_DUNGEON_LOCKED_DOOR_ID));

const pushable = lower.custom_object_placements.find(
  (placement) => placement.id === READINESS_DUNGEON_PUSHABLE_ID,
)!;
save = accept(
  "push authored crate",
  dispatchV1PushObject({
    gamePackage,
    save,
    x: pushable.cell[0],
    y: pushable.cell[1],
    dx: 1,
    dy: 0,
  }),
).save;
assert.ok(save.map_deltas?.[lower.id]?.moved_objects?.[READINESS_DUNGEON_PUSHABLE_ID]);

save = accept(
  "fire objective trigger",
  dispatchV1FireTrigger({ gamePackage, save, triggerId: "readiness_lower_objective_trigger" }),
).save;
save = accept(
  "read authored document",
  dispatchV1ReadDocument({ gamePackage, save, documentId: "readiness_field_notes" }),
).save;
save = accept(
  "set objective state",
  dispatchV1SetSwitch({ gamePackage, save, switchId: "readiness_lower_objective_seen", value: true }),
).save;
assert.ok(save.read_documents?.includes("readiness_field_notes"));

save = accept(
  "unlock keyed cache",
  dispatchV1UnlockContainer({ gamePackage, save, containerId: READINESS_DUNGEON_LOCKED_CONTAINER_ID }),
).save;
save = accept(
  "open keyed cache",
  dispatchV1OpenContainer({ gamePackage, save, containerId: READINESS_DUNGEON_LOCKED_CONTAINER_ID }),
).save;
save = accept(
  "loot keyed cache",
  dispatchV1TakeAllFromContainer({ gamePackage, save, containerId: READINESS_DUNGEON_LOCKED_CONTAINER_ID }),
).save;
assert.equal(save.map_deltas?.[lower.id]?.containers?.[READINESS_DUNGEON_LOCKED_CONTAINER_ID]?.opened, true);
assert.ok(save.inventory.some((item) => item.id === "readiness_reward"));

const sentryIndex = lower.entity_placements.findIndex(
  (placement) => placement.entity_id === "readiness_lower_sentry",
);
const sentryPlacement = lower.entity_placements[sentryIndex];
const sentryKey = entityPlacementStateKey(lower.id, sentryPlacement, sentryIndex);
save = accept(
  "position for combat",
  dispatchV1SetPlayerPosition({
    gamePackage,
    save,
    cell: [sentryPlacement.cell[0], sentryPlacement.cell[1] - FINE_PER_MACRO],
    facing: [0, 1],
  }),
).save;
save = accept(
  "start normal combat session",
  dispatchV1UpdateCombatSession({ gamePackage, save, threatRadius: 6, chaseRadius: 12 }),
).save;
for (let attempt = 0; attempt < 5 && !save.entity_states[sentryKey]?.dead; attempt += 1) {
  const attack = dispatchV1MeleeAttack({
    gamePackage,
    save: { ...save, playerStats: { ...save.playerStats, energy: 20_000 } },
    actorId: "player",
    targetId: sentryKey,
    masterSeed: 100 + attempt,
  });
  assert.equal(attack.ok, true, attack.reason);
  save = attack.save;
}
assert.equal(save.entity_states[sentryKey]?.dead, true, "ordinary combat must persist altered enemy state");
save = accept(
  "end combat at a legal save point",
  dispatchV1UpdateCombatSession({ gamePackage, save, forceEnd: true }),
).save;

save = accept(
  "travel to upper floor",
  dispatchV1ChangeMap({
    gamePackage,
    save,
    targetMapId: upper.id,
    targetSpawnId: "upper_arrival",
    exitId: "readiness_stairs_up",
  }),
).save;
const breakable = upper.custom_object_placements.find(
  (placement) => placement.id === "readiness_upper_breakable_crate",
)!;
save = accept(
  "break upper crate",
  dispatchV1BreakObject({ gamePackage, save, x: breakable.cell[0], y: breakable.cell[1] }),
).save;
assert.ok(save.map_deltas?.[upper.id]?.removed_objects?.includes("readiness_upper_breakable_crate"));

const oilCell = fineCenterOfMacro([1, -1]);
save = accept(
  "ignite authored oil chemistry",
  dispatchV1IgniteFire({ gamePackage, save, x: oilCell[0], y: oilCell[1] }),
).save;
save = accept(
  "mark chemistry trigger outcome",
  dispatchV1SetSwitch({ gamePackage, save, switchId: "readiness_chemistry_triggered", value: true }),
).save;
assert.ok(Object.keys(save.map_deltas?.[upper.id]?.environment_fields || {}).length > 0);

save = accept(
  "drop looted item",
  dispatchV1DropItem({
    gamePackage,
    save,
    itemId: "readiness_reward",
    count: 1,
    cell: (() => {
      const cell = fineCenterOfMacro([4, 1]);
      return [cell[0], cell[1]] as [number, number];
    })(),
  }),
).save;
assert.ok(save.map_deltas?.[upper.id]?.dropped_items?.some((item) => item.item_id === "readiness_reward"));

save = accept(
  "return to lower floor",
  dispatchV1ChangeMap({
    gamePackage,
    save,
    targetMapId: lower.id,
    targetSpawnId: "lower_stair_return",
    exitId: "readiness_stairs_down",
  }),
).save;
save = accept(
  "exit dungeon",
  dispatchV1ChangeMap({
    gamePackage,
    save,
    targetMapId: approach.id,
    targetSpawnId: "approach_return",
    exitId: "readiness_lower_exit_to_approach",
  }),
).save;
save = accept(
  "return to dungeon",
  dispatchV1ChangeMap({
    gamePackage,
    save,
    targetMapId: lower.id,
    targetSpawnId: "lower_entrance",
    exitId: "readiness_approach_enter",
  }),
).save;
assert.ok(save.map_deltas?.[lower.id]?.unlocked_doors?.includes(READINESS_DUNGEON_LOCKED_DOOR_ID));

save = accept(
  "persist quest/dialogue progression",
  dispatchV1SetQuest({ gamePackage, save, questId: "readiness_journey", state: "returned" }),
).save;

const persisted: PlaySave = {
  ...save,
  player: { ...save.player, facing: [-1, 0] },
  inventory_layout: [{ item_id: READINESS_DUNGEON_KEY_ITEM_ID, x: 1, y: 2, rotation: 0 }],
  explored_cells: {
    [approach.id]: ["-2:0", "-1:0", "0:0", "1:0"],
    [lower.id]: ["-14:1", "1:1", "10:-2", "16:1"],
    [upper.id]: ["-14:1", "4:-2", "7:-5"],
  },
  chemistry: {
    [upper.id]: {
      [`${oilCell[0]}:${oilCell[1]}`]: {
        material_id: "oil",
        liquid_id: "oil",
        temperature: 118,
        saturation: 0,
        charge: 0,
        integrity: 92,
        foam: 0,
        fuel: 70,
        stability: 100,
        scorch: 12,
        frozen: false,
        liquid_volume: 65,
        vapor: 8,
        updated_at_tick: (save.clock_minutes || 0) + 4,
      },
    },
  },
  chemistry_active: { [upper.id]: [`${oilCell[0]}:${oilCell[1]}`] },
  actor_physical_states: {
    player: {
      temperature: 31,
      wetness: 12,
      heat: 2,
      chill: 0,
      charge: 0,
      coating: 1,
      toxicity: 0,
      labels: ["Smoke-stained"],
      updated_at_tick: save.clock_minutes || 0,
      cell: [...save.player.cell],
    },
  },
  actor_emotional_states: selectedAttend.save.actor_emotional_states,
  alderamontico_state: selectedAttend.save.alderamontico_state,
  simulation_economy: {
    shop_stock: {
      "readiness_service:readiness_tonic": {
        shop_id: "readiness_service",
        item_id: "readiness_tonic",
        produced: 1,
        consumed: 0,
        stock: 1,
        shortage: false,
        price_modifier: 0,
        updated_at_tick: save.clock_minutes || 0,
      },
    },
  },
  simulation_regions: {
    [`${upper.id}:upper_objective_wing`]: {
      id: `${upper.id}:upper_objective_wing`,
      map_id: upper.id,
      region_id: "upper_objective_wing",
      resolution: "aggregate",
      cell_count: 15,
      active_processes: 0,
      queued_tasks: 0,
      environment_fields: 1,
      fire_intensity: 0.35,
      smoke_intensity: 0.15,
      sound_intensity: 0,
      updated_at_tick: save.clock_minutes || 0,
    },
  },
  immersive_scheduler: {
    tick: save.clock_minutes || 0,
    segment: 2,
    turn: 4,
    actors: [
      { id: "player", actor_kind: "player", speed: 12, energy: 750 },
      { id: sentryKey, actor_kind: "npc", speed: 10, energy: 0 },
    ],
  },
  immersive_tile_layers: {
    [upper.id]: {
      [`${oilCell[0]}:${oilCell[1]}`]: {
        cell: [oilCell[0], oilCell[1]],
        material_id: "oil",
        terrain: "stone_floor",
        temperature: 118,
        ambient_temperature: 25,
        light: 0.45,
        sound: 0.1,
        occlusion: 0.05,
        blocks_movement: false,
        blocks_vision: false,
        surface_kinds: ["oil", "scorch"],
        environment_kinds: ["fire", "smoke"],
        updated_at_tick: save.clock_minutes || 0,
      },
    },
  },
  in_combat: true,
  combat_queue: ["player", sentryKey],
  active_turn_id: "player",
  combat_xp_pool: 5,
};

console.log("save round-trip: every dungeon-relevant persistent category");
const saveV2 = migratePlaySaveV1ToV2(persisted);
const roundTripped = unwrapPlaySaveV1(
  normalizePlaySaveToV2(JSON.parse(JSON.stringify(saveV2))),
);
assert.equal(roundTripped.fine_ratio, FINE_PER_MACRO);
assert.deepEqual(roundTripped.player, jsonValue(persisted.player));
assert.deepEqual(roundTripped.map_deltas, jsonValue(persisted.map_deltas));
assert.deepEqual(roundTripped.entity_states, jsonValue(persisted.entity_states));
assert.deepEqual(roundTripped.flags, jsonValue(persisted.flags));
assert.deepEqual(roundTripped.quests, jsonValue(persisted.quests));
assert.deepEqual(roundTripped.inventory, jsonValue(persisted.inventory));
assert.deepEqual(roundTripped.explored_cells, jsonValue(persisted.explored_cells));
assert.deepEqual(roundTripped.chemistry, jsonValue(persisted.chemistry));
assert.deepEqual(roundTripped.chemistry_active, jsonValue(persisted.chemistry_active));
assert.deepEqual(roundTripped.actor_physical_states, jsonValue(persisted.actor_physical_states));
assert.deepEqual(roundTripped.actor_emotional_states, jsonValue(persisted.actor_emotional_states));
assert.deepEqual(roundTripped.alderamontico_state, jsonValue(persisted.alderamontico_state));
assert.deepEqual(roundTripped.simulation_economy, jsonValue(persisted.simulation_economy));
assert.deepEqual(roundTripped.simulation_regions, jsonValue(persisted.simulation_regions));
assert.deepEqual(roundTripped.immersive_scheduler, jsonValue(persisted.immersive_scheduler));
assert.deepEqual(roundTripped.immersive_tile_layers, jsonValue(persisted.immersive_tile_layers));
assert.deepEqual(roundTripped.world_facts, jsonValue(persisted.world_facts));
assert.equal(roundTripped.in_combat, true);
assert.deepEqual(roundTripped.combat_queue, jsonValue(persisted.combat_queue));

const slot = normalizeSaveSlotPayload(
  1,
  JSON.parse(JSON.stringify(buildSaveSlotPayload(1, persisted, "2026-07-13T12:00:00.000Z"))),
);
assert.ok(slot, "save-slot wrapper must load a v2 readiness save");
assert.deepEqual(slot.saveData.map_deltas, jsonValue(persisted.map_deltas));
assert.equal(slot.saveData.current_map_id, lower.id);

console.log("package round-trip: baked generated provenance and manual-edit guard");
const generated = markMapManuallyModified(
  buildDeterministicPlaceholderMap({
    mapId: "readiness_generated_placeholder",
    seed: "readiness-seed-001",
    generatedAt: "2026-07-13T12:00:00.000Z",
  }),
);
const packageWithGenerated = {
  ...authoredPackage,
  settings: {
    ...authoredPackage.settings,
    generation_recipes: [{ id: "placeholder-room-v1", version: "1.0.0" }],
  },
  maps: [...authoredPackage.maps, generated],
};
const normalizedForExport = normalizePackageImportPayload(packageWithGenerated);
const firstExport = serializePackageForExport(normalizedForExport);
const importedPackage = normalizePackageImportPayload(JSON.parse(firstExport));
const secondExport = serializePackageForExport(importedPackage);
assert.equal(secondExport, firstExport, "normalized export/import/re-export must be byte-stable");
const importedGenerated = importedPackage.maps.find((map) => map.id === generated.id)!;
assert.equal(importedGenerated.generation?.manuallyModified, true);
assert.equal(importedGenerated.generation?.seed, "readiness-seed-001");
assert.equal(importedGenerated.generation?.outputHash, generated.generation?.outputHash);
console.log("  package export/import is semantically stable");

// A newer generator version is metadata only. Loading the existing save still
// reads baked ordinary maps and deltas; no generator callback is involved.
importedGenerated.generation = {
  ...importedGenerated.generation!,
  generatorVersion: "99.0.0-test",
};
const loadedAfterGeneratorUpgrade = unwrapPlaySaveV1(
  normalizePlaySaveToV2(JSON.parse(JSON.stringify(saveV2))),
);
assert.deepEqual(loadedAfterGeneratorUpgrade.map_deltas, jsonValue(persisted.map_deltas));
assert.equal(loadedAfterGeneratorUpgrade.current_map_id, persisted.current_map_id);
console.log("  generator-version change leaves baked save untouched");

// The generated placeholder follows the same fine-grid and runtime path as an
// authored map, which is the headless equivalent of opening it in Play Mode.
const runtimeImported = expandGamePackageToFine(importedPackage);
console.log("  generated placeholder materialized through the fine-grid runtime");
const runtimeGenerated = runtimeImported.maps.find((map) => map.id === generated.id)!;
assert.equal(runtimeGenerated.cells.length, generated.cells.length * FINE_PER_MACRO * FINE_PER_MACRO);
assert.ok(runtimeGenerated.spawns[0]);

console.log(
  "Save/package round-trip passed: full two-floor journey, persistent keyed door, combat, chemistry, map deltas, v2 slot, and generated-map provenance.",
);
