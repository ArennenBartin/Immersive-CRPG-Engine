import assert from "node:assert/strict";
import type { CellData } from "../src/schema/game";
import { usePlayStore } from "../src/store/playStore";
import {
  buildAuthoritativeFogPresentationPlan,
  classifyFogRenderState,
  classifyFogRenderStateForCells,
  expandStructuralMemoryAcrossPresentationFootprints,
  fogCellKey,
  resolveStructureFogCompositePolicy,
  shouldRenderDarkAdjacentEntity,
} from "../src/utils/fogOfWar";
import {
  MEMORY_FOG_COLOR,
  UNKNOWN_FOG_COLOR,
  resolveStaticFogMaterialPolicy,
} from "../src/utils/lightRendering";

const current = new Set([fogCellKey(1, 1)]);
const discovered = new Set([fogCellKey(1, 1), fogCellKey(2, 2)]);
const memoryLineOfSight = new Set([
  fogCellKey(1, 1),
  fogCellKey(2, 2),
]);

assert.equal(
  classifyFogRenderState(
    fogCellKey(1, 1),
    true,
    current,
    discovered,
    memoryLineOfSight,
  ),
  "visible",
  "current visibility must take priority over remembered discovery",
);
assert.equal(
  classifyFogRenderState(
    fogCellKey(2, 2),
    true,
    current,
    discovered,
    memoryLineOfSight,
  ),
  "explored",
  "a discovered cell outside current visibility must render as remembered",
);
assert.equal(
  classifyFogRenderState(
    fogCellKey(2, 2),
    true,
    current,
    discovered,
    new Set(),
  ),
  "unseen",
  "remembered architecture outside current geometric LOS must stay black",
);
assert.equal(
  classifyFogRenderState(fogCellKey(3, 3), true, current, discovered),
  "unseen",
  "an undiscovered cell outside current visibility must remain unknown",
);
assert.equal(
  classifyFogRenderState(fogCellKey(3, 3), false, current, discovered),
  "visible",
  "disabling fog must reveal static world geometry",
);

const macroFineCells = [
  [10, 10],
  [10, 11],
] as const;
assert.equal(
  classifyFogRenderStateForCells(
    macroFineCells,
    true,
    new Set([fogCellKey(10, 11)]),
    new Set([fogCellKey(10, 10)]),
  ),
  "visible",
  "any currently visible fine cell must make its shared macro mesh visible",
);
assert.equal(
  classifyFogRenderStateForCells(
    macroFineCells,
    true,
    new Set([fogCellKey(10, 11)]),
    new Set([fogCellKey(10, 10)]),
    new Set([fogCellKey(10, 10), fogCellKey(10, 11)]),
  ),
  "explored",
  "a partially lit macro must retain its indigo base when another known LOS sample is dark",
);
assert.equal(
  classifyFogRenderStateForCells(
    macroFineCells,
    true,
    new Set(),
    new Set([fogCellKey(10, 10)]),
  ),
  "explored",
  "a shared macro mesh must remain remembered when no covered fine cell is current",
);
assert.equal(
  classifyFogRenderStateForCells(
    macroFineCells,
    true,
    new Set(),
    new Set([fogCellKey(10, 10)]),
    new Set([fogCellKey(10, 11)]),
  ),
  "explored",
  "macro memory must combine a known face with LOS reaching another face",
);
assert.equal(
  classifyFogRenderStateForCells(
    macroFineCells,
    true,
    new Set(),
    new Set([fogCellKey(10, 10)]),
    new Set(),
  ),
  "unseen",
  "known macro structure outside current LOS must remain black",
);
assert.equal(
  classifyFogRenderStateForCells(
    macroFineCells,
    true,
    new Set(),
    new Set(),
  ),
  "unseen",
  "a shared macro mesh must remain unknown when none of its fine cells were discovered",
);

const cell = (x: number, z: number): CellData => ({
  x,
  y: 0,
  z,
  active: true,
  walkable: true,
  blocks_los: false,
  height: 0,
  visual_height: 0,
  surface_tag: "none",
});
const presentation = buildAuthoritativeFogPresentationPlan({
  cells: [cell(0, 0), cell(1, 0)],
  gridSpace: "macro",
  fineRatio: 3,
  fogEnabled: true,
  terrainVisible: new Set([fogCellKey(0, 0)]),
  discovered: new Set([fogCellKey(0, 0)]),
});
const expandedStructuralMemory =
  expandStructuralMemoryAcrossPresentationFootprints(
    [
      {
        fine_cells: [
          [10, 10],
          [10, 11],
        ],
      },
      {
        fine_cells: [
          [20, 20],
          [20, 21],
        ],
      },
    ],
    new Set([fogCellKey(10, 10)]),
  );
assert.equal(
  expandedStructuralMemory.has(fogCellKey(10, 11)),
  true,
  "a learned structural footprint must remember every presented fine sample",
);
assert.equal(
  expandedStructuralMemory.has(fogCellKey(20, 20)),
  false,
  "memory expansion must not leak into an adjacent unknown footprint",
);
assert.deepEqual(
  presentation.map(({ world_cell, state }) => ({ world_cell, state })),
  [
    { world_cell: [0, 0], state: "visible" },
    { world_cell: [1, 0], state: "unseen" },
  ],
  "the presentation plan must retain unknown cells instead of deleting their structure",
);

const visibleStructure = resolveStructureFogCompositePolicy("visible", true);
const rememberedStructure = resolveStructureFogCompositePolicy("explored", true);
const unknownStructure = resolveStructureFogCompositePolicy("unseen", true);
assert.deepEqual(
  visibleStructure,
  { render: true, postFog: false, cameraFaded: true },
  "a currently visible camera occluder may use the readability fade",
);
assert.deepEqual(
  rememberedStructure,
  { render: true, postFog: false, cameraFaded: false },
  "remembered structure must stay rendered without a camera fade",
);
assert.deepEqual(
  unknownStructure,
  { render: true, postFog: false, cameraFaded: false },
  "unknown structure must stay rendered as black geometry without a camera fade",
);
assert.equal(
  resolveStructureFogCompositePolicy("visible", false).cameraFaded,
  false,
  "visible structure that does not occlude the camera must remain fully opaque",
);

const visibleMaterial = resolveStaticFogMaterialPolicy("visible");
assert.equal(visibleMaterial.brightness, 1);
assert.equal(visibleMaterial.preserveEmission, true);
assert.equal(visibleMaterial.flatUnlit, false);
assert.equal(visibleMaterial.forceOpaque, false);
assert.equal(visibleMaterial.preserveTextureMaps, true);
assert.equal(visibleMaterial.tint, undefined);
assert.equal(visibleMaterial.tintStrength, 0);

const rememberedMaterial = resolveStaticFogMaterialPolicy("explored");
assert.ok(
  rememberedMaterial.brightness > 0 && rememberedMaterial.brightness < 1,
  "remembered geometry needs a readable but subdued silhouette",
);
assert.equal(rememberedMaterial.preserveEmission, false);
assert.equal(rememberedMaterial.flatUnlit, true);
assert.equal(rememberedMaterial.forceOpaque, true);
assert.equal(rememberedMaterial.preserveTextureMaps, false);
assert.equal(rememberedMaterial.tint, MEMORY_FOG_COLOR);
assert.ok(rememberedMaterial.tintStrength > 0);

const unknownMaterial = resolveStaticFogMaterialPolicy("unseen");
assert.equal(unknownMaterial.brightness, 0);
assert.equal(unknownMaterial.preserveEmission, false);
assert.equal(unknownMaterial.flatUnlit, true);
assert.equal(unknownMaterial.forceOpaque, true);
assert.equal(unknownMaterial.preserveTextureMaps, false);
assert.equal(unknownMaterial.tint, UNKNOWN_FOG_COLOR);
assert.equal(unknownMaterial.tintStrength, 1);

const darkEntityContext = {
  viewerCell: [10, 10] as const,
  gridSpace: "fine" as const,
  fineRatio: 3,
  currentlyVisible: new Set<string>(),
  terrainVisible: new Set<string>(),
  lineOfSight: new Set([
    fogCellKey(13, 10),
    fogCellKey(13, 13),
    fogCellKey(14, 10),
  ]),
};
assert.equal(
  shouldRenderDarkAdjacentEntity({
    ...darkEntityContext,
    entityCell: [13, 10],
  }),
  true,
  "an entity touching the player's footprint in darkness should get a proximity silhouette",
);
assert.equal(
  shouldRenderDarkAdjacentEntity({
    ...darkEntityContext,
    entityCell: [13, 13],
  }),
  true,
  "dark proximity silhouettes should include diagonal adjacency",
);
assert.equal(
  shouldRenderDarkAdjacentEntity({
    ...darkEntityContext,
    entityCell: [14, 10],
  }),
  false,
  "an entity beyond immediate adjacency must remain hidden",
);
assert.equal(
  shouldRenderDarkAdjacentEntity({
    ...darkEntityContext,
    entityCell: [13, 10],
    lineOfSight: new Set<string>(),
  }),
  false,
  "adjacency must not reveal an entity through a LOS blocker",
);
assert.equal(
  shouldRenderDarkAdjacentEntity({
    ...darkEntityContext,
    entityCell: [13, 10],
    terrainVisible: new Set([fogCellKey(13, 10)]),
  }),
  false,
  "the proximity path must not reveal actors intentionally hidden in a lit cell",
);
assert.equal(
  shouldRenderDarkAdjacentEntity({
    ...darkEntityContext,
    entityCell: [13, 10],
    currentlyVisible: new Set([fogCellKey(13, 10)]),
  }),
  false,
  "currently visible entities must use the normal renderer instead of the silhouette path",
);

// Exercise the public store contract rather than reproducing its merge logic in
// the test. Exploration is a per-map set-like union during a run, while an
// explicit reset followed by initSave starts a new run with no map memory.
const play = usePlayStore.getState();
play.resetRun();
play.initSave("memory_map_a", [0, 0], [0, 1], "memory-vision-test");
assert.deepEqual(
  usePlayStore.getState().saveData?.explored_cells ?? {},
  {},
  "a new run must start without explored cells",
);

usePlayStore
  .getState()
  .markCellsExplored("memory_map_a", [fogCellKey(1, 1), fogCellKey(2, 2)]);
usePlayStore
  .getState()
  .markCellsExplored("memory_map_a", [fogCellKey(2, 2), fogCellKey(3, 3)]);
usePlayStore
  .getState()
  .markCellsExplored("memory_map_b", [fogCellKey(-1, 4)]);
assert.deepEqual(
  usePlayStore.getState().saveData?.explored_cells,
  {
    memory_map_a: [fogCellKey(1, 1), fogCellKey(2, 2), fogCellKey(3, 3)],
    memory_map_b: [fogCellKey(-1, 4)],
  },
  "exploration writes must deduplicate keys and preserve memory independently per map",
);

const beforeDuplicateWrite = usePlayStore.getState().saveData;
usePlayStore
  .getState()
  .markCellsExplored("memory_map_a", [fogCellKey(1, 1), fogCellKey(3, 3)]);
assert.equal(
  usePlayStore.getState().saveData,
  beforeDuplicateWrite,
  "a duplicate-only exploration write must not replace the save object",
);

usePlayStore.getState().resetRun();
usePlayStore.getState().initSave("memory_map_a", [0, 0], [0, 1], "memory-vision-test");
assert.deepEqual(
  usePlayStore.getState().saveData?.explored_cells ?? {},
  {},
  "reset plus new-run initialization must not inherit the prior run's exploration",
);
usePlayStore.getState().resetRun();

console.log(
  "Memory Vision contract passed: state priority, retained static structure, visible-only camera fade, flat fog materials, and per-run exploration union/reset.",
);
