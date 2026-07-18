import type { GamePackage } from "../schema/game";
import type {
  CampaignMaterializationRequest,
  IntercessorCampaignState,
  IntercessorDeathEvent,
  IntercessorRecord,
  PlaySave,
  SuccessionTransitionNotice,
} from "../schema/save";
import {
  createRuntimeDynamicDialogueTopic,
  initializeDialogueMemory,
} from "./keywordDialogue";
import { RNG, hashSeed } from "./rng";
import {
  beginNewExpedition,
  normalizeWorldStateLayers,
  resolveWorldStatePolicy,
} from "./worldStateLayers";

type UnknownRecord = Record<string, unknown>;

export type IntercessorNameCollisionPolicy = "allow" | "avoid";

export interface IntercessorNamePools {
  prefixes: string[];
  roots: string[];
  suffixes: string[];
  banned: string[];
  reserved: string[];
  collisionPolicy: IntercessorNameCollisionPolicy;
}

export interface GenerateIntercessorNameOptions {
  campaignSeed?: string;
  generation?: number;
  existingNames?: Iterable<string>;
}

export interface PreviewIntercessorNamesOptions {
  campaignSeed?: string;
  startGeneration?: number;
  count?: number;
  existingNames?: Iterable<string>;
}

export interface IntercessorDeathTransitionOptions {
  cause?: string;
}

export interface IntercessorDeathTransitionResult {
  save: PlaySave;
  changed: boolean;
  deceased: IntercessorRecord | null;
  successor: IntercessorRecord | null;
}

const DEFAULT_PREFIXES = [
  "Al",
  "Bre",
  "Ca",
  "Dre",
  "Eli",
  "Iva",
  "Mara",
  "Neri",
  "Or",
  "Tari",
  "Ves",
];
const DEFAULT_ROOTS = ["da", "len", "mon", "ra", "se", "ti", "vale", "ver"];
const DEFAULT_SUFFIXES = ["a", "en", "eth", "is", "o", "or", "yn"];
const DEFAULT_PLAYER_STATS: PlaySave["playerStats"] = {
  hp: 20,
  max_hp: 20,
  mp: 10,
  max_mp: 10,
  attack: 5,
  defense: 2,
  speed: 10,
  energy: 1000,
};

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;

const stringValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const stringList = (value: unknown): string[] => {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/g)
      : [];
  return Array.from(
    new Set(
      values
        .map(stringValue)
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
};

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const successionConfig = (gamePackage: GamePackage): UnknownRecord =>
  asRecord(gamePackage.settings?.intercessor_succession) || {};

const firstDefinedList = (...values: unknown[]): string[] => {
  for (const value of values) {
    const parsed = stringList(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
};

export const resolveIntercessorNamePools = (
  gamePackage: GamePackage,
): IntercessorNamePools => {
  const config = successionConfig(gamePackage);
  const nested =
    asRecord(config.name_pools) ||
    asRecord(config.name_profile) ||
    asRecord(config.names) ||
    {};
  const prefixes = firstDefinedList(
    config.name_prefixes,
    nested.prefixes,
    nested.prefix,
    config.prefixes,
    config.prefix,
  );
  const roots = firstDefinedList(
    config.name_roots,
    nested.roots,
    nested.root,
    config.roots,
    config.root,
  );
  const suffixes = firstDefinedList(
    config.name_suffixes,
    nested.suffixes,
    nested.suffix,
    config.suffixes,
    config.suffix,
  );
  const policy =
    stringValue(config.duplicate_name_policy) ||
    stringValue(config.collision_policy) ||
    stringValue(nested.collision_policy) ||
    stringValue(nested.duplicate_name_policy);
  return {
    prefixes: prefixes.length > 0 ? prefixes : DEFAULT_PREFIXES,
    roots: roots.length > 0 ? roots : DEFAULT_ROOTS,
    suffixes: suffixes.length > 0 ? suffixes : DEFAULT_SUFFIXES,
    banned: firstDefinedList(
      config.banned_names,
      nested.banned,
      nested.banned_strings,
      config.banned,
      config.banned_strings,
    ),
    reserved: firstDefinedList(
      config.reserved_names,
      nested.reserved,
      nested.reserved_names,
      config.reserved,
    ),
    collisionPolicy: policy === "allow" ? "allow" : "avoid",
  };
};

const normalizedNameKey = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const titleCaseName = (value: string) => {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return compact;
  return compact
    .split(/([\s-]+)/g)
    .map((part) =>
      /^[\s-]+$/.test(part)
        ? part
        : `${part.charAt(0).toLocaleUpperCase()}${part.slice(1).toLocaleLowerCase()}`,
    )
    .join("");
};

const isBannedName = (candidate: string, pools: IntercessorNamePools) => {
  const key = normalizedNameKey(candidate);
  if (pools.banned.some((entry) => key.includes(normalizedNameKey(entry)))) return true;
  return pools.reserved.some((entry) => key === normalizedNameKey(entry));
};

const candidateForAttempt = (
  pools: IntercessorNamePools,
  campaignSeed: string,
  generation: number,
  attempt: number,
) => {
  const rng = new RNG(hashSeed("intercessor-name", campaignSeed, generation, attempt));
  return titleCaseName(
    `${rng.pick(pools.prefixes)}${rng.pick(pools.roots)}${rng.pick(pools.suffixes)}`,
  );
};

export const generateIntercessorName = (
  gamePackage: GamePackage,
  options: GenerateIntercessorNameOptions = {},
): string => {
  const pools = resolveIntercessorNamePools(gamePackage);
  const campaignSeed = options.campaignSeed || String(gamePackage.metadata.version || "campaign");
  const generation = Math.max(1, Math.floor(options.generation ?? 1));
  const existing = new Set(
    Array.from(options.existingNames || []).map(normalizedNameKey),
  );
  let firstSafe = "";
  const attempts = Math.max(128, pools.prefixes.length * pools.roots.length * pools.suffixes.length * 2);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = candidateForAttempt(pools, campaignSeed, generation, attempt);
    if (isBannedName(candidate, pools)) continue;
    if (!firstSafe) firstSafe = candidate;
    if (pools.collisionPolicy === "avoid" && existing.has(normalizedNameKey(candidate))) continue;
    return candidate;
  }

  // An authored pool may be fully banned or exhausted. Fall back through the
  // engine pool while continuing to honor the author's banned/reserved list.
  for (let attempt = 0; attempt < 512; attempt += 1) {
    const candidate = candidateForAttempt(
      {
        ...pools,
        prefixes: DEFAULT_PREFIXES,
        roots: DEFAULT_ROOTS,
        suffixes: DEFAULT_SUFFIXES,
      },
      campaignSeed,
      generation,
      attempts + attempt,
    );
    if (isBannedName(candidate, pools)) continue;
    if (pools.collisionPolicy === "avoid" && existing.has(normalizedNameKey(candidate))) continue;
    return candidate;
  }

  // A tiny collision-free suffix is preferable to returning a prohibited or
  // duplicate name. Record identity is still independent of display text.
  const base = firstSafe || `Intercessor ${hashSeed(campaignSeed, generation).toString(36)}`;
  for (let suffix = generation; suffix < generation + 10_000; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (isBannedName(candidate, pools)) continue;
    if (pools.collisionPolicy === "avoid" && existing.has(normalizedNameKey(candidate))) continue;
    return candidate;
  }
  return `${hashSeed("unnamed", campaignSeed, generation).toString(36)}-${generation}`;
};

export const generateIntercessorDisplayName = generateIntercessorName;

export const previewIntercessorNames = (
  gamePackage: GamePackage,
  options: PreviewIntercessorNamesOptions | number = {},
): string[] => {
  const resolved = typeof options === "number" ? { count: options } : options;
  const count = Math.max(0, Math.min(100, Math.floor(resolved.count ?? 8)));
  const startGeneration = Math.max(1, Math.floor(resolved.startGeneration ?? 1));
  const existing = new Set(resolved.existingNames || []);
  const names: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const name = generateIntercessorName(gamePackage, {
      campaignSeed: resolved.campaignSeed,
      generation: startGeneration + offset,
      existingNames: existing,
    });
    names.push(name);
    existing.add(name);
  }
  return names;
};

const successionEnabled = (gamePackage: GamePackage) =>
  successionConfig(gamePackage).enabled !== false;

const safeIdPart = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "") || "campaign";

const intercessorId = (campaignId: string, generation: number) =>
  `intercessor:${safeIdPart(campaignId)}:${generation}`;

const signatureSkillFor = (
  gamePackage: GamePackage,
  skills: string[],
  fallback?: string,
) => {
  if (skills.length === 0) return undefined;
  const configured = stringValue(successionConfig(gamePackage).signature_skill_id);
  if (fallback && skills.includes(fallback)) return fallback;
  if (configured && skills.includes(configured)) return configured;
  return skills[0];
};

const cloneRecord = (record: IntercessorRecord): IntercessorRecord => ({
  ...record,
  skills: [...(record.skills || [])],
  inventory_refs: (record.inventory_refs || []).map((entry) => ({ ...entry })),
  history: [...(record.history || [])],
  death: record.death
    ? {
        ...record.death,
        cell: [...record.death.cell] as [number, number],
        facing: [...record.death.facing] as [number, number],
      }
    : undefined,
});

const cloneRequest = (
  request: CampaignMaterializationRequest,
): CampaignMaterializationRequest => ({
  ...request,
  cell: [...request.cell] as [number, number],
  facing: [...request.facing] as [number, number],
});

const cloneDeathEvent = (event: IntercessorDeathEvent): IntercessorDeathEvent => ({
  ...event,
  cell: [...event.cell] as [number, number],
});

const canonicalCampaign = (save: PlaySave) => {
  const campaign = save.intercessor_campaign;
  if (!campaign || campaign.schema_version !== 1) return false;
  const current = campaign.records?.[campaign.current_intercessor_id];
  const records = Object.values(campaign.records || {});
  const maxGeneration = Object.values(campaign.records || {}).reduce(
    (max, record) => Math.max(max, Number(record.generation) || 0),
    0,
  );
  return Boolean(
    campaign.campaign_id &&
      campaign.campaign_seed &&
      current?.status === "active" &&
      campaign.record_order?.includes(current.id) &&
      records.every(
        (record) => (record.skills || []).length === 0 || Boolean(record.signature_skill_id),
      ) &&
      campaign.next_intercessor_index > maxGeneration &&
      campaign.death_events &&
      campaign.ghost_requests &&
      campaign.bundle_requests,
  );
};

const priorIntercessorIds = (campaign: IntercessorCampaignState) =>
  campaign.record_order.filter(
    (id) => id !== campaign.current_intercessor_id && campaign.records[id]?.status === "dead",
  );

const dialogueIdentityMatches = (save: PlaySave, campaign: IntercessorCampaignState) => {
  const memory = save.dialogue_memory;
  if (!memory || memory.current_intercessor_id !== campaign.current_intercessor_id) return false;
  const expected = priorIntercessorIds(campaign);
  return expected.length === memory.prior_intercessor_ids.length &&
    expected.every((id, index) => memory.prior_intercessor_ids[index] === id);
};

const syncDialogueIdentity = (
  gamePackage: GamePackage,
  save: PlaySave,
  campaign: IntercessorCampaignState,
): PlaySave => {
  const initialized = save.dialogue_memory
    ? save
    : initializeDialogueMemory(gamePackage, save);
  const memory = initialized.dialogue_memory!;
  const prior = priorIntercessorIds(campaign);
  if (
    memory.current_intercessor_id === campaign.current_intercessor_id &&
    prior.length === memory.prior_intercessor_ids.length &&
    prior.every((id, index) => memory.prior_intercessor_ids[index] === id)
  ) return initialized;
  return {
    ...initialized,
    dialogue_memory: {
      ...memory,
      current_intercessor_id: campaign.current_intercessor_id,
      prior_intercessor_ids: prior,
    },
  };
};

const campaignSeed = (gamePackage: GamePackage, campaignId: string) => {
  const configured = stringValue(successionConfig(gamePackage).campaign_seed);
  return configured || String(hashSeed("intercessor-campaign", gamePackage.metadata.version, campaignId));
};

export const normalizeIntercessorCampaign = (
  gamePackage: GamePackage,
  save: PlaySave,
): PlaySave => {
  const layered = normalizeWorldStateLayers(gamePackage, save);
  if (!successionEnabled(gamePackage) && !layered.intercessor_campaign) return layered;

  if (canonicalCampaign(layered)) {
    const campaign = layered.intercessor_campaign!;
    const layerMatches =
      layered.world_state_layers?.expedition.intercessor_id === campaign.current_intercessor_id;
    if (layerMatches && dialogueIdentityMatches(layered, campaign)) return layered;
    const withLayer = layerMatches
      ? layered
      : {
          ...layered,
          world_state_layers: {
            ...layered.world_state_layers!,
            expedition: {
              ...layered.world_state_layers!.expedition,
              intercessor_id: campaign.current_intercessor_id,
            },
          },
        };
    return syncDialogueIdentity(gamePackage, withLayer, campaign);
  }

  const existing = layered.intercessor_campaign as
    | (Partial<IntercessorCampaignState> & { records?: Record<string, IntercessorRecord> })
    | undefined;
  const campaignId =
    stringValue(existing?.campaign_id) ||
    layered.world_state_layers?.campaign.id ||
    `campaign:${hashSeed(gamePackage.metadata.version, "campaign")}`;
  const seed = stringValue(existing?.campaign_seed) || campaignSeed(gamePackage, campaignId);
  const records = Object.fromEntries(
    Object.entries(existing?.records || {}).map(([id, record]) => {
      const cloned = cloneRecord(record);
      return [
        id,
        {
          ...cloned,
          signature_skill_id: signatureSkillFor(
            gamePackage,
            cloned.skills,
            cloned.signature_skill_id,
          ),
        },
      ];
    }),
  );
  let recordOrder = Array.from(
    new Set((existing?.record_order || []).filter((id) => Boolean(records[id]))),
  );
  Object.values(records)
    .sort((left, right) => left.generation - right.generation || left.id.localeCompare(right.id))
    .forEach((record) => {
      if (!recordOrder.includes(record.id)) recordOrder.push(record.id);
    });

  let currentId = stringValue(existing?.current_intercessor_id);
  if (!currentId || records[currentId]?.status !== "active") {
    currentId = recordOrder.find((id) => records[id]?.status === "active");
  }
  let maxGeneration = Object.values(records).reduce(
    (max, record) => Math.max(max, Number(record.generation) || 0),
    0,
  );
  if (!currentId) {
    const generation = Math.max(1, maxGeneration + 1);
    // Legacy dialogue/layer defaults commonly use generic identities such as
    // `intercessor:1`. A newly materialized campaign record always receives an
    // identity derived from the campaign and its monotonic generation.
    currentId = intercessorId(campaignId, generation);
    const displayName = generateIntercessorName(gamePackage, {
      campaignSeed: seed,
      generation,
      existingNames: Object.values(records).map((record) => record.display_name),
    });
    const skills = [...(layered.known_skills || [])];
    records[currentId] = {
      id: currentId,
      display_name: displayName,
      generation,
      created_at_clock_minutes: layered.clock_minutes ?? 0,
      created_in_expedition_id:
        layered.world_state_layers?.expedition.id ||
        layered.dialogue_memory?.current_expedition_id ||
        "expedition:1",
      status: "active",
      skills,
      signature_skill_id: signatureSkillFor(gamePackage, skills),
      inventory_refs: (layered.inventory || []).map((entry) => ({
        item_id: entry.id,
        count: entry.count,
      })),
      sprite_id: layered.player.sprite_id,
      history: [],
    };
    recordOrder = [...recordOrder, currentId];
    maxGeneration = Math.max(maxGeneration, generation);
  }

  const nextIndex = Math.max(
    maxGeneration + 1,
    Math.floor(numberValue(existing?.next_intercessor_index) ?? maxGeneration + 1),
  );
  const campaign: IntercessorCampaignState = {
    schema_version: 1,
    campaign_id: campaignId,
    campaign_seed: seed,
    current_intercessor_id: currentId,
    next_intercessor_index: nextIndex,
    record_order: recordOrder,
    records,
    death_events: Object.fromEntries(
      Object.entries(existing?.death_events || {}).map(([id, event]) => [id, cloneDeathEvent(event)]),
    ),
    ghost_requests: Object.fromEntries(
      Object.entries(existing?.ghost_requests || {}).map(([id, request]) => [id, cloneRequest(request)]),
    ),
    bundle_requests: Object.fromEntries(
      Object.entries(existing?.bundle_requests || {}).map(([id, request]) => [id, cloneRequest(request)]),
    ),
    last_transition: existing?.last_transition
      ? { ...existing.last_transition }
      : undefined,
  };
  const withCampaign: PlaySave = {
    ...layered,
    intercessor_campaign: campaign,
    world_state_layers: {
      ...layered.world_state_layers!,
      expedition: {
        ...layered.world_state_layers!.expedition,
        intercessor_id: currentId,
      },
    },
  };
  return syncDialogueIdentity(gamePackage, withCampaign, campaign);
};

const configuredPlayerStats = (gamePackage: GamePackage): PlaySave["playerStats"] => {
  const config = successionConfig(gamePackage);
  const globalStats = asRecord(gamePackage.settings?.player_stats) || {};
  const localStats =
    asRecord(config.base_player_stats) ||
    asRecord(config.player_stats) ||
    asRecord(config.starting_player_stats) ||
    {};
  const merged = { ...DEFAULT_PLAYER_STATS, ...globalStats, ...localStats } as UnknownRecord;
  const maxHp = Math.max(1, Math.floor(numberValue(merged.max_hp) ?? DEFAULT_PLAYER_STATS.max_hp));
  const maxMp = Math.max(0, Math.floor(numberValue(merged.max_mp) ?? DEFAULT_PLAYER_STATS.max_mp));
  return {
    hp: Math.max(1, Math.min(maxHp, Math.floor(numberValue(merged.hp) ?? maxHp))),
    max_hp: maxHp,
    mp: Math.max(0, Math.min(maxMp, Math.floor(numberValue(merged.mp) ?? maxMp))),
    max_mp: maxMp,
    attack: Math.max(0, Math.floor(numberValue(merged.attack) ?? DEFAULT_PLAYER_STATS.attack)),
    defense: Math.max(0, Math.floor(numberValue(merged.defense) ?? DEFAULT_PLAYER_STATS.defense)),
    speed: Math.max(1, Math.floor(numberValue(merged.speed) ?? DEFAULT_PLAYER_STATS.speed)),
    energy: Math.max(0, Math.floor(numberValue(merged.energy) ?? DEFAULT_PLAYER_STATS.energy)),
  };
};

const configuredInventory = (gamePackage: GamePackage): PlaySave["inventory"] => {
  const config = successionConfig(gamePackage);
  const raw =
    config.starting_inventory ||
    config.base_inventory ||
    config.inventory ||
    [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const record = asRecord(entry);
    const id = stringValue(record?.id) || stringValue(record?.item_id);
    const count = Math.max(0, Math.floor(numberValue(record?.count) ?? 1));
    return id && count > 0 ? [{ id, count }] : [];
  });
};

const successorInventory = (
  gamePackage: GamePackage,
  save: PlaySave,
): PlaySave["inventory"] => {
  const merged = new Map(
    configuredInventory(gamePackage).map((entry) => [entry.id, entry.count]),
  );
  const policy = resolveWorldStatePolicy(gamePackage);
  Object.entries(policy.persistentByMap).forEach(([mapId, scoped]) => {
    const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
    const taken = new Set(save.map_deltas?.[mapId]?.taken_items || []);
    scoped.itemIds.forEach((placementId) => {
      if (!taken.has(placementId)) return;
      const placement = map?.item_placements.find((candidate) => candidate.id === placementId);
      if (!placement) return;
      const carried = save.inventory.find((entry) => entry.id === placement.item_id);
      if (!carried || carried.count <= 0) return;
      merged.set(carried.id, Math.max(merged.get(carried.id) || 0, carried.count));
    });
  });
  return [...merged.entries()].map(([id, count]) => ({ id, count }));
};

const configuredStringList = (
  gamePackage: GamePackage,
  localKeys: string[],
  globalKey: string,
) => {
  const config = successionConfig(gamePackage);
  for (const key of localKeys) {
    if (config[key] !== undefined) return stringList(config[key]);
  }
  return stringList(gamePackage.settings?.[globalKey]);
};

const successorHub = (gamePackage: GamePackage, save: PlaySave) => {
  const config = successionConfig(gamePackage);
  const requestedMapId =
    stringValue(config.hub_map_id) ||
    stringValue(config.successor_map_id) ||
    gamePackage.metadata.start_map_id;
  const map =
    gamePackage.maps.find((candidate) => candidate.id === requestedMapId) ||
    gamePackage.maps.find((candidate) => candidate.id === gamePackage.metadata.start_map_id) ||
    gamePackage.maps[0];
  if (!map) {
    return {
      mapId: save.current_map_id,
      cell: [...save.player.cell] as [number, number],
      facing: [...save.player.facing] as [number, number],
    };
  }
  const requestedSpawnId =
    stringValue(config.hub_spawn_id) ||
    stringValue(config.successor_spawn_id) ||
    (map.id === gamePackage.metadata.start_map_id
      ? gamePackage.metadata.start_spawn_id
      : undefined);
  const spawn =
    map.spawns.find((candidate) => candidate.id === requestedSpawnId) ||
    map.spawns[0];
  return {
    mapId: map.id,
    cell: spawn
      ? ([...spawn.cell] as [number, number])
      : ([...save.player.cell] as [number, number]),
    facing: spawn
      ? ([...spawn.facing] as [number, number])
      : ([...save.player.facing] as [number, number]),
  };
};

const configuredHistoryKeyword = (gamePackage: GamePackage) => {
  const config = successionConfig(gamePackage);
  const id =
    stringValue(config.history_keyword_id) ||
    stringValue(config.prior_intercessor_keyword_id) ||
    stringValue(config.intercessor_keyword_id);
  if (!id) return undefined;
  const keyword = (gamePackage.keywords || []).find((candidate) => candidate.id === id);
  return keyword?.dynamic_capable ? keyword : undefined;
};

const addPriorIntercessorDialogueTopic = (
  gamePackage: GamePackage,
  save: PlaySave,
  deceased: IntercessorRecord,
  deathEventId: string,
): PlaySave => {
  const keyword = configuredHistoryKeyword(gamePackage);
  if (!keyword) return save;
  return createRuntimeDynamicDialogueTopic(gamePackage, save, {
    id: `past:${deceased.id}`,
    keyword_id: keyword.id,
    record_id: deceased.id,
    display_name: deceased.display_name,
    category: "intercessors",
    scope: "campaign",
    source_of_discovery: `succession:${deathEventId}`,
    known: true,
    response_associations: {},
  });
};

export const transitionIntercessorOnDeath = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: IntercessorDeathTransitionOptions = {},
): IntercessorDeathTransitionResult => {
  const normalized = normalizeIntercessorCampaign(gamePackage, save);
  const campaign = normalized.intercessor_campaign;
  const active = campaign?.records[campaign.current_intercessor_id] || null;
  if (
    !successionEnabled(gamePackage) ||
    !campaign ||
    !active ||
    active.status !== "active" ||
    (normalized.playerStats.hp ?? 0) > 0
  ) {
    return { save: normalized, changed: false, deceased: null, successor: active };
  }

  const deathEventId = `death:${active.id}`;
  if (campaign.death_events[deathEventId]) {
    return { save: normalized, changed: false, deceased: active, successor: null };
  }

  let successorGeneration = Math.max(1, campaign.next_intercessor_index);
  let successorId = intercessorId(campaign.campaign_id, successorGeneration);
  while (campaign.records[successorId]) {
    successorGeneration += 1;
    successorId = intercessorId(campaign.campaign_id, successorGeneration);
  }
  const successorName = generateIntercessorName(gamePackage, {
    campaignSeed: campaign.campaign_seed,
    generation: successorGeneration,
    existingNames: Object.values(campaign.records).map((record) => record.display_name),
  });
  const clockMinutes = normalized.clock_minutes ?? 0;
  const expedition = normalized.world_state_layers!.expedition;
  const ghostRequestId = `ghost-request:${active.id}`;
  const bundleRequestId = `bundle-request:${active.id}`;
  const cause = stringValue(options.cause);
  const death = {
    map_id: normalized.current_map_id,
    cell: [...normalized.player.cell] as [number, number],
    facing: [...normalized.player.facing] as [number, number],
    clock_minutes: clockMinutes,
    expedition_id: expedition.id,
    expedition_index: expedition.index,
    ...(cause ? { cause } : {}),
  };
  const historyLine = cause
    ? `Died in ${death.map_id}: ${cause}.`
    : `Died in ${death.map_id}.`;
  const deceased: IntercessorRecord = {
    ...cloneRecord(active),
    status: "dead",
    skills: [...(normalized.known_skills || [])],
    signature_skill_id: signatureSkillFor(
      gamePackage,
      [...(normalized.known_skills || [])],
      active.signature_skill_id,
    ),
    inventory_refs: (normalized.inventory || []).map((entry) => ({
      item_id: entry.id,
      count: entry.count,
    })),
    death,
    ghost_request_id: ghostRequestId,
    bundle_request_id: bundleRequestId,
    history: [...(active.history || []), historyLine],
  };
  const requestBase = {
    source_intercessor_id: deceased.id,
    expedition_id: expedition.id,
    map_id: death.map_id,
    cell: [...death.cell] as [number, number],
    facing: [...death.facing] as [number, number],
    created_at_clock_minutes: clockMinutes,
    status: "pending" as const,
  };
  const ghostRequest: CampaignMaterializationRequest = {
    ...requestBase,
    id: ghostRequestId,
    kind: "ghost",
  };
  const bundleRequest: CampaignMaterializationRequest = {
    ...requestBase,
    id: bundleRequestId,
    kind: "death_bundle",
  };
  const provisionalCampaign: IntercessorCampaignState = {
    ...campaign,
    current_intercessor_id: successorId,
    next_intercessor_index: successorGeneration + 1,
    record_order: [...campaign.record_order, successorId],
    records: {
      ...campaign.records,
      [deceased.id]: deceased,
    },
    ghost_requests: {
      ...campaign.ghost_requests,
      [ghostRequestId]: ghostRequest,
    },
    bundle_requests: {
      ...campaign.bundle_requests,
      [bundleRequestId]: bundleRequest,
    },
  };
  const hub = successorHub(gamePackage, normalized);
  const reset = beginNewExpedition(
    gamePackage,
    { ...normalized, intercessor_campaign: provisionalCampaign },
    {
      reason: "death",
      intercessorId: successorId,
      targetMapId: hub.mapId,
      targetCell: hub.cell,
      targetFacing: hub.facing,
    },
  );
  const successorSkills = configuredStringList(
    gamePackage,
    ["base_known_skills", "starting_known_skills", "initial_known_skills"],
    "initial_known_skills",
  );
  const inheritedInventory = successorInventory(gamePackage, normalized);
  const successor: IntercessorRecord = {
    id: successorId,
    display_name: successorName,
    generation: successorGeneration,
    created_at_clock_minutes: clockMinutes,
    created_in_expedition_id: reset.expedition.id,
    status: "active",
    skills: successorSkills,
    signature_skill_id: signatureSkillFor(gamePackage, successorSkills),
    inventory_refs: inheritedInventory.map((entry) => ({
      item_id: entry.id,
      count: entry.count,
    })),
    sprite_id:
      stringValue(successionConfig(gamePackage).player_sprite_id) ||
      stringValue(gamePackage.settings?.player_sprite_id) ||
      normalized.player.sprite_id,
    history: [],
  };
  const deathEvent: IntercessorDeathEvent = {
    id: deathEventId,
    intercessor_id: deceased.id,
    successor_id: successor.id,
    expedition_id: expedition.id,
    map_id: death.map_id,
    cell: [...death.cell] as [number, number],
    clock_minutes: clockMinutes,
  };
  const notice: SuccessionTransitionNotice = {
    id: `succession:${deceased.id}:${successor.id}`,
    deceased_intercessor_id: deceased.id,
    successor_intercessor_id: successor.id,
    created_at_clock_minutes: clockMinutes,
    acknowledged: false,
  };
  const finalCampaign: IntercessorCampaignState = {
    ...provisionalCampaign,
    records: {
      ...provisionalCampaign.records,
      [successor.id]: successor,
    },
    death_events: {
      ...campaign.death_events,
      [deathEvent.id]: deathEvent,
    },
    last_transition: notice,
  };
  const baseInventory = inheritedInventory;
  const knownSkills = [...successor.skills];
  const config = successionConfig(gamePackage);
  const nextLevel = Math.max(1, Math.floor(numberValue(config.base_level) ?? 1));
  let next: PlaySave = {
    ...reset.save,
    current_map_id: hub.mapId,
    player: {
      cell: [...hub.cell] as [number, number],
      facing: [...hub.facing] as [number, number],
      sprite_id: successor.sprite_id,
    },
    playerStats: configuredPlayerStats(gamePackage),
    level: nextLevel,
    experience: Math.max(0, Math.floor(numberValue(config.base_experience) ?? 0)),
    pending_level_ups: 0,
    known_skills: knownSkills,
    inventory: baseInventory,
    inventory_layout: undefined,
    party_members: configuredStringList(
      gamePackage,
      ["base_party_members", "starting_party_members"],
      "starting_party_members",
    ),
    in_combat: false,
    combat_queue: [],
    active_turn_id: "player",
    combat_xp_pool: 0,
    game_end: undefined,
    intercessor_campaign: finalCampaign,
    world_state_layers: {
      ...reset.save.world_state_layers!,
      expedition: {
        ...reset.expedition,
        intercessor_id: successor.id,
      },
    },
  };
  next = syncDialogueIdentity(gamePackage, next, finalCampaign);
  next = addPriorIntercessorDialogueTopic(
    gamePackage,
    next,
    deceased,
    deathEvent.id,
  );
  next = syncDialogueIdentity(gamePackage, next, finalCampaign);
  return { save: next, changed: true, deceased, successor };
};

export const acknowledgeSuccessionTransition = (save: PlaySave): PlaySave => {
  const campaign = save.intercessor_campaign;
  if (!campaign?.last_transition || campaign.last_transition.acknowledged) return save;
  return {
    ...save,
    intercessor_campaign: {
      ...campaign,
      last_transition: {
        ...campaign.last_transition,
        acknowledged: true,
      },
    },
  };
};

export const getIntercessorHistory = (save: PlaySave): IntercessorRecord[] => {
  const campaign = save.intercessor_campaign;
  if (!campaign) return [];
  const ordered = campaign.record_order
    .map((id) => campaign.records[id])
    .filter((record): record is IntercessorRecord => Boolean(record));
  const seen = new Set(ordered.map((record) => record.id));
  const remainder = Object.values(campaign.records)
    .filter((record) => !seen.has(record.id))
    .sort((left, right) => left.generation - right.generation || left.id.localeCompare(right.id));
  return [...ordered, ...remainder];
};

export const queryIntercessorHistory = getIntercessorHistory;
