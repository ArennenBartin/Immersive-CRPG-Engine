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

type RenderSizedCell = CellData & { __render_cell_size?: number };

// Most runtime terrain is collapsed back to one full-size macro mesh. A macro
// block containing explicit fine-cell geometry keeps its individual cells and
// carries this private render-only footprint instead.
export const renderedCellWorldSize = (cell: CellData): number =>
  Math.max(0.001, Number((cell as RenderSizedCell).__render_cell_size) || 1);

// Detailed and lightweight distant terrain meet along a moving stream
// boundary. They must use the exact same vertical plane or a low third-person
// camera can see the clear color through the tiny step between them.
export const renderedTerrainPlaneY = (cell: CellData): number =>
  Number(cell.y || 0) + 0.001;

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

// Fog presentation is keyed by rendered macro cells, while a runtime object
// can sit between macro centers after a one-fine-cell push. Normalize an
// arbitrary rendered point through logical space before looking up its owning
// fog cell so those fractional placements do not fall through to "unseen".
export const worldPointToWorldMacroCell = (
  x: number,
  z: number,
  gridSpace: RendererGridSpace,
  fineRatio = FINE_PER_MACRO,
): [number, number] => {
  const logical = worldPointToLogicalCell(x, z, gridSpace, fineRatio);
  return logicalCellToMacro(logical, gridSpace);
};

const positiveModulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

const terrainRenderSignature = (cell: CellData) =>
  [
    cell.active,
    cell.walkable,
    cell.blocks_los,
    cell.height,
    cell.visual_height,
    cell.terrain || "",
    cell.object_id || "",
    cell.region_id || "",
    cell.room_id || "",
    cell.tag || "",
    cell.hazard || "",
    cell.infection || "",
    cell.portal_id || "",
    cell.surface_tag || "",
  ].join("|");

export const dedupeFineTerrainCellsFor3D = (
  cells: CellData[],
  fineRatio = FINE_PER_MACRO,
): CellData[] => {
  const blocks = new Map<string, CellData[]>();
  for (const cell of cells) {
    const macro = logicalCellToMacro([cell.x, cell.z], "fine");
    const key = `${macro[0]}:${cell.y || 0}:${macro[1]}`;
    const block = blocks.get(key) || [];
    block.push(cell);
    blocks.set(key, block);
  }

  const rendered: CellData[] = [];
  for (const block of blocks.values()) {
    const representative =
      block.find(
        (cell) =>
          positiveModulo(cell.x, fineRatio) === 0 &&
          positiveModulo(cell.z, fineRatio) === 0,
      ) || block[0];
    const signature = terrainRenderSignature(representative);
    const uniform = block.every(
      (cell) => terrainRenderSignature(cell) === signature,
    );

    if (uniform) {
      const macro = logicalCellToMacro(
        [representative.x, representative.z],
        "fine",
      );
      rendered.push({ ...representative, x: macro[0], z: macro[1] });
      continue;
    }

    const renderSize = 1 / fineRatio;
    block.forEach((cell) => {
      const [x, z] = logicalCellToWorld(
        [cell.x, cell.z],
        "fine",
        fineRatio,
      );
      rendered.push({
        ...cell,
        x,
        z,
        __render_cell_size: renderSize,
      } as RenderSizedCell);
    });
  }
  return rendered;
};
