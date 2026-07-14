import type { ObjectPlacementData } from "../schema/game";
import type { MapDelta } from "../schema/save";

export type DoorCell = { x: number; z: number };
export type DoorFacing = [number, number];

export const DOOR_OBJECT_ID = "obj_p_door";

export const doorFacingForBounds = (
  door: DoorCell,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): DoorFacing => {
  if (door.x === x0) return [-1, 0];
  if (door.x === x1) return [1, 0];
  if (door.z === z0) return [0, -1];
  if (door.z === z1) return [0, 1];
  return [0, 1];
};

export const doorPlacementKey = (placement: ObjectPlacementData) =>
  placement.id ||
  `${placement.object_id}|${placement.cell[0]}|${placement.cell[1]}|${placement.facing[0]}|${placement.facing[1]}`;

export const isBuildingDoorPlacement = (placement: ObjectPlacementData) =>
  placement.object_id === DOOR_OBJECT_ID;

export const isDoorPlacementOpen = (
  delta: MapDelta | undefined,
  placement: ObjectPlacementData,
) =>
  isBuildingDoorPlacement(placement) &&
  Boolean(delta?.opened_doors?.includes(doorPlacementKey(placement)));

export const isDoorPlacementUnlocked = (
  delta: MapDelta | undefined,
  placement: ObjectPlacementData,
) =>
  !placement.locked ||
  Boolean(delta?.unlocked_doors?.includes(doorPlacementKey(placement)));
