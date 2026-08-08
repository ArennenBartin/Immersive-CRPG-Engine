// Backrooms generator — Phase 0 baseline fixture.
// Run: npm run test:backrooms-baseline
//
// This test does NOT exercise a generator. No Backrooms generator exists yet.
// It pins the engine contracts that a future `src/backroomsGen/` pipeline is
// planned to build on, so that later phases discover a contract change as a
// failing assertion here rather than as a surprise mid-implementation.
//
// Three groups:
//   1. the hand-authored Level 0 QA map is ordinary MapData, not a generator
//      output, and satisfies every precondition for a first-person launch;
//   2. the per-placement transform contract — what an anomaly placement can
//      and cannot express today;
//   3. the collision contract that clipped/embedded decor depends on.

import assert from "node:assert/strict";

import {
  MapDataSchema,
  ObjectPlacementSchema,
  type MapData,
  type ObjectData,
} from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  BACKROOMS_LEVEL_ZERO_MAP_ID,
  BACKROOMS_LEVEL_ZERO_SPAWN_ID,
} from "../src/data/qaSuite/backroomsWing";
import { expandMapToFine } from "../src/engine-core/fineWorld";
import {
  FINE_PER_MACRO,
  fineCenterOfMacro,
  fineOfMacro,
} from "../src/engine-core/gridCoordinates";
import { resolveAuthoredViewMode } from "../src/utils/firstPersonControls";
import {
  THIRD_PERSON_FACING_RING,
  facingToThirdPersonYaw,
  isThirdPersonCameraActive,
  isThirdPersonFreeMovementActive,
} from "../src/utils/thirdPersonControls";
import { placementHasCollision } from "../src/utils/objectFootprint";

// ── 1. The authored Level 0 QA map ─────────────────────────────────────────

console.log("backrooms baseline: authored Level 0 map is ordinary MapData");

const qaPackage = createQaSuitePackage();
const authoredMap = qaPackage.maps.find(
  (map) => map.id === BACKROOMS_LEVEL_ZERO_MAP_ID,
);

assert.ok(
  authoredMap,
  `the QA suite must ship ${BACKROOMS_LEVEL_ZERO_MAP_ID} as an authored map`,
);

// The runtime boundary for generated Backrooms content is ordinary MapData.
// Parsing the authored map through the shared schema proves the target output
// shape is reachable without a parallel runtime map type.
const parsedMap: MapData = MapDataSchema.parse(authoredMap);

assert.equal(
  parsedMap.generation,
  undefined,
  "the Level 0 QA map is hand-authored and must carry no generator provenance",
);
assert.ok(
  parsedMap.cells.length > 0,
  "the Level 0 QA map must author real cells rather than rely on runtime fill",
);

// ── 2. Third-person launch preconditions ───────────────────────────────────

// Third person is THE Backrooms play mode. First person is out of scope for
// this generator and is deliberately not asserted here.

console.log("backrooms baseline: Level 0 satisfies third-person launch");

// The view mode is resolved from package settings, not per map.
assert.equal(
  resolveAuthoredViewMode({ view_mode: "third_person" }),
  "third_person",
);
assert.equal(isThirdPersonCameraActive("third_person", "open"), true);

// Free movement is continuous rather than grid-stepped, and it survives combat
// only while the map is in horror_realtime. Level 0 authors that mode, so a
// Backrooms level never drops back to tactical stepping mid-encounter.
assert.equal(
  parsedMap.combat_mode,
  "horror_realtime",
  "Level 0 must stay in horror_realtime so free movement survives an encounter",
);
assert.equal(
  isThirdPersonFreeMovementActive("third_person", false, false),
  true,
  "third-person exploration must use free movement",
);
assert.equal(
  isThirdPersonFreeMovementActive("third_person", true, true),
  true,
  "horror_realtime must keep free movement active during combat",
);

const spawn = parsedMap.spawns.find(
  (entry) => entry.id === BACKROOMS_LEVEL_ZERO_SPAWN_ID,
);
assert.ok(spawn, "Level 0 must expose its documented entry spawn");

// Grid identity (saves, perception cones, model facing) quantizes to an
// 8-direction ring even though the camera itself follows a continuous heading.
const onFacingRing = THIRD_PERSON_FACING_RING.some(
  (facing) => facing[0] === spawn.facing[0] && facing[1] === spawn.facing[1],
);
assert.ok(
  onFacingRing,
  `spawn facing [${spawn.facing}] must be one of the 8 grid facings`,
);

// Camera yaw is continuous and derived from the authoritative heading, so
// generated content is free to face props at arbitrary angles without
// desynchronizing the camera from the grid.
const spawnYaw = facingToThirdPersonYaw(spawn.facing);
assert.ok(
  Number.isFinite(spawnYaw),
  "the third-person camera must resolve a finite yaw from the spawn facing",
);

// The player occupies a full FINE_PER_MACRO² block, so a spawn is only safe if
// every fine cell under that block is walkable after expansion.
const fineMap = expandMapToFine(parsedMap);
const fineByCoord = new Map(
  fineMap.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]),
);

const spawnFineOrigin = fineOfMacro([spawn.cell[0], spawn.cell[1]]);
for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
  for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
    const key = `${spawnFineOrigin[0] + dx}:${spawnFineOrigin[1] + dz}`;
    const cell = fineByCoord.get(key);
    assert.ok(cell, `spawn fine cell ${key} must exist after expansion`);
    assert.ok(
      cell.walkable,
      `spawn fine cell ${key} must be walkable for the player footprint`,
    );
  }
}

// A Backrooms level reads as interior. Level 0 leaves `environment` unset,
// which the renderer treats as an enclosed interior with a derived ceiling.
assert.notEqual(
  parsedMap.environment,
  "exterior",
  "Level 0 must render as an enclosed interior, not an open-sky exterior",
);

// ── 3. Per-placement transform contract ────────────────────────────────────

console.log("backrooms baseline: per-placement transform contract");

// Yaw is CONTINUOUS. The renderer derives it as atan2(facing[0], facing[1]),
// so a placement can express an arbitrary angle by writing a unit vector.
// Recursive-chain anomalies that rotate a few degrees per copy are therefore
// expressible today with no schema change.
const degrees = 1.5;
const radians = (degrees * Math.PI) / 180;
const rotatedPlacement = ObjectPlacementSchema.parse({
  object_id: "qa_desk",
  cell: [0, 0],
  facing: [Math.sin(radians), Math.cos(radians)],
});
const decodedYaw = Math.atan2(
  rotatedPlacement.facing[0],
  rotatedPlacement.facing[1],
);
assert.ok(
  Math.abs(decodedYaw - radians) < 1e-9,
  "a placement must round-trip an arbitrary continuous yaw through `facing`",
);

// Vertical offset is CONTINUOUS. Floor-sink and ceiling-intrusion anomalies can
// use it directly.
const sunkPlacement = ObjectPlacementSchema.parse({
  object_id: "qa_chair",
  cell: [1, 1],
  facing: [0, 1],
  height_offset: -0.18,
});
assert.equal(sunkPlacement.height_offset, -0.18);

// Horizontal sub-cell offset is QUANTIZED to whole fine cells, i.e. 1/3 of a
// macro cell. `fine_offset` is added to the macro tile's fine center, so a
// placement cannot be nudged by an arbitrary fraction of a cell.
const offsetPlacement = ObjectPlacementSchema.parse({
  object_id: "qa_cabinet",
  cell: [2, 2],
  facing: [0, 1],
  fine_offset: [1, 0],
});
assert.deepEqual(offsetPlacement.fine_offset, [1, 0]);
assert.throws(
  () =>
    ObjectPlacementSchema.parse({
      object_id: "qa_cabinet",
      cell: [2, 2],
      facing: [0, 1],
      fine_offset: [0.4, 0],
    }),
  "fine_offset is integer-only; sub-fine-cell horizontal offsets are not expressible",
);
const macroCenter = fineCenterOfMacro([2, 2]);
assert.equal(
  macroCenter[0] + offsetPlacement.fine_offset![0] - macroCenter[0],
  1,
  "one fine step is one third of a macro cell",
);
assert.equal(FINE_PER_MACRO, 3, "the runtime fine grid is 3x3 per macro cell");

// Scale is NOT a placement field. It lives on the shared object definition
// (`ObjectAssetSchema.scale`), so every copy of an object renders at the same
// size. A recursive chain that shrinks each copy cannot be expressed by
// placements alone today — it needs either one object definition per step or a
// new optional per-placement scale field. Phase 2 has to resolve this.
const scaleAttempt = ObjectPlacementSchema.parse({
  object_id: "qa_desk",
  cell: [3, 3],
  facing: [0, 1],
  scale: [0.84, 0.84, 0.84],
});
assert.ok(
  !("scale" in scaleAttempt),
  "per-placement `scale` is not part of the placement contract and is stripped",
);

// ── 4. Collision contract for clipped decor ────────────────────────────────

console.log("backrooms baseline: non-blocking decor collision contract");

const solidObject: ObjectData = {
  id: "qa_cabinet",
  display_name: "Filing Cabinet",
  category: "furniture",
  tags: [],
  origin: "center_floor",
  bounds: [1, 1, 1],
  materials: [],
  material_settings: [],
  model_kind: "parts",
  parts: [],
  decals: [],
  reference_images: [],
  collision: { profile: "single", footprint: [[0, 0]] },
};

// A placement of a solid object blocks by default.
assert.equal(
  placementHasCollision({ collision_mode: undefined }, solidObject),
  true,
  "a solid object blocks by default",
);

// Opting out is per placement, so the SAME object can be solid in one spot and
// non-blocking where it is embedded in geometry. This is the mechanism that
// keeps wall-clipped decor from becoming an invisible collider.
assert.equal(
  placementHasCollision({ collision_mode: "none" }, solidObject),
  false,
  "collision_mode='none' must disable blocking for an embedded placement",
);

console.log("Backrooms Phase 0 baseline fixture passed.");
