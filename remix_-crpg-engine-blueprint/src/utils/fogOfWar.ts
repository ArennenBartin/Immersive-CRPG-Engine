import type { MapData, ObjectData, ObjectPlacementData } from "../schema/game";
import type { MapDelta } from "../schema/save";
import { fineCoordKey } from "../engine-core/gridCoordinates";
import { doorPlacementKey, isBuildingDoorPlacement, isDoorPlacementOpen } from "./doorPlacement";
import { getPlacementFootprint, placementHasCollision } from "./objectFootprint";

export const fogCellKey = fineCoordKey;

const isDoorObject = (placement: ObjectPlacementData, objectDef?: ObjectData) =>
  isBuildingDoorPlacement(placement) || Boolean(objectDef?.tags?.includes("door"));

const isDoorOpenForFog = (delta: MapDelta | undefined, placement: ObjectPlacementData) =>
  isDoorPlacementOpen(delta, placement) || Boolean(delta?.opened_doors?.includes(doorPlacementKey(placement)));

export const placementBlocksFogLineOfSight = (
  placement: ObjectPlacementData,
  objectDef: ObjectData | undefined,
  delta: MapDelta | undefined,
) => placementHasCollision(placement, objectDef) && isDoorObject(placement, objectDef) && !isDoorOpenForFog(delta, placement);

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
