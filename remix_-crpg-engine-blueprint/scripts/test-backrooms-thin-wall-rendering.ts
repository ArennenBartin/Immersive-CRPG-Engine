// Backrooms thin-wall render consolidation contract.
// Run: npx tsx scripts/test-backrooms-thin-wall-rendering.ts

import assert from "node:assert/strict";

import {
  backroomsLevelZeroDamaskThinWallObjectId,
  backroomsLevelZeroThinWallObjectId,
} from "../src/schema/presets";
import { decomposeBackroomsLevelZeroThinWallObjectId } from "../src/utils/backroomsThinWallRendering";

const expectedFaceBits = (faceMask: number) =>
  [1, 2, 4, 8].filter((faceBit) => (faceMask & faceBit) !== 0);

for (const finish of ["aged", "damask"] as const) {
  const objectIdForMask =
    finish === "damask"
      ? backroomsLevelZeroDamaskThinWallObjectId
      : backroomsLevelZeroThinWallObjectId;
  const emittedObjectIds = new Set<string>();

  for (let faceMask = 0; faceMask <= 0xf; faceMask += 1) {
    const expectedIds = expectedFaceBits(faceMask).map(objectIdForMask);
    const decomposedIds = decomposeBackroomsLevelZeroThinWallObjectId(
      objectIdForMask(faceMask),
    );

    assert.deepEqual(
      decomposedIds,
      expectedIds,
      `${finish} mask ${faceMask.toString(16)} must decompose in N/E/S/W order`,
    );
    assert.equal(
      decomposedIds?.length,
      expectedFaceBits(faceMask).length,
      `${finish} mask ${faceMask.toString(16)} must emit one instance per face`,
    );
    decomposedIds?.forEach((objectId) => emittedObjectIds.add(objectId));
  }

  assert.deepEqual(
    [...emittedObjectIds],
    [1, 2, 4, 8].map(objectIdForMask),
    `${finish} masks must collapse to exactly four orientation buckets`,
  );
}

assert.equal(
  decomposeBackroomsLevelZeroThinWallObjectId("obj_unrelated"),
  undefined,
  "non-thin-wall objects must keep their normal render path",
);

console.log("Backrooms thin-wall render consolidation contract passed.");
