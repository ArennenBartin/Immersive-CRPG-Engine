// ── QA hub ───────────────────────────────────────────────────────────────────
// The compass rose of the suite: nine physical doorways plus curator teleport
// access to the perception lab, the grand-tour quest, the feature matrix, a
// save terminal, and the gated completion terminal.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  QA_START_MAP_ID,
  QA_START_SPAWN_ID,
  dlg,
  entityPlacement,
  exit,
  lever,
  npc,
  prop,
  roomCells,
  say,
  sign,
  stampCells,
} from "./shared";

const hubCells = (() => {
  const o: CellOverrides = {};
  // Doorways through the wall ring, one per lab.
  stampCells(
    o,
    [
      [-4, -8], [0, -8], [4, -8], // N: gas, flood, viscosity
      [8, -4], [8, 0], [8, 4], // E: emotion, fire, combat
      [0, 8], // S: story
      [-8, 0], [-8, 4], // W: world, movement
    ],
    DOORWAY,
  );
  return roomCells(-8, 8, -8, 8, o);
})();

const completionTerminal = lever(
  "qa_trig_completion",
  "obj_terminal",
  [0, -5],
  "qa_cut_suite_complete",
  {
    condition: {
      all: [
        { switch: "qa_flood_released" },
        { switch: "qa_race_released" },
        { switch: "qa_fire_released" },
        { switch: "qa_gas_released" },
      ],
    },
  },
);

const saveTerminal = lever("qa_trig_save_menu", "obj_terminal", [-3, -5], "qa_cut_open_save_menu");

const hubMap = {
  id: QA_START_MAP_ID,
  display_name: "Engine QA Hub",
  width: 17,
  height: 17,
  spawns: [{ id: QA_START_SPAWN_ID, cell: [0, 5] as [number, number], facing: [0, -1] as [number, number] }],
  cells: hubCells,
  props: [],
  custom_object_placements: [
    completionTerminal.placement,
    saveTerminal.placement,
    sign("obj_bookshelf", [3, -5], "qa_dlg_feature_matrix"),
    prop("obj_oil_lamp", [-1, -5]),
    // Doorway labels.
    sign("obj_terminal", [-4, -6], "qa_dlg_hub_north_signs"),
    sign("obj_terminal", [6, -4], "qa_dlg_hub_east_signs"),
    sign("obj_terminal", [-6, 2], "qa_dlg_hub_west_signs"),
  ],
  entity_placements: [
    entityPlacement("qa_hub_curator", [0, 2], [0, 1]),
    entityPlacement("qa_hub_scout", [-2, 3], [1, 0]),
    entityPlacement("qa_hub_scribe", [2, 3], [-1, 0]),
  ],
  item_placements: [
    { id: "qa_hub_keycard", item_id: "qa_keycard", cell: [-3, 1] as [number, number], count: 1 },
  ],
  container_placements: [
    {
      id: "qa_hub_keyed_cache",
      object_id: "obj_chest",
      cell: [3, 1] as [number, number],
      facing: [0, 1] as [number, number],
      display_name: "QA Keyed Cache",
      locked: true,
      key_item_id: "qa_keycard",
      consume_key: false,
      items: [{ item_id: "qa_focus_tonic", count: 1 }],
    },
  ],
  regions: [],
  triggers: [
    {
      id: "qa_hub_intro_once",
      type: "on_load" as const,
      conditions: [],
      cutscene_id: "qa_cut_hub_intro",
      once: true,
    },
    completionTerminal.trigger,
    saveTerminal.trigger,
  ],
  exits: [
    exit([-4, -8], "qa_gas_lab"),
    exit([0, -8], "qa_flood_lab"),
    exit([4, -8], "qa_visc_lab"),
    exit([8, -4], "qa_emotion_lab"),
    exit([8, 0], "qa_fire_lab"),
    exit([8, 4], "qa_combat_lab"),
    exit([0, 8], "qa_story_lab"),
    exit([-8, 0], "qa_world_lab"),
    exit([-8, 4], "qa_move_lab"),
  ],
};

export const hubWing: QaWing = {
  maps: [hubMap],
  entities: [
    npc("qa_hub_curator", "QA Curator", "qa_dlg_hub_curator"),
    npc("qa_hub_scout", "QA Scout", "qa_dlg_hub_scout"),
    npc("qa_hub_scribe", "QA Scribe", "qa_dlg_feature_matrix"),
  ],
  dialogue: [
    say(
      "qa_dlg_suite_intro",
      "QA Curator",
      "Engine QA Suite online. Ten labs, one hub. The chemistry wing is north and east — flood a chamber, race two liquids, burn a gallery, vent a vault. The new Perception Lab is available from my teleport menu. When all four releases have fired, the completion terminal behind me unlocks.",
      [{ text: "Begin." }],
    ),
    dlg("qa_dlg_hub_curator", "QA Curator", [
      {
        id: "start",
        speaker: "QA Curator",
        text: "Walk the doorways or take a teleport. Every proof narrates itself on a sign when you arrive.",
        options: [
          { text: "Read the feature matrix.", trigger_cutscene: "qa_cut_read_feature_matrix" },
          { text: "→ Flood Chamber (water release).", trigger_cutscene: "qa_cut_to_flood" },
          { text: "→ Viscosity Race (water vs honey).", trigger_cutscene: "qa_cut_to_visc" },
          { text: "→ Burn Gallery (fire + moat).", trigger_cutscene: "qa_cut_to_fire" },
          { text: "→ Miasma Vault (gas).", trigger_cutscene: "qa_cut_to_gas" },
          { text: "→ Story Lab.", trigger_cutscene: "qa_cut_to_story" },
          { text: "→ Combat Lab.", trigger_cutscene: "qa_cut_to_combat" },
          { text: "→ Emotion Lab.", trigger_cutscene: "qa_cut_to_emotion" },
          { text: "→ World Systems / Movement.", trigger_cutscene: "qa_cut_to_world" },
          { text: "→ Perception Lab.", trigger_cutscene: "qa_cut_to_perception" },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_hub_scout",
      "QA Scout",
      "The doorways are real map exits; the curator's menu uses cutscene teleports. Both land on named spawns. Fog, held-move, and footprint collision are live everywhere — try hugging a wall: your body is three fine cells wide.",
    ),
    say(
      "qa_dlg_feature_matrix",
      "QA Scribe",
      "The matrix document lists every proof in the suite and where it lives.",
      [{ text: "Open it.", trigger_cutscene: "qa_cut_read_feature_matrix" }, { text: "Later." }],
    ),
    say(
      "qa_dlg_hub_north_signs",
      "North Doors",
      "West door: MIASMA VAULT. Center: FLOOD CHAMBER. East: VISCOSITY RACE.",
    ),
    say(
      "qa_dlg_hub_east_signs",
      "East Doors",
      "North door: EMOTION LAB. Center: BURN GALLERY. South: COMBAT LAB.",
    ),
    say(
      "qa_dlg_hub_west_signs",
      "West Doors",
      "Center: WORLD SYSTEMS. South: MOVEMENT LAB. The south door leads to the STORY LAB.",
    ),
  ],
  cutscenes: [
    {
      id: "qa_cut_hub_intro",
      display_name: "QA Hub Intro",
      is_blocking: true,
      actions: [
        { type: "screen_fade", fade: "in", duration: 500 },
        { type: "set_switch", switch_id: "qa_suite_loaded", switch_value: true },
        { type: "give_currency", amount: 25 },
        { type: "show_dialogue", dialogue_id: "qa_dlg_suite_intro", node_id: "start" },
      ],
    },
    {
      id: "qa_cut_read_feature_matrix",
      display_name: "Read Feature Matrix",
      is_blocking: true,
      actions: [
        { type: "read_document", document_id: "qa_doc_feature_matrix" },
        { type: "set_switch", switch_id: "qa_feature_matrix_read", switch_value: true },
      ],
    },
    { id: "qa_cut_open_save_menu", display_name: "Save Menu", is_blocking: true, actions: [{ type: "open_save_menu" }] },
    { id: "qa_cut_to_flood", display_name: "To Flood", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_flood_lab", cell: [0, 6], facing: [0, -1] }] },
    { id: "qa_cut_to_visc", display_name: "To Viscosity", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_visc_lab", cell: [0, 7], facing: [0, -1] }] },
    { id: "qa_cut_to_fire", display_name: "To Fire", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_fire_lab", cell: [0, 7], facing: [0, -1] }] },
    { id: "qa_cut_to_gas", display_name: "To Gas", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_gas_lab", cell: [0, 7], facing: [0, -1] }] },
    { id: "qa_cut_to_story", display_name: "To Story", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_story_lab", cell: [0, 6], facing: [0, -1] }] },
    { id: "qa_cut_to_combat", display_name: "To Combat", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_combat_lab", cell: [0, 6], facing: [0, -1] }] },
    { id: "qa_cut_to_emotion", display_name: "To Emotion", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_emotion_lab", cell: [0, 6], facing: [0, -1] }] },
    { id: "qa_cut_to_world", display_name: "To World", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_world_lab", cell: [0, 6], facing: [0, -1] }] },
    { id: "qa_cut_to_perception", display_name: "To Perception", is_blocking: true, actions: [{ type: "teleport_player", map_id: "qa_perception_lab", cell: [0, 8], facing: [0, -1] }] },
    {
      id: "qa_cut_suite_complete",
      display_name: "Suite Complete",
      is_blocking: true,
      actions: [
        { type: "set_switch", switch_id: "qa_suite_complete", switch_value: true },
        { type: "game_end", ending_id: "qa_ending_complete", title: "QA SUITE COMPLETE" },
      ],
    },
  ],
  documents: [
    {
      id: "qa_doc_feature_matrix",
      display_name: "QA Feature Matrix",
      content:
        "FLOOD CHAMBER: button-released tank, height-aware ooze, basin pooling, dry walkways, dormant settling. VISCOSITY RACE: water (flow 3) vs honey (flow 1) from one valve. BURN GALLERY: oil-trail ignition, grass/crate spread, wet-moat firebreak, scorch residue, douse/foam counters. MIASMA VAULT: gas diffusion around baffles, Toxic exposure, full dissipation. STORY LAB: gated dialogue (switch/quest/item/faction/hour), switch_change trigger, branch control flow, shop pricing, party, factions, rep-gated annex. COMBAT LAB: enemy archetypes, macro-authored AoE on the fine grid, cover/high ground, overwatch, shove-through-fire knockback, stealth lane. EMOTION LAB: attend readings, console/yell verbs, paralyzed/flee/defend behaviors, fire-to-fear crosstalk, grid lens. WORLD LAB: survival drain, workstation processes, keyed caches, fine-cell pushables through water, schedules, barks. MOVEMENT LAB: one-tile corridors, stairs vs cliff, LOS/fog walls, macro-entry plates, portal, doors. PERCEPTION LAB: zero ambient light, carried/placed/thrown lamp stimuli, fixed lamp fallback, sight/hearing/light-glass channels, smoke obscurance, wall occlusion, memory/search, silent artifact control. HUB: save terminal, keyed cache, completion terminal (unlocks after all four chemistry releases).",
    },
  ],
  quests: [
    {
      id: "qa_quest_grand_tour",
      display_name: "QA Grand Tour",
      description: "Fire every headline proof in the suite: read the matrix, release all four chemistry demonstrations, drop a hostile, and recruit the candidate.",
      objectives: [
        { id: "qa_obj_matrix", description: "Read the feature matrix.", type: "interact", target_id: "qa_doc_feature_matrix", count: 1 },
        { id: "qa_obj_flood", description: "Release the flood tank.", type: "custom", target_id: "qa_flood_released", count: 1 },
        { id: "qa_obj_race", description: "Start the viscosity race.", type: "custom", target_id: "qa_race_released", count: 1 },
        { id: "qa_obj_fire", description: "Light the burn gallery.", type: "custom", target_id: "qa_fire_released", count: 1 },
        { id: "qa_obj_gas", description: "Vent the miasma vault.", type: "custom", target_id: "qa_gas_released", count: 1 },
        { id: "qa_obj_kill", description: "Defeat the melee proof.", type: "kill", target_id: "qa_enemy_melee", count: 1 },
        { id: "qa_obj_party", description: "Recruit the party candidate.", type: "talk", target_id: "qa_party_candidate", count: 1 },
      ],
    },
  ],
  endings: [
    {
      id: "qa_ending_complete",
      display_name: "QA Suite Complete",
      condition: { switch: "qa_suite_complete" },
      title: "QA SUITE COMPLETE",
      body: "All four chemistry releases fired and the suite's proofs held: the fine grid moves, floods, races, burns, vents, fights, feels, and remembers.",
    },
  ],
  switches: {
    qa_suite_loaded: false,
    qa_feature_matrix_read: false,
    qa_suite_complete: false,
  },
};
