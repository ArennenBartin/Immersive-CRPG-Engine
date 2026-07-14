// Entity runtime state (hp, death, position) is stored in the save under a
// string key. The key must be unique per map: two maps can both place the same
// entity definition at placement index 0, and without the map id those
// placements would silently share state across maps.
export const entityStateKey = (
  mapId: string,
  entityId: string,
  placementIndex: number,
) => `ent_${mapId}_${entityId}_${placementIndex}`;

/**
 * Returns the save-state key for an authored entity placement.
 *
 * Generated placements carry a stable `id`, so their runtime identity must not
 * depend on their position in `entity_placements`. Legacy maps did not have
 * placement IDs; keeping the old index-based key for those records preserves
 * existing saves and authored content.
 */
export const entityPlacementStateKey = (
  mapId: string,
  placement: { id?: string; entity_id: string },
  placementIndex: number,
) =>
  placement.id
    ? `ent_${mapId}_placement_${placement.id}`
    : entityStateKey(mapId, placement.entity_id, placementIndex);
