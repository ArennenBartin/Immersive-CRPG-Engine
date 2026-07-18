import assert from "node:assert/strict";
import { defaultAxes, type CellChemRecord } from "../src/engine-core/chemistry";
import {
  acknowledgeSuccessionTransition,
  generateIntercessorName,
  getIntercessorHistory,
  normalizeIntercessorCampaign,
  previewIntercessorNames,
  queryIntercessorHistory,
  transitionIntercessorOnDeath,
} from "../src/engine-core/intercessorSuccession";
import {
  beginNewExpedition,
  normalizeWorldStateLayers,
  projectWorldStateLayers,
  resolveWorldStatePolicy,
} from "../src/engine-core/worldStateLayers";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  QA_PERSISTENCE_MAP_ID,
  QA_PERSISTENCE_SHORTCUT_ID,
} from "../src/data/qaSuite/persistenceWing";
import type { GamePackage } from "../src/schema/game";
import type {
  DialogueMemoryState,
  IntercessorRecord,
  PlaySave,
} from "../src/schema/save";
import {
  migratePlaySaveV1ToV2,
  normalizePlaySaveToV2,
  unwrapPlaySaveV1,
} from "../src/schema/v2";
import {
  buildSaveSlotPayload,
  normalizeSaveSlotPayload,
} from "../src/store/playStore";
import { entityPlacementStateKey } from "../src/utils/entityState";
import { placementOriginKey } from "../src/utils/objectFootprint";

const LAB_ID = QA_PERSISTENCE_MAP_ID;
const MAJOR_SWITCH_ID = "qa_persistence_major";
const HAZARD_SWITCH_ID = "qa_persistence_hazard";
const ORDINARY_PLACEMENT_ID = "qa_persistence_ordinary_placement";
const HOSTILE_PLACEMENT_ID = "qa_persistence_hostile_placement";
const CAMPAIGN_TOPIC_ID = "qa_contract_campaign_memory";
const EXPEDITION_TOPIC_ID = "qa_contract_expedition_memory";
const EXPEDITION_DYNAMIC_TOPIC_ID = "qa_contract_dynamic_expedition";

const jsonRoundTrip = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const chemRecord = (): CellChemRecord => ({
  material_id: "oil",
  liquid_id: "fire",
  ...defaultAxes({
    temperature: 118,
    fuel: 72,
    scorch: 21,
    liquid_volume: 45,
    vapor: 18,
  }),
  updated_at_tick: 91,
});

const dialogueMemory = (): DialogueMemoryState => ({
  current_expedition_id: "expedition:1",
  prior_intercessor_ids: [],
  campaign_topics: {
    [CAMPAIGN_TOPIC_ID]: {
      topic_id: CAMPAIGN_TOPIC_ID,
      scope: "campaign",
      known: true,
      source_of_discovery: "contract:campaign",
    },
  },
  expedition_topics: {
    [EXPEDITION_TOPIC_ID]: {
      topic_id: EXPEDITION_TOPIC_ID,
      scope: "expedition",
      known: true,
      source_of_discovery: "contract:expedition",
    },
  },
  dynamic_topics: {
    [EXPEDITION_DYNAMIC_TOPIC_ID]: {
      id: EXPEDITION_DYNAMIC_TOPIC_ID,
      keyword_id: "qa_topic_past_intercessor",
      record_id: "qa_contract_temporary_record",
      display_name: "Temporary Witness",
      category: "intercessors",
      scope: "expedition",
      source_of_discovery: "contract:expedition",
      known: true,
      response_associations: {},
      heard_response_ids: [],
      unread_response_ids: [],
    },
  },
  npc_topics: {
    qa_contract_witness: {
      [EXPEDITION_TOPIC_ID]: {
        ask_count: 2,
        heard_response_ids: ["qa_contract_old_response"],
        last_response_id: "qa_contract_old_response",
        shown_item_ids: [],
      },
    },
  },
});

const makeLegacySave = (
  gamePackage: GamePackage,
  options: { lethal?: boolean } = {},
): PlaySave => {
  const lab = gamePackage.maps.find((map) => map.id === LAB_ID);
  assert.ok(lab, "QA persistence lab must exist");
  const hostileIndex = lab.entity_placements.findIndex(
    (placement) => placement.id === HOSTILE_PLACEMENT_ID,
  );
  assert.ok(hostileIndex >= 0, "QA resettable hostile placement must exist");
  const hostilePlacement = lab.entity_placements[hostileIndex];
  const hostileStateKey = entityPlacementStateKey(
    lab.id,
    hostilePlacement,
    hostileIndex,
  );
  const crate = lab.custom_object_placements.find(
    (placement) =>
      placement.object_id === "obj_crate" &&
      placement.cell[0] === 3 &&
      placement.cell[1] === 6,
  );
  assert.ok(crate, "QA tactical crate must exist");
  const crateKey = placementOriginKey(crate);
  const chemistry = chemRecord();

  // Deliberately omit both Phase 4/5 fields: this is the supported legacy
  // shape the normalizers must upgrade without losing any hot v1 state.
  return {
    schema: "crpg_engine_save_v1",
    package_version: gamePackage.metadata.version,
    current_map_id: LAB_ID,
    player: {
      cell: [2, 5],
      facing: [0, -1],
      sprite_id: "qa_contract_player",
    },
    playerStats: {
      hp: options.lethal ? 0 : 7,
      max_hp: 31,
      mp: 3,
      max_mp: 14,
      attack: 9,
      defense: 4,
      speed: 11,
      energy: 432,
    },
    level: 4,
    experience: 37,
    pending_level_ups: 1,
    known_skills: ["qa_contract_signature", "qa_contract_second_skill"],
    flags: {
      legacy_unscoped_switch: "preserve-me",
      [MAJOR_SWITCH_ID]: true,
      [HAZARD_SWITCH_ID]: true,
    },
    variables: { qa_contract_campaign_value: 17 },
    relationships: { qa_contract_witness: 6 },
    quests: { qa_contract_quest: { state: "active", objectives: {} } },
    inventory: [
      { id: "qa_persistence_artifact", count: 1 },
      { id: "qa_persistence_supplies", count: 2 },
    ],
    money: 29,
    entity_states: {
      [hostileStateKey]: {
        hp: 2,
        cell: [3, -4],
        facing: [-1, 0],
        alerted: true,
      },
    },
    party_members: ["qa_story_companion"],
    map_deltas: {
      [LAB_ID]: {
        taken_items: [
          QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
          ORDINARY_PLACEMENT_ID,
        ],
        opened_doors: [QA_PERSISTENCE_SHORTCUT_ID],
        unlocked_doors: [QA_PERSISTENCE_SHORTCUT_ID],
        dropped_items: [
          {
            id: "qa_contract_dropped_loot",
            item_id: "qa_persistence_supplies",
            cell: [2, 4],
            count: 1,
          },
        ],
        moved_objects: {
          [crateKey]: { cell: [4, 6], facing: [0, -1] },
        },
        surface_layers: {
          "0:2": [
            {
              id: "qa_contract_scorch",
              kind: "scorch",
              amount: 80,
              age_ticks: 1,
              source: "runtime",
              created_at_tick: 91,
            },
          ],
        },
        environment_fields: {
          "0:2": [
            {
              id: "qa_contract_fire",
              kind: "fire",
              intensity: 80,
              age_ticks: 1,
              source: "runtime",
              created_at_tick: 91,
            },
          ],
        },
        npc_tasks: [
          {
            id: "qa_contract_investigation",
            actor_id: hostileStateKey,
            task_type: "investigate",
            source_kind: "fire",
            target_cell: [0, 2],
            priority: 10,
            state: "active",
            created_at_tick: 91,
          },
        ],
      },
    },
    chemistry: { [LAB_ID]: { "0:2": chemistry } },
    chemistry_runs: {
      [LAB_ID]: [{ z: 2, x0: 0, x1: 1, record: chemistry }],
    },
    chemistry_active: { [LAB_ID]: ["0:2"] },
    clock_minutes: 11 * 60 + 17,
    faction_rep: { qa_contract_faction: 5 },
    read_documents: ["qa_doc_story_lab"],
    dialogue_memory: dialogueMemory(),
    explored_cells: {
      [LAB_ID]: ["0:6", "0:0", "0:-5", "4:-4"],
    },
    bark_cooldowns: { qa_contract_bark: 42 },
    actor_statuses: {
      player: [{ id: "burning", remaining: 3, magnitude: 2 }],
      [hostileStateKey]: [{ id: "alerted", remaining: 8, magnitude: 1 }],
    },
    actor_physical_states: {
      player: {
        temperature: 81,
        wetness: 4,
        heat: 56,
        chill: 0,
        charge: 0,
        coating: 0,
        toxicity: 9,
        labels: ["hot"],
        updated_at_tick: 91,
        cell: [2, 5],
      },
    },
    world_facts: [
      {
        id: "qa_contract_world_fact",
        tick: 91,
        map_id: LAB_ID,
        action_type: "opened_shortcut",
      },
    ],
    simulation_regions: {
      qa_contract_region: {
        id: "qa_contract_region",
        map_id: LAB_ID,
        region_id: "south_room",
        resolution: "exact",
        cell_count: 12,
        active_processes: 0,
        queued_tasks: 1,
        environment_fields: 1,
        fire_intensity: 80,
        smoke_intensity: 0,
        sound_intensity: 4,
        updated_at_tick: 91,
      },
    },
    immersive_scheduler: {
      tick: 91,
      segment: 2,
      turn: 7,
      actors: [{ id: "player", speed: 11, energy: 432 }],
    },
    immersive_tile_layers: {
      [LAB_ID]: {
        "0:2": {
          cell: [0, 2],
          material_id: "oil",
          temperature: 118,
          ambient_temperature: 25,
          light: 0.8,
          sound: 0.2,
          occlusion: 0,
          blocks_movement: false,
          blocks_vision: false,
          surface_kinds: ["scorch"],
          environment_kinds: ["fire"],
          updated_at_tick: 91,
        },
      },
    },
    in_combat: true,
    combat_queue: ["player", "qa_story_companion"],
    active_turn_id: "qa_story_companion",
    combat_xp_pool: 13,
  };
};

const assertLifecycleRoundTrip = (label: string, save: PlaySave) => {
  const expectedLayers = jsonRoundTrip(save.world_state_layers);
  const expectedCampaign = jsonRoundTrip(save.intercessor_campaign);
  const v2 = normalizePlaySaveToV2(jsonRoundTrip(migratePlaySaveV1ToV2(save)));
  assert.deepEqual(
    v2.runtime.lifecycle.world_state_layers,
    expectedLayers,
    `${label}: V2 runtime must carry world-state metadata`,
  );
  assert.deepEqual(
    v2.runtime.lifecycle.intercessor_campaign,
    expectedCampaign,
    `${label}: V2 runtime must carry the Intercessor archive`,
  );
  const unwrapped = unwrapPlaySaveV1(v2);
  assert.deepEqual(
    unwrapped.world_state_layers,
    expectedLayers,
    `${label}: V2 content round-trip must preserve world-state metadata`,
  );
  assert.deepEqual(
    unwrapped.intercessor_campaign,
    expectedCampaign,
    `${label}: V2 content round-trip must preserve the Intercessor archive`,
  );

  const slotPayload = jsonRoundTrip(
    buildSaveSlotPayload(2, save, "2044-03-04T05:06:07.000Z"),
  );
  const loaded = normalizeSaveSlotPayload(2, slotPayload);
  assert.ok(loaded, `${label}: named save slot must load`);
  assert.deepEqual(
    loaded.saveData.world_state_layers,
    expectedLayers,
    `${label}: slot must preserve world-state metadata`,
  );
  assert.deepEqual(
    loaded.saveData.intercessor_campaign,
    expectedCampaign,
    `${label}: slot must preserve the Intercessor archive`,
  );
  return loaded.saveData;
};

const assertRecordSnapshot = (
  record: IntercessorRecord,
  skills: string[],
  inventory: PlaySave["inventory"],
) => {
  assert.deepEqual(record.skills, skills, "record must archive exact known skills");
  assert.equal(
    record.signature_skill_id,
    skills[0],
    "record signature must deterministically use the first available skill",
  );
  assert.deepEqual(
    record.inventory_refs,
    inventory.map((entry) => ({ item_id: entry.id, count: entry.count })),
    "record must archive inventory identities and counts",
  );
};

const gamePackage = createQaSuitePackage();
const authoredSnapshot = structuredClone(gamePackage);
const legacySave = makeLegacySave(gamePackage);

console.log("phase 4: legacy normalization and observable authored/campaign/expedition layers");
assert.equal(legacySave.world_state_layers, undefined);
assert.equal(legacySave.intercessor_campaign, undefined);

const layered = normalizeWorldStateLayers(gamePackage, legacySave);
assert.ok(layered.world_state_layers, "legacy save must gain lifecycle metadata");
assert.equal(layered.world_state_layers.schema_version, 1);
assert.equal(layered.world_state_layers.authored.package_version, gamePackage.metadata.version);
assert.deepEqual(
  layered.world_state_layers.authored.map_ids,
  gamePackage.maps.map((map) => map.id),
);
assert.equal(layered.world_state_layers.expedition.status, "active");
assert.equal(layered.flags[MAJOR_SWITCH_ID], true);
assert.equal(layered.flags[HAZARD_SWITCH_ID], true);
assert.ok(
  Object.keys(gamePackage.switches).every((id) => id in layered.flags),
  "legacy normalization must merge the complete authored switch baseline",
);
assert.strictEqual(
  normalizeWorldStateLayers(gamePackage, layered),
  layered,
  "world-state normalization must be referentially idempotent",
);

const policy = resolveWorldStatePolicy(gamePackage);
assert.ok(policy.campaignSwitchIds.includes(MAJOR_SWITCH_ID));
assert.ok(policy.expeditionSwitchIds.includes(HAZARD_SWITCH_ID));
assert.ok(policy.persistentByMap[LAB_ID].doorIds.includes(QA_PERSISTENCE_SHORTCUT_ID));
assert.ok(
  policy.persistentByMap[LAB_ID].itemIds.includes(
    QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
  ),
);

const projection = projectWorldStateLayers(gamePackage, layered);
assert.strictEqual(
  projection.authored.package,
  gamePackage,
  "authored layer must remain the immutable package projection",
);
assert.equal(projection.authored.switch_defaults[MAJOR_SWITCH_ID], false);
assert.equal(projection.authored.switch_defaults[HAZARD_SWITCH_ID], false);
assert.equal(projection.campaign.flags[MAJOR_SWITCH_ID], true);
assert.equal(projection.expedition.flags[HAZARD_SWITCH_ID], true);
assert.deepEqual(projection.campaign.explored_cells[LAB_ID], legacySave.explored_cells?.[LAB_ID]);
assert.deepEqual(
  projection.campaign.map_deltas[LAB_ID]?.taken_items,
  [QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID],
);
assert.deepEqual(
  projection.expedition.map_deltas[LAB_ID]?.taken_items,
  [ORDINARY_PLACEMENT_ID],
);
assert.ok(projection.expedition.map_deltas[LAB_ID]?.dropped_items?.length);
assert.ok(Object.keys(projection.expedition.map_deltas[LAB_ID]?.moved_objects || {}).length);
assert.ok(Object.keys(projection.expedition.entity_states).length);
assert.equal(projection.expedition.combat.in_combat, true);

console.log("phase 5: deterministic initial Intercessor and persistence seams");
const normalizedA = normalizeIntercessorCampaign(gamePackage, layered);
const normalizedB = normalizeIntercessorCampaign(
  gamePackage,
  normalizeWorldStateLayers(gamePackage, structuredClone(legacySave)),
);
assert.ok(normalizedA.intercessor_campaign);
assert.deepEqual(
  normalizedA.intercessor_campaign,
  normalizedB.intercessor_campaign,
  "same package and legacy save must create the same initial campaign archive",
);
assert.strictEqual(
  normalizeIntercessorCampaign(gamePackage, normalizedA),
  normalizedA,
  "canonical Intercessor normalization must be referentially idempotent",
);
const initialCampaign = normalizedA.intercessor_campaign;
const initialId = initialCampaign.current_intercessor_id;
const initialRecord = initialCampaign.records[initialId];
assert.ok(initialRecord);
assert.equal(initialRecord.status, "active");
assertRecordSnapshot(initialRecord, legacySave.known_skills, legacySave.inventory);
assert.equal(normalizedA.dialogue_memory?.current_intercessor_id, initialId);
assert.deepEqual(normalizedA.dialogue_memory?.prior_intercessor_ids, []);

const directName = generateIntercessorName(gamePackage, {
  campaignSeed: initialCampaign.campaign_seed,
  generation: initialRecord.generation,
});
assert.equal(directName, initialRecord.display_name);
const previewA = previewIntercessorNames(gamePackage, {
  campaignSeed: initialCampaign.campaign_seed,
  count: 12,
});
const previewB = previewIntercessorNames(gamePackage, {
  campaignSeed: initialCampaign.campaign_seed,
  count: 12,
});
assert.deepEqual(previewA, previewB, "name previews must be deterministic");
assert.equal(new Set(previewA).size, previewA.length, "avoid policy must prevent preview collisions");
assert.ok(previewA.every((name) => !/null|test/i.test(name)));
assert.ok(previewA.every((name) => name !== "Mara Vale" && name !== "Sable North"));

const roundTrippedInitial = assertLifecycleRoundTrip("initial campaign", normalizedA);
assert.equal(
  roundTrippedInitial.intercessor_campaign?.current_intercessor_id,
  initialId,
);
assert.equal(
  roundTrippedInitial.intercessor_campaign?.records[initialId]?.display_name,
  initialRecord.display_name,
);

console.log("phase 4: expedition boundary preserves memory and clears tactical state");
const reset = beginNewExpedition(gamePackage, roundTrippedInitial, {
  reason: "returned",
  intercessorId: initialId,
  targetMapId: LAB_ID,
  targetCell: [0, 6],
  targetFacing: [0, -1],
});
const afterReset = reset.save;
const resetDelta = afterReset.map_deltas?.[LAB_ID];

assert.equal(reset.closedExpedition.status, "closed");
assert.equal(reset.closedExpedition.end_reason, "returned");
assert.equal(reset.expedition.status, "active");
assert.equal(reset.expedition.index, reset.closedExpedition.index + 1);
assert.equal(reset.expedition.intercessor_id, initialId);
assert.deepEqual(afterReset.explored_cells, legacySave.explored_cells);
assert.equal(afterReset.flags[MAJOR_SWITCH_ID], true, "campaign switch must persist");
assert.equal(
  afterReset.flags[HAZARD_SWITCH_ID],
  gamePackage.switches[HAZARD_SWITCH_ID],
  "expedition switch must restore its authored baseline",
);
assert.deepEqual(resetDelta?.opened_doors, [QA_PERSISTENCE_SHORTCUT_ID]);
assert.deepEqual(resetDelta?.unlocked_doors, [QA_PERSISTENCE_SHORTCUT_ID]);
assert.deepEqual(resetDelta?.taken_items, [QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID]);
assert.equal(resetDelta?.dropped_items, undefined, "dropped loot must reset");
assert.equal(resetDelta?.moved_objects, undefined, "moved tactical crate must reset");
assert.equal(resetDelta?.surface_layers, undefined, "temporary surface hazard must reset");
assert.equal(resetDelta?.environment_fields, undefined, "temporary field hazard must reset");
assert.equal(resetDelta?.npc_tasks, undefined, "temporary NPC tasks must reset");
assert.deepEqual(afterReset.entity_states, {}, "hostile runtime state must reset");
assert.equal(afterReset.chemistry, undefined, "chemistry must reset");
assert.equal(afterReset.chemistry_runs, undefined, "compressed chemistry must reset");
assert.equal(afterReset.chemistry_active, undefined, "chemistry frontier must reset");
assert.deepEqual(afterReset.actor_statuses, {}, "statuses must reset");
assert.deepEqual(afterReset.actor_physical_states, {}, "physical exposure must reset");
assert.deepEqual(afterReset.simulation_regions, {}, "regional tactical simulation must reset");
assert.equal(afterReset.immersive_scheduler, undefined, "scheduler must reset");
assert.deepEqual(afterReset.immersive_tile_layers, {}, "tile simulation must reset");
assert.equal(afterReset.in_combat, false);
assert.deepEqual(afterReset.combat_queue, []);
assert.equal(afterReset.active_turn_id, "player");
assert.equal(afterReset.combat_xp_pool, 0);
assert.ok(afterReset.dialogue_memory?.campaign_topics[CAMPAIGN_TOPIC_ID]?.known);
assert.equal(afterReset.dialogue_memory?.expedition_topics[EXPEDITION_TOPIC_ID], undefined);
assert.equal(
  afterReset.dialogue_memory?.dynamic_topics[EXPEDITION_DYNAMIC_TOPIC_ID],
  undefined,
);
assert.equal(
  afterReset.dialogue_memory?.npc_topics.qa_contract_witness?.[EXPEDITION_TOPIC_ID],
  undefined,
);
assert.equal(reset.report.preserved.explored_cell_count, 4);
assert.equal(reset.report.preserved.door_state_count, 2);
assert.equal(reset.report.preserved.item_state_count, 1);
assert.equal(reset.report.reset.combat, true);
assert.equal(reset.report.reset.chemistry, true);
assert.ok(reset.report.reset.map_delta_record_count >= 6);

console.log("phase 5: death archives one record and creates one successor request set");
const firstDeathInput: PlaySave = {
  ...afterReset,
  current_map_id: LAB_ID,
  player: {
    ...afterReset.player,
    cell: [4, -4],
    facing: [-1, 0],
  },
  playerStats: { ...afterReset.playerStats, hp: 0 },
  known_skills: ["qa_contract_signature", "qa_contract_death_skill"],
  inventory: [
    { id: "qa_persistence_artifact", count: 1 },
    { id: "qa_persistence_supplies", count: 3 },
  ],
  clock_minutes: (afterReset.clock_minutes || 0) + 23,
};
const firstDeath = transitionIntercessorOnDeath(gamePackage, firstDeathInput, {
  cause: "contract fire",
});
assert.equal(firstDeath.changed, true);
assert.ok(firstDeath.deceased);
assert.ok(firstDeath.successor);
assert.equal(firstDeath.deceased.id, initialId);
assert.equal(firstDeath.deceased.status, "dead");
assert.equal(firstDeath.deceased.death?.map_id, LAB_ID);
assert.deepEqual(firstDeath.deceased.death?.cell, [4, -4]);
assert.equal(firstDeath.deceased.death?.cause, "contract fire");
assertRecordSnapshot(
  firstDeath.deceased,
  firstDeathInput.known_skills,
  firstDeathInput.inventory,
);

const firstDeathCampaign = firstDeath.save.intercessor_campaign!;
const successorOne = firstDeath.successor;
assert.notEqual(successorOne.id, initialId);
assert.equal(firstDeathCampaign.current_intercessor_id, successorOne.id);
assert.equal(Object.keys(firstDeathCampaign.death_events).length, 1);
assert.equal(Object.keys(firstDeathCampaign.ghost_requests).length, 1);
assert.equal(Object.keys(firstDeathCampaign.bundle_requests).length, 1);
assert.equal(firstDeathCampaign.ghost_requests[`ghost-request:${initialId}`]?.status, "pending");
assert.equal(firstDeathCampaign.bundle_requests[`bundle-request:${initialId}`]?.status, "pending");
assert.equal(
  firstDeathCampaign.ghost_requests[`ghost-request:${initialId}`]?.source_intercessor_id,
  initialId,
);
assert.equal(
  firstDeathCampaign.bundle_requests[`bundle-request:${initialId}`]?.source_intercessor_id,
  initialId,
);
assert.equal(
  Object.keys(firstDeath.save.entity_states).some((id) => /ghost|bundle/i.test(id)),
  false,
  "death transition must request future materialization, not create runtime entities",
);

const hub = gamePackage.maps.find((map) => map.id === gamePackage.settings.intercessor_succession?.hub_map_id);
const hubSpawn = hub?.spawns.find(
  (spawn) => spawn.id === gamePackage.settings.intercessor_succession?.hub_spawn_id,
);
assert.ok(hub && hubSpawn, "configured succession hub and spawn must exist");
assert.equal(firstDeath.save.current_map_id, hub.id);
assert.deepEqual(firstDeath.save.player.cell, hubSpawn.cell);
assert.deepEqual(firstDeath.save.player.facing, hubSpawn.facing);
assert.equal(firstDeath.save.playerStats.hp, firstDeath.save.playerStats.max_hp);
assert.equal(firstDeath.save.playerStats.mp, firstDeath.save.playerStats.max_mp);
assert.equal(firstDeath.save.in_combat, false);
assert.equal(
  firstDeath.save.world_state_layers?.expedition.intercessor_id,
  successorOne.id,
);
assert.equal(
  firstDeath.save.world_state_layers?.expedition.index,
  reset.expedition.index + 1,
);
assert.equal(firstDeath.save.dialogue_memory?.current_intercessor_id, successorOne.id);
assert.deepEqual(firstDeath.save.dialogue_memory?.prior_intercessor_ids, [initialId]);
const exactPastTopic = firstDeath.save.dialogue_memory?.dynamic_topics[`past:${initialId}`];
assert.ok(exactPastTopic, "deceased Intercessor must become an exact dynamic dialogue topic");
assert.equal(exactPastTopic.keyword_id, "qa_topic_past_intercessor");
assert.equal(exactPastTopic.record_id, initialId);
assert.equal(exactPastTopic.display_name, firstDeath.deceased.display_name);
assert.equal(exactPastTopic.scope, "campaign");
assert.equal(exactPastTopic.known, true);

const repeatedTransition = transitionIntercessorOnDeath(gamePackage, firstDeath.save);
assert.equal(repeatedTransition.changed, false, "live successor must not repeat the death transition");
assert.deepEqual(
  repeatedTransition.save.intercessor_campaign,
  firstDeath.save.intercessor_campaign,
  "repeated transition must not append archive state",
);

const loadedAfterFirstDeath = assertLifecycleRoundTrip("first death", firstDeath.save);
const repeatedAfterLoad = transitionIntercessorOnDeath(gamePackage, loadedAfterFirstDeath);
assert.equal(repeatedAfterLoad.changed, false, "load must not replay an already applied transition");
assert.equal(Object.keys(repeatedAfterLoad.save.intercessor_campaign?.death_events || {}).length, 1);
assert.equal(Object.keys(repeatedAfterLoad.save.intercessor_campaign?.ghost_requests || {}).length, 1);
assert.equal(Object.keys(repeatedAfterLoad.save.intercessor_campaign?.bundle_requests || {}).length, 1);

const acknowledged = acknowledgeSuccessionTransition(loadedAfterFirstDeath);
assert.equal(acknowledged.intercessor_campaign?.last_transition?.acknowledged, true);
assert.strictEqual(
  acknowledgeSuccessionTransition(acknowledged),
  acknowledged,
  "transition acknowledgement must be idempotent",
);

console.log("phase 5: second death appends history without identity collisions");
const secondDeathInput: PlaySave = {
  ...acknowledged,
  playerStats: { ...acknowledged.playerStats, hp: 0 },
  known_skills: ["qa_contract_successor_signature"],
  inventory: [{ id: "qa_persistence_supplies", count: 4 }],
  clock_minutes: (acknowledged.clock_minutes || 0) + 31,
};
const secondDeath = transitionIntercessorOnDeath(gamePackage, secondDeathInput, {
  cause: "contract collapse",
});
assert.equal(secondDeath.changed, true);
assert.ok(secondDeath.deceased && secondDeath.successor);
assert.equal(secondDeath.deceased.id, successorOne.id);
assertRecordSnapshot(
  secondDeath.deceased,
  secondDeathInput.known_skills,
  secondDeathInput.inventory,
);
const secondCampaign = secondDeath.save.intercessor_campaign!;
assert.equal(Object.keys(secondCampaign.records).length, 3);
assert.equal(Object.keys(secondCampaign.death_events).length, 2);
assert.equal(Object.keys(secondCampaign.ghost_requests).length, 2);
assert.equal(Object.keys(secondCampaign.bundle_requests).length, 2);
assert.equal(new Set(secondCampaign.record_order).size, 3);
assert.equal(new Set(Object.keys(secondCampaign.records)).size, 3);
assert.equal(new Set(Object.values(secondCampaign.records).map((record) => record.display_name)).size, 3);
assert.deepEqual(secondDeath.save.dialogue_memory?.prior_intercessor_ids, [initialId, successorOne.id]);
assert.equal(
  secondDeath.save.dialogue_memory?.dynamic_topics[`past:${successorOne.id}`]?.record_id,
  successorOne.id,
);

const history = getIntercessorHistory(secondDeath.save);
assert.deepEqual(history.map((record) => record.id), secondCampaign.record_order);
assert.deepEqual(history.map((record) => record.generation), [1, 2, 3]);
assert.deepEqual(history.map((record) => record.status), ["dead", "dead", "active"]);
assert.deepEqual(queryIntercessorHistory(secondDeath.save), history);
assert.equal(history[0].history.length, 1);
assert.match(history[0].history[0], /contract fire/);
assert.equal(history[1].history.length, 1);
assert.match(history[1].history[0], /contract collapse/);
assert.equal(
  secondCampaign.last_transition?.successor_intercessor_id,
  secondDeath.successor.id,
);
assertLifecycleRoundTrip("second death", secondDeath.save);

console.log("phase 5: stable record IDs survive deliberate display-name collisions");
const collisionPackage = structuredClone(gamePackage);
collisionPackage.settings.intercessor_succession = {
  ...collisionPackage.settings.intercessor_succession,
  name_prefixes: ["Same"],
  name_roots: ["name"],
  name_suffixes: ["always"],
  banned_names: [],
  reserved_names: [],
  duplicate_name_policy: "allow",
};
let collisionSave = normalizeIntercessorCampaign(
  collisionPackage,
  makeLegacySave(collisionPackage),
);
for (let deathIndex = 0; deathIndex < 2; deathIndex += 1) {
  const result = transitionIntercessorOnDeath(collisionPackage, {
    ...collisionSave,
    playerStats: { ...collisionSave.playerStats, hp: 0 },
    clock_minutes: (collisionSave.clock_minutes || 0) + deathIndex + 1,
  });
  assert.equal(result.changed, true);
  collisionSave = result.save;
}
const collisionHistory = getIntercessorHistory(collisionSave);
assert.equal(collisionHistory.length, 3);
assert.equal(
  new Set(collisionHistory.map((record) => record.display_name)).size,
  1,
  "fixture must actually force display-name collisions",
);
assert.equal(
  new Set(collisionHistory.map((record) => record.id)).size,
  collisionHistory.length,
  "stable record identity must remain unique even when every display name collides",
);
assert.ok(
  collisionHistory.every(
    (record) =>
      collisionSave.dialogue_memory?.current_intercessor_id === record.id ||
      collisionSave.dialogue_memory?.dynamic_topics[`past:${record.id}`]?.record_id === record.id,
  ),
  "dialogue bindings must use exact record IDs instead of ambiguous display text",
);

assert.deepEqual(
  gamePackage,
  authoredSnapshot,
  "normalization, projection, reset, succession, and serialization must never mutate authored package data",
);

console.log("persistence + succession contract: passed");
