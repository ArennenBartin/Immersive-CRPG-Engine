import { z } from "zod";
import { objectLibraryPresets, spriteLibraryPresets } from "./presets";
import { createOverworldMap } from "../utils/overworldMap";
import { createThreefoldMarchMaps } from "../utils/threefoldMarchMap";
import { ABILITY_KIND_IDS, ABILITY_PAGE_ORDER, DEFAULT_BUILTIN_ABILITIES, DEFAULT_UNLOCKED_ABILITY_IDS, RUNTIME_ACTION_IDS } from "../data/defaultAbilities";
import {
  DungeonEncounterProfileSchema,
  DungeonHazardProfileSchema,
  DungeonNarrativeProfileSchema,
  DungeonRecipeSchema,
  DungeonRewardProfileSchema,
  DungeonRoomArchetypeSchema,
  DungeonRoomTemplateSchema,
  DungeonThemeProfileSchema,
} from "../dungeonGen/schema";

export const GameMetadataSchema = z.object({
  title: z.string(),
  version: z.string(),
  start_map_id: z.string(),
  start_spawn_id: z.string(),
});

// ── Condition query layer ───────────────────────────────────────────────────
// One declarative condition shape evaluated everywhere game logic gates on
// world state: dialogue options, triggers, cutscene branches, shop stock and
// prices. Predicates within a single node are ANDed; `all` / `any` / `not`
// compose nodes. Evaluation lives in src/engine-core/story.ts.
export interface ConditionData {
  // Switch flag matches (switch_value defaults to true).
  switch?: string;
  switch_value?: boolean;
  // Quest is in a specific state.
  quest?: string;
  quest_state?: string;
  // Inventory holds at least item_count (default 1) of the item.
  has_item?: string;
  item_count?: number;
  // Entity id is in the party.
  party_contains?: string;
  // Faction reputation bounds (missing rep counts as 0).
  faction?: string;
  rep_gte?: number;
  rep_lte?: number;
  // Clock phase id(s): late_night | night | dawn | day | dusk.
  // "night" also matches the late-night phase.
  time_of_day?: string | string[];
  // Hour-of-day range [hour_gte, hour_lt), wrapping past midnight when
  // hour_gte > hour_lt (e.g. 22 → 5).
  hour_gte?: number;
  hour_lt?: number;
  // Combinators.
  not?: ConditionData;
  all?: ConditionData[];
  any?: ConditionData[];
}

export const ConditionSchema: z.ZodType<ConditionData> = z.lazy(() =>
  z.object({
    switch: z.string().optional(),
    switch_value: z.boolean().optional(),
    quest: z.string().optional(),
    quest_state: z.string().optional(),
    has_item: z.string().optional(),
    item_count: z.number().optional(),
    party_contains: z.string().optional(),
    faction: z.string().optional(),
    rep_gte: z.number().optional(),
    rep_lte: z.number().optional(),
    time_of_day: z.union([z.string(), z.array(z.string())]).optional(),
    hour_gte: z.number().optional(),
    hour_lt: z.number().optional(),
    not: ConditionSchema.optional(),
    all: z.array(ConditionSchema).optional(),
    any: z.array(ConditionSchema).optional(),
  }),
);

export const SimulationConditionSchema = z.enum([
  "intact",
  "worn",
  "cracked",
  "damaged",
  "broken",
  "burned",
  "wet",
  "frozen",
  "stained",
  "contaminated",
  "rotten",
  "repaired",
  "reinforced",
  "unstable",
]);

export const SimulationMaterialProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  density: z.number().default(1),
  hardness: z.number().default(1),
  flammability: z.number().default(0),
  ignition_temperature: z.number().default(600),
  burn_behavior: z.string().default("chars"),
  absorbency: z.number().default(0),
  permeability: z.number().default(0),
  conductivity: z.number().default(0),
  fragility: z.number().default(0),
  wetness_capacity: z.number().default(0),
  scent_retention: z.number().default(0),
  cleaning_difficulty: z.number().default(1),
  decay_behavior: z.string().default("stable"),
  sound_response: z.string().default("dull"),
  light_response: z.string().default("matte"),
  tags: z.array(z.string()).default([]),
});

export const SimulationTraceProfileSchema = z.object({
  residue_kind: z.string().default("dust"),
  trace_potential: z.number().default(0.35),
  visibility: z.number().default(0.45),
  scent: z.number().default(0),
  slipperiness: z.number().default(0),
  cleaning_difficulty: z.number().default(1),
  decay_ticks: z.number().default(120),
  decay_per_tick: z.number().default(0.003),
  transfer_kinds: z.array(z.string()).default(["footprint"]),
});

export const SimulationAuthoredProfileSchema = z.object({
  material_id: z.string().optional(),
  condition: SimulationConditionSchema.default("intact"),
  integrity: z.number().default(1),
  condition_tags: z.array(z.string()).default([]),
  mass_kg: z.number().default(1),
  bulk: z.number().default(1),
  awkwardness: z.number().default(0),
  push_difficulty: z.number().default(1),
  carry_size: z.enum(["hand", "armful", "oversized", "immovable"]).default("hand"),
  requires_cooperation: z.boolean().default(false),
  trace_profile: SimulationTraceProfileSchema.optional(),
});

export const SimulationProcessItemStackSchema = z.object({
  item_id: z.string(),
  count: z.number().default(1),
});

export const SimulationProcessDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  process_type: z.string(),
  workstation_id: z.string().optional(),
  required_ticks: z.number().default(1),
  input_items: z.array(SimulationProcessItemStackSchema).default([]),
  output_items: z.array(SimulationProcessItemStackSchema).default([]),
  waste_items: z.array(SimulationProcessItemStackSchema).default([]),
  emits: z.object({
    heat: z.number().optional(),
    sound: z.number().optional(),
    scent: z.number().optional(),
    trace_kind: z.string().optional(),
  }).optional(),
  economy: z.object({
    shop_id: z.string().optional(),
    stock_item_id: z.string().optional(),
    stock_delta: z.number().default(0),
    shortage_threshold: z.number().default(1),
    price_delta_when_short: z.number().default(0),
  }).optional(),
  failure: z.object({
    interrupted_by_fire: z.boolean().default(true),
    interrupted_by_actor_missing: z.boolean().default(true),
  }).default({ interrupted_by_fire: true, interrupted_by_actor_missing: true }),
});

export const SimulationWorkstationSchema = z.object({
  id: z.string(),
  label: z.string(),
  map_id: z.string(),
  cell: z.tuple([z.number(), z.number()]),
  process_ids: z.array(z.string()).default([]),
  occupies_actor: z.boolean().default(true),
});

export const InventoryShapeCellSchema = z.tuple([z.number(), z.number()]);

export const ItemSpatialProfileSchema = z.object({
  shape: z.array(InventoryShapeCellSchema).optional(),
  weight_kg: z.number().optional(),
  bulk: z.number().optional(),
  stack_limit: z.number().optional(),
});

export const WorldRegionPassiveCheckSchema = z.object({
  id: z.string(),
  stat: z.enum(["level", "hp_percent", "money", "inventory_weight", "faction_rep", "flag"]),
  difficulty: z.number(),
  modifier: z.number().optional(),
  faction_id: z.string().optional(),
  flag_id: z.string().optional(),
  denial: z.boolean().default(false),
});

export const AlderamonticoGridRegionSchema = z.object({
  enabled: z.boolean().default(true),
  magnitude: z.number().default(2),
  lens_entity_id: z.string().optional(),
  lens_radius: z.number().optional(),
  lens_multiplier: z.number().optional(),
});

// A partial set of Alderamontico emotional-axis values. Reused for two roles:
// authored entity *starting axes* (absolute 0-100 values) and skill/verb
// *impulses* (signed deltas that push a target's axes). Every axis is optional
// so authors only specify the ones a given entity or verb touches.
export const AlderamonticoEmotionalVectorSchema = z.object({
  valence: z.number().optional(),
  arousal: z.number().optional(),
  grief: z.number().optional(),
  reverence: z.number().optional(),
  attachment: z.number().optional(),
});

export const AlderamonticoAttendReadingEffectSchema = z.object({
  set_switch: z.string().optional(),
  set_switch_value: z.boolean().optional(),
  set_switches: z
    .array(
      z.object({
        switch_id: z.string(),
        switch_value: z.boolean().optional(),
      }),
    )
    .optional(),
  attention_delta: z.number().optional(),
  emotional_impulse: AlderamonticoEmotionalVectorSchema.optional(),
  target_emotional_impulse: AlderamonticoEmotionalVectorSchema.optional(),
  status_effect: z.string().optional(),
  status_duration: z.number().optional(),
  status_magnitude: z.number().optional(),
});

export const AlderamonticoAttendReadingSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  truth: z.enum(["false", "true", "partial"]),
  requiresAttention: z.number().default(0),
  effect: AlderamonticoAttendReadingEffectSchema.optional(),
});

export const AlderamonticoAttendNodeSchema = z.object({
  id: z.string().optional(),
  target: z.string(),
  readings: z.array(AlderamonticoAttendReadingSchema).default([]),
  composure: z.number().default(3),
  glassPressure: AlderamonticoEmotionalVectorSchema.optional(),
  onTimeout: z
    .object({
      reading_id: z.string().optional(),
      status_effect: z.string().optional(),
      status_duration: z.number().optional(),
      status_magnitude: z.number().optional(),
      attention_delta: z.number().optional(),
    })
    .optional(),
});

export const AlderamonticoRegionEmotionalProfileSchema = z.object({
  // Signed offsets from an actor/entity baseline when a region first seeds an
  // actor's emotional record. This makes authored zones biased without creating
  // a global emotional field.
  baseline_axis_offsets: AlderamonticoEmotionalVectorSchema.optional(),
});

export const WorldRegionSchema = z.object({
  id: z.string(),
  display_name: z.string().optional(),
  faction_id: z.string().optional(),
  reputation_threshold: z.number().optional(),
  neutral: z.boolean().default(false),
  irreversible_denial_flag: z.string().optional(),
  survival_delta: z.object({
    hunger: z.number().optional(),
    thirst: z.number().optional(),
    fatigue: z.number().optional(),
    exposure: z.number().optional(),
  }).optional(),
  passive_checks: z.array(WorldRegionPassiveCheckSchema).default([]),
  alderamontico_grid: AlderamonticoGridRegionSchema.optional(),
  emotional_profile: AlderamonticoRegionEmotionalProfileSchema.optional(),
});

// Ordinary authored initial chemistry. This is consumed by the same runtime
// grid seeding path for hand-authored and generated maps; it is not a
// generator-only payload. Units match ChemAxes in engine-core/chemistry.ts.
export const InitialChemistrySchema = z.object({
  material_id: z.string().min(1).optional(),
  liquid_id: z.string().min(1).optional(),
  temperature: z.number().finite().min(-100).max(125).optional(),
  saturation: z.number().finite().min(0).max(100).optional(),
  charge: z.number().finite().min(0).max(100).optional(),
  integrity: z.number().finite().min(0).max(100).optional(),
  foam: z.number().finite().min(0).max(100).optional(),
  fuel: z.number().finite().min(0).max(100).optional(),
  stability: z.number().finite().min(0).max(100).optional(),
  scorch: z.number().finite().min(0).max(100).optional(),
  frozen: z.boolean().optional(),
  liquid_volume: z.number().finite().min(0).max(400).optional(),
  vapor: z.number().finite().min(0).max(100).optional(),
});

export const CellSchema = z.object({
  x: z.number(),
  y: z.number().default(0),
  z: z.number(),
  active: z.boolean(),
  walkable: z.boolean(),
  blocks_los: z.boolean(),
  height: z.number(),
  visual_height: z.number(),
  terrain: z.string().optional(),
  object_id: z.string().optional(),
  region_id: z.string().optional(),
  room_id: z.string().optional(),
  tag: z.string().optional(),
  hazard: z.string().optional(),
  infection: z.string().optional(),
  portal_id: z.string().optional(),
  surface_tag: z
    .enum(["none", "water", "oil", "blood", "poison", "firehazard", "ice"])
    .default("none"),
  initial_chemistry: InitialChemistrySchema.optional(),
  simulation: SimulationAuthoredProfileSchema.optional(),
});

export const ObjectPlacementSchema = z.object({
  // Generated placements receive deterministic IDs. This remains optional so
  // older hand-authored packages (whose runtime identity is coordinate-based)
  // continue to import unchanged.
  id: z.string().min(1).optional(),
  object_id: z.string(),
  cell: z.tuple([z.number(), z.number()]),
  facing: z.tuple([z.number(), z.number()]),
  collision_mode: z.enum(["inherit", "none"]).optional(),
  dialogue_id: z.string().optional(),
  blueprint_id: z.string().optional(),
  // Lock/key authoring is optional for legacy placements. Runtime consumers
  // treat omitted locked/consume_key as false.
  locked: z.boolean().optional(),
  key_item_id: z.string().min(1).optional(),
  consume_key: z.boolean().optional(),
});

export const SkillSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
  ability_kind: z.enum(ABILITY_KIND_IDS).optional(),
  runtime_action: z.enum(RUNTIME_ACTION_IDS).optional(),
  ability_page: z.enum(ABILITY_PAGE_ORDER).optional(),
  icon: z.string().optional(),
  sort_order: z.number().optional(),
  starts_unlocked: z.boolean().optional(),
  ap_cost: z.number().default(1000),
  mp_cost: z.number().default(0),
  element: z
    .enum(["none", "fire", "shock", "water", "cold", "poison", "physical"])
    .default("none"),
  targeting: z
    .enum(["single", "line", "cone", "cross", "block"])
    .default("single"),
  range: z.number().default(1),
  payloads: z
    .array(
      z.object({
        type: z.enum(["damage", "heal", "status", "summon"]),
        value: z.number().optional(), // e.g., damage/heal amount or duration
        target_tags: z.array(z.string()).optional(), // filter payload to certain surface tags
        status_effect: z.string().optional(),
        entity_id: z.string().optional(), // for summons
      }),
    )
    .default([]),
  // Emotional-axis impulse applied to each target when this skill resolves —
  // the emotional-layer analogue of `element`/`payloads`. Signed deltas push
  // the target's Alderamontico axes (a "Yell" pushes arousal up + valence down;
  // a "Console" pushes grief down + valence up). New emotional verbs are data,
  // not code: they just declare which axes they push and by how much.
  emotional_impulse: AlderamonticoEmotionalVectorSchema.optional(),
});

export const EntitySchema = z.object({
  id: z.string(),
  display_name: z.string(),
  sprite_id: z.string().optional(),
  dialogue_id: z.string().optional(),
  // Optional dialogue used when this entity is in the party and the player
  // uses "Talk to Party". Falls back to dialogue_id when unset.
  party_dialogue_id: z.string().optional(),
  is_npc: z.boolean().default(false),
  max_hp: z.number().default(10),
  max_mp: z.number().default(0),
  attack: z.number().default(2),
  defense: z.number().default(1),
  speed: z.number().default(10),
  xp_reward: z.number().optional(),
  // Ability ids this entity can use. Party members cast these on their
  // combat turns (the player picks the target).
  skills: z.array(z.string()).optional(),
  // Authored starting Alderamontico emotional axes (0-100). Seeds this
  // entity's emotional state the first time the Grid, a verb, or Attend
  // touches it, so authors can ship a grieving parishioner or a defiant
  // holdout. Unset axes fall back to the engine defaults.
  emotional_axes: AlderamonticoEmotionalVectorSchema.optional(),
  // Doc 06 Attend-node data. Play can fall back to a generated condition read
  // for actors without this, while authored targets can expose hidden readings,
  // composure pressure, and timeout consequences.
  attend_node: AlderamonticoAttendNodeSchema.optional(),
  // Killing a soul-bearing entity is witnessed: the runtime docks hidden
  // `the_road` reputation and logs the road's cold line. Set on non-hostile
  // NPCs and spared shadows; never on plain hostiles.
  soul_bearing: z.boolean().optional(),
  // The Third Voice combat-Attend hook. Hostiles with this enabled expose a
  // combat-only Attend button that opens an authored dialogue and spends the
  // acting turn when the exchange resolves. Mandatory/fracture enemies leave
  // these unset.
  combat_attend_enabled: z.boolean().optional(),
  combat_attend_dialogue_id: z.string().optional(),
  combat_attend_switch: z.string().optional(),
  combat_attend_success_switch: z.string().optional(),
  combat_attend_pacify_entity_id: z.string().optional(),
  on_defeat_switch: z.string().optional(),
  on_defeat_cutscene_id: z.string().optional(),
});

// One waypoint of an NPC's daily routine. At `hour` (0-23) the NPC starts
// walking toward `cell` and stays there until the next entry takes over
// (entries wrap around midnight). Only friendly NPCs (is_npc) follow
// schedules; hostiles keep their chase AI.
export const ScheduleEntrySchema = z.object({
  hour: z.number(),
  cell: z.tuple([z.number(), z.number()]),
});

export const EntityPlacementSchema = z.object({
  // See ObjectPlacementSchema.id. New generators must supply this through the
  // generation-facing map builder; legacy authored placements may omit it.
  id: z.string().min(1).optional(),
  entity_id: z.string(),
  cell: z.tuple([z.number(), z.number()]),
  facing: z.tuple([z.number(), z.number()]).optional(),
  schedule: z.array(ScheduleEntrySchema).optional(),
});

// ── Ambient barks ────────────────────────────────────────────────────────────
// A short overheard exchange between two NPCs — the town talking to itself, not
// to the player. Fires when both named speakers stand within talking distance
// of each other AND the player is within earshot. Lines play in sequence as
// floating speech above each speaker's head. `condition` gates the exchange on
// world state so ambient chatter can react to authored flags. When several
// barks share a speaker pair, the runtime fires the first whose condition
// passes; author the most specific variants before the generic fallback.
export const BarkLineSchema = z.object({
  speaker: z.string(), // entity_id of whichever speaker says this line
  text: z.string(),
});

export const BarkSchema = z.object({
  id: z.string(),
  // The two entity_ids that must stand together (order-independent).
  speakers: z.tuple([z.string(), z.string()]),
  condition: ConditionSchema.optional(),
  lines: z.array(BarkLineSchema),
  // In-game minutes before this exact exchange may play again (runtime default
  // applies when omitted).
  cooldown_minutes: z.number().optional(),
});

// A physical item lying on the ground. Picked up with Act; removal is
// tracked per save in map_deltas so the world stays looted.
export const WorldItemPlacementSchema = z.object({
  id: z.string(), // unique within the map
  item_id: z.string(),
  cell: z.tuple([z.number(), z.number()]),
  count: z.number().default(1),
});

// A lootable container. Rendered with `object_id` from the object library,
// blocks its cell, and persists its inventory per save in map_deltas.
export const ContainerPlacementSchema = z.object({
  id: z.string(), // unique within the map
  object_id: z.string(),
  cell: z.tuple([z.number(), z.number()]),
  facing: z.tuple([z.number(), z.number()]).default([0, 1]),
  display_name: z.string().optional(),
  blueprint_id: z.string().optional(),
  locked: z.boolean().default(false),
  key_item_id: z.string().optional(), // item that unlocks it
  consume_key: z.boolean().default(false),
  items: z
    .array(
      z.object({
        item_id: z.string(),
        count: z.number().default(1),
      }),
    )
    .default([]),
  simulation: SimulationAuthoredProfileSchema.optional(),
});

export const ItemSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(), // Emoji, string
  sprite_id: z.string().optional(), // Sprite ID from Sprite Library
  blueprint_id: z.string().optional(),
  category: z
    .enum(["consumable", "weapon", "armor", "key"])
    .default("consumable"),
  effects: z
    .object({
      heal: z.number().optional(),
      mp_restore: z.number().optional(),
      energy_restore: z.number().optional(),
      survival_restore: z.object({
        hunger: z.number().optional(),
        thirst: z.number().optional(),
        fatigue: z.number().optional(),
        exposure: z.number().optional(),
      }).optional(),
      max_hp_bonus: z.number().optional(),
      damage: z.number().optional(),
      attack_bonus: z.number().optional(),
      defense_bonus: z.number().optional(),
      speed_bonus: z.number().optional(),
    })
    .optional(),
  simulation: SimulationAuthoredProfileSchema.optional(),
  spatial: ItemSpatialProfileSchema.optional(),
});

export const EventActionSchema = z.object({
  type: z.enum([
    "move_player",
    "move_entity",
    "show_dialogue",
    "set_switch",
    "wait",
    "teleport_player",
    "play_sound",
    "start_combat",
    "give_item",
    "remove_item",
    "set_player_sprite",
    "read_document",
    "heal_player",
    "restore_party",
    "open_shop",
    "give_currency",
    "remove_currency",
    "add_party_member",
    "remove_party_member",
    // Control flow: `label` is a no-op jump target; `branch` jumps to
    // `target_label` when `condition` passes (or unconditionally if absent).
    "label",
    "branch",
    // Staging verbs.
    "play_music", // music_url or music_id (settings.music_tracks); omit both to stop
    "screen_fade", // fade: "out" | "in", color, duration
    "camera_pan", // cell + duration to pan there; omit cell to return to player
    "adjust_faction_rep", // faction_id + amount (can be negative)
    "open_save_menu", // opens the save/load slots panel
    "advance_clock", // amount = game minutes (inn rest, act time-jumps)
    "modify_player_stats", // stats = deltas, e.g. { max_hp: 6, attack: 2 }
    "learn_skill", // skill_id added to known_skills
    "set_entity_hidden", // entity_id + hidden — despawn/respawn an entity
    "game_end", // ends the playthrough and shows the end screen (Act finale)
    // Chemistry release: dump a liquid (water/honey/oil), a gas (miasma), or
    // an ignition (fire) onto a cell. `cell` (macro-authored) + `liquid_id` +
    // `amount` (volume / vapor concentration / burn magnitude ×100). The
    // spill only injects quantity — flooding, racing, burning, and
    // dissipating are the live chemistry simulation.
    "chem_spill",
    "custom",
  ]),
  entity_id: z.string().optional(),
  cell: z.tuple([z.number(), z.number()]).optional(),
  facing: z.tuple([z.number(), z.number()]).optional(),
  dialogue_id: z.string().optional(),
  node_id: z.string().optional(),
  switch_id: z.string().optional(),
  switch_value: z.boolean().optional(),
  duration: z.number().optional(),
  map_id: z.string().optional(), // for teleport
  item_id: z.string().optional(), // for give/remove
  amount: z.number().optional(), // for items, currency, heal, or faction rep
  sprite_id: z.string().optional(), // for set_player_sprite
  document_id: z.string().optional(), // for read_document
  shop_id: z.string().optional(), // for open_shop
  label: z.string().optional(), // for label
  target_label: z.string().optional(), // for branch
  condition: ConditionSchema.optional(), // for branch
  music_id: z.string().optional(), // for play_music (settings.music_tracks key)
  music_url: z.string().optional(), // for play_music (direct URL / data URL)
  sound_id: z.string().optional(), // for play_sound (settings.sound_effects key)
  volume: z.number().optional(), // for play_music (0..1)
  fade: z.enum(["in", "out"]).optional(), // for screen_fade
  color: z.string().optional(), // for screen_fade
  faction_id: z.string().optional(), // for adjust_faction_rep
  stats: z.record(z.string(), z.number()).optional(), // for modify_player_stats
  skill_id: z.string().optional(), // for learn_skill
  hidden: z.boolean().optional(), // for set_entity_hidden
  ending_id: z.string().optional(), // for game_end
  title: z.string().optional(), // for game_end override
  liquid_id: z.string().optional(), // for chem_spill: water | honey | oil | miasma | fire
});

export const CutsceneSchema = z.object({
  id: z.string(),
  display_name: z.string().optional(),
  is_blocking: z.boolean().default(true),
  actions: z.array(EventActionSchema).default([]),
});

export const TriggerSchema = z.object({
  id: z.string(),
  cell: z.tuple([z.number(), z.number()]).optional(),
  type: z.enum(["step", "interact", "on_load", "switch_change"]),
  // Legacy switch-only conditions (still honored, ANDed with `condition`).
  conditions: z
    .array(
      z.object({
        switch_id: z.string(),
        expected_value: z.boolean(),
      }),
    )
    .default([]),
  // General gate — see ConditionSchema.
  condition: ConditionSchema.optional(),
  cutscene_id: z.string(),
  once: z.boolean().default(false),
});

// Walking onto an exit cell moves the player to another map. This is the
// primary authoring path for zone travel (town -> dungeon etc.); cutscene
// teleport_player actions remain available for scripted transitions.
export const MapExitSchema = z.object({
  id: z.string().optional(),
  cell: z.tuple([z.number(), z.number()]),
  target_map_id: z.string(),
  // Spawn on the target map. Falls back to the target map's first spawn.
  target_spawn_id: z.string().optional(),
  facing: z.tuple([z.number(), z.number()]).optional(),
  condition: ConditionSchema.optional(),
  // Optional authoring identity for paired generated or hand-authored vertical
  // links. Runtime travel remains driven by target_map_id/target_spawn_id.
  transition_id: z.string().min(1).optional(),
  paired_exit_id: z.string().min(1).optional(),
  transition_kind: z.enum(["stairs", "ladder", "lift", "shaft", "portal"]).optional(),
});

// Provenance attached to an otherwise ordinary map. The runtime deliberately
// does not branch on this record: generated and hand-authored maps share the
// same renderer, save deltas, editor, and command paths.
export const MapGenerationMetadataSchema = z.object({
  generatorId: z.string().min(1),
  generatorVersion: z.string().min(1),
  recipeId: z.string().min(1),
  recipeVersion: z.string().min(1),
  seed: z.string().min(1),
  outputHash: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  manuallyModified: z.boolean(),
  sourceSnapshotHash: z.string().min(1).optional(),
  stageSalts: z.record(z.string(), z.string()).optional(),
  contentLibraryHash: z.string().min(1).optional(),
  canonicalResultHash: z.string().min(1).optional(),
  bundleId: z.string().min(1).optional(),
  floorIndex: z.number().int().nonnegative().optional(),
  floorCount: z.number().int().min(1).max(3).optional(),
  attemptIndex: z.number().int().nonnegative().optional(),
});

export const MapDataSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  width: z.number(),
  height: z.number(),
  spawns: z.array(
    z.object({
      id: z.string(),
      cell: z.tuple([z.number(), z.number()]),
      facing: z.tuple([z.number(), z.number()]),
    }),
  ),
  cells: z.array(CellSchema).default([]),
  props: z.array(z.any()).default([]),
  custom_object_placements: z.array(ObjectPlacementSchema).default([]),
  entity_placements: z.array(EntityPlacementSchema).default([]),
  item_placements: z.array(WorldItemPlacementSchema).default([]),
  container_placements: z.array(ContainerPlacementSchema).default([]),
  regions: z.array(WorldRegionSchema).optional(),
  triggers: z.array(TriggerSchema).default([]),
  exits: z.array(MapExitSchema).default([]),
  generation: MapGenerationMetadataSchema.optional(),
});

export const ObjectPartSchema = z.object({
  shape: z.enum([
    "box",
    "slab",
    "cylinder",
    "cone",
    "sphere",
    "arch",
    "column",
    "stair",
    "plane",
    "rib",
    "ring",
  ]),
  name: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  size: z.tuple([z.number(), z.number(), z.number()]),
  segments: z.number().optional(),
  material: z.string().optional(),
});

export const ObjectMeshFaceSchema = z.object({
  name: z.string().optional(),
  vertices: z.array(z.number()).min(3),
  material: z.string().optional(),
  normal: z.tuple([z.number(), z.number(), z.number()]).optional(),
  group: z.string().optional(),
});

export const ObjectMeshSchema = z.object({
  vertices: z.array(z.tuple([z.number(), z.number(), z.number()])).default([]),
  faces: z.array(ObjectMeshFaceSchema).default([]),
  material_slots: z.array(z.string()).default([]),
  groups: z.array(z.string()).default([]),
});

export const ObjectAssetSchema = z.object({
  data_url: z.string(),
  filename: z.string(),
  source_type: z.enum(["glb", "gltf"]),
  offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  source_min: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  source_center: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  source_bounds: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  material_names: z.array(z.string()).default([]),
  stats: z
    .object({
      meshes: z.number().default(0),
      vertices: z.number().default(0),
      triangles: z.number().default(0),
      materials: z.number().default(0),
      textures: z.number().default(0),
      bytes: z.number().default(0),
    })
    .default({
      meshes: 0,
      vertices: 0,
      triangles: 0,
      materials: 0,
      textures: 0,
      bytes: 0,
    }),
});

export const MaterialTextureKindSchema = z
  .enum([
    "none",
    "stone_grain",
    "marble_veins",
    "wood_grain",
    "metal_scratches",
    "cloth_weave",
    "paper_fiber",
    "soil_grit",
    "water_shimmer",
    "glass_facets",
    "blood_sheen",
    "bone_pores",
  ])
  .default("none");

export const ObjectMaterialSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().default("#A3BE8C"),
  emissive: z.string().default("#000000"),
  emissive_intensity: z.number().default(0),
  opacity: z.number().default(1),
  transparent: z.boolean().default(false),
  roughness: z.number().default(0.7),
  metalness: z.number().default(0.02),
  texture_kind: MaterialTextureKindSchema,
  texture_scale: z.number().default(1),
  texture_strength: z.number().default(0.45),
  texture_image_url: z.string().optional(),
});

export const GameObjectPartCascadeSchema = z.enum([
  "inventory",
  "container_contents",
  "equipment",
  "hand_slots",
  "components",
]);

export const GameObjectPartSchema = z.object({
  id: z.string(),
  type: z.string(),
  listens: z.array(z.string()).default([]),
  cascade: z.array(GameObjectPartCascadeSchema).default([]),
  data: z.record(z.string(), z.any()).default({}),
});

export const GameObjectBlueprintSchema = z.object({
  id: z.string(),
  display_name: z.string().optional(),
  extends: z.string().optional(),
  tags: z.array(z.string()).default([]),
  source: z
    .object({
      kind: z.enum(["generic", "object", "item", "container", "door", "runtime"]),
      id: z.string().optional(),
    })
    .optional(),
  parts: z.array(GameObjectPartSchema).default([]),
});

export const ObjectDecalSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  kind: z
    .enum(["blood", "crack", "marble_vein", "inscription", "grid_glow", "custom"])
    .default("crack"),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0.02, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([-Math.PI / 2, 0, 0]),
  size: z.tuple([z.number(), z.number()]).default([0.5, 0.5]),
  color: z.string().default("#E5E9F0"),
  opacity: z.number().default(0.75),
  emissive: z.boolean().default(false),
  target_face: z.number().optional(),
});

export const ObjectReferenceImageSchema = z.object({
  id: z.string(),
  view: z.enum(["front", "side", "top"]),
  name: z.string(),
  data_url: z.string(),
  opacity: z.number().default(0.45),
  locked: z.boolean().default(true),
  visible: z.boolean().default(true),
  scale: z.number().default(1),
  offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
});

export const ObjectSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  blueprint_id: z.string().optional(),
  origin: z.string().default("center_floor"),
  // Top-down 2D tile: a sprite from the sprite_library drawn for this object in
  // the flat tile renderer. When unset, a coloured placeholder tile is drawn.
  tile_sprite_id: z.string().optional(),
  // Chemistry material this object contributes to its cell (burn/douse/freeze/
  // conduct/shatter). Overrides the engine's name-based inference. Ids come
  // from the built-in table or the Game panel's custom materials.
  chem_material_id: z.string().optional(),
  bounds: z.tuple([z.number(), z.number(), z.number()]),
  materials: z.array(z.string()).default([]),
  material_settings: z.array(ObjectMaterialSchema).default([]),
  model_kind: z.enum(["parts", "mesh", "hybrid", "asset"]).default("parts"),
  parts: z.array(ObjectPartSchema).default([]),
  mesh: ObjectMeshSchema.optional(),
  asset: ObjectAssetSchema.optional(),
  decals: z.array(ObjectDecalSchema).default([]),
  reference_images: z.array(ObjectReferenceImageSchema).default([]),
  collision: z.object({
    profile: z
      .enum([
        "none",
        "single",
        "line",
        "rect",
        "custom_footprint",
        "walkable_support",
      ])
      .default("single"),
    footprint: z.array(z.tuple([z.number(), z.number()])).default([[0, 0]]),
  }),
  simulation: SimulationAuthoredProfileSchema.optional(),
});

export const SpriteSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const sprite = value as Record<string, unknown>;
    if (!Array.isArray(sprite.data_url)) return value;
    const pixels = Array.isArray(sprite.pixels) && sprite.pixels.length ? sprite.pixels : sprite.data_url;
    return { ...sprite, data_url: undefined, pixels };
  },
  z.object({
    id: z.string(),
    display_name: z.string(),
    width: z.number().default(128),
    height: z.number().default(128),
    pixels: z.array(z.string()).default([]),
    data_url: z.string().optional(),
    // Animated image assets, such as GIF idles, should be drawn directly from
    // their image element every frame instead of rasterized into a static canvas.
    animated: z.boolean().optional(),
  }),
);

const DialogueOptionSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const option = value as Record<string, unknown>;
    if (option.next_node_id !== null) return value;
    const { next_node_id: _nextNodeId, ...rest } = option;
    return rest;
  },
  z.object({
    text: z.string(),
    next_node_id: z.string().optional(), // if undefined, ends dialogue
    required_quest: z.string().optional(),
    required_quest_state: z.string().optional(),
    // Option is hidden unless the switch matches. required_switch_value
    // defaults to true, so `required_switch: "x"` means "x must be on".
    required_switch: z.string().optional(),
    required_switch_value: z.boolean().optional(),
    // General gate — see ConditionSchema. Combined (AND) with the
    // legacy required_* fields above.
    condition: ConditionSchema.optional(),
    trigger_quest: z.string().optional(),
    trigger_quest_state: z.string().optional(),
    // Choosing this option sets a switch. set_switch_value defaults true.
    set_switch: z.string().optional(),
    set_switch_value: z.boolean().optional(),
    // For choices that need to mark multiple story facts at once.
    set_switches: z
      .array(
        z.object({
          switch_id: z.string(),
          switch_value: z.boolean().optional(),
        }),
      )
      .optional(),
    // Hidden authoring tag for The Third Voice Attend readings. The UI must
    // never render this; it exists for audits and for content discipline.
    attend_kind: z.enum(["true", "grid", "surface", "exit"]).optional(),
    trigger_cutscene: z.string().optional(),
  }),
);

export const DialogueNodeSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  type: z.enum(["dialogue", "attend"]).optional(),
  attend_node: AlderamonticoAttendNodeSchema.optional(),
  scene_image_url: z.string().optional(),
  scene_image_alt: z.string().optional(),
  options: z.array(DialogueOptionSchema).default([]),
});

export const DialogueSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  nodes: z.array(DialogueNodeSchema).default([]),
});

export const QuestObjectiveSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(["talk", "kill", "collect", "explore", "interact", "custom"]),
  target_id: z.string(),
  count: z.number().default(1),
});

export const QuestSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  description: z.string(),
  objectives: z.array(QuestObjectiveSchema).default([]),
});

export const DocumentSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  content: z.string(),
});

// Conditional price adjustment, applied in order: price * multiplier + delta.
export const ShopPriceModifierSchema = z.object({
  condition: ConditionSchema.optional(),
  multiplier: z.number().default(1),
  delta: z.number().default(0),
});

export const ShopItemSchema = z.object({
  item_id: z.string(),
  price: z.number(),
  // Item is hidden from stock unless the condition passes.
  condition: ConditionSchema.optional(),
  price_modifiers: z.array(ShopPriceModifierSchema).default([]),
});

export const ShopSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  items: z.array(ShopItemSchema).default([]),
});

export const EncounterRoleSchema = z.enum([
  "frontline",
  "ranged",
  "support",
  "ambush",
  "patrol",
]);

const normalizeEncounterAliases = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    factionId: record.factionId ?? record.faction_id,
    minArea: record.minArea ?? record.min_area,
    maxArea: record.maxArea ?? record.max_area,
    reinforcementSlots: record.reinforcementSlots ?? record.reinforcement_slots,
    environmentalPreferences:
      record.environmentalPreferences ?? record.environmental_preferences,
    rewardBudget: record.rewardBudget ?? record.reward_budget,
  };
};

const normalizeEncounterSlotAliases = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    entityId: record.entityId ?? record.entity_id,
    minCount: record.minCount ?? record.min_count,
    maxCount: record.maxCount ?? record.max_count,
    placementRule: record.placementRule ?? record.placement_rule,
  };
};

const normalizeEnvironmentPreferenceAliases = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    roomTag: record.roomTag ?? record.room_tag,
  };
};

export const EnvironmentPreferenceSchema = z.preprocess(
  normalizeEnvironmentPreferenceAliases,
  z.object({
    kind: z.enum(["terrain", "surface", "hazard", "cover", "elevation", "room_tag"]),
    value: z.string().min(1),
    weight: z.number().nonnegative().default(1),
    required: z.boolean().default(false),
    roomTag: z.string().min(1).optional(),
  }),
);

export const EncounterSlotSchema = z.preprocess(
  normalizeEncounterSlotAliases,
  z
    .object({
      entityId: z.string().min(1),
      role: EncounterRoleSchema.optional(),
      minCount: z.number().int().nonnegative(),
      maxCount: z.number().int().nonnegative(),
      placementRule: z.string().min(1).optional(),
    })
    .superRefine((slot, context) => {
      if (slot.maxCount < slot.minCount) {
        context.addIssue({
          code: "custom",
          path: ["maxCount"],
          message: "maxCount must be greater than or equal to minCount",
        });
      }
    }),
);

export const EncounterDefinitionSchema = z.preprocess(
  normalizeEncounterAliases,
  z
    .object({
      id: z.string().min(1),
      tags: z.array(z.string()).default([]),
      factionId: z.string().min(1).optional(),
      difficulty: z.number().nonnegative(),
      minArea: z.number().nonnegative(),
      maxArea: z.number().nonnegative().optional(),
      slots: z.array(EncounterSlotSchema).min(1),
      reinforcementSlots: z.array(EncounterSlotSchema).optional(),
      environmentalPreferences: z.array(EnvironmentPreferenceSchema).optional(),
      rewardBudget: z.number().nonnegative().optional(),
    })
    .superRefine((encounter, context) => {
      if (encounter.maxArea !== undefined && encounter.maxArea < encounter.minArea) {
        context.addIssue({
          code: "custom",
          path: ["maxArea"],
          message: "maxArea must be greater than or equal to minArea",
        });
      }
    }),
);

export const GamePackageSchema = z.object({
  schema: z.literal("crpg_engine_game_package_v1"),
  metadata: GameMetadataSchema,
  settings: z.record(z.string(), z.any()).default({}),
  maps: z.array(MapDataSchema).default([]),
  object_library: z.array(ObjectSchema).default([]),
  sprite_library: z.array(SpriteSchema).default([]),
  entities: z.array(EntitySchema).default([]),
  dialogue: z.array(DialogueSchema).default([]),
  documents: z.array(DocumentSchema).default([]),
  quests: z.array(QuestSchema).default([]),
  cutscenes: z.array(CutsceneSchema).default([]),
  switches: z.record(z.string(), z.boolean()).default({}),
  items: z.array(ItemSchema).default([]),
  abilities: z.array(SkillSchema).default([]),
  encounters: z.array(EncounterDefinitionSchema).default([]),
  shops: z.array(ShopSchema).default([]),
  factions: z.array(z.any()).default([]),
  endings: z.array(z.any()).default([]),
  barks: z.array(BarkSchema).default([]),
  object_blueprints: z.array(GameObjectBlueprintSchema).default([]),
  simulation_materials: z.array(SimulationMaterialProfileSchema).default([]),
  simulation_processes: z.array(SimulationProcessDefinitionSchema).default([]),
  simulation_workstations: z.array(SimulationWorkstationSchema).default([]),
  dungeon_recipes: z.array(DungeonRecipeSchema).default([]),
  dungeon_themes: z.array(DungeonThemeProfileSchema).default([]),
  dungeon_room_archetypes: z.array(DungeonRoomArchetypeSchema).default([]),
  dungeon_room_templates: z.array(DungeonRoomTemplateSchema).default([]),
  dungeon_encounter_profiles: z.array(DungeonEncounterProfileSchema).default([]),
  dungeon_hazard_profiles: z.array(DungeonHazardProfileSchema).default([]),
  dungeon_reward_profiles: z.array(DungeonRewardProfileSchema).default([]),
  dungeon_narrative_profiles: z.array(DungeonNarrativeProfileSchema).default([]),
  validators: z.record(z.string(), z.any()).default({}),
});

export type GamePackage = z.infer<typeof GamePackageSchema>;
export type MapGenerationMetadata = z.infer<typeof MapGenerationMetadataSchema>;
export type EnvironmentPreference = z.infer<typeof EnvironmentPreferenceSchema>;
export type EncounterSlot = z.infer<typeof EncounterSlotSchema>;
export type EncounterDefinition = z.infer<typeof EncounterDefinitionSchema>;
export type SimulationProcessDefinitionData = z.infer<typeof SimulationProcessDefinitionSchema>;
export type SimulationWorkstationData = z.infer<typeof SimulationWorkstationSchema>;
export type ItemSpatialProfileData = z.infer<typeof ItemSpatialProfileSchema>;
export type InitialChemistryData = z.infer<typeof InitialChemistrySchema>;
export type WorldRegionData = z.infer<typeof WorldRegionSchema>;
export type WorldRegionPassiveCheckData = z.infer<typeof WorldRegionPassiveCheckSchema>;
export type MapData = z.infer<typeof MapDataSchema>;
export type MapExitData = z.infer<typeof MapExitSchema>;
export type WorldItemPlacementData = z.infer<typeof WorldItemPlacementSchema>;
export type ContainerPlacementData = z.infer<typeof ContainerPlacementSchema>;
export type ScheduleEntryData = z.infer<typeof ScheduleEntrySchema>;
export type BarkLineData = z.infer<typeof BarkLineSchema>;
export type BarkData = z.infer<typeof BarkSchema>;
export type SimulationConditionData = z.infer<typeof SimulationConditionSchema>;
export type SimulationMaterialProfileData = z.infer<typeof SimulationMaterialProfileSchema>;
export type SimulationTraceProfileData = z.infer<typeof SimulationTraceProfileSchema>;
export type SimulationAuthoredProfileData = z.infer<typeof SimulationAuthoredProfileSchema>;
export type GameObjectPartCascadeData = z.infer<typeof GameObjectPartCascadeSchema>;
export type GameObjectPartData = z.infer<typeof GameObjectPartSchema>;
export type GameObjectBlueprintData = z.infer<typeof GameObjectBlueprintSchema>;
export type CellData = z.infer<typeof CellSchema>;
export type ObjectData = z.infer<typeof ObjectSchema>;
export type ObjectPart = z.infer<typeof ObjectPartSchema>;
export type ObjectMeshFace = z.infer<typeof ObjectMeshFaceSchema>;
export type ObjectMeshData = z.infer<typeof ObjectMeshSchema>;
export type ObjectAssetData = z.infer<typeof ObjectAssetSchema>;
export type ObjectMaterialData = z.infer<typeof ObjectMaterialSchema>;
export type ObjectDecalData = z.infer<typeof ObjectDecalSchema>;
export type ObjectReferenceImageData = z.infer<typeof ObjectReferenceImageSchema>;
export type SpriteData = z.infer<typeof SpriteSchema>;
export type DialogueData = z.infer<typeof DialogueSchema>;
export type DialogueNodeData = z.infer<typeof DialogueNodeSchema>;
export type QuestData = z.infer<typeof QuestSchema>;
export type QuestObjectiveData = z.infer<typeof QuestObjectiveSchema>;
export type EntityData = z.infer<typeof EntitySchema>;
export type EntityPlacementData = z.infer<typeof EntityPlacementSchema>;
export type ObjectPlacementData = z.infer<typeof ObjectPlacementSchema>;
export type ItemData = z.infer<typeof ItemSchema>;
export type SkillData = z.infer<typeof SkillSchema>;
export type DocumentData = z.infer<typeof DocumentSchema>;

export type TriggerData = z.infer<typeof TriggerSchema>;
export type EventActionData = z.infer<typeof EventActionSchema>;
export type CutsceneData = z.infer<typeof CutsceneSchema>;
export type ShopData = z.infer<typeof ShopSchema>;
export type ShopItemData = z.infer<typeof ShopItemSchema>;
export type ShopPriceModifierData = z.infer<typeof ShopPriceModifierSchema>;

export const createDefaultGameObjectBlueprints = (): GameObjectBlueprintData[] => [
  {
    id: "Object",
    display_name: "Object",
    tags: ["root"],
    source: { kind: "generic", id: "Object" },
    parts: [
      {
        id: "identity",
        type: "identity",
        listens: ["inspect"],
        cascade: [],
        data: { root: true },
      },
    ],
  },
  {
    id: "PhysicalObject",
    display_name: "Physical Object",
    extends: "Object",
    tags: ["physical"],
    source: { kind: "generic", id: "PhysicalObject" },
    parts: [
      {
        id: "physical",
        type: "physical",
        listens: ["object_moved", "object_pushed", "object_broken", "apply_fire"],
        cascade: [],
        data: { has_location: true },
      },
    ],
  },
  {
    id: "ItemObject",
    display_name: "Item Object",
    extends: "PhysicalObject",
    tags: ["item"],
    source: { kind: "generic", id: "ItemObject" },
    parts: [
      {
        id: "inventory_item",
        type: "inventory_item",
        listens: ["object_taken", "object_dropped", "object_stowed"],
        cascade: ["inventory"],
        data: { stackable: true },
      },
    ],
  },
  {
    id: "ContainerObject",
    display_name: "Container Object",
    extends: "PhysicalObject",
    tags: ["container"],
    source: { kind: "generic", id: "ContainerObject" },
    parts: [
      {
        id: "container",
        type: "container",
        listens: ["container_opened", "container_closed", "container_searched", "object_stowed", "apply_fire", "apply_water"],
        cascade: ["container_contents"],
        data: { holds_items: true },
      },
    ],
  },
  {
    id: "DoorObject",
    display_name: "Door Object",
    extends: "PhysicalObject",
    tags: ["door", "openable"],
    source: { kind: "generic", id: "DoorObject" },
    parts: [
      {
        id: "openable",
        type: "openable",
        listens: ["door_opened", "door_closed"],
        cascade: [],
        data: { starts_open: false },
      },
    ],
  },
];

export const createDefaultSimulationMaterialProfiles = (): SimulationMaterialProfileData[] => [
  {
    id: "sim_mat_stone",
    label: "Stone",
    density: 2.4,
    hardness: 0.9,
    flammability: 0,
    ignition_temperature: 1200,
    burn_behavior: "does_not_burn",
    absorbency: 0.05,
    permeability: 0.02,
    conductivity: 0.25,
    fragility: 0.15,
    wetness_capacity: 0.1,
    scent_retention: 0.2,
    cleaning_difficulty: 0.7,
    decay_behavior: "erodes",
    sound_response: "hard_clack",
    light_response: "matte",
    tags: ["mineral", "structure"],
  },
  {
    id: "sim_mat_wood",
    label: "Wood",
    density: 0.7,
    hardness: 0.45,
    flammability: 0.7,
    ignition_temperature: 330,
    burn_behavior: "chars_to_ash",
    absorbency: 0.45,
    permeability: 0.25,
    conductivity: 0.1,
    fragility: 0.3,
    wetness_capacity: 0.5,
    scent_retention: 0.55,
    cleaning_difficulty: 0.8,
    decay_behavior: "rots",
    sound_response: "hollow_thud",
    light_response: "warm_matte",
    tags: ["organic", "flammable", "structure"],
  },
  {
    id: "sim_mat_metal",
    label: "Metal",
    density: 7.5,
    hardness: 0.8,
    flammability: 0,
    ignition_temperature: 1400,
    burn_behavior: "heats_and_warps",
    absorbency: 0,
    permeability: 0,
    conductivity: 0.9,
    fragility: 0.1,
    wetness_capacity: 0.05,
    scent_retention: 0.1,
    cleaning_difficulty: 0.45,
    decay_behavior: "rusts",
    sound_response: "ringing_clang",
    light_response: "reflective",
    tags: ["metal", "conductive"],
  },
  {
    id: "sim_mat_cloth",
    label: "Cloth",
    density: 0.25,
    hardness: 0.05,
    flammability: 0.8,
    ignition_temperature: 255,
    burn_behavior: "burns_fast",
    absorbency: 0.8,
    permeability: 0.7,
    conductivity: 0.05,
    fragility: 0.45,
    wetness_capacity: 0.85,
    scent_retention: 0.9,
    cleaning_difficulty: 0.65,
    decay_behavior: "mildews",
    sound_response: "soft_rustle",
    light_response: "soft",
    tags: ["organic", "absorbent", "flammable"],
  },
  {
    id: "sim_mat_glass",
    label: "Glass",
    density: 2.5,
    hardness: 0.7,
    flammability: 0,
    ignition_temperature: 1100,
    burn_behavior: "softens",
    absorbency: 0,
    permeability: 0,
    conductivity: 0.2,
    fragility: 0.85,
    wetness_capacity: 0.02,
    scent_retention: 0.05,
    cleaning_difficulty: 0.35,
    decay_behavior: "stable",
    sound_response: "sharp_chime",
    light_response: "transparent",
    tags: ["mineral", "fragile", "transparent"],
  },
  {
    id: "sim_mat_soil",
    label: "Soil",
    density: 1.3,
    hardness: 0.1,
    flammability: 0.05,
    ignition_temperature: 700,
    burn_behavior: "scorches",
    absorbency: 0.65,
    permeability: 0.8,
    conductivity: 0.15,
    fragility: 0.05,
    wetness_capacity: 0.9,
    scent_retention: 0.75,
    cleaning_difficulty: 1,
    decay_behavior: "compacts",
    sound_response: "muffled",
    light_response: "dark_matte",
    tags: ["earth", "absorbent"],
  },
];

const cell = (
  x: number,
  z: number,
  overrides: Partial<CellData> = {},
): CellData => ({
  x,
  y: 0,
  z,
  active: true,
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  terrain: "default",
  surface_tag: "none",
  ...overrides,
});

const makeDemoCells = (): CellData[] => {
  const cells: CellData[] = [];
  for (let x = -8; x <= 8; x += 1) {
    for (let z = -8; z <= 8; z += 1) {
      const edge = x === -8 || x === 8 || z === -8 || z === 8;
      const interiorWall = (x === -2 && z >= -6 && z <= -2) || (z === 3 && x >= 2 && x <= 6);
      const doorCell = x === -2 && z === -4;
      const blocked = edge || (interiorWall && !doorCell);
      cells.push(
        cell(x, z, {
          walkable: !blocked,
          blocks_los: blocked,
          visual_height: blocked ? 1.6 : 0,
          object_id: blocked ? "obj_wall_block" : "obj_floor_plate",
        }),
      );
    }
  }
  return cells;
};

const createBaseGamePackage = (): GamePackage => ({
  schema: "crpg_engine_game_package_v1",
  metadata: {
    title: "CRPG Engine Feature Demo",
    version: "1.0.0",
    start_map_id: "map_march_convening",
    start_spawn_id: "spawn_start",
  },
  settings: {
    clock_start_hour: 9,
    minutes_per_turn: 5,
    fog_los_resolution: "macro",
    player_sprite_id: "generated_player_intercessor_south_idle",
    initial_known_skills: [...DEFAULT_UNLOCKED_ABILITY_IDS, "skl_quick_strike", "skl_first_aid", "skl_arc_bolt"],
    starting_party_members: [],
    player_stats: {
      hp: 24,
      max_hp: 24,
      mp: 12,
      max_mp: 12,
      attack: 5,
      defense: 2,
      speed: 10,
      energy: 1000,
    },
    end_title: "Feature Demo Complete",
    dialogue_portraits: {
      guide: { src: "", alt: "Guide", side: "left" },
      companion: { src: "", alt: "Companion", side: "right" },
      system: { src: "", alt: "System", side: "left" },
    },
    music_tracks: {},
    sound_effects: {},
    map_music: {},
  },
  maps: [
    createOverworldMap(),
    ...createThreefoldMarchMaps(),
    {
      id: "map_demo_ground",
      display_name: "Engine Test Grounds",
      width: 17,
      height: 17,
      spawns: [
        { id: "spawn_start", cell: [0, 6], facing: [0, -1] },
        { id: "spawn_training", cell: [5, -5], facing: [-1, 0] },
      ],
      cells: makeDemoCells(),
      props: [],
      custom_object_placements: [
        {
          object_id: "obj_terminal",
          cell: [0, 4],
          facing: [0, -1],
          dialogue_id: "dia_demo_terminal",
        },
        {
          object_id: "obj_p_door",
          cell: [-2, -4],
          facing: [1, 0],
          dialogue_id: "dia_demo_door",
        },
        { object_id: "obj_crate", cell: [3, 2], facing: [0, 1] },
        { object_id: "obj_training_beacon", cell: [5, -6], facing: [0, 1] },
      ],
      entity_placements: [
        { entity_id: "ent_guide", cell: [-3, 5], schedule: [{ hour: 9, cell: [-3, 5] }, { hour: 18, cell: [-1, 5] }] },
        { entity_id: "ent_companion", cell: [2, 5] },
        { entity_id: "ent_training_bot", cell: [5, -4], facing: [0, -1] },
      ],
      item_placements: [
        { id: "drop_training_token", item_id: "itm_training_token", cell: [1, 3], count: 1 },
      ],
      container_placements: [
        {
          id: "demo_locked_chest",
          object_id: "obj_chest",
          cell: [4, 4],
          facing: [0, -1],
          display_name: "Practice Chest",
          locked: true,
          key_item_id: "itm_practice_key",
          consume_key: false,
          items: [
            { item_id: "itm_health_tonic", count: 2 },
            { item_id: "itm_training_token", count: 1 },
          ],
        },
      ],
      triggers: [
        { id: "trg_demo_intro", type: "on_load", conditions: [], cutscene_id: "cut_demo_intro", once: true },
        { id: "trg_demo_note", cell: [0, 4], type: "interact", conditions: [], cutscene_id: "cut_read_demo_note", once: false },
      ],
      exits: [],
    },
  ],
  object_library: objectLibraryPresets,
  sprite_library: spriteLibraryPresets,
  entities: [
    {
      id: "ent_guide",
      display_name: "Guide",
      sprite_id: "ovr_ent_brother_aldric_south_idle",
      dialogue_id: "dia_demo_guide",
      is_npc: true,
      max_hp: 18,
      max_mp: 8,
      attack: 2,
      defense: 1,
      speed: 8,
      skills: ["skl_first_aid"],
    },
    {
      id: "ent_companion",
      display_name: "Companion",
      sprite_id: "ovr_ent_esk_south_idle",
      dialogue_id: "dia_demo_companion",
      party_dialogue_id: "dia_demo_companion_party",
      is_npc: true,
      max_hp: 20,
      max_mp: 8,
      attack: 4,
      defense: 2,
      speed: 9,
      skills: ["skl_quick_strike", "skl_first_aid"],
    },
    {
      id: "ent_training_bot",
      display_name: "Training Bot",
      sprite_id: "spr_training_bot",
      is_npc: false,
      max_hp: 12,
      max_mp: 0,
      attack: 3,
      defense: 1,
      speed: 7,
      xp_reward: 25,
      skills: [],
      attend_node: {
        id: "attend_training_bot_condition",
        target: "ent_training_bot",
        composure: 4,
        glassPressure: { reverence: 6, arousal: 3 },
        readings: [
          {
            id: "bot_false_peace",
            text: "It is calm because it has accepted its role.",
            truth: "false",
            requiresAttention: 0,
            effect: { set_switch: "attend_training_bot_false_peace" },
          },
          {
            id: "bot_true_loop",
            text: "The stillness is a loop. It is bracing for impact again and again.",
            truth: "true",
            requiresAttention: 2,
            effect: {
              set_switch: "attend_training_bot_true_loop",
              target_emotional_impulse: { valence: -4, arousal: 6 },
            },
          },
          {
            id: "bot_partial_unknown",
            text: "You cannot tell whether this is obedience or fear from here.",
            truth: "partial",
            requiresAttention: 9,
            effect: { set_switch: "attend_training_bot_admitted_uncertainty", attention_delta: 1 },
          },
        ],
        onTimeout: {
          reading_id: "bot_false_peace",
          status_effect: "glass_residue",
          status_duration: 2,
          status_magnitude: 1,
        },
      },
    },
    {
      id: "ent_bark_scout",
      display_name: "Systems Scout",
      sprite_id: "ovr_ent_villager_south_idle",
      is_npc: true,
      max_hp: 14,
      max_mp: 4,
      attack: 2,
      defense: 1,
      speed: 8,
      skills: [],
    },
    {
      id: "ent_bark_scribe",
      display_name: "Systems Scribe",
      sprite_id: "ovr_ent_parishioner_south_idle",
      is_npc: true,
      max_hp: 14,
      max_mp: 4,
      attack: 2,
      defense: 1,
      speed: 8,
      skills: [],
    },
    {
      id: "ent_stealth_watcher",
      display_name: "Stealth Watcher",
      sprite_id: "ovr_ent_watcher_south_idle",
      is_npc: true,
      max_hp: 16,
      max_mp: 4,
      attack: 2,
      defense: 1,
      speed: 8,
      skills: [],
    },
  ],
  dialogue: [
    {
      id: "dia_demo_guide",
      display_name: "Guide Introduction",
      nodes: [
        {
          id: "start",
          speaker: "Guide",
          text: "Welcome to the feature demo. This small map keeps the engine systems visible without shipping any game-specific lore.",
          options: [
            {
              text: "Start the demo tour.",
              next_node_id: "tour",
              trigger_quest: "quest_demo_tour",
              trigger_quest_state: "started",
              set_switch: "demo_tour_started",
            },
            { text: "Open the supply shop.", trigger_cutscene: "cut_open_demo_shop" },
            { text: "Goodbye." },
          ],
        },
        {
          id: "tour",
          speaker: "Guide",
          text: "Try the terminal, pick up the token, open the locked chest with the practice key, recruit the companion, and test combat against the training bot.",
          options: [{ text: "Got it." }],
        },
      ],
    },
    {
      id: "dia_demo_companion",
      display_name: "Companion Recruitment",
      nodes: [
        {
          id: "start",
          speaker: "Companion",
          text: "Need someone in the initiative queue beside you? I can join, follow, and take turns in combat.",
          options: [
            { text: "Join me.", trigger_cutscene: "cut_recruit_companion", set_switch: "demo_companion_recruited" },
            { text: "Stay here for now." },
          ],
        },
      ],
    },
    {
      id: "dia_demo_companion_party",
      display_name: "Companion Party Talk",
      nodes: [
        {
          id: "start",
          speaker: "Companion",
          text: "Party talk is live. The same dialogue system works whether I am placed on the map or following you.",
          options: [{ text: "Back to work." }],
        },
      ],
    },
    {
      id: "dia_demo_terminal",
      display_name: "Terminal",
      nodes: [
        {
          id: "start",
          speaker: "System",
          text: "Terminal online. Interact triggers can show dialogue, read documents, set flags, start shops, branch, or call custom events.",
          options: [{ text: "Close." }],
        },
      ],
    },
    {
      id: "dia_demo_door",
      display_name: "Doorway",
      nodes: [
        {
          id: "start",
          speaker: "System",
          text: "Door state persists in the save. Open it, save, reload, and it stays open.",
          options: [{ text: "Step through." }],
        },
      ],
    },
  ],
  documents: [
    {
      id: "doc_demo_note",
      display_name: "Feature Demo Note",
      content:
        "This neutral package demonstrates maps, spawns, cells, object placements, doors, containers, items, entities, dialogue, quests, cutscenes, shops, skills, combat, documents, saves, barks, and package import/export.",
    },
  ],
  quests: [
    {
      id: "quest_demo_tour",
      display_name: "Feature Demo Tour",
      description: "Walk through the reusable CRPG engine systems in a neutral test map.",
      objectives: [
        { id: "obj_terminal", description: "Read the terminal note", type: "interact", target_id: "doc_demo_note", count: 1 },
        { id: "obj_companion", description: "Recruit the companion", type: "talk", target_id: "ent_companion", count: 1 },
        { id: "obj_training", description: "Defeat the training bot", type: "kill", target_id: "ent_training_bot", count: 1 },
      ],
    },
  ],
  cutscenes: [
    {
      id: "cut_demo_intro",
      display_name: "Demo Intro",
      is_blocking: true,
      actions: [
        { type: "set_switch", switch_id: "demo_loaded", switch_value: true },
        { type: "give_currency", amount: 10 },
        { type: "show_dialogue", dialogue_id: "dia_demo_guide", node_id: "start" },
      ],
    },
    {
      id: "cut_read_demo_note",
      display_name: "Read Demo Note",
      is_blocking: true,
      actions: [
        { type: "read_document", document_id: "doc_demo_note" },
        { type: "set_switch", switch_id: "demo_note_read", switch_value: true },
        { type: "set_switch", switch_id: "demo_tour_started", switch_value: true },
      ],
    },
    {
      id: "cut_world_surface_probe",
      display_name: "World Surface Probe",
      is_blocking: false,
      actions: [
        { type: "set_switch", switch_id: "world_surface_probe_seen", switch_value: true },
        { type: "advance_clock", amount: 5 },
        { type: "adjust_faction_rep", faction_id: "f_guild", amount: 1 },
      ],
    },
    {
      id: "cut_world_switch_probe",
      display_name: "World Switch Probe",
      is_blocking: false,
      actions: [
        { type: "give_item", item_id: "itm_training_token", amount: 1 },
        { type: "set_switch", switch_id: "world_switch_probe_seen", switch_value: true },
      ],
    },
    {
      id: "cut_open_demo_shop",
      display_name: "Open Demo Shop",
      is_blocking: true,
      actions: [{ type: "open_shop", shop_id: "shop_demo_supply" }],
    },
    {
      id: "cut_recruit_companion",
      display_name: "Recruit Companion",
      is_blocking: true,
      actions: [
        { type: "add_party_member", entity_id: "ent_companion" },
        { type: "learn_skill", skill_id: "skl_arc_bolt" },
        { type: "set_entity_hidden", entity_id: "ent_companion", hidden: true },
        { type: "set_switch", switch_id: "demo_companion_recruited", switch_value: true },
        { type: "set_switch", switch_id: "demo_tour_started", switch_value: true },
      ],
    },
  ],
  switches: {},
  items: [
    {
      id: "itm_health_tonic",
      display_name: "Health Tonic",
      description: "Restores a small amount of HP.",
      icon: "+",
      sprite_id: "spr_itm_health_tonic",
      category: "consumable",
      effects: { heal: 10 },
    },
    {
      id: "itm_training_token",
      display_name: "Training Token",
      description: "A neutral collectible used by the feature demo.",
      icon: "o",
      sprite_id: "spr_itm_training_token",
      category: "key",
    },
    {
      id: "itm_field_ration",
      display_name: "Field Ration",
      description: "A compact survival kit that relieves hunger, thirst, fatigue, and exposure pressure.",
      icon: "r",
      category: "consumable",
      effects: {
        energy_restore: 250,
        survival_restore: { hunger: 35, thirst: 20, fatigue: 20, exposure: 15 },
      },
      spatial: {
        shape: [[1, 1]],
        weight_kg: 0.8,
        bulk: 1,
        stack_limit: 3,
      },
    },
    {
      id: "itm_practice_key",
      display_name: "Practice Key",
      description: "Unlocks the practice chest.",
      icon: "k",
      sprite_id: "spr_itm_practice_key",
      category: "key",
    },
  ],
  abilities: [
    ...DEFAULT_BUILTIN_ABILITIES,
    {
      id: "skl_quick_strike",
      display_name: "Quick Strike",
      description: "A simple single-target attack used to test ability targeting.",
      ability_kind: "skill",
      ability_page: "combat",
      icon: "sparkles",
      sort_order: 40,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 0,
      element: "physical",
      targeting: "single",
      range: 1,
      payloads: [{ type: "damage", value: 4 }],
    },
    {
      id: "skl_first_aid",
      display_name: "First Aid",
      description: "Restore HP to a nearby ally.",
      ability_kind: "skill",
      ability_page: "combat",
      icon: "heart",
      sort_order: 50,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 2,
      element: "none",
      targeting: "single",
      range: 2,
      payloads: [{ type: "heal", value: 6 }],
    },
    {
      id: "skl_arc_bolt",
      display_name: "Arc Bolt",
      description: "A ranged line attack learned when the companion joins.",
      ability_kind: "skill",
      ability_page: "elemental",
      icon: "zap",
      sort_order: 70,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 3,
      element: "shock",
      targeting: "line",
      range: 4,
      payloads: [{ type: "damage", value: 5 }],
    },
  ],
  encounters: [],
  shops: [
    {
      id: "shop_demo_supply",
      display_name: "Demo Supply",
      items: [
        { item_id: "itm_health_tonic", price: 5, price_modifiers: [] },
        { item_id: "itm_field_ration", price: 3, price_modifiers: [] },
        { item_id: "itm_practice_key", price: 1, price_modifiers: [] },
      ],
    },
  ],
  simulation_processes: [
    {
      id: "sim_proc_brew_tonic",
      label: "Brew Health Tonic",
      process_type: "alchemy",
      workstation_id: "sim_ws_demo_alchemy",
      required_ticks: 3,
      input_items: [{ item_id: "itm_training_token", count: 1 }],
      output_items: [{ item_id: "itm_health_tonic", count: 1 }],
      waste_items: [{ item_id: "itm_training_token", count: 1 }],
      emits: { sound: 2, heat: 0.4, trace_kind: "herbal_residue" },
      economy: {
        shop_id: "shop_demo_supply",
        stock_item_id: "itm_health_tonic",
        stock_delta: 1,
        shortage_threshold: 2,
        price_delta_when_short: 2,
      },
      failure: { interrupted_by_fire: true, interrupted_by_actor_missing: true },
    },
    {
      id: "sim_proc_pack_field_ration",
      label: "Pack Field Ration",
      process_type: "cooking",
      workstation_id: "sim_ws_demo_alchemy",
      required_ticks: 2,
      input_items: [{ item_id: "itm_training_token", count: 1 }],
      output_items: [{ item_id: "itm_field_ration", count: 1 }],
      waste_items: [],
      emits: { sound: 1, scent: 0.25, trace_kind: "ration_wrap" },
      failure: { interrupted_by_fire: true, interrupted_by_actor_missing: true },
    },
  ],
  simulation_workstations: [
    {
      id: "sim_ws_world_alchemy",
      label: "Systems Alchemy Bench",
      map_id: "map_overworld",
      cell: [-2, 5],
      process_ids: ["sim_proc_brew_tonic", "sim_proc_pack_field_ration"],
      occupies_actor: true,
    },
    {
      id: "sim_ws_demo_alchemy",
      label: "Demo Alchemy Bench",
      map_id: "map_demo_ground",
      cell: [0, 5],
      process_ids: ["sim_proc_brew_tonic", "sim_proc_pack_field_ration"],
      occupies_actor: true,
    },
  ],
  dungeon_recipes: [],
  dungeon_themes: [],
  dungeon_room_archetypes: [],
  dungeon_room_templates: [],
  dungeon_encounter_profiles: [],
  dungeon_hazard_profiles: [],
  dungeon_reward_profiles: [],
  dungeon_narrative_profiles: [],
  factions: [
    {
      id: "f_guild",
      display_name: "Systems Guild",
    },
  ],
  endings: [],
  barks: [
    {
      id: "bark_systems_map_ready",
      speakers: ["ent_bark_scout", "ent_bark_scribe"],
      lines: [
        { speaker: "ent_bark_scout", text: "Movement lane is clear." },
        { speaker: "ent_bark_scribe", text: "Bark cooldowns are listening." },
      ],
      cooldown_minutes: 60,
    },
    {
      id: "bark_demo_ready",
      speakers: ["ent_guide", "ent_companion"],
      condition: { switch: "demo_tour_started" },
      lines: [
        { speaker: "ent_guide", text: "The tour is active." },
        { speaker: "ent_companion", text: "Then the engine paths are doing their job." },
      ],
      cooldown_minutes: 120,
    },
  ],
  object_blueprints: createDefaultGameObjectBlueprints(),
  simulation_materials: createDefaultSimulationMaterialProfiles(),
  validators: {},
});

// Headless engine regressions still exercise the purpose-built legacy fixture
// geometry. This factory is test-only; the playable package below installs
// only the canonical QA suite maps.
export const createLegacyEngineTestFixturePackage = (): GamePackage =>
  createBaseGamePackage();

// A neutral authoring package. Regression/sample content is installed only by
// an explicit QA-suite API; creating a workspace never replaces its maps.
export const createEmptyGamePackage = (): GamePackage => createBaseGamePackage();
