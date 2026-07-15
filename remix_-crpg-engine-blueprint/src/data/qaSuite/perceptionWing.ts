// ── QA perception wing ───────────────────────────────────────────────────────
// A deliberately dark, generic acceptance room for the perception contract:
// authored light, sight, sound, smoke, memory/search, and LOS occlusion. The
// room avoids plot-specific language so it can remain an engine-level proof.

import {
  type CellOverrides,
  type QaWing,
  DOORWAY,
  WALL,
  entityPlacement,
  hostile,
  hubReturnExit,
  prop,
  roomCells,
  say,
  sign,
  stampCells,
  stampRect,
} from "./shared";

const perceptionCells = (() => {
  const o: CellOverrides = {};

  // The west L-baffle proves that sound can motivate a search without LOS.
  stampRect(o, -4, -8, -4, 1, WALL);
  stampCells(o, [[-4, -1]], DOORWAY);
  stampRect(o, -9, 1, -4, 1, WALL);
  stampCells(o, [[-7, 1]], DOORWAY);

  // The east divider hides the dark artifact and light-sensitive observer.
  stampRect(o, 4, -8, 4, 0, WALL);
  stampCells(o, [[4, -2]], DOORWAY);

  // A shutter wall leaves one direct sight lane down the room's center.
  stampRect(o, -3, -2, 3, -2, WALL);
  stampCells(o, [[0, -2]], DOORWAY);

  // Static smoke is authored with both hazard and semantic tag so perception
  // can recognize it without coupling this map to a bespoke object type.
  stampRect(o, 1, 0, 3, 2, {
    terrain: "smoke",
    hazard: "smoke",
    tag: "smoke_obscurance",
  });

  stampCells(o, [[0, 8]], { tag: "acceptance_dark_start" });
  stampCells(o, [[7, -7]], { tag: "acceptance_dark_artifact" });
  stampCells(o, [[-7, 4]], { tag: "acceptance_noise_source" });
  stampCells(o, [[0, 10]], DOORWAY);
  return roomCells(-10, 10, -10, 10, o);
})();

const perceptionMap = {
  id: "qa_perception_lab",
  display_name: "QA Perception Lab",
  width: 21,
  height: 21,
  ambient_light: 0,
  spawns: [
    {
      id: "spawn_return",
      cell: [0, 8] as [number, number],
      facing: [0, -1] as [number, number],
    },
  ],
  cells: perceptionCells,
  props: [],
  custom_object_placements: [
    sign("obj_terminal", [2, 8], "qa_dlg_perception_sign"),
    {
      ...prop("obj_oil_lamp", [7, 2]),
      id: "qa_fixed_environment_lamp",
    },
    // A push, shove, or impact supplies a recognizable sound stimulus while
    // the west baffle prevents the hearing observer from seeing its source.
    {
      ...prop("obj_crate", [-7, 4]),
      id: "qa_noise_crate",
    },
  ],
  entity_placements: [
    entityPlacement("qa_sight_watcher", [0, -5], [0, 1]),
    entityPlacement("qa_sound_hunter", [-7, -5], [1, 0]),
    entityPlacement("qa_light_glass_watcher", [7, -5], [-1, 0]),
  ],
  item_placements: [
    {
      id: "qa_perception_portable_lamp",
      item_id: "qa_portable_lamp",
      cell: [0, 7] as [number, number],
      count: 1,
    },
    {
      id: "qa_perception_dark_artifact",
      item_id: "qa_dark_artifact",
      cell: [7, -7] as [number, number],
      count: 1,
    },
  ],
  container_placements: [],
  regions: [],
  triggers: [],
  exits: [hubReturnExit([0, 10])],
};

export const perceptionWing: QaWing = {
  maps: [perceptionMap],
  entities: [
    hostile(
      "qa_sight_watcher",
      "Sight-Dominant Watcher",
      { hp: 18, attack: 2, defense: 1, speed: 8, xp: 8 },
      {
        sensory_profile: {
          id: "qa_sight_dominant",
          memory_ticks: 150,
          search_ticks: 100,
          channels: [
            {
              id: "illuminated_sight",
              stimulus_kinds: ["visible_player"],
              range: 13,
              threshold: 0.12,
              sensitivity: 1.4,
              requires_los: true,
              requires_view_cone: true,
              requires_illumination: true,
              tracks_live_target: true,
            },
          ],
        },
      },
    ),
    hostile(
      "qa_sound_hunter",
      "Hearing-Dominant Hunter",
      { hp: 18, attack: 2, defense: 1, speed: 9, xp: 8 },
      {
        sensory_profile: {
          id: "qa_hearing_dominant",
          memory_ticks: 180,
          search_ticks: 140,
          channels: [
            {
              id: "directional_hearing",
              stimulus_kinds: ["sound"],
              range: 16,
              threshold: 0.08,
              sensitivity: 1.8,
              requires_los: false,
              requires_view_cone: false,
              requires_illumination: false,
              tracks_live_target: false,
            },
          ],
        },
      },
    ),
    hostile(
      "qa_light_glass_watcher",
      "Light-Glass-Sensitive Watcher",
      { hp: 18, attack: 2, defense: 1, speed: 7, xp: 8 },
      {
        sensory_profile: {
          id: "qa_light_glass_sensitive",
          memory_ticks: 210,
          search_ticks: 160,
          channels: [
            {
              id: "glass_light_sense",
              stimulus_kinds: ["light", "fire"],
              stimulus_tags: ["glass", "lamp", "portable_light"],
              range: 18,
              threshold: 0.05,
              sensitivity: 2.2,
              requires_los: true,
              requires_view_cone: false,
              requires_illumination: false,
              tracks_live_target: false,
            },
          ],
        },
      },
    ),
  ],
  dialogue: [
    say(
      "qa_dlg_perception_sign",
      "Perception Lab Instructions",
      "AMBIENT LIGHT IS ZERO. In the center lane, the sight watcher needs both illumination and a clear view. Pick up the Glass QA Lamp: it can be carried, placed, or thrown, and its light exposes its carrier. The east watcher keys on lamp/glass light. Push or strike the west crate; the hearing hunter should investigate around the L-baffle without seeing you. Cross the smoke patch to test obscurance, then compare pursuit, memory, and search after breaking line of sight. The Dark Artifact in the east bay emits no light. Return through the south doorway.",
      [{ text: "Begin perception tests." }],
    ),
  ],
  items: [
    {
      id: "qa_portable_lamp",
      display_name: "Glass QA Lamp",
      description:
        "A carried, placeable, throwable acceptance lamp. Its emitted stimulus exposes the carrier.",
      icon: "🏮",
      category: "key",
      spatial: { shape: [[0, 0]], weight_kg: 1.2, bulk: 1, stack_limit: 1 },
      simulation: {
        material_id: "glass",
        condition: "intact",
        integrity: 1,
        condition_tags: ["glass", "lamp", "noise_on_impact"],
        mass_kg: 1.2,
        bulk: 1,
        awkwardness: 0,
        push_difficulty: 1,
        carry_size: "hand",
        requires_cooperation: false,
      },
      light_source: {
        intensity: 0.9,
        radius: 14,
        color: "#ffd27a",
        active_by_default: true,
        extinguishable: true,
        mobility: "throwable",
        persistent: true,
        stimulus_tags: ["light", "lamp", "glass", "portable_light"],
        exposes_carrier: true,
      },
    },
    {
      id: "qa_dark_artifact",
      display_name: "Dark Artifact",
      description:
        "A deliberately non-emissive control item for proving that ordinary objects do not create light stimuli.",
      icon: "⬛",
      category: "key",
      spatial: { shape: [[0, 0]], weight_kg: 2, bulk: 1, stack_limit: 1 },
      simulation: {
        material_id: "stone",
        condition: "intact",
        integrity: 1,
        condition_tags: ["dark", "non_emissive", "artifact"],
        mass_kg: 2,
        bulk: 1,
        awkwardness: 0,
        push_difficulty: 1,
        carry_size: "hand",
        requires_cooperation: false,
      },
    },
  ],
};
