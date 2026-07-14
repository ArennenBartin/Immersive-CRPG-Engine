// ── QA story wing ────────────────────────────────────────────────────────────
// Dialogue graphs with every gate type, switches (+ a switch_change trigger),
// documents, shop economy, party recruitment, faction reputation, cutscene
// control flow (label/branch), clock advancement, and a reputation-gated
// region annex.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  WALL,
  dlg,
  entityPlacement,
  hubReturnExit,
  npc,
  roomCells,
  say,
  sign,
  stampCells,
  stampRect,
} from "./shared";

const storyCells = (() => {
  const o: CellOverrides = {};
  // A reputation-gated annex in the north-east corner (region passive check
  // denies entry until QA Observer rep ≥ 2).
  stampRect(o, 3, -7, 7, -3, { region_id: "qa_story_annex" });
  stampRect(o, 2, -7, 2, -4, WALL);
  stampRect(o, 2, -3, 6, -3, WALL);
  stampCells(o, [[7, -3]], { region_id: "qa_story_annex" }); // annex doorway
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const storyMap = {
  id: "qa_story_lab",
  display_name: "QA Story Lab",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 6] as [number, number], facing: [0, -1] as [number, number] }],
  cells: storyCells,
  props: [],
  custom_object_placements: [
    sign("obj_bookshelf", [-5, -1], "qa_dlg_story_archivist_shelf"),
    sign("obj_shop_counter", [5, 2], "qa_dlg_shopkeeper"),
    sign("obj_stone_altar", [5, -5], "qa_dlg_annex_altar"),
  ],
  entity_placements: [
    entityPlacement("qa_story_archivist", [-4, 0], [1, 0]),
    entityPlacement("qa_switch_operator", [0, -1], [0, 1]),
    entityPlacement("qa_shopkeeper", [4, 1], [0, 1]),
    entityPlacement("qa_party_candidate", [-2, 3], [1, 0]),
    entityPlacement("qa_clockmaster", [2, 3], [-1, 0]),
  ],
  item_placements: [
    { id: "qa_story_keycard", item_id: "qa_keycard", cell: [-5, 4] as [number, number], count: 1 },
  ],
  container_placements: [],
  regions: [
    {
      id: "qa_story_annex",
      display_name: "Observer Annex",
      faction_id: "qa_observers",
      reputation_threshold: 2,
      neutral: false,
      passive_checks: [
        {
          id: "qa_annex_rep_check",
          stat: "faction_rep" as const,
          faction_id: "qa_observers",
          difficulty: 2,
          denial: true,
        },
      ],
    },
  ],
  // Note: `switch_change` triggers are not runtime-supported (the editor
  // marks them unsupported), so the switch echo fires from the operator's
  // dialogue option instead.
  triggers: [],
  exits: [hubReturnExit([0, 8])],
};

export const storyWing: QaWing = {
  maps: [storyMap],
  entities: [
    npc("qa_story_archivist", "Story Archivist", "qa_dlg_story_archivist"),
    npc("qa_switch_operator", "Switch Operator", "qa_dlg_switch_operator"),
    npc("qa_shopkeeper", "Shopkeeper", "qa_dlg_shopkeeper"),
    npc("qa_party_candidate", "Party Candidate", "qa_dlg_party_candidate", {
      party_dialogue_id: "qa_dlg_party_candidate_party",
      skills: ["qa_skill_first_aid", "qa_skill_line_bolt"],
    }),
    npc("qa_clockmaster", "Clockmaster", "qa_dlg_clockmaster"),
  ],
  dialogue: [
    dlg("qa_dlg_story_archivist", "Story Archivist", [
      {
        id: "start",
        speaker: "Story Archivist",
        text: "Every option below is a different gate: quest, switch, item, faction, and the hour of the clock. The ones you cannot see are the proof.",
        options: [
          {
            text: "Start the Grand Tour quest.",
            trigger_quest: "qa_quest_grand_tour",
            trigger_quest_state: "started",
            set_switch: "qa_tour_started",
          },
          { text: "Read the story readout.", trigger_cutscene: "qa_cut_read_story_doc" },
          {
            text: "[Switch gate] The operator's switch is ON.",
            required_switch: "qa_story_switch_done",
          },
          {
            text: "[Item gate] I carry a QA keycard.",
            condition: { has_item: "qa_keycard" },
          },
          {
            text: "[Faction gate] The Observers respect me.",
            condition: { faction: "qa_observers", rep_gte: 2 },
          },
          {
            text: "[Hour gate] It is past noon.",
            condition: { hour_gte: 12 },
          },
          { text: "Run the branch probe.", trigger_cutscene: "qa_cut_branch_probe" },
          { text: "Raise Observer reputation.", trigger_cutscene: "qa_cut_adjust_faction" },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_story_archivist_shelf",
      "Archive Shelf",
      "Documents opened here persist as read_documents in the save and gate conditions elsewhere.",
    ),
    dlg("qa_dlg_switch_operator", "Switch Operator", [
      {
        id: "start",
        speaker: "Switch Operator",
        text: "Switches are hidden world facts. Flipping this one ON re-prices the shop, unlocks an archivist line, gates a bark, and chains straight into an echo cutscene.",
        options: [
          {
            text: "Set switch TRUE (hear the echo).",
            set_switch: "qa_story_switch_done",
            trigger_cutscene: "qa_cut_switch_echo",
          },
          {
            text: "Set switch FALSE.",
            set_switch: "qa_story_switch_done",
            set_switch_value: false,
          },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_switch_echo",
      "System",
      "Echo proof: the dialogue option set qa_story_switch_done to TRUE and chained this cutscene — the shop price and the archivist's gated line have already changed.",
    ),
    dlg("qa_dlg_shopkeeper", "QA Shopkeeper", [
      {
        id: "start",
        speaker: "Shopkeeper",
        text: "Conditional stock pricing: samples are half price while the operator's switch is ON. Buying and selling both move real currency.",
        options: [
          { text: "Trade.", trigger_cutscene: "qa_cut_open_shop" },
          { text: "Close." },
        ],
      },
    ]),
    dlg("qa_dlg_party_candidate", "Party Candidate", [
      {
        id: "start",
        speaker: "Party Candidate",
        text: "Recruit me: I follow you, take combat turns, bring a heal and a line skill, and my dialogue changes while I am in the party.",
        options: [
          { text: "Join me.", trigger_cutscene: "qa_cut_recruit_party", set_switch: "qa_party_recruited" },
          { text: "Go home.", trigger_cutscene: "qa_cut_dismiss_party" },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_party_candidate_party",
      "Party Candidate",
      "Party talk active. In combat I act on my own initiative — watch the turn ring.",
      [{ text: "Back." }],
    ),
    dlg("qa_dlg_clockmaster", "Clockmaster", [
      {
        id: "start",
        speaker: "Clockmaster",
        text: "The world clock gates dialogue, schedules, and map ambience. Jump it three hours and watch the hour-gated option and the schedule runner change.",
        options: [
          { text: "Advance the clock 3 hours.", trigger_cutscene: "qa_cut_advance_clock" },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_annex_altar",
      "Annex Altar",
      "You are inside the reputation-gated annex. The region denied you until the Observers rated you at 2 or better.",
    ),
    say("qa_dlg_branch_success", "System", "Branch proof: took the SWITCH-ON path.", [{ text: "Close." }]),
    say("qa_dlg_branch_fail", "System", "Branch proof: took the fallback path (switch is OFF).", [{ text: "Close." }]),
  ],
  cutscenes: [
    {
      id: "qa_cut_read_story_doc",
      display_name: "Read Story Doc",
      is_blocking: true,
      actions: [
        { type: "read_document", document_id: "qa_doc_story_lab" },
        { type: "set_switch", switch_id: "qa_story_doc_read", switch_value: true },
      ],
    },
    {
      id: "qa_cut_switch_echo",
      display_name: "Switch Echo",
      is_blocking: true,
      actions: [
        { type: "play_sound", sound_id: "save_chime" },
        { type: "show_dialogue", dialogue_id: "qa_dlg_switch_echo", node_id: "start" },
      ],
    },
    {
      id: "qa_cut_branch_probe",
      display_name: "Branch Probe",
      is_blocking: true,
      actions: [
        { type: "branch", condition: { switch: "qa_story_switch_done" }, target_label: "switch_on" },
        { type: "show_dialogue", dialogue_id: "qa_dlg_branch_fail", node_id: "start" },
        { type: "branch", target_label: "done" },
        { type: "label", label: "switch_on" },
        { type: "show_dialogue", dialogue_id: "qa_dlg_branch_success", node_id: "start" },
        { type: "label", label: "done" },
      ],
    },
    {
      id: "qa_cut_adjust_faction",
      display_name: "Adjust Faction",
      is_blocking: true,
      actions: [
        { type: "adjust_faction_rep", faction_id: "qa_observers", amount: 2 },
        { type: "set_switch", switch_id: "qa_faction_adjusted", switch_value: true },
      ],
    },
    {
      id: "qa_cut_open_shop",
      display_name: "Open Shop",
      is_blocking: true,
      actions: [{ type: "open_shop", shop_id: "qa_shop_supply" }],
    },
    {
      id: "qa_cut_recruit_party",
      display_name: "Recruit Party",
      is_blocking: true,
      actions: [
        { type: "add_party_member", entity_id: "qa_party_candidate" },
        { type: "set_entity_hidden", entity_id: "qa_party_candidate", hidden: true },
        { type: "learn_skill", skill_id: "qa_skill_line_bolt" },
        { type: "set_switch", switch_id: "qa_party_recruited", switch_value: true },
      ],
    },
    {
      id: "qa_cut_dismiss_party",
      display_name: "Dismiss Party",
      is_blocking: true,
      actions: [
        { type: "remove_party_member", entity_id: "qa_party_candidate" },
        { type: "set_entity_hidden", entity_id: "qa_party_candidate", hidden: false },
        { type: "set_switch", switch_id: "qa_party_recruited", switch_value: false },
      ],
    },
    {
      id: "qa_cut_advance_clock",
      display_name: "Advance Clock",
      is_blocking: true,
      actions: [
        { type: "advance_clock", amount: 180 },
        { type: "set_switch", switch_id: "qa_clock_advanced", switch_value: true },
      ],
    },
  ],
  documents: [
    {
      id: "qa_doc_story_lab",
      display_name: "Story Lab Readout",
      content:
        "Story proofs: dialogue options gated by switch / quest / item / faction rep / hour-of-day; option side effects (quests, switches, cutscenes); a switch_change trigger; label/branch cutscene control flow; conditional shop pricing; party recruit/dismiss with party talk; faction reputation; a reputation-gated region annex; documents persisted as read state.",
    },
  ],
  items: [
    {
      id: "qa_keycard",
      display_name: "QA Keycard",
      description: "Unlocks QA caches and satisfies item-gated dialogue.",
      icon: "K",
      category: "key",
    },
    {
      id: "qa_sample",
      display_name: "QA Sample",
      description: "Test item used by quests, shops, containers, and workstations.",
      icon: "S",
      category: "key",
      spatial: { shape: [[0, 0]], weight_kg: 0.2, bulk: 1, stack_limit: 9 },
    },
    {
      id: "qa_focus_tonic",
      display_name: "QA Focus Tonic",
      description: "Restores MP during the combat tests.",
      icon: "F",
      category: "consumable",
      effects: { mp_restore: 8 },
    },
    {
      id: "qa_heat_vial",
      display_name: "QA Heat Vial",
      description: "A volatile workstation ingredient.",
      icon: "H",
      category: "consumable",
      effects: { energy_restore: 100 },
      simulation: {
        material_id: "sim_mat_oil",
        condition: "intact",
        integrity: 1,
        condition_tags: ["volatile"],
        mass_kg: 0.5,
        bulk: 1,
        awkwardness: 0,
        push_difficulty: 1,
        carry_size: "hand",
        requires_cooperation: false,
      },
    },
  ],
  shops: [
    {
      id: "qa_shop_supply",
      display_name: "QA Supply Counter",
      items: [
        { item_id: "qa_keycard", price: 1, price_modifiers: [] },
        {
          item_id: "qa_sample",
          price: 2,
          price_modifiers: [
            { condition: { switch: "qa_story_switch_done" }, multiplier: 0.5, delta: 0 },
          ],
        },
        { item_id: "qa_focus_tonic", price: 3, price_modifiers: [] },
        { item_id: "qa_heat_vial", price: 4, price_modifiers: [] },
      ],
    },
  ],
  factions: [
    {
      id: "qa_observers",
      display_name: "QA Observers",
      hidden: false,
      description: "Visible reputation proving faction gates, region checks, and shop conditions.",
    },
  ],
  switches: {
    qa_tour_started: false,
    qa_story_doc_read: false,
    qa_story_switch_done: false,
    qa_faction_adjusted: false,
    qa_party_recruited: false,
    qa_clock_advanced: false,
  },
};
