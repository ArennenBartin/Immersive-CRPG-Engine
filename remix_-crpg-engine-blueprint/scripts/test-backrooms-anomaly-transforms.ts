// Backrooms generator — Phase 2: per-placement anomaly transforms.
// Run: npm run test:backrooms-anomaly-transforms
//
// Proves the engine can express the two anomaly classes a Backrooms generator
// needs, without letting either one touch navigation:
//
//   A. recursive chains  — one object, many placements, each smaller and more
//                          rotated than the last;
//   C. partial embedding — furniture driven partway into solid geometry.
//
// The load-bearing guarantee is the collision one. A desk that shrinks into a
// vanishing point and a cabinet buried in a wall are both scenery; if either
// produced a collider the player could not see the shape of, the anomaly would
// be a trap rather than an image.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  MapDataSchema,
  ObjectPlacementSchema,
  type ObjectData,
} from "../src/schema/game";
import { createQaSuitePackage } from "../src/data/qaSuiteInstaller";
import {
  BACKROOMS_LEVEL_ZERO_CABINET_PENETRATION_RATIO,
  BACKROOMS_LEVEL_ZERO_MAP_ID,
  BACKROOMS_LEVEL_ZERO_SPAWN_ID,
} from "../src/data/qaSuite/backroomsWing";
import {
  BACKROOMS_ANOMALY_OBJECTS,
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_DESK_OBJECT,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT,
  buildRecursiveChainPlacements,
  buildWallClippedPlacement,
} from "../src/data/backroomsAnomalyAssets";
import { expandMapToFine } from "../src/engine-core/fineWorld";
import { FINE_PER_MACRO, fineOfMacro } from "../src/engine-core/gridCoordinates";
import { placementHasCollision } from "../src/utils/objectFootprint";
import { logicalPlanOffsetToWorld } from "../src/utils/renderSpace";

// ── 1. The placement contract carries the transforms ───────────────────────

console.log("anomaly transforms: the placement schema round-trips them");

const transformed = ObjectPlacementSchema.parse({
  object_id: "qa_desk",
  cell: [4, 4],
  facing: [0, 1],
  scale: [0.84, 0.84, 0.84],
  rotation_offset: [0, 0.02618, 0],
  plan_offset: [0.4, -0.15],
});
assert.deepEqual(transformed.scale, [0.84, 0.84, 0.84]);
assert.deepEqual(transformed.rotation_offset, [0, 0.02618, 0]);
assert.deepEqual(transformed.plan_offset, [0.4, -0.15]);

// Non-uniform scale is legal — a desk stretched only along its length is a
// perfectly good proportion anomaly.
const nonUniform = ObjectPlacementSchema.parse({
  object_id: "qa_desk",
  cell: [0, 0],
  facing: [0, 1],
  scale: [1.4, 1, 0.8],
});
assert.deepEqual(nonUniform.scale, [1.4, 1, 0.8]);

// Zero and negative scale would invert or collapse geometry; reject both.
for (const bad of [[0, 1, 1], [-1, 1, 1]]) {
  assert.throws(
    () =>
      ObjectPlacementSchema.parse({
        object_id: "qa_desk",
        cell: [0, 0],
        facing: [0, 1],
        scale: bad,
      }),
    `scale ${JSON.stringify(bad)} must be rejected`,
  );
}

// The proof now exercises the complete production Blender kit rather than
// temporary box parts. The manifest and ObjectData library are two views of
// the same exports; drift in either one would otherwise survive until a prop
// silently renders at the wrong scale or stops loading.
interface BackroomsAnomalyManifestAsset {
  id: string;
  display_name: string;
  filename: string;
  url: string;
  origin: "center_floor";
  anchor: "floor" | "wall" | "partition";
  collision_policy: "runtime_placement_metadata" | "collision_mode_none";
  mesh_count: number;
  triangles: number;
  bounds_engine: [number, number, number];
  source_min_engine: [number, number, number];
  materials: string[];
  bytes: number;
}

interface BackroomsAnomalyManifest {
  kit_id: string;
  version: number;
  assets: BackroomsAnomalyManifestAsset[];
  phase7_contract: {
    minimum_validated_kit: number;
    glb_collision_meshes: "none";
    runtime_collision_owner: "ObjectPlacementData.collision_mode";
    embedded_collision_mode: "none";
    opaque_backing_required: boolean;
  };
  validation: {
    status: "PASS" | "FAIL";
    asset_count: number;
  };
}

const manifestPath = resolve(
  "public/models/environment/backrooms/anomalies/manifest.json",
);
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as BackroomsAnomalyManifest;
assert.equal(manifest.kit_id, "backrooms_phase7_anomaly_kit");
assert.equal(manifest.version, 2);
assert.equal(manifest.assets.length, 10, "the manifest must ship all ten kit assets");
assert.equal(
  BACKROOMS_ANOMALY_OBJECTS.length,
  10,
  "the engine library must register all ten kit assets",
);
assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 10);
assert.equal(new Set(BACKROOMS_ANOMALY_OBJECTS.map((object) => object.id)).size, 10);
assert.equal(manifest.validation.status, "PASS");
assert.equal(manifest.validation.asset_count, 10);
assert.equal(manifest.phase7_contract.minimum_validated_kit, 8);
assert.equal(manifest.phase7_contract.glb_collision_meshes, "none");
assert.equal(
  manifest.phase7_contract.runtime_collision_owner,
  "ObjectPlacementData.collision_mode",
);
assert.equal(manifest.phase7_contract.embedded_collision_mode, "none");
assert.equal(manifest.phase7_contract.opaque_backing_required, true);

const manifestByObjectId = new Map(
  manifest.assets.map((asset) => [`obj_${asset.id}`, asset]),
);
assert.deepEqual(
  [...manifestByObjectId.keys()].sort(),
  BACKROOMS_ANOMALY_OBJECTS.map((object) => object.id).sort(),
  "manifest IDs and ObjectData IDs must have one-to-one parity",
);

for (const object of BACKROOMS_ANOMALY_OBJECTS) {
  const manifestAsset = manifestByObjectId.get(object.id);
  assert.ok(manifestAsset, `${object.id} needs a manifest entry`);
  assert.equal(object.model_kind, "asset", `${object.id} must use its Blender GLB`);
  assert.equal(object.parts.length, 0, `${object.id} must not fall back to primitive parts`);
  assert.ok(object.asset?.data_url.endsWith(".glb"), `${object.id} needs a GLB URL`);
  assert.equal(object.display_name, manifestAsset.display_name);
  assert.equal(object.origin, manifestAsset.origin);
  assert.equal(object.asset!.filename, manifestAsset.filename);
  assert.equal(object.asset!.data_url, manifestAsset.url);
  assert.deepEqual(object.bounds, manifestAsset.bounds_engine);
  assert.deepEqual(object.asset!.source_bounds, manifestAsset.bounds_engine);
  assert.deepEqual(object.asset!.source_min, manifestAsset.source_min_engine);
  assert.deepEqual(object.materials, manifestAsset.materials);
  assert.deepEqual(object.asset!.material_names, manifestAsset.materials);
  assert.equal(object.asset!.stats.meshes, manifestAsset.mesh_count);
  assert.equal(object.asset!.stats.triangles, manifestAsset.triangles);
  assert.equal(object.asset!.stats.materials, manifestAsset.materials.length);
  assert.equal(object.asset!.stats.bytes, manifestAsset.bytes);
  const assetPath = resolve("public", object.asset!.data_url.replace(/^\//, ""));
  assert.equal(
    readFileSync(assetPath).subarray(0, 4).toString("ascii"),
    "glTF",
    `${object.id} must point at a valid binary glTF`,
  );
  assert.equal(
    statSync(assetPath).size,
    manifestAsset.bytes,
    `${object.id} byte metadata must match the shipped file`,
  );
  assert.equal(
    object.asset!.source_min[1],
    0,
    `${object.id} must retain its center-floor Blender origin`,
  );
  assert.equal(
    manifestAsset.collision_policy,
    object.collision.profile === "none"
      ? "collision_mode_none"
      : "runtime_placement_metadata",
    `${object.id} collision wording must match the runtime-supported policy`,
  );
}
assert.deepEqual(BACKROOMS_DESK_OBJECT.bounds, [0.96, 0.76, 0.58]);
assert.deepEqual(BACKROOMS_FILING_CABINET_OBJECT.bounds, [0.46, 1.32, 0.674]);

// An ordinary placement stays exactly as it was: no transform keys appear.
const ordinary = ObjectPlacementSchema.parse({
  object_id: "qa_desk",
  cell: [1, 1],
  facing: [0, 1],
});
for (const key of ["scale", "rotation_offset", "plan_offset"]) {
  assert.ok(
    !(key in ordinary),
    `an ordinary placement must not gain a ${key} key`,
  );
}

// ── 2. Recursive chains are deterministic ──────────────────────────────────

console.log("anomaly transforms: recursive chains are deterministic");

const chainOptions = {
  idPrefix: "test_chain",
  objectId: BACKROOMS_DESK_OBJECT_ID,
  originCell: [0, 0] as [number, number],
  step: [1, 0] as [number, number],
  facing: [0, 1] as [number, number],
  count: 6,
  scaleFalloff: 0.84,
  rotationStepDegrees: 7,
  tiltStepDegrees: 4,
  sinkStep: 0.028,
};
const chain = buildRecursiveChainPlacements(chainOptions);
const chainAgain = buildRecursiveChainPlacements(chainOptions);

assert.equal(chain.length, 6);
assert.deepEqual(chain, chainAgain, "the same options must rebuild the same chain");

// Each copy compounds on both rotation axes and sinks with its scale loss.
chain.forEach((placement, index) => {
  const expectedScale = Math.pow(0.84, index);
  assert.ok(
    Math.abs((placement.scale?.[0] ?? 0) - expectedScale) < 1e-9,
    `copy ${index} must be ${expectedScale.toFixed(4)}x`,
  );
  const expectedPitch = (4 * index * Math.PI) / 180;
  assert.ok(
    Math.abs((placement.rotation_offset?.[0] ?? 0) - expectedPitch) < 1e-9,
    `copy ${index} must be tilted ${4 * index}°`,
  );
  const expectedYaw = (7 * index * Math.PI) / 180;
  assert.ok(
    Math.abs((placement.rotation_offset?.[1] ?? 0) - expectedYaw) < 1e-9,
    `copy ${index} must be yawed ${7 * index}°`,
  );
  assert.ok(
    Math.abs((placement.height_offset ?? 0) - -0.028 * index) < 1e-9,
    `copy ${index} must be sunk ${(0.028 * index).toFixed(3)}m`,
  );
  assert.deepEqual(placement.cell, [index, 0], `copy ${index} sits one step further`);
});

// The chain must actually shrink, not merely differ.
const scales = chain.map((placement) => placement.scale?.[0] ?? 0);
for (let index = 1; index < scales.length; index += 1) {
  assert.ok(scales[index] < scales[index - 1], "each copy must be smaller");
}
assert.ok(scales[5] < 0.5, "the far copy must read as distinctly distant");

// Only the first copy is furniture. The rest are an image.
const deskObject: ObjectData = {
  id: BACKROOMS_DESK_OBJECT_ID,
  display_name: "Office Desk",
  category: "furniture",
  tags: [],
  origin: "center_floor",
  bounds: [1, 0.76, 1],
  materials: [],
  material_settings: [],
  model_kind: "parts",
  parts: [],
  decals: [],
  reference_images: [],
  collision: { profile: "single", footprint: [[0, 0]] },
};
assert.equal(
  placementHasCollision(chain[0], deskObject),
  true,
  "the first desk must be solid",
);
for (let index = 1; index < chain.length; index += 1) {
  assert.equal(
    placementHasCollision(chain[index], deskObject),
    false,
    `chain copy ${index} must be non-blocking scenery`,
  );
}

// ── 3. Partial embedding ───────────────────────────────────────────────────

console.log("anomaly transforms: embedded decor penetrates and never collides");

const clipped = buildWallClippedPlacement({
  id: "test_clip",
  objectId: BACKROOMS_FILING_CABINET_OBJECT_ID,
  cell: [3, 15],
  towardWall: [1, 0],
  penetrationRatio: 0.4,
});

// Real displacement toward the wall, not a coplanar overlap. A zero offset
// would leave the cabinet flush against the surface and z-fighting with it.
assert.deepEqual(clipped.plan_offset, [0.4, 0]);
assert.ok(
  Math.abs(clipped.plan_offset![0]) > 0.05,
  "penetration must be real displacement, not a coplanar sliver",
);
// It faces back out of the wall so its drawers stay visible.
assert.deepEqual(clipped.facing, [-1, 0]);

const cabinetObject: ObjectData = {
  ...deskObject,
  id: BACKROOMS_FILING_CABINET_OBJECT_ID,
  bounds: [1, 1.32, 1],
};
assert.equal(
  placementHasCollision(clipped, cabinetObject),
  false,
  "embedded decor must never collide",
);

// ── 4. The authored QA map carries both, without blocking itself ───────────

console.log("anomaly transforms: the Level 0 QA map stays navigable");

const qaPackage = createQaSuitePackage();
const map = MapDataSchema.parse(
  qaPackage.maps.find((entry) => entry.id === BACKROOMS_LEVEL_ZERO_MAP_ID),
);
const objectById = new Map(qaPackage.object_library.map((o) => [o.id, o]));
assert.equal(
  map.entity_placements.length,
  0,
  "the transform QA bay must remain free of combat/event interruptions",
);

// Both anomaly objects resolve — a placement pointing at a missing definition
// would silently render nothing.
for (const objectId of [
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
]) {
  assert.ok(
    objectById.has(objectId),
    `the QA package must define ${objectId}`,
  );
}

const deskPlacements = map.custom_object_placements.filter(
  (placement) => placement.object_id === BACKROOMS_DESK_OBJECT_ID,
);
const cabinetPlacements = map.custom_object_placements.filter(
  (placement) => placement.object_id === BACKROOMS_FILING_CABINET_OBJECT_ID,
);
assert.equal(deskPlacements.length, 6, "the authored chain is six desks");
assert.equal(cabinetPlacements.length, 1, "one authored embedded cabinet");

// Exactly one collider among all seven anomaly placements.
const blocking = [...deskPlacements, ...cabinetPlacements].filter((placement) =>
  placementHasCollision(placement, objectById.get(placement.object_id)),
);
assert.equal(
  blocking.length,
  1,
  `exactly one anomaly placement may collide, found ${blocking.length}`,
);

// The cabinet sinks into genuinely solid geometry rather than open air.
const cabinet = cabinetPlacements[0];
const [cabinetX, cabinetZ] = cabinet.cell;
const standingCell = map.cells.find(
  (cell) => cell.x === cabinetX && cell.z === cabinetZ,
);
assert.ok(standingCell?.walkable, "the visible half stands in open floor");
const wallCell = map.cells.find(
  (cell) =>
    cell.x === cabinetX + Math.sign(cabinet.plan_offset![0]) &&
    cell.z === cabinetZ + Math.sign(cabinet.plan_offset![1]),
);
assert.ok(
  wallCell && !wallCell.walkable,
  "an embedded piece needs opaque geometry to sink into",
);

// Every desk in the chain stands on walkable floor, so none of them is buried
// in a wall by accident.
for (const placement of deskPlacements) {
  const cell = map.cells.find(
    (entry) => entry.x === placement.cell[0] && entry.z === placement.cell[1],
  );
  assert.ok(
    cell?.walkable,
    `desk at ${placement.cell} must stand on floor`,
  );
}

// The spawn footprint stays clear after fine expansion — the anomalies must
// not have grown into the arrival cell.
const fineMap = expandMapToFine(map);
const fineByCoord = new Map(
  fineMap.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]),
);
const spawn = map.spawns.find(
  (entry) => entry.id === BACKROOMS_LEVEL_ZERO_SPAWN_ID,
)!;
const spawnOrigin = fineOfMacro([spawn.cell[0], spawn.cell[1]]);
for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
  for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
    const cell = fineByCoord.get(
      `${spawnOrigin[0] + dx}:${spawnOrigin[1] + dz}`,
    );
    assert.ok(cell?.walkable, "the spawn footprint must remain walkable");
  }
}

// Fine expansion rescales the horizontal offset so the authored macro-cell
// penetration stays identical once one world unit is a fine cell.
const fineCabinet = fineMap.custom_object_placements.find(
  (placement) => placement.object_id === BACKROOMS_FILING_CABINET_OBJECT_ID,
)!;
assert.ok(
  Math.abs(
    fineCabinet.plan_offset![0] -
      BACKROOMS_LEVEL_ZERO_CABINET_PENETRATION_RATIO * FINE_PER_MACRO,
  ) < 1e-9,
  "plan_offset must scale with the fine ratio to preserve its authored meaning",
);
const renderedFineCabinetOffset = logicalPlanOffsetToWorld(
  fineCabinet.plan_offset!,
  "fine",
  FINE_PER_MACRO,
);
assert.ok(
  Math.abs(
    renderedFineCabinetOffset[0] -
      BACKROOMS_LEVEL_ZERO_CABINET_PENETRATION_RATIO,
  ) < 1e-9 &&
    Math.abs(renderedFineCabinetOffset[1]) < 1e-9,
  "fine-grid rendering must recover the same moderate embed shown by the macro editor",
);
// Vertical offsets are unaffected by the horizontal ratio, so they must not be
// rescaled alongside it.
const fineChainHead = fineMap.custom_object_placements.find(
  (placement) => placement.id === "qa_backrooms_desk_chain_00",
)!;
assert.deepEqual(
  fineChainHead.scale,
  [1, 1, 1],
  "expansion must not disturb placement scale",
);

console.log("Backrooms anomaly transform tests passed.");
