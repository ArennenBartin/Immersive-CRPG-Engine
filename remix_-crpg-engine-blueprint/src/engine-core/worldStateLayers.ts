import type { GamePackage } from "../schema/game";
import type {
  ExpeditionLifecycleRecord,
  MapDelta,
  PlaySave,
  WorldStateLayerMetadata,
} from "../schema/save";
import { entityPlacementStateKey } from "../utils/entityState";
import { beginNewDialogueExpedition } from "./keywordDialogue";

/**
 * Phase 4 owns lifecycle scope, while the existing top-level PlaySave fields
 * remain the hot compatibility projection read by the rest of the engine.
 */
export const WORLD_STATE_LAYERS_VERSION = 1 as const;

export interface WorldStateMapPolicy {
  doorIds: string[];
  objectIds: string[];
  itemIds: string[];
  containerIds: string[];
}

export interface WorldStatePolicy {
  version: number;
  campaignId?: string;
  campaignSwitchIds: string[];
  expeditionSwitchIds: string[];
  tacticalFlagPrefixes: string[];
  persistentEntityStateIds: string[];
  persistentByMap: Record<string, WorldStateMapPolicy>;
  preserveChemistry: boolean;
}

export interface WorldStateLayerProjection {
  metadata: WorldStateLayerMetadata;
  policy: WorldStatePolicy;
  authored: {
    package: Readonly<GamePackage>;
    package_version: string;
    map_ids: string[];
    switch_defaults: Record<string, boolean>;
  };
  campaign: {
    flags: Record<string, unknown>;
    variables: NonNullable<PlaySave["variables"]>;
    relationships: NonNullable<PlaySave["relationships"]>;
    quests: PlaySave["quests"];
    faction_rep: NonNullable<PlaySave["faction_rep"]>;
    read_documents: NonNullable<PlaySave["read_documents"]>;
    dialogue_memory: PlaySave["dialogue_memory"];
    explored_cells: NonNullable<PlaySave["explored_cells"]>;
    world_facts: NonNullable<PlaySave["world_facts"]>;
    map_deltas: NonNullable<PlaySave["map_deltas"]>;
    entity_states: PlaySave["entity_states"];
  };
  expedition: {
    lifecycle: ExpeditionLifecycleRecord;
    current_map_id: string;
    player: PlaySave["player"];
    playerStats: PlaySave["playerStats"];
    flags: Record<string, unknown>;
    map_deltas: NonNullable<PlaySave["map_deltas"]>;
    entity_states: PlaySave["entity_states"];
    chemistry?: PlaySave["chemistry"];
    chemistry_runs?: PlaySave["chemistry_runs"];
    chemistry_active?: PlaySave["chemistry_active"];
    actor_statuses: NonNullable<PlaySave["actor_statuses"]>;
    actor_physical_states: NonNullable<PlaySave["actor_physical_states"]>;
    simulation_regions: NonNullable<PlaySave["simulation_regions"]>;
    immersive_scheduler?: PlaySave["immersive_scheduler"];
    immersive_tile_layers: NonNullable<PlaySave["immersive_tile_layers"]>;
    bark_cooldowns: NonNullable<PlaySave["bark_cooldowns"]>;
    combat: {
      in_combat: boolean;
      combat_queue: string[];
      active_turn_id: string | null;
      combat_xp_pool: number;
    };
  };
}

export interface BeginNewExpeditionOptions {
  reason: string;
  intercessorId: string;
  targetMapId?: string;
  targetCell?: [number, number];
  targetFacing?: [number, number];
}

export interface WorldStateResetReport {
  policy_version: number;
  closed_expedition_id: string;
  expedition_id: string;
  reason: string;
  preserved: {
    explored_cell_count: number;
    read_document_count: number;
    world_fact_count: number;
    switch_ids: string[];
    entity_state_ids: string[];
    door_state_count: number;
    object_state_count: number;
    item_state_count: number;
    container_state_count: number;
    chemistry: boolean;
  };
  reset: {
    switch_ids: string[];
    entity_state_ids: string[];
    map_delta_record_count: number;
    combat: boolean;
    actor_status_count: number;
    actor_physical_state_count: number;
    chemistry: boolean;
    simulation: boolean;
  };
  target: {
    map_id: string;
    cell: [number, number];
    facing: [number, number];
  };
}

export interface BeginNewExpeditionResult {
  save: PlaySave;
  report: WorldStateResetReport;
  closedExpedition: ExpeditionLifecycleRecord;
  expedition: ExpeditionLifecycleRecord;
}

const DEFAULT_TACTICAL_FLAG_PREFIXES = [
  "expedition_",
  "tactical_",
  "temporary_",
  "temp_",
  "immersive_stealth_",
  "immersive_overwatch_",
  "immersive_mimic_",
];

const EMPTY_MAP_POLICY: WorldStateMapPolicy = {
  doorIds: [],
  objectIds: [],
  itemIds: [],
  containerIds: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uniqueStrings = (...values: unknown[]): string[] => {
  const result = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.trim()) result.add(value.trim());
    else if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) {
      Object.entries(value).forEach(([key, enabled]) => {
        if (enabled === true) result.add(key);
      });
    }
  };
  values.forEach(visit);
  return [...result].sort();
};

const firstBoolean = (record: Record<string, unknown>, keys: string[], fallback: boolean) => {
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return fallback;
};

const firstNumber = (record: Record<string, unknown>, keys: string[], fallback: number) => {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return fallback;
};

const mapListRecord = (value: unknown): Record<string, string[]> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([mapId, entries]) => [mapId, uniqueStrings(entries)] as const)
      .filter(([, entries]) => entries.length > 0),
  );
};

const mergeMapPolicy = (
  target: Record<string, WorldStateMapPolicy>,
  mapId: string,
  update: Partial<WorldStateMapPolicy>,
) => {
  const current = target[mapId] || EMPTY_MAP_POLICY;
  target[mapId] = {
    doorIds: uniqueStrings(current.doorIds, update.doorIds),
    objectIds: uniqueStrings(current.objectIds, update.objectIds),
    itemIds: uniqueStrings(current.itemIds, update.itemIds),
    containerIds: uniqueStrings(current.containerIds, update.containerIds),
  };
};

/** Parse the author-owned JSON policy into one stable, typed runtime shape. */
export const parseWorldStatePolicy = (gamePackage: GamePackage): WorldStatePolicy => {
  const raw = isRecord(gamePackage.settings?.world_state_policy)
    ? gamePackage.settings.world_state_policy as Record<string, unknown>
    : {};
  const persistent = isRecord(raw.persistent) ? raw.persistent : {};
  const persistentByMap: Record<string, WorldStateMapPolicy> = {};

  const nestedMaps = [raw.persistent_by_map, raw.persistentByMap, raw.maps, persistent.maps];
  nestedMaps.forEach((candidate) => {
    if (!isRecord(candidate)) return;
    Object.entries(candidate).forEach(([mapId, value]) => {
      if (!isRecord(value)) return;
      mergeMapPolicy(persistentByMap, mapId, {
        doorIds: uniqueStrings(value.door_ids, value.doorIds, value.doors),
        objectIds: uniqueStrings(value.object_ids, value.objectIds, value.objects),
        itemIds: uniqueStrings(value.item_ids, value.itemIds, value.items),
        containerIds: uniqueStrings(value.container_ids, value.containerIds, value.containers),
      });
    });
  });

  const mergeCategory = (values: unknown[], field: keyof WorldStateMapPolicy) => {
    values.map(mapListRecord).forEach((byMap) => {
      Object.entries(byMap).forEach(([mapId, ids]) => mergeMapPolicy(persistentByMap, mapId, { [field]: ids }));
    });
  };
  mergeCategory([raw.persistent_door_ids, raw.persistentDoors, persistent.doors], "doorIds");
  mergeCategory([raw.persistent_object_ids, raw.persistentObjects, persistent.objects], "objectIds");
  mergeCategory([raw.persistent_item_ids, raw.persistentItems, persistent.items], "itemIds");
  mergeCategory([raw.persistent_container_ids, raw.persistentContainers, persistent.containers], "containerIds");

  const campaignId = typeof raw.campaign_id === "string"
    ? raw.campaign_id
    : typeof raw.campaignId === "string"
      ? raw.campaignId
      : undefined;

  return {
    version: firstNumber(raw, ["version", "schema_version", "policy_version"], WORLD_STATE_LAYERS_VERSION),
    campaignId,
    campaignSwitchIds: uniqueStrings(
      raw.campaign_switch_ids,
      raw.campaignSwitchIds,
      raw.campaign_switches,
      persistent.switches,
    ),
    expeditionSwitchIds: uniqueStrings(
      raw.expedition_switch_ids,
      raw.expeditionSwitchIds,
      raw.expedition_switches,
      raw.tactical_switch_ids,
    ),
    tacticalFlagPrefixes: uniqueStrings(
      DEFAULT_TACTICAL_FLAG_PREFIXES,
      raw.tactical_flag_prefixes,
      raw.tacticalFlagPrefixes,
    ),
    persistentEntityStateIds: uniqueStrings(
      raw.persistent_entity_state_ids,
      raw.persistentEntityStateIds,
      raw.persistent_entities,
      persistent.entities,
    ),
    persistentByMap,
    preserveChemistry: firstBoolean(
      raw,
      ["preserve_chemistry", "preserveChemistry", "chemistry_persists"],
      false,
    ),
  };
};

// More descriptive alias for callers that treat policy parsing as resolution.
export const resolveWorldStatePolicy = parseWorldStatePolicy;

const cloneCell = (cell: readonly unknown[]): [number, number] => [
  typeof cell[0] === "number" ? cell[0] : 0,
  typeof cell[1] === "number" ? cell[1] : 0,
];

const parseExpeditionIndex = (id: string | undefined) => {
  const match = id?.match(/(\d+)$/);
  return match ? Math.max(1, Number(match[1])) : 1;
};

const sameStringArray = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameMetadata = (left: WorldStateLayerMetadata | undefined, right: WorldStateLayerMetadata) =>
  Boolean(
    left &&
      left.schema_version === right.schema_version &&
      left.authored.package_version === right.authored.package_version &&
      sameStringArray(left.authored.map_ids || [], right.authored.map_ids) &&
      left.campaign.id === right.campaign.id &&
      left.campaign.persistence_policy_version === right.campaign.persistence_policy_version &&
      left.expedition.id === right.expedition.id &&
      left.expedition.index === right.expedition.index &&
      left.expedition.intercessor_id === right.expedition.intercessor_id &&
      left.expedition.status === right.expedition.status &&
      left.expedition.started_at_clock_minutes === right.expedition.started_at_clock_minutes &&
      left.expedition.ended_at_clock_minutes === right.expedition.ended_at_clock_minutes &&
      left.expedition.end_reason === right.expedition.end_reason &&
      left.expedition.reset_policy_version === right.expedition.reset_policy_version,
  );

/**
 * Backfill lifecycle metadata and authored switch defaults without destroying
 * any legacy runtime field. Calling this twice is referentially idempotent.
 */
export const normalizeWorldStateLayers = (
  gamePackage: GamePackage,
  save: PlaySave,
): PlaySave => {
  const policy = parseWorldStatePolicy(gamePackage);
  const existing = save.world_state_layers;
  const dialogueExpeditionId = save.dialogue_memory?.current_expedition_id;
  const expeditionId = existing?.expedition.id || dialogueExpeditionId || "expedition:1";
  const intercessorId =
    existing?.expedition.intercessor_id ||
    save.intercessor_campaign?.current_intercessor_id ||
    save.dialogue_memory?.current_intercessor_id ||
    "intercessor:1";
  const index = Math.max(existing?.expedition.index || 0, parseExpeditionIndex(expeditionId));
  const metadata: WorldStateLayerMetadata = {
    schema_version: WORLD_STATE_LAYERS_VERSION,
    authored: {
      package_version: gamePackage.metadata.version,
      map_ids: gamePackage.maps.map((map) => map.id),
    },
    campaign: {
      id:
        existing?.campaign.id ||
        save.intercessor_campaign?.campaign_id ||
        policy.campaignId ||
        `campaign:${gamePackage.metadata.version}`,
      persistence_policy_version: policy.version,
    },
    expedition: {
      id: expeditionId,
      index,
      intercessor_id: intercessorId,
      status: existing?.expedition.status || "active",
      started_at_clock_minutes:
        existing?.expedition.started_at_clock_minutes ?? save.clock_minutes ?? 0,
      reset_policy_version: policy.version,
      ...(existing?.expedition.ended_at_clock_minutes !== undefined
        ? { ended_at_clock_minutes: existing.expedition.ended_at_clock_minutes }
        : {}),
      ...(existing?.expedition.end_reason !== undefined
        ? { end_reason: existing.expedition.end_reason }
        : {}),
    },
  };
  const flags = { ...(gamePackage.switches || {}), ...(save.flags || {}) };
  const flagsUnchanged =
    Object.keys(flags).length === Object.keys(save.flags || {}).length &&
    Object.entries(flags).every(([id, value]) => save.flags?.[id] === value);
  const optionalFieldsCanonical = !existing || (
    !(Object.prototype.hasOwnProperty.call(existing.expedition, "ended_at_clock_minutes") &&
      existing.expedition.ended_at_clock_minutes === undefined) &&
    !(Object.prototype.hasOwnProperty.call(existing.expedition, "end_reason") &&
      existing.expedition.end_reason === undefined)
  );
  if (sameMetadata(existing, metadata) && flagsUnchanged && optionalFieldsCanonical) return save;
  return { ...save, flags, world_state_layers: metadata };
};

const mapPolicyFor = (policy: WorldStatePolicy, mapId: string): WorldStateMapPolicy => {
  const wildcard = policy.persistentByMap["*"] || EMPTY_MAP_POLICY;
  const exact = policy.persistentByMap[mapId] || EMPTY_MAP_POLICY;
  return {
    doorIds: uniqueStrings(wildcard.doorIds, exact.doorIds),
    objectIds: uniqueStrings(wildcard.objectIds, exact.objectIds),
    itemIds: uniqueStrings(wildcard.itemIds, exact.itemIds),
    containerIds: uniqueStrings(wildcard.containerIds, exact.containerIds),
  };
};

const persistentEntityStateIds = (gamePackage: GamePackage, policy: WorldStatePolicy) => {
  const authored = new Set(policy.persistentEntityStateIds);
  gamePackage.maps.forEach((map) => {
    map.entity_placements.forEach((placement, index) => {
      if (
        authored.has(placement.entity_id) ||
        (placement.id !== undefined && authored.has(placement.id))
      ) {
        authored.add(entityPlacementStateKey(map.id, placement, index));
      }
    });
  });
  return authored;
};

const persistentTargetIds = (
  gamePackage: GamePackage,
  mapId: string,
  mapPolicy: WorldStateMapPolicy,
) => {
  const ids = new Set([
    ...mapPolicy.doorIds,
    ...mapPolicy.objectIds,
    ...mapPolicy.itemIds,
    ...mapPolicy.containerIds,
  ]);
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  map?.custom_object_placements.forEach((placement) => {
    if (placement.id && (mapPolicy.objectIds.includes(placement.id) || mapPolicy.doorIds.includes(placement.id))) {
      ids.add(placement.object_id);
    }
  });
  map?.item_placements.forEach((placement) => {
    if (mapPolicy.itemIds.includes(placement.id)) ids.add(placement.item_id);
  });
  return ids;
};

const nonEmptyRecord = (value: Record<string, unknown> | undefined) =>
  value && Object.keys(value).length > 0 ? value : undefined;

const nonEmptyArray = <T,>(value: T[] | undefined) =>
  value && value.length > 0 ? value : undefined;

const compactMapDelta = (delta: MapDelta): MapDelta | undefined => {
  const compact: MapDelta = {
    taken_items: nonEmptyArray(delta.taken_items),
    opened_doors: nonEmptyArray(delta.opened_doors),
    unlocked_doors: nonEmptyArray(delta.unlocked_doors),
    dropped_items: nonEmptyArray(delta.dropped_items),
    containers: nonEmptyRecord(delta.containers) as MapDelta["containers"],
    moved_objects: nonEmptyRecord(delta.moved_objects) as MapDelta["moved_objects"],
    carried_objects: nonEmptyRecord(delta.carried_objects) as MapDelta["carried_objects"],
    removed_objects: nonEmptyArray(delta.removed_objects),
    simulation_conditions: nonEmptyRecord(delta.simulation_conditions) as MapDelta["simulation_conditions"],
    surface_layers: nonEmptyRecord(delta.surface_layers) as MapDelta["surface_layers"],
    environment_fields: nonEmptyRecord(delta.environment_fields) as MapDelta["environment_fields"],
    npc_tasks: nonEmptyArray(delta.npc_tasks),
    simulation_processes: nonEmptyArray(delta.simulation_processes),
  };
  return Object.values(compact).some((value) => value !== undefined) ? compact : undefined;
};

const partitionMapDelta = (
  gamePackage: GamePackage,
  mapId: string,
  delta: MapDelta,
  policy: WorldStatePolicy,
) => {
  const scoped = mapPolicyFor(policy, mapId);
  const doors = new Set(scoped.doorIds);
  const objects = new Set(scoped.objectIds);
  const items = new Set(scoped.itemIds);
  const containers = new Set(scoped.containerIds);
  const targetIds = persistentTargetIds(gamePackage, mapId, scoped);
  const conditionEntries = Object.entries(delta.simulation_conditions || {});
  const campaignConditions = Object.fromEntries(
    conditionEntries.filter(([, record]) => targetIds.has(record.target_id)),
  );
  const expeditionConditions = Object.fromEntries(
    conditionEntries.filter(([, record]) => !targetIds.has(record.target_id)),
  );
  const containerEntries = Object.entries(delta.containers || {});
  const movedEntries = Object.entries(delta.moved_objects || {});
  const carriedEntries = Object.entries(delta.carried_objects || {});

  return {
    campaign: compactMapDelta({
      taken_items: (delta.taken_items || []).filter((id) => items.has(id)),
      opened_doors: (delta.opened_doors || []).filter((id) => doors.has(id)),
      unlocked_doors: (delta.unlocked_doors || []).filter((id) => doors.has(id)),
      containers: Object.fromEntries(containerEntries.filter(([id]) => containers.has(id))),
      moved_objects: Object.fromEntries(movedEntries.filter(([id]) => objects.has(id))),
      carried_objects: Object.fromEntries(carriedEntries.filter(([id]) => objects.has(id))),
      removed_objects: (delta.removed_objects || []).filter((id) => objects.has(id)),
      simulation_conditions: campaignConditions,
    }),
    expedition: compactMapDelta({
      taken_items: (delta.taken_items || []).filter((id) => !items.has(id)),
      opened_doors: (delta.opened_doors || []).filter((id) => !doors.has(id)),
      unlocked_doors: (delta.unlocked_doors || []).filter((id) => !doors.has(id)),
      dropped_items: structuredClone(delta.dropped_items || []),
      containers: Object.fromEntries(containerEntries.filter(([id]) => !containers.has(id))),
      moved_objects: Object.fromEntries(movedEntries.filter(([id]) => !objects.has(id))),
      carried_objects: Object.fromEntries(carriedEntries.filter(([id]) => !objects.has(id))),
      removed_objects: (delta.removed_objects || []).filter((id) => !objects.has(id)),
      simulation_conditions: expeditionConditions,
      surface_layers: structuredClone(delta.surface_layers || {}),
      environment_fields: structuredClone(delta.environment_fields || {}),
      npc_tasks: structuredClone(delta.npc_tasks || []),
      simulation_processes: structuredClone(delta.simulation_processes || []),
    }),
  };
};

const partitionMapDeltas = (
  gamePackage: GamePackage,
  save: PlaySave,
  policy: WorldStatePolicy,
) => {
  const campaign: Record<string, MapDelta> = {};
  const expedition: Record<string, MapDelta> = {};
  Object.entries(save.map_deltas || {}).forEach(([mapId, delta]) => {
    const partitioned = partitionMapDelta(gamePackage, mapId, delta, policy);
    if (partitioned.campaign) campaign[mapId] = partitioned.campaign;
    if (partitioned.expedition) expedition[mapId] = partitioned.expedition;
  });
  return { campaign, expedition };
};

const persistentLightOverrideKeys = (gamePackage: GamePackage, policy: WorldStatePolicy) => {
  const keys = new Set<string>();
  gamePackage.maps.forEach((map) => {
    const scoped = mapPolicyFor(policy, map.id);
    map.custom_object_placements.forEach((placement) => {
      if (!placement.id || (!scoped.objectIds.includes(placement.id) && !scoped.doorIds.includes(placement.id))) return;
      keys.add(`light:object:${placement.id}`);
      keys.add(`light:carried-object:${placement.id}`);
      keys.add(`object:${placement.object_id}`);
    });
    map.item_placements.forEach((placement) => {
      if (!scoped.itemIds.includes(placement.id)) return;
      keys.add(`light:item:${placement.id}`);
      keys.add(`item:${placement.item_id}`);
      keys.add(`light:carried:player:${placement.item_id}`);
    });
  });
  return keys;
};

const partitionFlags = (gamePackage: GamePackage, save: PlaySave, policy: WorldStatePolicy) => {
  const campaign: Record<string, unknown> = {};
  const expedition: Record<string, unknown> = {};
  const campaignIds = new Set(policy.campaignSwitchIds);
  const expeditionIds = new Set(policy.expeditionSwitchIds);
  const permanentLightKeys = persistentLightOverrideKeys(gamePackage, policy);

  Object.entries(save.flags || {}).forEach(([id, value]) => {
    if (id === "immersive_light_states" && isRecord(value) && !campaignIds.has(id) && !expeditionIds.has(id)) {
      const campaignLights: Record<string, unknown> = {};
      const expeditionLights: Record<string, unknown> = {};
      Object.entries(value).forEach(([key, active]) => {
        (permanentLightKeys.has(key) ? campaignLights : expeditionLights)[key] = active;
      });
      if (Object.keys(campaignLights).length) campaign[id] = campaignLights;
      if (Object.keys(expeditionLights).length) expedition[id] = expeditionLights;
      return;
    }
    const tactical =
      !campaignIds.has(id) &&
      (expeditionIds.has(id) || policy.tacticalFlagPrefixes.some((prefix) => id.startsWith(prefix)));
    (tactical ? expedition : campaign)[id] = structuredClone(value);
  });
  return { campaign, expedition };
};

const recordSubset = <T,>(record: Record<string, T> | undefined, keys: Set<string>, include: boolean) =>
  Object.fromEntries(
    Object.entries(record || {})
      .filter(([id]) => keys.has(id) === include)
      .map(([id, value]) => [id, structuredClone(value)]),
  );

/** Return an observable authored/campaign/expedition view of the hot save. */
export const projectWorldStateLayers = (
  gamePackage: GamePackage,
  save: PlaySave,
): WorldStateLayerProjection => {
  const normalized = normalizeWorldStateLayers(gamePackage, save);
  const metadata = normalized.world_state_layers!;
  const policy = parseWorldStatePolicy(gamePackage);
  const mapDeltas = partitionMapDeltas(gamePackage, normalized, policy);
  const flags = partitionFlags(gamePackage, normalized, policy);
  const persistentEntities = persistentEntityStateIds(gamePackage, policy);
  return {
    metadata: structuredClone(metadata),
    policy,
    authored: {
      package: gamePackage,
      package_version: gamePackage.metadata.version,
      map_ids: gamePackage.maps.map((map) => map.id),
      switch_defaults: { ...(gamePackage.switches || {}) },
    },
    campaign: {
      flags: flags.campaign,
      variables: structuredClone(normalized.variables || {}),
      relationships: structuredClone(normalized.relationships || {}),
      quests: structuredClone(normalized.quests || {}),
      faction_rep: structuredClone(normalized.faction_rep || {}),
      read_documents: [...(normalized.read_documents || [])],
      dialogue_memory: normalized.dialogue_memory ? structuredClone(normalized.dialogue_memory) : undefined,
      explored_cells: structuredClone(normalized.explored_cells || {}),
      world_facts: structuredClone(normalized.world_facts || []),
      map_deltas: mapDeltas.campaign,
      entity_states: recordSubset(normalized.entity_states, persistentEntities, true),
    },
    expedition: {
      lifecycle: structuredClone(metadata.expedition),
      current_map_id: normalized.current_map_id,
      player: structuredClone(normalized.player),
      playerStats: { ...normalized.playerStats },
      flags: flags.expedition,
      map_deltas: mapDeltas.expedition,
      entity_states: recordSubset(normalized.entity_states, persistentEntities, false),
      chemistry: normalized.chemistry ? structuredClone(normalized.chemistry) : undefined,
      chemistry_runs: normalized.chemistry_runs ? structuredClone(normalized.chemistry_runs) : undefined,
      chemistry_active: normalized.chemistry_active ? structuredClone(normalized.chemistry_active) : undefined,
      actor_statuses: structuredClone(normalized.actor_statuses || {}),
      actor_physical_states: structuredClone(normalized.actor_physical_states || {}),
      simulation_regions: structuredClone(normalized.simulation_regions || {}),
      immersive_scheduler: normalized.immersive_scheduler ? structuredClone(normalized.immersive_scheduler) : undefined,
      immersive_tile_layers: structuredClone(normalized.immersive_tile_layers || {}),
      bark_cooldowns: { ...(normalized.bark_cooldowns || {}) },
      combat: {
        in_combat: Boolean(normalized.in_combat),
        combat_queue: [...(normalized.combat_queue || [])],
        active_turn_id: normalized.active_turn_id ?? null,
        combat_xp_pool: normalized.combat_xp_pool ?? 0,
      },
    },
  };
};

const countExploredCells = (save: PlaySave) =>
  Object.values(save.explored_cells || {}).reduce((count, cells) => count + cells.length, 0);

const countMapDeltaRecords = (deltas: Record<string, MapDelta>) =>
  Object.values(deltas).reduce((count, delta) => {
    return count +
      (delta.taken_items?.length || 0) +
      (delta.opened_doors?.length || 0) +
      (delta.unlocked_doors?.length || 0) +
      (delta.dropped_items?.length || 0) +
      Object.keys(delta.containers || {}).length +
      Object.keys(delta.moved_objects || {}).length +
      Object.keys(delta.carried_objects || {}).length +
      (delta.removed_objects?.length || 0) +
      Object.keys(delta.simulation_conditions || {}).length +
      Object.keys(delta.surface_layers || {}).length +
      Object.keys(delta.environment_fields || {}).length +
      (delta.npc_tasks?.length || 0) +
      (delta.simulation_processes?.length || 0);
  }, 0);

const countPersistentMapState = (deltas: Record<string, MapDelta>) => ({
  doors: Object.values(deltas).reduce(
    (count, delta) => count + (delta.opened_doors?.length || 0) + (delta.unlocked_doors?.length || 0),
    0,
  ),
  objects: Object.values(deltas).reduce(
    (count, delta) => count + Object.keys(delta.moved_objects || {}).length + Object.keys(delta.carried_objects || {}).length + (delta.removed_objects?.length || 0),
    0,
  ),
  items: Object.values(deltas).reduce((count, delta) => count + (delta.taken_items?.length || 0), 0),
  containers: Object.values(deltas).reduce((count, delta) => count + Object.keys(delta.containers || {}).length, 0),
});

const resetFlagProjection = (
  gamePackage: GamePackage,
  campaignFlags: Record<string, unknown>,
  expeditionFlags: Record<string, unknown>,
) => {
  const flags: Record<string, unknown> = { ...campaignFlags };
  Object.keys(expeditionFlags).forEach((id) => {
    if (id in (gamePackage.switches || {})) flags[id] = gamePackage.switches[id];
  });
  return flags as PlaySave["flags"];
};

const filterAlderamonticoState = (
  state: PlaySave["alderamontico_state"],
  persistentIds: Set<string>,
): PlaySave["alderamontico_state"] => {
  if (!state) return undefined;
  const actors = recordSubset(state.actors, persistentIds, true);
  const attended = recordSubset(state.attended, persistentIds, true);
  return {
    ...structuredClone(state),
    actors,
    attended,
    active_attend: undefined,
    grid: undefined,
  };
};

/** Close one tactical lifetime and open the next without mutating authored data. */
export const beginNewExpedition = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: BeginNewExpeditionOptions,
): BeginNewExpeditionResult => {
  const normalized = normalizeWorldStateLayers(gamePackage, save);
  const projection = projectWorldStateLayers(gamePackage, normalized);
  const policy = projection.policy;
  const current = projection.metadata.expedition;
  const clock = normalized.clock_minutes ?? current.started_at_clock_minutes;
  const closedExpedition: ExpeditionLifecycleRecord = {
    ...structuredClone(current),
    status: "closed",
    ended_at_clock_minutes: clock,
    end_reason: options.reason,
  };
  const nextIndex = Math.max(1, current.index + 1);
  const expedition: ExpeditionLifecycleRecord = {
    id: `expedition:${nextIndex}`,
    index: nextIndex,
    intercessor_id: options.intercessorId,
    status: "active",
    started_at_clock_minutes: clock,
    reset_policy_version: policy.version,
  };

  const targetMapId = options.targetMapId || normalized.current_map_id;
  const targetMap = gamePackage.maps.find((map) => map.id === targetMapId);
  const fallbackSpawn = targetMap?.spawns[0];
  const targetCell = cloneCell(
    options.targetCell ||
      (targetMapId !== normalized.current_map_id && fallbackSpawn
        ? fallbackSpawn.cell
        : normalized.player.cell),
  );
  const targetFacing = cloneCell(
    options.targetFacing ||
      (targetMapId !== normalized.current_map_id && fallbackSpawn
        ? fallbackSpawn.facing
        : normalized.player.facing),
  );
  const persistentIds = persistentEntityStateIds(gamePackage, policy);
  const persistentMapState = countPersistentMapState(projection.campaign.map_deltas);

  let nextSave: PlaySave = {
    ...normalized,
    current_map_id: targetMapId,
    player: {
      ...normalized.player,
      cell: targetCell,
      facing: targetFacing,
    },
    player_stealth: {
      active: false,
      changed_at_tick: Math.max(0, Math.floor(clock)),
    },
    playerStats: {
      ...normalized.playerStats,
      hp: normalized.playerStats.max_hp,
      mp: normalized.playerStats.max_mp,
      energy: 1000,
    },
    flags: resetFlagProjection(gamePackage, projection.campaign.flags, projection.expedition.flags),
    entity_states: structuredClone(projection.campaign.entity_states),
    map_deltas: structuredClone(projection.campaign.map_deltas),
    chemistry: policy.preserveChemistry && normalized.chemistry
      ? structuredClone(normalized.chemistry)
      : undefined,
    chemistry_runs: policy.preserveChemistry && normalized.chemistry_runs
      ? structuredClone(normalized.chemistry_runs)
      : undefined,
    chemistry_active: policy.preserveChemistry && normalized.chemistry_active
      ? structuredClone(normalized.chemistry_active)
      : undefined,
    bark_cooldowns: {},
    actor_statuses: {},
    actor_physical_states: {},
    actor_emotional_states: recordSubset(normalized.actor_emotional_states, persistentIds, true),
    alderamontico_state: filterAlderamonticoState(normalized.alderamontico_state, persistentIds),
    simulation_regions: {},
    immersive_scheduler: undefined,
    immersive_tile_layers: {},
    in_combat: false,
    combat_queue: [],
    active_turn_id: "player",
    combat_xp_pool: 0,
    world_state_layers: {
      ...structuredClone(projection.metadata),
      schema_version: WORLD_STATE_LAYERS_VERSION,
      authored: {
        package_version: gamePackage.metadata.version,
        map_ids: gamePackage.maps.map((map) => map.id),
      },
      campaign: {
        ...projection.metadata.campaign,
        persistence_policy_version: policy.version,
      },
      expedition,
    },
  };
  nextSave = beginNewDialogueExpedition(gamePackage, nextSave, expedition.id);
  if (nextSave.dialogue_memory) {
    nextSave = {
      ...nextSave,
      dialogue_memory: {
        ...nextSave.dialogue_memory,
        current_intercessor_id: options.intercessorId,
      },
    };
  }

  const report: WorldStateResetReport = {
    policy_version: policy.version,
    closed_expedition_id: closedExpedition.id,
    expedition_id: expedition.id,
    reason: options.reason,
    preserved: {
      explored_cell_count: countExploredCells(normalized),
      read_document_count: normalized.read_documents?.length || 0,
      world_fact_count: normalized.world_facts?.length || 0,
      switch_ids: Object.keys(projection.campaign.flags).sort(),
      entity_state_ids: Object.keys(projection.campaign.entity_states).sort(),
      door_state_count: persistentMapState.doors,
      object_state_count: persistentMapState.objects,
      item_state_count: persistentMapState.items,
      container_state_count: persistentMapState.containers,
      chemistry: policy.preserveChemistry,
    },
    reset: {
      switch_ids: Object.keys(projection.expedition.flags).sort(),
      entity_state_ids: Object.keys(projection.expedition.entity_states).sort(),
      map_delta_record_count: countMapDeltaRecords(projection.expedition.map_deltas),
      combat: Boolean(normalized.in_combat || normalized.combat_queue?.length || normalized.combat_xp_pool),
      actor_status_count: Object.keys(normalized.actor_statuses || {}).length,
      actor_physical_state_count: Object.keys(normalized.actor_physical_states || {}).length,
      chemistry: !policy.preserveChemistry && Boolean(
        normalized.chemistry || normalized.chemistry_runs || normalized.chemistry_active,
      ),
      simulation: Boolean(
        Object.keys(normalized.simulation_regions || {}).length ||
          normalized.immersive_scheduler ||
          Object.keys(normalized.immersive_tile_layers || {}).length,
      ),
    },
    target: {
      map_id: targetMapId,
      cell: targetCell,
      facing: targetFacing,
    },
  };
  return { save: nextSave, report, closedExpedition, expedition };
};
