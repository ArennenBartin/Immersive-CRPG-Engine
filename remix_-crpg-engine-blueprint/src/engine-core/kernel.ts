import type { EngineEvent } from "./events";
import type { GamePackage, MapData, ObjectData, ObjectPlacementData } from "../schema/game";
import type { PlaySave, PlaySaveWorldFact } from "../schema/save";
import { doorPlacementKey, isBuildingDoorPlacement, isDoorPlacementOpen } from "../utils/doorPlacement";
import { entityPlacementStateKey } from "../utils/entityState";
import { getPlacementFootprint, placementOriginKey } from "../utils/objectFootprint";

export const KERNEL_DEFAULT_PLANE_ID = "ground";
const MAX_WORLD_FACTS = 250;
const KERNEL_VISUAL_EXPOSURE_RADIUS = 8;
const KERNEL_AUDITORY_EXPOSURE_RADIUS = 6;
type CellLike = readonly unknown[];

export type KernelLocation =
  | { type: "world_cell"; map_id: string; plane_id: string; cell: [number, number] }
  | { type: "actor_inventory"; actor_id: string }
  | { type: "container_inventory"; container_instance_id: string }
  | { type: "equipment_slot"; actor_id: string; slot_id: string }
  | { type: "hand_slot"; actor_id: string; hand_id: string }
  | { type: "hidden_cache"; map_id: string; plane_id: string }
  | { type: "destroyed" };

export type KernelHolderKind =
  | "world_cell"
  | "actor_inventory"
  | "container_inventory"
  | "equipment_slot"
  | "hand_slot"
  | "shop_stock"
  | "hidden_cache"
  | "destroyed";

export interface KernelHolder {
  id: string;
  kind: KernelHolderKind;
  display_name?: string;
  actor_id?: string;
  map_id?: string;
  plane_id?: string;
  cell?: [number, number];
  container_instance_id?: string;
  slot_id?: string;
  hand_id?: string;
  shop_id?: string;
  capacity?: number;
}

export interface KernelTransferRecord {
  id: string;
  fact_id: string;
  action_type: string;
  item_instance_id?: string;
  item_template_id?: string;
  quantity: number;
  from_holder_id?: string;
  to_holder_id?: string;
  actor_id?: string;
  permission_state?: string;
  tick: number;
}

export type KernelTransactionKind =
  | "place"
  | "move"
  | "rotate"
  | "open"
  | "close"
  | "lock"
  | "unlock"
  | "search"
  | "break"
  | "repair";

export interface KernelTransactionRecord {
  id: string;
  fact_id: string;
  action_type: string;
  kind: KernelTransactionKind;
  actor_id?: string;
  target_id?: string;
  map_id?: string;
  plane_id?: string;
  cells?: [number, number][];
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  permission_state?: string;
  resulting_object_instance_ids?: string[];
  exposures?: KernelExposureRecord[];
  tick: number;
  status: "committed";
}

export type KernelInstanceKind =
  | "item"
  | "dropped_item"
  | "container"
  | "container_item"
  | "door"
  | "object";

export interface KernelObjectInstance {
  id: string;
  kind: KernelInstanceKind;
  template_id: string;
  display_name?: string;
  location: KernelLocation;
  holder_id?: string;
  quantity?: number;
  rotation?: [number, number];
  footprint?: [number, number][];
  blocking?: boolean;
  opened?: boolean;
  locked?: boolean;
  condition?: number;
  owner_id?: string;
  custody_holder_id?: string;
  access_tags?: string[];
  persistence_policy: "authored" | "runtime_delta" | "derived";
  creation_event_id?: string;
  last_modified_event_id?: string;
}

export interface KernelExposureRecord {
  type: "direct_participant" | "visual" | "auditory" | "inventory_custody" | "obvious_later_inspection";
  actor_id?: string;
  reason?: string;
}

export interface KernelWorldFact extends PlaySaveWorldFact {
  exposures?: KernelExposureRecord[];
}

export interface KernelSnapshot {
  instances: KernelObjectInstance[];
  holders: KernelHolder[];
  transfers: KernelTransferRecord[];
  transactions: KernelTransactionRecord[];
  facts: KernelWorldFact[];
}

export interface KernelFactAdapterContext {
  gamePackage: GamePackage;
  beforeSave: PlaySave;
  afterSave: PlaySave;
  events: EngineEvent[];
  facts: KernelWorldFact[];
}

export interface KernelFactAdapter {
  id: string;
  onFacts: (context: KernelFactAdapterContext) => KernelWorldFact[] | void;
}

export interface KernelFactBuildOptions {
  enableAwarenessFacts?: boolean;
  adapters?: KernelFactAdapter[];
}

export const kernelInstanceId = (
  mapId: string,
  kind: KernelInstanceKind,
  localId: string,
) => `kinst:${mapId}:${kind}:${localId}`;

const cloneCell = (cell: CellLike): [number, number] => [
  Number(cell[0] ?? 0),
  Number(cell[1] ?? 0),
];

const optionalCloneCell = (cell: CellLike | undefined): [number, number] | undefined =>
  cell ? cloneCell(cell) : undefined;

const isCell = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

export const actorInventoryHolderId = (actorId = "player") =>
  `kholder:actor_inventory:${actorId}`;

export const equipmentSlotHolderId = (actorId = "player", slotId = "default") =>
  `kholder:equipment_slot:${actorId}:${slotId}`;

export const handSlotHolderId = (actorId = "player", handId = "main") =>
  `kholder:hand_slot:${actorId}:${handId}`;

export const worldCellHolderId = (
  mapId: string,
  cell: CellLike,
  planeId = KERNEL_DEFAULT_PLANE_ID,
) => {
  const [x, z] = cloneCell(cell);
  return `kholder:world_cell:${mapId}:${planeId}:${x}:${z}`;
};

export const shopStockHolderId = (shopId = "unknown") =>
  `kholder:shop_stock:${shopId}`;

export const hiddenCacheHolderId = (
  mapId: string,
  planeId = KERNEL_DEFAULT_PLANE_ID,
) => `kholder:hidden_cache:${mapId}:${planeId}`;

export const destroyedHolderId = () => "kholder:destroyed";

const objectMap = (gamePackage: GamePackage) =>
  new Map(gamePackage.object_library.map((object) => [object.id, object]));

const itemName = (gamePackage: GamePackage, itemId: string) =>
  gamePackage.items.find((item) => item.id === itemId)?.display_name || itemId;

const containerInstanceId = (mapId: string, containerId: string) =>
  kernelInstanceId(mapId, "container", containerId);

const holderIdForContainerInstance = (containerInstanceId: string) =>
  `kholder:container_inventory:${containerInstanceId}`;

export const containerInventoryHolderId = (mapId: string, containerId: string) =>
  holderIdForContainerInstance(containerInstanceId(mapId, containerId));

const containerItemInstanceId = (
  mapId: string,
  containerId: string,
  entryIndex: number,
  itemId: string,
) => kernelInstanceId(mapId, "container_item", `${containerId}:${entryIndex}:${itemId}`);

const worldLocation = (mapId: string, cell: CellLike): KernelLocation => ({
  type: "world_cell",
  map_id: mapId,
  plane_id: KERNEL_DEFAULT_PLANE_ID,
  cell: cloneCell(cell),
});

const actorInventoryLocation = (actorId = "player"): KernelLocation => ({
  type: "actor_inventory",
  actor_id: actorId,
});

const containerLocation = (mapId: string, containerId: string): KernelLocation => ({
  type: "container_inventory",
  container_instance_id: containerInstanceId(mapId, containerId),
});

const holderIdForLocation = (location: KernelLocation): string => {
  if (location.type === "world_cell") {
    return worldCellHolderId(location.map_id, location.cell, location.plane_id);
  }
  if (location.type === "actor_inventory") {
    return actorInventoryHolderId(location.actor_id);
  }
  if (location.type === "container_inventory") {
    return holderIdForContainerInstance(location.container_instance_id);
  }
  if (location.type === "equipment_slot") {
    return equipmentSlotHolderId(location.actor_id, location.slot_id);
  }
  if (location.type === "hand_slot") {
    return handSlotHolderId(location.actor_id, location.hand_id);
  }
  if (location.type === "hidden_cache") {
    return hiddenCacheHolderId(location.map_id, location.plane_id);
  }
  return destroyedHolderId();
};

const getContainerRuntimeState = (
  save: PlaySave,
  map: MapData,
  containerId: string,
) => {
  const container = (map.container_placements || []).find((candidate) => candidate.id === containerId);
  if (!container) return undefined;
  const state = save.map_deltas?.[map.id]?.containers?.[containerId];
  return {
    placement: container,
    items: state?.items ?? container.items.map((entry) => ({ ...entry })),
    locked: state?.locked ?? container.locked ?? false,
    opened: state?.opened ?? false,
  };
};

const findGroundItemInstance = (
  gamePackage: GamePackage,
  save: PlaySave,
  map: MapData,
  itemId: string | undefined,
  cell: [number, number] | undefined,
): KernelObjectInstance | undefined => {
  if (!itemId || !cell) return undefined;
  const delta = save.map_deltas?.[map.id];
  const dropped = (delta?.dropped_items || []).find(
    (entry) => entry.item_id === itemId && entry.cell[0] === cell[0] && entry.cell[1] === cell[1],
  );
  if (dropped) {
    const location = worldLocation(map.id, dropped.cell);
    return {
      id: kernelInstanceId(map.id, "dropped_item", dropped.id),
      kind: "dropped_item",
      template_id: dropped.item_id,
      display_name: itemName(gamePackage, dropped.item_id),
      location,
      holder_id: holderIdForLocation(location),
      quantity: dropped.count,
      persistence_policy: "runtime_delta",
    };
  }

  const taken = new Set(delta?.taken_items || []);
  const placement = (map.item_placements || []).find(
    (entry) =>
      !taken.has(entry.id) &&
      entry.item_id === itemId &&
      entry.cell[0] === cell[0] &&
      entry.cell[1] === cell[1],
  );
  if (!placement) return undefined;

  const location = worldLocation(map.id, placement.cell);
  return {
    id: kernelInstanceId(map.id, "item", placement.id),
    kind: "item",
    template_id: placement.item_id,
    display_name: itemName(gamePackage, placement.item_id),
    location,
    holder_id: holderIdForLocation(location),
    quantity: placement.count ?? 1,
    persistence_policy: "authored",
  };
};

const buildItemInstances = (
  gamePackage: GamePackage,
  save: PlaySave,
  map: MapData,
): KernelObjectInstance[] => {
  const delta = save.map_deltas?.[map.id];
  const taken = new Set(delta?.taken_items || []);
  const authored = (map.item_placements || []).map((placement) => {
    const location = taken.has(placement.id)
      ? actorInventoryLocation("player")
      : worldLocation(map.id, placement.cell);
    return {
      id: kernelInstanceId(map.id, "item", placement.id),
      kind: "item" as const,
      template_id: placement.item_id,
      display_name: itemName(gamePackage, placement.item_id),
      location,
      holder_id: holderIdForLocation(location),
      quantity: placement.count ?? 1,
      persistence_policy: "authored" as const,
    };
  });

  const dropped = (delta?.dropped_items || []).map((entry) => {
    const location = worldLocation(map.id, entry.cell);
    return {
      id: kernelInstanceId(map.id, "dropped_item", entry.id),
      kind: "dropped_item" as const,
      template_id: entry.item_id,
      display_name: itemName(gamePackage, entry.item_id),
      location,
      holder_id: holderIdForLocation(location),
      quantity: entry.count,
      persistence_policy: "runtime_delta" as const,
    };
  });

  return [...authored, ...dropped];
};

const buildContainerInstances = (
  gamePackage: GamePackage,
  save: PlaySave,
  map: MapData,
): KernelObjectInstance[] => {
  const instances: KernelObjectInstance[] = [];
  for (const container of map.container_placements || []) {
    const runtime = getContainerRuntimeState(save, map, container.id);
    const object = gamePackage.object_library.find((candidate) => candidate.id === container.object_id);
    const location = worldLocation(map.id, container.cell);
    instances.push({
      id: containerInstanceId(map.id, container.id),
      kind: "container",
      template_id: container.object_id,
      display_name: container.display_name || object?.display_name || container.id,
      location,
      holder_id: holderIdForLocation(location),
      rotation: [...container.facing] as [number, number],
      footprint: object ? getPlacementFootprint(container, object) : [cloneCell(container.cell)],
      blocking: true,
      opened: runtime?.opened ?? false,
      locked: runtime?.locked ?? false,
      persistence_policy: "authored",
    });
    (runtime?.items || []).forEach((entry, entryIndex) => {
      const itemLocation = containerLocation(map.id, container.id);
      instances.push({
        id: containerItemInstanceId(map.id, container.id, entryIndex, entry.item_id),
        kind: "container_item",
        template_id: entry.item_id,
        display_name: itemName(gamePackage, entry.item_id),
        location: itemLocation,
        holder_id: holderIdForLocation(itemLocation),
        quantity: entry.count,
        persistence_policy: runtime?.placement ? "authored" : "derived",
      });
    });
  }
  return instances;
};

const objectBlocks = (placement: ObjectPlacementData, object: ObjectData | undefined) =>
  placement.collision_mode !== "none" &&
  !!object &&
  object.collision?.profile !== "none" &&
  object.collision?.profile !== "walkable_support";

const buildObjectInstances = (
  map: MapData,
  objectsById: Map<string, ObjectData>,
  save: PlaySave,
): KernelObjectInstance[] => {
  const delta = save.map_deltas?.[map.id];
  const removed = new Set(delta?.removed_objects || []);
  const carried = delta?.carried_objects || {};
  return (map.custom_object_placements || []).flatMap((authoredPlacement, index) => {
    const originKey = placementOriginKey(authoredPlacement);
    if (removed.has(originKey)) return [];
    const moved = delta?.moved_objects?.[originKey];
    const placement = moved
      ? { ...authoredPlacement, cell: moved.cell, facing: moved.facing }
      : authoredPlacement;
    const object = objectsById.get(placement.object_id);
    const isDoor = isBuildingDoorPlacement(placement);
    const localId = isDoor
      ? doorPlacementKey(placement)
      : originKey || `${index}:${placement.object_id}:${placement.cell[0]}:${placement.cell[1]}`;
    const carriedState = carried[originKey];
    const carriedActorId = carriedState?.actor_ids?.[0];
    const location: KernelLocation = carriedActorId
      ? { type: "hand_slot", actor_id: carriedActorId, hand_id: "both" }
      : worldLocation(map.id, placement.cell);
    return [{
      id: kernelInstanceId(map.id, isDoor ? "door" : "object", localId),
      kind: isDoor ? "door" : "object",
      template_id: placement.object_id,
      display_name: object?.display_name || placement.object_id,
      location,
      holder_id: holderIdForLocation(location),
      rotation: [...placement.facing] as [number, number],
      footprint: getPlacementFootprint(placement, object),
      blocking: carriedActorId
        ? false
        : isDoor
          ? objectBlocks(placement, object) && !isDoorPlacementOpen(save.map_deltas?.[map.id], placement)
          : objectBlocks(placement, object),
      opened: isDoor ? isDoorPlacementOpen(save.map_deltas?.[map.id], placement) : undefined,
      persistence_policy: "authored",
    }];
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const stringFromRecord = (record: Record<string, unknown> | undefined, key: string) =>
  typeof record?.[key] === "string" ? record[key] as string : undefined;

const numberFromRecord = (record: Record<string, unknown> | undefined, key: string) =>
  typeof record?.[key] === "number" && Number.isFinite(record[key])
    ? record[key] as number
    : undefined;

const holderIdFromLocationValue = (value: unknown): string | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "world_cell" && typeof value.map_id === "string" && Array.isArray(value.cell)) {
    return worldCellHolderId(
      value.map_id,
      value.cell,
      typeof value.plane_id === "string" ? value.plane_id : KERNEL_DEFAULT_PLANE_ID,
    );
  }
  if (value.type === "actor_inventory" && typeof value.actor_id === "string") {
    return actorInventoryHolderId(value.actor_id);
  }
  if (value.type === "container_inventory" && typeof value.container_instance_id === "string") {
    return holderIdForContainerInstance(value.container_instance_id);
  }
  if (
    value.type === "equipment_slot" &&
    typeof value.actor_id === "string" &&
    typeof value.slot_id === "string"
  ) {
    return equipmentSlotHolderId(value.actor_id, value.slot_id);
  }
  if (value.type === "hand_slot" && typeof value.actor_id === "string" && typeof value.hand_id === "string") {
    return handSlotHolderId(value.actor_id, value.hand_id);
  }
  if (value.type === "hidden_cache" && typeof value.map_id === "string") {
    return hiddenCacheHolderId(
      value.map_id,
      typeof value.plane_id === "string" ? value.plane_id : KERNEL_DEFAULT_PLANE_ID,
    );
  }
  if (value.type === "destroyed") {
    return destroyedHolderId();
  }
  return undefined;
};

const holderFromLocation = (location: KernelLocation): KernelHolder => {
  if (location.type === "world_cell") {
    return {
      id: holderIdForLocation(location),
      kind: "world_cell",
      map_id: location.map_id,
      plane_id: location.plane_id,
      cell: cloneCell(location.cell),
    };
  }
  if (location.type === "actor_inventory") {
    return {
      id: holderIdForLocation(location),
      kind: "actor_inventory",
      actor_id: location.actor_id,
      display_name: `${location.actor_id} inventory`,
    };
  }
  if (location.type === "container_inventory") {
    return {
      id: holderIdForLocation(location),
      kind: "container_inventory",
      container_instance_id: location.container_instance_id,
      display_name: `${location.container_instance_id} contents`,
    };
  }
  if (location.type === "equipment_slot") {
    return {
      id: holderIdForLocation(location),
      kind: "equipment_slot",
      actor_id: location.actor_id,
      slot_id: location.slot_id,
      display_name: `${location.actor_id} ${location.slot_id}`,
    };
  }
  if (location.type === "hand_slot") {
    return {
      id: holderIdForLocation(location),
      kind: "hand_slot",
      actor_id: location.actor_id,
      hand_id: location.hand_id,
      display_name: `${location.actor_id} ${location.hand_id} hand`,
    };
  }
  if (location.type === "hidden_cache") {
    return {
      id: holderIdForLocation(location),
      kind: "hidden_cache",
      map_id: location.map_id,
      plane_id: location.plane_id,
    };
  }
  return { id: holderIdForLocation(location), kind: "destroyed" };
};

const holderFromId = (id: string): KernelHolder | undefined => {
  if (id === destroyedHolderId()) return { id, kind: "destroyed" };
  if (id.startsWith("kholder:actor_inventory:")) {
    const actorId = id.slice("kholder:actor_inventory:".length);
    return { id, kind: "actor_inventory", actor_id: actorId, display_name: `${actorId} inventory` };
  }
  if (id.startsWith("kholder:container_inventory:")) {
    const containerInstanceIdValue = id.slice("kholder:container_inventory:".length);
    return {
      id,
      kind: "container_inventory",
      container_instance_id: containerInstanceIdValue,
      display_name: `${containerInstanceIdValue} contents`,
    };
  }
  if (id.startsWith("kholder:equipment_slot:")) {
    const [actorId, slotId] = id.slice("kholder:equipment_slot:".length).split(":");
    if (!actorId || !slotId) return undefined;
    return {
      id,
      kind: "equipment_slot",
      actor_id: actorId,
      slot_id: slotId,
      display_name: `${actorId} ${slotId}`,
    };
  }
  if (id.startsWith("kholder:hand_slot:")) {
    const [actorId, handId] = id.slice("kholder:hand_slot:".length).split(":");
    if (!actorId || !handId) return undefined;
    return {
      id,
      kind: "hand_slot",
      actor_id: actorId,
      hand_id: handId,
      display_name: `${actorId} ${handId} hand`,
    };
  }
  if (id.startsWith("kholder:shop_stock:")) {
    const shopId = id.slice("kholder:shop_stock:".length);
    return { id, kind: "shop_stock", shop_id: shopId, display_name: `${shopId} stock` };
  }
  if (id.startsWith("kholder:hidden_cache:")) {
    const [mapId, planeId] = id.slice("kholder:hidden_cache:".length).split(":");
    if (!mapId) return undefined;
    return { id, kind: "hidden_cache", map_id: mapId, plane_id: planeId || KERNEL_DEFAULT_PLANE_ID };
  }
  if (id.startsWith("kholder:world_cell:")) {
    const [mapId, planeId, x, z] = id.slice("kholder:world_cell:".length).split(":");
    if (!mapId || !planeId) return undefined;
    return {
      id,
      kind: "world_cell",
      map_id: mapId,
      plane_id: planeId,
      cell: [Number(x ?? 0), Number(z ?? 0)],
    };
  }
  return undefined;
};

const buildKernelHolders = (
  instances: KernelObjectInstance[],
  facts: KernelWorldFact[],
): KernelHolder[] => {
  const byId = new Map<string, KernelHolder>();
  const add = (holder: KernelHolder | undefined) => {
    if (holder && !byId.has(holder.id)) byId.set(holder.id, holder);
  };

  for (const instance of instances) {
    add(holderFromLocation(instance.location));
    if (instance.kind === "container") {
      add({
        id: holderIdForContainerInstance(instance.id),
        kind: "container_inventory",
        container_instance_id: instance.id,
        display_name: `${instance.display_name || instance.id} contents`,
      });
    }
    if (instance.holder_id) add(holderFromId(instance.holder_id));
  }

  for (const fact of facts) {
    const holderIds = [
      stringFromRecord(fact.previous_state, "from_holder_id"),
      stringFromRecord(fact.previous_state, "to_holder_id"),
      stringFromRecord(fact.new_state, "from_holder_id"),
      stringFromRecord(fact.new_state, "to_holder_id"),
      holderIdFromLocationValue(fact.previous_state?.location),
      holderIdFromLocationValue(fact.new_state?.location),
    ];
    holderIds.forEach((id) => {
      if (id) add(holderFromId(id));
    });
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const getTransferHolderIds = (
  fact: KernelWorldFact,
): { from_holder_id?: string; to_holder_id?: string } => {
  const direct = fact.direct_consequences;
  const containerId = stringFromRecord(direct, "container_id");
  const shopId = stringFromRecord(direct, "shop_id") || stringFromRecord(direct, "shopId");
  let fromHolderId =
    stringFromRecord(fact.previous_state, "from_holder_id") ||
    stringFromRecord(fact.new_state, "from_holder_id") ||
    holderIdFromLocationValue(fact.previous_state?.location);
  let toHolderId =
    stringFromRecord(fact.new_state, "to_holder_id") ||
    stringFromRecord(fact.previous_state, "to_holder_id") ||
    holderIdFromLocationValue(fact.new_state?.location);

  if (!fromHolderId && fact.map_id && containerId && fact.action_type.includes("from_container")) {
    fromHolderId = containerInventoryHolderId(fact.map_id, containerId);
  }
  if (!toHolderId && fact.action_type.includes("from_container")) {
    toHolderId = actorInventoryHolderId(fact.actor_id || "player");
  }
  if (!fromHolderId && fact.action_type === "object_stowed_in_container") {
    fromHolderId = actorInventoryHolderId(fact.actor_id || "player");
  }
  if (!toHolderId && fact.map_id && containerId && fact.action_type === "object_stowed_in_container") {
    toHolderId = containerInventoryHolderId(fact.map_id, containerId);
  }
  if (fact.action_type === "shop_item_bought") {
    fromHolderId ||= shopStockHolderId(shopId || "unknown");
    toHolderId ||= actorInventoryHolderId(fact.actor_id || "player");
  }
  if (fact.action_type === "shop_item_sold") {
    fromHolderId ||= actorInventoryHolderId(fact.actor_id || "player");
    toHolderId ||= shopStockHolderId(shopId || "unknown");
  }
  if (fact.action_type === "object_granted") {
    fromHolderId ||= fact.map_id ? hiddenCacheHolderId(fact.map_id) : undefined;
    toHolderId ||= actorInventoryHolderId(fact.actor_id || "player");
  }
  if (fact.action_type === "object_removed") {
    fromHolderId ||= actorInventoryHolderId(fact.actor_id || "player");
    toHolderId ||= destroyedHolderId();
  }
  if (fact.action_type === "object_dropped") {
    fromHolderId ||= actorInventoryHolderId(fact.actor_id || "player");
    toHolderId ||= holderIdFromLocationValue(fact.new_state?.location);
  }

  return { from_holder_id: fromHolderId, to_holder_id: toHolderId };
};

const transferQuantity = (
  fact: KernelWorldFact,
  itemEntry?: Record<string, unknown>,
): number =>
  numberFromRecord(itemEntry, "count") ??
  numberFromRecord(fact.direct_consequences, "count") ??
  numberFromRecord(fact.new_state, "quantity") ??
  numberFromRecord(fact.previous_state, "quantity") ??
  1;

const buildKernelTransfers = (facts: KernelWorldFact[]): KernelTransferRecord[] => {
  const transferActions = new Set([
    "object_taken",
    "object_taken_from_container",
    "objects_taken_from_container",
    "object_stowed_in_container",
    "object_dropped",
    "object_granted",
    "object_removed",
    "shop_item_bought",
    "shop_item_sold",
  ]);
  const transfers: KernelTransferRecord[] = [];

  for (const fact of facts) {
    if (!transferActions.has(fact.action_type)) continue;
    const direct = fact.direct_consequences;
    const { from_holder_id, to_holder_id } = getTransferHolderIds(fact);
    const pushTransfer = (
      index: number,
      itemTemplateId?: string,
      quantity?: number,
      itemInstanceId?: string,
    ) => {
      transfers.push({
        id: `ktran:${fact.id}:${index}`,
        fact_id: fact.id,
        action_type: fact.action_type,
        item_instance_id: itemInstanceId,
        item_template_id: itemTemplateId,
        quantity: quantity ?? 1,
        from_holder_id,
        to_holder_id,
        actor_id: fact.actor_id,
        permission_state: fact.permission_state,
        tick: fact.tick,
      });
    };

    if (fact.action_type === "objects_taken_from_container") {
      const items = Array.isArray(direct?.items) ? direct.items : [];
      if (items.length > 0) {
        items.forEach((item, index) => {
          const itemRecord = isRecord(item) ? item : undefined;
          const itemId = stringFromRecord(itemRecord, "item_id");
          const entryIndex = numberFromRecord(itemRecord, "entry_index");
          const itemInstanceId =
            fact.map_id && stringFromRecord(direct, "container_id") && itemId && entryIndex !== undefined
              ? containerItemInstanceId(fact.map_id, stringFromRecord(direct, "container_id")!, entryIndex, itemId)
              : undefined;
          pushTransfer(index, itemId, transferQuantity(fact, itemRecord), itemInstanceId);
        });
        continue;
      }
    }

    const itemId = stringFromRecord(direct, "item_id") || stringFromRecord(direct, "itemId");
    const itemInstanceId = fact.target_id?.startsWith("kinst:") ? fact.target_id : undefined;
    pushTransfer(0, itemId, transferQuantity(fact), itemInstanceId);
  }

  return transfers;
};

const transactionKindForFact = (fact: KernelWorldFact): KernelTransactionKind | undefined => {
  const directKind = stringFromRecord(fact.direct_consequences, "transaction_kind");
  if (
    directKind === "place" ||
    directKind === "move" ||
    directKind === "rotate" ||
    directKind === "open" ||
    directKind === "close" ||
    directKind === "lock" ||
    directKind === "unlock" ||
    directKind === "search" ||
    directKind === "break" ||
    directKind === "repair"
  ) {
    return directKind;
  }
  if (fact.action_type === "door_opened" || fact.action_type === "container_opened") return "open";
  if (fact.action_type === "door_closed") return "close";
  if (fact.action_type === "container_unlocked") return "unlock";
  if (fact.action_type === "container_searched") return "search";
  if (fact.action_type === "object_broken") return "break";
  return undefined;
};

const buildKernelTransactions = (facts: KernelWorldFact[]): KernelTransactionRecord[] =>
  facts.flatMap((fact) => {
    const kind = transactionKindForFact(fact);
    if (!kind) return [];
    return [
      {
        id: `ktxn:${fact.id}:0`,
        fact_id: fact.id,
        action_type: fact.action_type,
        kind,
        actor_id: fact.actor_id,
        target_id: fact.target_id,
        map_id: fact.map_id,
        plane_id: fact.plane_id,
        cells: fact.cells?.map(cloneCell),
        previous_state: fact.previous_state ? { ...fact.previous_state } : undefined,
        new_state: fact.new_state ? { ...fact.new_state } : undefined,
        permission_state: fact.permission_state,
        resulting_object_instance_ids: fact.resulting_object_instance_ids
          ? [...fact.resulting_object_instance_ids]
          : undefined,
        exposures: fact.exposures?.map((exposure) => ({ ...exposure })) as KernelExposureRecord[] | undefined,
        tick: fact.tick,
        status: "committed" as const,
      },
    ];
  });

export const createKernelSnapshotFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
): KernelSnapshot => {
  const objectsById = objectMap(gamePackage);
  const instances = gamePackage.maps.flatMap((map) => [
    ...buildItemInstances(gamePackage, save, map),
    ...buildContainerInstances(gamePackage, save, map),
    ...buildObjectInstances(map, objectsById, save),
  ]);
  const facts = ((save.world_facts || []) as KernelWorldFact[]).map((fact) => ({
    ...fact,
    cells: fact.cells?.map(cloneCell),
    previous_state: fact.previous_state ? { ...fact.previous_state } : undefined,
    new_state: fact.new_state ? { ...fact.new_state } : undefined,
    direct_consequences: fact.direct_consequences ? { ...fact.direct_consequences } : undefined,
    exposures: fact.exposures?.map((exposure) => ({ ...exposure })) as KernelExposureRecord[] | undefined,
    resulting_object_instance_ids: fact.resulting_object_instance_ids
      ? [...fact.resulting_object_instance_ids]
      : undefined,
    parent_fact_ids: fact.parent_fact_ids ? [...fact.parent_fact_ids] : undefined,
  }));
  return {
    instances,
    holders: buildKernelHolders(instances, facts),
    transfers: buildKernelTransfers(facts),
    transactions: buildKernelTransactions(facts),
    facts,
  };
};

const directExposure = (actorId: string | undefined): KernelExposureRecord[] =>
  actorId
    ? [
        {
          type: "direct_participant",
          actor_id: actorId,
          reason: "actor performed the interaction",
        },
      ]
    : [];

const addBaselineCellExposure = (
  exposures: KernelExposureRecord[],
  cell: CellLike | undefined,
): KernelExposureRecord[] => {
  if (!cell) return exposures;
  return [
    ...exposures,
    { type: "visual", reason: "baseline line-of-sight candidate at interaction cell" },
    { type: "auditory", reason: "baseline nearby-hearing candidate at interaction cell" },
  ];
};

const cellDistance = (a: CellLike, b: CellLike) =>
  Math.abs(Number(a[0] ?? 0) - Number(b[0] ?? 0)) +
  Math.abs(Number(a[1] ?? 0) - Number(b[1] ?? 0));

const losCellsBetween = (from: [number, number], to: [number, number]): [number, number][] => {
  const cells: [number, number][] = [];
  let x = from[0];
  let z = from[1];
  const dx = Math.abs(to[0] - from[0]);
  const dz = Math.abs(to[1] - from[1]);
  const sx = from[0] < to[0] ? 1 : -1;
  const sz = from[1] < to[1] ? 1 : -1;
  let error = dx - dz;

  while (!(x === to[0] && z === to[1])) {
    const twiceError = error * 2;
    if (twiceError > -dz) {
      error -= dz;
      x += sx;
    }
    if (twiceError < dx) {
      error += dx;
      z += sz;
    }
    if (!(x === to[0] && z === to[1])) cells.push([x, z]);
  }
  return cells;
};

const hasBaselineLineOfSight = (map: MapData, from: [number, number], to: [number, number]) => {
  if (cellDistance(from, to) > KERNEL_VISUAL_EXPOSURE_RADIUS) return false;
  const cellsByKey = new Map(map.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]));
  return losCellsBetween(from, to).every((cell) => !cellsByKey.get(`${cell[0]}:${cell[1]}`)?.blocks_los);
};

const actorExposureCandidates = (
  gamePackage: GamePackage,
  save: PlaySave,
  map: MapData,
): { actor_id: string; cell: [number, number] }[] => {
  const entityDefs = new Map(gamePackage.entities.map((entity) => [entity.id, entity]));
  return (map.entity_placements || [])
    .map((placement, index) => {
      const def = entityDefs.get(placement.entity_id);
      const key = entityPlacementStateKey(map.id, placement, index);
      const state = save.entity_states?.[key] || {};
      return {
        actor_id: placement.entity_id,
        cell: (state.cell || placement.cell) as [number, number],
        eligible: !!def?.is_npc && !state.dead && !state.hidden,
      };
    })
    .filter((candidate) => candidate.eligible)
    .map(({ actor_id, cell }) => ({ actor_id, cell }));
};

const baselineExposuresForCell = ({
  gamePackage,
  save,
  map,
  actorId,
  cell,
}: {
  gamePackage: GamePackage;
  save: PlaySave;
  map: MapData;
  actorId?: string;
  cell?: [number, number];
}): KernelExposureRecord[] => {
  const exposures = directExposure(actorId);
  if (!cell) return exposures;

  const seen = new Set(exposures.map((exposure) => `${exposure.type}:${exposure.actor_id || ""}`));
  const add = (exposure: KernelExposureRecord) => {
    const key = `${exposure.type}:${exposure.actor_id || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      exposures.push(exposure);
    }
  };

  for (const candidate of actorExposureCandidates(gamePackage, save, map)) {
    if (candidate.actor_id === actorId) continue;
    if (hasBaselineLineOfSight(map, candidate.cell, cell)) {
      add({
        type: "visual",
        actor_id: candidate.actor_id,
        reason: "line of sight to interaction cell",
      });
    }
    if (cellDistance(candidate.cell, cell) <= KERNEL_AUDITORY_EXPOSURE_RADIUS) {
      add({
        type: "auditory",
        actor_id: candidate.actor_id,
        reason: "within earshot of interaction cell",
      });
    }
  }

  return exposures;
};

const awarenessEligibleActions = new Set([
  "object_taken",
  "object_dropped",
  "door_opened",
  "object_pushed",
  "object_pulled",
  "object_dragged",
  "object_carried",
  "object_broken",
  "surface_cleaned",
  "container_unlocked",
  "container_opened",
  "container_searched",
  "object_taken_from_container",
  "objects_taken_from_container",
  "object_stowed_in_container",
]);

const createAwarenessFacts = (
  existingCount: number,
  facts: KernelWorldFact[],
): KernelWorldFact[] => {
  const baseFacts = facts.filter((fact) => awarenessEligibleActions.has(fact.action_type));
  const awarenessFacts: KernelWorldFact[] = [];
  for (const fact of baseFacts) {
    const exposedActors = new Map<string, KernelExposureRecord>();
    for (const exposure of fact.exposures || []) {
      if (
        exposure.actor_id &&
        exposure.actor_id !== fact.actor_id &&
        (exposure.type === "visual" || exposure.type === "auditory")
      ) {
        exposedActors.set(exposure.actor_id, exposure);
      }
    }
    for (const [actorId, exposure] of exposedActors) {
      awarenessFacts.push({
        id: `wfact:${String(existingCount + facts.length + awarenessFacts.length + 1).padStart(6, "0")}`,
        tick: fact.tick,
        map_id: fact.map_id,
        plane_id: fact.plane_id,
        cells: fact.cells?.map(cloneCell),
        actor_id: actorId,
        target_id: fact.target_id,
        action_type: "npc_noticed_world_fact",
        previous_state: { noticed: false },
        new_state: { noticed: true },
        direct_consequences: {
          observed_fact_id: fact.id,
          observed_action_type: fact.action_type,
          exposure_type: exposure.type,
        },
        exposures: [
          {
            type: "direct_participant",
            actor_id: actorId,
            reason: "NPC records an obvious exposed world change",
          },
        ],
        permission_state: "awareness_record",
        resulting_object_instance_ids: fact.resulting_object_instance_ids
          ? [...fact.resulting_object_instance_ids]
          : undefined,
        source_event_id: fact.source_event_id,
        parent_fact_ids: [fact.id],
      });
    }
  }
  return awarenessFacts;
};

const makeFact = (
  existingCount: number,
  facts: KernelWorldFact[],
  event: EngineEvent,
  mapId: string,
  actionType: string,
  fields: Omit<KernelWorldFact, "id" | "tick" | "map_id" | "plane_id" | "action_type" | "source_event_id">,
): KernelWorldFact => ({
  id: `wfact:${String(existingCount + facts.length + 1).padStart(6, "0")}`,
  tick: event.tick,
  map_id: mapId,
  plane_id: KERNEL_DEFAULT_PLANE_ID,
  action_type: actionType,
  source_event_id: event.id,
  ...fields,
});

export const createKernelFactsFromEngineEvents = ({
  gamePackage,
  beforeSave,
  afterSave,
  events,
  options = {},
}: {
  gamePackage: GamePackage;
  beforeSave: PlaySave;
  afterSave: PlaySave;
  events: EngineEvent[];
  options?: KernelFactBuildOptions;
}): KernelWorldFact[] => {
  const mapId = beforeSave.current_map_id;
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  if (!map) return [];

  const facts: KernelWorldFact[] = [];
  const existingCount = beforeSave.world_facts?.length || 0;

  for (const event of events) {
    const payload = event.payload || {};
    const actorId = event.actorIds?.[0];
    const cell = isCell(payload.cell) ? payload.cell : undefined;
    const baseExposures = baselineExposuresForCell({
      gamePackage,
      save: afterSave,
      map,
      actorId,
      cell,
    });

    if (event.type === "item_acquired") {
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      const instance = findGroundItemInstance(gamePackage, beforeSave, map, itemId, cell);
      if (!instance) continue;
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      facts.push(makeFact(existingCount, facts, event, mapId, "object_taken", {
        cells: cell ? [cloneCell(cell)] : undefined,
        actor_id: actorId,
        target_id: instance.id,
        previous_state: {
          location: instance.location,
          quantity: instance.quantity,
          from_holder_id: instance.holder_id || holderIdForLocation(instance.location),
        },
        new_state: {
          location: actorInventoryLocation(actorId || "player"),
          quantity: payload.count,
          to_holder_id: actorHolderId,
        },
        direct_consequences: { item_id: itemId, count: payload.count },
        exposures: baseExposures,
        permission_state: "no_known_permission",
        resulting_object_instance_ids: [instance.id],
      }));
    }

    if (event.type === "item_dropped") {
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      const droppedId = typeof payload.dropped_id === "string" ? payload.dropped_id : undefined;
      if (!itemId || !droppedId || !cell) continue;
      const targetId = kernelInstanceId(mapId, "dropped_item", droppedId);
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      const dropLocation = worldLocation(mapId, cell);
      facts.push(makeFact(existingCount, facts, event, mapId, "object_dropped", {
        cells: [cloneCell(cell)],
        actor_id: actorId,
        target_id: targetId,
        previous_state: {
          location: actorInventoryLocation(actorId || "player"),
          quantity: payload.count,
          from_holder_id: actorHolderId,
        },
        new_state: {
          location: dropLocation,
          quantity: payload.count,
          to_holder_id: holderIdForLocation(dropLocation),
        },
        direct_consequences: { item_id: itemId, count: payload.count, dropped_id: droppedId },
        exposures: baseExposures,
        permission_state: "actor_discarded",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "door_opened") {
      const doorKey = typeof payload.door === "string" ? payload.door : undefined;
      if (!doorKey) continue;
      const targetId = kernelInstanceId(mapId, "door", doorKey);
      facts.push(makeFact(existingCount, facts, event, mapId, "door_opened", {
        cells: cell ? [cloneCell(cell)] : undefined,
        actor_id: actorId,
        target_id: targetId,
        previous_state: { opened: false, blocking: true },
        new_state: { opened: true, blocking: false },
        direct_consequences: { door: doorKey, target_kind: "door", transaction_kind: "open" },
        exposures: baseExposures,
        permission_state: "unknown",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "door_closed") {
      const doorKey = typeof payload.door === "string" ? payload.door : undefined;
      if (!doorKey) continue;
      const targetId = kernelInstanceId(mapId, "door", doorKey);
      facts.push(makeFact(existingCount, facts, event, mapId, "door_closed", {
        cells: cell ? [cloneCell(cell)] : undefined,
        actor_id: actorId,
        target_id: targetId,
        previous_state: { opened: true, blocking: false },
        new_state: { opened: false, blocking: true },
        direct_consequences: { door: doorKey, target_kind: "door", transaction_kind: "close" },
        exposures: baseExposures,
        permission_state: "unknown",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "object_pushed" || event.type === "object_pulled" || event.type === "object_dragged" || event.type === "object_carried") {
      const placementKey = typeof payload.placement_key === "string" ? payload.placement_key : undefined;
      const objectId = typeof payload.object_id === "string" ? payload.object_id : "object";
      const from = isCell(payload.from) ? payload.from : undefined;
      const to = isCell(payload.to) ? payload.to : cell;
      const carriedBy = Array.isArray(payload.carried_by)
        ? payload.carried_by.filter((id): id is string => typeof id === "string")
        : undefined;
      if (!placementKey) continue;
      const targetId = kernelInstanceId(mapId, "object", placementKey);
      facts.push(makeFact(existingCount, facts, event, mapId, event.type, {
        cells: [from, to].filter(isCell).map(cloneCell),
        actor_id: actorId,
        target_id: targetId,
        previous_state: { cell: from, blocking: true },
        new_state: { cell: to, blocking: event.type !== "object_carried", carried_by: carriedBy },
        direct_consequences: {
          object_id: objectId,
          target_kind: "object",
          transaction_kind: "move",
          manipulation: payload.manipulation,
          carried_by: carriedBy,
          mass_kg: payload.mass_kg,
          bulk: payload.bulk,
          awkwardness: payload.awkwardness,
          push_difficulty: payload.push_difficulty,
          push_energy_cost: payload.push_energy_cost,
          requires_cooperation: payload.requires_cooperation,
        },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: to || from,
        }),
        permission_state: "unknown",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "object_broken") {
      const placementKey = typeof payload.placement_key === "string" ? payload.placement_key : undefined;
      const objectId = typeof payload.object_id === "string" ? payload.object_id : "object";
      if (!placementKey) continue;
      const targetId = kernelInstanceId(mapId, "object", placementKey);
      facts.push(makeFact(existingCount, facts, event, mapId, "object_broken", {
        cells: cell ? [cloneCell(cell)] : undefined,
        actor_id: actorId,
        target_id: targetId,
        previous_state: { cell, blocking: true, condition: 1 },
        new_state: { location: { type: "destroyed" }, blocking: false, condition: 0 },
        direct_consequences: { object_id: objectId, target_kind: "object", transaction_kind: "break" },
        exposures: baseExposures,
        permission_state: "unknown",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "surface_cleaned") {
      const cleanedCell = isCell(payload.cell) ? payload.cell : cell;
      if (!cleanedCell) continue;
      const kinds = Array.isArray(payload.kinds)
        ? payload.kinds.filter((kind): kind is string => typeof kind === "string")
        : [];
      facts.push(makeFact(existingCount, facts, event, mapId, "surface_cleaned", {
        cells: [cloneCell(cleanedCell)],
        actor_id: actorId,
        target_id: `cell:${mapId}:${cleanedCell[0]}:${cleanedCell[1]}`,
        previous_state: { residue_kinds: kinds, trace_visible: true },
        new_state: { residue_kinds: ["cleaned_trace"], trace_visible: true },
        direct_consequences: {
          target_kind: "cell",
          transaction_kind: "clean",
          removed: payload.removed,
          kinds,
          cleaned_trace: true,
        },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: cleanedCell,
        }),
        permission_state: "unknown",
      }));
    }

    if (event.type === "surfaces_decayed") {
      facts.push(makeFact(existingCount, facts, event, mapId, "surfaces_decayed", {
        actor_id: actorId,
        previous_state: { active: true },
        new_state: { removed: payload.removed, aged: payload.aged },
        direct_consequences: {
          target_kind: "surface_layers",
          transaction_kind: "decay",
          ticks: payload.ticks,
          removed: payload.removed,
          aged: payload.aged,
        },
        exposures: directExposure(actorId),
        permission_state: "systemic",
      }));
    }

    if (event.type === "container_unlocked" || event.type === "container_opened") {
      const containerId = typeof payload.container_id === "string" ? payload.container_id : undefined;
      if (!containerId) continue;
      const runtimeBefore = getContainerRuntimeState(beforeSave, map, containerId);
      const runtimeAfter = getContainerRuntimeState(afterSave, map, containerId);
      const targetId = containerInstanceId(mapId, containerId);
      const actionType = event.type === "container_unlocked" ? "container_unlocked" : "container_opened";
      facts.push(makeFact(existingCount, facts, event, mapId, actionType, {
        cells: cell ? [cloneCell(cell)] : runtimeBefore ? [cloneCell(runtimeBefore.placement.cell)] : undefined,
        actor_id: actorId,
        target_id: targetId,
        previous_state: {
          locked: runtimeBefore?.locked,
          opened: runtimeBefore?.opened,
        },
        new_state: {
          locked: runtimeAfter?.locked,
          opened: runtimeAfter?.opened,
        },
        direct_consequences: {
          target_kind: "container",
          transaction_kind: event.type === "container_unlocked" ? "unlock" : "open",
          key_item_id: payload.key_item_id,
          consume_key: payload.consume_key,
        },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: cell || optionalCloneCell(runtimeBefore?.placement.cell),
        }),
        permission_state: event.type === "container_unlocked" ? "granted_by_key" : "unknown",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "container_searched") {
      const containerId = typeof payload.container_id === "string" ? payload.container_id : undefined;
      if (!containerId) continue;
      const runtimeBefore = getContainerRuntimeState(beforeSave, map, containerId);
      const targetId = containerInstanceId(mapId, containerId);
      facts.push(makeFact(existingCount, facts, event, mapId, "container_searched", {
        cells: cell ? [cloneCell(cell)] : runtimeBefore ? [cloneCell(runtimeBefore.placement.cell)] : undefined,
        actor_id: actorId,
        target_id: targetId,
        previous_state: {
          searched: false,
          item_count: runtimeBefore?.items.length ?? payload.item_count,
        },
        new_state: {
          searched: true,
          item_count: payload.item_count,
        },
        direct_consequences: {
          container_id: containerId,
          target_kind: "container",
          transaction_kind: "search",
          item_count: payload.item_count,
        },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: cell || optionalCloneCell(runtimeBefore?.placement.cell),
        }),
        permission_state: "unknown",
        resulting_object_instance_ids: [targetId],
      }));
    }

    if (event.type === "container_item_taken") {
      const containerId = typeof payload.container_id === "string" ? payload.container_id : undefined;
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      const entryIndex = typeof payload.entry_index === "number" ? payload.entry_index : 0;
      if (!containerId || !itemId) continue;
      const runtimeBefore = getContainerRuntimeState(beforeSave, map, containerId);
      const itemInstanceId = containerItemInstanceId(mapId, containerId, entryIndex, itemId);
      const containerHolderId = containerInventoryHolderId(mapId, containerId);
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      facts.push(makeFact(existingCount, facts, event, mapId, "object_taken_from_container", {
        cells: runtimeBefore ? [cloneCell(runtimeBefore.placement.cell)] : undefined,
        actor_id: actorId,
        target_id: itemInstanceId,
        previous_state: {
          location: containerLocation(mapId, containerId),
          quantity: payload.count,
          from_holder_id: containerHolderId,
        },
        new_state: {
          location: actorInventoryLocation(actorId || "player"),
          quantity: payload.count,
          to_holder_id: actorHolderId,
        },
        direct_consequences: { container_id: containerId, item_id: itemId, count: payload.count },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: optionalCloneCell(runtimeBefore?.placement.cell),
        }),
        permission_state: "unknown",
        resulting_object_instance_ids: [itemInstanceId, containerInstanceId(mapId, containerId)],
      }));
    }

    if (event.type === "container_items_taken") {
      const containerId = typeof payload.container_id === "string" ? payload.container_id : undefined;
      const runtimeBefore = containerId ? getContainerRuntimeState(beforeSave, map, containerId) : undefined;
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!containerId) continue;
      const containerHolderId = containerInventoryHolderId(mapId, containerId);
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      facts.push(makeFact(existingCount, facts, event, mapId, "objects_taken_from_container", {
        cells: runtimeBefore ? [cloneCell(runtimeBefore.placement.cell)] : undefined,
        actor_id: actorId,
        target_id: containerInstanceId(mapId, containerId),
        previous_state: {
          item_count: runtimeBefore?.items.length ?? items.length,
          from_holder_id: containerHolderId,
        },
        new_state: {
          item_count: 0,
          to_holder_id: actorHolderId,
        },
        direct_consequences: { container_id: containerId, items },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: optionalCloneCell(runtimeBefore?.placement.cell),
        }),
        permission_state: "unknown",
        resulting_object_instance_ids: [containerInstanceId(mapId, containerId)],
      }));
    }

    if (event.type === "container_item_stowed") {
      const containerId = typeof payload.container_id === "string" ? payload.container_id : undefined;
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      const runtimeAfter = containerId ? getContainerRuntimeState(afterSave, map, containerId) : undefined;
      if (!containerId || !itemId) continue;
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      const containerHolderId = containerInventoryHolderId(mapId, containerId);
      facts.push(makeFact(existingCount, facts, event, mapId, "object_stowed_in_container", {
        cells: runtimeAfter ? [cloneCell(runtimeAfter.placement.cell)] : undefined,
        actor_id: actorId,
        target_id: containerInstanceId(mapId, containerId),
        previous_state: {
          location: actorInventoryLocation(actorId || "player"),
          quantity: payload.count,
          from_holder_id: actorHolderId,
        },
        new_state: {
          location: containerLocation(mapId, containerId),
          quantity: payload.count,
          to_holder_id: containerHolderId,
        },
        direct_consequences: { container_id: containerId, item_id: itemId, count: payload.count },
        exposures: baselineExposuresForCell({
          gamePackage,
          save: afterSave,
          map,
          actorId,
          cell: optionalCloneCell(runtimeAfter?.placement.cell),
        }),
        permission_state: "unknown",
        resulting_object_instance_ids: [containerInstanceId(mapId, containerId)],
      }));
    }

    if (event.type === "item_granted") {
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      if (!itemId) continue;
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      const sourceHolderId = hiddenCacheHolderId(mapId);
      facts.push(makeFact(existingCount, facts, event, mapId, "object_granted", {
        actor_id: actorId,
        target_id: `inventory:${actorId || "player"}:${itemId}`,
        previous_state: {
          location: { type: "hidden_cache", map_id: mapId, plane_id: KERNEL_DEFAULT_PLANE_ID },
          quantity: 0,
          from_holder_id: sourceHolderId,
        },
        new_state: {
          location: actorInventoryLocation(actorId || "player"),
          quantity: payload.count,
          to_holder_id: actorHolderId,
        },
        direct_consequences: { item_id: itemId, count: payload.count },
        exposures: [
          ...directExposure(actorId),
          { type: "inventory_custody", actor_id: actorId || "player", reason: "item grant changes custody" },
        ],
        permission_state: "system_grant",
        resulting_object_instance_ids: [`inventory:${actorId || "player"}:${itemId}`],
      }));
    }

    if (event.type === "item_removed") {
      const itemId = typeof payload.item_id === "string" ? payload.item_id : undefined;
      if (!itemId) continue;
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      const sinkHolderId = destroyedHolderId();
      facts.push(makeFact(existingCount, facts, event, mapId, "object_removed", {
        actor_id: actorId,
        target_id: `inventory:${actorId || "player"}:${itemId}`,
        previous_state: {
          location: actorInventoryLocation(actorId || "player"),
          quantity: payload.count,
          from_holder_id: actorHolderId,
        },
        new_state: {
          location: { type: "destroyed" },
          quantity: 0,
          to_holder_id: sinkHolderId,
        },
        direct_consequences: { item_id: itemId, count: payload.count },
        exposures: [
          ...directExposure(actorId),
          { type: "inventory_custody", actor_id: actorId || "player", reason: "item removal changes custody" },
        ],
        permission_state: "system_remove",
        resulting_object_instance_ids: [`inventory:${actorId || "player"}:${itemId}`],
      }));
    }

    if (event.type === "shop_item_bought" || event.type === "shop_item_sold") {
      const itemId = typeof payload.itemId === "string" ? payload.itemId : undefined;
      if (!itemId) continue;
      const actorHolderId = actorInventoryHolderId(actorId || "player");
      const shopHolderId = shopStockHolderId(String(payload.shopId || "unknown"));
      const fromHolderId = event.type === "shop_item_bought" ? shopHolderId : actorHolderId;
      const toHolderId = event.type === "shop_item_bought" ? actorHolderId : shopHolderId;
      facts.push(makeFact(existingCount, facts, event, mapId, event.type, {
        actor_id: actorId,
        target_id: `shop:${String(payload.shopId || "unknown")}:${itemId}`,
        previous_state: { money: beforeSave.money, from_holder_id: fromHolderId },
        new_state: { money: afterSave.money, to_holder_id: toHolderId },
        direct_consequences: {
          shop_id: payload.shopId,
          item_id: itemId,
          count: payload.count,
          total_price: payload.totalPrice,
          mode: payload.mode,
        },
        exposures: [
          ...directExposure(actorId),
          { type: "inventory_custody", actor_id: actorId || "player", reason: "shop transaction changes custody" },
        ],
        permission_state: "shop_transaction",
        resulting_object_instance_ids: [`inventory:${actorId || "player"}:${itemId}`],
      }));
    }
  }

  if (options.enableAwarenessFacts !== false) {
    facts.push(...createAwarenessFacts(existingCount, facts));
  }

  for (const adapter of options.adapters || []) {
    const adapterFacts = adapter.onFacts({
      gamePackage,
      beforeSave,
      afterSave,
      events,
      facts: facts.map((fact) => ({ ...fact })),
    });
    if (adapterFacts && adapterFacts.length) facts.push(...adapterFacts);
  }

  return facts;
};

export const appendKernelFactsToSave = (
  save: PlaySave,
  facts: KernelWorldFact[],
  maxFacts = MAX_WORLD_FACTS,
): PlaySave => {
  if (facts.length === 0) return save;
  return {
    ...save,
    world_facts: [...(save.world_facts || []), ...facts].slice(-maxFacts),
  };
};
