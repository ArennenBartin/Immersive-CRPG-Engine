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
