import {
  FINE_HALF_EXTENT,
  FINE_PER_MACRO,
  macroOfFine,
  type GridCoord,
} from "../engine-core/gridCoordinates";
import type { CellData } from "../schema/game";

export type RendererGridSpace = "macro" | "fine";

export const logicalCoordToWorld = (
  value: number,
  gridSpace: RendererGridSpace,
  fineRatio = FINE_PER_MACRO,
): number =>
  gridSpace === "fine" ? (value - FINE_HALF_EXTENT) / fineRatio : value;

export const worldCoordToLogical = (
  value: number,
  gridSpace: RendererGridSpace,
  fineRatio = FINE_PER_MACRO,
): number =>
  gridSpace === "fine"
    ? Math.round(value * fineRatio + FINE_HALF_EXTENT)
    : Math.round(value);

export const logicalCellToWorld = (
  cell: readonly unknown[],
  gridSpace: RendererGridSpace,
  fineRatio = FINE_PER_MACRO,
): [number, number] => [
  logicalCoordToWorld(Number(cell[0] || 0), gridSpace, fineRatio),
  logicalCoordToWorld(Number(cell[1] || 0), gridSpace, fineRatio),
];

export const worldPointToLogicalCell = (
  x: number,
  z: number,
  gridSpace: RendererGridSpace,
  fineRatio = FINE_PER_MACRO,
): [number, number] => [
  worldCoordToLogical(x, gridSpace, fineRatio),
  worldCoordToLogical(z, gridSpace, fineRatio),
];

// Terrain is authored and rendered once per macro tile, while authoritative
// visibility is resolved against every fine cell. Convert the rendered macro
// mesh's world-space center back to the complete fine-cell block it covers.
// Starting from the center fine cell would shift the sampled block into the
// next macro tile and can incorrectly cull approach-facing wall edges.
export const fineCellsCoveredByWorldMacroCell = (
  x: number,
  z: number,
  fineRatio = FINE_PER_MACRO,
): [number, number][] => {
  const logicalCenter = worldPointToLogicalCell(x, z, "fine", fineRatio);
  const macroX = Math.floor(logicalCenter[0] / fineRatio);
  const macroZ = Math.floor(logicalCenter[1] / fineRatio);
  const originX = macroX * fineRatio;
  const originZ = macroZ * fineRatio;
  const cells: [number, number][] = [];

  for (let dz = 0; dz < fineRatio; dz += 1) {
    for (let dx = 0; dx < fineRatio; dx += 1) {
      cells.push([originX + dx, originZ + dz]);
    }
  }

  return cells;
};

export const logicalCellWorldSize = (
  gridSpace: RendererGridSpace,
  fineRatio = FINE_PER_MACRO,
): number => (gridSpace === "fine" ? 1 / fineRatio : 1);

export const isWorldPointInCameraOcclusionCorridor = (
  point: readonly [number, number],
  focus: readonly [number, number],
  cameraAzimuth: number,
  maxDistance: number,
  halfWidth: number,
): boolean => {
  const dx = point[0] - focus[0];
  const dz = point[1] - focus[1];
  const cameraDirX = Math.cos(cameraAzimuth);
  const cameraDirZ = Math.sin(cameraAzimuth);
  const alongCameraRay = dx * cameraDirX + dz * cameraDirZ;
  const perpendicularDistance = Math.abs(
    dx * cameraDirZ - dz * cameraDirX,
  );

  return (
    alongCameraRay > 0 &&
    alongCameraRay < maxDistance &&
    perpendicularDistance < halfWidth
  );
};

export const logicalCellToMacro = (
  cell: readonly unknown[],
  gridSpace: RendererGridSpace,
): [number, number] => {
  if (gridSpace === "macro") {
    return [Number(cell[0] || 0), Number(cell[1] || 0)];
  }
  const macro = macroOfFine([
    Number(cell[0] || 0),
    Number(cell[1] || 0),
  ] as GridCoord);
  return [macro[0], macro[1]];
};

const positiveModulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export const dedupeFineTerrainCellsFor3D = (
  cells: CellData[],
  fineRatio = FINE_PER_MACRO,
): CellData[] =>
  cells
    .filter(
      (cell) =>
        positiveModulo(cell.x, fineRatio) === 0 &&
        positiveModulo(cell.z, fineRatio) === 0,
    )
    .map((cell) => {
      const macro = logicalCellToMacro([cell.x, cell.z], "fine");
      return { ...cell, x: macro[0], z: macro[1] };
    });
