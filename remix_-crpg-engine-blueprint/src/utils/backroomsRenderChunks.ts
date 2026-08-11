import type { CellData } from "../schema/game";

export const BACKROOMS_RENDER_CHUNK_SIZE = 20;
export const BACKROOMS_RENDER_CHUNK_MANHATTAN_RADIUS = 2;

export type BackroomsRenderChunk = {
  id: string;
  chunkX: number;
  chunkZ: number;
  cells: CellData[];
};

export const backroomsRenderChunkCoordinate = (
  worldCell: readonly [number, number],
  chunkSize = BACKROOMS_RENDER_CHUNK_SIZE,
): [number, number] => [
  Math.floor(worldCell[0] / chunkSize),
  Math.floor(worldCell[1] / chunkSize),
];

export const backroomsRenderChunkId = (chunkX: number, chunkZ: number) =>
  `${chunkX}:${chunkZ}`;

/**
 * Partitions the immutable authored presentation cells once. Chunks retain
 * their cell-array identity for the lifetime of the loaded map, so camera yaw
 * and fine movement cannot regroup or re-upload their architecture.
 */
export const buildBackroomsRenderChunks = (
  cells: readonly CellData[],
  chunkSize = BACKROOMS_RENDER_CHUNK_SIZE,
): BackroomsRenderChunk[] => {
  const byId = new Map<string, BackroomsRenderChunk>();
  for (const cell of cells) {
    const [chunkX, chunkZ] = backroomsRenderChunkCoordinate(
      [cell.x, cell.z],
      chunkSize,
    );
    const id = backroomsRenderChunkId(chunkX, chunkZ);
    const chunk = byId.get(id) || {
      id,
      chunkX,
      chunkZ,
      cells: [],
    };
    chunk.cells.push(cell);
    byId.set(id, chunk);
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.chunkZ - right.chunkZ || left.chunkX - right.chunkX,
  );
};

/**
 * A two-ring Manhattan diamond keeps 13 chunks around Steve. It guarantees
 * two complete chunks in cardinal sightlines and a full diagonal neighbor,
 * while avoiding the 40+ chunk full-level submission that caused the Level
 * Zero renderer to remain expensive after simulation streaming was fixed.
 */
export const selectActiveBackroomsRenderChunks = (
  chunks: readonly BackroomsRenderChunk[],
  centerChunk: readonly [number, number],
  radius = BACKROOMS_RENDER_CHUNK_MANHATTAN_RADIUS,
): BackroomsRenderChunk[] => chunks.filter(
  (chunk) =>
    Math.abs(chunk.chunkX - centerChunk[0]) +
      Math.abs(chunk.chunkZ - centerChunk[1]) <= radius,
);

