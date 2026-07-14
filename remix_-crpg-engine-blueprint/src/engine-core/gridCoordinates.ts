// Coordinate bridge for the grid-subdivision rebuild.
//
// Two resolutions exist: MACRO tiles (authored maps, art, triggers, quest
// coordinates, skill numbers) and FINE cells (movement, collision, footprints,
// combat resolution, LOS sampling, chemistry). FINE_PER_MACRO is the single
// source of truth for the ratio — never hard-code it elsewhere. The engine
// expands authored macro content to fine cells at load (see fineWorld.ts);
// designers never author in fine coordinates.
//
// Phase A proved this seam at ratio 1 (identity). Phase B runs the world at 3:
// a macro tile is a 3×3 fine block and an actor is a 3×3 fine footprint whose
// position is its CENTER fine cell (the macro tile's middle cell).

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type GridCoord = readonly [number, number];
export type MacroCoord = Brand<readonly [number, number], "MacroCoord">;
export type FineCoord = Brand<readonly [number, number], "FineCoord">;
export type GridCoordKey = Brand<string, "GridCoordKey">;

// Typed as number (not the literal) so ratio-conditional code type-checks at
// any configured ratio.
export const FINE_PER_MACRO: number = 3;

// Half-extent of a macro tile / actor footprint around its center fine cell.
// Ratio 3 → 1 (center ± 1); ratio 1 → 0 (footprint collapses to one cell).
export const FINE_HALF_EXTENT = Math.floor((FINE_PER_MACRO - 1) / 2);

export const macroCoord = (x: number, z: number): MacroCoord => [x, z] as unknown as MacroCoord;

export const fineCoord = (x: number, z: number): FineCoord => [x, z] as unknown as FineCoord;

export const fineOfMacro = (coord: GridCoord): FineCoord =>
  fineCoord(coord[0] * FINE_PER_MACRO, coord[1] * FINE_PER_MACRO);

// The center fine cell of a macro tile — where point-authored content (spawns,
// entities, items, triggers, exits) lands when the world expands.
export const fineCenterOfMacro = (coord: GridCoord): FineCoord =>
  fineCoord(
    coord[0] * FINE_PER_MACRO + FINE_HALF_EXTENT,
    coord[1] * FINE_PER_MACRO + FINE_HALF_EXTENT,
  );

export const macroOfFine = (coord: GridCoord): MacroCoord =>
  macroCoord(Math.floor(coord[0] / FINE_PER_MACRO), Math.floor(coord[1] / FINE_PER_MACRO));

export const fineBlockForMacro = (coord: GridCoord): FineCoord[] => {
  const origin = fineOfMacro(coord);
  const cells: FineCoord[] = [];
  for (let dx = 0; dx < FINE_PER_MACRO; dx += 1) {
    for (let dz = 0; dz < FINE_PER_MACRO; dz += 1) {
      cells.push(fineCoord(origin[0] + dx, origin[1] + dz));
    }
  }
  return cells;
};

// An actor's footprint: the FINE_PER_MACRO × FINE_PER_MACRO block centered on
// its fine cell. At ratio 1 this is just the cell itself.
export const actorFootprintCells = (center: GridCoord): FineCoord[] => {
  const cells: FineCoord[] = [];
  for (let dx = -FINE_HALF_EXTENT; dx <= FINE_HALF_EXTENT; dx += 1) {
    for (let dz = -FINE_HALF_EXTENT; dz <= FINE_HALF_EXTENT; dz += 1) {
      cells.push(fineCoord(center[0] + dx, center[1] + dz));
    }
  }
  return cells;
};

// The leading edge of a footprint moving one fine step in (dx,dz): only the
// newly-entered cells need collision checks.
export const footprintLeadingCells = (
  center: GridCoord,
  dx: number,
  dz: number,
): FineCoord[] => {
  const cells: FineCoord[] = [];
  const nx = center[0] + dx;
  const nz = center[1] + dz;
  for (let ox = -FINE_HALF_EXTENT; ox <= FINE_HALF_EXTENT; ox += 1) {
    for (let oz = -FINE_HALF_EXTENT; oz <= FINE_HALF_EXTENT; oz += 1) {
      const cx = nx + ox;
      const cz = nz + oz;
      // Skip cells the footprint already occupied before the step.
      if (
        Math.abs(cx - center[0]) <= FINE_HALF_EXTENT &&
        Math.abs(cz - center[1]) <= FINE_HALF_EXTENT
      )
        continue;
      cells.push(fineCoord(cx, cz));
    }
  }
  return cells;
};

// Two footprint-actors overlap when their centers are closer than one full
// footprint on both axes.
export const footprintsOverlap = (a: GridCoord, b: GridCoord): boolean =>
  Math.abs(a[0] - b[0]) < FINE_PER_MACRO && Math.abs(a[1] - b[1]) < FINE_PER_MACRO;

// A fine cell is inside an actor's footprint.
export const footprintContainsCell = (center: GridCoord, cell: GridCoord): boolean =>
  Math.abs(cell[0] - center[0]) <= FINE_HALF_EXTENT &&
  Math.abs(cell[1] - center[1]) <= FINE_HALF_EXTENT;

// True when a one-cell step in `facing` would move any part of the actor's
// footprint into the target footprint. Faced interactions and bump attacks
// use the whole leading edge, rather than a single ray from the center cell.
export const footprintIntersectsLeadingEdge = (
  center: GridCoord,
  facing: GridCoord,
  targetCenter: GridCoord,
): boolean =>
  footprintLeadingCells(center, facing[0], facing[1]).some((cell) =>
    footprintContainsCell(targetCenter, cell),
  );

export const fineCoordKey = (x: number, z: number): GridCoordKey => `${x}:${z}` as GridCoordKey;

export const coordKey = (coord: GridCoord): GridCoordKey => fineCoordKey(coord[0], coord[1]);

export const parseFineCoordKey = (key: string): FineCoord => {
  const [x, z] = key.split(":").map(Number);
  return fineCoord(x, z);
};

export const macroCoordKey = (x: number, z: number): GridCoordKey =>
  `${x}:${z}` as GridCoordKey;

export const macroKeyOfFine = (coord: GridCoord): GridCoordKey => {
  const m = macroOfFine(coord);
  return macroCoordKey(m[0], m[1]);
};

// Authored distances (skill range, AoE reach, chase radii, knockback tiles)
// are macro numbers; the simulation resolves them in fine cells.
export const scaleMacroDistanceToFine = (distance: number): number => distance * FINE_PER_MACRO;

export const fineManhattanDistance = (a: GridCoord, b: GridCoord): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export const fineChebyshevDistance = (a: GridCoord, b: GridCoord): number =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

export const macroManhattanDistance = (a: GridCoord, b: GridCoord): number =>
  fineManhattanDistance(macroOfFine(a), macroOfFine(b));

// "Melee adjacency" for footprint actors: one fine step in at least one
// direction would make the footprints overlap. This covers the full edge and
// corners of a collision footprint, including laterally offset actors.
// Never test raw center-to-center fine distance for adjacency semantics.
export const areAdjacentMacro = (a: GridCoord, b: GridCoord): boolean =>
  fineChebyshevDistance(a, b) <= FINE_PER_MACRO;

export const sameMacroCoord = (a: GridCoord, b: GridCoord): boolean => {
  const ma = macroOfFine(a);
  const mb = macroOfFine(b);
  return ma[0] === mb[0] && ma[1] === mb[1];
};

// A fine cell lies inside the macro tile that an authored point coordinate
// (converted to its macro-center fine cell) occupies.
export const withinSameMacroTile = sameMacroCoord;

export const FINE_CARDINAL_DIRECTIONS: readonly FineCoord[] = [
  fineCoord(0, -1),
  fineCoord(1, 0),
  fineCoord(0, 1),
  fineCoord(-1, 0),
];

// Exploration movement economy: one macro tile of walking costs the same
// energy as one legacy step; a fine step costs a third of it. Combat budgets
// stay expressed per macro-distance (§5.3 of the rebuild spec).
export const ENERGY_PER_MACRO_STEP = 1000;
export const ENERGY_PER_FINE_STEP = Math.round(ENERGY_PER_MACRO_STEP / FINE_PER_MACRO);
