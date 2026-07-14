import type { CellChemRecord } from "../engine-core/chemistry";
import type {
  AlderamonticoActorStateRecord,
  AlderamonticoSaveState,
} from "../engine-core/alderamonticoState";

// Per-container runtime state. Fields left undefined fall back to the
// authored ContainerPlacement values (so a delta that only unlocks a chest
// doesn't clobber its authored inventory).
export interface ContainerSaveState {
  items?: { item_id: string; count: number }[];
  locked?: boolean;
  opened?: boolean;
}

export interface SimulationConditionRecord {
  target_kind: "cell" | "object" | "door" | "container" | "item";
  target_id: string;
  material_id?: string;
  state:
    | "intact"
    | "worn"
    | "cracked"
    | "damaged"
    | "broken"
    | "burned"
    | "wet"
    | "frozen"
    | "stained"
    | "contaminated"
    | "rotten"
    | "repaired"
    | "reinforced"
    | "unstable";
  integrity: number;
  condition_tags?: string[];
  cell?: [number, number];
  last_action?: string;
  updated_at_tick: number;
}

export interface SimulationSurfaceLayerRecord {
  id: string;
  kind: string;
  amount: number;
  age_ticks: number;
  source: "authored" | "runtime" | "trace";
  tag?: string;
  trace_actor_id?: string;
  trace_action?: string;
  residue_kind?: string;
  transfer_from_cell?: [number, number];
  transferred_from_layer_id?: string;
  cleaned_by_actor_id?: string;
  cleaned_at_tick?: number;
  cleaning_difficulty?: number;
  visibility?: number;
  scent?: number;
  slipperiness?: number;
  trace_potential?: number;
  decay_per_tick?: number;
  created_at_tick: number;
  expires_at_tick?: number;
}

export interface SimulationEnvironmentFieldRecord {
  id: string;
  kind: "fire" | "smoke" | "light" | "sound" | string;
  intensity: number;
  age_ticks: number;
  source: "authored" | "runtime" | "propagation";
  tag?: string;
  actor_id?: string;
  action?: string;
  origin_cell?: [number, number];
  radius?: number;
  color?: string;
  frequency_tag?: string;
  material_tag?: string;
  occlusion?: number;
  visibility_modifier?: number;
  damage_per_tick?: number;
  decay_per_tick?: number;
  created_at_tick: number;
  expires_at_tick?: number;
}

export interface ActorPhysicalStateRecord {
  temperature: number;
  wetness: number;
  heat: number;
  chill: number;
  charge: number;
  coating: number;
  toxicity: number;
  labels: string[];
  updated_at_tick: number;
  cell?: [number, number];
}

export interface SimulationNpcTaskRecord {
  id: string;
  actor_id: string;
  task_type: "investigate" | "cleanup" | "repair" | "restock" | "flee" | "report" | string;
  source_kind: "sound" | "fire" | "smoke" | "trace" | "authored" | string;
  target_cell: [number, number];
  origin_cell?: [number, number];
  priority: number;
  state: "queued" | "active" | "done" | "failed";
  progress_ticks?: number;
  result?: string;
  last_cell?: [number, number];
  created_at_tick: number;
  updated_at_tick?: number;
  completed_at_tick?: number;
  expires_at_tick?: number;
}

export interface SimulationProcessItemStack {
  item_id: string;
  count: number;
}

export interface SimulationProcessRecord {
  id: string;
  process_def_id?: string;
  process_type: "cooking" | "brewing" | "smithing" | "alchemy" | "repair" | "crafting" | "restock" | string;
  workstation_id?: string;
  shop_id?: string;
  stock_item_id?: string;
  actor_ids?: string[];
  cell: [number, number];
  state: "queued" | "active" | "complete" | "failed";
  progress_ticks: number;
  required_ticks: number;
  input_items?: SimulationProcessItemStack[];
  output_items?: SimulationProcessItemStack[];
  waste_items?: SimulationProcessItemStack[];
  emits?: {
    heat?: number;
    sound?: number;
    scent?: number;
    trace_kind?: string;
  };
  created_at_tick: number;
  updated_at_tick?: number;
  completed_at_tick?: number;
  result?: string;
}

export interface SimulationEconomyStockRecord {
  shop_id: string;
  item_id: string;
  produced: number;
  consumed: number;
  stock: number;
  shortage: boolean;
  shortage_threshold?: number;
  price_modifier: number;
  price_delta_when_short?: number;
  updated_at_tick: number;
}

export interface SimulationEconomyState {
  shop_stock?: Record<string, SimulationEconomyStockRecord>;
}

export interface SimulationRegionalStateRecord {
  id: string;
  map_id: string;
  region_id: string;
  resolution: "exact" | "nearby" | "aggregate" | "dormant";
  cell_count: number;
  active_processes: number;
  queued_tasks: number;
  environment_fields: number;
  fire_intensity: number;
  smoke_intensity: number;
  sound_intensity: number;
  tier_tick_rate?: number;
  advanced_ticks?: number;
  completed_processes?: number;
  completed_tasks?: number;
  reconciled_fields?: number;
  last_promoted_tick?: number;
  last_demoted_tick?: number;
  reconciled_at_tick?: number;
  updated_at_tick: number;
}

export interface ImmersiveSchedulerActorRecord {
  id: string;
  speed: number;
  energy: number;
  actor_kind?: "player" | "party" | "npc" | "simulation" | string;
  next_action_type?: string;
}

export interface ImmersiveSchedulerStateRecord {
  tick: number;
  segment: number;
  turn: number;
  actors: ImmersiveSchedulerActorRecord[];
}

export interface ImmersiveLiquidLayerRecord {
  kind: string;
  volume: number;
  temperature: number;
  slipperiness: number;
}

export interface ImmersiveGasLayerRecord {
  kind: string;
  density: number;
  visibility_modifier: number;
}

export interface ImmersiveTileLayerRecord {
  cell: [number, number];
  material_id?: string;
  terrain?: string;
  temperature: number;
  ambient_temperature: number;
  liquid?: ImmersiveLiquidLayerRecord;
  gas?: ImmersiveGasLayerRecord;
  light: number;
  sound: number;
  occlusion: number;
  blocks_movement: boolean;
  blocks_vision: boolean;
  surface_kinds: string[];
  environment_kinds: string[];
  updated_at_tick: number;
}

// What the player has changed about a map: looted ground items, items they
// dropped, and container contents. Keyed by map id in PlaySave.map_deltas.
export interface MapDelta {
  taken_items?: string[]; // authored item_placement ids that were picked up
  opened_doors?: string[]; // authored obj_p_door placement keys that were opened
  unlocked_doors?: string[]; // keyed door placement IDs whose locks were persistently released
  dropped_items?: {
    id: string;
    item_id: string;
    cell: [number, number];
    count: number;
  }[];
  containers?: Record<string, ContainerSaveState>;
  // Kernel grid manipulation (K3): custom object placements pushed/dragged to a
  // new cell, keyed by authored placement origin key. Collision, navigation, and
  // rendering read these overrides on top of the authored placements.
  moved_objects?: Record<string, { cell: [number, number]; facing: [number, number] }>;
  carried_objects?: Record<string, {
    object_id: string;
    actor_ids: string[];
    cell: [number, number];
    carry_size?: "hand" | "armful" | "oversized" | "immovable";
  }>;
  // Authored placement origin keys for objects removed from the world (broken).
  removed_objects?: string[];
  simulation_conditions?: Record<string, SimulationConditionRecord>;
  surface_layers?: Record<string, SimulationSurfaceLayerRecord[]>;
  environment_fields?: Record<string, SimulationEnvironmentFieldRecord[]>;
  npc_tasks?: SimulationNpcTaskRecord[];
  simulation_processes?: SimulationProcessRecord[];
}

export interface CellChemRunRecord {
  z: number;
  x0: number;
  x1: number;
  record: CellChemRecord;
}

export interface PlaySaveWorldFact {
  id: string;
  tick: number;
  map_id?: string;
  plane_id?: string;
  cells?: [number, number][];
  actor_id?: string;
  target_id?: string;
  action_type: string;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  direct_consequences?: Record<string, unknown>;
  exposures?: {
    type: string;
    actor_id?: string;
    reason?: string;
  }[];
  permission_state?: string;
  resulting_object_instance_ids?: string[];
  source_event_id?: number;
  parent_fact_ids?: string[];
}

// Player-authored placement of one inventory stack inside the spatial grid
// inventory. `x`/`y` is the anchor (top-left) cell; `rotation` is the number of
// 90° clockwise rotations (0..3) applied to the item's footprint.
export interface InventoryLayoutEntry {
  item_id: string;
  x: number;
  y: number;
  rotation: number;
}

export interface PlaySave {
  schema: "crpg_engine_save_v1";
  package_version: string;
  // Grid-subdivision ratio the save's coordinates were written at
  // (FINE_PER_MACRO at save time). A save whose ratio differs from the
  // running engine's is rebuilt rather than resumed — its cell coordinates
  // live on a different grid. Absent on legacy saves (treated as 1).
  fine_ratio?: number;
  current_map_id: string;
  player: {
    cell: [number, number];
    facing: [number, number];
    sprite_id?: string;
  };
  playerStats: {
    hp: number;
    max_hp: number;
    mp: number;
    max_mp: number;
    attack: number;
    defense: number;
    speed: number;
    energy: number;
  };
  level?: number;
  experience?: number;
  pending_level_ups?: number;
  known_skills: string[];
  flags: Record<string, any>;
  quests: Record<string, any>;
  inventory: { id: string; count: number }[];
  // Player-authored spatial layout for the grid inventory: one entry per
  // inventory stack. Stacks without an entry are auto-placed. Optional and
  // back-compatible — absent for saves/content that never opened the grid.
  inventory_layout?: InventoryLayoutEntry[];
  // Authoritative grid-chemistry state: numeric axes per cell, keyed by map id
  // then "x:z". Sparse: only cells that differ from the authored/expanded
  // baseline are stored. Burning/wet/frozen/scorched are DERIVED from these
  // axes, not stored as flags.
  chemistry?: Record<string, Record<string, CellChemRecord>>;
  // Run-length encoded chemistry deltas for large uniform regions. This is
  // semantically equivalent to `chemistry` point records and is read/written
  // opportunistically when it serializes smaller.
  chemistry_runs?: Record<string, CellChemRunRecord[]>;
  // Active chemistry frontier by map id. Cells in this set, plus their nearby
  // frontier, continue ticking; absent or empty means dormant.
  chemistry_active?: Record<string, string[]>;
  money: number;
  entity_states: Record<string, any>;
  party_members: string[];
  map_deltas?: Record<string, MapDelta>;
  // Minutes since day 0, 00:00. Advances as turns pass.
  clock_minutes?: number;
  // Faction reputation by faction id; missing entries count as 0.
  faction_rep?: Record<string, number>;
  // Document IDs the player has read (for condition checks and journal).
  read_documents?: string[];
  // Save-backed fog of war: per-map set of explored cell keys ("x:z") the
  // player has ever seen. Persisting these makes fog survive reloads. Absent
  // for saves/content that never enabled fog.
  explored_cells?: Record<string, string[]>;
  // Save-backed ambient bark cooldowns: bark id -> in-game minute last played.
  bark_cooldowns?: Record<string, number>;
  // Terminal playthrough state. Optional for in-progress saves.
  game_end?: {
    ending_id?: string;
    title?: string;
    reached_at_clock_minutes: number;
  };
  // Active status effects per actor key ("player" or an entity state key).
  // Optional; absent for content that uses no statuses.
  actor_statuses?: Record<string, { id: string; remaining: number; magnitude: number }[]>;
  // Current physical/environment exposure per actor key. This complements
  // combat statuses with readable axes such as heat, wetness, chill, and charge.
  actor_physical_states?: Record<string, ActorPhysicalStateRecord>;
  // Doc 06 compatibility projection: the actor emotional layer keyed beside
  // actor_physical_states. The canonical runtime state remains
  // alderamontico_state.actors; writers keep this projection in sync for tools,
  // exports, and future attend-node work.
  actor_emotional_states?: Record<string, AlderamonticoActorStateRecord>;
  // Alderamontico doc 05 state-system foothold: emotional axes and Attend memory
  // per actor. Physical axes are currently carried by chemistry/physical states;
  // this stores the parallel emotional layer and read-out state.
  alderamontico_state?: AlderamonticoSaveState;
  // Durable kernel facts: meaningful physical/interaction events emitted by
  // the systemic interaction kernel for later inspectors and semantic layers.
  world_facts?: PlaySaveWorldFact[];
  // Simulation economy/resource-flow state and regional aggregate snapshots.
  simulation_economy?: SimulationEconomyState;
  simulation_regions?: Record<string, SimulationRegionalStateRecord>;
  // Doc 04 Stage 2 scheduler foothold: one serializable energy clock for
  // exploration, combat, AI, statuses, and tile simulation.
  immersive_scheduler?: ImmersiveSchedulerStateRecord;
  // Doc 04 Stage 2 tile-layer foothold: per-map dynamic tile properties that
  // can be advanced and persisted independently of renderer state.
  immersive_tile_layers?: Record<string, Record<string, ImmersiveTileLayerRecord>>;
  // ── Simultaneous-pulse combat ──
  // True while hostiles are engaged. The queue holds only player and party ids
  // in speed order. Enemies resolve when an ally acts and never own
  // active_turn_id.
  in_combat?: boolean;
  combat_queue?: string[];
  active_turn_id?: string | null;
  combat_xp_pool?: number;
}
