import { resolveEncounter, type EncounterPlacementError } from "../../generation-facing/encounterContract";
import type {
  CellData,
  ContainerPlacementData,
  EncounterDefinition,
  EntityPlacementData,
  GamePackage,
  InitialChemistryData,
  MapData,
  ObjectPlacementData,
  TriggerData,
  WorldItemPlacementData,
} from "../../schema/game";
import type {
  DungeonDiagnostic,
  DungeonEncounterProfileDef,
  DungeonGraphNode,
  DungeonHazardPatternDef,
  DungeonHazardProfileDef,
  DungeonNarrativeProfileDef,
  DungeonRecipeDef,
  DungeonRewardProfileDef,
  DungeonRoomArchetypeDef,
  DungeonThemeProfileDef,
} from "../types";
import { dungeonDiagnostic, failedStage, successfulStage, type DungeonStageOutput } from "../diagnostics";
import type { DungeonSeedContext, DungeonRandom } from "../seedContext";
import type { DungeonSpatialResult } from "../embedding";
import { compareMacroCells, macroCellKey, type MacroCell } from "../embedding/gridSearch";

export interface DungeonCellMutation {
  cell: MacroCell;
  surfaceTag?: CellData["surface_tag"];
  hazard?: string;
  initialChemistry?: InitialChemistryData;
}

export interface DungeonObjectIntent extends Omit<ObjectPlacementData, "id"> {
  semanticKey: string;
}

export interface DungeonEntityIntent extends Omit<EntityPlacementData, "id"> {
  id?: string;
  semanticKey?: string;
}

export interface DungeonItemIntent extends Omit<WorldItemPlacementData, "id"> {
  semanticKey: string;
}

export interface DungeonContainerIntent extends Omit<ContainerPlacementData, "id"> {
  semanticKey: string;
}

export interface DungeonTriggerIntent extends Omit<TriggerData, "id"> {
  semanticKey: string;
}

export interface DungeonMapPopulation {
  mapId: string;
  cellMutations: DungeonCellMutation[];
  objects: DungeonObjectIntent[];
  entities: DungeonEntityIntent[];
  items: DungeonItemIntent[];
  containers: DungeonContainerIntent[];
  triggers: DungeonTriggerIntent[];
  hazardPatternIds: string[];
  encounterSituationIds: string[];
  narrativeTraceIds: string[];
}

export interface DungeonPopulationResult {
  maps: Record<string, DungeonMapPopulation>;
  activeHazardCells: number;
  encounterRooms: number;
  quietRooms: number;
  rewardRooms: number;
  narrativeRooms: number;
}

export interface DungeonPopulationInput {
  recipe: DungeonRecipeDef;
  spatial: DungeonSpatialResult;
  gamePackage: GamePackage;
  theme: DungeonThemeProfileDef;
  archetypes: readonly DungeonRoomArchetypeDef[];
  encounterProfile?: DungeonEncounterProfileDef;
  hazardProfile?: DungeonHazardProfileDef;
  rewardProfile?: DungeonRewardProfileDef;
  narrativeProfile?: DungeonNarrativeProfileDef;
  seedContext: DungeonSeedContext;
  shouldCancel?: () => boolean;
}

const emptyMapPopulation = (mapId: string): DungeonMapPopulation => ({
  mapId,
  cellMutations: [],
  objects: [],
  entities: [],
  items: [],
  containers: [],
  triggers: [],
  hazardPatternIds: [],
  encounterSituationIds: [],
  narrativeTraceIds: [],
});

const chemistryForRuntime = (source: DungeonHazardPatternDef["initialChemistry"]): InitialChemistryData => ({
  material_id: source.materialId,
  liquid_id: source.liquidId,
  temperature: source.temperature,
  saturation: source.saturation,
  charge: source.charge,
  integrity: source.integrity,
  foam: source.foam,
  fuel: source.fuel,
  stability: source.stability,
  scorch: source.scorch,
  frozen: source.frozen,
  liquid_volume: source.liquidVolume,
  vapor: source.vapor,
});

const surfaceForPattern = (pattern: DungeonHazardPatternDef): CellData["surface_tag"] => {
  if (pattern.kind === "flood" || pattern.kind === "electric_water") return "water";
  if (pattern.kind === "fire") return "firehazard";
  if (pattern.kind === "ice") return "ice";
  return "none";
};

const nodeTags = (node: DungeonGraphNode, archetypeById: ReadonlyMap<string, DungeonRoomArchetypeDef>) =>
  new Set([...node.tags, ...(archetypeById.get(node.archetypeId)?.tags ?? [])]);

const matchesRoomTags = (required: readonly string[], tags: ReadonlySet<string>) =>
  required.length === 0 || required.some((tag) => tags.has(tag));

const isSafeStagingNode = (
  node: DungeonGraphNode,
  archetypeById: ReadonlyMap<string, DungeonRoomArchetypeDef>,
) => {
  const tags = nodeTags(node, archetypeById);
  return tags.has("pre_objective") || tags.has("staging") || tags.has("rest") ||
    (tags.has("quiet") && node.mandatory);
};

const roomCenterCell = (input: DungeonPopulationInput, nodeId: string): MacroCell | undefined => {
  const walkable = input.spatial.roomGeometry[nodeId]?.cells
    .filter((entry) => entry.walkable)
    .map((entry) => entry.cell) ?? [];
  if (!walkable.length) return undefined;
  const room = input.spatial.embedded.rooms.find((entry) => entry.nodeId === nodeId);
  const center: MacroCell = room
    ? [room.bounds.x + Math.floor(room.bounds.width / 2), room.bounds.z + Math.floor(room.bounds.depth / 2)]
    : walkable[0];
  return [...walkable].sort((left, right) =>
    Math.abs(left[0] - center[0]) + Math.abs(left[1] - center[1]) -
      (Math.abs(right[0] - center[0]) + Math.abs(right[1] - center[1])) || compareMacroCells(left, right))[0];
};

/**
 * Infrastructure cells are kept out of every population pool. The bake pass
 * uses room sockets for doors and vertical transitions, and uses room centers
 * for the primary/objective cells. Reserving them here prevents a later map
 * validator from having to reject otherwise-good geometry because an actor or
 * blocking prop landed on a spawn, exit, door threshold, or required target.
 */
const infrastructureCellsForRoom = (input: DungeonPopulationInput, nodeId: string): MacroCell[] => {
  const room = input.spatial.embedded.rooms.find((entry) => entry.nodeId === nodeId);
  const geometry = input.spatial.roomGeometry[nodeId];
  if (!room || !geometry) return [];
  const geometryKeys = new Set(geometry.cells.filter((entry) => entry.walkable).map((entry) => macroCellKey(entry.cell)));
  const result = new Map<string, MacroCell>();
  const reserve = (cell: readonly number[] | undefined) => {
    if (!cell) return;
    const candidate: MacroCell = [Number(cell[0]), Number(cell[1])];
    const key = macroCellKey(candidate);
    if (geometryKeys.has(key)) result.set(key, candidate);
  };
  room.reservedCells.forEach(reserve);
  room.sockets.forEach((socket) => reserve(socket.cell));
  let ownsTransitionEndpoint = false;
  input.spatial.embedded.transitions.forEach((transition) => {
    if (transition.fromMapId === geometry.mapId && geometryKeys.has(macroCellKey(transition.fromCell))) {
      reserve(transition.fromCell);
      ownsTransitionEndpoint = true;
    }
    if (transition.toMapId === geometry.mapId && geometryKeys.has(macroCellKey(transition.toCell))) {
      reserve(transition.toCell);
      ownsTransitionEndpoint = true;
    }
  });
  if (ownsTransitionEndpoint || nodeId === input.spatial.graph.entranceNodeId || nodeId === input.spatial.graph.objectiveNodeId) {
    reserve(roomCenterCell(input, nodeId));
  }
  return [...result.values()].sort(compareMacroCells);
};

const walkableRoomCells = (input: DungeonPopulationInput, nodeId: string): MacroCell[] => {
  const reserved = new Set(infrastructureCellsForRoom(input, nodeId).map(macroCellKey));
  return (input.spatial.roomGeometry[nodeId]?.cells ?? [])
    .filter((entry) => entry.walkable && !reserved.has(macroCellKey(entry.cell)))
    .map((entry) => [...entry.cell] as MacroCell)
    .sort(compareMacroCells);
};

const centerFirst = (cells: readonly MacroCell[]): MacroCell[] => {
  if (!cells.length) return [];
  const averageX = cells.reduce((sum, cell) => sum + cell[0], 0) / cells.length;
  const averageZ = cells.reduce((sum, cell) => sum + cell[1], 0) / cells.length;
  return [...cells].sort((left, right) =>
    Math.abs(left[0] - averageX) + Math.abs(left[1] - averageZ) -
      (Math.abs(right[0] - averageX) + Math.abs(right[1] - averageZ)) || compareMacroCells(left, right));
};

const chooseFreeCell = (
  cells: readonly MacroCell[],
  occupied: Set<string>,
  rng: DungeonRandom,
  preferEdge = false,
): MacroCell | undefined => {
  const available = cells.filter((cell) => !occupied.has(macroCellKey(cell)));
  if (!available.length) return undefined;
  const ordered = preferEdge ? [...available].sort(compareMacroCells) : centerFirst(available);
  const window = ordered.slice(0, Math.min(8, ordered.length)).map((cell) => ({ id: macroCellKey(cell), cell }));
  const selected = rng.pick(rng.shuffleById(window)).cell;
  occupied.add(macroCellKey(selected));
  return [...selected];
};

const weightedPermutation = <T extends { id: string; weight: number }>(
  values: readonly T[],
  rng: DungeonRandom,
  label: string,
): T[] => {
  const remaining = [...values].sort((left, right) => left.id.localeCompare(right.id));
  const ordered: T[] = [];
  while (remaining.length > 0) {
    const selected = rng.weighted(
      remaining.map((entry) => ({ id: entry.id, weight: entry.weight, value: entry })),
      `${label}:${ordered.length}`,
    );
    ordered.push(selected);
    remaining.splice(remaining.findIndex((entry) => entry.id === selected.id), 1);
  }
  return ordered;
};

const provisionalMap = (
  input: DungeonPopulationInput,
  mapId: string,
  population: DungeonMapPopulation,
): MapData => {
  const floor = input.spatial.embedded.maps.find((entry) => entry.mapId === mapId)!;
  const cells = new Map<string, CellData>();
  for (const geometry of Object.values(input.spatial.roomGeometry).filter((entry) => entry.mapId === mapId)) {
    for (const entry of geometry.cells) cells.set(macroCellKey(entry.cell), {
      x: entry.cell[0], y: 0, z: entry.cell[1], active: true, walkable: entry.walkable,
      blocks_los: !entry.walkable, height: entry.height, visual_height: entry.visualHeight,
      terrain: entry.terrain ?? input.theme.architecture.floorTerrain,
      object_id: entry.objectId, room_id: geometry.nodeId, tag: entry.tag,
      surface_tag: entry.surfaceTag,
    });
  }
  input.spatial.embedded.corridors.filter((entry) => entry.mapId === mapId).forEach((corridor) => corridor.cells.forEach((cell) => {
    if (!cells.has(macroCellKey(cell))) cells.set(macroCellKey(cell), {
      x: cell[0], y: 0, z: cell[1], active: true, walkable: true, blocks_los: false,
      height: 0, visual_height: 0, terrain: input.theme.architecture.floorTerrain, tag: "corridor", surface_tag: "none",
    });
  }));
  const mutationByCell = new Map(population.cellMutations.map((entry) => [macroCellKey(entry.cell), entry]));
  for (const [key, cell] of cells) {
    const mutation = mutationByCell.get(key);
    if (mutation) cells.set(key, { ...cell, surface_tag: mutation.surfaceTag ?? cell.surface_tag,
      hazard: mutation.hazard, initial_chemistry: mutation.initialChemistry });
  }
  return {
    id: mapId, display_name: floor.displayName, width: floor.width, height: floor.depth,
    spawns: [], cells: [...cells.values()], props: [],
    custom_object_placements: population.objects.map((entry) => ({ ...entry, id: undefined })),
    entity_placements: population.entities.map(({ semanticKey: _semanticKey, ...entry }) => entry),
    item_placements: [], container_placements: [], regions: [], triggers: [], exits: [],
  };
};

const synthesizeEncounter = (
  situation: DungeonEncounterProfileDef["situations"][number],
  gamePackage: GamePackage,
): EncounterDefinition | undefined => {
  if (situation.encounterId) return gamePackage.encounters.find((entry) => entry.id === situation.encounterId);
  if (!situation.actorSlots.length) return undefined;
  return {
    id: situation.id,
    tags: situation.tags,
    difficulty: situation.threatCost,
    minArea: situation.actorSlots.reduce((sum, slot) => sum + slot.minCount, 0),
    slots: situation.actorSlots.map((slot) => ({
      entityId: slot.entityId,
      role: slot.role,
      minCount: slot.minCount,
      maxCount: slot.maxCount,
      placementRule: slot.role,
    })),
  };
};

const populateHazards = (
  input: DungeonPopulationInput,
  maps: Record<string, DungeonMapPopulation>,
  occupied: Map<string, Set<string>>,
  diagnostics: DungeonDiagnostic[],
): number => {
  const profile = input.hazardProfile;
  if (!profile) return 0;
  const rng = input.seedContext.stream("hazards");
  const archetypeById = new Map(input.archetypes.map((entry) => [entry.id, entry]));
  const nodes = rng.shuffleById(input.spatial.graph.nodes.filter((node) =>
    !node.tags.includes("entrance") && !isSafeStagingNode(node, archetypeById)))
    .filter((node) => walkableRoomCells(input, node.id).length > 0);
  const maxRooms = Math.min(nodes.length, Math.floor(input.spatial.graph.nodes.length * profile.maxHazardRoomRatio));
  let remainingBudget = input.recipe.difficulty.hazardBudget;
  let activeCells = 0;
  const usedRooms = new Set<string>();
  const permittedPatterns = profile.patterns.filter((pattern) =>
    pattern.requiredVerbs.every((verb) => input.recipe.constraints.permittedVerbs.includes(verb)));
  // These are the v1 systemic demonstrations, expressed through the authored
  // pattern kind rather than any content-library ID. Select one of each first;
  // supplemental gas/foam/fire patterns cannot consume their budget or only
  // optional host before the core setups have had a legal placement attempt.
  const coreKinds: readonly DungeonHazardPatternDef["kind"][] = [
    "flood",
    "electric_water",
    "flammable_debris",
  ];
  const corePatterns = coreKinds.flatMap((kind) => {
    const candidates = weightedPermutation(permittedPatterns.filter((pattern) => pattern.kind === kind), rng, `core:${kind}`);
    return candidates.length ? [candidates[0]] : [];
  });
  const coreIds = new Set(corePatterns.map((pattern) => pattern.id));
  const patternOrder = [
    ...corePatterns,
    ...weightedPermutation(permittedPatterns.filter((pattern) => !coreIds.has(pattern.id)), rng, "supplemental"),
  ];
  for (const pattern of patternOrder) {
    if (pattern.hazardCost > remainingBudget) continue;
    const candidates = nodes.filter((node) =>
      (!node.mandatory || pattern.criticalPathAllowed) &&
      (!pattern.requiresAlternateRoute || !node.mandatory) &&
      matchesRoomTags(pattern.roomTags, nodeTags(node, archetypeById)) &&
      (usedRooms.size < maxRooms || usedRooms.has(node.id)));
    // Critical-path-safe patterns consume mandatory hosts first so optional
    // hosts remain available for patterns that explicitly forbid the critical
    // path. A room may intentionally hold more than one compatible chemistry
    // pattern; the unique-room ratio is still enforced by usedRooms.
    candidates.sort((left, right) => {
      const leftRank = pattern.criticalPathAllowed && !pattern.requiresAlternateRoute
        ? Number(!left.mandatory) * 2 + Number(usedRooms.has(left.id))
        : Number(usedRooms.has(left.id));
      const rightRank = pattern.criticalPathAllowed && !pattern.requiresAlternateRoute
        ? Number(!right.mandatory) * 2 + Number(usedRooms.has(right.id))
        : Number(usedRooms.has(right.id));
      return leftRank - rightRank || left.id.localeCompare(right.id);
    });
    const placement = candidates.flatMap((candidate) => {
      const roomOccupied = occupied.get(candidate.id)!;
      const availableCells = centerFirst(walkableRoomCells(input, candidate.id))
        .filter((cell) => !roomOccupied.has(macroCellKey(cell)));
      const allowedCount = Math.min(
        pattern.activeCellCount.max,
        availableCells.length,
        profile.maxInitialActiveCells - activeCells,
      );
      return allowedCount >= pattern.activeCellCount.min
        ? [{ candidate, roomOccupied, availableCells, allowedCount }]
        : [];
    })[0];
    if (!placement) continue;
    const { candidate, roomOccupied, availableCells, allowedCount } = placement;
    const geometry = input.spatial.roomGeometry[candidate.id];
    const mapPopulation = maps[geometry.mapId];
    const count = rng.intBetween(pattern.activeCellCount.min, allowedCount);
    for (const cell of availableCells.slice(0, count)) {
      mapPopulation.cellMutations.push({
        cell: [...cell], surfaceTag: surfaceForPattern(pattern), hazard: pattern.kind,
        initialChemistry: chemistryForRuntime(pattern.initialChemistry),
      });
      roomOccupied.add(macroCellKey(cell));
    }
    const existingObjects = new Set(input.gamePackage.object_library.map((entry) => entry.id));
    const sourceId = pattern.sourceObjectIds.find((id) => existingObjects.has(id));
    const responseId = pattern.responseObjectIds.find((id) => existingObjects.has(id));
    for (const [role, objectId] of [["source", sourceId], ["response", responseId]] as const) {
      if (!objectId) continue;
      const cell = chooseFreeCell(walkableRoomCells(input, candidate.id), roomOccupied, rng, true);
      if (cell) mapPopulation.objects.push({ semanticKey: `${pattern.id}:${candidate.id}:${role}`, object_id: objectId,
        cell, facing: [0, 1], collision_mode: "none" });
    }
    mapPopulation.hazardPatternIds.push(pattern.id);
    usedRooms.add(candidate.id);
    remainingBudget -= pattern.hazardCost;
    activeCells += count;
  }
  const placedPatternIds = new Set(Object.values(maps).flatMap((entry) => entry.hazardPatternIds));
  if (profile.patterns.length >= 3 && placedPatternIds.size < 3) diagnostics.push(dungeonDiagnostic(
    "warning", "hazards", "DNG_HAZARD_VARIETY_SHORTFALL",
    "Fewer than three distinct hazard patterns fit the available tagged rooms and hazard budget.",
  ));
  const missingCoreKinds = coreKinds.filter((kind) =>
    permittedPatterns.some((pattern) => pattern.kind === kind) &&
    !permittedPatterns.some((pattern) => pattern.kind === kind && placedPatternIds.has(pattern.id)));
  if (missingCoreKinds.length) diagnostics.push(dungeonDiagnostic(
    "warning", "hazards", "DNG_CORE_SYSTEMIC_HAZARD_SHORTFALL",
    `Could not place the configured core systemic pattern kinds: ${missingCoreKinds.join(", ")}.`,
  ));
  return activeCells;
};

const manipulationDirections: readonly MacroCell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const populateManipulationObject = (
  input: DungeonPopulationInput,
  maps: Record<string, DungeonMapPopulation>,
  occupied: Map<string, Set<string>>,
  diagnostics: DungeonDiagnostic[],
): number => {
  const objectId = input.theme.architecture.pushableObjectId;
  if (!objectId || !input.recipe.constraints.permittedVerbs.includes("push")) return 0;
  if (!input.gamePackage.object_library.some((entry) => entry.id === objectId)) {
    diagnostics.push(dungeonDiagnostic(
      "warning", "population", "DNG_PUSHABLE_OBJECT_REFERENCE_MISSING",
      `Theme pushable object ${objectId} is unavailable, so no manipulation setup was placed.`,
      { relatedIds: [objectId] },
    ));
    return 0;
  }
  const rng = input.seedContext.stream("infrastructure");
  const archetypeById = new Map(input.archetypes.map((entry) => [entry.id, entry]));
  const candidates = input.spatial.graph.nodes.filter((node) =>
    node.id !== input.spatial.graph.entranceNodeId &&
    node.id !== input.spatial.graph.objectiveNodeId &&
    !isSafeStagingNode(node, archetypeById));
  const rank = (node: DungeonGraphNode) => {
    const tags = nodeTags(node, archetypeById);
    if (tags.has("manipulation") || tags.has("pushable")) return 0;
    if (tags.has("hazard") || tags.has("service")) return 1;
    if (tags.has("combat") || tags.has("arena")) return 2;
    if (tags.has("resource") || tags.has("storage")) return 3;
    return 4;
  };
  candidates.sort((left, right) => rank(left) - rank(right) || left.id.localeCompare(right.id));
  for (const node of candidates) {
    const roomOccupied = occupied.get(node.id)!;
    const roomCells = walkableRoomCells(input, node.id);
    const roomCellKeys = new Set(roomCells.map(macroCellKey));
    const legal = roomCells.flatMap((cell) => {
      if (roomOccupied.has(macroCellKey(cell))) return [];
      const openDirections = manipulationDirections.filter(([dx, dz]) => {
        const neighbor: MacroCell = [cell[0] + dx, cell[1] + dz];
        return roomCellKeys.has(macroCellKey(neighbor)) && !roomOccupied.has(macroCellKey(neighbor));
      });
      // Two clear sides ensure the crate has a legal player approach and at
      // least one push destination under the ordinary manipulation kernel.
      return openDirections.length >= 2 ? [{ cell, facing: openDirections[0] }] : [];
    });
    if (!legal.length) continue;
    const edgeFirst = [...legal].sort((left, right) => compareMacroCells(left.cell, right.cell));
    const placement = rng.pick(rng.shuffleById(edgeFirst.slice(0, Math.min(12, edgeFirst.length)).map((entry) => ({
      id: `${macroCellKey(entry.cell)}:${macroCellKey(entry.facing)}`,
      ...entry,
    }))));
    roomOccupied.add(macroCellKey(placement.cell));
    maps[input.spatial.roomGeometry[node.id].mapId].objects.push({
      semanticKey: `manipulation:pushable:${node.id}`,
      object_id: objectId,
      cell: [...placement.cell],
      facing: [...placement.facing],
      collision_mode: "inherit",
    });
    return 1;
  }
  diagnostics.push(dungeonDiagnostic(
    "warning", "population", "DNG_PUSHABLE_OBJECT_PLACEMENT_SHORTFALL",
    `No room had a clear approach and destination for ordinary pushable object ${objectId}.`,
    { relatedIds: [objectId] },
  ));
  return 0;
};

const populateRewards = (
  input: DungeonPopulationInput,
  maps: Record<string, DungeonMapPopulation>,
  occupied: Map<string, Set<string>>,
): number => {
  const rng = input.seedContext.stream("rewards");
  const itemIds = new Set(input.gamePackage.items.map((entry) => entry.id));
  let rewardRooms = 0;
  for (const gate of input.spatial.graph.gates) {
    if (!gate.requiredId || !gate.sourceNodeId || !itemIds.has(gate.requiredId)) continue;
    const geometry = input.spatial.roomGeometry[gate.sourceNodeId];
    const cell = chooseFreeCell(walkableRoomCells(input, gate.sourceNodeId), occupied.get(gate.sourceNodeId)!, rng);
    if (cell) maps[geometry.mapId].items.push({ semanticKey: `gate-key:${gate.id}`, item_id: gate.requiredId, cell, count: 1 });
  }
  const profile = input.rewardProfile;
  if (!profile) return rewardRooms;
  const archetypeById = new Map(input.archetypes.map((entry) => [entry.id, entry]));
  const existingObjects = new Set(input.gamePackage.object_library.map((entry) => entry.id));
  const eligible = rng.shuffleById(input.spatial.graph.nodes.filter((node) => {
    const tags = nodeTags(node, archetypeById);
    return tags.has("resource") || tags.has("reward") || tags.has("branch_end") || node.secret;
  }));
  let budget = input.recipe.difficulty.resourceBudget;
  const target = Math.min(profile.guaranteedResourceRooms, eligible.length);
  for (const node of eligible) {
    if (rewardRooms >= target && budget <= 0) break;
    const tier = profile.tiers.filter((entry) => node.depth >= entry.minDepth && node.depth <= entry.maxDepth)
      .sort((left, right) => right.minDepth - left.minDepth || left.id.localeCompare(right.id))[0];
    if (!tier || tier.resourceCost > budget && rewardRooms >= target) continue;
    const containerPool = profile.containerObjectIds.filter((entry) => existingObjects.has(entry.id));
    if (!containerPool.length) continue;
    const cell = chooseFreeCell(walkableRoomCells(input, node.id), occupied.get(node.id)!, rng, true);
    if (!cell) continue;
    const objectId = rng.weighted(containerPool.map((entry) => ({ ...entry, value: entry.id })), `reward-container:${node.id}`);
    const count = rng.intBetween(tier.minItemCount, tier.maxItemCount);
    const items = Array.from({ length: count }, (_, index) => {
      const pool = tier.itemPool.filter((entry) => itemIds.has(entry.id));
      return pool.length ? rng.weighted(pool.map((entry) => ({ ...entry, value: entry.id })), `reward:${node.id}:${index}`) : undefined;
    }).filter((id): id is string => Boolean(id));
    if (!items.length) continue;
    const counts = new Map<string, number>();
    items.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    maps[input.spatial.roomGeometry[node.id].mapId].containers.push({
      semanticKey: `reward:${node.id}`, object_id: objectId, cell, facing: [0, 1],
      display_name: "Dungeon Cache", locked: false, consume_key: false,
      items: [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([item_id, itemCount]) => ({ item_id, count: itemCount })),
    });
    rewardRooms += 1;
    budget -= tier.resourceCost;
  }
  return rewardRooms;
};

const populateNarrative = (
  input: DungeonPopulationInput,
  maps: Record<string, DungeonMapPopulation>,
  occupied: Map<string, Set<string>>,
  diagnostics: DungeonDiagnostic[],
): number => {
  const profile = input.narrativeProfile;
  if (!profile) return 0;
  const rng = input.seedContext.stream("dressing");
  const archetypeById = new Map(input.archetypes.map((entry) => [entry.id, entry]));
  const objectIds = new Set(input.gamePackage.object_library.map((entry) => entry.id));
  const entityIds = new Set(input.gamePackage.entities.map((entry) => entry.id));
  const documentIds = new Set(input.gamePackage.documents.map((entry) => entry.id));
  const dialogueIds = new Set(input.gamePackage.dialogue.map((entry) => entry.id));
  const cutsceneIds = new Set(input.gamePackage.cutscenes.map((entry) => entry.id));
  const hasDocumentInteraction = (trace: DungeonNarrativeProfileDef["traces"][number]) => {
    if (!trace.documentId) return true;
    if (!trace.cutsceneId) return false;
    return input.gamePackage.cutscenes.find((entry) => entry.id === trace.cutsceneId)?.actions.some((action) =>
      action.type === "read_document" && action.document_id === trace.documentId) ?? false;
  };
  const validReferences = profile.traces.filter((trace) =>
    (!trace.objectId || objectIds.has(trace.objectId)) && (!trace.entityId || entityIds.has(trace.entityId)) &&
    (!trace.documentId || documentIds.has(trace.documentId)) &&
    (!trace.dialogueId || dialogueIds.has(trace.dialogueId)) && (!trace.cutsceneId || cutsceneIds.has(trace.cutsceneId)));
  const unlinkedDocuments = validReferences.filter((trace) => trace.documentId && !hasDocumentInteraction(trace));
  unlinkedDocuments.forEach((trace) => diagnostics.push(dungeonDiagnostic(
    "warning", "dressing", "DNG_DOCUMENT_TRACE_INTERACTION_MISSING",
    `Narrative trace ${trace.id} references document ${trace.documentId} without a placed cutscene that reads it.`,
    { relatedIds: [trace.id, trace.documentId!] },
  )));
  const traces = rng.shuffleById(validReferences.filter(hasDocumentInteraction));
  const maxRooms = Math.floor(input.spatial.graph.nodes.length * profile.maxTraceRoomRatio);
  const used = new Set<string>();
  let traceRooms = 0;
  for (const trace of traces) {
    if (traceRooms >= maxRooms) break;
    const node = rng.shuffleById(input.spatial.graph.nodes.filter((candidate) => !used.has(candidate.id) &&
      !candidate.tags.includes("entrance") && matchesRoomTags(trace.roomTags, nodeTags(candidate, archetypeById))))[0];
    if (!node) continue;
    const cell = chooseFreeCell(walkableRoomCells(input, node.id), occupied.get(node.id)!, rng, true);
    if (!cell) continue;
    const mapPopulation = maps[input.spatial.roomGeometry[node.id].mapId];
    if (trace.objectId) mapPopulation.objects.push({
      semanticKey: `narrative:${trace.id}:${node.id}`, object_id: trace.objectId, cell, facing: [0, 1], collision_mode: "none",
      dialogue_id: trace.dialogueId,
    });
    if (trace.entityId) mapPopulation.entities.push({ semanticKey: `narrative:${trace.id}:${node.id}`, entity_id: trace.entityId, cell, facing: [0, 1] });
    if (trace.cutsceneId) mapPopulation.triggers.push({
      semanticKey: `narrative:${trace.id}:${node.id}`, cell, type: "interact", conditions: [],
      cutscene_id: trace.cutsceneId, once: true,
    });
    if (!trace.objectId && !trace.entityId && !trace.cutsceneId) diagnostics.push(dungeonDiagnostic(
      "info", "dressing", "DNG_DOCUMENT_TRACE_NOT_DIRECTLY_PLACEABLE",
      `Trace ${trace.id} only references content without an ordinary map interaction field and was not materialized.`,
      { nodeId: node.id, relatedIds: [trace.id] },
    ));
    else {
      mapPopulation.narrativeTraceIds.push(trace.id);
      used.add(node.id);
      traceRooms += 1;
    }
  }
  if (traceRooms < profile.minTraceRooms) diagnostics.push(dungeonDiagnostic(
    "warning", "dressing", "DNG_NARRATIVE_TRACE_SHORTFALL",
    `Placed ${traceRooms} narrative trace rooms; profile requests at least ${profile.minTraceRooms}.`,
  ));
  return traceRooms;
};

const populateEncounters = (
  input: DungeonPopulationInput,
  maps: Record<string, DungeonMapPopulation>,
  occupied: Map<string, Set<string>>,
  diagnostics: DungeonDiagnostic[],
): { encounterRooms: number; quietRooms: number } => {
  const profile = input.encounterProfile;
  if (!profile) return { encounterRooms: 0, quietRooms: input.spatial.graph.nodes.length };
  const rng = input.seedContext.stream("encounters");
  const archetypeById = new Map(input.archetypes.map((entry) => [entry.id, entry]));
  const maximumCombat = Math.floor(input.spatial.graph.nodes.length * profile.maxCombatRoomRatio);
  const minimumQuiet = Math.ceil(input.spatial.graph.nodes.length * profile.quietRoomRatio);
  const maximumPopulated = Math.max(0, input.spatial.graph.nodes.length - minimumQuiet);
  let combatRooms = 0;
  let encounterRooms = 0;
  const nodes = rng.shuffleById(input.spatial.graph.nodes.filter((node) =>
    !node.tags.includes("entrance") && !isSafeStagingNode(node, archetypeById)));
  const populatedNodes = new Set<string>();
  for (const node of nodes) {
    if (encounterRooms >= maximumPopulated) break;
    const tags = nodeTags(node, archetypeById);
    const roomCellKeys = new Set(walkableRoomCells(input, node.id).map(macroCellKey));
    const roomHasHazard = maps[input.spatial.roomGeometry[node.id].mapId].cellMutations
      .some((mutation) => roomCellKeys.has(macroCellKey(mutation.cell)));
    const situations = profile.situations.filter((situation) => matchesRoomTags(situation.roomTags, tags) &&
      situation.requiredEntryCount <= input.spatial.graph.edges.filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id).length &&
      (!situation.requiresHazard || roomHasHazard));
    if (!situations.length) continue;
    const situation = rng.weighted(situations.map((entry) => ({ id: entry.id, weight: entry.weight, value: entry })), `situation:${node.id}`);
    const isCombat = situation.pressure === "combat" || situation.pressure === "climax";
    if (isCombat && combatRooms >= maximumCombat) continue;
    if (isCombat && input.spatial.graph.edges.some((edge) => {
      const neighbor = edge.fromNodeId === node.id ? edge.toNodeId : edge.toNodeId === node.id ? edge.fromNodeId : undefined;
      return neighbor ? populatedNodes.has(neighbor) : false;
    })) continue;
    const encounter = synthesizeEncounter(situation, input.gamePackage);
    if (!encounter) continue;
    const roomCells = walkableRoomCells(input, node.id).filter((cell) => !occupied.get(node.id)!.has(macroCellKey(cell)));
    if (roomCells.length < encounter.minArea) continue;
    const mapPopulation = maps[input.spatial.roomGeometry[node.id].mapId];
    try {
      const result = resolveEncounter({
        encounter,
        map: provisionalMap(input, mapPopulation.mapId, mapPopulation),
        eligibleCells: roomCells,
        entities: input.gamePackage.entities,
        seed: `${input.recipe.seed}|encounters|${node.id}`,
        instanceId: `${situation.id}:${node.id}`,
        difficultyBudget: input.recipe.difficulty.baseThreat + input.recipe.difficulty.threatGrowthByDepth * node.depth + situation.threatCost,
        approachCell: input.spatial.embedded.rooms.find((room) => room.nodeId === node.id)?.sockets[0]?.cell,
        allowHazards: situation.requiresHazard,
      });
      result.placements.forEach((placement) => {
        mapPopulation.entities.push({ ...placement });
        occupied.get(node.id)!.add(macroCellKey([Number(placement.cell[0]), Number(placement.cell[1])]));
      });
      mapPopulation.encounterSituationIds.push(situation.id);
      result.notices.forEach((notice) => diagnostics.push(dungeonDiagnostic(
        "info", "encounters", notice.code, notice.message, { nodeId: node.id, mapId: mapPopulation.mapId },
      )));
      populatedNodes.add(node.id);
      encounterRooms += 1;
      if (isCombat) combatRooms += 1;
    } catch (error) {
      const issues = (error as EncounterPlacementError).issues;
      diagnostics.push(dungeonDiagnostic(
        "warning", "encounters", "DNG_ENCOUNTER_PLACEMENT_REJECTED",
        issues?.map((issue) => issue.message).join("; ") || `Encounter ${situation.id} could not be placed.`,
        { nodeId: node.id, mapId: mapPopulation.mapId, relatedIds: [situation.id] },
      ));
    }
  }
  return { encounterRooms, quietRooms: input.spatial.graph.nodes.length - encounterRooms };
};

export const populateDungeon = (
  input: DungeonPopulationInput,
): DungeonStageOutput<DungeonPopulationResult> => {
  if (input.shouldCancel?.()) return failedStage([dungeonDiagnostic(
    "fatal", "population", "DNG_GENERATION_CANCELED", "Dungeon population was canceled.",
  )]);
  const diagnostics: DungeonDiagnostic[] = [];
  const maps = Object.fromEntries(input.spatial.embedded.maps.map((floor) => [floor.mapId, emptyMapPopulation(floor.mapId)]));
  const occupied = new Map(input.spatial.graph.nodes.map((node) => [
    node.id,
    new Set(infrastructureCellsForRoom(input, node.id).map(macroCellKey)),
  ]));
  const activeHazardCells = populateHazards(input, maps, occupied, diagnostics);
  const manipulationObjects = populateManipulationObject(input, maps, occupied, diagnostics);
  const rewardRooms = populateRewards(input, maps, occupied);
  const narrativeRooms = populateNarrative(input, maps, occupied, diagnostics);
  const { encounterRooms, quietRooms } = populateEncounters(input, maps, occupied, diagnostics);
  Object.values(maps).forEach((entry) => {
    entry.cellMutations.sort((left, right) => compareMacroCells(left.cell, right.cell));
    entry.objects.sort((left, right) => left.semanticKey.localeCompare(right.semanticKey));
    entry.entities.sort((left, right) => (left.id ?? left.semanticKey ?? "").localeCompare(right.id ?? right.semanticKey ?? ""));
    entry.items.sort((left, right) => left.semanticKey.localeCompare(right.semanticKey));
    entry.containers.sort((left, right) => left.semanticKey.localeCompare(right.semanticKey));
    entry.triggers.sort((left, right) => left.semanticKey.localeCompare(right.semanticKey));
    entry.hazardPatternIds.sort();
    entry.encounterSituationIds.sort();
    entry.narrativeTraceIds.sort();
  });
  const value = { maps, activeHazardCells, encounterRooms, quietRooms, rewardRooms, narrativeRooms };
  const metrics = { activeHazardCells, encounterRooms, quietRooms, rewardRooms, narrativeRooms,
    manipulationObjects,
    objects: Object.values(maps).reduce((sum, entry) => sum + entry.objects.length, 0),
    entities: Object.values(maps).reduce((sum, entry) => sum + entry.entities.length, 0) };
  return diagnostics.some((entry) => entry.severity === "fatal")
    ? failedStage(diagnostics, metrics)
    : successfulStage(value, diagnostics, metrics);
};
