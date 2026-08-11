import assert from "node:assert/strict";

import { GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP } from "../src/data/qaSuite/generatedBackroomsPhase6Wing";
import { isBackroomsLevelZeroWallObjectId } from "../src/schema/presets";
import {
  backroomsRenderChunkCoordinate,
  buildBackroomsRenderChunks,
  selectActiveBackroomsRenderChunks,
} from "../src/utils/backroomsRenderChunks";
import { buildPersistentAuthoredTerrainCellsFor3D } from "../src/utils/renderSpace";
import { generatedBackroomsPhase6Wing } from "../src/data/qaSuite/generatedBackroomsPhase6Wing";

const map = GENERATED_BACKROOMS_PHASE6_PREVIEW_MAP;
const cells = buildPersistentAuthoredTerrainCellsFor3D(map);
const chunks = buildBackroomsRenderChunks(cells);
const objectById = new Map(
  (generatedBackroomsPhase6Wing.objects || []).map((object) => [object.id, object]),
);

console.log("backrooms render chunks: stable authored partition");
assert.ok(chunks.length > 20, "proof map did not exercise spatial chunking");
assert.ok(
  chunks.some((chunk) => chunk.chunkX < 0 || chunk.chunkZ < 0),
  "proof map did not exercise negative chunk coordinates",
);
assert.equal(
  chunks.reduce((total, chunk) => total + chunk.cells.length, 0),
  cells.length,
);
assert.equal(
  new Set(chunks.flatMap((chunk) => chunk.cells)).size,
  cells.length,
  "a persistent cell appeared in more than one render chunk",
);

const estimatedTriangles = (cell: (typeof cells)[number]) => {
  const object = objectById.get(cell.object_id);
  const structure = isBackroomsLevelZeroWallObjectId(cell.object_id);
  const floor = structure ? 0 : 2;
  const wall = structure
    ? (object?.parts || []).reduce(
        (total, part) => total + (part.shape === "plane" ? 2 : 12),
        0,
      )
    : 0;
  const ceiling = cell.walkable || structure ? 2 : 0;
  return floor + wall + ceiling;
};

const totalTriangles = cells.reduce(
  (total, cell) => total + estimatedTriangles(cell),
  0,
);
let maximumActiveChunks = 0;
let maximumActiveCells = 0;
let maximumActiveTriangles = 0;
for (const center of chunks) {
  const active = selectActiveBackroomsRenderChunks(chunks, [
    center.chunkX,
    center.chunkZ,
  ]);
  const activeCells = active.flatMap((chunk) => chunk.cells);
  maximumActiveChunks = Math.max(maximumActiveChunks, active.length);
  maximumActiveCells = Math.max(maximumActiveCells, activeCells.length);
  maximumActiveTriangles = Math.max(
    maximumActiveTriangles,
    activeCells.reduce((total, cell) => total + estimatedTriangles(cell), 0),
  );
  assert.ok(active.some((chunk) => chunk.id === center.id));
}
assert.ok(maximumActiveChunks <= 13);
assert.ok(
  maximumActiveCells < cells.length * 0.45,
  `active chunks retained ${maximumActiveCells}/${cells.length} cells`,
);
assert.ok(
  maximumActiveTriangles < totalTriangles * 0.5,
  `active chunks retained ${maximumActiveTriangles}/${totalTriangles} triangles`,
);

console.log("backrooms render chunks: local coverage and bounded swaps");
const COVERAGE_RADIUS = 20;
for (const chunk of chunks) {
  const xs = chunk.cells.map((cell) => cell.x);
  const zs = chunk.cells.map((cell) => cell.z);
  const samples: [number, number][] = [
    [Math.min(...xs), Math.min(...zs)],
    [Math.min(...xs), Math.max(...zs)],
    [Math.max(...xs), Math.min(...zs)],
    [Math.max(...xs), Math.max(...zs)],
  ];
  for (const sample of samples) {
    const activeIds = new Set(
      selectActiveBackroomsRenderChunks(
        chunks,
        backroomsRenderChunkCoordinate(sample),
      ).map((candidate) => candidate.id),
    );
    for (const cell of cells) {
      if (Math.hypot(cell.x - sample[0], cell.z - sample[1]) > COVERAGE_RADIUS) {
        continue;
      }
      const [cellChunkX, cellChunkZ] = backroomsRenderChunkCoordinate([
        cell.x,
        cell.z,
      ]);
      assert.ok(
        activeIds.has(`${cellChunkX}:${cellChunkZ}`),
        `local cell ${cell.x}:${cell.z} was absent around ${sample.join(":")}`,
      );
    }
  }
}

for (const left of chunks) {
  for (const right of chunks) {
    if (
      Math.abs(left.chunkX - right.chunkX) +
        Math.abs(left.chunkZ - right.chunkZ) !== 1
    ) {
      continue;
    }
    const before = new Set(
      selectActiveBackroomsRenderChunks(chunks, [left.chunkX, left.chunkZ]).map(
        (chunk) => chunk.id,
      ),
    );
    const after = selectActiveBackroomsRenderChunks(chunks, [
      right.chunkX,
      right.chunkZ,
    ]).map((chunk) => chunk.id);
    assert.ok(
      after.filter((id) => !before.has(id)).length <= 5,
      "one chunk crossing replaced too much persistent geometry",
    );
  }
}

console.log(JSON.stringify({
  authoredCells: cells.length,
  chunks: chunks.length,
  maximumActiveChunks,
  maximumActiveCells,
  maximumActiveTriangles,
  totalTriangles,
}));
console.log("Backrooms textured render chunk contract passed.");
