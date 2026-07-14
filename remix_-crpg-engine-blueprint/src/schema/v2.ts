import { z } from "zod";
import { GamePackageSchema, type GamePackage } from "./game";
import type { PlaySave } from "./save";

export const GAME_PACKAGE_V2_SCHEMA = "crpg_engine_game_package_v2" as const;
export const PLAY_SAVE_V2_SCHEMA = "crpg_engine_save_v2" as const;

export interface PackageRuntimeV2 {
  coordinate_system: {
    horizontal_axes: ["x", "z"];
    height_axis: "y";
    cell_key_format: "x:z";
    default_plane_id: "ground";
  };
  feature_flags: {
    fog_of_war: boolean;
    turn_queue_combat: boolean;
    story_command_stream: boolean;
  };
}

export interface GamePackageV2 {
  schema: typeof GAME_PACKAGE_V2_SCHEMA;
  source_schema: GamePackage["schema"];
  package_version: string;
  runtime: PackageRuntimeV2;
  content: GamePackage;
}

export interface SaveRuntimeV2 {
  current_map_id: string;
  fine_ratio?: number;
  player: PlaySave["player"];
  progression: {
    level?: number;
    experience?: number;
    pending_level_ups?: number;
    known_skills: string[];
  };
  stats: PlaySave["playerStats"];
  economy: {
    money: number;
    inventory: PlaySave["inventory"];
  };
  story: {
    flags: PlaySave["flags"];
    quests: PlaySave["quests"];
    faction_rep: NonNullable<PlaySave["faction_rep"]>;
    read_documents: NonNullable<PlaySave["read_documents"]>;
    bark_cooldowns: NonNullable<PlaySave["bark_cooldowns"]>;
    game_end?: PlaySave["game_end"];
  };
  actors: {
    entity_states: PlaySave["entity_states"];
    party_members: string[];
    actor_statuses: NonNullable<PlaySave["actor_statuses"]>;
    actor_physical_states: NonNullable<PlaySave["actor_physical_states"]>;
    actor_emotional_states: NonNullable<PlaySave["actor_emotional_states"]>;
    alderamontico_state: NonNullable<PlaySave["alderamontico_state"]>;
  };
  exploration: {
    map_deltas: NonNullable<PlaySave["map_deltas"]>;
    explored_cells: NonNullable<PlaySave["explored_cells"]>;
  };
  kernel: {
    world_facts: NonNullable<PlaySave["world_facts"]>;
  };
  simulation: {
    chemistry?: PlaySave["chemistry"];
    chemistry_runs?: PlaySave["chemistry_runs"];
    chemistry_active?: PlaySave["chemistry_active"];
    economy?: PlaySave["simulation_economy"];
    regions: NonNullable<PlaySave["simulation_regions"]>;
    scheduler?: PlaySave["immersive_scheduler"];
    tile_layers: NonNullable<PlaySave["immersive_tile_layers"]>;
  };
  clock_minutes: number;
  combat: {
    in_combat: boolean;
    combat_queue: string[];
    active_turn_id: string | null;
    combat_xp_pool: number;
  };
}

export interface PlaySaveV2 {
  schema: typeof PLAY_SAVE_V2_SCHEMA;
  source_schema: PlaySave["schema"];
  package_version: string;
  runtime: SaveRuntimeV2;
  content: PlaySave;
}

export const PackageRuntimeV2Schema = z.object({
  coordinate_system: z.object({
    horizontal_axes: z.tuple([z.literal("x"), z.literal("z")]),
    height_axis: z.literal("y"),
    cell_key_format: z.literal("x:z"),
    default_plane_id: z.literal("ground"),
  }),
  feature_flags: z.object({
    fog_of_war: z.boolean(),
    turn_queue_combat: z.boolean(),
    story_command_stream: z.boolean(),
  }),
});

export const GamePackageV2Schema = z.object({
  schema: z.literal(GAME_PACKAGE_V2_SCHEMA),
  source_schema: z.literal("crpg_engine_game_package_v1"),
  package_version: z.string(),
  runtime: PackageRuntimeV2Schema,
  content: GamePackageSchema,
});

const isPlaySaveV1 = (value: unknown): value is PlaySave =>
  !!value &&
  typeof value === "object" &&
  (value as { schema?: unknown }).schema === "crpg_engine_save_v1" &&
  typeof (value as { current_map_id?: unknown }).current_map_id === "string";

export const PlaySaveV2Schema = z.object({
  schema: z.literal(PLAY_SAVE_V2_SCHEMA),
  source_schema: z.literal("crpg_engine_save_v1"),
  package_version: z.string(),
  runtime: z.custom<SaveRuntimeV2>(
    (value) => !!value && typeof value === "object" && !Array.isArray(value),
  ),
  content: z.custom<PlaySave>(isPlaySaveV1),
});

export const isGamePackageV1 = (value: unknown): value is GamePackage =>
  !!value &&
  typeof value === "object" &&
  (value as { schema?: unknown }).schema === "crpg_engine_game_package_v1";

export const isGamePackageV2 = (value: unknown): value is GamePackageV2 =>
  !!value &&
  typeof value === "object" &&
  (value as { schema?: unknown }).schema === GAME_PACKAGE_V2_SCHEMA;

export const isPlaySaveV2 = (value: unknown): value is PlaySaveV2 =>
  !!value &&
  typeof value === "object" &&
  (value as { schema?: unknown }).schema === PLAY_SAVE_V2_SCHEMA;

const clonePackageV1 = (gamePackage: GamePackage): GamePackage =>
  GamePackageSchema.parse(gamePackage);

const cloneSaveV1 = (save: PlaySave): PlaySave => ({
  schema: "crpg_engine_save_v1",
  package_version: save.package_version,
  fine_ratio: save.fine_ratio,
  current_map_id: save.current_map_id,
  player: {
    ...save.player,
    cell: [...save.player.cell] as [number, number],
    facing: [...save.player.facing] as [number, number],
  },
  playerStats: { ...save.playerStats },
  level: save.level,
  experience: save.experience,
  pending_level_ups: save.pending_level_ups,
  known_skills: [...(save.known_skills || [])],
  flags: { ...(save.flags || {}) },
  quests: { ...(save.quests || {}) },
  inventory: (save.inventory || []).map((entry) => ({ ...entry })),
  inventory_layout: save.inventory_layout
    ? save.inventory_layout.map((entry) => ({ ...entry }))
    : undefined,
  chemistry: save.chemistry ? structuredClone(save.chemistry) : undefined,
  chemistry_runs: save.chemistry_runs ? structuredClone(save.chemistry_runs) : undefined,
  chemistry_active: save.chemistry_active ? structuredClone(save.chemistry_active) : undefined,
  money: save.money || 0,
  entity_states: { ...(save.entity_states || {}) },
  party_members: [...(save.party_members || [])],
  map_deltas: save.map_deltas ? structuredClone(save.map_deltas) : undefined,
  clock_minutes: save.clock_minutes,
  faction_rep: save.faction_rep ? { ...save.faction_rep } : undefined,
  read_documents: save.read_documents ? [...save.read_documents] : undefined,
  explored_cells: save.explored_cells ? structuredClone(save.explored_cells) : undefined,
  bark_cooldowns: save.bark_cooldowns ? { ...save.bark_cooldowns } : undefined,
  game_end: save.game_end ? { ...save.game_end } : undefined,
  actor_statuses: save.actor_statuses ? structuredClone(save.actor_statuses) : undefined,
  actor_physical_states: save.actor_physical_states ? structuredClone(save.actor_physical_states) : undefined,
  actor_emotional_states: save.actor_emotional_states
    ? structuredClone(save.actor_emotional_states)
    : save.alderamontico_state?.actors
      ? structuredClone(save.alderamontico_state.actors)
      : undefined,
  alderamontico_state: save.alderamontico_state ? structuredClone(save.alderamontico_state) : undefined,
  world_facts: save.world_facts ? structuredClone(save.world_facts) : undefined,
  simulation_economy: save.simulation_economy ? structuredClone(save.simulation_economy) : undefined,
  simulation_regions: save.simulation_regions ? structuredClone(save.simulation_regions) : undefined,
  immersive_scheduler: save.immersive_scheduler ? structuredClone(save.immersive_scheduler) : undefined,
  immersive_tile_layers: save.immersive_tile_layers ? structuredClone(save.immersive_tile_layers) : undefined,
  in_combat: save.in_combat,
  combat_queue: save.combat_queue ? [...save.combat_queue] : undefined,
  active_turn_id: save.active_turn_id,
  combat_xp_pool: save.combat_xp_pool,
});

export const defaultPackageRuntimeV2 = (gamePackage: GamePackage): PackageRuntimeV2 => ({
  coordinate_system: {
    horizontal_axes: ["x", "z"],
    height_axis: "y",
    cell_key_format: "x:z",
    default_plane_id: "ground",
  },
  feature_flags: {
    fog_of_war: Boolean(gamePackage.settings?.fog_of_war ?? true),
    turn_queue_combat: true,
    story_command_stream: true,
  },
});

export const buildSaveRuntimeV2 = (save: PlaySave): SaveRuntimeV2 => ({
  current_map_id: save.current_map_id,
  fine_ratio: save.fine_ratio,
  player: {
    ...save.player,
    cell: [...save.player.cell] as [number, number],
    facing: [...save.player.facing] as [number, number],
  },
  progression: {
    level: save.level,
    experience: save.experience,
    pending_level_ups: save.pending_level_ups,
    known_skills: [...(save.known_skills || [])],
  },
  stats: { ...save.playerStats },
  economy: {
    money: save.money || 0,
    inventory: (save.inventory || []).map((entry) => ({ ...entry })),
  },
  story: {
    flags: { ...(save.flags || {}) },
    quests: { ...(save.quests || {}) },
    faction_rep: { ...(save.faction_rep || {}) },
    read_documents: [...(save.read_documents || [])],
    bark_cooldowns: { ...(save.bark_cooldowns || {}) },
    game_end: save.game_end ? { ...save.game_end } : undefined,
  },
  actors: {
    entity_states: { ...(save.entity_states || {}) },
    party_members: [...(save.party_members || [])],
    actor_statuses: save.actor_statuses ? structuredClone(save.actor_statuses) : {},
    actor_physical_states: save.actor_physical_states ? structuredClone(save.actor_physical_states) : {},
    actor_emotional_states: save.actor_emotional_states
      ? structuredClone(save.actor_emotional_states)
      : save.alderamontico_state?.actors
        ? structuredClone(save.alderamontico_state.actors)
        : {},
    alderamontico_state: save.alderamontico_state
      ? structuredClone(save.alderamontico_state)
      : { actors: {}, attended: {}, attention: 20 },
  },
  exploration: {
    map_deltas: save.map_deltas ? structuredClone(save.map_deltas) : {},
    explored_cells: save.explored_cells ? structuredClone(save.explored_cells) : {},
  },
  kernel: {
    world_facts: save.world_facts ? structuredClone(save.world_facts) : [],
  },
  simulation: {
    chemistry: save.chemistry ? structuredClone(save.chemistry) : undefined,
    chemistry_runs: save.chemistry_runs ? structuredClone(save.chemistry_runs) : undefined,
    chemistry_active: save.chemistry_active ? structuredClone(save.chemistry_active) : undefined,
    economy: save.simulation_economy ? structuredClone(save.simulation_economy) : undefined,
    regions: save.simulation_regions ? structuredClone(save.simulation_regions) : {},
    scheduler: save.immersive_scheduler ? structuredClone(save.immersive_scheduler) : undefined,
    tile_layers: save.immersive_tile_layers ? structuredClone(save.immersive_tile_layers) : {},
  },
  clock_minutes: save.clock_minutes ?? 0,
  combat: {
    in_combat: Boolean(save.in_combat),
    combat_queue: [...(save.combat_queue || [])],
    active_turn_id: save.active_turn_id ?? null,
    combat_xp_pool: save.combat_xp_pool ?? 0,
  },
});

export const migrateGamePackageV1ToV2 = (gamePackage: GamePackage): GamePackageV2 => {
  const content = clonePackageV1(gamePackage);
  return {
    schema: GAME_PACKAGE_V2_SCHEMA,
    source_schema: "crpg_engine_game_package_v1",
    package_version: content.metadata.version,
    runtime: defaultPackageRuntimeV2(content),
    content,
  };
};

export const migratePlaySaveV1ToV2 = (save: PlaySave): PlaySaveV2 => {
  const content = cloneSaveV1(save);
  return {
    schema: PLAY_SAVE_V2_SCHEMA,
    source_schema: "crpg_engine_save_v1",
    package_version: content.package_version,
    runtime: buildSaveRuntimeV2(content),
    content,
  };
};

export const normalizeGamePackageToV2 = (input: unknown): GamePackageV2 => {
  if (isGamePackageV2(input)) return GamePackageV2Schema.parse(input) as GamePackageV2;
  if (isGamePackageV1(input)) return migrateGamePackageV1ToV2(GamePackageSchema.parse(input));
  throw new Error("Unsupported game package schema");
};

export const normalizePlaySaveToV2 = (input: unknown): PlaySaveV2 => {
  if (isPlaySaveV2(input)) return PlaySaveV2Schema.parse(input) as PlaySaveV2;
  if (isPlaySaveV1(input)) return migratePlaySaveV1ToV2(input);
  throw new Error("Unsupported save schema");
};

export const unwrapGamePackageV1 = (input: GamePackage | GamePackageV2): GamePackage =>
  isGamePackageV2(input) ? clonePackageV1(input.content) : clonePackageV1(input);

export const unwrapPlaySaveV1 = (input: PlaySave | PlaySaveV2): PlaySave =>
  isPlaySaveV2(input) ? cloneSaveV1(input.content) : cloneSaveV1(input);
