import type { GamePackage, MapData } from "../schema/game";
import type {
  ArtifactCampaignRecord,
  ArtifactLifecycleState,
  ArtifactTransitionRecord,
  DeathBundleRecord,
  FractureCrawlCampaignState,
  GlassResourceLedgerRecord,
  IntercessorInventoryReference,
  PersistentGhostInteractionOutcome,
  PersistentGhostRecord,
  PlaySave,
} from "../schema/save";
import { placementOriginKey } from "../utils/objectFootprint";
import { isFineExpandedPackage } from "./fineWorld";
import {
  FINE_CARDINAL_DIRECTIONS,
  fineCenterOfMacro,
  macroOfFine,
} from "./gridCoordinates";
import {
  normalizeIntercessorCampaign,
  transitionIntercessorOnDeath,
  type IntercessorDeathTransitionOptions,
} from "./intercessorSuccession";

type Cell = [number, number];
type UnknownRecord = Record<string, unknown>;

export interface LegacyMaterializationResult {
  save: PlaySave;
  changed: boolean;
  ghostIds: string[];
  deathBundleIds: string[];
}

export interface FractureCrawlDeathTransitionResult {
  save: PlaySave;
  changed: boolean;
  deceasedIntercessorId?: string;
  successorIntercessorId?: string;
  ghostId?: string;
  deathBundleId?: string;
  returnedArtifactIds: string[];
}

export interface GhostCommunionResult {
  save: PlaySave;
  changed: boolean;
  ghost?: PersistentGhostRecord;
  outcome: PersistentGhostInteractionOutcome | "missing_ghost" | "no_active_intercessor";
  skillId?: string;
}

export interface ArtifactPickupOptions {
  mapId?: string;
  placementId?: string;
  itemId?: string;
  intercessorId?: string;
}

export interface ArtifactTransitionResult {
  save: PlaySave;
  changed: boolean;
  artifactIds: string[];
}

export interface DeathBundleRecoveryResult {
  save: PlaySave;
  changed: boolean;
  outcome: "recovered" | "missing_bundle" | "unavailable" | "no_active_intercessor";
  bundle?: DeathBundleRecord;
  artifactIds: string[];
}

export interface GlassHarvestOptions {
  itemId: string;
  itemCount?: number;
  sourceId?: string;
  eventId?: string;
}

export interface GlassHarvestResult {
  save: PlaySave;
  changed: boolean;
  outcome: "recorded" | "already_recorded" | "not_glass" | "invalid_count";
  eventId?: string;
  units: number;
  recoverableValue: number;
  burden: number;
}

export interface GlassFuelOptions {
  lightItemId: string;
  resourceItemId?: string;
  units?: number;
  durationTicks?: number;
  currentTick?: number;
  sourceId?: string;
  eventId?: string;
}

export interface GlassFuelConsumptionResult {
  save: PlaySave;
  changed: boolean;
  outcome:
    | "ignited"
    | "already_consumed"
    | "not_glass_fueled"
    | "invalid_resource"
    | "insufficient_glass";
  eventId?: string;
  resourceItemId?: string;
  itemCountConsumed: number;
  unitsConsumed: number;
  expiresAtTick?: number;
  recoverableValue: number;
  burden: number;
}

const cloneCell = (cell: readonly unknown[]): Cell => [
  Number(cell[0] ?? 0),
  Number(cell[1] ?? 0),
];
const keyOf = (cell: readonly [number, number]) => `${cell[0]}:${cell[1]}`;
const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;

const stringValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const configFor = (gamePackage: GamePackage): UnknownRecord =>
  asRecord(gamePackage.settings?.fracture_crawl_legacy) ||
  asRecord(gamePackage.settings?.legacy_materialization) ||
  {};

const visualObjectId = (
  gamePackage: GamePackage,
  kind: "ghost" | "death_bundle",
): string | undefined => {
  const config = configFor(gamePackage);
  const succession = asRecord(gamePackage.settings?.intercessor_succession) || {};
  return kind === "ghost"
    ? stringValue(config.ghost_object_id) || stringValue(succession.ghost_object_id)
    : stringValue(config.death_bundle_object_id) ||
        stringValue(config.bundle_object_id) ||
        stringValue(succession.death_bundle_object_id) ||
        stringValue(succession.bundle_object_id);
};

const markerIcon = (
  gamePackage: GamePackage,
  kind: "ghost" | "death_bundle",
): string => {
  const config = configFor(gamePackage);
  const succession = asRecord(gamePackage.settings?.intercessor_succession) || {};
  return kind === "ghost"
    ? stringValue(config.ghost_marker_icon) ||
        stringValue(succession.ghost_marker_icon) ||
        "✧"
    : stringValue(config.death_bundle_marker_icon) ||
        stringValue(config.bundle_marker_icon) ||
        stringValue(succession.death_bundle_marker_icon) ||
        stringValue(succession.bundle_marker_icon) ||
        "▣";
};

const emptyCampaignState = (): FractureCrawlCampaignState => ({
  schema_version: 1,
  ghost_order: [],
  ghosts: {},
  death_bundle_order: [],
  death_bundles: {},
  artifact_order: [],
  artifacts: {},
  glass: {
    resources: {},
    harvest_events: {},
    fuel_events: {},
  },
});

const cloneCampaignState = (
  state: FractureCrawlCampaignState | undefined,
): FractureCrawlCampaignState => {
  if (!state) return emptyCampaignState();
  return {
    schema_version: 1,
    ghost_order: [...(state.ghost_order || [])],
    ghosts: structuredClone(state.ghosts || {}),
    death_bundle_order: [...(state.death_bundle_order || [])],
    death_bundles: structuredClone(state.death_bundles || {}),
    artifact_order: [...(state.artifact_order || [])],
    artifacts: structuredClone(state.artifacts || {}),
    glass: {
      resources: structuredClone(state.glass?.resources || {}),
      harvest_events: structuredClone(state.glass?.harvest_events || {}),
      fuel_events: structuredClone(state.glass?.fuel_events || {}),
    },
  };
};

const deterministicCells = (cells: Cell[]) =>
  [...cells].sort((left, right) => left[0] - right[0] || left[1] - right[1]);

const spatialKey = (gamePackage: GamePackage, cell: readonly number[]) => {
  if (!isFineExpandedPackage(gamePackage)) return keyOf(cell as Cell);
  const macro = macroOfFine([Number(cell[0] ?? 0), Number(cell[1] ?? 0)]);
  return `${macro[0]}:${macro[1]}`;
};

const requestCellForMap = (
  gamePackage: GamePackage,
  save: PlaySave,
  map: MapData,
  requested: Cell,
): Cell => {
  if (isFineExpandedPackage(gamePackage) || (save.fine_ratio ?? 1) <= 1) {
    return cloneCell(requested);
  }
  const macro = macroOfFine(requested);
  return [macro[0], macro[1]];
};

const persistedMaterializationCell = (
  gamePackage: GamePackage,
  save: PlaySave,
  requested: Cell,
  requestedInMapSpace: Cell,
  chosenInMapSpace: Cell,
): Cell => {
  if (isFineExpandedPackage(gamePackage) || (save.fine_ratio ?? 1) <= 1) {
    return cloneCell(chosenInMapSpace);
  }
  // The authored package was used only to validate a fine-grid save. Preserve
  // the exact death cell when its macro tile is valid; a fallback macro is
  // represented by its deterministic fine center.
  if (keyOf(requestedInMapSpace) === keyOf(chosenInMapSpace)) {
    return cloneCell(requested);
  }
  const center = fineCenterOfMacro(chosenInMapSpace);
  return [center[0], center[1]];
};

const reachableCells = (
  gamePackage: GamePackage,
  save: PlaySave,
  map: MapData,
): Cell[] => {
  const blockedFootprints = new Set<string>();
  map.container_placements.forEach((placement) => {
    blockedFootprints.add(spatialKey(gamePackage, cloneCell(placement.cell)));
  });
  const delta = save.map_deltas?.[map.id];
  const opened = new Set(delta?.opened_doors || []);
  const removed = new Set(delta?.removed_objects || []);
  map.custom_object_placements.forEach((placement) => {
    if (placement.collision_mode === "none") return;
    const placementKey = placementOriginKey(placement);
    if (
      removed.has(placementKey) ||
      removed.has(placement.id || "") ||
      opened.has(placementKey) ||
      opened.has(placement.id || "")
    ) {
      return;
    }
    const definition = gamePackage.object_library.find(
      (object) => object.id === placement.object_id,
    );
    if (
      definition?.collision.profile === "none" ||
      definition?.collision.profile === "walkable_support"
    ) {
      return;
    }
    const moved = delta?.moved_objects?.[placementKey]?.cell;
    const blockingCell = moved
      ? requestCellForMap(gamePackage, save, map, cloneCell(moved))
      : cloneCell(placement.cell);
    blockedFootprints.add(spatialKey(gamePackage, blockingCell));
  });
  const walkable = new Map<string, Cell>();
  map.cells.forEach((cell) => {
    const point: Cell = [cell.x, cell.z];
    if (
      cell.active &&
      cell.walkable &&
      !blockedFootprints.has(spatialKey(gamePackage, point))
    ) {
      walkable.set(`${cell.x}:${cell.z}`, point);
    }
  });
  if (walkable.size === 0) return [];

  const seeds = deterministicCells(
    map.spawns
      .map((spawn) => cloneCell(spawn.cell))
      .filter((cell) => walkable.has(keyOf(cell))),
  );
  // A generated/legacy map may omit a valid spawn. In that case the first
  // walkable component is still a deterministic safe fallback.
  if (seeds.length === 0) seeds.push(deterministicCells([...walkable.values()])[0]);

  const visited = new Set<string>();
  const queue = [...seeds];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    const key = keyOf(cell);
    if (visited.has(key) || !walkable.has(key)) continue;
    visited.add(key);
    FINE_CARDINAL_DIRECTIONS.forEach((direction) => {
      const next: Cell = [cell[0] + direction[0], cell[1] + direction[1]];
      if (walkable.has(keyOf(next)) && !visited.has(keyOf(next))) queue.push(next);
    });
  }
  return deterministicCells(
    [...visited].map((key) => {
      const [x, z] = key.split(":").map(Number);
      return [x, z] as Cell;
    }),
  );
};

const materializationPlacement = (
  gamePackage: GamePackage,
  save: PlaySave,
  requestedMapId: string,
  requestedCell: Cell,
  forbiddenCells: Cell[] = [],
): {
  mapId: string;
  cell: Cell;
  usedFallback: boolean;
  fallbackReason?: string;
} => {
  const map =
    gamePackage.maps.find((candidate) => candidate.id === requestedMapId) ||
    gamePackage.maps.find((candidate) => candidate.id === gamePackage.metadata.start_map_id) ||
    [...gamePackage.maps].sort((left, right) => left.id.localeCompare(right.id))[0];
  if (!map) {
    return {
      mapId: requestedMapId,
      cell: cloneCell(requestedCell),
      usedFallback: true,
      fallbackReason: "no_valid_map_available",
    };
  }
  const mapFallback = map.id !== requestedMapId;
  const target = requestCellForMap(gamePackage, save, map, requestedCell);
  const reachable = reachableCells(gamePackage, save, map);
  if (reachable.length === 0) {
    const spawn = [...map.spawns].sort((left, right) => left.id.localeCompare(right.id))[0];
    const chosen = spawn ? cloneCell(spawn.cell) : target;
    return {
      mapId: map.id,
      cell: persistedMaterializationCell(
        gamePackage,
        save,
        requestedCell,
        target,
        chosen,
      ),
      usedFallback: mapFallback || keyOf(chosen) !== keyOf(target),
      ...(mapFallback || keyOf(chosen) !== keyOf(target)
        ? {
            fallbackReason: mapFallback
              ? "requested_map_missing"
              : "requested_cell_not_reachable",
          }
        : {}),
    };
  }
  const forbidden = new Set(
    forbiddenCells.map((cell) =>
      spatialKey(
        gamePackage,
        requestCellForMap(gamePackage, save, map, cell),
      ),
    ),
  );
  const candidates = reachable.some(
    (cell) => !forbidden.has(spatialKey(gamePackage, cell)),
  )
    ? reachable.filter((cell) => !forbidden.has(spatialKey(gamePackage, cell)))
    : reachable;
  if (
    candidates.some((cell) => keyOf(cell) === keyOf(target)) &&
    !forbidden.has(spatialKey(gamePackage, target))
  ) {
    return {
      mapId: map.id,
      cell: persistedMaterializationCell(
        gamePackage,
        save,
        requestedCell,
        target,
        target,
      ),
      usedFallback: mapFallback,
      ...(mapFallback ? { fallbackReason: "requested_map_missing" } : {}),
    };
  }
  const nearest = [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(left[0] - target[0]) + Math.abs(left[1] - target[1]);
    const rightDistance = Math.abs(right[0] - target[0]) + Math.abs(right[1] - target[1]);
    return leftDistance - rightDistance || left[0] - right[0] || left[1] - right[1];
  })[0];
  return {
    mapId: map.id,
    cell: persistedMaterializationCell(
      gamePackage,
      save,
      requestedCell,
      target,
      nearest,
    ),
    usedFallback: true,
    fallbackReason: forbidden.has(spatialKey(gamePackage, target))
      ? "requested_footprint_reserved"
      : mapFallback
        ? "requested_map_missing"
        : "requested_cell_invalid_or_unreachable",
  };
};

const artifactDefinitions = (gamePackage: GamePackage) => {
  const definitions = new Map<string, GamePackage["items"][number]>();
  [...gamePackage.items]
    .filter((item) => item.artifact)
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((item) => {
      if (!definitions.has(item.artifact!.artifact_id)) {
        definitions.set(item.artifact!.artifact_id, item);
      }
    });
  return [...definitions.entries()].sort(([left], [right]) => left.localeCompare(right));
};

const artifactOrigin = (gamePackage: GamePackage, itemId: string) => {
  const matches = gamePackage.maps.flatMap((map) =>
    map.item_placements
      .filter((placement) => placement.item_id === itemId)
      .map((placement) => ({ map, placement })),
  );
  matches.sort(
    (left, right) =>
      left.map.id.localeCompare(right.map.id) ||
      left.placement.id.localeCompare(right.placement.id),
  );
  return matches[0];
};

const ensureTakenMarker = (
  save: PlaySave,
  mapId: string,
  placementId: string,
  taken: boolean,
): PlaySave => {
  const existingDelta = save.map_deltas?.[mapId] || {};
  const existing = existingDelta.taken_items || [];
  const has = existing.includes(placementId);
  if (has === taken) return save;
  const nextTaken = taken
    ? [...existing, placementId]
    : existing.filter((id) => id !== placementId);
  return {
    ...save,
    map_deltas: {
      ...(save.map_deltas || {}),
      [mapId]: {
        ...existingDelta,
        taken_items: nextTaken,
      },
    },
  };
};

const applyArtifactWorldMarkers = (save: PlaySave): PlaySave => {
  let next = save;
  Object.values(save.fracture_crawl_campaign?.artifacts || {}).forEach((artifact) => {
    next = ensureTakenMarker(
      next,
      artifact.origin.map_id,
      artifact.origin.placement_id,
      artifact.state !== "AtOrigin",
    );
  });
  return next;
};

const activeIntercessorId = (save: PlaySave): string | undefined =>
  save.intercessor_campaign?.current_intercessor_id;

const initializeArtifactRecords = (
  gamePackage: GamePackage,
  save: PlaySave,
  state: FractureCrawlCampaignState,
) => {
  const currentId = activeIntercessorId(save);
  artifactDefinitions(gamePackage).forEach(([artifactId, item]) => {
    if (state.artifacts[artifactId]) return;
    const match = artifactOrigin(gamePackage, item.id);
    if (!match) return;
    const originTaken = Boolean(
      save.map_deltas?.[match.map.id]?.taken_items?.includes(match.placement.id),
    );
    const carried = (save.inventory || []).some(
      (entry) => entry.id === item.id && entry.count > 0,
    );
    const stateName: ArtifactLifecycleState = originTaken && carried ? "Carried" : "AtOrigin";
    state.artifacts[artifactId] = {
      id: artifactId,
      item_id: item.id,
      origin: {
        map_id: match.map.id,
        placement_id: match.placement.id,
        cell: cloneCell(match.placement.cell),
        count: Math.max(1, Math.floor(match.placement.count || 1)),
      },
      recovery_value: item.artifact?.recovery_value || 0,
      burden: item.artifact?.burden || 0,
      state: stateName,
      ...(stateName === "Carried" && currentId
        ? { carrier_intercessor_id: currentId }
        : {}),
      transition_order: [],
      transitions: {},
    };
    state.artifact_order.push(artifactId);
  });
};

const normalizeStateOnly = (
  gamePackage: GamePackage,
  save: PlaySave,
): { save: PlaySave; state: FractureCrawlCampaignState } => {
  const lifecycleSave = normalizeIntercessorCampaign(gamePackage, save);
  const state = cloneCampaignState(lifecycleSave.fracture_crawl_campaign);
  initializeArtifactRecords(gamePackage, lifecycleSave, state);
  state.ghost_order = Array.from(new Set(state.ghost_order)).filter((id) => state.ghosts[id]);
  Object.keys(state.ghosts)
    .sort()
    .forEach((id) => {
      if (!state.ghost_order.includes(id)) state.ghost_order.push(id);
    });
  state.death_bundle_order = Array.from(new Set(state.death_bundle_order)).filter(
    (id) => state.death_bundles[id],
  );
  Object.keys(state.death_bundles)
    .sort()
    .forEach((id) => {
      if (!state.death_bundle_order.includes(id)) state.death_bundle_order.push(id);
    });
  state.artifact_order = Array.from(new Set(state.artifact_order)).filter(
    (id) => state.artifacts[id],
  );
  Object.keys(state.artifacts)
    .sort()
    .forEach((id) => {
      if (!state.artifact_order.includes(id)) state.artifact_order.push(id);
    });
  return {
    save: {
      ...lifecycleSave,
      fracture_crawl_campaign: state,
    },
    state,
  };
};

const subtractBundleItem = (
  contents: IntercessorInventoryReference[],
  itemId: string,
  count: number,
) => {
  let remaining = Math.max(0, count);
  return contents.flatMap((entry) => {
    if (entry.item_id !== itemId || remaining <= 0) return [{ ...entry }];
    const removed = Math.min(entry.count, remaining);
    remaining -= removed;
    const nextCount = entry.count - removed;
    return nextCount > 0 ? [{ ...entry, count: nextCount }] : [];
  });
};

const transitionArtifact = (
  artifact: ArtifactCampaignRecord,
  to: ArtifactLifecycleState,
  save: PlaySave,
  reason: string,
  options: { intercessorId?: string; bundleId?: string } = {},
): ArtifactCampaignRecord => {
  if (artifact.state === to) {
    if (
      (to !== "Carried" || artifact.carrier_intercessor_id === options.intercessorId) &&
      (to !== "InDeathBundle" || artifact.death_bundle_id === options.bundleId)
    ) {
      return artifact;
    }
  }
  const ordinal = artifact.transition_order.length + 1;
  const transitionId = `artifact-transition:${artifact.id}:${ordinal}`;
  const transition: ArtifactTransitionRecord = {
    id: transitionId,
    from: artifact.state,
    to,
    clock_minutes: save.clock_minutes ?? 0,
    reason,
    ...(options.intercessorId ? { intercessor_id: options.intercessorId } : {}),
    ...(options.bundleId ? { bundle_id: options.bundleId } : {}),
  };
  return {
    ...artifact,
    state: to,
    carrier_intercessor_id: to === "Carried" ? options.intercessorId : undefined,
    death_bundle_id: to === "InDeathBundle" ? options.bundleId : undefined,
    recovered_by_intercessor_id:
      to === "RecoveredToHub" ? options.intercessorId : artifact.recovered_by_intercessor_id,
    recovered_at_clock_minutes:
      to === "RecoveredToHub" ? save.clock_minutes ?? 0 : artifact.recovered_at_clock_minutes,
    transition_order: [...artifact.transition_order, transitionId],
    transitions: {
      ...artifact.transitions,
      [transitionId]: transition,
    },
  };
};

const materializeInternal = (
  gamePackage: GamePackage,
  save: PlaySave,
): LegacyMaterializationResult => {
  const sourceCampaign = save.intercessor_campaign;
  const state = cloneCampaignState(save.fracture_crawl_campaign);
  if (!sourceCampaign) return { save, changed: false, ghostIds: [], deathBundleIds: [] };
  const campaign = structuredClone(sourceCampaign);
  const ghostIds: string[] = [];
  const deathBundleIds: string[] = [];
  let campaignChanged = false;

  Object.values(campaign.ghost_requests)
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((request) => {
      if (request.status === "cancelled") return;
      const ghostId = `ghost:${request.source_intercessor_id}`;
      if (!state.ghosts[ghostId]) {
        const occupied = [
          ...Object.values(state.ghosts).map((ghost) => ({
            mapId: ghost.map_id,
            cell: ghost.cell,
          })),
          ...Object.values(state.death_bundles).map((bundle) => ({
            mapId: bundle.map_id,
            cell: bundle.cell,
          })),
        ];
        const placement = materializationPlacement(
          gamePackage,
          save,
          request.map_id,
          request.cell,
          occupied
            .filter((record) => record.mapId === request.map_id)
            .map((record) => record.cell),
        );
        const source = campaign.records[request.source_intercessor_id];
        state.ghosts[ghostId] = {
          id: ghostId,
          request_id: request.id,
          source_intercessor_id: request.source_intercessor_id,
          expedition_id: request.expedition_id,
          requested_map_id: request.map_id,
          requested_cell: cloneCell(request.cell),
          map_id: placement.mapId,
          cell: placement.cell,
          facing: cloneCell(request.facing),
          created_at_clock_minutes: request.created_at_clock_minutes,
          visual_object_id: visualObjectId(gamePackage, "ghost"),
          marker_icon: markerIcon(gamePackage, "ghost"),
          signature_skill_id: source?.signature_skill_id,
          degraded_memory_ref: `intercessor-memory:${request.source_intercessor_id}`,
          testimony_ref: `ghost-testimony:${request.source_intercessor_id}`,
          archive_recovery_state: "unrecovered",
          placement_fallback_used: placement.usedFallback,
          placement_fallback_reason: placement.fallbackReason,
          status: "present",
          interaction_order: [],
          interactions: {},
        };
        state.ghost_order.push(ghostId);
        ghostIds.push(ghostId);
      }
      if (request.status !== "materialized") {
        campaign.ghost_requests[request.id] = { ...request, status: "materialized" };
        campaignChanged = true;
      }
    });

  Object.values(campaign.bundle_requests)
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((request) => {
      if (request.status === "cancelled") return;
      const bundleId = `death-bundle:${request.source_intercessor_id}`;
      if (!state.death_bundles[bundleId]) {
        const occupied = [
          ...Object.values(state.ghosts).map((ghost) => ({
            mapId: ghost.map_id,
            cell: ghost.cell,
          })),
          ...Object.values(state.death_bundles).map((bundle) => ({
            mapId: bundle.map_id,
            cell: bundle.cell,
          })),
        ];
        const placement = materializationPlacement(
          gamePackage,
          save,
          request.map_id,
          request.cell,
          occupied
            .filter((record) => record.mapId === request.map_id)
            .map((record) => record.cell),
        );
        const source = campaign.records[request.source_intercessor_id];
        const contents = (source?.inventory_refs || []).map((entry) => ({ ...entry }));
        const artifactIds = Object.values(state.artifacts)
          .filter(
            (artifact) =>
              artifact.carrier_intercessor_id === request.source_intercessor_id ||
              contents.some((entry) => entry.item_id === artifact.item_id),
          )
          .map((artifact) => artifact.id)
          .sort();
        artifactIds.forEach((artifactId) => {
          state.artifacts[artifactId] = transitionArtifact(
            state.artifacts[artifactId],
            "InDeathBundle",
            save,
            "intercessor_death",
            { bundleId, intercessorId: request.source_intercessor_id },
          );
        });
        state.death_bundles[bundleId] = {
          id: bundleId,
          request_id: request.id,
          owner_intercessor_id: request.source_intercessor_id,
          expedition_id: request.expedition_id,
          requested_map_id: request.map_id,
          requested_cell: cloneCell(request.cell),
          map_id: placement.mapId,
          cell: placement.cell,
          facing: cloneCell(request.facing),
          created_at_clock_minutes: request.created_at_clock_minutes,
          visual_object_id: visualObjectId(gamePackage, "death_bundle"),
          marker_icon: markerIcon(gamePackage, "death_bundle"),
          placement_fallback_used: placement.usedFallback,
          placement_fallback_reason: placement.fallbackReason,
          status: contents.length > 0 || artifactIds.length > 0 ? "available" : "depleted",
          contents,
          artifact_ids: artifactIds,
          returned_artifact_ids: [],
        };
        state.death_bundle_order.push(bundleId);
        deathBundleIds.push(bundleId);
      }
      if (request.status !== "materialized") {
        campaign.bundle_requests[request.id] = { ...request, status: "materialized" };
        campaignChanged = true;
      }
    });

  const next = applyArtifactWorldMarkers({
    ...save,
    intercessor_campaign: campaignChanged ? { ...campaign } : campaign,
    fracture_crawl_campaign: state,
  });
  const changed = !sameJson(save, next);
  return { save: changed ? next : save, changed, ghostIds, deathBundleIds };
};

export const normalizeFractureCrawlCampaign = (
  gamePackage: GamePackage,
  save: PlaySave,
): PlaySave => {
  const normalized = normalizeStateOnly(gamePackage, save).save;
  const materialized = materializeInternal(gamePackage, normalized).save;
  const marked = applyArtifactWorldMarkers(materialized);
  return sameJson(save, marked) ? save : marked;
};

export const materializePendingLegacyRequests = (
  gamePackage: GamePackage,
  save: PlaySave,
): LegacyMaterializationResult => {
  const normalized = normalizeStateOnly(gamePackage, save).save;
  const result = materializeInternal(gamePackage, normalized);
  const changed = !sameJson(save, result.save);
  return { ...result, save: changed ? result.save : save, changed };
};

const returnPriorBundleArtifacts = (
  gamePackage: GamePackage,
  save: PlaySave,
  dyingIntercessorId: string,
): { save: PlaySave; artifactIds: string[] } => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const returned: string[] = [];
  Object.values(state.death_bundles)
    .filter(
      (bundle) =>
        bundle.status === "available" && bundle.owner_intercessor_id !== dyingIntercessorId,
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((bundle) => {
      let contents = bundle.contents.map((entry) => ({ ...entry }));
      const remainingArtifactIds: string[] = [];
      const returnedFromBundle: string[] = [];
      bundle.artifact_ids.forEach((artifactId) => {
        const artifact = state.artifacts[artifactId];
        if (
          !artifact ||
          artifact.state !== "InDeathBundle" ||
          artifact.death_bundle_id !== bundle.id
        ) {
          remainingArtifactIds.push(artifactId);
          return;
        }
        state.artifacts[artifactId] = transitionArtifact(
          artifact,
          "AtOrigin",
          normalized,
          "successor_died_before_recovery",
          { intercessorId: dyingIntercessorId, bundleId: bundle.id },
        );
        contents = subtractBundleItem(contents, artifact.item_id, artifact.origin.count);
        returned.push(artifactId);
        returnedFromBundle.push(artifactId);
      });
      state.death_bundles[bundle.id] = {
        ...bundle,
        contents,
        artifact_ids: remainingArtifactIds,
        returned_artifact_ids: Array.from(
          new Set([...bundle.returned_artifact_ids, ...returnedFromBundle]),
        ),
        status:
          contents.length > 0 || remainingArtifactIds.length > 0 ? "available" : "depleted",
      };
    });
  const next = applyArtifactWorldMarkers({
    ...normalized,
    fracture_crawl_campaign: state,
  });
  return { save: next, artifactIds: returned };
};

const removeInventoryCounts = (
  inventory: PlaySave["inventory"],
  removals: IntercessorInventoryReference[],
): PlaySave["inventory"] => {
  const counts = new Map(removals.map((entry) => [entry.item_id, entry.count]));
  return inventory.flatMap((entry) => {
    const remove = counts.get(entry.id) || 0;
    if (remove <= 0) return [{ ...entry }];
    const nextCount = entry.count - remove;
    counts.set(entry.id, Math.max(0, remove - entry.count));
    return nextCount > 0 ? [{ ...entry, count: nextCount }] : [];
  });
};

export const transitionFractureCrawlOnDeath = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: IntercessorDeathTransitionOptions = {},
): FractureCrawlDeathTransitionResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const dyingId = activeIntercessorId(normalized);
  if (!dyingId) {
    return { save: normalized, changed: normalized !== save, returnedArtifactIds: [] };
  }
  const returned = returnPriorBundleArtifacts(gamePackage, normalized, dyingId);
  const transition = transitionIntercessorOnDeath(gamePackage, returned.save, options);
  if (!transition.changed || !transition.deceased || !transition.successor) {
    const next = normalizeFractureCrawlCampaign(gamePackage, transition.save);
    return {
      save: next,
      changed: next !== save,
      deceasedIntercessorId: transition.deceased?.id,
      successorIntercessorId: transition.successor?.id,
      returnedArtifactIds: returned.artifactIds,
    };
  }

  // Prefer a skill not already represented by another persistent ghost. This
  // keeps a succession archive meaningfully diverse whenever the deceased had
  // more than one learned skill, while retaining the Phase 5 choice if it is
  // already unique (or no alternative exists). Selection order is authored
  // skill order, so save/load and browser refresh cannot change the result.
  const usedSignatureSkills = new Set(
    Object.values(returned.save.fracture_crawl_campaign?.ghosts || {})
      .map((ghost) => ghost.signature_skill_id)
      .filter((skillId): skillId is string => Boolean(skillId)),
  );
  const signatureSkillId =
    (transition.deceased.signature_skill_id &&
    !usedSignatureSkills.has(transition.deceased.signature_skill_id)
      ? transition.deceased.signature_skill_id
      : transition.deceased.skills.find((skillId) => !usedSignatureSkills.has(skillId))) ||
    transition.deceased.signature_skill_id;
  const deathSave = signatureSkillId && transition.save.intercessor_campaign
    ? {
        ...transition.save,
        intercessor_campaign: {
          ...transition.save.intercessor_campaign,
          records: {
            ...transition.save.intercessor_campaign.records,
            [transition.deceased.id]: {
              ...transition.save.intercessor_campaign.records[transition.deceased.id],
              signature_skill_id: signatureSkillId,
            },
          },
        },
      }
    : transition.save;
  let next = normalizeFractureCrawlCampaign(gamePackage, deathSave);
  const state = cloneCampaignState(next.fracture_crawl_campaign);
  const bundleId = `death-bundle:${transition.deceased.id}`;
  const bundle = state.death_bundles[bundleId];
  const movedArtifacts: ArtifactCampaignRecord[] = [];
  Object.values(state.artifacts).forEach((artifact) => {
    if (
      artifact.state === "InDeathBundle" &&
      artifact.death_bundle_id === bundleId
    ) {
      movedArtifacts.push(artifact);
      return;
    }
    if (artifact.state === "Carried" && artifact.carrier_intercessor_id === transition.deceased!.id) {
      const moved = transitionArtifact(
        artifact,
        "InDeathBundle",
        next,
        "intercessor_death",
        { bundleId, intercessorId: transition.deceased!.id },
      );
      state.artifacts[artifact.id] = moved;
      movedArtifacts.push(moved);
    }
  });
  if (bundle && movedArtifacts.length > 0) {
    state.death_bundles[bundleId] = {
      ...bundle,
      status: "available",
      artifact_ids: Array.from(
        new Set([...bundle.artifact_ids, ...movedArtifacts.map((artifact) => artifact.id)]),
      ),
    };
    next = {
      ...next,
      // A campaign-persistence policy may otherwise copy an artifact into the
      // successor inventory. Physical ownership is instead the death bundle.
      inventory: removeInventoryCounts(
        next.inventory,
        movedArtifacts.map((artifact) => ({
          item_id: artifact.item_id,
          count: artifact.origin.count,
        })),
      ),
      fracture_crawl_campaign: state,
    };
  } else {
    next = { ...next, fracture_crawl_campaign: state };
  }
  next = applyArtifactWorldMarkers(next);
  return {
    save: next,
    changed: true,
    deceasedIntercessorId: transition.deceased.id,
    successorIntercessorId: transition.successor.id,
    ghostId: `ghost:${transition.deceased.id}`,
    deathBundleId: bundleId,
    returnedArtifactIds: returned.artifactIds,
  };
};

export const communeWithPersistentGhost = (
  gamePackage: GamePackage,
  save: PlaySave,
  ghostId: string,
): GhostCommunionResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const currentId = activeIntercessorId(normalized);
  if (!currentId) {
    return { save: normalized, changed: normalized !== save, outcome: "no_active_intercessor" };
  }
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const ghost = state.ghosts[ghostId];
  if (!ghost || ghost.status !== "present") {
    return { save: normalized, changed: normalized !== save, outcome: "missing_ghost" };
  }
  const interactionId = `ghost-interaction:${ghost.id}:${currentId}`;
  const existing = ghost.interactions[interactionId];
  if (existing) {
    return {
      save: normalized,
      changed: normalized !== save,
      ghost,
      outcome: "already_inherited",
      skillId: existing.skill_id,
    };
  }
  const skillId = ghost.signature_skill_id;
  const alreadyKnown = Boolean(skillId && normalized.known_skills.includes(skillId));
  const outcome: PersistentGhostInteractionOutcome = !skillId
    ? "no_signature_skill"
    : alreadyKnown
      ? "already_known"
      : "inherited";
  const interaction = {
    id: interactionId,
    intercessor_id: currentId,
    clock_minutes: normalized.clock_minutes ?? 0,
    outcome,
    ...(skillId ? { skill_id: skillId } : {}),
  };
  state.ghosts[ghostId] = {
    ...ghost,
    interaction_order: [...ghost.interaction_order, interactionId],
    interactions: {
      ...ghost.interactions,
      [interactionId]: interaction,
    },
  };
  const campaign = normalized.intercessor_campaign;
  const activeRecord = campaign?.records[currentId];
  const nextCampaign =
    campaign && activeRecord && skillId && !activeRecord.skills.includes(skillId)
      ? {
          ...campaign,
          records: {
            ...campaign.records,
            [currentId]: {
              ...activeRecord,
              skills: [...activeRecord.skills, skillId],
              history: [
                ...activeRecord.history,
                `Inherited ${skillId} from ${ghost.source_intercessor_id}.`,
              ],
            },
          },
        }
      : campaign;
  const next: PlaySave = {
    ...normalized,
    known_skills:
      skillId && !normalized.known_skills.includes(skillId)
        ? [...normalized.known_skills, skillId]
        : [...normalized.known_skills],
    intercessor_campaign: nextCampaign,
    fracture_crawl_campaign: state,
  };
  return { save: next, changed: true, ghost: state.ghosts[ghostId], outcome, skillId };
};

export const recordArtifactPickup = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ArtifactPickupOptions,
): ArtifactTransitionResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const intercessorId = options.intercessorId || activeIntercessorId(normalized);
  if (!intercessorId) return { save: normalized, changed: normalized !== save, artifactIds: [] };
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const matches = Object.values(state.artifacts)
    .filter(
      (artifact) =>
        artifact.state === "AtOrigin" &&
        (!options.mapId || artifact.origin.map_id === options.mapId) &&
        (!options.placementId || artifact.origin.placement_id === options.placementId) &&
        (!options.itemId || artifact.item_id === options.itemId),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (matches.length === 0) {
    return { save: normalized, changed: normalized !== save, artifactIds: [] };
  }
  matches.forEach((artifact) => {
    state.artifacts[artifact.id] = transitionArtifact(
      artifact,
      "Carried",
      normalized,
      "picked_up_at_origin",
      { intercessorId },
    );
  });
  const next = applyArtifactWorldMarkers({
    ...normalized,
    fracture_crawl_campaign: state,
  });
  return { save: next, changed: true, artifactIds: matches.map((artifact) => artifact.id) };
};

const mergeInventory = (
  inventory: PlaySave["inventory"],
  additions: IntercessorInventoryReference[],
): PlaySave["inventory"] => {
  const merged = new Map(inventory.map((entry) => [entry.id, entry.count]));
  additions.forEach((entry) => {
    merged.set(entry.item_id, (merged.get(entry.item_id) || 0) + Math.max(0, entry.count));
  });
  return [...merged.entries()]
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }));
};

export const recoverDeathBundle = (
  gamePackage: GamePackage,
  save: PlaySave,
  bundleId: string,
): DeathBundleRecoveryResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const intercessorId = activeIntercessorId(normalized);
  if (!intercessorId) {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "no_active_intercessor",
      artifactIds: [],
    };
  }
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const bundle = state.death_bundles[bundleId];
  if (!bundle) {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "missing_bundle",
      artifactIds: [],
    };
  }
  if (bundle.status !== "available") {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "unavailable",
      bundle,
      artifactIds: [],
    };
  }
  bundle.artifact_ids.forEach((artifactId) => {
    const artifact = state.artifacts[artifactId];
    if (!artifact || artifact.state !== "InDeathBundle") return;
    state.artifacts[artifactId] = transitionArtifact(
      artifact,
      "Carried",
      normalized,
      "death_bundle_recovered",
      { intercessorId, bundleId },
    );
  });
  state.death_bundles[bundleId] = {
    ...bundle,
    status: "recovered",
    recovered_by_intercessor_id: intercessorId,
    recovered_at_clock_minutes: normalized.clock_minutes ?? 0,
  };
  const next = applyArtifactWorldMarkers({
    ...normalized,
    inventory: mergeInventory(normalized.inventory, bundle.contents),
    fracture_crawl_campaign: state,
  });
  return {
    save: next,
    changed: true,
    outcome: "recovered",
    bundle: state.death_bundles[bundleId],
    artifactIds: [...bundle.artifact_ids],
  };
};

export const recoverCarriedArtifactsToHub = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: { intercessorId?: string } = {},
): ArtifactTransitionResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const intercessorId = options.intercessorId || activeIntercessorId(normalized);
  if (!intercessorId) return { save: normalized, changed: normalized !== save, artifactIds: [] };
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const matches = Object.values(state.artifacts)
    .filter(
      (artifact) =>
        artifact.state === "Carried" && artifact.carrier_intercessor_id === intercessorId,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (matches.length === 0) {
    return { save: normalized, changed: normalized !== save, artifactIds: [] };
  }
  matches.forEach((artifact) => {
    state.artifacts[artifact.id] = transitionArtifact(
      artifact,
      "RecoveredToHub",
      normalized,
      "recovered_to_hub",
      { intercessorId },
    );
  });
  const next = applyArtifactWorldMarkers({
    ...normalized,
    inventory: removeInventoryCounts(
      normalized.inventory,
      matches.map((artifact) => ({ item_id: artifact.item_id, count: artifact.origin.count })),
    ),
    fracture_crawl_campaign: state,
  });
  return { save: next, changed: true, artifactIds: matches.map((artifact) => artifact.id) };
};

const glassProfile = (gamePackage: GamePackage, itemId: string) =>
  gamePackage.items.find((item) => item.id === itemId)?.glass_resource;

const glassLedger = (
  state: FractureCrawlCampaignState,
  gamePackage: GamePackage,
  itemId: string,
): GlassResourceLedgerRecord | undefined => {
  const profile = glassProfile(gamePackage, itemId);
  if (!profile) return undefined;
  const existing = state.glass.resources[itemId];
  return existing
    ? {
        ...existing,
        units_per_item: Math.max(1, existing.units_per_item || profile.units_per_item),
      }
    : {
      item_id: itemId,
      units_per_item: profile.units_per_item,
      units_harvested: 0,
      units_consumed: 0,
      recovery_value_per_unit: profile.recovery_value_per_unit,
      burden_per_unit: profile.burden_per_unit,
      harvest_event_ids: [],
      fuel_event_ids: [],
    };
};

const glassTotals = (
  state: FractureCrawlCampaignState,
  inventory: PlaySave["inventory"],
) => {
  let recoverableValue = 0;
  let burden = 0;
  Object.values(state.glass.resources).forEach((resource) => {
    const units = Math.max(0, resource.units_harvested - resource.units_consumed);
    recoverableValue += units * resource.recovery_value_per_unit;
    const carriedItems = inventory.find((entry) => entry.id === resource.item_id)?.count || 0;
    burden +=
      carriedItems * Math.max(1, resource.units_per_item || 1) * resource.burden_per_unit;
  });
  return { recoverableValue, burden };
};

export const getRecoverableGlassValue = (save: PlaySave): number =>
  save.fracture_crawl_campaign
    ? glassTotals(save.fracture_crawl_campaign, save.inventory).recoverableValue
    : 0;

export const getGlassBurden = (save: PlaySave): number =>
  save.fracture_crawl_campaign
    ? glassTotals(save.fracture_crawl_campaign, save.inventory).burden
    : 0;

export const recordGlassHarvest = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: GlassHarvestOptions,
): GlassHarvestResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const profile = glassProfile(gamePackage, options.itemId);
  if (!profile) {
    const totals = glassTotals(state, normalized.inventory);
    return { save: normalized, changed: normalized !== save, outcome: "not_glass", units: 0, ...totals };
  }
  const itemCount = Math.floor(options.itemCount ?? 1);
  if (itemCount <= 0) {
    const totals = glassTotals(state, normalized.inventory);
    return { save: normalized, changed: normalized !== save, outcome: "invalid_count", units: 0, ...totals };
  }
  const sourceId = options.sourceId || `manual:${options.itemId}:${normalized.clock_minutes ?? 0}`;
  const expeditionId =
    normalized.world_state_layers?.expedition.id ||
    normalized.dialogue_memory?.current_expedition_id ||
    "expedition:legacy";
  const eventId = options.eventId || `glass-harvest:${expeditionId}:${sourceId}`;
  if (state.glass.harvest_events[eventId]) {
    const totals = glassTotals(state, normalized.inventory);
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "already_recorded",
      eventId,
      units: state.glass.harvest_events[eventId].units,
      ...totals,
    };
  }
  const units = itemCount * profile.units_per_item;
  const ledger = glassLedger(state, gamePackage, options.itemId)!;
  state.glass.harvest_events[eventId] = {
    id: eventId,
    item_id: options.itemId,
    source_id: sourceId,
    item_count: itemCount,
    units,
    clock_minutes: normalized.clock_minutes ?? 0,
  };
  state.glass.resources[options.itemId] = {
    ...ledger,
    units_harvested: ledger.units_harvested + units,
    harvest_event_ids: [...ledger.harvest_event_ids, eventId],
  };
  const next = { ...normalized, fracture_crawl_campaign: state };
  return {
    save: next,
    changed: true,
    outcome: "recorded",
    eventId,
    units,
    ...glassTotals(state, next.inventory),
  };
};

const removeInventoryItem = (
  inventory: PlaySave["inventory"],
  itemId: string,
  count: number,
): PlaySave["inventory"] => {
  let remaining = Math.max(0, count);
  return inventory.flatMap((entry) => {
    if (entry.id !== itemId || remaining <= 0) return [{ ...entry }];
    const removed = Math.min(entry.count, remaining);
    remaining -= removed;
    const nextCount = entry.count - removed;
    return nextCount > 0 ? [{ ...entry, count: nextCount }] : [];
  });
};

export const consumeGlassFuel = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: GlassFuelOptions,
): GlassFuelConsumptionResult => {
  const normalized = normalizeFractureCrawlCampaign(gamePackage, save);
  const state = cloneCampaignState(normalized.fracture_crawl_campaign);
  const lightItem = gamePackage.items.find((item) => item.id === options.lightItemId);
  const fuel = lightItem?.glass_fuel;
  if (!lightItem?.light_source || !fuel) {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "not_glass_fueled",
      itemCountConsumed: 0,
      unitsConsumed: 0,
      ...glassTotals(state, normalized.inventory),
    };
  }
  const resourceItemId = options.resourceItemId || fuel.resource_item_id;
  const profile = glassProfile(gamePackage, resourceItemId);
  const ledger = glassLedger(state, gamePackage, resourceItemId);
  if (!profile || !ledger) {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "invalid_resource",
      resourceItemId,
      itemCountConsumed: 0,
      unitsConsumed: 0,
      ...glassTotals(state, normalized.inventory),
    };
  }
  const requestedUnits = Math.max(1, Math.floor(options.units ?? fuel.units_per_ignition));
  const itemCountConsumed = Math.ceil(requestedUnits / profile.units_per_item);
  const unitsConsumed = itemCountConsumed * profile.units_per_item;
  const currentTick = Math.max(
    0,
    Math.floor(options.currentTick ?? normalized.immersive_scheduler?.tick ?? 0),
  );
  const sourceId = options.sourceId || `item:${options.lightItemId}`;
  const eventId = options.eventId || `glass-fuel:${sourceId}:${currentTick}`;
  const existing = state.glass.fuel_events[eventId];
  if (existing) {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "already_consumed",
      eventId,
      resourceItemId,
      itemCountConsumed: existing.item_count_consumed,
      unitsConsumed: existing.units_consumed,
      expiresAtTick: existing.expires_at_tick,
      ...glassTotals(state, normalized.inventory),
    };
  }
  const lightKey = `item:${options.lightItemId}`;
  const lightStates = asRecord(normalized.flags?.immersive_light_states) || {};
  const lightExpiries = asRecord(normalized.flags?.immersive_light_expires_at) || {};
  const currentExpiry = Number(lightExpiries[lightKey]);
  if (
    lightStates[lightKey] === true &&
    (!Number.isFinite(currentExpiry) || currentExpiry > currentTick)
  ) {
    const activeEvent = Object.values(state.glass.fuel_events)
      .filter(
        (event) =>
          event.light_item_id === options.lightItemId && event.expires_at_tick > currentTick,
      )
      .sort(
        (left, right) =>
          right.started_at_tick - left.started_at_tick || right.id.localeCompare(left.id),
      )[0];
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "already_consumed",
      eventId: activeEvent?.id,
      resourceItemId,
      itemCountConsumed: activeEvent?.item_count_consumed || 0,
      unitsConsumed: activeEvent?.units_consumed || 0,
      expiresAtTick: Number.isFinite(currentExpiry)
        ? currentExpiry
        : activeEvent?.expires_at_tick,
      ...glassTotals(state, normalized.inventory),
    };
  }
  const inventoryCount = normalized.inventory.find((entry) => entry.id === resourceItemId)?.count || 0;
  if (inventoryCount < itemCountConsumed) {
    return {
      save: normalized,
      changed: normalized !== save,
      outcome: "insufficient_glass",
      resourceItemId,
      itemCountConsumed: 0,
      unitsConsumed: 0,
      ...glassTotals(state, normalized.inventory),
    };
  }
  const durationTicks = Math.max(
    1,
    Math.floor(options.durationTicks ?? fuel.duration_ticks),
  );
  const expiresAtTick = currentTick + durationTicks;
  state.glass.fuel_events[eventId] = {
    id: eventId,
    light_item_id: options.lightItemId,
    resource_item_id: resourceItemId,
    item_count_consumed: itemCountConsumed,
    units_consumed: unitsConsumed,
    started_at_tick: currentTick,
    expires_at_tick: expiresAtTick,
    clock_minutes: normalized.clock_minutes ?? 0,
  };
  state.glass.resources[resourceItemId] = {
    ...ledger,
    units_consumed: ledger.units_consumed + unitsConsumed,
    fuel_event_ids: [...ledger.fuel_event_ids, eventId],
  };
  const next: PlaySave = {
    ...normalized,
    inventory: removeInventoryItem(normalized.inventory, resourceItemId, itemCountConsumed),
    flags: {
      ...(normalized.flags || {}),
      immersive_light_states: {
        ...lightStates,
        [lightKey]: true,
      },
      immersive_light_expires_at: {
        ...lightExpiries,
        [lightKey]: expiresAtTick,
      },
    },
    fracture_crawl_campaign: state,
  };
  return {
    save: next,
    changed: true,
    outcome: "ignited",
    eventId,
    resourceItemId,
    itemCountConsumed,
    unitsConsumed,
    expiresAtTick,
    ...glassTotals(state, next.inventory),
  };
};

export const getPersistentGhosts = (save: PlaySave): PersistentGhostRecord[] => {
  const state = save.fracture_crawl_campaign;
  if (!state) return [];
  const ordered = state.ghost_order
    .map((id) => state.ghosts[id])
    .filter((ghost): ghost is PersistentGhostRecord => Boolean(ghost));
  const seen = new Set(ordered.map((ghost) => ghost.id));
  return [
    ...ordered,
    ...Object.values(state.ghosts)
      .filter((ghost) => !seen.has(ghost.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ];
};

export const getDeathBundles = (save: PlaySave): DeathBundleRecord[] => {
  const state = save.fracture_crawl_campaign;
  if (!state) return [];
  const ordered = state.death_bundle_order
    .map((id) => state.death_bundles[id])
    .filter((bundle): bundle is DeathBundleRecord => Boolean(bundle));
  const seen = new Set(ordered.map((bundle) => bundle.id));
  return [
    ...ordered,
    ...Object.values(state.death_bundles)
      .filter((bundle) => !seen.has(bundle.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ];
};

export const getArtifactRecords = (save: PlaySave): ArtifactCampaignRecord[] => {
  const state = save.fracture_crawl_campaign;
  if (!state) return [];
  const ordered = state.artifact_order
    .map((id) => state.artifacts[id])
    .filter((artifact): artifact is ArtifactCampaignRecord => Boolean(artifact));
  const seen = new Set(ordered.map((artifact) => artifact.id));
  return [
    ...ordered,
    ...Object.values(state.artifacts)
      .filter((artifact) => !seen.has(artifact.id))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ];
};
