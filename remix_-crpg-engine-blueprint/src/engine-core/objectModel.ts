import type {
  GameObjectBlueprintData,
  GameObjectPartCascadeData,
  GameObjectPartData,
  GamePackage,
  ItemData,
  ObjectData,
} from "../schema/game";
import type {
  MapDelta,
  PlaySave,
  PlaySaveWorldFact,
  SimulationConditionRecord,
  SimulationEnvironmentFieldRecord,
} from "../schema/save";
import {
  KERNEL_DEFAULT_PLANE_ID,
  createKernelSnapshotFromV1,
  type KernelLocation,
  type KernelObjectInstance,
  type KernelSnapshot,
} from "./kernel";

export const ROOT_OBJECT_BLUEPRINT_ID = "Object";
export const PHYSICAL_OBJECT_BLUEPRINT_ID = "PhysicalObject";
export const ITEM_OBJECT_BLUEPRINT_ID = "ItemObject";
export const CONTAINER_OBJECT_BLUEPRINT_ID = "ContainerObject";
export const DOOR_OBJECT_BLUEPRINT_ID = "DoorObject";

export interface ResolvedGameObjectPart extends GameObjectPartData {
  inherited_from: string;
}

export interface ResolvedGameObjectBlueprint {
  id: string;
  display_name?: string;
  extends?: string;
  tags: string[];
  source?: GameObjectBlueprintData["source"];
  ancestor_ids: string[];
  parts: ResolvedGameObjectPart[];
}

export interface GameObjectRuntime {
  id: string;
  blueprint_id: string;
  kind: KernelObjectInstance["kind"] | "blueprint";
  template_id: string;
  display_name?: string;
  tags: string[];
  parts: ResolvedGameObjectPart[];
  kernel_instance_id?: string;
  location?: KernelLocation;
  holder_id?: string;
  quantity?: number;
  blocking?: boolean;
  opened?: boolean;
  locked?: boolean;
}

export interface GameObjectModelSnapshot {
  blueprints: ResolvedGameObjectBlueprint[];
  objects: GameObjectRuntime[];
}

export interface GameObjectEvent {
  type: string;
  tick: number;
  actor_id?: string;
  target_object_id?: string;
  payload?: Record<string, unknown>;
}

export interface GameObjectPartEmission {
  type: string;
  tick: number;
  source_object_id: string;
  part_id: string;
  payload: Record<string, unknown>;
}

export interface GameObjectEventDispatchResult {
  ok: boolean;
  reason?: string;
  vetoed_by_part_id?: string;
  handled_part_ids: string[];
  cascade_scopes: GameObjectPartCascadeData[];
  emitted: GameObjectPartEmission[];
}

export interface GameObjectCascadeDispatchEntry {
  object: GameObjectRuntime;
  scope: "root" | GameObjectPartCascadeData;
  result: GameObjectEventDispatchResult;
}

export interface GameObjectCascadeDispatchResult {
  ok: boolean;
  reason?: string;
  vetoed_by_part_id?: string;
  root: GameObjectCascadeDispatchEntry;
  cascaded: GameObjectCascadeDispatchEntry[];
  handled_object_ids: string[];
  emitted: GameObjectPartEmission[];
}

export interface GameObjectPartConsequenceResult {
  save: PlaySave;
  world_facts: PlaySaveWorldFact[];
  condition_records: SimulationConditionRecord[];
  environment_fields: SimulationEnvironmentFieldRecord[];
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const MAX_OBJECT_WORLD_FACTS = 250;

const clonePart = (part: GameObjectPartData, inheritedFrom: string): ResolvedGameObjectPart => ({
  id: part.id,
  type: part.type,
  listens: [...(part.listens || [])],
  cascade: [...(part.cascade || [])],
  data: { ...(part.data || {}) },
  inherited_from: inheritedFrom,
});

const mergeParts = (
  parentParts: ResolvedGameObjectPart[],
  childParts: GameObjectPartData[],
  childBlueprintId: string,
): ResolvedGameObjectPart[] => {
  const merged = new Map<string, ResolvedGameObjectPart>();
  parentParts.forEach((part) => merged.set(part.id, clonePart(part, part.inherited_from)));
  childParts.forEach((part) => merged.set(part.id, clonePart(part, childBlueprintId)));
  return [...merged.values()];
};

const materialProfilePart = (simulation: ObjectData["simulation"] | ItemData["simulation"] | undefined): GameObjectPartData[] =>
  simulation?.material_id
    ? [
        {
          id: "material_profile",
          type: "material_profile",
          listens: ["apply_fire", "apply_water", "temperature_changed"],
          cascade: [],
          data: {
            material_id: simulation.material_id,
            condition: simulation.condition,
            integrity: simulation.integrity,
            mass_kg: simulation.mass_kg,
          },
        },
      ]
    : [];

const manipulationPart = (simulation: ObjectData["simulation"] | undefined): GameObjectPartData[] =>
  simulation
    ? [
        {
          id: "manipulation",
          type: "manipulation",
          listens: ["object_pushed", "object_pulled", "object_dragged", "object_carried"],
          cascade: [],
          data: {
            mass_kg: simulation.mass_kg,
            bulk: simulation.bulk,
            awkwardness: simulation.awkwardness,
            push_difficulty: simulation.push_difficulty,
            carry_size: simulation.carry_size,
            requires_cooperation: simulation.requires_cooperation,
          },
        },
      ]
    : [];

const collisionPart = (object: ObjectData): GameObjectPartData[] =>
  object.collision?.profile && object.collision.profile !== "none"
    ? [
        {
          id: "collision",
          type: "collision",
          listens: ["object_moved", "object_pushed", "object_broken"],
          cascade: [],
          data: {
            profile: object.collision.profile,
            footprint: object.collision.footprint.map((cell) => [...cell]),
          },
        },
      ]
    : [];

const breakablePart = (object: ObjectData): GameObjectPartData[] =>
  object.category === "prop" || object.tags.includes("breakable") || object.tags.includes("crate")
    ? [
        {
          id: "breakable",
          type: "breakable",
          listens: ["object_hit", "object_broken"],
          cascade: [],
          data: {
            break_threshold: Math.max(1, Math.round((object.simulation?.integrity ?? 1) * 10)),
          },
        },
      ]
    : [];

const objectBlueprintId = (object: ObjectData) => object.blueprint_id || `object:${object.id}`;
const itemBlueprintId = (item: ItemData) => item.blueprint_id || `item:${item.id}`;

const createSyntheticObjectBlueprint = (
  object: ObjectData,
  kind: "object" | "container" | "door" = "object",
): GameObjectBlueprintData => ({
  id: objectBlueprintId(object),
  display_name: object.display_name,
  extends:
    kind === "door"
      ? DOOR_OBJECT_BLUEPRINT_ID
      : kind === "container" || object.category === "container" || object.tags.includes("container")
        ? CONTAINER_OBJECT_BLUEPRINT_ID
        : PHYSICAL_OBJECT_BLUEPRINT_ID,
  tags: unique([kind, object.category, ...object.tags].filter(Boolean)),
  source: { kind, id: object.id },
  parts: [
    {
      id: "object_template",
      type: "object_template",
      listens: ["inspect"],
      cascade: [],
      data: {
        object_id: object.id,
        category: object.category,
        bounds: [...object.bounds],
      },
    },
    ...collisionPart(object),
    ...materialProfilePart(object.simulation),
    ...manipulationPart(object.simulation),
    ...breakablePart(object),
  ],
});

const createSyntheticItemBlueprint = (item: ItemData): GameObjectBlueprintData => ({
  id: itemBlueprintId(item),
  display_name: item.display_name,
  extends: ITEM_OBJECT_BLUEPRINT_ID,
  tags: unique(["item", item.category]),
  source: { kind: "item", id: item.id },
  parts: [
    {
      id: "item_template",
      type: "item_template",
      listens: ["inspect", "object_taken", "object_dropped"],
      cascade: [],
      data: {
        item_id: item.id,
        category: item.category,
        effects: item.effects ? { ...item.effects } : undefined,
      },
    },
    ...materialProfilePart(item.simulation),
  ],
});

const blueprintRegistry = (gamePackage: GamePackage): Map<string, GameObjectBlueprintData> => {
  const registry = new Map<string, GameObjectBlueprintData>();
  (gamePackage.object_blueprints || []).forEach((blueprint) => registry.set(blueprint.id, blueprint));
  gamePackage.object_library.forEach((object) => {
    const synthetic = createSyntheticObjectBlueprint(object);
    if (!registry.has(synthetic.id)) registry.set(synthetic.id, synthetic);
  });
  gamePackage.items.forEach((item) => {
    const synthetic = createSyntheticItemBlueprint(item);
    if (!registry.has(synthetic.id)) registry.set(synthetic.id, synthetic);
  });
  return registry;
};

export const resolveGameObjectBlueprint = (
  gamePackage: GamePackage,
  blueprintId: string,
): ResolvedGameObjectBlueprint | undefined => {
  const registry = blueprintRegistry(gamePackage);
  const resolving = new Set<string>();

  const resolve = (id: string): ResolvedGameObjectBlueprint | undefined => {
    const blueprint = registry.get(id);
    if (!blueprint || resolving.has(id)) return undefined;
    resolving.add(id);
    const parent = blueprint.extends ? resolve(blueprint.extends) : undefined;
    resolving.delete(id);
    return {
      id: blueprint.id,
      display_name: blueprint.display_name || parent?.display_name,
      extends: blueprint.extends,
      tags: unique([...(parent?.tags || []), ...(blueprint.tags || [])]),
      source: blueprint.source || parent?.source,
      ancestor_ids: [...(parent?.ancestor_ids || []), ...(parent ? [parent.id] : [])],
      parts: mergeParts(parent?.parts || [], blueprint.parts || [], blueprint.id),
    };
  };

  return resolve(blueprintId);
};

export const resolveGameObjectBlueprints = (gamePackage: GamePackage): ResolvedGameObjectBlueprint[] =>
  [...blueprintRegistry(gamePackage).keys()]
    .map((id) => resolveGameObjectBlueprint(gamePackage, id))
    .filter((blueprint): blueprint is ResolvedGameObjectBlueprint => Boolean(blueprint));

const templateBlueprintIdForKernelInstance = (
  gamePackage: GamePackage,
  instance: KernelObjectInstance,
): string => {
  if (instance.kind === "item" || instance.kind === "dropped_item" || instance.kind === "container_item") {
    const item = gamePackage.items.find((candidate) => candidate.id === instance.template_id);
    return item ? itemBlueprintId(item) : ITEM_OBJECT_BLUEPRINT_ID;
  }
  const object = gamePackage.object_library.find((candidate) => candidate.id === instance.template_id);
  if (!object) {
    if (instance.kind === "door") return DOOR_OBJECT_BLUEPRINT_ID;
    if (instance.kind === "container") return CONTAINER_OBJECT_BLUEPRINT_ID;
    return PHYSICAL_OBJECT_BLUEPRINT_ID;
  }
  if (instance.kind === "door") return object.blueprint_id || objectBlueprintId(object);
  if (instance.kind === "container") return object.blueprint_id || objectBlueprintId(object);
  return objectBlueprintId(object);
};

export const createGameObjectRuntimeFromKernelInstance = (
  gamePackage: GamePackage,
  instance: KernelObjectInstance,
): GameObjectRuntime => {
  const blueprintId = templateBlueprintIdForKernelInstance(gamePackage, instance);
  const resolved = resolveGameObjectBlueprint(gamePackage, blueprintId) ||
    resolveGameObjectBlueprint(gamePackage, ROOT_OBJECT_BLUEPRINT_ID);
  const tags = unique([...(resolved?.tags || []), instance.kind]);
  return {
    id: `gobj:${instance.id}`,
    blueprint_id: resolved?.id || blueprintId,
    kind: instance.kind,
    template_id: instance.template_id,
    display_name: instance.display_name || resolved?.display_name,
    tags,
    parts: resolved?.parts || [],
    kernel_instance_id: instance.id,
    location: instance.location,
    holder_id: instance.holder_id,
    quantity: instance.quantity,
    blocking: instance.blocking,
    opened: instance.opened,
    locked: instance.locked,
  };
};

export const createGameObjectModelSnapshotFromKernel = (
  gamePackage: GamePackage,
  kernelSnapshot: KernelSnapshot,
): GameObjectModelSnapshot => ({
  blueprints: resolveGameObjectBlueprints(gamePackage),
  objects: kernelSnapshot.instances.map((instance) =>
    createGameObjectRuntimeFromKernelInstance(gamePackage, instance),
  ),
});

export const createGameObjectModelSnapshotFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
): GameObjectModelSnapshot =>
  createGameObjectModelSnapshotFromKernel(gamePackage, createKernelSnapshotFromV1(gamePackage, save));

const partListensTo = (part: ResolvedGameObjectPart, event: GameObjectEvent) =>
  part.listens.includes("*") || part.listens.includes(event.type);

const arrayFromData = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const partVetoReason = (part: ResolvedGameObjectPart, event: GameObjectEvent): string | undefined => {
  const vetoEvents = arrayFromData(part.data.veto_events);
  if (vetoEvents.includes(event.type) || part.data.veto_event === event.type) {
    return typeof part.data.reason === "string" ? part.data.reason : `${part.id} vetoed ${event.type}`;
  }
  return undefined;
};

const emitForPart = (
  object: GameObjectRuntime,
  part: ResolvedGameObjectPart,
  event: GameObjectEvent,
): GameObjectPartEmission[] => {
  if (part.type === "flammable" && event.type === "apply_fire") {
    return [{
      type: "object_ignited",
      tick: event.tick,
      source_object_id: object.id,
      part_id: part.id,
      payload: {
        target_object_id: object.id,
        actor_id: event.actor_id,
        ignition_temperature: part.data.ignition_temperature,
        fuel_value: part.data.fuel_value,
      },
    }];
  }
  if (part.type === "breakable" && (event.type === "object_hit" || event.type === "object_broken")) {
    return [{
      type: "object_break_triggered",
      tick: event.tick,
      source_object_id: object.id,
      part_id: part.id,
      payload: {
        target_object_id: object.id,
        actor_id: event.actor_id,
        break_threshold: part.data.break_threshold,
      },
    }];
  }
  if (part.type === "openable" && (event.type === "door_opened" || event.type === "door_closed")) {
    return [{
      type: "openable_state_observed",
      tick: event.tick,
      source_object_id: object.id,
      part_id: part.id,
      payload: { target_object_id: object.id, actor_id: event.actor_id, event_type: event.type },
    }];
  }
  return [];
};

export const dispatchGameObjectEvent = (
  object: GameObjectRuntime,
  event: GameObjectEvent,
): GameObjectEventDispatchResult => {
  const handled: string[] = [];
  const cascadeScopes: GameObjectPartCascadeData[] = [];
  const emitted: GameObjectPartEmission[] = [];

  for (const part of object.parts) {
    if (!partListensTo(part, event)) continue;
    const veto = partVetoReason(part, event);
    if (veto) {
      return {
        ok: false,
        reason: veto,
        vetoed_by_part_id: part.id,
        handled_part_ids: handled,
        cascade_scopes: unique(cascadeScopes),
        emitted,
      };
    }
    handled.push(part.id);
    cascadeScopes.push(...part.cascade);
    emitted.push(...emitForPart(object, part, event));
  }

  return {
    ok: true,
    handled_part_ids: handled,
    cascade_scopes: unique(cascadeScopes),
    emitted,
  };
};

const actorIdForCascade = (object: GameObjectRuntime, event: GameObjectEvent): string | undefined => {
  if (event.actor_id) return event.actor_id;
  if (object.location?.type === "actor_inventory") return object.location.actor_id;
  if (object.location?.type === "equipment_slot") return object.location.actor_id;
  if (object.location?.type === "hand_slot") return object.location.actor_id;
  return undefined;
};

const cascadeTargetsForScope = (
  snapshot: GameObjectModelSnapshot,
  rootObject: GameObjectRuntime,
  scope: GameObjectPartCascadeData,
  event: GameObjectEvent,
): GameObjectRuntime[] => {
  const actorId = actorIdForCascade(rootObject, event);
  if (scope === "container_contents" && rootObject.kernel_instance_id) {
    return snapshot.objects.filter(
      (object) =>
        object.id !== rootObject.id &&
        object.location?.type === "container_inventory" &&
        object.location.container_instance_id === rootObject.kernel_instance_id,
    );
  }
  if (scope === "inventory" && actorId) {
    return snapshot.objects.filter(
      (object) => object.id !== rootObject.id && object.location?.type === "actor_inventory" && object.location.actor_id === actorId,
    );
  }
  if (scope === "equipment" && actorId) {
    return snapshot.objects.filter(
      (object) => object.id !== rootObject.id && object.location?.type === "equipment_slot" && object.location.actor_id === actorId,
    );
  }
  if (scope === "hand_slots" && actorId) {
    return snapshot.objects.filter(
      (object) => object.id !== rootObject.id && object.location?.type === "hand_slot" && object.location.actor_id === actorId,
    );
  }
  return [];
};

export const dispatchGameObjectEventCascade = (
  snapshot: GameObjectModelSnapshot,
  objectOrId: GameObjectRuntime | string,
  event: GameObjectEvent,
): GameObjectCascadeDispatchResult | undefined => {
  const rootObject = typeof objectOrId === "string"
    ? snapshot.objects.find((object) => object.id === objectOrId || object.kernel_instance_id === objectOrId)
    : objectOrId;
  if (!rootObject) return undefined;

  const rootResult = dispatchGameObjectEvent(rootObject, {
    ...event,
    target_object_id: event.target_object_id || rootObject.id,
  });
  const root: GameObjectCascadeDispatchEntry = { object: rootObject, scope: "root", result: rootResult };
  const cascaded: GameObjectCascadeDispatchEntry[] = [];
  const visited = new Set<string>([rootObject.id]);

  if (rootResult.ok) {
    for (const scope of rootResult.cascade_scopes) {
      for (const target of cascadeTargetsForScope(snapshot, rootObject, scope, event)) {
        if (visited.has(target.id)) continue;
        visited.add(target.id);
        const result = dispatchGameObjectEvent(target, {
          ...event,
          target_object_id: target.id,
          payload: {
            ...(event.payload || {}),
            cascaded_from_object_id: rootObject.id,
            cascade_scope: scope,
          },
        });
        cascaded.push({ object: target, scope, result });
        if (!result.ok) {
          return {
            ok: false,
            reason: result.reason,
            vetoed_by_part_id: result.vetoed_by_part_id,
            root,
            cascaded,
            handled_object_ids: [...visited],
            emitted: [...rootResult.emitted, ...cascaded.flatMap((entry) => entry.result.emitted)],
          };
        }
      }
    }
  }

  return {
    ok: rootResult.ok,
    reason: rootResult.reason,
    vetoed_by_part_id: rootResult.vetoed_by_part_id,
    root,
    cascaded,
    handled_object_ids: [...visited],
    emitted: [...rootResult.emitted, ...cascaded.flatMap((entry) => entry.result.emitted)],
  };
};

const cloneCell = (cell: [number, number]): [number, number] => [cell[0], cell[1]];

const objectWorldCell = (object: GameObjectRuntime): [number, number] | undefined =>
  object.location?.type === "world_cell" ? cloneCell(object.location.cell) : undefined;

const objectMapId = (save: PlaySave, object: GameObjectRuntime): string =>
  object.location?.type === "world_cell" ? object.location.map_id : save.current_map_id;

const localTargetId = (object: GameObjectRuntime, mapId: string): string => {
  const kind = object.kind === "dropped_item" || object.kind === "container_item" ? "item" : object.kind;
  const prefix = `kinst:${mapId}:${kind}:`;
  if (object.kernel_instance_id?.startsWith(prefix)) return object.kernel_instance_id.slice(prefix.length);
  return object.kernel_instance_id || object.id;
};

const conditionTargetKind = (object: GameObjectRuntime): SimulationConditionRecord["target_kind"] => {
  if (object.kind === "door") return "door";
  if (object.kind === "container") return "container";
  if (object.kind === "item" || object.kind === "dropped_item" || object.kind === "container_item") return "item";
  return "object";
};

const materialIdForObject = (object: GameObjectRuntime): string | undefined => {
  const material = object.parts.find((part) => part.type === "material_profile");
  return typeof material?.data.material_id === "string" ? material.data.material_id : undefined;
};

const conditionForEmission = (
  save: PlaySave,
  object: GameObjectRuntime,
  emission: GameObjectPartEmission,
): SimulationConditionRecord | undefined => {
  if (emission.type !== "object_ignited" && emission.type !== "object_break_triggered") return undefined;
  const mapId = objectMapId(save, object);
  const cell = objectWorldCell(object);
  return {
    target_kind: conditionTargetKind(object),
    target_id: localTargetId(object, mapId),
    material_id: materialIdForObject(object),
    state: emission.type === "object_break_triggered" ? "broken" : "burned",
    integrity: emission.type === "object_break_triggered" ? 0 : 0.65,
    condition_tags: emission.type === "object_break_triggered" ? ["part:breakable"] : ["part:flammable", "ignited"],
    cell,
    last_action: emission.type,
    updated_at_tick: emission.tick,
  };
};

const appendCondition = (delta: MapDelta, condition: SimulationConditionRecord): MapDelta => ({
  ...delta,
  simulation_conditions: {
    ...(delta.simulation_conditions || {}),
    [condition.target_id]: condition,
  },
});

const appendIgnitionField = (
  delta: MapDelta,
  cell: [number, number] | undefined,
  emission: GameObjectPartEmission,
): { delta: MapDelta; field?: SimulationEnvironmentFieldRecord } => {
  if (!cell || emission.type !== "object_ignited") return { delta };
  const key = `${cell[0]}:${cell[1]}`;
  const current = delta.environment_fields?.[key] || [];
  const fuel = typeof emission.payload.fuel_value === "number" ? emission.payload.fuel_value : 1;
  const field: SimulationEnvironmentFieldRecord = {
    id: `env_part_fire_${emission.tick}_${cell[0]}_${cell[1]}_${current.length}`,
    kind: "fire",
    intensity: Math.max(0.35, Math.min(1, fuel / 4)),
    age_ticks: 0,
    source: "runtime",
    tag: "part_ignition",
    actor_id: typeof emission.payload.actor_id === "string" ? emission.payload.actor_id : undefined,
    action: emission.type,
    origin_cell: cloneCell(cell),
    radius: 1,
    damage_per_tick: 1,
    decay_per_tick: 0.01,
    created_at_tick: emission.tick,
    expires_at_tick: emission.tick + 80,
  };
  return {
    field,
    delta: {
      ...delta,
      environment_fields: {
        ...(delta.environment_fields || {}),
        [key]: [...current, field],
      },
    },
  };
};

const factForEmission = (
  save: PlaySave,
  object: GameObjectRuntime,
  emission: GameObjectPartEmission,
  offset: number,
): PlaySaveWorldFact => {
  const mapId = objectMapId(save, object);
  const cell = objectWorldCell(object);
  const targetId = localTargetId(object, mapId);
  return {
    id: `wfact:part:${String((save.world_facts?.length || 0) + offset + 1).padStart(6, "0")}`,
    tick: emission.tick,
    map_id: mapId,
    plane_id: KERNEL_DEFAULT_PLANE_ID,
    cells: cell ? [cell] : undefined,
    actor_id: typeof emission.payload.actor_id === "string" ? emission.payload.actor_id : undefined,
    target_id: targetId,
    action_type: emission.type,
    new_state: {
      object_id: object.id,
      kernel_instance_id: object.kernel_instance_id,
      blueprint_id: object.blueprint_id,
      part_id: emission.part_id,
    },
    direct_consequences: {
      ...emission.payload,
      part_id: emission.part_id,
      blueprint_id: object.blueprint_id,
    },
    resulting_object_instance_ids: object.kernel_instance_id ? [object.kernel_instance_id] : [object.id],
  };
};

export const applyGameObjectPartEmissionsToSave = (
  save: PlaySave,
  object: GameObjectRuntime,
  emissions: GameObjectPartEmission[],
): GameObjectPartConsequenceResult => {
  let nextSave = save;
  const worldFacts: PlaySaveWorldFact[] = [];
  const conditionRecords: SimulationConditionRecord[] = [];
  const environmentFields: SimulationEnvironmentFieldRecord[] = [];

  emissions.forEach((emission) => {
    const mapId = objectMapId(nextSave, object);
    const condition = conditionForEmission(nextSave, object, emission);
    const cell = objectWorldCell(object);
    const delta = { ...(nextSave.map_deltas?.[mapId] || {}) };
    const withCondition = condition ? appendCondition(delta, condition) : delta;
    const { delta: withField, field } = appendIgnitionField(withCondition, cell, emission);
    const fact = factForEmission(nextSave, object, emission, worldFacts.length);
    worldFacts.push(fact);
    if (condition) conditionRecords.push(condition);
    if (field) environmentFields.push(field);
    nextSave = {
      ...nextSave,
      map_deltas: {
        ...(nextSave.map_deltas || {}),
        [mapId]: withField,
      },
      world_facts: [...(nextSave.world_facts || []), fact].slice(-MAX_OBJECT_WORLD_FACTS),
    };
  });

  return { save: nextSave, world_facts: worldFacts, condition_records: conditionRecords, environment_fields: environmentFields };
};

export const applyGameObjectCascadeDispatchToSave = (
  save: PlaySave,
  dispatch: GameObjectCascadeDispatchResult,
): GameObjectPartConsequenceResult => {
  let nextSave = save;
  const worldFacts: PlaySaveWorldFact[] = [];
  const conditionRecords: SimulationConditionRecord[] = [];
  const environmentFields: SimulationEnvironmentFieldRecord[] = [];

  [dispatch.root, ...dispatch.cascaded].forEach((entry) => {
    const result = applyGameObjectPartEmissionsToSave(nextSave, entry.object, entry.result.emitted);
    nextSave = result.save;
    worldFacts.push(...result.world_facts);
    conditionRecords.push(...result.condition_records);
    environmentFields.push(...result.environment_fields);
  });

  return { save: nextSave, world_facts: worldFacts, condition_records: conditionRecords, environment_fields: environmentFields };
};
