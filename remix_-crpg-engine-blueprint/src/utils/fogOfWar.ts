import type {
  CellData,
  MapData,
  ObjectData,
  ObjectPlacementData,
} from "../schema/game";
import type { MapDelta } from "../schema/save";
import { fineCoordKey } from "../engine-core/gridCoordinates";
import { doorPlacementKey, isBuildingDoorPlacement, isDoorPlacementOpen } from "./doorPlacement";
import { getPlacementFootprint, placementHasCollision } from "./objectFootprint";
import {
  fineCellsCoveredByWorldMacroCell,
  logicalCellToMacro,
  type RendererGridSpace,
} from "./renderSpace";

export const fogCellKey = fineCoordKey;

export type FogRenderState = "visible" | "explored" | "unseen";

export interface AuthoritativeFogPresentationCell {
  key: string;
  world_cell: [number, number];
  logical_center: [number, number];
  fine_cells: [number, number][];
  state: FogRenderState;
}

export type FogMemoryLabel = "Unknown" | "Remembered" | "Visible";

export const fogMemoryLabel = (state: FogRenderState): FogMemoryLabel =>
  state === "visible"
    ? "Visible"
    : state === "explored"
      ? "Remembered"
      : "Unknown";

// Darkness may still communicate immediate physical proximity without
// promoting an actor into current visual perception. This predicate is kept
// presentation-only: it never changes visibility, discovery, AI, or combat
// state, and it refuses to expose actors through a LOS blocker or in lit cells
// where another acquisition rule is intentionally keeping them hidden.
export const shouldRenderDarkAdjacentEntity = ({
  entityCell,
  viewerCell,
  gridSpace,
  fineRatio,
  currentlyVisible,
  terrainVisible,
  lineOfSight,
}: {
  entityCell: readonly [number, number];
  viewerCell: readonly [number, number];
  gridSpace: RendererGridSpace;
  fineRatio: number;
  currentlyVisible: ReadonlySet<string>;
  terrainVisible: ReadonlySet<string>;
  lineOfSight: ReadonlySet<string>;
}): boolean => {
  const key = fogCellKey(entityCell[0], entityCell[1]);
  if (
    currentlyVisible.has(key) ||
    terrainVisible.has(key) ||
    !lineOfSight.has(key)
  ) {
    return false;
  }

  const distance = Math.max(
    Math.abs(entityCell[0] - viewerCell[0]),
    Math.abs(entityCell[1] - viewerCell[1]),
  );
  const adjacencyRadius = gridSpace === "fine" ? fineRatio : 1;
  return distance > 0 && distance <= adjacencyRadius;
};

const MEMORY_STRUCTURE_TERMS =
  /wall|floor|roof|architect|structure|landmark|cliff|bridge|stair|terrain|landform|ruin|spire|building|column/;
const MEMORY_DYNAMIC_TERMS =
  /door|container|chest|crate|interactable|movable|portable|temporary|hazard|item|loot|actor|npc|light/;

export const isStableMemoryStructureObject = (
  object: ObjectData | undefined,
) => {
  if (!object) return false;
  const identity = `${object.id} ${object.category} ${(object.tags || []).join(" ")}`.toLowerCase();
  return (
    MEMORY_STRUCTURE_TERMS.test(identity) &&
    !MEMORY_DYNAMIC_TERMS.test(identity)
  );
};

export interface StructureFogCompositePolicy {
  render: boolean;
  postFog: boolean;
  cameraFaded: boolean;
}

export interface FogCurtainProfile {
  height: number;
  opacity: number;
  full_height: boolean;
}

// Full-height curtains belong to real LOS-blocking structure edges. On open
// walkable floor, a low mist skirt preserves the volumetric fog transition
// without looking like an invisible wall the player can walk through.
export const resolveFogCurtainProfile = (
  state: Exclude<FogRenderState, "visible">,
  edgeTouchesLosBlocker: boolean,
): FogCurtainProfile => {
  if (edgeTouchesLosBlocker) {
    return state === "unseen"
      ? { height: 2.8, opacity: 0.92, full_height: true }
      : { height: 1.9, opacity: 0.42, full_height: true };
  }
  return state === "unseen"
    ? { height: 0.42, opacity: 0.3, full_height: false }
    : { height: 0.28, opacity: 0.18, full_height: false };
};

// Static structure geometry is never removed or promoted into a special
// post-fog pass. Its material owns visible/explored/unseen darkness, preserving
// wall topology and ordinary depth behavior. Camera fading is independent of
// fog state: a remembered or unknown foreground wall must not hide the player
// simply because the wall itself is dark.
export const resolveStructureFogCompositePolicy = (
  state: FogRenderState,
  cameraOccluded: boolean,
): StructureFogCompositePolicy => ({
  render: true,
  postFog: false,
  cameraFaded: cameraOccluded,
});

// Rendering consumes the authoritative visibility layers as a strict
// three-state mask. Turning Fog off reveals static world geometry, while live
// actors/items may still use current visibility for darkness and stealth.
export const classifyFogRenderState = (
  key: string,
  fogEnabled: boolean,
  currentlyVisible: ReadonlySet<string>,
  discovered: ReadonlySet<string>,
  memoryLineOfSight?: ReadonlySet<string>,
): FogRenderState => {
  if (!fogEnabled || currentlyVisible.has(key)) return "visible";
  if (
    discovered.has(key) &&
    (!memoryLineOfSight || memoryLineOfSight.has(key))
  ) {
    return "explored";
  }
  return "unseen";
};

// A single macro terrain mesh represents multiple authoritative fine cells.
// Preserve the mesh when any covered cell is currently visible. Structural
// memory is footprint-wide: the face learned earlier and the face reached by
// the viewer's current LOS do not need to be the same fine sample. Requiring
// an exact-key intersection made 3x3 floors appear as isolated indigo pixels
// and made thick remembered walls blink black when approached from a new side.
export const classifyFogRenderStateForCells = (
  cells: readonly (readonly [number, number])[],
  fogEnabled: boolean,
  currentlyVisible: ReadonlySet<string>,
  discovered: ReadonlySet<string>,
  memoryLineOfSight?: ReadonlySet<string>,
): FogRenderState => {
  if (!fogEnabled) return "visible";

  let sawVisible = false;
  let sawDiscovered = false;
  let sawMemoryLineOfSight = memoryLineOfSight === undefined;
  let sawLineOfSightWithoutPresentLight = false;
  for (const cell of cells) {
    const key = fogCellKey(cell[0], cell[1]);
    const visible = currentlyVisible.has(key);
    const inMemoryLineOfSight = memoryLineOfSight?.has(key) ?? false;
    if (visible) sawVisible = true;
    if (discovered.has(key)) sawDiscovered = true;
    if (inMemoryLineOfSight) {
      sawMemoryLineOfSight = true;
      if (!visible) sawLineOfSightWithoutPresentLight = true;
    }
  }

  // Without the fine LOS field, retain the legacy macro behavior used by the
  // editor and non-authoritative render paths. In Play, however, a single lit
  // fine sample must not promote the whole 3x3 floor/wall mesh to ordinary
  // authored color. Keep a partially lit known structure on its indigo memory
  // base and let the exact fine-cell light layer reveal only the illuminated
  // portion. This is presentation-only; `currentlyVisible` remains untouched.
  if (sawVisible && !sawLineOfSightWithoutPresentLight) return "visible";
  if (sawVisible && memoryLineOfSight !== undefined) return "explored";
  return sawDiscovered && sawMemoryLineOfSight ? "explored" : "unseen";
};

// Discovery is recorded on fine simulation cells, while a stable floor or
// wall is presented as one authored macro structure. Once any part of that
// structure is known, every fine sample in its presentation footprint may
// carry the same architectural memory. Current LOS is intentionally *not*
// expanded here; it still clips the remembered silhouette precisely.
export const expandStructuralMemoryAcrossPresentationFootprints = (
  presentationCells: readonly Pick<
    AuthoritativeFogPresentationCell,
    "fine_cells"
  >[],
  discovered: ReadonlySet<string>,
): Set<string> => {
  const expanded = new Set(discovered);
  presentationCells.forEach((presentationCell) => {
    const footprintKnown = presentationCell.fine_cells.some((cell) =>
      discovered.has(fogCellKey(cell[0], cell[1])),
    );
    if (!footprintKnown) return;
    presentationCell.fine_cells.forEach((cell) =>
      expanded.add(fogCellKey(cell[0], cell[1])),
    );
  });
  return expanded;
};

// Authoritative visibility is resolved on the fine simulation grid while the
// 3D terrain is rendered once per macro tile. Build that visual mapping once
// and share it between geometry and fog overlays so a wall cannot be removed
// by one pass while a different pass still draws its shadow or curtain.
export const buildAuthoritativeFogPresentationPlan = ({
  cells,
  gridSpace,
  fineRatio,
  fogEnabled,
  terrainVisible,
  discovered,
  memoryLineOfSight,
}: {
  cells: readonly CellData[];
  gridSpace: RendererGridSpace;
  fineRatio: number;
  fogEnabled: boolean;
  terrainVisible: ReadonlySet<string>;
  discovered: ReadonlySet<string>;
  memoryLineOfSight?: ReadonlySet<string>;
}): AuthoritativeFogPresentationCell[] => {
  const visualCells = new Map<
    string,
    Omit<AuthoritativeFogPresentationCell, "state">
  >();

  cells.forEach((cell) => {
    const macro = logicalCellToMacro([cell.x, cell.z], gridSpace);
    const worldCell: [number, number] =
      gridSpace === "fine" ? [macro[0], macro[1]] : [cell.x, cell.z];
    const key = fogCellKey(worldCell[0], worldCell[1]);
    if (visualCells.has(key)) return;

    const logicalCenter: [number, number] =
      gridSpace === "fine"
        ? [
            macro[0] * fineRatio + Math.floor(fineRatio / 2),
            macro[1] * fineRatio + Math.floor(fineRatio / 2),
          ]
        : [cell.x, cell.z];
    const fineCells =
      gridSpace === "fine"
        ? fineCellsCoveredByWorldMacroCell(
            worldCell[0],
            worldCell[1],
            fineRatio,
          )
        : ([logicalCenter] as [number, number][]);

    visualCells.set(key, {
      key,
      world_cell: worldCell,
      logical_center: logicalCenter,
      fine_cells: fineCells,
    });
  });

  return Array.from(visualCells.values())
    .map((cell) => ({
      ...cell,
      state: classifyFogRenderStateForCells(
        cell.fine_cells,
        fogEnabled,
        terrainVisible,
        discovered,
        memoryLineOfSight,
      ),
    }))
    .sort(
      (left, right) =>
        left.world_cell[0] - right.world_cell[0] ||
        left.world_cell[1] - right.world_cell[1],
    );
};

const isDoorObject = (placement: ObjectPlacementData, objectDef?: ObjectData) =>
  isBuildingDoorPlacement(placement) || Boolean(objectDef?.tags?.includes("door"));

const isDoorOpenForFog = (delta: MapDelta | undefined, placement: ObjectPlacementData) =>
  isDoorPlacementOpen(delta, placement) || Boolean(delta?.opened_doors?.includes(doorPlacementKey(placement)));

export const placementBlocksFogLineOfSight = (
  placement: ObjectPlacementData,
  objectDef: ObjectData | undefined,
  delta: MapDelta | undefined,
) => {
  if (isDoorObject(placement, objectDef)) {
    return (
      placementHasCollision(placement, objectDef) &&
      !isDoorOpenForFog(delta, placement)
    );
  }

  // Collision and sight are deliberately independent. A terminal or crate can
  // occupy a movement cell without casting a wall-sized vision shadow, while
  // reeds and other soft obstacles may obscure sight without blocking travel.
  const tags = new Set(objectDef?.tags || []);
  return tags.has("blocks_los") || tags.has("wall");
};

export const createFogLineOfSightBlockers = (
  placements: ObjectPlacementData[],
  objectById: Map<string, ObjectData>,
  delta?: MapDelta,
) => {
  const blockers = new Set<string>();
  placements.forEach((placement) => {
    const objectDef = objectById.get(placement.object_id);
    if (!placementBlocksFogLineOfSight(placement, objectDef, delta)) return;
    getPlacementFootprint(placement, objectDef).forEach(([x, z]) => blockers.add(fogCellKey(x, z)));
  });
  return blockers;
};

export const hasFogLineOfSight = (
  from: [number, number],
  to: [number, number],
  blocksLineOfSight: (x: number, z: number) => boolean,
) => {
  const [px, pz] = from;
  const [tx, tz] = to;
  let x = px;
  let z = pz;
  const dx = Math.abs(tx - px);
  const dz = Math.abs(tz - pz);
  const stepX = px < tx ? 1 : -1;
  const stepZ = pz < tz ? 1 : -1;
  let err = dx - dz;
  while (x !== tx || z !== tz) {
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x += stepX;
    }
    if (e2 < dx) {
      err += dx;
      z += stepZ;
    }
    if (x === tx && z === tz) break;
    if (blocksLineOfSight(x, z)) return false;
  }
  return true;
};

export const computeFogVisibleCells = ({
  map,
  playerPos,
  objectById,
  delta,
  gridSpace,
  fineRatio,
  radius,
  resolution,
}: {
  map: MapData;
  playerPos: [number, number];
  objectById: Map<string, ObjectData>;
  delta?: MapDelta;
  gridSpace: "macro" | "fine";
  fineRatio: number;
  radius: number;
  resolution: "macro" | "fine";
}): Set<string> => {
  const placementBlockers = createFogLineOfSightBlockers(
    map.custom_object_placements || [],
    objectById,
    delta,
  );
  const cellBlockers = new Set<string>(
    map.cells
      .filter((cell) => cell.blocks_los)
      .map((cell) => fogCellKey(cell.x, cell.z)),
  );
  placementBlockers.forEach((key) => cellBlockers.add(key));
  const visible = new Set<string>();

  if (resolution === "fine") {
    const cellRadius = Math.round(radius * (gridSpace === "fine" ? fineRatio : 1));
    const px = Math.round(playerPos[0]);
    const pz = Math.round(playerPos[1]);
    for (let z = pz - cellRadius; z <= pz + cellRadius; z += 1) {
      for (let x = px - cellRadius; x <= px + cellRadius; x += 1) {
        const distance = Math.max(Math.abs(x - px), Math.abs(z - pz));
        if (distance > cellRadius) continue;
        if (
          distance <= (gridSpace === "fine" ? fineRatio : 1) ||
          hasFogLineOfSight([px, pz], [x, z], (bx, bz) =>
            cellBlockers.has(fogCellKey(bx, bz)),
          )
        ) {
          visible.add(fogCellKey(x, z));
        }
      }
    }
    return visible;
  }

  const playerMacro: [number, number] =
    gridSpace === "fine"
      ? [Math.floor(playerPos[0] / fineRatio), Math.floor(playerPos[1] / fineRatio)]
      : [Math.round(playerPos[0]), Math.round(playerPos[1])];
  const blocksMacro = (mx: number, mz: number) => {
    if (gridSpace === "macro") return cellBlockers.has(fogCellKey(mx, mz));
    for (let dz = 0; dz < fineRatio; dz += 1) {
      for (let dx = 0; dx < fineRatio; dx += 1) {
        if (cellBlockers.has(fogCellKey(mx * fineRatio + dx, mz * fineRatio + dz))) {
          return true;
        }
      }
    }
    return false;
  };
  for (let mz = playerMacro[1] - radius; mz <= playerMacro[1] + radius; mz += 1) {
    for (let mx = playerMacro[0] - radius; mx <= playerMacro[0] + radius; mx += 1) {
      const distance = Math.max(
        Math.abs(mx - playerMacro[0]),
        Math.abs(mz - playerMacro[1]),
      );
      if (distance > radius) continue;
      if (
        distance <= 1 ||
        hasFogLineOfSight(playerMacro, [mx, mz], blocksMacro)
      ) {
        visible.add(fogCellKey(mx, mz));
      }
    }
  }
  return visible;
};
