import type { MapData } from "../schema/game";
import type {
  BackroomsRuntimeState,
  PlaySave,
} from "../schema/save";
import {
  fineCenterOfMacro,
  macroOfFine,
} from "../engine-core/gridCoordinates";
import { hashSeed } from "../engine-core/rng";

export const BACKROOMS_MUTABLE_PORTAL_PREFIX = "brg.mutable:";
const RECENT_ROOM_LIMIT = 4;
const RECENT_PORTAL_LIMIT = 6;
const SHIFT_ROOM_INTERVAL = 3;

export interface BackroomsPortalEndpoint {
  id: string;
  portalId: string;
  edgeId: string;
  roomId: string;
  cell: [number, number];
}

export interface BackroomsPortalShift {
  mapId: string;
  sequence: number;
  endpointIds: [string, string, string, string];
  pinnedRoomIds: string[];
}

export interface BackroomsObservationAdvance {
  save: PlaySave;
  changed: boolean;
  shift?: BackroomsPortalShift;
}

export interface BackroomsPortalTraversal {
  save: PlaySave;
  traversed: boolean;
  sourceEndpointId?: string;
  targetEndpointId?: string;
  destinationCell?: [number, number];
}

type BackroomsPortalIndex = {
  cells: MapData["cells"];
  endpoints: BackroomsPortalEndpoint[];
  endpointByMacroCell: Map<string, BackroomsPortalEndpoint>;
};

// Generated Backrooms topology is immutable for the lifetime of a loaded map.
// Portal checks, however, run on the movement hot path. Index once per authored
// cell array so an ordinary step is O(1) instead of scanning 13k+ macro cells.
const portalIndexByMap = new WeakMap<object, BackroomsPortalIndex>();

const endpointId = (
  mapId: string,
  portalId: string,
  cell: readonly [number, number],
) => `${mapId}:${portalId}:${cell[0]}:${cell[1]}`;

const portalIndexForMap = (
  map: Pick<MapData, "id" | "cells">,
): BackroomsPortalIndex => {
  const cached = portalIndexByMap.get(map as object);
  if (cached?.cells === map.cells) return cached;

  const endpoints = map.cells
    .filter((cell) =>
      cell.walkable &&
      cell.portal_id?.startsWith(BACKROOMS_MUTABLE_PORTAL_PREFIX) &&
      Boolean(cell.room_id),
    )
    .map((cell): BackroomsPortalEndpoint => ({
      id: endpointId(map.id, cell.portal_id!, [cell.x, cell.z]),
      portalId: cell.portal_id!,
      edgeId: cell.portal_id!.slice(BACKROOMS_MUTABLE_PORTAL_PREFIX.length),
      roomId: cell.room_id!,
      cell: [cell.x, cell.z],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const index: BackroomsPortalIndex = {
    cells: map.cells,
    endpoints,
    endpointByMacroCell: new Map(
      endpoints.map((endpoint) => [
        `${endpoint.cell[0]}:${endpoint.cell[1]}`,
        endpoint,
      ]),
    ),
  };
  portalIndexByMap.set(map as object, index);
  return index;
};

export const collectBackroomsPortalEndpoints = (
  map: Pick<MapData, "id" | "cells">,
): BackroomsPortalEndpoint[] => portalIndexForMap(map).endpoints;

const initialPortalTargets = (
  endpoints: readonly BackroomsPortalEndpoint[],
): Record<string, string> => {
  const byPortal = new Map<string, BackroomsPortalEndpoint[]>();
  for (const endpoint of endpoints) {
    const group = byPortal.get(endpoint.portalId) ?? [];
    group.push(endpoint);
    byPortal.set(endpoint.portalId, group);
  }
  const targets: Record<string, string> = {};
  for (const group of byPortal.values()) {
    if (group.length !== 2) continue;
    const [left, right] = group.slice().sort((a, b) => a.id.localeCompare(b.id));
    targets[left.id] = right.id;
    targets[right.id] = left.id;
  }
  return targets;
};

export const createBackroomsRuntimeState = (
  worldSeed: string,
  map?: Pick<MapData, "id" | "cells">,
): BackroomsRuntimeState => ({
  schemaVersion: 1,
  worldSeed,
  levelVisits: {},
  portalTargets: map
    ? initialPortalTargets(collectBackroomsPortalEndpoints(map))
    : {},
  motifs: {},
  firedEventIds: [],
  currentRoomByLevel: {},
  roomEntryCounts: {},
  recentRoomIds: {},
  recentPortalEndpointIds: {},
  shiftSequence: {},
  observedShiftViolationCount: 0,
});

const normalizeBackroomsRuntimeState = (
  state: BackroomsRuntimeState | undefined,
  map: Pick<MapData, "id" | "cells" | "generation">,
): BackroomsRuntimeState => {
  const worldSeed = state?.worldSeed || map.generation?.seed || map.id;
  const defaults = createBackroomsRuntimeState(worldSeed, map);
  const portalTargets = {
    ...defaults.portalTargets,
    ...(state?.portalTargets || {}),
  };
  return {
    ...defaults,
    ...(state || {}),
    schemaVersion: 1,
    worldSeed,
    levelVisits: { ...(state?.levelVisits || {}) },
    portalTargets,
    motifs: structuredClone(state?.motifs || {}),
    firedEventIds: [...(state?.firedEventIds || [])],
    currentRoomByLevel: { ...(state?.currentRoomByLevel || {}) },
    roomEntryCounts: { ...(state?.roomEntryCounts || {}) },
    recentRoomIds: structuredClone(state?.recentRoomIds || {}),
    recentPortalEndpointIds: structuredClone(
      state?.recentPortalEndpointIds || {},
    ),
    shiftSequence: { ...(state?.shiftSequence || {}) },
    observedShiftViolationCount:
      state?.observedShiftViolationCount || 0,
  };
};

const uniqueRecent = (values: readonly string[], limit: number) =>
  [...new Set(values.filter(Boolean))].slice(0, limit);

const recurrenceForRoom = (map: MapData, roomId: string) =>
  (map.generation_sockets || []).flatMap((socket) => {
    if (socket.node_id !== roomId || !socket.tags.includes("recurrence")) {
      return [];
    }
    const motifTag = socket.tags.find((tag) => tag.startsWith("motif:"));
    const stageTag = socket.tags.find((tag) => tag.startsWith("motif_stage:"));
    if (!motifTag) return [];
    const stageIndex = Number(stageTag?.slice("motif_stage:".length) || 0);
    return [{
      motifId: motifTag.slice("motif:".length),
      stageIndex: Number.isFinite(stageIndex) ? Math.max(0, stageIndex) : 0,
      eventId: `motif_seen:${map.id}:${motifTag}:${roomId}`,
    }];
  });

const currentTargetPairs = (
  state: BackroomsRuntimeState,
  endpointsById: ReadonlyMap<string, BackroomsPortalEndpoint>,
) => {
  const pairs: Array<[BackroomsPortalEndpoint, BackroomsPortalEndpoint]> = [];
  const seen = new Set<string>();
  for (const sourceId of Object.keys(state.portalTargets).sort()) {
    const targetId = state.portalTargets[sourceId];
    const source = endpointsById.get(sourceId);
    const target = endpointsById.get(targetId);
    if (!source || !target || source.id === target.id) continue;
    const pairKey = [source.id, target.id].sort().join("|");
    if (seen.has(pairKey)) continue;
    if (state.portalTargets[target.id] !== source.id) continue;
    seen.add(pairKey);
    pairs.push(source.id.localeCompare(target.id) <= 0
      ? [source, target]
      : [target, source]);
  }
  return pairs.sort((left, right) =>
    `${left[0].id}|${left[1].id}`.localeCompare(`${right[0].id}|${right[1].id}`),
  );
};

const choosePeripheralShift = (
  state: BackroomsRuntimeState,
  map: MapData,
  pinnedRoomIds: ReadonlySet<string>,
): BackroomsPortalShift | undefined => {
  const endpoints = collectBackroomsPortalEndpoints(map);
  const endpointsById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const recentEndpoints = new Set(state.recentPortalEndpointIds[map.id] || []);
  const eligiblePairs = currentTargetPairs(state, endpointsById).filter((pair) =>
    pair.every((endpoint) =>
      !pinnedRoomIds.has(endpoint.roomId) &&
      !recentEndpoints.has(endpoint.id)),
  );
  if (eligiblePairs.length < 2) return undefined;

  const sequence = (state.shiftSequence[map.id] || 0) + 1;
  const offset = hashSeed(
    state.worldSeed,
    map.id,
    state.roomEntryCounts[map.id] || 0,
    sequence,
    "peripheral_shift",
  ) % eligiblePairs.length;
  for (let leftOffset = 0; leftOffset < eligiblePairs.length; leftOffset += 1) {
    const leftIndex = (offset + leftOffset) % eligiblePairs.length;
    const left = eligiblePairs[leftIndex];
    for (let rightOffset = 1; rightOffset < eligiblePairs.length; rightOffset += 1) {
      const rightIndex = (leftIndex + rightOffset) % eligiblePairs.length;
      const right = eligiblePairs[rightIndex];
      if (left === right) continue;
      const [a, b] = left;
      const [c, d] = right;
      const crossOptions: Array<[[BackroomsPortalEndpoint, BackroomsPortalEndpoint], [BackroomsPortalEndpoint, BackroomsPortalEndpoint]]> = [
        [[a, d], [c, b]],
        [[a, c], [b, d]],
      ];
      const chosen = crossOptions.find((pairs) =>
        pairs.every(([source, target]) => source.roomId !== target.roomId));
      if (!chosen) continue;
      for (const [source, target] of chosen) {
        state.portalTargets[source.id] = target.id;
        state.portalTargets[target.id] = source.id;
      }
      state.shiftSequence[map.id] = sequence;
      const shiftedIds = [a.id, b.id, c.id, d.id] as [string, string, string, string];
      const violationCount = [a, b, c, d].filter((endpoint) =>
        pinnedRoomIds.has(endpoint.roomId) || recentEndpoints.has(endpoint.id)).length;
      state.observedShiftViolationCount += violationCount;
      state.firedEventIds.push(
        `peripheral_shift:${map.id}:${sequence}:${shiftedIds.join(",")}`,
      );
      return {
        mapId: map.id,
        sequence,
        endpointIds: shiftedIds,
        pinnedRoomIds: [...pinnedRoomIds].sort(),
      };
    }
  }
  return undefined;
};

export const advanceBackroomsRuntimeObservation = (
  save: PlaySave,
  map: MapData,
  observation: {
    currentRoomId: string;
    visibleRoomIds?: readonly string[];
  },
): BackroomsObservationAdvance => {
  if (map.generation?.generatorId !== "backrooms") {
    return { save, changed: false };
  }
  const existingState = save.backrooms_runtime;
  if (
    existingState?.currentLevelId === map.id &&
    existingState.currentRoomByLevel[map.id] === observation.currentRoomId &&
    recurrenceForRoom(map, observation.currentRoomId).every((recurrence) =>
      existingState.firedEventIds.includes(recurrence.eventId),
    )
  ) {
    return { save, changed: false };
  }
  const state = normalizeBackroomsRuntimeState(save.backrooms_runtime, map);
  let changed = !save.backrooms_runtime;
  if (state.currentLevelId !== map.id) {
    state.currentLevelId = map.id;
    state.levelVisits[map.id] = (state.levelVisits[map.id] || 0) + 1;
    changed = true;
  }

  for (const recurrence of recurrenceForRoom(map, observation.currentRoomId)) {
    if (state.firedEventIds.includes(recurrence.eventId)) continue;
    const previous = state.motifs[recurrence.motifId];
    state.motifs[recurrence.motifId] = {
      seenCount: (previous?.seenCount || 0) + 1,
      mutationStage: Math.max(
        previous?.mutationStage || 0,
        recurrence.stageIndex,
      ),
      lastRoomId: observation.currentRoomId,
    };
    state.firedEventIds.push(recurrence.eventId);
    changed = true;
  }

  const priorRoomId = state.currentRoomByLevel[map.id];
  if (priorRoomId === observation.currentRoomId) {
    return changed
      ? { save: { ...save, backrooms_runtime: state }, changed: true }
      : { save, changed: false };
  }

  state.roomEntryCounts[map.id] = (state.roomEntryCounts[map.id] || 0) + 1;
  const previousRecentRooms = state.recentRoomIds[map.id] || [];
  const pinnedRoomIds = new Set([
    observation.currentRoomId,
    priorRoomId,
    ...previousRecentRooms,
    ...(observation.visibleRoomIds || []),
  ].filter((roomId): roomId is string => Boolean(roomId)));

  let shift: BackroomsPortalShift | undefined;
  if (state.roomEntryCounts[map.id] % SHIFT_ROOM_INTERVAL === 0) {
    shift = choosePeripheralShift(state, map, pinnedRoomIds);
  }
  state.currentRoomByLevel[map.id] = observation.currentRoomId;
  state.recentRoomIds[map.id] = uniqueRecent([
    observation.currentRoomId,
    priorRoomId || "",
    ...previousRecentRooms,
  ], RECENT_ROOM_LIMIT);
  changed = true;
  return {
    save: { ...save, backrooms_runtime: state },
    changed,
    shift,
  };
};

export const leaveBackroomsRuntimeLevel = (save: PlaySave): PlaySave => {
  if (!save.backrooms_runtime?.currentLevelId) return save;
  return {
    ...save,
    backrooms_runtime: {
      ...save.backrooms_runtime,
      currentLevelId: undefined,
      portalTraversalLatch: undefined,
    },
  };
};

const endpointAtFineCell = (
  map: Pick<MapData, "id" | "cells">,
  fineCell: readonly [number, number],
) => {
  const macro = macroOfFine(fineCell);
  return portalIndexForMap(map).endpointByMacroCell.get(
    `${macro[0]}:${macro[1]}`,
  );
};

const nearestRoomLandingCell = (
  map: MapData,
  endpoint: BackroomsPortalEndpoint,
): [number, number] | undefined => {
  const candidate = map.cells
    .filter((cell) =>
      cell.active &&
      cell.walkable &&
      cell.room_id === endpoint.roomId &&
      !cell.portal_id,
    )
    .sort((left, right) =>
      (Math.abs(left.x - endpoint.cell[0]) + Math.abs(left.z - endpoint.cell[1])) -
        (Math.abs(right.x - endpoint.cell[0]) + Math.abs(right.z - endpoint.cell[1])) ||
      left.z - right.z ||
      left.x - right.x,
    )[0];
  return candidate ? [candidate.x, candidate.z] : undefined;
};

export const resolveBackroomsPortalTraversal = (
  save: PlaySave,
  map: MapData,
  enteredFineCell: readonly [number, number] = save.player.cell,
): BackroomsPortalTraversal => {
  if (map.generation?.generatorId !== "backrooms") {
    return { save, traversed: false };
  }
  const portalIndex = portalIndexForMap(map);
  const endpoints = portalIndex.endpoints;
  if (!endpoints.length) return { save, traversed: false };
  const source = endpointAtFineCell(map, enteredFineCell);
  const existingLatch = save.backrooms_runtime?.portalTraversalLatch;
  if (
    !source &&
    (!existingLatch || existingLatch.mapId !== map.id)
  ) {
    return { save, traversed: false };
  }
  const state = normalizeBackroomsRuntimeState(save.backrooms_runtime, map);
  if (!source) {
    if (!state.portalTraversalLatch || state.portalTraversalLatch.mapId !== map.id) {
      return save.backrooms_runtime
        ? { save, traversed: false }
        : { save: { ...save, backrooms_runtime: state }, traversed: false };
    }
    delete state.portalTraversalLatch;
    return {
      save: { ...save, backrooms_runtime: state },
      traversed: false,
    };
  }
  if (
    state.portalTraversalLatch?.mapId === map.id &&
    state.portalTraversalLatch.endpointId === source.id
  ) {
    return { save, traversed: false };
  }
  const targetId = state.portalTargets[source.id];
  const target = endpoints.find((endpoint) => endpoint.id === targetId);
  if (!target) {
    return {
      save: { ...save, backrooms_runtime: state },
      traversed: false,
    };
  }
  const landingMacro = nearestRoomLandingCell(map, target);
  if (!landingMacro) {
    return {
      save: { ...save, backrooms_runtime: state },
      traversed: false,
    };
  }
  const landingFine = fineCenterOfMacro(landingMacro);
  const destinationCell: [number, number] = [landingFine[0], landingFine[1]];
  state.portalTraversalLatch = { mapId: map.id, endpointId: source.id };
  state.recentPortalEndpointIds[map.id] = uniqueRecent([
    source.id,
    target.id,
    ...(state.recentPortalEndpointIds[map.id] || []),
  ], RECENT_PORTAL_LIMIT);
  return {
    save: {
      ...save,
      player: {
        ...save.player,
        cell: destinationCell,
        fine_position: destinationCell,
      },
      backrooms_runtime: state,
    },
    traversed: true,
    sourceEndpointId: source.id,
    targetEndpointId: target.id,
    destinationCell,
  };
};

export const backroomsRoomIdAtFineCell = (
  map: MapData,
  fineCell: readonly [number, number],
): string | undefined => {
  const macro = macroOfFine(fineCell);
  const roomId = map.cells.find((cell) =>
    cell.x === macro[0] &&
    cell.z === macro[1] &&
    cell.active &&
    cell.walkable,
  )?.room_id;
  return roomId?.startsWith("connection:") ? undefined : roomId;
};
