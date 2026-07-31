import type { PlaySave } from "../schema/save";

export type PlayerCarriedObject = {
  key: string;
  objectId: string;
  actorIds: string[];
};

export const getPlayerCarriedObject = (
  save: PlaySave,
  mapId: string,
  actorId = "player",
): PlayerCarriedObject | null => {
  const entry = Object.entries(
    save.map_deltas?.[mapId]?.carried_objects || {},
  ).find(([, carried]) => (carried.actor_ids || []).includes(actorId));
  if (!entry) return null;
  return {
    key: entry[0],
    objectId: entry[1].object_id,
    actorIds: [...entry[1].actor_ids],
  };
};

export const placePlayerCarriedObject = (
  save: PlaySave,
  options: {
    mapId: string;
    placementKey: string;
    cell: [number, number];
    facing: [number, number];
    stackRootKey?: string;
    stackIndex?: number;
    heightOffset?: number;
  },
): PlaySave => {
  const delta = save.map_deltas?.[options.mapId] || {};
  const carriedObjects = { ...(delta.carried_objects || {}) };
  delete carriedObjects[options.placementKey];

  return {
    ...save,
    map_deltas: {
      ...(save.map_deltas || {}),
      [options.mapId]: {
        ...delta,
        carried_objects: carriedObjects,
        moved_objects: {
          ...(delta.moved_objects || {}),
          [options.placementKey]: {
            cell: [options.cell[0], options.cell[1]],
            facing: [options.facing[0], options.facing[1]],
            height_offset: options.heightOffset,
            stack_index: options.stackIndex,
            stack_root_key: options.stackRootKey,
          },
        },
      },
    },
  };
};
