import {
  EncounterDefinitionSchema,
  EntityPlacementSchema,
  MapDataSchema,
  type CellData,
  type EncounterDefinition,
  type EncounterSlot,
  type EnvironmentPreference,
  type EntityPlacementData,
  type MapData,
} from "../schema/game";
import { DeterministicIdAllocator } from "./deterministicIds";
import { stableContentHash } from "./stableHash";

export type EncounterCell = readonly [number, number];

/**
 * The resolver only needs the stable entity ID and whether the current runtime
 * can execute authored schedules for that actor. `EntityData` records are
 * structurally compatible with this interface.
 */
export interface EncounterActorReference {
  id: string;
  is_npc?: boolean;
  isNpc?: boolean;
}

/** Extra collision geometry supplied by a caller that knows object footprints. */
export interface EncounterBlockedFootprint {
  id: string;
  cells: readonly EncounterCell[];
}

export interface EncounterPlacementInput {
  encounter: EncounterDefinition;
  map: MapData;
  /** A room/area candidate pool expressed in ordinary authored map cells. */
  eligibleCells: readonly EncounterCell[];
  entities: readonly EncounterActorReference[];
  seed: string;
  /** Distinguishes multiple placements of one encounter definition on a map. */
  instanceId?: string;
  /** Rejects encounters whose authored difficulty exceeds the caller's budget. */
  difficultyBudget?: number;
  /** Optional entry/player approach used for reachability, facing, and roles. */
  approachCell?: EncounterCell;
  /** Full footprints not represented by the map's anchor-only placement data. */
  blockedFootprints?: readonly EncounterBlockedFootprint[];
  /** Hazard cells are excluded unless explicitly preferred, unless this is true. */
  allowHazards?: boolean;
}

export type EncounterPlacementIssueCode =
  | "ENCOUNTER_SCHEMA_INVALID"
  | "ENCOUNTER_MAP_SCHEMA_INVALID"
  | "ENCOUNTER_AREA_TOO_SMALL"
  | "ENCOUNTER_AREA_TOO_LARGE"
  | "ENCOUNTER_DIFFICULTY_BUDGET_EXCEEDED"
  | "ENCOUNTER_ENTITY_REFERENCE_MISSING"
  | "ENCOUNTER_ELIGIBLE_CELL_DUPLICATE"
  | "ENCOUNTER_CELL_COORDINATE_INVALID"
  | "ENCOUNTER_CELL_OUT_OF_BOUNDS"
  | "ENCOUNTER_MAP_CELL_AMBIGUOUS"
  | "ENCOUNTER_CELL_NOT_WALKABLE"
  | "ENCOUNTER_CELL_BLOCKED"
  | "ENCOUNTER_BLOCKER_CELL_OUT_OF_BOUNDS"
  | "ENCOUNTER_BLOCKER_FOOTPRINT_DUPLICATE"
  | "ENCOUNTER_APPROACH_INVALID"
  | "ENCOUNTER_CELL_UNREACHABLE"
  | "ENCOUNTER_REQUIRED_ENVIRONMENT_UNAVAILABLE"
  | "ENCOUNTER_PLACEMENT_RULE_UNSUPPORTED"
  | "ENCOUNTER_CAPACITY_INSUFFICIENT"
  | "ENCOUNTER_PATROL_ROUTE_UNAVAILABLE"
  | "ENCOUNTER_ID_COLLISION"
  | "ENCOUNTER_OUTPUT_SCHEMA_INVALID";

export interface EncounterPlacementIssue {
  code: EncounterPlacementIssueCode;
  path: string;
  message: string;
  cells?: [number, number][];
}

export type EncounterPlacementNoticeCode =
  | "ENCOUNTER_REINFORCEMENTS_DEFERRED"
  | "ENCOUNTER_PATROL_RUNTIME_UNSUPPORTED";

export interface EncounterPlacementNotice {
  code: EncounterPlacementNoticeCode;
  path: string;
  message: string;
}

export class EncounterPlacementError extends Error {
  readonly issues: EncounterPlacementIssue[];

  constructor(issues: EncounterPlacementIssue[]) {
    super(`Encounter placement failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
    this.name = "EncounterPlacementError";
    this.issues = issues;
  }
}

export interface EncounterResolvedSlot {
  slotIndex: number;
  entityId: string;
  count: number;
}

export interface EncounterPlacementResult {
  encounterId: string;
  instanceId: string;
  placements: EntityPlacementData[];
  resolvedSlots: EncounterResolvedSlot[];
  notices: EncounterPlacementNotice[];
  /** Replay fingerprint over the ordinary placements and their stable inputs. */
  outputHash: string;
}

interface CandidateCell {
  cell: [number, number];
  authored: CellData;
  cover: boolean;
  hazard?: string;
  elevation: number;
}

const SUPPORTED_PLACEMENT_RULES = new Set([
  "random",
  "near_approach",
  "far_from_approach",
  "cover",
  "open",
  "avoid_hazards",
  "frontline",
  "ranged",
  "support",
  "ambush",
  "patrol",
]);

const CARDINAL_DIRECTIONS: readonly EncounterCell[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const coordinateKey = (cell: EncounterCell): string => `${cell[0]},${cell[1]}`;
const cloneCell = (cell: EncounterCell): [number, number] => [cell[0], cell[1]];
const compareCells = (left: EncounterCell, right: EncounterCell): number =>
  left[1] - right[1] || left[0] - right[0];

const placementRuleToken = (rule: string | undefined): string | undefined =>
  rule?.trim().toLowerCase().replace(/[\s-]+/g, "_");

const hashToken = (value: unknown): string => stableContentHash(value).slice("fnv1a64:".length);

const schemaIssues = (
  kind: "encounter" | "map",
  issues: readonly { path: PropertyKey[]; message: string }[],
): EncounterPlacementIssue[] =>
  issues.map((issue) => ({
    code: kind === "encounter" ? "ENCOUNTER_SCHEMA_INVALID" : "ENCOUNTER_MAP_SCHEMA_INVALID",
    path: `${kind}.${issue.path.map(String).join(".")}`,
    message: issue.message,
  }));

const buildProjectedCellIndex = (map: MapData): Map<string, CellData[]> => {
  const result = new Map<string, CellData[]>();
  for (const cell of map.cells) {
    const key = coordinateKey([cell.x, cell.z]);
    const entries = result.get(key) ?? [];
    entries.push(cell);
    result.set(key, entries);
  }
  return result;
};

const hazardForCell = (cell: CellData): string | undefined => {
  if (cell.hazard) return cell.hazard;
  if (cell.infection) return `infection:${cell.infection}`;
  if (["firehazard", "poison", "oil", "ice"].includes(cell.surface_tag)) {
    return cell.surface_tag;
  }
  return undefined;
};

const coverAt = (
  cell: EncounterCell,
  cellIndex: Map<string, CellData[]>,
  objectAnchors: ReadonlySet<string>,
): boolean =>
  CARDINAL_DIRECTIONS.some(([dx, dz]) => {
    const key = coordinateKey([cell[0] + dx, cell[1] + dz]);
    if (objectAnchors.has(key)) return true;
    const neighbors = cellIndex.get(key);
    return !neighbors?.some((neighbor) => neighbor.active && neighbor.walkable && !neighbor.blocks_los);
  });

const preferenceMatches = (
  candidate: CandidateCell,
  preference: EnvironmentPreference,
  elevations: readonly number[],
): boolean => {
  const desired = preference.value.trim().toLowerCase();
  switch (preference.kind) {
    case "terrain":
      return (candidate.authored.terrain ?? "").toLowerCase() === desired;
    case "surface":
      return candidate.authored.surface_tag.toLowerCase() === desired;
    case "hazard": {
      if (["none", "safe", "false"].includes(desired)) return !candidate.hazard;
      if (["any", "hazard", "true"].includes(desired)) return Boolean(candidate.hazard);
      return candidate.hazard?.toLowerCase() === desired;
    }
    case "cover":
      return ["none", "open", "false"].includes(desired) ? !candidate.cover : candidate.cover;
    case "elevation": {
      const numeric = Number(preference.value);
      if (Number.isFinite(numeric)) return candidate.elevation === numeric;
      const sorted = [...elevations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      if (["high", "upper", "above"].includes(desired)) return candidate.elevation > median;
      if (["low", "lower", "below"].includes(desired)) return candidate.elevation < median;
      if (["level", "middle", "median"].includes(desired)) return candidate.elevation === median;
      return false;
    }
    case "room_tag": {
      const roomTag = (preference.roomTag ?? preference.value).toLowerCase();
      return candidate.authored.room_id?.toLowerCase() === roomTag ||
        candidate.authored.tag?.toLowerCase() === roomTag;
    }
  }
};

const lineOfSight = (
  from: EncounterCell,
  to: EncounterCell,
  cellIndex: Map<string, CellData[]>,
): boolean => {
  let x = from[0];
  let z = from[1];
  const dx = Math.abs(to[0] - x);
  const dz = Math.abs(to[1] - z);
  const sx = x < to[0] ? 1 : -1;
  const sz = z < to[1] ? 1 : -1;
  let error = dx - dz;

  while (x !== to[0] || z !== to[1]) {
    const twice = error * 2;
    if (twice > -dz) {
      error -= dz;
      x += sx;
    }
    if (twice < dx) {
      error += dx;
      z += sz;
    }
    if (x === to[0] && z === to[1]) return true;
    const entries = cellIndex.get(coordinateKey([x, z]));
    if (!entries?.some((entry) => entry.active && !entry.blocks_los)) return false;
  }
  return true;
};

const navigationReachable = (
  origin: EncounterCell,
  cellIndex: Map<string, CellData[]>,
): Set<string> => {
  const reached = new Set<string>();
  const queue: [number, number][] = [cloneCell(origin)];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const key = coordinateKey(current);
    if (reached.has(key)) continue;
    const cells = cellIndex.get(key);
    if (!cells?.some((cell) => cell.active && cell.walkable)) continue;
    reached.add(key);
    for (const [dx, dz] of CARDINAL_DIRECTIONS) {
      const next: [number, number] = [current[0] + dx, current[1] + dz];
      if (!reached.has(coordinateKey(next))) queue.push(next);
    }
  }
  return reached;
};

const actorFacing = (
  cell: EncounterCell,
  target: readonly [number, number],
  seedKey: unknown,
): [number, number] => {
  const dx = target[0] - cell[0];
  const dz = target[1] - cell[1];
  if (Math.abs(dx) > Math.abs(dz)) return [Math.sign(dx), 0];
  if (Math.abs(dz) > 0) return [0, Math.sign(dz)];
  return cloneCell(CARDINAL_DIRECTIONS[Number.parseInt(hashToken(seedKey).slice(-2), 16) % 4]);
};

const roleForSlot = (slot: EncounterSlot): string | undefined =>
  slot.role ?? placementRuleToken(slot.placementRule);

const candidateScore = (
  candidate: CandidateCell,
  slot: EncounterSlot,
  encounter: EncounterDefinition,
  approachCell: EncounterCell | undefined,
  cellIndex: Map<string, CellData[]>,
  elevations: readonly number[],
): number => {
  let score = 0;
  for (const preference of encounter.environmentalPreferences ?? []) {
    if (preferenceMatches(candidate, preference, elevations)) score += preference.weight * 100;
  }

  const role = roleForSlot(slot);
  const distance = approachCell
    ? Math.abs(candidate.cell[0] - approachCell[0]) + Math.abs(candidate.cell[1] - approachCell[1])
    : 0;
  if (role === "frontline" || role === "near_approach") score -= distance * 4;
  if (role === "ranged" || role === "far_from_approach") score += distance * 4;
  if (role === "support") score += distance * 2 + (candidate.cover ? 18 : 0);
  if (role === "cover") score += candidate.cover ? 30 : -30;
  if (role === "open") score += candidate.cover ? -30 : 30;
  if (role === "ambush") {
    score += candidate.cover ? 35 : 0;
    if (approachCell && !lineOfSight(approachCell, candidate.cell, cellIndex)) score += 70;
  }
  if (role === "patrol") score += candidate.cover ? -4 : 4;
  if (candidate.hazard) score -= 50;
  return score;
};

const resolveCounts = (
  encounter: EncounterDefinition,
  seed: string,
  instanceId: string,
  capacity: number,
): number[] => {
  const counts = encounter.slots.map((slot, slotIndex) => {
    const range = slot.maxCount - slot.minCount + 1;
    if (range <= 1) return slot.minCount;
    const hash = Number.parseInt(hashToken({ seed, instanceId, encounterId: encounter.id, slotIndex }).slice(-8), 16);
    return slot.minCount + (hash % range);
  });

  let overflow = counts.reduce((sum, count) => sum + count, 0) - capacity;
  if (overflow <= 0) return counts;
  const reductionOrder = encounter.slots
    .map((slot, slotIndex) => ({
      slotIndex,
      order: hashToken({ seed, instanceId, encounterId: encounter.id, reduce: slotIndex, entityId: slot.entityId }),
    }))
    .sort((left, right) => left.order.localeCompare(right.order));
  for (const { slotIndex } of reductionOrder) {
    const reducible = counts[slotIndex] - encounter.slots[slotIndex].minCount;
    const reduction = Math.min(reducible, overflow);
    counts[slotIndex] -= reduction;
    overflow -= reduction;
    if (overflow === 0) break;
  }
  return counts;
};

const reservedMapIds = (map: MapData): string[] => [
  ...map.spawns.map((entry) => entry.id),
  ...map.custom_object_placements.flatMap((entry) => entry.id ? [entry.id] : []),
  ...map.entity_placements.flatMap((entry) => entry.id ? [entry.id] : []),
  ...map.item_placements.map((entry) => entry.id),
  ...map.container_placements.map((entry) => entry.id),
  ...map.triggers.map((entry) => entry.id),
  ...map.exits.flatMap((entry) => entry.id ? [entry.id] : []),
  ...(map.regions?.map((entry) => entry.id) ?? []),
];

/**
 * Purely resolves an encounter into ordinary EntityPlacementData. No runtime
 * encounter subtype is created; once these records are baked into a map, the
 * normal entity/combat/save pipelines own them.
 */
export const resolveEncounter = (input: EncounterPlacementInput): EncounterPlacementResult => {
  const parsedEncounter = EncounterDefinitionSchema.safeParse(input.encounter);
  if (!parsedEncounter.success) {
    throw new EncounterPlacementError(schemaIssues("encounter", parsedEncounter.error.issues));
  }
  const parsedMap = MapDataSchema.safeParse(input.map);
  if (!parsedMap.success) {
    throw new EncounterPlacementError(schemaIssues("map", parsedMap.error.issues));
  }

  const encounter = parsedEncounter.data;
  const map = parsedMap.data;
  const instanceId = input.instanceId?.trim() || encounter.id;
  const issues: EncounterPlacementIssue[] = [];
  const notices: EncounterPlacementNotice[] = [];
  const cellIndex = buildProjectedCellIndex(map);
  const entityById = new Map(input.entities.map((entity) => [entity.id, entity]));

  if (input.eligibleCells.length < encounter.minArea) {
    issues.push({
      code: "ENCOUNTER_AREA_TOO_SMALL",
      path: "eligibleCells",
      message: `Encounter ${encounter.id} requires area ${encounter.minArea}, received ${input.eligibleCells.length}`,
    });
  }
  if (encounter.maxArea !== undefined && input.eligibleCells.length > encounter.maxArea) {
    issues.push({
      code: "ENCOUNTER_AREA_TOO_LARGE",
      path: "eligibleCells",
      message: `Encounter ${encounter.id} allows area ${encounter.maxArea}, received ${input.eligibleCells.length}`,
    });
  }
  if (input.difficultyBudget !== undefined && encounter.difficulty > input.difficultyBudget) {
    issues.push({
      code: "ENCOUNTER_DIFFICULTY_BUDGET_EXCEEDED",
      path: "difficultyBudget",
      message: `Encounter difficulty ${encounter.difficulty} exceeds budget ${input.difficultyBudget}`,
    });
  }

  [...encounter.slots, ...(encounter.reinforcementSlots ?? [])].forEach((slot, slotIndex) => {
    if (!entityById.has(slot.entityId)) {
      issues.push({
        code: "ENCOUNTER_ENTITY_REFERENCE_MISSING",
        path: slotIndex < encounter.slots.length
          ? `encounter.slots[${slotIndex}].entityId`
          : `encounter.reinforcementSlots[${slotIndex - encounter.slots.length}].entityId`,
        message: `Encounter references missing entity ${slot.entityId}`,
      });
    }
    const rule = placementRuleToken(slot.placementRule);
    if (rule && !SUPPORTED_PLACEMENT_RULES.has(rule)) {
      issues.push({
        code: "ENCOUNTER_PLACEMENT_RULE_UNSUPPORTED",
        path: slotIndex < encounter.slots.length
          ? `encounter.slots[${slotIndex}].placementRule`
          : `encounter.reinforcementSlots[${slotIndex - encounter.slots.length}].placementRule`,
        message: `Unsupported encounter placement rule: ${slot.placementRule}`,
      });
    }
  });

  if (encounter.reinforcementSlots?.length) {
    notices.push({
      code: "ENCOUNTER_REINFORCEMENTS_DEFERRED",
      path: "encounter.reinforcementSlots",
      message: "Reinforcement wave scripting is deferred; reinforcement slots were validated but not materialized.",
    });
  }

  const objectAnchors = new Set<string>();
  const blockedOwners = new Map<string, string>();
  const registerBlocker = (id: string, cells: readonly EncounterCell[], path: string) => {
    const local = new Set<string>();
    cells.forEach((cell, cellIndexInFootprint) => {
      const key = coordinateKey(cell);
      if (!cellIndex.has(key)) {
        issues.push({
          code: "ENCOUNTER_BLOCKER_CELL_OUT_OF_BOUNDS",
          path: `${path}.cells[${cellIndexInFootprint}]`,
          message: `Blocked footprint ${id} references a cell outside map ${map.id}`,
          cells: [cloneCell(cell)],
        });
      }
      const firstOwner = local.has(key) ? id : blockedOwners.get(key);
      if (firstOwner) {
        issues.push({
          code: "ENCOUNTER_BLOCKER_FOOTPRINT_DUPLICATE",
          path: `${path}.cells[${cellIndexInFootprint}]`,
          message: `Blocked footprint ${id} overlaps ${firstOwner} at ${key}`,
          cells: [cloneCell(cell)],
        });
      }
      local.add(key);
      blockedOwners.set(key, id);
    });
  };

  map.custom_object_placements.forEach((placement, index) => {
    if (placement.collision_mode === "none") return;
    const cell: [number, number] = [placement.cell[0], placement.cell[1]];
    objectAnchors.add(coordinateKey(cell));
    registerBlocker(placement.id ?? `object:${placement.object_id}@${index}`, [cell], `map.custom_object_placements[${index}]`);
  });
  map.container_placements.forEach((placement, index) => {
    const cell: [number, number] = [placement.cell[0], placement.cell[1]];
    objectAnchors.add(coordinateKey(cell));
    registerBlocker(placement.id, [cell], `map.container_placements[${index}]`);
  });
  map.entity_placements.forEach((placement, index) => {
    const cell: [number, number] = [placement.cell[0], placement.cell[1]];
    registerBlocker(placement.id ?? `entity:${placement.entity_id}@${index}`, [cell], `map.entity_placements[${index}]`);
  });
  input.blockedFootprints?.forEach((footprint, index) => {
    registerBlocker(footprint.id, footprint.cells, `blockedFootprints[${index}]`);
  });

  const eligibleKeys = new Set<string>();
  const candidates: CandidateCell[] = [];
  input.eligibleCells.forEach((rawCell, index) => {
    const cell = cloneCell(rawCell);
    const path = `eligibleCells[${index}]`;
    if (!cell.every(Number.isFinite) || !cell.every(Number.isInteger)) {
      issues.push({
        code: "ENCOUNTER_CELL_COORDINATE_INVALID",
        path,
        message: "Encounter cells must use finite integer ordinary-map coordinates",
        cells: [cell],
      });
      return;
    }
    const key = coordinateKey(cell);
    if (eligibleKeys.has(key)) {
      issues.push({
        code: "ENCOUNTER_ELIGIBLE_CELL_DUPLICATE",
        path,
        message: `Eligible cell ${key} was supplied more than once`,
        cells: [cell],
      });
      return;
    }
    eligibleKeys.add(key);
    const authored = cellIndex.get(key);
    if (!authored?.length) {
      issues.push({
        code: "ENCOUNTER_CELL_OUT_OF_BOUNDS",
        path,
        message: `Eligible cell ${key} is not present in map ${map.id}`,
        cells: [cell],
      });
      return;
    }
    if (authored.length !== 1) {
      issues.push({
        code: "ENCOUNTER_MAP_CELL_AMBIGUOUS",
        path,
        message: `Map ${map.id} has ${authored.length} authored cells projected at ${key}`,
        cells: [cell],
      });
      return;
    }
    if (!authored[0].active || !authored[0].walkable) {
      issues.push({
        code: "ENCOUNTER_CELL_NOT_WALKABLE",
        path,
        message: `Eligible cell ${key} is inactive or not walkable`,
        cells: [cell],
      });
      return;
    }
    const blocker = blockedOwners.get(key);
    if (blocker) {
      issues.push({
        code: "ENCOUNTER_CELL_BLOCKED",
        path,
        message: `Eligible cell ${key} overlaps blocked footprint ${blocker}`,
        cells: [cell],
      });
      return;
    }
    candidates.push({
      cell,
      authored: authored[0],
      cover: coverAt(cell, cellIndex, objectAnchors),
      hazard: hazardForCell(authored[0]),
      elevation: authored[0].visual_height ?? authored[0].height ?? authored[0].y,
    });
  });

  let approach: [number, number] | undefined;
  if (input.approachCell) {
    approach = cloneCell(input.approachCell);
    const authored = cellIndex.get(coordinateKey(approach));
    if (!approach.every(Number.isFinite) || !approach.every(Number.isInteger) ||
        !authored?.some((cell) => cell.active && cell.walkable)) {
      issues.push({
        code: "ENCOUNTER_APPROACH_INVALID",
        path: "approachCell",
        message: "Encounter approach must be a finite, in-bounds, walkable ordinary-map cell",
        cells: [approach],
      });
    }
  }

  if (candidates.length && (approach || candidates[0])) {
    const origin = approach ?? candidates.slice().sort((a, b) => compareCells(a.cell, b.cell))[0].cell;
    const reachable = navigationReachable(origin, cellIndex);
    candidates.forEach((candidate, index) => {
      if (!reachable.has(coordinateKey(candidate.cell))) {
        issues.push({
          code: "ENCOUNTER_CELL_UNREACHABLE",
          path: `eligibleCells[${index}]`,
          message: `Eligible cell ${coordinateKey(candidate.cell)} is outside the encounter's walkable navigation component`,
          cells: [candidate.cell],
        });
      }
    });
  }

  const elevations = candidates.map((candidate) => candidate.elevation);
  const requiredPreferences = (encounter.environmentalPreferences ?? [])
    .map((preference, preferenceIndex) => ({ preference, preferenceIndex }))
    .filter(({ preference }) => preference.required);
  const hazardPreference = encounter.environmentalPreferences?.some((preference) => preference.kind === "hazard");
  const placementCandidates = candidates.filter((candidate) =>
    (!approach || coordinateKey(candidate.cell) !== coordinateKey(approach)) &&
    (input.allowHazards || hazardPreference || !candidate.hazard) &&
    requiredPreferences.every(({ preference }) => preferenceMatches(candidate, preference, elevations)),
  );
  requiredPreferences.forEach(({ preference, preferenceIndex }) => {
    if (!candidates.some((candidate) => preferenceMatches(candidate, preference, elevations))) {
      issues.push({
        code: "ENCOUNTER_REQUIRED_ENVIRONMENT_UNAVAILABLE",
        path: `encounter.environmentalPreferences[${preferenceIndex}]`,
        message: `No eligible cell satisfies required ${preference.kind}=${preference.value}`,
      });
    }
  });

  const minimumCount = encounter.slots.reduce((sum, slot) => sum + slot.minCount, 0);
  if (placementCandidates.length < minimumCount) {
    issues.push({
      code: "ENCOUNTER_CAPACITY_INSUFFICIENT",
      path: "eligibleCells",
      message: `Encounter requires at least ${minimumCount} actor footprints but only ${placementCandidates.length} valid cells remain`,
    });
  }

  if (issues.length) throw new EncounterPlacementError(issues);

  const counts = resolveCounts(encounter, input.seed, instanceId, placementCandidates.length);
  const available = new Map(placementCandidates.map((candidate) => [coordinateKey(candidate.cell), candidate]));
  const allocator = new DeterministicIdAllocator({ mapId: map.id, reservedIds: reservedMapIds(map) });
  const placements: EntityPlacementData[] = [];
  const centroid: [number, number] = approach ?? [
    placementCandidates.reduce((sum, candidate) => sum + candidate.cell[0], 0) / Math.max(1, placementCandidates.length),
    placementCandidates.reduce((sum, candidate) => sum + candidate.cell[1], 0) / Math.max(1, placementCandidates.length),
  ];

  encounter.slots.forEach((slot, slotIndex) => {
    for (let memberIndex = 0; memberIndex < counts[slotIndex]; memberIndex += 1) {
      const ranked = [...available.values()].sort((left, right) => {
        const scoreDelta = candidateScore(right, slot, encounter, approach, cellIndex, elevations) -
          candidateScore(left, slot, encounter, approach, cellIndex, elevations);
        if (scoreDelta !== 0) return scoreDelta;
        const leftHash = hashToken({ seed: input.seed, instanceId, encounterId: encounter.id, slotIndex, memberIndex, cell: left.cell });
        const rightHash = hashToken({ seed: input.seed, instanceId, encounterId: encounter.id, slotIndex, memberIndex, cell: right.cell });
        return leftHash.localeCompare(rightHash) || compareCells(left.cell, right.cell);
      });
      const selected = ranked[0];
      if (!selected) {
        throw new EncounterPlacementError([{
          code: "ENCOUNTER_CAPACITY_INSUFFICIENT",
          path: `encounter.slots[${slotIndex}]`,
          message: "Encounter placement exhausted its validated candidate pool",
        }]);
      }
      available.delete(coordinateKey(selected.cell));
      let id: string;
      try {
        const semantic = `${instanceId}-slot-${String(slotIndex).padStart(2, "0")}-${slot.entityId}-member-${String(memberIndex).padStart(2, "0")}-${hashToken({ instanceId, encounterId: encounter.id, slotIndex, memberIndex, entityId: slot.entityId }).slice(0, 8)}`;
        id = allocator.semantic("entity", semantic);
      } catch (error) {
        throw new EncounterPlacementError([{
          code: "ENCOUNTER_ID_COLLISION",
          path: `encounter.slots[${slotIndex}]`,
          message: error instanceof Error ? error.message : "Encounter entity ID collision",
        }]);
      }

      const placement: EntityPlacementData = {
        id,
        entity_id: slot.entityId,
        cell: cloneCell(selected.cell),
        facing: actorFacing(selected.cell, centroid, { input: input.seed, id }),
      };
      const role = roleForSlot(slot);
      if (role === "patrol") {
        const actor = entityById.get(slot.entityId);
        if (actor?.is_npc || actor?.isNpc) {
          const waypoint = placementCandidates
            .filter((candidate) => coordinateKey(candidate.cell) !== coordinateKey(selected.cell))
            .sort((left, right) => {
              const leftDistance = Math.abs(left.cell[0] - selected.cell[0]) + Math.abs(left.cell[1] - selected.cell[1]);
              const rightDistance = Math.abs(right.cell[0] - selected.cell[0]) + Math.abs(right.cell[1] - selected.cell[1]);
              return rightDistance - leftDistance || compareCells(left.cell, right.cell);
            })[0];
          if (!waypoint) {
            throw new EncounterPlacementError([{
              code: "ENCOUNTER_PATROL_ROUTE_UNAVAILABLE",
              path: `encounter.slots[${slotIndex}]`,
              message: "Patrol placement requires at least two distinct navigable cells",
              cells: [selected.cell],
            }]);
          }
          placement.schedule = [
            { hour: 0, cell: cloneCell(selected.cell) },
            { hour: 12, cell: cloneCell(waypoint.cell) },
          ];
        } else if (!notices.some((notice) =>
          notice.code === "ENCOUNTER_PATROL_RUNTIME_UNSUPPORTED" && notice.path === `encounter.slots[${slotIndex}]`)) {
          notices.push({
            code: "ENCOUNTER_PATROL_RUNTIME_UNSUPPORTED",
            path: `encounter.slots[${slotIndex}]`,
            message: `Entity ${slot.entityId} is not schedule-capable; its patrol role was resolved as an ordinary placement.`,
          });
        }
      }
      const parsedPlacement = EntityPlacementSchema.safeParse(placement);
      if (!parsedPlacement.success) {
        throw new EncounterPlacementError(schemaIssues("encounter", parsedPlacement.error.issues).map((issue) => ({
          ...issue,
          code: "ENCOUNTER_OUTPUT_SCHEMA_INVALID",
          path: `placements[${placements.length}].${issue.path}`,
        })));
      }
      placements.push(parsedPlacement.data);
    }
  });

  placements.sort((left, right) => (left.id ?? "").localeCompare(right.id ?? ""));
  const resolvedSlots = encounter.slots.map((slot, slotIndex) => ({
    slotIndex,
    entityId: slot.entityId,
    count: counts[slotIndex],
  }));
  const outputHash = stableContentHash({
    mapId: map.id,
    encounterId: encounter.id,
    instanceId,
    seed: input.seed,
    placements,
  });
  return { encounterId: encounter.id, instanceId, placements, resolvedSlots, notices, outputHash };
};

/** Convenience form for map builders that only need ordinary placements. */
export const resolveEncounterPlacements = (input: EncounterPlacementInput): EntityPlacementData[] =>
  resolveEncounter(input).placements;
