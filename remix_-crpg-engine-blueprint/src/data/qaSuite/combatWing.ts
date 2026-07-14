// ── QA combat + emotion wing ─────────────────────────────────────────────────
// qa_combat_lab — enemy archetypes, macro→fine AoE skill shapes against dummy
//   rows, cover/high-ground, overwatch, a shove lane that knocks a hostile
//   across a burning strip (fine knockback dragging through hazards), and a
//   lit stealth-watcher lane.
// qa_emotion_lab — the Alderamontico layer: attend readings, yell/console
//   verbs, paralyzed / flee / defend-attachment behaviors, physical→emotional
//   crosstalk (a creature standing in fire panics), and a grid region lens.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  dlg,
  entityPlacement,
  hostile,
  hubReturnExit,
  npc,
  prop,
  roomCells,
  say,
  sign,
  stampCells,
  stampRect,
} from "./shared";

// ── Combat lab ───────────────────────────────────────────────────────────────
const combatCells = (() => {
  const o: CellOverrides = {};
  // High ground overlooking the arena.
  stampCells(o, [[0, -3], [1, -3]], { height: 1, visual_height: 0.7, terrain: "high_ground" });
  // The shove lane: a burning strip the mark gets knocked across.
  stampCells(o, [[1, 2], [2, 2]], { surface_tag: "firehazard", terrain: "firehazard" });
  // Lit stealth lane watched from the west.
  stampRect(o, -4, 4, -1, 4, { tag: "stealth_light" });
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const combatMap = {
  id: "qa_combat_lab",
  display_name: "QA Combat Lab",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 6] as [number, number], facing: [0, -1] as [number, number] }],
  cells: combatCells,
  props: [],
  custom_object_placements: [
    sign("obj_training_beacon", [-2, 5], "qa_dlg_combat_trainer_sign"),
    // Cover crates for the tactical snapshot's directional cover math.
    prop("obj_crate", [-2, -1]),
    prop("obj_crate", [2, -1]),
  ],
  entity_placements: [
    entityPlacement("qa_combat_trainer", [0, 5], [0, -1]),
    entityPlacement("qa_enemy_melee", [-4, -4], [1, 0]),
    entityPlacement("qa_enemy_bruiser", [-2, -6], [0, 1]),
    entityPlacement("qa_enemy_status", [2, -5], [-1, 0]),
    entityPlacement("qa_enemy_overwatch", [5, -6], [0, 1]),
    // AoE dummy row (line bolt east) and pocket (cone/cross/block).
    entityPlacement("qa_dummy_a", [3, -2], [-1, 0]),
    entityPlacement("qa_dummy_b", [4, -2], [-1, 0]),
    entityPlacement("qa_dummy_c", [5, -2], [-1, 0]),
    // The shove mark stands at the west end of the burning strip.
    entityPlacement("qa_enemy_shove_mark", [0, 2], [-1, 0]),
    // Stealth watcher stares down the lit lane.
    entityPlacement("qa_stealth_watcher", [-5, 4], [1, 0]),
    entityPlacement("qa_secret_observer", [-6, 6], [1, 0]),
  ],
  item_placements: [
    { id: "qa_combat_tonic", item_id: "qa_focus_tonic", cell: [3, 5] as [number, number], count: 1 },
  ],
  container_placements: [],
  regions: [
    {
      id: "qa_arena_region",
      display_name: "Arena Region",
      neutral: false,
      passive_checks: [],
      alderamontico_grid: {
        enabled: true,
        magnitude: 2,
        lens_entity_id: "qa_enemy_status",
        lens_radius: 5,
        lens_multiplier: 2,
      },
    },
  ],
  triggers: [
    {
      id: "qa_hide_observer_on_load",
      type: "on_load" as const,
      conditions: [],
      cutscene_id: "qa_cut_hide_observer",
      once: true,
    },
  ],
  exits: [hubReturnExit([0, 8])],
};

// ── Emotion lab ──────────────────────────────────────────────────────────────
const emotionCells = (() => {
  const o: CellOverrides = {};
  // The crosstalk dummy stands in an authored fire — it panics on its own.
  stampCells(o, [[-5, -5]], { surface_tag: "firehazard", terrain: "firehazard" });
  stampRect(o, -7, -7, 7, 7, { region_id: "qa_emotion_region" });
  stampCells(o, [[0, 8]], { ...DOORWAY, region_id: undefined });
  return roomCells(-8, 8, -8, 8, o);
})();

const emotionMap = {
  id: "qa_emotion_lab",
  display_name: "QA Emotion Lab",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 6] as [number, number], facing: [0, -1] as [number, number] }],
  cells: emotionCells,
  props: [],
  custom_object_placements: [
    sign("obj_terminal", [3, 6], "qa_dlg_emotion_sign"),
    // The guardian's shrine — it will defend this and never give chase.
    prop("obj_stone_altar", [0, -6]),
  ],
  entity_placements: [
    entityPlacement("qa_attend_witness", [4, 0], [-1, 0]),
    entityPlacement("qa_griever", [-3, 0], [1, 0]),
    entityPlacement("qa_skittish", [3, 3], [-1, 0]),
    entityPlacement("qa_guardian", [0, -4], [0, 1]),
    entityPlacement("qa_burning_dummy", [-5, -5], [0, 1]),
  ],
  item_placements: [],
  container_placements: [],
  regions: [
    {
      id: "qa_emotion_region",
      display_name: "Emotion Grid Region",
      neutral: true,
      passive_checks: [],
      alderamontico_grid: {
        enabled: true,
        magnitude: 1,
        lens_entity_id: "qa_guardian",
        lens_radius: 4,
        lens_multiplier: 2,
      },
      emotional_profile: { baseline_axis_offsets: { arousal: 6, reverence: 4 } },
    },
  ],
  triggers: [],
  exits: [hubReturnExit([0, 8])],
};

export const combatWing: QaWing = {
  maps: [combatMap, emotionMap],
  entities: [
    npc("qa_combat_trainer", "Combat Trainer", "qa_dlg_combat_trainer"),
    hostile("qa_enemy_melee", "Melee Proof", { hp: 12, attack: 3, defense: 1, speed: 8, xp: 8 }),
    hostile("qa_enemy_bruiser", "Bruiser Proof", { hp: 20, attack: 5, defense: 2, speed: 6, xp: 14 }),
    hostile("qa_enemy_status", "Status Proof", { hp: 16, attack: 4, defense: 1, speed: 10, xp: 12 }, {
      emotional_axes: { valence: 18, arousal: 75, grief: 45 },
      attend_node: {
        id: "qa_attend_status_enemy",
        target: "qa_enemy_status",
        composure: 4,
        readings: [
          {
            id: "qa_status_false",
            text: "It is fearless.",
            truth: "false",
            requiresAttention: 0,
            effect: { set_switch: "qa_attend_false_seen" },
          },
          {
            id: "qa_status_true",
            text: "It is repeating the last hit before it lands.",
            truth: "true",
            requiresAttention: 2,
            effect: {
              set_switch: "qa_attend_true_seen",
              target_emotional_impulse: { arousal: -8, valence: 4 },
            },
          },
        ],
      },
    }),
    hostile("qa_enemy_overwatch", "Overwatch Proof", { hp: 18, attack: 4, defense: 2, speed: 8, xp: 14 }),
    hostile("qa_enemy_shove_mark", "Shove Mark", { hp: 14, attack: 2, defense: 1, speed: 7, xp: 10 }),
    hostile("qa_dummy_a", "Dummy A", { hp: 6, attack: 1, defense: 0, speed: 4, xp: 2 }),
    hostile("qa_dummy_b", "Dummy B", { hp: 6, attack: 1, defense: 0, speed: 4, xp: 2 }),
    hostile("qa_dummy_c", "Dummy C", { hp: 6, attack: 1, defense: 0, speed: 4, xp: 2 }),
    hostile("qa_stealth_watcher", "Stealth Watcher", { hp: 10, attack: 2, defense: 1, speed: 9, xp: 6 }),
    npc("qa_secret_observer", "Hidden Observer", "qa_dlg_secret_observer"),
    // Emotion lab cast.
    npc("qa_attend_witness", "Haunted Witness", "qa_dlg_attend_witness", {
      emotional_axes: { grief: 55, arousal: 40, valence: 35 },
      attend_node: {
        id: "qa_attend_witness_node",
        target: "qa_attend_witness",
        composure: 3,
        readings: [
          {
            id: "qa_witness_surface",
            text: "They are merely tired.",
            truth: "false",
            requiresAttention: 0,
            effect: { set_switch: "qa_witness_false_seen" },
          },
          {
            id: "qa_witness_truth",
            text: "They rehearse one moment over and over — the door they did not open.",
            truth: "true",
            requiresAttention: 2,
            effect: {
              set_switch: "qa_witness_true_seen",
              target_emotional_impulse: { grief: -6, valence: 3 },
            },
          },
        ],
      },
    }),
    // Grief 92 ≥ 85 → paralyzed until consoled below the threshold.
    npc("qa_griever", "Grieving Pilgrim", "qa_dlg_griever", {
      emotional_axes: { grief: 92, valence: 20, arousal: 30 },
    }),
    // One yell (+32 arousal / −14 valence) tips this one into flee.
    npc("qa_skittish", "Skittish Acolyte", "qa_dlg_skittish", {
      emotional_axes: { arousal: 58, valence: 40 },
    }),
    // Attachment 95 + calm arousal → defend_attachment: strikes what comes
    // close to its shrine but never gives chase.
    hostile("qa_guardian", "Shrine Guardian", { hp: 22, attack: 5, defense: 2, speed: 7, xp: 16 }, {
      emotional_axes: { attachment: 95, arousal: 40, valence: 45, reverence: 70 },
    }),
    npc("qa_burning_dummy", "Smoldering Penitent", "qa_dlg_burning_dummy"),
  ],
  dialogue: [
    dlg("qa_dlg_combat_trainer", "Combat Trainer", [
      {
        id: "start",
        speaker: "Combat Trainer",
        text: "The arena proves initiative, footprint melee reach, macro-authored AoE shapes resolved on the fine grid, statuses, XP, cover, high ground, overwatch, and the shove lane. Take the kit.",
        options: [
          { text: "Grant the QA skill kit.", trigger_cutscene: "qa_cut_grant_combat_kit" },
          { text: "Heal and restore the party.", trigger_cutscene: "qa_cut_restore_party" },
          { text: "Reveal the hidden observer.", trigger_cutscene: "qa_cut_reveal_observer" },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_combat_trainer_sign",
      "Arena Sign",
      "Line Bolt the dummy row to the east. Shove the marked hostile ACROSS the burning strip — knockback resolves cell by cell, so it drags through the fire. The watcher guards the lit lane: stay out of the light.",
    ),
    say(
      "qa_dlg_secret_observer",
      "Hidden Observer",
      "Hidden by an on-load cutscene, revealed by another — set_entity_hidden works both ways.",
    ),
    say(
      "qa_dlg_emotion_sign",
      "Emotion Lab Sign",
      "Attend the witness (two readings, one true). Console the pilgrim — grief past 85 paralyzes, and consolation frees them. Yell at the acolyte and watch them bolt. The guardian will kill for its shrine but never leave it. The penitent stands in fire: body heat becomes panic on its own.",
    ),
    say(
      "qa_dlg_attend_witness",
      "Haunted Witness",
      "Attend me and choose what you believe. Attention spent changes which readings you can even see.",
    ),
    say("qa_dlg_griever", "Grieving Pilgrim", "…", [{ text: "(Console them with the command wheel.)" }]),
    say(
      "qa_dlg_skittish",
      "Skittish Acolyte",
      "Please don't raise your voice. Truly. My composure is authored at the edge of a cliff.",
    ),
    say(
      "qa_dlg_burning_dummy",
      "Smoldering Penitent",
      "I volunteered. The fire under me feeds heat into my body state, and my body state feeds fear into my emotional axes. Watch me break.",
    ),
  ],
  cutscenes: [
    {
      id: "qa_cut_grant_combat_kit",
      display_name: "Grant Combat Kit",
      is_blocking: true,
      actions: [
        { type: "learn_skill", skill_id: "qa_skill_quick_strike" },
        { type: "learn_skill", skill_id: "qa_skill_line_bolt" },
        { type: "learn_skill", skill_id: "qa_skill_cone_flame" },
        { type: "learn_skill", skill_id: "qa_skill_cross_chill" },
        { type: "learn_skill", skill_id: "qa_skill_block_guard" },
        { type: "learn_skill", skill_id: "qa_skill_first_aid" },
        { type: "give_item", item_id: "qa_focus_tonic", amount: 3 },
        { type: "modify_player_stats", stats: { max_hp: 8, hp: 8, max_mp: 8, mp: 8, attack: 1 } },
        { type: "set_switch", switch_id: "qa_combat_kit_granted", switch_value: true },
      ],
    },
    {
      id: "qa_cut_restore_party",
      display_name: "Restore Party",
      is_blocking: true,
      actions: [
        { type: "heal_player", amount: 999 },
        { type: "restore_party" },
      ],
    },
    {
      id: "qa_cut_hide_observer",
      display_name: "Hide Observer",
      is_blocking: true,
      actions: [{ type: "set_entity_hidden", entity_id: "qa_secret_observer", hidden: true }],
    },
    {
      id: "qa_cut_reveal_observer",
      display_name: "Reveal Observer",
      is_blocking: true,
      actions: [
        { type: "set_entity_hidden", entity_id: "qa_secret_observer", hidden: false },
        { type: "set_switch", switch_id: "qa_hidden_observer_revealed", switch_value: true },
      ],
    },
  ],
  skills: [
    {
      id: "qa_skill_quick_strike",
      display_name: "QA Quick Strike",
      description: "Single-target damage proof.",
      ability_kind: "skill",
      ability_page: "combat",
      icon: "sparkles",
      sort_order: 60,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 0,
      element: "physical",
      targeting: "single",
      range: 1,
      payloads: [{ type: "damage", value: 6 }],
    },
    {
      id: "qa_skill_line_bolt",
      display_name: "QA Line Bolt",
      description: "Line targeting (macro-authored, fine-rasterized) and shock proof.",
      ability_kind: "skill",
      ability_page: "elemental",
      icon: "zap",
      sort_order: 80,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 2,
      element: "shock",
      targeting: "line",
      range: 5,
      payloads: [
        { type: "damage", value: 5 },
        { type: "status", status_effect: "slow", value: 2 },
      ],
    },
    {
      id: "qa_skill_cone_flame",
      display_name: "QA Cone Flame",
      description: "Cone targeting, fire element, burn status proof.",
      ability_kind: "skill",
      ability_page: "elemental",
      icon: "thermometer",
      sort_order: 90,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 3,
      element: "fire",
      targeting: "cone",
      range: 4,
      payloads: [
        { type: "damage", value: 4 },
        { type: "status", status_effect: "burn", value: 2 },
      ],
    },
    {
      id: "qa_skill_cross_chill",
      display_name: "QA Cross Chill",
      description: "Cross targeting and cold control proof.",
      ability_kind: "skill",
      ability_page: "elemental",
      icon: "thermometer",
      sort_order: 100,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 3,
      element: "cold",
      targeting: "cross",
      range: 3,
      payloads: [
        { type: "damage", value: 3 },
        { type: "status", status_effect: "weaken", value: 2 },
      ],
    },
    {
      id: "qa_skill_block_guard",
      display_name: "QA Guard Field",
      description: "Block targeting (3×3 macro → 9×9 fine) and defensive status proof.",
      ability_kind: "skill",
      ability_page: "combat",
      icon: "shield",
      sort_order: 70,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 2,
      element: "none",
      targeting: "block",
      range: 2,
      payloads: [{ type: "status", status_effect: "guard", value: 2 }],
    },
    {
      id: "qa_skill_first_aid",
      display_name: "QA First Aid",
      description: "Healing payload proof.",
      ability_kind: "skill",
      ability_page: "combat",
      icon: "heart",
      sort_order: 80,
      starts_unlocked: true,
      ap_cost: 1000,
      mp_cost: 2,
      element: "none",
      targeting: "single",
      range: 3,
      payloads: [{ type: "heal", value: 8 }],
    },
  ],
  switches: {
    qa_combat_kit_granted: false,
    qa_hidden_observer_revealed: false,
    qa_attend_false_seen: false,
    qa_attend_true_seen: false,
    qa_witness_false_seen: false,
    qa_witness_true_seen: false,
  },
};
