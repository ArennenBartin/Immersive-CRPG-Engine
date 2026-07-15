// ── QA world-systems + movement wing ─────────────────────────────────────────
// qa_world_lab — survival drain region, workstation processes, keyed/plain
//   containers, a pushable crate driven across a wet strip (fine-cell nudging
//   through chemistry), an hourly schedule runner, and ambient barks.
// qa_move_lab — the fine-grid geometry proofs: 1-macro corridors and pillar
//   gaps (3×3 footprints), a walkable staircase vs a blocked cliff, LOS/fog
//   walls, macro-entry step plates, doors, an in-map portal pair, and item
//   pickups.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  WALL,
  dlg,
  entityPlacement,
  hubReturnExit,
  exit,
  npc,
  prop,
  roomCells,
  say,
  sign,
  stampCells,
  stampRect,
  stepPlate,
} from "./shared";

// ── World systems lab ────────────────────────────────────────────────────────
const worldCells = (() => {
  const o: CellOverrides = {};
  // Survival drain region: the "long watch" gallery along the west wall.
  stampRect(o, -7, -7, -4, 0, { region_id: "qa_survival_region" });
  // Wet strip for the pushable-crate proof.
  stampRect(o, 1, 1, 3, 1, { surface_tag: "water", terrain: "water" });
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const worldMap = {
  id: "qa_world_lab",
  display_name: "QA World Systems Lab",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 6] as [number, number], facing: [0, -1] as [number, number] }],
  cells: worldCells,
  props: [],
  custom_object_placements: [
    prop("obj_mechanism_workbench", [0, -2]),
    sign("obj_terminal", [3, 6], "qa_dlg_world_sign"),
    // The pushable crate starts north of the wet strip; shove it through and
    // it drags a wet trail cell by cell.
    prop("obj_crate", [2, 0]),
    prop("obj_bed", [-6, -6]),
    prop("obj_small_table", [-5, -4]),
  ],
  entity_placements: [
    entityPlacement("qa_quartermaster", [-2, 4], [1, 0]),
    entityPlacement("qa_schedule_runner", [4, 4], [-1, 0], {
      schedule: [
        { hour: 8, cell: [4, 4] },
        { hour: 14, cell: [4, -4] },
        { hour: 20, cell: [-2, -2] },
      ],
    }),
    entityPlacement("qa_bark_a", [-4, 5], [1, 0]),
    entityPlacement("qa_bark_b", [-3, 5], [-1, 0]),
  ],
  item_placements: [
    // Keep this lab's keyed-container proof self-contained for ordinary-map
    // progression validation instead of relying on inventory from another map.
    { id: "qa_world_keycard", item_id: "qa_keycard", cell: [-3, -3] as [number, number], count: 1 },
    { id: "qa_world_heat_vial", item_id: "qa_heat_vial", cell: [-1, -3] as [number, number], count: 1 },
    { id: "qa_world_sample", item_id: "qa_sample", cell: [1, -3] as [number, number], count: 1 },
  ],
  container_placements: [
    {
      id: "qa_world_keyed_cache",
      object_id: "obj_chest",
      cell: [5, -5] as [number, number],
      facing: [0, 1] as [number, number],
      display_name: "Keyed Cache",
      locked: true,
      key_item_id: "qa_keycard",
      consume_key: false,
      items: [{ item_id: "qa_focus_tonic", count: 1 }],
    },
    {
      id: "qa_world_materials_cache",
      object_id: "obj_chest",
      cell: [6, -3] as [number, number],
      facing: [0, 1] as [number, number],
      display_name: "Materials Cache",
      locked: false,
      consume_key: false,
      items: [
        { item_id: "qa_heat_vial", count: 2 },
        { item_id: "qa_sample", count: 2 },
      ],
    },
  ],
  regions: [
    {
      id: "qa_survival_region",
      display_name: "The Long Watch",
      neutral: true,
      passive_checks: [],
      survival_delta: { hunger: 2, thirst: 2, fatigue: 1 },
    },
  ],
  triggers: [],
  exits: [hubReturnExit([0, 8])],
};

// ── Movement lab ─────────────────────────────────────────────────────────────
const moveCells = (() => {
  const o: CellOverrides = {};
  // West: an S-shaped corridor exactly one macro tile wide — the 3×3 fine
  // footprint threads it with zero clearance.
  stampRect(o, -7, -6, -3, -6, {});
  stampRect(o, -6, -7, -6, -5, WALL);
  stampRect(o, -4, -5, -4, -3, WALL);
  stampRect(o, -6, -3, -6, -1, WALL);
  stampRect(o, -4, -1, -4, 1, WALL);
  // Center: a pillar garden with 1-macro gaps.
  stampCells(o, [[-1, -5], [1, -5], [-1, -3], [1, -3]], WALL);
  // East: a walkable staircase (0→1→2) beside an illegal 0→2 cliff jump.
  stampCells(o, [[4, -2]], { height: 1, visual_height: 0.5, terrain: "stair" });
  stampCells(o, [[5, -2]], { height: 2, visual_height: 1.0, terrain: "stair" });
  stampCells(o, [[5, -1]], { height: 2, visual_height: 1.0, terrain: "cliff_top" });
  stampCells(o, [[4, -1]], { height: 0, visual_height: 0, terrain: "cliff_base" });
  // South-center: LOS wall garden for fog proof.
  stampCells(o, [[-2, 3], [-1, 3], [1, 3], [2, 3]], WALL);
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const moveMap = {
  id: "qa_move_lab",
  display_name: "QA Movement Lab",
  width: 17,
  height: 17,
  spawns: [
    { id: "spawn_return", cell: [0, 6] as [number, number], facing: [0, -1] as [number, number] },
    { id: "spawn_portal_b", cell: [6, 5] as [number, number], facing: [0, -1] as [number, number] },
  ],
  cells: moveCells,
  props: [],
  custom_object_placements: [
    sign("obj_terminal", [2, 6], "qa_dlg_move_sign"),
    prop("obj_p_door", [0, 0]),
  ],
  entity_placements: [],
  item_placements: [
    { id: "qa_move_sample", item_id: "qa_sample", cell: [-6, 4] as [number, number], count: 1 },
  ],
  container_placements: [],
  triggers: [
    // Macro-entry step plates: each fires ONCE per tile entry (a chime), not
    // once per fine step — walk across and count the clicks.
    stepPlate("qa_plate_a", [-2, 5], "qa_cut_plate_chime"),
    stepPlate("qa_plate_b", [0, 5], "qa_cut_plate_chime"),
    stepPlate("qa_plate_c", [2, 5], "qa_cut_plate_chime"),
  ],
  exits: [
    hubReturnExit([0, 8]),
    // In-map portal pair: step in at the NE pad, come out on the south pad.
    exit([6, -6], "qa_move_lab", "spawn_portal_b"),
  ],
  regions: [],
};

export const worldWing: QaWing = {
  maps: [worldMap, moveMap],
  entities: [
    npc("qa_quartermaster", "Quartermaster", "qa_dlg_quartermaster"),
    npc("qa_schedule_runner", "Schedule Runner", "qa_dlg_schedule_runner"),
    npc("qa_bark_a", "Bark A"),
    npc("qa_bark_b", "Bark B"),
  ],
  dialogue: [
    say(
      "qa_dlg_world_sign",
      "World Lab Sign",
      "West gallery drains hunger, thirst, and fatigue while you stand in it (watch the Condition panel). The bench runs two real processes. Push the crate through the wet strip — it nudges one fine cell at a time and comes out dripping. The keyed cache wants the QA keycard.",
    ),
    dlg("qa_dlg_quartermaster", "Quartermaster", [
      {
        id: "start",
        speaker: "Quartermaster",
        text: "Rest wipes the survival drain and jumps the clock — which also marches the schedule runner to a different post.",
        options: [
          { text: "Rest (restore + 3 hours).", trigger_cutscene: "qa_cut_world_rest" },
          { text: "Close." },
        ],
      },
    ]),
    say(
      "qa_dlg_schedule_runner",
      "Schedule Runner",
      "My authored schedule posts me at three cells by clock hour: here at 08:00, the caches at 14:00, the bench at 20:00. Advance the clock and I will walk there myself.",
    ),
    say(
      "qa_dlg_move_sign",
      "Movement Lab Sign",
      "The west corridor is exactly one tile wide — your footprint threads it with zero clearance. The stairs climb one step at a time; the cliff face refuses the two-step jump. The plates chime once per TILE you enter, not once per fine step. The NE pad is a portal. The door opens with Act.",
    ),
  ],
  cutscenes: [
    {
      id: "qa_cut_world_rest",
      display_name: "World Rest",
      is_blocking: true,
      actions: [
        { type: "heal_player", amount: 999 },
        { type: "restore_party" },
        { type: "advance_clock", amount: 180 },
        { type: "set_switch", switch_id: "qa_rested", switch_value: true },
      ],
    },
    {
      id: "qa_cut_plate_chime",
      display_name: "Plate Chime",
      is_blocking: false,
      actions: [{ type: "play_sound", sound_id: "ui_click" }],
    },
  ],
  documents: [
    {
      id: "qa_doc_world_lab",
      display_name: "World Systems Readout",
      content:
        "World proofs: survival deltas drain by region and rest restores; workstation processes consume inputs over ticks and emit heat/sound/economy stock; containers honor locks and keys; pushables nudge in fine cells and interact with surfaces; NPC schedules follow the clock; barks fire on proximity with cooldowns.",
    },
  ],
  barks: [
    {
      id: "qa_bark_lab_ready",
      speakers: ["qa_bark_a", "qa_bark_b"],
      lines: [
        { speaker: "qa_bark_a", text: "Bark cooldown test armed." },
        { speaker: "qa_bark_b", text: "Ambient line rendered." },
      ],
      cooldown_minutes: 10,
    },
    {
      id: "qa_bark_story_switch",
      speakers: ["qa_bark_a", "qa_bark_b"],
      condition: { switch: "qa_story_switch_done" },
      lines: [
        { speaker: "qa_bark_a", text: "Switch-gated bark active." },
        { speaker: "qa_bark_b", text: "Condition passed." },
      ],
      cooldown_minutes: 20,
    },
  ],
  processes: [
    {
      id: "qa_proc_temper_sample",
      label: "Temper QA Sample",
      process_type: "alchemy",
      workstation_id: "qa_ws_world_bench",
      required_ticks: 2,
      input_items: [
        { item_id: "qa_sample", count: 1 },
        { item_id: "qa_heat_vial", count: 1 },
      ],
      output_items: [{ item_id: "qa_focus_tonic", count: 1 }],
      waste_items: [],
      emits: { heat: 0.8, sound: 0.4, scent: 0.2, trace_kind: "qa_temper_residue" },
      economy: {
        shop_id: "qa_shop_supply",
        stock_item_id: "qa_focus_tonic",
        stock_delta: 1,
        shortage_threshold: 1,
        price_delta_when_short: 1,
      },
      failure: { interrupted_by_actor_missing: true, interrupted_by_fire: true },
    },
    {
      id: "qa_proc_pack_ration",
      label: "Pack Field Ration",
      process_type: "cooking",
      workstation_id: "qa_ws_world_bench",
      required_ticks: 1,
      input_items: [{ item_id: "qa_sample", count: 1 }],
      output_items: [{ item_id: "qa_heat_vial", count: 1 }],
      waste_items: [],
      emits: { heat: 0.2, sound: 0.3, scent: 0.5, trace_kind: "qa_ration_residue" },
      failure: { interrupted_by_actor_missing: true, interrupted_by_fire: false },
    },
  ],
  workstations: [
    {
      id: "qa_ws_world_bench",
      label: "QA World Bench",
      map_id: "qa_world_lab",
      cell: [0, -2],
      process_ids: ["qa_proc_temper_sample", "qa_proc_pack_ration"],
      occupies_actor: true,
    },
  ],
  switches: {
    qa_rested: false,
  },
};
