// ── QA persistence + succession wing ────────────────────────────────────────
// A compact browser proof for the authored/campaign/expedition state boundary.
// The south room contains temporary encounter state and three labeled control
// terminals. The north annex sits behind a stable shortcut door and holds the
// campaign artifact plus a resettable hostile. After succession, the shortcut,
// explored annex, artifact recovery, and campaign switch should remain while
// the hazard, hostile, crate position, and ordinary loot reset.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  WALL,
  entityPlacement,
  hostile,
  hubReturnExit,
  lever,
  prop,
  roomCells,
  say,
  sign,
  stampCells,
  stampRect,
} from "./shared";

export const QA_PERSISTENCE_MAP_ID = "qa_persistence_lab";
export const QA_PERSISTENCE_SHORTCUT_ID = "qa_persistence_shortcut";
export const QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID =
  "qa_persistence_artifact_placement";

const persistenceCells = (() => {
  const overrides: CellOverrides = {};

  // A full LOS-blocking divider makes rediscovered annex geometry and the
  // retained shortcut immediately legible after a successor returns.
  stampRect(overrides, -7, 0, 7, 0, WALL);
  stampCells(overrides, [[0, 0], [0, 8]], DOORWAY);

  // Give the temporary hazard an authored fuel patch without turning the
  // whole south chamber into a chemistry lab.
  stampCells(overrides, [[0, 2]], {
    surface_tag: "oil",
    terrain: "oil_stained_floor",
  });

  return roomCells(-8, 8, -8, 8, overrides);
})();

const campaignTerminal = lever(
  "qa_trig_persistence_campaign",
  "obj_terminal",
  [-5, 4],
  "qa_cut_persistence_campaign",
);
const hazardTerminal = lever(
  "qa_trig_persistence_hazard",
  "obj_terminal",
  [0, 4],
  "qa_cut_persistence_hazard",
);
const successionTerminal = lever(
  "qa_trig_persistence_succession",
  "obj_terminal",
  [5, 4],
  "qa_cut_persistence_succession",
);

const persistenceMap: QaWing["maps"][number] = {
  id: QA_PERSISTENCE_MAP_ID,
  display_name: "QA Persistence & Succession Lab",
  width: 17,
  height: 17,
  ambient_light: 0.35,
  spawns: [
    {
      id: "spawn_return",
      cell: [0, 6],
      facing: [0, -1],
    },
  ],
  cells: persistenceCells,
  props: [],
  custom_object_placements: [
    {
      id: QA_PERSISTENCE_SHORTCUT_ID,
      object_id: "obj_p_door",
      cell: [0, 0],
      facing: [0, 1],
      locked: false,
      consume_key: false,
    },
    {
      ...campaignTerminal.placement,
      id: "qa_persistence_campaign_terminal",
    },
    {
      ...hazardTerminal.placement,
      id: "qa_persistence_hazard_terminal",
    },
    {
      ...successionTerminal.placement,
      id: "qa_persistence_succession_terminal",
    },
    sign("obj_bookshelf", [5, 6], "qa_dlg_persistence_instructions"),
    // The crate is deliberately south of the divider: moving it is an obvious
    // tactical delta that should not survive the expedition boundary.
    prop("obj_crate", [3, 6], [0, -1]),
  ],
  entity_placements: [
    entityPlacement("qa_persistence_hostile", [4, -4], [-1, 0], {
      id: "qa_persistence_hostile_placement",
    }),
  ],
  item_placements: [
    {
      id: "qa_persistence_ordinary_placement",
      item_id: "qa_persistence_supplies",
      cell: [-3, 6],
      count: 1,
    },
    {
      id: QA_PERSISTENCE_ARTIFACT_PLACEMENT_ID,
      item_id: "qa_persistence_artifact",
      cell: [0, -5],
      count: 1,
    },
  ],
  container_placements: [],
  regions: [],
  triggers: [
    campaignTerminal.trigger,
    hazardTerminal.trigger,
    successionTerminal.trigger,
  ],
  exits: [hubReturnExit([0, 8])],
};

export const persistenceWing: QaWing = {
  maps: [persistenceMap],
  entities: [
    hostile(
      "qa_persistence_hostile",
      "Resettable Annex Watcher",
      { hp: 18, attack: 3, defense: 1, speed: 8, xp: 6 },
    ),
  ],
  dialogue: [
    say(
      "qa_dlg_persistence_instructions",
      "Persistence Lab Instructions",
      "Open the divider door and explore the north annex. Recover the violet Archive Seal there. The three south terminals, west to east, are CAMPAIGN (sets a lasting major switch), HAZARD (creates temporary fire and miasma), and SUCCESSION (ends this Intercessor for the death handoff test). Move the south crate and collect the ordinary supply before succession. A successor should inherit the explored annex, open shortcut, Archive Seal, and campaign switch; the hazard, hostile, crate, and ordinary supply should reset.",
      [{ text: "Close." }],
    ),
  ],
  cutscenes: [
    {
      id: "qa_cut_persistence_campaign",
      display_name: "CAMPAIGN — Set Persistent Major Switch",
      is_blocking: true,
      actions: [
        {
          type: "set_switch",
          switch_id: "qa_persistence_major",
          switch_value: true,
        },
        { type: "play_sound", sound_id: "ui_click" },
      ],
    },
    {
      id: "qa_cut_persistence_hazard",
      display_name: "HAZARD — Create Expedition Fire and Miasma",
      is_blocking: true,
      actions: [
        { type: "chem_spill", cell: [0, 2], liquid_id: "fire", amount: 70 },
        { type: "chem_spill", cell: [-2, 2], liquid_id: "miasma", amount: 65 },
        {
          type: "set_switch",
          switch_id: "qa_persistence_hazard",
          switch_value: true,
        },
      ],
    },
    {
      id: "qa_cut_persistence_succession",
      display_name: "SUCCESSION — End Current Intercessor",
      is_blocking: true,
      actions: [
        { type: "modify_player_stats", stats: { hp: -999 } },
      ],
    },
  ],
  items: [
    {
      id: "qa_persistence_supplies",
      display_name: "Ordinary Expedition Supply",
      description: "A resettable loose supply used to prove expedition cleanup.",
      icon: "S",
      category: "consumable",
      effects: { heal: 2 },
    },
    {
      id: "qa_persistence_artifact",
      display_name: "Violet Archive Seal",
      description: "A campaign-scoped recovery token used only by the persistence QA lab.",
      icon: "V",
      category: "key",
    },
  ],
  switches: {
    qa_persistence_major: false,
    qa_persistence_hazard: false,
  },
};
