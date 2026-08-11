import assert from "node:assert/strict";

import { expandMapToFine } from "../src/engine-core/fineWorld";
import { FINE_PER_MACRO } from "../src/engine-core/gridCoordinates";
import type { CellData, MapData } from "../src/schema/game";
import {
  buildPersistentAuthoredTerrainCellsFor3D,
  dedupeFineTerrainCellsFor3D,
  renderedCellWorldSize,
  resolveRendererTerrainCells,
  worldPointToLogicalCell,
} from "../src/utils/renderSpace";

assert.equal(
  FINE_PER_MACRO,
  3,
  "the persistent authored terrain contract currently targets exact 3x3 microtiles",
);

const ordinary: CellData = {
  x: -5,
  y: 0,
  z: 4,
  active: true,
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  object_id: "obj_ordinary_floor",
  terrain: "soft",
  room_id: "ordinary",
  surface_tag: "none",
};
const overriddenGround: CellData = {
  x: -2,
  y: 0,
  z: -3,
  active: true,
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  object_id: "obj_base_floor",
  terrain: "soft",
  region_id: "base_region",
  room_id: "base_room",
  tag: "base_tag",
  surface_tag: "none",
};
const overriddenUpper: CellData = {
  ...overriddenGround,
  y: 2,
  object_id: "obj_upper_layer",
  tag: "upper",
};
const namedNoop: CellData = {
  ...ordinary,
  x: 4,
  z: -1,
  object_id: "obj_noop_floor",
};

const map: MapData = {
  id: "persistent_authored_render_cells",
  display_name: "Persistent authored render cells",
  width: 10,
  height: 10,
  environment: "interior",
  spawns: [{ id: "spawn", cell: [-5, 4], facing: [1, 0] }],
  cells: [ordinary, overriddenGround, overriddenUpper, namedNoop],
  fine_cell_overrides: [
    {
      macro_cell: [-2, -3],
      fine_offset: [0, 2],
      overrides: {
        walkable: false,
        blocks_los: true,
        height: 1,
        visual_height: 1.5,
        object_id: "obj_first_wall",
        tag: "first",
      },
    },
    {
      macro_cell: [-2, -3],
      fine_offset: [0, 2],
      overrides: {
        object_id: "obj_final_wall",
        tag: "final",
        surface_tag: "blood",
      },
    },
    {
      macro_cell: [-2, -3],
      fine_offset: [2, 0],
      overrides: {
        active: false,
        terrain: "void",
        hazard: "cold",
        region_id: "override_region",
      },
    },
    {
      macro_cell: [-2, -3],
      fine_offset: [1, 1],
      overrides: {
        room_id: "micro_room",
        infection: "spores",
        portal_id: "micro_portal",
      },
    },
    {
      // A named macro tile expands even when its effective value is unchanged.
      macro_cell: [4, -1],
      fine_offset: [1, 1],
      overrides: { walkable: true },
    },
  ],
  props: [],
  custom_object_placements: [],
  entity_placements: [],
  item_placements: [],
  container_placements: [],
  triggers: [],
  exits: [],
};

console.log("persistent authored terrain: compact ordinary macro tiles");
const rendered = buildPersistentAuthoredTerrainCellsFor3D(map);
assert.equal(rendered.length, 1 + 9 + 9 + 9);
assert.strictEqual(
  rendered[0],
  ordinary,
  "an ordinary macro tile remains the original stable renderer cell",
);
assert.equal(rendered[0].x, -5);
assert.equal(rendered[0].z, 4);
assert.equal(renderedCellWorldSize(rendered[0]), 1);

console.log("persistent authored terrain: exact negative-coordinate microtiles");
const negativeMicrotiles = rendered.filter(
  (cell) => cell.x >= -2 - 1 / 3 - 1e-9 &&
    cell.x <= -2 + 1 / 3 + 1e-9 &&
    cell.z >= -3 - 1 / 3 - 1e-9 &&
    cell.z <= -3 + 1 / 3 + 1e-9,
);
assert.equal(
  negativeMicrotiles.length,
  18,
  "both authored height layers expand into exact 3x3 render footprints",
);
const expectedAxis = [-2 - 1 / 3, -2, -2 + 1 / 3];
const expectedZAxis = [-3 - 1 / 3, -3, -3 + 1 / 3];
assert.deepEqual(
  [...new Set(negativeMicrotiles.map((cell) => cell.x))].sort((a, b) => a - b),
  expectedAxis,
);
assert.deepEqual(
  [...new Set(negativeMicrotiles.map((cell) => cell.z))].sort((a, b) => a - b),
  expectedZAxis,
);
assert.ok(
  negativeMicrotiles.every(
    (cell) => Math.abs(renderedCellWorldSize(cell) - 1 / 3) < 1e-12,
  ),
  "every expanded authored cell carries a one-third renderer footprint",
);

console.log("persistent authored terrain: runtime-equivalent override semantics");
const canonicalFineMap = expandMapToFine(map);
for (const renderedCell of negativeMicrotiles) {
  const fine = worldPointToLogicalCell(renderedCell.x, renderedCell.z, "fine");
  const canonical = canonicalFineMap.cells.find(
    (cell) =>
      cell.x === fine[0] &&
      cell.z === fine[1] &&
      cell.y === renderedCell.y,
  );
  assert.ok(canonical, `missing canonical fine cell ${fine.join(":")}@${renderedCell.y}`);
  const persistent = { ...(renderedCell as CellData & { __render_cell_size?: number }) };
  delete persistent.__render_cell_size;
  persistent.x = fine[0];
  persistent.z = fine[1];
  assert.deepEqual(
    persistent,
    canonical,
    `persistent render semantics diverged at ${fine.join(":")}@${renderedCell.y}`,
  );
}
assert.equal(overriddenGround.object_id, "obj_base_floor");
assert.equal(overriddenGround.walkable, true);
assert.equal(overriddenUpper.tag, "upper");

const orderedOverride = negativeMicrotiles.find((cell) => {
  const fine = worldPointToLogicalCell(cell.x, cell.z, "fine");
  return fine[0] === -6 && fine[1] === -7 && cell.y === 0;
});
assert.ok(orderedOverride);
assert.equal(orderedOverride.object_id, "obj_final_wall");
assert.equal(orderedOverride.tag, "final");
assert.equal(orderedOverride.walkable, false);
assert.equal(orderedOverride.blocks_los, true);
assert.equal(orderedOverride.surface_tag, "blood");

console.log("persistent authored terrain: named no-op tiles remain expanded");
const noopMicrotiles = rendered.filter(
  (cell) => cell.object_id === "obj_noop_floor",
);
assert.equal(noopMicrotiles.length, 9);
assert.ok(
  noopMicrotiles.every(
    (cell) => Math.abs(renderedCellWorldSize(cell) - 1 / 3) < 1e-12,
  ),
);
assert.deepEqual(
  buildPersistentAuthoredTerrainCellsFor3D(map),
  rendered,
  "persistent authored cells are deterministic",
);

console.log("persistent authored terrain: no-override maps retain source identity");
const withoutOverrides = buildPersistentAuthoredTerrainCellsFor3D({
  cells: [ordinary],
  fine_cell_overrides: [],
});
assert.strictEqual(withoutOverrides[0], ordinary);

console.log("persistent authored terrain: renderer bypass identity");
assert.strictEqual(
  resolveRendererTerrainCells(canonicalFineMap.cells, rendered),
  rendered,
  "immersive chunk rendering reuses the stable authored terrain array by identity",
);
assert.deepEqual(
  resolveRendererTerrainCells(canonicalFineMap.cells, undefined),
  dedupeFineTerrainCellsFor3D(canonicalFineMap.cells),
  "renderers without persistent chunks retain the faithful fine-terrain conversion",
);

console.log("persistent authored terrain cells: ok");
