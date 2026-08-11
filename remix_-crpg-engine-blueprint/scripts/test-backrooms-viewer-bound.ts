// Viewer visibility bounding — correctness guard.
// Run: npm run test:backrooms-viewer-bound
//
// The viewer path builds its structural simulation over a bounded slice of the
// map rather than the whole streamed window, because the window is sized for
// rendering far-field architecture while the viewer resolves a much smaller
// radius. Trimming cells is safe only because of two properties, and this file
// pins both:
//
//   * out-of-bounds is fail-closed — a trimmed cell reads as blocking, so the
//     bound can never leak sight or light through geometry it dropped;
//   * the radius is derived from `viewerRange + maxSourceRadius`, so a lamp
//     outside the viewer's own range still lights what it should.
//
// The second is the one worth guarding. A bound derived from viewer range
// alone would look correct in an evenly lit room and quietly extinguish every
// distant fixture, which is exactly the kind of regression that only shows up
// as "the level got darker" long after the change.

import assert from "node:assert/strict";

import { createImmersiveViewerVisibilityFromV1 } from "../src/engine-core";
import { FINE_PER_MACRO } from "../src/engine-core/gridCoordinates";
import { createEmptyGamePackage, GamePackageSchema, type GamePackage, type MapData } from "../src/schema/game";
import type { PlaySave } from "../src/schema/save";

const LAMP_OBJECT_ID = "obj_bound_probe_lamp";

// A long straight lit corridor. The lamp sits far from the viewer — outside the
// viewer's own sight range — but its radius still reaches them.
const CORRIDOR_LENGTH = 160;
const VIEWER_X = 4;
const LAMP_X = 70;
const LAMP_RADIUS = 90;

const cells: MapData["cells"] = [];
for (let x = 0; x < CORRIDOR_LENGTH; x += 1) {
  for (let z = 0; z < 3; z += 1) {
    const wall = z !== 1;
    cells.push({
      x,
      y: 0,
      z,
      active: true,
      walkable: !wall,
      blocks_los: wall,
      height: wall ? 1 : 0,
      visual_height: wall ? 1.5 : 0,
      surface_tag: "none",
    } as MapData["cells"][number]);
  }
}

const probeMap = {
  id: "bound_probe_corridor",
  display_name: "Bound Probe Corridor",
  width: CORRIDOR_LENGTH,
  height: 3,
  ambient_light: 0,
  spawns: [{ id: "spawn", cell: [VIEWER_X, 1], facing: [1, 0] }],
  cells,
  props: [],
  custom_object_placements: [
    {
      id: "distant_lamp",
      object_id: LAMP_OBJECT_ID,
      cell: [LAMP_X, 1],
      facing: [0, 1],
    },
  ],
  entity_placements: [],
  item_placements: [],
  container_placements: [],
  triggers: [],
  exits: [],
} as unknown as MapData;

const lamp = {
  id: LAMP_OBJECT_ID,
  display_name: "Probe Lamp",
  category: "fixture",
  tags: ["light"],
  origin: "center_floor",
  bounds: [1, 1, 1],
  materials: [],
  material_settings: [],
  model_kind: "parts",
  parts: [],
  decals: [],
  reference_images: [],
  collision: { profile: "none", footprint: [] },
  light_source: {
    intensity: 1,
    radius: LAMP_RADIUS,
    color: "#ffffff",
    active_by_default: true,
    extinguishable: false,
    mobility: "fixed",
    persistent: true,
    stimulus_tags: ["light"],
    exposes_carrier: false,
  },
} as unknown as GamePackage["object_library"][number];

const base = createEmptyGamePackage();
const gamePackage: GamePackage = GamePackageSchema.parse({
  ...base,
  maps: [probeMap],
  object_library: [...base.object_library.filter((o) => o.id !== lamp.id), lamp],
});
(gamePackage as unknown as Record<string, unknown>).__fine_expanded = true;

const save = {
  schema: "crpg_engine_save_v1",
  package_version: "1",
  fine_ratio: FINE_PER_MACRO,
  current_map_id: probeMap.id,
  player: { cell: [VIEWER_X, 1], facing: [1, 0] },
  playerStats: {},
  level: 1,
  experience: 0,
  pending_level_ups: 0,
  known_skills: [],
  flags: {},
  quests: {},
  inventory: [],
  explored_cells: {},
  map_deltas: {},
  entity_states: {},
} as unknown as PlaySave;

console.log("viewer bound: a distant lamp still lights the viewer");

const snapshot = createImmersiveViewerVisibilityFromV1(
  gamePackage,
  save,
  probeMap.id,
  { viewer_cell: [VIEWER_X, 1] },
);

const litByKey = new Map(
  snapshot.illumination.cells.map((entry) => [
    `${entry.cell[0]},${entry.cell[1]}`,
    entry.value,
  ]),
);

// The lamp is well beyond the viewer's own sight range, so a bound derived from
// that range alone would have trimmed away its entire light path.
const viewerLight = litByKey.get(`${VIEWER_X},1`) ?? 0;
assert.ok(
  LAMP_X - VIEWER_X > FINE_PER_MACRO * 8,
  "the probe lamp must sit outside the viewer's own sight range",
);
assert.ok(
  viewerLight > 0,
  `a lamp ${LAMP_X - VIEWER_X} cells away with radius ${LAMP_RADIUS} must still ` +
    `light the viewer (got ${viewerLight}); the bound is trimming live light paths`,
);

// Ambient is zero here, so any light present is genuinely the lamp's.
assert.equal(
  snapshot.illumination.ambient_light,
  0,
  "the probe must isolate lamp contribution from ambient",
);

// And the bound must not have quietly become the whole map: the viewer's
// answer stays range-bounded rather than reporting the full corridor.
assert.ok(
  snapshot.illumination.cells.length < cells.length,
  "viewer illumination must stay range-bounded",
);

console.log(
  `Viewer bound guard passed (viewer light ${viewerLight.toFixed(3)} from a ` +
    `lamp ${LAMP_X - VIEWER_X} cells away).`,
);
