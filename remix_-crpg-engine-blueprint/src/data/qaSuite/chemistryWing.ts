// ── QA chemistry wing ────────────────────────────────────────────────────────
// Four labs proving the grid-subdivision chemistry rebuild with PHYSICAL
// demonstrations: buttons only inject quantity (chem_spill); the flooding,
// racing, burning, and dissipating are the live simulation advancing on
// player moves.
//
//   qa_flood_lab — a valve dumps a tank of water down a spillway into a sunken
//                  basin: visible ooze per step, height-aware cascade, pooling,
//                  dry walkways, dormant once settled.
//   qa_visc_lab  — one valve releases water and honey into twin channels; the
//                  water frontier visibly outruns the honey crawl ~3×.
//   qa_fire_lab  — a brazier ignites an oil trail through grass into a crate
//                  stockpile; a wet moat stops the spread; scorch remains.
//   qa_gas_lab   — a valve vents miasma that snakes around baffles, poisons
//                  what it touches, and thins to nothing over ~20 moves.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  WALL,
  dlg,
  entityPlacement,
  hubReturnExit,
  lever,
  npc,
  prop,
  roomCells,
  say,
  sign,
  stampCells,
  stampRect,
  stepPlate,
} from "./shared";

// ── Flood Chamber ────────────────────────────────────────────────────────────
const floodCells = (() => {
  const o: CellOverrides = {};
  // Whole interior sits at walkway height 1 by default…
  stampRect(o, -7, -7, 7, 7, { height: 1, visual_height: 0.4, terrain: "walkway" });
  // …the tank platform rises to 2 along the north…
  stampRect(o, -4, -7, 4, -5, { height: 2, visual_height: 0.9, terrain: "tank_platform" });
  // …a spillway lip steps down in front of it…
  stampRect(o, -2, -4, 2, -4, { height: 1, visual_height: 0.4, terrain: "spillway" });
  // …and the basin is sunk to 0 in the middle of the room, sized so the tank
  // release pools ankle-deep across the whole bed instead of thinning out.
  stampRect(o, -2, -3, 2, 0, { height: 0, visual_height: 0, terrain: "basin" });
  // Doorway back to the hub.
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const floodValve = lever("qa_trig_flood_valve", "obj_terminal", [0, -5], "qa_cut_flood_release");

const floodMap = {
  id: "qa_flood_lab",
  display_name: "QA Flood Chamber",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 6] as [number, number], facing: [0, -1] as [number, number] }],
  cells: floodCells,
  props: [],
  custom_object_placements: [
    floodValve.placement,
    prop("obj_rain_barrel", [-2, -6]),
    prop("obj_rain_barrel", [0, -6]),
    prop("obj_rain_barrel", [2, -6]),
    sign("obj_terminal", [3, 6], "qa_dlg_flood_sign"),
  ],
  entity_placements: [entityPlacement("qa_flood_warden", [5, -4], [-1, 0])],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [
    floodValve.trigger,
    stepPlate("qa_trig_flood_boots", [0, 0], "qa_cut_flood_boots", { once: true }),
  ],
  exits: [hubReturnExit([0, 8])],
};

// ── Viscosity Race ───────────────────────────────────────────────────────────
const viscCells = (() => {
  const o: CellOverrides = {};
  // Release platform across the north.
  stampRect(o, -6, -6, 6, -6, { height: 1, visual_height: 0.4, terrain: "release_platform" });
  // Channel heads sit one step up so both liquids run downhill into the race.
  stampCells(o, [[-3, -5], [3, -5]], { height: 1, visual_height: 0.4, terrain: "channel_head" });
  // Channel beds at 0.
  stampRect(o, -3, -4, -3, 3, { height: 0, visual_height: 0, terrain: "channel" });
  stampRect(o, 3, -4, 3, 3, { height: 0, visual_height: 0, terrain: "channel" });
  // Catch basins at the finish line.
  stampRect(o, -4, 4, -2, 5, { height: 0, visual_height: 0, terrain: "catch_basin" });
  stampRect(o, 2, 4, 4, 5, { height: 0, visual_height: 0, terrain: "catch_basin" });
  // Channel walls, plus backstops behind each head so the release runs down
  // the track instead of sloshing back onto the platform.
  stampRect(o, -4, -5, -4, 3, WALL);
  stampRect(o, -2, -5, -2, 3, WALL);
  stampRect(o, 2, -5, 2, 3, WALL);
  stampRect(o, 4, -5, 4, 3, WALL);
  stampCells(o, [[-3, -6], [3, -6]], WALL);
  // Raised observation aisle between the channels.
  stampRect(o, -1, -5, 1, 6, { height: 1, visual_height: 0.4, terrain: "observation_aisle" });
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const viscValve = lever("qa_trig_race_valve", "obj_terminal", [0, -6], "qa_cut_race_release");

const viscMap = {
  id: "qa_visc_lab",
  display_name: "QA Viscosity Race",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 7] as [number, number], facing: [0, -1] as [number, number] }],
  cells: viscCells,
  props: [],
  custom_object_placements: [
    viscValve.placement,
    prop("obj_rain_barrel", [-5, -6]),
    prop("obj_rain_barrel", [5, -6]),
    sign("obj_terminal", [2, 7], "qa_dlg_race_sign"),
  ],
  entity_placements: [entityPlacement("qa_race_steward", [0, 5], [0, -1])],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [viscValve.trigger],
  exits: [hubReturnExit([0, 8])],
};

// ── Burn Gallery ─────────────────────────────────────────────────────────────
const OIL_TRAIL: [number, number][] = [
  [-5, 0], [-4, 0], [-3, 0], [-2, 0], [-1, 0],
  [-1, -1], [-1, -2],
  [0, -2], [1, -2], [2, -2], [3, -2],
  [3, -3], [3, -4], [4, -4],
];

const fireCells = (() => {
  const o: CellOverrides = {};
  // A dry grass meadow across the north half (fuel for spreading fire).
  stampRect(o, -6, -6, 6, -1, { terrain: "grass" });
  // A fuel lane running toward the vault so the moat is what visibly stops
  // the spread (fire crosses the lane, dies at the water).
  stampRect(o, 5, 0, 7, 0, { terrain: "grass" });
  // The oil trail snakes from the brazier into the crate stockpile.
  stampCells(o, OIL_TRAIL, { surface_tag: "oil", terrain: "oil" });
  // A wet moat guards the south-east vault: fire cannot cross water.
  stampRect(o, 4, 1, 4, 6, { surface_tag: "water", terrain: "water" });
  stampRect(o, 5, 1, 7, 1, { surface_tag: "water", terrain: "water" });
  // Legacy surface strip (ice / poison / pre-burning hazard).
  stampCells(o, [[-6, 5]], { surface_tag: "firehazard", terrain: "firehazard" });
  stampCells(o, [[-5, 5]], { surface_tag: "ice", terrain: "ice" });
  stampCells(o, [[-4, 5]], { surface_tag: "poison", terrain: "poison" });
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const brazier = lever("qa_trig_brazier", "obj_iron_stove", [-6, 0], "qa_cut_fire_ignite");

const fireMap = {
  id: "qa_fire_lab",
  display_name: "QA Burn Gallery",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 7] as [number, number], facing: [0, -1] as [number, number] }],
  cells: fireCells,
  props: [],
  custom_object_placements: [
    brazier.placement,
    prop("obj_crate", [5, -5]),
    prop("obj_crate", [6, -5]),
    prop("obj_crate", [5, -4]),
    prop("obj_crate", [6, -4]),
    prop("obj_rain_barrel", [-2, 3]),
    sign("obj_terminal", [0, 3], "qa_dlg_fire_sign"),
  ],
  entity_placements: [entityPlacement("qa_pyro_warden", [2, 5], [0, -1])],
  item_placements: [],
  container_placements: [
    {
      id: "qa_fire_vault",
      object_id: "obj_chest",
      cell: [6, 4] as [number, number],
      facing: [0, 1] as [number, number],
      display_name: "Moat-Guarded Vault",
      locked: false,
      consume_key: false,
      items: [{ item_id: "qa_focus_tonic", count: 2 }],
    },
  ],
  regions: [],
  triggers: [brazier.trigger],
  exits: [hubReturnExit([0, 8])],
};

// ── Miasma Vault ─────────────────────────────────────────────────────────────
const gasCells = (() => {
  const o: CellOverrides = {};
  // Baffle 1 hangs from the north wall; the gap is at its south end.
  stampRect(o, -2, -7, -2, -1, WALL);
  // Baffle 2 rises from the south wall; the gap is at its north end.
  stampRect(o, 2, -4, 2, 7, WALL);
  stampCells(o, [[0, 8]], DOORWAY);
  return roomCells(-8, 8, -8, 8, o);
})();

const gasValve = lever("qa_trig_gas_valve", "obj_terminal", [-6, -5], "qa_cut_gas_release");

const gasMap = {
  id: "qa_gas_lab",
  display_name: "QA Miasma Vault",
  width: 17,
  height: 17,
  spawns: [{ id: "spawn_return", cell: [0, 7] as [number, number], facing: [0, -1] as [number, number] }],
  cells: gasCells,
  props: [],
  custom_object_placements: [
    gasValve.placement,
    sign("obj_terminal", [3, 7], "qa_dlg_gas_sign"),
  ],
  // The canary stands inside the vent radius (a free tile beside the valve —
  // the valve's own tile is blocked by the terminal and rejects flow): the
  // release engulfs it at once, dense enough to read Toxic.
  entity_placements: [entityPlacement("qa_gas_canary", [-5, -4], [1, 0])],
  item_placements: [],
  container_placements: [],
  regions: [],
  triggers: [gasValve.trigger],
  exits: [hubReturnExit([0, 8])],
};

// ── Wing content ─────────────────────────────────────────────────────────────
export const chemistryWing: QaWing = {
  maps: [floodMap, viscMap, fireMap, gasMap],
  entities: [
    npc("qa_flood_warden", "Flood Warden", "qa_dlg_flood_warden"),
    npc("qa_race_steward", "Race Steward", "qa_dlg_race_steward"),
    npc("qa_pyro_warden", "Pyro Warden", "qa_dlg_pyro_warden"),
    // The canary is deliberately skittish so gas exposure (toxicity →
    // emotional crosstalk) pushes it over the flee threshold.
    npc("qa_gas_canary", "Vault Canary", "qa_dlg_gas_canary", {
      emotional_axes: { arousal: 62, valence: 38 },
    }),
  ],
  dialogue: [
    say(
      "qa_dlg_flood_sign",
      "Flood Chamber Sign",
      "Press the valve on the tank platform, then WALK. The tank water oozes a few cells per step, cascades down the spillway, pools in the sunken basin, and never climbs onto this raised walkway. When it settles, it goes dormant — a still pool costs the engine nothing.",
    ),
    say(
      "qa_dlg_flood_warden",
      "Flood Warden",
      "Three barrels, one valve. The release only injects water at the spillway — everything after that is the height-aware flow model. Watch it hunt the low ground.",
    ),
    say(
      "qa_dlg_race_sign",
      "Race Sign",
      "One valve, two channels. Left: water (frontier ~3 cells per surge). Right: honey (1 cell crawl, and it holds a thick blob on the slope). Walk the center aisle and watch the water win by the time honey clears a third of the track.",
    ),
    say(
      "qa_dlg_race_steward",
      "Race Steward",
      "Viscosity is authored per material as flow rate — cells of frontier advance per iteration. Same valve, same instant, very different rivers.",
    ),
    say(
      "qa_dlg_fire_sign",
      "Burn Gallery Sign",
      "Light the brazier: the oil trail carries fire through the grass to the crate stockpile. The wet moat guards the vault — fire cannot cross water. Use the command wheel to DOUSE or FOAM the burn; the scorch it leaves is permanent.",
    ),
    say(
      "qa_dlg_pyro_warden",
      "Pyro Warden",
      "Oil ignites easily and burns hot; grass catches from neighbouring heat; wood crates are fuel with patience. Saturated cells smother flame — that is why the moat holds.",
    ),
    say(
      "qa_dlg_gas_sign",
      "Miasma Vault Sign",
      "Open the valve, then keep moving. The cloud fills the vault, snakes around both baffles toward you, and reads TOXIC on anything standing inside it. Unlike liquid, it thins as it spreads — in twenty steps the vault is clean air again.",
    ),
    say(
      "qa_dlg_gas_canary",
      "Vault Canary",
      "I stand beside the valve. When you open it the cloud closes over me — watch for the Toxic badge, the poison status, and, being a nervous sort, me bolting for the door.",
    ),
    say(
      "qa_dlg_flood_boots",
      "System",
      "Step trigger proof: this plate fired once, on macro-tile entry, at the bottom of the flooded basin.",
    ),
  ],
  cutscenes: [
    {
      id: "qa_cut_flood_release",
      display_name: "Flood Release",
      is_blocking: true,
      actions: [
        { type: "camera_pan", cell: [0, -1], duration: 700 },
        { type: "play_sound", sound_id: "door_transition" },
        // The tank empties at the waterfall base — one tile-sized dump at the
        // basin's north row — and floods south on the player's moves.
        { type: "chem_spill", cell: [0, -3], liquid_id: "water", amount: 220 },
        { type: "set_switch", switch_id: "qa_flood_released", switch_value: true },
        { type: "wait", duration: 600 },
        { type: "camera_pan" },
      ],
    },
    {
      id: "qa_cut_flood_boots",
      display_name: "Wet Boots",
      is_blocking: true,
      actions: [{ type: "show_dialogue", dialogue_id: "qa_dlg_flood_boots", node_id: "start" }],
    },
    {
      id: "qa_cut_race_release",
      display_name: "Viscosity Race Release",
      is_blocking: true,
      actions: [
        { type: "play_sound", sound_id: "door_transition" },
        { type: "chem_spill", cell: [-3, -5], liquid_id: "water", amount: 150 },
        { type: "chem_spill", cell: [3, -5], liquid_id: "honey", amount: 150 },
        { type: "set_switch", switch_id: "qa_race_released", switch_value: true },
      ],
    },
    {
      id: "qa_cut_fire_ignite",
      display_name: "Brazier Ignition",
      is_blocking: true,
      actions: [
        { type: "chem_spill", cell: [-5, 0], liquid_id: "fire", amount: 100 },
        { type: "set_switch", switch_id: "qa_fire_released", switch_value: true },
      ],
    },
    {
      id: "qa_cut_gas_release",
      display_name: "Miasma Release",
      is_blocking: true,
      actions: [
        { type: "play_sound", sound_id: "warning" },
        { type: "chem_spill", cell: [-6, -6], liquid_id: "miasma", amount: 90 },
        { type: "chem_spill", cell: [-5, -6], liquid_id: "miasma", amount: 90 },
        { type: "chem_spill", cell: [-6, -4], liquid_id: "miasma", amount: 90 },
        { type: "chem_spill", cell: [-5, -5], liquid_id: "miasma", amount: 90 },
        // The canary's own tile is inside the vent radius — engulfed at once.
        { type: "chem_spill", cell: [-5, -4], liquid_id: "miasma", amount: 90 },
        { type: "set_switch", switch_id: "qa_gas_released", switch_value: true },
      ],
    },
  ],
  documents: [
    {
      id: "qa_doc_chemistry",
      display_name: "Chemistry Wing Readout",
      content:
        "Chemistry proofs: liquids carry real volume and flow toward lower level (height x 80 + depth), pooling in basins and stopping at raised walkways. Viscosity is per-material frontier speed (water 3, honey 1). Fire propagates along fuel gradients and is smothered by saturation (the moat). Miasma diffuses toward lower concentration, poisons occupants, and dissipates. Everything advances only on player moves via the active-set ticker; settled rooms cost nothing.",
    },
  ],
  switches: {
    qa_flood_released: false,
    qa_race_released: false,
    qa_fire_released: false,
    qa_gas_released: false,
  },
};
